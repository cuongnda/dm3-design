import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { Button } from '@dm3/ui';
import type { ClipDTO } from '@dm3/api-client';

interface Props {
  clips: ClipDTO[];
  onPlay?: (clip: ClipDTO) => void;
}

export function RecentClipsList({ clips, onPlay }: Props) {
  const { t } = useTranslation('common');

  if (clips.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-[12px]">
        {t('cctv.common.noClips')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {clips.map((clip) => (
        <div
          key={clip.id}
          className="flex items-center gap-3 rounded-md border border-border/50 bg-muted/20 px-3 py-2"
        >
          {/* Thumbnail placeholder */}
          <div className="w-16 h-10 rounded bg-muted flex items-center justify-center shrink-0">
            <Play size={14} className="text-muted-foreground" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium truncate">
              {clip.camera_name ?? t('cctv.common.unknownCamera')}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {new Date(clip.started_at).toLocaleString()}
              {clip.duration_sec != null && ` · ${clip.duration_sec}s`}
            </p>
          </div>

          {onPlay && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onPlay(clip)}
              data-testid={`cctv-button-play-clip-${clip.id}`}
              aria-label={t('cctv.clips.play')}
            >
              <Play size={14} />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
