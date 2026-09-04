# Pass 84 owner feedback ledger — 2026-09-02, received ~06:50 BST (OMP session)

Owner directive: log every request before acting (OMP sessions are not
persistent). This file is the durable row home. Graph projection into
`PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json` is queued as process work: the
gate validates chat-source entries against a strict raw-text + atom-counted
projection schema, and a hand-built projection risked breaking a green gate;
each row below carries its stable HF id and falsifier so the projection can
land without information loss.

Also received and logged (release policy, not a defect): **when the next pass
pushes, pin the then-current live version (PASS 83) as the sole safe backup and
remove every older version from the chooser and gh-pages.** Implemented in
`scripts/orchestration/publish_pass84.py` with the predecessor guard relaxed
from two recent predecessors to one pinned backup at the owner's direct
instruction, and the in-build fallback re-pinned to the backup.

## HF-395 — viewmodel still clips walls and floor "like crazy"

- **Owner lane:** first-person viewmodel presentation; all maps, all browsers.
- **Statement:** gun still clips through walls and floor like crazy despite the
  Pass 81 surface-plane fix (12/654 residual poses were documented at Bus/Van
  gap and Garage door).
- **Mechanical falsifier:** `scripts/qa/measure-viewmodel-penetration-cdp.mjs`
  poses report 0.000 m penetration on the named poses, and the floor plane
  holds at every stance.
- **Plan:** re-run the penetration instrument on the pass84 candidate, fix the
  residual poses and the floor-plane gap, add the poses to the ratchet.

## HF-396 — rail detached from barrel and scope on the flagged guns

- **Owner lane:** weapon presentation, scoped rifles.
- **Statement:** the rail is still detached from the barrel and scope on the
  few guns the owner previously flagged (scoped/railed rifles).
- **Mechanical falsifier:** per-flagged-weapon optic/rail socket alignment
  readback shows rail seated on barrel datum at ADS and hip.
- **Plan:** audit the flagged models' rail/optic nodes (`dump-glb-nodes`),
  align sockets in presentation code, add a per-weapon alignment contract.

## HF-397 — wall/floor viewmodel pullback too strong — halve it

- **Owner lane:** first-person viewmodel presentation; all maps.
- **Statement:** gun pullback when near a wall is too strong; owner asks to
  halve it.
- **Mechanical falsifier:** surface-retreat telemetry value halves on the same
  pose set while the near-plane-clear contract still passes.
- **Plan:** scale the pullback retreat input by 0.5; keep the final-Z near-plane
  floor clamp state-conditional; verify prone-contact `nearPlaneClear` and
  fire-kick clearance stay green.

## HF-398 — EBR: +40% damage, +25% fire rate

- **Owner lane:** weapon balance; M14 EBR.
- **Statement:** add 40% more damage to the EBR rifle and increase its fire
  rate by 25%.
- **Mechanical falsifier:** `gameplay-contract.test.ts` rows carry the new
  damage/rpm values and a new `metadata.changes` change id; catalog unit rows
  match exactly.
