# Muse review — v8-audio-polish (PASS 95, HF-491 / HF-509)

Reviewer: Muse Spark 1.3 (skeptical second pair of eyes). No verifier ran before this.
Branch: `contrib/dave-gaming-pc/claude/v8-audio-polish`. Base: `452d7aba` (candidate 7).
Report reviewed: `docs/evidence/pass95/audio-polish/REPORT.md`.
Diff reviewed: `origin/contrib/dave-gaming-pc/claude/pass93-candidate...HEAD` (18 files, +1188/−166)
plus unstaged `src/audio.ts` telemetry hunk and untracked
`scripts/qa/pass95-audio-polish-hitch-probe.mjs` +
`docs/evidence/pass95/audio-polish/raw/candidate-run1.json`.
No builds, no browsers, no GPU, no npm install. Static review only (read/diff/grep).

## Verdict: SHIP-WITH-FIXES

1. The core of the lane is real and correctly built: every bus coefficient now comes from
   one table (`src/audio-buses.ts:44-56`, read at both `unlock()` and `configure()` via
   `audioBusBaseGain`), fixing the genuine menu-music 4x regression (0.18 fallthrough vs
   0.045 creation); world reports/impacts/doors/explosions are positioned through pooled
   pan-only HRTF panners with a documented per-family range gate; zero `decodeAudioData`,
   zero audio assets, noise pre-generated at `unlock()`.
2. It cannot enter candidate 9 as-is: one world-door call site remains 2D
   (`src/legacy-main.ts:15354`, `nearest.distance` with no emitter), `vehicleHit` /
   `glassShatter` / `shedPerforation` gained an optional emitter that zero production
   callers pass, and `explosionAt` plus ambient events still allocate a fresh
   `PannerNode` per detonation/event in combat (report admits the former; the probe raw
   proves the latter: 4 in-window panners, all from `playAmbientEvent`, `worldPanners`
   acquisitions 0).
3. Integration is additive and safe but not yet merged: bus IDs, `AUDIO_RUNTIME_BUDGET`,
   `setArena`/`updateListener`/announcement-bus/`SHARED_REVERB_PROFILE` semantics are
   untouched so the v7-killstreak-awareness lane composes, but both lanes edit
   `src/audio.ts`, the same `legacy-main.ts` regions, and `src/sound-event-inventory.ts`
   + digest — the integrator must recompute the digest once over the merged inventory
   (as HF-408 did). No test was loosened; the music-rotation timeout is machine load
   (unpatched tree times out too), not this lane.

## Check 1 — every world sound positional, listener on camera

PASS with one exception.

- Listener: single call site `src/legacy-main.ts:14938`
  `audio.updateListener(camera.position, player.yaw)` per frame. Correct.
- Positioned now (verified in diff): bot reports (`21200` muzzle-or-root emitter),
  remote/admitted/flare/crossbow reports (`14461,14482,14875,14886,14920,20788,20954`),
  bullet impacts (6 paths: `14916,19617,19638,21266,24957` + glass `15948`),
  cover/grenade impacts (`22921,23104,23192`), shed door via blocker (`3997`), test-bay
  door via trigger (`8039`), all 7 detonations via `explosionAt` (`13071,21642,22930,
  25087,25097,25798,36920`). Local player report stays dry by design. Footsteps,
  chopper rotors, support guns, missile launch, railgun unchanged (already positional).
- [F1] REMAINING 2D WORLD SOUND — `src/legacy-main.ts:15354`:
  `audio.shedDoorMotion(nearest.distance);` — no emitter, dry bus. Why: this is the
  player-interacted shed-door path (`interactWithShedDoor`), the door the player hears
  closest; the sibling obstruction path at `3997` passes `blocker.position` but this one
  was missed, and the callsite contract still pins the 1-arg row
  (`src/sound-event-inventory.ts` `shedDoorMotion / nearest.distance`). Smallest fix:
  `audio.shedDoorMotion(nearest.distance, nearest.centre);`
  (`nearestDoor` returns `{ placementId, centre, distance }`,
  `src/interactive-world-runtime.ts:734-747`).

## Check 2 — no decode on cold path or in combat, pre-decode before fence, pooled sources

PASS for decode/assets/pool-plumbing; FAIL for "nothing allocates in combat" as a blanket claim.

- Zero decode/assets (quote): `src/audio-test-fake-context.ts:201-203`
  `decodeAudioData(): Promise<never> { ... 'decodeAudioData is forbidden on the combat path' }`;
  probe raw `candidate-run1.json: result.audioTotal { panners: 23, buffers: 5, decodes: 0 }`,
  `audioInWindow { buffers: 0, decodes: 0 }`; `public/audio` and `public/sfx` absent
  (verified `ls`); all five noise textures generated once at `unlock()`. Good.
- Pre-decode/pre-alloc before fence (quote): `src/audio.ts:1164-1185`
  `prepareWorldPanners()` called from `unlock()` — 12 pooled panners
  (`AUDIO_RUNTIME_BUDGET.spatialVoices`) + 4 pre-warmed footstep chains
  (`WORLD_FOOTSTEP_CHAIN_PREWARM`), idempotent, feature-detected; per-call
  `createImpactSpatialDestination` allocator deleted (diff `-` block at old `3530+`).
  Headless hitch check (280 world sounds, 0 buffers/0 panners/0 decodes) is credible.
