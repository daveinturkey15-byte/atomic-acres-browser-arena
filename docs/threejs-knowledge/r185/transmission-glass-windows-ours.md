# Recipe (ours): thin-walled transmission glazing on the shared node graph

Upstream: three r185 `MeshPhysicalNodeMaterial` — `transmission` /
`thickness` / `ior` scalar properties with `*Node` overrides
(`node_modules/three/src/materials/nodes/MeshPhysicalNodeMaterial.js`);
`MeshPhysicalMaterial` doc: with non-zero transmission, `opacity` should be 1
(`node_modules/three/src/materials/MeshPhysicalMaterial.js`).
No upstream example vendored (HF-472); re-implemented in our likeness.

## When to use

A painted-looking glazed surface that should read as glass without joining
the transparent queue: roof glazing, vehicle glass bands, any opaque pane.

## How (nuketown2 glass family, `src/nuketown2-materials/families/glass.ts`)

1. Build `MeshPhysicalNodeMaterial`, not standard. Set `transmission`
   (0.45–0.6 for our panes), `thickness` 0.05, `ior` 1.5 as scalars — they
   upload as uniforms, so every value shares one WGSL program.
2. Keep the pane opaque (`opacity: 1`, `transparent: false`). Transmission
   carries the see-through; the transparent queue, render order and depth
   behaviour do not change.
3. Tint per role through the existing albedo uniform (`uniformSwatch` hex);
   per-role roughness through a uniform trim node added into the shared
   roughness graph. Same graph shape for every role → one pipeline.
4. Keep `mat.type = 'MeshStandardMaterial'` (the repo-wide WebGL2
   `shaderIDs` guard) identically on every role of the family.
5. Pin in three places: material contract (transmission/thickness/ior/
   dielectric/opaque/tint), budget sharing (`roofGlazing == coachGlass`
   graph key, `mustDiffer` against painted metal), and leave fidelity +
   glass-authority + prewarm gates untouched and green.

## Costs

Pipelines: 0 new (measured: sharing pin green, arena graph budget green).
Cold start: covered by the existing `nuketown2` cold-session precompile
entry. Per frame: no CPU work, no allocation; one transmissive sample in an
already-bound program.
