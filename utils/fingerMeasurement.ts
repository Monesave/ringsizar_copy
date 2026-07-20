/**
 * Real pixel-based finger width detection using Canvas getImageData.
 * MediaPipe landmarks are used ONLY to locate the scan line position.
 * Actual width is determined by scanning grayscale intensity for skin/background edges.
 */

const INTENSITY_THRESHOLD = 20;   // grayscale difference to detect an edge
const SCAN_LINE_HALF_LENGTH = 120; // pixels to scan each side from center (wider for large hands)
const PARALLEL_OFFSETS = [-5, 0, 5]; // px offsets for the 3 parallel scan lines
const MIN_WIDTH_PX = 10;
const MAX_WIDTH_PX = 300;
const BLUR_VARIANCE_THRESHOLD = 80; // below this → image is too blurry

export interface ScanLine {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  centerX: number;
  centerY: number;
  /** Unit perpendicular vector (finger-axis direction) */
  perpX: number;
  perpY: number;
}

export interface MeasurementError {
  code: 'BLURRY' | 'NO_EDGES' | 'OUT_OF_RANGE' | 'NO_IMAGE_DATA' | 'INVALID_COIN';
  message: string;
}

export type WidthResult =
  | { ok: true; widthPixels: number }
  | { ok: false; error: MeasurementError };

// ─── Grayscale ────────────────────────────────────────────────────────────────

function toGray(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ─── Pixel sampling ───────────────────────────────────────────────────────────

function sampleGray(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const px = Math.max(0, Math.min(Math.round(x), width - 1));
  const py = Math.max(0, Math.min(Math.round(y), height - 1));
  const i = (py * width + px) * 4;
  return toGray(data[i], data[i + 1], data[i + 2]);
}

/**
 * Smoothed intensity: average of the pixel and its immediate neighbor on the line.
 * Reduces noise from single-pixel outliers.
 */
function smoothedGray(
  grays: number[],
  idx: number
): number {
  const a = grays[Math.max(0, idx - 1)];
  const b = grays[idx];
  const c = grays[Math.min(grays.length - 1, idx + 1)];
  return (a + b + c) / 3;
}

// ─── Blur detection ───────────────────────────────────────────────────────────

/**
 * Estimate image sharpness by computing variance of grayscale intensities
 * along the scan line. Low variance = blurry / uniform image.
 */
function computeLineVariance(grays: number[]): number {
  if (grays.length === 0) return 0;
  const mean = grays.reduce((s, v) => s + v, 0) / grays.length;
  const variance = grays.reduce((s, v) => s + (v - mean) ** 2, 0) / grays.length;
  return variance;
}

// ─── Scan line builder ────────────────────────────────────────────────────────

/**
 * Build the primary perpendicular scan line across the finger at the proximal phalanx.
 * point1 = MCP landmark (pixel coords), point2 = PIP landmark (pixel coords)
 */
export function buildScanLine(
  point1: { x: number; y: number },
  point2: { x: number; y: number }
): ScanLine | null {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return null;

  const perpX = -dy / length;
  const perpY = dx / length;

  const centerX = (point1.x + point2.x) / 2;
  const centerY = (point1.y + point2.y) / 2;

  return {
    startX: centerX - perpX * SCAN_LINE_HALF_LENGTH,
    startY: centerY - perpY * SCAN_LINE_HALF_LENGTH,
    endX:   centerX + perpX * SCAN_LINE_HALF_LENGTH,
    endY:   centerY + perpY * SCAN_LINE_HALF_LENGTH,
    centerX,
    centerY,
    perpX,
    perpY,
  };
}

// ─── Single-line edge scan ────────────────────────────────────────────────────

/**
 * Scan one line and return the pixel width between detected edges, or null.
 * Uses smoothed grayscale intensity comparison.
 */
function scanSingleLine(
  data: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): number | null {
  const totalDx = endX - startX;
  const totalDy = endY - startY;
  const totalLen = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
  if (totalLen === 0) return null;

  const steps = Math.ceil(totalLen);

  // Sample all grayscale values along the line
  const grays: number[] = [];
  const coords: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = startX + totalDx * t;
    const y = startY + totalDy * t;
    grays.push(sampleGray(data, imgWidth, imgHeight, x, y));
    coords.push([x, y]);
  }

  // Center index = midpoint of the line (assumed to be over the finger)
  const centerIdx = Math.floor(steps / 2);

  // Walk left from center → find left edge
  let leftIdx = 0;
  for (let i = centerIdx - 1; i >= 1; i--) {
    const diff = Math.abs(smoothedGray(grays, i) - smoothedGray(grays, i - 1));
    if (diff > INTENSITY_THRESHOLD) {
      leftIdx = i;
      break;
    }
  }

  // Walk right from center → find right edge
  let rightIdx = steps;
  for (let i = centerIdx + 1; i < steps; i++) {
    const diff = Math.abs(smoothedGray(grays, i) - smoothedGray(grays, i + 1));
    if (diff > INTENSITY_THRESHOLD) {
      rightIdx = i;
      break;
    }
  }

  // Both edges must have moved from their defaults
  if (leftIdx === 0 && rightIdx === steps) return null;

  const [lx, ly] = coords[leftIdx];
  const [rx, ry] = coords[rightIdx];
  return Math.hypot(rx - lx, ry - ly);
}

