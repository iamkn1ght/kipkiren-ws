/**
 * SLA audit aggregation (KWS-S8-003) - pure-function unit tests.
 *
 * computeSlaAudit only judges tickets whose deadline has ELAPSED within the
 * window. met = terminal status; breached = past deadline and still open.
 */

import { describe, expect, it } from 'vitest';
import { computeSlaAudit, type SlaAuditTicketRow } from '../src/services/admin-views.js';

const NOW = new Date('2026-06-23T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

function row(p: Partial<SlaAuditTicketRow>): SlaAuditTicketRow {
  return {
    client_id: 'c1',
    client_name: 'Acme',
    plan: 'Growth',
    category: 'web',
    status: 'complete',
    sla_deadline_at: hoursAgo(1),
    created_at: hoursAgo(49),
    ...p,
  };
}

describe('computeSlaAudit', () => {
  it('ignores tickets whose deadline has not yet elapsed', () => {
    const r = computeSlaAudit([row({ sla_deadline_at: hoursAhead(5), status: 'in_progress' })], NOW);
    expect(r.overall.total).toBe(0);
    expect(r.overall.compliance_pct).toBe(100);
  });

  it('ignores tickets with no deadline', () => {
    const r = computeSlaAudit([row({ sla_deadline_at: null })], NOW);
    expect(r.overall.total).toBe(0);
  });

  it('counts an elapsed terminal ticket as met', () => {
    const r = computeSlaAudit([row({ status: 'complete', sla_deadline_at: hoursAgo(2) })], NOW);
    expect(r.overall.total).toBe(1);
    expect(r.overall.met).toBe(1);
    expect(r.overall.breached).toBe(0);
    expect(r.overall.compliance_pct).toBe(100);
  });

  it('counts an elapsed open ticket as breached', () => {
    const r = computeSlaAudit([row({ status: 'in_progress', sla_deadline_at: hoursAgo(2) })], NOW);
    expect(r.overall.total).toBe(1);
    expect(r.overall.breached).toBe(1);
    expect(r.overall.breach_rate).toBe(1);
    expect(r.overall.compliance_pct).toBe(0);
  });

  it('aggregates breach rate by client, category and plan', () => {
    const rows = [
      row({ client_name: 'Acme', category: 'web', plan: 'Growth', status: 'complete', sla_deadline_at: hoursAgo(3) }),
      row({ client_name: 'Acme', category: 'web', plan: 'Growth', status: 'in_progress', sla_deadline_at: hoursAgo(3) }),
      row({ client_name: 'Bolt', category: 'seo', plan: 'Starter', status: 'in_progress', sla_deadline_at: hoursAgo(3) }),
      row({ client_name: 'Bolt', category: 'seo', plan: 'Starter', status: 'closed', sla_deadline_at: hoursAgo(3) }),
    ];
    const r = computeSlaAudit(rows, NOW);
    expect(r.overall.total).toBe(4);
    expect(r.overall.breached).toBe(2);
    expect(r.overall.breach_rate).toBe(0.5);

    const acme = r.by_client.find((b) => b.key === 'Acme')!;
    expect(acme.total).toBe(2);
    expect(acme.breached).toBe(1);
    expect(acme.compliance_pct).toBe(50);

    const seo = r.by_category.find((b) => b.key === 'seo')!;
    expect(seo.breached).toBe(1);
    expect(seo.total).toBe(2);

    // Worst-breach bucket sorts first.
    expect(r.by_client[0]!.breach_rate).toBeGreaterThanOrEqual(r.by_client[1]!.breach_rate);
  });

  it('excludes tickets whose deadline is older than the window', () => {
    const r = computeSlaAudit(
      [row({ status: 'in_progress', sla_deadline_at: new Date(NOW.getTime() - 40 * 24 * 3600_000).toISOString() })],
      NOW,
      30,
    );
    expect(r.overall.total).toBe(0);
  });
});
