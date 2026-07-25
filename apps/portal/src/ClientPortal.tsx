/**
 * Client Portal, warm editorial rebuild (design_reference/dashboard.html +
 * portal shell). Self-contained under .klp, reusing the landing design system:
 * 12-col shell (sidebar nav + content), serif KPI cards, hairline divide-y list
 * sections, status pills. Real data via useClientData; the proforma path ends
 * honestly at the Kipkiren Pay activation point (the single known failure).
 */

import { useState, type FormEvent, type CSSProperties, type ReactNode } from 'react';
import { useAuth, useApi } from './auth.tsx';
import { KlpToggle } from './klpTheme.tsx';
import {
  useClientData, serviceTypeLabel, formatKes, firstRel,
  type ClientTicket, type ClientInvoice, type ClientProforma,
} from './useClientData.ts';
import './landing.css';

type View = 'overview' | 'tickets' | 'proformas' | 'invoices' | 'services' | 'new';
const NAV: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'proformas', label: 'Proformas' },
  { id: 'invoices', label: 'Orders' },
  { id: 'services', label: 'Services' },
];
const VIEW_TITLE: Record<View, string> = {
  overview: 'Overview', tickets: 'Tickets', proformas: 'Proformas', invoices: 'Orders', services: 'Services', new: 'New ticket',
};

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// Minimal line icons for the empty states (stroke = currentColor).
const ICONS: Record<'ticket' | 'order' | 'proforma' | 'service', ReactNode> = {
  ticket: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.4a2 2 0 0 0 0 5.2V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.4a2 2 0 0 0 0-5.2V8Z" />
      <path d="M14 6.5v11" strokeDasharray="1.5 2.6" />
    </svg>
  ),
  order: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8.5h6M9 12.5h4" />
    </svg>
  ),
  proforma: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l4 4v14H7V3Z" /><path d="M14 3v4h4M9.5 13l1.8 1.8L15 11" />
    </svg>
  ),
  service: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" /><path d="M4 7l8 4 8-4M12 21V11" />
    </svg>
  ),
};

function EmptyState({ icon, title, body, cta, onCta }: { icon: ReactNode; title: string; body: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="klp-empty">
      <div className="klp-empty-ic" aria-hidden="true">{icon}</div>
      <div className="klp-empty-t">{title}</div>
      <p className="klp-empty-b">{body}</p>
      {cta && onCta && <button type="button" className="klp-btn primary" onClick={onCta}>{cta}</button>}
    </div>
  );
}

function ticketPill(status: string): { cls: string; label: string } {
  if (status === 'complete' || status === 'closed') return { cls: 'closed', label: status };
  if (status === 'in_progress') return { cls: 'progress', label: 'In progress' };
  if (status === 'dispatched' || status === 'ai_draft') return { cls: 'quoted', label: 'Awaiting you' };
  if (status === 'paid' || status === 'approved') return { cls: 'approved', label: 'Approved' };
  return { cls: 'open', label: status.replace(/_/g, ' ') };
}

