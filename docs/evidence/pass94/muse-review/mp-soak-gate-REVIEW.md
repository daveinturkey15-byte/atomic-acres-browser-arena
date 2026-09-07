# Muse review — mp soak gate (HF-499)

Scope: `git log --oneline origin/contrib/dave-gaming-pc/claude/mp-audit-hf504..HEAD`
(15 commits: HF-498 bug lane + merge + 5 soak-gate commits), full diff over
`scripts/qa`, `src`, `package.json`, plus
`docs/evidence/pass95/mp-soak-gate/REPORT.md` and
`artifacts/qa/mp-soak-gate/hf499-table.md` / `hf499-bundle.json`
(first real run: exit 124 at the 235 s hard timeout, 108.9 s of play,
103 samples / 178 divergences, rejoin/damage, stair-fire and scoreboard FAIL).
No builds, no browsers run for this review. All claims below were checked
against the tree at `e64b0817`, not against prose.

Claim-states: `[VERIFIED]` = read in the diff/tree/bundle;
`[INFERENCE]` = derived; `[OPEN]` = could not verify headlessly.

## Threshold provenance (question 1)

| Threshold | Value | Source | Derived or magic? |
|---|---|---|---|
| `playDurationMs` 180 000 | `scripts/qa/mp-soak-assertions.mjs:6` | Release policy: `AGENTS.md:92-96` ("three-minute … soak") | Policy, not a game contract. Legitimate for a gate, but must be labeled as such. |
| `sampleIntervalMs` 1 000 | `mp-soak-assertions.mjs:7` | Sampling choice; mirrors the audit driver's `sleep(1_000)` (`mp-audit.mjs:606`) | Not the snapshot tick — snapshots stream continuously (`snapshotAgeMs` 31–57 ms in the real bundle). 1 s sampling is fine, but nothing in `src/` says "replication is defined at 1 Hz". |
| `positionBoundM` 1.5 | `mp-soak-assertions.mjs:8` | Audit-driver comment only: "1.5 m is roughly a player's own width: beyond it, two peers are shooting at different places" (`mp-audit.mjs:597-599`) | Gameplay-relevance heuristic, not a physics/network constant. No derivation from max speed × staleness exists anywhere. |
| `rttMs` 120 (one-way 60) | `mp-soak-assertions.mjs:9`, `mp-soak-gate.mjs:40,74` | The gate's own injected impairment (`qaRttMs`) | Self-referential: the damage bound is "one injected RTT". There is no game SLA that says damage must replicate in 1×RTT. |
| `packetLossPct` 1, seed `hf499-mp-soak-20260904` | `mp-soak-gate.mjs:42,73-75` | Chosen constants, no source | Magic, acceptable if documented as stress level — it is not documented as such. |
| `HARD_TIMEOUT_MS` 235 000 | `mp-soak-gate.mjs:39` | Magic: 180 s play + 55 s slack | No derivation; see P0-2. |
| `ACK_BUDGET_MS` 1 500 | `mp-audit.mjs:84` (imported by the gate for the stair-fire sleep) | 1 500 ms + legacy event-delay terms — notably does **not** include the 120 ms QA RTT | Stale budget shared across two impairment regimes. |

## Findings (file:line, why, smallest fix)

### P0-1. The replication row can never pass: fencepost off-by-one between runner and assertion `[VERIFIED]`

- `scripts/qa/mp-soak-gate.mjs:176-186` (`sampleReplication`): iteration for
  `second` sleeps until `playStart + (second+1)*1000`, then
  `if (Date.now() - playStart >= PLAY_DURATION_MS) break;` **before** pushing.
  The iteration targeting exactly `playStart+180000` always trips the break
  (timers fire at or after their due), so the loop pushes seconds 0–178:
  **179 samples maximum, deterministically**.
- `scripts/qa/mp-soak-assertions.mjs:51,74`: `expectedSamples =
  floor(180000/1000) = 180`, row requires `samples.length >= expectedSamples`.
  179 < 180 → FAIL on a perfect run.
- Proof the fixtures encode the unmeetable expectation:
  `scripts/qa/fixtures/mp-soak/valid-bundle.json` contains exactly **180**
  samples (verified with node), i.e. the pass-fixture is a shape the runner
  cannot produce. The real run's 103 samples never got near this, so the bug
  is masked until the first full-duration run — which will then fail on count
  alone.
- Smallest fix: make the runner iterate a fixed count —
  `for (let second = 0; second < PLAY_DURATION_MS / sampleIntervalMs; second++)`
  with the deadline break removed (or sample second 0 immediately at
  `playStart`, then 179 more). Add a unit test that replays the loop bound
  arithmetically (179 vs 180) — or better, a contract test asserting the
  runner's sample-capacity constant equals `expectedSamples`.

