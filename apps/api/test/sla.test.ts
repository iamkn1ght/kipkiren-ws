/**
 * SLA math — pure-function tests for services/sla.ts.
 * Pins the plan × urgency matrix from kws_architecture_v1.md §1.
 */

import { describe, expect, it } from 'vitest';
import {
  computeSlaDeadline,
  slaStateFromDeadline,
  formatRemaining,
} from '../src/services/sla.js';

const HR = 60 * 60 * 1000;

describe('computeSlaDeadline — plan × urgency matrix', () => {
  const submittedAt = new Date('2026-04-12T08:00:00Z');

  it('Starter · standard → 48h deadline', () => {
    const d = computeSlaDeadline({ submittedAt, planSlaHours: 48, urgency: 'standard' });
    expect(d.getTime() - submittedAt.getTime()).toBe(48 * HR);
  });
  it('Growth · standard → 24h deadline', () => {
    const d = computeSlaDeadline({ submittedAt, planSlaHours: 24, urgency: 'standard' });
    expect(d.getTime() - submittedAt.getTime()).toBe(24 * HR);
  });
  it('Business · standard → 12h deadline', () => {
    const d = computeSlaDeadline({ submittedAt, planSlaHours: 12, urgency: 'standard' });
    expect(d.getTime() - submittedAt.getTime()).toBe(12 * HR);
  });
  it('Enterprise · standard → 4h deadline', () => {
    const d = computeSlaDeadline({ submittedAt, planSlaHours: 4, urgency: 'standard' });
    expect(d.getTime() - submittedAt.getTime()).toBe(4 * HR);
  });

  it('Starter · urgent (cap 24h) → 24h deadline (tighter than plan)', () => {
    const d = computeSlaDeadline({ submittedAt, planSlaHours: 48, urgency: 'urgent' });
    expect(d.getTime() - submittedAt.getTime()).toBe(24 * HR);
  });
  it('Starter · elevated (cap 48h) → 48h deadline (matches plan)', () => {
    const d = computeSlaDeadline({ submittedAt, planSlaHours: 48, urgency: 'elevated' });
    expect(d.getTime() - submittedAt.getTime()).toBe(48 * HR);
  });
  it('Business · elevated (cap 48h) → plan (12h) wins, urgency does NOT widen', () => {
    const d = computeSlaDeadline({ submittedAt, planSlaHours: 12, urgency: 'elevated' });
    expect(d.getTime() - submittedAt.getTime()).toBe(12 * HR);
  });
  it('Enterprise · urgent (cap 24h) → 4h deadline (plan beats urgency cap)', () => {
    const d = computeSlaDeadline({ submittedAt, planSlaHours: 4, urgency: 'urgent' });
    expect(d.getTime() - submittedAt.getTime()).toBe(4 * HR);
  });
});

describe('slaStateFromDeadline', () => {
  const submittedAt = new Date('2026-04-12T08:00:00Z');
  const deadline = new Date('2026-04-13T08:00:00Z'); // 24h window

  it('clear when plenty of time left', () => {
    const now = new Date('2026-04-12T10:00:00Z'); // 2h in — 22h remaining
    expect(slaStateFromDeadline({ now, deadline, submittedAt, isTerminal: false })).toBe('clear');
  });
  it('warn when inside the last 20% of the window', () => {
    const now = new Date('2026-04-13T04:00:00Z'); // 4h remaining of 24h = 16.6%
    expect(slaStateFromDeadline({ now, deadline, submittedAt, isTerminal: false })).toBe('warn');
  });
  it('breached when deadline has passed', () => {
    const now = new Date('2026-04-13T09:00:00Z');
    expect(slaStateFromDeadline({ now, deadline, submittedAt, isTerminal: false })).toBe('breached');
  });
  it('returns clear when ticket is terminal even if past deadline', () => {
    const now = new Date('2026-04-13T09:00:00Z');
    expect(slaStateFromDeadline({ now, deadline, submittedAt, isTerminal: true })).toBe('clear');
  });
});

describe('formatRemaining', () => {
  const deadline = new Date('2026-04-13T08:00:00Z');
  it('shows hours when less than 48h away', () => {
    const now = new Date('2026-04-12T14:00:00Z'); // 18h remaining
    expect(formatRemaining(now, deadline)).toBe('18h left');
  });
  it('shows minutes when less than 1h away', () => {
    const now = new Date('2026-04-13T07:45:00Z');
    expect(formatRemaining(now, deadline)).toBe('15m left');
  });
  it('shows days when 48h or more away', () => {
    const now = new Date('2026-04-11T00:00:00Z');
    expect(formatRemaining(now, deadline)).toBe('2d left');
  });
  it('shows BREACHED when deadline has passed', () => {
    const now = new Date('2026-04-13T09:00:00Z');
    expect(formatRemaining(now, deadline)).toBe('BREACHED');
  });
});
