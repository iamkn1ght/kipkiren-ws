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

export const ticketRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Per-client when authenticated; per-IP otherwise.
  keyGenerator: (req) => req.auth?.clientId ?? req.ip ?? 'anon',
  message: { error: 'rate_limited', endpoint: 'tickets_create' },
});

export const proformaApproveRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.params.id ?? 'unknown'}:${req.auth?.clientId ?? req.ip}`,
  message: { error: 'rate_limited', endpoint: 'proforma_approve' },
});
