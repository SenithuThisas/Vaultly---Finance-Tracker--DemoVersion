-- =============================================================================
-- Vaultly - RLS Fix
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- This enables anon read/write on all 5 tables (no auth required)
-- =============================================================================

-- Enable RLS on all tables (safe to re-run)
ALTER TABLE fund_sources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_rules ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist (to avoid duplicates)
DROP POLICY IF EXISTS "Allow anon read fund_sources"         ON fund_sources;
DROP POLICY IF EXISTS "Allow anon insert fund_sources"       ON fund_sources;
DROP POLICY IF EXISTS "Allow anon update fund_sources"       ON fund_sources;
DROP POLICY IF EXISTS "Allow anon delete fund_sources"       ON fund_sources;

DROP POLICY IF EXISTS "Allow anon read transactions"         ON transactions;
DROP POLICY IF EXISTS "Allow anon insert transactions"       ON transactions;
DROP POLICY IF EXISTS "Allow anon update transactions"       ON transactions;
DROP POLICY IF EXISTS "Allow anon delete transactions"       ON transactions;

DROP POLICY IF EXISTS "Allow anon read transfers"            ON transfers;
DROP POLICY IF EXISTS "Allow anon insert transfers"          ON transfers;
DROP POLICY IF EXISTS "Allow anon update transfers"          ON transfers;
DROP POLICY IF EXISTS "Allow anon delete transfers"          ON transfers;

DROP POLICY IF EXISTS "Allow anon read budgets"              ON budgets;
DROP POLICY IF EXISTS "Allow anon insert budgets"            ON budgets;
DROP POLICY IF EXISTS "Allow anon update budgets"            ON budgets;
DROP POLICY IF EXISTS "Allow anon delete budgets"            ON budgets;

DROP POLICY IF EXISTS "Allow anon read recurring_rules"      ON recurring_rules;
DROP POLICY IF EXISTS "Allow anon insert recurring_rules"    ON recurring_rules;
DROP POLICY IF EXISTS "Allow anon update recurring_rules"    ON recurring_rules;
DROP POLICY IF EXISTS "Allow anon delete recurring_rules"    ON recurring_rules;

-- Re-create policies allowing full anon access (SELECT / INSERT / UPDATE / DELETE)
CREATE POLICY "Allow anon read fund_sources"         ON fund_sources    FOR SELECT USING (true);
CREATE POLICY "Allow anon insert fund_sources"       ON fund_sources    FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update fund_sources"       ON fund_sources    FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete fund_sources"       ON fund_sources    FOR DELETE USING (true);

CREATE POLICY "Allow anon read transactions"         ON transactions    FOR SELECT USING (true);
CREATE POLICY "Allow anon insert transactions"       ON transactions    FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update transactions"       ON transactions    FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete transactions"       ON transactions    FOR DELETE USING (true);

CREATE POLICY "Allow anon read transfers"            ON transfers       FOR SELECT USING (true);
CREATE POLICY "Allow anon insert transfers"          ON transfers       FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update transfers"          ON transfers       FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete transfers"          ON transfers       FOR DELETE USING (true);

CREATE POLICY "Allow anon read budgets"              ON budgets         FOR SELECT USING (true);
CREATE POLICY "Allow anon insert budgets"            ON budgets         FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update budgets"            ON budgets         FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete budgets"            ON budgets         FOR DELETE USING (true);

CREATE POLICY "Allow anon read recurring_rules"      ON recurring_rules FOR SELECT USING (true);
CREATE POLICY "Allow anon insert recurring_rules"    ON recurring_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update recurring_rules"    ON recurring_rules FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete recurring_rules"    ON recurring_rules FOR DELETE USING (true);

-- Done ✅
-- All 5 tables now allow full anon access (SELECT, INSERT, UPDATE, DELETE)
