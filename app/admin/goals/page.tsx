'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Flag, Edit3, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import { formatTimeAgo } from '@/lib/utils';
import type { Goal, Profile, Pact } from '@/types';

interface GoalWithDetails extends Goal {
  profiles: Profile;
  pacts: Pact;
}

export default function AdminGoalsPage() {
  const [goals, setGoals] = useState<GoalWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GoalWithDetails | null>(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('goals')
      .select('*, profiles(*), pacts(*)')
      .eq('moderation_status', 'pending')
      .order('created_at', { ascending: true });
    setGoals((data as GoalWithDetails[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (goal: GoalWithDetails, action: 'cleared' | 'flagged' | 'change_requested') => {
    if (action === 'change_requested' && !note.trim()) {
      toast.error('Please add a note explaining what changes are needed.');
      return;
    }
    setActing(true);
    const supabase = createClient();

    await supabase.from('goals').update({
      moderation_status: action === 'change_requested' ? 'flagged' : action,
      status: action === 'change_requested' ? 'revision_requested' : goal.status,
    }).eq('id', goal.id);

    await supabase.from('moderation_queue').update({ status: 'reviewed' })
      .eq('type', 'goal_review')
      .eq('goal_id', goal.id);

    if (action === 'change_requested' && note) {
      await supabase.from('notifications').insert({
        user_id: goal.user_id,
        type: 'goal_approval_needed',
        title: 'Changes requested for your goal',
        body: note,
        pact_id: goal.pact_id,
      });
    }

    toast.success(
      action === 'cleared' ? 'Goal cleared ✓' :
      action === 'flagged' ? 'Goal flagged' :
      'Changes requested'
    );
    setSelected(null);
    setNote('');
    load();
    setActing(false);
  };

  return (
    <div className="p-8 page-enter">
      <div className="mb-8">
        <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-1">MODERATION</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1B1F1A]">
          Goal Review Queue ({goals.length})
        </h1>
      </div>

      {loading ? (
        <p className="text-[#8FA38F]">Loading...</p>
      ) : goals.length === 0 ? (
        <div className="bg-white rounded-[20px] border border-[#E0EBE1] p-12 text-center">
          <CheckCircle2 size={40} className="text-[#74C69D] mx-auto mb-4" />
          <p className="font-semibold text-[#1B1F1A]">All goals reviewed!</p>
          <p className="text-sm text-[#5C6B5E] mt-1">No pending goals at the moment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map((goal) => (
            <div key={goal.id} className="bg-white rounded-[20px] border border-[#E0EBE1] p-5 shadow-[0_2px_8px_rgba(45,106,79,0.06)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar src={goal.profiles?.avatar_url} name={goal.profiles?.full_name ?? goal.profiles?.username} size="sm" />
                  <div>
                    <p className="font-medium text-[#1B1F1A]">{goal.profiles?.full_name ?? goal.profiles?.username}</p>
                    <p className="text-xs text-[#8FA38F]">{goal.pacts?.name} · {formatTimeAgo(goal.created_at)}</p>
                  </div>
                </div>
                <Badge variant="pending">Pending Review</Badge>
              </div>

              <h3 className="font-semibold text-[#1B1F1A] text-lg mb-2">{goal.title}</h3>
              {goal.description && <p className="text-sm text-[#5C6B5E] mb-3">{goal.description}</p>}

              <div className="space-y-2 mb-4">
                <div className="bg-[#F5F7F0] rounded-[10px] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8FA38F] mb-1">Measurable Outcome</p>
                  <p className="text-sm text-[#1B1F1A]">{goal.measurable_outcome}</p>
                </div>
                <div className="bg-[#F5F7F0] rounded-[10px] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8FA38F] mb-1">Proof Specification</p>
                  <p className="text-sm text-[#1B1F1A]">{goal.proof_specification}</p>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => act(goal, 'cleared')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#D8EDDA] text-[#1B4332] rounded-[10px] text-sm font-semibold hover:bg-[#c8e3ca] transition-all"
                >
                  <CheckCircle2 size={14} /> Clear
                </button>
                <button
                  onClick={() => { setSelected(goal); setNote(''); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#FEF3E2] text-[#B5540A] rounded-[10px] text-sm font-semibold hover:bg-[#fde9c8] transition-all"
                >
                  <Edit3 size={14} /> Request Changes
                </button>
                <button
                  onClick={() => act(goal, 'flagged')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#FDF0EC] text-[#E07A5F] rounded-[10px] text-sm font-semibold hover:bg-[#f9e1d9] transition-all"
                >
                  <Flag size={14} /> Flag
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Request changes modal */}
      <Modal isOpen={!!selected} onClose={() => { setSelected(null); setNote(''); }} title="Request Changes">
        <div className="space-y-4">
          <p className="text-sm text-[#5C6B5E]">
            Explain what changes the member needs to make to their goal or proof specification.
          </p>
          <Textarea
            label="Note to member *"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Please clarify how you will measure..."
          />
          <div className="flex gap-3">
            <Button
              onClick={() => selected && act(selected, 'change_requested')}
              loading={acting}
              className="flex-1"
            >
              Send Request
            </Button>
            <Button onClick={() => { setSelected(null); setNote(''); }} variant="secondary">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
