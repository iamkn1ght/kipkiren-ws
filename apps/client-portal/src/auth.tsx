/**
 * Auth context for the client portal.
 *
 * Session model:
 *   - Access token lives in memory (and a mirror in sessionStorage so a page
 *     reload doesn't force a re-login). The refresh cookie is httpOnly and
 *     handles longer-lived persistence across tabs and browser restarts.
 *   - On mount we try a silent refresh. If the cookie is still valid we
 *     rehydrate a session without the user ever seeing the login form.
 *   - All /v1 calls go through api.ts — that module reads accessToken and
 *     handles 401 → refresh → retry. We register an `onUnauthorized`
 *     callback here so a hard 401 lands the user back on the login screen.
 *
 * Role gate: the client portal is for client users only. If an admin or
 * delivery lead logs in here we refuse them with a visible message.
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

const STORAGE_KEY = 'kws_client_access_token';

export interface Session {
  accessToken: string;
  claims: AccessTokenClaims;
  email: string;
}

interface AuthContextValue {
  session: Session | null;
  bootstrapping: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage may be disabled (private mode); session survives in memory only
  }
}

function buildSession(token: string, email: string): Session | null {
  const claims = decodeAccessToken(token);
  if (!claims) return null;
  return { accessToken: token, claims, email };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const emailRef = useRef<string>('');

  const applySession = useCallback((token: string, email: string) => {
    const s = buildSession(token, email);
    if (!s) return false;
    emailRef.current = email;
    setAccessToken(token);
    writeStoredToken(token);
    setSession(s);
    return true;
  }, []);

  const clearSession = useCallback(() => {
    emailRef.current = '';
    setAccessToken(null);
    writeStoredToken(null);
    setSession(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Bootstrap: try the stored token first, fall back to a silent refresh.
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const stored = readStoredToken();
      if (stored) {
        const claims = decodeAccessToken(stored);
        const notExpired = claims && claims.exp * 1000 > Date.now() + 30_000;
        if (notExpired) {
          setAccessToken(stored);
          if (!cancelled) {
            setSession({ accessToken: stored, claims: claims!, email: '' });
          }
        }
      }
      const refreshed = await refreshSession();
      if (cancelled) return;
      if (refreshed) {
        const claims = decodeAccessToken(refreshed);
        if (claims) {
          writeStoredToken(refreshed);
          setSession({ accessToken: refreshed, claims, email: emailRef.current });
        }
      } else if (!stored) {
        clearSession();
      }
      setBootstrapping(false);
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    const ok = applySession(res.access_token, email);
    if (!ok) throw new Error('invalid_session_token');
  }, [applySession]);

  const signOut = useCallback(async () => {
    await apiLogout();
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    bootstrapping,
    signIn,
    signOut,
  }), [session, bootstrapping, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function isClientRole(role: string): boolean {
  return role === 'client';
}

/**
 * Thin hook for tab code: returns a stable `call` function that hits the API
 * with auth already wired.
 */
export function useApi() {
  return useCallback(<T,>(path: string, opts?: Parameters<typeof apiRequest>[1]) => {
    return apiRequest<T>(path, opts);
  }, []);
}
