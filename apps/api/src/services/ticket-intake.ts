/**
 * Shared ticket-intake pipeline.
 *
 * Originally the body of POST /v1/tickets (client self-service). Extracted so
 * BOTH the client route and the admin "raise a ticket for a client" route
 * (POST /v1/admin/tickets) run the exact same flow: create ticket → AI
 * decompose → draft proforma (which the client then approves). Keeping one
 * implementation guarantees an admin-raised ticket behaves identically to a
 * client-raised one - same SLA stamping, same Amara review gate, same audit.
 */

import { type RetainerPlanName, type CreateTicketInput } from '@kws/shared';
import { HttpError } from '../middleware/error.js';
import { requireFeatureEnv } from '../config/env.js';
import { getServiceClient } from '../lib/supabase.js';
import { writeAuditEvent } from './audit.js';
import { decomposeTicket } from './decomposition.js';
import { createDraftProforma, loadActiveRateCard } from './proforma.js';
import { computeSlaDeadline } from './sla.js';
import { sendClientEmail } from './email.js';
import { logger } from '../lib/logger.js';
import type { UserRole } from '../middleware/auth.js';

interface ClientContext {
  client_id: string;
  retainer_plan_name: RetainerPlanName;
  sla_response_hours: number;
}

async function loadClientContext(clientId: string): Promise<ClientContext> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('clients')
    .select('id, retainer_plans(name, sla_response_hours)')
    .eq('id', clientId)
    .single();
  if (error || !data) throw new HttpError(404, 'client_not_found');
  const rel = (data as { retainer_plans: { name: string; sla_response_hours: number } | { name: string; sla_response_hours: number }[] | null }).retainer_plans;
  const plan = Array.isArray(rel) ? rel[0] : rel;
  if (!plan) throw new HttpError(404, 'retainer_plan_not_found');
  return {
    client_id: clientId,
    retainer_plan_name: plan.name as RetainerPlanName,
    sla_response_hours: plan.sla_response_hours,
  };
}

async function nextTicketRef(): Promise<string> {
  const sb = getServiceClient();
  const { count, error } = await sb
    .from('tickets')
    .select('id', { head: true, count: 'exact' });
  if (error) throw new HttpError(500, 'ticket_ref_failed');
  return `KWS-T-${String((count ?? 0) + 1).padStart(4, '0')}`;
}

export interface IntakeResult {
  ticket_id: string;
  ref: string;
  proforma_id: string | null;
}

export interface IntakeParams {
  clientId: string;          // the client the ticket belongs to
  submittedBy: string;       // user id of whoever raised it (client OR admin)
  actorRole: UserRole;       // role recorded in the audit trail
  input: CreateTicketInput;
}

/**
 * Create a ticket and run inline AI decomposition → draft proforma.
 * Decomposition failure is non-fatal: the ticket lands in `review` for Amara.
 */
export async function intakeTicket(params: IntakeParams): Promise<IntakeResult> {
  const { clientId, submittedBy, actorRole, input } = params;
  const clientCtx = await loadClientContext(clientId);
  const sb = getServiceClient();

  const ref = await nextTicketRef();
  const submittedAt = new Date();
  const slaDeadline = computeSlaDeadline({
    submittedAt,
    planSlaHours: clientCtx.sla_response_hours,
    urgency: input.urgency,
  });

  const { data: ticket, error: insErr } = await sb
    .from('tickets')
    .insert({
      ref,
      client_id: clientCtx.client_id,
      submitted_by: submittedBy,
      description: input.description,
      category: input.category,
      urgency: input.urgency,
      status: 'submitted',
      sla_deadline_at: slaDeadline.toISOString(),
    })
    .select('id, ref')
    .single();

  if (insErr || !ticket) {
    logger.error({ err: insErr }, 'ticket_insert_failed');
    throw new HttpError(500, 'ticket_insert_failed');
  }

  await writeAuditEvent({
    actor_id: submittedBy,
    actor_role: actorRole,
    event_type: 'ticket_submitted',
    entity_type: 'ticket',
    entity_id: ticket.id,
    payload_snapshot: { category: input.category, urgency: input.urgency, ref: ticket.ref, raised_by_role: actorRole },
  });

  await sb.from('tickets').update({ status: 'decomposing' }).eq('id', ticket.id);

  let proforma_id: string | null = null;
  try {
    requireFeatureEnv('anthropic');
    const rateCard = await loadActiveRateCard();
    const ai = await decomposeTicket({
      ticket_description: input.description,
      category: input.category,
      active_rate_card: rateCard,
    });
    const draft = await createDraftProforma({
      ticket_id: ticket.id,
      ai: ai.result,
      urgency: input.urgency,
      plan: clientCtx.retainer_plan_name,
    });
    proforma_id = draft.id;
    await writeAuditEvent({
      actor_id: submittedBy,
      actor_role: actorRole,
      event_type: 'ai_decomposition_completed',
      entity_type: 'ticket',
      entity_id: ticket.id,
      payload_snapshot: {
        confidence: ai.result.confidence,
        flag_reason: ai.result.flag_reason,
        line_count: ai.result.line_items.length,
        sanitiser_redacted: ai.sanitise.redacted,
        sanitiser_match_count: ai.sanitise.match_count,
        model: ai.model,
        proforma_id,
      },
    });
  } catch (err) {
    logger.warn({ err, ticket_id: ticket.id }, 'ai_decomposition_failed');
    await sb.from('tickets').update({ status: 'review' }).eq('id', ticket.id);
    await writeAuditEvent({
      actor_id: submittedBy,
      actor_role: actorRole,
      event_type: 'ai_decomposition_failed',
      entity_type: 'ticket',
      entity_id: ticket.id,
      payload_snapshot: { error: (err as Error).message },
    });
  }

  // Email the client that their request is logged (covers admin-raised-on-behalf).
  // Gated + fire-and-forget: a no-op until EMAIL_* are set; never blocks intake.
  void sendClientEmail({
    clientId: clientCtx.client_id,
    template: 'ticket_raised',
    variables: {
      ref: ticket.ref,
      summary: input.description.length > 140 ? `${input.description.slice(0, 137)}...` : input.description,
    },
    entity_type: 'ticket',
    entity_id: ticket.id,
  });

  return { ticket_id: ticket.id, ref: ticket.ref, proforma_id };
}
