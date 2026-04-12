import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataTable, type Column, Button } from '@dm3/ui';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Pencil, Play } from 'lucide-react';
import {
  listCameras,
  createCamera,
  updateCamera,
  deleteCamera,
  testCameraConnection,
  type CameraDTO,
  type CreateCameraRequest,
  type TestConnectionDTO,
} from '@dm3/api-client';
import { CameraStatusBadge } from './components/CameraStatusBadge';
import { CameraFormModal } from './components/CameraFormModal';

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
    onSuccess: (result) => setTestResult(result),
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
      width: '180px',
      render: (r) => <span className="font-medium text-[13px]">{r.name}</span>,
    },
    {
      key: 'status',
      header: t('cctv.cameras.cols.status'),
      width: '90px',
      render: (r) => <CameraStatusBadge status={r.status} />,
    },
    {
      key: 'brand',
      header: t('cctv.cameras.cols.brand'),
      width: '100px',
      render: (r) => <span className="text-[12px] text-muted-foreground">{r.brand ?? '—'}</span>,
    },
    {
      key: 'recording_mode',
      header: t('cctv.cameras.cols.recordingMode'),
      width: '110px',
      render: (r) => <span className="text-[12px] capitalize">{r.recording_mode}</span>,
    },
    {
      key: 'last_checked_at',
      header: t('cctv.cameras.cols.lastChecked'),
      width: '140px',
      render: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">
          {r.last_checked_at ? new Date(r.last_checked_at).toLocaleString() : '—'}
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
            data-testid="cctv-button-edit-camera"
            aria-label={t('cctv.cameras.edit')}
          >
            <Pencil size={14} />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => testMutation.mutate(r.id)}
            data-testid="cctv-button-test-camera"
            aria-label={t('cctv.cameras.test')}
          >
            <Play size={14} />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="text-destructive"
            onClick={() => deleteMutation.mutate(r.id)}
            data-testid="cctv-button-delete-camera"
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
