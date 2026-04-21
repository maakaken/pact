-- Create goal_votes table for peer approval of goals
CREATE TABLE IF NOT EXISTS goal_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'change_requested')),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint to prevent duplicate votes
CREATE UNIQUE INDEX IF NOT EXISTS goal_votes_unique_goal_voter ON goal_votes(goal_id, voter_id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS goal_votes_goal_id_idx ON goal_votes(goal_id);
CREATE INDEX IF NOT EXISTS goal_votes_voter_id_idx ON goal_votes(voter_id);
