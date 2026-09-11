# Nuketown clean light response — 11 September 2026

Runtime-only presentation change for the owner-rejected overnight HITL. Current installed Three is0.185.1. Consulted current https://threejs.org/docs/llms.txt and installed src/lights/HemisphereLight.js plus the existing arena light-set and art-direction implementation. No API migration, new light, material variant, frame work or render target.

The previous hemisphere contribution was0.18 and the post-grade used an amber highlight at strength1.45. The bounded candidate uses0.6 sky fill with cool sky/neutral green ground and a restrained0.55 split tone. Directional key, residual shadow fill, exposure, collision, networking, baked bounce, tone floor and safety bounds are retained. The purpose is readable clean paint and vegetation with their own colours instead of a uniform amber cast.

An environment increase was tried then rejected before commit: the existing graphics-refinement budget test rejects values above0.3 (even the unchanged baseline0.32). No bound was changed; environment source/scalar remain unchanged. Focused art-direction/lighting tests passed; that existing environment row remains OPEN. Actual matched renders determine whether this lighting candidate is accepted; source values alone do not prove visual quality.
