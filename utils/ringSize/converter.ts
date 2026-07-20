import { RING_SIZES, findClosestRingSize, diameterToCircumference, circumferenceToDiameter } from '@/constants/ringSizes';
import type { RingSizeEntry } from '@/constants/ringSizes';

/**
 * Convert diameter in mm to all ring sizes
 */
export function convertDiameterToSizes(diameterMm: number): RingSizeEntry {
  const closest = findClosestRingSize(diameterMm);
  const circumference = diameterToCircumference(diameterMm);
  
  return {
    diameterMm,
    circumferenceMm: circumference,
    us: closest.us,
    eu: closest.eu,
    uk_au_nz: closest.uk_au_nz,
    jp_cn: closest.jp_cn,
  };
}

/**
 * Convert circumference in mm to all ring sizes
 */
export function convertCircumferenceToSizes(circumferenceMm: number): RingSizeEntry {
  const diameterMm = circumferenceToDiameter(circumferenceMm);
  return convertDiameterToSizes(diameterMm);
}

/**
 * Format ring size for display
 */
export function formatRingSize(size: number | string, system: 'us' | 'eu' | 'uk_au_nz' | 'jp_cn'): string {
  if (system === 'us' || system === 'eu' || system === 'jp_cn') {
    return size.toString();
  }
  // UK/AU/NZ uses letters
  return size.toString();
}

/**
 * Get all available sizes for a system
 */
export function getSizesForSystem(system: 'us' | 'eu' | 'uk_au_nz' | 'jp_cn'): (number | string)[] {
  return RING_SIZES.map(size => size[system]);
}
