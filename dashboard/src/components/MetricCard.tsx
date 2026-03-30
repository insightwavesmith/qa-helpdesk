import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

interface MetricCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  description?: ReactNode;
  onClick?: () => void;
}

export function MetricCard({ icon: Icon, value, label, description, onClick }: MetricCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-colors',
        onClick && 'cursor-pointer hover:bg-gray-50',
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
          <p className="text-xs font-medium text-gray-500 mt-1">{label}</p>
          {description && (
            <div className="text-xs text-gray-400 mt-1.5">{description}</div>
          )}
        </div>
        <Icon className="h-5 w-5 text-gray-300 shrink-0 mt-0.5" />
      </div>
    </div>
  );
}
