# Night integration handoff — house presentation substitution, 2026-09-12

Lane `night-integration-20260912` · harness Claude Code · model `claude-fable-5-1` · effort `xhigh`
· machine `dave-gaming-pc` · worktree `C:/Users/david/projects/aa-night-integration-20260912`
· branch `contrib/dave-gaming-pc/claude/night-integration-20260912`.

| | SHA |
|---|---|
| starting head | `861b6680192c003ef6940d915b22e849b41d6589` |
| contains `origin/main` | `0dd95943e5eb4ac9cc0dd7c3a47baa2b338c7a88` (verified with `merge-base --is-ancestor`) |
| ending head | `861b6680192c003ef6940d915b22e849b41d6589` — **no commit was made**; the diff is left uncommitted for root |

**Repair pass 2026-09-12 (same lane, same head, still uncommitted).** A final bounded Fable pass
corrected the presentation lifecycle; see *Lifecycle repair* below. Everything else in this
document still holds.

**Not browser-accepted.** Nothing here was rendered. Every claim below is a CPU claim: Vitest in
Node with no WebGL, plus the shipped GLB bytes. The runtime GLB fetch/parse path was exercised
only through a deterministic stub shaped like the real loader. Browser QA is root's, recipe below.

## Changed files (all inside the allowlist)

```
src/world-studio/arena.ts                                  M   +17 lines, one import, one attach block
src/world-studio/blender-presentation/houses.ts            NEW presentation substitution module
src/world-studio/blender-presentation/houses.test.ts       NEW 16 CPU tests (12 + 4 lifecycle regressions)
docs/technique-lab/integration/HANDOFF.md                  NEW this file
```

Not touched: `assets.manifest.json`, registry, `architecture/house.ts`, `architecture/index.ts`,
`architecture/build.ts`, `houses/index.ts` (reused as-is), physics, spawns, colliders, shot
surfaces, navigation, lighting, interiors, the Skills Lab, any other lane.

## What the runtime now does

`buildWorldStudio` builds the procedural arena exactly as before. After `solids`,
`shotSurfaces`, `physicsColliders`, `breakableWindows`, the bot step set and `raycastMeshes`
are final, it calls `attachHousePresentation({ architectureRoot, breakableWindows, raycastMeshes })`
and adds the returned root (`world-studio-house-presentation`) immediately. The root is
`visible = false` from creation: the loader attaches each GLB as its own load resolves, so shells
may sit inside it while pending, but nothing renders until the aggregate decision (pending-root
rule, below). `root.userData.worldStudioHouseStatus` is `'loading'` at build.

`attachHousePresentation` wraps the audited loader `createStudioHouseShells` from
`src/world-studio/houses/index.ts` without changing it: same URLs
(`assets/world-studio/blender/houses/house-{teal,yellow}-shell.glb`), same placements
(`[-20,0,0]` / `[20,0,0]`, no yaw), same `auditShell` (16 treads, 7 partitions, 9 cased
openings, 26 apertures, 3 route landmarks, bounds, road gap, pane identity). Then, per house:

| condition | result |
|---|---|
| load rejected (`Promise.all` fails on the first bad load) | status `failed: <error>`, both outcomes `load failed`, nothing hidden; the loader is disposed **once**, which releases any shell that had already attached and makes a load that completes later be released by the loader instead of attached; root stays invisible and empty |
| load resolved, no audit | outcome `load resolved without an audit`, nothing hidden |
| audit `passed === false` | that house's outcome carries the audit failures; its GLB scene is set invisible and **detached** from the root but **not** released: it stays in the loader's `loaded[]` and the loader's `dispose()` releases it exactly once later; its procedural art stays visible |
| audit `passed === true` | that house's `world-studio-<houseId>-*` merged meshes are set `visible = false` **except** the dynamic glass panes (below); visible opaque GLB meshes join `raycastMeshes`; outcome `substituted: true` |
| all decided | root becomes `visible = true` only if at least one house substituted; otherwise it stays invisible |

Hiding is never global and never happens before `ready`. Nothing procedural is removed or
disposed; the hidden list is kept so `dispose()` restores every node. `dispose()` is idempotent,
retires the generation (a load resolving afterwards is released by the loader, not attached, and
cannot hide anything), hides the root, removes the GLB meshes it added to `raycastMeshes`, and
asks the loader to dispose at most once per generation. The arena root's `removed` event calls
it, and a `ready` that lands after the root left the scene calls it. `ready` never rejects; a
failure is an outcome, so no unhandled rejection reaches the console.

## Lifecycle repair (final bounded pass)

Defects found in the first version and corrected here, smallest change each:

1. **Pending-root rule.** `attachHousePresentation` exposes the loader's own group, and the loader
   attaches each GLB the moment its individual load resolves. A teal shell could therefore render
   over the procedural teal house while yellow was pending or about to reject. Now the root is
   `visible = false` from creation and is revealed only after the aggregate decision, and only
   when at least one house passed. No pending or failed GLB is ever visible.
