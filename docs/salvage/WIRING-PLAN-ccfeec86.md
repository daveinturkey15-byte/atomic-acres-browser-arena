# Wiring plan — the ccfeec86 salvage (HF-536 S1)

Owner order, 2026-09-06: *"sort it, salvage what is important."*

Commit `ccfeec86` (2026-08-23 22:45, message `test(HF-378): pin enemy-radar
gunfire reveal wiring`) deleted 22 source/test files and 6,259 lines. The message
describes a 52-line test it also added; it says nothing about the deletion. Five
of those modules are now restored on this branch, one commit each. **None of them
is wired.** `src/legacy-main.ts` is untouched by this lane — it is 37,396 lines
under a ratchet ceiling and one writer at a time, and wiring is the owner's call,
not a salvage worker's.

This file is that call, laid out so it can be made without re-deriving anything.
Every `file:line` below was read at `bc649bb5` (the HITL candidate this branch is
cut from) on 2026-09-06.

Claim states are marked: **VERIFIED** (read in the tree), **MEASURED** (a command
produced it), **INFERENCE** (reasoning, not checked).

---

## 1. `src/arena-deployment-briefing.ts` + `src/ui/deployment-briefing-surface.ts`

**Owner goal.** HF-372: *"need a decent loading screen for farcrysis and
hijacked."* The deployment surface is the longest uninterrupted look a player
gets at a map before being dropped into it.

**Hook point.** `src/legacy-main.ts:16932-16933` (VERIFIED):

```ts
deploymentTransitionTitle.textContent = selectedArena.displayName.toUpperCase();
deploymentTransitionStatus.textContent = `Preparing ${selectedArena.displayName} authoritative arena state…`;
```

Replace both lines with one `applyDeploymentBriefing(...)` call. All three target
elements already exist — `#deployment-transition-kicker` at
`src/ui/pass64-shell.ts:492`, and title/status resolved at
`src/legacy-main.ts:1560-1561`. (VERIFIED)

**What it changes for the player.** Every arena's loading screen stops saying the
same sentence. Nuke Town Rebuild reads *"HELO INBOUND · STREET RUN, BACK YARD TO
BACK YARD — Two two-storey houses face each other over 58 m of open road, and the
bus in the middle is the only thing between them."* instead of *"Preparing Nuke
Town Rebuild authoritative arena state…"*.

**Risk: LOW.** Three `textContent` writes into elements that already exist. No new
DOM, no new CSS selector, no stylesheet change, no gameplay path. The one live
risk is the status element's other writer at `src/legacy-main.ts:7261`
(`deploymentTransitionStatus.textContent = text`) — the loader's own progress
line. The briefing must be written once when the arena is chosen and must not
fight the progress row per frame. (INFERENCE: the two writers look to be on
different cadences; a wiring lane must confirm ordering by booting the app.)

**Cost.** ~10 lines in `legacy-main.ts` plus one import. One serialized
`legacy-main.ts` slot.

> **OWNER DECISION** — Wire the per-arena loading copy into the deployment
> console at `legacy-main.ts:16932`?   [ ] YES   [ ] NO   [ ] LATER

---

## 2. `src/ui/carpet-corridor-map-overlay.ts`

**Owner goal.** HF-369, verbatim: *"should be clearer that the 2nd click of the
carpet bomb is for its direction, animated on the map maybe when selecting the
drop and direction pins."*

**Hook points.** Two, both live and both still showing the defect:

- `src/legacy-main.ts:26053-26054` — the instruction line is the literal string
  `'SELECT RUN START AND END'` for **both** clicks. Replace with
  `carpetCorridorPrompt(state).instruction`, which is derived from
  `carpetCorridorStage` and therefore cannot name the wrong click. (VERIFIED)
- `src/legacy-main.ts:26009-26015` — the tactical-map corridor draw. It currently
  draws only from `carpetCorridorTargeting.points`. Replace the block with
  `carpetCorridorOverlayPlan(...)` plus `drawCarpetCorridorOverlay(...)`, passing
  `worldToTacticalMap` (already in scope, and the same shape as the module's
  `CarpetCorridorProjection`). (VERIFIED)

