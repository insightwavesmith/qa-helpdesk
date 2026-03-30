import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, message, action, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Icon className="h-10 w-10 text-gray-300 mb-4" />
      <p className="text-sm text-gray-500 mb-4">{message}</p>
      {action && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors"
        >
          {action}
        </button>
      )}
    </div>
  );
}
