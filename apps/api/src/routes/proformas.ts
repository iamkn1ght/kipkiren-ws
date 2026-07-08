import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { proformaApproveRateLimit } from '../middleware/rate-limit.js';
import { HttpError } from '../middleware/error.js';
import { getServiceClient } from '../lib/supabase.js';
import { dispatchProforma } from '../services/proforma.js';
import { writeAuditEvent } from '../services/audit.js';
import { sendClientSms } from '../services/notifications.js';
import { sendClientEmail } from '../services/email.js';
import { computeContentHash } from '../lib/content-hash.js';
import { logger } from '../lib/logger.js';
import { loadEnv, requireFeatureEnv } from '../config/env.js';
import {
  getKipkirenPayClient,
  getPaystackClient,
  type KipkirenPayClient,
  type PaystackClient,
} from '../services/payments.js';

export const proformasRouter: Router = Router();

// Test seam - overrideable in vitest setup so webhook + approve tests don't
// need real gateway keys.
let kipkirenPayClient: KipkirenPayClient | null = null;
let paystackClient: PaystackClient | null = null;
export function setPaymentClientsForTest(p: { kipkirenPay?: KipkirenPayClient; paystack?: PaystackClient }) {
  kipkirenPayClient = p.kipkirenPay ?? null;
  paystackClient = p.paystack ?? null;
}
function kp(): KipkirenPayClient { return kipkirenPayClient ?? getKipkirenPayClient(); }
function ps(): PaystackClient { return paystackClient ?? getPaystackClient(); }

// ----------------------------------------------------------------------------
// GET /v1/proformas/:id - proforma with line items.
// Client: own proforma only (via ticket → client join).
// Admin/delivery_lead: any proforma.
// ----------------------------------------------------------------------------
proformasRouter.get(
  '/:id',
  requireAuth,
  requireRole('client', 'delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from('proformas')
      .select(
        `id, ref, status, ai_confidence_score, ai_flag_reason,
         subtotal_kes, discount_kes, vat_kes, total_kes,
         content_hash, dispatched_at, created_at,
         tickets ( id, ref, description, urgency, client_id,
           clients ( id, business_name, retainer_plans ( name, task_discount_pct ) )
         ),
         proforma_line_items ( id, task_name, task_description, estimated_hours, rate_kes_per_hour, amount_kes, position )`,
      )
      .eq('id', req.params.id)
      .single();
    if (error || !data) throw new HttpError(404, 'proforma_not_found');

    // Client role: verify ownership
    if (req.auth!.role === 'client') {
      type PfRow = { tickets: { client_id: string } | { client_id: string }[] | null };
      const ticketRel = (data as PfRow).tickets;
      const ticket = Array.isArray(ticketRel) ? ticketRel[0] : ticketRel;
      if (ticket?.client_id !== req.auth!.clientId) {
        throw new HttpError(404, 'proforma_not_found');
      }
    }

    res.json({ proforma: data });
  },
);

const ReviewLineEdit = z.object({
  id: z.string().uuid(),
  amount_kes: z.number().int().positive().optional(),
  estimated_hours: z.number().positive().optional(),
});

const ReviewInput = z.object({
  edits: z.array(ReviewLineEdit).max(20).optional(),
  remove_line_ids: z.array(z.string().uuid()).max(20).optional(),
  dispatch: z.boolean().default(true),
});

