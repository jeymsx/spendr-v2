-- 012 — Filing somebody away.
--
-- One nullable column. A debts row with archived_at set is hidden from the
-- debts list and nothing else: the money still counts, the entries still
-- exist, and clearing the column brings the person back exactly as they were.
--
-- ── Why archiving is per ROW and not per person ──
--
-- There is no person table. A person is a name that some debts share (see
-- lib/people.js), so there is nothing else this could hang on - and that
-- turns out to be the better behaviour rather than a compromise. Archiving
-- stamps every row that person currently has, so a new debt recorded against
-- them later carries no stamp and they reappear on their own. Somebody you
-- put away in March who borrows again in June is back in June, and nobody had
-- to remember to un-archive them.
--
-- Deleting is still deleting, and it is a separate gesture on their page.
-- This is the one for "we are square and I do not want to look at it any
-- more", which was previously only expressible by destroying the history.
--
-- ── Not indexed, on purpose ──
--
-- The filter runs in the client over rows it already holds, so an index here
-- would cost writes to serve a query nobody makes. Locally it is not in the
-- Dexie schema either, for the same reason - IndexedDB stores the property
-- whether or not it is indexed, and only where() needs one.

alter table public.debts
  add column if not exists archived_at text;
