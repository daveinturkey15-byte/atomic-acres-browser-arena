# Skills Lab — wave 1 handoff (Fable, 2026-09-12)

> Superseded on the Blender viewer lifecycle and host-suite status by `HANDOFF-wave2.md` (same day). Kept verbatim below as the wave-1 record, including its failed budget receipt.

Lane: `contrib/dave-gaming-pc/claude/skills-lab-night-20260912`, worktree `C:/Users/david/projects/worktrees/aa-skills-lab-night-20260912`, dispatched at `6e9b2cafd318ca2b2f67f9eedcf8d624fee30453`. No commits made; the diff is left for root integration. Budget forced an early stop (~$6 API-equivalent); this is a first coherent checkpoint, not acceptance.

## Preflight and bootstrap

- `npm run pipeline:preflight -- --machine dave-gaming-pc --harness claude --project atomic-acres-browser-arena --lane skills-lab-night-20260912`: routed receipt, base and head `6e9b2caf`, lane expires 2026-09-13T08:00+01:00. Run BEFORE editing on a clean tree; not re-run after (dirty tree refuses).
- AKP `check`: PASS (Claude Code on dave-gaming-pc, control digest `628f270a…`). `audit`: `AKP_ADOPTION_GREEN` with 7 amber rows, all other machines/harnesses. Power plan verified High performance.

## Files changed / added (all inside the allowlist)

- `src/map3/technique-lab/runtime.ts` — three tabs (Skills & demos, URL provided, Blender gallery) with role=tab/tabpanel and arrow-key switching; ONE stage re-parented between the Skills and Blender panels; detail panel gains a coloured status line, "Latest example / revision / evidence" rows, a blocked-row card (why, unblock action, experiment, required test, resources, route to showcase, plan origin) and collapses research records into `<details>`; URL tab lists every recorded URL for all 50 rows with kind, mapping state and opt-in embeds; Blender tab renders catalog cards and loads GLBs into the shared scene. Gallery list gets ArrowUp/Down focus movement.
- `src/map3/technique-lab/gallery/sources.ts` — URL classification, embed allowlist (youtube-nocookie, https images, catalog embeds only from youtube/vimeo players), tolerant `source-catalog.json` parser, mapping state, host default blocker plans for rows 15/22/24/25/30/32/44 (labelled as proposals).
- `src/map3/technique-lab/gallery/blender-catalog.ts` — tolerant per-lane `catalog.json` parser (only `id` + relative `assetUrl` required; no invented thumbnails; rejects absolute/file paths), built-in shipped bus/truck rows with digests from `docs/world-studio-blender-assets.md`, curated ordering, cross-lane duplicate refusal.
- `src/map3/technique-lab/gallery/blender-viewer.ts` — GLTFLoader (three 0.185.1 addon) wrapper with generation guard and full geometry/material/texture disposal.
- `src/map3/technique-lab/types.ts` — optional host seams: `sourceCatalogLoader`, `blenderCatalogLoaders`, `modelLoader`.
- `src/map3/technique-lab/lab.css` — full-viewport flex/grid layout, 16px body / 15px panel text, breakpoints at 1399px (two columns, detail below) and 899px (single column), all tracks `minmax(0, …)`, wrap-anywhere URLs.
- `src/map3/technique-lab/host-skills-lab.test.ts` — 8 CPU tests (see below).
- `src/map3/entry.ts` — page title "Skills Lab". `map3.html` unchanged.

## Tests actually run

- `node node_modules/vitest/vitest.mjs run src/map3/technique-lab/host-skills-lab.test.ts` → 8/8 passed (20:44 UTC).
- `tsc --noEmit -p tsconfig.json` filtered to lane files: clean after the last edit (see final message for the rerun result). Errors outside the lane were ignored per brief.
- NOT run: `scripts/technique-lab/host/host-behavior.test.ts` (existing fake-DOM host suite; budget). Root should run it: `node node_modules/vitest/vitest.mjs run --config scripts/technique-lab/host/vitest.host.config.ts`. Risk: `buildDom` now calls `selectTab`, which uses `button.tabIndex`, `panel.hidden`, `URL`/`history` and `focus`; the bounded FakeElement may need those members.
- No Vite build, browser boot, GPU render or full vitest (forbidden in-lane).

## Skill-use receipt

| Skill | Resolved path (junction target) | SHA-256 | Technique taken | Where applied |
|---|---|---|---|---|
| game-hud-menu-overhaul | `C:\Users\david\Documents\desky-bootstrap-clone\Skills\game-development\game-hud-menu-overhaul\SKILL.md` | `8b590d9fd7848070e46155ee8a61feaf6539cfe28c2b1ee0bdf1162665878c0a` | semantic DOM roster as the single source, state-readout status, keyboard focus mapping, capture mode by query param (`?tab=`), no tiny low-contrast text | tabs, status line classes, `?tab=urls|blender`, 15–16px tokens in lab.css |
| threejs-game-development | `…\Skills\software-development\threejs-game-development\SKILL.md` | `707888880f11fe498e5233417ba0b2a808f943c27954881fa19ca239798e2ce9` | verify installed version (three 0.185.1) before using addon APIs; assets with provenance + lifecycle disposal; instrument draws/tris | GLTFLoader import path, `disposeObject`, catalog provenance fields, metrics line kept |
| visual-web-artifacts | `…\Skills\creative\visual-web-artifacts\SKILL.md` | `af82c7a5c894abe6ae66709aad617a3c893cd2d2d5f0fb461dd911186b64c657` | readable hierarchy over decoration, responsive behaviour, no unpinned remote dependencies | CSS tokens, embed allowlist with link fallback |

Original sources inspected this wave: the three SKILL.md files above, `three@0.185.1` `examples/jsm/loaders/GLTFLoader.js` (present), repo `docs/world-studio-blender-assets.md` (bus/truck digests). No upstream Three docs fetched (budget). Independent validation: PENDING (root GPU acceptance).

## Screenshot / capture requirements (root)

Capture `map3.html?lab=techniques` and `…&tab=urls`, `…&tab=blender` at 1600x1000, 1280x720 and 760x900, 100% zoom, installed Chrome, native WebGPU. Falsifiers: `document.documentElement.scrollWidth <= innerWidth`; no `.tl-name`/`.tl-badge` clipped; body computed font-size ≥ 15px; Blender tab click on "Hero school bus" shows the GLB, a second click on the truck replaces it with no console error and stable `renderer.info.memory`; switching back to Skills remounts the selected demo.

## Unresolved falsifiers / known gaps

- Fake-DOM host suite not re-run (above). Whole-lane behaviour has not booted in a browser.
- URL embeds: none of the 50 baseline URLs are embeddable under the allowlist, so every row shows the link fallback until the sources lane supplies `embedUrl`s.
- `import.meta.glob('/public/assets/world-studio/blender/*/catalog.json')` is build-time discovery; a catalog dropped in after build needs a rebuild. No lane catalogs exist yet in this tree.
- Blocked-row plans are host proposals; the sources-lane catalog overrides them when present.
- Notices for load faults now live inside the collapsed receipts; the status line still signals "load issue".

## Needed root wiring

- None mandatory: entry and CSS are already routed. Optional: root synthesises `public/assets/skills-lab/source-catalog.json` from the sources lane.

## Next best improvement

Extend `scripts/technique-lab/host/host-behavior.test.ts`'s FakeElement (tabIndex, hidden, focus) and add tab-switch + Blender-load falsifiers through `mountTechniqueLab` with the `modelLoader`/`blenderCatalogLoaders` seams; then run the three viewport captures.