// ----------------------------------------------------------------------------
// PUT /v1/proformas/:id/review
//
// Amara reviews an ai_draft proforma. She can:
//   - edit individual line items (amount and/or hours)
//   - remove fabricated/irrelevant line items
//   - dispatch (compute content_hash, freeze the proforma)
//
// All edits happen BEFORE dispatch. After dispatch, migration 0003 triggers
// reject any further modification at the database level.
// ----------------------------------------------------------------------------
proformasRouter.put(
  '/:id/review',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!id) throw new HttpError(400, 'missing_proforma_id');

    const parsed = ReviewInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const input = parsed.data;
    const sb = getServiceClient();

    const { data: proforma, error: pErr } = await sb
      .from('proformas')
      .select('id, ref, status, content_hash, tickets(client_id)')
      .eq('id', id)
      .single();
    if (pErr || !proforma) throw new HttpError(404, 'proforma_not_found');
    if (proforma.content_hash) {
      throw new HttpError(409, 'proforma_already_dispatched');
    }

    // Apply removals first.
    if (input.remove_line_ids && input.remove_line_ids.length > 0) {
      const { error: delErr } = await sb
        .from('proforma_line_items')
        .delete()
        .in('id', input.remove_line_ids)
        .eq('proforma_id', id);
      if (delErr) {
        logger.error({ err: delErr }, 'review_remove_failed');
        throw new HttpError(500, 'review_remove_failed');
      }
    }

    // Apply edits.
    if (input.edits && input.edits.length > 0) {
      for (const edit of input.edits) {
        const patch: Record<string, unknown> = {};
        if (edit.amount_kes !== undefined) patch.amount_kes = edit.amount_kes;
        if (edit.estimated_hours !== undefined) patch.estimated_hours = edit.estimated_hours;
        if (Object.keys(patch).length === 0) continue;
        const { error: updErr } = await sb
          .from('proforma_line_items')
          .update(patch)
          .eq('id', edit.id)
          .eq('proforma_id', id);
        if (updErr) {
          logger.error({ err: updErr, edit }, 'review_edit_failed');
          throw new HttpError(500, 'review_edit_failed');
        }
      }
    }

    // Recompute totals after edits, refresh subtotal/vat/total on the proforma.
    const { data: lines, error: lErr } = await sb
      .from('proforma_line_items')
      .select('amount_kes')
      .eq('proforma_id', id);
    if (lErr) throw new HttpError(500, 'review_recalc_failed');
    if (!lines || lines.length === 0) {
      throw new HttpError(409, 'proforma_has_no_line_items');
    }
    const subtotal = lines.reduce((a, l) => a + (l.amount_kes ?? 0), 0);
    // We do NOT re-apply urgency / discount / VAT here because those came from
    // the ticket+plan at draft time. Reviews adjust line amounts only; the
    // multipliers stay locked. Recompute VAT only.
    const vat_kes = Math.ceil(subtotal * 0.16);
    await sb
      .from('proformas')
      .update({
        subtotal_kes: subtotal,
        vat_kes,
        total_kes: subtotal + vat_kes,
        status: 'under_review',
      })
      .eq('id', id);

    await writeAuditEvent({
      actor_id: req.auth!.sub,
      actor_role: req.auth!.role,
      event_type: 'proforma_review_edited',
      entity_type: 'proforma',
      entity_id: id,
      payload_snapshot: {
        edited: input.edits?.length ?? 0,
        removed: input.remove_line_ids?.length ?? 0,
        new_subtotal_kes: subtotal,
      },
    });

    if (!input.dispatch) {
      res.json({ status: 'under_review', subtotal_kes: subtotal });
      return;
    }

    const dispatched = await dispatchProforma({
      proforma_id: id,
      reviewer_user_id: req.auth!.sub,
    });

    // S9-003: notify the client a proforma is ready to approve.
    // Fire-and-forget + gated - never blocks or fails the dispatch response.
    const dispatchTicketRel = (proforma as { tickets: { client_id: string } | { client_id: string }[] | null }).tickets;
    const dispatchClientId = Array.isArray(dispatchTicketRel) ? dispatchTicketRel[0]?.client_id : dispatchTicketRel?.client_id;
    if (dispatchClientId) {
      const pfRef = (proforma as { ref: string }).ref;
      void sendClientSms({
        clientId: dispatchClientId,
        template: 'kws_proforma_dispatched',
        variables: { ref: pfRef, total: String(dispatched.total_kes) },
        entity_type: 'proforma',
        entity_id: id,
      });
      void sendClientEmail({
        clientId: dispatchClientId,
        template: 'proforma_ready',
        variables: { ref: pfRef, total: dispatched.total_kes.toLocaleString() },
        entity_type: 'proforma',
        entity_id: id,
      });
    }

    res.json({
      status: 'dispatched',
      content_hash: dispatched.content_hash,
      total_kes: dispatched.total_kes,
    });
  },
);

