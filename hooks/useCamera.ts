import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  stream: MediaStream | null;
  isActive: boolean;
  hasPermission: boolean | null;
  error: string | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  requestPermission: () => Promise<boolean>;
}

export function useCamera(): UseCameraReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Ref mirrors stream state so startCamera always sees the latest value without
  // needing stream in its dependency array (avoids stale-closure race condition).
  const streamRef = useRef<MediaStream | null>(null);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not supported in this browser');
        setHasPermission(false);
        return false;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setHasPermission(true);
      setError(null);
      return true;
    } catch (err: any) {
      setHasPermission(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No camera found. Please connect a camera and try again.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Camera is already in use by another application.');
      } else {
        setError('Failed to access camera. Please try again.');
      }
      return false;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;

    if (!streamRef.current) {
      const granted = await requestPermission();
      if (!granted) return;
    }

    const currentStream = streamRef.current;
    if (!currentStream || !videoRef.current) return;

    videoRef.current.srcObject = currentStream;
    try {
      await videoRef.current.play();
      setIsActive(true);
      setError(null);
    } catch (err: any) {
      // AbortError means play() was interrupted by pause() — expected when the
      // component unmounts (React StrictMode double-invoke) or user navigates away.
      if (err.name === 'AbortError') return;
      console.error('Failed to play video:', err);
      setError('Failed to start camera preview');
      setIsActive(false);
    }
  }, [requestPermission]); // no longer depends on stream state

  const stopCamera = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setIsActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    stream,
    isActive,
    hasPermission,
    error,
    startCamera,
    stopCamera,
    requestPermission,
  };
}
