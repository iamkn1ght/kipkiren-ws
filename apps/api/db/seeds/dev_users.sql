-- ============================================================================
-- KWS - bootstrap login users for BOTH portals (admin + client) + task view
-- ============================================================================
-- Login = Supabase Auth (password, in auth.users) + an app profile row
-- (public.users, same UUID). A `client`-role login also needs a clients row
-- (with a retainer_plan_id) and client_id on its profile.
--
-- HOW TO RUN (reliable, no DB password needed - uses your dashboard session):
--   STEP 1 - Supabase → Authentication → Users → "Add user" (tick Auto Confirm)
--            for each of these (CHANGE the passwords after first login):
--              admin@ws.kipkiren.co.ke     →  KwsAdmin#2026      (admin portal)
--              client@demo.co.ke           →  KwsClient#2026     (client portal)
--              kamau@ws.kipkiren.co.ke     →  KwsKamau#2026      (task view)
--   STEP 2 - Supabase → SQL Editor → paste & run everything below.
--            (It links profiles to the auth users by email - no UUID copying.)
--
-- Requires migrations 0001-0004 applied. If these tables don't exist, run the
-- migrations in apps/api/db/migrations first.
-- ============================================================================

-- 1) Ensure a retainer plan exists (the client must reference one).
insert into public.retainer_plans
  (name, monthly_fee_kes, included_hours, max_open_tickets, sla_response_hours, task_discount_pct, active)
select 'Starter', 15000, 5, 5, 48, 0, true
where not exists (select 1 from public.retainer_plans where name = 'Starter');

-- 2) Demo client business, linked to the Starter plan.
insert into public.clients
  (business_name, contact_name, email, phone, retainer_plan_id, status)
select 'Demo SME Ltd', 'Demo Client', 'client@demo.co.ke', '+254700000000', rp.id, 'active'
from public.retainer_plans rp
where rp.name = 'Starter'
  and not exists (select 1 from public.clients where email = 'client@demo.co.ke');

-- 3) Admin profile (auth user created in STEP 1).
insert into public.users (id, email, full_name, role, client_id)
select id, email, 'KWS Admin', 'admin', null
from auth.users where email = 'admin@ws.kipkiren.co.ke'
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

-- 4) Kamau - technical_delivery (task view).
insert into public.users (id, email, full_name, role, client_id)
select id, email, 'Kamau Waweru', 'technical_delivery', null
from auth.users where email = 'kamau@ws.kipkiren.co.ke'
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

-- 5) Client profile, linked to the demo client business.
insert into public.users (id, email, full_name, role, client_id)
select au.id, au.email, 'Demo Client', 'client', c.id
from auth.users au
join public.clients c on c.email = 'client@demo.co.ke'
where au.email = 'client@demo.co.ke'
on conflict (id) do update set role = excluded.role, client_id = excluded.client_id;

-- Verify:
--   select u.email, u.role, c.business_name
--   from public.users u left join public.clients c on c.id = u.client_id
--   order by u.role;
