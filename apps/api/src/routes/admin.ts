import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CreateTicketInput } from '@kws/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { provisioningRateLimit } from '../middleware/rate-limit.js';
import { HttpError } from '../middleware/error.js';
import {
  OnboardClientInput, UpdateClientInput, runOnboarding, supabaseStore,
  updateClient, setClientStatus, resendInvite, sendPasswordReset,
  listRetainerPlans, attachInviteStatus, OnboardError, type Actor,
} from '../services/client-onboarding.js';
import { getServiceClient } from '../lib/supabase.js';
import { writeAuditEvent } from '../services/audit.js';
import { intakeTicket, loadClientContext } from '../services/ticket-intake.js';
import { createDraftProforma, loadActiveRateCard } from '../services/proforma.js';
import { loadQueue, loadClientAccounts, loadCapacitySnapshot, loadReviewQueue, loadCapacityDetail, loadRecentDispatches, loadSlaAudit, loadAgentRegistry } from '../services/admin-views.js';
import { runUptimeChecks } from '../services/uptime.js';
import { runSslChecks } from '../services/ssl.js';
import { runAutonomousSslRenewals } from '../services/ssl-renewal.js';
import { runDomainExpiryAlerts } from '../services/domain-expiry.js';
import { runSlaBreachAlerts } from '../services/sla-alerts.js';
import { loadSiteHealth } from '../services/observability.js';
import { loadRailsHealth } from '../services/rails.js';
import { logger } from '../lib/logger.js';
import { renderEmail, sendEmail } from '../services/email.js';
import { emailTransport, loadEnv } from '../config/env.js';
import { BillingError, markInvoicePaid, recordManualPayment, runCareBilling, setCareStarted } from '../services/billing.js';

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
    const clients = await attachInviteStatus(await loadClientAccounts());
    res.json({ clients });
  },
);

// ----------------------------------------------------------------------------
// GET /v1/admin/retainer-plans - plan options for the onboarding form (KWS-S8-001)
// ----------------------------------------------------------------------------
adminRouter.get(
  '/retainer-plans',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    res.json({ plans: await listRetainerPlans() });
  },
);

// ----------------------------------------------------------------------------
// Client provisioning + lifecycle (KWS-S8-001). Onboarding creates client +
// auth invite + profile transactionally (services/client-onboarding.ts). All
// write ops are admin-only, rate-limited, and audited.
// ----------------------------------------------------------------------------
const onboardActor = (req: Request): Actor => ({ id: req.auth!.sub, role: req.auth!.role });

function sendOnboardError(res: Response, e: unknown): boolean {
  if (e instanceof OnboardError) { res.status(e.statusCode).json({ error: e.code, message: e.message }); return true; }
  return false;
}

adminRouter.post(
  '/clients',
  requireAuth,
  requireRole('admin'),
  provisioningRateLimit,
  async (req: Request, res: Response) => {
    const parsed = OnboardClientInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors }); return; }
    try {
      const result = await runOnboarding(parsed.data, onboardActor(req), supabaseStore());
      res.status(201).json({ ...result, created_at: result.client.created_at });
    } catch (e) { if (!sendOnboardError(res, e)) throw e; }
  },
);

adminRouter.patch(
  '/clients/:id',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !id) throw new HttpError(400, 'missing_client_id');
    const parsed = UpdateClientInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors }); return; }
    try { await updateClient(id, parsed.data, onboardActor(req)); res.json({ ok: true }); }
    catch (e) { if (!sendOnboardError(res, e)) throw e; }
  },
);

adminRouter.post(
  '/clients/:id/status',
  requireAuth,
  requireRole('admin'),
  provisioningRateLimit,
  async (req: Request, res: Response) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !id) throw new HttpError(400, 'missing_client_id');
    const status = (req.body?.status ?? '') as string;
    if (status !== 'active' && status !== 'suspended') { res.status(400).json({ error: 'invalid_status' }); return; }
    try { await setClientStatus(id, status, onboardActor(req)); res.json({ ok: true, status }); }
    catch (e) { if (!sendOnboardError(res, e)) throw e; }
  },
);

adminRouter.post(
  '/clients/:id/resend-invite',
  requireAuth,
  requireRole('admin'),
  provisioningRateLimit,
  async (req: Request, res: Response) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !id) throw new HttpError(400, 'missing_client_id');
    try { await resendInvite(id, onboardActor(req)); res.json({ ok: true }); }
    catch (e) { if (!sendOnboardError(res, e)) throw e; }
  },
);

