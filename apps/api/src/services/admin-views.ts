/**
 * Admin read-side services for Amara's dashboards.
 *
 * These compose existing tables into the shapes the admin portal's
 * Dashboard, Ticket Queue, Client Accounts, and Capacity tabs need.
 *
 * All functions here run under the service-role client and are ONLY
 * called from delivery_lead/admin route handlers - never from a client
 * request path.
 */

import { getServiceClient } from '../lib/supabase.js';
import { slaStateFromDeadline, type SlaState } from './sla.js';
import type { TicketCategory, TicketUrgency } from '@kws/shared';

const TERMINAL_STATUSES = new Set(['complete', 'closed']);

export interface QueueRow {
  id: string;
  ref: string;
  description: string;
  category: TicketCategory;
  urgency: TicketUrgency;
  status: string;
  sla_deadline_at: string | null;
  sla_state: SlaState;
  ms_until_breach: number | null;
  client: { id: string; business_name: string; plan: string };
  assigned_to: string | null;
  created_at: string;
}

/**
 * Load the full ticket queue across all clients, sorted by SLA urgency:
 * breached first, then warn, then clear. Within each bucket, earliest
 * deadline wins.
 *
 * Matches the architecture doc §5 `GET /admin/queue` contract.
 */
export async function loadQueue(now: Date = new Date()): Promise<QueueRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('tickets')
    .select(
      `id, ref, description, category, urgency, status, sla_deadline_at, assigned_to, created_at,
       clients ( id, business_name, retainer_plans ( name ) )`,
    )
    .not('status', 'in', '("complete","closed")')
    .order('sla_deadline_at', { ascending: true, nullsFirst: false })
    .limit(200);

  if (error) throw error;

  type Row = {
    id: string;
    ref: string;
    description: string;
    category: TicketCategory;
    urgency: TicketUrgency;
    status: string;
    sla_deadline_at: string | null;
    assigned_to: string | null;
    created_at: string;
    clients:
      | { id: string; business_name: string; retainer_plans: { name: string } | { name: string }[] | null }
      | { id: string; business_name: string; retainer_plans: { name: string } | { name: string }[] | null }[]
      | null;
  };

  const rows = (data ?? []) as Row[];

  const mapped: QueueRow[] = rows.map((r) => {
    const clientRel = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    const planRel = clientRel?.retainer_plans;
    const planName = Array.isArray(planRel) ? planRel[0]?.name : planRel?.name;
    const deadline = r.sla_deadline_at ? new Date(r.sla_deadline_at) : null;
    const sla_state = deadline
      ? slaStateFromDeadline({
          now,
          deadline,
          submittedAt: new Date(r.created_at),
          isTerminal: TERMINAL_STATUSES.has(r.status),
        })
      : 'clear';
    return {
      id: r.id,
      ref: r.ref,
      description: r.description,
      category: r.category,
      urgency: r.urgency,
      status: r.status,
      sla_deadline_at: r.sla_deadline_at,
      sla_state,
      ms_until_breach: deadline ? deadline.getTime() - now.getTime() : null,
      client: {
        id: clientRel?.id ?? '',
        business_name: clientRel?.business_name ?? '',
        plan: planName ?? 'Starter',
      },
      assigned_to: r.assigned_to,
      created_at: r.created_at,
    };
  });

  const rank: Record<SlaState, number> = { breached: 0, warn: 1, clear: 2 };
  mapped.sort((a, b) => {
    if (rank[a.sla_state] !== rank[b.sla_state]) return rank[a.sla_state] - rank[b.sla_state];
    const ad = a.sla_deadline_at ? Date.parse(a.sla_deadline_at) : Number.POSITIVE_INFINITY;
    const bd = b.sla_deadline_at ? Date.parse(b.sla_deadline_at) : Number.POSITIVE_INFINITY;
    return ad - bd;
  });
  return mapped;
}

// ── Recent dispatches (dashboard) ───────────────────────────────────

