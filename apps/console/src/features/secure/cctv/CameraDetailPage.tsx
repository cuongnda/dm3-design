import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader, useBreadcrumbStore } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockCameras, mockNVRs } from './mock-data';
import type { CameraStatus } from './mock-data';

const statusColor: Record<CameraStatus, { dot: string; text: string }> = {
  online: { dot: 'bg-[#22C55E]', text: 'text-[#22C55E]' },
  offline: { dot: 'bg-[#EF4444]', text: 'text-[#EF4444]' },
  recording: { dot: 'bg-[#EF4444] animate-pulse', text: 'text-[#F59E0B]' },
};

export function CameraDetailPage() {
  const { t } = useTranslation('secure');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setLabel = useBreadcrumbStore((s) => s.setLabel);
  const clearLabel = useBreadcrumbStore((s) => s.clearLabel);
  const camera = mockCameras.find((c) => c.id === id);

  useEffect(() => {
    if (id && camera?.name) setLabel(id, camera.name);
    return () => { if (id) clearLabel(id); };
  }, [id, camera?.name, setLabel, clearLabel]);

  if (!camera) {
    return (
      <div className="flex items-center justify-center h-64 text-[#64748B]">
        {/* TODO: add i18n key */}Camera not found
      </div>
    );
  }

  const nvr = mockNVRs.find((n) => n.id === camera.nvrId);
  const sc = statusColor[camera.status];

  return (
    <div>
      <PageHeader title={`${camera.name} — ${camera.location}`}>
        <button
          onClick={() => navigate('/secure/cctv')}
          className="px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#F8FAFC] text-[12px] font-medium"
        >
          {/* TODO: add i18n key */}← Back to Grid
        </button>
      </PageHeader>

      {/* Large video placeholder */}
      <div className={cn('relative aspect-video max-h-[500px] bg-[#0D1117] rounded-lg border flex items-center justify-center mb-6', camera.status === 'offline' ? 'border-[#EF4444]/50' : 'border-[#1E293B]')}>
        <svg className="w-16 h-16 text-[#334155]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9.75A2.25 2.25 0 0 0 16.5 16.5v-9A2.25 2.25 0 0 0 14.25 5.25H4.5A2.25 2.25 0 0 0 2.25 7.5v9A2.25 2.25 0 0 0 4.5 18.75Z" />
        </svg>
        {camera.status === 'recording' && (
          <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 bg-[#EF4444]/20 rounded text-[12px] font-medium text-[#EF4444]">
            <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
            REC
          </span>
        )}
        {camera.fps > 0 && (
          <span className="absolute top-3 right-3 px-2 py-1 bg-black/60 rounded text-[12px] font-mono text-[#94A3B8]">
            {camera.fps} FPS
          </span>
        )}
        {camera.status === 'offline' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
            <span className="text-[#EF4444] text-[16px] font-semibold">{/* TODO: add i18n key */}SIGNAL LOST</span>
          </div>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4">
          <h3 className="text-[13px] font-semibold text-[#F8FAFC] mb-3">{t('cameraDetail.title')}</h3>
          <dl className="space-y-2 text-[12px]">
            <div className="flex justify-between">
              <dt className="text-[#64748B]">{t('cctv.table.status')}</dt>
              <dd className="flex items-center gap-1.5">
                <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                <span className={cn('font-medium capitalize', sc.text)}>{camera.status}</span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#64748B]">{t('cctv.table.location')}</dt>
              <dd className="text-[#F8FAFC]">{camera.location}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#64748B]">{/* TODO: add i18n key */}Floor</dt>
              <dd className="text-[#F8FAFC]">{camera.floor}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#64748B]">FPS</dt>
              <dd className="text-[#F8FAFC] font-mono">{camera.fps}</dd>
            </div>
          </dl>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4">
          <h3 className="text-[13px] font-semibold text-[#F8FAFC] mb-3">{/* TODO: add i18n key */}NVR Info</h3>
          <dl className="space-y-2 text-[12px]">
            <div className="flex justify-between">
              <dt className="text-[#64748B]">NVR</dt>
              <dd className="text-[#F8FAFC]">{nvr?.name || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#64748B]">{/* TODO: add i18n key */}Storage</dt>
              <dd className="text-[#F8FAFC] font-mono">
                {nvr ? `${(nvr.storageUsed / 1000).toFixed(1)} / ${(nvr.storageTotal / 1000).toFixed(0)} TB` : '—'}
              </dd>
            </div>
            {nvr && (
              <div className="mt-2">
                <div className="w-full h-1.5 bg-[#1E293B] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3B82F6] rounded-full"
                    style={{ width: `${(nvr.storageUsed / nvr.storageTotal) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
