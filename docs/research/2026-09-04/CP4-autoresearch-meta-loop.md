# CP4 — The autoresearch meta-loop layer: measuring how we work, and refining the measures

Lane CP4. Author: Claude Opus 5.1 (implementation agent), 2026-09-04.
Status: **SPEC + RESEARCH. Nothing built, nothing committed.** This file is the only
artifact of the lane, written to `aa-claude-research` and deliberately left uncommitted.

## Claim-state legend

Every load-bearing line in this document carries one of:

- **VERIFIED** — I read the file, ran the command, or fetched the page myself this session.
- **CLAIMED** — a source says it; I fetched the source but could not independently check it.
- **UNRESOLVED** — I looked and did not find it; stated as a gap, not filled with a guess.
- **PROPOSED** — my design. Not fact. Not reviewed by the owner or any other lane.

---

# 0. What the owner asked for

Paraphrased from the lane brief (the orchestrator's transcription of the owner's ask; I did
not hear the owner directly, so this is itself **CLAIMED**):

1. Karpathy-style "autoresearch" hill-climb loops that measure **the whole way we work** —
   architecture, models, orchestration, skills, levels, assets — not just per-run gauntlets.
2. **10–15 well-defined loops set up in advance**, covering at least: speed, accuracy,
   pass-review rate out of 100 tasks, gotcha hit rate, token efficiency, value per pound.
3. A **meta layer above them** that refines how the loops themselves are defined —
   self-evolving, self-healing.
4. A **dashboard tab** plus a **daily digest**.
5. Research "the NVIDIA AVO thing", which the owner understands as built on top of
   Karpathy's hill-climb loop with meta layers above it.

Ledger note — **and a gotcha worth recording on its own.** The brief says HF-455..473 are
today's owner asks. The ledger in `aa-omp-pass84` (1,337 lines) **ends at HF-454** and looks
complete. The current ledger is in the *newer* worktrees:
`aa-claude-research/docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` at **1,489 lines**, carrying
**HF-455 through HF-468** (VERIFIED, read this session). `aa-claude-hitl`'s copy is at 1,389.
Three worktrees, three different "current" ledgers, no divergence marker on any of them.

> **Symptom:** an agent reads the ledger from the pass worktree and correctly reports that
> the owner's newest asks do not exist. **Cause:** the ledger is copied per worktree and the
> integration branch moved to `aa-claude-hotfix` (HF-454 cut note: `aa-omp-pass84`'s
> node_modules was half-reinstalled by an elevated Codex run, EPERM on the rolldown binding).
> **Correction:** read the ledger from the worktree with the highest line count, or from the
> integration head — never from the pass worktree by name. **Verify:** `wc -l` the ledger
> across worktrees before quoting it.

This is exactly the class of failure CP4 exists to measure — the reading was green and the
answer was wrong — so it is Part C's L03 in miniature, found while writing L03.

---

# PART A — What the references actually say

## A1. Karpathy's `autoresearch` — VERIFIED, and smaller than its reputation

