-- ============================================================================
-- KWS — bootstrap login users (dev / first-admin setup)
-- ============================================================================
-- Login = Supabase Auth (password, in auth.users) + an app profile row
-- (public.users, same UUID). This seed creates both for two test logins:
--   • admin@ws.kipkiren.co.ke          role: admin
--   • kamau@ws.kipkiren.co.ke          role: technical_delivery  (task-view)
--
-- ⚠️ CHANGE THE PASSWORDS below before running, and rotate after first login.
-- Run in the Supabase SQL Editor of the KWS project (eu-west-1).
--
-- A `client`-role login additionally needs a public.clients row (with a
-- retainer_plan_id) and client_id set on its profile — not covered here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- OPTION A (RECOMMENDED — version-independent, reliable)
--   1. Supabase Dashboard → Authentication → Users → "Add user":
--      create each email + password, tick "Auto Confirm User".
--   2. Then run THIS to create the matching app profile (looks up the UUID by
--      email, so you never copy UUIDs by hand). Safe to re-run.
-- ----------------------------------------------------------------------------
insert into public.users (id, email, full_name, role, client_id)
select id, email, 'KWS Admin', 'admin', null
from auth.users where email = 'admin@ws.kipkiren.co.ke'
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

insert into public.users (id, email, full_name, role, client_id)
select id, email, 'Kamau Waweru', 'technical_delivery', null
from auth.users where email = 'kamau@ws.kipkiren.co.ke'
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

-- ----------------------------------------------------------------------------
-- OPTION B (FULLY SQL — no dashboard; auth.identities shape can vary by
--   GoTrue version, so if either INSERT errors, use Option A instead).
--   Uncomment to use. Edit the two passwords first.
-- ----------------------------------------------------------------------------
-- create extension if not exists pgcrypto;
--
-- do $$
-- declare
--   v_admin uuid := gen_random_uuid();
--   v_kamau uuid := gen_random_uuid();
-- begin
--   -- auth users (bcrypt password, email pre-confirmed)
--   insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
--       email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
--   values
--     ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated',
--      'admin@ws.kipkiren.co.ke', crypt('CHANGE_ME_admin', gen_salt('bf')),
--      now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
--     ('00000000-0000-0000-0000-000000000000', v_kamau, 'authenticated', 'authenticated',
--      'kamau@ws.kipkiren.co.ke', crypt('CHANGE_ME_kamau', gen_salt('bf')),
--      now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}');
--
--   -- email identities (required by GoTrue for password sign-in)
--   insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
--   values
--     ('admin@ws.kipkiren.co.ke', v_admin,
--      jsonb_build_object('sub', v_admin::text, 'email', 'admin@ws.kipkiren.co.ke'), 'email', now(), now()),
--     ('kamau@ws.kipkiren.co.ke', v_kamau,
--      jsonb_build_object('sub', v_kamau::text, 'email', 'kamau@ws.kipkiren.co.ke'), 'email', now(), now());
--
--   -- app profiles
--   insert into public.users (id, email, full_name, role) values
--     (v_admin, 'admin@ws.kipkiren.co.ke', 'KWS Admin', 'admin'),
--     (v_kamau, 'kamau@ws.kipkiren.co.ke', 'Kamau Waweru', 'technical_delivery');
-- end $$;
