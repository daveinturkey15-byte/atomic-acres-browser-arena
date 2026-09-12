# World-studio Blender hero assets

Blender-authored hero props for the world-studio arena, exported as runtime glTF and exposed
through an additive TypeScript factory. Lane `blender-hero-20260912`, machine `dave-gaming-pc`,
harness `claude`, base `e25a938916233a3e4972e5f012580fa898bb00eb`.

**Scope and authority.** Presentation only. Nothing here emits a collider, shot surface, spawn
or navigation data, and nothing here may be used to derive collision. The root retains the
accepted gameplay colliders and decides whether and how to integrate these assets. No existing
vehicle, loader, arena, renderer or gameplay file was modified.

## Rebuild

Exact command, from the worktree root (the launcher acquires the machine-wide Blender lock,
invokes the installed Blender with `CREATE_NO_WINDOW`, and releases only its own lock):

```
python scripts/blender/world-studio/blender_launcher.py scripts/blender/world-studio/build_hero_bus.py
```

Verification commands:

```
python scripts/blender/world-studio/blender_launcher.py scripts/blender/world-studio/verify_blend.py
node scripts/blender/world-studio/validate_glb.mjs
npx --no-install vitest run src/world-studio/blender-assets/index.test.ts
```

Toolchain actually executed: **Blender 5.1.2, build hash `ec6e62d40fa9`**, at
`C:/Program Files/Blender Foundation/Blender 5.1/blender.exe`, headless
(`--background --factory-startup`). CPU modelling, CPU texture synthesis and glTF export only —
no render, no Cycles, no GPU device requested, no visible window. Exporter: Khronos glTF
Blender I/O v5.1.20. Runtime three.js: 0.185.1.

## Files produced

| File | SHA-256 | Bytes |
|---|---|---|
| `public/assets/world-studio/blender/hero-bus.glb` | `a7059b50bdd41281377a54cb65f51c51b06d67c4ca2ae03d7e0ee9982a6b0ff5` | 1,339,668 |
| `public/assets/world-studio/blender/bus_body_basecolor.png` | `7925c38c10361b215febbad4919f994a31f7083642d4b2ec90030c2ab8ce6478` | 103,299 |
| `public/assets/world-studio/blender/bus_body_roughness.png` | `39d5920d3eea908af5693b4d5f20d483397627b210f18f6b698ee62719108f2b` | 70,583 |
| `public/assets/world-studio/blender/bus_body_normal.png` | `0c3ac3fa27d942fb1553c4073e5a7ad8ab17b993f217e32b576234def55c7d36` | 164,359 |
| `scripts/blender/world-studio/source/hero-bus.blend` | `ed1cac9598d3033e40a5b6b74aa897d782aa596f22c8416422dce5b41f744f15` | 1,867,688 |
| `public/assets/world-studio/blender/hero-truck.glb` | `b602d3037c5d6c23d174e17006a9b5ae6abb9de4835fba5d23fee377fdd74199` | 1,554,816 |
| `public/assets/world-studio/blender/truck_red_basecolor.png` | `6827ec7d474e00106711b93db0bf3ed979e39c82990f3885d33182343ce985cb` | 83,395 |
| `public/assets/world-studio/blender/truck_red_roughness.png` | `8cd7548d2e0ea80a851fc060bc65d92313e577d4d4ab6f3bce39f427b9710130` | 71,875 |
| `public/assets/world-studio/blender/truck_panel_normal.png` | `5a6dfbe62390c176de6ffd883bb2a344ad06100c667c170fb9bfecb078edb56e` | 161,011 |
| `public/assets/world-studio/blender/trailer_white_basecolor.png` | `612c1d57d66302fcd9a88171e6d4116100a5c995e4837012c30cbe398371b586` | 95,068 |
| `public/assets/world-studio/blender/trailer_white_roughness.png` | `5a4e7079462741e39822201fdb2696e1594b03ff93ad426995b79c38b66f5411` | 71,128 |
| `scripts/blender/world-studio/source/hero-truck.blend` | `caac4ba9ea4ee62d78b14d47ccff8ec4c55bcc694b0ea467b5d6bff6c8c53f58` | 1,942,340 |

