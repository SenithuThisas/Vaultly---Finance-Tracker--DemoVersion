-- =============================================================================
-- Vaultly — RLS Isolation Fix
-- File: fix_rls_isolation.sql
--
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- Paste the ENTIRE file and click "Run".
--
-- This replaces the open USING(true) policies with strict per-user policies.
-- Safe to re-run — all DROP IF EXISTS before CREATE.
-- =============================================================================


-- ── Drop the old open-access policies from supabase_migration.sql ────────────

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

-- Also drop any stale per-user policies that may exist from previous runs
DROP POLICY IF EXISTS "users_own_fund_sources"           ON public.fund_sources;
DROP POLICY IF EXISTS "users_own_transactions"           ON public.transactions;
DROP POLICY IF EXISTS "users_own_transfers"              ON public.transfers;
DROP POLICY IF EXISTS "users_own_budgets"                ON public.budgets;
DROP POLICY IF EXISTS "users_own_recurring_rules"        ON public.recurring_rules;
DROP POLICY IF EXISTS "users_own_pending_transactions"   ON public.pending_transactions;
DROP POLICY IF EXISTS "users_own_profiles"               ON public.profiles;
DROP POLICY IF EXISTS "users_own_telegram_map"           ON public.telegram_user_map;

-- Also drop the partial policies created in supabase_pending_migration.sql
DROP POLICY IF EXISTS "Users can read own pending transactions"   ON pending_transactions;
DROP POLICY IF EXISTS "Users can insert own pending transactions" ON pending_transactions;
DROP POLICY IF EXISTS "Users can update own pending transactions" ON pending_transactions;
DROP POLICY IF EXISTS "Users can read own telegram map"          ON telegram_user_map;
DROP POLICY IF EXISTS "Users can delete own telegram map"        ON telegram_user_map;
DROP POLICY IF EXISTS "Users can read own profile"               ON profiles;
DROP POLICY IF EXISTS "Users can update own profile"             ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile"             ON profiles;


-- ── FUND SOURCES ─────────────────────────────────────────────────────────────
ALTER TABLE public.fund_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_fund_sources" ON public.fund_sources
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── TRANSACTIONS ──────────────────────────────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_transactions" ON public.transactions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── TRANSFERS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_transfers" ON public.transfers
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── BUDGETS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_budgets" ON public.budgets
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── RECURRING RULES ───────────────────────────────────────────────────────────
ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_recurring_rules" ON public.recurring_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── PENDING TRANSACTIONS ──────────────────────────────────────────────────────
-- Authenticated users own their rows; the service role (Telegram webhook)
-- bypasses RLS entirely, so the webhook can insert without a user session.
ALTER TABLE public.pending_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_pending_transactions" ON public.pending_transactions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── PROFILES ──────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profiles" ON public.profiles
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ── TELEGRAM USER MAP ─────────────────────────────────────────────────────────
-- Authenticated users can read/delete their own mapping row.
-- INSERT and UPDATE are done by the service role (webhook) so no user policy
-- is needed for those operations — service role bypasses RLS.
ALTER TABLE public.telegram_user_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_telegram_map" ON public.telegram_user_map
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── LINK TOKENS ───────────────────────────────────────────────────────────────
-- link_tokens is managed exclusively by the service role (Telegram webhook).
-- Regular users have no direct access — RLS is enabled with no user policy,
-- so only the service_role key (used by Netlify functions) can touch this table.
ALTER TABLE public.link_tokens ENABLE ROW LEVEL SECURITY;
-- (No user-facing policy — service role bypasses RLS entirely)


-- =============================================================================
-- ▼▼▼  VERIFICATION — Run after migration to confirm ▼▼▼
-- =============================================================================

-- V1. List every active policy on user-data tables.
-- Expected: each table has exactly ONE policy named "users_own_*".
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'fund_sources', 'transactions', 'transfers',
    'budgets', 'recurring_rules', 'pending_transactions',
    'profiles', 'telegram_user_map', 'link_tokens'
  )
ORDER BY tablename, policyname;


-- V2. Confirm NO open-access (USING true) policies remain.
-- Expected: 0 rows.
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual = '(true)';


-- V3. Spot-isolation test — run as a specific user session.
-- Replace <user-uuid-1> with one of your real user IDs.
-- Expected: only rows where user_id = <user-uuid-1>.
-- (Run this in Supabase Table Editor with a logged-in user to verify isolation)
SELECT id, name, user_id FROM fund_sources LIMIT 10;

-- =============================================================================
-- ✅  RLS isolation fix complete.
-- =============================================================================
