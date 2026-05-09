-- Add invited_user_id and invitation_type to invitations table
ALTER TABLE invitations 
ADD COLUMN IF NOT EXISTS invited_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
ADD COLUMN IF NOT EXISTS invitation_type VARCHAR(10) DEFAULT 'email' CHECK (invitation_type IN ('email', 'username'));

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_invitations_invited_user_id ON invitations(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_type ON invitations(invitation_type);
