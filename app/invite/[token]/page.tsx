'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Calendar, DollarSign, AlertCircle, CheckCircle2, Clock, Coins } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import { formatCurrency } from '@/lib/utils';
import type { Invitation, Pact, Profile, PactMember } from '@/types';

interface InviteData {
  invitation: Invitation;
  pact: Pact;
  inviter: Profile;
  members: (PactMember & { profiles: Profile })[];
  userCoinBalance?: number;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useUser();

  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState(false);

  const [step, setStep] = useState<'details' | 'success' | 'declined'>('details');
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [insufficientBalance, setInsufficientBalance] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: invitation } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (!invitation) { setInvalid(true); setLoading(false); return; }
    if (invitation.status !== 'pending') { setInvalid(true); setLoading(false); return; }
    if (new Date(invitation.expires_at) < new Date()) { setInvalid(true); setLoading(false); return; }

    const { data: pact } = await supabase.from('pacts').select('*').eq('id', invitation.pact_id).single();
    if (!pact) { setInvalid(true); setLoading(false); return; }

    const { data: inviter } = await supabase.from('profiles').select('*').eq('id', invitation.invited_by).single();
    const { data: members } = await supabase
      .from('pact_members')
      .select('*, profiles(*)')
      .eq('pact_id', pact.id)
      .eq('status', 'active');

    // Get user's coin balance if authenticated
    let userCoinBalance = 0;
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('coin_balance').eq('id', user.id).single();
      userCoinBalance = profile?.coin_balance ?? 0;
    }

    setInviteData({
      invitation,
      pact,
      inviter: inviter!,
      members: (members as (PactMember & { profiles: Profile })[]) ?? [],
      userCoinBalance,
    });
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (user && inviteData) {
      const isMember = inviteData.members.some((m) => m.user_id === user.id);
      setAlreadyMember(isMember);
    }
  }, [user, inviteData]);

  const handleAccept = async () => {
    if (!user) { router.push(`/login?next=/invite/${token}`); return; }
    if (!inviteData) return;

    // Check coin balance
    if (inviteData.userCoinBalance !== undefined && inviteData.userCoinBalance < inviteData.pact.stake_amount) {
      setInsufficientBalance(true);
      return;
    }

    setAccepting(true);

    try {
      const res = await fetch('/api/pacts/join-with-coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pact_id: inviteData.pact.id,
          invitation_id: inviteData.invitation.id,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setStep('success');
        setTimeout(() => {
          router.push(`/pacts/${inviteData.pact.id}/vetting`);
        }, 2000);
      } else {
        alert(data.error || 'Failed to join pact');
      }
    } catch (e) {
      console.error('Failed to join pact:', e);
      alert('Failed to join pact');
    } finally {
      setAccepting(false);
    }
  };


  const handleDecline = async () => {
    if (!inviteData) return;
    setDeclining(true);
    const supabase = createClient();
    await supabase.from('invitations').update({ status: 'declined' }).eq('id', inviteData.invitation.id);
    setStep('declined');
    setDeclining(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F5F7F0] flex items-center justify-center">
        <div className="skeleton w-80 h-64 rounded-[20px]" />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-[#F5F7F0] flex items-center justify-center p-4">
        <Card className="max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-full bg-[#FDF0EC] flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-[#E07A5F]" />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold mb-2">Invalid Invitation</h2>
          <p className="text-sm text-[#5C6B5E] mb-4">This invite link has expired or is no longer valid. Contact the pact creator for a new invite.</p>
          <Button onClick={() => router.push('/')} variant="secondary" className="w-full">Go to Homepage</Button>
        </Card>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-[#F5F7F0] flex items-center justify-center p-4">
        <Card className="max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-full bg-[#D8EDDA] flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={24} className="text-[#2D6A4F]" />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold mb-2">Welcome to the Pact!</h2>
          <p className="text-sm text-[#5C6B5E]">Stake locked. Redirecting to vetting phase...</p>
        </Card>
      </div>
    );
  }

  if (step === 'declined') {
    return (
      <div className="min-h-screen bg-[#F5F7F0] flex items-center justify-center p-4">
        <Card className="max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-full bg-[#EEF5EE] flex items-center justify-center mx-auto mb-4">
            <Clock size={24} className="text-[#5C6B5E]" />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold mb-2">Invitation Declined</h2>
          <p className="text-sm text-[#5C6B5E] mb-4">You've declined this pact invitation.</p>
          <Button onClick={() => router.push('/marketplace')} variant="secondary" className="w-full">Browse Pacts</Button>
        </Card>
      </div>
    );
  }

  const { pact, inviter, members } = inviteData!;

  return (
    <div className="min-h-screen bg-[#F5F7F0] flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">

        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 bg-[#1B4332] rounded-[12px] flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-[family-name:var(--font-display)] font-bold">P</span>
          </div>
          <p className="text-sm text-[#5C6B5E]">
            <span className="font-semibold text-[#1B1F1A]">{inviter?.full_name ?? inviter?.username}</span> invited you to join
          </p>
        </div>

        {/* Pact details */}
        <Card>
          <div className="space-y-4">
            {pact.category && <Badge variant="active">{pact.category}</Badge>}
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#1B1F1A]">{pact.name}</h1>
            {pact.mission && <p className="text-sm text-[#5C6B5E]">{pact.mission}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#F5F7F0] rounded-[12px] p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign size={14} className="text-[#2D6A4F]" />
                  <span className="text-xs text-[#5C6B5E] font-medium">Stake Required</span>
                </div>
                <p className="font-[family-name:var(--font-display)] font-bold text-[#1B4332] text-lg">{formatCurrency(pact.stake_amount)}</p>
              </div>
              <div className="bg-[#F5F7F0] rounded-[12px] p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Calendar size={14} className="text-[#2D6A4F]" />
                  <span className="text-xs text-[#5C6B5E] font-medium">Duration</span>
                </div>
                <p className="font-semibold text-[#1B1F1A] text-sm">{pact.sprint_duration_days} days</p>
              </div>
            </div>

            {/* Members already in */}
            {members.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Users size={14} className="text-[#5C6B5E]" />
                  <span className="text-xs text-[#5C6B5E] font-medium">{members.length} member{members.length !== 1 ? 's' : ''} already in</span>
                </div>
                <div className="flex -space-x-2">
                  {members.slice(0, 5).map((m) => (
                    <Avatar key={m.id} src={m.profiles?.avatar_url} name={m.profiles?.full_name ?? m.profiles?.username} size="sm" />
                  ))}
                  {members.length > 5 && (
                    <div className="w-8 h-8 rounded-full bg-[#D8EDDA] border-2 border-[#74C69D] flex items-center justify-center">
                      <span className="text-[10px] font-bold text-[#2D6A4F]">+{members.length - 5}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Payment / Actions */}
        {step === 'details' && (
          <Card>
            {alreadyMember ? (
              <div className="text-center space-y-3">
                <CheckCircle2 size={32} className="text-[#2D6A4F] mx-auto" />
                <p className="font-semibold text-[#1B1F1A]">You&apos;re already in this pact!</p>
                <Button onClick={() => router.push(`/pacts/${pact.id}`)} className="w-full">Go to Pact</Button>
              </div>
            ) : (
              <div className="space-y-4">
                {insufficientBalance && (
                  <div className="bg-[#FDF0EC] border border-[#F0C4B8] rounded-[10px] p-3">
                    <p className="text-xs text-[#E07A5F]">Insufficient p-coins balance. You need {formatCurrency(pact.stake_amount)} but have {formatCurrency(inviteData?.userCoinBalance ?? 0)}.</p>
                  </div>
                )}
                <div className="bg-[#D8EDDA] rounded-[12px] p-3 text-center">
                  <p className="text-xs text-[#2D6A4F] mb-1">Your p-coins balance</p>
                  <p className="font-[family-name:var(--font-display)] font-bold text-[#1B4332] text-2xl">{formatCurrency(inviteData?.userCoinBalance ?? 0)}</p>
                </div>
                <div className="bg-[#F5F7F0] rounded-[12px] p-3 text-center">
                  <p className="text-xs text-[#5C6B5E] mb-1">Stake required</p>
                  <p className="font-[family-name:var(--font-display)] font-bold text-[#1B4332] text-2xl">{formatCurrency(pact.stake_amount)}</p>
                </div>
                <Button onClick={handleAccept} loading={accepting} className="w-full">
                  Accept & Stake {formatCurrency(pact.stake_amount)}
                </Button>
                <Button onClick={handleDecline} loading={declining} variant="danger" className="w-full">
                  Decline Invitation
                </Button>
                <p className="text-xs text-center text-[#8FA38F]">
                  By accepting, your p-coins will be locked in escrow for the duration of the sprint.
                </p>
              </div>
            )}
          </Card>
        )}


      </div>
    </div>
  );
}
