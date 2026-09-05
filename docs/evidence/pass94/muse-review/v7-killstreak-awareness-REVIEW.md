# Muse review — v7 killstreak awareness (HF-509)

Reviewer: Muse Spark 1.3 (third, independent pair of eyes).
Branch: `contrib/dave-gaming-pc/claude/v7-killstreak-awareness` (head `c5d76529`).
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` (`452d7aba`).
Scope: `docs/evidence/pass95/killstreak-awareness/REPORT.md`, full diff base...HEAD,
`src/killstreak-awareness.ts`, `src/killstreak-protocol.ts`, `src/audio.ts`,
`src/spatial-audio.ts`, `scripts/qa/mp-audit.mjs`, `src/killstreak-awareness.test.ts`.
No builds, no browsers, no GPU. No test, threshold, fence, budget or ratchet touched
(`legacy-main.ts` 37,377 lines vs 37,396 ceiling — verified in diff stat).

## Verdict: SHIP-WITH-FIXES

Three reasons:
1. No architectural flaw. Every confirmed issue below is a one-line guard or one
   missing call — narrow the `cause.kind` guard, add one `syncSupportFlightLoops([])`,
   admit `'offline'` in one early return, add one conjunct to `result.ok`.
   Nothing needs redesign; the wire shape, validator, and client admission are sound.
2. The headline regressions (findings 1, 3, 5) each have a smallest fix named
   below, all under five lines, all covered by existing unit tests once pinned.
3. Worst case without fixes is wrong-mix / stale-loop / silent-positional, never
   corrupt state: the master bus has a limiter (`audio.ts:575`), loops self-heal
   via snapshot diff on the next tick, and the audit gate fails safe (records
   findings, just computes `ok` wrong).

## Verifier issues — re-checked

### 1. CONFIRMED — `src/legacy-main.ts:15054` suppresses ALL killstreak directional feedback, replacement covers only 3 sources
`if (cause.kind !== 'killstreak') showDamageDirection(...)` kills the
controller-body pulse for every killstreak cause. The replacement pulse lives
only in `applyKillstreakDamageEvent` (`:24721-24727`), which runs only for
chopper / piloted-drone / drone-swarm damage events. `src/protocol.ts:1002-1005`
proves the peer hit path carries `explosiveSource: yardhawk | tri-pass |
hunter-swarm | nuke`, and `killCauseFromHit` (`src/kill-provenance.ts:19`)
maps any `explosiveSource` to `{ kind: 'killstreak' }` — so Yardhawk, Tri-Pass,
Hunter Swarm and Nuke victims now get NO directional cue at all. Opposite of
the owner request.
Smallest fix: narrow the guard to the three sources the new cue covers
(e.g. `KILLSTREAK_CUE_SOURCES = new Set(['chopper','piloted-drone','drone-swarm'])`
and suppress only those), or record a labelled pulse at the blast origin on the
explosive path.
Sub-finding (new): carpet-bomber DOUBLE-cues on the event path.
`killCauseFromKillstreak('carpet-bomber')` returns `{ kind: 'environment' }`
(`src/kill-provenance.ts:25`), so `applyKillstreakDamageEvent` → `applyDamage`
with cause `environment` passes the `:15054` guard (old pulse fires) AND the
new labelled pulse is recorded at `:24721`. Fix with the same set-guard.

### 2. CONFIRMED — `src/legacy-main.ts:25004-25009` leaks flight loops over the scoreboard
The `matchState.phase === 'ended'` branch calls `audio.syncChopperRotors([])`
but not `audio.syncSupportFlightLoops([])`. A carpet bomber or drone swarm
alive at match end drones on until page unload (`audio.dispose` is the only
other stop). Note the `!gameStarted` branch directly above (`:24997-25003`)
stops both — this is a copy-paste omission.
Smallest fix: add `audio.syncSupportFlightLoops([]);` at `:25005`.

### 3. CONFIRMED — `src/legacy-main.ts:24387` silences solo
`announceKillstreakActivation` returns early on `network.role !== 'host'`, and
solo runs as `'offline'` (`src/legacy-main.ts:6798`). Solo therefore gets no
`#killstreak-alert` banner, no sting, no feed line. The old code called
`addFeed(... CALLED ...)` unconditionally in the intent handler, so this is a
solo regression, not just a missing feature.
Smallest fix: `if (network.role !== 'host' && network.role !== 'offline') return;`
and, for `'offline'`, skip `network.send` but still run
`presentKillstreakAnnouncement` (guard the send, not the whole function).

### 4. QUALIFIED — `src/killstreak-awareness.ts:329` cap contention is real, "silently drops gunfire" is overstated
`MAX_KILLSTREAK_FLIGHT_AUDIO_SOURCES 6` + up to 4 chopper rotors = 10 live
`spatialChains` against `AUDIO_RUNTIME_BUDGET.spatialVoices 12`
(`src/spatial-audio.ts:7`). But gunfire (`supportGunPositional`,
`src/audio.ts:3434`) and bomb release (`:3844`) go through
`createSupportGunSpatialDestination`, which returns `null` past the cap and
falls back to the flat `weapons` bus — still audible, just non-positional.
Truly silent drops at cap: new loop creation (rotor/flight,
`registerVoice` returns false → `continue`) and blade-slap one-shots (`:3705`).
So the failure mode is loss of POSITION, not loss of gunfire audio — except
footsteps (`acquireFootstepChain`, not traced here) and any spatial caller
without a flat fallback.
Smallest fix: cap flight loops at 4 instead of 6 (one swarm + margin), and/or
steal the farthest loop instead of refusing new ones; route blade-slap through
the non-spatial path so it never burns a chain.

