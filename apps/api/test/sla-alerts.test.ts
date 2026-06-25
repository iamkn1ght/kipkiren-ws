/**
 * SLA breach selection (KWS-S9-003, 5th template) - pure-function tests.
 *
 * selectNewBreaches picks non-terminal tickets whose deadline has elapsed and
 * that have not already been notified (dedup set sourced from audit_log).
 */

import { describe, expect, it } from 'vitest';
import { selectNewBreaches, type BreachTicketInput } from '../src/services/sla-alerts.js';

const NOW = new Date('2026-06-25T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

function tk(p: Partial<BreachTicketInput>): BreachTicketInput {
  return { id: 't1', ref: 'KWS-T-1', client_id: 'c1', status: 'in_progress', sla_deadline_at: hoursAgo(1), msisdn: '254700000000', sla_hours: 24, ...p };
}

describe('selectNewBreaches', () => {
  it('selects a breached, un-notified, non-terminal ticket', () => {
    const r = selectNewBreaches([tk({})], new Set(), NOW);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ ticket_id: 't1', ref: 'KWS-T-1', sla_hours: 24 });
  });

  it('ignores tickets whose deadline has not elapsed', () => {
    expect(selectNewBreaches([tk({ sla_deadline_at: hoursAhead(3) })], new Set(), NOW)).toHaveLength(0);
  });

  it('ignores terminal (complete/closed) tickets', () => {
    expect(selectNewBreaches([tk({ status: 'complete' })], new Set(), NOW)).toHaveLength(0);
    expect(selectNewBreaches([tk({ status: 'closed' })], new Set(), NOW)).toHaveLength(0);
  });

  it('ignores tickets already notified (dedup set)', () => {
    expect(selectNewBreaches([tk({ id: 't9' })], new Set(['t9']), NOW)).toHaveLength(0);
  });

  it('ignores undated tickets', () => {
    expect(selectNewBreaches([tk({ sla_deadline_at: null })], new Set(), NOW)).toHaveLength(0);
  });

  it('defaults sla_hours to 24 when missing and preserves msisdn', () => {
    const r = selectNewBreaches([tk({ sla_hours: undefined, msisdn: '254711111111' })], new Set(), NOW);
    expect(r[0]!.sla_hours).toBe(24);
    expect(r[0]!.msisdn).toBe('254711111111');
  });

  it('omits msisdn when the client has no phone', () => {
    const r = selectNewBreaches([tk({ msisdn: undefined })], new Set(), NOW);
    expect(r[0]!.msisdn).toBeUndefined();
  });
});
