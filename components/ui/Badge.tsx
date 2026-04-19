import { cn } from '@/lib/utils';

interface BadgeProps {
  variant?: 'active' | 'pending' | 'failed' | 'completed' | 'verified' | 'custom';
  className?: string;
  children: React.ReactNode;
  color?: string;
  bg?: string;
}

export default function Badge({ variant = 'active', className, children, color, bg }: BadgeProps) {
  const variants = {
    active:    'bg-[#D8EDDA] text-[#1B4332]',
    pending:   'bg-[#FEF3E2] text-[#B5540A]',
    failed:    'bg-[#FDF0EC] text-[#C0522A]',
    completed: 'bg-[#E8F5E9] text-[#2D6A4F]',
    verified:  'bg-[#D8EDDA] text-[#1B4332]',
    custom:    '',
  };

  const style = variant === 'custom' ? { color, backgroundColor: bg } : {};

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[999px] px-3 py-1 text-xs font-semibold',
        variants[variant],
        className
      )}
      style={style}
    >
      {children}
    </span>
  );
}
