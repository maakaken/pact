'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';
import type { User } from '@supabase/supabase-js';

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
            // Fetch profile
            const profileData = await fetchProfile(supabase, session.user.id);
            setProfile(profileData);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[useUser] Auth state change:', event, session?.user?.id);
      if (mounted) {
        if (session?.user) {
          setUser(session.user);
          fetchProfile(supabase, session.user.id).then(setProfile);
        } else {
          setUser(null);
          setProfile(null);
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
