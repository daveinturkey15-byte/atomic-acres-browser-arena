# Rustworks tower overhaul — canonical import handoff

Date: 2026-07-22  
Branch: `codex/rustworks-tower-overhaul`  
Base: `6b0495dae308878bb969916e4f5d80539f90157e`  
Head: use the single commit containing this document; the exact immutable SHA is
reported by the delegating task after commit creation.

## Canonical import contract

- Import the one local commit as a unit after the pipeline, gameplay, and earlier
  level contributions. Do not split the TypeScript collision layout from the
  regenerated Blender/GLB presentation pair or provenance manifest update.
- Preserve `public/assets/original/models/rustworks-central-tower.glb` as the
  existing runtime path. This contribution adds no startup import, cross-map
  preload, renderer hook, or load-lifecycle change.
- Re-run the stance traversal suite after resolving gameplay collision/prone
  changes. TypeScript boxes remain authoritative for player movement, Rapier,
  shots, and raycasts; the GLB remains presentation-only.
- Do not infer a release/Pass number from this branch or document. Canonical
  integration owns release numbering and changelog placement.

## Result

- Replaces the flat slab canopy and dense ground-level brace cage with a tapered
  derrick crown, retained two-deck climb, and four armoured undercroft modules.
- Adds intersecting east/west and north/south routes below the tower.
- Adds a west-side, deck-level grated service trench with four lateral exit gaps
  and two visual crossovers. It is not physically below deck because the current
  character physics owns one continuous arena floor.
- Reduces the prior 24-container ring to the requested 16 total: four per side at
  centre offsets `[-18, -9, 9, 18]`, with a minimum 3.2 m end gap.
- Makes four containers open end-to-end, exactly one per side, with authoritative
  side/roof shell collision and presentation-only floors.

## Changed paths

1. `assets.manifest.json` — updated original-project asset hashes and provenance.
2. `docs/RUSTWORKS_TOWER_OVERHAUL_HANDOFF_2026-07-22.md` — this import contract.
3. `docs/RUSTWORKS_TOWER_OVERHAUL_SPEC_2026-07-22.md` — requirements, claim
   states, and acceptance criteria.
4. `public/assets/original/models/rustworks-central-tower.glb` — regenerated
   presentation-only runtime asset.
5. `scripts/blender/create-rustworks-central-tower.py` — deterministic source
   generator and preview camera.
6. `source-assets/blender/rustworks-central-tower.blend` — regenerated editable
   Blender source.
7. `src/additional-maps.test.ts` — layout, authority, clearance, and Rapier route
   coverage.
8. `src/additional-maps.ts` — Rustworks-only authoritative geometry and metadata.
9. `src/rustworks-blender.test.ts` — GLB version, ownership, semantic, and count
   contract.
10. `src/rustworks-blender.ts` — expected Rustworks asset version only; no loader
    behavior or lifecycle change.
11. `tests/e2e/rustworks-tower-overhaul.spec.ts` — bounded deterministic browser
    captures and runtime telemetry.

No shared renderer, `main.ts`, map-selection UI, global physics, networking, or
eager asset-load path was changed.

## Authored asset provenance

Generator command:

`C:\Program Files\Blender Foundation\Blender 5.1\blender.exe --background --factory-startup --python scripts/blender/create-rustworks-central-tower.py`

Observed authoring result: Blender 5.1.2, 309 created objects, 10 materials,
asset version `rustworks-tower-overhaul-v1`. Every exported authored node carries
`rustworks_asset_owner=Rustworks`,
`rustworks_asset_class=authored-central-tower`, and
`collision_authority=typescript-rustworks-boxes`; authored names use the `RW_`
prefix. The root identifies the undercroft, four-per-side container layout, west
service trench, and 15.87 m authored height.

Final artifacts:

- `source-assets/blender/rustworks-central-tower.blend`: 7,229,517 bytes, SHA-256
  `9e7316b483c68962754790c41b6328eefceacb14533e977b1f289d4a3a9df4e4`.
- `public/assets/original/models/rustworks-central-tower.glb`: 9,266,412 bytes,
  SHA-256
  `aaae6c2d2bda5703555b6ae810b2b957205c95e37cb95eb7530192831775a61a`.
- `scripts/blender/create-rustworks-central-tower.py`: SHA-256
  `b0003ff018d180a407ac05efdf05e590f13985b7f754432f76f7be292a223a35`.