### P0-2. The 235 s hard timeout conflates slow setup with a broken game `[VERIFIED]`

- `mp-soak-gate.mjs:39,354`: one 235 s timer armed before browser launch covers
  serve + 3 Chrome launches + WebGPU shader compile + the lobby flow (whose
  sequential `waitForFunction` timeouts sum to >500 s worst case:
  `mp-soak-gate.mjs:370-384`) **plus** the 180 s play clock.
- First run: `timing.playDurationMs = 108868` with `completed: false`
  (`hf499-bundle.json:8-9,24-28`). 235 − 108.9 ≈ **126 s of setup** against
  55 s of slack. A cold machine fails the gate with healthy game logic.
- `package.json:82`: `qa:mp-soak` = contract + full `build` + gate; the build
  is outside the 235 s but shader compile inside it is not — the most
  variable cost sits inside the tightest budget.
- Smallest fix: arm the hard timer at `playStart` (`mp-soak-gate.mjs:386-387`),
  e.g. `playStart + 200_000`, with a separate setup watchdog (e.g. 300 s) that
  records `failure: "setup timeout"` distinctly from `"hard browser-run
  timeout"`, and record `setupMs` in `bundle.timing` so "slow" (large setupMs,
  healthy play) and "broken" (small setupMs, failing rows) are separable in
  the bundle. Document the slack arithmetic next to `HARD_TIMEOUT_MS`.

### P0-3. `runGuestScenarios` destroys the stair-fire and reload diagnostics it just recorded `[VERIFIED]`

- `mp-soak-gate.mjs:234-237`:
  `runScenario(role,'reloadAfterDeath',…)` stores the full summarized result at
  `scenarios.guests[role].reloadAfterDeath`, then the next line **overwrites**
  it with a bare boolean (`= reloadAfterDeath?.ok === true`). Identical
  overwrite for `stairFire`.
- Real bundle consequence (`hf499-bundle.json`): `guestA.stairFire: false`,
  `guestB.stairFire: false`, with no `staged/fired/reason`,
  `muzzleInsideSurface`, or ammo delta — the FAIL that most needs diagnosis
  (it coincides with the freshly landed fail-closed muzzle work, see below)
  is unactionable. Same for any future reload-after-death FAIL.
- Smallest fix: keep both — e.g.
  `guests[role].reloadAfterDeathOk = reloadAfterDeath?.ok === true` (and
  `stairFireOk`), leaving the `runScenario`-stored detail object intact; update
  `mp-soak-assertions.mjs:100,112` to read the `Ok` keys (or accept either
  shape). One-line-each, no runner restructuring.

### P1-1. Damage-after-rejoin window (120 ms) is unmeetable under the gate's own impairment `[VERIFIED]`

- `mp-soak-gate.mjs:240-265`: poll loop exits after `DAMAGE_RTT_MS` (120 ms);
  each pass calls `peerViews()` = 3 sequential cross-process `viewOf`
  evaluates. Under 60 ms one-way delay + 1% loss, the authoritative damage
  cannot reach all three views inside one RTT plus sampler round-trips.
- Real bundle: `damage.triggered: true, credited: true`, yet
  `byPeer: {host: null, guestA: null, guestB: 100}`,
  `firstSeenMs` all null, `maxLatencyMs: null` → FAIL. The game applied the
  damage; the stopwatch disallowed observing it.
- `mp-audit.mjs:84`: `ACK_BUDGET_MS` ignores the QA RTT entirely, so the one
  sleep that does exist (`scenarioStairFire`) is also budgeted for the wrong
  regime.
- Smallest fix: poll for `max(3*rttMs, rttMs + ACK_BUDGET_MS)` (still
  RTT-derived, now honest about sampler + ack costs), keep asserting
  `maxLatencyMs <= <that bound>`, and record per-peer `firstSeenMs` (already
  done) plus sampler skew. Update the row requirement string accordingly.

### P1-2. Full-mesh replication comparison confounds sampling skew with desync `[VERIFIED + INFERENCE]`

- `mp-soak-gate.mjs:137-141,148-174`: `peerViews()` samples the three peers
  **sequentially** (three `viewOf` round-trips, each tens of ms under load),
  then `addReplicationDivergences` compares every directed pair — including
  guestA-view vs guestB-view of the same player, two stale snapshots taken at
  different instants. A moving player legitimately differs across the skew +
  60 ms impairment delay + `snapshotAgeMs` 30–60 ms.
