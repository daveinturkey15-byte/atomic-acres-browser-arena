# HF-419 lane report — study + skill, and the Map 3 experiment plan

**Lane:** AK-study (Claude Code, Opus 5.1, `dave-gaming-pc`), 2026-09-02 overnight sweep.
**Study:** `gta-style-city-art.md`, beside this file.
**Verdict:** source RESOLVED; skill landed at **v1.0.1**; **guard accept SUCCEEDED** — the
skill is in `skill-baseline.json` on `origin/main`; link verify clean 162/162 on all seven
harness roots; experiment plan ready to hand to the next agent. One **owner-only** block
remains (the vault remote, §3) and one **root-caused machine defect** is handed over with its
patch (the relinker race, §3). Repaired 2026-09-03 — see §6.

---

## 1. What was delivered

| Item | Path | State |
| --- | --- | --- |
| Source resolution | two public routes, no login | VERIFIED |
| Technique register row 47 | `C:/Users/david/AppData/Local/hermes/.akephalos/references/ai-3d-technique-register.md` | committed + pushed, read back from `origin/main` |
| Skill **v1.0.1** | `C:/Users/david/Documents/desky-bootstrap-clone/Skills/game-development/open-world-city-art-loop/SKILL.md` (**18,466 bytes**, sha256 `e1c7a3ce…`, description 325 chars, 8 `related_skills`) | committed locally, **remote push owner-blocked**, see §3 |
| Eval record | `C:/Users/david/AppData/Local/hermes/.akephalos/skill-evaluations/open-world-city-art-loop.json` | committed + pushed, read back |
| SkillScan | `scan` on the new skill | **SAFE** (task `64110911-203a-422e-9dfa-67e36d40f020`) |
| Flat-view link check | `_Scripts/link_skills.ps1 -VerifyOnly` | **162/162 across all seven harness roots**, read-through probe OK (re-verified 2026-09-03) |
| Relinker race gotcha | `C:/Users/david/AppData/Local/hermes/.akephalos/gotchas/skill-relinker-wholesale-rebuild-races-itself.md` | committed + pushed, read back from `origin/main` |
| Guard accept | `skill_regression_guard.py accept --skill open-world-city-art-loop` | **ACCEPTED** — baseline `description_sha256 a4d7002f…` matches the live file; re-run now reports `drift=0` and declines as already-accepted |
| Study | `docs/technique-studies/gta-style-city-art.md` | this branch |

Commits — AKP `origin/main` (all pushed and read back):

- `8414b3b` Register row 47 (HF-419 GTA-style city art) + open-world-city-art-loop eval record
- `612b413` HF-419: correct row 47 observation, re-accept open-world-city-art-loop v1.0.1
- `9f4fe0d` Gotcha: the skill relinker rebuilds all 162 junctions wholesale and races itself

Commits — vault (`desky-bootstrap`, local `master`, **remote push owner-blocked**, §3):

- `1693099` Skills: open-world-city-art-loop (HF-419 GTA-style city art)
- `4515da8` v1.0.1 correction

Commits — this branch (`contrib/dave-gaming-pc/claude/technique-study-gta-style-city-art`,
pushed and read back from origin):

- `0d3ae89e` study, lane report and the Map 3 experiment plan
- `b76f2c3f` correct the inert `PASS73_NATIVE_WEBGPU` instruction and note the pedestrians
- `85d794d8` timestamp the engagement sample and give HF-419 its own preview port

## 2. The three findings the owner should actually read

1. **HF-419 is not a new technique.** The post publishes no prompt, no repository, no
   tooling list and no pipeline — its only entity is a 31 s video. The method it demonstrates
   is the **gauntlet loop we registered five weeks ago** (rows 13 and 34, skill
   `visual-gauntlet-loop`). What is new is a *bar* for open-world street art, and the
   art-specific knowledge the loop does not carry. The skill says this in its first
   paragraph so no future agent re-invents a pipeline that was never published.
