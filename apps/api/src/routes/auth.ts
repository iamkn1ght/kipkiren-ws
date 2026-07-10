import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../config/env.js';
import { getServiceClient } from '../lib/supabase.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../lib/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { loginRateLimit, signupRateLimit } from '../middleware/rate-limit.js';
import { HttpError } from '../middleware/error.js';
import { writeAuditEvent } from '../services/audit.js';
import {
  SelfSignupInput,
  runSelfSignup,
  supabaseStore,
  listRetainerPlans,
  OnboardError,
} from '../services/client-onboarding.js';
import { logger } from '../lib/logger.js';
import type { UserRole } from '../middleware/auth.js';

export const authRouter: Router = Router();

const REFRESH_COOKIE = 'kws_rt';

const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
});

interface UserProfile {
  id: string;
  role: UserRole;
  client_id: string | null;
}

async function loadProfile(userId: string): Promise<UserProfile> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('users')
    .select('id, role, client_id')
    .eq('id', userId)
    .single();
  if (error || !data) {
    throw new HttpError(401, 'profile_not_found');
  }
  return data as UserProfile;
}

function setRefreshCookie(res: Response, token: string, ttlSeconds: number): void {
  const env = loadEnv();
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,                              // KWS-SEC-008 - never readable from JS
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',                          // KWS-SEC-008 - CSRF defence
    path: '/v1/auth',
    maxAge: ttlSeconds * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
}

interface IssuedSession {
  access_token: string;
  expires_in: number;
  refresh_row_id: string;
}

async function issueSession(
  res: Response,
  profile: UserProfile,
  meta: { userAgent?: string; ip?: string; familyId?: string },
): Promise<IssuedSession> {
  const env = loadEnv();
  const sb = getServiceClient();

  const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();
  const familyId = meta.familyId ?? randomUUID();
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000);

  const { data: inserted, error: insertErr } = await sb
    .from('refresh_tokens')
    .insert({
      user_id: profile.id,
      family_id: familyId,
      token_hash: refreshHash,
      expires_at: expiresAt.toISOString(),
      user_agent: meta.userAgent ?? null,
      ip_addr: meta.ip ?? null,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    logger.error({ err: insertErr }, 'refresh_token_insert_failed');
    throw new HttpError(500, 'session_issue_failed');
  }

  const access = signAccessToken({
    sub: profile.id,
    role: profile.role,
    ...(profile.client_id ? { client_id: profile.client_id } : {}),
  });

  setRefreshCookie(res, refreshRaw, env.JWT_REFRESH_TTL_SECONDS);
  return {
    access_token: access,
    expires_in: env.JWT_ACCESS_TTL_SECONDS,
    refresh_row_id: inserted.id,
  };
}

function publicSession(s: IssuedSession): { access_token: string; expires_in: number } {
  return { access_token: s.access_token, expires_in: s.expires_in };
}

// ----------------------------------------------------------------------------
// POST /v1/auth/login
// ----------------------------------------------------------------------------
authRouter.post('/login', loginRateLimit, async (req: Request, res: Response) => {
  const parsed = LoginInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_credentials_shape' });
    return;
  }
  const { email, password } = parsed.data;

  const sb = getServiceClient();
  // Supabase Auth handles password hashing + verification (Argon2 by default).
  // We then discard its session and mint our own RS256 token.
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.user) {
    // Security trail: failed attempts are audited (rate-limited upstream) so
    // brute force is visible. Fire-and-forget - never delay the response.
    void writeAuditEvent({ actor_id: null, actor_role: null, event_type: 'auth_login_failed', entity_type: 'auth', entity_id: email, payload_snapshot: { email, ip: req.ip ?? null } });
    // Generic message - never reveal whether the email exists.
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  const profile = await loadProfile(data.user.id);
  const meta: { userAgent?: string; ip?: string } = {};
    if (req.header('user-agent')) meta.userAgent = req.header('user-agent') as string;
    if (req.ip) meta.ip = req.ip;
    const session = await issueSession(res, profile, meta);
  void writeAuditEvent({ actor_id: profile.id, actor_role: profile.role, event_type: 'auth_login_succeeded', entity_type: 'auth', entity_id: profile.id, payload_snapshot: { ip: req.ip ?? null } });
  res.json(publicSession(session));
});

