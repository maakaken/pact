'use client';

import { TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-[#1B1F1A]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          className={cn(
            'w-full rounded-[10px] border border-[#E0EBE1] px-4 py-3 text-sm text-[#1B1F1A]',
            'bg-white placeholder:text-[#8FA38F] resize-none',
            'focus:outline-none focus:border-[#2D6A4F] focus:ring-3 focus:ring-[rgba(45,106,79,0.12)]',
            'transition-all duration-150',
            error && 'border-[#E07A5F]',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-[#E07A5F]">{error}</p>}
        {hint && !error && <p className="text-xs text-[#8FA38F]">{hint}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
export default Textarea;
