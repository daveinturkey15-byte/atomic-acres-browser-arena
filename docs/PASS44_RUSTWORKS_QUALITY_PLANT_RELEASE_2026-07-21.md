# Pass 44 Rustworks Quality plant — release notes

Date: 2026-07-21  
Branch: `overhaul/pass44-rustworks-quality-plant`  
Asset: `pass44-v1`

## Delivered
- **~10.1 MB** authored Quality plant GLB (was 0.17 MB untextured overlay → 3.9 MB rushed Pass 43 → **10.1 MB** dense plant)
- **460** presentation meshes, **11** industrial materials, **33** embedded texture images
- 1024px original PBR set: rust steel, plate, grate, diamond plate, concrete, hazard, oxide, tank paint, asphalt, signage, corrugated
- Full yard: silos, tanks, pipe racks, crates, scrap cover, perimeter, floodlights, spools, apron rings
- Middle tower: lattice legs, dual decks, open upper centre, corner hut/manifold, crane, clear ramp + ship ladder
- Quality mode hides procedural bulk when kit ready; 14 industrial work lights; denser dust
- Blender preview: `artifacts/pass44/rustworks-quality-plant-preview.png`

## How to view
1. QUALITY GRAPHICS  
2. RUSTWORKS  
3. Hard refresh after deploy  

## Gates
- tsc clean  
- vitest focused suites green  
- production build green  

## Not yet
- Public `gh-pages` promote (awaiting your go)
