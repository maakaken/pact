'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Shield, DollarSign, User, Store, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotificationContext } from '@/contexts/NotificationContext';

export default function BottomNav() {
  const pathname = usePathname();
  const { unreadCount } = useNotificationContext();

  const tabs = [
    { href: '/lobby', icon: Home, label: 'Lobby' },
    { href: '/pacts', icon: Shield, label: 'My Pacts' },
    { href: '/marketplace', icon: Store, label: 'Marketplace' },
    { href: '/stakes', icon: DollarSign, label: 'My Stakes' },
    { href: '/notifications', icon: Bell, label: 'Notifications', badge: unreadCount },
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
