'use client';

import { useCountdown } from '@/hooks/useCountdown';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  endDate: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showDays?: boolean;
}

export default function CountdownTimer({ endDate, size = 'md', className, showDays = true }: CountdownTimerProps) {
  const { days, hours, minutes, seconds, total } = useCountdown(endDate);

  const expired = total <= 0;

  const textSizes = {
    sm: 'text-lg',
    md: 'text-3xl',
    lg: 'text-5xl',
  };

  const labelSizes = {
    sm: 'text-[9px]',
    md: 'text-[10px]',
    lg: 'text-xs',
  };

  if (expired) {
    return (
      <span className={cn('font-mono font-bold text-[#E07A5F]', textSizes[size], className)}>
        Ended
      </span>
    );
  }

  return (
    <div className={cn('flex items-end gap-1 font-mono font-bold text-[#1B4332]', className)}>
      {showDays && days > 0 && (
        <>
          <div className="flex flex-col items-center">
            <span className={textSizes[size]}>{String(days).padStart(2, '0')}</span>
            <span className={cn(labelSizes[size], 'text-[#5C6B5E] font-sans font-medium uppercase tracking-wider')}>d</span>
          </div>
          <span className={cn(textSizes[size], 'mb-4 opacity-40')}>:</span>
        </>
      )}
      <div className="flex flex-col items-center">
        <span className={textSizes[size]}>{String(hours).padStart(2, '0')}</span>
        <span className={cn(labelSizes[size], 'text-[#5C6B5E] font-sans font-medium uppercase tracking-wider')}>h</span>
      </div>
      <span className={cn(textSizes[size], 'mb-4 opacity-40')}>:</span>
      <div className="flex flex-col items-center">
        <span className={textSizes[size]}>{String(minutes).padStart(2, '0')}</span>
        <span className={cn(labelSizes[size], 'text-[#5C6B5E] font-sans font-medium uppercase tracking-wider')}>m</span>
      </div>
      <span className={cn(textSizes[size], 'mb-4 opacity-40')}>:</span>
      <div className="flex flex-col items-center">
        <span className={textSizes[size]}>{String(seconds).padStart(2, '0')}</span>
        <span className={cn(labelSizes[size], 'text-[#5C6B5E] font-sans font-medium uppercase tracking-wider')}>s</span>
      </div>
    </div>
  );
}
