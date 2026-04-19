'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import CountdownTimer from '@/components/ui/CountdownTimer';
import Skeleton from '@/components/ui/Skeleton';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Stake, Pact, Sprint, Profile } from '@/types';

interface StakeWithDetails extends Stake {
  pacts: Pact;
  sprints: Sprint;
}

export default function StakesPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useUser();
  const [stakes, setStakes] = useState<StakeWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    try {
      const { data } = await supabase
        .from('stakes').select('*, pacts(*), sprints(*)').eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setStakes((data as StakeWithDetails[]) ?? []);
    } catch {
      // Leave empty state
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => { load(); }, [load]);

  const activeStakes = stakes.filter((s) => s.status === 'locked');
  const pastStakes = stakes.filter((s) => s.status !== 'locked');
  const atRisk = activeStakes.reduce((sum, s) => sum + s.amount, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'locked': return <Badge variant="pending">At Risk</Badge>;
      case 'returned': return <Badge variant="active">Returned</Badge>;
      case 'forfeited': return <Badge variant="failed">Forfeited</Badge>;
      case 'distributed': return <Badge variant="completed">Won</Badge>;
      default: return <Badge variant="pending">{status}</Badge>;
    }
  };

  const getPactCTA = (stake: StakeWithDetails) => {
    const pact = stake.pacts;
    if (!pact) return null;
    switch (pact.status) {
      case 'vetting': return { label: 'Review Goals', href: `/pacts/${pact.id}/vetting` };
      case 'active': return { label: 'Submit Proof', href: `/pacts/${pact.id}/locker` };
      case 'verdict': return { label: 'Cast Vote', href: `/pacts/${pact.id}/verdict` };
      default: return { label: 'View Pact', href: `/pacts/${pact.id}` };
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar />
      <Header title="My Stakes" />
      <main className="md:ml-64 pb-20 md:pb-8 page-enter">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

          <div>
            <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-1">PORTFOLIO</p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1B1F1A]">My Stakes</h1>
          </div>

          {/* Summary header */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'At Risk', value: formatCurrency(atRisk), color: '#F4A261', bg: '#FEF3E2' },
              { label: 'Total Earned', value: formatCurrency(profile?.total_earned ?? 0), color: '#2D6A4F', bg: '#D8EDDA' },
              { label: 'Total Lost', value: formatCurrency(profile?.total_lost ?? 0), color: '#E07A5F', bg: '#FDF0EC' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className="rounded-[20px] p-4 text-center" style={{ backgroundColor: bg }}>
                <p className="font-[family-name:var(--font-display)] font-bold text-xl" style={{ color }}>{value}</p>
                <p className="text-[10px] text-[#5C6B5E] uppercase tracking-wide mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Active positions */}
          <div>
            <h2 className="font-semibold text-[#1B1F1A] mb-3">Active Positions</h2>
            {activeStakes.length === 0 ? (
              <Card className="text-center py-8">
                <p className="text-sm text-[#8FA38F]">No active stakes. Join a pact to get started!</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {activeStakes.map((s) => {
                  const cta = getPactCTA(s);
                  return (
                    <Card key={s.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[#1B1F1A] truncate">{s.pacts?.name}</p>
                          <p className="text-xs text-[#8FA38F] mt-0.5">Sprint {s.sprints?.sprint_number}</p>
                          {s.sprints?.ends_at && (
                            <div className="mt-2">
                              <CountdownTimer endDate={s.sprints.ends_at} size="sm" />
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-[family-name:var(--font-display)] font-bold text-[#F4A261] text-lg">{formatCurrency(s.amount)}</p>
                          {getStatusBadge(s.status)}
                          {cta && (
                            <button
                              onClick={() => router.push(cta.href)}
                              className="block mt-2 text-xs font-semibold text-[#2D6A4F] hover:underline"
                            >
                              {cta.label} →
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past positions */}
          {pastStakes.length > 0 && (
            <div>
              <button
                onClick={() => setHistoryOpen(!historyOpen)}
                className="flex items-center gap-2 font-semibold text-[#1B1F1A] mb-3 hover:text-[#2D6A4F] transition-colors"
              >
                Past Positions ({pastStakes.length})
                <span className={`transition-transform ${historyOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>
              {historyOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E0EBE1]">
                        {['Pact', 'Sprint', 'Amount', 'Outcome', 'Date'].map((h) => (
                          <th key={h} className="text-left text-xs font-semibold text-[#8FA38F] py-2 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pastStakes.map((s) => (
                        <tr key={s.id} className="border-b border-[#E0EBE1] hover:bg-[#F5F7F0] transition-colors">
                          <td className="py-3 pr-4">
                            <button onClick={() => router.push(`/pacts/${s.pact_id}`)} className="text-[#2D6A4F] hover:underline font-medium truncate max-w-[120px] block">
                              {s.pacts?.name}
                            </button>
                          </td>
                          <td className="py-3 pr-4 text-[#5C6B5E]">{s.sprints?.sprint_number}</td>
                          <td className="py-3 pr-4 font-[family-name:var(--font-display)] font-bold text-[#1B1F1A]">{formatCurrency(s.amount)}</td>
                          <td className="py-3 pr-4">{getStatusBadge(s.status)}</td>
                          <td className="py-3 text-[#8FA38F] text-xs">{formatDate(s.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
