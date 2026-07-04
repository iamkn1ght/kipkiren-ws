/**
 * Admin Portal - ported verbatim from kws_admin_portal.html (inaugural pack).
 *
 * The HTML mockup is the canonical design output of the founding session.
 * Markup, copy, class names, and visual states match it character-for-character.
 * Do not redesign in this file. If a token or layout needs to change, update
 * the canonical HTML first and re-port.
 *
 * State model mirrors the original vanilla JS:
 *   - tab    : 'dashboard' | 'queue' | 'review' | 'clients' | 'capacity'
 *   - filter : queue filter - 'all' | 'awaiting' | 'progress' | 'review' | 'flagged'
 *   - review : null | { ref, title, meta, discount, lines: [desc, hours, rate][] }
 *
 * The data is the same demo data as the canonical mockup. Wiring to
 * /v1/tickets, /v1/proformas, /v1/decompositions happens against THIS markup
 * in a follow-up ticket - never replace the markup with a "data-driven" rewrite.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { useAuth, useApi } from './auth.tsx';
import './clientDashboard.css';
import {
  useAdminData,
  slaBarClass,
  slaBarPercent,
  slaLabel,
  type QueueRow,
  type ReviewQueueItem,
  type RailHealth,
} from './useAdminData.ts';

const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

type Tab = 'dashboard' | 'queue' | 'review' | 'clients' | 'capacity' | 'services' | 'rails' | 'health';
type QueueFilter = 'all' | 'awaiting' | 'progress' | 'review' | 'flagged';

const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard',
  queue: 'Ticket Queue',
  review: 'AI Review',
  clients: 'Client Accounts',
  capacity: 'Capacity',
  services: 'Services',
  rails: 'Rails',
  health: 'Health',
};

interface EditLine {
  id: string;
  desc: string;
  hours: number;
  rate: number;
}

const fmt = (n: number) => Math.ceil(n).toLocaleString();

export function AdminPortal() {
  const { session, signOut } = useAuth();
  const call = useApi();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [activeReview, setActiveReview] = useState<ReviewQueueItem | null>(null);
  const [editLines, setEditLines] = useState<EditLine[] | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [newSvc, setNewSvc] = useState({ client_id: '', service_type: 'hosting', monthly_cost_kes: '', renewal_at: '', domain: '' });
  const [showRaiseTicket, setShowRaiseTicket] = useState(false);
  const [newTicket, setNewTicket] = useState({ client_id: '', category: 'web', urgency: 'standard', description: '' });
  const [raiseResult, setRaiseResult] = useState<string | null>(null);

  const displayName = session?.email || 'Signed-in user';
  const displayEmail = session?.email ?? '';
  const roleLabel = session?.claims.role === 'admin' ? 'Admin' : 'Delivery Lead';

  const { queue, capacity, clients, reviewQueue, recentDispatches, capacityDetail, services, rails, siteHealth, agents, slaAudit, railsProbing, probeRails, loading, reload } = useAdminData();
  const d = '-';
  const anomalyCount = (siteHealth ?? []).filter((s) => s.anomaly).length;

  const queueRows = queue ?? [];
  const reviewItems = reviewQueue ?? [];
  const unassignedCount = queueRows.filter((r) => !r.assigned_to).length;
  const warnCount = queueRows.filter((r) => r.sla_state === 'warn' || r.sla_state === 'breached').length;

  function statusBadge(row: QueueRow) {
    const s = row.status;
    if (s === 'ai_draft' || s === 'flagged') return { cls: 'bdg-a', label: 'Flagged' };
    if (s === 'under_review' || s === 'awaiting_review') return { cls: 'bdg-a', label: 'Awaiting review' };
    if (s === 'scope_locked') return { cls: 'bdg-k', label: 'Scope locked' };
    if (s === 'in_progress') return { cls: 'bdg-t', label: 'In progress' };
    if (s === 'assigned') return { cls: 'bdg-t', label: 'Assigned' };
    return { cls: 'bdg-o', label: s.replace(/_/g, ' ') };
  }

  function urgencyBadge(urg: string) {
    if (urg === 'elevated') return { cls: 'bdg-a', label: 'Elevated' };
    if (urg === 'urgent') return { cls: 'bdg-a', label: 'Urgent' };
    return { cls: 'bdg-o', label: 'Standard' };
  }

  function queueFilterKey(row: QueueRow): string {
    if (row.status === 'ai_draft' || row.status === 'flagged') return 'flagged';
    if (row.status === 'awaiting_review' || row.status === 'under_review') return 'review';
    if (!row.assigned_to) return 'awaiting';
    return 'progress';
  }

  const filteredQueue = queueRows.filter((r) => filter === 'all' || queueFilterKey(r) === filter);
  const clientNames = [...new Set(queueRows.map((r) => r.client.business_name))].sort();

  const openReview = (item: ReviewQueueItem) => {
    setActiveReview(item);
    setEditLines(item.line_items.map((l) => ({
      id: l.id,
      desc: l.task_name,
      hours: l.estimated_hours,
      rate: l.rate_kes_per_hour,
    })));
  };
  const closeReview = () => {
    setActiveReview(null);
    setEditLines(null);
  };

  const handleApproveDispatch = async (proformaId: string) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await call(`/v1/proformas/${proformaId}/review`, {
        method: 'PUT',
        body: { dispatch: true },
      });
      closeReview();
      reload();
    } catch {
      // Error already surfaced via ApiError; could add toast later
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveAndDispatch = async () => {
    if (!activeReview || !editLines || actionBusy) return;
    setActionBusy(true);
    try {
      const edits = editLines
        .filter((l) => l.id && activeReview.line_items.some((ol) => ol.id === l.id))
        .map((l) => ({
          id: l.id,
          estimated_hours: l.hours,
          amount_kes: Math.ceil(l.hours * l.rate),
        }));
      const originalIds = new Set(activeReview.line_items.map((l) => l.id));
      const currentIds = new Set(editLines.filter((l) => l.id).map((l) => l.id));
      const remove_line_ids = [...originalIds].filter((id) => !currentIds.has(id));

      await call(`/v1/proformas/${activeReview.id}/review`, {
        method: 'PUT',
        body: { edits, remove_line_ids, dispatch: true },
      });
      closeReview();
      reload();
    } catch {
      // Error already surfaced via ApiError
    } finally {
      setActionBusy(false);
    }
  };

  const handleRequeue = async (proformaId: string) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await call(`/v1/proformas/${proformaId}/reject`, {
        method: 'PUT',
        body: { reason: 'Requeued by delivery lead - scope needs client clarification' },
      });
      closeReview();
      reload();
    } catch {
      // Error already surfaced via ApiError
    } finally {
      setActionBusy(false);
    }
  };

  const raiseValid = !!newTicket.client_id && newTicket.description.trim().length >= 10;
  const handleRaiseTicket = async () => {
    if (actionBusy || !raiseValid) return;
    setActionBusy(true);
    setRaiseResult(null);
    try {
      const res = await call<{ ref: string; proforma_id: string | null }>('/v1/admin/tickets', {
        method: 'POST',
        body: {
          client_id: newTicket.client_id,
          description: newTicket.description.trim(),
          category: newTicket.category,
          urgency: newTicket.urgency,
        },
      });
      setRaiseResult(
        res.proforma_id
          ? `Raised ${res.ref} - proforma drafted and sent to the client to approve.`
          : `Raised ${res.ref} - awaiting review (AI decomposition not available).`,
      );
      setNewTicket({ client_id: '', category: 'web', urgency: 'standard', description: '' });
      reload();
    } catch {
      setRaiseResult('Could not raise the ticket - please try again.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleAddService = async () => {
    if (actionBusy || !newSvc.client_id) return;
    setActionBusy(true);
    try {
      const metadata: Record<string, unknown> = {};
      if (newSvc.domain) metadata.domain = newSvc.domain;
      await call('/v1/services/admin', {
        method: 'POST',
        body: {
          client_id: newSvc.client_id,
          service_type: newSvc.service_type,
          monthly_cost_kes: parseInt(newSvc.monthly_cost_kes) || 0,
          renewal_at: newSvc.renewal_at || null,
          metadata,
        },
      });
      setShowAddService(false);
      setNewSvc({ client_id: '', service_type: 'hosting', monthly_cost_kes: '', renewal_at: '', domain: '' });
      reload();
    } catch {
      // Error surfaced via ApiError
    } finally {
      setActionBusy(false);
    }
  };

  const discountPct = activeReview?.client.discount_pct ?? 0;
  const totals = useMemo(() => {
    if (!editLines) return null;
    const sub = editLines.reduce((s, l) => s + l.hours * l.rate, 0);
    const disc = sub * discountPct;
    const afterDisc = sub - disc;
    const vat = afterDisc * 0.16;
    return { sub, disc, vat, total: afterDisc + vat };
  }, [editLines, discountPct]);

  return (
    <div className="kwsp app-admin">
      {/* ── SIDEBAR ── */}
      <aside className="sb">
        <div className="sb-logo">
          <div className="sb-mark">KIPKIREN · WS</div>
          <div className="sb-sub">ADMIN</div>
          <div className="sb-scope">DELIVERY LEAD</div>
        </div>
        <nav className="sb-nav">
          <button type="button" className={`sni ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
            <span className="sni-dot"></span>Dashboard
          </button>
          <button type="button" className={`sni ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>
            <span className="sni-dot"></span>Ticket Queue{queueRows.length > 0 && <span className="sni-badge">{queueRows.length}</span>}
          </button>
          <button type="button" className={`sni ${tab === 'review' ? 'active' : ''}`} onClick={() => setTab('review')}>
            <span className="sni-dot"></span>AI Review{(capacity?.awaiting_ai_review ?? 0) > 0 && <span className="sni-badge">{capacity!.awaiting_ai_review}</span>}
          </button>
          <button type="button" className={`sni ${tab === 'clients' ? 'active' : ''}`} onClick={() => setTab('clients')}>
            <span className="sni-dot"></span>Client Accounts
          </button>
          <button type="button" className={`sni ${tab === 'capacity' ? 'active' : ''}`} onClick={() => setTab('capacity')}>
            <span className="sni-dot"></span>Capacity
          </button>
          <button type="button" className={`sni ${tab === 'services' ? 'active' : ''}`} onClick={() => setTab('services')}>
            <span className="sni-dot"></span>Services{(services?.length ?? 0) > 0 && <span className="sni-badge">{services!.length}</span>}
          </button>
          <button type="button" className={`sni ${tab === 'rails' ? 'active' : ''}`} onClick={() => setTab('rails')}>
            <span className="sni-dot"></span>Rails{(rails?.length ?? 0) > 0 && <span className="sni-badge">{rails!.length}</span>}
          </button>
          <button type="button" className={`sni ${tab === 'health' ? 'active' : ''}`} onClick={() => setTab('health')}>
            <span className="sni-dot"></span>Health{anomalyCount > 0 && <span className="sni-badge">{anomalyCount}</span>}
          </button>
        </nav>
        <div className="sb-foot">
          <div className="sb-role">{roleLabel}</div>
          <div className="sb-name">{displayName}</div>
          {displayEmail && <div className="sb-email">{displayEmail}</div>}
          <button type="button" className="sb-signout" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="main">
        <div className="topbar">
          <div className="tb-crumb">Admin · <span>{TAB_LABELS[tab]}</span></div>
          <div className="tb-right">
            <div className="tb-sla"><span className={`tb-sla-dot ${warnCount > 0 ? 'warn' : ''}`}></span>SLA · {warnCount > 0 ? `${warnCount} approaching` : 'all clear'}</div>
            <button type="button" className="btn-tb">Rate Card</button>
          </div>
        </div>

        {/* ═════════════ DASHBOARD ════════════════ */}
        <section className={`view ${tab === 'dashboard' ? 'active' : ''}`} id="dashboard">
          <div className="cdash">
            <div className="cdash-head cdash-reveal">
              <div>
                <div className="cdash-hi">Welcome back, <em>{displayName.split('@')[0]}</em>.</div>
                <div className="cdash-subline">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Nairobi</div>
                <div className="cdash-chips">
                  <span className="cdash-chip"><span className="d" /><b>{capacity?.open_tickets ?? 0}</b> open</span>
                  <span className="cdash-chip"><span className={`d ${(capacity?.awaiting_ai_review ?? 0) ? 'a' : ''}`} /><b>{capacity?.awaiting_ai_review ?? 0}</b> awaiting review</span>
                  <span className="cdash-chip"><span className={`d ${(capacity?.sla_breaches_open ?? 0) ? 'a' : ''}`} /><b>{capacity?.sla_breaches_open ?? 0}</b> SLA breaches</span>
                </div>
              </div>
              <div className="cdash-actions">
                <button type="button" className="cdash-qa primary" onClick={() => { setRaiseResult(null); setShowRaiseTicket(true); }}><span className="g">+</span> Raise ticket</button>
                <button type="button" className="cdash-qa" onClick={() => setTab('queue')}>Ticket queue</button>
                <button type="button" className="cdash-qa" onClick={() => setTab('review')}>AI review</button>
              </div>
            </div>

            {(queueRows.some((r) => r.sla_state === 'warn' || r.sla_state === 'breached') || queueRows.some((r) => r.status === 'ai_draft' || r.status === 'flagged')) && (
              <div className="alert-stack cdash-reveal" style={cssVars({ '--d': '60ms' })}>
                {queueRows.filter((r) => r.sla_state === 'warn' || r.sla_state === 'breached').map((r) => (
                  <div key={r.id} className="alert">
                    <div className="alert-txt"><strong>{r.sla_state === 'breached' ? 'SLA BREACHED · ' : 'SLA APPROACHING · '}</strong>{r.ref} · {r.client.business_name} · {r.urgency} urgency · {slaLabel(r.sla_state, r.ms_until_breach)}</div>
                    <button type="button" className="btn-rev" onClick={() => setTab('queue')}>Open ticket</button>
                  </div>
                ))}
                {queueRows.filter((r) => r.status === 'ai_draft' || r.status === 'flagged').map((r) => (
                  <div key={`flag-${r.id}`} className="alert">
                    <div className="alert-txt"><strong>AI FLAG · </strong>{r.ref} · {r.client.business_name} · flagged by decomposition</div>
                    <button type="button" className="btn-rev" onClick={() => setTab('review')}>Review</button>
                  </div>
                ))}
              </div>
            )}

            <div className="cdash-kpis cdash-reveal" style={cssVars({ '--d': '90ms' })}>
              <div className="cdash-kpi"><div className="cdash-kpi-l">Open tickets</div><div className="cdash-kpi-v">{loading ? d : capacity?.open_tickets ?? 0}</div><div className="cdash-kpi-n">{loading ? d : `${unassignedCount} awaiting assignment`}</div></div>
              <div className="cdash-kpi"><div className="cdash-kpi-l">Awaiting review</div><div className="cdash-kpi-v">{loading ? d : capacity?.awaiting_ai_review ?? 0}</div><div className="cdash-kpi-n">{(capacity?.sla_breaches_open ?? 0) > 0 ? <span className="warn">{capacity?.sla_breaches_open} SLA breaches</span> : 'none flagged'}</div></div>
              <div className="cdash-kpi"><div className="cdash-kpi-l">MRR</div><div className="cdash-kpi-v teal">{loading ? d : (capacity?.mrr_kes ?? 0).toLocaleString()}</div><div className="cdash-kpi-n">KES · {capacity?.active_clients ?? 0} active clients</div></div>
              <div className="cdash-kpi"><div className="cdash-kpi-l">Dispatched</div><div className="cdash-kpi-v">{loading ? d : capacity?.dispatched ?? 0}</div><div className="cdash-kpi-n">{capacity?.dispatched_proformas_30d ?? 0} in last 30d</div></div>
              <div className="cdash-kpi"><div className="cdash-kpi-l">Approval rate</div><div className="cdash-kpi-v">{capacity?.approval_rate_30d != null ? `${Math.round(capacity.approval_rate_30d * 100)}%` : '-'}</div><div className="cdash-kpi-n">last 30 days</div></div>
              <div className="cdash-kpi"><div className="cdash-kpi-l">Active clients</div><div className="cdash-kpi-v">{loading ? d : capacity?.active_clients ?? 0}</div><div className="cdash-kpi-n">on retainer</div></div>
            </div>

            <div className="cdash-grid">
              <div className="cdash-card cdash-reveal" style={cssVars({ '--d': '130ms' })}>
                <div className="cdash-sec"><h3>Active queue · live</h3><button type="button" onClick={() => setTab('queue')}>View all</button></div>
                <table className="tbl">
                  <thead>
                    <tr><th>Ticket</th><th>Client</th><th>Status</th><th>Urgency</th><th>SLA</th></tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--mid)' }}>Loading...</td></tr>
                    ) : queueRows.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--mid)' }}>No open tickets</td></tr>
                    ) : queueRows.slice(0, 8).map((r) => {
                      const sb = statusBadge(r);
                      const ub = urgencyBadge(r.urgency);
                      const barPct = slaBarPercent(r.ms_until_breach, r.created_at);
                      return (
                        <tr key={r.id}>
                          <td className="tid">{r.ref}</td>
                          <td className="client-nm">{r.client.business_name}<small>{r.client.plan}{r.assigned_to ? ` · ${r.assigned_to}` : ''}</small></td>
                          <td><span className={`bdg ${sb.cls}`}>{sb.label}</span></td>
                          <td><span className={`bdg ${ub.cls}`}>{ub.label}</span></td>
                          <td><div className="sla-w"><div className="sla-tr"><div className={`sla-fl ${slaBarClass(r.sla_state)}`} style={{ width: `${barPct}%` }}></div></div><span className="sla-t">{slaLabel(r.sla_state, r.ms_until_breach)}</span></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="cdash-card cdash-reveal" style={cssVars({ '--d': '170ms' })}>
                <div className="cdash-sec"><h3>Recent approvals</h3><button type="button" onClick={() => setTab('review')}>Review queue</button></div>
                <table className="tbl">
                  <thead><tr><th>Ref</th><th>Client</th><th>Amount</th></tr></thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--mid)' }}>Loading...</td></tr>
                    ) : !recentDispatches?.length ? (
                      <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--mid)' }}>No recent dispatches</td></tr>
                    ) : recentDispatches.map((rd) => (
                      <tr key={rd.ref}><td className="tid">{rd.ref}</td><td className="client-nm">{rd.client_name}</td><td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{rd.subtotal_kes.toLocaleString()}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* ═════════════ TICKET QUEUE ════════════════ */}
        <section className={`view ${tab === 'queue' ? 'active' : ''}`} id="queue">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="greeting">Ticket queue</h1>
              <p className="g-sub">{queueRows.length} open · {unassignedCount} awaiting assignment · sorted by SLA proximity</p>
            </div>
            <button type="button" className="btn-tb" onClick={() => { setRaiseResult(null); setShowRaiseTicket(true); }}>+ Raise ticket</button>
          </div>

          <div className="qfilters">
            <button type="button" className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
            <button type="button" className={`filter-btn ${filter === 'awaiting' ? 'active' : ''}`} onClick={() => setFilter('awaiting')}>Awaiting assignment</button>
            <button type="button" className={`filter-btn ${filter === 'progress' ? 'active' : ''}`} onClick={() => setFilter('progress')}>In progress</button>
            <button type="button" className={`filter-btn ${filter === 'review' ? 'active' : ''}`} onClick={() => setFilter('review')}>Review</button>
            <button type="button" className={`filter-btn ${filter === 'flagged' ? 'active' : ''}`} onClick={() => setFilter('flagged')}>Flagged</button>
            <div className="filter-sep"></div>
            <select className="filter-sel" defaultValue="ALL CLIENTS">
              <option>ALL CLIENTS</option>
              {clientNames.map((n) => <option key={n}>{n}</option>)}
            </select>
            <select className="filter-sel" defaultValue="ALL URGENCY">
              <option>ALL URGENCY</option><option>Standard</option><option>Elevated</option><option>Urgent</option>
            </select>
            <input className="qsearch" aria-label="Search tickets or clients" placeholder="Search ticket or client..." />
          </div>

          <div className="q-row-hd">
            <span>Ticket</span><span>Title</span><span>Client</span><span>Urgency</span><span>Assigned</span><span>SLA</span>
          </div>
          {loading ? (
            <div className="q-row"><div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--mid)' }}>Loading...</div></div>
          ) : filteredQueue.map((r) => {
            const ub = urgencyBadge(r.urgency);
            const barPct = slaBarPercent(r.ms_until_breach, r.created_at);
            const submitted = new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            return (
              <div key={r.id} className="q-row">
                <div className="tid">{r.ref}</div>
                <div>
                  <div className="q-title">{r.description}</div>
                  <div className="q-sub">Submitted {submitted}{r.status === 'ai_draft' ? ` · flagged` : ''}</div>
                </div>
                <div className="client-nm">{r.client.business_name}</div>
                <div><span className={`bdg ${ub.cls}`}>{ub.label}</span></div>
                <div><span className={`assign-pill ${!r.assigned_to ? 'unassigned' : ''}`}>{r.assigned_to ?? 'Unassigned'}</span></div>
                <div><div className="sla-w"><div className="sla-tr"><div className={`sla-fl ${slaBarClass(r.sla_state)}`} style={{ width: `${barPct}%` }}></div></div><span className="sla-t">{slaLabel(r.sla_state, r.ms_until_breach)}</span></div></div>
              </div>
            );
          })}
        </section>

        {/* ═════════════ AI REVIEW ════════════════ */}
        <section className={`view ${tab === 'review' ? 'active' : ''}`} id="review">
          <h1 className="greeting">AI review queue</h1>
          <p className="g-sub">Every proforma passes your review before dispatch · {loading ? d : `${reviewItems.length} awaiting`}</p>

          <div className="ai-split">
            {loading ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--mid)', padding: 40 }}>Loading...</div>
            ) : reviewItems.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--mid)', padding: 40 }}>No proformas awaiting review</div>
            ) : reviewItems.map((item) => (
              <div key={item.id} role="button" tabIndex={0} className={`ai-card ${item.ai_flag_reason ? 'flagged' : ''}`} onClick={() => openReview(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReview(item); } }}>
                <div className="ai-card-hd">
                  <div>
                    <div className="ai-ref">{item.ref} · {item.ai_flag_reason ? 'Flagged' : 'Awaiting review'}</div>
                    <div className="ai-title">{item.ticket.description}</div>
                    <div className="ai-client">{item.client.business_name} · {item.client.plan} · {item.ticket.urgency} urgency</div>
                  </div>
                  <div className="ai-conf">
                    <div className="ai-conf-val">{item.ai_confidence_score?.toFixed(2) ?? d}</div>
                    <div className="ai-conf-lbl">Confidence</div>
                  </div>
                </div>
                {item.ai_flag_reason && (
                  <div className="ai-flag">
                    <strong>AI FLAG · AMBIGUOUS SCOPE</strong>
                    {' '}{item.ai_flag_reason}
                  </div>
                )}
                <div className="ai-items">
                  {item.line_items.map((li) => (
                    <div key={li.id} className="ai-item-row">
                      <span>{li.task_name}</span>
                      <span className="mono">{li.estimated_hours.toFixed(1)} h · {li.amount_kes.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="ai-total"><div className="ai-total-l">Subtotal · pre-VAT</div><div className="ai-total-v">KES {item.subtotal_kes.toLocaleString()}</div></div>
                </div>
                <div className="ai-hash-note"><span>content_hash</span> computed on dispatch · SHA-256 of line items + amounts</div>
                <div className="ai-acts">
                  <button type="button" className="btn-act btn-ap" disabled={actionBusy} onClick={(e) => { e.stopPropagation(); void handleApproveDispatch(item.id); }}>Approve &amp; dispatch</button>
                  <button type="button" className="btn-act btn-ed" onClick={(e) => { e.stopPropagation(); openReview(item); }}>Edit items</button>
                  <button type="button" className="btn-act btn-rq" disabled={actionBusy} onClick={(e) => { e.stopPropagation(); void handleRequeue(item.id); }}>Requeue</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═════════════ CLIENT ACCOUNTS ════════════════ */}
        <section className={`view ${tab === 'clients' ? 'active' : ''}`} id="clients">
          <h1 className="greeting">Client accounts</h1>
          <p className="g-sub">{loading ? d : `${clients?.length ?? 0} accounts · retainer health visible per client`}</p>

          <div className="clients">
            {loading ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--mid)', padding: 40 }}>Loading...</div>
            ) : (clients ?? []).map((c) => {
              const planCls = c.plan === 'Business' || c.plan === 'Enterprise' ? 'bdg-k' : c.plan === 'Growth' ? 'bdg-t' : 'bdg-o';
              const mtdK = c.month_to_date_charges_kes >= 1000
                ? `${(c.month_to_date_charges_kes / 1000).toFixed(1)}K`
                : c.month_to_date_charges_kes.toLocaleString();
              const retainerLabel = c.included_hours > 0
                ? `${c.hours_used_mtd} / ${c.included_hours} h`
                : d;
              const retainerPct = c.included_hours > 0
                ? `${Math.min(100, Math.round((c.hours_used_mtd / c.included_hours) * 100))}%`
                : '0%';
              const lastLabel = c.last_activity_at
                ? new Date(c.last_activity_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                : d;
              return (
                <ClientCard
                  key={c.id}
                  name={c.business_name}
                  sub={`${c.plan} plan · ${c.status}`}
                  plan={c.plan}
                  planCls={planCls}
                  open={String(c.open_tickets)}
                  mtd={mtdK}
                  last={lastLabel}
                  retainer={retainerLabel}
                  bar={retainerPct}
                  warn={c.breached_tickets > 0}
                  primary={c.contact_name || d}
                  ent={c.plan === 'Enterprise'}
                />
              );
            })}
          </div>
        </section>

        {/* ═════════════ CAPACITY ════════════════ */}
        <section className={`view ${tab === 'capacity' ? 'active' : ''}`} id="capacity">
          <h1 className="greeting">Capacity &amp; delivery</h1>
          <p className="g-sub">{loading ? d : `${capacityDetail?.staff.length ?? 0} delivery staff · weekly SLA trend`}</p>

          <div className="cap-wrap">
            <div className="cap-people">
              <div className="shd" style={{ marginBottom: 14 }}>Utilisation · this week</div>

              {loading ? (
                <div style={{ textAlign: 'center', color: 'var(--mid)', padding: 40 }}>Loading...</div>
              ) : !capacityDetail?.staff.length ? (
                <div style={{ textAlign: 'center', color: 'var(--mid)', padding: 40 }}>No delivery staff with active tasks</div>
              ) : capacityDetail.staff.map((s) => {
                const pct = s.capacity_hours > 0 ? Math.round((s.allocated_hours / s.capacity_hours) * 100) : 0;
                const over = s.allocated_hours > s.capacity_hours;
                const roleLabel = s.role === 'technical_delivery' ? 'Technical delivery' : s.role === 'delivery_lead' ? 'Delivery lead' : 'Admin';
                const refs = s.assigned_ticket_refs.join(', ');
                return (
                  <div key={s.id} className="cap-person">
                    <div className="cap-hd">
                      <div className="cap-nm">{s.full_name}<small>{roleLabel}</small></div>
                      <div className={`cap-h ${over ? 'over' : ''}`}>{s.allocated_hours} / {s.capacity_hours} h</div>
                    </div>
                    <div className="cap-bar"><div className={`cap-bar-fl ${over ? 'warn' : ''}`} style={{ width: `${Math.min(pct, 110)}%` }}></div></div>
                    <div className="cap-meta"><span>{s.active_tasks} active task{s.active_tasks !== 1 ? 's' : ''}</span><span>{over ? 'Over-allocated · rebalance recommended' : `Assigned: ${refs}`}</span></div>
                  </div>
                );
              })}
            </div>

            <div className="cap-side">
              <div className="cap-box">
                <div className="shd" style={{ marginBottom: 6 }}>SLA met · 8 weeks</div>
                <div className="cap-sparkline">
                  {(capacityDetail?.sla_trend ?? []).map((wp) => (
                    <div key={wp.week_label} className={`spark-col ${wp.pct < 80 ? 'warn' : ''}`} style={{ height: `${wp.pct}%` }}></div>
                  ))}
                </div>
                {capacityDetail?.sla_trend.length ? (
                  <div className="cap-sl-meta"><span>{capacityDetail.sla_trend[0]?.week_label}</span><span>This week · {capacityDetail.sla_trend[capacityDetail.sla_trend.length - 1]?.pct}%</span></div>
                ) : null}
              </div>

              <div className="cap-box">
                <div className="shd" style={{ marginBottom: 6 }}>SLA audit · {slaAudit?.window_days ?? 30}d</div>
                {slaAudit && slaAudit.overall.total > 0 ? (
                  <>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 24, lineHeight: 1.1 }}>{slaAudit.overall.compliance_pct}%</div>
                    <div style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 8 }}>{slaAudit.overall.met}/{slaAudit.overall.total} met · {slaAudit.overall.breached} breached</div>
                    {slaAudit.by_client.slice(0, 4).map((b) => (
                      <div key={b.key} className="deadline-row">
                        <span>{b.key}</span>
                        <span className={`dl-due ${b.breach_rate > 0 ? 'urg' : ''}`}>{b.compliance_pct}%</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <div style={{ color: 'var(--mid)', fontSize: 12 }}>No tickets with an elapsed SLA deadline in window</div>
                )}
              </div>

              <div className="cap-box">
                <div className="shd" style={{ marginBottom: 6 }}>Upcoming deadlines</div>
                {loading ? (
                  <div style={{ textAlign: 'center', color: 'var(--mid)', padding: 20 }}>Loading...</div>
                ) : !capacityDetail?.deadlines.length ? (
                  <div style={{ textAlign: 'center', color: 'var(--mid)', padding: 20 }}>No upcoming deadlines</div>
                ) : capacityDetail.deadlines.map((dl) => {
                  const urgent = dl.ms_remaining < 12 * 60 * 60 * 1000;
                  let dueLabel: string;
                  if (dl.ms_remaining <= 0) {
                    dueLabel = 'Overdue';
                  } else if (dl.ms_remaining < 60 * 60 * 1000) {
                    dueLabel = `${Math.floor(dl.ms_remaining / 60_000)}m`;
                  } else if (dl.ms_remaining < 24 * 60 * 60 * 1000) {
                    const h = Math.floor(dl.ms_remaining / 3_600_000);
                    const m = Math.floor((dl.ms_remaining % 3_600_000) / 60_000);
                    dueLabel = `${h}h ${m}m`;
                  } else {
                    dueLabel = new Date(dl.due_iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                  }
                  return (
                    <div key={dl.ticket_ref} className="deadline-row">
                      <span><span className="dl-tid">{dl.ticket_ref}</span>{dl.client_name}</span>
                      <span className={`dl-due ${urgent ? 'urg' : ''}`}>{dueLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ═════════════ SERVICES ════════════════ */}
        <section className={`view ${tab === 'services' ? 'active' : ''}`} id="services">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="greeting">Client services</h1>
              <p className="g-sub">{loading ? d : `${services?.length ?? 0} active services across all clients`}</p>
            </div>
            <button type="button" className="btn-tb" onClick={() => setShowAddService(true)}>+ Add service</button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--mid)', padding: 40 }}>Loading...</div>
          ) : !services?.length ? (
            <div style={{ textAlign: 'center', color: 'var(--mid)', padding: 40 }}>No services provisioned yet</div>
          ) : (
            <>
              <div className="q-row-hd" style={{ gridTemplateColumns: '1fr 1fr 110px 100px 110px 100px' }}>
                <span>Client</span><span>Service</span><span>Status</span><span>Cost/mo</span><span>Renewal</span><span>Type</span>
              </div>
              {services.map((svc) => {
                const statusCls = svc.status === 'active' ? 'bdg-t' : svc.status === 'expiring' ? 'bdg-a' : svc.status === 'expired' ? 'bdg-a' : 'bdg-o';
                const typeLabel = svc.service_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                const renewalLabel = svc.renewal_at
                  ? new Date(svc.renewal_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : d;
                const daysUntilRenewal = svc.renewal_at ? Math.ceil((Date.parse(svc.renewal_at) - Date.now()) / 86_400_000) : null;
                const renewalUrgent = daysUntilRenewal !== null && daysUntilRenewal <= 30 && daysUntilRenewal > 0;
                const domain = (svc.metadata as { domain?: string }).domain;
                return (
                  <div key={svc.id} className="q-row" style={{ gridTemplateColumns: '1fr 1fr 110px 100px 110px 100px' }}>
                    <div className="client-nm">{svc.client_name}</div>
                    <div>
                      <div className="q-title">{typeLabel}</div>
                      {domain && <div className="q-sub">{domain}</div>}
                    </div>
                    <div><span className={`bdg ${statusCls}`}>{svc.status}</span></div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>KES {svc.monthly_cost_kes.toLocaleString()}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: renewalUrgent ? 'var(--amber-deep)' : 'var(--mid)' }}>
                      {renewalLabel}
                      {renewalUrgent && <div style={{ fontSize: 10 }}>{daysUntilRenewal}d left</div>}
                    </div>
                    <div><span className="bdg bdg-o">{svc.service_type}</span></div>
                  </div>
                );
              })}
            </>
          )}
        </section>

        {/* ═════════════ RAILS ════════════════ */}
        <section className={`view ${tab === 'rails' ? 'active' : ''}`} id="rails">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="greeting">Platform rails</h1>
              <p className="g-sub">KWS-side view - throughput that flows through KWS plus each rail's config &amp; reachability. KWS is an app, not a rail, so this isn't the rails' internal dashboards.</p>
            </div>
            <button type="button" className="btn-tb" disabled={railsProbing} onClick={() => void probeRails()}>
              {railsProbing ? 'Pinging...' : '↻ Check reachability'}
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--mid)', padding: 40 }}>Loading...</div>
          ) : !rails?.length ? (
            <div style={{ textAlign: 'center', color: 'var(--mid)', padding: 40 }}>No rail data</div>
          ) : (
            <div className="rails-grid">
              {rails.map((r) => <RailCard key={r.key} rail={r} />)}
            </div>
          )}
        </section>

        {/* ═════════════ HEALTH (S9-006 site health + S9-001 agents) ════════════════ */}
        <section className={`view ${tab === 'health' ? 'active' : ''}`} id="health">
          <h1 className="greeting">Site health &amp; agents</h1>
          <p className="g-sub">Per-site uptime &amp; latency from the health pings, and the registered AI agents.</p>

          <div className="shd">Hosted sites · uptime</div>
          <table className="tbl">
            <thead>
              <tr><th>Site</th><th>Uptime</th><th>p95</th><th>Avg</th><th>Pings</th><th>Last check</th><th>Status</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--mid)' }}>Loading...</td></tr>
              ) : !siteHealth?.length ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--mid)' }}>No hosted sites monitored yet</td></tr>
              ) : siteHealth.map((s) => (
                <tr key={s.service_id}>
                  <td className="client-nm">{s.domain ?? d}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{s.uptime_pct}%</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{s.p95_ms != null ? `${s.p95_ms}ms` : d}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{s.avg_ms != null ? `${s.avg_ms}ms` : d}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{s.ping_count}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)' }}>{s.last_check ? new Date(s.last_check).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : d}</td>
                  <td>{s.anomaly ? <span className="bdg bdg-a">{(s.anomaly_type ?? 'anomaly').replace(/_/g, ' ')}</span> : <span className="bdg bdg-t">healthy</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="shd" style={{ marginTop: 28 }}>AI agents · registry</div>
          <table className="tbl">
            <thead>
              <tr><th>Agent</th><th>Scope</th><th>Phase</th><th>Confidence floor</th><th>Human review</th><th>Status</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--mid)' }}>Loading...</td></tr>
              ) : !agents?.length ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--mid)' }}>No agents registered</td></tr>
              ) : agents.map((a) => (
                <tr key={a.agent_id}>
                  <td className="client-nm">{a.agent_id}<small>{a.name} · {a.version}</small></td>
                  <td style={{ fontSize: 12 }}>{a.scope.map((sc) => sc.replace(/_/g, ' ')).join(', ')}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>Phase {a.phase}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{a.confidence_threshold != null ? a.confidence_threshold.toFixed(2) : d}</td>
                  <td>{a.human_review_required ? 'Required' : 'Not required'}</td>
                  <td>{a.active ? <span className="bdg bdg-t">Active</span> : <span className="bdg bdg-o">Inactive</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* ── RAISE TICKET MODAL (admin raises a ticket for a client) ── */}
      <div className={`rev-overlay ${showRaiseTicket ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setShowRaiseTicket(false); }}>
        {showRaiseTicket && (
          <div className="rev-modal" style={{ maxWidth: 520 }}>
            <div className="rev-hd">
              <div className="rev-title">Raise a ticket for a client</div>
              <button type="button" className="rev-close" onClick={() => setShowRaiseTicket(false)}>CLOSE ✕</button>
            </div>
            <div className="rev-body">
              <div className="rev-meta">Runs the same flow as a client ticket - AI decomposes it into a proforma the client approves before any work begins.</div>

              <div className="rev-line" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)', minWidth: 100 }}>Client</span>
                <select className="rev-inp" aria-label="Client" value={newTicket.client_id} onChange={(e) => setNewTicket({ ...newTicket, client_id: e.target.value })}>
                  <option value="">Select client...</option>
                  {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
                </select>
              </div>
              <div className="rev-line" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)', minWidth: 100 }}>Category</span>
                <select className="rev-inp" aria-label="Service category" value={newTicket.category} onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}>
                  <option value="web">Web</option>
                  <option value="cloud">Cloud</option>
                  <option value="seo">SEO</option>
                  <option value="social">Social</option>
                  <option value="dns">DNS</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div className="rev-line" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)', minWidth: 100 }}>Urgency</span>
                <select className="rev-inp" aria-label="Urgency" value={newTicket.urgency} onChange={(e) => setNewTicket({ ...newTicket, urgency: e.target.value })}>
                  <option value="standard">Standard · 1.0×</option>
                  <option value="elevated">Elevated · 1.25×</option>
                  <option value="urgent">Urgent · 1.5×</option>
                </select>
              </div>
              <div className="rev-line" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)', minWidth: 100, paddingTop: 8 }}>Scope</span>
                <textarea
                  className="rev-inp"
                  style={{ minHeight: 96, resize: 'vertical', fontFamily: 'var(--sans)' }}
                  placeholder="Describe the work the client needs (min 10 characters)..."
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                />
              </div>

              {raiseResult && <div className="rev-meta" style={{ color: 'var(--teal-deep)' }}>{raiseResult}</div>}

              <div className="rev-acts">
                <button type="button" className="btn-mod btn-cancel" onClick={() => setShowRaiseTicket(false)}>Close</button>
                <button type="button" className="btn-mod btn-disp" disabled={actionBusy || !raiseValid} onClick={() => void handleRaiseTicket()}>
                  {actionBusy ? 'Raising...' : 'Raise & send to client'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── ADD SERVICE MODAL ── */}
      <div className={`rev-overlay ${showAddService ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setShowAddService(false); }}>
        {showAddService && (
          <div className="rev-modal" style={{ maxWidth: 480 }}>
            <div className="rev-hd">
              <div className="rev-title">Add client service</div>
              <button type="button" className="rev-close" onClick={() => setShowAddService(false)}>CLOSE ✕</button>
            </div>
            <div className="rev-body">
              <div className="rev-line-hd"><span>Field</span><span>Value</span></div>
              <div className="rev-line" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)', minWidth: 100 }}>Client</span>
                <select className="rev-inp" value={newSvc.client_id} onChange={(e) => setNewSvc({ ...newSvc, client_id: e.target.value })}>
                  <option value="">Select client...</option>
                  {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
                </select>
              </div>
              <div className="rev-line" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)', minWidth: 100 }}>Type</span>
                <select className="rev-inp" value={newSvc.service_type} onChange={(e) => setNewSvc({ ...newSvc, service_type: e.target.value })}>
                  <option value="hosting">Hosting</option>
                  <option value="domain">Domain</option>
                  <option value="workspace">Google Workspace</option>
                  <option value="microsoft365">Microsoft 365</option>
                  <option value="ssl">SSL Certificate</option>
                  <option value="seo_retainer">SEO Retainer</option>
                  <option value="social_retainer">Social Media</option>
                </select>
              </div>
              <div className="rev-line" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)', minWidth: 100 }}>Cost / mo</span>
                <input className="rev-inp mono" placeholder="KES" value={newSvc.monthly_cost_kes} onChange={(e) => setNewSvc({ ...newSvc, monthly_cost_kes: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div className="rev-line" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)', minWidth: 100 }}>Renewal</span>
                <input className="rev-inp mono" type="date" value={newSvc.renewal_at} onChange={(e) => setNewSvc({ ...newSvc, renewal_at: e.target.value })} />
              </div>
              <div className="rev-line" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)', minWidth: 100 }}>Domain</span>
                <input className="rev-inp" placeholder="e.g. example.co.ke (optional)" value={newSvc.domain} onChange={(e) => setNewSvc({ ...newSvc, domain: e.target.value })} />
              </div>
              <div className="rev-acts">
                <button type="button" className="btn-mod btn-cancel" onClick={() => setShowAddService(false)}>Cancel</button>
                <button type="button" className="btn-mod btn-disp" disabled={actionBusy || !newSvc.client_id} onClick={() => void handleAddService()}>
                  {actionBusy ? 'Creating...' : 'Create service'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── REVIEW MODAL ── */}
      <div className={`rev-overlay ${activeReview ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) closeReview(); }}>
        {activeReview && editLines && totals && (
          <div className="rev-modal">
            <div className="rev-hd">
              <div className="rev-title"><span>{activeReview.ref}</span>Edit proforma line items</div>
              <button type="button" className="rev-close" onClick={closeReview}>CLOSE ✕</button>
            </div>
            <div className="rev-body">
              <div className="rev-sub">{activeReview.ticket.description}</div>
              <div className="rev-meta">{activeReview.client.business_name} · {activeReview.ticket.urgency} urgency · {activeReview.client.plan} plan</div>

              <div className="rev-line-hd">
                <span>Task</span><span>Hours</span><span>Rate</span><span>Amount · KES</span><span></span>
              </div>
              {editLines.map((l, i) => (
                <div key={l.id || i} className="rev-line">
                  <input
                    className="rev-inp"
                    value={l.desc}
                    onChange={(e) => {
                      const next = editLines.map((row, j): EditLine => j === i ? { ...row, desc: e.target.value } : row);
                      setEditLines(next);
                    }}
                  />
                  <input
                    className="rev-inp mono"
                    value={l.hours.toFixed(1)}
                    onChange={(e) => {
                      const next = editLines.map((row, j): EditLine => j === i ? { ...row, hours: parseFloat(e.target.value) || 0 } : row);
                      setEditLines(next);
                    }}
                  />
                  <input
                    className="rev-inp mono"
                    value={l.rate.toLocaleString()}
                    onChange={(e) => {
                      const next = editLines.map((row, j): EditLine => j === i ? { ...row, rate: parseFloat(e.target.value.replace(/,/g, '')) || 0 } : row);
                      setEditLines(next);
                    }}
                  />
                  <input className="rev-inp mono" value={Math.ceil(l.hours * l.rate).toLocaleString()} readOnly />
                  <button
                    type="button"
                    className="rev-del"
                    aria-label="Remove line item"
                    onClick={() => setEditLines(editLines.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="rev-add"
                onClick={() => setEditLines([...editLines, { id: '', desc: '', hours: 0, rate: 4500 }])}
              >
                + Add line item
              </button>

              <div className="rev-totals">
                <div className="rev-tot-row"><span className="lbl">Subtotal</span><span className="val">{fmt(totals.sub)}</span></div>
                <div className="rev-tot-row"><span className="lbl">Urgency multiplier · 1.0×</span><span className="val">-</span></div>
                <div className="rev-tot-row"><span className="lbl">Plan discount · {activeReview.client.plan} {Math.round(discountPct * 100)}%</span><span className="val">-{fmt(totals.disc)}</span></div>
                <div className="rev-tot-row"><span className="lbl">VAT · 16%</span><span className="val">{fmt(totals.vat)}</span></div>
                <div className="rev-tot-row total"><span className="lbl">Total due</span><span className="val">KES {fmt(totals.total)}</span></div>
              </div>
              <div className="rev-hash"><span>content_hash</span> will be computed on dispatch as SHA-256(line items + amounts). Any downstream edit invalidates approval.</div>

              <div className="rev-acts">
                <button type="button" className="btn-mod btn-cancel" onClick={closeReview}>Cancel</button>
                <button type="button" className="btn-mod btn-reque" disabled={actionBusy} onClick={() => void handleRequeue(activeReview.id)}>Requeue</button>
                <button type="button" className="btn-mod btn-disp" disabled={actionBusy} onClick={() => void handleSaveAndDispatch()}>Approve &amp; dispatch</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const RAIL_BADGE: Record<RailHealth['status'], { cls: string; label: string }> = {
  live: { cls: 'bdg-t', label: 'Live' },
  configured: { cls: 'bdg-o', label: 'Configured' },
  pending: { cls: 'bdg-a', label: 'Pending' },
  degraded: { cls: 'bdg-a', label: 'Degraded' },
  unconfigured: { cls: 'bdg-o', label: 'Not configured' },
};

function RailCard({ rail }: { rail: RailHealth }) {
  const b = RAIL_BADGE[rail.status];
  return (
    <div className={`rail-card s-${rail.status}`}>
      <div className="rail-card-hd">
        <div className="rail-name">{rail.name}</div>
        <span className={`bdg ${b.cls}`}>{b.label}</span>
      </div>
      <div className="rail-purpose">{rail.purpose}</div>
      {rail.reachable !== null && (
        <div className={`rail-reach ${rail.reachable ? 'up' : 'down'}`}>
          {rail.reachable ? `● reachable${rail.latency_ms != null ? ` · ${rail.latency_ms}ms` : ''}` : '✕ unreachable'}
        </div>
      )}
      <div className="rail-metrics">
        {rail.metrics.map((m) => (
          <div key={m.label} className="rail-metric">
            <div className="l">{m.label}</div>
            <div className={`v ${m.tone ?? ''}`}>{m.value}</div>
          </div>
        ))}
      </div>
      {rail.note && <div className="rail-note">{rail.note}</div>}
    </div>
  );
}

interface ClientCardProps {
  name: string;
  sub: string;
  plan: string;
  planCls: string;
  open: string;
  mtd: string;
  last: string;
  retainer: string;
  bar: string;
  warn: boolean;
  primary: string;
  ent?: boolean;
}

function ClientCard({ name, sub, plan, planCls, open, mtd, last, retainer, bar, warn, primary, ent }: ClientCardProps) {
  return (
    <div className={`client-card ${ent ? 'ent' : ''}`}>
      <div className="client-card-hd">
        <div>
          <div className="cc-name">{name}</div>
          <div className="cc-sub">{sub}</div>
        </div>
        <span className={`bdg ${planCls}`}>{plan}</span>
      </div>
      <div className="cc-metrics">
        <div className="cc-m"><div className="cc-m-l">Open tickets</div><div className="cc-m-v">{open}</div></div>
        <div className="cc-m"><div className="cc-m-l">MTD spend</div><div className="cc-m-v">{mtd}</div></div>
        <div className="cc-m"><div className="cc-m-l">Last contact</div><div className="cc-m-v" style={{ fontSize: 13 }}>{last}</div></div>
      </div>
      <div className="cc-bar-wrap">
        <div className="cc-bar-lbl"><span>Retainer hours</span><span>{retainer}</span></div>
        <div className="cc-bar"><div className={`cc-bar-fl ${warn ? 'warn' : ''}`} style={{ width: bar }}></div></div>
      </div>
      <div className="cc-foot"><span>Primary · {primary}</span><button type="button" className="btn-cc">Open account</button></div>
    </div>
  );
}
