/**
 * Observability foundation (KWS-S9-006).
 *
 * Extends the existing uptime pings (uptime.ts, stored in
 * client_services.metadata.uptime_checks) into structured health data: a
 * per-site baseline (uptime %, p95 / avg latency) and a lightweight anomaly
 * detector. "Foundation only" per kws_sprint_9.md - not a full observability
 * stack, and anomalies are admin-visible only (no client notification yet).
 *
 * Pure functions (computeHealthBaseline, detectAnomaly) carry the unit
 * coverage; loadSiteHealth composes them for the admin endpoint. The Helpan KWS
 * agent can read this data in Phase 2.
 */

import { getServiceClient } from '../lib/supabase.js';

export interface HealthCheck {
  ok: boolean;
  latency_ms: number | null;
  error_type?: string | null;
}

export interface HealthBaseline {
  ping_count: number;
  uptime_pct: number;     // 0..100 (one decimal)
  p95_ms: number | null;
  avg_ms: number | null;
}

/** Pure: baseline stats over a window of checks. */
export function computeHealthBaseline(checks: HealthCheck[]): HealthBaseline {
  const n = checks.length;
  if (n === 0) return { ping_count: 0, uptime_pct: 100, p95_ms: null, avg_ms: null };

  const okCount = checks.filter((c) => c.ok).length;
  const latencies = checks
    .filter((c) => c.ok && typeof c.latency_ms === 'number')
    .map((c) => c.latency_ms as number)
    .sort((a, b) => a - b);

  let p95: number | null = null;
  let avg: number | null = null;
  if (latencies.length > 0) {
    const idx = Math.min(latencies.length - 1, Math.ceil(0.95 * latencies.length) - 1);
    p95 = latencies[Math.max(0, idx)] ?? null;
    avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  }

  return {
    ping_count: n,
    uptime_pct: Math.round((okCount / n) * 1000) / 10,
    p95_ms: p95,
    avg_ms: avg,
  };
}

export type AnomalyType = 'downtime' | 'latency_spike';

export interface AnomalyResult {
  anomaly: boolean;
  type?: AnomalyType;
  detail?: string;
}

export interface AnomalyOpts {
  consecutive: number;       // how many trailing checks must agree
  latencyMultiplier: number; // spike threshold = multiplier * baseline p95
}

const DEFAULT_ANOMALY_OPTS: AnomalyOpts = { consecutive: 3, latencyMultiplier: 2 };

/**
 * Pure: flag an anomaly when the most recent `consecutive` checks are all down
 * (downtime) or all slower than `latencyMultiplier` x the baseline p95
 * (latency_spike). Needs at least `consecutive` checks to fire.
 */
export function detectAnomaly(
  checks: HealthCheck[],
  baseline: HealthBaseline,
  opts: AnomalyOpts = DEFAULT_ANOMALY_OPTS,
): AnomalyResult {
  const recent = checks.slice(-opts.consecutive);
  if (recent.length < opts.consecutive) return { anomaly: false };

  if (recent.every((c) => !c.ok)) {
    return { anomaly: true, type: 'downtime', detail: `${opts.consecutive} consecutive failed checks` };
  }

  if (baseline.p95_ms != null && baseline.p95_ms > 0) {
    const threshold = opts.latencyMultiplier * baseline.p95_ms;
    const allSlow = recent.every((c) => c.ok && typeof c.latency_ms === 'number' && (c.latency_ms as number) > threshold);
    if (allSlow) {
      return { anomaly: true, type: 'latency_spike', detail: `latency > ${opts.latencyMultiplier}x p95 (${threshold}ms) for ${opts.consecutive} checks` };
    }
  }

  return { anomaly: false };
}

export interface SiteHealthRow {
  service_id: string;
  domain: string | null;
  uptime_pct: number;
  p95_ms: number | null;
  avg_ms: number | null;
  ping_count: number;
  last_check: string | null;
  anomaly: boolean;
  anomaly_type: AnomalyType | null;
}

/**
 * Per-hosted-site health summary for the admin Site Health section. Reads the
 * uptime checks already recorded by runUptimeChecks and composes baseline +
 * anomaly. delivery_lead/admin only (route-gated).
 */
export async function loadSiteHealth(): Promise<SiteHealthRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('client_services')
    .select('id, metadata')
    .eq('service_type', 'hosting')
    .in('status', ['active', 'expiring']);
  if (error) throw error;

  return (data ?? []).map((svc) => {
    const meta = (svc.metadata ?? {}) as Record<string, unknown>;
    const checks = Array.isArray(meta.uptime_checks) ? (meta.uptime_checks as HealthCheck[]) : [];
    const baseline = computeHealthBaseline(checks);
    const anomaly = detectAnomaly(checks, baseline);
    return {
      service_id: svc.id as string,
      domain: typeof meta.domain === 'string' ? meta.domain : null,
      uptime_pct: baseline.uptime_pct,
      p95_ms: baseline.p95_ms,
      avg_ms: baseline.avg_ms,
      ping_count: baseline.ping_count,
      last_check: typeof meta.last_check === 'string' ? meta.last_check : null,
      anomaly: anomaly.anomaly,
      anomaly_type: anomaly.type ?? null,
    };
  });
}
