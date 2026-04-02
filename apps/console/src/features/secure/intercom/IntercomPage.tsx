import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockDevices, mockCallRecords } from './mock-data';
import type { IntercomDevice, CallRecord, DeviceStatus, CallResult } from './mock-data';

const statusConfig: Record<DeviceStatus, { label: string; dot: string; text: string }> = {
  online: { label: 'Online', dot: 'bg-success', text: 'text-success' },
  offline: { label: 'Offline', dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
  busy: { label: 'Busy', dot: 'bg-warning animate-pulse', text: 'text-warning' },
};

function getResultConfig(t: ReturnType<typeof useTranslation<'secure'>>['t']): Record<CallResult, { label: string; cls: string }> {
  return {
    answered: { label: t('intercom.calls.answered'), cls: 'text-success' },
    missed: { label: t('intercom.calls.missed'), cls: 'text-error' },
    rejected: { label: /* TODO: add i18n key */'Rejected', cls: 'text-warning' },
    busy: { label: /* TODO: add i18n key */'Busy', cls: 'text-muted-foreground' },
  };
}

function DeviceCard({ device, selected, onClick }: { device: IntercomDevice; selected: boolean; onClick: () => void }) {
  const sc = statusConfig[device.status];
  const isDoor = device.type === 'door-station';
  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 rounded-lg border bg-card cursor-pointer transition-all',
        selected ? 'border-secure' : 'border-border hover:border-muted-foreground'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-[16px]', isDoor ? 'bg-secure/10' : 'bg-manage/10')}>
          {isDoor ? '🚪' : '📺'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-foreground truncate">{device.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{device.location}</div>
        </div>
        <span className="inline-flex items-center gap-1">
          <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
          <span className={cn('text-[11px]', sc.text)}>{sc.label}</span>
        </span>
      </div>
    </div>
  );
}

function ConfigPanel({ device }: { device: IntercomDevice | null }) {
  if (!device) return (
    <div className="p-6 text-center text-[13px] text-muted-foreground">{/* TODO: add i18n key */}Select a device to view configuration</div>
  );
  const fields = [
    { label: /* TODO: add i18n key */'Name', value: device.name },
    { label: /* TODO: add i18n key */'Type', value: device.type === 'door-station' ? 'Door Station' : 'Indoor Monitor' },
    { label: /* TODO: add i18n key */'Location', value: device.location },
    { label: 'IP', value: device.ip },
    { label: /* TODO: add i18n key */'Firmware', value: device.firmware },
    { label: /* TODO: add i18n key */'Last Seen', value: device.lastSeen },
  ];
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.label} className="flex items-center justify-between px-3 py-2 bg-background rounded border border-border">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{f.label}</span>
          <span className="text-[12px] text-foreground font-medium">{f.value}</span>
        </div>
      ))}
      <button type="button" className="w-full py-2 bg-secure/10 border border-secure/30 rounded-lg text-[12px] text-secure font-medium hover:bg-secure/20 transition-colors">
        {/* TODO: add i18n key */}Restart Device
      </button>
    </div>
  );
}

export function IntercomPage() {
  const { t } = useTranslation('secure');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedDevice = mockDevices.find((d) => d.id === selectedId) ?? null;

  const resultConfig = getResultConfig(t);

  const callColumns: Column<CallRecord>[] = [
    { key: 'time', header: /* TODO: add i18n key */'Time', width: '140px', sortable: true },
    { key: 'caller', header: t('intercom.calls.incoming'), sortable: true },
    { key: 'receiver', header: t('intercom.calls.answered'), sortable: true },
    { key: 'duration', header: /* TODO: add i18n key */'Duration', width: '100px' },
    {
      key: 'result', header: /* TODO: add i18n key */'Result',
      render: (r) => <span className={resultConfig[r.result].cls}>{resultConfig[r.result].label}</span>,
    },
  ];

  const online = mockDevices.filter((d) => d.status === 'online').length;
  const doorStations = mockDevices.filter((d) => d.type === 'door-station').length;
  const answered = mockCallRecords.filter((c) => c.result === 'answered').length;
  const missed = mockCallRecords.filter((c) => c.result === 'missed').length;

  return (
    <div>
      <PageHeader title={t('intercom.title')} description={t('intercom.description')} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label={t('intercom.devices.title')} value={String(mockDevices.length)} sub={`${online} online`} icon="📡" domain="secure" />
        <StatCard label="Door Station" value={String(doorStations)} sub={/* TODO: add i18n key */"Door stations"} icon="🚪" domain="secure" />
        <StatCard label={t('intercom.calls.answered')} value={String(answered)} sub={`/${mockCallRecords.length} calls`} icon="✅" domain="default" />
        <StatCard label={t('intercom.calls.missed')} value={String(missed)} sub={/* TODO: add i18n key */"Needs review"} icon="📵" domain="error" />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Device list */}
        <div className="col-span-2">
          <h2 className="text-[14px] font-semibold text-foreground mb-3">{t('intercom.devices.title')}</h2>
          <div className="grid grid-cols-2 gap-2">
            {mockDevices.map((d) => (
              <DeviceCard key={d.id} device={d} selected={selectedId === d.id} onClick={() => setSelectedId(d.id)} />
            ))}
          </div>
        </div>

        {/* Config panel */}
        <div>
          <h2 className="text-[14px] font-semibold text-foreground mb-3">{/* TODO: add i18n key */}Device Configuration</h2>
          <div className="bg-card border border-border rounded-lg p-4">
            <ConfigPanel device={selectedDevice} />
          </div>
        </div>
      </div>

      {/* Call history */}
      <div>
        <h2 className="text-[14px] font-semibold text-foreground mb-3">{t('intercom.calls.title')}</h2>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <DataTable columns={callColumns} data={mockCallRecords} rowKey={(r) => r.id} />
        </div>
      </div>
    </div>
  );
}
