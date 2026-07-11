import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
  build: {
    chunkSizeWarningLimit: 750,
  },
});
