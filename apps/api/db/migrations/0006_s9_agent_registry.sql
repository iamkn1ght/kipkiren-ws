-- ============================================================================
-- KWS Migration 0006 - Agent registry (KWS-S9-001)
-- Spec: kws_sprint_9.md §KWS-S9-001.
--
-- The formal registry of AI agents permitted to consume the KWS platform.
-- helpan-kws-v1 is the first entry. delivery_lead + admin read; strict admin
-- writes (KWS-SEC-009 style). Phase is the agentic-maturity phase (1/2/3).
-- ============================================================================

create table if not exists public.agent_registry (
  id                    uuid primary key default uuid_generate_v4(),
  agent_id              text unique not null,                 -- e.g. helpan-kws-v1
  name                  text not null,
  scope                 text[] not null default '{}',
  version               text not null,
  confidence_threshold  numeric(4,3) check (confidence_threshold is null or (confidence_threshold between 0 and 1)),
  human_review_required boolean not null default true,
  audit_log_required    boolean not null default true,
  phase                 integer not null default 1 check (phase in (1, 2, 3)),
  active                boolean not null default true,
  metadata              jsonb not null default '{}'::jsonb,   -- e.g. permitted_callers (documented, not DB-enforced - §52)
  created_at            timestamptz not null default now()
);
create index if not exists idx_agent_registry_active on public.agent_registry(active);

alter table public.agent_registry enable row level security;

-- delivery_lead + admin read (kws_is_admin covers both). Client + Kamau: no policy = deny.
create policy agent_registry_admin_select on public.agent_registry
  for select to authenticated using (public.kws_is_admin());

-- Strict admin writes only.
create policy agent_registry_admin_insert on public.agent_registry
  for insert to authenticated with check (public.kws_is_admin_strict());
create policy agent_registry_admin_update on public.agent_registry
  for update to authenticated
  using (public.kws_is_admin_strict()) with check (public.kws_is_admin_strict());

-- ----------------------------------------------------------------------------
-- Seed: helpan-kws-v1 (Phase 1). Scope + flags per kws_sprint_9.md §KWS-S9-001 AC#2.
-- confidence_threshold is the enrichment confidence floor - tunable by admin.
-- ----------------------------------------------------------------------------
insert into public.agent_registry
  (agent_id, name, scope, version, confidence_threshold, human_review_required, audit_log_required, phase, active, metadata)
values
  ('helpan-kws-v1', 'Helpan KWS',
   array['proforma_enrichment','confidence_amplification','sla_early_warning'],
   'v1', 0.700, true, true, 1, true,
   '{"permitted_callers":["helpan-kws-service"]}'::jsonb)
on conflict (agent_id) do nothing;