export function ClientPortal() {
  const { session, signOut } = useAuth();
  const { tickets, invoices, services, proformas, loading, reload } = useClientData();
  const [view, setView] = useState<View>('overview');

  const name = session?.email?.split('@')[0] ?? 'there';
  const openTickets = (tickets ?? []).filter((t) => t.status !== 'complete' && t.status !== 'closed');
  const activeServices = (services ?? []).filter((s) => s.status === 'active' || s.status === 'expiring');
  const dueInvoices = (invoices ?? []).filter((i) => !i.paid_at);
  const awaitingProformas = (proformas ?? []).filter((p) => p.status === 'dispatched');

  return (
    <div className="klp">
      <div className="klp-topbrand klp-portal-top klp-container">
        <span className="mark">K</span>
        <span className="name">Kipkiren<small>WEB SERVICES</small></span>
        <div className="klp-topbrand-r">
          <KlpToggle />
          <button type="button" className="klp-portal-signout-top" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>

      <div className="klp-container klp-portal">
        <div className="klp-portal-layout">
          {/* sidebar */}
          <aside className="klp-portal-aside">
            <div className="klp-mono lbl">Client portal</div>
            <nav className="klp-portal-nav">
              {NAV.map((n) => (
                <button key={n.id} type="button" className={view === n.id ? 'active' : ''} onClick={() => setView(n.id)}>
                  <span>{n.label}</span>
                  {n.id === 'overview' && view === 'overview' && <span>→</span>}
                  {n.id === 'invoices' && dueInvoices.length > 0 && <span className="badge">{dueInvoices.length}</span>}
                  {n.id === 'proformas' && awaitingProformas.length > 0 && <span className="badge">{awaitingProformas.length}</span>}
                </button>
              ))}
            </nav>
            <div className="klp-portal-foot">
              <button type="button" className="klp-btn primary full" onClick={() => setView('new')}>Open a ticket</button>
              <div className="klp-portal-signout-wrap">
                <div className="who klp-portal-foot" style={cssVars({ marginTop: 20, paddingTop: 20 })}>{session?.email ?? ''}</div>
                <button type="button" className="klp-portal-signout" onClick={() => void signOut()}>Sign out</button>
              </div>
            </div>
          </aside>

          {/* content */}
          <div className="klp-portal-content">
            <header className="klp-portal-head">
              <div className="klp-portal-greet">
                <div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>{VIEW_TITLE[view]}</div>
                <h1 className="klp-display-md">{view === 'overview' ? greeting() : VIEW_TITLE[view]}</h1>
                {view === 'overview' && <p className="klp-portal-sub">Welcome back. Everything across your projects and services, in one place.</p>}
              </div>
              <div className="actions">
                {view !== 'new' && <button type="button" className="klp-btn primary" onClick={() => setView('new')}>New ticket</button>}
                {view === 'new' && <button type="button" className="klp-btn ghost" onClick={() => setView('overview')}>‹ Back</button>}
              </div>
            </header>

            {view === 'overview' && <Overview name={name} tickets={tickets} invoices={invoices} openCount={openTickets.length} activeCount={activeServices.length} awaitingCount={awaitingProformas.length} loading={loading} onNav={setView} />}
            {view === 'tickets' && <TicketList tickets={tickets} loading={loading} onNew={() => setView('new')} />}
            {view === 'proformas' && <ProformaView proformas={proformas} loading={loading} reload={reload} />}
            {view === 'invoices' && <InvoiceList invoices={invoices} loading={loading} />}
            {view === 'services' && <ServiceList services={services} loading={loading} />}
            {view === 'new' && <NewTicket onDone={() => { reload(); setView('tickets'); }} />}
          </div>
        </div>
      </div>
    </div>
  );
}

