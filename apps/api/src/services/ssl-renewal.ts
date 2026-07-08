/**
 * Autonomous SSL renewal (KWS-S9-005).
 *
 * When a client_service's TLS certificate approaches expiry, an agent (Helpan
 * KWS) may autonomously renew it - but only inside a tight safety envelope. This
 * module is the decision + execution core for that; it sits directly on top of
 * the S9-004 execution guard (agent-execution.ts) and the SSL classification
 * from S6-003 (ssl.ts).
 *
 * Two layers:
 *   1. PURE decision logic - `planSslRenewal` (should we attempt a renewal for
 *      this certificate, given its state, a renewal policy, and prior attempts?)
 *      and `resolveExecution` (given a plan and the S9-004 guard result, do we
 *      execute, escalate to a human, or skip?). Both are pure and unit-tested;
 *      they carry the safety logic.
 *   2. The `runAutonomousSslRenewals` orchestrator - reads due certificates,
 *      runs the pure logic, and (only when the plan says execute AND the guard
 *      allows) invokes an injectable `SslRenewalExecutor`, recording every
 *      outcome to the append-only agent_executions ledger.
 *
 * Default-safe by construction:
 *   - AGENT_DNS_EXECUTION_ENABLED is OFF by default, so `planSslRenewal` can
 *     never reach a live executor in normal operation.
 *   - The S9-004 guard additionally requires an approved proforma whose content
 *     hash still matches (the client paid for exactly this work, unchanged).
 *   - Any ambiguity resolves to `escalate` (hand to a human), never to a silent
 *     execution.
 *
 * The live executor (a Cloudflare certificate-pack reissue via the managed edge,
 * or a Helpan-driven ACME order) is intentionally NOT wired: it needs the
 * `helpan-kws-service` JWT caller (KWS-S9-002), blocked on the Identiti signing
 * key + operator handover. Until then the default executor throws loudly rather
 * than fake a renewal, and the feature flag keeps the whole path dormant.
 */

