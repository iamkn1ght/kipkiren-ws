/**
 * Agent autonomous-execution guard (KWS-S9-004) - pure-function tests.
 *
 * The guard is the safety interlock for autonomous infrastructure changes: it
 * refuses unless the feature is enabled AND an approved proforma with a matching
 * content hash covers the work. Default-deny on any missing fact.
 */

import { describe, expect, it } from 'vitest';
import { assertExecutionPreconditions } from '../src/services/agent-execution.js';

const HASH = 'a'.repeat(64);

const base = {
  featureEnabled: true,
  hasApprovedProforma: true,
  dispatchedHash: HASH,
  approvalHash: HASH,
};

describe('assertExecutionPreconditions', () => {
  it('allows when feature on + approved proforma + matching hash', () => {
    expect(assertExecutionPreconditions(base)).toEqual({ allowed: true });
  });

  it('refuses when the feature flag is off', () => {
    expect(assertExecutionPreconditions({ ...base, featureEnabled: false })).toEqual({
      allowed: false,
      reason: 'feature_disabled',
    });
  });

  it('refuses when there is no approved proforma', () => {
    expect(assertExecutionPreconditions({ ...base, hasApprovedProforma: false })).toEqual({
      allowed: false,
      reason: 'no_approved_proforma',
    });
  });

  it('refuses when a content hash is missing', () => {
    expect(assertExecutionPreconditions({ ...base, approvalHash: null })).toEqual({
      allowed: false,
      reason: 'missing_content_hash',
    });
  });

  it('refuses when the dispatched and approval hashes diverge', () => {
    expect(assertExecutionPreconditions({ ...base, approvalHash: 'b'.repeat(64) })).toEqual({
      allowed: false,
      reason: 'content_hash_mismatch',
    });
  });

  it('checks the flag before anything else (most restrictive first)', () => {
    const r = assertExecutionPreconditions({
      featureEnabled: false,
      hasApprovedProforma: false,
      dispatchedHash: null,
      approvalHash: null,
    });
    expect(r).toEqual({ allowed: false, reason: 'feature_disabled' });
  });
});
