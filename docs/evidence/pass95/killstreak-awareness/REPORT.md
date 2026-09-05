# PASS 95 lane: killstreak awareness (HF-509)

Date: 2026-09-05
Lane: `killstreak-awareness`
Branch: `contrib/dave-gaming-pc/claude/v7-killstreak-awareness`
Base: `452d7aba` (candidate 7, `origin/contrib/dave-gaming-pc/claude/pass93-candidate`)
Worktree: `C:/Users/david/projects/aa-v-killstreak-awareness`
Browser ports: 4256 (dist) / 4257 (PeerJS), headless installed Chrome, `PASS73_NATIVE_WEBGPU=1`

Claim-state convention: `[VERIFIED]` I ran it and quote its output; `[MEASURED]`
numbers from an instrument I ran; `[OPEN]` not proven here.

## Owner statement (HF-509)

"in multiplayer when the chopper gunner was live it just wasn't clear because
you couldn't really see and hear it very well as someone who wasn't the
controller ... it needs to be really clear that you're getting shot by the
chopper gunner, that's where it's coming from ... the whole map should be aware
if a killstreak like a pilot's drone or drone swarm or a chopper gunner is
there, and the same for the carpet bomber ... audible to everybody, not just
the person who's used it ... before it happens when it's flying, you should be
able to hear it when it's dropping things, and all the audio should have
proximity too."

## Before: what the base did (`452d7aba`, read with `git show HEAD:<file> | grep`)

`[VERIFIED]`

| Requirement | Base state |
|---|---|
| (1) activation announced to every peer | `grep -c 'killstreak-announce' src/killstreak-protocol.ts` = `0`. The only activation notice was `addFeed(... CALLED ...)` at `legacy-main.ts:12875`, executed on the host only, inside the host's intent handler. Guests got nothing. |
| (2) position/state replicated each tick | Already present: `broadcastKillstreakState` sends `killstreak-state` (every entity with position/velocity/attitude/phase) to every remote at a 100 ms cadence. It had no two-guest test. |
| (3) positional flight/firing/dropping audio for every peer | The rotor loop existed at `gain 0.018 * altitudeAttenuation` with `altitudeAttenuation = max(0.25, 1 - altitude/80)` (`audio.ts:3602,3614`): a chopper orbiting at 60 m ran at gain 0.0045, effectively inaudible. `syncActiveSupportRotorAudio` skipped every non-chopper entity (`legacy-main.ts:24722`): no flight audio at all for the Carpet Bomber, care aircraft, Piloted Drone or Drone Swarm on any peer. Carpet bomb drops were silent everywhere (only the chopper missile had a launch cue). |
| (4) victim damage direction + source label | `applyDamage` called `showDamageDirection(attacker, ...)` (`legacy-main.ts:15035`) with the controller's player id, so the indicator pointed at the controller's body (sitting in the cockpit elsewhere) and, for the Carpet Bomber (`map:carpet-bomber`), at nothing. No source label existed. |
| (5) whole killstreak table | No banner element existed (`grep -c killstreak-alert src/ui/pass64-shell.ts` = `0`). |

## After: what changed (commit `a5c4e798`)

New pure module `src/killstreak-awareness.ts` (tested in
`src/killstreak-awareness.test.ts`) and `src/gunner-cockpit-hud.ts` (cockpit
HUD hoisted verbatim out of legacy-main to pay for the new wiring under the
unchanged ratchet).

1. **Announcement, host-authoritative, guests never relay.** New protocol
   message `killstreak-announce` `{ by: host, matchEpoch, activationId
   (host-minted ks-activation-<epoch>-...), ownerId, ownerTeam, source,
   position, nonce }` validated in `killstreak-protocol.ts` (exact keys,
   catalog id, bounded vec3, epoch-bound activation id), classed as a
   host-authority message (so `network.ts:1295` drops any guest-authored copy)
   and public to every peer. The host sends it from both activation paths
   (its own `requestKillstreakActivation` and the remote
   `killstreak-activate-intent` handler) right after `broadcastKillstreakState`.
   Every peer, host included, runs one `presentKillstreakAnnouncement`:
   banner `#killstreak-alert` (`ENEMY | FRIENDLY | YOUR <LABEL> INBOUND`,
   `CALLED BY <name>`), `audio.killstreakAnnounce(tone)` sting, feed line.
   De-dup is by activation id in `KillstreakAnnouncementDeduper` (bounded
   256) on the host (two paths cannot double-announce) and inside guest
   admission (`admitKillstreakAnnounceMessage`: forged-host,
   match-epoch-mismatch, duplicate-activation).
