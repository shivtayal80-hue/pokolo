import React, { useState } from 'react';
import { Box, Lock, User as UserIcon, ArrowRight, Sparkles, AlertTriangle, Mail } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dbService } from '../services/mockDb';
import { User } from '../types';
import { safeString } from '../lib/utils';

interface AuthScreenProps {
  onLogin: (user: User) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    const cleanEmail = email.trim();
    const cleanPassword = password;

    try {
      if (isSupabaseConfigured) {
        if (isLogin) {
          // --- LOGIN ---
          const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: cleanPassword });
          if (error) {
            if (error.message.includes('Email not confirmed')) {
              throw new Error("Please check your email inbox to confirm your account before logging in.");
            }
            if (error.message.includes('Invalid login')) {
               throw new Error("Invalid email or password.");
            }
            throw error;
          }
          // Successful login is handled by the onAuthStateChange listener in App.tsx
        } else {
          // --- SIGN UP ---
          const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password: cleanPassword });
          if (error) {
            if (error.message.includes('already registered')) {
              setIsLogin(true);
              throw new Error("This email is already registered. Please sign in.");
            }
            throw error;
          }
          
          if (data.user && !data.session) {
             // User created but waiting for email confirmation
             setMessage("Account created successfully! We've sent a confirmation link to your email. Please verify it to log in.");
             setIsLogin(true);
          } else if (data.session) {
             // Auto-logged in (rare configuration)
             setMessage("Account created! Logging you in...");
          }
        }
      } else {
        // --- OFFLINE MOCK MODE ---
        // Fallback for local testing if server disconnects (unlikely in prod)
        if (isLogin) {
          const user = await dbService.login(cleanEmail, cleanPassword);
          onLogin(user);
        } else {
          const user = await dbService.register(cleanEmail, cleanPassword);
          onLogin(user);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-gray-50">
      
      {/* Subtle Background Elements */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-blue-50 to-transparent"></div>
      
      <div className="relative z-10 w-full max-w-md">
        
        {/* Login Card */}
        <div className="bg-white border border-gray-100 shadow-xl shadow-gray-200/50 rounded-3xl overflow-hidden mt-10">
          
          <div className="p-8 text-center bg-white">
            <div className="w-14 h-14 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-md transform rotate-3">
              <Box className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">FINTRACK</h1>
            <p className="text-gray-500 mt-2 text-sm font-medium">
              Enterprise Resource Planning
            </p>
          </div>

          <div className="px-8 pb-10">
            {/* Toggle Switch */}
            <div className="flex bg-gray-100 rounded-xl p-1 mb-8">
              <button
                onClick={() => { setIsLogin(true); setError(''); setMessage(''); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  isLogin ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setIsLogin(false); setError(''); setMessage(''); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  !isLogin ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Email
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-gray-400 group-focus-within:text-gray-900 transition-colors" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-11 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-gray-900 focus:bg-white transition-all"
                    placeholder="name@company.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-gray-900 transition-colors" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-11 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-gray-900 focus:bg-white transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm p-3 rounded-xl flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="flex-1">{safeString(error)}</span>
                </div>
              )}

              {message && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm p-3 rounded-xl flex items-start animate-in fade-in slide-in-from-top-2">
                   {message.includes('email') ? <Mail className="w-4 h-4 mt-0.5 mr-2 text-emerald-600 shrink-0" /> : <Sparkles className="w-4 h-4 mt-0.5 mr-2 text-emerald-500 shrink-0" />}
                   <span className="flex-1 leading-snug">{safeString(message)}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-900 hover:bg-black text-white py-3.5 rounded-xl font-bold shadow-lg shadow-gray-900/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    {isLogin ? 'Access Dashboard' : 'Create Account'}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-8 text-center text-xs font-medium text-gray-400">
          &copy; {new Date().getFullYear()} FINTRACK. Secure Environment.
        </p>
      </div>
    </div>
  );
};