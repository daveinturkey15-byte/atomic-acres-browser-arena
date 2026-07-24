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

The graphics worktree was dirty and uncommitted at the start of this pass. This
branch therefore contains no edits copied from it. Final validation must apply
both patches to one clean tree and run the full release gates.

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
