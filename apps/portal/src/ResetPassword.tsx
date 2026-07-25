/**
 * Password recovery + invite completion (Sprint 2).
 *
 * Flow (both use Supabase Auth tokens delivered by email):
 *   Forgot password  -> POST /v1/auth/forgot-password -> recovery email
 *   Invite / recovery link -> lands here with #access_token=...&type=invite|recovery
 *     -> SetPassword form -> POST /v1/auth/set-password -> sign in
 *
 * The frontend never talks to Supabase directly - it forwards the token from the
 * URL hash to our API, which performs the update. Email delivery depends on the
 * provider being configured; the flow itself is complete and works the moment it
 * is. `parseRecoveryHash` reads the token App.tsx routes on.
 */

import { useState, type FormEvent } from 'react';
import { KlpToggle } from './klpTheme.tsx';
import { ApiError, forgotPassword, setPassword } from './api.ts';
import './landing.css';

export type RecoveryContext = { accessToken: string; kind: 'invite' | 'recovery' };

/** Read a Supabase invite/recovery token from the URL hash (once, at mount). */
export function parseRecoveryHash(): RecoveryContext | null {
  const raw = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const accessToken = params.get('access_token');
  const type = params.get('type');
  if (!accessToken || (type !== 'recovery' && type !== 'invite')) return null;
  return { accessToken, kind: type };
}

function clearHash(): void {
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* ignore */ }
}

// 0-4 strength from length + character variety.
function scorePassword(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const score = Math.min(4, s);
  const label = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][pw.length < 8 ? 0 : score] ?? 'Weak';
  return { score: pw.length < 8 ? 0 : score, label };
}

function Strength({ pw }: { pw: string }) {
  if (!pw) return null;
  const { score, label } = scorePassword(pw);
  return (
    <div className="klp-pwmeter" aria-live="polite">
      <div className="klp-pwmeter-bars" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <span key={i} className={i < score ? `on s${score}` : ''} />)}
      </div>
      <span className="klp-pwmeter-label">{label}</span>
    </div>
  );
}

function AuthShell({ children, onBack }: { children: React.ReactNode; onBack?: (() => void) | undefined }) {
  return (
    <div className="klp">
      <div className="klp-container klp-authwrap">
        <div className="klp-topbrand">
          <span className="mark">K</span>
          <span className="name">Kipkiren<small>WEB SERVICES</small></span>
          <div className="klp-topbrand-r">
            <KlpToggle />
            {onBack && <button type="button" className="klp-back exit" onClick={onBack}>‹ Back to sign in</button>}
          </div>
        </div>
        <div className="klp-auth-grid">
          <div className="panel" style={{ gridColumn: 'span 6 / span 6' }}>
            <div className="klp-card klp-authcard">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true); setError(null);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'rate_limited') setError('Too many attempts. Please try again in a few minutes.');
      else setError('Could not send the reset link. Check your connection and try again.');
    } finally { setSubmitting(false); }
  };

  return (
    <AuthShell onBack={onBack}>
      {sent ? (
        <>
          <div className="head">Check your email</div>
          <p className="klp-lead" style={{ marginTop: 12 }}>If an account exists for <strong>{email.trim()}</strong>, we've sent a link to reset your password. It expires shortly, so use it soon.</p>
          <button type="button" className="klp-btn primary full" style={{ marginTop: 20 }} onClick={onBack}>Back to sign in</button>
        </>
      ) : (
        <>
          <div className="head">Reset your password</div>
          <p className="klp-lead" style={{ marginTop: 8 }}>Enter your email and we'll send you a link to set a new password.</p>
          <form className="klp-form" onSubmit={onSubmit} style={{ marginTop: 16 }}>
            <div>
              <label className="klp-field-label" htmlFor="fp-email">Email</label>
              <input id="fp-email" className="klp-field-input" type="email" autoComplete="email" required
                placeholder="you@company.co.ke" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
            </div>
            {error && <div className="klp-auth-error">{error}</div>}
            <button type="submit" className="klp-btn primary full" disabled={submitting}>
              {submitting ? 'Sending...' : 'Send reset link →'}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------
export function SetPassword({ ctx, onDone }: { ctx: RecoveryContext; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strong = pw.length >= 8;
  const matches = pw === confirm;
  const valid = strong && matches;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true); setError(null);
    try {
      await setPassword(ctx.accessToken, pw);
      clearHash();
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'link_invalid') setError('This link has expired or was already used. Request a new reset link.');
      else if (err instanceof ApiError && err.code === 'invalid_input') setError('Please choose a stronger password (at least 8 characters).');
      else setError('Could not set your password just now. Please try again.');
    } finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <AuthShell>
        <div className="head">Password set</div>
        <p className="klp-lead" style={{ marginTop: 12 }}>Your password is ready. You can now sign in to your portal.</p>
        <button type="button" className="klp-btn primary full" style={{ marginTop: 20 }} onClick={onDone}>Go to sign in →</button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="head">{ctx.kind === 'invite' ? 'Set your password' : 'Choose a new password'}</div>
      <p className="klp-lead" style={{ marginTop: 8 }}>{ctx.kind === 'invite' ? 'Welcome to Kipkiren. Set a password to activate your account.' : 'Pick a new password for your account.'}</p>
      <form className="klp-form" onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <div>
          <label className="klp-field-label" htmlFor="sp-pw">New password</label>
          <div className="klp-passrow">
            <input id="sp-pw" className="klp-field-input" type={show ? 'text' : 'password'} autoComplete="new-password"
              required minLength={8} placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} disabled={submitting} />
            <button type="button" className="klp-passtoggle" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
          </div>
          <Strength pw={pw} />
        </div>
        <div>
          <label className="klp-field-label" htmlFor="sp-confirm">Confirm password</label>
          <input id="sp-confirm" className="klp-field-input" type={show ? 'text' : 'password'} autoComplete="new-password"
            required value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={submitting} />
          {confirm.length > 0 && !matches && <p className="klp-field-help" style={{ color: 'var(--amber-deep)' }}>Passwords don't match.</p>}
        </div>
        {error && <div className="klp-auth-error">{error}</div>}
        <button type="submit" className="klp-btn primary full" disabled={!valid || submitting}>
          {submitting ? 'Saving...' : 'Set password →'}
        </button>
      </form>
    </AuthShell>
  );
}
