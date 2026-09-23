# PASS 95 multiplayer soak gate — HF-499

Run date: 2026-09-04  
Branch: `contrib/dave-gaming-pc/claude/mp-soak-gate`  
Command: `$env:PASS73_NATIVE_WEBGPU='1'; npm run qa:mp-soak`  
Browser topology: one host plus two guests through the real lobby  
QA ports: 4227 (application) and 4228 (PeerJS)  
Impairment: seeded 120 ms RTT, 1% loss (`hf499-mp-soak-20260904`)

## Outcome

`FAIL` — exit 124 from the hard browser-run timeout after 235,000 ms. The run
did not reach the required three-minute duration. This is a gate finding, not a
threshold adjustment.

The runner wrote the machine-readable bundle and table before cleanup:

- `artifacts/qa/mp-soak-gate/hf499-bundle.json`
- `artifacts/qa/mp-soak-gate/hf499-table.md`

The bundle records `completed: false` and
`failure: "hard browser-run timeout after 235000 ms"`. No listener remained on
ports 4227 or 4228 after the run. No other worktree or the running integration
job was touched.

## Triage rerun

The one hard-timed rerun used the existing real install and `dist` without
installing, rebuilding, or touching the integration job:

`$env:PASS73_NATIVE_WEBGPU='1'; node scripts/qa/mp-soak-gate.mjs --label hf499-triage --out artifacts/qa/mp-soak-gate`

It used headless installed Chrome with the dedicated QA ports 4230 (application)
and 4231 (PeerJS); 4232 remained unused. The play stopwatch started after all
three peers reported active arenas and two remotes. Evidence:

- `artifacts/qa/mp-soak-gate/hf499-triage-bundle.json`
- `artifacts/qa/mp-soak-gate/hf499-triage-table.md`

| ID | Requirement | Result | Evidence |
| --- | --- | --- | --- |
| MP-SOAK-DURATION | scripted play lasts at least three minutes | PASS | `completed=true`, 182448 ms / 180000 ms |
| MP-SOAK-REPLICATION | all directed peer pairs replicate every one-second sample within 1.5 m | FAIL | 179 samples, 592 divergences, no missing directions |
| MP-SOAK-REJOIN-DAMAGE | guest B leaves/rejoins and damage is observed by everyone within one 120 ms RTT | FAIL | leave/rejoin observed; everyone-after=false; damage latency=null |
| MP-SOAK-RELOAD-AFTER-DEATH | both guests complete a reload after a death | PASS | guestA=true, guestB=true |
| MP-SOAK-RESPAWN-RESET | respawn restores the authored loadout and usable ammo for both guests | PASS | guestA=true, guestB=true |
| MP-SOAK-STAIR-FIRE | both guests fire successfully while staged on a house stair | FAIL | both scenario probes returned `interior house stair staging unavailable` before firing |
| MP-SOAK-CONSOLE-CLEAN | the three peers emit no page or console errors | PASS | host=0, guestA=0, guestB=0 |
| MP-SOAK-SCOREBOARD | all three peers agree on the final scoreboard | FAIL | agreement=false; peers were present, but the post-rejoin peer score sets differed |

## Triage

| Assertion | Classification | Deciding trace/state evidence | Fix or owner | Claim-state |
| --- | --- | --- | --- | --- |
| Duration | HARNESS/SCENARIO DEFECT | Initial bundle: `failure="hard browser-run timeout after 235000 ms"`, `playDurationMs=108868`; the timer was installed before lobby/arena boot while `playStart` was after active readiness. | `9bf869c5` bounds the browser run below five minutes and starts the stopwatch after active readiness. | VERIFIED by rerun: `completed=true`, `182448 ms`. |
| Replication bound | OWNED BY THE SIBLING LANE (with an initial harness subfinding) | Initial stair staging produced four position samples; after that correction the rerun still recorded `position` divergence at second 33, `57.271 m` (`host [-6,1.7,-32]` vs guestB `[6,1.7,24]`) and `presence` divergence from second 90. | The pre-window stair staging is fixed in `9bf869c5`/`97302224`; the remaining one-way/respawn/rejoin replication is owned by `mp-audit-todos`. Do not duplicate its fix. | VERIFIED finding; OPEN sibling-owned repair. |
| Rejoin/damage credit | OWNED BY THE SIBLING LANE | GuestB trace: `out:leave @201267.6`, `out:lobby-join @205289.9`; state diff: `remotesAfterRejoin={host:1,guestA:2,guestB:0}`, damage `byPeer={host:null,guestA:100,guestB:100}`. | Sibling lane owns rejoin, one-way replication, and pickup-relay rows. | VERIFIED finding; OPEN sibling owner. |
| Stair firing | HARNESS/SCENARIO DEFECT | Rerun state: both `stairFire=false`; both scenario results were `ok=false, staged=false, reason="interior house stair staging unavailable"`, so no stair shot trace exists to establish a game refusal. | `97302224` resolves the real stair from exported `nuketown2` geometry (`foot/top/run`, handedness) and preserves fire-block/trace evidence; no certain game fix was made. | VERIFIED harness defect; OPEN until a run exercises the corrected probe. |
| Scoreboard agreement | HARNESS/SCENARIO DEFECT, with residual sibling ownership | The prior adapter read nonexistent `PlayerScore.score`, yielding `score:null`. The rerun’s peer sets were host=3, guestA=2, guestB=3; guestB trace had `in:match-score @205952.2`, while no host/guestA `match-score` entry remained in the captured ring. | `97302224` reads authoritative `kills/deaths/damageDealt/damageTaken`; `9bf869c5` waits one RTT after play. The remaining post-rejoin score-set loss follows the sibling-owned roster/replication defect; no certain non-owned scoreboard game fix is justified. | VERIFIED harness correction; OPEN sibling-dependent rerun. |

