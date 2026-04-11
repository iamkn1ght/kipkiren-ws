/**
 * Client Portal — ported verbatim from kws_client_portal_v3.html.
 *
 * The HTML mockup is the canonical design output of the founding session.
 * Markup, copy, class names, and visual states match it character-for-character.
 * Do not redesign in this file. If a token or layout needs to change, update
 * the canonical HTML first and re-port.
 *
 * State model mirrors the original vanilla JS:
 *   - view  : 'dashboard' | 'ticket' | 'proforma' | 'invoices' | 'services'
 *   - modal : null | { context: 'proforma' | 'domain', state: 'checkout' | 'stk' | 'proc' | 'confirm' }
 *
 * The data shown is intentionally the same demo data as the canonical mockup
 * (Jane Wanjiru, Growth Plan, KWS-042 KES 13,705). Real data lands when the
 * portal is wired to /v1/auth, /v1/tickets, /v1/proformas, /v1/invoices in
 * a follow-up ticket. The wiring happens against THIS markup — never replace
 * the markup with a "data-driven" rewrite.
 */

import { useState } from 'react';

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
  const [view, setView] = useState<View>('dashboard');
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const [proformaPaid, setProformaPaid] = useState(false);

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
    <div className="kwsp">
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
          <div className="sb-plan">Growth Plan</div>
          <div className="sb-name">Jane Wanjiru</div>
        </div>
      </div>

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <div className="tb-crumb">ws.kipkiren.co.ke / <span>{VIEW_LABELS[view]}</span></div>
          <button type="button" className="btn-nt" onClick={() => setView('ticket')}>+ New Ticket</button>
        </div>

        {view === 'dashboard' && <DashboardView onReviewProforma={() => setView('proforma')} />}
        {view === 'ticket' && <TicketView />}
        {view === 'proforma' && <ProformaView paid={proformaPaid} onApprove={() => openPayModal('proforma')} />}
        {view === 'invoices' && <InvoicesView />}
        {view === 'services' && <ServicesView onRenewDomain={() => openPayModal('domain')} />}

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
function DashboardView({ onReviewProforma }: { onReviewProforma: () => void }) {
  return (
    <div className="view">
      <div className="greeting">Good morning, <em>Jane.</em></div>
      <div className="g-sub">You have 2 open tickets and 1 proforma awaiting your approval.</div>
      <div className="alert">
        <div className="alert-txt">
          <strong>Proforma #KWS-042</strong> — Homepage hero redesign · awaiting your approval before work begins.
        </div>
        <button type="button" className="btn-rev" onClick={onReviewProforma}>Review →</button>
      </div>
      <div className="stats">
        <div className="sc">
          <div className="sc-lbl">Active services</div>
          <div className="sc-val" style={{ color: 'var(--teal-deep)' }}>3</div>
          <div className="sc-note">Hosting · Domain · Workspace</div>
        </div>
        <div className="sc">
          <div className="sc-lbl">Open tickets</div>
          <div className="sc-val">2</div>
          <div className="sc-note">1 in progress · 1 pending</div>
        </div>
        <div className="sc">
          <div className="sc-lbl">This month</div>
          <div className="sc-val" style={{ fontSize: 16, marginTop: 3, color: 'var(--teal-deep)' }}>KES 9,999</div>
          <div className="sc-note">Retainer only · 0 task charges</div>
        </div>
        <div className="sc">
          <div className="sc-lbl">SLA status</div>
          <div className="sc-val" style={{ fontSize: 13, color: '#22c55e', marginTop: 4 }}>● All clear</div>
          <div className="sc-note">No breaches this month</div>
        </div>
      </div>
      <div className="shd">Active services</div>
      <div className="svc-list">
        <div className="svc-row">
          <div className="dot dg" />
          <div className="svc-nm">Managed Hosting</div>
          <div className="svc-mt">janewanjiru-logistics.co.ke</div>
          <div className="bdg bdg-t">Active</div>
        </div>
        <div className="svc-row">
          <div className="dot da" />
          <div className="svc-nm">Domain Registration</div>
          <div className="svc-mt">Expires in 42 days</div>
          <div className="bdg bdg-a">Renew soon</div>
        </div>
        <div className="svc-row">
          <div className="dot dg" />
          <div className="svc-nm">Google Workspace</div>
          <div className="svc-mt">5 users · jane@jwlogistics.co.ke</div>
          <div className="bdg bdg-t">Active</div>
        </div>
      </div>
      <div className="shd">Open tickets</div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Ticket</th><th>Subject</th><th>Category</th><th>SLA</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span className="tid">KWS-041</span></td>
            <td>Update team page with 3 new staff</td>
            <td style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mid)' }}>Web</td>
            <td>
              <div className="sla-w">
                <div className="sla-tr"><div className="sla-fl fl-g" /></div>
                <span className="sla-t">18h left</span>
              </div>
            </td>
            <td><span className="bdg bdg-t">In progress</span></td>
          </tr>
          <tr>
            <td><span className="tid">KWS-042</span></td>
            <td>Homepage hero section redesign</td>
            <td style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mid)' }}>Web</td>
            <td>
              <div className="sla-w">
                <div className="sla-tr"><div className="sla-fl fl-a" /></div>
                <span className="sla-t">Pending</span>
              </div>
            </td>
            <td><span className="bdg bdg-a">Awaiting you</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEW TICKET
