# MUSE-1 whole-branch skeptic review — PASS 94 candidate

Range: `origin/contrib/dave-gaming-pc/omp/pass84-overnight..HEAD` (78 files, +10092/−537 across `src scripts tests`).
Head lane merges: killstreak tuning + taser (HF-458), spawn distribution (HF-456),
Nuke Town round 2, handedness mirror + balconies (HF-473/HF-465), ballistics wiring
(HF-467/HF-464), vehicle forge, HF-467 stop-class floor (`48aab0ae`).
Claim-states: **VERIFIED** = read the code/test that proves it. **SUSPECTED** = inferred,
needs a check. **OPEN** = could not decide from the diff; named falsifier given.

## 1. Behavioural changes a player will feel, by lane

### Lane A — killstreak tuning + taser (HF-458, owner 2026-09-02)
- **VERIFIED** Chopper rockets 6 → 12 per activation; autopilot may spend at most 6
  (`src/killstreak-tuning.ts`: `CHOPPER_MISSILE_CAPACITY_AFTER = 12`,
  `CHOPPER_AUTOPILOT_MISSILE_BUDGET = 6`; consumed in `src/killstreak-runtime.ts`
  via `missilesRemaining`/`aiMissilesFired`). A player who possesses immediately gets
  all 12; autopilot fires at a visible hostile only, ≤90 m, cadence 2600 ms, first
  launch ≥2000 ms after activation. Pinned by `src/chopper-autopilot-rockets.test.ts`.
- **VERIFIED** Chopper 30 mm damage −25%: 34 → 25.5, minimum 22 → 16.5
  (`src/killstreak-tuning.ts` + `src/killstreak-support-catalog.ts`). Half-damage falloff
  shell now halves the admitted rounded shell (`supportGunDamageAtDistance`), not the raw
  profile — `src/chopper-gunner-fire-ray.test.ts` re-expressed accordingly.
- **VERIFIED** Drone Swarm and Piloted Drone: fire rate +25% (cadence ×0.8), movement
  +15% (3 → 3.45 m/s manual; autonomous stays exactly 2× manual = 6.9 m/s).
  Swarm lane interval moves with the gun (460 ms → 368 ms) or the buff would be unfelt.
  Pinned as ratios + exact decimals in `src/killstreak-support-catalog.test.ts`,
  `src/killstreak-drone-deployment.test.ts`.
