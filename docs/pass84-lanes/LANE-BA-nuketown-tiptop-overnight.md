# Lane BA — Nuke Town Rebuild "tip top" (HF-440), overnight 2026-09-03/04: GLM builds, Gemini critics judge captures, Opus verifies after the reset

Base: the PASS 92 head (geometry fixes HF-434..437 in). Worktree
`C:\Users\david\projects\aa-claude-nuketown6`, branch
`contrib/dave-gaming-pc/claude/nuketown2-tiptop`. Owner: "the layout and assets
and textures and lighting need to be tip top ... use some of our nice new threejs
skills we ingested". Method: the brief-with-embedded-rules production loop (Lane
AJ's write-up in `docs/pass84-lanes/LANE-AJ-brief-driven-scene-skill-map3.md`):
working documents, a fixed judgeset (the seven nuketown2 review cameras + one
interior per house + one garage), three fresh-context Gemini critics scoring
headless captures on a 100-point rubric (layout fidelity 25, material and
texture quality 25, lighting and atmosphere 20, dressing density and reading
distances 15, technical hygiene 15; gates >= 85% each), GLM repairs, three
cycles or a plateau (< 1 point over two cycles -> structural pass).

## The skills, and what each contributes (read each SKILL.md in the shared store first)
- `open-world-city-art-loop` — the STREET CELL is the unit: carriageway surface
  first (aggregate, cold-patch repairs, tar seams, worn dashes), then kerbs and
  aprons (slab joints, split kerb, tree pits, damp band), then facade BAYS with
  real recess (sills, heads, lintels, a shape grammar, not a window texture),
  then furniture density (mailboxes, planters, bins, signs, hydrant), then
  trees, then the parked cars as scenery.
- `atomic-acres-procedural-art-authoring` + `webgpu-tsl-arena-forging` — TSL
  NodeMaterial texturing in code (procedural siding grain, shingle courses, brick
  bond, rubber, glass), light-leak and floating-geometry checks, atmosphere and
  shadow rules, the forging review's critical-failure list.
- `threejs-webgpu-interior-lighting-look` — both houses' interiors and both
  garages: emissive practicals as fixtures, value composition, fog falloff, grime
  decals, filmic post, combat readability kept; the frozen light set (uniform
  writes only).
- `threejs-webgpu-water` — one yard pool as the level's water feature (Beer-
  Lambert colour, a small swept surface, no oversized cost), and the shared
  water roster entry.
- `threejs-procedural-vegetation` — the lawn tufts, hedges and street trees as
  InstancedMesh with LOD; density where the reference has it.
- `threejs-rtx-runtime-route` (route 4) — the baked indirect tier from Lane AL
  (PASS 89) enabled on this arena's profile defaults; the sunset key, fill and
  fog from the approved map; readability and parity rules (no intel through
  reflections the low tier cannot give).
- `img2threejs` — detail-accurate procedural rebuilds of the hero props (the
  coach, the moving truck, the driveway cars, the mailboxes) at three reading
  distances, animation-ready where they move.
- `visual-gauntlet-loop` — the critic loop mechanics; captures are the only
  thing critics see; "criticism must be based on the rendered images, not code".
- `game-animation-asset-pipeline` / `comfyui-3d-native-pipeline` — NOT used here
  (no imported assets on this arena; recorded so nobody reaches for them).

## Rules
Everything procedural TSL; nothing imported; nothing copied; art-direction row
above the distinctiveness floor vs atomic-acres (re-run the grade search if the
grade moves); the fidelity gate's symmetry pairs and bands untouched except by
re-derivation with reasons; parity and walkable audits at 0; tripwire 0; the
cold-compile fence never widened (menu-time precompile for any new pipelines);
headless only; ComfyUI queue empty + 3 GB VRAM before captures; one browser at a
time on ports 4280-4289; explicit-path commits (GLM trailer); Gemini critics
write their scores to docs/evidence/pass93/nuketown2-tiptop/cycle-N/ and never
edit code. Report with claim-states; the Opus reviewer after the reset verifies
the captures, the gates and the scores before PASS 93.

## Addendum 2026-09-03 19:05 — carry-overs from the HF-443 review

Targets added for the overnight builder/critic cycles (each needs its own gate
line in the lane report):

1. **Breakable ground-floor glass** on the Rebuild, matching the shipped Nuke
   Town's house glass (`house-navigation.ts`, `breakable: kind === 'glass'`):
   needs the `breakableWindowId` + dynamic-collider path, which arena `box()`
   solids do not have. Keep the walk-through budget `nuketown2: 0` in the
   collider-visual parity gate.
2. **Bot line-of-sight through glass:** bots read `map.colliders`; a pane the
   player shoots through must not blind the bots. Prove with a bot-LOS unit test
   on a pane before/after.
3. **Undressed ground patch** (≈1.25 × 2.7 m) between the turning head (x = 8) and
   `street lawn east` (x = 9.25): dress it at tier −2 and re-run the coplanar
   instrument (FINDINGS must stay 0; UNAUDITED list must not grow).
4. **Forest contact skirts:** if the pre-cut follow-up did not land the
   polygonOffset −3 fence, land it here and take a far-edge render for the critic.
