/**
 * Billing that works before Kipkiren Pay / Todoku are live.
 *
 *   - confirmPayment(): the ONE path that turns a payment into a locked scope:
 *     proforma_approvals INSERT (DB re-verifies the content hash), payment
 *     marked confirmed (immutable), proforma -> approved, ticket -> paid, audit,
 *     then a paid receipt invoice + client email/SMS + studio alert. Used by the
 *     M-Pesa / Paystack webhooks AND by staff recording a bank transfer.
 *   - recordManualPayment(): staff confirm a bank transfer (or till payment)
 *     against a dispatched proforma; goes through confirmPayment.
 *   - Monthly care: careInvoicesDue() (pure) + runCareBilling() issue one
 *     retainer invoice per active client per month, from the month after care
 *     starts; markInvoicePaid() records the payment and sends a receipt.
 *   - startBillingScheduler(): runs care billing a minute after boot and every
 *     6 hours (idempotent: one invoice per client per month).
 *
 * Everything degrades gracefully before migration 0009 is applied: a missing
 * column or enum value surfaces as migration_required instead of a crash.
 */

import { randomUUID } from 'node:crypto';
import { getServiceClient } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { writeAuditEvent } from './audit.js';
import { sendClientSms } from './notifications.js';
import { bankVars, sendClientEmail, sendStudioAlert } from './email.js';

export const VAT_RATE = 0.16;
export const vatOn = (subtotal: number) => Math.ceil(subtotal * VAT_RATE);

export class BillingError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message?: string) {
    super(message ?? code);
  }
}

// Postgres: undefined column / invalid enum text / undefined object
const MIGRATION_CODES = new Set(['42703', '22P02', '42704']);
const needsMigration = (e: { code?: string } | null | undefined) => !!e?.code && MIGRATION_CODES.has(e.code);

/* ------------------------------------------------------------------------- */
/* invoices                                                                  */
/* ------------------------------------------------------------------------- */

export type InvoiceKind = 'retainer' | 'task' | 'onboarding' | 'build';

const yyyymm = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

async function nextInvoiceRef(now = new Date()): Promise<string> {
  const sb = getServiceClient();
  const prefix = `KWS-INV-${yyyymm(now)}-`;
  const { count } = await sb.from('invoices').select('id', { count: 'exact', head: true }).like('ref', `${prefix}%`);
  return `${prefix}${String((count ?? 0) + 1).padStart(4, '0')}`;
}

export interface IssueInvoiceInput {
  clientId: string;
  kind: InvoiceKind;
  subtotal: number;
  vat?: number;
  proformaId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  paymentMethod?: string | null;
  paymentRef?: string | null;
}

export interface InvoiceRow { id: string; ref: string; total_kes: number; subtotal_kes: number; vat_kes: number }

/** Insert an invoice with a fresh ref (retries on a ref collision). */
export async function issueInvoice(input: IssueInvoiceInput): Promise<InvoiceRow> {
  const sb = getServiceClient();
  const vat = input.vat ?? vatOn(input.subtotal);
  const base: Record<string, unknown> = {
    client_id: input.clientId,
    kind: input.kind,
    proforma_id: input.proformaId ?? null,
    period_start: input.periodStart ?? null,
    period_end: input.periodEnd ?? null,
    subtotal_kes: input.subtotal,
    vat_kes: vat,
    total_kes: input.subtotal + vat,
    paid_at: input.paidAt ?? null,
  };
  const extra: Record<string, unknown> = { due_at: input.dueAt ?? null, payment_method: input.paymentMethod ?? null, payment_ref: input.paymentRef ?? null };
  let withExtra = true;
  for (let attempt = 0; attempt < 6; attempt++) {
    const ref = await nextInvoiceRef();
    const row = withExtra ? { ...base, ...extra, ref } : { ...base, ref };
    const { data, error } = await sb.from('invoices').insert(row).select('id, ref, total_kes, subtotal_kes, vat_kes').single();
    if (!error && data) return data as InvoiceRow;
    if (error?.code === '23505' && /ref/.test(error.message ?? '')) continue; // ref race: try the next number
    if (withExtra && needsMigration(error)) { withExtra = false; attempt--; continue; } // pre-0009: drop new columns
    if (needsMigration(error)) throw new BillingError(503, 'migration_required', 'Apply migration 0009 to enable this invoice type.');
    throw new BillingError(500, 'invoice_create_failed', error?.message);
  }
  throw new BillingError(500, 'invoice_ref_exhausted');
}

/* ------------------------------------------------------------------------- */
/* payment confirmation (webhooks + staff-recorded bank transfers)           */
/* ------------------------------------------------------------------------- */

export type Gateway = 'mpesa' | 'paystack' | 'bank';

