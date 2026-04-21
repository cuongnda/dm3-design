import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataTable, type Column, Button } from '@dm3/ui';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import {
  Plus,
  Trash2,
  Pencil,
  Play,
  Video,
  MapPin,
  Clock,
  HardDrive,
} from 'lucide-react';
import {
  listCameras,
  listAccessPoints,
  createCamera,
  updateCamera,
  deleteCamera,
  testCameraConnection,
  type CameraDTO,
  type CreateCameraRequest,
  type TestConnectionDTO,
} from '@dm3/api-client';
import { SeverityPill, deriveSeverity } from './components/CameraStatusBadge';
import { CameraFormModal } from './components/CameraFormModal';

type RelTone = 'fresh' | 'stale' | 'dead';

function formatRelative(iso?: string | null): { text: string; tone: RelTone } {
  if (!iso) return { text: '__never__', tone: 'dead' };
  const age = Date.now() - new Date(iso).getTime();
  if (age < 60_000) return { text: '__justNow__', tone: 'fresh' };
  if (age < 3_600_000) {
    const minutes = Math.floor(age / 60_000);
    return { text: `${minutes}m ago`, tone: age > 5 * 60_000 ? 'stale' : 'fresh' };
  }
  if (age < 86_400_000) {
    const hours = Math.floor(age / 3_600_000);
    return { text: `${hours}h ago`, tone: 'stale' };
  }
  return { text: new Date(iso).toLocaleDateString(), tone: 'dead' };
}

const relToneClass: Record<RelTone, string> = {
  fresh: 'text-success',
  stale: 'text-warning',
  dead: 'text-muted-foreground',
};

