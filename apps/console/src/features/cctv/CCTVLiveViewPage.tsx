import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
import { PageHeader } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { listAccessPoints, listCameras, type CameraDTO } from '@dm3/api-client';
import { LiveTile } from './components/LiveTile';

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

const statusDot: Record<string, string> = {
  online: 'bg-[#22C55E]',
  offline: 'bg-[#EF4444]',
  error: 'bg-[#EF4444]',
};

function StatChips({ cameras }: { cameras: CameraDTO[] }) {
  const { t } = useTranslation('common');
  const total = cameras.length;
  const online = cameras.filter((c) => c.status === 'online').length;
  const offline = cameras.filter((c) => c.status === 'offline' || c.status === 'error').length;
  const recording = cameras.filter((c) => c.recording_mode === 'event_only').length;

  const stats = [
    { label: t('cctv.dashboard.totalCameras'), value: total, color: 'text-[#F8FAFC]' },
    { label: t('cctv.dashboard.online'), value: online, color: 'text-[#22C55E]' },
    { label: t('cctv.dashboard.offline'), value: offline, color: 'text-[#EF4444]' },
    { label: t('cctv.cameras.recordingModes.event'), value: recording, color: 'text-[#F59E0B]' },
  ];

  return (
    <div className="flex gap-4 mb-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex items-center gap-2 px-3 py-2 bg-[#111827] border border-[#1E293B] rounded-lg"
        >
          <span className="text-[11px] text-[#64748B] uppercase tracking-wide">{s.label}</span>
          <span className={cn('text-[16px] font-semibold', s.color)}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}

interface SidebarProps {
  cameras: CameraDTO[];
  accessPointNames: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

function CameraSidebar({
  cameras,
  accessPointNames,
  selectedId,
  onSelect,
  collapsed,
  onToggle,
}: SidebarProps) {
  const { t } = useTranslation('common');

  // Group cameras by the access point they are linked to. Unlinked cameras
  // fall into a dedicated "not linked" bucket so the relationship (or its
  // absence) is always visible at a glance.
  const unlinkedLabel = t('cctv.cameras.fields.accessPointNone');
  const grouped = useMemo(() => {
    const map = new Map<string, CameraDTO[]>();
    cameras.forEach((c) => {
      const key = c.access_point_id
        ? accessPointNames[c.access_point_id] ?? c.access_point_id
        : unlinkedLabel;
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    });
    return Array.from(map.entries());
  }, [cameras, accessPointNames, unlinkedLabel]);

  return (
    <div
      className={cn(
        'border-r border-[#1E293B] bg-[#0D1117] shrink-0 transition-all overflow-hidden',
        collapsed ? 'w-0' : 'w-56',
      )}
    >
      <div className="p-3 border-b border-[#1E293B] flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#F8FAFC] uppercase tracking-wide">
          {t('nav.cctvCameras')}
        </span>
        <button
          onClick={onToggle}
          className="text-[#64748B] hover:text-[#F8FAFC]"
          data-testid="cctv-button-sidebar-close"
          aria-label="Close sidebar"
        >
          <X size={14} />
        </button>
      </div>
      <div className="overflow-y-auto max-h-[calc(100vh-160px)]">
        {grouped.map(([group, cams]) => (
          <div key={group}>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider bg-[#0A0E1A]">
              {group}
            </div>
            {cams.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                data-testid={`cctv-sidebar-camera-${c.id}`}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 hover:bg-[#1E293B] transition-colors',
                  selectedId === c.id && 'bg-[#1E293B]',
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    statusDot[c.status] ?? 'bg-[#64748B]',
                  )}
                />
                <span className="text-[#F8FAFC] truncate flex-1">{c.name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CCTVLiveViewPage() {
  const { t } = useTranslation('common');
  const [grid, setGrid] = useState<GridSize>(4);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['cctv-cameras-all'],
    queryFn: () => listCameras({ limit: 200 }),
  });

  const { data: apResp } = useQuery({
    queryKey: ['access-points-all'],
    queryFn: () => listAccessPoints({ limit: 200 }),
  });

  const allCameras = data?.data ?? [];

  const accessPointNames = useMemo(() => {
    const map: Record<string, string> = {};
    (apResp?.data ?? []).forEach((ap) => {
      map[ap.id] = ap.name;
    });
    return map;
  }, [apResp]);

  // Sort focused camera first; then fill the grid up to gridSize.
  const visibleCameras = useMemo(() => {
    if (!focusedId) return allCameras.slice(0, grid);
    const focused = allCameras.find((c) => c.id === focusedId);
    if (!focused) return allCameras.slice(0, grid);
    const rest = allCameras.filter((c) => c.id !== focusedId);
    return [focused, ...rest].slice(0, grid);
  }, [allCameras, grid, focusedId]);

  // Clear focus if the focused camera has been deleted.
  useEffect(() => {
    if (focusedId !== null && !allCameras.some((c) => c.id === focusedId)) {
      setFocusedId(null);
    }
  }, [allCameras, focusedId]);

  const handleSelect = (id: string) => {
    if (id === focusedId) {
      setFocusedId(null);
    } else {
      setFocusedId(id);
      setGrid(1);
    }
  };

  const handleGridChange = (size: GridSize) => {
    setGrid(size);
    if (size > 1) setFocusedId(null);
  };

  return (
    <div className="flex h-full -m-6">
      <CameraSidebar
        cameras={allCameras}
        accessPointNames={accessPointNames}
        selectedId={focusedId}
        onSelect={handleSelect}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOpen(false)}
      />

      <div className="flex-1 p-6 overflow-y-auto">
        <PageHeader title={t('cctv.live.title')} description={t('cctv.live.description')}>
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              data-testid="cctv-button-sidebar-open"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#F8FAFC] text-[12px] font-medium"
            >
              <Menu size={14} /> {t('nav.cctvCameras')}
            </button>
          )}
          <div className="flex items-center bg-[#111827] border border-[#334155] rounded-md overflow-hidden">
            {gridLabels.map((g) => (
              <button
                key={g.size}
                onClick={() => handleGridChange(g.size)}
                data-testid={`cctv-button-grid-${g.size}`}
                className={cn(
                  'px-3 py-1.5 text-[12px] font-medium transition-colors',
                  grid === g.size
                    ? 'bg-[#3B82F6] text-white'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </PageHeader>

        <StatChips cameras={allCameras} />

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            {t('cctv.common.loading')}
          </div>
        ) : visibleCameras.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t('cctv.live.noCameras')}
          </div>
        ) : (
          <div className={cn('grid gap-3', gridCols[grid])}>
            {visibleCameras.map((camera) => (
              <div key={camera.id} className="aspect-video">
                <LiveTile camera={camera} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
