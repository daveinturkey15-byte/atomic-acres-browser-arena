# PASS 94 publish - RECEIPT

**Status: BLOCKED-PENDING-OWNER. Nothing was published.**
`publish_pass94.py` was run **only** with `--dry-run`. No gh-pages push, no `npm run deploy`,
no `roll_pass.py`. No test, threshold, fence, budget, soak bound or publish-plan assertion was
weakened, skipped or widened.

- **Release checkout:** `C:/Users/david/projects/aa-claude-release84`
- **Branch / head:** `release/pass95` @ `9c61b6f3e61e7661124255a34cd97712f4c2e5b9`
  (`[VERIFIED]` clean tree, matches `origin/release/pass95`; `git merge-base --is-ancestor
  32d8dcb0 HEAD` -> true, so candidate 8 is in it)
- **Authority read:** ledger `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` rows HF-522, HF-523,
  HF-524 and the section "PASS 95 cut - 2026-09-05 11:20 BST"; cut report
  `docs/evidence/pass95/cut/REPORT.md`.
- **Publish number:** PASS 94, not 95 (HF-524). `[VERIFIED]` PASS 94 was never published:
  `origin/gh-pages` @ `7c9f1033` carries exactly `['pass92','pass93']`, and the live chooser
  names PASS 93 live / PASS 92 safe backup.

---

## Why it is blocked

