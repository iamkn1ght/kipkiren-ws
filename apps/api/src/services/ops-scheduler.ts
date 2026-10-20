/**
 * Background monitoring jobs. These existed as admin "run now" endpoints only,
 * so the care promises (uptime checks, SSL and domain watch, SLA breaches)
 * depended on someone pressing a button. This runs them on a timer inside the
 * API process:
 *
 *   - uptime checks        every 5 minutes  (studio emailed on a new anomaly)
 *   - SLA breach scan      every 15 minutes (SMS once Todoku is live)
 *   - SSL certificate scan every 24 hours
 *   - domain-expiry scan   every 24 hours
 *
 * Every job is idempotent, never throws out of the timer, and is skipped under
 * NODE_ENV=test. Timers are unref'd so they never hold the process open.
 */

import { logger } from '../lib/logger.js';
import { runUptimeChecks } from './uptime.js';
import { runSlaBreachAlerts } from './sla-alerts.js';
import { runSslChecks } from './ssl.js';
import { runDomainExpiryAlerts } from './domain-expiry.js';

const MIN = 60_000;

interface OpsJob { name: string; everyMs: number; firstAfterMs: number; run: () => Promise<unknown> }

export const OPS_JOBS: readonly OpsJob[] = [
  { name: 'uptime_checks', everyMs: 5 * MIN, firstAfterMs: 2 * MIN, run: () => runUptimeChecks() },
  { name: 'sla_breach_scan', everyMs: 15 * MIN, firstAfterMs: 3 * MIN, run: () => runSlaBreachAlerts() },
  { name: 'ssl_checks', everyMs: 24 * 60 * MIN, firstAfterMs: 5 * MIN, run: () => runSslChecks() },
  { name: 'domain_expiry_scan', everyMs: 24 * 60 * MIN, firstAfterMs: 7 * MIN, run: () => runDomainExpiryAlerts() },
];

const timers: NodeJS.Timeout[] = [];
const running = new Set<string>();

export function startOpsScheduler(): void {
  if (timers.length || process.env.NODE_ENV === 'test') return;
  for (const job of OPS_JOBS) {
    const tick = () => {
      if (running.has(job.name)) return; // never overlap a slow run
      running.add(job.name);
      Promise.resolve()
        .then(() => job.run())
        .catch((err) => logger.error({ err, job: job.name }, 'ops_job_failed'))
        .finally(() => running.delete(job.name));
    };
    const first = setTimeout(tick, job.firstAfterMs);
    first.unref();
    const every = setInterval(tick, job.everyMs);
    every.unref();
    timers.push(first, every);
  }
  logger.info({ jobs: OPS_JOBS.map((j) => j.name) }, 'ops_scheduler_started');
}
