import { createClient } from '@supabase/supabase-js';

// Access environment variables safely
const getEnv = (key: string) => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) return import.meta.env[key];
  return '';
};

// Check LocalStorage fallback (for runtime configuration without rebuild)
const storedUrl = typeof window !== 'undefined' ? localStorage.getItem('fintrack_supabase_url') : '';
const storedKey = typeof window !== 'undefined' ? localStorage.getItem('fintrack_supabase_key') : '';

// Defaults provided for immediate server integration
// We trim them to avoid copy-paste whitespace issues
const DEFAULT_URL = 'https://qotllqowidahiuuvcsoa.supabase.co'.trim();
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvdGxscW93aWRhaGl1dXZjc29hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjY0NTMsImV4cCI6MjA4MTY0MjQ1M30.8qlA5D9utf75GeUsfljFj_u_yjeI2OfBep-YmeBsCzI'.trim();

// Logic: Environment -> LocalStorage -> Default
// If LocalStorage is set to 'undefined' string by mistake, ignore it
const validStoredUrl = storedUrl && storedUrl !== 'undefined' && storedUrl !== 'null' ? storedUrl : '';
const validStoredKey = storedKey && storedKey !== 'undefined' && storedKey !== 'null' ? storedKey : '';

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || validStoredUrl || DEFAULT_URL;
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY') || validStoredKey || DEFAULT_KEY;

// Check if configured (Keys must exist and be valid)
export const isSupabaseConfigured = 
  supabaseUrl && 
  supabaseKey && 
  supabaseUrl.startsWith('https://');

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseKey || 'placeholder'
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