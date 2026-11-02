import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
const serverSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server/src');

// Sửa mã máy chủ: chờ API khởi động lại xong rồi tải lại trang đang mở (mã giao diện đã có sẵn cập nhật tức thời của Vite)
const reloadOnServerChange = () => ({
  name: 'reload-on-server-change',
  configureServer(server) {
    let timer;
    server.watcher.add(serverSrc);
    server.watcher.on('change', (file) => {
      if (!path.resolve(file).startsWith(serverSrc)) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        for (let i = 0; i < 20; i++) {
          const ok = await fetch(`${apiUrl}/api/health`).then((r) => r.ok, () => false);
          if (ok) { server.ws.send({ type: 'full-reload' }); return; }
          await new Promise((r) => setTimeout(r, 500));
        }
      }, 800);
    });
  },
});

// Giao diện gọi API cùng tên miền (/api). Khi chạy dev, Vite chuyển /api sang máy chủ API ở cổng 3000.
export default defineConfig({
  plugins: [react(), reloadOnServerChange()],
  base: './',
  server: { port: Number(process.env.WEB_PORT || 5173), strictPort: true, proxy: { '/api': apiUrl } },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
  },
});
