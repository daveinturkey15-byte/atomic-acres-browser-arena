# PASS 95 cut - report

**Verdict: BLOCKED.** The cut ran to completion mechanically, but the PASS 95 publish plan
**cannot be asserted** and one required gate outside the owner's two override items is
**red**. Nothing was published. No test, threshold, fence, budget, timeout, soak bound,
the legacy-main size ratchet or a publish-plan assertion was weakened, skipped or widened.

- **Release checkout:** `C:/Users/david/projects/aa-claude-release84`
- **Branch:** `release/pass95`, cut from `origin/contrib/dave-gaming-pc/claude/pass93-candidate`
- **Candidate head:** `32d8dcb08351403979ab74ea30c273dd67501742`
- **Runtime:** `[VERIFIED]` `4b5cc28b0ca52c058fcea747a3719e4984bc6cfd` is an ancestor of HEAD
- **Build identity:** `[VERIFIED]` the tree calls itself **PASS 94**, not PASS 95 - see the blocker

---

## 1. The blocker: PASS 94 was never published, so PASS 95 has nothing to pin

`[VERIFIED]` `origin/gh-pages` at `7c9f1033` carries **exactly two channel trees,
`pass92` and `pass93`**. Its tip commit is
`publish: PASS 93 - owner list of 2026-09-02, PASS 92 pinned as the single safe backup`
(2026-09-04 08:08:44 +0100), and `release-index.json` reads
`{"generation":"2ff646727518", ...}` - the exact generation in the ledger's **PASS 93
publish record**. There is no `channels/pass94`.

`[VERIFIED]` the repository agrees. `src/changelog.ts` line 111:

    const pass94ReleasedAt = resolveProductionReleasedAt(PENDING_PRODUCTION_RELEASE);

Every pass that actually shipped carries a real literal (`pass93ReleasedAt =
'2026-09-04T08:08:44+01:00'`, `pass92ReleasedAt = '2026-09-03T19:13:03+01:00'`, ...).
PASS 94 is still `PENDING_PRODUCTION_RELEASE`. **PASS 94 was cut and gated but never
published**; the tree has been stamped `PASS 94` with `pass93Backup` ever since.

`scripts/orchestration/publish_pass94.py`'s header says "this pass is ALREADY PUBLISHED".
`[VERIFIED]` that sentence is **false for pass94** - it is rolled-forward boilerplate that
`roll_pass.py` copied from `publish_pass93.py`, as that file's own note explains. gh-pages
contradicts it.

### 1a. What `roll_pass.py --pass 95` produces, and why it cannot be committed

The roll was executed and **reverted**; nothing from it is committed.

1. `roll_pass.py` requires `--previous-released-at`, "ISO time of the previous pass's
   gh-pages publish commit". **PASS 94 has no such commit.** Any value fabricates a
   production receipt for a build that never went live, and it ships in the changelog UI.
   With the only defensible value available the roll wrote
   `const pass94ReleasedAt = '2026-09-04T08:08:44+01:00'` - **byte-identical to
   `pass93ReleasedAt`**, two different passes claiming the same release moment. This is the
   failure class AGENTS.md's durable gotcha exists to stop ("fail production unless every
   channel exposes a parseable real timestamp").
2. `[MEASURED]` `python scripts/orchestration/publish_pass95.py --dry-run` **exits 2 with
   five red guards**, four structural. Verbatim (`publish_pass95-dryrun.txt`):

        backup-present: WOULD REFUSE - REFUSING: gh-pages has no ['pass94'] tree to pin as the safe backup (present: ['pass92', 'pass93']). HF-400 pins PASS 94 beside PASS 95; it cannot be pinned if it is not there.
        chooser-matches-post-state: WOULD REFUSE - REFUSING: chooser offers trees ['pass94', 'pass95'] but gh-pages would carry ['pass95']; the two must be identical under HF-400
        post-state-exact: WOULD REFUSE - post-state would be ['pass95'], expected ['pass94', 'pass95']
        in-build-fallback: WOULD REFUSE - REFUSING: the in-build fallback channels/pass94 is NOT on gh-pages. Every visitor opening a channel URL directly would be offered PASS 94 and get a 404.

        DRY RUN: publish WOULD REFUSE (5 guard(s) red: build-present, backup-present, chooser-matches-post-state, post-state-exact, in-build-fallback)

A PASS 95 publish would leave gh-pages carrying **one** channel and offer a safe backup
that 404s. **The guards are correct and must not be touched.**

### 1b. The plan that IS asserted

