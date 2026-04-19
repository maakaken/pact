'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Shield, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import { formatCurrency } from '@/lib/utils';
import type { Profile, Pact, PactMember } from '@/types';

interface PactHistory extends Pact {
  pact_members: PactMember[];
}

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pacts, setPacts] = useState<PactHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();
    if (!profileData) { setNotFound(true); setLoading(false); return; }
    setProfile(profileData);

    const { data: memberships } = await supabase
      .from('pact_members')
      .select('pact_id')
      .eq('user_id', profileData.id);
    if (memberships?.length) {
      const pactIds = memberships.map((m) => m.pact_id);
      const { data: pactData } = await supabase.from('pacts').select('*, pact_members(*)').in('id', pactIds).eq('is_public', true);
      setPacts((pactData as PactHistory[]) ?? []);
    }
    setLoading(false);
  }, [username]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="min-h-screen bg-[#F5F7F0] md:ml-64 p-4"><Skeleton count={2} /></div>;
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F5F7F0] flex items-center justify-center p-4">
        <Card className="max-w-sm w-full text-center">
          <AlertCircle size={32} className="text-[#E07A5F] mx-auto mb-3" />
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold mb-2">User Not Found</h2>
          <p className="text-sm text-[#5C6B5E] mb-4">The profile @{username} doesn&apos;t exist.</p>
          <button onClick={() => router.back()} className="text-sm text-[#2D6A4F] underline">Go back</button>
        </Card>
      </div>
    );
  }

  const successRate = (profile!.sprints_completed + profile!.sprints_failed) > 0
    ? Math.round((profile!.sprints_completed / (profile!.sprints_completed + profile!.sprints_failed)) * 100)
    : 0;

  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (profile!.integrity_score / 100) * circumference;

  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar />
      <Header title={`@${profile!.username}`} />
      <main className="md:ml-64 pb-20 md:pb-8 page-enter">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

          <Card>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="relative flex-shrink-0">
                <svg width="84" height="84" className="absolute -top-2 -left-2 -rotate-90">
                  <circle cx="42" cy="42" r="36" fill="none" stroke="#E0EBE1" strokeWidth="4" />
                  <circle cx="42" cy="42" r="36" fill="none" stroke="#2D6A4F" strokeWidth="4"
                    strokeDasharray={circumference} strokeDashoffset={dashOffset}
                    strokeLinecap="round" className="transition-all duration-1000"
                  />
                </svg>
                <div className="mt-1 ml-1">
                  <Avatar src={profile!.avatar_url} name={profile!.full_name ?? profile!.username} size="lg" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#2D6A4F] rounded-full flex items-center justify-center">
                  <span className="text-white text-[9px] font-bold">{profile!.integrity_score}</span>
                </div>
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#1B1F1A]">
                    {profile!.full_name ?? profile!.username}
                  </h1>
                  {profile!.is_verified && <Shield size={18} className="text-[#2D6A4F]" />}
                </div>
                <p className="text-sm text-[#8FA38F]">@{profile!.username}</p>
                {profile!.bio && <p className="text-sm text-[#5C6B5E] mt-2">{profile!.bio}</p>}
                {profile!.interests && profile!.interests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {profile!.interests.map((i) => (
                      <span key={i} className="px-2 py-0.5 bg-[#D8EDDA] text-[#1B4332] rounded-full text-xs font-medium">{i}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 mt-5 pt-4 border-t border-[#E0EBE1]">
              {[
                { label: 'Success Rate', value: `${successRate}%`, color: '#2D6A4F' },
                { label: 'Earned', value: formatCurrency(profile!.total_earned), color: '#2D6A4F' },
                { label: 'Lost', value: formatCurrency(profile!.total_lost), color: '#E07A5F' },
                { label: 'Sprints', value: profile!.sprints_completed.toString(), color: '#1B4332' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <p className="font-[family-name:var(--font-display)] font-bold text-lg" style={{ color }}>{value}</p>
                  <p className="text-[10px] text-[#8FA38F] uppercase tracking-wide">{label}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Public pact history */}
          <div>
            <h2 className="font-semibold text-[#1B1F1A] mb-3">Public Pacts</h2>
            {pacts.length === 0 ? (
              <Card className="text-center py-6">
                <p className="text-sm text-[#8FA38F]">No public pact history.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {pacts.map((p) => (
                  <Card key={p.id} hover onClick={() => router.push(`/pacts/${p.id}`)}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[#1B1F1A]">{p.name}</p>
                        <p className="text-xs text-[#8FA38F] mt-0.5">{p.category} · Sprint {p.current_sprint}</p>
                      </div>
                      <Badge variant={p.status === 'active' ? 'active' : p.status === 'completed' ? 'completed' : 'pending'}>
                        {p.status}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