//  overview 
function OverviewSkeleton() {
  return (
    <>
      <div className="klp-skel-kpis">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="klp-skeleton klp-skel-kpi" />)}</div>
      {[0, 1].map((s) => (
        <section key={s} className="klp-portal-sec">
          <div className="klp-skel-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="klp-skel-row"><span className="a klp-skeleton" /><span className="b klp-skeleton" /><span className="c klp-skeleton" /></div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
function Overview({ name, tickets, invoices, openCount, activeCount, awaitingCount, loading, onNav }: {
  name: string; tickets: ClientTicket[] | null; invoices: ClientInvoice[] | null;
  openCount: number; activeCount: number; awaitingCount: number; loading: boolean; onNav: (v: View) => void;
}) {
  void name;
  if (loading) return <OverviewSkeleton />;
  const recentTickets = tickets ?? [];
  const recentOrders = invoices ?? [];
  return (
    <>
      <div className="klp-kpis">
        <button type="button" className="klp-card klp-kpi" onClick={() => onNav('tickets')}>
          <span className="klp-mono lbl">Open tickets</span><span className="n">{openCount}</span>
        </button>
        <button type="button" className="klp-card klp-kpi" onClick={() => onNav('services')}>
          <span className="klp-mono lbl">Active services</span><span className="n">{activeCount}</span>
        </button>
        <button type="button" className="klp-card klp-kpi" onClick={() => onNav('proformas')}>
          <span className="klp-mono lbl">Awaiting approval</span><span className={`n ${awaitingCount ? 'amber' : ''}`}>{awaitingCount}</span>
        </button>
      </div>

      <section className="klp-portal-sec">
        <div className="sechd"><h2>Recent tickets</h2>{recentTickets.length > 0 && <button type="button" onClick={() => onNav('tickets')}>View all →</button>}</div>
        {recentTickets.length === 0
          ? <EmptyState icon={ICONS.ticket} title="No tickets yet" body="Create your first request and we'll turn it into a fixed-scope proforma before any work begins." cta="New ticket" onCta={() => onNav('new')} />
          : (
            <div className="klp-list">
              {recentTickets.slice(0, 4).map((t) => {
                const p = ticketPill(t.status);
                return (
                  <div key={t.id} className="klp-list-row" style={cssVars({ gridTemplateColumns: 'minmax(120px,auto) 1fr auto auto' })}>
                    <span className="ref">{t.ref}</span>
                    <span className="title">{t.description}</span>
                    <span className={`klp-pill ${p.cls}`}>{p.label}</span>
                    <span className="date">{fmtDate(t.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
      </section>

      <section className="klp-portal-sec">
        <div className="sechd"><h2>Recent orders</h2>{recentOrders.length > 0 && <button type="button" onClick={() => onNav('invoices')}>View all →</button>}</div>
        {recentOrders.length === 0
          ? <EmptyState icon={ICONS.order} title="No orders yet" body="Approved proformas and paid invoices will show up here as your work gets underway." />
          : (
            <div className="klp-list">
              {recentOrders.slice(0, 4).map((i) => (
                <div key={i.id} className="klp-list-row" style={cssVars({ gridTemplateColumns: 'minmax(120px,auto) 1fr auto auto' })}>
                  <span className="ref">{i.ref}</span>
                  <span className="title">{i.kind === 'retainer' ? 'Monthly retainer' : i.kind === 'onboarding' ? 'Onboarding' : 'Task charge'}</span>
                  <span className="amt">KES {formatKes(i.total_kes)}</span>
                  <span className={`klp-pill ${i.paid_at ? 'paid' : 'pending'}`}>{i.paid_at ? 'Paid' : 'Due'}</span>
                </div>
              ))}
            </div>
          )}
      </section>
    </>
  );
}

//  tickets list 
function TicketList({ tickets, loading, onNew }: { tickets: ClientTicket[] | null; loading: boolean; onNew: () => void }) {
  const rows = tickets ?? [];
  if (loading) return <div className="klp-list"><div className="klp-list-empty">Loading...</div></div>;
  if (rows.length === 0) return <EmptyState icon={ICONS.ticket} title="No tickets yet" body="Create your first request and we'll turn it into a fixed-scope proforma before any work begins." cta="New ticket" onCta={onNew} />;
  return (
    <div className="klp-list">
      {rows.map((t) => {
        const p = ticketPill(t.status);
        return (
          <div key={t.id} className="klp-list-row" style={cssVars({ gridTemplateColumns: 'minmax(120px,auto) 1fr auto auto' })}>
            <span className="ref">{t.ref}</span>
            <span className="title">{t.description}</span>
            <span className={`klp-pill ${p.cls}`}>{p.label}</span>
            <span className="date">{fmtDate(t.created_at)}</span>
          </div>
        );
      })}
    </div>
  );
}

//  invoices / orders list 
function InvoiceList({ invoices, loading }: { invoices: ClientInvoice[] | null; loading: boolean }) {
  const rows = invoices ?? [];
  if (loading) return <div className="klp-list"><div className="klp-list-empty">Loading...</div></div>;
  if (rows.length === 0) return <EmptyState icon={ICONS.order} title="No orders yet" body="Approved proformas and paid invoices will show up here as your work gets underway." />;
  return (
    <div className="klp-list">
      {rows.map((i) => (
        <div key={i.id} className="klp-list-row" style={cssVars({ gridTemplateColumns: 'minmax(120px,auto) 1fr auto auto auto' })}>
          <span className="ref">{i.ref}</span>
          <span className="title">{i.kind === 'retainer' ? 'Monthly retainer' : i.kind === 'onboarding' ? 'Onboarding' : 'Task charge'}</span>
          <span className="date">{fmtDate(i.issued_at)}</span>
          <span className="amt">KES {formatKes(i.total_kes)}</span>
          <span className={`klp-pill ${i.paid_at ? 'paid' : 'pending'}`}>{i.paid_at ? 'Paid' : 'Due'}</span>
        </div>
      ))}
    </div>
  );
}

//  services list 
function ServiceList({ services, loading }: { services: import('./useClientData.ts').ClientService[] | null; loading: boolean }) {
  const rows = services ?? [];
  if (loading) return <div className="klp-list"><div className="klp-list-empty">Loading...</div></div>;
  if (rows.length === 0) return <EmptyState icon={ICONS.service} title="No services yet" body="Websites, hosting and domains we manage for you will be listed here once they're live." />;
  return (
    <div className="klp-list">
      {rows.map((s) => {
        const domain = (s.metadata as { domain?: string }).domain;
        const expiring = s.status === 'expiring' || s.status === 'expired';
        return (
          <div key={s.id} className="klp-list-row" style={cssVars({ gridTemplateColumns: 'minmax(160px,auto) 1fr auto auto' })}>
            <span className="title" style={cssVars({ fontSize: 17 })}>{serviceTypeLabel(s.service_type)}</span>
            <span className="date" style={cssVars({ fontSize: 12 })}>{domain ?? '-'}</span>
            <span className="amt">KES {formatKes(s.monthly_cost_kes)}/mo</span>
            <span className={`klp-pill ${expiring ? 'warn' : 'active'}`}>{expiring ? 'Renew soon' : 'Active'}</span>
          </div>
        );
      })}
    </div>
  );
}

//  proformas 
const COMPANY = {
  name: 'Kipkiren Web Services',
  tagline: 'A Kipkiren Teknolojia company',
  location: 'Nairobi, Kenya',
  email: 'studio@kipkiren.co.ke',
  site: 'ws.kipkiren.co.ke',
};

function proformaStatusPill(status: string): { cls: string; label: string } {
  if (status === 'approved') return { cls: 'approved', label: 'Accepted' };
  if (status === 'expired') return { cls: 'warn', label: 'Expired' };
  if (status === 'dispatched') return { cls: 'quoted', label: 'Awaiting your approval' };
  return { cls: 'draft', label: status.replace(/_/g, ' ') };
}

type PayMethod = 'mpesa' | 'card' | 'bank';
const PAY_METHODS: readonly (readonly [PayMethod, string, string])[] = [
  ['mpesa', 'M-Pesa', 'STK push to your Safaricom line'],
  ['card', 'Card', 'Visa / Mastercard via Paystack'],
  ['bank', 'Bank transfer', 'We email account details; you pay offline'],
];

function ProformaView({ proformas, loading, reload }: { proformas: ClientProforma[] | null; loading: boolean; reload: () => void }) {
  const call = useApi();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [method, setMethod] = useState<PayMethod>('mpesa');
  const [msisdn, setMsisdn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const rows = proformas ?? [];
  const selected = rows.find((p) => p.id === selectedId) ?? (rows.length === 1 ? rows[0]! : null);

  if (loading) return <div className="klp-list"><div className="klp-list-empty">Loading...</div></div>;
  if (rows.length === 0) return <EmptyState icon={ICONS.proforma} title="No proformas yet" body="When we quote one of your requests, the proforma appears here to review, approve and pay." />;

  // List view (more than one, none selected yet).
  if (!selected) {
    return (
      <div className="klp-list">
        {rows.map((p) => {
          const pill = proformaStatusPill(p.status);
          const t = firstRel(p.tickets);
          return (
            <button key={p.id} type="button" className="klp-list-row klp-list-row-btn" style={cssVars({ gridTemplateColumns: 'minmax(120px,auto) 1fr auto auto' })}
              onClick={() => { setSelectedId(p.id); setCheckout(false); setResult(null); }}>
              <span className="ref">{p.ref}</span>
              <span className="title">{t?.description ?? 'Proforma'}</span>
              <span className="amt">KES {formatKes(p.total_kes)}</span>
              <span className={`klp-pill ${pill.cls}`}>{pill.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const p = selected;
  const t = firstRel(p.tickets);
  const client = firstRel(t?.clients);
  const pill = proformaStatusPill(p.status);
  const lines = [...p.proforma_line_items].sort((a, b) => a.position - b.position);
  const canPay = p.status === 'dispatched';

  const doApprove = async () => {
    if (submitting) return;
    if (method === 'bank') {
      setResult({ ok: true, msg: `Bank transfer selected. We'll email our account details - quote ${p.ref} as the reference. Scope locks and work begins once payment reflects.` });
      return;
    }
    if (method === 'mpesa' && msisdn.trim().length < 9) { setResult({ ok: false, msg: 'Enter the Safaricom number that should receive the M-Pesa prompt.' }); return; }
    setSubmitting(true); setResult(null);
    try {
      const body = method === 'mpesa' ? { rail: 'mpesa', msisdn: msisdn.trim() } : { rail: 'card' };
      const res = await call<{ rail: string; status?: string; authorization_url?: string }>(`/v1/proformas/${p.id}/approve`, { method: 'POST', body });
      if (res.rail === 'card' && res.authorization_url) { window.location.href = res.authorization_url; return; }
      setResult({ ok: true, msg: 'Check your phone - an M-Pesa prompt has been sent. Approve it to confirm. Scope locks the moment payment clears.' });
      reload();
    } catch {
      // The rail (Kipkiren Pay / Paystack) is not activated yet, or the gateway
      // is temporarily unavailable. Be honest and offer the offline path.
      setResult({ ok: false, msg: 'Live payment is completing activation, so the charge cannot be taken just yet. Your acceptance is saved - use bank transfer, or we\'ll email you the moment M-Pesa opens.' });
    } finally { setSubmitting(false); }
  };

  return (
    <div>
      {rows.length > 1 && <button type="button" className="klp-back klp-noprint" onClick={() => { setSelectedId(null); setCheckout(false); setResult(null); }}>‹ All proformas</button>}
      <div className="klp-card klp-panel klp-proforma-doc" style={cssVars({ maxWidth: 760, marginTop: rows.length > 1 ? 16 : 0 })}>
        <div className="klp-pf-head">
          <div className="klp-pf-co">
            <div className="klp-pf-co-name">{COMPANY.name}</div>
            <div className="klp-pf-co-sub">{COMPANY.tagline}<br />{COMPANY.location}<br />{COMPANY.email} · {COMPANY.site}</div>
          </div>
          <div className="klp-pf-meta">
            <div className="klp-pf-title">PROFORMA</div>
            <div className="klp-pf-ref">{p.ref}</div>
            <span className={`klp-pill ${pill.cls}`}>{pill.label}</span>
          </div>
        </div>

        <div className="klp-dl" style={cssVars({ marginTop: 20 })}>
          <div><div className="k">Billed to</div><div className="v">{client?.business_name ?? '-'}{client?.contact_name ? <span style={cssVars({ display: 'block', color: 'var(--mid)', fontSize: 13 })}>{client.contact_name} · {client.email}</span> : null}</div></div>
          <div><div className="k">Request</div><div className="v">{t?.ref ?? '-'}</div></div>
          <div><div className="k">Issued</div><div className="v">{fmtDate(p.dispatched_at ?? p.created_at)}</div></div>
          <div><div className="k">Valid until</div><div className="v">{p.expires_at ? fmtDate(p.expires_at) : '30 days from issue'}</div></div>
        </div>

        {t?.description && <p style={cssVars({ marginTop: 18, fontSize: 15, lineHeight: 1.55 })}>{t.description}</p>}

        <div className="klp-pf-lines">
          <div className="klp-pf-lrow klp-pf-lhead"><span>Item</span><span className="num">Hrs</span><span className="num">Rate</span><span className="num">Amount</span></div>
          {lines.map((li) => (
            <div key={li.id} className="klp-pf-lrow">
              <span>{li.task_name}{li.task_description ? <span className="klp-pf-ldesc">{li.task_description}</span> : null}</span>
              <span className="num">{li.estimated_hours.toFixed(2)}</span>
              <span className="num">{formatKes(li.rate_kes_per_hour)}</span>
              <span className="num">{formatKes(li.amount_kes)}</span>
            </div>
          ))}
        </div>

        <div style={cssVars({ marginTop: 16 })}>
          <div className="klp-totrow"><span className="l">Subtotal</span><span className="r">KES {formatKes(p.subtotal_kes)}</span></div>
          {p.discount_kes > 0 && <div className="klp-totrow"><span className="l">Discount</span><span className="r" style={cssVars({ color: 'var(--teal-deep)' })}>less KES {formatKes(p.discount_kes)}</span></div>}
          <div className="klp-totrow"><span className="l">VAT (16%)</span><span className="r">KES {formatKes(p.vat_kes)}</span></div>
          <div className="klp-totrow total"><span className="l">Total due</span><span className="r">KES {formatKes(p.total_kes)}</span></div>
        </div>

        <div className="klp-pf-terms">
          <div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Payment</div>
          <p>Approve below to pay by M-Pesa or card. For bank transfer, quote <strong>{p.ref}</strong> as your reference. Scope locks and work begins the moment payment confirms.</p>
        </div>

        {!checkout && (
          <div className="klp-portal-actions klp-noprint">
            {canPay && <button type="button" className="klp-btn primary" onClick={() => { setCheckout(true); setResult(null); }}>Accept &amp; pay →</button>}
            <button type="button" className="klp-btn ghost" onClick={() => window.print()}>Print / Download PDF</button>
          </div>
        )}
        {result && !checkout && <div className={`klp-note ${result.ok ? '' : 'amber'} klp-noprint`} style={cssVars({ marginTop: 16 })}>{result.msg}</div>}

        {checkout && canPay && (
          <div className="klp-pf-checkout klp-noprint" style={cssVars({ marginTop: 22, paddingTop: 22, borderTop: '1px solid var(--hairline)' })}>
            <div className="klp-mono" style={cssVars({ color: 'var(--mid)', marginBottom: 12 })}>Checkout · KES {formatKes(p.total_kes)}</div>
            <div className="klp-pf-methods" role="radiogroup" aria-label="Payment method">
              {PAY_METHODS.map(([m, label, sub]) => (
                <button key={m} type="button" role="radio" aria-checked={method === m} className={`klp-pf-method ${method === m ? 'sel' : ''}`} onClick={() => { setMethod(m); setResult(null); }}>
                  <span className="klp-pf-method-t">{label}</span><span className="klp-pf-method-s">{sub}</span>
                </button>
              ))}
            </div>
            {method === 'mpesa' && (
              <div style={cssVars({ marginTop: 14 })}>
                <label className="klp-field-label" htmlFor="pf-msisdn">Safaricom number</label>
                <input id="pf-msisdn" className="klp-field-input" inputMode="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={msisdn} onChange={(e) => setMsisdn(e.target.value)} disabled={submitting} />
              </div>
            )}
            {result && <div className={`klp-note ${result.ok ? '' : 'amber'}`} style={cssVars({ marginTop: 16 })}>{result.msg}</div>}
            <div className="klp-portal-actions">
              <button type="button" className="klp-btn primary" disabled={submitting} onClick={() => void doApprove()}>
                {submitting ? 'Working...' : method === 'mpesa' ? 'Send M-Pesa prompt' : method === 'card' ? 'Pay by card →' : 'Confirm bank transfer'}
              </button>
              <button type="button" className="klp-btn ghost" disabled={submitting} onClick={() => { setCheckout(false); setResult(null); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

//  new ticket 
const CATEGORY_MAP: Record<string, string> = { 'Web Development': 'web', 'Cloud Services': 'cloud', 'SEO': 'seo', 'Social Media': 'social', 'Domain / DNS': 'dns', 'Not sure': 'web' };
const URGENCY_MAP: Record<string, string> = { 'Standard': 'standard', 'Elevated · within 48h': 'elevated', 'Urgent · within 24h': 'urgent' };

function NewTicket({ onDone }: { onDone: () => void }) {
  const call = useApi();
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('Web Development');
  const [urgency, setUrgency] = useState('Standard');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = desc.trim();
  const MIN = 10;
  const remaining = MIN - trimmed.length;             // > 0 while still too short
  const canSubmit = trimmed.length >= MIN && !submitting;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true); setError(null);
    try {
      await call('/v1/tickets', { method: 'POST', body: { description: trimmed, category: CATEGORY_MAP[category] ?? 'web', urgency: URGENCY_MAP[urgency] ?? 'standard' } });
      onDone();
    } catch (err) {
      const e2 = err as { code?: string; status?: number };
      const c = e2?.code;
      if (c === 'invalid_input') setError('Please add a little more detail so we can scope it properly (at least 10 characters).');
      else if (c === 'rate_limited') setError('You have sent a few requests in a short time. Please try again in a little while.');
      else if (c === 'client_not_found' || c === 'retainer_plan_not_found') setError('Your account is not fully set up yet. Please contact the studio at studio@kipkiren.co.ke and we will sort it right away.');
      else setError(`We could not submit that just now (${c ?? 'network error'}${e2?.status ? ` ${e2.status}` : ''}). Please try again; if it keeps happening, send us this code.`);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="klp-auth-grid">
      <form className="intro klp-form" onSubmit={submit}>
        <div>
          <label className="klp-field-label" htmlFor="nt-desc">Describe your request</label>
          <textarea id="nt-desc" className="klp-field-input" style={cssVars({ minHeight: 140, resize: 'vertical' })}
            placeholder="e.g. Add a services page with an intro, what we offer, a pricing table, and a contact form."
            value={desc} onChange={(e) => setDesc(e.target.value)} disabled={submitting} aria-describedby="nt-desc-hint" />
          <p id="nt-desc-hint" className="klp-field-help">{remaining > 0 && trimmed.length > 0 ? `A little more detail helps us scope it. ${remaining} more character${remaining === 1 ? '' : 's'}.` : 'The more detail you give, the more accurate your proforma.'}</p>
        </div>
        <div className="klp-dl" style={cssVars({ background: 'transparent', border: 'none', borderRadius: 0, gap: 16 })}>
          <div style={cssVars({ background: 'transparent', padding: 0 })}>
            <label className="klp-field-label" htmlFor="nt-cat">Service</label>
            <select id="nt-cat" className="klp-field-input" value={category} onChange={(e) => setCategory(e.target.value)} disabled={submitting}>
              {Object.keys(CATEGORY_MAP).map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={cssVars({ background: 'transparent', padding: 0 })}>
            <label className="klp-field-label" htmlFor="nt-urg">Urgency</label>
            <select id="nt-urg" className="klp-field-input" value={urgency} onChange={(e) => setUrgency(e.target.value)} disabled={submitting}>
              {Object.keys(URGENCY_MAP).map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        {error && <div className="klp-auth-error">{error}</div>}
        <button type="submit" className="klp-btn primary" style={cssVars({ alignSelf: 'flex-start' })} disabled={!canSubmit}>
          {submitting ? 'Submitting...' : 'Submit request →'}
        </button>
      </form>
      <aside className="panel">
        <div className="klp-card klp-panel">
          <div className="klp-mono" style={cssVars({ color: 'var(--mid)', marginBottom: 16 })}>What happens next</div>
          <div className="klp-auth-list" style={cssVars({ marginTop: 0, paddingTop: 0, borderTop: 'none' })}>
            <ul>
              <li><span className="m" />We read it and write a fixed-scope proforma</li>
              <li><span className="m" />You approve the price before any work begins</li>
              <li><span className="m" />Weekly demos; you watch it come together</li>
              <li><span className="m" />We launch, then quietly operate it</li>
            </ul>
          </div>
          <div className="klp-note" style={cssVars({ marginTop: 20 })}>No surprise invoices. Every task is priced and approved first.</div>
        </div>
      </aside>
    </div>
  );
}
