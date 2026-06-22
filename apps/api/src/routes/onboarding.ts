import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { getServiceClient } from '../lib/supabase.js';
import { writeAuditEvent } from '../services/audit.js';
import { logger } from '../lib/logger.js';

export const onboardingRouter: Router = Router();

// Onboarding fee schedule per plan tier (KES, pre-VAT)
const ONBOARDING_FEES: Record<string, number> = {
  Starter: 3500,
  Growth: 5000,
  Business: 7500,
  Enterprise: 9999,
};

// ----------------------------------------------------------------------------
// POST /v1/onboarding/invoice - generate a one-time onboarding fee invoice
//
// Called by the admin when onboarding a new client. Creates an invoice with
// kind='onboarding'. Returns the generated invoice.
// ----------------------------------------------------------------------------
const OnboardingInvoiceInput = z.object({
  client_id: z.string().uuid(),
  fee_override_kes: z.number().int().positive().optional(),
});

onboardingRouter.post(
  '/invoice',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    const parsed = OnboardingInvoiceInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const { client_id, fee_override_kes } = parsed.data;
    const sb = getServiceClient();

    // Load client + plan
    const { data: client, error: cErr } = await sb
      .from('clients')
      .select('id, business_name, retainer_plans ( name )')
      .eq('id', client_id)
      .single();
    if (cErr || !client) throw new HttpError(404, 'client_not_found');

    type ClientRow = { id: string; business_name: string; retainer_plans: { name: string } | { name: string }[] | null };
    const c = client as ClientRow;
    const planRel = Array.isArray(c.retainer_plans) ? c.retainer_plans[0] : c.retainer_plans;
    const planName = planRel?.name ?? 'Starter';

    // Check if onboarding invoice already exists
    const { data: existing } = await sb
      .from('invoices')
      .select('id')
      .eq('client_id', client_id)
      .eq('kind', 'onboarding')
      .limit(1);
    if (existing && existing.length > 0) {
      throw new HttpError(409, 'onboarding_invoice_already_exists');
    }

    const subtotal = fee_override_kes ?? ONBOARDING_FEES[planName] ?? 3500;
    const vat = Math.ceil(subtotal * 0.16);

    // Generate invoice ref
    const { data: countData } = await sb
      .from('invoices')
      .select('id')
      .order('issued_at', { ascending: false })
      .limit(1);
    const refNum = (countData?.length ?? 0) + 1;
    const ref = `KWS-ONB-${String(refNum).padStart(3, '0')}`;

    const { data: invoice, error: iErr } = await sb
      .from('invoices')
      .insert({
        ref,
        client_id,
        kind: 'onboarding',
        subtotal_kes: subtotal,
        vat_kes: vat,
        total_kes: subtotal + vat,
      })
      .select('*')
      .single();
    if (iErr || !invoice) {
      logger.error({ err: iErr }, 'onboarding_invoice_create_failed');
      throw new HttpError(500, 'onboarding_invoice_create_failed');
    }

    await writeAuditEvent({
      actor_id: req.auth!.sub,
      actor_role: req.auth!.role,
      event_type: 'onboarding_invoice_created',
      entity_type: 'invoice',
      entity_id: invoice.id,
      payload_snapshot: { client_id, plan: planName, subtotal, vat, ref },
    });

    res.status(201).json({ invoice });
  },
);

// ----------------------------------------------------------------------------
// POST /v1/onboarding/consent - record KDPA consent for the authenticated user
//
// Sets consent_given_at on the user record and writes an audit event.
// Must be called before any personal data processing for the client.
// ----------------------------------------------------------------------------
onboardingRouter.post(
  '/consent',
  requireAuth,
  async (req: Request, res: Response) => {
    const sb = getServiceClient();
    const userId = req.auth!.sub;

    const { data: user, error: uErr } = await sb
      .from('users')
      .select('id, consent_given_at')
      .eq('id', userId)
      .single();
    if (uErr || !user) throw new HttpError(404, 'user_not_found');

    if (user.consent_given_at) {
      res.json({ consent_given_at: user.consent_given_at, already_consented: true });
      return;
    }

    const now = new Date().toISOString();
    await sb.from('users').update({ consent_given_at: now }).eq('id', userId);

    await writeAuditEvent({
      actor_id: userId,
      actor_role: req.auth!.role,
      event_type: 'consent_recorded',
      entity_type: 'user',
      entity_id: userId,
      payload_snapshot: { consent_given_at: now, policy_version: '1.0' },
    });

    res.json({ consent_given_at: now, already_consented: false });
  },
);

