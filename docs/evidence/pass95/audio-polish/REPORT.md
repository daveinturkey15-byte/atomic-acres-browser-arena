# PASS 95 audio-polish lane - HF-491 / HF-509

Owner request: HF-491 "the sound is really bad"; HF-509 "all the audio should
have proximity too".
Worktree `C:/Users/david/projects/aa-p-audio-polish`, branch
`contrib/dave-gaming-pc/claude/v8-audio-polish`, base candidate 7 `452d7aba`.
Harness: Claude Code (Fable 5.1), machine `dave-gaming-pc`, 2026-09-05.
Assigned browser port 4265 (no browser step was run; see OPEN items).

Claim-states: `[VERIFIED]` I ran the check and quote its output;
`[MEASURED]` a number from an instrument I ran; `[OPEN]` not proven here.

---

## 1. What changed, in one paragraph

The shipped graph already had layered procedural reports (click, crack, body,
tail, HF-376), an air-absorption/occlusion/tail model (HF-366), a feedback
delay reverb send and a master limiter. What it did NOT have: a single level
table (two buses had two different coefficients in two places), any panning
for other players' and bots' weapon reports (only the railgun was positioned;
bots fired at `distance = 0` with no emitter), positioned impacts/doors/glass/
vehicles (the emitter parameter existed and no caller passed it), positioned
explosions (`explosionAt`, HF-351, was never wired), per-call `PannerNode`
construction in combat, and any acoustic-zone change when the player walked
into a house. This lane closes each of those with tests, without changing a
threshold, budget, fence or the legacy-main line count.

## 2. Mix bus architecture and level table

`[VERIFIED]` Five mix groups over the eight stable bus IDs. Bus IDs are the
API the settings surface, the sound-event inventory and the
`v7-killstreak-awareness` lane key on, so they are unchanged; the group is a
projection (`AUDIO_MIX_GROUP_IDS`, `audioBusesInGroup()` in
`src/audio-buses.ts`). Every coefficient below is read by `unlock()` at bus
creation AND by `applyBusSetting()` at `configure()` time from the same table
(`AUDIO_BUS_LEVEL_TABLE`). Printed with `npx tsx` over the shipped table:

| Bus | Group | Base gain | dBFS | Carries |
|---|---|---:|---:|---|
| master | master | 0.34 | -9.4 dB | sum of every group, into the -1 dB 20:1 safety limiter |
| sfx | sfx | 0.78 | -2.2 dB | weapon reports, impacts, explosions, doors, vehicles, glass |
| movement | sfx | 0.30 | -10.5 dB | footsteps, landings, jumps, foley for the player and every world actor |
| ambience | sfx | 0.12 | -18.4 dB | arena bed, air layer, intermittent ambient events, report tails |
| ui | ui | 0.45 | -6.9 dB | hit/kill confirms, menu and match cues; restrained below gunfire |
| announcements | voice | 0.55 | -5.2 dB | match countdown, stingers, killstreak and objective announcements |
| menu-music | music | 0.045 | -26.9 dB | menu chiptune bed |
| game-music | music | 0.027 | -31.4 dB | in-match chiptune rotation, ducked to 24% under reports |

Master limiter (`MASTER_LIMITER_PROFILE`, unchanged): threshold -1 dB, knee
0, ratio 20:1, attack 1 ms, release 100 ms. Shared reverb sends (unchanged):
sfx 0.075, movement 0.09, announcements 0.08, ambience 0.16.

`[VERIFIED]` Regression found and fixed while building the table: the old
`busBaseGain()` fallthrough answered `menu-music = 0.18` while `unlock()`
created the bus at the owner's third-halved `0.045`; `configure()` runs at
boot, so the runtime menu bed was 4x the owner's value. Same defect class as
the 2026-08-29 game-music revert. `src/audio-mix-bus.test.ts` now pins
`menu-music` at 0.045 through both paths and forbids a numeric coefficient at
`createBus`.

