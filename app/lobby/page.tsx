'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getGreeting, formatCurrency, formatTimeAgo, getCategoryColor } from '@/lib/utils';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import CountdownTimer from '@/components/ui/CountdownTimer';
import type { Pact, PactMember, Sprint, Profile, Notification } from '@/types';

interface ActivePactRow {
  pact: Pact;
  sprint: Sprint | null;
  members: (PactMember & { profiles: Profile })[];
  hasSubmission: boolean;
}

function getPactCTA(
  pact: Pact,
  sprint: Sprint | null,
  hasSubmission: boolean
): { label: string; href: string; style: 'green' | 'amber' | 'grey' } {
  if (pact.status === 'vetting') return { label: 'Review Goals', href: `/pacts/${pact.id}/vetting`, style: 'green' };
  if (pact.status === 'verdict') return { label: 'Cast Vote', href: `/pacts/${pact.id}/verdict`, style: 'amber' };
  if (pact.status === 'completed' || sprint?.status === 'completed') return { label: 'View Results', href: `/pacts/${pact.id}/results`, style: 'grey' };
  if (pact.status === 'active' && !hasSubmission) return { label: 'Submit Proof', href: `/pacts/${pact.id}/locker`, style: 'green' };
  return { label: 'View Pact', href: `/pacts/${pact.id}`, style: 'grey' };
}

function ctaButtonClass(style: 'green' | 'amber' | 'grey'): string {
  if (style === 'green') return 'bg-[#1B4332] text-white hover:bg-[#2D6A4F]';
  if (style === 'amber') return 'bg-[#F4A261] text-white hover:bg-[#E8924F]';
  return 'bg-[#F5F7F0] text-[#5C6B5E] border border-[#E0EBE1] hover:bg-[#EEF5EE]';
}

function notifIcon(type: Notification['type']): string {
  const icons: Partial<Record<Notification['type'], string>> = {
    goal_approval_needed: '✅', sprint_starting: '🚀', proof_due: '📎',
    verdict_open: '⚖️', verdict_result: '🏆', appeal_result: '📋',
    nudge: '👋', inactivity_warning: '⚠️', invite_received: '📬',
    application_approved: '🎉', application_rejected: '❌',
  };
  return icons[type] ?? '🔔';
}

