import { useState, type FormEvent } from 'react';
import { useAuth } from './auth.tsx';
import { ApiError } from './api.ts';

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Invalid email or password.');
      } else if (err instanceof ApiError) {
        setError(`Sign-in failed · ${err.code}`);
      } else {
        setError('Sign-in failed. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="lg-wrap">
      <form className="lg-card" onSubmit={onSubmit}>
        <div className="lg-brand">
          <div className="lg-mark">KIPKIREN · WS</div>
          <div className="lg-sub">CLIENT PORTAL</div>
        </div>

        <h1 className="lg-title">Sign in</h1>
        <p className="lg-hint">Access your services, tickets, and invoices.</p>

        <label className="lg-label">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            className="lg-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="lg-label">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            className="lg-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
        </label>

        {error && <div className="lg-error">{error}</div>}

        <button type="submit" className="lg-submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="lg-foot">ws.kipkiren.co.ke · client portal</div>
      </form>
    </div>
  );
}
