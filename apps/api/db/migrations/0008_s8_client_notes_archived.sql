-- ============================================================================
-- KWS Migration 0008 - Client notes + archived status (KWS-S8-001 follow-up)
--
-- S8-001 onboarding shipped while migrations were unappliable, so admin notes
-- currently live only in the audit_log payload and there is no way to retire a
-- client without suspending them. This adds both. Additive only: no data is
-- changed, existing rows get notes = null and keep their status.
--
-- Run 0005-0007 first. ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction that adds it, so run this file on its own.
-- ============================================================================

alter type kws_client_status add value if not exists 'archived';

alter table public.clients
  add column if not exists notes text;
