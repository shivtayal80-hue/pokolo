import React, { useState } from 'react';
import { Box, Lock, User as UserIcon, ArrowRight, Sparkles } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dbService } from '../services/mockDb';
import { User } from '../types';

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

    try {
      if (isSupabaseConfigured) {
        if (isLogin) {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
        } else {
          const { error } = await supabase.auth.signUp({ email, password });
          if (error) throw error;
          setMessage("Account created! You can now sign in.");
          setIsLogin(true);
        }
      } else {
        if (isLogin) {
          const user = await dbService.login(email, password);
          onLogin(user);
        } else {
          const user = await dbService.register(email, password);
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
        {/* Modern Clean Card */}
        <div className="bg-white border border-gray-100 shadow-xl shadow-gray-200/50 rounded-3xl overflow-hidden">
          
          {/* Header */}
          <div className="p-8 text-center bg-white">
            <div className="w-14 h-14 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-md transform rotate-3">
              <Box className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h1>
            <p className="text-gray-500 mt-2 text-sm font-medium">
              Intelligence for your Inventory
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
                  {isSupabaseConfigured ? 'Email' : 'Username'}
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-gray-400 group-focus-within:text-gray-900 transition-colors" />
                  </div>
                  <input
                    type={isSupabaseConfigured ? "email" : "text"}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-11 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-gray-900 focus:bg-white transition-all"
                    placeholder={isSupabaseConfigured ? "name@company.com" : "admin"}
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
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm p-3 rounded-xl flex items-center">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2.5"></span>
                  {error}
                </div>
              )}

              {message && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm p-3 rounded-xl flex items-center">
                   <Sparkles className="w-4 h-4 mr-2 text-emerald-500" />
                   {message}
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