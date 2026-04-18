import { useState } from 'react';
import { PageHeader } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { domainReports, occupancyData, accessTrend, energyTrend } from './mock-data';

function MiniBarChart({ data, color, height = 150 }: { data: { label: string; value: number }[]; color: string; height?: number }) {
  const max = Math.max(...data.map(d => d.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map(d => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] font-medium" style={{ color }}>{d.value}</span>
          <div className="w-full rounded-t" style={{ height: (d.value / max) * (height - 30), backgroundColor: color + '33', border: `1px solid ${color}66` }} />
          <span className="text-[10px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('week');

  return (
    <div>
      <PageHeader title="Phân tích & Báo cáo" description="Tổng quan dữ liệu đa lĩnh vực">
        <div className="flex gap-1">
          {[
            { key: 'week', label: 'Tuần' },
            { key: 'month', label: 'Tháng' },
            { key: 'quarter', label: 'Quý' },
          ].map(r => (
            <button type="button" key={r.key} onClick={() => setDateRange(r.key)} className={cn(
              'px-3 py-1.5 rounded-md text-[12px] font-medium border',
              dateRange === r.key ? 'bg-smart/20 border-smart/50 text-smart' : 'bg-card border-border text-muted-foreground'
            )}>{r.label}</button>
          ))}
        </div>
      </PageHeader>

      {/* Domain report cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {domainReports.map(dr => (
          <div key={dr.domain} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span>{dr.icon}</span>
              <span className="text-[13px] font-semibold" style={{ color: dr.color }}>{dr.domain}</span>
            </div>
            <div className="space-y-2">
              {dr.metrics.map(m => (
                <div key={m.label} className="flex items-center justify-between">
                  <span className="text-[12px] text-muted-foreground">{m.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-foreground">{m.value}</span>
                    <span className={cn('text-[10px]', m.direction === 'up' ? 'text-success' : 'text-error')}>
                      {m.direction === 'up' ? '↑' : '↓'}{m.change}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[14px] font-medium text-foreground mb-4">Tỷ lệ lấp đầy (Tuần)</h3>
          <MiniBarChart data={occupancyData} color="#8B5CF6" />
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[14px] font-medium text-foreground mb-4">Lượt ra vào (Hôm nay)</h3>
          <MiniBarChart data={accessTrend} color="#3B82F6" />
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[14px] font-medium text-foreground mb-4">Điện năng tiêu thụ (MWh)</h3>
          <MiniBarChart data={energyTrend} color="#F59E0B" />
        </div>
      </div>
    </div>
  );
}
