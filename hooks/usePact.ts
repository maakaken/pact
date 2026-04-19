'use client';

import { useEffect, useState, useCallback } from 'react';
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
    setLoading(true);
    try {
      const response = await fetch(`/api/pacts/${pactId}`);
      if (!response.ok) {
        setError('Pact not found');
        return;
      }
      const data = await response.json();
      setPact(data);
    } catch (err) {
      setError('Failed to load pact');
    } finally {
      setLoading(false);
    }
  }, [pactId]);

  useEffect(() => { fetchPact(); }, [fetchPact]);

  return { pact, pactLoading: loading, loading, error, refetch: fetchPact };
}
