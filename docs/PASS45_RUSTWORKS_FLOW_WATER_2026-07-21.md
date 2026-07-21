# Pass 45 — Rustworks flow, middle cleanup, ocean

Date: 2026-07-21  
Branch: `overhaul/pass45-rustworks-flow-water`  
Asset: `pass45-v1`

## Goals
1. Smoother player/bot movement (clear lanes, smaller snag colliders, fence no longer double-walls)
2. Cleaner middle tower (smaller corner utilities, wider ramp/ladder)
3. Remove/realign awkward cover off axes
4. Cool OOB water with waves + buoyancy when outside the island

## Changes
- Island ground inset; lower presentation fence so ocean reads past the edge
- Perimeter sheeting **non-solid** (world bounds still stop exits)
- Wider lower ramp (4.0) and ship ladder (1.95)
- Smaller upper hut/manifold; open walk ring
- Scrap/pipes/crates pulled off cardinal lanes; smaller pipe solids; spools non-solid
- Tank colliders tighter to visuals
- `WaterSystem`: animated ocean shader, shore foam, buoyancy/drag OOB
- Blender plant regenerated `pass45-v1` (~10.1 MB)

## Follow-up (do not forget)
- Redeploy leaderboard Worker for global kills >100 (ceiling 9999 in source)
- Finish Gun Range own leaderboard from stash `wip pass41 gun-range round`
