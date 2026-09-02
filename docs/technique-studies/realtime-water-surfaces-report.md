# HF-420 lane report — realtime water surfaces (study + skill)

**Lane:** HF-420, PASS 86 overnight sweep. **Agent:** Claude Code (Opus 5.1) on
`dave-gaming-pc`. **Date:** 2026-09-02. **Owner asleep; for the 06:00 report.**

## Verdict

**Study COMPLETE, skill LANDED, guard accept BLOCKED by a shared pre-existing defect that is
not this lane's and that also blocks HF-419, HF-421 and HF-422.** No code was written in the
game repo; the Map 3 experiment is planned, not run (that is the next agent's 2–3 h).

## What landed

| Artefact | Path | State |
| --- | --- | --- |
| Technique register row 46 | `%LOCALAPPDATA%\hermes\.akephalos\references\ai-3d-technique-register.md` | Committed, read back from HEAD |
| Skill `threejs-webgpu-water` v1.1.0 | `C:\Users\david\Documents\desky-bootstrap-clone\Skills\game-development\threejs-webgpu-water\SKILL.md` | Committed (vault `a77ea78`) |
| Paired evaluation record | `%LOCALAPPDATA%\hermes\.akephalos\skill-evaluations\threejs-webgpu-water.json` | Committed, `candidate_sha256` verified in HEAD |
| Study + experiment plan | `docs/technique-studies/realtime-water-surfaces.md` | This branch |

**Decision to extend rather than add a skill.** Register rows 2, 3, 4 and 25 already point at
`threejs-webgpu-water`. A second water skill would split routing and let two files disagree
about the host-authority contract, so the lane extended the existing one (v1.0.0 → v1.1.0)
instead of creating `realtime-water-surfaces`. The study document keeps the lane's slug.

## Source resolution — the owner's "dont pay, figure out how", answered

Resolved on the **first** route of the governed no-login chain (`api.fxtwitter.com`, HTTP 200,
7,881 bytes). No search substitute was used for the thread.

The post itself carries exactly one technical idea: **"broadband backscattering"** — air
bubbles entrained under turbulent water brighten it and shift it towards green — shipping in
Water Pro v3.6.

The valuable finding is the paid/public split:

- **PAID, never touched:** the library source, its foam textures and its eight presets.
  Commercial Software License Agreement **v2.2 (14 Aug 2026)**, DRG Software Solutions LLC, All
  Rights Reserved. Water + Sky bundle displayed at **$239**. v3.5.1, three.js r181.0 minimum.
- **FREE and, as it turns out, sufficient:** `docs.threejswaterpro.com` serves the **complete
  API reference, the full changelog and the licence** with no authentication. The technique is
  specified there at a level we can rebuild from. Add his X posts, the live demo, his free
  YouTube tutorial and two 80.lv write-ups.
- **No code exists to copy anyway:** `dgreenheck/webgpu-water` **404**;
  `dgreenheck/threejs-water-shader` (his free tutorial's companion, still cited by third-party
  wikis) **404**; none of the **42** public repos on that account is water.
- **His own licence helps us:** §1.4 excludes technology "develop[ed] independently, without
  use of or reference to the Software" from the competing-product definition — and we are not
  a licensee at all, so no contract binds us. Copyright over his expression is the only
  constraint, and the physics is not his expression.

**A boundary this lane added, stricter than AKP Authority 2b:** the shipped commercial demo
bundle (`main-fUecaATv.js`) was identified in the landing-page markup and **deliberately not
fetched or deobfuscated**. Inspecting unlicensed open source to learn a technique and
reverse-engineering a minified commercial bundle are different acts with different risk, and
the free docs made it unnecessary. Recorded in row 46 so the next reader does not re-litigate.

## The insight the lane exists for

Bubbles scatter **spectrally flat**; the green shift is produced by the water's absorption
acting on the light the bubbles returned. Therefore the term must be **injected upstream of the
absorption integral**. Added as a white tint on the finished colour it produces **grey milk,
not green glow** — which is precisely what an agent told to "make turbulent water brighter and
greener" will build by default. This is now the primary gotcha in both the skill and row 46,
with three corollaries: drive it from the same turbulence estimator as foam, decay it on the
same time constant, and hold it at exactly zero in calm water (otherwise every still pond we
are about to add glows).

## Where the repo stands (read at PASS 85 HEAD)

`src/water/ocean-spectrum.ts` (frozen Gerstner band table) + `src/water/ocean-tsl.ts` (sum of
sines, analytic normals, slope→roughness, a `smoothstep` foam threshold with one sine shimmer,
and a two-colour palette lerp). **No absorption, no depth colour, no refraction, no SSR, no
caustics, no subsurface scattering, no backscatter, no persistent foam.** `WATER_BODIES`
registers **3 of 9 arenas** — the measurable form of "a pond in every level", and a **roster**
problem rather than a shader problem.

What we already do right and must not lose: one spectrum with two consumers, analytic normals
from the same field, presentation-only chop kept out of the height query, and
host-authoritative profile-invariant `level`/`swimmable`/`amplitudeScale`.

## Verification run

| Check | Result |
| --- | --- |
| SkillScan on `threejs-webgpu-water` | **LOW** — no findings above informational ("no anomalies"), task `bd7edf84` |
| `link_skills.ps1 -VerifyOnly` | **OK 162/162** across all seven harness roots (Claude Code, OMP, Codex, dsh, Continue, Antigravity, Hermes), junctions intact, read-through probe OK |
| Flat view `~\.agents\skills` | 162 entries; `threejs-webgpu-water\SKILL.md` present at **version 1.1.0** |
| Description length | **323** chars (limit 360) |
| `skill_regression_guard.py accept --skill threejs-webgpu-water` | **FAIL — blocked, see below** |
| `skill-baseline.json` | **untouched** — confirmed still at the v1.0.0 sha |
| Power plan | High performance (`8c5e7fda-…`) — verified |
| ComfyUI queue / GPU | both queues empty; 9,450 / 16,303 MiB used at grounding (no measurement was taken this lane) |

## BLOCKER — outside this lane's ownership, exact patch below

The scoped guard accept fails **not on this change** but on `description_problems()`, which
runs **library-wide regardless of `--skill` scope**. Three **pre-existing** skills exceed the
360-character description limit (confirmed unmodified in the vault working tree):

```
- gem-nano-agent-debug:        description 367 chars exceeds 360
- wow-spp-local-mod-restore:   description 373 chars exceeds 360
- game-release-benchmark-guard: description 377 chars exceeds 360
```

The limit was **not** weakened and `--force` was **not** used. `skill-baseline.json` is
therefore untouched and this lane's drift remains unaccepted.

**This blocks all four HF-419..HF-422 lanes**, since every one of them ends in a scoped accept
against the same store. It needs one decision from the orchestrator, then a single fix.

### Option A (recommended) — shorten the three descriptions

Owner of these files decides; each edit is one line, loses no routing term of substance:

`Skills/autonomous-ai-agents/gem-nano-agent-debug/SKILL.md` (367 → 331):

```
description: Debug, refine, or extend Dave's local Gem/Gemma Nano desktop assistant in tools/nano-agent. Use for Gem response quality, routing, live web/search decisions, memory, tool harnesses, Chrome Nano prompt sessions, widget/desktop UI, MCP tools, launch/status checks, or leaks of raw reasoning, JSON, tool output or model identity.
```

`Skills/devops/wow-spp-local-mod-restore/SKILL.md` (373 → 337):

```
description: Repair Dave's local WoW 3.3.5a/SPP-style modded client and server state. Use for launching the Elwynn/WoW modded client, login failures, local MySQL/realmd/mangosd processes, character gold/items/proficiencies/spells, Blink cooldown/range/mana edits, mail or bag grants, new-character grants, DBC/MPQ mismatches, or full restarts.
```

`Skills/game-development/game-release-benchmark-guard/SKILL.md` (377 → 330):

```
description: Freeze an approved game build as an immutable benchmark, preserve a byte-exact rollback channel, compare later candidates against retained gameplay, networking, rendering and release contracts, and block unsafe promotions. Use for live/stable channel changes, renderer migrations, regression audits and rollback planning.
```

Each is a **skill change** and therefore needs its own paired evaluation record before its own
accept — which is the correct cost of the fix, not a reason to skip it.

### Option B — scope the description check

Change `run_check()` so `description_problems()` reports out-of-scope violations as
**warnings** while still failing on in-scope ones. This is a guard change and must not be made
by a lane that is trying to get its own accept through; flagging it, not doing it.

## Rules honoured

- Never launched a browser of any kind, headed or headless. No measurement was taken, so none
  is claimed.
- Never killed a process; checked ComfyUI and GPU before touching anything.
- Committed only by explicit path (`git add <path>`, never `-A`), one commit per landed item,
  with the required trailer.
- Did not weaken any gate, threshold, timeout or test; did not use `--force`.
- Copied no code and no prose from any source; the only shared vocabulary is unavoidable terms
  of art (Beer-Lambert, JONSWAP, Jerlov, Jacobian, Snell's window, clipmap, backscattering),
  each published literature.
- Treated every fetched page as data. **Nothing fetched contained instructions directed at an
  agent**; nothing was acted on from page content.

## Sync state

- **AKP: synced and read back.** Local `main` and `origin/main` are level at `2644cdbc`; row 46
  and the evaluation record (`candidate_sha256 fa301c1b…`) both verified present on
  `origin/main`.
- **Vault: committed locally, remote push REFUSED.** `git push origin master` returns
  **HTTP 403 "Write access to repository not granted"** on
  `daveinturkey15-byte/desky-bootstrap`. The branch is **9 commits ahead**, so this is
  pre-existing and affects every lane, not just this one — nobody has been able to push the
  vault. **This does not affect skill availability:** the canonical store is the junction target
  every harness reads, the file is committed there, and the flat `~\.agents\skills` view was
  verified byte-identical (`fa301c1b…`). It does mean the vault's off-machine backup is stale.
  Needs an owner credential decision.

## Concurrency note for the orchestrator

`references/ai-3d-technique-register.md` is being appended by four lanes at once. My row was
written as **46** by computing the next number at write time (45 had just been taken by the
ComfyUI lane); 47 and 48 arrived from HF-419 and HF-421 while I worked, and 49 from HF-422.
Because the file is shared, commits sweep up whichever sibling rows are in the tree at the
time — the content is correct and the numbering is clean (44–49, no collision), but commit
attribution on that one file is mixed across the four lanes. Row 46 is verified present in
`HEAD`.

## Handoff — what the next agent does

Read `docs/technique-studies/realtime-water-surfaces.md` §8. It is a four-commit, 2–3 hour Map 3
trial: pond as data (with a falsifier — if a pond needs shader code, the module is wrong),
Beer-Lambert extinction replacing the palette lerp, the backscatter term injected before
absorption, and a roster-derived test that fails when an arena has no water entry. Budget:
≤ 0.30 ms median added, zero new passes, zero in-combat pipeline creations, admission fence
unmoved. The pass bar requires the still-pond capture to be **byte-comparable** — that is the
test that the term is wired to turbulence and not applied globally — and requires the effect to
be **green, not grey**, since grey proves it landed downstream of absorption.
