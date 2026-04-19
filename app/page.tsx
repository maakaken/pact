import Link from 'next/link';
import { PageClient } from './page-client';

// ── Hardcoded stats ────────────────────────────────────────────────────────────
const STATS = [
  { label: 'Active Pacts', value: '47' },
  { label: 'Stakes Locked', value: '₹2,34,500' },
  { label: 'Goals Completed', value: '183' },
  { label: 'Success Rate', value: '71%' },
];

const STEPS = [
  {
    num: '01',
    title: 'Create a Pact',
    desc: "Set your goal, duration, and how much you're willing to stake. Invite your accountability crew or join an existing group.",
  },
  {
    num: '02',
    title: 'Lock Your Stake',
    desc: 'Put real money behind your commitment. Stakes are held securely and only released when your group verifies your progress.',
  },
  {
    num: '03',
    title: 'Submit Proof',
    desc: 'Upload evidence of your progress each sprint — a screenshot, a photo, a link. Your pact members review it together.',
  },
  {
    num: '04',
    title: 'Earn or Lose',
    desc: 'Pass the vote and get your stake back (plus a share of those who failed). Fail and your stake is distributed to those who succeeded.',
  },
];

const WHY = [
  {
    icon: '💸',
    title: 'Financial Accountability',
    desc: 'Money is the most honest motivator. When your stake is on the line, skipping a workout or missing a deadline actually costs you.',
  },
  {
    icon: '👥',
    title: 'Peer Verification',
    desc: 'Your pact members vote on your proof — no gaming the system, no auto-passes. Real humans holding each other accountable.',
  },
  {
    icon: '🧑‍⚖️',
    title: 'Human Moderation',
    desc: 'Disputed verdicts and edge cases are handled by trained moderators, keeping the process fair and transparent for everyone.',
  },
];

