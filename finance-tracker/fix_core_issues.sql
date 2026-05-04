-- =============================================================================
-- Vaultly — Core Issues Migration
-- File: fix_core_issues.sql
--
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- Paste the ENTIRE file and click "Run".
--
-- This migration is IDEMPOTENT — safe to run multiple times.
-- =============================================================================


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 1 — Add 'approved' to pending_transactions status constraint       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- The current CHECK constraint only allows ('pending', 'rejected').
-- The approve_pending_transaction RPC sets status = 'approved', which
-- silently fails or throws. We must widen the constraint.

ALTER TABLE pending_transactions
  DROP CONSTRAINT IF EXISTS pending_transactions_status_check;

ALTER TABLE pending_transactions
  ADD CONSTRAINT pending_transactions_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 2 — Balance trigger for the transactions table                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- When a transaction is INSERTed, UPDATEd, or DELETEd, the linked
-- fund_source.balance must be adjusted automatically so the balance
-- stays in sync without relying on client-side math.

CREATE OR REPLACE FUNCTION update_fund_source_balance_on_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- ── On DELETE: reverse the old transaction's effect ──
  IF TG_OP = 'DELETE' THEN
    IF OLD.fund_source_id IS NOT NULL THEN
      IF OLD.type = 'CR' THEN
        UPDATE fund_sources SET balance = balance - OLD.amount, updated_at = now()
        WHERE id = OLD.fund_source_id;
      ELSE
        UPDATE fund_sources SET balance = balance + OLD.amount, updated_at = now()
        WHERE id = OLD.fund_source_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  -- ── On UPDATE: reverse old effect, then apply new effect ──
  IF TG_OP = 'UPDATE' THEN
    -- Reverse old
    IF OLD.fund_source_id IS NOT NULL THEN
      IF OLD.type = 'CR' THEN
        UPDATE fund_sources SET balance = balance - OLD.amount, updated_at = now()
        WHERE id = OLD.fund_source_id;
      ELSE
        UPDATE fund_sources SET balance = balance + OLD.amount, updated_at = now()
        WHERE id = OLD.fund_source_id;
      END IF;
    END IF;
    -- Apply new
    IF NEW.fund_source_id IS NOT NULL THEN
      IF NEW.type = 'CR' THEN
        UPDATE fund_sources SET balance = balance + NEW.amount, updated_at = now()
        WHERE id = NEW.fund_source_id;
      ELSE
        UPDATE fund_sources SET balance = balance - NEW.amount, updated_at = now()
        WHERE id = NEW.fund_source_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- ── On INSERT: apply the new transaction's effect ──
  IF TG_OP = 'INSERT' THEN
    IF NEW.fund_source_id IS NOT NULL THEN
      IF NEW.type = 'CR' THEN
        UPDATE fund_sources SET balance = balance + NEW.amount, updated_at = now()
        WHERE id = NEW.fund_source_id;
      ELSE
        UPDATE fund_sources SET balance = balance - NEW.amount, updated_at = now()
        WHERE id = NEW.fund_source_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- Drop the trigger if it already exists (idempotent)
DROP TRIGGER IF EXISTS trg_transaction_balance ON transactions;

CREATE TRIGGER trg_transaction_balance
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_fund_source_balance_on_transaction();


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 3 — Balance trigger for the transfers table                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- A transfer debits from_fund_source and credits to_fund_source.
-- The fee (if any) is an additional debit from the source account.
-- On DELETE the effect is fully reversed.

