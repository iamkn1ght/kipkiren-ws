/**
 * Agent autonomous-execution guard + ledger (KWS-S9-004).
 *
 * Before an agent (e.g. Helpan KWS) autonomously executes an infrastructure
 * change such as a DNS edit, two invariants must hold:
 *   1. The feature is switched on (AGENT_DNS_EXECUTION_ENABLED) - OFF by default.
 *   2. The change is covered by a client-approved proforma whose dispatched
 *      content_hash still matches the hash at approval (ADR-KWS-001/002): the
 *      agent may only execute work the client actually paid for, unchanged.
 *
 * assertExecutionPreconditions is pure (unit-tested). recordAgentExecution
 * appends an immutable row to agent_executions (0007) and mirrors a terminal
 * event into audit_log.
 *
 * NOTE: the live wiring into routes/dns.ts is intentionally deferred - it needs
 * the `helpan-kws-service` JWT caller (KWS-S9-002), which is blocked on the
 * Identiti signing-key + operator handover. This module is the scaffold that
 * activation plugs into.
 */

import { getServiceClient } from '../lib/supabase.js';
import { writeAuditEvent } from './audit.js';
import { logger } from '../lib/logger.js';
import type { AuditEventType } from './audit.js';

export interface ExecutionPreconditions {
  featureEnabled: boolean;
  hasApprovedProforma: boolean;
  dispatchedHash: string | null; // proformas.content_hash
  approvalHash: string | null;   // proforma_approvals.content_hash_at_approval
}

export type GuardResult = { allowed: true } | { allowed: false; reason: string };

/**
 * Pure precondition guard. Returns allowed=false with a stable reason code so
 * the caller can audit the refusal. Defaults to refusing on any missing fact.
 */
export function assertExecutionPreconditions(p: ExecutionPreconditions): GuardResult {
  if (!p.featureEnabled) return { allowed: false, reason: 'feature_disabled' };
  if (!p.hasApprovedProforma) return { allowed: false, reason: 'no_approved_proforma' };
  if (!p.dispatchedHash || !p.approvalHash) return { allowed: false, reason: 'missing_content_hash' };
  if (p.dispatchedHash !== p.approvalHash) return { allowed: false, reason: 'content_hash_mismatch' };
  return { allowed: true };
}

export type AgentExecStatus = 'started' | 'complete' | 'failed' | 'escalated';

const STATUS_EVENT: Record<AgentExecStatus, AuditEventType> = {
  started: 'agent_execution_started',
  complete: 'agent_execution_completed',
  failed: 'agent_execution_failed',
  escalated: 'agent_execution_escalated',
};

export interface RecordExecutionInput {
  agent_id: string;
  action: string;
  status: AgentExecStatus;
  ticket_id?: string | null;
  proforma_approval_id?: string | null;
  params_snapshot?: Record<string, unknown>;
  before_state_snapshot?: Record<string, unknown> | null;
  after_state_snapshot?: Record<string, unknown> | null;
  error?: string | null;
}

/**
 * Append one immutable row to the agent_executions ledger and mirror the event
 * into audit_log. Never throws - a ledger failure is logged loudly but must not
 * crash the (already-gated) execution path.
 */
export async function recordAgentExecution(input: RecordExecutionInput): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from('agent_executions').insert({
    agent_id: input.agent_id,
    action: input.action,
    status: input.status,
    ticket_id: input.ticket_id ?? null,
    proforma_approval_id: input.proforma_approval_id ?? null,
    params_snapshot: input.params_snapshot ?? {},
    before_state_snapshot: input.before_state_snapshot ?? null,
    after_state_snapshot: input.after_state_snapshot ?? null,
    error: input.error ?? null,
  });
  if (error) {
    logger.error({ err: error, input }, 'agent_execution_ledger_write_failed');
  }

  await writeAuditEvent({
    actor_id: null,
    actor_role: null,
    event_type: STATUS_EVENT[input.status],
    entity_type: 'agent_execution',
    entity_id: input.ticket_id ?? input.agent_id,
    payload_snapshot: { agent_id: input.agent_id, action: input.action, status: input.status, ...(input.error ? { error: input.error } : {}) },
  });
}
