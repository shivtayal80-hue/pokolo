import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Split heavy libraries into their own separate chunks
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