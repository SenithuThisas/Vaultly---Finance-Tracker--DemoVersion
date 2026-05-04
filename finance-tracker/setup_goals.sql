DROP TABLE IF EXISTS goals CASCADE;

CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount DECIMAL(12,2) NOT NULL,
  saved_amount DECIMAL(12,2) DEFAULT 0.00,
  target_date DATE,
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- Turn on Row Level Security
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see and manage their own goals
CREATE POLICY "Users can manage their own goals" ON goals
  FOR ALL
  USING (auth.uid() = user_id);

-- Create the handle_updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add a trigger to auto-update updated_at
CREATE TRIGGER set_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();
