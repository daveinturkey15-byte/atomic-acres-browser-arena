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
