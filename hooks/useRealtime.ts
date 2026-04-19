'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface RealtimeOptions {
  table: string;
  filter?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onInsert?: (record: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate?: (record: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDelete?: (record: any) => void;
}

export function useRealtime({ table, filter, onInsert, onUpdate, onDelete }: RealtimeOptions) {
  const callbacksRef = useRef({ onInsert, onUpdate, onDelete });
  const isMountedRef = useRef(true);

  // Update callbacks without re-subscribing
  useEffect(() => {
    callbacksRef.current = { onInsert, onUpdate, onDelete };
  }, [onInsert, onUpdate, onDelete]);

  useEffect(() => {
    const supabase = createClient();
    const channelName = `realtime-${table}-${filter ?? 'all'}`;

    // Remove any existing subscription with this name first
    const existingChannel = supabase.channel(channelName);
    supabase.removeChannel(existingChannel);

    // Create a fresh channel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(channelName) as any;

    try {
      // Add callbacks BEFORE subscribing
      if (callbacksRef.current.onInsert) {
        channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter },
          (p: { new: unknown }) => {
            if (isMountedRef.current) {
              callbacksRef.current.onInsert?.(p.new);
            }
          });
      }
      if (callbacksRef.current.onUpdate) {
        channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter },
          (p: { new: unknown }) => {
            if (isMountedRef.current) {
              callbacksRef.current.onUpdate?.(p.new);
            }
          });
      }
      if (callbacksRef.current.onDelete) {
        channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table, filter },
          (p: { old: unknown }) => {
            if (isMountedRef.current) {
              callbacksRef.current.onDelete?.(p.old);
            }
          });
      }

      // Now subscribe
      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIPTION_FAILED') {
          console.error(`Realtime subscription failed for ${channelName}`);
        }
      });
    } catch (err) {
      console.error(`Failed to set up realtime for ${channelName}:`, err);
    }

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (err) {
        console.error('Failed to remove channel:', err);
      }
    };
  }, [table, filter]);
}
