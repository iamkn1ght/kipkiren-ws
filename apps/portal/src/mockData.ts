/**
 * DEV-ONLY sample data for the auth-bypass UI workflow.
 *
 * When VITE_DEV_AUTH_BYPASS=1 the synthetic session can't pull real data
 * (the API 401s the fake token), so the data hooks fall back to this so the
 * portals render populated for design review. Never used in production.
 */
import type {
  QueueRow, CapacitySnapshot, ClientSummaryRow, RecentDispatch,
  ReviewQueueItem, CapacityDetail, AdminServiceRow, RailHealth,
  SiteHealthRow, AgentRow, SlaAuditReport,
} from './useAdminData.ts';
import type { ClientTicket, ClientInvoice, ClientService } from './useClientData.ts';
import type { Task } from './useTaskData.ts';

const hrs = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const days = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

// ── Admin ──
const queue: QueueRow[] = [
  { id: 't1', ref: 'KWS-T-0042', description: 'Migrate dashboards to Supabase + add CSV export', category: 'web', urgency: 'elevated', status: 'in_progress', sla_deadline_at: hrs(6), sla_state: 'warn', ms_until_breach: 6 * 3_600_000, client: { id: 'c1', business_name: 'Maridadi Press', plan: 'Growth' }, assigned_to: 'Kamau W.', created_at: days(-2) },
  { id: 't2', ref: 'KWS-T-0044', description: 'Add online booking + payment to WordPress site', category: 'web', urgency: 'standard', status: 'assigned', sla_deadline_at: days(2), sla_state: 'clear', ms_until_breach: 2 * 86_400_000, client: { id: 'c2', business_name: 'Acacia Capital', plan: 'Business' }, assigned_to: null, created_at: days(-1) },
  { id: 't3', ref: 'KWS-T-0045', description: 'SEO audit + meta rewrite, 12 pages', category: 'seo', urgency: 'urgent', status: 'ai_draft', sla_deadline_at: hrs(-2), sla_state: 'breached', ms_until_breach: -2 * 3_600_000, client: { id: 'c3', business_name: 'Field Atlas', plan: 'Growth' }, assigned_to: null, created_at: days(-3) },
  { id: 't4', ref: 'KWS-T-0046', description: 'Monthly uptime report · March', category: 'general', urgency: 'standard', status: 'awaiting_review', sla_deadline_at: days(1), sla_state: 'clear', ms_until_breach: 86_400_000, client: { id: 'c1', business_name: 'Maridadi Press', plan: 'Growth' }, assigned_to: 'Kamau W.', created_at: hrs(-20) },
];
const capacity: CapacitySnapshot = { open_tickets: 14, awaiting_ai_review: 3, dispatched: 8, sla_breaches_open: 1, mrr_kes: 412000, approved_proformas_30d: 22, dispatched_proformas_30d: 26, approval_rate_30d: 0.85, avg_task_duration_hours: 4.2, active_clients: 12 };
const clients: ClientSummaryRow[] = [
  { id: 'c1', business_name: 'Maridadi Press', contact_name: 'Amara Njoroge', plan: 'Growth', monthly_fee_kes: 45000, included_hours: 10, hours_used_mtd: 7, open_tickets: 2, breached_tickets: 0, month_to_date_charges_kes: 61000, last_activity_at: hrs(-5), status: 'active' },
  { id: 'c2', business_name: 'Acacia Capital', contact_name: 'B. Otieno', plan: 'Business', monthly_fee_kes: 95000, included_hours: 20, hours_used_mtd: 22, open_tickets: 3, breached_tickets: 1, month_to_date_charges_kes: 128500, last_activity_at: days(-1), status: 'active' },
  { id: 'c3', business_name: 'Field Atlas', contact_name: 'M. Kamau', plan: 'Growth', monthly_fee_kes: 45000, included_hours: 10, hours_used_mtd: 4, open_tickets: 1, breached_tickets: 0, month_to_date_charges_kes: 45000, last_activity_at: days(-4), status: 'active' },
  { id: 'c4', business_name: 'Otieno & Co.', contact_name: 'J. Otieno', plan: 'Starter', monthly_fee_kes: 15000, included_hours: 5, hours_used_mtd: 2, open_tickets: 0, breached_tickets: 0, month_to_date_charges_kes: 15000, last_activity_at: days(-9), status: 'active' },
];
const recentDispatches: RecentDispatch[] = [
  { ref: 'KWS-039', client_name: 'Maridadi Press', subtotal_kes: 24000, dispatched_at: days(-1) },
  { ref: 'KWS-038', client_name: 'Acacia Capital', subtotal_kes: 51500, dispatched_at: days(-2) },
  { ref: 'KWS-037', client_name: 'Field Atlas', subtotal_kes: 18000, dispatched_at: days(-3) },
];
const reviewQueue: ReviewQueueItem[] = [
  { id: 'pf1', ref: 'KWS-047', status: 'ai_draft', ai_confidence_score: 0.92, ai_flag_reason: null, subtotal_kes: 31250, discount_kes: 3125, vat_kes: 4500, total_kes: 32625, created_at: hrs(-3), ticket: { id: 't1', ref: 'KWS-T-0042', description: 'Migrate dashboards to Supabase + add CSV export', urgency: 'elevated' }, client: { id: 'c1', business_name: 'Maridadi Press', plan: 'Growth', discount_pct: 0.1 }, line_items: [ { id: 'l1', task_name: 'Supabase migration · 3 dashboards', estimated_hours: 5.5, rate_kes_per_hour: 4500, amount_kes: 24750, position: 1 }, { id: 'l2', task_name: 'Server-side CSV export', estimated_hours: 2.5, rate_kes_per_hour: 4500, amount_kes: 11250, position: 2 } ] },
  { id: 'pf2', ref: 'KWS-048', status: 'ai_draft', ai_confidence_score: 0.58, ai_flag_reason: 'Ambiguous scope - booking plugin not specified', subtotal_kes: 42750, discount_kes: 6412, vat_kes: 5814, total_kes: 42152, created_at: hrs(-8), ticket: { id: 't2', ref: 'KWS-T-0044', description: 'Add online booking + payment to WordPress site', urgency: 'standard' }, client: { id: 'c2', business_name: 'Acacia Capital', plan: 'Business', discount_pct: 0.15 }, line_items: [ { id: 'l3', task_name: 'Booking calendar integration', estimated_hours: 6, rate_kes_per_hour: 4500, amount_kes: 27000, position: 1 }, { id: 'l4', task_name: 'Paystack payment leg + email', estimated_hours: 3.5, rate_kes_per_hour: 4500, amount_kes: 15750, position: 2 } ] },
];
const capacityDetail: CapacityDetail = {
  staff: [
    { id: 's1', full_name: 'Kamau Waweru', role: 'technical_delivery', allocated_hours: 28, capacity_hours: 35, active_tasks: 4, assigned_ticket_refs: ['KWS-T-0042', 'KWS-T-0046'] },
    { id: 's2', full_name: 'Wanjiru Mwangi', role: 'technical_delivery', allocated_hours: 39, capacity_hours: 35, active_tasks: 5, assigned_ticket_refs: ['KWS-T-0040', 'KWS-T-0041'] },
    { id: 's3', full_name: 'Amara Njoroge', role: 'delivery_lead', allocated_hours: 12, capacity_hours: 20, active_tasks: 2, assigned_ticket_refs: ['KWS-T-0044'] },
  ],
  sla_trend: [ { week_label: 'W9', pct: 96 }, { week_label: 'W10', pct: 92 }, { week_label: 'W11', pct: 78 }, { week_label: 'W12', pct: 88 }, { week_label: 'W13', pct: 94 }, { week_label: 'W14', pct: 100 }, { week_label: 'W15', pct: 97 }, { week_label: 'W16', pct: 99 } ],
  deadlines: [
    { ticket_ref: 'KWS-T-0045', client_name: 'Field Atlas', description: 'SEO audit', due_iso: hrs(-2), ms_remaining: -2 * 3_600_000 },
    { ticket_ref: 'KWS-T-0042', client_name: 'Maridadi Press', description: 'Dashboard migration', due_iso: hrs(6), ms_remaining: 6 * 3_600_000 },
    { ticket_ref: 'KWS-T-0046', client_name: 'Maridadi Press', description: 'Uptime report', due_iso: days(1), ms_remaining: 86_400_000 },
  ],
};
const adminServices: AdminServiceRow[] = [
  { id: 'sv1', service_type: 'hosting', status: 'active', renewal_at: days(48), monthly_cost_kes: 3500, metadata: { domain: 'maridadi.press' }, created_at: days(-200), client_id: 'c1', client_name: 'Maridadi Press' },
  { id: 'sv2', service_type: 'domain', status: 'expiring', renewal_at: days(21), monthly_cost_kes: 1800, metadata: { domain: 'acaciacapital.co.ke' }, created_at: days(-340), client_id: 'c2', client_name: 'Acacia Capital' },
  { id: 'sv3', service_type: 'ssl', status: 'active', renewal_at: days(70), monthly_cost_kes: 0, metadata: { domain: 'fieldatlas.org' }, created_at: days(-120), client_id: 'c3', client_name: 'Field Atlas' },
];
const rails: RailHealth[] = [
  { key: 'kipkiren_pay', name: 'Kipkiren Pay', purpose: 'M-Pesa payments via LipaPlus (ADR-KWS-005)', configured: true, status: 'live', reachable: true, latency_ms: 142, metrics: [ { label: 'Processed', value: '318' }, { label: 'Confirmed', value: '301', tone: 'ok' }, { label: 'Pending', value: '4', tone: 'warn' }, { label: 'Failed', value: '13', tone: 'warn' }, { label: 'Success rate', value: '96%' }, { label: 'Confirmed volume', value: 'KES 4,182,500' }, { label: 'Last 24h', value: '11' } ] },
  { key: 'paystack', name: 'Paystack', purpose: 'Card payments (direct)', configured: true, status: 'live', reachable: null, latency_ms: null, metrics: [ { label: 'Processed', value: '64' }, { label: 'Confirmed', value: '61', tone: 'ok' }, { label: 'Pending', value: '0', tone: 'mut' }, { label: 'Failed', value: '3', tone: 'warn' }, { label: 'Success rate', value: '95%' }, { label: 'Confirmed volume', value: 'KES 918,000' }, { label: 'Last 24h', value: '2' } ] },
  { key: 'anthropic', name: 'Anthropic · AI decomposition', purpose: 'Ticket → proforma line-item decomposition', configured: true, status: 'live', reachable: null, latency_ms: null, metrics: [ { label: 'Decompositions', value: '142', tone: 'ok' }, { label: 'Failed', value: '6', tone: 'warn' }, { label: 'Success rate', value: '96%' }, { label: 'Avg confidence', value: '0.89' } ] },
  { key: 'todoku', name: 'Todoku · SMS', purpose: 'Transactional SMS on 5 KWS events (S9-003)', configured: false, status: 'pending', reachable: null, latency_ms: null, metrics: [ { label: 'Sent', value: '0', tone: 'mut' }, { label: 'Failed', value: '0', tone: 'mut' }, { label: 'Delivery rate', value: '-' } ], note: 'Scaffolded - awaiting Todoku tenant creds + template ULIDs (Sprint 9).' },
  { key: 'helpan', name: 'Helpan KWS · AI agent', purpose: 'Proforma enrichment + SLA early warning (Phase 1)', configured: false, status: 'pending', reachable: null, latency_ms: null, metrics: [ { label: 'Phase', value: '1 · enrichment' }, { label: 'Agent', value: 'helpan-kws-v1' } ], note: 'Sprint 9 - agent admitted to the registry; service JWT + consumption not wired yet.' },
];