- **VERIFIED** Piloted Drone gains a 3-charge right-click taser (RMB, same slot as the
  Chopper's RMB missile; gamepad ADS button when possessing). 22 m range, 1500 ms
  cooldown, charges belong to the drone (AI spending reduces the human's remainder).
  Unpiloted drone auto-fires at nearest visible hostile in range. Victim: zero movement
  input, no sprint, no jump for ~1000 ms; electric-blue edge vignette + 18 Hz crackle +
  26 Hz camera jitter instead of the white flash. HUD `#gunner-taser-status` counter
  ×n/3 READY/EMPTY; `#taser-shock` overlay in `src/ui/pass64-shell.ts`, styles in
  `src/style.css`, wiring in `src/legacy-main.ts` mirroring the flashbang path.

### Lane B — spawn distribution (HF-456)
- **VERIFIED** One shared selector `selectSpawnCandidates` (`src/spawn-selection.ts`)
  now serves player + bot paths in `src/legacy-main.ts` (`spawnPoint()`,
  `selectSafeBotSpawn()`): full valid tables passed (no pre-collapse to one side),
  team-side preference as soft 50000 side-penalty + preferred-side pool, 12 s
  cross-actor spawn-use history (`recentSpawnUses`, 64-entry cap, pruned by `nowMs`),
  threat/death/occupancy inputs retained. Solo/explore distributes across the full map.
- **VERIFIED** Every arena widened 6 → 8 authored points per team (Rustworks, Gun Range,
  Skyline, Farcrysis, High Seas, Test1, Test2, Nuke Town Rebuild re-solved in-yard,
  Raid2 re-solved mirrored). Player-facing effect: fewer instant spawn-kills and less
  corner-blob repetition; the 12 s reuse avoidance is the most feelable change after the
  taser.
- **VERIFIED** `measure-spawn-layouts.ts` / `spawn-layout-quality.test.ts` now sweep
  REGISTERED arenas (parked included) with per-arena floors instead of SELECTABLE-only.

### Lane C — Nuke Town round 2 (owner round 2)
- **VERIFIED** Street surfaces repaired, upper glass restored, original Nuketown parked:
  `selectable: false` in `src/map-selection.ts`, stable id retained; menu, shell,
  roster floors and the stock-flags boot spec control (`nuketown2`, `skyline-terminal`)
  updated. No gameplay change beyond roster + review-station re-seating.
- **VERIFIED** Lawn: keep-out 0.34 → 0.36 m and `infill` pieces excluded from lawn
  regions (`src/nuketown-lawn-field.ts`). Visual only; blades sit 20 mm further off walls.

### Lane D — handedness mirror + balconies (HF-473 + HF-465)
- **VERIFIED** Whole authored layout mirrored `x → −x` (`NUKETOWN2_HANDEDNESS = −1`,
  `src/nuketown2-layout.ts`; applied in `pair()`, `centred()`, `streetVehicle()`, two
  stair-ramp boxes — `src/nuketown2-arena.ts`). Each garage now on the RIGHT of its
  house seen from that house's back yard. Shed placements converted with yaw negation
  (`src/destructible-shed-registry.ts`). Railgun rare-gun sites converted to world frame.
- **VERIFIED** New traversable geometry: rear balcony + exterior flight + window ledge +
  porch canopy (HF-465), upper glass, round-2 street dressing. New review stations
  (interior ×2, garage, balcony, porch, 5 vehicle stations) in
  `src/rendering/arenas/nuketown2.ts` + `scripts/qa/viewpoint-catalog.mjs`. Player feels:
  new climb chain (hedge → canopy → ledge → upper window), new rear-flank route, changed
  sightlines through upper glass.

### Lane E — ballistics wiring (HF-467, HF-464)
- **VERIFIED** Material classes shipped as a projection (`BALLISTIC_MATERIAL_CLASS`,
  `src/ballistics.ts`): glass = shatter (breaks open, leaves ballistic + movement +
  LOS aperture), thin-metal = perforate (persistent aperture, movement collider kept),
  fence/wood/interior-wall/vehicle/container/structural-metal = penetrate (energy-costed),
  brick/concrete/earth/reinforced = stop (structural cover pricing). Class map pinned
  exactly in `src/ballistics.test.ts`.
- **VERIFIED** Perforation energy now the trace's remaining energy at the entry face
  (`energyAtEntryQ`, ×10 quantised) instead of the distance-blind muzzle constant —
  `src/legacy-main.ts:applyInteractiveWorldBallisticTrace` charges per-impact energy and
  derives damage via `applyPenetrationDamage`. Same shot through wood then sheet costs
  less at the sheet; falloff with distance now matters. Gun Range lab gains thin-metal +
  structural-metal lanes (4 → 6).
- **VERIFIED** Stop-class floor (`48aab0ae`): stop materials charge
  `max(thickness, 0.6 m)` (`BALLISTIC_STOP_MINIMUM_THICKNESS_METERS`). Thin (0.12 m)
  concrete now stops pistol/carbine but not the sniper; thick concrete unchanged; the
  floor does not apply to penetrate/perforate/shatter. Player feels: thin concrete /
  block walls are real cover vs small arms, rifles still wallbang brick as before.

### Lane F — vehicle forge
- **VERIFIED** Data-only lofted street bodies (`src/vehicle-forge/`: specs, geometry,
  wheels, materials, build) skinned onto the Nuke Town street vehicles
  (`src/nuketown2-vehicle-materials.ts`, street/facade/interior TSL materials).
  No collider, handling, or damage-model change claimed in the diff — presentation
  only. Player feels: cars/coach/truck read as vehicles at 4/8/16 m instead of boxes.

## 2. Cross-lane defect hunt

### F1. Two live spawn selectors + duplicated constants (strongest finding)
- **VERIFIED** `src/spawn-safety.ts:34` (`MAP_TRAP_RADIUS`), `:57`
  (`FFA_MINIMUM_SPAWN_SEPARATION = 8`), `:147` (`scoreSpawnCandidates`) still exist
  beside near-copies in `src/spawn-selection.ts:44-45` (same two constants),
  `:60` (re-export), `:92` (`selectSpawnCandidates`), `:159`
  (`scoreSpawnCandidates = selectSpawnCandidates` alias). The two implementations
  already diverge: safety's lacks `arenaKind/team/preferredSide/recentUses` and the
  `?? 7` fallback; selection adds side-penalty (50000), 12 s reuse pressure (175000),
  preferred-side pool. `src/legacy-main.ts:908-909` imports FFA + reservation from
  safety but selection from the new module; `src/spawn-safety.test.ts` still pins the
  OLD selector while `src/spawn-selection.test.ts` pins the NEW one — a fix in one
  will not move the other. Same number today, two sources tomorrow.
- Why it matters: the highest-traffic shared rule in the game now has two owners;
  the next tuning will land in one and silently not in the other.
- Smallest fix: make `spawn-safety.ts` re-export `MAP_TRAP_RADIUS`,
  `FFA_MINIMUM_SPAWN_SEPARATION`, `scoreSpawnCandidates` from `spawn-selection.ts`
  and delete the duplicated table + scorer; keep `initialFfaSpawnReservation` where it is.

### F2. Menu order pin replaced with a tautology
- **VERIFIED** `src/ui/pass64-shell.test.ts`: the explicit 9-route offered-order literal
  (nuke-town … raid-rebuild, with HF-429/HF-409/HF-407/HF-408 annotations) was replaced
  by `markup routes == SELECTABLE_ARENAS routes` — which duplicates the assertion two
  lines above it. Order regressions and wrong-label routings are now invisible by
  construction; the HF-466 parking of atomic-acres is exactly the kind of change the
  literal existed to catch.
- Why it matters: AGENTS.md calls menu order load-bearing; the test now agrees with
  itself instead of with a pin.
- Smallest fix: restore the explicit route literal (updated: without `atomic-acres`)
  as the second assertion; keep the derived one as the first.

### F3. Stale static HUD missile count
- **VERIFIED** `src/ui/pass64-shell.ts:593` still renders
  `<b id="gunner-missile-ammo">&times;0 / 6</b>` while capacity is 12. Runtime paths
  (`src/legacy-main.ts:24792,24835`) already render `/ ${CHOPPER_MISSILE_CAPACITY}`,
  so the first paint (and any markup-scraping test) disagrees with the live HUD.
- Why it matters: cosmetic, but it is the one player-visible number the lane changed.
- Smallest fix: render the static markup from the shared capacity constant (or literal 12).

### F4. Skyline comment drift (not a geometry defect)
- **VERIFIED** `src/additional-maps.ts` comment claims the two new Skyline points sit
  4.00 m from authored −16/−8 and 8/16; the authored table is −27/−18/−6/6/18/27, so
  the new ±12 points sit exactly 6.00 m from their neighbours and
  `src/additional-maps.test.ts:1179` (`>= 6`) passes. **SUSPECTED** the comment was
  written against a pre-integration draft and never updated.
- Smallest fix: correct the comment's cited neighbours to −18/−6 and 6/18.

### Authority / spoof review (taser, glass breach, spawn selection)
- **VERIFIED** Taser is host-authored end to end: `TaserHostAuthority.resolveStun`
  refuses non-host/wrong-epoch/malformed/replay; exact-keys + duration bounds
  (`src/taser-stun.ts`); `TaserVictimResultConsumer.admit` enforces epoch, target,
  life, strict sequence, expiry; `isTaserProtocolMessage` admitted to
  `isGameMessage`/`isHostAuthorityMessage`/`messageBelongsToPlayer`
  (`src/protocol.ts`, `src/taser-protocol.ts`); guest handler in
  `src/legacy-main.ts` (`handleTaserAuthorityMessage`) checks client role, host id,
  `forPlayerId`, target id, live phase, alive; bot path runs host-side only
  (`applyKillstreakTaserStunEvent` returns false on client) and stun events are
  applied before damage each step. No guest-mint path found.
- **VERIFIED** Glass breach: `activeBallisticSurfaces()` excludes breached panes and
  the trace consumes it for live, bot, and interactive-world paths
  (`src/legacy-main.ts:4523,4575,21255`); perforation admission runs behind
  `interactiveWorldRuntime?.hasHostAuthority()`. No guest-authored breach found.
- **VERIFIED** Spawn selection is deterministic shared pure logic (seeded tie-break);
  no network input beyond existing snapshots. No spoof surface added.

### Per-frame allocation / admission-fence review
- **VERIFIED** No new hot-loop churn of note: `selectSpawnCandidates` runs per spawn
  (filter/map over ≤16 candidates), not per frame; trace adds one class lookup +
  one quantise per impact. `taserMovementAdmission` allocates one small frozen object
  per `updatePhysics` tick (same shape as the flash path) with the FREE singleton for
  the common unstunned case — bounded, acceptable.
- **VERIFIED** Nothing in the diff touches the arena-construction WebGPU fence,
  the admission-state ladder, or the spawn-flip hysteresis timing beyond threading
  `spawnNow` through. `LINE_CEILING` 37100 → 37365 is ledgered as 235 (taser wiring)
  + 30 (spawn call sites) with both lane rows retained — honest accounting, not a
  weakened ratchet.
- **VERIFIED** Ballistics debt ledgers (`ACCEPTED_UNBACKED_SHOT_SURFACES`,
  `ACCEPTED_BALLISTIC_FALLBACK`) use `toBeLessThanOrEqual` ceilings that may only
  shrink, with map3/test1/test2/raid2 debt named and owned out-of-lane. Re-expressed
  coverage, not a loosened gate. Remaining debt stays **OPEN**: map3 205 unbacked,
  test1 58 / test2 135 / map3 21 / raid2 105 fallbacks.

## 3. Per-finding fix list (smallest fixes)

1. `src/spawn-safety.ts:34,57,147` — delete duplicated `MAP_TRAP_RADIUS`,
   `FFA_MINIMUM_SPAWN_SEPARATION`, `scoreSpawnCandidates`; re-export from
   `src/spawn-selection.ts`. (F1)
2. `src/ui/pass64-shell.test.ts` — restore the explicit offered-route literal
   (minus parked `atomic-acres`) as the order pin. (F2)
3. `src/ui/pass64-shell.ts:593` — render `&times;0 / 12` from the shared capacity
   constant. (F3)
4. `src/additional-maps.ts` (Skyline spawn comment) — cite −18/−6 and 6/18 neighbours,
   not −16/−8 and 8/16. (F4)

## 4. Verdict: SHIP-WITH-FIXES

1. The four findings above are all small, reviewer-actionable, and none indicates a
   runtime regression — but F1 leaves the game's most-shared rule with two owners, and
   F2 deletes the only test that would catch the next menu-ordering mistake.
2. Host-authority is sound (taser/glass/spawn all verified fail-closed), the stop-class
   floor and perforation-energy fixes are genuinely mechanical with falsifiers, and the
   spawn re-solves satisfy both lanes' gates at once rather than weakening either.
3. Fixes 1–4 are a single small PR with no gameplay change; nothing here justifies
   holding the candidate beyond that PR.

Claim-state ledger: every behavioural bullet above carries its state inline; no
unsourced performance or compatibility claims are made. Falsifiers: F1 — grep the two
`MAP_TRAP_RADIUS` definitions; F2 — diff the test's two consecutive assertions;
F3 — open the menu markup before first JS tick; stop-floor — run the four
`HF-467 material classes` tests; spawn reuse — run `src/spawn-selection.test.ts`.
