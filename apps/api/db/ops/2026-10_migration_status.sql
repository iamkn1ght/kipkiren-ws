-- Which migrations has the live database got? READ-ONLY - safe to run anytime.
--
-- Paste into Supabase -> SQL Editor -> Run. Every row should say 'applied'.
-- For each 'MISSING' row, open the named file in apps/api/db/migrations/,
-- paste its whole contents into a NEW SQL editor tab and run it - one file
-- per run, in number order. (0008 and 0009 use ALTER TYPE ... ADD VALUE,
-- which Postgres refuses inside a combined multi-statement run with later
-- uses of the new value, so never paste two migrations together.)
-- Re-run this check afterwards to confirm.

select m.file, case when m.ok then 'applied' else 'MISSING' end as status
from (values
  ('0004_s7_onboarding_consent.sql',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'consent_given_at')),
  ('0005_s6_ssl_tracking.sql',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'client_services' and column_name = 'ssl_state')),
  ('0006_s9_agent_registry.sql',
     to_regclass('public.agent_registry') is not null),
  ('0007_s9_agent_executions.sql',
     to_regclass('public.agent_executions') is not null),
  ('0008_s8_client_notes_archived.sql',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'notes')),
  ('0009_billing.sql',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'care_started_at')
     and exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'kws_payment_gateway' and e.enumlabel = 'bank'))
) as m(file, ok)
order by m.file;

-- After 0009, the plan prices should match the website:
-- select name, build_fee_kes, monthly_fee_kes from public.retainer_plans order by monthly_fee_kes;
