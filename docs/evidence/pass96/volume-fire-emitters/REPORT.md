# Volume fire emitters — evidence (pass96, HF-490, r185 technique #8)

Branch: `contrib/dave-gaming-pc/claude/volume-fire-emitters` from
`origin/contrib/dave-gaming-pc/claude/pass93-candidate` (`465ae6b7`).
Worktree: `C:/Users/david/projects/aa-muse-fire` (own new worktree; `npm ci`
inside it only).

## What shipped

`src/volume-fire-presentation.ts` (new) + `src/volume-fire-presentation.test.ts`
(new) + wiring (registry, presets, runtime, inventory, audit doc, generated
JSON, legacy-main hooks) + recipe note
`docs/threejs-knowledge/r185/volume-fire-emitters-ours.md`.

No barrel prop exists on nuketown2 or skyline-terminal (verified: `barrel`
in `src/nuketown2-arena.ts` and `src/additional-maps.ts` matches nothing
except garage-door drums) — so there is no new geometry and no fidelity
impact. Placements derive from existing tables: nuketown2 through `pair()`
semantics (`nuketown2HandedX` + 180° partner over
`NUKETOWN2_APPLIANCE_BANK` hob decks), skyline-terminal from the
luggage-cart table (`[±8, 14]` inner pair). The nuke lane drives the
reserved slot at `(0, 1.5, 0)` on the existing `NukeSequence` clock.

## Claim-states

- VERIFIED — 20-step bounded march, ≤ 4 authored emitters per arena, one
  shared pipeline via uniform-only data, off switch, nuke API, precompile
  registration. Quoted gates below.
- VERIFIED — `npx tsc --noEmit` clean (empty output).
- VERIFIED — no test, threshold, fence or gate weakened. Two gates went red
  from the new control and were satisfied by extension, not relaxation:
  `PINNED_CONTROL_SET_HASHES` re-fingerprinted with
  `graphicsControlSetHashes()` + audit doc re-measured (hash table, control
  row, honesty counts 40→41, HF-490 note); `PASS65_RENDERER_FEATURES` gained
  a `volume-fire` row + regenerated
  `docs/PASS65_RENDERER_FEATURE_INVENTORY.generated.json` (PASS 89 precedent:
  write the row, never relax the check).
- DESIGNED (needs a capture) — per-frame cost estimate (< 0.5 ms p95 at
  1280x720, one pipeline, zero transient GPU memory). No browser/GPU on this
  machine (owner running ComfyUI); no capture exists. Structural bounds
  (fixed steps, ≤ 5 small boxes, no targets/attachments) are tested.
- OPEN — heat distortion (brief: optional) omitted.
- OPEN — cold-boot measurement: nuketown2 keeps its existing
  cold-session-precompile relief; no new admission measurement claimed
  (the pool joins the existing explosion prewarm family and the exact
  ScenePass vocabulary, so no new fence risk is introduced by construction).
- OPEN — 40 of 41 controls are grep-verified only (audit doc §4/§7); the new
  row is honestly in that column.

## Quoted gates

`npx tsc --noEmit` → empty output (clean).

Final combined run (12 files):

```
Test Files  11 passed (11)
     Tests  136 passed (136)
```

plus `src/rendering/cold-session-precompile-reach.test.ts`:

```
Test Files  1 passed (1)
     Tests  3 passed (3)
```

i.e. 139 passed total across: graphics-profile-contract (14, incl. the
re-fingerprinted pin `935f10c1/642291dd/692ef633/db4143c6`),
graphics-settings-registry, volume-fire-presentation (15 new),
cold-session-precompile-reach, pipeline-metrics, nuketown2-fidelity,
legacy-main-size-ratchet (37,248 vs 37,396 ceiling), particle-catalog,
pass65-settings-inventory, pass65-renderer-feature-inventory,
nuketown2-pipeline-budget, presentation-prewarm-contract.

## Luna review TODOs

- TODO: obtain the required native-WebGPU visual capture for authored fire and
  the nuke event in both supported graphics profiles; this review was
  intentionally no-browser/no-GPU.
- TODO: record a real cold-session precompile measurement for the added shared
  fire pipeline; source/test reach is present, but this is not runtime timing
  evidence.
- TODO: replace the remaining grep-only settings-consumer observations with
  live runtime receipts when the settings audit lane owns that work.

## Per-frame cost estimate (defended)

20 march steps × ~20 ALU ≈ 400 flop/px over authored boxes covering at most
a few hundred thousand px worst case (~0.1–0.2 GFLOP/frame → < 0.5 ms p95
at 1280x720 on RTX-5080-class hardware; the audit ladder's own §3 noise
floor). One pipeline (graph-signature test), zero render targets, zero
lights, zero per-frame allocation (60-frame scene-graph-stability test).
The nuke fireball is one large box for ≤ 4.5 s on an existing event clock.
