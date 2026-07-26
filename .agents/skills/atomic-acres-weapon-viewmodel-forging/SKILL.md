---
name: atomic-acres-weapon-viewmodel-forging
description: Forge, replace, animate, texture, light, or verify Atomic Acres first-person arms, hands, firearms, knife, grenade handling, sockets, action graphs, passive motion, ADS, muzzle and ejection effects, and world weapon identity. Use for any viewmodel asset, animation, material, socket, LOD, capture, or presentation-budget change.
---

# Atomic Acres Weapon Viewmodel Forging

Build authored first-person presentation without moving gameplay authority.

## Workflow

1. Read repo rules, the weapon definition, viewmodel/action contracts, asset manifest, source/license record, TSL renderer rules, accessibility settings, budgets, and deterministic capture requirements.
2. Freeze canonical fire, reload, switch, melee, projectile, and camera-centered ray timings before changing presentation.
3. Define the skeleton, semantic parts, required sockets, capability-conditioned actions, allowed transitions, materials, LODs, and budgets.
4. Author bounded passive breathing/inertia/stride/landing layers and final grip IK. Reduce motion in ADS and through the accessibility scale.
5. Validate color space, normals, roughness/metalness, texel density, LOD transitions, triangles, draws, decoded textures, and WebGPU-compatible TSL materials.
6. Capture every applicable action at deterministic clock, seed, viewport, backend, profile, and source SHA.
7. Reject clipping, detached fingers, deformation, missing materials, socket drift, authority-ray movement, generic fallback, and mismatched first/world models.

## Invariants

- Authority: animation markers trigger presentation/audio only; the host action reducer owns fire, ammo, reload, switch, melee, and projectile results.
- Accessibility: idle/sway/flash intensity is scalable and never changes the shot ray, hit timing, recoil authority, or multiplayer state.
- Performance: every asset has LOD, triangle, draw, decoded-texture, skeleton and transient-effect budgets; preload/pool hitch-sensitive content.
- Renderer: use node/TSL-compatible WebGPU materials; no `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`, or silent fallback in an approved candidate.
- Provenance: require source, license, derivative notes, and digest for every model, texture, animation and generated asset.
- Quality: primitive/debug and shared generic substitute assets cannot enter an approved preview.

## Validate

Read [references/asset-animation-contract.md](references/asset-animation-contract.md), then run:

`node scripts/verify-viewmodel-assets.mjs <viewmodel-manifest.json>`

The known-good fixture must pass and the incomplete fixture must fail. A capture index is evidence only when it matches the exact source/build identity.
