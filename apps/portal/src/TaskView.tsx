/**
 * Task view - Kamau (technical_delivery).
 *
 * Ports the canonical kws_task_view.html layout. It binds ONLY the safe
 * fields the API exposes (ref, category, urgency, status, description, SLA
 * deadline, created/updated). The mockup's estimate/logged-hours, ref-docs
 * count, weekly-capacity stats, and the "Add note" modal are intentionally
 * omitted - there is no data source for them and the architecture forbids
 * fabricating Kamau-facing detail. See ADR-KWS-003 / KWS-SEC-007.
 */

import { useEffect, useState } from 'react';
import { useAuth } from './auth.tsx';
import { useTaskData, type Task } from './useTaskData.ts';

type Tab = 'active' | 'completed';

const CATEGORY_LABEL: Record<string, string> = {
  web: 'Web',
  cloud: 'Cloud',
  seo: 'SEO',
  social: 'Social',
  dns: 'DNS',
  general: 'General',
};

const URGENCY_LABEL: Record<Task['urgency'], string> = {
  standard: 'Standard',
  elevated: 'Elevated urgency',
  urgent: 'Urgent',
};

const URGENCY_BADGE: Record<Task['urgency'], string> = {
  standard: 'Standard',
  elevated: '1.25× urgency',
  urgent: '1.5× urgency',
};

function isElevated(u: Task['urgency']): boolean {
  return u === 'elevated' || u === 'urgent';
}

