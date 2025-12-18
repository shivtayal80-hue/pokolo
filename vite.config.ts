import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Increased limit to 4000kB to suppress warnings for heavy libs (Supabase, Recharts, XLSX)
    chunkSizeWarningLimit: 4000, 
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Split heavy libraries into their own separate chunks for better caching
            if (id.includes('xlsx')) return 'xlsx';
            if (id.includes('jspdf')) return 'jspdf';
            if (id.includes('recharts')) return 'recharts';
            if (id.includes('@supabase')) return 'supabase';
            
            // Group remaining small dependencies into a common vendor chunk
            return 'vendor';
          }
        }
      }
    }
  }
});