- **Plan:** update `src/combat/weapon-catalog.ts` EBR damage ×1.40 and rpm
  ×1.25 (rounded to the catalog's integer rpm), move the checked-in
  `baselines/pass65-candidate/gameplay-contract.json` rows in lockstep, add the
  change id.

## HF-399 — FPS regression: 150 → 40 on Quality mode, Atomic Acres

- **Owner lane:** performance; Atomic Acres, Quality profile, owner hardware.
- **Statement:** used to get 150 FPS on Quality; now ~40 on Atomic Acres.
- **Mechanical falsifier:** instrumented Quality-mode run on the owner route
  shows a measured root cause and a before/after presented-fps delta toward
  the historical number; zero in-combat pipeline creations retained.
- **Plan:** measure first (clip-plane count added by Pass 81, per-frame
  allocation, draw-call delta on atomic-acres vs other arenas), fix the named
  cause, verify with the cross-engine stall meter and the pipeline probe.

## HF-400 — release policy: pin PASS 83 as sole safe backup, remove older versions

- **Owner lane:** release policy.
- **Statement:** when the next pass pushes, pin this (current) version and
  remove all past versions; it is the safe backup.
- **Mechanical falsifier:** post-publish chooser exposes exactly PASS 84 +
  PASS 83 backup; every other channel tree is absent from gh-pages; publish
  guards (farcrysis hidden, predecessor = one pinned backup, fallback re-pinned
  to PASS 83) all pass.

## HF-401 — chopper pilot lag (continuation, instrument landed)

- **Owner lane:** chopper gunner ride; pilot side.
- **Statement (carried):** the ride lags; prior profilers only measured the
  observing peer.
- **Evidence recorded this pass:**
  `artifacts/qa/chopper-pilot/pilot-before.json` — a real possessed ride
  flushed **8 prewarm ghost records** (the per-frame `releaseUnseen` churn);
  staging did not light up active thermal layers, so the visual-cost half
  stays unproven and is NOT claimed fixed by mechanism alone.
- **Plan:** activation-edge flush (release once per reveal activation, retain
  hidden records otherwise, LRU-capped); pilot-side instrument now exists
  (`scripts/qa/profile-chopper-pilot-thermal-cdp.mjs`) for before/after rides
  with enemies staged in reveal range.

## HF-402 — reasonable spawns for players and bots on every map

- **Owner lane:** spawn layout; all maps, all modes.
- **Statement:** Raid currently spawns the player outside (bad experience);
  every map needs reasonable spawns for both players and bots.
- **Mechanical falsifier:** spawn-layout quality gate passes per map with
  spawn points inside/adjacent to POI cover, and the collider-aware solver
  (`scripts/qa/solve-spawn-layouts.ts`) output is committed with the map.
- **Plan:** re-run the solver with POI-proximity constraints per map; verify
  with the existing spawn-safety gate and a real join on each map.

## HF-403 — great multiplayer host+guest lobby experience, no freezing

- **Owner lane:** multiplayer core; all maps.
- **Statement:** the host/guest lobby experience must be great: no freezing,
  no frozen-in-spot movement, none of the previous issues; all maps playable
  and joinable the same way. Owner asks for real automated tests with at least
  two clients in a lobby across all maps.
- **Mechanical falsifier:** automated two-client host+guest run (local PeerJS)
  joins, deploys and moves on every multiplayer-enabled map with zero
  presentation stalls >250ms and no movement deadlock; join flow identical
  per map.
- **Plan:** delegate a two-page host+guest E2E harness (local peerjs server)
  to Claude; fix what it finds; wire it as a repeatable QA script.

## HF-404 — smooth in Chrome, Edge and Firefox: no freezes, crashes, error messages or low fps

- **Owner lane:** presentation and stability; all browsers, all maps.
- **Statement (verbatim, 08:47 BST):** "aswell as making sure no freezes or
  crashes or error message or low fps in edge and firefox aswell as chrome,
  i just need it smooth across all those browsers". Recurring ask
  (2026-08-31 x2, 2026-09-01, 2026-09-02).
- **Mechanical falsifier:** three-lane meter (`measure-cross-engine-stalls.mjs`,
  chrome+edge+firefox, 180 s, with a death/respawn cycle) on the PASS 84
  build and on the live channel shows zero console/page errors, no stall
  over 250 ms, frozen fraction under 0.5%, and fps p5 above a justified
  floor, on atomic-acres, Raid and high-seas; a repeatable gate
  `qa:cross-browser:smooth` enforces it with a registry-derived roster.
- **Plan:** Lane O (`docs/pass84-lanes/LANE-O-cross-browser-smooth.md`);
  the gate becomes part of the publish ritual.

## HF-405 — Map 3 continued on Claude and registered as a real arena (preview)

- **Owner lane:** content; Map 3.
- **Statement (08:40 and 08:47 BST):** "sort all of this too" (the Map 3
  registration previously held for art approval) and "bring map 3 back
  stuff from gemini its usage about to expire, do it with claude fable".
- **Mechanical falsifier:** `npx tsc --noEmit` on the root config; the
  arena-boot smoke and menu-preview verifier see Map 3 (registry-derived
  rosters); a PREVIEW-labelled card is selectable and boots solo; no other
  arena's files change.
- **Plan:** Lane P (`docs/pass84-lanes/LANE-P-map3-claude.md`).

## Wave 2 decisions the owner delegated at 08:40 ("sort all of this too")

IBL first-arena bug -> Lane I; eye-clearance RED spots -> Lane J; bus doors
and interior -> Lane K; Raid art pass -> Lane L; chopper pilot verification
(HF-401 visual half) -> Lane M; QA corpus streamline -> Lane N; real-device
mobile -> emulated pass plus an owner phone checklist (wave 3); dynamic
time-of-day and weather lighting -> wave 3 after Lane I lands.

## HF-406 — top-right release badge and the map button must show the CURRENT pass, its features, and the real project map

- **Owner lane:** menu shell / release identity; all channels.
- **Statement (verbatim, 2026-09-02 ~12:10 BST):** "ensure the top right thing
  is an accurate update of both the current pass number and features, and
  the map button contains the proper project map too. Currently it says
  pass 73 HITL?!"
- **History:** the same class shipped three times before (a PASS 82 publish
  still called itself PASS 81; the identity lives in the
  `release-identity-*.js` chunk, not index.html). The owner is seeing
  "PASS 73 HITL" on the live site, so at least one surface still reads a
  stale source.
- **Mechanical falsifier:** on the built menu (headless capture) and on the
  live channel after publish, every rendered identity surface (top-right
  badge, features/changelog panel, map/project-map button and its contents)
  carries the current pass number and the current pass's feature list from a
  single source; a test fails if any rendered identity text contains a pass
  number other than the current one or the word HITL outside the HITL
  checklist itself.
- **Plan:** Lane Q (`docs/pass84-lanes/LANE-Q-menu-identity-project-map.md`)
  on the release-prep branch; part of the PASS 84 publish gate.

## PASS 84 publish record — 2026-09-02 15:16 BST (integrated head 75a4e508)

Published by `scripts/orchestration/publish_pass84.py` from
`contrib/dave-gaming-pc/omp/pass84-overnight`; gh-pages generation
`3382bb988c2b`; channels now exactly `pass84` (live) + `pass83` (safe backup);
retired pass72-retained, pass81, pass82, recent-stable, the-big-one. Live
checks: channel roots 200/200, retired roots 404, identity chunk PASS 84 x3 /
PASS 83 x0, changelog chunk "Pass 84" x5 / HITL x0, chooser manifest
experimental=PASS 84 live / previous=PASS 83. Gates on the integrated tree:
tsc 0, vitest 543 files / 5,151 passed / 0 failed, Map 3 boot smoke green
headless on installed Chrome.

Row states after this publish (evidence: lane reports under each lane
worktree's `artifacts/lane-report.md`, skeptic verdicts alongside, and
`docs/pass84-lanes/`):

- HF-395 clip residue: **VERIFIED (partial)** — floor clip 37 -> 0 poses in
  STANDING, bus/van gap 2 -> 0; garage-door 12 poses at 0.323 m and 6
  bus/van-gap poses remain and need arena-side geometry (not clip planes).
- HF-396 rail seating: **VERIFIED** — rails seated on receivers, optics on
  rails, 18 probe-sets green at fp/world/drop LOD0; whole weapon family
  re-exported through the generators.
- HF-397 pullback halved: **VERIFIED** (anatomy test re-pinned by Lane B).
- HF-398 EBR +40% / +25%: **VERIFIED** (52.1 / 33.6 / 46 rpm; seven balance
  tests re-pinned at integration).
- HF-399 fps: **VERIFIED (partial)** — cross-arena CPU cost, not the lawn; Lane
  A +4.4% quiet-machine plus the weapon-presentation freeze patch; the owner's
  150 fps is not reproducible headless (78-85 fps at 1440p uncapped) and must
  be measured HEADED on the owner's rig. The in-HUD FPS readout is suspect.
- HF-400 two-channel policy: **VERIFIED live**.
- HF-401 chopper pilot: **CLAIMED** — activation-edge flush shipped; visual
  half under measurement in Lane M (wave 2a).
- HF-402 spawns: **VERIFIED** — Raid 12/12 with floor and routes (was 9/12
  floorless); gate derives its roster from the registry; Map 3 table authored
  from the solver at integration.
- HF-403 host/guest: **VERIFIED (partial)** — harness on every multiplayer
  map; a peer against a perimeter wall no longer freezes everyone
  (STATE_ADMISSION_BOUNDS_MARGIN 0.44 -> 0); remaining items in Lane G's report.
- HF-404 smooth in three browsers: **VERIFIED for Chrome and Edge** (zero
  errors/crashes; Edge not worse than Chrome); **Firefox BLOCKED** — no
  headless WebGPU adapter in Firefox 155 here; owner runs
  `docs/HF404_FIREFOX_MANUAL_CHECK.md` (two minutes). Live smoke appended below.
- HF-405 Map 3: **VERIFIED** — registered as "MAP 3 · PREVIEW", solo, boot
  smoke green; art grade re-cut at integration to clear distinctiveness.
- HF-406 badge / project map: **VERIFIED live** (identity + changelog chunks).
- Farcrysis load path (Lane C): **VERIFIED, hidden** — admits in 38-39 s
  (was: never), 0 in-combat pipelines; still not inside the 12 s fence;
  Lane R makes it a playable preview.

### Live smoothness, like-for-like (headless gate, atomic-acres, 120 s, same quiet window, 15:39-15:57 BST)

| channel | browser | mean fps | 5% low | worst stall | frozen % | stalls/min · median |
|---|---|---|---|---|---|---|
| PASS 83 | Chrome | 74.6 | 36.6 | 114 ms | 1.94 | 15.5 · 74 ms |
| PASS 83 | Edge | 76.7 | 36.5 | 104 ms | 1.85 | 15 · 70 ms |
| PASS 84 | Chrome | 80.6 | 40.7 | 114 ms | 1.88 | 15 · 71 ms |
| PASS 84 | Edge | 81.0 | 39.4 | 105 ms | 1.85 | 15.5 · 69 ms |

PASS 84 is equal or better than PASS 83 on every metric (+8% mean fps, +11%
5% low, same worst stall, same frozen fraction): **no regression, PASS 84
stays live.** Both channels fail the gate's 0.5% frozen ceiling on a
pre-existing class: a ~70 ms main-thread hitch about every 2-4 s (15/min) in
both Chromium engines. Lane T (`docs/pass84-lanes/LANE-T-periodic-stall-root-cause.md`)
owns its root cause for PASS 85. The earlier contested window (38 fps, 322 ms,
8.75% frozen) ran while the owner's ComfyUI was generating and the chopper lane
was riding; it is void. "errors 1+0" in every row is the gate's death-induction
hook (`damageLocalPlayer`) not being present in the shipped debug API, not a
page error from the game. Receipts: `aa-claude-xbrowser/artifacts/qa/live-ab/`.

## HF-407 — Nuke Town: total layout rejig to the Black Ops 2 Nuketown flow, code-authored

- **Owner lane:** the main map; layout, flow, cover, art direction.
- **Statement (verbatim, 2026-09-02 ~16:10 BST):** "I don't think it's very
  true in layout or style to the original nuketown map from black ops 2. I
  would like to totally remake the layout and feel to be much more similar in
  terms of size and how the buildings and vehicle are to nuke town from black
  ops 2, the flow of the map and its cover and houses and stuff are important.
  We can then make our own artstyle and gameplay enhancements and totally
  modify it ... still keeping things like the 2x damage, the rare gun spawn,
  the sheds, but the layout needs a total rejig and the bus can probably be
  made with code instead of blender and be better ... just mirror what it has
  and the way the closed/open vehicles work as cover, the black ops 2 version"
- **Context:** Nuke Town is the only arena built from an imported Blender bake
  (`authoring: 'import'`, `public/assets/original/models/atomic-acres-blender-arena.glb`
  7.3 MB from `scripts/blender/create-atomic-acres-blender-arena.py`); every
  other arena is code. The 2026-08-29 redesign rotated the flow and lengthened
  the street but the owner still reads it as untrue to the reference.
- **Mechanical falsifier:** a code-authored arena whose measured layout
  (street length, house footprints and positions, garage and yard placement,
  central vehicle and kerb cars, spawn yards) matches the reference
  proportions within a stated tolerance per element; all three lanes (street,
  house-west, house-east) exist with the reference's cover rhythm; existing
  fidelity, spawn-quality, eye-clearance, collider/visual parity and boot
  gates pass; 2x core, rare gun spawn and sheds retained; original art only.
- **Plan:** Lane U (`docs/pass84-lanes/LANE-U-nuketown-rejig.md`) builds it as a
  new PREVIEW arena beside the shipped one; the owner picks the moment to make
  it the main map.

## HF-408 — Raid: layout and art style closer to the original (shelved until Nuke Town lands)

- **Statement (16:10):** "raid just feels like loads of walls, need to ensure
  the layout and artstyle is more similar to the original."
- **State:** shelved by the owner with Farcrysis preview (Lane R) and bus
  doors (Lane K); Lane L (Raid art on the accepted layout) is superseded by
  this row, which is a LAYOUT rethink, not an art pass.

## HF-409 — Map 3 in the game must be the rich showcase, not a stone shell

- **Statement (verbatim, 2026-09-02 ~16:25 BST):** "wtf happened to map 3? i
  think antigravity murdered it? it was full of rich code based asset tests
  and now its just a square map of stone? can we roll it back and figure out
  what happened?"
- **What happened (VERIFIED):** nothing was deleted. `src/map3/**` (13
  modules, ~10k lines) and `map3.html` are intact with no deletions in
  history. Lane P (Claude Opus) registered `map3` as a NEW authored stone
  arena (`src/map3-arena.ts`) and deliberately did not import the showcase,
  citing: no colliders in the showcase modules; `ArenaMap` has no per-frame
  hook so the animated corridors would freeze; the static `arenaFactories`
  map would put ~10k lines in every arena's main chunk. The showcase page is
  not a Vite build input, so it is not in dist and returns 404 on the live
  channel. Gemini's waves 1-2 are in the tree and verified; its wave 3 left an
  uncommitted diff that Lane P kept.
- **Mechanical falsifier:** the in-game Map 3 renders the showcase corridors
  (water with buoyancy, weather bays, god rays, physics playground, forest
  with the 4x4, colosseum) animated at play time with collision parity for
  every reachable surface, loads via a code-split factory so no other arena's
  load grows, and passes the same gates Map 3 passed today; until then the
  stone shell is hidden from the menu and the showcase page ships as
  `/map3.html` on the channel so the owner can see it live.
- **Plan:** Lane V (`docs/pass84-lanes/LANE-V-map3-showcase-into-arena.md`).

## HF-410 — viewmodel rework: no clipping through walls or floor, no "holding it up" near walls, floor or prone

- **Statement (verbatim, 2026-09-02 ~16:35 BST, with two PASS 84 screenshots
  on Firing Range):** "gun clipping through walls and floor aswell as holding
  it up when near floor or prone or walls is super bad, needs a re work and fix"
- **Root cause hypothesis to VERIFY first (orchestrator, from source):**
  `HIP_VIEWMODEL_POSITION = { x: 0.34, y: -0.44, z: -1.08 }` places the rig
  about 1.08 m ahead of the eye and 0.34 m right, while the standing capsule
  radius is about 0.38 m: the weapon extends roughly 0.7 m OUTSIDE the
  player's own collision body, so every wall the capsule can approach
  intersects it. Every fix so far (surface clip planes, 0.28 m retreat then
  halved, the contact lift and fold pose, a depth-cleared overlay that paints
  the gun over walls) treats the symptom. Screenshot 1 is the contact lift
  pose against a wall; screenshot 2 is the overlay painting the gun through a
  wall corner.
- **Mechanical falsifier:** with the largest weapons (LMG, minigun, launcher)
  the viewmodel's world-space bounds stay inside the standing capsule radius
  minus a margin at hip and ADS, and above the floor at crouch and prone eye
  heights, so the penetration instrument reports 0 m at every graded pose
  with NO retreat and NO lift applied; the contact lift is removed or capped
  at a few centimetres; on-screen framing is preserved by a dedicated
  viewmodel field of view; no material recompiles; anatomy and prone-contact
  contracts re-pinned with the reason.
- **Plan:** Lane W (`docs/pass84-lanes/LANE-W-viewmodel-rework.md`).

## HF-411 — Firing Range: a metal grating laid as a roof-level floor lets the player fall through

- **Statement (verbatim, ~16:40 BST):** "on firing range sometimes you go to
  run onto a metal fence layed as a floor on the roof level of the map and
  you fall through it, fix all that shit"
- **Mechanical falsifier:** every walkable presentation surface on Firing
  Range (test1) has a matching movement collider; a headless traversal across
  each roof grating stays on it; the collider/visual parity audit on test1
  reports zero unexplained walkable visuals; the same sweep on every arena
  lists any sibling.
- **Plan:** Lane X (`docs/pass84-lanes/LANE-X-firing-range-fallthrough.md`).

## HF-412 — drop shots the way Black Ops 2 did them

- **Statement (verbatim, 2026-09-02 ~16:45 BST):** "Also ensure 'drop shots'
  work like they did back in black ops 2 days, no weird sliding or diving,
  just however drop shots worked and what keys you had to press, important"
  and "its where you go prone and shoot i think, and has an animation too of
  the body".
- **Mechanical falsifier:** pressing the prone input mid-burst drops the eye
  to prone height over a fixed short transition with no fire interruption
  (shot timestamps continuous across the drop), no slide or dive path
  reachable, the reference's default key on PC and hold-crouch on pad both
  bound and remappable, and a guest in the two-client harness sees the
  host's body play a prone transition rather than snap.
- **Plan:** Lane Y (`docs/pass84-lanes/LANE-Y-drop-shot.md`); Lane W owns
  the viewmodel's prone pose in parallel.

## HF-413 — first-person arms and animations correct: guns, reload, knife not inverted or strange

- **Statement (verbatim, 2026-09-02 ~16:55 BST):** "also please ensure the
  arms and animations for guns, reloading, knife are fixed and not inverted
  or strange etc, hopefully an easy fix."
- **History:** August's arms work burned 13 GLB regenerations and 11 .blend
  rewrites on mirroring, near-plane penetration and material response; the
  mirroring class recurs.
- **Mechanical falsifier:** every arms and weapon node has a positive scale
  determinant, reload and melee clips play in the authored direction from
  the authored hand, sockets sit on the authored side, the pass65 arms visual
  verifier passes, and before/after frame strips per weapon show the
  defects gone.
- **Plan:** Lane Z (`docs/pass84-lanes/LANE-Z-arms-animations.md`), in
  parallel with Lane W (placement/FOV); Z owns rig and clips, W owns placement.

### HF-409 addendum (owner, ~16:55): "Just keep the showcase in and it's not
about combat, it's a mode you can explore."
Map 3 is an EXPLORE mode: the showcase corridors are the content; solo,
0 bots, no combat requirement, no multiplayer. Collision parity still
applies to walkable and blocking surfaces (the player must not fall through
or walk through the showcase), but Lane V should not spend budget on
combat systems, spawn-vs-enemy constraints or field support for map3.

### HF-399 residual assignment (17:10)
The viewmodel solver cost Lane A measured (~22% of frame: per-frame socket
lookups and subtree matrix walks in `solveRiggedArms`) is assigned to Lane W
alongside the placement rework (same file). Owner 17:05: lighting and fps
"both feel a bit off"; owner's own HUD shows 63-70 fps on Firing Range at
1440p on PASS 84.

## HF-414 — graphics profiles made clear: Performance / Quality / Max / RTX

- **Statement (verbatim, 2026-09-02 ~17:50 BST):** "we need a clearer
  understanding of the capabilities of webGPU and our settings of
  performance, quality, max, and RTX. Is RTX above or below max, and is it
  just based off quality but then only works on nvidia cards? ... ensure our
  graphic profiles are clear as to what they are and what they deliver and
  how/why etc". Overnight, after the Nuke Town rebuild.
- **Mechanical falsifier:** per profile, the control set, rendering meaning
  and measured cost (frame time, draws, pipelines, VRAM) per arena are
  documented and pinned by a control-set hash test; in-game descriptions
  derive from the audit; the RTX preset's adapter/feature dependence is
  stated from a measured feature list, not assumed.
- **Plan:** Lane AI (`docs/pass84-lanes/LANE-AI-graphics-profiles-and-neural-rendering.md`).

## HF-415 — DLSS 5 "3D-guided neural rendering": can any of it make the game look cooler?

- **Statement (verbatim):** "this DLSS5 general stuff ... possible to use
  somehow as an option to make our game look cool? dont need better FPS via
  AI as that would reduce latency, but do need cooler looking stuff options?"
- **Mechanical falsifier:** a sourced research note stating what DLSS 5 is,
  why it is not reachable from WebGPU, and at most three WebGPU-reachable
  "look" options with feasibility, cost class and a bounded first
  experiment each.
- **Plan:** Lane AI, same brief, research half.

## HF-416 — the "brief with embedded rules" scene-production method: skill it, prove it on a Map 3 corridor, apply it to Nuke Town

- **Statement (verbatim, 2026-09-02 17:55-18:10 BST):** "It seems the
  foundation of it was a really good prompt with the rules embedded in it
  ... whether we use that method and a similar prompt directly, or
  techniques to recreate the style of the prompt but outside of blender?
  Just code? WebGPU? Good prompt. Start small" ... "Ensure we get what I
  recently sent architected as a nice skill and then do some tests as a
  corridor in map 3, maybe not 12 hours but 3-6 could work" ... "If you
  already see useful things and techniques within there, ensure they are
  written into our skills and techniques and apply them when rebuilding
  nuketown, being usage conservative and not breaking or ruining anything ...
  we are looking for cool AF stuff here".
- **Source resolved:** https://restaurant-bar.space-z.ai/skyline_restaurant_bar_brief.html
  (Blender 4.1.1 Cycles brief; 100M+ tokens, 12 h autonomous run, 16 fixed
  cameras, six fresh-context critics, 100-point rubric with per-dimension
  85% gates and a 90 exit, critical-failure auto-reject, plateau escalation,
  cold-start validation). Transferable method, not the Blender part.
- **Mechanical falsifier:** a shared skill `brief-driven-scene-production`
  exists in the vault store with an eval record and a scoped guard accept;
  one Map 3 corridor is produced by the method with a recorded rubric
  history over at least three critic cycles; the Nuke Town rebuild's art
  pass runs the same loop with Gemini critics and reports scores per cycle.
- **Plan:** Lane AJ (skill + Map 3 corridor), Lane U addendum (adopt the
  protocol now), Lane AK (Nuke Town art pass by the method, after U lands).

## HF-417 — Gun Range cannot be reached by an in-game map switch (found by Lane I, 2026-09-02 18:50)

- **Finding (VERIFIED by Lane I, twice, once on a quiet GPU):** switching
  arena into gun-range from an active match fails with
  `[Gun Range map selection failed] Error: WebGPU queue completion exceeded
  12000 ms for submission 614 ... fenced draws 770`; the previous arena stays
  committed while the match stays active. gun-range's FIRST-load path is
  fine. Same class as the Farcrysis admission failure Lane C fixed (cold
  pipeline vocabulary compiled inside the fenced frame).
- **Mechanical falsifier:** a headless in-match switch into gun-range from
  every other arena commits inside the 12 s fence with zero page errors, and
  the switch matrix (every arena -> every arena) is green and derived from
  the registry.
- **Plan:** Lane H (load-time deep cut) takes it as job 0, moved up in the
  wave-3 order; Lane C's "realise the arena vocabulary before the first
  fenced frame" pattern is the first thing to try. Also: IBL first-arena
  bug CLOSED as already fixed on 75a4e508 (Lane I, 8/8 arenas identical
  across load paths); "lighting feels off" routes to the art passes
  (HF-407, HF-408) and Lane AB.

## HF-418 — the graphics ladder: Balanced added, Quality "beautiful and smooth", Max for mad PCs, RTX = explained native runtime, beautiful lighting adjustable

- **Statement (verbatim, 2026-09-02 ~19:10 BST):** "for RTX then make it
  really clear what it is when you select it, something pops up, it tells
  you and guides you about the runtime ... when i say ray tracing i mean the
  beautiful lighting etc, get it all working in a nice way that wont murder
  FPS and you can adjust and on/off stuff, quality maybe its on lightly,
  maybe make a new balanced profile that doesnt look shit like performance
  but will run nice and look good? and quality is beautiful and smooth on a
  decent pc. Max is for mad pcs and RTX mode is in a different runtime app
  or something you can download with a click or 2, alerted and easy? ...
  maybe we can even have path tracing in game as an option but not needed
  ... its more about the assets and sensible lighting than balls to the wall"
- **Mechanical falsifier:** the settings menu offers Performance, Balanced,
  Quality, Max with one-line truthful descriptions derived from the audit
  and a pinned control-set hash; selecting RTX opens an explainer that
  states it is a separate native runtime, what it adds, and how to get it
  (link/instructions; "coming soon" until the desktop build exists), and
  never silently changes the web renderer; lighting features (baked
  indirect, SSR, AO, contact shadows) are individual controls with tiers,
  each with a measured cost, defaulted per profile; every profile admits
  inside the fence; tripwire 0.
- **Plan:** Lane AI implements the ladder, descriptions and RTX explainer
  after its audit; Lane AL (`docs/pass84-lanes/LANE-AL-lighting-quality-tiers.md`)
  builds the lighting features and tiers; in-game path tracing is research
  only for now.

### HF-413 status (Lane Z merged 19:08 BST, 87fe7958) — PARTIAL, skeptic ACCEPT_WITH_FIXES, repair landed
- Landed: firing-shoulder entry now continues below the frame on every captured
  pose (right lane -0.97 -> -1.04, raised -0.82 -> -0.99; contract floor -0.98);
  knife swing re-derived from the presented depth/FOV so the arm is back in
  frame (root NDC x 2.51 -> 1.39 at peak); pass65 arms visual gate re-pinned to
  the shipped v2 hand-policy contract and STRENGTHENED (ADS per family, six-frame
  reload and melee strips, support-palm liveness floor); new static GLB
  handedness gate `qa:pass85:arms-handedness` (136 files, 4989 nodes, 485
  sockets, 0 violations at the merged head; local node transforms only).
- Corpus finding: nothing is mirrored; the M134 "cross-body" reload is that
  weapon reaching its side drum and is correct (the lane's first fix was reverted
  byte-exact by the repair after the skeptic refuted it).
- OPEN (blocked on Lane W / HF-410): the pass65 arms visual gate is still RED at
  head, 11 violations, all "clipped by the near plane" because the viewmodel
  root presents at z=-0.407 against an authored -1.08; mid-swing knife frames
  0.40-0.72 smear for the same reason. Do not report that gate green.
- OPEN: the raised/ordinary shoulder-lane spread is 0.05 not HF-388's 0.15
  (needs a lever other than lane depth); the new handedness gate is registered
  but no aggregate invokes it (wire into the publish preflight at the 22:20
  cut); 12 of 19 weapons still covered only by their family representative;
  strafe capture needs a lateral debug hook in legacy-main (patch in the lane
  report). Evidence: `docs/evidence/pass85/hf413/` (31 MB).

## PASS 85 publish record (build 1 of the 2026-09-02 evening plan)
- **Published 20:12 BST** from integration head d606290c via
  `scripts/orchestration/publish_pass85.py`: gh-pages channels are exactly
  {pass85 (live), pass84 (safe backup)}; pass83 retired; root chooser generation
  0d872ac4e574. Rollback: `python scripts/orchestration/publish_pass85.py --rollback`.
- **Shipped:** Lane Z HF-413 (arms/knife, partial - see the HF-413 status above),
  Lane X HF-411 (Firing Range camo-netting floor + walkable-surface parity gate,
  Direction D, Firing Range/Raid/Map 3 at zero fall-through, other arenas on a
  shrink-only ledger), Lane Y HF-412 (Black Ops 2 drop shots: hold-crouch-to-prone
  320 ms, camera falls over 380 ms, hip-fire cone widens while dropping, body
  transition replicated to peers; bots have no stance - open row).
- **Held for build 2:** Lane W HF-410 viewmodel fit (merges clean; needs the
  integrator decision on the on-foot near plane 0.08 -> 0.02 m and a browser
  z-fighting look at High Seas/Map 3, plus the pass69-3 near-plane catalog spec
  re-pin and the HF-413 gates re-run on the fitted rig).
- **Gates on the cut:** tsc 0; focused vitest for Z/X/Y + release tests 244/244 and
  67/67; plan contract 9/9; qa:release-identity OK; headless Chrome arena boot
  smoke 9/9 arenas on the built PASS 85 (Firefox project not runnable headless).
  The full vitest suite was NOT run on this cut (machine shared with six running
  lanes); it runs on the PASS 86 cut.
- **Process:** the 19:13 cut job never fired (session was mid-turn; one-shot
  crons only fire while idle), so the cut ran by hand at 19:58-20:12. New
  `scripts/orchestration/roll_pass.py --pass N` performs the whole stamp roll
  (identity, changelog, channels, backup key, publish script + contract test,
  patch, every test pin) so PASS 86/87 are one command each. Two guard trips
  worth knowing: the plan test's case 9 wants the tracked patch to reverse-apply,
  and running the release-topology test AFTER the build writes
  artifacts/pipeline/release-topology.json and trips the freshness guard - build
  last, copy immediately.

### HF-410 decision (21:17 BST) — Lane W viewmodel fit MERGED for PASS 86 with the 0.02 m near plane (option a)
- Evidence (worker, branch hf410-integration-prep, docs/evidence/pass86/hf410-prep/NEAR-PLANE-DECISION.md):
  three headless native-WebGPU capture runs x 14 authored review cameras in High Seas,
  Map 3 and Skyline Terminal at 2560x1440; the 0.02-vs-0.08 far-half pixel delta
  (10,924 px > 8) is 2.5x SMALLER than the same build's run-to-run noise (27,410);
  sign-flip rate 0.0-3.5% where z-fighting would be ~50%; the only above-noise effect
  is a ~1% uniform luminance shift on sunlit ground from depth linearisation. The
  renderer has no reversed-depth option in use and it would not help (24-bit
  fixed-point depth: reversed-z is a linear remap). Keeping 0.08 would give back
  the fit's justification (42/60 poses cut by the near plane at 0.08 vs 0/60 at 0.02).
- Arms visual gate on the fitted rig: 11 -> 2 violations, zero near-plane class left;
  the two left are the left-sleeve shoulder entry in prone-against-wall poses.
- Also landed: Map 3's four review cameras in the viewpoint catalog (Map 3 had shipped
  in PASS 85 with no viewpoint coverage); pass69-3 near-plane spec + runner now derive
  from FIRST_PERSON_CAMERA_NEAR_METERS (margin unchanged); chopper spec green headless.
