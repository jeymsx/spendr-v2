-- =============================================================
-- Spendr — transactions schema update
-- Run this after 001_init.sql on existing installations.
-- Fresh installs should use the updated 001_init.sql instead.
-- =============================================================

-- Rename date → transaction_date
ALTER TABLE public.transactions
  RENAME COLUMN date TO transaction_date;

-- Drop legacy columns replaced by from_account / to_account
ALTER TABLE public.transactions
  DROP COLUMN IF EXISTS payment,
  DROP COLUMN IF EXISTS account;

-- Auto-set updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for per-user chronological queries
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON public.transactions (user_id, transaction_date DESC);
