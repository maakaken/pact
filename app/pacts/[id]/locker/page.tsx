'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { FileText, Film, ExternalLink, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import { usePact } from '@/hooks/usePact';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import Avatar from '@/components/ui/Avatar';
import Skeleton from '@/components/ui/Skeleton';
import ProgressBar from '@/components/ui/ProgressBar';
import CountdownTimer from '@/components/ui/CountdownTimer';
import FileUploader from '@/components/ui/FileUploader';
import { cn } from '@/lib/utils';
import type { Submission, Goal } from '@/types';

interface ExternalLink {
  type: string;
  url: string;
}

interface SubmissionWithProfile extends Submission {
  profiles: { full_name: string | null; username: string; avatar_url: string | null };
  goals: Goal | null;
}

const LINK_TYPES = ['GitHub', 'Strava', 'YouTube', 'Twitter', 'Other'];

function MediaCell({
  submission,
  memberName,
  avatarUrl,
}: {
  submission: SubmissionWithProfile | null;
  memberName: string;
  avatarUrl: string | null;
}) {
  const firstFile = submission?.file_urls?.[0] ?? null;
  const isImage = firstFile && /\.(jpg|jpeg|png|gif|webp)$/i.test(firstFile);
  const isVideo = firstFile && /\.(mp4|mov|avi)$/i.test(firstFile);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full aspect-square rounded-[12px] overflow-hidden bg-[#F5F7F0] relative flex items-center justify-center">
        {submission ? (
          isImage ? (
            <Image src={firstFile!} alt={memberName} fill className="object-cover" />
          ) : isVideo ? (
            <div className="flex flex-col items-center gap-1 text-[#5C6B5E]">
              <Film size={28} />
              <span className="text-[10px]">Video</span>
            </div>
          ) : firstFile ? (
            <div className="flex flex-col items-center gap-1 text-[#5C6B5E]">
              <FileText size={28} />
              <span className="text-[10px] text-center px-2 truncate w-full">{firstFile.split('/').pop()}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-[#8FA38F]">
              <CheckCircle2 size={28} className="text-[#52B788]" />
              <span className="text-[10px]">Submitted</span>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-1 text-[#C9D7CB]">
            <FileText size={28} />
            <span className="text-[10px]">Pending</span>
          </div>
        )}
        <div className="absolute top-1.5 right-1.5">
          {submission ? (
            <span className="bg-[#D8EDDA] text-[#1B4332] rounded-full p-0.5">
              <CheckCircle2 size={14} />
            </span>
          ) : (
            <span className="bg-[#FEF3E2] text-[#B5540A] rounded-full px-2 py-0.5 text-[9px] font-bold">
              Pending
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Avatar src={avatarUrl} name={memberName} size="xs" />
        <span className="text-xs text-[#1B1F1A] font-medium truncate max-w-[80px]">{memberName}</span>
      </div>
    </div>
  );
}

export default function LockerPage() {
  const params = useParams();
  const pactId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { pact, loading: pactLoading } = usePact(pactId);

  const [mySubmission, setMySubmission] = useState<Submission | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<SubmissionWithProfile[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Form state
  const [files, setFiles] = useState<File[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([{ type: 'GitHub', url: '' }]);
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

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

    const submissions = (subs as SubmissionWithProfile[]) ?? [];
    setAllSubmissions(submissions);
    const mine = submissions.find((s) => s.user_id === user.id) ?? null;
    setMySubmission(mine);
    setDataLoading(false);
  }, [user, pact]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    if (!pact?.currentSprint) return;
    const supabase = createClient();

    realtimeRef.current = supabase
      .channel(`submissions:${pact.currentSprint.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions', filter: `sprint_id=eq.${pact.currentSprint.id}` },
        () => { fetchData(); }
      )
      .subscribe();

    return () => {
      realtimeRef.current?.unsubscribe();
    };
  }, [pact?.currentSprint, fetchData]);

  const handleSubmit = async () => {
    if (!user || !pact?.currentSprint) return;
    setSubmitting(true);
    setSubmitError('');
    const supabase = createClient();

    // 1. Upload files
    const fileUrls: string[] = [];
    for (const file of files) {
      const path = `${pactId}/${pact.currentSprint.id}/${user.id}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(path, file, { upsert: true });

      if (uploadError) {
        setSubmitError(`Failed to upload ${file.name}: ${uploadError.message}`);
        setSubmitting(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(path);
      fileUrls.push(urlData.publicUrl);
    }

    // 2. Fetch goal_id
    const { data: goalData } = await supabase
      .from('goals')
      .select('id')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('sprint_number', pact.current_sprint)
      .single();

    const filteredLinks = externalLinks.filter((l) => l.url.trim() !== '');

    // 3. Insert submission
    const { data: newSub, error: subError } = await supabase
      .from('submissions')
      .insert({
        sprint_id: pact.currentSprint.id,
        user_id: user.id,
        goal_id: goalData?.id ?? null,
        caption: caption.trim() || null,
        file_urls: fileUrls.length > 0 ? fileUrls : null,
        external_links: filteredLinks.length > 0 ? filteredLinks.map((l) => JSON.stringify(l)) : null,
        moderation_status: 'pending',
        is_auto_failed: false,
      })
      .select()
      .single();

    if (subError || !newSub) {
      setSubmitError('Failed to submit proof. Please try again.');
      setSubmitting(false);
      return;
    }

    // 4. Insert into moderation_queue
    await supabase.from('moderation_queue').insert({
      type: 'evidence_review',
      submission_id: newSub.id,
      pact_id: pactId,
      user_id: user.id,
      status: 'pending',
    });

    await fetchData();
    setSubmitting(false);
  };

  // Computed values
  const sprint = pact?.currentSprint ?? null;
  const totalMembers = pact?.members.length ?? 0;
  const submittedCount = allSubmissions.length;
  const verificationPct = totalMembers > 0 ? Math.round((submittedCount / totalMembers) * 100) : 0;

  const now = new Date();
  const sprintEndsAt = sprint?.ends_at ? new Date(sprint.ends_at) : null;
  const msRemaining = sprintEndsAt ? sprintEndsAt.getTime() - now.getTime() : Infinity;
  const hoursRemaining = msRemaining / (1000 * 60 * 60);

  const sprintStartsAt = sprint?.starts_at ? new Date(sprint.starts_at) : null;
  const totalDays = sprintStartsAt && sprintEndsAt
    ? (sprintEndsAt.getTime() - sprintStartsAt.getTime()) / (1000 * 60 * 60 * 24)
    : 1;
  const daysElapsed = sprintStartsAt
    ? Math.min(totalDays, (now.getTime() - sprintStartsAt.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const sprintPct = Math.round((daysElapsed / totalDays) * 100);

  const activePactList = pact ? [{ id: pact.id, name: pact.name }] : [];

  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar activePacts={activePactList} />
      <Header title="Evidence Locker" />
      <main className="md:ml-64 pb-24 md:pb-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 md:py-10 space-y-8">

          {/* ── URGENT BANNER: < 6h, no submission ── */}
          {hoursRemaining < 6 && !mySubmission && (
            <div className="bg-[#FDF0EC] border border-[#F0C4B8] rounded-[16px] p-4">
              <p className="text-sm font-bold text-[#C0522A] mb-1">🚨 Final Warning — Sprint Ending Soon!</p>
              <p className="text-xs text-[#C0522A] mb-3">Submit your proof now or your stake will be forfeited.</p>
              <CountdownTimer endDate={sprint?.ends_at ?? null} size="lg" />
            </div>
          )}

          {/* ── AMBER BANNER: < 24h, no submission ── */}
          {hoursRemaining >= 6 && hoursRemaining < 24 && !mySubmission && (
            <div className="bg-[#FEF3E2] border border-[#F4C678] rounded-[16px] p-4 flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="text-sm font-bold text-[#B5540A]">Less than 24 hours remaining</p>
                <p className="text-xs text-[#B5540A] mt-0.5">
                  Don&apos;t forget to submit your proof before the sprint ends.
                </p>
              </div>
            </div>
          )}

          {/* ── HEADER ── */}
          <div>
            <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-2">
              Active Sprint{pact ? ` — ${pact.name}` : ''}
            </p>
            <h1
              className="text-2xl md:text-3xl font-bold text-[#1B1F1A] mb-4"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Evidence Locker
            </h1>

            {/* Countdown */}
            <div className="mb-5">
              <p className="text-xs text-[#5C6B5E] mb-2">Sprint ends in</p>
              <CountdownTimer endDate={sprint?.ends_at ?? null} size="lg" />
            </div>

            {/* Sprint progress */}
            <div className="space-y-3">
              <ProgressBar
                value={sprintPct}
                label="Sprint completion"
                showPercent
              />
              <ProgressBar
                value={verificationPct}
                label={`Verification (${submittedCount}/${totalMembers} submitted)`}
                showPercent
                color="#52B788"
              />
            </div>
          </div>

          {/* ── YOUR SUBMISSION ── */}
          <section>
            <h2
              className="text-base font-bold text-[#1B1F1A] mb-3"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Your Submission
            </h2>

            {dataLoading ? (
              <Card className="space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-32 w-full rounded-[12px]" />
                <Skeleton className="h-10 w-full" />
              </Card>
            ) : mySubmission ? (
              /* Already submitted */
              <Card className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#D8EDDA] flex items-center justify-center">
                    <CheckCircle2 size={20} className="text-[#1B4332]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1B4332]">Proof Submitted ✓</p>
                    <p className="text-xs text-[#5C6B5E]">
                      {new Date(mySubmission.submitted_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                {mySubmission.caption && (
                  <div className="bg-[#F5F7F0] rounded-[10px] p-3">
                    <p className="text-[10px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Caption</p>
                    <p className="text-xs text-[#1B1F1A]">{mySubmission.caption}</p>
                  </div>
                )}

                {mySubmission.file_urls && mySubmission.file_urls.length > 0 && (
                  <div>
                    <p className="text-[10px] text-[#8FA38F] uppercase tracking-wider font-medium mb-2">Files</p>
                    <div className="space-y-2">
                      {mySubmission.file_urls.map((url, i) => {
                        const name = url.split('/').pop() ?? `File ${i + 1}`;
                        const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                        return (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2.5 bg-[#F5F7F0] rounded-[10px] hover:bg-[#EEF5EE] transition-colors"
                          >
                            {isImg ? (
                              <div className="w-8 h-8 rounded-[6px] overflow-hidden relative flex-shrink-0">
                                <Image src={url} alt={name} fill className="object-cover" />
                              </div>
                            ) : (
                              <FileText size={16} className="text-[#5C6B5E] flex-shrink-0" />
                            )}
                            <span className="text-xs text-[#1B1F1A] flex-1 truncate">{name}</span>
                            <ExternalLink size={12} className="text-[#8FA38F]" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {mySubmission.external_links && mySubmission.external_links.length > 0 && (
                  <div>
                    <p className="text-[10px] text-[#8FA38F] uppercase tracking-wider font-medium mb-2">External Links</p>
                    <div className="space-y-2">
                      {mySubmission.external_links.map((raw, i) => {
                        let link: ExternalLink = { type: 'Other', url: raw };
                        try { link = JSON.parse(raw); } catch {}
                        return (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2.5 bg-[#F5F7F0] rounded-[10px] hover:bg-[#EEF5EE] transition-colors"
                          >
                            <ExternalLink size={14} className="text-[#2D6A4F] flex-shrink-0" />
                            <span className="text-xs font-medium text-[#2D6A4F]">{link.type}</span>
                            <span className="text-xs text-[#5C6B5E] flex-1 truncate">{link.url}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Badge variant="pending">Under Moderation Review</Badge>
              </Card>
            ) : (
              /* Submission form */
              <Card className="space-y-5">
                {/* File upload */}
                <div>
                  <p className="text-xs font-semibold text-[#1B1F1A] mb-2">Evidence Files</p>
                  <FileUploader onFilesChange={setFiles} />
                </div>

                {/* External links */}
                <div>
                  <p className="text-xs font-semibold text-[#1B1F1A] mb-2">External Links</p>
                  <div className="space-y-2">
                    {externalLinks.map((link, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <select
                          value={link.type}
                          onChange={(e) => {
                            const updated = [...externalLinks];
                            updated[i] = { ...updated[i], type: e.target.value };
                            setExternalLinks(updated);
                          }}
                          className="text-xs border border-[#E0EBE1] rounded-[8px] px-2 py-2 bg-white text-[#1B1F1A] focus:outline-none focus:ring-1 focus:ring-[#2D6A4F] flex-shrink-0 w-28"
                        >
                          {LINK_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <input
                          type="url"
                          placeholder="https://..."
                          value={link.url}
                          onChange={(e) => {
                            const updated = [...externalLinks];
                            updated[i] = { ...updated[i], url: e.target.value };
                            setExternalLinks(updated);
                          }}
                          className="flex-1 text-xs border border-[#E0EBE1] rounded-[8px] px-3 py-2 bg-white text-[#1B1F1A] focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]"
                        />
                        {externalLinks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setExternalLinks(externalLinks.filter((_, idx) => idx !== i))}
                            className="text-[#8FA38F] hover:text-[#E07A5F] transition-colors flex-shrink-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setExternalLinks([...externalLinks, { type: 'GitHub', url: '' }])}
                      className="flex items-center gap-1.5 text-xs text-[#2D6A4F] font-medium hover:text-[#1B4332] transition-colors"
                    >
                      <Plus size={13} /> Add Another Link
                    </button>
                  </div>
                </div>

                {/* Caption */}
                <Textarea
                  id="caption"
                  label="Caption"
                  placeholder="Add any notes or context about your proof…"
                  rows={3}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />

                {/* Warning */}
                <div className="bg-[#FEF3E2] border border-[#F4C678] rounded-[12px] p-3 flex items-start gap-2">
                  <span>⚠️</span>
                  <p className="text-xs text-[#B5540A]">
                    Once submitted, your proof cannot be edited or deleted.
                  </p>
                </div>

                {submitError && (
                  <p className="text-xs text-[#E07A5F]">{submitError}</p>
                )}

                <Button
                  onClick={handleSubmit}
                  loading={submitting}
                  disabled={files.length === 0 && externalLinks.every((l) => !l.url.trim())}
                  className="w-full"
                >
                  Submit Proof
                </Button>
              </Card>
            )}
          </section>

          {/* ── INDEXED MEDIA ── */}
          <section>
            <h2
              className="text-base font-bold text-[#1B1F1A] mb-4"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Indexed Media
            </h2>

            {dataLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="aspect-square rounded-[12px]" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {(pact?.members ?? []).map((member) => {
                  const sub = allSubmissions.find((s) => s.user_id === member.user_id) ?? null;
                  const name = member.profiles?.full_name ?? member.profiles?.username ?? 'Member';
                  const avatar = member.profiles?.avatar_url ?? null;
                  return (
                    <MediaCell
                      key={member.user_id}
                      submission={sub}
                      memberName={name}
                      avatarUrl={avatar}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
