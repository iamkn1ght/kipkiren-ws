/**
 * Clients CRM (KWS-S8-001) - the admin surface for the onboarding + provisioning
 * backend. Search, status/invite filters, badges, and per-client quick actions
 * (edit, suspend/activate, resend invite, reset password). "Add client" runs the
 * full transactional onboarding (business + auth invite + profile) via
 * POST /v1/admin/clients; the client sets their own password from the invite.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { useApi } from './auth.tsx';
import { Search, SegBar, EmptyState, SkelList, ToolbarMeta } from './portalUi.tsx';
import type { ClientSummaryRow, RetainerPlanOption } from './useAdminData.ts';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

const INVITE_BADGE: Record<ClientSummaryRow['invite_status'], { cls: string; label: string }> = {
  active: { cls: 'active', label: 'Active' },
  accepted: { cls: 'warn', label: 'Invite accepted' },
  invited: { cls: 'draft', label: 'Invite sent' },
  unknown: { cls: 'draft', label: 'Provisioned' },
};

export function AdminClients({ clients, loading, reload }: { clients: ClientSummaryRow[] | null; loading: boolean; reload: () => void }) {
  const call = useApi();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editClient, setEditClient] = useState<ClientSummaryRow | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const all = clients ?? [];
  const counts = { all: all.length, active: all.filter((c) => c.status === 'active').length, suspended: all.filter((c) => c.status === 'suspended').length };
  const rows = all.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.business_name.toLowerCase().includes(q) || c.contact_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.plan.toLowerCase().includes(q);
  });

  const runAction = async (id: string, path: string, ok: string, body: Record<string, unknown> = {}) => {
    setBusyId(id); setMenuFor(null);
    try { await call(path, { method: 'POST', body }); setToast(ok); reload(); }
    catch { setToast('That action did not go through. Please try again.'); }
    finally { setBusyId(null); }
  };

  return (
    <>
      <div className="klp-toolbar">
        <Search value={search} onChange={setSearch} placeholder="Search business, contact, email or plan" />
        <SegBar value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status"
          options={[{ id: 'all', label: 'All', count: counts.all }, { id: 'active', label: 'Active', count: counts.active }, { id: 'suspended', label: 'Suspended', count: counts.suspended }]} />
        <ToolbarMeta>{rows.length} shown</ToolbarMeta>
        <button type="button" className="klp-btn primary klp-crm-add" onClick={() => setAddOpen(true)}>Add client</button>
      </div>

      {loading ? <SkelList rows={5} />
        : rows.length === 0 ? <EmptyState title={all.length === 0 ? 'No clients yet' : 'No clients match'} sub={all.length === 0 ? 'Onboard your first client with the button above.' : 'Try a different search or filter.'} />
        : (
          <div className="klp-crm">
            {rows.map((c) => {
              const inv = INVITE_BADGE[c.invite_status];
              const busy = busyId === c.id;
              return (
                <div key={c.id} className={`klp-card klp-crm-row ${busy ? 'busy' : ''}`}>
                  <div className="main">
                    <div className="klp-crm-name">{c.business_name}</div>
                    <div className="klp-crm-sub">{c.contact_name} · {c.email}</div>
                    <div className="klp-crm-badges">
                      <span className={`klp-pill ${c.status === 'active' ? 'active' : 'warn'}`}>{c.status}</span>
                      <span className="klp-pill draft">{c.plan}</span>
                      <span className={`klp-pill ${inv.cls}`}>{inv.label}</span>
                    </div>
                  </div>
                  <div className="meta">
                    <div><span className="k">MRR</span><span className="v">KES {c.monthly_fee_kes.toLocaleString()}</span></div>
                    <div><span className="k">Open</span><span className="v">{c.open_tickets}</span></div>
                    <div><span className="k">Since</span><span className="v">{fmtDate(c.created_at)}</span></div>
                  </div>
                  <div className="klp-crm-actionwrap">
                    <button type="button" className="klp-crm-kebab" aria-label="Client actions" disabled={busy} onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}>
                      <span /><span /><span />
                    </button>
                    {menuFor === c.id && (
                      <div className="klp-crm-menu" onMouseLeave={() => setMenuFor(null)}>
                        <button type="button" onClick={() => { setEditClient(c); setMenuFor(null); }}>Edit details</button>
                        {c.status === 'active'
                          ? <button type="button" onClick={() => runAction(c.id, `/v1/admin/clients/${c.id}/status`, 'Client suspended', { status: 'suspended' })} className="danger">Suspend</button>
                          : <button type="button" onClick={() => runAction(c.id, `/v1/admin/clients/${c.id}/status`, 'Client re-activated', { status: 'active' })}>Activate</button>}
                        <button type="button" onClick={() => runAction(c.id, `/v1/admin/clients/${c.id}/resend-invite`, 'Invitation re-sent')}>Resend invite</button>
                        <button type="button" onClick={() => runAction(c.id, `/v1/admin/clients/${c.id}/reset-password`, 'Password reset sent')}>Send password reset</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {addOpen && <OnboardModal onClose={() => setAddOpen(false)} onDone={() => { setToast('Client onboarded'); reload(); }} />}
      {editClient && <EditModal client={editClient} onClose={() => setEditClient(null)} onDone={() => { setEditClient(null); setToast('Client updated'); reload(); }} />}
      <div className={toast ? 'klp-toast show' : 'klp-toast'}>{toast}</div>
    </>
  );
}

// suspend note: status endpoint toggles - the row action passes the target via a
// separate call below so we send the intended status explicitly.
// (kept inline above by sending body with the desired status)

// ---------------------------------------------------------------------------
// Onboarding modal - progressive form + success screen
// ---------------------------------------------------------------------------

interface OnboardForm { business_name: string; contact_name: string; email: string; phone: string; retainer_plan_id: string; status: 'active' | 'suspended'; notes: string }
interface OnboardSuccess { client: { id: string; business_name: string; status: string; created_at: string }; plan_name: string; invite_status: string }

function OnboardModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const call = useApi();
  const [plans, setPlans] = useState<RetainerPlanOption[] | null>(null);
  const [form, setForm] = useState<OnboardForm>({ business_name: '', contact_name: '', email: '', phone: '', retainer_plan_id: '', status: 'active', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<OnboardSuccess | null>(null);

  useEffect(() => {
    call<{ plans: RetainerPlanOption[] }>('/v1/admin/retainer-plans')
      .then((r) => { setPlans(r.plans); if (r.plans[0]) setForm((f) => ({ ...f, retainer_plan_id: f.retainer_plan_id || r.plans[0]!.id })); })
      .catch(() => setPlans([]));
  }, [call]);

  const set = (k: keyof OnboardForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim());
  const valid = form.business_name.trim().length >= 2 && form.contact_name.trim().length >= 2 && emailOk && !!form.retainer_plan_id;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const res = await call<OnboardSuccess>('/v1/admin/clients', {
        method: 'POST',
        body: { business_name: form.business_name.trim(), contact_name: form.contact_name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined, retainer_plan_id: form.retainer_plan_id, status: form.status, notes: form.notes.trim() || undefined },
      });
      setDone(res);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setError(err?.message ?? (err?.code === 'client_email_exists' ? 'A client with this email already exists.' : 'Onboarding failed. No records were created; please try again.'));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="klp-overlay open" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="klp-modal klp-onboard">
        {!done ? (
          <>
            <div className="klp-modal-hd"><div className="t">Onboard a client</div><button type="button" className="klp-modal-close" onClick={onClose} disabled={submitting}>Close</button></div>
            <div className="klp-modal-body">
              <p className="klp-onboard-lede">Creates the client, sends an invitation so they set their own password, and links everything. No dashboard, no SQL.</p>
              <div className="klp-onboard-grid">
                <Field label="Business name" required>
                  <input className="klp-field-input" value={form.business_name} onChange={(e) => set('business_name', e.target.value)} placeholder="Acme Ltd" autoFocus />
                </Field>
                <Field label="Contact person" required>
                  <input className="klp-field-input" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="Mary Wanjiru" />
                </Field>
                <Field label="Email" required hint={form.email.length > 0 && !emailOk ? 'Enter a valid email' : undefined}>
                  <input className="klp-field-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="mary@acme.co.ke" />
                </Field>
                <Field label="Phone">
                  <input className="klp-field-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+254712345678" />
                </Field>
                <Field label="Retainer plan" required>
                  <select className="klp-field-input" value={form.retainer_plan_id} onChange={(e) => set('retainer_plan_id', e.target.value)} disabled={!plans}>
                    {!plans && <option>Loading...</option>}
                    {plans?.map((p) => <option key={p.id} value={p.id}>{p.name} · KES {p.monthly_fee_kes.toLocaleString()}/mo</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select className="klp-field-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </Field>
              </div>
              <Field label="Notes (optional)">
                <textarea className="klp-field-input" style={cssVars({ minHeight: 68, resize: 'vertical' })} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything the team should know" />
              </Field>
              {error && <div className="klp-auth-error">{error}</div>}
              <div className="klp-portal-actions">
                <button type="button" className="klp-btn primary" disabled={!valid || submitting} onClick={() => void submit()}>{submitting ? 'Onboarding...' : 'Onboard & invite'}</button>
                <button type="button" className="klp-btn ghost" onClick={onClose} disabled={submitting}>Cancel</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="klp-modal-hd"><div className="t">Client onboarded</div><button type="button" className="klp-modal-close" onClick={onDone}>Done</button></div>
            <div className="klp-modal-body klp-onboard-success">
              <div className="tick"><span /></div>
              <h3>{done.client.business_name} is set up.</h3>
              <p>The client record is created. Their email invitation to set a password will be delivered once the email service is switched on. We never see or store their password.</p>
              <div className="klp-onboard-summary">
                <div><span className="k">Client created</span><span className="v">Yes</span></div>
                <div><span className="k">Invitation</span><span className="v">{done.invite_status === 'sent' ? 'Queued (email pending)' : 'Existing account linked'}</span></div>
                <div><span className="k">Retainer plan</span><span className="v">{done.plan_name}</span></div>
                <div><span className="k">Status</span><span className="v" style={cssVars({ textTransform: 'capitalize' })}>{done.client.status}</span></div>
                <div><span className="k">Date created</span><span className="v">{fmtDate(done.client.created_at)}</span></div>
              </div>
              <div className="klp-portal-actions">
                <button type="button" className="klp-btn primary" onClick={onDone}>Back to clients</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit modal - business details only (email/auth are not editable here)
// ---------------------------------------------------------------------------

function EditModal({ client, onClose, onDone }: { client: ClientSummaryRow; onClose: () => void; onDone: () => void }) {
  const call = useApi();
  const [plans, setPlans] = useState<RetainerPlanOption[] | null>(null);
  const [form, setForm] = useState({ business_name: client.business_name, contact_name: client.contact_name, phone: client.phone ?? '', retainer_plan_id: client.retainer_plan_id ?? '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { call<{ plans: RetainerPlanOption[] }>('/v1/admin/retainer-plans').then((r) => setPlans(r.plans)).catch(() => setPlans([])); }, [call]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (saving) return; setSaving(true); setError(null);
    try {
      await call(`/v1/admin/clients/${client.id}`, { method: 'PATCH', body: { business_name: form.business_name.trim(), contact_name: form.contact_name.trim(), phone: form.phone.trim() || undefined, retainer_plan_id: form.retainer_plan_id || undefined } });
      onDone();
    } catch (e) { const err = e as { message?: string }; setError(err?.message ?? 'Could not save changes.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="klp-overlay open" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="klp-modal">
        <div className="klp-modal-hd"><div className="t">Edit {client.business_name}</div><button type="button" className="klp-modal-close" onClick={onClose} disabled={saving}>Close</button></div>
        <div className="klp-modal-body">
          <p style={cssVars({ fontSize: 13, color: 'var(--mid)' })}>Email and sign-in are managed through the invite / reset flow, not here.</p>
          <Field label="Business name"><input className="klp-field-input" value={form.business_name} onChange={(e) => set('business_name', e.target.value)} /></Field>
          <Field label="Contact person"><input className="klp-field-input" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} /></Field>
          <Field label="Phone"><input className="klp-field-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Retainer plan">
            <select className="klp-field-input" value={form.retainer_plan_id} onChange={(e) => set('retainer_plan_id', e.target.value)} disabled={!plans}>
              {plans?.map((p) => <option key={p.id} value={p.id}>{p.name} · KES {p.monthly_fee_kes.toLocaleString()}/mo</option>)}
            </select>
          </Field>
          {error && <div className="klp-auth-error">{error}</div>}
          <div className="klp-portal-actions">
            <button type="button" className="klp-btn primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving...' : 'Save changes'}</button>
            <button type="button" className="klp-btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string | undefined; children: React.ReactNode }) {
  return (
    <label className="klp-onboard-field">
      <span className="klp-field-label">{label}{required && <span className="req"> *</span>}</span>
      {children}
      {hint && <span className="klp-onboard-hint">{hint}</span>}
    </label>
  );
}
