import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import {
  ExternalLink,
  Maximize2,
  RotateCcw,
  Stethoscope,
  Video,
  VideoOff,
} from 'lucide-react';
import { getCameraStreamUrls, authenticatedUrl, type CameraDTO } from '@dm3/api-client';
import { SeverityPill, deriveSeverity, type Severity } from './CameraStatusBadge';

interface Props {
  camera: CameraDTO;
}

type TileState = 'idle' | 'connecting' | 'playing' | 'error';
type Transport = 'whep' | 'hls';

/**
 * Lightweight WHEP client + HLS fallback.
 *
 * WHEP = WebRTC HTTP Egress Protocol — sub-second latency; fails on restrictive
 * firewalls / NAT or when the browser cannot negotiate the codec.
 * HLS is the fallback — higher latency (~3-6s) but works anywhere via HTTP.
 *
 * Flow: try WHEP first; on any failure, tear down and try HLS. Only show the
 * error overlay when both fail.
 */
async function startWhep(
  whepUrl: string,
  videoEl: HTMLVideoElement,
  signal: AbortSignal,
): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection({
    // Use Google STUN only as fallback — local/LAN streams rarely need it.
    // Keeping it ensures NAT traversal works in remote/VPN scenarios.
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    iceCandidatePoolSize: 1,
  });

  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  pc.ontrack = (ev) => {
    if (videoEl.srcObject !== ev.streams[0]) {
      videoEl.srcObject = ev.streams[0];
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Wait for ICE gathering to complete (or timeout after 1s).
  // Most candidates are gathered in <200ms on LAN; the 1s cap avoids
  // blocking on slow STUN responses while still collecting relay candidates.
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const onStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        if (timeoutHandle !== null) clearTimeout(timeoutHandle);
        pc.removeEventListener('icegatheringstatechange', onStateChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onStateChange);
    timeoutHandle = setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      resolve();
    }, 1000);
  });

  if (signal.aborted) { pc.close(); throw new DOMException('Aborted', 'AbortError'); }

  const resp = await fetch(whepUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: pc.localDescription?.sdp,
    signal,
  });

  if (!resp.ok) throw new Error(`WHEP ${resp.status}`);
  const sdpAnswer = await resp.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });

  return pc;
}

function attachHls(
  hlsUrl: string,
  videoEl: HTMLVideoElement,
): Hls | null {
  // Safari (and some iOS browsers) play HLS natively via the media element.
  if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    videoEl.src = hlsUrl;
    return null;
  }
  if (!Hls.isSupported()) {
    throw new Error('HLS not supported in this browser');
  }
  const hls = new Hls({ lowLatencyMode: true });
  hls.loadSource(hlsUrl);
  hls.attachMedia(videoEl);
  return hls;
}

function formatLastFrame(iso?: string | null): string | null {
  if (!iso) return null;
  const age = Date.now() - new Date(iso).getTime();
  if (age < 60_000) return 'just now';
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

function maskRtsp(url?: string | null): string {
  if (!url) return '—';
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    if (u.username) u.username = u.username.replace(/./g, '•');
    return u.toString();
  } catch {
    return url.replace(/:([^:@/]+)@/, ':***@');
  }
}

