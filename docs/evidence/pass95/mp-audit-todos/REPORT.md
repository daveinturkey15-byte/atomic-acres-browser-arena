# Pass 95 — HF-504 multiplayer audit TODO lane

Date: 2026-09-05
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
- **VERIFIED:** reload continuity, post-respawn action sequencing, stable request IDs,
  retry/ack handling, host result idempotency, admission ordering, inventory repair,
  reload replication, host-ready lobby gating, host-clock countdown, revision stability,
  authority-change snapshot acceptance, and pre-authoritative remote withholding are
  covered by source tests and/or the driver changes.
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
| L-4 | FIXED / TRACED; narrow measure | authoritative phase/revision/arena/member snapshots agreed across all peers; the driver compares four fields, not ten DOM surfaces |
| L-7 | PASS | host, guest A, guest B all showed `DEPLOYING IN 5` |
| L-9 | PASS | lobby revision remained 10 -> 10 during telemetry |
| X-2 | PASS (historical artifact) | four-second state diff had zero divergences; the driver now requires and records `samplesCompared > 0` |
| P-3/P-4 | PASS | host saw claim; other guest saw no raw claim and did see correction |
| P-5 | PASS | auto-scavenge result restored ammo/reserve projection |
| P-6/P-8 | OPEN | attempted host-death pickup remained rejected; no successful convergence claim |
| R-1/R-2 | PASS (historical artifact) | reload rows ran after respawn; intent/result and host ammo continuity agreed |
| R-5 | OPEN after review correction | the artifact recorded `otherSeesReloading:null` and four `RELOAD-NOT-VISIBLE` findings; the verdict now gates on remote visibility |

**OPEN:** the final driver's L-3 “all-ready” sample did not click guest B's READY
control, so its `startDisabled` result is not accepted as an all-ready proof. The
focused predicate tests and partial-ready driver measure remain valid; a corrected
all-ready runtime scenario is deferred.

**OPEN:** residual findings remain for reload visibility evidence, weapon-swap
replication, death split, rejoin registration, and the `trigger-state` presentation
relay gap. Host-arbitrated `pickup`, `reload-intent`, and `shot-request` traffic is no
longer misclassified as a relay gap.

## Review-fix pass (2026-09-05)

**VERIFIED:** the pickup relay fence is explicitly documented at `src/network.ts:1273`;
host-authoritative claims enter `onMessage` before the generic broadcast path. The
reload debug view now exposes the replicated `reloading` field at
`src/legacy-main.ts:34532`, so the audit can distinguish missing presentation from
missing protocol state. The existing sequence reset, retry, acknowledgement, and
request-id cache seams were rechecked and retained.

**VERIFIED:** `scripts/qa/mp-audit.mjs:566` records a fresh all-ready lobby sample;
`scripts/qa/mp-audit.mjs:664-669` requires a nonzero compared-sample count for X-2;
`scripts/qa/mp-audit.mjs:958-963` requires ammo growth, intent, result, remote reload
visibility, and host ammo agreement for R-5; and `scripts/qa/mp-audit.mjs:1223-1251`
flags only presentation relay gaps while reporting host-arbitrated omissions separately.

**OPEN / TODO (larger fixes, not expanded in this lane):**

- Complete weapon-swap replication and make an in-flight reload commit against its
  captured weapon, not the current slot: `scripts/qa/mp-audit.mjs:1030-1032`,
  `src/legacy-main.ts:19374-19380` (W-4 and the `SWAP-NOT-REPLICATED` scenario).
- Decide and implement guest-to-guest trigger presentation replication, or explicitly
  remove the presentation requirement and its row: `src/network.ts:1275-1278`,
  `scripts/qa/mp-audit.mjs:1223-1251` (X-1).
- Re-register a resumed guest with the host roster and repopulate every peer's remote
  map after authenticated resume: `scripts/qa/mp-audit.mjs:1175-1218`,
  `src/legacy-main.ts:9187-9200` (X-3; owned by the desync lane).
- Exercise the corrected all-ready, post-respawn reload-visibility, real host-death
  pickup, and direct rejected-shot reload scenarios in a permitted browser run before
  converting their OPEN evidence rows: `scripts/qa/mp-audit.mjs:557-566`,
  `scripts/qa/mp-audit.mjs:888-963`, `scripts/qa/mp-audit.mjs:1030-1032`.

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
P-3, P-4, P-5, R-1, and R-2. R-5 is no longer reported as a measured PASS because
the same artifact recorded missing remote reload visibility.

**VERIFIED:** P-2, R-3, R-4, L-2, L-3, L-4, L-8, L-10, L-11, and L-12 are marked
FIXED/TRACED with direct scenario gaps explicitly marked OPEN.

**OPEN:** P-6/P-8, untouched W/D groups, the direct scenario gaps, and rejoin/X-3
remain open or other-lane-owned in the register.

## Ratchet hoist

**VERIFIED:** `src/legacy-main.ts` was 37,614 lines before this hoist and is
37,391 lines after it, 5 lines below the unchanged 37,396 ceiling. No ratchet
threshold or history row was changed.

**VERIFIED:** the authoritative lobby projection moved to
`src/mp-lobby-authority-views.ts`; local pickup-result rollback/canonical-drop
consumption moved to `src/mp-pickup-authority.ts`; and the reliable reload retry
timer/message seam moved to `src/mp-reload-retry.ts`. Legacy-main retains thin
state adapters and one-line calls at each runtime hook, with audit marker
comments kept at the hooks for the existing source-structure verifiers.

**VERIFIED:** repeated host death handling now uses one local
`broadcastCanonicalDeath` helper, preserving the existing canonicalize, nonce,
send, and process ordering across all call sites.

**VERIFIED:** `npx tsc --noEmit`, the legacy-main ratchet (5/5), and the explicit
focused multiplayer selection (54 files, 563 tests) passed. `git diff --check`
also passed.

**OPEN:** `node scripts/qa/mp-audit.mjs --dry-run` is browser-backed; it was
bounded and terminated without claiming audit evidence, consistent with this
lane's no-browser constraint. No browser result is represented as a pass here.

## Handoff

**CLAIMED:** the lane is ready for review at the pushed branch named above, with the
residual evidence and open rows preserved for the next bounded pass.
