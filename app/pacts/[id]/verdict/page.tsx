'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ExternalLink, FileText, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import { usePact } from '@/hooks/usePact';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Skeleton from '@/components/ui/Skeleton';
import CountdownTimer from '@/components/ui/CountdownTimer';
import { cn } from '@/lib/utils';
import type { Submission, Vote, Goal } from '@/types';

type VoteDecision = 'approve' | 'reject' | 'sympathy';

interface SubmissionWithProfile extends Submission {
  profiles: { full_name: string | null; username: string; avatar_url: string | null };
  goals: Goal | null;
}

interface ExternalLinkObj {
  type: string;
  url: string;
}

function parseLinks(raw: string[] | null): ExternalLinkObj[] {
  if (!raw) return [];
  return raw.map((item) => {
    try { return JSON.parse(item) as ExternalLinkObj; } catch { return { type: 'Link', url: item }; }
  });
}

function VoteButton({
  decision,
  selected,
  onSelect,
  disabled,
}: {
  decision: VoteDecision;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const configs: Record<VoteDecision, { emoji: string; label: string; active: string; inactive: string }> = {
    approve: {
      emoji: '✅',
      label: 'APPROVE',
      active: 'bg-[#D8EDDA] text-[#1B4332] border-[#74C69D] scale-105',
      inactive: 'bg-white text-[#5C6B5E] border-[#E0EBE1] hover:bg-[#EEF5EE]',
    },
    reject: {
      emoji: '❌',
      label: 'REJECT',
      active: 'bg-[#FDF0EC] text-[#E07A5F] border-[#F0C4B8] scale-105',
      inactive: 'bg-white text-[#5C6B5E] border-[#E0EBE1] hover:bg-[#FDF0EC]',
    },
    sympathy: {
      emoji: '🤍',
      label: 'SYMPATHY',
      active: 'bg-[#FEF3E2] text-[#B5540A] border-[#F4C678] scale-105',
      inactive: 'bg-white text-[#5C6B5E] border-[#E0EBE1] hover:bg-[#FEF3E2]',
    },
  };

  const cfg = configs[decision];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex-1 flex flex-col items-center gap-1.5 border-2 rounded-[14px] py-3 px-2',
        'font-bold text-xs tracking-wide transition-all duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        selected ? cfg.active : cfg.inactive
      )}
    >
      <span className="text-xl">{cfg.emoji}</span>
      <span>{cfg.label}</span>
    </button>
  );
}

