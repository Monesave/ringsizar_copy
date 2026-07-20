import { HandLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
import { buildScanLine, getFingerWidthFromCanvas, type ScanLine, type MeasurementError } from '@/utils/fingerMeasurement';

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm';
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandDetection {
  landmarks: HandLandmark[];
  handedness: 'Left' | 'Right';
  score: number;
}

export interface FingerWidthMeasurement {
  finger: 'thumb' | 'index' | 'middle' | 'ring' | 'little';
  widthPixels: number;
  widthMm: number;
  confidence: number;
  scanLine: ScanLine;
}

export type MeasureResult =
  | { ok: true; measurement: FingerWidthMeasurement }
  | { ok: false; error: MeasurementError };

// MediaPipe Hand Landmark indices
const FINGER_LANDMARKS = {
  thumb: [2, 3, 4], // Thumb IP, MCP, TIP
  index: [5, 6, 7, 8], // Index MCP, PIP, DIP, TIP
  middle: [9, 10, 11, 12], // Middle MCP, PIP, DIP, TIP
  ring: [13, 14, 15, 16], // Ring MCP, PIP, DIP, TIP
  little: [17, 18, 19, 20], // Little MCP, PIP, DIP, TIP
};

// Proximal phalanx region (where ring sits) - between MCP and PIP
const PROXIMAL_PHALANX_INDICES = {
  thumb: [2, 3], // Thumb IP to MCP
  index: [5, 6], // Index MCP to PIP
  middle: [9, 10], // Middle MCP to PIP
  ring: [13, 14], // Ring MCP to PIP
  little: [17, 18], // Little MCP to PIP
};

export class HandTracker {
  private handLandmarker: HandLandmarker | null = null;
  /** Lazily-created IMAGE-mode landmarker for static photo measurement */
  private imageLandmarker: HandLandmarker | null = null;
  private vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
  private isInitialized = false;
  /**
   * mm per pixel — set from coin calibration as coinDiameterMm / coinPixels.
   * finger_mm = finger_pixels * mmPerPixel
   */
  private mmPerPixel: number = 1;

  async initialize() {
    if (this.isInitialized) return;

    try {
      this.vision = await FilesetResolver.forVisionTasks(WASM_PATH);

      this.handLandmarker = await HandLandmarker.createFromOptions(this.vision, {
        baseOptions: {
          modelAssetPath: MODEL_PATH,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize HandTracker:', error);
      throw error;
    }
  }

  /** Set from coin calibration: mmPerPixel = coinDiameterMm / coinPixels */
  setCalibrationFactor(mmPerPixel: number) {
    this.mmPerPixel = mmPerPixel;
  }

  detectHands(video: HTMLVideoElement): HandDetection[] {
    if (!this.handLandmarker || !this.isInitialized) {
      throw new Error('HandTracker not initialized. Call initialize() first.');
    }

    const results = this.handLandmarker.detectForVideo(video, performance.now());

    return results.landmarks.map((landmarks, index) => ({
      landmarks: landmarks.map((lm) => ({
        x: lm.x * video.videoWidth,
        y: lm.y * video.videoHeight,
        z: lm.z,
      })),
      handedness: results.handednesses[index]?.[0]?.categoryName as 'Left' | 'Right',
      score: results.handednesses[index]?.[0]?.score || 0,
    }));
  }

  /**
   * Detect hands in a static image (uploaded photo). Uses a separate IMAGE-mode
   * landmarker — a VIDEO-mode landmarker cannot be used for one-off still frames.
   */
  async detectImage(image: HTMLImageElement): Promise<HandDetection[]> {
    await this.ensureImageLandmarker();
    if (!this.imageLandmarker) {
      throw new Error('Image HandLandmarker not initialized.');
    }

    const results = this.imageLandmarker.detect(image);
    const w = image.naturalWidth;
    const h = image.naturalHeight;

    return results.landmarks.map((landmarks, index) => ({
      landmarks: landmarks.map((lm) => ({ x: lm.x * w, y: lm.y * h, z: lm.z })),
      handedness: results.handednesses[index]?.[0]?.categoryName as 'Left' | 'Right',
      score: results.handednesses[index]?.[0]?.score || 0,
    }));
  }

  private async ensureImageLandmarker() {
    if (this.imageLandmarker) return;
    if (!this.vision) {
      this.vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    }
    this.imageLandmarker = await HandLandmarker.createFromOptions(this.vision, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'IMAGE',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  /**
   * Measure finger width at the proximal phalanx using real pixel edge detection.
   * Requires a canvas context with the current video frame already drawn onto it.
   * MediaPipe landmarks are used ONLY to position the perpendicular scan line.
   */
  measureFingerWidth(
    detection: HandDetection,
    finger: 'thumb' | 'index' | 'middle' | 'ring' | 'little',
    ctx: CanvasRenderingContext2D
  ): MeasureResult {
    const indices = PROXIMAL_PHALANX_INDICES[finger];
    if (!indices || indices.length < 2)
      return { ok: false, error: { code: 'NO_EDGES', message: 'Invalid finger indices.' } };

    const point1 = detection.landmarks[indices[0]];
    const point2 = detection.landmarks[indices[1]];
    if (!point1 || !point2)
      return { ok: false, error: { code: 'NO_EDGES', message: 'Finger landmarks not found.' } };

    const scanLine = buildScanLine(point1, point2);
    if (!scanLine)
      return { ok: false, error: { code: 'NO_EDGES', message: 'Could not build scan line — landmarks too close.' } };

    const result = getFingerWidthFromCanvas(
      ctx,
      scanLine.startX,
      scanLine.startY,
      scanLine.endX,
      scanLine.endY,
      scanLine
    );

    if (!result.ok) return result;

    return {
      ok: true,
      measurement: {
        finger,
        widthPixels: result.widthPixels,
        // finger_mm = finger_pixels × mm_per_pixel  (the correct formula)
        widthMm: result.widthPixels * this.mmPerPixel,
        confidence: detection.score,
        scanLine,
      },
    };
  }

  /**
   * Draw hand landmarks on canvas
   */
  drawLandmarks(
    ctx: CanvasRenderingContext2D,
    detection: HandDetection,
    showConnections: boolean = true
  ) {
    const drawingUtils = new DrawingUtils(ctx);

    // Draw landmarks
    detection.landmarks.forEach((landmark, index) => {
      ctx.beginPath();
      ctx.arc(landmark.x, landmark.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = '#00FF00';
      ctx.fill();
    });

    // Draw connections (simplified - MediaPipe has built-in connections)
    if (showConnections) {
      // Draw finger connections
      Object.values(FINGER_LANDMARKS).forEach((indices) => {
        for (let i = 0; i < indices.length - 1; i++) {
          const p1 = detection.landmarks[indices[i]];
          const p2 = detection.landmarks[indices[i + 1]];
          if (p1 && p2) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      });
    }
  }

  dispose() {
    this.handLandmarker?.close?.();
    this.imageLandmarker?.close?.();
    this.handLandmarker = null;
    this.imageLandmarker = null;
    this.vision = null;
    this.isInitialized = false;
  }
}
