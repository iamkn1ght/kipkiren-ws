import { priceProforma, type RetainerPlanName, type TicketUrgency } from '@kws/shared';
import type { AIDecompositionResult } from '@kws/shared';
import { getServiceClient } from '../lib/supabase.js';
import { computeContentHash } from '../lib/content-hash.js';
import { writeAuditEvent } from './audit.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../middleware/error.js';

/**
 * S2 — proforma lifecycle service.
 *
 * Two operations exposed here:
 *   - createDraftProforma(): persists an ai_draft proforma + line items.
 *     Computes totals via the locked billing math (priceProforma).
 *   - dispatchProforma():   freezes the proforma. Computes content_hash,
 *     writes audit_log, transitions status to dispatched. After this point
 *     the DB triggers in migration 0003 prevent any modification of line
 *     items, totals or hash.
 *
 * Both operations use the service-role Supabase client because they need
 * to write rows that authenticated clients are not permitted to insert
 * directly under RLS (clients can only INSERT into proforma_approvals).
 */

interface CreateDraftInput {
  ticket_id: string;
  ai: AIDecompositionResult;
  urgency: TicketUrgency;
  plan: RetainerPlanName;
  enterprise_discount_pct?: number;
}

interface DraftProforma {
  id: string;
  ref: string;
  total_kes: number;
}

async function nextProformaRef(): Promise<string> {
  // KWS-XXX format. Sprint 2 uses a simple counter against the existing
  // row count; production should switch to a sequence (`create sequence
  // public.kws_proforma_ref_seq`) so concurrent inserts don't collide.
  // Tracked as a polish item for S4.
  const sb = getServiceClient();
  const { count, error } = await sb
    .from('proformas')
    .select('id', { head: true, count: 'exact' });
  if (error) throw new HttpError(500, 'proforma_ref_failed');
  const next = (count ?? 0) + 1;
  return `KWS-${String(next).padStart(3, '0')}`;
}

export async function createDraftProforma(input: CreateDraftInput): Promise<DraftProforma> {
  const sb = getServiceClient();

  const subtotal = input.ai.line_items.reduce((acc, l) => acc + l.amount_kes, 0);
  const totals = priceProforma({
    subtotal_kes: subtotal,
    urgency: input.urgency,
    plan: input.plan,
    ...(input.enterprise_discount_pct !== undefined
      ? { enterprise_discount_pct: input.enterprise_discount_pct }
      : {}),
  });

  const ref = await nextProformaRef();

  const { data: proforma, error: insErr } = await sb
    .from('proformas')
    .insert({
      ref,
      ticket_id: input.ticket_id,
      ai_confidence_score: input.ai.confidence,
      ai_flag_reason: input.ai.flag_reason ?? null,
      subtotal_kes: totals.pre_discount_kes,
      discount_kes: totals.discount_kes,
      vat_kes: totals.vat_kes,
      total_kes: totals.total_kes,
      status: 'ai_draft',
    })
    .select('id, ref, total_kes')
    .single();

  if (insErr || !proforma) {
    logger.error({ err: insErr }, 'proforma_insert_failed');
    throw new HttpError(500, 'proforma_insert_failed');
  }

  const lineRows = input.ai.line_items.map((l, idx) => ({
    proforma_id: proforma.id,
    task_name: l.task_name,
    task_description: l.task_description ?? null,
    estimated_hours: l.estimated_hours,
    rate_kes_per_hour: l.rate_kes_per_hour,
    amount_kes: l.amount_kes,
    rate_card_entry_id: l.rate_card_entry_id ?? null,
    position: idx,
  }));

  const { error: lineErr } = await sb.from('proforma_line_items').insert(lineRows);
  if (lineErr) {
    logger.error({ err: lineErr }, 'proforma_line_items_insert_failed');
    throw new HttpError(500, 'proforma_line_items_insert_failed');
  }

  // Move ticket from decomposing → ai_draft.
  await sb.from('tickets').update({ status: 'ai_draft' }).eq('id', input.ticket_id);

  return proforma as DraftProforma;
}

interface DispatchInput {
  proforma_id: string;
  reviewer_user_id: string;
}

interface DispatchResult {
  proforma_id: string;
  content_hash: string;
  total_kes: number;
}

/**
 * Amara dispatches a reviewed proforma. Reads current line items, computes
 * the canonical content hash, writes it back to the proforma row, and
 * advances status to `dispatched`.
 *
 * After this call returns, the migration-0003 triggers (frt_proforma_post_dispatch_guard
 * + trg_proforma_line_items_frozen) make any further modification impossible
 * — even by the service role. The proforma is locked.
 */
export async function dispatchProforma(input: DispatchInput): Promise<DispatchResult> {
  const sb = getServiceClient();

  const { data: proforma, error: pErr } = await sb
    .from('proformas')
    .select('id, status, content_hash, total_kes')
    .eq('id', input.proforma_id)
    .single();

  if (pErr || !proforma) throw new HttpError(404, 'proforma_not_found');
  if (proforma.content_hash) throw new HttpError(409, 'proforma_already_dispatched');
  if (!['ai_draft', 'under_review'].includes(proforma.status)) {
    throw new HttpError(409, 'proforma_invalid_status_for_dispatch');
  }

  const { data: lines, error: lErr } = await sb
    .from('proforma_line_items')
    .select('task_name, amount_kes, position')
    .eq('proforma_id', input.proforma_id)
    .order('position', { ascending: true });

  if (lErr || !lines || lines.length === 0) {
    throw new HttpError(409, 'proforma_has_no_line_items');
  }

  const content_hash = computeContentHash(lines);

  const { error: updErr } = await sb
    .from('proformas')
    .update({
      content_hash,
      status: 'dispatched',
      dispatched_at: new Date().toISOString(),
    })
    .eq('id', input.proforma_id);

  if (updErr) {
    logger.error({ err: updErr }, 'proforma_dispatch_update_failed');
    throw new HttpError(500, 'proforma_dispatch_update_failed');
  }

  await writeAuditEvent({
    actor_id: input.reviewer_user_id,
    actor_role: 'delivery_lead',
    event_type: 'proforma_dispatched',
    entity_type: 'proforma',
    entity_id: input.proforma_id,
    payload_snapshot: {
      content_hash,
      total_kes: proforma.total_kes,
      line_count: lines.length,
    },
  });

  return {
    proforma_id: input.proforma_id,
    content_hash,
    total_kes: proforma.total_kes,
  };
}

/**
 * Load the active rate card for the AI service prompt.
 */
export async function loadActiveRateCard(): Promise<
  import('@kws/shared').RateCardEntry[]
> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('rate_card')
    .select(
      'id, category, task_name, task_description, estimated_hours, base_rate_kes_per_hour, fixed_price_kes, complexity, version, active',
    )
    .eq('active', true);
  if (error) throw new HttpError(500, 'rate_card_load_failed');
  return (data ?? []) as import('@kws/shared').RateCardEntry[];
}
