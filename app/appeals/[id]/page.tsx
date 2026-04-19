'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import { formatTimeAgo } from '@/lib/utils';
import type { Appeal, Verdict } from '@/types';

export default function AppealStatusPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useUser();

  const [appeal, setAppeal] = useState<Appeal | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !id) return;
    const supabase = createClient();
    try {
      const { data: appealData } = await supabase.from('appeals').select('*').eq('id', id).eq('user_id', user.id).single();
      if (!appealData) return;
      setAppeal(appealData);
      const { data: verdictData } = await supabase.from('verdicts').select('*').eq('id', appealData.verdict_id).single();
      setVerdict(verdictData ?? null);
    } catch {
      // Leave empty state
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription for appeal status changes
  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel('appeal-' + id) as any;
    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appeals', filter: `id=eq.${id}` },
        (payload: { new: Appeal }) => { setAppeal(payload.new); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  if (!loading && !appeal) {
    return (
      <div className="min-h-screen bg-[#F5F7F0] flex items-center justify-center p-4">
        <Card className="max-w-sm w-full text-center">
          <AlertCircle size={32} className="text-[#E07A5F] mx-auto mb-3" />
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold mb-2">Appeal Not Found</h2>
          <button onClick={() => router.back()} className="text-sm text-[#2D6A4F] underline">Go back</button>
        </Card>
      </div>
    );
  }

  if (!appeal) {
    // Still loading — render shell with empty content
    return (
      <div className="min-h-screen bg-[#F5F7F0]">
        <Sidebar />
        <Header title="Appeal Status" />
        <main className="md:ml-64 pb-20 md:pb-8 page-enter">
          <div className="max-w-xl mx-auto px-4 py-6">
            <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-1">APPEAL TRACKING</p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1B1F1A]">Appeal Status</h1>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  const statusConfig = {
    pending: { label: 'Pending Review', icon: Clock, color: '#B5540A', bg: '#FEF3E2', badgeVariant: 'pending' as const },
    upheld: { label: 'Verdict Upheld', icon: XCircle, color: '#E07A5F', bg: '#FDF0EC', badgeVariant: 'failed' as const },
    overturned: { label: 'Verdict Overturned', icon: CheckCircle2, color: '#2D6A4F', bg: '#D8EDDA', badgeVariant: 'active' as const },
  };

  const config = statusConfig[appeal.status];
  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar />
      <Header title="Appeal Status" />
      <main className="md:ml-64 pb-20 md:pb-8 page-enter">
        <div className="max-w-xl mx-auto px-4 py-6 space-y-6">

          <div>
            <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-1">APPEAL TRACKING</p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1B1F1A]">Appeal Status</h1>
          </div>

          {/* Status card */}
          <div className="rounded-[20px] p-5 border" style={{ backgroundColor: config.bg, borderColor: config.color + '40' }}>
            <div className="flex items-center gap-3">
              <Icon size={28} style={{ color: config.color }} />
              <div>
                <p className="font-semibold" style={{ color: config.color }}>{config.label}</p>
                <p className="text-xs text-[#5C6B5E]">Submitted {formatTimeAgo(appeal.created_at)}</p>
              </div>
              <Badge variant={config.badgeVariant} className="ml-auto">{appeal.status}</Badge>
            </div>
          </div>

          {/* Timeline */}
          <Card>
            <h2 className="font-semibold text-[#1B1F1A] mb-4">Timeline</h2>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-[#2D6A4F] mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#1B1F1A]">Appeal Submitted</p>
                  <p className="text-xs text-[#8FA38F]">{formatTimeAgo(appeal.created_at)}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${appeal.status !== 'pending' ? 'bg-[#2D6A4F]' : 'bg-[#E0EBE1]'}`} />
                <div>
                  <p className={`text-sm font-medium ${appeal.status !== 'pending' ? 'text-[#1B1F1A]' : 'text-[#8FA38F]'}`}>Under Review</p>
                  <p className="text-xs text-[#8FA38F]">Reviewed by human moderators</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${['upheld', 'overturned'].includes(appeal.status) ? 'bg-[#2D6A4F]' : 'bg-[#E0EBE1]'}`} />
                <div>
                  <p className={`text-sm font-medium ${['upheld', 'overturned'].includes(appeal.status) ? 'text-[#1B1F1A]' : 'text-[#8FA38F]'}`}>
                    Decision Made
                  </p>
                  {['upheld', 'overturned'].includes(appeal.status) && appeal.moderator_note && (
                    <div className="mt-1 p-3 bg-[#F5F7F0] rounded-[10px]">
                      <p className="text-xs text-[#5C6B5E] font-medium mb-1">Moderator Note:</p>
                      <p className="text-sm text-[#1B1F1A]">{appeal.moderator_note}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Your submitted reason */}
          <Card>
            <h2 className="font-semibold text-[#1B1F1A] mb-3">Your Appeal</h2>
            <p className="text-sm text-[#5C6B5E] leading-relaxed">{appeal.reason}</p>
            {appeal.evidence_urls && appeal.evidence_urls.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-[#5C6B5E] mb-2">Additional Evidence ({appeal.evidence_urls.length} file{appeal.evidence_urls.length !== 1 ? 's' : ''})</p>
                <div className="flex flex-wrap gap-2">
                  {appeal.evidence_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[#2D6A4F] hover:underline bg-[#D8EDDA] px-2 py-1 rounded-full">
                      File {i + 1} ↗
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Original verdict */}
          {verdict && (
            <Card>
              <h2 className="font-semibold text-[#1B1F1A] mb-3">Original Verdict</h2>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FDF0EC] flex items-center justify-center text-lg">❌</div>
                <div>
                  <p className="font-semibold text-[#E07A5F]">Failed</p>
                  <p className="text-xs text-[#5C6B5E] mt-0.5">
                    {verdict.approve_count} approve · {verdict.reject_count} reject · {verdict.sympathy_count} sympathy
                  </p>
                </div>
              </div>
            </Card>
          )}

          {appeal.status === 'pending' && (
            <div className="bg-[#FEF3E2] border border-[#F4A261]/30 rounded-[12px] p-4">
              <p className="text-xs text-[#B5540A]">
                ⏳ Your appeal is being reviewed. Decisions are typically made within 48 hours. You&apos;ll receive a notification when a decision is made.
              </p>
            </div>
          )}

        </div>
      </main>
      <BottomNav />
    </div>
  );
}
