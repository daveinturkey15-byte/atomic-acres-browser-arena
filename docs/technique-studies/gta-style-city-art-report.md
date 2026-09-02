# HF-419 lane report — study + skill, and the Map 3 experiment plan

**Lane:** AK-study (Claude Code, Opus 5.1, `dave-gaming-pc`), 2026-09-02 overnight sweep.
**Study:** `gta-style-city-art.md`, beside this file.
**Verdict:** source RESOLVED; skill landed; **guard accept BLOCKED by pre-existing drift**
(one owner/integrator decision, detailed in §3); experiment plan ready to hand to the next
agent.

---

## 1. What was delivered

| Item | Path | State |
| --- | --- | --- |
| Source resolution | two public routes, no login | VERIFIED |
| Technique register row 47 | `C:/Users/david/AppData/Local/hermes/.akephalos/references/ai-3d-technique-register.md` | committed + pushed, read back from `origin/main` |
| Skill v1.0.0 | `C:/Users/david/Documents/desky-bootstrap-clone/Skills/game-development/open-world-city-art-loop/SKILL.md` (17,840 bytes, description 325 chars) | committed locally, **push blocked**, see §3 |
| Eval record | `C:/Users/david/AppData/Local/hermes/.akephalos/skill-evaluations/open-world-city-art-loop.json` | committed + pushed, read back |
| SkillScan | `scan` on the new skill | **SAFE** (task `64110911-203a-422e-9dfa-67e36d40f020`) |
| Flat-view link check | `_Scripts/link_skills.ps1 -VerifyOnly` | **162/162 across all seven harness roots**, read-through probe OK |
| Guard accept | `skill_regression_guard.py accept --skill open-world-city-art-loop` | **BLOCKED**, §3 |
| Study | `docs/technique-studies/gta-style-city-art.md` | this branch |

Commits — AKP `origin/main`:

- `8414b3b` Register row 47 (HF-419 GTA-style city art) + open-world-city-art-loop eval record

Commits — vault (`desky-bootstrap`, local `master`, cannot push):

- `1693099` Skills: open-world-city-art-loop (HF-419 GTA-style city art)

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

## 3. Blocked, with evidence — needs one integrator decision

**`skill_regression_guard.py accept` cannot succeed for ANY skill on this machine right now,
including mine, and including the other three lanes' skills tonight.**

Mechanism, read from the script: `run_check()` calls `description_problems(current, policy)`
**machine-wide and unscoped** before it applies the `--skill` scope, and `accept` returns
early on any non-zero rc. Three descriptions in the shared store exceed the policy maximum
of 360 characters:

| Skill | Path (vault store) | Chars |
| --- | --- | --- |
| `gem-nano-agent-debug` | `Skills/autonomous-ai-agents/gem-nano-agent-debug/SKILL.md` | 367 |
| `wow-spp-local-mod-restore` | `Skills/devops/wow-spp-local-mod-restore/SKILL.md` | 373 |
| `game-release-benchmark-guard` | `Skills/game-development/game-release-benchmark-guard/SKILL.md` | 377 |

All three are **pre-existing**: `git log` shows their last touch is commit `04b1468`
("Make the vault the canonical cross-harness skill and memory store"), untouched since. My
skill itself produced **zero problems** — only `WARN open-world-city-art-loop: long resident
description (325 chars)`, which is the allowed 220-char warn band, not a failure.

**I did not fix them**, deliberately, on two grounds: they are outside this lane's
ownership, and editing a skill in the shared store changes it for Claude, Codex, OMP, dsh,
Antigravity and Hermes at once with no review step — governed drift that needs its own
evaluation record.

**The fix is a 3-line patch and it strengthens nothing away** — a description is routing
metadata only, so trimming it loses no procedure. Trim each of the three
`description:` strings to ≤ 360 characters, then run, from the AKP root:

```
python scripts/skill_regression_guard.py accept \
  --policy skill-regression-policy.json \
  --skill-root "C:/Users/david/AppData/Local/hermes/skills" \
  --baseline skill-baseline.json \
  --evaluations skill-evaluations \
  --skill open-world-city-art-loop
```

(and the same with `--skill` for the other lanes' new skills). **Do not raise
`max_chars` in `skill-regression-policy.json`** — that is weakening a gate to get green and
is refused.

Two further blocks, both pre-existing and both owner actions:

- **The vault cannot be pushed.** `git push origin master` →
  `403 remote: Write access to repository not granted` on
  `daveinturkey15-byte/desky-bootstrap`. The branch was already **5 commits ahead** before
  this lane started and is now 7. The skill is committed locally and is live to every
  harness through the junctions (the store, not the remote, is what harnesses read), but it
  is not backed up. Owner: grant this credential write access, or push from the account that
  owns the repo.
- **The `akephalos-sync` cron job has been paused since 2026-08-10** (recorded in the
  register's own "Open items"), so neither mechanical guard runs on a schedule. Unchanged by
  this lane; restating because it is the reason drift accumulated to the point of blocking.

## 4. Notes on shared state and concurrency

- `references/ai-3d-technique-register.md` had **uncommitted rows 45 and 46** from the
  concurrent ComfyUI-3D and Water Pro lanes when I appended row 47. Git cannot stage part of
  a file non-interactively, so those rows rode along in commit `8414b3b`; the commit message
  says so, and their authors can keep amending on top. Between my commit and my push, the
  HF-420 lane committed `3776400` on top — both are on `origin/main`.
- One observation I am **retracting rather than reporting as a defect**: at 21:33 a
  `Get-ChildItem` of `~/.agents/skills` returned 0 entries, which would have meant every
  flat-consumer harness had no skills. At 21:40 the same command returned 162 and
  `link_skills.ps1 -VerifyOnly` reported 162/162 OK on all seven roots with a successful
  read-through probe. I could not reproduce the zero and will not claim a breakage from a
  single unreproduced reading; most likely another lane ran the relinker in between.
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
4. **`QA_PREVIEW_PORT=4219`** (lane AK). Preview server, not the dev server — HMR kills long
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
