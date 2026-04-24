import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AppModal, Button, Input, Label } from '@dm3/ui';
import { useTranslation } from 'react-i18next';
import { Play, Pause, SkipForward, SkipBack, ChevronLeft, ChevronRight } from 'lucide-react';
import { listClips, getClipPlayback, type CameraDTO, type ClipDTO } from '@dm3/api-client';

interface Props {
  open: boolean;
  camera: CameraDTO | null;
  onOpenChange: (open: boolean) => void;
}

// Start of day in Asia/Ho_Chi_Minh, returned as ISO (UTC) string. Keeps the
// listClips call consistent with the event-time range a user picked on the
// date input — tenant is VN-only for now, matches how other cctv pages
// display timestamps.
function tenantDayBoundsISO(yyyymmdd: string): { from: string; to: string } {
  // Treat the picked date as VN local midnight → midnight next day.
  const day = new Date(`${yyyymmdd}T00:00:00+07:00`);
  const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
  return { from: day.toISOString(), to: next.toISOString() };
}

function todayVN(): string {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60 * 1000);
  return vn.toISOString().slice(0, 10);
}

// Shift a YYYY-MM-DD string by `days`. Keeps the UTC 00:00 anchor the
// <input type="date"> expects — timezone math lives in tenantDayBoundsISO.
function shiftDay(yyyymmdd: string, days: number): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Seconds from VN midnight for a given ISO timestamp — used to place a clip
// band on the 24 h timeline.
function vnSecondsOfDay(iso: string): number {
  const d = new Date(iso);
  const vnMs = d.getTime() + 7 * 60 * 60 * 1000;
  const seconds = (vnMs / 1000) % 86400;
  return seconds < 0 ? seconds + 86400 : seconds;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

export function CameraTimelinePlaybackModal({ open, camera, onOpenChange }: Props) {
  const { t } = useTranslation('common');
  const [date, setDate] = useState<string>(todayVN());
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [playing, setPlaying] = useState(false);
  const [playUrl, setPlayUrl] = useState<string>('');
  // currentSec = seconds elapsed into the active clip, fed from the video's
  // timeupdate event.
  const [currentSec, setCurrentSec] = useState<number>(0);
  // playheadSec = absolute seconds-of-day for the timeline caret. Starts
  // at 00:00, can be dragged/clicked by the operator to pick a moment,
  // and is kept in sync with the playing video via onTimeUpdate.
  // "Play all" now means "play starting at playheadSec" rather than
  // always-from-index-0.
  const [playheadSec, setPlayheadSec] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Reset on camera / date change.
  useEffect(() => {
    setActiveIdx(-1);
    setPlaying(false);
    setPlayUrl('');
    setCurrentSec(0);
    setPlayheadSec(0);
  }, [camera?.id, date]);

  useEffect(() => {
    if (!open) {
      setActiveIdx(-1);
      setPlaying(false);
      setPlayUrl('');
      setCurrentSec(0);
      setPlayheadSec(0);
    }
  }, [open]);

  const { from, to } = useMemo(() => tenantDayBoundsISO(date), [date]);

  const { data, isLoading } = useQuery({
    queryKey: ['cctv-camera-timeline', camera?.id, date],
    queryFn: () =>
      listClips({
        camera_id: camera!.id,
        from,
        to,
        sort_by: 'started_at',
        sort_order: 'asc',
        limit: 500,
      }),
    enabled: open && !!camera?.id,
  });

  // Only finalized clips are playable — degraded/failed rows stay on the
  // timeline as grey gaps would (rendered faded so the operator still sees
  // a record, but play-all skips them).
  const clips: ClipDTO[] = (data?.data ?? []).filter((c) => c.media_type === 'clip');
  const playable = clips.filter((c) => c.status === 'finalized' || c.status === 'degraded');

  // Snap the playhead to the start of the first playable clip whenever a
  // fresh set of clips lands and the operator hasn't moved the caret yet
  // (it's still at the session default of 0). Keeps the "press play"
  // experience intuitive — the caret sits on real content rather than
  // on an empty 00:00 gutter.
  useEffect(() => {
    if (playable.length === 0) return;
    const firstStart = vnSecondsOfDay(playable[0]!.started_at);
    setPlayheadSec((prev) => (prev === 0 ? firstStart : prev));
  }, [playable]);

  const playMutation = useMutation({
    mutationFn: (clip: ClipDTO) => getClipPlayback(clip.id),
    onSuccess: (result) => {
      setPlayUrl(result.playback_url);
      setPlaying(true);
    },
  });

  // Queue-play: advance to the next playable clip when the current one ends.
  // Using onEnded on the <video> element is the simplest flow and matches
  // how the existing single-clip player in CCTVClipsPage surfaces playback.
  // Offset in seconds to seek the <video> to once the presigned URL loads.
  // Used when the operator places the playhead inside a clip rather than at
  // its start — we resolve the URL, then resume from (playhead - clip start).
  const pendingSeekRef = useRef<number>(0);

  const playIdx = (idx: number, seekOffset = 0) => {
    if (idx < 0 || idx >= playable.length) {
      setActiveIdx(-1);
      setPlaying(false);
      setPlayUrl('');
      setCurrentSec(0);
      return;
    }
    setActiveIdx(idx);
    setCurrentSec(seekOffset);
    pendingSeekRef.current = seekOffset;
    playMutation.mutate(playable[idx]);
  };

  // Map an absolute seconds-of-day to the clip that should play from there.
  // If the target lands inside a clip's [start, start+dur) → resume from the
  // corresponding offset. If it falls in a gap, jump to the NEXT clip (so
  // dragging past a boundary still plays something useful).
  const locateByPlayhead = (sec: number): { idx: number; offset: number } | null => {
    if (playable.length === 0) return null;
    for (let i = 0; i < playable.length; i++) {
      const c = playable[i]!;
      const start = vnSecondsOfDay(c.started_at);
      const dur = (c.duration_sec ?? 0) > 0 ? c.duration_sec! : 1;
      if (sec < start) return { idx: i, offset: 0 };
      if (sec < start + dur) return { idx: i, offset: sec - start };
    }
    return null;
  };

  const playFromPlayhead = () => {
    const hit = locateByPlayhead(playheadSec);
    if (hit) playIdx(hit.idx, hit.offset);
  };

  const handleEnded = () => {
    const next = activeIdx + 1;
    if (next < playable.length) {
      playIdx(next);
    } else {
      setPlaying(false);
      setActiveIdx(-1);
    }
  };

  const handlePlayAll = () => playFromPlayhead();
  const handlePrev = () => playIdx(Math.max(0, activeIdx - 1));
  const handleNext = () => playIdx(Math.min(playable.length - 1, activeIdx + 1));
  const handlePauseResume = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  };

  // Status-aware colour so the timeline doubles as a quality indicator.
  const clipColour = (c: ClipDTO): string => {
    if (c.status === 'finalized') return 'var(--color-secure, #3B82F6)';
    if (c.status === 'degraded') return 'var(--color-operate, #F59E0B)';
    return 'var(--color-muted-foreground, #9CA3AF)';
  };

  const activeClip = activeIdx >= 0 ? playable[activeIdx] : null;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={`${t('cctv.cameras.playback')} — ${camera?.name ?? ''}`}
      size="4xl"
    >
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-[12px]">{t('cctv.cameras.playbackDate')}</Label>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDate((d) => shiftDay(d, -1))}
                aria-label={t('cctv.cameras.prevDay')}
                data-testid="cctv-button-playback-prev-day"
              >
                <ChevronLeft size={14} />
              </Button>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={todayVN()}
                className="w-40"
                data-testid="cctv-input-playback-date"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDate((d) => (d < todayVN() ? shiftDay(d, 1) : d))}
                disabled={date >= todayVN()}
                aria-label={t('cctv.cameras.nextDay')}
                data-testid="cctv-button-playback-next-day"
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
          <div className="flex-1 text-[12px] text-muted-foreground">
            {isLoading
              ? t('cctv.common.loading')
              : `${clips.length} ${t('cctv.clips.title').toLowerCase()} · ${playable.length} ${t('cctv.cameras.playable')}`}
          </div>
          <Button
            onClick={handlePlayAll}
            disabled={playable.length === 0 || playMutation.isPending}
            data-testid="cctv-button-playback-playall"
          >
            <Play size={14} className="mr-1.5" />
            {t('cctv.cameras.playAll')}
          </Button>
        </div>

        <Timeline
          clips={clips}
          activeClipId={activeClip?.id ?? null}
          playheadSec={playheadSec}
          onPlayheadChange={(sec) => setPlayheadSec(sec)}
          onPlayheadCommit={(sec) => {
            // Commit = mouseup after drag / single click on the track.
            // Jump to whichever clip sits at (or after) this second and
            // start playing from the matching offset.
            setPlayheadSec(sec);
            const hit = locateByPlayhead(sec);
            if (hit) playIdx(hit.idx, hit.offset);
          }}
          colour={clipColour}
          onSeek={(clip) => {
            const idx = playable.findIndex((c) => c.id === clip.id);
            if (idx >= 0) {
              setPlayheadSec(vnSecondsOfDay(clip.started_at));
              playIdx(idx);
            }
          }}
        />

        <div className="rounded-lg bg-black">
          {playUrl ? (
            <video
              ref={videoRef}
              src={playUrl}
              poster={activeClip?.thumbnail_url}
              controls
              autoPlay={playing}
              onLoadedMetadata={(e) => {
                // Apply the queued seek offset once the browser knows how
                // long the clip is — before that, .currentTime gets clamped
                // back to 0 silently.
                if (pendingSeekRef.current > 0) {
                  (e.target as HTMLVideoElement).currentTime = pendingSeekRef.current;
                  pendingSeekRef.current = 0;
                }
              }}
              onEnded={handleEnded}
              onTimeUpdate={(e) => {
                const t = (e.target as HTMLVideoElement).currentTime;
                setCurrentSec(t);
                if (activeClip) setPlayheadSec(vnSecondsOfDay(activeClip.started_at) + t);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              className="w-full rounded-lg bg-black max-h-[50vh]"
              data-testid="cctv-video-timeline-player"
            />
          ) : (
            <div className="flex items-center justify-center text-muted-foreground text-[13px] h-[50vh]">
              {playable.length === 0
                ? t('cctv.cameras.noPlayableClips')
                : t('cctv.cameras.selectClipOrPlayAll')}
            </div>
          )}
        </div>

        {activeClip && (
          <div className="flex items-center justify-between text-[12px] text-muted-foreground">
            <div>
              {`${activeIdx + 1}/${playable.length}`} · {formatClock(activeClip.started_at)}
              {activeClip.duration_sec != null && ` · ${activeClip.duration_sec}s`}
            </div>
            <div className="flex gap-1">
              <Button size="xs" variant="ghost" onClick={handlePrev} disabled={activeIdx <= 0}>
                <SkipBack size={14} />
              </Button>
              <Button size="xs" variant="ghost" onClick={handlePauseResume}>
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={handleNext}
                disabled={activeIdx >= playable.length - 1}
              >
                <SkipForward size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppModal>
  );
}

const DAY_TOTAL = 86400; // seconds in 24h
const MIN_SPAN = 10;     // minimum visible window — 10 s, narrow enough to inspect a single clip

function formatHMS(seconds: number): string {
  const s = Math.max(0, Math.min(DAY_TOTAL - 1, Math.round(seconds)));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// 24 h timeline with scroll-to-zoom. The visible window is a slice
// [viewStart, viewEnd] of the full day in seconds; scrolling the mouse
// wheel over the track tightens or widens that slice, anchored at the
// cursor so the time under the pointer stays put. Double-click resets
// to the full day view.
//
// Mousing over the track shows a hairline cursor + the precise VN clock
// time at the hovered position; clip bands remain clickable to seek.
function Timeline({
  clips,
  activeClipId,
  playheadSec,
  onPlayheadChange,
  onPlayheadCommit,
  colour,
  onSeek,
}: {
  clips: ClipDTO[];
  activeClipId: string | null;
  playheadSec: number;
  onPlayheadChange: (sec: number) => void;
  onPlayheadCommit: (sec: number) => void;
  colour: (c: ClipDTO) => string;
  onSeek: (c: ClipDTO) => void;
}) {
  const { t } = useTranslation('common');
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string>('');
  const [view, setView] = useState<{ start: number; end: number }>({ start: 0, end: DAY_TOTAL });
  // scrub = operator is dragging the playhead. Mouse-down on empty track
  // arms it; while dragging, setPlayheadSec fires continuously; mouse-up
  // commits and triggers playback from the new position.
  const scrubbing = useRef<boolean>(false);

  // Reset zoom whenever the clip list changes (new camera/day) — the old
  // window almost never makes sense on a different timeline.
  const clipsSignature = clips.length === 0 ? '' : `${clips[0]!.id}:${clips.length}`;
  useEffect(() => {
    setView({ start: 0, end: DAY_TOTAL });
  }, [clipsSignature]);

  // Non-passive wheel listener so we can preventDefault and stop the
  // surrounding page from scrolling while the operator zooms. React's
  // synthetic onWheel is passive by default in React 18+, so this has
  // to be attached manually.
  //
  // Zoom anchors at the CURRENT PLAYHEAD so operators can keep an eye on
  // the moment they're inspecting while tightening the view around it.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      setView((prev) => {
        const span = prev.end - prev.start;
        // Anchor = current playhead, clamped to the visible window so a
        // playhead that sits outside the current zoom still produces a
        // sensible anchor (first/last visible second).
        const anchor = Math.max(prev.start, Math.min(prev.end, playheadSec));
        const ratio = span > 0 ? (anchor - prev.start) / span : 0.5;
        const factor = e.deltaY > 0 ? 1.25 : 0.8;
        const newSpan = Math.max(MIN_SPAN, Math.min(DAY_TOTAL, span * factor));
        let newStart = anchor - ratio * newSpan;
        if (newStart < 0) newStart = 0;
        if (newStart + newSpan > DAY_TOTAL) newStart = DAY_TOTAL - newSpan;
        return { start: newStart, end: newStart + newSpan };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [playheadSec]);

  const span = view.end - view.start;
  const zoomedIn = span < DAY_TOTAL - 1;

  const secondsAtX = (clientX: number, rect: DOMRect): number => {
    const x = clientX - rect.left;
    const clampedX = Math.max(0, Math.min(rect.width, x));
    return view.start + (clampedX / rect.width) * span;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (scrubbing.current) {
      onPlayheadChange(secondsAtX(e.clientX, rect));
      return;
    }
    const x = e.clientX - rect.left;
    if (x < 0 || x > rect.width) {
      setHoverX(null);
      return;
    }
    setHoverX(x);
    setHoverLabel(formatHMS(view.start + (x / rect.width) * span));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Clicks on clip bands stay for seeking to that specific clip; empty-
    // track clicks arm the playhead scrubber.
    if ((e.target as HTMLElement).closest('button')) return;
    const el = trackRef.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    scrubbing.current = true;
    onPlayheadChange(secondsAtX(e.clientX, rect));
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onPlayheadCommit(secondsAtX(e.clientX, rect));
  };

  const endDrag = () => { scrubbing.current = false; };

  const labels = [0, 0.25, 0.5, 0.75, 1].map((r) => formatHMS(view.start + r * span).slice(0, 5));

  // Playhead position in %. Null when no clip is playing or it falls
  // outside the current zoom window.
  const playheadPct =
    playheadSec != null && playheadSec >= view.start && playheadSec <= view.end
      ? ((playheadSec - view.start) / span) * 100
      : null;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        {labels.map((lbl, i) => <span key={i}>{lbl}</span>)}
      </div>
      {/* pt-6 reserves room for the hover tooltip ABOVE the track — the
          track itself uses overflow-hidden for clean clip-band edges, so
          the tooltip has to live in this outer wrapper to escape that
          clipping. */}
      <div
        ref={trackRef}
        className={`relative pt-6 ${scrubbing.current ? 'cursor-grabbing' : 'cursor-pointer'} select-none`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoverX(null); endDrag(); }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDoubleClick={() => setView({ start: 0, end: DAY_TOTAL })}
        title={t('cctv.cameras.timelineScrollHint')}
      >
        <div
          className="relative h-10 rounded bg-muted overflow-hidden"
          role="list"
          aria-label={t('cctv.cameras.timeline')}
        >
          {clips.map((c) => {
            const startS = vnSecondsOfDay(c.started_at);
            const endS = startS + ((c.duration_sec ?? 0) > 0 ? c.duration_sec! : 1);
            // Clip ranges outside the visible window drop out; partial
            // overlaps render clipped to the track edges so the operator
            // still sees "there's more past the edge".
            if (endS < view.start || startS > view.end) return null;
            const visStart = Math.max(startS, view.start);
            const visEnd = Math.min(endS, view.end);
            const left = ((visStart - view.start) / span) * 100;
            const width = Math.max(((visEnd - visStart) / span) * 100, 0.15);
            const isActive = c.id === activeClipId;
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => onSeek(c)}
                className={`absolute top-0 bottom-0 transition-[box-shadow] ${isActive ? 'ring-2 ring-foreground z-10' : ''}`}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: colour(c),
                }}
                title={`${formatClock(c.started_at)} · ${c.duration_sec ?? 0}s · ${c.status}`}
                data-testid={`cctv-timeline-clip-${c.id}`}
              />
            );
          })}
          {/* Playhead caret lives ONLY inside the track here — the head
              icon + tooltip are rendered in the outer wrapper (below) so
              they don't get clipped by the track's overflow-hidden. */}
          {playheadPct != null && (
            <div
              className="absolute top-0 bottom-0 w-[3px] -translate-x-[1px] pointer-events-none z-30 bg-operate shadow-[0_0_6px_2px_rgba(245,158,11,0.6)]"
              style={{ left: `${playheadPct}%` }}
              data-testid="cctv-timeline-playhead"
            />
          )}
        </div>
        {/* Play-head icon + timestamp chip floating above the track,
            rendered in the outer wrapper so the overflow-hidden on the
            track doesn't crop them. Uses the same HMS formatter so the
            chip reads just like the hover tooltip. */}
        {playheadPct != null && (
          <>
            <div
              className="absolute top-0 -translate-x-1/2 pointer-events-none z-30 flex flex-col items-center"
              style={{ left: `${playheadPct}%` }}
            >
              <div className="text-[11px] font-mono bg-operate text-white rounded-full px-2 py-0.5 shadow">
                {formatHMS((playheadSec as number))}
              </div>
              {/* Downward-pointing triangle that visually connects the
                  chip to the vertical caret below. */}
              <div
                className="w-0 h-0 -mt-px"
                style={{
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderTop: '6px solid var(--color-operate, #F59E0B)',
                }}
              />
            </div>
          </>
        )}
        {hoverX !== null && (
          <>
            {/* Hairline spans pt-6 gutter + h-10 track so cursor intent is
                clear all the way up to the tooltip pill. */}
            <div
              className="absolute top-6 bottom-0 w-px bg-foreground pointer-events-none z-20"
              style={{ left: hoverX }}
            />
            <div
              className="absolute top-0 text-[11px] font-mono bg-popover border border-border rounded px-1.5 py-0.5 pointer-events-none z-20 whitespace-nowrap -translate-x-1/2 shadow"
              style={{ left: hoverX }}
              data-testid="cctv-timeline-hover-time"
            >
              {hoverLabel}
            </div>
          </>
        )}
      </div>
      {zoomedIn && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>
            {t('cctv.cameras.timelineZoomed', { span: formatSpan(span) })}
          </span>
          <button
            type="button"
            className="underline hover:text-foreground"
            onClick={() => setView({ start: 0, end: DAY_TOTAL })}
            data-testid="cctv-button-timeline-reset-zoom"
          >
            {t('cctv.cameras.timelineReset')}
          </button>
        </div>
      )}
    </div>
  );
}

function formatSpan(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = seconds / 3600;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}
