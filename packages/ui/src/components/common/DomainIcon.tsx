import { Shield, Users, Building2, Brain, Settings, UserCheck, Car } from 'lucide-react';
import { DOMAIN_COLORS } from '@/lib/constants';
import type { DomainKey } from '@/lib/constants';

interface DomainIconProps {
  domain: DomainKey;
  size?: number;
}

const iconMap: Record<DomainKey, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  secure: Shield,
  manage: Users,
  visitors: UserCheck,
  parking: Car,
  operate: Building2,
  smart: Brain,
  platform: Settings,
};

export function DomainIcon({ domain, size = 18 }: DomainIconProps) {
  const Icon = iconMap[domain];
  return <Icon size={size} style={{ color: DOMAIN_COLORS[domain] }} />;
}
