import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, RefreshCw, Check, X, AlertTriangle, SwitchCamera } from 'lucide-react';

// ── Taking a profile photo with a camera ─────────────────────────────────────
// The nurse wants the photo on a student's record to be what the student
// actually looks like, taken at the desk rather than whatever file happens to be
// on disk. This is the capture half of that; the file picker stays as the other
// option.
//
// A phone can be the camera here with no special support: Windows "Connected
// Camera" (Phone Link), or an app like DroidCam or Iriun, presents the phone as
// an ordinary webcam. It then shows up in the device list below like any other,
// which is why this offers a device picker rather than assuming one camera.
//
// THE CONSTRAINT WORTH KNOWING. getUserMedia only works in a secure context.
// Browsers treat localhost as secure, but a plain http:// address on the LAN is
// not — so the camera works on the clinic PC itself and is blocked for an
// assistant opening http://<clinic-ip>:4001 from another device. That is a
// browser rule, not something the app can switch off. Rather than show a button
// that silently does nothing there, this explains why and points at the file
// picker.

type Props = {
  open: boolean;
  onClose: () => void;
  /** Receives a downscaled JPEG data URL, same shape the file picker produces. */
  onCapture: (dataUrl: string) => void;
  /** Longest edge of the stored image, matching the file-upload path. */
  maxDim?: number;
  quality?: number;
};

type Phase = 'starting' | 'live' | 'review' | 'error';

/** Cameras need a secure context; localhost counts, a LAN IP over http does not. */
export function cameraAvailable(): boolean {
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
}

/** Why the camera cannot be used here, phrased for the person reading it. */
export function cameraUnavailableReason(): string {
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'This browser does not support taking photos. Use "Upload file" instead.';
  }
  if (!window.isSecureContext) {
    return `Your browser blocks the camera on ${window.location.protocol}//${window.location.host} because the connection is not private. `
         + 'Take the photo on the clinic PC itself, or use "Upload file".';
  }
  return 'The camera is unavailable. Use "Upload file" instead.';
}

export function PhotoCapture({ open, onClose, onCapture, maxDim = 480, quality = 0.82 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [shot, setShot] = useState<string>('');

  /** Release the camera. Skipping this leaves the webcam light on after closing. */
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async (wantedId?: string) => {
    stopStream();
    setPhase('starting');
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: wantedId
          ? { deviceId: { exact: wantedId } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => { /* autoplay guard; the stream is still live */ });
      }

      // Device labels are hidden until permission is granted, so the list is
      // read after the stream opens rather than before.
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === 'videoinput');
      setDevices(cams);
      const active = stream.getVideoTracks()[0]?.getSettings().deviceId ?? '';
      setDeviceId(wantedId || active || cams[0]?.deviceId || '');

      setPhase('live');
    } catch (err) {
      setPhase('error');
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError') {
        setError('Camera permission was denied. Allow camera access for this site in your browser, then try again.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('No camera was found. Connect one, or set up a phone as a webcam, then try again.');
      } else if (name === 'NotReadableError') {
        setError('The camera is already in use by another program. Close it and try again.');
      } else {
        setError('Could not start the camera.');
      }
    }
  }, [stopStream]);

  useEffect(() => {
    if (!open) return;
    if (!cameraAvailable()) {
      setPhase('error');
      setError(cameraUnavailableReason());
      return;
    }
    setShot('');
    start();
    return stopStream;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // Downscaled here to exactly match the file-upload path, so a captured
    // photo and an uploaded one are stored identically.
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setShot(canvas.toDataURL('image/jpeg', quality));
    setPhase('review');
  }

  function use() {
    onCapture(shot);
    stopStream();
    onClose();
  }

  function close() {
    stopStream();
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 1100, background: 'rgba(15,23,42,0.7)' }}
      onClick={close}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-blue-100 dark:border-slate-700 px-5 py-3.5">
          <span className="flex items-center gap-2 text-black dark:text-slate-100" style={{ fontSize: 14, fontWeight: 600 }}>
            <Camera size={16} className="text-blue-600" /> Take a photo
          </span>
          <button onClick={close} className="p-1.5 rounded-md text-slate-400 hover:text-black hover:bg-blue-100 dark:hover:bg-slate-700" title="Close">
            <X size={17} />
          </button>
        </div>

        <div className="p-5">
          {phase === 'error' ? (
            <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-3 text-amber-800 dark:text-amber-300" style={{ fontSize: 13 }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              <div className="relative overflow-hidden rounded-xl bg-slate-900" style={{ aspectRatio: '4 / 3' }}>
                {/* The live feed is mirrored so it behaves like a mirror while
                    the student sits down; the captured frame is not. */}
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                  style={{ transform: 'scaleX(-1)', display: phase === 'review' ? 'none' : 'block' }}
                />
                {phase === 'review' && shot && (
                  <img src={shot} alt="Captured photo" className="h-full w-full object-cover" />
                )}
                {phase === 'starting' && (
                  <div className="absolute inset-0 flex items-center justify-center text-white" style={{ fontSize: 13 }}>
                    Starting the camera…
                  </div>
                )}
              </div>

              {/* Shown only when there is a genuine choice — a phone set up as a
                  webcam appears here alongside the built-in one. */}
              {phase === 'live' && devices.length > 1 && (
                <label className="mt-3 flex items-center gap-2">
                  <SwitchCamera size={14} className="shrink-0 text-slate-400" />
                  <select
                    value={deviceId}
                    onChange={(e) => { setDeviceId(e.target.value); start(e.target.value); }}
                    className="w-full rounded-lg border border-blue-100 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-black dark:text-slate-200"
                    style={{ fontSize: 12.5 }}
                  >
                    {devices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-blue-100 dark:border-slate-700 px-5 py-3">
          {phase === 'review' ? (
            <>
              <button
                onClick={() => { setShot(''); start(deviceId || undefined); }}
                className="flex items-center gap-1.5 rounded-lg border border-blue-100 dark:border-slate-600 px-4 py-2 text-slate-600 dark:text-slate-300"
                style={{ fontSize: 13 }}
              >
                <RefreshCw size={14} /> Retake
              </button>
              <button
                onClick={use}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                style={{ fontSize: 13, fontWeight: 600 }}
              >
                <Check size={14} /> Use this photo
              </button>
            </>
          ) : (
            <>
              <button onClick={close} className="rounded-lg border border-blue-100 dark:border-slate-600 px-4 py-2 text-slate-600 dark:text-slate-300" style={{ fontSize: 13 }}>
                Cancel
              </button>
              <button
                onClick={capture}
                disabled={phase !== 'live'}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                style={{ fontSize: 13, fontWeight: 600 }}
              >
                <Camera size={14} /> Capture
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