2. **Aggregate rejection disposes the loader once.** The rejection handler previously only
   recorded outcomes; an already attached shell stayed attached and a late second completion could
   still attach. It now calls the loader's `dispose()` through a once-guard (`releaseShells`), so
   the attached shell is released and the loader's own `disposed` flag makes it release the late
   completion. The handle's `dispose()` uses the same guard, so it never asks the loader twice, and
   the redundant loader-dispose call in the chained completion path was removed.
3. **Single resource owner.** The audit-failure branch used to call an integration-layer
   `releaseSubtree(scene)` and then the loader's `dispose()` released the same `loaded[]` entry
   again: a double free of geometry/material/texture. `releaseSubtree` is deleted from
   `blender-presentation/houses.ts`. The integration layer now only detaches and hides; the
   loader in `houses/index.ts` (unchanged) is the sole disposer and releases each resource exactly once.
4. **Substitution behaviour preserved.** Audit-passed opaque GLB meshes still join the raycast
   list, procedural nodes hide only after audit, the dynamic panes remain visible and
   authoritative, GLB glass stays hidden, and dispose restores procedural nodes and removes the
   raycast meshes. No gameplay array is derived from geometry.

Disposal ownership, stated once: **`createStudioHouseShells` owns every loaded scene, attached or
late, and its `dispose()` is the only code that calls `geometry/material/texture.dispose()`. The
presentation layer toggles `visible`, detaches, and calls that `dispose()` at most once.**

The stub in `houses.test.ts` was extended to model the real loader more faithfully: per-shell
`attach()` before the aggregate `settle()`/`reject()`, real resource release on `dispose()` and on
a post-dispose arrival, and a `dispose`-event counter per geometry/material/texture. The four new
tests fail against the first version (root visible while pending; loader never disposed on
rejection; yellow resources disposed twice) and pass now. No existing assertion was loosened;
two were tightened (root invisible at build, exactly one loader dispose on rejection).

The attach is unconditional, not gated on `typeof window` like the hero vehicles: in Node the
real loader's fetch rejects and is absorbed as `failed:`, which the existing house tests already
relied on. If root prefers the hero gate for symmetry, it is a one-line move.

## Each house's status

| house | CPU audit of shipped bytes | runtime load + audit | procedural hidden | browser accepted |
|---|---|---|---|---|
| teal (`5,670,288 B`) | passes the 26 existing tests in `houses/index.test.ts` (unchanged) | **not exercised here** — only the stub path | only after a real passing audit in the browser | **no** |
| yellow (`5,644,996 B`) | same | same | same | **no** |

Both shells are therefore *wired and gated*, not *accepted*. The substitution tests prove the
gate's behaviour on the real architecture root, real solids and real dynamic glass registry,
with the loader replaced by a stub.

## Glass decision — GLB glass hidden, procedural dynamic glass authoritative

The houses handoff recorded that each GLB carries 22 `atomic_window_id` pane markers on **one**
glass mesh. One mesh cannot follow 22 independent break states, so a per-pane binding was
already unprovable. Reconciling the marker ids against the arena's real registry then found a
second, sharper mismatch:

* the arena registers **20** breakable windows per house, not 22;
* the two extra GLB markers per house are
  `world-studio-window:<houseId>-garage-east-garage-east-window-glass` and
  `world-studio-window:<houseId>-garage-west-garage-side-window-glass`;
* `house.ts:832-838` cuts those garage windows through `garageWall`, which emits apertures only
  and never a `-glass` part, so the procedural house has **no** pane there and the registry has
  no id to bind to. All 20 registered ids are named by the GLB (`unmarked: []`).

Decision, implemented and tested: on a passing audit every GLB glass mesh (identified by the
`atomic_material_slot === 'glass'` extra, a `-glass` name, or a transparent/no-depth-write
material) is set `visible = false`; the procedural pane meshes
(`world-studio-<houseId>-glass:<solid-id>`, the exact meshes in `breakableWindows`) are excluded
from the hide set and stay visible, transparent, `DoubleSide`, `depthWrite=false`, in the
dynamic registry and out of static physics as before. No opaque duplicate, no superposed pane,
no second window authority. The outcome exposes `glass.matched/unregistered/unmarked/glassMeshes`
and `authority: 'procedural-dynamic-glass'`, and the reason string counts the two unregistered
markers so browser QA can see it in `root.userData.worldStudioHouseOutcomes`.

Consequence to eyeball in the browser: the two garage windows per house show the GLB casing with
an empty aperture, exactly as the procedural house shows them today.

## Interiors — deferred

`world-studio-interiors-*` furniture is a different partition merged by material role with no
per-house split (`interiors/index.ts`), and no interior GLB has a proven anchor/footprint or
collider mirror. Nothing in this lane touches it; the test asserts every furniture node stays
visible after a substitution. The `world-studio.interiors.all` fallback of the visual contract
still applies and interior GLBs are **not** wired.

## Raycasts

