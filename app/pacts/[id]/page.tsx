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
import CountdownTimer from '@/components/ui/CountdownTimer';
import ProgressBar from '@/components/ui/ProgressBar';
import Skeleton from '@/components/ui/Skeleton';
import { formatTimeAgo, formatCurrency, getCategoryColor, cn } from '@/lib/utils';
import type { Notification, Goal, PactMember, Profile } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────────
type TabKey = 'members' | 'activity' | 'settings';

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
    return { label: hasGoal ? 'Review Goals' : 'Set Your Goal', href: `/pacts/${pactId}/vetting` };
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
  };
  return icons[type] ?? '🔔';
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PactOverviewPage() {
  const params = useParams();
  const pactId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { pact, loading: pactLoading, error: pactError } = usePact(pactId);

  const [tab, setTab] = useState<TabKey>('members');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [myGoal, setMyGoal] = useState<Goal | null>(null);
  const [hasSubmission, setHasSubmission] = useState(false);
  const [memberSubmissions, setMemberSubmissions] = useState<Record<string, boolean>>({});
  const [nudgedUsers, setNudgedUsers] = useState<Set<string>>(new Set());
  const [nudgingUser, setNudgingUser] = useState<string | null>(null);
  const [extraLoading, setExtraLoading] = useState(true);

  // Auth guard
  useEffect(() => {
    if (!userLoading && !user) router.replace('/login');
  }, [user, userLoading, router]);


  // Fetch extra data (notifications, goal, submissions)
  const fetchExtra = useCallback(async () => {
    if (!user || !pact) return;
    const supabase = createClient();
    setExtraLoading(true);

    // Load nudge state from localStorage
    const nudgeKey = `nudged_${pactId}_${user.id}`;
    const stored = localStorage.getItem(nudgeKey);
    if (stored) {
      try { setNudgedUsers(new Set(JSON.parse(stored))); } catch { /* ignore */ }
    }

    // Recent notifications for this pact
    const { data: notifData } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('pact_id', pactId)
      .order('created_at', { ascending: false })
      .limit(20);
    setNotifications((notifData as Notification[]) ?? []);

    // My goal for current sprint
    const { data: goalData } = await supabase
      .from('goals')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('sprint_number', pact.current_sprint)
      .maybeSingle();
    setMyGoal(goalData ?? null);

    // My submission status
    if (pact.currentSprint) {
      const { data: subData } = await supabase
        .from('submissions')
        .select('id')
        .eq('sprint_id', pact.currentSprint.id)
        .eq('user_id', user.id)
        .maybeSingle();
      setHasSubmission(!!subData);

      // All member submissions for this sprint
      const { data: allSubs } = await supabase
        .from('submissions')
        .select('user_id')
        .eq('sprint_id', pact.currentSprint.id);
      const submittedSet: Record<string, boolean> = {};
      (allSubs ?? []).forEach((s: { user_id: string }) => { submittedSet[s.user_id] = true; });
      setMemberSubmissions(submittedSet);
    }

    setExtraLoading(false);
  }, [user, pact, pactId]);

  useEffect(() => {
    fetchExtra();
  }, [fetchExtra]);

  // Nudge handler
  const handleNudge = async (targetUserId: string) => {
    if (!user || !pact || nudgingUser === targetUserId || nudgedUsers.has(targetUserId)) return;
    setNudgingUser(targetUserId);
    try {
      await fetch('/api/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_user_id: targetUserId,
          pact_id: pactId,
          sprint_id: pact.currentSprint?.id,
        }),
      });
      const updated = new Set([...nudgedUsers, targetUserId]);
      setNudgedUsers(updated);
      const nudgeKey = `nudged_${pactId}_${user.id}`;
      localStorage.setItem(nudgeKey, JSON.stringify(Array.from(updated)));
    } catch (err) {
      console.error('Nudge failed:', err);
    } finally {
      setNudgingUser(null);
    }
  };

  // Show "not found" only after loading finishes and pact is still null
  if (!pactLoading && (pactError || !pact)) {
    return (
      <div className="min-h-screen bg-[#F5F7F0] flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-[#1B1F1A] mb-2">Pact not found</p>
          <Link href="/lobby" className="text-[#2D6A4F] text-sm underline">Back to Lobby</Link>
        </div>
      </div>
    );
  }

  const isAdmin = pact ? pact.members.some((m) => m.user_id === user?.id && m.role === 'admin') : false;
  const categoryColor = getCategoryColor(pact?.category ?? null);
  const sprint = pact?.currentSprint ?? null;
  const sprintPct = sprint ? getSprintProgress(sprint.starts_at, sprint.ends_at) : 0;
  const ctaAction = pact ? ctaForPact(pact.status, pactId, sprint?.id, !!myGoal, hasSubmission) : null;
  const activePactList = pact ? [{ id: pact.id, name: pact.name }] : [];

  // Tabs available
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'members', label: 'Members' },
    { key: 'activity', label: 'Activity' },
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
              const isMe = member.user_id === user?.id;
              const canNudge = !isMe && pact?.status === 'active' && !submitted;
              const alreadyNudged = nudgedUsers.has(member.user_id);

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

                  {/* Sprint status badge */}
                  {sprint && sprint.status !== 'completed' && (
                    <span className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      submitted ? 'bg-[#D8EDDA] text-[#1B4332]' : 'bg-[#FEF3E2] text-[#B5540A]'
                    )}>
                      {submitted ? '✓ Submitted' : 'Pending'}
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
                  const isMe = member.user_id === user?.id;
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
                      {notifications.map((notif) => (
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
                          </Card>
                        </div>
                      ))}
                    </div>
                  </div>
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
                <p className="text-xs text-[#8FA38F]">Settings editing coming soon.</p>
              </Card>
            )}
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
