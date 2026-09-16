# ORCHESTRATOR HANDOFF — OMP/GLM → Muse Spark 1.3 Contributor

Handoff time: 2026-09-13 ~19:4x UK. Owner: Dave (resting ~1-2h, then reviews images; overnight =
implementation after his approval). Outgoing orchestrator: OMP session on zai/glm-5.3-flash
(winding down — z.ai quota 60% hourly / 75% weekly; owner caps z.ai at ONE subagent from here).

## Owner decisions in force

1. **You (Muse Spark 1.3 Contributor, xhigh) are the new main orchestrator.** Your sub-agents:
   2-3 × Muse (spawn `omp -p --model meta/muse-spark-1.3-contributor --thinking xhigh` headless),
   2-3 × Gemini (`agy --model gemini-3.8-flash-high`), 1-2 × Opus (`claude -p --model opus
   --effort xhigh`). **z.ai: maximum ONE subagent**, best-suited role only (mechanical file work).
2. **Image-run first, then owner review, then overnight implementation.**
3. **ENVIRONMENT-FIRST** art fan-out; weapons = detail tweaks only (fingers, textures, lighting,
   scopes, firing animation + arms/bot studies). No weapon re-models.
4. **LAYOUT CONTRACT IS BINDING**: `LAYOUT_CONTRACT.md` (same folder). Every map image must match
   the 18 concept images (desert surround, teal-vs-yellow facing houses, horseshoe loop, bus+rig
   center, north welcome entrance, south jeep+sandbags, four concrete pads). Owner: "don't let it
   drift into something else." Concepts: `C:/Users/david/Documents/Codex/2026-09-11/p-le/work/
   fresh-world-20260912/references/` (18 PNGs — layout-topdown + layout-angle are authoritative).
5. **Variants = time-of-day × weather** on the SAME composition (base noon-clear; variants:
   dawn-mist / golden-dusk / overcast / night-rain). Use `codex exec -i <base.png>` image editing
   for variants so composition is locked. Target ~55 unique compositions × 4-5 variants ≈ 220-275
   outcome images.

## Read first (in order)

1. `PIPELINE.md` — the binding pipeline (§1 order, §2 rules, §3 lanes, §5 breadcrumbs).
2. `INGESTION_REGISTER.md` — 24 sources, all statuses + findings.
3. `LAYOUT_CONTRACT.md` — layout authority for every map image.
4. `prompt-templates.md` + `shot-matrix.md` — style block (verbatim), slugs, weapon identities.
5. `audit/AUDIT_ROLLUP.md`, `audit/LINKS_MATRIX.md`, `audit/PAST_LINKS_MATRIX.md` — verified source
   state; residual gaps listed there are yours to close when relevant.

## Current state

- Batch-1a (4 plates, identity drift) + batch-1b (8 plates, identity fix validated) DONE — owner
  approved artstyle, requested Desktop preview: `Desktop\atomic-acres-refs-preview\preview.html`
  (keep this updated as the owner review surface).
- **IN FLIGHT (bg job)**: `batch-2-layout/` tranche-1 — 6 layout-locked plates (topdown, angle,
  teal-side, yellow-side, north-entrance, center-loop) via Codex. When done: JUDGE with Gemini
  vision vs the concept images (NOT z.ai) for layout fidelity; regenerate any drift.
- The batch-1b `map__street-overview.png` DRIFTED (green suburb; true concept = desert) — marked
  superseded; do not reuse.
- Automation browser (port 9226, headless, LOGGED INTO X + Google), headless Chrome 9223, relay
  9224 — all hub-supervised, persistent.
- 5 video TECHNIQUE dossiers + 50-source audit + past/new links matrices: done (see audit/).

## Your immediate queue

1. Collect tranche-1; Gemini-judge layout fidelity against `references/layout-topdown.png` +
   `layout-angle.png`; regenerate drift (max 2 attempts per plate, then flag).
2. Write `prompts.json` (full environment-first spec, layout-locked, variant plan) — your primary
   authoring task; weapons reduced to detail plates per owner steer.
3. Fan out generation across 3-4 parallel Codex lanes; variant passes with `-i` editing; vision-
   judge every output (Gemini/GLM-single) against spec; rejects regenerated once.
4. Update `Desktop\atomic-acres-refs-preview\preview.html` (gallery v3) with all approved plates +
   variant sets for the owner's review in ~1-2h.
5. After owner approval (overnight): implementation phase — repo work per the Build 19 handoff
   (`atomic-acres/... .handoff-evidence/work/continued-world-20260913/handoff/HANDOFF.md`): map
   rename to "Atomic Acres - New World" (scrub Nuketown references, keep internal ids stable),
   integration backlog triage. **Lane renewal required first** (project-routing registry was lost
   in the migration — re-init per docs/PROJECT_ROUTING.md and record it).

## Rules (unchanged, binding)

PIPELINE.md §2: originality (no CoD/Nuketown likeness), freeze bars, provenance manifests
(sha256 per image), models cite catalogue views used, secrets out of everything, one writer per
lane, publish only via canonical lane. Skill-regression policy applies to any skill body edit.
AKP controls still govern (your session must run its own bootstrap if it claims adoption).
