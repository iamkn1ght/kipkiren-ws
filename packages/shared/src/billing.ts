/**
 * KWS billing math — single source of truth.
 *
 * From kws_reboot_pack_v1.md §5:
 *
 *   base_rate × hours = subtotal
 *   → × urgency_multiplier (standard 1.0×, elevated 1.25×, urgent 1.5×)
 *   → − plan_discount    (Starter 0%, Growth 10%, Business 15%, Enterprise negotiated)
 *   → + VAT 16%
 *   = total_due
 *
 *   All KES amounts are integers. Round UP (ceiling), never floor.
 */

import type { TicketUrgency } from './tickets.js';
import type { RetainerPlanName } from './roles.js';

export const VAT_RATE = 0.16;

export const URGENCY_MULTIPLIER: Record<TicketUrgency, number> = {
  standard: 1.0,
  elevated: 1.25,
  urgent: 1.5,
};

export const PLAN_DISCOUNT_PCT: Record<RetainerPlanName, number> = {
  Starter: 0,
  Growth: 10,
  Business: 15,
  Enterprise: 0, // negotiated per contract — applied at line-item dispatch time
};

const ceilKes = (n: number): number => Math.ceil(n);

export interface PriceLineInput {
  base_rate_kes_per_hour: number;
  hours: number;
}

export function priceLineSubtotal({ base_rate_kes_per_hour, hours }: PriceLineInput): number {
  return ceilKes(base_rate_kes_per_hour * hours);
}

export interface PriceProformaInput {
  subtotal_kes: number;
  urgency: TicketUrgency;
  plan: RetainerPlanName;
  enterprise_discount_pct?: number; // 0–100
}

export interface PriceProformaResult {
  pre_discount_kes: number;
  discount_kes: number;
  taxable_kes: number;
  vat_kes: number;
  total_kes: number;
}

export function priceProforma(input: PriceProformaInput): PriceProformaResult {
  const urgencyMul = URGENCY_MULTIPLIER[input.urgency];
  const preDiscount = ceilKes(input.subtotal_kes * urgencyMul);

  const discountPct =
    input.plan === 'Enterprise'
      ? input.enterprise_discount_pct ?? 0
      : PLAN_DISCOUNT_PCT[input.plan];

  const discount = ceilKes((preDiscount * discountPct) / 100);
  const taxable = preDiscount - discount;
  const vat = ceilKes(taxable * VAT_RATE);
  const total = taxable + vat;

  return {
    pre_discount_kes: preDiscount,
    discount_kes: discount,
    taxable_kes: taxable,
    vat_kes: vat,
    total_kes: total,
  };
}

/**
 * KWS-SEC-004 + ADR-KWS-001 — deterministic content hash for a proforma.
 * Hash is computed at dispatch and re-verified at approval. Any drift aborts
 * the approval.
 *
 * Determinism rules:
 *   - canonical line ordering by `position` then `task_name`
 *   - only `task_name` + `amount_kes` per row contribute to the hash
 *     (the architecture doc specifies this exact pair)
 *   - newline separator, no trailing whitespace
 *
 * The actual SHA-256 is computed in @kws/api using node:crypto, so this file
 * stays free of node-specific imports and can be used from the React portals.
 */
export interface HashableLine {
  task_name: string;
  amount_kes: number;
  position?: number;
}

export function canonicalProformaPayload(lines: ReadonlyArray<HashableLine>): string {
  const sorted = [...lines].sort((a, b) => {
    const ap = a.position ?? 0;
    const bp = b.position ?? 0;
    if (ap !== bp) return ap - bp;
    return a.task_name.localeCompare(b.task_name);
  });
  return sorted.map((l) => `${l.task_name}\t${l.amount_kes}`).join('\n');
}
