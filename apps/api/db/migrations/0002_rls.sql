-- ============================================================================
-- KWS Migration 0002 - Row-Level Security policies
-- KWS-SEC-002 - client data isolation. Last line of defence.
-- KWS-SEC-007 - Kamau (technical_delivery) zero client-data surface.
-- ============================================================================
--
-- Roles assumed (Supabase native):
--   authenticated  - any logged-in user
--   anon           - public, no JWT
--
-- KWS role distinction lives on public.users.role and is asserted via JWT
-- claim `role` plus a join to public.users on auth.uid().
--
-- Helper functions read the request JWT once per row evaluation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions (security definer, search_path locked)
-- ----------------------------------------------------------------------------
create or replace function public.kws_current_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.users where id = auth.uid();
$$;

create or replace function public.kws_current_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.users where id = auth.uid();
$$;

create or replace function public.kws_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','delivery_lead') from public.users where id = auth.uid()), false);
$$;

create or replace function public.kws_is_admin_strict() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false);
$$;

create or replace function public.kws_is_delivery_lead() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'delivery_lead' from public.users where id = auth.uid()), false);
$$;

create or replace function public.kws_is_technical_delivery() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'technical_delivery' from public.users where id = auth.uid()), false);
$$;

-- Restrict helper execution to authenticated requests only.
revoke all on function public.kws_current_role()         from public, anon;
revoke all on function public.kws_current_client_id()    from public, anon;
revoke all on function public.kws_is_admin()             from public, anon;
revoke all on function public.kws_is_admin_strict()      from public, anon;
revoke all on function public.kws_is_delivery_lead()     from public, anon;
revoke all on function public.kws_is_technical_delivery() from public, anon;
grant execute on function public.kws_current_role()         to authenticated;
grant execute on function public.kws_current_client_id()    to authenticated;
grant execute on function public.kws_is_admin()             to authenticated;
grant execute on function public.kws_is_admin_strict()      to authenticated;
grant execute on function public.kws_is_delivery_lead()     to authenticated;
grant execute on function public.kws_is_technical_delivery() to authenticated;

-- ----------------------------------------------------------------------------
-- Enable RLS on every public table (KWS-SEC-002)
-- ----------------------------------------------------------------------------
alter table public.users               enable row level security;
alter table public.retainer_plans      enable row level security;
alter table public.clients             enable row level security;
alter table public.rate_card           enable row level security;
alter table public.tickets             enable row level security;
alter table public.ticket_attachments  enable row level security;
alter table public.proformas           enable row level security;
alter table public.proforma_line_items enable row level security;
alter table public.proforma_approvals  enable row level security;
alter table public.payments            enable row level security;
alter table public.invoices            enable row level security;
alter table public.client_services     enable row level security;
alter table public.notifications       enable row level security;
alter table public.refresh_tokens      enable row level security;
alter table public.audit_log           enable row level security;

-- Force RLS even for table owners reaching via PostgREST (defence in depth).
alter table public.proforma_approvals  force row level security;
alter table public.audit_log           force row level security;
alter table public.payments            force row level security;
alter table public.rate_card           force row level security;

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
create policy users_self_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.kws_is_admin());

create policy users_admin_write on public.users
  for all to authenticated
  using (public.kws_is_admin_strict())
  with check (public.kws_is_admin_strict());

-- ----------------------------------------------------------------------------
-- retainer_plans  (read-mostly catalogue)
-- ----------------------------------------------------------------------------
create policy retainer_plans_read_all on public.retainer_plans
  for select to authenticated using (true);

create policy retainer_plans_admin_write on public.retainer_plans
  for all to authenticated
  using (public.kws_is_admin_strict())
  with check (public.kws_is_admin_strict());

-- ----------------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------------
create policy clients_self_select on public.clients
  for select to authenticated
  using (id = public.kws_current_client_id() or public.kws_is_admin());

create policy clients_admin_write on public.clients
  for all to authenticated
  using (public.kws_is_admin())
  with check (public.kws_is_admin());

-- ----------------------------------------------------------------------------
-- rate_card  (ADR-KWS-004, KWS-SEC-009)
-- ----------------------------------------------------------------------------
create policy rate_card_read_all on public.rate_card
  for select to authenticated using (active or public.kws_is_admin());

-- Writes restricted to STRICT admin (not delivery_lead). KWS-SEC-009.
create policy rate_card_admin_insert on public.rate_card
  for insert to authenticated with check (public.kws_is_admin_strict());
create policy rate_card_admin_update on public.rate_card
  for update to authenticated
  using (public.kws_is_admin_strict()) with check (public.kws_is_admin_strict());
-- No delete policy → delete denied. Versioning instead (deactivate).

-- ----------------------------------------------------------------------------
-- tickets
-- ----------------------------------------------------------------------------
create policy tickets_client_select on public.tickets
  for select to authenticated
  using (client_id = public.kws_current_client_id());

create policy tickets_client_insert on public.tickets
  for insert to authenticated
  with check (
    client_id = public.kws_current_client_id()
    and public.kws_current_role() = 'client'
  );

create policy tickets_admin_all on public.tickets
  for all to authenticated
  using (public.kws_is_admin())
  with check (public.kws_is_admin());

