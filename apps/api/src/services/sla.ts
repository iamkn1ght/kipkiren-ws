/**
 * SLA deadline calculation + breach state.
 *
 * Retainer plans carry an SLA response window in hours (Starter 48, Growth 24,
 * Business 12, Enterprise 4 - see kws_architecture_v1.md §1 and the retainer_plans
 * seed). Urgency flags override the plan window:
 *   - elevated → min(plan_hours, 48)
 *   - urgent   → min(plan_hours, 24)
 *
 * `sla_deadline_at` is stamped once at ticket creation from the client's plan
 * and the submitted urgency. It is NOT recomputed when plan upgrades happen -
 * the deadline at the time of submission is the contract.
 *
 * Breach state:
 *   - clear        : deadline more than 20% of the window away
 *   - warn         : inside the last 20% of the window
 *   - breached     : deadline is in the past and ticket is not closed
 *
 * The 20% warn threshold maps to the yellow/amber bar in the dashboard
 * mockups - matches `.fl-a` at 28% in kws_client_portal_v3.html SLA row.
 */

import type { TicketUrgency } from '@kws/shared';

export type SlaState = 'clear' | 'warn' | 'breached';

const URGENCY_CAP_HOURS: Record<TicketUrgency, number | null> = {
  standard: null,
  elevated: 48,
  urgent: 24,
};

export function computeSlaDeadline(args: {
  submittedAt: Date;
  planSlaHours: number;
  urgency: TicketUrgency;
}): Date {
  const cap = URGENCY_CAP_HOURS[args.urgency];
  const effectiveHours = cap === null ? args.planSlaHours : Math.min(args.planSlaHours, cap);
  return new Date(args.submittedAt.getTime() + effectiveHours * 60 * 60 * 1000);
}

export function slaStateFromDeadline(args: {
  now: Date;
  deadline: Date;
  submittedAt: Date;
  isTerminal: boolean;
}): SlaState {
  if (args.isTerminal) return 'clear';
  const remainingMs = args.deadline.getTime() - args.now.getTime();
  if (remainingMs <= 0) return 'breached';
  const windowMs = args.deadline.getTime() - args.submittedAt.getTime();
  if (windowMs <= 0) return 'warn';
  const ratio = remainingMs / windowMs;
  return ratio < 0.2 ? 'warn' : 'clear';
}

/** Milliseconds remaining until breach. Negative = already breached. */
export function msUntilBreach(now: Date, deadline: Date): number {
  return deadline.getTime() - now.getTime();
}

/** Short label for the queue sidebar (mirrors "18h left" copy in the mockup). */
export function formatRemaining(now: Date, deadline: Date): string {
  const ms = msUntilBreach(now, deadline);
  if (ms <= 0) return 'BREACHED';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}
