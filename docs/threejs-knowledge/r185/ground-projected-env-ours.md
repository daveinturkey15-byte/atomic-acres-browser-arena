# Ground-projected environment backdrop (ours, r185)

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_materials_envmaps_groundprojected.html
(`getGroundProjectedNormal` in `examples/jsm/tsl/utils/GroundedSkybox.js`, three 0.185.1 —
sphere intersect + back-face-culled ground-disk intersect, sampled through a cube texture).

## What we took

The projection math only: a view ray is intersected against a sphere of radius R
centred on the arena origin, then against the ground disk (centre `(0,-h,0)`,
radius R, back-face culled); the nearer hit, divided by R, is the sample
direction. Below-horizon rays land on the disk, so the sky stretches down to
meet authored ground instead of compressing into a gradient strip.

## What we changed (HF-472: our likeness, never vendored)

- Source is the arena's own admitted equirect sky (`scene.background` object),
  sampled with `equirectUV(projected)` — no HDR import, no `CubeRenderTarget`,
  no PMREM regen, no render target.
- Radius/height are `uniform()` nodes written per arena (`nuketown2`: 140/1.7,
  `skyline-terminal`: 160/2.0); retuning never rebuilds the graph.
- Direction is normalised before `equirectUV` (cube sampling is
  length-insensitive, `asin(y)` is not), with a 1e-4 downward bias so the
  degenerate centre ray resolves down instead of dividing by zero.
- Drawn by one `BackSide` sphere (r = 170, inside the 180 m far plane,
  `renderOrder = -10`, no depth write) behind the aerial-perspective composite,
  which adds haze on top and can never fight it.
- One pipeline (`pass64.ground-projected-env.tsl.v1`), in the migration ledger
  so the cold-session exact-ScenePass precompile reaches it with no fence change.
- Off switch: `groundProjectedEnv` toggle (atmosphere family, live-apply) AND a
  per-arena enable; anything else keeps the flat sky.

## Keep in mind

- Camera must stay inside R (tripwire helper `isGroundProjectedEnvCameraInside`;
  in-bounds eyes are tens of metres against R ≥ 140).
- Rebind after the generated sky is admitted (`applyArenaEnvironment`), or the
  backdrop samples the procedural placeholder.
- Owner: `src/rendering/ground-projected-env.ts`; contract:
  `src/rendering/ground-projected-env.test.ts`.
