'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useNotifications } from '@/hooks/useNotifications';
import { useUser } from '@/hooks/useUser';

export default function NotificationBell() {
  const { user } = useUser();
  const { unreadCount } = useNotifications(user?.id);

  return (
    <Link href="/notifications" className="relative p-2 rounded-full hover:bg-[#EEF5EE] transition-colors">
      <Bell size={20} className="text-[#5C6B5E]" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#E07A5F] rounded-full text-white text-[10px] font-bold flex items-center justify-center">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