2. **The reference runs at 18–20 fps.** Its own HUD reads `151 ms · 20 fps` and
   `197 ms · 18 fps`. It is a screenshot-grade target. Any brief that asks us to "match this"
   without saying so will produce a loop that buys detail with frame rate.
3. **The look's overcast grade is a trap.** Near-white sky, no hard sun, almost no cast
   shadows, low saturation — cheap, and it hides weak procedural materials because there is
   no crisp specular to get wrong. It is also the exact opposite of the standing
   dynamic / coloured / time-of-day / weather lighting direction (and of HF-421). Take the
   surface detail and the street-furniture density; leave the grade. Otherwise the critic
   wins every A/B while deleting our art direction.

The transferable engineering content is the **screen-area ordering** — road surface first
(30–50% of frame), then pavement and kerb, then facade *bays*, then furniture *density*,
then trees, then traffic-as-scenery, then the near-free wayfinding text layer. That ordering
is where the loop's budget should go, and it is the opposite of the intuitive
hero-buildings-first order.

## 3. Blocked — one owner action, one handed-over machine defect

### 3.1 RESOLVED since first writing: the guard accept

The first version of this report said `skill_regression_guard.py accept` could not succeed for
any skill on this machine, because `run_check()` calls `description_problems(current, policy)`
**machine-wide and unscoped** before it applies the `--skill` scope, and three pre-existing
descriptions exceeded the 360-character policy maximum.

**That is fixed and the fix was made the right way.** A concurrent lane trimmed the three
offending descriptions — `gem-nano-agent-debug` 367→326, `wow-spp-local-mod-restore` 373→330,
`game-release-benchmark-guard` 377→330 — rather than raising the limit. Verified this pass:

- `skill-regression-policy.json` is still at its **original** commit `a35e56a`, with
  `max_chars: 360` and `warn_chars: 220` unchanged. **No gate was weakened to get green.**
- `open-world-city-art-loop` is recorded in `skill-baseline.json` on `origin/main` with
  `description_sha256 a4d7002f7196a5c21f9a7a96f6900726d5c6690faa7dcdca0983bd918acc3180`, which
  matches the live file's description byte-for-byte.
- Its eval record on `origin/main` carries `decision accept` and
  `candidate_sha256 e1c7a3ce04900355f67221906b8fde166bd747844742390d89b2a39e48eadbbc`, which
  equals `sha256sum` of the live 18,466-byte `SKILL.md`.
- Re-running the scoped `accept` now returns `PASS … drift=0` followed by
  `FAIL requested skills are not all drifted: ['open-world-city-art-loop']` — i.e. it declines
  because there is nothing left to accept. **That is the accepted end-state, not a failure.**
- An unscoped `check` still reports `problems=15 drift=13`. **None of them is this skill** —
  its only appearance is the allowed `WARN … (325 chars)`. That backlog is other lanes' skills
  landing concurrently tonight plus the store's standing debt.

### 3.2 BLOCKER, root-caused this pass: the relinker races itself and blinds five harnesses

`~/.agents/skills` intermittently enumerates **zero entries** while still existing. While it is
empty, five harness roots — Claude Code, Codex, OMP, dsh, Continue (and Antigravity via
`~/.gemini/config/skills`) — are all junctions **to that one directory**, so all of them
discover no skills at once. **Nothing errors and nothing is logged.** It heals unattended.

Seen three times on 2026-09-02 (21:33, ~21:50, 22:18–22:25, the last reproduced twice 12 s
apart). The earlier version of this report **retracted** the 21:33 sighting as unreproduced.
**That retraction was wrong and is withdrawn** — see §4.

