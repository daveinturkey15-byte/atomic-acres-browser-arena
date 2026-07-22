# Pass 44 — Rustworks Quality plant public release

Date: 2026-07-21  
Status: **live in production**  
Functional source revision: `be33aed37e9ba3c58e2e372cd9322b0016ddb5ea`  
Source branch: `overhaul/pass44-rustworks-quality-plant`  
Production `gh-pages` revision: `ad197a1`  
Rollback production root: `588e8e54007f7a958867113684ef1e3e74ab8e49` (Pass 40) while preserving `review/`  

Public URL: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/  
Immutable review URL: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass44-rustworks-quality-plant-be33aed/

## What shipped
- Pass 44 Quality industrial plant GLB (~10.1 MB, `pass44-v1`)
- 11 embedded industrial PBR materials + 1024 texture set
- ~460 authored presentation meshes (tower + yard + ground)
- Quality mode hides procedural bulk when kit ready
- Private lobby / hosting lineage from Pass 42 retained in source tree

## Exact-byte verification (live vs local dist)
- Production `index.html` references `assets/index-55CjdPfj.js`
- `rustworks-central-tower.glb` SHA-256 match:
  `9e6edf951a3304165f392a9dc766180a7f2cffa631b537d6c3987f73ba6435f5`
- Live size: **10,119,804** bytes
- Manifest (production root, excl. review):  
  files **91**, totalBytes **37,830,986**,  
  manifestSha256 `c7062679ef6651d34186f55905d3cb4fd2ad7146011032c656e01e5a2c2c5f5f`
- Immutable review path HTTP **200**
- Historical `review/` trees preserved

## How to inspect
1. Hard refresh the public URL  
2. **QUALITY GRAPHICS**  
3. Map **RUSTWORKS**  
4. Let the ~10 MB plant load once  

## Rollback
Restore production-root files from `588e8e5` / Pass 40 promote while **keeping** the current `review/` directory (including pass44). Keep `.nojekyll`.