adminRouter.post(
  '/clients/:id/reset-password',
  requireAuth,
  requireRole('admin'),
  provisioningRateLimit,
  async (req: Request, res: Response) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !id) throw new HttpError(400, 'missing_client_id');
    try { await sendPasswordReset(id, onboardActor(req)); res.json({ ok: true }); }
    catch (e) { if (!sendOnboardError(res, e)) throw e; }
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

// GET /v1/admin/rate-card - active entries, to price a hand-written quote
adminRouter.get(
  '/rate-card',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    res.json({ entries: await loadActiveRateCard() });
  },
);

// POST /v1/admin/tickets/:id/proforma - staff write the quote by hand.
// Used when AI decomposition is off or failed (ticket stuck in 'review').
// Creates the same draft the AI would; it then goes through the normal
// review -> dispatch -> content-hash lock path, so no invariant is bypassed.
const ManualLine = z.object({
  task_name: z.string().trim().min(2).max(160),
  task_description: z.string().trim().max(600).optional(),
  estimated_hours: z.number().positive().max(1000),
  rate_kes_per_hour: z.number().int().positive().max(1_000_000),
});
const ManualProformaInput = z.object({ line_items: z.array(ManualLine).min(1).max(12) });
adminRouter.post(
  '/tickets/:id/proforma',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const parsed = ManualProformaInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() }); return; }
    const ticketId = String(req.params.id);
    const sb = getServiceClient();
    const { data: ticket, error: tErr } = await sb.from('tickets').select('id, ref, client_id, urgency, status').eq('id', ticketId).single();
    if (tErr || !ticket) throw new HttpError(404, 'ticket_not_found');
    if (['approved', 'paid', 'in_progress', 'complete', 'closed'].includes(ticket.status)) throw new HttpError(409, 'ticket_not_quotable');
    const { data: open } = await sb.from('proformas').select('id').eq('ticket_id', ticketId).in('status', ['ai_draft', 'under_review', 'dispatched']).limit(1);
    if (open && open.length > 0) throw new HttpError(409, 'proforma_already_open');

    const ctx = await loadClientContext(ticket.client_id);
    const line_items = parsed.data.line_items.map((l, i) => ({
      task_name: l.task_name,
      task_description: l.task_description ?? null,
      estimated_hours: l.estimated_hours,
      rate_kes_per_hour: l.rate_kes_per_hour,
      amount_kes: Math.round(l.estimated_hours * l.rate_kes_per_hour),
      position: i,
    }));
    const draft = await createDraftProforma({
      ticket_id: ticketId,
      ai: { confidence: 1, flag_reason: null, line_items },
      urgency: ticket.urgency,
      plan: ctx.retainer_plan_name,
    });
    await writeAuditEvent({
      actor_id: req.auth!.sub,
      actor_role: req.auth!.role,
      event_type: 'proforma_manual_drafted',
      entity_type: 'proforma',
      entity_id: draft.id,
      payload_snapshot: { ticket_ref: ticket.ref, line_count: line_items.length, total_kes: draft.total_kes },
    });
    res.status(201).json({ proforma_id: draft.id, ref: draft.ref, total_kes: draft.total_kes });
  },
);

// ============================================================================
// Billing (works before Kipkiren Pay / Todoku): see services/billing.ts.
// Reads: delivery_lead + admin. Money-moving writes: admin only.
// ============================================================================
const billingActor = (req: Request) => ({ id: req.auth!.sub, role: req.auth!.role as 'admin' | 'delivery_lead' });
const billingFail = (res: Response, err: unknown): void => {
  if (err instanceof BillingError) { res.status(err.statusCode).json({ error: err.code, message: err.message }); return; }
  throw err;
};

