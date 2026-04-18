import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, BarChart3, CheckCircle2, Cpu, Droplet, Droplets, Lightbulb, Radio, Siren, Thermometer, Wallet, Wind, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { sensors, energyData, alerts, summary } from './mock-data';

const typeIcons: Record<string, LucideIcon> = {
  temperature: Thermometer, humidity: Droplet, power: Zap, water: Droplets, 'air-quality': Wind, light: Lightbulb,
};

const statusColors: Record<string, string> = {
  normal: '#22C55E', warning: '#EAB308', critical: '#EF4444', offline: '#64748B',
};

export function IoTEnergyPage() {
  const { t } = useTranslation('operate');

  return (
    <div>
      <PageHeader title={t('iotEnergy.title')} description={t('iotEnergy.description')}>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F59E0B] text-[#0F172A] rounded-md text-[12px] font-medium">
          <BarChart3 size={14} /> {t('common.energyReport')}
        </button>
      </PageHeader>

      <div className="grid grid-cols-6 gap-3 mb-6">
        <StatCard label={t('iotEnergy.stats.sensors')} value={String(summary.totalSensors)} sub={t('common.sub.total')} icon={<Radio size={14} />} domain="operate" />
        <StatCard label={t('iotEnergy.stats.online')} value={String(summary.online)} sub={t('common.sub.active')} icon={<CheckCircle2 size={14} />} domain="operate" />
        <StatCard label={t('iotEnergy.stats.warnings')} value={String(summary.warnings)} sub={t('common.sub.needsAttention')} icon={<AlertTriangle size={14} />} domain="operate" />
        <StatCard label={t('iotEnergy.stats.critical')} value={String(summary.critical)} sub={t('common.sub.critical')} icon={<Siren size={14} />} domain="error" />
        <StatCard label={t('iotEnergy.stats.monthlyElectricity')} value={summary.monthlyElectricity} sub="kWh" icon={<Zap size={14} />} domain="operate" />
        <StatCard label={t('iotEnergy.stats.cost')} value={summary.monthlyCost} sub="Tháng 2/2025" icon={<Wallet size={14} />} domain="operate" />
      </div>

      {/* Alerts */}
      {alerts.filter(a => !a.acknowledged).length > 0 && (
        <div className="bg-[#7F1D1D]/20 border border-[#EF4444]/30 rounded-lg p-4 mb-6">
          <h3 className="text-[14px] font-medium text-[#EF4444] mb-3 inline-flex items-center gap-2">
            <Siren size={14} /> {t('iotEnergy.alerts.unprocessed')}
          </h3>
          <div className="space-y-2">
            {alerts.filter(a => !a.acknowledged).map(a => (
              <div key={a.id} className="flex items-center justify-between bg-[#111827] rounded-md p-3">
                <div>
                  <span className={cn('text-[12px] font-medium inline-flex items-center gap-1.5', a.type === 'critical' ? 'text-[#EF4444]' : 'text-[#EAB308]')}>
                    {a.type === 'critical' ? <AlertCircle size={12} /> : <AlertTriangle size={12} />}
                    {a.sensorName}
                  </span>
                  <div className="text-[11px] text-[#94A3B8]">{a.message}</div>
                </div>
                <span className="text-[11px] text-[#64748B]">{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Energy chart placeholder */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-4 mb-6">
        <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-3">{t('iotEnergy.energyConsumption')}</h3>
        <div className="flex items-end gap-3 h-[200px]">
          {energyData.map(d => {
            const maxE = 50000;
            const h = (d.electricity / maxE) * 180;
            return (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-[#F59E0B] font-medium">{(d.electricity / 1000).toFixed(0)}k</span>
                <div className="w-full rounded-t" style={{ height: h, backgroundColor: '#F59E0B33', border: '1px solid #F59E0B66' }} />
                <span className="text-[11px] text-[#64748B]">{d.month}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sensor grid */}
      <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-3">{t('iotEnergy.sensorBoard')}</h3>
      <div className="grid grid-cols-6 gap-2">
        {sensors.map(s => {
          const SensorIcon = typeIcons[s.type] ?? Cpu;
          return (
            <div key={s.id} className={cn(
              'bg-[#1E293B] border rounded-lg p-3',
              s.status === 'critical' ? 'border-[#EF4444]/50' :
              s.status === 'warning' ? 'border-[#EAB308]/50' :
              'border-[#334155]'
            )}>
              <div className="flex items-center justify-between mb-1">
                <SensorIcon size={12} className="text-[#94A3B8]" />
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColors[s.status] }} />
              </div>
              <div className="text-[16px] font-semibold text-[#F8FAFC]">{s.value}<span className="text-[11px] text-[#64748B] ml-1">{s.unit}</span></div>
              <div className="text-[10px] text-[#64748B] truncate">{s.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