The `.blend` hashes identify the committed source containers at `d045bf04e`; this is not a
claim that Blender's session-bearing container is byte-identical across rebuilds.

Source and tooling: `scripts/blender/world-studio/build_hero_bus.py`, `build_hero_truck.py`,
`blender_launcher.py`, `probe_api.py`, `verify_blend.py`, `validate_glb.mjs`;
runtime API `src/world-studio/blender-assets/index.ts` (+ `index.test.ts`).

## Measured asset facts

Measured by `validate_glb.mjs` against the exported binary, not asserted from intent:

- **22,440 indexed triangles**, 26,839 vertices (budget: ≤ 25,000).
- **8 materials, 8 glTF primitives, 1 mesh** — one draw group per material (budget: ≤ 8).
- **Bounds 2.976 m (X) × 3.197 m (Y) × 9.970 m (Z)**, minimum Y `0.002` — inside the 3 × 3.2 ×
  10 m game envelope, long axis Z, Y-up, real metres, tyre contact patch on the ground plane.
- Every primitive is indexed `TRIANGLES` and carries `POSITION`, `NORMAL` and `TEXCOORD_0`.
  Zero non-finite normals, zero degenerate (zero-length) normals.
- 3 images, all **embedded as buffer views** — the GLB is self-contained, no external texture
  fetch, no third-party content, no download.
- `extensionsUsed`: `KHR_materials_clearcoat`.

### Truck and box trailer (`hero-truck.glb`)

Built by `scripts/blender/world-studio/build_hero_truck.py`, which **imports** the bus script's
`Builder`, `chamfer_box`, `revolve`, `disc`, `sweep`, `to_object` and the CPU noise/texture
machinery rather than copying them — a second consumer of the same generator, with only the
vehicle spec and assembly new. Rebuild:

```
python scripts/blender/world-studio/blender_launcher.py scripts/blender/world-studio/build_hero_truck.py
node scripts/blender/world-studio/validate_glb.mjs public/assets/world-studio/blender/hero-truck.glb
python scripts/blender/world-studio/blender_launcher.py scripts/blender/world-studio/verify_blend.py hero-truck.blend
```

Measured at `d045bf04e`: **23,492 indexed triangles**, 28,835 vertices,
**8 materials / 8 primitives / 1 mesh**, bounds **2.976 m × 3.942 m × 13.518 m**, minimum Y
`0.0081`, 5 embedded images. Independent CPU validation on 2026-09-12 passed all container,
geometry, material and image checks; three.js parsed 8 meshes / 23,492 triangles with matching
bounds. Node emitted five texture-decode warnings because it has no browser image decoder;
the embedded bytes are verified, while browser texture response remains OPEN. The native
continuation recorded a fresh Blender reopen with 8 slots, `UVMap`, metric units and exportable
geometry, and a second rebuild with byte-identical GLB and PNGs. That Blender execution was not
repeated during the independent documentation review.

Bonneted tractor: cab and hood are station-ring lofts with an anchored flank profile, tumblehome
and clamped shoulders. Superellipse front arches are cut into the fender skin with the recipe's
`p = 2.6` profile and a lip bead following the same points. The steer axle sits mid-hood; a raked
windscreen, recessed glazing, door shut lines and pillars follow the cab skin, with a dark liner,
dashboard, steering wheel and seats behind the glass. Rectangular headlamps, recessed grille,
air cleaners, wrapped bumper, mirror arms, chrome fuel tanks, steps, twin exhaust stacks and
five roof marker lamps complete the cab. Box trailer:
ribbed flanks (22 swept ribs per side), top and bottom rails, rear doors in a dark reveal with
lock bars and hinges, underride bar, bogie frame, landing gear and rear lamps. Running gear is
18 wheels — two steer, eight drive in tandem duals, eight trailer duals — plus axles and four
mudflaps, with lug detail only on the wheels whose outboard face is visible.