export default function LobbyPage() {
  const router = useRouter();

  // All state defaults to empty — UI renders immediately
  const [greeting, setGreeting] = useState('Hello');
  const [firstName, setFirstName] = useState('there');
  const [integrityScore, setIntegrityScore] = useState<number | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [totalStaked, setTotalStaked] = useState(0);
  const [activePacts, setActivePacts] = useState<ActivePactRow[]>([]);
  const [discoverPacts, setDiscoverPacts] = useState<Pact[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const supabase = createClient();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    async function load() {
      try {
        // 1. Get session — if none, redirect
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.replace('/login');
          return;
        }
        const userId = session.user.id;

        // 2. Profile
        const { data: profile } = await supabase
          .from('profiles').select('*').eq('id', userId).single();
        if (profile) {
          setFirstName(profile.full_name?.split(' ')[0] ?? profile.username ?? 'there');
          setIntegrityScore(profile.integrity_score ?? null);
          setAvatarUrl(profile.avatar_url ?? null);
        }

        // 3. Pact memberships
        const { data: memberRows } = await supabase
          .from('pact_members').select('*, pacts(*)').eq('user_id', userId).eq('status', 'active');

        const pacts = (memberRows ?? [])
          .map((m) => m.pacts as Pact)
          .filter((p): p is Pact => !!p);

        if (pacts.length > 0) {
          const pactIds = pacts.map((p) => p.id);

          // Sprints
          const sprintResults = await Promise.all(
            pacts.map((p) =>
              supabase.from('sprints').select('*')
                .eq('pact_id', p.id).eq('sprint_number', p.current_sprint).maybeSingle()
            )
          );
          const sprintMap = new Map<string, Sprint | null>();
          pacts.forEach((p, i) => sprintMap.set(p.id, sprintResults[i].data ?? null));

          // Members with profiles
          const { data: allMembers } = await supabase
            .from('pact_members').select('*, profiles(*)').in('pact_id', pactIds).eq('status', 'active');
          const membersByPact = new Map<string, (PactMember & { profiles: Profile })[]>();
          (allMembers ?? []).forEach((m) => {
            const typed = m as PactMember & { profiles: Profile };
            membersByPact.set(typed.pact_id, [...(membersByPact.get(typed.pact_id) ?? []), typed]);
          });

          // Submissions
          const sprintIds = Array.from(sprintMap.values()).filter((s): s is Sprint => !!s).map((s) => s.id);
          const { data: submissions } = sprintIds.length
            ? await supabase.from('submissions').select('sprint_id').eq('user_id', userId).in('sprint_id', sprintIds)
            : { data: [] };
          const submittedSprints = new Set((submissions ?? []).map((s) => s.sprint_id));

          setActivePacts(pacts.map((pact) => {
            const sprint = sprintMap.get(pact.id) ?? null;
            return { pact, sprint, members: membersByPact.get(pact.id) ?? [], hasSubmission: sprint ? submittedSprints.has(sprint.id) : false };
          }));

          // Total staked
          const { data: stakeRows } = await supabase
            .from('stakes').select('amount').eq('user_id', userId).eq('status', 'locked');
          setTotalStaked((stakeRows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0));

          // Discover (public pacts not in my list)
          const { data: publicPacts } = await supabase
            .from('pacts').select('*').eq('is_public', true)
            .in('status', ['forming', 'active']).not('id', 'in', `(${pactIds.join(',')})`)
            .order('created_at', { ascending: false }).limit(3);
          setDiscoverPacts(publicPacts ?? []);
        } else {
          // No memberships — just fetch discover pacts
          const { data: publicPacts } = await supabase
            .from('pacts').select('*').eq('is_public', true)
            .in('status', ['forming', 'active']).order('created_at', { ascending: false }).limit(3);
          setDiscoverPacts(publicPacts ?? []);
        }

        // Notifications
        const { data: notifs } = await supabase
          .from('notifications').select('*').eq('user_id', userId)
          .eq('is_read', false).order('created_at', { ascending: false }).limit(3);
        setNotifications(notifs ?? []);

      } catch {
        // Timeout or any error — leave all state as empty defaults
      } finally {
        clearTimeout(timeout);
      }
    }

    load();
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [router]);

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  const activePactList = activePacts.map((r) => ({ id: r.pact.id, name: r.pact.name }));

  return (
    <div className="min-h-screen bg-[#F5F7F0]" style={{ fontFamily: 'var(--font-body)' }}>
      <Sidebar activePacts={activePactList} />

      <main className="md:ml-64 pb-24 md:pb-10 page-enter">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 md:py-8 space-y-10">

          {/* GREETING */}
          <header className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1
                  className="text-2xl md:text-3xl font-bold text-[#1B1F1A]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {greeting}, {firstName} 👋
                </h1>
                {integrityScore !== null && (
                  <span className="inline-flex items-center gap-1.5 bg-[#D8EDDA] text-[#1B4332] rounded-full px-3 py-1 text-xs font-semibold">
                    ⭐ Score {integrityScore}
                  </span>
                )}
              </div>
              {totalStaked > 0 && (
                <p className="text-[#5C6B5E] text-sm mt-1">
                  Total at stake:{' '}
                  <span className="font-semibold text-[#1B4332]">{formatCurrency(totalStaked)}</span>
                </p>
              )}
            </div>
            {avatarUrl && (
              <Link href="/profile/me" className="hidden md:block flex-shrink-0">
                <Avatar src={avatarUrl} name={firstName} size="md" />
              </Link>
            )}
          </header>

          {/* MY ACTIVE PACTS */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#1B1F1A]" style={{ fontFamily: 'var(--font-display)' }}>
                My Active Pacts
              </h2>
              <Link href="/pacts" className="text-[#2D6A4F] text-sm font-semibold hover:underline">View all</Link>
            </div>

            {activePacts.length === 0 ? (
              <Card className="flex flex-col items-center justify-center py-14 gap-5 text-center">
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-60">
                  <circle cx="40" cy="40" r="40" fill="#D8EDDA" />
                  <path d="M24 44l6-6 6 6 14-14" stroke="#2D6A4F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M52 36c0 6.627-5.373 12-12 12S28 42.627 28 36s5.373-12 12-12 12 5.373 12 12z" stroke="#2D6A4F" strokeWidth="2.5" />
                  <path d="M36 30l4 4 6-6" stroke="#74C69D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <p className="text-lg font-bold text-[#1B1F1A] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                    You&apos;re not in any Pacts yet.
                  </p>
                  <p className="text-[#5C6B5E] text-sm">Create one or join a group to start building real accountability.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/pacts/create" className="inline-flex items-center justify-center bg-[#1B4332] text-white rounded-[12px] px-6 py-3 font-semibold text-sm hover:bg-[#2D6A4F] transition-colors">
                    Start Your First Pact
                  </Link>
                  <Link href="/marketplace" className="inline-flex items-center justify-center bg-white border-2 border-[#2D6A4F] text-[#2D6A4F] rounded-[12px] px-6 py-3 font-semibold text-sm hover:bg-[#EEF5EE] transition-colors">
                    Browse Groups
                  </Link>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {activePacts.map(({ pact, sprint, members, hasSubmission }) => {
                  const cta = getPactCTA(pact, sprint, hasSubmission);
                  const categoryColor = getCategoryColor(pact.category);
                  const displayMembers = members.slice(0, 4);
                  const extraMembers = Math.max(0, members.length - 4);
                  return (
                    <Card key={pact.id} className="p-0 overflow-hidden">
                      <div className="h-1 rounded-t-[20px]" style={{ backgroundColor: categoryColor }} />
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            {pact.category && (
                              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold mb-1.5"
                                style={{ backgroundColor: `${categoryColor}22`, color: categoryColor }}>
                                {pact.category}
                              </span>
                            )}
                            <h3 className="text-base font-bold text-[#1B1F1A] truncate" style={{ fontFamily: 'var(--font-display)' }}>
                              {pact.name}
                            </h3>
                          </div>
                          <Badge variant={pact.status === 'active' ? 'active' : pact.status === 'completed' ? 'completed' : 'pending'}>
                            {pact.status.charAt(0).toUpperCase() + pact.status.slice(1)}
                          </Badge>
                        </div>

                        {sprint && sprint.status !== 'completed' && (
                          <div className="bg-[#F5F7F0] rounded-[10px] px-3 py-2 mb-3">
                            <p className="text-[10px] text-[#8FA38F] uppercase tracking-wide font-medium mb-1">Sprint ends in</p>
                            <CountdownTimer endDate={sprint.ends_at} size="sm" />
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">
                              {displayMembers.map((m) => (
                                <Avatar key={m.id} src={m.profiles?.avatar_url} name={m.profiles?.full_name ?? m.profiles?.username} size="xs" className="border-2 border-white" />
                              ))}
                              {extraMembers > 0 && (
                                <div className="w-6 h-6 rounded-full bg-[#EEF5EE] border-2 border-white flex items-center justify-center text-[9px] font-bold text-[#5C6B5E]">
                                  +{extraMembers}
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-[#5C6B5E]">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-[#1B4332]">{formatCurrency(pact.stake_amount)}</span>
                            <Link href={cta.href} className={`inline-flex items-center justify-center rounded-[10px] px-4 py-2 text-xs font-semibold transition-colors ${ctaButtonClass(cta.style)}`}>
                              {cta.label}
                            </Link>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* DISCOVER */}
          {discoverPacts.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#1B1F1A]" style={{ fontFamily: 'var(--font-display)' }}>Discover Pacts</h2>
                <Link href="/marketplace" className="text-[#2D6A4F] text-sm font-semibold hover:underline">Browse All</Link>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {discoverPacts.map((pact) => {
                  const color = getCategoryColor(pact.category);
                  return (
                    <Link key={pact.id} href={`/marketplace/${pact.id}`}>
                      <Card hover className="p-0 overflow-hidden h-full">
                        <div className="h-1 rounded-t-[20px]" style={{ backgroundColor: color }} />
                        <div className="p-4">
                          {pact.category && (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold mb-2"
                              style={{ backgroundColor: `${color}22`, color }}>
                              {pact.category}
                            </span>
                          )}
                          <p className="text-sm font-bold text-[#1B1F1A] leading-snug mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                            {pact.name}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#5C6B5E]">{formatCurrency(pact.stake_amount)} stake</span>
                            <Badge variant="active">{pact.status === 'forming' ? 'Open' : 'Active'}</Badge>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* NOTIFICATIONS */}
          {notifications.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#1B1F1A]" style={{ fontFamily: 'var(--font-display)' }}>Recent Notifications</h2>
                <Link href="/notifications" className="text-[#2D6A4F] text-sm font-semibold hover:underline">View all</Link>
              </div>
              <div className="space-y-3">
                {notifications.map((notif) => (
                  <Card key={notif.id} className="flex items-start gap-3 py-4 px-4">
                    <div className="text-xl flex-shrink-0">{notifIcon(notif.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1B1F1A] leading-snug">{notif.title}</p>
                      {notif.body && <p className="text-xs text-[#5C6B5E] mt-0.5 truncate">{notif.body}</p>}
                    </div>
                    <p className="text-[10px] text-[#8FA38F] flex-shrink-0 whitespace-nowrap mt-0.5">{formatTimeAgo(notif.created_at)}</p>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* FAB (mobile) */}
          <div className="md:hidden fixed bottom-20 right-4 z-30">
            <Link href="/pacts/create"
              className="w-14 h-14 bg-[#1B4332] text-white rounded-full shadow-[0_4px_16px_rgba(27,67,50,0.35)] flex items-center justify-center text-2xl font-bold hover:bg-[#2D6A4F] transition-colors"
              aria-label="Create new pact">
              +
            </Link>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
