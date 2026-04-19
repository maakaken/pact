import Image from 'next/image';
import { getInitials } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ring?: boolean;
}

const sizes = {
  xs: { px: 24, text: 'text-[10px]' },
  sm: { px: 32, text: 'text-xs' },
  md: { px: 40, text: 'text-sm' },
  lg: { px: 56, text: 'text-base' },
  xl: { px: 80, text: 'text-xl' },
};

export default function Avatar({ src, name, size = 'md', className, ring = true }: AvatarProps) {
  const { px, text } = sizes[size];
  const initials = getInitials(name);

  return (
    <div
      className={cn(
        'rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center',
        ring && 'border-2 border-[#74C69D]',
        'bg-[#D8EDDA]',
        className
      )}
      style={{ width: px, height: px }}
    >
      {src ? (
        <Image
          src={src}
          alt={name ?? 'Avatar'}
          width={px}
          height={px}
          className="object-cover w-full h-full"
        />
      ) : (
        <span className={cn(text, 'font-semibold text-[#2D6A4F] select-none')}>
          {initials}
        </span>
      )}
    </div>
  );
}
