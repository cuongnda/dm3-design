import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataTable, TablePaginationFooter, type Column, Button, AppModal } from '@dm3/ui';
import { useTranslation } from 'react-i18next';
import { Trash2, Play, Download, Film, Image as ImageIcon, Loader2, AlertTriangle } from 'lucide-react';
import {
  listCameras,
  listClips,
  getClipPlayback,
  deleteClip,
  type ClipDTO,
} from '@dm3/api-client';

export function CCTVClipsPage() {
  const { t } = useTranslation('common');
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [cameraFilter, setCameraFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [sortBy, setSortBy] = useState<'event_time' | 'started_at' | 'duration_ms' | 'camera_name' | 'media_type' | 'status'>('started_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSortChange = (col: string, dir: 'asc' | 'desc') => {
    setSortBy(col as typeof sortBy);
    setSortDir(dir);
    setPage(1);
  };

  const { data: camerasData } = useQuery({
    queryKey: ['cctv-cameras-all'],
    queryFn: () => listCameras({ limit: 200 }),
  });
  const cameras = camerasData?.data ?? [];
  const [playingClip, setPlayingClip] = useState<ClipDTO | null>(null);
  const [playUrl, setPlayUrl] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['cctv-clips', page, pageSize, cameraFilter, fromFilter, toFilter, sortBy, sortDir],
    queryFn: () =>
      listClips({
        page,
        limit: pageSize,
        camera_id: cameraFilter || undefined,
        from: fromFilter || undefined,
        to: toFilter || undefined,
        sort_by: sortBy,
        sort_order: sortDir,
      }),
    // Surface stale pages while the next page loads so the table doesn't
    // flash "empty" between clicks — matches the behaviour of other listing
    // pages (access-times, access-points).
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteClip(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cctv-clips'] }),
  });

  const playMutation = useMutation({
    mutationFn: (clip: ClipDTO) => getClipPlayback(clip.id),
    onSuccess: (result, clip) => {
      setPlayingClip(clip);
      setPlayUrl(result.playback_url);
    },
  });

  const closePlayer = () => {
    setPlayingClip(null);
    setPlayUrl('');
  };

  const clips = data?.data ?? [];

  const columns: Column<ClipDTO>[] = [
    {
      key: 'thumbnail',
      header: '',
      width: '60px',
      render: (r) =>
        r.thumbnail_url ? (
          <img
            src={r.thumbnail_url}
            alt=""
            className="h-8 w-14 rounded object-cover bg-black"
            loading="lazy"
          />
        ) : (
          <span className="inline-flex h-8 w-14 items-center justify-center rounded bg-muted text-muted-foreground" title={`${r.media_type} · ${r.status}`}>
            {r.media_type === 'snapshot' ? <ImageIcon size={14} /> : <Film size={14} />}
          </span>
        ),
    },
    {
      key: 'camera_name',
      header: t('cctv.clips.cols.camera'),
      width: '160px',
      sortable: true,
      render: (r) => (
        <span className="text-[13px] font-medium">{r.camera_name ?? t('cctv.common.unknownCamera')}</span>
      ),
    },
    {
      key: 'status',
      header: '',
      width: '90px',
      render: (r) => {
        if (r.status === 'pending' || r.status === 'recording') {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> {t('cctv.clips.status.processing')}
            </span>
          );
        }
        if (r.status === 'failed') {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
              <AlertTriangle size={12} /> {t('cctv.clips.status.failed')}
            </span>
          );
        }
        return null;
      },
    },
    {
      key: 'event_time',
      header: t('cctv.clips.cols.eventTime'),
      width: '170px',
      sortable: true,
      render: (r) => (
        <span className="font-mono text-[12px] text-foreground">
          {r.event_time ? new Date(r.event_time).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'started_at',
      header: t('cctv.clips.cols.recordedAt'),
      width: '170px',
      sortable: true,
      render: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">
          {new Date(r.started_at).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'duration_ms',
      header: t('cctv.clips.cols.duration'),
      width: '90px',
      sortable: true,
      render: (r) => (
        <span className="text-[12px] text-muted-foreground">
          {r.duration_sec != null ? `${r.duration_sec}s` : '—'}
        </span>
      ),
    },
    {
      key: 'size_bytes',
      header: t('cctv.clips.cols.size'),
      width: '90px',
      render: (r) => (
        <span className="text-[12px] text-muted-foreground">
          {r.size_bytes != null ? `${(r.size_bytes / 1024 / 1024).toFixed(1)} MB` : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '100px',
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => playMutation.mutate(r)}
            disabled={playMutation.isPending || r.status === 'pending' || r.status === 'recording' || r.status === 'failed'}
            data-testid={`cctv-button-play-clip-${r.id}`}
            aria-label={r.media_type === 'snapshot' ? t('cctv.clips.actions.openImage') : t('cctv.clips.play')}
          >
            {r.media_type === 'snapshot' ? <ImageIcon size={14} /> : <Play size={14} />}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="text-destructive"
            onClick={() => deleteMutation.mutate(r.id)}
            data-testid="cctv-button-delete-clip"
            aria-label={t('cctv.clips.delete')}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.limit ?? pageSize)));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t('cctv.clips.title')} description={t('cctv.clips.description')}>
        <div className="flex items-center gap-2">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
            value={cameraFilter}
            onChange={(e) => { setCameraFilter(e.target.value); setPage(1); }}
            data-testid="cctv-select-camera-filter"
            aria-label={t('cctv.clips.cols.camera')}
          >
            <option value="">{t('cctv.clips.allCameras')}</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            type="date"
            className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
            value={fromFilter}
            onChange={(e) => { setFromFilter(e.target.value); setPage(1); }}
            data-testid="cctv-input-from-date"
            aria-label={t('cctv.clips.fromDate')}
          />
          <input
            type="date"
            className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
            value={toFilter}
            onChange={(e) => { setToFilter(e.target.value); setPage(1); }}
            data-testid="cctv-input-to-date"
            aria-label={t('cctv.clips.toDate')}
          />
        </div>
      </PageHeader>

      {/* Wrapping flex column: inner scroll holds the table, footer sits
          permanently at the bottom of the viewport (same pattern as
          /manage/users). `min-h-0` lets flex children actually shrink. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        <div className="min-h-0 flex-1 overflow-auto">
          <DataTable
            embedded
            stickyHeader
            paginate={false}
            loading={isLoading}
            columns={columns}
            data={clips}
            rowKey={(r) => r.id}
            sortState={{ col: sortBy, dir: sortDir }}
            onSortChange={(col, dir) => handleSortChange(String(col), dir)}
            emptyIcon={<Film size={32} strokeWidth={1.2} />}
            emptyTitle={(cameraFilter || fromFilter || toFilter) ? 'No clips match these filters' : 'No clips recorded yet'}
            emptyDescription={(cameraFilter || fromFilter || toFilter)
              ? 'Try a different camera or broaden the date range.'
              : 'Clips are captured automatically when a camera triggers a recording event (motion, access, or manual). Check camera recording mode and MediaMTX connectivity.'}
            emptyAction={(cameraFilter || fromFilter || toFilter) ? {
              label: 'Clear filters',
              variant: 'outline',
              onClick: () => { setCameraFilter(''); setFromFilter(''); setToFilter(''); setPage(1); },
              'data-testid': 'cctv-button-clear-filters-empty',
            } : undefined}
          />
        </div>
        <TablePaginationFooter
          page={data?.page ?? page}
          pageSize={data?.limit ?? pageSize}
          total={data?.total ?? 0}
          totalPages={totalPages}
          pageSizeOptions={[10, 20, 50, 100]}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          loading={isLoading}
          sortColumns={[
            { value: 'event_time', label: t('cctv.clips.cols.eventTime') },
            { value: 'started_at', label: t('cctv.clips.cols.recordedAt') },
            { value: 'camera_name', label: t('cctv.clips.cols.camera') },
            { value: 'duration_ms', label: t('cctv.clips.cols.duration') },
          ]}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={(col, dir) => handleSortChange(String(col), dir)}
        />
      </div>

      {/* Video player modal */}
      <AppModal
        open={playingClip !== null}
        onOpenChange={(o) => { if (!o) closePlayer(); }}
        title={playingClip?.camera_name ?? t('cctv.clips.playback')}
      >
        <div className="space-y-3">
          {playUrl ? (
            playingClip?.media_type === 'snapshot' ? (
              <img
                src={playUrl}
                className="w-full rounded-lg bg-black object-contain max-h-[70vh]"
                data-testid="cctv-img-snapshot-viewer"
                alt="snapshot"
              />
            ) : (
              <video
                src={playUrl}
                poster={playingClip?.thumbnail_url}
                controls
                autoPlay
                className="w-full rounded-lg bg-black"
                data-testid="cctv-video-clip-player"
              />
            )
          ) : (
            <div className="text-center py-8 text-muted-foreground">{t('cctv.common.loading')}</div>
          )}

          {playingClip && (
            <p className="text-[12px] text-muted-foreground">
              {new Date(playingClip.started_at).toLocaleString()}
              {playingClip.duration_sec != null && ` · ${playingClip.duration_sec}s`}
            </p>
          )}

          <div className="flex justify-between items-center">
            {playUrl && (
              <a
                href={playUrl}
                download
                className="flex items-center gap-1.5 text-[13px] text-[#3B82F6] hover:text-[#2563EB]"
                data-testid="cctv-link-download-clip"
              >
                <Download size={14} />
                {t('cctv.clips.download')}
              </a>
            )}
            <Button variant="outline" size="sm" onClick={closePlayer} className="ml-auto">
              {t('cctv.common.close')}
            </Button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
