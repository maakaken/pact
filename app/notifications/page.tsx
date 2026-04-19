'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { useUser } from '@/hooks/useUser';
import { useNotifications } from '@/hooks/useNotifications';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import type { Notification } from '@/types';

const notifIcon: Record<Notification['type'], string> = {
  goal_approval_needed: '📋',
  sprint_starting: '🚀',
  proof_due: '⏰',
  verdict_open: '🗳️',
  verdict_result: '🏆',
  appeal_result: '⚖️',
  nudge: '👋',
  inactivity_warning: '⚠️',
  invite_received: '✉️',
  application_approved: '✅',
  application_rejected: '❌',
};

const notifColor: Record<Notification['type'], string> = {
  goal_approval_needed: '#2D6A4F',
  sprint_starting: '#2D6A4F',
  proof_due: '#F4A261',
  verdict_open: '#F4A261',
  verdict_result: '#2D6A4F',
  appeal_result: '#5C6B5E',
  nudge: '#2D6A4F',
  inactivity_warning: '#E07A5F',
  invite_received: '#2D6A4F',
  application_approved: '#2D6A4F',
  application_rejected: '#E07A5F',
};

function groupByDate(notifications: Notification[]) {
  const groups: { label: string; items: Notification[] }[] = [];
  const today: Notification[] = [];
  const yesterday: Notification[] = [];
  const earlier: Notification[] = [];

  for (const n of notifications) {
    const d = new Date(n.created_at);
    if (isToday(d)) today.push(n);
    else if (isYesterday(d)) yesterday.push(n);
    else earlier.push(n);
  }

  if (today.length) groups.push({ label: 'Today', items: today });
  if (yesterday.length) groups.push({ label: 'Yesterday', items: yesterday });
  if (earlier.length) groups.push({ label: 'Earlier', items: earlier });
  return groups;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const { notifications, markRead, markAllRead } = useNotifications(user?.id);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const groups = groupByDate(notifications);

  return (
    <div className="min-h-screen bg-[#F5F7F0]">
      <Sidebar />
      <Header title="Notifications" />
      <main className="md:ml-64 pb-20 md:pb-8 page-enter">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#5C6B5E] mb-1">UPDATES</p>
              <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1B1F1A]">Notifications</h1>
            </div>
            {notifications.some((n) => !n.is_read) && (
              <Button onClick={markAllRead} variant="secondary" size="sm">
                <CheckCheck size={14} className="mr-1.5" /> Mark all read
              </Button>
            )}
          </div>

          {groups.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-[#D8EDDA] flex items-center justify-center mx-auto mb-4">
                <Bell size={24} className="text-[#2D6A4F]" />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#1B1F1A] mb-2">All caught up!</h3>
              <p className="text-sm text-[#5C6B5E]">No notifications yet. Stay active in your pacts.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.label}>
                  <h2 className="text-xs font-bold uppercase tracking-[1.5px] text-[#8FA38F] mb-3">{group.label}</h2>
                  <div className="space-y-2">
                    {group.items.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markRead(n.id)}
                        className={`flex items-start gap-3 p-4 rounded-[16px] border transition-all cursor-pointer ${
                          !n.is_read
                            ? 'bg-[#EEF5EE] border-[#D8EDDA] shadow-[0_2px_8px_rgba(45,106,79,0.06)]'
                            : 'bg-white border-[#E0EBE1]'
                        }`}
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-base"
                          style={{ backgroundColor: notifColor[n.type] + '20' }}
                        >
                          {notifIcon[n.type]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1B1F1A]">{n.title}</p>
                          {n.body && <p className="text-xs text-[#5C6B5E] mt-0.5">{n.body}</p>}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-[#8FA38F]">
                              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                            </span>
                            {n.pact_id && (
                              <Link href={`/pacts/${n.pact_id}`} onClick={(e) => e.stopPropagation()} className="text-[10px] text-[#2D6A4F] font-medium hover:underline">
                                View Pact →
                              </Link>
                            )}
                          </div>
                        </div>
                        {!n.is_read && (
                          <div className="w-2 h-2 rounded-full bg-[#2D6A4F] flex-shrink-0 mt-1" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