import { getServiceClient } from '../lib/supabase.js';
import { loadEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';
import {
  assertExecutionPreconditions,
  recordAgentExecution,
  type ExecutionPreconditions,
  type GuardResult,
} from './agent-execution.js';
import { classifySslState, daysUntil, hostnameFromDomain, type SslState } from './ssl.js';

const RENEWAL_AGENT_ID = 'helpan-kws-v1';
const RENEWAL_ACTION = 'ssl_renew';

// ---------------------------------------------------------------------------
// Renewal policy
// ---------------------------------------------------------------------------

export interface SslRenewalPolicy {
  /** Begin attempting renewal once the cert is within this many days of expiry. */
  renewWithinDays: number;
  /** Minimum hours between autonomous attempts for the same certificate. */
  cooldownHours: number;
  /** Give up and escalate to a human after this many prior attempts. */
  maxAttempts: number;
}

export const DEFAULT_RENEWAL_POLICY: SslRenewalPolicy = {
  renewWithinDays: 21,
  cooldownHours: 12,
  maxAttempts: 3,
};

// ---------------------------------------------------------------------------
// Pure decision core
// ---------------------------------------------------------------------------

export type SslRenewalAction = 'renew' | 'skip' | 'escalate';

export interface SslRenewalContext {
  /** Classified SSL state (from classifySslState). */
  sslState: SslState;
  /** Whole days until expiry; negative once expired; null if unknown. */
  daysUntilExpiry: number | null;
  /** Prior autonomous renewal attempts recorded for this certificate. */
  attemptsSoFar: number;
  /** Hours since the last attempt; null if never attempted. */
  hoursSinceLastAttempt: number | null;
  /** Whether the certificate is one KWS can actually renew (our managed zone). */
  managedByPlatform: boolean;
}

export interface SslRenewalPlan {
  action: SslRenewalAction;
  reason: string;
}

/**
 * Pure: decide whether to attempt renewal for a single certificate. Ordered
 * most-decisive-first so the returned reason is stable and auditable. Anything
 * we cannot confidently act on resolves to `skip` (benign) or `escalate` (needs
 * a human) - never a bare "renew" on incomplete facts.
 */
export function planSslRenewal(
  ctx: SslRenewalContext,
  policy: SslRenewalPolicy = DEFAULT_RENEWAL_POLICY,
): SslRenewalPlan {
  // Not probed yet - let the SSL check run first, decide next pass.
  if (ctx.sslState === 'unknown' || ctx.daysUntilExpiry === null) {
    return { action: 'skip', reason: 'state_unknown' };
  }

  const due =
    ctx.sslState === 'expired' || ctx.daysUntilExpiry <= policy.renewWithinDays;
  if (!due) {
    return { action: 'skip', reason: 'not_due' };
  }

  // Due for renewal, but we don't control this certificate - a human must act.
  if (!ctx.managedByPlatform) {
    return { action: 'escalate', reason: 'not_platform_managed' };
  }

  // Repeated autonomous attempts have not fixed it - stop and hand off.
  if (ctx.attemptsSoFar >= policy.maxAttempts) {
    return { action: 'escalate', reason: 'max_attempts_exhausted' };
  }

  // Back off between attempts so a failing renewal is not hammered.
  if (
    ctx.hoursSinceLastAttempt !== null &&
    ctx.hoursSinceLastAttempt < policy.cooldownHours
  ) {
    return { action: 'skip', reason: 'in_cooldown' };
  }

  return {
    action: 'renew',
    reason: ctx.sslState === 'expired' ? 'expired_renew_now' : 'within_renewal_window',
  };
}

export type RenewalDisposition =
  | { kind: 'skip'; reason: string }
  | { kind: 'escalate'; reason: string }
  | { kind: 'execute' };

/**
 * Pure: compose the S9-005 plan with the S9-004 execution guard. A plan may say
 * "renew", but the guard is the final interlock - if it refuses, the renewal is
 * escalated to a human (tagged with the guard reason), never executed. This is
 * the single place the two safety layers meet.
 */
export function resolveExecution(plan: SslRenewalPlan, guard: GuardResult): RenewalDisposition {
  if (plan.action === 'skip') return { kind: 'skip', reason: plan.reason };
  if (plan.action === 'escalate') return { kind: 'escalate', reason: plan.reason };
  // plan.action === 'renew'
  if (!guard.allowed) return { kind: 'escalate', reason: `guard_${guard.reason}` };
  return { kind: 'execute' };
}

// ---------------------------------------------------------------------------
// Executor adapter (live caller isolated here)
// ---------------------------------------------------------------------------

export interface SslRenewalExecutor {
  /**
   * Trigger reissue/renewal of the TLS certificate for a domain. Resolves with
   * the new expiry (if the provider reports one) on success; throws on failure
   * so the orchestrator records a `failed` execution and backs off.
   */
  renew(domain: string): Promise<{ newExpiryAt: Date | null }>;
}

let injectedExecutor: SslRenewalExecutor | null = null;

/** Test seam - inject a fake executor so tests never touch a provider. */
export function setSslRenewalExecutorForTest(e: SslRenewalExecutor | null): void {
  injectedExecutor = e;
}

function getExecutor(): SslRenewalExecutor {
  if (injectedExecutor) return injectedExecutor;
  return {
    async renew() {
      // The live renewal path is wired when the helpan-kws-service caller lands
      // (KWS-S9-002). Until then the feature flag keeps this unreachable; if it
      // is somehow reached, fail loudly - never fake a certificate renewal.
      throw new Error('ssl_renewal_executor_not_wired');
    },
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface SslRenewalRunResult {
  service_id: string;
  domain: string;
  action: SslRenewalAction;
  disposition: RenewalDisposition['kind'];
  reason?: string;
}

export interface SslRenewalRunSummary {
  enabled: boolean;
  scanned: number;
  executed: number;
  failed: number;
  escalated: number;
  skipped: number;
  results: SslRenewalRunResult[];
}

interface ServiceRow {
  id: string;
  client_id: string;
  metadata: Record<string, unknown> | null;
  ssl_state: SslState | null;
  ssl_expiry_at: string | null;
}

interface PriorExec {
  created_at: string;
  params_snapshot: Record<string, unknown> | null;
}

/** Best-effort guard facts for a service's client. Defaults to deny on doubt. */
async function loadGuardFacts(
  sb: ReturnType<typeof getServiceClient>,
  clientId: string,
  featureEnabled: boolean,
): Promise<ExecutionPreconditions> {
  const deny: ExecutionPreconditions = {
    featureEnabled,
    hasApprovedProforma: false,
    dispatchedHash: null,
    approvalHash: null,
  };
  try {
    // Most recent approved proforma for this client; the renewal of a service the
    // client already pays for is covered by its provisioning proforma. If we
    // cannot resolve one confidently, the guard denies and the cert escalates.
    const { data, error } = await sb
      .from('proforma_approvals')
      .select('content_hash_at_approval, proformas!inner(content_hash, client_id)')
      .eq('proformas.client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return deny;
    const approvalHash = (data as Record<string, unknown>).content_hash_at_approval;
    const proforma = (data as Record<string, unknown>).proformas as
      | { content_hash?: string }
      | undefined;
    return {
      featureEnabled,
      hasApprovedProforma: true,
      dispatchedHash: typeof proforma?.content_hash === 'string' ? proforma.content_hash : null,
      approvalHash: typeof approvalHash === 'string' ? approvalHash : null,
    };
  } catch {
    return deny;
  }
}

/**
 * Scan due certificates and autonomously renew the ones that pass both the
 * S9-005 renewal policy and the S9-004 execution guard. Resilient: a failure on
 * one service never aborts the run, and the whole thing is inert while the
 * feature flag is off (the default) - it then reports plans without executing.
 */
export async function runAutonomousSslRenewals(
  now: Date = new Date(),
  policy: SslRenewalPolicy = DEFAULT_RENEWAL_POLICY,
): Promise<SslRenewalRunSummary> {
  const env = loadEnv();
  const featureEnabled = env.AGENT_DNS_EXECUTION_ENABLED;
  const sb = getServiceClient();
  const executor = getExecutor();

  const summary: SslRenewalRunSummary = {
    enabled: featureEnabled,
    scanned: 0,
    executed: 0,
    failed: 0,
    escalated: 0,
    skipped: 0,
    results: [],
  };

  // Certificates worth looking at: anything not already known-valid.
  const { data: services, error } = await sb
    .from('client_services')
    .select('id, client_id, metadata, ssl_state, ssl_expiry_at')
    .in('service_type', ['hosting', 'domain', 'ssl'])
    .in('status', ['active', 'expiring']);
  if (error) throw error;

  // Prior ssl_renew attempts, for cooldown + attempt counting. Best-effort.
  const priorByService = new Map<string, PriorExec[]>();
  try {
    const { data: execs } = await sb
      .from('agent_executions')
      .select('created_at, params_snapshot')
      .eq('action', RENEWAL_ACTION)
      .order('created_at', { ascending: false });
    for (const e of (execs ?? []) as PriorExec[]) {
      const sid = (e.params_snapshot as Record<string, unknown> | null)?.['service_id'];
      if (typeof sid === 'string') {
        const list = priorByService.get(sid) ?? [];
        list.push(e);
        priorByService.set(sid, list);
      }
    }
  } catch {
    /* ledger unavailable (pre-migration) - treat as no prior attempts */
  }

  for (const svc of (services ?? []) as ServiceRow[]) {
    const meta = (svc.metadata ?? {}) as Record<string, unknown>;
    const domain = typeof meta['domain'] === 'string' ? meta['domain'] : '';
    if (!domain) continue;

    summary.scanned += 1;

    const expiry = svc.ssl_expiry_at ? new Date(svc.ssl_expiry_at) : null;
    const state: SslState = svc.ssl_state ?? classifySslState(expiry, now);
    const prior = priorByService.get(svc.id) ?? [];
    const lastAttempt = prior[0] ? new Date(prior[0].created_at) : null;

    const ctx: SslRenewalContext = {
      sslState: state,
      daysUntilExpiry: expiry ? daysUntil(expiry, now) : null,
      attemptsSoFar: prior.length,
      hoursSinceLastAttempt: lastAttempt
        ? (now.getTime() - lastAttempt.getTime()) / (60 * 60 * 1000)
        : null,
      // Metadata may flag an externally-managed cert; default to platform-managed.
      managedByPlatform: meta['ssl_external'] !== true,
    };

    const plan = planSslRenewal(ctx, policy);
    const guard = plan.action === 'renew'
      ? assertExecutionPreconditions(await loadGuardFacts(sb, svc.client_id, featureEnabled))
      : ({ allowed: false, reason: 'not_evaluated' } as GuardResult);
    const disposition = resolveExecution(plan, guard);

    const result: SslRenewalRunResult = {
      service_id: svc.id,
      domain,
      action: plan.action,
      disposition: disposition.kind,
      ...(disposition.kind !== 'execute' ? { reason: disposition.reason } : {}),
    };

    if (disposition.kind === 'skip') {
      summary.skipped += 1;
      summary.results.push(result);
      continue;
    }

    if (disposition.kind === 'escalate') {
      summary.escalated += 1;
      await recordAgentExecution({
        agent_id: RENEWAL_AGENT_ID,
        action: RENEWAL_ACTION,
        status: 'escalated',
        params_snapshot: { service_id: svc.id, domain, reason: disposition.reason },
        before_state_snapshot: { ssl_state: state, expiry_at: svc.ssl_expiry_at },
      });
      summary.results.push(result);
      continue;
    }

    // disposition.kind === 'execute'
    await recordAgentExecution({
      agent_id: RENEWAL_AGENT_ID,
      action: RENEWAL_ACTION,
      status: 'started',
      params_snapshot: { service_id: svc.id, domain },
      before_state_snapshot: { ssl_state: state, expiry_at: svc.ssl_expiry_at },
    });

    try {
      const { newExpiryAt } = await executor.renew(hostnameFromDomain(domain));
      summary.executed += 1;
      await recordAgentExecution({
        agent_id: RENEWAL_AGENT_ID,
        action: RENEWAL_ACTION,
        status: 'complete',
        params_snapshot: { service_id: svc.id, domain },
        after_state_snapshot: { ssl_expiry_at: newExpiryAt ? newExpiryAt.toISOString() : null },
      });
    } catch (err) {
      summary.failed += 1;
      logger.error({ err, service_id: svc.id, domain }, 'ssl_autonomous_renewal_failed');
      await recordAgentExecution({
        agent_id: RENEWAL_AGENT_ID,
        action: RENEWAL_ACTION,
        status: 'failed',
        params_snapshot: { service_id: svc.id, domain },
        error: err instanceof Error ? err.message : String(err),
      });
    }
    summary.results.push(result);
  }

  return summary;
}
