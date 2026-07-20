// Ring size conversion table
// Based on inner diameter in mm

export interface RingSizeEntry {
  diameterMm: number;
  circumferenceMm: number;
  us: number;
  eu: number;
  uk_au_nz: number | string;
  jp_cn: number;
}

export const RING_SIZES: RingSizeEntry[] = [
  { diameterMm: 14.9, circumferenceMm: 46.8, us: 3, eu: 44, uk_au_nz: 'F', jp_cn: 4 },
  { diameterMm: 15.3, circumferenceMm: 48.0, us: 3.5, eu: 45.5, uk_au_nz: 'F½', jp_cn: 5 },
  { diameterMm: 15.7, circumferenceMm: 49.3, us: 4, eu: 47, uk_au_nz: 'G', jp_cn: 6 },
  { diameterMm: 16.1, circumferenceMm: 50.6, us: 4.5, eu: 48.5, uk_au_nz: 'G½', jp_cn: 7 },
  { diameterMm: 16.5, circumferenceMm: 51.9, us: 5, eu: 50, uk_au_nz: 'H', jp_cn: 8 },
  { diameterMm: 16.9, circumferenceMm: 53.1, us: 5.5, eu: 51.5, uk_au_nz: 'H½', jp_cn: 9 },
  { diameterMm: 17.3, circumferenceMm: 54.4, us: 6, eu: 53, uk_au_nz: 'I', jp_cn: 10 },
  { diameterMm: 17.7, circumferenceMm: 55.7, us: 6.5, eu: 54.5, uk_au_nz: 'I½', jp_cn: 11 },
  { diameterMm: 18.1, circumferenceMm: 56.9, us: 7, eu: 56, uk_au_nz: 'J', jp_cn: 12 },
  { diameterMm: 18.5, circumferenceMm: 58.2, us: 7.5, eu: 57.5, uk_au_nz: 'J½', jp_cn: 13 },
  { diameterMm: 18.9, circumferenceMm: 59.5, us: 8, eu: 59, uk_au_nz: 'K', jp_cn: 14 },
  { diameterMm: 19.3, circumferenceMm: 60.7, us: 8.5, eu: 60.5, uk_au_nz: 'K½', jp_cn: 15 },
  { diameterMm: 19.7, circumferenceMm: 62.0, us: 9, eu: 62, uk_au_nz: 'L', jp_cn: 16 },
  { diameterMm: 20.1, circumferenceMm: 63.2, us: 9.5, eu: 63.5, uk_au_nz: 'L½', jp_cn: 17 },
  { diameterMm: 20.6, circumferenceMm: 64.7, us: 10, eu: 65, uk_au_nz: 'M', jp_cn: 18 },
  { diameterMm: 21.0, circumferenceMm: 66.0, us: 10.5, eu: 66.5, uk_au_nz: 'M½', jp_cn: 19 },
  { diameterMm: 21.4, circumferenceMm: 67.2, us: 11, eu: 68, uk_au_nz: 'N', jp_cn: 20 },
  { diameterMm: 21.8, circumferenceMm: 68.5, us: 11.5, eu: 69.5, uk_au_nz: 'N½', jp_cn: 21 },
  { diameterMm: 22.2, circumferenceMm: 69.7, us: 12, eu: 71, uk_au_nz: 'O', jp_cn: 22 },
  { diameterMm: 22.6, circumferenceMm: 71.0, us: 12.5, eu: 72.5, uk_au_nz: 'O½', jp_cn: 23 },
  { diameterMm: 23.0, circumferenceMm: 72.3, us: 13, eu: 74, uk_au_nz: 'P', jp_cn: 24 },
];

/**
 * Find the closest ring size based on diameter in mm
 */
export function findClosestRingSize(diameterMm: number): RingSizeEntry {
  let closest = RING_SIZES[0];
  let minDiff = Math.abs(diameterMm - closest.diameterMm);
  
  for (const size of RING_SIZES) {
    const diff = Math.abs(diameterMm - size.diameterMm);
    if (diff < minDiff) {
      minDiff = diff;
      closest = size;
    }
  }
  
  return closest;
}

/**
 * Convert diameter (mm) to circumference (mm)
 */
export function diameterToCircumference(diameterMm: number): number {
  return Math.PI * diameterMm;
}

/**
 * Convert circumference (mm) to diameter (mm)
 */
export function circumferenceToDiameter(circumferenceMm: number): number {
  return circumferenceMm / Math.PI;
}
