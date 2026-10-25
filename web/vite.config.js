import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Giao diện gọi API cùng tên miền (/api). Khi chạy dev, Vite chuyển /api sang máy chủ API ở cổng 3000.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { proxy: { '/api': process.env.API_URL || 'http://localhost:3000' } },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
  },
});
