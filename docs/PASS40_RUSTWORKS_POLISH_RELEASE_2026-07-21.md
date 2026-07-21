# Pass 40 — Rustworks polish public release

Date: 2026-07-21
Status: verified locally; immutable review + production promotion in progress
Source branch: `overhaul/pass40-rustworks-polish`

## Change summary

- Raised shared client/Worker kill and streak ceiling from 100 to **9,999** via dependency-free `shared/leaderboard-policy.ts`.
- `immediateStreakEntry` now **rejects** hostile Infinity/NaN/fractional/inverted kills-deaths instead of clamping them; requires `kills >= streak` and valid `recordedAt`.
- Rustworks Performance mode: denser original industrial silhouette, walkable lower ramp + ship-ladder with coherent landings, thin split rails around access openings, presentation-only box batching (~113 draw calls).
- Blender Quality overlay regenerated (`pass40-v1`): access coords, control hut/manifold/process pipes/risers aligned with procedural authority using Blender `(x, -ThreeZ, ThreeY)`; upper handrails split clear of ship-ladder access.
- Gun Range HUD labels no longer overwritten back to AQUA/CORAL every frame.
- E2E covers four-direction Rustworks access traversal; Quality mesh count uses a bounded contract.

## Local verification

- `git diff --check` passed
- `python3 -m py_compile scripts/blender/create-rustworks-central-tower.py` passed
- Blender regeneration wrote GLB/BLEND (`ASSET_VERSION pass40-v1`, 84 created objects)
- Client `tsc --noEmit` passed
- Worker `tsc -p worker/tsconfig.json --noEmit` passed
- Vitest: **71 files / 356 tests** passed
- Gameplay contract check passed
- `npm audit --omit=dev`: 0 vulnerabilities
- Production build passed
- Playwright chromium `pass34-combat-menu-tower-range.spec.ts`: **5/5** passed including bidirectional access walk
- Performance Rustworks draw calls: **113**
- Quality Rustworks GLB: status ready, meshCount **84**, semanticParts **85**, authoredHeight **~14.03**
- Menu: background `rgb(0,0,0)`, canvas hidden; gameplay restores canvas visibility
- Page errors: none; filtered console errors: none

## Frozen artifact

- Files: 57
- Total bytes: 20,681,799
- Manifest SHA-256: `a6d45f0a6ae4c648c316ad61ae2122889337e2d85387cacab7b5d7676bf71736`

## Residual limits

- WSL SwiftShader FPS is not a release blocker.
- Cloudflare Leaderboard Worker deploy is separate and only required if the live Worker still enforces the old 100 ceiling.
- Historical commercial maps remain non-targets; Rustworks is an original industrial arena.
