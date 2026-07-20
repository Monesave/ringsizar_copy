'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCamera } from '@/hooks/useCamera';
import { HandTracker, type HandDetection } from '@/lib/mediapipe/handTracker';
import { AROverlay } from '@/components/ar/AROverlay';
import { drawScanLine, drawCoinGuide, validateCoinPixels, type MeasurementError } from '@/utils/fingerMeasurement';
import { convertFingerWidthToRingSize, validateMeasurement } from '@/utils/fingerDetection';
import { convertDiameterToSizes } from '@/utils/ringSize/converter';
import { COIN_OPTIONS, type CoinCalibration, type LocalMeasurement } from '@/types/measurement';
import type { Finger, Hand } from '@/types/measurement';
import { saveMeasurement } from '@/lib/supabase/measurements';
import { getCurrentUser } from '@/lib/supabase/auth';

type AppStep = 'coin-setup' | 'coin-click' | 'measure' | 'result';

/**
 * Explicit interaction mode — the single source of truth for whether
 * canvas pointer events are active. Coin calibration = clicks allowed.
 * Measurement = fully automatic, zero clicks accepted.
 */
type InteractionMode = 'coin_calibration' | 'measurement';

function stepToMode(step: AppStep): InteractionMode {
  return step === 'coin-click' ? 'coin_calibration' : 'measurement';
}

