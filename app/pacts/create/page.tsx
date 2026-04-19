'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { createClient } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Chip from '@/components/ui/Chip';
import ProgressBar from '@/components/ui/ProgressBar';
import Avatar from '@/components/ui/Avatar';
import { toast } from 'sonner';
import { cn, getInitials } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
type SprintType = 'weekly' | 'monthly' | 'custom';
type Visibility = 'private' | 'public';
type Category = 'Coding' | 'Fitness' | 'Learning' | 'Finance' | 'Wellness' | 'Creative' | 'Other';

interface WizardFormValues {
  name: string;
  mission: string;
  category: Category;
  sprintType: SprintType;
  customDays: string;
  visibility: Visibility;
  openToMarketplace: boolean;
  maxMembers: number;
  stakeAmount: string;
}

const CATEGORIES: Category[] = ['Coding', 'Fitness', 'Learning', 'Finance', 'Wellness', 'Creative', 'Other'];
const STEPS = ['The Pact', 'Add Members', 'The Stake', 'Review & Launch'];

// ── Step progress indicator ────────────────────────────────────────────────────
function StepProgress({ step }: { step: number }) {
  const pct = Math.round(((step) / STEPS.length) * 100);
  return (
    <div className="space-y-3 mb-8">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#5C6B5E] uppercase tracking-wider">
          Step {step} of {STEPS.length}
        </span>
        <span className="text-xs font-semibold text-[#1B4332]">{STEPS[step - 1]}</span>
      </div>
      <ProgressBar value={pct} />
      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              'flex-1 h-1 rounded-full transition-all duration-300',
              i < step ? 'bg-[#1B4332]' : 'bg-[#E0EBE1]'
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ── Toggle button pair ─────────────────────────────────────────────────────────
function TogglePair<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'px-4 py-2 rounded-[10px] text-sm font-semibold border transition-all',
            value === o.value
              ? 'bg-[#1B4332] text-white border-[#1B4332]'
              : 'bg-white text-[#5C6B5E] border-[#E0EBE1] hover:border-[#2D6A4F] hover:text-[#1B4332]'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CreatePactPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    control,
    watch,
    getValues,
    formState: { errors },
    trigger,
  } = useForm<WizardFormValues>({
    defaultValues: {
      name: '',
      mission: '',
      category: 'Coding',
      sprintType: 'weekly',
      customDays: '14',
      visibility: 'private',
      openToMarketplace: false,
      maxMembers: 6,
      stakeAmount: '500',
    },
  });

  const sprintType = watch('sprintType');
  const visibility = watch('visibility');
  const maxMembers = watch('maxMembers');
  const stakeAmount = watch('stakeAmount');
  const pactName = watch('name');
  const mission = watch('mission');
  const category = watch('category');
  const customDays = watch('customDays');

  // Auth guard — runs after first render, never blocks initial paint
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      if (!session) router.replace('/login');
    });
  }, [router]);

  // ── Email helpers ──────────────────────────────────────────────────────────
  const addEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!isValid) { setEmailError('Enter a valid email address'); return; }
    if (inviteEmails.includes(trimmed)) { setEmailError('Email already added'); return; }
    setInviteEmails((prev) => [...prev, trimmed]);
    setEmailInput('');
    setEmailError('');
  };

  const removeEmail = (email: string) => {
    setInviteEmails((prev) => prev.filter((e) => e !== email));
  };

  // ── Step navigation ────────────────────────────────────────────────────────
  const next = async () => {
    let valid = true;
    if (step === 1) {
      valid = await trigger(['name', 'category']);
    }
    if (step === 3) {
      valid = await trigger(['stakeAmount']);
    }
    if (valid) setStep((s) => Math.min(s + 1, 4));
  };

  const back = () => setStep((s) => Math.max(s - 1, 1));

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleLaunch = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in');
        setSubmitting(false);
        router.replace('/login');
        return;
      }

      const vals = getValues();
      const sprintDays =
        vals.sprintType === 'weekly' ? 7
        : vals.sprintType === 'monthly' ? 30
        : parseInt(vals.customDays, 10) || 14;

      const payload = {
        name: vals.name,
        mission: vals.mission || undefined,
        category: vals.category,
        is_public: vals.visibility === 'public',
        sprint_type: vals.sprintType,
        sprint_duration_days: sprintDays,
        stake_amount: parseFloat(vals.stakeAmount) || 500,
        max_members: vals.maxMembers,
        created_by: user.id,
      };

      // ── Step 1: Create the pact ──────────────────────────────────────────
      const res = await fetch('/api/pacts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let json: { pactId?: string; error?: string };
      try {
        json = await res.json();
      } catch {
        toast.error('Server returned an unexpected response. Check Vercel logs.');
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        toast.error(json.error || `Failed to create pact (${res.status})`);
        setSubmitting(false);
        return;
      }

      const pactId = json.pactId;
      if (!pactId) {
        toast.error('Pact created but no ID returned — check Supabase env vars in Vercel.');
        setSubmitting(false);
        return;
      }

      // ── Step 2: Send invitations if any emails were added ────────────────
      if (inviteEmails.length > 0) {
        try {
          const invRes = await fetch('/api/invitations/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pact_id: pactId,
              emails: inviteEmails,
              invited_by: user.id,
            }),
          });

          if (!invRes.ok) {
            const invJson = await invRes.json().catch(() => ({}));
            // Pact was created — don't block navigation, just warn
            toast.warning(`Pact created! But invitations failed: ${invJson.error || invRes.status}`);
          } else {
            toast.success(`Pact created & ${inviteEmails.length} invitation${inviteEmails.length > 1 ? 's' : ''} sent!`);
          }
        } catch {
          toast.warning('Pact created, but could not send invitations.');
        }
      } else {
        toast.success('Pact created!');
      }

      // ── Step 3: Navigate to the new pact ────────────────────────────────
      router.push(`/pacts/${pactId}`);

    } catch (err) {
      console.error('[launch] Error:', err);
      toast.error(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const sprintDaysDisplay =
    sprintType === 'weekly' ? 7 : sprintType === 'monthly' ? 30 : parseInt(customDays, 10) || 14;

  // ── Render steps ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar />
      <main className="md:ml-64 pb-24 md:pb-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 md:py-10">
          {/* Back to lobby */}
          <button
            type="button"
            onClick={() => router.push('/lobby')}
            className="flex items-center gap-1.5 text-[#5C6B5E] text-sm mb-6 hover:text-[#1B1F1A] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>

          {/* Header */}
          <div className="mb-6">
            <h1
              className="text-2xl md:text-3xl font-bold text-[#1B1F1A] mb-1"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Create a Pact
            </h1>
            <p className="text-[#5C6B5E] text-sm">Set up your accountability group in a few steps.</p>
          </div>

          <StepProgress step={step} />

          {/* ── STEP 1: The Pact ────────────────────────────────────────────── */}
          {step === 1 && (
            <Card className="space-y-6">
              <div>
                <Input
                  id="name"
                  label="Pact Name *"
                  placeholder="e.g. 30-Day Coding Sprint"
                  error={errors.name?.message}
                  {...register('name', { required: 'Pact name is required' })}
                />
              </div>

              <div>
                <Textarea
                  id="mission"
                  label="Mission Statement"
                  placeholder="What is this pact trying to achieve? What's the shared purpose?"
                  rows={3}
                  {...register('mission')}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#1B1F1A] block mb-2">Category *</label>
                <Controller
                  control={control}
                  name="category"
                  rules={{ required: true }}
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => field.onChange(cat)}
                          className={cn(
                            'px-4 py-2 rounded-[10px] text-sm font-medium border transition-all',
                            field.value === cat
                              ? 'bg-[#1B4332] text-white border-[#1B4332]'
                              : 'bg-white text-[#5C6B5E] border-[#E0EBE1] hover:border-[#2D6A4F]'
                          )}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#1B1F1A] block mb-2">Sprint Type</label>
                <Controller
                  control={control}
                  name="sprintType"
                  render={({ field }) => (
                    <TogglePair
                      options={[
                        { value: 'weekly', label: 'Weekly (7 days)' },
                        { value: 'monthly', label: 'Monthly (30 days)' },
                        { value: 'custom', label: 'Custom' },
                      ]}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                {sprintType === 'custom' && (
                  <div className="mt-3 max-w-[160px]">
                    <Input
                      label="Duration (days)"
                      type="number"
                      min={1}
                      placeholder="e.g. 21"
                      {...register('customDays', {
                        min: { value: 1, message: 'Min 1 day' },
                      })}
                      error={errors.customDays?.message}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-[#1B1F1A] block mb-2">Visibility</label>
                <Controller
                  control={control}
                  name="visibility"
                  render={({ field }) => (
                    <TogglePair
                      options={[
                        { value: 'private', label: 'Private' },
                        { value: 'public', label: 'Public' },
                      ]}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                  <div
                    className={cn(
                      'rounded-[12px] border p-3 transition-all',
                      visibility === 'private'
                        ? 'border-[#1B4332] bg-[#F0FAF2]'
                        : 'border-[#E0EBE1] bg-[#FAFAFA]'
                    )}
                  >
                    <p className="text-xs font-semibold text-[#1B1F1A] mb-1">Private (Invite-only)</p>
                    <p className="text-xs text-[#5C6B5E]">Only people you invite can join. Not listed anywhere publicly.</p>
                  </div>
                  <div
                    className={cn(
                      'rounded-[12px] border p-3 transition-all',
                      visibility === 'public'
                        ? 'border-[#1B4332] bg-[#F0FAF2]'
                        : 'border-[#E0EBE1] bg-[#FAFAFA]'
                    )}
                  >
                    <p className="text-xs font-semibold text-[#1B1F1A] mb-1">Public (Marketplace)</p>
                    <p className="text-xs text-[#5C6B5E]">Anyone can discover and apply to join via the Marketplace.</p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* ── STEP 2: Add Members ─────────────────────────────────────────── */}
          {step === 2 && (
            <Card className="space-y-6">
              <div>
                <label className="text-sm font-medium text-[#1B1F1A] block mb-2">Invite by Email</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => { setEmailInput(e.target.value); setEmailError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                    placeholder="member@example.com"
                    className={cn(
                      'flex-1 rounded-[10px] border border-[#E0EBE1] px-4 py-3 text-sm text-[#1B1F1A]',
                      'bg-white placeholder:text-[#8FA38F]',
                      'focus:outline-none focus:border-[#2D6A4F] focus:ring-3 focus:ring-[rgba(45,106,79,0.12)]',
                      'transition-all duration-150',
                      emailError && 'border-[#E07A5F]'
                    )}
                  />
                  <Button type="button" onClick={addEmail} size="sm">
                    Add
                  </Button>
                </div>
                {emailError && <p className="text-xs text-[#E07A5F] mt-1">{emailError}</p>}

                {inviteEmails.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {inviteEmails.map((email) => (
                      <Chip
                        key={email}
                        label={email}
                        onRemove={() => removeEmail(email)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Preview avatars */}
              {inviteEmails.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-[#1B1F1A] block mb-3">Invited Members Preview</label>
                  <div className="flex flex-wrap gap-3">
                    {inviteEmails.map((email) => (
                      <div key={email} className="flex flex-col items-center gap-1.5">
                        <Avatar name={email} size="md" />
                        <span className="text-[10px] text-[#5C6B5E] max-w-[64px] truncate text-center">{email.split('@')[0]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Marketplace open toggle */}
              {visibility === 'public' && (
                <Controller
                  control={control}
                  name="openToMarketplace"
                  render={({ field }) => (
                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-[12px] border border-[#E0EBE1] bg-[#FAFAFA] hover:bg-[#F0FAF2] transition-all">
                      <div className="relative mt-0.5">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={field.value}
                          onChange={field.onChange}
                        />
                        <div className={cn(
                          'w-10 h-5 rounded-full transition-all',
                          field.value ? 'bg-[#1B4332]' : 'bg-[#D0D7CF]'
                        )}>
                          <div className={cn(
                            'w-4 h-4 bg-white rounded-full shadow absolute top-0.5 transition-all',
                            field.value ? 'left-5' : 'left-0.5'
                          )} />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1B1F1A]">Open to Marketplace Applications</p>
                        <p className="text-xs text-[#5C6B5E] mt-0.5">Allow anyone browsing the Marketplace to apply to join this pact.</p>
                      </div>
                    </label>
                  )}
                />
              )}

              {/* Max members */}
              <div>
                <label className="text-sm font-medium text-[#1B1F1A] block mb-1">
                  Max Members: <span className="text-[#1B4332] font-bold">{maxMembers}</span>
                </label>
                <p className="text-xs text-[#8FA38F] mb-3">You can have between 2 and 20 members.</p>
                <Controller
                  control={control}
                  name="maxMembers"
                  render={({ field }) => (
                    <input
                      type="range"
                      min={2}
                      max={20}
                      step={1}
                      value={field.value}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                      className="w-full accent-[#1B4332]"
                    />
                  )}
                />
                <div className="flex justify-between text-xs text-[#8FA38F] mt-1">
                  <span>2</span>
                  <span>20</span>
                </div>
              </div>
            </Card>
          )}

          {/* ── STEP 3: The Stake ───────────────────────────────────────────── */}
          {step === 3 && (
            <Card className="space-y-6">
              <div>
                <Input
                  id="stakeAmount"
                  label="Stake Amount per Member"
                  type="number"
                  min={100}
                  prefix="₹"
                  placeholder="500"
                  error={errors.stakeAmount?.message}
                  {...register('stakeAmount', {
                    required: 'Stake amount is required',
                    min: { value: 100, message: 'Minimum stake is ₹100' },
                  })}
                />
                {stakeAmount && parseFloat(stakeAmount) >= 100 && (
                  <p className="text-sm text-[#5C6B5E] mt-2">
                    Each member pays <span className="font-semibold text-[#1B4332]">₹{parseFloat(stakeAmount).toLocaleString('en-IN')}</span> when accepting their invite.
                  </p>
                )}
              </div>

              {/* Platform fee explainer */}
              <div className="bg-[#FEF3E2] border border-[#F5DDB8] rounded-[12px] p-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">💡</span>
                  <div>
                    <p className="text-sm font-semibold text-[#B5540A] mb-1">Platform Fee — 5%</p>
                    <p className="text-sm text-[#92440E]">
                      A 5% platform fee is deducted from <strong>failed stakes only</strong>. If you complete your goal, you get your full stake back. Winners pay nothing extra.
                    </p>
                  </div>
                </div>
              </div>

              {/* No payment now note */}
              <div className="bg-[#D8EDDA] border border-[#B4D9BB] rounded-[12px] p-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">🔒</span>
                  <div>
                    <p className="text-sm font-semibold text-[#1B4332] mb-1">No Payment Right Now</p>
                    <p className="text-sm text-[#2D6A4F]">
                      Stake payment happens when each member accepts their invitation. You don&apos;t pay anything now.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* ── STEP 4: Review & Launch ─────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              <Card className="space-y-5">
                <h2
                  className="text-lg font-bold text-[#1B1F1A]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Review Your Pact
                </h2>

                {/* Name & Category */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-[#F5F7F0] rounded-[12px] p-4">
                    <p className="text-[11px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Pact Name</p>
                    <p className="text-sm font-semibold text-[#1B1F1A]">{pactName || '—'}</p>
                  </div>
                  <div className="bg-[#F5F7F0] rounded-[12px] p-4">
                    <p className="text-[11px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Category</p>
                    <p className="text-sm font-semibold text-[#1B1F1A]">{category}</p>
                  </div>
                </div>

                {/* Mission */}
                {mission && (
                  <div className="bg-[#F5F7F0] rounded-[12px] p-4">
                    <p className="text-[11px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Mission</p>
                    <p className="text-sm text-[#1B1F1A]">{mission}</p>
                  </div>
                )}

                {/* Sprint / visibility / stake row */}
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="bg-[#F5F7F0] rounded-[12px] p-4">
                    <p className="text-[11px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Sprint</p>
                    <p className="text-sm font-semibold text-[#1B1F1A] capitalize">
                      {sprintType === 'custom' ? `${sprintDaysDisplay} days` : sprintType}
                    </p>
                  </div>
                  <div className="bg-[#F5F7F0] rounded-[12px] p-4">
                    <p className="text-[11px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Visibility</p>
                    <p className="text-sm font-semibold text-[#1B1F1A] capitalize">{visibility}</p>
                  </div>
                  <div className="bg-[#F5F7F0] rounded-[12px] p-4">
                    <p className="text-[11px] text-[#8FA38F] uppercase tracking-wider font-medium mb-1">Stake / Member</p>
                    <p className="text-sm font-semibold text-[#1B4332]">₹{parseFloat(stakeAmount || '0').toLocaleString('en-IN')}</p>
                  </div>
                </div>

                {/* Members */}
                <div className="bg-[#F5F7F0] rounded-[12px] p-4">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[11px] text-[#8FA38F] uppercase tracking-wider font-medium">Invited Members</p>
                    <span className="text-xs text-[#5C6B5E]">Max: {maxMembers}</span>
                  </div>
                  {inviteEmails.length === 0 ? (
                    <p className="text-xs text-[#8FA38F]">No members invited yet — you can invite after launch too.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {inviteEmails.map((email) => (
                        <div key={email} className="flex items-center gap-2 bg-white border border-[#E0EBE1] rounded-full px-3 py-1">
                          <Avatar name={email} size="xs" ring={false} />
                          <span className="text-xs text-[#1B1F1A]">{email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* Launch button */}
              <Button
                type="button"
                size="lg"
                className="w-full"
                loading={submitting}
                onClick={handleLaunch}
              >
                Launch Pact &amp; Send Invitations
              </Button>
            </div>
          )}

          {/* ── Navigation buttons ─────────────────────────────────────────── */}
          <div className={cn('flex mt-6', step > 1 ? 'justify-between' : 'justify-end')}>
            {step > 1 && (
              <Button type="button" variant="secondary" onClick={back}>
                Back
              </Button>
            )}
            {step < 4 && (
              <Button type="button" onClick={next}>
                Next
              </Button>
            )}
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
