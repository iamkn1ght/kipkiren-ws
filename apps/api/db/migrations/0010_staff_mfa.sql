-- Migration 0010: two-factor authentication (authenticator app) for staff.
--
-- One row per staff user who has started or finished setting up two-factor.
-- enabled_at is null while setup is in progress (secret shown, first code not
-- yet confirmed). last_used_step stops a code being replayed.
--
-- Only the API's service role reads this table: RLS is on and forced, with no
-- policies, so the anon/authenticated roles see nothing.
--
-- Recovery (staff member lost their phone): an admin runs
--   delete from public.staff_mfa where user_id = '<their user id>';
-- and they set it up again at next sign-in.

create table if not exists public.staff_mfa (
  user_id         uuid primary key references public.users(id) on delete cascade,
  totp_secret     text not null,
  enabled_at      timestamptz,
  last_used_step  bigint,
  created_at      timestamptz not null default now()
);

alter table public.staff_mfa enable row level security;
alter table public.staff_mfa force row level security;
revoke all on public.staff_mfa from anon, authenticated;
