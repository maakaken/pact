import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  count?: number;
}

export function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cn('skeleton rounded-full h-4', className)}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white rounded-[20px] border border-[#E0EBE1] p-5 space-y-3', className)}>
      <div className="flex items-center gap-3">
        <div className="skeleton rounded-full w-10 h-10" />
        <div className="flex-1 space-y-2">
          <SkeletonLine className="w-1/2" />
          <SkeletonLine className="w-1/3 h-3" />
        </div>
      </div>
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-4/5" />
      <SkeletonLine className="w-2/3 h-3" />
    </div>
  );
}

export default function Skeleton({ className, count = 1 }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} className={className} />
      ))}
    </>
  );
}
