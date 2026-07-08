import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CreateTicketInput } from '@kws/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { getServiceClient } from '../lib/supabase.js';
import { writeAuditEvent } from '../services/audit.js';
import { intakeTicket } from '../services/ticket-intake.js';
import { loadQueue, loadClientAccounts, loadCapacitySnapshot, loadReviewQueue, loadCapacityDetail, loadRecentDispatches, loadSlaAudit, loadAgentRegistry } from '../services/admin-views.js';
import { runUptimeChecks } from '../services/uptime.js';
import { runSslChecks } from '../services/ssl.js';
import { runAutonomousSslRenewals } from '../services/ssl-renewal.js';
import { runDomainExpiryAlerts } from '../services/domain-expiry.js';
import { runSlaBreachAlerts } from '../services/sla-alerts.js';
import { loadSiteHealth } from '../services/observability.js';
import { loadRailsHealth } from '../services/rails.js';
import { logger } from '../lib/logger.js';

export const adminRouter: Router = Router();

// ----------------------------------------------------------------------------
// GET /v1/admin/queue - SLA-sorted ticket queue
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
// GET /v1/admin/clients - client accounts summary
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
// GET /v1/admin/recent-dispatches - last 5 dispatched proformas for dashboard
// ----------------------------------------------------------------------------
adminRouter.get(
  '/recent-dispatches',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const dispatches = await loadRecentDispatches();
    res.json({ dispatches });
  },
);

// ----------------------------------------------------------------------------
// GET /v1/admin/review-queue - proformas awaiting review with line items
// ----------------------------------------------------------------------------
adminRouter.get(
  '/review-queue',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const items = await loadReviewQueue();
    res.json({ items });
  },
);

// ----------------------------------------------------------------------------
// GET /v1/admin/capacity - snapshot for the Capacity tab
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
// GET /v1/admin/capacity-detail - per-staff utilisation, SLA trend, deadlines
// ----------------------------------------------------------------------------
adminRouter.get(
  '/capacity-detail',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const detail = await loadCapacityDetail();
    res.json(detail);
  },
);

// ----------------------------------------------------------------------------
// GET /v1/admin/agents - registered AI agents (KWS-S9-001)
// ----------------------------------------------------------------------------
adminRouter.get(
  '/agents',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const agents = await loadAgentRegistry();
    res.json({ agents });
  },
);

// ----------------------------------------------------------------------------
// GET /v1/admin/sla-audit?window=30 - SLA compliance report (KWS-S8-003)
// Breach rate by client, category and plan over a trailing window.
// ----------------------------------------------------------------------------
adminRouter.get(
  '/sla-audit',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const raw = Number(req.query.window);
    const windowDays = Number.isFinite(raw) && raw > 0 && raw <= 365 ? Math.floor(raw) : 30;
    const report = await loadSlaAudit(windowDays);
    res.json(report);
  },
);

// ----------------------------------------------------------------------------
// PUT /v1/admin/rate-card/:id - update a rate card entry
// KWS-SEC-009 - writes require STRICT admin role, not delivery_lead.
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
    const id = String(req.params.id);
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

// ----------------------------------------------------------------------------
// POST /v1/admin/uptime-check - run uptime checks on all hosting services
// Pings each hosting service domain and records results in metadata.
// Can be called manually or wired to a cron schedule.
// ----------------------------------------------------------------------------
adminRouter.post(
  '/uptime-check',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const results = await runUptimeChecks();
    res.json({ checked: results.length, results });
  },
);

// ----------------------------------------------------------------------------
// GET /v1/admin/site-health - per-site health summary + anomalies (KWS-S9-006)
// ----------------------------------------------------------------------------
adminRouter.get(
  '/site-health',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const sites = await loadSiteHealth();
    res.json({ sites });
  },
);

// ----------------------------------------------------------------------------
// POST /v1/admin/ssl-check - probe + persist SSL state for domain services
// (KWS-S6-003). Manual trigger or future cron, mirrors uptime-check.
// ----------------------------------------------------------------------------
adminRouter.post(
  '/ssl-check',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const results = await runSslChecks();
    res.json({ checked: results.length, results });
  },
);

// ----------------------------------------------------------------------------
// POST /v1/admin/ssl-renewal-run - autonomous SSL renewal pass (KWS-S9-005).
// Plans a renewal for every due certificate and, only when AGENT_DNS_EXECUTION
// is enabled AND the S9-004 guard allows, executes it; otherwise escalates.
// Inert (plan-only) while the flag is off - which is the default.
// ----------------------------------------------------------------------------
adminRouter.post(
  '/ssl-renewal-run',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const summary = await runAutonomousSslRenewals();
    res.json(summary);
  },
);

// ----------------------------------------------------------------------------
// POST /v1/admin/domain-expiry-scan - fire due domain-expiry SMS alerts
// (KWS-S6-005). SMS send is gated on Todoku creds; returns the scan summary.
// ----------------------------------------------------------------------------
adminRouter.post(
  '/domain-expiry-scan',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const summary = await runDomainExpiryAlerts();
    res.json(summary);
  },
);

// ----------------------------------------------------------------------------
// POST /v1/admin/sla-breach-scan - notify clients of elapsed-SLA tickets
// (KWS-S9-003, 5th template). Deduped via audit_log; SMS gated on Todoku.
// ----------------------------------------------------------------------------
adminRouter.post(
  '/sla-breach-scan',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const summary = await runSlaBreachAlerts();
    res.json(summary);
  },
);

// ----------------------------------------------------------------------------
// GET /v1/admin/rails - platform-rails health, KWS-side view.
// ?probe=1 also live-pings the rails KWS has a base URL for (KP, Todoku).
// ----------------------------------------------------------------------------
adminRouter.get(
  '/rails',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const probe = req.query.probe === '1';
    const result = await loadRailsHealth(probe);
    res.json(result);
  },
);

// ----------------------------------------------------------------------------
// POST /v1/admin/tickets - raise a ticket ON BEHALF OF a client.
//
// Delivery lead / admin can open a ticket for a client (e.g. work scoped on a
// call, or a proactive recommendation). It runs the SAME intake pipeline as a
// client-submitted ticket - AI decomposition → draft proforma - so the client
// then sees the proforma in their portal and approves it. The proforma
// invariant is unchanged: nothing executes until the client approves.
// ----------------------------------------------------------------------------
const AdminCreateTicketInput = CreateTicketInput.extend({
  client_id: z.string().uuid(),
});

adminRouter.post(
  '/tickets',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const parsed = AdminCreateTicketInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const { client_id, ...ticketInput } = parsed.data;

    // Confirm the client exists before intake (intakeTicket also 404s, but a
    // clear up-front check keeps the error obvious).
    const sb = getServiceClient();
    const { data: client, error: cErr } = await sb
      .from('clients')
      .select('id')
      .eq('id', client_id)
      .single();
    if (cErr || !client) throw new HttpError(404, 'client_not_found');

    const result = await intakeTicket({
      clientId: client_id,
      submittedBy: req.auth!.sub,
      actorRole: req.auth!.role,
      input: ticketInput,
    });
    res.status(201).json(result);
  },
);