**Root cause, established this pass rather than guessed at.**
`<vault>/_Scripts/link_skills.ps1` does not repair the flat view incrementally; its `Set-Link`
deletes and recreates **every** junction unconditionally, never checking whether the existing
one already points at the right target. Evidence: all 162 children of `~/.agents/skills` carry
the *identical* `CreationTime 2026-09-03 00:55:59`, matching the parent's `LastWriteTime` to the
second — a wholesale replacement, not a repair. The script takes **no mutex or lockfile** and
runs under `$ErrorActionPreference = 'Stop'`, so when two lanes relink at once, one's
`Get-Item`/`Delete()` lands on an entry the other just removed, the exception aborts it
**mid-rebuild**, and the view is left short or empty until some later run heals it.

Two things this rules out, both previously suspected:

- The **`Akephalos Passport Sync`** scheduled task does **not** touch skills. It runs
  `wscript → akp-sync-hidden.vbs → pythonw akp-sync-hidden.pyw`, which contains no reference to
  `link_skills` or `sync_skill_mirrors`. It is also **not paused**: `State Running`,
  `LastRunTime 2026-09-03 01:00:38`, `LastTaskResult 0`, repeating every 15 minutes. The
  register's standing open item that this cron "has been paused since 2026-08-10" is **stale**
  and should be corrected by whoever owns that row.
- Nothing is ever lost. The canonical store held all 162 skills through every occurrence.

**Not fixed here, deliberately.** `_Scripts/link_skills.ps1` is shared cross-harness state in
the vault; changing it changes behaviour for all seven harnesses at once with no review, which
is governed drift needing its own evaluation record. **Do not "fix" an empty view by rebuilding
again** — rebuilding is what opens the window, and two lanes each rebuilding can sustain the
outage. The exact patch is recorded in AKP
`gotchas/skill-relinker-wholesale-rebuild-races-itself.md` (commit `9f4fe0d`, on `origin/main`)
and is two changes to `Set-Link`:

```powershell
# 1. idempotence — leave an already-correct junction alone, so the steady-state run
#    deletes nothing and the empty window stops existing for the common case
if ($item.LinkType -and $item.Target -and
    (($item.Target | Select-Object -First 1).TrimEnd('\') -eq $Target.TrimEnd('\'))) {
    return
}
```

```powershell
# 2. mutual exclusion — close the genuine-change case
$mtx = New-Object System.Threading.Mutex($false, 'Global\desky-link-skills')
if (-not $mtx.WaitOne([TimeSpan]::FromMinutes(2))) { throw 'another relinker run holds the lock' }
try { <existing non-VerifyOnly block> } finally { $mtx.ReleaseMutex() }
```

Acceptance test: run the relinker twice and compare
`(Get-ChildItem ~/.agents/skills -Force).CreationTime`. After the fix the timestamps must **not**
all advance to the second run's clock — a run that resets all 162 is still tearing the view down.

### 3.3 OWNER ACTION ONLY: the vault remote

`git push origin master` → `403 remote: Write access to repository not granted` on
`daveinturkey15-byte/desky-bootstrap`. The branch was already 5 commits ahead before this lane
started and is now **13** as other lanes land skills behind the same wall. The skill is
committed locally and is live to every harness through the junctions (harnesses read the store,
not the remote), but **it is not backed up anywhere off this machine**, and neither is any other
lane's skill work tonight. No agent can resolve this: grant the credential write access, or push
from the account that owns the repo.

## 4. Notes on shared state and concurrency

- `references/ai-3d-technique-register.md` had **uncommitted rows 45 and 46** from the
  concurrent ComfyUI-3D and Water Pro lanes when I appended row 47. Git cannot stage part of
  a file non-interactively, so those rows rode along in commit `8414b3b`; the commit message
  says so, and their authors can keep amending on top. Between my commit and my push, the
  HF-420 lane committed `3776400` on top — both are on `origin/main`.
