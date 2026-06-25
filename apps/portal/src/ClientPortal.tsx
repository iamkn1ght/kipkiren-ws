/**
 * Client Portal.
 *
 * The Ticket / Proforma / Invoices / Services views + payment modal are ported
 * verbatim from kws_client_portal_v3.html (the canonical founding mockup).
 *
 * The DASHBOARD view was redesigned (founder-directed, June 2026) into a
 * premium "client operating system" home: KPI row, welcome + quick actions,
 * projects with progress, support center, invoices, activity feed, service
 * health, and trust metrics (cdash-* styles in clientDashboard.css). It does
 * NOT match the canonical mockup by design - the rest of the portal still does.
 *
 * State model mirrors the original vanilla JS:
 *   - view  : 'dashboard' | 'ticket' | 'proforma' | 'invoices' | 'services'
 *   - modal : null | { context: 'proforma' | 'domain', state: 'checkout' | 'stk' | 'proc' | 'confirm' }
 *
 * The data shown is intentionally the same demo data as the canonical mockup
 * (Jane Wanjiru, Growth Plan, KWS-042 KES 13,705). Real data lands when the
 * portal is wired to /v1/auth, /v1/tickets, /v1/proformas, /v1/invoices in
 * a follow-up ticket. The wiring happens against THIS markup - never replace
 * the markup with a "data-driven" rewrite.
 */

import { useState, type CSSProperties } from 'react';
import { useAuth, useApi } from './auth.tsx';
import {
  useClientData,
  serviceTypeLabel,
  formatKes,
  type ClientTicket,
  type ClientInvoice,
  type ClientService,
  type ClientDashboard as ClientDashboardData,
} from './useClientData.ts';
import './clientDashboard.css';

type View = 'dashboard' | 'ticket' | 'proforma' | 'invoices' | 'services';
type ModalState = 'checkout' | 'stk' | 'proc' | 'confirm';
type PayContext = 'proforma' | 'domain';
type PayTab = 'mpesa' | 'card';

interface ModalConfig {
  context: PayContext;
  state: ModalState;
  tab: PayTab;
  mpesaNumber: string;
  paymentReceived: boolean;
}

const VIEW_LABELS: Record<View, string> = {
  dashboard: 'Dashboard',
  ticket: 'New Ticket',
  proforma: 'Proforma #KWS-042',
  invoices: 'Invoices',
  services: 'Services',
};

