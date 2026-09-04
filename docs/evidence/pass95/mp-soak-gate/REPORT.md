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
- **VERIFIED** — TypeScript, focused multiplayer tests, JSON parsing,
  `git diff --check`, and `npm run qa:mp-soak:contract` passed before the real
  run.
- **VERIFIED** — The real run used headless installed Chrome, three peers, and
  the requested native WebGPU environment variable. Browser cleanup completed;
  no 4227/4228 listener remained.
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
can be run independently with `npm run qa:mp-soak:contract`. The gate is listed
as required in `AGENTS.md` and the Pass 95 cut ritual in
`docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md`.
