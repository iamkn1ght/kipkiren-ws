/**
 * Unified auth + role routing for the single KWS portal.
 *
 * Flow: pick a role (RolePicker) → shared login → land in that portal.
 *   - `picked` is the portal the user chose on the landing screen.
 *   - Real auth: the JWT's role is authoritative (a client can't become admin);
 *     `picked` only themes the login and chooses where to head.
 *   - Dev bypass (VITE_DEV_AUTH_BYPASS=1): picking a role synthesises a session
 *     for it and skips login - for working on the UI. The API still enforces
 *     auth, so a synthetic session only renders the shell (data calls 401).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  apiRequest,
  decodeAccessToken,
  login as apiLogin,
  mfaVerify as apiMfaVerify,
  logout as apiLogout,
  signup as apiSignup,
  refreshSession,
  setAccessToken,
  setUnauthorizedHandler,
  type AccessTokenClaims,
  type SignupPayload,
} from './api.ts';

const STORAGE_KEY = 'kws_portal_access_token';
const PICKED_KEY = 'kws_portal_picked_role';
// Non-secret marker that this browser has signed in before, so anonymous
// visitors skip the session refresh (which can only 401 without a cookie).
const HAD_SESSION_KEY = 'kws_had_session';

function readHint(): boolean {
  try { return localStorage.getItem(HAD_SESSION_KEY) === '1'; } catch { return true; }
}
function writeHint(on: boolean): void {
  try { if (on) localStorage.setItem(HAD_SESSION_KEY, '1'); else localStorage.removeItem(HAD_SESSION_KEY); } catch { /* private mode */ }
}

const DEV_AUTH_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1';

// The three choices on the landing picker.
export type PortalRole = 'client' | 'admin' | 'technical_delivery';

export interface Session {
  accessToken: string;
  claims: AccessTokenClaims;
  email: string;
}

export interface MfaChallenge { token: string; sentTo: string; email: string }

