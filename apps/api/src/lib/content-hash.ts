import { createHash } from 'node:crypto';
import { canonicalProformaPayload, type HashableLine } from '@kws/shared';

/**
 * KWS-SEC-004 / ADR-KWS-001 — proforma content hash.
 *
 * Deterministic SHA-256 over the canonical line-item payload (task_name +
 * amount_kes per row, sorted by position then task_name).
 *
 * Computed at dispatch (services/proforma.ts) and stored on
 * proformas.content_hash. Re-computed at approval (routes/proformas.ts) and
 * verified against proforma_approvals.content_hash_at_approval — the database
 * trigger trg_proforma_approvals_hash_match (migration 0003) provides a
 * second independent check at the DB layer.
 *
 * Two layers, one truth: any drift between dispatch and approval aborts the
 * approval.
 */
export function computeContentHash(lines: ReadonlyArray<HashableLine>): string {
  const payload = canonicalProformaPayload(lines);
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
