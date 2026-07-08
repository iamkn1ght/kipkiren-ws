/**
 * Autonomous SSL renewal (KWS-S9-005) - pure-function tests.
 *
 * Covers the two safety-critical decision layers:
 *   - planSslRenewal: when to attempt a renewal vs skip vs escalate, given the
 *     certificate state, the renewal policy, and prior attempts.
 *   - resolveExecution: how a "renew" plan composes with the S9-004 guard -
 *     execute only when the guard allows, otherwise escalate to a human.
 *
 * The live executor is never touched here (it is unwired by design); these tests
 * pin the logic that decides whether it would ever be reached.
 */

import { describe, expect, it } from 'vitest';
import {
  planSslRenewal,
  resolveExecution,
  DEFAULT_RENEWAL_POLICY,
  type SslRenewalContext,
} from '../src/services/ssl-renewal.js';
import type { GuardResult } from '../src/services/agent-execution.js';

const base: SslRenewalContext = {
  sslState: 'expiring',
  daysUntilExpiry: 10,
  attemptsSoFar: 0,
  hoursSinceLastAttempt: null,
  managedByPlatform: true,
};

describe('planSslRenewal', () => {
  it('renews a certificate inside the renewal window', () => {
    expect(planSslRenewal(base)).toEqual({ action: 'renew', reason: 'within_renewal_window' });
  });

  it('renews an already-expired certificate immediately', () => {
    expect(planSslRenewal({ ...base, sslState: 'expired', daysUntilExpiry: -2 })).toEqual({
      action: 'renew',
      reason: 'expired_renew_now',
    });
  });

  it('skips when the expiry is not yet known (not probed)', () => {
    expect(planSslRenewal({ ...base, sslState: 'unknown', daysUntilExpiry: null })).toEqual({
      action: 'skip',
      reason: 'state_unknown',
    });
  });

  it('skips a healthy certificate well outside the window', () => {
    expect(planSslRenewal({ ...base, sslState: 'valid', daysUntilExpiry: 90 })).toEqual({
      action: 'skip',
      reason: 'not_due',
    });
  });

  it('renews exactly at the window boundary (inclusive)', () => {
    expect(
      planSslRenewal({ ...base, sslState: 'valid', daysUntilExpiry: DEFAULT_RENEWAL_POLICY.renewWithinDays }),
    ).toEqual({ action: 'renew', reason: 'within_renewal_window' });
  });

  it('escalates a due certificate we do not manage', () => {
    expect(planSslRenewal({ ...base, managedByPlatform: false })).toEqual({
      action: 'escalate',
      reason: 'not_platform_managed',
    });
  });

  it('escalates once the attempt budget is exhausted', () => {
    expect(
      planSslRenewal({ ...base, attemptsSoFar: DEFAULT_RENEWAL_POLICY.maxAttempts }),
    ).toEqual({ action: 'escalate', reason: 'max_attempts_exhausted' });
  });

  it('skips while inside the cooldown window', () => {
    expect(planSslRenewal({ ...base, attemptsSoFar: 1, hoursSinceLastAttempt: 2 })).toEqual({
      action: 'skip',
      reason: 'in_cooldown',
    });
  });

  it('renews again once cooldown has elapsed', () => {
    expect(planSslRenewal({ ...base, attemptsSoFar: 1, hoursSinceLastAttempt: 24 })).toEqual({
      action: 'renew',
      reason: 'within_renewal_window',
    });
  });

  it('checks not-due before management (a not-due unmanaged cert just skips)', () => {
    expect(
      planSslRenewal({ ...base, sslState: 'valid', daysUntilExpiry: 90, managedByPlatform: false }),
    ).toEqual({ action: 'skip', reason: 'not_due' });
  });

  it('honours a custom policy (tighter window, longer cooldown)', () => {
    const policy = { renewWithinDays: 7, cooldownHours: 48, maxAttempts: 5 };
    // 10 days out is inside the default 21 but outside the custom 7 - not due.
    expect(planSslRenewal({ ...base, daysUntilExpiry: 10 }, policy)).toEqual({
      action: 'skip',
      reason: 'not_due',
    });
  });
});

describe('resolveExecution (S9-005 plan composed with the S9-004 guard)', () => {
  const allow: GuardResult = { allowed: true };
  const deny: GuardResult = { allowed: false, reason: 'no_approved_proforma' };

  it('executes when the plan renews and the guard allows', () => {
    expect(resolveExecution({ action: 'renew', reason: 'within_renewal_window' }, allow)).toEqual({
      kind: 'execute',
    });
  });

  it('escalates (not executes) when the plan renews but the guard refuses', () => {
    expect(resolveExecution({ action: 'renew', reason: 'expired_renew_now' }, deny)).toEqual({
      kind: 'escalate',
      reason: 'guard_no_approved_proforma',
    });
  });

  it('passes an escalate plan straight through', () => {
    expect(resolveExecution({ action: 'escalate', reason: 'not_platform_managed' }, allow)).toEqual({
      kind: 'escalate',
      reason: 'not_platform_managed',
    });
  });

  it('passes a skip plan straight through, ignoring the guard', () => {
    expect(resolveExecution({ action: 'skip', reason: 'not_due' }, deny)).toEqual({
      kind: 'skip',
      reason: 'not_due',
    });
  });

  it('never executes without an explicit guard allowance', () => {
    const disp = resolveExecution({ action: 'renew', reason: 'within_renewal_window' }, deny);
    expect(disp.kind).not.toBe('execute');
  });
});