interface AuthContextValue {
  session: Session | null;
  picked: PortalRole | null;
  bootstrapping: boolean;
  pickRole: (role: PortalRole) => void;
  /** Resolves null when signed in, or a two-factor challenge for staff. */
  signIn: (email: string, password: string) => Promise<MfaChallenge | null>;
  completeMfa: (challenge: MfaChallenge, code: string) => Promise<void>;
  signUp: (payload: SignupPayload) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStored(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function writeStored(key: string, val: string | null): void {
  try { if (val) sessionStorage.setItem(key, val); else sessionStorage.removeItem(key); } catch { /* private mode */ }
}

function syntheticSession(role: PortalRole): Session {
  const now = Math.floor(Date.now() / 1000);
  return {
    accessToken: 'dev-bypass',
    email: 'dev@local',
    claims: {
      sub: `dev-${role}`,
      role,
      ...(role === 'client' ? { client_id: 'dev-client-id' } : {}),
      exp: now + 86_400,
      iat: now,
    },
  };
}

/** True when this tab holds a stored access token (a likely signed-in user). */
export function hasStoredSession(): boolean {
  return readStored(STORAGE_KEY) !== null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [picked, setPicked] = useState<PortalRole | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const emailRef = useRef<string>('');

  const applyRealSession = useCallback((token: string, email: string) => {
    const claims = decodeAccessToken(token);
    if (!claims) return false;
    emailRef.current = email;
    setAccessToken(token);
    writeStored(STORAGE_KEY, token);
    writeHint(true);
    setSession({ accessToken: token, claims, email });
    return true;
  }, []);

  // Clear the session (and stored token) but keep `picked` - used on a hard
  // 401 in real mode so the user re-logs into the same portal.
  const clearSessionOnly = useCallback(() => {
    emailRef.current = '';
    setAccessToken(null);
    writeStored(STORAGE_KEY, null);
    setSession(null);
  }, []);

  const signInAs = useCallback((role: PortalRole) => {
    setAccessToken('dev-bypass');
    setSession(syntheticSession(role));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (DEV_AUTH_BYPASS) return; // keep synthetic session despite API 401s
      clearSessionOnly();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSessionOnly]);

  // Bootstrap: restore picked role, then (bypass) synthesize or (real) rehydrate.
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      if (DEV_AUTH_BYPASS) {
        // Clean start in dev so the public landing is the entry point;
        // a role is chosen fresh each session via the picker.
        setBootstrapping(false);
        return;
      }

      const storedPick = readStored(PICKED_KEY) as PortalRole | null;
      if (storedPick) setPicked(storedPick);

      const stored = readStored(STORAGE_KEY);
      if (stored) {
        const claims = decodeAccessToken(stored);
        if (claims && claims.exp * 1000 > Date.now() + 30_000) {
          setAccessToken(stored);
          if (!cancelled) setSession({ accessToken: stored, claims, email: '' });
        }
      }
      if (!stored && !readHint()) { setBootstrapping(false); return; }
      const refreshed = await refreshSession();
      if (cancelled) return;
      if (refreshed) {
        const claims = decodeAccessToken(refreshed);
        if (claims) {
          writeStored(STORAGE_KEY, refreshed);
          setSession({ accessToken: refreshed, claims, email: emailRef.current });
        }
      } else if (!stored) {
        clearSessionOnly();
      }
      setBootstrapping(false);
    };
    void boot();
    return () => { cancelled = true; };
  }, [clearSessionOnly, signInAs]);

  const pickRole = useCallback((role: PortalRole) => {
    setPicked(role);
    writeStored(PICKED_KEY, role);
    if (DEV_AUTH_BYPASS) signInAs(role);
  }, [signInAs]);

  const signIn = useCallback(async (email: string, password: string): Promise<MfaChallenge | null> => {
    const res = await apiLogin(email, password);
    if (res.mfa_required && res.mfa_token) return { token: res.mfa_token, sentTo: res.sent_to ?? 'your email', email };
    if (!res.access_token || !applyRealSession(res.access_token, email)) throw new Error('invalid_session_token');
    return null;
  }, [applyRealSession]);

  const completeMfa = useCallback(async (challenge: MfaChallenge, code: string) => {
    const res = await apiMfaVerify(challenge.token, code);
    if (!applyRealSession(res.access_token, challenge.email)) throw new Error('invalid_session_token');
  }, [applyRealSession]);

  // Self-service signup - the API creates the client + auth user + profile and
  // returns a live session, so we apply it exactly like a login (straight in).
  const signUp = useCallback(async (payload: SignupPayload) => {
    if (DEV_AUTH_BYPASS) { signInAs('client'); return; }
    const res = await apiSignup(payload);
    if (!applyRealSession(res.access_token, payload.email)) throw new Error('invalid_session_token');
    // Record acceptance of the Terms + Privacy Policy shown on the signup form
    // (KDPA). Best-effort: the account exists either way.
    void apiRequest('/v1/onboarding/consent', { method: 'POST' }).catch(() => {});
  }, [applyRealSession, signInAs]);

  const signOut = useCallback(async () => {
    if (!DEV_AUTH_BYPASS) await apiLogout();
    clearSessionOnly();
    writeHint(false);
    setPicked(null);
    writeStored(PICKED_KEY, null);
  }, [clearSessionOnly]);

  const value = useMemo<AuthContextValue>(() => ({
    session, picked, bootstrapping, pickRole, signIn, completeMfa, signUp, signOut,
  }), [session, picked, bootstrapping, pickRole, signIn, completeMfa, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Map any role claim to the portal that should render. */
export function portalForRole(role: string): PortalRole {
  if (role === 'admin' || role === 'delivery_lead') return 'admin';
  if (role === 'technical_delivery') return 'technical_delivery';
  return 'client';
}

export function useApi() {
  return useCallback(<T,>(path: string, opts?: Parameters<typeof apiRequest>[1]) => {
    return apiRequest<T>(path, opts);
  }, []);
}
