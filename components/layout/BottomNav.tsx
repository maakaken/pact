'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Target, Lock, Vote, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  vettingBadge?: number;
  lockerBadge?: number;
  verdictBadge?: number;
}

export default function BottomNav({ vettingBadge = 0, lockerBadge = 0, verdictBadge = 0 }: BottomNavProps) {
  const pathname = usePathname();

  const tabs = [
    { href: '/lobby', icon: Home, label: 'Lobby' },
    { href: '/pacts', icon: Target, label: 'Vetting', badge: vettingBadge, sub: 'vetting' },
    { href: '/pacts', icon: Lock, label: 'Locker', badge: lockerBadge, sub: 'locker' },
    { href: '/pacts', icon: Vote, label: 'Verdict', badge: verdictBadge, sub: 'verdict' },
    { href: '/profile/me', icon: User, label: 'Profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E0EBE1] z-40 md:hidden">
      <div className="flex items-center justify-around py-2">
        {tabs.map(({ href, icon: Icon, label, badge }) => {
          const active = pathname === href || (href !== '/pacts' && pathname.startsWith(href));
          return (
            <Link
              key={label}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1 rounded-[8px] transition-all relative',
                active ? 'text-[#1B4332]' : 'text-[#8FA38F]'
              )}
            >
              <div className="relative">
                <Icon size={20} />
                {badge !== undefined && badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#E07A5F] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