Two paint families carry maps (`truck_paint_red`, `trailer_paint_white`); the other six are
constant-parameter PBR. Both paint families now share `truck_panel_normal.png`; the two former
identical normal PNGs were consolidated and the GLB embeds five images rather than six.

The prop is centered along its own long axis: local glTF Z is `[-6.7587, +6.7588]` m. Root's
existing arena integration compensates the old asymmetric export with `truck.position.z =
-2.41375`. When integrating this centered export, change that presentation position to **-2.0**
and retain root's **heading 0** (`truck.rotation.y = 0`) to preserve the intended world center.
This is an integration instruction; this lane changes no arena code or accepted colliders.

### Materials as they survived export

`bus_paint_yellow` is map-driven: base colour texture + metallic-roughness texture + normal
texture (512×512, synthesised on CPU with numpy from a seeded integer-hash tileable value-noise
fBm with integer periods), sRGB for base colour and Non-Color for the data maps, plus clearcoat.
The other seven — `bus_glass`, `bus_rubber`, `bus_chrome`, `bus_lamp_red`, `bus_lamp_amber`,
`bus_lamp_clear`, `bus_interior` — are **deliberately constant-parameter PBR**, each with its own
authored base colour, roughness and metallic (and emissive on the two lamp lenses). That is an
honest statement of what is in the file: one textured hero material, seven parameter materials.
No claim is made that a procedural node graph survived export; the maps are baked image files.

Texture parameterisation: `u` runs around the station ring (0 = underbody centre, 0.5 = roof
crown) and `v` runs along the body at one tile per two metres, so dust lands on the skirt and
roof and the flanks stay clean — the wear is placed by the parameterisation rather than by hand.

## Method actually applied

Read in full before construction (native `Read`, to EOF):

| Source | SHA-256 | Size |
|---|---|---|
| `~/.codex/skills/atomic-acres-procedural-art-authoring/SKILL.md` | `19f93b23bdcef5832c246772600c7740631cb3a43b6d424324a58eecfdab9508` | 10,377 B / 151 lines |
| `~/.codex/skills/photoreal-procedural-scene-forge/SKILL.md` | `fcf059f08eed0bb2f23a630f07a7e74cf48aa3254135be1932de5bcbb7c92d8c` | 12,079 B / 187 lines |
| `~/.codex/skills/photoreal-procedural-scene-forge/references/vehicle-recipe.md` | `e5baa99fefcfb7c459cf15a9529aad3625b48d6ef87e6bc8fdf11db7f38b5850` | 11,886 B / 194 lines |
| reference `hero-vehicles.png` | `48e45ccda9beb5ec2cb33c088efca9589408face272d327b23407592c642e7d2` | 3,103,089 B |
| reference `street-teal.png` | `7db636fbdf21d680a00fdc3ed3843cc3e0e44b6d129dc7932f1e98f510553764` | 3,166,316 B |
| reference `street-yellow.png` | `c6d29680ee37dc3889a1755e14d8429bedaece9b3876900dc23e8a130740a1a0` | 2,994,424 B |
| `BUILD_BRIEF.md` (HF-571) | `f46d5c584d3f859eb6345e363a0f2cbe46fe995622d96950d673d6a079e62e9e` | 7,092 B |

Specific methods applied, with where they live in the build script:

- **Station-ring loft** (`vehicle-recipe.md` §2–§4) — `ring_half()` / `station_ring()` /
  `build_body()`. One closed 32-point ring per station, mirrored in X, with the flank profile
  anchored **once, globally**: `x(z) = hwSill + (hwBelt - hwSill) * t**0.45` between the nominal
  sill and belt (`flank_x`). Tumblehome `hwTop < hwBelt` (`tumble_x`). Per-station roof radius
  clamped `min(rTop, (yTop - yBelt) * 0.9, hwTop * 0.5)`.
- **Station placement** (§3) — `stations()` collects every feature edge (cowl, tail, each of the
  ten window pillars, four samples either side of each axle) plus a 0.42 m background spacing;
  40 stations result.
