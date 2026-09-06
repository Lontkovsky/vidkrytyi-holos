import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], build: { sourcemap: false, target: 'es2023' },
  server: { headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' } } });
