'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/supabase/auth';
import { supabase } from '@/lib/supabase/client';
import AuthGateModal from '@/components/auth/AuthGateModal';

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modalDestination, setModalDestination] = useState<string | null>(null);

  useEffect(() => {
    // getUser() does a network round-trip to validate the token — use it as
    // the initial check, then keep state in sync via the auth listener.
    getCurrentUser().then((u) => { setUser(u); setLoading(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleMeasureClick = useCallback((destination: string) => {
    if (user) {
      router.push(destination);
    } else {
      setModalDestination(destination);
    }
  }, [user, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-5xl font-bold mb-4 text-gray-900">Ringsizar</h1>
        <p className="text-xl text-gray-600 mb-8">
          Measure your ring size using AR technology in your browser
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => handleMeasureClick('/measure/ar')}
            className="p-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-left"
          >
            <h2 className="text-2xl font-semibold mb-2">AR Finger Measurement</h2>
            <p className="text-blue-100">
              Use your camera to measure your finger size with AR
            </p>
          </button>

          <button
            onClick={() => handleMeasureClick('/measure/ring')}
            className="p-6 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-left"
          >
            <h2 className="text-2xl font-semibold mb-2">Ring Measurement</h2>
            <p className="text-green-100">
              Measure an existing ring to find your size
            </p>
          </button>
        </div>

        <div className="flex gap-4 justify-center">
          {user ? (
            <>
              <Link
                href="/saved"
                className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Saved Measurements
              </Link>
              <Link
                href="/profile"
                className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Profile
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/auth/signup"
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>

        <div className="mt-12 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> For best results, ensure good lighting and keep your hand still during measurement.
            Temperature, swelling, and time of day can affect finger size.
          </p>
        </div>
      </div>

      {modalDestination && (
        <AuthGateModal
          destination={modalDestination}
          onClose={() => setModalDestination(null)}
          onProceed={(dest) => { setModalDestination(null); router.push(dest); }}
        />
      )}
    </div>
  );
}