- 178 divergences over 103 samples is consistent with systematic skew rather
  than 178 genuine desyncs, but the bundle cannot distinguish them: no
  per-view timestamps or ages are recorded alongside the divergence.
- Smallest fix (pick one, smallest first): (a) record `atEpochMs` per peer
  view and `snapshotAgeMs` per player in each divergence; or (b) star-compare
  host-authoritative → each guest instead of full mesh; or (c) make the bound
  age-adjusted: `1.5 m + maxSpeed * (skew + age)` with maxSpeed cited from
  `src/`. `[OPEN]`: max player speed was not located headlessly, so the exact
  adjustment is left to the fixer.

### P1-3. Scoreboard agreement is forced false while inner `score.score` is null `[VERIFIED]`

- `mp-soak-gate.mjs:267-273`: `canonical` maps each player to
  `player.score` = `{kills, deaths, score}` and then requires
  `!encoded.some((value) => value.includes('null'))`.
- Every sample in the real bundle carries `"score": {"kills":0,"deaths":0,
  "score":null}` — `JSON.stringify` of that **contains the substring
  `"score":null`**, so any end-state where the inner `score` field is still
  null fails even under perfect agreement. (On the timed-out run this row
  fails earlier via `peersPresent: []` since `hardStop` never calls
  `scoreboardAtEnd` — correct fail-closed behavior — but the first
  *completed* run will trip the substring check.)
- Smallest fix: compare explicit fields —
  `canonical` → `[id, kills, deaths]` — and drop the substring test, or assert
  per-entry `player.score != null` structurally instead of `includes('null')`.

### P1-4. `MP-SOAK-CONSOLE-CLEAN` passes vacuously on a missing `consoleErrors` key `[VERIFIED]`

- `mp-soak-assertions.mjs:33-36`: `allConsoleErrors` maps a missing/non-array
  peer entry to `[]`. A bundle with `consoleErrors` absent entirely yields 0
  errors → PASS. Every other row fails closed on missing data (`=== true`,
  `>= expectedSamples`, `!== null`); this one does not.
- The runner always writes the key today (`mp-soak-gate.mjs:88,392-395`),
  so this is latent, not live — but the assertion module's contract claims to
  be runner-independent ("browser-free", `mp-soak-assertions.mjs:1-3`).
- Smallest fix: require presence —
  `PEERS.every((p) => Array.isArray(object(bundle.consoleErrors)[p])) &&`
  before the length check. Add a missing-keys fail-closed fixture (see P1-5).

### P1-5. The gate's own contract test covers pass + fail but not the shapes that actually occur `[VERIFIED]`

- `scripts/qa/mp-soak-assertions.test.mjs:10-31`: valid → all PASS,
  invalid → 7 named FAILs, plus a 1.5001 boundary test. Good.
- Gaps: (a) `invalid-bundle.json:3-5` has `completed: true` + full duration,
  so **DURATION-fail is never tested** — the exact shape of the real run
  (`completed: false`, 108868 ms) has no fixture; (b) no missing-keys fixture
  (P1-4); (c) no 179-sample fixture, which would have caught P0-1 from the
  assertion side.
- Smallest fix: add `short-bundle.json` (`completed: false`, 103 samples,
  `scoreboard: {agreement: false}`) asserting DURATION + REPLICATION +
  SCOREBOARD fail and nothing passes vacuously, plus a missing-`consoleErrors`
  case. Note also `REPORT.md:45-46` says "valid, invalid, and over-bound
  divergence fixtures" — the over-bound case is an in-memory mutation
  (`test.mjs:33-38`), not a fixture file; one-word doc fix.

### P2-1. Impairment lives in the production send funnel — correctly fenced, but "NOT present" overstates it `[VERIFIED]`

- `src/network.ts` (`qaNetworkImpairment`, `transmit`): deterministic seeded
  loss (`qaLossSample`, FNV over seed+sequence) + fixed 60 ms one-way delay
  (jitter forced 0 in RTT mode). Parameters are symmetric — all three peers
  get identical `qaRttMs/qaLossPct/qaSeed` (`mp-soak-gate.mjs:357-364`) — but
  drop *sets* differ per peer because the sequence counter is per-peer send
  order (timing-dependent). Deterministic in distribution, not bit-identical
  across runs; fine for a soak, wrong to call exact-replay.
- Fence is real: `multiplayerQa === '1'` **and** localhost/127.0.0.1 hostname,
  query-params only (`network.ts:241-250`); `transmit` is the single funnel so
  state traffic is now impaired too (previously state bypassed delay) —
  intended, but it widens the blast radius onto the replication row (P1-2).
  Counters (`impairedSends/impairedDrops`) and trace fields are QA-only.