- Refuted: Lane W's "deepFreeze walk" residual - a force=true parent walk touches 0
  nodes inside a frozen subtree (static-matrix-freeze override, measured on three r185).
- OPEN, being fixed before the 22:20 cut (worker on branch pass86-gate-repairs): the
  committed pass65 arms visual gate ABORTS on the fitted rig (its precondition waits for
  the wall-pullback symptom HF-410 removes) - re-pin to the rig's contract, never weaken;
  the pass69-3 spec fails in setup because crimson-flamethrower has no authored design
  identity (pre-existing since it joined the roster); the two left-sleeve violations.
- OPEN: the near-plane sweep did not cover Farcrysis, Raid, Gun Range, Nuke Town,
  Firing Range; review cameras hardcode near 0.08 and never see a near-plane regression.
- PROCESS: PASS 85 shipped with src/presentation-prewarm-contract.test.ts RED (a Lane Y
  doc comment put "snapshot()" inside the endurance-telemetry region; not in any lane's
  focused set). Fixed on integration; the PASS 86 cut runs the FULL suite.

### PASS 86 cut guidance (orchestrator, 21:30 BST) — what the 22:20 cut merges
Wave 2c2 verdicts are all ACCEPT_WITH_FIXES with repairs landed; the merge audit
is running. Integration head 714d4121 (PASS 85 + Lane W + prewarm fix) passed the
FULL vitest suite at 21:23 (549 files / 5206 tests). Merge set for PASS 86, in the
auditor's order, each only if it merges clean and the full suite stays green:
- **J eye-clearance triage** — merge; ALSO land its withheld F1 patch (skyline-
  terminal nacelle collider transposed against its visual: authority x1.9/z4.1 vs
  visual x4.1/z1.9) - a collider/visual parity defect, integrator-approved; keep
  the two lowered ceilings (ratchets only tighten).
