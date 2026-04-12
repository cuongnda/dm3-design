import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@dm3/ui';
import { useTranslation } from 'react-i18next';
import { listCameras } from '@dm3/api-client';
import { LiveTile } from './components/LiveTile';

type GridSize = 1 | 4 | 9 | 16;

const GRID_OPTIONS: GridSize[] = [1, 4, 9, 16];

const gridClass: Record<GridSize, string> = {
  1: 'grid-cols-1',
  4: 'grid-cols-2',
  9: 'grid-cols-3',
  16: 'grid-cols-4',
};

export function CCTVLiveViewPage() {
  const { t } = useTranslation('common');
  const [gridSize, setGridSize] = useState<GridSize>(4);

  const { data, isLoading } = useQuery({
    queryKey: ['cctv-cameras-all'],
    queryFn: () => listCameras({ limit: 200 }),
  });

  const cameras = (data?.data ?? []).slice(0, gridSize);

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader title={t('cctv.live.title')} description={t('cctv.live.description')}>
        <div className="flex items-center gap-1">
          {GRID_OPTIONS.map((size) => (
            <button
              key={size}
              onClick={() => setGridSize(size)}
              data-testid={`cctv-button-grid-${size}`}
              className={`h-8 w-10 rounded-md text-[12px] font-medium transition-colors border ${
                gridSize === size
                  ? 'bg-[#3B82F6] text-white border-[#3B82F6]'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-[#475569]'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('cctv.common.loading')}</div>
      ) : cameras.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('cctv.live.noCameras')}</div>
      ) : (
        <div className={`grid ${gridClass[gridSize]} gap-2 flex-1 min-h-0 overflow-hidden`}>
          {cameras.map((camera) => (
            <LiveTile key={camera.id} camera={camera} />
          ))}
        </div>
      )}
    </div>
  );
}
