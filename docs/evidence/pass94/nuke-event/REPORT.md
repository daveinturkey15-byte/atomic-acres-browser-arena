# Pass 94 Nuke Town event report

Date: 2026-09-04
Owner request: HF-490
Worktree: `contrib/dave-gaming-pc/claude/nuke-event`

## Result

`src/nuke-event/` adds a presentation-only Nuke Town horizon cloud and a
deterministic match-end detonation. The background is one 40-step ray-marched
TSL volume over a distant box. The event reuses that same volume graph for its
flash/fireball/stem/cap timeline. The ground shockwave is one separate
alpha-noise TSL ring. No full-screen pass, render target, collider, spawn or
gameplay authority was added.

The event is active only when the selected arena is `nuketown2`; the persistent
background mesh remains in the scene but is hidden for every other arena.

## Claim-state ledger

| Claim | State | Evidence / remaining falsifier |
|---|---|---|
| Timeline has flash, rising, dissipating and complete phases at 0/1/25/60 s. | **VERIFIED** | `src/nuke-event/nuke-event.test.ts`; pure timeline tests pass. |
| Multiplayer admission uses a replicated ended snapshot timestamp, not a local timer. | **VERIFIED** | `deriveNukeEventTriggerFromReplicatedState` and the single `legacy-main.ts` end hook are covered by the focused tests. |
| QA/debug trigger is exposed through the existing QA surface. | **VERIFIED** | `window.__ATOMIC_ACRES_DEBUG__.triggerNukeEvent()` is wired and source-pinned. |
| Exactly two new pipeline families exist. | **VERIFIED** | `NUKE_EVENT_PIPELINE_IDS` has exactly two entries; one shared volume graph plus one ring graph. |
| Both new families are menu-time prewarmed. | **VERIFIED** | `nukeEvent.prewarm(...)` is in the existing menu-time `nuke-overdrive-bolts` group and the compatibility prewarm path. |
| Per-instance data is uniform-only and live update is allocation-free. | **VERIFIED** | Focused source contract checks uniforms, rejects instanced attributes, and checks the `update` body for allocations. |
| `legacy-main.ts` stays below its ratchet ceiling. | **VERIFIED** | 37,371 lines, equal to the existing 37,371-line ceiling; ratchet test passes. |
| Background cost is at or below 0.6 ms p50. | **DESIGNED; OPEN capture** | Budget model is 40 steps × approximately 9% projected horizon coverage (about 3.6 full-frame-equivalent step layers), with three cheap trigonometric noise bands and no post pass. The defensible design estimate is **0.42 ms p50** on the target desktop, but this run did not use a browser or GPU. An exact-SHA native-WebGPU capture remains required. |
| Cloud silhouette, fireball colour, haze drift and sun response meet owner taste. | **DESIGNED; OPEN capture** | Deterministic review cameras and shader contracts exist; visual capture/HITL is intentionally not run under the no-browser/no-GPU constraint. |

## Exact QA trigger

After selecting **Nuke Town Rebuild**, run:

```js
window.__ATOMIC_ACRES_DEBUG__.triggerNukeEvent()
```

For a repeatable fixed host-time sample, use an explicit non-negative host
timestamp:

```js
window.__ATOMIC_ACRES_DEBUG__.triggerNukeEvent(250000)
```

This is a local QA presentation trigger only. Multiplayer never calls it; the
automatic path accepts only `{ phase: 'ended', snapshotHostTimeMs }` from the
replicated lobby state.

## Nuke Town review stations

The cloud is at world `[0, 112, 680]`, down the +Z horizon direction. All three
stations use a 900 m far plane.

| Station id | Camera position | Target | Purpose |
|---|---:|---:|---|
| `nuketown2-nuke-street` | `[0, 2.4, -3]` | `[0, 112, 680]` | Street sightline |
| `nuketown2-nuke-north-balcony` | `[9.5, 1.75, -27.5]` | `[0, 112, 680]` | North-house balcony sightline |
| `nuketown2-nuke-south-balcony` | `[-9.5, 1.75, 27.5]` | `[0, 112, 680]` | South-house balcony sightline |

The balcony X positions are derived through `nuketown2HandedX`; the south
station is the rotational partner of the north station. The layout bounds and
handedness source are `src/nuketown2-layout.ts`.

## Source and budget notes

The requested local snapshot `docs/threejs-knowledge/upstream/llms-full.txt`
was not present on this branch. Following the source-priority rule, the
implementation was checked against the installed `three@0.185.1` source and
`node_modules/three/examples/jsm/tsl/utils/Raymarching.js`, plus the existing
TSL volumetric pattern in `src/map3/corridor-volume.ts`. No browser, preview
server, GPU workload or external asset was used.

The existing camera-shake trauma path already includes the `nuke` source and
the fixed substep/gap clamps. The event adds one nuke trauma impulse through
that path; it does not alter the shake thresholds or tests.

The branch's copy of `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` did not contain
literal rows named HF-481, HF-490 or HF-491. The current direct HF-490 request
was therefore treated as the authoritative task input, while HF-472's
re-implementation rule and HF-491's low-clutter/cheap-effect requirement were
applied here.

## Checks

**VERIFIED**: `npx tsc --noEmit` passed.
**VERIFIED**: `npx vitest run src/nuke-event/nuke-event.test.ts src/legacy-main-size-ratchet.test.ts`
passed: 2 files, 13 tests.
**VERIFIED**: requested regression command passed: 5 files, 64 tests
(`nuke-event`, legacy size ratchet, Nuke Town fidelity, collider/visual parity,
graphics profile).
**VERIFIED**: `git diff --check` passed and `legacy-main.ts` remains exactly
37,371 lines.
**OPEN**: `npm run lint` reached TypeScript and worker checks but its text
integrity output reported `ok:false` for the pre-existing tracked empty file
`docs/evidence/pass94/nuketown2-ballistics/gate-tsc.txt` (0 bytes in both the
worktree and `HEAD`). This lane did not alter that unrelated evidence file.
**OPEN**: the WebGPU frame-pacing policy self-test reports a pre-existing
repository finding: `repository source audit failed: match admission must not
regress to a raw whole-scene WebGL2 compile`. This lane did not weaken or edit
that fence.
**OPEN by constraint**: browser menu-lifecycle, multiplayer-lifecycle and
hardware frame-pacing captures were not run because this task explicitly
forbade browsers and GPU use.
