import { Router, type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import { loadEnv, requireFeatureEnv } from '../config/env.js';
import { getServiceClient } from '../lib/supabase.js';
import { verifyKipkirenPaySignature, verifyPaystackSignature, verifyTodokuSignature } from '../lib/hmac.js';
import { writeAuditEvent } from '../services/audit.js';
import { confirmPayment } from '../services/billing.js';
import { logger } from '../lib/logger.js';

export const webhooksRouter: Router = Router();

/**
 * Common webhook contract:
 *   1. Read the raw body (captured by express.json verify hook in app.ts).
 *   2. Verify HMAC signature against the raw bytes.
 *   3. Reject any payload older than 5 minutes (Paystack - KWS-SEC-006).
 *   4. Compute webhook_payload_hash and reject duplicates.
 *   5. Look up the payment row by gateway_ref + idempotency_key.
 *   6. Verify amount matches the proforma total.
 *   7. INSERT proforma_approvals - the migration-0003 trigger
 *      `trg_proforma_approvals_hash_match` re-verifies the content hash
 *      at the database layer. We do not pass the hash from outside; we
 *      read the dispatched value and write it through.
 *   8. Mark the payment confirmed. Migration-0003 trigger
 *      `trg_payments_immutable` makes the row immutable.
 *   9. Write audit_log: payment_confirmed + scope_locked.
 *  10. Return 200 to the gateway.
 *
 * Any failure at steps 1-6 returns 400 / 401 with no state change.
 *
 * Idempotency: duplicate webhook with the same idempotency_key returns 200
 * silently. The unique index on payments.idempotency_key + the unique
 * constraint on proforma_approvals.idempotency_key are the database-layer
 * backstops. We check first to avoid spurious unique-violation logs.
 */

interface RawBodyRequest extends Request {
  rawBody?: string;
}

interface ConfirmInput {
  gateway: 'mpesa' | 'paystack';
  gateway_ref: string;
  idempotency_key: string;
  amount_kes: number;
  payload_hash: string;
  client_user_sub: string | null;
}

// The confirmation itself (approval insert + scope lock + receipt + notices)
// lives in services/billing.ts so staff-recorded bank transfers share it.
async function recordConfirmedPayment(input: ConfirmInput): Promise<{ ok: boolean; reason?: string }> {
  return confirmPayment({
    gateway: input.gateway,
    gateway_ref: input.gateway_ref,
    idempotency_key: input.idempotency_key,
    amount_kes: input.amount_kes,
    payload_hash: input.payload_hash,
    actor_id: input.client_user_sub,
    actor_role: 'client',
  });
}

// ----------------------------------------------------------------------------
// POST /v1/webhooks/mpesa - Kipkiren Pay (LipaPlus) callback
// ----------------------------------------------------------------------------
const KipkirenPayPayloadSchema = (() => {
  // Inline schema to keep webhooks self-contained. Kipkiren Pay payload
  // shape lives in their internal contract; we accept the minimum we need.
  return {
    parse(o: unknown): {
      gateway_ref: string;
      idempotency_key: string;
      amount_kes: number;
      status: string;
    } {
      const x = o as Record<string, unknown>;
      if (typeof x.gateway_ref !== 'string') throw new Error('missing_gateway_ref');
      if (typeof x.idempotency_key !== 'string') throw new Error('missing_idempotency_key');
      if (typeof x.amount_kes !== 'number') throw new Error('missing_amount_kes');
      if (typeof x.status !== 'string') throw new Error('missing_status');
      return {
        gateway_ref: x.gateway_ref,
        idempotency_key: x.idempotency_key,
        amount_kes: x.amount_kes,
        status: x.status,
      };
    },
  };
})();

webhooksRouter.post('/mpesa', async (req: RawBodyRequest, res: Response) => {
  requireFeatureEnv('kipkiren_pay');
  const env = loadEnv();
  const raw = req.rawBody ?? '';
  const sig = req.header('x-kipkiren-pay-signature') ?? undefined;

  if (!verifyKipkirenPaySignature(raw, sig, env.KIPKIREN_PAY_HMAC_SECRET)) {
    res.status(400).json({ error: 'invalid_signature' });
    return;
  }

  let payload: ReturnType<typeof KipkirenPayPayloadSchema.parse>;
  try {
    payload = KipkirenPayPayloadSchema.parse(req.body);
  } catch {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }

  if (payload.status !== 'success' && payload.status !== 'confirmed') {
    // Non-success callbacks (failed STK, user cancellation) - log + ack.
    res.status(200).json({ ok: true, ignored: payload.status });
    return;
  }

  const payload_hash = createHash('sha256').update(raw, 'utf8').digest('hex');

  // Replay defence - same payload bytes seen before.
  const sb = getServiceClient();
  const { data: replayHit } = await sb
    .from('payments')
    .select('id')
    .eq('webhook_payload_hash', payload_hash)
    .maybeSingle();
  if (replayHit) {
    res.status(200).json({ ok: true, replay: true });
    return;
  }

  const result = await recordConfirmedPayment({
    gateway: 'mpesa',
    gateway_ref: payload.gateway_ref,
    idempotency_key: payload.idempotency_key,
    amount_kes: payload.amount_kes,
    payload_hash,
    client_user_sub: null,
  });

  if (!result.ok) {
    logger.warn({ reason: result.reason, idempotency_key: payload.idempotency_key }, 'mpesa_webhook_rejected');
    res.status(400).json({ error: result.reason });
    return;
  }
  res.status(200).json({ ok: true });
});

// ----------------------------------------------------------------------------
// POST /v1/webhooks/paystack - Paystack callback
// ----------------------------------------------------------------------------
webhooksRouter.post('/paystack', async (req: RawBodyRequest, res: Response) => {
  requireFeatureEnv('paystack');
  const env = loadEnv();
  const raw = req.rawBody ?? '';
  const sig = req.header('x-paystack-signature') ?? undefined;

  if (!verifyPaystackSignature(raw, sig, env.PAYSTACK_SECRET_KEY)) {
    res.status(400).json({ error: 'invalid_signature' });
    return;
  }

  // KWS-SEC-006 - 5-minute timestamp window via Paystack's `data.paid_at`.
  const body = req.body as {
    event?: string;
    data?: {
      reference?: string;
      amount?: number;            // subunits - divide by 100
      paid_at?: string;
      status?: string;
      metadata?: Record<string, unknown>;
    };
  };

  if (body.event !== 'charge.success') {
    res.status(200).json({ ok: true, ignored: body.event ?? 'unknown_event' });
    return;
  }
  if (!body.data?.reference || typeof body.data.amount !== 'number' || !body.data.paid_at) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }
  const paidAtMs = Date.parse(body.data.paid_at);
  if (Number.isNaN(paidAtMs) || Math.abs(Date.now() - paidAtMs) > 5 * 60 * 1000) {
    res.status(400).json({ error: 'webhook_too_old' });
    return;
  }

  const idempotencyKey =
    typeof body.data.metadata?.idempotency_key === 'string'
      ? (body.data.metadata.idempotency_key as string)
      : null;
  if (!idempotencyKey) {
    res.status(400).json({ error: 'missing_idempotency_key_in_metadata' });
    return;
  }

  const payload_hash = createHash('sha256').update(raw, 'utf8').digest('hex');
  const sb = getServiceClient();
  const { data: replayHit } = await sb
    .from('payments')
    .select('id')
    .eq('webhook_payload_hash', payload_hash)
    .maybeSingle();
  if (replayHit) {
    res.status(200).json({ ok: true, replay: true });
    return;
  }

  const result = await recordConfirmedPayment({
    gateway: 'paystack',
    gateway_ref: body.data.reference,
    idempotency_key: idempotencyKey,
    amount_kes: Math.round(body.data.amount / 100),
    payload_hash,
    client_user_sub: null,
  });

  if (!result.ok) {
    logger.warn({ reason: result.reason, ref: body.data.reference }, 'paystack_webhook_rejected');
    res.status(400).json({ error: result.reason });
    return;
  }
  res.status(200).json({ ok: true });
});

