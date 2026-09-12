# Nuketown clean light response — 11 September 2026

Runtime-only presentation change for the owner-rejected overnight HITL. Current installed Three is0.185.1. Consulted current https://threejs.org/docs/llms.txt and installed src/lights/HemisphereLight.js plus the existing arena light-set and art-direction implementation. No API migration, new light, material variant, frame work or render target.

The previous hemisphere contribution was0.18 and the post-grade used an amber highlight at strength1.45. The bounded candidate uses0.6 sky fill with cool sky/neutral green ground and a restrained0.55 split tone. Directional key, residual shadow fill, exposure, collision, networking, baked bounce, tone floor and safety bounds are retained. The purpose is readable clean paint and vegetation with their own colours instead of a uniform amber cast.

An environment increase was tried then rejected before commit: the existing graphics-refinement budget test rejects values above0.3 (even the unchanged baseline0.32). No bound was changed; environment source/scalar remain unchanged. Focused art-direction/lighting tests passed; that existing environment row remains OPEN. Actual matched renders determine whether this lighting candidate is accepted; source values alone do not prove visual quality.

## Static neighbourhood reflections

A16mesh/192triangle temporary proxy uses canonical house positions, widths/depths and handedness. It supplies building/window/roof forms around the street to the existing WebGPU PMREM during arena admission. This is a static approximation from one central probe, not a parallax-correct live mirror and not ray tracing. No active game meshes, lights, players or empty placeholders enter the capture. Temporary geometry/materials are disposed; the borrowed sky remains owned by the sky system. The existing IBL state owns the output and regenerates only on arena/sky/quality changes.

Automotive paint/chrome and glass explicitly bind the output so per-material environment intensity works; matte wall response is not globally increased. Off clears these bindings. Current https://threejs.org/docs/pages/PMREMGenerator.html describes fromScene options; actual WebGPU API verified in installed0.185.1 src/renderers/common/extras/PMREMGenerator.js. https://threejs.org/docs/pages/MeshPhysicalMaterial.html documents clearcoat and environment-map response. Existing PBR material graphs and authoritative collisions remain intact.
