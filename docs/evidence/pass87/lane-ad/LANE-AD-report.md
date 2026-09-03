# Lane AD — Release CI fix (the production workflow must run green on the PASS 86 line)

Worktree `C:/Users/david/projects/aa-claude-releaseci`, branch
`contrib/dave-gaming-pc/claude/release-ci-fix`, based on integration head `d329628d`.
Every row carries a claim-state: **VERIFIED** (I ran/measured it), **CLAIMED**, **OPEN**.

---

## 1. What the workflow did before this lane

**VERIFIED** by reading `.github/workflows/release-production.yml` at `d329628d` and by running
its steps locally against a real build:

- It built the candidate, ran the acceptance gate and static gates, rebuilt the pinned
  Pass 67.1 and Pass 63 subtrees, then ran `npm run stage:release-topology` and
  `npm run verify:release-topology`, then **published** with
  `npm run deploy:ci` (= `gh-pages -d dist`, which **replaces** the branch contents), waited
  on the Pages build, ran a live smoke and wrote a schema-3 production receipt.
- The topology it staged was the pre-PASS-80 six-tree world:
  `the-big-one`, `pass72-retained`, `pass70-retained`, `pass69-retained`, `recent-stable`,
  `pass63-rollback`. Live gh-pages carries exactly two trees under HF-400.
- **VERIFIED consequence 1 (it could not finish):** with a real `npm run build` staged,
  `npm run verify:release-topology` exits **1** with
  `Error: Root chooser is missing live PASS 86`
  (`scripts/qa/verify-release-topology.mjs:79`, which compared
  `publicConfig.experimental.path` against the literal `'channels/the-big-one'`).
  Evidence: `artifacts/lane-ad/before-verify.log`.
- **VERIFIED consequence 2 (what it would have done if that literal were merely patched):**
  `npm run stage:release-topology` produces
  `dist/channels/{pass63-rollback, pass69-retained, pass70-retained, pass72-retained, pass86, recent-stable}`
  (`artifacts/lane-ad/before-stage.log`). Publishing that tree over gh-pages with a
  non-`--add` deploy deletes the pinned **PASS 85 safe backup** and resurrects six retired
  trees on the live site — the exact policy inversion Lane F flagged in PASS 84.
- **VERIFIED live state:** `git ls-tree -d --name-only origin/gh-pages channels/` returns
  exactly `channels/pass85`, `channels/pass86`.

Three more hardcoded channel identities were found in the same class:
`scripts/qa/verify-release-topology.mjs` (staged-directory set, live provenance channel id)
and `scripts/qa/verify-release-topology-browser.mjs` (live provenance channel, the default
`expectedPath` of `verifyLegacyRoute`, the `verifyChoice` calls including a hardcoded
`'pass73'` changelog id). **VERIFIED** by grep and by the failing run above.

---

## 2. What the workflow does now

