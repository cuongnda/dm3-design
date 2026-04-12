import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize2, Video, VideoOff } from 'lucide-react';
import { getCameraStreamUrls, type CameraDTO } from '@dm3/api-client';

interface Props {
  camera: CameraDTO;
}

type TileState = 'idle' | 'connecting' | 'playing' | 'error';

/**
 * Lightweight WHEP client (~60 lines).
 * WHEP = WebRTC HTTP Egress Protocol.
 * We POST an SDP offer to the WHEP URL and expect an SDP answer in the response.
 * The resulting RTCPeerConnection is wired to a <video> element.
 *
 * Phase 2 TODO: HLS.js fallback when WHEP fails (requires hls.js install).
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

export function LiveTile({ camera }: Props) {
  const { t } = useTranslation('common');
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [state, setState] = useState<TileState>('idle');
  const [, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const abortCtrl = new AbortController();
    let mounted = true;

    (async () => {
      try {
        setState('connecting');
        const urls = await getCameraStreamUrls(camera.id);
        if (!mounted) return;

        const videoEl = videoRef.current;
        if (!videoEl) return;

        const pc = await startWhep(urls.whep_url, videoEl, abortCtrl.signal);
        if (!mounted) { pc.close(); return; }

        pcRef.current = pc;
        setState('playing');
      } catch {
        if (!mounted) return;
        // Phase 2 TODO: fallback to HLS when WHEP unavailable
        setState('error');
      }
    })();

    return () => {
      mounted = false;
      abortCtrl.abort();
      pcRef.current?.close();
      pcRef.current = null;
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
          <Video size={12} className="text-emerald-400" />
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
