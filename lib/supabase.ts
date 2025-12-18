import { createClient } from '@supabase/supabase-js';

// NOTE: In a real Vite project, these would be import.meta.env.VITE_SUPABASE_URL
// If you are running this locally, create a .env file.
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

// Check if we are using the default placeholders
export const isSupabaseConfigured = supabaseUrl !== 'https://your-project.supabase.co' && !supabaseUrl.includes('your-project');

export const supabase = createClient(supabaseUrl, supabaseKey);