// GET /v1/admin/billing - proformas awaiting payment, unpaid + recent invoices, care clients
adminRouter.get(
  '/billing',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (_req: Request, res: Response) => {
    const sb = getServiceClient();
    const [awaitingQ, unpaidQ, paidQ, bankQ] = await Promise.all([
      sb.from('proformas').select('id, ref, total_kes, dispatched_at, tickets ( ref, description, clients ( id, business_name, email ) )').eq('status', 'dispatched').order('dispatched_at', { ascending: false }).limit(100),
      sb.from('invoices').select('id, ref, kind, total_kes, issued_at, period_start, clients ( id, business_name )').is('paid_at', null).order('issued_at', { ascending: false }).limit(100),
      sb.from('invoices').select('id, ref, kind, total_kes, issued_at, paid_at, clients ( id, business_name )').not('paid_at', 'is', null).order('paid_at', { ascending: false }).limit(20),
      sb.from('audit_log').select('entity_id, created_at').eq('event_type', 'bank_transfer_requested').order('created_at', { ascending: false }).limit(200),
    ]);
    if (awaitingQ.error) throw awaitingQ.error;
    const bankRequested = new Map<string, string>();
    for (const r of (bankQ.data ?? []) as { entity_id: string; created_at: string }[]) if (!bankRequested.has(r.entity_id)) bankRequested.set(r.entity_id, r.created_at);

    // care clients: needs migration 0009 (care_started_at); degrade without it
    let care: unknown[] = [];
    let careReady = true;
    const careQ = await sb.from('clients').select('id, business_name, status, care_started_at, retainer_plans ( name, monthly_fee_kes )').eq('status', 'active').order('business_name');
    if (careQ.error) careReady = false; else care = careQ.data ?? [];

    res.json({
      awaiting: (awaitingQ.data ?? []).map((p) => ({ ...p, bank_requested_at: bankRequested.get((p as { id: string }).id) ?? null })),
      unpaid_invoices: unpaidQ.data ?? [],
      recent_paid: paidQ.data ?? [],
      care,
      care_ready: careReady,
    });
  },
);

const RecordPaymentInput = z.object({
  amount_kes: z.number().int().positive(),
  reference: z.string().trim().min(2).max(120),
  method: z.enum(['bank', 'mpesa_till', 'cash']).default('bank'),
});
// POST /v1/admin/proformas/:id/record-payment - confirm a bank transfer / till payment
adminRouter.post(
  '/proformas/:id/record-payment',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    const parsed = RecordPaymentInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() }); return; }
    try {
      const out = await recordManualPayment({ proformaId: String(req.params.id), amountKes: parsed.data.amount_kes, reference: parsed.data.reference, method: parsed.data.method, actor: billingActor(req) });
      res.json({ ok: true, ...out });
    } catch (err) { billingFail(res, err); }
  },
);

const MarkPaidInput = z.object({
  reference: z.string().trim().min(2).max(120),
  method: z.enum(['bank', 'mpesa_till', 'cash']).default('bank'),
});
// POST /v1/admin/invoices/:id/mark-paid - record payment of a care / onboarding invoice
adminRouter.post(
  '/invoices/:id/mark-paid',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    const parsed = MarkPaidInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() }); return; }
    try {
      res.json({ ok: true, ...(await markInvoicePaid({ invoiceId: String(req.params.id), method: parsed.data.method, reference: parsed.data.reference, actor: billingActor(req) })) });
    } catch (err) { billingFail(res, err); }
  },
);

// POST /v1/admin/clients/:id/care - start (or stop) monthly care billing for a client
adminRouter.post(
  '/clients/:id/care',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    const start = (req.body as { start?: unknown })?.start !== false;
    try {
      res.json({ ok: true, ...(await setCareStarted({ clientId: String(req.params.id), start, actor: billingActor(req) })) });
    } catch (err) { billingFail(res, err); }
  },
);

// POST /v1/admin/billing/run-care - issue this month's care invoices now (idempotent)
adminRouter.post(
  '/billing/run-care',
  requireAuth,
  requireRole('admin'),
  async (_req: Request, res: Response) => {
    try { res.json(await runCareBilling()); } catch (err) { billingFail(res, err); }
  },
);

// POST /v1/admin/email/test - send one email synchronously and report the
// exact outcome (normal sends are fire-and-forget and only log failures).
// Never echoes credentials: only the transport kind, sender and error text.
adminRouter.post(
  '/email/test',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    const env = loadEnv();
    const to = typeof req.body?.to === 'string' && req.body.to.includes('@') ? req.body.to.trim() : env.STUDIO_NOTIFY_EMAIL;
    const started = Date.now();
    const result = await sendEmail({ to, template: 'studio_alert', variables: { title: 'Test email', body: 'If you can read this, website email is working.' } });
    res.json({
      transport: emailTransport(env),
      from: env.EMAIL_FROM || null,
      reply_to: env.EMAIL_REPLY_TO || null,
      smtp_host: env.SMTP_HOST || null,
      smtp_port: env.SMTP_PORT,
      to,
      ms: Date.now() - started,
      result,
    });
  },
);

