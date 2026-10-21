/**
 * Staff second step: after a correct password we email a 6-digit code to the
 * account's address. The person types it here. Codes last 10 minutes and work
 * once; "Send a new code" emails a fresh one (3 per 10 minutes).
 */

import { useState, type FormEvent } from 'react';
import { useAuth, type MfaChallenge } from './auth.tsx';
import { ApiError, mfaResend } from './api.ts';

const MESSAGES: Record<string, string> = {
  invalid_code: 'That code did not match. Check the newest email and try again.',
  code_used: 'That code was already used. Send a new code.',
  mfa_token_invalid: 'The code expired after 10 minutes. Sign in again.',
  rate_limited: 'Too many tries. Wait 10 minutes, then sign in again.',
  code_send_failed: 'We could not send a new code just now. Try again in a minute.',
};

export function MfaStep({ challenge, onRestart }: { challenge: MfaChallenge; onRestart: () => void }) {
  const { completeMfa } = useAuth();
  const [current, setCurrent] = useState(challenge);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (err: unknown) => {
    const c = err instanceof ApiError ? (err.status === 429 ? 'rate_limited' : err.code) : '';
    setError(MESSAGES[c] ?? 'Something went wrong. Try again.');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setNote(null);
    try { await completeMfa(current, code.replace(/\s+/g, '')); }
    catch (err) { fail(err); setCode(''); }
    finally { setBusy(false); }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true); setError(null); setNote(null);
    try {
      const r = await mfaResend(current.token);
      setCurrent({ ...current, token: r.mfa_token, sentTo: r.sent_to });
      setNote(`A new code is on its way to ${r.sent_to}. Use the newest email.`);
      setCode('');
    } catch (err) { fail(err); }
    finally { setBusy(false); }
  };

  return (
    <div className="klp-card klp-authcard">
      <div className="head">Check your email</div>
      <p style={{ fontSize: 14, lineHeight: 1.55, margin: '0 0 4px' }}>
        We emailed a 6-digit sign-in code to <strong>{current.sentTo}</strong>. It expires in 10 minutes.
      </p>
      <form className="klp-form" onSubmit={submit} style={{ marginTop: 12 }}>
        <div>
          <label className="klp-field-label" htmlFor="mfa-code">6-digit code</label>
          <input id="mfa-code" className="klp-field-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7}
            placeholder="123 456" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ''))} disabled={busy} autoFocus required
            style={{ fontSize: 22, letterSpacing: 4, textAlign: 'center' }} />
        </div>
        {error && <div className="klp-auth-error">{error}</div>}
        {note && <p className="klp-field-help" style={{ margin: 0 }}>{note}</p>}
        <button type="submit" className="klp-btn primary full" disabled={busy || code.replace(/\s+/g, '').length !== 6}>
          {busy ? 'Checking...' : 'Sign in →'}
        </button>
        <button type="button" className="klp-auth-link klp-login-forgot" onClick={() => void resend()} disabled={busy}>Didn't get it? Send a new code</button>
        <button type="button" className="klp-auth-link klp-login-forgot" onClick={onRestart} disabled={busy}>Back to sign in</button>
      </form>
    </div>
  );
}
