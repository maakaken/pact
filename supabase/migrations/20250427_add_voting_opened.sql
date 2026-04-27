-- Add voting_opened column to sprints table
ALTER TABLE sprints ADD COLUMN voting_opened BOOLEAN DEFAULT FALSE;