// ----------------------------------------------------------------------------
// PUT /v1/proformas/:id/reject
//
// Amara rejects a proforma that hasn't been dispatched yet. This sets
// the proforma status to 'rejected' and reverts the ticket status so the
// client can resubmit or clarify scope. Only works on pre-dispatch
// proformas (ai_draft or under_review). Dispatched proformas are frozen
// by migration 0003 triggers and cannot be rejected - they can only
// expire or be superseded.
// ----------------------------------------------------------------------------
const RejectInput = z.object({
  reason: z.string().min(1).max(500).optional(),
});

proformasRouter.put(
  '/:id/reject',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!id) throw new HttpError(400, 'missing_proforma_id');

    const parsed = RejectInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const sb = getServiceClient();

    const { data: proforma, error: pErr } = await sb
      .from('proformas')
      .select('id, status, content_hash, ticket_id')
      .eq('id', id)
      .single();
    if (pErr || !proforma) throw new HttpError(404, 'proforma_not_found');
    if (proforma.content_hash) {
      throw new HttpError(409, 'proforma_already_dispatched');
    }
    if (proforma.status !== 'ai_draft' && proforma.status !== 'under_review') {
      throw new HttpError(409, `proforma_invalid_status:${proforma.status}`);
    }

    await sb.from('proformas').update({ status: 'rejected' }).eq('id', id);

    // Revert the ticket back to 'submitted' so the client can resubmit
    // or the admin can re-trigger decomposition.
    await sb.from('tickets').update({ status: 'submitted' }).eq('id', proforma.ticket_id);

    await writeAuditEvent({
      actor_id: req.auth!.sub,
      actor_role: req.auth!.role,
      event_type: 'proforma_rejected',
      entity_type: 'proforma',
      entity_id: id,
      payload_snapshot: {
        reason: parsed.data.reason ?? null,
        previous_status: proforma.status,
      },
    });

    res.json({ status: 'rejected' });
  },
);

// ----------------------------------------------------------------------------
// POST /v1/proformas/:id/approve
//
// The client clicks "Approve & pay" in the portal. We:
//   1. Re-fetch the proforma + lines and recompute the content hash.
//   2. Verify it matches the dispatched hash (KWS-SEC-004 - application
//      layer check; the migration-0003 trigger does the same at the DB
//      layer when proforma_approvals is INSERTed).
//   3. Generate an idempotency_key tied to this approval attempt.
//   4. Initiate the chosen payment rail (M-Pesa STK push or Paystack
//      hosted page) - we do NOT INSERT into proforma_approvals yet. The
//      INSERT only happens when the webhook fires with a confirmed
//      payment, so an unpaid abandoned approval cannot lock scope.
//
// Returns:
//   - mpesa  → { rail:'mpesa', gateway_ref, status:'stk_initiated' }
//   - card   → { rail:'card', authorization_url, reference }
// ----------------------------------------------------------------------------
const ApproveInput = z.object({
  rail: z.enum(['mpesa', 'card']),
  msisdn: z.string().min(9).max(15).optional(),
});

