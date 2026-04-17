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
// POST /v1/onboarding/invoice — generate a one-time onboarding fee invoice
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
// POST /v1/onboarding/consent — record KDPA consent for the authenticated user
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
// GET /v1/onboarding/privacy-policy — serve the KDPA privacy policy metadata
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
        dpo_contact: 'Chamia Kigen, CEO — chamia@kipkiren.co.ke',
      },
    });
  },
);
