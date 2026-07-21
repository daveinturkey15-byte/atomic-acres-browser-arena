# Pass 44 — Rustworks Quality plant overhaul (Sol-depth)

Date: 2026-07-21  
Branch target: `overhaul/pass44-rustworks-quality-plant`  
Standard: match Atomic Acres Quality **difference** — authored textured environment, not procedural box polish.

## Failure of Pass 43
- Real textures existed but geometry stayed cube-primary and rushed.
- Density/readability still short of Atomic’s full Blender arena bar.
- User correct: not a 30–60 min Sol-class finish.

## Pass 44 goals
1. **Full Quality plant GLB** (tower + yard + ground treatment), asset version `pass44-v1`.
2. **12+ materials**, embedded albedo/normal/roughness, 1024 industrial set.
3. **Readable middle tower**: open upper deck, corner utilities only, clear ramp + ship ladder, I-beam structure language.
4. **Yard silhouette**: silos, tanks, pipe racks, scrap cover, perimeter, chevron apron — presentation-only, colliders remain TS.
5. **Quality mode**: hide procedural bulk when ready; Performance keeps playable core.
6. **Lighting/atmosphere**: industrial dusk/work-light identity stronger than Pass 42 tint.
7. Gates: tsc, build, unit tests, asset contract tests, local preview screenshot.

## Non-goals
- No collider authority move into Blender.
- No TURN / network changes.
- No budget throttling of authoring quality.