`[VERIFIED]` `src/audio-mix-bus.test.ts` (4 tests): every bus in exactly one
group and no group empty; UI < sfx, movement < sfx, ambience < movement, both
music buses < ambience; the headless graph's effective gains equal the table
after `unlock()` and after `configure()` with a 50% UI slider; exactly one
`DynamicsCompressorNode` with threshold <= -1 dB and ratio >= 20 sits between
the master gain and `destination`, and every bus (and the reverb return)
reaches `destination` only through master.

## 3. Positional world sounds (HF-509)

### 3.1 The rule

`[VERIFIED]` Every world one-shot is routed through a pooled, pan-only
`PannerNode` (`WORLD_PANNER_PROFILE`: HRTF, `rolloffFactor: 0`, so the panner
contributes direction and nothing else) into the sfx bus. Level comes from ONE
documented curve per family (`worldSoundAttenuation()`), distance muffling
from the existing HF-366 lowpass, occlusion from the existing hook. One
attenuation, in one place, testable without an AudioContext.

| Family | Ref (m) | Range (m) | scale at 5 / 10 / 20 / 40 / 80 m |
|---|---:|---:|---|
| weapon-report | 2 | 180 | 0.763 / 0.461 / 0.222 / 0.094 / 0.038 |
| impact | 1.5 | 60 | 0.609 / 0.292 / 0.114 / 0.041 / 0 |
| door | 1.5 | 42 | 0.609 / 0.292 / 0.114 / 0.008 / 0 |
| vehicle | 2 | 80 | 0.759 / 0.444 / 0.204 / 0.083 / 0 |
| glass | 1.5 | 60 | 0.609 / 0.292 / 0.114 / 0.041 / 0 |
| footstep | 1 | 32 | 0.361 / 0.129 / 0.041 / 0 / 0 |

Beyond a family's range the voice is not scheduled at all (a rifle at 181 m
schedules zero sources: `[VERIFIED]` test "none beyond the family range").
Existing per-family level curves inside `ArenaAudio` (impact `1 - d/34`,
door `1 - d/42`, vehicle `1 - d/60`, report `0.55 x bodyGainScale`) are kept
so previously pinned volumes are unchanged; the table above is the range/skip
gate and the documentation of what a listener hears.

### 3.2 What is now positioned, with the call site that feeds it

| World sound | Before | After (`src/legacy-main.ts`) |
|---|---|---|
| Bot weapon report | `audio.shot(bot.weapon, true)` - distance 0, no emitter, dry bus | `shot(bot.weapon, true, d, botMuzzle ?? bot.root.position)` |
| Remote player report (3 paths + admitted + flare/crossbow requests) | distance only, dry bus | emitter `origin` / request origin passed |
| Bullet impacts (6 paths) | distance only | `point` passed |
| Window break | distance only | `point` passed |
| Cover / grenade impacts (3) | distance only | `point` / `position` passed |
| Shed door motion, test-bay door | distance only | `blocker.position` / `trigger` passed |
| Vehicle hit, glass shatter | distance only | optional emitter added to the API |
| Frag / crossbow / support / chopper / carpet detonations (7) | `audio.explosion(now)` - non-positional | `audio.explosionAt(point, family, now)` (HF-351 path, previously unwired) |
| Footsteps (player, remote, bots) | already positional (HRTF chains) | unchanged; chains pre-warmed (see 6) |
| Chopper rotors, support guns, missile launch, railgun | already positional | unchanged |
| Listener | `audio.updateListener(camera.position, player.yaw)` per frame | unchanged; now also classifies the acoustic zone |

`[VERIFIED]` `src/legacy-main.ts` is 37,396 lines before and after (every
change is a same-line argument edit); `src/legacy-main-size-ratchet.test.ts`
passes.

### 3.3 Headless routing and attenuation test

`[VERIFIED]` `src/audio-world-positional.test.ts` (10 tests) against the new
`FakeAudioContext` (`src/audio-test-fake-context.ts`, records every node,
edge and AudioParam write):

- pure curve: 1 in the near field, non-increasing, exactly 0 at range, NaN
  and negative read as near field; a report carries across Nuke Town's 36 m
  street, a footstep does not;