**What it changes for the player.** After the first click the map shows a labelled
DROP pin with a sweeping compass dial instead of a lone dot indistinguishable
from the Care Package marker; the prompt says which click you are on; and the
drawn corridor is the run the host will actually fly — clamped to
`[CARPET_BOMBER_MIN_RUN_LENGTH_M, MAX]` and re-centred on the pick's midpoint —
rather than the raw drag, which today can be drawn at roughly twice the length
that actually gets bombed.

**Risk: LOW-MEDIUM.** Pure presentation, no state, and motion is a pure function
of `nowMs` so `reducedMotion` freezes it at phase zero. The medium half: it
changes what the player sees during a killstreak they paid for, so it wants a
tactical-map screenshot in both graphics profiles before it ships, and the
corridor re-clamp will make the preview visibly *disagree* with today's preview —
that is the fix, and it will still read as a change.

**Cost.** ~25 lines in `legacy-main.ts` replacing ~30. One serialized slot. The
module and its 22 tests are already green with no adaptation.

> **OWNER DECISION** — Wire the animated two-stage carpet-corridor overlay and
> retire `'SELECT RUN START AND END'`?   [ ] YES   [ ] NO   [ ] LATER

---

## 3. `src/coplanar-surface-audit.ts` — restored as a tool, already found a regression

**Owner goal.** HF-346 and the standing *"z fighting"* complaint. Cross-arena
depth-precision audit: which horizontal surfaces sit close enough together, at
this arena's max view distance and 24 depth bits, to tear.

**Hook point.** Not `legacy-main.ts` — this is QA. Two options, in cost order:

1. Its restored `src/coplanar-surface-audit.test.ts` already runs under
   `npm test` (20 passing, 1 skipped). Zero wiring: it is a gate the moment this
   branch merges.
2. Optionally add a CLI wrapper beside `scripts/qa/find-coplanar-pairs.ts` so the
   sweep can be run per-arena on demand. `scripts/qa/find-coplanar-pairs.ts:50`
   already imports the *Nuke-Town-only* core from
   `src/nuketown2-coplanar-audit.ts`; this module is the all-arena engine that
   core does not replace.

**MEASURED FINDING, unresolved.** Run today, the per-arena ceiling case fails:

```
atomic-acres coplanar surfaces regressed above the recorded 8:
expected 22 to be less than or equal to 8
  central bus deck lip north east <> central bus deck east    separation=0.00000m
  central bus end roofline east   <> central bus deck east    separation=0.00000m
  central bus hull north a        <> central bus end cap west separation=0.00000m
```

Every listed separation is **exactly** 0.00000 m, and every listed pair is on the
central transit bus. `rustworks-1v1`, `gun-range` and `high-seas` are still inside
their recorded ceilings. The ceiling of `8` was left exactly as authored and the
case is `it.skip`ped with the failure quoted above it — raising the number is the
weakening the test's own comment forbids.

**Risk of restoring: NONE** (leaf QA module, no runtime consumer).
**Risk of ignoring the finding: the owner keeps reporting z-fighting.**

**Cost.** Zero to keep. The bus fix belongs to the Atomic Acres lane.

> **OWNER DECISION A** — Keep the all-arena coplanar audit as a permanent gate?
> [ ] YES   [ ] NO
>
> **OWNER DECISION B** — Open an Atomic Acres lane row for the 22 zero-separation
> bus pairs, and un-skip the case when it lands?   [ ] YES   [ ] NO   [ ] LATER

---

## 4. `src/atomic-support-authority.ts` — restored as a tool, already found a second finding

**Owner goal.** The mechanical form of the AGENTS.md rule *"every substantial
player-reachable visible object must have matching movement and shot authority in
both profiles… never add profile-only collision"*. Set equality between what you
can see you can stand on, what stops you, and what stops a bullet — once for the
procedural Performance presentation and again for the shipped Quality GLB.

