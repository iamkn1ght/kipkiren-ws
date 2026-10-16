/**
 * Billing before Kipkiren Pay / Todoku: bank-transfer rail, payment-rail
 * discovery, admin billing gates, care-invoice scheduling rules, SMTP
 * transport selection and the new email templates.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { computeContentHash } from '../src/lib/content-hash.js';

// --- in-memory supabase fake (hoisted) ------------------------------------
const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  inserts: [] as { table: string; row: unknown }[],
}));

vi.mock('../src/lib/supabase.js', () => {
  const make = (table: string) => {
    const result = () => {
      const v = db.tables[table];
      return { data: v ?? null, error: null, count: Array.isArray(v) ? v.length : 0 };
    };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'in', 'is', 'not', 'like', 'update', 'filter']) chain[m] = () => chain;
    chain.insert = (row: unknown) => { db.inserts.push({ table, row }); return chain; };
    chain.single = async () => { const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; };
    chain.maybeSingle = chain.single;
    chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return chain;
  };
  return {
    getServiceClient: () => ({ from: (t: string) => make(t) }),
    createPasswordVerifyClient: () => ({}),
  };
});

const { buildApp } = await import('../src/app.js');
const { mintTestToken, auth } = await import('./helpers.js');
const { careInvoicesDue, carePeriod, vatOn } = await import('../src/services/billing.js');
const { renderEmail } = await import('../src/services/email.js');
const { emailTransport, loadEnv } = await import('../src/config/env.js');

const app = buildApp();
const CLIENT = '11111111-1111-1111-1111-111111111111';
const PF = '22222222-2222-2222-2222-222222222222';
const lines = [{ task_name: 'Home page', amount_kes: 21000, position: 0 }, { task_name: 'M-Pesa checkout', amount_kes: 14000, position: 1 }];

beforeEach(() => {
  db.inserts = [];
  db.tables = {
    proformas: [{ id: PF, ref: 'KWS-2026-000184', status: 'dispatched', content_hash: computeContentHash(lines), total_kes: 40600, ticket_id: 't1', tickets: { client_id: CLIENT } }],
    proforma_line_items: lines,
    audit_log: null,
  };
});

describe('POST /v1/proformas/:id/approve - bank transfer rail', () => {
  it('records the request and returns awaiting_transfer without touching payments', async () => {
    const tok = mintTestToken('client', { clientId: CLIENT });
    const res = await request(app).post(`/v1/proformas/${PF}/approve`).set(auth(tok)).send({ rail: 'bank' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rail: 'bank', status: 'awaiting_transfer', ref: 'KWS-2026-000184', total_kes: 40600 });
    expect(db.inserts.some((i) => i.table === 'payments')).toBe(false);
    expect(db.inserts.some((i) => i.table === 'audit_log' && (i.row as { event_type: string }).event_type === 'bank_transfer_requested')).toBe(true);
  });

  it("refuses another client's proforma", async () => {
    const tok = mintTestToken('client', { clientId: '99999999-9999-9999-9999-999999999999' });
    const res = await request(app).post(`/v1/proformas/${PF}/approve`).set(auth(tok)).send({ rail: 'bank' });
    expect(res.status).toBe(404);
  });

  it('refuses a proforma whose line items no longer match the dispatched hash', async () => {
    db.tables.proforma_line_items = [{ task_name: 'Home page', amount_kes: 1, position: 0 }];
    const tok = mintTestToken('client', { clientId: CLIENT });
    const res = await request(app).post(`/v1/proformas/${PF}/approve`).set(auth(tok)).send({ rail: 'bank' });
    expect(res.status).toBe(409);
  });
});

describe('GET /v1/proformas/rails', () => {
  it('always offers bank transfer and reports gateway readiness', async () => {
    const tok = mintTestToken('client', { clientId: CLIENT });
    const res = await request(app).get('/v1/proformas/rails').set(auth(tok));
    expect(res.status).toBe(200);
    expect(res.body.bank).toBe(true);
    expect(typeof res.body.mpesa).toBe('boolean');
    expect(typeof res.body.card).toBe('boolean');
  });
});

describe('admin billing - role gates', () => {
  it('lets delivery leads read billing but not record payments', async () => {
    const lead = mintTestToken('delivery_lead');
    expect((await request(app).get('/v1/admin/billing').set(auth(lead))).status).toBe(200);
    expect((await request(app).post(`/v1/admin/proformas/${PF}/record-payment`).set(auth(lead)).send({ amount_kes: 40600, reference: 'BANKREF1' })).status).toBe(403);
    expect((await request(app).post('/v1/admin/billing/run-care').set(auth(lead))).status).toBe(403);
  });
  it('blocks clients entirely', async () => {
    const tok = mintTestToken('client', { clientId: CLIENT });
    expect((await request(app).get('/v1/admin/billing').set(auth(tok))).status).toBe(403);
  });
  it('rejects a recorded amount that differs from the proforma total', async () => {
    const admin = mintTestToken('admin');
    const res = await request(app).post(`/v1/admin/proformas/${PF}/record-payment`).set(auth(admin)).send({ amount_kes: 40000, reference: 'BANKREF1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('amount_mismatch');
  });
});

describe('care billing rules (pure)', () => {
  const base = { status: 'active', monthly_fee_kes: 7500 };
  it('bills from the first full month after care starts, once per month', () => {
    const clients = [
      { ...base, id: 'started-sept', care_started_at: '2026-09-20T10:00:00Z' },
      { ...base, id: 'started-this-month', care_started_at: '2026-10-03T10:00:00Z' },
      { ...base, id: 'no-care', care_started_at: null },
      { ...base, id: 'suspended', status: 'suspended', care_started_at: '2026-01-01T00:00:00Z' },
      { ...base, id: 'enterprise', monthly_fee_kes: 0, care_started_at: '2026-01-01T00:00:00Z' },
      { ...base, id: 'already', care_started_at: '2026-01-01T00:00:00Z' },
    ];
    const due = careInvoicesDue(clients, new Set(['already']), '2026-10-01').map((c) => c.id);
    expect(due).toEqual(['started-sept']);
  });
  it('uses the Nairobi calendar month', () => {
    // 22:30 UTC on 31 Oct is already 1 Nov in Nairobi
    expect(carePeriod(new Date('2026-10-31T22:30:00Z')).start).toBe('2026-11-01');
    expect(carePeriod(new Date('2026-10-15T08:00:00Z'))).toMatchObject({ start: '2026-10-01', end: '2026-10-31', due: '2026-10-07' });
  });
  it('adds 16% VAT with ceiling rounding', () => {
    expect(vatOn(7500)).toBe(1200);
    expect(vatOn(3501)).toBe(561);
  });
});

describe('email transport + templates', () => {
  it('picks SMTP when only the SMTP trio is set, HTTP when the API pair is set, none without a sender', () => {
    const env = loadEnv();
    expect(emailTransport({ ...env, EMAIL_FROM: 'studio@kipkiren.co.ke', EMAIL_API_URL: '', EMAIL_API_KEY: '', SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'u', SMTP_PASS: 'p' })).toBe('smtp');
    expect(emailTransport({ ...env, EMAIL_FROM: 'studio@kipkiren.co.ke', EMAIL_API_URL: 'https://x', EMAIL_API_KEY: 'k', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' })).toBe('http');
    expect(emailTransport({ ...env, EMAIL_FROM: '', SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'u', SMTP_PASS: 'p' })).toBeNull();
  });
  it('bank instructions show the account when configured, and promise details otherwise', () => {
    const withBank = renderEmail('bank_transfer_instructions', { ref: 'KWS-2026-000184', total: '40,600', bank_name: 'NCBA', bank_account_name: 'Kipkiren Teknolojia Ltd', bank_account: '1234567890' });
    expect(withBank.html).toContain('1234567890');
    expect(withBank.text).toContain('Reference: KWS-2026-000184');
    const without = renderEmail('bank_transfer_instructions', { ref: 'KWS-2026-000184', total: '40,600' });
    expect(without.text).toContain('bank details will follow');
  });
  it('escapes client-controlled values in alerts and welcomes', () => {
    expect(renderEmail('welcome', { name: '<b>x</b>' }).html).not.toContain('<b>x</b>');
    expect(renderEmail('studio_alert', { title: 'T', body: '<script>1</script>' }).html).not.toContain('<script>');
  });
  it('payment_confirmed mentions the receipt invoice when there is one', () => {
    expect(renderEmail('payment_confirmed', { ref: 'KWS-2026-000184', amount: '40,600', invoice_ref: 'KWS-INV-202610-0001' }).text).toContain('KWS-INV-202610-0001');
  });
});

describe('POST /v1/admin/tickets/:id/proforma - staff-written quote', () => {
  const TICKET = '33333333-3333-3333-3333-333333333333';
  const body = { line_items: [{ task_name: 'Home page', estimated_hours: 6, rate_kes_per_hour: 3500 }] };
  it('is staff-only', async () => {
    const tok = mintTestToken('client', { clientId: CLIENT });
    expect((await request(app).post(`/v1/admin/tickets/${TICKET}/proforma`).set(auth(tok)).send(body)).status).toBe(403);
  });
  it('validates the lines', async () => {
    const lead = mintTestToken('delivery_lead');
    const res = await request(app).post(`/v1/admin/tickets/${TICKET}/proforma`).set(auth(lead)).send({ line_items: [] });
    expect(res.status).toBe(400);
  });
  it('refuses a second quote while one is still open', async () => {
    db.tables.tickets = [{ id: TICKET, ref: 'KWS-T-0009', client_id: CLIENT, urgency: 'standard', status: 'review' }];
    const lead = mintTestToken('delivery_lead');
    const res = await request(app).post(`/v1/admin/tickets/${TICKET}/proforma`).set(auth(lead)).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('proforma_already_open');
  });
});
