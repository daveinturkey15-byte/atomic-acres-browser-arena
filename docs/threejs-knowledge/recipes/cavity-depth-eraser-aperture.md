# Cavity depth eraser: keep the aperture authoritative

## Use case

When a below-grade procedural scene must show through a shared opaque ground
plane, a presentation-only cavity eraser can overwrite the ground depth without
writing colour. The eraser is a rendering aid; it must not become collision or
physics authority.

## Recipe

1. Define one aperture in the scene's dimension table. Use the same semi-axes
   for the visible `ShapeGeometry` hole and the eraser shell. Do not maintain a
   second "slightly larger" eraser radius.
2. Put the eraser immediately after the shared ground and before the cavity
   surfaces. Give it a unique `renderOrder`, `depthTest = false`,
   `depthWrite = true`, and `colorWrite = false`. Keep the visible apron at a
   later order with ordinary depth testing.
3. Leave a real vertical standoff between the eraser's top and the apron. The
   Map 3 implementation uses `-0.10 m` for the shell top and `0.06 m` for the
   apron, a `0.16 m` separation that avoids coplanar depth equality.
4. Test the behavior, not a tuned constant: derive the boundary from the real
   tessellated geometry, then send a grid of fixed-height eye rays toward the
   cavity floor. The shared ground must win outside the aperture; the eraser
   may win only inside it. Include the authored review pose as a separate case.
5. Audit every participant's `renderOrder` and depth/color state. Equal orders
   are acceptable only when the participants have the same depth strategy.

## Failure mode this avoids

An eraser larger than its visible hole clears a ring of ground depth that the
apron never repaints. From oblique eye positions the ring becomes a transparent
window into the excavation. On the Map 3 colosseum, the pre-fix shell was
`63.9 m × 55.9 m` while the apron hole was `61.5 m × 53.5 m`; sharing the hole
dimensions removes that view-dependent outside-mouth win.

## Three.js references

- [Three.js current LLM documentation](https://threejs.org/docs/llms.txt)
- [ShapeGeometry](https://threejs.org/docs/#api/en/geometries/ShapeGeometry)
- [Object3D](https://threejs.org/docs/#api/en/core/Object3D)
