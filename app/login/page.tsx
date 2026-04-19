'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

// ── Zod schemas ────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30)
    .regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers and underscores'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;
type SignupForm = z.infer<typeof signupSchema>;

// ── Left panel stat ────────────────────────────────────────────────────────────
const PANEL_STATS = [
  { value: '71%', label: 'Success rate across pacts' },
  { value: '₹2,34,500', label: 'Total stakes locked right now' },
  { value: '183', label: 'Goals completed this month' },
];

function AuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('next') ?? '/lobby';

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [serverError, setServerError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  // ── Login form ─────────────────────────────────────────────────────────────
  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // ── Signup form ────────────────────────────────────────────────────────────
  const signupForm = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { full_name: '', username: '', email: '', password: '' },
  });

  const isLoginSubmitting = loginForm.formState.isSubmitting;
  const isSignupSubmitting = signupForm.formState.isSubmitting;

  // ── Google OAuth ───────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setGoogleLoading(true);
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });
    if (error) {
      setServerError(error.message);
      setGoogleLoading(false);
    }
    // On success, Supabase will navigate to the OAuth provider — no local redirect needed.
  };

  // ── Email login ────────────────────────────────────────────────────────────
  const handleLogin = async (data: LoginForm) => {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    router.push(redirectTo);
  };

  // ── Email signup ───────────────────────────────────────────────────────────
  const handleSignup = async (data: SignupForm) => {
    setServerError(null);
    const supabase = createClient();

    // Check if username is taken
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', data.username)
      .maybeSingle();

    if (existing) {
      signupForm.setError('username', { message: 'Username is already taken' });
      return;
    }

    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.full_name,
          username: data.username,
        },
        // Supabase will append token_hash & type to this URL in the confirmation email
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent('/lobby')}`,
      },
    });

    if (error) {
      setServerError(error.message);
      return;
    }

    if (authData.user) {
      // Check if a profile already exists (trigger may have created one)
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (!profile) {
        await supabase.from('profiles').insert({
          id: authData.user.id,
          username: data.username,
          full_name: data.full_name,
        });
      }

      router.push('/profile/me?setup=1');
    }
  };

  // ── Shared input classes ───────────────────────────────────────────────────
  const inputClass =
    'w-full border border-[#E0EBE1] rounded-[10px] px-4 py-3 text-sm text-[#1B1F1A] bg-white focus:outline-none focus:border-[#2D6A4F] focus:ring-[3px] focus:ring-[rgba(45,106,79,0.12)] placeholder:text-[#8FA38F] transition-all';

  const labelClass = 'block text-xs font-semibold text-[#5C6B5E] uppercase tracking-wide mb-1.5';
  const errorClass = 'text-[#E07A5F] text-xs mt-1';

  return (
    <div className="min-h-screen flex" style={{ fontFamily: 'var(--font-body)' }}>
      {/* ── LEFT PANEL (desktop only) ────────────────────────────────────────── */}
      <div className="hidden md:flex w-[420px] xl:w-[480px] flex-shrink-0 bg-[#D8EDDA] flex-col justify-between p-10 relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-[#74C69D] opacity-30 rounded-full pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-[#2D6A4F] opacity-10 rounded-full pointer-events-none" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1B4332] rounded-[12px] flex items-center justify-center">
            <span
              className="text-white font-bold text-lg"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              P
            </span>
          </div>
          <span
            className="text-[#1B4332] font-bold text-2xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Pact
          </span>
        </div>

        {/* Quote */}
        <div className="relative">
          <blockquote
            className="text-3xl font-bold text-[#1B4332] leading-tight mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            "The best accountability partner is one that costs you money."
          </blockquote>
          <p className="text-[#5C6B5E] text-sm">— Every successful Pact member, ever</p>
        </div>

        {/* Stats */}
        <div className="relative grid grid-cols-1 gap-4">
          {PANEL_STATS.map(({ value, label }) => (
            <div key={label} className="bg-white/70 backdrop-blur-sm rounded-[14px] p-4 border border-[#E0EBE1]">
              <p
                className="text-2xl font-bold text-[#1B4332]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {value}
              </p>
              <p className="text-[#5C6B5E] text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL – Auth form ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-12 bg-[#F5F7F0]">
        {/* Mobile logo */}
        <div className="flex md:hidden items-center gap-2 mb-8">
          <div className="w-9 h-9 bg-[#1B4332] rounded-[10px] flex items-center justify-center">
            <span
              className="text-white font-bold text-base"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              P
            </span>
          </div>
          <span
            className="text-[#1B4332] font-bold text-xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Pact
          </span>
        </div>

        <div className="w-full max-w-md page-enter">
          {/* Heading */}
          <div className="mb-8">
            <h1
              className="text-3xl font-bold text-[#1B1F1A] mb-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-[#5C6B5E] text-sm">
              {mode === 'login'
                ? 'Sign in to continue to your pacts.'
                : 'Start your accountability journey today.'}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-white border border-[#E0EBE1] rounded-[12px] p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setServerError(null); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-[10px] transition-all ${
                mode === 'login'
                  ? 'bg-[#1B4332] text-white shadow-sm'
                  : 'text-[#5C6B5E] hover:text-[#1B1F1A]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setServerError(null); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-[10px] transition-all ${
                mode === 'signup'
                  ? 'bg-[#1B4332] text-white shadow-sm'
                  : 'text-[#5C6B5E] hover:text-[#1B1F1A]'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-[#E0EBE1] text-[#1B1F1A] rounded-[12px] px-4 py-3 text-sm font-semibold hover:bg-[#F5F7F0] transition-colors disabled:opacity-60 mb-5"
          >
            {googleLoading ? (
              <svg className="animate-spin h-4 w-4 text-[#2D6A4F]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              /* Google G icon */
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
            )}
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-[#E0EBE1]" />
            <span className="text-xs text-[#8FA38F] font-medium">OR</span>
            <div className="flex-1 h-px bg-[#E0EBE1]" />
          </div>

          {/* Server error */}
          {serverError && (
            <div className="bg-[#FDF0EC] border border-[#F0C4B8] rounded-[10px] px-4 py-3 mb-4">
              <p className="text-[#E07A5F] text-sm">{serverError}</p>
            </div>
          )}

          {/* ── LOGIN FORM ──────────────────────────────────────────────────── */}
          {mode === 'login' && (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4" noValidate>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  {...loginForm.register('email')}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={inputClass}
                />
                {loginForm.formState.errors.email && (
                  <p className={errorClass}>{loginForm.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Password</label>
                <input
                  {...loginForm.register('password')}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={inputClass}
                />
                {loginForm.formState.errors.password && (
                  <p className={errorClass}>{loginForm.formState.errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoginSubmitting}
                className="w-full bg-[#1B4332] text-white rounded-[12px] px-6 py-3 font-semibold text-sm hover:bg-[#2D6A4F] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {isLoginSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Signing in…
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          )}

          {/* ── SIGNUP FORM ─────────────────────────────────────────────────── */}
          {mode === 'signup' && (
            <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4" noValidate>
              <div>
                <label className={labelClass}>Full Name</label>
                <input
                  {...signupForm.register('full_name')}
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Doe"
                  className={inputClass}
                />
                {signupForm.formState.errors.full_name && (
                  <p className={errorClass}>{signupForm.formState.errors.full_name.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Username</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8FA38F] text-sm">@</span>
                  <input
                    {...signupForm.register('username')}
                    type="text"
                    autoComplete="username"
                    placeholder="janedoe"
                    className={`${inputClass} pl-7`}
                  />
                </div>
                {signupForm.formState.errors.username && (
                  <p className={errorClass}>{signupForm.formState.errors.username.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Email</label>
                <input
                  {...signupForm.register('email')}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={inputClass}
                />
                {signupForm.formState.errors.email && (
                  <p className={errorClass}>{signupForm.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Password</label>
                <input
                  {...signupForm.register('password')}
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className={inputClass}
                />
                {signupForm.formState.errors.password && (
                  <p className={errorClass}>{signupForm.formState.errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSignupSubmitting}
                className="w-full bg-[#1B4332] text-white rounded-[12px] px-6 py-3 font-semibold text-sm hover:bg-[#2D6A4F] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {isSignupSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Creating account…
                  </>
                ) : (
                  'Create Account'
                )}
              </button>

              <p className="text-[#8FA38F] text-xs text-center pt-1">
                By signing up you agree to our{' '}
                <Link href="/terms" className="text-[#2D6A4F] underline underline-offset-2">
                  Terms
                </Link>{' '}
                &{' '}
                <Link href="/privacy" className="text-[#2D6A4F] underline underline-offset-2">
                  Privacy Policy
                </Link>
                .
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F7F0]" />}>
      <AuthPageInner />
    </Suspense>
  );
}
