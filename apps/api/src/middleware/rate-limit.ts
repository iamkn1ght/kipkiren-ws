import rateLimit from 'express-rate-limit';
import { clientIp } from '../lib/client-ip.js';

/**
 * KWS-SEC-010 limits. Every per-IP key uses clientIp(), which reads the real
 * visitor behind Cloudflare's proxy (see lib/client-ip.ts).
 */

// Password login: 3 FAILED attempts per 10 minutes per visitor. Successful
// logins do not count, so a real user is never locked out by signing in.
export const loginRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  message: { error: 'rate_limited', endpoint: 'auth_login' },
});

// Two-factor code checks: 5 failed codes per 10 minutes per visitor (typos
// happen; 5 guesses of a 6-digit code is a 1 in 200,000 chance).
export const mfaRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  message: { error: 'rate_limited', endpoint: 'auth_mfa' },
});

// Whole-API ceiling per visitor: 300 requests a minute. A busy console page
// makes about a dozen calls, so real users never get near it; a flood script
// from one address is cut off within the first minute.
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  message: { error: 'rate_limited', endpoint: 'api' },
});

// Public self-service signup (KWS-S8-002). Unauthenticated + creates an auth
// user AND a client row per call, so it is a prime abuse target. Firm per-IP cap
// (kept above single-user reality so a shared office/NAT is not locked out).
export const signupRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  message: { error: 'rate_limited', endpoint: 'auth_signup' },
});

// Public forgot-password + set-password. Per-IP, strict - these hit Supabase
// Auth (recovery email + password update) and must resist enumeration/abuse.
export const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  message: { error: 'rate_limited', endpoint: 'auth_password_reset' },
});

export const ticketRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Per-client when authenticated; per-IP otherwise.
  keyGenerator: (req) => req.auth?.clientId ?? clientIp(req),
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
  keyGenerator: (req) => req.auth?.sub ?? clientIp(req),
  message: { error: 'rate_limited', endpoint: 'client_provisioning' },
});

export const proformaApproveRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.params.id ?? 'unknown'}:${req.auth?.clientId ?? clientIp(req)}`,
  message: { error: 'rate_limited', endpoint: 'proforma_approve' },
});