`[MEASURED]` `python scripts/orchestration/publish_pass94.py --dry-run` on the same
gh-pages, build present: **exit 0, every guard green** (`publish_pass94-dryrun.txt`):

    build freshness guard: OK (build newer than newest source)
    farcrysis-admission guard: OK (3 paired runs, uncontended, all admitted, 0 in-match pipelines, worst pair ratio 1.2833x <= 1.6x)
    release-identity guard: OK (... dist-pass94 calls itself PASS 94, opens its notes on Pass 94, ships no HITL string)

    PLAN
      channel trees on gh-pages now: ['pass92', 'pass93']
      would delete channels/pass92/
      would keep   ['channels/pass93/']
      would write channels/pass94/ <- dist-pass94/ (replacing any existing tree)
      channels/ post-state would be: ['pass93', 'pass94']
        experimental: PASS 94 -> channels/pass94  "PASS 94"
        previous: PASS 93 -> channels/pass93  "PASS 93 SAFE BACKUP"
      predecessor guard: OK (offering PASS 94, PASS 93)
      in-build fallback guard: OK (pass93Backup -> channels/pass93 is the HF-400 safe backup and is on gh-pages)

    DRY RUN: every guard green; a real run would commit and push the publish plan above

**Channels: exactly the HF-400 two-channel policy** - live `channels/pass94`, pinned safe
backup `channels/pass93`. **The pass retired is `pass92`.**

The owner-approved build is the one already stamped PASS 94. Publishing it **as PASS 94**
needs no roll, no invented timestamp and no guard change.

---

## 2. The build is byte-identical to what the owner play-tested

`[VERIFIED]` `npm run build` here reproduces candidate 8's bundles exactly:

| Bundle | SHA-256 | Candidate 8 REPORT |
| --- | --- | --- |
| `legacy-main-B26NsPEA.js` | `6ae9c5785c380af3f6ddfa5d9d2508fa92868248be0f848f4bad8559befd9071` | identical |
| `index-Z7H2fNDC.js` | `eaebf4ea2360fe8ff26856c76c2c84bbb696eee68add03dfb0409f5f2ac61824` | identical |

The owner played these exact bytes on `:4300`. `dist-pass94/` is 606 files.

---

## 3. Gate table

| # | Gate | Claim | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2 | `npx tsc --noEmit` | `[VERIFIED]` | **exit 0, no output** | terminal |
| 3 | `node --test publish_pass94_plan.test.mjs` | `[VERIFIED]` | **9/9 pass, exit 0** | `publish-plan-test.txt` |
| 4 | Full `npx vitest run` | `[VERIFIED]` | **631 files passed / 1 skipped (632); 6,359 tests passed / 2 skipped (6,361); 91.61 s; exit 0; no rerun needed** | `vitest-full.txt` |
| 5 | `npm run build` | `[VERIFIED]` | **exit 0**, 1.88 s; `legacy-main-B26NsPEA.js` 1,965.47 kB / gzip 604.97 kB | `build.txt` |
| 6 | `qa:release-identity --dist dist-pass94` | `[VERIFIED]` | **exit 0** - "calls itself PASS 94 ... ships no HITL string" | `release-identity.txt` |
| 7 | `dist-pass94` copy | `[VERIFIED]` | 606 files, both bundle hashes match candidate 8 | `dist-bundle-sha256.txt` |
| 8 | build freshness guard | `[VERIFIED]` | **OK (build newer than newest source)** | `publish_pass94-dryrun.txt` |
| 9a | `PASS73_NATIVE_WEBGPU=1 qa:stock-boot` | `[VERIFIED]` | **4 passed (2.1 m), exit 0** - stock-flag installed Chrome, nuketown2 + raid2 | `stock-boot.txt` |
| 9b | Arena boot smoke (13 arenas) | `[MEASURED]` | **12 passed, 1 FAILED (13.1 m), exit 1** - `high-seas` | `arena-boot-smoke.txt` |
| 9b | `high-seas` rerun, isolated | `[MEASURED]` | **failed again, exit 1** - deterministic, not a flake | `arena-boot-smoke-highseas-rerun.txt` |
| 10 | Cold-admission smoke | `[MEASURED]` | **RED - 19,324.3 ms vs 10,000 ms** (owner override) | `cold-admission.txt` |
| 11 | `qa:mp-soak` | `[MEASURED]` | **RED - 5/8 rows** (owner override) | `mp-soak.txt` |
| 12 | `publish_pass95.py --dry-run` | `[MEASURED]` | **exit 2, 5 guards red - plan NOT assertable** | `publish_pass95-dryrun.txt` |
| 12 | `publish_pass94.py --dry-run` | `[VERIFIED]` | **exit 0, every guard green** | `publish_pass94-dryrun.txt` |

