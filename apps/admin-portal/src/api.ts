/**
 * Admin-portal API client.
 *
 * Single fetch wrapper used by every tab. Concerns:
 *   - adds `Authorization: Bearer <access_token>` on every /v1 call
 *   - sends `credentials: 'include'` so the httpOnly refresh cookie
 *     scoped to /v1/auth rides along automatically on /v1/auth/refresh
 *   - on 401, tries ONE silent refresh via POST /v1/auth/refresh; if that
 *     succeeds, the original request is retried with the new access token.
 *     If refresh fails, the session is cleared and the caller sees an
 *     ApiError(401) so the app can fall back to the login screen.
 *
 * Access token is kept in module state (not re-read from storage on every
 * call). auth.tsx bootstraps it on mount and updates it on login/refresh.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

interface RefreshResponse {
  access_token: string;
  expires_in: number;
}

async function rawRefresh(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return null;
  const body = (await res.json()) as RefreshResponse;
  return body.access_token ?? null;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const doFetch = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const init: RequestInit = {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'include',
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    if (opts.signal) init.signal = opts.signal;
    return fetch(`${API_BASE}${path}`, init);
  };

  let res = await doFetch(accessToken);

  if (res.status === 401 && !path.startsWith('/v1/auth/')) {
    const refreshed = await rawRefresh();
    if (refreshed) {
      accessToken = refreshed;
      res = await doFetch(refreshed);
    } else {
      accessToken = null;
      if (onUnauthorized) onUnauthorized();
      throw new ApiError(401, 'unauthenticated');
    }
  }

  if (!res.ok) {
    let code = 'request_failed';
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) code = body.error;
    } catch {
      // non-JSON error
    }
    throw new ApiError(res.status, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface LoginResponse {
  access_token: string;
  expires_in: number;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function refreshSession(): Promise<string | null> {
  const token = await rawRefresh();
  if (token) accessToken = token;
  return token;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/v1/auth/logout', { method: 'POST' });
  } catch {
    // logout is best-effort client-side; ignore network errors
  }
  accessToken = null;
}

/**
 * Decode a JWT payload without verifying the signature. Safe for
 * non-security use only (display role + expiry). The API re-verifies
 * the token on every request.
 */
export interface AccessTokenClaims {
  sub: string;
  role: string;
  client_id?: string;
  exp: number;
  iat: number;
}

export function decodeAccessToken(token: string): AccessTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded) as AccessTokenClaims;
  } catch {
    return null;
  }
}