-- KWS-SEC-007 + ADR-KWS-003: Kamau sees ONLY assigned tickets, no client_id join.
-- The application layer must additionally strip client PII columns from any
-- response served to technical_delivery - RLS gives row-level scoping; column
-- masking happens in the API resource serializer.
create policy tickets_kamau_assigned on public.tickets
  for select to authenticated
  using (public.kws_is_technical_delivery() and assigned_to = auth.uid());

create policy tickets_kamau_status_update on public.tickets
  for update to authenticated
  using (public.kws_is_technical_delivery() and assigned_to = auth.uid())
  with check (public.kws_is_technical_delivery() and assigned_to = auth.uid());

-- ----------------------------------------------------------------------------
-- ticket_attachments
-- ----------------------------------------------------------------------------
create policy ticket_attachments_client_rw on public.ticket_attachments
  for all to authenticated
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_attachments.ticket_id
        and t.client_id = public.kws_current_client_id()
    )
  )
  with check (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_attachments.ticket_id
        and t.client_id = public.kws_current_client_id()
    )
  );

create policy ticket_attachments_admin_all on public.ticket_attachments
  for all to authenticated using (public.kws_is_admin()) with check (public.kws_is_admin());

-- ----------------------------------------------------------------------------
-- proformas
-- ----------------------------------------------------------------------------
create policy proformas_client_select on public.proformas
  for select to authenticated
  using (
    exists (
      select 1 from public.tickets t
      where t.id = proformas.ticket_id
        and t.client_id = public.kws_current_client_id()
    )
  );

create policy proformas_admin_all on public.proformas
  for all to authenticated using (public.kws_is_admin()) with check (public.kws_is_admin());

-- Kamau cannot see proformas at all (ADR-KWS-003). Absence of policy = deny.

-- ----------------------------------------------------------------------------
-- proforma_line_items
-- ----------------------------------------------------------------------------
create policy proforma_line_items_client_select on public.proforma_line_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.proformas p
      join public.tickets t on t.id = p.ticket_id
      where p.id = proforma_line_items.proforma_id
        and t.client_id = public.kws_current_client_id()
    )
  );

create policy proforma_line_items_admin_all on public.proforma_line_items
  for all to authenticated using (public.kws_is_admin()) with check (public.kws_is_admin());

-- ----------------------------------------------------------------------------
-- proforma_approvals - INSERT-only at app level (see 0003_insert_only.sql).
-- Read scoped to owner client + admin.
-- ----------------------------------------------------------------------------
create policy proforma_approvals_client_select on public.proforma_approvals
  for select to authenticated
  using (client_id = public.kws_current_client_id());

create policy proforma_approvals_admin_select on public.proforma_approvals
  for select to authenticated using (public.kws_is_admin());

-- INSERT path: client may insert their own approval IF the proforma is for them.
-- The content_hash check is enforced in the API layer + the unique idempotency_key.
create policy proforma_approvals_client_insert on public.proforma_approvals
  for insert to authenticated
  with check (
    client_id = public.kws_current_client_id()
    and exists (
      select 1
      from public.proformas p
      join public.tickets t on t.id = p.ticket_id
      where p.id = proforma_approvals.proforma_id
        and t.client_id = public.kws_current_client_id()
    )
  );

-- ----------------------------------------------------------------------------
-- payments - server-side only (service-role bypasses RLS for webhook handlers).
-- Authenticated users may READ their own payments via proforma join.
-- ----------------------------------------------------------------------------
create policy payments_client_select on public.payments
  for select to authenticated
  using (
    exists (
      select 1
      from public.proformas p
      join public.tickets t on t.id = p.ticket_id
      where p.id = payments.proforma_id
        and t.client_id = public.kws_current_client_id()
    )
  );

create policy payments_admin_select on public.payments
  for select to authenticated using (public.kws_is_admin());

-- No INSERT/UPDATE policies for non-service roles → only the service role
-- (via webhook handler) can write payments.

-- ----------------------------------------------------------------------------
-- invoices
-- ----------------------------------------------------------------------------
create policy invoices_client_select on public.invoices
  for select to authenticated
  using (client_id = public.kws_current_client_id());

create policy invoices_admin_all on public.invoices
  for all to authenticated using (public.kws_is_admin()) with check (public.kws_is_admin());

-- ----------------------------------------------------------------------------
-- client_services
-- ----------------------------------------------------------------------------
create policy client_services_client_select on public.client_services
  for select to authenticated
  using (client_id = public.kws_current_client_id());

create policy client_services_admin_all on public.client_services
  for all to authenticated using (public.kws_is_admin()) with check (public.kws_is_admin());

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
create policy notifications_self on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy notifications_self_update on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_admin_all on public.notifications
  for all to authenticated using (public.kws_is_admin()) with check (public.kws_is_admin());

-- ----------------------------------------------------------------------------
-- refresh_tokens - service-role only. No policies for authenticated → deny.
-- The auth flow uses the service-role client to read/write refresh tokens.
-- ----------------------------------------------------------------------------
-- (Intentionally no policies created.)

-- ----------------------------------------------------------------------------
-- audit_log - read for admin only. INSERT permitted but locked further in 0003.
-- ----------------------------------------------------------------------------
create policy audit_log_admin_select on public.audit_log
  for select to authenticated using (public.kws_is_admin());
