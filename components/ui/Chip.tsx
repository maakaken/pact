'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChipProps {
  label: string;
  onRemove?: () => void;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

export default function Chip({ label, onRemove, onClick, selected, className }: ChipProps) {
  return (
    <span
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
        selected
          ? 'bg-[#1B4332] text-white'
          : 'bg-[#D8EDDA] text-[#1B4332] hover:bg-[#c8e3ca]',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="hover:opacity-70 transition-opacity"
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
