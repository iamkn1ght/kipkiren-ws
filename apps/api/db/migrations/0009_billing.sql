-- ============================================================================
-- KWS Migration 0009 - Billing that works before Kipkiren Pay / Todoku
--
--   1. Prices follow the live site (Build + Care). retainer_plans.monthly_fee_kes
--      becomes the monthly CARE fee and a new build_fee_kes holds the one-time
--      build price. Enterprise stays a custom quote (0).
--   2. Bank transfer is a first-class payment gateway, so a payment confirmed
--      by an admin (bank / manual M-Pesa till) goes through the same
--      proforma_approvals + scope-lock path as a webhook.
--   3. invoices.kind gains 'onboarding' (the onboarding-fee route already
--      inserts it; the old check rejected it) and 'build'.
--   4. clients.care_started_at: monthly care billing starts once a site is live,
--      not at signup.
--   5. invoices record how they were paid.
--
-- Additive only. ALTER TYPE ... ADD VALUE cannot run inside the same
-- transaction that uses the new value, so run this file on its own.
-- ============================================================================

alter type kws_payment_gateway add value if not exists 'bank';

alter table public.invoices drop constraint if exists invoices_kind_check;
alter table public.invoices
  add constraint invoices_kind_check check (kind in ('retainer', 'task', 'onboarding', 'build'));

alter table public.invoices
  add column if not exists due_at          date,
  add column if not exists payment_method  text,
  add column if not exists payment_ref     text;

-- one care invoice per client per month
create unique index if not exists uq_invoices_retainer_period
  on public.invoices(client_id, period_start) where kind = 'retainer';

alter table public.retainer_plans
  add column if not exists build_fee_kes integer not null default 0 check (build_fee_kes >= 0);

update public.retainer_plans set monthly_fee_kes = 3500,  build_fee_kes = 45000  where name = 'Starter';
update public.retainer_plans set monthly_fee_kes = 7500,  build_fee_kes = 89000  where name = 'Growth';
update public.retainer_plans set monthly_fee_kes = 18000, build_fee_kes = 165000 where name = 'Business';

alter table public.clients
  add column if not exists care_started_at timestamptz;
