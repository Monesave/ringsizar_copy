'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCamera } from '@/hooks/useCamera';
import { HandTracker, type HandDetection } from '@/lib/mediapipe/handTracker';
import { AROverlay } from '@/components/ar/AROverlay';
import { drawScanLine, drawCoinGuide, validateCoinPixels } from '@/utils/fingerMeasurement';
import { convertFingerWidthToRingSize, validateMeasurement } from '@/utils/fingerDetection';
import { convertDiameterToSizes } from '@/utils/ringSize/converter';
import { COIN_OPTIONS, type CoinCalibration, type LocalMeasurement } from '@/types/measurement';
import type { Finger, Hand } from '@/types/measurement';
import { saveMeasurement } from '@/lib/supabase/measurements';
import { getCurrentUser } from '@/lib/supabase/auth';

type AppStep = 'coin-setup' | 'coin-click' | 'measure' | 'result';

/**
 * Interaction mode — single source of truth for canvas pointer events.
 * Coin calibration = clicks allowed.
 * Measurement = fully automatic, zero clicks accepted.
 */
type InteractionMode = 'coin_calibration' | 'measurement';

function stepToMode(step: AppStep): InteractionMode {
  return step === 'coin-click' ? 'coin_calibration' : 'measurement';
}

// ── Top Progress Stepper ───────────────────────────────────────────────────
function StepProgressBar({ currentStep }: { currentStep: AppStep }) {
  const steps: { key: AppStep; label: string; num: number }[] = [
    { key: 'coin-setup', label: 'Reference Coin', num: 1 },
    { key: 'coin-click', label: 'Mark Circle', num: 2 },
    { key: 'measure', label: 'Measure Finger', num: 3 },
    { key: 'result', label: 'Ring Size', num: 4 },
  ];

  const getStepStatus = (stepKey: AppStep) => {
    const order: AppStep[] = ['coin-setup', 'coin-click', 'measure', 'result'];
    const currentIdx = order.indexOf(currentStep);
    const stepIdx = order.indexOf(stepKey);
    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'active';
    return 'upcoming';
  };

  return (
    <div className="w-full bg-white border-b border-gray-200 px-4 py-2.5 shadow-sm sticky top-0 z-30">
      <div className="max-w-xl mx-auto flex items-center justify-between">
        {steps.map((s, idx) => {
          const status = getStepStatus(s.key);
          return (
            <React.Fragment key={s.key}>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    status === 'completed'
                      ? 'bg-emerald-600 text-white'
                      : status === 'active'
                      ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {status === 'completed' ? '✓' : s.num}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:inline ${
                    status === 'active'
                      ? 'text-blue-600 font-semibold'
                      : status === 'completed'
                      ? 'text-gray-700'
                      : 'text-gray-400'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    getStepStatus(steps[idx + 1].key) !== 'upcoming'
                      ? 'bg-emerald-500'
                      : 'bg-gray-200'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default function ARMeasurementPage() {
  const router = useRouter();
  const { videoRef, isActive, hasPermission, error: cameraError, startCamera, requestPermission } = useCamera();

  const handTrackerRef = useRef<HandTracker | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [step, setStep] = useState<AppStep>('coin-setup');
  const [selectedHand, setSelectedHand] = useState<Hand>('right');
  const [selectedFinger, setSelectedFinger] = useState<Finger>('ring');

  // Coin calibration state
  const [coinOptionIdx, setCoinOptionIdx] = useState(0);
  const [customCoinMm, setCustomCoinMm] = useState('');
  const [coinClicks, setCoinClicks] = useState<{ x: number; y: number }[]>([]);
  const [coinCalibration, setCoinCalibration] = useState<CoinCalibration | null>(null);

  // Image upload state
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const [useUpload, setUseUpload] = useState(false);

  // Result state
  const [result, setResult] = useState<LocalMeasurement | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [draggingCoinIdx, setDraggingCoinIdx] = useState<number | null>(null);

  const interactionMode: InteractionMode = stepToMode(step);

  // ── Initialize MediaPipe ──────────────────────────────────────────────────
  useEffect(() => {
    const tracker = new HandTracker();
    handTrackerRef.current = tracker;

    tracker.initialize()
      .then(() => setIsInitialized(true))
      .catch((e) => {
        console.error('HandTracker init failed:', e);
        setInitError('Failed to load hand tracking model. Please refresh.');
      });

    return () => {
      handTrackerRef.current?.dispose();
      handTrackerRef.current = null;
    };
  }, []);

  // ── Start camera once step requires video ──────────────────────────────────
  useEffect(() => {
    if (step !== 'measure' && step !== 'coin-click') return;
    if (useUpload) return;
    if (hasPermission === null) {
      requestPermission();
    } else if (hasPermission) {
      startCamera();
    }
  }, [step, useUpload, hasPermission, requestPermission, startCamera]);

  // ── Hidden frame canvas ────────────────────────────────────────────────────
  useEffect(() => {
    if (!frameCanvasRef.current) {
      frameCanvasRef.current = document.createElement('canvas');
    }
  }, []);

  // ── Coin diameter from selection ──────────────────────────────────────────
  const getCoinDiameterMm = (): number | null => {
    const option = COIN_OPTIONS[coinOptionIdx];
    if (option.diameterMm === 0) {
      const v = parseFloat(customCoinMm);
      return isNaN(v) || v <= 0 ? null : v;
    }
    return option.diameterMm;
  };

  // ── Canvas coordinate helper ──────────────────────────────────────────────
  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }, []);

  const commitCoinCalibration = useCallback((clicks: { x: number; y: number }[]) => {
    if (clicks.length < 2) return;
    const coinDiameterMm = getCoinDiameterMm();
    if (!coinDiameterMm) return;
    const coinPixels = Math.hypot(clicks[1].x - clicks[0].x, clicks[1].y - clicks[0].y);

    const coinErr = validateCoinPixels(coinPixels);
    if (coinErr) {
      setCaptureError(coinErr.message);
      return;
    }

    const pixelsPerMm = coinPixels / coinDiameterMm;
    const mmPerPixel  = coinDiameterMm / coinPixels;
    setCoinCalibration({ coinDiameterMm, coinPixels, pixelsPerMm, mmPerPixel });
    handTrackerRef.current?.setCalibrationFactor(mmPerPixel);
    setCaptureError(null);
  }, [coinOptionIdx, customCoinMm]);

  // ── Handle coin click / drag on canvas ────────────────────────────────────
  const handleCoinCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (interactionMode !== 'coin_calibration') return;
    const pt = getCanvasCoords(e);
    if (!pt) return;

    // If clicking near an existing point (within 18px), drag it
    const hitIdx = coinClicks.findIndex(
      (c) => Math.hypot(c.x - pt.x, c.y - pt.y) < 18
    );
    if (hitIdx !== -1) {
      setDraggingCoinIdx(hitIdx);
      return;
    }

    setCoinClicks((prev) => {
      if (prev.length >= 2) {
        const next = [prev[1], pt];
        commitCoinCalibration(next);
        return next;
      }
      const next = [...prev, pt];
      if (next.length === 2) commitCoinCalibration(next);
      return next;
    });
  }, [interactionMode, coinClicks, getCanvasCoords, commitCoinCalibration]);

  const handleCoinCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingCoinIdx === null || interactionMode !== 'coin_calibration') return;
    const pt = getCanvasCoords(e);
    if (!pt) return;
    setCoinClicks((prev) => {
      const next = [...prev];
      next[draggingCoinIdx] = pt;
      if (next.length === 2) commitCoinCalibration(next);
      return next;
    });
  }, [draggingCoinIdx, interactionMode, getCanvasCoords, commitCoinCalibration]);

  const handleCoinCanvasMouseUp = useCallback(() => {
    setDraggingCoinIdx(null);
  }, []);

  // ── Spawn default target ring centered on canvas ──────────────────────────
  const handleInitializeDefaultRing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const defaultRadius = Math.round(canvas.width * 0.12);
    const defaultClicks = [
      { x: Math.round(cx - defaultRadius), y: Math.round(cy) },
      { x: Math.round(cx + defaultRadius), y: Math.round(cy) },
    ];
    setCoinClicks(defaultClicks);
    commitCoinCalibration(defaultClicks);
  };

  // ── Slider span change handler ─────────────────────────────────────────────
  const handleSliderSpanChange = (newSpanPx: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cx = canvas.width * 0.5;
    let cy = canvas.height * 0.5;
    if (coinClicks.length >= 2) {
      cx = (coinClicks[0].x + coinClicks[1].x) / 2;
      cy = (coinClicks[0].y + coinClicks[1].y) / 2;
    }
    const halfSpan = newSpanPx / 2;
    const newClicks = [
      { x: Math.round(Math.max(10, cx - halfSpan)), y: Math.round(cy) },
      { x: Math.round(Math.min(canvas.width - 10, cx + halfSpan)), y: Math.round(cy) },
    ];
    setCoinClicks(newClicks);
    commitCoinCalibration(newClicks);
  };

  // ── Draw coin guide + click markers on overlay canvas ─────────────────────
  useEffect(() => {
    if (step !== 'coin-click') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    const video = videoRef.current;
    if (!useUpload && video && video.videoWidth > 0) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const coinDiameterMm = getCoinDiameterMm() ?? undefined;
    const selectedOption = COIN_OPTIONS[coinOptionIdx];

    if (coinClicks.length === 0) {
      // Draw initial centered guide circle
      const guideR  = Math.round(canvas.width * 0.1);
      const guideCx = Math.round(canvas.width * 0.5);
      const guideCy = Math.round(canvas.height * 0.5);
      drawCoinGuide(ctx, guideCx, guideCy, guideR, false, selectedOption.label, coinDiameterMm);
      return;
    }

    if (coinClicks.length === 1) {
      // Draw point 1 marker + guide circle around it
      const pt1 = coinClicks[0];
      const guideR = Math.round(canvas.width * 0.1);
      drawCoinGuide(ctx, pt1.x, pt1.y, guideR, false, selectedOption.label, coinDiameterMm);

      ctx.save();
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(pt1.x, pt1.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (coinClicks.length === 2) {
      // Both points defined: calculate center, radius, distance
      const mx = (coinClicks[0].x + coinClicks[1].x) / 2;
      const my = (coinClicks[0].y + coinClicks[1].y) / 2;
      const dist = Math.hypot(coinClicks[1].x - coinClicks[0].x, coinClicks[1].y - coinClicks[0].y);
      const radius = dist / 2;

      // Draw dynamic calibration circle overlay
      drawCoinGuide(ctx, mx, my, radius, coinCalibration !== null, selectedOption.label, coinDiameterMm);

      // Draw dashed diameter line across coin
      ctx.save();
      ctx.strokeStyle = coinCalibration ? '#10B981' : '#F59E0B';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(coinClicks[0].x, coinClicks[0].y);
      ctx.lineTo(coinClicks[1].x, coinClicks[1].y);
      ctx.stroke();

      // Readout badge at midpoint
      ctx.setLineDash([]);
      const labelStr = `${dist.toFixed(1)} px`;
      ctx.font = 'bold 11px monospace';
      const textW = ctx.measureText(labelStr).width;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(mx - textW / 2 - 8, my - 24, textW + 16, 20);
      ctx.fillStyle = coinCalibration ? '#34D399' : '#FBBF24';
      ctx.textAlign = 'center';
      ctx.fillText(labelStr, mx, my - 10);
      ctx.restore();

      // Point edge markers 1 & 2
      coinClicks.forEach((pt, i) => {
        ctx.save();
        ctx.strokeStyle = coinCalibration ? '#10B981' : '#F59E0B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = coinCalibration ? '#10B981' : '#F59E0B';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), pt.x, pt.y + 3);
        ctx.restore();
      });
    }
  }, [coinClicks, step, coinCalibration, coinOptionIdx, customCoinMm, useUpload, videoRef]);

  // ── Capture frame for measurement ─────────────────────────────────────────
  const captureFrame = useCallback((): CanvasRenderingContext2D | null => {
    const fc = frameCanvasRef.current;
    if (!fc) return null;

    if (useUpload && uploadedImage) {
      fc.width = uploadedImage.naturalWidth;
      fc.height = uploadedImage.naturalHeight;
      const ctx = fc.getContext('2d');
      ctx?.drawImage(uploadedImage, 0, 0);
      return ctx;
    }

    const video = videoRef.current;
    if (!video || video.readyState < video.HAVE_ENOUGH_DATA) return null;
    fc.width = video.videoWidth;
    fc.height = video.videoHeight;
    const ctx = fc.getContext('2d');
    ctx?.drawImage(video, 0, 0);
    return ctx;
  }, [useUpload, uploadedImage, videoRef]);

  // ── Main capture & measure handler ───────────────────────────────────────
  const handleCapture = async () => {
    const tracker = handTrackerRef.current;
    if (!tracker || !isInitialized) {
      setCaptureError('Hand tracking model not initialized yet.');
      return;
    }
    if (!coinCalibration) {
      setCaptureError('Coin calibration required before measuring.');
      return;
    }

    setCaptureError(null);
    setIsCapturing(true);

    try {
      const frameCtx = captureFrame();
      if (!frameCtx) {
        setCaptureError('Could not capture frame from camera or upload.');
        setIsCapturing(false);
        return;
      }

      let detections: HandDetection[];
      if (useUpload && uploadedImage) {
        detections = await tracker.detectImage(uploadedImage);
      } else {
        const source = videoRef.current;
        if (!source) {
          setCaptureError('No video feed available.');
          setIsCapturing(false);
          return;
        }
        detections = tracker.detectHands(source);
      }

      if (detections.length === 0) {
        setCaptureError('No hand detected in frame. Please align your hand clearly.');
        setIsCapturing(false);
        return;
      }

      const detection = detections.find(
        (d) => d.handedness.toLowerCase() === selectedHand
      ) ?? detections[0];

      const measureResult = tracker.measureFingerWidth(detection, selectedFinger, frameCtx);

      if (!measureResult.ok) {
        setCaptureError(measureResult.error.message);
        setIsCapturing(false);
        return;
      }

      const { measurement } = measureResult;

      const overlayCtx = canvasRef.current?.getContext('2d');
      if (overlayCtx && canvasRef.current) {
        if (useUpload && uploadedImage) {
          canvasRef.current.width = uploadedImage.naturalWidth;
          canvasRef.current.height = uploadedImage.naturalHeight;
        }
        drawScanLine(overlayCtx, measurement.scanLine, measurement.widthPixels);
      }

      const ringMeasurement = convertFingerWidthToRingSize(measurement, coinCalibration.mmPerPixel);

      if (!validateMeasurement(ringMeasurement)) {
        setCaptureError(
          `Measurement (${ringMeasurement.diameterMm.toFixed(1)} mm) is outside valid ring range. ` +
          'Ensure good lighting and keep finger flat.'
        );
        setIsCapturing(false);
        return;
      }

      const sizes = convertDiameterToSizes(ringMeasurement.diameterMm);

      const localResult: LocalMeasurement = {
        id: Date.now().toString(),
        type: 'finger_ar',
        label: `${selectedHand.charAt(0).toUpperCase() + selectedHand.slice(1)} ${selectedFinger.charAt(0).toUpperCase() + selectedFinger.slice(1)}`,
        hand: selectedHand,
        finger: selectedFinger,
        innerDiameterMm: ringMeasurement.diameterMm,
        innerCircumferenceMm: ringMeasurement.circumferenceMm,
        sizeUS: sizes.us,
        sizeEU: sizes.eu,
        sizeUK_AU_NZ: sizes.uk_au_nz,
        sizeJP_CN: sizes.jp_cn,
        createdAt: new Date(),
      };

      setResult(localResult);
      setStep('result');

      getCurrentUser().then((user) => {
        if (user) saveMeasurement(localResult)
          .then(({ error }) => setSaveStatus(error ? 'error' : 'saved'))
          .catch(() => setSaveStatus('error'));
      });
    } catch (e) {
      console.error('Capture error:', e);
      setCaptureError('An unexpected error occurred during measurement.');
    } finally {
      setIsCapturing(false);
    }
  };

  // ── Image upload handler ──────────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        setUploadedImage(img);
        setUseUpload(true);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER VIEWS
  // ─────────────────────────────────────────────────────────────────────────

  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-gray-50">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
          <p className="text-red-700 font-semibold mb-3">{initError}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  // ── Step: Result ──────────────────────────────────────────────────────────
  if (step === 'result' && result) {
    const fingerLabels: Record<string, string> = {
      thumb: 'Thumb', index: 'Index Finger', middle: 'Middle Finger', ring: 'Ring Finger', little: 'Little Finger',
    };
    const handLabel = result.hand
      ? result.hand.charAt(0).toUpperCase() + result.hand.slice(1) + ' Hand'
      : null;
    const fingerLabel = result.finger ? fingerLabels[result.finger] : null;

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <StepProgressBar currentStep="result" />
        <div className="max-w-lg mx-auto p-4 flex-1 w-full pb-24">
          <h1 className="text-2xl font-bold mb-4 text-gray-900">Your Ring Size Results</h1>

          <div className="bg-white rounded-xl shadow-md p-6 mb-4 space-y-4 border border-gray-100">
            {(handLabel || fingerLabel) && (
              <div className="flex gap-4 pb-3 border-b border-gray-100">
                {handLabel && (
                  <div className="flex items-center gap-2">
                    <span className="text-xl">✋</span>
                    <div>
                      <p className="text-xs text-gray-500">Hand</p>
                      <p className="font-semibold text-sm">{handLabel}</p>
                    </div>
                  </div>
                )}
                {fingerLabel && (
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💍</span>
                    <div>
                      <p className="text-xs text-gray-500">Finger</p>
                      <p className="font-semibold text-sm">{fingerLabel}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-blue-50/80 rounded-xl p-4 border border-blue-100">
                <p className="text-xs font-medium text-blue-600 mb-1">Inner Diameter</p>
                <p className="text-2xl font-extrabold text-blue-800">{result.innerDiameterMm.toFixed(2)} <span className="text-sm font-normal">mm</span></p>
              </div>
              <div className="bg-blue-50/80 rounded-xl p-4 border border-blue-100">
                <p className="text-xs font-medium text-blue-600 mb-1">Inner Circumference</p>
                <p className="text-2xl font-extrabold text-blue-800">{result.innerCircumferenceMm.toFixed(2)} <span className="text-sm font-normal">mm</span></p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center pt-3 border-t border-gray-100">
              {[
                { label: 'US', value: result.sizeUS },
                { label: 'EU', value: result.sizeEU },
                { label: 'UK/AU', value: result.sizeUK_AU_NZ },
                { label: 'JP/CN', value: result.sizeJP_CN },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <p className="text-xs text-gray-500 font-medium">{label}</p>
                  <p className="text-lg font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-4 text-xs text-amber-800 flex items-start gap-2">
            <span className="text-base">💡</span>
            <p>Finger size varies slightly with temperature and time of day. Measure at room temperature for best ring fit.</p>
          </div>

          {saveStatus === 'saved' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 mb-4 flex items-center gap-2 text-sm text-emerald-800 font-medium">
              <span>✓</span> Saved to your profile measurements.
            </div>
          )}
        </div>

        {/* STICKY BOTTOM ACTION BAR */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-xl z-30">
          <div className="max-w-lg mx-auto flex gap-3">
            <button
              onClick={() => { setStep('coin-setup'); setResult(null); setCoinCalibration(null); setCoinClicks([]); }}
              className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-sm transition-all"
            >
              Measure Again
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Coin Setup ────────────────────────────────────────────────────
  if (step === 'coin-setup') {
    const selectedOption = COIN_OPTIONS[coinOptionIdx];
    const isCustom = selectedOption.diameterMm === 0;
    const canProceed = isCustom
      ? parseFloat(customCoinMm) > 0
      : true;

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <StepProgressBar currentStep="coin-setup" />

        <div className="max-w-lg mx-auto p-4 flex-1 w-full pb-28">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Step 1 — Select Reference Coin</h1>
            <p className="text-gray-600 text-sm">
              Place a coin next to your finger in the frame to calibrate pixel scale.
            </p>
          </div>

          {/* VISUAL COIN REFERENCE CARD */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-4 mb-5 shadow-md flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-200 font-medium uppercase tracking-wider mb-0.5">Selected Scale Reference</p>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span>{selectedOption.icon}</span> {selectedOption.label}
              </h3>
              <p className="text-xs text-blue-100 mt-1">
                {isCustom
                  ? customCoinMm ? `Diameter: ${customCoinMm} mm` : 'Enter custom diameter below'
                  : `Real-world diameter: ${selectedOption.diameterMm} mm`}
              </p>
            </div>
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-white/60 flex items-center justify-center bg-white/10 shrink-0">
              <span className="text-xs font-bold text-white">
                {isCustom ? (customCoinMm || '?') : selectedOption.diameterMm}mm
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4 mb-5">
            <label className="block text-sm font-semibold text-gray-800">Choose your coin currency / type</label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {COIN_OPTIONS.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCoinOptionIdx(i)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    coinOptionIdx === i
                      ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-medium ring-2 ring-blue-500/20'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="text-xl shrink-0">{opt.icon}</span>
                  <span className="text-xs leading-tight flex-1">{opt.label}</span>
                </button>
              ))}
            </div>

            {isCustom && (
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-700 mb-1">Custom Coin Diameter (mm)</label>
                <input
                  type="number"
                  value={customCoinMm}
                  onChange={(e) => setCustomCoinMm(e.target.value)}
                  placeholder="e.g. 21.5"
                  min="5"
                  max="60"
                  step="0.1"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">Or upload photo from gallery</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="text-xs text-gray-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              />
              {uploadedImage && (
                <p className="text-xs text-emerald-600 mt-1 font-medium flex items-center gap-1">
                  <span>✓</span> Loaded photo ({uploadedImage.naturalWidth} × {uploadedImage.naturalHeight} px)
                </p>
              )}
            </div>
          </div>

          <div className="bg-blue-50/80 border border-blue-200/70 rounded-xl p-4 text-xs text-blue-900 space-y-1.5">
            <p className="font-semibold text-blue-950 flex items-center gap-1">
              <span>📋</span> Next Step Instructions:
            </p>
            <p>1. Place your coin flat next to your finger in the frame.</p>
            <p>2. On the next screen, align the circle overlay to your coin's outer diameter.</p>
          </div>
        </div>

        {/* STICKY BOTTOM ACTION BAR */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-xl z-30">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="px-4 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 text-sm transition-all"
            >
              ← Home
            </button>
            <button
              disabled={!canProceed}
              onClick={() => setStep('coin-click')}
              className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm shadow-md transition-all flex items-center justify-center gap-1"
            >
              <span>Next — Mark Scale Circle</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Coin Click / Circle Alignment ──────────────────────────────────
  if (step === 'coin-click') {
    const selectedOption = COIN_OPTIONS[coinOptionIdx];
    const coinDiameterMm = getCoinDiameterMm();
    const currentSpanPx = coinClicks.length === 2
      ? Math.round(Math.hypot(coinClicks[1].x - coinClicks[0].x, coinClicks[1].y - coinClicks[0].y))
      : 180;

    return (
      <div className="flex flex-col min-h-screen bg-gray-950 text-white">
        <StepProgressBar currentStep="coin-click" />

        {/* TOP STEP INSTRUCTION BANNER */}
        <div className="bg-gray-900/90 border-b border-gray-800 px-4 py-2.5 text-center text-xs sm:text-sm font-medium z-20">
          {coinClicks.length === 0 && (
            <span className="text-amber-300 flex items-center justify-center gap-1.5">
              <span>📍</span> Step 1 of 2: Tap the <strong>LEFT edge</strong> of your coin (or tap "Preset Circle Ring" below)
            </span>
          )}
          {coinClicks.length === 1 && (
            <span className="text-amber-300 flex items-center justify-center gap-1.5">
              <span>📍</span> Step 2 of 2: Tap the <strong>RIGHT edge</strong> of your coin
            </span>
          )}
          {coinClicks.length === 2 && (
            <span className="text-emerald-300 flex items-center justify-center gap-1.5">
              <span>✓</span> Scale Circle Calibrated ({coinDiameterMm} mm = {currentSpanPx} px). Adjust with slider if needed.
            </span>
          )}
        </div>

        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          {useUpload && uploadedImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={uploadedImage.src}
              alt="uploaded photo"
              className="w-full h-full object-contain max-h-[70vh]"
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover max-h-[70vh]"
            />
          )}

          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
            onClick={handleCoinCanvasClick}
            onMouseMove={handleCoinCanvasMouseMove}
            onMouseUp={handleCoinCanvasMouseUp}
            onMouseLeave={handleCoinCanvasMouseUp}
          />
        </div>

        {/* INTERACTIVE CIRCLE DIAMETER CONTROLS */}
        <div className="bg-gray-900 border-t border-gray-800 p-3 text-xs z-20 space-y-2">
          {coinClicks.length < 2 ? (
            <div className="flex items-center justify-between max-w-lg mx-auto">
              <span className="text-gray-400">Can't tap exact edges easily?</span>
              <button
                onClick={handleInitializeDefaultRing}
                className="px-3 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg hover:bg-amber-500/30 transition-all font-medium"
              >
                🎯 Place Target Ring Overlay
              </button>
            </div>
          ) : (
            <div className="max-w-lg mx-auto flex items-center gap-3">
              <span className="text-gray-400 whitespace-nowrap">Circle Span:</span>
              <input
                type="range"
                min="80"
                max="400"
                value={currentSpanPx}
                onChange={(e) => handleSliderSpanChange(Number(e.target.value))}
                className="flex-1 accent-emerald-500 cursor-pointer"
              />
              <span className="font-mono text-emerald-400 font-bold min-w-[55px] text-right">{currentSpanPx} px</span>
            </div>
          )}
        </div>

        {captureError && (
          <div className="bg-red-900/80 border-t border-red-700 text-red-200 px-4 py-2 text-xs text-center">
            {captureError}
          </div>
        )}

        {/* STICKY BOTTOM ACTION BAR */}
        <div className="bg-gray-950 p-4 border-t border-gray-800 z-30 sticky bottom-0">
          <div className="max-w-lg mx-auto flex items-center gap-2.5">
            <button
              onClick={() => { setCoinClicks([]); setStep('coin-setup'); }}
              className="py-3 px-4 bg-gray-800 text-gray-300 rounded-xl text-xs font-semibold hover:bg-gray-700 transition-all"
            >
              ← Back
            </button>

            {coinClicks.length > 0 && (
              <button
                onClick={() => { setCoinClicks([]); setCoinCalibration(null); }}
                className="py-3 px-3.5 bg-gray-800 text-amber-400 rounded-xl text-xs font-semibold hover:bg-gray-700 transition-all"
              >
                Reset
              </button>
            )}

            <button
              disabled={!coinCalibration}
              onClick={() => setStep('measure')}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-semibold shadow-lg transition-all flex items-center justify-center gap-1.5 ${
                coinCalibration
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white ring-2 ring-emerald-400/30'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              {coinCalibration ? (
                <>
                  <span>✓ Next: Measure Finger</span>
                  <span>→</span>
                </>
              ) : (
                <span>Mark 2 edges to enable Next</span>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Finger Measure ────────────────────────────────────────────────
  if (hasPermission === false && !useUpload) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-gray-50">
        <StepProgressBar currentStep="measure" />
        <div className="max-w-md bg-white p-6 rounded-2xl shadow-md border border-gray-200 mt-8">
          <h2 className="text-xl font-bold mb-3 text-gray-900">Camera Access Needed</h2>
          <p className="text-sm text-gray-600 mb-5">Please allow camera access to enable AR finger detection.</p>
          {cameraError && <p className="text-red-600 mb-4 text-xs bg-red-50 p-2.5 rounded-lg">{cameraError}</p>}
          <button onClick={requestPermission} className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 shadow-md">
            Grant Camera Permission
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">
      <StepProgressBar currentStep="measure" />

      {/* TOP STATUS BANNER */}
      <div className="bg-gray-900/90 border-b border-gray-800 px-4 py-2 text-center text-xs font-medium z-20 flex items-center justify-between max-w-xl mx-auto w-full">
        <span className="text-emerald-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Automatic detection active
        </span>
        {coinCalibration && (
          <span className="text-gray-300 font-mono text-[11px] bg-gray-800 px-2 py-0.5 rounded-full">
            🪙 {coinCalibration.coinDiameterMm} mm ({coinCalibration.mmPerPixel.toFixed(3)} mm/px)
          </span>
        )}
      </div>

      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {useUpload && uploadedImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={uploadedImage.src} alt="uploaded" className="w-full h-full object-contain max-h-[70vh]" />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover max-h-[70vh]"
            style={{ display: isActive ? 'block' : 'none' }}
          />
        )}

        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        <AROverlay
          videoRef={videoRef}
          canvasRef={canvasRef}
          handTracker={handTrackerRef.current}
          selectedFinger={selectedFinger}
          showLandmarks={true}
          showRingOverlay={false}
          ringSize=""
        />

        {isCapturing && (
          <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-30">
            <div className="text-white text-center p-6 bg-gray-900/90 rounded-2xl border border-gray-800 backdrop-blur-md shadow-2xl">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mx-auto mb-3" />
              <p className="font-semibold text-sm">Analyzing Finger Dimensions...</p>
            </div>
          </div>
        )}
      </div>

      {captureError && (
        <div className="bg-red-900/90 border-t border-red-700 text-red-200 px-4 py-2.5 text-xs text-center font-medium z-20">
          ⚠️ {captureError}
        </div>
      )}

      {/* STICKY BOTTOM CONTROL BAR */}
      <div className="bg-gray-950 p-4 border-t border-gray-800 z-30 sticky bottom-0">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Target Hand</label>
              <select
                value={selectedHand}
                onChange={(e) => setSelectedHand(e.target.value as Hand)}
                className="w-full p-2.5 bg-gray-900 border border-gray-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="right font-medium">Right Hand</option>
                <option value="left">Left Hand</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Target Finger</label>
              <select
                value={selectedFinger}
                onChange={(e) => setSelectedFinger(e.target.value as Finger)}
                className="w-full p-2.5 bg-gray-900 border border-gray-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="ring">Ring Finger</option>
                <option value="index">Index Finger</option>
                <option value="middle">Middle Finger</option>
                <option value="thumb">Thumb</option>
                <option value="little">Little Finger</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleCapture}
            disabled={isCapturing || !isInitialized || !coinCalibration}
            className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed shadow-lg text-sm transition-all flex items-center justify-center gap-2"
          >
            <span>{isCapturing ? 'Processing...' : '📷 Capture Finger Measurement'}</span>
          </button>

          <div className="flex gap-2 text-xs">
            <button
              onClick={() => { setStep('coin-setup'); setCoinCalibration(null); setCoinClicks([]); }}
              className="flex-1 py-2 bg-gray-900 text-gray-400 rounded-lg hover:bg-gray-800 hover:text-white transition-all text-center"
            >
              Re-calibrate Coin
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 py-2 bg-gray-900 text-gray-400 rounded-lg hover:bg-gray-800 hover:text-white transition-all text-center"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
