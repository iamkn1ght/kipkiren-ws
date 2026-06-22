-- Migration 0004: S7 - Onboarding fee invoice kind + KDPA consent tracking
--
-- 1. Widen the invoices.kind CHECK constraint to allow 'onboarding'
-- 2. Add consent_given_at to users table for KDPA compliance

-- ── 1. Allow 'onboarding' invoice kind ──────────────────────────────────
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_kind_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_kind_check
  CHECK (kind IN ('retainer', 'task', 'onboarding'));

-- ── 2. KDPA consent tracking ────────────────────────────────────────────
-- Explicit consent timestamp per KDPA 2019 §30. NULL = consent not yet given.
-- Consent must be collected at client onboarding before processing personal data.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS consent_given_at timestamptz;