Sources: <https://github.com/karpathy/autoresearch> and its `program.md`
(<https://raw.githubusercontent.com/karpathy/autoresearch/master/program.md>), both fetched
2026-09-04.

It is a **single-lineage greedy hill-climb over one file**, and almost all of its value is
in the constraints rather than the cleverness.

| Element | What it actually is | Claim-state |
|---|---|---|
| Mutable surface | `train.py` only — "the single file the agent edits". Architecture, optimizer, hyperparameters, batch size, depth: "Everything is fair game". | VERIFIED |
| Frozen surface | `prepare.py` — data prep, fixed constants, **the evaluation harness**. Read-only. Dependencies and the evaluation function cannot be changed. | VERIFIED |
| Metric | `val_bpb` — validation bits-per-byte, lower is better, chosen because it is vocabulary-size independent. One number. | VERIFIED |
| Budget | Exactly **5 minutes wall-clock training** per experiment, whatever the hardware. ~12 experiments/hour, ~100 overnight. | VERIFIED |
| Accept / revert | "If val_bpb improved (lower), you advance the branch, keeping the git commit. If val_bpb is equal or worse, you `git reset` back." | VERIFIED (quoted) |
| Journal | Results appended to `results.tsv` (untracked). Crashes logged as status `crash`, memory 0.0, skipped rather than debugged if non-trivial. | VERIFIED |
| Tie-break | "All else being equal, simpler is better" — complexity for a marginal gain is penalised. VRAM a soft constraint; dramatic increases unacceptable. | VERIFIED (quoted) |
| Autonomy | "NEVER STOP: … do NOT pause to ask the human if you should continue … The loop runs until the human interrupts you, period." | VERIFIED (quoted) |

**Five design decisions worth stealing wholesale:**

1. **The evaluation harness lives in the frozen file.** The agent physically cannot edit what
   judges it. Same intent as the AKP rule *never weaken a verifier to get green* — but
   enforced by file partition instead of by asking nicely. Our repo asks nicely (`AGENTS.md`:
   "Never weaken a test, threshold or assertion to reach green") and has been burned anyway.
2. **One number decides.** Not a dashboard, not a rubric — one scalar, one direction. The
   richness lives in *which* scalar and in the tie-breaks, not in the count of numbers.
3. **A fixed wall-clock budget, not a fixed workload.** Comparable within a machine,
   deliberately not comparable across machines. That honesty is a feature.
4. **Revert is the default; equal is not good enough.** The lineage is monotone by
   construction.
5. **Simplicity is an explicit tie-break inside the metric's shadow.** Without it a
   hill-climb ratchets complexity forever, because complexity is usually
   neutral-to-slightly-positive on any single metric.

**What does NOT transfer**, stated plainly so nobody copies it into a game repo:

- `val_bpb` is cheap, near-deterministic and available every five minutes. Almost nothing we
  care about is. "Does the owner accept this build" has a latency of hours and a sample size
  of one.
- Auto-revert on regression is safe when one agent owns one file. It is **catastrophic**
  here: `scripts/orchestration/gauntlet_v2.py` says so in its own header — "A round that
  leaves the tree red is still COMMITTED, with the state named in the message.
  Auto-reverting other agents' work is how a night's output disappears." (VERIFIED, quoted.)
- "NEVER STOP" is wrong for us. We share a machine with the owner's ComfyUI/ollama/llama.cpp
  work, spend is real, and there is a documented incident where three false REGRESSED
  verdicts stopped an eight-hour run and the human then found the tests passing
  (`regression_gate.py` header, VERIFIED).

## A2. Scaling it — SkyPilot's parallel autoresearch (CLAIMED)

Source: <https://skypilot.ai/blog/scaling-autoresearch/> (301 from blog.skypilot.co), fetched
2026-09-04.

- ~90 experiments/hour across up to 16 parallel clusters vs ~10/hour sequential — a **9x**
  throughput gain; best val loss in ~8 h vs a *simulated* ~72 h sequential baseline. ~910
  experiments submitted, ~700 with valid results. **CLAIMED** (their measurement, their
  simulated baseline).
- **Notable absence:** the post describes **no shared ledger, no locking and no
  de-duplication** across parallel agents — coordination is just job submission — and gives
  no failure-mode analysis beyond "the rest queued or crashed". **VERIFIED absence**; I
  looked for it specifically.

The lesson is the inverse of the headline. Parallelism bought throughput because the inner
experiment was cheap, isolated and **honestly scored**. Our parallelism (up to 52 agents on
one machine per `governor.py`) is already bounded by RAM, one GPU and one browser semaphore —
and scoring is the dishonest part. Adding agents will not help; fixing the score will.

## A3. "The NVIDIA AVO thing" — **RESOLVED**

The owner's reference resolves cleanly, and to *two* linked NVIDIA artifacts rather than one.

**AVO = Agentic Variation Operators.** arXiv **2603.24517** —
<https://arxiv.org/abs/2603.24517>, HTML <https://arxiv.org/html/2603.24517v1>. 23 authors;
**NVIDIA researchers among them (Vinod Grover, Ming-Yu Liu)**. VERIFIED by fetch.

Abstract, verbatim opening: *"Agentic Variation Operators (AVO) are a new family of
evolutionary variation operators that replace the fixed mutation, crossover, and
hand-designed heuristics of classical evolutionary search with autonomous coding agents."*

Plus an official NVIDIA Technical Blog post that treats AVO as a general architecture rather
than a kernel trick: **"NVIDIA AVO Reaches 100% on ARC-AGI-3, Demonstrating a Frontier-Level
General-Purpose Architecture for Long-Horizon Autonomous Agents"** —
<https://developer.nvidia.com/blog/nvidia-avo-reaches-100-on-arc-agi-3-demonstrating-a-frontier-level-general-purpose-architecture-for-long-horizon-autonomous-agents/>.
VERIFIED by fetch.

### What AVO is

Per the NVIDIA blog (VERIFIED quotes), AVO is **an agent architecture** — a "general-purpose
coding agent system developed by NVIDIA" for "sustained autonomous operation across long
horizons" — with four named layers:

1. **Main agent loop** — "inspects context, plans, implements changes, and evaluates results".
2. **Persistent memory** — "carries forward prior implementations, evaluation results,
   compiler and profiler outputs, and accumulated reasoning".
3. **Tools / execution interface** — domain-specific (GPU kernels vs ARC-AGI-3 games).
4. **Supervisor** — "monitors the broader trajectory for stagnation or repeated unproductive
   cycles and can redirect the main agent".

### The kernel result and its guards (VERIFIED from the HTML)

- 7 days of continuous autonomous evolution on multi-head attention; NVIDIA Blackwell B200,
  CUDA 13.1, PyTorch 2.10.0. Beats cuDNN by up to 3.5% and FlashAttention-4 by up to 10.5%.
  Transfers to grouped-query attention with 30 minutes of further autonomous adaptation.
- **Topology: single lineage, not islands** — "a single-lineage continuous instantiation"
  that commits versions when they "pass correctness checks and match or improve the benchmark
  score". This is a hill-climb; the owner's intuition is right on this point.
- **Yield: 40 committed versions from 500+ explored directions** over 7 days — roughly an 8%
  commit rate. Every committed version is "persisted as a git commit along with its score".
- **The correctness gate dominates the objective:** "A candidate that fails correctness is
  assigned zero score … regardless of throughput." The scoring function evaluates numerical
  correctness against a reference implementation *and* throughput in TFLOPS.
- **Anti-gaming by construction:** timing uses "the same timing script from the FA4
  repository" — the *baseline's own* harness, not one the agent wrote — and each measurement
  is a mean and standard deviation over **10 repeats**.
- **The meta layer is a stagnation detector, not a hyperparameter optimiser.** A
  "self-supervision mechanism" that, once triggered, "reviews the overall evolutionary
  trajectory and steers the search toward several candidate optimization directions" when the
  agent stalls or cycles unproductively. The paper describes **no explicit hyperparameter
  adaptation layer** (VERIFIED absence).
- **ARC-AGI-3:** 100.00 RHAE across all 25 environments, all 183 levels, 6,624 environment
  actions (~12% fewer than VISTA's 7,542), **driven by Claude Opus 5**. Compute and time not
  stated. CLAIMED (NVIDIA's own numbers, no independent replication found).

### The honest correction to the owner's framing

The owner's mental model — *"AVO is built on top of Karpathy's hill-climb loop with meta
layers above it"* — is **directionally right and lineally wrong**, and both halves matter:

- **Right:** AVO *is* a single-lineage hill-climb with strict accept-on-improvement, a frozen
  external scorer, and a supervisor above it. Structurally it is the same animal as
  `autoresearch` with a stagnation-breaker bolted on.
- **Wrong:** AVO **does not cite Karpathy's autoresearch.** It positions itself against
  FunSearch, AlphaEvolve and LoongFlow, as a departure from *their* fixed pipelines.
  **VERIFIED absence** — I checked the HTML for that citation specifically.

Cite them as **convergent designs**, not parent and child. If "AVO builds on autoresearch"
appears in a repo doc, that is a fabricated lineage and should be corrected.

## A4. The explicit meta-loop literature — partial, and flagged as such

- **"Bilevel Autoresearch: Meta-Autoresearching Itself"**, arXiv 2603.23420
  (<https://arxiv.org/pdf/2603.23420>), Yaonan Qu and Meng Lu. **CLAIMED / LOW FIDELITY** —
  the PDF text did not extract cleanly, so my summary is a model's reading of compressed
  streams. Reported shape: an inner loop running normal experiments; an outer loop proposing
  modifications *to the research methodology itself*, represented as injectable code, accepted
  or reverted on whether they improve inner-loop outcomes; safeguards described as held-out
  evaluation sets and multiple criteria to resist metric exploitation. **Anyone building on
  this must re-read the PDF properly. Do not cite my summary as the paper.**
- Adjacent work surfaced but **not fetched**, listed only so the next lane knows it exists —
  all **UNVERIFIED**: "EvoTrainer: Co-Evolving LLM Policies and Training Harnesses" (arXiv
  2606.03108); "Agentic-imodels: Evolving agentic interpretability tools via autoresearch"
  (2605.03808); "Arbor: Tree Search as a Cognition Layer for Autonomous Agents" (2606.12563);
  "KernelEvolve: Scaling Agentic Kernel Coding … at Meta" (2512.23236); "Toward Generalist
  Autonomous Research via Hypothesis-Tree Refinement" (2606.11926).

## A5. What we take, what we refuse

| Take | From | Why |
|---|---|---|
| One scalar per loop, one direction | autoresearch | Dashboards do not make decisions; numbers do |
| The scorer lives where the worker cannot edit it | autoresearch (`prepare.py`) | Turns "never weaken a verifier" from a promise into a permission |
| Fixed wall-clock budget per iteration | autoresearch | Bounds cost without pretending workloads are comparable |
| Zero score on correctness failure regardless of the headline metric | AVO | A fast wrong kernel and a green broken build are the same bug |
| Measure with the *baseline's* harness, N repeats, report σ | AVO | Our gates have repeatedly measured themselves |
| Persist every accepted step as a commit with its score attached | AVO | Makes the lineage auditable after the fact |
| A supervisor that fires on **stagnation**, not on a schedule | AVO | Cheap, and it is the failure mode we actually have |
| Mechanism changes proposed → shadowed → adopted or reverted | Bilevel (CLAIMED) | The only published shape for the owner's "meta layer" |
| **Refuse:** auto-revert of other agents' work | contradicts `gauntlet_v2.py` | Documented way to lose a night's output |
| **Refuse:** "NEVER STOP" | contradicts AKP and a shared machine | Owner runs ComfyUI/ollama here; spend is real |
| **Refuse:** parallel workers with no shared ledger | SkyPilot's gap | 365 worktrees here; collision is a known incident class |

---

# PART B — Where we actually are (local, VERIFIED)

Everything in this part I read this session in `C:/Users/david/projects/aa-omp-pass84`.

## B1. We already have three quarters of an inner loop

| Existing piece | What it does | File |
|---|---|---|
| Mechanical regression floor | Tracks `tsc_clean`, `tests_passed`, `tests_failed`, `test_files_passed`; `check` exits non-zero if any goes backwards; "deliberately does not 'fix' anything and never edits a test — a regression is a report, not a negotiation" | `scripts/orchestration/regression_gate.py` (235 lines) |
| Isolation re-run | A file failing under full-suite load is re-run **alone** before it counts. The hardcoded FLAKY list is advisory; the isolation re-run is authoritative — and a FLAKY-listed file failing alone **is** reported | same file |
| Tiered verification | Tier 1 per agent (incremental tsc + that agent's tests, ~3.6 s / 2.52 GB); Tier 2 per round (full tsc + suite + regression gate); Tier 3 pre-build (production bundle + all six arenas on real WebGPU) | `scripts/orchestration/verify.py` (151 lines) |
| Memory governor + browser semaphore | Derives safe agent count from free RAM against a reserve; a filesystem lock with a small fixed number of headed-Chrome slots, machine-wide, shared with OMP, Codex and Hermes | `scripts/orchestration/governor.py` (274 lines) |
| Round runner | Memory-governed rounds; commands routed through the shell (Windows `npx.cmd`); regression floor mechanical; browser work capped separately | `scripts/orchestration/gauntlet_v2.py` (457 lines) |
| Publish plan tests | `publish_passNN.py` each paired with a `publish_passNN_plan.test.mjs` | `scripts/orchestration/` |
| Evidence tree | `docs/evidence/pass84 … pass93` | `docs/evidence/` |

**This is a good inner loop.** What is missing is not measurement machinery — it is (a) the
right *metrics*, (b) a place to put them where they accumulate across passes, and (c) anything
above them.

## B2. The gap that CP4 exists to close, in one sentence

Every one of the four worst incidents on this repo was a case where **the measurement said
green and the owner said broken** — so the thing that most needs a hill-climb loop is not the
game, it is the measuring.

The four, from the memory index and HF-454 (VERIFIED as recorded):

1. **Gate drives a debug backdoor** — green gates while the owner could not launch; every
   harness filled in a field a real visitor never has.
2. **Hardcoded gate rosters** — green gates that never looked at the newest arenas.
3. **Stale build published as green** — `dist-pass81` hand-copied; *existence* was checked,
   *freshness* was not.
4. **HF-454 / Chrome 153 Tint swizzle** — every QA smoke passes `--enable-unsafe-webgpu`,
   which is exactly why all gates were green while the owner's stock-flag Chrome never
   reached a live frame. Root cause VERIFIED in the ledger at 07:19 today.

That is a **false-green rate**, and it is currently unmeasured. It is loop L03 below and it is
the single most valuable number in this whole document.

## B3. Prior art in-repo: Lane AG was specified and **never landed**

`docs/pass84-lanes/LANE-AG-hillclimb-loop.md` (92 lines, VERIFIED) is an owner-driven ask
from 2026-09-02 17:35: *"ensure we continue to refactor, streamline, work in some kind of
hillclimb loop that uses low compute to improve everything … i want it super clean before i
start to really turn up the heat"*. It specifies eight ratchets (file line counts, duplicate
blocks, orphaned modules, hardcoded arena rosters, bundle size, per-frame call census, type
strictness debt, suite wall time), an agy/Gemini-Flash worker, an Opus batch skeptic, receipt
JSONs, and staged-not-scheduled installation.

**It did not happen.** VERIFIED: no `docs/hillclimb/`, no `scripts/hillclimb/`, no branch
matching `*hillclimb*`, no commit mentioning hillclimb, and the `aa-claude-hillclimb`
worktree does not contain the directory. Two days elapsed.

This is itself evidence for CP4's design: **a loop that depends on someone remembering to run
it does not run.** The adoption plan in Part H starts from the smallest thing that survives
being forgotten. Lane AG's eight ratchets are not discarded — they collapse into **L11** below,
as one index, so the work is not lost.

## B4. Constraints any design here must respect (VERIFIED from AKP + the repo)

- AKP `rules.md`: "Never weaken a verifier to pass. Verify outcomes, not success flags."
  (lines 427, 1032, 1192 — three separate statements of the same rule.)
- AKP `skill-regression-policy.json`: `default_regression_budget: 0`; required conditions
  `no_skill` / `description_only` / `description_plus_body`; required gates `new_target_pass`,
  `retained_baseline_pass`, `transfer_pass`, `policy_pass`; loosening requires the explicit
  `owner_approved_regression_override` field. Principle: "Freeze retained behavior before a
  change; reject unapproved regressions without weakening the verifier."
- `AGENTS.md`: one worktree, one owner, one bounded outcome; feature worktrees never publish;
  exit code 0 is not success; boot the app before claiming a candidate works.
- Machine: one GPU shared with the owner's ComfyUI/ollama/llama-server; headless browsers one
  at a time behind the semaphore; never kill processes we did not start.

---

# PART C — The loop catalogue

**PROPOSED.** Fifteen loops. Each is a hill-climb: one scalar, one direction, a frozen
measurement source, a cadence, a gate that can fail, and exactly one owner.

Naming: `L01`…`L15`. Every loop's definition lives in one version-controlled file,
`docs/loops/loops.yaml`, and every loop's *scorer* lives under `scripts/loops/scorers/` in a
directory that lane workers are forbidden to edit (Part D, rule R1).

## C0. The catalogue at a glance

| # | Loop | Scalar (direction) | Layer measured | Cadence | Owner |
|---|---|---|---|---|---|
| L01 | Stock-flags visitor boot | % of (arena × profile) that reach a live frame with **no** Chrome flags (↑) | product truth | per cut + daily | release |
| L02 | Owner pass-review rate | % of last 100 owner-visible tasks accepted first time (↑) | whole system | rolling 100 | orchestrator |
| L03 | **False-green rate** | % of owner-reported defects that a green gate should have caught (↓) | measurement itself | rolling 100 | orchestrator |
| L04 | Gotcha recurrence | % of incidents matching an already-recorded gotcha (↓) | memory | rolling 30 d | orchestrator |
| L05 | Frame budget | p1% frame time, worst arena, quiet window (↓) | product speed | per cut | graphics |
| L06 | Time to first playable frame | ms, cold cache, worst arena (↓) | product speed | per cut | performance |
| L07 | Token efficiency | tokens per **accepted** merged change (↓) | orchestration | daily | orchestrator |
| L08 | Value per pound | £ per owner-accepted improvement (↓) | orchestration | daily | orchestrator |
| L09 | Model routing fitness | accept-rate × cost-rank correlation per task class (↑) | models | weekly | orchestrator |
| L10 | Lane rework ratio | reverted-or-repaired lane-hours ÷ total lane-hours (↓) | orchestration | per pass | orchestrator |
| L11 | Repo shape index | composite of Lane AG's eight ratchets (↓) | architecture | hourly-capable | hillclimb worker |
| L12 | Skill efficacy | paired eval delta per changed skill (↑, budget 0) | skills | on skill change | skill author |
| L13 | Asset yield | % of generated assets that ship (↑) | assets | per asset batch | asset lane |
| L14 | Arena fidelity | reference-fidelity + traversability composite per arena (↑) | levels | per arena change | arena lane |
| L15 | Verification cost | GPU-minutes + wall-minutes per unit of gate confidence (↓) | measurement cost | weekly | orchestrator |

## C0b. Cross-check against today's owner asks (HF-455..468, VERIFIED)

Written after reading the current ledger. Every one of today's asks either lands on a loop or
changes a loop's definition — which is a good sign for the catalogue and a bad sign for
anything that ignores them.

| HF | Owner's ask (abridged) | Effect on this catalogue |
|---|---|---|
| **HF-455** | Standing rule: a human-in-the-loop preview, stock-Chrome green first, before every publish | **Promotes L01 to a precondition of the HITL build, not just of publish.** Adds a compliance check: a publish with no preceding HITL event is itself a false green. New event `hitl_preview`. |
| HF-456 | Bot/player spawns cluster in 1–2 places on all maps | Feeds **L14** — spawn-distribution becomes a scored component of arena fidelity (spread, recent-use avoidance, team-side awareness), with the existing spawn audits as the frozen scorer |
| HF-457, HF-463 | Z-fighting in houses, on stairs, and in the middle of the street | Feeds **L14** as a mechanical sub-metric (coplanar-surface detection), not a visual judgement. The owner has now reported this class **three times** — that is an **L04 recurrence** and should be routed as one |
| HF-458/459 | Killstreak tuning; HITL candidate 2; "OPEN: browser checks (VRAM held by the local model)" | Confirms **L15** and the semaphore design: verification blocked on the owner's own GPU load is a normal, reportable state, not a failure |
| **HF-460** | Qwen handoffs: "you can't be injecting thousands of context; just a bit, the tools it needs, be very specific" | **Adds a dimension to L07.** Token efficiency must be measured per *handoff*, with context-window size and tool count as reported fields — not just totals per lane. A harness that ships 60k of context to do a one-file edit is inefficient even if the lane succeeds |
| HF-461 | Nuke Town may be mirrored vs the real BO2 map | **L14's reference-fidelity component**, exactly the case it exists for |
| **HF-462 / HF-468** | Code-native asset forge; and the key assessment: Astra's loop adds "(1) reference gathering … (2) a critic that compares renders AGAINST the references, not against a rubric" | **Changes L13 and L14 materially.** Their scorers must be **reference-grounded** — capture vs first-party reference, side by side — rather than rubric-scored. A rubric critic is a scorer the optimiser can learn to satisfy; a reference is not. This is the same insight as AVO using the baseline's own timing script |
| HF-466 | Hide the original Nuketown; "keep gates deriving rosters" | Confirms **L14's** derived-roster rule verbatim — the owner has independently arrived at the "hardcoded gate rosters" lesson |
| HF-467 | Per-material penetration classes | Product work; no loop change (covered by the existing gameplay gates) |

Two of these are strong enough to change the design rather than just populate it: **HF-455**
(HITL as a standing precondition) and **HF-462/468** (reference-grounded critics over rubric
critics). Both are folded into the entries below.

Coverage against the owner's named axes: **speed** L05, L06 (and L15 for our own speed);
**accuracy** L01, L03, L14; **pass-review rate out of 100** L02; **gotcha hit rate** L04;
**token efficiency** L07; **value per pound** L08. The rest cover architecture (L11), models
(L09), orchestration (L10), skills (L12), levels (L14), assets (L13).

## C1. Loops in detail

Each entry: **metric** · **measurement source** · **cadence** · **gate** · **owner** · **notes**.

---

### L01 — Stock-flags visitor boot

- **Metric.** Percentage of (arena × graphics-profile) pairs that reach a live rendered frame
  in a browser launched with **stock flags**, from the real visitor path (menu → card →
  DEPLOY). Direction: ↑. Target: 100%. Anything below 100% is a P0.
- **Measurement source.** Extend the HF-454 probe already written today:
  `docs/evidence/pass93/chrome153-live-repro/` (stock-flag probe JSON per profile plus the
  probe script). Frozen scorer, no `--enable-unsafe-webgpu` anywhere in its argv, asserted by
  a unit test on the scorer itself.
- **Cadence.** Every build cut, plus one daily run against the live URL.
- **Gate.** Blocks **the HITL build**, and therefore publish. Per **HF-455** (owner, 2026-09-04
  08:25, standing rule): "It would be good to get a human in the loop preview before you
  publish it that's been debugged" — so the order is *L01 green → HITL build → owner plays →
  publish*, and a publish with no preceding `hitl_preview` event is itself recorded as a
  false green under L03. No override path in the script; the owner may still override in
  person and that is recorded as an event.
- **Owner.** Release lane.
- **Notes.** This loop exists because of HF-454. Its whole value is that the flag is absent.
  The scorer must assert the *absence* of the flag, not the presence of a pass. PASS 93 was
  the explicit hotfix exception to HF-455 and should be the last one.

### L02 — Owner pass-review rate out of 100

- **Metric.** Of the last 100 owner-visible tasks (an HF row, a lane deliverable, or a
  published pass), the percentage the owner accepted **without asking for a repair**.
  Direction: ↑.
- **Measurement source.** The HF ledger is the ground truth but is prose. **PROPOSED:** each
  HF row gains a machine-readable trailer line (`hf: 454 | state: repaired | first_pass: no |
  owner_verdict: rejected | closed: 2026-09-04T07:19Z`) appended by the orchestrator when the
  row closes. A parser emits one `owner_verdict` event per row into `quality-events.jsonl`.
- **Cadence.** Recomputed on every ledger write; reported daily as a rolling window of 100.
- **Gate.** Advisory only for the first 30 days (we have no baseline). After that, a
  **drop of more than 10 points against the trailing 100** opens a meta-loop review (Part D).
  It never blocks a merge — a gate that blocks on owner mood is a gate that gets gamed by
  not showing the owner things.
- **Owner.** Orchestrator.
- **Notes.** The gaming risk is severe and obvious: the rate improves if you show the owner
  fewer, safer things. Mitigation is the paired denominator — L02 is always reported next to
  the raw count of owner-visible tasks per day, and a fall in that count is treated as a
  regression in its own right.

### L03 — False-green rate (the keystone loop)

- **Metric.** Of the last 100 owner-reported or HITL-reported defects, the percentage for
  which a gate was green at the time and *should*, by its own stated purpose, have been red.
  Direction: ↓. Current estimate from the four incidents in B2: **unmeasured, and plausibly
  high**.
- **Measurement source.** A defect triage field. When a defect closes, the orchestrator
  records one of: `no_gate_existed` / `gate_existed_and_was_red` (good) /
  `gate_existed_and_was_green` (a false green) / `gate_existed_but_out_of_scope`. Emitted as
  a `defect_triage` event. The classification is a judgement call and must be made by a
  **different agent than the one that wrote the gate** — this is the prover/verifier split
  from AKP `rules.md`.
- **Cadence.** On every defect close; reported rolling-100 and 30-day.
- **Gate.** Every `gate_existed_and_was_green` event **must** produce, within the same pass,
  either (a) a strengthened gate with a test that fails on the old gate and passes on the new,
  or (b) a written statement of why the gate cannot be strengthened. Unresolved entries older
  than one pass are a publish blocker.
- **Owner.** Orchestrator; the strengthening work is assigned to the lane that owns the gate.
- **Notes.** This is the loop that would have caught all four B2 incidents, and it is the one
  the meta-layer optimises against. **L03 is the anchor: no meta-loop change may be adopted
  that makes L03 worse, ever, under any circumstances.** See Part D, rule R4.

### L04 — Gotcha recurrence rate

- **Metric.** Of incidents in the last 30 days, the percentage whose Symptom matches a gotcha
  already recorded in AKP `gotchas/` or the memory index. Direction: ↓ (a repeat means the
  gotcha did not reach the agent that needed it).
- **Measurement source.** At incident close, the closing agent must search the gotcha corpus
  and record `matched_gotcha: <id> | none`. To keep this honest, a second pass (cheap model,
  weekly) re-searches every incident's symptom text against the corpus and flags any incident
  marked `none` that has a match — the disagreement rate between the two is itself reported.
- **Cadence.** Rolling 30 days, reported daily.
- **Gate.** A recurrence does **not** block anything. It triggers a *routing* fix: the gotcha
  gets wired into the skill, `AGENTS.md` section, or lane brief template that the failing
  agent actually reads. A gotcha that recurs **twice** after a routing fix escalates to the
  meta-loop as evidence that the routing surface is wrong.
- **Owner.** Orchestrator.
- **Notes.** The failure this measures is not ignorance, it is retrieval. We have 60+ memory
  entries and a large gotcha corpus; recurrence means the index is not being hit at the right
  moment.

### L05 — Frame budget

- **Metric.** p1% frame time in ms, worst arena, worst supported profile, measured in the
  quiet window. Direction: ↓. (p1%, not mean — the owner reports stutter, not averages.)
- **Measurement source.** The existing headless gate used for the PASS 84 publish record
  ("Live smoothness, like-for-like (headless gate, atomic-acres, 120 s, same quiet window)" —
  VERIFIED in the ledger at line 232). Extended to all arenas, N=3 repeats, σ reported, per
  AVO's timing discipline.
- **Cadence.** Per build cut. Never during owner play or ComfyUI work — behind the browser
  semaphore, gated on the queue/VRAM check.
- **Gate.** Ratchet: may not regress against the last published pass by more than 1σ of the
  three repeats. A regression is a report, not a negotiation (`regression_gate.py`'s stance).
- **Owner.** Graphics lane.
- **Notes.** HF-450 ("the fps seemed bad but maybe as my pc is busy with qwen?") is exactly
  why the quiet-window condition and the σ are part of the definition rather than an
  afterthought.

### L06 — Time to first playable frame

- **Metric.** ms from DEPLOY click to first frame the player can act on, cold cache, worst
  arena. Direction: ↓.
- **Measurement source.** Same probe harness as L01, timing instrumented in the page rather
  than in the driver (driver-side timing measures the driver).
- **Cadence.** Per build cut.
- **Gate.** Ratchet against last published pass. **Important precedent:** Lane H's load-time
  deep cut was HELD from PASS 86 because it *regressed first loads* (VERIFIED, ledger line
  734) — so this loop must measure cold and warm separately and gate on the cold number,
  which is the one the owner experiences.
- **Owner.** Performance lane.

### L07 — Token efficiency

- **Metric.** Total tokens consumed ÷ number of changes that were merged **and** survived the
  pass without repair. Direction: ↓. Reported per orchestrator (Claude Code, Codex/Luna, OMP,
  agy) and per task class.
- **Measurement source.** Each harness's own usage reporting, normalised into the event
  stream at lane close. Where a harness does not report tokens (agy today — **UNRESOLVED**,
  I did not verify what `agy` emits), the loop records `tokens: null` and the coverage
  percentage is reported alongside the metric, so a low denominator cannot masquerade as
  efficiency.
- **Cadence.** Daily.
- **Gate.** Advisory. A 2x rise week-on-week for one harness opens a meta-loop review of that
  harness's routing (feeds L09).
- **Owner.** Orchestrator.
- **Second dimension, per HF-460.** The owner's instruction about Qwen handoffs — "you can't
  be injecting thousands of context; just a bit, the tools it needs, be very specific" — makes
  *per-handoff* context a first-class measure, not a rollup. Each delegated call reports
  `context_tokens`, `tool_count`, and `files_in_scope`. A 60k-token context to perform a
  one-file edit is inefficient even when the lane succeeds, and the totals-only version of
  this metric cannot see it. The already-applied fix (contextWindow 61440, `--no-skills
  --no-lsp`, one file per call, exact edit spec) is the baseline this dimension ratchets
  against.
- **Notes.** The denominator is deliberately *surviving merged* changes, not merged changes.
  Cheap output that gets repaired next pass is not efficient.

### L08 — Value per pound

- **Metric.** £ spent ÷ number of owner-accepted improvements, over a rolling 7 days.
  Direction: ↓.
- **Measurement source.** Spend per harness (subscription amortised daily + metered API spend
  where applicable) joined to `owner_verdict: accepted` events from L02. Local models
  (Qwen on :8090, agy) cost electricity and GPU time, not pounds; they are recorded with a
  **separate** `gpu_minutes` field and never folded into £ — a fake zero is worse than an
  honest second column.
- **Cadence.** Daily; 7-day rolling.
- **Gate.** Advisory, plus a hard budget guard that already exists in spirit (HF-447, "budget
  guard" — VERIFIED in the ledger).
- **Owner.** Orchestrator.
- **Notes.** This is the metric most likely to be reported dishonestly by whoever is under
  budget pressure. Its inputs must come from harness usage APIs, never from an agent's own
  estimate.

### L09 — Model routing fitness

- **Metric.** Per task class (mechanical-verifiable / research / code-generation /
  visual-judgement / orchestration), the accept-rate of each model, and the £-and-token cost
  at that accept rate. Scalar for hill-climbing: the fraction of task-class volume currently
  routed to the *cheapest model that meets the class's accept-rate floor*. Direction: ↑.
- **Measurement source.** Lane close events carry `model`, `task_class`, `verdict`. Joined
  weekly.
- **Cadence.** Weekly.
- **Gate.** No auto-reroute. The loop **proposes** a routing change; the orchestrator adopts
  it. This is deliberate: the memory record "Gemini Flash task fit" (owner, 2026-09-03) is
  that Gemini 3.8 Flash **fabricates research** and must get mechanical verifiable tasks only,
  with Opus verifying. A loop that optimises cost without that constraint will re-learn that
  lesson expensively. The constraint is encoded as a per-class model allowlist that the loop
  may not widen.
- **Owner.** Orchestrator.

### L10 — Lane rework ratio

- **Metric.** (Lane-hours whose output was reverted, held, or repaired in a later pass) ÷
  (total lane-hours). Direction: ↓.
- **Measurement source.** Lane briefs and their close records. The ledger already contains the
  raw material — e.g. HF-410 MERGED with option (a), Lane H HOLD, Nuke Town tip-top branch
  DO-NOT-SHIP — but as prose. Needs the same machine-readable trailer as L02.
- **Cadence.** Per pass.
- **Gate.** Advisory. Above 40% for two consecutive passes, the meta-loop reviews lane
  *sizing* (are briefs too big?) and *entry criteria* (did the lane start from a verified base?).
- **Owner.** Orchestrator.

### L11 — Repo shape index (Lane AG, rescued)

- **Metric.** A single index composed of Lane AG's eight ratchets, each normalised to its
  baseline: files over 2,000 lines; duplicate token-shingle blocks; orphaned modules; hardcoded
  arena roster literals outside the registry; production bundle bytes and chunk count; per-frame
  call census (`updateWorldMatrix`, `getObjectByProperty`, `traverse`); `any` / `as unknown as`
  / `@ts-ignore` counts; full-suite wall time. Direction: ↓.
- **Measurement source.** `scripts/hillclimb/` per LANE-AG (**does not exist yet** — VERIFIED)
  plus the existing `scripts/qa/find-unreachable-modules.mjs`.
- **Cadence.** Capable of hourly; **staged, not scheduled**, exactly as Lane AG specified — the
  owner turns the scheduler on after reading the first receipts.
- **Gate.** Ratchet per component, not on the index: a change that improves the index while
  moving any single component the wrong way is **rejected automatically**. (Lane AG's rule,
  kept verbatim in intent — a composite index is otherwise trivially gamed by trading a
  visible ratchet for an invisible one.)
- **Owner.** The cheap hillclimb worker (agy/Gemini-Flash-high per Lane AG), with an Opus
  batch skeptic over N receipts.
- **Notes.** `src/legacy-main.ts` is never in scope as a whole file; only a marked region with
  a declared extraction target, and the existing `src/legacy-main-size-ratchet.test.ts`
  `CEILING_HISTORY` remains the authority on its size.

### L12 — Skill efficacy

- **Metric.** For each changed skill, the paired evaluation delta across the four required
  gates. Direction: ↑ with `default_regression_budget: 0`.
- **Measurement source.** AKP `skill-regression-policy.json` — required conditions `no_skill`,
  `description_only`, `description_plus_body`; required gates `new_target_pass`,
  `retained_baseline_pass`, `transfer_pass`, `policy_pass`. VERIFIED as the existing policy;
  this loop does not invent a scheme, it *reports* the one AKP already mandates.
- **Cadence.** On every skill change. Skills are a **junction** into the canonical vault store
  and edits are instantly live in every harness (memory: "Shared skill store"), so this loop is
  the only thing standing between a careless edit and five harnesses changing behaviour.
- **Gate.** Blocking. No evaluation record, no adoption. Loosening requires the explicit
  `owner_approved_regression_override` field — the loop reports every use of it, by name.
- **Owner.** The skill's author.

### L13 — Asset yield

- **Metric.** Of assets generated in a batch (ComfyUI, Blender authoring scripts, texture
  generators), the percentage that ship in a published pass. Direction: ↑.
- **Measurement source.** Asset authoring scripts already exist and are numerous
  (`author:blender-*`, `author:pass65:menu-previews`, `generate-*-pbr.py` — VERIFIED in
  package.json). Each batch writes a manifest; the publish plan test reports which manifest
  entries appear in `dist`.
- **Cadence.** Per asset batch.
- **Gate.** Advisory. Below 30% yield for two batches triggers a review of the *brief*, not the
  generator — low yield usually means the acceptance criteria were never written down.
- **Second component, per HF-462/468 — reference-grounded, not rubric-scored.** The owner's
  own assessment of the Astra threads names the two things our gauntlet lacks: "(1) reference
  gathering (real photos/drawings as the target), (2) a critic that compares renders AGAINST
  the references, not against a rubric." So each asset subject carries a first-party reference
  set, and the scorer is a side-by-side capture-vs-reference comparison. **This is the same
  structural principle as AVO using FlashAttention-4's own timing script:** a rubric is a
  scorer the optimiser can learn to satisfy; a reference photograph is not.
- **Owner.** Asset lane.
- **Notes.** This loop also protects GPU time: assets are the biggest local-GPU consumer we
  control, and the owner shares that GPU. The `morning-diner` reference clone
  (`C:\Users\david\projects\morning-diner-ref`, read-only) is prior art for the code-native
  side and is where R1's diner-method draft comes from.

### L14 — Arena fidelity

- **Metric.** Per arena, a composite of (a) reference fidelity where a reference exists — the
  measured-from-first-party-minimap approach used for Nuke Town (VERIFIED, ledger line 948),
  extended per HF-462/468 to **capture-vs-reference comparison rather than rubric scoring**;
  (b) mechanical traversability/passability sweep pass rate; (c) **coplanar-surface count**
  (the z-fighting class the owner has now reported three times: HF-457 houses, HF-457 stairs,
  HF-463 street centre-line — fix by geometric rule, not by offsets); and (d) **spawn
  distribution** per HF-456 (spread, recent-use avoidance, team-side awareness, minimum count
  per arena). Direction: ↑.
- **Measurement source.** The existing whole-world mechanical sweeps (traversability and
  draw-call budgets) plus `scripts/qa/audit-walkable-surface-parity.ts`,
  `arena-roster-contract.test.mjs`, `arena-viewpoint-regression.test.mjs`, and the spawn
  audits named in HF-456.
- **Cadence.** On any arena change.
- **Gate.** Ratchet per arena. Rosters must be **derived, never literal** — the "hardcoded gate
  rosters" gotcha means this loop's scorer must enumerate arenas from the registry and assert
  cross-arena distinctness, or it will measure four arenas and call it six.
- **Owner.** Arena lane.

### L15 — Verification cost per unit confidence

- **Metric.** GPU-minutes plus wall-minutes spent on gates, divided by the number of *distinct
  defect classes* those gates are demonstrated to catch (demonstrated = the gate has a test
  that fails when the defect is reintroduced). Direction: ↓.
- **Measurement source.** Timing already characterised in `verify.py`'s header (tsc 11.5 s /
  3.41 GB; full vitest 27.9 s / 5.63 GB; warm incremental 3.6 s / 2.52 GB; single-dir vitest
  2.6 s / 1.89 GB — VERIFIED). Extended with the browser-semaphore hold times.
- **Cadence.** Weekly.
- **Gate.** Advisory, and **explicitly one-directional**: this loop may propose making
  verification *cheaper*, never *weaker*. A proposal that removes a gate is only admissible if
  it also demonstrates that another gate catches the same defect class — proven by
  reintroducing the defect and watching the surviving gate go red. Rule R3 in Part D.
- **Owner.** Orchestrator.
- **Notes.** This is the most dangerous loop in the catalogue and it is included deliberately.
  Verification cost is real and will otherwise be cut by whoever is impatient, invisibly. Better
  to make the pressure explicit and bound it.

---

# PART D — The meta-loop protocol

**PROPOSED.** The meta-loop is the layer that changes the loops. It is, by construction, a
machine for weakening verifiers. Everything below exists to make it a *safe* one.

## D0. The governing insight

Karpathy's design is safe because `prepare.py` is read-only. AVO's is safe because the scorer
is the baseline's own timing script. Both are safe because **the thing being optimised cannot
touch the thing doing the judging.** A meta-loop deliberately breaks that separation. So the
separation has to be re-established one level up: the meta-loop can change a loop's
definition, but it cannot change *the meta-loop's own* acceptance test, and it cannot make L03
(false-green rate) worse.

## D1. The five triggers (from AVO's supervisor, adapted)

A loop enters meta-review when, and only when, one of these fires. **No schedule.** A
scheduled meta-loop is a scheduled invitation to fiddle.

| Trigger | Condition | What it usually means |
|---|---|---|
| **T1 Stagnation** | The loop's scalar has not moved outside ±1σ for N consecutive cadences (N=10 default) | The loop is measuring something already solved, or something it cannot see |
| **T2 Saturation** | The scalar is pinned at its best possible value for N cadences | The gate is too loose to discriminate |
| **T3 Blindness** | An L03 `gate_existed_and_was_green` event names this loop | The definition has a hole the owner found first |
| **T4 Cost** | The loop's own measurement cost (L15) exceeds a declared budget | We are paying more to measure than the defect costs |
| **T5 Contradiction** | Two loops move in opposite directions on the same change, twice | The loops encode a trade-off nobody has decided |

## D2. The proposal grammar — what a meta-change may say

A meta-proposal is a structured diff against `docs/loops/loops.yaml`, restricted to seven
edit types. **Anything outside this grammar is not a meta-proposal; it is a spec change and
goes to the owner.**

| Type | Example | Direction class |
|---|---|---|
| `E1 tighten_threshold` | p1% budget 22 ms → 20 ms | TIGHTEN |
| `E2 widen_scope` | L01 covers 4 arenas → all 6 | TIGHTEN |
| `E3 add_repeats` | N=1 → N=3, report σ | TIGHTEN |
| `E4 change_statistic` | mean → p1% | NEUTRAL (must pass witness replay) |
| `E5 change_source` | driver-side timing → in-page timing | NEUTRAL (must pass witness replay) |
| `E6 loosen_threshold` | regression tolerance 1σ → 2σ | **LOOSEN** |
| `E7 narrow_scope` / `retire_loop` | drop a profile; delete a loop | **LOOSEN** |

## D3. Witness replay — the loop's own regression suite

**This is the mechanism that makes the whole thing safe, and it is the part I would build
first.**

Every loop carries a **witness set**: a frozen list of historical events that the loop, as
currently defined, *does* flag. Seeded from the four B2 incidents and grown by one entry
every time L03 records a false green.

Initial witnesses (all VERIFIED as real historical incidents):

| Witness | Incident | Loop it belongs to |
|---|---|---|
| `W-chrome153-stockflags` | HF-454: builds boot only with `--enable-unsafe-webgpu` | L01 |
| `W-debug-backdoor` | gates green while owner cannot launch; harnesses filled a field a visitor lacks | L01 |
| `W-hardcoded-roster` | gates never looked at the newest arenas | L14 |
| `W-stale-dist` | `dist-pass81` hand-copied; existence checked, freshness not | L01 / release plan test |
| `W-quiet-window` | HF-450: FPS measured while the machine ran Qwen | L05 |
| `W-cold-load-regress` | Lane H's load cut regressed first loads while improving warm ones | L06 |
| `W-coplanar-zfight` | HF-457 / HF-463: z-fighting reported three times (houses, stairs, street) and shipped each time | L14 |
| `W-forked-ledger` | Three worktrees, three "current" ledgers, no divergence marker (found writing this doc) | L03 tooling |

**Rule:** any proposed redefinition must be run against the witness set *before* adoption, and
must still flag **every** witness. A proposal that drops a witness is rejected automatically,
with no override path in the tooling. This is `retained_baseline_pass` from
`skill-regression-policy.json`, applied to loops instead of skills — the same idea, and
deliberately so, because AKP already mandates it and consistency is cheaper than novelty.

## D4. The protocol, M1–M7

- **M1 Trigger.** One of T1–T5 fires. A `meta_trigger` event is written. Nothing else happens
  automatically.
- **M2 Propose.** An agent (any harness) writes a `meta_proposal`: the trigger, the edit type
  from D2, the diff to `loops.yaml`, the hypothesis in one sentence, and the predicted effect
  on **L03** and on the loop's own scalar. Predicting the effect *before* measuring is
  mandatory — it is the only cheap protection against post-hoc rationalisation.
- **M3 Witness replay.** The proposed definition is run against the loop's witness set. Any
  witness not flagged ⇒ **reject, no appeal.** Result recorded as `meta_replay`.
- **M4 Shadow.** The new definition runs **alongside** the old for a declared shadow period
  (default: 3 cadences, or 7 days, whichever is longer). It gates nothing. Both scalars are
  recorded. This is the step everyone will want to skip and it is the step that catches the
  metric that looks better because it measures less.
- **M5 Adjudicate.**
  - **TIGHTEN** proposals (E1–E3) that passed M3 and did not increase L03 during shadow:
    **auto-adopt.** Tightening is always allowed to proceed on its own.
  - **NEUTRAL** proposals (E4–E5): adopt if M3 passed, L03 did not worsen, and the shadow
    period showed the new statistic and old statistic agree on every historical accept/reject
    decision in the window. Otherwise escalate.
  - **LOOSEN** proposals (E6–E7): **never auto-adopt.** They require the owner, by name, in
    the ledger, recorded with the AKP field `owner_approved_regression_override`. The agent
    may argue for them; it may not enact them.
- **M6 Adopt.** `loops.yaml` version bumps; the change is committed with the proposal, the
  replay result and the shadow data attached, in the AVO pattern of persisting each accepted
  step with its score. The old definition is retained in the file, marked superseded, so
  reverting is a one-line change rather than an archaeology exercise.
- **M7 Revert.** Automatic revert conditions, checked every cadence for 3 cadences after
  adoption: L03 worsened; the loop's scalar moved more than 3σ in the "improved" direction
  (a jump that large is a measurement change, not a real gain — treat it as a bug until
  proven otherwise); or any witness stops flagging. Revert is to the immediately previous
  definition and is a report, never a silent rollback.

## D5. The five hard rules

- **R1 — Frozen scorer partition.** `scripts/loops/scorers/**` and `docs/loops/witnesses/**`
  are outside every lane's ownership. A lane worker may never edit them, exactly as
  `prepare.py` is outside the autoresearch agent's reach. Enforced by a path check in the
  commit gate, not by a request in a brief.
- **R2 — Never weaken a verifier to get green.** AKP `rules.md`, stated three times in that
  file. Restated here in operational form: **the meta-loop may not be used to make a red gate
  green.** If a gate is red, the meta-loop is closed for that gate until the gate is green by
  fixing the work. A LOOSEN proposal filed while its loop is red is rejected on sight.
- **R3 — Cost cuts must be proved equivalent.** L15 may propose removing or cheapening a gate
  only by demonstrating another gate catches the same defect class — by reintroducing the
  defect and watching the surviving gate go red. A claim of equivalence without that
  demonstration is not admissible.
- **R4 — L03 is the anchor and is not itself meta-editable.** The false-green loop's
  definition may be *tightened* by owner action only. No automatic proposal may touch it. If
  the meta-layer could redefine what counts as a false green, everything above is theatre.
- **R5 — Zero score on correctness failure.** AVO's rule, adopted verbatim in spirit: a
  candidate that fails a correctness gate scores zero on every other loop, regardless of how
  good its speed or cost numbers are. A fast broken build does not get partial credit.

## D6. Self-healing, honestly scoped

The owner asked for "self-healing". What is achievable and what is not:

- **Achievable now:** a loop whose scorer crashes or produces no data for 2 consecutive
  cadences is auto-marked `stale` and its gate is **treated as red, not as absent** — the
  inverse of the usual failure mode, where a broken measurement silently stops blocking
  anything. This one rule would have caught the stale-dist incident class.
- **Achievable now:** flake handling by isolation re-run, already solved and battle-tested in
  `regression_gate.py`; the loop framework should call that code rather than reimplement it.
- **Not achievable, and should not be claimed:** a system that notices it is measuring the
  wrong thing without a human reporting a defect. T3 (blindness) is driven by owner-reported
  defects. That is a human in the loop, and pretending otherwise is how we get another set of
  green gates over a broken build.

---

# PART E — The event schema (shared with CP3)

**PROPOSED, and a coordination point.** CP3 owns `quality-events.jsonl`; CP4 consumes it and
adds three event types. **UNRESOLVED:** at the time of writing, no `quality-events.jsonl`
exists anywhere I searched, and no CP3 document exists in
`docs/research/2026-09-04/`. The schema below is CP4's proposal; **CP3's version wins on
conflict** for the fields it already defines. Everything in E2 is additive and namespaced so
that a merge is mechanical.

## E1. Common envelope

One JSON object per line, append-only, never rewritten. Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | `ev_<ISO8601 compact>_<8 hex>` — same shape as AKP `events.jsonl` ids (VERIFIED: `akp_20260829T074604258Z_49b277ee`) |
| `time` | string | ISO 8601 with `Z` |
| `type` | string | see E2 |
| `source` | string | `claude-code` \| `codex-luna` \| `omp` \| `agy` \| `hermes` \| `human` |
| `machine` | string | `dave-gaming-pc` \| `jigglyclaw-wsl` |
| `pass` | integer \| null | e.g. 93 |
| `lane` | string \| null | e.g. `CP4`, `LANE-AG` |
| `commit` | string \| null | 8+ hex, the head the event describes |
| `schema` | integer | `1` |

Rationale for matching AKP's envelope: it already exists, agents already write it, and one
shape across both files means the digest can read them together.

## E2. CP4's event types

```jsonc
// A single loop measurement.
{"type":"loop_measure","loop":"L05","scalar":18.4,"unit":"ms_p1",
 "direction":"lower_better","n_repeats":3,"sigma":0.7,
 "scorer_sha":"<sha of the frozen scorer file>","conditions":{"quiet_window":true,
 "arena":"nuketown-rebuild","profile":"quality","flags":[]},"verdict":"pass"}

// A gate decision derived from one or more measurements.
{"type":"loop_gate","loop":"L01","verdict":"fail","blocking":true,
 "reason":"2 of 18 arena x profile pairs never reached a live frame",
 "evidence":"docs/evidence/pass93/chrome153-live-repro/"}

// Owner or HITL verdict on an owner-visible task. Feeds L02 and L08.
{"type":"owner_verdict","hf":454,"verdict":"rejected","first_pass":false,
 "surface":"published-pass","closed":"2026-09-04T07:19:00Z"}

// Defect triage. Feeds L03. MUST be written by an agent that did not author the gate.
{"type":"defect_triage","defect":"HF-454","classification":"gate_existed_and_was_green",
 "gate":"qa:cross-browser","loop":"L01","triaged_by":"claude-code",
 "gate_author":"omp","remediation":"open"}

// HITL preview, per HF-455. A publish with no preceding hitl_preview is a false green.
{"type":"hitl_preview","candidate":"c3880181","branch":"pass93-candidate",
 "served":"http://127.0.0.1:4300/","l01_verdict":"pass",
 "owner_played":true,"owner_findings":["HF-461","HF-463","HF-464","HF-465"]}

// Gotcha match at incident close. Feeds L04.
{"type":"gotcha_match","defect":"HF-454","matched_gotcha":"chrome153-tint-chained-swizzle",
 "recurrence":true,"routing_fix":"open"}

// Lane close. Feeds L07, L08, L10.
{"type":"lane_close","lane":"CP4","model":"claude-opus-5.1","task_class":"research",
 "tokens_in":184000,"tokens_out":21000,"gbp":null,"gpu_minutes":0,
 "wall_minutes":41,"outcome":"delivered","reworked":false}

// --- the three meta types ---
{"type":"meta_trigger","loop":"L05","trigger":"T1_stagnation",
 "detail":"scalar within +/-1 sigma for 10 cadences"}

{"type":"meta_proposal","proposal":"MP-0007","loop":"L05","edit_type":"E4_change_statistic",
 "diff":"docs/loops/loops.yaml@L05.statistic: mean -> p1",
 "hypothesis":"mean hides the stutter the owner reports",
 "predicted_effect":{"L05":"worse_number_same_reality","L03":"unchanged"},
 "direction_class":"NEUTRAL"}

{"type":"meta_decision","proposal":"MP-0007","stage":"M5_adjudicate",
 "replay":{"witnesses":6,"flagged":6,"pass":true},
 "shadow":{"cadences":3,"L03_delta":0.0},
 "decision":"adopted","approved_by":"auto",
 "owner_approved_regression_override":null}
```

## E3. Invariants

1. **Append-only.** No line is ever edited or deleted. Corrections are new events with
   `corrects: <id>`.
2. **A `loop_measure` without a `scorer_sha` is invalid** and is dropped by the reader. This
   is what makes a measurement attributable to a *frozen* scorer rather than to whatever the
   agent had checked out.
3. **`conditions.flags` must be present and explicit on any browser measurement.** An empty
   array means stock flags. A non-empty array on L01 is an automatic fail. This single field
   is the HF-454 lesson encoded in the schema.
4. **`defect_triage.triaged_by` must differ from `gate_author`.** Enforced by the reader, not
   by convention.
5. **Rotation:** one file per month, `quality-events-YYYY-MM.jsonl`, with a stable symlink or
   pointer file. Never truncate.

---

# PART F — How the orchestrators report

**PROPOSED.** The rule is uniform: **nobody writes the file directly.** Every harness appends
through one small CLI, `scripts/loops/emit.mjs`, which validates against the schema and
refuses invalid events. Direct appends are how a shared JSONL rots.

| Harness | How it reports | Notes / gaps |
|---|---|---|
| **Claude Code (orchestrator + Opus lanes)** | Lane brief template gains a mandatory closing block: run `emit.mjs lane-close …`. The orchestrator emits `owner_verdict` and `defect_triage` when it closes an HF row. | The orchestrator is the only agent allowed to write `owner_verdict` — it is the only one that talks to the owner. |
| **Codex / Luna** | Same `emit.mjs`, invoked from the lane's close step. | Already produces evidence dirs (`aa-claude-hitl/docs/evidence/pass93/hitl-repro/` — VERIFIED). Token accounting: **UNRESOLVED**, I did not verify what Codex reports. |
| **OMP jobs** | `gauntlet_v2.py` and `run_teams.py` gain one call per round: `loop_measure` for the tier-2 result, `lane_close` per agent. | Precedent exists: `regression_gate.py` already writes `artifacts/regression-floor.json`. This is the same discipline pointed at a shared file. |
| **agy / Gemini Flash (hillclimb worker, L11)** | Emits a receipt JSON per iteration per Lane AG's design; a wrapper converts the receipt to a `loop_measure` + `lane_close` pair. | The worker must **not** call `emit.mjs` for gate verdicts — mechanical, verifiable tasks only (memory: "Gemini Flash task fit"). |
| **Hermes** | Owns the daily digest cron (Part G) and the weekly L09/L15 joins. | Hermes is the right home because it already runs low-cost crons and the memory index records that the PASS 85–88 crons died silently — so the digest must self-report its own last-run time (see G3). |
| **Local Qwen (:8090)** | Not a reporter. Records `gpu_minutes` when it does work, via the calling harness. | Never given judgement roles in this system. |

**Cross-machine:** `jigglyclaw-wsl` writes its own file. They are never merged automatically —
per CLAUDE.md, "Its receipts and paths are its own; never assume parity or borrow them." The
digest may show both, side by side, labelled.

---

# PART G — Dashboard tab and daily digest

## G1. Where the tab lives

**PROPOSED:** as a tab in the existing Foundry cockpit (`C:/Users/david/projects/foundry-os`,
memory records a control-plane POC on :47821 — **not independently verified this session**,
so confirm the port and the tab-registration mechanism before building). Rationale: the owner
already has one control plane; a second dashboard is a second thing to forget.

**Fallback if the cockpit cannot host a tab cheaply:** a static HTML page regenerated by the
digest job and opened from a desktop shortcut. Deliberately not an Artifact — this is internal
operating data, and the standing no-publish rule for this project applies.

## G2. What the tab shows — three rows, nothing more

1. **The fifteen scalars.** One row per loop: current value, direction arrow against last
   cadence, σ, cadence, last-measured timestamp, and — this is the important column —
   **`stale?`**. A loop that has not measured within 2 cadences renders red, not blank. Blank
   is how a dead measurement looks like a healthy one.
2. **L03 front and centre, alone.** The false-green rate gets its own panel above the grid,
   with the list of unresolved `gate_existed_and_was_green` entries and how many passes each
   has been open. This is the number the owner should look at first.
3. **The meta ledger.** Open proposals with their stage (M1–M7), and every LOOSEN proposal
   waiting on the owner, with a one-line hypothesis each. The owner's approval queue.

Explicitly **not** on the tab: sparkline walls, per-agent leaderboards, anything that invites
optimising the display. Fifteen numbers and a queue.

## G3. The daily digest

- **Cadence.** Once, in the morning, before the owner starts. Delivered per the owner's
  existing messaging preference (Telegram protocol exists as a skill; confirm with the owner
  rather than assuming).
- **Length.** Under 20 lines. A digest nobody reads is worse than none.
- **Contents, in this order:**
  1. **Loops that moved the wrong way** (with the σ, so noise is visible as noise).
  2. **L03**: false-green count in the last 100 defects, and any entry open more than one pass.
  3. **LOOSEN proposals awaiting the owner** — the approval queue, by name.
  4. **Stale loops** — anything not measured on cadence, and for how long.
  5. **Spend** — yesterday's £ and GPU-minutes, and L08.
  6. **One line per orchestrator**: lanes closed, rework ratio, tokens per accepted change.
- **Self-reporting requirement.** The digest states its own last successful run and the age of
  the newest event it read. The memory record "crons dead" from the 2026-09-03 overnight is
  the reason: a silent cron is indistinguishable from a quiet day, and this line is what makes
  them distinguishable.

---

# PART H — Adoption plan, three steps

**PROPOSED.** Sized so that step 1 is worth having on its own if steps 2 and 3 never happen —
which, on the evidence of Lane AG, is a real possibility that the plan should survive.

## Step 1 — The ledger and three loops (half a day, one lane)

Build the smallest thing that accumulates.

- `scripts/loops/emit.mjs` (schema validation, append-only) and the schema from Part E as a
  JSON Schema file with a unit test.
- `docs/loops/loops.yaml` with all fifteen definitions **written down but only three armed**.
- Arm **L01** (stock-flags visitor boot — extend today's HF-454 probe, which already exists),
  **L03** (false-green rate — a triage field and a parser, no new measurement machinery), and
  **L11** (repo shape index — Lane AG's ratchets, finally landed).
- Seed the eight witnesses from D3 as files under `docs/loops/witnesses/`.
- Wire **HF-455**: the release plan test refuses a publish whose candidate has no
  `hitl_preview` event with `l01_verdict: pass`. This is one assertion and it enforces the
  owner's standing rule mechanically instead of by memory.
- Path guard: `scripts/loops/scorers/**` and `docs/loops/witnesses/**` in a protected-path
  check, so R1 is enforced rather than requested.

**Exit criterion (mechanical):** `quality-events.jsonl` contains at least one real
`loop_measure` for each of L01, L03, L11 from an actual run; the witness replay passes on all
eight; the path guard rejects a test edit to a scorer; and a publish attempt with no
`hitl_preview` is refused by the plan test.

Why these three: L01 is the incident of today, L03 is the keystone, L11 is the owner's
already-asked-for hill-climb that has been sitting unbuilt for two days.

## Step 2 — The digest, the tab, and the rest of the loops (one to two days)

- Arm L02, L04, L05, L06, L07, L08, L10, L12 — each needing the machine-readable ledger
  trailer (L02, L10) or a normalisation wrapper around an existing measurement (L05, L06) or
  an existing AKP policy (L12).
- Land the digest as a Hermes cron with the self-reporting line from G3.
- Land the cockpit tab (G2), or the static fallback.
- Wire `emit.mjs` into the lane brief template, `gauntlet_v2.py`, and the Codex/agy close
  steps (Part F).

**Exit criterion:** the digest arrives two mornings running with real numbers, and the second
morning's numbers differ from the first for a reason the digest can name.

## Step 3 — Arm the meta-loop, TIGHTEN-only (one day, then run for two weeks)

- Implement M1–M7 with **E6/E7 (LOOSEN) disabled in code**, not merely discouraged. The
  meta-loop's first fortnight can only tighten, widen and add repeats.
- Implement witness replay (M3) and the shadow runner (M4).
- Arm the remaining loops L09, L13, L14, L15.
- After two weeks of TIGHTEN-only operation with a clean L03, present the owner with the
  LOOSEN queue and ask whether to enable E6/E7 behind
  `owner_approved_regression_override`. **That is an owner decision, and this document does
  not pre-authorise it.**

**Exit criterion:** at least one meta-proposal has gone trigger → proposal → replay → shadow →
adopt, and at least one has been rejected at replay. A meta-loop that has never rejected
anything has not been tested.

---

# PART I — Open questions, risks, and what I did not verify

## I1. OPEN — must be answered before Step 1

1. **The ledger is forked across worktrees** — 1,337 / 1,389 / 1,489 lines in
   `aa-omp-pass84` / `aa-claude-hitl` / `aa-claude-research`, with no divergence marker.
   HF-455..468 exist and are folded in (C0b); **HF-469..473, named in the lane brief, do not
   exist in any copy I read** — either the brief anticipated them or they live somewhere I did
   not look. Re-check before Step 1. The forked ledger itself should be fixed or given a
   single canonical location; three "current" ledgers is a false-green generator.
2. **CP3's `quality-events.jsonl` schema is unwritten.** Part E is a proposal; CP3 wins on
   conflict. Someone must reconcile the two before either is built.
3. **Foundry cockpit tab mechanism and port unverified.** Memory says :47821; I did not check.
4. **Token/cost reporting for Codex/Luna and agy is unverified.** L07 and L08 are only as good
   as their coverage, and coverage must be reported alongside the metric from day one.
5. **Who owns the loop framework?** Fifteen loops with no single owner is fourteen loops with
   no owner. Lane AG's fate is the evidence.
6. **Delivery channel for the digest** — confirm with the owner rather than assuming Telegram.

## I2. Risks I would name to the owner directly

- **The meta-loop is the most dangerous thing in this document.** It is a system whose job is
  to change the rules that catch our mistakes. The witness replay (D3) and the L03 anchor (R4)
  are what stand between it and a fully automated way to make every gate green. If either is
  cut for time, do not build the meta-loop at all — build the loops and leave the meta layer
  as a human review meeting. That is a worse system and an honest one.
- **L02 and L08 are gameable by showing the owner less.** Both are reported with their raw
  denominators for exactly this reason, and the denominators should be in the digest.
- **Fifteen loops is at the top of the owner's range and probably too many to start.** Step 1
  arms three deliberately. Writing all fifteen down now is cheap; arming them is not.
- **This adds measurement cost to a machine that is already contended.** L15 exists to keep
  that visible, and every browser-touching loop runs behind the existing semaphore.

## I3. What I did not do

- Wrote no code, created no worktree, ran no gates, opened no browser, committed nothing.
- Did not re-read arXiv 2603.23420 properly; my summary of it is low-fidelity and flagged.
- Did not verify NVIDIA's ARC-AGI-3 numbers independently (no replication exists that I found).
- Did not check whether any of the fifteen loops duplicates something CP1/CP2/CP3/CP5 is
  already specifying.

## I4. Sources

- <https://github.com/karpathy/autoresearch> — fetched 2026-09-04
- <https://raw.githubusercontent.com/karpathy/autoresearch/master/program.md> — fetched 2026-09-04
- <https://skypilot.ai/blog/scaling-autoresearch/> — fetched 2026-09-04
- <https://arxiv.org/abs/2603.24517> and <https://arxiv.org/html/2603.24517v1> — AVO, fetched 2026-09-04
- <https://developer.nvidia.com/blog/nvidia-avo-reaches-100-on-arc-agi-3-demonstrating-a-frontier-level-general-purpose-architecture-for-long-horizon-autonomous-agents/> — fetched 2026-09-04
- <https://arxiv.org/pdf/2603.23420> — Bilevel Autoresearch, fetched 2026-09-04, LOW FIDELITY
- Local, read this session: `scripts/orchestration/{regression_gate,verify,governor,gauntlet_v2}.py`,
  `docs/pass84-lanes/LANE-AG-hillclimb-loop.md`, `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`,
  `AGENTS.md`, AKP `rules.md`, `skill-regression-policy.json`, `events.jsonl`.
