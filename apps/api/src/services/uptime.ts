/**
 * Uptime monitoring — lightweight self-hosted pinger.
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

interface UptimeCheck {
  ts: string;
  ok: boolean;
  latency_ms: number | null;
}

interface UptimeResult {
  service_id: string;
  domain: string;
  ok: boolean;
  latency_ms: number | null;
}

const PING_TIMEOUT_MS = 10_000;
const MAX_CHECKS = 30;

async function pingDomain(domain: string): Promise<{ ok: boolean; latency_ms: number | null }> {
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
    return { ok: res.ok || res.status < 400, latency_ms: Date.now() - start };
  } catch {
    return { ok: false, latency_ms: null };
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
    const check: UptimeCheck = { ts: new Date().toISOString(), ok: ping.ok, latency_ms: ping.latency_ms };

    // Append to uptime_checks array in metadata, keep last MAX_CHECKS
    const existing = Array.isArray(meta.uptime_checks) ? (meta.uptime_checks as UptimeCheck[]) : [];
    const updated = [...existing, check].slice(-MAX_CHECKS);
    const okCount = updated.filter((c) => c.ok).length;
    const uptimePct = updated.length > 0 ? Math.round((okCount / updated.length) * 1000) / 10 : 100;

    const newMeta = { ...meta, uptime_checks: updated, uptime_pct: uptimePct, last_check: check.ts };

    const { error: uErr } = await sb
      .from('client_services')
      .update({ metadata: newMeta })
      .eq('id', svc.id);
    if (uErr) {
      logger.error({ err: uErr, service_id: svc.id }, 'uptime_check_update_failed');
    }

    results.push({ service_id: svc.id, domain, ok: ping.ok, latency_ms: ping.latency_ms });
  }

  return results;
}
