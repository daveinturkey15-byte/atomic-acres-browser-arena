# Lane AJ — the "brief with embedded rules" scene-production method: architect it as a shared skill, then prove it on one Map 3 corridor

Orchestrator: Claude Code (Fable 5.1). Ledger row HF-416. Owner (2026-09-02
17:55-18:05): a GLM Flash 5.3 run produced a photoreal Blender restaurant/bar
in a 12-hour autonomous loop from one brief
(https://restaurant-bar.space-z.ai/skyline_restaurant_bar_brief.html);
"It seems the foundation of it was a really good prompt with the rules
embedded in it ... whether we use that method and a similar prompt directly,
or techniques to recreate the style of the prompt but outside of blender?
Just code? WebGPU? Good prompt. Start small" and "Ensure we get what I
recently sent architected as a nice skill and then do some tests as a
corridor in map 3, maybe not 12 hours but 3-6 could work". Runs after Nuke
Town and the graphics-profiles lane.

## What the brief actually is (resolved 2026-09-02 from the page)
Blender 4.1.1 Cycles, headless Linux, RTX 4090, Claude Code for the review
loops; 100M+ tokens, 12+ hour autonomous run, 16 fixed camera renders.
Structure: Runtime -> Task definition (one agent leads art, technical,
lighting, operations; "perform the actual work in the current working
directory; do not answer with only a plan") -> Protocol (working documents
ART_DIRECTION.md, SPATIAL_PLAN.md, ASSET_INVENTORY.md, TASK_STATE.md;
checkpoint recovery) -> Build order in five phases (art bible -> graybox ->
preview -> asset substitution -> final dressing) -> Review loop (minimum
four full cycles; SIX fresh-context critic agents with distinct lenses:
hospitality planner, operations, luxury interior, food/table, night
lighting, technical; "criticism must be based on the rendered images, not
code, scene tree or builder summary"; each repair labelled improved /
unchanged / regressed; escalate to a structural pass if the score improves
< 1 point over two cycles) -> Rubric (100 points over seven dimensions,
every dimension >= 85%, >= 90 overall to exit, zero critical failures) ->
Validation (cold-start reopen and re-render; dependencies resolve) ->
Production brief (spatial, asset, architectural, material, lighting,
storytelling requirements; style rules; "each important asset must work at
three reading distances: macro silhouette, functional structure, close
joins"; human-scale clearances; "no required room may exist only as
lettering on a closed door"; explicit critical-failure list: rigid copied
rows, decorative-only zones, floating assets, intersections, default
materials, black/flat/overexposed sky, darkness/fog/DoF used to hide
incomplete work, single-direction completion, screenshot-only render set).

The transferable insight is not Blender: it is (a) the brief as a complete
production contract with working documents, (b) a fixed judgeset of cameras
so critics compare like with like, (c) several fresh-context critics judging
RENDERS, (d) a numeric rubric with per-dimension gates and a plateau
escalation rule, (e) a critical-failure list that auto-rejects, (f)
cold-start validation. All of that maps onto this repo's stack (procedural
three/webgpu + TSL, headless real-Chrome captures, review cameras per arena,
Opus/Gemini critics via the Workflow tool) with no Blender at all.

## Job, part 1 — the skill (governed shared-store work; follow memory `ai-3d-technique-register` step 4)
1. Author `brief-driven-scene-production` in the vault skill store
   (`C:\Users\david\Documents\desky-bootstrap-clone\Skills\<category>\brief-driven-scene-production\SKILL.md`,
   category `game-development` or the creative category the store uses;
   description under 360 chars). Contents: the brief template with every
   section above generalised (runtime, task, protocol docs, five-phase build
   order, review loop with N fresh-context critics and their lenses, rubric
   with gates and exit, critical failures, cold-start validation), the
   judgeset rule, the "critique renders not code" rule, plateau escalation,
   and an adapter section for this repo: TSL-only, headless captures as
   renders, review cameras as the judgeset, Workflow-tool critics, evidence
   under docs/evidence. Include a worked example sized for a Map 3 corridor.
   Reference the existing `visual-gauntlet-loop` skill and say how this one
   differs (full production brief + rubric vs a bounded builder/critic loop).
2. Technique-register row for the source (pinned URL, what it observably is,
   licence: the page is a brief, not code; no assets copied), eval record in
   `.akephalos\skill-evaluations\brief-driven-scene-production.json`,
   `skill_regression_guard.py accept --skill brief-driven-scene-production`
   (scoped), SkillScan on the new skill, `link_skills.ps1 -VerifyOnly`,
   vault note link from the technique register note. Commit + push AKP by
   explicit `git add` of those paths; read back.

## Job, part 2 — the experiment: one Map 3 corridor, 3-6 hours, all code
3. Pick one Map 3 corridor bay (Lane V owns the port; coordinate by building
   a NEW bay module `src/map3/corridor-brief-test.ts` that plugs into the
   showcase's existing corridor slot pattern, and only wire it into the
   showcase page, not the arena, so it never blocks Lane V). Subject: the
   owner's example, a skyline restaurant and cocktail bar interior at blue
   hour, adapted to a corridor-sized footprint, entirely procedural TSL (no
   imported mesh, image, font or LUT).
4. Run the method for real: write the brief (using the new skill's
   template), the four working documents, six fixed judgeset cameras, then
   the five phases with the review loop: three fresh-context Opus critics
   per cycle minimum (one Gemini via agy if available) scoring the rubric
   from headless captures only; minimum three cycles; plateau rule;
   critical-failure list enforced. Record every cycle's scores and the
   labelled repairs. Stop at 6 hours or at >= 90 with all gates, whichever
   first; report honestly which.
5. Deliver: the bay in the showcase page, the captures per cycle under
   `docs/evidence/pass87/brief-driven-map3/`, the rubric history, and a
   one-page verdict on the METHOD: what it cost (tokens, hours), what it
   produced versus the same time spent unstructured, and what to change in
   the skill before it is used on a whole arena.

## Boundaries
- Skill work in the vault and AKP only; game source only in the new bay
  module and its showcase wiring; never touch other arenas, the arena
  registry, or Lane V's files. Machine rules as every lane (headless only,
  one browser, no full vitest, quiet-machine captures).

## Report
Skill path and eval record, register row, guard results, the bay's final
captures, the rubric history per cycle, hours and tokens, the method verdict,
commits. Claim-state every line.
