/**
 * Domain expiry alert banding (KWS-S6-005) - pure-function tests.
 */

import { describe, expect, it } from 'vitest';
import { dueExpiryAlerts, type ExpiryServiceInput } from '../src/services/domain-expiry.js';

const NOW = new Date('2026-06-23T00:00:00.000Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 24 * 3600_000).toISOString();

function svc(p: Partial<ExpiryServiceInput>): ExpiryServiceInput {
  return { service_id: 's1', client_id: 'c1', domain: 'acme.co.ke', renewal_at: inDays(20), msisdn: '254700000000', ...p };
}

describe('dueExpiryAlerts', () => {
  it('no alert when renewal is more than 30 days out', () => {
    expect(dueExpiryAlerts([svc({ renewal_at: inDays(45) })], NOW)).toHaveLength(0);
  });

  it('fires the 30-day band between 8 and 30 days', () => {
    const a = dueExpiryAlerts([svc({ renewal_at: inDays(20) })], NOW);
    expect(a).toHaveLength(1);
    expect(a[0]!.template).toBe('kws_domain_expiry_30d');
    expect(a[0]!.band).toBe('d30');
    expect(a[0]!.days_left).toBe(20);
  });

  it('fires the 7-day band at or under 7 days', () => {
    const a = dueExpiryAlerts([svc({ renewal_at: inDays(5) })], NOW);
    expect(a[0]!.template).toBe('kws_domain_expiry_7d');
    expect(a[0]!.band).toBe('d7');
  });

  it('does not re-fire a band already alerted', () => {
    expect(dueExpiryAlerts([svc({ renewal_at: inDays(20), alerted: { d30: true } })], NOW)).toHaveLength(0);
    expect(dueExpiryAlerts([svc({ renewal_at: inDays(5), alerted: { d7: true } })], NOW)).toHaveLength(0);
  });

  it('still fires 7-day even if 30-day was already sent', () => {
    const a = dueExpiryAlerts([svc({ renewal_at: inDays(3), alerted: { d30: true } })], NOW);
    expect(a).toHaveLength(1);
    expect(a[0]!.band).toBe('d7');
  });

  it('no alert for past-due or undated services', () => {
    expect(dueExpiryAlerts([svc({ renewal_at: inDays(-1) })], NOW)).toHaveLength(0);
    expect(dueExpiryAlerts([svc({ renewal_at: null })], NOW)).toHaveLength(0);
  });

  it('carries msisdn through when present', () => {
    const a = dueExpiryAlerts([svc({ renewal_at: inDays(10), msisdn: '254711111111' })], NOW);
    expect(a[0]!.msisdn).toBe('254711111111');
  });
});
