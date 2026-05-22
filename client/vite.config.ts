import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite dev server proxies socket.io to the NestJS backend so the
// client can use a same-origin connection during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    host: true,
  },
});
