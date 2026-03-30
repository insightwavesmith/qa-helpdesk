import { cn } from '../lib/utils';

interface PageSkeletonProps {
  variant?: 'dashboard' | 'list' | 'detail';
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-gray-100', className)} />
  );
}

export function PageSkeleton({ variant = 'list' }: PageSkeletonProps) {
  if (variant === 'dashboard') {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SkeletonBlock className="h-64" />
          <SkeletonBlock className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-16" />
      ))}
    </div>
  );
}
