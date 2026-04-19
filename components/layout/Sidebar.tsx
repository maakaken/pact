'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Store, DollarSign, Bell, User, ChevronDown, LogOut, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import { useNotifications } from '@/hooks/useNotifications';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activePacts?: { id: string; name: string }[];
}

export default function Sidebar({ activePacts = [] }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile } = useUser();
  const { unreadCount } = useNotifications(user?.id);
  const [pactsOpen, setPactsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  const navItem = (href: string, icon: React.ReactNode, label: string, badge?: number) => (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all',
        isActive(href)
          ? 'bg-[#D8EDDA] text-[#1B4332]'
          : 'text-[#5C6B5E] hover:bg-[#EEF5EE] hover:text-[#1B1F1A]'
      )}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto bg-[#E07A5F] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  );

  const signOut = async () => {
    try {
      setSigningOut(true);
      const supabase = createClient();
      
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut({ scope: 'local' });

      if (error) {
        console.error('Sign out error:', error);
        setSigningOut(false);
        alert('Sign out failed. Please try again.');
        return;
      }

      // Force redirect after sign out
      await new Promise((resolve) => setTimeout(resolve, 100));
      window.location.href = '/login';
    } catch (err) {
      console.error('Sign out exception:', err);
      setSigningOut(false);
      alert('Sign out failed. Please try again.');
    }
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-[#E0EBE1] flex flex-col z-40 hidden md:flex">
      {/* Logo */}
      <div className="p-5 border-b border-[#E0EBE1]">
        <Link href="/lobby" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#1B4332] rounded-[10px] flex items-center justify-center">
            <span className="text-white font-display font-bold text-sm">P</span>
          </div>
          <span className="font-display font-bold text-[#1B4332] text-xl">Pact</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItem('/lobby', <Home size={18} />, 'Lobby')}

        {/* My Pacts collapsible */}
        <div>
          <button
            onClick={() => setPactsOpen(!pactsOpen)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all',
              pathname.includes('/pacts/')
                ? 'bg-[#D8EDDA] text-[#1B4332]'
                : 'text-[#5C6B5E] hover:bg-[#EEF5EE] hover:text-[#1B1F1A]'
            )}
          >
            <Shield size={18} />
            <span>My Pacts</span>
            <ChevronDown
              size={14}
              className={cn('ml-auto transition-transform', pactsOpen && 'rotate-180')}
            />
          </button>
          {pactsOpen && activePacts.length > 0 && (
            <div className="ml-7 mt-1 space-y-0.5">
              {activePacts.map((p) => (
                <Link
                  key={p.id}
                  href={`/pacts/${p.id}`}
                  className={cn(
                    'block px-3 py-2 rounded-[8px] text-xs font-medium transition-all truncate',
                    pathname === `/pacts/${p.id}`
                      ? 'bg-[#D8EDDA] text-[#1B4332]'
                      : 'text-[#5C6B5E] hover:bg-[#EEF5EE]'
                  )}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          )}
          {pactsOpen && activePacts.length === 0 && (
            <p className="ml-7 mt-1 text-xs text-[#8FA38F] px-3 py-1">No active pacts</p>
          )}
        </div>

        {navItem('/marketplace', <Store size={18} />, 'Marketplace')}
        {navItem('/stakes', <DollarSign size={18} />, 'My Stakes')}
        {navItem('/notifications', <Bell size={18} />, 'Notifications', unreadCount)}
        {navItem('/profile/me', <User size={18} />, 'Profile')}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[#E0EBE1] space-y-2">
        {profile && (
          <Link href="/profile/me" className="flex items-center gap-3 px-3 py-2 rounded-[10px] hover:bg-[#EEF5EE] transition-all">
            <Avatar src={profile.avatar_url} name={profile.full_name ?? profile.username} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#1B1F1A] truncate">{profile.full_name ?? profile.username}</p>
              <p className="text-xs text-[#8FA38F]">Score: {profile.integrity_score}</p>
            </div>
          </Link>
        )}
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm text-[#5C6B5E] hover:bg-[#EEF5EE] hover:text-[#E07A5F] transition-all disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogOut size={18} />
          <span>{signingOut ? 'Signing Out…' : 'Sign Out'}</span>
        </button>
      </div>
    </aside>
  );
}
