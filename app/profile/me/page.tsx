'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Edit3, Shield, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Chip from '@/components/ui/Chip';
import FileUploader from '@/components/ui/FileUploader';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import { formatCurrency } from '@/lib/utils';
import type { Profile, Pact, PactMember } from '@/types';

const INTERESTS = ['Coding', 'Fitness', 'Reading', 'Finance', 'Wellness', 'Creative Writing', 'Languages', 'Music', 'Cooking', 'Meditation'];

interface PactHistory extends Pact { pact_members: PactMember[]; }

export default function MyProfilePage() {
  const router = useRouter();

  // All state defaults to empty — renders immediately
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pacts, setPacts] = useState<PactHistory[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarFiles, setAvatarFiles] = useState<File[]>([]);
  const [editData, setEditData] = useState({ full_name: '', bio: '', interests: [] as string[], username: '' });

  useEffect(() => {
    const supabase = createClient();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { router.replace('/login'); return; }
        const uid = session.user.id;
        setUserId(uid);
        setUserEmail(session.user.email ?? '');

        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', uid).single();
        if (profileData) {
          setProfile(profileData);
          setEditData({
            full_name: profileData.full_name ?? '',
            bio: profileData.bio ?? '',
            interests: profileData.interests ?? [],
            username: profileData.username ?? '',
          });
        } else {
          // New user with no profile yet — pre-fill from email
          setEditData((d) => ({ ...d, username: session.user.email?.split('@')[0] ?? '' }));
          setEditing(true); // open edit form immediately so they can complete profile
        }

        const { data: memberships } = await supabase.from('pact_members').select('pact_id').eq('user_id', uid);
        if (memberships?.length) {
          const pactIds = memberships.map((m) => m.pact_id);
          const { data: pactData } = await supabase.from('pacts').select('*, pact_members(*)').in('id', pactIds);
          setPacts((pactData as PactHistory[]) ?? []);
        }
      } catch {
        // Timeout or network error — leave defaults
      } finally {
        clearTimeout(timeout);
      }
    }

    load();
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [router]);

  const toggleInterest = (interest: string) => {
    setEditData((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const saveProfile = async () => {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();

    let avatarUrl = profile?.avatar_url ?? null;
    if (avatarFiles.length > 0) {
      try {
        const file = avatarFiles[0];
        const path = `avatars/${userId}/${Date.now()}-${file.name}`;
        const { data: uploadData } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
        if (uploadData) {
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
          avatarUrl = publicUrl;
        }
      } catch { /* storage not configured — skip avatar */ }
    }

    const { data: updated, error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        full_name: editData.full_name,
        bio: editData.bio,
        interests: editData.interests,
        username: editData.username,
        avatar_url: avatarUrl,
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      toast.error('Failed to save profile');
    } else {
      toast.success('Profile updated!');
      setProfile(updated);
      setEditing(false);
    }
    setSaving(false);
  };

  // Derived display values — safe with null profile
  const displayName = profile?.full_name ?? profile?.username ?? editData.username ?? userEmail.split('@')[0] ?? 'You';
  const integrityScore = profile?.integrity_score ?? 100;
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (integrityScore / 100) * circumference;
  const successRate = profile && (profile.sprints_completed + profile.sprints_failed) > 0
    ? Math.round((profile.sprints_completed / (profile.sprints_completed + profile.sprints_failed)) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar />
      <Header title="My Profile" />
      <main className="md:ml-64 pb-20 md:pb-8 page-enter">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

          {/* Profile header card */}
          <Card>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="relative flex-shrink-0">
                <svg width="84" height="84" className="absolute -top-2 -left-2 -rotate-90">
                  <circle cx="42" cy="42" r="36" fill="none" stroke="#E0EBE1" strokeWidth="4" />
                  <circle cx="42" cy="42" r="36" fill="none" stroke="#2D6A4F" strokeWidth="4"
                    strokeDasharray={circumference} strokeDashoffset={dashOffset}
                    strokeLinecap="round" className="transition-all duration-1000" />
                </svg>
                <div className="mt-1 ml-1">
                  <Avatar src={profile?.avatar_url} name={displayName} size="lg" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#2D6A4F] rounded-full flex items-center justify-center">
                  <span className="text-white text-[9px] font-bold">{integrityScore}</span>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#1B1F1A]">
                    {displayName}
                  </h1>
                  {profile?.is_verified && <Shield size={18} className="text-[#2D6A4F]" />}
                </div>
                {(profile?.username || editData.username) && (
                  <p className="text-sm text-[#8FA38F]">@{profile?.username ?? editData.username}</p>
                )}
                {!profile?.username && userEmail && (
                  <p className="text-sm text-[#8FA38F]">{userEmail}</p>
                )}
                {profile?.bio && <p className="text-sm text-[#5C6B5E] mt-2">{profile.bio}</p>}
                {profile?.interests && profile.interests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {profile.interests.map((i) => (
                      <span key={i} className="px-2 py-0.5 bg-[#D8EDDA] text-[#1B4332] rounded-full text-xs font-medium">{i}</span>
                    ))}
                  </div>
                )}
              </div>

              <Button onClick={() => setEditing(!editing)} variant="secondary" size="sm">
                <Edit3 size={14} className="mr-1.5" /> Edit
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-3 mt-5 pt-4 border-t border-[#E0EBE1]">
              {[
                { label: 'Success Rate', value: `${successRate}%`, color: '#2D6A4F' },
                { label: 'Earned', value: formatCurrency(profile?.total_earned ?? 0), color: '#2D6A4F', icon: TrendingUp },
                { label: 'Lost', value: formatCurrency(profile?.total_lost ?? 0), color: '#E07A5F', icon: TrendingDown },
                { label: 'Sprints', value: (profile?.sprints_completed ?? 0).toString(), color: '#1B4332' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <p className="font-[family-name:var(--font-display)] font-bold text-lg" style={{ color }}>{value}</p>
                  <p className="text-[10px] text-[#8FA38F] uppercase tracking-wide">{label}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Edit form */}
          {editing && (
            <Card>
              <h2 className="font-semibold text-[#1B1F1A] mb-4">
                {profile ? 'Edit Profile' : 'Complete Your Profile'}
              </h2>
              <div className="space-y-4">
                <Input label="Full Name" value={editData.full_name}
                  onChange={(e) => setEditData((p) => ({ ...p, full_name: e.target.value }))} />
                <Input label="Username" value={editData.username}
                  onChange={(e) => setEditData((p) => ({ ...p, username: e.target.value }))} prefix="@" />
                <Textarea label="Bio" value={editData.bio} rows={3}
                  onChange={(e) => setEditData((p) => ({ ...p, bio: e.target.value }))} />
                <div>
                  <p className="text-sm font-medium text-[#1B1F1A] mb-2">Interests</p>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map((i) => (
                      <Chip key={i} label={i} selected={editData.interests.includes(i)} onClick={() => toggleInterest(i)} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1B1F1A] mb-2">Profile Photo</p>
                  <FileUploader onFilesChange={setAvatarFiles} maxFiles={1} accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }} />
                </div>
                <div className="flex gap-3">
                  <Button onClick={saveProfile} loading={saving} className="flex-1">Save Changes</Button>
                  {profile && <Button onClick={() => setEditing(false)} variant="secondary">Cancel</Button>}
                </div>
              </div>
            </Card>
          )}

          {/* Pact history */}
          <div>
            <h2 className="font-semibold text-[#1B1F1A] mb-3">Pact History</h2>
            {pacts.length === 0 ? (
              <Card className="text-center py-8">
                <p className="text-[#8FA38F] text-sm">No pact history yet. Join your first pact!</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {pacts.map((p) => {
                  const myRole = p.pact_members?.find((m) => m.user_id === userId)?.role;
                  return (
                    <Card key={p.id} hover onClick={() => router.push(`/pacts/${p.id}`)}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-[#1B1F1A]">{p.name}</p>
                          <p className="text-xs text-[#8FA38F] mt-0.5">{p.category} · Sprint {p.current_sprint}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {myRole === 'admin' && <Badge variant="active">Admin</Badge>}
                          <Badge variant={p.status === 'active' ? 'active' : p.status === 'completed' ? 'completed' : 'pending'}>
                            {p.status}
                          </Badge>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
