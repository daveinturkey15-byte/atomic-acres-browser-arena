# Pass 40 — Rustworks polish public release

Date: 2026-07-21
Status: live in production
Functional source revision: `04383eae3f865e4ca98f492789fca6dd36790cc7`
Source branch: `overhaul/pass40-rustworks-polish`
Immutable review revision (preview gh-pages): `a732963`
Production `gh-pages` revision: `588e8e54007f7a958867113684ef1e3e74ab8e49`
Production root promote commit: `19185bb9965eaba0821d5d482d3ef914e1510a89`
Rollback revision: `2399798b34676a24e33582f490943137e2fa5911`
Public URL: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/>
Immutable review URL: <https://daveinturkey15-byte.github.io/atomic-acres-v2-preview/review/pass40-rustworks-polish-04383ea/>

## Requested revision

- Raised shared client/Worker kill and streak ceiling from 100 to **9,999** via dependency-free `shared/leaderboard-policy.ts` imported by both sides.
- `immediateStreakEntry` **rejects** hostile Infinity/NaN/fractional/inverted kills/deaths and bad timestamps instead of clamping them; requires `kills >= streak`.
- Rustworks Performance mode substantially improved original industrial silhouette: denser bracing/process gear/cover, walkable lower ramp and ship-ladder with coherent landings, thin split rails around access openings, presentation-only box batching.
- Blender Quality overlay regenerated as `pass40-v1` with access coordinates and control-hut/manifold/process silhouettes aligned using Blender `(x, -ThreeZ, ThreeY)`; upper handrails split clear of the ship-ladder opening.
- Gun Range SCORE/HITS HUD labels no longer overwritten to AQUA/CORAL each frame.
- E2E covers four-direction Rustworks access traversal; Quality mesh count uses a bounded contract.

## Verification

- `git diff --check` passed.
- Python compile of the Blender authoring script passed.
- Blender regeneration wrote committed GLB/BLEND (`ASSET_VERSION pass40-v1`, 84 created objects).
- Client TypeScript (`tsc --noEmit`) passed.
- Worker TypeScript (`tsc -p worker/tsconfig.json --noEmit`) passed.
- Vitest: **71 files / 356 tests** passed.
- Gameplay contract check passed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Production build passed.
- Playwright chromium `pass34-combat-menu-tower-range.spec.ts`: **5/5** including bidirectional access walk.
- Local Performance Rustworks draw calls: **113** (prior local unbatched ~212; production baseline ~75 still acceptable envelope).
- Quality Rustworks GLB: status `ready`, meshCount **84**, semanticParts **85**, authoredHeight **~14.03**.
- Menu: background `rgb(0,0,0)`, canvas `hidden`; gameplay restores canvas `visible`.
- Immutable HTTPS review: all **57** files matched local dist byte-for-byte (manifest SHA-256 `a6d45f0a6ae4c648c316ad61ae2122889337e2d85387cacab7b5d7676bf71736`; total **20,681,799** bytes).
- HTTPS review browser QA: black menu, climbed lower→upper, Quality ready, zero page/console errors.
- Production HTTPS: all **57** files matched local dist; browser QA black menu, menu→game canvas restore, Rustworks calls **113**, Quality ready, zero page/console errors.
- Historical production `review/` trees preserved: **1,055** tracked files; prior review routes still return HTTP 200.

## Residual limits

- WSL SwiftShader FPS is not a release blocker.
- Cloudflare Leaderboard Worker **source** is raised to 9,999 and parity-tested, but remote Worker deploy is blocked on the current Wrangler OAuth token missing `workers:write` (and related) scopes. Local/client scoreboard headroom is live; global POST acceptance above 100 requires a scoped `wrangler login` + `npm run leaderboard:deploy` when Dave authorizes token refresh.
- Rustworks remains an original industrial arena; commercial map geometry/names/UI are not targets.

## Rollback

Restore production-root files from `2399798b34676a24e33582f490943137e2fa5911` while preserving the current `review/` directory. Do not remove immutable review builds. Keep `.nojekyll` present on `gh-pages`.
