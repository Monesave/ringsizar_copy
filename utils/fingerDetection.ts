import type { FingerMeasurement } from '@/types/measurement';
import type { FingerWidthMeasurement } from '@/lib/mediapipe/handTracker';

/**
 * Convert finger width measurement to ring measurement.
 * widthMm is already computed in HandTracker using finger_px × mmPerPixel,
 * so we use it directly as the ring diameter.
 */
export function convertFingerWidthToRingSize(
  fingerWidth: FingerWidthMeasurement,
  _mmPerPixel: number  // kept for API compatibility, no longer used here
): FingerMeasurement {
  const diameterMm = fingerWidth.widthMm; // already in mm from HandTracker
  const circumferenceMm = Math.PI * diameterMm;

  return {
    diameterMm,
    circumferenceMm,
    confidence: fingerWidth.confidence,
  };
}

/**
 * Validate measurement quality.
 * Valid ring finger diameters: 12–35 mm (covers child to large adult sizes).
 */
export function validateMeasurement(measurement: FingerMeasurement): boolean {
  const isValidSize = measurement.diameterMm >= 12 && measurement.diameterMm <= 35;
  const hasGoodConfidence = measurement.confidence > 0.5; // relaxed: MediaPipe can score 0.6–0.8
  return isValidSize && hasGoodConfidence;
}
