'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Pact, PactMember, Sprint, Profile } from '@/types';
import { getCache, setCache, hasCacheConsent, CACHE_KEYS, CACHE_DURATION } from '@/lib/cache';

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
      // Check cache first if consent is given
      if (hasCacheConsent()) {
        const cachedPact = getCache<PactData>(CACHE_KEYS.PACT_DATA(pactId));
        if (cachedPact) {
          setError(null);
          setPact(cachedPact);
          setLoading(false);
          return;
        }
      }
      
      const response = await fetch(`/api/pacts/${pactId}`);
      if (!response.ok) {
        setError('Pact not found');
        return;
      }
      const data = await response.json();
      setPact(data);
      
      // Cache the fetched data
      if (hasCacheConsent()) {
        setCache(CACHE_KEYS.PACT_DATA(pactId), data, CACHE_DURATION.SESSION);
      }
    } catch (err) {
      setError('Failed to load pact');
    } finally {
      setLoading(false);
    }
  }, [pactId]);

  useEffect(() => { fetchPact(); }, [fetchPact]);

  return { pact, pactLoading: loading, loading, error, refetch: fetchPact };
}
