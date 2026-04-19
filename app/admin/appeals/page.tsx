'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import { formatTimeAgo } from '@/lib/utils';
import type { Appeal, Profile, Verdict } from '@/types';

interface AppealWithDetails extends Appeal {
  profiles: Profile;
  verdicts: Verdict & { sprints: { pact_id: string; pacts: { name: string } } | null } | null;
}

export default function AdminAppealsPage() {
  const [appeals, setAppeals] = useState<AppealWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AppealWithDetails | null>(null);
  const [action, setAction] = useState<'upheld' | 'overturned' | null>(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('appeals')
      .select('*, profiles(*), verdicts(*, sprints(pact_id, pacts(name)))')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    setAppeals((data as AppealWithDetails[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async () => {
    if (!selected || !action || !note.trim()) return;
    setActing(true);
    const supabase = createClient();

    await supabase.from('appeals').update({
      status: action,
      moderator_note: note,
    }).eq('id', selected.id);

    await supabase.from('moderation_queue').update({ status: 'reviewed' })
      .eq('type', 'appeal')
      .eq('appeal_id', selected.id);

    // Notify the appellant
    await supabase.from('notifications').insert({
      user_id: selected.user_id,
      type: 'appeal_result',
      title: action === 'upheld' ? 'Appeal Reviewed — Verdict Upheld' : 'Appeal Reviewed — Verdict Overturned',
      body: note,
      pact_id: selected.verdicts?.sprints?.pact_id ?? null,
    });

    // If overturned, notify all pact members
    if (action === 'overturned' && selected.verdicts?.sprints?.pact_id) {
      const { data: members } = await supabase
        .from('pact_members')
        .select('user_id')
        .eq('pact_id', selected.verdicts.sprints.pact_id);

      if (members) {
        await supabase.from('notifications').insert(
          members.map((m) => ({
            user_id: m.user_id,
            type: 'appeal_result' as const,
            title: 'An appeal in your pact was overturned',
            body: `A moderator has reviewed an appeal and overturned the verdict.`,
            pact_id: selected.verdicts!.sprints!.pact_id,
          }))
        );
      }
    }

    toast.success(action === 'upheld' ? 'Verdict upheld' : 'Verdict overturned');
    setSelected(null);
    setAction(null);
    setNote('');
    load();
    setActing(false);
  };

  return (
    <div className="p-8 page-enter">
      <div className="mb-8">
        <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-1">MODERATION</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1B1F1A]">
          Appeals Queue ({appeals.length})
        </h1>
      </div>

      {loading ? (
        <p className="text-[#8FA38F]">Loading...</p>
      ) : appeals.length === 0 ? (
        <div className="bg-white rounded-[20px] border border-[#E0EBE1] p-12 text-center">
          <CheckCircle2 size={40} className="text-[#74C69D] mx-auto mb-4" />
          <p className="font-semibold text-[#1B1F1A]">No pending appeals!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {appeals.map((appeal) => (
            <div key={appeal.id} className="bg-white rounded-[20px] border border-[#E0EBE1] p-5 shadow-[0_2px_8px_rgba(45,106,79,0.06)]">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <Avatar src={appeal.profiles?.avatar_url} name={appeal.profiles?.full_name ?? appeal.profiles?.username} size="sm" />
                  <div>
                    <p className="font-medium text-[#1B1F1A]">{appeal.profiles?.full_name ?? appeal.profiles?.username}</p>
                    <p className="text-xs text-[#8FA38F]">
                      {(appeal.verdicts?.sprints as unknown as { pacts: { name: string } } | null)?.pacts?.name ?? 'Unknown Pact'} · {formatTimeAgo(appeal.created_at)}
                    </p>
                  </div>
                </div>
                <Badge variant="pending">Pending Review</Badge>
              </div>

              {/* Original verdict */}
              {appeal.verdicts && (
                <div className="bg-[#FDF0EC] border border-[#F0C4B8] rounded-[10px] p-3 mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#C0522A] mb-1">Original Verdict — FAILED</p>
                  <p className="text-xs text-[#5C6B5E]">
                    {appeal.verdicts.approve_count} approve · {appeal.verdicts.reject_count} reject · {appeal.verdicts.sympathy_count} sympathy
                  </p>
                </div>
              )}

              {/* Appeal reason */}
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#8FA38F] mb-1">Appeal Reason</p>
                <p className="text-sm text-[#1B1F1A] leading-relaxed">{appeal.reason}</p>
              </div>

              {/* Additional evidence */}
              {appeal.evidence_urls && appeal.evidence_urls.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8FA38F] mb-2">Additional Evidence</p>
                  <div className="flex gap-2 flex-wrap">
                    {appeal.evidence_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-[#D8EDDA] text-[#1B4332] rounded-full text-xs font-medium hover:bg-[#c8e3ca]">
                        Evidence {i + 1} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-3 border-t border-[#E0EBE1]">
                <button
                  onClick={() => { setSelected(appeal); setAction('overturned'); setNote(''); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#D8EDDA] text-[#1B4332] rounded-[10px] text-sm font-semibold hover:bg-[#c8e3ca] transition-all"
                >
                  <CheckCircle2 size={14} /> Overturn Verdict
                </button>
                <button
                  onClick={() => { setSelected(appeal); setAction('upheld'); setNote(''); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#FDF0EC] text-[#E07A5F] rounded-[10px] text-sm font-semibold hover:bg-[#f9e1d9] transition-all"
                >
                  <XCircle size={14} /> Uphold Verdict
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Decision modal */}
      <Modal
        isOpen={!!selected && !!action}
        onClose={() => { setSelected(null); setAction(null); setNote(''); }}
        title={action === 'overturned' ? 'Overturn Verdict' : 'Uphold Verdict'}
      >
        <div className="space-y-4">
          <div className={`rounded-[12px] p-3 ${action === 'overturned' ? 'bg-[#D8EDDA]' : 'bg-[#FDF0EC]'}`}>
            <p className="text-sm font-semibold" style={{ color: action === 'overturned' ? '#1B4332' : '#E07A5F' }}>
              {action === 'overturned' ? '✅ The member\'s appeal will be approved and the verdict reversed.' : '❌ The original verdict will stand.'}
            </p>
          </div>
          <Textarea
            label="Moderator Note *"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain your decision. This note will be sent to the member and all pact participants."
          />
          <div className="flex gap-3">
            <Button onClick={decide} loading={acting} className="flex-1">
              Confirm Decision
            </Button>
            <Button onClick={() => { setSelected(null); setAction(null); setNote(''); }} variant="secondary">Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
