import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  label?: string;
  showPercent?: boolean;
  color?: string;
}

export default function ProgressBar({ value, className, label, showPercent, color = '#2D6A4F' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div className={cn('w-full', className)}>
      {(label || showPercent) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && <span className="text-xs text-[#5C6B5E]">{label}</span>}
          {showPercent && <span className="text-xs font-semibold text-[#2D6A4F]">{pct}%</span>}
        </div>
      )}
      <div className="w-full h-2 bg-[#E0EBE1] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
