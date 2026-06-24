/**
 * Platform-rails health - KWS-side view.
 *
 * KWS is an APP, not a rail, so it cannot see a rail's internal dashboards
 * (dead-letter queues, per-vendor splits, etc.). What it CAN report honestly:
 *   - Throughput that actually flows THROUGH KWS - Kipkiren Pay + Paystack
 *     payments (from `payments`), AI decomposition usage and Todoku sends
 *     (from `audit_log`). All derived from KWS's own tables.
 *   - Each rail's configuration status (is the Tier-2 env present).
 *   - Optional live reachability ping of a rail's public /v1/health (only the
 *     rails KWS has a base URL for: Kipkiren Pay, Todoku).
 *
 * This powers the admin "Rails" panel (mirrors the Chapaa CTO rail-monitoring
 * section, scoped to what KWS legitimately knows).
 */

import { isFeatureConfigured, loadEnv } from '../config/env.js';
import { getServiceClient } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

export type RailStatus = 'live' | 'configured' | 'pending' | 'degraded' | 'unconfigured';
export interface RailMetric { label: string; value: string; tone?: 'ok' | 'warn' | 'mut'; }
export interface RailHealth {
  key: string;
  name: string;
  purpose: string;
  configured: boolean;
  status: RailStatus;
  reachable: boolean | null;   // null = not probed / no URL
  latency_ms: number | null;
  metrics: RailMetric[];
  note?: string;
}

type Gateway = 'mpesa' | 'paystack';

const sinceISO = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const pct = (num: number, den: number) => (den === 0 ? '-' : `${Math.round((num / den) * 100)}%`);
const kes = (n: number) => `KES ${n.toLocaleString()}`;

async function countPayments(gateway: Gateway, f: { status?: string; sinceH?: number } = {}): Promise<number> {
  const sb = getServiceClient();
  let q = sb.from('payments').select('id', { count: 'exact', head: true }).eq('gateway', gateway);
  if (f.status) q = q.eq('status', f.status);
  if (f.sinceH) q = q.gte('created_at', sinceISO(f.sinceH));
  const { count, error } = await q;
  if (error) { logger.warn({ err: error }, 'rails_payment_count_failed'); return 0; }
  return count ?? 0;
}

async function confirmedVolume(gateway: Gateway): Promise<number> {
  const sb = getServiceClient();
  const { data, error } = await sb.from('payments').select('amount_kes').eq('gateway', gateway).eq('status', 'confirmed');
  if (error || !data) return 0;
  return (data as { amount_kes: number }[]).reduce((s, r) => s + (r.amount_kes ?? 0), 0);
}

async function countAudit(eventType: string): Promise<number> {
  const sb = getServiceClient();
  const { count, error } = await sb.from('audit_log').select('id', { count: 'exact', head: true }).eq('event_type', eventType);
  if (error) return 0;
  return count ?? 0;
}

async function avgConfidence(): Promise<number | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('proformas').select('ai_confidence_score')
    .not('ai_confidence_score', 'is', null)
    .order('created_at', { ascending: false }).limit(200);
  if (error || !data || data.length === 0) return null;
  const vals = (data as { ai_confidence_score: number }[]).map((r) => Number(r.ai_confidence_score)).filter((n) => !Number.isNaN(n));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

