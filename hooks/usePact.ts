'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Pact, PactMember, Sprint, Profile } from '@/types';

export interface PactData extends Pact {
  members: (PactMember & { profiles: Profile })[];
  currentSprint: Sprint | null;
}

export function usePact(pactId: string | undefined) {
  const [pact, setPact] = useState<PactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPact = useCallback(async () => {
    if (!pactId) { setLoading(false); return; }
    const supabase = createClient();
    setLoading(true);
    try {
      const { data: pactData, error: pactError } = await supabase
        .from('pacts').select('*').eq('id', pactId).single();

      if (pactError || !pactData) { setError('Pact not found'); return; }

      const membersPromise = supabase.from('pact_members').select('*, profiles(*)').eq('pact_id', pactId).eq('status', 'active');
      const sprintPromise = pactData.current_sprint
        ? supabase.from('sprints').select('*').eq('pact_id', pactId).eq('sprint_number', pactData.current_sprint).maybeSingle()
        : Promise.resolve({ data: null });

      const [membersResult, sprintResult] = await Promise.all([
        membersPromise,
        sprintPromise,
      ]);

      setPact({
        ...pactData,
        members: (membersResult.data as (PactMember & { profiles: Profile })[]) ?? [],
        currentSprint: sprintResult.data ?? null,
      });
    } catch {
      setError('Failed to load pact');
    } finally {
      setLoading(false);
    }
  }, [pactId]);

  useEffect(() => { fetchPact(); }, [fetchPact]);

  return { pact, loading, error, refetch: fetchPact };
}