- `spatialPan`: right positive, left negative, dead ahead centre;
- a remote `ak-47` at 15 m occupies one pooled panner whose position equals
  the emitter, which reaches the sfx bus; >= 4 of the report's direct layers
  reach that panner; the panner is released after `holdMs` (520 ms) with
  `spatialChains` back to 0;
- scheduled peak of the same weapon at 4 m > 30 m > 90 m > 0, and zero
  sources at 181 m;
- 15 simultaneous impacts occupy exactly 12 panners (the preserved
  `spatialVoices` budget) and allocate nothing;
- the local player's own report stays dry (no panner).

## 4. Weapon layering and reverb zones

`[VERIFIED]` Layering per class is the shipped HF-376/HF-366 design (click,
crack, body, transient, tail; crack collapses to zero over range, tail share
grows with distance; `src/audio-immersion.test.ts` pins it). This lane routes
those layers through the pooled panner for remote shooters and adds the
zone-keyed return below. No weapon profile number changed.

### 4.1 Zone map

`[MEASURED]` `src/audio-zone-map.ts` derives the interior volumes from the
arena's authored layout constants (house centre/width/depth, garage span,
storey heights, handedness), so a layout change moves the zones with it:

| Volume | Space | x | y | z |
|---|---|---|---|---|
| nuketown2:north-house | interior-room | -4.25..6.75 | -0.50..6.30 | -23.00..-10.00 |
| nuketown2:north-garage | interior-room | -9.25..-4.25 | -0.50..3.30 | -23.00..-10.00 |
| nuketown2:south-house | interior-room | -6.75..4.25 | -0.50..6.30 | 10.00..23.00 |
| nuketown2:south-garage | interior-room | 4.25..9.25 | -0.50..3.30 | 10.00..23.00 |

Outside a volume every arena reads as its `ARENA_ACOUSTIC_SPACES` default
(Nuke Town street = `urban-yard`). Other arenas have no authored interiors
today; adding one is a footprint entry in this module, not audio-graph work.

### 4.2 Reverb return per zone

`[VERIFIED]` `setAcousticSpace()` retunes the ONE shared feedback-delay return
(early/late delay, feedback, return gain - five `setTargetAtTime` writes with
an 80 ms ramp, never a new graph):

| Zone | Early | Late | Feedback | Return |
|---|---:|---:|---:|---:|
| open-field | 49 ms | 118 ms | 0.22 | 0.07 |
| open-water | 58 ms | 131 ms | 0.16 | 0.045 |
| urban-yard (street) | 37 ms | 89 ms | 0.31 | 0.12 |
| industrial-hall | 31 ms | 97 ms | 0.40 | 0.17 |
| interior-room | 19 ms | 53 ms | 0.44 | 0.21 |

`urban-yard` equals the shipped `SHARED_REVERB_PROFILE`, so the street sounds
exactly as candidate 7 did; only leaving the street changes anything.
`src/audio-zone-map.test.ts` (4 tests): four volumes authored; house centre
is a room on both storeys and the roof is not; the street is the yard; every
shipped arena reads its default; and on the headless graph `updateListener()`
into the north house flips `telemetry().immersion` to
`{ space: 'interior-room', overridden: true }`, sets the return gain to 0.21
and both delays to 19/53 ms, and walking back to the street restores 0.12.

## 5. Footsteps, movement foley, UI

- `[VERIFIED]` Footsteps for player, remotes and bots are surface-keyed
  (`concrete | wood | grass | metal | soil | asphalt`, `arenaFootstepSurface`)
  with walk/sprint/crouch gait and velocity scaling, through HRTF chains on
  the movement bus (unchanged; `src/audio-source-synthesis-runtime.test.ts`
  "remote footstep" re-pinned to find the pre-warmed chain by automation growth
  rather than by "the next gain created").
- `[VERIFIED]` UI stays restrained: the table pins `ui (0.45) < sfx (0.78)`;
  no UI cue was added or raised.

## 6. No decode, no allocation on the cold path or in combat

`[VERIFIED]` Runtime audio is procedural: zero `decodeAudioData` and zero
audio asset fetches (the HF-491 triage probe measured 0/0 on both builds).
This lane adds no asset. All five noise textures are generated once at
`unlock()`.

