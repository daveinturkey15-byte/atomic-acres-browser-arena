# Lane W — HF-410: viewmodel rework — fit the gun inside the player's body, stop clipping and stop the lift

Orchestrator: Claude Code (Fable 5.1). Ledger row HF-410 (read it; it has the
owner's words and what his two screenshots show).

Worktree: `C:\Users\david\projects\aa-claude-hf395` (Lane B's; B is merged)
Branch: `contrib/dave-gaming-pc/claude/hf395-396-viewmodel` — first run
`git merge 75a4e508` (the PASS 84 head) so you start from what shipped; every
diff in your report is against 75a4e508.

## The situation
Owner, after playing PASS 84 on Firing Range: clipping through walls and
floor, and the weapon being "held up" near walls, the floor and when prone,
is "super bad, needs a re work". His two screenshots: (1) against a wall the
rig is lifted to a near-vertical pose and fills the frame; (2) at a wall
corner the overlay paints the gun through the wall.

Source facts (verify, then measure):
- `HIP_VIEWMODEL_POSITION = { x: 0.34, y: -0.44, z: -1.08 }`
  (`src/weapon-presentation.ts` ~line 646). The standing capsule radius is
  `CHARACTER_PHYSICS_CONFIG.playerRadius` (~0.38 m, `src/physics.ts`); prone
  eye ~0.5 m, crouch eye ~1.16 m. The rig therefore extends roughly 0.7 m
  OUTSIDE the player's own collision body: any wall the capsule can stand
  next to intersects the weapon. That is the root cause. Everything below is
  a symptom treatment layered on top of it:
  - `VIEWMODEL_NEAR_PLANE_SAFE_RETREAT = 0.28`, `VIEWMODEL_WALL_PULLBACK_SCALE = 0.5`
    (HF-397, the owner asked for half), `VIEWMODEL_NEAR_PLANE_CLEARANCE = 0.06`;
  - the contact response (`viewmodelContactResponse`: additionalLiftMeters,
    additionalDropMeters, `VIEWMODEL_CONTACT_FOLD_MINIMUM_SCALE = 0.72`) = the
    "holding it up" pose the owner hates;
  - `src/systems/viewmodel-surface-clip.ts`: 6 clip planes, 0.012 m bias, a
    ground plane with a 0.15 m minimum drop (Lane B, PASS 84);
  - the viewmodel draws on a depth-cleared overlay (so it paints over any
    world geometry it is inside) scaled by `viewmodelViewportScale(aspect, fov)`.
- Instruments: `scripts/qa/measure-viewmodel-penetration-cdp.mjs` (walks every
  visible viewmodel vertex; rows carry `valid`; use port 41942), Lane B's
  evidence under `docs/pass84-evidence/hf395-396/`, screenshots per pose.
- Gates to keep green or re-pin WITH THE REASON (an owner-directed rework is
  not a weakened gate): `src/weapon-presentation-anatomy.test.ts`,
  prone-contact `nearPlaneClear`, fire-kick clearance,
  `src/pass70-weapon-contact-scope*.test.ts`, `src/weapon-presentation-state.test.ts`,
  the ADS/optic clearance tests, and the pipeline tripwire
  (`scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`,
  0 in-combat creations: a clipping-state change once recompiled every
  weapon material and froze the game).

## The rework (in order; measure at every step)
1. MEASURE the rig's world-space bounds per weapon at hip and ADS (maximum
   forward, lateral and downward extent from the eye) for the largest
   weapons (LMG, minigun, launcher, sniper, shotgun) and the smallest; table
   them against the capsule radius and the prone and crouch eye heights.
   Record the BEFORE penetration table on atomic-acres, test1 and test2.
2. FIT THE RIG INSIDE THE BODY: choose a viewmodel placement and scale, with
   a dedicated viewmodel field of view for the overlay camera (the standard
   "viewmodel FOV" technique), such that every weapon's bounds stay inside
   the standing capsule radius minus a margin at hip AND at ADS, and above
   the floor at crouch and prone eye heights, while on-screen framing (how
   much of the gun is visible, where the sights sit for ADS) stays as close
   as possible to today's. Prove the framing with side-by-side captures per
   weapon. Prone is a compact, flat, close hold, never a vertical lift.
3. With the rig inside the body, REMOVE the contact lift (or cap it near
   0.03 m) and set the wall pullback to zero or near zero; keep the clip
   planes only as a last-resort safety net and prove they no longer engage
   on standard poses (activeClipPlanes 0 in telemetry on open ground, near
   walls and in corners).
4. The overlay: with the rig inside the body there is no wall inside the
   body for it to paint over. Verify on the owner's exact cases (wall corner,
   wall on the right while strafing, garage door, bus/van gap) with the
   instrument AND screenshots.
5. AFTER penetration table; pipeline tripwire; `npx tsc --noEmit`; the
   focused tests above re-pinned with a comment citing HF-410; commit per
   step with explicit paths. Evidence under `docs/evidence/pass85/hf410/`.

## Boundaries
- You own: `src/weapon-presentation.ts`, `src/weapon-presentation-state.ts`,
  `src/systems/viewmodel-surface-clip.ts`, the viewmodel modules, the overlay
  camera and FOV code (its `src/legacy-main.ts` region only, `// HF-410:`
  marks, LF preserved), the penetration instrument, the tests named above.
- Do NOT touch the weapon GLBs or their generators (Lane B re-exported them
  today; if a model's authored origin makes fitting impossible, put the exact
  generator patch in the report), arenas, lobby/netcode, damage or hit
  registration.
- Machine rules: headless only (a guard kills headed browsers), one browser,
  one build, never kill processes you did not start, never the full vitest
  suite, 3 GB free VRAM before a launch.

## Report
Bounds table per weapon before/after against the capsule; penetration table
before/after; framing captures per weapon (hip, ADS, crouch, prone, wall,
corner, floor); which symptom layers were removed; tests re-pinned and why;
tripwire result; commits. Claim-state every line.

## ADDENDUM (orchestrator, 17:10 BST) — the solver cost is yours too (HF-399 residual)
Lane A measured (2026-09-02, quiet machine, corrected for profiler inflation):
`WeaponPresentation.update` is ~22% of a profiled frame, dominated by
`solveRiggedArms` (~8 ms profiled / ~4.5 ms real) plus `applyModelMatrixFreeze`
(the freeze-on-transition patch already shipped in PASS 84). Root causes Lane
A named but could not patch (your file): `solveRiggedArms` calls
`activeModel.getObjectByName` for 'grip-socket-r' / 'support-socket-l' /
'reload-socket-l' / 'muzzle-socket' per arm per frame, and the arm IK's
`updateWorldMatrix(false, true)` subtree walks bypass the static-matrix
freeze (census: ~17,500 updateWorldMatrix and ~10,000 getObjectByProperty
calls per frame on a 10,275-node scene). While you are reworking the rig:
cache the socket lookups per rig (invalidate on weapon/model change), and
stop the per-frame subtree walks from touching frozen nodes. Measure before
and after with Lane A's instruments (`scripts/qa/hf399-frame-anatomy-cdp.mjs`
call census and the cpuprofile inclusive tool under
`docs/pass84-lanes/hf399-lane-a-evidence/`); report ms/frame and the census
delta. The owner reads 63-70 fps on Firing Range at 1440p after PASS 84 and
says fps "feels off"; this is the largest single lever left on the main
thread.
