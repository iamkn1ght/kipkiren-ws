-- ============================================================================
-- KWS Migration 0001 - Core schema
-- Architecture ref: kws_architecture_v1.md §4 (15 core tables)
-- Sprint gate: KWS-S1
-- Region: af-south-1 ONLY (KWS-SEC-014) - verify project region before applying
-- ============================================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type kws_user_role as enum ('client', 'delivery_lead', 'technical_delivery', 'admin');
create type kws_client_status as enum ('active', 'suspended');
create type kws_ticket_category as enum ('web', 'cloud', 'seo', 'social', 'dns', 'general');
create type kws_ticket_urgency as enum ('standard', 'elevated', 'urgent');
create type kws_ticket_status as enum (
  'submitted', 'decomposing', 'ai_draft', 'review',
  'dispatched', 'approved', 'paid', 'in_progress', 'complete', 'closed'
);
create type kws_proforma_status as enum (
  'ai_draft', 'under_review', 'dispatched', 'approved', 'rejected', 'expired'
);
create type kws_payment_gateway as enum ('mpesa', 'paystack');
create type kws_payment_status as enum ('pending', 'confirmed', 'failed');
create type kws_rate_category as enum ('cloud', 'web', 'seo', 'social', 'dns');
create type kws_rate_complexity as enum ('simple', 'standard', 'complex');
create type kws_service_type as enum (
  'hosting', 'domain', 'workspace', 'microsoft365', 'ssl', 'seo_retainer', 'social_retainer'
);
create type kws_service_status as enum ('active', 'expiring', 'expired', 'suspended');

-- ----------------------------------------------------------------------------
-- 1. users  (mirrors Supabase auth.users; FKs use auth.uid())
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id           uuid primary key,                    -- = auth.users.id
  email        citext unique not null,
  full_name    text,
  role         kws_user_role not null default 'client',
  client_id    uuid,                                -- nullable until linked
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.users is 'Application user profile mirroring auth.users. role drives KWS-SEC-007 enforcement.';

