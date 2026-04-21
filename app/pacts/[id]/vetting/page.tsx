'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import { usePact } from '@/hooks/usePact';
import { useForm } from 'react-hook-form';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { formatDate } from '@/lib/utils';
import type { Goal, GoalVote, Profile } from '@/types';
import { formatTimeAgo, cn } from '@/lib/utils';
import type { GoalWithVotes } from '@/types';

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
export default function VettingPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = React.use(params);
  const pactId = resolvedParams.id;
  const { user, userLoading } = useUser();
  const { pact, pactLoading } = usePact(pactId);

  const [myGoal, setMyGoal] = useState<GoalWithVotes | null>(null);
  const [teamGoals, setTeamGoals] = useState<GoalWithVotes[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, 'approved' | 'change_requested'>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState('');

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

  // Auth guard removed - server-side auth handles it

  // Fetch goals
  const fetchGoals = useCallback(async () => {
    if (!user || !pact) return;
    setDataLoading(true);

    try {
      const res = await fetch(`/api/pacts/${pactId}/vetting/goals`);
      const json = await res.json();

      if (!res.ok) {
        console.error('Failed to fetch goals:', json.error);
        setDataLoading(false);
        return;
      }

      const goals = (json.goals as GoalWithVotes[]) ?? [];
      console.log('[Vetting Page] Goals fetched:', goals.map(g => ({
        id: g.id,
        user_id: g.user_id,
        status: g.status,
        moderation_status: g.moderation_status,
        votes: g.goal_votes?.map(v => ({ voter_id: v.voter_id, decision: v.decision }))
      })));
      setTeamGoals(goals.filter((g) => g.user_id !== user.id));
      setMyGoal(goals.find((g) => g.user_id === user.id) ?? null);

      // Get my votes
      const supabase = createClient();
      const { data: votes } = await supabase
        .from('goal_votes')
        .select('*')
        .eq('pact_id', pactId)
        .eq('sprint_number', pact.current_sprint)
        .eq('voter_id', user.id);
      setMyVotes(Object.fromEntries((votes ?? []).map((v) => [v.goal_id, v.decision])));

      const mine = goals.find((g) => g.user_id === user.id) ?? null;
      const team = goals.filter((g) => g.user_id !== user.id);

      setMyGoal(mine);
      setTeamGoals(team);

      // Seed my existing votes
      const voteMap: Record<string, 'approved' | 'change_requested'> = {};
      team.forEach((g) => {
        const myVote = g.goal_votes?.find((v) => v.voter_id === user.id);
        if (myVote) {
          voteMap[g.id] = myVote.decision;
        }
      });
      setMyVotes(voteMap);
    } catch (e) {
      console.error('Failed to fetch goals:', e);
    } finally {
      setDataLoading(false);
    }
  }, [user, pact, pactId]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // ── Submit my goal ─────────────────────────────────────────────────────────
  const onSubmitGoal = async (vals: GoalFormValues) => {
    if (!user || !pact) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch(`/api/pacts/${pactId}/vetting/goals/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: vals.title,
          description: vals.description || null,
          measurable_outcome: vals.measurableOutcome,
          proof_specification: vals.proofSpecification,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setSubmitError(json.error || 'Failed to create goal');
        setSubmitting(false);
        return;
      }

      await fetchGoals();
    } catch (e) {
      setSubmitError('Failed to create goal');
      console.error('Failed to create goal:', e);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Approve goal ───────────────────────────────────────────────────────────
  const handleApprove = async (goalId: string) => {
    if (!user || myVotes[goalId] || votingGoal === goalId) return;
    setVotingGoal(goalId);

    try {
      const res = await fetch(`/api/pacts/${pactId}/vetting/goals/${goalId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approved', comment: null }),
      });

      if (res.ok) {
        setMyVotes((prev) => ({ ...prev, [goalId]: 'approved' }));
        // Refetch goal data to update status
        await fetchGoals();
      } else {
        const json = await res.json();
        console.error('Failed to approve goal:', json.error);
      }
    } catch (e) {
      console.error('Failed to approve goal:', e);
    } finally {
      setVotingGoal(null);
    }
  };

  // ── Request changes modal submit ────────────────────────────────────────────
  const handleRequestChanges = async () => {
    if (!user || !changeComment.trim()) return;
    setChangeSending(true);

    try {
      const res = await fetch(`/api/pacts/${pactId}/vetting/goals/${changeModal.goalId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'change_requested', comment: changeComment.trim() }),
      });

      if (res.ok) {
        setMyVotes((prev) => ({ ...prev, [changeModal.goalId]: 'change_requested' }));
        setChangeModal({ open: false, goalId: '', goalTitle: '' });
        setChangeComment('');
      } else {
        const json = await res.json();
        console.error('Failed to request changes:', json.error);
      }
    } catch (e) {
      console.error('Failed to request changes:', e);
    } finally {
      setChangeSending(false);
    }
  };

  // ── Check vetting complete ─────────────────────────────────────────────────
  const allMemberCount = pact?.members.length ?? 0;
  const allGoalsSubmitted = teamGoals.length + (myGoal ? 1 : 0) >= allMemberCount;
  const allCleared = teamGoals.every((g) => g.moderation_status === 'cleared') &&
    (!myGoal || myGoal.moderation_status === 'cleared');
  const allApproved = teamGoals.every((g) => g.status === 'approved') &&
    (!myGoal || myGoal.status === 'approved');
  const vettingComplete = allMemberCount > 0 && allGoalsSubmitted && allCleared && allApproved;

  // Auto-transition to active when vetting is complete
  useEffect(() => {
    if (vettingComplete && !transitioning && pact?.status === 'vetting' && !transitionError) {
      const transitionToActive = async () => {
        setTransitioning(true);
        setTransitionError('');
        try {
          const res = await fetch(`/api/pacts/${pactId}/complete-vetting`, {
            method: 'POST',
          });
          const json = await res.json();
          console.log('[Transition Response] Status:', res.status, 'Body:', json);
          if (!res.ok) {
            console.error('[Transition Error]', json);
            setTransitionError(json.error || `Failed to transition to active phase (status ${res.status})`);
          } else {
            // Refresh the pact data to get the new status
            window.location.reload();
          }
        } catch (e) {
          console.error('[Transition Exception]', e);
          setTransitionError('Failed to transition to active phase');
          console.error('Failed to transition:', e);
        } finally {
          setTransitioning(false);
        }
      };
      transitionToActive();
    }
  }, [vettingComplete, pact?.status, pactId, transitioning, transitionError]);

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
              {pact?.status === 'active' ? 'Check Goals' : myGoal ? 'Your Goal' : 'Set Your Goal'}
            </h1>
            <p className="text-[#5C6B5E] text-sm leading-relaxed">
              {myGoal
                ? 'Your goal has been submitted. Wait for your teammates to review and approve it.'
                : 'Define what you&apos;re committing to this sprint and how you&apos;ll prove it. Once submitted, your teammates will review and approve your goal.'
              }
            </p>
          </div>

          {/* ── VETTING COMPLETE BANNER ──────────────────────────────────────── */}
          {vettingComplete && (
            <div className="bg-[#D8EDDA] border border-[#74C69D] rounded-[16px] p-4 flex items-center gap-3">
              <span className="text-2xl">{transitioning ? '⏳' : '🎉'}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#1B4332]">
                  {transitioning ? 'Starting Sprint...' : 'Vetting Complete!'}
                </p>
                <p className="text-xs text-[#2D6A4F] mt-0.5">
                  {transitioning
                    ? 'Transitioning to active phase...'
                    : 'All goals have been cleared and approved. The sprint is starting.'}
                </p>
                {transitionError && (
                  <p className="text-xs text-[#E07A5F] mt-1">{transitionError}</p>
                )}
              </div>
            </div>
          )}

          {/* ── MY GOAL SECTION ─────────────────────────────────────────────── */}
          {pact?.status === 'active' ? (
            <Card className="text-center py-8">
              <p className="text-sm font-semibold text-[#1B1F1A] mb-2">Sprint In Progress</p>
              <p className="text-xs text-[#5C6B5E]">Goal setting is closed during the active sprint phase.</p>
            </Card>
          ) : (
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
                      {myGoal.moderation_status === 'pending' && (
                        <Badge variant="pending">Awaiting Moderation</Badge>
                      )}
                      {myGoal.status === 'pending_approval' && (
                        <Badge variant="pending">Awaiting Peer Approval</Badge>
                      )}
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
          )}

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
