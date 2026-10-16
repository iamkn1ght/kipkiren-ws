/**
 * Write a quote by hand for a ticket that has no AI draft (decomposition off
 * or failed). Saves a draft proforma via POST /v1/admin/tickets/:id/proforma;
 * it then appears in AI review for the usual approve & dispatch, so the
 * content-hash lock and client approval flow are unchanged.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { useApi } from './auth.tsx';
import { ApiError } from './api.ts';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;
const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

interface RateEntry { id: string; category: string; task_name: string; task_description?: string | null; estimated_hours: number; base_rate_kes_per_hour: number }
interface Line { task_name: string; task_description: string; hours: string; rate: string }

const blank = (rate = ''): Line => ({ task_name: '', task_description: '', hours: '', rate });

export function QuoteWriter({ ticketId, category, onDone, onCancel }: { ticketId: string; category: string; onDone: (msg: string) => void; onCancel: () => void }) {
  const call = useApi();
  const [card, setCard] = useState<RateEntry[]>([]);
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ entries: RateEntry[] }>('/v1/admin/rate-card')
      .then((r) => {
        const sorted = [...r.entries].sort((a, b) => Number(b.category === category) - Number(a.category === category) || a.task_name.localeCompare(b.task_name));
        setCard(sorted);
        const first = sorted[0];
        if (first) setLines((ls) => ls.map((l) => (l.rate ? l : { ...l, rate: String(first.base_rate_kes_per_hour) })));
      })
      .catch(() => setCard([]));
  }, [call, category]);

  const amount = (l: Line) => (Number(l.hours) > 0 && Number(l.rate) > 0 ? Number(l.hours) * Number(l.rate) : 0);
  const subtotal = lines.reduce((s, l) => s + amount(l), 0);
  const valid = lines.length > 0 && lines.every((l) => l.task_name.trim().length >= 2 && Number(l.hours) > 0 && Number.isInteger(Number(l.rate)) && Number(l.rate) > 0);
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const addFromCard = (id: string) => {
    const e = card.find((c) => c.id === id); if (!e) return;
    const line: Line = { task_name: e.task_name, task_description: e.task_description ?? '', hours: String(e.estimated_hours), rate: String(e.base_rate_kes_per_hour) };
    setLines((ls) => (ls.length === 1 && !ls[0]!.task_name && !ls[0]!.hours ? [line] : [...ls, line].slice(0, 12)));
  };

  const save = async () => {
    if (!valid || busy) return; setBusy(true); setError(null);
    try {
      const r = await call<{ ref: string; total_kes: number }>(`/v1/admin/tickets/${ticketId}/proforma`, {
        method: 'POST',
        body: { line_items: lines.map((l) => ({ task_name: l.task_name.trim(), ...(l.task_description.trim() ? { task_description: l.task_description.trim() } : {}), estimated_hours: Number(l.hours), rate_kes_per_hour: Number(l.rate) })) },
      });
      onDone(`Quote ${r.ref} drafted (${kes(r.total_kes)} incl. VAT). Review and dispatch it in AI review.`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      setError(code === 'proforma_already_open' ? 'This ticket already has an open quote - see AI review.' : code === 'ticket_not_quotable' ? 'This ticket is past the quoting stage.' : 'Could not save the quote. Check the lines and try again.');
    } finally { setBusy(false); }
  };

  return (
    <div style={cssVars({ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--hairline)' })}>
      <div className="klp-mono" style={cssVars({ color: 'var(--mid)', marginBottom: 10 })}>Write quote</div>
      {card.length > 0 && (
        <select className="klp-field-input" value="" onChange={(e) => addFromCard(e.target.value)} disabled={busy} aria-label="Add a line from the rate card" style={cssVars({ marginBottom: 12 })}>
          <option value="">+ Add from rate card...</option>
          {card.map((c) => <option key={c.id} value={c.id}>{c.task_name} · {c.estimated_hours}h @ {c.base_rate_kes_per_hour.toLocaleString()}/h</option>)}
        </select>
      )}
      {lines.map((l, i) => (
        <div key={i} className="klp-card" style={cssVars({ padding: 12, marginBottom: 10 })}>
          <input className="klp-field-input" placeholder="Task (e.g. Home page build)" value={l.task_name} onChange={(e) => set(i, { task_name: e.target.value })} disabled={busy} aria-label={`Line ${i + 1} task`} />
          <input className="klp-field-input" placeholder="Detail the client will see (optional)" value={l.task_description} onChange={(e) => set(i, { task_description: e.target.value })} disabled={busy} aria-label={`Line ${i + 1} detail`} style={cssVars({ marginTop: 8 })} />
          <div style={cssVars({ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginTop: 8, alignItems: 'center' })}>
            <input className="klp-field-input" inputMode="decimal" placeholder="Hours" value={l.hours} onChange={(e) => set(i, { hours: e.target.value })} disabled={busy} aria-label={`Line ${i + 1} hours`} />
            <input className="klp-field-input" inputMode="numeric" placeholder="Rate KES/h" value={l.rate} onChange={(e) => set(i, { rate: e.target.value })} disabled={busy} aria-label={`Line ${i + 1} rate`} />
            <span style={cssVars({ display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' })}>
              <span className="amt">{kes(amount(l))}</span>
              {lines.length > 1 && <button type="button" className="klp-modal-close" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={busy} aria-label={`Remove line ${i + 1}`}>Remove</button>}
            </span>
          </div>
        </div>
      ))}
      {lines.length < 12 && <button type="button" className="klp-btn ghost" disabled={busy} onClick={() => setLines((ls) => [...ls, blank(ls[ls.length - 1]?.rate ?? '')])}>+ Blank line</button>}
      <div className="klp-totrow" style={cssVars({ marginTop: 14 })}><span className="l">Subtotal (before plan discount, urgency and 16% VAT)</span><span className="r">{kes(subtotal)}</span></div>
      {error && <div className="klp-note amber" style={cssVars({ marginTop: 12 })}>{error}</div>}
      <div className="klp-portal-actions">
        <button type="button" className="klp-btn primary" disabled={!valid || busy} onClick={() => void save()}>{busy ? 'Saving...' : 'Save draft quote'}</button>
        <button type="button" className="klp-btn ghost" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
