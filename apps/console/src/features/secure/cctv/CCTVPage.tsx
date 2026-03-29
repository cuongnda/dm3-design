import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockCameras, mockNVRs } from './mock-data';
import type { Camera, CameraStatus } from './mock-data';

type GridSize = 1 | 4 | 9 | 16;

const gridLabels: { size: GridSize; label: string }[] = [
  { size: 1, label: '1×1' },
  { size: 4, label: '2×2' },
  { size: 9, label: '3×3' },
  { size: 16, label: '4×4' },
];

const gridCols: Record<GridSize, string> = {
  1: 'grid-cols-1',
  4: 'grid-cols-2',
  9: 'grid-cols-3',
  16: 'grid-cols-4',
};

const statusColor: Record<CameraStatus, { dot: string; text: string; border: string }> = {
  online: { dot: 'bg-[#22C55E]', text: 'text-[#22C55E]', border: 'border-[#1E293B]' },
  offline: { dot: 'bg-[#EF4444]', text: 'text-[#EF4444]', border: 'border-[#EF4444]/50' },
  recording: { dot: 'bg-[#EF4444] animate-pulse', text: 'text-[#F59E0B]', border: 'border-[#1E293B]' },
};

function NVRStats() {
  const { t } = useTranslation('secure');
  const total = mockCameras.length;
  const online = mockCameras.filter((c) => c.status === 'online').length;
  const offline = mockCameras.filter((c) => c.status === 'offline').length;
  const recording = mockCameras.filter((c) => c.status === 'recording').length;
  const storageUsed = mockNVRs.reduce((a, n) => a + n.storageUsed, 0);
  const storageTotal = mockNVRs.reduce((a, n) => a + n.storageTotal, 0);

  const stats = [
    { label: t('cctv.tabs.all'), value: total, color: 'text-[#F8FAFC]' },
    { label: t('cctv.tabs.online'), value: online, color: 'text-[#22C55E]' },
    { label: t('cctv.status.recording'), value: recording, color: 'text-[#F59E0B]' },
    { label: t('cctv.tabs.offline'), value: offline, color: 'text-[#EF4444]' },
    { label: /* TODO: add i18n key */'Storage', value: `${(storageUsed / 1000).toFixed(1)}/${(storageTotal / 1000).toFixed(0)} TB`, color: 'text-[#3B82F6]' },
  ];

  return (
    <div className="flex gap-4 mb-4">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-2 px-3 py-2 bg-[#111827] border border-[#1E293B] rounded-lg">
          <span className="text-[11px] text-[#64748B] uppercase tracking-wide">{s.label}</span>
          <span className={cn('text-[16px] font-semibold', s.color)}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}

function CameraCard({ camera, compact }: { camera: Camera; compact: boolean }) {
  const navigate = useNavigate();
  const { t } = useTranslation('secure');
  const sc = statusColor[camera.status];
  const statusLabel: Record<CameraStatus, string> = {
    online: t('cctv.tabs.online'),
    offline: t('cctv.tabs.offline'),
    recording: '● REC',
  };

  return (
    <div
      onClick={() => navigate(`/secure/cctv/${camera.id}`)}
      className={cn(
        'group cursor-pointer rounded-lg border overflow-hidden bg-[#111827] transition-all hover:border-[#3B82F6]/50',
        sc.border,
        camera.status === 'offline' && 'opacity-70'
      )}
    >
      {/* Video placeholder */}
      <div className="relative aspect-video bg-[#0D1117] flex items-center justify-center">
        <svg className="w-8 h-8 text-[#334155]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9.75A2.25 2.25 0 0 0 16.5 16.5v-9A2.25 2.25 0 0 0 14.25 5.25H4.5A2.25 2.25 0 0 0 2.25 7.5v9A2.25 2.25 0 0 0 4.5 18.75Z" />
        </svg>
        {/* Status overlay */}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
          {camera.status === 'recording' && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#EF4444]/20 rounded text-[10px] font-medium text-[#EF4444]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse" />
              REC
            </span>
          )}
        </div>
        {camera.fps > 0 && (
          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/60 rounded text-[10px] font-mono text-[#94A3B8]">
            {camera.fps} FPS
          </span>
        )}
        {camera.status === 'offline' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="text-[#EF4444] text-[11px] font-medium">{t('cctv.tabs.offline').toUpperCase()}</span>
          </div>
        )}
      </div>
      {/* Info */}
      {!compact && (
        <div className="px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#F8FAFC] truncate">{camera.name}</span>
            <span className={cn('text-[10px] font-medium', sc.text)}>{statusLabel[camera.status]}</span>
          </div>
          <span className="text-[11px] text-[#64748B] truncate block">{camera.location}</span>
        </div>
      )}
    </div>
  );
}

function CameraSidebar({
  cameras,
  selectedId,
  onSelect,
  collapsed,
  onToggle,
}: {
  cameras: Camera[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation('secure');
  const grouped = useMemo(() => {
    const map = new Map<string, Camera[]>();
    cameras.forEach((c) => {
      const list = map.get(c.floor) || [];
      list.push(c);
      map.set(c.floor, list);
    });
    return Array.from(map.entries());
  }, [cameras]);

  return (
    <div className={cn('border-r border-[#1E293B] bg-[#0D1117] shrink-0 transition-all overflow-hidden', collapsed ? 'w-0' : 'w-56')}>
      <div className="p-3 border-b border-[#1E293B] flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#F8FAFC] uppercase tracking-wide">{t('cctv.allCameras')}</span>
        <button onClick={onToggle} className="text-[#64748B] hover:text-[#F8FAFC] text-[14px]">✕</button>
      </div>
      <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
        {grouped.map(([floor, cams]) => (
          <div key={floor}>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider bg-[#0A0E1A]">{floor}</div>
            {cams.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 hover:bg-[#1E293B] transition-colors',
                  selectedId === c.id && 'bg-[#1E293B]'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusColor[c.status].dot)} />
                <span className="text-[#F8FAFC] truncate">{c.name}</span>
                <span className="text-[#64748B] truncate ml-auto text-[10px]">{c.location.split(' - ').pop()}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CCTVPage() {
  const { t } = useTranslation('secure');
  const navigate = useNavigate();
  const [grid, setGrid] = useState<GridSize>(16);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-full -m-6">
      <CameraSidebar
        cameras={mockCameras}
        selectedId={null}
        onSelect={(id) => navigate(`/secure/cctv/${id}`)}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOpen(false)}
      />
      <div className="flex-1 p-6 overflow-y-auto">
        <PageHeader title={t('cctv.title')}>
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#F8FAFC] text-[12px] font-medium"
            >
              ☰ {t('cctv.allCameras')}
            </button>
          )}
          <div className="flex items-center bg-[#111827] border border-[#334155] rounded-md overflow-hidden">
            {gridLabels.map((g) => (
              <button
                key={g.size}
                onClick={() => setGrid(g.size)}
                className={cn(
                  'px-3 py-1.5 text-[12px] font-medium transition-colors',
                  grid === g.size ? 'bg-[#3B82F6] text-white' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </PageHeader>

        <NVRStats />

        <div className={cn('grid gap-3', gridCols[grid])}>
          {mockCameras.slice(0, grid).map((cam) => (
            <CameraCard key={cam.id} camera={cam} compact={grid >= 16} />
          ))}
        </div>
      </div>
    </div>
  );
}