- [F2] `explosionAt` still allocates per detonation — `src/audio.ts:3467-3522`
  `createExplosionSpatialPanner()` does `createPanner()` + `createBiquadFilter()` +
  `setTimeout` per blast, tracked in `explosionSpatialTimers`. Why: contradicts the
  "pooled sources" bar for the loudest combat sound; bounded by the 90 ms coalesce gate
  but still a combat-time HRTF construction. Report §6 OPEN admits it. Smallest fix
  (follow-up, not candidate-9 blocker): route `explosionAt` through `acquireWorldPanner`
  + a shared lowpass, or pre-allocate N explosion chains at `unlock()`; at minimum keep
  the OPEN label and do not claim "0 panners in combat".
- [F3] Ambient events still allocate per event — `src/audio.ts:1395`
  `const panner = context.createPanner();` in `playAmbientEvent` (HRTF/inverse/ref 6).
  Proof: `candidate-run1.json:558-569` — all 4 in-window panner stacks are
  `playAmbientEvent <- updateArenaAmbience`, and `worldPanners.acquisitionsInWindow: 0`.
  Same class: railgun (`~3482`), support-gun (`~4261`), chopper/bed chains
  (`~3648,3723,3798,4486,4518,4582`) still `createPanner` per call by design (bounded
  lifecycle loops, not one-shots). Why: the "no allocation in combat" evidence only
  covers the 7-family hitch check, not the full mix; ambient is low-rate so this is a
  scope note, not a blocker. Smallest fix: route `playAmbientEvent` through the world
  pool (family `impact`/`ambience` range) or explicitly scope the no-alloc claim to
  weapon-report/impact/door/vehicle/glass/footstep one-shots.

## Check 3 — bus/level table and reverb zones keyed from arena data, not hardcoded per arena

PASS (with scope note).

- Bus table: `src/audio-buses.ts:44-56` `AUDIO_BUS_LEVEL_TABLE` is global by design
  (buses are the stable settings/killstreak API), groups are a projection
  (`AUDIO_MIX_GROUP_IDS`, `audioBusesInGroup()`). `createBus(id)` reads the table;
  `busBaseGain()` delegates (`src/audio.ts:4294-4298`). No per-arena coefficients
  anywhere. Correct — the requirement cannot mean per-arena bus levels.
- Reverb zones: `src/audio-world-positional.ts:101-107` `REVERB_ZONE_PROFILES` keyed by
  `AcousticSpace` (not arena); `urban-yard` equals shipped `SHARED_REVERB_PROFILE` so
  the street is unchanged. `src/audio-zone-map.ts:41-68` derives the four Nuke Town
  interior volumes from authored layout constants (`NUKETOWN2_HOUSE_LAYOUT`,
  `HOUSE_WIDTH/DEPTH`, `GARAGE_SPAN`, storey heights, handedness); `setAcousticSpace`
  retunes the ONE shared feedback-delay return in place (5 `setTargetAtTime`, 80 ms
  ramp, `src/audio.ts:1138-1152`); `updateListener` probes the zone per frame with
  early-out (`src/audio.ts:1735-1737`). Other arenas read their
  `ARENA_ACOUSTIC_SPACES` default (`src/audio-immersion.ts:110,156-158`). Good pattern:
  new interior = footprint entry, not graph work.
- Scope note (not a finding): only `nuketown2` has volumes
  (`src/audio-zone-map.ts:71-73`). Correct for today (no other authored interiors),
  but "keyed from arena data" should stay that way — do not add per-arena `if` chains
  in `audio.ts` when new interiors land.

## Check 4 — every asset's source stated and owned/licensed/procedural

PASS.

- Report §8 + module headers (`audio-world-positional.ts:16`, `audio-buses`, zone map)
  state: zero audio assets, everything synthesized from oscillators + seeded noise
  textures (`source: 'repository-procedural-original'`), nothing downloaded. Verified:
  no `public/audio`, no `public/sfx`; no `fetch(` of audio, no `decodeAudioData` in
  `src/` outside the forbidding fake; probe `decodes: 0`. No provenance gap.

## Check 5 — killstreak lane's audio API not broken

PASS (compose-with-care, not broken).

- This lane's new API is strictly additive: optional trailing `emitter?: SpatialPoint`
  on `coverImpact/shedDoorMotion/shedPerforation/vehicleHit/glassShatter/
  testBayDoorThump`; `worldPannerTelemetry()`; `AUDIO_MIX_GROUP_IDS`,
  `AUDIO_BUS_LEVEL_TABLE`, `audioBusBaseGain/LevelDb/BusesInGroup`; modules
  `audio-world-positional.ts`, `audio-zone-map.ts`. `explosion(now)` retained.
  Bus IDs, `AUDIO_RUNTIME_BUDGET`, `setArena`/`updateListener` semantics, announcement
  bus, reverb sends unchanged in this diff.