export interface RecentDispatch {
  ref: string;
  client_name: string;
  subtotal_kes: number;
  dispatched_at: string;
}

/**
 * Last 5 dispatched/approved proformas for the Dashboard "Recent approvals"
 * table. Ordered by dispatched_at descending.
 */
export async function loadRecentDispatches(): Promise<RecentDispatch[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('proformas')
    .select(
      `ref, subtotal_kes, dispatched_at,
       tickets ( clients ( business_name ) )`,
    )
    .in('status', ['dispatched', 'approved'])
    .not('dispatched_at', 'is', null)
    .order('dispatched_at', { ascending: false })
    .limit(5);
  if (error) throw error;

  type Row = {
    ref: string;
    subtotal_kes: number;
    dispatched_at: string;
    tickets:
      | { clients: { business_name: string } | { business_name: string }[] | null }
      | { clients: { business_name: string } | { business_name: string }[] | null }[]
      | null;
  };

  return ((data ?? []) as Row[]).map((r) => {
    const ticket = Array.isArray(r.tickets) ? r.tickets[0] : r.tickets;
    const client = ticket?.clients;
    const cl = Array.isArray(client) ? client[0] : client;
    return {
      ref: r.ref,
      client_name: cl?.business_name ?? '',
      subtotal_kes: r.subtotal_kes,
      dispatched_at: r.dispatched_at,
    };
  });
}

// ── Client accounts ─────────────────────────────────────────────────

export interface ClientSummaryRow {
  id: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  plan: string;
  retainer_plan_id: string | null;
  monthly_fee_kes: number;
  included_hours: number;
  hours_used_mtd: number;
  open_tickets: number;
  breached_tickets: number;
  month_to_date_charges_kes: number;
  last_activity_at: string | null;
  created_at: string | null;
  status: 'active' | 'suspended';
  // Filled by the onboarding service (Supabase auth-derived). 'unknown' until enriched.
  invite_status: 'invited' | 'accepted' | 'active' | 'unknown';
}

/**
 * Per-client MRR + open ticket counts + SLA compliance for the Client
 * Accounts tab. Month-to-date charges are computed from confirmed
 * payments + retainer invoices issued this calendar month.
 */