### 5. CONFIRMED — `scripts/qa/mp-audit.mjs:835` gate can go green without verifying the headline
`result.ok` (`:835`) omits `damageSourceLabelled`, and the unobserved case is
filed at severity `'info'` (`:832`). A run where the AI gunner hits nobody in
25 s reports `ok=true` having never verified damage-source labelling — the
owner's headline requirement ("really clear that you're getting shot by the
chopper gunner"). The `KILLSTREAK-DAMAGE-SOURCE-UNOBSERVED` info finding is
recorded, but `ok` ignores it.
Smallest fix: `result.ok = ... && row.damageSourceLabelled` per guest, or at
minimum `&& result.damageObserved`; alternatively force the damage (scripted
victim in the gun lane) instead of waiting on the AI.

### 6. CONFIRMED — REPORT.md:132 off-by-one
Line 132 says "`src/killstreak-awareness.test.ts` (11 tests)" but the file
contains 12 `it(` blocks (lines 63, 76, 90, 102, 114, 145, 172, 196, 228, 238,
249, 264 — counted, not run). Cosmetic; fix the number.

## (a) Wire trust and cost — SOLID, verifier's worry is answered
- Shape validated on receipt: `isGameMessage` runs on every received payload
  (`src/network.ts:383,848,1205,1406`) and the `killstreak-announce` arm
  (`src/killstreak-protocol.ts:582-590`) enforces exact keys, catalog id,
  bounded vec3, and epoch-bound activation id
  (`ks-activation-<epoch>-...` prefix). Malformed/forged-shape dies there.
- Guest relay dies twice: host-side `isHostAuthorityMessage(payload)` drop at
  `src/network.ts:1295` (announce is in `isKillstreakHostAuthorityMessage`),
  and client-side the handler (`src/legacy-main.ts:12944-12950`) requires
  `role === 'client'` PLUS `admitKillstreakAnnounceMessage` forged-host /
  epoch-mismatch / duplicate-activation checks on the RECEIVING side.
- Replay: cross-match replay is dead (epoch-bound id + epoch check); same-match
  replay of an identical message is a duplicate-activation drop. No nonce
  window is needed — dedup key is the activation id, bounded at 256.
- Cost: one small message per activation (~100 B, two sends — self activation
  and remote-intent paths). Steady state is `broadcastKillstreakState` at
  10 Hz/guest (`:25119`, `lastKillstreakStateBroadcastAt >= 100`) plus
  damage-result only on action steps, against the 20 Hz snapshot budget
  (`src/audio.ts:1285` lane / `legacy-main.ts:27268` min-rate). Added volume
  is <0.1 % of per-second traffic. No concern.

## (b) Audio lifecycle on every exit path
- Match end: LEAKS (finding 2). One-line fix named above.
- Rejoin (`startGame`, `:17481+`): resets deduper/activity/banner and builds a
  new runtime, but makes no explicit audio stop. Self-heals: the next
  `syncActiveSupportRotorAudio` tick diffs the (empty) snapshot and stops
  stale loops. Converges within ~50 ms. Acceptable; an explicit stop pair
  next to the banner reset would remove the one-frame tail.
- Host migration (`adoptMirroredHostAuthority`, `:7294`): no audio touch.
  Same snapshot-diff self-heal. OK.
- Spectate: no spectate mode exists in this codebase (no matches for
  `spectat`). N/A.
- Entity destroyed mid-flight: snapshot drops the entity → collector omits it
  → `liveSupportFlightIds` diff calls `stopSupportFlightLoop` → `stopSource`
  → `onended` decrements `spatialChains`. Verified pattern in both sync fns
  (`:3647`, `:3899`). OK — the cap can only be reached by LIVE loops, never
  by leaked chains. Issue 4 is contention, not a leak.
- Owner disconnect (`recordActorDisconnect`, `:9108,:16685`): entity persists
  to expiry and the loop correctly keeps playing — the aircraft is still
  flying. By design, not a leak.
- Tab hide/show (`:29064-29082`): `audio.suspend()` silences the context;
  loops persist inaudibly, `onended` deferred while suspended, converge on
  resume. No leak, no explicit release needed.

## (c) The mix — two real stacking problems, no clipping risk
- Routing: flight loops + rotors → `ambience` bus (base 0.12); gunfire/bomb →
  `weapons` bus (0.78, flat fallback past cap); footsteps → `movement` (0.3);
  announce sting → `announcements` + `feedback` + `ui`. No ducking between
  flight loops and gunfire — they sum at master, which has a true limiter
  (`audio.ts:575`), so worst case is limiting, not clipping. Absolute levels
  are modest (6 × 0.13 aircraft loops × gain curve through a 0.12 bus).
- NEW stacking bug: Yardhawk / Tri-Pass / Hunter Swarm now play TWO stings.
  `audio.supportInbound(...)` still fires on the local paths (`:26307`
  tri-pass, `:26507` yardhawk, `:26621` remote message) AND
  `presentKillstreakAnnouncement` → `audio.killstreakAnnounce` runs for EVERY
  admitted activation. Smallest fix: remove the `supportInbound` calls for
  announced ids (the announce sting supersedes them) or gate on
  `killstreakAnnouncements` admission.
- Self-duck note: the HF-350 ambience explosion duck dips the same `ambience`
  bus the flight loops live on, so a carpet bomber ducks its own loop for ~4 s
  after its bombs land. Self-consistent (explosion should dominate); no fix,
  just note it for the headed listening pass.
- Owner question ("hear the streak AND keep hearing the fight"): gunfire and
  bomb release stay audible via flat fallback even at the chain cap; only
  positional quality degrades. Rotor gains (0.075/0.065/0.05/0.03, floor 0.42
  over 110 m) are procedural, not A/B'd — the report honestly marks the
  headed listening pass `[OPEN]`. Keep it open.
