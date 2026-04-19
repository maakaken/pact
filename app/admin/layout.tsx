import Link from 'next/link';
import { LayoutDashboard, Image, Target, Scale, Users } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F5F7F0] flex">
      {/* Admin sidebar */}
      <aside className="w-56 bg-[#1B4332] text-white flex flex-col fixed top-0 bottom-0 left-0 z-40">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-[8px] flex items-center justify-center">
              <span className="font-bold text-sm">P</span>
            </div>
            <div>
              <p className="font-bold text-sm">Pact</p>
              <p className="text-[10px] text-white/60 uppercase tracking-wider">Admin</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[
            { href: '/admin', icon: LayoutDashboard, label: 'Queue' },
            { href: '/admin/evidence', icon: Image, label: 'Evidence' },
            { href: '/admin/goals', icon: Target, label: 'Goals' },
            { href: '/admin/appeals', icon: Scale, label: 'Appeals' },
            { href: '/admin/users', icon: Users, label: 'Users' },
          ].map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm text-white/80 hover:bg-white/10 hover:text-white transition-all"
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <Link href="/" className="flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white transition-colors">
            ← Back to App
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-56 flex-1 min-h-screen">
        {children}
      </main>
    </div>
  );
}
