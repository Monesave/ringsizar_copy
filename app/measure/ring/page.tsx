'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { convertDiameterToSizes, convertCircumferenceToSizes } from '@/utils/ringSize/converter';

type InputMode = 'diameter' | 'circumference';

export default function RingMeasurementPage() {
  const router = useRouter();
  const [inputMode, setInputMode] = useState<InputMode>('diameter');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('My Ring');
  const [error, setError] = useState('');

  const handleConvert = () => {
    setError('');
    const num = parseFloat(value);

    if (isNaN(num) || num <= 0) {
      setError('Please enter a valid positive number.');
      return;
    }

    if (inputMode === 'diameter' && (num < 12 || num > 30)) {
      setError('Diameter must be between 12 mm and 30 mm for a valid ring size.');
      return;
    }

    if (inputMode === 'circumference' && (num < 38 || num > 95)) {
      setError('Circumference must be between 38 mm and 95 mm for a valid ring size.');
      return;
    }

    const sizes =
      inputMode === 'diameter'
        ? convertDiameterToSizes(num)
        : convertCircumferenceToSizes(num);

    const measurementData = {
      type: 'existing_ring' as const,
      label: label.trim() || 'My Ring',
      innerDiameterMm: sizes.diameterMm,
      innerCircumferenceMm: sizes.circumferenceMm,
      sizeUS: sizes.us,
      sizeEU: sizes.eu,
      sizeUK_AU_NZ: sizes.uk_au_nz,
      sizeJP_CN: sizes.jp_cn,
    };

    router.push(`/results?data=${encodeURIComponent(JSON.stringify(measurementData))}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white p-4">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => router.push('/')}
          className="mb-6 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          ← Back to Home
        </button>

        <h1 className="text-3xl font-bold mb-2 text-gray-900">Ring Measurement</h1>
        <p className="text-gray-600 mb-8">
          Measure an existing ring that fits well and enter its inner diameter or circumference below.
        </p>

        {/* How to measure guide */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
          <h2 className="font-semibold text-gray-800 mb-3">How to measure your ring</h2>
          <ol className="space-y-2 text-sm text-gray-600 list-decimal list-inside">
            <li>Find a ring that fits the finger you want to size.</li>
            <li>Place it flat on a ruler or measuring tape.</li>
            <li>
              <strong>Diameter:</strong> Measure straight across the inside of the ring (inner edge to inner edge).
            </li>
            <li>
              <strong>Circumference:</strong> Wrap a thin strip of paper inside the ring, mark where it overlaps, then measure the paper length.
            </li>
            <li>Enter the measurement below in millimetres.</li>
          </ol>
        </div>

        {/* Input card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6 space-y-5">

          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label (optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. My gold band"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Mode toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Measurement type
            </label>
            <div className="flex rounded-lg overflow-hidden border border-gray-300">
              <button
                onClick={() => { setInputMode('diameter'); setValue(''); setError(''); }}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  inputMode === 'diameter'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Inner Diameter
              </button>
              <button
                onClick={() => { setInputMode('circumference'); setValue(''); setError(''); }}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  inputMode === 'circumference'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Inner Circumference
              </button>
            </div>
          </div>

          {/* Value input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {inputMode === 'diameter' ? 'Diameter (mm)' : 'Circumference (mm)'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={value}
                onChange={(e) => { setValue(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleConvert()}
                placeholder={inputMode === 'diameter' ? 'e.g. 17.3' : 'e.g. 54.4'}
                min="0"
                step="0.1"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <span className="text-sm text-gray-500 whitespace-nowrap">mm</span>
            </div>
            {inputMode === 'diameter' && (
              <p className="text-xs text-gray-400 mt-1">Typical range: 14 – 23 mm</p>
            )}
            {inputMode === 'circumference' && (
              <p className="text-xs text-gray-400 mt-1">Typical range: 44 – 72 mm</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleConvert}
            disabled={!value}
            className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Get Ring Sizes
          </button>
        </div>

        {/* Common sizes reference */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-3 text-sm">Common US sizes for reference</h2>
          <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
            {[
              { us: '5', mm: '15.7' },
              { us: '6', mm: '16.5' },
              { us: '7', mm: '17.3' },
              { us: '8', mm: '18.2' },
              { us: '9', mm: '19.0' },
              { us: '10', mm: '19.8' },
            ].map((s) => (
              <button
                key={s.us}
                onClick={() => { setInputMode('diameter'); setValue(s.mm); setError(''); }}
                className="flex justify-between items-center px-3 py-2 bg-gray-50 hover:bg-green-50 border border-gray-200 rounded-lg transition-colors"
              >
                <span className="font-medium">US {s.us}</span>
                <span className="text-gray-400">{s.mm} mm</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Tap a size to pre-fill the diameter.</p>
        </div>
      </div>
    </div>
  );
}
