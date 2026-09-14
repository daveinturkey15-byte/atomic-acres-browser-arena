# HF-458 killstreak tuning + Piloted Drone taser - PASS 94 evidence

Owner request: `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`, ledger row **HF-458**.
Worktree `aa-claude-killstreaks`, branch `contrib/dave-gaming-pc/claude/killstreak-tuning`.
Harness: Claude Code (Opus 5.1), machine `dave-gaming-pc`, 2026-09-04.

Claim-states are **VERIFIED** (a named executable check proves it) or **OPEN**
(implemented, but not yet proven by a check run on this machine).

---

## 1. Numbers, before and after

Every number below lives in `src/killstreak-tuning.ts` as a named constant next
to the value it replaced, so the RATIO the owner stated is what the gate pins -
not a derived decimal nobody can trace back to a request.

| Item | Field | Before | After | Ratio | Claim |
|---|---|---|---|---|---|
| Chopper | `CHOPPER_MISSILE_CAPACITY` | 6 | **12** | x2 | VERIFIED |
| Chopper | autopilot rocket budget | n/a (AI fired **none**) | **6 of the 12** | - | VERIFIED |
| Chopper | MG `damage` | 34 | **25.5** | x0.75 | VERIFIED |
| Chopper | MG `minimumDamage` | 22 | **16.5** | x0.75 | VERIFIED |
| Drone Swarm | gun `cadenceMs` | 300 | **240** | +25% rate | VERIFIED |
| Drone Swarm | `DRONE_SWARM_FIRE_LANE_INTERVAL_MS` | 460 | **368** | +25% rate | VERIFIED |
| Drone Swarm | `swarmIngressSpeedMps` | 22 | **25.3** | +15% | VERIFIED |
| Drone Swarm | `swarmPatrolSpeedMps` | 7 | **8.05** | +15% | VERIFIED |
| Drone Swarm | engagement approach speed | 8 (unnamed literal) | **9.2** | +15% | VERIFIED |
| Piloted Drone | gun `cadenceMs` | 300 | **240** | +25% rate | VERIFIED |
| Piloted Drone | `manualHorizontalSpeedMps` | 3 | **3.45** | +15% | VERIFIED |
| Piloted Drone | `manualVerticalSpeedMps` | 3 | **3.45** | +15% | VERIFIED |
| Piloted Drone | `autonomousStandaloneSpeedMps` | 6 | **6.9** | +15% (2x manual held) | VERIFIED |
| Piloted Drone | taser charges | - | **3 per drone** | new | VERIFIED |
| Piloted Drone | taser stun | - | **1000 ms**, 1500 ms cooldown, 22 m | new | VERIFIED |

Three things a reviewer should not have to discover for themselves:

* **The swarm fire lane had to move with the gun.** A 24-drone formation fires
  one barrel at a time through `DRONE_SWARM_FIRE_LANE_INTERVAL_MS`, so moving
  only the gun cadence would have produced no felt change at all.
* **The swarm's engagement approach speed was an unnamed literal `8`** inside
  `advanceDrone`. A "+15% movement" that missed it would have left the swarm
  closing on its target at the old speed - which is most of the movement an
  owner actually sees. It is now
  `DRONE_DEPLOYMENT_POLICY.swarmEngagementApproachSpeedMps`.
* `supportGunDamageAtDistance` still rounds each admitted shell to an integer,
  so a point-blank chopper shell reads **26**, not 25.5. The profile keeps the
  exact -25% value; the rounding is pre-existing shared behaviour, not new.

## 2. The Chopper autopilot actually fires its rockets - VERIFIED

The defect behind the owner's "ensure it is also using those rockets":
`pendingPlayerMissile` is only ever set by a possessing human, so before this
change an unpossessed Chopper carried its whole payload for thirty seconds and
landed with it. The autopilot now launches on its **own clock**
(`nextAiMissileAtMs`, deliberately separate from the pilot's `nextMissileAtMs`
so a human who takes the gun on frame one is not made to wait out the AI's 2 s
arm delay), at 2600 ms cadence, only against a hostile it can see inside 90 m,
aiming at the ground under that hostile so the blast radius does the work.

Measured in `src/chopper-autopilot-rockets.test.ts`: launches at
**3000, 5600, 8200, 10800, 13400, 16000 ms** - exactly 6, then it stops with 6
still on the rails. A human who then possesses fires the remaining 6; a human
who possesses immediately fires all 12. Zero launches with no visible hostile,
and none from outside the autopilot range.

## 3. How the taser works