// ─── Median helper ────────────────────────────────────────────────────────────

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Core measurement function.
 *
 * 1. Reads ImageData once from the canvas.
 * 2. Runs a blur check on the center scan line.
 * 3. Scans 3 parallel lines (center ±5 px along the finger axis).
 * 4. Returns the median of valid widths.
 * 5. Validates the result is within [MIN_WIDTH_PX, MAX_WIDTH_PX].
 */
export function getFingerWidthFromCanvas(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  scanLine: ScanLine
): WidthResult {
  const { width, height } = ctx.canvas;

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch {
    return { ok: false, error: { code: 'NO_IMAGE_DATA', message: 'Cannot read canvas pixels. Check CORS or canvas state.' } };
  }

  const { data } = imageData;

  // ── Blur check on the center line ──────────────────────────────────────
  const totalDx = endX - startX;
  const totalDy = endY - startY;
  const totalLen = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
  const steps = Math.ceil(totalLen);
  const centerGrays: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    centerGrays.push(sampleGray(data, width, height, startX + totalDx * t, startY + totalDy * t));
  }

  const variance = computeLineVariance(centerGrays);
  if (variance < BLUR_VARIANCE_THRESHOLD) {
    return {
      ok: false,
      error: {
        code: 'BLURRY',
        message: `Image appears blurry or too uniform (variance: ${variance.toFixed(1)}). Improve lighting or move closer.`,
      },
    };
  }

  // ── Multi-line scan ────────────────────────────────────────────────────
  // Finger axis unit vector (along MCP→PIP direction, perpendicular to scan line)
  const axisX = scanLine.perpY;   // perpY of scan line = finger axis X
  const axisY = -scanLine.perpX;  // perpX of scan line = finger axis Y (negated)

  const validWidths: number[] = [];

  for (const offset of PARALLEL_OFFSETS) {
    const ox = axisX * offset;
    const oy = axisY * offset;
    const w = scanSingleLine(
      data, width, height,
      startX + ox, startY + oy,
      endX   + ox, endY   + oy
    );
    if (w !== null) validWidths.push(w);
  }

  if (validWidths.length === 0) {
    return {
      ok: false,
      error: {
        code: 'NO_EDGES',
        message: 'Could not detect finger edges. Ensure good lighting and a plain background.',
      },
    };
  }

  const widthPixels = median(validWidths);

  // ── Range validation ───────────────────────────────────────────────────
  if (widthPixels < MIN_WIDTH_PX || widthPixels > MAX_WIDTH_PX) {
    return {
      ok: false,
      error: {
        code: 'OUT_OF_RANGE',
        message: `Detected width (${widthPixels.toFixed(1)} px) is outside valid range [${MIN_WIDTH_PX}–${MAX_WIDTH_PX} px]. Adjust camera distance.`,
      },
    };
  }

  return { ok: true, widthPixels };
}