export default function VerdictPage() {
  const params = useParams();
  const pactId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { pact, loading: pactLoading } = usePact(pactId);

  const [submissions, setSubmissions] = useState<SubmissionWithProfile[]>([]);
  const [allVotes, setAllVotes] = useState<Vote[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, VoteDecision>>({}); // keyed by target_user_id
  const [pendingVotes, setPendingVotes] = useState<Record<string, VoteDecision>>({}); // local selection before submit
  const [editingFor, setEditingFor] = useState<Record<string, boolean>>({});
  const [submittingFor, setSubmittingFor] = useState<Record<string, boolean>>({});
  const [dataLoading, setDataLoading] = useState(true);

  const realtimeRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  // Auth guard
  useEffect(() => {
    if (!userLoading && !user) router.replace('/login');
  }, [user, userLoading, router]);

  const fetchData = useCallback(async () => {
    if (!user || !pact?.currentSprint) return;
    const supabase = createClient();
    setDataLoading(true);

    const { data: subs } = await supabase
      .from('submissions')
      .select('*, profiles(*), goals(*)')
      .eq('sprint_id', pact.currentSprint.id);

    const { data: votes } = await supabase
      .from('votes')
      .select('*')
      .eq('sprint_id', pact.currentSprint.id);

    const allVoteList = (votes as Vote[]) ?? [];
    setSubmissions((subs as SubmissionWithProfile[]) ?? []);
    setAllVotes(allVoteList);

    // Seed existing votes cast by me
    const voteMap: Record<string, VoteDecision> = {};
    allVoteList.forEach((v) => {
      if (v.voter_id === user.id) {
        voteMap[v.target_user_id] = v.decision;
      }
    });
    setMyVotes(voteMap);
    setDataLoading(false);
  }, [user, pact]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime on votes
  useEffect(() => {
    if (!pact?.currentSprint) return;
    const supabase = createClient();

    realtimeRef.current = supabase
      .channel(`votes:${pact.currentSprint.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes', filter: `sprint_id=eq.${pact.currentSprint.id}` },
        () => { fetchData(); }
      )
      .subscribe();

    return () => { realtimeRef.current?.unsubscribe(); };
  }, [pact?.currentSprint, fetchData]);

  const handleSelectVote = (targetUserId: string, decision: VoteDecision) => {
    setPendingVotes((prev) => ({ ...prev, [targetUserId]: decision }));
  };

  const handleSubmitVote = async (targetUserId: string, submissionId: string | null) => {
    if (!user || !pact?.currentSprint) return;
    const decision = pendingVotes[targetUserId];
    if (!decision) return;

    setSubmittingFor((prev) => ({ ...prev, [targetUserId]: true }));
    const supabase = createClient();

    // upsert
    await supabase.from('votes').upsert(
      {
        sprint_id: pact.currentSprint.id,
        submission_id: submissionId,
        voter_id: user.id,
        target_user_id: targetUserId,
        decision,
      },
      { onConflict: 'sprint_id,voter_id,target_user_id' }
    );

    setMyVotes((prev) => ({ ...prev, [targetUserId]: decision }));
    setEditingFor((prev) => ({ ...prev, [targetUserId]: false }));
    setSubmittingFor((prev) => ({ ...prev, [targetUserId]: false }));
  };

  // Members to vote on = all members except self
  const otherMembers = pact?.members.filter((m) => m.user_id !== user?.id) ?? [];

  const activePactList = pact ? [{ id: pact.id, name: pact.name }] : [];
  const sprint = pact?.currentSprint ?? null;

  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar activePacts={activePactList} />
      <Header title="Verdict Phase" />
      <main className="md:ml-64 pb-24 md:pb-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 md:py-10 space-y-8">

          {/* ── HEADER ── */}
          <div>
            <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-2">
              Verdict Phase{pact ? ` — ${pact.name}` : ''}
            </p>
            <h1
              className="text-2xl md:text-3xl font-bold text-[#1B1F1A] mb-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Cast Your Vote
            </h1>
            {sprint && (
              <div className="flex items-center gap-2 text-xs text-[#5C6B5E]">
                <span>Voting closes in</span>
                <CountdownTimer endDate={sprint.verdict_ends_at} size="sm" />
              </div>
            )}
          </div>

          {/* ── MEMBER CARDS ── */}
          {dataLoading ? (
            <div className="space-y-6">
              {[1, 2].map((i) => (
                <Card key={i} className="space-y-4">
                  <div className="flex gap-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-24 w-full rounded-[12px]" />
                  <div className="flex gap-2">
                    <Skeleton className="flex-1 h-16 rounded-[14px]" />
                    <Skeleton className="flex-1 h-16 rounded-[14px]" />
                    <Skeleton className="flex-1 h-16 rounded-[14px]" />
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {otherMembers.map((member) => {
                const sub = submissions.find((s) => s.user_id === member.user_id) ?? null;
                const name = member.profiles?.full_name ?? member.profiles?.username ?? 'Member';
                const avatar = member.profiles?.avatar_url ?? null;
                const goal = sub?.goals ?? null;
                const links = parseLinks(sub?.external_links ?? null);
                const castVote = myVotes[member.user_id];
                const isEditing = editingFor[member.user_id] ?? false;
                const selectedPending = pendingVotes[member.user_id];
                const isSubmitting = submittingFor[member.user_id] ?? false;
                const showVoteUI = !castVote || isEditing;

                // Count of voters per member
                const votersForMember = allVotes.filter((v) => v.target_user_id === member.user_id);
                const totalVoters = (pact?.members.length ?? 1) - 1;

                return (
                  <Card key={member.user_id} className="space-y-5">
                    {/* Member info */}
                    <div className="flex items-start gap-3">
                      <Avatar src={avatar} name={name} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#1B1F1A]">{name}</p>
                        {goal && (
                          <p className="text-xs text-[#5C6B5E] mt-0.5">{goal.title}</p>
                        )}
                      </div>
                    </div>

                    {/* Proof specification */}
                    {goal?.proof_specification && (
                      <div className="bg-[#F5F7F0] rounded-[10px] p-3">
                        <p className="text-[10px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">
                          Agreed Proof
                        </p>
                        <p className="text-xs text-[#1B1F1A]">{goal.proof_specification}</p>
                      </div>
                    )}

                    {/* Evidence gallery */}
                    {sub ? (
                      <div className="space-y-3">
                        {/* Files */}
                        {sub.file_urls && sub.file_urls.length > 0 && (
                          <div>
                            <p className="text-[10px] text-[#8FA38F] uppercase tracking-wider font-medium mb-2">
                              Evidence Files
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              {sub.file_urls.map((url, i) => {
                                const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                                return isImg ? (
                                  <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="aspect-square rounded-[10px] overflow-hidden relative block"
                                  >
                                    <Image src={url} alt={`Evidence ${i + 1}`} fill className="object-cover" />
                                  </a>
                                ) : (
                                  <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="aspect-square rounded-[10px] bg-[#F5F7F0] flex flex-col items-center justify-center gap-1 hover:bg-[#EEF5EE] transition-colors"
                                  >
                                    <FileText size={20} className="text-[#5C6B5E]" />
                                    <span className="text-[9px] text-[#8FA38F] text-center px-1 truncate w-full">
                                      {url.split('/').pop()}
                                    </span>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* External links */}
                        {links.length > 0 && (
                          <div>
                            <p className="text-[10px] text-[#8FA38F] uppercase tracking-wider font-medium mb-2">
                              External Links
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {links.map((link, i) => (
                                <a
                                  key={i}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 bg-[#D8EDDA] text-[#1B4332] rounded-full px-3 py-1.5 text-xs font-medium hover:bg-[#B7DEC0] transition-colors"
                                >
                                  <ExternalLink size={11} />
                                  {link.type}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Caption */}
                        {sub.caption && (
                          <div className="bg-[#F5F7F0] rounded-[10px] p-3">
                            <p className="text-[10px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Caption</p>
                            <p className="text-xs text-[#1B1F1A]">{sub.caption}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-[#FEF3E2] border border-[#F4C678] rounded-[12px] p-3 text-center">
                        <p className="text-xs text-[#B5540A] font-medium">No proof submitted</p>
                      </div>
                    )}

                    {/* Vote progress */}
                    <p className="text-[11px] text-[#8FA38F]">
                      {votersForMember.length} of {totalVoters} member{totalVoters !== 1 ? 's' : ''} have voted
                    </p>

                    {/* Already voted — show result & edit option */}
                    {castVote && !isEditing ? (
                      <div className="space-y-2">
                        <div className={cn(
                          'flex items-center gap-2 rounded-[12px] px-4 py-3',
                          castVote === 'approve' && 'bg-[#D8EDDA] text-[#1B4332]',
                          castVote === 'reject' && 'bg-[#FDF0EC] text-[#E07A5F]',
                          castVote === 'sympathy' && 'bg-[#FEF3E2] text-[#B5540A]',
                        )}>
                          <CheckCircle2 size={16} />
                          <span className="text-sm font-semibold capitalize">
                            Voted: {castVote === 'approve' ? 'Approve' : castVote === 'reject' ? 'Reject' : 'Sympathy'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingVotes((prev) => ({ ...prev, [member.user_id]: castVote }));
                            setEditingFor((prev) => ({ ...prev, [member.user_id]: true }));
                          }}
                          className="text-xs text-[#2D6A4F] underline underline-offset-2 hover:text-[#1B4332]"
                        >
                          Edit Vote
                        </button>
                      </div>
                    ) : showVoteUI && (
                      <div className="space-y-3">
                        {/* Vote buttons */}
                        <div className="flex gap-2">
                          {(['approve', 'reject', 'sympathy'] as VoteDecision[]).map((d) => (
                            <VoteButton
                              key={d}
                              decision={d}
                              selected={selectedPending === d}
                              onSelect={() => handleSelectVote(member.user_id, d)}
                              disabled={isSubmitting}
                            />
                          ))}
                        </div>

                        {/* Sympathy tooltip */}
                        {selectedPending === 'sympathy' && (
                          <p className="text-[11px] text-[#B5540A] bg-[#FEF3E2] border border-[#F4C678] rounded-[10px] px-3 py-2">
                            Their stake is returned only if every member votes Sympathy.
                          </p>
                        )}

                        <Button
                          onClick={() => handleSubmitVote(member.user_id, sub?.id ?? null)}
                          loading={isSubmitting}
                          disabled={!selectedPending}
                          size="sm"
                          className="w-full"
                        >
                          {isEditing ? 'Update Vote' : 'Submit Vote'}
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}

              {otherMembers.length === 0 && (
                <Card className="text-center py-8">
                  <p className="text-[#8FA38F] text-sm">No other members to vote on.</p>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