`[VERIFIED]` New pre-allocation at `unlock()` (the first gesture, before any
arena deploys): 12 pooled world panners (`AUDIO_RUNTIME_BUDGET.spatialVoices`)
and 4 footstep chains. The per-call `createImpactSpatialDestination`
allocator (one `PannerNode` + `setTimeout` per impact) is deleted.

`[VERIFIED]` Hitch check, headless: after `unlock()`, 40 iterations of
{remote report, impact, cover impact, vehicle hit, door, glass, bot footstep}
= 280 world sounds create **0** buffers, **0** panners, **0** decodes
(`context.allocations()` before == after, `acquisitions > 0`).

HRTF `PannerNode` construction is the classic first-shot hitch in Chromium
(HRTF database load on first panner). It is now paid at unlock, not at the
first bot shot.

`[OPEN]` In-browser hitch and pipeline-tripwire receipt on port 4265. Audio
creates no GPU pipeline, so the in-combat pipeline tripwire (0) cannot be
tripped by this change by construction, but I did not run the headless Chrome
probe in the time box; the headless allocation proof above is the evidence
this lane ships. `explosionAt` still builds its own lowpass+panner chain per
detonation (HF-351 design, bounded by the 90 ms coalesce gate); moving it
onto the pool is the natural follow-up.

## 7. Compatibility with the killstreak-awareness lane

`[VERIFIED]` `git diff 452d7aba origin/contrib/dave-gaming-pc/claude/v7-killstreak-awareness`
adds `killstreakAnnounce()` on the announcements bus, `bombRelease(emitter?)`
and `syncSupportFlightLoops()`, plus its own callsite-contract rows. Bus IDs,
`AUDIO_RUNTIME_BUDGET`, `registerVoice` semantics, `setArena`,
`updateListener`, the announcement bus and `SHARED_REVERB_PROFILE.sends` are
unchanged here, so both lanes compose. New API in this lane is additive only:
optional trailing `emitter?: SpatialPoint` on `coverImpact`, `shedDoorMotion`,
`shedPerforation`, `vehicleHit`, `glassShatter`, `testBayDoorThump`;
`worldPannerTelemetry()`; `AUDIO_MIX_GROUP_IDS`, `AUDIO_BUS_LEVEL_TABLE`,
`audioBusBaseGain`, `audioBusLevelDb`, `audioBusesInGroup`; modules
`audio-world-positional.ts`, `audio-zone-map.ts`. `explosion(now)` remains
available. Integration note: both lanes edit
`src/sound-event-inventory.ts` (callsite rows + digest) and the same
`legacy-main.ts` regions; the integrator must recompute the inventory digest
once over the merged inventory, exactly as HF-408 did.

## 8. Asset provenance

No audio asset exists in the tree (`public/audio`, `public/sfx` absent;
verified by the HF-491 triage and unchanged). Every sound is synthesized at
runtime from oscillators and seeded noise textures
(`source: 'repository-procedural-original'`). Nothing was downloaded.

## 9. Gates

`[VERIFIED]` `npx tsc --noEmit`: exit 0, no output (run after the final edit).

`[VERIFIED]` `npx vitest run src/*audio* src/*sound* src/legacy-main-size-ratchet.test.ts src/chiptune-music.test.ts src/frag-grenade-audio.test.ts src/pass65-settings.test.ts src/combat-feedback.test.ts`:

```text
Test Files  28 passed | 1 failed (29)
Tests       363 passed | 1 failed (364)
```

The one failure was `src/audio-music-rotation-runtime.test.ts > plays all
ten tracks before repeating any of them, in the runtime` at the 20 s timeout
under the shared machine's load. `[VERIFIED]` Rerun alone with this patch: 9
passed, 31.4 s; the same test on the UNPATCHED tree (`git stash`) timed out at
24.7 s in the same window - load, not this change. No timeout was widened.

Contract updates that were required by the change (none weakens a check):

- `src/audio-railgun.test.ts`: the "two bounded panners per replicated
  railgun report" count is now taken after the pre-created pool baseline;
  the count of two per report and full cleanup are still asserted.