// ----------------------------------------------------------------------------
// POST /v1/webhooks/todoku/delivery - Todoku SMS delivery-status acks (S9-003).
// Verifies the base64 HMAC-SHA256 signature, records the outcome to audit_log,
// and acks 200. Delivery acks never touch payment/proforma state.
// ----------------------------------------------------------------------------
webhooksRouter.post('/todoku/delivery', async (req: RawBodyRequest, res: Response) => {
  requireFeatureEnv('todoku');
  const env = loadEnv();
  const raw = req.rawBody ?? '';
  const sig = req.header('x-todoku-signature') ?? undefined;

  if (!verifyTodokuSignature(raw, sig, env.TODOKU_KWS_WEBHOOK_SECRET)) {
    res.status(400).json({ error: 'invalid_signature' });
    return;
  }

  const body = req.body as { message_id?: string; status?: string };
  if (!body.message_id || !body.status) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }

  const delivered = body.status === 'delivered' || body.status === 'success';
  await writeAuditEvent({
    actor_id: null,
    actor_role: null,
    event_type: delivered ? 'todoku_message_sent' : 'todoku_delivery_failed',
    entity_type: 'notification',
    entity_id: body.message_id,
    payload_snapshot: { provider_ref: body.message_id, status: body.status },
  });

  res.status(200).json({ ok: true });
});
