'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/admin');
    } else {
      setError('Incorrect password.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F7F0] flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#1B4332] rounded-[16px] flex items-center justify-center mx-auto mb-4">
            <Lock size={24} className="text-white" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#1B1F1A]">Admin Access</h1>
          <p className="text-sm text-[#5C6B5E] mt-1">Enter the admin password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-[20px] border border-[#E0EBE1] p-6 shadow-[0_2px_16px_rgba(45,106,79,0.08)] space-y-4">
          <div>
            <label className="text-sm font-medium text-[#1B1F1A] block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              className="w-full rounded-[10px] border border-[#E0EBE1] px-4 py-3 text-sm text-[#1B1F1A] bg-white placeholder:text-[#8FA38F] focus:outline-none focus:border-[#2D6A4F] focus:ring-3 focus:ring-[rgba(45,106,79,0.12)] transition-all"
              required
              autoFocus
            />
            {error && <p className="text-xs text-[#E07A5F] mt-1">{error}</p>}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1B4332] text-white rounded-[12px] px-6 py-3 font-semibold text-sm hover:bg-[#2D6A4F] transition-all active:scale-[0.97] disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