// ---------------------------------------------------------------------------
function TicketView() {
  return (
    <div className="view">
      <div className="fsec">
        <div className="ftit">Submit a new request</div>
        <div className="fsub">
          Describe what you need in plain language. Our AI engine will decompose and price it within 24 hours — you approve before anything starts.
        </div>
        <div className="fld">
          <label>Describe your request</label>
          <textarea placeholder="e.g. I need to add a new services page to my website with 4 sections — intro, what we offer, a pricing table, and a contact form at the bottom." />
        </div>
        <div className="fg2">
          <div className="fld">
            <label>Service category</label>
            <select>
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
            <select>
              <option>Standard (within SLA)</option>
              <option>Elevated — within 48hrs</option>
              <option>Urgent — within 24hrs</option>
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
        <button type="button" className="btn-sub">Submit request →</button>
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
            <td><div className="pf-tn">Copy update — headline & subheadline</div><div className="pf-td">Rewrite hero headline, subheadline, and CTA text</div></td>
            <td><span className="pf-hr">0.5 hrs</span></td>
            <td><span className="pf-rt">3,500</span></td>
            <td className="pf-am">1,750</td>
          </tr>
          <tr>
            <td><div className="pf-tn">Visual redesign — hero layout</div><div className="pf-td">Implement new layout, typography, image placement</div></td>
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
function InvoicesView() {
  const [filter, setFilter] = useState<'all' | 'retainer' | 'task' | 'pending'>('all');
  return (
    <div className="view">
      <div className="greeting" style={{ fontSize: 22, marginBottom: 3 }}>Invoice <em>History</em></div>
      <div className="g-sub">All retainer charges and approved task invoices.</div>
      <div className="inv-summary">
        <div className="sc">
          <div className="sc-lbl">Total paid · 2026</div>
          <div className="sc-val" style={{ color: 'var(--teal-deep)', fontSize: 20 }}>KES 48,247</div>
          <div className="sc-note">Retainer + task charges</div>
        </div>
        <div className="sc">
          <div className="sc-lbl">Retainer spend</div>
          <div className="sc-val" style={{ fontSize: 20 }}>KES 39,996</div>
          <div className="sc-note">4 months × KES 9,999</div>
        </div>
        <div className="sc">
          <div className="sc-lbl">Task charges</div>
          <div className="sc-val" style={{ fontSize: 20 }}>KES 8,251</div>
          <div className="sc-note">3 approved tasks</div>
        </div>
      </div>
      <div className="inv-filter">
        <button type="button" className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
        <button type="button" className={`filter-btn ${filter === 'retainer' ? 'active' : ''}`} onClick={() => setFilter('retainer')}>Retainer</button>
        <button type="button" className={`filter-btn ${filter === 'task' ? 'active' : ''}`} onClick={() => setFilter('task')}>Task charges</button>
        <button type="button" className={`filter-btn ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>Pending</button>
      </div>
      <div className="inv-row-hd">
        <span>Invoice</span><span>Description</span><span>Type</span><span>Date</span>
        <span style={{ textAlign: 'right', display: 'block' }}>Amount</span>
      </div>
      <div className="inv-row">
        <span className="inv-id">RET-2026-04</span>
        <span className="inv-desc">Growth Plan retainer · April 2026</span>
        <span><div className="bdg bdg-t" style={{ display: 'inline-block' }}>Retainer</div></span>
        <span className="inv-date">1 Apr 2026</span>
        <span className="inv-amt">KES 9,999</span>
      </div>
      <div className="inv-row">
        <span className="inv-id">TSK-2026-039</span>
        <span className="inv-desc">SEO audit — homepage & 4 service pages</span>
        <span><div className="bdg bdg-k" style={{ display: 'inline-block' }}>Task</div></span>
        <span className="inv-date">28 Mar 2026</span>
        <span className="inv-amt">KES 5,220</span>
      </div>
      <div className="inv-row">
        <span className="inv-id">RET-2026-03</span>
        <span className="inv-desc">Growth Plan retainer · March 2026</span>
        <span><div className="bdg bdg-t" style={{ display: 'inline-block' }}>Retainer</div></span>
        <span className="inv-date">1 Mar 2026</span>
        <span className="inv-amt">KES 9,999</span>
      </div>
      <div className="inv-row">
        <span className="inv-id">TSK-2026-031</span>
        <span className="inv-desc">Contact form rebuild + spam protection</span>
        <span><div className="bdg bdg-k" style={{ display: 'inline-block' }}>Task</div></span>
        <span className="inv-date">18 Feb 2026</span>
        <span className="inv-amt">KES 2,088</span>
      </div>
      <div className="inv-row">
        <span className="inv-id">TSK-2026-027</span>
        <span className="inv-desc">Google Workspace setup · 5 users</span>
        <span><div className="bdg bdg-k" style={{ display: 'inline-block' }}>Task</div></span>
        <span className="inv-date">9 Feb 2026</span>
        <span className="inv-amt">KES 943</span>
      </div>
      <div className="inv-row">
        <span className="inv-id">RET-2026-02</span>
        <span className="inv-desc">Growth Plan retainer · February 2026</span>
        <span><div className="bdg bdg-t" style={{ display: 'inline-block' }}>Retainer</div></span>
        <span className="inv-date">1 Feb 2026</span>
        <span className="inv-amt">KES 9,999</span>
      </div>
      <div className="inv-row">
        <span className="inv-id">RET-2026-01</span>
        <span className="inv-desc">Growth Plan retainer · January 2026</span>
        <span><div className="bdg bdg-t" style={{ display: 'inline-block' }}>Retainer</div></span>
        <span className="inv-date">1 Jan 2026</span>
        <span className="inv-amt">KES 9,999</span>
      </div>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderTop: 'none', padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)' }}>
            Payments via M-Pesa STK Push
          </span>
          <button
            type="button"
            style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', background: 'transparent', color: 'var(--teal-deep)', border: '1px solid var(--teal-deep)', padding: '7px 14px', cursor: 'pointer' }}
          >
            Download all PDF
          </button>
        </div>
      </div>
      <div className="spend-bar-wrap">
        <div className="spend-lbl">Monthly spend · Jan – Apr 2026</div>
        <div className="spend-months">
          <div className="spend-col">
            <div className="spend-bar-outer" style={{ height: 40 }}>
              <div className="spend-bar-inner dim" style={{ height: 40 }} />
            </div>
            <div className="spend-mo">Jan</div>
            <div className="spend-val" style={{ color: 'var(--mid)' }}>9.9K</div>
          </div>
          <div className="spend-col">
            <div className="spend-bar-outer" style={{ height: 60 }}>
              <div className="spend-bar-inner" style={{ height: 60 }} />
            </div>
            <div className="spend-mo">Feb</div>
            <div className="spend-val">13.0K</div>
          </div>
          <div className="spend-col">
            <div className="spend-bar-outer" style={{ height: 70 }}>
              <div className="spend-bar-inner" style={{ height: 70 }} />
            </div>
            <div className="spend-mo">Mar</div>
            <div className="spend-val">15.2K</div>
          </div>
          <div className="spend-col">
            <div className="spend-bar-outer" style={{ height: 40 }}>
              <div className="spend-bar-inner dim" style={{ height: 40 }} />
            </div>
            <div className="spend-mo">Apr</div>
            <div className="spend-val" style={{ color: 'var(--mid)' }}>9.9K</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SERVICES
// ---------------------------------------------------------------------------
function ServicesView({ onRenewDomain }: { onRenewDomain: () => void }) {
  return (
    <div className="view">
      <div className="greeting" style={{ fontSize: 22, marginBottom: 3 }}>Your <em>Services</em></div>
      <div className="g-sub">Manage active services, view health status, and add new services.</div>

      {/* Hosting */}
      <div className="svc-card">
        <div className="svc-card-hd">
          <div>
            <div className="svc-card-title">Managed Hosting</div>
            <div className="svc-card-sub">janewanjiru-logistics.co.ke · GCP af-south-1</div>
          </div>
          <div className="bdg bdg-t">Active</div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--mid)', marginBottom: 6 }}>
            Uptime · last 30 days
          </div>
          <div className="uptime-row">
            {Array.from({ length: 30 }).map((_, i) => (
              <div key={i} className={`uptime-block ${i === 15 ? 'down' : ''}`} />
            ))}
          </div>
          <div className="uptime-lbl">99.6% uptime · 1 incident 26 Mar · resolved in 58 min</div>
        </div>
        <div className="svc-detail-grid">
          <div className="svc-detail">
            <div className="svc-dl">Plan</div>
            <div className="svc-dv">Managed · 5GB</div>
          </div>
          <div className="svc-detail">
            <div className="svc-dl">Monthly cost</div>
            <div className="svc-dv mono">KES 2,500</div>
          </div>
          <div className="svc-detail">
            <div className="svc-dl">Next renewal</div>
            <div className="svc-dv">1 May 2026</div>
          </div>
        </div>
        <div className="svc-actions">
          <button type="button" className="btn-svc btn-svc-o">View logs</button>
          <button type="button" className="btn-svc btn-svc-o">Upgrade storage</button>
        </div>
      </div>

      {/* Domain — warn */}
      <div className="svc-card warn-card">
        <div className="svc-card-hd">
          <div>
            <div className="svc-card-title">Domain Registration</div>
            <div className="svc-card-sub">jwlogistics.co.ke · Cloudflare DNS</div>
          </div>
          <div className="bdg bdg-a">Renew soon</div>
        </div>
        <div className="svc-detail-grid">
          <div className="svc-detail">
            <div className="svc-dl">Registrar</div>
            <div className="svc-dv">KWS via Cloudflare</div>
          </div>
          <div className="svc-detail">
            <div className="svc-dl">Renewal cost</div>
            <div className="svc-dv mono">KES 1,800 / yr</div>
          </div>
          <div className="svc-detail" style={{ background: 'var(--amber-light)', border: '1px solid var(--amber)' }}>
            <div className="svc-dl" style={{ color: 'var(--amber-deep)' }}>Expires</div>
            <div className="svc-dv" style={{ color: 'var(--amber-deep)', fontWeight: 500 }}>22 May 2026 · 42 days</div>
          </div>
        </div>
        <div style={{ background: 'var(--amber-light)', borderLeft: '3px solid var(--amber-deep)', padding: '10px 14px', fontSize: 12, color: 'var(--amber-deep)', marginBottom: 12, lineHeight: 1.6 }}>
          Your domain expires in 42 days. If not renewed, your website and email will go offline.
        </div>
        <div className="svc-actions">
          <button type="button" className="btn-svc btn-svc-a" onClick={onRenewDomain}>Pay renewal — KES 1,800 →</button>
          <button type="button" className="btn-svc btn-svc-o">View DNS records</button>
        </div>
      </div>

      {/* Workspace */}
      <div className="svc-card">
        <div className="svc-card-hd">
          <div>
            <div className="svc-card-title">Google Workspace</div>
            <div className="svc-card-sub">Business Starter · 5 user licences</div>
          </div>
          <div className="bdg bdg-t">Active</div>
        </div>
        <div className="svc-detail-grid">
          <div className="svc-detail">
            <div className="svc-dl">Users</div>
            <div className="svc-dv">5 of 10 licences used</div>
          </div>
          <div className="svc-detail">
            <div className="svc-dl">Monthly cost</div>
            <div className="svc-dv mono">KES 3,500</div>
          </div>
          <div className="svc-detail">
            <div className="svc-dl">Primary admin</div>
            <div className="svc-dv mono" style={{ fontSize: 10 }}>jane@jwlogistics.co.ke</div>
          </div>
        </div>
        <div className="svc-actions">
          <button type="button" className="btn-svc btn-svc-o">Manage users</button>
          <button type="button" className="btn-svc btn-svc-o">Add licences</button>
        </div>
      </div>

      {/* Add service */}
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
// PAYMENT MODAL — 4 states
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
                        <div className="oi-task-row"><span className="oi-task-name">Copy — headline & subheadline</span><span className="oi-task-amt">1,750</span></div>
                        <div className="oi-task-row"><span className="oi-task-name">Visual redesign — hero layout</span><span className="oi-task-amt">7,000</span></div>
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
                    <div className="lipa-note">LipaPlus coming soon — <span>Kipkiren Pay</span></div>
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
