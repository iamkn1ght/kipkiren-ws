import { useCallback, useEffect, useState } from 'react';
import { useApi } from './auth.tsx';
import { mockAdmin } from './mockData.ts';

const DEV_AUTH_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1';

export type SlaState = 'clear' | 'warn' | 'breached';

export interface QueueRow {
  id: string;
  ref: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  sla_deadline_at: string | null;
  sla_state: SlaState;
  ms_until_breach: number | null;
  client: { id: string; business_name: string; plan: string };
  assigned_to: string | null;
  created_at: string;
}

export interface CapacitySnapshot {
  open_tickets: number;
  awaiting_ai_review: number;
  dispatched: number;
  sla_breaches_open: number;
  mrr_kes: number;
  approved_proformas_30d: number;
  dispatched_proformas_30d: number;
  approval_rate_30d: number | null;
  avg_task_duration_hours: number | null;
  active_clients: number;
}

export interface ClientSummaryRow {
  id: string;
  business_name: string;
  contact_name: string;
  plan: string;
  monthly_fee_kes: number;
  included_hours: number;
  hours_used_mtd: number;
  open_tickets: number;
  breached_tickets: number;
  month_to_date_charges_kes: number;
  last_activity_at: string | null;
  status: 'active' | 'suspended';
}

export interface RecentDispatch {
  ref: string;
  client_name: string;
  subtotal_kes: number;
  dispatched_at: string;
}

export interface ReviewLineItem {
  id: string;
  task_name: string;
  estimated_hours: number;
  rate_kes_per_hour: number;
  amount_kes: number;
  position: number;
}

export interface ReviewQueueItem {
  id: string;
  ref: string;
  status: string;
  ai_confidence_score: number | null;
  ai_flag_reason: string | null;
  subtotal_kes: number;
  discount_kes: number;
  vat_kes: number;
  total_kes: number;
  created_at: string;
  ticket: {
    id: string;
    ref: string;
    description: string;
    urgency: string;
  };
  client: {
    id: string;
    business_name: string;
    plan: string;
    discount_pct: number;
  };
  line_items: ReviewLineItem[];
}

export interface StaffUtilisation {
  id: string;
  full_name: string;
  role: string;
  allocated_hours: number;
  capacity_hours: number;
  active_tasks: number;
  assigned_ticket_refs: string[];
}

export interface SlaWeekPoint {
  week_label: string;
  pct: number;
}

export interface DeadlineRow {
  ticket_ref: string;
  client_name: string;
  description: string;
  due_iso: string;
  ms_remaining: number;
}

export interface CapacityDetail {
  staff: StaffUtilisation[];
  sla_trend: SlaWeekPoint[];
  deadlines: DeadlineRow[];
}

export interface AdminServiceRow {
  id: string;
  service_type: string;
  status: string;
  renewal_at: string | null;
  monthly_cost_kes: number;
  metadata: Record<string, unknown>;
  created_at: string;
  client_id: string;
  client_name: string;
}

export interface RailMetric { label: string; value: string; tone?: 'ok' | 'warn' | 'mut'; }
export interface RailHealth {
  key: string;
  name: string;
  purpose: string;
  configured: boolean;
  status: 'live' | 'configured' | 'pending' | 'degraded' | 'unconfigured';
  reachable: boolean | null;
  latency_ms: number | null;
  metrics: RailMetric[];
  note?: string;
}
interface RailsResult { rails: RailHealth[]; generated_at: string }

export interface SiteHealthRow {
  service_id: string;
  domain: string | null;
  uptime_pct: number;
  p95_ms: number | null;
  avg_ms: number | null;
  ping_count: number;
  last_check: string | null;
  anomaly: boolean;
  anomaly_type: string | null;
}

export interface AgentRow {
  agent_id: string;
  name: string;
  scope: string[];
  version: string;
  confidence_threshold: number | null;
  human_review_required: boolean;
  audit_log_required: boolean;
  phase: number;
  active: boolean;
  created_at: string;
}