async function pingHealth(base: string): Promise<{ reachable: boolean; latency_ms: number | null }> {
  if (!base) return { reachable: false, latency_ms: null };
  const url = `${base.replace(/\/+$/, '')}/v1/health`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return { reachable: res.ok, latency_ms: Date.now() - start };
  } catch {
    return { reachable: false, latency_ms: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function loadRailsHealth(probe: boolean): Promise<{ rails: RailHealth[]; generated_at: string }> {
  const env = loadEnv();

  const [
    mTotal, mConf, mPend, mFail, m24h, mVol,
    pTotal, pConf, pPend, pFail, p24h, pVol,
    aiOk, aiFail, conf, tdSent, tdFail,
  ] = await Promise.all([
    countPayments('mpesa'), countPayments('mpesa', { status: 'confirmed' }), countPayments('mpesa', { status: 'pending' }),
    countPayments('mpesa', { status: 'failed' }), countPayments('mpesa', { sinceH: 24 }), confirmedVolume('mpesa'),
    countPayments('paystack'), countPayments('paystack', { status: 'confirmed' }), countPayments('paystack', { status: 'pending' }),
    countPayments('paystack', { status: 'failed' }), countPayments('paystack', { sinceH: 24 }), confirmedVolume('paystack'),
    countAudit('ai_decomposition_completed'), countAudit('ai_decomposition_failed'), avgConfidence(),
    countAudit('todoku_message_sent'), countAudit('todoku_delivery_failed'),
  ]);

  const kpCfg = isFeatureConfigured('kipkiren_pay');
  const psCfg = isFeatureConfigured('paystack');
  const aiCfg = isFeatureConfigured('anthropic');
  const tdCfg = isFeatureConfigured('todoku');

  let kpPing: { reachable: boolean | null; latency_ms: number | null } = { reachable: null, latency_ms: null };
  let tdPing: { reachable: boolean | null; latency_ms: number | null } = { reachable: null, latency_ms: null };
  if (probe) {
    const [a, b] = await Promise.all([pingHealth(env.KIPKIREN_PAY_BASE_URL), pingHealth(env.TODOKU_API_BASE)]);
    kpPing = a; tdPing = b;
  }

  const payStatus = (cfg: boolean, total: number, ping: { reachable: boolean | null }): RailStatus => {
    if (!cfg) return 'unconfigured';
    if (probe && ping.reachable === false) return 'degraded';
    return total > 0 ? 'live' : 'configured';
  };

  const rails: RailHealth[] = [
    {
      key: 'kipkiren_pay', name: 'Kipkiren Pay', purpose: 'M-Pesa payments via LipaPlus (ADR-KWS-005)',
      configured: kpCfg, status: payStatus(kpCfg, mTotal, kpPing), reachable: kpPing.reachable, latency_ms: kpPing.latency_ms,
      metrics: [
        { label: 'Processed', value: String(mTotal) },
        { label: 'Confirmed', value: String(mConf), tone: 'ok' },
        { label: 'Pending', value: String(mPend), tone: mPend > 0 ? 'warn' : 'mut' },
        { label: 'Failed', value: String(mFail), tone: mFail > 0 ? 'warn' : 'mut' },
        { label: 'Success rate', value: pct(mConf, mConf + mFail) },
        { label: 'Confirmed volume', value: kes(mVol) },
        { label: 'Last 24h', value: String(m24h) },
      ],
      ...(kpCfg ? {} : { note: 'Tier-2 credentials not set - payments 503 until configured.' }),
    },
    {
      key: 'paystack', name: 'Paystack', purpose: 'Card payments (direct)',
      configured: psCfg, status: payStatus(psCfg, pTotal, { reachable: null }), reachable: null, latency_ms: null,
      metrics: [
        { label: 'Processed', value: String(pTotal) },
        { label: 'Confirmed', value: String(pConf), tone: 'ok' },
        { label: 'Pending', value: String(pPend), tone: pPend > 0 ? 'warn' : 'mut' },
        { label: 'Failed', value: String(pFail), tone: pFail > 0 ? 'warn' : 'mut' },
        { label: 'Success rate', value: pct(pConf, pConf + pFail) },
        { label: 'Confirmed volume', value: kes(pVol) },
        { label: 'Last 24h', value: String(p24h) },
      ],
      ...(psCfg ? {} : { note: 'Tier-2 credentials not set.' }),
    },
    {
      key: 'anthropic', name: 'Anthropic · AI decomposition', purpose: 'Ticket → proforma line-item decomposition',
      configured: aiCfg, status: !aiCfg ? 'unconfigured' : aiOk + aiFail > 0 ? 'live' : 'configured', reachable: null, latency_ms: null,
      metrics: [
        { label: 'Decompositions', value: String(aiOk), tone: 'ok' },
        { label: 'Failed', value: String(aiFail), tone: aiFail > 0 ? 'warn' : 'mut' },
        { label: 'Success rate', value: pct(aiOk, aiOk + aiFail) },
        { label: 'Avg confidence', value: conf === null ? '-' : conf.toFixed(2) },
      ],
      ...(aiCfg ? {} : { note: 'ANTHROPIC_API_KEY not set - decomposition 503 until configured.' }),
    },
    {
      key: 'todoku', name: 'Todoku · SMS', purpose: 'Transactional SMS on 5 KWS events (S9-003)',
      configured: tdCfg, status: !tdCfg ? 'pending' : probe && tdPing.reachable === false ? 'degraded' : tdSent > 0 ? 'live' : 'configured',
      reachable: tdPing.reachable, latency_ms: tdPing.latency_ms,
      metrics: [
        { label: 'Sent', value: String(tdSent), tone: 'ok' },
        { label: 'Failed', value: String(tdFail), tone: tdFail > 0 ? 'warn' : 'mut' },
        { label: 'Delivery rate', value: pct(tdSent, tdSent + tdFail) },
      ],
      ...(tdCfg ? {} : { note: 'Scaffolded - awaiting Todoku tenant creds + template ULIDs (Sprint 9).' }),
    },
    {
      key: 'helpan', name: 'Helpan KWS · AI agent', purpose: 'Proforma enrichment + SLA early warning (Phase 1)',
      configured: false, status: 'pending', reachable: null, latency_ms: null,
      metrics: [{ label: 'Phase', value: '1 · enrichment' }, { label: 'Agent', value: 'helpan-kws-v1' }],
      note: 'Sprint 9 - agent admitted to the registry; service JWT + consumption not wired yet.',
    },
  ];

  return { rails, generated_at: new Date().toISOString() };
}