## Gate table

| ID | Requirement | Result | Evidence |
| --- | --- | --- | --- |
| MP-SOAK-DURATION | scripted play lasts at least three minutes | FAIL | `completed=false`, 108868 ms / 180000 ms |
| MP-SOAK-REPLICATION | all directed peer pairs replicate every one-second sample within 1.5 m | FAIL | 103 samples, 178 divergences, no missing direction keys |
| MP-SOAK-REJOIN-DAMAGE | guest B leaves/rejoins and damage is observed by everyone within one 120 ms RTT | FAIL | leave/rejoin observed; damage triggered; everyone-after=false; latency=null |
| MP-SOAK-RELOAD-AFTER-DEATH | both guests complete a reload after a death | PASS | guestA=true, guestB=true |
| MP-SOAK-RESPAWN-RESET | respawn restores the authored loadout and usable ammo for both guests | PASS | guestA=true, guestB=true |
| MP-SOAK-STAIR-FIRE | both guests fire successfully while staged on a house stair | FAIL | guestA=false, guestB=false |
| MP-SOAK-CONSOLE-CLEAN | the three peers emit no page or console errors | PASS | host=0, guestA=0, guestB=0 |
| MP-SOAK-SCOREBOARD | all three peers agree on the final scoreboard | FAIL | agreement=false; final peer set was empty at timeout |

## Claim-state evidence

- **VERIFIED** — The soak runner reuses the audit driver's lobby, peer setup,
  trace capture, state views, and scenario helpers.
- **VERIFIED** — The network QA hook applies deterministic seeded impairment to
  state and event traffic, with 120 ms RTT and 1% loss recorded in the trace.
- **VERIFIED** — The assertion contract is covered by fixture-based Node tests;
  valid, invalid, and over-bound divergence fixtures pass their expected tests.
- **VERIFIED** — `npx tsc --noEmit` passed. The requested targeted Vitest set
  produced 334 passing tests; the existing legacy-main size ratchet remains one
  honest failure at 37480 lines versus its 37396-line ceiling. The Node soak
  assertion and gate-contract tests passed.
- **VERIFIED** — The rerun used headless installed Chrome, three peers, and
  the requested native WebGPU environment variable on ports 4230/4231.
  Browser cleanup completed; no 4230/4231/4232 listener remained.
- **VERIFIED** — The rerun completed the required play duration without
  weakening any threshold. The remaining failed rows are recorded above with
  owner classifications.
- **VERIFIED** — The real run found 178 replication divergences against the
  stated 1.5 m bound. The bound remains unchanged.
- **OPEN** — The soak gate is not green and therefore blocks any Pass 95
  publish. The failed rows require owner investigation and a later rerun after
  fixes land.

## Release preflight

- **VERIFIED** — `qa:lockfile` passed with the repository's npm 10 lockfile
  guard.
- **OPEN** — The prescribed Codex preflight reached the release guard but the
  guard rejects the documented `--harness Codex` spelling as not lowercase.
  Retrying with `codex` then rejects this required `contrib/.../claude/...`
  branch because the guard expects a `contrib/.../codex/...` branch. Using the
  branch-compatible `claude` value reaches the next guard and reports that this
  contribution does not contain current `origin/main`. No rebase or unrelated
  branch merge was performed in this QA lane.

## Implementation handoff

The required command is wired as `npm run qa:mp-soak`; its contract-only logic
can be run independently with `npm run qa:mp-soak:contract`. This triage rerun
used the direct gate entry point against the existing `dist` to honor the
no-rebuild constraint. The gate is listed as required in `AGENTS.md` and the Pass 95 cut ritual in
`docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md`.
