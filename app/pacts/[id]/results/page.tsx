'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';
import { CheckCircle2, XCircle, Heart, Trophy, TrendingDown, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Skeleton from '@/components/ui/Skeleton';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import { formatCurrency, formatTimeAgo } from '@/lib/utils';
import type { Verdict, Profile, Pact, Sprint, PactMember } from '@/types';

interface VerdictRow extends Verdict {
  profiles: Profile;
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useUser();

  const [pact, setPact] = useState<Pact | null>(null);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [verdicts, setVerdicts] = useState<VerdictRow[]>([]);
  const [myMembership, setMyMembership] = useState<PactMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingNext, setStartingNext] = useState(false);

  const load = useCallback(async () => {
    if (!user || !id) return;
    const supabase = createClient();
    try {
      const { data: pactData } = await supabase.from('pacts').select('*').eq('id', id).single();
      if (!pactData) return;
      setPact(pactData);

      const { data: sprintData } = await supabase
        .from('sprints').select('*').eq('pact_id', id).eq('sprint_number', pactData.current_sprint).single();
      setSprint(sprintData ?? null);

      if (sprintData) {
        const { data: verdictData } = await supabase.from('verdicts').select('*, profiles(*)').eq('sprint_id', sprintData.id);
        setVerdicts((verdictData as VerdictRow[]) ?? []);
      }

      const { data: membership } = await supabase
        .from('pact_members').select('*').eq('pact_id', id).eq('user_id', user.id).single();
      setMyMembership(membership ?? null);
    } catch {
      // Timeout or error — leave empty state
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => { load(); }, [load]);

  // Confetti for passing members
  useEffect(() => {
    if (!verdicts.length || !user) return;
    const myVerdict = verdicts.find((v) => v.user_id === user.id);
    if (myVerdict?.outcome === 'passed') {
      const timer = setTimeout(() => {
        confetti({
          particleCount: 200,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#74C69D', '#2D6A4F', '#1B4332', '#D8EDDA', '#52B788'],
        });
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [verdicts, user]);

  const myVerdict = verdicts.find((v) => v.user_id === user?.id);
  const failedVerdicts = verdicts.filter((v) => v.outcome === 'failed');
  const passedVerdicts = verdicts.filter((v) => v.outcome === 'passed');
  const sympathyVerdicts = verdicts.filter((v) => v.outcome === 'sympathy_pass');

  const failurePool = failedVerdicts.reduce((sum, v) => {
    // approximate from pact stake amount
    return sum + (pact?.stake_amount ?? 0);
  }, 0);
  const platformFee = failurePool * 0.05;
  const distributable = failurePool - platformFee;
  const dividend = passedVerdicts.length > 0 ? distributable / passedVerdicts.length : 0;

  const canAppeal =
    myVerdict?.outcome === 'failed' &&
    myVerdict.finalized_at &&
    Date.now() - new Date(myVerdict.finalized_at).getTime() < 24 * 3600 * 1000;

  const startNextSprint = async () => {
    if (!sprint || !pact) return;
    setStartingNext(true);
    const supabase = createClient();
    const newSprintNumber = pact.current_sprint + 1;
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + pact.sprint_duration_days * 86400000);
    const verdictEndsAt = new Date(endsAt.getTime() + 48 * 3600000);

    await supabase.from('sprints').insert({
      pact_id: id,
      sprint_number: newSprintNumber,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      verdict_ends_at: verdictEndsAt.toISOString(),
    });
    await supabase.from('pacts').update({ current_sprint: newSprintNumber }).eq('id', id);
    router.push(`/pacts/${id}/vetting`);
  };

  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar />
      <Header title="Results" />
      <main className="md:ml-64 pb-20 md:pb-8 page-enter">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

          {/* Header */}
          <div>
            <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-1">
              SPRINT {sprint?.sprint_number} RESULTS
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1B1F1A]">
              {pact?.name}
            </h1>
          </div>

          {/* My Result — highlighted */}
          {myVerdict && (
            <div
              className={`rounded-[20px] p-5 border ${
                myVerdict.outcome === 'passed'
                  ? 'bg-[#D8EDDA] border-[#74C69D]'
                  : myVerdict.outcome === 'failed'
                  ? 'bg-[#FDF0EC] border-[#F0C4B8]'
                  : 'bg-[#FEF3E2] border-[#F4A261]/40'
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#5C6B5E] mb-2">YOUR RESULT</p>
              <div className="flex items-center gap-3">
                {myVerdict.outcome === 'passed' && <CheckCircle2 size={32} className="text-[#2D6A4F]" />}
                {myVerdict.outcome === 'failed' && <XCircle size={32} className="text-[#E07A5F]" />}
                {myVerdict.outcome === 'sympathy_pass' && <Heart size={32} className="text-[#F4A261]" />}
                <div>
                  <p className="font-[family-name:var(--font-display)] text-xl font-bold text-[#1B1F1A]">
                    {myVerdict.outcome === 'passed' && 'Goal Achieved!'}
                    {myVerdict.outcome === 'failed' && 'Goal Not Met'}
                    {myVerdict.outcome === 'sympathy_pass' && 'Sympathy Pass'}
                  </p>
                  {myVerdict.outcome === 'passed' && dividend > 0 && (
                    <p className="text-sm text-[#2D6A4F]">
                      You earned <span className="font-[family-name:var(--font-display)] font-bold">{formatCurrency((pact?.stake_amount ?? 0) + dividend)}</span>
                    </p>
                  )}
                  {myVerdict.outcome === 'failed' && (
                    <p className="text-sm text-[#E07A5F]">
                      Stake forfeited: <span className="font-[family-name:var(--font-display)] font-bold">{formatCurrency(pact?.stake_amount ?? 0)}</span>
                    </p>
                  )}
                  {myVerdict.outcome === 'sympathy_pass' && (
                    <p className="text-sm text-[#B5540A]">Stake returned. No penalty, no dividend.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* All outcome cards */}
          <div className="space-y-3">
            <h2 className="font-semibold text-[#1B1F1A]">All Results</h2>
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
          {failurePool > 0 && (
            <Card>
              <h2 className="font-semibold text-[#1B1F1A] mb-4">Financial Breakdown</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#5C6B5E]">Total failure pool</span>
                  <span className="font-[family-name:var(--font-display)] font-bold text-[#1B1F1A]">{formatCurrency(failurePool)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5C6B5E]">Platform fee (5%)</span>
                  <span className="text-[#E07A5F]">−{formatCurrency(platformFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5C6B5E]">Distributed to {passedVerdicts.length} winner{passedVerdicts.length !== 1 ? 's' : ''}</span>
                  <span className="font-[family-name:var(--font-display)] font-bold text-[#2D6A4F]">{formatCurrency(distributable)}</span>
                </div>
                {passedVerdicts.length > 0 && (
                  <div className="border-t border-[#E0EBE1] pt-2 flex justify-between">
                    <span className="font-semibold text-[#1B1F1A]">Dividend per winner</span>
                    <span className="font-[family-name:var(--font-display)] font-bold text-[#1B4332] text-base">{formatCurrency(dividend)}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3">
            {myMembership?.role === 'admin' && (
              <Button onClick={startNextSprint} loading={startingNext} className="w-full">
                Start Next Sprint <ArrowRight size={16} className="ml-2" />
              </Button>
            )}
            {canAppeal && (
              <button
                onClick={() => router.push(`/pacts/${id}/appeal`)}
                className="text-sm text-[#E07A5F] underline text-center hover:opacity-80 transition-opacity"
              >
                Appeal this result (available for 24 hours)
              </button>
            )}
            <Button variant="secondary" onClick={() => router.push(`/pacts/${id}`)} className="w-full">
              Back to Pact Overview
            </Button>
          </div>

        </div>
      </main>
      <BottomNav />
    </div>
  );
}
