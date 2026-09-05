# Muse review — v8-audio-polish-2 (PASS 95 Finish round, HF-491 / HF-509)

Reviewer: Muse Spark 1.3 (skeptical second pair of eyes). Static review only:
read/diff/grep. No builds, no browsers, no GPU, no npm install.
Branch: `contrib/dave-gaming-pc/claude/v8-audio-polish`.
Base for this round: `origin/contrib/dave-gaming-pc/claude/pass93-candidate...HEAD`
(23 files, +5933/−173, dominated by REPORT + probe receipt JSON).
Finish commits reviewed: `3a363b8a` (pool telemetry), `5b29e8cf` (shed-door
interact path), `0178ea0a` (vehicle/glass/perforation wiring), `ba2d5800`
(positionality contract gate), `7b099a5b` (report/probe/receipt).
Report reviewed: `docs/evidence/pass95/audio-polish/REPORT.md` §12 (Finish round).
Prior review: `docs/evidence/pass94/muse-review/v8-audio-polish-REVIEW.md`
(verdict SHIP-WITH-FIXES; this file closes its UNFINISHED list item by item).

## Verdict: SHIP

1. The two candidate-9 blockers from the -1 review are closed with evidence:
F1's second shed-door path is positional
(`src/legacy-main.ts:15354` now `audio.shedDoorMotion(nearest.distance,
nearest.centre)`, contract row follows as `nearest.distance,nearest.centre`),
and vehicle/glass/perforation reach real event sites through the additive
`bulletImpact` router (`src/audio.ts:2630-2634`) fed by all five
material-known bullet paths plus the window-breach `glassShatter` call —
every caller keeps its camera listener (`src/legacy-main.ts:14938` single
`updateListener(camera.position, player.yaw)` site).
2. The new gate makes the 2D regression structurally unlandable at the
contract level: `src/sound-event-inventory.test.ts:266` ("keeps every world
one-shot positional") filters the full callsite contract to all 9 world
one-shot voices (`impact / coverImpact / shedDoorMotion / shedPerforation /
vehicleHit / glassShatter / testBayDoorThump / bulletImpact / explosionAt`)
and requires every row to carry a comma plus a position token
(`point|position|origin|centre|trigger|blocker|emitter|muzzle`); the report
states the pre-fix `nearest.distance` row fails the predicate as negative
control. No test was loosened (railgun counts after the pool baseline, same
2/report; footstep same heel-then-settle shape; chiptune strictly stronger;
frag/hosted/glass/zero-hit follow new signatures with identical assertions;
digest recomputed `869f7826...`), and the ratchet holds
(`src/legacy-main.ts` exactly 37,396 lines, every legacy-main hunk a
same-line swap).
3. The lane stays composable and honest about scope: zero `decodeAudioData`
in `src/` outside the forbidding fake, noise pre-generated and the 12-panner
pool + 4 footstep chains pre-built at `unlock()` (before the fence), bus IDs
/ `AUDIO_RUNTIME_BUDGET` / `setArena` / `updateListener` / announcement-bus /
reverb-send semantics untouched so v7-killstreak-awareness composes (merge +
single digest recompute still owed by the integrator, as before). The two
remaining per-event allocators (`explosionAt`, `playAmbientEvent`) stay OPEN
and labelled, not smuggled into the no-alloc claim — correctly scoped as
follow-ups, not candidate-9 blockers.

## Check 1 — second shed-door path positional; no 2D world sound remains

PASS.

- Fixed site — `src/legacy-main.ts:15354`:
`audio.shedDoorMotion(nearest.distance, nearest.centre);`. Why it is right:
`nearestDoor` returns `{ placementId, centre, distance }`
(`src/interactive-world-runtime.ts:734-747`), so `centre` is the door-frame
centre the player hears closest; the sibling obstruction path at `:3997`
already passes `blocker.position`, and now both rows carry emitters.
- Contract follows — `src/sound-event-inventory.ts:324`:
`shedDoorMotion / nearest.distance,nearest.centre`; `:323` blocker row also
2-arg. Digest recomputed once (`869f7826...`, HF-408 procedure).
- Gate is real — `src/sound-event-inventory.test.ts:266-288`: filters
`CURRENT_RUNTIME_SOUND_CALLSITE_CONTRACT` to the 9 world one-shot voices,
asserts `rows.length > 0`, then per row requires `','` in
`argumentSignature` and a position-token match. Scope note (not a finding):
the gate scans the contract table, not `legacy-main.ts` source text
directly — a caller that regressed without updating its contract row would
pass this test but fail the source-text pins (`zero-hit-feedback`,
`window-glass-debris-presentation`, `hosted-bot-main-integration`,
`frag-grenade-audio`) and the digest discipline; the combination is adequate,
and no 1-arg world one-shot row remains in the contract today (verified by
reading the full contract diff).

## Check 2 — vehicleHit / glassShatter / shedPerforation wired at real event sites, listener on camera

PASS.

- Router — `src/audio.ts:2630-2634` `bulletImpact(material, surface,
distance, emitter)`: `vehicle` → `vehicleHit`, `glass` → `glassShatter`,
`thin-metal` (the perforate class, `src/ballistics.ts`) →
`shedPerforation`, else generic `impact`. Additive method; distance and
emitter pass through untouched so each caller keeps its own listener math.
- Wired callers (all verified in the legacy-main diff): remote-admitted
`:14916`, local `:19617`, local pure-world fallback `:19638`, chopper
gunner `:24957` — each `point.distanceTo(camera.position), point`; bot
`:21266` keeps its authored `point.distanceTo(player.position), point`
(unchanged by this round, noted in the report — acceptable: the bot path's
distance reference predates this lane and the emitter is still passed, so
the voice is positional either way). Window breach
(`breakHouseWindow`, the breakable-windows lane's event site) `:15948` calls
`audio.glassShatter(point.distanceTo(camera.position), point)` directly.
- There are no direct production `vehicleHit(...)` call sites; vehicle voice
is reached via the router on `material === 'vehicle'`. That IS the wiring —
one routing point covers all three families — not a gap. `shedPerforation`
is likewise reached via thin-metal strikes plus the shared door destination
(`src/audio.ts:2641-2647`).
- Listener — `src/legacy-main.ts:14938` single per-frame
`audio.updateListener(camera.position, player.yaw)`. Correct; also the
acoustic-zone probe (early-out preserved).

## Check 3 — killstreak-awareness audio API signatures not changed

PASS.

- `grep -rn "killstreakAnnounce|bombRelease|syncSupportFlightLoops|supportFlightLoops"
src/audio.ts src/legacy-main.ts src/sound-event-inventory.ts` → zero hits
in this branch's diff: this lane adds no killstreak symbols and deletes
none. New API here is strictly additive (optional trailing
`emitter?: SpatialPoint` on `coverImpact/shedDoorMotion/shedPerforation/
vehicleHit/glassShatter/testBayDoorThump`, plus `bulletImpact`,
`worldPannerTelemetry`, bus-table accessors, two new modules).
- `createBus(id)` signature change (drop the numeric arg, read the table) is
compatible — v7 adds no `createBus` calls (per -1 review, unchanged since).
Both lanes still edit `src/audio.ts`, the same `legacy-main.ts` regions,
and the inventory + digest — integrator merges and recomputes the digest
once (see UNFINISHED 3).

## Check 4 — no decode in combat / pre-decoded before the fence

PASS.

- Zero decode/assets: `grep -rn decodeAudioData src/` hits only
`src/audio-test-fake-context.ts:201-203` (forbidding fake: rejects with
"decodeAudioData is forbidden on the combat path") plus its counter. No
`public/audio`, no `public/sfx`; probe receipt
`candidate-run1.json: audioInWindow { buffers: 0, decodes: 0 }`.
- Pre-fence work at `unlock()` (`src/audio.ts:976-990`):
noise textures generated once (`createNoiseBuffer` + `noiseTextures.set`),
then `prepareWorldPanners()` (`:1164-1190`, called at `:989`) pre-creates
12 pooled panners (`AUDIO_RUNTIME_BUDGET.spatialVoices`, idempotent,
feature-detected) and pre-warms 4 footstep chains
(`WORLD_FOOTSTEP_CHAIN_PREWARM`, `src/audio.ts:645`). The per-call
`createImpactSpatialDestination` allocator is deleted. The headless
280-sound / 0-buffer / 0-panner / 0-decode check remains the no-alloc proof
for pooled one-shots; the in-browser receipt's scope limits are honestly
stated (§12.4: `acquisitions: 0` in-window, 19 >100 ms hitches are
scene/combat load, not audio-attributable).
- Known scope limits (OPEN, not blockers — see UNFINISHED 1–2):
`explosionAt` per-detonation chain, `playAmbientEvent` per-event panner.

## Check 5 — earlier UNFINISHED list, test loosening, ratchet

- [CLOSED] Item 1 (F1 blocker): fixed, §Check 1 above.
- [CLOSED] Item 2 (vehicle/glass wiring): fixed, §Check 2 above.
- [STILL OPEN — follow-up, not candidate-9 blocker] Item 3 / F2:
`explosionAt` pool migration. `src/audio.ts:3480`
`createExplosionSpatialPanner()` still does `createPanner()` +
`createBiquadFilter()` + `setTimeout` per detonation
(timer `src/audio.ts:3529` region, bounded by the 90 ms coalesce gate).
Why it stays open: the loudest combat sound still constructs its HRTF
chain in combat. Smallest fix: route `explosionAt` through
`acquireWorldPanner` + a shared lowpass, or pre-allocate N explosion
chains at `unlock()`; until then keep the OPEN label and do not claim
"0 panners in combat" for explosions. Report §12.5 keeps it OPEN. Endorsed.
- [CLOSED as lane evidence; re-run owed on the merged tree] Item 4 (probe
receipt): report §12.4 now quotes `candidate-run1.json` (2026-09-05T07:27Z,
46.6 s combat window, 0 decodes, live `urban-yard→interior-room→urban-yard`
round-trip, 0 console/page errors) with explicit caveats. The receipt
predates the finish-round same-line swaps; the integrator re-runs
`scripts/qa/pass95-audio-polish-hitch-probe.mjs` on the merged candidate.
- [CLOSED] Item 5 (unstaged telemetry hunk): committed as `3a363b8a`;
`worldPanners` in the probe object verified at `src/audio.ts:4059,4180`.
Working tree clean at review time.
- [STILL OPEN — HITL, endorsed] Item 6 (owner ears): report §11 —
HRTF-vs-equal-power on owner headphones, interior return 0.21 / 19–53 ms,
per-family ranges as gameplay statements. No lane action; needs owner ears.
- [STILL OPEN — scope note, not blocker] F3: `playAmbientEvent` still
allocates per event (`src/audio.ts:1396` `context.createPanner()`; receipt
proves all 4 in-window panners are ambient stacks with pool acquisitions
0). Smallest fix: route through the world pool (family `impact`/`ambience`)
or keep the no-alloc claim scoped to the report/impact/door/vehicle/glass/
footstep one-shot set, which is what the headless proof covers. Report
§12.5 keeps it OPEN. Endorsed.
- Tests: NO loosening. Railgun counts after the pool baseline (same exactly-2
per report, budget caps, full cleanup); footstep locator follows the
pre-warmed chain (same heel-then-settle shape assertions); chiptune is
strictly stronger (pins through `AUDIO_BUS_LEVEL_TABLE`, forbids a numeric
literal at `createBus('game-music',…)` — guards the two-places regression);
frag/hosted/glass/zero-hit follow the new call shapes with unchanged
assertions; inventory digest recomputed with dated notes (HF-408
procedure). Music-rotation timeout: no timeout widened; -1 review's load
attribution stands, and the finish report's audio-scoped gate run is green
(26 files / 263 tests) plus the three router-following pins outside the
glob.
- Ratchet: `src/legacy-main.ts` is exactly 37,396 lines before and after
(measured `wc -l`); every legacy-main hunk in the finish round is a
same-line argument swap. Ceiling held.

## UNFINISHED

1. `explosionAt` pool migration (from -1 F2, report §12.5 OPEN):
`src/audio.ts:3480` + timer — route through `acquireWorldPanner` + shared
lowpass or pre-allocate N chains at `unlock()`. Follow-up, not a
candidate-9 blocker.
2. Ambient-event allocation (from -1 F3, report §12.5 OPEN):
`src/audio.ts:1396` — route `playAmbientEvent` through the world pool or
keep the no-alloc claim scoped to the one-shot set. Follow-up, not a
candidate-9 blocker.
3. Integrator (report §12.5 + -1 Check 5): merge with
`v7-killstreak-awareness` (merged `dispose()` must clear both
`worldPanners` and v7 `supportFlightLoops`), recompute
`SOUND_EVENT_INVENTORY_SHA256` once over the merged inventory (HF-408
procedure; do not accept either branch's pin alone), run the locked heavy
step (`npm run build` + full `npx vitest run` under machine lock) and the
hitch probe on the merged tree (this lane's receipt predates the finish
swaps). Required before candidate 9.
4. Owner ears (report §11, endorsed): HRTF-vs-equal-power, interior return
level/delay, per-family ranges as gameplay statements. HITL, no lane
action.

## Required before candidate 9

- Nothing further on this lane. Integrator owns UNFINISHED 3 (merge +
digest + heavy step + probe re-run); owner owns UNFINISHED 4 (ears).
