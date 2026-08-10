import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' is required so the built bundle resolves assets over file:// in Electron.
// Port 5174 — TapIn School's dev server occupies 5173, so the two can run side by side.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
