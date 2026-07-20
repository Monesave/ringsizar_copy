'use client';

import React, { useState } from 'react';
import { signIn, signUp, signInWithGoogle } from '@/lib/supabase/auth';

type Tab = 'signin' | 'signup' | 'guest';

interface Props {
  destination: string;
  onClose: () => void;
  onProceed: (destination: string) => void;
}

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const Divider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3 text-xs text-gray-400">
    <div className="flex-1 h-px bg-gray-200" />
    <span>{label}</span>
    <div className="flex-1 h-px bg-gray-200" />
  </div>
);

export default function AuthGateModal({ destination, onClose, onProceed }: Props) {
  const [tab, setTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const switchTab = (t: Tab) => {
    setError(null); setSuccess(null);
    setEmail(''); setPassword(''); setConfirmPassword('');
    setTab(t);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await signIn(email, password);
    if (error) { setError(error.message); setLoading(false); }
    else onProceed(destination);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true); setError(null);
    const { error } = await signUp(email, password);
    if (error) { setError(error.message); setLoading(false); }
    else { setLoading(false); setSuccess('Account created! Please check your email to confirm, then sign in.'); }
  };

  const handleGoogle = async () => {
    setLoading(true); setError(null);
    const { error } = await signInWithGoogle();
    if (error) { setError(error.message); setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold mb-1">Welcome to Ringsizar</h2>
              <p className="text-blue-100 text-sm">Sign in to save your measurements and access them anytime.</p>
            </div>
            <button onClick={onClose} className="text-blue-200 hover:text-white text-2xl leading-none ml-4 mt-0.5">&times;</button>
          </div>
        </div>

        {/* Tab bar — hidden on guest view */}
        {tab !== 'guest' && (
          <div className="flex border-b border-gray-200">
            {(['signin', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  tab === t
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>
        )}

        <div className="p-6">

          {/* ── Guest disclaimer ── */}
          {tab === 'guest' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <span className="text-2xl leading-none mt-0.5">⚠️</span>
                <div>
                  <p className="font-semibold text-amber-800 text-sm mb-1">Your measurements will not be saved</p>
                  <p className="text-amber-700 text-sm leading-relaxed">
                    Without an account, your ring size results exist only for the current session.
                    Once you navigate away, your data will be permanently lost and cannot be
                    recovered. Create a free account to build a history of measurements accessible
                    from any device, at any time.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => switchTab('signin')}
                  className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Sign In to My Account
                </button>
                <button
                  onClick={() => switchTab('signup')}
                  className="w-full py-3 border-2 border-blue-600 text-blue-600 font-semibold rounded-xl hover:bg-blue-50 transition-colors"
                >
                  Create a Free Account
                </button>
                <div className="pt-1 text-center">
                  <button
                    onClick={() => onProceed(destination)}
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
                  >
                    Continue without saving my data
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Sign In ── */}
          {tab === 'signin' && (
            <div className="space-y-4">
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                onClick={handleGoogle}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              <Divider label="or sign in with email" />

              <form onSubmit={handleSignIn} className="space-y-3">
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address" required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password" required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit" disabled={loading}
                  className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>

              <div className="pt-1 text-center">
                <button
                  onClick={() => switchTab('guest')}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Proceed without an account →
                </button>
              </div>
            </div>
          )}

          {/* ── Sign Up ── */}
          {tab === 'signup' && (
            <div className="space-y-4">
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
              {success && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>
              )}

              {!success && (
                <>
                  <button
                    onClick={handleGoogle}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <GoogleIcon />
                    Continue with Google
                  </button>

                  <Divider label="or create with email" />

                  <form onSubmit={handleSignUp} className="space-y-3">
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address" required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password (min. 6 characters)" required minLength={6}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password" required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit" disabled={loading}
                      className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                    >
                      {loading ? 'Creating account…' : 'Create Free Account'}
                    </button>
                  </form>
                </>
              )}

              <div className="pt-1 text-center">
                <button
                  onClick={() => switchTab('guest')}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Proceed without an account →
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
