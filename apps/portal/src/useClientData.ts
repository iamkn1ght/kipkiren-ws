import { useCallback, useEffect, useState } from 'react';
import { useApi } from './auth.tsx';
import { mockClient } from './mockData.ts';

const DEV_AUTH_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1';

export interface ClientTicket {
  id: string;
  ref: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  sla_deadline_at: string | null;
  created_at: string;
}

export interface ClientInvoice {
  id: string;
  ref: string;
  kind: string;
  period_start: string | null;
  period_end: string | null;
  subtotal_kes: number;
  vat_kes: number;
  total_kes: number;
  issued_at: string;
  paid_at: string | null;
}

export interface ClientService {
  id: string;
  service_type: string;
  status: string;
  renewal_at: string | null;
  monthly_cost_kes: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Dashboard "operating system" composites ─────────────────────────
export type ProjectKind = 'active' | 'review' | 'done' | 'queued';
export interface ProjectCard {
  id: string;
  title: string;
  status: string;
  kind: ProjectKind;
  progress: number;          // 0-100
  due: string | null;        // ISO date
  team: string;
  last_activity: string;
}

export type ActivityKind = 'payment' | 'invoice' | 'ticket' | 'deploy' | 'maintenance' | 'meeting';
export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  text: string;
  at: string;                // ISO
}

export type HealthStatus = 'operational' | 'expiring' | 'degraded' | 'down';
export interface HealthItem {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
}

export interface TrustStats {
  projects_completed: number;
  avg_response_hours: number;
  uptime_pct: number;
  satisfaction_pct: number;
  since: string;             // human label, e.g. "March 2024"
  recent_deliverables: string[];
}

export interface ClientDashboard {
  projects: ProjectCard[];
  activity: ActivityItem[];
  health: HealthItem[];
  trust: TrustStats | null;
}

interface ClientData {
  tickets: ClientTicket[] | null;
  invoices: ClientInvoice[] | null;
  services: ClientService[] | null;
  dashboard: ClientDashboard | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// Status → completion %, for deriving project progress in real mode.
const PROGRESS_BY_STATUS: Record<string, number> = {
  submitted: 8, decomposing: 18, ai_draft: 28, review: 40, under_review: 40,
  dispatched: 55, approved: 68, paid: 78, in_progress: 85, complete: 100, closed: 100,
};
const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Compose the dashboard from the primary entities when no purpose-built
 * endpoint exists (real mode). Bypass mode uses the richer mockClient.dashboard.
 * Trust metrics are relationship data we don't track yet, so real mode leaves
 * them null rather than fabricating them.
 */
export function deriveDashboard(
  tickets: ClientTicket[],
  invoices: ClientInvoice[],
  services: ClientService[],
): ClientDashboard {
  const open = tickets.filter((t) => t.status !== 'complete' && t.status !== 'closed');

  const projects: ProjectCard[] = open.slice(0, 6).map((t) => {
    const progress = PROGRESS_BY_STATUS[t.status] ?? 30;
    const kind: ProjectKind = t.status === 'complete' ? 'done'
      : t.status === 'in_progress' || t.status === 'paid' ? 'active'
      : t.status === 'dispatched' || t.status === 'ai_draft' || t.status === 'review' || t.status === 'under_review' ? 'review'
      : 'queued';
    return {
      id: t.id,
      title: t.description.length > 64 ? `${t.description.slice(0, 61)}...` : t.description,
      status: titleCase(t.status),
      kind,
      progress,
      due: t.sla_deadline_at,
      team: 'Delivery team',
      last_activity: `Status: ${titleCase(t.status)}`,
    };
  });

  const activity: ActivityItem[] = [];
  for (const i of invoices.slice(0, 4)) {
    activity.push(i.paid_at
      ? { id: `inv-${i.id}`, kind: 'payment', text: `Payment received · ${i.ref}`, at: i.paid_at }
      : { id: `inv-${i.id}`, kind: 'invoice', text: `Invoice ${i.ref} generated`, at: i.issued_at });
  }
  for (const t of tickets.slice(0, 4)) {
    activity.push({ id: `tk-${t.id}`, kind: 'ticket', text: `${t.ref} · ${titleCase(t.status)}`, at: t.created_at });
  }
  activity.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const health: HealthItem[] = [];
  const hosting = services.find((s) => s.service_type === 'hosting');
  if (hosting) {
    const up = (hosting.metadata as { uptime_pct?: number }).uptime_pct;
    health.push({ key: 'website', label: 'Website', status: 'operational', detail: up != null ? `${up}% uptime` : 'Online' });
    health.push({ key: 'hosting', label: 'Hosting', status: 'operational', detail: 'eu-west-1' });
  }
  const domain = services.find((s) => s.service_type === 'domain');
  if (domain) {
    health.push({
      key: 'domain', label: 'Domain',
      status: domain.status === 'expiring' || domain.status === 'expired' ? 'expiring' : 'operational',
      detail: domain.renewal_at ? `Renews ${new Date(domain.renewal_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Active',
    });
  }

  return { projects, activity: activity.slice(0, 8), health, trust: null };
}

export function useClientData(): ClientData {
  const call = useApi();
  const [tickets, setTickets] = useState<ClientTicket[] | null>(null);
  const [invoices, setInvoices] = useState<ClientInvoice[] | null>(null);
  const [services, setServices] = useState<ClientService[] | null>(null);
  const [dashboard, setDashboard] = useState<ClientDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (DEV_AUTH_BYPASS) {
        setTickets(mockClient.tickets); setInvoices(mockClient.invoices); setServices(mockClient.services);
        setDashboard(mockClient.dashboard);
        setLoading(false);
        return;
      }
      const [tRes, iRes, sRes] = await Promise.all([
        call<{ tickets: ClientTicket[] }>('/v1/tickets'),
        call<{ invoices: ClientInvoice[] }>('/v1/invoices'),
        call<{ services: ClientService[] }>('/v1/services'),
      ]);
      setTickets(tRes.tickets);
      setInvoices(iRes.invoices);
      setServices(sRes.services);
      setDashboard(deriveDashboard(tRes.tickets, iRes.invoices, sRes.services));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  return { tickets, invoices, services, dashboard, loading, error, reload: load };
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  hosting: 'Managed Hosting',
  domain: 'Domain Registration',
  workspace: 'Google Workspace',
  microsoft365: 'Microsoft 365',
  ssl: 'SSL Certificate',
  seo_retainer: 'SEO Retainer',
  social_retainer: 'Social Media',
};

export function serviceTypeLabel(t: string): string {
  return SERVICE_TYPE_LABELS[t] ?? t.replace(/_/g, ' ');
}

export function formatKes(n: number): string {
  return n.toLocaleString();
}
