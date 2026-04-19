'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatTimeAgo } from '@/lib/utils';
import type { ModerationQueueItem } from '@/types';

interface QueueItemWithDetails extends ModerationQueueItem {
  profiles: { username: string; full_name: string | null } | null;
  pacts: { name: string } | null;
}

export default function AdminQueuePage() {
  const [items, setItems] = useState<QueueItemWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('moderation_queue')
      .select('*, profiles(username, full_name), pacts(name)')
      .order('created_at', { ascending: false })
      .limit(100);
    setItems((data as QueueItemWithDetails[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const typeLabel = (type: string) => {
    const map: Record<string, string> = {
      goal_review: 'Goal Review',
      evidence_review: 'Evidence',
      appeal: 'Appeal',
      dispute: 'Dispute',
    };
    return map[type] ?? type;
  };

  const typeColor = (type: string) => {
    const map: Record<string, string> = {
      goal_review: '#2D6A4F',
      evidence_review: '#F4A261',
      appeal: '#E07A5F',
      dispute: '#5C6B5E',
    };
    return map[type] ?? '#8FA38F';
  };

  const pending = items.filter((i) => i.status === 'pending');
  const reviewed = items.filter((i) => i.status === 'reviewed');

  const filtered = filter === 'all' ? pending : pending.filter((i) => i.type === filter);

  return (
    <div className="p-8 page-enter">
      <div className="mb-8">
        <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-1">MODERATION</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1B1F1A]">Review Queue</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Pending', value: pending.length, color: '#F4A261' },
          { label: 'Goals', value: pending.filter((i) => i.type === 'goal_review').length, color: '#2D6A4F' },
          { label: 'Evidence', value: pending.filter((i) => i.type === 'evidence_review').length, color: '#F4A261' },
          { label: 'Appeals', value: pending.filter((i) => i.type === 'appeal').length, color: '#E07A5F' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-[16px] border border-[#E0EBE1] p-4 shadow-[0_2px_8px_rgba(45,106,79,0.06)]">
            <p className="font-[family-name:var(--font-display)] font-bold text-3xl" style={{ color }}>{value}</p>
            <p className="text-xs text-[#5C6B5E] mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {['all', 'goal_review', 'evidence_review', 'appeal'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${
              filter === f ? 'bg-[#1B4332] text-white' : 'bg-white border border-[#E0EBE1] text-[#5C6B5E] hover:border-[#2D6A4F]'
            }`}
          >
            {f === 'all' ? 'All Pending' : typeLabel(f)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-[20px] border border-[#E0EBE1] overflow-hidden shadow-[0_2px_16px_rgba(45,106,79,0.08)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E0EBE1] bg-[#F5F7F0]">
              {['Type', 'Pact', 'Member', 'Submitted', 'Status', 'Action'].map((h) => (
                <th key={h} className="text-left text-xs font-semibold text-[#8FA38F] py-3 px-4">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-[#8FA38F]">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center">
                <p className="text-[#8FA38F]">🎉 Queue is empty</p>
              </td></tr>
            ) : filtered.map((item) => (
              <tr key={item.id} className="border-b border-[#E0EBE1] hover:bg-[#F5F7F0] transition-colors">
                <td className="py-3 px-4">
                  <span
                    className="px-2 py-1 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: typeColor(item.type) + '20', color: typeColor(item.type) }}
                  >
                    {typeLabel(item.type)}
                  </span>
                </td>
                <td className="py-3 px-4 font-medium text-[#1B1F1A] truncate max-w-[160px]">
                  {item.pacts?.name ?? '—'}
                </td>
                <td className="py-3 px-4 text-[#5C6B5E]">
                  {item.profiles?.full_name ?? item.profiles?.username ?? '—'}
                </td>
                <td className="py-3 px-4 text-[#8FA38F] text-xs">
                  {formatTimeAgo(item.created_at)}
                </td>
                <td className="py-3 px-4">
                  <span className="px-2 py-1 rounded-full text-xs font-semibold bg-[#FEF3E2] text-[#B5540A]">
                    {item.status}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <a
                    href={
                      item.type === 'goal_review' ? '/admin/goals' :
                      item.type === 'evidence_review' ? '/admin/evidence' :
                      item.type === 'appeal' ? '/admin/appeals' : '#'
                    }
                    className="text-xs font-semibold text-[#2D6A4F] hover:underline"
                  >
                    Review →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
