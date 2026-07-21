import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    include: ['src/**/*.test.ts', 'shared/**/*.test.ts', 'worker/src/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
  build: {
    chunkSizeWarningLimit: 750,
  },
});