export default function ARMeasurementPage() {
  const router = useRouter();
  const { videoRef, isActive, hasPermission, error: cameraError, startCamera, requestPermission } = useCamera();

  // Stable ref so the useEffect cleanup always disposes the latest instance
  const handTrackerRef = useRef<HandTracker | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Hidden canvas used to capture a single video frame for pixel analysis
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

  // Result state — passed via React state, not URL
  const [result, setResult] = useState<LocalMeasurement | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [draggingCoinIdx, setDraggingCoinIdx] = useState<number | null>(null);

  // Derived — never set manually, always computed from step
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
      // Always disposes the correct instance via ref
      handTrackerRef.current?.dispose();
      handTrackerRef.current = null;
    };
  }, []);

  // ── Start camera once coin calibration is done ────────────────────────────
  useEffect(() => {
    if (step !== 'measure' && step !== 'coin-click') return;
    if (useUpload) return;
    if (hasPermission === null) {
      requestPermission();
    } else if (hasPermission) {
      startCamera();
    }
  }, [step, useUpload, hasPermission, requestPermission, startCamera]);

  // ── Ensure hidden frame canvas exists ────────────────────────────────────
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

  // ── Coin canvas coordinate helper ─────────────────────────────────────────
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

    // Validate coin pixel span before accepting
    const coinErr = validateCoinPixels(coinPixels);
    if (coinErr) {
      setCaptureError(coinErr.message);
      return;
    }

    const pixelsPerMm = coinPixels / coinDiameterMm;
    const mmPerPixel  = coinDiameterMm / coinPixels; // finger_mm = finger_px × mmPerPixel
    setCoinCalibration({ coinDiameterMm, coinPixels, pixelsPerMm, mmPerPixel });
    // Pass mmPerPixel to HandTracker so widthMm is computed correctly
    handTrackerRef.current?.setCalibrationFactor(mmPerPixel);
    setCaptureError(null);
  }, [coinOptionIdx, customCoinMm]);

  // ── Handle coin click on canvas ───────────────────────────────────────────
  // ONLY fires during coin_calibration mode. The canvas has pointer-events-none
  // in measurement mode so this handler is never reached, but we guard here too
  // as a second layer of enforcement.
  const handleCoinCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (interactionMode !== 'coin_calibration') return; // hard gate — ignore all non-coin clicks
    const pt = getCanvasCoords(e);
    if (!pt) return;

    // If clicking near an existing point (within 12px), start drag instead
    const hitIdx = coinClicks.findIndex(
      (c) => Math.hypot(c.x - pt.x, c.y - pt.y) < 12
    );
    if (hitIdx !== -1) {
      setDraggingCoinIdx(hitIdx);
      return;
    }

    setCoinClicks((prev) => {
      // If both points placed, replace the older one
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

  // ── Draw coin guide + click markers on overlay canvas ───────────────────────────
  useEffect(() => {
    if (step !== 'coin-click') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    // Size canvas to match video/image dimensions
    const video = videoRef.current;
    if (!useUpload && video && video.videoWidth > 0) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Coin placement guide circle (right-third of frame, vertically centered)
    const guideR  = Math.round(canvas.width * 0.08); // ~8% of width ≈ typical coin radius
    const guideCx = Math.round(canvas.width * 0.75);
    const guideCy = Math.round(canvas.height * 0.5);
    drawCoinGuide(ctx, guideCx, guideCy, guideR, coinCalibration !== null);

    if (coinClicks.length === 0) return;

    // Line between the two points
    if (coinClicks.length === 2) {
      ctx.save();
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(coinClicks[0].x, coinClicks[0].y);
      ctx.lineTo(coinClicks[1].x, coinClicks[1].y);
      ctx.stroke();

      const mx   = (coinClicks[0].x + coinClicks[1].x) / 2;
      const my   = (coinClicks[0].y + coinClicks[1].y) / 2;
      const dist = Math.hypot(coinClicks[1].x - coinClicks[0].x, coinClicks[1].y - coinClicks[0].y);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(mx - 36, my - 20, 72, 18);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${dist.toFixed(1)} px`, mx, my - 6);
      ctx.restore();
    }

    // Point markers
    coinClicks.forEach((pt, i) => {
      ctx.save();
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), pt.x, pt.y + 4);
      ctx.restore();
    });
  }, [coinClicks, step, coinCalibration, useUpload, videoRef]);

  // ── Capture frame from video or uploaded image ────────────────────────────
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
      setCaptureError('Hand tracking not ready yet.');
      return;
    }
    if (!coinCalibration) {
      setCaptureError('Coin calibration required.');
      return;
    }

    setCaptureError(null);
    setIsCapturing(true);

    try {
      const frameCtx = captureFrame();
      if (!frameCtx) {
        setCaptureError('Could not capture image frame.');
        setIsCapturing(false);
        return;
      }

      // Detect hands from the uploaded photo (IMAGE mode) or the live video.
      let detections: HandDetection[];
      if (useUpload && uploadedImage) {
        detections = await tracker.detectImage(uploadedImage);
      } else {
        const source = videoRef.current;
        if (!source) {
          setCaptureError('No video source available.');
          setIsCapturing(false);
          return;
        }
        detections = tracker.detectHands(source);
      }

      if (detections.length === 0) {
        setCaptureError('No hand detected. Make sure your hand is clearly visible.');
        setIsCapturing(false);
        return;
      }

      const detection = detections.find(
        (d) => d.handedness.toLowerCase() === selectedHand
      ) ?? detections[0];

      // measureFingerWidth now uses real pixel data from the captured frame
      const measureResult = tracker.measureFingerWidth(detection, selectedFinger, frameCtx);

      if (!measureResult.ok) {
        setCaptureError(measureResult.error.message);
        setIsCapturing(false);
        return;
      }

      const { measurement } = measureResult;

      // Draw scan line on overlay canvas for visual feedback
      const overlayCtx = canvasRef.current?.getContext('2d');
      if (overlayCtx && canvasRef.current) {
        // For uploads, AROverlay's video-driven loop never sized the canvas —
        // match it to the image so the scan line lands in the right place.
        if (useUpload && uploadedImage) {
          canvasRef.current.width = uploadedImage.naturalWidth;
          canvasRef.current.height = uploadedImage.naturalHeight;
        }
        drawScanLine(overlayCtx, measurement.scanLine, measurement.widthPixels);
      }

      const ringMeasurement = convertFingerWidthToRingSize(measurement, coinCalibration.mmPerPixel);

      if (!validateMeasurement(ringMeasurement)) {
        setCaptureError(
          `Measurement out of valid range (${ringMeasurement.diameterMm.toFixed(1)} mm). ` +
          'Ensure good lighting, plain background, and coin is in the same frame.'
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

      // Auto-save if user is signed in — fire and forget
      getCurrentUser().then((user) => {
        if (user) saveMeasurement(localResult)
          .then(({ error }) => setSaveStatus(error ? 'error' : 'saved'))
          .catch(() => setSaveStatus('error'));
      });
    } catch (e) {
      console.error('Capture error:', e);
      setCaptureError('Unexpected error. Please try again.');
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
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <p className="text-red-600 text-lg mb-4">{initError}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-3 bg-blue-600 text-white rounded-lg">
          Reload
        </button>
      </div>
    );
  }

  // ── Step: result ──────────────────────────────────────────────────────────
  if (step === 'result' && result) {
    const fingerLabels: Record<string, string> = {
      thumb: 'Thumb',
      index: 'Index Finger',
      middle: 'Middle Finger',
      ring: 'Ring Finger',
      little: 'Little Finger',
    };
    const handLabel = result.hand
      ? result.hand.charAt(0).toUpperCase() + result.hand.slice(1) + ' Hand'
      : null;
    const fingerLabel = result.finger ? fingerLabels[result.finger] : null;

    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-2xl font-bold mb-6">Your Ring Size</h1>

          <div className="bg-white rounded-xl shadow p-6 mb-4 space-y-4">
            {(handLabel || fingerLabel) && (
              <div className="flex gap-4 pb-3 border-b">
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
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Diameter</p>
                <p className="text-2xl font-bold text-blue-700">{result.innerDiameterMm.toFixed(2)} mm</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Circumference</p>
                <p className="text-2xl font-bold text-blue-700">{result.innerCircumferenceMm.toFixed(2)} mm</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center pt-2 border-t">
              {[
                { label: 'US', value: result.sizeUS },
                { label: 'EU', value: result.sizeEU },
                { label: 'UK/AU', value: result.sizeUK_AU_NZ },
                { label: 'JP/CN', value: result.sizeJP_CN },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-xl font-bold">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 text-xs text-yellow-800">
            Finger size can vary with temperature and time of day. Measure at room temperature for best accuracy.
          </div>

          {saveStatus === 'saved' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center gap-2 text-sm text-green-700">
              <span>✓</span> Measurement saved to your profile.
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
              Could not save measurement. Please check your connection.
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setStep('coin-setup'); setResult(null); setCoinCalibration(null); }}
              className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Measure Again
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: coin-setup ──────────────────────────────────────────────────────
  if (step === 'coin-setup') {
    const selectedOption = COIN_OPTIONS[coinOptionIdx];
    const isCustom = selectedOption.diameterMm === 0;
    const canProceed = isCustom
      ? parseFloat(customCoinMm) > 0
      : true;

    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-lg mx-auto">
          <button onClick={() => router.push('/')} className="mb-4 text-sm text-gray-500 hover:text-gray-700">
            ← Back
          </button>
          <h1 className="text-2xl font-bold mb-2">Step 1 — Select Reference Coin</h1>
          <p className="text-gray-500 text-sm mb-6">
            Place a coin next to your finger in the frame. We'll use it to calculate real-world scale.
          </p>

          <div className="bg-white rounded-xl shadow p-5 space-y-4 mb-6">
            <label className="block text-sm font-medium text-gray-700">Coin type</label>
            <div className="space-y-2">
              {COIN_OPTIONS.map((opt, i) => (
                <label key={i} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="coin"
                    checked={coinOptionIdx === i}
                    onChange={() => setCoinOptionIdx(i)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>

            {isCustom && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Custom diameter (mm)</label>
                <input
                  type="number"
                  value={customCoinMm}
                  onChange={(e) => setCustomCoinMm(e.target.value)}
                  placeholder="e.g. 21.5"
                  min="5"
                  max="50"
                  step="0.1"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Or upload an image</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {uploadedImage && (
                <p className="text-xs text-green-600 mt-1">✓ Image loaded ({uploadedImage.naturalWidth}×{uploadedImage.naturalHeight})</p>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-xs text-blue-800 space-y-1">
            <p className="font-semibold">Instructions:</p>
            <p>1. Place the coin flat next to your ring finger (top-down view)</p>
            <p>2. Keep your hand still and well-lit</p>
            <p>3. On the next screen, click the left and right edges of the coin</p>
          </div>

          <button
            disabled={!canProceed}
            onClick={() => setStep('coin-click')}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
          >
            Next — Mark Coin Edges
          </button>
        </div>
      </div>
    );
  }

  // ── Step: coin-click ──────────────────────────────────────────────────────
  if (step === 'coin-click') {
    return (
      <div className="flex flex-col min-h-screen bg-black">
        <div className="relative flex-1">
          {useUpload && uploadedImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={uploadedImage.src}
              alt="uploaded"
              className="w-full h-full object-contain"
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          )}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            onClick={handleCoinCanvasClick}
            onMouseMove={handleCoinCanvasMouseMove}
            onMouseUp={handleCoinCanvasMouseUp}
            onMouseLeave={handleCoinCanvasMouseUp}
          />
          <div className="absolute top-3 left-0 right-0 flex justify-center">
            <div className="bg-black/70 text-white text-sm px-4 py-2 rounded-full">
              {coinClicks.length === 0
                ? 'Click the LEFT edge of the coin'
                : 'Click the RIGHT edge of the coin'}
            </div>
          </div>
        </div>
        <div className="bg-white p-3 flex gap-3">
          <button
            onClick={() => { setCoinClicks([]); setStep('coin-setup'); }}
            className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm"
          >
            Back
          </button>
          {coinClicks.length > 0 && (
            <button
              onClick={() => setCoinClicks([])}
              className="flex-1 py-2 bg-yellow-100 text-yellow-800 rounded-lg text-sm"
            >
              Reset clicks
            </button>
          )}
          {coinCalibration && (
            <button
              onClick={() => setStep('measure')}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold"
            >
              ✓ Confirm ({coinCalibration.mmPerPixel.toFixed(4)} mm/px)
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Step: measure ─────────────────────────────────────────────────────────
  if (hasPermission === false && !useUpload) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <h2 className="text-xl font-bold mb-3">Camera Permission Required</h2>
        {cameraError && <p className="text-red-600 mb-3 text-sm">{cameraError}</p>}
        <button onClick={requestPermission} className="px-6 py-3 bg-blue-600 text-white rounded-lg">
          Grant Permission
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="relative flex-1 bg-black">
        {useUpload && uploadedImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={uploadedImage.src} alt="uploaded" className="w-full h-full object-contain" />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
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
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-3" />
              <p>Measuring...</p>
            </div>
          </div>
        )}

        {/* Mode badge — always visible so user knows clicks do nothing here */}
        <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
          <div className="bg-black/60 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            Automatic detection — no clicking required
          </div>
        </div>

        {coinCalibration && (
          <div className="absolute top-10 right-3 bg-black/60 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
            🪙 {coinCalibration.coinDiameterMm} mm → {coinCalibration.mmPerPixel.toFixed(4)} mm/px
          </div>
        )}
      </div>

      <div className="bg-white p-4 shadow-lg space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hand</label>
            <select
              value={selectedHand}
              onChange={(e) => setSelectedHand(e.target.value as Hand)}
              className="w-full p-2 border rounded-lg text-sm"
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Finger</label>
            <select
              value={selectedFinger}
              onChange={(e) => setSelectedFinger(e.target.value as Finger)}
              className="w-full p-2 border rounded-lg text-sm"
            >
              <option value="thumb">Thumb</option>
              <option value="index">Index</option>
              <option value="middle">Middle</option>
              <option value="ring">Ring</option>
              <option value="little">Little</option>
            </select>
          </div>
        </div>

        {captureError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            {captureError}
          </div>
        )}

        <button
          onClick={handleCapture}
          disabled={isCapturing || !isInitialized || !coinCalibration}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
        >
          {isCapturing ? 'Measuring...' : 'Capture Measurement'}
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => { setStep('coin-setup'); setCoinCalibration(null); }}
            className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200"
          >
            Re-calibrate Coin
          </button>
          <button
            onClick={() => router.push('/')}
            className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200"
          >
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
