'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { RING_SIZES, findClosestRingSize } from '@/constants/ringSizes';
import type { LocalMeasurement } from '@/types/measurement';
import { saveMeasurement } from '@/lib/supabase/measurements';
import { getCurrentUser } from '@/lib/supabase/auth';

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [measurement, setMeasurement] = useState<LocalMeasurement | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    const dataParam = searchParams.get('data');
    if (!dataParam) return;
    try {
      const data = JSON.parse(decodeURIComponent(dataParam));
      const m: LocalMeasurement = { ...data, id: Date.now().toString(), createdAt: new Date() };
      setMeasurement(m);

      // Auto-save if signed in
      getCurrentUser().then((user) => {
        if (!user) return;
        setSaveStatus('saving');
        saveMeasurement(m)
          .then(({ error }) => setSaveStatus(error ? 'error' : 'saved'))
          .catch(() => setSaveStatus('error'));
      });
    } catch (error) {
      console.error('Failed to parse measurement data:', error);
    }
  }, [searchParams]);

  if (!measurement) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading measurement results...</div>
      </div>
    );
  }

  const closestSize = findClosestRingSize(measurement.innerDiameterMm);

  const fingerLabels: Record<string, string> = {
    thumb: 'Thumb',
    index: 'Index Finger',
    middle: 'Middle Finger',
    ring: 'Ring Finger',
    little: 'Little Finger',
  };
  const handLabel = measurement.hand
    ? measurement.hand.charAt(0).toUpperCase() + measurement.hand.slice(1) + ' Hand'
    : null;
  const fingerLabel = measurement.finger ? fingerLabels[measurement.finger] : null;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Measurement Results</h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          {(handLabel || fingerLabel) && (
            <div className="flex gap-6 mb-4 pb-4 border-b">
              {handLabel && (
                <div className="flex items-center gap-2">
                  <span className="text-2xl">✋</span>
                  <div>
                    <p className="text-xs text-gray-500">Hand</p>
                    <p className="font-semibold">{handLabel}</p>
                  </div>
                </div>
              )}
              {fingerLabel && (
                <div className="flex items-center gap-2">
                  <span className="text-2xl">💍</span>
                  <div>
                    <p className="text-xs text-gray-500">Finger</p>
                    <p className="font-semibold">{fingerLabel}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-600">Diameter</p>
              <p className="text-2xl font-bold">{measurement.innerDiameterMm.toFixed(2)} mm</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Circumference</p>
              <p className="text-2xl font-bold">{measurement.innerCircumferenceMm.toFixed(2)} mm</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-4">Ring Sizes</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">US</p>
                <p className="text-xl font-bold">{measurement.sizeUS}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">EU</p>
                <p className="text-xl font-bold">{measurement.sizeEU}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">UK/AU/NZ</p>
                <p className="text-xl font-bold">{measurement.sizeUK_AU_NZ}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">JP/CN</p>
                <p className="text-xl font-bold">{measurement.sizeJP_CN}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Size Conversion Table</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">US</th>
                  <th className="text-left p-2">EU</th>
                  <th className="text-left p-2">UK/AU/NZ</th>
                  <th className="text-left p-2">JP/CN</th>
                  <th className="text-left p-2">Diameter (mm)</th>
                </tr>
              </thead>
              <tbody>
                {RING_SIZES.map((size, index) => {
                  const isClosest = size.diameterMm === closestSize.diameterMm;
                  return (
                    <tr
                      key={index}
                      className={`border-b ${isClosest ? 'bg-blue-50 font-semibold' : ''}`}
                    >
                      <td className="p-2">{size.us}</td>
                      <td className="p-2">{size.eu}</td>
                      <td className="p-2">{size.uk_au_nz}</td>
                      <td className="p-2">{size.jp_cn}</td>
                      <td className="p-2">{size.diameterMm.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            <strong>Disclaimer:</strong> This measurement is an estimate. Finger size can vary based on
            temperature, swelling, and time of day. For best results, measure at room temperature when
            your hands are at normal size. If in doubt, consult a jeweler for professional sizing.
          </p>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => router.push('/measure/ar')}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Measure Again
          </button>
          <button
            onClick={() => router.push('/')}
            className="flex-1 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-xl">Loading measurement results...</div>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
