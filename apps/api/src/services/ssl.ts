/**
 * SSL certificate tracking (KWS-S6-003).
 *
 * For each client_service that fronts a domain, probe the TLS certificate's
 * expiry, classify it (valid / expiring / expired), and persist the result on
 * the row. The admin Health surface and the uptime panel read ssl_state to flag
 * certificates that need attention.
 *
 * Mirrors uptime.ts in shape: a thin DB+network runner around pure logic. The
 * network probe is injectable (setCertProbeForTest) so tests never open a
 * socket; classifySslState is pure and carries the unit coverage.
 */

import tls from 'node:tls';
import { getServiceClient } from '../lib/supabase.js';
import { writeAuditEvent } from './audit.js';
import { logger } from '../lib/logger.js';

export type SslState = 'unknown' | 'valid' | 'expiring' | 'expired';

const DEFAULT_EXPIRING_DAYS = 30;
const PROBE_TIMEOUT_MS = 8_000;

/** Pure: classify a certificate expiry into an SSL state. */
export function classifySslState(
  expiryAt: Date | null,
  now: Date = new Date(),
  expiringWithinDays = DEFAULT_EXPIRING_DAYS,
): SslState {
  if (!expiryAt || Number.isNaN(expiryAt.getTime())) return 'unknown';
  const ms = expiryAt.getTime() - now.getTime();
  if (ms <= 0) return 'expired';
  if (ms <= expiringWithinDays * 24 * 60 * 60 * 1000) return 'expiring';
  return 'valid';
}

/** Whole days until a date (floored). Negative once past. */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.floor((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/** Strip protocol, path and port to a bare hostname for the TLS probe. */
export function hostnameFromDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

export type CertProbe = (host: string) => Promise<Date | null>;

let injectedProbe: CertProbe | null = null;
export function setCertProbeForTest(p: CertProbe | null): void {
  injectedProbe = p;
}

const defaultProbe: CertProbe = (host) =>
  new Promise((resolve) => {
    try {
      const socket = tls.connect(
        { host, port: 443, servername: host, timeout: PROBE_TIMEOUT_MS, rejectUnauthorized: false },
        () => {
          const cert = socket.getPeerCertificate();
          socket.end();
          if (cert && cert.valid_to) resolve(new Date(cert.valid_to));
          else resolve(null);
        },
      );
      socket.on('error', () => resolve(null));
      socket.on('timeout', () => {
        socket.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });

export interface SslCheckResult {
  service_id: string;
  domain: string;
  ssl_state: SslState;
  ssl_expiry_at: string | null;
}

/**
 * Probe + persist SSL state for every domain-fronting client_service. Writes an
 * audit event whenever a certificate is expiring or already expired so the
 * admin trail captures it. Never throws on a single-service failure.
 */
export async function runSslChecks(now: Date = new Date()): Promise<SslCheckResult[]> {
  const sb = getServiceClient();
  const probe = injectedProbe ?? defaultProbe;

  const { data: services, error } = await sb
    .from('client_services')
    .select('id, client_id, service_type, metadata')
    .in('service_type', ['hosting', 'domain', 'ssl'])
    .in('status', ['active', 'expiring']);
  if (error) throw error;

  const results: SslCheckResult[] = [];

  for (const svc of services ?? []) {
    const meta = (svc.metadata ?? {}) as Record<string, unknown>;
    const domain = typeof meta.domain === 'string' ? meta.domain : '';
    if (!domain) continue;

    const expiry = await probe(hostnameFromDomain(domain));
    const state = classifySslState(expiry, now);

    const { error: uErr } = await sb
      .from('client_services')
      .update({
        ssl_state: state,
        ssl_expiry_at: expiry ? expiry.toISOString() : null,
        ssl_last_checked_at: now.toISOString(),
      })
      .eq('id', svc.id);
    if (uErr) {
      logger.error({ err: uErr, service_id: svc.id }, 'ssl_check_update_failed');
      continue;
    }

    if (state === 'expiring' || state === 'expired') {
      await writeAuditEvent({
        actor_id: null,
        actor_role: null,
        event_type: state === 'expired' ? 'ssl_certificate_expired' : 'ssl_certificate_expiring',
        entity_type: 'client_service',
        entity_id: svc.id,
        payload_snapshot: { domain, ssl_state: state, expiry_at: expiry?.toISOString() ?? null },
      });
    }

    results.push({
      service_id: svc.id,
      domain,
      ssl_state: state,
      ssl_expiry_at: expiry ? expiry.toISOString() : null,
    });
  }

  return results;
}
