/**
 * Domain expiry alerts (KWS-S6-005).
 *
 * Scans domain client_services for an upcoming `renewal_at` and fires the
 * Todoku SMS templates kws_domain_expiry_30d (30-day band) and
 * kws_domain_expiry_7d (7-day band). The SMS send is gated + fire-and-forget
 * (notifications.ts): until the Todoku creds + template ULIDs land it returns
 * feature_unavailable / template_not_ready and nothing is marked as sent.
 *
 * Per-band idempotency: a band is only fired once per service. The runner reads
 * the already-sent bands from metadata.domain_alerts and, on a confirmed send,
 * writes the band back. dueExpiryAlerts is pure and carries the unit coverage.
 */

import { getServiceClient } from '../lib/supabase.js';
import { sendSms } from './notifications.js';
import { logger } from '../lib/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ExpiryTemplate = 'kws_domain_expiry_30d' | 'kws_domain_expiry_7d';

export interface ExpiryServiceInput {
  service_id: string;
  client_id: string;
  domain: string;
  renewal_at: string | null;
  msisdn?: string;
  /** Bands already alerted (from metadata.domain_alerts). */
  alerted?: { d30?: boolean; d7?: boolean };
}

export interface ExpiryAlert {
  service_id: string;
  client_id: string;
  domain: string;
  template: ExpiryTemplate;
  band: 'd30' | 'd7';
  days_left: number;
  msisdn?: string;
}

/**
 * Pure: decide which expiry alerts are due. Fires the 7-day band when a renewal
 * is 0-7 days out, the 30-day band when it is 8-30 days out. A band already in
 * `alerted` is skipped (idempotent). Past-due or undated services produce no
 * upcoming-expiry alert.
 */
export function dueExpiryAlerts(services: ExpiryServiceInput[], now: Date = new Date()): ExpiryAlert[] {
  const out: ExpiryAlert[] = [];
  for (const s of services) {
    if (!s.renewal_at) continue;
    const t = Date.parse(s.renewal_at);
    if (Number.isNaN(t)) continue;
    const daysLeft = Math.floor((t - now.getTime()) / DAY_MS);
    if (daysLeft < 0 || daysLeft > 30) continue;

    const base = { service_id: s.service_id, client_id: s.client_id, domain: s.domain, days_left: daysLeft, ...(s.msisdn ? { msisdn: s.msisdn } : {}) };
    if (daysLeft <= 7) {
      if (!s.alerted?.d7) out.push({ ...base, template: 'kws_domain_expiry_7d', band: 'd7' });
    } else if (!s.alerted?.d30) {
      out.push({ ...base, template: 'kws_domain_expiry_30d', band: 'd30' });
    }
  }
  return out;
}

export interface DomainExpiryScanResult {
  scanned: number;
  due: number;
  sent: number;
  skipped_no_phone: number;
}

/**
 * Read domain services with a renewal date, compute due alerts, and fire the
 * Todoku SMS for each. On a confirmed send, record the band in
 * metadata.domain_alerts so it is not re-sent on the next scan.
 */
export async function runDomainExpiryAlerts(now: Date = new Date()): Promise<DomainExpiryScanResult> {
  const sb = getServiceClient();

  const { data: services, error } = await sb
    .from('client_services')
    .select('id, client_id, service_type, renewal_at, metadata, clients ( phone )')
    .in('service_type', ['domain', 'hosting'])
    .not('renewal_at', 'is', null)
    .in('status', ['active', 'expiring']);
  if (error) throw error;

  type Row = {
    id: string;
    client_id: string;
    renewal_at: string | null;
    metadata: Record<string, unknown> | null;
    clients: { phone: string | null } | { phone: string | null }[] | null;
  };

  const rows = (services ?? []) as Row[];
  let skippedNoPhone = 0;

  const inputs: ExpiryServiceInput[] = rows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const domain = typeof meta.domain === 'string' ? meta.domain : '';
    const alerts = (meta.domain_alerts ?? {}) as { d30?: boolean; d7?: boolean };
    const clientRel = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    const phone = clientRel?.phone ?? undefined;
    return {
      service_id: r.id,
      client_id: r.client_id,
      domain,
      renewal_at: r.renewal_at,
      ...(phone ? { msisdn: phone } : {}),
      alerted: { d30: alerts.d30 === true, d7: alerts.d7 === true },
    };
  });

  const due = dueExpiryAlerts(inputs, now);
  let sent = 0;

  for (const alert of due) {
    if (!alert.msisdn) {
      skippedNoPhone += 1;
      continue;
    }
    const res = await sendSms({
      template: alert.template,
      to_msisdn: alert.msisdn,
      variables: { domain: alert.domain, days_left: String(alert.days_left) },
      entity_type: 'client_service',
      entity_id: alert.service_id,
    });
    if (res.status === 'sent') {
      sent += 1;
      const row = rows.find((r) => r.id === alert.service_id);
      const meta = (row?.metadata ?? {}) as Record<string, unknown>;
      const existing = (meta.domain_alerts ?? {}) as Record<string, unknown>;
      const newMeta = { ...meta, domain_alerts: { ...existing, [alert.band]: true } };
      const { error: uErr } = await sb.from('client_services').update({ metadata: newMeta }).eq('id', alert.service_id);
      if (uErr) logger.error({ err: uErr, service_id: alert.service_id }, 'domain_alert_mark_failed');
    }
  }

  return { scanned: rows.length, due: due.length, sent, skipped_no_phone: skippedNoPhone };
}
