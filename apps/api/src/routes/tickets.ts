import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CreateTicketInput, TicketStatus, type RetainerPlanName } from '@kws/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ticketRateLimit } from '../middleware/rate-limit.js';
import { HttpError } from '../middleware/error.js';
import { requireFeatureEnv } from '../config/env.js';
import { getServiceClient } from '../lib/supabase.js';
import { writeAuditEvent } from '../services/audit.js';
import { decomposeTicket } from '../services/decomposition.js';
import { createDraftProforma, loadActiveRateCard } from '../services/proforma.js';
import { computeSlaDeadline } from '../services/sla.js';
import { logger } from '../lib/logger.js';

export const ticketsRouter: Router = Router();

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

// ----------------------------------------------------------------------------
// POST /v1/tickets — KWS-S2 core flow start.
//   1. Create the ticket row (status: submitted)
//   2. Audit ticket_submitted
//   3. Decompose async-style: decompose() then createDraftProforma()
//   4. Audit ai_decomposition_completed (or _failed)
//   5. Return ticket_id immediately along with the draft proforma id if
//      decomposition succeeded synchronously.
//
// At MVP we run decomposition inline. For volume we will move it to a
// background worker — the architecture doc shows the async boundary at
// the AI Decomposition Service. For now inline keeps S2 testable.
// ----------------------------------------------------------------------------
ticketsRouter.post(
  '/',
  requireAuth,
  requireRole('client'),
  ticketRateLimit,
  async (req: Request, res: Response) => {
    if (!req.auth?.clientId) {
      throw new HttpError(403, 'client_context_missing');
    }
    const parsed = CreateTicketInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const input = parsed.data;
    const clientCtx = await loadClientContext(req.auth.clientId);
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
        submitted_by: req.auth.sub,
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
      actor_id: req.auth.sub,
      actor_role: 'client',
      event_type: 'ticket_submitted',
      entity_type: 'ticket',
      entity_id: ticket.id,
      payload_snapshot: { category: input.category, urgency: input.urgency, ref: ticket.ref },
    });

    // Mark decomposing.
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
        actor_id: req.auth.sub,
        actor_role: 'client',
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
        actor_id: req.auth.sub,
        actor_role: 'client',
        event_type: 'ai_decomposition_failed',
        entity_type: 'ticket',
        entity_id: ticket.id,
        payload_snapshot: { error: (err as Error).message },
      });
    }

    res.status(201).json({
      ticket_id: ticket.id,
      ref: ticket.ref,
      proforma_id,
    });
  },
);

// ----------------------------------------------------------------------------
// PUT /v1/tickets/:id/assign — assign a ticket to a technical_delivery user.
// KWS-SEC-007 + ADR-KWS-003: only delivery_lead / admin can call this.
// The assignee must be a technical_delivery user; we enforce that server-side.
// ----------------------------------------------------------------------------
const AssignInput = z.object({
  assignee_id: z.string().uuid(),
});

ticketsRouter.put(
  '/:id/assign',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!id) throw new HttpError(400, 'missing_ticket_id');
    const parsed = AssignInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const sb = getServiceClient();

    const { data: assignee, error: aErr } = await sb
      .from('users')
      .select('id, role')
      .eq('id', parsed.data.assignee_id)
      .single();
    if (aErr || !assignee) throw new HttpError(404, 'assignee_not_found');
    if (assignee.role !== 'technical_delivery') {
      throw new HttpError(400, 'assignee_must_be_technical_delivery');
    }

    const { data: ticket, error: tErr } = await sb
      .from('tickets')
      .update({ assigned_to: parsed.data.assignee_id })
      .eq('id', id)
      .select('id, ref, status, assigned_to')
      .single();
    if (tErr || !ticket) throw new HttpError(404, 'ticket_not_found');

    await writeAuditEvent({
      actor_id: req.auth!.sub,
      actor_role: req.auth!.role,
      event_type: 'ticket_assigned',
      entity_type: 'ticket',
      entity_id: id,
      payload_snapshot: { assignee_id: parsed.data.assignee_id, ticket_ref: ticket.ref },
    });

    res.json({ ticket });
  },
);

// ----------------------------------------------------------------------------
// PUT /v1/tickets/:id/status — role-scoped status transitions.
//
// ADR-KWS-003 / KWS-SEC-007: Kamau (technical_delivery) can only progress
// a ticket he is assigned to through in_progress → complete. He cannot
// touch any other status. Amara (delivery_lead) and admin can apply any
// valid transition.
// ----------------------------------------------------------------------------
const StatusInput = z.object({
  status: TicketStatus,
});

const KAMAU_ALLOWED_FROM = new Set(['paid', 'in_progress']);
const KAMAU_ALLOWED_TO = new Set(['in_progress', 'complete']);

ticketsRouter.put(
  '/:id/status',
  requireAuth,
  requireRole('technical_delivery', 'delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    if (!req.auth) throw new HttpError(401, 'unauthenticated');
    const id = String(req.params.id);
    if (!id) throw new HttpError(400, 'missing_ticket_id');
    const parsed = StatusInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const target = parsed.data.status;
    const sb = getServiceClient();

    const { data: current, error: cErr } = await sb
      .from('tickets')
      .select('id, status, assigned_to')
      .eq('id', id)
      .single();
    if (cErr || !current) throw new HttpError(404, 'ticket_not_found');

    if (req.auth.role === 'technical_delivery') {
      // Kamau: must be the assignee, current must be a Kamau-allowed source,
      // target must be a Kamau-allowed destination.
      if (current.assigned_to !== req.auth.sub) {
        throw new HttpError(403, 'forbidden_not_assignee');
      }
      if (!KAMAU_ALLOWED_FROM.has(current.status) || !KAMAU_ALLOWED_TO.has(target)) {
        throw new HttpError(403, 'forbidden_transition');
      }
    }

    const update: Record<string, unknown> = { status: target };
    const { data: updated, error: uErr } = await sb
      .from('tickets')
      .update(update)
      .eq('id', id)
      .select('id, ref, status')
      .single();
    if (uErr || !updated) throw new HttpError(500, 'status_update_failed');

    if (target === 'complete') {
      await writeAuditEvent({
        actor_id: req.auth.sub,
        actor_role: req.auth.role,
        event_type: 'task_completed',
        entity_type: 'ticket',
        entity_id: id,
        payload_snapshot: { from: current.status, to: target, ticket_ref: updated.ref },
      });
    }

    res.json({ ticket: updated });
  },
);
