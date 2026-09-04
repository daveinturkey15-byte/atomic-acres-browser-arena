# LANE-BB — Nuke Town reference-grounded beast run

**Date:** 2026-09-04 → 2026-09-05
**Lane type:** process-only overnight orchestration plan
**Owner:** overnight orchestrator; Claude Opus verification at approximately 06:00
**Config:** `scripts/loop/configs/beast-run-2026-09-04.json`
**Impact:** process-only. This lane writes no arena code and does not publish.

## Goal

Make Nuke Town read as **BO2 Nuketown 2025** built by a photoreal procedural
method, judged against the BO2-2025 reference set region by region, while keeping
every existing correctness, collision, perception, lifecycle, render-profile,
load-time, provenance, and regression gate. The target is a recognizable,
version-correct map with believable authored materials and lighting, not a
rubric-only score increase.

`[VERIFIED]` The current reference-loop contract has a frozen mechanical
pre-check, a probe-token receipt, a journal, a two-cycle exit rule, a plateau
rule, and a minimum of two valid critics. The previous BA overnight lane used
rubric-only critics and no reference attachments; that is the reason this lane
requires reference-paired captures and a probe receipt before a critic score is
valid.

`[OPEN]` The current checkout does not yet contain a runner-compatible
`docs/references/nuketown-2025/manifest.json`. The research branch's manifest is
a useful collection record, but it is not the runner's `reference-set-v1`
shape. The orchestrator must install or merge a valid manifest before the first
cycle; otherwise the run stops before scoring.

## Non-negotiable boundaries

- This document and the JSON config are the only deliverables from this task.
  No arena code, build, browser capture, deployment, or production publication
  is authorized here.
- `origin/main`, merged PRs, exact SHAs, acceptance receipts, and the central
  release ledger are release authority. A local branch name or a chat claim is
  not a landed lane.
- The orchestrator must not weaken a threshold, assertion, timeout, camera
  list, probe rule, critic schema, or regression gate. A correct failure stays
  open.
- Keep the prior known-good candidate and its recovery reference. No automatic
  revert of another agent's worktree or commit is permitted.
- One headless browser at a time, with at least 3000 MiB free VRAM. The local
  Qwen process must be asleep during capture and visual comparison.
- The presence of
  `C:\Users\david\AppData\Local\Temp\claude\C--Users-david-Desktop-stuff\4cfe1b40-a256-4a42-8146-934f0cf22570\scratchpad\gpu.lock`
  is the coordinator's **pause-Qwen signal**. The capture owner creates it
  before browser/GPU work, waits for Qwen to quiesce, and removes it only after
  the capture and its receipt are closed. Qwen work is allowed only in the gaps
  between cycles when the lock is absent. An unknown lock holder is a stop
  condition, not permission to delete the file.
- Do not print provider credentials, tokens, cookies, auth files, environment
  contents, or raw prompt/completion logs. Receipts contain metadata and
  aggregate scores only.

## Base and the 22:00 merge fence

`[CLAIMED]` The handoff ledger describes the PASS94 candidate as candidate 3,
with locator `baece3b1`, and says it is not published. Treat that locator as a
search hint only. At 22:00 the orchestrator resolves and records the exact
40-character SHA from the central ledger, then verifies its required checks and
its candidate capture/provenance receipts.

The run base is:

1. The exact merged PASS94 candidate, first.
2. Only the afternoon lane heads that are actually landed by the 22:00 cutoff:
   `accuracy-2`, Nuke Town `materials`, `lighting`, `techniques`,
   `animation/skins`, `Raid`, `Farcrysis`, and `load-time`.
3. The merge result is frozen as `BEAST_BASE_SHA`; every cycle and every
   morning review names that SHA and the resulting head SHA.

The orchestrator's first action is a ledger-driven merge fence in the canonical
integration checkout, not in this feature worktree:

- fetch `origin` and inspect the PR/check state for PASS94 and each afternoon
  lane;
- reject any lane that is merely proposed, locally present, or missing its
  required exact-SHA evidence;
