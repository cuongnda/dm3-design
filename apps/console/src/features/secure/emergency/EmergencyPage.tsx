import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PageHeader,
  DataTable,
  type Column,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockResponsePlans, mockEmergencyEvents, emergencyTypeConfig } from './mock-data';
import type { EmergencyType, EmergencyEvent } from './mock-data';

const typeKeys: EmergencyType[] = ['fire', 'lockdown', 'medical', 'intruder'];

function ConfirmDialog({ type, onConfirm, onCancel }: { type: EmergencyType; onConfirm: () => void; onCancel: () => void }) {
  const [open, setOpen] = useState(true);
  const [count, setCount] = useState(3);
  const cfg = emergencyTypeConfig[type];

  useEffect(() => {
    if (count <= 0) { onConfirm(); return; }
    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, onConfirm]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false);
          onCancel();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-md border-[#334155] bg-[#111827] text-center sm:max-w-md"
      >
        <DialogHeader className="text-center sm:text-center">
          <div className="text-[48px] mb-2">{cfg.icon}</div>
          <DialogTitle className="text-[20px] font-bold text-[#F8FAFC]">
            {/* TODO: add i18n key */}Activate {cfg.label}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-[14px] text-[#94A3B8]">{/* TODO: add i18n key */}System will activate in...</p>
        <div className="text-[64px] font-bold" style={{ color: cfg.color }}>{count}</div>
        <DialogFooter className="sm:justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="border-[#334155] bg-[#1E293B] px-6 py-3 text-[14px] font-medium text-[#F8FAFC] hover:bg-[#334155]"
          >
            {/* TODO: add i18n key */}✕ Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmergencyPage() {
  const { t } = useTranslation('secure');
  const [activeEmergency, setActiveEmergency] = useState<EmergencyType | null>(null);
  const [confirming, setConfirming] = useState<EmergencyType | null>(null);

  const eventColumns: Column<EmergencyEvent>[] = [
    { key: 'time', header: /* TODO: add i18n key */'Time', width: '140px', sortable: true },
    {
      key: 'type', header: /* TODO: add i18n key */'Type', sortable: true,
      render: (r) => {
        const cfg = emergencyTypeConfig[r.type];
        return <span style={{ color: cfg.color }}>{cfg.icon} {cfg.label}</span>;
      },
    },
    { key: 'activatedBy', header: /* TODO: add i18n key */'Activated By' },
    { key: 'duration', header: /* TODO: add i18n key */'Duration', width: '100px' },
    {
      key: 'status', header: t('accessControl.table.status'),
      render: (r) => (
        <span className={r.status === 'active' ? 'text-[#EF4444] font-medium' : 'text-[#22C55E]'}>
          {r.status === 'active' ? `⚠ ${t('emergency.status.alert')}` : `✓ ${/* TODO: add i18n key */'Resolved'}`}
        </span>
      ),
    },
    { key: 'description', header: /* TODO: add i18n key */'Description' },
  ];

  const handleActivate = useCallback(() => {
    if (confirming) {
      setActiveEmergency(confirming);
      setConfirming(null);
    }
  }, [confirming]);

  const handleDeactivate = () => setActiveEmergency(null);

  return (
    <div>
      {confirming && <ConfirmDialog type={confirming} onConfirm={handleActivate} onCancel={() => setConfirming(null)} />}

      <PageHeader title={t('emergency.title')} description={t('emergency.description')} />

      {/* Active emergency banner */}
      {activeEmergency && (
        <div className="mb-6 p-4 rounded-lg border-2 animate-pulse" style={{ backgroundColor: `${emergencyTypeConfig[activeEmergency].color}15`, borderColor: emergencyTypeConfig[activeEmergency].color }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[32px]">{emergencyTypeConfig[activeEmergency].icon}</span>
              <div>
                <div className="text-[18px] font-bold" style={{ color: emergencyTypeConfig[activeEmergency].color }}>
                  ⚠ {t('emergency.status.emergency')}: {emergencyTypeConfig[activeEmergency].label.toUpperCase()}
                </div>
                <div className="text-[13px] text-[#94A3B8]">{/* TODO: add i18n key */}Active — All personnel follow safety procedures</div>
              </div>
            </div>
            <button
              onClick={handleDeactivate}
              className="px-4 py-2 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-lg text-[#22C55E] text-[13px] font-medium hover:bg-[#22C55E]/20 transition-colors"
            >
              {/* TODO: add i18n key */}✓ All Clear — Cancel Alarm
            </button>
          </div>
        </div>
      )}

      {/* Emergency buttons */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {typeKeys.map((type) => {
          const cfg = emergencyTypeConfig[type];
          const isActive = activeEmergency === type;
          return (
            <button
              key={type}
              onClick={() => !isActive && setConfirming(type)}
              disabled={isActive}
              className={cn(
                'p-6 rounded-xl border-2 text-center transition-all',
                isActive
                  ? 'animate-pulse'
                  : 'hover:scale-[1.02] active:scale-[0.98]'
              )}
              style={{
                backgroundColor: `${cfg.color}${isActive ? '25' : '10'}`,
                borderColor: `${cfg.color}${isActive ? '' : '40'}`,
              }}
            >
              <div className="text-[40px] mb-3">{cfg.icon}</div>
              <div className="text-[16px] font-bold" style={{ color: cfg.color }}>{cfg.label}</div>
              <div className="text-[12px] text-[#64748B] mt-1">{isActive ? t('emergency.status.emergency') : /* TODO: add i18n key */'Click to activate'}</div>
            </button>
          );
        })}
      </div>

      {/* Response plans */}
      <div className="mb-6">
        <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">{t('emergency.procedures.title')}</h2>
        <div className="grid grid-cols-2 gap-4">
          {mockResponsePlans.map((plan) => {
            const cfg = emergencyTypeConfig[plan.type];
            return (
              <div key={plan.id} className="bg-[#111827] border border-[#1E293B] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[18px]">{cfg.icon}</span>
                  <span className="text-[14px] font-semibold text-[#F8FAFC]">{plan.name}</span>
                </div>
                <div className="space-y-1.5 mb-3">
                  {plan.steps.map((step, i) => (
                    <div key={i} className="flex gap-2 text-[12px]">
                      <span className="text-[#64748B] shrink-0">{i + 1}.</span>
                      <span className="text-[#94A3B8]">{step}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#1E293B] pt-2">
                  {plan.contacts.map((c, i) => (
                    <div key={i} className="text-[11px] text-[#64748B]">📞 {c}</div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event log */}
      <div>
        <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">{t('emergency.history.title')}</h2>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-hidden">
          <DataTable columns={eventColumns} data={mockEmergencyEvents} rowKey={(r) => r.id} />
        </div>
      </div>
    </div>
  );
}
