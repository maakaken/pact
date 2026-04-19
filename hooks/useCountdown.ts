'use client';

import { useEffect, useState, useCallback } from 'react';
import { getTimeRemaining } from '@/lib/utils';

export function useCountdown(endDate: string | null) {
  const [time, setTime] = useState(() =>
    endDate ? getTimeRemaining(endDate) : { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 }
  );

  const tick = useCallback(() => {
    if (!endDate) return;
    setTime(getTimeRemaining(endDate));
  }, [endDate]);

  useEffect(() => {
    if (!endDate) return;
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endDate, tick]);

  return time;
}
