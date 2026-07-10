import { useState, type FormEvent } from 'react';
import { useAuth, type PortalRole } from './auth.tsx';
import { KlpToggle } from './klpTheme.tsx';
import { ApiError } from './api.ts';
import './landing.css';

const INTRO: Record<PortalRole, { eyebrow: string; hint: string; list: string[] }> = {
  client: {
    eyebrow: 'Client portal',
    hint: 'Sign in to view your tickets, proformas and current work.',
    list: [
      'Open and track custom tickets',
      'Approve proformas with one click',
      'Full history of every conversation and quote',
      'A direct line to your project team',
    ],
  },
  admin: {
    eyebrow: 'Delivery console',
    hint: 'Sign in to manage the queue, proformas, clients and capacity.',
    list: [
      'Triage the live ticket queue by SLA',
      'Review and dispatch AI-drafted proformas',
      'Watch client health, capacity and the rails',
      'Raise a ticket on a client\'s behalf',
    ],
  },
  technical_delivery: {
    eyebrow: 'Task view',
    hint: 'Sign in to see the tasks assigned to you.',
    list: [
      'Your assigned tasks, in order of SLA',
      'Start and complete work in one place',
      'Only what you need, no client or billing data',
      'A clean, focused surface',
    ],
  },
};

export function LoginScreen({ role, onBack, onCreateAccount }: { role: PortalRole; onBack: () => void; onCreateAccount?: (() => void) | undefined }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const intro = INTRO[role];

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError('Invalid email or password.');
      else if (err instanceof ApiError) setError(`Sign-in failed · ${err.code}`);
      else setError('Sign-in failed. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="klp">
      <div className="klp-container klp-authwrap">
        <div className="klp-topbrand">
          <span className="mark">K</span>
          <span className="name">Kipkiren<small>WEB SERVICES</small></span>
          <div className="klp-topbrand-r">
            <KlpToggle />
            <button type="button" className="klp-back exit" onClick={onBack}>‹ Change role</button>
          </div>
        </div>

        <div className="klp-auth-grid">
          <div className="intro klp-auth-intro">
            <span className="klp-eyebrow teal">{intro.eyebrow}</span>
            <h1 className="klp-display-lg">Welcome back.</h1>
            <p className="klp-lead">{intro.hint}</p>
            <div className="klp-auth-list">
              <p className="klp-mono">Inside your portal</p>
              <ul>
                {intro.list.map((item) => (
                  <li key={item}><span className="m" />{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="panel">
            <div className="klp-card klp-authcard">
              <div className="head">Sign in</div>
              <form className="klp-form" onSubmit={onSubmit}>
                <div>
                  <label className="klp-field-label" htmlFor="au-email">Email</label>
                  <input id="au-email" className="klp-field-input" type="email" autoComplete="email" required
                    placeholder="you@company.co.ke" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
                </div>
                <div>
                  <label className="klp-field-label" htmlFor="au-pass">Password</label>
                  <div className="klp-passrow">
                    <input id="au-pass" className="klp-field-input" type={showPass ? 'text' : 'password'} autoComplete="current-password"
                      required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} />
                    <button type="button" className="klp-passtoggle" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Hide password' : 'Show password'}>
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                {error && <div className="klp-auth-error">{error}</div>}
                <button type="submit" className="klp-btn primary full" disabled={submitting}>
                  {submitting ? 'Signing in...' : 'Sign in →'}
                </button>
              </form>
              {onCreateAccount
                ? <p className="klp-auth-terms">New to Kipkiren? <button type="button" className="klp-auth-link" onClick={onCreateAccount}>Create an account</button></p>
                : <p className="klp-auth-terms">Team accounts are provisioned by an admin. Need access? <a href="mailto:studio@kipkiren.co.ke">Talk to the studio.</a></p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
