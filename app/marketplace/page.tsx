'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Users, TrendingUp, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import { formatCurrency, getCategoryColor } from '@/lib/utils';
import type { Pact, PactMember, Profile } from '@/types';

interface PactWithMembers extends Pact {
  pact_members: (PactMember & { profiles: Profile })[];
}

const CATEGORIES = ['All', 'Coding', 'Fitness', 'Learning', 'Finance', 'Wellness', 'Creative', 'Other'];
const SPRINT_TYPES = ['All', 'weekly', 'monthly', 'custom'];

export default function MarketplacePage() {
  const router = useRouter();
  const { user } = useUser();

  const [pacts, setPacts] = useState<PactWithMembers[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sprintType, setSprintType] = useState('All');
  const [applying, setApplying] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [memberPactIds, setMemberPactIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const supabase = createClient();
    try {
      const { data } = await supabase
        .from('pacts')
        .select('*, pact_members(*, profiles(*))')
        .eq('is_public', true)
        .in('status', ['forming', 'vetting', 'active'])
        .order('created_at', { ascending: false });
      setPacts((data as PactWithMembers[]) ?? []);
    } catch {
      // Network error — leave empty state
    }
  }, []);

  const loadUserState = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data: memberships } = await supabase
      .from('pact_members')
      .select('pact_id')
      .eq('user_id', user.id)
      .eq('status', 'active');
    const { data: applications } = await supabase
      .from('pact_applications')
      .select('pact_id')
      .eq('user_id', user.id);
    setMemberPactIds(new Set(memberships?.map((m) => m.pact_id) ?? []));
    setAppliedIds(new Set(applications?.map((a) => a.pact_id) ?? []));
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadUserState(); }, [loadUserState]);

  const handleApply = async (pact: PactWithMembers) => {
    if (!user) { router.push('/login?next=/marketplace'); return; }
    setApplying(pact.id);
    const supabase = createClient();
    await supabase.from('pact_applications').insert({
      pact_id: pact.id,
      user_id: user.id,
      status: 'pending',
    });
    setAppliedIds((prev) => new Set([...prev, pact.id]));
    toast.success(`Application sent to "${pact.name}"!`);
    setApplying(null);
  };

  const filtered = pacts.filter((p) => {
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.mission ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === 'All' || p.category === category;
    const matchSprint = sprintType === 'All' || p.sprint_type === sprintType;
    return matchSearch && matchCategory && matchSprint;
  });

  const getSprintLabel = (type: string | null, days: number) => {
    if (type === 'weekly') return '7-day sprint';
    if (type === 'monthly') return '30-day sprint';
    return `${days}-day sprint`;
  };

  const getAvgIntegrity = (members: (PactMember & { profiles: Profile })[]) => {
    if (!members.length) return 100;
    return Math.round(members.reduce((s, m) => s + (m.profiles?.integrity_score ?? 100), 0) / members.length);
  };

  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar />
      <Header title="Marketplace" />
      <main className="md:ml-64 pb-20 md:pb-8 page-enter">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

          {/* Header */}
          <div>
            <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-1">DISCOVER</p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1B1F1A]">Pact Marketplace</h1>
            <p className="text-sm text-[#5C6B5E] mt-1">Find a group that matches your goals and apply to join.</p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8FA38F]" />
            <input
              type="text"
              placeholder="Search by name, mission, or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-[#E0EBE1] rounded-[12px] pl-11 pr-4 py-3 text-sm text-[#1B1F1A] placeholder:text-[#8FA38F] focus:outline-none focus:border-[#2D6A4F] focus:ring-3 focus:ring-[rgba(45,106,79,0.12)] transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8FA38F] hover:text-[#1B1F1A]">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#5C6B5E] flex items-center gap-1"><Filter size={12} />Category:</span>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    category === c
                      ? 'bg-[#1B4332] text-white'
                      : 'bg-white border border-[#E0EBE1] text-[#5C6B5E] hover:border-[#2D6A4F]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#5C6B5E]">Sprint:</span>
              {SPRINT_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setSprintType(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    sprintType === t
                      ? 'bg-[#1B4332] text-white'
                      : 'bg-white border border-[#E0EBE1] text-[#5C6B5E] hover:border-[#2D6A4F]'
                  }`}
                >
                  {t === 'All' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
              {(search || category !== 'All' || sprintType !== 'All') && (
                <button
                  onClick={() => { setSearch(''); setCategory('All'); setSprintType('All'); }}
                  className="px-3 py-1 rounded-full text-xs font-medium text-[#E07A5F] bg-[#FDF0EC] hover:bg-[#F9E1D9] transition-all"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Results count */}
          <p className="text-sm text-[#5C6B5E]">
            {filtered.length} pact{filtered.length !== 1 ? 's' : ''} found
          </p>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-[#D8EDDA] flex items-center justify-center mx-auto mb-4">
                <Search size={24} className="text-[#2D6A4F]" />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#1B1F1A] mb-2">No pacts found</h3>
              <p className="text-sm text-[#5C6B5E] mb-4">Try adjusting your filters or search terms.</p>
              <Link href="/pacts/create">
                <Button>Start Your Own Pact</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((p) => {
                const spots = p.max_members - (p.pact_members?.length ?? 0);
                const isMember = memberPactIds.has(p.id);
                const hasApplied = appliedIds.has(p.id);
                const avgIntegrity = getAvgIntegrity(p.pact_members ?? []);
                const color = getCategoryColor(p.category);

                return (
                  <Card key={p.id} hover className="group relative overflow-hidden">
                    {/* Category color accent */}
                    <div className="absolute top-0 left-0 w-1 h-full rounded-l-[20px]" style={{ backgroundColor: color }} />
                    <div className="pl-3 space-y-3">
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.category && (
                            <Badge variant="custom" bg={color + '20'} color={color}>{p.category}</Badge>
                          )}
                          <Badge variant="active" className="text-[10px]">
                            {getSprintLabel(p.sprint_type, p.sprint_duration_days)}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-[#8FA38F] whitespace-nowrap">
                          {spots > 0 ? `${spots} spot${spots !== 1 ? 's' : ''} left` : 'Full'}
                        </span>
                      </div>

                      {/* Name */}
                      <h3 className="font-[family-name:var(--font-display)] font-bold text-[#1B1F1A] text-lg leading-tight line-clamp-1">
                        {p.name}
                      </h3>

                      {/* Mission */}
                      {p.mission && (
                        <p className="text-sm text-[#5C6B5E] line-clamp-2">{p.mission}</p>
                      )}

                      {/* Members + integrity */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-1.5">
                            {(p.pact_members ?? []).slice(0, 4).map((m) => (
                              <Avatar key={m.id} src={m.profiles?.avatar_url} name={m.profiles?.full_name} size="xs" />
                            ))}
                          </div>
                          <span className="text-xs text-[#8FA38F]">{p.pact_members?.length ?? 0} member{(p.pact_members?.length ?? 0) !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <TrendingUp size={12} className="text-[#52B788]" />
                          <span className="text-xs text-[#5C6B5E]">Avg integrity: <span className="font-semibold text-[#1B4332]">{avgIntegrity}</span></span>
                        </div>
                      </div>

                      {/* Stake + CTA */}
                      <div className="flex items-center justify-between pt-1 border-t border-[#E0EBE1]">
                        <div>
                          <p className="text-[10px] text-[#8FA38F]">Stake</p>
                          <p className="font-[family-name:var(--font-display)] font-bold text-[#1B4332] text-lg">{formatCurrency(p.stake_amount)}</p>
                        </div>
                        {isMember ? (
                          <Link href={`/pacts/${p.id}`}>
                            <Button size="sm" variant="secondary">View Pact</Button>
                          </Link>
                        ) : hasApplied ? (
                          <span className="px-4 py-2 rounded-[10px] bg-[#D8EDDA] text-[#1B4332] text-xs font-semibold">
                            Applied ✓
                          </span>
                        ) : spots > 0 ? (
                          <Button size="sm" onClick={() => handleApply(p)} loading={applying === p.id}>
                            Apply to Join
                          </Button>
                        ) : (
                          <span className="text-xs text-[#8FA38F]">Full</span>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* CTA to create */}
          <div className="bg-[#D8EDDA] rounded-[20px] p-6 text-center">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#1B4332] mb-2">Don&apos;t see the right group?</h3>
            <p className="text-sm text-[#2D6A4F] mb-4">Start your own pact and invite people you trust.</p>
            <Link href="/pacts/create">
              <Button>Start a Pact</Button>
            </Link>
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