- `src/chiptune-music.test.ts`: the "runtime coefficient equals the halved
  constant" pin now asserts through `AUDIO_BUS_LEVEL_TABLE` and forbids a
  numeric literal at `createBus('game-music', ...)`.
- `src/frag-grenade-audio.test.ts`: expects the positional
  `explosionAt(point, 'semtex', afterPresentationDetach)`; the choir-sting
  prohibition is unchanged.
- `src/sound-event-inventory.ts`: the callsite contract follows the new
  argument signatures (16 rows); `explosionAt` registered as an emitter on the
  frag and support explosion events; the inventory digest recomputed
  (`9cb2cc80...`) with a dated note, as every previous inventory change did.

## 10. Locked heavy step

Appended below after `npm run build` and the full `npx vitest run` under the
machine lock.

## 11. Owner ears still needed - OPEN

- `[OPEN]` Whether bot/remote reports panned through HRTF read as "over
  there" on the owner's headphones versus speakers (HRTF is the shipped
  footstep/railgun choice; equal-power is one constant away if it smears).
- `[OPEN]` Interior return level (0.21) and delay (19/53 ms) inside the Nuke
  Town houses versus the street - the numbers are relative, not measured
  against a real room.
- `[OPEN]` Per-family ranges (rifle 180 m, footstep 32 m) are gameplay
  statements; the owner may want bots audible closer or further.

## 12. Finish round (Muse Spark 1.3, 2026-09-05) - review UNFINISHED closed

