import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CreateTicketInput, TicketStatus } from '@kws/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ticketRateLimit } from '../middleware/rate-limit.js';
import { HttpError } from '../middleware/error.js';
import { getServiceClient } from '../lib/supabase.js';
import { writeAuditEvent } from '../services/audit.js';
import { intakeTicket } from '../services/ticket-intake.js';

export const ticketsRouter: Router = Router();

// ----------------------------------------------------------------------------
// POST /v1/tickets - KWS-S2 core flow start.
//   1. Create the ticket row (status: submitted)
//   2. Audit ticket_submitted
//   3. Decompose async-style: decompose() then createDraftProforma()
//   4. Audit ai_decomposition_completed (or _failed)
//   5. Return ticket_id immediately along with the draft proforma id if
//      decomposition succeeded synchronously.
//
// At MVP we run decomposition inline. For volume we will move it to a
// background worker - the architecture doc shows the async boundary at
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
    const result = await intakeTicket({
      clientId: req.auth.clientId,
      submittedBy: req.auth.sub,
      actorRole: 'client',
      input: parsed.data,
    });
    res.status(201).json(result);
  },
);

// ----------------------------------------------------------------------------
// GET /v1/tickets - list tickets for the authenticated user.
// Client: own tickets only. Admin/delivery_lead: all tickets.
// ----------------------------------------------------------------------------
ticketsRouter.get(
  '/',
  requireAuth,
  requireRole('client', 'delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const sb = getServiceClient();
    let query = sb
      .from('tickets')
      .select(
        `id, ref, description, category, urgency, status, sla_deadline_at, assigned_to, created_at,
         clients ( id, business_name )`,
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (req.auth!.role === 'client') {
      if (!req.auth!.clientId) throw new HttpError(403, 'client_context_missing');
      query = query.eq('client_id', req.auth!.clientId);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ tickets: data ?? [] });
  },
);

// ----------------------------------------------------------------------------
// GET /v1/tickets/:id - single ticket detail.
// Client: own ticket only. Admin: any ticket.
// ----------------------------------------------------------------------------
ticketsRouter.get(
  '/:id',
  requireAuth,
  requireRole('client', 'delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const sb = getServiceClient();
    let query = sb
      .from('tickets')
      .select(
        `id, ref, description, category, urgency, status, sla_deadline_at, assigned_to, created_at,
         clients ( id, business_name ),
         proformas ( id, ref, status, subtotal_kes, discount_kes, vat_kes, total_kes, content_hash, dispatched_at )`,
      )
      .eq('id', req.params.id);

    if (req.auth!.role === 'client') {
      if (!req.auth!.clientId) throw new HttpError(403, 'client_context_missing');
      query = query.eq('client_id', req.auth!.clientId);
    }

    const { data, error } = await query.single();
    if (error || !data) throw new HttpError(404, 'ticket_not_found');
    res.json({ ticket: data });
  },
);

// ----------------------------------------------------------------------------
// PUT /v1/tickets/:id/assign - assign a ticket to a technical_delivery user.
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
// PUT /v1/tickets/:id/status - role-scoped status transitions.
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

    // Stamp updated_at so the task-view Completed tab can show when a task
    // was last moved (no DB trigger maintains this column).
    const update: Record<string, unknown> = { status: target, updated_at: new Date().toISOString() };
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
