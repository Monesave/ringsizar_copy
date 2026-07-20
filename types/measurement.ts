export type MeasurementType = 'finger_ar' | 'existing_ring';
export type Hand = 'left' | 'right';
export type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'little';

export interface Measurement {
  id: string;
  userId: string;
  type: MeasurementType;
  label: string;
  hand?: Hand;
  finger?: Finger;
  innerDiameterMm: number;
  innerCircumferenceMm: number;
  sizeUS: number;
  sizeEU: number;
  sizeUK_AU_NZ: number | string;
  sizeJP_CN: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocalMeasurement {
  id: string;
  type: MeasurementType;
  label: string;
  hand?: Hand;
  finger?: Finger;
  innerDiameterMm: number;
  innerCircumferenceMm: number;
  sizeUS: number;
  sizeEU: number;
  sizeUK_AU_NZ: number | string;
  sizeJP_CN: number;
  createdAt: Date;
}

export interface CalibrationData {
  id: string;
  userId?: string;
  deviceId: string;
  deviceModel?: string;
  screenPpi?: number;
  calibrationFactor: number; // pixels per mm
  referenceSizeMm: number; // e.g., 85.60 for credit card
  createdAt: Date;
  updatedAt: Date;
}

export interface FingerMeasurement {
  diameterMm: number;
  circumferenceMm: number;
  confidence: number;
}

export interface CoinCalibration {
  coinDiameterMm: number;  // real-world diameter of selected coin
  coinPixels: number;      // pixel distance across coin (user-clicked)
  pixelsPerMm: number;     // coinPixels / coinDiameterMm  (kept for legacy callers)
  mmPerPixel: number;      // coinDiameterMm / coinPixels  — USE THIS for finger_mm = finger_px * mmPerPixel
}

/** Pixel span of coin must be within this range to be a valid calibration. */
export const COIN_PIXEL_MIN = 80;
export const COIN_PIXEL_MAX = 600;

export const COIN_OPTIONS = [
  { label: 'Euro €1 (23.25 mm)',  diameterMm: 23.25 },
  { label: 'Euro €2 (25.75 mm)',  diameterMm: 25.75 },
  { label: 'US Quarter (24.26 mm)', diameterMm: 24.26 },
  { label: 'UK 10p (24.5 mm)',    diameterMm: 24.5  },
  { label: 'PKR 2 (21.0 mm)',     diameterMm: 21.0  },
  { label: 'Custom',              diameterMm: 0     },
] as const;

export type CoinOption = typeof COIN_OPTIONS[number];
