'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import { usePact } from '@/hooks/usePact';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { formatTimeAgo, cn } from '@/lib/utils';
import type { GoalWithApprovals } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────
interface GoalFormValues {
  title: string;
  description: string;
  measurableOutcome: string;
  proofSpecification: string;
}

// ── Moderation badge helper ────────────────────────────────────────────────────
function ModerationBadge({ status }: { status: string }) {
  if (status === 'cleared') {
    return <Badge variant="active">✅ Moderation Cleared</Badge>;
  }
  if (status === 'flagged') {
    return <Badge variant="failed">🚩 Flagged</Badge>;
  }
  return <Badge variant="pending">⏳ Pending Moderation</Badge>;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function VettingPage() {
  const params = useParams();
  const pactId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { pact, loading: pactLoading } = usePact(pactId);

  const [myGoal, setMyGoal] = useState<GoalWithApprovals | null>(null);
  const [teamGoals, setTeamGoals] = useState<GoalWithApprovals[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, 'approved' | 'change_requested'>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Request changes modal
  const [changeModal, setChangeModal] = useState<{ open: boolean; goalId: string; goalTitle: string }>({
    open: false, goalId: '', goalTitle: ''
  });
  const [changeComment, setChangeComment] = useState('');
  const [changeSending, setChangeSending] = useState(false);

  // Voting loading per goal
  const [votingGoal, setVotingGoal] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GoalFormValues>();

  // Auth guard
  useEffect(() => {
    if (!userLoading && !user) router.replace('/login');
  }, [user, userLoading, router]);

  // Fetch goals
  const fetchGoals = useCallback(async () => {
    if (!user || !pact) return;
    const supabase = createClient();
    setDataLoading(true);

    const { data: allGoals } = await supabase
      .from('goals')
      .select('*, goal_approvals(*, profiles(*)), profiles(*)')
      .eq('pact_id', pactId)
      .eq('sprint_number', pact.current_sprint);

    const goals = (allGoals as GoalWithApprovals[]) ?? [];

    const mine = goals.find((g) => g.user_id === user.id) ?? null;
    const team = goals.filter((g) => g.user_id !== user.id);

    setMyGoal(mine);
    setTeamGoals(team);

    // Seed my existing votes
    const voteMap: Record<string, 'approved' | 'change_requested'> = {};
    team.forEach((g) => {
      const myApproval = g.goal_approvals?.find((a) => a.reviewer_id === user.id);
      if (myApproval) {
        voteMap[g.id] = myApproval.decision;
      }
    });
    setMyVotes(voteMap);

    setDataLoading(false);
  }, [user, pact, pactId]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // ── Submit my goal ─────────────────────────────────────────────────────────
  const onSubmitGoal = async (vals: GoalFormValues) => {
    if (!user || !pact) return;
    setSubmitting(true);
    setSubmitError('');
    const supabase = createClient();

    const { data: newGoal, error: goalError } = await supabase
      .from('goals')
      .insert({
        pact_id: pactId,
        user_id: user.id,
        sprint_number: pact.current_sprint,
        title: vals.title,
        description: vals.description || null,
        measurable_outcome: vals.measurableOutcome,
        proof_specification: vals.proofSpecification,
        status: 'pending_approval',
        moderation_status: 'pending',
      })
      .select()
      .single();

    if (goalError || !newGoal) {
      setSubmitError('Failed to submit goal. Please try again.');
      setSubmitting(false);
      return;
    }

    // Insert into moderation_queue
    await supabase.from('moderation_queue').insert({
      type: 'goal_review',
      goal_id: newGoal.id,
      pact_id: pactId,
      user_id: user.id,
      status: 'pending',
    });

    await fetchGoals();
    setSubmitting(false);
  };

  // ── Approve goal ───────────────────────────────────────────────────────────
  const handleApprove = async (goalId: string) => {
    if (!user || myVotes[goalId] || votingGoal === goalId) return;
    setVotingGoal(goalId);
    const supabase = createClient();

    await supabase.from('goal_approvals').insert({
      goal_id: goalId,
      reviewer_id: user.id,
      decision: 'approved',
      comment: null,
    });

    setMyVotes((prev) => ({ ...prev, [goalId]: 'approved' }));
    setVotingGoal(null);
  };

  // ── Request changes modal submit ────────────────────────────────────────────
  const handleRequestChanges = async () => {
    if (!user || !changeComment.trim()) return;
    setChangeSending(true);
    const supabase = createClient();

    await supabase.from('goal_approvals').insert({
      goal_id: changeModal.goalId,
      reviewer_id: user.id,
      decision: 'change_requested',
      comment: changeComment.trim(),
    });

    await supabase
      .from('goals')
      .update({ status: 'revision_requested' })
      .eq('id', changeModal.goalId);

    setMyVotes((prev) => ({ ...prev, [changeModal.goalId]: 'change_requested' }));
    setChangeComment('');
    setChangeModal({ open: false, goalId: '', goalTitle: '' });
    setChangeSending(false);
    await fetchGoals();
  };

  // ── Check vetting complete ─────────────────────────────────────────────────
  const allMemberCount = pact?.members.length ?? 0;
  const allGoalsSubmitted = teamGoals.length + (myGoal ? 1 : 0) >= allMemberCount;
  const allCleared = teamGoals.every((g) => g.moderation_status === 'cleared') &&
    (!myGoal || myGoal.moderation_status === 'cleared');
  const allApproved = teamGoals.every((g) => myVotes[g.id] !== undefined);
  const vettingComplete = allMemberCount > 0 && allGoalsSubmitted && allCleared && allApproved;

  const activePactList = pact ? [{ id: pact.id, name: pact.name }] : [];

  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar activePacts={activePactList} />
      <main className="md:ml-64 pb-24 md:pb-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 md:py-10 space-y-8">

          {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
          <div>
            <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-2">
              Vetting Phase{pact ? ` — ${pact.name}` : ''}
            </p>
            <h1
              className="text-2xl md:text-3xl font-bold text-[#1B1F1A] mb-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Set Your Goal
            </h1>
            <p className="text-[#5C6B5E] text-sm leading-relaxed">
              Define what you&apos;re committing to this sprint and how you&apos;ll prove it. Once submitted, your teammates will review and approve your goal.
            </p>
          </div>

          {/* ── VETTING COMPLETE BANNER ──────────────────────────────────────── */}
          {vettingComplete && (
            <div className="bg-[#D8EDDA] border border-[#74C69D] rounded-[16px] p-4 flex items-center gap-3">
              <span className="text-2xl">🎉</span>
              <div>
                <p className="text-sm font-bold text-[#1B4332]">Vetting Complete!</p>
                <p className="text-xs text-[#2D6A4F] mt-0.5">All goals have been cleared and approved. The sprint can now begin.</p>
              </div>
            </div>
          )}

          {/* ── MY GOAL SECTION ─────────────────────────────────────────────── */}
          <section>
            <h2
              className="text-base font-bold text-[#1B1F1A] mb-3"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Your Goal
            </h2>

            {dataLoading ? (
              <Card className="space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-10 w-full" />
              </Card>
            ) : myGoal ? (
              /* Goal already submitted */
              <Card className="space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#1B1F1A]">{myGoal.title}</p>
                    {myGoal.description && (
                      <p className="text-xs text-[#5C6B5E] mt-1">{myGoal.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 items-end">
                    <Badge variant="pending">Awaiting Moderation</Badge>
                    <Badge variant="pending">Awaiting Peer Approval</Badge>
                  </div>
                </div>

                {myGoal.measurable_outcome && (
                  <div className="bg-[#F5F7F0] rounded-[10px] p-3">
                    <p className="text-[10px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Measurable Outcome</p>
                    <p className="text-xs text-[#1B1F1A]">{myGoal.measurable_outcome}</p>
                  </div>
                )}
                {myGoal.proof_specification && (
                  <div className="bg-[#F5F7F0] rounded-[10px] p-3">
                    <p className="text-[10px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Proof Specification</p>
                    <p className="text-xs text-[#1B1F1A]">{myGoal.proof_specification}</p>
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <ModerationBadge status={myGoal.moderation_status} />
                  <Badge variant={
                    myGoal.status === 'approved' ? 'active' :
                    myGoal.status === 'revision_requested' ? 'failed' : 'pending'
                  }>
                    {myGoal.status === 'pending_approval' ? 'Pending Approval' :
                     myGoal.status === 'approved' ? 'Approved' :
                     myGoal.status === 'revision_requested' ? 'Revision Requested' :
                     myGoal.status}
                  </Badge>
                </div>
              </Card>
            ) : (
              /* Goal form */
              <Card>
                <form onSubmit={handleSubmit(onSubmitGoal)} className="space-y-4">
                  <Input
                    id="title"
                    label="Goal Title *"
                    placeholder="e.g. Complete 10 LeetCode problems"
                    error={errors.title?.message}
                    {...register('title', { required: 'Goal title is required' })}
                  />

                  <Textarea
                    id="description"
                    label="Description"
                    placeholder="Describe your goal in more detail (optional)"
                    rows={2}
                    {...register('description')}
                  />

                  <Input
                    id="measurableOutcome"
                    label="Measurable Outcome *"
                    placeholder="e.g. Run 50km total, tracked on Strava"
                    error={errors.measurableOutcome?.message}
                    {...register('measurableOutcome', { required: 'Measurable outcome is required' })}
                  />

                  <Input
                    id="proofSpecification"
                    label="Proof Specification *"
                    placeholder="e.g. Screenshot of Strava monthly summary showing ≥50km, taken on the final day of the sprint"
                    error={errors.proofSpecification?.message}
                    {...register('proofSpecification', { required: 'Proof specification is required' })}
                  />

                  {submitError && (
                    <p className="text-xs text-[#E07A5F]">{submitError}</p>
                  )}

                  <Button type="submit" loading={submitting} className="w-full">
                    Submit for Review
                  </Button>
                </form>
              </Card>
            )}
          </section>

          {/* ── TEAM'S GOALS SECTION ─────────────────────────────────────────── */}
          <section>
            <h2
              className="text-base font-bold text-[#1B1F1A] mb-3"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Team&apos;s Goals
            </h2>

            {dataLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Card key={i} className="space-y-3">
                    <div className="flex gap-3">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </Card>
                ))}
              </div>
            ) : teamGoals.length === 0 ? (
              <Card className="text-center py-8">
                <p className="text-[#8FA38F] text-sm">Your teammates haven&apos;t submitted their goals yet.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {teamGoals.map((goal) => {
                  const myVote = myVotes[goal.id];
                  const memberProfile = goal.profiles;
                  const canVote = goal.moderation_status === 'cleared' && !myVote;
                  const isVoting = votingGoal === goal.id;

                  return (
                    <Card key={goal.id} className="space-y-4">
                      {/* Header */}
                      <div className="flex items-start gap-3">
                        <Avatar
                          src={memberProfile?.avatar_url}
                          name={memberProfile?.full_name ?? memberProfile?.username}
                          size="md"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1B1F1A]">
                            {memberProfile?.full_name ?? memberProfile?.username ?? 'Member'}
                          </p>
                          <p className="text-xs text-[#8FA38F]">
                            Proposed {formatTimeAgo(goal.created_at)}
                          </p>
                        </div>
                        <ModerationBadge status={goal.moderation_status} />
                      </div>

                      {/* Goal content */}
                      <div>
                        <p className="text-sm font-bold text-[#1B1F1A] mb-2">{goal.title}</p>
                        {goal.description && (
                          <p className="text-xs text-[#5C6B5E] mb-3">{goal.description}</p>
                        )}
                        {goal.proof_specification && (
                          <div className="bg-[#F5F7F0] rounded-[10px] p-3">
                            <p className="text-[10px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Proof Specification</p>
                            <p className="text-xs text-[#1B1F1A]">{goal.proof_specification}</p>
                          </div>
                        )}
                        {goal.measurable_outcome && (
                          <div className="bg-[#F5F7F0] rounded-[10px] p-3 mt-2">
                            <p className="text-[10px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Measurable Outcome</p>
                            <p className="text-xs text-[#1B1F1A]">{goal.measurable_outcome}</p>
                          </div>
                        )}
                      </div>

                      {/* Vote / result row */}
                      {canVote ? (
                        <div className="flex gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleApprove(goal.id)}
                            loading={isVoting}
                            className="flex-1"
                          >
                            ✅ Approve
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => setChangeModal({ open: true, goalId: goal.id, goalTitle: goal.title })}
                            className="flex-1"
                          >
                            ✏️ Request Changes
                          </Button>
                        </div>
                      ) : myVote ? (
                        <div className="pt-1">
                          {myVote === 'approved' ? (
                            <span className="inline-flex items-center gap-1.5 bg-[#D8EDDA] text-[#1B4332] rounded-full px-3 py-1.5 text-xs font-semibold">
                              ✅ Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 bg-[#FDF0EC] text-[#C0522A] rounded-full px-3 py-1.5 text-xs font-semibold">
                              ✏️ Changes Requested
                            </span>
                          )}
                        </div>
                      ) : (
                        // Not cleared yet — waiting on moderation
                        <p className="text-[11px] text-[#8FA38F] italic pt-1">
                          Voting available after moderation clearance.
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Request Changes Modal */}
      <Modal
        isOpen={changeModal.open}
        onClose={() => { if (!changeSending) { setChangeModal({ open: false, goalId: '', goalTitle: '' }); setChangeComment(''); } }}
        title="Request Changes"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#5C6B5E]">
            Requesting changes on: <span className="font-semibold text-[#1B1F1A]">{changeModal.goalTitle}</span>
          </p>
          <Textarea
            label="Comment *"
            placeholder="Explain what needs to be changed and why…"
            rows={4}
            value={changeComment}
            onChange={(e) => setChangeComment(e.target.value)}
          />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => { setChangeModal({ open: false, goalId: '', goalTitle: '' }); setChangeComment(''); }}
              disabled={changeSending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              className="flex-1"
              loading={changeSending}
              disabled={!changeComment.trim()}
              onClick={handleRequestChanges}
            >
              Send Request
            </Button>
          </div>
        </div>
      </Modal>

      <BottomNav />
    </div>
  );
}
