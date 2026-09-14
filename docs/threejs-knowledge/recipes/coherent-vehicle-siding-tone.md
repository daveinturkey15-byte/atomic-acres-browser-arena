# Coherent vehicle/siding tone (r185)

## Pattern
Keep paint a dielectric (`metalness 0`, `specularIntensity 0.08`) with the highlight
in the clearcoat lobe; keep the swatch in a uniform-backed `colorNode` so liveries
share one graph. Gain highlight headroom in the material (narrow worst-case enamel
wash, restrict bleach to true upper panels, lower siding lip/sun lifts, lower glass
base fill) instead of lowering scene exposure.

For forged paint on r185, the live path ships base roughness 0.20 with
`specularIntensity` 0.08 so the base lobe stays quiet while the body stays
SSR-eligible; dust lifts roughness only where dust sits. For glass, use view-space
`normalView.dot(positionViewDirection)` Fresnel `pow(1-cos,5)` with a small base
`a0` plus constant fill; keep tint in `color`, `DoubleSide`, `depthWrite:false`.

## Upstream
- https://threejs.org/docs/pages/MeshPhysicalMaterial.html
- https://threejs.org/docs/pages/MeshPhysicalNodeMaterial.html
- https://threejs.org/docs/pages/TSL.html
- https://threejs.org/examples/webgpu_clearcoat.html

## Local anchors
- `src/vehicle-forge/materials.ts` (forge paint/glass physics)
- `src/nuketown2-materials/families/siding.ts` (siding graph)
- `docs/threejs-knowledge/recipes/vehicle-paint-under-a-blue-environment.md`
