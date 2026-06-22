/**
 * Cloudflare DNS adapter (S6 - Hosting, Domain, DNS & Uptime).
 *
 * KWS manages DNS for client domain/dns services through Cloudflare (the
 * platform edge/DNS provider - architecture doc §7). This adapter is a thin,
 * interface-shaped client over the Cloudflare v4 API so the DNS routes can
 * inject a fake in tests - exactly the pattern used for the payment rails in
 * `payments.ts`. The real client is wired lazily and reads its token from the
 * Tier-2 env; routes gate on `requireFeatureEnv('cloudflare')` first, so the
 * service boots fine without a Cloudflare token and the feature 503s cleanly
 * until one is set.
 *
 * Live passthrough: records are read/written directly against Cloudflare on
 * each call. Nothing is mirrored into Supabase - there is no DNS table.
 */

import { loadEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';

export const DNS_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX'] as const;
export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

export interface DnsRecord {
  id: string;
  type: DnsRecordType;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
}

export interface DnsRecordInput {
  type: DnsRecordType;
  name: string;
  content: string;
  // `| undefined` so the Zod-inferred optional fields assign cleanly under
  // tsconfig `exactOptionalPropertyTypes`. ttl 1 = "automatic" in Cloudflare.
  ttl?: number | undefined;
  proxied?: boolean | undefined;
}

export interface CloudflareDnsClient {
  /** Resolve a zone id from a domain (apex) name. null if the zone is not on this account. */
  getZoneIdByName(domain: string): Promise<string | null>;
  listRecords(zoneId: string): Promise<DnsRecord[]>;
  createRecord(zoneId: string, input: DnsRecordInput): Promise<DnsRecord>;
  updateRecord(zoneId: string, recordId: string, input: DnsRecordInput): Promise<DnsRecord>;
  deleteRecord(zoneId: string, recordId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Real-client wiring (lazy - tests bypass this entirely via the route seam)
// ---------------------------------------------------------------------------

const CF_BASE = 'https://api.cloudflare.com/client/v4';

interface CfEnvelope<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
}

let realClient: CloudflareDnsClient | null = null;

export function getCloudflareClient(): CloudflareDnsClient {
  if (realClient) return realClient;
  const env = loadEnv();

  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(`${CF_BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        ...(init?.headers ?? {}),
      },
    });
    const json = (await res.json().catch(() => null)) as CfEnvelope<T> | null;
    if (!res.ok || !json || !json.success) {
      logger.error({ status: res.status, path, errors: json?.errors }, 'cloudflare_api_error');
      throw new Error('cloudflare_api_error');
    }
    return json.result;
  };

  const toRecord = (r: {
    id: string;
    type: string;
    name: string;
    content: string;
    ttl: number;
    proxied?: boolean;
  }): DnsRecord => ({
    id: r.id,
    type: r.type as DnsRecordType,
    name: r.name,
    content: r.content,
    ttl: r.ttl,
    proxied: r.proxied ?? false,
  });

  realClient = {
    async getZoneIdByName(domain) {
      const zones = await call<{ id: string; name: string }[]>(
        `/zones?name=${encodeURIComponent(domain)}`,
      );
      return zones[0]?.id ?? null;
    },
    async listRecords(zoneId) {
      const records = await call<Parameters<typeof toRecord>[0][]>(
        `/zones/${zoneId}/dns_records`,
      );
      return records.map(toRecord);
    },
    async createRecord(zoneId, input) {
      const r = await call<Parameters<typeof toRecord>[0]>(`/zones/${zoneId}/dns_records`, {
        method: 'POST',
        body: JSON.stringify({ ...input, ttl: input.ttl ?? 1 }),
      });
      return toRecord(r);
    },
    async updateRecord(zoneId, recordId, input) {
      const r = await call<Parameters<typeof toRecord>[0]>(
        `/zones/${zoneId}/dns_records/${recordId}`,
        { method: 'PUT', body: JSON.stringify({ ...input, ttl: input.ttl ?? 1 }) },
      );
      return toRecord(r);
    },
    async deleteRecord(zoneId, recordId) {
      await call<{ id: string }>(`/zones/${zoneId}/dns_records/${recordId}`, {
        method: 'DELETE',
      });
    },
  };
  return realClient;
}
