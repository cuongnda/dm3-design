import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface PluginEmptyCardProps {
  title: string;
  icon: ReactNode;
  colorCls?: string;
  message?: string;
  testId?: string;
  cta?: { label: string; onClick: () => void };
}

export function PluginEmptyCard({
  title,
  icon,
  colorCls = 'text-muted-foreground',
  message,
  testId,
  cta,
}: PluginEmptyCardProps): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const body = message ?? t('plugin.comingSoon', 'Coming soon');

  return (
    <div
      data-testid={testId}
      className="bg-card border border-dashed border-border rounded-lg p-4 flex flex-col justify-between min-h-[168px]"
    >
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('inline-flex', colorCls)}>{icon}</span>
          <span className="text-[13px] font-semibold text-foreground">{title}</span>
        </div>
        <div className="text-[12px] text-muted-foreground leading-relaxed">{body}</div>
      </div>
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="mt-3 self-start text-[12px] text-secure hover:underline"
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
