import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  LayoutGrid,
  Maximize2,
  Menu,
  Minimize2,
  Minus,
  X,
} from 'lucide-react';
import { PageHeader } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { listAccessPoints, listCameras, type CameraDTO } from '@dm3/api-client';
import { LiveTile } from './components/LiveTile';
import { EventRail } from './components/EventRail';

type GridSize = 1 | 4 | 9 | 16 | 25 | 36;
type ViewMode = 'default' | 'wall' | 'operate' | 'compact';

const allGridLabels: { size: GridSize; label: string }[] = [
  { size: 1, label: '1×1' },
  { size: 4, label: '2×2' },
  { size: 9, label: '3×3' },
  { size: 16, label: '4×4' },
  { size: 25, label: '5×5' },
  { size: 36, label: '6×6' },
];

const gridCols: Record<GridSize, string> = {
  1: 'grid-cols-1',
  4: 'grid-cols-2',
  9: 'grid-cols-3',
  16: 'grid-cols-4',
  25: 'grid-cols-5',
  36: 'grid-cols-6',
};

const statusDot: Record<string, string> = {
  online: 'bg-[#22C55E]',
  offline: 'bg-[#EF4444]',
  error: 'bg-[#EF4444]',
};

// Available grid sizes per mode — default stays classic, wall/compact
// expose larger walls, operate keeps a comfortable density.
const gridsByMode: Record<ViewMode, GridSize[]> = {
  default: [1, 4, 9, 16],
  wall: [4, 9, 16, 25],
  operate: [1, 4, 9, 16],
  compact: [9, 16, 25, 36],
};