- **Glass cut out of the loft, not laid proud of a closed body** (§6) — the ring carries a
  52 mm glazing recess as real rows (`BAND_INSET`), those rows are assigned the dark rubber
  material so the reveal reads as a gasket, and the panes are seated 20 mm proud of the recess
  seat and 26–42 mm inside the outer skin. The cabin lining is the same loft re-run at 0.945
  scale with reversed winding in dark matte, so the glass reads as depth rather than a slab.
- **Trim follows the surface it sits on, not the feature it decorates** (§8) — `sweep()` is fed
  path points sampled from the loft's own `flank_x`/`tumble_x` at the rail height, so the two rub
  rails, the drip rail and the five roof arches cannot float where the body pulls away.
- **Lamps are layered in depth order** (§8) — every lamp is a lathe bezel ring (`_ring_profile`)
  with the lens disc placed *outward* of the bezel face, never pushed into it.
- **Wheels as lathes** (§7) — `wheel()` revolves a closed 11-point tyre section and a 9-point
  steel-rim section, dished outboard, with hub ring and five lug nuts on the four wheels whose
  outboard face is visible. Six wheels: two front, four in rear duals.
- **The entry door follows the surface it sits on** — `entry_door()` sweeps every part (reveal,
  two leaves, waist rail, glazing, handle, step well) along `skin_x(z)`, the single function that
  returns the body's outer half width at any height. A flat door slab would be 50 mm proud at the
  skirt and 50 mm sunk at the belt, because the flank changes width with height.
- **Bevels authored into the geometry** — `chamfer_box()` emits 6 face quads, 12 chamfer quads
  and 8 corner triangles, so every box edge catches a highlight without a modifier.
- **Determinism** (`atomic-acres-procedural-art-authoring` §1) — seeded integer hash, no
  `random`, no `Date`; `value_noise()` asserts an integer period because a fractional period
  yields NaN and silently blackens every map.
- **Winding safety** — every part is a closed solid and the whole mesh is passed through
  `bmesh.ops.recalc_face_normals`, with the liner reversed afterwards; this is what prevents the
  one sign error that culls a lathe to black.

Upstream-observed methods are reimplemented from first principles. No third-party source,
shader, prose or asset was copied, and no Call of Duty asset was used or referenced as source —
the references are the owner's own concept images.

## Validation performed

- `validate_glb.mjs` — container header (`glTF` magic, version 2, declared length == file size),
  chunk walk, per-primitive accessor checks, raw normal-buffer scan for NaN/zero normals,
  material and embedded-image checks. **All checks passed.**
- **Real three.js CPU parse** in the same script: `GLTFLoader.parse()` on the bytes produced
  8 meshes and 22,440 triangles with bounds matching the container. Node cannot decode the
  embedded PNGs (no DOM image decoder), so three logs three `Couldn't load texture` warnings;
  that is a Node limitation, not an asset defect — the images are verified present and embedded
  by the container check. A shim sets `globalThis.self` because the jsm loader probes it.
- **Fresh-Blender reopen** (`verify_blend.py`, separate headless invocation): the saved `.blend`
  reopens with 1 mesh object, 22,440 triangles, all 8 material slots, a `UVMap` layer, three
  512×512 images with correct colour spaces, metric units at scale 1.0, `exportable: true`.
- **Determinism**: a second full rebuild produced **byte-identical** `hero-bus.glb` and all three
  PNGs (same SHA-256). The `.blend` is **not** byte-stable across rebuilds — Blender embeds
  session state — so geometry/manifest determinism is proven on the exported artefacts and the
  `.blend` hash is recorded per build rather than pinned.
- `src/world-studio/blender-assets/index.test.ts` — **8 passed** independently at `d045bf04e`:
  the shipped truck binary matches declared dimensions and is centered along Z; base-aware URL resolution,
  both declared placements inside their envelopes and not overlapping, root usable before load,
  visible rejection on load failure, repeated/early dispose safety, no collider-or-authority
  surface.
