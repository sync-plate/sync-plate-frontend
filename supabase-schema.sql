-- Create households table if it doesn't exist
CREATE TABLE IF NOT EXISTS households (
  id BIGSERIAL PRIMARY KEY,
  invite_code VARCHAR(6) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Add household_id column to users table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'household_id'
  ) THEN
    ALTER TABLE users ADD COLUMN household_id BIGINT REFERENCES households(id);
  END IF;
END $$;

-- Add activity_level and goal columns to users table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'activity_level'
  ) THEN
    ALTER TABLE users ADD COLUMN activity_level VARCHAR(20);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'goal'
  ) THEN
    ALTER TABLE users ADD COLUMN goal VARCHAR(20);
  END IF;
END $$;

-- Create daily_target_adjustments table for rebalance choices
CREATE TABLE IF NOT EXISTS daily_target_adjustments (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  adjustment_date DATE NOT NULL,
  overage INTEGER NOT NULL,
  choice VARCHAR(10) NOT NULL CHECK (choice IN ('daily', 'weekly', 'grace')),
  daily_reduction INTEGER,
  weekly_reduction INTEGER,
  days_remaining INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE daily_target_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own adjustments" ON daily_target_adjustments;
CREATE POLICY "Users can manage their own adjustments"
  ON daily_target_adjustments FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Row Level Security for users table
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile and any user in the same household
DROP POLICY IF EXISTS "Users can view household members" ON users;
CREATE POLICY "Users can view household members"
  ON users FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM users
      WHERE id = auth.uid() AND household_id IS NOT NULL
    )
  );

-- Users can only insert their own profile
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Users can only update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- Row Level Security for meals table
-- ============================================================
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

-- Users can read their own meals OR shared household meals
DROP POLICY IF EXISTS "Users can view own and household meals" ON meals;
CREATE POLICY "Users can view own and household meals"
  ON meals FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM users
      WHERE id = auth.uid() AND household_id IS NOT NULL
    )
  );

-- Users can insert meals for themselves or their household
DROP POLICY IF EXISTS "Users can insert meals" ON meals;
CREATE POLICY "Users can insert meals"
  ON meals FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM users
      WHERE id = auth.uid() AND household_id IS NOT NULL
    )
  );

-- Users can update their own or household meals
DROP POLICY IF EXISTS "Users can update meals" ON meals;
CREATE POLICY "Users can update meals"
  ON meals FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM users
      WHERE id = auth.uid() AND household_id IS NOT NULL
    )
  );

-- Users can delete their own or household meals
DROP POLICY IF EXISTS "Users can delete meals" ON meals;
CREATE POLICY "Users can delete meals"
  ON meals FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM users
      WHERE id = auth.uid() AND household_id IS NOT NULL
    )
  );

-- Create index on invite_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_households_invite_code ON households(invite_code);

-- Enable Row Level Security
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read households
DROP POLICY IF EXISTS "Users can view households" ON households;
CREATE POLICY "Users can view households"
  ON households FOR SELECT
  TO authenticated
  USING (true);

-- Create policy to allow authenticated users to create households
DROP POLICY IF EXISTS "Users can create households" ON households;
CREATE POLICY "Users can create households"
  ON households FOR INSERT
  TO authenticated
  WITH CHECK (true);
