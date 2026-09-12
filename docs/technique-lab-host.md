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

---

# Increment after `2ec5721` — source evidence + stage framing (2026-09-12, GLM MAX continuation)

Branch `contrib/dave-gaming-pc/omp/technique-host-quality-20260912`, base
`2ec572171dae05f18dc050b0bded382ecde3d5e2` (prior `30740ea` + `2ec` retained).
Owned paths only: `src/map3/technique-lab/{runtime,types,lab.css}`,
`scripts/technique-lab/host/{check.mjs,host-behavior.test.ts}`,
`docs/technique-lab-host.md`. `manifest.ts` intentionally unchanged (alias 21
stays 19; no duplicate credit). Entry/favicon untouched (root's).

## Priority 1 — source evidence UI (research records are now wired)

- **False heading removed.** `Sources (links only, never fetched)` was false —
  research records prove URLs were actually read. Now:
  `Sources (links only; the host never fetches them — research reads are
  recorded below where they exist)`. Equivalent to root's fix, plus a
  regression test (honest text present, false text absent).
- **Title mismatch downgraded to informational.** A demo title differing from
  the public catalog title is provenance detail, not a load failure: it lands
  in a new `record.notices[]` (amber in the Notices list), `statusText` keeps
  `implementation loaded`, and the gallery badge stays `loaded`. Only a
  metadata `sourceId` mismatch remains an operational alert. Matches root's
  correction; regression-tested (status line + badge class asserted).
- **Real research records drive the stages.** New injectable seam
  `LabHostOptions.researchLoaders` (default
  `import.meta.glob` over `docs/technique-lab/group-*/SOURCE_RESEARCH.json`,
  empty in this isolated tree = honest "No research records loadable").
  Heterogeneous real schemas validated: group A/B `records[]` and group C
  `rows[]`; `pin`/`canonical` pins, 40-hex git sha, `committed` dates,
  `readDepth`, `filesRead`, `carrierReadComplete`, `licence`,
  `methodExtracted`/`method`/`decision`/`methodConsumer`. Rows without a
  usable `sourceId` are counted, never guessed; duplicate sourceIds keep the
  first record; malformed/failed files are reported and their stages stay
  open. `Source inspected` / `Technique extracted` flip only on recorded
  evidence; the summary line reports exact counts.
- **Claim separation is explicit.** A new "Research records" panel shows
  per-source pin/sha/date/evidence-kind; `cpuCheck`/`cpuChecks`/
  `pixelValidation`/`renderedAcceptance` render as "group-authored record
  assertions — not machine-checked test receipts in this lane".
  `Result tested` stays OPEN until a machine-checked test receipt matches the
  source (none exist in this lane); visual/FPS acceptance stays with the
  owner. Nothing is inferred from URLs, HTTP 200s or a mounted factory.
- No private Windows paths are ever rendered (root's frozen
  `research-manifest.json` snapshot paths stay in the packet; the runtime
  loads only repo-relative group files). Evidence links remain the existing
  http(s)-validated sources; non-http stays unlinked text.

## Priority 2 — stage quality mechanisms (code-level; root owns pixel proof)

- **Visible-geometry framing.** `boundedBoundingSphere` now bounds only
  VISIBLE geometry (`traverseVisible`): invisible helper objects no longer
  inflate the fit (captured symptom: small content lost in a huge stage).
- **Pure, tested fit math.** New exported `computeFrameFit(box, fov, aspect)`:
  fits BOTH frustum extents, margin 1.2→1.1, shape-adaptive elevation
  (height ratio <0.15 → 50° from above; >1.2 → 25°; else 35°), targets the
  real bounding centre, near/far finite and clamped (radius clamped to
  1e-3..1e4). Returns null for empty/degenerate/NaN bounds → `homeCamera`.
- **Resize refits once** (aspect change invalidates the horizontal fit);
  Recenter unchanged; still once-per-mount, never per frame; no per-frame
  allocations added (fit runs per mount/Recenter/resize only).
- **Neutral background.** Scene clear colour `0x0a1113` → `0x22262c` (neutral
  dark slate) so dark silhouettes (sources 18/38) separate from the backdrop
  without blowing white/gray planes (source 23) and without imposing game
  global lighting; host light rig intensities unchanged.
- **Optional comparison legend.** `DemoMetadata`/`DemoManifestEntry` gained
  optional validated `comparison: { control, technique, controlPosition? }`.
  The stage overlay renders ONLY demo-provided labels (never invented
  left/right meanings); absent → hidden; malformed → entry rejected with
  `bad comparison` (nothing fabricated). Existing groups are read-only and
  unaffected.
- **`clampDelta` extracted** (exported, pure): finite/negative → 0, >0.1 s →
  0.1 s; the loop uses it. Covered directly by tests.

## Priority 3 — lifecycle honesty retained

All 15 prior falsifiers pass unchanged (throwing factory/non-Group root/
sourceId mismatch/throwing update/throwing dispose/duplicate
sourceId/blocked-factory stripping/alias 21/notDelivered both
directions/dispose-during-pending import/exactly-once dispose/backend
honesty/non-http sources/fixed seed/pending path). One host renderer, one
RAF; no double disposal; generation guards intact; no A/B/C demo or research
doc writes; no shared control/registry writes.

## Focused gates (all green, exact commands)

```sh
npx tsc --noEmit -p scripts/technique-lab/host/tsconfig.host.json   # clean
node scripts/technique-lab/host/check.mjs                           # 64/64
npx vitest run --config scripts/technique-lab/host/vitest.host.config.ts
# Test Files 1 passed, Tests 28 passed (15 retained + 13 new)
```

## Root cherry-pick / conflict instructions

Root already fixed the heading + title-mismatch false error in ITS runtime
(`a4e50f519…`). Cherry-picking this increment onto that line WILL conflict in
`runtime.ts`. Resolution rule: take THIS increment's structure (notices array,
`stagesFor(record, evidence)`, research panel, framing block) — it is a
superset; root's heading/title intent is preserved verbatim in behaviour.
Specifically:

