// Dev server for the viewmodel-clipping measurement runs ONLY.
//
// HMR is off: a concurrent edit in this shared worktree otherwise triggers a
// full reload mid-probe and Playwright reports "Execution context was
// destroyed", which reads exactly like a renderer crash. Reload manually.
//
// The file WATCHER is off with it, and that is not merely an optimisation.
// This worktree is shared with other agents, and on 2026-08-31 chokidar walked
// into a sibling's scratch tree and threw an unrecoverable
// `UNKNOWN: unknown error, watch '.bisect-yesterday/...webm'` - the server
// process died, and the next measurement run failed 240 s later with
// `window.__ATOMIC_ACRES_DEBUG__` never appearing, which reads exactly like a
// renderer that cannot boot. With HMR already off the watcher has nothing to
// do, so the failure mode is simply removed.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { hmr: false, watch: null },
});