- **N QA corpus streamline** — merge; apply its outside-ownership two-line
  scripts/release/change-impact.mjs patch with the gamepad wiring contract; then
  set LINE_CEILING for src/legacy-main.ts to the merged line count with a
  CEILING_HISTORY entry naming the lanes that grew it (the documented procedure;
  the gate fails in both directions so every merge that touches legacy-main needs
  this step). Follow-up (PASS 87): make that gate a one-direction ratchet.
- **T periodic stall** — merge ONLY if the repaired branch left the stall gate's
  thresholdMs and the aliveness poll cadence no stricter-to-pass than before
  (the skeptic found 95.5 -> 110 ms and 40 -> 4 steps); if either is still more
  permissive, hold T for PASS 87. Its instruments and attribution are wanted.
  Integrator decision on its withheld minimap patch: APPROVED at 30 Hz redraw
  (MINIMAP_RENDER_HZ 60 -> 30) - land it in the PASS 87 residual lane.
- **H gun-range switch + load cut** — merge if its report is in and green.
- **U Nuke Town rebuild (nuketown2)** and **V Map 3 explore** — ONLY if their
  finisher workers (launched 21:35 on branches contrib/dave-gaming-pc/claude/
  nuketown-rejig and map3-demo-showcase) report MERGE-READY before the cut with
  the full suite green; otherwise they ship in PASS 87. U's blockers found by the
  skeptic: verbatim third-party prose in a committed doc (must be gone), the 2x
  core on an unreachable roof, lawn decal inside the houses, no menu preview, no
  rare-gun runtime switch. V's: card withdrawn, /map3.html dead on every published
  channel (release topology orphans it), HUD still says TDM in explore.
- **S** — docs only (committed on integration by the orchestrator); Lane AC must
  apply the skeptic's two blockers to the plan (never `worktree remove --force`
  the main working tree; `git branch -d` refusals) before executing anything.
- Lane Y follow-up rows: bots have no stance; HUD/menu overflow with 8 arena
  cards (menuOverflowX 250-312) - pass64-hud-menu spec 13 failed / 8 passed since
  PASS 84 - assign to the PASS 87 streamline/UI pass.

## HF-419..HF-422 — owner links 2026-09-02 ~21:50 BST: four techniques to ingest as shared skills, then try (Map 3 first if not clearly safe)
**Statement (verbatim):** "some more bangers and things to consider with opus and
ingest as skills for our 3d work and map remakes and polishes etc. GTA art
https://x.com/mattshumer_/status/2095187868746383758 . Better water like this guy
and have little pools or ponds at very least in each level. Upgrade all water
across maps https://x.com/dangreenheck/status/2095028187063280085 dont pay, figure
out how. this looked incredible? how can we get this style of lighting and high
graphics? Subway game. https://x.com/bijanbowen/status/2094931925513261273 . also,
Motion bricks instead or with Komodo. https://x.com/jichiep/status/2095157236658315288
? maybe if you have some time you can do some animation improvements for our skins
and bots etc? aswell as ingesting all these skills and trying some stuff out etc,
we can of course test stuff in map 3 if not clear to be widely deployed"
- **HF-419 GTA-style art technique** (mattshumer_ thread): resolve what it
  observably is (method, tooling, licence), register it, write/extend a shared
  skill, and feed Lane AK (Nuke Town art by the brief method).
- **HF-420 water**: study the dangreenheck water (what shader/technique; no paid
  product - derive the technique from public material and our own TSL), write the
  skill, then: a pool or pond in EVERY level at minimum, and one shared upgraded
  water module used by every arena's water (High Seas, Raid, Nuke Town, Map 3
  shoreline, Skyline). Test in Map 3 first; readability/parity and the pipeline
  tripwire apply.
- **HF-421 subway-game lighting style**: resolve what produced the look (engine,
  GI/baked, post chain, materials), write the findings into the lighting skill set
  and feed Lanes AL (lighting quality tiers) and AB (dynamic lighting); prototype
  the closest TSL/WebGPU equivalent in one Map 3 corridor.
- **HF-422 Motion bricks / Komodo animation**: resolve what "Motion bricks" is
  versus our Komodo route, write the animation-pipeline skill (with the ComfyUI
  Lane AH findings), then improve skin/bot animations (locomotion blends, stance
  transitions, reload/melee body) - Map 3 / bot skirmish first.
- **Mechanical falsifier:** four technique-register rows with pinned sources and
  licences; four skill files in the vault store with eval records and scoped guard
  accepts; a measured Map 3 experiment per technique with before/after captures
  and the tripwire at 0; the water module shipping in every arena with a pond in
  each level (gated by a roster-derived test) before any wide rollout of the rest.
- **Access rule:** X sources are read through public mirrors; if a thread is
  auth-blocked, the lane reports BLOCKED and the owner is asked to log in (never a
  search substitute).

### HF-408 Raid layout rethink — SCHEDULED 22:05 BST (owner asked again: "didn't we have stuff for RAID")
Lane AQ (`docs/pass84-lanes/LANE-AQ-raid-rejig.md`): the Nuke Town protocol
applied to Raid - reference study first, code-authored `raid2` preview beside the
shipped Raid, wall-density and sightline table against the reference, Lane U's
skeptic findings as the do-not-repeat list. Targets PASS 87 if merge-ready by
04:30, else the next pass. The Raid ART pass (Lane L) stays shelved as the owner
asked; the rebuild ships a clean first-pass style.
### Lane AR — PASS 87 residuals brief written (`docs/pass84-lanes/LANE-AR-pass87-residuals.md`)
HUD/menu overflow with 8+ cards (red since PASS 84), minimap 30 Hz, bot stance,
line-ceiling one-direction ratchet, overdrive roof claim, review-camera near
plane, stale webgl2 copy, operator visual gate. Launches after the 22:20 cut.

### HF-409 Map 3 explore — finisher result 22:15 BST: MERGE-READY FOR PASS 87, NOT PASS 86
Landed on branch map3-demo-showcase (9847a7e9): the card is back as an EXPLORE
arena KIND (required `kind: 'team' | 'explore'` on every registry row; the
explore branch of the spawn-quality gate is stricter, not an exemption; all four
roster ratchets restored 7 -> 8; map3 in the cross-browser required set); full
suite 5168/0 on that change set; merges clean. NOT yet: the in-match HUD still
says TEAM DEATHMATCH with a countdown in explore (legacy-main :16976/:27305),
/map3.html is dead on every published channel until the stage-release-topology
patch lands with proof, and the eye-clearance ceiling cannot be measured until
buildMap3 gets the prepare-then-build split (stage 2 builds arenas synchronously;
map3 is code-split). Do NOT merge V at 22:20; a second finisher is on the PASS 87
critical path now. Stray: aa-map3 carries three uncommitted HF-412 files (not
V's); aa-map3-laneV-verify is a scratch runner to remove once V is accepted.

### HF-407 Nuke Town rebuild — finisher result 22:20 BST: MERGE-READY FOR PASS 86 (ship as NUKE TOWN REBUILD · PREVIEW)
Branch nuketown-rejig at de0840e6: full suite 5187/0 on the branch; merge probe
clean against 6c77a662; no third-party prose (scripted scan 0 hits); the 2x core
roof reachable by a real Rapier traversal (eye 5.72 m over the core); lawn out of
the houses (0.000 m2 overlap, asserted in the fidelity test); real menu preview
media committed (the pass77 provenance gate stays red on the PRE-EXISTING shared-
generator digest broken by c25f5e32/Map 3 - not faked, owner of that gate to fix);
rare gun landed on the rebuild via RAILGUN_ARENA_IDS + per-arena sites, shipped
Nuke Town byte-identical (tests); eye clearance MEASURED (ceiling 18, all prone
under the truck decks; 2 runtime rows left OPEN); 60 s headless solo run zero
errors. **Cut instruction:** merge U into PASS 86 after J/N in the auditor's
order; re-run the boot smoke for nuketown2 (not run since the rare-gun commit)
and the arena-roster + channel-list checks post-merge (the "published but
unselectable" gotcha: integration also edits test-maps.ts, release-channels.json,
legacy-main.ts). Promotion out of PREVIEW is the owner's call after he plays it.

## HF-423 — owner 22:25 BST: "get farcrysis sorted overnight too after nuke town and raid"
**Statement (verbatim):** "ok thanks, get farcrysis sorted overnight too after nuke
town and raid, i will sleep now see you at 6AM so i can play something good and
hear more about it all, impress me with all the cool 3js skills etc and animation
possibly too if time permits! night night"
- Lane R (`docs/pass84-lanes/LANE-R-farcrysis-playable-preview.md`) is UNSHELVED
  and launched 22:30 on Opus, priority after Nuke Town (done) and Raid (running):
  Farcrysis admitted inside the 12 s fence on Quality (Lane C's FARCRYSIS-LOAD
  pattern is on the integration line), spawn table + gates, art gaps closed to a
  clean first pass, unhidden as a PREVIEW card. The publish script's
  farcrysis-unselectable guard becomes a farcrysis-admission-evidence guard in the
  same cut that ships it (boot smoke + admission time + tripwire 0) - the cut
  agent applies that with roll_pass.py's help; never delete the guard.
- Falsifier: `selectable: true` + boot smoke green headless + admission < 12 s
  cold on Quality + tripwire 0 + spawn-quality gate + eye-clearance measured +
  60 s solo run zero errors; targets PASS 87 by 04:30, else the next pass.
- Owner's 06:00 ask: something good to play (Nuke Town Rebuild preview in PASS 86;
  Raid, Farcrysis, Map 3 explore, water/lighting/animation trials in PASS 87 where
  green) and the morning report with the skills and animation work.

### Gate repairs merged 22:40 BST (branch pass86-gate-repairs, a94ea6db)
- pass65 arms visual gate no longer ABORTS on the fitted rig: its 0.15/0.25
  retreat thresholds are kept verbatim on `requestedSurfaceRetreat` (the probe
  demand HF-410 leaves intact; the applied retreat is zero by design), wall pose
  asserted via wallBlend, penetration asserted directly on the fit's own margins
  (capsule margin > 0, floor clearance > 0, bodyFitScale pinned). Result on the
  fitted rig: 2 violations, both the LEFT support sleeve in prone-against-wall
  poses - a real defect, kept RED honestly. Cause measured: the contact fold
  scales the whole viewmodel root, arms included (14% reach loss), and the
  support socket sits further forward; no lane constant or elbow pole can move
  it. Proposed fixes (PASS 87 residuals): exempt the arm chains from the fold
  scale, or add a fourth reach arc toward the eye with a near-plane guard.
- pass69-3 near-plane catalog spec: the 20-vs-21 setup defect is fixed with the
  MEASURED runtime identity of crimson-flamethrower (a livery over the
  flamethrower asset); the full run still stops at deploy() on this loaded box
  (matchPhase wait) - unverified, re-run on a quiet machine through the committed
  harness (build+stage exceeds the 180 s webServer timeout under load; not
  changed).

