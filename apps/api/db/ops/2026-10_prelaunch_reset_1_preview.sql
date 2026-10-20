-- PRE-LAUNCH RESET, STEP 1 OF 2: PREVIEW (read-only, safe to run any time).
--
-- Shows exactly what step 2 (2026-10_prelaunch_reset_2_wipe.sql) would delete
-- and what it keeps. Nothing is changed here.
--
-- KEPT:    users with role 'admin' (and their Supabase sign-in), retainer plans,
--          the rate card, the agent registry.
-- DELETED: every client, every non-admin user (staff and client logins),
--          tickets, proformas (+ line items, approvals), payments, invoices,
--          client services, notifications, sessions, agent executions and the
--          audit log (step 2 then writes ONE audit row recording the reset).

-- 1. Who stays (must be at least one row, or step 2 refuses to run)
select 'KEEP admin' as action, u.email, u.full_name, u.created_at
from public.users u where u.role = 'admin'
order by u.created_at;

-- 2. Who goes
select 'DELETE user' as action, u.email, u.role, u.created_at
from public.users u where u.role <> 'admin'
union all
select 'DELETE sign-in only (no profile)', a.email, null, a.created_at
from auth.users a where not exists (select 1 from public.users u where u.id = a.id)
order by 1, 4;

select 'DELETE client' as action, c.business_name, c.email, c.status, c.created_at
from public.clients c order by c.created_at;

-- 3. Row counts that step 2 will remove
select t.tbl, t.rows from (
  select 'clients' as tbl, count(*) as rows from public.clients
  union all select 'tickets', count(*) from public.tickets
  union all select 'ticket_attachments', count(*) from public.ticket_attachments
  union all select 'proformas', count(*) from public.proformas
  union all select 'proforma_line_items', count(*) from public.proforma_line_items
  union all select 'proforma_approvals', count(*) from public.proforma_approvals
  union all select 'payments', count(*) from public.payments
  union all select 'invoices', count(*) from public.invoices
  union all select 'client_services', count(*) from public.client_services
  union all select 'notifications', count(*) from public.notifications
  union all select 'refresh_tokens (sessions)', count(*) from public.refresh_tokens
  union all select 'agent_executions', count(*) from public.agent_executions
  union all select 'audit_log', count(*) from public.audit_log
  union all select 'non-admin users', count(*) from public.users where role <> 'admin'
  union all select 'non-admin sign-ins (auth.users)', count(*) from auth.users a
    where a.id not in (select id from public.users where role = 'admin')
) t order by t.tbl;
