-- 015 — The global carry-over switch follows you.
--
-- One nullable boolean on user_preferences, next to the currency, the accent
-- and the display name that are already there.
--
-- It is a preference and it lives in Dexie's `meta` table, which does not
-- sync - so it was the one setting that reset itself on a new device. Trivial
-- on its own, and not trivial in effect: it decides whether every category
-- carries its unspent budget into next month, so a fresh install silently
-- changed what the budget page reports.
--
-- Nullable rather than `default false`, so "never said" and "said no" stay
-- distinguishable. The client reads a null as off, which is the same answer,
-- but a default would have written an opinion for every row that exists now.

alter table public.user_preferences
  add column if not exists budget_rollover boolean;