// Staff-composed email in the branded template. Recipient is either a client
// (their email on file, optionally about one of their tickets) or, for admins,
// any address. Sent synchronously so the console can show the real outcome;
// every send is recorded in audit_log (subject + first 500 chars, not secrets).
const ComposeInput = z.object({
  client_id: z.string().uuid().optional(),
  to: z.string().trim().toLowerCase().email().max(160).optional(),
  ticket_id: z.string().uuid().optional(),
  subject: z.string().trim().min(3).max(140),
  message: z.string().trim().min(1).max(5000),
  cta: z.enum(['portal', 'none']).default('portal'),
}).refine((v) => !!v.client_id !== !!v.to, { message: 'Choose a client or an email address' });

async function buildComposed(req: Request): Promise<
  | { ok: true; to: string; vars: Record<string, string>; clientId: string | null; ticketRef: string | null }
  | { ok: false; status: number; error: string }
> {
  const parsed = ComposeInput.safeParse(req.body);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? 'invalid_input' };
  const input = parsed.data;
  const sb = getServiceClient();
  let to = input.to ?? '';
  let name = '';
  let clientId: string | null = null;
  if (input.client_id) {
    const { data: c } = await sb.from('clients').select('id, email, contact_name').eq('id', input.client_id).single();
    if (!c?.email) return { ok: false, status: 404, error: 'client_not_found' };
    to = c.email; clientId = c.id; name = (c.contact_name ?? '').split(' ')[0] ?? '';
  } else if (req.auth!.role !== 'admin') {
    return { ok: false, status: 403, error: 'admin_only_free_address' };
  }
  let ticketRef: string | null = null;
  let ticketSummary = '';
  if (input.ticket_id) {
    const { data: t } = await sb.from('tickets').select('id, ref, client_id, description').eq('id', input.ticket_id).single();
    if (!t || (clientId && t.client_id !== clientId)) return { ok: false, status: 404, error: 'ticket_not_found' };
    ticketRef = t.ref;
    ticketSummary = t.description.length > 60 ? `${t.description.slice(0, 57)}...` : t.description;
  }
  const vars: Record<string, string> = {
    subject: ticketRef && !input.subject.includes(ticketRef) ? `${input.subject} · ${ticketRef}` : input.subject,
    title: input.subject,
    body: input.message,
    cta: input.cta,
    account: clientId ? 'yes' : 'no',
    ...(name ? { name } : {}),
    ...(ticketRef ? { ticket_ref: ticketRef, ticket_summary: ticketSummary, cta_label: 'View your request' } : {}),
  };
  return { ok: true, to, vars, clientId, ticketRef };
}

// POST /v1/admin/email/preview - render without sending
adminRouter.post(
  '/email/preview',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const b = await buildComposed(req);
    if (!b.ok) { res.status(b.status).json({ error: b.error }); return; }
    const r = renderEmail('message', b.vars);
    res.json({ to: b.to, subject: r.subject, html: r.html });
  },
);

// POST /v1/admin/email/compose - send it
adminRouter.post(
  '/email/compose',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const b = await buildComposed(req);
    if (!b.ok) { res.status(b.status).json({ error: b.error }); return; }
    const result = await sendEmail({ to: b.to, template: 'message', variables: b.vars, entity_type: b.clientId ? 'client' : 'email', entity_id: b.clientId ?? b.to });
    await writeAuditEvent({
      actor_id: req.auth!.sub,
      actor_role: req.auth!.role,
      event_type: 'client_emailed',
      entity_type: b.clientId ? 'client' : 'email',
      entity_id: b.clientId ?? b.to,
      payload_snapshot: { to: b.to, subject: b.vars.subject, ticket_ref: b.ticketRef, body_preview: (b.vars.body ?? '').slice(0, 500), status: result.status },
    });
    if (result.status === 'sent') { res.json({ ok: true, to: b.to }); return; }
    res.status(502).json({ error: result.status === 'feature_unavailable' ? 'email_not_configured' : 'email_send_failed', detail: result.status === 'failed' ? result.error : undefined });
  },
);