2. **Replication to every guest each tick.** Transport unchanged; now covered
   by `killstreak-awareness.test.ts > projects the same chopper entity ... to
   two guests`, which registers host + two guests on `HostKillstreakRuntime`,
   activates a chopper and asserts at three advance times that
   `snapshotFor('guest-a')` and `snapshotFor('guest-b')` carry the host's
   entity id/position/phase and that each recipient snapshot is a valid,
   recipient-only `killstreak-state`. Awareness phases
   `inbound | active | firing | dropping | leaving` are derived on every peer
   from the replicated phase plus the public `shots`/`impacts` reports
   (`KillstreakActivityTracker`), with no extra message.
3. **Positional audio on every peer.** Rotor loop gains raised (orbit
   0.018 -> 0.075, inbound 0.015 -> 0.065, outbound 0.012 -> 0.05, blade slap
   0.008 -> 0.03; altitude floor 0.25 -> 0.42 over 110 m). New
   `audio.syncSupportFlightLoops` gives each replicated aircraft/drone entity
   one HRTF loop at its world position (nearest six, allocation-bounded
   `KillstreakFlightAudioCollector`), gain from the shared
   `killstreakAudioGain(distance, altitudeAboveListener)` curve (1.0 inside
   10 m, monotone to 0 at 220 m, altitude halves the gain at 70 m with a 0.42
   floor), louder while `dropping`/`firing`, pitch up inbound and down
   leaving. New `audio.bombRelease(emitter)` plays the Carpet Bomber bay
   release at the drop point on host and guests from the public drop-phase
   report (`presentSupportDropCue`, which also owns the chopper missile
   launch). Sound inventory: one new event (`support.killstreak-announce`);
   `support.care-aircraft`, `support.carpet-aircraft`, `support.drone-rotor`,
   `support.carpet-bomb` moved from planned to existing with real emitters;
   digest recomputed `6a202a8f... -> 8d70c0a3...`.
4. **Damage source.** `applyKillstreakDamageEvent` (the victim path on host
   and guest) records a `killstreak` directional pulse at `event.origin` (the
   authoritative weapon origin) with `sourceLabel` from the catalog
   (`CHOPPER GUNNER`, `CARPET BOMBER`, `PILOTED DRONE`, `DRONE SWARM`);
   `applyDamage` no longer adds the misleading controller-body pulse for
   `cause.kind === 'killstreak'`. The marker carries
   `data-source-label`, rendered by CSS `::after`. QA mirror:
   `__ATOMIC_ACRES_DEBUG__.snapshot().killstreakAwareness = { announcements, damageSource }`.
5. **Table coverage.** Labels come from `KILLSTREAK_DISPLAY_LABELS` for every
   `Pass65KillstreakId`; the announce validator accepts every catalog id;
   flight loops cover `aircraft` (care + carpet) and `drone` (piloted +
   swarm), choppers keep their rotor loop; the drop cue covers chopper
   missiles and carpet bombs.

Nothing was weakened: no test, threshold, fence, budget, timeout, soak bound
or the legacy-main ratchet changed. `legacy-main.ts` went 37,396 -> 37,377
lines with `LINE_CEILING` untouched at 37,396. Two text pins were updated for
legitimate reasons and nothing else: the sound-inventory digest (new and
newly-implemented events) and the `missileLaunch` callsite signature (both
callsites collapsed into one helper).

## Gates

`[VERIFIED]` `npx tsc --noEmit`: exit 0, no output (run after every edit; last run after the
final legacy-main reorder).

`[VERIFIED]` targeted set `npx vitest run src/network*.test.ts src/protocol*.test.ts
src/*killstreak* src/*audio* src/*sound* src/*hud* src/legacy-main-size-ratchet.test.ts
src/sensory-feedback.test.ts src/support-presentation-cadence-contract.test.ts
src/ui/surface-registry.test.ts` (with the new `src/killstreak-awareness.test.ts`):

```text
Test Files  1 failed | 63 passed | 1 skipped (65)
Tests       1 failed | 634 passed | 2 skipped (637)
```

The one failure was `killstreak-main-integration.test.ts` pinning
`lastLocalKillstreakSnapshotRefreshAt = Number.NEGATIVE_INFINITY;\n  broadcastKillstreakState(now);`
adjacency; the announce call was moved after the broadcast (better ordering: guests hold the
entity when the announce lands). Rerun of that file + the awareness tests + the ratchet:

```text
Test Files  3 passed (3)
Tests       43 passed (43)
```

`[VERIFIED]` `src/killstreak-awareness.test.ts` (12 tests): announce shape/authority/audience,
malformed rejection, admission (forged host / epoch / duplicate activation), bounded de-dup,
two-guest replication at three advance times, phase derivation, attenuation curve
(monotone, 1 at 10 m, 0 at 220 m, altitude halving and floor), bounded nearest-first pool,
drop cue, banner text/tones, banner show/expire, damage-source cue.

`[VERIFIED]` `src/legacy-main-size-ratchet.test.ts` green; `wc -l src/legacy-main.ts` =
`37377` (ceiling 37,396 unchanged).

