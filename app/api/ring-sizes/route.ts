import { NextRequest, NextResponse } from 'next/server';
import { RING_SIZES } from '@/constants/ringSizes';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const country = searchParams.get('country') || 'US';

  // Map country codes to size systems
  const sizeSystemMap: Record<string, 'us' | 'eu' | 'uk_au_nz' | 'jp_cn'> = {
    US: 'us',
    CA: 'us',
    EU: 'eu',
    UK: 'uk_au_nz',
    AU: 'uk_au_nz',
    NZ: 'uk_au_nz',
    JP: 'jp_cn',
    CN: 'jp_cn',
  };

  const system = sizeSystemMap[country.toUpperCase()] || 'us';

  // Return ring sizes in the requested format
  const sizes = RING_SIZES.map((size) => ({
    size: size[system],
    diameter: size.diameterMm,
    circumference: size.circumferenceMm,
  }));

  return NextResponse.json({
    unit: 'mm',
    country,
    system,
    sizes,
  });
}