**Solo and against bots (VERIFIED by unit tests).** The Piloted Drone carries 3
charges. Unpiloted, it auto-fires at the nearest hostile within 22 m with line
of sight, one charge per 1500 ms, until the charges are gone. Piloted, it never
auto-fires - the pilot's right-click does, aimed down the same cone the drone's
gun uses. Both paths go through one admission (`admitTaserShot`), so "3 charges
per drone" cannot silently become three per mode. A tasered **bot** is held in
place by `botTaserStunUntilHostTimeMs` in `updateBots`; its aim and fire logic
keep running, only its movement stops. The Drone Swarm carries **zero** charges:
the owner asked for the taser on the Piloted Drone, and 24 drones x 3 stuns is a
different feature nobody requested.

**Multiplayer (implemented; claim-states below).** The stun mirrors the
flashbang's network path deliberately, line for line:

| flashbang | taser |
|---|---|
| `FlashHostAuthority.resolveDetonation` | `TaserHostAuthority.resolveStun` |
| `FlashVictimResultConsumer.admit` | `TaserVictimResultConsumer.admit` |
| `flash-result` message | `taser-stun` message |
| `isHostAuthorityMessage` - guests may not mint one | same |
| host applies locally, or `network.sendToPlayer` | same |

The host authors every stun (replay-guarded per activation, sequenced per victim
life, duration clamped to 2000 ms); the victim client replays it through the
consumer, which refuses a wrong epoch, wrong target, stale life, duplicate,
out-of-order or already-expired result. A guest cannot stun anybody: `taser-stun`
is registered in `isHostAuthorityMessage`, so `network.ts` drops it on a guest
connection, and `handleTaserAuthorityMessage` keeps a second fail-closed fence on
role, host identity, recipient and match phase.

**What the victim sees.** `#taser-shock` - an electric-blue (`#5ad8ff`) edge
vignette with an 18 Hz arc crackle, screen centre left readable, plus a 26 Hz
camera jitter the flashbang never applies. The flashbang is `#ordnance-flash`: a
full-screen white flash, up to 2.8 s, with no camera effect and no movement
restriction. Reduced-sensory scales both; `prefers-reduced-motion` removes the
crackle layer entirely. Movement, sprint and jump are all refused for the full
second - zero input, not reduced input, so the stun cannot be walked out of.

## 4. Claim-states

| Claim | State | Evidence |
|---|---|---|
| Every tuned number is the owner's stated ratio | VERIFIED | `src/killstreak-tuning.test.ts` |
| Chopper payload is 12, autopilot capped at 6 | VERIFIED | `src/chopper-autopilot-rockets.test.ts` |
| Autopilot actually launches at a valid target | VERIFIED | same file; 6 launches measured |
| Human spends the remaining 6, or all 12 if first | VERIFIED | same file |
| MG damage is exactly 0.75x | VERIFIED | `src/killstreak-support-catalog.test.ts`, `src/killstreak-tuning.test.ts` |
| Swarm +25% rate / +15% speed | VERIFIED | `src/killstreak-tuning.test.ts`, `src/killstreak-drone-deployment.test.ts` |
| Piloted drone +25% rate / +15% speed | VERIFIED | same |
| Taser: 3 charges, refuses at 0, cooldown, no-target | VERIFIED | `src/taser-stun.test.ts` |
| Taser: stun blocks movement 1 s then releases | VERIFIED | `src/taser-stun.test.ts` |
| Taser: auto-fire only unpiloted, in range, with LOS | VERIFIED | `src/taser-stun.test.ts`, `src/killstreak-taser-runtime.test.ts` |
| Taser: right-click when piloted, never queued in cooldown | VERIFIED | `src/killstreak-taser-runtime.test.ts` |
| Taser: bots produce a stun event and are held | VERIFIED (runtime + host wiring) | `src/killstreak-taser-runtime.test.ts` |
| Taser MP: host authors, guest cannot mint, victim admits once | VERIFIED (protocol level) | `src/taser-stun.test.ts` |
| Taser MP: end-to-end host to guest stun in a live two-peer match | **OPEN** | needs the MP lab; no run performed |
| A tasered bot visibly stops in a running match | **OPEN** | unit-level only; needs a browser run |
| The screen effect reads as "tasered", not flashbanged | **OPEN** | needs headed owner HITL |
| `npm run build` plus a headless solo match | **OPEN** | see below |

**Why the browser checks are OPEN, stated honestly.** The standing rule on this
machine is: headless browser only when the ComfyUI queue is empty AND
`nvidia-smi` reports at least 3000 MiB free AND no other headless Chrome is
running. At the end of this pass the queue was empty but the GPU had **1019 MiB
free of 16303 MiB** - the owner is using the card. No browser was launched, no
build was produced, and no claim in this report depends on one. This is a
genuine not-yet-verified, not a quiet pass.

### Exact remaining steps to close the MP row

1. Start the MP lab (`local-claude-task-mp-lab.md`) with a host and one guest on
   the same arena.
