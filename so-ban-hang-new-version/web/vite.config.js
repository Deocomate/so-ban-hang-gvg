import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// mode "demo": bản chạy thử chạy Postgres (PGlite) ngay trong trình duyệt, dữ liệu mẫu.
// mode "production": bản thật kết nối Supabase (cần VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY trong file .env).
// Bản thật không cần Postgres-trong-trình-duyệt: bỏ các tệp .wasm/.data của PGlite khỏi thư mục build
const dropDemoEngine = (mode) => ({
  name: 'drop-demo-engine',
  generateBundle(_, bundle) {
    if (mode === 'demo') return;
    for (const k of Object.keys(bundle)) if (/(pglite|initdb)-.*\.(wasm|data)$/.test(k)) delete bundle[k];
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), dropDemoEngine(mode)],
  base: './',
  define: { __DEMO__: JSON.stringify(mode === 'demo') },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  server: { fs: { allow: ['..'] } },
  build: {
    target: 'es2020',
    outDir: mode === 'demo' ? 'dist-demo' : 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
  },
}));
