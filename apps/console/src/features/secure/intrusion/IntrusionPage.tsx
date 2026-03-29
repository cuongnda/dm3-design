import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockZones, mockSensors, mockAlarmEvents } from './mock-data';
import type { Zone, Sensor, AlarmEvent, ZoneStatus, SensorStatus, AlarmSeverity, AlarmStatus } from './mock-data';

function getZoneStatusConfig(t: ReturnType<typeof useTranslation<'secure'>>['t']): Record<ZoneStatus, { label: string; bg: string; text: string }> {
  return {
    armed: { label: t('intrusion.status.armed'), bg: 'bg-[#22C55E]/15', text: 'text-[#22C55E]' },
    disarmed: { label: t('intrusion.status.disarmed'), bg: 'bg-[#64748B]/15', text: 'text-[#94A3B8]' },
    alarm: { label: t('intrusion.status.alarm'), bg: 'bg-[#EF4444]/15', text: 'text-[#EF4444]' },
  };
}

const sensorStatusColor: Record<SensorStatus, string> = {
  normal: 'bg-[#22C55E]',
  triggered: 'bg-[#EF4444] animate-pulse',
  offline: 'bg-[#64748B]',
  tampered: 'bg-[#EAB308]',
};

const severityColor: Record<AlarmSeverity, string> = {
  critical: 'text-[#EF4444]',
  high: 'text-[#F59E0B]',
  medium: 'text-[#3B82F6]',
  low: 'text-[#94A3B8]',
};

function getAlarmStatusConfig(t: ReturnType<typeof useTranslation<'secure'>>['t']): Record<AlarmStatus, { label: string; cls: string }> {
  return {
    active: { label: /* TODO: add i18n key */'Active', cls: 'text-[#EF4444]' },
    acknowledged: { label: /* TODO: add i18n key */'Acknowledged', cls: 'text-[#F59E0B]' },
    resolved: { label: /* TODO: add i18n key */'Resolved', cls: 'text-[#22C55E]' },
  };
}