- merge the PASS94 candidate, then fast-forward/merge only the verified landed
  afternoon heads in the documented order;
- preserve the previous candidate and recovery ref before the first build;
- verify a clean tree, current `origin/main`, the exact `BEAST_BASE_SHA`, and
  the lane list in the run journal;
- stop if the merge would silently replace a protected fallback, alter a
  release-only branch, or carry a stale `PENDING_PRODUCTION` timestamp.

`[OPEN]` The exact afternoon PR numbers and final heads are intentionally not
invented in this plan. They must be read from the central ledger at 22:00.

The research reference commit is likewise not a release base. The research
branch records commit `9db69a93`, but it is not an ancestor of the reported
candidate. Copying or merging it is allowed only through the normal PR/ledger
route and only after converting its collection record into a valid runner
manifest.

## Reference authority and BO2-2025 findings

`[VERIFIED]` The primary target is BO2 Nuketown 2025. Other Nuketown versions
are secondary corroboration only. First-party/commercial game images are T1
evidence: they can establish versioned geometry, landmark, layout, and prop
measurements, but the current runner permits only T2 own captures and T3
permissive visual references as `criticTargets`. Therefore:

- BO2-2025 images remain measurement/evidence inputs unless the manifest's
  source policy is explicitly updated and validated.
- At least one valid targetable T2/T3 visual source is required before a visual
  critic round. If none exists, stop with `reference-target-missing`; do not
  attach T1 material as though it passed the source policy.
- `docs/references/nuketown-2025/FINDINGS.md` is the versioned findings source
  to project into the manifest's facts/measurements. The exact hex values for
  the house colors remain unknown and must not be fabricated.

The critics must test, at minimum, these BO2-2025 facts per named region:

- Both backyard spawns see the garage on the **right**. This is a handedness
  assertion from each spawn, not an approximation based on the cul-de-sac.
- The long street axis runs from the lollipop cul-de-sac toward the open end;
  the third house, drive, and red car occupy the far-end context.
- The orange/terracotta-over-cream house and the white/cream house retain the
  BO2-2025 palette with pale blue-grey glazing. BO1-style yellow/blue walls are
  a contradiction.
- Each house has a yard-side rear deck and exterior wooden stair at the end
  opposite its garage. The front porch reads as a deep, flat, overhanging
  eave/cantilever rather than a post-supported canopy.
- The orange-house side carries the coach; the white-house side carries the
  box truck and dark saloon. The green classic car is on the stem. The red and
  blue appliance banks stay on their respective lawns.
- The two yards are not mirrored filler: the orange side has its glasshouse /
  carport character and the white side has its garden pod, sandpit, and
  shuffleboard character.
- Glass, doors, roofs, collision, damage state, projectile apertures, bot LOS,
  and smoke are one authoritative lifecycle, projected consistently in every
  graphics profile.

`[OPEN]` The garage-end/head direction and exact house hex values remain
medium/unknown in the findings. Critics may flag them as uncertainty; builders
must not silently promote an inference to a fact.

## Fixed loop

The run is a bounded sequence of reference-grounded cycles. The runner's
current implementation owns the pre-check, pair resolution, critic schema,
journal, and stop evaluation; the orchestrator owns the build, capture, and
provider dispatch around it.

### Cycle stages

1. **Select one correction.** Read the journal and the lowest-scoring failing
   reference region. The builder may change one bounded module and its declared
   hook/consumer surface. It must state observation, inference, assumption,
   unknown, falsifier, and the exact gate it protects. No broad rewrite or
   cosmetic-only diversion is allowed while a tier-0, collision, lifecycle,
   profile, load-time, or provenance issue is open.

2. **Build and receipt.** The selected builder makes one reversible change,
   records the exact base/head SHA, and runs only the smallest named checks
   needed for that module. A failure is journaled; it is not hidden by changing
   the verifier.

