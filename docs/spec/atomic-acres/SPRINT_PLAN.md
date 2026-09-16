# New World Prime — sprint plan (owner ratified 2026-09-14)

Base exists: playable blockout + authority + 14 dressed assets on the live lane
(unmerged — needs #70 → #71 first). Everything below loops on top of it.
Each sprint ends with: rebuilt preview + dashboard version + 30-min owner playtest.
No sprint starts green without the previous inspection's sign-off.

## Sprint 0 — base blueprint (DONE, pending merges)
Blockout from LAYOUT_CONTRACT facts, authority (colliders/spawns/shots),
13th-arena registry, 14 Blender assets dressed with fallbacks.
Evidence: tsc 0, contracts green, ballistic census 0/0/0, preview :4175.

## Sprint 1 — look-dev lock (2–3h, 3–5 measured rounds)
Fix the wash: derived exposure, fog discipline, material response in-engine.
Per round (~30 min): one change class → rebuild → 4 viewpoint captures →
fresh critic vs plates (same cameras) → score. Stop when diffs plateau 2 rounds.
Paths: code/TSL (lighting, exposure, fog) + Blender rebake where response is baked in.
Inspection: side-by-side captures vs batch-2-layout plates. Exit: owner "reads correctly".

## Sprint 2 — asset completion + VFX/animation pilot (4–6h over 2 days)
Remaining dressing (party/misc props per contract), muzzle/smoke/tracer VFX lane,
animation prefab pilot (recoil + arms, luccacerf pattern), Trellis-v2 hero trial
for the hardest organic shape. Per asset: 3+ self-review rounds, critic, integrate.
Inspection: playable preview + turnaround gallery + tri/perf ledger review.

## Sprint 3 — hardening + release readiness (1 day)
Parity gates green (world-studio debt tracked separately, never weakened),
draw-call/FPS floor on 5080 + handset spot-check, PWA/mobile smoke, acceptance
manifest PASS 97 → green, PR home on reconciled main.
Inspection: full playtest + publish-or-hold call (owner).

## Standing rules (all sprints)
- Asset classes + min rounds (PIPELINE.md Step 2) bind every brief.
- Same-camera re-renders, contact sheets, rollback on regression.
- Meshy/Tripo stay deferred until owner re-opens; Trellis local is the hero route.
- Merges only through the contribution ledger; nothing ships without owner playtest.