- **The earlier retraction is withdrawn.** This report previously retracted the 21:33
  sighting of `~/.agents/skills` enumerating 0 entries, on the grounds that it could not be
  reproduced. It was reproduced — twice, 12 s apart, at 22:18 and 22:20, with
  `link_skills.ps1 -VerifyOnly` reporting `DIFF 0/162` on five roots, `MISS` on OMP and a
  FAILED read-through probe — and it has now been **root-caused** (§3.2). Retracting a real
  defect because one reading did not reproduce was the wrong call: the correct response to an
  intermittent fault is to keep it open, not to withdraw it. Recording that here because the
  reasoning error matters more than the bug.
- No headed browser was launched. No performance measurement was taken, so the ComfyUI queue
  and `nvidia-smi` gates did not apply to this lane; the next agent's plan below opens with
  both.

---

# 5. EXPERIMENT PLAN — Map 3 corridor 3, "street cell" trial

**For the next agent. Sized for 2–3 hours of Opus work. Read
`open-world-city-art-loop` and `gta-style-city-art.md` first.**

## 5.1 Goal in one sentence

Add one **street cell** to Map 3 corridor 3 as a new rule set of the shape grammar that
already lives there, and prove with headless before/after captures that it raises street
realism **without** costing frame time, cold compile, readability or parity.

This is a Map-3-only trial. Nothing ships to another arena on the strength of it.

## 5.2 Setup and machine gates (do these first, in order)

1. `curl -s http://127.0.0.1:8188/queue` — if ComfyUI is generating, **all timings taken
   during that window are void**. Wait, or record the check and take the numbers later.
2. `nvidia-smi` — require **≥ 3000 MiB free** before any browser. If short, wait 60 s and
   retry, up to 10 times, then declare BLOCKED WITH EVIDENCE.
3. Worktree: `git worktree add -b contrib/dave-gaming-pc/claude/hf419-map3-street-cell
   C:/Users/david/projects/aa-claude-hf419-street-cell <integration head>`, plus a
   `node_modules` junction from the main worktree.
4. **`QA_PREVIEW_PORT=4219`** - reserved by **HF-419** itself (4200-4299 range; the earlier "(lane AK)" attribution was wrong and would have invited a real collision if Lane AK ran concurrently). Preview server, not the dev server — HMR kills long
   Playwright contexts (known gotcha). One browser at a time. Headless is not something you
   set: `scripts/qa/capture-map3-views.mjs` launches `headless: true` unconditionally and
   refuses to start below 3000 MiB of free VRAM on its own. Do **not** set
   `PASS73_NATIVE_WEBGPU=1` for this harness — it is read only by the `run-pass73-*` native
   gates and one test, and is inert here. Close the browser and stop the server before
   returning.
5. Prefix **every** command with `cd C:/Users/david/projects/aa-claude-hf419-street-cell &&`
   — the shell cwd resets between calls.

## 5.3 Baseline capture (do this BEFORE writing any art code)

```
node scripts/qa/capture-map3-views.mjs --out artifacts/hf419/before \
  --only corridor-3-grammar,hub-overview --port 4219
```

Also record, on the untouched build:

