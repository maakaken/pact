'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Shield, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Profile } from '@/types';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingScore, setEditingScore] = useState<{ id: string; value: number } | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setUsers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleVerified = async (user: Profile) => {
    const supabase = createClient();
    await supabase.from('profiles').update({ is_verified: !user.is_verified }).eq('id', user.id);
    toast.success(user.is_verified ? 'Verification removed' : 'User verified ✓');
    load();
  };

  const updateScore = async (userId: string, score: number) => {
    const clamped = Math.min(100, Math.max(0, score));
    const supabase = createClient();
    await supabase.from('profiles').update({ integrity_score: clamped }).eq('id', userId);
    toast.success('Integrity score updated');
    setEditingScore(null);
    load();
  };

  const filtered = users.filter((u) =>
    !search ||
    (u.username ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u.full_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 page-enter">
      <div className="mb-8">
        <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-1">MODERATION</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1B1F1A]">User Management</h1>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8FA38F]" />
        <input
          type="text"
          placeholder="Search by username or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-[#E0EBE1] rounded-[12px] pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#2D6A4F] focus:ring-3 focus:ring-[rgba(45,106,79,0.12)] transition-all"
        />
      </div>

      <div className="bg-white rounded-[20px] border border-[#E0EBE1] overflow-hidden shadow-[0_2px_16px_rgba(45,106,79,0.08)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E0EBE1] bg-[#F5F7F0]">
              {['Member', 'Integrity Score', 'Stats', 'Joined', 'Verified', 'Actions'].map((h) => (
                <th key={h} className="text-left text-xs font-semibold text-[#8FA38F] py-3 px-4">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-[#8FA38F]">Loading...</td></tr>
            ) : filtered.map((user) => (
              <tr key={user.id} className="border-b border-[#E0EBE1] hover:bg-[#F5F7F0] transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <Avatar src={user.avatar_url} name={user.full_name ?? user.username} size="sm" />
                    <div>
                      <p className="font-medium text-[#1B1F1A]">{user.full_name ?? user.username}</p>
                      <p className="text-xs text-[#8FA38F]">@{user.username}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4">
                  {editingScore?.id === user.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editingScore.value}
                        onChange={(e) => setEditingScore({ id: user.id, value: parseInt(e.target.value) || 0 })}
                        className="w-16 border border-[#E0EBE1] rounded-[8px] px-2 py-1 text-sm focus:outline-none focus:border-[#2D6A4F]"
                      />
                      <button onClick={() => updateScore(user.id, editingScore.value)} className="text-xs text-[#2D6A4F] font-semibold">Save</button>
                      <button onClick={() => setEditingScore(null)} className="text-xs text-[#8FA38F]">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#1B4332]">{user.integrity_score}</span>
                      <button
                        onClick={() => setEditingScore({ id: user.id, value: user.integrity_score })}
                        className="text-[10px] text-[#8FA38F] hover:text-[#2D6A4F] underline"
                      >
                        edit
                      </button>
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 text-xs text-[#5C6B5E]">
                  <p>{user.sprints_completed}✓ / {user.sprints_failed}✗</p>
                  <p className="text-[10px] mt-0.5">{formatCurrency(user.total_earned)} earned</p>
                </td>
                <td className="py-3 px-4 text-xs text-[#8FA38F]">{formatDate(user.created_at)}</td>
                <td className="py-3 px-4">
                  {user.is_verified
                    ? <Badge variant="active" className="text-[10px]">✓ Verified</Badge>
                    : <Badge variant="pending" className="text-[10px]">Unverified</Badge>
                  }
                </td>
                <td className="py-3 px-4">
                  <button
                    onClick={() => toggleVerified(user)}
                    className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                      user.is_verified ? 'text-[#E07A5F] hover:text-[#c0522a]' : 'text-[#2D6A4F] hover:text-[#1B4332]'
                    }`}
                  >
                    {user.is_verified ? <ShieldOff size={12} /> : <Shield size={12} />}
                    {user.is_verified ? 'Remove' : 'Verify'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
