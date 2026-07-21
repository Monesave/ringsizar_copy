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
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
          <p className="text-sm font-medium text-slate-400">Loading Ringsizar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-blue-950 text-white flex flex-col justify-between selection:bg-blue-500 selection:text-white">
      {/* HEADER / NAVIGATION */}
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20 text-xl font-bold">
            💍
          </div>
          <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
            Ringsizar
          </span>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/saved"
                className="px-4 py-2 text-xs font-semibold bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/60 rounded-xl transition-all"
              >
                Saved Measurements
              </Link>
              <Link
                href="/profile"
                className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md transition-all"
              >
                Profile
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/auth/signup"
                className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md shadow-blue-500/20 transition-all"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </header>

      {/* HERO SECTION */}
      <main className="max-w-4xl mx-auto px-6 py-12 text-center flex-1 flex flex-col justify-center items-center">
        {/* AR TECH BADGE */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-6 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          Augmented Reality & AI Powered Ring Sizing
        </div>

        {/* HERO TITLE */}
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight mb-6 leading-tight max-w-3xl">
          Find Your Exact Ring Size with{' '}
          <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-300 bg-clip-text text-transparent">
            Augmented Reality
          </span>
        </h1>

        {/* HERO SUBTITLE / DESCRIPTION */}
        <p className="text-base sm:text-lg text-slate-300 max-w-2xl mb-10 leading-relaxed font-normal">
          Ringsizar transforms your browser camera into a precise AR measuring tool. By placing a standard reference coin next to your finger, our computer vision AI instantly calculates your exact US, EU, UK, and JP ring sizes.
        </p>

        {/* PRIMARY AR CTA BUTTON */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-sm mb-16">
          <button
            onClick={() => handleMeasureClick('/measure/ar')}
            className="w-full py-4 px-8 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-base rounded-2xl shadow-xl shadow-blue-600/30 hover:shadow-blue-500/40 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
          >
            <span>📷 Start AR Finger Measurement</span>
            <span>→</span>
          </button>
        </div>

        {/* 3-STEP AR PROCESS EXPLANATION */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl text-left mb-12">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm hover:border-slate-700/80 transition-all">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-lg mb-4">
              🪙
            </div>
            <h3 className="text-base font-bold text-white mb-2">1. Place Reference Coin</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Place any common coin (Quarter, Euro, Pound, Rupee, etc.) next to your finger in camera view to calibrate scale.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm hover:border-slate-700/80 transition-all">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-lg mb-4">
              ✨
            </div>
            <h3 className="text-base font-bold text-white mb-2">2. Computer Vision AI</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              MediaPipe AI automatically detects hand joint landmarks and measures your finger width in real-time.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm hover:border-slate-700/80 transition-all">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-lg mb-4">
              📏
            </div>
            <h3 className="text-base font-bold text-white mb-2">3. Global Ring Standards</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Get sub-millimeter accurate measurements instantly converted to US, EU, UK/AU, and JP/CN ring sizes.
            </p>
          </div>
        </div>

        {/* HELPFUL TIPS CARD */}
        <div className="w-full max-w-4xl bg-slate-900/40 border border-amber-500/20 rounded-2xl p-4 text-xs text-amber-200/90 flex items-start gap-3 text-left">
          <span className="text-base shrink-0">💡</span>
          <p className="leading-relaxed">
            <strong className="text-amber-200">Pro Tip for Best Accuracy:</strong> Ensure your hand is well-lit on a plain background, and keep your hand flat and still during camera capture.
          </p>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="w-full max-w-6xl mx-auto px-6 py-6 border-t border-slate-900 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p>© Ringsizar — Browser AR Ring Sizing Platform</p>
        <p>No app download required • Privacy-focused browser processing</p>
      </footer>

      {/* AUTH GATE MODAL */}
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