export async function loadClientAccounts(now: Date = new Date()): Promise<ClientSummaryRow[]> {
  const sb = getServiceClient();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const { data: clients, error: cErr } = await sb
    .from('clients')
    .select('id, business_name, contact_name, email, phone, retainer_plan_id, created_at, status, retainer_plans ( name, monthly_fee_kes, included_hours )');
  if (cErr) throw cErr;

  type ClientRow = {
    id: string;
    business_name: string;
    contact_name: string;
    email: string;
    phone: string | null;
    retainer_plan_id: string | null;
    created_at: string | null;
    status: string;
    retainer_plans:
      | { name: string; monthly_fee_kes: number; included_hours: number }
      | { name: string; monthly_fee_kes: number; included_hours: number }[]
      | null;
  };

  const rows: ClientSummaryRow[] = [];
  for (const c of (clients ?? []) as ClientRow[]) {
    const plan = Array.isArray(c.retainer_plans) ? c.retainer_plans[0] : c.retainer_plans;

    const { data: openTickets } = await sb
      .from('tickets')
      .select('id, sla_deadline_at, created_at, status')
      .eq('client_id', c.id)
      .not('status', 'in', '("complete","closed")');

    const open = openTickets ?? [];
    const breached = open.filter((t) => {
      if (!t.sla_deadline_at) return false;
      return slaStateFromDeadline({
        now,
        deadline: new Date(t.sla_deadline_at),
        submittedAt: new Date(t.created_at),
        isTerminal: false,
      }) === 'breached';
    }).length;

    const { data: mtdInvoices } = await sb
      .from('invoices')
      .select('total_kes')
      .eq('client_id', c.id)
      .gte('issued_at', monthStart);
    const mtd = (mtdInvoices ?? []).reduce((a, i) => a + (i.total_kes ?? 0), 0);

    // Hours consumed this month: sum estimated_hours from dispatched/approved
    // proformas belonging to this client's tickets.
    const { data: allTickets } = await sb
      .from('tickets')
      .select('id')
      .eq('client_id', c.id);
    const clientTicketIds = new Set((allTickets ?? []).map((t) => t.id));

    const { data: mtdHoursData } = await sb
      .from('proformas')
      .select('ticket_id, proforma_line_items ( estimated_hours )')
      .in('status', ['dispatched', 'approved'])
      .gte('dispatched_at', monthStart);

    type HoursRow = { ticket_id: string; proforma_line_items: { estimated_hours: number }[] | null };
    const hoursUsed = ((mtdHoursData ?? []) as HoursRow[])
      .filter((p) => clientTicketIds.has(p.ticket_id))
      .reduce((sum, p) => sum + (p.proforma_line_items ?? []).reduce((s, li) => s + li.estimated_hours, 0), 0);

    // Last activity = most recent ticket created_at for this client
    const { data: lastTicket } = await sb
      .from('tickets')
      .select('created_at')
      .eq('client_id', c.id)
      .order('created_at', { ascending: false })
      .limit(1);

    rows.push({
      id: c.id,
      business_name: c.business_name,
      contact_name: c.contact_name ?? '',
      email: c.email,
      phone: c.phone ?? null,
      plan: plan?.name ?? 'Starter',
      retainer_plan_id: c.retainer_plan_id ?? null,
      monthly_fee_kes: plan?.monthly_fee_kes ?? 0,
      included_hours: plan?.included_hours ?? 0,
      hours_used_mtd: Math.round(hoursUsed * 10) / 10,
      open_tickets: open.length,
      breached_tickets: breached,
      month_to_date_charges_kes: mtd,
      last_activity_at: lastTicket?.[0]?.created_at ?? null,
      created_at: c.created_at ?? null,
      status: c.status as 'active' | 'suspended',
      invite_status: 'unknown',
    });
  }

  return rows.sort((a, b) => b.breached_tickets - a.breached_tickets || b.open_tickets - a.open_tickets);
}

// ── Review queue ────────────────────────────────────────────────────

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

/**
 * Load proformas awaiting review (ai_draft or under_review) with their
 * line items, ticket, and client context. Sorted oldest-first so the
 * longest-waiting proformas surface at the top.
 */
export async function loadReviewQueue(): Promise<ReviewQueueItem[]> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from('proformas')
    .select(
      `id, ref, status, ai_confidence_score, ai_flag_reason,
       subtotal_kes, discount_kes, vat_kes, total_kes, created_at,
       tickets (
         id, ref, description, urgency,
         clients ( id, business_name, retainer_plans ( name, task_discount_pct ) )
       ),
       proforma_line_items ( id, task_name, estimated_hours, rate_kes_per_hour, amount_kes, position )`,
    )
    .in('status', ['ai_draft', 'under_review'])
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) throw error;

  type Row = {
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
    tickets:
      | {
          id: string; ref: string; description: string; urgency: string;
          clients:
            | { id: string; business_name: string; retainer_plans: { name: string; task_discount_pct: number } | { name: string; task_discount_pct: number }[] | null }
            | { id: string; business_name: string; retainer_plans: { name: string; task_discount_pct: number } | { name: string; task_discount_pct: number }[] | null }[]
            | null;
        }
      | {
          id: string; ref: string; description: string; urgency: string;
          clients:
            | { id: string; business_name: string; retainer_plans: { name: string; task_discount_pct: number } | { name: string; task_discount_pct: number }[] | null }
            | { id: string; business_name: string; retainer_plans: { name: string; task_discount_pct: number } | { name: string; task_discount_pct: number }[] | null }[]
            | null;
        }[]
      | null;
    proforma_line_items:
      | { id: string; task_name: string; estimated_hours: number; rate_kes_per_hour: number; amount_kes: number; position: number }[]
      | null;
  };

  return ((data ?? []) as Row[]).map((r) => {
    const ticketRel = Array.isArray(r.tickets) ? r.tickets[0] : r.tickets;
    const clientRel = ticketRel?.clients;
    const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;
    const planRel = client?.retainer_plans;
    const plan = Array.isArray(planRel) ? planRel[0] : planRel;
    const lines = (r.proforma_line_items ?? []).sort((a, b) => a.position - b.position);

    return {
      id: r.id,
      ref: r.ref,
      status: r.status,
      ai_confidence_score: r.ai_confidence_score,
      ai_flag_reason: r.ai_flag_reason,
      subtotal_kes: r.subtotal_kes,
      discount_kes: r.discount_kes,
      vat_kes: r.vat_kes,
      total_kes: r.total_kes,
      created_at: r.created_at,
      ticket: {
        id: ticketRel?.id ?? '',
        ref: ticketRel?.ref ?? '',
        description: ticketRel?.description ?? '',
        urgency: ticketRel?.urgency ?? 'standard',
      },
      client: {
        id: client?.id ?? '',
        business_name: client?.business_name ?? '',
        plan: plan?.name ?? 'Starter',
        discount_pct: plan?.task_discount_pct ?? 0,
      },
      line_items: lines,
    };
  });
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