`.github/workflows/release-production.yml` is now **`release-verification`** and **publishes
nothing** (the brief's blessed "simplest acceptable outcome", chosen deliberately — see §5).

- Kept: checkout, `pipeline-guard release`, candidate build, acceptance manifest,
  `verify:pass25a:core`, the production timestamp, production bytes, `verify:release-tree`,
  the pinned Pass 67.1 / Pass 63 rebuilds, `verify:benchmark --verify-git`,
  `stage:release-topology`, `verify:release-topology`, the browser topology verifier, and the
  evidence upload.
- Added: **`Verify the HF-400 two-channel release policy`** — fetches `origin/gh-pages`, runs
  `scripts/release/verify-two-channel-policy.mjs --json artifacts/pipeline/two-channel-policy.json`,
  then `node --test scripts/release/release-policy-contract.test.mjs` and
  `node --test scripts/orchestration/publish-sibling-drift.test.mjs`.
- Removed: `Publish complete exact dist snapshot`, `Configure authenticated Pages remote`,
  `Configure release commit identity`, `Wait for exact Pages build`, `Verify canonical live
  release`, and the schema-3 production receipt step.
- `permissions:` is now `contents: read`. The job has **no write path to any branch at all** —
  the permission is the guard, not just the absence of a step.
- A header comment names the only publisher:
  `python scripts/orchestration/publish_pass<N>.py` (`--dry-run` first, `--rollback` to
  re-point the default) and `scripts/orchestration/roll_pass.py` for the stamp roll.
- Receipt: **NEW** `scripts/release/write-verification-receipt.mjs`, which states
  `published: false`, carries `publishCommand`, and refuses to write unless the two-channel
  policy result says `ok`. `write-production-receipt.mjs` is untouched and still demands a
  Pages build plus post-Pages live smoke — which is exactly why it cannot be reused by a
  verification-only job.

**VERIFIED AFTER**, same staged tree:
`npm run verify:release-topology` → exit **0**,
`{"releaseTopology":"verified","previousFiles":516,"retainedFiles":516,"historicalFiles":516,"stableFiles":509,"experimentalAssets":44}`
(`artifacts/lane-ad/after-verify.log`, and re-confirmed after the staging-description change).

---

## 3. The contract tests

### `scripts/release/release-policy-contract.test.mjs` — **VERIFIED 6/6 green**
Two detectors, both self-tested **red** before being pointed at the repository:

1. **hardcoded channel path.** Flags any quoted `channels/<id>` literal in an owned release
   source that is either unknown to `release-channels.json` or equal to the *live* channel
   path (which moves every pass and must always be read from `experimental.path`). YAML is
   scanned unquoted as well, since it has no regex literals. Red self-tests prove it flags
   the live path and an unknown tree, ignores a validation regex and a derived read, and
   flags a bare path in YAML. Applied to
   `stage-release-topology.mjs`, `verify-release-topology.mjs`,
   `verify-release-topology-browser.mjs`, `release-production.yml`.
2. **HF-400 two-channel policy.** Red self-tests cover nine distinct violations, including
   the exact six-tree gh-pages state this lane exists for, three-tree gh-pages, a missing
   backup, a non-adjacent backup, two backup keys, a missing publish script, and three ways
   the publish script's own declarations can disagree with the config.

Plus green assertions: the repository satisfies the policy; the workflow contains none of
`deploy:ci`, `gh-pages -d`, `git remote set-url`, `x-access-token`, `pages/builds/latest`,
`contents: write`; and it names the Python publish path.

### `scripts/release/verify-two-channel-policy.mjs` — the guard itself
Derives the live pass from `experimental.path`, requires exactly one `pass<N>Backup` key
whose pass is the **immediate predecessor**, requires
`scripts/orchestration/publish_pass<N>.py` to declare the matching
`LIVE_TREE` / `BACKUP_TREE` / `EXPECTED_POST_STATE` / `KEEP_AT_LEAST`, and — when
`origin/gh-pages` is reachable — requires the branch to carry at most two `pass<N>` trees,
including the pinned backup. If gh-pages is unreachable it **warns and says the check did not
run**; it never reports that as a pass.

**VERIFIED against the live branch:**
`{"twoChannelPolicy":"ok","live":"pass86","backup":"pass85","livePagesChannels":["pass85","pass86"]}`

### `scripts/orchestration/publish-sibling-drift.test.mjs` — **VERIFIED 4/4 green**
See §5. Asserts `publish_pass<N>.py` is exactly `roll_pass.py`'s number-roll of
`publish_pass<N-1>.py` apart from the two blocks `roll_pass.py` rewrites.

---

## 4. `tests/e2e/release-channel-chooser.spec.ts`

**VERIFIED BEFORE (worse than red — it ran zero tests):**
`npm run qa:playwright-topology -- tests/e2e/release-channel-chooser.spec.ts` exits **1** with

```
SyntaxError: Cannot use 'import.meta' outside a module
   at release-channel-chooser.spec.ts:5   import { CHANGELOG } from '../../src/changelog';
Error: No tests found.
```

`src/changelog.ts` reads `import.meta.env.VITE_RELEASED_AT`; Playwright transforms a spec's
transitive imports as CommonJS, so the whole file failed at collection. It is the only e2e
spec that imports `src/changelog`. Evidence: `artifacts/lane-ad/before-e2e-chooser.log`.

Fixed in-file (no config change): the same two changelog fields are pinned against the same
source file, read as text so the module is never evaluated. Also removed two stale literals
that would have failed once the file could load — the card count was the literal `4` while
the staging step has produced **five** cards since the Pass 63 rollback returned under the
`stable` key, and `stable` was asserted absent. Both are now derived from the channel list
the served chooser actually draws from (`window.__ATOMIC_ACRES_RELEASE_CHANNELS__`): one card
per served channel, no card without a channel, each card carrying its configured pass —
strictly stronger than a literal count. Route assertions read their paths from
`release-channels.json`.

Two further stale literals surfaced once the file could load (first post-fix run: 3 passed,
2 failed, `artifacts/lane-ad/after-e2e-chooser.log`):

- `getByText('Ctrl+Shift+R')` — **VERIFIED** that string is nowhere in `release-shell/`
  (grep: 0 hits). The copy now reads *"VERSION NOT UPDATED? … It is here as a last resort"* —
  the shell deliberately stopped showing the keystroke. Re-pinned against the copy it ships.
- The runtime assertions (`#menu`, `.command-brand span`) on the **current** pass. **VERIFIED
  cause from the failure's own page snapshot:** headless Chromium on this machine reports
  `navigator.gpu: present`, `requestAdapter(...): null` for all three hints, and
  `WebGL2 UNMASKED_RENDERER_WEBGL: ANGLE (… SwiftShader …)` — a software rasteriser. The
  current pass fails closed without a WebGPU adapter by design, so the page served is
  "GAMEPLAY RENDERER BLOCKED", which has no `#menu` and no `.command-brand`. That is
  **BLOCKED WITH EVIDENCE**, not a failure of the code under test. (The retained channels
  boot without an adapter, which is why their runtime badges pass here unconditionally.)

Those assertions are now behind a real `navigator.gpu.requestAdapter()` probe and print a
BLOCKED line naming exactly what could not be checked — never a silent skip — and each of
those tests gained a **new, unconditional** routing assertion in their place: the alias must
land inside `experimental.path` *and* that channel's `channel-provenance.json` must declare
the stamped pass.

**VERIFIED AFTER:** `5 passed (18.3s)`, exit **0**, headless chromium, with four BLOCKED
lines printed. `artifacts/lane-ad/after2-e2e-chooser.log`.

---

## 5. The shared publish module — **NOT DONE, deliberately. OPEN.**

Brief item 3 asked for the 913-line `publish_pass<N>.py` siblings to be collapsed into one
shared module parameterised by pass and backup, with the sibling becoming a thin config.
**I did not land that, and I recommend it is not landed before the PASS 87 cut.** Reasons,
all **VERIFIED**:

- `scripts/orchestration/roll_pass.py` (landed at `d329628d`, hours ago) generates the next
  sibling by textually rolling this exact file. The 05:10 PASS 87 cut uses it. A thin-config
  refactor breaks `roll_pass.py` in the same change.
- `src/release-topology.test.ts` source-pins roughly sixty exact strings inside the live
  publish script, **including a differential comparison of the build-freshness guard's
  exclusion set against the previous sibling** — which only has meaning while both are
  copies. Moving the guard into a shared module deletes that check.
- `publish_pass86_plan.test.mjs` drives the real script; it is 9/9 green today.

Rewriting the only publisher hours before it must publish is the wrong trade, and doing it
would have meant rewriting the very tests that protect it — the shape the repo contract calls
weakening a gate.

**What I landed instead, which closes the actual failure mode.** The duplication never caused
a bug by itself; *divergence between the copies* did. The ledger records it: the pass86 copy
of the freshness guard once quietly gained an `artifacts` entry in its skip list under a
commit line saying the guard was unchanged, and a human skeptic caught it.
`publish-sibling-drift.test.mjs` makes that mechanical — it ports `roll_pass.py`'s
`roll_numbers` and requires `publish_pass<N>.py` to be **exactly** the roll of
`publish_pass<N-1>.py` apart from `DESCRIPTION` and the `dist-pass*` exclusion list, naming
any other differing line. Self-tested red on the real incident and on a deleted guard.

**VERIFIED:** the check is green on the shipped pair — `publish_pass86.py` is byte-for-byte
the roll of `publish_pass85.py`. It then immediately caught a real stale reference: both
siblings cited `scripts/orchestration/publish_pass84_plan.test.mjs`, two passes out of date,
because `roll_pass.py`'s `\b` cannot match between a digit and an underscore and so could
never correct it. Both scripts and both plan tests now say `publish_pass<N>_plan.test.mjs`,
which no roll can stale.

**Dry-run against gh-pages (VERIFIED, read-only).** Extracted `origin/gh-pages` with
`git archive` into a scratch directory (no worktree, no branch touched) and ran
`python scripts/orchestration/publish_pass86.py --dry-run --gh-pages-dir <copy>`:

```
channel trees on gh-pages now: ['pass85', 'pass86']
would keep   ['channels/pass85/']
would write channels/pass86/ <- dist-pass86/
channels/ post-state would be: ['pass85', 'pass86']
chooser keys: experimental -> PASS 86 / channels/pass86; previous -> PASS 85 SAFE BACKUP
predecessor guard: OK      in-build fallback guard: OK (pass85Backup -> channels/pass85)
generation cb0967af4030 (the generation the PASS 86 publish record names)
DRY RUN: publish WOULD REFUSE (1 guard(s) red: build-present)
```

Exit 2 with `build-present` red is correct: this lane worktree has no `dist-pass86`. The
guard is doing its job. Full log: `artifacts/lane-ad/publish86-dryrun.log`.

---

## 6. Commits (branch `contrib/dave-gaming-pc/claude/release-ci-fix`)

| SHA | Subject |
|---|---|
| `02a5fdd6` | fix(release-ci): topology verifiers derive every channel path; the workflow verifies and never publishes |
| `d34d2724` | test(release): publish_pass<N>.py must be its predecessor with the numbers rolled, and nothing else |
| `cbf85627` | test(e2e): the release-channel chooser spec runs again, and counts cards from the served config |
| (branch tip) | evidence(lane-ad): before/after logs and the lane report for the release-CI fix |

Files changed: `.github/workflows/release-production.yml`, `package.json`,
`scripts/qa/verify-release-topology.mjs`, `scripts/qa/verify-release-topology-browser.mjs`,
`scripts/release/stage-release-topology.mjs`,
`scripts/release/verify-two-channel-policy.mjs` (new),
`scripts/release/release-policy-contract.test.mjs` (new),
`scripts/release/write-verification-receipt.mjs` (new),
`scripts/orchestration/publish-sibling-drift.test.mjs` (new),
`scripts/orchestration/publish_pass85.py`, `scripts/orchestration/publish_pass86.py`,
`scripts/orchestration/publish_pass85_plan.test.mjs`,
`scripts/orchestration/publish_pass86_plan.test.mjs`, `src/release-pipeline.test.ts`,
`tests/e2e/release-channel-chooser.spec.ts`, `docs/evidence/pass87/lane-ad/*`.

## 6b. Test results on the branch head

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **0** (VERIFIED, run twice: after the script/workflow changes and again after the spec changes) |
| `vitest run src/release-pipeline.test.ts src/release-topology.test.ts src/production-receipt.test.ts src/release-channel.test.ts src/release-shell-chooser.test.ts src/changelog.test.ts src/release-change-impact.test.ts src/release-benchmark.test.ts` | **87/87 passed** (VERIFIED) |
| `node --test scripts/release/release-policy-contract.test.mjs` | **6/6** (VERIFIED) |
| `node --test scripts/orchestration/publish-sibling-drift.test.mjs` | **4/4** (VERIFIED) |
| `node --test scripts/orchestration/publish_pass86_plan.test.mjs` | **9/9** (VERIFIED, re-run after the docstring change) |
| `npm run stage:release-topology` + `npm run verify:release-topology` | **exit 0**, was exit 1 (VERIFIED) |
| `node scripts/release/verify-two-channel-policy.mjs` against live `origin/gh-pages` | **ok**, `live pass86 / backup pass85 / gh-pages ["pass85","pass86"]` (VERIFIED) |
| `publish_pass86.py --dry-run --gh-pages-dir <read-only gh-pages copy>` | plan = exactly `{pass85, pass86}`; refuses on `build-present` only (VERIFIED) |
| `qa:playwright-topology -- tests/e2e/release-channel-chooser.spec.ts` | **5 passed, exit 0**; was exit 1 / "No tests found" (VERIFIED) |
| `npm run lint` | **RED, pre-existing, not mine** — see §7b |
| Merge probe against integration head `fca026fc` | **clean** (VERIFIED: `git merge-tree --write-tree` exit 0, tree `571f24cd`). Integration changed **none** of this lane's files between `d329628d` and `fca026fc` (VERIFIED: empty `git diff --stat` over every path touched here). |
| Workflow YAML machine-parsed | **NOT DONE** — no `yaml`/`js-yaml` is installed in this checkout or in `node_modules`. Structurally checked instead: 0 tabs, 5 top-level keys, 18 steps all at the same indent, and the file is the previous (valid) document with whole steps removed and names/comments edited. **CLAIMED**, not VERIFIED. |

---

## 7. Outside-ownership patches — NOT APPLIED, for the integrator

Docs are not in this lane's ownership. Both of these describe a workflow that no longer
publishes and will read false the moment this branch merges.

### `AGENTS.md`, "Integration and production" section

Replace these three bullets:

```
- Production promotion is serialized by `.github/workflows/release-production.yml`. Supply the exact green `main` SHA and release pass; never deploy from a feature branch or local dirty tree.
- Do not describe a change as live until the workflow receipt names the source SHA and Pages SHA and the canonical HTTPS site is checked.
- The production workflow must revalidate the acceptance manifest and pass its post-Pages canonical live smoke before writing a successful receipt.
```

with:

```
- Release VERIFICATION is serialized by `.github/workflows/release-production.yml` (job `release-verification`). Supply the exact green `main` SHA and release pass; it builds, revalidates the acceptance manifest, runs the static gates, stages and verifies the whole channel topology, checks the HF-400 two-channel policy and writes a `published: false` receipt. It has `contents: read` and cannot publish.
- Production PUBLICATION is `python scripts/orchestration/publish_pass<N>.py` from the canonical checkout, and nothing else. Run `--dry-run` first; `--rollback` re-points the default without deleting a tree. `scripts/orchestration/roll_pass.py` rolls the stamp to the next pass. Never deploy from a feature branch or local dirty tree, and never run `npm run deploy` or `npm run deploy:ci`.
- Do not describe a change as live until the publish script's asserted post-state and the canonical HTTPS site both name the new pass, and gh-pages carries exactly the live pass and its pinned safe backup (HF-400).
```

### `docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md`, "Release-owner flow"

- Line 93: `Only the `release-production` GitHub Actions workflow may publish production.` →
  `Only `scripts/orchestration/publish_pass<N>.py`, run from the canonical checkout, may publish production. The `release-production` workflow verifies a candidate and cannot publish.`
- Step 3 (`Dispatch `release-production` with the exact full `main` SHA and release pass.`) →
  `Dispatch `release-production` with the exact full `main` SHA and release pass to produce the verification receipt, then publish with `python scripts/orchestration/publish_pass<N>.py` (dry-run first).`
- Steps 4–7 describe Pages serialization and the post-Pages live smoke; those now belong to
  the publish script's post-state assertion and the manual live check.

---

## 7b. A SECOND, independent reason the workflow cannot be green — **VERIFIED, not mine to fix**

`npm run lint` on `d329628d` is **RED**, before any change of mine:

```
npm run qa:text-integrity
{"ok": false, "checked": 2436, "failures": [
  "docs/evidence/pass84/farcrysis-load/qa/farcrysis-load/tsc-3.log.txt: is unexpectedly empty",
  "docs/evidence/pass84/farcrysis-load/qa/farcrysis-load/tsc-repair2.log.txt: is unexpectedly empty"]}
```

**VERIFIED pre-existing:** both files are zero bytes at `d329628d`
(`git show d329628d:<path> | wc -c` → 0), committed by `6b94915c`
"evidence(farcrysis-load): keep the 23 probe/tsc/boot-smoke logs as .log.txt". Their siblings
`tsc-1.log.txt` and `tsc-2.log.txt` contain the 11-byte marker `TSC EXIT 0`, so the capture
for these two dropped its output.

`lint` is inside `verify:pass25a:core`, which is the workflow's **Reproduce static release
gates** step — so the release job fails there too, on any branch, until this is fixed.

**Not fixed here, and deliberately not faked.** Writing `TSC EXIT 0` into them would be
manufacturing evidence for runs I did not observe. The owning lane (Lane C, farcrysis-load)
must restore the real captured output, or remove the two files and say so in its report. The
gate must not be relaxed — an empty evidence file is exactly what it is there to catch.

## 8. Open / not-mine

- **OPEN (large, outside this lane):** roughly forty QA scripts and e2e specs still hardcode
  `/channels/the-big-one/` as the *served candidate route* — `scripts/qa/pass66-*`,
  `pass69-3-*`, `pass70-*`, `pass73-*`, `tests/e2e/pass64-renderer-foundation.spec.ts`,
  `pass64-railgun.spec.ts`, `pass70-weapon-contact-scope.spec.ts`, `pass66-e2e-support.ts`
  and others. **VERIFIED** by grep; the staging step has placed the candidate at
  `channels/pass<N>` since the pass80 cut, so every one of those routes 404s or falls through
  the SPA fallback. Same defect class as this lane's, one layer out. Worth a dedicated lane;
  the fix is a single shared helper reading `experimental.path`.
- **OPEN (hazard, left in place):** `npm run deploy:ci` (`gh-pages -d dist`) still exists in
  `package.json`. Nothing calls it now, `AGENTS.md` forbids running it, and the contract test
  keeps it from ever gaining `--add`; but a hand run from any worktree would still replace
  gh-pages. Removing it is a one-line change I did not make unilaterally because other
  tooling may reference the script name.
- **OPEN:** brief item 3's shared publish module (§5), with the drift guard as the interim.
- **CLAIMED, not re-measured:** everything in the PASS 84/85/86 ledgers I read for context.

## Machine discipline

No headed browser was launched. The only browser run is Playwright chromium **headless**
(`headless: undefined` in `playwright.config.ts` → Playwright's headless default; no
`PASS73_NATIVE_WEBGPU`, no `QA_HEADED`). GPU headroom was checked before it
(`nvidia-smi`: waited for ≥3000 MiB free, proceeded at 4961 MiB free) and ComfyUI's queue was
confirmed empty (`http://127.0.0.1:8188/queue` → `{"queue_running": [], "queue_pending": []}`).
No process I did not start was killed. No server was left running. gh-pages was read via
`git archive` only — no worktree, no branch write, nothing published.

---

# REPAIR PASS (skeptic verdict ACCEPT_WITH_FIXES), 2026-09-03 03:05–03:30 BST

Four commits: `b1d7e3d8`, `dae229f2`, `224d4b69`, `c43981f7`.

## MAJOR 1 — the channel-path detector had a hole in its own defect class. FIXED.

`allowed` was every `channels/<id>` string anywhere in `release-channels.json`, and that file
also records where channels USED to live. Measured before the repair (the skeptic's two
probes, reproduced): a stale live literal one pass after the stamp moves returned `[]`
(the outgoing path is parked in `pass<N>Backup.path`), and `channels/the-big-one` against
today's config returned `[]` (it survives three times as a historical `pagesPath`).

`allowed` is now built by SUBTRACTION: the `path` of every channel that is neither
`experimental` nor a `pass<N>Backup` — measured as
`[channels/pass72-retained, channels/pass70-retained, channels/pass69-retained,
channels/recent-stable, channels/pass63-rollback]`. Literals are extracted by a scanner over
real string literals (comments and regex literals no longer count; a path inside a longer
route literal now does). One contextual exemption: a literal compared against a recorded
`.pagesPath` field, which pins an immutable historical Pages location and can never be a
route — the same value against `.path` is still flagged, asserted red.

Mutation-proven against the real sources: reintroducing `'channels/the-big-one'` or
`'channels/pass86'` into `scripts/qa/verify-release-topology.mjs` is flagged; the five owned
sources (now including `tests/e2e/release-channel-chooser.spec.ts`) return `[]`.
`node --test scripts/release/release-policy-contract.test.mjs` → 6/6.

## MAJOR 2 — three repository documents still say the workflow publishes. NOT FIXED HERE.

Outside this lane's ownership. `AGENTS.md:84`, `docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md:93`
and `README.md:118`+`:122`. The exact patches for all three are in the lane report's
`outsideOwnershipPatches` (the README one is new in this repair). The workflow change must
not merge without them.

## MAJOR 3 — the WebGPU guard was green-with-nothing-checked. FIXED, AND THE GAP CLOSED.

Every block now pushes a `blocked` annotation into `testInfo.annotations`, and the absence
THROWS under `REQUIRE_WEBGPU_ADAPTER=1` or `PASS73_NATIVE_WEBGPU=1` (that run launches
installed Chrome headless precisely because it acquires a real adapter).

Then the assertions were actually measured. `PASS73_NATIVE_WEBGPU=1
npm run qa:playwright-topology -- tests/e2e/release-channel-chooser.spec.ts
--project=chromium --workers=1 --retries=0` → **5 passed, exit 0, 9.0 s, ZERO BLOCKED lines**
(`docs/evidence/pass87/lane-ad/after4-e2e-chooser-native-webgpu.log.txt`). The live channel's
runtime badge, the changelog head and the three legacy-alias badges are therefore measured on
this machine, not assumed. Headless, no window, GPU 12.3 GiB free, ComfyUI queue empty.

## MINORS

- **YAML never parsed → PARSED.** `yaml@2.9.0` (read-only `require` of a copy already installed
  elsewhere on this machine; none exists in this checkout, and python has no `yaml`):
  0 errors, 0 warnings, 5 top-level keys, `name: release-verification`, `permissions` all
  read, one job `verify`, 18 steps. `docs/evidence/pass87/lane-ad/yaml-parse.log.txt`.
- **HF-400 guard degraded to green when git failed → FAILS.** In a checkout without
  `origin/gh-pages` the CLI now exits 1 saying the live half did not run;
  `TWO_CHANNEL_POLICY_SKIP_GIT=1` still exits 0 (skipping is opt-in). Unchanged where the
  ref exists.
- **Self-referential card count → pinned to the config.** The expected key set is derived from
  `release-channels.json` and from what `stage-release-topology.mjs` stages under each key
  (`experimental, previous, retained, historical`, plus `stable` exactly when the config
  carries the Pass 63 rollback), asserted as set equality, and each card's `path`/`pass` is
  pinned to that channel's configured values.
- **`write-production-receipt.mjs` uncallable → documented dormant**, with why it is kept
  (it is the schema-3 PUBLISHED receipt) and what would call it.
- **Brief item 3 — still OPEN**, unchanged, for the reasons the skeptic verified.

## NEW FINDING — the sibling-drift contract would have failed the PASS 87 cut. FIXED.

Not in the verdict; found while checking the merge. The integration head `87924955` carries
Lane R's HF-423 change to `publish_pass86.py` (the farcrysis flag check replaced by a
receipt-backed admission guard). Measured on the merged tree: the shipped contract reported
**1066 drifting lines**, of which 239 were real — the rest an offset cascade from an
index-by-index comparison. The release workflow runs this test, so the merge would have gone
red with a thousand lines of noise on the night of a cut.

