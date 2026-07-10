/**
 * Admin console (delivery lead / admin) - warm editorial rebuild on the .klp
 * portal shell. Preserves the useAdminData hook, the proforma approve/requeue
 * actions, and the "raise a ticket for a client" workflow. Eight tabs presented
 * as clean warm lists, cards and KPI rows.
 */

import { useState, type CSSProperties } from 'react';
import { useAuth, useApi } from './auth.tsx';
import { KlpToggle } from './klpTheme.tsx';
import { useAdminData, slaLabel, type QueueRow, type RailHealth } from './useAdminData.ts';
import { SkelList, Search, SegBar, EmptyState, ToolbarMeta } from './portalUi.tsx';
import { AdminClients } from './AdminClients.tsx';
import './landing.css';

type Tab = 'dashboard' | 'queue' | 'review' | 'clients' | 'capacity' | 'services' | 'rails' | 'health';
const NAV: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Overview' }, { id: 'queue', label: 'Ticket queue' }, { id: 'review', label: 'AI review' },
  { id: 'clients', label: 'Clients' }, { id: 'capacity', label: 'Capacity' }, { id: 'services', label: 'Services' },
  { id: 'rails', label: 'Rails' }, { id: 'health', label: 'Health' },
];
const TITLE: Record<Tab, string> = {
  dashboard: 'Overview', queue: 'Ticket queue', review: 'AI review', clients: 'Clients',
  capacity: 'Capacity', services: 'Services', rails: 'Rails', health: 'Health',
};

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-';

function slaPill(row: QueueRow): { cls: string; label: string } {
  if (row.sla_state === 'breached') return { cls: 'warn', label: 'Breached' };
  if (row.sla_state === 'warn') return { cls: 'warn', label: slaLabel(row.sla_state, row.ms_until_breach) };
  return { cls: 'active', label: 'On track' };
}
function statusPill(status: string): { cls: string; label: string } {
  if (status === 'ai_draft' || status === 'flagged') return { cls: 'warn', label: 'Flagged' };
  if (status === 'awaiting_review' || status === 'under_review') return { cls: 'warn', label: 'Review' };
  if (status === 'in_progress' || status === 'assigned' || status === 'scope_locked') return { cls: 'active', label: status.replace(/_/g, ' ') };
  return { cls: 'draft', label: status.replace(/_/g, ' ') };
}

const RAIL_PILL: Record<RailHealth['status'], { cls: string; label: string }> = {
  live: { cls: 'active', label: 'Live' }, configured: { cls: 'draft', label: 'Configured' },
  pending: { cls: 'warn', label: 'Pending' }, degraded: { cls: 'warn', label: 'Degraded' }, unconfigured: { cls: 'draft', label: 'Not configured' },
};