/**
 * The Capacity tab snapshot. Mirrors the `GET /admin/capacity` shape in
 * kws_architecture_v1.md §5.
 */
export async function loadCapacitySnapshot(now: Date = new Date()): Promise<CapacitySnapshot> {
  const sb = getServiceClient();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: openTickets },
    { data: aiDraft },
    { data: dispatched },
    { data: dispatched30 },
    { data: approved30 },
    { data: activeClients },
  ] = await Promise.all([
    sb.from('tickets').select('id, sla_deadline_at, created_at, status').not('status', 'in', '("complete","closed")'),
    sb.from('proformas').select('id').eq('status', 'ai_draft'),
    sb.from('proformas').select('id').eq('status', 'dispatched'),
    sb.from('proformas').select('id').eq('status', 'dispatched').gte('dispatched_at', thirtyDaysAgo),
    sb.from('proforma_approvals').select('id').gte('approved_at', thirtyDaysAgo),
    sb.from('clients').select('id, retainer_plans(monthly_fee_kes)').eq('status', 'active'),
  ]);

  const open = openTickets ?? [];
  const breachedOpen = open.filter((t) => {
    if (!t.sla_deadline_at) return false;
    return slaStateFromDeadline({
      now,
      deadline: new Date(t.sla_deadline_at),
      submittedAt: new Date(t.created_at),
      isTerminal: false,
    }) === 'breached';
  }).length;

  const mrr = (activeClients ?? []).reduce((acc, c) => {
    const planRel = (c as { retainer_plans: { monthly_fee_kes: number } | { monthly_fee_kes: number }[] | null }).retainer_plans;
    const plan = Array.isArray(planRel) ? planRel[0] : planRel;
    return acc + (plan?.monthly_fee_kes ?? 0);
  }, 0);

  const dispatchedCount = dispatched30?.length ?? 0;
  const approvedCount = approved30?.length ?? 0;
  const approval_rate_30d = dispatchedCount > 0 ? approvedCount / dispatchedCount : null;

  return {
    open_tickets: open.length,
    awaiting_ai_review: aiDraft?.length ?? 0,
    dispatched: dispatched?.length ?? 0,
    sla_breaches_open: breachedOpen,
    mrr_kes: mrr,
    approved_proformas_30d: approvedCount,
    dispatched_proformas_30d: dispatchedCount,
    approval_rate_30d,
    // Average task duration is a v2 metric once we have task_completed events
    // with reliable timestamps. Returning null signals "not yet available" so
    // the UI can show an em-dash.
    avg_task_duration_hours: null,
    active_clients: activeClients?.length ?? 0,
  };
}

