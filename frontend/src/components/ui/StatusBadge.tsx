import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Truck,
  ShieldCheck,
  AlertCircle,
  Activity,
  Check,
} from 'lucide-react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple' | 'teal';

export interface StatusBadgeProps {
  variant?: BadgeVariant;
  icon?: React.ReactNode;
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
  title?: string;
}

const variantClasses: Record<BadgeVariant, { bg: string; text: string; border: string; dot: string }> = {
  success: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  warning: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  danger: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
  },
  info: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  neutral: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
  },
  teal: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    dot: 'bg-teal-500',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  variant = 'neutral',
  icon,
  children,
  pulse = false,
  className = '',
  title,
}) => {
  const styles = variantClasses[variant];

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles.bg} ${styles.text} ${styles.border} ${className}`}
    >
      {pulse && (
        <span className={`w-1.5 h-1.5 rounded-full ${styles.dot} animate-pulse shrink-0`} />
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
};

// Specialized Document Status Renderer
export const DocumentStatusBadge: React.FC<{ status: string; className?: string }> = ({
  status,
  className = '',
}) => {
  const normalized = (status || '').toUpperCase();
  switch (normalized) {
    case 'PENDING':
    case 'CHO_XU_LY':
    case 'CREATED':
    case 'CHO_DUYET':
      return (
        <StatusBadge
          variant="warning"
          icon={<Clock className="w-3 h-3" />}
          className={className}
        >
          Chờ duyệt
        </StatusBadge>
      );
    case 'DANG_XU_LY':
    case 'PROCESSING':
      return (
        <StatusBadge
          variant="info"
          icon={<RotateCcw className="w-3 h-3 animate-spin" />}
          className={className}
        >
          Đang xử lý
        </StatusBadge>
      );
    case 'HOAN_THANH':
    case 'COMPLETED':
    case 'SUCCESS':
      return (
        <StatusBadge
          variant="success"
          icon={<CheckCircle2 className="w-3 h-3" />}
          className={className}
        >
          Hoàn tất
        </StatusBadge>
      );
    case 'THAT_BAI':
    case 'FAILED':
    case 'DA_HUY':
    case 'CANCELLED':
      return (
        <StatusBadge
          variant="danger"
          icon={<AlertTriangle className="w-3 h-3" />}
          className={className}
        >
          {normalized === 'DA_HUY' || normalized === 'CANCELLED' ? 'Đã hủy' : 'Thất bại'}
        </StatusBadge>
      );
    default:
      return (
        <StatusBadge variant="neutral" className={className}>
          {status || 'Không xác định'}
        </StatusBadge>
      );
  }
};

// Specialized Saga Status Renderer
export const SagaStatusBadge: React.FC<{
  state?: string;
  sagaId?: string;
  errorMessage?: string;
  className?: string;
}> = ({ state, sagaId, errorMessage, className = '' }) => {
  if (!state && !sagaId) {
    return (
      <StatusBadge variant="neutral" className={className}>
        Chưa kích hoạt Saga
      </StatusBadge>
    );
  }

  const normalized = (state || '').toUpperCase();
  switch (normalized) {
    case 'WAITING_SOURCE_CONFIRMATION':
      return (
        <StatusBadge
          variant="purple"
          icon={<Clock className="w-3 h-3" />}
          title={sagaId ? `Saga ID: ${sagaId}` : undefined}
          className={className}
        >
          Chờ kho xuất giữ hàng
        </StatusBadge>
      );
    case 'SOURCE_ACCEPTED':
    case 'RESERVED':
      return (
        <StatusBadge
          variant="teal"
          icon={<ShieldCheck className="w-3 h-3" />}
          title={sagaId ? `Saga ID: ${sagaId} — Đã khóa tồn kho nguồn` : undefined}
          className={className}
        >
          Đã giữ hàng (Sẵn sàng xuất)
        </StatusBadge>
      );
    case 'IN_TRANSIT':
      return (
        <StatusBadge
          variant="info"
          icon={<Truck className="w-3 h-3" />}
          title={sagaId ? `Saga ID: ${sagaId} — Đang vận chuyển liên chi nhánh` : undefined}
          pulse
          className={className}
        >
          Đang vận chuyển
        </StatusBadge>
      );
    case 'COMPLETED':
      return (
        <StatusBadge
          variant="success"
          icon={<CheckCircle2 className="w-3 h-3" />}
          title={sagaId ? `Saga ID: ${sagaId}` : undefined}
          className={className}
        >
          Saga hoàn tất
        </StatusBadge>
      );
    case 'COMPENSATING':
      return (
        <StatusBadge
          variant="warning"
          icon={<RotateCcw className="w-3 h-3 animate-spin" />}
          title={sagaId ? `Saga ID: ${sagaId} — Đang hoàn trả tồn kho` : undefined}
          className={className}
        >
          Đang bồi hoàn
        </StatusBadge>
      );
    case 'COMPENSATED':
      return (
        <StatusBadge
          variant="neutral"
          icon={<AlertCircle className="w-3 h-3" />}
          title={sagaId ? `Saga ID: ${sagaId} — Đã bồi hoàn tồn kho an toàn` : undefined}
          className={className}
        >
          Đã bồi hoàn
        </StatusBadge>
      );
    case 'FAILED':
      return (
        <StatusBadge
          variant="danger"
          icon={<AlertTriangle className="w-3 h-3" />}
          title={errorMessage || `Saga ID: ${sagaId} — Lỗi phân tán`}
          className={className}
        >
          Saga thất bại
        </StatusBadge>
      );
    default:
      return (
        <StatusBadge variant="info" className={className}>
          {state || 'Đang xử lý'}
        </StatusBadge>
      );
  }
};

// Specialized System Health Status Renderer
export const HealthBadge: React.FC<{
  status?: string;
  pulse?: boolean;
  className?: string;
}> = ({ status, pulse = false, className = '' }) => {
  const s = (status || '').toUpperCase();
  if (['ONLINE', 'CONNECTED', 'HEALTHY', 'ACTIVE', 'READY'].includes(s)) {
    return (
      <StatusBadge variant="success" pulse={pulse} icon={<Check className="w-3 h-3" />} className={className}>
        {s}
      </StatusBadge>
    );
  }
  if (['DEGRADED', 'IDLE', 'WARNING'].includes(s)) {
    return (
      <StatusBadge variant="warning" pulse={pulse} icon={<Activity className="w-3 h-3" />} className={className}>
        {s}
      </StatusBadge>
    );
  }
  return (
    <StatusBadge variant="danger" icon={<AlertTriangle className="w-3 h-3" />} className={className}>
      {s || 'OFFLINE'}
    </StatusBadge>
  );
};

export default StatusBadge;
