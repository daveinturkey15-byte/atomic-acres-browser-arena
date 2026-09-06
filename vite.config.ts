import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    include: ['src/**/*.test.ts', 'shared/**/*.test.ts', 'worker/src/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      /**
       * MAP3 (HF-409): the showcase page is a build input.
       *
       * `src/map3/**` (~10k lines of TSL) has always been reachable with
       * `npm run dev` and was never a build input, so `/map3.html` returned 404
       * on every published channel. The owner looked at the live site, found
       * only the arena, and reasonably concluded the showcase had been
       * destroyed. Nothing was destroyed; it was simply never shipped.
       *
       * WHY ONE GRAPH AND NOT A SECOND VITE BUILD. The first fix for this was a
       * second config (`vite.map3.config.ts`) with its own `map3-vendor-three`,
       * on the argument that ONE shared graph would push three/tsl nodes only
       * the showcase reaches into the game's own `vendor-three` (measured then:
       * 1,553,456 -> 1,567,514 B) and "a second page may not tax the first by a
       * single byte". That argument died when the ARENA became the showcase: the
       * lazy `map3-arena` chunk reaches the same nodes, so the game's
       * `vendor-three` is 1,567,517 B either way.
       *
       * RE-MEASURED 2026-09-02 on this tree, both variants built from the same
       * commit, eager closure via `scripts/qa/measure-eager-chunk-graph.mjs`
       * (STATIC import edges only, which is what a player downloads at boot):
       *   two builds : 18 chunks / 4,508,195 B eager; dist/assets 8,255,844 B
       *   one graph  : 20 chunks / 4,508,454 B eager; dist/assets 7,296,301 B
       * So one graph costs the game +259 B of eager download (+0.006%: two tiny
       * shared chunks split out, less 539 B off legacy-main and 208 B off map)
       * and takes 959,543 B of duplicated three OUT of the published channel.
       * The game's `vendor-three` hash and size are identical in both. 259 B
       * against 937 kB is not a trade worth a second build system, and whoever
       * opens /map3.html after playing now reuses the vendor chunk they have.
       */
      input: { index: 'index.html', map3: 'map3.html', forgeFacade: 'forge-facade.html' },
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
