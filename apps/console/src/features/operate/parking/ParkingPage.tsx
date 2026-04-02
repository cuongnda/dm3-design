import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { parkingSpots, parkingLogs, summary, type ParkingLog } from './mock-data';

const levels = ['B1', 'B2', 'B3'];

export function ParkingPage() {
  const { t } = useTranslation('operate');
  const [selectedLevel, setSelectedLevel] = useState('B1');

  const spotsForLevel = parkingSpots.filter(s => s.level === selectedLevel);
  const occupancyPct = Math.round(summary.occupied / summary.total * 100);

  const logCols: Column<ParkingLog>[] = [
    { key: 'time', header: t('parking.table.time'), width: '80px', sortable: true, render: r => <span className="font-mono text-[12px] text-muted-foreground">{r.time}</span> },
    { key: 'licensePlate', header: t('parking.table.plate'), sortable: true, render: r => <span className="font-mono font-medium text-foreground">{r.licensePlate}</span> },
    { key: 'ownerName', header: t('parking.table.driver'), sortable: true },
    { key: 'vehicleType', header: t('parking.table.type'), width: '80px' },
    { key: 'action', header: t('parking.table.action'), width: '80px', render: r => (
      <span className={cn('text-[12px] font-medium', r.action === 'entry' ? 'text-success' : 'text-operate')}>
        {r.action === 'entry' ? `⬇ ${t('parking.table.entry')}` : `⬆ ${t('parking.table.exit')}`}
      </span>
    )},
    { key: 'spot', header: t('parking.table.spot'), width: '90px' },
  ];

  return (
    <div>
      <PageHeader title={t('parking.title')} description={t('parking.description')}>
        <Button size="sm" className="bg-operate hover:bg-operate/90 text-background">📊 {t('common.report')}</Button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('parking.stats.totalSpots')} value={String(summary.total)} sub={t('common.sub.basements')} icon="🅿️" domain="operate" />
        <StatCard label={t('parking.stats.occupied')} value={String(summary.occupied)} sub={`${occupancyPct}% ${t('common.sub.capacity')}`} icon="🚗" domain="operate" />
        <StatCard label={t('parking.stats.available')} value={String(summary.available)} sub={t('common.sub.ready')} icon="✅" domain="operate" />
        <StatCard label={t('parking.stats.reserved')} value={String(summary.reserved)} sub={t('common.sub.privateSpot')} icon="🔒" domain="operate" />
      </div>

      {/* Parking grid */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-medium text-foreground">{t('parking.floorPlan')}</h3>
          <div className="flex gap-1">
            {levels.map(l => (
              <button type="button" key={l} onClick={() => setSelectedLevel(l)} className={cn(
                'px-3 py-1 rounded text-[12px] font-medium border',
                selectedLevel === l ? 'bg-operate/20 border-operate/50 text-operate' : 'bg-background border-border text-muted-foreground'
              )}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-10 gap-1">
          {spotsForLevel.slice(0, 50).map(spot => (
            <div key={spot.id} className={cn(
              'h-8 rounded text-[9px] flex items-center justify-center font-mono border',
              spot.status === 'occupied' ? 'bg-operate/20 border-operate/40 text-operate' :
              spot.status === 'reserved' ? 'bg-secure/20 border-secure/40 text-secure' :
              'bg-background border-border text-muted-foreground'
            )} title={spot.licensePlate || t('parking.stats.available')}>
              {spot.spot}
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3">
          {[
            { color: '#F59E0B', label: t('parking.stats.occupied') },
            { color: '#3B82F6', label: t('parking.stats.reserved') },
            { color: '#64748B', label: t('parking.stats.available') },
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: l.color + '33', border: `1px solid ${l.color}66` }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <h3 className="text-[14px] font-medium text-foreground mb-3">{t('parking.accessLog')}</h3>
      <DataTable columns={logCols} data={parkingLogs} rowKey={r => r.id} />
    </div>
  );
}
