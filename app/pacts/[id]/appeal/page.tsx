'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import FileUploader from '@/components/ui/FileUploader';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import type { Verdict, Pact, Sprint } from '@/types';

export default function AppealPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useUser();

  const [pact, setPact] = useState<Pact | null>(null);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [myVerdict, setMyVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user || !id) return;
    const supabase = createClient();

    const { data: pactData } = await supabase.from('pacts').select('*').eq('id', id).single();
    if (!pactData) { setAccessDenied(true); setLoading(false); return; }
    setPact(pactData);

    const { data: sprintData } = await supabase
      .from('sprints')
      .select('*')
      .eq('pact_id', id)
      .eq('sprint_number', pactData.current_sprint)
      .single();
    setSprint(sprintData ?? null);

    if (sprintData) {
      const { data: verdictData } = await supabase
        .from('verdicts')
        .select('*')
        .eq('sprint_id', sprintData.id)
        .eq('user_id', user.id)
        .single();

      if (!verdictData || verdictData.outcome !== 'failed') {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      const within24h = Date.now() - new Date(verdictData.finalized_at).getTime() < 24 * 3600 * 1000;
      if (!within24h) { setAccessDenied(true); setLoading(false); return; }

      setMyVerdict(verdictData);
    }

    setLoading(false);
  }, [user, id]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!user || !myVerdict || !sprint || !pact) return;
    if (reason.trim().length < 100) {
      setError('Please provide at least 100 characters explaining your appeal.');
      return;
    }
    setSubmitting(true);
    setError('');
    const supabase = createClient();

    // Upload evidence files
    const evidenceUrls: string[] = [];
    for (const file of files) {
      const path = `appeals/${pact.id}/${user.id}/${Date.now()}-${file.name}`;
      const { data: uploadData } = await supabase.storage.from('evidence').upload(path, file);
      if (uploadData) {
        const { data: { publicUrl } } = supabase.storage.from('evidence').getPublicUrl(path);
        evidenceUrls.push(publicUrl);
      }
    }

    // Create appeal
    const { data: appealData, error: appealError } = await supabase
      .from('appeals')
      .insert({
        verdict_id: myVerdict.id,
        user_id: user.id,
        reason: reason.trim(),
        evidence_urls: evidenceUrls.length > 0 ? evidenceUrls : null,
        status: 'pending',
      })
      .select()
      .single();

    if (appealError || !appealData) {
      setError('Failed to submit appeal. Please try again.');
      setSubmitting(false);
      return;
    }

    // Add to moderation queue
    await supabase.from('moderation_queue').insert({
      type: 'appeal',
      appeal_id: appealData.id,
      pact_id: pact.id,
      user_id: user.id,
    });

    router.push(`/appeals/${appealData.id}`);
  };

  if (authLoading || loading) {
    return <div className="min-h-screen bg-[#F5F7F0] flex items-center justify-center"><div className="skeleton w-64 h-8 rounded-full" /></div>;
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-[#F5F7F0] flex items-center justify-center p-4">
        <Card className="max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-full bg-[#FDF0EC] flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-[#E07A5F]" />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#1B1F1A] mb-2">Appeal Not Available</h2>
          <p className="text-sm text-[#5C6B5E] mb-4">Appeals are only available within 24 hours of a failed verdict.</p>
          <Button onClick={() => router.push(`/pacts/${id}/results`)} variant="secondary" className="w-full">View Results</Button>
        </Card>
      </div>
    );
  }

  const timeLeft = myVerdict
    ? Math.max(0, 24 * 3600 * 1000 - (Date.now() - new Date(myVerdict.finalized_at).getTime()))
    : 0;
  const hoursLeft = Math.floor(timeLeft / 3600000);
  const minutesLeft = Math.floor((timeLeft % 3600000) / 60000);

  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar />
      <Header title="Appeal" />
      <main className="md:ml-64 pb-20 md:pb-8 page-enter">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

          <div>
            <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-1">APPEAL YOUR RESULT</p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1B1F1A]">
              Submit an Appeal
            </h1>
            <p className="text-sm text-[#5C6B5E] mt-1">
              You have <span className="font-semibold text-[#E07A5F]">{hoursLeft}h {minutesLeft}m</span> remaining to appeal.
            </p>
          </div>

          {/* Verdict summary */}
          {myVerdict && (
            <div className="bg-[#FDF0EC] border border-[#F0C4B8] rounded-[20px] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#5C6B5E] mb-2">YOUR VERDICT</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FDF0EC] border border-[#F0C4B8] flex items-center justify-center text-lg">❌</div>
                <div>
                  <p className="font-semibold text-[#E07A5F]">Goal Not Met — Failed</p>
                  <p className="text-xs text-[#5C6B5E] mt-0.5">
                    {myVerdict.approve_count} approve · {myVerdict.reject_count} reject · {myVerdict.sympathy_count} sympathy
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Appeal form */}
          <Card>
            <div className="space-y-5">
              <div>
                <Textarea
                  label="Reason for Appeal *"
                  placeholder="Explain why you believe the verdict was incorrect. Include details about what you accomplished and why it meets the agreed proof specification..."
                  rows={6}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  error={error}
                />
                <p className={`text-xs mt-1 text-right ${reason.length >= 100 ? 'text-[#2D6A4F]' : 'text-[#8FA38F]'}`}>
                  {reason.length} / 100 minimum
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-[#1B1F1A] mb-2">Additional Evidence (optional)</p>
                <FileUploader onFilesChange={setFiles} />
              </div>

              {/* Disclaimer */}
              <div className="bg-[#FEF3E2] border border-[#F4A261]/30 rounded-[12px] p-4 flex gap-3">
                <Clock size={16} className="text-[#B5540A] flex-shrink-0 mt-0.5" />
                <p className="text-xs text-[#B5540A]">
                  Appeals are reviewed by human moderators within 48 hours. Moderator decisions are final. You will be notified by email and in-app notification when a decision is made.
                </p>
              </div>

              <Button onClick={handleSubmit} loading={submitting} className="w-full">
                Submit Appeal
              </Button>
            </div>
          </Card>

        </div>
      </main>
      <BottomNav />
    </div>
  );
}
