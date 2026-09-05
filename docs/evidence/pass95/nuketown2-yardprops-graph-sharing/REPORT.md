# nuketown2 yard-prop + interior graph sharing — REPORT

Worktree: `C:/Users/david/projects/aa-muse-yardprops`
Branch: `contrib/dave-gaming-pc/claude/nuketown2-yardprops-graph-sharing`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `3e2fd273`
Task file: `w5-330-build-yardprops-materials.md` (do exactly what it says)

## Bootstrap receipt (abridged)

- Harness OMP on dave-gaming-pc; workspace above; power plan High performance
  (`8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`) VERIFIED via `powercfg /getactivescheme`.
- AKP refreshed pull-only from `C:\Users\david\AppData\Local\hermes\.akephalos`;
  adoption guard: `PASS: OMP on dave-gaming-pc trust=trusted
  control_digest=7057aa9dbc70edef7fd2eacfa813c9dd48e1f9686c12aca88ded7672ace98889`.
- Repo `AGENTS.md` read (threejs rule HF-481 noted). The brief says "then the
  ledger `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` rows named below" — no rows
  are named anywhere in the task file, so the task text itself was followed.
- Isolated NEW worktree only; `npm ci` run once inside it (551 packages).
  No other worktree, no :4300 preview, no `aa-claude-hitl` touched.
- three: installed `three@0.185.1` (per `package.json`, matches `AGENTS.md`).
  No new upstream Three.js API is adopted — all replacements call the repo's
  existing family factories — so points 1–3 of the source-priority lookup
  (llms.txt → pmndrs MCP → source/examples) have nothing new to check in;
  point 7 is the version pin above; point 8 measurement is the graph count
  below. No new reusable upstream pattern, so no new recipe file (point 9);
  the reused pattern is the in-repo `uniformSwatch` idiom.

## What changed (3 source files, `src/legacy-main.ts` untouched)

- `src/nuketown2-yard-props.ts`: deleted all bespoke node builders
  (`node()`, cabinet/hob/glazing/sand/timber). All nine materials now come
  from `src/nuketown2-materials/families/*` in their own colours:
  cabinet/chrome/frame/podShell/hobs → unpanelled painted metal;
  glazing → opaque glass; timber → fence timber; sand → poured-apron
  concrete. Geometry table, names, tiers, colliders: unchanged.
- `src/nuketown2-interior-materials.ts`: wood floor → timber `deck` (0x997955,
  -1 tier kept CPU-side); tile → concrete `block` (0xc2bfb8, -1 kept);
  garage slab → concrete `apron` (0x868481, -1 via family option);
  drywall → unpanelled painted metal in the caller's hex (all tints one
  graph); garage wall → lap siding (0xac5644); window glass → transparent
  family glass (0xcbdde5, default 0.42 opacity); warm/cold fixtures unified
  into ONE graph with uniform tint + uniform emissive drive (no family emits
  light — the single justified bespoke graph).
- `src/nuketown2-materials/index.ts`: ceiling 54 → 42, comment rewritten.
  No margin: a new graph is a review, not a bump.

## Measurement (existing structural signature, same instrument as the gate)

Counter replicates `nodeGraphSignature`/`materialGraphKey` from
`src/nuketown2-pipeline-budget.test.ts` over `buildNuketown2(new THREE.Scene())`.

- BEFORE: `ARENA materials=68 distinct=51` (ceiling 54, headroom 3).
- AFTER: `ARENA materials=68 distinct=42` (ceiling 42, headroom 0).
- Removed 12 bespoke graphs (cabinet, hob-red, hob-blue, glasshouse
  glazing, yard timber, sand, wood floor, garage floor, drywall, warm
  light, cold light, bespoke window glass); added 3 shared graphs
  (timber `deck`, transparent glass, unified ceiling light). Net −9.
- Sharing spot-checks from the after run (VERIFIED by instrument output):
  `nuketown2-warm-ceiling-light, nuketown2-cold-tube-light` share one key;
  `nuketown2-timber-fence, nuketown2-yard-timber` share one key;
  `nuketown2-coach-glass-band, nuketown2-glasshouse-glazing` share one key;
  `nuketown2-appliance-hob-red` / `-blue` appear in NO solo group (both ride
  the unpanelled painted-metal graph — one graph, uniform tint).

## Gates (quoted verbatim)

`npx tsc --noEmit` → no output, exit 0:
```
---TSC-EXIT 0---
```

`npx vitest run` over the brief's exact set
(`src/nuketown2-materials`, `src/nuketown2-yard-props.test.ts`,
`src/nuketown2-pipeline-budget.test.ts`, `src/pipeline-metrics.test.ts`,
`src/nuketown2-fidelity.test.ts`, `src/graphics-profile-contract.test.ts`,
`src/legacy-main-size-ratchet.test.ts`):
```
 Test Files  7 passed (7)
      Tests  116 passed (116)
```

`git status -sb` after push is quoted at the end of this report's session;
`src/legacy-main.ts` is not among the modified paths (ratchet gate green).

## Claim states

- VERIFIED (quoted gate): hob red/blue are one graph with a uniform tint;
  warm/cold lights are one graph; ceiling is 42 and the arena measures 42;
  all 116 brief-gate tests + `tsc` green; no test/threshold/gate weakened.
- VERIFIED (quoted instrument): 68 materials, 51 → 42 distinct graphs.
- DESIGNED, needs a capture: look preservation. Roles and colours are kept
  (same names, same hexes, same tiers/offsets, fidelity colour pins green),
  but the wear detail is now the families': hob rings, cabinet splits/mottle/
  plinth shading, glasshouse condensation banding, sand rake bands, wood
  bevel seams are replaced by family wear (chips/chalking, rain grime,
  broom relief, board seams). No browser/GPU in this session (owner running
  ComfyUI), so no review-camera capture was taken — the deterministic review
  cameras + fidelity structural gates are the standing visual proxy and they
  pass. A headed capture on real hardware should confirm before any release
  candidate claims it.
- OPEN: cold-boot fence. The deploy-fence relief (`nuketown2` in the
  cold-session precompile reach, arena-scoped) is unchanged and still covers
  the new variant graphs via the exact-scene precompile — no roster change
  needed. Whether −9 graphs is enough to revisit that entry needs a measured
  cold-boot on hardware WebGPU (per the reach module's own rule), not available
  here.

## LUNA review TODOs

- TODO [OPEN][LUNA] Run the real cold-session WebGPU boot measurement after this
  branch is integrated. The structural reach test passes and the existing
  `nuketown2` authority is unchanged, but that is not a hardware timing proof
  that the lowered 42-graph set clears the 12 s fence.
- TODO [OPEN][LUNA] Capture the deterministic yard/interior review cameras on
  real hardware and compare against the pre-share reference. The source keeps
  the named roles and base colours, but it replaces bespoke cooker rings,
  cabinet splits, condensation/rake bands and floor detail with family wear;
  the visual look-preservation claim therefore remains design evidence only.
