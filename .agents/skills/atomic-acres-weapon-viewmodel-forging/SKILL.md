---
name: atomic-acres-weapon-viewmodel-forging
description: Forge, replace, animate, texture, light, or verify Atomic Acres first-person arms, hands, firearms, knife, grenade handling, sockets, action graphs, passive motion, ADS, muzzle and ejection effects, and world weapon identity. Use for any viewmodel asset, animation, material, socket, LOD, capture, or presentation-budget change.
---

# Atomic Acres Weapon Viewmodel Forging

Build authored first-person presentation without moving gameplay authority.

## Workflow

1. Read repo rules, the weapon definition, viewmodel/action contracts, asset manifest, source/license record, TSL renderer rules, accessibility settings, budgets, and deterministic capture requirements.
2. Freeze canonical fire, reload, switch, melee, projectile, and camera-centered ray timings before changing presentation.
3. Define the skeleton, semantic parts, required sockets, capability-conditioned actions, allowed transitions, materials, LODs, and budgets from an independent weapon capability oracle rather than from the candidate manifest.
4. Author bounded passive breathing/inertia/stride/landing layers and final grip IK. Reduce motion in ADS and through the accessibility scale.
5. Validate color space, normals, roughness/metalness, texel density, LOD transitions, triangles, draws, decoded textures, and WebGPU-compatible TSL materials.
6. Capture every applicable action under one root source/build/backend/profile/viewport/fixed-clock/seed identity, with a per-action immutable artifact path and SHA-256 digest.
7. Reject clipping, detached fingers, deformation, missing materials, socket drift, authority-ray movement, generic fallback, and mismatched first/world models.

## Invariants

- Authority: animation markers trigger presentation/audio only; the host action reducer owns fire, ammo, reload, switch, melee, and projectile results.
- Accessibility: idle/sway/flash intensity is scalable and never changes the shot ray, hit timing, recoil authority, or multiplayer state.
- Performance: every asset has LOD, triangle, draw, decoded-texture, skeleton and transient-effect budgets; preload/pool hitch-sensitive content.
- Renderer: use node/TSL-compatible WebGPU materials; no `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`, or silent fallback in an approved candidate.
- Provenance: require source, license, non-empty derivative notes, and a recomputed digest for every model, texture, animation and generated asset. Resolve paths inside the manifest directory and require bounded regular files.
- Quality: primitive/debug and shared generic substitute assets cannot enter an approved preview.

## Validate

Read [references/asset-animation-contract.md](references/asset-animation-contract.md), then from this skill directory run both contract fixtures:

`node scripts/verify-viewmodel-assets.mjs scripts/fixtures/known-good.json`

`node scripts/verify-viewmodel-assets.mjs scripts/fixtures/incomplete.json`

`node scripts/verify-viewmodel-assets.mjs --self-test`

The first command must exit zero, the second must exit nonzero, and the self-test must reject every adversarial mutation. For a candidate manifest, run:

`node scripts/verify-viewmodel-assets.mjs <viewmodel-manifest.json>`

A capture index is evidence only when it matches the one exact root capture identity. Every action requires its own contained path and byte-distinct digest. The staging validator enforces strict nested schemas, exact capability/action/socket/semantic-part and transition oracles for `a4-vanguard`, unique and disjoint semantic/socket node mappings, required action markers, ordered decreasing first/world LODs, explicit approval for any cross-weapon asset sharing, measured budgets and release fallback prohibition.