2. As the host, earn and activate the Piloted Drone, then either leave it
   unpiloted near the guest or enter it and right-click the guest inside 22 m.
3. On the HOST, read `__ATOMIC_ACRES_DEBUG__.taserTelemetry()`: expect
   `host.resolvedActivations` to increase by one per shot, and `stunsApplied`
   to match.
4. On the GUEST, read the same hook: expect `victim.accepted` to increase by one
   and `localStunRemainingMs` to be non-zero for ~1 s, with `#taser-shock` not
   hidden and the player unable to move.
5. Forge check: from the guest, send a `taser-stun` message naming the guest as
   `by`. `isHostAuthorityMessage` must cause `network.ts` to drop it, and
   `victim.rejected` must not move.

## 5. What the owner should try in the HITL

1. **Chopper, hands off.** Call it in and do NOT enter it. It should now launch
   rockets on its own at visible enemies - roughly one every 2.6 s - and stop
   after six with six still on the rails. The HUD reads x12 / 12 counting down.
2. **Chopper, take it over late.** Let the autopilot spend a few, then press F.
   Whatever it did not spend is yours; right-click fires them at 1 s cadence.
3. **Chopper machine gun.** It should now take about four shells to drop a
   full-health hostile where it used to take three.
4. **Drone Swarm.** It should reach you noticeably sooner and the shots should
   come about a quarter faster.
5. **Piloted Drone, hands off.** Leave it unpiloted near an enemy: it should
   taser them automatically, up to three times, and they should stop moving for
   a second each time.
6. **Piloted Drone, piloted.** Enter it, put an enemy in the crosshair inside
   ~22 m and press right mouse. The HUD taser counter drops 3 -> 2 -> 1 -> 0 and
   the victim is held for a second. Right-click no longer enters ADS in the drone.
7. **Be the victim.** You should see a blue electric vignette with a buzzing
   camera and be unable to move, sprint or jump for one second. It must be
   obviously different from a flashbang's white blind. If it still reads as a
   flashbang, say so - the presentation is one CSS block plus one constant
   (`TASER_PRESENTATION`) and is cheap to push further.

## 6. Files

New: `src/killstreak-tuning.ts`, `src/taser-stun.ts`, `src/taser-protocol.ts`,
`src/killstreak-tuning.test.ts`, `src/taser-stun.test.ts`,
`src/chopper-autopilot-rockets.test.ts`, `src/killstreak-taser-runtime.test.ts`.

Changed: `src/killstreak-support-catalog.ts`, `src/killstreak-runtime.ts`,
`src/killstreak-protocol.ts`, `src/protocol.ts`, `src/legacy-main.ts`,
`src/ui/pass64-shell.ts`, `src/style.css`, the pinned-number updates in
`src/killstreak-support-catalog.test.ts`, `src/chopper-gunner-missile.test.ts`,
`src/chopper-gunner-fire-ray.test.ts`, `src/killstreak-protocol.test.ts`,
`src/killstreak-runtime.test.ts`, `src/killstreak-presentation.test.ts`,
`src/killstreak-drone-deployment.test.ts`, and the ceiling entry in
`src/legacy-main-size-ratchet.test.ts`.

**No test was weakened.** Nine existing assertions failed because the number they
pinned is precisely the number the owner asked to change. Each was re-expressed
against the ratio or the shared damage oracle rather than a new frozen decimal,
which makes them stricter rather than looser - for example the chopper wallbang
test now asserts half of the ADMITTED shell (what the runtime actually halves)
instead of half of a raw profile field that only agreed by accident while that
field happened to be an integer.

`src/legacy-main.ts` grew 37,100 -> 37,335 lines; the ratchet ceiling was raised
with a `CEILING_HISTORY` entry naming what needed the lines. Every taser
DECISION (charges, cooldown, targeting, movement rules, wire format, tuned
numbers) lives outside that file in the three new modules.

## 7. Gates

```
npx tsc --noEmit
# clean, no output

npx vitest run 2>&1 | tail -6
 Test Files  582 passed | 1 skipped (583)
      Tests  5689 passed | 2 skipped (5691)
```

Targeted runs, all green: `src/killstreak-tuning.test.ts`,
`src/taser-stun.test.ts`, `src/killstreak-taser-runtime.test.ts`,
`src/chopper-autopilot-rockets.test.ts`, `src/killstreak-support-catalog.test.ts`,
`src/chopper-gunner-missile.test.ts`, `src/chopper-gunner-fire-ray.test.ts`,
`src/killstreak-blockers.test.ts`, `src/killstreak-protocol.test.ts`,
`src/killstreak-runtime.test.ts`, `src/killstreak-drone-deployment.test.ts`,
`src/killstreak-activation-gate.test.ts`, `src/legacy-main-size-ratchet.test.ts`.
