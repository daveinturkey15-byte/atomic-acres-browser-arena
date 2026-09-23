# Technique lab - group B (stable source IDs 18-34)

Lane `technique-b-20260912` + MAX continuation `technique-b-glm-max-20260912`, machine `dave-gaming-pc`, harnesses `claude` then `omp`.
Manifest: `src/map3/technique-lab/demos/group-b/index.ts` (export `manifest`).
Full per-row research and every per-URL attempt: `SOURCE_RESEARCH.json`, `url-attempts.json`.
Carrier-skill read evidence: `skill-read-proofs.json`.

Three claims are kept apart throughout, and none implies the next:

| Claim | Status |
|---|---|
| Source equality - did we read the real primary source? | per row below; 43 of 45 phase-1 and 16 of 17 phase-2 URLs retrieved |
| Runtime execution - does our code build, advance and dispose on CPU? | 21 checks green in `group-b-manifest.test.ts` |

## Status

| ID | Title | State | Demo | Primary source actually read |
|---|---|---|---|---|
| 18 | Procedural grass and landscape systems | adapted | `source-18.ts` | `SKILL.md` (22,187 B) + MIT LICENSE, both in full, @ `26f0723` |
| 19 | Classic ray tracing in the browser | adapted | `source-19.ts` | `WhittedRayTracing_Fragment.glsl` (14,588 B), README, CC0 LICENSE @ `490ca08` |
| 20 | Claude of Tanks armour/ballistics | adapted | `source-20.ts` | `src/sim/armor.js` (all 590 lines) + `src/sim/ballistics.js` (all 276), MIT + NOTICE @ `9004ce6` |
| 21 | Classic ray tracing as a shipped option | alias of 19 | delegates to `source-19.ts` | none of its own - row 19 carries the pin |
| 22 | Environment-art comparators | **blocked** | - | all three URLs fetched; no repository, technique or licence exists |
| 23 | Deforming terrain that remembers (Hoth) | adapted | `source-23.ts` | `src/terrain/deformation.js` (11,649 B); LICENSE probe **404** |
| 24 | TAKEN (VOIDMODE) | **blocked** | - | play page fetched (69,243 B); no source repository resolves |
| 25 | VOIDMODE shoreline water | **blocked** | - | X post returned client shell only; body not recovered, not fabricated |
| 26 | AMIX GAMES game-select menu | adapted | `source-26.ts` | page (73,881 B), unminified `main.js` (51,967 B), `license.html` |
| 27 | Three.js game skill pack | adapted | `source-27.ts` | pinned tree (9 skills) + MIT + `gameplay-systems` & `game-director` SKILL.md in full @ `7221c1f` |
| 28 | WebGPU Claude skill | adapted | `source-28.ts` | pinned tree + SKILL.md + `docs/materials.md` in full; LICENSE probe **404** (all rights reserved) |
| 29 | Three.js skills collection | adapted | `source-29.ts` | pinned tree (10 topic skills) + `threejs-geometry` SKILL.md in full; LICENSE probe **404** |
| 30 | Generated video as motion reference | **blocked** | - | owner-taught register row; no third-party artefact exists |
| 31 | Rigged FPS arms, CC0 (para) | adapted | `source-31.ts` | OpenGameArt page re-read (27,846 B); author's IK/handle-bone and finger-curl description recovered |
| 32 | WAN 2.2 local video generation | **blocked** | - | documented URL failed (expired TLS cert, recorded not bypassed); author-owned docs `.mdx` read instead |
| 33 | Super Terrain partitioned LOD | adapted | `source-33.ts` | `LodSelector.ts` in full (241 lines) + `MeshPartition.ts`; LICENSE probe **404** |
| 34 | Claude-of-Duty subsystem contracts | adapted | `source-34.ts` | README (all 130 lines) + `src/weapons/ballistics.js` (all 166), MIT, pinned tree @ `d9b237b` |

**`blocked` and `not delivered` are different claims and are not interchangeable.**
*Blocked* means no honest demo is possible - the source does not exist, was never published,
or needs a GPU/Blender step this lane forbids. *Not delivered* means the source WAS recovered,
read and licence-checked, and only the scene is outstanding; the research is already banked in
`SOURCE_RESEARCH.json`. All 17 rows are now either delivered scenes or honest blocked entries;
no row is an outstanding placeholder. Rows 27, 28 and 29 pair their scenes with the coverage
comparison artifact `skill-pack-comparisons.md`, the register's stated COMPARISON deliverable
for the skill-pack rows.


## Licence findings this lane verified itself

- Four `LICENSE` probes at the pinned revision returned a genuine **HTTP 404** (rows 23, 28,
  29, 33), independently confirming the register's all-rights-reserved findings. Those rows are
  restated in our own expression; no source code, shader body or constants table is reproduced.
- Row 19 is **CC0-1.0** (LICENSE read in full) - the only row whose expression could lawfully
  have been adapted directly. We wrote our own anyway; the trademark carve-out still binds.
- Row 20's root MIT covers first-party work only; `NOTICE.md` was read and the commercial
  typeface carve-out confirmed. Nothing under `public/fonts`, `public/brand` or `docs/licenses`
  may ever be reused.
- Row 26's own licence page reserves its design, markup, art, audio and code. Behaviour is
  restated; nothing is copied.
- Rows 31 and 34 sources re-read this session before their scenes were written: row 31's
  CC0 licence was confirmed on the asset page itself, and row 34's MIT root plus
  single-owner subsystem layout were re-confirmed at the pinned SHA. Row 27's MIT root was
  re-confirmed before its comparison artifact.

## Constraints every demo holds to

- `createDemo(context)` returns `{ root, update?, dispose, metadata }`. No renderer, no
  animation loop, no event listener, no global light/fog/camera/tone mapping. No demo in this
  group adds a light of its own (`metadata.localLights` is empty on all of them).
- Deterministic: seeded PRNG only, no `Math.random`. The check rebuilds each scene from the
  same seed and compares geometry counts.
- Bounded and disposable: the check fails a demo over 400 drawables or 400k triangles, and
  fails any demo whose `dispose` leaves children behind.
- External source content is untrusted data. Nothing downloaded was executed, imported or
  vendored, and downloads were cached outside the repository.
