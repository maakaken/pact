export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  interests: string[] | null;
  is_verified: boolean;
  integrity_score: number;
  total_earned: number;
  total_lost: number;
  sprints_completed: number;
  sprints_failed: number;
  discord_username: string | null;
  created_at: string;
}

export interface Pact {
  id: string;
  name: string;
  mission: string | null;
  created_by: string | null;
  is_public: boolean;
  stake_amount: number;
  platform_fee_pct: number;
  sprint_type: 'weekly' | 'monthly' | 'custom' | null;
  sprint_duration_days: number;
  status: 'forming' | 'vetting' | 'active' | 'verdict' | 'completed' | 'cancelled';
  current_sprint: number;
  max_members: number;
  category: string | null;
  created_at: string;
}

export interface Invitation {
  id: string;
  pact_id: string;
  invited_by: string | null;
  email: string | null;
  token: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  created_at: string;
  expires_at: string;
}

export interface PactMember {
  id: string;
  pact_id: string;
  user_id: string;
  role: 'admin' | 'member';
  status: 'active' | 'removed';
  joined_at: string;
}

export interface PactApplication {
  id: string;
  pact_id: string;
  user_id: string;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface Goal {
  id: string;
  pact_id: string;
  user_id: string;
  sprint_number: number;
  title: string;
  description: string | null;
  measurable_outcome: string;
  proof_specification: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'revision_requested';
  moderation_status: 'pending' | 'cleared' | 'flagged';
  created_at: string;
}

export interface GoalApproval {
  id: string;
  goal_id: string;
  reviewer_id: string;
  decision: 'approved' | 'change_requested';
  comment: string | null;
  created_at: string;
}

export interface Sprint {
  id: string;
  pact_id: string;
  sprint_number: number;
  starts_at: string;
  ends_at: string;
  verdict_ends_at: string;
  status: 'active' | 'verdict_phase' | 'completed';
}

export interface Stake {
  id: string;
  pact_id: string;
  sprint_id: string;
  user_id: string;
  amount: number;
  stripe_payment_intent_id: string | null;
  status: 'locked' | 'returned' | 'forfeited' | 'distributed';
  created_at: string;
}

export interface Submission {
  id: string;
  sprint_id: string;
  user_id: string;
  goal_id: string | null;
  caption: string | null;
  file_urls: string[] | null;
  external_links: string[] | null;
  submitted_at: string;
  moderation_status: 'pending' | 'approved' | 'flagged' | 'rejected';
  moderation_note: string | null;
  is_auto_failed: boolean;
}

export interface Vote {
  id: string;
  sprint_id: string;
  submission_id: string | null;
  voter_id: string;
  target_user_id: string;
  decision: 'approve' | 'reject' | 'sympathy';
  created_at: string;
}

export interface Verdict {
  id: string;
  sprint_id: string;
  user_id: string;
  outcome: 'passed' | 'failed' | 'sympathy_pass';
  approve_count: number;
  reject_count: number;
  sympathy_count: number;
  stake_returned: boolean;
  dividend_amount: number;
  finalized_at: string;
}

export interface Appeal {
  id: string;
  verdict_id: string;
  user_id: string;
  reason: string;
  evidence_urls: string[] | null;
  status: 'pending' | 'upheld' | 'overturned';
  moderator_note: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'goal_approval_needed' | 'sprint_starting' | 'proof_due' | 'verdict_open' |
        'verdict_result' | 'appeal_result' | 'nudge' | 'inactivity_warning' |
        'invite_received' | 'application_approved' | 'application_rejected';
  title: string;
  body: string | null;
  pact_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ModerationQueueItem {
  id: string;
  type: 'goal_review' | 'evidence_review' | 'appeal' | 'dispute';
  goal_id: string | null;
  submission_id: string | null;
  appeal_id: string | null;
  pact_id: string | null;
  user_id: string | null;
  status: 'pending' | 'reviewed';
  assigned_to: string | null;
  created_at: string;
}

// Extended types with joins
export interface PactWithMembers extends Pact {
  pact_members: (PactMember & { profiles: Profile })[];
}

export interface GoalWithApprovals extends Goal {
  goal_approvals: (GoalApproval & { profiles: Profile })[];
  profiles: Profile;
}

export interface SubmissionWithProfile extends Submission {
  profiles: Profile;
  goals: Goal | null;
}

export interface VerdictWithProfile extends Verdict {
  profiles: Profile;
}
