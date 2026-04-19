'use client';

import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  padded?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = false, padded = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'bg-white rounded-[20px] border border-[#E0EBE1]',
          'shadow-[0_2px_16px_rgba(45,106,79,0.08)]',
          padded && 'p-5',
          hover &&
            'transition-all duration-200 hover:bg-[#EEF5EE] hover:-translate-y-0.5 hover:shadow-[0_4px_24px_rgba(45,106,79,0.14)] cursor-pointer',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
export default Card;
