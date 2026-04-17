import { getServiceClient } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import type { UserRole } from '../middleware/auth.js';

/**
 * KWS-SEC-012 — non-repudiation audit log writer.
 *
 * The audit_log table is INSERT-only at the database layer (migration 0003
 * revokes update/delete grants AND installs a hard trigger). This helper
 * is the single supported entry point for writing it.
 *
 * Required event types from the architecture doc:
 *   - proforma_dispatched
 *   - proforma_approved
 *   - payment_confirmed
 *   - scope_locked
 *   - rate_card_modified
 *   - ticket_assigned
 *   - task_completed
 *
 * Plus KWS-additions captured during S2/S3:
 *   - ticket_submitted
 *   - ai_decomposition_completed
 *   - ai_decomposition_failed
 *   - proforma_review_edited
 *   - proforma_hash_mismatch
 *   - refresh_replay_detected
 */
export type AuditEventType =
  | 'ticket_submitted'
  | 'ai_decomposition_completed'
  | 'ai_decomposition_failed'
  | 'proforma_review_edited'
  | 'proforma_dispatched'
  | 'proforma_approved'
  | 'proforma_hash_mismatch'
  | 'payment_confirmed'
  | 'scope_locked'
  | 'proforma_rejected'
  | 'service_created'
  | 'service_updated'
  | 'onboarding_invoice_created'
  | 'consent_recorded'
  | 'dsar_fulfilled'
  | 'rate_card_modified'
  | 'ticket_assigned'
  | 'task_completed'
  | 'refresh_replay_detected';

export interface AuditEventInput {
  actor_id: string | null;
  actor_role: UserRole | null;
  event_type: AuditEventType;
  entity_type: string;
  entity_id: string;
  payload_snapshot?: Record<string, unknown>;
}

export async function writeAuditEvent(input: AuditEventInput): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from('audit_log').insert({
    actor_id: input.actor_id,
    actor_role: input.actor_role,
    event_type: input.event_type,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    payload_snapshot: input.payload_snapshot ?? {},
  });
  if (error) {
    // Audit failures are loud. We do NOT swallow them — but we also don't
    // throw because audit writes are typically secondary to a primary
    // operation that already succeeded. Log + alert is the right escalation.
    logger.error({ err: error, event: input }, 'audit_log_write_failed');
  }
}
