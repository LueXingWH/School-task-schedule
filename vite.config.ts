import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()], base: './',
  build: { chunkSizeWarningLimit: 1500, rollupOptions: {
    input: { dashboard: 'dashboard.html', popup: 'popup.html', background: 'src/background.ts' },
    output: { entryFileNames: (chunk) => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js' }
  } }, worker: { format: 'es' }, test: { environment: 'node' }
});
