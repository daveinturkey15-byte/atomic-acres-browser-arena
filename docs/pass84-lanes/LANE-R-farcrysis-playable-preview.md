# Lane R — Farcrysis playable PREVIEW: spawns, collision sanity, vegetation, unhide behind the gate

Orchestrator: Claude Code (Fable 5.1). Owner asks (2026-09-02 07:05, 07:07,
08:40, 13:55): "fixing/integrating the Farcrysis map", "will the next live
version have improved ... Farcrysis". Lane C fixed the LOAD PATH only
(farcrysis now admits in 63-67 s, 0 in-combat pipelines) and kept
`selectable: false`. This lane makes it playable as a PREVIEW card.

Worktree: `C:\Users\david\projects\aa-farcrysis-load` (Lane C's, C is finished
and repaired; continue on its branch)
Branch: `contrib/dave-gaming-pc/claude/farcrysis-load-fix` (base e046c130)

## Facts
- Read Lane C's `artifacts/lane-report.md` and `artifacts/lane-verdict.md`
  first: root causes (three r185 InstancedMesh uniform-array path baking
  capacity into WGSL; ~59 full-PBR pipelines at 530-710 ms each), the
  `// FARCRYSIS-LOAD:` block in `src/legacy-main.ts`, the probe
  `scripts/qa/probe-farcrysis-boot-cdp.mjs`, and the note that in-combat
  frame pacing on farcrysis is poor headless (10-30 fps at 1600x900 with
  ComfyUI sharing the GPU) with no pipeline creations to blame.
- Known state of the arena: vegetation is poor (dense but cheap), water is
  the shared ocean system (crest foam numerically unreachable; not yours),
  terrain-vs-collision mismatches were reported historically, a NaN index
  bug was fixed with an index-bounds test. Older branches (hermes/pass69,
  jigglyclaw/pass69, hotfix/pass80) hold nothing the current tree lacks
  (Lane C checked file sets).
- The unhide gate: `scripts/qa/verify-player-path-cdp.mjs` needs the real
  menu card; the publish script's farcrysis-hidden guard must be updated
  deliberately (Lane F/Q own `publish_pass84.py`; if unhiding needs a guard
  change, put the exact patch in your report rather than editing it).
- Hardcoded arena rosters in gates went green while never looking at new
  arenas; every roster must derive from the registry.

## Job
1. Frame-time first: measure farcrysis in-combat frame time headless
   (rAF/canvas cadence, `--disable-frame-rate-limit --disable-gpu-vsync`)
   against atomic-acres under the same load; attribute the gap (draw calls,
   instances, overdraw from vegetation, shadow cascades) and cut it to
   within ~1.5x of atomic-acres by LOD, culling, instance sharing, shadow
   caster culling. Keep 0 in-combat pipeline creations.
2. Spawns: author a real spawn table with Lane D's constraint set (POI
   proximity, inside the playable envelope, cover, team separation) and the
   solver; verify with a headless deploy + respawn sample and screenshots.
3. Collision sanity: sweep the terrain and the main props with the eye
   clearance and traversal instruments; fix real clips; no invisible walls
   on the beach and jungle routes.
4. Vegetation: replace the cheap density with the owner's technique
   (3-blade Bezier tufts with LOD and an SSS term, instanced; ridged-FBM
   backdrop) within the frame-time budget from step 1. Compare frames.
5. Unhide as PREVIEW: `selectable: true`, card labelled preview,
   `multiplayer: false` for now, registry-derived rosters see it, the boot
   smoke and menu-preview verifier pass for it, and the unhide gate
   `verify-player-path-cdp.mjs` runs and passes headless.
6. `npx tsc --noEmit`; focused tests; commit per step with explicit paths.

## Boundaries
- You own: `src/rendering/arenas/farcrysis*`, farcrysis spawn table, the
  farcrysis row in `src/map-selection.ts` and `src/rendering/art-direction.ts`,
  farcrysis instruments and tests. `src/legacy-main.ts` only inside the
  farcrysis/arena-load region with `// FARCRYSIS-LOAD:` marks, LF preserved.
- Do NOT touch: other arenas, water constants, viewmodel, thermal, lobby/
  netcode, publish scripts (patch in report), the 12 s fence.
- Machine rules: headless only (never a visible window; a guard kills
  headed lane browsers), one browser, one build, never kill processes,
  never the full vitest suite, 3 GB free VRAM before a launch.

## Report
Frame-time before/after vs atomic-acres, spawn table evidence, collision
fixes, vegetation frames compared, gate results for the unhide, publish-guard
patch if needed, commits. Claim-state every line.

## ADDENDUM (orchestrator, 22:30 BST 2026-09-02, HF-423) — unshelved; ship as PREVIEW in PASS 87
The owner: "get farcrysis sorted overnight too after nuke town and raid". Base is
the current integration head (PASS 85 live + Lane W + the FARCRYSIS-LOAD pattern
from Lane C, evidence under docs/evidence/pass84/farcrysis-load/). Read Lane C's
report first; its admission fix is on the line, so start by MEASURING cold
admission on Quality headless at this head (three runs, quiet machine), then
close whatever still fails the fence by compiling LESS (shared materials, fewer
permutations, prewarm scoped to the arena) - never by widening the fence. Then
the Lane P/U registration trail (spawn table from the solver, spawn-quality gate,
eye-clearance stages 1-3 measured, collider/visual parity, menu preview through
the sanctioned generator, art-direction row above the floor), the art gaps to a
clean first pass (memory atomic-acres-art-lighting-direction records why it was
hidden), and the flip to `selectable: true` labelled PREVIEW. The publish guard
change is NOT yours: put the exact patch to scripts/orchestration/publish_pass87.py
(farcrysis-unselectable guard -> admission-evidence guard reading your receipts)
in the report. Full `npx vitest run` once at the end (publish candidate). Target
merge-ready by 04:30; say honestly if not.