export default function LandingPage() {
  return (
    <PageClient>
      <div className="min-h-screen bg-[#F5F7F0]" style={{ fontFamily: 'var(--font-body)' }}>
      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section className="relative bg-[#D8EDDA] overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#74C69D] opacity-20 rounded-full translate-x-1/3 -translate-y-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#2D6A4F] opacity-10 rounded-full -translate-x-1/3 translate-y-1/3 pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 lg:py-36">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left – copy */}
            <div className="page-enter">
              {/* Logo wordmark */}
              <div className="flex items-center gap-2 mb-8">
                <div className="w-9 h-9 bg-[#1B4332] rounded-[10px] flex items-center justify-center">
                  <span
                    className="text-white font-bold text-base"
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

              <h1
                className="text-5xl md:text-6xl lg:text-7xl font-bold text-[#1B4332] leading-[1.1] tracking-[-0.02em] mb-6"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Put Your Money Where Your Goals Are.
              </h1>

              <p className="text-lg md:text-xl text-[#5C6B5E] leading-relaxed mb-10 max-w-xl">
                Pact is the accountability platform where missing your goal costs you — and keeping
                it pays you. Real stakes. Real people. Real results.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/pacts/create"
                  className="inline-flex items-center justify-center bg-[#1B4332] text-white rounded-[12px] px-6 py-3 font-semibold text-sm hover:bg-[#2D6A4F] transition-colors"
                >
                  Start a Pact
                </Link>
                <Link
                  href="/marketplace"
                  className="inline-flex items-center justify-center bg-white border-2 border-[#2D6A4F] text-[#2D6A4F] rounded-[12px] px-6 py-3 font-semibold text-sm hover:bg-[#EEF5EE] transition-colors"
                >
                  Browse Groups
                </Link>
              </div>
            </div>

            {/* Right – floating pact card (CSS animation only — server component safe) */}
            <div className="hidden lg:flex justify-center items-center">
              <style>{`
                @keyframes heroFloat {
                  0%, 100% { transform: translateY(0px); }
                  50% { transform: translateY(-14px); }
                }
                .hero-float { animation: heroFloat 4s ease-in-out infinite; }
              `}</style>

              <div className="relative hero-float">
                {/* Pseudo card glow */}
                <div className="absolute inset-0 translate-y-3 translate-x-2 bg-[#74C69D] opacity-25 rounded-[20px]" />

                <div className="relative bg-white rounded-[20px] shadow-[0_2px_16px_rgba(45,106,79,0.12)] border border-[#E0EBE1] p-6 w-80">
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <span className="inline-flex items-center rounded-full bg-[#D8EDDA] px-3 py-0.5 text-xs font-semibold text-[#1B4332] mb-2">
                        Fitness
                      </span>
                      <h3
                        className="text-lg font-bold text-[#1B1F1A]"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        30-Day Morning Run Pact
                      </h3>
                    </div>
                  </div>

                  {/* Countdown */}
                  <div className="bg-[#F5F7F0] rounded-[12px] p-3 mb-4">
                    <p className="text-xs text-[#5C6B5E] mb-1">Sprint ends in</p>
                    <div
                      className="text-2xl font-bold text-[#1B4332]"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      06d 14h 22m
                    </div>
                  </div>

                  {/* Members */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex -space-x-2">
                      {['AR', 'KS', 'PM', 'VT'].map((init, i) => (
                        <div
                          key={init}
                          className="w-8 h-8 rounded-full bg-[#D8EDDA] border-2 border-white flex items-center justify-center text-[10px] font-bold text-[#2D6A4F]"
                          style={{ zIndex: 4 - i }}
                        >
                          {init}
                        </div>
                      ))}
                      <div
                        className="w-8 h-8 rounded-full bg-[#EEF5EE] border-2 border-white flex items-center justify-center text-[10px] font-bold text-[#5C6B5E]"
                        style={{ zIndex: 0 }}
                      >
                        +2
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-[#1B4332]">₹5,000 staked</span>
                  </div>

                  {/* CTA */}
                  <div className="w-full bg-[#1B4332] text-white text-sm font-semibold rounded-[12px] px-4 py-3 text-center">
                    Submit Proof →
                  </div>
                </div>

                {/* Second card peeking behind */}
                <div
                  className="absolute -bottom-4 -right-4 bg-white rounded-[20px] border border-[#E0EBE1] p-4 w-64 -z-10 opacity-70"
                  style={{ transform: 'rotate(4deg)' }}
                >
                  <span className="inline-flex items-center rounded-full bg-[#FEF3E2] px-2.5 py-0.5 text-[10px] font-semibold text-[#B5540A] mb-2">
                    Coding
                  </span>
                  <p
                    className="text-sm font-bold text-[#1B1F1A]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    Build in Public — Week 8
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LIVE STATS BAR ────────────────────────────────────────────────────── */}
      <section className="bg-[#1B4332] py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-0 md:divide-x md:divide-[#2D6A4F]">
            {STATS.map(({ label, value }) => (
              <div key={label} className="text-center px-4">
                <p
                  className="text-3xl md:text-4xl font-bold text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {value}
                </p>
                <p className="text-[#74C69D] text-sm mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-[#F5F7F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-[#2D6A4F] font-semibold text-sm uppercase tracking-widest mb-3">
              The Process
            </p>
            <h2
              className="text-4xl md:text-5xl font-bold text-[#1B1F1A]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              How It Works
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map(({ num, title, desc }) => (
              <div
                key={num}
                className="bg-white rounded-[20px] border border-[#E0EBE1] shadow-[0_2px_16px_rgba(45,106,79,0.08)] p-6 flex flex-col gap-4"
              >
                <div className="w-14 h-14 rounded-full bg-[#D8EDDA] flex items-center justify-center flex-shrink-0">
                  <span
                    className="text-xl font-bold text-[#1B4332]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {num}
                  </span>
                </div>
                <div>
                  <h3
                    className="text-lg font-bold text-[#1B1F1A] mb-2"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {title}
                  </h3>
                  <p className="text-[#5C6B5E] text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY PACT ──────────────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-[#D8EDDA]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-[#2D6A4F] font-semibold text-sm uppercase tracking-widest mb-3">
              Why Pact
            </p>
            <h2
              className="text-4xl md:text-5xl font-bold text-[#1B1F1A]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Built Different
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {WHY.map(({ icon, title, desc }) => (
              <div
                key={title}
                className="bg-white rounded-[20px] border border-[#E0EBE1] shadow-[0_2px_16px_rgba(45,106,79,0.08)] p-8"
              >
                <div className="text-4xl mb-4">{icon}</div>
                <h3
                  className="text-xl font-bold text-[#1B1F1A] mb-3"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {title}
                </h3>
                <p className="text-[#5C6B5E] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-[#1B4332]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2
            className="text-4xl md:text-5xl font-bold text-white mb-6"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Ready to commit?
          </h2>
          <p className="text-[#74C69D] text-lg mb-10">
            Join thousands who are finally following through — because the cost of not is real.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/pacts/create"
              className="inline-flex items-center justify-center bg-[#74C69D] text-[#1B4332] rounded-[12px] px-8 py-4 font-semibold text-base hover:bg-[#52B788] transition-colors"
            >
              Create Your First Pact
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center bg-transparent border-2 border-[#74C69D] text-[#74C69D] rounded-[12px] px-8 py-4 font-semibold text-base hover:bg-[#2D6A4F] transition-colors"
            >
              Browse Groups
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer className="bg-[#F5F7F0] border-t border-[#E0EBE1] py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-[#1B4332] rounded-[10px] flex items-center justify-center">
                  <span
                    className="text-white font-bold text-sm"
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
              <p className="text-[#5C6B5E] text-sm max-w-xs">
                The accountability platform where missing your goal costs you — and keeping it pays you.
              </p>
            </div>

            {/* Nav links */}
            <nav className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-2 text-sm">
              <Link href="/marketplace" className="text-[#5C6B5E] hover:text-[#1B4332] transition-colors">
                Marketplace
              </Link>
              <Link href="/login" className="text-[#5C6B5E] hover:text-[#1B4332] transition-colors">
                Login
              </Link>
              <Link href="/pacts/create" className="text-[#5C6B5E] hover:text-[#1B4332] transition-colors">
                Create Pact
              </Link>
            </nav>
          </div>

          <div className="mt-8 pt-6 border-t border-[#E0EBE1] text-center">
            <p className="text-[#8FA38F] text-xs">
              © {new Date().getFullYear()} Pact. All rights reserved. — Prototype v0.1
            </p>
          </div>
        </div>
      </footer>
      </div>
    </PageClient>
  );
}
