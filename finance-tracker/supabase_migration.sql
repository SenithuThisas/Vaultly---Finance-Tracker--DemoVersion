-- =============================================================================
-- Vaultly — Auth Migration
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- Adds user_id, RLS policies, profiles table, and cleans demo data
-- =============================================================================

-- ═══════════════════════════════════════════════
-- Step 0: Clean existing demo data
-- ═══════════════════════════════════════════════
TRUNCATE TABLE recurring_rules CASCADE;
TRUNCATE TABLE budgets CASCADE;
TRUNCATE TABLE transfers CASCADE;
TRUNCATE TABLE transactions CASCADE;
TRUNCATE TABLE fund_sources CASCADE;

-- ═══════════════════════════════════════════════
-- Step 1: Drop ALL old anon policies
-- ═══════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════
-- Step 2: Add user_id column to all tables
-- ═══════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fund_sources' AND column_name='user_id') THEN
    ALTER TABLE fund_sources ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='user_id') THEN
    ALTER TABLE transactions ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transfers' AND column_name='user_id') THEN
    ALTER TABLE transfers ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='budgets' AND column_name='user_id') THEN
    ALTER TABLE budgets ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recurring_rules' AND column_name='user_id') THEN
    ALTER TABLE recurring_rules ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ═══════════════════════════════════════════════
-- Step 3: Indexes on user_id
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_fund_sources_user    ON fund_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user    ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_user       ON transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user         ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_user       ON recurring_rules(user_id);

-- ═══════════════════════════════════════════════
-- Step 4: Enable RLS on all tables
-- ═══════════════════════════════════════════════
ALTER TABLE fund_sources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_rules ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════
-- Step 5: RLS Policies — users only see own data
-- ═══════════════════════════════════════════════

-- fund_sources
CREATE POLICY "Users read own fund_sources"   ON fund_sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own fund_sources" ON fund_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own fund_sources" ON fund_sources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own fund_sources" ON fund_sources FOR DELETE USING (auth.uid() = user_id);

-- transactions
CREATE POLICY "Users read own transactions"   ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own transactions" ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own transactions" ON transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own transactions" ON transactions FOR DELETE USING (auth.uid() = user_id);

-- transfers
CREATE POLICY "Users read own transfers"   ON transfers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own transfers" ON transfers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own transfers" ON transfers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own transfers" ON transfers FOR DELETE USING (auth.uid() = user_id);

-- budgets
CREATE POLICY "Users read own budgets"   ON budgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own budgets" ON budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own budgets" ON budgets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own budgets" ON budgets FOR DELETE USING (auth.uid() = user_id);

-- recurring_rules
CREATE POLICY "Users read own recurring_rules"   ON recurring_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own recurring_rules" ON recurring_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own recurring_rules" ON recurring_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own recurring_rules" ON recurring_rules FOR DELETE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════
-- Step 6: Profiles table
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  avatar_url    TEXT,
  currency      TEXT DEFAULT 'LKR',
  date_format   TEXT DEFAULT 'DD/MM/YYYY',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile"   ON profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;

CREATE POLICY "Users read own profile"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ═══════════════════════════════════════════════
-- Step 7: Auto-create profile on signup
-- ═══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Done ✅
