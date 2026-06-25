/**
 * SLA breach notifications (KWS-S9-003, 5th Todoku template).
 *
 * A scan finds open tickets whose SLA deadline has elapsed and sends the
 * client the kws_sla_breach SMS ("we have flagged a delay on [ticket_ref] ...").
 * Per-ticket idempotency is achieved WITHOUT new schema: the INSERT-only
 * audit_log doubles as the dedup ledger - we only write the
 * `sla_breach_notified` marker after a confirmed send, and skip any ticket that
 * already has one. Until Todoku is configured, sends return feature_unavailable,
 * no marker is written, and the breach stays eligible for the next scan.
 *
 * selectNewBreaches is pure and carries the unit coverage; runSlaBreachAlerts is
 * the thin DB+send wrapper. Triggered by POST /v1/admin/sla-breach-scan (manual
 * or future cron - kws_sprint_9.md §KWS-S9-003 AC#3).
 */

import { getServiceClient } from '../lib/supabase.js';
import { sendClientSms } from './notifications.js';
import { writeAuditEvent } from './audit.js';

const TERMINAL_STATUSES = new Set(['complete', 'closed']);
const DEFAULT_SLA_HOURS = 24;

export interface BreachTicketInput {
  id: string;
  ref: string;
  client_id: string;
  status: string;
  sla_deadline_at: string | null;
  msisdn?: string;
  sla_hours?: number;
}

export interface BreachAlert {
  ticket_id: string;
  ref: string;
  client_id: string;
  msisdn?: string;
  sla_hours: number;
}

/**
 * Pure: pick breached tickets (non-terminal, deadline elapsed) that have NOT
 * already been notified. Default-safe - undated or terminal tickets are skipped.
 */
export function selectNewBreaches(
  tickets: BreachTicketInput[],
  notifiedTicketIds: Set<string>,
  now: Date = new Date(),
): BreachAlert[] {
  const out: BreachAlert[] = [];
  for (const t of tickets) {
    if (!t.sla_deadline_at) continue;
    if (TERMINAL_STATUSES.has(t.status)) continue;
    const deadline = Date.parse(t.sla_deadline_at);
    if (Number.isNaN(deadline) || deadline > now.getTime()) continue; // not breached
    if (notifiedTicketIds.has(t.id)) continue;                         // already notified
    out.push({
      ticket_id: t.id,
      ref: t.ref,
      client_id: t.client_id,
      ...(t.msisdn ? { msisdn: t.msisdn } : {}),
      sla_hours: t.sla_hours ?? DEFAULT_SLA_HOURS,
    });
  }
  return out;
}

export interface SlaBreachScanResult {
  scanned: number;
  new_breaches: number;
  notified: number;
  skipped_no_phone: number;
}

export async function runSlaBreachAlerts(now: Date = new Date()): Promise<SlaBreachScanResult> {
  const sb = getServiceClient();

  const { data: tickets, error } = await sb
    .from('tickets')
    .select('id, ref, client_id, status, sla_deadline_at, clients ( phone, retainer_plans ( sla_response_hours ) )')
    .not('status', 'in', '("complete","closed")')
    .not('sla_deadline_at', 'is', null)
    .lte('sla_deadline_at', now.toISOString())
    .limit(500);
  if (error) throw error;

  // Dedup ledger: tickets we've already sent a breach SMS for.
  const { data: notified } = await sb
    .from('audit_log')
    .select('entity_id')
    .eq('event_type', 'sla_breach_notified');
  const notifiedIds = new Set(((notified ?? []).map((r) => r.entity_id).filter(Boolean)) as string[]);

  type Row = {
    id: string;
    ref: string;
    client_id: string;
    status: string;
    sla_deadline_at: string | null;
    clients:
      | { phone: string | null; retainer_plans: { sla_response_hours: number } | { sla_response_hours: number }[] | null }
      | { phone: string | null; retainer_plans: { sla_response_hours: number } | { sla_response_hours: number }[] | null }[]
      | null;
  };

  const inputs: BreachTicketInput[] = ((tickets ?? []) as Row[]).map((t) => {
    const cl = Array.isArray(t.clients) ? t.clients[0] : t.clients;
    const planRel = cl?.retainer_plans;
    const plan = Array.isArray(planRel) ? planRel[0] : planRel;
    return {
      id: t.id,
      ref: t.ref,
      client_id: t.client_id,
      status: t.status,
      sla_deadline_at: t.sla_deadline_at,
      ...(cl?.phone ? { msisdn: cl.phone } : {}),
      ...(plan?.sla_response_hours ? { sla_hours: plan.sla_response_hours } : {}),
    };
  });

  const breaches = selectNewBreaches(inputs, notifiedIds, now);
  let notifiedCount = 0;
  let skippedNoPhone = 0;

  for (const b of breaches) {
    if (!b.msisdn) {
      skippedNoPhone += 1;
      continue;
    }
    const res = await sendClientSms({
      clientId: b.client_id,
      template: 'kws_sla_breach',
      variables: { ticket_ref: b.ref, sla_hours: String(b.sla_hours) },
      entity_type: 'ticket',
      entity_id: b.ticket_id,
    });
    // Only mark as notified once it actually sent - so a breach stays eligible
    // until Todoku is live, then is sent exactly once.
    if (res.status === 'sent') {
      notifiedCount += 1;
      await writeAuditEvent({
        actor_id: null,
        actor_role: null,
        event_type: 'sla_breach_notified',
        entity_type: 'ticket',
        entity_id: b.ticket_id,
        payload_snapshot: { ref: b.ref, sla_hours: b.sla_hours },
      });
    }
  }

  return { scanned: inputs.length, new_breaches: breaches.length, notified: notifiedCount, skipped_no_phone: skippedNoPhone };
}