const siteHealth: SiteHealthRow[] = [
  { service_id: 'sv1', domain: 'maridadi.press', uptime_pct: 99.9, p95_ms: 180, avg_ms: 120, ping_count: 30, last_check: hrs(-0.2), anomaly: false, anomaly_type: null },
  { service_id: 'sv3', domain: 'fieldatlas.org', uptime_pct: 86.7, p95_ms: 940, avg_ms: 410, ping_count: 30, last_check: hrs(-0.2), anomaly: true, anomaly_type: 'latency_spike' },
];
const agents: AgentRow[] = [
  { agent_id: 'helpan-kws-v1', name: 'Helpan KWS', scope: ['proforma_enrichment', 'confidence_amplification', 'sla_early_warning'], version: 'v1', confidence_threshold: 0.7, human_review_required: true, audit_log_required: true, phase: 1, active: true, created_at: days(-30) },
];

const slaAudit: SlaAuditReport = {
  window_days: 30,
  generated_at: new Date().toISOString(),
  overall: { total: 24, breached: 2, met: 22, breach_rate: 0.083, compliance_pct: 91.7 },
  by_client: [
    { key: 'Acacia Capital', total: 8, breached: 2, met: 6, breach_rate: 0.25, compliance_pct: 75 },
    { key: 'Maridadi Press', total: 9, breached: 0, met: 9, breach_rate: 0, compliance_pct: 100 },
    { key: 'Field Atlas', total: 5, breached: 0, met: 5, breach_rate: 0, compliance_pct: 100 },
    { key: 'Otieno & Co.', total: 2, breached: 0, met: 2, breach_rate: 0, compliance_pct: 100 },
  ],
  by_category: [
    { key: 'web', total: 12, breached: 1, met: 11, breach_rate: 0.083, compliance_pct: 91.7 },
    { key: 'seo', total: 7, breached: 1, met: 6, breach_rate: 0.143, compliance_pct: 85.7 },
    { key: 'general', total: 5, breached: 0, met: 5, breach_rate: 0, compliance_pct: 100 },
  ],
  by_plan: [
    { key: 'Business', total: 8, breached: 2, met: 6, breach_rate: 0.25, compliance_pct: 75 },
    { key: 'Growth', total: 14, breached: 0, met: 14, breach_rate: 0, compliance_pct: 100 },
    { key: 'Starter', total: 2, breached: 0, met: 2, breach_rate: 0, compliance_pct: 100 },
  ],
};

