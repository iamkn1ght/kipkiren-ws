import { z } from 'zod';

export const TicketCategory = z.enum(['web', 'cloud', 'seo', 'social', 'dns', 'general']);
export type TicketCategory = z.infer<typeof TicketCategory>;

export const TicketUrgency = z.enum(['standard', 'elevated', 'urgent']);
export type TicketUrgency = z.infer<typeof TicketUrgency>;

export const TicketStatus = z.enum([
  'submitted',
  'decomposing',
  'ai_draft',
  'review',
  'dispatched',
  'approved',
  'paid',
  'in_progress',
  'complete',
  'closed',
]);
export type TicketStatus = z.infer<typeof TicketStatus>;

export const CreateTicketInput = z.object({
  description: z.string().min(10).max(4000),
  category: TicketCategory,
  urgency: TicketUrgency.default('standard'),
  attachment_paths: z.array(z.string()).max(10).optional(),
});
export type CreateTicketInput = z.infer<typeof CreateTicketInput>;
