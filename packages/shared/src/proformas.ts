import { z } from 'zod';

export const ProformaStatus = z.enum([
  'ai_draft',
  'under_review',
  'dispatched',
  'approved',
  'rejected',
  'expired',
]);
export type ProformaStatus = z.infer<typeof ProformaStatus>;

export const ProformaLineItem = z.object({
  id: z.string().uuid().optional(),
  task_name: z.string().min(1),
  task_description: z.string().nullable().optional(),
  estimated_hours: z.number().positive(),
  rate_kes_per_hour: z.number().int().positive(),
  amount_kes: z.number().int().positive(),
  rate_card_entry_id: z.string().uuid().nullable().optional(),
  position: z.number().int().nonnegative().default(0),
});
export type ProformaLineItem = z.infer<typeof ProformaLineItem>;

/**
 * Strict schema for what the AI Decomposition Engine must return.
 * Validated with Zod before any database write. KWS-SEC-005.
 */
export const AIDecompositionResult = z.object({
  confidence: z.number().min(0).max(1),
  flag_reason: z.string().nullable().optional(),
  line_items: z.array(ProformaLineItem).min(1).max(12),
});
export type AIDecompositionResult = z.infer<typeof AIDecompositionResult>;

export const Proforma = z.object({
  id: z.string().uuid(),
  ref: z.string(),
  ticket_id: z.string().uuid(),
  ai_confidence_score: z.number().min(0).max(1).nullable(),
  subtotal_kes: z.number().int().nonnegative(),
  discount_kes: z.number().int().nonnegative(),
  vat_kes: z.number().int().nonnegative(),
  total_kes: z.number().int().nonnegative(),
  status: ProformaStatus,
  content_hash: z.string().nullable(),
});
export type Proforma = z.infer<typeof Proforma>;
