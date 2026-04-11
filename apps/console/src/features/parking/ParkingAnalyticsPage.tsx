import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, StatCard, Button } from '@dm3/ui';
import { getParkingAnalytics } from '@dm3/api-client';

export function ParkingAnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['parking-analytics', period],
    queryFn: () => getParkingAnalytics(period),
  });

  return (
    <div>
      <PageHeader title="Parking Analytics" description="Insights and trends for parking operations">
        <div className="flex gap-1">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <Button
              key={p}
              size="xs"
              variant={period === p ? 'default' : 'outline'}
              onClick={() => setPeriod(p)}
              className={period === p ? 'bg-amber-600 hover:bg-amber-700' : ''}
            >
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </Button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Sessions" value={String(analytics?.total_sessions ?? 0)} sub={`last ${period}`} domain="parking" />
        <StatCard label="Total Revenue" value={`${(((analytics?.total_revenue ?? 0)) / 1000).toFixed(0)}k`} sub="VND" domain="parking" />
        <StatCard label="Avg Duration" value={analytics?.avg_duration_minutes != null ? `${Math.round(analytics.avg_duration_minutes)}m` : '—'} sub="per session" domain="parking" />
        <StatCard label="Avg Occupancy" value={analytics?.avg_occupancy_percent != null ? `${analytics.avg_occupancy_percent.toFixed(1)}%` : '—'} sub="average" domain="parking" />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading analytics...</div>
      ) : !analytics ? (
        <div className="text-center py-12 text-muted-foreground">No data for this period</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-[13px] font-semibold mb-3">By Vehicle Type</h3>
            {analytics.by_vehicle_type.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[12px]">No data</div>
            ) : (
              <div className="space-y-2">
                {analytics.by_vehicle_type.map((vt) => (
                  <div key={vt.vehicle_type} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground capitalize">{vt.vehicle_type}</span>
                    <div className="flex gap-4">
                      <span className="text-foreground font-medium">{vt.count} sessions</span>
                      <span className="text-amber-400">{vt.revenue.toLocaleString()} VND</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-[13px] font-semibold mb-3">By Payment Status</h3>
            {analytics.by_payment_status.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[12px]">No data</div>
            ) : (
              <div className="space-y-2">
                {analytics.by_payment_status.map((ps) => (
                  <div key={ps.status} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground capitalize">{ps.status}</span>
                    <span className="text-foreground font-medium">{ps.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-[13px] font-semibold mb-3">Daily Trend</h3>
            {analytics.daily_trend.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[12px]">No data</div>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {analytics.daily_trend.map((d) => (
                  <div key={d.date} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground font-mono">{d.date}</span>
                    <div className="flex gap-4">
                      <span className="text-foreground">{d.sessions} sessions</span>
                      <span className="text-amber-400">{d.revenue.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-[13px] font-semibold mb-3">Peak Hours</h3>
            {analytics.peak_hours.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[12px]">No data</div>
            ) : (
              <div className="space-y-1">
                {analytics.peak_hours.slice(0, 12).map((ph) => (
                  <div key={ph.hour} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground font-mono">{String(ph.hour).padStart(2, '0')}:00</span>
                    <div className="flex-1 mx-3 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${(ph.sessions / Math.max(...analytics.peak_hours.map((p) => p.sessions), 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-foreground w-10 text-right">{ph.sessions}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-4 col-span-2">
            <h3 className="text-[13px] font-semibold mb-3">Top Plates</h3>
            {analytics.top_plates.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[12px]">No data</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {analytics.top_plates.map((tp, i) => (
                  <div key={tp.plate_number} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-4">{i + 1}.</span>
                      <span className="font-mono font-medium text-foreground">{tp.plate_number}</span>
                      <span className="text-muted-foreground capitalize">({tp.vehicle_type})</span>
                    </div>
                    <span className="text-amber-400 font-medium">{tp.visit_count} visits</span>
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
