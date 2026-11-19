import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base path ensures game assets load on any GitHub Pages subpath
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Only React is part of the game's runtime graph now. maplibre-gl and
          // dexie belonged to the legacy navigation app and are no longer
          // imported by src/main.tsx -> src/App.tsx, so they must not be forced
          // into chunks here (that would re-add ~880 KB to every load).
          vendor: ['react', 'react-dom']
        }
      }
    }
  },
  server: {
    port: 3000,
    host: true
  }
});
