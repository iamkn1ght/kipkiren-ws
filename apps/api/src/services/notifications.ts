/**
 * Todoku SMS notifications (S9-003).
 *
 * KWS sends transactional SMS on 5 event types via the Todoku rail. The
 * `kws` tenant + 5 templates are already provisioned rail-side (TD-13); what
 * is pending is the operator credential handover (4 env vars) and the 5
 * template ULIDs - see OPERATOR_REQUEST_TODOKU.md.
 *
 * This module is the scaffold the operator doc anticipates:
 *   - Template ULIDs are PLACEHOLDER constants until the real ULIDs land.
 *     A send targeting a placeholder template returns TEMPLATE_NOT_READY.
 *   - `sendSms()` is fire-and-forget and NEVER throws (S9-003 AC #5): a
 *     Todoku failure must not break the primary transaction that triggered
 *     it. Outcomes are logged to audit_log (sent / failed).
 *   - The Todoku client is interface-shaped with a test seam, like the
 *     payment adapters in payments.ts. The real client signs requests with
 *     base64 HMAC-SHA256 over Todoku's canonical string.
 *
 * Activation: set the TODOKU_KWS_* env vars in Railway and replace the
 * placeholder ULIDs below. `isFeatureConfigured('todoku')` gates the send.
 */

import { createHash, createHmac } from 'node:crypto';
import { isFeatureConfigured, loadEnv } from '../config/env.js';
import { getServiceClient } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { writeAuditEvent } from './audit.js';

export const TODOKU_TEMPLATE_SLUGS = [
  'kws_proforma_dispatched',
  'kws_payment_confirmed',
  'kws_sla_breach',
  'kws_domain_expiry_30d',
  'kws_domain_expiry_7d',
] as const;
export type TodokuTemplateSlug = (typeof TODOKU_TEMPLATE_SLUGS)[number];

const PLACEHOLDER_PREFIX = 'KWS_TEMPLATE_PLACEHOLDER_';

// Replace each value with the real ULID from the Todoku admin portal once the
// operator hands them over (OPERATOR_REQUEST_TODOKU.md §1.2). Until then a send
// to that template returns TEMPLATE_NOT_READY.
const TEMPLATE_ULIDS: Record<TodokuTemplateSlug, string> = {
  kws_proforma_dispatched: `${PLACEHOLDER_PREFIX}kws_proforma_dispatched`,
  kws_payment_confirmed: `${PLACEHOLDER_PREFIX}kws_payment_confirmed`,
  kws_sla_breach: `${PLACEHOLDER_PREFIX}kws_sla_breach`,
  kws_domain_expiry_30d: `${PLACEHOLDER_PREFIX}kws_domain_expiry_30d`,
  kws_domain_expiry_7d: `${PLACEHOLDER_PREFIX}kws_domain_expiry_7d`,
};

function isPlaceholder(ulid: string): boolean {
  return ulid.startsWith(PLACEHOLDER_PREFIX);
}

// Test seam - set a real ULID so the send path can be exercised before the
// operator handover.
export function setTemplateUlidForTest(slug: TodokuTemplateSlug, ulid: string): void {
  TEMPLATE_ULIDS[slug] = ulid;
}

export interface SendSmsInput {
  template: TodokuTemplateSlug;
  to_msisdn: string;                       // 2547XXXXXXXX
  variables: Record<string, string>;       // template placeholders, e.g. { ref, total }
  entity_type?: string;                    // for the audit trail (e.g. 'proforma')
  entity_id?: string;
}

export type SendSmsResult =
  | { status: 'sent'; provider_ref: string }
  | { status: 'template_not_ready' }
  | { status: 'feature_unavailable' }
  | { status: 'failed'; error: string };

export interface TodokuSendInput {
  template_ulid: string;
  to_msisdn: string;
  sender_id: string;
  variables: Record<string, string>;
}

export interface TodokuClient {
  send(input: TodokuSendInput): Promise<{ provider_ref: string }>;
}

// ---------------------------------------------------------------------------
// Real-client wiring (lazy - tests inject a fake via setTodokuClientForTest)
// ---------------------------------------------------------------------------

let injectedClient: TodokuClient | null = null;
export function setTodokuClientForTest(c: TodokuClient | null): void {
  injectedClient = c;
}