proformasRouter.post(
  '/:id/approve',
  requireAuth,
  requireRole('client'),
  proformaApproveRateLimit,
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!id) throw new HttpError(400, 'missing_proforma_id');
    if (!req.auth?.clientId) throw new HttpError(403, 'client_context_missing');

    const parsed = ApproveInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const input = parsed.data;
    const sb = getServiceClient();

    // Load the proforma + verify ownership via the joined ticket+client.
    const { data: proforma, error: pErr } = await sb
      .from('proformas')
      .select('id, ref, status, content_hash, total_kes, ticket_id, tickets(client_id)')
      .eq('id', id)
      .single();

    if (pErr || !proforma) throw new HttpError(404, 'proforma_not_found');
    if (!proforma.content_hash) throw new HttpError(409, 'proforma_not_dispatched');
    if (proforma.status !== 'dispatched') {
      throw new HttpError(409, `proforma_invalid_status:${proforma.status}`);
    }

    const ticketRel = (proforma as { tickets: { client_id: string } | { client_id: string }[] | null }).tickets;
    const ownerClientId = Array.isArray(ticketRel) ? ticketRel[0]?.client_id : ticketRel?.client_id;
    if (ownerClientId !== req.auth.clientId) {
      throw new HttpError(404, 'proforma_not_found');
    }

    // Recompute the hash from the current line items.
    const { data: lines, error: lErr } = await sb
      .from('proforma_line_items')
      .select('task_name, amount_kes, position')
      .eq('proforma_id', id)
      .order('position', { ascending: true });
    if (lErr || !lines || lines.length === 0) {
      throw new HttpError(409, 'proforma_has_no_line_items');
    }
    const recomputed = computeContentHash(lines);
    if (recomputed !== proforma.content_hash) {
      // KWS-SEC-004 - tamper detected. Audit + abort.
      await writeAuditEvent({
        actor_id: req.auth.sub,
        actor_role: 'client',
        event_type: 'proforma_hash_mismatch',
        entity_type: 'proforma',
        entity_id: id,
        payload_snapshot: { dispatched: proforma.content_hash, recomputed },
      });
      throw new HttpError(409, 'proforma_content_hash_mismatch');
    }

    // Generate the idempotency key for this approval attempt. The webhook
    // handler uses this key when it INSERTs proforma_approvals - duplicate
    // webhooks for the same key are silently discarded.
    const idempotencyKey = randomUUID();
    const env = loadEnv();
    const callbackBase = env.allowedOrigins[0] ?? 'https://ws.kipkiren.co.ke';

    if (input.rail === 'mpesa') {
      if (!input.msisdn) throw new HttpError(400, 'msisdn_required_for_mpesa');
      requireFeatureEnv('kipkiren_pay');
      const stk = await kp().initiateStkPush({
        phone_msisdn: input.msisdn,
        amount_kes: proforma.total_kes,
        account_reference: proforma.ref,
        description: `Kipkiren WS · ${proforma.ref}`,
        callback_url: `${callbackBase.replace(/^https?:\/\/[^/]+/, 'https://api.ws.kipkiren.co.ke')}/v1/webhooks/mpesa`,
        idempotency_key: idempotencyKey,
      });
      // Pre-register the pending payment so the webhook can find it by ref.
      await sb.from('payments').insert({
        proforma_id: id,
        gateway: 'mpesa',
        gateway_ref: stk.gateway_ref,
        amount_kes: proforma.total_kes,
        status: 'pending',
        idempotency_key: idempotencyKey,
      });
      res.json({ rail: 'mpesa', gateway_ref: stk.gateway_ref, status: 'stk_initiated' });
      return;
    }

    // Card rail
    requireFeatureEnv('paystack');
    // Paystack ties the transaction + receipt to a customer email. Use the real
    // client email; if the client record has none, still let checkout proceed
    // (blocking a paying customer over a missing profile field is worse) but log
    // loudly with a non-routable placeholder so ops can backfill the record.
    const { data: clientRow } = await sb
      .from('clients')
      .select('email')
      .eq('id', ownerClientId)
      .single();
    const clientEmail = typeof clientRow?.email === 'string' ? clientRow.email : null;
    if (!clientEmail) {
      logger.warn({ clientId: ownerClientId, proformaId: id }, 'paystack_init_missing_client_email');
    }
    const init = await ps().initialize({
      email: clientEmail ?? `client-${ownerClientId}@no-email.kipkiren.local`,
      amount_kes: proforma.total_kes,
      reference: proforma.ref,
      callback_url: `${callbackBase}/portal/proforma/${id}`,
      metadata: { proforma_id: id, idempotency_key: idempotencyKey },
    });
    await sb.from('payments').insert({
      proforma_id: id,
      gateway: 'paystack',
      gateway_ref: init.reference,
      amount_kes: proforma.total_kes,
      status: 'pending',
      idempotency_key: idempotencyKey,
    });
    res.json({ rail: 'card', authorization_url: init.authorization_url, reference: init.reference });
  },
);