export const mockAdmin = { queue, capacity, clients, reviewQueue, recentDispatches, capacityDetail, services: adminServices, rails, siteHealth, agents, slaAudit };

// ── Client ──
const clientTickets: ClientTicket[] = [
  { id: 't1', ref: 'KWS-T-0042', description: 'Migrate dashboards to Supabase + add CSV export', category: 'web', urgency: 'elevated', status: 'in_progress', sla_deadline_at: hrs(6), created_at: days(-2) },
  { id: 't5', ref: 'KWS-T-0039', description: 'Add newsletter signup + Mailchimp sync', category: 'web', urgency: 'standard', status: 'complete', sla_deadline_at: days(-3), created_at: days(-6) },
];
const clientInvoices: ClientInvoice[] = [
  { id: 'i1', ref: 'INV-2026-031', kind: 'task', period_start: null, period_end: null, subtotal_kes: 24750, vat_kes: 3960, total_kes: 28710, issued_at: days(-12), paid_at: days(-11) },
  { id: 'i2', ref: 'INV-2026-028', kind: 'retainer', period_start: days(-30), period_end: days(-1), subtotal_kes: 45000, vat_kes: 7200, total_kes: 52200, issued_at: days(-30), paid_at: days(-29) },
];
const clientServices: ClientService[] = [
  { id: 'sv1', service_type: 'hosting', status: 'active', renewal_at: days(48), monthly_cost_kes: 3500, metadata: { domain: 'maridadi.press', uptime_30d: 99.97 }, created_at: days(-200) },
  { id: 'sv4', service_type: 'seo_retainer', status: 'active', renewal_at: days(12), monthly_cost_kes: 18000, metadata: {}, created_at: days(-90) },
];

