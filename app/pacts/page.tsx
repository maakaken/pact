'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getCategoryColor } from '@/lib/utils';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { useUser } from '@/hooks/useUser';
import type { Pact, Sprint, PactMember, Profile } from '@/types';

interface PactRow {
  pact: Pact;
  sprint: Sprint | null;
  members: (PactMember & { profiles: Profile })[];
  hasSubmission: boolean;
}

function getPactStatus(pact: Pact, sprint: Sprint | null): { label: string; action: string; href: string } {
  if (pact.status === 'vetting') return { label: 'Vetting', action: 'Review', href: `/pacts/${pact.id}/vetting` };
  if (pact.status === 'verdict') return { label: 'Verdict', action: 'Vote', href: `/pacts/${pact.id}/verdict` };
  if (pact.status === 'completed' || sprint?.status === 'completed') return { label: 'Completed', action: 'View', href: `/pacts/${pact.id}/results` };
  if (pact.status === 'active') return { label: 'Active', action: 'View', href: `/pacts/${pact.id}` };
  return { label: 'Forming', action: 'View', href: `/pacts/${pact.id}` };
}

export default function PactsPage() {
  const router = useRouter();
  const { user } = useUser();
  const [pacts, setPacts] = useState<PactRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPacts = async () => {
      if (!user) {
        router.replace('/login');
        return;
      }

      const supabase = createClient();

      // Get all user's pacts
      const { data: memberRows } = await supabase
        .from('pact_members')
        .select('*, pacts(*)')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (!memberRows) {
        setLoading(false);
        return;
      }

      const userPacts = (memberRows as any[])
        .map((m) => m.pacts as Pact)
        .filter((p): p is Pact => !!p);

      if (userPacts.length === 0) {
        setLoading(false);
        return;
      }

      const pactIds = userPacts.map((p) => p.id);

      // Get sprints
      const sprintResults = await Promise.all(
        userPacts.map((p) =>
          supabase.from('sprints').select('*').eq('pact_id', p.id).eq('sprint_number', p.current_sprint).maybeSingle()
        )
      );
      const sprintMap = new Map<string, Sprint | null>();
      userPacts.forEach((p, i) => sprintMap.set(p.id, sprintResults[i].data ?? null));

      // Get members
      const { data: allMembers } = await supabase
        .from('pact_members')
        .select('*, profiles(*)')
        .in('pact_id', pactIds)
        .eq('status', 'active');

      const membersByPact = new Map<string, (PactMember & { profiles: Profile })[]>();
      (allMembers as any[] ?? []).forEach((m) => {
        membersByPact.set(m.pact_id, [...(membersByPact.get(m.pact_id) ?? []), m]);
      });

      // Get submissions
      const sprintIds = Array.from(sprintMap.values())
        .filter((s): s is Sprint => !!s)
        .map((s) => s.id);
      const { data: submissions } = sprintIds.length
        ? await supabase.from('submissions').select('sprint_id').eq('user_id', user.id).in('sprint_id', sprintIds)
        : { data: [] };
      const submittedSprints = new Set((submissions ?? []).map((s) => s.sprint_id));

      setPacts(
        userPacts.map((pact) => ({
          pact,
          sprint: sprintMap.get(pact.id) ?? null,
          members: membersByPact.get(pact.id) ?? [],
          hasSubmission: (sprintMap.get(pact.id)?.id ?? '') in submittedSprints,
        }))
      );

      setLoading(false);
    };

    loadPacts();
  }, [user, router]);

  const activePactList = pacts.map((r) => ({ id: r.pact.id, name: r.pact.name }));

  return (
    <div className="min-h-screen bg-[#F5F7F0]" style={{ fontFamily: 'var(--font-body)' }}>
      <Sidebar activePacts={activePactList} />
      <Header title="All Pacts" />

      <main className="md:ml-64 pb-24 md:pb-10 page-enter">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 md:py-8">
          {loading ? (
            <Card className="p-8 text-center text-[#5C6B5E]">Loading pacts...</Card>
          ) : pacts.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-14 gap-5 text-center">
              <p className="text-lg font-bold text-[#1B1F1A]" style={{ fontFamily: 'var(--font-display)' }}>
                No pacts yet
              </p>
              <p className="text-[#5C6B5E] text-sm">Create one or join from the marketplace to get started.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/pacts/create"
                  className="inline-flex items-center justify-center bg-[#1B4332] text-white rounded-[12px] px-6 py-3 font-semibold text-sm hover:bg-[#2D6A4F] transition-colors"
                >
                  Create Pact
                </Link>
                <Link
                  href="/marketplace"
                  className="inline-flex items-center justify-center bg-white border-2 border-[#2D6A4F] text-[#2D6A4F] rounded-[12px] px-6 py-3 font-semibold text-sm hover:bg-[#EEF5EE] transition-colors"
                >
                  Browse Marketplace
                </Link>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {pacts.map(({ pact, sprint, members }) => {
                const categoryColor = getCategoryColor(pact.category);
                const status = getPactStatus(pact, sprint);
                const displayMembers = members.slice(0, 3);
                const extraMembers = Math.max(0, members.length - 3);

                return (
                  <Card key={pact.id} className="p-5 overflow-hidden">
                    <div className="h-1 rounded-t-[20px]" style={{ backgroundColor: categoryColor }} />
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {pact.category && (
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold mb-1.5"
                            style={{ backgroundColor: `${categoryColor}22`, color: categoryColor }}
                          >
                            {pact.category}
                          </span>
                        )}
                        <h3 className="text-base font-bold text-[#1B1F1A] truncate" style={{ fontFamily: 'var(--font-display)' }}>
                          {pact.name}
                        </h3>
                        {pact.mission && (
                          <p className="text-sm text-[#5C6B5E] mt-1 line-clamp-2">{pact.mission}</p>
                        )}
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          <Badge variant={pact.status === 'active' ? 'active' : pact.status === 'completed' ? 'completed' : 'pending'}>
                            {pact.status === 'active' ? 'Active' : pact.status === 'completed' ? 'Completed' : 'Pending'}
                          </Badge>
                          <span className="text-xs text-[#8FA38F] bg-[#EEF5EE] px-2 py-1 rounded-full">
                            {members.length} member{members.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <Link
                        href={status.href}
                        className="inline-flex items-center justify-center bg-[#1B4332] text-white rounded-[10px] px-4 py-2 font-semibold text-xs hover:bg-[#2D6A4F] transition-colors flex-shrink-0"
                      >
                        {status.action}
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
