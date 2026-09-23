# One ramped weather state drives precipitation, wetness, sky and fog

Technique: keep exactly one weather state object for a map, advance it with
an exponential ramp that never cuts, and publish the ramped values into
shared TSL uniform nodes plus one in-place `THREE.Vector3` wind vector that
other systems read without importing the controller. Corridor-local weather
(an exhibit showing all seasons at once) consumes the same instanced-layer
builders the map-wide rig uses, so the exhibit is the regression check for
the shared machinery.

## Numbers that make it work (map3, three r185)

- Five states, severity-ordered `clear < overcast < rain = snow < storm`.
  Storm: precipitation 1.0, wetness target 1.0, wind 14 m/s, fog scale 2.1,
  sky darken 0.85. Clear: all zeros except wind 2.2 m/s, fog scale 1.0.
- Relaxation taus: wetness 18 s up / 55 s down (soak faster than dry — the
  asymmetry is what leaves a mark after the sky clears), precipitation
  1.8 s, sky/fog/wind 5/5/3.5 s. One frame moves a fraction; ~60 s converges.
- Wind: bearing in radians on XZ, `x = cos(b) * speed`, `z = sin(b) * speed`,
  metres per second, `y = 0`, mutated in place. Gusts are two incommensurate
  sines of accumulated time (`0.5`, `1.31` rad/s), so a pinned state at
  elapsed T reproduces frame for frame.
- Wet ground: puddle mask from low-frequency fBM (`xz(p, 0.33)`, threshold
  0.52–0.78) plus channel/damp terms; albedo to ~0.5 and cool
  (`vec3(0.50, 0.53, 0.58)`), roughness to 0.14 in puddles. Non-uniform by
  construction — a uniform wet darkening reads as a screen effect.
- Sky: snapshot the palette at build, then per-frame `copy(base).lerp(storm)`
  by the ramped darken amount; haze +0.35, sun glow ×(1−0.8d), intensity
  ×(1−0.35d), cloud density +0.3 capped at 0.95. Snow lerps ground toward
  white by 0.7. Fog range divided by the fog scale, colour lerped clear→storm
  over scale 1→2.1.
- Budget: map-wide rig is exactly 2 draws (one instanced precipitation layer,
  one splash layer) + one shadowless PointLight; low tier builds zero meshes
  and pins clear.

## Failure modes it avoids

- **Cut transitions**: writing preset values straight into uniforms on a
  state change pops the whole frame. Relax every displayed value toward its
  target; test that one frame moves a fraction and a long update converges.
- **Compounding sky blend**: blending from the live uniform each frame feeds
  yesterday's storm into today's clear. Snapshot the base once at build.
- **Per-frame allocation in update**: the controller mutates one displayed
  object, the sky reads into a closure-owned scratch, fog/sky writes are
  `copy`/`lerp`/`set` on preallocated targets. Test object identity across
  updates.
- **Unreproducible capture**: every state needs a deterministic route —
  `?map3weather=storm` pin plus a `window.__MAP3WEATHER.pin()` debug hook.
  A typo'd value resolves to null, never to a silent default.
- **sRGB-vs-linear tint drift when moving a graph**: `rgb(0xaad0e4)` is a
  linear-space value (`new THREE.Color(hex)`), not 0.667/0.816/0.894. Moved
  builders must convert at build with the same constructor, not with
  hand-read channel bytes.

Upstream: three.js docs (uniform nodes, instanced attributes) and
`node_modules/three` r185 source; no external technique. Skills that drove
it: webgpu-tsl-arena-forging §7 (every custom path a TSL node graph, one
draw per instanced layer), photoreal-procedural-scene-forge §4 rule 2
(derive exposure/look from one state, never tune per frame),
threejs-frame-loop-audit (severity follows the render loop — update()
allocates nothing; geometry fills happen once at build).