- The v7-killstreak-awareness lane (diff `452d7aba...v7`) adds `killstreakAnnounce()`,
  `bombRelease(emitter?)`, `syncSupportFlightLoops()` + support-flight loop state and
  raises chopper-rotor gains — none present here and none deleted here; this lane does
  not collide semantically. Both lanes edit `src/audio.ts` (dispose/reverb vs
  flight-loops), the same `legacy-main.ts` combat regions, and
  `src/sound-event-inventory.ts` + `SOUND_EVENT_INVENTORY_SHA256` — the integrator must
  merge (note: v8 `dispose()` clears `worldPanners`; merged `dispose()` must also clear
  v7 `supportFlightLoops`; v8 `createBus(id)` signature change is compatible — v7 adds
  no `createBus` calls) and recompute the inventory digest once over the merged
  inventory exactly as HF-408 did. Do not accept either branch's pin alone.

## Check 6 — any test loosened

PASS — no weakened threshold, budget, fence, or timeout.

- `audio-railgun.test.ts`: counts railgun's 2 bounded panners after the pool baseline
  (`pooledPanners`, `reportPanners()`); still asserts exactly 2 per report, budget caps,
  full cleanup/disconnect. Same contract, new baseline. Not loosened.
- `audio-source-synthesis-runtime.test.ts` (remote footstep): finds the pre-warmed chain
  by automation growth instead of "next gain created"; still asserts heel-then-settle
  shape (set→linear→≥2 exponential). Slightly more indirect locator, same assertion.
  Not loosened.
- `chiptune-music.test.ts`: pins `game-music` through `AUDIO_BUS_LEVEL_TABLE` and
  forbids a numeric literal at `createBus('game-music', …)`. Strictly stronger (guards
  the two-places regression). Not loosened.
- `frag-grenade-audio.test.ts`, `hosted-bot-main-integration.test.ts`,
  `window-glass-debris-presentation.test.ts`, `zero-hit-feedback.test.ts`,
  `sound-event-inventory.test.ts`: follow the new `emitter` / `explosionAt` signatures
  and recomputed digest (`9cb2cc80…`); choir-sting prohibition and all counts unchanged.
- `audio-music-rotation-runtime.test.ts` 20 s timeout failure under load: no timeout
  widened (no diff in that file); report's stash-rerun (patched 31.4 s pass alone,
  unpatched 24.7 s timeout in same window) attributes it to load. Accepted; the full
  `npx vitest run` + `npm run build` locked heavy step (§10) is still owed by the
  integrator, not this lane.

## UNFINISHED (brief requirements vs diff)

1. [F1 blocker] Second shed-door path still 2D (`legacy-main.ts:15354`). Fix above.
2. `vehicleHit` / `glassShatter` / `shedPerforation` positional API added but zero
   production callers pass an emitter (grep: only tests call them with a point). Either
   wire the callers or explicitly defer; HF-509 "all the audio should have proximity"
   is not fully met for vehicle/glass until then.
3. `explosionAt` pool migration (report §6 OPEN). Per-detonation panner+filter chain
   remains; move onto the pool as the natural follow-up.
4. In-browser hitch + pipeline-tripwire receipt: report §6 marks OPEN ("did not run the
   headless Chrome probe in the time box"), but the worktree now contains
   `scripts/qa/pass95-audio-polish-hitch-probe.mjs` and
   `docs/evidence/pass95/audio-polish/raw/candidate-run1.json` (2026-09-05T07:27Z, 45 s,
   WebGPU, 0 decodes, pipeline-in-window 0, spaces seen `urban-yard`+`interior-room`,
   interior round-trip `interior-room→urban-yard`, 0 console/page errors) — i.e. the
   probe WAS run after the report was written, with the caveats in F3 (ambient stacks,
   pooled acquisitions 0, fps 36.6 / p99 111 ms / 19 hitches>100 ms — scene/combat load,
   not audio-attributable on this evidence). The report is stale; the integrator should
   re-run the probe on the merged candidate and quote it, not this lane's stale OPEN.
5. Unstaged `src/audio.ts` telemetry hunk (adds `worldPanners` to the telemetry probe
   object) is uncommitted working-tree state from the paused build agent — additive and
   safe, but it is NOT in the committed diff; either commit it on the lane or drop it
   before candidate so the receipt matches the tree.
6. Owner ears still OPEN (report §11, endorsed): HRTF-vs-equal-power on owner
   headphones, interior return 0.21 / 19-53 ms vs street, per-family ranges
   (rifle 180 m, footstep 32 m) as gameplay statements. No action here beyond HITL.

## Required before candidate 9

- Apply F1 one-liner; update the `shedDoorMotion / nearest.distance` callsite-contract
  row to the 2-arg form and recompute `SOUND_EVENT_INVENTORY_SHA256` (same HF-408
  procedure the lane already followed).
- Decide vehicle/glass wiring vs explicit deferral (list as UNFINISHED if deferred).
- Integrator: merge with v7-killstreak-awareness, recompute inventory digest once,
  run the locked heavy step (`npm run build` + full `npx vitest run` under machine lock)
  and the hitch probe on the merged tree; do not carry this lane's stale OPEN forward.