// ----------------------------------------------------------------------------
// GET /v1/onboarding/privacy-policy - serve the KDPA privacy policy metadata
//
// Returns the policy version and summary. The full HTML will be served
// at ws.kipkiren.co.ke/privacy when the legal review is complete.
// ----------------------------------------------------------------------------
onboardingRouter.get(
  '/privacy-policy',
  async (_req: Request, res: Response) => {
    res.json({
      version: '1.0',
      effective_date: '2026-05-01',
      status: 'draft',
      url: 'https://ws.kipkiren.co.ke/privacy',
      summary: {
        data_controller: 'Kipkiren Teknolojia',
        processing_basis: 'Contract performance (KDPA 2019 §30)',
        data_categories: ['Contact details (name, email, phone)', 'Business information', 'Service usage and billing records'],
        retention: 'Invoices 7 years (tax requirement), operational data 2 years after account closure',
        dsar_email: 'privacy@kipkiren.co.ke',
        dpo_contact: 'Chamia Kigen, CEO - chamia@kipkiren.co.ke',
      },
    });
  },
);

// ----------------------------------------------------------------------------
// GET /v1/onboarding/privacy - KDPA Privacy Policy HTML page
// Served as HTML so it can be linked from the portal footer.
// Legal review pending (KWS-S7-005) - this is the draft.
// ----------------------------------------------------------------------------
onboardingRouter.get(
  '/privacy',
  (_req: Request, res: Response) => {
    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Privacy Policy - Kipkiren Web Services</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; }
  .meta { font-size: 13px; color: #666; margin-bottom: 24px; }
  .draft { background: #fff3cd; border-left: 3px solid #ffc107; padding: 10px 14px; font-size: 13px; color: #856404; margin-bottom: 20px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
  a { color: #0D5C4E; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #999; }
</style>
</head>
<body>
<h1>Privacy Policy</h1>
<p class="meta">Kipkiren Web Services - a product of Kipkiren Teknolojia<br/>Version 1.0 (Draft) · Effective date: pending legal review</p>

<div class="draft"><strong>DRAFT</strong> - This policy is pending legal review (KWS-S7-005). Do not publish until approved by legal counsel and the CEO.</div>

<h2>1. Data Controller</h2>
<p>Kipkiren Teknolojia ("we", "us") operates Kipkiren Web Services at <a href="https://ws.kipkiren.co.ke">ws.kipkiren.co.ke</a>. We are the data controller for personal data processed through this platform.</p>

<h2>2. Data We Collect</h2>
<ul>
<li><strong>Contact details:</strong> Name, email address, phone number - collected at account registration.</li>
<li><strong>Business information:</strong> Business name, retainer plan selection, service subscriptions.</li>
<li><strong>Service usage:</strong> Tickets submitted, proformas reviewed, payment records, invoice history.</li>
<li><strong>Technical data:</strong> IP address, browser type, session tokens - collected automatically for security and service delivery.</li>
</ul>

<h2>3. Legal Basis for Processing</h2>
<p>We process your personal data on the basis of <strong>contract performance</strong> (Kenya Data Protection Act 2019, Section 30). Your data is necessary to deliver the web services, cloud provisioning, hosting, and related services you have subscribed to.</p>

<h2>4. How We Use Your Data</h2>
<ul>
<li>Deliver and manage your subscribed services (hosting, domains, SEO, social media management)</li>
<li>Generate proformas and process payments via M-Pesa (Kipkiren Pay) and Paystack</li>
<li>Communicate about service status, SLA compliance, and billing</li>
<li>Maintain audit trails for billing dispute resolution</li>
</ul>

<h2>5. Data Sharing</h2>
<p>We do not sell your personal data. We share data only with:</p>
<ul>
<li><strong>Kipkiren Pay / LipaPlus:</strong> M-Pesa payment processing (phone number + amount)</li>
<li><strong>Paystack:</strong> Card payment processing (handled by Paystack - we never see raw card data)</li>
<li><strong>Supabase:</strong> Database hosting in the EU (eu-west-1, Ireland). This is a cross-border transfer of your data outside Kenya, made under the safeguards in the Kenya Data Protection Act 2019 (Sections 48&ndash;49).</li>
<li><strong>Google Cloud / Microsoft:</strong> When provisioning cloud services on your behalf (S5)</li>
</ul>

<h2>6. Data Retention</h2>
<ul>
<li><strong>Invoices and payment records:</strong> 7 years (Kenya Revenue Authority tax requirement)</li>
<li><strong>Proforma approvals and audit logs:</strong> 7 years (legal records - INSERT-only, never modified)</li>
<li><strong>Operational data (tickets, service configs):</strong> 2 years after account closure</li>
<li><strong>Account profile:</strong> Retained while account is active; deleted within 30 days of closure request</li>
</ul>

<h2>7. Your Rights (KDPA 2019)</h2>
<p>You have the right to:</p>
<ul>
<li><strong>Access</strong> your personal data - use the "Export my data" feature in the portal, or email us</li>
<li><strong>Rectification</strong> - request correction of inaccurate data</li>
<li><strong>Erasure</strong> - request deletion of your data (subject to legal retention requirements)</li>
<li><strong>Data portability</strong> - receive your data in a structured, machine-readable format (JSON)</li>
<li><strong>Object to processing</strong> - where processing is based on legitimate interest</li>
</ul>

<h2>8. Data Subject Access Requests</h2>
<p>To exercise any of these rights, email <a href="mailto:privacy@kipkiren.co.ke">privacy@kipkiren.co.ke</a> or use the Data Export feature in your client portal. We will respond within 30 days.</p>

<h2>9. Security</h2>
<p>We implement appropriate technical and organisational measures including: RS256 JWT authentication, row-level security on all database tables, encrypted connections (TLS), and INSERT-only audit logs that cannot be modified after creation.</p>

<h2>10. Contact</h2>
<p>Data Protection Officer: Chamia Kigen, CEO<br/>Email: <a href="mailto:chamia@kipkiren.co.ke">chamia@kipkiren.co.ke</a><br/>Privacy enquiries: <a href="mailto:privacy@kipkiren.co.ke">privacy@kipkiren.co.ke</a></p>

<footer>Kipkiren Teknolojia · Nairobi, Kenya · ws.kipkiren.co.ke</footer>
</body>
</html>`);
  },
);

// ----------------------------------------------------------------------------
// GET /v1/onboarding/dsar - Data Subject Access Request (KDPA 2019 §35)
//
// Returns all personal data held for the authenticated client user in a
// structured JSON response. Covers: user profile, client record, tickets,
// proformas with line items, invoices, services, and audit events.
//
// KDPA requires response within 30 days. This endpoint returns data
// immediately - the 30-day SLA is for the admin to process edge cases.
// ----------------------------------------------------------------------------
onboardingRouter.get(
  '/dsar',
  requireAuth,
  async (req: Request, res: Response) => {
    const sb = getServiceClient();
    const userId = req.auth!.sub;
    const clientId = req.auth!.clientId;

    // User profile
    const { data: user } = await sb
      .from('users')
      .select('id, full_name, email, role, consent_given_at, created_at')
      .eq('id', userId)
      .single();

    // Client record (if applicable)
    let clientRecord = null;
    let tickets = null;
    let invoices = null;
    let services = null;

    if (clientId) {
      const { data: client } = await sb
        .from('clients')
        .select('id, business_name, contact_name, email, phone, status, created_at')
        .eq('id', clientId)
        .single();
      clientRecord = client;

      // Tickets
      const { data: tix } = await sb
        .from('tickets')
        .select('id, ref, description, category, urgency, status, sla_deadline_at, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      tickets = tix;

      // Proformas with line items (via tickets)
      const ticketIds = (tix ?? []).map((t) => t.id);
      let proformas: unknown[] = [];
      if (ticketIds.length > 0) {
        const { data: pfs } = await sb
          .from('proformas')
          .select('id, ref, status, subtotal_kes, vat_kes, total_kes, created_at, proforma_line_items ( task_name, estimated_hours, amount_kes )')
          .in('ticket_id', ticketIds);
        proformas = pfs ?? [];
      }

      // Invoices
      const { data: inv } = await sb
        .from('invoices')
        .select('id, ref, kind, subtotal_kes, vat_kes, total_kes, issued_at, paid_at')
        .eq('client_id', clientId)
        .order('issued_at', { ascending: false });
      invoices = inv;

      // Services
      const { data: svc } = await sb
        .from('client_services')
        .select('id, service_type, status, renewal_at, monthly_cost_kes, created_at')
        .eq('client_id', clientId);
      services = svc;

      // Audit events for this user
      const { data: audit } = await sb
        .from('audit_log')
        .select('id, event_type, entity_type, entity_id, created_at')
        .eq('actor_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);

      await writeAuditEvent({
        actor_id: userId,
        actor_role: req.auth!.role,
        event_type: 'dsar_fulfilled',
        entity_type: 'user',
        entity_id: userId,
        payload_snapshot: { requested_at: new Date().toISOString() },
      });

      res.json({
        exported_at: new Date().toISOString(),
        data_controller: 'Kipkiren Teknolojia',
        dpo_contact: 'privacy@kipkiren.co.ke',
        user,
        client: clientRecord,
        tickets,
        proformas,
        invoices,
        services,
        audit_events: audit ?? [],
      });
      return;
    }

    // Non-client user (admin/delivery) - return profile only
    res.json({
      exported_at: new Date().toISOString(),
      data_controller: 'Kipkiren Teknolojia',
      dpo_contact: 'privacy@kipkiren.co.ke',
      user,
    });
  },
);
