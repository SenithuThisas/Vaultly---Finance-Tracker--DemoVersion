-- =============================================================================
-- Vaultly Finance Tracker - Supabase Schema Fix Migration
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- =============================================================================

-- 1. Add missing soft-delete columns to existing tables
-- (These are safe to run — they're no-ops if the column already exists)

ALTER TABLE fund_sources    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE transactions    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE transfers       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE budgets         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Create the user_settings table if it doesn't exist

CREATE TABLE IF NOT EXISTS user_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency    TEXT    NOT NULL DEFAULT 'USD',
  date_format TEXT    NOT NULL DEFAULT 'YYYY-MM-DD',
  user_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable Row Level Security on user_settings (to match other tables)
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies so the anon key can read/write
-- (Skip if you have auth set up and want user-scoped access)

CREATE POLICY IF NOT EXISTS "Allow anon read fund_sources"    ON fund_sources    FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Allow anon insert fund_sources"  ON fund_sources    FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow anon update fund_sources"  ON fund_sources    FOR UPDATE USING (true);

CREATE POLICY IF NOT EXISTS "Allow anon read transactions"    ON transactions    FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Allow anon insert transactions"  ON transactions    FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow anon update transactions"  ON transactions    FOR UPDATE USING (true);

CREATE POLICY IF NOT EXISTS "Allow anon read transfers"       ON transfers       FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Allow anon insert transfers"     ON transfers       FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow anon update transfers"     ON transfers       FOR UPDATE USING (true);

CREATE POLICY IF NOT EXISTS "Allow anon read budgets"         ON budgets         FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Allow anon insert budgets"       ON budgets         FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow anon update budgets"       ON budgets         FOR UPDATE USING (true);

CREATE POLICY IF NOT EXISTS "Allow anon read recurring_rules" ON recurring_rules FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Allow anon insert recurring_rules" ON recurring_rules FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow anon update recurring_rules" ON recurring_rules FOR UPDATE USING (true);

CREATE POLICY IF NOT EXISTS "Allow anon read user_settings"   ON user_settings   FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Allow anon insert user_settings" ON user_settings   FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow anon update user_settings" ON user_settings   FOR UPDATE USING (true);
