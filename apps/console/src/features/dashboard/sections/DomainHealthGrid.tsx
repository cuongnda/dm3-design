import { useTranslation } from 'react-i18next';
import { AlertTriangle, Building2, Check, Lock, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DomainHealth } from '@dm3/api-client';

const healthStatusClass: Record<string, string> = {
  ok: 'text-success',
  warning: 'text-warning',
  critical: 'text-error',
};

interface DomainSection {
  domain: string;
  colorCls: string;
  Icon: typeof Lock;
  items: DomainHealth[];
  viewLink: string;
}

export function DomainHealthGrid(): React.ReactElement {
  const { t } = useTranslation('dashboard');

  const domainHealthData: DomainSection[] = [
    {
      domain: t('domain.secure'),
      colorCls: 'text-secure',
      Icon: Lock,
      viewLink: t('health.viewSecurity'),
      items: [
        { module: t('modules.accessControl'), status: 'ok', detail: 'Online' },
        { module: t('modules.cctv'), status: 'warning', detail: '1 offline' },
        { module: t('modules.intrusion'), status: 'ok', detail: 'Armed' },
        { module: t('modules.intercom'), status: 'ok', detail: 'Online' },
        { module: t('modules.aiDetection'), status: 'ok', detail: 'Active' },
      ],
    },
    {
      domain: t('domain.manage'),
      colorCls: 'text-manage',
      Icon: UserCog,
      viewLink: t('health.viewPeople'),
      items: [
        { module: t('modules.visitors'), status: 'ok', detail: '3 waiting' },
        { module: t('modules.attendance'), status: 'ok', detail: 'Online' },
      ],
    },
    {
      domain: t('domain.operate'),
      colorCls: 'text-operate',
      Icon: Building2,
      viewLink: t('health.viewFacility'),
      items: [
        { module: t('modules.parking'), status: 'ok', detail: '78% full' },
      ],
    },
  ];

  return (
    <div
      data-testid="dashboard-section-domain-health"
      className="grid grid-cols-3 gap-4"
    >
      {domainHealthData.map((d) => {
        const DomainIcon = d.Icon;
        return (
          <div key={d.domain} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <DomainIcon size={16} className={d.colorCls} />
              <span className={cn('font-semibold text-[14px]', d.colorCls)}>
                {d.domain}
              </span>
            </div>
            {d.items.map((item) => {
              const StatusIcon =
                item.status === 'warning' || item.status === 'critical'
                  ? AlertTriangle
                  : Check;
              return (
                <div
                  key={item.module}
                  className="flex items-center justify-between py-1 text-[12px]"
                >
                  <span className="text-foreground">{item.module}</span>
                  <span
                    className={cn(
                      'text-[11px] inline-flex items-center gap-1',
                      healthStatusClass[item.status],
                    )}
                  >
                    <StatusIcon size={11} /> {item.detail}
                  </span>
                </div>
              );
            })}
            <div className="mt-3">
              <span className="text-[12px] text-secure cursor-pointer hover:underline">
                {d.viewLink}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
