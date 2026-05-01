'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Notification } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getCache, setCache, hasCacheConsent, CACHE_KEYS, CACHE_DURATION } from '@/lib/cache';

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isMountedRef = useRef(true);

  const fetchNotifications = useCallback(async () => {
    if (!userId || !isMountedRef.current) return;
    const supabase = createClient();

    // Check cache first if consent is given
    if (hasCacheConsent()) {
      const cachedNotifications = getCache<Notification[]>(CACHE_KEYS.NOTIFICATIONS(userId));
      if (cachedNotifications) {
        setNotifications(cachedNotifications);
        setUnreadCount(cachedNotifications.filter(n => !n.is_read).length);
        return;
      }
    }

    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data && isMountedRef.current) {
        setNotifications(data);
        setUnreadCount(data.filter((n: Notification) => !n.is_read).length);
        
        // Cache: fetched data
        if (hasCacheConsent()) {
          setCache(CACHE_KEYS.NOTIFICATIONS(userId), data, CACHE_DURATION.SESSION);
        }
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
    // Use a unique channel name to avoid collisions and "already subscribed" errors
    const uniqueId = Math.random().toString(36).slice(2, 9);
    const channelName = `notifications-${userId}-${uniqueId}`;

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
      
      setNotifications((prev) => {
        const updated = prev.map((n) => (n.id === id ? { ...n, is_read: true } : n));
        
        // Update cache if consent is given
        if (hasCacheConsent() && userId) {
          setCache(CACHE_KEYS.NOTIFICATIONS(userId), updated);
        }
        
        return updated;
      });
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
      
      setNotifications((prev) => {
        const updated = prev.map((n) => ({ ...n, is_read: true }));
        
        // Update cache if consent is given
        if (hasCacheConsent()) {
          setCache(CACHE_KEYS.NOTIFICATIONS(userId), updated);
        }
        
        return updated;
      });
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  return { notifications, unreadCount, markRead, markAllRead, refetch: fetchNotifications };
}


