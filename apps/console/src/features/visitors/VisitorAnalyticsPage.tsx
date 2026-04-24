import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, StatCard, Button } from '@dm3/ui';
import { getVisitorAnalytics, getTopVisitors, type VisitorAnalyticsDTO, type TopVisitorDTO } from '@dm3/api-client';

export function VisitorAnalyticsPage() {
  const { t } = useTranslation('manage');
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['visitor-analytics', period],
    queryFn: () => getVisitorAnalytics({ period }),
  });

  const { data: topVisitors = [] } = useQuery({
    queryKey: ['visitor-top'],
    queryFn: () => getTopVisitors({ limit: 10 }),
  });

  return (
    <div>
      <PageHeader title={t('visitors.analytics.title')} description={t('visitors.analytics.description')}>
        <div className="flex gap-1">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <Button
              key={p}
              size="xs"
              variant={period === p ? 'default' : 'outline'}
              onClick={() => setPeriod(p)}
              className={period === p ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            >
              {p === '7d' ? t('visitors.analytics.period7d') : p === '30d' ? t('visitors.analytics.period30d') : t('visitors.analytics.period90d')}
            </Button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('visitors.analytics.stats.totalVisits')} value={String(analytics?.total_visits ?? 0)} sub={`last ${period}`} domain="visitors" />
        <StatCard label={t('visitors.analytics.stats.uniqueVisitors')} value={String(analytics?.unique_visitors ?? 0)} sub={`last ${period}`} domain="visitors" />
        <StatCard label={t('visitors.analytics.stats.avgDuration')} value={analytics?.avg_duration_minutes != null ? `${Math.round(analytics.avg_duration_minutes)}m` : '—'} sub="per visit" domain="visitors" />
        <StatCard label={t('visitors.analytics.stats.checkedIn')} value={String(analytics?.checked_in ?? 0)} sub="currently" domain="visitors" />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.analytics.loading')}</div>
      ) : !analytics ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.analytics.noData')}</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-[13px] font-semibold mb-3">{t('visitors.analytics.sections.byPurpose')}</h3>
            {Object.keys(analytics.by_purpose).length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[12px]">{t('visitors.analytics.emptySection')}</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(analytics.by_purpose).map(([purpose, count]) => (
                  <div key={purpose} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground capitalize">{purpose.replace(/_/g, ' ')}</span>
                    <span className="text-foreground font-medium">{count} {t('visitors.analytics.visitsSuffix')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-[13px] font-semibold mb-3">{t('visitors.analytics.sections.byStatus')}</h3>
            {Object.keys(analytics.by_status).length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[12px]">{t('visitors.analytics.emptySection')}</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(analytics.by_status).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground capitalize">{status.replace(/_/g, ' ')}</span>
                    <span className="text-foreground font-medium">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-[13px] font-semibold mb-3">{t('visitors.analytics.sections.dailyTrend')}</h3>
            {!analytics.daily_trend || analytics.daily_trend.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[12px]">{t('visitors.analytics.emptySection')}</div>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {analytics.daily_trend.map((d) => (
                  <div key={d.date} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground font-mono">{d.date}</span>
                    <span className="text-foreground font-medium">{d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-[13px] font-semibold mb-3">{t('visitors.analytics.sections.topVisitors')}</h3>
            {topVisitors.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[12px]">{t('visitors.analytics.emptySection')}</div>
            ) : (
              <div className="space-y-2">
                {topVisitors.map((v, i) => (
                  <div key={v.visitor_id} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-4">{i + 1}.</span>
                      <div>
                        <span className="font-medium text-foreground">{v.name}</span>
                        {v.company && <span className="text-muted-foreground ml-1.5">({v.company})</span>}
                      </div>
                    </div>
                    <span className="text-emerald-400 font-medium">{v.visit_count} {t('visitors.analytics.visitsSuffix')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
