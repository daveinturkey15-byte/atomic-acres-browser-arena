# Pass 51 — Rustworks cleanup, horizon ocean, and changelog timestamps release

Date: 2026-07-21  
Status: **live in production**  
Functional source revision: `68c20dbb18a97d547258038162a25c91a494d4f9`  
Source branch: `overhaul/pass51-rustworks-cleanup`  
Immutable review revision: `c005ca6a55f2e59556afba7f57747400f9abd0a0`  
Production `gh-pages` revision: `91f79be908444e8af5a75a0b6691346e3fffc6c4`  
Rollback production root: `bdb94ecc865537c2c525180b8bdab8eaa071e96e` while preserving `review/`

Public URL: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/  
Immutable review URL: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass51-rustworks-cleanup-68c20db/

## What shipped

- Main-menu Last Updated button and every Recent Changes row now show `D MON YYYY · HH:MM` timestamps backed by offset-bearing ISO datetimes.
- Rustworks central tower no longer carries the disconnected crane, trolley, cable, hook, pulley, loose process-pipe runs, cable trays, or unsupported light-fixture geometry.
- Four shipping containers plus four pallet stacks provide collision-backed outer-deck cover while preserving the central apron, spawns, and climb routes.
- Near animated water is 480 m wide; a 1,600 m far-ocean ring carries the sea beyond the 1,400 m Rustworks camera plane.
- The far ring deliberately does not consume Three.js fog because the custom near-water shader does not use fog chunks; matching fog policy removes the bright horizon colour step found during release review.
- Quality Graphics loads authored asset `pass51-v1`: 284 meshes, 11/11 textured PBR materials, 33 textures, 15,468 triangles, 285 semantic parts, 15.2 m authored height.

## Exact verification

```bash
cd /root/jigglyclaw/projects/atomic-acres-browser-arena
npm run verify:pass25a:core
node /tmp/pass51-release-smoke.mjs
node /tmp/pass51-mobile-smoke.mjs
```

Results:

- TypeScript: clean.
- Gameplay contract: verified.
- Vitest: **75 files / 376 tests passed**.
- Production build: passed.
- Release tree: **90 dist files**, no rejected candidates, no files over 20 MiB.
- Production dependency audit: zero vulnerabilities.
- Focused Pass 51 tests after the horizon correction: **17/17 passed**.
- Local Performance horizon and tower captures: no square water edge, void, bright fog seam, floating crane/cable/pulley, or unsupported light fixtures.
- Local and hosted Quality Graphics smoke: Rustworks selected, GLB `pass51-v1` ready, water telemetry `nearSize=480`, `horizonRadius=1600`, no JavaScript errors.
- Mobile 390×844 smoke: timestamp button and 362 px changelog panel remained inside the viewport; all seven entries ended in `HH:MM`; no console errors.

## Frozen artifact and exact-byte proof

- Files: **91** including `.nojekyll`.
- Total bytes: **37,343,839**.
- Canonical path-sensitive tree SHA-256: `f145e0d9b42b05c8ba4f882ff84c5e3e471b11c97b3f2479e1583a0d5ea5babf`.
- Frozen artifact, immutable review tree, and production root were mechanically identical before promotion.
- Review HTTPS verification fetched **90/90 served files**, **37,343,839 bytes**, with exact SHA-256 equality.
- Production HTTPS verification fetched **90/90 served files**, **37,343,839 bytes**, with exact SHA-256 equality.
- Historical review evidence grew from 1,595 to 1,686 files during the additive review commit and remained at 1,686 through production promotion.
- GitHub Pages reported `built` for production commit `91f79be908444e8af5a75a0b6691346e3fffc6c4`.

## Bounded E2E caveat

`npm run test:e2e:bounded` did **not** pass and is not reported as green. Its first legacy Pass 25A group produced seven failures: the stored menu screenshot still reflects Pass 32 and differs intentionally from the current Pass 51 menu, while the remaining ADS/context/rematch/shadow checks timed out under the low-spec SwiftShader WSL runner. No changed weapon/reticle code was included in Pass 51. The unchanged authoritative-ray invariant remains covered by the existing deterministic/unit contracts, but the stale visual baseline and low-spec headed suite should be repaired or rerun on the representative gaming PC in a dedicated QA pass.

## Rollback

Restore only production-root files from `bdb94ecc865537c2c525180b8bdab8eaa071e96e`, keep `.nojekyll`, and preserve the entire current `review/` directory (including `review/pass51-rustworks-cleanup-68c20db/`).
