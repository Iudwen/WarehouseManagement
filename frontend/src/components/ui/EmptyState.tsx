import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className = '',
  compact = false,
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-6 px-4' : 'py-12 px-6'
      } ${className}`}
    >
      <div
        className={`rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-3 ${
          compact ? 'w-10 h-10' : 'w-14 h-14'
        }`}
      >
        <Icon className={compact ? 'w-5 h-5' : 'w-7 h-7 text-slate-400'} />
      </div>

      <h3
        className={`font-bold text-slate-800 ${
          compact ? 'text-xs' : 'text-sm sm:text-base'
        }`}
      >
        {title}
      </h3>

      {description && (
        <p
          className={`text-slate-500 max-w-sm mt-1 leading-relaxed ${
            compact ? 'text-[11px]' : 'text-xs'
          }`}
        >
          {description}
        </p>
      )}

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
