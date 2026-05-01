'use client';

// Cache keys
export const CACHE_KEYS = {
  USER_PROFILE: 'pact:user-profile',
  CACHE_CONSENT: 'pact:cache-consent',
  PACT_DATA: (pactId: string) => `pact:pact-data:${pactId}`,
  NOTIFICATIONS: (userId: string) => `pact:notifications:${userId}`,
} as const;

// Cache duration (session-based - cleared on browser close)
export const CACHE_DURATION = {
  SESSION: 'session', // Special marker for session-based cache
};

// Consent preference
interface CacheConsent {
  hasConsented: boolean;
  timestamp: number;
}

// Generic cache functions
export function getCache<T>(key: string): T | null {
  try {
    // Try sessionStorage first (for session-based)
    const sessionItem = sessionStorage.getItem(key);
    if (sessionItem) {
      const parsed = JSON.parse(sessionItem);
      return parsed.data;
    }

    // Try localStorage
    const item = localStorage.getItem(key);
    if (!item) return null;
    
    const parsed = JSON.parse(item);
    // Note: session-based items shouldn't be in localStorage, but if they are, we check
    if (parsed._cacheDuration === CACHE_DURATION.SESSION) {
      return parsed.data;
    }
    
    // Check expiration for non-session caches
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    
    return parsed.data;
  } catch {
    return null;
  }
}

export function setCache<T>(key: string, data: T, duration?: number | string): void {
  try {
    const cacheItem = {
      data,
      _cacheDuration: duration === CACHE_DURATION.SESSION ? CACHE_DURATION.SESSION : undefined,
      expiresAt: duration === CACHE_DURATION.SESSION ? undefined : Date.now() + (typeof duration === 'number' ? duration : 3600000), // Default 1 hour
    };

    if (duration === CACHE_DURATION.SESSION) {
      sessionStorage.setItem(key, JSON.stringify(cacheItem));
    } else {
      localStorage.setItem(key, JSON.stringify(cacheItem));
    }
  } catch {
    // Silent fail for cache operations
  }
}

export function clearCache(key?: string): void {
  try {
    if (key) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } else {
      // Clear all pact-related caches from both storages
      const localKeys = Object.keys(localStorage).filter(k => k.startsWith('pact:'));
      localKeys.forEach(k => localStorage.removeItem(k));
      
      const sessionKeys = Object.keys(sessionStorage).filter(k => k.startsWith('pact:'));
      sessionKeys.forEach(k => sessionStorage.removeItem(k));
    }
  } catch {
    // Silent fail for cache operations
  }
}

// Consent preference functions
export function getCacheConsent(): CacheConsent | null {
  try {
    const consent = localStorage.getItem(CACHE_KEYS.CACHE_CONSENT);
    return consent ? JSON.parse(consent) : null;
  } catch {
    return null;
  }
}

export function setCacheConsent(hasConsented: boolean): void {
  try {
    const consent: CacheConsent = {
      hasConsented,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEYS.CACHE_CONSENT, JSON.stringify(consent));
  } catch {
    // Silent fail for cache operations
  }
}

// Check if user has given consent
export function hasCacheConsent(): boolean {
  const consent = getCacheConsent();
  return consent?.hasConsented ?? false;
}

// Check if user has made any consent decision
export function hasConsentDecision(): boolean {
  const consent = getCacheConsent();
  return consent !== null;
}
