/**
 * Admin read-side services for Amara's dashboards.
 *
 * These compose existing tables into the shapes the admin portal's
 * Dashboard, Ticket Queue, Client Accounts, and Capacity tabs need.
 *
 * All functions here run under the service-role client and are ONLY
 * called from delivery_lead/admin route handlers — never from a client
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

export interface ClientSummaryRow {
  id: string;
  business_name: string;
  plan: string;
  monthly_fee_kes: number;
  open_tickets: number;
  breached_tickets: number;
  month_to_date_charges_kes: number;
  status: 'active' | 'suspended';
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
    .select('id, business_name, status, retainer_plans ( name, monthly_fee_kes )');
  if (cErr) throw cErr;

  const rows: ClientSummaryRow[] = [];
  for (const c of clients ?? []) {
    const planRel = (c as { retainer_plans: { name: string; monthly_fee_kes: number } | { name: string; monthly_fee_kes: number }[] | null }).retainer_plans;
    const plan = Array.isArray(planRel) ? planRel[0] : planRel;

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

    rows.push({
      id: c.id,
      business_name: c.business_name,
      plan: plan?.name ?? 'Starter',
      monthly_fee_kes: plan?.monthly_fee_kes ?? 0,
      open_tickets: open.length,
      breached_tickets: breached,
      month_to_date_charges_kes: mtd,
      status: c.status as 'active' | 'suspended',
    });
  }

  return rows.sort((a, b) => b.breached_tickets - a.breached_tickets || b.open_tickets - a.open_tickets);
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
