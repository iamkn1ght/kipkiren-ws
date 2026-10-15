/**
 * Admin billing - the money desk that works before Kipkiren Pay / Todoku.
 *
 *  - Awaiting payment: dispatched proformas. When a bank transfer reflects,
 *    an admin records it here; that runs the same scope-lock path as the
 *    gateway webhooks and emails the client a receipt automatically.
 *  - Unpaid invoices: care (retainer) invoices issued monthly; mark paid.
 *  - Care: start/stop the monthly care plan per client; run billing now.
 * Delivery leads can read everything; money-moving actions are admin-only
 * (the API enforces this too).
 */

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useAuth, useApi } from './auth.tsx';
import { ApiError } from './api.ts';
import { SkelList, EmptyState } from './portalUi.tsx';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;
const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
const fmtDate = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
type Rel<T> = T | T[] | null;
const one = <T,>(r: Rel<T> | undefined): T | null => (Array.isArray(r) ? r[0] ?? null : r ?? null);

interface ClientRef { id: string; business_name: string; email?: string }
interface Awaiting { id: string; ref: string; total_kes: number; dispatched_at: string | null; bank_requested_at: string | null; tickets: Rel<{ ref: string; description: string; clients: Rel<ClientRef> }> }
interface Invoice { id: string; ref: string; kind: string; total_kes: number; issued_at: string; paid_at?: string | null; period_start?: string | null; clients: Rel<ClientRef> }
interface CareClient { id: string; business_name: string; status: string; care_started_at: string | null; retainer_plans: Rel<{ name: string; monthly_fee_kes: number }> }
interface Billing { awaiting: Awaiting[]; unpaid_invoices: Invoice[]; recent_paid: Invoice[]; care: CareClient[]; care_ready: boolean }

const METHODS = [['bank', 'Bank transfer'], ['mpesa_till', 'M-Pesa till/paybill'], ['cash', 'Cash / cheque']] as const;
type Method = typeof METHODS[number][0];

const errMsg = (e: unknown) => {
  if (e instanceof ApiError) {
    if (e.code === 'migration_required') return 'Database update pending: run migration 0009 in Supabase, then retry.';
    if (e.code === 'amount_mismatch') return 'Amount must equal the proforma total exactly.';
    return e.message || e.code;
  }
  return 'That did not go through. Please try again.';
};

