import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: React.ReactNode;
  unit?: string;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  loading?: boolean;
  onClick?: () => void;
  className?: string;
  badge?: React.ReactNode;
}

const variantStyles = {
  default: {
    bg: 'bg-white',
    border: 'border-slate-200/80',
    iconBg: 'bg-slate-100 text-slate-700',
    titleColor: 'text-slate-500',
    valueColor: 'text-slate-900',
  },
  primary: {
    bg: 'bg-white',
    border: 'border-blue-200/80',
    iconBg: 'bg-blue-50 text-blue-600',
    titleColor: 'text-slate-500',
    valueColor: 'text-slate-900',
  },
  success: {
    bg: 'bg-white',
    border: 'border-emerald-200/80',
    iconBg: 'bg-emerald-50 text-emerald-600',
    titleColor: 'text-slate-500',
    valueColor: 'text-emerald-700',
  },
  warning: {
    bg: 'bg-white',
    border: 'border-amber-200/80',
    iconBg: 'bg-amber-50 text-amber-600',
    titleColor: 'text-slate-500',
    valueColor: 'text-amber-700',
  },
  danger: {
    bg: 'bg-white',
    border: 'border-rose-200/80',
    iconBg: 'bg-rose-50 text-rose-600',
    titleColor: 'text-rose-600',
    valueColor: 'text-rose-700',
  },
  info: {
    bg: 'bg-white',
    border: 'border-indigo-200/80',
    iconBg: 'bg-indigo-50 text-indigo-600',
    titleColor: 'text-slate-500',
    valueColor: 'text-indigo-700',
  },
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  icon: Icon,
  variant = 'default',
  loading = false,
  onClick,
  className = '',
  badge,
}) => {
  const styles = variantStyles[variant];

  return (
    <div
      onClick={onClick}
      className={`${styles.bg} ${styles.border} p-5 rounded-2xl border shadow-xs transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-400 active:scale-[0.99]' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] font-bold uppercase tracking-wider ${styles.titleColor}`}
            >
              {title}
            </span>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>

          <div className="mt-2 flex items-baseline gap-1.5">
            {loading ? (
              <div className="h-8 w-24 bg-slate-200 animate-pulse rounded-lg" />
            ) : (
              <>
                <span className={`text-2xl sm:text-3xl font-black tracking-tight ${styles.valueColor}`}>
                  {value}
                </span>
                {unit && (
                  <span className="text-xs font-semibold text-slate-500">
                    {unit}
                  </span>
                )}
              </>
            )}
          </div>

          {subtitle && (
            <div className="mt-1.5 text-xs text-slate-500 font-medium leading-normal">
              {subtitle}
            </div>
          )}
        </div>

        {Icon && (
          <div className={`p-3 rounded-xl shrink-0 ${styles.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
