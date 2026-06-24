-- ============================================================================
-- KWS Migration 0005 - SSL certificate tracking (KWS-S6-003)
--
-- Adds derived SSL state + expiry to client_services so the admin portal and
-- the uptime/health surface can flag certificates that are expiring or expired.
-- The state is computed by services/ssl.ts (classifySslState) from a live TLS
-- probe and persisted here; no new RLS policies needed - client_services
-- already enforces client isolation + admin-all in 0002_rls.sql.
-- ============================================================================

create type kws_ssl_state as enum ('unknown', 'valid', 'expiring', 'expired');

alter table public.client_services
  add column if not exists ssl_state           kws_ssl_state not null default 'unknown',
  add column if not exists ssl_expiry_at        timestamptz,
  add column if not exists ssl_last_checked_at  timestamptz;

-- Surface expiring/expired certs quickly for the health panel + alerts.
create index if not exists idx_client_services_ssl_expiry
  on public.client_services(ssl_expiry_at)
  where ssl_expiry_at is not null;
