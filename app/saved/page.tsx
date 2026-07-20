'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMeasurements, deleteMeasurement } from '@/lib/supabase/measurements';
import { getCurrentUser } from '@/lib/supabase/auth';

import { createClient } from '@/utils/supabase/client';

interface DBMeasurement {
  id: string;
  type: string;
  label: string;
  hand: string | null;
  finger: string | null;
  inner_diameter_mm: number;
  inner_circumference_mm: number;
  size_us: number;
  size_eu: number;
  size_uk_au_nz: number | string;
  size_jp_cn: number;
  created_at: string;
}

const FINGER_LABELS: Record<string, string> = {
  thumb: 'Thumb',
  index: 'Index Finger',
  middle: 'Middle Finger',
  ring: 'Ring Finger',
  little: 'Little Finger',
};

export default function SavedMeasurementsPage() {
  const router = useRouter();
  const [measurements, setMeasurements] = useState<DBMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    getCurrentUser().then((user) => {
      if (!user) { router.push('/'); return; }

      const load = () => {
        getMeasurements().then(({ data, error }) => {
          if (error) setError('Failed to load measurements.');
          else setMeasurements((data as DBMeasurement[]) ?? []);
          setLoading(false);
        });
      };

      load();

      // Subscribe to real-time changes on user's measurements table
      channel = supabase
        .channel('realtime:measurements')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'measurements',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            load();
          }
        )
        .subscribe();
    });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [router]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await deleteMeasurement(id);
    if (!error) setMeasurements((prev) => prev.filter((m) => m.id !== id));
    else setError('Failed to delete measurement.');
    setDeletingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Measurements</h1>
            <p className="text-sm text-gray-500 mt-0.5">{measurements.length} saved record{measurements.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Home
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">{error}</div>
        )}

        {measurements.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-10 text-center">
            <p className="text-4xl mb-3">💍</p>
            <p className="text-gray-600 font-medium mb-1">No measurements yet</p>
            <p className="text-sm text-gray-400 mb-6">Complete a measurement to see it saved here.</p>
            <button
              onClick={() => router.push('/measure/ar')}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
            >
              Measure Now
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {measurements.map((m) => {
              const handLabel = m.hand
                ? m.hand.charAt(0).toUpperCase() + m.hand.slice(1) + ' Hand'
                : null;
              const fingerLabel = m.finger ? FINGER_LABELS[m.finger] : null;
              const date = new Date(m.created_at).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
              });

              return (
                <div key={m.id} className="bg-white rounded-xl shadow p-5">
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{m.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{date}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      m.type === 'finger_ar'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {m.type === 'finger_ar' ? 'AR Scan' : 'Ring'}
                    </span>
                  </div>

                  {/* Hand / Finger */}
                  {(handLabel || fingerLabel) && (
                    <div className="flex gap-4 mb-3 pb-3 border-b border-gray-100">
                      {handLabel && (
                        <div className="flex items-center gap-1.5">
                          <span>✋</span>
                          <span className="text-sm text-gray-700">{handLabel}</span>
                        </div>
                      )}
                      {fingerLabel && (
                        <div className="flex items-center gap-1.5">
                          <span>💍</span>
                          <span className="text-sm text-gray-700">{fingerLabel}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Diameter + Circumference */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Diameter</p>
                      <p className="font-bold text-gray-900">{Number(m.inner_diameter_mm).toFixed(2)} mm</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Circumference</p>
                      <p className="font-bold text-gray-900">{Number(m.inner_circumference_mm).toFixed(2)} mm</p>
                    </div>
                  </div>

                  {/* Ring sizes */}
                  <div className="grid grid-cols-4 gap-2 text-center mb-4">
                    {[
                      { label: 'US',    value: m.size_us },
                      { label: 'EU',    value: m.size_eu },
                      { label: 'UK/AU', value: m.size_uk_au_nz },
                      { label: 'JP/CN', value: m.size_jp_cn },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-blue-50 rounded-lg py-2">
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className="font-bold text-blue-700">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(m.id)}
                    disabled={deletingId === m.id}
                    className="w-full py-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {deletingId === m.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={() => router.push('/measure/ar')}
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700"
          >
            + New Measurement
          </button>
        </div>
      </div>
    </div>
  );
}
