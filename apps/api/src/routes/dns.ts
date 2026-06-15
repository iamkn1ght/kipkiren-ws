import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { requireFeatureEnv } from '../config/env.js';
import { getServiceClient } from '../lib/supabase.js';
import { writeAuditEvent } from '../services/audit.js';
import {
  DNS_RECORD_TYPES,
  getCloudflareClient,
  type CloudflareDnsClient,
} from '../services/cloudflare.js';

/**
 * S6 — Cloudflare DNS management.
 *
 * Admin-only (delivery_lead/admin — clients do not edit DNS, matching the
 * services.ts role model). Every route gates on requireFeatureEnv('cloudflare')
 * so the surface 503s cleanly until a Cloudflare token is configured.
 *
 * A DNS operation targets an existing client_services row of type domain/dns;
 * the Cloudflare zone is resolved from that row's metadata.domain. Records are
 * passed through live to Cloudflare — nothing is mirrored into Supabase.
 */
export const dnsRouter: Router = Router();

// Test seam — overrideable in vitest so DNS tests don't need a real CF token.
// Mirrors proformas.ts setPaymentClientsForTest + kp()/ps().
let cloudflareClient: CloudflareDnsClient | null = null;
export function setCloudflareClientForTest(c: CloudflareDnsClient | null): void {
  cloudflareClient = c;
}
function cf(): CloudflareDnsClient {
  return cloudflareClient ?? getCloudflareClient();
}

const RecordInput = z.object({
  type: z.enum(DNS_RECORD_TYPES),
  name: z.string().min(1).max(255),
  content: z.string().min(1).max(2048),
  ttl: z.number().int().positive().optional(),
  proxied: z.boolean().optional(),
});

interface ResolvedZone {
  serviceId: string;
  domain: string;
  zoneId: string;
}

/**
 * Resolve serviceId → client_services row → metadata.domain → Cloudflare zone.
 * 404s (without leaking) at each missing step.
 */
async function resolveZone(serviceId: string): Promise<ResolvedZone> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('client_services')
    .select('id, service_type, client_id, metadata')
    .eq('id', serviceId)
    .single();
  if (error || !data) throw new HttpError(404, 'service_not_found');

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const domain = typeof metadata.domain === 'string' ? metadata.domain : '';
  if (!domain) throw new HttpError(404, 'service_has_no_domain');

  const zoneId = await cf().getZoneIdByName(domain);
  if (!zoneId) throw new HttpError(404, 'zone_not_found');

  return { serviceId, domain, zoneId };
}

// ----------------------------------------------------------------------------
// GET /v1/dns/:serviceId/records — list DNS records for the service's zone
// ----------------------------------------------------------------------------
dnsRouter.get(
  '/:serviceId/records',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    requireFeatureEnv('cloudflare');
    const { zoneId, domain } = await resolveZone(String(req.params.serviceId));
    const records = await cf().listRecords(zoneId);
    res.json({ domain, records });
  },
);

// ----------------------------------------------------------------------------
// POST /v1/dns/:serviceId/records — create a DNS record
// ----------------------------------------------------------------------------
dnsRouter.post(
  '/:serviceId/records',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    requireFeatureEnv('cloudflare');
    const parsed = RecordInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const serviceId = String(req.params.serviceId);
    const { zoneId } = await resolveZone(serviceId);
    const record = await cf().createRecord(zoneId, parsed.data);

    await writeAuditEvent({
      actor_id: req.auth!.sub,
      actor_role: req.auth!.role,
      event_type: 'dns_record_created',
      entity_type: 'client_service',
      entity_id: serviceId,
      payload_snapshot: { record_id: record.id, type: record.type, name: record.name },
    });

    res.status(201).json({ record });
  },
);

// ----------------------------------------------------------------------------
// PUT /v1/dns/:serviceId/records/:recordId — update a DNS record
// ----------------------------------------------------------------------------
dnsRouter.put(
  '/:serviceId/records/:recordId',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    requireFeatureEnv('cloudflare');
    const parsed = RecordInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten() });
      return;
    }
    const serviceId = String(req.params.serviceId);
    const recordId = String(req.params.recordId);
    const { zoneId } = await resolveZone(serviceId);
    const record = await cf().updateRecord(zoneId, recordId, parsed.data);

    await writeAuditEvent({
      actor_id: req.auth!.sub,
      actor_role: req.auth!.role,
      event_type: 'dns_record_updated',
      entity_type: 'client_service',
      entity_id: serviceId,
      payload_snapshot: { record_id: recordId, type: record.type, name: record.name },
    });

    res.json({ record });
  },
);

// ----------------------------------------------------------------------------
// DELETE /v1/dns/:serviceId/records/:recordId — delete a DNS record
// ----------------------------------------------------------------------------
dnsRouter.delete(
  '/:serviceId/records/:recordId',
  requireAuth,
  requireRole('delivery_lead', 'admin'),
  async (req: Request, res: Response) => {
    requireFeatureEnv('cloudflare');
    const serviceId = String(req.params.serviceId);
    const recordId = String(req.params.recordId);
    const { zoneId } = await resolveZone(serviceId);
    await cf().deleteRecord(zoneId, recordId);

    await writeAuditEvent({
      actor_id: req.auth!.sub,
      actor_role: req.auth!.role,
      event_type: 'dns_record_deleted',
      entity_type: 'client_service',
      entity_id: serviceId,
      payload_snapshot: { record_id: recordId },
    });

    res.status(204).end();
  },
);