let realClient: TodokuClient | null = null;
function getTodokuClient(): TodokuClient {
  if (injectedClient) return injectedClient;
  if (realClient) return realClient;
  const env = loadEnv();

  realClient = {
    async send(input) {
      const path = '/messages';
      const bodyObj = {
        template_id: input.template_ulid,
        to: input.to_msisdn,
        sender_id: input.sender_id,
        variables: input.variables,
      };
      const body = JSON.stringify(bodyObj);
      const timestamp = new Date().toISOString();
      const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
      // Todoku canonical signing string (CONTRACT.md): base64 HMAC-SHA256.
      const canonical = ['POST', path, 'application/json', timestamp, bodyHash].join('\n');
      const signature = createHmac('sha256', env.TODOKU_KWS_HMAC_SECRET)
        .update(canonical, 'utf8')
        .digest('base64');

      const res = await fetch(`${env.TODOKU_API_BASE}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Todoku-HMAC-SHA256 app_id=${env.TODOKU_KWS_API_KEY}`,
          'x-todoku-timestamp': timestamp,
          'x-todoku-signature': signature,
        },
        body,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.error({ status: res.status, body: text }, 'todoku_send_failed');
        throw new Error('todoku_send_failed');
      }
      const json = (await res.json().catch(() => null)) as { message_id?: string } | null;
      if (!json?.message_id) throw new Error('todoku_send_malformed');
      return { provider_ref: json.message_id };
    },
  };
  return realClient;
}

/**
 * Fire-and-forget SMS send. NEVER throws - returns a result the caller may
 * log or ignore. Safe to call inline from a primary transaction (AC #5).
 */
export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  try {
    if (!isFeatureConfigured('todoku')) {
      logger.info({ template: input.template }, 'todoku_skipped_unconfigured');
      return { status: 'feature_unavailable' };
    }

    const ulid = TEMPLATE_ULIDS[input.template];
    if (isPlaceholder(ulid)) {
      logger.warn({ template: input.template }, 'todoku_template_not_ready');
      return { status: 'template_not_ready' };
    }

    const env = loadEnv();
    const { provider_ref } = await getTodokuClient().send({
      template_ulid: ulid,
      to_msisdn: input.to_msisdn,
      sender_id: env.TODOKU_KWS_SENDER_ID,
      variables: input.variables,
    });

    await writeAuditEvent({
      actor_id: null,
      actor_role: null,
      event_type: 'todoku_message_sent',
      entity_type: input.entity_type ?? 'notification',
      entity_id: input.entity_id ?? provider_ref,
      payload_snapshot: { template: input.template, provider_ref, to: input.to_msisdn },
    });
    return { status: 'sent', provider_ref };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown_error';
    logger.error({ err, template: input.template }, 'todoku_delivery_failed');
    await writeAuditEvent({
      actor_id: null,
      actor_role: null,
      event_type: 'todoku_delivery_failed',
      entity_type: input.entity_type ?? 'notification',
      entity_id: input.entity_id ?? input.template,
      payload_snapshot: { template: input.template, error },
    });
    return { status: 'failed', error };
  }
}

/**
 * Resolve a client's phone and send a templated SMS (S9-003 event wiring).
 * Gated + fire-and-forget: never throws. Skips the DB lookup entirely when
 * Todoku is unconfigured (the current production state), so calling this on a
 * hot path (proforma dispatch, payment confirmation) is a no-op until creds +
 * template ULIDs land.
 */
export async function sendClientSms(input: {
  clientId: string;
  template: TodokuTemplateSlug;
  variables: Record<string, string>;
  entity_type?: string;
  entity_id?: string;
}): Promise<SendSmsResult> {
  try {
    if (!isFeatureConfigured('todoku')) return { status: 'feature_unavailable' };
    const sb = getServiceClient();
    const { data, error } = await sb.from('clients').select('phone').eq('id', input.clientId).single();
    if (error || !data?.phone) {
      logger.info({ clientId: input.clientId, template: input.template }, 'sms_skipped_no_client_phone');
      return { status: 'failed', error: 'no_client_phone' };
    }
    return await sendSms({
      template: input.template,
      to_msisdn: data.phone,
      variables: input.variables,
      ...(input.entity_type ? { entity_type: input.entity_type } : {}),
      ...(input.entity_id ? { entity_id: input.entity_id } : {}),
    });
  } catch (err) {
    logger.error({ err, template: input.template }, 'send_client_sms_failed');
    return { status: 'failed', error: err instanceof Error ? err.message : 'unknown_error' };
  }
}
