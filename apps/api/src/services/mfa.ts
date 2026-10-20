/**
 * Staff two-factor (authenticator app). Every non-client role must pass a
 * 6-digit code after the password; clients are unaffected.
 *
 * Lifecycle per staff user (table public.staff_mfa, migration 0010):
 *   no row          -> first sign-in: setup (secret + QR), confirm one code
 *   enabled_at null -> setup started, not confirmed: setup again
 *   enabled_at set  -> every sign-in asks for a code
 *
 * Fail-safe: if migration 0010 is not applied yet, sign-in still works without
 * a code (and is audited) so nobody is locked out mid-deploy. Once the table
 * exists, two-factor is enforced.
 */

import { getServiceClient } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../lib/totp.js';
import type { UserRole } from '../middleware/auth.js';

export const roleNeedsMfa = (role: UserRole): boolean => role !== 'client';

const tableMissing = (err: { code?: string; message?: string } | null) =>
  !!err && (err.code === '42P01' || err.code === 'PGRST205' || /staff_mfa/.test(err.message ?? '') && /exist|schema cache/.test(err.message ?? ''));

export type MfaState = 'unavailable' | 'needs_setup' | 'enabled';

export async function mfaState(userId: string): Promise<MfaState> {
  const { data, error } = await getServiceClient().from('staff_mfa').select('enabled_at').eq('user_id', userId).maybeSingle();
  if (error) {
    if (tableMissing(error)) return 'unavailable';
    logger.error({ err: error }, 'mfa_state_failed');
    throw new Error('mfa_state_failed');
  }
  return data?.enabled_at ? 'enabled' : 'needs_setup';
}

/** Start (or restart) setup: a fresh secret, unconfirmed. Refused once enabled. */
export async function startMfaSetup(userId: string, email: string): Promise<{ secret: string; otpauth_url: string } | 'already_enabled'> {
  const sb = getServiceClient();
  const { data: existing } = await sb.from('staff_mfa').select('enabled_at').eq('user_id', userId).maybeSingle();
  if (existing?.enabled_at) return 'already_enabled';
  const secret = generateTotpSecret();
  const { error } = await sb.from('staff_mfa').upsert({ user_id: userId, totp_secret: secret, enabled_at: null, last_used_step: null }, { onConflict: 'user_id' });
  if (error) { logger.error({ err: error }, 'mfa_setup_failed'); throw new Error('mfa_setup_failed'); }
  return { secret, otpauth_url: otpauthUrl(secret, email) };
}

/**
 * Check a code. On success records the step (no replay) and, the first time,
 * marks two-factor enabled. Returns whether this call completed setup.
 */
export async function checkMfaCode(userId: string, code: string, nowMs = Date.now()): Promise<{ ok: true; justEnabled: boolean } | { ok: false; reason: 'no_setup' | 'invalid_code' }> {
  const sb = getServiceClient();
  const { data: row } = await sb.from('staff_mfa').select('totp_secret, enabled_at, last_used_step').eq('user_id', userId).maybeSingle();
  if (!row) return { ok: false, reason: 'no_setup' };
  const res = verifyTotp(row.totp_secret as string, code, { nowMs, afterStep: (row.last_used_step as number | null) ?? null });
  if (!res.ok) return { ok: false, reason: 'invalid_code' };
  const justEnabled = !row.enabled_at;
  const patch: Record<string, unknown> = { last_used_step: res.step };
  if (justEnabled) patch.enabled_at = new Date(nowMs).toISOString();
  const { error } = await sb.from('staff_mfa').update(patch).eq('user_id', userId);
  if (error) { logger.error({ err: error }, 'mfa_record_failed'); throw new Error('mfa_record_failed'); }
  return { ok: true, justEnabled };
}