The diff is a real LCS diff now (an insertion reports once), and the invariant is the failure
mode rather than whole-file equality — which is not an invariant of this repository, because
`roll_pass.py` builds the next sibling by copying the live script, so the live script is also
the template and a guard that must change at the next cut has nowhere else to live. Three
checks, each red-tested, that survive a deliberate template edit:
the freshness guard's skip set may only GAIN `dist-pass<N>`; no named guard may vanish without
a declared, present successor (`DECLARED_GUARD_REPLACEMENTS`: farcrysis-unselectable →
farcrysis-admission), with a commented-out `run_guard` reading as removed; and the refusal
count may not fall (85: 22, 86: 22, merged: 30). The full diff is still printed, and >400
lines still fails.

Measured on the merged tree (`git merge-tree` HEAD × `87924955`):
`publish-sibling-drift.test.mjs` 7/7 and `release-policy-contract.test.mjs` 6/6, with the
192-line declared-work diff printed for the cut operator.

## Repair-pass test results

`npx tsc --noEmit` exit 0 · focused vitest 10 files 135/135 · `node --test` on both contract
suites 13/13 · `publish_pass86_plan.test.mjs` 9/9 · HF-400 guard against the live branch
`{"twoChannelPolicy":"ok","live":"pass86","backup":"pass85","livePagesChannels":["pass85","pass86"]}`
· chooser spec 5/5 headless (BLOCKED lines) and 5/5 with a real adapter (no BLOCKED lines).
Machine: no headed browser at any point, GPU checked before each run, ComfyUI queue empty
both times, no process killed, nothing left listening on 4173/4174, no Playwright temp tree
left behind, gh-pages read-only.