export function CCTVCamerasPage() {
  const { t } = useTranslation('common');
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CameraDTO | null>(null);
  const [testResult, setTestResult] = useState<TestConnectionDTO | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['cctv-cameras', page, statusFilter],
    queryFn: () => listCameras({ page, limit: 20, status: statusFilter || undefined }),
  });

  const { data: apResp } = useQuery({
    queryKey: ['access-points-all'],
    queryFn: () => listAccessPoints({ limit: 200 }),
  });

  const accessPointNames = useMemo(() => {
    const map: Record<string, string> = {};
    (apResp?.data ?? []).forEach((ap) => {
      map[ap.id] = ap.name;
    });
    return map;
  }, [apResp]);

  const createMutation = useMutation({
    mutationFn: (data: CreateCameraRequest) => createCamera(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cctv-cameras'] });
      qc.invalidateQueries({ queryKey: ['cctv-cameras-all'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateCameraRequest }) => updateCamera(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cctv-cameras'] });
      qc.invalidateQueries({ queryKey: ['cctv-cameras-all'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCamera(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cctv-cameras'] });
      qc.invalidateQueries({ queryKey: ['cctv-cameras-all'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => testCameraConnection(id),
    onSuccess: (result, id) => {
      setTestResult(result);
      // Show toast when testing from list (modal not open)
      if (!modalOpen) {
        const cam = cameras.find((c) => c.id === id);
        const name = cam?.name ?? id;
        if (result.ok) {
          toast(`${name}: Connection OK · ${result.latency_ms}ms${result.codec ? ` · ${result.codec}` : ''}`, 'success');
        } else {
          toast(`${name}: Connection failed${result.error ? ` — ${result.error}` : ''}`, 'error');
        }
      }
    },
  });

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setTestResult(null);
  };

  const openCreate = () => {
    setEditing(null);
    setTestResult(null);
    setModalOpen(true);
  };

  const openEdit = (camera: CameraDTO) => {
    setEditing(camera);
    setTestResult(null);
    setModalOpen(true);
  };

  const handleSubmit = (formData: CreateCameraRequest) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleTest = () => {
    if (editing) testMutation.mutate(editing.id);
  };

  const cameras = data?.data ?? [];
  const submitting = createMutation.isPending || updateMutation.isPending;

  const columns: Column<CameraDTO>[] = [
    {
      key: 'name',
      header: t('cctv.cameras.cols.name'),
      width: '260px',
      render: (r) => {
        const apName = r.access_point_id ? accessPointNames[r.access_point_id] : null;
        return (
          <div className="flex items-start gap-2">
            <div className="w-12 h-8 rounded-sm bg-muted border border-border shrink-0 flex items-center justify-center">
              <Video size={14} className="text-muted-foreground/50" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-[13px] truncate">{r.name}</div>
              <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                {apName ? (
                  <>
                    <MapPin size={10} className="shrink-0" />
                    <span className="truncate">{apName}</span>
                  </>
                ) : (
                  <span className="opacity-60">{t('cctv.cameras.notLinked')}</span>
                )}
                {r.brand && (
                  <span className="ml-1 text-[10px] text-muted-foreground/70 shrink-0">
                    · {r.brand}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: t('cctv.cameras.cols.status'),
      width: '130px',
      render: (r) => <SeverityPill severity={deriveSeverity(r)} />,
    },
    {
      key: 'last_frame',
      header: t('cctv.cols.lastFrame'),
      width: '130px',
      render: (r) => {
        const rel = formatRelative(r.last_checked_at);
        const text =
          rel.text === '__never__'
            ? t('cctv.lastFrame.never')
            : rel.text === '__justNow__'
              ? t('cctv.lastFrame.justNow')
              : rel.text;
        return (
          <span className={`inline-flex items-center gap-1 text-[12px] ${relToneClass[rel.tone]}`}>
            <Clock size={11} />
            {text}
          </span>
        );
      },
    },
    {
      key: 'backend',
      header: t('cctv.cols.backend'),
      width: '110px',
      render: (r) => {
        const severity = deriveSeverity(r);
        const recordingOn = r.recording_mode === 'event_only';
        if (!recordingOn) {
          return (
            <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
              <HardDrive size={11} />
              {t('cctv.backend.off')}
            </span>
          );
        }
        const healthy = severity === 'online';
        return (
          <span
            className={`inline-flex items-center gap-1 text-[12px] ${
              healthy ? 'text-success' : 'text-muted-foreground'
            }`}
          >
            <HardDrive size={11} />
            NVR · {t('cctv.backend.ok')}
          </span>
        );
      },
    },
    {
      key: 'recording_mode',
      header: t('cctv.cameras.cols.recordingMode'),
      width: '100px',
      render: (r) => (
        <span className="text-[12px] capitalize text-muted-foreground">
          {r.recording_mode === 'event_only'
            ? t('cctv.cameras.recordingModes.event')
            : t('cctv.cameras.recordingModes.off')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '110px',
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => openEdit(r)}
            data-testid={`cctv-button-edit-camera-${r.id}`}
            aria-label={t('cctv.cameras.edit')}
          >
            <Pencil size={14} />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => testMutation.mutate(r.id)}
            data-testid={`cctv-button-test-camera-${r.id}`}
            aria-label={t('cctv.cameras.test')}
          >
            <Play size={14} />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              if (window.confirm(t('cctv.cameras.confirmDelete', { name: r.name }))) {
                deleteMutation.mutate(r.id);
              }
            }}
            data-testid={`cctv-button-delete-camera-${r.id}`}
            aria-label={t('cctv.cameras.delete')}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t('cctv.cameras.title')} description={t('cctv.cameras.description')}>
        <div className="flex items-center gap-2">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            data-testid="cctv-select-status-filter"
          >
            <option value="">{t('cctv.cameras.allStatuses')}</option>
            <option value="online">{t('cctv.cameras.statuses.online')}</option>
            <option value="offline">{t('cctv.cameras.statuses.offline')}</option>
            <option value="error">{t('cctv.cameras.statuses.error')}</option>
          </select>
          <Button
            size="sm"
            onClick={openCreate}
            className="bg-[#3B82F6] hover:bg-[#2563EB]"
            data-testid="cctv-button-add-camera"
          >
            <Plus size={16} className="mr-1" />
            {t('cctv.cameras.addCamera')}
          </Button>
        </div>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('cctv.common.loading')}</div>
      ) : (
        <DataTable
          columns={columns}
          data={cameras}
          rowKey={(r) => r.id}
          pageSize={20}
          emptyIcon={<Video size={32} strokeWidth={1.2} />}
          emptyTitle={statusFilter ? `No ${statusFilter} cameras` : 'No cameras registered yet'}
          emptyDescription={statusFilter
            ? 'Try a different status filter or clear it to see every camera.'
            : 'Add a camera to stream live video, record clips, and attach footage to access events.'}
          emptyAction={statusFilter
            ? { label: 'Clear filter', variant: 'outline', onClick: () => { setStatusFilter(''); setPage(1); }, 'data-testid': 'cctv-button-clear-filter-empty' }
            : { label: 'Add Camera', icon: <Plus size={14} />, onClick: openCreate, 'data-testid': 'cctv-button-add-camera-empty' }}
        />
      )}

      <CameraFormModal
        open={modalOpen}
        onOpenChange={(o) => { if (!o) closeModal(); }}
        editing={editing}
        onSubmit={handleSubmit}
        onTestConnection={editing ? handleTest : undefined}
        testResult={testResult}
        testPending={testMutation.isPending}
        submitting={submitting}
      />
    </div>
  );
}
