'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Flag, X, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import { formatTimeAgo } from '@/lib/utils';
import type { Submission, Profile, Goal, Pact } from '@/types';

interface SubWithDetails extends Submission {
  profiles: Profile;
  goals: Goal | null;
  sprints: { pacts: Pact } | null;
}

export default function AdminEvidencePage() {
  const [submissions, setSubmissions] = useState<SubWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SubWithDetails | null>(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('submissions')
      .select('*, profiles(*), goals(*), sprints(pacts(*))')
      .eq('moderation_status', 'pending')
      .eq('is_auto_failed', false)
      .order('submitted_at', { ascending: true });
    setSubmissions((data as SubWithDetails[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (sub: SubWithDetails, action: 'approved' | 'flagged' | 'rejected', rejectionNote?: string) => {
    setActing(true);
    const supabase = createClient();

    await supabase.from('submissions').update({
      moderation_status: action,
      moderation_note: rejectionNote ?? null,
    }).eq('id', sub.id);

    await supabase.from('moderation_queue').update({ status: 'reviewed' })
      .eq('type', 'evidence_review')
      .eq('submission_id', sub.id);

    if (action === 'rejected' && rejectionNote) {
      await supabase.from('notifications').insert({
        user_id: sub.user_id,
        type: 'verdict_open',
        title: 'Your evidence was rejected',
        body: rejectionNote,
      });
    }

    toast.success(
      action === 'approved' ? 'Evidence approved ✓' :
      action === 'flagged' ? 'Evidence flagged' : 'Evidence rejected'
    );
    setSelected(null);
    setNote('');
    load();
    setActing(false);
  };

  const isImage = (url: string) =>
    /\.(jpg|jpeg|png|gif|webp)$/i.test(url) || url.includes('supabase') && !url.includes('.pdf');

  return (
    <div className="p-8 page-enter">
      <div className="mb-8">
        <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-1">MODERATION</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1B1F1A]">
          Evidence Review ({submissions.length})
        </h1>
      </div>

      {loading ? (
        <p className="text-[#8FA38F]">Loading...</p>
      ) : submissions.length === 0 ? (
        <div className="bg-white rounded-[20px] border border-[#E0EBE1] p-12 text-center">
          <CheckCircle2 size={40} className="text-[#74C69D] mx-auto mb-4" />
          <p className="font-semibold text-[#1B1F1A]">All evidence reviewed!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {submissions.map((sub) => (
            <div key={sub.id} className="bg-white rounded-[20px] border border-[#E0EBE1] p-5 shadow-[0_2px_8px_rgba(45,106,79,0.06)]">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <Avatar src={sub.profiles?.avatar_url} name={sub.profiles?.full_name ?? sub.profiles?.username} size="sm" />
                  <div>
                    <p className="font-medium text-[#1B1F1A]">{sub.profiles?.full_name ?? sub.profiles?.username}</p>
                    <p className="text-xs text-[#8FA38F]">{formatTimeAgo(sub.submitted_at)}</p>
                  </div>
                </div>
                <Badge variant="pending">Pending Review</Badge>
              </div>

              {/* Proof specification for comparison */}
              {sub.goals?.proof_specification && (
                <div className="bg-[#FEF3E2] border border-[#F4A261]/30 rounded-[10px] p-3 mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#B5540A] mb-1">Required Proof Spec</p>
                  <p className="text-sm text-[#1B1F1A]">{sub.goals.proof_specification}</p>
                </div>
              )}

              {/* Caption */}
              {sub.caption && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8FA38F] mb-1">Caption</p>
                  <p className="text-sm text-[#1B1F1A]">{sub.caption}</p>
                </div>
              )}

              {/* Files */}
              {sub.file_urls && sub.file_urls.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8FA38F] mb-2">Submitted Files</p>
                  <div className="grid grid-cols-3 gap-2">
                    {sub.file_urls.map((url, i) => (
                      <div key={i} className="relative">
                        {isImage(url) ? (
                          <div className="relative aspect-square rounded-[10px] overflow-hidden bg-[#F5F7F0]">
                            <Image src={url} alt={`File ${i + 1}`} fill className="object-cover" />
                          </div>
                        ) : (
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 p-3 bg-[#F5F7F0] rounded-[10px] text-xs text-[#2D6A4F] hover:bg-[#EEF5EE] transition-colors">
                            <ExternalLink size={12} /> File {i + 1}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* External links */}
              {sub.external_links && sub.external_links.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8FA38F] mb-2">External Links</p>
                  <div className="space-y-1">
                    {sub.external_links.map((link, i) => (
                      <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-[#2D6A4F] hover:underline">
                        <ExternalLink size={12} /> {link}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 flex-wrap pt-3 border-t border-[#E0EBE1]">
                <button
                  onClick={() => act(sub, 'approved')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#D8EDDA] text-[#1B4332] rounded-[10px] text-sm font-semibold hover:bg-[#c8e3ca] transition-all"
                >
                  <CheckCircle2 size={14} /> Approve
                </button>
                <button
                  onClick={() => act(sub, 'flagged')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#FEF3E2] text-[#B5540A] rounded-[10px] text-sm font-semibold hover:bg-[#fde9c8] transition-all"
                >
                  🚩 Flag
                </button>
                <button
                  onClick={() => { setSelected(sub); setNote(''); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#FDF0EC] text-[#E07A5F] rounded-[10px] text-sm font-semibold hover:bg-[#f9e1d9] transition-all"
                >
                  <X size={14} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject modal */}
      <Modal isOpen={!!selected} onClose={() => { setSelected(null); setNote(''); }} title="Reject Evidence">
        <div className="space-y-4">
          <p className="text-sm text-[#5C6B5E]">Provide a reason for rejection. This will be sent to the member.</p>
          <Textarea label="Rejection reason *" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-3">
            <Button onClick={() => selected && note && act(selected, 'rejected', note)} loading={acting} variant="danger" className="flex-1">
              Reject Evidence
            </Button>
            <Button onClick={() => { setSelected(null); setNote(''); }} variant="secondary">Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