3. **Capture the frozen judgeset.** Capture the twelve stations below from the
   candidate at the same seed, settle policy, viewport, renderer, and capture
   recipe. There is one headless browser. The lock pauses Qwen before any GPU
   capture. Every station gets the probe-token receipt, source SHA, backend,
   adapter, viewport, seed, settle time, and environment validity. A missing or
   mismatched probe invalidates the station and the cycle.

4. **Mechanical perceptual pre-check.** Run the existing image pre-check for
   each reference/capture pair: SSIM, Sobel/Otsu edge IoU, value EMD, and
   silhouette metrics. These are contradiction and regression signals, not a
   substitute for BO2 reference judgement. Tier-0 geometry contradictions and
   a failed named gate invalidate the cycle.

5. **Three critic seats, with truthful capability boundaries.**

   - **Gemini:** `google-antigravity/gemini-3.8-flash-high`, OMP route; primary
     visual critic and primary builder. Fresh context, no tools, no edits.
   - **Alibaba:** `alibaba-token-plan/qwen3.8-max`; secondary builder and visual
     critic. It is a separate provider route, not the local Qwen process.
   - **Luna:** `gpt-5.6-luna`, `xhigh`; skeptic pass on every third cycle and
     hard-contract adjudicator. The current Codex adapter is text-only and
     cannot receive image attachments, so Luna receives the station summaries,
     perceptual receipt, probe state, and BO2 findings. Luna is a third review
     seat, but it does **not** count toward the two-critic visual quorum unless
     an adapter contract is changed, tested, and revalidated.

   Each seat must return all four current schema rows: geometry match,
   proportion, material read, and lighting match; a 0–25 score; named regions;
   the largest gap and root cause; a bounded correction for every failing row;
   and a decision. Wrong/missing probes, malformed rows, fabricated citations,
   or an unavailable attachment make that critic invalid.

   This is the deliberate correction to BA's rubric-only critic behavior:
   no critic score is accepted without the paired reference identity and the
   candidate capture identity.

6. **Regression and adjudication.** Run the affected positive contracts in both
   Performance and Quality/Max presentations, plus the named gameplay,
   collision, perception, lifecycle, and load-time guards. Do not treat a
   better exterior screenshot as a win if an interior, spawn, profile, or
   authoritative-geometry gate worsens. The journal records the accepted
   correction, rejected correction, or stop reason.

7. **Plateau/stop evaluation.** Use the runner's existing rules: minimum two
   valid critics, two consecutive exit cycles, a 1-point plateau delta over its
   plateau window, two invalid cycles as a broken harness, and the configured
   oscillation/regression stops. Do not make a never-stop loop. A plateau may
   escalate once to `refine-spec`; the next plateau stops the run.

### Frozen judgeset — 12 stations

The frozen set is derived from the PASS94 candidate's named Nuketown stations.
The candidate also contains vehicle-specific diagnostics; those are optional
diagnostics and do not change this twelve-station count.

| Class | Station | Required BO2-2025 question |
|---|---|---|
| exterior | `nuketown2-street-centre` | street axis, cul-de-sac/open-end read, coach/truck placement |
| exterior | `nuketown2-north-upper-window` | orange-house upper mass, glazing, balcony/roof proportion |
| exterior | `nuketown2-south-upper-window` | white-house upper mass, glazing, balcony/roof proportion |
| exterior | `nuketown2-into-sun-street` | depth, third house, red car, atmospheric/light read |
| exterior | `nuketown2-garage` | garage scale, door/lifecycle, handedness context |
| exterior | `nuketown2-north-balcony` | rear deck/stair and upper-window relationship |
| exterior | `nuketown2-front-porch` | deep cantilever/eave semantics and entry materials |
| interior | `nuketown2-north-interior` | orange-side interior materials, occlusion, collision/LOS |
| interior | `nuketown2-south-interior` | white-side interior materials, occlusion, collision/LOS |
| backyard spawn | `nuketown2-north-yard` | garage on right, yard identity, spawn-safe sightlines |
| backyard spawn | `nuketown2-south-yard` | garage on right, yard identity, spawn-safe sightlines |
| overhead | `nuketown2-overhead` | overall lollipop plan, house/garage/street/yard topology |

