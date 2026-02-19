import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { EventFeed } from '@/components/common/EventFeed';
import { cn } from '@/lib/utils';
import type { AccessEvent, DomainHealth } from '@/types/models';

// Mock data
const stats = [
  { label: 'People in Building', value: '1,247', sub: 'currently inside', trend: { direction: 'up' as const, text: '12% from yesterday' }, icon: '👥', domain: 'default' as const },
  { label: 'Doors Online', value: '48/52', sub: 'access points', trend: { direction: 'down' as const, text: '4 offline' }, icon: '🔒', domain: 'secure' as const },
  { label: 'Cameras', value: '31/32', sub: 'streaming', trend: { direction: 'down' as const, text: '1 offline' }, icon: '📹', domain: 'secure' as const },
  { label: 'Active Alerts', value: '3', sub: 'need attention', trend: { direction: 'down' as const, text: '2 critical' }, icon: '⚠️', domain: 'error' as const },
  { label: 'Parking', value: '78%', sub: '312 / 400 spots', trend: { direction: 'up' as const, text: '5% from last week' }, icon: '🅿️', domain: 'operate' as const },
];

const events: AccessEvent[] = [
  { id: '1', time: '09:15', personName: 'Nguyen Van A', point: 'Door 3', result: 'granted' },
  { id: '2', time: '09:14', personName: 'Tran Thi B', point: 'Gate 1', result: 'granted' },
  { id: '3', time: '09:12', personName: 'UNKNOWN', point: 'Door 7', result: 'denied' },
  { id: '4', time: '09:11', personName: 'Le Van C', point: 'Lift 2', result: 'granted' },
  { id: '5', time: '09:10', personName: 'Pham Thi D', point: 'Door 1', result: 'granted' },
  { id: '6', time: '09:09', personName: 'Visitor #42', point: 'Gate 1', result: 'granted' },
  { id: '7', time: '09:08', personName: 'Ho Van E', point: 'Turnstile 1', result: 'granted' },
  { id: '8', time: '09:06', personName: 'Vu Thi F', point: 'Door 5', result: 'granted' },
];

const alerts = [
  { id: '1', title: 'Door 5 forced open', meta: 'Building A, Floor 3 · 2m ago', severity: 'critical' },
  { id: '2', title: 'Intrusion alarm — Zone B', meta: 'Perimeter sensor · 5m ago', severity: 'critical' },
  { id: '3', title: 'NVR-02 storage at 90%', meta: 'Camera storage · 12m ago', severity: 'warning' },
  { id: '4', title: 'Door 12 reader offline', meta: 'Building B, Floor 1 · 28m ago', severity: 'info' },
  { id: '5', title: 'Scheduled maintenance due', meta: 'Turnstile 3 · 1h ago', severity: 'info' },
];

const domainHealthData: { domain: string; color: string; emoji: string; items: DomainHealth[] }[] = [
  {
    domain: 'SECURE', color: '#3B82F6', emoji: '🔒',
    items: [
      { module: 'Access Control', status: 'ok', detail: '✓ Online' },
      { module: 'CCTV', status: 'warning', detail: '⚠ 1 offline' },
      { module: 'Intrusion Detection', status: 'ok', detail: '✓ Armed' },
      { module: 'Intercom', status: 'ok', detail: '✓ Online' },
      { module: 'AI Detection', status: 'ok', detail: '✓ Active' },
    ],
  },
  {
    domain: 'MANAGE', color: '#8B5CF6', emoji: '👤',
    items: [
      { module: 'Identities', status: 'ok', detail: '✓ 1,247 active' },
      { module: 'Visitors', status: 'ok', detail: '✓ 3 waiting' },
      { module: 'Attendance', status: 'ok', detail: '✓ 892 checked in' },
      { module: 'Contractors', status: 'ok', detail: '✓ 34 on-site' },
      { module: 'Deliveries', status: 'warning', detail: '⚠ 2 uncollected' },
    ],
  },
  {
    domain: 'OPERATE', color: '#F59E0B', emoji: '🏢',
    items: [
      { module: 'Room Booking', status: 'ok', detail: '✓ 3/12 in use' },
      { module: 'Parking', status: 'ok', detail: '✓ 78% full' },
      { module: 'Maintenance', status: 'warning', detail: '⚠ 2 overdue' },
      { module: 'Guard Tour', status: 'ok', detail: '✓ On schedule' },
      { module: 'IoT & Energy', status: 'ok', detail: '✓ 142 kWh today' },
    ],
  },
];

const severityDot: Record<string, string> = {
  critical: 'bg-[#EF4444]',
  warning: 'bg-[#EAB308]',
  info: 'bg-[#3B82F6]',
};

const healthStatusClass: Record<string, string> = {
  ok: 'text-[#22C55E]',
  warning: 'text-[#EAB308]',
  critical: 'text-[#EF4444]',
};

export function DashboardPage() {
  return (
    <div>
      <PageHeader title="Dashboard">
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#F8FAFC] text-[12px]">
            🏢 Landmark 81 ▾
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#F8FAFC] text-[12px]">
            📅 Today ▾
          </button>
        </div>
      </PageHeader>

      {/* Stat Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Middle: Events + Alerts */}
      <div className="grid grid-cols-[1.8fr_1fr] gap-4 mb-6">
        {/* Live Events */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#334155]">
            <div className="text-[13px] font-semibold flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-[#22C55E] rounded-full animate-pulse-live" />
              Access Events (Live)
            </div>
            <span className="text-[12px] text-[#3B82F6] cursor-pointer hover:underline">View All →</span>
          </div>
          <div className="px-4 py-3">
            {/* Sparkline placeholder */}
            <div className="h-10 mb-3 rounded bg-gradient-to-b from-transparent to-[#3B82F6]/10 relative overflow-hidden">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 40" preserveAspectRatio="none">
                <path d="M0,35 Q20,30 40,28 T80,20 T120,25 T160,15 T200,10 T240,18 T280,8 T320,12 T360,6 T400,10" fill="none" stroke="#3B82F6" strokeWidth="2" />
              </svg>
            </div>
            <EventFeed events={events} />
          </div>
        </div>

        {/* Active Alerts */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#334155]">
            <div className="text-[13px] font-semibold">⚠️ Active Alerts</div>
            <span className="text-[12px] text-[#3B82F6] cursor-pointer hover:underline">View All →</span>
          </div>
          <div className="px-4 py-3 space-y-0">
            {alerts.map((a) => (
              <div key={a.id} className="flex gap-2.5 py-2.5 border-b border-[#1E293B]/50 last:border-0">
                <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', severityDot[a.severity])} />
                <div>
                  <div className="text-[13px] font-medium text-[#F8FAFC]">{a.title}</div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">{a.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Domain Health */}
      <div className="grid grid-cols-3 gap-4">
        {domainHealthData.map((d) => (
          <div key={d.domain} className="bg-[#1E293B] border border-[#334155] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[16px]">{d.emoji}</span>
              <span className="font-semibold text-[14px]" style={{ color: d.color }}>{d.domain}</span>
            </div>
            {d.items.map((item) => (
              <div key={item.module} className="flex items-center justify-between py-1 text-[12px]">
                <span className="text-[#F8FAFC]">{item.module}</span>
                <span className={cn('text-[11px]', healthStatusClass[item.status])}>{item.detail}</span>
              </div>
            ))}
            <div className="mt-3">
              <span className="text-[12px] text-[#3B82F6] cursor-pointer hover:underline">
                View {d.domain === 'SECURE' ? 'Security' : d.domain === 'MANAGE' ? 'People' : 'Facility'} →
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
