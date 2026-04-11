import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { getServiceClient } from '../lib/supabase.js';
import { writeAuditEvent } from '../services/audit.js';
import { loadQueue, loadClientAccounts, loadCapacitySnapshot } from '../services/admin-views.js';
import { logger } from '../lib/logger.js';

export const adminRouter: Router = Router();

// ----------------------------------------------------------------------------
// GET /v1/admin/queue — SLA-sorted ticket queue
// ----------------------------------------------------------------------------
adminRouter.get(
  '/queue',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const queue = await loadQueue();
    res.json({ queue });
  },
);

// ----------------------------------------------------------------------------
// GET /v1/admin/clients — client accounts summary
// ----------------------------------------------------------------------------
adminRouter.get(
  '/clients',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const clients = await loadClientAccounts();
    res.json({ clients });
  },
);

// ----------------------------------------------------------------------------
// GET /v1/admin/capacity — snapshot for the Capacity tab
// ----------------------------------------------------------------------------
adminRouter.get(
  '/capacity',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const snapshot = await loadCapacitySnapshot();
    res.json(snapshot);
  },
);

// ----------------------------------------------------------------------------
// PUT /v1/admin/rate-card/:id — update a rate card entry
// KWS-SEC-009 — writes require STRICT admin role, not delivery_lead.
// Every update writes audit_log rate_card_modified with before/after.
// Old versions are deactivated, never deleted (ADR-KWS-004).
// ----------------------------------------------------------------------------
const RateCardUpdate = z.object({
  task_name: z.string().optional(),
  task_description: z.string().nullable().optional(),
  estimated_hours: z.number().positive().optional(),
  base_rate_kes_per_hour: z.number().int().positive().optional(),
  fixed_price_kes: z.number().int().positive().optional(),
  complexity: z.enum(['simple', 'standard', 'complex']).optional(),
  active: z.boolean().optional(),
});

adminRouter.put(
  '/rate-card/:id',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) throw new HttpError(400, 'missing_rate_card_id');
    const parsed = RateCardUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const sb = getServiceClient();

    const { data: before, error: befErr } = await sb
      .from('rate_card')
      .select('*')
      .eq('id', id)
      .single();
    if (befErr || !before) throw new HttpError(404, 'rate_card_entry_not_found');

    const { data: after, error: updErr } = await sb
      .from('rate_card')
      .update(parsed.data)
      .eq('id', id)
      .select('*')
      .single();
    if (updErr || !after) {
      logger.error({ err: updErr }, 'rate_card_update_failed');
      throw new HttpError(500, 'rate_card_update_failed');
    }

    await writeAuditEvent({
      actor_id: req.auth!.sub,
      actor_role: 'admin',
      event_type: 'rate_card_modified',
      entity_type: 'rate_card',
      entity_id: id,
      payload_snapshot: { before, after },
    });

    res.json({ rate_card_entry: after });
  },
);
