import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // MapLibre alone is ~1 MB minified; that is expected for a map app.
  build: {
    chunkSizeWarningLimit: 1600,
    // two pages: the tool and the reports
    rolldownOptions: { input: { main: 'index.html', berichte: 'berichte.html' } },
  },
  // MapLibre starts its worker with { type: 'module' }.
  worker: { format: 'es' },
});
