-- 029 — The Trend chart's settings follow you.
--
-- One nullable jsonb column on user_preferences: how the Trend chart in
-- Insights is drawn - line, area or bars, which series it opens on, whether
-- the line is curved, dotted, or has the average drawn on it. See
-- src/lib/trendSettings.js.
--
-- Until it is applied, lib/sync.js leaves the column out of the preferences
-- push and retries (OPTIONAL_COLS), so everything else in the row still
-- syncs - the chart is simply set up separately on each device.
--
-- The forecast's settings travel the same way through forecast_settings and
-- forecast_floor, added by 025 (row history); nothing new is needed for them.
--
-- Needs 003 (user_preferences). Safe to run twice: it adds one column if it
-- is not there, and touches nothing else.

alter table public.user_preferences
  add column if not exists trend_settings jsonb;

-- Check (read-only): expect three rows, all jsonb or numeric - the forecast's
-- two from 025, and this one.
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'user_preferences'
--   and column_name in ('forecast_settings', 'forecast_floor', 'trend_settings');
