// Dev server for the viewmodel-clipping measurement runs ONLY.
// HMR is off: a concurrent edit in this shared worktree otherwise triggers a
// full reload mid-probe and Playwright reports "Execution context was
// destroyed", which reads exactly like a renderer crash. Reload manually.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { hmr: false },
});
