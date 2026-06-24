-- ============================================================================
-- KWS Migration 0007 - Agent execution ledger (KWS-S9-004)
-- Spec: kws_sprint_9.md §KWS-S9-004.
--
-- Append-only evidentiary ledger of every autonomous action an agent takes
-- (e.g. a DNS change). One row per state event (started, then complete/failed/
-- escalated), so the full lifecycle is reconstructable and immutable - same
-- INSERT-only discipline as audit_log (0003). The execution path is gated by
-- the AGENT_DNS_EXECUTION_ENABLED flag and the proforma-approval + content-hash
-- guard (services/agent-execution.ts), and stays OFF until the helpan-kws-service
-- JWT (KWS-S9-002) is issued.
-- ============================================================================

create type kws_agent_exec_status as enum ('started', 'complete', 'failed', 'escalated');

create table if not exists public.agent_executions (
  id                     uuid primary key default uuid_generate_v4(),
  agent_id               text not null references public.agent_registry(agent_id) on delete restrict,
  action                 text not null,                       -- e.g. dns.create_record
  ticket_id              uuid references public.tickets(id) on delete set null,
  proforma_approval_id   uuid references public.proforma_approvals(id) on delete set null,
  status                 kws_agent_exec_status not null,
  params_snapshot        jsonb not null default '{}'::jsonb,
  before_state_snapshot  jsonb,
  after_state_snapshot   jsonb,
  error                  text,
  created_at             timestamptz not null default now()
);
create index if not exists idx_agent_executions_agent on public.agent_executions(agent_id, created_at desc);
create index if not exists idx_agent_executions_ticket on public.agent_executions(ticket_id);

alter table public.agent_executions enable row level security;
alter table public.agent_executions force row level security;

-- Admin/delivery_lead read. Writes happen via the service-role client only.
create policy agent_executions_admin_select on public.agent_executions
  for select to authenticated using (public.kws_is_admin());

-- Immutable: no update/delete for anyone, including the service role.
revoke update, delete on public.agent_executions from authenticated, anon;

create trigger trg_agent_executions_no_update
  before update on public.agent_executions
  for each row execute function public.kws_block_update_delete();

create trigger trg_agent_executions_no_delete
  before delete on public.agent_executions
  for each row execute function public.kws_block_update_delete();