export function LiveTile({ camera }: Props) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState<TileState>('idle');
  const [transport, setTransport] = useState<Transport>('whep');
  const [lastError, setLastError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [diagOpen, setDiagOpen] = useState(false);
  const [, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const abortCtrl = new AbortController();
    let mounted = true;

    (async () => {
      setState('connecting');
      setLastError(null);

      // Build stream URLs directly from camera ID — avoids an extra API
      // round-trip that added ~200-500ms before the WHEP handshake starts.
      const whepUrl = authenticatedUrl(`/cctv/whep/${camera.id}/whep`);
      const hlsUrl = authenticatedUrl(`/cctv/hls/${camera.id}/index.m3u8`);

      const videoEl = videoRef.current;
      if (!videoEl) return;

      // Try WHEP first (sub-second latency).
      try {
        const pc = await startWhep(whepUrl, videoEl, abortCtrl.signal);
        pcRef.current = pc;
        if (!mounted) { pc.close(); pcRef.current = null; return; }
        setTransport('whep');
        setState('playing');
        return;
      } catch (err: unknown) {
        if (!mounted || abortCtrl.signal.aborted) return;
        setLastError(err instanceof Error ? err.message : 'WHEP failed');
        // fall through to HLS
      }

      // Fallback: HLS over HTTP.
      try {
        const hls = attachHls(hlsUrl, videoEl);
        if (!mounted) { hls?.destroy(); return; }
        hlsRef.current = hls;
        setTransport('hls');
        setState('playing');
        setLastError(null);
      } catch (err: unknown) {
        if (mounted) {
          setLastError(err instanceof Error ? err.message : 'HLS failed');
          setState('error');
        }
      }
    })();

    return () => {
      mounted = false;
      abortCtrl.abort();
      pcRef.current?.close();
      pcRef.current = null;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [camera.id, retryToken]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const overlaySeverity = useMemo<Severity>(() => {
    if (state === 'connecting') return 'no-stream';
    if (state === 'error') {
      return deriveSeverity(camera) === 'online' ? 'offline' : deriveSeverity(camera);
    }
    return deriveSeverity(camera);
  }, [state, camera]);

  const showOverlay = state !== 'playing';
  const recording = camera.recording_mode === 'event_only';
  const lastFrame = formatLastFrame(camera.last_checked_at);

  const handleRetry = () => {
    setRetryToken((n) => n + 1);
  };

  const handleOpenCamera = () => {
    navigate(`/secure/cctv/cameras?id=${camera.id}`);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-[#0B1120] rounded-lg border border-border overflow-hidden flex flex-col min-h-0"
    >
      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full flex-1 object-cover min-h-0"
        data-testid={`cctv-video-${camera.id}`}
      />

      {/* Top overlay: name + transport tag */}
      {state === 'playing' && (
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
          <span className="text-[11px] font-medium text-white truncate">{camera.name}</span>
          <span className="flex items-center gap-1">
            {recording && (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-red-400 bg-black/50 px-1.5 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                REC
              </span>
            )}
            {transport === 'hls' && (
              <span
                className="text-[9px] uppercase tracking-wide text-amber-300"
                title={t('cctv.live.hlsFallback')}
              >
                HLS
              </span>
            )}
            <Video size={12} className="text-emerald-400" />
          </span>
        </div>
      )}

      {/* Degraded overlay (connecting / error / offline) */}
      {showOverlay && (
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0E1A]/95 to-[#0A0E1A] flex flex-col justify-between p-3">
          <div className="flex items-center justify-between">
            <SeverityPill severity={overlaySeverity} size="xs" />
            <span className="text-[10px] font-mono text-muted-foreground/70 truncate ml-2">
              {camera.name}
            </span>
          </div>

          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-1 px-2">
              <VideoOff size={32} className="mx-auto text-muted-foreground/40" />
              {state === 'connecting' ? (
                <p className="text-[11px] text-muted-foreground">{t('cctv.live.connecting')}</p>
              ) : (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    {t('cctv.live.lastFramePrefix')}: {lastFrame ?? t('cctv.lastFrame.never')}
                  </p>
                  {lastError && (
                    <p className="text-[10px] text-destructive/80 max-w-[260px] truncate mx-auto">
                      {lastError}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {state !== 'connecting' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={handleRetry}
                className="inline-flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-[10px] text-white rounded-full border border-white/10 transition-colors"
                data-testid={`cctv-button-retry-${camera.id}`}
              >
                <RotateCcw size={10} /> {t('cctv.live.retry')}
              </button>
              <button
                onClick={() => setDiagOpen(true)}
                className="inline-flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-[10px] text-white rounded-full border border-white/10 transition-colors"
                data-testid={`cctv-button-diag-${camera.id}`}
              >
                <Stethoscope size={10} /> {t('cctv.live.diag')}
              </button>
              <button
                onClick={handleOpenCamera}
                className="inline-flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-[10px] text-white rounded-full border border-white/10 transition-colors"
                data-testid={`cctv-button-open-${camera.id}`}
              >
                <ExternalLink size={10} /> {t('cctv.live.open')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Diagnostics modal */}
      {diagOpen && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-3"
          onClick={() => setDiagOpen(false)}
        >
          <div
            className="w-full max-w-[300px] bg-[#0D1117] border border-border rounded-lg p-3 text-left text-[11px] text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold">{t('cctv.live.diagnostics')}</span>
              <button
                onClick={() => setDiagOpen(false)}
                className="text-muted-foreground hover:text-foreground text-[14px] leading-none"
                aria-label={t('cctv.common.close')}
              >
                ×
              </button>
            </div>
            <dl className="space-y-1.5 font-mono text-[10px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">RTSP</dt>
                <dd className="truncate text-right">{maskRtsp(camera.rtsp_url)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Brand</dt>
                <dd>{camera.brand ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Last checked</dt>
                <dd>{lastFrame ?? t('cctv.lastFrame.never')}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{camera.status}</dd>
              </div>
              {lastError && (
                <div className="pt-1.5 border-t border-border">
                  <dt className="text-muted-foreground mb-0.5">Last error</dt>
                  <dd className="text-destructive/90 break-all">{lastError}</dd>
                </div>
              )}
            </dl>
            <button
              onClick={() => { setDiagOpen(false); handleRetry(); }}
              className="mt-3 w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[11px] rounded-md transition-colors"
              data-testid={`cctv-button-diag-retry-${camera.id}`}
            >
              <RotateCcw size={11} /> {t('cctv.live.retry')}
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="absolute bottom-1.5 right-1.5 p-1 rounded bg-black/40 text-white hover:bg-black/70 transition-colors"
        data-testid={`cctv-button-fullscreen-${camera.id}`}
        aria-label={t('cctv.live.fullscreen')}
      >
        <Maximize2 size={12} />
      </button>
    </div>
  );
}