export function ClientPortal() {
  const { session, signOut } = useAuth();
  const { tickets, invoices, services, dashboard, loading, reload } = useClientData();
  const [view, setView] = useState<View>('dashboard');
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const [proformaPaid, setProformaPaid] = useState(false);

  const displayName = session?.email?.split('@')[0] ?? 'there';
  const d = '-';

  const openPayModal = (context: PayContext) => {
    setModal({
      context,
      state: 'checkout',
      tab: 'mpesa',
      mpesaNumber: '0722 400 123',
      paymentReceived: false,
    });
  };
  const closePayModal = () => setModal(null);
  const switchTab = (tab: PayTab) => modal && setModal({ ...modal, tab });
  const setModalState = (state: ModalState) => modal && setModal({ ...modal, state });
  const triggerSTK = () => setModalState('stk');
  const triggerCard = () => {
    setModalState('proc');
    setTimeout(() => setModalState('confirm'), 2000);
  };
  const confirmPayment = () => setModalState('confirm');
  const donePayment = () => {
    if (modal?.context === 'proforma') setProformaPaid(true);
    closePayModal();
  };

  return (
    <div className="kwsp app-client">
      {/* SIDEBAR */}
      <div className="sb">
        <div className="sb-logo">
          <div className="sb-mark">KWS</div>
          <div className="sb-sub">Web Services</div>
        </div>
        <div className="sb-nav">
          <button type="button" className={`sni ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
            <div className="sni-dot" />Dashboard
          </button>
          <button type="button" className={`sni ${view === 'ticket' ? 'active' : ''}`} onClick={() => setView('ticket')}>
            <div className="sni-dot" />New Ticket
          </button>
          <button type="button" className={`sni ${view === 'proforma' ? 'active' : ''}`} onClick={() => setView('proforma')}>
            <div className="sni-dot" />Proforma #042
            {!proformaPaid && <span className="sni-badge">1</span>}
          </button>
          <button type="button" className={`sni ${view === 'invoices' ? 'active' : ''}`} onClick={() => setView('invoices')}>
            <div className="sni-dot" />Invoices
          </button>
          <button type="button" className={`sni ${view === 'services' ? 'active' : ''}`} onClick={() => setView('services')}>
            <div className="sni-dot" />Services
          </button>
        </div>
        <div className="sb-foot">
          <div className="sb-plan">{d}</div>
          <div className="sb-name">{session?.email ?? d}</div>
          <button type="button" className="sb-signout" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <div className="tb-crumb">ws.kipkiren.co.ke / <span>{VIEW_LABELS[view]}</span></div>
          <button type="button" className="btn-nt" onClick={() => setView('ticket')}>+ New Ticket</button>
        </div>

        {view === 'dashboard' && <DashboardView name={displayName} tickets={tickets} services={services} invoices={invoices} dashboard={dashboard} loading={loading} onNav={setView} onReviewProforma={() => setView('proforma')} />}
        {view === 'ticket' && <TicketView onSubmitted={() => { reload(); setView('dashboard'); }} />}
        {view === 'proforma' && <ProformaView paid={proformaPaid} onApprove={() => openPayModal('proforma')} />}
        {view === 'invoices' && <InvoicesView invoices={invoices} loading={loading} />}
        {view === 'services' && <ServicesView services={services} loading={loading} onRenewDomain={() => openPayModal('domain')} />}

        <div className="doc-note">Kipkiren Web Services · Client Portal v3.0 · ws.kipkiren.co.ke · Kipkiren Teknolojia © 2026</div>
      </div>

      {modal && (
        <PaymentModal
          modal={modal}
          onClose={closePayModal}
          onSwitchTab={switchTab}
          onTriggerSTK={triggerSTK}
          onTriggerCard={triggerCard}
          onConfirmPayment={confirmPayment}
          onDone={donePayment}
          onMpesaNumberChange={(num) => setModal({ ...modal, mpesaNumber: num })}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
interface DashboardProps {
  name: string;
  tickets: ClientTicket[] | null;
  services: ClientService[] | null;
  invoices: ClientInvoice[] | null;
  dashboard: ClientDashboardData | null;
  loading: boolean;
  onNav: (v: View) => void;
  onReviewProforma: () => void;
}

const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function dueLabel(iso: string | null): string {
  if (!iso) return 'No date set';
  return `Due ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}
const PRIORITY: Record<string, { cls: string; label: string }> = {
  urgent: { cls: 'hi', label: 'High' },
  elevated: { cls: 'md', label: 'Medium' },
  standard: { cls: 'lo', label: 'Low' },
};

function DashboardView({ name, tickets, services, invoices, dashboard, loading, onNav, onReviewProforma }: DashboardProps) {
  const openTickets = tickets?.filter((t) => t.status !== 'complete' && t.status !== 'closed') ?? [];
  const activeServices = services?.filter((s) => s.status === 'active' || s.status === 'expiring') ?? [];
  const dueInvoices = (invoices ?? []).filter((i) => !i.paid_at);
  const dueTotal = dueInvoices.reduce((s, i) => s + i.total_kes, 0);
  const now = new Date();
  const thisMonthTotal = (invoices ?? [])
    .filter((i) => { const m = new Date(i.issued_at); return m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth(); })
    .reduce((s, i) => s + i.total_kes, 0);

  const projects = dashboard?.projects ?? [];
  const activeProjects = projects.filter((p) => p.kind !== 'done');
  const completion = projects.length ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length) : 0;
  const activity = dashboard?.activity ?? [];
  const health = dashboard?.health ?? [];
  const allOperational = health.length > 0 && health.every((h) => h.status === 'operational');
  const trust = dashboard?.trust ?? null;
  const pendingProforma = openTickets.some((t) => t.status === 'ai_draft' || t.status === 'dispatched');

  if (loading) {
    return (
      <div className="view">
        <div className="cdash">
          <div className="cdash-head"><div><div className="cdash-hi">Welcome back.</div><div className="cdash-subline">Loading your account...</div></div></div>
          <div className="cdash-kpis">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="cdash-kpi"><div className="cdash-kpi-l">Loading</div><div className="cdash-kpi-v">-</div></div>)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="cdash">
        {/* welcome + quick actions */}
        <div className="cdash-head cdash-reveal">
          <div>
            <div className="cdash-hi">Welcome back, <em>{name}</em>.</div>
            <div className="cdash-subline">Your retainer is active and all systems are operational.</div>
            <div className="cdash-chips">
              <span className="cdash-chip"><span className="d" /><b>{openTickets.length}</b> ticket{openTickets.length !== 1 ? 's' : ''} open</span>
              <span className="cdash-chip"><span className={`d ${dueInvoices.length ? 'a' : ''}`} /><b>{dueInvoices.length}</b> invoice{dueInvoices.length !== 1 ? 's' : ''} pending</span>
              <span className="cdash-chip"><span className="d" /><b>{activeServices.length}</b> service{activeServices.length !== 1 ? 's' : ''} active</span>
            </div>
          </div>
          <div className="cdash-actions">
            <button type="button" className="cdash-qa primary" onClick={() => onNav('ticket')}><span className="g">+</span> New request</button>
            <button type="button" className="cdash-qa" onClick={() => onNav('invoices')}>View invoices</button>
            <button type="button" className="cdash-qa" onClick={() => onNav('services')}>Manage services</button>
            <a className="cdash-qa" href="mailto:hello@kipkiren.co.ke?subject=Book%20a%20call">Book a call</a>
          </div>
        </div>

        {/* KPI row */}
        <div className="cdash-kpis cdash-reveal" style={cssVars({ '--d': '60ms' })}>
          <div className="cdash-kpi"><div className="cdash-kpi-l">Active projects</div><div className="cdash-kpi-v teal">{activeProjects.length}</div><div className="cdash-kpi-n">{completion}% avg complete</div></div>
          <div className="cdash-kpi"><div className="cdash-kpi-l">Open tickets</div><div className="cdash-kpi-v">{openTickets.length}</div><div className="cdash-kpi-n">{openTickets.filter((t) => t.status === 'in_progress').length} in progress</div></div>
          <div className="cdash-kpi"><div className="cdash-kpi-l">Invoices due</div><div className="cdash-kpi-v">{dueInvoices.length}</div><div className="cdash-kpi-n">{dueInvoices.length ? <span className="warn">KES {formatKes(dueTotal)} outstanding</span> : 'All settled'}</div></div>
          <div className="cdash-kpi"><div className="cdash-kpi-l">Spend this month</div><div className="cdash-kpi-v teal">{formatKes(thisMonthTotal)}</div><div className="cdash-kpi-n">KES · retainer + tasks</div></div>
          <div className="cdash-kpi"><div className="cdash-kpi-l">Avg response</div><div className="cdash-kpi-v">{trust ? `${trust.avg_response_hours}h` : '-'}</div><div className="cdash-kpi-n"><span className="up">Within SLA</span></div></div>
          <div className="cdash-kpi"><div className="cdash-kpi-l">Project completion</div><div className="cdash-kpi-v">{completion}%</div><div className="cdash-kpi-n">across {projects.length} project{projects.length !== 1 ? 's' : ''}</div></div>
        </div>

        {pendingProforma && (
          <div className="alert cdash-reveal" style={cssVars({ '--d': '90ms' })}>
            <div className="alert-txt"><strong>Proforma awaiting review</strong> - approve before work begins.</div>
            <button type="button" className="btn-rev" onClick={onReviewProforma}>Review →</button>
          </div>
        )}

        {/* main grid */}
        <div className="cdash-grid">
          <div className="cdash-col">
            {/* projects */}
            <div className="cdash-card cdash-reveal" style={cssVars({ '--d': '120ms' })}>
              <div className="cdash-sec"><h3>Active projects</h3><button type="button" onClick={() => onNav('ticket')}>New request</button></div>
              {projects.length === 0 ? (
                <div style={{ color: 'var(--mid)', fontSize: 12, padding: '8px 0' }}>No active projects. Submit a request to get started.</div>
              ) : (
                <div className="cdash-projs">
                  {projects.map((p, i) => (
                    <div key={p.id} className="cdash-proj">
                      <div className="cdash-proj-top">
                        <div className="cdash-proj-t">{p.title}</div>
                        <span className={`cdash-proj-st ${p.kind}`}>{p.status}</span>
                      </div>
                      <div className="cdash-bar"><i style={cssVars({ '--p': p.progress / 100, '--d': `${100 + i * 60}ms` })} /></div>
                      <div className="cdash-proj-meta"><span><b>{p.progress}%</b> complete</span><span>{dueLabel(p.due)}</span></div>
                      <div className="cdash-proj-foot"><span className="dot" />{p.last_activity} · {p.team}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* support center */}
            <div className="cdash-card cdash-reveal" style={cssVars({ '--d': '160ms' })}>
              <div className="cdash-sec"><h3>Support center</h3><button type="button" onClick={() => onNav('ticket')}>New ticket</button></div>
              {openTickets.length === 0 ? (
                <div style={{ color: 'var(--mid)', fontSize: 12, padding: '8px 0' }}>No open tickets. You are all caught up.</div>
              ) : openTickets.map((t) => {
                const pri = PRIORITY[t.urgency] ?? PRIORITY.standard;
                const waiting = t.status === 'dispatched' || t.status === 'ai_draft';
                return (
                  <div key={t.id} className="cdash-row">
                    <span className="tid">{t.ref}</span>
                    <span className="txt">{t.description}</span>
                    <span className={`cdash-pill ${pri!.cls}`}>{pri!.label}</span>
                    <span className={`cdash-pill ${waiting ? 'open' : 'wait'}`}>{waiting ? 'Waiting on you' : 'In progress'}</span>
                  </div>
                );
              })}
            </div>

            {/* invoices */}
            <div className="cdash-card cdash-reveal" style={cssVars({ '--d': '200ms' })}>
              <div className="cdash-sec"><h3>Invoices</h3><button type="button" onClick={() => onNav('invoices')}>View all</button></div>
              {(invoices ?? []).length === 0 ? (
                <div style={{ color: 'var(--mid)', fontSize: 12, padding: '8px 0' }}>No invoices yet.</div>
              ) : (invoices ?? []).slice(0, 4).map((inv) => {
                const due = !inv.paid_at;
                return (
                  <div key={inv.id} className="cdash-row">
                    <span className="tid">{inv.ref}</span>
                    <span className="txt">{inv.kind === 'retainer' ? 'Monthly retainer' : inv.kind === 'onboarding' ? 'Onboarding' : 'Task charge'}</span>
                    <span className="amt">KES {formatKes(inv.total_kes)}</span>
                    {due
                      ? <button type="button" className="cdash-pay" onClick={() => onNav('invoices')}>Pay now</button>
                      : <span className="cdash-pill ok">Paid</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="cdash-col">
            {/* activity feed */}
            <div className="cdash-card cdash-reveal" style={cssVars({ '--d': '140ms' })}>
              <div className="cdash-sec"><h3>Recent activity</h3></div>
              {activity.length === 0 ? (
                <div style={{ color: 'var(--mid)', fontSize: 12 }}>No recent activity.</div>
              ) : (
                <div className="cdash-feed">
                  {activity.map((a) => (
                    <div key={a.id} className={`cdash-fi ${a.kind}`}>
                      <div className="cdash-fi-dot"><i /></div>
                      <div><div className="cdash-fi-tx">{a.text}</div><div className="cdash-fi-at">{timeAgo(a.at)}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* service health */}
            <div className="cdash-card cdash-reveal" style={cssVars({ '--d': '180ms' })}>
              <div className="cdash-sec"><h3>Service health</h3></div>
              <div className="cdash-health">
                {health.map((h) => (
                  <div key={h.key} className={`cdash-hr ${h.status}`}>
                    <span className="hd" />
                    <span className="hl">{h.label}</span>
                    <span className="hv">{h.detail}</span>
                  </div>
                ))}
              </div>
              {allOperational && <div className="cdash-health-foot"><span className="hd" style={cssVars({ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', display: 'inline-block' })} />All systems operational</div>}
            </div>

            {/* trust */}
            {trust && (
              <div className="cdash-card cdash-reveal" style={cssVars({ '--d': '220ms' })}>
                <div className="cdash-sec"><h3>Your account</h3></div>
                <div className="cdash-trust">
                  <div><div className="cdash-tr-v">{trust.projects_completed}</div><div className="cdash-tr-l">Projects delivered</div></div>
                  <div><div className="cdash-tr-v">{trust.avg_response_hours}h</div><div className="cdash-tr-l">Avg response</div></div>
                  <div><div className="cdash-tr-v">{trust.uptime_pct}%</div><div className="cdash-tr-l">Uptime</div></div>
                  <div><div className="cdash-tr-v">{trust.satisfaction_pct}%</div><div className="cdash-tr-l">Satisfaction</div></div>
                </div>
                <div className="cdash-deliv">{trust.recent_deliverables.map((dlv) => <span key={dlv}>{dlv}</span>)}</div>
                <div className="cdash-subline" style={{ marginTop: 12, fontSize: 11 }}>Working together since {trust.since}.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEW TICKET
// ---------------------------------------------------------------------------
const CATEGORY_MAP: Record<string, string> = {
  'Web Development': 'web',
  'Cloud Services': 'cloud',
  'SEO': 'seo',
  'Social Media': 'social',
  'Domain / DNS': 'dns',
  'Not sure': 'web',
};
const URGENCY_MAP: Record<string, string> = {
  'Standard (within SLA)': 'standard',
  'Elevated - within 48hrs': 'elevated',
  'Urgent - within 24hrs': 'urgent',
};

function TicketView({ onSubmitted }: { onSubmitted: () => void }) {
  const call = useApi();
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('Web Development');
  const [urgency, setUrgency] = useState('Standard (within SLA)');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!desc.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await call('/v1/tickets', {
        method: 'POST',
        body: {
          description: desc.trim(),
          category: CATEGORY_MAP[category] ?? 'web',
          urgency: URGENCY_MAP[urgency] ?? 'standard',
        },
      });
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="view">
      <div className="fsec">
        <div className="ftit">Submit a new request</div>
        <div className="fsub">
          Describe what you need in plain language. Our AI engine will decompose and price it within 24 hours - you approve before anything starts.
        </div>
        <div className="fld">
          <label>Describe your request</label>
          <textarea
            placeholder="e.g. I need to add a new services page to my website with 4 sections - intro, what we offer, a pricing table, and a contact form at the bottom."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="fg2">
          <div className="fld">
            <label>Service category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={submitting}>
              <option>Web Development</option>
              <option>Cloud Services</option>
              <option>SEO</option>
              <option>Social Media</option>
              <option>Domain / DNS</option>
              <option>Not sure</option>
            </select>
          </div>
          <div className="fld">
            <label>Urgency</label>
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} disabled={submitting}>
              <option>Standard (within SLA)</option>
              <option>Elevated - within 48hrs</option>
              <option>Urgent - within 24hrs</option>
            </select>
          </div>
        </div>
        <div className="fld">
          <label>Attachments (optional)</label>
          <div className="attach"><div className="attach-t">Drop files here · screenshots, references, briefs</div></div>
        </div>
        <div className="ai-note">
          After submission, our AI engine decomposes your request into sub-tasks and generates a proforma with line-item pricing. You receive the proforma within 24 hours. <strong>Work begins only once you approve.</strong>
        </div>
        {error && <div className="lg-error">{error}</div>}
        <button type="button" className="btn-sub" disabled={submitting || !desc.trim()} onClick={() => void handleSubmit()}>
          {submitting ? 'Submitting...' : 'Submit request →'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PROFORMA
// ---------------------------------------------------------------------------
interface ProformaProps {
  paid: boolean;
  onApprove: () => void;
}
function ProformaView({ paid, onApprove }: ProformaProps) {
  const statusBadgeStyle = paid
    ? { background: 'var(--teal-light)', color: 'var(--teal-deep)', borderColor: 'var(--teal-deep)' }
    : { background: 'var(--amber-light)', color: 'var(--amber-deep)', borderColor: 'var(--amber-deep)' };

  return (
    <div className="view">
      <div className="pf-hd">
        <div className="pf-ref">Proforma · KWS-042</div>
        <div className="pf-tit">Homepage hero section redesign</div>
        <div className="pf-mt">Submitted 9 Apr 2026 · Growth Plan · Jane Wanjiru</div>
        <div className="pf-st" style={statusBadgeStyle}>
          {paid ? 'Paid · Scope locked' : 'Awaiting your approval'}
        </div>
      </div>
      <table className="pft">
        <thead>
          <tr>
            <th style={{ width: '42%' }}>Sub-task</th>
            <th>Est. hours</th>
            <th>Rate (KES/hr)</th>
            <th style={{ textAlign: 'right' }}>Amount (KES)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><div className="pf-tn">Creative brief review & wireframe</div><div className="pf-td">Review current hero, align on layout and messaging</div></td>
            <td><span className="pf-hr">0.5 hrs</span></td>
            <td><span className="pf-rt">3,500</span></td>
            <td className="pf-am">1,750</td>
          </tr>
          <tr>
            <td><div className="pf-tn">Copy update - headline & subheadline</div><div className="pf-td">Rewrite hero headline, subheadline, and CTA text</div></td>
            <td><span className="pf-hr">0.5 hrs</span></td>
            <td><span className="pf-rt">3,500</span></td>
            <td className="pf-am">1,750</td>
          </tr>
          <tr>
            <td><div className="pf-tn">Visual redesign - hero layout</div><div className="pf-td">Implement new layout, typography, image placement</div></td>
            <td><span className="pf-hr">2.0 hrs</span></td>
            <td><span className="pf-rt">3,500</span></td>
            <td className="pf-am">7,000</td>
          </tr>
          <tr>
            <td><div className="pf-tn">Mobile responsiveness check & fix</div><div className="pf-td">Verify hero on mobile and tablet; fix breakpoints</div></td>
            <td><span className="pf-hr">0.5 hrs</span></td>
            <td><span className="pf-rt">3,500</span></td>
            <td className="pf-am">1,750</td>
          </tr>
          <tr>
            <td><div className="pf-tn">QA review & staging sign-off</div><div className="pf-td">Internal QA; share staging link before go-live</div></td>
            <td><span className="pf-hr">0.25 hrs</span></td>
            <td><span className="pf-rt">3,500</span></td>
            <td className="pf-am">875</td>
          </tr>
        </tbody>
      </table>
      <div className="pf-tots">
        <div className="pf-tr"><span className="pf-tl">Subtotal</span><span className="pf-tv">KES 13,125</span></div>
        <div className="pf-tr">
          <span className="pf-tl">Growth Plan discount (−10%)</span>
          <span className="pf-tv" style={{ color: 'var(--teal-deep)' }}>− KES 1,313</span>
        </div>
        <div className="pf-tr"><span className="pf-tl">VAT 16%</span><span className="pf-tv">KES 1,893</span></div>
        <div className="pf-tr" style={{ marginTop: 4 }}>
          <span className="pf-tl" style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ink)' }}>Total due</span>
          <span className="pf-tv" style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>KES 13,705</span>
        </div>
      </div>
      <div className="pf-scope" style={{ marginTop: 2 }}>
        {paid
          ? 'Scope is locked. Work begins within 2 business days. Any additions require a new ticket.'
          : 'Approving this proforma locks the scope above. Any additions require a new ticket.'}
      </div>
      {paid ? (
        <div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--teal-deep)' }}>
            Payment received · Ref QHJ7K2P9X4 · Work order created
          </span>
        </div>
      ) : (
        <div className="pf-acts">
          <button type="button" className="btn-app" onClick={onApprove}>Approve & pay →</button>
          <button type="button" className="btn-rq">Request revision</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// INVOICES
// ---------------------------------------------------------------------------
const INV_LABEL: Record<string, string> = { retainer: 'Monthly retainer', task: 'Task charge', onboarding: 'Onboarding fee' };

function InvoicesView({ invoices, loading }: { invoices: ClientInvoice[] | null; loading: boolean }) {
  const [filter, setFilter] = useState<'all' | 'retainer' | 'task' | 'pending'>('all');
  const rows = invoices ?? [];
  const filtered = rows.filter((i) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return !i.paid_at;
    return i.kind === filter;
  });
  const year = new Date().getFullYear();
  const yearInvoices = rows.filter((i) => new Date(i.issued_at).getFullYear() === year);
  const totalPaid = yearInvoices.filter((i) => i.paid_at).reduce((s, i) => s + i.total_kes, 0);
  const retainerSpend = yearInvoices.filter((i) => i.kind === 'retainer').reduce((s, i) => s + i.total_kes, 0);
  const taskSpend = yearInvoices.filter((i) => i.kind === 'task').reduce((s, i) => s + i.total_kes, 0);
  const due = rows.filter((i) => !i.paid_at);
  const outstanding = due.reduce((s, i) => s + i.total_kes, 0);

  const FILTERS: { k: typeof filter; label: string }[] = [
    { k: 'all', label: 'All' }, { k: 'retainer', label: 'Retainer' },
    { k: 'task', label: 'Task charges' }, { k: 'pending', label: 'Pending' },
  ];

  return (
    <div className="view">
      <div className="cdash">
        <div className="cdash-head cdash-reveal">
          <div>
            <div className="cdash-hi">Billing</div>
            <div className="cdash-subline">Retainer charges and approved task invoices. Receipts are emailed automatically.</div>
          </div>
        </div>

        {/* balance overview */}
        <div className="cdash-card cdash-reveal" style={cssVars({ '--d': '60ms' })}>
          <div className="cdash-billing">
            <div>
              <div className="cdash-billing-l">{outstanding > 0 ? 'Outstanding balance' : 'Account balance'}</div>
              <div className={`cdash-billing-v ${outstanding > 0 ? 'due' : 'clear'}`}>{loading ? '-' : outstanding > 0 ? `KES ${formatKes(outstanding)}` : 'All settled'}</div>
              <div className="cdash-billing-n">{due.length ? `${due.length} invoice${due.length !== 1 ? 's' : ''} awaiting payment` : `No balance due · paid up to date`}</div>
            </div>
            <div className="cdash-billing-r">
              {outstanding > 0 && <button type="button" className="cdash-qa primary"><span className="g">→</span> Pay outstanding</button>}
              <span className="cdash-methods">Pay by M-Pesa or card · receipts emailed</span>
            </div>
          </div>
        </div>

        {/* year totals */}
        <div className="cdash-kpis cdash-reveal" style={cssVars({ '--d': '100ms' })}>
          <div className="cdash-kpi"><div className="cdash-kpi-l">Total paid · {year}</div><div className="cdash-kpi-v teal">{loading ? '-' : formatKes(totalPaid)}</div><div className="cdash-kpi-n">KES · retainer + tasks</div></div>
          <div className="cdash-kpi"><div className="cdash-kpi-l">Retainer spend</div><div className="cdash-kpi-v">{loading ? '-' : formatKes(retainerSpend)}</div><div className="cdash-kpi-n">{yearInvoices.filter((i) => i.kind === 'retainer').length} invoices</div></div>
          <div className="cdash-kpi"><div className="cdash-kpi-l">Task charges</div><div className="cdash-kpi-v">{loading ? '-' : formatKes(taskSpend)}</div><div className="cdash-kpi-n">{yearInvoices.filter((i) => i.kind === 'task').length} tasks</div></div>
          <div className="cdash-kpi"><div className="cdash-kpi-l">Outstanding</div><div className="cdash-kpi-v">{loading ? '-' : formatKes(outstanding)}</div><div className="cdash-kpi-n">{due.length ? <span className="warn">{due.length} due</span> : 'All settled'}</div></div>
        </div>

        {/* invoice list */}
        <div className="cdash-card cdash-reveal" style={cssVars({ '--d': '140ms' })}>
          <div className="cdash-sec"><h3>Invoices</h3></div>
          <div className="cdash-filters">
            {FILTERS.map((f) => (
              <button key={f.k} type="button" className={`filter-btn ${filter === f.k ? 'active' : ''}`} onClick={() => setFilter(f.k)}>{f.label}</button>
            ))}
          </div>
          {loading ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--mid)', fontSize: 12 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--mid)', fontSize: 12 }}>No invoices in this view.</div>
          ) : filtered.map((inv) => {
            const paid = !!inv.paid_at;
            const dateStr = new Date(inv.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            return (
              <div key={inv.id} className="cdash-row">
                <span className={`cdash-pill ${paid ? 'ok' : 'md'}`}>{paid ? 'Paid' : 'Due'}</span>
                <span className="tid">{inv.ref}</span>
                <span className="txt">{INV_LABEL[inv.kind] ?? 'Charge'}</span>
                <span className="dt">{dateStr}</span>
                <span className="amt">KES {formatKes(inv.total_kes)}</span>
                {paid
                  ? <button type="button" className="cdash-pay ghost">Receipt</button>
                  : <button type="button" className="cdash-pay">Pay now</button>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SERVICES
// ---------------------------------------------------------------------------
function ServicesView({ services, loading, onRenewDomain }: { services: ClientService[] | null; loading: boolean; onRenewDomain: () => void }) {
  const d = '-';
  const rows = services ?? [];

  return (
    <div className="view">
      <div className="greeting" style={{ fontSize: 22, marginBottom: 3 }}>Your <em>Services</em></div>
      <div className="g-sub">Manage active services, view health status, and add new services.</div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--mid)' }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--mid)' }}>No services provisioned yet</div>
      ) : rows.map((svc) => {
        const meta = svc.metadata as Record<string, unknown>;
        const domain = meta.domain as string | undefined;
        const description = meta.description as string | undefined;
        const isExpiring = svc.status === 'expiring';
        const isExpired = svc.status === 'expired';
        const isDomain = svc.service_type === 'domain';
        const renewalDate = svc.renewal_at ? new Date(svc.renewal_at) : null;
        const daysUntilRenewal = renewalDate ? Math.ceil((renewalDate.getTime() - Date.now()) / 86_400_000) : null;
        const renewalLabel = renewalDate ? renewalDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : d;
        const statusCls = isExpiring || isExpired ? 'bdg-a' : svc.status === 'suspended' ? 'bdg-o' : 'bdg-t';
        const statusLabel = isExpiring ? 'Renew soon' : isExpired ? 'Expired' : svc.status === 'suspended' ? 'Suspended' : 'Active';

        return (
          <div key={svc.id} className={`svc-card ${isExpiring ? 'warn-card' : ''}`}>
            <div className="svc-card-hd">
              <div>
                <div className="svc-card-title">{serviceTypeLabel(svc.service_type)}</div>
                <div className="svc-card-sub">{domain ?? description ?? svc.service_type}</div>
              </div>
              <div className={`bdg ${statusCls}`}>{statusLabel}</div>
            </div>
            {/* Uptime blocks for hosting services */}
            {svc.service_type === 'hosting' && Array.isArray(meta.uptime_checks) && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--mid)', marginBottom: 6 }}>
                  Uptime · last {(meta.uptime_checks as { ok: boolean }[]).length} checks
                </div>
                <div className="uptime-row">
                  {(meta.uptime_checks as { ok: boolean }[]).map((c, i) => (
                    <div key={i} className={`uptime-block ${!c.ok ? 'down' : ''}`} />
                  ))}
                </div>
                <div className="uptime-lbl">{String(meta.uptime_pct ?? 100)}% uptime</div>
              </div>
            )}
            {/* SEO metrics */}
            {svc.service_type === 'seo_retainer' && (meta.technical_score != null || meta.indexed_pages != null) && (
              <div className="svc-detail-grid" style={{ marginBottom: 10 }}>
                {meta.technical_score != null && <div className="svc-detail"><div className="svc-dl">Technical score</div><div className="svc-dv mono">{String(meta.technical_score)}/100</div></div>}
                {meta.indexed_pages != null && <div className="svc-detail"><div className="svc-dl">Indexed pages</div><div className="svc-dv mono">{String(meta.indexed_pages)}</div></div>}
                {meta.gsc_property_verified != null && <div className="svc-detail"><div className="svc-dl">GSC verified</div><div className="svc-dv">{meta.gsc_property_verified ? 'Yes' : 'No'}</div></div>}
                {meta.last_audit != null && <div className="svc-detail"><div className="svc-dl">Last audit</div><div className="svc-dv">{String(meta.last_audit)}</div></div>}
              </div>
            )}
            {/* Social media platforms */}
            {svc.service_type === 'social_retainer' && Array.isArray(meta.platforms) && (
              <div className="svc-detail-grid" style={{ marginBottom: 10 }}>
                {(meta.platforms as string[]).map((p) => {
                  const pd = meta[p] as Record<string, unknown> | undefined;
                  return (
                    <div key={p} className="svc-detail">
                      <div className="svc-dl">{p}</div>
                      <div className="svc-dv">{pd?.handle ? String(pd.handle) : p}{pd?.followers ? ` · ${String(pd.followers)} followers` : ''}</div>
                    </div>
                  );
                })}
                {meta.posts_per_month != null && <div className="svc-detail"><div className="svc-dl">Posts / month</div><div className="svc-dv mono">{String(meta.posts_per_month)}</div></div>}
              </div>
            )}
            <div className="svc-detail-grid">
              <div className="svc-detail">
                <div className="svc-dl">Type</div>
                <div className="svc-dv">{serviceTypeLabel(svc.service_type)}</div>
              </div>
              <div className="svc-detail">
                <div className="svc-dl">Monthly cost</div>
                <div className="svc-dv mono">KES {formatKes(svc.monthly_cost_kes)}</div>
              </div>
              {renewalDate && (
                <div className="svc-detail" style={isExpiring ? { background: 'var(--amber-light)', border: '1px solid var(--amber)' } : undefined}>
                  <div className="svc-dl" style={isExpiring ? { color: 'var(--amber-deep)' } : undefined}>{isExpiring ? 'Expires' : 'Next renewal'}</div>
                  <div className="svc-dv" style={isExpiring ? { color: 'var(--amber-deep)', fontWeight: 500 } : undefined}>
                    {renewalLabel}{daysUntilRenewal !== null && daysUntilRenewal > 0 && daysUntilRenewal <= 60 ? ` · ${daysUntilRenewal} days` : ''}
                  </div>
                </div>
              )}
            </div>
            {isExpiring && isDomain && (
              <div style={{ background: 'var(--amber-light)', borderLeft: '3px solid var(--amber-deep)', padding: '10px 14px', fontSize: 12, color: 'var(--amber-deep)', marginBottom: 12, lineHeight: 1.6 }}>
                Your domain expires in {daysUntilRenewal} days. If not renewed, your website and email will go offline.
              </div>
            )}
            <div className="svc-actions">
              {isExpiring && isDomain && (
                <button type="button" className="btn-svc btn-svc-a" onClick={onRenewDomain}>Pay renewal →</button>
              )}
            </div>
          </div>
        );
      })}

      <div className="add-svc">
        <div>
          <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, marginBottom: 3 }}>Add a service</div>
          <div className="add-svc-txt">SSL · Microsoft 365 · SEO monthly · Social media management</div>
        </div>
        <button type="button" className="btn-svc btn-svc-t">Browse services →</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAYMENT MODAL - 4 states
// ---------------------------------------------------------------------------
interface PaymentModalProps {
  modal: ModalConfig;
  onClose: () => void;
  onSwitchTab: (tab: PayTab) => void;
  onTriggerSTK: () => void;
  onTriggerCard: () => void;
  onConfirmPayment: () => void;
  onDone: () => void;
  onMpesaNumberChange: (n: string) => void;
}
function PaymentModal(p: PaymentModalProps) {
  const isDomain = p.modal.context === 'domain';
  const title = isDomain ? 'Renew domain registration' : 'Review & pay · KWS-042';

  return (
    <div className="pay-overlay open">
      <div className="pay-modal">
        <div className="modal-hd">
          <div className="modal-title">{title}</div>
          <button type="button" className="modal-close" onClick={p.onClose} aria-label="Close">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {p.modal.state === 'checkout' && (
          <div className="modal-state active">
            <div className="modal-body">
              <div className="order-col">
                <div className="col-hd">Order summary</div>
                <div className="plan-badge">
                  {isDomain ? 'Domain renewal · 1 yr' : 'Growth Plan · Jane Wanjiru'}
                </div>
                <div className="order-item">
                  {isDomain ? (
                    <>
                      <div className="oi-name">Domain renewal · jwlogistics.co.ke</div>
                      <div className="oi-meta">Annual renewal via Cloudflare DNS · 1 year</div>
                    </>
                  ) : (
                    <>
                      <div className="oi-name">Homepage hero section redesign</div>
                      <div className="oi-meta">Proforma KWS-042 · Web Development · 3.75 hrs</div>
                      <div className="oi-tasks">
                        <div className="oi-task-row"><span className="oi-task-name">Brief review & wireframe</span><span className="oi-task-amt">1,750</span></div>
                        <div className="oi-task-row"><span className="oi-task-name">Copy - headline & subheadline</span><span className="oi-task-amt">1,750</span></div>
                        <div className="oi-task-row"><span className="oi-task-name">Visual redesign - hero layout</span><span className="oi-task-amt">7,000</span></div>
                        <div className="oi-task-row"><span className="oi-task-name">Mobile responsiveness fix</span><span className="oi-task-amt">1,750</span></div>
                        <div className="oi-task-row"><span className="oi-task-name">QA & staging sign-off</span><span className="oi-task-amt">875</span></div>
                      </div>
                    </>
                  )}
                </div>
                <div className="order-summary">
                  {isDomain ? (
                    <>
                      <div className="os-row"><span className="os-lbl">Domain registration</span><span className="os-val">KES 1,552</span></div>
                      <div className="os-row"><span className="os-lbl">VAT 16%</span><span className="os-val">KES 248</span></div>
                      <div className="os-row total"><span className="os-lbl">Total due</span><span className="os-val">KES 1,800</span></div>
                    </>
                  ) : (
                    <>
                      <div className="os-row"><span className="os-lbl">Subtotal</span><span className="os-val">KES 13,125</span></div>
                      <div className="os-row discount"><span className="os-lbl">Growth Plan discount (10%)</span><span className="os-val">− KES 1,313</span></div>
                      <div className="os-row"><span className="os-lbl">VAT 16%</span><span className="os-val">KES 1,893</span></div>
                      <div className="os-row total"><span className="os-lbl">Total due</span><span className="os-val">KES 13,705</span></div>
                    </>
                  )}
                </div>
              </div>
              <div className="pay-col">
                <div className="col-hd">Payment</div>
                <div className="pay-tabs">
                  <button type="button" className={`ptab ${p.modal.tab === 'mpesa' ? 'active' : ''}`} onClick={() => p.onSwitchTab('mpesa')}>M-Pesa</button>
                  <button type="button" className={`ptab ${p.modal.tab === 'card' ? 'active' : ''}`} onClick={() => p.onSwitchTab('card')}>Card</button>
                </div>
                {p.modal.tab === 'mpesa' && (
                  <div className="pay-panel active">
                    <div className="rail-mark mpesa-mark" style={{ marginBottom: 12 }}><div className="mark-t">M-Pesa</div></div>
                    <div className="pfield">
                      <label>Safaricom number</label>
                      <input type="text" value={p.modal.mpesaNumber} onChange={(e) => p.onMpesaNumberChange(e.target.value)} />
                    </div>
                    <button type="button" className="btn-pay" onClick={p.onTriggerSTK}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="2" y="1" width="8" height="10" rx="1.5" stroke="white" strokeWidth="1.2" />
                        <rect x="4" y="8.5" width="4" height="1" rx="0.5" fill="white" />
                      </svg>
                      Send STK push
                    </button>
                    <div className="pay-note">A prompt appears on your phone.<br />Enter PIN to confirm.</div>
                  </div>
                )}
                {p.modal.tab === 'card' && (
                  <div className="pay-panel active">
                    <div className="rail-mark paystack-mark" style={{ marginBottom: 12 }}><div className="mark-t">Paystack</div></div>
                    <div className="pfield">
                      <label>Card number</label>
                      <input type="text" placeholder="1234  5678  9012  3456" />
                    </div>
                    <div className="pfield-2">
                      <div className="pfield"><label>Expiry</label><input type="text" placeholder="MM / YY" /></div>
                      <div className="pfield"><label>CVV</label><input type="text" placeholder="•••" /></div>
                    </div>
                    <div className="pfield"><label>Name on card</label><input type="text" placeholder="Jane Wanjiru" /></div>
                    <button type="button" className="btn-pay" onClick={p.onTriggerCard}>Pay now →</button>
                    <div className="lipa-note">LipaPlus coming soon - <span>Kipkiren Pay</span></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {p.modal.state === 'stk' && (
          <div className="modal-state active">
            <div className="stk-wrap">
              <div className="stk-split">
                <div className="stk-left">
                  <div className="stk-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <rect x="5" y="2" width="14" height="20" rx="2" stroke="#0D5C4E" strokeWidth="1.5" />
                      <rect x="9" y="18" width="6" height="1.2" rx="0.6" fill="#0D5C4E" />
                    </svg>
                  </div>
                  <div className="stk-heading">Check your <em>phone</em></div>
                  <div className="stk-sub">An M-Pesa prompt has been sent. Enter your PIN to confirm the payment.</div>
                  <div className="stk-num">{p.modal.mpesaNumber}</div>
                  <div className="stk-dots">
                    <div className="stk-dot a1" />
                    <div className="stk-dot a2" />
                    <div className="stk-dot a3" />
                  </div>
                  <div className="stk-wlbl">Waiting for PIN confirmation</div>
                  <div className="stk-acts">
                    <button type="button" className="btn-resend">Resend push</button>
                    <button type="button" className="btn-stk-confirm" onClick={p.onConfirmPayment}>Confirm payment →</button>
                  </div>
                </div>
                <div className="stk-right">
                  <MiniOrder isDomain={isDomain} />
                </div>
              </div>
            </div>
          </div>
        )}

        {p.modal.state === 'proc' && (
          <div className="modal-state active">
            <div className="proc-body">
              <div className="proc-spinner">
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                  <circle cx="22" cy="22" r="18" stroke="#DDD8CC" strokeWidth="2.5" />
                  <path className="spin" d="M22 4 A18 18 0 0 1 40 22" stroke="#0D5C4E" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="proc-heading">Processing payment</div>
              <div className="proc-sub">Communicating with Paystack.<br />Do not close this window.</div>
              <div style={{ marginTop: 24 }}>
                <button
                  type="button"
                  style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', background: 'transparent', color: 'var(--mid)', padding: '8px 16px', border: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={p.onConfirmPayment}
                >
                  Skip →
                </button>
              </div>
            </div>
          </div>
        )}

        {p.modal.state === 'confirm' && (
          <div className="modal-state active">
            <div className="confirm-wrap">
              <div className="confirm-split">
                <div className="confirm-left">
                  <div className="confirm-icon">
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                      <path d="M4 11L9 16L18 7" stroke="#0D5C4E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="confirm-heading">Payment <em>confirmed</em></div>
                  <div className="confirm-sub">
                    Scope is locked. Work begins within 2 business days. Receipt sent to jane@jwlogistics.co.ke
                  </div>
                  <div className="receipt">
                    <div className="rrow"><span className="rlbl">M-Pesa ref</span><span className="rval t">QHJ7K2P9X4</span></div>
                    <div className="rrow"><span className="rlbl">Invoice</span><span className="rval">{isDomain ? 'DOM-RENEW-042' : 'KWS-042'}</span></div>
                    <div className="rrow"><span className="rlbl">Date & time</span><span className="rval">11 Apr 2026 · 14:37</span></div>
                    <div className="rrow"><span className="rlbl">Method</span><span className="rval">M-Pesa · {p.modal.mpesaNumber}</span></div>
                    <div className="rrow"><span className="rlbl">Amount paid</span><span className="rval">{isDomain ? 'KES 1,800' : 'KES 13,705'}</span></div>
                  </div>
                  <div className="confirm-acts">
                    <button type="button" className="btn-dl">Download receipt</button>
                    <button type="button" className="btn-done-pay" onClick={p.onDone}>Done →</button>
                  </div>
                </div>
                <div className="stk-right">
                  <MiniOrder isDomain={isDomain} />
                  <div className="work-note" style={{ marginTop: 10 }}>Scope locked. Additions require a new ticket.</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniOrder({ isDomain }: { isDomain: boolean }) {
  if (isDomain) {
    return (
      <div className="mini-order">
        <div className="mini-hd">Your order</div>
        <div className="mini-row"><span className="mini-lbl">jwlogistics.co.ke</span><span className="mini-val">1,552</span></div>
        <div className="mini-row"><span className="mini-lbl">VAT 16%</span><span className="mini-val">248</span></div>
        <div className="mini-total">
          <span className="mini-total-lbl">Total</span>
          <span className="mini-total-val">KES 1,800</span>
        </div>
      </div>
    );
  }
  return (
    <div className="mini-order">
      <div className="mini-hd">Your order</div>
      <div className="mini-row"><span className="mini-lbl">Hero redesign</span><span className="mini-val">13,125</span></div>
      <div className="mini-row"><span className="mini-lbl">Plan discount</span><span className="mini-val" style={{ color: 'var(--teal-deep)' }}>−1,313</span></div>
      <div className="mini-row"><span className="mini-lbl">VAT 16%</span><span className="mini-val">1,893</span></div>
      <div className="mini-total">
        <span className="mini-total-lbl">Total</span>
        <span className="mini-total-val">KES 13,705</span>
      </div>
    </div>
  );
}
