-- Create sprint_archives table for storing compressed sprint history
CREATE TABLE IF NOT EXISTS sprint_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  sprint_id UUID NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  sprint_number INTEGER NOT NULL,
  stake_amount BIGINT NOT NULL,
  total_pot BIGINT NOT NULL,
  platform_fee BIGINT NOT NULL,
  distributed_amount BIGINT NOT NULL,
  winner_count INTEGER NOT NULL,
  -- Summary contains winners, losers, and task summaries
  summary JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(pact_id, sprint_number)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sprint_archives_pact_id ON sprint_archives(pact_id);
CREATE INDEX IF NOT EXISTS idx_sprint_archives_sprint_id ON sprint_archives(sprint_id);

-- Add archived flag to sprints table
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;

COMMENT ON TABLE sprint_archives IS 'Stores compressed summaries of completed sprints for historical reference';
COMMENT ON COLUMN sprint_archives.summary IS 'JSON containing winners, losers, and task summaries';