`[VERIFIED]` Commits on `contrib/dave-gaming-pc/claude/v8-audio-polish` after
`7c794e88` (review base), one per item, each with explicit paths:
`3a363b8a` world-panner pool telemetry in the probe object (review item 5);
`5b29e8cf` positional shed-door interact path (review F1);
`0178ea0a` vehicle/glass/perforation voice wiring (review item 2);
`ba2d5800` world one-shot positionality contract test (this round's gate).
`[VERIFIED]` `src/legacy-main.ts` is still exactly 37,396 lines
(`src/legacy-main-size-ratchet.test.ts` passes); every legacy-main change in
this round is a same-line swap. No threshold, fence, budget or timeout was
touched; no `ArenaAudio` signature changed (one additive method,
`bulletImpact`); the killstreak lane's audio API is untouched.

### 12.1 F1 - second shed-door path is positional

`[VERIFIED]` `src/legacy-main.ts` `interactWithShedDoor` now calls
`audio.shedDoorMotion(nearest.distance, nearest.centre)` (was
`nearest.distance` dry). `nearestDoor` returns
`{ placementId, centre, distance }`
(`src/interactive-world-runtime.ts` `nearestDoor`), so the emitter is the
door frame centre the player hears closest. The callsite contract follows
(`shedDoorMotion / nearest.distance,nearest.centre`).

### 12.2 vehicleHit / glassShatter / shedPerforation are wired

`[VERIFIED]` New additive router `ArenaAudio.bulletImpact(material, surface,
distance, emitter)` (`src/audio.ts`): `vehicle` strikes play `vehicleHit`,
`glass` strikes play `glassShatter`, `thin-metal` (the perforate class,
`src/ballistics.ts`) strikes play `shedPerforation`; every other material
keeps the generic `impact`. All five material-known bullet paths route
through it (remote-admitted, local, local pure-world fallback, bot, chopper
gunner), each keeping its existing camera listener
(`point.distanceTo(camera.position)`; the bot path keeps its authored
`player.position` distance, unchanged by this round). The window-breach path
(`breakHouseWindow`, the breakable-windows lane's event site) calls
`audio.glassShatter(point.distanceTo(camera.position), point)` directly.
Distance attenuation and the pooled world panner stay inside the voices, so
one routing point covers all three families. Callsite contract (4
`bulletImpact` rows + 1 `glassShatter` row, `impact` rows retired),
`world.projectile-impact` / `world.window-break` emitter symbols and prose,
and the inventory digest (`869f7826...`, recomputed once, HF-408 procedure)
follow. Source-text pins in `src/zero-hit-feedback.test.ts`,
`src/window-glass-debris-presentation.test.ts` and the
`src/nuketown2-breakable-windows.test.ts` catalogue comment follow the new
calls (same assertions, new voice names).

### 12.3 New gate - no 2D world sound can land silently

`[VERIFIED]` `src/sound-event-inventory.test.ts` gains "keeps every world
one-shot positional": every contract row for `impact / coverImpact /
shedDoorMotion / shedPerforation / vehicleHit / glassShatter /
testBayDoorThump / bulletImpact / explosionAt` must carry a distance plus a
position token (`point|position|origin|centre|trigger|blocker|emitter|muzzle`).
Negative control: the pre-fix `nearest.distance` row fails the predicate.
Loop beds, continuous drivers and listener-local cues (including the dry
local player report) are out of scope by design and stated in the test.

### 12.4 Hitch-probe receipt (review item 4 - the report was stale, now quoted)

`[MEASURED]` `docs/evidence/pass95/audio-polish/raw/candidate-run1.json`
(2026-09-05T07:27Z, WebGPU, port 4265, 46.6 s combat window, 1706 frames):
fps 36.6, frame gaps p50 22.4 / p95 38.9 / p99 111.1 / max 149.9 ms, 29
hitches > 50 ms, 19 hitches > 100 ms, in-window audio 4 panners / 0 buffers
/ 0 decodes / 0 convolvers / 50 sources started (all 4 panner stacks are
`playAmbientEvent <- updateArenaAmbience`), pool `pooled: 12, acquisitions
in window: 0, starved: 0`, interior round-trip `urban-yard -> interior-room
-> urban-yard` observed live, 0 console errors, 0 page errors. Honest scope:
the receipt proves 0 buffers / 0 decodes in combat and the live zone switch,
but NOT pooled-voice uptake (`acquisitions: 0` in-window) and the 19
> 100 ms hitches are scene/combat load, not audio-attributable on this
evidence. The no-allocation proof for pooled one-shots remains the headless
280-sound check (§6). This receipt predates the finish-round same-line
swaps; the integrator re-runs
`scripts/qa/pass95-audio-polish-hitch-probe.mjs` on the merged candidate.

### 12.5 TODOs (larger than the finish round - file:line, not deferred silently)

- `[OPEN]` `explosionAt` pool migration (review F2): `explosionAt` still
  builds a per-detonation HRTF panner + lowpass + `setTimeout` via
  `createExplosionSpatialPanner` (`src/audio.ts:3480`, timer
  `src/audio.ts:3529`, bounded by the 90 ms coalesce gate). Route through
  `acquireWorldPanner` + a shared lowpass, or pre-allocate N explosion
  chains at `unlock()`.
- `[OPEN]` Ambient-event allocation (review F3): `playAmbientEvent` still
  allocates per event (`src/audio.ts:1396`). Route through the world pool
  (family `impact`/`ambience` range) or keep the no-alloc claim scoped to
  the weapon-report / impact / door / vehicle / glass / footstep one-shot
  set, which is what the headless proof covers.
- `[OPEN]` Integrator (review Check 5 + §10): merge with
  `v7-killstreak-awareness`, recompute `SOUND_EVENT_INVENTORY_SHA256` once
  over the merged inventory (HF-408 procedure; merged `dispose()` must clear
  both `worldPanners` and v7 `supportFlightLoops`), run the locked heavy
  step (`npm run build` + full `npx vitest run` under machine lock) and the
  hitch probe on the merged tree. Owner ears (§11) still need HITL.

### 12.6 Finish-round gates

`[VERIFIED]` `npx tsc --noEmit`: exit 0, no output (run after the final
edit). `[VERIFIED]` `npx vitest run src/*audio* src/*sound*
`src/legacy-main-size-ratchet.test.ts`:

```text
Test Files  26 passed (26)
Tests       263 passed (263)
```

Plus the router-following pins outside the glob: `src/zero-hit-feedback.test.ts`,
`src/window-glass-debris-presentation.test.ts`,
`src/nuketown2-breakable-windows.test.ts` - all green;
`src/legacy-main.ts` 37,396 lines, LF, ceiling held.