No station may be dropped because it is inconvenient, and no live menu preview
may substitute for a production arena capture. The selected arena must already
be deployed behind its loading transition before this judgeset is captured.

## Provider routes and budgets

Budgets are maximum calls for this run, not promises that a quota is available.
The orchestrator probes route availability once per cycle and does not spin on
an exhausted route.

| Route | Run role | Window / reset | Run cap |
|---|---|---|---:|
| Google OMP / Gemini | primary builder and visual critic | 5-hour window; `[CLAIMED]` exhausted at 21:50 last night, estimated earliest retry 02:50 local; probe before use | 20 calls: 10 builder + 10 critic |
| Alibaba token plan / Qwen Max | secondary builder and visual critic | weekly token plan; `[CLAIMED]` fresh at handoff | 20 calls: 10 builder + 10 critic |
| Z.ai / GLM Flash | late builder fallback | 5-hour window; `[CLAIMED]` reset 05:04 local | 2 calls after reset only |
| Codex / Luna | skeptic every third cycle and final contract adjudication | OpenAI plan; `[VERIFIED]` model policy is Luna only, `xhigh` | 4 calls: cycles 3, 6, 9, plus one final adjudication |
| Meta OMP / Muse Spark 1.3 | visual critic only; never a builder | contributor tier; `[VERIFIED]` admitted by the four-row probe receipt on 2026-09-04; Meta trains on contributor traffic, owner-accepted | 1 call/cycle, 10 total |
| local Qwen 27B | mechanical gap work only | unlimited local; sleeps about 45 seconds after its last request; holds about 13.8 GB VRAM while awake | no critic calls; one bench ladder rerun plus bounded gap jobs |

The 02:50 Google time is an estimate derived from the stated five-hour window,
not an entitlement. The orchestrator must use the provider's actual response
as the claim state. A quota error consumes no retry loop and is recorded once.

Muse is a critic-only contributor-tier route. Meta trains on contributor traffic;
Dave explicitly accepts that data caveat for this cheap visual-critic trial.
The route gets at most one call per cycle and never enters the builder pool.

## Cadence and stop conditions

The wall-clock envelope is 22:00–05:30 for at most ten 45-minute cycles. Cycle
starts are 22:00, 22:45, 23:30, 00:15, 01:00, 01:45, 02:30, 03:15, 04:00,
and 04:45 local. The final cycle may select GLM after 05:04 for a bounded late
repair; it must not extend the envelope.

Each 45-minute slot is a budget, not a target to fill:

- 0–5 minutes: read journal, check lock/VRAM/browser/route availability;
- 5–17 minutes: one builder correction and named checks;
- 17–29 minutes: one frozen twelve-station capture with probe receipt;
- 29–38 minutes: mechanical pre-check and two visual critic calls;
- 38–45 minutes: Luna on cycles 3/6/9, regression receipt, journal and stop
  evaluation. If a capture or provider call overruns, stop the cycle cleanly.

Stop immediately on any of the following: missing valid reference manifest;
no targetable T2/T3 reference; free VRAM below 3000 MiB; a second browser;
Qwen awake during capture; missing/wrong probe; fewer than two valid visual
critics; invalid-streak threshold; tier-0 contradiction; regression in a
protected gate; journal corruption; provider budget exhaustion; no measurable
gain after the allowed plateau escalation; or the 05:30 wall-clock fence.

The normal success stop is the runner's exit decision for two consecutive
cycles with at least two valid critics, no blocking regression, and no tier-0
worsening. A successful loop is still a candidate, not a production release.

## Local Qwen work in the gaps

The local route is deliberately not a critic. It failed the four-row receipt
task and must not be allowed to manufacture a visual quorum.

Between cycles, with the pause lock absent and no browser active, the
orchestrator may assign:

- the **header chain**: inspect and mechanically repair the required file
  headers/metadata chain, producing a receipt-only diff and no gameplay
  decision;
