# SH-L2 irradiance volume, ours (three.js r185, WebGPU/TSL)

Local recipe for a baked spherical-harmonic irradiance volume sampled in a TSL
material graph. Written for Atomic Acres; the maths is textbook and the packing
is ours.

**Upstream, read rather than remembered**
- `Data3DTexture`: https://threejs.org/docs/#api/en/textures/Data3DTexture
- TSL node reference (`texture3D`, `Fn`, `uniform`): https://threejs.org/docs/
  and `docs/threejs-knowledge/upstream/llms-full.txt`
- Ramamoorthi & Hanrahan 2001, *An Efficient Representation for Irradiance
  Environment Maps* - the `A_l` convolution constants.
- Sloan, *Stupid Spherical Harmonics Tricks*, GDC 2008 - windowing / deringing.

Implementation: `src/rendering/lighting/sh-l2-irradiance.ts` (bake, maths,
packing) and `sh-l2-irradiance-node.ts` (textures, TSL node).
Prior art in-repo: `src/rendering/lighting/baked-indirect.ts` is the SH-**L1**
lane this extends. Read it first; it owns the runtime and the digest cache.

---

## 1. The convention, and why it must be stated once

A coefficient means nothing until you fix where the basis constants live.
Ours: the coefficient array stores the raw projection `L_lm = integral(L(w)
Y_lm(w) dw)`, so the basis value `Y` is applied in BOTH projection and
reconstruction, and the Lambertian convolution `A_l` only in reconstruction.

```
A0 = pi        A1 = 2pi/3 = 2.094395     A2 = pi/4 = 0.785398
Y00 = 0.282095            Y1 = 0.488603
Y2 = [1.092548 xy, 1.092548 yz, 0.315392 (3z^2 - 1), 1.092548 xz, 0.546274 (x^2 - y^2)]
```

Reconstruction returns **outgoing diffuse radiance**, i.e. irradiance divided by
pi, so a uniform environment of radiance L reconstructs to exactly L on every
normal.

**Test that identity first.** The white-furnace case is the one check that pins
the convolution constants, the basis normalisation and the `/pi` together: get
any one of them wrong and it fails by a clean multiplicative factor. Add a
band-2 orthonormality check (`<Yi,Yj> = delta_ij` by Monte Carlo) - without it,
two swapped band-2 constants still bake, still sample, and are silently wrong.

## 2. Deringing: do not ship L2 without it, and do not test it wrong

L2 overshoots (Gibbs) on a bright, narrow source and reconstructs **negative**
irradiance on the opposite normal. Fix: scale each band by a Hanning window
before storing.

```
w(l, width) = 0.5 * (1 + cos(pi * l / width)),  w(0) = 1 always
```

Band 0 is never touched, so windowing cannot change a probe's average
irradiance - only how sharply it varies with the normal. Search a ladder of
widths, widest first, and take the first that passes; zero band 2 if none does.

**The trap.** Do not make the acceptance criterion "the reconstruction is
non-negative". **L1 rings too** - it is just hidden behind `max(0, ...)`. An
absolute bar is a standard the L1 band does not meet either, so the search
never succeeds and every probe gets demoted. Use the relative criterion:

> after windowing, the L2 reconstruction is never more negative than the
> **unwindowed L1 reconstruction of the same probe**, in any direction, on any
> channel.

That is both achievable and the property you actually want: adding band 2 can
never make a surface darker than shipping without it.

## 3. Packing: 7 RGBA planes, not one padded atlas

9 coefficients x 3 channels = 27 floats. An RGBA 3D texture holds 4 per texel.

```
plane 0..2 : one per COLOUR CHANNEL, (L0, L1y, L1z, L1x)
plane 3..6 : the 15 L2 floats, channel-major, + one literal-zero pad
```

Seven separate `Data3DTexture`s, each `nx*ny*nz`, **not** one atlas with padded
slices. Reason: every fetch then gets hardware trilinear filtering on all three
axes for free, and there are no slice-padding constants to get wrong. An atlas
stacked along Z would interpolate *across coefficient groups*, which is wrong,
and working around that means doing the trilinear blend by hand.

Planes 0-2 are deliberately byte-identical to the L1 lane's three textures, so
one bake feeds both consumers.

`RGBA16F` (`THREE.HalfFloatType`, `Uint16Array`, `THREE.DataUtils.toHalfFloat`).
Irradiance is low-dynamic-range and low-frequency; half is far finer than what
trilinear interpolation between metres-apart probes already discards. 56 bytes
per probe.

## 4. Texture setup that is easy to get wrong

```js
texture.minFilter = THREE.LinearFilter;   // linear on all 3 axes IS the
texture.magFilter = THREE.LinearFilter;   // trilinear probe blend
texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
texture.generateMipmaps = false;
```

`NearestFilter` makes every surface show the probe grid. A wrapped fetch at the
arena edge reads the probe on the opposite side of the map.

## 5. Sampling in the material graph

```js
// normal-offset: half a cell along the shading normal, BEFORE the fetch
const offset = normal.mul(volumeSpacing).mul(float(0.5));
const world  = positionWorld.add(offset);

// probe (x,y,z) is at texel centre (x+0.5)/n; clamp to the HALF-TEXEL border
const grid = world.sub(volumeOrigin).div(volumeSpacing).add(0.5);
const half = vec3(0.5, 0.5, 0.5).div(volumeDimensions);
const uvw  = clamp(grid.div(volumeDimensions), half, vec3(1,1,1).sub(half));
```

**Normal-offset is not optional.** Without it a surface flush against a cell
boundary trilinearly blends in the probe on the far side of its own wall, and an
interior wall picks up the sunlit exterior behind it. That single artefact makes
a probe volume look worse than no GI at all.

Clamping to the half-texel border rather than to `0..1` is what stops the edge
probe being smeared across the outer half-cell of the volume.

## 6. Budget shape

Keep the grid dimensions **fixed for the life of the node**. Re-upload into the
same texture objects on a rebake or an arena change: swapping a bound texture
for one of different dimensions rebuilds the node, which rebuilds the pipeline.

Make the off switch a **uniform** (`strength = 0`), not a graph edit. A uniform
write leaves bindings and pipeline untouched, so the control can move while a
match is being played; a topology change cannot.

Measured, Nuke Town Rebuild (36 x 84 m, 2 m spacing, 0-6 m):
20x4x44 = 3,520 probes, 192.5 KiB, 969 ms to bake single-threaded at 48
rays/1 bounce, 2,452 ms at 128 rays/2 bounces.

## 7. Gotcha: check your intersector's normal convention

`src/rendering/raytracing/analytic-proxy-scene.ts` returns box hit normals
oriented **along** the ray, not against it. Harmless for a mirror trace
(sign-symmetric); fatal and silent for a diffuse bounce - every `N.L` against
the sun goes negative, every bounce returns black, and the volume bakes to pure
sky while looking entirely plausible.

Flip in the diffuse consumer: `n = dot(n, dir) < 0 ? n : -n`.

**How to catch it:** bake the same geometry twice with different albedos. If the
two volumes are bit-identical, the bounce is dead and the albedo is never being
read. A red wall must throw red light; measure it differentially against a grey
wall of identical geometry, because the absolute R/G ratio at a probe is
dominated by the (blue) sky and answers a different question.
