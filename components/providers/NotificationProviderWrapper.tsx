'use client';

import { useUser } from '@/hooks/useUser';
import { NotificationProvider } from '@/contexts/NotificationContext';

export default function NotificationProviderWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  return <NotificationProvider userId={user?.id}>{children}</NotificationProvider>;
}