// ── Capacity detail ─────────────────────────────────────────────────

const ROLE_CAPACITY_HOURS: Record<string, number> = {
  admin: 35,
  delivery_lead: 35,
  technical_delivery: 35,
};
const JUNIOR_TAG = 'junior';
const JUNIOR_CAPACITY = 20;

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

/**
 * Detailed capacity data for the Capacity tab:
 *  - Per-staff utilisation (hours allocated from in-progress ticket proformas)
 *  - 8-week SLA compliance trend (% of tickets that met their deadline)
 *  - Upcoming deadlines (nearest SLA deadlines, soonest first)
 */
export async function loadCapacityDetail(now: Date = new Date()): Promise<CapacityDetail> {
  const sb = getServiceClient();

  // ── Staff utilisation ──
  // Delivery staff = users with a delivery-related role
  const { data: staffUsers, error: uErr } = await sb
    .from('users')
    .select('id, full_name, email, role')
    .in('role', ['delivery_lead', 'technical_delivery', 'admin']);
  if (uErr) throw uErr;

  // Active tickets with assignments + their proforma line item hours
  const { data: activeTickets, error: tErr } = await sb
    .from('tickets')
    .select(
      `id, ref, assigned_to, status,
       proformas ( status, proforma_line_items ( estimated_hours ) )`,
    )
    .not('status', 'in', '("complete","closed")')
    .not('assigned_to', 'is', null);
  if (tErr) throw tErr;

  type TicketWithProformas = {
    id: string;
    ref: string;
    assigned_to: string;
    status: string;
    proformas:
      | { status: string; proforma_line_items: { estimated_hours: number }[] | null }[]
      | null;
  };

  const ticketRows = (activeTickets ?? []) as TicketWithProformas[];

  const staff: StaffUtilisation[] = (staffUsers ?? []).map((u) => {
    const assigned = ticketRows.filter((t) => t.assigned_to === u.id);
    let hours = 0;
    for (const t of assigned) {
      for (const p of t.proformas ?? []) {
        if (p.status === 'dispatched' || p.status === 'approved') {
          hours += (p.proforma_line_items ?? []).reduce((s, li) => s + li.estimated_hours, 0);
        }
      }
    }
    const nameLC = (u.full_name ?? '').toLowerCase();
    const cap = nameLC.includes(JUNIOR_TAG)
      ? JUNIOR_CAPACITY
      : ROLE_CAPACITY_HOURS[u.role] ?? 35;

    return {
      id: u.id,
      full_name: u.full_name ?? u.email,
      role: u.role,
      allocated_hours: Math.round(hours * 10) / 10,
      capacity_hours: cap,
      active_tasks: assigned.length,
      assigned_ticket_refs: assigned.map((t) => t.ref),
    };
  }).filter((s) => s.active_tasks > 0 || s.role !== 'admin');

  staff.sort((a, b) => {
    const aRatio = a.capacity_hours > 0 ? a.allocated_hours / a.capacity_hours : 0;
    const bRatio = b.capacity_hours > 0 ? b.allocated_hours / b.capacity_hours : 0;
    return bRatio - aRatio;
  });

  // ── SLA trend (8 weeks) ──
  // For each of the last 8 weeks, count tickets whose sla_deadline fell in
  // that week. "Met" = terminal status OR deadline still in the future.
  const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
  const { data: slaTickets, error: sErr } = await sb
    .from('tickets')
    .select('id, status, sla_deadline_at, created_at')
    .not('sla_deadline_at', 'is', null)
    .gte('sla_deadline_at', eightWeeksAgo.toISOString())
    .lte('sla_deadline_at', now.toISOString());
  if (sErr) throw sErr;

  type SlaTick = { id: string; status: string; sla_deadline_at: string; created_at: string };
  const slaRows = (slaTickets ?? []) as SlaTick[];

  // Build week buckets (Monday-based)
  const sla_trend: SlaWeekPoint[] = [];
  for (let w = 7; w >= 0; w--) {
    const weekStart = new Date(now.getTime() - (w + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
    const inWeek = slaRows.filter((t) => {
      const d = Date.parse(t.sla_deadline_at);
      return d >= weekStart.getTime() && d < weekEnd.getTime();
    });
    if (inWeek.length === 0) {
      sla_trend.push({ week_label: `W${String(8 - w).padStart(2, '0')}`, pct: 100 });
      continue;
    }
    const met = inWeek.filter((t) => {
      const isTerminal = TERMINAL_STATUSES.has(t.status);
      if (isTerminal) return true;
      return Date.parse(t.sla_deadline_at) > now.getTime();
    }).length;
    sla_trend.push({
      week_label: `W${String(8 - w).padStart(2, '0')}`,
      pct: Math.round((met / inWeek.length) * 100),
    });
  }

  // ── Upcoming deadlines ──
  const { data: deadlineTickets, error: dErr } = await sb
    .from('tickets')
    .select('id, ref, description, sla_deadline_at, clients ( business_name )')
    .not('status', 'in', '("complete","closed")')
    .not('sla_deadline_at', 'is', null)
    .gt('sla_deadline_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
    .order('sla_deadline_at', { ascending: true })
    .limit(8);
  if (dErr) throw dErr;

  type DeadlineTick = {
    id: string;
    ref: string;
    description: string;
    sla_deadline_at: string;
    clients: { business_name: string } | { business_name: string }[] | null;
  };

  const deadlines: DeadlineRow[] = ((deadlineTickets ?? []) as DeadlineTick[]).map((t) => {
    const clientRel = Array.isArray(t.clients) ? t.clients[0] : t.clients;
    return {
      ticket_ref: t.ref,
      client_name: clientRel?.business_name ?? '',
      description: t.description,
      due_iso: t.sla_deadline_at,
      ms_remaining: Date.parse(t.sla_deadline_at) - now.getTime(),
    };
  });

  return { staff, sla_trend, deadlines };
}

// ── Agent registry (KWS-S9-001) ─────────────────────────────────────

export interface AgentRegistryRow {
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

/** All registered agents, oldest first. delivery_lead/admin only (route-gated). */
export async function loadAgentRegistry(): Promise<AgentRegistryRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('agent_registry')
    .select('agent_id, name, scope, version, confidence_threshold, human_review_required, audit_log_required, phase, active, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AgentRegistryRow[];
}

// ── SLA audit (KWS-S8-003) ──────────────────────────────────────────
//
// A compliance report over a trailing window, grouped by client, category and
// plan. The auditable population is tickets whose SLA deadline has ELAPSED
// (deadline <= now) within the window - those are the only ones we can judge.
// met = the ticket reached a terminal status (complete/closed); breached = the
// deadline passed and it is still open.
//
// Limitation (documented, not hidden): we do not yet record a per-ticket
// completion timestamp, so a ticket completed AFTER its deadline still counts
// as "met" here. A `task_completed` event with a reliable timestamp is the v2
// upgrade that lets us measure on-time completion exactly.

export interface SlaAuditTicketRow {
  client_id: string;
  client_name: string;
  plan: string;
  category: TicketCategory;
  status: string;
  sla_deadline_at: string | null;
  created_at: string;
}

export interface SlaBucket {
  key: string;
  total: number;
  breached: number;
  met: number;
  breach_rate: number;   // 0..1
  compliance_pct: number; // 0..100
}

export interface SlaAuditReport {
  window_days: number;
  generated_at: string;
  overall: { total: number; breached: number; met: number; breach_rate: number; compliance_pct: number };
  by_client: SlaBucket[];
  by_category: SlaBucket[];
  by_plan: SlaBucket[];
}

function bucketise(
  rows: { key: string; breached: boolean }[],
): SlaBucket[] {
  const map = new Map<string, { total: number; breached: number }>();
  for (const r of rows) {
    const b = map.get(r.key) ?? { total: 0, breached: 0 };
    b.total += 1;
    if (r.breached) b.breached += 1;
    map.set(r.key, b);
  }
  return [...map.entries()]
    .map(([key, b]) => {
      const met = b.total - b.breached;
      const breach_rate = b.total > 0 ? b.breached / b.total : 0;
      return {
        key,
        total: b.total,
        breached: b.breached,
        met,
        breach_rate,
        compliance_pct: Math.round((1 - breach_rate) * 1000) / 10,
      };
    })
    .sort((a, b) => b.breach_rate - a.breach_rate || b.total - a.total);
}

/**
 * Pure SLA-audit aggregation. Considers only tickets whose deadline has elapsed
 * within the trailing `windowDays`. Exported for unit testing with fixtures.
 */
export function computeSlaAudit(
  rows: SlaAuditTicketRow[],
  now: Date = new Date(),
  windowDays = 30,
): SlaAuditReport {
  const windowStart = now.getTime() - windowDays * 24 * 60 * 60 * 1000;

  const judged = rows
    .filter((r) => r.sla_deadline_at != null)
    .map((r) => ({ r, deadline: Date.parse(r.sla_deadline_at as string) }))
    .filter(({ deadline }) => deadline <= now.getTime() && deadline >= windowStart)
    .map(({ r }) => ({
      client: r.client_name || r.client_id,
      category: r.category,
      plan: r.plan,
      breached: !TERMINAL_STATUSES.has(r.status),
    }));

  const total = judged.length;
  const breached = judged.filter((j) => j.breached).length;
  const met = total - breached;
  const breach_rate = total > 0 ? breached / total : 0;

  return {
    window_days: windowDays,
    generated_at: now.toISOString(),
    overall: {
      total,
      breached,
      met,
      breach_rate,
      compliance_pct: Math.round((1 - breach_rate) * 1000) / 10,
    },
    by_client: bucketise(judged.map((j) => ({ key: j.client, breached: j.breached }))),
    by_category: bucketise(judged.map((j) => ({ key: j.category, breached: j.breached }))),
    by_plan: bucketise(judged.map((j) => ({ key: j.plan, breached: j.breached }))),
  };
}

/**
 * Load tickets whose SLA deadline elapsed within the window and produce the
 * audit report. delivery_lead/admin only (called from the route gate).
 */
export async function loadSlaAudit(windowDays = 30, now: Date = new Date()): Promise<SlaAuditReport> {
  const sb = getServiceClient();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from('tickets')
    .select(
      `category, status, sla_deadline_at, created_at,
       clients ( id, business_name, retainer_plans ( name ) )`,
    )
    .not('sla_deadline_at', 'is', null)
    .gte('sla_deadline_at', windowStart)
    .lte('sla_deadline_at', now.toISOString())
    .limit(2000);
  if (error) throw error;

  type Row = {
    category: TicketCategory;
    status: string;
    sla_deadline_at: string | null;
    created_at: string;
    clients:
      | { id: string; business_name: string; retainer_plans: { name: string } | { name: string }[] | null }
      | { id: string; business_name: string; retainer_plans: { name: string } | { name: string }[] | null }[]
      | null;
  };

  const rows: SlaAuditTicketRow[] = ((data ?? []) as Row[]).map((r) => {
    const clientRel = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    const planRel = clientRel?.retainer_plans;
    const planName = Array.isArray(planRel) ? planRel[0]?.name : planRel?.name;
    return {
      client_id: clientRel?.id ?? '',
      client_name: clientRel?.business_name ?? '',
      plan: planName ?? 'Starter',
      category: r.category,
      status: r.status,
      sla_deadline_at: r.sla_deadline_at,
      created_at: r.created_at,
    };
  });

  return computeSlaAudit(rows, now, windowDays);
}
