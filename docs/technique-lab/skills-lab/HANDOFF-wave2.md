# Skills Lab — wave 2 handoff: Blender viewer lifecycle repair (Fable, 2026-09-12)

Lane: `contrib/dave-gaming-pc/claude/skills-lab-night-20260912`, worktree `C:/Users/david/projects/worktrees/aa-skills-lab-night-20260912`, HEAD `6e9b2cafd` (unchanged; no commits, no push). Model `claude-fable-5-1` @ xhigh, $6 budget, 30 min. Wave 1 (`HANDOFF.md`) is preserved as written; its failed receipt (`apiEquivalentCostUsd: 6.1132685`) stands and is not reset here.

## Defect fixed (root integration guard finding)

`gallery/blender-viewer.ts` public `clear()` only removed the active object; a GLB still in flight could attach after the user switched to Skills. In `runtime.ts` a stale rejection could also overwrite the newer asset's status line and the shared stage overlay.

## Exact files touched this wave (all inside the allowlist)

- `src/map3/technique-lab/gallery/blender-viewer.ts` — rewritten narrowly:
  - internal `release()` (detach + free the active model, no generation change) vs public `clear()` (advance generation, then release);
  - the generation advances on every `load()`, public `clear()` and `dispose()`; a load resolving after any of them never attaches, frees once, returns null;
  - `LoadedModel.dispose()` is idempotent (`onceDisposable`), so consumer dispose + viewer release cannot double-free;
  - `disposeObject` de-duplicates textures across material slots and materials (Set), order unchanged: geometries → textures → materials;
  - `dispose()` is idempotent and a disposed viewer never starts a loader request.
- `src/map3/technique-lab/runtime.ts` — three edits:
  - `LabState.blenderRequest` counter (+ initialiser) = request identity;
  - `loadBlenderAsset`: `const request = ++state.blenderRequest`; after the await, a non-current request returns without touching status/stage; a stale rejection is still logged to the error box but never writes `blenderStatus` or calls `showEmpty`; a null result under a still-current request now reads "Load of … was cancelled before it attached — click the card to load it again." instead of a stuck "Loading…";
  - `selectTab` → Skills bumps `blenderRequest` before `viewer.clear()` (tab identity), so a late resolve/reject cannot touch the Skills stage;
  - `renderUrlTab`: replaced `body.prepend(count)` with `replaceChildren(count, ...Array.from(body.children))`. Reason: the existing host suite's bounded FakeElement has no `prepend`, and wave 1 had left that suite failing 24/29 at mount time. This is the runtime conforming to the suite's DOM subset; no fake-DOM method was added.
- `src/map3/technique-lab/host-skills-lab.test.ts` — 4 new viewer tests (pending → public clear → resolve; stale reject leaves current attached; exactly-once across model.dispose/clear/replace/double dispose; shared-texture single dispose). Existing 8 untouched.
- `src/map3/technique-lab/host-skills-lab-runtime.test.ts` — NEW, 4 tests through the real `mountTechniqueLab` with a bounded fake DOM (same subset as the host suite plus `document.baseURI`, `location.href`, `parentElement`, no-op `focus`), stub renderer and gated `modelLoader`:
  1. A→B then reject(A) while B pending: status stays "Loading …hero-truck.glb", error box logs the bus failure, stage overlay untouched; resolve(B) → "Loaded …hero-truck.glb", truck attached, overlay hidden; `host.dispose()` twice frees truck exactly once.
  2. reject(A) after B attached: B stays loaded/attached, no "Load failed" in status.
  3. Load pending across Skills switch: stale model never attaches (`parent === null`), freed exactly once, Skills overlay text/hidden state identical before/after the stale resolve; returning to Blender re-issues one fresh request which attaches; teardown frees the fresh model once and the stale one stays at once.
  4. Rejection pending across Skills switch: logged, Skills stage and Blender status unchanged.

Not touched: `types.ts`, `lab.css`, `entry.ts`, `map3.html`, `scripts/technique-lab/host/**`, any other lane, shared skills/config, registries.

## Tests actually run (21:52 UTC, this worktree)

| Command | Result |
|---|---|
| `node ./node_modules/vitest/vitest.mjs --config scripts/technique-lab/host/vitest.host.config.ts` | 29/29 passed (was 24 failed / 5 passed before the `prepend` fix — `TypeError: body.prepend is not a function` at `renderUrlTab`, wave-1 state) |
| `node ./node_modules/vitest/vitest.mjs run src/map3/technique-lab/host-skills-lab.test.ts src/map3/technique-lab/host-skills-lab-runtime.test.ts` | 16/16 passed (12 + 4) |

Not run this wave (budget): `tsc --noEmit`, Vite build, browser boot, GPU capture, full vitest. Root should run tsc on the lane files first; the new test casts `createRenderer` via `as never` deliberately to reuse the host suite's stub shape.

## Lifecycle evidence (what the tests prove, not what I assert)

- Public `clear()` with nothing attached still cancels the pending load (viewer test 3: `await first === null`, `scene.children.length === 0`, counts `{geo:1, mat:1, tex:1}`).
- Exactly-once across every path: consumer double-dispose, viewer release after consumer dispose, replacement by a newer load, repeated `viewer.dispose()` (viewer test 5).
- Shared texture referenced from `map` and `emissiveMap` of one material and `map` of another, on two meshes sharing one geometry: `{tex:1, geo:1, m1:1, m2:1}` (viewer test 6).
- Host-level: request identity and tab identity are independent guards; both are exercised with resolve and reject orderings (runtime tests 1–4).

## Honest states / remaining falsifiers

- Catalog, latest-revision and adaptation surfaces are unchanged from wave 1: no lane `catalog.json` exists in this tree, only the built-in bus/truck rows; URL embeds still all fall back to links. No visual acceptance and no source recovery are claimed.
- The stale-rejection error line ("Load failed for … hero-bus.glb") is still appended to the error box by design (truthful log). If root prefers silence for superseded failures, drop the `reportError` call before the `isCurrent()` check in `loadBlenderAsset`.
- A tab switch away leaves the hidden Blender panel status at "Loading …" until return (return re-issues the load, which rewrites it). Acceptable because the panel is hidden; flagged for honesty.
- Browser falsifiers for root capture remain those in `HANDOFF.md`: bus → truck click with stable `renderer.info.memory`; add: click bus, immediately switch to Skills, wait, switch back — exactly one bus root in the scene and no console error.
- `document.baseURI` is required by `loadBlenderAsset`'s URL resolution; the fake DOM supplies it. Any non-browser host without it will reject every load (surfaced as "Load failed", never as an attach).