- `renderDetail`: replace root's heading/status lines with this version
  (honest heading, `record.alerts > 0` load-issue condition, Notices list
  split into `tl-fault`/`tl-notice`, new Research records panel).
- `refreshGroups`: title-diff must go through `addNotice(record, …)`, not
  `record.problems.push(...)`; keep root's other adoption guards as-is.
- Framing: take this `frameSelection`/`computeFrameFit`/`visibleGeometryBox`/
  `boundedBoundingSphere`/`clampDelta` block wholesale; keep
  `homeCamera` and the `[hemi, dir, ambient]` dispose loops (check.mjs
  asserts their exact shape).
- `createState`: take `0x22262c` background + `notices`/`research`/
  `comparisonLegend` fields.
- `types.ts`: take `DemoComparison` + optional `comparison` +
  `researchLoaders` (comment must not contain the `*\/` sequence — tsc).
- `check.mjs`/`host-behavior.test.ts`/`lab.css`: take this version whole.

After resolution: `npx tsc --noEmit -p scripts/technique-lab/host/tsconfig.host.json`,
`node scripts/technique-lab/host/check.mjs`, `npx vitest run --config
scripts/technique-lab/host/vitest.host.config.ts` must stay green; entry.ts/
map3.html/favicon remain root's.

## OPEN — admissions and limitations

- No GPU/browser capture in this lane: all framing/contrast changes are
  code-mechanism only, verified by focused tests and text integrity. Prior
  captures were taken BEFORE 2ec's framing/ambient work and before this
  increment; no screenshot after this code exists. Root tests real pixels.
- `Result tested` is OPEN by design everywhere (no machine-checked per-demo
  test receipts exist in admissible records; research `cpuCheck`-family
  fields are assertions, not receipts). Visual/FPS acceptance OPEN (owner).
- `docs/technique-lab/group-*/SOURCE_RESEARCH.json` are not in this isolated
  tree; behavioural tests inject bounded real-shape fixtures modelled on the
  actual group A/B/C files read at
  `aa-technique-{a,b,c}-20260912` (A `records[]`+pin+`methodExtracted`,
  B `records[]`+`canonical`+`method`+`status`, C `rows[]`+`decision`+
  `carrierReadComplete`). Root's merged tree will exercise the real glob.
- Outside-lane AKP audit REDs (stale Antigravity receipt on
  dave-gaming-pc, several quarantined jigglyclaw receipts) remain OPEN —
  other harnesses' registry hygiene, not this lane's to write.
