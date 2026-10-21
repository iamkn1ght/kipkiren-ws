/**
 * Staff two-factor by emailed code. Every non-client role must enter a 6-digit
 * code, emailed to their account address, after the password. Clients are
 * unaffected.
 *
 * Nothing is stored: the code's keyed hash travels inside the signed step
 * token (lib/tokens.ts signMfaToken), so a stolen token is useless without the
 * email, and a guessed code is refused unless it hashes to the same value.
 * Each step token works once (used ids are remembered until they expire) and
 * failed codes are rate-limited per account (middleware/rate-limit.ts).
 *
 * Escape hatch: MFA_DISABLED=true on Railway lets staff in with the password
 * alone (audited). Use it only if email delivery is down, and remove it after.
 */

import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '../config/env.js';
import { MFA_TOKEN_TTL_SECONDS, signMfaToken, type MfaClaims } from '../lib/tokens.js';
import { sendEmail } from './email.js';
import type { UserRole } from '../middleware/auth.js';

export const roleNeedsMfa = (role: UserRole): boolean => role !== 'client';
export const mfaDisabled = (): boolean => process.env.MFA_DISABLED === 'true';

let codeKey: Buffer | null = null;
function key(): Buffer {
  // Derived from the JWT signing key, so it never needs its own variable and
  // rotates with it. Server-side only.
  if (!codeKey) codeKey = createHmac('sha256', loadEnv().jwtPrivateKey).update('kws-staff-login-code-v1').digest();
  return codeKey;
}

const codeHash = (userId: string, nonce: string, code: string) =>
  createHmac('sha256', key()).update(`${userId}.${nonce}.${code}`).digest('base64url');

/** "ad***@kipkiren.co.ke": enough to recognise the inbox, not to harvest it. */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`;
}

/**
 * Email a fresh code and return the step token that can check it.
 * Throws 'code_send_failed' when the email could not be sent (fail closed).
 */
export async function sendLoginCode(userId: string, email: string): Promise<{ mfa_token: string; sent_to: string }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const n = randomBytes(12).toString('base64url');
  const result = await sendEmail({
    to: email,
    template: 'login_code',
    variables: { code, minutes: String(Math.round(MFA_TOKEN_TTL_SECONDS / 60)) },
    entity_type: 'auth',
    entity_id: userId,
  });
  if (result.status !== 'sent') throw new Error('code_send_failed');
  return { mfa_token: signMfaToken(userId, { ch: codeHash(userId, n, code), n }), sent_to: maskEmail(email) };
}

// One-time use: a token that already produced a session cannot do it again.
const used = new Map<string, number>();
function markUsed(jti: string, exp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (const [k, e] of used) if (e < now) used.delete(k);
  if (used.has(jti)) return false;
  used.set(jti, exp);
  return true;
}

export function checkLoginCode(claims: MfaClaims, code: string): { ok: true } | { ok: false; reason: 'invalid_code' | 'code_used' } {
  const expected = Buffer.from(claims.ch);
  const actual = Buffer.from(codeHash(claims.sub, claims.n, code.replace(/\s+/g, '')));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: 'invalid_code' };
  if (!markUsed(claims.jti, claims.exp)) return { ok: false, reason: 'code_used' };
  return { ok: true };
}
