/**
 * Uptime monitoring - lightweight self-hosted pinger.
 *
 * For each client service of type 'hosting', checks if the domain
 * responds to an HTTP HEAD request. Stores results in the service's
 * metadata JSONB field under `uptime_checks`.
 *
 * Design:
 *   - Called via POST /v1/admin/uptime-check (admin only, or future cron)
 *   - Pings each hosting service's metadata.domain with a 10s timeout
 *   - Appends { ts, ok, latency_ms } to metadata.uptime_checks (last 30 entries)
 *   - Computes uptime_pct from the last 30 checks
 *
 * This is a lightweight MVP solution. For production scale, swap this
 * with a Better Stack / Uptime Robot integration when an account is set up.
 */

import { getServiceClient } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { writeAuditEvent } from './audit.js';
import { computeHealthBaseline, detectAnomaly } from './observability.js';

type UptimeErrorType = 'timeout' | 'http_error' | 'network_error' | null;

interface UptimeCheck {
  ts: string;
  ok: boolean;
  latency_ms: number | null;
  error_type?: UptimeErrorType;
}

interface UptimeResult {
  service_id: string;
  domain: string;
  ok: boolean;
  latency_ms: number | null;
}

const PING_TIMEOUT_MS = 10_000;
const MAX_CHECKS = 30;

async function pingDomain(domain: string): Promise<{ ok: boolean; latency_ms: number | null; error_type: UptimeErrorType }> {
  const url = domain.startsWith('http') ? domain : `https://${domain}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    const ok = res.ok || res.status < 400;
    return { ok, latency_ms: Date.now() - start, error_type: ok ? null : 'http_error' };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { ok: false, latency_ms: null, error_type: aborted ? 'timeout' : 'network_error' };
  }
}

/**
 * Run uptime checks on all hosting services that have a domain in metadata.
 * Returns the results for each service checked.
 */
export async function runUptimeChecks(): Promise<UptimeResult[]> {
  const sb = getServiceClient();

  const { data: services, error } = await sb
    .from('client_services')
    .select('id, metadata')
    .eq('service_type', 'hosting')
    .in('status', ['active', 'expiring']);
  if (error) throw error;

  const results: UptimeResult[] = [];

  for (const svc of services ?? []) {
    const meta = svc.metadata as Record<string, unknown>;
    const domain = meta.domain as string | undefined;
    if (!domain) continue;

    const ping = await pingDomain(domain);
    const check: UptimeCheck = { ts: new Date().toISOString(), ok: ping.ok, latency_ms: ping.latency_ms, error_type: ping.error_type };

    // Append to uptime_checks array in metadata, keep last MAX_CHECKS
    const existing = Array.isArray(meta.uptime_checks) ? (meta.uptime_checks as UptimeCheck[]) : [];
    const updated = [...existing, check].slice(-MAX_CHECKS);
    const baseline = computeHealthBaseline(updated);

    // S9-006: anomaly detection (admin-visible only). Audit on transition INTO
    // an anomaly so the trail captures the onset without re-firing each ping.
    const anomaly = detectAnomaly(updated, baseline);
    const prev = (meta.health_anomaly ?? {}) as { active?: boolean; since?: string };
    const wasActive = prev.active === true;
    const health_anomaly = anomaly.anomaly
      ? { active: true, type: anomaly.type ?? null, detail: anomaly.detail ?? null, since: wasActive ? prev.since ?? check.ts : check.ts }
      : { active: false };

    const newMeta = { ...meta, uptime_checks: updated, uptime_pct: baseline.uptime_pct, last_check: check.ts, health_anomaly };

    const { error: uErr } = await sb
      .from('client_services')
      .update({ metadata: newMeta })
      .eq('id', svc.id);
    if (uErr) {
      logger.error({ err: uErr, service_id: svc.id }, 'uptime_check_update_failed');
    }

    if (anomaly.anomaly && !wasActive) {
      await writeAuditEvent({
        actor_id: null,
        actor_role: null,
        event_type: 'site_health_anomaly_detected',
        entity_type: 'client_service',
        entity_id: svc.id,
        payload_snapshot: { domain, type: anomaly.type ?? null, detail: anomaly.detail ?? null, uptime_pct: baseline.uptime_pct },
      });
    }

    results.push({ service_id: svc.id, domain, ok: ping.ok, latency_ms: ping.latency_ms });
  }

  return results;
}
