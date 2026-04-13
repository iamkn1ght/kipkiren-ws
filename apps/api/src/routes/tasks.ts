import { Router, type Request, type Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { getServiceClient } from '../lib/supabase.js';

export const tasksRouter: Router = Router();

/**
 * ADR-KWS-003 / KWS-SEC-007 — Kamau (technical_delivery) task view.
 *
 * Kamau sees only tasks assigned to him. The response MUST NOT contain:
 *   - any client name, email, phone, business_name, contact_name
 *   - any proforma ref or amounts
 *   - any billing or payment info
 *
 * RLS in migration 0002 already restricts row visibility to assigned
 * tickets. BUT RLS operates row-level — if we did a JOIN to clients and
 * selected `business_name`, Kamau would see it for any row RLS let
 * through. So we serialise through a dedicated function that picks
 * ONLY the safe columns. Tests verify that no PII keys appear in any
 * response shape reachable from this router.
 */

// The entire safe surface — if you add a column here, update the test.
interface KamauTask {
  id: string;
  ref: string;
  category: string;
  urgency: string;
  status: string;
  description: string;
  sla_deadline_at: string | null;
  created_at: string;
}

function toKamauTask(row: {
  id: string;
  ref: string;
  category: string;
  urgency: string;
  status: string;
  description: string;
  sla_deadline_at: string | null;
  created_at: string;
}): KamauTask {
  return {
    id: row.id,
    ref: row.ref,
    category: row.category,
    urgency: row.urgency,
    status: row.status,
    description: row.description,
    sla_deadline_at: row.sla_deadline_at,
    created_at: row.created_at,
  };
}

// ----------------------------------------------------------------------------
// GET /v1/tasks — list tasks assigned to the caller
// ----------------------------------------------------------------------------
tasksRouter.get(
  '/',
  requireAuth,
  requireRole('technical_delivery'),
  async (req: Request, res: Response) => {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from('tickets')
      .select('id, ref, category, urgency, status, description, sla_deadline_at, created_at')
      .eq('assigned_to', req.auth!.sub)
      .not('status', 'in', '("complete","closed")')
      .order('sla_deadline_at', { ascending: true, nullsFirst: false });
    if (error) throw new HttpError(500, 'tasks_query_failed');
    const tasks = (data ?? []).map(toKamauTask);
    res.json({ tasks });
  },
);

// ----------------------------------------------------------------------------
// GET /v1/tasks/:id — single task
// ----------------------------------------------------------------------------
tasksRouter.get(
  '/:id',
  requireAuth,
  requireRole('technical_delivery'),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!id) throw new HttpError(400, 'missing_id');
    const sb = getServiceClient();
    const { data, error } = await sb
      .from('tickets')
      .select('id, ref, category, urgency, status, description, sla_deadline_at, created_at, assigned_to')
      .eq('id', id)
      .single();
    if (error || !data) throw new HttpError(404, 'task_not_found');
    if (data.assigned_to !== req.auth!.sub) {
      throw new HttpError(404, 'task_not_found'); // do not leak existence
    }
    res.json({ task: toKamauTask(data) });
  },
);