export function AdminPortal() {
  const { session, signOut } = useAuth();
  const call = useApi();
  const { queue, capacity, clients, reviewQueue, recentDispatches, capacityDetail, services, rails, siteHealth, agents, slaAudit, railsProbing, probeRails, loading, reload } = useAdminData();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [busy, setBusy] = useState(false);
  const [showRaise, setShowRaise] = useState(false);
  const [newTicket, setNewTicket] = useState({ client_id: '', category: 'web', urgency: 'standard', description: '' });
  const [raiseResult, setRaiseResult] = useState<string | null>(null);
  const [qSearch, setQSearch] = useState('');
  const [qFilter, setQFilter] = useState<'all' | 'on' | 'warn' | 'breached'>('all');

  const name = session?.email?.split('@')[0] ?? 'there';
  const roleLabel = session?.claims.role === 'admin' ? 'Admin' : 'Delivery lead';
  const queueRows = queue ?? [];
  const reviewItems = reviewQueue ?? [];
  const anomalies = (siteHealth ?? []).filter((s) => s.anomaly).length;

  // Ticket-queue search + SLA filter (the Linear/Jira-style triage surface).
  const slaCounts = {
    all: queueRows.length,
    on: queueRows.filter((r) => r.sla_state !== 'breached' && r.sla_state !== 'warn').length,
    warn: queueRows.filter((r) => r.sla_state === 'warn').length,
    breached: queueRows.filter((r) => r.sla_state === 'breached').length,
  };
  const filteredQueue = queueRows.filter((r) => {
    if (qFilter === 'breached' && r.sla_state !== 'breached') return false;
    if (qFilter === 'warn' && r.sla_state !== 'warn') return false;
    if (qFilter === 'on' && (r.sla_state === 'breached' || r.sla_state === 'warn')) return false;
    const q = qSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      r.ref.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.client.business_name.toLowerCase().includes(q)
    );
  });

  const handleApprove = async (id: string) => { if (busy) return; setBusy(true); try { await call(`/v1/proformas/${id}/review`, { method: 'PUT', body: { dispatch: true } }); reload(); } catch { /* surfaced by ApiError */ } finally { setBusy(false); } };
  const handleRequeue = async (id: string) => { if (busy) return; setBusy(true); try { await call(`/v1/proformas/${id}/reject`, { method: 'PUT', body: { reason: 'Requeued by delivery lead. Scope needs client clarification.' } }); reload(); } catch { /* noop */ } finally { setBusy(false); } };

  const raiseValid = !!newTicket.client_id && newTicket.description.trim().length >= 10;
  const handleRaise = async () => {
    if (busy || !raiseValid) return; setBusy(true); setRaiseResult(null);
    try {
      const res = await call<{ ref: string; proforma_id: string | null }>('/v1/admin/tickets', { method: 'POST', body: { client_id: newTicket.client_id, description: newTicket.description.trim(), category: newTicket.category, urgency: newTicket.urgency } });
      setRaiseResult(res.proforma_id ? `Raised ${res.ref} · proforma drafted and sent to the client.` : `Raised ${res.ref} · awaiting review.`);
      setNewTicket({ client_id: '', category: 'web', urgency: 'standard', description: '' });
      reload();
    } catch { setRaiseResult('Could not raise the ticket. Please try again.'); }
    finally { setBusy(false); }
  };

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
          <aside className="klp-portal-aside">
            <div className="klp-mono lbl">Delivery console</div>
            <nav className="klp-portal-nav">
              {NAV.map((n) => (
                <button key={n.id} type="button" className={tab === n.id ? 'active' : ''} onClick={() => setTab(n.id)}>
                  <span>{n.label}</span>
                  {n.id === 'queue' && queueRows.length > 0 && <span className="badge">{queueRows.length}</span>}
                  {n.id === 'review' && (capacity?.awaiting_ai_review ?? 0) > 0 && <span className="badge">{capacity!.awaiting_ai_review}</span>}
                  {n.id === 'health' && anomalies > 0 && <span className="badge">{anomalies}</span>}
                </button>
              ))}
            </nav>
            <div className="klp-portal-foot">
              <button type="button" className="klp-btn primary full" onClick={() => { setRaiseResult(null); setShowRaise(true); }}>Raise a ticket</button>
              <div className="who" style={cssVars({ marginTop: 20 })}>{roleLabel} · {session?.email ?? ''}</div>
              <button type="button" className="klp-portal-signout" onClick={() => void signOut()}>Sign out</button>
            </div>
          </aside>

          <div className="klp-portal-content">
            <header className="klp-portal-head">
              <div style={cssVars({ minWidth: 0 })}>
                <div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>{TITLE[tab]}</div>
                <h1 className="klp-display-md">{tab === 'dashboard' ? <>Welcome back, {name}.</> : TITLE[tab]}</h1>
              </div>
              <div className="actions">
                {tab === 'rails' && <button type="button" className="klp-btn ghost" disabled={railsProbing} onClick={() => void probeRails()}>{railsProbing ? 'Pinging...' : 'Check reachability'}</button>}
                {tab !== 'rails' && <button type="button" className="klp-btn primary" onClick={() => { setRaiseResult(null); setShowRaise(true); }}>Raise ticket</button>}
              </div>
            </header>

            {/* overview */}
            {tab === 'dashboard' && (
              <>
                <div className="klp-kpis" style={cssVars({ gridTemplateColumns: 'repeat(2,1fr)' })}>
                  <div className="klp-card klp-kpi"><div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Open tickets</div><div className="n">{loading ? '-' : capacity?.open_tickets ?? 0}</div></div>
                  <div className="klp-card klp-kpi"><div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Awaiting review</div><div className={`n ${(capacity?.awaiting_ai_review ?? 0) ? 'amber' : ''}`}>{loading ? '-' : capacity?.awaiting_ai_review ?? 0}</div></div>
                  <div className="klp-card klp-kpi"><div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>MRR</div><div className="n" style={cssVars({ fontSize: 40 })}>{loading ? '-' : `KES ${(capacity?.mrr_kes ?? 0).toLocaleString()}`}</div></div>
                  <div className="klp-card klp-kpi"><div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Active clients</div><div className="n">{loading ? '-' : capacity?.active_clients ?? 0}</div></div>
                </div>
                <section className="klp-portal-sec">
                  <div className="sechd"><h2>Active queue</h2><button type="button" onClick={() => setTab('queue')}>View all →</button></div>
                  {loading ? <SkelList rows={4} />
                    : queueRows.length === 0 ? <div className="klp-list"><div className="klp-list-empty">The queue is clear.</div></div>
                    : <QueueList rows={queueRows.slice(0, 6)} />}
                </section>
                <section className="klp-portal-sec">
                  <div className="sechd"><h2>Recent approvals</h2></div>
                  <div className="klp-list">
                    {loading ? <div className="klp-list-empty">Loading...</div>
                      : !(recentDispatches ?? []).length ? <div className="klp-list-empty">No recent dispatches yet.</div>
                      : (recentDispatches ?? []).map((r) => (
                        <div key={r.ref} className="klp-list-row" style={cssVars({ gridTemplateColumns: 'minmax(110px,auto) 1fr auto' })}>
                          <span className="ref">{r.ref}</span><span className="title">{r.client_name}</span><span className="amt">KES {r.subtotal_kes.toLocaleString()}</span>
                        </div>
                      ))}
                  </div>
                </section>
              </>
            )}

            {tab === 'queue' && (
              loading ? <SkelList rows={6} />
                : (
                  <>
                    <div className="klp-toolbar">
                      <Search value={qSearch} onChange={setQSearch} placeholder="Search ref, client or description" />
                      <SegBar value={qFilter} onChange={setQFilter} ariaLabel="Filter by SLA state"
                        options={[
                          { id: 'all', label: 'All', count: slaCounts.all },
                          { id: 'on', label: 'On track', count: slaCounts.on },
                          { id: 'warn', label: 'At risk', count: slaCounts.warn },
                          { id: 'breached', label: 'Breached', count: slaCounts.breached },
                        ]} />
                      <ToolbarMeta>{filteredQueue.length} shown</ToolbarMeta>
                    </div>
                    {filteredQueue.length === 0
                      ? <EmptyState
                          title={queueRows.length === 0 ? 'No open tickets' : 'No tickets match'}
                          sub={queueRows.length === 0 ? 'Every ticket is closed or unassigned.' : 'Try a different search term or filter.'} />
                      : <QueueList rows={filteredQueue} full />}
                  </>
                )
            )}

            {/* review */}
            {tab === 'review' && (
              loading ? <SkelList rows={3} />
                : reviewItems.length === 0 ? <EmptyState title="Nothing to review" sub="Every AI-drafted proforma has been dispatched. New drafts land here for approval." />
                : (
                  <div className="klp-tasks">
                    {reviewItems.map((item) => (
                      <div key={item.id} className="klp-card klp-review-card">
                        <div className="klp-task-hd">
                          <div style={cssVars({ minWidth: 0 })}>
                            <div className="klp-task-ref">{item.ref} · {item.client.business_name} · {item.client.plan}</div>
                            <div className="klp-task-title" style={cssVars({ fontSize: 20 })}>{item.ticket.description}</div>
                          </div>
                          <span className={`klp-pill ${item.ai_flag_reason ? 'warn' : 'active'}`}>conf {item.ai_confidence_score?.toFixed(2) ?? '-'}</span>
                        </div>
                        {item.ai_flag_reason && <div className="klp-note amber" style={cssVars({ marginTop: 14 })}>AI flag · {item.ai_flag_reason}</div>}
                        <div className="klp-review-items">
                          {item.line_items.map((li) => (
                            <div key={li.id} className="r"><span>{li.task_name}</span><span className="amt">{li.estimated_hours.toFixed(1)}h · {li.amount_kes.toLocaleString()}</span></div>
                          ))}
                          <div className="r" style={cssVars({ borderBottom: 'none' })}><span style={cssVars({ color: 'var(--mid)' })}>Subtotal · pre-VAT</span><span className="amt" style={cssVars({ color: 'var(--teal-deep)' })}>KES {item.subtotal_kes.toLocaleString()}</span></div>
                        </div>
                        <div className="klp-portal-actions">
                          <button type="button" className="klp-btn primary" disabled={busy} onClick={() => void handleApprove(item.id)}>Approve &amp; dispatch</button>
                          <button type="button" className="klp-btn ghost" disabled={busy} onClick={() => void handleRequeue(item.id)}>Requeue</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
            )}

            {/* clients (CRM + onboarding) */}
            {tab === 'clients' && <AdminClients clients={clients} loading={loading} reload={reload} />}

            {/* capacity */}
            {tab === 'capacity' && (
              loading ? <SkelList rows={4} />
                : !(capacityDetail?.staff ?? []).length ? <EmptyState title="No active allocation" sub="Delivery staff appear here once they have tasks in flight." />
                : (
                  <div className="klp-list">
                    {(capacityDetail?.staff ?? []).map((s) => {
                      const over = s.allocated_hours > s.capacity_hours;
                      return (
                        <div key={s.id} className="klp-list-row" style={cssVars({ gridTemplateColumns: '1fr auto auto' })}>
                          <span className="title" style={cssVars({ fontSize: 17 })}>{s.full_name}<span style={cssVars({ display: 'block', fontSize: 11, color: 'var(--mid)', fontFamily: 'var(--font-mono)' })}>{s.role.replace(/_/g, ' ')}</span></span>
                          <span className="date">{s.active_tasks} active</span>
                          <span className={`klp-pill ${over ? 'warn' : 'active'}`}>{s.allocated_hours}/{s.capacity_hours}h</span>
                        </div>
                      );
                    })}
                  </div>
                )
            )}

            {/* services */}
            {tab === 'services' && (
              loading ? <SkelList rows={5} />
                : !(services ?? []).length ? <EmptyState title="No services provisioned" sub="Hosting, domains, SEO and cloud services appear here once set up for a client." />
                : (
                  <div className="klp-list">
                    {(services ?? []).map((s) => (
                      <div key={s.id} className="klp-list-row" style={cssVars({ gridTemplateColumns: '1fr 1fr auto auto' })}>
                        <span className="title" style={cssVars({ fontSize: 17 })}>{s.client_name}</span>
                        <span className="date">{s.service_type.replace(/_/g, ' ')}</span>
                        <span className="amt">KES {s.monthly_cost_kes.toLocaleString()}/mo</span>
                        <span className={`klp-pill ${s.status === 'active' ? 'active' : 'warn'}`}>{s.status}</span>
                      </div>
                    ))}
                  </div>
                )
            )}

            {/* rails */}
            {tab === 'rails' && (
              loading ? <SkelList rows={4} />
                : !(rails ?? []).length ? <EmptyState title="No rail data" sub="Platform-rail health appears here once the API is reachable." />
                : (
                  <div className="klp-cards-grid">
                    {(rails ?? []).map((r) => {
                      const p = RAIL_PILL[r.status];
                      return (
                        <div key={r.key} className="klp-card klp-review-card">
                          <div className="klp-task-hd">
                            <div className="klp-task-title" style={cssVars({ fontSize: 19, marginTop: 0 })}>{r.name}</div>
                            <span className={`klp-pill ${p.cls}`}>{p.label}</span>
                          </div>
                          <div style={cssVars({ fontSize: 13, color: 'var(--slate)', marginTop: 8 })}>{r.purpose}</div>
                          {r.reachable !== null && <div className="klp-mono" style={cssVars({ marginTop: 10, color: r.reachable ? 'var(--teal-deep)' : 'var(--amber-deep)', fontSize: 10 })}>{r.reachable ? `reachable${r.latency_ms != null ? ` · ${r.latency_ms}ms` : ''}` : 'unreachable'}</div>}
                          <div style={cssVars({ marginTop: 12 })}>
                            {r.metrics.slice(0, 5).map((m) => <div key={m.label} className="klp-metric"><span className="k">{m.label}</span><span className="v">{m.value}</span></div>)}
                          </div>
                          {r.note && <div className="klp-mono" style={cssVars({ marginTop: 12, color: 'var(--mid)', fontSize: 10, letterSpacing: '0.04em', textTransform: 'none' })}>{r.note}</div>}
                        </div>
                      );
                    })}
                  </div>
                )
            )}

            {/* health */}
            {tab === 'health' && (
              <>
                <section className="klp-portal-sec">
                  <div className="sechd"><h2>Hosted sites</h2></div>
                  <div className="klp-list">
                    {!(siteHealth ?? []).length ? <div className="klp-list-empty">No hosted sites monitored yet.</div>
                      : (siteHealth ?? []).map((s) => (
                        <div key={s.service_id} className="klp-list-row" style={cssVars({ gridTemplateColumns: '1fr auto auto auto' })}>
                          <span className="title" style={cssVars({ fontSize: 16 })}><span className={`klp-healthdot ${s.anomaly ? 'warn' : 'ok'}`} />{s.domain ?? '-'}</span>
                          <span className="date">{s.uptime_pct}% up</span>
                          <span className="date">{s.p95_ms != null ? `${s.p95_ms}ms` : '-'}</span>
                          <span className={`klp-pill ${s.anomaly ? 'warn' : 'active'}`}>{s.anomaly ? (s.anomaly_type ?? 'anomaly').replace(/_/g, ' ') : 'healthy'}</span>
                        </div>
                      ))}
                  </div>
                </section>
                <section className="klp-portal-sec">
                  <div className="sechd"><h2>AI agents</h2></div>
                  <div className="klp-list">
                    {!(agents ?? []).length ? <div className="klp-list-empty">No agents registered.</div>
                      : (agents ?? []).map((a) => (
                        <div key={a.agent_id} className="klp-list-row" style={cssVars({ gridTemplateColumns: '1fr auto auto' })}>
                          <span className="title" style={cssVars({ fontSize: 16 })}>{a.agent_id}<span style={cssVars({ display: 'block', fontSize: 11, color: 'var(--mid)' })}>{a.scope.map((x) => x.replace(/_/g, ' ')).join(', ')}</span></span>
                          <span className="date">Phase {a.phase}</span>
                          <span className={`klp-pill ${a.active ? 'active' : 'draft'}`}>{a.active ? 'Active' : 'Inactive'}</span>
                        </div>
                      ))}
                  </div>
                </section>
                {slaAudit && slaAudit.overall.total > 0 && (
                  <section className="klp-portal-sec">
                    <div className="sechd"><h2>SLA audit · {slaAudit.window_days}d</h2></div>
                    <div className="klp-card klp-panel">
                      <div style={cssVars({ fontFamily: 'var(--font-serif)', fontSize: 44, color: 'var(--teal-deep)', lineHeight: 1 })}>{slaAudit.overall.compliance_pct}%</div>
                      <div className="klp-mono" style={cssVars({ color: 'var(--mid)', marginTop: 8 })}>{slaAudit.overall.met}/{slaAudit.overall.total} met · {slaAudit.overall.breached} breached</div>
                      <div style={cssVars({ marginTop: 16 })}>
                        {slaAudit.by_client.slice(0, 4).map((b) => <div key={b.key} className="klp-metric"><span className="k">{b.key}</span><span className="v" style={cssVars({ color: b.breach_rate > 0 ? 'var(--amber-deep)' : 'var(--teal-deep)' })}>{b.compliance_pct}%</span></div>)}
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* raise ticket modal */}
      <div className={`klp-overlay ${showRaise ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setShowRaise(false); }}>
        {showRaise && (
          <div className="klp-modal">
            <div className="klp-modal-hd"><div className="t">Raise a ticket for a client</div><button type="button" className="klp-modal-close" onClick={() => setShowRaise(false)}>Close</button></div>
            <div className="klp-modal-body">
              <p style={cssVars({ fontSize: 13, color: 'var(--slate)' })}>Runs the same flow as a client ticket: AI decomposes it into a proforma the client approves before any work begins.</p>
              <div><label className="klp-field-label" htmlFor="rt-client">Client</label>
                <select id="rt-client" className="klp-field-input" value={newTicket.client_id} onChange={(e) => setNewTicket({ ...newTicket, client_id: e.target.value })}>
                  <option value="">Select client...</option>
                  {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
                </select>
              </div>
              <div style={cssVars({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 })}>
                <div><label className="klp-field-label" htmlFor="rt-cat">Category</label>
                  <select id="rt-cat" className="klp-field-input" value={newTicket.category} onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}>
                    <option value="web">Web</option><option value="cloud">Cloud</option><option value="seo">SEO</option><option value="social">Social</option><option value="dns">DNS</option><option value="general">General</option>
                  </select>
                </div>
                <div><label className="klp-field-label" htmlFor="rt-urg">Urgency</label>
                  <select id="rt-urg" className="klp-field-input" value={newTicket.urgency} onChange={(e) => setNewTicket({ ...newTicket, urgency: e.target.value })}>
                    <option value="standard">Standard</option><option value="elevated">Elevated</option><option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div><label className="klp-field-label" htmlFor="rt-desc">Scope</label>
                <textarea id="rt-desc" className="klp-field-input" style={cssVars({ minHeight: 96, resize: 'vertical' })} placeholder="Describe the work the client needs (min 10 characters)..." value={newTicket.description} onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })} />
              </div>
              {raiseResult && <div className="klp-note">{raiseResult}</div>}
              <div className="klp-portal-actions" style={cssVars({ marginTop: 4 })}>
                <button type="button" className="klp-btn primary" disabled={busy || !raiseValid} onClick={() => void handleRaise()}>{busy ? 'Raising...' : 'Raise & send to client'}</button>
                <button type="button" className="klp-btn ghost" onClick={() => setShowRaise(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QueueList({ rows, full }: { rows: QueueRow[]; full?: boolean }) {
  return (
    <div className="klp-list">
      {rows.map((r) => {
          const sp = statusPill(r.status);
          const sla = slaPill(r);
          return (
            <div key={r.id} className="klp-list-row" style={cssVars({ gridTemplateColumns: full ? 'minmax(110px,auto) 1fr auto auto auto' : 'minmax(110px,auto) 1fr auto auto' })}>
              <span className="ref">{r.ref}</span>
              <span className="title">{r.description}<span style={cssVars({ display: 'block', fontSize: 11, color: 'var(--mid)', fontFamily: 'var(--font-mono)' })}>{r.client.business_name} · {r.assigned_to ?? 'unassigned'}</span></span>
              {full && <span className="date">{fmtDate(r.created_at)}</span>}
              <span className={`klp-pill ${sp.cls}`}>{sp.label}</span>
              <span className={`klp-pill ${sla.cls}`}>{sla.label}</span>
            </div>
          );
        })}
    </div>
  );
}