- Smallest fix: none to code; correct the record — impairment is
  *fenced production code*, not *absent production code* — and document the
  stress level (120/1%) as a chosen operating point with a one-line rationale
  (e.g. "pessimal EU-US RTT at light loss").

### P2-2. Stair-fire FAIL arrives on top of the new fail-closed muzzle admission — currently indistinguishable `[INFERENCE, needs the diagnostics from P0-3]`

- This lane just landed "fail closed on missing muzzle" (`25cb5af5`) and
  muzzle-inside-surface probing (`viewmodelMuzzleInsideSurfaceClip`,
  `HF-498` test). `scenarioStairFire` stages via
  `debug.stageHouseRamp('interior')`, sets ammo 30/90, `fireOnce()`, and
  compares ammo (`mp-soak-gate.mjs:188-207`). If staging is unavailable it
  returns `{staged: false}` — currently discarded by P0-3's overwrite.
- Either the stairs genuinely block fire (game bug) or the stricter muzzle
  admission now rejects the staged pose (gate/harness interaction) — the
  bundle as written cannot tell.
- Smallest fix: P0-3 first; additionally record `muzzleInsideSurface`,
  `surfaceClipPlaneCount`, and `admission` (already sampled by
  `sampleFireAdmissionDiagnostics` in `legacy-main.ts`) into the stair result.

## Question-by-question answers

1. **Thresholds**: 180 s = release policy (legitimate, label it); 1 s =
   sampling convention shared with the audit driver (not a snapshot contract);
   1.5 m = hit-relevance heuristic from an audit comment (not derived from
   speed × staleness — P1-2 shows why that matters); 120 ms = the gate's own
   injected RTT (self-referential — P1-1); 235 s, 1%, seed = magic numbers
   with no derivation (P0-2, P2-1).
2. **Vacuous pass**: the bundle→verdict path (`evaluateMpSoakBundle`,
   `mp-soak-assertions.mjs:43-139`) is fail-closed for 7 of 8 rows; the
   exception is CONSOLE-CLEAN on missing keys (P1-4). The timeout path
   (`hardStop`, `mp-soak-gate.mjs:332-344`) correctly fails closed
   (`completed: false`, 103 < 180 samples, empty scoreboard). The graver
   count-side bug is the reverse: P0-1 fails *non*-vacuously on a perfect run.
3. **Seeded impairment**: deterministic algorithm, symmetric parameters,
   correctly fenced to localhost QA — but it is fenced *production* code, not
   absent code; drops are per-peer-order-dependent, not bit-replayable; and it
   now covers state traffic (P2-1).
4. **Hard timeout**: yes, it turns slow cold start into false failure — 126 s
   setup vs 55 s slack on the first run (P0-2). Split setup vs play budgets
   and record `setupMs`.
5. **Loosened tests / contract-test coverage**: `[VERIFIED]` no existing test
   was loosened — `18→19` protocol bumps (`protocol.ts:89`,
   `network-lifecycle.test.ts:668`, both weapon-catalog tests) are tightenings
   accompanying required `requestId` guards (`protocol.ts:1200,1211`) with new
   negative cases (`protocol.test.ts:468-469`); reload-authority test edits
   only thread the new required fields. But the gate's own test misses the
   three shapes that matter most: timeout/short-duration, missing keys, and
   179 samples (P1-5).

## Verdict: DO-NOT-SHIP (as a required publish gate)

Three reasons:

1. **A perfect run cannot pass.** The runner produces at most 179 replication
   samples against an assertion demanding 180 (P0-1). Shipping this as
   REQUIRED blocks every future publish behind an unsatisfiable row — worse
   than no gate.
2. **The first red rows are not yet diagnosable or fair.** Stair-fire and
   reload evidence is overwritten with bare booleans (P0-3), the damage window
   disallows its own impairment delay (P1-1), and the replication comparison
   cannot separate sampler skew from desync (P1-2). A gate that fails without
   saying why, or fails correct behavior, teaches the team to distrust it.
3. **Slow will keep reading as broken.** With 126 s of measured setup inside a
   55 s slack budget (P0-2), cold machines and post-shader-change runs will
   fail the gate on timing before any game assertion is evaluated.

Ship condition: fix P0-1, P0-2, P0-3 (+ P1-1 window and P1-3 substring, which
are one-liners in the same functions), add the P1-5 fixtures, rerun to green
or to failures that carry their diagnostics — then re-review the rerun bundle
only. The HF-498 game-logic fixes in this lane are unaffected by this verdict
and should proceed on their own evidence.
