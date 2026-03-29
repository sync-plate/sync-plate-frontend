import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Utensils, Mail, Lock } from 'lucide-react';

const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  function friendlyError(msg = '') {
    if (msg.toLowerCase().includes('not confirmed') || msg.toLowerCase().includes('email_not_confirmed'))
      return "Your email isn't confirmed yet. Check your inbox (and spam folder) for a confirmation link.";
    if (msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('rate_limit'))
      return 'Too many attempts. Please wait a few minutes before trying again.';
    if (msg.toLowerCase().includes('invalid login') || msg.toLowerCase().includes('invalid credentials'))
      return 'Incorrect email or password.';
    if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered'))
      return 'This email is already registered. Please log in instead.';
    return msg || 'An error occurred. Please try again.';
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setSuccessMessage('Password reset email sent! Check your inbox.');
    } catch (error) {
      setError(friendlyError(error.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (data?.user) {
          // Check if email confirmation is required
          if (data.user.identities && data.user.identities.length === 0) {
            setError('This email is already registered. Please log in instead.');
            setLoading(false);
          } else {
            // Email confirmation required — show message and switch to login view
            setSuccessMessage('Account created! Check your email for a confirmation link, then log in here.');
            setIsSignUp(false);
            setPassword('');
            setLoading(false);
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        // Keep loading true so user sees the loading state while redirect happens
      }
    } catch (error) {
      console.error('Auth error:', error);
      setError(friendlyError(error.message));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-100 via-purple-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-rose-400 to-pink-500 rounded-2xl mb-4">
            <Utensils className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-slate-800 mb-2">Sync-Plate</h1>
          <p className="text-slate-600">Calorie tracking for couples who eat together</p>
        </div>

        {/* Auth Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">
            {isForgotPassword ? 'Reset Password' : isSignUp ? 'Create Account' : 'Welcome Back'}
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
              {successMessage}
            </div>
          )}

          {isForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <p className="text-sm text-slate-600 mb-2">Enter your email and we'll send you a reset link.</p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
                {isSignUp && (
                  <p className="text-xs text-slate-500 mt-1">
                    Must be at least 6 characters
                  </p>
                )}
                {!isSignUp && (
                  <div className="text-right mt-1">
                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(true); setError(''); setSuccessMessage(''); }}
                      className="text-sm text-purple-600 hover:text-purple-700"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Log In'}
              </button>
            </form>
          )}

          {/* Toggle links */}
          <div className="mt-6 text-center space-y-2">
            {isForgotPassword ? (
              <button
                onClick={() => { setIsForgotPassword(false); setError(''); setSuccessMessage(''); }}
                className="text-purple-600 hover:text-purple-700 font-medium"
              >
                Back to log in
              </button>
            ) : (
              <button
                onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccessMessage(''); }}
                className="text-purple-600 hover:text-purple-700 font-medium"
              >
                {isSignUp
                  ? 'Already have an account? Log in'
                  : "Don't have an account? Sign up"}
              </button>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="mt-6 text-center text-sm text-slate-600">
          <p>🔒 Secure authentication powered by Supabase</p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