-- ----------------------------------------------------------------------------
-- 2. retainer_plans
-- ----------------------------------------------------------------------------
create table if not exists public.retainer_plans (
  id                  uuid primary key default uuid_generate_v4(),
  name                text unique not null,                  -- Starter | Growth | Business | Enterprise
  monthly_fee_kes     integer not null check (monthly_fee_kes >= 0),
  included_hours      numeric(6,2) not null check (included_hours >= 0),
  max_open_tickets    integer not null check (max_open_tickets >= 0),
  sla_response_hours  integer not null check (sla_response_hours > 0),
  task_discount_pct   numeric(5,2) not null default 0 check (task_discount_pct between 0 and 100),
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. clients
-- ----------------------------------------------------------------------------
create table if not exists public.clients (
  id                uuid primary key default uuid_generate_v4(),
  business_name     text not null,
  contact_name      text not null,
  email             citext unique not null,
  phone             text,
  retainer_plan_id  uuid not null references public.retainer_plans(id) on delete restrict,
  status            kws_client_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_clients_status on public.clients(status);

alter table public.users
  add constraint users_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 4. rate_card  (ADR-KWS-004)
-- ----------------------------------------------------------------------------
create table if not exists public.rate_card (
  id                    uuid primary key default uuid_generate_v4(),
  category              kws_rate_category not null,
  task_name             text not null,
  task_description      text,
  estimated_hours       numeric(6,2) not null check (estimated_hours > 0),
  base_rate_kes_per_hour integer not null check (base_rate_kes_per_hour > 0),
  fixed_price_kes       integer not null check (fixed_price_kes > 0),
  complexity            kws_rate_complexity not null default 'standard',
  version               text not null default '1.0',
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (task_name, version)
);
create index if not exists idx_rate_card_active on public.rate_card(category) where active;

-- ----------------------------------------------------------------------------
-- 5. tickets
-- ----------------------------------------------------------------------------
create table if not exists public.tickets (
  id              uuid primary key default uuid_generate_v4(),
  ref             text unique not null,                      -- KWS-XXX
  client_id       uuid not null references public.clients(id) on delete restrict,
  submitted_by    uuid references public.users(id) on delete set null,
  description     text not null,
  category        kws_ticket_category not null,
  urgency         kws_ticket_urgency not null default 'standard',
  status          kws_ticket_status not null default 'submitted',
  sla_deadline_at timestamptz,
  assigned_to     uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_tickets_client on public.tickets(client_id);
create index if not exists idx_tickets_assigned on public.tickets(assigned_to);
create index if not exists idx_tickets_status on public.tickets(status);
create index if not exists idx_tickets_sla on public.tickets(sla_deadline_at) where status not in ('complete','closed');

-- ----------------------------------------------------------------------------
-- 6. ticket_attachments
-- ----------------------------------------------------------------------------
create table if not exists public.ticket_attachments (
  id              uuid primary key default uuid_generate_v4(),
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  storage_path    text not null,
  filename        text not null,
  content_type    text,
  size_bytes      bigint check (size_bytes >= 0),
  uploaded_by     uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_ticket_attachments_ticket on public.ticket_attachments(ticket_id);

-- ----------------------------------------------------------------------------
-- 7. proformas
-- ----------------------------------------------------------------------------
create table if not exists public.proformas (
  id                    uuid primary key default uuid_generate_v4(),
  ref                   text unique not null,                -- KWS-042
  ticket_id             uuid not null references public.tickets(id) on delete restrict,
  ai_confidence_score   numeric(4,3) check (ai_confidence_score between 0 and 1),
  ai_flag_reason        text,
  subtotal_kes          integer not null check (subtotal_kes >= 0),
  discount_kes          integer not null default 0 check (discount_kes >= 0),
  vat_kes               integer not null check (vat_kes >= 0),
  total_kes             integer not null check (total_kes >= 0),
  status                kws_proforma_status not null default 'ai_draft',
  content_hash          text,                                -- SHA-256 hex, set at dispatch
  dispatched_at         timestamptz,
  expires_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_proformas_ticket on public.proformas(ticket_id);
create index if not exists idx_proformas_status on public.proformas(status);

-- ----------------------------------------------------------------------------
-- 8. proforma_line_items
-- ----------------------------------------------------------------------------
create table if not exists public.proforma_line_items (
  id                  uuid primary key default uuid_generate_v4(),
  proforma_id         uuid not null references public.proformas(id) on delete cascade,
  task_name           text not null,
  task_description    text,
  estimated_hours     numeric(6,2) not null check (estimated_hours > 0),
  rate_kes_per_hour   integer not null check (rate_kes_per_hour > 0),
  amount_kes          integer not null check (amount_kes > 0),
  rate_card_entry_id  uuid references public.rate_card(id) on delete restrict,
  position            integer not null default 0
);
create index if not exists idx_proforma_line_items_proforma on public.proforma_line_items(proforma_id);

-- ----------------------------------------------------------------------------
-- 9. proforma_approvals  ⚠️ INSERT-ONLY (RLS revokes update/delete in 0003)
-- ----------------------------------------------------------------------------
create table if not exists public.proforma_approvals (
  id                        uuid primary key default uuid_generate_v4(),
  proforma_id               uuid not null unique references public.proformas(id) on delete restrict,
  client_id                 uuid not null references public.clients(id) on delete restrict,
  approved_at               timestamptz not null default now(),
  content_hash_at_approval  text not null,                   -- must equal proforma.content_hash
  payment_ref               text not null,
  idempotency_key           text not null unique
);
comment on table public.proforma_approvals is
  'INSERT-ONLY. Legal record of client scope commitment. No UPDATE/DELETE granted to any application role.';

-- ----------------------------------------------------------------------------
-- 10. payments  ⚠️ INSERT-ONLY once status=confirmed
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id                    uuid primary key default uuid_generate_v4(),
  proforma_id           uuid not null references public.proformas(id) on delete restrict,
  gateway               kws_payment_gateway not null,
  gateway_ref           text not null,
  amount_kes            integer not null check (amount_kes > 0),
  status                kws_payment_status not null default 'pending',
  idempotency_key       text not null unique,
  webhook_payload_hash  text,                                -- KWS-SEC-006 replay defence
  confirmed_at          timestamptz,
  created_at            timestamptz not null default now()
);
create unique index if not exists uq_payments_gateway_ref on public.payments(gateway, gateway_ref);

-- ----------------------------------------------------------------------------
-- 11. invoices  (retainer + task billing reference for /invoices endpoint)
-- ----------------------------------------------------------------------------
create table if not exists public.invoices (
  id              uuid primary key default uuid_generate_v4(),
  ref             text unique not null,                      -- KWS-INV-XXX
  client_id       uuid not null references public.clients(id) on delete restrict,
  proforma_id     uuid references public.proformas(id) on delete set null,
  kind            text not null check (kind in ('retainer','task')),
  period_start    date,
  period_end      date,
  subtotal_kes    integer not null check (subtotal_kes >= 0),
  vat_kes         integer not null check (vat_kes >= 0),
  total_kes       integer not null check (total_kes >= 0),
  issued_at       timestamptz not null default now(),
  paid_at         timestamptz
);
create index if not exists idx_invoices_client on public.invoices(client_id);

-- ----------------------------------------------------------------------------
-- 12. client_services
-- ----------------------------------------------------------------------------
create table if not exists public.client_services (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  service_type      kws_service_type not null,
  status            kws_service_status not null default 'active',
  renewal_at        timestamptz,
  monthly_cost_kes  integer not null default 0 check (monthly_cost_kes >= 0),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists idx_client_services_client on public.client_services(client_id);

-- ----------------------------------------------------------------------------
-- 13. notifications  (in-portal notification feed)
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.users(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text,
  link         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_notifications_user_unread on public.notifications(user_id) where read_at is null;

-- ----------------------------------------------------------------------------
-- 14. refresh_tokens  (rotating refresh family - KWS-SEC-001)
-- ----------------------------------------------------------------------------
create table if not exists public.refresh_tokens (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  family_id       uuid not null,
  token_hash      text not null unique,                      -- SHA-256 of opaque token
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  replaced_by     uuid references public.refresh_tokens(id) on delete set null,
  user_agent      text,
  ip_addr         inet
);
create index if not exists idx_refresh_tokens_family on public.refresh_tokens(family_id);
create index if not exists idx_refresh_tokens_user on public.refresh_tokens(user_id);

-- ----------------------------------------------------------------------------
-- 15. audit_log  ⚠️ INSERT-ONLY, NEVER DELETED  (KWS-SEC-012)
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id               uuid primary key default uuid_generate_v4(),
  actor_id         uuid references public.users(id) on delete set null,
  actor_role       text,
  event_type       text not null,                            -- proforma_dispatched | payment_confirmed | scope_locked | rate_card_modified | ...
  entity_type      text not null,
  entity_id        uuid,
  payload_snapshot jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists idx_audit_log_entity on public.audit_log(entity_type, entity_id);
create index if not exists idx_audit_log_event on public.audit_log(event_type, created_at desc);
comment on table public.audit_log is
  'INSERT-ONLY. Non-repudiable evidentiary record. No UPDATE/DELETE granted to any application role.';

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------
create or replace function public.kws_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated_at      before update on public.users      for each row execute function public.kws_set_updated_at();
create trigger trg_clients_updated_at    before update on public.clients    for each row execute function public.kws_set_updated_at();
create trigger trg_tickets_updated_at    before update on public.tickets    for each row execute function public.kws_set_updated_at();
create trigger trg_proformas_updated_at  before update on public.proformas  for each row execute function public.kws_set_updated_at();