export interface ConfirmInput {
  gateway: Gateway;
  gateway_ref: string;
  idempotency_key: string;
  amount_kes: number;
  payload_hash: string | null;
  actor_id: string | null;
  actor_role: 'client' | 'admin' | 'delivery_lead' | null;
  payment_method?: string;
}

export async function confirmPayment(input: ConfirmInput): Promise<{ ok: boolean; reason?: string; invoice_ref?: string }> {
  const sb = getServiceClient();

  const { data: pending, error: pErr } = await sb
    .from('payments')
    .select('id, proforma_id, amount_kes, status, gateway, gateway_ref')
    .eq('idempotency_key', input.idempotency_key)
    .maybeSingle();
  if (pErr) return { ok: false, reason: 'payment_lookup_failed' };
  if (!pending) return { ok: false, reason: 'unknown_idempotency_key' };
  if (pending.status === 'confirmed') return { ok: true, reason: 'already_confirmed' };
  if (pending.gateway !== input.gateway) return { ok: false, reason: 'gateway_mismatch' };
  if (pending.amount_kes !== input.amount_kes) return { ok: false, reason: 'amount_mismatch' };

  const { data: pf, error: pfErr } = await sb
    .from('proformas')
    .select('id, ref, status, content_hash, subtotal_kes, discount_kes, vat_kes, total_kes, ticket_id, tickets(client_id)')
    .eq('id', pending.proforma_id)
    .single();
  if (pfErr || !pf) return { ok: false, reason: 'proforma_lookup_failed' };
  if (pf.status !== 'dispatched' || !pf.content_hash) return { ok: false, reason: 'proforma_not_dispatched' };
  const ticketRel = (pf as { tickets: { client_id: string } | { client_id: string }[] | null }).tickets;
  const clientId = Array.isArray(ticketRel) ? ticketRel[0]?.client_id : ticketRel?.client_id;
  if (!clientId) return { ok: false, reason: 'client_not_found' };

  // The migration-0003 trigger re-verifies the content hash at the DB layer.
  const { error: apprErr } = await sb.from('proforma_approvals').insert({
    proforma_id: pending.proforma_id,
    client_id: clientId,
    content_hash_at_approval: pf.content_hash,
    payment_ref: input.gateway_ref,
    idempotency_key: input.idempotency_key,
  });
  if (apprErr) {
    if (apprErr.code === '23505') return { ok: true, reason: 'concurrent_confirmation' };
    logger.error({ err: apprErr, idempotency_key: input.idempotency_key }, 'approval_insert_failed');
    return { ok: false, reason: 'approval_insert_failed' };
  }

  const confirmedAt = new Date().toISOString();
  await sb.from('payments')
    .update({ status: 'confirmed', confirmed_at: confirmedAt, webhook_payload_hash: input.payload_hash })
    .eq('id', pending.id).eq('status', 'pending');
  await sb.from('proformas').update({ status: 'approved' }).eq('id', pending.proforma_id);
  if (pf.ticket_id) await sb.from('tickets').update({ status: 'paid' }).eq('id', pf.ticket_id);

  await writeAuditEvent({
    actor_id: input.actor_id, actor_role: input.actor_role, event_type: 'payment_confirmed', entity_type: 'payment', entity_id: pending.id,
    payload_snapshot: { gateway: input.gateway, gateway_ref: input.gateway_ref, amount_kes: input.amount_kes, proforma_id: pending.proforma_id, method: input.payment_method ?? input.gateway },
  });
  await writeAuditEvent({
    actor_id: input.actor_id, actor_role: input.actor_role, event_type: 'scope_locked', entity_type: 'proforma', entity_id: pending.proforma_id,
    payload_snapshot: { content_hash_at_approval: pf.content_hash, payment_ref: input.gateway_ref, idempotency_key: input.idempotency_key },
  });

  // Paid receipt invoice. Never fails the confirmation: scope is already locked.
  let invoiceRef: string | undefined;
  try {
    const inv = await issueInvoice({
      clientId, kind: 'task', proformaId: pending.proforma_id,
      subtotal: Math.max(0, (pf.subtotal_kes ?? 0) - (pf.discount_kes ?? 0)), vat: pf.vat_kes ?? 0,
      paidAt: confirmedAt, paymentMethod: input.payment_method ?? input.gateway, paymentRef: input.gateway_ref,
    });
    invoiceRef = inv.ref;
  } catch (err) {
    logger.error({ err, proforma_id: pending.proforma_id }, 'receipt_invoice_failed');
  }

  void sendClientSms({ clientId, template: 'kws_payment_confirmed', variables: { ref: pf.ref, amount: String(input.amount_kes), gateway_ref: input.gateway_ref }, entity_type: 'payment', entity_id: pending.id });
  void sendClientEmail({ clientId, template: 'payment_confirmed', variables: { ref: pf.ref, amount: input.amount_kes.toLocaleString(), ...(invoiceRef ? { invoice_ref: invoiceRef } : {}) }, entity_type: 'payment', entity_id: pending.id });
  void sendStudioAlert(`Payment confirmed: ${pf.ref}`, [`KES ${input.amount_kes.toLocaleString()} via ${input.payment_method ?? input.gateway}`, `Reference: ${input.gateway_ref}`, invoiceRef ? `Receipt: ${invoiceRef}` : 'Receipt invoice could not be created; check the logs.'], { type: 'payment', id: pending.id });

  return { ok: true, ...(invoiceRef ? { invoice_ref: invoiceRef } : {}) };
}

