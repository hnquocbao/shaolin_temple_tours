import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1200 },
  // Generous timeout: the terrain and forest tests are heavy and CI machines are slow and shared.
  test: { include: ['test/**/*.test.ts'], environment: 'node', testTimeout: 60_000 },
});
