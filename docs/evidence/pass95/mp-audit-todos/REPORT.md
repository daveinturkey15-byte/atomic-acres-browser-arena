# Pass 95 — HF-504 multiplayer audit TODO lane

Date: 2026-09-04  
Lane: `contrib/dave-gaming-pc/claude/mp-audit-todos`  
Base: `origin/contrib/dave-gaming-pc/claude/mp-audit-hf504`  
Arena: `nuketown2`  
Runtime: three headless Chrome peers, native WebGPU, ports 4217/4218, clean impairment

## Claim-state summary

- **VERIFIED:** HF-498 was merged first at `736a10a6` (source `2b0c304e`) and its
  reload acknowledgement, idempotency, respawn loadout, stair-muzzle, and tests are
  present in this lane.
- **OPEN:** HF-499 was not pushed to `origin`; no desync-lane report or ref was
  available to merge or prove.
- **VERIFIED:** the HF-504 row-group fixes are committed in explicit-path commits:
  `19c6e3d4` (P-3/P-4), `16fc35c3` (R-2..R-5), `294fd0fe` and follow-ups
  `d3ebe646`, `31cf4735`, `2346dd71`, `763398d3`, `db539c79` (P-2/P-5
  and pickup audit authority), `da466513` (lobby group), and `28de294d` (X-2).
- **VERIFIED:** guest pickup claims are no longer transport-relayed. The host validates
  the claim, broadcasts the canonical `pickup-result`, and a rejection reaches every
  peer that saw the attempted claim. The three-peer P-3/P-4 row measures are PASS.
- **VERIFIED:** reload continuity, post-respawn action sequencing, admission ordering,
  inventory repair, reload replication, host-ready lobby gating, host-clock countdown,
  revision stability, authority-change snapshot acceptance, and pre-authoritative remote
  withholding are covered by source tests and/or the driver changes.
- **OPEN:** P-6/P-8 are not claimed closed. The audit's real-death pickup attempt still
  produced a rejected staged claim; this proves the host rejection path, not successful
  convergence from a real host-observed death.

## Audit evidence

### Baseline

**VERIFIED:** `artifacts/qa/mp-audit/baseline-audit.json` completed with three native
WebGPU peers on the permitted ports. It reported 16 findings (12 high, 4 critical),
including raw pickup relay, early lobby start, and initial remote spawn divergence.

### After candidate

**VERIFIED:** `artifacts/qa/mp-audit/hf504-pass95-final-audit.json` completed with
three native WebGPU peers, clean impairment, ports 4217/4218, and a four-second state
diff. It reported 15 residual findings (14 high, 1 critical); `stateDiff.divergences`
and `stateDiff.byField` were empty.

**VERIFIED:** measured row results in that complete artifact:

| Row | Result | Driver evidence |
|---|---|---|
| L-1 | PASS | host-alone START disabled |
| L-4 | PASS | authoritative phase/revision/arena/member snapshots agreed across all peers |
| L-7 | PASS | host, guest A, guest B all showed `DEPLOYING IN 5` |
| L-9 | PASS | lobby revision remained 10 -> 10 during telemetry |
| X-2 | PASS | four-second state diff had zero divergences |
| P-3/P-4 | PASS | host saw claim; other guest saw no raw claim and did see correction |
| P-5 | PASS | auto-scavenge result restored ammo/reserve projection |
| P-6/P-8 | OPEN | attempted host-death pickup remained rejected; no successful convergence claim |
| R-1/R-2/R-5 | PASS | reload rows ran after respawn; reload field replicated |

**OPEN:** the final driver's L-3 “all-ready” sample did not click guest B's READY
control, so its `startDisabled` result is not accepted as an all-ready proof. The
focused predicate tests and partial-ready driver measure remain valid; a corrected
all-ready runtime scenario is deferred.

**OPEN:** residual findings remain for reload visibility/ack evidence, weapon-swap
replication, death split, rejoin registration, and non-authoritative relay gaps. They
were not silently converted to fixed rows.

## Gates

- **VERIFIED:** `npx tsc --noEmit` passed after the source changes.
- **VERIFIED:** `npm run build` passed after the source changes.
- **VERIFIED:** the requested Vitest selection ran 43 test files; 42 files passed
  (414 tests).
- **OPEN:** the requested Vitest gate remains red on the existing
  `legacy-main-size-ratchet.test.ts` ratchet (`37614 > 37396`). The threshold was
  not weakened. The focused multiplayer tests and HF-498 tests pass; the ratchet row
  remains an honest failure.
- **VERIFIED:** `git diff --check` passed for the implementation and evidence edits.
- **OPEN:** the repository preflight rejected the requested
  `contrib/dave-gaming-pc/claude/...` branch shape when invoked as Codex; the
  preflight requires a Codex branch namespace. The requested branch name was retained.

## DEFECTS.md disposition

**VERIFIED:** `docs/evidence/pass94/mp-audit/DEFECTS.md` was updated in place and no
row was deleted. It contains 43 unique row IDs despite the historical total saying 42.

**VERIFIED:** rows measured PASS by the complete artifact are L-1, L-7, L-9, X-2,
P-3, P-4, P-5, R-1, R-2, and R-5.

**VERIFIED:** P-2, R-3, R-4, L-2, L-3, L-4, L-8, L-10, L-11, and L-12 are marked
FIXED/TRACED with direct scenario gaps explicitly marked OPEN.

**OPEN:** P-6/P-8, untouched W/D groups, the direct scenario gaps, and rejoin/X-3
remain open or other-lane-owned in the register.

## Handoff

**CLAIMED:** the lane is ready for review at the pushed branch named above, with the
residual evidence and open rows preserved for the next bounded pass.