/** Staff record a bank transfer (or till / cash) against a dispatched proforma. */
export async function recordManualPayment(input: {
  proformaId: string; amountKes: number; reference: string; method: 'bank' | 'mpesa_till' | 'cash';
  actor: { id: string; role: 'admin' | 'delivery_lead' };
}): Promise<{ invoice_ref?: string }> {
  const sb = getServiceClient();
  const { data: pf } = await sb.from('proformas').select('id, status, total_kes').eq('id', input.proformaId).maybeSingle();
  if (!pf) throw new BillingError(404, 'proforma_not_found');
  if (pf.status !== 'dispatched') throw new BillingError(409, `proforma_invalid_status:${pf.status}`);
  if (pf.total_kes !== input.amountKes) throw new BillingError(400, 'amount_mismatch', `The proforma total is KES ${pf.total_kes.toLocaleString()}.`);

  const idempotencyKey = randomUUID();
  const { error: insErr } = await sb.from('payments').insert({
    proforma_id: input.proformaId, gateway: 'bank', gateway_ref: input.reference, amount_kes: input.amountKes, status: 'pending', idempotency_key: idempotencyKey,
  });
  if (insErr) {
    if (needsMigration(insErr)) throw new BillingError(503, 'migration_required', 'Apply migration 0009 to record bank transfers.');
    throw new BillingError(500, 'payment_insert_failed', insErr.message);
  }
  const res = await confirmPayment({
    gateway: 'bank', gateway_ref: input.reference, idempotency_key: idempotencyKey, amount_kes: input.amountKes,
    payload_hash: null, actor_id: input.actor.id, actor_role: input.actor.role, payment_method: input.method,
  });
  if (!res.ok) throw new BillingError(409, res.reason ?? 'confirm_failed');
  return res.invoice_ref ? { invoice_ref: res.invoice_ref } : {};
}

/* ------------------------------------------------------------------------- */
/* monthly care                                                              */
/* ------------------------------------------------------------------------- */

/** First day of the month (UTC date) that `now` falls in, in Nairobi time (UTC+3). */
export function carePeriod(now: Date): { start: string; end: string; label: string; due: string } {
  const eat = new Date(now.getTime() + 3 * 3600 * 1000);
  const y = eat.getUTCFullYear(), m = eat.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1)), end = new Date(Date.UTC(y, m + 1, 0)), due = new Date(Date.UTC(y, m, 7));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const label = `${start.getUTCDate()} to ${end.getUTCDate()} ${end.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${y}`;
  return { start: iso(start), end: iso(end), label, due: iso(due) };
}

export interface CareClient { id: string; status: string; care_started_at: string | null; monthly_fee_kes: number }

/**
 * Pure: which clients owe a care invoice for the period starting `periodStart`.
 * Billed from the first full month after care starts; active clients with a
 * paid plan only; never twice for the same month.
 */
export function careInvoicesDue(clients: CareClient[], alreadyInvoiced: Set<string>, periodStart: string): CareClient[] {
  return clients.filter((c) =>
    c.status === 'active'
    && c.monthly_fee_kes > 0
    && !!c.care_started_at
    && c.care_started_at.slice(0, 10) < periodStart
    && !alreadyInvoiced.has(c.id));
}

