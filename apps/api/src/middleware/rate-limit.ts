import rateLimit from 'express-rate-limit';

/**
 * KWS-SEC-010 limits.
 *
 * `keyGenerator` falls back to req.ip - Express trust-proxy must be set so
 * Cloudflare's X-Forwarded-For populates ip correctly.
 */

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', endpoint: 'auth_login' },
});

// Public self-service signup (KWS-S8-002). Unauthenticated + creates an auth
// user AND a client row per call, so it is a prime abuse target. Firm per-IP cap
// (kept above single-user reality so a shared office/NAT is not locked out).
export const signupRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'anon',
  message: { error: 'rate_limited', endpoint: 'auth_signup' },
});

export const ticketRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Per-client when authenticated; per-IP otherwise.
  keyGenerator: (req) => req.auth?.clientId ?? req.ip ?? 'anon',
  message: { error: 'rate_limited', endpoint: 'tickets_create' },
});

// Client provisioning (onboard / invite / reset). Per-admin, generous enough
// for real onboarding sessions but a firm cap against runaway loops or abuse of
// the Auth admin API + outbound invite emails.
export const provisioningRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.sub ?? req.ip ?? 'anon',
  message: { error: 'rate_limited', endpoint: 'client_provisioning' },
});

export const proformaApproveRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.params.id ?? 'unknown'}:${req.auth?.clientId ?? req.ip}`,
  message: { error: 'rate_limited', endpoint: 'proforma_approve' },
});