- `npx --no-install tsc --noEmit` — **zero errors in owned paths**. Errors elsewhere in the tree
  belong to other lanes and were neither touched nor fixed.

## Runtime API

`src/world-studio/blender-assets/index.ts`:

```ts
createStudioBlenderAssets(options?: {
  baseUrl?: string;
  position?: readonly [number, number, number];
  headingRadians?: number;
}): { root: THREE.Group; ready: Promise<void>; dispose: () => void }
```

- `root` is returned immediately and may be parented before anything loads.
- `ready` resolves only after the glTF actually loaded and was attached; it rejects visibly on
  failure and never resolves empty.
- `dispose()` is idempotent and race-safe: a load that lands after disposal is released rather
  than attached; geometries, materials and textures are disposed.
- No renderer, no rAF, no global DOM listener, no window global. URLs are resolved against
  `import.meta.env.BASE_URL` (falling back to `/`), so a sub-path Vite deployment works.
- Loaded nodes are tagged `presentationOnly`; opaque materials are restored to `FrontSide`
  (the exporter writes everything double-sided) while transparent glass keeps two-sided
  presentation and stops writing depth.

The factory loads **both** props and `ready` resolves only once both have attached.
Declared placement, from the brief's coordinate contract: `HERO_BUS_PLACEMENT` = `[-3.5, 0, 2]`
heading 0, and `HERO_TRUCK_PLACEMENT` = `[3.5, 0, -2]` heading π, so the two face opposite ways
as in the reference street images. Both exports are local and metre-scale with the nose towards
+Z at heading 0; placement lives in the factory, not baked into the geometry, so lanes and the
existing colliders are untouched. An `options.position`/`options.headingRadians` override applies
to the bus only, so nudging one prop cannot silently stack the other on top of it.

## Limitations and open items — read before integration

1. **No rendered-quality claim.** Only CPU authoring and export were authorized, so no image of
   this asset has been produced. Silhouette, proportion and material response are asserted from
   measured geometry and material parameters only. Whether it *looks* right at player distance
   is an owner/root visual judgement that has not been made.
2. **No scene-playability or collider-parity claim.** Not integrated, not booted, no arena test.
3. **The bus is one joined mesh.** Wheels are not separate nodes, so they cannot be rotated
   independently. This was chosen to hold the ≤ 8 draw-group budget; splitting the six wheels out
   would add roughly three more primitives.
4. **Windscreen and rear window are gasket-set proud panes**, not recessed into the loft like the
   side glazing. The front ring is held vertical: a raked front ring would have to lean every
   station behind it or the loft folds over itself at the roof. The reference bus's screen is
   only a few degrees off vertical, so this reads correctly, but it is a deliberate deviation
   from the recipe's "cut the glass out of the loft" rule for those two panes.
5. **The kerb-side entry door is modelled but static.** Two leaves, solid below the waist and
   glazed above, swept up the body's own `skin_x` profile inside a dark reveal, with a grab
   handle and a step well. It does not open and is not a separate node, so it cannot be
   animated, and it carries no interaction or traversal semantics of any kind.
6. **No livery, lettering or number plate graphics** — no branded trade dress was authored, and
   the plate is a blank clear panel.
7. **The truck received a second authoring pass after the bus**, replacing its earlier rounded
   box cab with station-ring cab and hood lofts, shaped fender/glazing details and a centered
   export. That continuation ended on the CLI budget limit with clean committed assets;
   retaining those assets does not change the run's failed budget status. No rendered-quality
   claim is made. Its tyres sit approximately 8 mm above ground from the existing lathe phase.
8. **`tasklist` was denied** in this session's permission mode, so running Blender processes could
   not be enumerated before execution. Coordination was done through the authorized exclusive
   lock at `…/extra-quality-20260912/blender-execution.lock` instead: acquired with `O_EXCL`,
   waits while another owner holds it, and released only after re-reading and matching its own
   pid/tag. No owner process was signalled or killed, and no stale lock was left behind.
