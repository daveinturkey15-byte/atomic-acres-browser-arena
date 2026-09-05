# PASS 94 publish — RECEIPT

**Status: PUBLISHED. PASS 94 is live.**
`python scripts/orchestration/publish_pass94.py` exit 0 after its `--dry-run` exit 0. No
`npm run deploy`, no manual `gh-pages` push, no `roll_pass.py`. **No test, threshold, fence,
budget, timeout, soak bound, the legacy-main size ratchet or a publish-plan assertion was
weakened, skipped or widened.** `:4300` and the `aa-claude-hitl` worktree were never touched.

- **Release checkout:** `C:/Users/david/projects/aa-claude-release84`
- **Branch / head at the publish:** `release/pass95` @ `67b8ad8e`
  (merge commit `10fa61419f9db02831e72803162010d99e287736`)
- **Authority:** ledger `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` — HF-522 (owner: publish it),
  HF-523 (owner override of exactly two red gates), HF-524 (it ships as PASS **94**, not 95),
  HF-525 (High Seas red, *not* covered by the override), **HF-526 (owner: "get it fixed and
  published")**, HF-527, and the 13:32 row announcing the fix at `4bdfb17c`.

---

## 1. The High Seas fix that was merged

`[VERIFIED]` Merged **only** `origin/contrib/dave-gaming-pc/claude/fix-high-seas-batching`
@ `4bdfb17cfa869f6ac3b2c20371cc686d0d2eea30` into `release/pass95` with `--no-ff`
(merge `10fa6141`, no conflicts, nothing resolved by hand, no test touched).
The Luna lane `fix-high-seas-boot` was **not** merged (stopped, wrong hypothesis).

`[VERIFIED]` **It is the cause fix, not a parked arena and not a widened timeout.** Read in full:

| File | Change |
| --- | --- |
| `src/rendering/render-runtime.ts` | New `INHERITED_WEBGPU_DEVICE_LIMITS` + pure exported `selectInheritedDeviceLimits()`; `requestNegotiatedDevice()` asks for `requiredLimits` from `adapter.limits` and **keeps the fallback ladder** (limits+features → limits → features → bare). |
| `src/legacy-main.ts` (~30302) | The caught arena-selection rollback now sets a status matching the deploy-failed contract instead of only "remains selected". |
| `tests/e2e/pass74-arena-boot-smoke.spec.ts` | **Strengthened**: asserts `document.documentElement.dataset.arenaId === arenaId` — the arena that booted must be the one requested, closing the hole that let a rolled-back arena pass as green. |
| `src/rendering/render-runtime-device-limits.test.ts` | New — 7 regression tests pinning the contract against the real `create()`. |

`[READ]` The defect: WebGPU grants an unrequested limit at the **spec default**, not the
adapter's value. `requestDevice()` carried no `requiredLimits`, so every device was capped at
16 sampled textures per shader stage while this adapter advertises 32. High Seas' fragment
stage binds 17; the rejected bind group cascaded into an invalid `CommandBuffer`,
`performArenaSelection` threw, and the player was rolled back — a silent hang.
`[VERIFIED]` No arena was marked `selectable: false`; no budget was moved.

`[VERIFIED]` The candidate branch was kept canonical for `:4300`'s lineage:
`git push origin HEAD:refs/heads/contrib/dave-gaming-pc/claude/pass93-candidate` →
**`32d8dcb0..10fa6141` (fast-forward)**.

---

## 2. Gates on the merged head — every one run, with its result

| # | Gate | Claim | Result |
| --- | --- | --- | --- |
| 1 | `npx tsc --noEmit` | `[VERIFIED]` | **exit 0**, no diagnostics |
| 2 | `node --test scripts/orchestration/publish_pass94_plan.test.mjs` | `[VERIFIED]` | **9/9 pass, 0 fail**, exit 0 |
| 3 | FULL `npx vitest run` (under the machine lock) | `[VERIFIED]` | **632 files passed / 1 skipped (633); 6366 tests passed / 2 skipped (6368)**, exit 0. No rerun was needed — no timeouts, no flakes |
| 4 | `npm run build` (last, under the lock) | `[VERIFIED]` | exit 0, `✓ built in 2.19s` |
| 5 | `dist` → `dist-pass94`, byte-identical | `[VERIFIED]` | **606 files each; sha256 of every path identical** |
| 6 | Bundle SHA-256 | `[VERIFIED]` | `legacy-main-B7Iio44Z.js` = `31aa0de1eabc5304c7c1b5d7bf64f7834f6e71a329e1fa7989b344dcc33b0b94`; `index-DJtX3xeS.js` = `d2d57995a1546128c7c0700a47d7eee988ae66d0c184eb57733cc7c8ced667a9`. **Three independent builds in this session reproduced `dist` byte-for-byte** (606/606 paths) — the build is deterministic |
| 7 | `npm run qa:release-identity` on `dist` | `[VERIFIED]` | exit 0 — "calls itself PASS 94, opens its notes on Pass 94, ships no HITL string" |
| 8 | `qa:release-identity` on `dist-pass94` | `[VERIFIED]` | exit 0 — same (run inside the publish script's guard) |
| 9 | Build-freshness guard | `[VERIFIED]` | **OK (build newer than newest source)** — after the documented remedy, see §4 |
| 10 | `PASS73_NATIVE_WEBGPU=1 npm run qa:stock-boot` | `[VERIFIED]` | **4 passed (2.2 m), exit 0** — installed Chrome, stock flags, headless, nuketown2 + raid2; server served `assets/index-DJtX3xeS.js`, the gated bundle |
| 11 | **FULL 13-arena boot smoke** | `[VERIFIED]` | **13 passed (13.1 m), exit 0 — 13/13.** `high-seas` green at **1.5 m** |
| 12 | `legacy-main.ts` size ratchet | `[VERIFIED]` | **37,390 / 37,396** lines — inside the unchanged ceiling |
| 13 | Cold-admission smoke | `[MEASURED]` | **RED — owner override HF-523**, see §5 |
| 14 | `npm run qa:mp-soak` | `[MEASURED]` | **RED — owner override HF-523**, see §5 |

### The 13-arena smoke, in full

    ok  3 nuketown2 (1.2m)          ok  4 raid2 (58.0s)        ok  5 atomic-acres (1.2m)
    ok  6 skyline-terminal (59.8s)  ok  7 rustworks-1v1 (1.5m) ok  8 gun-range (1.4m)
    ok  9 farcrysis (1.2m)          ok 10 high-seas (1.5m)     ok 11 test1 (51.0s)
    ok 12 test2 (50.5s)             ok 13 map3 (1.3m)
    13 passed (13.1m)               BOOT_SMOKE_EXIT=0

`[VERIFIED]` **the smoke ran the bytes that were published.** The tree it was served from,
`dist/channels/pass94/assets/`, hashed to the same `31aa0de1…` / `d2d57995…` recorded above.
`[VERIFIED]` this run used the **strengthened** spec from the fix branch, so a rollback can no
longer pass as a boot — the gate got harder, not easier, and still went 13/13.

---

## 3. The publish

`[VERIFIED]` `publish_pass94.py --dry-run` → **exit 0, every guard green**:

    build freshness guard: OK (build newer than newest source)
    farcrysis-admission guard: OK (parked - 1 registry entry, none selectable)
    release-identity guard: OK (... dist-pass94 calls itself PASS 94 ... ships no HITL string)

    PLAN
      channel trees on gh-pages now: ['pass92', 'pass93']
      would delete channels/pass92/
      would keep   ['channels/pass93/']
      would write channels/pass94/ <- dist-pass94/
      channels/ post-state would be: ['pass93', 'pass94']
        experimental: PASS 94 -> channels/pass94  "PASS 94"
        previous: PASS 93 -> channels/pass93  "PASS 93 · SAFE BACKUP"
      predecessor guard: OK (offering PASS 94, PASS 93)
      in-build fallback guard: OK (pass93Backup -> channels/pass93 is the HF-400 safe backup)
      root chooser would be published as generation 7c9adb8db2b1

`[VERIFIED]` `publish_pass94.py` (real run) → **exit 0**, asserting its own post-state:

    channels/pass94 <- dist-pass94
    retired channels/pass92/
    post-state guard: OK (channels/ is exactly ['pass93', 'pass94'])
    predecessor guard: OK (offering PASS 94, PASS 93)
    in-build fallback guard: OK (pass93Backup -> channels/pass93 is the HF-400 safe backup)
    root chooser published as generation 7c9adb8db2b1
    channels now: PASS 94, PASS 93
    PUBLISHED: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/

This is exactly the **HF-400 two-channel topology**: live `channels/pass94`, pinned safe
backup `channels/pass93`, `pass92` retired.

### Live verification (§7 of the brief)

| Check | Claim | Result |
| --- | --- | --- |
| gh-pages head changed | `[VERIFIED]` | **pre `7c9f10338119921d80baf38308915f64c2e494a4` → post `98e3627c3ebaf5fdc8aae036bb1966e0fe7bb3dd`** |
| gh-pages carries exactly {pass93, pass94} | `[VERIFIED]` | `git ls-tree origin/gh-pages channels/` → `channels/pass93`, `channels/pass94` — nothing else |
| Canonical HTTPS root names PASS 94, cache-busted, twice 33 s apart | `[VERIFIED]` | 13:12:30 and 13:13:03 UTC, both `http_code=200`, both `release-index.json` generation **`7c9adb8db2b1`**, both chooser configs: `PASS 94 → channels/pass94, deploymentState "live"` and `PASS 93 · SAFE BACKUP → channels/pass93` |
| `channels/pass94` serves the recorded bundle | `[VERIFIED]` | live `legacy-main-B7Iio44Z.js` = `31aa0de1…d667a9` and live `index-DJtX3xeS.js` = `d2d57995…d667a9`-pair — **identical to `dist`**; `channels/pass94/` `http_code=200` |
| `channels/pass93` still serves | `[VERIFIED]` | `http_code=200` |
| `channels/pass92` retired | `[VERIFIED]` | `http_code=404` |

`[MEASURED]` GitHub Pages served the previous generation (`2ff646727518`, PASS 93) for about
70 s after the push; the new generation appeared on poll 5. That is Pages propagation, not a
publish failure — both confirmations above were taken after it.

---

## 4. Harness defects found (none worked around by weakening a budget)

1. `[VERIFIED]` **`qa:stock-boot` still cannot start its own server** (reproduced from the
   PASS 95 cut, §6.1 there — still open). `scripts/qa/playwright-web-server.mjs` runs
   `await build()` **and** `scripts/release/stage-release-topology.mjs` synchronously before
   `preview()`, all inside `playwright.config.ts`'s `webServer.timeout: 180000`. The run
   failed with `Error: Timed out waiting 180000ms from config.webServer`.
   `[MEASURED]` staging alone took **4 m 59 s** (12:39:45 → 12:44:44 UTC) on a warm cache —
   `stagePinned()` spawns **one `git cat-file blob` process per file** of the pinned stable
   channel. **The 180 s budget was not widened**; the build was served out of band and the
   spec run with `QA_EXTERNAL_PREVIEW=1`.
2. `[VERIFIED]` **NEW — the out-of-band server must serve the UNSTAGED app build.** Serving
   the *staged* topology makes `qa:stock-boot` fail **2/4** on
   `locator('[data-release-choice="latest"]')` timing out. Cause, measured: the staged
   production root is the release chooser, whose cards are keyed
   `experimental` / `previous` / `retained` (from `release-channel-config.js`), while the
   spec clicks the **in-build** `bootstrap.ts` gate's `latest` card. Both roots expose
   `#release-channel-gate`, so the spec's `visible()` probe cannot tell them apart. Serving
   plain `dist` on 4291 — what the cut did — gave **4 passed, exit 0** on the same bytes.
   This is a harness ambiguity, not a product failure; recorded so the next agent does not
   read it as one. Nothing in the spec or the config was changed.
3. `[MEASURED]` **`qa:pass65:cold-webgpu-admission` requires a clean tracked worktree**
   (reproduced from the cut, §6.2). Honoured rather than worked around: the gate evidence was
   committed first (`67b8ad8e`) and the cold log written outside the repo, then copied in.
4. `[MEASURED]` **Build freshness after browser gates.** The browser gates write gitignored
   files under `artifacts/`, which `assert_build_is_not_stale()` deliberately keeps in scope.
   The remedy applied is the one the guard's own docstring names — `npm run build` (exit 0)
   then `dist → dist-pass94` — after which the guard reported
   **`OK (build newer than newest source)`**. `[VERIFIED]` both bundle SHAs came back
   **unchanged**, so the rebuild did not alter what shipped. The guard was not modified,
   skipped or widened.
5. `[MEASURED]` **Ports.** 4290 (pid 60876) and 4300 (the owner's HITL, pid 189676) were
   occupied by other work and were never touched. All browser work used **4291 / 4293** only,
   headless, off-screen (`--window-position=-32000,-32000`), muted, one at a time, under the
   machine lock.

---

## 5. Owner-override debt carried into PASS 94

Recorded so it is not re-litigated. Both were run **once** on the published bytes and neither
blocks per HF-523; neither budget was moved.

1. **Cold-admission smoke — RED (owner override HF-523).**
   `[MEASURED]` cold Nuke Town transition **21,713.5 ms** against the preserved, unwidened
   **10,000 ms** budget; combined cold preparation **22,296.5 ms**; foreground match admission
   degraded (`drained: false`, `admittedDegraded: true`); cold admission produced 282 tasks
   ≥50 ms (max 1,709.0 ms).
   `[MEASURED]` **in band with every prior measurement of this build**, not a new regression:
   candidate 8 21,807.6 ms → PASS 95 cut 19,324.3 ms → fix lane 20,919.6 ms → this run
   21,713.5 ms. Spread across identical-or-near-identical bytes is ~2.5 s, so the gate is
   machine-noisy at this magnitude but never near 10,000 ms.
   `[OPEN]` gate-audit F3 still open: nuketown2 exposes no cold-session art-loaded signal.
   **Follow-up lane:** the queued cold visual-definition lane.
2. **`qa:mp-soak` — RED (owner override HF-523).**
   `[MEASURED]` **this run was truncated and is worse than the cut's**: exit **124**
   (timeout kill), `MP-SOAK-DURATION` `{"completed":false,"durationMs":131667,
   "requiredDurationMs":180000}`, and `MP-SOAK-SCOREBOARD` ended with `"peersPresent":[]` —
   the peers were gone before the run finished, so **1/8 rows passed** (only
   `MP-SOAK-RESPAWN-RESET`) and the other seven are downstream of a run that never completed.
   `[MEASURED]` the PASS 95 cut's run on the same build **did** complete (180,401 ms) and
   scored **5/8**. `[MEASURED]` two rows (`STAIR-FIRE`, `RELOAD-AFTER-DEATH`) had already been
   shown to flip between candidate 8 and the cut on identical bytes, so this harness is known
   non-deterministic; a truncated run is not evidence of a new product regression, and it is
   not treated as one here.
   `[MEASURED]` dominant finding unchanged: `SWAP-NOT-REPLICATED` in every peer direction
   (HF-504), plus `FIRE-REFUSED-guestA` and `DAMAGE-HP-SPLIT-guestA` in this truncated run.
   **Follow-up lane:** `mp-swap-reload-relay` @ `a9b4b029` (Muse verdict SHIP-WITH-FIXES,
   F1/F2 outstanding) — **not in this pass**.
   `[OPEN]` **recommended:** re-run `qa:mp-soak` once on a quiet machine to get a completed
   run against PASS 94, so the override debt is carried on a comparable number.

`[OPEN]` `src/changelog.ts:111` still reads
`const pass94ReleasedAt = resolveProductionReleasedAt(PENDING_PRODUCTION_RELEASE)`. The publish
script did not rewrite it, and it was **not** edited by hand. The published bundle's own
identity guard is green (it calls itself PASS 94), so this is a changelog-timestamp follow-up,
not a mis-identified release.

---

## 6. Rollback

Unchanged and one command away — PASS 93 is pinned on gh-pages and serving (`http_code=200`):

    cd C:/Users/david/projects/aa-claude-release84
    python scripts/orchestration/publish_pass94.py --rollback   # re-points the default at PASS 93