`legacy-main.ts:4676-4694` filters invisible objects out of the knife/world raycast set, so the
hidden procedural house would have left it. Visible opaque GLB meshes are appended to
`raycastMeshes`, as the hero vehicles already are; the hidden GLB glass is not. Ballistic shot
authority (`activeBallisticSurfaces`, the Box2 solids) is unchanged. Open: impact decals will
land on the GLB's projecting trim, up to ~8 cm proud of the procedural collider face.

## Tests run

Repair pass (2026-09-12, after the lifecycle fix; exact commands, run from the lane):

```
node node_modules/vitest/vitest.mjs run --root . \
  src/world-studio/blender-presentation/houses.test.ts \
  src/world-studio/houses/index.test.ts \
  src/world-studio/arena.test.ts
→ first run: 3 files, 45 passed, 1 failed (a bug in the new test helper: merged watcher maps
  copied counts instead of sharing them; fixed in the test, not the module)
→ src/world-studio/blender-presentation/houses.test.ts rerun: 16 passed, 0 failed (37.3 s)
   (houses/index.test.ts and arena.test.ts had already passed in the first run and were unchanged)

node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
→ clean (no output)
```

Not run in the repair pass: the wider CPU set below, the full suite, any browser/e2e,
`pipeline:preflight` (dirty tree by design), Blender. Budget-bounded; nothing else was attempted.

First pass (before the repair):

```
node node_modules/vitest/vitest.mjs run \
  src/world-studio/blender-presentation/houses.test.ts \
  src/world-studio/houses/index.test.ts \
  src/world-studio/arena.test.ts \
  src/world-studio/architecture/studio-architecture.test.ts \
  src/world-studio/blender-assets/index.test.ts \
  src/world-studio/routing.test.ts \
  src/world-studio/weather-routing.test.ts
→ 7 files, 89 passed, 0 failed (27.3 s)

node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
→ clean
```

The new file's 12 tests: both final URLs/placements/byte sizes; the 22/20/2 pane reconciliation
against the real arena; presentation root present and empty with nothing hidden at build; disposal
on arena-root removal; success hides only the passing house and retains its 20 panes while the
failed house and all furniture stay visible and every solid/collider/window/spawn/route array is
deep-equal to its pre-attach snapshot; the explicit glazing decision; load rejection; load without
audit; load-after-dispose and repeated dispose; restore on dispose; stale generation cannot hide;
static scan that the module names no authority. The first version of the reconciliation test
asserted all 22 ids bind; it failed on the real registry and was corrected to assert the measured
state exactly, not loosened.

Not run: the full suite, any browser/e2e, `pipeline:preflight` (dirty tree by design), Blender.

## Root browser-QA recipe (not run here)

1. Serve the candidate, open World Studio (`Nuke Town · New World`) in Quality and Performance.
2. In devtools: `arena.root.userData.worldStudioHouseStatus` must read `ready`, and
   `worldStudioHouseOutcomes.teal/yellow.substituted` must be `true` with reason
   `... 20 marker(s) bound, 2 unregistered pane marker(s)`. Any `failed:` or `substituted:false`
   means the procedural house is still showing; read `.reason`.
3. Capture from `STUDIO_REVIEW_CAMERAS` (`layout.ts:10-17`): `street-hero`, `teal-front`,
   `yellow-front`, `teal-yard`, `yellow-yard`, `layout`, plus the architecture review points in
   `root.userData.worldStudioReviewPoints` (interior stair/living). Compare against the procedural
   frames from the same cameras with the presentation disposed
   (`arena.root.userData.worldStudioHousePresentation.dispose()` restores the procedural house).
4. Look for: doubled walls (a procedural node not hidden), missing interior partitions or stair
   (a hide without the wave-3 interior), z-fighting at any pane (GLB glass not hidden), the two
   empty garage windows, decal offset on trim, furniture still present.
   Pending-root check: throttle the network so one GLB lands seconds before the other; during
   that window `worldStudioHouseStatus` must still read `loading`, the presentation root must be
   `visible === false`, and no GLB or doubled wall may be visible. Block one GLB (404) and confirm
   both procedural houses stay, the root stays invisible/empty, and no late GLB appears.
5. Shoot a pane and confirm it breaks and the GLB shows the hole; repair and confirm it returns.
6. Run the `studio-architecture` route probes with the shells visible (houses falsifier 2).

## Open items

* Browser acceptance, captures and the env/PMREM glass response: not done, root-owned.
* The 22-vs-20 pane mismatch: either the GLB drops its two garage pane markers, or `house.ts`
  glazes the garage windows and the registry grows to 22. Both are decisions outside this lane.
* Per-pane GLB glass would need one glass mesh per pane plus a break projection; not attempted.
* Interior two-tone material, baluster counts and wood treads remain the houses lane's items 3/10.
* Interiors GLBs deferred; procedural furniture retained.
* `pipeline:preflight`/`handoff` receipts: not produced (uncommitted diff, as instructed).