The reconciliation analysis singled this file out by name: *"src/atomic-support-authority.{ts,test.ts}
is not in the conflict set at all (it is a clean add on main's side) and must be
handled deliberately in the separate S1 salvage lane, not silently dropped."*

**Hook point.** QA again, not `legacy-main.ts`. Its restored test runs under
`npm test` (5 passing, 1 skipped) with no wiring at all.

**MEASURED FINDING, unresolved.** The Quality-GLB case fails on HEAD:

```
physical-cover:central-transit-bus:quality-without-movement-authority
physical-cover:central-transit-bus:quality-without-projectile-authority
```

The Performance case in the same file still passes and still finds the bus with
full movement and projectile authority — so what is reported is a
**Quality-profile-only** gap, which is precisely the class AGENTS.md names as a
release blocker. `pass: true` / `issues: []` were left exactly as authored; the
case is `it.skip`ped with the failure quoted above it.

**INFERENCE, NOT VERIFIED.** Whether this is a genuinely walk-through /
shoot-through bus in Quality, or an audit expectation gone stale against the v4/v5
bus rebuild at `src/map.ts:750-773`. This lane did not boot the game and does not
claim either. Note only that the *same object* is the subject of finding 3.

**Cost.** Zero to keep. Confirming it is one Quality-profile boot on Atomic Acres:
walk into the bus, shoot the bus.

> **OWNER DECISION** — Open an Atomic Acres lane row to confirm-or-clear the
> Quality-profile bus authority gap?   [ ] YES   [ ] NO   [ ] LATER

---

## Not restored, and why

| Deleted module | Superseded by (file:line at `bc649bb5`) |
| --- | --- |
| `src/arena-grade-identity.ts` | `src/rendering/art-direction.ts:11` names it outright: *"authored per-arena values but has ZERO production consumers — a catalog nothing imports is a look nothing ships"*, and that module *"is the opinionated replacement AND it is routed"*. |
| `src/invisible-blocker-audit.ts` | `src/collider-visual-parity-gate.test.ts:19` — *"Direction A is a HARD zero-findings gate: every authoritative movement collider in all six arenas must be explained by a visible mesh"*, over `scripts/qa/collider-visual-parity-core.ts`, with a CLI at `scripts/qa/audit-collider-visual-parity.ts:2`. Same question the deleted module asked, and unlike it, actually run. |
| `src/feel/impact-response.ts` | `src/ui/hud-impact-response.ts:146` (`HUD_IMPACT_PRESETS`), wired at `src/legacy-main.ts:102`. Per-event impulse, kind presets, chromatic split, screen-relative bearing. |
| `src/feel/health-state.ts` | `src/sensory-feedback.ts:110-158` (`LowHealthFeedbackState`, 30/38 hysteresis, `heartbeatGain`/`breathingGain`), wired at `src/legacy-main.ts:14993`. The deleted module's own header says it copied `LOW_HEALTH_ENTER_HP`/`EXIT_HP` from that file. |
| `src/feel/index.ts` | Re-exports the two above; both halves are superseded *and wired*, and it never was. Restoring it would create the *"two implementations that can drift"* hazard `src/nuketown2-coplanar-audit.ts:2-5` was written to close. |
| `src/shadow-refresh.ts` | `src/legacy-main.ts:2184` `requestStaticShadowRefresh()` — event-driven, called from ten sites. The deleted module's 100 ms polling admission had no caller at `ccfeec86^` and has none at HEAD. |

**One residual is genuinely lost and is NOT covered by any row above:** the
`feel/index.ts` cross-channel `overlayLoad` cap — three visual channels at 60%
each is a white-out even though no single one broke its own ceiling.
`hud-impact-response.ts` caps per channel only. `src/particles/combat-readability.ts:51`
still cites `src/feel/index.ts` by path for exactly this idea, fourteen days after
the file was deleted: a live comment pointing at nothing.

> **OWNER DECISION** — Re-implement the cross-channel overlay-load cap on top of
> the wired `hud-impact-response`, accept per-channel caps only, or just correct
> the dangling citation at `combat-readability.ts:51`?
> [ ] RE-IMPLEMENT   [ ] ACCEPT   [ ] JUST FIX THE COMMENT
