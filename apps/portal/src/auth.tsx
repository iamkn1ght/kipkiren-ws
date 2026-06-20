/**
 * Unified auth + role routing for the single KWS portal.
 *
 * Flow: pick a role (RolePicker) → shared login → land in that portal.
 *   - `picked` is the portal the user chose on the landing screen.
 *   - Real auth: the JWT's role is authoritative (a client can't become admin);
 *     `picked` only themes the login and chooses where to head.
 *   - Dev bypass (VITE_DEV_AUTH_BYPASS=1): picking a role synthesises a session
 *     for it and skips login — for working on the UI. The API still enforces
 *     auth, so a synthetic session only renders the shell (data calls 401).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  apiRequest,
  decodeAccessToken,
  login as apiLogin,
  logout as apiLogout,
  refreshSession,
  setAccessToken,
  setUnauthorizedHandler,
  type AccessTokenClaims,
} from './api.ts';

const STORAGE_KEY = 'kws_portal_access_token';
const PICKED_KEY = 'kws_portal_picked_role';

const DEV_AUTH_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1';

// The three choices on the landing picker.
export type PortalRole = 'client' | 'admin' | 'technical_delivery';

export interface Session {
  accessToken: string;
  claims: AccessTokenClaims;
  email: string;
}

interface AuthContextValue {
  session: Session | null;
  picked: PortalRole | null;
  bootstrapping: boolean;
  pickRole: (role: PortalRole) => void;
  signIn: (email: string, password: string) => Promise<void>;
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
    setSession({ accessToken: token, claims, email });
    return true;
  }, []);

  // Clear the session (and stored token) but keep `picked` — used on a hard
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

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    if (!applyRealSession(res.access_token, email)) throw new Error('invalid_session_token');
  }, [applyRealSession]);

  const signOut = useCallback(async () => {
    if (!DEV_AUTH_BYPASS) await apiLogout();
    clearSessionOnly();
    setPicked(null);
    writeStored(PICKED_KEY, null);
  }, [clearSessionOnly]);

  const value = useMemo<AuthContextValue>(() => ({
    session, picked, bootstrapping, pickRole, signIn, signOut,
  }), [session, picked, bootstrapping, pickRole, signIn, signOut]);

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