export const mockClient = { tickets: clientTickets, invoices: clientInvoices, services: clientServices };

// ── Task view ──
const activeTasks: Task[] = [
  { id: 't1', ref: 'KWS-T-0042', category: 'web', urgency: 'elevated', status: 'in_progress', description: 'Migrate three internal dashboards onto Supabase (eu-west-1) and add server-side CSV export to each.', sla_deadline_at: hrs(6), created_at: days(-2), updated_at: hrs(-3) },
  { id: 't2', ref: 'KWS-T-0044', category: 'web', urgency: 'standard', status: 'paid', description: 'Integrate a booking calendar, wire Paystack for the payment leg, send confirmation email + admin dashboard entry.', sla_deadline_at: days(2), created_at: days(-1), updated_at: days(-1) },
];
const completedTasks: Task[] = [
  { id: 't5', ref: 'KWS-T-0039', category: 'web', urgency: 'standard', status: 'complete', description: 'Add newsletter signup + Mailchimp sync', sla_deadline_at: days(-3), created_at: days(-6), updated_at: days(-3) },
  { id: 't6', ref: 'KWS-T-0035', category: 'dns', urgency: 'standard', status: 'complete', description: 'SSL renewal + DNS cleanup', sla_deadline_at: days(-9), created_at: days(-12), updated_at: days(-9) },
];

export const mockTasks = { active: activeTasks, completed: completedTasks };