function StatChipsInline({ cameras }: { cameras: CameraDTO[] }) {
  const { t } = useTranslation('common');
  const total = cameras.length;
  const online = cameras.filter((c) => c.status === 'online').length;
  const offline = cameras.filter((c) => c.status === 'offline' || c.status === 'error').length;
  const recording = cameras.filter((c) => c.recording_mode === 'event_only').length;

  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-foreground/60" />
        <span className="text-foreground font-medium">{total}</span>
        {t('cctv.dashboard.totalCameras').toLowerCase()}
      </span>
      <span className="text-muted-foreground/50">·</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
        <span className="text-success font-medium">{online}</span>
        {t('cctv.dashboard.online').toLowerCase()}
      </span>
      <span className="text-muted-foreground/50">·</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
        <span className="text-destructive font-medium">{offline}</span>
        {t('cctv.dashboard.offline').toLowerCase()}
      </span>
      <span className="text-muted-foreground/50">·</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-warning" />
        <span className="text-warning font-medium">{recording}</span>
        {t('cctv.cameras.recordingModes.event').toLowerCase()}
      </span>
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

interface ModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const { t } = useTranslation('common');
  const options: { mode: ViewMode; icon: typeof LayoutGrid; labelKey: string }[] = [
    { mode: 'default', icon: LayoutGrid, labelKey: 'cctv.live.mode.default' },
    { mode: 'wall', icon: Maximize2, labelKey: 'cctv.live.mode.wall' },
    { mode: 'operate', icon: Activity, labelKey: 'cctv.live.mode.operate' },
    { mode: 'compact', icon: Minimize2, labelKey: 'cctv.live.mode.compact' },
  ];
  return (
    <div
      className="flex items-center bg-[#111827] border border-[#334155] rounded-md overflow-hidden"
      data-testid="cctv-mode-toggle"
    >
      {options.map((o) => {
        const Icon = o.icon;
        const active = mode === o.mode;
        return (
          <button
            key={o.mode}
            onClick={() => onChange(o.mode)}
            data-testid={`cctv-button-mode-${o.mode}`}
            className={cn(
              'px-2.5 py-1.5 text-[12px] font-medium transition-colors inline-flex items-center gap-1.5',
              active ? 'bg-[#3B82F6] text-white' : 'text-[#94A3B8] hover:text-[#F8FAFC]',
            )}
            title={t(o.labelKey)}
          >
            <Icon size={12} />
            <span className="hidden md:inline">{t(o.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CCTVLiveViewPage() {
  const { t } = useTranslation('common');
  const [mode, setMode] = useState<ViewMode>('default');
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

  const exitWall = useCallback(() => setMode('default'), []);

  const handleModeChange = (next: ViewMode) => {
    setMode(next);
    // Clamp grid to whatever the new mode allows.
    const allowed = gridsByMode[next];
    if (!allowed.includes(grid)) {
      setGrid(allowed[Math.min(1, allowed.length - 1)]);
    }
    // Wall mode defaults to sidebar hidden; operate defaults to sidebar visible.
    if (next === 'wall') setSidebarOpen(false);
    if (next === 'operate') setSidebarOpen(true);
  };

  // Escape exits wall mode.
  useEffect(() => {
    if (mode !== 'wall') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitWall();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, exitWall]);

  const gridsForMode = gridsByMode[mode];

  // Wall mode is a takeover: black backdrop, no page chrome.
  if (mode === 'wall') {
    return (
      <div className="fixed inset-0 z-40 bg-black flex flex-col -m-6">
        <div className="flex items-center justify-between px-3 py-1.5 bg-black/80 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <ModeToggle mode={mode} onChange={handleModeChange} />
            <div className="flex items-center bg-[#111827] border border-[#334155] rounded-md overflow-hidden">
              {gridsForMode.map((size) => (
                <button
                  key={size}
                  onClick={() => handleGridChange(size)}
                  data-testid={`cctv-button-grid-${size}`}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-medium transition-colors',
                    grid === size
                      ? 'bg-[#3B82F6] text-white'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]',
                  )}
                >
                  {allGridLabels.find((g) => g.size === size)?.label ?? size}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={exitWall}
            data-testid="cctv-button-exit-wall"
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#1E293B] hover:bg-[#334155] border border-[#334155] rounded text-[#F8FAFC] text-[11px] font-medium transition-colors"
          >
            <Minus size={12} /> {t('cctv.live.exitWall')} · Esc
          </button>
        </div>
        <div className="flex-1 p-1.5 overflow-hidden">
          {visibleCameras.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-[12px]">
              {t('cctv.live.noCameras')}
            </div>
          ) : (
            <div className={cn('grid gap-1 h-full', gridCols[grid])}>
              {visibleCameras.map((camera) => (
                <div key={camera.id} className="min-h-0">
                  <LiveTile camera={camera} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const showSidebar = mode !== 'compact' || sidebarOpen;
  const showEventRail = mode === 'operate';
  const compactMode = mode === 'compact';
  const tileAspect = compactMode ? 'aspect-[16/9]' : 'aspect-video';
  const gridGap = compactMode ? 'gap-2' : 'gap-3';

  return (
    <div className="flex h-full -m-6">
      {showSidebar && (
        <CameraSidebar
          cameras={allCameras}
          accessPointNames={accessPointNames}
          selectedId={focusedId}
          onSelect={handleSelect}
          collapsed={!sidebarOpen}
          onToggle={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className={cn('flex-1 overflow-y-auto', compactMode ? 'p-4' : 'p-6')}>
          <PageHeader
            title={t('cctv.live.title')}
            description={compactMode ? undefined : t('cctv.live.description')}
          >
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                data-testid="cctv-button-sidebar-open"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#F8FAFC] text-[12px] font-medium"
              >
                <Menu size={14} /> {t('nav.cctvCameras')}
              </button>
            )}
            <ModeToggle mode={mode} onChange={handleModeChange} />
            <div className="flex items-center bg-[#111827] border border-[#334155] rounded-md overflow-hidden">
              {gridsForMode.map((size) => (
                <button
                  key={size}
                  onClick={() => handleGridChange(size)}
                  data-testid={`cctv-button-grid-${size}`}
                  className={cn(
                    'px-3 py-1.5 text-[12px] font-medium transition-colors',
                    grid === size
                      ? 'bg-[#3B82F6] text-white'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]',
                  )}
                >
                  {allGridLabels.find((g) => g.size === size)?.label ?? size}
                </button>
              ))}
            </div>
          </PageHeader>

          <div className="mb-4">
            <StatChipsInline cameras={allCameras} />
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              {t('cctv.common.loading')}
            </div>
          ) : visibleCameras.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {t('cctv.live.noCameras')}
            </div>
          ) : (
            <div className={cn('grid', gridGap, gridCols[grid])}>
              {visibleCameras.map((camera) => (
                <div key={camera.id} className={tileAspect}>
                  <LiveTile camera={camera} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showEventRail && <EventRail />}
    </div>
  );
}