function ZoneCard({ zone, selected, onClick }: { zone: Zone; selected: boolean; onClick: () => void }) {
  const { t } = useTranslation('secure');
  const zoneStatusConfig = getZoneStatusConfig(t);
  const [status, setStatus] = useState(zone.status);
  const cfg = zoneStatusConfig[status];

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStatus((s) => (s === 'alarm' ? 'armed' : s === 'armed' ? 'disarmed' : 'armed'));
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-4 rounded-lg border bg-[#111827] cursor-pointer transition-all',
        selected ? 'border-[#3B82F6]' : 'border-[#1E293B] hover:border-[#334155]',
        status === 'alarm' && 'border-[#EF4444]/50'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-medium text-[#F8FAFC]">{zone.name}</span>
        <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium', cfg.bg, cfg.text)}>{cfg.label}</span>
      </div>
      <div className="text-[11px] text-[#64748B] mb-3">{zone.floor} · {zone.sensorCount} {/* TODO: add i18n key */}sensors</div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#475569]">{/* TODO: add i18n key */}Last event: {zone.lastEvent}</span>
        <button
          onClick={toggle}
          className={cn(
            'px-2.5 py-1 rounded text-[11px] font-medium border transition-colors',
            status === 'armed'
              ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E] hover:bg-[#22C55E]/20'
              : status === 'alarm'
                ? 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/20'
                : 'bg-[#1E293B] border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC]'
          )}
        >
          {status === 'armed' ? t('intrusion.actions.disarm') : t('intrusion.actions.arm')}
        </button>
      </div>
    </div>
  );
}

function SensorList({ sensors }: { sensors: Sensor[] }) {
  const { t } = useTranslation('secure');
  if (!sensors.length) return <div className="text-[13px] text-[#64748B] p-4">{/* TODO: add i18n key */}Select a zone to view sensors</div>;
  return (
    <div className="space-y-1.5">
      {sensors.map((s) => (
        <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-[#111827] rounded-lg border border-[#1E293B]">
          <span className={cn('w-2 h-2 rounded-full shrink-0', sensorStatusColor[s.status])} />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-[#F8FAFC]">{s.name} <span className="text-[#64748B]">({s.type})</span></div>
            <div className="text-[11px] text-[#64748B]">{s.location}</div>
          </div>
          <div className="text-[11px] text-[#64748B]">{s.battery}%</div>
        </div>
      ))}
    </div>
  );
}

export function IntrusionPage() {
  const { t } = useTranslation('secure');
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const zoneSensors = selectedZone ? mockSensors.filter((s) => s.zoneId === selectedZone) : [];

  const alarmStatusConfig = getAlarmStatusConfig(t);

  const alarmColumns: Column<AlarmEvent>[] = [
    { key: 'time', header: /* TODO: add i18n key */'Time', width: '140px', sortable: true },
    { key: 'zone', header: 'Zone', sortable: true },
    { key: 'type', header: /* TODO: add i18n key */'Type', sortable: true },
    {
      key: 'severity', header: /* TODO: add i18n key */'Severity', sortable: true,
      render: (r) => <span className={cn('font-medium capitalize', severityColor[r.severity])}>{r.severity}</span>,
    },
    {
      key: 'status', header: t('accessControl.table.status'),
      render: (r) => <span className={alarmStatusConfig[r.status].cls}>{alarmStatusConfig[r.status].label}</span>,
    },
    { key: 'description', header: /* TODO: add i18n key */'Description' },
  ];

  const armed = mockZones.filter((z) => z.status === 'armed').length;
  const alarmCount = mockZones.filter((z) => z.status === 'alarm').length;
  const offlineSensors = mockSensors.filter((s) => s.status === 'offline' || s.status === 'tampered').length;

  return (
    <div>
      <PageHeader title={t('intrusion.title')} description={t('intrusion.description')} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label={t('intrusion.zones.title')} value={String(mockZones.length)} sub={`${armed} ${t('intrusion.status.armed').toLowerCase()}`} icon="🛡️" domain="secure" />
        <StatCard label={t('intrusion.status.alarm')} value={String(alarmCount)} sub={/* TODO: add i18n key */"Zones alarming"} icon="🚨" domain="error" />
        <StatCard label={/* TODO: add i18n key */"Sensors"} value={String(mockSensors.length)} sub={`${offlineSensors} ${/* TODO: add i18n key */"errors"}`} icon="📡" domain="default" />
        <StatCard label={/* TODO: add i18n key */"Events Today"} value={String(mockAlarmEvents.filter((e) => e.time.startsWith('2026-02-19')).length)} sub={/* TODO: add i18n key */"In last 24h"} icon="📋" domain="secure" />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Zone list */}
        <div className="col-span-2">
          <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">{t('intrusion.zones.title')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {mockZones.map((z) => (
              <ZoneCard key={z.id} zone={z} selected={selectedZone === z.id} onClick={() => setSelectedZone(z.id)} />
            ))}
          </div>
        </div>

        {/* Right side: sensors + map */}
        <div className="space-y-4">
          <div>
            <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">
              {/* TODO: add i18n key */}Sensors {selectedZone ? `- ${mockZones.find((z) => z.id === selectedZone)?.name}` : ''}
            </h2>
            <SensorList sensors={zoneSensors} />
          </div>
          {/* Floor plan placeholder */}
          <div className="aspect-[4/3] bg-[#0D1117] border border-[#1E293B] rounded-lg flex items-center justify-center">
            <div className="text-center">
              <svg className="w-8 h-8 text-[#334155] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
              </svg>
              <span className="text-[13px] text-[#475569] font-medium">{/* TODO: add i18n key */}Floor Plan</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alarm history */}
      <div>
        <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">{t('intrusion.history.title')}</h2>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-hidden">
          <DataTable columns={alarmColumns} data={mockAlarmEvents} rowKey={(r) => r.id} />
        </div>
      </div>
    </div>
  );
}