The legacy-main size ratchet passed inside the full suite; `LINE_CEILING` was not touched.

---

## 4. Red gate that is NOT an owner-override item: `high-seas` does not boot

`[MEASURED]` `tests/e2e/pass74-arena-boot-smoke.spec.ts`, arena `high-seas`:

    TimeoutError: page.waitForFunction: Timeout 120000ms exceeded.
      > 148 |       const outcomeHandle = await page.waitForFunction(

- **Deterministic.** Failed in the full 13-arena run (2.2 m) and again on an isolated rerun
  with the machine otherwise idle. The other **12 arenas pass**, including `nuketown2`,
  `raid2`, `atomic-acres`, `skyline-terminal`, `rustworks-1v1`, `gun-range`, `farcrysis`,
  `test1`, `test2`, `map3`.
- **It is player-selectable.** `src/map-selection.ts` line 355 defines `high-seas` with no
  `selectable: false`, so `SELECTABLE_ARENAS` (`entry.selectable !== false`) includes it. A
  visitor who picks **HIGH SEAS** gets a hang, not an error.
- **It fails silently.** `[MEASURED]` a direct probe against the gated bundle recorded
  **0 console errors and 0 page errors** over 120 s; the failure snapshot shows the app
  still on the deployment menu. Nothing throws - deployment never completes.
- `[OPEN]` **root cause not established.** No source fix was attempted in this cut.
- `[MEASURED]` **regression since the last publish.** The ledger's PASS 93 cut record states
  "boot smoke 13/13 (8.0 min)". Candidate 8 never ran this gate - its REPORT runs
  `stock-boot` and a bot-presence probe instead - so the break entered between PASS 93 and
  candidate 8 and was not caught before the owner's HITL.

This gate is **not** one of the two the owner is being asked to override.

---

## 5. The two owner-override gates

### 5a. Cold-admission smoke - RED (`cold-admission.txt`)

`[MEASURED]` one run, `PASS73_NATIVE_WEBGPU=1`, port 4292, clean worktree at `bb1d29e0`:

| Metric | This cut | Candidate 8 | Budget |
| --- | --- | --- | --- |
| **Cold Nuke Town transition** | **19,324.3 ms** | 21,807.6 ms | **10,000 ms (preserved)** |
| Combined cold preparation work | 19,795.6 ms | 22,341.7 ms | 10,000 ms (preserved) |
| Menu deployment prewarm, tasks >=50 ms | 2 (max 419.0 ms) | 3 (max 441.0 ms) | - |
| Cold admission, tasks >=50 ms | 174 (max 1,688.0 ms) | 298 (max 1,855.0 ms) | - |
| Foreground match admission | **degraded**: waited 5,018.8 ms, stable window 0 ms, 80 samples / 77 resets, max gap 88.9 ms, `drained: false` | degraded | - |

`[MEASURED]` **2,483.3 ms (11.4%) faster than candidate 8's measurement** of the same bytes;
the budget is still exceeded by **9,324.3 ms**. The 10,000 ms budget was **not** widened.
`[OPEN]` gate-audit **F3 reproduced verbatim**: "cold subject 'nuketown2' exposes no
art-loaded signal, so this run asserts that no arena's real art loaded". The run threw at
trial 1, so no multi-trial phase table exists.

### 5b. `npm run qa:mp-soak` - RED, 5/8 (`mp-soak.txt`)

`[MEASURED]` one run, `PASS73_NATIVE_WEBGPU=1`, three real peers, 180,401 ms.
`qa:mp-soak:contract` passed 3/3 first. No bound loosened.

| ID | Result | Evidence |
| --- | --- | --- |
| MP-SOAK-DURATION | **PASS** | `durationMs 180401 >= 180000` |
| MP-SOAK-REPLICATION | **FAIL** | `divergences 91`, `samples 179/180`, `missingDirections []`, bound 1.5 m |
| MP-SOAK-REJOIN-DAMAGE | **FAIL** | `seenByEveryoneAfter true`, `damageTriggered true`, **`damageLatencyMs null`**, rtt 120 |
| MP-SOAK-RELOAD-AFTER-DEATH | **FAIL** | `{guestA:false, guestB:true}` |
| MP-SOAK-RESPAWN-RESET | **PASS** | both guests |
| MP-SOAK-STAIR-FIRE | **PASS** | both guests |
| MP-SOAK-CONSOLE-CLEAN | **PASS** | `total 0` across all three peers |
| MP-SOAK-SCOREBOARD | **PASS** | `agreement true` |

`[MEASURED]` **the failing set is not stable between runs.** Candidate 8 also scored 5/8,
but its three failures were replication, rejoin-damage and **stair-fire**. This run
**passes stair-fire** and instead **fails reload-after-death** (which candidate 8 passed).
Two of the eight rows flipped on identical bytes, so "5/8" understates the uncertainty:
`MP-SOAK-STAIR-FIRE` and `MP-SOAK-RELOAD-AFTER-DEATH` are **non-deterministic**, and the
owner's override should be read as covering both.

`[MEASURED]` **35 findings, all `high`, 0 critical** (candidate 8: 40 findings, 6 critical,
34 high - the `FIRE-REFUSED` and `RELOAD-NO-EFFECT` criticals did not reproduce). The
dominant finding is unchanged and maps onto **HF-504**: **`SWAP-NOT-REPLICATED` in every
peer direction**, plus `SWAP-NO-EFFECT-guestB` x2 and `RELOAD-NOT-VISIBLE-guestA-post-death`.
Weapon-swap replication remains the largest live multiplayer defect.

`[MEASURED]` **doc drift:** AGENTS.md's Pass 95 required gate list says the soak runs "on
ports 4227-4228". `scripts/qa/mp-soak-gate.mjs` enforces
`ALLOWED_QA_PORTS = new Set([4233, 4234, 4235])` and throws on anything else. The run used
the gate's own defaults 4233/4234. Nothing was widened; **AGENTS.md is stale**.

---

## 6. Harness defects found (none worked around by weakening a budget)

1. `[VERIFIED]` **`qa:stock-boot` cannot start its own server.**
   `scripts/qa/playwright-web-server.mjs` runs `await build()` **and**
   `stage-release-topology.mjs` synchronously before `preview()` starts, all inside
   `playwright.config.ts`'s `webServer.timeout: 180000`. Staging alone was measured at
   5 m 45 s by the candidate-8 integrator. The 180 s budget was **not** widened: the build
   was served out of band on port **4291** and the spec run with
   `QA_EXTERNAL_PREVIEW=1 QA_PREVIEW_PORT=4291`. `[VERIFIED]` that server served
   `assets/index-Z7H2fNDC.js`, the gated bundle. Reproduced from candidate 8 - still open.
2. `[MEASURED]` **`qa:pass65:cold-webgpu-admission` requires a clean tracked worktree**
   (`git status --porcelain` empty, untracked files included), so gate logs cannot be
   written under `docs/` while it runs. Evidence was committed first and this run's log
   written outside the repo, then copied in.
3. `[MEASURED]` ports **4290 and 4293 were already occupied** by other processes (pids
   60876, 8432). All browser work used **4291/4292** only. `:4300` and the `aa-claude-hitl`
   worktree were never touched.

---

## 7. What the owner is being asked to decide

The owner said of candidate 8: "this build is really good, publish it" (HF-522). That is
still actionable - but **as PASS 94, not PASS 95**, and with one more red gate than the two
he was told about.

**Recommended next command** (from this release checkout, after the decision):

    cd C:/Users/david/projects/aa-claude-release84
    python scripts/orchestration/publish_pass94.py --dry-run   # re-confirm: exit 0, all green
    python scripts/orchestration/publish_pass94.py             # live = pass94, backup = pass93, retires pass92

Three decisions are needed:

1. **Number.** Publish the approved build as **PASS 94** (recommended - it is what the tree
   is stamped, its publish script is green, and no timestamp is invented). Renumbering to 95
   requires either publishing 94 first, or a deliberate policy edit pointing `BACKUP_TREE`
   at `pass93` and removing PASS 94's changelog entry rather than giving it a fake receipt.
   That edit is a release-policy change and was **not** made here.
2. **`high-seas`.** A selectable arena that hangs. Options: fix it, mark it
   `selectable: false` for this pass (a real content change, gated), or override knowingly.
   **Not** covered by the owner's stated two-gate override.
3. **The two known reds** - cold-admission 19,324.3 ms vs 10,000 ms, and `qa:mp-soak` 5/8
   with two rows shown to be non-deterministic. Both fences stay in place and unmodified.

**Nothing was published.** No `publish_pass*.py` was run without `--dry-run`, no `gh-pages`
push, no `npm run deploy`.
