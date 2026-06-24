/**
 * Observability foundation (KWS-S9-006) - pure-function tests for the health
 * baseline + anomaly detector.
 */

import { describe, expect, it } from 'vitest';
import { computeHealthBaseline, detectAnomaly, type HealthCheck } from '../src/services/observability.js';

const ok = (latency_ms: number): HealthCheck => ({ ok: true, latency_ms });
const down = (): HealthCheck => ({ ok: false, latency_ms: null, error_type: 'timeout' });

describe('computeHealthBaseline', () => {
  it('returns a neutral baseline for no checks', () => {
    expect(computeHealthBaseline([])).toEqual({ ping_count: 0, uptime_pct: 100, p95_ms: null, avg_ms: null });
  });

  it('computes uptime %, p95 and avg over ok checks', () => {
    const checks = [ok(100), ok(120), ok(110), ok(130), down()];
    const b = computeHealthBaseline(checks);
    expect(b.ping_count).toBe(5);
    expect(b.uptime_pct).toBe(80); // 4/5
    expect(b.avg_ms).toBe(115); // (100+120+110+130)/4
    expect(b.p95_ms).toBe(130);
  });

  it('reports 0% uptime when everything is down', () => {
    const b = computeHealthBaseline([down(), down()]);
    expect(b.uptime_pct).toBe(0);
    expect(b.p95_ms).toBeNull();
  });
});

describe('detectAnomaly', () => {
  const baseline = { ping_count: 30, uptime_pct: 99, p95_ms: 150, avg_ms: 120 };

  it('does not fire with fewer than `consecutive` checks', () => {
    expect(detectAnomaly([down(), down()], baseline).anomaly).toBe(false);
  });

  it('fires downtime on 3 consecutive failures', () => {
    const r = detectAnomaly([ok(100), down(), down(), down()], baseline);
    expect(r).toMatchObject({ anomaly: true, type: 'downtime' });
  });

  it('fires latency_spike when the last 3 checks exceed 2x p95', () => {
    const r = detectAnomaly([ok(100), ok(400), ok(420), ok(500)], baseline);
    expect(r).toMatchObject({ anomaly: true, type: 'latency_spike' });
  });

  it('stays clear on healthy recent checks', () => {
    expect(detectAnomaly([ok(100), ok(120), ok(130), ok(140)], baseline).anomaly).toBe(false);
  });

  it('does not flag a latency spike without a p95 baseline', () => {
    const noBaseline = { ping_count: 0, uptime_pct: 100, p95_ms: null, avg_ms: null };
    expect(detectAnomaly([ok(9000), ok(9000), ok(9000)], noBaseline).anomaly).toBe(false);
  });
});
