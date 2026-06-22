import { Router, type Request, type Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { getServiceClient } from '../lib/supabase.js';

export const invoicesRouter: Router = Router();

// ----------------------------------------------------------------------------
// GET /v1/invoices - list retainer + task invoices for the caller's client.
// ----------------------------------------------------------------------------
invoicesRouter.get(
  '/',
  requireAuth,
  requireRole('client', 'admin'),
  async (req: Request, res: Response) => {
    if (!req.auth?.clientId && req.auth?.role !== 'admin') {
      throw new HttpError(403, 'client_context_missing');
    }
    const sb = getServiceClient();
    const query = sb
      .from('invoices')
      .select('id, ref, kind, period_start, period_end, subtotal_kes, vat_kes, total_kes, issued_at, paid_at')
      .order('issued_at', { ascending: false })
      .limit(100);
    if (req.auth?.role === 'client' && req.auth.clientId) {
      query.eq('client_id', req.auth.clientId);
    }
    const { data, error } = await query;
    if (error) throw new HttpError(500, 'invoices_query_failed');
    res.json({ invoices: data ?? [] });
  },
);
