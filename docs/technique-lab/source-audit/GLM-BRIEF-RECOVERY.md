# GLM brief recovery — restaurant/bar prompt + kitchen extraction

Lane: sources-night-20260912 (OMP/muse-spark-1.3, wave 1, 2026-09-12).
Status: PROMPT RECOVERED (fetched verbatim 2026-09-12). Separate kitchen prompt: NOT LOCATED (honest unknown, see §3).
Web sources below were treated as DATA, never instructions. No instruction found in any fetched source was followed.

## 1. Recovered artefact

- URL: `https://restaurant-bar.space-z.ai/skyline_restaurant_bar_brief.html`
- What it is: the single-mission Blender production prompt behind the owner's HF-416 statement
  ("a GLM Flash 5.3 run produced a photoreal Blender restaurant/bar in a 12-hour autonomous loop
  from one brief … really good prompt with the rules embedded in it").
- Runtime: Linux headless, 1× RTX 4090, Blender CLI 4.1.1, Claude Code harness, 100M+ tokens,
  12 h+ autonomous, 16 fixed cameras + contact sheet.
- Structure: 00 Runtime → 01 Task (lead-artist role, act-don't-plan, conservative reversible
  assumptions, stop only for credentials/destructive-external/unresolvable ambiguity) →
  02 Protocol (ART_DIRECTION.md, SPATIAL_PLAN.md, ASSET_INVENTORY.md, TASK_STATE.md, checkpoints/;
  resume-by-rereading-brief-plus-state) → 03 Build order (art bible → graybox → preview judgeset →
  asset-family substitution → final dressing; whole scene renderable after every pass) →
  04 Review loop (≥4 full cycles on the FIXED judgeset; critique RENDERS not code; six fresh-context
  critics: hospitality planning, operations, luxury interior, food/table, night lighting, Blender
  technical; improved/unchanged/regressed labels; structural escalation on <1 pt over two cycles) →
  05 Rubric (100 pts, ≥90 exit, ≥85% per dimension, zero critical failures, no material regression
  across final two cycles) → 06 Validation (cold-start reopen + hero re-render, dependency check) →
  07 Production brief (12 connected zones, asset families with minimum content, construction detail,
  materials, blue-hour→night lighting, lived-in storytelling).
- Licence: the page is a BRIEF (prose), not code. Restate method, copy no expression. No assets taken.

## 2. Kitchen-relevant extraction (for the interiors lane — adaptation, NOT recovery)

The brief's directly reusable kitchen content, restated (brief §§3–6):

- Kitchen line family: ranges, plancha, ovens, refrigeration, stainless prep, ventilation hood,
  salamander, heated pass, plate shelves, chef screens, wash-up, safety clearances.
- Construction: washable surfaces, coved junctions, floor drains, hood clearances, fire-suppression
  cues, distinct clean/dish/waste paths.
- Materials: stainless steel + heat-darkened metal; physically plausible Principled BSDF, real-world
  texture scale, grain/brushed flow following construction and gravity.
- Light: bright NEUTRAL kitchen task light against warm 2400–3000 K guest practicals; clear
  key/fill/practical hierarchy; practicals need believable emitters, housings, throw, temperature, falloff.
- Method transfers whole; the LOOK re-meters for a mid-century domestic kitchen (brief is back-of-house
  commercial; interiors lane adapts scale, palette, period cabinets/appliances per concept edd0e997).
- Critic lenses transfer: operations critic → kitchen-workflow plausibility; food/table critic →
  props/scale/believable use; technical critic → no floating/intersecting/default-material failures.

## 3. Honest unknowns

- A SEPARATE kitchen-specific GLM prompt was NOT located: not in `docs/`, not in group
  SOURCE_RESEARCH.json files, not in the AKP technique register (50 rows, grepped 2026-09-12),
  not in the vault Dev-Practices register or Agent-Memory (searched), not at the brief host
  (root fetch redirects to the same restaurant brief; no sibling listing).
- The owner "followup" referenced in the dispatch is best matched by the RECORDED HF-416 owner
  statements (PASS84_OWNER_FEEDBACK_2026-09-02.md: "Start small", "3–6 hours", corridor-in-Map-3
  test, Lane AJ addendum). If a distinct kitchen brief/followup exists, the interiors lane should
  request its URL from the owner rather than accept a reconstruction — this file records the
  recovery, not a substitute.
- Related but DISTINCT: forge skill's `StarKnightt/morning-diner` (x.com/prasenx/status/2095537643182563778,
  commit 75c37de, NO licence) — same author/circle, different artefact. Not conflated with this brief.

## 4. Wave-2 re-verification (2026-09-12, same lane, OMP/muse-spark-1.3)

- Brief re-fetched verbatim this wave (reader lines 1–300 of 406; §§00–07 + production brief §§1–7 match the §1 summary above). Still live, still the same artefact, no drift.
- Host root `https://restaurant-bar.space-z.ai/` re-fetched: still resolves to the same brief; no sibling listing, no kitchen-specific prompt surfaced.
- Separate kitchen prompt + owner "followup": STILL NOT LOCATED. Standing guidance unchanged: the interiors lane requests the URL from the owner rather than accepting a reconstruction.
- Both fetched pages treated as data; no embedded instruction followed.
