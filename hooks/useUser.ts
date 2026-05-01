'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';
import type { User } from '@supabase/supabase-js';
import { getCache, setCache, clearCache, hasCacheConsent, CACHE_KEYS, CACHE_DURATION } from '@/lib/cache';

async function fetchProfile(supabase: ReturnType<typeof createClient>, userId: string): Promise<Profile | null> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    return data ?? null;
  } catch {
    return null;
  }
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      try {
        const supabase = createClient();
        // Use getSession instead of getUser to avoid hanging
        const { data: { session } } = await supabase.auth.getSession();

        if (mounted) {
          if (session?.user) {
            setUser(session.user);
            
            // Check cache consent first
            if (hasCacheConsent()) {
              // Try to get from cache
              const cachedProfile = getCache<Profile>(CACHE_KEYS.USER_PROFILE);
              if (cachedProfile) {
                setProfile(cachedProfile);
              } else {
                // Fetch profile and cache it
                const profileData = await fetchProfile(supabase, session.user.id);
                setProfile(profileData);
                setCache(CACHE_KEYS.USER_PROFILE, profileData, CACHE_DURATION.SESSION);
              }
            } else {
              // No consent - fetch normally
              const profileData = await fetchProfile(supabase, session.user.id);
              setProfile(profileData);
            }
            
            // Update last_seen_at for activity tracking
            await fetch('/api/user/ping', { method: 'POST' }).catch(() => {
              // Silently fail - activity tracking is non-critical
            });
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load user:', err);
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadUser();

    // Listen for auth state changes to keep user in sync
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      console.log('[useUser] Auth state change:', event, session?.user?.id);
      if (mounted) {
        if (session?.user) {
          setUser(session.user);
          
          const uid = session.user.id;
          if (hasCacheConsent()) {
            const cached = getCache<Profile>(CACHE_KEYS.USER_PROFILE);
            if (cached) {
              setProfile(cached);
            } else {
              fetchProfile(supabase, uid).then(p => {
                if (mounted) {
                  setProfile(p);
                  if (p) setCache(CACHE_KEYS.USER_PROFILE, p, CACHE_DURATION.SESSION);
                }
              });
            }
          } else {
            fetchProfile(supabase, uid).then(profile => {
              if (mounted) setProfile(profile);
            });
          }
        } else {
          setUser(null);
          setProfile(null);
          // Clear cache on logout
          clearCache();
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, profile, userLoading: loading, loading };
}