CREATE OR REPLACE FUNCTION update_fund_source_balance_on_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- ── On DELETE: reverse the old transfer ──
  IF TG_OP = 'DELETE' THEN
    IF OLD.from_fund_source_id IS NOT NULL THEN
      UPDATE fund_sources
      SET balance = balance + OLD.amount + COALESCE(OLD.fee, 0),
          updated_at = now()
      WHERE id = OLD.from_fund_source_id;
    END IF;
    IF OLD.to_fund_source_id IS NOT NULL THEN
      UPDATE fund_sources
      SET balance = balance - OLD.amount,
          updated_at = now()
      WHERE id = OLD.to_fund_source_id;
    END IF;
    RETURN OLD;
  END IF;

  -- ── On UPDATE: reverse old, apply new ──
  IF TG_OP = 'UPDATE' THEN
    -- Reverse old
    IF OLD.from_fund_source_id IS NOT NULL THEN
      UPDATE fund_sources
      SET balance = balance + OLD.amount + COALESCE(OLD.fee, 0),
          updated_at = now()
      WHERE id = OLD.from_fund_source_id;
    END IF;
    IF OLD.to_fund_source_id IS NOT NULL THEN
      UPDATE fund_sources
      SET balance = balance - OLD.amount,
          updated_at = now()
      WHERE id = OLD.to_fund_source_id;
    END IF;
    -- Apply new
    IF NEW.from_fund_source_id IS NOT NULL THEN
      UPDATE fund_sources
      SET balance = balance - NEW.amount - COALESCE(NEW.fee, 0),
          updated_at = now()
      WHERE id = NEW.from_fund_source_id;
    END IF;
    IF NEW.to_fund_source_id IS NOT NULL THEN
      UPDATE fund_sources
      SET balance = balance + NEW.amount,
          updated_at = now()
      WHERE id = NEW.to_fund_source_id;
    END IF;
    RETURN NEW;
  END IF;

  -- ── On INSERT: debit source, credit destination ──
  IF TG_OP = 'INSERT' THEN
    IF NEW.from_fund_source_id IS NOT NULL THEN
      UPDATE fund_sources
      SET balance = balance - NEW.amount - COALESCE(NEW.fee, 0),
          updated_at = now()
      WHERE id = NEW.from_fund_source_id;
    END IF;
    IF NEW.to_fund_source_id IS NOT NULL THEN
      UPDATE fund_sources
      SET balance = balance + NEW.amount,
          updated_at = now()
      WHERE id = NEW.to_fund_source_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_transfer_balance ON transfers;

CREATE TRIGGER trg_transfer_balance
  AFTER INSERT OR UPDATE OR DELETE ON transfers
  FOR EACH ROW
  EXECUTE FUNCTION update_fund_source_balance_on_transfer();


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 4 — CASCADE deletes on all fund_source_id foreign keys             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- When a fund_source is deleted, all linked transactions, transfers,
-- budgets, recurring_rules, and pending_transactions must be cleaned up
-- instead of leaving orphaned rows with dangling foreign keys.

-- 4a. transactions.fund_source_id → CASCADE
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_fund_source_id_fkey;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_fund_source_id_fkey
  FOREIGN KEY (fund_source_id) REFERENCES fund_sources(id) ON DELETE CASCADE;

-- 4b. transfers.from_fund_source_id → CASCADE
ALTER TABLE transfers
  DROP CONSTRAINT IF EXISTS transfers_from_fund_source_id_fkey;
ALTER TABLE transfers
  ADD CONSTRAINT transfers_from_fund_source_id_fkey
  FOREIGN KEY (from_fund_source_id) REFERENCES fund_sources(id) ON DELETE CASCADE;

-- 4c. transfers.to_fund_source_id → CASCADE
ALTER TABLE transfers
  DROP CONSTRAINT IF EXISTS transfers_to_fund_source_id_fkey;
ALTER TABLE transfers
  ADD CONSTRAINT transfers_to_fund_source_id_fkey
  FOREIGN KEY (to_fund_source_id) REFERENCES fund_sources(id) ON DELETE CASCADE;

-- 4d. budgets.fund_source_id → SET NULL (budget survives, just unlinked)
ALTER TABLE budgets
  DROP CONSTRAINT IF EXISTS budgets_fund_source_id_fkey;
ALTER TABLE budgets
  ADD CONSTRAINT budgets_fund_source_id_fkey
  FOREIGN KEY (fund_source_id) REFERENCES fund_sources(id) ON DELETE SET NULL;

-- 4e. recurring_rules.fund_source_id → CASCADE
ALTER TABLE recurring_rules
  DROP CONSTRAINT IF EXISTS recurring_rules_fund_source_id_fkey;
ALTER TABLE recurring_rules
  ADD CONSTRAINT recurring_rules_fund_source_id_fkey
  FOREIGN KEY (fund_source_id) REFERENCES fund_sources(id) ON DELETE CASCADE;

-- 4f. pending_transactions.fund_source_id → SET NULL (preserve for review)
ALTER TABLE pending_transactions
  DROP CONSTRAINT IF EXISTS pending_transactions_fund_source_id_fkey;
ALTER TABLE pending_transactions
  ADD CONSTRAINT pending_transactions_fund_source_id_fkey
  FOREIGN KEY (fund_source_id) REFERENCES fund_sources(id) ON DELETE SET NULL;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 5 — Auto-create profile on user signup                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- When a new user signs up via Supabase Auth, automatically insert a row
-- into public.profiles so the app always has a profile to read.

CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  avatar_url TEXT,
  currency   TEXT DEFAULT 'LKR',
  date_format TEXT DEFAULT 'DD/MM/YYYY',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile"   ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- The trigger function that creates the profile row
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop and recreate to be idempotent
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Backfill profiles for any existing users that don't have one yet
INSERT INTO profiles (id, created_at)
SELECT id, COALESCE(created_at, now())
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 6 — Auto-cleanup expired link_tokens                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Expired OTP tokens accumulate forever. This function can be called by
-- a Supabase cron job (pg_cron) or manually to purge stale tokens.

CREATE OR REPLACE FUNCTION cleanup_expired_link_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM link_tokens
  WHERE expires_at < now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Grant execute so it can be called from a cron or admin context
GRANT EXECUTE ON FUNCTION cleanup_expired_link_tokens() TO service_role;

-- Run it once now to clean up any existing expired tokens
SELECT cleanup_expired_link_tokens();

-- If pg_cron extension is available, schedule hourly cleanup:
-- (Uncomment the lines below ONLY if pg_cron is enabled on your project)
--
-- SELECT cron.schedule(
--   'cleanup-expired-link-tokens',
--   '0 * * * *',
--   $$SELECT cleanup_expired_link_tokens()$$
-- );


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 7 — Performance indexes                                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Add indexes on the most-queried columns to prevent full table scans.
-- CREATE INDEX IF NOT EXISTS is idempotent and safe to re-run.

-- fund_sources
CREATE INDEX IF NOT EXISTS idx_fund_sources_user_id
  ON fund_sources (user_id);

-- transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user_id
  ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_fund_source_id
  ON transactions (fund_source_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date
  ON transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions (user_id, date DESC);

-- transfers
CREATE INDEX IF NOT EXISTS idx_transfers_user_id
  ON transfers (user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from_fund_source_id
  ON transfers (from_fund_source_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_fund_source_id
  ON transfers (to_fund_source_id);
CREATE INDEX IF NOT EXISTS idx_transfers_date
  ON transfers (date DESC);

-- budgets
CREATE INDEX IF NOT EXISTS idx_budgets_user_id
  ON budgets (user_id);

-- recurring_rules
CREATE INDEX IF NOT EXISTS idx_recurring_rules_user_id
  ON recurring_rules (user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_next_due
  ON recurring_rules (next_due_date)
  WHERE is_active = true;

-- pending_transactions
CREATE INDEX IF NOT EXISTS idx_pending_transactions_user_status
  ON pending_transactions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_transactions_telegram_user
  ON pending_transactions (telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_pending_transactions_created_at
  ON pending_transactions (created_at DESC);

-- link_tokens
CREATE INDEX IF NOT EXISTS idx_link_tokens_expires_at
  ON link_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_link_tokens_telegram_user_id
  ON link_tokens (telegram_user_id);

-- telegram_user_map
CREATE INDEX IF NOT EXISTS idx_telegram_user_map_user_id
  ON telegram_user_map (user_id);


-- =============================================================================
-- ▼▼▼  BALANCE RECALCULATION — RUN AFTER TRIGGERS ARE IN PLACE  ▼▼▼
-- =============================================================================
-- These queries recalculate every fund_source.balance from scratch using
-- initial_balance + all transactions + all transfers. This corrects any
-- drift that accumulated while the triggers were not yet active.
--
-- IMPORTANT: The triggers installed above will fire on UPDATE, but since
-- we are writing directly to fund_sources.balance (not via transactions),
-- that is fine — the transaction trigger only fires on the transactions table.
-- =============================================================================

-- Step A: Reset all balances to initial_balance
UPDATE fund_sources
SET balance = COALESCE(initial_balance, 0),
    updated_at = now();

-- Step B: Apply all transaction effects
UPDATE fund_sources fs
SET balance = fs.balance + COALESCE(tx_totals.net, 0),
    updated_at = now()
FROM (
  SELECT
    fund_source_id,
    SUM(CASE WHEN type = 'CR' THEN amount ELSE -amount END) AS net
  FROM transactions
  WHERE fund_source_id IS NOT NULL
  GROUP BY fund_source_id
) tx_totals
WHERE fs.id = tx_totals.fund_source_id;

-- Step C: Apply all transfer effects (debit from source)
UPDATE fund_sources fs
SET balance = fs.balance - COALESCE(out_totals.total_out, 0),
    updated_at = now()
FROM (
  SELECT
    from_fund_source_id,
    SUM(amount + COALESCE(fee, 0)) AS total_out
  FROM transfers
  WHERE from_fund_source_id IS NOT NULL
  GROUP BY from_fund_source_id
) out_totals
WHERE fs.id = out_totals.from_fund_source_id;

-- Step D: Apply all transfer effects (credit to destination)
UPDATE fund_sources fs
SET balance = fs.balance + COALESCE(in_totals.total_in, 0),
    updated_at = now()
FROM (
  SELECT
    to_fund_source_id,
    SUM(amount) AS total_in
  FROM transfers
  WHERE to_fund_source_id IS NOT NULL
  GROUP BY to_fund_source_id
) in_totals
WHERE fs.id = in_totals.to_fund_source_id;


-- =============================================================================
-- ▼▼▼  VERIFICATION QUERIES — RUN AFTER MIGRATION TO CONFIRM SUCCESS  ▼▼▼
-- =============================================================================
-- Copy each query below into the SQL Editor one at a time after the
-- migration has completed. Share the results to confirm everything worked.
-- =============================================================================

-- V1. Confirm 'approved' is now allowed in the status constraint
-- Expected: the constraint definition should show ('pending', 'approved', 'rejected')
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'pending_transactions'::regclass
  AND conname LIKE '%status%';

-- V2. Confirm the transaction balance trigger exists
-- Expected: trg_transaction_balance row
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'transactions'
  AND trigger_name = 'trg_transaction_balance';

-- V3. Confirm the transfer balance trigger exists
-- Expected: trg_transfer_balance row
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'transfers'
  AND trigger_name = 'trg_transfer_balance';

-- V4. Confirm CASCADE/SET NULL on all fund_source_id foreign keys
-- Expected: transactions=CASCADE, transfers(both)=CASCADE,
--           budgets=SET NULL, recurring_rules=CASCADE,
--           pending_transactions=SET NULL
SELECT
  tc.table_name,
  kcu.column_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE kcu.column_name LIKE '%fund_source_id%'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;

-- V5. Confirm the auto-profile trigger exists on auth.users
-- Expected: on_auth_user_created row
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'users'
  AND trigger_schema = 'auth'
  AND trigger_name = 'on_auth_user_created';

-- V6. Confirm profiles were backfilled (count should match auth.users count)
SELECT
  (SELECT count(*) FROM auth.users) AS total_users,
  (SELECT count(*) FROM profiles) AS total_profiles;

-- V7. Confirm performance indexes exist
-- Expected: all idx_* indexes listed
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- V8. Confirm recalculated balances look correct
-- Shows each account with its initial_balance and current (recalculated) balance
SELECT id, name, type, initial_balance, balance
FROM fund_sources
ORDER BY name;

-- V9. Spot-check: for each fund_source, verify balance = initial + net transactions + net transfers
-- If the "drift" column is 0 for every row, balances are perfectly in sync.
SELECT
  fs.id,
  fs.name,
  fs.initial_balance,
  fs.balance AS current_balance,
  COALESCE(tx.net, 0) AS tx_net,
  COALESCE(tfr_out.total_out, 0) AS transfers_out,
  COALESCE(tfr_in.total_in, 0) AS transfers_in,
  (
    COALESCE(fs.initial_balance, 0)
    + COALESCE(tx.net, 0)
    - COALESCE(tfr_out.total_out, 0)
    + COALESCE(tfr_in.total_in, 0)
  ) AS expected_balance,
  fs.balance - (
    COALESCE(fs.initial_balance, 0)
    + COALESCE(tx.net, 0)
    - COALESCE(tfr_out.total_out, 0)
    + COALESCE(tfr_in.total_in, 0)
  ) AS drift
FROM fund_sources fs
LEFT JOIN (
  SELECT fund_source_id, SUM(CASE WHEN type = 'CR' THEN amount ELSE -amount END) AS net
  FROM transactions WHERE fund_source_id IS NOT NULL GROUP BY fund_source_id
) tx ON fs.id = tx.fund_source_id
LEFT JOIN (
  SELECT from_fund_source_id, SUM(amount + COALESCE(fee, 0)) AS total_out
  FROM transfers WHERE from_fund_source_id IS NOT NULL GROUP BY from_fund_source_id
) tfr_out ON fs.id = tfr_out.from_fund_source_id
LEFT JOIN (
  SELECT to_fund_source_id, SUM(amount) AS total_in
  FROM transfers WHERE to_fund_source_id IS NOT NULL GROUP BY to_fund_source_id
) tfr_in ON fs.id = tfr_in.to_fund_source_id
ORDER BY fs.name;


-- =============================================================================
-- ✅  Migration complete.
-- =============================================================================
