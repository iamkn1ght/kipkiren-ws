/**
 * Staff two-factor step, shown after a correct password.
 *  - First time: fetch a secret, show it as a QR code for an authenticator app
 *    (Google Authenticator, Microsoft Authenticator, 1Password...), then confirm
 *    one 6-digit code to switch two-factor on.
 *  - Every later sign-in: just the 6-digit code.
 * The step token expires after 5 minutes; then the person signs in again.
 */

import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { useAuth, type MfaChallenge } from './auth.tsx';
import { ApiError, mfaSetup, type MfaSetup } from './api.ts';

const MESSAGES: Record<string, string> = {
  invalid_code: 'That code did not match. Use the newest code in your app, and check your phone\'s clock is set automatically.',
  no_setup: 'Two-factor is not set up yet. Sign in again to start setup.',
  mfa_token_invalid: 'That took longer than 5 minutes. Sign in again.',
  rate_limited: 'Too many tries. Wait 10 minutes, then sign in again.',
  mfa_already_enabled: 'Two-factor is already on for this account. Enter the code from your app.',
};

export function MfaStep({ challenge, onRestart }: { challenge: MfaChallenge; onRestart: () => void }) {
  const { completeMfa } = useAuth();
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupMode, setSetupMode] = useState(challenge.setup);

  useEffect(() => {
    if (!setupMode) return;
    let alive = true;
    mfaSetup(challenge.token)
      .then(async (s) => {
        if (!alive) return;
        setSetup(s);
        setQr(await QRCode.toDataURL(s.otpauth_url, { margin: 1, width: 220 }));
      })
      .catch((e) => {
        if (!alive) return;
        const c = e instanceof ApiError ? e.code : '';
        if (c === 'mfa_already_enabled') setSetupMode(false);
        setError(MESSAGES[c] ?? 'Could not start two-factor setup. Sign in again.');
      });
    return () => { alive = false; };
  }, [challenge.token, setupMode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await completeMfa(challenge, code.replace(/\s+/g, ''));
    } catch (err) {
      const c = err instanceof ApiError ? (err.status === 429 ? 'rate_limited' : err.code) : '';
      setError(MESSAGES[c] ?? 'Could not check the code. Try again.');
      setCode('');
    } finally { setBusy(false); }
  };

  const grouped = setup?.secret.replace(/(.{4})/g, '$1 ').trim();

  return (
    <div className="klp-card klp-authcard">
      <div className="head">{setupMode ? 'Set up two-factor' : 'Two-factor code'}</div>
      {setupMode ? (
        <div className="klp-form">
          <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0 }}>
            Staff accounts need a second step. Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or 1Password), add an account, and scan this code.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            {qr ? <img src={qr} width={220} height={220} alt="QR code for your authenticator app" style={{ borderRadius: 12, background: '#fff', padding: 8 }} />
              : <div style={{ width: 220, height: 220, display: 'grid', placeItems: 'center', fontSize: 13 }}>{error ? '' : 'Preparing...'}</div>}
          </div>
          {grouped && (
            <p className="klp-field-help" style={{ margin: 0 }}>
              Can't scan? Enter this key instead: <strong style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: 1 }}>{grouped}</strong>
            </p>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 14, lineHeight: 1.55, margin: '0 0 4px' }}>Enter the 6-digit code from your authenticator app for {challenge.email}.</p>
      )}
      <form className="klp-form" onSubmit={submit} style={{ marginTop: 12 }}>
        <div>
          <label className="klp-field-label" htmlFor="mfa-code">6-digit code</label>
          <input id="mfa-code" className="klp-field-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7}
            placeholder="123 456" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ''))} disabled={busy} autoFocus required
            style={{ fontSize: 22, letterSpacing: 4, textAlign: 'center' }} />
        </div>
        {error && <div className="klp-auth-error">{error}</div>}
        <button type="submit" className="klp-btn primary full" disabled={busy || code.replace(/\s+/g, '').length !== 6}>
          {busy ? 'Checking...' : setupMode ? 'Turn on two-factor →' : 'Verify →'}
        </button>
        <button type="button" className="klp-auth-link klp-login-forgot" onClick={onRestart}>Back to sign in</button>
      </form>
    </div>
  );
}