- cold compile / first-frame time for Map 3 (the arena's existing instrument);
- `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs` → must already be **0**; if it is not,
  stop and report — you cannot attribute a regression you started with;
- draw calls and triangle count from the HUD telemetry line in `before/hud.json`.

**A run with no `before/hud.json` is not an experiment.** Everything below compares to it.

## 5.4 The bar (freeze it before building)

Write `docs/evidence/pass86/hf419/BAR.md` naming, per sub-piece, what "better" means. The
bar must be something we may lawfully hold — **no shipped commercial game frames**. Use, in
order of preference: (a) our own reference photographs if any exist in the repo, (b) a
written scorecard, (c) the `before` capture itself as the floor. Record the choice and its
licence. Scorecard rows, one line each, inspectable in a still:

1. Does the road read as maintained asphalt with repair history, or as a flat grey plane?
2. Do kerb and pavement read as separate constructed elements at 5 m?
3. Do facade bays have real recess depth at 5 m (not just a value change)?
4. Is furniture density plausible for a city block (≥ 8 items per 40 m of kerb)?
5. Do parked vehicles sit ON the road, with contact darkening, not floating?
6. Is the street-name/wayfinding read available to the player?
7. **Is the player silhouette at least as findable against the new frontage as before?**

## 5.5 Build, in this order (this ordering is the technique)

Budget roughly 25 minutes per piece, each its own commit:

1. **Cell ground mesh** — carriageway + two kerbs + two pavements as ONE geometry with a
   single TSL material selected by a vertex attribute. Road detail: fBM aggregate,
   seeded cold-patch regions, tar seams as distance-to-line fields, crack network, worn lane
   paint. One draw call, one pipeline. Octaves step 3 → 1 beyond ~40 m.
2. **Facade rule set** — add `street-cell` to corridor 3's existing grammar rule sets
   (`src/map3/corridors.ts`): ground-floor bay, upper bay, string course, parapet, at street
   scale. Do not add a second generator.
3. **Two instanced furniture families** — `pole-family` (lamp, signal mast, sign blade) and
   `ground-family` (hydrant, bin, bollard, meter), seeded along the kerb line with
   `mulberry32(ownSeed)`.
4. **One instanced vehicle silhouette family** — parked flush to the kerb, per-instance
   colour, dark glass, emissive tail lamps, contact darkening. Scenery, not traffic AI.
5. **Wayfinding blade** using the project's existing procedural text route.

Contract, non-negotiable: NodeMaterial + TSL only; no imported mesh/image/font/LUT; no
`Math.random`; no per-frame allocation; grade untouched (this trial changes **surfaces**,
not the tone curve — leave the lighting to HF-421); nothing created during combat.

## 5.6 The loop

Two rounds maximum, wall-clock capped at 45 minutes total. Per round: capture, hand the
critic the **PNGs and `hud.json` together**, blind A/B against the bar, take the single
biggest gap, fix it. A critic that proposes a new material family, a widened fence or an
out-of-bounds grade value is refused in writing — record the refusal, do not comply.

## 5.7 Measure (after capture, and never during a ComfyUI run)

```
node scripts/qa/capture-map3-views.mjs --out artifacts/hf419/after \
  --only corridor-3-grammar,hub-overview --port 4219
node scripts/qa/probe-pipeline-compile-stalls-cdp.mjs   # must read 0
npx tsx scripts/qa/audit-collider-visual-parity.ts
npx tsx scripts/qa/audit-walkable-surface-parity.ts
```

Plus `npx tsc --noEmit`, the focused Map 3 / art-direction vitest files only (**never** the
full suite — the machine is shared), and one `npm run build` at most.

## 5.8 Pass / fail bar

**PASS requires all of:**

| # | Gate | Bar |
| --- | --- | --- |
| 1 | Pipeline tripwire | **0** in-combat pipeline creations (hard) |
| 2 | Frame time | median frame time in `after/hud.json` within **+5%** of `before` on the same views, same session, ComfyUI idle |
| 3 | Cold compile | delta **≤ 0** against the arena's admission fence; fence not widened |
| 4 | Draw calls | **+12 or fewer** for the whole cell |
| 5 | Triangles | **+60k or fewer** |
| 6 | New pipelines | **≤ 4**, all created at arena construction |
| 7 | Parity | collider/visual and walkable-surface audits both clean; **zero new invisible walls** |
| 8 | Readability | player-silhouette findability against the new frontage no worse than `before` — measured, not asserted |
| 9 | Scorecard | ≥ 5 of the 7 rows in §5.4 improved, **none regressed** |
| 10 | Contract | tsc 0; focused tests green; no `ShaderMaterial`/`onBeforeCompile`; no imported asset; no `Math.random`; grade inside `ART_DIRECTION_SAFETY_BOUNDS` |

**FAIL is a real outcome and is reported as one.** If gate 2 or 3 fails, the honest result is
"the density is not affordable on our stack at this budget" — that answers the owner's
question and is worth more than a widened fence. Do not chase green by loosening anything.

**Deliverables:** `docs/evidence/pass86/hf419/` with `BAR.md`, before/after PNGs (halve any
over 600 KB), `hud.json` for both (gzip over 400 KB), the tripwire and parity outputs, and a
`RESULT.md` with the gate table filled in and each claim marked VERIFIED / CLAIMED / OPEN.
Never force-add `artifacts/` — it is git-ignored.

## 5.9 Out of scope for this trial

Moving traffic AI, pedestrians, a road-graph generator, night or wet variants, any second
arena, and any change to the tone curve or lighting model (that is HF-421's lane). If the
trial passes, the *next* decision is whether a street cell earns a place in Nuke Town's art
pass — not an automatic rollout.

---

## 6. Repair pass — 2026-09-03

Ran against the independent skeptic's findings. Every blocker and major is closed or handed
over with a patch; both cheap minors are fixed.

| # | Finding | Severity | Outcome |
| --- | --- | --- | --- |
| 1 | `~/.agents/skills` flaps empty, blinding five harnesses | **blocker** | **Root-caused**, not merely re-observed: wholesale non-atomic rebuild + no mutex + fail-stop. Evidence and the two-part patch committed as AKP gotcha `9f4fe0d`, pushed. **Not applied** — shared cross-harness state, needs its own eval record (§3.2) |
| 2 | Corrected study docs uncommitted; origin served the pre-correction text | **major** | Committed `b76f2c3f` and pushed; branch 0 ahead / 0 behind origin, both files read back from origin |
| 3 | Plan told the next agent to set the inert `PASS73_NATIVE_WEBGPU=1` | **major** | Struck and replaced (§5.2 gate 4): the capture harness is `headless: true` unconditionally and self-gates on ≥ 3000 MiB free VRAM. Landed in `b76f2c3f` |
| 4 | `QA_PREVIEW_PORT=4219` mis-attributed to "(lane AK)" | minor | Re-labelled as HF-419's own reserved port, `85d794d8` |
| 5 | Engagement figures could read as stable | minor | Row now carries the read timestamp and a re-resolution (167,813 / 1,610 / 229 at 2026-09-03 01:05 UTC), `85d794d8`. *Note: this lives in the study doc — register row 47 never carried engagement figures, so no register edit was needed* |
| 6 | Vault remote unpushable (403) | minor | Confirmed still failing, now 13 commits ahead. **Owner action only** (§3.3) |
| 7 | Stale byte count / sha / `related_skills` count / commit list / "guard BLOCKED" | — | All corrected in the header, §1 and §3.1 against the live v1.0.1 file |

**Re-verification run this pass**

- `skill_regression_guard.py accept --skill open-world-city-art-loop` → `PASS … drift=0`, then
  declines as already-accepted. Baseline `description_sha256` matches the live file; eval record
  `candidate_sha256` matches `sha256sum` of the live 18,466-byte `SKILL.md`. Policy file
  untouched at its original commit `a35e56a` — **no gate weakened**.
- `link_skills.ps1 -VerifyOnly` → `OK 162/162 (junction)` on **all seven** harness roots,
  read-through probe **OK**; `~/.claude/skills/open-world-city-art-loop/SKILL.md` resolves.
- Source re-resolved with **no login**: `api.fxtwitter.com` HTTP 200, 6310 bytes.
- AKP working tree left clean **on this lane's paths**; the three files dirty there
  (`skill-baseline.json`, two other eval records) belong to concurrent lanes and were not
  touched.

**Still open for the integrator:** the relinker patch (§3.2), the vault remote (§3.3), and the
stale register open-item claiming the `akephalos-sync` cron is paused — it runs every 15 minutes
with `LastTaskResult 0` and does not touch skills at all.
