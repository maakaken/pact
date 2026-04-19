'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center font-semibold transition-all duration-200 active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none';

    const variants = {
      primary:
        'bg-[#1B4332] text-white hover:bg-[#2D6A4F] shadow-sm hover:shadow-md',
      secondary:
        'bg-white border-2 border-[#2D6A4F] text-[#2D6A4F] hover:bg-[#EEF5EE]',
      danger:
        'bg-[#FDF0EC] border border-[#F0C4B8] text-[#E07A5F] hover:bg-[#F9E1D9]',
      ghost:
        'bg-transparent text-[#5C6B5E] hover:bg-[#EEF5EE]',
    };

    const sizes = {
      sm: 'px-4 py-2 text-sm rounded-[10px]',
      md: 'px-6 py-3 text-sm rounded-[12px] tracking-[0.3px]',
      lg: 'px-8 py-4 text-base rounded-[12px] tracking-[0.3px]',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            {children}
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
