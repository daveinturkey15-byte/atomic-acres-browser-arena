import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * MAP3 (HF-409, owner 2026-09-02): the second build, for the Map 3 showcase page.
 *
 * WHY A SECOND BUILD AND NOT A SECOND INPUT.
 *
 * `src/map3/**` (~10k lines of TSL: eight animated corridors, a sky with two
 * marched SDF bodies, its own Rapier world and its own render loop) has always
 * been reachable with `npm run dev` and was never a build input, so it was not
 * in `dist` and `/map3.html` returned 404 on every published channel. The owner
 * looked at the live site, found only the authored stone arena that
 * `src/map3-arena.ts` registers, and reasonably concluded the showcase had been
 * destroyed. Nothing was destroyed; it was simply never shipped.
 *
 * The obvious fix is a second `rollupOptions.input` in `vite.config.ts`. That
 * was measured and rejected: one Rollup graph gives both entries ONE shared
 * `vendor-three` chunk, and the showcase reaches parts of `three/webgpu` and
 * `three/tsl` that the game does not, so the game's own vendor chunk grew
 * 1,553,456 -> 1,567,514 bytes (+14,058 raw, +4.6 kB gzip) for a page the game
 * never loads. "Faster map loads" is a live owner priority, so a second page
 * may not tax the first by a single byte.
 *
 * Two builds into the same `dist` give exactly that: separate module graphs,
 * separate vendor chunks, and a game bundle that is byte-identical with this
 * file present or absent (verified: index, legacy-main, vendor-three and
 * gameplay hashes and sizes unchanged). The cost is a second copy of three in
 * `dist`, downloaded only by whoever opens `/map3.html`.
 *
 * `emptyOutDir: false` is load-bearing: the main build runs first and owns
 * clearing `dist`; this one must add to it, never wipe it.
 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    emptyOutDir: false,
    rollupOptions: {
      input: { map3: fileURLToPath(new URL('./map3.html', import.meta.url)) },
      output: {
        // Named apart from the game's `vendor-three` so the two builds cannot
        // collide in `dist/assets` even if their contents ever hashed alike.
        manualChunks(id: string) {
          const normalized = id.split(String.fromCharCode(92)).join('/');
          if (normalized.includes('/node_modules/three/')) return 'map3-vendor-three';
          return undefined;
        },
      },
    },
  },
});
