# Technique Lab HOST — quality pass (2026-09-12)

Worktree `contrib/dave-gaming-pc/omp/technique-host-quality-20260912`, base
`30740ea2540037b5d4dcbedd90680d76ecc8bb60` (Meta host commit preserved, not amended).
Owned paths only: `src/map3/technique-lab/{runtime,types,manifest}.ts`,
`src/map3/technique-lab/lab.css`, `scripts/technique-lab/host/**`,
`docs/technique-lab-host.md`. No group folders, no root files touched.

## What changed and why

### Manifest honesty (runtime.ts + types.ts)

- **Blocked-with-factory guard.** A `blocked` manifest entry that also ships a
  `createDemo` has the factory stripped at adoption time and the row flagged
  (`blocked entry carried a factory; the factory was ignored`). A blocked row
  has no honest demo; it can never silently mount one.
- **Blocked is a first-class state.** Gallery badge `blocked` (amber style
  `.tl-badge.is-blocked`), `blocked` added to the status filter, and
  `statusText` says `blocked — no honest demo delivered; limitation recorded`.
- **Alias enforcement.** A factory mounted on an alias row (21→19) is flagged
  `aliases row 19; any factory here is a convenience alias, not a distinct
  technique credit`, independent of the group's own labelling.
- **`notDeliveredSourceIds` surfaced.** `GroupModule` now carries the optional
  group-honesty flag group B exports. Rows named there show
  `not delivered in its lane (source recovered/read, no honest demo)`; a
  not-delivered row that also ships a factory is flagged as an inconsistency
  (alert) while the factory stays mounted — never silently hidden, never
  fabricated.
- **Notice severity split.** `addProblem(record, message, alert)` —
  operational failures (import/validation/factory-throw/mismatch/duplicate)
  turn the gallery badge red; informational notices (alias, not-delivered)
  stay in the detail panel only, so the gallery doesn't cry wolf.
- **Non-http sources shown, never linked.** The previous code *claimed* to
  display unlinked URLs but rendered only a generic "Withheld" sentence. The
  actual string is now displayed as text with
  `not linked (non-http(s) or unverified served path; shown as text only)` —
  research-JSON-style links stay unavailable unless actually served.

### Stage framing / lighting (runtime.ts, three 0.185.1 APIs)

- **Aspect-aware framing.** `frameSelection` now fits BOTH frustum extents:
  `distance = max(radius/tan(fov/2), radius/(tan(fov/2)·aspect)) · 1.2`, so
  flat planes and tall towers frame fully at any stage shape. The bounding
  sphere is computed by `boundedBoundingSphere`, which returns null for empty,
  zero or NaN bounds; `homeCamera` then restores the stable default framing
  (position 4,3,6 / target origin) instead of inheriting the previous demo's
  camera. Framing stays once-per-mount/Recenter, never per frame.
- **Neutral ambient floor.** Host rig is now hemi 0.9 + directional 1.1 +
  `AmbientLight 0.35` — all host-owned and disposed together (`light.dispose()`
  on teardown and on init-failure/gen-mismatch early returns, which previously
  leaked constructed lights). No per-demo point lights, no game art-direction
  coupling, no bloom/tonemap weakening — this is a standalone host.
- **Renderer init race hardening.** Failure and stale-generation paths dispose
  the renderer and the constructed lights before returning.

### Testability seam (types.ts, runtime.ts)

- `mountTechniqueLab(container, options?: LabHostOptions)` with
  `groupLoaders` (default `import.meta.glob('./demos/group-*/index.ts')`,
  unchanged) and `createRenderer` (default real `WebGPURenderer`). Defaults
  keep production behaviour identical; the seams let the CPU suite drive the
  ACTUAL mount/switch/teardown code with a stub renderer.
- `LabRendererLike` structural interface: the host drives the renderer
  structurally (`init/setPixelRatio/setSize/render/dispose/backend/info`),
  which is exactly the surface the installed three 0.185.1 exposes
  (`src/renderers/common/Renderer.js` — `async init()`, `render()`,
  `renderAsync` deprecated r181; `src/renderers/webgpu/WebGPUBackend.js:88`
  — `this.isWebGPUBackend = true`).
- Exactly-once disposal, generation guards, dt clamp (0.1 s cap, NaN/negative
  rejected) — Meta's retained contracts, kept and now covered by tests.

## Focused checks (all green, exact commands)

```sh
npx tsc --noEmit -p scripts/technique-lab/host/tsconfig.host.json   # clean
node scripts/technique-lab/host/check.mjs                           # all pass
npx vitest run --config scripts/technique-lab/host/vitest.host.config.ts
# Test Files 1 passed, Tests 15 passed
```

`vitest.host.config.ts` + `host-behavior.test.ts` (owned paths, excluded from
the root suite's `src/**` include) exercise the real runtime module —
vite transforms its `import.meta.glob` (empty on this branch: the honest
pending path) — through a bounded fake DOM and a stub renderer with a manual
frame pump (no wall-clock timers). Falsifiers cover: throwing factory /
non-Group root / sourceId mismatch / throwing update / throwing dispose,
duplicate sourceId across groups, blocked-factory stripping, alias 21 flag,
`notDeliveredSourceIds` both directions, dispose-during-pending-import
generation guard, exactly-once dispose with no post-dispose frames, backend
honesty (WebGPU vs unknown from live flags), non-http sources unlinked, and
the fixed `LAB_SEED = 20260912` handed to factories.

Two host gaps the suite caught and the pass fixed: operational flags raised
during a mount now re-render the detail panel (not just badge + error box),
and hidden stage overlays no longer present stale text to readers.

## Root integration (root owns the actual render)

```sh
git cherry-pick 07a86d7e4806d7831242d6b8adf75b2bb9ffa913   # group-a (manifest 1-17, factory 1-14,16,17)
git cherry-pick b63f2e0539f01f8fb8335bd7b1c41976e9caf35a   # group-b (18-34, alias 21→19, notDelivered 20,27,28,29,31,34)
git cherry-pick 2b5c7e2111806e4ea6c43ba74969e9d8bbbfbd36   # group-c (35-50)
```

Groups land at `src/map3/technique-lab/demos/group-{a,b,c}/index.ts`, which
the host glob picks up with zero host changes (both `manifest` named export
and `export default` are supported by the groups; the host reads `manifest`).
Wire `map3.html` → `<script type="module" src="/src/map3/technique-lab/entry.ts">`
calling `mountTechniqueLab(document.getElementById('lab-root'))` plus
`<link rel="stylesheet" href="/src/map3/technique-lab/lab.css">`. Missing
groups are a pending state, never a build error.

## OPEN — browser matrix (not run here, CPU-only lane)

Rapid selection across all 17 mounted A/B/C rows, window resize at each,
failed-factory row, dispose-while-group-import-pending, and first
representative row per group in real WebGPU at 1280/390 widths. Not
self-certified; visual/FPS acceptance remains OPEN per handoff discipline.