export async function runCareBilling(now = new Date()): Promise<{ issued: string[]; skipped?: string }> {
  const sb = getServiceClient();
  const period = carePeriod(now);
  const { data: rows, error } = await sb
    .from('clients')
    .select('id, status, care_started_at, retainer_plans ( monthly_fee_kes )')
    .not('care_started_at', 'is', null);
  if (error) {
    if (needsMigration(error)) return { issued: [], skipped: 'migration_required' };
    throw new BillingError(500, 'care_billing_query_failed', error.message);
  }
  type Row = { id: string; status: string; care_started_at: string | null; retainer_plans: { monthly_fee_kes: number } | { monthly_fee_kes: number }[] | null };
  const clients: CareClient[] = ((rows ?? []) as Row[]).map((r) => {
    const plan = Array.isArray(r.retainer_plans) ? r.retainer_plans[0] : r.retainer_plans;
    return { id: r.id, status: r.status, care_started_at: r.care_started_at, monthly_fee_kes: plan?.monthly_fee_kes ?? 0 };
  });
  const { data: existing } = await sb.from('invoices').select('client_id').eq('kind', 'retainer').eq('period_start', period.start);
  const done = new Set((existing ?? []).map((e: { client_id: string }) => e.client_id));

  const issued: string[] = [];
  for (const c of careInvoicesDue(clients, done, period.start)) {
    try {
      const inv = await issueInvoice({ clientId: c.id, kind: 'retainer', subtotal: c.monthly_fee_kes, periodStart: period.start, periodEnd: period.end, dueAt: period.due });
      issued.push(inv.ref);
      await writeAuditEvent({ actor_id: null, actor_role: null, event_type: 'invoice_issued', entity_type: 'invoice', entity_id: inv.id, payload_snapshot: { kind: 'retainer', period: period.start, total_kes: inv.total_kes } });
      void sendClientEmail({
        clientId: c.id, template: 'invoice_issued',
        variables: { ref: inv.ref, total: inv.total_kes.toLocaleString(), label: 'Monthly care', period: period.label, due: period.due, ...bankVars() },
        entity_type: 'invoice', entity_id: inv.id,
      });
    } catch (err) {
      // a unique-index hit means another instance already billed this client: fine
      logger.warn({ err, client_id: c.id }, 'care_invoice_skipped');
    }
  }
  if (issued.length) void sendStudioAlert(`${issued.length} care invoice(s) issued`, [`Period: ${period.label}`, ...issued]);
  return { issued };
}

export async function markInvoicePaid(input: { invoiceId: string; method: string; reference: string; actor: { id: string; role: 'admin' | 'delivery_lead' } }): Promise<{ ref: string }> {
  const sb = getServiceClient();
  const { data: inv } = await sb.from('invoices').select('id, ref, client_id, total_kes, paid_at').eq('id', input.invoiceId).maybeSingle();
  if (!inv) throw new BillingError(404, 'invoice_not_found');
  if (inv.paid_at) throw new BillingError(409, 'invoice_already_paid');
  const paidAt = new Date().toISOString();
  let { error } = await sb.from('invoices').update({ paid_at: paidAt, payment_method: input.method, payment_ref: input.reference }).eq('id', inv.id).is('paid_at', null);
  if (needsMigration(error)) ({ error } = await sb.from('invoices').update({ paid_at: paidAt }).eq('id', inv.id).is('paid_at', null));
  if (error) throw new BillingError(500, 'invoice_update_failed', error.message);
  await writeAuditEvent({ actor_id: input.actor.id, actor_role: input.actor.role, event_type: 'invoice_paid', entity_type: 'invoice', entity_id: inv.id, payload_snapshot: { method: input.method, reference: input.reference, total_kes: inv.total_kes } });
  void sendClientEmail({ clientId: inv.client_id, template: 'invoice_paid', variables: { ref: inv.ref, total: inv.total_kes.toLocaleString() }, entity_type: 'invoice', entity_id: inv.id });
  return { ref: inv.ref };
}

export async function setCareStarted(input: { clientId: string; start: boolean; actor: { id: string; role: 'admin' | 'delivery_lead' } }): Promise<{ care_started_at: string | null }> {
  const sb = getServiceClient();
  const value = input.start ? new Date().toISOString() : null;
  const { error } = await sb.from('clients').update({ care_started_at: value }).eq('id', input.clientId);
  if (error) {
    if (needsMigration(error)) throw new BillingError(503, 'migration_required', 'Apply migration 0009 to track care.');
    throw new BillingError(500, 'care_update_failed', error.message);
  }
  await writeAuditEvent({ actor_id: input.actor.id, actor_role: input.actor.role, event_type: input.start ? 'care_started' : 'care_stopped', entity_type: 'client', entity_id: input.clientId, payload_snapshot: { care_started_at: value } });
  return { care_started_at: value };
}

/* ------------------------------------------------------------------------- */
/* scheduler                                                                 */
/* ------------------------------------------------------------------------- */

let timer: NodeJS.Timeout | null = null;
export function startBillingScheduler(): void {
  if (timer || process.env.NODE_ENV === 'test') return;
  const tick = () => { runCareBilling().then((r) => { if (r.issued.length || r.skipped) logger.info(r, 'care_billing_run'); }).catch((err) => logger.error({ err }, 'care_billing_failed')); };
  setTimeout(tick, 60_000).unref();
  timer = setInterval(tick, 6 * 3600 * 1000);
  timer.unref();
}
