import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli/index.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: false, // vite build writes dist/web first; don't wipe it
  banner: { js: '#!/usr/bin/env node' },
  sourcemap: false,
  splitting: false,
});
