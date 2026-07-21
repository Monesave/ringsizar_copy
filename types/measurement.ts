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
  { label: 'US Quarter (24.26 mm)', diameterMm: 24.26, icon: '🪙' },
  { label: 'US Nickel (21.21 mm)',  diameterMm: 21.21, icon: '🪙' },
  { label: 'US Dime (17.91 mm)',    diameterMm: 17.91, icon: '🪙' },
  { label: 'US Penny (19.05 mm)',   diameterMm: 19.05, icon: '🪙' },
  { label: 'Euro €1 (23.25 mm)',    diameterMm: 23.25, icon: '💶' },
  { label: 'Euro €2 (25.75 mm)',    diameterMm: 25.75, icon: '💶' },
  { label: 'UK £1 (22.50 mm)',      diameterMm: 22.50, icon: '💷' },
  { label: 'UK £2 (28.40 mm)',      diameterMm: 28.40, icon: '💷' },
  { label: 'UK 10p (24.50 mm)',     diameterMm: 24.50, icon: '💷' },
  { label: 'INR ₹1 (21.93 mm)',     diameterMm: 21.93, icon: '🪙' },
  { label: 'INR ₹5 (23.00 mm)',     diameterMm: 23.00, icon: '🪙' },
  { label: 'PKR 2 (21.00 mm)',      diameterMm: 21.00, icon: '🪙' },
  { label: 'Custom Diameter (mm)',  diameterMm: 0,     icon: '📏' },
] as const;

export type CoinOption = typeof COIN_OPTIONS[number];
