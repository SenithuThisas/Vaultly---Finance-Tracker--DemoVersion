-- =============================================================================
-- Vaultly — Pending Transactions Migration
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- =============================================================================

-- 1. Create the pending_transactions table if it doesn't already exist
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('DR', 'CR')),
  category            TEXT NOT NULL,
  amount              NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  note                TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  fund_source_id      UUID REFERENCES fund_sources(id) ON DELETE SET NULL,
  telegram_user_id    BIGINT,
  telegram_message_id BIGINT,
  raw_text            TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (telegram_user_id, telegram_message_id)
);

-- 2. Add fund_source_id column to existing table (safe to run if column exists)
-- -----------------------------------------------------------------------------
ALTER TABLE pending_transactions
  ADD COLUMN IF NOT EXISTS fund_source_id UUID REFERENCES fund_sources(id) ON DELETE SET NULL;

-- 3. Enable RLS on pending_transactions
-- -----------------------------------------------------------------------------
ALTER TABLE pending_transactions ENABLE ROW LEVEL SECURITY;

-- Drop old policies (if any) to allow clean re-run
DROP POLICY IF EXISTS "Users can read own pending transactions"   ON pending_transactions;
DROP POLICY IF EXISTS "Users can insert own pending transactions" ON pending_transactions;
DROP POLICY IF EXISTS "Users can update own pending transactions" ON pending_transactions;
DROP POLICY IF EXISTS "Service role full access pending"          ON pending_transactions;

-- Read: only the row owner
CREATE POLICY "Users can read own pending transactions"
  ON pending_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Insert: only the row owner (Telegram webhook uses service role, bypasses RLS)
CREATE POLICY "Users can insert own pending transactions"
  ON pending_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update: only the row owner (approve/reject/edit from UI)
CREATE POLICY "Users can update own pending transactions"
  ON pending_transactions FOR UPDATE
  USING (auth.uid() = user_id);

-- 4. Create helper tables (safe if already exist)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS link_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token            TEXT NOT NULL UNIQUE,
  telegram_user_id BIGINT NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_user_map (
  telegram_user_id BIGINT PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on helper tables
ALTER TABLE link_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_user_map  ENABLE ROW LEVEL SECURITY;

-- link_tokens: service role only (webhook uses service key, no user session)
-- telegram_user_map: user can read their own mapping
DROP POLICY IF EXISTS "Users can read own telegram map" ON telegram_user_map;
CREATE POLICY "Users can read own telegram map"
  ON telegram_user_map FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own telegram map" ON telegram_user_map;
CREATE POLICY "Users can delete own telegram map"
  ON telegram_user_map FOR DELETE
  USING (auth.uid() = user_id);

-- 5. approve_pending_transaction RPC
-- -----------------------------------------------------------------------------
-- This function runs with SECURITY DEFINER so it can write transactions
-- and update fund source balances without the client needing elevated RLS.
CREATE OR REPLACE FUNCTION approve_pending_transaction(
  p_pending_id     UUID,
  p_fund_source_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending pending_transactions%ROWTYPE;
  v_new_tx_id UUID := gen_random_uuid();
BEGIN
  -- Fetch and lock the pending row
  SELECT * INTO v_pending
  FROM pending_transactions
  WHERE id = p_pending_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending transaction not found or already processed';
  END IF;

  -- Ensure the caller owns this row (extra safety beyond RLS)
  IF v_pending.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Insert into transactions table
  INSERT INTO transactions (
    id,
    user_id,
    title,
    amount,
    type,
    category,
    fund_source_id,
    date,
    note,
    tags,
    is_recurring,
    recurring_period,
    created_at
  ) VALUES (
    v_new_tx_id,
    v_pending.user_id,
    'Telegram · ' || v_pending.category,
    v_pending.amount,
    v_pending.type,
    v_pending.category,
    p_fund_source_id,
    v_pending.date,
    v_pending.note,
    '{}',
    false,
    null,
    now()
  );

  -- Update fund_source balance
  IF v_pending.type = 'CR' THEN
    UPDATE fund_sources
    SET balance = balance + v_pending.amount,
        updated_at = now()
    WHERE id = p_fund_source_id
      AND user_id = v_pending.user_id;
  ELSE
    UPDATE fund_sources
    SET balance = balance - v_pending.amount,
        updated_at = now()
    WHERE id = p_fund_source_id
      AND user_id = v_pending.user_id;
  END IF;

  -- Mark the pending row as approved
  UPDATE pending_transactions
  SET status = 'approved',
      fund_source_id = p_fund_source_id,
      updated_at = now()
  WHERE id = p_pending_id;
END;
$$;

-- 6. Grant execute on the RPC to authenticated users
GRANT EXECUTE ON FUNCTION approve_pending_transaction(UUID, UUID) TO authenticated;

-- Done ✅
-- Tables: pending_transactions, link_tokens, telegram_user_map
-- RLS: pending_transactions scoped to auth.uid() = user_id
-- RPC: approve_pending_transaction(p_pending_id, p_fund_source_id)
