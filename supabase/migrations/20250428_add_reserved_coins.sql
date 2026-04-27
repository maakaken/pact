-- Add reserved_coins column to profiles table
-- Reserved coins are coins that are committed to pacts but not yet deducted
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reserved_coins BIGINT DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN profiles.reserved_coins IS 'Coins reserved for upcoming sprints (committed but not yet deducted)';