The generator emits one Blender 6.0 deprecation warning for `Material.use_nodes`;
Blender exits 0 and writes both required assets.

## Clearance contract for post-rebase validation

Current stance capsules from `src/physics.ts`:

| Stance | Radius | Total capsule height | Eye height |
| --- | ---: | ---: | ---: |
| stand | 0.38 m | 1.82 m | 1.70 m |
| crouch | 0.36 m | 1.16 m | 1.16 m |
| prone | 0.31 m | 0.70 m | 0.50 m |

| Route | Clear width | Conservative clear height | Standing residual clearance |
| --- | ---: | ---: | ---: |
| open containers | 2.32 m | 2.46 m | 0.78 m/side, 0.64 m overhead |
| undercroft axes | 3.10 m | 2.75 m | 1.17 m/side, 0.93 m overhead |
| west trench | 3.40 m | open above low walls | 1.32 m/side |

Rapier tests traverse all four open containers, both undercroft axes, and the
west trench in both directions for stand, crouch, and prone. Tower ramp and ship
ladder routes are traversed forward/reverse while standing. Prone autostep is
intentionally disabled by current gameplay physics, so prone tower climbing is
not claimed. After the concurrent collision/prone contribution is rebased,
revalidate these exact routes and all stance transitions before accepting.

## Validation and evidence

- Focused Vitest: 2 files, 18 tests passed, including stance traversal.
- Full Vitest: 82 files, 431 tests passed.
- `npm run lint`: passed for application and worker TypeScript.
- `npm run verify:provenance`: passed, 24 declared digests verified.
- `npm run qa:asset-provenance`: passed, 106/106 public assets covered.
- `npm run build`: passed; Vite production build completed in 465 ms in the
  recorded run. Existing >500 kB chunk warnings remain.
- `npm run verify:release-tree`: passed, 113 files, no rejected/oversized files.
- `npm run audit:dependencies`: passed, 0 production vulnerabilities.
- Playwright `rustworks-tower-overhaul.spec.ts`: passed in Chromium and captured
  tower, undercroft, trench, and open-container views; no page errors. Headless
  software rendering was about 1 FPS and is visual/mechanics evidence only.
- Interactive in-app browser telemetry on the same machine: baseline 179 FPS,
  after 179 FPS. This is the performance comparison; no measured FPS regression.
- Runtime authored telemetry: 293 GLB meshes, 14,732 triangles, 310 semantic
  parts, 10 textured/PBR materials, 15.87 m height. Whole-frame capture telemetry
  reported 196 draw calls and 61,264 triangles with optional effects disabled.
- `git diff --check`: passed.

Asset-size comparison from the recorded base:

| Artifact | Before | After | Delta |
| --- | ---: | ---: | ---: |
| `.blend` | 7,181,340 B | 7,229,517 B | +48,177 B (+0.67%) |
| `.glb` | 9,062,460 B | 9,266,412 B | +203,952 B (+2.25%) |

Local ignored evidence lives under `artifacts/rustworks-tower-overhaul/` and the
recorded interactive before/after captures under `artifacts/pass58/`; these are
not canonical source inputs and should not be imported.

## Assumptions, unknowns, and conflicts

- The explicit user target of 12–16 total containers overrides the ambiguous
  phrase “another 3–4 on each side”; this contribution chooses 16 total.
- The requested trench is represented at deck level. A genuinely sunken trench
  remains blocked by the continuous world-floor architecture and is out of scope.
- The design borrows only abstract PvP ideas (vertical contest, under-route,
  asymmetric side lane, walk-through freight); it copies no external art or
  exact proprietary layout.
- `src/additional-maps.ts` and its tests are the highest-conflict shared surfaces
  for concurrent level/collision work. Preserve the new route metadata, 51-way
  collision/physics parity, explicit structural-metal ballistics, and the
  Rustworks-only presentation batching behavior during conflict resolution.
- `assets.manifest.json` may conflict if other contributions regenerate assets;
  retain all entries and use the three final digests above for this asset trio.
- `src/rustworks-blender.ts` changes only the expected asset-version constant.
  Do not convert this contribution into a new eager cross-map startup load.
- Human preference for final night lighting and cover rhythm is still an art/play
  review judgment; all automated claims are geometry, authority, or telemetry
  claims rather than proof of subjective fun.
