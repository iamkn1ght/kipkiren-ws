-- ============================================================================
-- KWS Migration 0003 — INSERT-only enforcement (database layer)
--
-- ADR-KWS-001 + KWS-SEC-004 + KWS-SEC-012:
--   proforma_approvals and audit_log are evidentiary records. They cannot be
--   modified after the fact by any user, role, or application bug.
--
-- This migration enforces that at the database — not just in app code.
-- Two layers of defence:
--   1. REVOKE update/delete grants from authenticated/anon roles.
--   2. Triggers that raise an exception on UPDATE or DELETE (catches the
--      service role too, which would otherwise bypass RLS and grants).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Revoke update/delete grants
-- ----------------------------------------------------------------------------
revoke update, delete on public.proforma_approvals from authenticated, anon;
revoke update, delete on public.audit_log          from authenticated, anon;

-- payments: once a row is confirmed, it is also immutable. We can't revoke
-- update entirely (the pending → confirmed transition needs an update by the
-- service role), so we use a trigger guard below.

-- ----------------------------------------------------------------------------
-- 2. Hard triggers — apply to ALL roles, including service role
-- ----------------------------------------------------------------------------
create or replace function public.kws_block_update_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'kws_immutable_table: % is INSERT-only', tg_table_name
    using errcode = '42501';
end;
$$;

create trigger trg_proforma_approvals_no_update
  before update on public.proforma_approvals
  for each row execute function public.kws_block_update_delete();

create trigger trg_proforma_approvals_no_delete
  before delete on public.proforma_approvals
  for each row execute function public.kws_block_update_delete();

create trigger trg_audit_log_no_update
  before update on public.audit_log
  for each row execute function public.kws_block_update_delete();

create trigger trg_audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.kws_block_update_delete();

-- ----------------------------------------------------------------------------
-- 3. payments: confirmed rows are immutable
-- ----------------------------------------------------------------------------
create or replace function public.kws_payments_immutable_when_confirmed() returns trigger
language plpgsql as $$
begin
  if (tg_op = 'DELETE') then
    if (old.status = 'confirmed') then
      raise exception 'kws_payment_confirmed_immutable: cannot delete confirmed payment'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if (tg_op = 'UPDATE') then
    if (old.status = 'confirmed') then
      raise exception 'kws_payment_confirmed_immutable: cannot update confirmed payment'
        using errcode = '42501';
    end if;
    -- Also forbid downgrading from confirmed back to anything else.
    if (new.status <> 'confirmed' and old.status = 'confirmed') then
      raise exception 'kws_payment_confirmed_no_downgrade'
        using errcode = '42501';
    end if;
    return new;
  end if;

  return null;
end;
$$;

create trigger trg_payments_immutable
  before update or delete on public.payments
  for each row execute function public.kws_payments_immutable_when_confirmed();

-- ----------------------------------------------------------------------------
-- 4. content_hash integrity guard on proforma_approvals (KWS-SEC-004)
--    Asserts at INSERT time that content_hash_at_approval matches the current
--    proforma.content_hash. Hash is set at dispatch and frozen thereafter
--    by the trigger below on proformas.
-- ----------------------------------------------------------------------------
create or replace function public.kws_assert_proforma_hash_match() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  current_hash text;
begin
  select content_hash into current_hash from public.proformas where id = new.proforma_id;
  if current_hash is null then
    raise exception 'kws_proforma_not_dispatched: proforma % has no content_hash', new.proforma_id
      using errcode = '42501';
  end if;
  if current_hash <> new.content_hash_at_approval then
    raise exception 'kws_proforma_hash_mismatch: dispatched=% submitted=%',
      current_hash, new.content_hash_at_approval
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_proforma_approvals_hash_match
  before insert on public.proforma_approvals
  for each row execute function public.kws_assert_proforma_hash_match();

-- ----------------------------------------------------------------------------
-- 5. content_hash freeze on proformas after dispatch
--    Once dispatched (content_hash set), neither the hash nor any line item
--    references can change. Re-pricing requires a new proforma.
-- ----------------------------------------------------------------------------
create or replace function public.kws_proforma_post_dispatch_guard() returns trigger
language plpgsql as $$
begin
  if old.content_hash is not null then
    if new.content_hash is distinct from old.content_hash then
      raise exception 'kws_proforma_hash_immutable: content_hash cannot change after dispatch'
        using errcode = '42501';
    end if;
    if new.subtotal_kes <> old.subtotal_kes
       or new.discount_kes <> old.discount_kes
       or new.vat_kes <> old.vat_kes
       or new.total_kes <> old.total_kes then
      raise exception 'kws_proforma_amounts_immutable: amounts cannot change after dispatch'
        using errcode = '42501';
    end if;
    -- Status may still progress (dispatched → approved → ...) but cannot
    -- regress to ai_draft / under_review.
    if new.status in ('ai_draft','under_review') and old.status not in ('ai_draft','under_review') then
      raise exception 'kws_proforma_status_no_regress'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_proforma_post_dispatch_guard
  before update on public.proformas
  for each row execute function public.kws_proforma_post_dispatch_guard();

-- And freeze the line items themselves once their proforma has a content_hash.
create or replace function public.kws_proforma_line_items_frozen() returns trigger
language plpgsql as $$
declare
  hash text;
begin
  if (tg_op = 'INSERT') then
    select content_hash into hash from public.proformas where id = new.proforma_id;
    if hash is not null then
      raise exception 'kws_line_items_frozen: cannot insert into dispatched proforma'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if (tg_op = 'UPDATE' or tg_op = 'DELETE') then
    select content_hash into hash from public.proformas
      where id = coalesce(new.proforma_id, old.proforma_id);
    if hash is not null then
      raise exception 'kws_line_items_frozen: cannot modify dispatched proforma items'
        using errcode = '42501';
    end if;
    return coalesce(new, old);
  end if;

  return null;
end;
$$;

create trigger trg_proforma_line_items_frozen
  before insert or update or delete on public.proforma_line_items
  for each row execute function public.kws_proforma_line_items_frozen();
