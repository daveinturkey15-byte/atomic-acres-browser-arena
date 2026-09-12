# Technique lab — group A (stable source IDs 1–17)

Manifest: `src/map3/technique-lab/demos/group-a/index.ts` (`export const manifest`).
Research: `SOURCE_RESEARCH.json`. Per-URL ledger: `fetch-attempts.json` (86 attempts).
Skill reads: `skill-read-proofs.json`. CPU check: `src/map3/technique-lab/demos/group-a/group-a-demos.test.ts` — **42 passed**.

IDs are the register's own and are never renumbered. ID 21 is an alias of ID 19; both are
group B and neither is imported here.

## Status

| ID | Title | Adaptation | Demo | Primary source read | Pin / licence |
|---|---|---|---|---|---|
| 1 | Mocap to in-game animation | adapted | `source-01.ts` | `docs/RIG.md` full | `00dfd538` / MIT text, NOASSERTION on GitHub |
| 2 | Spectral FFT ocean | adapted | `source-02.ts` | `index.html` passes 1–3 | `142265f5` / MIT |
| 3 | Stylized water composition | adapted | `source-03.ts` | post text only | none / none |
| 4 | Underwater volume, waterline cut | adapted | `source-04.ts` | post text only | none / none |
| 5 | Local H3 video → sprite | adapted | `source-05.ts` | post + blog + model card | n/a / **UK-excluded** |
| 6 | Image → procedural model | adapted | `source-06.ts` | `docs/ARCHITECTURE.md` | `d6673386` / Apache-2.0 |
| 7 | Code-only scene authoring | adapted | `source-07.ts` | `docs/TECHNIQUE.md`, `PROMPTS.md` | `333f0647` / MIT |
| 8 | Fully procedural jungle | adapted | `source-08.ts` | `PROMPT.md` full | `c15640d3` / MIT |
| 9 | Frame-loop and visual audit | adapted | `source-09.ts` + `frame_loop_audit.mjs` | upstream `SKILL.md` full | `e183c351` / **Modified MIT** |
| 10 | Vibe3D asset registry | adapted | `source-10.ts` | `models.json`, props `README.md` | `fb3ba78a`, `92095c48` / MIT |
| 11 | Scaffold in code, generate hero | adapted | `source-11.ts` | post text only | none / none |
| 12 | Closed-loop asset generation | adapted | `source-12.ts` | post text only | none / none |
| 13 | Gauntlet loop | adapted | `source-13.ts` | article HowTo + `prompt.md` full | `d9b237b7` / MIT |
| 14 | Modern Claudefare | adapted | `source-14.ts` | site shell, no technique served | none / none |
| 15 | Native RTX runtime | **blocked** | — | `main.mjs`, tree, LICENSE | `367ec39d` / MIT |
| 16 | Text → character animation | adapted | `source-16.ts` | `skeleton.hpp`, `sequence.cpp` | `92341f31` / Apache-2.0 |
| 17 | Environment-art bar (Cadle) | adapted | `source-17.ts` | **fetch failed** | none / none |

16 demos, 1 blocked. 16 of 17 original URLs sets fetched successfully; **`https://cadle.gg/`
failed outright** (transport error, no HTTP status) and is recorded as such, not worked around.

## What is and is not claimed

- **Read ≠ executed ≠ rendered.** Every demo instantiates, advances six frames, stays finite
  and disposes twice under the CPU check. **Pixel validation is OPEN for all 16.** No GPU or
  browser job runs in this lane, so rendered quality and frame cost are unverified.
- Nothing upstream was installed, built or executed. No third-party code is vendored.
- ID 2 is a real spectral synthesis (JONSWAP + TMA, Tessendorf h0, inverse FFT, Jacobian
  foam) at N=32 on the CPU — **not** the upstream three-cascade 512² GPU pipeline.
- ID 4's waterline cut is shown **failing**, because the source has not solved it either.
- ID 5 uses **no** H3 model, weights or output; the UK exclusion stands.
- ID 15 is blocked rather than faked; substituting an unrelated in-browser RT library would
  repeat the substitution error the register already recorded.
- ID 17 is **our** implementation of named properties, **not** Cadle's, which is undetermined.
- Only 1 of 10 canonical carrier `SKILL.md` bodies was read this pass (all 10 hash-verified).
  Do not record this as full skill adoption — see `skill-read-proofs.json`.

## Host contract

Demos add no renderer, RAF loop, event listener, global fog, camera, tone mapping, ambient or
directional light. Sources 7, 10 and 14 add **named local lights**, declared in
`metadata.localLights` and asserted by the check. Every demo is seeded and deterministic.

## Reproduce

```sh
node node_modules/vitest/vitest.mjs run src/map3/technique-lab/demos/group-a/group-a-demos.test.ts
node scripts/technique-lab/group-a/frame_loop_audit.mjs --json src/map3/technique-lab
python scripts/technique-lab/group-a/source_reader.py plan     # re-fetch; bodies cache outside the repo
python scripts/technique-lab/group-a/source_reader.py report   # rewrite fetch-attempts.json
```
