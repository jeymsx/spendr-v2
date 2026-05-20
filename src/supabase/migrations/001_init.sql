-- =============================================================
-- Spendr — initial schema
-- Run this in the Supabase SQL editor for your project.
-- =============================================================

-- ── transactions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  local_id         INTEGER,        -- Dexie auto-increment id (device-specific)
  tx_id            TEXT,           -- stable dedup key from Spendr exports
  type             TEXT,
  transaction_date TEXT,
  description      TEXT,
  category         TEXT,
  from_account     TEXT,
  to_account       TEXT,
  amount           NUMERIC,
  synced           BOOLEAN DEFAULT false,
  updated_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, local_id),
  UNIQUE (user_id, tx_id)
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions: own rows only"
  ON public.transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

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

-- ── accounts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  local_id         INTEGER,
  name             TEXT,
  type             TEXT,
  balance          NUMERIC,
  currency         TEXT,
  credit_limit     NUMERIC,
  statement_date   TEXT,
  due_date         TEXT,
  cutoff_date      TEXT,
  minimum_payment  NUMERIC,
  color            TEXT,
  updated_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, local_id),
  UNIQUE (user_id, name)
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts: own rows only"
  ON public.accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── categories ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  local_id   INTEGER,
  name       TEXT,
  icon       TEXT,
  color      TEXT,
  type       TEXT,
  budget     NUMERIC,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, local_id),
  UNIQUE (user_id, name, type)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories: own rows only"
  ON public.categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── debts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.debts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  local_id    INTEGER,
  name        TEXT,
  contact     TEXT,
  amount      NUMERIC,
  amount_paid NUMERIC,
  due_date    TEXT,
  type        TEXT,
  notes       TEXT,
  created_at  TEXT,
  updated_at  TIMESTAMPTZ,
  UNIQUE (user_id, local_id)
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debts: own rows only"
  ON public.debts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── recurring ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recurring (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  local_id   INTEGER,
  name       TEXT,
  amount     NUMERIC,
  category   TEXT,
  account    TEXT,
  frequency  TEXT,
  next_date  TEXT,
  active     BOOLEAN,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, local_id)
);

ALTER TABLE public.recurring ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring: own rows only"
  ON public.recurring FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