// ----------------------------------------------------------------------------
// GET /v1/auth/plans - public retainer plans for the signup form (read-only).
// ----------------------------------------------------------------------------
authRouter.get('/plans', async (_req: Request, res: Response) => {
  try {
    const plans = await listRetainerPlans();
    res.json({ plans });
  } catch (err) {
    logger.error({ err }, 'public_plans_failed');
    res.status(502).json({ error: 'plans_unavailable' });
  }
});

// ----------------------------------------------------------------------------
// POST /v1/auth/signup - public self-service client signup (KWS-S8-002).
// Creates the client + auth user + profile transactionally, then issues our own
// session so the new client lands straight in the portal. role/status are fixed
// server-side (client/active); the request can never set them.
// ----------------------------------------------------------------------------
authRouter.post('/signup', signupRateLimit, async (req: Request, res: Response) => {
  const parsed = SelfSignupInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_signup', message: parsed.error.issues[0]?.message ?? 'Invalid details' });
    return;
  }

  let result;
  try {
    result = await runSelfSignup(parsed.data, supabaseStore());
  } catch (err) {
    if (err instanceof OnboardError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    throw err;
  }

  // Auto-login: load the profile we just created and mint our own session.
  const profile = await loadProfile(result.user_id);
  const meta: { userAgent?: string; ip?: string } = {};
  if (req.header('user-agent')) meta.userAgent = req.header('user-agent') as string;
  if (req.ip) meta.ip = req.ip;
  const session = await issueSession(res, profile, meta);
  void writeAuditEvent({ actor_id: profile.id, actor_role: profile.role, event_type: 'auth_login_succeeded', entity_type: 'auth', entity_id: profile.id, payload_snapshot: { ip: req.ip ?? null, via: 'signup' } });

  res.status(201).json({
    ...publicSession(session),
    client: { id: result.client.id, business_name: result.client.business_name },
    plan_name: result.plan_name,
  });
});

// ----------------------------------------------------------------------------
// POST /v1/auth/refresh - rotating refresh token, family invalidation on reuse
// ----------------------------------------------------------------------------
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw || typeof raw !== 'string') {
    res.status(401).json({ error: 'no_refresh_cookie' });
    return;
  }
  const hash = hashRefreshToken(raw);
  const sb = getServiceClient();

  const { data: row, error } = await sb
    .from('refresh_tokens')
    .select('id, user_id, family_id, expires_at, revoked_at, replaced_by')
    .eq('token_hash', hash)
    .maybeSingle();

  if (error || !row) {
    clearRefreshCookie(res);
    res.status(401).json({ error: 'invalid_refresh_token' });
    return;
  }

  // Reuse detection: if this token was already replaced or revoked,
  // someone is replaying an old token. Burn the entire family.
  if (row.revoked_at || row.replaced_by) {
    await sb
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('family_id', row.family_id)
      .is('revoked_at', null);
    clearRefreshCookie(res);
    logger.warn({ family_id: row.family_id, user_id: row.user_id }, 'refresh_replay_detected');
    res.status(401).json({ error: 'refresh_replay_detected' });
    return;
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    clearRefreshCookie(res);
    res.status(401).json({ error: 'refresh_expired' });
    return;
  }

  const profile = await loadProfile(row.user_id);
  const refreshMeta: { userAgent?: string; ip?: string; familyId?: string } = {};
    if (req.header('user-agent')) refreshMeta.userAgent = req.header('user-agent') as string;
    if (req.ip) refreshMeta.ip = req.ip;
    if (row.family_id) refreshMeta.familyId = row.family_id;
    const next = await issueSession(res, profile, refreshMeta);

  // Mark the old token as replaced. Done AFTER issuing the new one so a
  // failure mid-issue doesn't lock the user out.
  await sb
    .from('refresh_tokens')
    .update({ revoked_at: new Date().toISOString(), replaced_by: next.refresh_row_id })
    .eq('id', row.id);

  res.json(publicSession(next));
});

// ----------------------------------------------------------------------------
// POST /v1/auth/logout - revoke entire family
// ----------------------------------------------------------------------------
authRouter.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  const sb = getServiceClient();
  if (raw && typeof raw === 'string') {
    const hash = hashRefreshToken(raw);
    const { data: row } = await sb
      .from('refresh_tokens')
      .select('family_id')
      .eq('token_hash', hash)
      .maybeSingle();
    if (row?.family_id) {
      await sb
        .from('refresh_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('family_id', row.family_id)
        .is('revoked_at', null);
    }
  }
  clearRefreshCookie(res);
  res.status(204).end();
});
