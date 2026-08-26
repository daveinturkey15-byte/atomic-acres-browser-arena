import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    include: ['src/**/*.test.ts', 'shared/**/*.test.ts', 'worker/src/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll('\\', '/');
          if (normalized.includes('/node_modules/peerjs/')) return 'vendor-peer';
          if (normalized.includes('/node_modules/three/examples/jsm/loaders/')) return 'vendor-three-loaders';
          if (normalized.includes('/node_modules/three/examples/jsm/postprocessing/')) return 'vendor-three-post';
          if (normalized.includes('/node_modules/three/')) return 'vendor-three';
          return undefined;
        },
      },
    },
  },
});
