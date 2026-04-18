import { useQuery } from '@tanstack/react-query';
import { PageHeader, StatCard } from '@dm3/ui';
import { getParkingDashboard, type ParkingDashboardDTO } from '@dm3/api-client';

export function ParkingDashboardPage() {
  const { data: dash, isLoading } = useQuery({
    queryKey: ['parking-dashboard'],
    queryFn: () => getParkingDashboard(),
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Parking Dashboard" description="Real-time parking overview" />
        <div className="text-center py-12 text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  const d = dash ?? ({} as Partial<ParkingDashboardDTO>);

  return (
    <div>
      <PageHeader title="Parking Dashboard" description="Real-time parking overview" />

      <div className="grid grid-cols-5 gap-3 mb-6">
        <StatCard label="Total Spaces" value={String(d.total_spaces ?? 0)} sub="capacity" domain="parking" />
        <StatCard label="Occupied" value={String(d.occupied_spaces ?? 0)} sub={`${(d.occupancy_percent ?? 0).toFixed(1)}%`} domain="parking" />
        <StatCard label="Available" value={String(d.available_spaces ?? 0)} sub="free spots" domain="parking" />
        <StatCard label="Entered Today" value={String(d.entered_today ?? 0)} sub="vehicles" domain="parking" />
        <StatCard label="Revenue Today" value={`${((d.revenue_today ?? 0) / 1000).toFixed(0)}k`} sub="VND" domain="parking" />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Active Sessions" value={String(d.active_sessions ?? 0)} sub="in progress" domain="parking" />
        <StatCard label="Pending Payments" value={String(d.pending_payments ?? 0)} sub="unpaid" domain="parking" />
        <StatCard label="Disputed" value={String(d.disputed_sessions ?? 0)} sub="sessions" domain="parking" />
      </div>

      <div className="rounded-lg border border-border p-4">
        <h3 className="text-[13px] font-semibold mb-3">Zone Occupancy</h3>
        {!d.zone_occupancy || d.zone_occupancy.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-[12px]">No zones configured</div>
        ) : (
          <div className="space-y-2">
            {d.zone_occupancy.map((z) => (
              <div key={z.zone_id} className="flex items-center gap-3">
                <span className="text-[12px] text-foreground font-medium w-32 truncate">{z.zone_name}</span>
                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(z.percent, 100)}%`,
                      backgroundColor: z.percent > 90 ? '#EF4444' : z.percent > 70 ? '#EAB308' : '#22C55E',
                    }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground w-20 text-right">
                  {z.occupied}/{z.total_spaces} ({z.percent.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