### HF-417 / load-time deep cut — Lane H decision 22:18 BST: HOLD from PASS 86 (regressed first loads)
The skeptic's re-analysis of Lane H's own data: generalising the off-fence
precompile to every arena took the 56-pair switch matrix to 56/56 with zero
fence failures (real win; the failing class was atomic-acres -> high-seas, not
Gun Range), BUT paired whole-switch time is SLOWER (median +488 ms, 31/55 edges),
and first loads regressed badly on the two arenas that most needed help:
gun-range 43.0 -> 65.4 s (+52%), high-seas ~48 -> 71.0 s (+45%); the ~3 s
staged-light warm-up migrates to whichever rehearsal runs first (killstreak
vocabulary now 6.8-7.0 s). The baseline sweep also shared the GPU with eight
Lane V browsers. Owner intent is "load every map much faster", so this does not
ship as-is. **Cut instruction: do NOT merge Lane H into PASS 86.** Keep for
PASS 87 as Lane H2: (1) re-measure baseline and candidate on a quiet GPU with
the fixed instrument (sync/async pipeline sinks separated); (2) keep the roster-
derived switch-matrix gate, the flare-gun reach fix and the stricter prewarm
contract pin; (3) precompile off the fence WITHOUT serialising it into first
load (parallel compileAsync, menu-time prewarm scoped to the arena the player
picked); (4) the ~3.5 s serialized rehearsal cut on the four heavy arenas; (5)
match admission (deploy) at 14-20 s per arena is the largest unexamined block -
attribute it and cut it. Gate: no arena's first load or switch slower than the
quiet-GPU baseline, tripwire 0 on every arena, switch matrix 56/56.

## PASS 86 publish record — 00:50 BST 2026-09-03 (see docs/PASS86_CUT_REPORT_2026-09-02.md)
Integration e1361b0f -> gh-pages {pass86 live, pass85 backup}; chooser generation
cb0967af4030. Shipped: Nuke Town Rebuild PREVIEW (HF-407), Map 3 EXPLORE with the
honest HUD and the in-channel showcase page (HF-409), viewmodel fit (HF-410),
eye-clearance triage (J), QA corpus (N), IBL verification (I). Held: H (load
regressions), T (permissive threshold). Boot smoke 12/12 on all ten arenas.
Rollback: `python scripts/orchestration/publish_pass86.py --rollback`.

### HF-423 Farcrysis — lane result 02:10 BST and the orchestrator's decision
Lane R (branch farcrysis-playable-preview, 22 commits, skeptic ACCEPT_WITH_FIXES,
repaired): spawn table solved on the terrain authority, ground registered for
raycasts, crate lids / tower deck / dish / cave crown given real authority, the
ground shot box no longer swallows a standing player (a self-inflicted defect
found and fixed: 56.5% of shots died at the muzzle), eye clearance measured off
the sentinel (441, of which 373 are a stage-1 instrument limitation on
heightfields and 25 are genuine runtime rows), art first pass lifts the island
off black on measured luma, the card unhidden as PREVIEW, and cold admission
measured on a quiet machine: farcrysis 32.0 s mean vs the atomic-acres control
25.7 s, worst pair ratio 1.28, zero in-combat pipelines.
- **Falsifier amendment (orchestrator):** the row's "admission < 12 s cold"
  clause conflated the 12 s WebGPU fence with wall-clock admission; no arena
  admits in 12 s on this machine (Lane H measured deploy at 14-20 s everywhere).
  The gate is now: cold admission ratio to the atomic-acres control <= 1.60 on a
  quiet machine (measured 1.28), every fenced submission inside the unchanged
  12 s fence, tripwire 0. The publish guard becomes an admission-evidence guard
  reading the lane's receipt (docs/evidence/pass87/lane-r/farcrysis-admission.json,
  keyed to the built bundle).
- **Ships in PASS 87 as FARCRYSIS · PREVIEW** with an honest caveat: in-combat
  frame time is 1.34-1.89x atomic-acres (median 1.64x; 224 vs 110 distinct
  materials is the lever, not attempted). Next pass: collapse materials onto the
  shared vocabulary, the owner's vegetation technique (Bezier tufts + SSS,
  ridged-FBM backdrop), the core building's interior floor/walls and a practical
  light, the 25 runtime eye rows, and stage 1's flat-ground eye seat (an
  instrument fix that also affects every heightfield arena).

### HF-408 Raid layout rethink — lane result 02:20 BST and the orchestrator's decision
Lane AQ (branch raid-rejig, 13 commits; skeptic REJECT on one geometric blocker,
repaired): the complaint was measured as wall SHAPE, not wall quantity (shipped
Raid: 59 eye-blocking masses averaging 11 m2, mean open sightline 9.97 m, 36.7%
roofed ground); the rebuild carries 34 masses averaging 22.6 m2, mean open line
13.62 m, long-axis median 25.65 m, 21.9% roofed, wall footprint per floor area
UP (13.0 -> 15.5), 84 mountable cover pieces, all four upper rooms reachable
(the skeptic found three sealed by full-height walls emitted from grade; fixed and
measured by flood fill), 12/12 legal spawns with zero spawn-to-spawn sightlines,
parity 0/0, real menu preview, eye clearance measured (13 -> 0), readability of
the cover family gated. **Decision:** ships in PASS 87 as RAID REBUILD · PREVIEW
if the integration worker lands it green by 04:20 (35-file conflict surface with
PASS 86's arena additions). Owed next: the ART pass (flat untextured albedo; Lane
L stays shelved at the owner's instruction but the rebuild needs its own first
style pass), arena sync 45-63% slower than the shipped Raid (route to Lane H2),
the warm-key art-direction quadrant being full, the weather sequencer latent bug.

### 03:35 BST integration notes (Lanes AH, AE, AD merged; integrator edits)
- AE (mobile): the PAUSE tap no longer falls through onto the menu it uncovers;
  emulated sweep on three devices; phone checklist for the owner in Lane AE's
  evidence. Integrator applied its collapsed-Advanced-Graphics CSS fix (the
  closed disclosure laid ~2,815 px of catalog over the Options panel, on desktop
  too). Left for Lane AR: the paused deck's covered join row, DEPLOY below the
  fold on landscape phones, 24 px settings checkbox rows.
- AD (release CI): the workflow verifies and cannot publish (`contents: read`);
  `publish_pass<N>.py` is the only publisher. The three documentation patches
  (README, AGENTS.md, pipeline doc) landed in the same integration commit.
- Lane C's two zero-byte tsc log files under docs/evidence/pass84/farcrysis-load
  were deleted (they made `qa:text-integrity` red on every branch); their
  siblings carry the real `TSC EXIT 0` marker. No marker was fabricated.

## PASS 87 publish record — 04:35 BST 2026-09-03 (see docs/PASS87_CUT_REPORT_2026-09-03.md)
Integration 63e69108 -> gh-pages {pass87 live, pass86 backup}; chooser generation
97618442dcec. Shipped: RAID REBUILD · PREVIEW (HF-408), FARCRYSIS · PREVIEW
(HF-423), residuals (menu overflow, minimap 30 Hz, bot stance, 2x core line of
sight, nacelle collider, gamepad CI, staging + stage-3 fixes), mobile PAUSE fix +
collapsed-graphics CSS (AE), release CI verifies-only (AD). Held: H2 (PASS 88
candidate), AB, AL, AI, the four technique trials (merge audit pending), T.
Boot smoke 13/13 on all eleven arenas; Farcrysis admission guard green (1.297x).
Rollback: `python scripts/orchestration/publish_pass87.py --rollback`.

## PASS 88 publish record — 04:59 BST 2026-09-03 (see docs/PASS88_CUT_REPORT_2026-09-03.md)
Integration 255300e0 -> gh-pages {pass88 live, pass87 backup}; chooser generation
b77c111be540. Shipped: Lane H2 (HF-417 switch-fence fix without the first-load
regression; admission attributed). Boot smoke 13/13; Farcrysis admission guard
1.368x. Rollback: `python scripts/orchestration/publish_pass88.py --rollback`.
Not merged (branches pushed, for the morning cut): AI, AB, AL, the four
technique trials, T.

## HF-424 — owner 2026-09-03 06:15: today's pacing and plan
**Statement:** "we are at 80% of usage so maybe need to take it a bit more careful
today on volume" then "i will be away for 9 hours, so we can slowly but surely
work on things but using alot of compute, thoughts?" Plan: `docs/DAY_2026-09-03_PLAN.md`
(four blocks, at most two Opus chains at a time, a cut per block: PASS 89 now,
Farcrysis real arena + animation, Raid art + water everywhere, PASS 90 + hill-climb
receipts). Also 06:12: the source push had been blocked since 03:35 by the
`workflow` scope; fixed 06:18 after the owner re-authorised (pushed 2c08d0b8..00db4c07).

## HF-425 — owner 2026-09-03 06:40: the SAM-licence decision
**Statement:** "on the licence we can just not use that technique when guns are
involved, or create a similar skill that is slightly adapted? bit of both maybe."
- Rule: the ComfyUI video-mocap chain (SAM3D body) is NEVER used for anything
  that involves guns or weapons - no gun-holding clips, no reload/ADS/knife
  captures, no bot combat motion. It MAY be used for unarmed content (idles,
  emotes, civilian/environment characters, menu characters) with the licence
  recorded per clip.
- Adapted skill: author `video-mocap-permissive-pipeline` in the vault store -
  the same capture-to-clip pipeline on a permissively licensed body tracker (no
  SAM component), for weapon-involved motion; register row + eval record + guard
  accept per the technique-register procedure. Owner of the skill: the animation
  lane (AT) or a follow-up skill lane; not before block 2.

## HF-426..HF-429 — owner 2026-09-03 ~06:50 after playing PASS 88 (priority order: 426, 427; compute-careful)
**Statement (verbatim):** "the nuketown rebuild is not right, its based on an old
layout we had here, not the actual layout of black ops 2 nuketown, you need to do
some proper research and adjust the layout of the map and assets, then layer in
all the visual styles we had aimed for and approved in our older layout,
prioritise that ahead of other things and be careful with compute. I hope it wont
take long? Raid layout feels better but is missing all the nice detail you had in
the old version, get the same level of detail to the new layout and then enhance
it to be closer to the original map in lighthing texture and asset style too,
ideally with just code and our new skills techniques. There are also some issues
with the raid map layout not being true and accurate so you need to do better
research there too. i also coulndt see balanced gfx profile. Farcrysis needs a
total re work its assets and texures are still a mess and it hasnt used the new
techniques from threejs etc for its nature and water, that would need to be
sorted, so remove that map and park that for later, focus on sorting out
nuketown preview first then raid, and like i said be careful with compute"
- **HF-426 Nuke Town Rebuild accuracy (priority 1):** the rebuild reproduced our
  own older layout, not Black Ops 2 Nuketown. Lane AU: proper reference research
  from public overhead/callout maps and gameplay stills (view them, extract a
  schematic, reconcile sources, record proportions - describe and measure, copy
  nothing), rebuild `nuketown2`'s layout and props to it, THEN layer the approved
  visual style of the shipped Nuke Town (its materials, lawn, forest surround,
  mountain ring, lighting) onto the new layout in code. Falsifier: an overhead
  render of the rebuild beside the reference schematic with every structure,
  vehicle and fence in the reference's relative position within stated
  tolerances, judged by a skeptic who reads the reference sources independently.
- **HF-427 Raid Rebuild detail + accuracy (priority 2):** the same level of
  detail as the shipped Raid on the new layout, then lighting/texture/asset style
  closer to the original, code-only with the new skills; and better layout
  research (the current layout is not true to the original in places). Lane AV,
  after AU.
- **HF-428 Balanced profile not visible:** it exists on Lane AI's branch (Balanced
  profile + RTX explainer), which missed the overnight cuts; it is in the PASS 89
  integration now.
- **HF-429 Farcrysis parked:** hidden again (`selectable: false`) in PASS 89; the
  block-2 Farcrysis lane is cancelled; a future rework must use the new
  vegetation/water/interior-lighting skills. The admission guard keeps working
  for a parked build.
- Compute: one Opus chain per lane, serial (AU then AV), plus the PASS 89
  integration already running; no waves.
- **Owner 07:00:** away 90 min, then until ~15:00; "be careful with our 20%
  remaining compute and use gemini flash 3.8 as support through the bridge".
  Applied: Gemini 3.8 Flash (agy bridge) does the bulk work of each lane
  (reference research, schematic, first geometry/props pass); Opus runs one
  skeptic + one repair per lane; Fable coordinates. Serial: AU then AV.

