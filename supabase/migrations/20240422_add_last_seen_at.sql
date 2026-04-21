-- Add last_seen_at column to profiles table for activity tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
