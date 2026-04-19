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
    const supabase = createClient();
    let initialised = false;

    // onAuthStateChange fires immediately with INITIAL_SESSION (or SIGNED_IN if
    // there is already a session), so we don't need a separate getUser() call.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const p = await fetchProfile(supabase, currentUser.id);
        setProfile(p);
      } else {
        setProfile(null);
      }

      // Only update loading on the first event so subsequent sign-in/out
      // changes don't flash a loading state.
      if (!initialised) {
        initialised = true;
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, profile, loading };
}
