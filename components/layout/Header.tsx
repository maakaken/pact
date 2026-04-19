'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import NotificationBell from './NotificationBell';

interface HeaderProps {
  title?: string;
}

export default function Header({ title }: HeaderProps) {
  return (
    <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-[#E0EBE1] z-30 md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Link href="/lobby" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#1B4332] rounded-[8px] flex items-center justify-center">
            <span className="text-white font-display font-bold text-xs">P</span>
          </div>
          {!title && <span className="font-display font-bold text-[#1B4332] text-lg">Pact</span>}
        </Link>
        {title && <h1 className="font-display font-bold text-[#1B1F1A] text-base">{title}</h1>}
        <div className="flex items-center gap-2">
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
