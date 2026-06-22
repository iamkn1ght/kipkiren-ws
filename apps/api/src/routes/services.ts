import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { getServiceClient } from '../lib/supabase.js';
import { writeAuditEvent } from '../services/audit.js';
import { logger } from '../lib/logger.js';

export const servicesRouter: Router = Router();

/**
 * Mark services as 'expiring' when their renewal_at is within 30 days.
 * Called on admin list fetch - lightweight, runs once per admin page load.
 */
async function refreshExpiringStatuses(): Promise<void> {
  const sb = getServiceClient();
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Active → expiring (within 30 days of renewal)
  await sb
    .from('client_services')
    .update({ status: 'expiring' })
    .eq('status', 'active')
    .not('renewal_at', 'is', null)
    .lte('renewal_at', thirtyDaysFromNow)
    .gt('renewal_at', now);

  // Expiring/active → expired (past renewal date)
  await sb
    .from('client_services')
    .update({ status: 'expired' })
    .in('status', ['active', 'expiring'])
    .not('renewal_at', 'is', null)
    .lte('renewal_at', now);
}

const SERVICE_TYPES = [
  'hosting', 'domain', 'workspace', 'microsoft365', 'ssl', 'seo_retainer', 'social_retainer',
] as const;

const SERVICE_STATUSES = ['active', 'expiring', 'expired', 'suspended'] as const;

// ----------------------------------------------------------------------------
// GET /v1/services - list services for the authenticated client
// RLS: clients see own services only via service-role query filtered by client_id
// ----------------------------------------------------------------------------
servicesRouter.get(
  '/',
  requireAuth,
  async (req: Request, res: Response) => {
    const sb = getServiceClient();
    const clientId = req.auth!.clientId;
    if (!clientId) throw new HttpError(403, 'client_context_missing');

    const { data, error } = await sb
      .from('client_services')
      .select('id, service_type, status, renewal_at, monthly_cost_kes, metadata, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    res.json({ services: data ?? [] });
  },
);

// ----------------------------------------------------------------------------
// GET /v1/services/:id - single service detail for the authenticated client
// ----------------------------------------------------------------------------
servicesRouter.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    const sb = getServiceClient();
    const clientId = req.auth!.clientId;
    if (!clientId) throw new HttpError(403, 'client_context_missing');

    const { data, error } = await sb
      .from('client_services')
      .select('*')
      .eq('id', req.params.id)
      .eq('client_id', clientId)
      .single();
    if (error || !data) throw new HttpError(404, 'service_not_found');

    res.json({ service: data });
  },
);

// ============================================================================
// Admin endpoints - delivery_lead/admin only
// ============================================================================

// ----------------------------------------------------------------------------
// GET /v1/services/admin/all - list all services across all clients
// ----------------------------------------------------------------------------
servicesRouter.get(
  '/admin/all',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    // Refresh expiring/expired statuses before listing
    await refreshExpiringStatuses();

    const sb = getServiceClient();

    const { data, error } = await sb
      .from('client_services')
      .select(
        `id, service_type, status, renewal_at, monthly_cost_kes, metadata, created_at,
         clients ( id, business_name )`,
      )
      .order('renewal_at', { ascending: true, nullsFirst: false });
    if (error) throw error;

    type Row = {
      id: string;
      service_type: string;
      status: string;
      renewal_at: string | null;
      monthly_cost_kes: number;
      metadata: Record<string, unknown>;
      created_at: string;
      clients: { id: string; business_name: string } | { id: string; business_name: string }[] | null;
    };

    const services = ((data ?? []) as Row[]).map((r) => {
      const client = Array.isArray(r.clients) ? r.clients[0] : r.clients;
      return {
        id: r.id,
        service_type: r.service_type,
        status: r.status,
        renewal_at: r.renewal_at,
        monthly_cost_kes: r.monthly_cost_kes,
        metadata: r.metadata,
        created_at: r.created_at,
        client_id: client?.id ?? '',
        client_name: client?.business_name ?? '',
      };
    });

    res.json({ services });
  },
);

// ----------------------------------------------------------------------------
// POST /v1/services/admin - create a service for a client
// ----------------------------------------------------------------------------
const CreateServiceInput = z.object({
  client_id: z.string().uuid(),
  service_type: z.enum(SERVICE_TYPES),
  status: z.enum(SERVICE_STATUSES).default('active'),
  renewal_at: z.string().datetime().nullable().optional(),
  monthly_cost_kes: z.number().int().nonnegative(),
  metadata: z.record(z.unknown()).default({}),
});

servicesRouter.post(
  '/admin',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const parsed = CreateServiceInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const input = parsed.data;
    const sb = getServiceClient();

    // Verify client exists
    const { data: client, error: cErr } = await sb
      .from('clients')
      .select('id')
      .eq('id', input.client_id)
      .single();
    if (cErr || !client) throw new HttpError(404, 'client_not_found');

    const { data: service, error: sErr } = await sb
      .from('client_services')
      .insert({
        client_id: input.client_id,
        service_type: input.service_type,
        status: input.status,
        renewal_at: input.renewal_at ?? null,
        monthly_cost_kes: input.monthly_cost_kes,
        metadata: input.metadata,
      })
      .select('*')
      .single();
    if (sErr || !service) {
      logger.error({ err: sErr }, 'service_create_failed');
      throw new HttpError(500, 'service_create_failed');
    }

    await writeAuditEvent({
      actor_id: req.auth!.sub,
      actor_role: req.auth!.role,
      event_type: 'service_created',
      entity_type: 'client_service',
      entity_id: service.id,
      payload_snapshot: { service_type: input.service_type, client_id: input.client_id },
    });

    res.status(201).json({ service });
  },
);

// ----------------------------------------------------------------------------
// PUT /v1/services/admin/:id - update a service
// ----------------------------------------------------------------------------
const UpdateServiceInput = z.object({
  status: z.enum(SERVICE_STATUSES).optional(),
  renewal_at: z.string().datetime().nullable().optional(),
  monthly_cost_kes: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

servicesRouter.put(
  '/admin/:id',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const parsed = UpdateServiceInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const input = parsed.data;
    const sb = getServiceClient();

    const { data: before, error: bErr } = await sb
      .from('client_services')
      .select('*')
      .eq('id', id)
      .single();
    if (bErr || !before) throw new HttpError(404, 'service_not_found');

    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) patch.status = input.status;
    if (input.renewal_at !== undefined) patch.renewal_at = input.renewal_at;
    if (input.monthly_cost_kes !== undefined) patch.monthly_cost_kes = input.monthly_cost_kes;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) {
      res.json({ service: before });
      return;
    }

    const { data: after, error: uErr } = await sb
      .from('client_services')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (uErr || !after) {
      logger.error({ err: uErr }, 'service_update_failed');
      throw new HttpError(500, 'service_update_failed');
    }

    await writeAuditEvent({
      actor_id: req.auth!.sub,
      actor_role: req.auth!.role,
      event_type: 'service_updated',
      entity_type: 'client_service',
      entity_id: id,
      payload_snapshot: { before, after },
    });

    res.json({ service: after });
  },
);
