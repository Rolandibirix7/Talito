import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, Vite (puerto 5173) reenvía /api al servidor Express (puerto 3000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
