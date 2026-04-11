import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, StatCard, Button } from '@dm3/ui';
import { getVisitorAnalytics, getTopVisitors, type VisitorAnalyticsDTO, type TopVisitorDTO } from '@dm3/api-client';

export function VisitorAnalyticsPage() {
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('week');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const { data: analytics = [], isLoading } = useQuery({
    queryKey: ['visitor-analytics', groupBy],
    queryFn: () => getVisitorAnalytics({ from: thirtyDaysAgo, to: today, group_by: groupBy }),
  });

  const { data: topVisitors = [] } = useQuery({
    queryKey: ['visitor-top'],
    queryFn: () => getTopVisitors({ limit: 10 }),
  });

  const totals = analytics.reduce(
    (acc, a) => ({
      visits: acc.visits + a.total_visits,
      unique: acc.unique + a.unique_visitors,
      avgDuration: acc.avgDuration + a.avg_duration_minutes,
    }),
    { visits: 0, unique: 0, avgDuration: 0 }
  );
  const avgDuration = analytics.length > 0 ? Math.round(totals.avgDuration / analytics.length) : 0;

  return (
    <div>
      <PageHeader title="Visitor Analytics" description="Insights and trends for visitor activity">
        <div className="flex gap-1">
          {(['day', 'week', 'month'] as const).map((g) => (
            <Button
              key={g}
              size="xs"
              variant={groupBy === g ? 'default' : 'outline'}
              onClick={() => setGroupBy(g)}
              className={groupBy === g ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </Button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Visits" value={String(totals.visits)} sub="last 30 days" domain="visitors" />
        <StatCard label="Unique Visitors" value={String(totals.unique)} sub="last 30 days" domain="visitors" />
        <StatCard label="Avg Duration" value={`${avgDuration}m`} sub="per visit" domain="visitors" />
        <StatCard label="Top Visitors" value={String(topVisitors.length)} sub="frequent" domain="visitors" />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading analytics...</div>
      ) : analytics.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No visitor data for this period</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-[13px] font-semibold mb-3">Visits by Period</h3>
            <div className="space-y-2">
              {analytics.map((a) => (
                <div key={a.period} className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">{a.period}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-foreground font-medium">{a.total_visits} visits</span>
                    <span className="text-muted-foreground">{a.unique_visitors} unique</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-[13px] font-semibold mb-3">Top Visitors</h3>
            {topVisitors.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[12px]">No data</div>
            ) : (
              <div className="space-y-2">
                {topVisitors.map((v, i) => (
                  <div key={v.visitor_id} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-4">{i + 1}.</span>
                      <div>
                        <span className="font-medium text-foreground">{v.visitor_name}</span>
                        {v.visitor_company && <span className="text-muted-foreground ml-1.5">({v.visitor_company})</span>}
                      </div>
                    </div>
                    <span className="text-emerald-400 font-medium">{v.visit_count} visits</span>
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
