import { createHash, randomBytes, createPublicKey, type JsonWebKey } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { loadEnv } from '../config/env.js';
import type { UserRole } from '../middleware/auth.js';

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
  client_id?: string;
}

/**
 * Mint an RS256 access token. KWS-SEC-001 — HS256 is not an option here.
 * The header `kid` lets verifiers pick the right key from JWKS during rotation.
 */
export function signAccessToken(claims: AccessTokenClaims): string {
  const env = loadEnv();
  const opts: SignOptions = {
    algorithm: 'RS256',
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    keyid: currentKid(),
  };
  return jwt.sign(
    {
      role: claims.role,
      ...(claims.client_id ? { client_id: claims.client_id } : {}),
    },
    env.jwtPrivateKey,
    { ...opts, subject: claims.sub },
  );
}

/**
 * Generate an opaque refresh token + its SHA-256 hash. We never store the
 * raw token — only the hash lives in `refresh_tokens`. Stolen DB rows can't
 * be replayed.
 */
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(48).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Stable kid derived from the public key. When you rotate the keypair the
 * kid changes automatically and old tokens stop verifying once the old key
 * leaves the JWKS. The 7-day overlap is achieved by serving both keys from
 * JWKS during the rotation window.
 */
let cachedKid: string | null = null;
export function currentKid(): string {
  if (cachedKid) return cachedKid;
  const env = loadEnv();
  const pub = createPublicKey(env.jwtPublicKey);
  const jwk = pub.export({ format: 'jwk' });
  const canonical = JSON.stringify({ kty: jwk.kty, n: jwk.n, e: jwk.e });
  cachedKid = createHash('sha256').update(canonical).digest('base64url').slice(0, 16);
  return cachedKid;
}

export function publicJwk(): JsonWebKey & { kid: string; use: string; alg: string } {
  const env = loadEnv();
  const pub = createPublicKey(env.jwtPublicKey);
  const jwk = pub.export({ format: 'jwk' });
  return { ...jwk, kid: currentKid(), use: 'sig', alg: 'RS256' };
}