// ─── Coin calibration validation ─────────────────────────────────────────────

import { COIN_PIXEL_MIN, COIN_PIXEL_MAX } from '@/types/measurement';

/**
 * Validate that the pixel span of the coin is within the acceptable range.
 * Rejects calibrations that are clearly wrong (coin too small/large in frame).
 */
export function validateCoinPixels(coinPixels: number): MeasurementError | null {
  if (coinPixels < COIN_PIXEL_MIN || coinPixels > COIN_PIXEL_MAX) {
    return {
      code: 'INVALID_COIN',
      message:
        `Coin span (${coinPixels.toFixed(1)} px) is outside valid range ` +
        `[${COIN_PIXEL_MIN}–${COIN_PIXEL_MAX} px]. ` +
        'Move the camera closer or further until the coin fills more of the frame.',
    };
  }
  return null;
}

// ─── Coin placement guide overlay ─────────────────────────────────────────────

/**
 * Draw a dashed circle guide on the overlay canvas to show where to place the coin.
 * cx, cy = center of guide circle in canvas pixels.
 * radiusPx = expected coin radius in pixels (estimated from a typical distance).
 */
export function drawCoinGuide(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusPx: number,
  isCalibrated: boolean
) {
  ctx.save();

  // Outer dashed circle
  ctx.strokeStyle = isCalibrated ? '#00FF00' : '#FFD700';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
  ctx.stroke();

  // Cross-hair center
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = isCalibrated ? '#00FF00' : '#FFD700';
  const ch = 8;
  ctx.beginPath();
  ctx.moveTo(cx - ch, cy); ctx.lineTo(cx + ch, cy);
  ctx.moveTo(cx, cy - ch); ctx.lineTo(cx, cy + ch);
  ctx.stroke();

  // Label
  ctx.fillStyle = isCalibrated ? '#00FF00' : '#FFD700';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isCalibrated ? '✓ Coin calibrated' : 'Place coin here', cx, cy + radiusPx + 16);

  ctx.restore();
}

/**
 * Draw the scan lines and edge markers on the overlay canvas.
 * Green = edges found, red = failed.
 */
export function drawScanLine(
  ctx: CanvasRenderingContext2D,
  scanLine: ScanLine,
  widthPixels: number | null
) {
  const success = widthPixels !== null;
  const axisX = scanLine.perpY;
  const axisY = -scanLine.perpX;

  ctx.save();

  // Draw 3 parallel lines
  PARALLEL_OFFSETS.forEach((offset, i) => {
    const ox = axisX * offset;
    const oy = axisY * offset;
    ctx.strokeStyle = success ? (i === 1 ? '#00FF00' : '#00CC00') : '#FF4444';
    ctx.lineWidth = i === 1 ? 2 : 1;
    ctx.setLineDash(i === 1 ? [] : [3, 3]);
    ctx.beginPath();
    ctx.moveTo(scanLine.startX + ox, scanLine.startY + oy);
    ctx.lineTo(scanLine.endX   + ox, scanLine.endY   + oy);
    ctx.stroke();
  });

  ctx.setLineDash([]);

  // Center dot
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(scanLine.centerX, scanLine.centerY, 5, 0, Math.PI * 2);
  ctx.fill();

  // Width label
  if (widthPixels !== null) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(scanLine.centerX - 30, scanLine.centerY - 28, 60, 18);
    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${widthPixels.toFixed(1)} px`, scanLine.centerX, scanLine.centerY - 14);
  }

  ctx.restore();
}