- one rerun of the **Qwen bench ladder**, with its raw output kept local and a
  numeric aggregate receipt supplied to Luna for skepticism;
- single-file exact-spec jobs handed off by a builder, such as normalizing a
  manifest row, updating a receipt index, extracting a count, or applying a
  narrowly specified documentation/config edit.

Qwen may not edit a multi-file gameplay feature, choose the lowest-scoring
region, approve its own output, write a critic score, or run while the browser
holds the GPU. Every handoff names one file, the exact expected invariant, the
falsifier, and the before/after SHA. The header chain and bench are journaled as
mechanical side work, not as visual progress.

## What Luna does

On cycles 3, 6, and 9 Luna performs a skeptic pass over every region summary,
probe receipt, pre-check, and regression result. It looks specifically for:

- false-green geometry or handedness claims;
- T1 references being treated as targetable visual assets;
- a material/lighting score rising while a collision, LOS, profile, or load-time
  gate worsens;
- invented hex values, landmarks, citations, or unsupported root causes;
- Qwen bench/header work being mistaken for a critic judgement;
- a builder changing more than its declared module/hook boundary.

Luna's final call is a contract adjudication, not a release approval. Its
headless invocation must use `-c notify=[]`; watch the runner's `DONE` marker
and terminate the hung process after the marker rather than waiting forever.

## 06:00 Opus verification and morning HITL

### Opus checklist

At approximately 06:00, Claude Opus verifies the immutable candidate and its
receipts, without silently fixing it:

- exact `BEAST_BASE_SHA`, every accepted cycle head, final head, and clean
  provenance/commit chain;
- PASS94 and only the afternoon lanes proven landed at 22:00;
- valid runner manifest shape, BO2-2025 version tags, T1 measurement-only
  handling, and at least one targetable T2/T3 source;
- all twelve judgeset stations, probe receipts, source/capture pairing, and
  no hidden station substitution;
- every critic's four schema rows, valid-critic quorum, journal continuity,
  plateau/invalid/oscillation decisions, and no fabricated citation;
- mechanical pre-check results and both-profile gameplay, collision, LOS,
  lifecycle, load-time, render-profile, and provenance receipts;
- geometry/material/lighting evidence for the BO2 facts above, including both
  backyard garage-right views and the overhead topology;
- Qwen lock timeline proves it slept for captures and its bench/header/single-
  file outputs did not become critic authority;
- no test, threshold, assertion, or timeout was weakened and any HF467/material
  class failure remains openly reported unless the landed fix has exact proof;
- no production publication occurred and the protected fallback remains
  recoverable.

Opus records `VERIFIED`, `CLAIMED`, or `OPEN` for each checklist item. A good
mechanical receipt with a visual or owner-facing failure remains a candidate
failure.

### Morning HITL

Dave's morning review uses the exact immutable candidate SHA and cache-busted
local/preview evidence. It checks the seven exteriors, two interiors, two
backyard spawns, and overhead as a coherent BO2-2025 map: garage-right
handedness from both spawns; house palette/glazing; deck/stairs/eaves; lollipop
topology and third house; coach/truck/vehicle placement; yard asymmetry;
glass/doors/roofs and walkable/shot authority; smoke/LOS; lighting and
material readability in both profiles; and load-time/frame-pacing behavior.

HITL records accept, reject, or request-correction with exact station IDs and
source/head SHA. It does not convert a candidate into live production. Any
publication decision remains a separate protected release operation with its
own exact-SHA gates.

## Launcher recipe for the orchestrator at 22:00

Run the merge commands only from the canonical integration checkout selected
by the central ledger. The feature worktree containing this plan is not a
publisher. The environment variables below are required ledger inputs; the
commands fail closed if a required exact SHA is absent.