`[VERIFIED]` under the machine lock, `npm run build`: rc 0 (07:51:15-07:51:47), bundle
`legacy-main-0y-zPEch.js`.

`[VERIFIED]` under the machine lock, full `npx vitest run` (08:02:16-08:05:30):

```text
Test Files  1 failed | 621 passed | 1 skipped (623)
Tests       2 failed | 6254 passed | 2 skipped (6258)
```

The two failures were both in `src/pass70-chopper-gunner-contract.test.ts` and both were
text pins that read the cockpit-HUD writers from `legacy-main.ts` (`#gunner-missile-ammo`
glyph writers; `hideGunnerCockpitHud` body). Those bodies were hoisted verbatim to
`src/gunner-cockpit-hud.ts`; the test now reads them from there with every assertion kept
(the glyph budget scans legacy-main + the module; the exit-path pin checks the module body
and that legacy-main's `hideGunnerCockpitHud` delegates to it and still resets
`nextLocalSupportGunReportAt`). Rerun: `Test Files 1 passed (1) · Tests 17 passed (17)`.
`[OPEN]` the full suite was not rerun end-to-end after that test edit (time box); the only
files touched after the full run are that test file and this report.

## mp-audit killstreak scenario (three headless peers, 4256/4257)

`scripts/qa/mp-audit.mjs` gained `scenarioKillstreakAwareness` (runs before rejoin): the HOST
earns 15 eliminations and activates a Chopper Gunner; for each guest it records
`announced` (an inbound `killstreak-announce` in its message trace), `relayedByGuest`
(any outbound one - must be false), `bannerShown` (`#killstreak-alert` visible with
CHOPPER GUNNER, or the QA announcement mirror), `replicated` (three samples of the guest's
replica of the host chopper against the host's authoritative position, distance in metres
and phase per sample), and `damageSource` (the victim cue with label and world position,
waited up to 25 s for the AI gunner - never forced). Summary lines are printed per guest.

**Before rows (base `452d7aba`):** `[VERIFIED]` by construction from the base source, not
by a base-build run (`[OPEN]`): the base has no `killstreak-announce` message, no
`#killstreak-alert` element and no `killstreakAwareness` QA mirror, so both guests would
score `announced=false bannerShown=false damageSource=null`; `replicated` would be true
(transport pre-existed).

**After rows:** `[OPEN]`. Two runs on this build, both under the lock, both ended before the
scenario at the lobby deploy step:

```text
# run 1 (nuketown2, 07:55:41-08:02:15)
[mp-audit] all-ready
  [critical] DEPLOY-INCOMPLETE: a peer never reached an active match with both other players present
host console: [Nuke Town Rebuild map selection failed] Error: WebGPU queue completion exceeded 12000 ms
  for submission 1 (completed 0, mode serialized, in-flight 1, pending 12021 ms, probes 1, fenced draws 309)
guestA / guestB: same 12,002 ms fence (pending 12054 / 12060 ms)
label=hf509 arena=nuketown2 completed=false findings: 1 (critical=1)

# run 2 (raid2, 08:05:41-08:06:29)
[mp-audit] all-ready
  [critical] DEPLOY-INCOMPLETE ... deploy {host: rejected, guestA: rejected, guestB: rejected}, no console errors
label=hf509-raid2 arena=raid2 completed=false findings: 1 (critical=1)
```

Run 1 is the preserved 12 s WebGPU fence firing on all three peers at once (the candidate-7
report records the same cold-fence condition on Nuke Town with 687 fenced draws); three
concurrent headless WebGPU peers on a GPU the owner is also using for ComfyUI is the
contention. Run 2 rejected deploy without a console error inside the 48 s the lock allowed.
No fence, timeout or budget was changed. The scenario code itself was syntax-checked
(`node --check`) and is exercised only from the lobby onward, so its rows are `[OPEN]` until
a run reaches deploy; artifacts: `artifacts/qa/mp-audit-hf509/hf509-audit.json`,
`hf509-raid2-audit.json`, logs `artifacts/hf509-mp-audit*.log` (untracked).

## Open items

- `[OPEN]` mp-audit killstreak rows (announce / banner / replica / damage source on two real
  guests) - both runs died at deploy on the preserved WebGPU fence; rerun when the GPU is not
  shared (`PASS73_NATIVE_WEBGPU=1 node scripts/qa/mp-audit.mjs --port 4256 --peer-port 4257`).
- `[OPEN]` full vitest rerun after the `pass70-chopper-gunner-contract.test.ts` re-pin (only
  that file changed after the green-but-for-it full run).
- `[OPEN]` headed listening pass by the owner: the raised rotor gains and the new flight loop /
  bomb release / announce sting are procedural values chosen by ear-reasoning, not A/B'd.
- `[OPEN]` a base-build mp-audit run for the literal "before" rows.