function categoryLabel(c: string): string {
  return `${CATEGORY_LABEL[c] ?? c} task`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function dueWithin7Days(iso: string | null): boolean {
  if (!iso) return false;
  const due = new Date(iso).getTime();
  if (Number.isNaN(due)) return false;
  const now = Date.now();
  return due >= now && due <= now + 7 * 24 * 60 * 60 * 1000;
}

interface PillSpec {
  cls: string;
  text: string;
}

function statusPill(status: string): PillSpec {
  switch (status) {
    case 'in_progress':
      return { cls: 'progress', text: 'In progress' };
    case 'complete':
    case 'closed':
      return { cls: 'done', text: 'Complete' };
    case 'paid':
    default:
      return { cls: 'assigned', text: 'Assigned · not started' };
  }
}

export function TaskView() {
  const { session, signOut } = useAuth();
  const { active, completed, loading, error, startTask, completeTask } = useTaskData();
  const [tab, setTab] = useState<Tab>('active');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const email = session?.email ?? '';
  const displayName = email ? (email.split('@')[0] ?? 'there') : 'there';
  const inProgress = active.filter((t) => t.status === 'in_progress').length;
  const dueThisWeek = active.filter((t) => dueWithin7Days(t.sla_deadline_at)).length;
  const elevatedCount = active.filter((t) => isElevated(t.urgency)).length;

  const runAction = async (
    id: string,
    fn: (id: string) => Promise<void>,
    label: string,
  ) => {
    setPendingId(id);
    try {
      await fn(id);
      setToast(label);
    } catch {
      setToast('Action failed · try again');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="kwsp app-task">
      {/* ── SIDEBAR ── */}
      <aside className="sb">
        <div className="sb-logo">
          <div className="sb-mark">KIPKIREN · WS</div>
          <div className="sb-sub">TASKS</div>
          <div className="sb-scope">TECHNICAL DELIVERY</div>
        </div>
        <nav className="sb-nav">
          <button
            type="button"
            className={tab === 'active' ? 'sni active' : 'sni'}
            onClick={() => setTab('active')}
          >
            <span className="sni-dot" />
            My Tasks
            {active.length > 0 && <span className="sni-badge">{active.length}</span>}
          </button>
          <button
            type="button"
            className={tab === 'completed' ? 'sni active' : 'sni'}
            onClick={() => setTab('completed')}
          >
            <span className="sni-dot" />
            Completed
          </button>
        </nav>
        <div className="sb-restrict">
          Scope · assigned tasks only.
          <br />
          No client data · no billing.
        </div>
        <div className="sb-foot">
          <div className="sb-role">Technical Delivery</div>
          <div className="sb-email">{email || 'signed in'}</div>
          <button type="button" className="sb-signout" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="main">
        <div className="topbar">
          <div className="tb-crumb">
            Tasks · <span>{tab === 'active' ? 'My Tasks' : 'Completed'}</span>
          </div>
          <div className="tb-right">{active.length} active · {completed.length} completed</div>
        </div>

        {/* ═══ MY TASKS ═══ */}
        <section className={tab === 'active' ? 'view active' : 'view'}>
          <h1 className="greeting">
            Good day, <em>{displayName}</em>.
          </h1>
          <p className="g-sub">
            {loading ? 'Loading tasks...' : `${active.length} active task${active.length === 1 ? '' : 's'} assigned to you`}
          </p>

          {error && <div className="lg-error">Couldn't load tasks · {error}</div>}

          <div className="stats">
            <div className="sc">
              <div className="sc-lbl">Active</div>
              <div className="sc-val">{active.length}</div>
              <div className="sc-note">{inProgress} in progress</div>
            </div>
            <div className="sc">
              <div className="sc-lbl">Due this week</div>
              <div className="sc-val">{dueThisWeek}</div>
              <div className={elevatedCount > 0 ? 'sc-note warn' : 'sc-note'}>
                {elevatedCount > 0 ? `${elevatedCount} elevated urgency` : 'on track'}
              </div>
            </div>
            <div className="sc">
              <div className="sc-lbl">Completed</div>
              <div className="sc-val">{completed.length}</div>
              <div className="sc-note">all time</div>
            </div>
          </div>

          <div className="shd">Active · assigned to you</div>

          {!loading && active.length === 0 && (
            <p className="g-sub">No active tasks assigned to you right now.</p>
          )}

          {active.map((t) => {
            const pill = statusPill(t.status);
            const elev = isElevated(t.urgency);
            const busy = pendingId === t.id;
            return (
              <div key={t.id} className={elev ? 'task elev' : 'task'}>
                <div className="task-hd">
                  <div>
                    <div className="task-ref">
                      {t.ref} · {URGENCY_LABEL[t.urgency]}
                    </div>
                    <div className="task-title">{categoryLabel(t.category)}</div>
                    <div className="task-mt">Created · {fmtDate(t.created_at)}</div>
                  </div>
                  <span className={elev ? 'bdg bdg-a' : 'bdg bdg-o'}>{URGENCY_BADGE[t.urgency]}</span>
                </div>
                <div className="task-desc">{t.description}</div>
                <div className="task-meta-row">
                  <div className="tmr">
                    <div className="tmr-l">Due</div>
                    <div className={elev ? 'tmr-v due urg' : 'tmr-v due'}>{fmtDate(t.sla_deadline_at)}</div>
                  </div>
                  <div className="tmr">
                    <div className="tmr-l">Created</div>
                    <div className="tmr-v">{fmtDate(t.created_at)}</div>
                  </div>
                </div>
                <div className="task-foot">
                  <div className={`status-pill ${pill.cls}`}>{pill.text}</div>
                  <div className="task-acts">
                    {t.status === 'paid' && (
                      <button
                        type="button"
                        className="btn-act btn-start"
                        disabled={busy}
                        onClick={() => void runAction(t.id, startTask, `Started · ${t.ref}`)}
                      >
                        {busy ? 'Starting...' : 'Start work'}
                      </button>
                    )}
                    {t.status === 'in_progress' && (
                      <button
                        type="button"
                        className="btn-act btn-done"
                        disabled={busy}
                        onClick={() => void runAction(t.id, completeTask, `Marked complete · ${t.ref}`)}
                      >
                        {busy ? 'Saving...' : 'Mark complete'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* ═══ COMPLETED ═══ */}
        <section className={tab === 'completed' ? 'view active' : 'view'}>
          <h1 className="greeting">Completed tasks</h1>
          <p className="g-sub">
            {completed.length} completed task{completed.length === 1 ? '' : 's'}
          </p>

          {completed.length > 0 && (
            <>
              <div className="done-row-hd">
                <span>Ref</span>
                <span>Task</span>
                <span>Completed</span>
              </div>
              {completed.map((t) => (
                <div key={t.id} className="done-row">
                  <div className="done-tid">{t.ref}</div>
                  <div className="done-title">{categoryLabel(t.category)}</div>
                  <div className="done-date">{fmtDateTime(t.updated_at)}</div>
                </div>
              ))}
            </>
          )}

          {completed.length === 0 && <p className="g-sub">Nothing completed yet.</p>}
        </section>
      </div>

      <div className={toast ? 'toast show' : 'toast'}>{toast}</div>
    </div>
  );
}
