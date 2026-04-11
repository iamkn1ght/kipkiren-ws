/**
 * Pure-function tests for the HMAC verification helpers.
 * These cover the highest-stakes line of defence on the webhook path —
 * any payload that fails signature verification must NEVER reach the
 * confirmation logic. KWS-SEC-003 / KWS-SEC-006.
 */

import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyKipkirenPaySignature, verifyPaystackSignature } from '../src/lib/hmac.js';

const SECRET = 'test-hmac-secret-do-not-use-in-prod';
const BODY = JSON.stringify({ gateway_ref: 'KWS-042', amount_kes: 13705, status: 'success' });

const sha256 = (b: string, s: string) => createHmac('sha256', s).update(b, 'utf8').digest('hex');
const sha512 = (b: string, s: string) => createHmac('sha512', s).update(b, 'utf8').digest('hex');

describe('verifyKipkirenPaySignature (HMAC-SHA256)', () => {
  it('accepts a correctly signed payload', () => {
    expect(verifyKipkirenPaySignature(BODY, sha256(BODY, SECRET), SECRET)).toBe(true);
  });
  it('rejects a tampered body', () => {
    const tampered = BODY.replace('13705', '1');
    expect(verifyKipkirenPaySignature(tampered, sha256(BODY, SECRET), SECRET)).toBe(false);
  });
  it('rejects a wrong-secret signature', () => {
    expect(verifyKipkirenPaySignature(BODY, sha256(BODY, 'other-secret'), SECRET)).toBe(false);
  });
  it('rejects an empty signature', () => {
    expect(verifyKipkirenPaySignature(BODY, '', SECRET)).toBe(false);
  });
  it('rejects an undefined signature header', () => {
    expect(verifyKipkirenPaySignature(BODY, undefined, SECRET)).toBe(false);
  });
  it('rejects an HMAC-SHA512 hex (algorithm confusion)', () => {
    expect(verifyKipkirenPaySignature(BODY, sha512(BODY, SECRET), SECRET)).toBe(false);
  });
});

describe('verifyPaystackSignature (HMAC-SHA512)', () => {
  it('accepts a correctly signed payload', () => {
    expect(verifyPaystackSignature(BODY, sha512(BODY, SECRET), SECRET)).toBe(true);
  });
  it('rejects a tampered body', () => {
    const tampered = BODY + ' ';
    expect(verifyPaystackSignature(tampered, sha512(BODY, SECRET), SECRET)).toBe(false);
  });
  it('rejects an HMAC-SHA256 hex (algorithm confusion)', () => {
    expect(verifyPaystackSignature(BODY, sha256(BODY, SECRET), SECRET)).toBe(false);
  });
  it('rejects undefined header', () => {
    expect(verifyPaystackSignature(BODY, undefined, SECRET)).toBe(false);
  });
});
