import { z } from 'zod';

export const RateCategory = z.enum(['cloud', 'web', 'seo', 'social', 'dns']);
export type RateCategory = z.infer<typeof RateCategory>;

export const RateComplexity = z.enum(['simple', 'standard', 'complex']);
export type RateComplexity = z.infer<typeof RateComplexity>;

export const RateCardEntry = z.object({
  id: z.string().uuid(),
  category: RateCategory,
  task_name: z.string(),
  task_description: z.string().nullable().optional(),
  estimated_hours: z.number().positive(),
  base_rate_kes_per_hour: z.number().int().positive(),
  fixed_price_kes: z.number().int().positive(),
  complexity: RateComplexity,
  version: z.string(),
  active: z.boolean(),
});
export type RateCardEntry = z.infer<typeof RateCardEntry>;