`[MEASURED]` **The arena boot smoke is RED on a gate the owner's override does not cover.**
`tests/e2e/pass74-arena-boot-smoke.spec.ts`, arena **`high-seas`**: 12 of 13 arenas pass,
`high-seas` fails, twice, deterministically, on the exact bytes that would be published:

    x  10 [chromium] ... high-seas: boots a clean visible solo match (2.2m)
    TimeoutError: page.waitForFunction: Timeout 120000ms exceeded.
      > 148 |       const outcomeHandle = await page.waitForFunction(
    1 failed / 12 passed (13.1m)          -- docs/evidence/pass95/cut/arena-boot-smoke.txt
    1 failed  (isolated rerun, idle machine)
                                          -- docs/evidence/pass95/cut/arena-boot-smoke-highseas-rerun.txt

`[MEASURED]` it fails **silently** - the cut's direct probe over 120 s recorded
`FINAL SNAPSHOT: {"failure":null}`, `CONSOLE ERRORS (0)`, `PAGE ERRORS (0)`, with the app still
on the deployment menu (`docs/evidence/pass95/cut/high-seas-probe.txt`). Nothing throws;
deployment never completes.

`[VERIFIED]` **it is player-selectable in the build that would go live.**
`src/map-selection.ts:355` defines `id: 'high-seas'` with **no** `selectable: false`, and
`SELECTABLE_ARENAS` (lines 505-506) is `ARENA_SELECTIONS.filter((entry) => entry.selectable !==
false)`. The shipped bundle `dist-pass94/assets/legacy-main-B26NsPEA.js` contains the selector
label string `HIGH SEAS` (2 occurrences). A visitor who picks **HIGH SEAS** on a published
PASS 94 gets a hang with no error.

`[MEASURED]` **it is a regression since the last publish.** The ledger's PASS 93 publish record
lists "boot smoke 13/13 (8.0 min)". Candidate 8 never ran this gate, so the break entered
between PASS 93 and candidate 8 and was not in front of the owner during his HITL.

`[VERIFIED]` **it is outside the owner's override.** HF-523 (2026-09-05 10:22) overrides exactly
two red gates - the cold-admission smoke and `qa:mp-soak`. It says nothing about a broken arena.
`[OPEN]` root cause not established; no source fix was attempted, and no arena was marked
`selectable: false` (that would be an ungated content change to the bytes the owner played).

---

## Preflight - every check run, with its result

| # | Check | Claim | Result |
| --- | --- | --- | --- |
| 1 | `release/pass95` clean, HEAD = ledger head | `[VERIFIED]` | clean; `9c61b6f3`; `32d8dcb0` is an ancestor |
| 2 | `dist` and `dist-pass94` present and byte-identical | `[VERIFIED]` | **606 files each; sha256 of every path identical** |
| 3 | Bundle SHAs equal the cut's recorded candidate-8 hashes | `[VERIFIED]` | `legacy-main-B26NsPEA.js` `6ae9c5785c380af3f6ddfa5d9d2508fa92868248be0f848f4bad8559befd9071`; `index-Z7H2fNDC.js` `eaebf4ea2360fe8ff26856c76c2c84bbb696eee68add03dfb0409f5f2ac61824` - **third independent reproduction of the bytes the owner played** |
| 4 | `qa:release-identity` against `dist` | `[VERIFIED]` | exit 0 - "calls itself PASS 94, opens its notes on Pass 94, ships no HITL string" |
| 5 | `qa:release-identity` against `dist-pass94` | `[VERIFIED]` | exit 0 - same |
| 6 | gh-pages pre-publish head | `[VERIFIED]` | `7c9f10338119921d80baf38308915f64c2e494a4` |
| 7 | Canonical HTTPS root, cache-busted | `[MEASURED]` | `http_code=200`; chooser `experimental` = **"PASS 93"** -> `channels/pass93`, `deploymentState: "live"`; `previous` = "PASS 92 SAFE BACKUP"; `release-index.json` generation `2ff646727518` |
| 8 | `publish_pass94.py --dry-run` | `[VERIFIED]` | **exit 0, every guard green** (see below) |
| 9 | Arena boot smoke (13 arenas) | `[MEASURED]` | **RED - 12/13, `high-seas` (cut evidence, 2 deterministic runs)** - **the blocker** |
| 10 | Cold-admission smoke | `[MEASURED]` | RED - 19,324.3 ms vs 10,000 ms (**owner override HF-523**) |
| 11 | `qa:mp-soak` | `[MEASURED]` | RED - 5/8 (**owner override HF-523**) |

`[MEASURED]` **Build-freshness note (no guard was touched).** The first `--dry-run` of this
session exited 2 on one guard: `build-freshness: WOULD REFUSE - STALE BUILD`. Cause, measured:
the cut's own browser gates wrote gitignored test artifacts **after** the 10:28 build -
`artifacts/qa/mp-soak-gate/hf499-bundle.json` 11:09:43, `artifacts/pass65/cold-webgpu-admission/
failure-receipt.json` 11:04:44, `artifacts/pass25a/playwright-results/.last-run.json` 10:55:45 -
and `assert_build_is_not_stale()` deliberately keeps `artifacts/` in scope. No tracked source
file was newer. The remedy applied is the one the guard's own docstring names ("If a file there
is newer than the build, rebuild and copy again"): `npm run build` (exit 0, 1.82 s) then
`dist -> dist-pass94`. Both bundle SHAs came back **identical** to the cut's, so the plan is
still the bytes the owner played. The guard was not modified, skipped or widened.

## The asserted plan (`publish_pass94-dryrun.txt`, exit 0)

    build freshness guard: OK (build newer than newest source)
    farcrysis-admission guard: OK (3 paired runs, uncontended, all admitted, 0 in-match pipelines, worst pair ratio 1.2833x <= 1.6x)
    release-identity guard: OK (... dist-pass94 calls itself PASS 94 ... ships no HITL string)

    PLAN
      channel trees on gh-pages now: ['pass92', 'pass93']
      would delete channels/pass92/
      would keep   ['channels/pass93/']
      would write channels/pass94/ <- dist-pass94/ (replacing any existing tree)
      channels/ post-state would be: ['pass93', 'pass94']
        experimental: PASS 94 -> channels/pass94  "PASS 94"
        previous: PASS 93 -> channels/pass93  "PASS 93 - SAFE BACKUP"
      predecessor guard: OK (offering PASS 94, PASS 93)
      in-build fallback guard: OK (pass93Backup -> channels/pass93 is the HF-400 safe backup and is on gh-pages)
      root chooser would be published as generation 7c9adb8db2b1

    DRY RUN: every guard green; a real run would commit and push the publish plan above

`[VERIFIED]` this is **exactly the HF-400 two-channel topology** - live `channels/pass94`,
pinned safe backup `channels/pass93`, `pass92` retired - and it matches the cut's recorded
dry-run (`docs/evidence/pass95/cut/publish_pass94-dryrun.txt`) line for line. **The plan is
assertable; the build is not the problem.**

## Post-state

`[VERIFIED]` unchanged. gh-pages head **before = after = `7c9f10338119921d80baf38308915f64c2e494a4`**;
channels still `['pass92','pass93']`; the canonical HTTPS root still names **PASS 93**;
`src/changelog.ts:111` still reads `const pass94ReleasedAt =
resolveProductionReleasedAt(PENDING_PRODUCTION_RELEASE)` (that literal is written by the publish
script's receipt, never by hand).

---

## Override debt that would carry into a PASS 94 record

Recorded here so it is not re-litigated when the owner decides:

1. **Cold-admission smoke - RED, owner override HF-523.** `[MEASURED]` cold Nuke Town transition
   **19,324.3 ms** against the preserved, unwidened **10,000 ms** budget (candidate 8 measured
   21,807.6 ms on the same bytes - this run is 2,483.3 ms / 11.4 % faster). Combined cold
   preparation 19,795.6 ms; foreground match admission degraded (`drained: false`).
   `[OPEN]` gate-audit F3 reproduced: nuketown2 exposes no cold-session art-loaded signal.
   **Follow-up lane named in the ledger:** the cold visual-definition lane (queued).
2. **`qa:mp-soak` - RED 5/8, owner override HF-523.** `[MEASURED]` FAIL: replication (91
   divergences), rejoin-damage (`damageLatencyMs null`), reload-after-death (`guestA false`).
   PASS: duration, respawn-reset, stair-fire, console-clean (0 errors on all three peers),
   scoreboard. `[MEASURED]` two rows (`STAIR-FIRE`, `RELOAD-AFTER-DEATH`) flipped between
   candidate 8 and the cut on identical bytes, so both are non-deterministic and the override
   should be read as covering both. Dominant finding `SWAP-NOT-REPLICATED` in every peer
   direction (HF-504). **Follow-up lane named in the ledger:** `mp-swap-reload-relay`
   @ `a9b4b029` (Muse verdict SHIP-WITH-FIXES, F1/F2 outstanding) - **not in this cut**.
3. **`high-seas` boot - RED, NOT covered by any override.** The blocker above. Options, none of
   which an agent may pick unilaterally: fix it; mark it `selectable: false` for this pass (a
   real, gated content change that would break byte-identity with the build the owner played);
   or the owner knowingly extends his override to a third gate.

## What unblocks a publish

The moment the owner rules on `high-seas`, the publish is one command from this checkout - the
plan is already green and the bytes are already reproduced:

    cd C:/Users/david/projects/aa-claude-release84
    python scripts/orchestration/publish_pass94.py --dry-run   # re-confirm exit 0
    python scripts/orchestration/publish_pass94.py             # live pass94, backup pass93, retires pass92

Nothing about the release machinery needs changing. `:4300` and the `aa-claude-hitl` worktree
were never touched by this session.
