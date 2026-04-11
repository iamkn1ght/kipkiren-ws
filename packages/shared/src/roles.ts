import { z } from 'zod';

export const UserRole = z.enum(['client', 'delivery_lead', 'technical_delivery', 'admin']);
export type UserRole = z.infer<typeof UserRole>;

export const RetainerPlanName = z.enum(['Starter', 'Growth', 'Business', 'Enterprise']);
export type RetainerPlanName = z.infer<typeof RetainerPlanName>;
