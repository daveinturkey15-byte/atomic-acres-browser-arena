# PASS 94 candidate - integration evidence

Integrator: Claude Code (Opus), dave-gaming-pc, 2026-09-04.
Worktree C:/Users/david/projects/aa-claude-hitl, branch
contrib/dave-gaming-pc/claude/pass93-candidate.
Base: origin/contrib/dave-gaming-pc/omp/pass84-overnight @ eeb0b328 (PASS 93 head).

## Merge order and conflicts

1. claude/killstreak-tuning (517b7491) - no conflicts.
2. claude/spawn-distribution (fc9baf63) - src/legacy-main-size-ratchet.test.ts.
3. claude/nuketown2-handedness (5f5ecc47, brings tiptop + owner-round2) -
   src/nuketown2-arena.ts, docs/PASS84_OWNER_FEEDBACK_2026-09-02.md.
4. claude/nuketown2-ballistics (d8eaa1df) - no textual conflict, two behavioural.
5. claude/vehicle-forge (a1dec8a3) - src/nuketown2-arena.ts,
   scripts/qa/viewpoint-catalog.mjs, src/rendering/arenas/nuketown2.ts.

Every conflict kept BOTH sides' intent. Where two lanes' GATES contradicted, the
stricter reading won and the cost is written into the file that carries it.
Nothing was lowered, skipped or annotated away.

## The four cross-lane defects the merge exposed

1. Nuke Town spawn table. The spawn lane pinned 8 points/team at a 7 m mean
   nearest-neighbour and reached it at |z| = 40; the arena's fidelity gate
   requires every spawn inside the fenced yard, |z| < 36. The six authored points
   cannot carry the new floor either (mean nearest 6.26 m). Re-solved by
   scripts/qa/solve-nuketown2-spawn-layout.ts against the union of both
   constraint sets: mean nearest 7.68 m, closest pair 6.08 m, 0 spawn-to-spawn
   sightlines, 16/16 clean under measureSpawnLayout. Cost recorded in the arena
   file: worst exposure 31.6 -> 33.7 m, mean depth 26.5 -> 28.7 m, both inside
   every band the gate enforces.
2. Forged vehicle skins stood one mirror away from their bodies. The
   vehicle-forge lane branched before HF-473 and placed skins at raw AUTHORED
   coordinates while centred/streetVehicle/pair mirror x. No gate could see it,
   because a skin is presentation. Mirror now applied once in the placement loop
   (position and yaw together) and gated by "lands every forged vehicle skin on
   the collider body it dresses, mirrored with it" - verified to RED when the
   mirror is removed.
3. HF-465's timber went unrated, so the shared NAME rules decided its material:
   porch canopy head -> `reinforced` (the failure sentinel, 2 over a ceiling of
   0), porch canopy wing -> the JETLINER rule, canopy/balcony posts and rails ->
   structural steel, window ledge sill -> GLASS. All are m.trim timber and are
   now rated `wood` explicitly.
4. Three more arenas' spawn contracts: Skyline's new points sat 4.00 m apart
   under a 6 m floor (re-spaced), High Seas' and Farcrysis' exact-count pins
   raised to the authored reality, and Raid's two new points had no x-mirror
   partners at all - re-solved by scripts/qa/solve-raid2-mirrored-spawns.ts
   holding cross-team separation at 64 m and zero enemy-LOS pairs.

## Gates at head 7ec0be01

| gate | result | file |
|---|---|---|
| npx tsc --noEmit | exit 0 | gate-tsc.txt |
| named vitest set (19 files) | 400 passed | gate-vitest-named.txt |
| npx vitest run (whole suite) | 585 passed, 1 skipped / 5771 passed, 2 skipped, 0 failed | gate-vitest-full.txt |
| find-coplanar-pairs.ts | FINDINGS 0, HOUSE-INTERIOR 0, STREET 0 | gate-coplanar.txt |
| npm run build | exit 0 | - |
| qa:stock-boot (external preview :4300) | 4 passed | gate-stock-boot.txt |
| pass74-arena-boot-smoke -g nuketown2 | 1 passed | gate-arena-boot-smoke.txt |
| verify-hf390-ballistics-cdp --arenas nuketown2 | PASS, hardware WebGPU | gate-hf390-ballistics.txt |
| verify-hf467-material-classes-cdp --arenas nuketown2 | FAIL - see below | gate-hf467-material-classes.txt |
| review-camera capture, 17 stations | PASS, webgpu, nvidia | capture-manifest.json, nuketown2/ |

## OPEN: the HF-467 material-class probe is RED

First run ever - the I1 lane recorded it NOT RUN (free VRAM stayed at 873-922
MiB against its 3000 MiB floor). Verdict: "concrete is class 'stop' but a pistol
crossed it 30x". Diagnosed by surface name with the same ray fan:

    CROSSED: street kerb 0+1 (both halves) 20, street asphalt 0+1  8,
             north/south yard side store    2
    STOPPED: turning head 52, asphalt 63, kerbs 32, stores 100, butts 4

The arithmetic: `concrete` is entryCost 2.5 + 7.0/m, and the sidearm's budget
clears that for any traversal under about 13 cm. The road slab and the kerb ARE
0.12 m, so they are crossable by construction; the two store crossings are
corner grazes where the chord approaches zero and only the entry cost is
charged. NO ROUND LEAVES THE MAP: `earth` (4.0 + 12.0/m) is never crossed once
in the sweep, and the ground tile beneath the asphalt stops every one of these.
A plumbing defect, not something the owner can see or exploit in the HITL build.

Left RED and OPEN rather than papered over. The call belongs to the ballistics
lane and is one of:
  (a) rate the road, kerbs and turning head `earth` like the ground beside them -
      which is what HF-467's own comment already claims they do ("both stop a
      round") and which `concrete` does not deliver at 12 cm; clears 28 of 30;
  (b) charge a minimum traversal on `stop` materials so a corner graze cannot
      cross; clears the remaining 2 and every future one;
  (c) restate the probe's contract in terms it can hold - which must not be
      taken as a shortcut, because as written it is the honest statement of the
      owner's sentence.

## Owner captures

Stations are nuketown2/*.png, three samples each (.png, .s1, .s2).

- nuketown2-north-yard.png / nuketown2-south-yard.png: stood on an authored
  back-yard spawn looking at the back of your own house. THE GARAGE IS ON THE
  RIGHT IN BOTH. Confirmed twice: projected into the capture camera
  (handedness-frame-report.txt) the garage roof lands at px 730 of 1280 and the
  house roof deck at px 530 - 9.9 deg right of aim against the house centre
  12.0 deg left; and the frames show the low flat-roofed wing and its
  red/orange door wall to the right of the two-storey body. All 16 spawns, not
  just the two stations, report garage RIGHT.
- Vehicles (vehicle-near/mid/far, coach-elevation, truck-cab-near): they read as
  vehicles, not crates. The sedan has a bonnet, raked screen, boot, round lamps
  and covered wheels; the coach a rounded nose, continuous glass band, waist
  line and red rear lamps; the truck cab is a cab-over with a raked screen and
  steel wheels. The cargo box behind the cab stays boxy - authored gameplay
  geometry, by the lane's design. One observation rather than a defect claim:
  under this low purple key the tyre band reads violet rather than black on the
  sedan and the truck cab.
- nuketown2-north-balcony.png: the rear balcony, its exterior flight and the
  upper back door are present and read correctly, but the yard side store fills
  the left third of the frame. Subject legible, framing not ideal; worth
  re-aiming in a later pass.
