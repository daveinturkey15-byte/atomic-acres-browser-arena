# Muse review 2 — v7 killstreak awareness (HF-509)

Reviewer: Muse Spark 1.3 (skeptical second pass).
Branch: `contrib/dave-gaming-pc/claude/v7-killstreak-awareness` (head `63bc7020`).
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` (`452d7aba`).
Scope: full diff base...HEAD, `REPORT.md` incl. `Verifier fix round`, `v7-killstreak-awareness-REVIEW.md` (`c5d76529`/`f8eff0d6`), fix commits `548ab778` `6b71961b` `0c567668` `78b5f4f9` `6efa60fe` `6549bb70`.
Method: source-read only. No builds, no browsers, no GPU, no npm install. No `tsc`/`vitest` run in this pass; test claims below are source-read (`it(` blocks counted, assertions read), not executed here.

## Verdict: SHIP-WITH-FIXES

Three reasons:
1. The three regressions are really closed for the streaks that have the regressed path, and the wire/replication/audio core is sound (host-only announce + forged-guest drop twice, per-guest 100 ms replication, HRTF loops + procedural cues). No redesign needed.
2. The remaining defects are all narrow over/under-firing of cues, all with a smallest fix under five lines: carpet-bomber double directional cue (finding 1), yardhawk/tri-pass/hunter-swarm double sting (finding 6). Worst case without them is a duplicated marker/sting, never corrupt state (master limiter `audio.ts:575`, snapshot-diff self-heal, audit fails safe).
3. No test, threshold, fence, budget, timeout, or ratchet was weakened to get green; the audit gate was strengthened (`78b5f4f9`). The only gate-weakness left is a missing distance bound on replication (finding 7), which fails open toward false-red, not false-green, once the label conjunct is required.

## Killstreak table (12 catalog ids, `src/killstreak-catalog.ts:264-280`)

`scout-sweep`, `adrenaline`, `care-package`, `yardhawk`, `piloted-drone`, `tri-pass`, `carpet-bomber`, `hunter-swarm`, `chopper`, `drone-swarm`, `crimson-flamethrower` (care-only), `nuke`.

Labels cover all 12 (`src/killstreak-awareness.ts:28-41`); announce validator accepts every catalog id (`ids.has`, `src/killstreak-protocol.ts:589`); world entities exist only for `care-package`, `piloted-drone`, `carpet-bomber`, `chopper`, `drone-swarm` (`WORLD_KILLSTREAK_IDS`, `awareness.ts:44-46`; entity kinds `aircraft|chopper|drone|care-crate`, `killstreak-protocol.ts:312`).

## (1) The three fixes, traced per streak type

### Fix A — `548ab778` damage direction (`src/legacy-main.ts:15054`): CLOSES for 6, N/A for 5, STILL DOUBLE for carpet-bomber

Current guard:
`if (cause.kind !== 'killstreak' || !['chopper','piloted-drone','drone-swarm'].includes(cause.effect)) showDamageDirection(...)` (`legacy-main.ts:15054`).
Replacement labelled pulse for the victim at the weapon origin with catalog label (`applyKillstreakDamageEvent`, `:24721-24727` via `killstreakDamageSourceCue`, `awareness.ts:408-417`).

- `chopper`, `piloted-drone`, `drone-swarm`: CLOSED. Old controller-body pulse suppressed, new origin pulse + label (`CHOPPER GUNNER`, `PILOTED DRONE`, `DRONE SWARM`) recorded. Correct bearing (source-screen-angle at `cue.position`, `:24726`) instead of the cockpit body.
- `yardhawk`, `tri-pass`, `hunter-swarm`, `nuke`: CLOSED (regression repaired). These map to `{ kind:'killstreak' }` via `killCauseFromHit` (`kill-provenance.ts` + `protocol.ts:1044-1045`) but never enter `applyKillstreakDamageEvent` (no runtime damage event; legacy offensive path), so they keep the generic attacker-direction marker. Before the lane they had it; after `a5c4e798` they lost it; after `548ab778` they keep it again. No labelled cue for them — intended, matches owner headline (chopper/carpet/drones).
- `scout-sweep`, `adrenaline`, `care-package`, `crimson-flamethrower`: N/A. Non-damaging (instant buff / crate / weapon grant); neither path fires.
- `carpet-bomber`: NOT CLOSED — double cue. `killCauseFromKillstreak('carpet-bomber')` returns `{ kind:'environment' }` (`kill-provenance.ts:24-25`). On the event path `applyKillstreakDamageEvent` calls `applyDamage(..., cause=environment)` (`:24719`), which passes the `:15054` guard (`'environment' !== 'killstreak'` → true, old pulse fires at `MAP_CARPET_BOMBER_KILLER_ID` attacker), AND the new labelled `CARPET BOMBER` pulse is recorded at `:24724`. One carpet hit → two directional markers. This is the sub-finding from REVIEW-1, still present after `548ab778` (the guard only narrows `kind==='killstreak'`).
- Finding 1 (ship-with-fix): `src/legacy-main.ts:15054 + :24721-24727 + src/kill-provenance.ts:24-25`. Why: carpet victims get a misleading map-id bearing plus the correct blast-origin bearing. Smallest fix: suppress the generic pulse for the map carpet killer too, e.g. extend the guard with `&& attacker !== MAP_CARPET_BOMBER_KILLER_ID`, or early-return the generic pulse when inside `applyKillstreakDamageEvent` (the labelled cue supersedes it there).

### Fix B — `6b71961b` match-end flight audio (`src/legacy-main.ts:25005-25006`): CLOSES for every streak with a loop

Ended branch now calls both `audio.syncChopperRotors([])` and `audio.syncSupportFlightLoops([])` (`:25005-25006`), mirroring the `!gameStarted` branch (`:24998-24999`). Collector admits only live `aircraft|drone` inside 220 m, nearest-six, chopper excluded (own rotor loop) (`awareness.ts:351-362`); `syncSupportFlightLoops` diffs `liveSupportFlightIds` and stops dropped ids (`audio.ts:3858-3866,3924-3929`).

- `chopper`: CLOSED (rotor stop was already there; still there).
- Care aircraft (`care-package` world entity, kind `aircraft`), `carpet-bomber` (kind `aircraft`, id `/-carpet-/`), `piloted-drone` + `drone-swarm` (kind `drone`): CLOSED. These are exactly the families the collector admits; the missing call was the only leak over the scoreboard.
- `care-package` crate (`care-crate`), `scout-sweep`, `adrenaline`, `yardhawk`, `tri-pass`, `hunter-swarm`, `nuke`, `crimson-flamethrower`: N/A — never admitted to the collector (kind gate), nothing to leak.
- No other exit path regressed: rejoin resets deduper/activity/banner (`:17487-17491`) and self-heals via next snapshot diff (~50 ms tick); entity expiry drops from snapshot → collector omits → `stopSupportFlightLoop`. Acceptable.

### Fix C — `0c567668` solo announcements (`src/legacy-main.ts:24387-24397`): CLOSES for all 12

Was `if (network.role !== 'host') return;` (solo `offline` silenced, regression vs old unconditional `addFeed CALLED`). Now `if (network.role === 'client') return;` + `if (network.role === 'host') network.send(message);` + unconditional `presentKillstreakAnnouncement(message, now)` (`:24388,24396-24397`). Offline presents banner/sting/feed locally, never touches the wire. Validator/labels/banner are source-agnostic (`KILLSTREAK_DISPLAY_LABELS` covers all 12; `isKillstreakProtocolMessage` accepts any catalog id), so scout through nuke all announce in solo. Guest path unchanged (client-only handler). CLOSED for every streak type, including non-world ones (announce is per-activation, not per-entity).

## (2) Announce is host-only; forged guest announces rejected — PASS

- Shape validated on receipt: exact keys, catalog id, bounded vec3, epoch-bound `ks-activation-<epoch>-` prefix, finite nonce (`killstreak-protocol.ts:582-590`).
- Host-authority classed (`isKillstreakHostAuthorityMessage`, `:631-637`) so the relay drop at `network.ts:1295` (`isHostAuthorityMessage(payload) || !messageBelongsToPlayer(...) → return`) kills any guest-authored copy on a guest connection. Public to the whole lobby (`killstreakMessageBelongsToPlayer` returns true for announce, `:622-623`).
- Client handler requires `role==='client'` PLUS `admitKillstreakAnnounceMessage` forged-host / epoch-mismatch / duplicate-activation (`legacy-main.ts:12944-12948`; admission `awareness.ts:98-116`, dedup bounded 256).
- Host path dedupes double activation (self + remote-intent) via `killstreakAnnouncements.admit` (`:24389`). Shared-deduper note: the same object serves host presentation and guest admission, but the two paths are role-exclusive per process, so no cross-talk; on the host the two activation sources correctly share one key.
- Solo (`offline`): presents, never sends (Fix C). No nonce window needed — dedup key is activation id; cross-match replay dies on epoch check + id prefix.

## (3) Position/state replication reaches guests each tick — PASS (transport), test pins it

- Host-only broadcast to every remote (`broadcastKillstreakState`, `:24271-24277` loops `remotes.values()`), called on every mutation (activation `:24381`, intent `:12888`, control `:12894`, damage/death `:15107/:16555/:16691`, join `:13436`) plus the 100 ms cadence tick (`:25120 `now - lastKillstreakStateBroadcastAt >= 100``). Not controller-only; `snapshotFor(guest)` per recipient, recipient-only validity pinned in test.
- Unit pin: `killstreak-awareness.test.ts` registers host + two guests, activates a chopper, asserts identical id/position/phase/activationId/ownerId at three advance times for both guests. Source-read; not re-run here.
- Awareness phases (`inbound|active|firing|dropping|leaving`) derived per peer from replicated phase + public shots/impacts reports, no extra message (`awareness.ts:259-274`, tracker `:227-257`).

## (4) Audio is positional; no decode in combat — PASS with one open contention

- Listener on camera: `audio.updateListener(camera.position, player.yaw)` every frame (`:14954`); flight collector takes `camera.position` as the listener (`:24801`); all emitters positioned at world coords with HRTF panners (flight loops `audio.ts:3884-3888` panning-only + shared curve gain; rotors `:3623-3627`; gun/bomb via `createSupportGunSpatialDestination`, HRTF/inverse, `:3500-3505`; explosions `:3335-3339`).
- Attenuation: shared `killstreakAudioGain` — 1.0 inside 10 m, monotone to 0 at 220 m, altitude halves at 70 m with 0.42 floor (`awareness.ts:316-327`); rotor gains raised (0.075/0.065/0.05/0.03) with same floor; flight base gains 0.13 aircraft / 0.05 drone, louder dropping/firing, pitch up inbound / down leaving (`audio.ts:3914-3918`).
- No combat decode: `killstreakAnnounce` = `sweep`/`tone`/`noise` (procedural, `:3817-3829`); flight loops = `createOscillator` + filter + gain (`:3873-3906`); `bombRelease` = `tone` + `sweep` + `noise` (`:3847-3849`); noise reuses the prebuilt `noiseBuffer`/textures created at init (`:965-970`), not `fetch`/`decodeAudioData` per event (no `decodeAudioData`/`fetch(` in `audio.ts` combat path — grep-clean). Drop cue covers chopper missile (rail `launchPosition`) and carpet bomb (drop `position`) via one helper (`supportDropCue`, `awareness.ts:386-391`; `presentSupportDropCue` owns both callsites).
- Open (pre-existing, not a regression): cap contention from REVIEW-1 finding 4 unchanged — 6 flight + up to 4 rotor chains against `spatialVoices 12`; gunfire/bomb fall back to flat `weapons` bus (audible, non-positional) but new loop creation and blade-slap one-shots (`:3705` via `registerVoice`) drop silently at cap. Smallest fix (not applied): cap flight at 4, steal farthest instead of refusing, route blade-slap non-spatial. Headed listening pass still `[OPEN]` per REPORT — keep open; gains are ear-reasoned, not A/B'd.

## (5) Tests loosened / counts hand-edited — NO WEAKENING (ratchet intact)

- `pass70-chopper-gunner-contract.test.ts`: re-pointed, not loosened. Glyph-budget scan now covers `legacy+cockpitHud` (threshold `>= 2` unchanged); exit-path pin checks the module body AND delegation (`hideGunnerCockpitHudElements` + `nextLocalSupportGunReportAt = 0` still asserted). Verbatim hoist to `gunner-cockpit-hud.ts` pays for wiring under the ceiling.
- `sound-event-inventory.ts` + digest: legitimate recompute (`6a202a8f… → 8d70c0a3…`): one new event (`support.killstreak-announce`), four planned→existing with real emitters, `missileLaunch` callsites collapsed 2→1 helper plus new `bombRelease`/`killstreakAnnounce` rows; flight-cleanup second callsite 1→2 (`6549bb70`). Occurrence counts, not thresholds.
- `killstreak-awareness.test.ts` (12 tests, REPORT line corrected `6efa60fe`) + fix-round file (5 tests, source-text pins): pins, not relaxations. No threshold/fence/budget/timeout/soak bound changed. `legacy-main.ts` 37,378 lines vs `LINE_CEILING` 37,396 (read `wc -l`; ceiling unchanged in `legacy-main-size-ratchet.test.ts`).
- Fix-round tests assert on source substrings (`sourceBlock` + `toContain`) — brittle but not loosened; a refactor moving the same line breaks the test without breaking behavior. Prefer behavioral pins (call the pure helpers) in follow-up. Not ship-blocking.

## New / residual findings

- Finding 1 (residual, ship-with-fix): carpet-bomber double directional cue — `legacy-main.ts:15054` + `:24721-24727` + `kill-provenance.ts:24-25`. Smallest fix: exclude the map carpet killer from the generic pulse (or skip generic pulse inside `applyKillstreakDamageEvent`).
- Finding 6 (residual from REVIEW-1 §c, still present): yardhawk / tri-pass / hunter-swarm double sting — `audio.supportInbound(...)` still fires on local paths (`:26308` tri-pass, `:26508` yardhawk, `:26622` remote) AND `presentKillstreakAnnouncement → audio.killstreakAnnounce` (`:24406`) runs for every admitted activation. Smallest fix: remove the three `supportInbound` calls for announced ids (announce sting supersedes) or gate them on announcement admission.
- Finding 7 (gate weakness, fails toward false-red now): `scripts/qa/mp-audit.mjs scenarioKillstreakAwareness` — `row.replicated` checks only `distanceFromHostM !== null` (three samples), no distance bound, so a lagging replica passes; and `result.ok` now requires `damageSourceLabelled` for BOTH guests while damage is opportunistically waited (AI gunner, 25 s) — a quiet AI run fails the gate without a product defect. Smallest fix: bound replication (e.g. every sample `distanceFromHostM <= 1.5` matching the soak position bound) and either force damage (scripted victim in the gun lane) or split the gate into `ok` (announce/banner/replication, deterministic) + `damageObserved` (opportunistic, reported separately).
- Non-finding (checked, OK): `killstreakEntitySourceId` fallback (`/-carpet-/ ? carpet : care-package`, `awareness.ts:281`) is only entity→label for presentation, never the announce path (banner uses `message.source`); care aircraft reading as `care-package` there does not mislabel the banner. `supportDropCue` returning `bomb` for any non-chopper drop is only reached for chopper/carpet public drop reports; legacy supports never emit that phase.
- MP-audit rows remain `[OPEN]` (both runs died at deploy on the preserved WebGPU fence; scenario code `node --check` only). No fence/timeout/budget changed. Full-suite rerun after the contract re-pin remains `[OPEN]` per REPORT.

## Files reviewed

`src/killstreak-awareness.ts`, `src/killstreak-awareness.test.ts`, `src/killstreak-awareness-fix-round.test.ts`, `src/killstreak-protocol.ts`, `src/killstreak-catalog.ts`, `src/killstreak-runtime.ts` (spot), `src/killstreak-tuning.ts` (spot), `src/kill-provenance.ts`, `src/protocol.ts` (spot), `src/network.ts` (spot), `src/audio.ts` (flight/rotor/announce/bomb/listeners), `src/sensory-feedback.ts` (diff), `src/sound-event-inventory.ts`, `src/gunner-cockpit-hud.ts`, `src/ui/pass64-shell.ts` + `pass75-hud-redesign.css` (banner + `data-source-label`), `scripts/qa/mp-audit.mjs` (scenario + gate), `docs/evidence/pass95/killstreak-awareness/REPORT.md`, `docs/evidence/pass94/muse-review/v7-killstreak-awareness-REVIEW.md`.
