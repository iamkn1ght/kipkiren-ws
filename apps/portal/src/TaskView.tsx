/**
 * Task view - Kamau (technical_delivery). Warm editorial rebuild on the .klp
 * portal shell. Binds ONLY the safe fields the API exposes (ref, category,
 * urgency, status, description, SLA deadline, created/updated). No client or
 * billing data - ADR-KWS-003 / KWS-SEC-007.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { useAuth } from './auth.tsx';
import { KlpToggle } from './klpTheme.tsx';
import { useTaskData, type Task } from './useTaskData.ts';
import { SkelList, Search, SegBar, EmptyState, ToolbarMeta } from './portalUi.tsx';
import './landing.css';

type Tab = 'active' | 'completed';
const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

const CATEGORY_LABEL: Record<string, string> = { web: 'Web', cloud: 'Cloud', seo: 'SEO', social: 'Social', dns: 'DNS', general: 'General' };
const URGENCY_LABEL: Record<Task['urgency'], string> = { standard: 'Standard', elevated: 'Elevated urgency', urgent: 'Urgent' };
const URGENCY_BADGE: Record<Task['urgency'], string> = { standard: 'Standard', elevated: '1.25× urgency', urgent: '1.5× urgency' };

const isElevated = (u: Task['urgency']) => u === 'elevated' || u === 'urgent';
const categoryLabel = (c: string) => `${CATEGORY_LABEL[c] ?? c} task`;

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function dueWithin7Days(iso: string | null): boolean {
  if (!iso) return false;
  const due = new Date(iso).getTime();
  if (Number.isNaN(due)) return false;
  const now = Date.now();
  return due >= now && due <= now + 7 * 24 * 60 * 60 * 1000;
}
function statusPill(status: string): { cls: string; text: string } {
  if (status === 'in_progress') return { cls: 'progress', text: 'In progress' };
  if (status === 'complete' || status === 'closed') return { cls: 'done', text: 'Complete' };
  return { cls: 'draft', text: 'Assigned · not started' };
}

export function TaskView() {
  const { session, signOut } = useAuth();
  const { active, completed, loading, error, startTask, completeTask } = useTaskData();
  const [tab, setTab] = useState<Tab>('active');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'todo' | 'in_progress'>('all');
  const [cSearch, setCSearch] = useState('');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const email = session?.email ?? '';
  const name = email ? (email.split('@')[0] ?? 'there') : 'there';
  const inProgress = active.filter((t) => t.status === 'in_progress').length;
  const dueThisWeek = active.filter((t) => dueWithin7Days(t.sla_deadline_at)).length;
  const elevatedCount = active.filter((t) => isElevated(t.urgency)).length;

  const statusCounts = { all: active.length, todo: active.length - inProgress, in_progress: inProgress };
  const matches = (t: Task, q: string) =>
    !q || t.ref.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) ||
    (CATEGORY_LABEL[t.category] ?? t.category).toLowerCase().includes(q);
  const filteredActive = active.filter((t) => {
    if (statusFilter === 'in_progress' && t.status !== 'in_progress') return false;
    if (statusFilter === 'todo' && t.status === 'in_progress') return false;
    return matches(t, search.trim().toLowerCase());
  });
  const filteredCompleted = completed.filter((t) => matches(t, cSearch.trim().toLowerCase()));

  const runAction = async (id: string, fn: (id: string) => Promise<void>, label: string) => {
    setPendingId(id);
    try { await fn(id); setToast(label); }
    catch { setToast('Action failed · try again'); }
    finally { setPendingId(null); }
  };

  return (
    <div className="klp">
      <div className="klp-topbrand klp-container">
        <span className="mark">K</span>
        <span className="name">Kipkiren<small>WEB SERVICES</small></span>
        <div className="klp-topbrand-r"><KlpToggle /></div>
      </div>

      <div className="klp-container klp-portal">
        <div className="klp-portal-layout">
          <aside className="klp-portal-aside">
            <div className="klp-mono lbl">Technical delivery</div>
            <nav className="klp-portal-nav">
              <button type="button" className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
                <span>My tasks</span>{active.length > 0 && <span className="badge">{active.length}</span>}
              </button>
              <button type="button" className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>
                <span>Completed</span>
              </button>
            </nav>
            <div className="klp-scope-note">Scope · assigned tasks only. No client data, no billing.</div>
            <div className="klp-portal-foot">
              <div className="who">{email || 'signed in'}</div>
              <button type="button" className="klp-portal-signout" onClick={() => void signOut()}>Sign out</button>
            </div>
          </aside>

          <div className="klp-portal-content">
            <header className="klp-portal-head">
              <div style={cssVars({ minWidth: 0 })}>
                <div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>{tab === 'active' ? 'My tasks' : 'Completed'}</div>
                <h1 className="klp-display-md">{tab === 'active' ? <>Good day, {name}.</> : 'Completed tasks'}</h1>
              </div>
            </header>

            {tab === 'active' && (
              <>
                {error && <div className="klp-note amber" style={cssVars({ marginBottom: 24 })}>Couldn't load tasks · {error}</div>}
                <div className="klp-kpis">
                  <div className="klp-card klp-kpi"><div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Active</div><div className="n">{loading ? '-' : active.length}</div><div className="klp-mono" style={cssVars({ color: 'var(--mid)', marginTop: 10, fontSize: 10 })}>{inProgress} in progress</div></div>
                  <div className="klp-card klp-kpi"><div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Due this week</div><div className={`n ${elevatedCount > 0 ? 'amber' : ''}`}>{loading ? '-' : dueThisWeek}</div><div className="klp-mono" style={cssVars({ color: 'var(--mid)', marginTop: 10, fontSize: 10 })}>{elevatedCount > 0 ? `${elevatedCount} elevated` : 'on track'}</div></div>
                  <div className="klp-card klp-kpi"><div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Completed</div><div className="n">{loading ? '-' : completed.length}</div><div className="klp-mono" style={cssVars({ color: 'var(--mid)', marginTop: 10, fontSize: 10 })}>all time</div></div>
                </div>

                {loading ? <SkelList rows={4} />
                  : (
                    <>
                      <div className="klp-toolbar">
                        <Search value={search} onChange={setSearch} placeholder="Search ref, category or description" />
                        <SegBar value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter tasks"
                          options={[
                            { id: 'all', label: 'All', count: statusCounts.all },
                            { id: 'todo', label: 'Not started', count: statusCounts.todo },
                            { id: 'in_progress', label: 'In progress', count: statusCounts.in_progress },
                          ]} />
                        <ToolbarMeta>{filteredActive.length} shown</ToolbarMeta>
                      </div>
                      {filteredActive.length === 0
                        ? <EmptyState title={active.length === 0 ? 'No active tasks' : 'No tasks match'} sub={active.length === 0 ? 'Work assigned to you appears here, in SLA order.' : 'Try a different search term or filter.'} />
                        : (
                    <div className="klp-tasks">
                      {filteredActive.map((t) => {
                        const pill = statusPill(t.status);
                        const elev = isElevated(t.urgency);
                        const busy = pendingId === t.id;
                        return (
                          <div key={t.id} className={`klp-card klp-task ${elev ? 'elev' : ''}`}>
                            <div className="klp-task-hd">
                              <div style={cssVars({ minWidth: 0 })}>
                                <div className="klp-task-ref">{t.ref} · {URGENCY_LABEL[t.urgency]}</div>
                                <div className="klp-task-title">{categoryLabel(t.category)}</div>
                              </div>
                              <span className={`klp-pill ${elev ? 'warn' : 'draft'}`}>{URGENCY_BADGE[t.urgency]}</span>
                            </div>
                            <div className="klp-task-desc">{t.description}</div>
                            <div className="klp-task-meta">
                              <div><div className="k">Due</div><div className={`v ${elev ? 'urg' : ''}`}>{fmtDate(t.sla_deadline_at)}</div></div>
                              <div><div className="k">Created</div><div className="v">{fmtDate(t.created_at)}</div></div>
                            </div>
                            <div className="klp-task-foot">
                              <span className={`klp-pill ${pill.cls}`}>{pill.text}</span>
                              <div>
                                {t.status === 'paid' && (
                                  <button type="button" className="klp-btn primary" style={cssVars({ padding: '10px 18px', fontSize: 11 })} disabled={busy}
                                    onClick={() => void runAction(t.id, startTask, `Started · ${t.ref}`)}>{busy ? 'Starting...' : 'Start work'}</button>
                                )}
                                {t.status === 'in_progress' && (
                                  <button type="button" className="klp-btn primary" style={cssVars({ padding: '10px 18px', fontSize: 11 })} disabled={busy}
                                    onClick={() => void runAction(t.id, completeTask, `Marked complete · ${t.ref}`)}>{busy ? 'Saving...' : 'Mark complete'}</button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                        )}
                    </>
                  )}
              </>
            )}

            {tab === 'completed' && (
              completed.length === 0
                ? <EmptyState title="Nothing completed yet" sub="Tasks you finish move here for your records." />
                : (
                  <>
                    <div className="klp-toolbar">
                      <Search value={cSearch} onChange={setCSearch} placeholder="Search completed tasks" />
                      <ToolbarMeta>{filteredCompleted.length} of {completed.length}</ToolbarMeta>
                    </div>
                    {filteredCompleted.length === 0
                      ? <EmptyState title="No tasks match" sub="Try a different search term." />
                      : (
                        <div className="klp-list">
                          {filteredCompleted.map((t) => (
                            <div key={t.id} className="klp-list-row" style={cssVars({ gridTemplateColumns: 'minmax(120px,auto) 1fr auto' })}>
                              <span className="ref">{t.ref}</span>
                              <span className="title">{categoryLabel(t.category)}</span>
                              <span className="date">{fmtDateTime(t.updated_at)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                  </>
                )
            )}
          </div>
        </div>
      </div>

      <div className={toast ? 'klp-toast show' : 'klp-toast'}>{toast}</div>
    </div>
  );
}
