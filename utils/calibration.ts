import type { CalibrationData } from '@/types/measurement';

// ISO 7810 ID-1 credit card standard size: 85.60 mm × 53.98 mm
export const CREDIT_CARD_WIDTH_MM = 85.60;
export const CREDIT_CARD_HEIGHT_MM = 53.98;

/**
 * Calculate calibration factor from credit card measurement
 * @param cardWidthPixels - Width of credit card in pixels
 * @returns Calibration factor (pixels per mm)
 */
export function calculateCalibrationFactor(cardWidthPixels: number): number {
  if (cardWidthPixels <= 0) {
    throw new Error('Invalid card width in pixels');
  }
  return cardWidthPixels / CREDIT_CARD_WIDTH_MM;
}

/**
 * Convert pixels to millimeters using calibration factor
 */
export function pixelsToMillimeters(pixels: number, calibrationFactor: number): number {
  return pixels / calibrationFactor;
}

/**
 * Convert millimeters to pixels using calibration factor
 */
export function millimetersToPixels(mm: number, calibrationFactor: number): number {
  return mm * calibrationFactor;
}

/**
 * Store calibration data in localStorage
 */
export function saveCalibration(calibration: CalibrationData): void {
  if (typeof window === 'undefined') return;
  
  const deviceId = getDeviceId();
  const key = `calibration_${deviceId}`;
  localStorage.setItem(key, JSON.stringify({
    ...calibration,
    createdAt: calibration.createdAt.toISOString(),
    updatedAt: calibration.updatedAt.toISOString(),
  }));
}

/**
 * Load calibration data from localStorage
 */
export function loadCalibration(): CalibrationData | null {
  if (typeof window === 'undefined') return null;
  
  const deviceId = getDeviceId();
  const key = `calibration_${deviceId}`;
  const stored = localStorage.getItem(key);
  
  if (!stored) return null;
  
  try {
    const data = JSON.parse(stored);
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
  } catch (error) {
    console.error('Failed to parse calibration data:', error);
    return null;
  }
}

/**
 * Get or create a device ID
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'unknown';
  
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
}

/**
 * Validate calibration data
 */
export function validateCalibration(calibration: CalibrationData): boolean {
  // Calibration factor should be reasonable (typically 5-20 pixels/mm for phone cameras)
  if (calibration.calibrationFactor < 1 || calibration.calibrationFactor > 100) {
    return false;
  }
  
  if (calibration.referenceSizeMm <= 0) {
    return false;
  }
  
  return true;
}
