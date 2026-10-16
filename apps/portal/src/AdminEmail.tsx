/**
 * Compose an email in the Kipkiren WS branded template.
 *  - To a client (address on file), optionally about one of their tickets.
 *  - Or (admins) to any address.
 * Preview renders the exact HTML the recipient gets (server-side template),
 * shown in a sandboxed iframe. Sending is synchronous so the result is real.
 */

import { useState, type CSSProperties } from 'react';
import { useApi } from './auth.tsx';
import { ApiError } from './api.ts';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

export interface ComposeTarget {
  client?: { id: string; business_name: string; email: string };
  ticket?: { id: string; ref: string };
}

const ERR: Record<string, string> = {
  email_not_configured: 'Email is not configured on the server yet.',
  email_send_failed: 'Google did not accept the email. Try again in a minute.',
  admin_only_free_address: 'Only admins can email an address that is not a client.',
  client_not_found: 'That client could not be found.',
  ticket_not_found: 'That ticket does not belong to this client.',
};

export function ComposeEmailModal({ target, onClose, onSent }: { target: ComposeTarget; onClose: () => void; onSent: (msg: string) => void }) {
  const call = useApi();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState(target.ticket ? `Update on your request` : '');
  const [message, setMessage] = useState('');
  const [cta, setCta] = useState(true);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const body = () => ({
    ...(target.client ? { client_id: target.client.id } : { to: to.trim() }),
    ...(target.ticket ? { ticket_id: target.ticket.id } : {}),
    subject: subject.trim(),
    message: message.trim(),
    cta: cta ? 'portal' : 'none',
  });
  const valid = subject.trim().length >= 3 && message.trim().length > 0 && (!!target.client || /.+@.+\..+/.test(to.trim()));
  const fail = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : '';
    setError(ERR[code] ?? (e instanceof ApiError && e.message ? e.message : 'That did not go through. Please try again.'));
  };

  const doPreview = async () => {
    if (!valid || busy) return; setBusy('preview'); setError(null);
    try { setPreview(await call<{ subject: string; html: string }>('/v1/admin/email/preview', { method: 'POST', body: body() })); }
    catch (e) { fail(e); } finally { setBusy(null); }
  };
  const doSend = async () => {
    if (!valid || busy) return; setBusy('send'); setError(null);
    try {
      const r = await call<{ to: string }>('/v1/admin/email/compose', { method: 'POST', body: body() });
      onSent(`Email sent to ${r.to}`); onClose();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const recipient = target.client ? `${target.client.business_name} · ${target.client.email}` : null;

  return (
    <div className="klp-overlay open" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="klp-modal" style={cssVars({ maxWidth: 640 })}>
        <div className="klp-modal-hd"><div className="t">{preview ? 'Preview' : 'Write email'}</div><button type="button" className="klp-modal-close" onClick={onClose} disabled={!!busy}>Close</button></div>
        <div className="klp-modal-body">
          {preview ? (
            <>
              <div className="klp-mono" style={cssVars({ color: 'var(--mid)', marginBottom: 8 })}>Subject · {preview.subject}</div>
              <iframe title="Email preview" sandbox="" srcDoc={preview.html} style={cssVars({ width: '100%', height: 460, border: '1px solid var(--hairline)', borderRadius: 12, background: '#F5F3EE' })} />
            </>
          ) : (
            <>
              <label className="klp-onboard-field">
                <span className="klp-field-label">To</span>
                {recipient
                  ? <input className="klp-field-input" value={recipient} readOnly />
                  : <input className="klp-field-input" type="email" placeholder="name@example.com" value={to} onChange={(e) => setTo(e.target.value)} disabled={!!busy} autoFocus />}
              </label>
              {target.ticket && <div className="klp-note" style={cssVars({ marginBottom: 12 })}>About request <strong>{target.ticket.ref}</strong> - the ref is added to the subject and email.</div>}
              <label className="klp-onboard-field">
                <span className="klp-field-label">Subject</span>
                <input className="klp-field-input" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!!busy} maxLength={140} autoFocus={!!recipient} />
              </label>
              <label className="klp-onboard-field">
                <span className="klp-field-label">Message</span>
                <textarea className="klp-field-input" rows={9} value={message} onChange={(e) => setMessage(e.target.value)} disabled={!!busy} maxLength={5000}
                  placeholder={'Write as you would to the client.\n\nLeave a blank line between paragraphs. We add the greeting and sign-off.'} style={cssVars({ resize: 'vertical', minHeight: 180, fontFamily: 'inherit' })} />
              </label>
              <label style={cssVars({ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 4 })}>
                <input type="checkbox" checked={cta} onChange={(e) => setCta(e.target.checked)} disabled={!!busy} />
                Include a button to the client portal
              </label>
            </>
          )}
          {error && <div className="klp-note amber" style={cssVars({ marginTop: 12 })}>{error}</div>}
          <div className="klp-portal-actions">
            <button type="button" className="klp-btn primary" disabled={!valid || !!busy} onClick={() => void doSend()}>{busy === 'send' ? 'Sending...' : 'Send email'}</button>
            {preview
              ? <button type="button" className="klp-btn ghost" disabled={!!busy} onClick={() => setPreview(null)}>Back to edit</button>
              : <button type="button" className="klp-btn ghost" disabled={!valid || !!busy} onClick={() => void doPreview()}>{busy === 'preview' ? 'Rendering...' : 'Preview'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
