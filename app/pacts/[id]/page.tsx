'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import { usePact } from '@/hooks/usePact';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import CountdownTimer from '@/components/ui/CountdownTimer';
import ProgressBar from '@/components/ui/ProgressBar';
import Skeleton from '@/components/ui/Skeleton';
import { formatTimeAgo, formatCurrency, getCategoryColor, cn } from '@/lib/utils';
import type { Notification, Goal, PactMember, Profile } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────────
type TabKey = 'members' | 'activity' | 'applications' | 'settings' | 'moderation' | 'results';

function getSprintProgress(startsAt: string, endsAt: string): number {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function ctaForPact(
  pactStatus: string,
  pactId: string,
  sprintId: string | undefined,
  hasGoal: boolean,
  hasSubmission: boolean
): { label: string; href: string } | null {
  if (pactStatus === 'vetting') {
    return { label: hasGoal ? 'Check Goals' : 'Set Your Goal', href: `/pacts/${pactId}/vetting` };
  }
  if (pactStatus === 'active' && !hasSubmission) {
    return { label: 'Submit Proof', href: `/pacts/${pactId}/locker` };
  }
  if (pactStatus === 'verdict') {
    return { label: 'Cast Your Vote', href: `/pacts/${pactId}/verdict` };
  }
  return null;
}

function notifIcon(type: Notification['type']): string {
  const icons: Record<string, string> = {
    goal_approval_needed: '✅',
    sprint_starting: '🚀',
    proof_due: '📎',
    verdict_open: '⚖️',
    verdict_result: '🏆',
    appeal_result: '📋',
    nudge: '👋',
    inactivity_warning: '⚠️',
    invite_received: '📬',
    application_approved: '🎉',
    application_rejected: '❌',
    application_received: '📝',
    proof_upload: '📸',
  };
  return icons[type] ?? '🔔';
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PactOverviewPage() {
  const params = useParams();
  const pactId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { pact, pactLoading, loading, error, refetch: refetchPact } = usePact(pactId);

  const [tab, setTab] = useState<TabKey>('members');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [myGoal, setMyGoal] = useState<Goal | null>(null);
  const [hasSubmission, setHasSubmission] = useState(false);
  const [memberSubmissions, setMemberSubmissions] = useState<Record<string, boolean>>({});
  const [memberGoals, setMemberGoals] = useState<Record<string, Goal>>({});
  const [nudgedUsers, setNudgedUsers] = useState<Set<string>>(new Set());
  const [nudgingUser, setNudgingUser] = useState<string | null>(null);
  const [extraLoading, setExtraLoading] = useState(true);
  const [applications, setApplications] = useState<any[]>([]);
  const [processingApplication, setProcessingApplication] = useState<string | null>(null);
  const [startingSprint, setStartingSprint] = useState(false);
  const [pendingGoals, setPendingGoals] = useState<any[]>([]);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [proofModal, setProofModal] = useState<{ open: boolean; url: string; type: string }>({ open: false, url: '', type: '' });
  const [forceCompletingSprint, setForceCompletingSprint] = useState(false);
  const [reopeningSprint, setReopeningSprint] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [verdicts, setVerdicts] = useState<any[]>([]);
  const [exitingPact, setExitingPact] = useState(false);
  const [startingNextSprint, setStartingNextSprint] = useState(false);
  const [deletingPact, setDeletingPact] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Auth guard - removed since server-side auth handles it

  // Fetch extra data (notifications, goal, submissions)
  const fetchExtra = useCallback(async () => {
    if (!pact) return;
    if (!user) {
      setExtraLoading(false);
      return;
    }
    const supabase = createClient();
    setExtraLoading(true);

    const currentUser = user as any;
    const userId = currentUser.id;
    const isAdmin = pact && currentUser ? (pact.created_by === currentUser.id || pact.members.some((m) => m.user_id === currentUser.id && m.role === 'admin')) : false;

    try {
      // Fetch notifications
      const { data: notifData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('pact_id', pactId)
        .order('created_at', { ascending: false })
        .limit(50);

      // Fetch proof submissions via API endpoint (only if user is still a member)
      const proofRes = await fetch(`/api/pacts/${pactId}/proof-submissions`);
      const proofJson = proofRes.ok ? await proofRes.json() : { submissions: [] };
      console.log('[fetchExtra] Proof submissions response:', proofJson);

      const proofSubmissions = proofJson.submissions ?? [];
      const filteredProofSubmissions = proofSubmissions;

      // Convert proof submissions to notification-like objects for display
      const proofNotifs = filteredProofSubmissions.map((sub: any) => ({
        id: sub.id,
        user_id: sub.user_id,
        type: 'proof_upload',
        title: sub.user_id === user.id ? 'You uploaded a proof' : `${sub.profiles?.full_name || sub.profiles?.username || 'Someone'} uploaded a proof`,
        body: 'Tap to view',
        data: JSON.stringify({
          proof_url: sub.file_urls?.[0],
          proof_type: sub.caption || 'file', // Use caption field to get file type
          uploaded_by: sub.user_id,
        }),
        pact_id: pactId,
        is_read: true,
        created_at: sub.submitted_at,
      }));

      // Merge notifications and proof submissions
      const allActivity = [...(notifData ?? []), ...proofNotifs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setNotifications(allActivity);

      // Fetch current sprint
      const { data: sprintData } = await supabase
        .from('sprints')
        .select('*')
        .eq('pact_id', pactId)
        .eq('status', 'active')
        .maybeSingle();

      if (sprintData) {
        // Check if user has a goal for current sprint
        const { data: goalData } = await supabase
          .from('goals')
          .select('*')
          .eq('sprint_number', sprintData.sprint_number)
          .eq('pact_id', pactId)
          .eq('user_id', user.id)
          .maybeSingle();

        setMyGoal(goalData ?? null);

        // Check if user has submitted for current sprint
        const { data: subData } = await supabase
          .from('submissions')
          .select('id')
          .eq('sprint_id', sprintData.id)
          .eq('user_id', user.id)
          .maybeSingle();

        setHasSubmission(!!subData);

        // Check which members have submitted
        const { data: allSubs } = await supabase
          .from('submissions')
          .select('user_id')
          .eq('sprint_id', sprintData.id);

        const subMap: Record<string, boolean> = {};
        allSubs?.forEach((s) => { subMap[s.user_id] = true; });
        setMemberSubmissions(subMap);

        // Fetch all members' goals for current sprint
        const { data: allGoals } = await supabase
          .from('goals')
          .select('*')
          .eq('sprint_number', sprintData.sprint_number)
          .eq('pact_id', pactId);

        const goalMap: Record<string, Goal> = {};
        allGoals?.forEach((g) => { goalMap[g.user_id] = g; });
        setMemberGoals(goalMap);
      }

      // Fetch pending applications (admin only)
      if (isAdmin) {
        const res = await fetch(`/api/pact-applications?pact_id=${pactId}`);
        const json = await res.json();
        if (res.ok) {
          setApplications(json.applications ?? []);
        } else {
          console.error('Failed to fetch applications:', json.error);
        }
      }
    } catch (e) {
      console.error('Failed to fetch extra data:', e);
    } finally {
      setExtraLoading(false);
    }
  }, [pact, pactId, user]);

  useEffect(() => {
    fetchExtra();
  }, [fetchExtra]);

  const fetchResults = async () => {
    setResultsLoading(true);
    try {
      const res = await fetch(`/api/pacts/${pactId}/results`);
      const json = await res.json();
      if (res.ok) {
        setVerdicts(json.verdicts ?? []);
      } else {
        console.error('Failed to fetch results:', json.error);
      }
    } catch (e) {
      console.error('Failed to fetch results:', e);
    } finally {
      setResultsLoading(false);
    }
  };

  // Nudge handler
  const handleNudge = async (targetUserId: string) => {
    if (!sprint || !pact || !user) return;
    setNudgingUser(targetUserId);
    try {
      await fetch('/api/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_user_id: targetUserId,
          pact_id: pactId,
          nudger_id: user.id,
        }),
      });
      setNudgedUsers((prev) => new Set([...prev, targetUserId]));
      const currentUser = user as any;
      const nudgeKey = `nudged_${pactId}_${currentUser.id}`;
      localStorage.setItem(nudgeKey, JSON.stringify([...nudgedUsers, targetUserId]));
    } catch (e) {
      console.error('Failed to nudge user:', e);
    } finally {
      setNudgingUser(null);
    }
  };

  const handleApproveApplication = async (applicationId: string, applicantUserId: string) => {
    setProcessingApplication(applicationId);
    try {
      const res = await fetch('/api/pact-applications/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: applicationId, pact_id: pactId, user_id: applicantUserId }),
      });
      if (res.ok) {
        setApplications((prev) => prev.filter((a) => a.id !== applicationId));
        fetchExtra();
      } else {
        console.error('Failed to approve application');
      }
    } catch (e) {
      console.error('Failed to approve application:', e);
    } finally {
      setProcessingApplication(null);
    }
  };

  const handleRejectApplication = async (applicationId: string) => {
    setProcessingApplication(applicationId);
    try {
      const res = await fetch('/api/pact-applications/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: applicationId }),
      });
      if (res.ok) {
        setApplications((prev) => prev.filter((a) => a.id !== applicationId));
      } else {
        console.error('Failed to reject application');
      }
    } catch (e) {
      console.error('Failed to reject application:', e);
    } finally {
      setProcessingApplication(null);
    }
  };

  const handleStartSprint = async () => {
    setStartingSprint(true);
    try {
      const res = await fetch(`/api/pacts/${pactId}/start-sprint`, {
        method: 'POST',
      });
      if (res.ok) {
        router.push(`/pacts/${pactId}/vetting`);
      } else {
        const json = await res.json();
        console.error('Failed to start sprint:', json.error);
      }
    } catch (e) {
      console.error('Failed to start sprint:', e);
    } finally {
      setStartingSprint(false);
    }
  };

  const handleForceCompleteSprint = async () => {
    setForceCompletingSprint(true);
    try {
      const res = await fetch(`/api/pacts/${pactId}/force-complete-sprint`, {
        method: 'POST',
      });
      if (res.ok) {
        // Refetch pact data to show updated state
        await refetchPact();
      } else {
        const json = await res.json();
        console.error('Failed to force complete sprint:', json.error);
        alert(json.error || 'Failed to force complete sprint');
      }
    } catch (e) {
      console.error('Failed to force complete sprint:', e);
      alert('Failed to force complete sprint');
    } finally {
      setForceCompletingSprint(false);
    }
  };

  const handleReopenSprint = async () => {
    setReopeningSprint(true);
    try {
      const res = await fetch(`/api/pacts/${pactId}/reopen-sprint`, {
        method: 'POST',
      });
      if (res.ok) {
        // Refetch pact data to show updated state
        await refetchPact();
      } else {
        const json = await res.json();
        console.error('Failed to reopen sprint:', json.error);
        alert(json.error || 'Failed to reopen sprint');
      }
    } catch (e) {
      console.error('Failed to reopen sprint:', e);
      alert('Failed to reopen sprint');
    } finally {
      setReopeningSprint(false);
    }
  };

  // Show "not found" only after loading finishes and pact is still null
  if (!pactLoading && (error || !pact)) {
    return (
      <div className="min-h-screen bg-[#F5F7F0] flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-[#1B1F1A] mb-2">Pact not found</p>
          <Link href="/lobby" className="text-[#2D6A4F] text-sm underline">Back to Lobby</Link>
        </div>
      </div>
    );
  }

  const currentUser = user as any;
  const isAdmin = pact && currentUser ? (pact.created_by === currentUser.id || pact.members.some((m) => m.user_id === currentUser.id && m.role === 'admin')) : false;

  const fetchPendingGoals = useCallback(async () => {
    if (!isAdmin || !pact) return;
    setModerationLoading(true);
    try {
      const res = await fetch('/api/admin/goals');
      const json = await res.json();

      if (res.ok) {
        const pactGoals = (json.goals ?? []).filter((g: any) => g.pact_id === pactId);
        setPendingGoals(pactGoals);
      } else {
        console.error('Failed to fetch pending goals:', json.error);
      }
    } catch (e) {
      console.error('Failed to fetch pending goals:', e);
    } finally {
      setModerationLoading(false);
    }
  }, [isAdmin, pact, pactId]);

  const handleClearGoal = async (goalId: string) => {
    try {
      const res = await fetch(`/api/admin/goals/${goalId}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleared' }),
      });
      if (res.ok) {
        await fetchPendingGoals();
      } else {
        const json = await res.json();
        console.error('Failed to clear goal:', json.error);
      }
    } catch (e) {
      console.error('Failed to clear goal:', e);
    }
  };

  const handleExitPact = async () => {
    if (!confirm('Are you sure you want to exit this pact?')) return;
    setExitingPact(true);
    try {
      console.log('[Page] Attempting to exit pact:', pactId);
      const res = await fetch(`/api/pacts/${pactId}/exit`, {
        method: 'POST',
      });
      console.log('[Page] Exit response status:', res.status);
      const json = await res.json();
      console.log('[Page] Exit response:', json);
      
      if (res.ok) {
        alert('You have exited the pact');
        await fetchExtra();
      } else {
        console.error('[Page] Exit failed:', json);
        alert(json.error || 'Failed to exit pact');
      }
    } catch (e) {
      console.error('[Page] Failed to exit pact:', e);
      alert('Failed to exit pact');
    } finally {
      setExitingPact(false);
    }
  };

  const handleStartNextSprint = async () => {
    if (!pact) return;
    setStartingNextSprint(true);
    try {
      const res = await fetch(`/api/pacts/${pactId}/start-next-sprint`, {
        method: 'POST',
      });
      if (res.ok) {
        router.push(`/pacts/${pactId}/vetting`);
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to start next sprint');
      }
    } catch (e) {
      console.error('Failed to start next sprint:', e);
      alert('Failed to start next sprint');
    } finally {
      setStartingNextSprint(false);
    }
  };

  const handleDeletePact = async () => {
    setShowDeleteModal(false);
    setDeleteMessage(null);
    setDeletingPact(true);
    try {
      console.log('[Page] Attempting to delete pact:', pactId);
      const res = await fetch(`/api/pacts/${pactId}/delete`, {
        method: 'DELETE',
      });
      console.log('[Page] Delete response status:', res.status);
      const json = await res.json();
      console.log('[Page] Delete response:', json);
      
      if (res.ok) {
        router.push('/lobby');
      } else {
        console.error('[Page] Delete failed:', json);
        setDeleteMessage(json.error || 'Failed to delete pact');
      }
    } catch (e) {
      console.error('[Page] Failed to delete pact:', e);
      setDeleteMessage('Failed to delete pact');
    } finally {
      setDeletingPact(false);
    }
  };

  useEffect(() => {
    if (tab === 'moderation') {
      fetchPendingGoals();
    }
    if (tab === 'results' && pact?.status === 'completed') {
      fetchResults();
    }
  }, [tab, fetchPendingGoals, pact?.status]);
  const categoryColor = getCategoryColor(pact?.category ?? null);
  const sprint = pact?.currentSprint ?? null;
  const sprintPct = sprint ? getSprintProgress(sprint.starts_at, sprint.ends_at) : 0;
  const ctaAction = pact ? ctaForPact(pact.status, pactId, sprint?.id, !!myGoal, hasSubmission) : null;
  const activePactList = pact ? [{ id: pact.id, name: pact.name }] : [];

  // Tabs available
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'members', label: 'Members' },
    { key: 'activity', label: 'Activity' },
    ...(pact?.status === 'completed' ? [{ key: 'results' as TabKey, label: 'Results' }] : []),
    ...(isAdmin ? [{ key: 'applications' as TabKey, label: 'Applications' }] : []),
    ...(isAdmin ? [{ key: 'moderation' as TabKey, label: 'Moderation' }] : []),
    ...(isAdmin ? [{ key: 'settings' as TabKey, label: 'Settings' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar activePacts={activePactList} />
      <main className="md:ml-64 pb-24 md:pb-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 md:py-10 space-y-6">

          {/* ── HEADER ──────────────────────────────────────────────────────── */}
          <div>
            <div className="h-1 w-16 rounded-full mb-4" style={{ backgroundColor: categoryColor }} />
            {pactLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-9 w-72" />
                <Skeleton className="h-4 w-96" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {pact?.category && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: `${categoryColor}22`, color: categoryColor }}>
                        {pact.category}
                      </span>
                    )}
                    {pact && (
                      <Badge variant={pact.status === 'active' ? 'active' : pact.status === 'completed' ? 'completed' : 'pending'}>
                        {pact.status.charAt(0).toUpperCase() + pact.status.slice(1)}
                      </Badge>
                    )}
                  </div>
                  {/* Exit button - shown when user is active member but NOT admin */}
                  {pact && currentUser && pact.members.some((m) => m.user_id === currentUser.id && m.status === 'active') && !isAdmin && (
                    <Button
                      onClick={handleExitPact}
                      loading={exitingPact}
                      variant="secondary"
                      size="sm"
                    >
                      Exit Pact
                    </Button>
                  )}
                  {/* Delete button - shown only for admins */}
                  {isAdmin && (
                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={() => setShowDeleteModal(true)}
                        loading={deletingPact}
                        variant="danger"
                        size="sm"
                      >
                        Delete Pact
                      </Button>
                      {deleteMessage && (
                        <p className="text-xs text-red-600 text-center">{deleteMessage}</p>
                      )}
                    </div>
                  )}
                  {/* Apply button - shown when user is not a member or has been removed */}
                  {pact && currentUser && !pact.members.some((m) => m.user_id === currentUser.id && m.status === 'active') && pact.status !== 'completed' && (
                    <Button
                      onClick={() => router.push(`/marketplace?pact=${pactId}`)}
                      variant="primary"
                      size="sm"
                    >
                      Apply
                    </Button>
                  )}
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-[#1B1F1A] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                  {pact?.name ?? ''}
                </h1>
                {pact?.mission && <p className="text-[#5C6B5E] text-sm leading-relaxed max-w-2xl">{pact.mission}</p>}
              </>
            )}
          </div>

          {/* ── MEMBERS QUICK ROW ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {(pact?.members ?? []).map((member) => {
              const submitted = memberSubmissions[member.user_id];
              const goal = memberGoals[member.user_id];
              const isMe = currentUser && member.user_id === currentUser.id;
              const canNudge = !isMe && pact?.status === 'active' && !submitted;
              const alreadyNudged = nudgedUsers.has(member.user_id);

              // Determine status
              let statusIcon = '⏳';
              let statusText = 'In Progress';
              let statusColor = 'bg-[#FEF3E2] text-[#B5540A]';

              if (submitted) {
                statusIcon = '✅';
                statusText = 'Submitted';
                statusColor = 'bg-[#D8EDDA] text-[#1B4332]';
              } else if (sprint && new Date(sprint.ends_at) < new Date()) {
                statusIcon = '❌';
                statusText = 'Failed';
                statusColor = 'bg-[#FDF0EC] text-[#C0522A]';
              }

              return (
                <Card key={member.id} className="flex flex-col items-center text-center py-4 px-3 gap-2 relative">
                  <Avatar
                    src={member.profiles?.avatar_url}
                    name={member.profiles?.full_name ?? member.profiles?.username}
                    size="md"
                  />
                  <div>
                    <p className="text-xs font-semibold text-[#1B1F1A] truncate max-w-[80px]">
                      {member.profiles?.full_name ?? member.profiles?.username ?? 'Member'}
                      {isMe && <span className="text-[#8FA38F] font-normal"> (you)</span>}
                    </p>
                    <p className="text-[10px] text-[#8FA38F]">Score: {member.profiles?.integrity_score ?? '—'}</p>
                  </div>

                  {/* Goal */}
                  {goal && (
                    <div className="text-center">
                      <p className="text-[10px] font-medium text-[#1B1F1A] truncate max-w-[90px]">{goal.title}</p>
                    </div>
                  )}

                  {/* Sprint status badge */}
                  {sprint && sprint.status !== 'completed' && (
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      statusColor
                    )}>
                      {statusIcon} {statusText}
                    </span>
                  )}

                  {/* Nudge button */}
                  {canNudge && (
                    <button
                      type="button"
                      disabled={alreadyNudged || nudgingUser === member.user_id}
                      onClick={() => handleNudge(member.user_id)}
                      className={cn(
                        'text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all',
                        alreadyNudged
                          ? 'bg-[#D8EDDA] text-[#1B4332] border-[#B4D9BB] cursor-default'
                          : 'bg-white text-[#5C6B5E] border-[#E0EBE1] hover:border-[#2D6A4F] hover:text-[#1B4332]'
                      )}
                    >
                      {alreadyNudged ? 'Nudged ✓' : nudgingUser === member.user_id ? '…' : '👋 Nudge'}
                    </button>
                  )}
                </Card>
              );
            })}
          </div>

          {/* ── SPRINT STATUS CARD ───────────────────────────────────────────── */}
          {sprint && (
            <Card className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E]">
                    Sprint {pact?.current_sprint}
                  </p>
                  <p className="text-sm font-semibold text-[#1B1F1A] mt-0.5">
                    {sprint.status === 'completed' ? 'Sprint Completed' : 'In Progress'}
                  </p>
                </div>
                {sprint.status !== 'completed' && (
                  <div className="text-right">
                    <p className="text-[10px] text-[#8FA38F] uppercase tracking-wide mb-1">Time Remaining</p>
                    <CountdownTimer endDate={sprint.ends_at} size="sm" />
                  </div>
                )}
              </div>

              <ProgressBar value={sprintPct} label="Sprint Progress" showPercent />

              {/* My goal */}
              {myGoal && (
                <div className="bg-[#F5F7F0] rounded-[12px] p-3">
                  <p className="text-[10px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Your Goal</p>
                  <p className="text-sm font-semibold text-[#1B1F1A]">{myGoal.title}</p>
                  {myGoal.measurable_outcome && (
                    <p className="text-xs text-[#5C6B5E] mt-1">{myGoal.measurable_outcome}</p>
                  )}
                </div>
              )}

              {/* CTA */}
              {ctaAction && (
                <Link
                  href={ctaAction.href}
                  className="inline-flex items-center justify-center w-full bg-[#1B4332] text-white rounded-[12px] px-6 py-3 text-sm font-semibold hover:bg-[#2D6A4F] transition-colors"
                >
                  {ctaAction.label}
                </Link>
              )}

              {/* TEMP: Force End Sprint Button */}
              {isAdmin && sprint && sprint.status !== 'completed' && sprint.status !== 'verdict_phase' && (
                <Button
                  onClick={handleForceCompleteSprint}
                  loading={forceCompletingSprint}
                  variant="secondary"
                  size="sm"
                  className="w-full"
                >
                  Force End Sprint (TEMP)
                </Button>
              )}

              {/* TEMP: Reopen Sprint Button */}
              {isAdmin && sprint && sprint.status === 'verdict_phase' && sprintPct < 100 && (
                <Button
                  onClick={handleReopenSprint}
                  loading={reopeningSprint}
                  variant="secondary"
                  size="sm"
                  className="w-full"
                >
                  Reopen Sprint (TEMP)
                </Button>
              )}

              {/* Start Next Sprint Button - shown when sprint is completed */}
              {isAdmin && sprint && sprint.status === 'completed' && (
                <Button
                  onClick={handleStartNextSprint}
                  loading={startingNextSprint}
                  variant="primary"
                  size="sm"
                  className="w-full"
                >
                  Start Next Sprint
                </Button>
              )}
            </Card>
          )}

          {/* Forming/no sprint CTA */}
          {!sprint && pact?.status === 'forming' && (
            <Card className="text-center py-8 space-y-3">
              <p className="text-[#5C6B5E] text-sm">Waiting for all members to join before the sprint begins.</p>
              <div className="flex justify-center">
                <span className="inline-flex items-center gap-2 bg-[#FEF3E2] text-[#B5540A] text-xs font-semibold px-3 py-1.5 rounded-full">
                  ⏳ {pact?.members.length ?? 0} / {pact?.max_members ?? '?'} members joined
                </span>
              </div>
              {isAdmin && (
                <Button
                  onClick={handleStartSprint}
                  loading={startingSprint}
                  variant="secondary"
                  size="sm"
                  className="mx-auto"
                >
                  Force Start Sprint
                </Button>
              )}
            </Card>
          )}

          {/* ── TABS ────────────────────────────────────────────────────────── */}
          <div>
            {/* Tab bar */}
            <div className="flex gap-1 bg-[#F0F5F0] rounded-[12px] p-1 mb-4">
              {tabs.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-[10px] text-sm font-semibold transition-all',
                    tab === key
                      ? 'bg-white text-[#1B4332] shadow-sm'
                      : 'text-[#5C6B5E] hover:text-[#1B1F1A]'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Members tab */}
            {tab === 'members' && (
              <div className="space-y-3">
                {(pact?.members ?? []).map((member) => {
                  const submitted = memberSubmissions[member.user_id];
                  const isMe = currentUser && member.user_id === currentUser.id;
                  return (
                    <Card key={member.id} className="flex items-center gap-4">
                      <Avatar
                        src={member.profiles?.avatar_url}
                        name={member.profiles?.full_name ?? member.profiles?.username}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-[#1B1F1A]">
                            {member.profiles?.full_name ?? member.profiles?.username ?? 'Member'}
                          </p>
                          {isMe && (
                            <span className="text-[10px] bg-[#D8EDDA] text-[#1B4332] font-semibold px-2 py-0.5 rounded-full">You</span>
                          )}
                          {member.role === 'admin' && (
                            <span className="text-[10px] bg-[#1B4332] text-white font-semibold px-2 py-0.5 rounded-full">Admin</span>
                          )}
                        </div>
                        <p className="text-xs text-[#8FA38F]">
                          Integrity Score: {member.profiles?.integrity_score ?? '—'} •{' '}
                          {member.profiles?.sprints_completed ?? 0} sprints completed
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        {sprint && sprint.status !== 'completed' && (
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold',
                            submitted ? 'bg-[#D8EDDA] text-[#1B4332]' : 'bg-[#FEF3E2] text-[#B5540A]'
                          )}>
                            {submitted ? '✓ Submitted' : 'Pending'}
                          </span>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Activity tab */}
            {tab === 'activity' && (
              <div>
                {/* Proof submission */}
                {pact?.status === 'active' && (
                  <Card className="mb-6 space-y-4">
                  <h3 className="text-sm font-bold text-[#1B1F1A]" style={{ fontFamily: 'var(--font-display)' }}>
                    Share Your Proof
                  </h3>
                  <p className="text-xs text-[#5C6B5E]">
                    Upload an image, audio, or video file to share your progress with the team.
                  </p>
                  <div className="space-y-3">
                    <input
                      type="file"
                      accept="image/*,audio/*,video/*"
                      id="proof-upload"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        setUploadingProof(true);
                        setUploadError('');

                        // Upload proof
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('pact_id', pactId);
                        formData.append('user_id', user?.id ?? '');

                        try {
                          const res = await fetch('/api/pact-activity/proof', {
                            method: 'POST',
                            body: formData,
                          });
                          const json = await res.json();

                          if (res.ok) {
                            // Refresh activity
                            await fetchExtra();
                            // Clear the file input
                            e.target.value = '';
                          } else {
                            setUploadError(json.error || 'Failed to upload proof');
                          }
                        } catch (err) {
                          console.error('Failed to upload proof:', err);
                          setUploadError('Failed to upload proof. Please try again.');
                        } finally {
                          setUploadingProof(false);
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={uploadingProof}
                      onClick={() => document.getElementById('proof-upload')?.click()}
                    >
                      Upload Proof
                    </Button>
                    {uploadError && (
                      <p className="text-xs text-[#E07A5F]">{uploadError}</p>
                    )}
                  </div>
                </Card>
                )}

                {notifications.length === 0 && !extraLoading ? (
                  <Card className="text-center py-10">
                    <p className="text-[#8FA38F] text-sm">No activity yet for this pact.</p>
                  </Card>
                ) : extraLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="bg-white rounded-[20px] border border-[#E0EBE1] p-4 flex gap-3">
                        <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-5 top-0 bottom-0 w-px bg-[#E0EBE1]" />
                    <div className="space-y-0">
                      {notifications.map((notif) => {
                        let proofData = null;
                        try {
                          proofData = notif.data ? JSON.parse(notif.data as string) : null;
                        } catch { }

                        const isProofUpload = notif.type === 'proof_upload';

                        return (
                          <div key={notif.id} className="relative flex gap-4 pb-4">
                            {/* Dot */}
                            <div className={cn(
                              'relative z-10 w-10 h-10 rounded-full border-2 border-white flex items-center justify-center flex-shrink-0 text-base',
                              notif.is_read ? 'bg-[#F0F5F0]' : 'bg-[#D8EDDA]'
                            )}>
                              {notifIcon(notif.type)}
                            </div>
                            <Card className={cn('flex-1 py-3 px-4', !notif.is_read && 'border-[#74C69D]')}>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-[#1B1F1A] leading-snug">{notif.title}</p>
                                <p className="text-[10px] text-[#8FA38F] flex-shrink-0 whitespace-nowrap">
                                  {formatTimeAgo(notif.created_at)}
                                </p>
                              </div>
                              {notif.body && (
                                <p className="text-xs text-[#5C6B5E] mt-1">{notif.body}</p>
                              )}
                              {isProofUpload && proofData?.proof_url && (
                                <div className="mt-3 flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      // Detect file type from URL extension as fallback
                                      const url = proofData.proof_url;
                                      const ext = url.split('.').pop()?.toLowerCase() || '';
                                      const detectedType = ext.match(/^(jpg|jpeg|png|gif|webp)$/) ? 'image' :
                                                           ext.match(/^(mp4|webm|mov|avi)$/) ? 'video' :
                                                           ext.match(/^(mp3|wav|ogg|m4a)$/) ? 'audio' : proofData.proof_type;
                                      console.log('[Proof Modal] Opening modal with type:', detectedType, 'from URL:', url);
                                      setProofModal({ open: true, url: proofData.proof_url, type: detectedType });
                                    }}
                                  >
                                    Tap to view
                                  </Button>
                                  {proofData.uploaded_by === user?.id && (
                                    <Button
                                      size="sm"
                                      variant="danger"
                                      onClick={async () => {
                                        try {
                                          const res = await fetch(`/api/pact-activity/proof/${notif.id}/delete`, {
                                            method: 'POST',
                                          });
                                          if (res.ok) {
                                            await fetchExtra();
                                          }
                                        } catch (e) {
                                          console.error('Failed to delete proof:', e);
                                        }
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  )}
                                </div>
                              )}
                            </Card>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Proof Modal */}
            <Modal
              isOpen={proofModal.open}
              onClose={() => setProofModal({ open: false, url: '', type: '' })}
              title="Proof"
            >
              {proofModal.type === 'image' ? (
                <img
                  src={proofModal.url}
                  alt="Proof"
                  className="rounded-lg max-h-[70vh] w-auto object-contain mx-auto"
                />
              ) : proofModal.type === 'video' ? (
                <video
                  src={proofModal.url}
                  controls
                  className="rounded-lg max-h-[70vh] w-auto mx-auto"
                />
              ) : proofModal.type === 'audio' ? (
                <audio
                  src={proofModal.url}
                  controls
                  className="w-full"
                />
              ) : (
                <a
                  href={proofModal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#2D6A4F] underline"
                >
                  View proof file
                </a>
              )}
            </Modal>

            {/* Applications tab (admin only) */}
            {tab === 'applications' && isAdmin && (
              <div className="space-y-3">
                {applications.length === 0 ? (
                  <Card className="text-center py-10">
                    <p className="text-[#8FA38F] text-sm">No pending applications.</p>
                  </Card>
                ) : (
                  applications.map((app) => (
                    <Card key={app.id} className="flex items-center gap-4">
                      <Avatar
                        src={app.profiles?.avatar_url}
                        name={app.profiles?.full_name ?? app.profiles?.username}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1B1F1A]">
                          {app.profiles?.full_name ?? app.profiles?.username ?? 'Applicant'}
                        </p>
                        <p className="text-xs text-[#8FA38F]">
                          Integrity Score: {app.profiles?.integrity_score ?? '—'} •{' '}
                          {app.profiles?.sprints_completed ?? 0} sprints completed
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={processingApplication === app.id}
                          onClick={() => handleApproveApplication(app.id, app.user_id)}
                          className="px-3 py-1.5 text-xs font-semibold bg-[#D8EDDA] text-[#1B4332] rounded-lg hover:bg-[#B4D9BB] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {processingApplication === app.id ? '...' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          disabled={processingApplication === app.id}
                          onClick={() => handleRejectApplication(app.id)}
                          className="px-3 py-1.5 text-xs font-semibold bg-[#FEE2E2] text-[#B91C1C] rounded-lg hover:bg-[#FECACA] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {processingApplication === app.id ? '...' : 'Reject'}
                        </button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* Settings tab (admin only) */}
            {tab === 'settings' && isAdmin && pact && (
              <Card className="space-y-5">
                <h3 className="text-base font-bold text-[#1B1F1A]" style={{ fontFamily: 'var(--font-display)' }}>
                  Pact Settings
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-[#F5F7F0] rounded-[12px] p-4">
                    <p className="text-[11px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Visibility</p>
                    <p className="text-sm font-semibold text-[#1B1F1A] capitalize">{pact.is_public ? 'Public' : 'Private'}</p>
                  </div>
                  <div className="bg-[#F5F7F0] rounded-[12px] p-4">
                    <p className="text-[11px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Sprint Type</p>
                    <p className="text-sm font-semibold text-[#1B1F1A] capitalize">{pact.sprint_type}</p>
                  </div>
                  <div className="bg-[#F5F7F0] rounded-[12px] p-4">
                    <p className="text-[11px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Stake / Member</p>
                    <p className="text-sm font-semibold text-[#1B4332]">{formatCurrency(pact.stake_amount)}</p>
                  </div>
                  <div className="bg-[#F5F7F0] rounded-[12px] p-4">
                    <p className="text-[11px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Max Members</p>
                    <p className="text-sm font-semibold text-[#1B1F1A]">{pact.max_members}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Moderation tab (admin only) */}
            {tab === 'moderation' && isAdmin && (
              <Card className="space-y-4">
                <h3 className="text-base font-bold text-[#1B1F1A]" style={{ fontFamily: 'var(--font-display)' }}>
                  Moderation Queue
                </h3>
                <p className="text-sm text-[#5C6B5E]">
                  Approve goals, evidence, and appeals for this pact before they become visible to members.
                </p>

                {moderationLoading ? (
                  <p className="text-sm text-[#8FA38F]">Loading...</p>
                ) : pendingGoals.length === 0 ? (
                  <p className="text-sm text-[#5C6B5E]">No pending goals for this pact.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingGoals.map((goal) => (
                      <Card key={goal.id} className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-[#1B1F1A] mb-1">{goal.title}</p>
                              <p className="text-xs text-[#5C6B5E] line-clamp-2">{goal.measurable_outcome}</p>
                              <p className="text-[11px] text-[#8FA38F] mt-2">
                                By {goal.profiles?.full_name ?? goal.profiles?.username ?? 'Unknown'}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleClearGoal(goal.id)}
                              >
                                Clear
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Results tab */}
            {tab === 'results' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#1B1F1A]" style={{ fontFamily: 'var(--font-display)' }}>
                  Sprint Results
                </h3>
                {resultsLoading ? (
                  <p className="text-sm text-[#8FA38F]">Loading results...</p>
                ) : verdicts.length === 0 ? (
                  <Card className="text-center py-8">
                    <p className="text-[#8FA38F] text-sm">No results available yet.</p>
                  </Card>
                ) : (
                  <>
                    <div className="space-y-3">
                      {verdicts.map((v) => (
                        <div
                          key={v.id}
                          className={`rounded-[20px] p-4 border flex items-center gap-4 ${
                            v.outcome === 'passed'
                              ? 'bg-[#D8EDDA] border-[#74C69D]'
                              : v.outcome === 'failed'
                              ? 'bg-[#FDF0EC] border-[#F0C4B8]'
                              : 'bg-[#FEF3E2] border-[#F4A261]/40'
                          }`}
                        >
                          <Avatar src={v.profiles?.avatar_url} name={v.profiles?.full_name ?? v.profiles?.username} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-[#1B1F1A]">{v.profiles?.full_name ?? v.profiles?.username}</p>
                            <p className="text-xs text-[#5C6B5E] mt-0.5">
                              {v.approve_count}✅ · {v.reject_count}❌ · {v.sympathy_count}🤍
                            </p>
                          </div>
                          <div className="text-right">
                            {v.outcome === 'passed' && (
                              <>
                                <p className="text-xs font-bold text-[#2D6A4F]">PASSED</p>
                                {v.dividend_amount > 0 && (
                                  <p className="font-[family-name:var(--font-display)] font-bold text-[#1B4332] text-sm">
                                    +{formatCurrency(v.dividend_amount)}
                                  </p>
                                )}
                              </>
                            )}
                            {v.outcome === 'failed' && (
                              <>
                                <p className="text-xs font-bold text-[#E07A5F]">FAILED</p>
                                <p className="font-[family-name:var(--font-display)] font-bold text-[#E07A5F] text-sm">
                                  -{formatCurrency(pact?.stake_amount ?? 0)}
                                </p>
                              </>
                            )}
                            {v.outcome === 'sympathy_pass' && (
                              <p className="text-xs font-bold text-[#B5540A]">SYMPATHY</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Financial breakdown */}
                    {pact && (
                      <Card>
                        <h4 className="font-semibold text-[#1B1F1A] mb-4 text-sm">Financial Breakdown</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-[#5C6B5E]">Stake per member</span>
                            <span className="font-[family-name:var(--font-display)] font-bold text-[#1B1F1A]">{formatCurrency(pact.stake_amount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#5C6B5E]">Platform fee (5%)</span>
                            <span className="text-[#E07A5F]">−{formatCurrency(pact.stake_amount * 0.05)}</span>
                          </div>
                        </div>
                      </Card>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
      <BottomNav />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Delete Pact</h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to permanently delete this pact? This action cannot be undone and all data will be lost.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                onClick={() => setShowDeleteModal(false)}
                variant="secondary"
                disabled={deletingPact}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeletePact}
                loading={deletingPact}
                variant="danger"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
