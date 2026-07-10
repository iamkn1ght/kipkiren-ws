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
  useClientData, serviceTypeLabel, formatKes,
  type ClientTicket, type ClientInvoice,
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
  const { tickets, invoices, services, loading, reload } = useClientData();
  const [view, setView] = useState<View>('overview');

  const name = session?.email?.split('@')[0] ?? 'there';
  const openTickets = (tickets ?? []).filter((t) => t.status !== 'complete' && t.status !== 'closed');
  const activeServices = (services ?? []).filter((s) => s.status === 'active' || s.status === 'expiring');
  const dueInvoices = (invoices ?? []).filter((i) => !i.paid_at);
  const awaiting = openTickets.filter((t) => t.status === 'dispatched' || t.status === 'ai_draft');

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
                  {n.id === 'proformas' && awaiting.length > 0 && <span className="badge">{awaiting.length}</span>}
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

            {view === 'overview' && <Overview name={name} tickets={tickets} invoices={invoices} openCount={openTickets.length} activeCount={activeServices.length} awaitingCount={awaiting.length} loading={loading} onNav={setView} />}
            {view === 'tickets' && <TicketList tickets={tickets} loading={loading} onNew={() => setView('new')} />}
            {view === 'proformas' && <ProformaView awaiting={awaiting} />}
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
function ProformaView({ awaiting }: { awaiting: ClientTicket[] }) {
  const [checkout, setCheckout] = useState(false);
  const [attempted, setAttempted] = useState(false);

  return (
    <div className="klp-card klp-panel" style={cssVars({ maxWidth: 720 })}>
      <div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Proforma · KWS-042</div>
      <h2 className="klp-display-md" style={cssVars({ marginTop: 8 })}>Homepage hero section redesign</h2>
      <div className="klp-mono" style={cssVars({ color: 'var(--mid)', marginTop: 8 })}>Submitted 9 Apr 2026 · Growth plan</div>
      <span className="klp-pill quoted" style={cssVars({ marginTop: 16, display: 'inline-block' })}>Awaiting your approval</span>

      <div className="klp-dl" style={cssVars({ marginTop: 24 })}>
        <div><div className="k">Line items</div><div className="v">5 sub-tasks · 3.75 hrs</div></div>
        <div><div className="k">Rate</div><div className="v">KES 3,500 / hr</div></div>
      </div>
      <div style={cssVars({ marginTop: 20 })}>
        <div className="klp-totrow"><span className="l">Subtotal</span><span className="r">KES 13,125</span></div>
        <div className="klp-totrow"><span className="l">Growth discount (10%)</span><span className="r" style={cssVars({ color: 'var(--teal-deep)' })}>less KES 1,313</span></div>
        <div className="klp-totrow"><span className="l">VAT 16%</span><span className="r">KES 1,893</span></div>
        <div className="klp-totrow total"><span className="l">Total due</span><span className="r">KES 13,705</span></div>
      </div>

      {!checkout && (
        <div className="klp-portal-actions">
          <button type="button" className="klp-btn primary" onClick={() => setCheckout(true)}>Approve & pay →</button>
          <button type="button" className="klp-btn ghost">Request revision</button>
        </div>
      )}

      {checkout && (
        <div style={cssVars({ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--hairline)' })}>
          <div className="klp-mono" style={cssVars({ color: 'var(--mid)', marginBottom: 12 })}>Checkout · KES 13,705</div>
          <div className="klp-dl">
            <div><div className="k">Pay by M-Pesa</div><div className="v">STK push to your Safaricom line</div></div>
            <div><div className="k">Pay by card</div><div className="v">Visa / Mastercard via Paystack</div></div>
          </div>
          {attempted
            ? <div className="klp-note amber" style={cssVars({ marginTop: 16 })}>Kipkiren Pay is completing activation, so the live charge cannot be taken just yet. Everything up to this point is saved. We will email you the moment payment opens, or you can pay by invoice today.</div>
            : <div className="klp-note" style={cssVars({ marginTop: 16 })}>Scope locks the moment payment confirms. Work begins within 2 business days.</div>}
          <div className="klp-portal-actions">
            <button type="button" className="klp-btn primary" onClick={() => setAttempted(true)}>Send STK push</button>
            <button type="button" className="klp-btn ghost" onClick={() => setCheckout(false)}>Cancel</button>
          </div>
        </div>
      )}

      {awaiting.length > 0 && !checkout && (
        <div className="klp-note" style={cssVars({ marginTop: 24 })}>You have {awaiting.length} proforma{awaiting.length !== 1 ? 's' : ''} awaiting review.</div>
      )}
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
      if (e2?.code === 'invalid_input') setError('Please add a little more detail so we can scope it properly (at least 10 characters).');
      else if (e2?.code === 'rate_limited') setError('You have sent a few requests in a short time. Please try again in a little while.');
      else setError('We could not submit that just now. Check your connection and try again.');
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
