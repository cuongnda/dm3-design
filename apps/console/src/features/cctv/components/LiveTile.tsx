import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Hls from 'hls.js';
import { Maximize2, Video, VideoOff } from 'lucide-react';
import { getCameraStreamUrls, type CameraDTO } from '@dm3/api-client';

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
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
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

  // Wait for ICE gathering to complete (or timeout after 3s)
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const onStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onStateChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onStateChange);
    setTimeout(resolve, 3000);
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

export function LiveTile({ camera }: Props) {
  const { t } = useTranslation('common');
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState<TileState>('idle');
  const [transport, setTransport] = useState<Transport>('whep');
  const [, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const abortCtrl = new AbortController();
    let mounted = true;

    (async () => {
      setState('connecting');
      let urls;
      try {
        urls = await getCameraStreamUrls(camera.id);
      } catch {
        if (mounted) setState('error');
        return;
      }
      if (!mounted) return;

      const videoEl = videoRef.current;
      if (!videoEl) return;

      // Try WHEP first (sub-second latency).
      try {
        const pc = await startWhep(urls.whep_url, videoEl, abortCtrl.signal);
        if (!mounted) { pc.close(); return; }
        pcRef.current = pc;
        setTransport('whep');
        setState('playing');
        return;
      } catch {
        if (!mounted || abortCtrl.signal.aborted) return;
        // fall through to HLS
      }

      // Fallback: HLS over HTTP.
      try {
        if (!urls.hls_url) throw new Error('No HLS URL');
        const hls = attachHls(urls.hls_url, videoEl);
        if (!mounted) { hls?.destroy(); return; }
        hlsRef.current = hls;
        setTransport('hls');
        setState('playing');
      } catch {
        if (mounted) setState('error');
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
  }, [camera.id]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative bg-[#0B1120] rounded-lg border border-border overflow-hidden flex flex-col min-h-0"
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

      {/* Overlay: name + status */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-black/60 to-transparent">
        <span className="text-[11px] font-medium text-white truncate">{camera.name}</span>
        {state === 'connecting' && (
          <span className="text-[10px] text-[#3B82F6]">{t('cctv.live.connecting')}</span>
        )}
        {state === 'error' && (
          <VideoOff size={12} className="text-red-400" />
        )}
        {state === 'playing' && (
          <span className="flex items-center gap-1">
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
        )}
      </div>

      {/* Error overlay */}
      {state === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <VideoOff size={24} className="text-muted-foreground mx-auto mb-1" />
            <p className="text-[11px] text-muted-foreground">{t('cctv.live.streamError')}</p>
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