```powershell
$integration = $env:PASS84_CANONICAL_CHECKOUT
if ([string]::IsNullOrWhiteSpace($integration)) { throw 'PASS84_CANONICAL_CHECKOUT is required' }
Set-Location -LiteralPath $integration
git fetch origin --prune
git status -sb
git switch main
git pull --ff-only origin main
$baseSha = $env:PASS94_MERGED_SHA
if ($baseSha -notmatch '^[0-9a-f]{40}$') { throw 'PASS94_MERGED_SHA must be the verified 40-character SHA' }
git merge --ff-only $baseSha
git status --short
git rev-parse HEAD
```

The orchestrator then applies only the exact, already-verified afternoon lane
heads recorded in the ledger, one at a time, using `git merge --ff-only
<40-character-lane-sha>`. It records each resulting head, preserves the
fallback ref, and refuses an unverified branch name. No `npm run deploy` is
part of this recipe.

Validate the config and the required reference manifest before starting a
cycle:

```powershell
$config = Join-Path $integration 'scripts\loop\configs\beast-run-2026-09-04.json'
$manifest = Join-Path $integration 'docs\references\nuketown-2025\manifest.json'
Get-Content -LiteralPath $config -Raw | ConvertFrom-Json | Out-Null
if (-not (Test-Path -LiteralPath $manifest)) { throw 'runner-compatible Nuketown manifest is missing; stop' }
node scripts/loop/run-loop.mjs --subject nuketown-2025 --print-plan
```

For each capture boundary the coordinator uses this exact lock protocol. The
capture command itself is the canonical capture command selected by the
integration ledger; it is not invented in this plan because the current loop
runner deliberately does not own browser capture.

```powershell
$gpuLock = 'C:\Users\david\AppData\Local\Temp\claude\C--Users-david-Desktop-stuff\4cfe1b40-a256-4a42-8146-934f0cf22570\scratchpad\gpu.lock'
New-Item -ItemType File -Path $gpuLock -Force | Out-Null
try {
  # Invoke the ledger-recorded twelve-station capture here; wait for its receipt.
  if (-not (Test-Path -LiteralPath $gpuLock)) { throw 'Qwen pause lock disappeared during capture' }
}
finally {
  Remove-Item -LiteralPath $gpuLock -Force -ErrorAction SilentlyContinue
}
```

The runner dry-run command used to validate this plan is:

```powershell
node scripts/loop/run-loop.mjs --subject chopper-gunner-cockpit-1080 --dry-run --fixture-dir scripts/loop/fixtures/dry-run --critics A,B,C --cycles 1 --evidence-root artifacts/loop/beast-plan-dry-run
```

`[VERIFIED]` This command is the current repository's supported dry-run path.
The captured result is recorded below after execution and is intentionally for
the existing fixture subject; it proves the runner contract without pretending
that the missing Nuketown manifest or a browser capture exists.

Exact dry-run output from this checkout:

```text
{
  "stopped": true,
  "state": "budget",
  "reason": "cycle ceiling 1 reached",
  "cycle": 1,
  "journalPath": "C:\\Users\\david\\projects\\aa-claude-i3\\artifacts\\loop\\chopper-gunner-cockpit-1080\\journal.jsonl",
  "statePath": "C:\\Users\\david\\projects\\aa-claude-i3\\artifacts\\loop\\chopper-gunner-cockpit-1080\\state.json"
}
```

`[VERIFIED]` JSON parsing, `node --check scripts/loop/run-loop.mjs`, and this
dry-run exited 0. The runner's reported `budget` state is expected because the
validation intentionally sets `--cycles 1`; it is not a claim that an overnight
Nuketown run succeeded.

## Evidence and handoff

The journal is append-only and local. It stores exact SHAs, route/model labels,
cycle/stop state, probe and pre-check summaries, critic validity, and aggregate
scores. It does not store secrets, raw credentials, or unrestricted prompt and
completion text. The final handoff contains:

- the config path and validated dry-run output;
- `BEAST_BASE_SHA`, final candidate SHA, accepted/rejected cycle decisions;
- all twelve station receipts and reference IDs;
- provider availability/budget outcomes;
- Opus's claim-state checklist and Dave's morning HITL result;
- the protected fallback identity and the explicit statement that this lane did
  not publish.
