import { createClient } from '@supabase/supabase-js';

// Access environment variables safely
const getEnv = (key: string) => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) return import.meta.env[key];
  return '';
};

// Default Credentials (Hardcoded for this project)
const DEFAULT_URL = 'https://qotllqowidahiuuvcsoa.supabase.co'.trim();
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvdGxscW93aWRhaGl1dXZjc29hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjY0NTMsImV4cCI6MjA4MTY0MjQ1M30.8qlA5D9utf75GeUsfljFj_u_yjeI2OfBep-YmeBsCzI'.trim();

// Runtime cleanup: If user has stale "placeholder" data in localStorage, clear it
// so the real defaults above can take effect.
if (typeof window !== 'undefined') {
  const localUrl = localStorage.getItem('fintrack_supabase_url');
  if (localUrl && (localUrl.includes('placeholder') || localUrl === 'undefined' || localUrl === 'null')) {
    console.log('Clearing stale Supabase config from localStorage');
    localStorage.removeItem('fintrack_supabase_url');
    localStorage.removeItem('fintrack_supabase_key');
  }
}

const storedUrl = typeof window !== 'undefined' ? localStorage.getItem('fintrack_supabase_url') : '';
const storedKey = typeof window !== 'undefined' ? localStorage.getItem('fintrack_supabase_key') : '';

// Validate stored values
const validStoredUrl = storedUrl && storedUrl.startsWith('https://') ? storedUrl : '';
const validStoredKey = storedKey && storedKey.length > 20 ? storedKey : '';

// Priority: Env Var > LocalStorage (if valid) > Hardcoded Default
const supabaseUrl = getEnv('VITE_SUPABASE_URL') || validStoredUrl || DEFAULT_URL;
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY') || validStoredKey || DEFAULT_KEY;

// Export configuration status
export const isSupabaseConfigured = 
  supabaseUrl && 
  supabaseKey && 
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('placeholder');

// Create Client
export const supabase = createClient(
  supabaseUrl, 
  supabaseKey
);

export const configureSupabase = (url: string, key: string) => {
  if (!url || !key) return;
  localStorage.setItem('fintrack_supabase_url', url.trim());
  localStorage.setItem('fintrack_supabase_key', key.trim());
  window.location.reload();
};

export const disconnectSupabase = () => {
  localStorage.removeItem('fintrack_supabase_url');
  localStorage.removeItem('fintrack_supabase_key');
  window.location.reload();
};