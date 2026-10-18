import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // MapLibre alone is ~1 MB minified; that is expected for a map app.
  build: {
    chunkSizeWarningLimit: 1600,
    // landing page at /, the tool and its reports under /dortmund/
    rolldownOptions: {
      input: { landing: 'index.html', main: 'dortmund/index.html', berichte: 'dortmund/berichte.html' },
    },
  },
  // MapLibre starts its worker with { type: 'module' }.
  worker: { format: 'es' },
});