## HF-430 — owner 2026-09-03 07:05: chiptune music
**Statement (verbatim):** "half the chiptune music sound and have it swap between
about 10 different variations and tracks, each one lasting about 90 seconds and
being random in order". Lane AW (Gemini bulk, Opus skeptic): music gain halved
(measured, not eyeballed: -6 dB on the music bus only, SFX untouched), ~10
distinct procedural variations/tracks of ~90 s each, shuffled order with no
immediate repeat, seamless swap, persisted volume respected; a unit test pins the
count, the durations and the no-repeat shuffle; a headless run records which
tracks played over 5 minutes.

## HF-431 — owner 2026-09-03 07:08: drop shot from sprint must not resume sprinting
**Statement (verbatim):** "if I am sprinting and press Z it should do the drop shot
but then not keep sprinting if i am still holding Shift, sort that too". Lane AX
(with AW): pressing the prone/drop-shot key while sprinting performs the drop shot;
the sprint latch is cleared so a still-held Shift does not resume sprinting from
prone (sprint must be re-pressed after standing); unit test on the stance/sprint
state machine + a headless keyboard sequence test (Shift held, Z, stays prone and
not sprinting; stand, Shift again sprints).

## PASS 89 publish record — 07:29 BST 2026-09-03
Integration 07453942 -> gh-pages {pass89 live, pass88 backup}; chooser generation
2dade140e0fe. Shipped: Lane AI (BALANCED profile, per-profile copy, RTX explainer,
ladder doc), Lane AB (time of day on every arena, host TIME OF DAY lobby row),
Lane AL (baked indirect tiers; two runtime blockers fixed with tests), Lane AO
(MotionBricks analysis tools, NO-GO on the build), HF-429 Farcrysis PARKED
(selectable false; Lane R's work and receipts kept). Held: AP GTA-art trial (its
street cell overruns the Map 3 playfield; relocate then re-measure), AM water
(its every-arena pond roster test is not shipped as a test), AN subway trial.
Full suite 5578/0; boot smoke 13/13; all five presets boot; RTX explainer
falsifier green. Rollback: `python scripts/orchestration/publish_pass89.py --rollback`.
HF-430/431 (chiptune rotation, drop shot from sprint): Gemini bulk + Opus
skeptic/repair ACCEPT_WITH_FIXES (four worker defects fixed: red ratchet, untested
shipped path, early timbre swap, wrong opening timbre); merged after the cut ->
next pass. Note for the owner: Shift while PRONE no longer stands you up into a
sprint (fresh Shift after standing); menu music not halved (game music only).
- 07:32: the Gemini bridge hit its individual quota ("resets in 4h9m") right as
  Lane AV (Raid) launched; AV is deferred to ~11:45 on Gemini. Opus continues
  only on Nuke Town (skeptic on Jobs 1-2, then Job 3 visual style) so priority 1
  is not delayed; the PASS 90 cut carries Nuke Town + chiptune/drop-shot.

### HF-426 progress 08:40 BST — Nuke Town Rebuild layout is now measured from first-party minimaps
The Gemini research was REJECTED by the Opus skeptic (three of five citations did
not exist; it reproduced our old layout again). Redone from the two Treyarch
minimaps (BO2 512 px and BO7 4096 px, which agree to ~1%): the playable map is
2.36:1 with the LONG AXIS ACROSS THE STREET (yard-house-road-house-yard), the
road is a stub opening into a cul-de-sac turning head (0.45 L), the MOVING TRUCK
is the open body (2x core on its cargo-box roof, climb via the cab treads) and
the 1960s COACH is closed cover, the houses nearly face each other (0.065 L
offset) with the garages set back 0.168 L behind their own driveway aprons, fence
gaps kept but off-axis from their rotational partners (the symmetric version
gave an 82 m clear lane). Arena rebuilt at 36 x 84 m (absolute scale is an
ANCHOR - one constant, no public source gives metres); 16 fidelity bands derived
from the schematic; spawn gate, parity 0/0, walkable 0, boot smoke 13/13, 60 s
run 99 fps zero errors. Commit f3615486. Job 3 (the shipped Nuke Town's approved
look: blue/yellow/orange houses, cream/red coach, lawn field, forest surround
and mountain ring re-fitted to the new footprint, menu preview re-captured) is
running on Opus now; PASS 90 follows.

## PASS 90 publish record — 09:34 BST 2026-09-03
Integration 0a1db1b3 -> gh-pages {pass90 live, pass89 backup}; chooser generation
6267b5120e57. Shipped: HF-426 Nuke Town Rebuild made accurate to Black Ops 2
Nuketown 2025 (first-party minimaps; across-street long axis, cul-de-sac stub,
open truck with the 2x core, closed coach, set-back garages, fence gaps) with the
shipped Nuke Town's approved look (blue/yellow/orange houses, cream-and-red
coach, lawn field, forest ring and mountains re-fitted, menu preview re-captured;
shared-generator lineage repaired); HF-430 chiptune at half volume with ten
~90 s tracks in a no-repeat shuffle; HF-431 drop shot from sprint clears the
sprint latch. Full suite 5647/0; boot smoke 13/13; identity OK. Rollback:
`python scripts/orchestration/publish_pass90.py --rollback`. Owner notes: absolute
scale of the rebuild is an anchor (one constant to rescale); Shift while prone no
longer stands you into a sprint; menu music was not halved (game music only).
Next: HF-427 Raid (Lane AV) on Gemini when its quota resets (~11:45) + Opus
skeptic, then PASS 91.
- **Owner 12:55:** "be careful with what you assign gemini i suppose if its
  fabricating things, maybe there is better suited tasks until the model swaps or
  a pro one comes". Rule from here: Gemini 3.8 Flash gets bounded mechanical work
  only (dressing from a verified schematic, instrument runs, guarded refactors,
  evidence capture); research, reference truth, gates and licences stay on Opus;
  every Gemini branch is Opus-verified before it ships. The running Raid lane's
  research (Job 1) will be treated as unverified until the Opus pass re-derives it.

## HF-432 / HF-433 — owner 2026-09-03 13:05 after playing PASS 90
**Statement (verbatim):** "new nuketown starting to shape up, still some issues with
wher stairs are,a the cover and size/shape of the side areas of the map and spawns,
needs refinement. Doors are too small shoudnt have to crouch, vechiles in mid
street need more accurate layout to original. Also when I go prone now it
dropsshots nicely but going crounced i still move fast, sort it out in the same
way?"
- **HF-432 Nuke Town Rebuild refinement (Lane AU2, Opus):** stair positions per
  the reference (which wall, which direction, landing), the side areas (yards /
  flanks: their size, shape and cover pieces), spawn placement, door openings a
  standing player walks through (>= 2.1 m clear, no crouch), and the mid-street
  vehicles placed as the reference has them (the truck off the road centre-line
  as measured - the 2x core position becomes per-arena, weapons-code change
  authorised by the orchestrator). Evidence: overhead beside the schematic, a
  door-height probe, a stair traversal probe, spawn gate.
- **HF-433 crouch speed (same worker):** crouched movement is slower (a crouch
  speed factor like the prone one; BO2-style ~0.6 of walk), no sprint while
  crouched, and the sprint latch clears on crouch the way HF-431 did for prone;
  unit tests on the movement state machine + the drop-shot e2e spec extended.
- **Owner 15:25:** "we have 13% usage remaining this week and it resets in 20
  hours, so lets plan like that." Plan: finish only the nearly-done Nuke Town
  refinement worker (all six HF-432 items + HF-433 committed; gates/report left)
  when the Opus API recovers from 529, cut PASS 91 with it, then STOP Opus work
  until the reset (~11:30 BST 2026-09-04). Raid's Opus verification (Lane AV
  check-and-finish; Gemini's Jobs 1-2 are on the branch, unverified) resumes
  after the reset -> PASS 92. No Gemini bulk work tonight either: every Gemini
  branch needs an Opus check before it ships.