interface AdminData {
  queue: QueueRow[] | null;
  capacity: CapacitySnapshot | null;
  clients: ClientSummaryRow[] | null;
  reviewQueue: ReviewQueueItem[] | null;
  recentDispatches: RecentDispatch[] | null;
  capacityDetail: CapacityDetail | null;
  services: AdminServiceRow[] | null;
  rails: RailHealth[] | null;
  siteHealth: SiteHealthRow[] | null;
  agents: AgentRow[] | null;
  railsProbing: boolean;
  probeRails: () => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAdminData(): AdminData {
  const call = useApi();
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [capacity, setCapacity] = useState<CapacitySnapshot | null>(null);
  const [clients, setClients] = useState<ClientSummaryRow[] | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[] | null>(null);
  const [recentDispatches, setRecentDispatches] = useState<RecentDispatch[] | null>(null);
  const [capacityDetail, setCapacityDetail] = useState<CapacityDetail | null>(null);
  const [services, setServices] = useState<AdminServiceRow[] | null>(null);
  const [rails, setRails] = useState<RailHealth[] | null>(null);
  const [siteHealth, setSiteHealth] = useState<SiteHealthRow[] | null>(null);
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [railsProbing, setRailsProbing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (DEV_AUTH_BYPASS) {
        setQueue(mockAdmin.queue); setCapacity(mockAdmin.capacity); setClients(mockAdmin.clients);
        setReviewQueue(mockAdmin.reviewQueue); setRecentDispatches(mockAdmin.recentDispatches);
        setCapacityDetail(mockAdmin.capacityDetail); setServices(mockAdmin.services); setRails(mockAdmin.rails);
        setSiteHealth(mockAdmin.siteHealth); setAgents(mockAdmin.agents);
        setLoading(false);
        return;
      }
      const [qRes, capRes, cliRes, revRes, dispRes, capDet, svcRes, railRes, shRes, agRes] = await Promise.all([
        call<{ queue: QueueRow[] }>('/v1/admin/queue'),
        call<CapacitySnapshot>('/v1/admin/capacity'),
        call<{ clients: ClientSummaryRow[] }>('/v1/admin/clients'),
        call<{ items: ReviewQueueItem[] }>('/v1/admin/review-queue'),
        call<{ dispatches: RecentDispatch[] }>('/v1/admin/recent-dispatches'),
        call<CapacityDetail>('/v1/admin/capacity-detail'),
        call<{ services: AdminServiceRow[] }>('/v1/services/admin/all'),
        call<RailsResult>('/v1/admin/rails'),
        // Non-fatal: these depend on migrations 0005-0007. Until applied they
        // 500, but they must not break the rest of the admin portal load.
        call<{ sites: SiteHealthRow[] }>('/v1/admin/site-health').catch(() => ({ sites: [] })),
        call<{ agents: AgentRow[] }>('/v1/admin/agents').catch(() => ({ agents: [] })),
      ]);
      setQueue(qRes.queue);
      setCapacity(capRes);
      setClients(cliRes.clients);
      setReviewQueue(revRes.items);
      setRecentDispatches(dispRes.dispatches);
      setCapacityDetail(capDet);
      setServices(svcRes.services);
      setRails(railRes.rails);
      setSiteHealth(shRes.sites);
      setAgents(agRes.agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, [call]);

  // Live-ping the reachable rails (KP, Todoku) - on demand (slower).
  const probeRails = useCallback(async () => {
    setRailsProbing(true);
    try {
      const r = await call<RailsResult>('/v1/admin/rails?probe=1');
      setRails(r.rails);
    } catch {
      // error surfaced via the main load path
    } finally {
      setRailsProbing(false);
    }
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  return { queue, capacity, clients, reviewQueue, recentDispatches, capacityDetail, services, rails, siteHealth, agents, railsProbing, probeRails, loading, error, reload: load };
}

export function formatSlaTime(msUntilBreach: number | null): string {
  if (msUntilBreach === null) return '-';
  if (msUntilBreach <= 0) return 'Breached';
  const totalMin = Math.floor(msUntilBreach / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 24) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function slaBarPercent(msUntilBreach: number | null, createdAt: string): number {
  if (msUntilBreach === null) return 0;
  if (msUntilBreach <= 0) return 100;
  const created = Date.parse(createdAt);
  const totalWindow = Date.now() + msUntilBreach - created;
  if (totalWindow <= 0) return 100;
  const elapsed = Date.now() - created;
  return Math.min(100, Math.max(0, Math.round((elapsed / totalWindow) * 100)));
}

export function slaBarClass(state: SlaState): string {
  if (state === 'breached') return 'fl-r';
  if (state === 'warn') return 'fl-a';
  return 'fl-g';
}

export function slaLabel(state: SlaState, msUntilBreach: number | null): string {
  if (state === 'breached') return 'Breached';
  if (state === 'warn') return formatSlaTime(msUntilBreach);
  return 'On track';
}
