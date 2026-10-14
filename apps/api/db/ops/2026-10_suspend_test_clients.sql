-- ============================================================================
-- One-off ops: retire the ZZZ diagnostic/test clients created while debugging
-- signup and login in July 2026. Suspends (never deletes) so the audit trail
-- and any FK history stay intact.
--
-- Step 1: review what will change. Run this alone first.
-- ============================================================================

select id, business_name, email, status, created_at
from public.clients
where business_name ilike 'ZZZ%'
order by created_at;

-- ============================================================================
-- Step 2: once the list above is only test accounts, run this.
-- ============================================================================

-- update public.clients
--    set status = 'suspended', updated_at = now()
--  where business_name ilike 'ZZZ%'
--    and status = 'active';
