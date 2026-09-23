import { defineConfig } from 'vitest/config';

// Focused CPU config for the Technique Lab HOST behavioural suite. It imports
// the real runtime (vite transforms its import.meta.glob; no demo groups exist
// on this branch, which is exactly the pending-state path) and drives it
// through a bounded fake DOM and a stub renderer. No GPU, no browser.
export default defineConfig({
  test: {
    include: ['scripts/technique-lab/host/host-behavior.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
