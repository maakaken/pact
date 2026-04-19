'use client';

import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, prefix, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-[#1B1F1A]">
            {label}
          </label>
        )}
        <div className="relative">
          {prefix && (
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5C6B5E] font-medium select-none">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            className={cn(
              'w-full rounded-[10px] border border-[#E0EBE1] px-4 py-3 text-sm text-[#1B1F1A]',
              'bg-white placeholder:text-[#8FA38F]',
              'focus:outline-none focus:border-[#2D6A4F] focus:ring-3 focus:ring-[rgba(45,106,79,0.12)]',
              'transition-all duration-150',
              error && 'border-[#E07A5F] focus:border-[#E07A5F] focus:ring-[rgba(224,122,95,0.12)]',
              prefix && 'pl-8',
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-[#E07A5F]">{error}</p>}
        {hint && !error && <p className="text-xs text-[#8FA38F]">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