export function AdminBilling() {
  const call = useApi();
  const { session } = useAuth();
  const isAdmin = session?.claims.role === 'admin';
  const [data, setData] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  // inline "record payment" / "mark paid" form: target id + fields
  const [form, setForm] = useState<{ id: string; kind: 'proforma' | 'invoice'; reference: string; method: Method } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await call<Billing>('/v1/admin/billing')); } catch { setData(null); } finally { setLoading(false); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<string>) => {
    if (busy) return; setBusy(true); setToast(null);
    try { setToast({ ok: true, msg: await fn() }); setForm(null); await load(); }
    catch (e) { setToast({ ok: false, msg: errMsg(e) }); }
    finally { setBusy(false); }
  };

  const recordPayment = (p: Awaiting) => act(async () => {
    const r = await call<{ invoice_ref?: string | null }>(`/v1/admin/proformas/${p.id}/record-payment`, { method: 'POST', body: { amount_kes: p.total_kes, reference: form!.reference.trim(), method: form!.method } });
    return `${p.ref} confirmed. Scope locked${r.invoice_ref ? `, receipt ${r.invoice_ref} emailed` : ''}.`;
  });
  const markPaid = (inv: Invoice) => act(async () => {
    await call(`/v1/admin/invoices/${inv.id}/mark-paid`, { method: 'POST', body: { reference: form!.reference.trim(), method: form!.method } });
    return `${inv.ref} marked paid. Receipt emailed.`;
  });
  const setCare = (c: CareClient, start: boolean) => act(async () => {
    await call(`/v1/admin/clients/${c.id}/care`, { method: 'POST', body: { start } });
    return start ? `Care started for ${c.business_name}. First invoice issues next month.` : `Care stopped for ${c.business_name}.`;
  });
  const runCare = () => act(async () => {
    const r = await call<{ issued: string[]; skipped?: string }>('/v1/admin/billing/run-care', { method: 'POST' });
    if (r.skipped) return `Care billing skipped: ${r.skipped.replace(/_/g, ' ')}.`;
    return r.issued.length ? `${r.issued.length} care invoice(s) issued and emailed: ${r.issued.join(', ')}.` : 'Nothing new to bill: every care client is already invoiced this month.';
  });

  const refForm = (id: string, kind: 'proforma' | 'invoice', onSubmit: () => void) => form?.id === id && (
    <div className="klp-portal-actions" style={cssVars({ flexWrap: 'wrap', alignItems: 'flex-end', gap: 10, marginTop: 12 })}>
      <div style={cssVars({ minWidth: 200, flex: 1 })}>
        <label className="klp-field-label" htmlFor={`ref-${id}`}>Transaction reference</label>
        <input id={`ref-${id}`} className="klp-field-input" autoFocus placeholder="Bank / M-Pesa ref" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} disabled={busy} />
      </div>
      <div style={cssVars({ minWidth: 170 })}>
        <label className="klp-field-label" htmlFor={`m-${id}`}>Method</label>
        <select id={`m-${id}`} className="klp-field-input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Method })} disabled={busy}>
          {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <button type="button" className="klp-btn primary" disabled={busy || form.reference.trim().length < 2} onClick={onSubmit}>{busy ? 'Saving...' : kind === 'proforma' ? 'Confirm payment' : 'Mark paid'}</button>
      <button type="button" className="klp-btn ghost" disabled={busy} onClick={() => setForm(null)}>Cancel</button>
    </div>
  );

  if (loading && !data) return <SkelList rows={5} />;
  if (!data) return <EmptyState title="Billing unavailable" sub="Could not load billing right now. Refresh to try again." />;

  const owed = data.awaiting.reduce((s, p) => s + p.total_kes, 0) + data.unpaid_invoices.reduce((s, i) => s + i.total_kes, 0);
  const careActive = data.care.filter((c) => c.care_started_at);
  const mrr = careActive.reduce((s, c) => s + (one(c.retainer_plans)?.monthly_fee_kes ?? 0), 0);

  return (
    <div>
      <div className="klp-kpis" style={cssVars({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginBottom: 22 })}>
        <div className="klp-card klp-panel"><div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Outstanding</div><div className="klp-display-md" style={cssVars({ marginTop: 6 })}>{kes(owed)}</div></div>
        <div className="klp-card klp-panel"><div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Awaiting payment</div><div className="klp-display-md" style={cssVars({ marginTop: 6 })}>{data.awaiting.length}</div></div>
        <div className="klp-card klp-panel"><div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Care MRR (ex VAT)</div><div className="klp-display-md" style={cssVars({ marginTop: 6 })}>{kes(mrr)}</div></div>
      </div>

      {toast && <div className={`klp-note ${toast.ok ? '' : 'amber'}`} style={cssVars({ marginBottom: 18 })}>{toast.msg}</div>}
      {!data.care_ready && <div className="klp-note amber" style={cssVars({ marginBottom: 18 })}>Care billing needs database migration 0009. Payments still work for proformas once 0009 adds the bank rail.</div>}

      <div className="klp-mono" style={cssVars({ color: 'var(--mid)', margin: '6px 0 10px' })}>Awaiting payment · proformas</div>
      {data.awaiting.length === 0 ? <EmptyState title="Nothing awaiting payment" sub="Dispatched proformas appear here until the client pays." /> : (
        <div className="klp-list">
          {data.awaiting.map((p) => {
            const t = one(p.tickets); const c = one(t?.clients);
            return (
              <div key={p.id} className="klp-list-row" style={cssVars({ display: 'block' })}>
                <div style={cssVars({ display: 'grid', gridTemplateColumns: 'minmax(120px,auto) 1fr auto auto', gap: 12, alignItems: 'center' })}>
                  <span className="ref">{p.ref}</span>
                  <span className="title">{c?.business_name ?? '-'}<span style={cssVars({ display: 'block', fontSize: 12, color: 'var(--mid)' })}>{t?.ref ?? ''} · sent {fmtDate(p.dispatched_at)}</span></span>
                  <span className="amt">{kes(p.total_kes)}</span>
                  {p.bank_requested_at ? <span className="klp-pill warn">Bank transfer chosen</span> : <span className="klp-pill quoted">Awaiting client</span>}
                </div>
                {isAdmin && form?.id !== p.id && (
                  <div className="klp-portal-actions" style={cssVars({ marginTop: 10 })}>
                    <button type="button" className="klp-btn ghost" disabled={busy} onClick={() => { setToast(null); setForm({ id: p.id, kind: 'proforma', reference: '', method: 'bank' }); }}>Record payment received</button>
                  </div>
                )}
                {refForm(p.id, 'proforma', () => void recordPayment(p))}
              </div>
            );
          })}
        </div>
      )}

      <div className="klp-mono" style={cssVars({ color: 'var(--mid)', margin: '26px 0 10px' })}>Unpaid invoices</div>
      {data.unpaid_invoices.length === 0 ? <EmptyState title="No unpaid invoices" sub="Monthly care invoices appear here once issued." /> : (
        <div className="klp-list">
          {data.unpaid_invoices.map((inv) => (
            <div key={inv.id} className="klp-list-row" style={cssVars({ display: 'block' })}>
              <div style={cssVars({ display: 'grid', gridTemplateColumns: 'minmax(150px,auto) 1fr auto auto', gap: 12, alignItems: 'center' })}>
                <span className="ref">{inv.ref}</span>
                <span className="title">{one(inv.clients)?.business_name ?? '-'}<span style={cssVars({ display: 'block', fontSize: 12, color: 'var(--mid)' })}>{inv.kind}{inv.period_start ? ` · ${fmtDate(inv.period_start)}` : ''} · issued {fmtDate(inv.issued_at)}</span></span>
                <span className="amt">{kes(inv.total_kes)}</span>
                {isAdmin && form?.id !== inv.id ? <button type="button" className="klp-btn ghost" disabled={busy} onClick={() => { setToast(null); setForm({ id: inv.id, kind: 'invoice', reference: '', method: 'bank' }); }}>Mark paid</button> : <span className="klp-pill warn">Unpaid</span>}
              </div>
              {refForm(inv.id, 'invoice', () => void markPaid(inv))}
            </div>
          ))}
        </div>
      )}

      <div style={cssVars({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '26px 0 10px', gap: 12, flexWrap: 'wrap' })}>
        <div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Care plans · billed monthly, due on the 7th</div>
        {isAdmin && data.care_ready && <button type="button" className="klp-btn ghost" disabled={busy} onClick={() => void runCare()}>Run care billing now</button>}
      </div>
      {data.care.length === 0 ? <EmptyState title="No active clients" sub="Clients appear here once onboarded." /> : (
        <div className="klp-list">
          {data.care.map((c) => {
            const plan = one(c.retainer_plans);
            return (
              <div key={c.id} className="klp-list-row" style={cssVars({ gridTemplateColumns: '1fr auto auto auto' })}>
                <span className="title" style={cssVars({ fontSize: 17 })}>{c.business_name}<span style={cssVars({ display: 'block', fontSize: 12, color: 'var(--mid)' })}>{plan?.name ?? '-'} · {plan && plan.monthly_fee_kes > 0 ? `${kes(plan.monthly_fee_kes)}/mo` : 'custom'}</span></span>
                <span className="date">{c.care_started_at ? `since ${fmtDate(c.care_started_at)}` : 'not started'}</span>
                <span className={`klp-pill ${c.care_started_at ? 'active' : 'draft'}`}>{c.care_started_at ? 'Care on' : 'Build only'}</span>
                {isAdmin && data.care_ready
                  ? <button type="button" className="klp-btn ghost" disabled={busy} onClick={() => void setCare(c, !c.care_started_at)}>{c.care_started_at ? 'Stop care' : 'Start care'}</button>
                  : <span />}
              </div>
            );
          })}
        </div>
      )}

      {data.recent_paid.length > 0 && (<>
        <div className="klp-mono" style={cssVars({ color: 'var(--mid)', margin: '26px 0 10px' })}>Recently paid</div>
        <div className="klp-list">
          {data.recent_paid.map((inv) => (
            <div key={inv.id} className="klp-list-row" style={cssVars({ gridTemplateColumns: 'minmax(150px,auto) 1fr auto auto' })}>
              <span className="ref">{inv.ref}</span>
              <span className="title">{one(inv.clients)?.business_name ?? '-'}</span>
              <span className="amt">{kes(inv.total_kes)}</span>
              <span className="klp-pill approved">Paid {fmtDate(inv.paid_at)}</span>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}
