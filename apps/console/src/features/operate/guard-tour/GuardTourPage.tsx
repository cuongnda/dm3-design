import { useTranslation } from 'react-i18next';
import { AlertTriangle, BarChart3, Footprints, MapPin, Map as MapIcon } from 'lucide-react';
import { PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { routes, checkpoints, tourLogs, summary, type TourLog, type PatrolRoute } from './mock-data';

export function GuardTourPage() {
  const { t } = useTranslation('operate');

  const routeStatusCfg: Record<string, { color: string; label: string }> = {
    active: { color: '#22C55E', label: t('guardTour.routeStatus.active') },
    'in-progress': { color: '#F59E0B', label: t('guardTour.status.onPatrol') },
    completed: { color: '#3B82F6', label: t('guardTour.logStatus.completed') },
    missed: { color: '#EF4444', label: t('guardTour.status.missed') },
  };

  const logStatusCfg: Record<string, { color: string; label: string }> = {
    completed: { color: '#22C55E', label: t('guardTour.logStatus.completed') },
    'in-progress': { color: '#F59E0B', label: t('guardTour.logStatus.inProgress') },
    incomplete: { color: '#EF4444', label: t('guardTour.logStatus.incomplete') },
  };

  const logCols: Column<TourLog>[] = [
    { key: 'date', header: t('roomBooking.table.date'), width: '100px', sortable: true },
    { key: 'routeName', header: t('guardTour.table.tour'), sortable: true, render: r => <span className="font-medium text-[#F8FAFC]">{r.routeName}</span> },
    { key: 'guardName', header: t('guardTour.table.guard'), sortable: true },
    { key: 'startTime', header: t('guardTour.table.startTime'), width: '80px', render: r => <span className="font-mono text-[12px]">{r.startTime}</span> },
    { key: 'endTime', header: t('guardTour.table.endTime'), width: '80px', render: r => <span className="font-mono text-[12px]">{r.endTime || '—'}</span> },
    { key: 'checkpointsScanned', header: t('guardTour.checkpoints'), width: '90px', render: r => (
      <span className={cn('text-[12px] font-medium', r.checkpointsScanned === r.checkpointsTotal ? 'text-[#22C55E]' : 'text-[#F59E0B]')}>
        {r.checkpointsScanned}/{r.checkpointsTotal}
      </span>
    )},
    { key: 'status', header: t('guardTour.table.status'), width: '120px', render: r => {
      const s = logStatusCfg[r.status];
      return <span className="text-[12px] font-medium" style={{ color: s.color }}>{s.label}</span>;
    }},
  ];

  return (
    <div>
      <PageHeader title={t('guardTour.title')} description={t('guardTour.description')}>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F59E0B] text-[#0F172A] rounded-md text-[12px] font-medium"><BarChart3 size={14} /> {t('common.report')}</button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('guardTour.stats.activeTours')} value={String(summary.totalRoutes)} sub={t('common.sub.established')} icon={<MapIcon size={14} />} domain="operate" />
        <StatCard label={t('guardTour.stats.onPatrol')} value={String(summary.activeNow)} sub={t('common.sub.current')} icon={<Footprints size={14} />} domain="operate" />
        <StatCard label={t('guardTour.stats.missed')} value={String(summary.missedToday)} sub={t('common.sub.needsCheck')} icon={<AlertTriangle size={14} />} domain="error" />
        <StatCard label={t('guardTour.checkpointStatus')} value={String(summary.totalCheckpoints)} sub={t('common.sub.total')} icon={<MapPin size={14} />} domain="operate" />
      </div>

      {/* Route cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {routes.map((route: PatrolRoute) => {
          const st = routeStatusCfg[route.status];
          return (
            <div key={route.id} className="bg-[#1E293B] border border-[#334155] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-[#64748B]">{route.id}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: st.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.color }} />
                  {st.label}
                </span>
              </div>
              <div className="text-[13px] font-medium text-[#F8FAFC] mb-1">{route.name}</div>
              <div className="text-[11px] text-[#64748B] mb-2">{route.assignedGuard}</div>
              <div className="flex justify-between text-[11px] text-[#94A3B8]">
                <span>{route.checkpoints} {t('guardTour.checkpoints')}</span>
                <span>{route.frequency}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Checkpoint status */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-4 mb-6">
        <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-3">{t('guardTour.checkpointStatus')}</h3>
        <div className="grid grid-cols-6 gap-2">
          {checkpoints.map(cp => (
            <div key={cp.id} className={cn(
              'p-2 rounded border text-center',
              cp.status === 'scanned' ? 'bg-[#22C55E]/10 border-[#22C55E]/30' :
              cp.status === 'missed' ? 'bg-[#EF4444]/10 border-[#EF4444]/30' :
              'bg-[#111827] border-[#334155]'
            )}>
              <div className="text-[11px] font-medium text-[#F8FAFC]">{cp.name}</div>
              <div className="text-[10px] text-[#64748B]">{cp.scannedAt || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-3">{t('guardTour.tourLog')}</h3>
      <DataTable columns={logCols} data={tourLogs} rowKey={r => r.id} />
    </div>
  );
}
