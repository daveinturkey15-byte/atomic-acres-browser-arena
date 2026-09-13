# Clean enamel reflection correction

Impact: runtime, presentation-only. Root owns materials.ts and its focused test.
Owner outcome: clean, readable car bodywork and reflections; this experiment does
not claim glass, geometry, lighting, performance or multiplayer acceptance.

VERIFIED source: Three r185 MeshPhysicalNodeMaterial.setupSpecular multiplies the
dielectric normal reflectance and grazing response by materialSpecularIntensity.
The clean branch inherited 0.08 from the intentionally muted weathered branch.
Use the normal 1.0 value for clean paint only; preserve pigment, opacity, coat,
relief, geometry, shared program structure and all caller roughness overrides.
Weathered paint retains 0.08. No new textures, lights or reflection passes.

Upstream: https://threejs.org/docs/pages/MeshPhysicalMaterial.html#specularIntensity
Installed source: node_modules/three/src/materials/nodes/MeshPhysicalNodeMaterial.js

Review input: exact meta-contributor / muse-spark-1.3-contributor HIGH job
reflection-review-20260910, using the actual ce85/af529788 vehicle images.
CORRECTION to that proposal: its excerpt default roughness0.74 is overridden by
createForgeMaterialSet to0.2 on parked vehicles. Do not replace this with the
suggested0.38 and silently remove SSR eligibility. The coat-sharpness suggestion
is deferred to keep this experiment one variable.

Acceptance: focused material tests, typecheck/build and matched authored-time
native-WebGPU camera; reject the experiment if it produces no useful improvement
or washes out the liveries. Static captures do not establish frame pacing or WAN.
