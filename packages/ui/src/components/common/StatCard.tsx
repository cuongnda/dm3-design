import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DOMAIN_COLORS } from '@/lib/constants';

interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  trend?: { direction: 'up' | 'down'; text: string };
  icon?: ReactNode;
  domain?: 'secure' | 'manage' | 'visitors' | 'parking' | 'operate' | 'smart' | 'error' | 'default';
  onClick?: () => void;
}

const domainColorMap: Record<string, string> = {
  secure: DOMAIN_COLORS.secure,
  manage: DOMAIN_COLORS.manage,
  visitors: DOMAIN_COLORS.visitors,
  parking: DOMAIN_COLORS.parking,
  operate: DOMAIN_COLORS.operate,
  smart: DOMAIN_COLORS.smart,
  error: '#EF4444',
  default: '#F8FAFC',
};

export function StatCard({ label, value, sub, trend, icon, domain = 'default', onClick }: StatCardProps) {
  const valueColor = domainColorMap[domain] || '#F8FAFC';

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-[#1E293B] border border-[#334155] rounded-lg p-4 transition-colors',
        onClick && 'cursor-pointer hover:border-[#475569]'
      )}
    >
      <div className="text-[12px] font-medium text-[#94A3B8] mb-1 flex items-center gap-1.5">
        {icon && <span className="inline-flex items-center">{icon}</span>}
        {label}
      </div>
      <div className="text-[24px] font-semibold tracking-tight mb-1" style={{ color: valueColor }}>
        {value}
      </div>
      <div className="text-[12px] text-[#64748B]">{sub}</div>
      {trend && (
        <div
          className={cn(
            'text-[11px] mt-0.5 inline-flex items-center gap-1',
            trend.direction === 'up' ? 'text-[#22C55E]' : 'text-[#EF4444]'
          )}
        >
          {trend.direction === 'up' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          {trend.text}
        </div>
      )}
    </div>
  );
}
