'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Notification } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isMountedRef = useRef(true);

  const fetchNotifications = useCallback(async () => {
    if (!userId || !isMountedRef.current) return;
    const supabase = createClient();
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data && isMountedRef.current) {
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.is_read).length);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channelName = 'notifications-' + userId;

    // Remove any existing subscription with this name first
    const existingChannel = supabase.channel(channelName);
    supabase.removeChannel(existingChannel);

    // Now create a fresh channel and set up callbacks BEFORE subscribing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(channelName) as any;
    channelRef.current = channel;

    try {
      // Add callback BEFORE subscribing
      channel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload: { new: Notification }) => {
        if (isMountedRef.current) {
          setNotifications((prev) => [payload.new, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      });

      // Now subscribe
      channel.subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'SUBSCRIPTION_FAILED') {
          console.warn(`Notification subscription error for ${userId}:`, status);
        }
      });
    } catch (err) {
      console.error('Failed to subscribe to notifications:', err);
    }

    return () => {
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch (err) {
          console.error('Failed to remove channel:', err);
        }
      }
    };
  }, [userId]);

  const markRead = async (id: string) => {
    const supabase = createClient();
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllRead = async () => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  return { notifications, unreadCount, markRead, markAllRead, refetch: fetchNotifications };
}


