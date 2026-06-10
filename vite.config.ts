import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src/web',
  plugins: [preact()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist/web'),
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': 'http://localhost:4577' },
  },
});
