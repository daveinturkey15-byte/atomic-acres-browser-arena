# Pass 62 gameplay reconciliation

Date: 2026-07-24

## Release baseline

- Production / `origin/main`: `11f6141a463d0994c2fa22fd0addb55b55c9288a` (Pass 61).
- Production verification run: `30062804087` (success).
- Production release run: `30062926359` (success).
- Pages deployment run: `30063000076` (success).
- Concurrent graphics worktree: `atomic-acres-pass62-graphics-refinement-20260724`.
- Concurrent graphics branch: `contrib/dave-gaming-pc/codex/pass62-graphics-refinement`.
- Gameplay worktree: `atomic-acres-pass62-gameplay-20260724`.
- Gameplay branch: `contrib/dave-gaming-pc/codex/pass62-gameplay-reconciliation`.

The graphics worktree was dirty and uncommitted at the start of this pass, so
gameplay work proceeded independently until both sides had a reviewable
checkpoint. Graphics was then committed as
`edd1276` (`feat: prepare Pass 62 graphics refinement HITL build`) and merged
deliberately into gameplay checkpoint `4a1f181`
(`feat: reconcile Pass 62 gameplay HUD and arena fixes`). The resulting tree is
the single Pass 62 integration candidate; no production deployment is
authorized from this contributor branch.

## Reconciliation result

- Gameplay, HUD, map, netcode, and lobby changes share one branch with the
  WebGL/shader, selective-bloom, adaptive-effects, and compressed-asset work.
- `src/main.ts` keeps the graphics refinement bootstrap and streaming path while
  prewarming Overdrive only after the final scene materials are installed.
- The Pass 62 changelog is one combined gameplay-and-graphics entry.
- Atomic Acres' regenerated `.blend` and runtime GLB have exact committed
  digests in the manifest and provenance record.
- Blender 5.1.2 produces semantically stable geometry/material/image counts but
  not byte-identical `.blend`/GLB output across clean authoring runs. Provenance
  therefore records exact committed hashes and does not claim byte determinism.

## Requirement ledger

| Area | Owner | Pass 62 contract | Verification |
| --- | --- | --- | --- |
| Private lobby | Gameplay | A ready host can start as the only human, with zero or hosted bots. Connected humans must still all be ready. | Unit + browser lobby flow |
| Sniper cadence | Gameplay | The next deadline is based on the actual admitted shot; late frames cannot create a rapid second shot. | Unit + served input probe |
| Damage numbers | Gameplay | Show raw critical damage and explicit overkill, for example `CRIT 201 · +101 OVERKILL`. | Unit + served bot headshot |
| Offline feel | Gameplay | Solo play does not record rewind history or wake replication at network frequency. | Unit + frame pacing sample |
| Quad spawn | Gameplay / graphics boundary | Quad materials compile against the real scene before play; first visibility must not trigger a shader hitch. | Debug prewarm receipt + forced-spawn frame sample |
| HUD | Gameplay | Non-support HUD is 25% smaller than the 1.35 desktop scale. Support is a 160 px narrow, tall five-row column with no text overflow. | Layout unit + multi-viewport E2E |
| Damage feeds | Gameplay | No persistent headings; outgoing/incoming rows appear only when events occur. | DOM + E2E |
| Team pings | Gameplay | No HUD, key bindings, world markers, or debug control. Old wire messages are ignored for compatibility. | Source/DOM audit |
| Atomic Acres bikes | Gameplay assets | Remove all low-quality bicycle presentation. | Unit + visual capture |
| Atomic Acres houses | Gameplay assets | Remove floating wall-art tiles, timber counter strip, and upper doorway lintel panels; preserve traversable openings. | Asset generation + route tests + visual capture |
| Rustworks ramp / containers | Gameplay map | Remove the 24-container perimeter wall and use four inner-yard cover clusters while keeping service lanes open. | Collision parity + route traversal + visual capture |
| Welsh flag | Gameplay assets | Four-legged passant red dragon with paired wings, horned head, claws, and forked tongue. | Asset audit + close visual capture |
| Skyline upper platform | Gameplay map | Add two physical kiosks without blocking the central mezzanine route. | Collision + route traversal + visual capture |
| Skyline apron | Gameplay map | Grey concrete apron and two large slatted wooden pallet stacks with matching authority. | Material/cover audit + visual capture |
| Skyline aircraft | Gameplay map | Boarding and cockpit routes contain no opaque door leaf or door panel. | Object absence + route traversal + visual capture |

## Reconciliation hazards

- `src/main.ts` is modified by both gameplay and graphics work. Resolve imports,
  bootstrap ordering, and the render loop deliberately; do not accept either
  side wholesale.
- `src/blender-environment.ts` and `src/rustworks-blender.ts` are graphics-owned
  except for any regenerated asset cache key required after this gameplay pass.
- Quad prewarming must run after graphics material refinement is installed, or
  the first selective-bloom shader variant can still compile at spawn time.
- Regenerated GLB and Blender provenance files must correspond to the exact
  generator/spec state committed on this branch.

## Falsifiers

- Any opaque rectangle still fills either upper house doorway in Quality.
- Any wall-art square, bicycle, or floating timber counter remains visible.
- A solo host cannot press ready and start.
- Two sniper shots can be admitted less than one configured interval apart.
- A lethal 201-damage sniper headshot displays only `100`.
- Forced Quad availability causes a long frame after the ready screen.
- Rustworks containers still form a continuous perimeter row or block a spawn.
- Skyline boarding/cockpit routes contain a visible door slab.
- Any substantial prop is visible without matching movement and shot authority.

## Integrated QA receipt

- Core release gate: TypeScript lint passed; gameplay baselines matched; 24
  asset digests matched; 106 unit files / 580 tests passed; leaderboard 27/27
  passed; public asset coverage 109/109 passed; release build passed; release
  tree contained 118 accepted files with no rejected or oversized candidates;
  production dependency audit reported zero vulnerabilities.
- Long combined gameplay browser run: 52/56 passed on the first serial run. The
  four failures were then resolved and passed individually: Quality/Performance
  profile sampling, headed field-kit persistence, third-person melee
  presentation, and the deliberately open upper-house entrance.
- Focused graphics/map browser gate: Pass 37 Quality authority and bounds 2/2
  passed; Pass 62 lazy compressed-arena streaming and bounded effect telemetry
  passed after allowing 30 seconds for a cold SwiftShader map transition.
- Live local PeerJS lobby gate passed for a ready solo host with zero bots, a
  ready solo host with four hosted bots, and the existing six-player/rejoin
  lifecycle.
- Fourteen final visual captures were inspected across Atomic Acres houses,
  Rustworks routes/flag, and Skyline concourse/apron/kiosks/aircraft. The
  capture completed with no page errors.