## PASS 91 publish record — 15:51 BST 2026-09-03
Integration b939766a -> gh-pages {pass91 live, pass90 backup}; chooser generation
5ab5194ef158. Shipped: HF-432 Nuke Town Rebuild refinement (stair/landing/upper
hallway per the reference, side-area cover, spawns re-solved with a new gate,
doors >= 2.1 m clear, coach/truck/cars placed as the reference with a per-arena
2x core - the shipped Nuke Town's seat unchanged) and HF-433 crouch speed
(crouch has its own slower speed, cannot sprint, clears the sprint latch). The
worker was cut off three times by API 529; the orchestrator committed its final
item-6 edits after tsc 0 and 311 focused tests green. Gates on the cut: full
suite 5656/0; parity 0/0; walkable 0; boot smoke 13/13; identity OK. Rollback:
`python scripts/orchestration/publish_pass91.py --rollback`. NOT run: the 60 s
solo run on the refined arena (compute budget). Next (after the weekly reset,
~11:30 BST 2026-09-04): Raid Opus verification -> PASS 92.

## HF-434..HF-438 — owner 2026-09-03 17:15 after playing PASS 91 (voice)
**Statement (transcribed):** "loads of z-fighting all through the map so that needs
fixing. some of the geometry needs adjustments like stairs and being able to walk
up and down stairs and go out of windows and putting glass on the windows. one of
the trucks in the street needs a side entrance so you can go in over the left
side, right side, or the end, more similar to the actual Nuketown map. the areas
on the side of the main street need to be a bit wider and have cover - look at
the Black Ops 2 map yourself. I don't think we should have a ray tracing AND an
RTX mode ... the RTX mode as a separate runtime is fine, and just bake some ray
tracing into the quality profile and then even more in the max. the chiptune
music sounds good. the animations feel pretty good."
- **HF-434 z-fighting on Nuke Town Rebuild (P0):** coplanar surfaces flicker
  across the map. Likely causes: the ground-dressing decal plates at +0.02 m over
  the slab (and the lawn plate) with the 0.02 m near plane's coarser depth
  (~1 cm at 60 m), fence/wall/roof overlaps. Fix: decals via polygonOffset or a
  depth-tested offset that survives distance, or split the slab so nothing is
  coplanar; sweep every coplanar pair with the parity instrument; capture
  far-distance frames before/after.
- **HF-435 stairs + windows:** stairs walkable up AND down (traversal probe both
  ways); upstairs windows you can go out of (jump-out openings like the
  reference); glass panes on the ground-floor windows (shot-through, see-through,
  a pane you cannot walk through).
- **HF-436 truck side entrances:** the open truck's cargo box enterable from the
  left side, the right side and the end, as the reference's moving truck.
- **HF-437 street side areas:** the strips beside the main street wider, with
  cover pieces, per the reference (re-check the minimap's kerb-side zones).
- **HF-438 profiles:** no separate RAY TRACED preset; fold its features into
  Quality (lightly) and Max (more); RTX stays as the separate-runtime explainer.
  Lane AI's ladder doc, control-set hashes and the e2e option pins re-derived.
- Lanes: AU3 (HF-434..437, GLM first with Opus verification after the reset),
  AI2 (HF-438, GLM then Opus). Compute: 13% left this week; Opus resumes ~11:30
  BST 2026-09-04.

## HF-439 / HF-440 — owner 2026-09-03 17:30
**Statement (verbatim):** "please ingest these to our skills and use whatever might
make sense? https://github.com/PhiloLabs/fable51-worlds ; trellis in browser rather
than local? how many use? https://mesh-baker.needle.tools/ ; Any use or we already
got this or similar ? https://x.com/philippsieben/status/2095440655170294085 ; you
can use Opus a little bit as we still have 87% used and 13% remaining; put raid
rebuild to one side and polish up nuketown, as well as geometry the layout and
assets and textures and lighting need to be tip top, raid can come next"
- **HF-439 three sources to ingest** (Lane AZ, Opus, one pass): resolve each
  (fetch, licence, what it observably is, who uses it), register rows, write or
  extend skills where they earn it, and answer the owner's three questions
  (Trellis in the browser vs local; mesh-baker adoption and fit; whether the
  philippsieben technique is something we already have). Vault + AKP procedure.
- **HF-440 Nuke Town Rebuild polish first, Raid parked:** after the GLM geometry
  pass (HF-434..437), an Opus "tip top" pass on layout, assets, textures and
  lighting with the brief-driven critic loop and the judgeset; Raid (Lane AV
  check-and-finish) waits behind it. Compute: 13% left; Opus "a little".
- **Owner 17:35 (HF-441):** "if load time is a quick win, get that in; can we get a
  build live tonight with partial improvements for nuketown maybe by 7-9pm? i can
  give feedback then". Plan: PASS 92 cut ~20:00-20:30 with whatever GLM-3 has
  landed green (z-fighting, stairs/windows/glass, truck openings, side strips), the
  profile fold if GLM-4 lands, the skills study docs. Mechanical gates only
  tonight (fidelity, parity, walkable, spawn, full suite, boot smoke); the Opus
  review of the GLM branches follows after the reset. Load time: no quick win is
  on the shelf - H2 shipped the first-load fix in PASS 88; the remaining levers
  (switch median +0.5 s, deploy 14-20 s attribution) are a day's work each, so
  they are not in tonight's build.

## HF-442 — orchestration 2026-09-03 18:25 (PASS 92 build-up)

- **Deploy-phase attribution measured (HF-441 follow-up):** the Gemini-via-OMP
  investigation (branch `deploy-attribution`, merged 612a4a83) measured match
  admission at 12.8–17.8 s across four arenas. Two steps dominate:
  `weapon-switch-rehearsal` (~5.1 s median) and `stable-cadence-wait` (a constant
  ~5.2 s on every arena) — together 60–79 % of admission; bots add 2.4–4.0 s on
  bot arenas. Report: `docs/evidence/pass92/deploy-attribution/REPORT.md`.
- **Quick-win candidate (NOT for PASS 92):** make `stable-cadence-wait` adaptive —
  exit as soon as the presented cadence has been stable for N frames, keep 5 s as
  the ceiling, never remove the settle (PASS 82/83 freeze fixes). A Gemini-via-OMP
  worker is preparing the candidate on branch `admission-cadence-wait` (base
  612a4a83); it ships only after an Opus review and the tripwire (in-combat
  pipeline creations 0) and 12 s WebGPU fence stay untouched.
- **Nuke Town geometry (HF-434..436):** GLM landed three commits (5b4f3c1e
  z-fighting tiers, 9f6011d8 stairs/windows/glass, d1a0cf58 truck openings) and
  is finishing HF-437 (wider street sides with cover). An Opus skeptic+repair
  review runs on `nuketown2-geometry-review` (checked out at d1a0cf58) in
  parallel; PASS 92 = PASS 91 + skills-study docs + Map 3 street-cell relocation
  + profile fold (HF-438) + deploy attribution docs + the reviewed Nuke Town
  geometry. Target cut 20:30, no later than 21:00, as a PREVIEW for owner
  feedback (mechanical gates; full play verification overnight).

## HF-443 — Opus review of the Nuke Town geometry branch, 2026-09-03 19:00

- **Verdict:** GLM's four commits (HF-434..437) VERIFIED-OK on real geometry and
  real Rapier probes; three review commits added (`7caa643d`, `7dd21b1e`,
  `205f615c`): stair-headroom gate now uses capsule + autostep (the rule the arena
  derives), the descent probe asserts upper-floor waypoints and a monotone walk,
  truck openings measured on the built bodies, and the coplanar instrument no
  longer silently skips the lawn field, forest ring and mountains (16 meshes now
  listed as UNAUDITED instead of "skipped: 0").
- **Depth math:** near 0.02 m, far 180 m → depth quantum ≈ 1.07 cm at 60 m,
  1.9 cm at 80 m; the old +0.02 m decals and exactly-coplanar floors/road were the
  z-fighting. Tiers ground 0 → road/floors −1 → lawn/dashes −2 (integer
  polygonOffset units, as WebGPU depthBias requires; verified to reach the WebGPU
  path in three 0.185.1).
- **Gates at 205f615c:** tsc 0; 48/48 (fidelity, parity, shed registry, map
  selection, factory registry); coplanar FINDINGS 0; nuketown2 boot smoke 27.8 s
  on native WebGPU.
- **OPEN (not tonight):** (a) forest contact skirts at +27 mm may still shimmer
  beyond ~95 m — polygonOffset −3 requested as a follow-up; (b) ground-floor glass
  is permanent (shipped Nuke Town's breaks) and bots may not see through it →
  overnight/tomorrow item; (c) undressed ground patch 1.25 × 2.7 m between the
  turning head and the east street lawn; (d) a magenta marker near the south
  driveway in two captures — being identified before the cut.

## PASS 92 publish record — 2026-09-03 19:14 BST

- **Published** by `scripts/orchestration/publish_pass92.py` (exit 0) from head
  `ce1c8f76` (roll `cb3c5619` + changelog areas labels). gh-pages `8bab9796`;
  channels exactly `['pass91', 'pass92']` (pass90 retired per HF-400); root
  chooser generation `f45765ee9b4f`; Pages build `built` at 19:17.
- **Live checks (19:22):** channel root 200, `map3.html` 200, retired pass90
  404, `release-index.json` generation `f45765ee9b4f`, identity chunk
  `release-identity-BwaHgmvg.js` names PASS 92 (plus the historical PASS 64
  evidence record, byte-identical to PASS 91's chunk), changelog areas
  `ARENAS · GRAPHICS · PERFORMANCE`.
- **Gates at the cut (Opus release engineer):** tsc 0; release tests 83/83;
  plan test 9/9; full suite 578 files / 5659 tests; identity guard OK; freshness
  guard clean; boot smoke 13/13 on native WebGPU (first run 12/13 — the
  skyline-terminal MENU boot exceeded its 90 s wait after twelve prior boots,
  passed standalone in 38 s and 13/13 on re-run: WATCH ITEM, not a Terminal
  fault). Two content fixes, no gate touched: the changelog title/summary must
  name the pass (HF-406), and a pre-existing weapon-name regex hit on a QA
  comment in `src/map3/street-cell.ts`.
- **Content:** PASS 91 + Nuke Town geometry from owner play (HF-434..437, Opus
  review HF-443) + HF-438 profile fold + Map 3 street cell + deploy attribution
  (HF-442) + skills-study docs (HF-439). PREVIEW for owner feedback; the
  overnight Lane BA loop and the morning Opus verification follow.
- **Overnight blocker (19:16):** the Lane BA chain launched and failed on every
  step in 33 s: OMP 18.1.1's main-profile credential store (`agent.db`) is
  empty (0 credentials, 0 settings), wiped some time after 18:33 when the last
  GLM job still ran. Owner must `/login` zai and google-antigravity in OMP
  again; the chain relaunches unchanged afterwards. Cause unknown — gotcha to
  follow once it is.
- **Owner 18:58:** "glm usage is at 80% of 5hr window, gemini looks better
  though" → Lane BA rebalanced: Gemini builds cycles 1–2, GLM cycle 3 + final;
  automatic fallback between the two; critics stay Gemini.

## HF-444 — owner 2026-09-03 19:25: use the local Qwen model overnight

- "some more resource for you, can you use my qwen local model, i think its 27b
  iq3xxs with mtp ... 64 or 80k context? ... it can work all night, find some
  jobs its good at?" → Local Qwen3.8-27B UD-IQ3_XXS (llama-server :8080, ctx
  65536, native MTP, idle-sleep 180 s) becomes a third cheap worker. Task fit:
  small-context, mechanical, self-verifying jobs with a gate each — stale
  comment audit, script usage headers, an unreferenced-export finder
  (report-only), gotcha drafts from the day's findings, the morning report
  skeleton. Worktree `aa-claude-qwen`, branch `qwen-tidy-overnight`. GPU rule:
  Qwen jobs wait while the Lane BA chain holds `ba-running.lock`, so the
  Nuke Town captures never fight a 13 GiB model for VRAM; Opus verifies every
  Qwen commit in the morning before anything merges.

## HF-445 — 2026-09-03 19:50: local Qwen moved to port 8090 (WSL docker-proxy holds loopback 8080)

- Symptom: OMP jobs on the local Qwen returned `401 Invalid API key` (Google-style
  `x-goog-api-key` wording) while llama-server on `0.0.0.0:8080` was healthy.
- Cause: a Docker container inside WSL (`docker-proxy -host-port 8080 ->
  172.18.0.4:8080`, up since ~17:10, owner's) is relayed by `wslrelay.exe` onto
  `127.0.0.1:8080`; Windows prefers the specific loopback bind, so every
  loopback request lands in the container, not in llama-server.
- Correction: Qwen relaunched with `-Port 8090` (launcher pre-flight guard
  green); additive OMP provider `qwen-local-8090` (models.yml backed up);
  Qwen chain retargeted and relaunched 19:46. Nothing of the owner's touched.
- Owner decision: DSH, Zoo/Roo, Continue and Hermes still point at `:8080` and
  will reach the container until either the container moves or those configs
  move to 8090.

## HF-446 — owner 2026-09-03 20:12: Codex properly configured, Luna 5.6 x-high joins the sweeps

- "can you ensure codex now has proper settings like you do for skills and CI CD
  etc, i just re enabled my open ai sub, then maybe you can use one of its luna
  ai agents in the sweeps too, not sol, x high luna 5.6 can do some work for u"
  → Audit and fix the Codex harness on dave-gaming-pc (shared skill store link,
  global AGENTS.md bootstrap equivalent to Claude's CLAUDE.md/AKP adapter,
  model `gpt-5.6-luna` at x-high effort, repo AGENTS.md + cut-ritual
  conventions honoured, AKP adoption receipt for Codex), prove the route with a
  bounded smoke task, then give Luna a real sweep job: the skeptic review of the
  adaptive admission cadence-wait candidate (branch `admission-cadence-wait`).
  Luna only (never Sol). Opus still decides what ships.

## HF-447 — owner 2026-09-03 22:00: overnight plan to 06:00, budget guard

- Owner: "let me know where we are atm, then i am going to sleep and you can
  work through the night, i'll come see you at 6"; "you may need to tweak a few
  things about qwen to make it useful so keep an eye on it"; "be mindful you are
  at 92% used now so maybe need to pace yourself better through the evening and
  drop any opus to less".
- **State at 22:00:** PASS 92 live (19:14). Lane BA round 1 on
  `nuketown2-tiptop`: cycles 1–2 landed 10 feature commits (road/kerbs, facade
  recess, street furniture, interiors + lighting, glazed windows, materials,
  vehicles, pool), 26/26 fidelity+parity on the cycle-2 head; cycle 3 on Gemini
  (GLM 5-hour limit hit at 21:12, resets 05:04). Codex configured (HF-446),
  Luna smoke PASS, Luna skeptic review of `admission-cadence-wait` running,
  Codex native AKP re-attestation running. Qwen chain on :8090 with vision:
  Q1 partial (1 commit), Q2 empty, Q3 running.
- **Overnight automation (no orchestrator tokens):** BA round 1 done → BA round
  2 (cycles 4–6 + final, Gemini primary, GLM fallback) → Luna x-high pre-review
  of the whole tip-top branch (gates, critic trajectory, SHIP verdict) → Qwen
  Q1 rerun with low thinking after its chain. 05:15 wake → morning decision
  with at most one small Opus check; the Opus work moves after the ~11:30
  weekly reset. Nothing merges or publishes overnight.

## HF-448..451 — owner 2026-09-03 22:15 after playing PASS 92

- **HF-448 (P0):** "there is still massive Z fighting on the house ground floor,
  needs a big fix" → the polygonOffset tiers did not cure the interiors. Fix
  geometrically: interior slabs +0.06 m above the ground plane, no ground/lawn/
  dressing drawn under house or garage footprints, a house-interior class in
  the coplanar instrument that ignores material offsets, a fidelity assertion,
  and grazing-angle interior captures. Injected into every remaining overnight
  build step (round 1 FINAL, round 2 cycles 4–6, FINAL).
- **HF-449 (P1):** "the stairs are still sticky to navigate" → one invisible
  smooth ramp collider per flight under presentation-only treads; walk probe
  both ways with a ground-contact and frame-budget assertion; parity gate kept.
- **HF-450 (P1):** "the fps seemed bad but maybe as my pc is busy with qwen?" →
  likely partly Qwen (13.8 GB VRAM when awake) and the overnight captures
  sharing the GPU while the owner played; but the overnight builder must now
  quote draw calls / frame time before and after each cycle against the
  PASS 92 baseline, batch static props, LOD vegetation, and cut density if
  draw calls grow more than 15 %.
- **HF-451:** "the graphics/assets/textures/threejs techniques i shared need
  to be used overnight if compute allows as the map looks and feels like basic
  geometry atm, but nicely playable so thats good" → the ingested skills are
  already the builder's brief; the prompt now forbids flat single-colour
  surfaces anywhere a critic camera can see.

## HF-452 — overnight results, 2026-09-04 05:05

- **Nuke Town tip-top branch** (`nuketown2-tiptop`, head e1ce30f1, 28 commits
  over PASS 92): round 1 cycles 1–3 (Gemini; road/kerbs/aprons, facade recess,
  street furniture, interiors + lighting, glazed windows, siding/shingle/fence
  materials, vehicle detail, pool, breakable-glass/bot-LOS attempt) with critic
  scores per cycle; round-1 FINAL never ran (GLM and Gemini both hit their
  quotas 21:12–21:50). **Luna x-high fixed the owner's P0/P1 (HF-448/449):**
  interior slabs +0.08 m with the ground, lawn and dressing cut out of every
  house/garage footprint (new house-interior coplanar class = 0, old FINDINGS
  0, UNAUDITED unchanged at 16), and one collision-only ramp per stair flight
  (probes up/down, max 1 ungrounded frame, parity gate green). Capture OPEN
  (GPU < 3 GB while Qwen was awake). Round 2 (cycles 4–6 + final) starts on
  Gemini after its quota reset; Luna pre-review of the whole branch follows.
- **Load time:** Luna's skeptic review of `admission-cadence-wait` →
  SHIP-WITH-FIXES, three hardening commits landed (fail-closed switch probe,
  insufficient-history coverage). Luna also implemented the second lever on
  `admission-rehearsal-scope` (new `src/weapon-rehearsal-scheduler.ts`; only
  held weapons + arena roster rehearsed at admission, the rest deferred to safe
  windows with a synchronous fallback before an unrehearsed combat switch;
  legacy-main +88 lines). Both need the morning browser tripwire probe.
- **Codex:** native AKP re-attestation done (receipt
  `dave-gaming-pc--codex.json`, trust amber → check PASS, pushed 90863bc).
- **Qwen:** 4 real deliverables (export finder, gotcha drafts, morning-report
  skeleton, one comment fix); Luna's experiment diagnosed the empty runs
  (open-ended multi-file tasks overflow the 65k context → compaction loop) and
  recommends single-file exact-spec prompts with `--thinking low`.
- **Gotcha (Codex):** every `codex exec` job hung after printing its done line
  because config.toml's `notify` hook (`codex-computer-use.exe turn-ended`)
  blocks on exit; the wrappers never wrote their exit markers and the gated
  chain stalled from 22:30 to 05:05. Correction: pass `-c notify=[]` on
  headless runs (applied to the pre-review launcher).

## HF-453 — owner 2026-09-04 06:40: "send me a HITL version to play and review"

- **Handoff claim:** candidate `34e3b38b` on branch `pass93-candidate` = live
  PASS 92 head (`ce1c8f76` + docs) merged with `nuketown2-tiptop` at `f35dcb06`
  (43 commits: Luna's P0/P1 fixes + six polish cycles + final pass). Merge was
  conflict-free (122 files, +6044/−151). Built 06:41 (`dist` in
  `aa-claude-hitl`), served locally by `vite preview` on
  `http://127.0.0.1:4300/` (pid 4724). The build still calls itself PASS 92 —
  the identity is rolled only at the real cut. NOT published.
- **Out of scope for this candidate:** the two load-time branches
  (`admission-cadence-wait`, `admission-rehearsal-scope`) — they await the
  browser tripwire probe. Luna's tip-top pre-review is running in parallel; its
  verdict and any fix commits land after this candidate was built.
- **Owner checklist to inspect:** house ground-floor z-fighting gone at any
  distance and angle; stairs smooth up and down in both houses; upstairs window
  drop-outs; ground-floor glass; truck open on three sides; kerb-side cover;
  road/kerb/facade/interior detail and materials; fps with Qwen idle.

## HF-454 — owner 2026-09-04 06:50–07:15: "it is not stable, i cant even launch nuke town rebuild" / "pass 92 on the web doesn't work either" / "pass 91 doesn't work either, get all this sorted"

- **Root cause (VERIFIED 07:19, orchestrator):** in the owner's installed Chrome
  153.0.8010.12 with STOCK flags, the real visitor path (menu → Nuke Town
  Rebuild card → DEPLOY) never reaches a live frame on the live PASS 92 and on
  the local candidate, default and quality profiles alike. Console:
  `Render pipeline creation failed (renderPipeline_RenderPipeline_25): An error
  occurred while generating Tint IR — swizzle view instruction still has usages
  after lowering` → invalid command buffer → `[Nuke Town Rebuild map selection
  failed] WebGPU queue completion failed`, repeating every ~2 s. With
  `--enable-unsafe-webgpu` the same builds boot on default/quality/max — every
  QA smoke passes that flag, which is why all gates were green (the exact trap
  recorded in the Chrome 153 Tint gotcha of 2026-08-30). The existing WGSL
  swizzle shim misses this pipeline's shader. Not a GPU-memory, driver or
  Chrome-update issue: GPU had 14 GB free, driver unchanged, the pending Chrome
  153.0.8010.28 update is not yet active (new_chrome.exe staged, running
  build is .12), no Chrome crashes since 08-31. Edge 152 and headless Chromium
  load the menu fine; the failure is at arena pipeline creation.
- **Evidence:** `docs/evidence/pass93/chrome153-live-repro/` (stock-flag probe
  JSON per profile against the live URL, plus the probe script). Luna's
  three-profile visitor reproduction with the unsafe flag (PASS on all three)
  is in `aa-claude-hitl/docs/evidence/pass93/hitl-repro/`.
- **Action:** one Opus agent (owner-authorised) is producing a hotfix on
  `pass93-chrome153-hotfix` off the live head: extend the shim, install it
  before the first pipeline, add an honest stock-flags boot spec to the cut
  ritual. The Nuke Town tip-top branch (Luna verdict DO-NOT-SHIP: identical
  siding on both houses, stray marker cubes) waits behind the hotfix.

## PASS 93 publish record — 2026-09-04 08:10 BST (hotfix)

- **Published** by `scripts/orchestration/publish_pass93.py` (exit 0) from head
  `1aad84ab` (roll `2dcc3214` on the HF-454 hotfix merge `9e1e0344`; Opus
  follow-up `1aad84ab` keeps device-feature negotiation observable). gh-pages
  channels exactly `['pass92', 'pass93']` (pass91 retired per HF-400); root
  chooser generation `2ff646727518`.
- **Content:** PASS 92 + the Chrome 153 hotfix only: the WGSL swizzle rewrite
  now composes every chained swizzle (`.xyz.xy`, `.xyz.z`, `(mat4*vec4).xyz.y`
  in the ray-traced post composite that Nuke Town Rebuild deploys with) and is
  installed on the negotiated device before the first pipeline; new honest
  gate `npm run qa:stock-boot` (installed Chrome, no unsafe flag, real menu →
  Solo for nuketown2 + atomic-acres). The Nuke Town tip-top branch is NOT in
  this pass.
- **Gates at the cut:** tsc 0; release tests 83/83; plan test 9/9; full suite
  578 files / 5662 tests; identity guard OK; freshness clean; boot smoke 13/13
  (8.0 min); stock-flags boot 4/4 (nuketown2 55 s, atomic-acres 1.1 min).
- **Cut environment:** run in `aa-claude-hotfix` because `aa-omp-pass84`'s
  shared node_modules was half-reinstalled by an elevated Codex run and cannot
  be repaired unelevated (EPERM on the rolldown binding); the integration
  branch is checked out in `aa-claude-hotfix` until the owner repairs it.

## HF-473 and HF-465 — PASS 94 lane I4 status, 2026-09-04

*(The HF-472/HF-473 rows themselves are authored on
`contrib/dave-gaming-pc/omp/pass84-overnight` at `2a367bbd`; this section records
what lane I4 did about HF-473 and HF-465 on
`contrib/dave-gaming-pc/claude/nuketown2-handedness` and is written to be
additive so the two merge without touching each other's rows.)*

- **HF-473 (garage handedness) — IMPLEMENTED, and the underlying question is now
  CLOSED rather than merely made settleable.** R4 §3 could only leave it OPEN
  because no source it could open states which end each garage is on; the owner
  played Black Ops 2 on Steam and answered it. The map is 180°-rotationally
  symmetric, so both houses were wrong together and a rotation could not have
  fixed it: the correction is a **mirror across the street axis**, applied once
  through `NUKETOWN2_HANDEDNESS` in `src/nuketown2-layout.ts` and enforced at the
  four places an authored number becomes a solid, so a half-mirror is
  structurally impossible rather than merely tested for.
  - Falsifier, and it is a gate rather than a look now: `puts each garage on the
    RIGHT of its own house, seen from that house own back-yard spawn` walks the
    cross-product sign from all twelve spawn points against BUILT geometry, and
    `agrees with NUKETOWN2_HANDEDNESS on every handed feature, and the minimap
    agrees with the world` holds the bench, mailbox, drive edging, car and
    driveway apron on the garage side and the interior flight on the blind wall.
  - Claim-state **VERIFIED** against the owner's own play session, not a pixel.
    If the owner ever reads it the other way the flag becomes `1` and every
    handed feature follows in one edit.
- **HF-473, minimap half — CHECKED, one NEW finding, reported OPEN.** The owner's
  memory of a back-to-front Atomic Acres minimap was the reason to look. The
  chirality is **correct**: `worldToMinimap` is a left-handed pixel space (+x
  right and +z up at once, which is a view from below) and both consumers undo
  it — the player-up HUD with `playerUpScaleX() = −1`, the static Tri-Pass board
  with `width − x` — so the sign of a screen-space bearing equals the sign of the
  world one, and the gate asserts that equality.
  - **OPEN (new, not caused by this lane):** the minimap paints a 36 × 84 m arena
    into a SQUARE canvas, so x is scaled 6.1 px/m and z 2.6 px/m. A non-uniform
    scale composed with the player-up rotation is not a similarity, so BEARINGS
    are stretched — Nuke Town Rebuild's garage sits ~12° right of forward in the
    world and lands a few pixels *left* of the map's centre line. Chirality
    survives (the composite determinant is positive) but direction-finding on
    this arena is misleading. The fix is an isotropic pixel scale with
    letterboxing, which touches `src/minimap.ts`, `legacy-main.ts` and the
    Atomic Acres static landmark layer — a HUD lane, not this one. Deliberately
    NOT asserted, because asserting the current bearing error would freeze it.
- **HF-465 (missing balconies) — IMPLEMENTED.** R4 §5, built as specified except
  where this arena's own geometry contradicted the spec; each contradiction was
  found by a gate and moved the geometry, never the gate. Rear deck, 1.1 m rail,
  posts to the lawn, a 1.8 m door with a 0.4 m header, an 11 × 0.30 m exterior
  flight as one collision-only ramp plus presentation treads, a 0.5 m window
  ledge and a porch canopy — all through `pair()`, both houses.
  - Deviations from R4 §5, with reasons: the deck sits centred in the wall the
    upper back window leaves (R4's own position put the deck's rail return
    0.25 m off that window's centre line and the window stopped being an exit);
    the flight's end of the deck carries a 0.6 m newel instead of a full return
    (a full one stood across the top of the flight); and the canopy is two wings
    plus a raised head bay (one 2.15 m slab put a 1.97 m soffit over the front
    door's approach, under this map's 2.24 m band).
  - Drop-out semantics kept and asserted through `computeFallDamage` rather than
    restated: the exterior flight is free, a rail vault costs 6.
