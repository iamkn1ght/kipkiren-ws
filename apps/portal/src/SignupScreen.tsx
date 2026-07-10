/**
 * Public self-service client signup (KWS-S8-002).
 *
 * A prospect creates their own account: business + contact + email + password +
 * a plan they're interested in. On success the API returns a live session, so
 * `signUp` drops them straight into the client portal - no admin, no invite.
 * Final pricing is still confirmed on the proforma; the plan here is intent.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from './auth.tsx';
import { KlpToggle } from './klpTheme.tsx';
import { ApiError, getPublicPlans, type PublicPlan } from './api.ts';
import './landing.css';

const BENEFITS = [
  'Open and track custom tickets',
  'Approve AI-drafted proformas in one click',
  'See progress, invoices and history in one place',
  'Pay by M-Pesa or card, keep every receipt',
];

export function SignupScreen({ onBack, onSwitchToSignin }: { onBack: () => void; onSwitchToSignin: () => void }) {
  const { signUp } = useAuth();
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [planId, setPlanId] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getPublicPlans()
      .then((p) => { setPlans(p); if (p[0]) setPlanId((cur) => cur || p[0]!.id); })
      .catch(() => setPlans([]));
  }, []);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const valid = businessName.trim().length >= 2 && contactName.trim().length >= 2 && emailOk && password.length >= 8 && !!planId;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await signUp({
        business_name: businessName.trim(),
        contact_name: contactName.trim(),
        email: email.trim(),
        password,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        retainer_plan_id: planId,
      });
      // Success: the auth context now holds a session and the app routes to the portal.
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'client_email_exists' || err.code === 'email_exists')) {
        setError('An account with this email already exists. Try signing in instead.');
      } else if (err instanceof ApiError && err.code === 'rate_limited') {
        setError('Too many attempts from your network. Please try again later.');
      } else if (err instanceof ApiError && err.status === 400) {
        setError('Please check your details and try again.');
      } else {
        setError('Could not create your account. Check your connection and try again.');
      }
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
            <button type="button" className="klp-back exit" onClick={onBack}>‹ Back to site</button>
          </div>
        </div>

        <div className="klp-auth-grid">
          <div className="intro klp-auth-intro">
            <span className="klp-eyebrow teal">Client portal</span>
            <h1 className="klp-display-lg">Start with Kipkiren.</h1>
            <p className="klp-lead">Create your account and you're in. Tell us what you need, approve the proforma, and watch the work happen.</p>
            <div className="klp-auth-list">
              <p className="klp-mono">What you get</p>
              <ul>
                {BENEFITS.map((item) => (
                  <li key={item}><span className="m" />{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="panel">
            <div className="klp-card klp-authcard">
              <div className="head">Create your account</div>
              <form className="klp-form" onSubmit={onSubmit}>
                <div>
                  <label className="klp-field-label" htmlFor="su-biz">Business name</label>
                  <input id="su-biz" className="klp-field-input" required autoFocus
                    placeholder="Acme Ltd" value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={submitting} />
                </div>
                <div>
                  <label className="klp-field-label" htmlFor="su-contact">Your name</label>
                  <input id="su-contact" className="klp-field-input" required autoComplete="name"
                    placeholder="Mary Wanjiru" value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={submitting} />
                </div>
                <div>
                  <label className="klp-field-label" htmlFor="su-email">Email</label>
                  <input id="su-email" className="klp-field-input" type="email" autoComplete="email" required
                    placeholder="you@company.co.ke" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
                </div>
                <div>
                  <label className="klp-field-label" htmlFor="su-phone">Phone <span className="klp-field-opt">optional</span></label>
                  <input id="su-phone" className="klp-field-input" autoComplete="tel"
                    placeholder="+254712345678" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={submitting} />
                </div>
                <div>
                  <label className="klp-field-label" htmlFor="su-pass">Password</label>
                  <div className="klp-passrow">
                    <input id="su-pass" className="klp-field-input" type={showPass ? 'text' : 'password'} autoComplete="new-password"
                      required minLength={8} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} />
                    <button type="button" className="klp-passtoggle" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Hide password' : 'Show password'}>
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="klp-field-label" htmlFor="su-plan">Plan you're interested in</label>
                  <select id="su-plan" className="klp-field-input" value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={submitting || !plans}>
                    {!plans && <option>Loading plans...</option>}
                    {plans?.map((p) => <option key={p.id} value={p.id}>{p.name} · KES {p.monthly_fee_kes.toLocaleString()}/mo</option>)}
                  </select>
                  <p className="klp-field-help">You can change this later. Final pricing is confirmed on your proforma.</p>
                </div>
                {error && <div className="klp-auth-error">{error}</div>}
                <button type="submit" className="klp-btn primary full" disabled={!valid || submitting}>
                  {submitting ? 'Creating your account...' : 'Create account →'}
                </button>
              </form>
              <p className="klp-auth-terms">Already have an account? <button type="button" className="klp-auth-link" onClick={onSwitchToSignin}>Sign in</button></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
