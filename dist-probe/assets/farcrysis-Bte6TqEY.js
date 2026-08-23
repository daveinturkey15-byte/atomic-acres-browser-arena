import { $ as vec3, A as materialColor, Ac as MathUtils, An as MeshStandardNodeMaterial, B as positionLocal, Bl as PointsMaterial, Cd as Sprite, D as fract, E as float, Fa as CircleGeometry, Fc as Mesh, Fl as PlaneGeometry, Go as Euler, Hd as TextureLoader, Ia as ClampToEdgeWrapping, Ic as MeshBasicMaterial, J as sin, Jl as Quaternion, Ju as RepeatWrapping, Ka as ConeGeometry, Kd as TorusGeometry, Ml as Path, Na as CatmullRomCurve3, Nc as Matrix4, O as instanceIndex, Oo as DirectionalLight, P as mix, Qd as TubeGeometry, Ra as Color, Sa as BoxGeometry, Ta as BufferGeometry, V as positionWorld, Wc as MeshStandardMaterial, Y as smoothstep$1, Yi as AmbientLight, Z as uniform, Zo as Float32BufferAttribute, Zu as RingGeometry, _d as SphereGeometry, _f as Vector3, bs as IcosahedronGeometry, cd as ShapeGeometry, dc as LinearFilter, es as FogExp2, gf as Vector2, hc as LinearMipmapLinearFilter, hs as Group, i as mergeGeometries, ja as CanvasTexture, ks as InstancedMesh, mo as CylinderGeometry, nd as SRGBColorSpace, ru as RGBAFormat, sd as Shape, vl as Object3D, vo as DataTexture, vs as HemisphereLight, wa as BufferAttribute, wd as SpriteMaterial, zl as Points } from "./vendor-three-VV5gneRl.js";
import { c as createBallisticSurface, n as classifyImpactSurface } from "./combat-feedback-bO2zzrSz.js";
//#region src/water/water-authoring.ts
var RUSTWORKS_WATER = Object.freeze({
	arenaId: "rustworks-1v1",
	presentationOwner: "shared-ocean",
	dryFootprintMask: "rectangular",
	level: -19.5,
	swimmable: false,
	amplitudeScale: 1,
	island: Object.freeze({
		halfX: 27,
		halfZ: 29
	}),
	shore: Object.freeze({
		innerRadius: 27.8,
		outerRadius: 78
	}),
	nearSize: 960,
	horizonRadius: 3200,
	night: true,
	palette: Object.freeze({
		deep: 465707,
		shallow: 1465201,
		foam: 6863305
	}),
	legacyPalette: Object.freeze({
		deep: 133140,
		shallow: 666180,
		foam: 8308968
	})
});
var FARCRYSIS_WATER = Object.freeze({
	arenaId: "farcrysis",
	presentationOwner: "arena-builder",
	dryFootprintMask: "rectangular",
	level: -.25,
	swimmable: true,
	amplitudeScale: .2,
	island: Object.freeze({
		halfX: 32,
		halfZ: 32
	}),
	shore: Object.freeze({
		innerRadius: 15,
		outerRadius: 37
	}),
	nearSize: 76,
	horizonRadius: 1400,
	night: false,
	palette: Object.freeze({
		deep: 871004,
		shallow: 1680296,
		foam: 16776953
	}),
	legacyPalette: Object.freeze({
		deep: 871004,
		shallow: 1680296,
		foam: 16776953
	})
});
var HIGH_SEAS_WATER = Object.freeze({
	arenaId: "high-seas",
	presentationOwner: "shared-ocean",
	dryFootprintMask: "none",
	level: -2.2,
	swimmable: false,
	amplitudeScale: .15,
	island: Object.freeze({
		halfX: 12,
		halfZ: 44
	}),
	shore: Object.freeze({
		innerRadius: 44,
		outerRadius: 94
	}),
	nearSize: 960,
	horizonRadius: 3200,
	night: false,
	palette: Object.freeze({
		deep: 407120,
		shallow: 1539477,
		foam: 15203327
	}),
	legacyPalette: Object.freeze({
		deep: 407120,
		shallow: 1539477,
		foam: 15203327
	})
});
/** Every authored water body, keyed by arena. Arenas absent here have none. */
/**
* HF-358 audit history: farcrysis was deliberately NOT registered in Pass 74.
*
* The arena already authors three of its own water layers at y = -0.28/-0.24/-0.22
* (src/farcrysis-art.ts), so registering it here built a SECOND ocean 20mm below
* the real one. Worse, its authored `amplitudeScale: 0.2` never applied: the
* runtime unconditionally passes the RustRig storm amplitude (1.55), and the
* consumer reads `graphics.oceanWaveAmplitude ?? default`, so the nullish
* coalesce never fired. With band weights summing to ~1.525 that put opaque
* ~2.36m swells cresting ~2m ABOVE a 64x64 island whose eye height is ~1.6m -
* the map would have been unplayable on the first click.
*
* PASS 75 RESOLVED THIS. Registration in this map no longer implies shared-ocean
* PRESENTATION, which is what both objections above were actually about. Pass 75
* added `presentationOwner`, and every presentation consumer goes through
* `sharedWaterBodyForArena` (pass64-tsl-scene.ts:518/566/688, legacy-main far-plane
* selection) which returns null for an `arena-builder` body. So farcrysis draws no
* second ocean while still being registered.
*
* Both original conditions are now met, checked rather than assumed:
*   1. Duplication - impossible: no shared-ocean presentation path resolves farcrysis.
*   2. amplitudeScale reaching the surface - the consumer now multiplies by
*      `body.amplitudeScale` explicitly instead of relying on a nullish coalesce that
*      never fired, and for farcrysis the shared ocean amplitude path does not run at
*      all.
*
* Leaving it unregistered had a real cost, which is why this was changed rather than
* left alone: `water-system.ts` (the WebGL2/CPU authority route) reads
* `waterBodyForArena`, so an unregistered farcrysis has NO authoritative level,
* swimmable flag or amplitudeScale on that path - the gameplay values disappear along
* with the unwanted presentation. Those values are host-authoritative and must not
* vary by render profile, so dropping them was the more dangerous of the two options.
*/
var WATER_BODIES = Object.freeze({
	"rustworks-1v1": RUSTWORKS_WATER,
	farcrysis: FARCRYSIS_WATER,
	"high-seas": HIGH_SEAS_WATER
});
/** Null for arenas without water — atomic-acres, gun-range, skyline-terminal. */
function waterBodyForArena(arenaId) {
	return WATER_BODIES[arenaId] ?? null;
}
/** Null when an arena has no sea or deliberately retains an arena-owned surface. */
function sharedWaterBodyForArena(arenaId) {
	const body = waterBodyForArena(arenaId);
	return body?.presentationOwner === "shared-ocean" ? body : null;
}
var TEXTURE_SIZE = 256;
var CACHE = /* @__PURE__ */ new Map();
function hash2D(x, y, seed) {
	const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
	return n - Math.floor(n);
}
/** Tiling-safe value noise: lattice coordinates wrap at `period`. */
function noise2D(x, y, seed, period) {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const xf = x - xi;
	const yf = y - yi;
	const wrap = (value) => (value % period + period) % period;
	const a = hash2D(wrap(xi), wrap(yi), seed);
	const b = hash2D(wrap(xi + 1), wrap(yi), seed);
	const c = hash2D(wrap(xi), wrap(yi + 1), seed);
	const d = hash2D(wrap(xi + 1), wrap(yi + 1), seed);
	const u = xf * xf * (3 - 2 * xf);
	const v = yf * yf * (3 - 2 * yf);
	return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y, seed, octaves, basePeriod) {
	let total = 0;
	let amplitude = 1;
	let normalisation = 0;
	let frequency = 1;
	for (let octave = 0; octave < octaves; octave += 1) {
		total += noise2D(x * frequency, y * frequency, seed + octave, basePeriod * frequency) * amplitude;
		normalisation += amplitude;
		amplitude *= .5;
		frequency *= 2;
	}
	return total / Math.max(1e-6, normalisation);
}
/**
* Height field for one surface, in 0..1. The normal map is derived from this,
* so this function is where the *feel* of each surface is actually authored.
*/
function surfaceHeight(surface, x, y) {
	const u = x / TEXTURE_SIZE * 8;
	const v = y / TEXTURE_SIZE * 8;
	switch (surface) {
		case "dry-sand": {
			const ripple = Math.sin((v + fbm(u, v, 3, 3, 8) * 1.4) * 6) * .5 + .5;
			const grain = fbm(u * 6, v * 6, 11, 3, 48);
			return ripple * .55 + grain * .45;
		}
		case "wet-sand": {
			const sheet = fbm(u * .8, v * .8, 5, 3, 6);
			const grain = fbm(u * 5, v * 5, 17, 2, 40);
			return sheet * .78 + grain * .22;
		}
		default: {
			const clump = fbm(u * 1.6, v * 1.6, 23, 4, 12);
			const pebble = Math.pow(fbm(u * 9, v * 9, 29, 2, 72), 3) * 2.2;
			return Math.min(1, clump * .7 + pebble * .3);
		}
	}
}
function buildTexture(key, data, colorSpace, repeat) {
	const cached = CACHE.get(key);
	if (cached) return cached;
	const texture = new DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, RGBAFormat);
	texture.name = `farcrysis-ground-${key}`;
	texture.colorSpace = colorSpace;
	texture.wrapS = RepeatWrapping;
	texture.wrapT = RepeatWrapping;
	texture.repeat.set(repeat, repeat);
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.anisotropy = 8;
	texture.needsUpdate = true;
	CACHE.set(key, texture);
	return texture;
}
/** Authored surface response. Wet sand is smoother than dry - that is physics. */
var SURFACE_RESPONSE = Object.freeze({
	"dry-sand": Object.freeze({
		roughness: .94,
		normalScale: 1.15,
		relief: 3.4
	}),
	"wet-sand": Object.freeze({
		roughness: .34,
		normalScale: .55,
		relief: 1.5
	}),
	terrain: Object.freeze({
		roughness: .88,
		normalScale: 1,
		relief: 3
	})
});
function farcrysisGroundTextures(surface, repeat) {
	const response = SURFACE_RESPONSE[surface];
	const pixels = TEXTURE_SIZE * TEXTURE_SIZE;
	const albedo = new Uint8Array(pixels * 4);
	const rough = new Uint8Array(pixels * 4);
	const heights = new Float32Array(pixels);
	for (let y = 0; y < TEXTURE_SIZE; y += 1) for (let x = 0; x < TEXTURE_SIZE; x += 1) {
		const index = y * TEXTURE_SIZE + x;
		const height = surfaceHeight(surface, x, y);
		heights[index] = height;
		const shade = .8 + height * .2;
		const value = Math.round(MathUtils.clamp(shade, 0, 1) * 255);
		const offset = index * 4;
		albedo[offset] = value;
		albedo[offset + 1] = value;
		albedo[offset + 2] = value;
		albedo[offset + 3] = 255;
		const roughVariation = (.5 - height) * (surface === "wet-sand" ? .1 : .22);
		const roughValue = Math.round(MathUtils.clamp(response.roughness + roughVariation, 0, 1) * 255);
		rough[offset] = roughValue;
		rough[offset + 1] = roughValue;
		rough[offset + 2] = roughValue;
		rough[offset + 3] = 255;
	}
	const normal = new Uint8Array(pixels * 4);
	for (let y = 0; y < TEXTURE_SIZE; y += 1) {
		const yPrev = (y - 1 + TEXTURE_SIZE) % TEXTURE_SIZE;
		const yNext = (y + 1) % TEXTURE_SIZE;
		for (let x = 0; x < TEXTURE_SIZE; x += 1) {
			const xPrev = (x - 1 + TEXTURE_SIZE) % TEXTURE_SIZE;
			const xNext = (x + 1) % TEXTURE_SIZE;
			const dx = (heights[y * TEXTURE_SIZE + xNext] - heights[y * TEXTURE_SIZE + xPrev]) * response.relief;
			const dy = (heights[yNext * TEXTURE_SIZE + x] - heights[yPrev * TEXTURE_SIZE + x]) * response.relief;
			const length = Math.hypot(dx, dy, 1);
			const offset = (y * TEXTURE_SIZE + x) * 4;
			normal[offset] = Math.round((-dx / length * .5 + .5) * 255);
			normal[offset + 1] = Math.round((-dy / length * .5 + .5) * 255);
			normal[offset + 2] = Math.round((1 / length * .5 + .5) * 255);
			normal[offset + 3] = 255;
		}
	}
	return Object.freeze({
		map: buildTexture(`${surface}-albedo-${repeat}`, albedo, SRGBColorSpace, repeat),
		normalMap: buildTexture(`${surface}-normal-${repeat}`, normal, "", repeat),
		roughnessMap: buildTexture(`${surface}-roughness-${repeat}`, rough, "", repeat),
		roughness: response.roughness,
		normalScale: response.normalScale
	});
}
/** Repeat that yields GROUND_TILE_METRES on a mesh whose UVs span 0..1. */
var FARCRYSIS_GROUND_REPEAT = Math.round(64 / 2);
/**
* Applies a ground texture set to a material in place.
*
* Deliberately mutates rather than replaces: the existing materials already
* carry vertexColors, side and colour decisions made by the terrain author,
* and none of those should be re-litigated here.
*/
function applyFarcrysisGroundMaterial(target, surface, repeat = FARCRYSIS_GROUND_REPEAT) {
	const textures = farcrysisGroundTextures(surface, repeat);
	target.map = textures.map;
	target.normalMap = textures.normalMap;
	target.roughnessMap = textures.roughnessMap;
	target.normalScale = new Vector2(textures.normalScale, textures.normalScale);
	target.roughness = textures.roughness;
	target.userData.farcrysisGroundSurface = surface;
	target.needsUpdate = true;
}
//#endregion
//#region src/farcrysis-constants.ts
var FARCRYSIS_BOUNDS = Object.freeze({
	minX: -32,
	maxX: 32,
	minZ: -32,
	maxZ: 32
});
//#endregion
//#region src/farcrysis-terrain-authority.ts
/** The one gameplay water level (registry-authoritative, see water-authoring). */
var FARCRYSIS_WATER_LEVEL = FARCRYSIS_WATER.level;
/**
* Physics-only fail-safe floor. Must sit below the deepest shore point
* (~-3.98 m) so the safety plate never overrides the authored sea-floor ramp.
*/
var FARCRYSIS_SAFETY_FLOOR_Y = -4.5;
/** Shore-descent profile constants (HF-360 deliberate change #2 above). */
var FARCRYSIS_SHORE = Object.freeze({
	/** Edge distance (m from the arena boundary) where the seaward drop begins. */
	descentStartDist: 4,
	/** Metres of drop per metre walked toward the arena edge (45 degrees). */
	descentSlope: 1,
	/** Height where the descent joins the untouched beach shelf at dist=4. */
	joinHeight: .02
});
/** Core-pad blend radii (Chebyshev metres from origin; change #1 above). */
var CORE_PAD_INNER = 7;
var CORE_PAD_OUTER = 10;
var ARENA_HALF$1 = FARCRYSIS_BOUNDS.maxX;
function smoothstep(edge0, edge1, x) {
	const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}
/**
* Analytic terrain height at (x, z) — the single source of truth.
*
* Every consumer (rendered terrain, vegetation seating, prop/collider
* seating, physics plates, bot elevation platforms) must resolve ground
* height through this function and nothing else.
*/
function farcrysisTerrainHeight(x, z) {
	const chebyshev = Math.max(Math.abs(x), Math.abs(z));
	const dist = ARENA_HALF$1 - chebyshev;
	if (dist < FARCRYSIS_SHORE.descentStartDist) return (dist - FARCRYSIS_SHORE.descentStartDist) * FARCRYSIS_SHORE.descentSlope + FARCRYSIS_SHORE.joinHeight;
	if (dist < 10) return Math.max(0, dist * .03 - .1);
	const h = Math.sin(x * .12) * Math.cos(z * .15) * 1.2 + Math.sin(x * .25 + 1.3) * Math.cos(z * .22 + 2.1) * .6 + Math.sin(z * .18 - .7) * .4;
	const interior = Math.max(-.05, h + .1);
	if (chebyshev < CORE_PAD_OUTER) return interior * smoothstep(CORE_PAD_INNER, CORE_PAD_OUTER, chebyshev);
	return interior;
}
/** Plates never subdivide below this half-size (corner fold seams only). */
var PLATE_MIN_HALF_M = .2;
/** Plate slab thickness — thick enough that seams never open a gap. */
var PLATE_THICKNESS_M = .6;
function fitPlate(cx, cz, half) {
	const eps = Math.min(.25, half * .5);
	const groundY = farcrysisTerrainHeight(cx, cz);
	const gradientX = (farcrysisTerrainHeight(cx + eps, cz) - farcrysisTerrainHeight(cx - eps, cz)) / (2 * eps);
	const gradientZ = (farcrysisTerrainHeight(cx, cz + eps) - farcrysisTerrainHeight(cx, cz - eps)) / (2 * eps);
	let maxError = 0;
	for (let i = -2; i <= 2; i += 1) for (let j = -2; j <= 2; j += 1) {
		const sx = cx + i / 2 * half;
		const sz = cz + j / 2 * half;
		const plane = groundY + gradientX * (sx - cx) + gradientZ * (sz - cz);
		const error = Math.abs(farcrysisTerrainHeight(sx, sz) - plane);
		if (error > maxError) maxError = error;
	}
	const alpha = -Math.atan(gradientZ);
	const gamma = Math.atan(gradientX * Math.cos(alpha));
	const normalY = 1 / Math.sqrt(1 + gradientX * gradientX + gradientZ * gradientZ);
	const centreY = groundY - PLATE_THICKNESS_M / 2 / normalY;
	const flat = Math.abs(gradientX) < 1e-4 && Math.abs(gradientZ) < 1e-4;
	return {
		box: {
			minX: cx - half,
			maxX: cx + half,
			minZ: cz - half,
			maxZ: cz + half,
			minY: centreY - PLATE_THICKNESS_M / 2,
			maxY: centreY + PLATE_THICKNESS_M / 2,
			...flat ? {} : { rotation: [
				alpha,
				0,
				gamma
			] }
		},
		centreX: cx,
		centreZ: cz,
		groundY,
		gradientX,
		gradientZ,
		maxError
	};
}
function emitPlates(cx, cz, half, out) {
	const fitted = fitPlate(cx, cz, half);
	if (fitted.maxError <= .12 || half <= PLATE_MIN_HALF_M) {
		const { maxError: _discarded, ...plate } = fitted;
		out.push(Object.freeze(plate));
		return;
	}
	const quarter = half / 2;
	emitPlates(cx - quarter, cz - quarter, quarter, out);
	emitPlates(cx + quarter, cz - quarter, quarter, out);
	emitPlates(cx - quarter, cz + quarter, quarter, out);
	emitPlates(cx + quarter, cz + quarter, quarter, out);
}
var plateCache = null;
/**
* Adaptive quadtree of tangent-plane plates covering the full arena. Pure and
* deterministic; cached because the surface constants never change at runtime.
* Consumed by buildFarcrysis into `physicsColliders` ONLY — never `colliders`
* (line-of-sight, bot avoidance and spawn checks must not see 3k ground
* plates), exactly how map.ts registers Atomic Acres ramps physics-only.
*/
function farcrysisTerrainPhysicsTiles() {
	if (plateCache) return plateCache;
	const out = [];
	const rootHalf = 2;
	for (let cx = FARCRYSIS_BOUNDS.minX + rootHalf; cx < FARCRYSIS_BOUNDS.maxX; cx += rootHalf * 2) for (let cz = FARCRYSIS_BOUNDS.minZ + rootHalf; cz < FARCRYSIS_BOUNDS.maxZ; cz += rootHalf * 2) emitPlates(cx, cz, rootHalf, out);
	plateCache = Object.freeze(out);
	return plateCache;
}
var platformCache = null;
/**
* 1 m platform grid sampling the authority surface at each cell centre, for
* `root.userData.verticalNavigation.platforms` (the high-seas idiom that
* legacy-main botElevationAt already consumes). 1 m keeps neighbouring steps
* under ~0.4 m so bot feet track the hills without large pops; a continuous
* bot elevation sampler would need a legacy-main change and is out of scope.
*/
function farcrysisBotGroundPlatforms() {
	if (platformCache) return platformCache;
	const out = [];
	for (let x = FARCRYSIS_BOUNDS.minX; x < FARCRYSIS_BOUNDS.maxX; x += 1) for (let z = FARCRYSIS_BOUNDS.minZ; z < FARCRYSIS_BOUNDS.maxZ; z += 1) out.push(Object.freeze({
		id: `fc-ground-${x}-${z}`,
		minX: x,
		maxX: x + 1,
		minZ: z,
		maxZ: z + 1,
		y: farcrysisTerrainHeight(x + .5, z + .5)
	}));
	platformCache = Object.freeze(out);
	return platformCache;
}
//#endregion
//#region src/farcrysis-palms-enhanced.ts
/**
* farcrysis-palms-enhanced.ts — Pass 69 Farcrysis palm re-authoring.
*
* Replaces the old flat-box palm dressing (addInstancedPalms in
* farcrysis-art.ts) with proper fan-shaped palm crowns and tapered,
* slightly leaning trunks:
*
*   - Custom BufferGeometry palm crown: 8 drooping frond blades with a
*     raised center spine per blade plus a closed hub — a 3-4 m fan that
*     reads as a coconut-palm fountain from any angle.
*   - Tapered CylinderGeometry trunk (0.18 top / 0.34 base, 2.5 m tall),
*     translated so its base rests at the terrain estimate, with a small
*     per-palm lean around the base.
*   - 26 palms: 16 on the beach lagoon ring (22-30 m) + 10 scattered
*     deeper toward the jungle (11-19 m), varied scale 0.7-1.3, kept
*     inside FARCRYSIS_BOUNDS with a 1.5 m margin and off the flat
*     corridor lane strips (no sightline-blocking trunks).
*   - Coconut clusters: 3 small spheres tucked under each crown.
*
* Everything is InstancedMesh (one draw call per material group) and
* placement is fully deterministic via a local Mulberry32 PRNG (same
* implementation as farcrysis-terrain.ts) — no Math.random, no external
* assets. Presentation only: no colliders, no gameplay authority.
*
* NOTE on imports: farcrysis-art.ts imports buildEnhancedPalms from here
* and this module imports FARCRYSIS_ART_FEEL from farcrysis-art.ts — a
* deliberate cycle mirroring the existing art <-> terrain cycle. ESM live
* bindings make this safe because FARCRYSIS_ART_FEEL is only read inside
* function bodies, never at module evaluation time.
*/
/** Seeded PRNG (copied from farcrysis-terrain.ts) so placement is stable. */
function mulberry32$7(seed) {
	return () => {
		seed |= 0;
		seed = seed + 1831565813 | 0;
		let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
function clamp(value, lo, hi) {
	return Math.max(lo, Math.min(hi, value));
}
var PALM_COUNT = 26;
var BEACH_PALM_COUNT = 16;
var BEACH_RING_MIN = 22;
var BEACH_RING_MAX = 30;
var JUNGLE_RING_MIN = 11;
var JUNGLE_RING_MAX = 19;
var BOUNDS_MARGIN = 1.5;
var TRUNK_HEIGHT = 2.5;
var { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;
/** True when (x, z) falls on the flat corridor lane strips (|x|≈20 or |z|≈20). */
function onCorridorStrip(x, z) {
	const laneHW = 5.5;
	return Math.abs(Math.abs(x) - 20) < laneHW || Math.abs(Math.abs(z) - 20) < laneHW;
}
/**
* Deterministic per-instance colour variation via instanceColor — rides the
* existing instanced draw, so draw-call structure is unchanged.
*/
function varyPalmInstanceColors(mesh, seed) {
	const mat = mesh.material;
	if (!mat || !mat.color) return;
	const hsl = {
		h: 0,
		s: 0,
		l: 0
	};
	mat.color.getHSL(hsl);
	const rng = mulberry32$7(seed);
	const c = new Color();
	for (let i = 0; i < mesh.count; i += 1) {
		const h = hsl.h + (rng() - .5) * .03;
		const s = Math.max(0, Math.min(1, hsl.s * (.85 + rng() * .3)));
		const l = Math.max(0, Math.min(1, hsl.l * (.78 + rng() * .48)));
		c.setHSL(h, s, l);
		mesh.setColorAt(i, c);
	}
	if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
/**
* Builds a single fan-shaped palm crown as one BufferGeometry:
*   - 8 tapered leaf blades radiating from a closed center hub,
*   - each blade droops outward (tip lower than hub) like a coconut palm,
*   - each blade carries a thin raised center spine ridge,
*   - crown dish spans ~3-4 m across, ~0.3 m thick at the hub.
* The crown's local origin is the hub center (where the trunk top sits).
*/
function createPalmCrownGeometry() {
	const bladeCount = 8;
	const positions = [];
	const indices = [];
	const hubIndex = 0;
	positions.push(0, .03, 0);
	const hubRim = [];
	for (let k = 0; k < bladeCount; k += 1) {
		const theta = k / bladeCount * Math.PI * 2 + .21;
		const ux = Math.cos(theta);
		const uz = Math.sin(theta);
		const vx = uz;
		const vz = -ux;
		const len = 1.5 + k * 37 % 10 / 10 * .55;
		const droop = .5 + k * 13 % 7 / 7 * .35;
		const w0 = .34;
		const w1 = .6;
		const bl = 1 + k * 11;
		const br = bl + 1;
		positions.push(ux * .3 + vx * w0, .05, uz * .3 + vz * w0, ux * .3 - vx * w0, .05, uz * .3 - vz * w0, ux * 1 + vx * w1, -.16, uz * 1 + vz * w1, ux * 1 - vx * w1, -.16, uz * 1 - vz * w1, ux * len, -droop, uz * len);
		hubRim.push(bl, br);
		indices.push(bl, bl + 2, bl + 3);
		indices.push(bl, bl + 3, br);
		indices.push(bl + 2, bl + 4, bl + 3);
		const sr = .05;
		positions.push(ux * .32 + vx * sr, .18, uz * .32 + vz * sr, ux * .32 - vx * sr, .18, uz * .32 - vz * sr, ux * 1 + vx * sr, .04, uz * 1 + vz * sr, ux * 1 - vx * sr, .04, uz * 1 - vz * sr, ux * len * .92 + vx * sr * .6, -droop * .92, uz * len * .92 + vz * sr * .6, ux * len * .92 - vx * sr * .6, -droop * .92, uz * len * .92 - vz * sr * .6);
		const s0 = bl + 5;
		indices.push(s0, s0 + 2, s0 + 3);
		indices.push(s0, s0 + 3, s0 + 1);
		indices.push(s0 + 2, s0 + 4, s0 + 5);
		indices.push(s0 + 2, s0 + 5, s0 + 3);
	}
	for (let k = 0; k < bladeCount; k += 1) indices.push(hubIndex, hubRim[k * 2 + 1], hubRim[k * 2]);
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}
/** Deterministic placement: beach ring first, then jungle scatter. */
function buildPlacements() {
	const rng = mulberry32$7(2654435769);
	const placements = [];
	let guard = 0;
	while (placements.length < PALM_COUNT && guard < 800) {
		guard += 1;
		const radius = placements.length < BEACH_PALM_COUNT ? BEACH_RING_MIN + rng() * (BEACH_RING_MAX - BEACH_RING_MIN) : JUNGLE_RING_MIN + rng() * (JUNGLE_RING_MAX - JUNGLE_RING_MIN);
		const angle = rng() * Math.PI * 2;
		const x = clamp(Math.cos(angle) * radius, minX + BOUNDS_MARGIN, maxX - BOUNDS_MARGIN);
		const z = clamp(Math.sin(angle) * radius * .92, minZ + BOUNDS_MARGIN, maxZ - BOUNDS_MARGIN);
		if (onCorridorStrip(x, z)) continue;
		const scale = .7 + rng() * .6;
		placements.push({
			x,
			z,
			baseY: farcrysisTerrainHeight(x, z),
			yaw: angle + (rng() - .5) * .5,
			lean: (rng() - .5) * .24,
			scale,
			crownSpin: rng() * Math.PI * 2,
			crownTilt: (rng() - .5) * .14,
			crownScale: scale * (1 + (rng() - .5) * .16)
		});
	}
	return placements;
}
/**
* HF-360: exported so buildFarcrysis can author trunk colliders for these
* palms in the gameplay file. Placement stays deterministic (seeded PRNG), so
* the collider set and the rendered instances always agree — and the art
* layer itself still adds no gameplay authority, keeping the module contract.
*/
function enhancedPalmPlacements() {
	return buildPlacements();
}
/**
* Instanced palm stand builder for an arbitrary placement list.
*
* Pass-76 consolidation: the arena used to carry THREE palm systems (gameplay
* box-trunk palms in farcrysis.ts, slab-frond palms in farcrysis-vegetation.ts
* and the enhanced palms here). All of them now render through this one
* builder so every palm in the arena shares the same crown/trunk silhouette;
* only placement lists differ. Presentation only — colliders stay authored in
* farcrysis.ts against the same deterministic placements.
*/
function buildPalmStandInstances(root, placements, namePrefix) {
	const count = placements.length;
	const trunkGeometry = new CylinderGeometry(.18, .34, TRUNK_HEIGHT, 8);
	trunkGeometry.translate(0, TRUNK_HEIGHT / 2, 0);
	const crownGeometry = createPalmCrownGeometry();
	const coconutGeometry = new SphereGeometry(.15, 6, 4);
	const trunkMaterial = new MeshStandardMaterial({
		color: FARCRYSIS_ART_FEEL.palmTrunk,
		roughness: .88,
		metalness: .03
	});
	const frondMaterial = new MeshStandardMaterial({
		color: FARCRYSIS_ART_FEEL.palmFrond,
		roughness: .85,
		metalness: .02,
		side: 2
	});
	const coconutMaterial = new MeshStandardMaterial({
		color: FARCRYSIS_ART_FEEL.palmTrunk,
		roughness: .7,
		metalness: .05
	});
	const trunkInstances = new InstancedMesh(trunkGeometry, trunkMaterial, count);
	trunkInstances.name = `${namePrefix}-trunks`;
	trunkInstances.castShadow = true;
	trunkInstances.receiveShadow = true;
	trunkInstances.userData.farcrysisArt = true;
	const frondInstances = new InstancedMesh(crownGeometry, frondMaterial, count);
	frondInstances.name = `${namePrefix}-fronds`;
	frondInstances.castShadow = true;
	frondInstances.receiveShadow = true;
	frondInstances.userData.farcrysisArt = true;
	const coconutInstances = new InstancedMesh(coconutGeometry, coconutMaterial, count * 3);
	coconutInstances.name = `${namePrefix}-coconuts`;
	coconutInstances.castShadow = true;
	coconutInstances.receiveShadow = true;
	coconutInstances.userData.farcrysisArt = true;
	const matrix = new Matrix4();
	const basePos = new Vector3();
	const trunkQuat = new Quaternion();
	const tmpQuat = new Quaternion();
	const tmpEuler = new Euler();
	const local = new Vector3();
	const world = new Vector3();
	const scl = new Vector3();
	for (let i = 0; i < count; i += 1) {
		const p = placements[i];
		basePos.set(p.x, p.baseY + .02, p.z);
		tmpEuler.set(p.lean, p.yaw, 0);
		trunkQuat.setFromEuler(tmpEuler);
		scl.set(1, p.scale, 1);
		matrix.compose(basePos, trunkQuat, scl);
		trunkInstances.setMatrixAt(i, matrix);
		local.set(0, TRUNK_HEIGHT * p.scale, 0);
		world.copy(local).applyQuaternion(trunkQuat).add(basePos);
		tmpEuler.set(0, p.crownSpin, p.crownTilt);
		tmpQuat.setFromEuler(tmpEuler);
		const crownQuat = tmpQuat.clone().premultiply(trunkQuat);
		const crownSquash = .94 + i * 37 % 7 * .02;
		scl.set(p.crownScale, p.crownScale * crownSquash, p.crownScale);
		matrix.compose(world, crownQuat, scl);
		frondInstances.setMatrixAt(i, matrix);
		for (let c = 0; c < 3; c += 1) {
			const cocoIndex = i * 3 + c;
			const cAngle = c / 3 * Math.PI * 2 + p.yaw * .7 + i % 2 * .25;
			const cRadius = .2 + (i * 7 + c * 11) % 5 * .018;
			const cY = TRUNK_HEIGHT * p.scale - .05 + (i + c) % 3 * .03;
			local.set(Math.cos(cAngle) * cRadius, cY, Math.sin(cAngle) * cRadius);
			world.copy(local).applyQuaternion(trunkQuat).add(basePos);
			tmpEuler.set(0, (i * 13 + c * 29) % 7, 0);
			tmpQuat.setFromEuler(tmpEuler);
			const cocoQuat = tmpQuat.clone().premultiply(trunkQuat);
			scl.setScalar(.8 + (i * 5 + c * 3) % 4 * .08);
			matrix.compose(world, cocoQuat, scl);
			coconutInstances.setMatrixAt(cocoIndex, matrix);
		}
	}
	trunkInstances.instanceMatrix.needsUpdate = true;
	frondInstances.instanceMatrix.needsUpdate = true;
	coconutInstances.instanceMatrix.needsUpdate = true;
	trunkInstances.computeBoundingSphere();
	frondInstances.computeBoundingSphere();
	coconutInstances.computeBoundingSphere();
	varyPalmInstanceColors(trunkInstances, 31249);
	varyPalmInstanceColors(frondInstances, 61661);
	varyPalmInstanceColors(coconutInstances, 49344);
	root.add(trunkInstances);
	root.add(frondInstances);
	root.add(coconutInstances);
	return {
		trunkInstances,
		frondInstances,
		coconutInstances
	};
}
function buildEnhancedPalms(root) {
	return buildPalmStandInstances(root, buildPlacements(), "farcrysis-art-enhanced-palm");
}
//#endregion
//#region src/farcrysis-tsl-foliage.ts
/**
* farcrysis-tsl-foliage.ts — HF-359/HF-363 typed TSL foliage shading helpers.
*
* Replaces the previous onBeforeCompile GLSL injection (forbidden by the repo
* contract: no ShaderMaterial / RawShaderMaterial / onBeforeCompile) with
* three/webgpu MeshStandardNodeMaterial node graphs:
*
*   1. WIND (HF-359): per-instance phase-offset sway driven entirely in
*      positionLocal/positionWorld nodes. Each instance gets a stable hash of
*      its instanceIndex as a phase offset so fronds never pulse in unison.
*      One shared uTime uniform per material family; animateVegetationWind()
*      advances it — the per-frame driver stays bound to the terrain mesh.
*
*   2. CANOPY TRANSMITTANCE (HF-359, highest value): analytic dappled-light
*      term in colorNode. Instead of pushing thousands of leaf cards into the
*      sun's shadow map, foliage receives an animated multi-octave sine field
*      over world position that approximates sunlight filtering through a
*      moving canopy. Cheaper than shadow-mapped foliage and it is the
*      signature jungle look. Ground-level scatter layers get a stronger,
*      slower dapple; canopy leaves get a subtle one.
*
* HF-374 — WHY THE GRAPHS ARE SHARED AND BUCKETED.
*
* The WebGPU backend compiles one shader program and one render pipeline per
* DISTINCT NODE GRAPH, and three identifies a graph by node-object identity:
* `NodeMaterial.customProgramCacheKey()` hashes each `*Node` property through
* `Node.getCacheKey()`, whose `customCacheKey()` is the node's instance id. Two
* structurally identical graphs built from two separate calls therefore never
* share a pipeline — only graphs built from the SAME node objects do.
*
* This module used to bake every per-layer number (base colour, dapple
* strength, sway amplitude/height/speed) into the graph as a literal node, and
* `swayHeight` came from each mesh's own bounding box, so effectively every
* foliage layer produced a unique graph: 86 unique programs for one arena. The
* arena-admission coverage draw (`withArenaFrustumCullingDisabled` + forced
* full-scene submission + a 12 s queue fence) then had to realise all of them
* in a single GPU submission, which never completed — farcrysis could not boot
* on the WebGPU route while WebGL2 was fine, because `_applyTslFoliage` is
* skipped entirely on WebGL2. That is HF-374.
*
* So the graphs are now:
*   - built once per QUANTISED bucket and shared by every material in it. The
*     buckets are the three families the dapple table already authors by hand
*     (ground scatter / undergrowth / canopy) and three sway sizes (blade /
*     shrub / frond). The eye cannot read a 5 % difference in frond amplitude;
*     the GPU pays a whole pipeline for it.
*   - colour-free: the base colour comes from `materialColor`, a module-level
*     TSL singleton that reads each material's OWN `color` uniform, so every
*     layer keeps its authored hue (and its per-instance colour variation)
*     without splitting the graph.
*
* Presentation only — never adds colliders, never changes sightlines.
*/
/** Dapple families, matching the hand-authored groups in the dapple table. */
var DAPPLE_BUCKETS = [
	.28,
	.5,
	.78
];
/** Sway sizes: grass blade, shrub/fern, palm frond. Metres. */
var SWAY_HEIGHT_BUCKETS = [
	.8,
	2.5,
	8
];
/** Sway speed multipliers. Production only uses 1; the API still allows more. */
var SWAY_SPEED_BUCKETS = [1];
function bucket(value, ladder) {
	let best = ladder[0];
	let bestDistance = Math.abs(value - best);
	for (let i = 1; i < ladder.length; i++) {
		const distance = Math.abs(value - ladder[i]);
		if (distance < bestDistance) {
			best = ladder[i];
			bestDistance = distance;
		}
	}
	return best;
}
var _windUniforms = [];
/** Advance every TSL wind uniform. Call once per frame (terrain-mesh driver). */
function tslAdvanceWind(time) {
	for (let i = 0; i < _windUniforms.length; i++) _windUniforms[i].time.value = time;
}
/** Stable pseudo-random per-instance scalar in [0,1) from the instance index. */
function instanceHash(scale) {
	return fract(sin(float(instanceIndex).mul(12.9898).add(scale * 7.13)).mul(43758.5453));
}
var _graphCache = /* @__PURE__ */ new Map();
/**
* Amplitude is derived from the BUCKETED height, not the caller's exact height,
* so "big fronds move more than blades" survives quantisation while the graph
* stays shared. Mirrors the caller's own `min(0.09, 0.02 + height * 0.02)`.
*/
function swayAmountForHeight(height) {
	return Math.min(.09, .02 + height * .02);
}
function foliageGraph(dapple, swayHeight, swaySpeed, sway) {
	const key = `${dapple}|${sway ? swayHeight : "none"}|${sway ? swaySpeed : "none"}`;
	const cached = _graphCache.get(key);
	if (cached) return cached;
	let colorNode = null;
	if (dapple > 0) {
		const wx = positionWorld.x;
		const wz = positionWorld.z;
		const wy = positionWorld.y;
		const o1 = sin(wx.mul(.9).add(wz.mul(.6)));
		const o2 = sin(wx.mul(-.42).add(wz.mul(1.15)).mul(1.7));
		const o3 = sin(wx.mul(2.1).sub(wz.mul(1.7)).mul(.61));
		const field = o1.add(o2.mul(.7)).add(o3.mul(.5)).div(2.2).mul(.5).add(.5);
		const hBias = smoothstep$1(.5, 6, wy.sub(1));
		const strength = float(dapple).mul(hBias.mul(.35).add(.65));
		const baseV = vec3(materialColor);
		const lit = baseV.mul(vec3(1.18, 1.1, .92));
		colorNode = mix(baseV.mul(vec3(.52, .66, .58)), lit, field.mul(strength));
	}
	let positionNode = null;
	let wind = null;
	if (sway) {
		const t = uniform(0);
		wind = {
			time: t,
			users: 0
		};
		_windUniforms.push(wind);
		const amount = float(swayAmountForHeight(swayHeight));
		const h = positionLocal.y.div(swayHeight).clamp(0, 1);
		const phase = instanceHash(1).mul(Math.PI * 2);
		const phase2 = instanceHash(2).mul(Math.PI * 2);
		const w1 = sin(t.mul(swaySpeed * 1.6).add(phase).add(positionLocal.x.mul(.8)));
		const w2 = sin(t.mul(swaySpeed * 1.05).add(phase2).add(positionLocal.z.mul(1.1))).mul(.6);
		const gust = float(1).add(sin(t.mul(.37).add(phase)).mul(.35));
		const swayX = w1.add(w2).mul(amount).mul(h).mul(gust);
		const swayZ = w2.add(w1.mul(.5)).mul(amount).mul(h).mul(gust);
		positionNode = positionLocal.add(vec3(swayX, float(0), swayZ));
	}
	const graph = {
		colorNode,
		positionNode,
		wind
	};
	_graphCache.set(key, graph);
	return graph;
}
/**
* Build a wind-swaying, canopy-dappled MeshStandardNodeMaterial.
*
* Wind is applied in the POSITION node (vertex stage), dapple in the COLOR
* node (fragment stage) — both fully GPU-side, zero CPU per-frame cost beyond
* advancing one uniform per bucket.
*/
function makeTslFoliageMaterial(opts) {
	const mat = new MeshStandardNodeMaterial({
		color: opts.color,
		roughness: opts.roughness ?? .88,
		metalness: opts.metalness ?? .03,
		side: opts.doubleSided ? 2 : 0
	});
	mat.type = "MeshStandardMaterial";
	const sway = (opts.swayAmount ?? 0) > 0;
	const graph = foliageGraph((opts.dapple ?? 0) > 0 ? bucket(opts.dapple ?? 0, DAPPLE_BUCKETS) : 0, bucket(opts.swayHeight ?? 3, SWAY_HEIGHT_BUCKETS), bucket(opts.swaySpeed ?? 1, SWAY_SPEED_BUCKETS), sway);
	if (graph.colorNode) mat.colorNode = graph.colorNode;
	if (graph.positionNode) mat.positionNode = graph.positionNode;
	const wind = graph.wind;
	if (wind) {
		wind.users += 1;
		let released = false;
		mat.addEventListener("dispose", () => {
			if (released) return;
			released = true;
			wind.users -= 1;
			if (wind.users > 0) return;
			const index = _windUniforms.indexOf(wind);
			if (index !== -1) _windUniforms.splice(index, 1);
			for (const [key, entry] of _graphCache) if (entry.wind === wind) _graphCache.delete(key);
		});
	}
	return mat;
}
//#endregion
//#region src/farcrysis-vegetation.ts
/**
* farcrysis-vegetation.ts — Pass 69 dense THREE.js tropical jungle vegetation module.
*
* Exports:
*   buildVegetation(scene: THREE.Group): void
*   FARCRYSIS_VEGE_STATS(): { totalInstances: number; treeTypes: number; totalTriangles: number; textureCount: number }
*   animateVegetationWind(time: number): void   — frame wind-sway update (call each frame)
*   setVegetationLOD(dist: number): void        — distance LOD toggle for large tree layers
*
* Target: 600+ vegetation instances via InstancedMesh, 8+ distinct tree/palm types,
* ground cover (grass + leaf litter + fallen fronds + flower patches + beach pebbles),
* multi-layer undergrowth, hanging vines — all via InstancedMesh / merged-geometry
* for 60fps. Deterministic seeded placement. All procedural — no copied IP.
* Presentation only — never adds colliders.
* Mount from farcrysis.ts buildFarcrysis to add dense jungle dressing over the arena.
*
* Wind (HF-359): typed TSL per-instance phase-offset sway in positionNode —
* no onBeforeCompile, no ShaderMaterial. See farcrysis-tsl-foliage.ts.
* LOD: far-distance impostor meshes (simple cross/cone) for palm + mangrove layers.
* Ground: 3 new deterministic layers — fallen fronds (60), flower patches (5×8),
* beach pebbles (40).
*/
/** HF-359: wind is now TSL-side; this legacy comment kept for history. */
/**
* Call once per frame to advance wind animation.
* @param time Seconds elapsed (e.g. performance.now() / 1000 or a clock delta accumulator).
*/
function animateVegetationWind(time) {
	tslAdvanceWind(time);
}
var _lodPairs = [];
function registerLODPair(near, far) {
	far.forEach((m) => {
		m.visible = false;
	});
	_lodPairs.push({
		near,
		far
	});
}
/**
* Call when camera distance changes to toggle near/far LOD impostors.
* Threshold: dist < 80m → near (full detail); dist >= 80m → far (impostor).
*
* Pass 76: the old 35 m threshold was measured to the ARENA CENTRE, but a
* player standing at a corner spawn is already ~38 m out — the entire jungle
* swapped to crude impostor cones DURING NORMAL PLAY. In-arena cameras top
* out around 45 m from centre, so 80 m keeps full detail for every gameplay
* camera and reserves the impostors for menu fly-bys and review orbits.
*
* Non-breaking: if no LOD pairs registered (e.g. buildVegetation not called
* yet), this is a safe no-op.
*
* @param dist Camera-to-arena-centre distance in metres.
*/
function setVegetationLOD(dist) {
	const useNear = dist < 80;
	for (const pair of _lodPairs) {
		pair.near.forEach((m) => {
			m.visible = useNear;
		});
		pair.far.forEach((m) => {
			m.visible = !useNear;
		});
	}
}
var BOUNDS = FARCRYSIS_BOUNDS;
var MARGIN = 1.8;
/** Golden ratio conjugate — produces even angular distribution. */
var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
var _s = {
	totalInstances: 0,
	treeTypeNames: /* @__PURE__ */ new Set(),
	totalTriangles: 0,
	textureCount: 0
};
function resetStats() {
	_s = {
		totalInstances: 0,
		treeTypeNames: /* @__PURE__ */ new Set(),
		totalTriangles: 0,
		textureCount: 0
	};
}
/** Count rendered triangles for a BufferGeometry (instanced or single-use). */
function triCount(geometry) {
	const idx = geometry.index;
	if (idx) return idx.count / 3;
	const pos = geometry.getAttribute("position");
	return pos ? pos.count / 3 : 0;
}
/** Shorthand for PBR material matching the art-lane palette style. */
function vegeMat(color, roughness = .88, metalness = .04) {
	return new MeshStandardMaterial({
		color,
		roughness,
		metalness
	});
}
/** Register an InstancedMesh in stats and apply art-layer conventions.
*  Pass `treeType` only for distinct tree/palm types (not ground cover).
*  Use opts to override shadow behaviour for small dressing layers. */
function register(mesh, treeType, opts) {
	_s.totalInstances += mesh.count;
	if (treeType) _s.treeTypeNames.add(treeType);
	_s.totalTriangles += triCount(mesh.geometry) * mesh.count;
	mesh.castShadow = opts?.castShadow ?? true;
	mesh.receiveShadow = opts?.receiveShadow ?? true;
	mesh.userData.farcrysisArt = true;
	return mesh;
}
/**
* Generate positions evenly distributed within a disc (Fibonacci lattice).
* Used for trees that prefer the inland jungle core.
*/
function discPositions(count, maxRadius) {
	const result = [];
	for (let i = 0; i < count; i += 1) {
		const radius = maxRadius * Math.sqrt((i + .5) / count);
		const theta = i * GOLDEN_ANGLE;
		let x = Math.cos(theta) * radius;
		let z = Math.sin(theta) * radius * .88;
		x = Math.max(BOUNDS.minX + MARGIN, Math.min(BOUNDS.maxX - MARGIN, x));
		z = Math.max(BOUNDS.minZ + MARGIN, Math.min(BOUNDS.maxZ - MARGIN, z));
		result.push([
			x,
			z,
			theta
		]);
	}
	return result;
}
/**
* Generate positions in an annular ring (Fibonacci-based).
* Used for trees preferring the beach fringe or mid-ring transitions.
*/
function ringPositions(count, innerRadius, outerRadius) {
	const result = [];
	for (let i = 0; i < count; i += 1) {
		const t = (i + .5) / count;
		const radius = innerRadius + (outerRadius - innerRadius) * t;
		const theta = i * GOLDEN_ANGLE + i % 5 * .22;
		let x = Math.cos(theta) * radius;
		let z = Math.sin(theta) * radius * .88;
		x = Math.max(BOUNDS.minX + MARGIN, Math.min(BOUNDS.maxX - MARGIN, x));
		z = Math.max(BOUNDS.minZ + MARGIN, Math.min(BOUNDS.maxZ - MARGIN, z));
		result.push([
			x,
			z,
			theta
		]);
	}
	return result;
}
/** Mulberry32 seeded PRNG — deterministic, reproducible placement. */
function mulberry32$6(seed) {
	return () => {
		seed |= 0;
		seed = seed + 1831565813 | 0;
		let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
var SPAWNS_ALL = [
	[-26, -26],
	[-22, -24],
	[-24, -20],
	[-18, -26],
	[26, 26],
	[22, 24],
	[24, 20],
	[18, 26]
];
var SPAWN_CLEAR = 5.5;
var PATROL_PTS = [
	[-26, -26],
	[-18, -20],
	[-12, -16],
	[-4, -12],
	[0, 0],
	[12, 16],
	[18, 20],
	[26, 26],
	[-20, 18],
	[20, -18],
	[-8, -24],
	[8, 24]
];
var PATROL_CLEAR = 3;
var PATH_CLEAR_WIDTH = 6.5;
var CORE_CLEAR = 7;
/**
* Returns true if (x,z) is clear of gameplay lanes — safe to place vegetation.
* Uses a larger margin for tall vegetation; small ground dressing can use
* a smaller margin pass.
*/
function clearOfGameplay(x, z, margin) {
	if (Math.abs(Math.abs(x) - 20) < PATH_CLEAR_WIDTH + margin) return false;
	if (Math.abs(Math.abs(z) - 20) < PATH_CLEAR_WIDTH + margin) return false;
	if (Math.sqrt(x * x + z * z) < CORE_CLEAR + margin) return false;
	for (const [sx, sz] of SPAWNS_ALL) if (Math.hypot(x - sx, z - sz) < SPAWN_CLEAR + margin) return false;
	for (const [px, pz] of PATROL_PTS) if (Math.hypot(x - px, z - pz) < PATROL_CLEAR + margin) return false;
	return true;
}
/**
* Generate a list of (x, z, groundY, angle) positions within an annular zone,
* filtered for gameplay clearance. Uses Fibonacci-like spiralled scatter with
* a seeded RNG for deterministic reproducibility.
*/
function layerPositions(count, minRadius, maxRadius, clearanceMargin, seed) {
	const rng = mulberry32$6(seed);
	const result = [];
	let attempts = 0;
	const maxAttempts = count * 30;
	while (result.length < count && attempts < maxAttempts) {
		const radius = minRadius + rng() * (maxRadius - minRadius);
		const angle = rng() * Math.PI * 2;
		let x = Math.cos(angle) * radius;
		let z = Math.sin(angle) * radius;
		x = Math.max(BOUNDS.minX + MARGIN, Math.min(BOUNDS.maxX - MARGIN, x));
		z = Math.max(BOUNDS.minZ + MARGIN, Math.min(BOUNDS.maxZ - MARGIN, z));
		if (clearOfGameplay(x, z, clearanceMargin)) {
			const groundY = farcrysisTerrainHeight(x, z);
			result.push([
				x,
				z,
				groundY,
				angle
			]);
		}
		attempts += 1;
	}
	return result;
}
/**
* Deterministic position-hash noise in [0, 1). Depends ONLY on the vertex
* position, so duplicated seam vertices (split normals after toNonIndexed /
* merge) receive identical offsets — the surface stays watertight.
*/
function positionHashNoise(x, y, z, salt) {
	const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + salt * 94.673) * 43758.5453;
	return v - Math.floor(v);
}
/**
* Lumpy-canopy pass: displaces each vertex radially from the geometry origin
* by a low-amplitude multi-octave position-hash noise. Index buffers and
* triangle counts are untouched (positions only), so the WebGL2 static
* batcher's toNonIndexed() path sees an unchanged, in-range index set.
*/
function lumpify(geometry, amplitude, salt) {
	const pos = geometry.getAttribute("position");
	if (!pos) return geometry;
	for (let i = 0; i < pos.count; i += 1) {
		const x = pos.getX(i);
		const y = pos.getY(i);
		const z = pos.getZ(i);
		const len = Math.sqrt(x * x + y * y + z * z);
		if (len < 1e-5) continue;
		const d = (positionHashNoise(x * 1.7, y * 1.7, z * 1.7, salt) * .65 + positionHashNoise(x * 4.1, y * 4.1, z * 4.1, salt + 17) * .35 - .5) * 2 * amplitude;
		pos.setXYZ(i, x + x / len * d, y + y / len * d, z + z / len * d);
	}
	pos.needsUpdate = true;
	geometry.computeVertexNormals();
	return geometry;
}
/** Per-instance colour variation scratch objects (allocated once). */
var _varyColor = new Color();
/**
* Deterministic per-instance colour variation on an InstancedMesh via
* instanceColor — stops plants looking cloned at ZERO extra draw calls
* (the attribute rides the existing instanced draw).
*/
function varyInstanceColors(mesh, seed) {
	if (typeof mesh.setColorAt !== "function") return;
	const mat = mesh.material;
	const baseColor = mat && mat.color ? mat.color : new Color(16777215);
	const hsl = {
		h: 0,
		s: 0,
		l: 0
	};
	baseColor.getHSL(hsl);
	const rng = mulberry32$6(seed);
	for (let i = 0; i < mesh.count; i += 1) {
		const h = hsl.h + (rng() - .5) * .035;
		const s = Math.max(0, Math.min(1, hsl.s * (.82 + rng() * .36)));
		const l = Math.max(0, Math.min(1, hsl.l * (.72 + rng() * .62)));
		_varyColor.setHSL(h, s, l);
		mesh.setColorAt(i, _varyColor);
	}
	if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
/** Stable per-mesh seed derived from the layer name (deterministic builds). */
function nameSeed(name) {
	let h = 2166136261;
	for (let i = 0; i < name.length; i += 1) {
		h ^= name.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
/** Walk an arena group and give every vegetation InstancedMesh colour variation. */
function _applyInstanceColorVariation(group) {
	group.traverse((obj) => {
		if (!(obj instanceof InstancedMesh)) return;
		if (!obj.name.startsWith("farcrysis-vege")) return;
		varyInstanceColors(obj, nameSeed(obj.name));
	});
}
/**
* Merge an array of transformed geometries into one BufferGeometry for instancing.
* Adds normal/uv attributes from the first source geom when merged output lacks them.
*/
function mergeTransformed(geomParts) {
	const transformed = [];
	for (const { geom, matrix } of geomParts) {
		const clone = geom.clone();
		clone.applyMatrix4(matrix);
		const nonIndexed = clone.index !== null ? clone.toNonIndexed() : clone;
		transformed.push(nonIndexed);
	}
	const merged = mergeGeometries(transformed, false);
	if (!merged.getAttribute("normal")) merged.computeVertexNormals();
	return merged;
}
/**
* Poisson-disc-based layer positions (seeded dart-throwing rejection).
* Same signature as layerPositions but enforces minimum separation between
* placed points for a more natural, non-overlapping scatter.
*/
function poissonLayerPositions(count, minRadius, maxRadius, clearanceMargin, seed, minSeparation) {
	const rng = mulberry32$6(seed);
	const result = [];
	let attempts = 0;
	const maxAttempts = count * 60;
	while (result.length < count && attempts < maxAttempts) {
		const radius = minRadius + rng() * (maxRadius - minRadius);
		const angle = rng() * Math.PI * 2;
		let x = Math.cos(angle) * radius;
		let z = Math.sin(angle) * radius;
		x = Math.max(BOUNDS.minX + MARGIN, Math.min(BOUNDS.maxX - MARGIN, x));
		z = Math.max(BOUNDS.minZ + MARGIN, Math.min(BOUNDS.maxZ - MARGIN, z));
		if (clearOfGameplay(x, z, clearanceMargin)) {
			let tooClose = false;
			for (let j = 0; j < result.length; j++) if (Math.hypot(x - result[j][0], z - result[j][1]) < minSeparation) {
				tooClose = true;
				break;
			}
			if (!tooClose) {
				const groundY = farcrysisTerrainHeight(x, z);
				result.push([
					x,
					z,
					groundY,
					angle
				]);
			}
		}
		attempts += 1;
	}
	return result;
}
/**
* Generate grove-like clustered positions: pick N grove centres, then scatter
* `splay` stems around each centre with a small in-grove radius.
*/
function grovePositions(groves, stemsPerGrove, splay, minRadius, maxRadius, clearanceMargin, seed) {
	const rng = mulberry32$6(seed);
	const result = [];
	const centres = poissonLayerPositions(groves, minRadius, maxRadius, clearanceMargin, seed, splay * 3);
	for (let g = 0; g < centres.length; g++) {
		const [cx, cz, _groundC, _angleC] = centres[g];
		for (let s = 0; s < stemsPerGrove; s++) {
			const sa = rng() * Math.PI * 2;
			const sr = rng() * splay;
			const sx = cx + Math.cos(sa) * sr;
			const sz = cz + Math.sin(sa) * sr;
			const sy = farcrysisTerrainHeight(sx, sz);
			result.push([
				sx,
				sz,
				sy,
				sa,
				sr,
				g + s * .01
			]);
		}
	}
	return result;
}
function addPalms(root) {
	const count = 22;
	const placements = ringPositions(count, 19, 30).map(([x, z, angle], i) => {
		const scale = .85 + i % 3 * .12;
		return {
			x,
			z,
			baseY: farcrysisTerrainHeight(x, z),
			yaw: angle + .3,
			lean: (i % 3 === 0 ? .07 : -.06) * (Math.sin(angle) * .9),
			scale,
			crownSpin: angle * 1.3 + i * .15,
			crownTilt: (i % 3 - 1) * .06,
			crownScale: scale * (.95 + i * 5 % 4 * .04)
		};
	});
	const { trunkInstances, frondInstances, coconutInstances } = buildPalmStandInstances(root, placements, "farcrysis-vege-palm");
	register(trunkInstances, "palm");
	register(frondInstances, "palm");
	register(coconutInstances, "palm", {
		castShadow: false,
		receiveShadow: true
	});
	const lodParts = [{
		geom: new CylinderGeometry(.14, .26, 2.5, 5),
		matrix: new Matrix4().makeTranslation(0, 1.25, 0)
	}];
	for (let f = 0; f < 5; f += 1) {
		const frondAngle = f / 5 * Math.PI * 2;
		lodParts.push({
			geom: new BoxGeometry(1.7, .05, .42),
			matrix: new Matrix4().compose(new Vector3(Math.cos(frondAngle) * .7, 2.5 - f % 2 * .12, Math.sin(frondAngle) * .7), new Quaternion().setFromEuler(new Euler(-.35, frondAngle, .1)), new Vector3(1, 1, 1))
		});
	}
	const lodMesh = new InstancedMesh(mergeTransformed(lodParts), vegeMat(2837798, .9, .02), count);
	lodMesh.name = "farcrysis-vege-palm-imposters";
	lodMesh.castShadow = false;
	lodMesh.receiveShadow = true;
	lodMesh.userData.farcrysisArt = true;
	const lodM = new Matrix4();
	for (let i = 0; i < count; i++) {
		const placement = placements[i];
		lodM.compose(new Vector3(placement.x, placement.baseY, placement.z), new Quaternion().setFromEuler(new Euler(0, placement.crownSpin, 0)), new Vector3(placement.scale, placement.scale, placement.scale));
		lodMesh.setMatrixAt(i, lodM);
	}
	lodMesh.instanceMatrix.needsUpdate = true;
	lodMesh.computeBoundingSphere();
	registerLODPair([
		trunkInstances,
		frondInstances,
		coconutInstances
	], [lodMesh]);
	root.add(lodMesh);
}
function addBroadleafTrees(root) {
	const count = 28;
	const trunkGeom = new CylinderGeometry(.22, .44, 2.6, 10);
	const canopyGeom = new SphereGeometry(1, 10, 6);
	lumpify(canopyGeom, .2, 2842);
	const trunks = new InstancedMesh(trunkGeom, vegeMat(7032368, .92, .02), count);
	trunks.name = "farcrysis-vege-broadleaf-trunks";
	const canopies = new InstancedMesh(canopyGeom, vegeMat(4882488, .88, .01), count);
	canopies.name = "farcrysis-vege-broadleaf-canopies";
	const tMat = new Matrix4();
	const cMat = new Matrix4();
	const positions = discPositions(count, 20);
	for (let i = 0; i < count; i += 1) {
		const [x, z, angle] = positions[i];
		const baseY = farcrysisTerrainHeight(x, z) + 1.3;
		const canopyY = baseY + 2.4;
		const twist = angle + i % 7 * .35;
		tMat.compose(new Vector3(x, baseY, z), new Quaternion().setFromEuler(new Euler(0, twist, 0)), new Vector3(.8 + i % 5 * .12, .9 + i % 4 * .08, .8 + i % 5 * .12));
		trunks.setMatrixAt(i, tMat);
		const cScale = 1.2 + i % 5 * .14;
		cMat.compose(new Vector3(x, canopyY, z), new Quaternion().setFromEuler(new Euler(i * .22, twist * .7, 0)), new Vector3(cScale, .55 + i % 3 * .15, cScale * .92));
		canopies.setMatrixAt(i, cMat);
	}
	trunks.instanceMatrix.needsUpdate = true;
	canopies.instanceMatrix.needsUpdate = true;
	root.add(register(trunks, "broadleaf"));
	root.add(register(canopies, "broadleaf"));
}
function addFanPalms(root) {
	const count = 20;
	const parts = [{
		geom: new CylinderGeometry(.09, .15, 1.3, 7),
		matrix: new Matrix4().makeTranslation(0, .65, 0)
	}];
	for (let leaf = 0; leaf < 6; leaf += 1) {
		const fanAngle = (leaf / 5 - .5) * 2.4;
		parts.push({
			geom: new BoxGeometry(.3, 1.7, .04),
			matrix: new Matrix4().compose(new Vector3(Math.sin(fanAngle) * .55, 1.3 + Math.cos(fanAngle) * .8, 0), new Quaternion().setFromEuler(new Euler(0, 0, -fanAngle)), new Vector3(1, 1, 1))
		});
	}
	const fans = new InstancedMesh(mergeTransformed(parts), vegeMat(3107627, .88, .02), count);
	fans.name = "farcrysis-vege-fan-palms";
	const matrix = new Matrix4();
	const positions = discPositions(count, 16);
	for (let i = 0; i < count; i += 1) {
		const [x, z, angle] = positions[i];
		const s = .75 + i % 5 * .14;
		matrix.compose(new Vector3(x, farcrysisTerrainHeight(x, z), z), new Quaternion().setFromEuler(new Euler(0, angle, 0)), new Vector3(s, .85 + i % 4 * .1, s));
		fans.setMatrixAt(i, matrix);
	}
	fans.instanceMatrix.needsUpdate = true;
	fans.computeBoundingSphere();
	root.add(register(fans, "fan-palm"));
}
function addBananaPlants(root) {
	const plantCount = 14;
	const leavesPerPlant = 4;
	const leafCount = plantCount * leavesPerPlant;
	const trunkGeom = new CylinderGeometry(.1, .2, 1.6, 7);
	const leafGeom = new BoxGeometry(2.2, .07, .65);
	const trunks = new InstancedMesh(trunkGeom, vegeMat(8034872, .85, .02), plantCount);
	trunks.name = "farcrysis-vege-banana-trunks";
	const leaves = new InstancedMesh(leafGeom, vegeMat(5082154, .82, .02), leafCount);
	leaves.name = "farcrysis-vege-banana-leaves";
	const tMat = new Matrix4();
	const lMat = new Matrix4();
	const positions = discPositions(plantCount, 14);
	for (let p = 0; p < plantCount; p += 1) {
		const [x, z, baseAngle] = positions[p];
		const baseY = farcrysisTerrainHeight(x, z) + .8;
		const leafY = baseY + 1.55;
		tMat.compose(new Vector3(x, baseY, z), new Quaternion().setFromEuler(new Euler(0, baseAngle, 0)), new Vector3(.85 + p % 3 * .12, 1, .85 + p % 3 * .12));
		trunks.setMatrixAt(p, tMat);
		for (let l = 0; l < leavesPerPlant; l += 1) {
			const leafAngle = baseAngle + l / leavesPerPlant * Math.PI * 2 + p % 3 * .25;
			const tilt = .2 + l % 3 * .15;
			const leafIdx = p * leavesPerPlant + l;
			lMat.compose(new Vector3(x, leafY + tilt * .3, z), new Quaternion().setFromEuler(new Euler(tilt, leafAngle, 0)), new Vector3(.8 + p % 4 * .12, 1, .85 + l % 3 * .1));
			leaves.setMatrixAt(leafIdx, lMat);
		}
	}
	trunks.instanceMatrix.needsUpdate = true;
	leaves.instanceMatrix.needsUpdate = true;
	root.add(register(trunks, "banana"));
	root.add(register(leaves, "banana"));
}
function addBamboo(root) {
	const clusters = 7;
	const stemsPerCluster = 5;
	const count = clusters * stemsPerCluster;
	const stems = new InstancedMesh(new CylinderGeometry(.05, .07, 2.8, 6), vegeMat(6982202, .84, .03), count);
	stems.name = "farcrysis-vege-bamboo-stems";
	const matrix = new Matrix4();
	const clusterCenters = discPositions(clusters, 13);
	for (let c = 0; c < clusters; c += 1) {
		const [cx, cz, ca] = clusterCenters[c];
		for (let s = 0; s < stemsPerCluster; s += 1) {
			const offsetAngle = s / stemsPerCluster * Math.PI * 2 + ca;
			const offsetRadius = .25 + s % 3 * .18;
			const sx = cx + Math.cos(offsetAngle) * offsetRadius;
			const sz = cz + Math.sin(offsetAngle) * offsetRadius;
			const heightScale = .85 + s % 4 * .1;
			const idx = c * stemsPerCluster + s;
			matrix.compose(new Vector3(sx, farcrysisTerrainHeight(sx, sz) + 1.4 * heightScale, sz), new Quaternion().setFromEuler(new Euler(0, offsetAngle + s * .3, 0)), new Vector3(.8 + s % 3 * .12, heightScale, .8 + s % 3 * .12));
			stems.setMatrixAt(idx, matrix);
		}
	}
	stems.instanceMatrix.needsUpdate = true;
	root.add(register(stems, "bamboo"));
}
function addDeadTrees(root) {
	const count = 10;
	const trunks = new InstancedMesh(new CylinderGeometry(.14, .24, 2.4, 7), vegeMat(7234136, .94, .05), count);
	trunks.name = "farcrysis-vege-dead-trunks";
	const matrix = new Matrix4();
	const positions = ringPositions(count, 6, 24);
	for (let i = 0; i < count; i += 1) {
		const [x, z, angle] = positions[i];
		const leanAngle = .3 + i % 4 * .15;
		const leanDir = angle + i % 3 * .6;
		const s = .7 + i % 3 * .2;
		matrix.compose(new Vector3(x, farcrysisTerrainHeight(x, z) + 1.2, z), new Quaternion().setFromEuler(new Euler(leanAngle, leanDir, i % 2 * .2)), new Vector3(s, .85 + i % 3 * .12, s));
		trunks.setMatrixAt(i, matrix);
	}
	trunks.instanceMatrix.needsUpdate = true;
	root.add(register(trunks, "dead-tree"));
}
function addFerns(root) {
	const count = 35;
	const ferns = new InstancedMesh(new BoxGeometry(.35, 1.2, .12), vegeMat(FARCRYSIS_ART_FEEL.fernGreen, .85, .02), count);
	ferns.name = "farcrysis-vege-ferns";
	const matrix = new Matrix4();
	const positions = discPositions(count, 22);
	for (let i = 0; i < count; i += 1) {
		const [x, z, angle] = positions[i];
		const s = .75 + i % 5 * .16;
		matrix.compose(new Vector3(x, farcrysisTerrainHeight(x, z) + .6, z), new Quaternion().setFromEuler(new Euler(0, angle * 2.1 + i * .4, 0)), new Vector3(s, .7 + i % 4 * .18, 1));
		ferns.setMatrixAt(i, matrix);
	}
	ferns.instanceMatrix.needsUpdate = true;
	root.add(register(ferns));
}
function addGrassTufts(root) {
	const count = 45;
	const grass = new InstancedMesh(new ConeGeometry(.12, .45, 5, 1), vegeMat(5077558, .9, .01), count);
	grass.name = "farcrysis-vege-grass-tufts";
	const matrix = new Matrix4();
	const inner = discPositions(Math.floor(count * .7), 18);
	const outer = ringPositions(count - inner.length, 18, 30);
	const positions = [...inner, ...outer];
	for (let i = 0; i < count; i += 1) {
		const [x, z] = positions[i];
		const s = .6 + i % 6 * .1;
		matrix.compose(new Vector3(x, farcrysisTerrainHeight(x, z) + .22, z), new Quaternion().setFromEuler(new Euler(0, i * 1.7, 0)), new Vector3(s, .7 + i % 4 * .18, s));
		grass.setMatrixAt(i, matrix);
	}
	grass.instanceMatrix.needsUpdate = true;
	root.add(register(grass));
}
function addBushes(root) {
	const count = 28;
	const bushGeom = new IcosahedronGeometry(.7, 1);
	lumpify(bushGeom, .12, 2821);
	const bushes = new InstancedMesh(bushGeom, vegeMat(FARCRYSIS_ART_FEEL.bushGreen, .9, .01), count);
	bushes.name = "farcrysis-vege-bushes";
	const matrix = new Matrix4();
	const positions = discPositions(count, 20);
	for (let i = 0; i < count; i += 1) {
		const [x, z, angle] = positions[i];
		const s = .7 + i % 5 * .14;
		matrix.compose(new Vector3(x, farcrysisTerrainHeight(x, z) + .45, z), new Quaternion().setFromEuler(new Euler(i * .1, angle, i * .15)), new Vector3(s, .55 + i % 3 * .18, s * .9));
		bushes.setMatrixAt(i, matrix);
	}
	bushes.instanceMatrix.needsUpdate = true;
	root.add(register(bushes));
}
function addVines(root) {
	const count = 18;
	const vines = new InstancedMesh(new CylinderGeometry(.03, .04, 2.4, 6), vegeMat(4025904, .82, .02), count);
	vines.name = "farcrysis-vege-vines";
	const matrix = new Matrix4();
	const positions = ringPositions(count, 4, 22);
	for (let i = 0; i < count; i += 1) {
		const [x, z, angle] = positions[i];
		const lean = .5 + i % 3 * .2;
		const twist = angle + i % 5 * .4;
		const s = .6 + i % 4 * .15;
		matrix.compose(new Vector3(x, farcrysisTerrainHeight(x, z) + 1 + i % 3 * .6, z), new Quaternion().setFromEuler(new Euler(lean, twist, lean * .3)), new Vector3(s, .9 + i % 3 * .1, s));
		vines.setMatrixAt(i, matrix);
	}
	vines.instanceMatrix.needsUpdate = true;
	root.add(register(vines));
}
function addKapokTrees(root) {
	const count = 16;
	const SEED = 1800553233;
	const trunkHeight = 3.6;
	const trunkGeomSrc = new CylinderGeometry(.22, .32, trunkHeight, 10);
	const finGeomSrc = new BoxGeometry(.14, trunkHeight * .65, .9);
	const trunkParts = [];
	trunkParts.push({
		geom: trunkGeomSrc,
		matrix: new Matrix4().compose(new Vector3(0, trunkHeight / 2, 0), new Quaternion(), new Vector3(1, 1, 1))
	});
	for (let f = 0; f < 4; f++) {
		const angle = f / 4 * Math.PI * 2 + Math.PI / 4;
		const m = new Matrix4().compose(new Vector3(Math.cos(angle) * .55 + (f % 2 ? .08 : -.08), trunkHeight * .28, Math.sin(angle) * .55), new Quaternion().setFromEuler(new Euler(0, angle + Math.PI / 2, .05)), new Vector3(1, .9 + f % 3 * .08, 1));
		trunkParts.push({
			geom: finGeomSrc,
			matrix: m
		});
	}
	const kapokTrunkGeom = mergeTransformed(trunkParts);
	const sphereSrc = new SphereGeometry(1.15, 12, 7);
	const canopyParts = [];
	canopyParts.push({
		geom: sphereSrc,
		matrix: new Matrix4().compose(new Vector3(.1, 0, .05), new Quaternion(), new Vector3(1.1, .55, 1))
	});
	canopyParts.push({
		geom: sphereSrc,
		matrix: new Matrix4().compose(new Vector3(-.15, .55, -.08), new Quaternion().setFromEuler(new Euler(.2, .3, 0)), new Vector3(.95, .48, .9))
	});
	const kapokCanopyGeom = mergeTransformed(canopyParts);
	lumpify(kapokCanopyGeom, .22, 19211);
	const trunks = new InstancedMesh(kapokTrunkGeom, vegeMat(8019518, .9, .03), count);
	trunks.name = "farcrysis-vege-kapok-trunks";
	const canopies = new InstancedMesh(kapokCanopyGeom, vegeMat(4818240, .86, .01), count);
	canopies.name = "farcrysis-vege-kapok-canopies";
	const tMat = new Matrix4();
	const cMat = new Matrix4();
	const positions = layerPositions(count, 7, 18, 3.5, SEED);
	const rng = mulberry32$6(SEED);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const trunkBaseY = groundY;
		const trunkCenterY = trunkBaseY + trunkHeight / 2;
		const canopyY = trunkBaseY + trunkHeight + .3;
		const trunkScale = .85 + rng() * .3;
		tMat.compose(new Vector3(x, trunkCenterY, z), new Quaternion().setFromEuler(new Euler((rng() - .5) * .06, angle + rng() * .4, 0)), new Vector3(trunkScale, .85 + rng() * .2, trunkScale));
		trunks.setMatrixAt(i, tMat);
		const canopyScale = .9 + rng() * .35;
		cMat.compose(new Vector3(x, canopyY, z), new Quaternion().setFromEuler(new Euler(rng() * .3, angle + rng() * 1.2, 0)), new Vector3(canopyScale, .6 + rng() * .25, canopyScale * .9));
		canopies.setMatrixAt(i, cMat);
	}
	trunks.instanceMatrix.needsUpdate = true;
	canopies.instanceMatrix.needsUpdate = true;
	root.add(register(trunks, "kapok", {
		castShadow: true,
		receiveShadow: true
	}));
	root.add(register(canopies, "kapok", {
		castShadow: false,
		receiveShadow: true
	}));
}
function addCoconutPalms(root) {
	const count = 14;
	const SEED = 3233816149;
	const segH = 1.05;
	const segGeom = new CylinderGeometry(.13, .17, segH, 8);
	const frondGeomSrc = new BoxGeometry(2.4, .09, .4);
	const palmParts = [];
	palmParts.push({
		geom: segGeom,
		matrix: new Matrix4().compose(new Vector3(0, segH * .5, 0), new Quaternion(), new Vector3(1, 1, 1))
	});
	palmParts.push({
		geom: segGeom,
		matrix: new Matrix4().compose(new Vector3(.08, segH * 1.5, 0), new Quaternion().setFromEuler(new Euler(.18, .05, 0)), new Vector3(.92, 1, .92))
	});
	palmParts.push({
		geom: segGeom,
		matrix: new Matrix4().compose(new Vector3(.14, segH * 2.5, -.05), new Quaternion().setFromEuler(new Euler(.12, .25, 0)), new Vector3(.8, 1, .8))
	});
	for (let f = 0; f < 6; f++) {
		const frondAngle = f / 6 * Math.PI * 2;
		const tilt = -.4 + f % 3 * .12;
		palmParts.push({
			geom: frondGeomSrc,
			matrix: new Matrix4().compose(new Vector3(Math.cos(frondAngle) * .25, segH * 2.9, Math.sin(frondAngle) * .25), new Quaternion().setFromEuler(new Euler(tilt, frondAngle, .15)), new Vector3(.85 + f % 3 * .12, 1, .6 + f % 3 * .25))
		});
	}
	const palms = new InstancedMesh(mergeTransformed(palmParts), vegeMat(FARCRYSIS_ART_FEEL.palmFrond, .84, .02), count);
	palms.name = "farcrysis-vege-coconut-palms";
	const trunkOnly = [
		palmParts[0],
		palmParts[1],
		palmParts[2]
	];
	const frondOnly = palmParts.slice(3);
	const coconutTrunkGeom = mergeTransformed(trunkOnly);
	const coconutFrondGeom = mergeTransformed(frondOnly);
	const cTrunks = new InstancedMesh(coconutTrunkGeom, vegeMat(FARCRYSIS_ART_FEEL.palmTrunk, .87, .03), count);
	cTrunks.name = "farcrysis-vege-coconut-trunks";
	const cFronds = new InstancedMesh(coconutFrondGeom, vegeMat(FARCRYSIS_ART_FEEL.palmFrond, .83, .02), count);
	cFronds.name = "farcrysis-vege-coconut-fronds";
	const tMat = new Matrix4();
	const fMat = new Matrix4();
	const positions = layerPositions(count, 14, 26, 3.5, SEED);
	const rng = mulberry32$6(3233816150);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const trunkBaseY = groundY;
		const trunkCenterY = trunkBaseY + segH * 1.6;
		const frondY = trunkBaseY + segH * 3;
		const s = .8 + rng() * .35;
		tMat.compose(new Vector3(x, trunkCenterY, z), new Quaternion().setFromEuler(new Euler((rng() - .5) * .1, angle + rng() * .5, 0)), new Vector3(s, .85 + rng() * .2, s));
		cTrunks.setMatrixAt(i, tMat);
		fMat.compose(new Vector3(x, frondY, z), new Quaternion().setFromEuler(new Euler(0, angle + rng() * 1.5, 0)), new Vector3(.85 + rng() * .2, .9 + rng() * .15, .85 + rng() * .2));
		cFronds.setMatrixAt(i, fMat);
	}
	cTrunks.instanceMatrix.needsUpdate = true;
	cFronds.instanceMatrix.needsUpdate = true;
	root.add(register(cTrunks, "coconut", {
		castShadow: true,
		receiveShadow: true
	}));
	root.add(register(cFronds, "coconut", {
		castShadow: false,
		receiveShadow: true
	}));
}
function addCanopyVines(root) {
	const count = 26;
	const SEED = 3739709697;
	const vines = new InstancedMesh(new CylinderGeometry(.025, .032, 1, 5), vegeMat(4025904, .8, .02), count);
	vines.name = "farcrysis-vege-canopy-vines";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 5, 20, 2.5, SEED);
	const rng = mulberry32$6(3739709699);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const canopyRange = farcrysisTerrainHeight(x, z) < 1.5 ? 3.5 : 4.5;
		const vineLength = 1.8 + rng() * 2;
		const hangCenter = groundY + canopyRange + rng() * .8 - vineLength / 2;
		const sway = (rng() - .5) * .3;
		matrix.compose(new Vector3(x, hangCenter, z), new Quaternion().setFromEuler(new Euler(sway, Math.sin(angle) * .2 + rng() * .5, sway * .5)), new Vector3(.7 + rng() * .4, vineLength, .7 + rng() * .4));
		vines.setMatrixAt(i, matrix);
	}
	vines.instanceMatrix.needsUpdate = true;
	root.add(register(vines, void 0, {
		castShadow: false,
		receiveShadow: false
	}));
}
function addLeafLitter(root) {
	const count = 120;
	const SEED = 296682581;
	const litter = new InstancedMesh(new BoxGeometry(.7, .025, .55), vegeMat(7033392, .92, .01), count);
	litter.name = "farcrysis-vege-leaf-litter";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 6, 28, .5, SEED);
	const rng = mulberry32$6(296682584);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const litterY = groundY + .03;
		const scaleXZ = .7 + rng() * .9;
		const flatRot = new Quaternion().setFromEuler(new Euler(-Math.PI / 2 + (rng() - .5) * .3, angle + rng() * 1.5, 0));
		matrix.compose(new Vector3(x, litterY, z), flatRot, new Vector3(scaleXZ, 1, scaleXZ * (.7 + rng() * .6)));
		litter.setMatrixAt(i, matrix);
	}
	litter.instanceMatrix.needsUpdate = true;
	root.add(register(litter, void 0, {
		castShadow: false,
		receiveShadow: false
	}));
}
function addDenseGrass(root) {
	const count = 340;
	const SEED = 1611507038;
	const grass = new InstancedMesh(new ConeGeometry(.08, .42, 5, 1), vegeMat(5077558, .88, .01), count);
	grass.name = "farcrysis-vege-dense-grass";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 1, 30, .5, SEED);
	const rng = mulberry32$6(1611507042);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const grassY = groundY + .22;
		const s = .55 + rng() * .5;
		matrix.compose(new Vector3(x, grassY, z), new Quaternion().setFromEuler(new Euler(0, angle + rng() * 2, 0)), new Vector3(s, .6 + rng() * .5, s));
		grass.setMatrixAt(i, matrix);
	}
	grass.instanceMatrix.needsUpdate = true;
	root.add(register(grass, void 0, {
		castShadow: false,
		receiveShadow: false
	}));
}
function addFloweringAccents(root) {
	const count = 40;
	const SEED = 2115033617;
	const stemGeom = new CylinderGeometry(.04, .06, .75, 6);
	const flowerGeom = new IcosahedronGeometry(.09, 1);
	const flowerParts = [];
	flowerParts.push({
		geom: stemGeom,
		matrix: new Matrix4().compose(new Vector3(0, .375, 0), new Quaternion(), new Vector3(1, 1, 1))
	});
	flowerParts.push({
		geom: flowerGeom,
		matrix: new Matrix4().compose(new Vector3(.04, .78, .02), new Quaternion(), new Vector3(.7, .65, .7))
	});
	flowerParts.push({
		geom: flowerGeom,
		matrix: new Matrix4().compose(new Vector3(-.05, .72, -.03), new Quaternion().setFromEuler(new Euler(.3, .5, 0)), new Vector3(.6, .55, .65))
	});
	const flowers = new InstancedMesh(mergeTransformed(flowerParts), vegeMat(14177327, .72, .03), count);
	flowers.name = "farcrysis-vege-flowering-accents";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 8, 22, 3, SEED);
	const rng = mulberry32$6(2115033622);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const baseY = groundY + .15 * rng();
		const s = .8 + rng() * .5;
		matrix.compose(new Vector3(x, baseY, z), new Quaternion().setFromEuler(new Euler(0, angle + rng() * 1.5, 0)), new Vector3(s, .9 + rng() * .4, s));
		flowers.setMatrixAt(i, matrix);
	}
	flowers.instanceMatrix.needsUpdate = true;
	root.add(register(flowers, void 0, {
		castShadow: false,
		receiveShadow: false
	}));
}
function addUndergrowthShrubs(root) {
	const count = 40;
	const SEED = 950598161;
	const blobGeom = new IcosahedronGeometry(.65, 1);
	const shrubParts = [];
	shrubParts.push({
		geom: blobGeom,
		matrix: new Matrix4().compose(new Vector3(0, 0, 0), new Quaternion(), new Vector3(1, .7, .9))
	});
	shrubParts.push({
		geom: blobGeom,
		matrix: new Matrix4().compose(new Vector3(.38, .05, .15), new Quaternion().setFromEuler(new Euler(.2, .4, 0)), new Vector3(.85, .55, .8))
	});
	shrubParts.push({
		geom: blobGeom,
		matrix: new Matrix4().compose(new Vector3(-.32, -.02, -.22), new Quaternion().setFromEuler(new Euler(-.15, -.3, .1)), new Vector3(.75, .5, .85))
	});
	const shrubClusterGeom = mergeTransformed(shrubParts);
	lumpify(shrubClusterGeom, .12, 14504);
	const shrubs = new InstancedMesh(shrubClusterGeom, vegeMat(FARCRYSIS_ART_FEEL.bushGreen, .88, .02), count);
	shrubs.name = "farcrysis-vege-undergrowth-shrubs";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 10, 28, 3, SEED);
	const rng = mulberry32$6(950598167);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const baseY = groundY + .1;
		const s = .75 + rng() * .55;
		matrix.compose(new Vector3(x, baseY, z), new Quaternion().setFromEuler(new Euler(rng() * .3, angle + rng() * 2, rng() * .3)), new Vector3(s, .7 + rng() * .4, s * .9));
		shrubs.setMatrixAt(i, matrix);
	}
	shrubs.instanceMatrix.needsUpdate = true;
	root.add(register(shrubs, void 0, {
		castShadow: false,
		receiveShadow: true
	}));
}
function addUnderstoryFerns(root) {
	const count = 90;
	const SEED = 1848505438;
	const bladeGeom = new BoxGeometry(.45, 1, .09);
	const fernParts = [];
	for (let b = 0; b < 3; b++) {
		const bladeAngle = b / 3 * Math.PI * 2;
		const tilt = .1 + b % 2 * .2;
		fernParts.push({
			geom: bladeGeom,
			matrix: new Matrix4().compose(new Vector3(0, .5, 0), new Quaternion().setFromEuler(new Euler(tilt, bladeAngle, 0)), new Vector3(1, 1, 1))
		});
	}
	const ferns = new InstancedMesh(mergeTransformed(fernParts), vegeMat(FARCRYSIS_ART_FEEL.fernGreen, .85, .02), count);
	ferns.name = "farcrysis-vege-understory-ferns";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 4, 26, 2, SEED);
	const rng = mulberry32$6(1848505445);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const baseY = groundY + .1 * rng();
		const s = .7 + rng() * .55;
		const hScale = .7 + rng() * .65;
		matrix.compose(new Vector3(x, baseY, z), new Quaternion().setFromEuler(new Euler(0, angle + rng() * 2.5, 0)), new Vector3(s, hScale, s));
		ferns.setMatrixAt(i, matrix);
	}
	ferns.instanceMatrix.needsUpdate = true;
	root.add(register(ferns, void 0, {
		castShadow: false,
		receiveShadow: true
	}));
}
function addMangroveTrees(root) {
	const count = 18;
	const SEED = 2588282385;
	const trunkCyl = new CylinderGeometry(.1, .16, 2.4, 7);
	const trunkParts = [];
	for (let t = 0; t < 3; t++) {
		const leanAngle = (t - 1) * .22;
		const leanDir = t / 3 * Math.PI * 2;
		const tiltQ = new Quaternion().setFromEuler(new Euler(leanAngle, leanDir, 0));
		trunkParts.push({
			geom: trunkCyl,
			matrix: new Matrix4().compose(new Vector3(Math.cos(leanDir) * .18, 1.2, Math.sin(leanDir) * .18), tiltQ, new Vector3(.75 + t % 2 * .15, .85 + t * .08, .75 + t % 2 * .15))
		});
	}
	const mangroveTrunkGeom = mergeTransformed(trunkParts);
	const leafBlob = new IcosahedronGeometry(.55, 1);
	const canopyParts = [];
	for (let l = 0; l < 4; l++) {
		const la = l / 4 * Math.PI * 2;
		canopyParts.push({
			geom: leafBlob,
			matrix: new Matrix4().compose(new Vector3(Math.cos(la) * .55, 2.3 + l % 3 * .22, Math.sin(la) * .55), new Quaternion().setFromEuler(new Euler(l % 2 * .3, la, 0)), new Vector3(.65 + l % 2 * .2, .6 + l % 3 * .12, .6 + l % 3 * .15))
		});
	}
	canopyParts.push({
		geom: leafBlob,
		matrix: new Matrix4().compose(new Vector3(0, 2.55, 0), new Quaternion(), new Vector3(.7, .55, .65))
	});
	const mangroveCanopyGeom = mergeTransformed(canopyParts);
	lumpify(mangroveCanopyGeom, .16, 39494);
	const trunks = new InstancedMesh(mangroveTrunkGeom, vegeMat(5915186, .9, .04), count);
	trunks.name = "farcrysis-vege-mangrove-trunks";
	const canopies = new InstancedMesh(mangroveCanopyGeom, vegeMat(4025144, .88, .02), count);
	canopies.name = "farcrysis-vege-mangrove-canopies";
	const tMat = new Matrix4();
	const cMat = new Matrix4();
	const positions = poissonLayerPositions(count, 23, 30.5, 2.5, SEED, 3.5);
	const rng = mulberry32$6(2588282386);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const trunkBaseY = groundY;
		const trunkCenterY = trunkBaseY + 1.2;
		const canopyY = trunkBaseY + 2.3;
		const s = .8 + rng() * .35;
		tMat.compose(new Vector3(x, trunkCenterY, z), new Quaternion().setFromEuler(new Euler((rng() - .5) * .08, angle + rng() * .6, 0)), new Vector3(s, .85 + rng() * .2, s));
		trunks.setMatrixAt(i, tMat);
		cMat.compose(new Vector3(x, canopyY, z), new Quaternion().setFromEuler(new Euler(rng() * .25, angle + rng() * 1.2, 0)), new Vector3(.8 + rng() * .3, .65 + rng() * .2, .8 + rng() * .3));
		canopies.setMatrixAt(i, cMat);
	}
	trunks.instanceMatrix.needsUpdate = true;
	canopies.instanceMatrix.needsUpdate = true;
	root.add(register(trunks, "mangrove", {
		castShadow: true,
		receiveShadow: true
	}));
	root.add(register(canopies, "mangrove", {
		castShadow: false,
		receiveShadow: true
	}));
	const lodCount = count;
	const lodMesh = new InstancedMesh(mergeTransformed([{
		geom: new CylinderGeometry(.12, .2, 1.6, 5),
		matrix: new Matrix4().makeTranslation(0, -1.4, 0)
	}, {
		geom: lumpify(new IcosahedronGeometry(1.25, 1), .28, 39495),
		matrix: new Matrix4().compose(new Vector3(0, 0, 0), new Quaternion(), new Vector3(1, .72, 1))
	}]), vegeMat(4025144, .88, .02), lodCount);
	lodMesh.name = "farcrysis-vege-mangrove-lod";
	lodMesh.castShadow = false;
	lodMesh.receiveShadow = true;
	lodMesh.userData.farcrysisArt = true;
	const lodM = new Matrix4();
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const canopyY = groundY + 2.3;
		lodM.compose(new Vector3(x, canopyY - .3, z), new Quaternion().setFromEuler(new Euler(0, angle, 0)), new Vector3(1, 1, 1));
		lodMesh.setMatrixAt(i, lodM);
	}
	lodMesh.instanceMatrix.needsUpdate = true;
	registerLODPair([trunks, canopies], [lodMesh]);
	root.add(lodMesh);
}
function addBambooGroves(root) {
	const groves = 14;
	const stemsPerGrove = 14;
	const count = groves * stemsPerGrove;
	const stems = new InstancedMesh(new CylinderGeometry(.04, .06, 3.2, 6), vegeMat(9083450, .82, .03), count);
	stems.name = "farcrysis-vege-bamboo-grove-stems";
	const matrix = new Matrix4();
	const SEED = 2824863889;
	const rng = mulberry32$6(SEED);
	const positions = grovePositions(groves, stemsPerGrove, 2.2, 5, 24, 3.5, SEED);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle, _sr, _gi] = positions[i];
		const heightScale = .8 + rng() * .4;
		const lean = (rng() - .5) * .06;
		matrix.compose(new Vector3(x, groundY + 1.55 * heightScale, z), new Quaternion().setFromEuler(new Euler(lean, angle + rng() * .6, lean * .5)), new Vector3(.7 + rng() * .3, heightScale, .7 + rng() * .3));
		stems.setMatrixAt(i, matrix);
	}
	stems.instanceMatrix.needsUpdate = true;
	root.add(register(stems, "bamboo-grove", {
		castShadow: true,
		receiveShadow: true
	}));
}
function addFloweringBushes(root) {
	const count = 36;
	const bloomsPerBush = 2;
	const bloomCount = count * bloomsPerBush;
	const SEED = 1896523173;
	const blobGeom = new IcosahedronGeometry(.7, 1);
	const bushGeom = mergeTransformed([{
		geom: blobGeom,
		matrix: new Matrix4().compose(new Vector3(0, 0, 0), new Quaternion(), new Vector3(1, .65, .9))
	}, {
		geom: blobGeom,
		matrix: new Matrix4().compose(new Vector3(.3, .05, -.1), new Quaternion().setFromEuler(new Euler(.2, .4, 0)), new Vector3(.8, .55, .8))
	}]);
	lumpify(bushGeom, .12, 28938);
	const bloomGeom = new IcosahedronGeometry(.1, 1);
	const bushes = new InstancedMesh(bushGeom, vegeMat(FARCRYSIS_ART_FEEL.bushGreen, .88, .01), count);
	bushes.name = "farcrysis-vege-flowering-bushes";
	const blooms = new InstancedMesh(bloomGeom, new MeshStandardMaterial({
		color: 16734878,
		roughness: .5,
		metalness: .05,
		emissive: 16724080,
		emissiveIntensity: .6
	}), bloomCount);
	blooms.name = "farcrysis-vege-flowering-blooms";
	const bMat = new Matrix4();
	const lMat = new Matrix4();
	const positions = poissonLayerPositions(count, 6, 24, 3, SEED, 2.8);
	const rng = mulberry32$6(1896523174);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const baseY = groundY + .15 * rng();
		const s = .7 + rng() * .45;
		bMat.compose(new Vector3(x, baseY, z), new Quaternion().setFromEuler(new Euler(rng() * .2, angle + rng() * 1.5, rng() * .2)), new Vector3(s, .65 + rng() * .3, s * .9));
		bushes.setMatrixAt(i, bMat);
		for (let b = 0; b < bloomsPerBush; b++) {
			const bloomAngle = angle + (b + i * .5) / bloomsPerBush * Math.PI * 2;
			const bx = x + Math.cos(bloomAngle) * .35 * s;
			const bz = z + Math.sin(bloomAngle) * .35 * s * .85;
			const by = baseY + .55 + rng() * .35;
			const bidx = i * bloomsPerBush + b;
			lMat.compose(new Vector3(bx, by, bz), new Quaternion().setFromEuler(new Euler(rng() * .5, bloomAngle, 0)), new Vector3(.7 + rng() * .4, .7 + rng() * .4, .7 + rng() * .4));
			blooms.setMatrixAt(bidx, lMat);
		}
	}
	bushes.instanceMatrix.needsUpdate = true;
	blooms.instanceMatrix.needsUpdate = true;
	root.add(register(bushes, void 0, {
		castShadow: false,
		receiveShadow: true
	}));
	root.add(register(blooms, void 0, {
		castShadow: false,
		receiveShadow: false
	}));
}
function addJungleVineClusters(root) {
	const count = 30;
	const SEED = 1717116433;
	const strandSeg = new CylinderGeometry(.02, .025, .55, 5);
	const clusterParts = [];
	for (let s = 0; s < 5; s++) {
		const baseAngle = s / 5 * Math.PI * 2;
		const offsetR = .08 + s % 3 * .05;
		const ox = Math.cos(baseAngle) * offsetR;
		const oz = Math.sin(baseAngle) * offsetR;
		for (let seg = 0; seg < 3; seg++) {
			const segY = 3.2 - seg * .9;
			const bendX = ox + (seg % 2 === 0 ? .06 : -.04);
			const bendZ = oz + (seg % 3 === 0 ? -.05 : .04);
			clusterParts.push({
				geom: strandSeg,
				matrix: new Matrix4().compose(new Vector3(bendX, segY, bendZ), new Quaternion().setFromEuler(new Euler(.12, baseAngle + s * .3, .08)), new Vector3(.7 + seg % 2 * .15, .8 + seg % 3 * .1, .7 + seg % 2 * .15))
			});
		}
	}
	const clusters = new InstancedMesh(mergeTransformed(clusterParts), vegeMat(4025904, .8, .02), count);
	clusters.name = "farcrysis-vege-jungle-vine-clusters";
	const matrix = new Matrix4();
	const positions = poissonLayerPositions(count, 5, 24, 2.5, SEED, 2);
	const rng = mulberry32$6(1717116435);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const hangTop = groundY + 3.5 + rng() * 1.8;
		const scale = .75 + rng() * .45;
		matrix.compose(new Vector3(x, hangTop - 1.6 * scale, z), new Quaternion().setFromEuler(new Euler((rng() - .5) * .25, angle + rng() * 1, (rng() - .5) * .2)), new Vector3(scale, .9 + rng() * .2, scale));
		clusters.setMatrixAt(i, matrix);
	}
	clusters.instanceMatrix.needsUpdate = true;
	root.add(register(clusters, void 0, {
		castShadow: false,
		receiveShadow: false
	}));
}
function addBeachGrass(root) {
	const count = 140;
	const SEED = 3735339093;
	const grass = new InstancedMesh(new ConeGeometry(.06, .72, 5, 1), vegeMat(12099658, .86, .02), count);
	grass.name = "farcrysis-vege-beach-grass";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 24, 31.5, .5, SEED);
	const rng = mulberry32$6(3735339094);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const grassY = groundY + .36;
		const s = .6 + rng() * .55;
		const leanAngle = (rng() - .5) * .18;
		const leanDir = angle + rng() * .8;
		matrix.compose(new Vector3(x, grassY, z), new Quaternion().setFromEuler(new Euler(leanAngle, leanDir, 0)), new Vector3(s, .7 + rng() * .55, s));
		grass.setMatrixAt(i, matrix);
	}
	grass.instanceMatrix.needsUpdate = true;
	root.add(register(grass, void 0, {
		castShadow: false,
		receiveShadow: false
	}));
}
function addLargeFerns(root) {
	const count = 50;
	const SEED = 1042935982;
	const bladeGeom = new BoxGeometry(.6, 1.6, .1);
	const fernParts = [];
	for (let b = 0; b < 6; b++) {
		const bladeAngle = b / 6 * Math.PI * 2;
		const tilt = -.3 + b % 3 * .18;
		fernParts.push({
			geom: bladeGeom,
			matrix: new Matrix4().compose(new Vector3(0, .8, 0), new Quaternion().setFromEuler(new Euler(tilt, bladeAngle + b % 2 * .15, 0)), new Vector3(.8 + b % 3 * .12, 1, .6 + b % 3 * .25))
		});
	}
	fernParts.push({
		geom: bladeGeom,
		matrix: new Matrix4().compose(new Vector3(0, .75, 0), new Quaternion().setFromEuler(new Euler(-.15, Math.PI / 3, 0)), new Vector3(.7, .9, .65))
	});
	const ferns = new InstancedMesh(mergeTransformed(fernParts), vegeMat(FARCRYSIS_ART_FEEL.fernGreen, .84, .02), count);
	ferns.name = "farcrysis-vege-large-ferns";
	const matrix = new Matrix4();
	const cliffPositions = poissonLayerPositions(Math.floor(count * .85), 14, 24, 2, SEED, 1.8);
	const rng = mulberry32$6(1042935983);
	for (let i = 0; i < cliffPositions.length; i++) {
		const [x, z, groundY, angle] = cliffPositions[i];
		const baseY = groundY + .08 * rng();
		const s = .65 + rng() * .5;
		const hScale = .65 + rng() * .6;
		matrix.compose(new Vector3(x, baseY, z), new Quaternion().setFromEuler(new Euler(0, angle + rng() * 2, 0)), new Vector3(s, hScale, s));
		ferns.setMatrixAt(i, matrix);
	}
	const caveCount = count - cliffPositions.length;
	const caveRng = mulberry32$6(1042936081);
	for (let i = 0; i < caveCount; i++) {
		const cx = 26 + (caveRng() - .5) * 6;
		const cz = 16 + (caveRng() - .5) * 5;
		const dx = Math.max(BOUNDS.minX + MARGIN, Math.min(BOUNDS.maxX - MARGIN, cx));
		const dz = Math.max(BOUNDS.minZ + MARGIN, Math.min(BOUNDS.maxZ - MARGIN, cz));
		const groundY = farcrysisTerrainHeight(dx, dz);
		const angle = caveRng() * Math.PI * 2;
		const s = .65 + caveRng() * .45;
		const hScale = .65 + caveRng() * .55;
		const idx = cliffPositions.length + i;
		matrix.compose(new Vector3(dx, groundY + .08, dz), new Quaternion().setFromEuler(new Euler(0, angle, 0)), new Vector3(s, hScale, s));
		ferns.setMatrixAt(idx, matrix);
	}
	ferns.instanceMatrix.needsUpdate = true;
	root.add(register(ferns, void 0, {
		castShadow: false,
		receiveShadow: true
	}));
}
function addFallenFronds(root) {
	const count = 60;
	const SEED = 4195434159;
	const fronds = new InstancedMesh(new BoxGeometry(1.2, .03, .25), vegeMat(9136954, .9, .01), count);
	fronds.name = "farcrysis-vege-fallen-fronds";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 3, 30, .8, SEED);
	const rng = mulberry32$6(4195434160);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const frondY = groundY + .02;
		const scaleXZ = .7 + rng() * .8;
		matrix.compose(new Vector3(x, frondY, z), new Quaternion().setFromEuler(new Euler(-Math.PI / 2 + (rng() - .5) * .4, angle + rng() * 2, (rng() - .5) * .3)), new Vector3(scaleXZ, 1, scaleXZ * .38));
		fronds.setMatrixAt(i, matrix);
	}
	fronds.instanceMatrix.needsUpdate = true;
	root.add(register(fronds, void 0, {
		castShadow: false,
		receiveShadow: false
	}));
}
function addFlowerPatches(root) {
	const patches = 5;
	const flowersPerPatch = 8;
	const count = patches * flowersPerPatch;
	const SEED = 3198185729;
	const flowers = new InstancedMesh(new IcosahedronGeometry(.08, 1), new MeshStandardMaterial({
		color: 16736400,
		roughness: .55,
		metalness: .03,
		emissive: 16724064,
		emissiveIntensity: .5
	}), count);
	flowers.name = "farcrysis-vege-flower-patches";
	const matrix = new Matrix4();
	const patchCenters = poissonLayerPositions(patches, 5, 26, 2.5, SEED, 5);
	for (let p = 0; p < patchCenters.length; p++) {
		const [cx, cz, groundY] = patchCenters[p];
		const patchRng = mulberry32$6(SEED + p + 1);
		for (let f = 0; f < flowersPerPatch; f++) {
			const fa = patchRng() * Math.PI * 2;
			const fr = patchRng() * 1.5;
			const fx = cx + Math.cos(fa) * fr;
			const fz = cz + Math.sin(fa) * fr;
			const fy = groundY + .05 + patchRng() * .15;
			const s = .7 + patchRng() * .6;
			const idx = p * flowersPerPatch + f;
			matrix.compose(new Vector3(fx, fy, fz), new Quaternion(), new Vector3(s, s * (.8 + patchRng() * .3), s));
			flowers.setMatrixAt(idx, matrix);
		}
	}
	flowers.instanceMatrix.needsUpdate = true;
	root.add(register(flowers, void 0, {
		castShadow: false,
		receiveShadow: false
	}));
}
function addBeachPebbles(root) {
	const count = 40;
	const SEED = 1588269312;
	const pebbles = new InstancedMesh(new IcosahedronGeometry(.12, 0), vegeMat(12101776, .78, .08), count);
	pebbles.name = "farcrysis-vege-beach-pebbles";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 26, 31.5, .3, SEED);
	const rng = mulberry32$6(1588269313);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY] = positions[i];
		const pebbleY = groundY + .02;
		const s = .5 + rng() * .7;
		matrix.compose(new Vector3(x, pebbleY, z), new Quaternion().setFromEuler(new Euler(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI)), new Vector3(s, s * (.4 + rng() * .5), s));
		pebbles.setMatrixAt(i, matrix);
	}
	pebbles.instanceMatrix.needsUpdate = true;
	root.add(register(pebbles, void 0, {
		castShadow: false,
		receiveShadow: false
	}));
}
function addCycadPalms(root) {
	const count = 14;
	const SEED = 794561553;
	const trunkCyl = new CylinderGeometry(.16, .26, .8, 8);
	trunkCyl.translate(0, .4, 0);
	const leafCone = new ConeGeometry(.055, .62, 4, 1);
	const leafParts = [];
	for (let k = 0; k < 9; k++) {
		const angle = k / 9 * Math.PI * 2 + .12;
		leafParts.push({
			geom: leafCone,
			matrix: new Matrix4().compose(new Vector3(Math.cos(angle) * .14, .72, Math.sin(angle) * .14), new Quaternion().setFromEuler(new Euler(.55 + k % 3 * .14, angle, 0)), new Vector3(.85 + k % 3 * .15, .9 + k % 2 * .15, .85 + k % 3 * .15))
		});
	}
	for (let k = 0; k < 3; k++) {
		const angle = k / 3 * Math.PI * 2 + .3;
		leafParts.push({
			geom: leafCone,
			matrix: new Matrix4().compose(new Vector3(Math.cos(angle) * .07, .78, Math.sin(angle) * .07), new Quaternion().setFromEuler(new Euler(.18, angle, 0)), new Vector3(.7 + k * .1, 1.05 + k * .1, .7 + k * .1))
		});
	}
	const cycadLeafGeom = mergeTransformed(leafParts);
	const trunks = new InstancedMesh(trunkCyl, vegeMat(7032368, .9, .03), count);
	trunks.name = "farcrysis-vege-cycad-trunks";
	const leaves = new InstancedMesh(cycadLeafGeom, vegeMat(3832372, .84, .02), count);
	leaves.name = "farcrysis-vege-cycad-leaves";
	const tMat = new Matrix4();
	const lMat = new Matrix4();
	const positions = poissonLayerPositions(count, 4, 22, 2.5, SEED, 2.4);
	const rng = mulberry32$6(794561554);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const s = .8 + rng() * .5;
		const yaw = angle + rng() * .8;
		tMat.compose(new Vector3(x, groundY + .02, z), new Quaternion().setFromEuler(new Euler(0, yaw, 0)), new Vector3(s, .8 + rng() * .35, s));
		trunks.setMatrixAt(i, tMat);
		lMat.compose(new Vector3(x, groundY + .02, z), new Quaternion().setFromEuler(new Euler(0, yaw, 0)), new Vector3(s, .8 + rng() * .35, s));
		leaves.setMatrixAt(i, lMat);
	}
	trunks.instanceMatrix.needsUpdate = true;
	leaves.instanceMatrix.needsUpdate = true;
	trunks.computeBoundingSphere();
	leaves.computeBoundingSphere();
	root.add(register(trunks, "cycad", {
		castShadow: true,
		receiveShadow: true
	}));
	root.add(register(leaves, "cycad", {
		castShadow: true,
		receiveShadow: true
	}));
}
function addBloomTrees(root) {
	const count = 12;
	const bloomsPerTree = 6;
	const bloomCount = count * bloomsPerTree;
	const SEED = 441430033;
	const trunkGeom = new CylinderGeometry(.18, .3, 2.4, 8);
	trunkGeom.translate(0, 1.2, 0);
	const sphereSrc = new SphereGeometry(1.05, 8, 5);
	const canopyGeom = mergeTransformed([{
		geom: sphereSrc,
		matrix: new Matrix4().compose(new Vector3(0, 0, 0), new Quaternion(), new Vector3(1.15, .6, 1))
	}, {
		geom: sphereSrc,
		matrix: new Matrix4().compose(new Vector3(-.2, .5, .1), new Quaternion().setFromEuler(new Euler(.2, .4, 0)), new Vector3(.9, .52, .85))
	}]);
	lumpify(canopyGeom, .18, 6735);
	const blossomGeom = new IcosahedronGeometry(.12, 0);
	const trunks = new InstancedMesh(trunkGeom, vegeMat(7164984, .9, .03), count);
	trunks.name = "farcrysis-vege-bloom-trunks";
	const canopies = new InstancedMesh(canopyGeom, vegeMat(4360760, .86, .01), count);
	canopies.name = "farcrysis-vege-bloom-canopies";
	const blossoms = new InstancedMesh(blossomGeom, vegeMat(15228970, .6, .02), bloomCount);
	blossoms.name = "farcrysis-vege-bloom-blossoms";
	const tMat = new Matrix4();
	const cMat = new Matrix4();
	const bMat = new Matrix4();
	const positions = poissonLayerPositions(count, 6, 20, 3.5, SEED, 4.5);
	const rng = mulberry32$6(441430035);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const trunkY = groundY;
		const canopyY = groundY + 2.5;
		const s = .85 + rng() * .4;
		const yaw = angle + rng() * .6;
		tMat.compose(new Vector3(x, trunkY, z), new Quaternion().setFromEuler(new Euler((rng() - .5) * .08, yaw, 0)), new Vector3(s, .85 + rng() * .2, s));
		trunks.setMatrixAt(i, tMat);
		cMat.compose(new Vector3(x, canopyY, z), new Quaternion().setFromEuler(new Euler(rng() * .2, yaw + rng() * 1.2, 0)), new Vector3(.9 + rng() * .3, .8 + rng() * .25, .9 + rng() * .3));
		canopies.setMatrixAt(i, cMat);
		for (let b = 0; b < bloomsPerTree; b++) {
			const ba = yaw + b / bloomsPerTree * Math.PI * 2 + i % 2 * .2;
			const br = .75 + (i * 7 + b * 3) % 5 * .06;
			const by = canopyY + (i + b) % 3 * .18;
			bMat.compose(new Vector3(x + Math.cos(ba) * br, by, z + Math.sin(ba) * br), new Quaternion().setFromEuler(new Euler(rng() * .4, ba, 0)), new Vector3(.7 + rng() * .4, .7 + rng() * .4, .7 + rng() * .4));
			blossoms.setMatrixAt(i * bloomsPerTree + b, bMat);
		}
	}
	trunks.instanceMatrix.needsUpdate = true;
	canopies.instanceMatrix.needsUpdate = true;
	blossoms.instanceMatrix.needsUpdate = true;
	trunks.computeBoundingSphere();
	canopies.computeBoundingSphere();
	blossoms.computeBoundingSphere();
	root.add(register(trunks, "bloom-tree", {
		castShadow: true,
		receiveShadow: true
	}));
	root.add(register(canopies, "bloom-tree", {
		castShadow: false,
		receiveShadow: true
	}));
	root.add(register(blossoms, "bloom-tree", {
		castShadow: false,
		receiveShadow: false
	}));
}
function addBeachScrubBushes(root) {
	const count = 24;
	const SEED = 2604411409;
	const blobGeom = new IcosahedronGeometry(.5, 0);
	const leafGeom = new BoxGeometry(.5, .03, .38);
	const parts = [
		{
			geom: blobGeom,
			matrix: new Matrix4().compose(new Vector3(0, 0, 0), new Quaternion(), new Vector3(1, .72, .9))
		},
		{
			geom: blobGeom,
			matrix: new Matrix4().compose(new Vector3(.3, .05, .12), new Quaternion().setFromEuler(new Euler(.2, .5, 0)), new Vector3(.85, .6, .8))
		},
		{
			geom: blobGeom,
			matrix: new Matrix4().compose(new Vector3(-.28, -.02, -.18), new Quaternion().setFromEuler(new Euler(-.15, -.4, .1)), new Vector3(.8, .55, .85))
		}
	];
	for (let l = 0; l < 4; l++) {
		const la = l / 4 * Math.PI * 2 + .25;
		parts.push({
			geom: leafGeom,
			matrix: new Matrix4().compose(new Vector3(Math.cos(la) * .42, .28 + l % 2 * .08, Math.sin(la) * .42), new Quaternion().setFromEuler(new Euler(-.5, la, l % 3 * .2)), new Vector3(.9 + l % 2 * .15, 1, .9 + l % 3 * .1))
		});
	}
	const bushes = new InstancedMesh(mergeTransformed(parts), vegeMat(5012024, .88, .02), count);
	bushes.name = "farcrysis-vege-beach-scrub-bushes";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 21, 31, 1.5, SEED);
	const rng = mulberry32$6(2604411412);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const s = .7 + rng() * .5;
		matrix.compose(new Vector3(x, groundY + .05, z), new Quaternion().setFromEuler(new Euler(rng() * .2, angle + rng() * 1.5, rng() * .2)), new Vector3(s, .7 + rng() * .35, s * .9));
		bushes.setMatrixAt(i, matrix);
	}
	bushes.instanceMatrix.needsUpdate = true;
	bushes.computeBoundingSphere();
	root.add(register(bushes, void 0, {
		castShadow: false,
		receiveShadow: true
	}));
}
function addGrassPatches(root) {
	const count = 120;
	const SEED = 2009135633;
	const bladeGeom = new ConeGeometry(.06, .55, 4, 1);
	const parts = [];
	for (let b = 0; b < 4; b++) {
		const ba = b / 4 * Math.PI * 2 + .2;
		const tilt = .12 + b % 2 * .14;
		parts.push({
			geom: bladeGeom,
			matrix: new Matrix4().compose(new Vector3(Math.cos(ba) * .06, .27, Math.sin(ba) * .06), new Quaternion().setFromEuler(new Euler(tilt, ba, 0)), new Vector3(.85 + b % 3 * .12, .8 + b % 2 * .18, .85 + b % 3 * .12))
		});
	}
	const patches = new InstancedMesh(mergeTransformed(parts), vegeMat(5081654, .88, .01), count);
	patches.name = "farcrysis-vege-grass-patches";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 1, 30, .5, SEED);
	const rng = mulberry32$6(2009135637);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const s = .7 + rng() * .6;
		matrix.compose(new Vector3(x, groundY + .03, z), new Quaternion().setFromEuler(new Euler(0, angle + rng() * 2, 0)), new Vector3(s, .75 + rng() * .5, s));
		patches.setMatrixAt(i, matrix);
	}
	patches.instanceMatrix.needsUpdate = true;
	patches.computeBoundingSphere();
	root.add(register(patches, void 0, {
		castShadow: false,
		receiveShadow: false
	}));
}
function addTwigs(root) {
	const count = 90;
	const SEED = 1277075473;
	const twigGeom = new CylinderGeometry(.015, .028, .55, 4);
	twigGeom.translate(0, 0, 0);
	const twigs = new InstancedMesh(twigGeom, vegeMat(7033392, .92, .01), count);
	twigs.name = "farcrysis-vege-twigs";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 3, 28, .5, SEED);
	const rng = mulberry32$6(1277075478);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const twigY = groundY + .02;
		const s = .6 + rng() * .8;
		matrix.compose(new Vector3(x, twigY, z), new Quaternion().setFromEuler(new Euler(Math.PI / 2 + (rng() - .5) * .35, angle + rng() * Math.PI, (rng() - .5) * .3)), new Vector3(s, 1, s));
		twigs.setMatrixAt(i, matrix);
	}
	twigs.instanceMatrix.needsUpdate = true;
	twigs.computeBoundingSphere();
	root.add(register(twigs, void 0, {
		castShadow: false,
		receiveShadow: false
	}));
}
function addSmallRocks(root) {
	const count = 60;
	const SEED = 1674868497;
	const rocks = new InstancedMesh(new IcosahedronGeometry(.26, 1), vegeMat(7236196, .85, .06), count);
	rocks.name = "farcrysis-vege-small-rocks";
	const matrix = new Matrix4();
	const positions = poissonLayerPositions(count, 6, 26, 1, SEED, 1.5);
	const rng = mulberry32$6(1674868503);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const s = .7 + rng() * .8;
		matrix.compose(new Vector3(x, groundY + .03, z), new Quaternion().setFromEuler(new Euler(rng() * Math.PI, angle + rng() * Math.PI, rng() * Math.PI)), new Vector3(s, s * (.55 + rng() * .35), s));
		rocks.setMatrixAt(i, matrix);
	}
	rocks.instanceMatrix.needsUpdate = true;
	rocks.computeBoundingSphere();
	root.add(register(rocks, void 0, {
		castShadow: false,
		receiveShadow: true
	}));
}
var WIND_LAYER_DAPPLE = [
	["farcrysis-vege-leaf-litter", .85],
	["farcrysis-vege-fallen-fronds", .8],
	["farcrysis-vege-grass-tufts", .75],
	["farcrysis-vege-dense-grass", .75],
	["farcrysis-vege-beach-grass", .75],
	["farcrysis-vege-grass-patches", .7],
	["farcrysis-vege-flower-patches", .6],
	["farcrysis-vege-ferns", .55],
	["farcrysis-vege-large-ferns", .55],
	["farcrysis-vege-understory-ferns", .55],
	["farcrysis-vege-bushes", .45],
	["farcrysis-vege-flowering-bushes", .45],
	["farcrysis-vege-beach-scrub", .4],
	["farcrysis-vege-cycad-leaves", .4],
	["farcrysis-vege-banana-leaves", .4],
	["farcrysis-vege-palm-fronds", .3],
	["farcrysis-vege-coconut-fronds", .3],
	["farcrysis-vege-canopy-vines", .25],
	["farcrysis-vege-jungle-vine-clusters", .25],
	["farcrysis-vege-vines", .25]
];
function dappleFor(name) {
	for (const [n, d] of WIND_LAYER_DAPPLE) if (name === n || name.startsWith(n)) return d;
	return .35;
}
/**
* HF-359/HF-363: convert every named foliage InstancedMesh's material to a
* typed-TSL MeshStandardNodeMaterial carrying per-instance phase-offset wind
* (positionNode) and analytic canopy-transmittance dapple (colorNode).
* Replaces the old no-op onBeforeCompile shim walk.
*/
function _applyTslFoliage(scene) {
	if (typeof document !== "undefined" && document.documentElement?.dataset.renderBackend === "webgl2") return;
	for (let i = 0; i < scene.children.length; i++) {
		const child = scene.children[i];
		if (!(child instanceof InstancedMesh)) continue;
		const std = child.material;
		if (!(std && std.isMeshStandardMaterial)) continue;
		child.geometry.computeBoundingBox();
		const bb = child.geometry.boundingBox;
		const height = Math.max(.5, bb ? bb.max.y - bb.min.y : 1);
		child.material = makeTslFoliageMaterial({
			color: std.color.getHex(),
			roughness: std.roughness,
			metalness: std.metalness,
			dapple: dappleFor(child.name),
			swayAmount: Math.min(.09, .02 + height * .02),
			swayHeight: height,
			doubleSided: true
		});
	}
}
/**
* HF-363 species #34 — "heliconia clumps": broad bent leaf cards (curved via
* multi-segment bend baked into merged geometry) rising from a tiny stem.
* Inland undergrowth filler; strong dapple + wind apply automatically.
*/
function addHeliconiaClumps(root) {
	const count = 70;
	const SEED = 1595000738;
	const seg = new BoxGeometry(.16, .55, .02);
	const parts = [];
	for (let sgi = 0; sgi < 3; sgi++) {
		const bend = sgi * .32;
		parts.push({
			geom: seg,
			matrix: new Matrix4().compose(new Vector3(Math.sin(bend) * .28, .24 + Math.cos(bend) * .26, 0), new Quaternion().setFromEuler(new Euler(-bend, 0, 0)), new Vector3(1 + sgi * .25, 1, 1))
		});
	}
	const clumps = new InstancedMesh(mergeTransformed(parts), vegeMat(4160044, .84, .02), count);
	clumps.name = "farcrysis-vege-heliconia-clumps";
	const matrix = new Matrix4();
	const positions = layerPositions(count, 8, 28, 1.6, SEED);
	const rng = mulberry32$6(1595000747);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		const s = .65 + rng() * .75;
		matrix.compose(new Vector3(x, groundY + .02, z), new Quaternion().setFromEuler(new Euler(rng() * .25, angle + rng() * Math.PI * 2, rng() * .25)), new Vector3(s, s * (.85 + rng() * .5), s));
		clumps.setMatrixAt(i, matrix);
	}
	clumps.instanceMatrix.needsUpdate = true;
	clumps.computeBoundingSphere();
	root.add(register(clumps, "heliconia", {
		castShadow: false,
		receiveShadow: true
	}));
}
/**
* Pass 76 species #36 — dense leaf-card undergrowth: clumps of three arched
* cards at ~3.5x the density of the old box shrubs. This is the layer that
* fills the space between the ground litter and the waist-high shrubs, which
* is where the Far Cry jungles get their depth.
*/
function addLeafCardUndergrowth(root) {
	const clumps = 110;
	const cardsPerClump = 3;
	const count = clumps * cardsPerClump;
	const SEED = 1992600837;
	const cardGeom = new BoxGeometry(.5, .72, .03);
	cardGeom.translate(0, .36, 0);
	const cardMat = vegeMat(3105832, .86, .02);
	cardMat.side = 2;
	const cards = new InstancedMesh(cardGeom, cardMat, count);
	cards.name = "farcrysis-vege-undergrowth-cards";
	const matrix = new Matrix4();
	const positions = layerPositions(clumps, 6, 27, 1.2, SEED);
	const rng = mulberry32$6(1992600840);
	for (let i = 0; i < positions.length; i++) {
		const [x, z, groundY, angle] = positions[i];
		for (let card = 0; card < cardsPerClump; card += 1) {
			const cardYaw = angle + card / cardsPerClump * Math.PI * 2 + rng() * .7;
			const spread = .08 + rng() * .22;
			const s = .7 + rng() * .75;
			matrix.compose(new Vector3(x + Math.cos(cardYaw) * spread, groundY + .02, z + Math.sin(cardYaw) * spread), new Quaternion().setFromEuler(new Euler(.28 + rng() * .3, cardYaw, (rng() - .5) * .2)), new Vector3(s, s * (.85 + rng() * .4), 1));
			cards.setMatrixAt(i * cardsPerClump + card, matrix);
		}
	}
	cards.instanceMatrix.needsUpdate = true;
	cards.computeBoundingSphere();
	root.add(register(cards, void 0, {
		castShadow: false,
		receiveShadow: true
	}));
}
/**
* HF-363 ground scatter #35 — "driftwood logs": weathered swept tubes washed
* up along the outer beach ring, breaking up flat sand. No collision — pure
* dressing (walk-through unchanged).
*/
function addDriftwoodLogs$1(root) {
	const count = 26;
	const parts = [];
	for (let sgi = 0; sgi < 4; sgi++) {
		const t0 = sgi / 4;
		const bow = Math.sin(t0 * Math.PI) * .09;
		parts.push({
			geom: new CylinderGeometry(.09 - t0 * .03, .1 - t0 * .03, .42, 6),
			matrix: new Matrix4().compose(new Vector3((t0 - .375) * 1.7, bow, 0), new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2 + (t0 - .5) * .22)), new Vector3(1, 1, 1))
		});
	}
	const logs = new InstancedMesh(mergeTransformed(parts), vegeMat(9075300, .95, .01), count);
	logs.name = "farcrysis-vege-driftwood-logs";
	const matrix = new Matrix4();
	const positions = ringPositions(count, 24, 30);
	const rng = mulberry32$6(718880997);
	for (let i = 0; i < positions.length; i++) {
		const [x, z] = positions[i];
		const groundY = farcrysisTerrainHeight(x, z);
		if (!clearOfGameplay(x, z, 1.4)) continue;
		matrix.compose(new Vector3(x, groundY + .08, z), new Quaternion().setFromEuler(new Euler(rng() * .15 - .07, rng() * Math.PI * 2, rng() * .12 - .06)), new Vector3(.8 + rng() * .9, .8 + rng() * .6, .8 + rng() * .7));
		logs.setMatrixAt(i, matrix);
	}
	logs.instanceMatrix.needsUpdate = true;
	logs.computeBoundingSphere();
	root.add(register(logs, void 0, {
		castShadow: false,
		receiveShadow: true
	}));
}
function buildVegetation(scene) {
	resetStats();
	addPalms(scene);
	addBroadleafTrees(scene);
	addFanPalms(scene);
	addBananaPlants(scene);
	addBamboo(scene);
	addDeadTrees(scene);
	addFerns(scene);
	addGrassTufts(scene);
	addBushes(scene);
	addVines(scene);
	addKapokTrees(scene);
	addCoconutPalms(scene);
	addCanopyVines(scene);
	addLeafLitter(scene);
	addDenseGrass(scene);
	addFloweringAccents(scene);
	addUndergrowthShrubs(scene);
	addUnderstoryFerns(scene);
	addMangroveTrees(scene);
	addBambooGroves(scene);
	addFloweringBushes(scene);
	addJungleVineClusters(scene);
	addBeachGrass(scene);
	addLargeFerns(scene);
	addFallenFronds(scene);
	addFlowerPatches(scene);
	addBeachPebbles(scene);
	addCycadPalms(scene);
	addBloomTrees(scene);
	addBeachScrubBushes(scene);
	addGrassPatches(scene);
	addTwigs(scene);
	addSmallRocks(scene);
	addHeliconiaClumps(scene);
	addDriftwoodLogs$1(scene);
	addLeafCardUndergrowth(scene);
	_applyTslFoliage(scene);
	_applyInstanceColorVariation(scene);
}
function buildAdditionalVegetation(root) {
	const beforeInstances = _s.totalInstances;
	const beforeTriangles = _s.totalTriangles;
	const beforeTypes = new Set(_s.treeTypeNames);
	addCycadPalms(root);
	addBloomTrees(root);
	addBeachScrubBushes(root);
	addGrassPatches(root);
	addTwigs(root);
	addSmallRocks(root);
	_applyTslFoliage(root);
	_applyInstanceColorVariation(root);
	const addedTreeTypes = [];
	for (const t of _s.treeTypeNames) if (!beforeTypes.has(t)) addedTreeTypes.push(t);
	return {
		addedInstances: _s.totalInstances - beforeInstances,
		addedTriangles: _s.totalTriangles - beforeTriangles,
		addedTreeTypes
	};
}
//#endregion
//#region src/farcrysis-textures.ts
/**
* farcrysis-textures.ts — PBR texture application for the Farcrysis jungle/beach arena.
*
* Uses high-quality AI-generated 1024×1024 PBR image textures (color, normal, roughness)
* loaded asynchronously from public/assets/original/textures/farcrysis-*.png.
*
* Immediate synchronous presentation via procedural Canvas textures (the legacy
* noise-based generators) provides a seamless fallback in headless environments,
* during network delays, and while images load.  When the image set for a material
* family finishes loading, registered materials are upgraded in-place.
*
* Exports:
*   applyFarcrysisTextures(root: THREE.Group): void
*   FARCRYSIS_TEXTURE_STATS(): { textureCount: number }
*
* Presentation only — never adds colliders, spawns, or gameplay authority.
*/
function hasCanvas$1() {
	return typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined" && typeof document.createElement === "function";
}
/** Create a 2D canvas; returns null in test/headless environments. */
function makeCanvas$1(width, height) {
	if (!hasCanvas$1()) return null;
	try {
		const c = document.createElement("canvas");
		c.width = width;
		c.height = height;
		return c.getContext("2d") ?? null;
	} catch {
		return null;
	}
}
/** Wrap a filled canvas into a repeat-wrapped Three.js texture. */
function wrapTexture(canvas, colorSpace = SRGBColorSpace, wrap = RepeatWrapping) {
	const tex = new CanvasTexture(canvas);
	tex.wrapS = wrap;
	tex.wrapT = wrap;
	tex.colorSpace = colorSpace;
	tex.needsUpdate = true;
	return tex;
}
var _generated$1 = false;
var _textureCount = 0;
function mulberry32$5(seed) {
	return () => {
		seed |= 0;
		seed = seed + 1831565813 | 0;
		let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
function valueNoise(x, y, seed) {
	const s = x * 374761393 + y * 668265263 + seed * 15485863;
	const n = Math.sin(s) * 1e4;
	return n - Math.floor(n);
}
function smoothNoise$1(x, y, seed) {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = x - ix;
	const fy = y - iy;
	const sx = fx * fx * (3 - 2 * fx);
	const sy = fy * fy * (3 - 2 * fy);
	const v00 = valueNoise(ix, iy, seed);
	const v10 = valueNoise(ix + 1, iy, seed);
	const v01 = valueNoise(ix, iy + 1, seed);
	const v11 = valueNoise(ix + 1, iy + 1, seed);
	const a = v00 + sx * (v10 - v00);
	return a + sy * (v01 + sx * (v11 - v01) - a);
}
function fbmNoise$1(x, y, octaves, seed) {
	let value = 0;
	let amplitude = 1;
	let freq = 1;
	let max = 0;
	for (let i = 0; i < octaves; i++) {
		value += amplitude * smoothNoise$1(x * freq, y * freq, seed + i * 127);
		max += amplitude;
		freq *= 2;
		amplitude *= .5;
	}
	return value / max;
}
var T = 512;
var _sandColor = null;
var _sandRoughness = null;
var _sandNormal = null;
var _rockColor = null;
var _rockRoughness = null;
var _rockNormal = null;
var _barkColor = null;
var _barkRoughness = null;
var _barkNormal = null;
var _barkBump = null;
var _frondAlpha = null;
var _waterColor = null;
var _waterNormal = null;
var _crateColor = null;
var _crateRoughness = null;
function genBeachSand() {
	const ctx = makeCanvas$1(T, T);
	if (!ctx) return;
	const img = ctx.createImageData(T, T);
	const data = img.data;
	const rng = mulberry32$5(23530);
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const nx = x / T;
		const ny = y / T;
		const n = fbmNoise$1(nx * 24, ny * 24, 4, 23530);
		const baseR = .78 + n * .12;
		const baseG = .65 + n * .14;
		const baseB = .42 + n * .12;
		const grain = (rng() - .5) * .06;
		const r = Math.min(1, Math.max(0, baseR + grain));
		const g = Math.min(1, Math.max(0, baseG + grain));
		const b = Math.min(1, Math.max(0, baseB + grain));
		data[i] = Math.round(r * 255);
		data[i + 1] = Math.round(g * 255);
		data[i + 2] = Math.round(b * 255);
		data[i + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	_sandColor = wrapTexture(ctx.canvas);
	const rCtx = makeCanvas$1(T, T);
	if (!rCtx) return;
	const rImg = rCtx.createImageData(T, T);
	const rData = rImg.data;
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const n = fbmNoise$1(x / T * 18, y / T * 18, 3, 51966);
		const val = Math.round((.78 + n * .18) * 255);
		rData[i] = val;
		rData[i + 1] = val;
		rData[i + 2] = val;
		rData[i + 3] = 255;
	}
	rCtx.putImageData(rImg, 0, 0);
	_sandRoughness = wrapTexture(rCtx.canvas, "");
	_textureCount += 2;
}
function genJungleRock() {
	const ctx = makeCanvas$1(T, T);
	if (!ctx) return;
	const img = ctx.createImageData(T, T);
	const data = img.data;
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const nx = x / T;
		const ny = y / T;
		const n1 = fbmNoise$1(nx * 16, ny * 16, 4, 31420);
		const n2 = fbmNoise$1(nx * 32, ny * 32, 3, 57073);
		const base = .28 + n1 * .18 + n2 * .06;
		const rTint = base * .96;
		const gTint = base * .94;
		const bTint = base * .9;
		data[i] = Math.round(Math.min(1, Math.max(0, rTint)) * 255);
		data[i + 1] = Math.round(Math.min(1, Math.max(0, gTint)) * 255);
		data[i + 2] = Math.round(Math.min(1, Math.max(0, bTint)) * 255);
		data[i + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	_rockColor = wrapTexture(ctx.canvas);
	const rCtx = makeCanvas$1(T, T);
	if (!rCtx) return;
	const rImg = rCtx.createImageData(T, T);
	const rData = rImg.data;
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const n = fbmNoise$1(x / T * 20, y / T * 20, 4, 4369);
		const val = Math.round((.72 + n * .28) * 255);
		rData[i] = val;
		rData[i + 1] = val;
		rData[i + 2] = val;
		rData[i + 3] = 255;
	}
	rCtx.putImageData(rImg, 0, 0);
	_rockRoughness = wrapTexture(rCtx.canvas, "");
	_textureCount += 2;
}
function genPalmBark() {
	const ctx = makeCanvas$1(T, T);
	if (!ctx) return;
	const img = ctx.createImageData(T, T);
	const data = img.data;
	const rng = mulberry32$5(46260);
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const nx = x / T;
		const ny = y / T;
		const stripe = Math.sin(nx * 28 + fbmNoise$1(ny * 4, 0, 2, 2827) * 6) * .5 + .5;
		const band = fbmNoise$1(ny * 8, nx * 3, 3, 3341) * .15;
		const knot = smoothNoise$1(nx * 18, ny * 22, 3598) > .55 ? .08 : 0;
		const baseLum = .35 + stripe * .22 + band + knot;
		const rTint = baseLum * 1.1;
		const gTint = baseLum * .92;
		const bTint = baseLum * .72;
		const grain = (rng() - .5) * .04;
		data[i] = Math.round(Math.min(1, Math.max(0, rTint + grain)) * 255);
		data[i + 1] = Math.round(Math.min(1, Math.max(0, gTint + grain)) * 255);
		data[i + 2] = Math.round(Math.min(1, Math.max(0, bTint + grain)) * 255);
		data[i + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	_barkColor = wrapTexture(ctx.canvas);
	const rCtx = makeCanvas$1(T, T);
	if (!rCtx) return;
	const rImg = rCtx.createImageData(T, T);
	const rData = rImg.data;
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const nx = x / T;
		const ny = y / T;
		const stripe = Math.sin(nx * 32) * .5 + .5;
		const rough = .78 + fbmNoise$1(nx * 14 + ny * 3, ny * 12, 3, 61453) * .16 - stripe * .08;
		rData[i] = Math.round(Math.min(1, Math.max(0, rough)) * 255);
		rData[i + 1] = rData[i];
		rData[i + 2] = rData[i];
		rData[i + 3] = 255;
	}
	rCtx.putImageData(rImg, 0, 0);
	_barkRoughness = wrapTexture(rCtx.canvas, "");
	const bCtx = makeCanvas$1(T, T);
	if (!bCtx) return;
	const bImg = bCtx.createImageData(T, T);
	const bData = bImg.data;
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const nx = x / T;
		const ny = y / T;
		const bump = (Math.sin(nx * 28 + fbmNoise$1(ny * 4, 0, 2, 2827) * 6) * .5 + .5) * .6 + fbmNoise$1(nx * 12, ny * 8, 3, 43981) * .4;
		const val = Math.round(Math.min(1, Math.max(0, bump)) * 255);
		bData[i] = val;
		bData[i + 1] = val;
		bData[i + 2] = val;
		bData[i + 3] = 255;
	}
	bCtx.putImageData(bImg, 0, 0);
	_barkBump = wrapTexture(bCtx.canvas, "");
	_textureCount += 3;
}
function genNormalMap(height, strength) {
	const ctx = makeCanvas$1(T, T);
	if (!ctx) return null;
	const field = new Float32Array(T * T);
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) field[y * T + x] = height(x / T, y / T);
	const img = ctx.createImageData(T, T);
	const data = img.data;
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const xL = field[y * T + (x + T - 1) % T];
		const xR = field[y * T + (x + 1) % T];
		const yD = field[(y + T - 1) % T * T + x];
		const yU = field[(y + 1) % T * T + x];
		const gradX = (xR - xL) * strength;
		const gradY = (yU - yD) * strength;
		const len = Math.sqrt(gradX * gradX + gradY * gradY + 1);
		data[i] = Math.round(-gradX / len * 127.5 + 127.5);
		data[i + 1] = Math.round(-gradY / len * 127.5 + 127.5);
		data[i + 2] = Math.round(1 / len * 127.5 + 127.5);
		data[i + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	return wrapTexture(ctx.canvas, "");
}
/** Sand normal: fine grain + faint wind-ripple bands (matches genBeachSand). */
function genSandNormal() {
	const tex = genNormalMap((nx, ny) => {
		const n = fbmNoise$1(nx * 18, ny * 18, 3, 20903);
		const ripple = Math.sin(ny * 26 + Math.sin(nx * 4.2 + ny * 5) * 1.4) * .12;
		return n * .7 + ripple * .5;
	}, 1.4);
	if (!tex) return;
	_sandNormal = tex;
	_textureCount += 1;
}
/** Rock normal: broad crag relief + fine pitting (matches genJungleRock). */
function genRockNormal() {
	const tex = genNormalMap((nx, ny) => {
		const n1 = fbmNoise$1(nx * 16, ny * 16, 4, 31420);
		const n2 = fbmNoise$1(nx * 32, ny * 32, 3, 57073);
		return n1 * .7 + n2 * .3;
	}, 2.2);
	if (!tex) return;
	_rockNormal = tex;
	_textureCount += 1;
}
/** Bark normal: vertical striation ridges + knots (matches genPalmBark). */
function genBarkNormal() {
	const tex = genNormalMap((nx, ny) => {
		const stripe = Math.sin(nx * 28 + fbmNoise$1(ny * 4, 0, 2, 2827) * 6) * .5 + .5;
		const n = fbmNoise$1(nx * 12, ny * 8, 3, 43981);
		return stripe * .7 + n * .3;
	}, 2.6);
	if (!tex) return;
	_barkNormal = tex;
	_textureCount += 1;
}
function genFrondAlpha() {
	const ctx = makeCanvas$1(T, T);
	if (!ctx) return;
	const img = ctx.createImageData(T, T);
	const data = img.data;
	const tilesU = 4;
	const tilesV = 4;
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const tileW = T / tilesU;
		const tileH = T / tilesV;
		const u = x % tileW / tileW * 2 - 1;
		const v = y % tileH / tileH * 2 - 1;
		const frondWidth = .35 + (v + 1) * .4;
		const edgeFade = Math.abs(u) < frondWidth ? 1 - Math.abs(u) / (frondWidth + .02) : 0;
		const alpha = Math.min(1, Math.max(0, edgeFade * 1.5));
		const greenR = .15;
		const greenG = .55 + (1 - Math.abs(v)) * .25;
		const greenB = .18;
		const goldR = .72;
		const goldG = .68;
		const goldB = .22;
		const t = Math.max(0, (-v + 1) / 2);
		data[i] = Math.round((greenR + (goldR - greenR) * t) * 255);
		data[i + 1] = Math.round((greenG + (goldG - greenG) * t) * 255);
		data[i + 2] = Math.round((greenB + (goldB - greenB) * t) * 255);
		data[i + 3] = Math.round(alpha * 255);
	}
	ctx.putImageData(img, 0, 0);
	_frondAlpha = wrapTexture(ctx.canvas, SRGBColorSpace);
	_frondAlpha.wrapS = RepeatWrapping;
	_frondAlpha.wrapT = RepeatWrapping;
	_textureCount += 1;
}
function genWater() {
	const ctx = makeCanvas$1(T, T);
	if (!ctx) return;
	const img = ctx.createImageData(T, T);
	const data = img.data;
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const nx = x / T;
		const ny = y / T;
		const wave = fbmNoise$1(nx * 8, ny * 8, 3, 1263) * .12;
		const caustic = fbmNoise$1(nx * 22, ny * 22, 2, 1248) * .06;
		data[i] = Math.round(Math.min(1, Math.max(0, .18 + wave * .5 + caustic)) * 255);
		data[i + 1] = Math.round(Math.min(1, Math.max(0, .5 + wave * .6 + caustic)) * 255);
		data[i + 2] = Math.round(Math.min(1, Math.max(0, .55 + wave * .7 + caustic)) * 255);
		data[i + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	_waterColor = wrapTexture(ctx.canvas);
	const normalCtx = makeCanvas$1(T, T);
	if (!normalCtx) return;
	const heightField = new Float32Array(T * T);
	const STRENGTH = 2.5;
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) heightField[y * T + x] = fbmNoise$1(x / T * 10, y / T * 10, 4, 4919);
	const nImg = normalCtx.createImageData(T, T);
	const nData = nImg.data;
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const xL = x > 0 ? heightField[y * T + (x - 1)] : heightField[y * T + x];
		const xR = x < T - 1 ? heightField[y * T + (x + 1)] : heightField[y * T + x];
		const yD = y > 0 ? heightField[(y - 1) * T + x] : heightField[y * T + x];
		const yU = y < T - 1 ? heightField[(y + 1) * T + x] : heightField[y * T + x];
		const gradX = (xR - xL) * STRENGTH;
		const gradY = (yU - yD) * STRENGTH;
		const len = Math.sqrt(gradX * gradX + gradY * gradY + 1);
		nData[i] = Math.round(-gradX / len * .5 * 255 + 127.5);
		nData[i + 1] = Math.round(-gradY / len * .5 * 255 + 127.5);
		nData[i + 2] = Math.round(1 / len * .5 * 255 + 127.5);
		nData[i + 3] = 255;
	}
	normalCtx.putImageData(nImg, 0, 0);
	_waterNormal = wrapTexture(normalCtx.canvas, "");
	_textureCount += 2;
}
function genWoodCrate() {
	const ctx = makeCanvas$1(T, T);
	if (!ctx) return;
	const img = ctx.createImageData(T, T);
	const data = img.data;
	const rng = mulberry32$5(50302);
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const nx = x / T;
		const ny = y / T;
		const ring = Math.sin(ny * 42 + fbmNoise$1(nx * 6, ny * 3, 3, 49407) * 8) * .5 + .5;
		const fine = fbmNoise$1(nx * 18, ny * 24, 3, 4919) * .08;
		const knotX = (nx * T - T * .3) / 60;
		const knotY = (ny * T - T * .55) / 60;
		const knotDist = Math.sqrt(knotX * knotX + knotY * knotY);
		const knot = knotDist < 1 ? (1 - knotDist) * .2 : 0;
		const baseLum = .42 + ring * .2 + fine - knot;
		const rTint = baseLum * 1.05 + .06;
		const gTint = baseLum * .85;
		const bTint = baseLum * .55;
		const grain = (rng() - .5) * .05;
		data[i] = Math.round(Math.min(1, Math.max(0, rTint + grain)) * 255);
		data[i + 1] = Math.round(Math.min(1, Math.max(0, gTint + grain)) * 255);
		data[i + 2] = Math.round(Math.min(1, Math.max(0, bTint + grain)) * 255);
		data[i + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	_crateColor = wrapTexture(ctx.canvas);
	const rCtx = makeCanvas$1(T, T);
	if (!rCtx) return;
	const rImg = rCtx.createImageData(T, T);
	const rData = rImg.data;
	for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
		const i = (y * T + x) * 4;
		const ny = y / T;
		const ring = Math.sin(ny * 42) * .5 + .5;
		const rough = .7 + fbmNoise$1(x / T * 14, y / T * 10, 3, 48879) * .18 + ring * .08;
		const val = Math.round(Math.min(1, Math.max(0, rough)) * 255);
		rData[i] = val;
		rData[i + 1] = val;
		rData[i + 2] = val;
		rData[i + 3] = 255;
	}
	rCtx.putImageData(rImg, 0, 0);
	_crateRoughness = wrapTexture(rCtx.canvas, "");
	_textureCount += 2;
}
function ensureTextures() {
	if (_generated$1) return;
	_generated$1 = true;
	if (!hasCanvas$1()) return;
	genBeachSand();
	genJungleRock();
	genPalmBark();
	genSandNormal();
	genRockNormal();
	genBarkNormal();
	genFrondAlpha();
	genWater();
	genWoodCrate();
}
function classifyMesh(mesh) {
	const name = mesh.name.toLowerCase();
	if (name.includes("water") || name.includes("lagoon")) return "water";
	if (name.includes("crate")) return "crate";
	if (name.includes("rock") || name.includes("cliff") || name.includes("cave")) return "rock";
	if (name.includes("trunk") && (name.includes("palm") || name.includes("canopy"))) return "palm-bark";
	if (name.includes("frond")) return "frond";
	if (name.includes("beach") || name.includes("sand")) return "sand";
	if (mesh.userData.farcrysisArt) {
		const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
		if (mat && mat instanceof MeshStandardMaterial && "color" in mat) {
			const col = mat.color.getHex();
			if (col === FARCRYSIS_ART_FEEL.beachSand) return "sand";
			if (col === FARCRYSIS_ART_FEEL.palmTrunk) return "palm-bark";
			if (col === FARCRYSIS_ART_FEEL.palmFrond) return "frond";
			if (col === FARCRYSIS_ART_FEEL.caveRock) return "rock";
		}
	}
	return null;
}
var REGISTRY = /* @__PURE__ */ new Map();
var _imageSets = {};
var _imageLoaderInitiated = false;
var TEXTURE_PATH = "./assets/original/textures/farcrysis";
/** Wrap a loaded texture for tiled PBR use. */
function configurePBRTexture(tex, colorSpace) {
	tex.wrapS = RepeatWrapping;
	tex.wrapT = RepeatWrapping;
	tex.colorSpace = colorSpace;
	tex.needsUpdate = true;
	return tex;
}
/** Apply loaded image textures to all registered materials of a given category. */
function upgradeRegistered(category, set) {
	REGISTRY.forEach((cat, mat) => {
		if (cat !== category) return;
		switch (category) {
			case "sand":
				if (set.color) mat.map = set.color;
				if (set.normal) {
					mat.normalMap = set.normal;
					mat.normalScale = new Vector2(.7, .7);
				}
				if (set.roughness) mat.roughnessMap = set.roughness;
				break;
			case "rock":
				if (set.color) mat.map = set.color;
				if (set.normal) {
					mat.normalMap = set.normal;
					mat.normalScale = new Vector2(.8, .8);
				}
				if (set.roughness) mat.roughnessMap = set.roughness;
				break;
			case "palm-bark":
				if (set.color) mat.map = set.color;
				if (set.roughness) mat.roughnessMap = set.roughness;
				if (set.normal) {
					mat.normalMap = set.normal;
					mat.normalScale = new Vector2(.55, .55);
					mat.bumpMap = null;
					mat.bumpScale = 1;
				}
				break;
			case "frond":
				if (set.color) {
					mat.map = set.color;
					mat.transparent = true;
					mat.alphaTest = .05;
					mat.alphaMap = set.color;
				}
				break;
			case "water":
				if (set.color) mat.map = set.color;
				if (set.normal) {
					mat.normalMap = set.normal;
					mat.normalScale = new Vector2(.8, .8);
				}
				if (set.roughness) mat.roughnessMap = set.roughness;
				if (mat.roughness > .3) mat.roughness = .22;
				break;
			case "crate":
				if (set.color) mat.map = set.color;
				if (set.roughness) mat.roughnessMap = set.roughness;
				break;
		}
		mat.needsUpdate = true;
	});
}
/** Load a single texture family's image set via THREE.TextureLoader. */
function loadImageSet(stem, category) {
	if (!hasCanvas$1()) return;
	const loader = new TextureLoader();
	const basePath = `${TEXTURE_PATH}-${stem}`;
	const set = {};
	let pending = 3;
	function onDone() {
		pending--;
		if (pending === 0) {
			_imageSets[category] = set;
			upgradeRegistered(category, set);
		}
	}
	loader.load(`${basePath}.png`, (tex) => {
		set.color = configurePBRTexture(tex, SRGBColorSpace);
		onDone();
	}, void 0, () => onDone());
	loader.load(`${basePath}-normal.png`, (tex) => {
		set.normal = configurePBRTexture(tex, "");
		onDone();
	}, void 0, () => onDone());
	loader.load(`${basePath}-roughness.png`, (tex) => {
		set.roughness = configurePBRTexture(tex, "");
		onDone();
	}, void 0, () => onDone());
}
/** Initiate async loading of all 6 image texture sets. */
function loadAllImageTextures() {
	if (_imageLoaderInitiated) return;
	_imageLoaderInitiated = true;
	if (!hasCanvas$1()) return;
	loadImageSet("sand", "sand");
	loadImageSet("rock", "rock");
	loadImageSet("bark", "palm-bark");
	loadImageSet("frond", "frond");
	loadImageSet("water", "water");
	loadImageSet("crate", "crate");
}
function augmentProcedural(mat, category) {
	if (!(mat instanceof MeshStandardMaterial)) return;
	switch (category) {
		case "sand":
			if (!mat.map && _sandColor) mat.map = _sandColor;
			if (!mat.normalMap && _sandNormal) {
				mat.normalMap = _sandNormal;
				mat.normalScale = new Vector2(.7, .7);
			}
			if (!mat.roughnessMap && _sandRoughness) mat.roughnessMap = _sandRoughness;
			break;
		case "rock":
			if (!mat.map && _rockColor) mat.map = _rockColor;
			if (!mat.normalMap && _rockNormal) {
				mat.normalMap = _rockNormal;
				mat.normalScale = new Vector2(.8, .8);
			}
			if (!mat.roughnessMap && _rockRoughness) mat.roughnessMap = _rockRoughness;
			break;
		case "palm-bark":
			if (!mat.map && _barkColor) mat.map = _barkColor;
			if (!mat.roughnessMap && _barkRoughness) mat.roughnessMap = _barkRoughness;
			if (!mat.normalMap && _barkNormal) {
				mat.normalMap = _barkNormal;
				mat.normalScale = new Vector2(.5, .5);
				mat.bumpMap = null;
				mat.bumpScale = 1;
			} else if (!mat.normalMap && !mat.bumpMap && _barkBump) {
				mat.bumpMap = _barkBump;
				mat.bumpScale = .04;
			}
			break;
		case "frond":
			if (_frondAlpha) {
				mat.alphaMap = _frondAlpha;
				mat.transparent = true;
				mat.alphaTest = .1;
				mat.needsUpdate = true;
			}
			break;
		case "water":
			if (!mat.map && _waterColor) mat.map = _waterColor;
			if (!mat.normalMap && _waterNormal) {
				mat.normalMap = _waterNormal;
				mat.normalScale = new Vector2(.8, .8);
				if (mat.roughness > .3) mat.roughness = .22;
			}
			break;
		case "crate":
			if (!mat.map && _crateColor) mat.map = _crateColor;
			if (!mat.roughnessMap && _crateRoughness) mat.roughnessMap = _crateRoughness;
			break;
	}
	mat.needsUpdate = true;
}
function applyFarcrysisTextures(root) {
	ensureTextures();
	if (_textureCount === 0) return;
	root.traverse((obj) => {
		if (!(obj instanceof Mesh)) return;
		const mesh = obj;
		if (!mesh.geometry.getAttribute("uv")) return;
		const category = classifyMesh(mesh);
		if (!category) return;
		const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		for (const mat of materials) {
			augmentProcedural(mat, category);
			if (mat instanceof MeshStandardMaterial) REGISTRY.set(mat, category);
		}
	});
	loadAllImageTextures();
}
//#endregion
//#region src/farcrysis-atmosphere.ts
/**
* farcrysis-atmosphere.ts — Pass 69 atmospheric polish module.
*
* Adds CPU-driven atmospheric effects to the golden-hour jungle/beach arena:
*   - God-ray cone shafts (MeshBasicMaterial, additive)
*   - Dust motes (CPU-position-updated Points, circular motion in sunbeams)
*   - Fireflies (jungle mid-ring, bobbing + drift, opacity pulse)
*   - Enhanced ground fog layer (warm golden-hour haze plane)
*
* Presentation only — no colliders, gameplay authority, or physics.
* All original art; no Far Cry IP.
* Mounted from farcrysis-art.ts at the end of applyFarcrysisArtwork.
*/
var ATMOS_SUN_DIR = new Vector3(35, 25, -10).clone().normalize();
/**
* Sky-dome sun disk placement — matches the live golden-hour directional light
* (farcrysis-art.ts sun at (-18, 22, 25)) so the disk sits in the sky where the
* light actually comes from. Parked inside the 180–200 m sky dome.
*/
var ATMOS_SUN_DISK_DIR = new Vector3(-18, 22, 25).normalize();
var ATMOS_SUN_DISK_DIST = 165;
var ATMOS_SHAFT_COUNT = 7;
var _dustPoints = null;
var _dustOrigins = null;
var _dustPhases = null;
var _dustRadii = null;
var _dustHeightOffsets = null;
var _fireflyPoints = null;
var _fireflyPhases = null;
var _fireflyDriftAngles = null;
var _fireflyBase = null;
var _sunDiskGroup = null;
var _sunHaloMesh = null;
var _shaftGroup = null;
var _shaftMeshes = [];
var _shaftBaseOpacities = [];
var _shaftPhases = [];
var _shaftSpeeds = [];
var _shaftOrigins = [];
function buildSunDisk() {
	const group = new Group();
	group.name = "farcrysis-atmos-sun-disk";
	group.userData.farcrysisArt = true;
	group.frustumCulled = false;
	const center = ATMOS_SUN_DISK_DIR.clone().multiplyScalar(ATMOS_SUN_DISK_DIST);
	const core = new Mesh(new CircleGeometry(3.2, 32), new MeshBasicMaterial({
		color: 16775392,
		fog: false,
		depthWrite: false,
		side: 2
	}));
	core.name = "farcrysis-atmos-sun-disk-core";
	core.userData.farcrysisArt = true;
	const halo = new Mesh(new CircleGeometry(6.8, 32), new MeshBasicMaterial({
		color: 16764032,
		transparent: true,
		opacity: .35,
		blending: 2,
		fog: false,
		depthWrite: false,
		side: 2
	}));
	halo.name = "farcrysis-atmos-sun-disk-halo";
	halo.userData.farcrysisArt = true;
	const glow = new Mesh(new CircleGeometry(14, 40), new MeshBasicMaterial({
		color: 16751178,
		transparent: true,
		opacity: .14,
		blending: 2,
		fog: false,
		depthWrite: false,
		side: 2
	}));
	glow.name = "farcrysis-atmos-sun-disk-glow";
	glow.userData.farcrysisArt = true;
	for (const part of [
		core,
		halo,
		glow
	]) {
		part.position.copy(center);
		part.lookAt(0, 0, 0);
	}
	group.add(core, halo, glow);
	_sunHaloMesh = halo;
	return group;
}
function buildGodRayShafts() {
	const group = new Group();
	group.name = "farcrysis-atmos-god-ray-shafts";
	group.userData.farcrysisArt = true;
	_shaftMeshes.length = 0;
	_shaftBaseOpacities.length = 0;
	_shaftPhases.length = 0;
	_shaftSpeeds.length = 0;
	_shaftOrigins.length = 0;
	const up = new Vector3(0, 1, 0);
	const sunDir = ATMOS_SUN_DISK_DIR.clone();
	for (let i = 0; i < ATMOS_SHAFT_COUNT; i++) {
		const ox = (Math.random() - .5) * 36;
		const oz = (Math.random() - .5) * 36;
		const origin = new Vector3(Math.max(FARCRYSIS_BOUNDS.minX + 2, Math.min(FARCRYSIS_BOUNDS.maxX - 2, ox)), 3 + Math.random() * 9, Math.max(FARCRYSIS_BOUNDS.minZ + 2, Math.min(FARCRYSIS_BOUNDS.maxZ - 2, oz)));
		const length = 26 + Math.random() * 16;
		const width = 1.6 + Math.random() * 1.6;
		const axis = sunDir.clone().add(new Vector3((Math.random() - .5) * .1, (Math.random() - .5) * .1, (Math.random() - .5) * .1)).normalize();
		const shaftGeometry = new PlaneGeometry(width, length, 1, 6);
		const shaftPosition = shaftGeometry.getAttribute("position");
		const shaftColors = new Float32Array(shaftPosition.count * 3);
		for (let vertex = 0; vertex < shaftPosition.count; vertex += 1) {
			const along = Math.abs(shaftPosition.getY(vertex)) / (length / 2);
			const fade = Math.max(0, 1 - along * along);
			shaftColors[vertex * 3] = fade;
			shaftColors[vertex * 3 + 1] = fade;
			shaftColors[vertex * 3 + 2] = fade;
		}
		shaftGeometry.setAttribute("color", new BufferAttribute(shaftColors, 3));
		const quad = new Mesh(shaftGeometry, new MeshBasicMaterial({
			color: 16772288,
			vertexColors: true,
			transparent: true,
			opacity: .02 + Math.random() * .015,
			blending: 2,
			depthWrite: false,
			depthTest: true,
			side: 2,
			fog: false
		}));
		quad.name = `farcrysis-atmos-god-ray-shaft-${i}`;
		quad.position.copy(origin);
		quad.setRotationFromQuaternion(new Quaternion().setFromUnitVectors(up, axis));
		quad.rotateY(Math.random() * Math.PI * 2);
		quad.renderOrder = 997;
		quad.frustumCulled = false;
		quad.userData.farcrysisArt = true;
		group.add(quad);
		_shaftMeshes.push(quad);
		_shaftBaseOpacities.push(quad.material.opacity);
		_shaftPhases.push(Math.random() * Math.PI * 2);
		_shaftSpeeds.push(.5 + Math.random() * .7);
		_shaftOrigins.push(origin.clone());
	}
	return group;
}
/**
* A soft round dot, used as the sprite for every point cloud in this arena.
*
* An untextured PointsMaterial draws each point as a hard-edged SQUARE. At dust
* and firefly scale against a bright sky that reads exactly as what it is -
* white squares pasted over the horizon - and it was the most conspicuous
* artefact left in the arena after the sky was fixed.
*
* The texture is a radial falloff built as a DataTexture rather than through a
* 2D canvas: canvas is unavailable in the test environment, and a 32x32 ramp is
* cheaper to synthesise than to rasterise. Under additive blending black is
* transparent, so the falloff alone produces a soft dot with no alpha test and
* no sorting cost.
*/
var _softDotTexture = null;
function softDotTexture() {
	if (_softDotTexture) return _softDotTexture;
	const size = 32;
	const data = new Uint8Array(size * size * 4);
	const centre = (size - 1) / 2;
	for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
		const distance = Math.hypot(x - centre, y - centre) / centre;
		const intensity = Math.max(0, 1 - distance);
		const value = Math.round(intensity * intensity * 255);
		const offset = (y * size + x) * 4;
		data[offset] = 255;
		data[offset + 1] = 255;
		data[offset + 2] = 255;
		data[offset + 3] = value;
	}
	const texture = new DataTexture(data, size, size, RGBAFormat);
	texture.name = "farcrysis-soft-dot";
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearFilter;
	texture.needsUpdate = true;
	_softDotTexture = texture;
	return texture;
}
/** Seeded PRNG (mulberry32 — the arena-wide idiom) for stable atmosphere. */
function mulberry32$4(seed) {
	let s = seed | 0;
	return () => {
		s = s + 1831565813 | 0;
		let t = Math.imul(s ^ s >>> 15, 1 | s);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
function buildDustMotes() {
	const count = 60;
	const rng = mulberry32$4(53335);
	const positions = new Float32Array(count * 3);
	const origins = new Float32Array(count * 3);
	const phases = new Float32Array(count);
	const radii = new Float32Array(count);
	const heightOffsets = new Float32Array(count);
	const sunAxis = ATMOS_SUN_DIR.clone();
	const perp1 = new Vector3(-sunAxis.z, 0, sunAxis.x).normalize();
	if (perp1.lengthSq() < .1) perp1.set(0, 1, 0);
	const perp2 = new Vector3().crossVectors(sunAxis, perp1).normalize();
	const cylinderRadius = 18;
	const cylinderHalfLen = 28;
	const midpoint = new Vector3(0, 5, 0);
	for (let i = 0; i < count; i++) {
		const r = rng() * cylinderRadius;
		const angle = rng() * Math.PI * 2;
		const along = (rng() - .5) * cylinderHalfLen * 2;
		const px = midpoint.x + perp1.x * Math.cos(angle) * r + perp2.x * Math.sin(angle) * r + sunAxis.x * along;
		const py = midpoint.y + perp1.y * Math.cos(angle) * r + perp2.y * Math.sin(angle) * r + sunAxis.y * along;
		const pz = midpoint.z + perp1.z * Math.cos(angle) * r + perp2.z * Math.sin(angle) * r + sunAxis.z * along;
		const cx = Math.max(FARCRYSIS_BOUNDS.minX, Math.min(FARCRYSIS_BOUNDS.maxX, px));
		const cy = Math.max(.2, Math.min(14, py));
		const cz = Math.max(FARCRYSIS_BOUNDS.minZ, Math.min(FARCRYSIS_BOUNDS.maxZ, pz));
		origins[i * 3 + 0] = cx;
		origins[i * 3 + 1] = cy;
		origins[i * 3 + 2] = cz;
		positions[i * 3 + 0] = cx;
		positions[i * 3 + 1] = cy;
		positions[i * 3 + 2] = cz;
		phases[i] = rng() * Math.PI * 2;
		radii[i] = .3 + rng() * 2.5;
		heightOffsets[i] = (rng() - .5) * 2;
	}
	const geom = new BufferGeometry();
	geom.setAttribute("position", new BufferAttribute(positions, 3));
	const points = new Points(geom, new PointsMaterial({
		color: 16772829,
		size: .04,
		map: softDotTexture(),
		transparent: true,
		opacity: .16,
		blending: 2,
		depthWrite: false
	}));
	points.name = "farcrysis-atmos-dust";
	points.userData.farcrysisArt = true;
	points.frustumCulled = false;
	points.renderOrder = 999;
	_dustPoints = points;
	_dustOrigins = origins;
	_dustPhases = phases;
	_dustRadii = radii;
	_dustHeightOffsets = heightOffsets;
	return points;
}
function buildFireflies() {
	const count = 50;
	const positions = new Float32Array(count * 3);
	const base = new Float32Array(count * 3);
	const phases = new Float32Array(count);
	const driftAngles = new Float32Array(count);
	const { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;
	for (let i = 0; i < count; i++) {
		const angle = Math.random() * Math.PI * 2;
		const radius = 8 + Math.random() * 10;
		let px = Math.cos(angle) * radius;
		let pz = Math.sin(angle) * radius;
		px = Math.max(minX + 2, Math.min(maxX - 2, px));
		pz = Math.max(minZ + 2, Math.min(maxZ - 2, pz));
		const py = 1 + Math.random() * 3;
		positions[i * 3 + 0] = px;
		positions[i * 3 + 1] = py;
		positions[i * 3 + 2] = pz;
		base[i * 3 + 0] = px;
		base[i * 3 + 1] = py;
		base[i * 3 + 2] = pz;
		phases[i] = Math.random() * Math.PI * 2;
		driftAngles[i] = Math.random() * Math.PI * 2;
	}
	const geom = new BufferGeometry();
	geom.setAttribute("position", new BufferAttribute(positions, 3));
	const points = new Points(geom, new PointsMaterial({
		color: 13434760,
		size: .14,
		map: softDotTexture(),
		transparent: true,
		opacity: .4,
		blending: 2,
		depthWrite: false
	}));
	points.name = "farcrysis-atmos-fireflies";
	points.userData.farcrysisArt = true;
	points.frustumCulled = false;
	points.renderOrder = 1001;
	_fireflyPoints = points;
	_fireflyPhases = phases;
	_fireflyDriftAngles = driftAngles;
	_fireflyBase = base;
	return points;
}
function buildFogLayer() {
	const geom = new PlaneGeometry(80, 80);
	geom.rotateX(-Math.PI / 2);
	const plane = new Mesh(geom, new MeshBasicMaterial({
		color: 14478034,
		transparent: true,
		opacity: .05,
		blending: 2,
		depthWrite: false,
		side: 2
	}));
	plane.name = "farcrysis-atmos-fog";
	plane.position.y = 1;
	plane.renderOrder = 4;
	plane.frustumCulled = false;
	plane.userData.farcrysisArt = true;
	return plane;
}
/**
* Build and add all atmospheric polish objects to the scene.
* Safe to call after terrain, lighting, and vegetation are established.
*/
function buildAtmosphere(scene) {
	scene.add(buildDustMotes());
	scene.add(buildFireflies());
	scene.add(buildFogLayer());
	_sunDiskGroup = buildSunDisk();
	scene.add(_sunDiskGroup);
	_shaftGroup = buildGodRayShafts();
	scene.add(_shaftGroup);
}
/**
* Per-frame animation driver for atmosphere effects.
* @param time Current time in seconds (e.g. `performance.now() * 0.001`).
*/
function animateAtmosphere(time) {
	if (_dustPoints && _dustOrigins && _dustPhases && _dustRadii && _dustHeightOffsets) {
		const posAttr = _dustPoints.geometry.attributes.position;
		const positions = posAttr.array;
		const count = _dustPhases.length;
		for (let i = 0; i < count; i++) {
			const phase = _dustPhases[i] + time * .55;
			const r = _dustRadii[i];
			const ox = _dustOrigins[i * 3 + 0];
			const oy = _dustOrigins[i * 3 + 1];
			const oz = _dustOrigins[i * 3 + 2];
			positions[i * 3 + 0] = ox + Math.sin(phase) * r;
			positions[i * 3 + 1] = oy + Math.cos(phase * 1.3) * r * .45 + Math.sin(phase * .65) * _dustHeightOffsets[i];
			positions[i * 3 + 2] = oz + Math.cos(phase) * r;
		}
		posAttr.needsUpdate = true;
	}
	if (_fireflyPoints && _fireflyPhases && _fireflyDriftAngles && _fireflyBase) {
		const posAttr = _fireflyPoints.geometry.attributes.position;
		const positions = posAttr.array;
		const count = _fireflyPhases.length;
		for (let i = 0; i < count; i++) {
			const phase = _fireflyPhases[i];
			const drift = _fireflyDriftAngles[i];
			positions[i * 3 + 0] = _fireflyBase[i * 3 + 0] + Math.sin(time * .3 + drift) * .55;
			positions[i * 3 + 1] = _fireflyBase[i * 3 + 1] + Math.sin(time * .75 + phase) * .35;
			positions[i * 3 + 2] = _fireflyBase[i * 3 + 2] + Math.cos(time * .33 + drift) * .55;
		}
		posAttr.needsUpdate = true;
		const mat = _fireflyPoints.material;
		mat.opacity = .18 + .22 * (.5 + .5 * Math.sin(time * 2.3 + .7));
	}
	if (_sunHaloMesh) {
		_sunHaloMesh.scale.setScalar(1 + Math.sin(time * .5) * .06);
		const haloMat = _sunHaloMesh.material;
		haloMat.opacity = .3 + Math.sin(time * .7 + 1.2) * .08;
	}
	if (_shaftGroup) {
		_shaftGroup.rotation.y = Math.sin(time * .03 + 1.3) * .07;
		_shaftGroup.rotation.x = Math.cos(time * .025 + .6) * .035;
	}
	for (let i = 0; i < _shaftMeshes.length; i++) {
		const quad = _shaftMeshes[i];
		const shaftMat = quad.material;
		const pulse = .72 + .28 * Math.sin(time * _shaftSpeeds[i] + _shaftPhases[i]);
		shaftMat.opacity = Math.max(.01, _shaftBaseOpacities[i] * pulse);
		quad.position.copy(_shaftOrigins[i]).addScaledVector(ATMOS_SUN_DISK_DIR, Math.sin(time * .12 + _shaftPhases[i] * 2) * 1.4);
	}
}
//#endregion
//#region src/farcrysis-vista.ts
/**
* farcrysis-vista.ts — Pass 69 ocean-horizon vista (sub-agent A).
*
* Golden-hour open-ocean backdrop for the Farcrysis arena:
*   - A 512×512 ocean water plane that fills the horizon far beyond the
*     64×64 play arena (the lagoon water in farcrysis-terrain.ts covers the
*     centre; this plane extends the water table outward to the sky dome).
*   - Five distant low-poly island silhouettes (volcanic cone + jungle-dome
*     clusters) at 80–150 m from centre, tinted to sit inside the warm haze.
*   - Eighteen animated seabird points orbiting the beach/ocean at 12–28 m,
*     driven per-frame by animateVista(timeSeconds).
*
* Presentation only — no colliders, spawn points, navigation or gameplay
* authority. Every mesh is tagged userData.farcrysisArt = true.
* Deterministic: fixed-seed mulberry32 only, no Math.random.
*
* Exports:
*   applyVista(scene)              — adds ocean plane, islands and birds
*   animateVista(timeSeconds)      — per-frame bird orbit update (safe no-op
*                                    before applyVista has run, idempotent)
*/
/**
* Ocean plane height. The lagoon water in farcrysis-terrain.ts sits at
* y = -0.3 and its vertex-shader waves displace the surface by up to ±0.29
* (trough ≈ -0.59). The open-ocean plane is placed just below that trough so
* the two water surfaces never intersect (no z-fighting on the 76×76 lagoon
* overlap zone) while still reading as the same water table.
*/
var OCEAN_Y = -.62;
var OCEAN_SIZE = 512;
var OCEAN_COLOR = 2060422;
var OCEAN_ROUGHNESS = .3;
var OCEAN_METALNESS = .05;
var OCEAN_EMISSIVE = 5580303;
var OCEAN_EMISSIVE_INTENSITY = .1;
/** Horizontal sun azimuth — matches the golden-hour light at (-18, 22, 25). */
var SUN_AZIMUTH = new Vector3(-18, 0, 25).normalize();
/**
* Distant jungle-ridge green. Pass 76: darkened — under the daylight grade
* the old 0x4a6a5a lit up near-white and the islands read as icebergs; a
* deeper green lets the (retuned) fog supply the haze instead.
*/
var ISLAND_HAZE_COLOR = 3559999;
/** Low-poly island silhouette facets (shore apron; ridges use 9 radial). */
var ISLAND_RADIAL_SEGMENTS = 8;
/** Five island centres, 143–150 m out, spread around the compass. */
var ISLAND_POSITIONS = [
	[
		-118,
		0,
		-92
	],
	[
		120,
		0,
		-88
	],
	[
		38,
		0,
		138
	],
	[
		-96,
		0,
		108
	],
	[
		142,
		0,
		38
	]
];
var BIRD_COUNT = 18;
var BIRD_WHITE = 16052712;
var BIRD_DARK = 3026480;
function mulberry32$3(seed) {
	return () => {
		seed |= 0;
		seed = seed + 1831565813 | 0;
		let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
var birds = null;
var vistaApplied = false;
var _glitterPath = null;
function buildOcean(scene) {
	const geometry = new PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, 1, 1);
	geometry.rotateX(-Math.PI / 2);
	const ocean = new Mesh(geometry, new MeshStandardMaterial({
		color: OCEAN_COLOR,
		roughness: OCEAN_ROUGHNESS,
		metalness: OCEAN_METALNESS,
		emissive: OCEAN_EMISSIVE,
		emissiveIntensity: OCEAN_EMISSIVE_INTENSITY
	}));
	ocean.name = "farcrysis-vista-ocean";
	ocean.position.y = OCEAN_Y;
	ocean.castShadow = false;
	ocean.receiveShadow = true;
	ocean.userData.farcrysisArt = true;
	scene.add(ocean);
}
/**
* Two additive warm glow rings straddling the horizon circle (the sky dome is
* ~180 m out) so the sunset colour sits right where the ocean meets the sky.
*/
function buildSunsetHorizonGlow(scene) {
	const wideGeom = new RingGeometry(168, 194, 96);
	wideGeom.rotateX(-Math.PI / 2);
	const wide = new Mesh(wideGeom, new MeshBasicMaterial({
		color: 16748351,
		transparent: true,
		opacity: .1,
		blending: 2,
		depthWrite: false,
		fog: false,
		side: 2
	}));
	wide.name = "farcrysis-vista-horizon-glow-wide";
	wide.position.y = -.5;
	wide.renderOrder = 2;
	wide.userData.farcrysisArt = true;
	scene.add(wide);
	const bandGeom = new RingGeometry(178, 186, 96);
	bandGeom.rotateX(-Math.PI / 2);
	const band = new Mesh(bandGeom, new MeshBasicMaterial({
		color: 16757865,
		transparent: true,
		opacity: .2,
		blending: 2,
		depthWrite: false,
		fog: false,
		side: 2
	}));
	band.name = "farcrysis-vista-horizon-glow-band";
	band.position.y = -.55;
	band.renderOrder = 2;
	band.userData.farcrysisArt = true;
	scene.add(band);
}
/**
* Canvas streak texture for the sun glitter path — bright and wide at the
* horizon end, tapering to a faint point toward the viewer.
*/
function createGlitterCanvas() {
	try {
		if (typeof document === "undefined") return null;
		const w = 128;
		const h = 512;
		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		const rng = mulberry32$3(165746643);
		ctx.clearRect(0, 0, w, h);
		for (let py = 0; py < h; py++) {
			const t = py / (h - 1);
			const intensity = Math.exp(-((t * 5.5) ** 2)) * .85 + Math.exp(-((t * 12) ** 2)) * .25;
			if (intensity <= .01) continue;
			const halfW = Math.max(1, w * .5 * (1 - .88 * t));
			ctx.fillStyle = `rgba(255, 205, 140, ${intensity})`;
			ctx.fillRect(w * .5 - halfW, py, halfW * 2, 1);
		}
		for (let i = 0; i < 260; i++) {
			const sx = rng() * w;
			const sy = rng() * h * .5;
			ctx.fillStyle = `rgba(255, 236, 200, ${.1 + rng() * .35})`;
			ctx.beginPath();
			ctx.arc(sx, sy, .6 + rng() * 1.6, 0, Math.PI * 2);
			ctx.fill();
		}
		return canvas;
	} catch {
		return null;
	}
}
/**
* Sun glitter path — a long additive quad lying on the open ocean, aimed at
* the sun azimuth, from just beyond the lagoon out to the horizon.
*/
function buildSunGlitterPath(scene) {
	const canvas = createGlitterCanvas();
	if (!canvas) return;
	const tex = new CanvasTexture(canvas);
	tex.colorSpace = SRGBColorSpace;
	tex.needsUpdate = true;
	const geom = new PlaneGeometry(18, 260, 1, 12);
	geom.rotateX(-Math.PI / 2);
	const path = new Mesh(geom, new MeshBasicMaterial({
		map: tex,
		transparent: true,
		opacity: .5,
		blending: 2,
		depthWrite: false,
		depthTest: true,
		side: 2,
		fog: false
	}));
	path.name = "farcrysis-vista-sun-glitter-path";
	path.position.copy(SUN_AZIMUTH.clone().multiplyScalar(115));
	path.position.y = -.6;
	path.rotation.y = Math.atan2(-SUN_AZIMUTH.x, -SUN_AZIMUTH.z);
	path.renderOrder = 3;
	path.frustumCulled = false;
	path.userData.farcrysisArt = true;
	scene.add(path);
	_glitterPath = path;
}
/**
* Position-hashed radial displacement (deterministic, watertight — duplicated
* seam vertices share identical offsets because only position feeds the hash).
* Local copy: the vegetation module's lumpify would be an awkward import here.
*/
function ridgeDisplace(geometry, amplitude, salt) {
	const pos = geometry.getAttribute("position");
	for (let i = 0; i < pos.count; i += 1) {
		const x = pos.getX(i);
		const y = pos.getY(i);
		const z = pos.getZ(i);
		const len = Math.sqrt(x * x + z * z);
		if (len < 1e-5) continue;
		const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + salt * 94.673) * 43758.5453;
		const d = (n - Math.floor(n) - .5) * 2 * amplitude;
		pos.setX(i, x + x / len * d);
		pos.setZ(i, z + z / len * d);
	}
	pos.needsUpdate = true;
	geometry.computeVertexNormals();
	return geometry;
}
function buildIsland(scene, index, position, islandMat) {
	const rng = mulberry32$3(62661 + index * 7919);
	const s = .85 + rng() * .4;
	const baseRadius = (14 + rng() * 10) * s;
	const baseHeight = (4 + rng() * 4) * s;
	const baseTopY = -1.6;
	const group = new Group();
	group.name = `farcrysis-vista-island-${index}`;
	group.position.set(position[0], position[1], position[2]);
	group.userData.farcrysisArt = true;
	const massCount = 3 + Math.floor(rng() * 3);
	for (let massIndex = 0; massIndex < massCount; massIndex++) {
		const isMain = massIndex === 0;
		const peakHeight = isMain ? (16 + rng() * 12) * s : (5 + rng() * 9) * s;
		const peakRadius = (isMain ? 7 + rng() * 6 : 5 + rng() * 7) * s;
		const offX = isMain ? 0 : (rng() - .5) * baseRadius * 1.3;
		const offZ = isMain ? 0 : (rng() - .5) * baseRadius * 1.3;
		const ridge = new Mesh(ridgeDisplace(new ConeGeometry(peakRadius, peakHeight, 9, 3), peakRadius * .24, index * 31 + massIndex * 7), islandMat);
		ridge.scale.set(1.25 + rng() * .7, 1, .75 + rng() * .3);
		ridge.rotation.y = rng() * Math.PI;
		ridge.position.set(offX, baseTopY + peakHeight / 2 - .6 * s, offZ);
		ridge.castShadow = true;
		ridge.receiveShadow = true;
		ridge.userData.farcrysisArt = true;
		group.add(ridge);
	}
	const apron = new Mesh(ridgeDisplace(new ConeGeometry(baseRadius, baseHeight, ISLAND_RADIAL_SEGMENTS, 2), baseRadius * .18, index * 53 + 11), islandMat);
	apron.position.y = baseTopY - baseHeight / 2;
	apron.castShadow = true;
	apron.receiveShadow = true;
	apron.userData.farcrysisArt = true;
	group.add(apron);
	scene.add(group);
}
function buildIslands(scene) {
	const islandMat = new MeshStandardMaterial({
		color: ISLAND_HAZE_COLOR,
		roughness: .95,
		metalness: 0,
		flatShading: true
	});
	for (let i = 0; i < ISLAND_POSITIONS.length; i++) buildIsland(scene, i, ISLAND_POSITIONS[i], islandMat);
}
function buildBirds(scene) {
	const rng = mulberry32$3(45525);
	const count = BIRD_COUNT;
	const cx = new Float32Array(count);
	const cz = new Float32Array(count);
	const radius = new Float32Array(count);
	const speed = new Float32Array(count);
	const phase = new Float32Array(count);
	const yBase = new Float32Array(count);
	const yAmp = new Float32Array(count);
	const bobSpeed = new Float32Array(count);
	const positions = new Float32Array(count * 3);
	const colors = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		cx[i] = (rng() - .5) * 90;
		cz[i] = (rng() - .5) * 90;
		radius[i] = 16 + rng() * 36;
		speed[i] = .08 + rng() * .14;
		phase[i] = rng() * Math.PI * 2;
		yBase[i] = 12 + rng() * 16;
		yAmp[i] = 1.5 + rng() * 2.5;
		bobSpeed[i] = .4 + rng() * .5;
		const birdColor = rng() < .7 ? BIRD_WHITE : BIRD_DARK;
		colors[i * 3 + 0] = (birdColor >> 16 & 255) / 255;
		colors[i * 3 + 1] = (birdColor >> 8 & 255) / 255;
		colors[i * 3 + 2] = (birdColor & 255) / 255;
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new BufferAttribute(positions, 3));
	geometry.setAttribute("color", new BufferAttribute(colors, 3));
	const points = new Points(geometry, new PointsMaterial({
		size: .9,
		sizeAttenuation: true,
		map: softDotTexture(),
		alphaTest: .12,
		vertexColors: true,
		transparent: true,
		opacity: .8,
		depthWrite: false
	}));
	points.name = "farcrysis-vista-birds";
	points.renderOrder = 3;
	points.userData.farcrysisArt = true;
	scene.add(points);
	birds = {
		points,
		count,
		cx,
		cz,
		radius,
		speed,
		phase,
		yBase,
		yAmp,
		bobSpeed,
		positions
	};
	updateBirdPositions(0);
}
function updateBirdPositions(t) {
	const b = birds;
	if (!b) return;
	const { count, cx, cz, radius, speed, phase, yBase, yAmp, bobSpeed, positions } = b;
	for (let i = 0; i < count; i++) {
		const angle = t * speed[i] + phase[i];
		positions[i * 3 + 0] = cx[i] + Math.cos(angle) * radius[i];
		positions[i * 3 + 1] = yBase[i] + Math.sin(t * bobSpeed[i] + phase[i] * 2.1) * yAmp[i];
		positions[i * 3 + 2] = cz[i] + Math.sin(angle) * radius[i];
	}
	b.points.geometry.attributes.position.needsUpdate = true;
}
/** Add the ocean horizon plane, distant island silhouettes and seabirds. */
function applyVista(scene) {
	if (vistaApplied) return;
	vistaApplied = true;
	buildOcean(scene);
	buildIslands(scene);
	buildBirds(scene);
	buildSunsetHorizonGlow(scene);
	buildSunGlitterPath(scene);
}
/** Per-frame driver: orbit the seabirds. Safe no-op before applyVista. */
function animateVista(timeSeconds) {
	updateBirdPositions(timeSeconds);
	if (_glitterPath) {
		const mat = _glitterPath.material;
		mat.opacity = .42 + Math.sin(timeSeconds * .55) * .1;
	}
}
//#endregion
//#region src/farcrysis-ground-textures.ts
/**
* farcrysis-ground-textures.ts — procedural canvas-based ground textures for
* the Farcrysis arena floor plates (Pass 69 re-authored art layer).
*
* Generates tiling textures entirely in code — no external assets:
*   - sand:      warm golden beach sand (FARCRYSIS_ART_FEEL.beachSand) with
*                per-pixel grain (±8% per channel) and faint horizontal
*                wind-ripple banding
*   - wetSand:   the same sand darkened to 70% brightness for the waterline
*   - earth:     dark brown-green soil with broad mottling + pebble specks
*   - roughness: 256×256 noise height field for micro-surface detail
*
* Exports:
*   generateSandTextures(): FarcrysisGroundTextures
*   applyGroundTextures(scene: THREE.Scene): void
*   FARCRYSIS_GROUND_TEXTURE_STATS(): { generated: boolean; textureCount: number }
*
* Mesh-name contract (matches buildFarcrysis in farcrysis.ts):
*   'farcrysis-ground-plate' → sand texture,  roughness 0.85
*   'farcrysis-beach-ring'   → wet sand,      roughness 0.60
*   'farcrysis-jungle-floor' → earth texture, roughness 0.90
*
* Presentation only — never adds colliders, spawns, or gameplay authority.
* The Canvas API is browser-only: in headless/test environments the
* generators return null textures and applyGroundTextures() no-ops safely.
*/
var GROUND_PLATE = "farcrysis-ground-plate";
var BEACH_RING = "farcrysis-beach-ring";
var JUNGLE_FLOOR = "farcrysis-jungle-floor";
function hasCanvas() {
	return typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined" && typeof document.createElement === "function";
}
/** Create a blank canvas; returns null in test/headless environments. */
function makeCanvas(width, height) {
	if (!hasCanvas()) return null;
	try {
		const c = document.createElement("canvas");
		c.width = width;
		c.height = height;
		return c;
	} catch {
		return null;
	}
}
function mulberry32$2(seed) {
	let s = seed | 0;
	return () => {
		s = s + 1831565813 | 0;
		let t = Math.imul(s ^ s >>> 15, 1 | s);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
function hash2(ix, iy, seed) {
	let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177) | 0;
	h = Math.imul(h ^ h >>> 13, 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}
function smoothNoise(x, y, seed) {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = x - ix;
	const fy = y - iy;
	const sx = fx * fx * (3 - 2 * fx);
	const sy = fy * fy * (3 - 2 * fy);
	const a = hash2(ix, iy, seed);
	const b = hash2(ix + 1, iy, seed);
	const c = hash2(ix, iy + 1, seed);
	const d = hash2(ix + 1, iy + 1, seed);
	return a + sx * (b - a) + sy * (c + sx * (d - c) - a - sx * (b - a));
}
/** Fractal (multi-octave) value noise, output in [0, 1]. */
function fbmNoise(x, y, octaves, seed) {
	let value = 0;
	let amplitude = 1;
	let freq = 1;
	let max = 0;
	for (let i = 0; i < octaves; i++) {
		value += amplitude * smoothNoise(x * freq, y * freq, seed + i * 101);
		max += amplitude;
		freq *= 2;
		amplitude *= .5;
	}
	return value / max;
}
function clamp255(v) {
	return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
var SAND_SIZE = 512;
var ROUGHNESS_SIZE = 256;
var SAND_SEED = 23127;
var EARTH_SEED = 58530;
var ROUGH_SEED = 28809;
var WET_BRIGHTNESS = .7;
function fillColorMap(width, height, seed, pixel, colorSpace, repeat) {
	const canvas = makeCanvas(width, height);
	if (!canvas) return null;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const img = ctx.createImageData(width, height);
	const data = img.data;
	const rng = mulberry32$2(seed);
	for (let y = 0; y < height; y++) {
		const ny = y / height;
		for (let x = 0; x < width; x++) {
			const [r, g, b] = pixel(x / width, ny, rng);
			const i = (y * width + x) * 4;
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);
	const tex = new CanvasTexture(canvas);
	tex.wrapS = RepeatWrapping;
	tex.wrapT = RepeatWrapping;
	tex.colorSpace = colorSpace;
	tex.repeat.set(repeat, repeat);
	tex.needsUpdate = true;
	return tex;
}
/**
* Golden-sand pixel factory: palette base colour, broad tonal drift, faint
* horizontal wind-ripple bands, and ±8% per-channel grain. `brightness`
* darkens the whole swatch (used for the wet-sand variant).
*/
function sandPixel(brightness, seed) {
	const base = new Color(FARCRYSIS_ART_FEEL.beachSand);
	const baseR = base.r * 255 * brightness;
	const baseG = base.g * 255 * brightness;
	const baseB = base.b * 255 * brightness;
	return (nx, ny, rng) => {
		const drift = fbmNoise(nx * 3, ny * 3, 3, seed + 7) - .5;
		const ripplePhase = ny * 26 + Math.sin(nx * 4.2 + ny * 5) * 1.4 + fbmNoise(nx * 5, ny * 9, 3, seed + 11) * 3;
		const ripple = Math.sin(ripplePhase) * .07;
		const grainR = (rng() - .5) * .16 * 255;
		const grainG = (rng() - .5) * .16 * 255;
		const grainB = (rng() - .5) * .16 * 255;
		const scale = 1 + drift * .06 + ripple;
		return [
			clamp255(baseR * scale + grainR),
			clamp255(baseG * scale + grainG),
			clamp255(baseB * scale + grainB)
		];
	};
}
/** Dark brown-green soil: broad mottling, green-tinged patches, pebble specks. */
function earthPixel(nx, ny, rng) {
	const n = fbmNoise(nx * 8, ny * 8, 4, EARTH_SEED);
	const patch = fbmNoise(nx * 3.5, ny * 3.5, 3, 58543) - .5;
	let r = (.32 + n * .1 + patch * .06) * 255;
	let g = (.24 + n * .12 + patch * .12) * 255;
	let b = (.16 + n * .08 + patch * .05) * 255;
	if (fbmNoise(nx * 42, ny * 42, 2, 58559) > .62) {
		r *= .78;
		g *= .78;
		b *= .78;
	}
	const grain = (rng() - .5) * .06 * 255;
	return [
		clamp255(r + grain),
		clamp255(g + grain),
		clamp255(b + grain)
	];
}
/** Grayscale height-field noise for the roughness map (green channel sampled by three). */
function roughnessPixel(nx, ny, rng) {
	const n = fbmNoise(nx * 48, ny * 48, 4, ROUGH_SEED);
	const micro = (rng() - .5) * .05;
	const v = Math.min(1, Math.max(0, .82 + (n - .5) * .24 + micro));
	const c = Math.round(v * 255);
	return [
		c,
		c,
		c
	];
}
/**
* Tangent-space normal map from a tileable height field (PBR micro-relief).
* Toroidal neighbour sampling keeps gradients seamless across tile edges,
* matching the color/roughness maps' RepeatWrapping.
*/
function fillNormalMap(width, height, seed, heightFn, strength, repeat) {
	const canvas = makeCanvas(width, height);
	if (!canvas) return null;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const rng = mulberry32$2(seed);
	const field = new Float32Array(width * height);
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) field[y * width + x] = heightFn(x / width, y / height, rng);
	const img = ctx.createImageData(width, height);
	const data = img.data;
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		const i = (y * width + x) * 4;
		const xL = field[y * width + (x + width - 1) % width];
		const xR = field[y * width + (x + 1) % width];
		const yD = field[(y + height - 1) % height * width + x];
		const yU = field[(y + 1) % height * width + x];
		const gradX = (xR - xL) * strength;
		const gradY = (yU - yD) * strength;
		const len = Math.sqrt(gradX * gradX + gradY * gradY + 1);
		data[i] = clamp255(-gradX / len * 127.5 + 127.5);
		data[i + 1] = clamp255(-gradY / len * 127.5 + 127.5);
		data[i + 2] = clamp255(1 / len * 127.5 + 127.5);
		data[i + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	const tex = new CanvasTexture(canvas);
	tex.wrapS = RepeatWrapping;
	tex.wrapT = RepeatWrapping;
	tex.colorSpace = "";
	tex.repeat.set(repeat, repeat);
	tex.needsUpdate = true;
	return tex;
}
/** Sand height field: fine grain + faint wind-ripple bands (mirrors sandPixel). */
function sandHeight(nx, ny, rng) {
	const drift = fbmNoise(nx * 3, ny * 3, 3, 23144) - .5;
	const ripple = Math.sin(ny * 26 + Math.sin(nx * 4.2 + ny * 5) * 1.4) * .12;
	const grain = (rng() - .5) * .12;
	return .5 + drift * .3 + ripple + grain;
}
/** Earth height field: broad mottling + pebble bumps (mirrors earthPixel). */
function earthHeight(nx, ny, rng) {
	const n = fbmNoise(nx * 8, ny * 8, 4, 58561) - .5;
	const pebble = fbmNoise(nx * 42, ny * 42, 2, 58573) > .62 ? .35 : 0;
	const grain = (rng() - .5) * .1;
	return .5 + n * .5 + pebble + grain;
}
var _cached = null;
/**
* Generate (once, cached) the procedural ground texture set.
* Fields are null when the Canvas API is unavailable (headless/tests).
*/
function generateSandTextures() {
	if (_cached) return _cached;
	_cached = {
		sandTex: fillColorMap(SAND_SIZE, SAND_SIZE, SAND_SEED, sandPixel(1, SAND_SEED), SRGBColorSpace, 4),
		wetSandTex: fillColorMap(SAND_SIZE, SAND_SIZE, 23130, sandPixel(WET_BRIGHTNESS, 23130), SRGBColorSpace, 4),
		earthTex: fillColorMap(SAND_SIZE, SAND_SIZE, EARTH_SEED, earthPixel, SRGBColorSpace, 4),
		roughnessTex: fillColorMap(ROUGHNESS_SIZE, ROUGHNESS_SIZE, ROUGH_SEED, roughnessPixel, "", 4),
		sandNormalTex: fillNormalMap(ROUGHNESS_SIZE, ROUGHNESS_SIZE, 23218, sandHeight, 1.6, 4),
		earthNormalTex: fillNormalMap(ROUGHNESS_SIZE, ROUGHNESS_SIZE, 58601, earthHeight, 1.2, 4)
	};
	return _cached;
}
/** Map a ground mesh name to its texture + roughness contract. */
function groundSpec(name, set) {
	switch (name) {
		case GROUND_PLATE: return {
			tex: set.sandTex,
			roughness: .85,
			normalTex: set.sandNormalTex,
			normalScale: .7
		};
		case BEACH_RING: return {
			tex: set.wetSandTex,
			roughness: .6,
			normalTex: set.sandNormalTex,
			normalScale: .6
		};
		case JUNGLE_FLOOR: return {
			tex: set.earthTex,
			roughness: .9,
			normalTex: set.earthNormalTex,
			normalScale: .5
		};
		default: return null;
	}
}
/**
* Apply the procedural ground textures to the arena floor plates, matched by
* mesh name. Safe no-op when canvas generation is unavailable.
*/
function applyGroundTextures(scene) {
	const set = generateSandTextures();
	if (!set.sandTex && !set.wetSandTex && !set.earthTex) return;
	scene.traverse((obj) => {
		if (!(obj instanceof Mesh)) return;
		const spec = groundSpec(obj.name, set);
		if (!spec) return;
		const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
		for (const mat of materials) {
			if (!(mat instanceof MeshStandardMaterial)) continue;
			if (spec.tex) {
				mat.map = spec.tex;
				mat.color.set(16777215);
			}
			mat.roughness = spec.roughness;
			if (set.roughnessTex) mat.roughnessMap = set.roughnessTex;
			if (spec.normalTex) {
				mat.normalMap = spec.normalTex;
				mat.normalScale = new Vector2(spec.normalScale, spec.normalScale);
			}
			mat.needsUpdate = true;
		}
	});
}
//#endregion
//#region src/farcrysis-water-fx.ts
/**
* farcrysis-water-fx.ts — Enhanced water effects for Pass 69.
*
* Four additive visual layers (no colliders, no gameplay authority):
*   1. Shoreline foam ring  — circular MeshBasicMaterial torus at ~20 m radius
*   2. Animated wave surface — vertex-displaced water plane at y=-0.22
*   3. Caustic light overlay — canvas-textured semi-transparent plane at y=-0.15
*   4. Water edge ripples    — pulsing sprite points around the beach ring
*
* All original art — no Far Cry IP.
*/
var _foamRing = null;
var _waveMesh = null;
var _waveBasePositions = null;
var _waveGeom = null;
var _causticPlane = null;
var _rippleGroup = null;
var _rippleMeshes = [];
var _ripplePhases = [];
var _crestMesh = null;
var _crestBasePositions = null;
var _crestGeom = null;
var _sandGradient = null;
/**
* A second 76×76 plane matching the wave surface geometry exactly, but driven
* as a brightness field instead of a colour wash: crests glow warm-white
* (additive), troughs contribute nothing. Vertex-coloured MeshBasicMaterial —
* no ShaderMaterial.
*/
function buildWaveCrestHighlights(scene) {
	const size = 76;
	const segments = 72;
	const geom = new PlaneGeometry(size, size, segments, segments);
	geom.rotateX(-Math.PI / 2);
	const posAttr = geom.attributes.position;
	const base = new Float32Array(posAttr.count * 3);
	for (let i = 0; i < posAttr.count; i++) {
		base[i * 3 + 0] = posAttr.getX(i);
		base[i * 3 + 1] = posAttr.getY(i);
		base[i * 3 + 2] = posAttr.getZ(i);
	}
	const colors = new Float32Array(posAttr.count * 3);
	geom.setAttribute("color", new BufferAttribute(colors, 3));
	const mesh = new Mesh(geom, new MeshBasicMaterial({
		color: 16771524,
		vertexColors: true,
		transparent: true,
		opacity: .5,
		blending: 2,
		depthWrite: false,
		depthTest: true,
		side: 2,
		fog: false
	}));
	mesh.name = "farcrysis-water-fx-crest-highlights";
	mesh.position.y = -.22;
	mesh.renderOrder = 3;
	mesh.frustumCulled = false;
	mesh.userData.farcrysisArt = true;
	scene.add(mesh);
	_crestMesh = mesh;
	_crestBasePositions = base;
	_crestGeom = geom;
}
function createSandGradientCanvas() {
	try {
		if (typeof document === "undefined") return null;
		const size = 256;
		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		const grad = ctx.createLinearGradient(0, 0, 0, size);
		grad.addColorStop(0, "#143c50");
		grad.addColorStop(.4, "#4a8a92");
		grad.addColorStop(.7, "#9fb89a");
		grad.addColorStop(1, "#d8bf8c");
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, size, size);
		for (let i = 0; i < 1500; i++) {
			const sx = Math.random() * size;
			const sy = Math.random() * size;
			ctx.fillStyle = `rgba(232, 216, 178, ${.03 + Math.random() * .08})`;
			ctx.beginPath();
			ctx.arc(sx, sy, .5 + Math.random() * 1.8, 0, Math.PI * 2);
			ctx.fill();
		}
		return canvas;
	} catch {
		return null;
	}
}
/**
* Annulus under the water surface (r 31.5–61) covering the visible water ring
* around the beach shelf. Golden near the shore fading to deep teal offshore —
* the shallow→deep sand depth gradient seen through the translucent water.
*/
function buildSandDepthGradient(scene) {
	const canvas = createSandGradientCanvas();
	if (!canvas) return;
	const tex = new CanvasTexture(canvas);
	tex.colorSpace = SRGBColorSpace;
	tex.wrapS = ClampToEdgeWrapping;
	tex.wrapT = ClampToEdgeWrapping;
	const geom = new RingGeometry(31.5, 61, 96);
	geom.rotateX(-Math.PI / 2);
	const mesh = new Mesh(geom, new MeshBasicMaterial({
		map: tex,
		transparent: true,
		opacity: .5,
		depthWrite: false,
		depthTest: true,
		side: 2
	}));
	mesh.name = "farcrysis-water-fx-sand-depth-gradient";
	mesh.position.y = -.26;
	mesh.renderOrder = 2;
	mesh.userData.farcrysisArt = true;
	scene.add(mesh);
	_sandGradient = mesh;
}
function buildShorelineFoamRing(scene) {
	const group = new Group();
	group.name = "farcrysis-water-fx-foam-ring";
	group.userData.farcrysisArt = true;
	const majorR = 20;
	const minorR = .38;
	const torusGeom = new TorusGeometry(majorR, minorR, 16, 128);
	torusGeom.rotateX(-Math.PI / 2);
	const foamRing = new Mesh(torusGeom, new MeshBasicMaterial({
		color: 16316671,
		transparent: true,
		opacity: .5,
		blending: 2,
		depthWrite: false,
		depthTest: true
	}));
	foamRing.name = "farcrysis-water-fx-foam-ring-main";
	foamRing.position.y = -.15;
	foamRing.renderOrder = 5;
	foamRing.userData.farcrysisArt = true;
	group.add(foamRing);
	const torusGeom2 = new TorusGeometry(20.55, minorR * .6, 12, 96);
	torusGeom2.rotateX(-Math.PI / 2);
	const foamRing2 = new Mesh(torusGeom2, new MeshBasicMaterial({
		color: 14742783,
		transparent: true,
		opacity: .28,
		blending: 2,
		depthWrite: false,
		depthTest: true
	}));
	foamRing2.name = "farcrysis-water-fx-foam-ring-outer";
	foamRing2.position.y = -.16;
	foamRing2.renderOrder = 5;
	foamRing2.userData.farcrysisArt = true;
	group.add(foamRing2);
	const torusGeom3 = new TorusGeometry(majorR - .45, minorR * .4, 10, 80);
	torusGeom3.rotateX(-Math.PI / 2);
	const foamRing3 = new Mesh(torusGeom3, new MeshBasicMaterial({
		color: 15792895,
		transparent: true,
		opacity: .22,
		blending: 2,
		depthWrite: false,
		depthTest: true
	}));
	foamRing3.name = "farcrysis-water-fx-foam-ring-inner";
	foamRing3.position.y = -.14;
	foamRing3.renderOrder = 5;
	foamRing3.userData.farcrysisArt = true;
	group.add(foamRing3);
	scene.add(group);
	_foamRing = foamRing;
}
function buildWaveSurface(scene) {
	const size = 76;
	const segments = 72;
	const geom = new PlaneGeometry(size, size, segments, segments);
	geom.rotateX(-Math.PI / 2);
	const posAttr = geom.attributes.position;
	const base = new Float32Array(posAttr.count * 3);
	for (let i = 0; i < posAttr.count; i++) {
		base[i * 3 + 0] = posAttr.getX(i);
		base[i * 3 + 1] = posAttr.getY(i);
		base[i * 3 + 2] = posAttr.getZ(i);
	}
	const mesh = new Mesh(geom, new MeshBasicMaterial({
		color: 4038840,
		transparent: true,
		opacity: .32,
		blending: 2,
		depthWrite: false,
		depthTest: true,
		side: 2
	}));
	mesh.name = "farcrysis-water-fx-wave-surface";
	mesh.position.y = -.22;
	mesh.renderOrder = 3;
	mesh.userData.farcrysisArt = true;
	scene.add(mesh);
	_waveMesh = mesh;
	_waveBasePositions = base;
	_waveGeom = geom;
}
function createCausticCanvas() {
	try {
		if (typeof document === "undefined") return null;
		const size = 512;
		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.clearRect(0, 0, size, size);
		ctx.globalAlpha = .55;
		for (let row = 0; row < 50; row++) {
			const baseY = 40 + row * 9 + Math.sin(row * 1.7) * 12;
			ctx.beginPath();
			for (let x = 0; x <= size; x += 2) {
				const y = baseY + (Math.sin(x * .04 + row * 1.1) * 18 + Math.sin(x * .09 + row * 2.3) * 8);
				if (x === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.strokeStyle = `rgba(200,240,255,${.25 + Math.random() * .15})`;
			ctx.lineWidth = 1.2 + Math.random() * 1.8;
			ctx.stroke();
		}
		ctx.globalAlpha = .35;
		for (let i = 0; i < 28; i++) {
			const cx = size * .2 + i * 317 % size;
			const cy = size * .2 + i * 191 % size;
			ctx.beginPath();
			for (let a = 0; a < Math.PI * 2; a += .03) {
				const r = size * (.06 + .14 * Math.abs(Math.sin(a * 3.5 + i * .7)));
				const px = cx + Math.cos(a) * r;
				const py = cy + Math.sin(a) * r * 1.3;
				if (a === 0) ctx.moveTo(px, py);
				else ctx.lineTo(px, py);
			}
			ctx.closePath();
			ctx.strokeStyle = `rgba(255,255,255,${.4 + Math.random() * .3})`;
			ctx.lineWidth = 2 + Math.random() * 3;
			ctx.stroke();
		}
		ctx.globalAlpha = .5;
		for (let i = 0; i < 180; i++) {
			const dx = i * 137 % size;
			const dy = i * 73 % size;
			const r = 1 + Math.random() * 2.5;
			ctx.beginPath();
			ctx.arc(dx, dy, r, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(255,255,255,${.3 + Math.random() * .4})`;
			ctx.fill();
		}
		return canvas;
	} catch {
		return null;
	}
}
function buildCausticProjection(scene) {
	const canvas = createCausticCanvas();
	const causticSize = 52;
	if (canvas) {
		const tex = new CanvasTexture(canvas);
		tex.wrapS = RepeatWrapping;
		tex.wrapT = RepeatWrapping;
		tex.repeat.set(2.5, 2.5);
		tex.colorSpace = SRGBColorSpace;
		const causticGeom = new PlaneGeometry(causticSize, causticSize);
		causticGeom.rotateX(-Math.PI / 2);
		const plane = new Mesh(causticGeom, new MeshBasicMaterial({
			map: tex,
			transparent: true,
			opacity: .22,
			blending: 2,
			depthWrite: false,
			depthTest: true,
			side: 2
		}));
		plane.name = "farcrysis-water-fx-caustic";
		plane.position.y = -.15;
		plane.renderOrder = 4;
		plane.userData.farcrysisArt = true;
		scene.add(plane);
		_causticPlane = plane;
	} else {
		const fallbackGeom = new PlaneGeometry(causticSize, causticSize);
		fallbackGeom.rotateX(-Math.PI / 2);
		const plane = new Mesh(fallbackGeom, new MeshBasicMaterial({
			color: 6346976,
			transparent: true,
			opacity: .12,
			blending: 2,
			depthWrite: false,
			depthTest: true
		}));
		plane.name = "farcrysis-water-fx-caustic-fallback";
		plane.position.y = -.15;
		plane.renderOrder = 4;
		plane.userData.farcrysisArt = true;
		scene.add(plane);
		_causticPlane = plane;
	}
}
function buildEdgeRipples(scene) {
	const group = new Group();
	group.name = "farcrysis-water-fx-edge-ripples";
	group.userData.farcrysisArt = true;
	const count = 25;
	const radius = 20;
	for (let i = 0; i < count; i++) {
		const angle = i / count * Math.PI * 2;
		const px = Math.cos(angle) * radius;
		const pz = Math.sin(angle) * radius;
		const rippleGeom = new CircleGeometry(.35, 8);
		rippleGeom.rotateX(-Math.PI / 2);
		const ripple = new Mesh(rippleGeom, new MeshBasicMaterial({
			color: 15267071,
			transparent: true,
			opacity: .45,
			blending: 2,
			depthWrite: false,
			depthTest: true,
			side: 2
		}));
		ripple.name = `farcrysis-water-fx-ripple-${i}`;
		ripple.position.set(px, -.19, pz);
		ripple.renderOrder = 6;
		ripple.userData.farcrysisArt = true;
		group.add(ripple);
		_rippleMeshes.push(ripple);
		_ripplePhases.push(Math.random() * Math.PI * 2);
	}
	scene.add(group);
	_rippleGroup = group;
}
function buildWaterFX(scene) {
	buildShorelineFoamRing(scene);
	buildWaveSurface(scene);
	buildCausticProjection(scene);
	buildEdgeRipples(scene);
	buildWaveCrestHighlights(scene);
	buildSandDepthGradient(scene);
}
function animateWaterFX(time) {
	if (_foamRing) {
		const foamMat = _foamRing.material;
		foamMat.opacity = .3 + Math.sin(time * 1.57) * .18;
		const parent = _foamRing.parent;
		if (parent instanceof Group && parent.name === "farcrysis-water-fx-foam-ring") {
			for (const child of parent.children) if (child instanceof Mesh && child !== _foamRing) {
				const cmat = child.material;
				if (child.name.includes("outer")) cmat.opacity = .18 + Math.sin(time * 1.57 + 1) * .12;
				else if (child.name.includes("inner")) cmat.opacity = .14 + Math.sin(time * 1.57 + 2.2) * .1;
			}
		}
	}
	if (_waveMesh && _waveBasePositions && _waveGeom) {
		const posAttr = _waveGeom.attributes.position;
		const base = _waveBasePositions;
		for (let i = 0; i < posAttr.count; i++) {
			const bx = base[i * 3 + 0];
			const bz = base[i * 3 + 2];
			const dist = Math.sqrt(bx * bx + bz * bz);
			const wave1 = Math.sin(dist * .55 - time * 1.4) * .08;
			const wave2 = Math.cos(dist * .75 + time * 1.1) * .05;
			const wave3 = Math.sin(dist * 1.05 - time * 1.8) * .04;
			const ripple = Math.sin(dist * .4 - time * 2) * .06;
			const y = wave1 + wave2 + wave3 + ripple + .02;
			posAttr.setY(i, y);
		}
		posAttr.needsUpdate = true;
		_waveGeom.computeVertexNormals();
	}
	if (_causticPlane) {
		const cmat = _causticPlane.material;
		if (cmat.map) {
			cmat.map.offset.x = Math.sin(time * .15) * .05;
			cmat.map.offset.y = Math.cos(time * .18) * .05;
		}
		cmat.opacity = .16 + Math.sin(time * .7) * .05;
	}
	if (_rippleGroup) for (let i = 0; i < _rippleMeshes.length; i++) {
		const ripple = _rippleMeshes[i];
		const phase = _ripplePhases[i];
		const pulse = .5 + .5 * Math.sin(time * 1.8 + phase);
		const rmat = ripple.material;
		rmat.opacity = .15 + pulse * .35;
		const s = .7 + pulse * .45;
		ripple.scale.setScalar(s);
	}
	if (_crestMesh && _crestBasePositions && _crestGeom) {
		const posAttr = _crestGeom.attributes.position;
		const colAttr = _crestGeom.attributes.color;
		const base = _crestBasePositions;
		for (let i = 0; i < posAttr.count; i++) {
			const bx = base[i * 3 + 0];
			const bz = base[i * 3 + 2];
			const dist = Math.sqrt(bx * bx + bz * bz);
			const wave1 = Math.sin(dist * .55 - time * 1.4) * .08;
			const wave2 = Math.cos(dist * .75 + time * 1.1) * .05;
			const wave3 = Math.sin(dist * 1.05 - time * 1.8) * .04;
			const ripple = Math.sin(dist * .4 - time * 2) * .06;
			const y = wave1 + wave2 + wave3 + ripple + .02;
			posAttr.setY(i, y + .015);
			const crest = Math.max(0, Math.min(1, (y - .06) / .12));
			const sparkle = Math.pow(Math.max(0, Math.sin(dist * 1.6 - time * 2.4)), 10);
			const bright = Math.min(1, crest * .9 + sparkle * .55);
			colAttr.setXYZ(i, bright, bright * .96, bright * .86);
		}
		posAttr.needsUpdate = true;
		colAttr.needsUpdate = true;
		const crestMat = _crestMesh.material;
		crestMat.opacity = .42 + Math.sin(time * .9) * .12;
	}
	if (_sandGradient) {
		const sandMat = _sandGradient.material;
		sandMat.opacity = .46 + Math.sin(time * .4) * .06;
	}
}
//#endregion
//#region src/farcrysis-detail.ts
/**
* farcrysis-detail.ts — Pass 69 environmental detail polish module.
*
* Adds presentation-only environmental detail to the Farcrysis jungle/beach arena:
*   1. Hanging vines from canopy crowns (curved TubeGeometry, wind-sway).
*   2. Moss / lichen patches on ruined walls (small emissive planes).
*   3. Rock formations (displaced-icosahedron scatter on jungle floor).
*   4. Jungle floor litter (InstancedMesh of small flat elements).
*   5. Reed clusters at water's edge (thin cylinders with sway animation).
*
* No colliders, gameplay authority, or physics. Presentation only.
* Mount from farcrysis-art.ts via buildDetail() + animateDetail().
*/
var _vines = [];
var _reeds = [];
/** Seeded pseudo-random — deterministic, repeatable. */
function seededRandom(seed) {
	let s = seed | 0;
	return () => {
		s = s * 1664525 + 1013904223 | 0;
		return (s >>> 0) / 4294967295;
	};
}
/**
* Create a MeshStandardMaterial + mark as art-layer dressing.
* Also sets userData.farcrysisArt on every returned mesh.
*/
function artMat(color, roughness = .86, metalness = .08) {
	return new MeshStandardMaterial({
		color,
		roughness,
		metalness
	});
}
function artMark(mesh, name) {
	mesh.name = name;
	mesh.userData.farcrysisArt = true;
}
/** The 12 canopy positions (from farcrysis.ts — read-only reference, not redefined). */
var CANOPY_POSITIONS = [
	[-15, -15],
	[15, 15],
	[-15, 15],
	[15, -15],
	[-4, -24],
	[4, 24],
	[-24, 4],
	[24, -4],
	[-20, -12],
	[20, 12],
	[-12, 20],
	[12, -20]
];
var VINE_COLOR = 2972190;
var CROWN_CENTER_Y = 3.1;
var CROWN_HALF = 2.3;
var CROWN_HALF_H = .8;
function buildVines(root, rng) {
	const vineMat = artMat(VINE_COLOR, .75, .04);
	const tubeSegments = 8;
	const tubeRadius = .03;
	for (const [cx, cz] of CANOPY_POSITIONS) {
		const count = 2 + Math.floor(rng() * 2);
		for (let v = 0; v < count; v++) {
			const angle = rng() * Math.PI * 2;
			const edgeDist = CROWN_HALF * (.7 + rng() * .3);
			const startX = cx + Math.cos(angle) * edgeDist;
			const startZ = cz + Math.sin(angle) * edgeDist;
			const startY = CROWN_CENTER_Y - CROWN_HALF_H + rng() * .2;
			const dropLen = 2 + rng() * 2.5;
			const endX = startX + (rng() - .5) * .8;
			const endY = startY - dropLen;
			const endZ = startZ + (rng() - .5) * .8;
			const midX = (startX + endX) * .5 + (rng() - .5) * 1.2;
			const midY = (startY + endY) * .5 + rng() * .3;
			const midZ = (startZ + endZ) * .5 + (rng() - .5) * 1;
			const vineMesh = new Mesh(new TubeGeometry(new CatmullRomCurve3([
				new Vector3(0, 0, 0),
				new Vector3(midX - startX, midY - startY, midZ - startZ),
				new Vector3(endX - startX, endY - startY, endZ - startZ)
			]), tubeSegments, tubeRadius, 6, false), vineMat);
			artMark(vineMesh, `farcrysis-detail-vine-mesh-${cx}-${cz}-${v}`);
			vineMesh.castShadow = true;
			const pivot = new Object3D();
			artMark(pivot, `farcrysis-detail-vine-pivot-${cx}-${cz}-${v}`);
			pivot.position.set(startX, startY, startZ);
			pivot.add(vineMesh);
			const baseRotationY = rng() * Math.PI * 2;
			pivot.rotation.y = baseRotationY;
			root.add(pivot);
			_vines.push({
				pivot,
				mesh: vineMesh,
				baseRotationY,
				phase: rng() * Math.PI * 2
			});
		}
	}
}
var MOSS_COLOR = 5933628;
function buildMossPatches(root, rng) {
	const mossMat = new MeshStandardMaterial({
		color: MOSS_COLOR,
		emissive: MOSS_COLOR,
		emissiveIntensity: .25,
		roughness: .92,
		metalness: .01
	});
	for (const wall of [
		{
			center: [
				-8,
				.8,
				-14
			],
			size: [
				3.6,
				1.6,
				.5
			],
			faceNormal: [
				0,
				0,
				-1
			]
		},
		{
			center: [
				8,
				.8,
				14
			],
			size: [
				3.6,
				1.6,
				.5
			],
			faceNormal: [
				0,
				0,
				1
			]
		},
		{
			center: [
				14,
				.8,
				-8
			],
			size: [
				.5,
				1.6,
				3.6
			],
			faceNormal: [
				1,
				0,
				0
			]
		},
		{
			center: [
				-14,
				.8,
				8
			],
			size: [
				.5,
				1.6,
				3.6
			],
			faceNormal: [
				-1,
				0,
				0
			]
		}
	]) {
		const [cx, cy, cz] = wall.center;
		const [sx, sy, sz] = wall.size;
		const [nx, _ny, nz] = wall.faceNormal;
		const halfX = sx / 2;
		const halfZ = sz / 2;
		const surfaceOffset = .02;
		const useXAxis = sx > sz;
		const patchCount = 3 + Math.floor(rng() * 3);
		for (let p = 0; p < patchCount; p++) {
			const pw = .2 + rng() * .6;
			const ph = .15 + rng() * .5;
			const patchGeom = new PlaneGeometry(pw, ph);
			if (useXAxis) {
				const px = cx + (rng() - .5) * (sx - pw);
				const py = cy + (rng() - .5) * (sy - ph);
				const pz = cz + nz * (halfZ + surfaceOffset);
				const patch = new Mesh(patchGeom, mossMat);
				artMark(patch, `farcrysis-detail-moss-${cx.toFixed(0)}-${cz.toFixed(0)}-${p}`);
				patch.position.set(px, py, pz);
				patch.rotation.y = nz > 0 ? 0 : Math.PI;
				patch.castShadow = false;
				root.add(patch);
			} else {
				const px = cx + nx * (halfX + surfaceOffset);
				const py = cy + (rng() - .5) * (sy - ph);
				const pz = cz + (rng() - .5) * (sz - pw);
				const patch = new Mesh(patchGeom, mossMat);
				artMark(patch, `farcrysis-detail-moss-${cx.toFixed(0)}-${cz.toFixed(0)}-${p}`);
				patch.position.set(px, py, pz);
				patch.rotation.y = nx < 0 ? 0 : Math.PI;
				if (Math.sign(nx) !== 0) patch.rotation.y = nx > 0 ? -Math.PI / 2 : Math.PI / 2;
				patch.castShadow = false;
				root.add(patch);
			}
		}
	}
}
function buildRocks(root, rng) {
	const rockCount = 8 + Math.floor(rng() * 5);
	const minRadius = 10;
	const maxRadius = 18;
	for (let i = 0; i < rockCount; i++) {
		const gray = 92 + Math.floor(rng() * 28);
		const rockMat = new MeshStandardMaterial({
			color: gray << 16 | gray + (Math.floor(rng() * 10) - 5) << 8 | gray,
			roughness: .85,
			metalness: .05
		});
		const geom = new IcosahedronGeometry(1, rng() < .5 ? 0 : 1);
		const posAttr = geom.getAttribute("position");
		const scale = .5 + rng() * 1.2;
		for (let j = 0; j < posAttr.count; j++) {
			const x = posAttr.getX(j);
			const y = posAttr.getY(j);
			const z = posAttr.getZ(j);
			const noise = 1 + (rng() - .5) * .5;
			const len = Math.sqrt(x * x + y * y + z * z);
			if (len > .001) posAttr.setXYZ(j, x / len * noise * scale, y / len * noise * scale * .6, z / len * noise * scale);
		}
		geom.computeVertexNormals();
		for (let j = 0; j < posAttr.count; j++) posAttr.setY(j, Math.max(posAttr.getY(j), -scale * .35) + scale * .35);
		posAttr.needsUpdate = true;
		geom.computeVertexNormals();
		const rock = new Mesh(geom, rockMat);
		artMark(rock, `farcrysis-detail-rock-${i}`);
		rock.castShadow = true;
		rock.receiveShadow = true;
		const angle = rng() * Math.PI * 2;
		const radius = minRadius + rng() * (maxRadius - minRadius);
		const px = Math.cos(angle) * radius;
		const pz = Math.sin(angle) * radius;
		const py = farcrysisTerrainHeight(px, pz) - .04;
		rock.position.set(px, py, pz);
		rock.rotation.set(0, rng() * Math.PI * 2, 0);
		rock.scale.setScalar(.8 + rng() * .5);
		root.add(rock);
	}
}
function buildFloorLitter(root, rng) {
	const count = 80 + Math.floor(rng() * 21);
	const instances = new InstancedMesh(new BoxGeometry(.12, .025, .28), artMat(6113836, .9, .02), count);
	artMark(instances, "farcrysis-detail-floor-litter");
	instances.castShadow = true;
	instances.receiveShadow = true;
	instances.instanceColor = null;
	const matrix = new Matrix4();
	const quat = new Quaternion();
	const euler = new Euler();
	const scaleVec = new Vector3();
	const litterColors = [
		new Color(6113836),
		new Color(8019510),
		new Color(4877098),
		new Color(7047738),
		new Color(9075290)
	];
	const minRadius = 5;
	const maxRadius = 18;
	for (let i = 0; i < count; i++) {
		const angle = rng() * Math.PI * 2;
		const radius = minRadius + rng() * (maxRadius - minRadius);
		const px = Math.cos(angle) * radius;
		const pz = Math.sin(angle) * radius;
		const py = farcrysisTerrainHeight(px, pz) + .04;
		euler.set((rng() - .5) * .3, rng() * Math.PI * 2, (rng() - .5) * .3);
		quat.setFromEuler(euler);
		const s = .6 + rng() * 1.2;
		scaleVec.set(s * (.7 + rng() * .6), .8 + rng() * .4, s);
		matrix.compose(new Vector3(px, py, pz), quat, scaleVec);
		instances.setMatrixAt(i, matrix);
		const col = litterColors[Math.floor(rng() * litterColors.length)];
		instances.setColorAt(i, col);
	}
	instances.instanceMatrix.needsUpdate = true;
	root.add(instances);
}
var REED_COLOR = 9083482;
function buildReedClusters(root, rng) {
	const clusterCount = 4 + Math.floor(rng() * 3);
	const reedMat = artMat(REED_COLOR, .7, .03);
	for (let c = 0; c < clusterCount; c++) {
		const angle = rng() * Math.PI * 2;
		const radius = 19 + rng() * 3;
		const cx = Math.cos(angle) * radius;
		const cz = Math.sin(angle) * radius;
		const reedCount = 5 + Math.floor(rng() * 4);
		for (let r = 0; r < reedCount; r++) {
			const reedHeight = 1 + rng() * 1;
			const reedRadius = .04 + rng() * .03;
			const ox = (rng() - .5) * .8;
			const oz = (rng() - .5) * .8;
			const reed = new Mesh(new CylinderGeometry(reedRadius * .8, reedRadius, reedHeight, 6), reedMat);
			const px = cx + ox;
			const pz = cz + oz;
			const py = farcrysisTerrainHeight(px, pz) + reedHeight / 2;
			artMark(reed, `farcrysis-detail-reed-${c}-${r}`);
			reed.position.set(px, py, pz);
			reed.castShadow = true;
			reed.rotation.z = (rng() - .5) * .15;
			reed.rotation.x = (rng() - .5) * .15;
			root.add(reed);
			_reeds.push({
				mesh: reed,
				posX: px,
				posZ: pz,
				phase: rng() * Math.PI * 2,
				height: reedHeight
			});
		}
	}
}
function buildDetail(scene) {
	const rngVines = seededRandom(1002573);
	const rngMoss = seededRandom(1002574);
	const rngRocks = seededRandom(1002575);
	const rngLitter = seededRandom(1002576);
	const rngReeds = seededRandom(1002577);
	buildVines(scene, rngVines);
	buildMossPatches(scene, rngMoss);
	buildRocks(scene, rngRocks);
	buildFloorLitter(scene, rngLitter);
	buildReedClusters(scene, rngReeds);
}
/**
* Animate all detail elements: vine sway, reed sway.
* Call every frame from the onBeforeRender animation driver.
* @param time Seconds elapsed (e.g. performance.now() / 1000).
*/
function animateDetail(time) {
	for (const vine of _vines) {
		const sway = Math.sin(time * 2.3 + vine.phase) * .06;
		vine.pivot.rotation.z = sway;
		vine.pivot.rotation.x = Math.cos(time * 1.9 + vine.phase) * .04;
	}
	for (const reed of _reeds) {
		const swayX = Math.sin(time * 3.1 + reed.phase) * .08;
		const swayZ = Math.cos(time * 2.7 + reed.phase) * .06;
		reed.mesh.rotation.x = swayX * 1.5;
		reed.mesh.rotation.z = swayZ * 1.5;
		reed.mesh.position.x = reed.posX + swayX * .15;
		reed.mesh.position.z = reed.posZ + swayZ * .15;
	}
}
//#endregion
//#region src/farcrysis-art.ts
/**
* farcrysis-art.ts — Pass 69 art/feel lane (spec R9 / C11).
*
* Golden-hour beach/jungle presentation: throwback props, instanced
* multi-type foliage (≥3 instanced types), lagoon sparkle, and
* palette/feel constants. Presentation only — never adds colliders,
* shot surfaces, spawns, patrols, cover or gameplay authority.
*
* Mounted from farcrysis.ts at the end of buildFarcrysis so the
* gameplay scene and visual-definition review copies both receive
* the art layer.
*/
var mat$1 = (color, roughness = .86, metalness = .08) => new MeshStandardMaterial({
	color,
	roughness,
	metalness
});
var emissiveMat = (color, intensity = 1) => new MeshStandardMaterial({
	color,
	emissive: color,
	emissiveIntensity: intensity,
	roughness: .3,
	metalness: .15
});
function makeMesh(geometry, material, name, position, options) {
	const mesh = new Mesh(geometry, material);
	mesh.name = name;
	mesh.position.set(...position);
	if (options?.rotation) mesh.rotation.set(...options.rotation);
	if (options?.scale) mesh.scale.set(...options.scale);
	mesh.castShadow = options?.castShadow !== false;
	mesh.receiveShadow = true;
	mesh.userData.farcrysisArt = true;
	return mesh;
}
var FARCRYSIS_ART_FEEL = Object.freeze({
	goldenHourSunTint: 16767392,
	goldenHourSunIntensity: 3.1,
	jungleDappleTint: 10475688,
	ambientColor: 10469288,
	ambientIntensity: .42,
	beachSand: 14270602,
	palmTrunk: 8018742,
	palmFrond: 4160561,
	bushGreen: 4622908,
	fernGreen: 4097592,
	towerMetal: 7174787,
	antenna: 9149098,
	beaconLight: 15238699,
	caveRock: 5920080,
	tikiWood: 9136970,
	tikiBand: 14177072,
	crateStamp: 15771712,
	waterSparkleColor: 13955327,
	preferredReviewFov: 70,
	goldenHourExposure: 1.08
});
function addResearchTower(root) {
	const group = new Group();
	group.name = "farcrysis-art-tower";
	const metal = mat$1(FARCRYSIS_ART_FEEL.towerMetal, .35, .65);
	const cornerMetal = mat$1(FARCRYSIS_ART_FEEL.antenna, .3, .7);
	const legRadius = .09;
	const legHeight = 4.8;
	const legHalf = 1.3;
	const rustMetal = mat$1(7232072, .7, .45);
	const legGeom = new CylinderGeometry(legRadius * .7, legRadius, legHeight, 7);
	const legs = [
		[-1.3, -1.3],
		[legHalf, -1.3],
		[-1.3, legHalf],
		[legHalf, legHalf]
	];
	for (const [lx, lz] of legs) {
		const leg = makeMesh(legGeom, cornerMetal, "farcrysis-art-tower-leg", [
			lx,
			legHeight / 2,
			lz
		]);
		leg.rotation.set(lz > 0 ? -.052 : .052, 0, lx > 0 ? .052 : -.052);
		group.add(leg);
	}
	const bayHeights = [
		.9,
		2.1,
		3.3
	];
	const braceGeom = new CylinderGeometry(.03, .03, Math.hypot(legHalf * 2, 1.2), 5);
	const diagonalTilt = Math.atan2(legHalf * 2, 1.2);
	for (const bayY of bayHeights) {
		for (const side of [-1, 1]) for (const flip of [-1, 1]) {
			const braceZ = makeMesh(braceGeom, rustMetal, "farcrysis-art-tower-brace-x", [
				0,
				bayY,
				side * legHalf
			]);
			braceZ.rotation.set(0, 0, flip * diagonalTilt);
			group.add(braceZ);
			const braceX = makeMesh(braceGeom, rustMetal, "farcrysis-art-tower-brace-z", [
				side * legHalf,
				bayY,
				0
			]);
			braceX.rotation.set(flip * diagonalTilt, 0, Math.PI / 2);
			group.add(braceX);
		}
		const ringGeomH = new BoxGeometry(legHalf * 2.05, .07, .07);
		const ringGeomV = new BoxGeometry(.07, .07, legHalf * 2.05);
		group.add(makeMesh(ringGeomH, cornerMetal, "farcrysis-art-tower-ring-h", [
			0,
			bayY + .6,
			-1.3
		]));
		group.add(makeMesh(ringGeomH, cornerMetal, "farcrysis-art-tower-ring-h", [
			0,
			bayY + .6,
			legHalf
		]));
		group.add(makeMesh(ringGeomV, cornerMetal, "farcrysis-art-tower-ring-v", [
			-1.3,
			bayY + .6,
			0
		]));
		group.add(makeMesh(ringGeomV, cornerMetal, "farcrysis-art-tower-ring-v", [
			legHalf,
			bayY + .6,
			0
		]));
	}
	group.add(makeMesh(new BoxGeometry(3, .12, 3), metal, "farcrysis-art-tower-platform", [
		0,
		4.859999999999999,
		0
	]));
	const railGeomH = new BoxGeometry(3, .05, .05);
	const railGeomV = new BoxGeometry(.05, .05, 3);
	for (const side of [-1, 1]) {
		group.add(makeMesh(railGeomH, rustMetal, "farcrysis-art-tower-rail-h", [
			0,
			5.5,
			side * 1.48
		]));
		group.add(makeMesh(railGeomV, rustMetal, "farcrysis-art-tower-rail-v", [
			side * 1.48,
			5.484999999999999,
			0
		]));
		for (const other of [-1, 1]) group.add(makeMesh(new BoxGeometry(.05, .64, .05), rustMetal, "farcrysis-art-tower-rail-post", [
			side * 1.48,
			5.18,
			other * 1.48
		]));
	}
	const antenna = makeMesh(new CylinderGeometry(.08, .1, 3.8, 8), cornerMetal, "farcrysis-art-tower-antenna", [
		0,
		6.8,
		0
	]);
	group.add(antenna);
	const beaconGeom = new SphereGeometry(.22, 8, 6);
	group.add(makeMesh(beaconGeom, emissiveMat(FARCRYSIS_ART_FEEL.beaconLight, 1.8), "farcrysis-art-tower-beacon", [
		0,
		8.8,
		0
	]));
	const dishGeom = new CylinderGeometry(.8, .7, .1, 12);
	group.add(makeMesh(dishGeom, cornerMetal, "farcrysis-art-tower-dish", [
		0,
		6.199999999999999,
		0
	]));
	group.position.set(-8.5, farcrysisTerrainHeight(-8.5, -8.5), -8.5);
	root.add(group);
}
function addFloodedCave(root) {
	const group = new Group();
	group.name = "farcrysis-art-cave";
	const rock = mat$1(FARCRYSIS_ART_FEEL.caveRock, .9, .05);
	const dark = mat$1(1710618, .95, .01);
	const pillarGeom = new BoxGeometry(.7, 2.6, 1.6);
	const leftPillar = makeMesh(pillarGeom, rock, "farcrysis-art-cave-pillar-l", [
		-1.5,
		1.3,
		0
	]);
	const rightPillar = makeMesh(pillarGeom, rock, "farcrysis-art-cave-pillar-r", [
		1.5,
		1.3,
		0
	]);
	group.add(leftPillar);
	group.add(rightPillar);
	group.add(makeMesh(new BoxGeometry(3.8, .6, 1.4), rock, "farcrysis-art-cave-arch-top", [
		0,
		2.7,
		0
	]));
	const portal = makeMesh(new PlaneGeometry(2.8, 2.4), dark, "farcrysis-art-cave-portal", [
		0,
		1.4,
		-.8
	], { rotation: [
		0,
		0,
		0
	] });
	portal.castShadow = false;
	group.add(portal);
	for (let i = 0; i < 4; i += 1) {
		const angle = i / 4 * Math.PI * 2;
		const rx = Math.cos(angle) * 2.2;
		const rz = Math.sin(angle) * 1 * .6;
		group.add(makeMesh(new BoxGeometry(.7 + i % 3 * .2, .5 + i % 2 * .3, .6 + i % 2 * .4), rock, `farcrysis-art-cave-rubble-${i}`, [
			rx,
			.25,
			rz
		], { rotation: [
			0,
			angle,
			0
		] }));
	}
	group.position.set(26, farcrysisTerrainHeight(26, 16), 16);
	group.rotation.y = 1.2;
	root.add(group);
}
function addTikiMarkers(root) {
	for (const [tx, tz] of [
		[0, -28],
		[0, 28],
		[-28, 0],
		[28, 0]
	]) {
		const post = new Group();
		post.name = `farcrysis-art-tiki-${tx}-${tz}`;
		const wood = mat$1(FARCRYSIS_ART_FEEL.tikiWood, .85, .04);
		const band = mat$1(FARCRYSIS_ART_FEEL.tikiBand, .7, .08);
		post.add(makeMesh(new CylinderGeometry(.22, .28, 2.4, 8), wood, "farcrysis-art-tiki-post", [
			0,
			1.2,
			0
		]));
		for (let b = 0; b < 3; b += 1) {
			const bandY = .55 + b * .7;
			const postRadiusAtBand = .28 - bandY / 2.4 * .06;
			post.add(makeMesh(new CylinderGeometry(postRadiusAtBand + .02, postRadiusAtBand + .02, .18, 8), band, `farcrysis-art-tiki-band-${b}`, [
				0,
				bandY,
				0
			]));
		}
		const topGeom = new BoxGeometry(.5, .5, .5);
		post.add(makeMesh(topGeom, wood, "farcrysis-art-tiki-top", [
			0,
			2.5,
			0
		], { rotation: [
			.3,
			.5,
			.2
		] }));
		post.position.set(tx, farcrysisTerrainHeight(tx, tz), tz);
		root.add(post);
	}
}
function createWordmarkTexture() {
	try {
		if (typeof document === "undefined") return null;
		if (!document.createElement("canvas").getContext("2d")) return null;
		return null;
	} catch {
		return null;
	}
}
function addCrateWordmarks(root) {
	const stampMat = emissiveMat(FARCRYSIS_ART_FEEL.crateStamp, .9);
	const crates = [
		[
			"nw",
			[
				-10.45,
				farcrysisTerrainHeight(-10, -8) + 1,
				-8
			],
			[
				0,
				0,
				0
			]
		],
		[
			"ne",
			[
				10.45,
				farcrysisTerrainHeight(10, -8) + 1,
				-8
			],
			[
				0,
				Math.PI,
				0
			]
		],
		[
			"sw",
			[
				-10.45,
				farcrysisTerrainHeight(-10, 8) + 1,
				8
			],
			[
				0,
				Math.PI,
				0
			]
		],
		[
			"se",
			[
				10.45,
				farcrysisTerrainHeight(10, 8) + 1,
				8
			],
			[
				0,
				0,
				0
			]
		]
	];
	for (const [tag, pos, rot] of crates) {
		const plaque = makeMesh(new BoxGeometry(1.2, .4, .06), stampMat, `farcrysis-art-crate-stamp-${tag}`, pos, { rotation: [0, ...rot.slice(1)] });
		root.add(plaque);
		const texture = createWordmarkTexture();
		if (texture) {
			const sprite = new Sprite(new SpriteMaterial({
				map: texture,
				color: FARCRYSIS_ART_FEEL.crateStamp,
				transparent: true
			}));
			sprite.name = `farcrysis-art-crate-wordmark-${tag}`;
			const outward = tag === "nw" || tag === "se" ? -1 : 1;
			sprite.position.set(pos[0], pos[1], pos[2] + outward * .1);
			sprite.scale.set(1, .35, 1);
			root.add(sprite);
		}
	}
}
function addInstancedBushes(root) {
	const count = 20;
	const instances = new InstancedMesh(lumpify(new IcosahedronGeometry(.72, 1), .14, 45150), mat$1(FARCRYSIS_ART_FEEL.bushGreen, .9, .01), count);
	instances.name = "farcrysis-art-instanced-bushes";
	instances.castShadow = true;
	instances.receiveShadow = true;
	const matrix = new Matrix4();
	const { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;
	for (let i = 0; i < count; i += 1) {
		const angle = i / count * Math.PI * 2 + .5;
		const radius = 8 + i % 3 * 3.2;
		let px = Math.cos(angle) * radius;
		let pz = Math.sin(angle) * radius * .85;
		px = Math.max(minX + 2, Math.min(maxX - 2, px));
		pz = Math.max(minZ + 2, Math.min(maxZ - 2, pz));
		matrix.makeRotationY(angle * 1.8 + i);
		const bushScaleY = .75 + i % 3 * .16;
		matrix.scale(new Vector3(.7 + i % 4 * .18, bushScaleY, .7 + (i + 1) % 4 * .18));
		matrix.setPosition(px, farcrysisTerrainHeight(px, pz) + .45 * bushScaleY, pz);
		instances.setMatrixAt(i, matrix);
	}
	instances.instanceMatrix.needsUpdate = true;
	root.add(instances);
}
function addInstancedFernClusters(root) {
	const clusters = 18;
	const bladesPerCluster = 3;
	const count = clusters * bladesPerCluster;
	const fernGeom = new BoxGeometry(.42, 1.1, .05);
	fernGeom.translate(0, .55, 0);
	const instances = new InstancedMesh(fernGeom, mat$1(FARCRYSIS_ART_FEEL.fernGreen, .85, .02), count);
	instances.name = "farcrysis-art-instanced-fern-clusters";
	instances.castShadow = true;
	instances.receiveShadow = true;
	const matrix = new Matrix4();
	const quat = new Quaternion();
	const euler = new Euler();
	const { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;
	for (let i = 0; i < clusters; i += 1) {
		const angle = i / clusters * Math.PI * 2 + .15;
		const radius = 5 + i % 4 * 2.1;
		let px = Math.cos(angle) * radius;
		let pz = Math.sin(angle) * radius * .9;
		px = Math.max(minX + 2.5, Math.min(maxX - 2.5, px));
		pz = Math.max(minZ + 2.5, Math.min(maxZ - 2.5, pz));
		const baseY = farcrysisTerrainHeight(px, pz) + .02;
		for (let blade = 0; blade < bladesPerCluster; blade += 1) {
			const bladeYaw = angle * 2.7 + i * .9 + blade / bladesPerCluster * Math.PI * 2;
			euler.set(.32 + blade % 2 * .14, bladeYaw, 0);
			quat.setFromEuler(euler);
			const fernScaleY = .7 + (i + blade) % 4 * .2;
			matrix.compose(new Vector3(px, baseY, pz), quat, new Vector3(.8 + (i + blade) % 3 * .25, fernScaleY, 1));
			instances.setMatrixAt(i * bladesPerCluster + blade, matrix);
		}
	}
	instances.instanceMatrix.needsUpdate = true;
	instances.computeBoundingSphere();
	root.add(instances);
}
function addWaterSparkle(root) {
	const sparkleCount = 60;
	const positions = new Float32Array(sparkleCount * 3);
	const { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;
	const innerRadius = 20;
	const sparkleRng = mulberry32$1(ART_SEED + 4);
	for (let i = 0; i < sparkleCount; i += 1) {
		const angle = i / sparkleCount * Math.PI * 2 + sparkleRng() * .4;
		const radius = innerRadius + sparkleRng() * 16;
		const px = Math.max(minX + 2, Math.min(maxX - 2, Math.cos(angle) * radius));
		const pz = Math.max(minZ + 2, Math.min(maxZ - 2, Math.sin(angle) * radius * .9));
		positions[i * 3 + 0] = px;
		positions[i * 3 + 1] = FARCRYSIS_WATER_LEVEL + .04;
		positions[i * 3 + 2] = pz;
	}
	const geom = new BufferGeometry();
	geom.setAttribute("position", new BufferAttribute(positions, 3));
	const points = new Points(geom, new PointsMaterial({
		color: FARCRYSIS_ART_FEEL.waterSparkleColor,
		size: .15,
		map: softDotTexture(),
		transparent: true,
		opacity: .6,
		blending: 2,
		depthWrite: false,
		depthTest: true
	}));
	points.name = "farcrysis-art-water-sparkle";
	points.frustumCulled = false;
	root.add(points);
}
/**
* Seeded PRNG (mulberry32, the same idiom farcrysis-physics.ts and
* farcrysis-vegetation.ts already use). HF-360: world placement in this file
* ran on Math.random, so every peer built a DIFFERENT arena — rocks, litter
* and driftwood disagreed between host and clients. All placement below is
* seeded so peers see identical worlds.
*/
function mulberry32$1(seed) {
	let s = seed | 0;
	return () => {
		s = s + 1831565813 | 0;
		let t = Math.imul(s ^ s >>> 15, 1 | s);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
/** Base seed for this module's placement streams (arbitrary, stable). */
var ART_SEED = 262653205;
var ARENA_HALF = FARCRYSIS_BOUNDS.maxX;
function buildInlineTerrain(scene) {
	const group = new Group();
	group.name = "farcrysis-terrain";
	const w = ARENA_HALF * 2;
	const segs = 96;
	const geom = new PlaneGeometry(w, w, segs, segs);
	geom.rotateX(-Math.PI / 2);
	const pos = geom.attributes.position;
	const colors = new Float32Array(pos.count * 3);
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i);
		const z = pos.getZ(i);
		const h = farcrysisTerrainHeight(x, z);
		pos.setY(i, h);
		const edgeDist = ARENA_HALF - Math.max(Math.abs(x), Math.abs(z));
		if (edgeDist < 8) {
			colors[i * 3 + 0] = .88;
			colors[i * 3 + 1] = .79;
			colors[i * 3 + 2] = .6;
		} else if (edgeDist < 14) {
			colors[i * 3 + 0] = .29;
			colors[i * 3 + 1] = .41;
			colors[i * 3 + 2] = .15;
		} else {
			colors[i * 3 + 0] = .14;
			colors[i * 3 + 1] = .3;
			colors[i * 3 + 2] = .09;
		}
	}
	geom.setAttribute("color", new BufferAttribute(colors, 3));
	geom.computeVertexNormals();
	const terrainMat = new MeshStandardMaterial({
		vertexColors: true,
		metalness: .03
	});
	applyFarcrysisGroundMaterial(terrainMat, "terrain");
	const terrainMesh = new Mesh(geom, terrainMat);
	terrainMesh.name = "farcrysis-terrain-elevation";
	terrainMesh.receiveShadow = true;
	terrainMesh.castShadow = true;
	terrainMesh.position.y = .04;
	group.add(terrainMesh);
	const boulderGeometry = lumpify(new IcosahedronGeometry(1, 2), .2, 42945);
	{
		const pos = boulderGeometry.getAttribute("position");
		for (let i = 0; i < pos.count; i++) pos.setY(i, Math.max(pos.getY(i), -.55) + .55);
		pos.needsUpdate = true;
		boulderGeometry.computeVertexNormals();
	}
	const makeRockMaterial = (color) => {
		const rockMat = new MeshStandardMaterial({
			color,
			roughness: .92,
			metalness: .04
		});
		applyFarcrysisGroundMaterial(rockMat, "terrain", 2);
		rockMat.color.setHex(color);
		return rockMat;
	};
	const scatterBoulders = (name, color, count, seed, place) => {
		const rocks = new InstancedMesh(boulderGeometry, makeRockMaterial(color), count);
		rocks.name = name;
		const rng = mulberry32$1(seed);
		const m = new Matrix4();
		const q = new Quaternion();
		const euler = new Euler();
		for (let i = 0; i < count; i++) {
			const [rx, rz, s] = place(rng, i);
			const baseY = farcrysisTerrainHeight(rx, rz);
			euler.set(0, rng() * Math.PI * 2, 0);
			q.setFromEuler(euler);
			m.compose(new Vector3(rx, baseY - .05 * s, rz), q, new Vector3(s * (.85 + rng() * .4), s * (.55 + rng() * .3), s));
			rocks.setMatrixAt(i, m);
		}
		rocks.instanceMatrix.needsUpdate = true;
		rocks.computeBoundingSphere();
		rocks.castShadow = true;
		rocks.receiveShadow = true;
		group.add(rocks);
	};
	scatterBoulders("farcrysis-cliff-rocks", 7433056, 28, 262653206, (rng, i) => {
		const angle = i / 28 * Math.PI * 2 + (rng() - .5) * .6;
		const rockDist = 18 + rng() * 8;
		return [
			Math.max(-ARENA_HALF + 2, Math.min(ARENA_HALF - 2, Math.cos(angle) * rockDist)),
			Math.max(-ARENA_HALF + 2, Math.min(ARENA_HALF - 2, Math.sin(angle) * rockDist)),
			.8 + rng() * 1.1
		];
	});
	scatterBoulders("farcrysis-interior-boulders", 8024680, 12, 262653207, (rng, i) => {
		const angle = i / 12 * Math.PI * 2 + rng() * .5;
		const placeDist = 5 + rng() * 12;
		return [
			Math.max(-ARENA_HALF + 3, Math.min(ARENA_HALF - 3, Math.cos(angle) * placeDist)),
			Math.max(-ARENA_HALF + 3, Math.min(ARENA_HALF - 3, Math.sin(angle) * placeDist)),
			.35 + rng() * .5
		];
	});
	scatterBoulders("farcrysis-shore-boulders", 7169372, 8, 262653208, (rng, i) => {
		const angle = i / 8 * Math.PI * 2 + .2;
		const shoreDist = ARENA_HALF - 2 + rng() * 3;
		return [
			Math.cos(angle) * shoreDist,
			Math.sin(angle) * shoreDist,
			.9 + rng() * 1
		];
	});
	addBeachLitter(group);
	addDriftwoodLogs(group);
	addJungleUndergrowth(group);
	scene.add(group);
}
function buildInlineLighting(scene) {
	const ambient = new AmbientLight(14478559, .16);
	ambient.name = "farcrysis-ambient";
	scene.add(ambient);
	const hemi = new HemisphereLight(10473704, 3956524, .72);
	hemi.name = "farcrysis-hemi";
	scene.add(hemi);
	const sun = new DirectionalLight(16773330, 2.1);
	sun.name = "farcrysis-sun";
	sun.position.set(-18, 22, 25);
	sun.castShadow = true;
	sun.shadow.mapSize.set(4096, 4096);
	sun.shadow.camera.near = .5;
	sun.shadow.camera.far = 150;
	sun.shadow.camera.left = -36;
	sun.shadow.camera.right = 36;
	sun.shadow.camera.top = 36;
	sun.shadow.camera.bottom = -36;
	sun.shadow.normalBias = .03;
	scene.add(sun);
	const bounce = new DirectionalLight(10274670, .2);
	bounce.name = "farcrysis-bounce";
	bounce.position.set(0, -2, 0);
	scene.add(bounce);
	const fill = new DirectionalLight(9418969, .3);
	fill.name = "farcrysis-fill";
	fill.position.set(6, 10, -20);
	scene.add(fill);
	scene.fog = new FogExp2(new Color(13229522), .0022);
}
function buildInlineWater(scene) {
	const deepSize = 120;
	const deepGeom = new PlaneGeometry(deepSize, deepSize);
	deepGeom.rotateX(-Math.PI / 2);
	const deep = new Mesh(deepGeom, new MeshStandardMaterial({
		color: 941694,
		roughness: .3,
		metalness: .02,
		transparent: true,
		opacity: .88
	}));
	deep.name = "farcrysis-water-inline";
	deep.position.y = FARCRYSIS_WATER_LEVEL - .03;
	deep.receiveShadow = true;
	scene.add(deep);
	const shallowSize = 40;
	const shallowGeom = new PlaneGeometry(shallowSize, shallowSize);
	shallowGeom.rotateX(-Math.PI / 2);
	const shallow = new Mesh(shallowGeom, new MeshStandardMaterial({
		color: 4178615,
		roughness: .26,
		metalness: 0,
		transparent: true,
		opacity: .4,
		depthWrite: false
	}));
	shallow.name = "farcrysis-water-shallow";
	shallow.position.y = FARCRYSIS_WATER_LEVEL + .01;
	shallow.renderOrder = 2;
	scene.add(shallow);
	const outer = ARENA_HALF;
	const inner = outer - 8;
	const shape = new Shape();
	shape.moveTo(-outer, -outer);
	shape.lineTo(outer, -outer);
	shape.lineTo(outer, outer);
	shape.lineTo(-outer, outer);
	shape.closePath();
	const hole = new Path();
	hole.moveTo(-inner, -inner);
	hole.lineTo(inner, -inner);
	hole.lineTo(inner, inner);
	hole.lineTo(-inner, inner);
	hole.closePath();
	shape.holes.push(hole);
	const wetGeom = new ShapeGeometry(shape);
	wetGeom.rotateX(-Math.PI / 2);
	const wetPos = wetGeom.attributes.position;
	for (let i = 0; i < wetPos.count; i++) {
		const h = farcrysisTerrainHeight(wetPos.getX(i), wetPos.getZ(i));
		wetPos.setY(i, h + .02);
	}
	wetGeom.computeVertexNormals();
	const wetUv = wetGeom.attributes.uv;
	if (wetUv) {
		for (let i = 0; i < wetUv.count; i++) wetUv.setXY(i, wetUv.getX(i) / 64, wetUv.getY(i) / 64);
		wetUv.needsUpdate = true;
	}
	const wetMat = new MeshStandardMaterial({
		color: 9075288,
		metalness: 0
	});
	applyFarcrysisGroundMaterial(wetMat, "wet-sand");
	const wet = new Mesh(wetGeom, wetMat);
	wet.name = "farcrysis-water-wetsand";
	wet.receiveShadow = true;
	scene.add(wet);
}
/** Sand-matched vertex colors so small beach litter blends into the sand. */
function tintBeachGeometry(geo, base, spread, rng) {
	const count = geo.attributes.position.count;
	const colors = new Float32Array(count * 3);
	for (let i = 0; i < count; i += 1) {
		const v = 1 - spread + rng() * spread * 2;
		colors[i * 3 + 0] = base.r * v;
		colors[i * 3 + 1] = base.g * v;
		colors[i * 3 + 2] = base.b * v;
	}
	geo.setAttribute("color", new BufferAttribute(colors, 3));
	return geo;
}
/** Scattered small rocks + shells on the beach ring (edgeDist < 8). */
function addBeachLitter(group) {
	const sand = new Color(FARCRYSIS_ART_FEEL.beachSand);
	const litterMat = new MeshStandardMaterial({
		vertexColors: true,
		roughness: .92,
		metalness: .03
	});
	const litterCount = 36;
	const rng = mulberry32$1(262653210);
	for (let i = 0; i < litterCount; i += 1) {
		const angle = i / litterCount * Math.PI * 2 + (rng() - .5) * .9;
		const dist = ARENA_HALF - 1.5 - rng() * 6.5;
		const rx = Math.max(-ARENA_HALF + .8, Math.min(ARENA_HALF - .8, Math.cos(angle) * dist));
		const rz = Math.max(-ARENA_HALF + .8, Math.min(ARENA_HALF - .8, Math.sin(angle) * dist * .96));
		const baseY = farcrysisTerrainHeight(rx, rz);
		const size = .06 + rng() * .12;
		const geo = i % 3 === 0 ? tintBeachGeometry(new SphereGeometry(size, 6, 4), sand, .16, rng) : tintBeachGeometry(new BoxGeometry(size * 2.2, size * .7, size * 1.6), sand, .22, rng);
		group.add(makeMesh(geo, litterMat, `farcrysis-beach-litter-${i}`, [
			rx,
			baseY + size * .3,
			rz
		], {
			rotation: [
				rng() * Math.PI,
				rng() * Math.PI,
				rng() * Math.PI
			],
			castShadow: false
		}));
	}
}
/** Driftwood logs washed up on the beach (edgeDist < 8). */
function addDriftwoodLogs(group) {
	const logMat = mat$1(9073493, .92, .04);
	const logCount = 6;
	const rng = mulberry32$1(262653211);
	for (let i = 0; i < logCount; i += 1) {
		const angle = i / logCount * Math.PI * 2 + (rng() - .5) * 1.1;
		const dist = ARENA_HALF - 2 - rng() * 5;
		const rx = Math.max(-ARENA_HALF + .8, Math.min(ARENA_HALF - .8, Math.cos(angle) * dist));
		const rz = Math.max(-ARENA_HALF + .8, Math.min(ARENA_HALF - .8, Math.sin(angle) * dist * .96));
		const baseY = farcrysisTerrainHeight(rx, rz);
		const length = 1.2 + rng() * 1.6;
		group.add(makeMesh(new CylinderGeometry(.09, .14, length, 6), logMat, `farcrysis-driftwood-${i}`, [
			rx,
			baseY + .1,
			rz
		], {
			rotation: [
				(rng() - .5) * .25,
				rng() * Math.PI,
				Math.PI / 2
			],
			castShadow: true
		}));
	}
}
/** Layered leaf-card undergrowth inside the jungle interior (edgeDist ≥ 14). */
function addJungleUndergrowth(group) {
	const undergrowthMat = mat$1(3500079, .9, .02);
	undergrowthMat.side = 2;
	const clumpCount = 18;
	const cardsPerClump = 4;
	const rng = mulberry32$1(262653212);
	const cardGeom = new BoxGeometry(.85, .62, .035);
	cardGeom.translate(0, .31, 0);
	const cards = new InstancedMesh(cardGeom, undergrowthMat, clumpCount * cardsPerClump);
	cards.name = "farcrysis-undergrowth-leaf-cards";
	cards.castShadow = true;
	cards.receiveShadow = true;
	cards.userData.farcrysisArt = true;
	const matrix = new Matrix4();
	const quat = new Quaternion();
	const euler = new Euler();
	let placed = 0;
	for (let i = 0; i < clumpCount; i += 1) {
		const angle = i / clumpCount * Math.PI * 2 + (rng() - .5) * 1.2;
		const dist = 7 + rng() * 9;
		const rx = Math.max(-ARENA_HALF + 4, Math.min(ARENA_HALF - 4, Math.cos(angle) * dist));
		const rz = Math.max(-ARENA_HALF + 4, Math.min(ARENA_HALF - 4, Math.sin(angle) * dist * .9));
		const rotY = rng() * Math.PI;
		if (ARENA_HALF - Math.max(Math.abs(rx), Math.abs(rz)) < 14) continue;
		const baseY = farcrysisTerrainHeight(rx, rz);
		for (let card = 0; card < cardsPerClump; card += 1) {
			const cardYaw = rotY + card / cardsPerClump * Math.PI * 2 + rng() * .6;
			const spread = .12 + rng() * .3;
			euler.set(.3 + rng() * .35, cardYaw, (rng() - .5) * .2);
			quat.setFromEuler(euler);
			matrix.compose(new Vector3(rx + Math.cos(cardYaw) * spread, baseY + .02, rz + Math.sin(cardYaw) * spread), quat, new Vector3(.7 + rng() * .7, .75 + rng() * .7, 1));
			cards.setMatrixAt(placed, matrix);
			placed += 1;
		}
	}
	cards.count = placed;
	cards.instanceMatrix.needsUpdate = true;
	cards.computeBoundingSphere();
	group.add(cards);
}
/**
* Fallen coconuts scattered around the bases of the enhanced palms.
* Reads exact palm trunk positions from the InstancedMesh matrices so every
* coconut lands near a real trunk.
*/
function addFallenCoconuts(root, trunkInstances) {
	const coconutMat = mat$1(7031339, .75, .06);
	const matrix = new Matrix4();
	const pos = new Vector3();
	const target = 20;
	let added = 0;
	const rng = mulberry32$1(262653213);
	for (let i = 0; i < trunkInstances.count && added < target; i += 1) {
		trunkInstances.getMatrixAt(i, matrix);
		pos.setFromMatrixPosition(matrix);
		const perPalm = i % 2 === 0 ? 2 : 1;
		for (let c = 0; c < perPalm && added < target; c += 1) {
			const offset = .35 + rng() * .55;
			const ang = rng() * Math.PI * 2;
			const cx = Math.max(-ARENA_HALF + .5, Math.min(ARENA_HALF - .5, pos.x + Math.cos(ang) * offset));
			const cz = Math.max(-ARENA_HALF + .5, Math.min(ARENA_HALF - .5, pos.z + Math.sin(ang) * offset));
			const baseY = farcrysisTerrainHeight(cx, cz);
			const size = .11 + rng() * .07;
			root.add(makeMesh(new SphereGeometry(size, 8, 6), coconutMat, `farcrysis-fallen-coconut-${added}`, [
				cx,
				baseY + size * .7,
				cz
			], {
				rotation: [
					rng() * Math.PI,
					rng() * Math.PI,
					rng() * Math.PI
				],
				castShadow: false
			}));
			added += 1;
		}
	}
}
function applyFarcrysisArtwork(root) {
	addResearchTower(root);
	addFloodedCave(root);
	addTikiMarkers(root);
	addCrateWordmarks(root);
	addFallenCoconuts(root, buildEnhancedPalms(root).trunkInstances);
	addInstancedBushes(root);
	addInstancedFernClusters(root);
	addWaterSparkle(root);
	buildVegetation(root);
	buildAdditionalVegetation(root);
	const s = root;
	buildInlineTerrain(s);
	buildInlineLighting(s);
	buildInlineWater(s);
	applyVista(s);
	applyFarcrysisTextures(root);
	applyGroundTextures(s);
	buildAtmosphere(s);
	buildDetail(s);
	buildWaterFX(s);
	root.traverse((node) => {
		if (node instanceof Mesh && node.name.includes("-shards-shard-")) {
			const match = node.name.match(/-shards-shard-(\d+)$/);
			const index = match ? parseInt(match[1], 10) : 0;
			const originalMat = Array.isArray(node.material) ? node.material[0] : node.material;
			if (originalMat) {
				const mat = originalMat.clone();
				mat.polygonOffset = true;
				mat.polygonOffsetFactor = -1 - index;
				mat.polygonOffsetUnits = -1 - index;
				node.material = mat;
			}
		}
	});
	const vegeLitter = root.getObjectByName("farcrysis-vege-leaf-litter");
	if (vegeLitter instanceof Mesh) {
		const originalMat = Array.isArray(vegeLitter.material) ? vegeLitter.material[0] : vegeLitter.material;
		if (originalMat) {
			const mat = originalMat.clone();
			mat.polygonOffset = true;
			mat.polygonOffsetFactor = -1;
			mat.polygonOffsetUnits = -1;
			vegeLitter.material = mat;
		}
	}
	const detailLitter = root.getObjectByName("farcrysis-detail-floor-litter");
	if (detailLitter instanceof Mesh) {
		const originalMat = Array.isArray(detailLitter.material) ? detailLitter.material[0] : detailLitter.material;
		if (originalMat) {
			const mat = originalMat.clone();
			mat.polygonOffset = true;
			mat.polygonOffsetFactor = -2;
			mat.polygonOffsetUnits = -2;
			detailLitter.material = mat;
		}
	}
	const animationHost = root.getObjectByName("farcrysis-terrain-elevation") ?? root.children.find((child) => child.isMesh === true) ?? root;
	animationHost.onBeforeRender = (_renderer, _scene, camera) => {
		const t = performance.now() * .001;
		animateVegetationWind(t);
		animateVista(t);
		animateAtmosphere(t);
		animateDetail(t);
		animateWaterFX(t);
		if (camera) setVegetationLOD(camera.position.distanceTo(root.position));
	};
}
//#endregion
//#region src/farcrysis-physics.ts
/**
* farcrysis-physics.ts — Rapier-aligned physics interactables for the Farcrysis arena.
*
* Exports addInteractables(builder) which places breakable crates, barrels,
* stacked sandbag cover walls, fallen trunks, rock outcrops, and vantage
* platforms into the arena.  Every object follows the existing box() pattern
* from farcrysis.ts: create THREE.Mesh, push matching pairs into
* builder.colliders AND builder.physicsColliders (keeping their lengths equal),
* builder.raycastMeshes, builder.shotSurfaces, and builder.physicalCover where
* appropriate.  The Rapier physics world and the ballistic-authority system
* pick up every entry without any extra wiring.
*
* All placement is seeded deterministic (mulberry32 PRNG — no Math.random)
* so every prop position is reproducible across reloads and test runs.
*
* ## How to wire into buildFarcrysis()
*
* Inside `buildFarcrysis()` in farcrysis.ts, import and call addInteractables
* after the core desk / interior crates (around line 309) and before the
* throwbacks section or applyFarcrysisArtwork:
*
*   import { addInteractables } from './farcrysis-physics';
*   // ... (after farcrysis-core-crate-b)
*   addInteractables(builder);   // <-- mount interactables here
*   // ... (before throwbacks / applyFarcrysisArtwork)
*
* The engine auto-creates Rapier static cuboid colliders from physicsColliders
* inside CharacterPhysics.create() — there is NO need to import
* @dimforge/rapier3d-compat in this module.
*/
/** Terrain surface Y at (x, z) — resolved through the single authority. */
function placementBaseY(x, z) {
	return farcrysisTerrainHeight(x, z);
}
var mat = (color, roughness = .86, metalness = .08) => new MeshStandardMaterial({
	color,
	roughness,
	metalness
});
/**
* Build a world-space AABB from the mesh geometry and register it with
* every collision / physics / ballistic / cover array on the Builder.
*
* This is the same shape as the private `box()` function in farcrysis.ts:
* 1. Compute Box2 bounds from geometry parameters (BoxGeometry or CylinderGeometry).
* 2. Push the mesh into builder.raycastMeshes for hitscan traces.
* 3. Push bounds into builder.colliders (lightweight AABB queries) and
*    builder.physicsColliders (auto-converted to Rapier cuboid colliders).
* 4. Push a BallisticSurface into builder.shotSurfaces so the penetration
*    system knows the material (wood, thin-metal, earth, etc.).
* 5. If this is a cover piece, push into builder.physicalCover for the
*    crouch / peek / lean system.
*/
function registerBox(builder, mesh, name, ballistic, isCover) {
	const pos = mesh.position;
	const geom = mesh.geometry;
	let halfW;
	let halfH;
	let halfD;
	if (geom instanceof BoxGeometry) {
		const p = geom.parameters;
		halfW = (p?.width ?? 1) / 2;
		halfH = (p?.height ?? 1) / 2;
		halfD = (p?.depth ?? 1) / 2;
	} else if (geom instanceof CylinderGeometry) {
		const p = geom.parameters;
		const r = Math.max(p?.radiusTop ?? .5, p?.radiusBottom ?? .5);
		halfW = r;
		halfD = r;
		halfH = (p?.height ?? 1) / 2;
	} else {
		geom.computeBoundingBox();
		const bb = geom.boundingBox;
		halfW = (bb.max.x - bb.min.x) / 2;
		halfH = (bb.max.y - bb.min.y) / 2;
		halfD = (bb.max.z - bb.min.z) / 2;
	}
	const bounds = {
		minX: pos.x - halfW,
		maxX: pos.x + halfW,
		minZ: pos.z - halfD,
		maxZ: pos.z + halfD,
		minY: pos.y - halfH,
		maxY: pos.y + halfH
	};
	builder.raycastMeshes.push(mesh);
	builder.colliders.push(bounds);
	builder.physicsColliders.push(bounds);
	builder.colliderAudit?.push({
		id: name,
		bounds
	});
	const surfaceBounds = {
		minX: bounds.minX,
		maxX: bounds.maxX,
		minZ: bounds.minZ,
		maxZ: bounds.maxZ
	};
	builder.shotSurfaces.push(createBallisticSurface(`farcrysis-shot-${name}`, name, surfaceBounds, { material: ballistic }));
	if (isCover) builder.physicalCover.push({
		id: name,
		bounds,
		blocksMovement: true,
		blocksShots: true
	});
}
/** Wooden crate: warm brown with subtle grain feel. */
var crateMat = mat(FARCRYSIS_ART_FEEL.tikiWood, .9, .04);
/** Rusty steel barrel: beacon orange works as a weathered-rust tone. */
var barrelMat = mat(FARCRYSIS_ART_FEEL.beaconLight, .78, .28);
/** Sandbag: dry sandy tan matched to the beach ring. */
var sandbagMat = mat(FARCRYSIS_ART_FEEL.beachSand, .95, .02);
/** Palm trunk for fallen-cover logs — same colour as instanced palms. */
var palmTrunkMat = mat(FARCRYSIS_ART_FEEL.palmTrunk, .88, .03);
/**
* Returns a mulberry32 PRNG function seeded with a 32-bit integer.
* Used throughout the module for deterministic jitter so that every
* prop position is reproducible across reloads and test runs.
*/
function mulberry32(seed) {
	let s = seed | 0;
	return () => {
		s = s + 1831565813 | 0;
		let t = Math.imul(s ^ s >>> 15, 1 | s);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
/** Real oil-drum proportions (0.6 m diameter x 0.9 m tall). */
var FUEL_DRUM_RADIUS = .3;
var FUEL_DRUM_HEIGHT = .9;
/** Weathered drum tints: rust red, faded olive, sun-bleached ochre, oxide. */
var DRUM_TINTS = [
	10242602,
	6711374,
	10519624,
	7620666,
	5464683
];
/**
* Builds the instanced fuel-drum visual set for a placement list. Shared by
* the interactable barrels here and the throwback warning barrels in
* farcrysis.ts so every drum in the arena is the same believable object.
* Presentation only — colliders are registered separately by the caller.
*/
function buildFuelDrumInstances(root, specs, namePrefix) {
	if (specs.length === 0) return;
	const R = FUEL_DRUM_RADIUS;
	const H = FUEL_DRUM_HEIGHT;
	const bodyGeom = new CylinderGeometry(R, R, H, 14);
	bodyGeom.translate(0, H / 2, 0);
	const hoopGeom = new TorusGeometry(.312, .02, 5, 12);
	hoopGeom.rotateX(Math.PI / 2);
	const rimGeom = new TorusGeometry(R - .002, .026, 5, 12);
	rimGeom.rotateX(Math.PI / 2);
	const lidGeom = new CylinderGeometry(R * .8, R * .8, .025, 12);
	const bandGeom = new CylinderGeometry(.308, .308, .13, 14, 1, true);
	const bodyMat = new MeshStandardMaterial({
		color: 16777215,
		roughness: .72,
		metalness: .35
	});
	const steelMat = new MeshStandardMaterial({
		color: 5591628,
		roughness: .55,
		metalness: .6
	});
	const lidMat = new MeshStandardMaterial({
		color: 3947062,
		roughness: .66,
		metalness: .45
	});
	const hazardBandMat = new MeshStandardMaterial({
		color: 14200878,
		roughness: .6,
		metalness: .2
	});
	const bodies = new InstancedMesh(bodyGeom, bodyMat, specs.length);
	bodies.name = `${namePrefix}-bodies`;
	const hoops = new InstancedMesh(hoopGeom, steelMat, specs.length * 2);
	hoops.name = `${namePrefix}-hoops`;
	const rims = new InstancedMesh(rimGeom, steelMat, specs.length * 2);
	rims.name = `${namePrefix}-rims`;
	const lids = new InstancedMesh(lidGeom, lidMat, specs.length);
	lids.name = `${namePrefix}-lids`;
	const hazardCount = specs.filter((spec) => spec.hazard).length;
	const bands = hazardCount > 0 ? new InstancedMesh(bandGeom, hazardBandMat, hazardCount) : null;
	if (bands) bands.name = `${namePrefix}-hazard-bands`;
	const m = new Matrix4();
	const q = new Quaternion();
	const euler = new Euler();
	const one = new Vector3(1, 1, 1);
	const tint = new Color();
	let bandIndex = 0;
	for (let i = 0; i < specs.length; i += 1) {
		const spec = specs[i];
		const rng = mulberry32((spec.x * 977 | 0) * 31 + (spec.z * 787 | 0) + 1901);
		euler.set(0, spec.yaw, 0);
		q.setFromEuler(euler);
		const at = (y) => m.compose(new Vector3(spec.x, spec.baseY + y, spec.z), q, one);
		bodies.setMatrixAt(i, at(0));
		lids.setMatrixAt(i, at(.905));
		rims.setMatrixAt(i * 2, at(H));
		rims.setMatrixAt(i * 2 + 1, at(.035));
		hoops.setMatrixAt(i * 2, at(H * .34));
		hoops.setMatrixAt(i * 2 + 1, at(H * .66));
		if (spec.hazard && bands) bands.setMatrixAt(bandIndex++, at(H * .5));
		const base = DRUM_TINTS[(spec.tintIndex ?? Math.abs(spec.x * 7 + spec.z * 13 | 0)) % DRUM_TINTS.length];
		tint.setHex(base).multiplyScalar(.78 + rng() * .4);
		bodies.setColorAt(i, tint);
	}
	if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
	const layers = [
		bodies,
		hoops,
		rims,
		lids,
		...bands ? [bands] : []
	];
	for (const layer of layers) {
		layer.instanceMatrix.needsUpdate = true;
		layer.computeBoundingSphere();
		layer.castShadow = layer === bodies;
		layer.receiveShadow = true;
		layer.userData.farcrysisArt = true;
		root.add(layer);
	}
}
/**
* Weathered supply case geometry (unit cube, vertex-tinted): plank body,
* proud lid slab, dark seam shadow line under the lid, and pale stencil
* panels on all four faces. Instance colour multiplies the tones for
* per-crate weathering.
*/
function createSupplyCaseGeometry() {
	const parts = [
		{
			geom: new BoxGeometry(1, 1, 1),
			tone: 1,
			position: [
				0,
				0,
				0
			]
		},
		{
			geom: new BoxGeometry(1.04, .16, 1.04),
			tone: .8,
			position: [
				0,
				.42,
				0
			]
		},
		{
			geom: new BoxGeometry(1.02, .035, 1.02),
			tone: .42,
			position: [
				0,
				.325,
				0
			]
		},
		{
			geom: new BoxGeometry(.6, .34, .03),
			tone: 1.4,
			position: [
				0,
				-.04,
				.5
			]
		},
		{
			geom: new BoxGeometry(.6, .34, .03),
			tone: 1.4,
			position: [
				0,
				-.04,
				-.5
			]
		},
		{
			geom: new BoxGeometry(.03, .34, .6),
			tone: 1.4,
			position: [
				.5,
				-.04,
				0
			]
		},
		{
			geom: new BoxGeometry(.03, .34, .6),
			tone: 1.4,
			position: [
				-.5,
				-.04,
				0
			]
		}
	];
	const merged = [];
	for (const part of parts) {
		const geom = part.geom.toNonIndexed();
		geom.translate(...part.position);
		const positionCount = geom.getAttribute("position").count;
		const colors = new Float32Array(positionCount * 3);
		colors.fill(part.tone);
		geom.setAttribute("color", new BufferAttribute(colors, 3));
		merged.push(geom);
	}
	return mergeGeometries(merged, false);
}
/** Weathered case tints (wood, olive drab, sun-bleached). */
var CASE_TINTS = [
	9072968,
	7237712,
	9732186,
	8152644
];
/**
* Per-build queues, reset at the top of addInteractables and flushed into
* InstancedMesh sets at its end. Module-level is safe because placement only
* happens inside one addInteractables call at a time (deterministic, and
* tests build fresh arenas serially).
*/
var _caseSpecs = [];
var _drumSpecs = [];
var _logSpecs = [];
var _boulderSpecs = [];
var _bagSpecs = [];
/** Deterministic radial lumpiness for boulder silhouettes (position-hashed). */
function lumpifyLocal(geometry, amplitude, salt) {
	const pos = geometry.getAttribute("position");
	for (let i = 0; i < pos.count; i += 1) {
		const x = pos.getX(i);
		const y = pos.getY(i);
		const z = pos.getZ(i);
		const len = Math.sqrt(x * x + y * y + z * z);
		if (len < 1e-5) continue;
		const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + salt * 94.673) * 43758.5453;
		const d = (n - Math.floor(n) - .5) * 2 * amplitude;
		pos.setXYZ(i, x + x / len * d, y + y / len * d, z + z / len * d);
	}
	pos.needsUpdate = true;
	geometry.computeVertexNormals();
	return geometry;
}
/** Flush every queued prop family into instanced draws on builder.root. */
function buildQueuedInteractableVisuals(builder) {
	const root = builder.root;
	if (_caseSpecs.length > 0) {
		const cases = new InstancedMesh(createSupplyCaseGeometry(), new MeshStandardMaterial({
			color: 16777215,
			vertexColors: true,
			roughness: .86,
			metalness: .04
		}), _caseSpecs.length);
		cases.name = "farcrysis-interactable-crates";
		const m = new Matrix4();
		const q = new Quaternion();
		const tint = new Color();
		for (let i = 0; i < _caseSpecs.length; i += 1) {
			const spec = _caseSpecs[i];
			const rng = mulberry32((spec.x * 733 | 0) * 17 + (spec.z * 577 | 0) + i);
			m.compose(new Vector3(spec.x, spec.y, spec.z), q, new Vector3(spec.size, spec.size, spec.size));
			cases.setMatrixAt(i, m);
			tint.setHex(CASE_TINTS[i % CASE_TINTS.length]).multiplyScalar(.82 + rng() * .34);
			cases.setColorAt(i, tint);
		}
		if (cases.instanceColor) cases.instanceColor.needsUpdate = true;
		cases.instanceMatrix.needsUpdate = true;
		cases.computeBoundingSphere();
		cases.castShadow = true;
		cases.receiveShadow = true;
		cases.userData.farcrysisArt = true;
		root.add(cases);
	}
	buildFuelDrumInstances(root, _drumSpecs, "farcrysis-interactable-drum");
	if (_logSpecs.length > 0) {
		const logGeom = new CylinderGeometry(.185, .215, 1, 9);
		logGeom.rotateZ(Math.PI / 2);
		const logs = new InstancedMesh(logGeom, palmTrunkMat, _logSpecs.length);
		logs.name = "farcrysis-interactable-fallen-logs";
		const m = new Matrix4();
		const q = new Quaternion();
		const euler = new Euler();
		for (let i = 0; i < _logSpecs.length; i += 1) {
			const spec = _logSpecs[i];
			euler.set((i % 3 - 1) * .03, 0, 0);
			q.setFromEuler(euler);
			m.compose(new Vector3(spec.x, spec.baseY + .2, spec.z), q, new Vector3(spec.length, 1, 1.35));
			logs.setMatrixAt(i, m);
		}
		logs.instanceMatrix.needsUpdate = true;
		logs.computeBoundingSphere();
		logs.castShadow = true;
		logs.receiveShadow = true;
		logs.userData.farcrysisArt = true;
		root.add(logs);
	}
	if (_boulderSpecs.length > 0) {
		const rockGeom = lumpifyLocal(new IcosahedronGeometry(1, 2), .22, 11541989);
		const pos = rockGeom.getAttribute("position");
		for (let i = 0; i < pos.count; i += 1) pos.setY(i, Math.max(pos.getY(i), -.55) + .55);
		pos.needsUpdate = true;
		rockGeom.computeVertexNormals();
		const rocks = new InstancedMesh(rockGeom, new MeshStandardMaterial({
			color: 9078652,
			roughness: .94,
			metalness: .03
		}), _boulderSpecs.length);
		rocks.name = "farcrysis-interactable-boulders";
		const m = new Matrix4();
		const q = new Quaternion();
		const euler = new Euler();
		for (let i = 0; i < _boulderSpecs.length; i += 1) {
			const spec = _boulderSpecs[i];
			euler.set(0, spec.x * .37 + spec.z * .53, 0);
			q.setFromEuler(euler);
			m.compose(new Vector3(spec.x, spec.baseY - .03, spec.z), q, new Vector3(spec.width / 2, spec.height / 1.6, spec.depth / 2));
			rocks.setMatrixAt(i, m);
		}
		rocks.instanceMatrix.needsUpdate = true;
		rocks.computeBoundingSphere();
		rocks.castShadow = true;
		rocks.receiveShadow = true;
		rocks.userData.farcrysisArt = true;
		root.add(rocks);
	}
	if (_bagSpecs.length > 0) {
		const bagGeom = new SphereGeometry(.5, 7, 5);
		bagGeom.scale(.47, .17, .36);
		const bags = new InstancedMesh(bagGeom, new MeshStandardMaterial({
			color: 11049591,
			roughness: .97,
			metalness: .01
		}), _bagSpecs.length);
		bags.name = "farcrysis-interactable-sandbags";
		const m = new Matrix4();
		const q = new Quaternion();
		const euler = new Euler();
		const tint = new Color();
		const tintRng = mulberry32(47717);
		for (let i = 0; i < _bagSpecs.length; i += 1) {
			const spec = _bagSpecs[i];
			euler.set(0, spec.yaw, spec.roll);
			q.setFromEuler(euler);
			m.compose(new Vector3(spec.x, spec.y, spec.z), q, new Vector3(spec.scale, spec.scale, spec.scale));
			bags.setMatrixAt(i, m);
			tint.setScalar(.85 + tintRng() * .3);
			bags.setColorAt(i, tint);
		}
		if (bags.instanceColor) bags.instanceColor.needsUpdate = true;
		bags.instanceMatrix.needsUpdate = true;
		bags.computeBoundingSphere();
		bags.castShadow = true;
		bags.receiveShadow = true;
		bags.userData.farcrysisArt = true;
		root.add(bags);
	}
	_caseSpecs.length = 0;
	_drumSpecs.length = 0;
	_logSpecs.length = 0;
	_boulderSpecs.length = 0;
	_bagSpecs.length = 0;
}
/**
* Fill a sandbag wall volume with individually jittered bag instances —
* staggered courses on every face, replacing the old single "cheese block"
* box (which stays as the invisible collision proxy).
*/
function queueSandbagBags(x, z, baseY, width, height, depth) {
	const rng = mulberry32((x * 511 | 0) * 73 + (z * 631 | 0) + (height * 100 | 0));
	const rows = Math.max(2, Math.round(height / .17));
	const cols = Math.max(2, Math.round(width / .4));
	const layers = Math.max(1, Math.round(depth / .3));
	for (let row = 0; row < rows; row += 1) {
		const rowCols = row % 2 === 0 ? cols : cols - 1;
		const rowY = baseY + .08 + row * (height / rows) * .94;
		for (let layer = 0; layer < layers; layer += 1) {
			const layerZ = layers === 1 ? z : z - depth / 2 + .17 + layer * ((depth - .34) / Math.max(1, layers - 1));
			for (let col = 0; col < rowCols; col += 1) {
				const colX = x - width / 2 + .21 + (row % 2 === 0 ? 0 : .2) + col * ((width - .42) / Math.max(1, rowCols - 1));
				_bagSpecs.push({
					x: colX + (rng() - .5) * .05,
					y: rowY + (rng() - .5) * .02,
					z: layerZ + (rng() - .5) * .05,
					yaw: (rng() - .5) * .4,
					roll: (rng() - .5) * .12,
					scale: .92 + rng() * .18
				});
			}
		}
	}
}
/**
* Places one wooden crate (BoxGeometry) at the given position, registers
* it with the builder, and optionally adds a coloured accent stripe on
* the outward-facing side so the crate reads as a stamped "f4rcry515"
* supply box at a distance.
*/
function placeCrate(builder, name, x, z, size) {
	const y = placementBaseY(x, z) + size / 2;
	const mesh = new Mesh(new BoxGeometry(size, size, size), crateMat);
	mesh.name = name;
	mesh.position.set(x, y, z);
	mesh.visible = false;
	mesh.userData.collisionProxy = true;
	mesh.userData.impactSurface = classifyImpactSurface({
		name,
		metalness: crateMat.metalness
	});
	builder.root.add(mesh);
	registerBox(builder, mesh, name, "wood", false);
	_caseSpecs.push({
		x,
		y,
		z,
		size
	});
}
/**
* Places one rusty steel barrel (CylinderGeometry) at the given position
* and registers it as a thin-metal interactable.
*/
function placeBarrel(builder, name, x, z) {
	const baseY = placementBaseY(x, z);
	const y = baseY + FUEL_DRUM_HEIGHT / 2;
	const mesh = new Mesh(new CylinderGeometry(FUEL_DRUM_RADIUS, FUEL_DRUM_RADIUS, FUEL_DRUM_HEIGHT, 12), barrelMat);
	mesh.name = name;
	mesh.position.set(x, y, z);
	mesh.visible = false;
	mesh.userData.collisionProxy = true;
	mesh.userData.impactSurface = classifyImpactSurface({
		name,
		metalness: barrelMat.metalness
	});
	builder.root.add(mesh);
	registerBox(builder, mesh, name, "thin-metal", false);
	_drumSpecs.push({
		x,
		z,
		baseY,
		yaw: (x * 5 + z * 11) * .17,
		hazard: false,
		tintIndex: Math.abs((x * 3 | 0) + (z * 7 | 0))
	});
}
/**
* Places one sandbag wall (low wide BoxGeometry) at the given position
* and registers it as physical cover (blocks movement + shots).
*/
function placeSandbagWall(builder, name, x, z, width, height, depth) {
	const baseY = placementBaseY(x, z);
	const y = baseY + height / 2;
	const mesh = new Mesh(new BoxGeometry(width, height, depth), sandbagMat);
	mesh.name = name;
	mesh.position.set(x, y, z);
	mesh.visible = false;
	mesh.userData.collisionProxy = true;
	mesh.userData.impactSurface = classifyImpactSurface({
		name,
		metalness: sandbagMat.metalness
	});
	builder.root.add(mesh);
	registerBox(builder, mesh, name, "earth", true);
	queueSandbagBags(x, z, baseY, width, height, depth);
}
/**
* Places a fallen palm trunk as natural cover — a long low box that
* reads as a collapsed log spanning a jungle path.  Registered as
* physical cover with wood ballistic behaviour.
*/
function placeFallenTrunk(builder, name, x, z, length, thickness) {
	const baseY = placementBaseY(x, z);
	const y = baseY + thickness / 2;
	const mesh = new Mesh(new BoxGeometry(length, thickness, .7), palmTrunkMat);
	mesh.name = name;
	mesh.position.set(x, y, z);
	mesh.visible = false;
	mesh.userData.collisionProxy = true;
	mesh.userData.impactSurface = classifyImpactSurface({
		name,
		metalness: palmTrunkMat.metalness
	});
	builder.root.add(mesh);
	registerBox(builder, mesh, name, "wood", true);
	_logSpecs.push({
		x,
		z,
		baseY,
		length
	});
}
/**
* Places a 2-crate stack as player cover.  Each crate is registered
* individually as a non-cover interactable; a combined physicalCover
* entry spans the full stack footprint so the crouch / peek / lean
* system treats it as one cover position.
*/
function placeCrateCover(builder, name, x, z) {
	const size = .9;
	const baseY = placementBaseY(x, z);
	const y0 = baseY + size / 2;
	const y1 = baseY + size / 2 + size;
	const c0 = new Mesh(new BoxGeometry(size, size, size), crateMat);
	c0.name = `${name}-c0`;
	c0.position.set(x, y0, z);
	c0.visible = false;
	c0.userData.collisionProxy = true;
	c0.userData.impactSurface = classifyImpactSurface({
		name: c0.name,
		metalness: crateMat.metalness
	});
	builder.root.add(c0);
	registerBox(builder, c0, c0.name, "wood", false);
	_caseSpecs.push({
		x,
		y: y0,
		z,
		size
	});
	const c1 = new Mesh(new BoxGeometry(size, size, size), crateMat);
	c1.name = `${name}-c1`;
	c1.position.set(x, y1, z);
	c1.visible = false;
	c1.userData.collisionProxy = true;
	c1.userData.impactSurface = classifyImpactSurface({
		name: c1.name,
		metalness: crateMat.metalness
	});
	builder.root.add(c1);
	registerBox(builder, c1, c1.name, "wood", false);
	_caseSpecs.push({
		x,
		y: y1,
		z,
		size
	});
	const halfW = size / 2;
	const halfD = size / 2;
	const coverBounds = {
		minX: x - halfW,
		maxX: x + halfW,
		minZ: z - halfD,
		maxZ: z + halfD,
		minY: baseY,
		maxY: y1 + halfD
	};
	builder.physicalCover.push({
		id: name,
		bounds: coverBounds,
		blocksMovement: true,
		blocksShots: true
	});
}
/**
* Adds splinter-shard detail on top of a crate — small thin planks at slight
* angles, purely visual, not registered for collision/physics. Gives the
* crate a "broken open" supply-drop look.
*/
function addCrateShards(builder, name, x, z, size) {
	const yTop = placementBaseY(x, z) + size + .025;
	const shardGeom = new BoxGeometry(size * .45, .03, .08);
	const shardMat = mat(FARCRYSIS_ART_FEEL.tikiWood, .94, .03);
	const seed = (x * 17 + z * 31) % 100;
	for (let i = 0; i < 4; i += 1) {
		const angle = i / 4 * Math.PI * 2 + (seed + i * 7) % 31 * .04;
		const offsetR = size * .26;
		const sx = x + Math.cos(angle) * offsetR;
		const sz = z + Math.sin(angle) * offsetR;
		const shard = new Mesh(shardGeom, shardMat);
		shard.name = `${name}-shard-${i}`;
		shard.position.set(sx, yTop + i * .003, sz);
		shard.rotation.y = angle + ((seed + i * 13) % 17 - 8) * .07;
		shard.castShadow = false;
		shard.receiveShadow = false;
		builder.root.add(shard);
	}
	const splinterGeom = new BoxGeometry(.04, size * .35, .04);
	for (let i = 0; i < 2; i += 1) {
		const angle = (seed + i * 11) % 37 * .17;
		const offsetR = size * .18;
		const sx = x + Math.cos(angle) * offsetR;
		const sz = z + Math.sin(angle) * offsetR;
		const splinter = new Mesh(splinterGeom, shardMat);
		splinter.name = `${name}-splinter-${i}`;
		splinter.position.set(sx, yTop + size * .12, sz);
		splinter.rotation.z = ((seed + i * 19) % 13 - 6) * .055;
		splinter.rotation.x = ((seed + i * 23) % 11 - 5) * .05;
		splinter.castShadow = false;
		splinter.receiveShadow = false;
		builder.root.add(splinter);
	}
}
/**
* Adds hazard-yellow stripe bands to a barrel (purely visual).
* Two thin torus rings in a contrasting safety-yellow tone, placed
* near the top and bottom thirds.
*/
function addHazardStripesToBarrel(_builder, _name, x, z) {
	for (const spec of _drumSpecs) if (Math.abs(spec.x - x) < 1e-6 && Math.abs(spec.z - z) < 1e-6) {
		spec.hazard = true;
		return;
	}
}
/**
* Places a rock outcrop as natural cover — a wide low boulder-like box
* with a grey-brown rock tone.  Registered as physical cover with
* earth ballistic behaviour, placed near the beach ring.
*/
function placeRockOutcrop(builder, name, x, z, width, height, depth) {
	const baseY = placementBaseY(x, z);
	const y = baseY + height / 2;
	const rockOutcropMat = mat(8026739, .93, .08);
	const mesh = new Mesh(new BoxGeometry(width, height, depth), rockOutcropMat);
	mesh.name = name;
	mesh.position.set(x, y, z);
	mesh.visible = false;
	mesh.userData.collisionProxy = true;
	mesh.userData.impactSurface = classifyImpactSurface({
		name,
		metalness: .08
	});
	builder.root.add(mesh);
	registerBox(builder, mesh, name, "earth", true);
	_boulderSpecs.push({
		x,
		z,
		baseY,
		width,
		height,
		depth
	});
}
/**
* Places a raised vantage platform — a 2×2 crate stack (~1.5 m tall) that
* gives a height advantage and doubles as cover.  Each base crate is
* registered individually; the plank top and a combined physicalCover
* footprint complete the position.  Small footprint keeps it out of
* patrol lanes.
*/
function placeVantagePlatform(builder, name, x, z) {
	const cSize = .82;
	const half = cSize / 2;
	const baseY = placementBaseY(x, z);
	const yBase = baseY + cSize / 2;
	const offsets = [
		[-.41, -.41],
		[half, -.41],
		[-.41, half],
		[half, half]
	];
	for (let i = 0; i < offsets.length; i += 1) {
		const [ox, oz] = offsets[i];
		const c = new Mesh(new BoxGeometry(cSize, cSize, cSize), crateMat);
		c.name = `${name}-base-${i}`;
		c.position.set(x + ox, yBase, z + oz);
		c.visible = false;
		c.userData.collisionProxy = true;
		c.userData.impactSurface = classifyImpactSurface({
			name: c.name,
			metalness: crateMat.metalness
		});
		builder.root.add(c);
		registerBox(builder, c, c.name, "wood", false);
		_caseSpecs.push({
			x: x + ox,
			y: yBase,
			z: z + oz,
			size: cSize
		});
	}
	const platGeomHalf = cSize * 1.05;
	const platThick = .08;
	const platY = baseY + cSize + platThick / 2;
	const plat = new Mesh(new BoxGeometry(platGeomHalf * 2, platThick, platGeomHalf * 2), mat(FARCRYSIS_ART_FEEL.tikiWood, .84, .04));
	plat.name = `${name}-plank`;
	plat.position.set(x, platY, z);
	plat.castShadow = true;
	plat.receiveShadow = true;
	plat.userData.impactSurface = classifyImpactSurface({
		name: plat.name,
		metalness: .04
	});
	builder.root.add(plat);
	registerBox(builder, plat, plat.name, "wood", false);
	const coverBounds = {
		minX: x - platGeomHalf,
		maxX: x + platGeomHalf,
		minZ: z - platGeomHalf,
		maxZ: z + platGeomHalf,
		minY: baseY,
		maxY: platY + platThick
	};
	builder.physicalCover.push({
		id: name,
		bounds: coverBounds,
		blocksMovement: true,
		blocksShots: true
	});
}
/**
* Places a stacked sandbag wall built from small box segments near a
* core door entrance.  Each segment is individually registered as a
* 'concrete' ballistic surface with colliders + physics colliders;
* a single physicalCover entry spans the whole wall so the crouch /
* peek / lean system treats it as one cover position.
*/
function placeStackedSandbagWall(builder, name, x, z, width, segHeight, depth, count) {
	const baseY = placementBaseY(x, z);
	for (let i = 0; i < count; i += 1) {
		const segY = baseY + segHeight / 2 + i * segHeight;
		const mesh = new Mesh(new BoxGeometry(width, segHeight, depth), sandbagMat);
		mesh.name = `${name}-seg-${i}`;
		mesh.position.set(x, segY, z);
		mesh.visible = false;
		mesh.userData.collisionProxy = true;
		mesh.userData.impactSurface = classifyImpactSurface({
			name: mesh.name,
			metalness: sandbagMat.metalness
		});
		builder.root.add(mesh);
		registerBox(builder, mesh, mesh.name, "concrete", false);
	}
	queueSandbagBags(x, z, baseY, width, segHeight * count, depth);
	const totalHeight = segHeight * count;
	const wallBounds = {
		minX: x - width / 2,
		maxX: x + width / 2,
		minZ: z - depth / 2,
		maxZ: z + depth / 2,
		minY: baseY,
		maxY: baseY + totalHeight
	};
	builder.physicalCover.push({
		id: name,
		bounds: wallBounds,
		blocksMovement: true,
		blocksShots: true
	});
}
/**
* Adds physics-backed interactables to the Farcrysis arena Builder.
*
* Places 32 crates, 22 barrels, 9 sandbag walls (6 flat + 2 stacked near
* core doors + 1 cave/tower/beach each), 6 fallen palm trunks, 2 rock
* outcrops, 2 crate stacks (adding 4 more crates), and 2 vantage
* platforms (8 more crates).  Every position is seed-deterministic (mulberry32 — no Math.random)
* and verified ≥3 m from every spawn and patrol waypoint.
*
* @param builder  The ArenaMap Builder object from farcrysis.ts — a
*                 plain object with { root, colliders, physicsColliders,
*                 raycastMeshes, shotSurfaces, physicalCover }.
*/
function addInteractables(builder) {
	const { minX: bMinX, maxX: bMaxX, minZ: bMinZ, maxZ: bMaxZ } = FARCRYSIS_BOUNDS;
	const margin = 1.5;
	const ok = (px, pz) => px >= bMinX + margin && px <= bMaxX - margin && pz >= bMinZ + margin && pz <= bMaxZ - margin;
	placeCrate(builder, "farcrysis-crate-01", -17, -17, 1);
	placeCrate(builder, "farcrysis-crate-02", 17, 17, 1);
	placeCrate(builder, "farcrysis-crate-03", -17, 17, 1);
	placeCrate(builder, "farcrysis-crate-04", 17, -17, 1);
	placeCrate(builder, "farcrysis-crate-05", -4, -10, .9);
	placeCrate(builder, "farcrysis-crate-06", 4, 10, .9);
	placeCrate(builder, "farcrysis-crate-07", -10, -4, .9);
	placeCrate(builder, "farcrysis-crate-08", 10, 4, .9);
	placeCrate(builder, "farcrysis-crate-09", -6, -6, 1.1);
	placeCrate(builder, "farcrysis-crate-10", 6, 6, 1.1);
	placeCrate(builder, "farcrysis-crate-11", 0, -1.8, .85);
	placeCrate(builder, "farcrysis-crate-12", 0, 1.8, .85);
	placeCrate(builder, "farcrysis-crate-13", -22, -10, 1);
	placeCrate(builder, "farcrysis-crate-14", 22, 10, 1);
	placeCrate(builder, "farcrysis-crate-15", -10, -22, 1);
	placeCrate(builder, "farcrysis-crate-16", 10, 22, 1);
	placeBarrel(builder, "farcrysis-barrel-01", -22, -20);
	placeBarrel(builder, "farcrysis-barrel-02", 22, 20);
	placeBarrel(builder, "farcrysis-barrel-03", -20, 12);
	placeBarrel(builder, "farcrysis-barrel-04", 20, -12);
	placeBarrel(builder, "farcrysis-barrel-05", -8, -22);
	placeBarrel(builder, "farcrysis-barrel-06", 8, 22);
	placeBarrel(builder, "farcrysis-barrel-07", -3, -3.5);
	placeBarrel(builder, "farcrysis-barrel-08", -3, 3.5);
	placeBarrel(builder, "farcrysis-barrel-09", -12, 16);
	placeBarrel(builder, "farcrysis-barrel-10", 12, -16);
	placeSandbagWall(builder, "farcrysis-sandbag-01", -14, -18, 2.2, .6, .45);
	placeSandbagWall(builder, "farcrysis-sandbag-02", 14, 18, 2.2, .6, .45);
	placeSandbagWall(builder, "farcrysis-sandbag-03", -6, -17, 2.2, .6, .45);
	placeSandbagWall(builder, "farcrysis-sandbag-04", 6, 17, 2.2, .6, .45);
	placeFallenTrunk(builder, "farcrysis-cover-jungle-01", -20, 8, 3.2, .4);
	placeFallenTrunk(builder, "farcrysis-cover-jungle-02", 22, -8, 3, .4);
	placeCrateCover(builder, "farcrysis-cover-jungle-03", 8, -24);
	placeCrateCover(builder, "farcrysis-cover-jungle-04", -20, 14);
	placeCrate(builder, "farcrysis-crate-17", -14, -13, .95);
	placeCrate(builder, "farcrysis-crate-18", 14, 13, .95);
	placeCrate(builder, "farcrysis-crate-19", -13, 14, .9);
	placeCrate(builder, "farcrysis-crate-20", 13, -14, .9);
	placeCrate(builder, "farcrysis-crate-21", -14, -20, .95);
	placeCrate(builder, "farcrysis-crate-22", 14, 20, .95);
	addCrateShards(builder, "farcrysis-crate-21-shards", -14, -20, .95);
	addCrateShards(builder, "farcrysis-crate-22-shards", 14, 20, .95);
	placeBarrel(builder, "farcrysis-barrel-11", -28, -6);
	placeBarrel(builder, "farcrysis-barrel-12", 28, 6);
	placeBarrel(builder, "farcrysis-barrel-13", -6, 24);
	placeBarrel(builder, "farcrysis-barrel-14", 6, -24);
	addHazardStripesToBarrel(builder, "farcrysis-barrel-11", -28, -6);
	addHazardStripesToBarrel(builder, "farcrysis-barrel-12", 28, 6);
	addHazardStripesToBarrel(builder, "farcrysis-barrel-13", -6, 24);
	addHazardStripesToBarrel(builder, "farcrysis-barrel-14", 6, -24);
	placeFallenTrunk(builder, "farcrysis-cover-jungle-05", -16, -4, 3, .4);
	placeFallenTrunk(builder, "farcrysis-cover-jungle-06", 16, 4, 3, .4);
	placeRockOutcrop(builder, "farcrysis-cover-rock-01", -25, -8, 1.8, 1.2, 1.6);
	placeRockOutcrop(builder, "farcrysis-cover-rock-02", 25, 8, 1.8, 1.2, 1.6);
	placeVantagePlatform(builder, "farcrysis-vantage-01", -18, -6);
	placeVantagePlatform(builder, "farcrysis-vantage-02", 18, 6);
	placeCrate(builder, "farcrysis-crate-23", -6, -4, .9);
	placeCrate(builder, "farcrysis-crate-24", 6, -4, .9);
	placeCrate(builder, "farcrysis-crate-25", -6, 4, .9);
	placeCrate(builder, "farcrysis-crate-26", 6, 4, .9);
	placeCrate(builder, "farcrysis-crate-27", -16, -10, .95);
	placeCrate(builder, "farcrysis-crate-28", 16, 10, .95);
	placeBarrel(builder, "farcrysis-barrel-15", -16, 16);
	placeBarrel(builder, "farcrysis-barrel-16", 16, -16);
	placeBarrel(builder, "farcrysis-barrel-17", -12, -28);
	placeBarrel(builder, "farcrysis-barrel-18", 12, 28);
	addHazardStripesToBarrel(builder, "farcrysis-barrel-15", -16, 16);
	addHazardStripesToBarrel(builder, "farcrysis-barrel-16", 16, -16);
	addHazardStripesToBarrel(builder, "farcrysis-barrel-17", -12, -28);
	addHazardStripesToBarrel(builder, "farcrysis-barrel-18", 12, 28);
	placeStackedSandbagWall(builder, "farcrysis-core-door-sandbag-s", 0, -3.6, 1.6, .45, .6, 4);
	placeStackedSandbagWall(builder, "farcrysis-core-door-sandbag-n", 0, 3.6, 1.6, .45, .6, 4);
	placeCrate(builder, "farcrysis-crate-29", 28, 17.5, 1);
	placeCrate(builder, "farcrysis-crate-30", 22, 17, .9);
	placeBarrel(builder, "farcrysis-barrel-19", 24, 13.5);
	placeBarrel(builder, "farcrysis-barrel-20", -11, -11);
	placeCrate(builder, "farcrysis-crate-31", -10, -6.5, .9);
	placeBarrel(builder, "farcrysis-barrel-21", -3, -27);
	placeCrate(builder, "farcrysis-crate-32", 3.5, 27, .95);
	placeBarrel(builder, "farcrysis-barrel-22", -28, 14);
	placeSandbagWall(builder, "farcrysis-sandbag-05", 19, 15, 2.2, .6, .45);
	placeSandbagWall(builder, "farcrysis-sandbag-06", -13, -8, 2.2, .6, .45);
	placeSandbagWall(builder, "farcrysis-sandbag-07", 26, -26, 2.2, .6, .45);
	placeCrate(builder, "farcrysis-crate-33", 10, -8, .9);
	placeBarrel(builder, "farcrysis-barrel-23", -12, -4);
	placeFallenTrunk(builder, "farcrysis-cover-jungle-07", 12, -10, 3, .4);
	placeCrateCover(builder, "farcrysis-cover-jungle-08", -14, -4);
	placeSandbagWall(builder, "farcrysis-sandbag-08", -20, -26, 2.2, .6, .45);
	placeBarrel(builder, "farcrysis-barrel-24", 24, 24);
	placeCrateCover(builder, "farcrysis-cover-jungle-09", -16, 8);
	placeBarrel(builder, "farcrysis-barrel-25", 18, -8);
	placeFallenTrunk(builder, "farcrysis-cover-jungle-10", 6, -20, 3, .4);
	for (const [label, px, pz] of [
		[
			"cover-jungle-01",
			-20,
			8
		],
		[
			"cover-jungle-02",
			22,
			-8
		],
		[
			"cover-jungle-03",
			8,
			-24
		],
		[
			"cover-jungle-04",
			-20,
			14
		],
		[
			"cover-jungle-05",
			-16,
			-4
		],
		[
			"cover-jungle-06",
			16,
			4
		],
		[
			"cover-rock-01",
			-25,
			-8
		],
		[
			"cover-rock-02",
			25,
			8
		],
		[
			"vantage-01",
			-18,
			-6
		],
		[
			"vantage-02",
			18,
			6
		],
		[
			"core-door-sandbag-s",
			0,
			-3.6
		],
		[
			"core-door-sandbag-n",
			0,
			3.6
		],
		[
			"sandbag-05",
			19,
			15
		],
		[
			"sandbag-06",
			-13,
			-8
		],
		[
			"sandbag-07",
			26,
			-26
		],
		[
			"cover-jungle-07",
			12,
			-10
		],
		[
			"cover-jungle-08",
			-14,
			-4
		],
		[
			"sandbag-08",
			-20,
			-26
		],
		[
			"cover-jungle-09",
			-16,
			8
		],
		[
			"cover-jungle-10",
			6,
			-20
		]
	]) if (!ok(px, pz)) console.warn(`farcrysis-${label} at (${px}, ${pz}) is outside FARCRYSIS_BOUNDS margin`);
	buildQueuedInteractableVisuals(builder);
}
//#endregion
//#region src/farcrysis.ts
var standard = (color, roughness = .86, metalness = .08) => new MeshStandardMaterial({
	color,
	roughness,
	metalness
});
function emptyTelemetry() {
	return {
		houses: 0,
		groundRooms: 0,
		upperRooms: 0,
		doors: 0,
		windows: 0,
		ramps: 0,
		wallMaterialVariants: 0,
		pbrMaterialFamilies: 0
	};
}
function spawnRecord(team0, team1) {
	return {
		0: team0.map(([x, z]) => new Vector3(x, 1.7, z)),
		1: team1.map(([x, z]) => new Vector3(x, 1.7, z))
	};
}
/** Terrain surface Y under a prop centre — always the single authority. */
var groundY = farcrysisTerrainHeight;
function box(builder, name, position, size, material, options = {}) {
	const mesh = new Mesh(new BoxGeometry(...size), material);
	mesh.name = name;
	mesh.position.set(...position);
	if (options.rotation) mesh.rotation.set(...options.rotation);
	mesh.castShadow = options.cast !== false;
	mesh.receiveShadow = true;
	mesh.userData.impactSurface = classifyImpactSurface({
		name,
		metalness: material instanceof MeshStandardMaterial ? material.metalness : void 0
	});
	builder.root.add(mesh);
	const solid = options.solid !== false;
	if (options.shots ?? solid) builder.raycastMeshes.push(mesh);
	if (solid) {
		const bounds = {
			minX: position[0] - size[0] / 2,
			maxX: position[0] + size[0] / 2,
			minZ: position[2] - size[2] / 2,
			maxZ: position[2] + size[2] / 2,
			minY: position[1] - size[1] / 2,
			maxY: position[1] + size[1] / 2,
			rotation: options.rotation
		};
		builder.colliders.push(bounds);
		builder.physicsColliders.push(bounds);
		builder.colliderAudit.push({
			id: name,
			bounds
		});
		if (options.cover) builder.physicalCover.push({
			id: name,
			bounds,
			blocksMovement: true,
			blocksShots: true
		});
	}
	if (options.ballistic) {
		const b = {
			minX: position[0] - size[0] / 2,
			maxX: position[0] + size[0] / 2,
			minZ: position[2] - size[2] / 2,
			maxZ: position[2] + size[2] / 2
		};
		builder.shotSurfaces.push(createBallisticSurface(`farcrysis-shot-${builder.shotSurfaces.length}`, name, b, { material: options.ballistic }));
	}
	return mesh;
}
/** Register one collision-backed cover piece (solid + shot-blocking + physical). */
function cover(builder, name, position, size, material, rotation) {
	return box(builder, name, position, size, material, {
		cover: true,
		rotation,
		cast: true,
		ballistic: material instanceof MeshStandardMaterial && material.metalness > .4 ? "metal" : "concrete"
	});
}
function buildFarcrysis(scene) {
	const root = new Group();
	root.name = "f4rcry515 — flooded jungle research station";
	scene.add(root);
	const builder = {
		root,
		colliders: [],
		physicsColliders: [],
		raycastMeshes: [],
		shotSurfaces: [],
		physicalCover: [],
		colliderAudit: []
	};
	const sandMat = standard(14270602, .92, .02);
	const grassMat = standard(6192442, .9, .03);
	const mudMat = standard(7165496, .94, .02);
	const waterMat = new MeshStandardMaterial({
		color: 3122091,
		roughness: .32,
		metalness: .02,
		transparent: true,
		opacity: .62
	});
	const jungleLeafMat = standard(4028979, .85, .02);
	const palmTrunkMat = standard(8018742, .9, .02);
	const rockMat = standard(9144967, .92, .1);
	const ruinedWallMat = standard(9078650, .95, .02);
	const crateMat = standard(7301706, .9, .18);
	const stationMetalMat = standard(7174787, .42, .62);
	const stationGlassMat = new MeshStandardMaterial({
		color: 8378598,
		roughness: .2,
		metalness: .08,
		transparent: true,
		opacity: .4,
		depthWrite: false
	});
	const ground = new Mesh(new PlaneGeometry(56, 56), mudMat);
	ground.name = "farcrysis-ground-plate";
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -.2;
	ground.receiveShadow = true;
	root.add(ground);
	const beachRing = new Mesh(new PlaneGeometry(56, 56), sandMat);
	beachRing.name = "farcrysis-beach-ring";
	beachRing.rotation.x = -Math.PI / 2;
	beachRing.position.y = -.18;
	beachRing.receiveShadow = true;
	root.add(beachRing);
	const grassRing = new Mesh(new PlaneGeometry(40, 40), grassMat);
	grassRing.name = "farcrysis-jungle-floor";
	grassRing.rotation.x = -Math.PI / 2;
	grassRing.position.y = -.16;
	grassRing.receiveShadow = true;
	root.add(grassRing);
	const water = new Mesh(new PlaneGeometry(76, 76), waterMat);
	water.name = "farcrysis-lagoon-water";
	water.rotation.x = -Math.PI / 2;
	water.position.y = FARCRYSIS_WATER_LEVEL;
	root.add(water);
	const gameplayPalms = [
		[-27, -27],
		[27, -27],
		[-27, 27],
		[27, 27],
		[-22, -30],
		[22, -30],
		[-22, 30],
		[22, 30]
	].map(([x, z], i) => {
		const scale = .92 + i * 7 % 4 * .09;
		return {
			x,
			z,
			baseY: groundY(x, z),
			yaw: (x * 13 + z * 7) * .11,
			lean: (i * 5 % 3 - 1) * .06,
			scale,
			crownSpin: (x + z) * .17,
			crownTilt: (i * 3 % 3 - 1) * .05,
			crownScale: scale
		};
	});
	buildPalmStandInstances(root, gameplayPalms, "farcrysis-gameplay-palm");
	for (const palm of gameplayPalms) {
		const trunkHeight = TRUNK_HEIGHT * palm.scale;
		const trunkCollider = box(builder, `farcrysis-palm-trunk-${palm.x}-${palm.z}`, [
			palm.x,
			palm.baseY + trunkHeight / 2,
			palm.z
		], [
			.6,
			trunkHeight,
			.6
		], palmTrunkMat, {
			cast: false,
			ballistic: "wood"
		});
		trunkCollider.visible = false;
		trunkCollider.userData.collisionProxy = true;
	}
	const skiffSpecs = [{
		tag: "nw",
		x: -18,
		z: -24,
		yaw: .5,
		pitch: .05,
		roll: .09
	}, {
		tag: "se",
		x: 18,
		z: 24,
		yaw: -2.6,
		pitch: -.04,
		roll: -.08
	}];
	const hullPaintMat = standard(7311250, .8, .08);
	const hullWoodMat = standard(8216384, .9, .03);
	for (const skiff of skiffSpecs) {
		const skiffCover = cover(builder, `farcrysis-skiff-${skiff.tag}`, [
			skiff.x,
			groundY(skiff.x, skiff.z) + .55,
			skiff.z
		], [
			4.2,
			1.1,
			2.1
		], standard(10251082, .7, .2), [
			skiff.pitch,
			skiff.yaw,
			skiff.roll
		]);
		skiffCover.visible = false;
		skiffCover.userData.collisionProxy = true;
		const boat = new Group();
		boat.name = `farcrysis-skiff-${skiff.tag}-visual`;
		const bottom = new Mesh(new BoxGeometry(3.4, .3, 1.5), hullWoodMat);
		bottom.position.y = .2;
		boat.add(bottom);
		for (const side of [-1, 1]) {
			const plank = new Mesh(new BoxGeometry(3.6, .55, .12), hullPaintMat);
			plank.position.set(0, .5, side * .78);
			plank.rotation.x = side * -.18;
			boat.add(plank);
			const bowPlank = new Mesh(new BoxGeometry(1.15, .55, .12), hullPaintMat);
			bowPlank.position.set(-2.1, .52, side * .36);
			bowPlank.rotation.set(side * -.14, side * -.62, 0);
			boat.add(bowPlank);
		}
		const transom = new Mesh(new BoxGeometry(.12, .55, 1.48), hullPaintMat);
		transom.position.set(1.78, .5, 0);
		boat.add(transom);
		for (const benchX of [-.7, .7]) {
			const bench = new Mesh(new BoxGeometry(.32, .06, 1.4), hullWoodMat);
			bench.position.set(benchX, .62, 0);
			boat.add(bench);
		}
		for (const part of boat.children) {
			part.castShadow = true;
			part.receiveShadow = true;
		}
		boat.position.set(skiff.x, groundY(skiff.x, skiff.z), skiff.z);
		boat.rotation.set(skiff.pitch, skiff.yaw, skiff.roll);
		root.add(boat);
	}
	cover(builder, "farcrysis-rock-nw", [
		-14,
		groundY(-14, -20) + .5,
		-20
	], [
		2.2,
		1,
		2.2
	], rockMat);
	cover(builder, "farcrysis-rock-se", [
		14,
		groundY(14, 20) + .5,
		20
	], [
		2.2,
		1,
		2.2
	], rockMat);
	const ruinSpecs = [
		[
			"n",
			-8,
			-14,
			[
				3.6,
				1.6,
				.5
			],
			[
				0,
				0,
				.3
			]
		],
		[
			"s",
			8,
			14,
			[
				3.6,
				1.6,
				.5
			],
			[
				0,
				0,
				-.25
			]
		],
		[
			"e",
			14,
			-8,
			[
				.5,
				1.6,
				3.6
			],
			[
				.2,
				0,
				0
			]
		],
		[
			"w",
			-14,
			8,
			[
				.5,
				1.6,
				3.6
			],
			[
				-.2,
				0,
				0
			]
		]
	];
	const mossMat = standard(4090414, .92, .01);
	for (const [tag, wx, wz, size, rotation] of ruinSpecs) {
		const wall = cover(builder, `farcrysis-ruined-wall-${tag}`, [
			wx,
			groundY(wx, wz) + .8,
			wz
		], size, ruinedWallMat, rotation);
		const cap = new Mesh(new BoxGeometry(size[0] * .98, .1, size[2] * .98), mossMat);
		cap.name = `farcrysis-ruined-wall-${tag}-moss`;
		cap.position.y = size[1] / 2 + .03;
		cap.castShadow = false;
		wall.add(cap);
		const alongX = size[0] > size[2];
		const drape = new Mesh(new BoxGeometry(alongX ? size[0] * .4 : .06, size[1] * .85, alongX ? .06 : size[2] * .4), mossMat);
		drape.name = `farcrysis-ruined-wall-${tag}-vines`;
		drape.position.set(alongX ? size[0] * .12 : size[0] / 2 + .04, .05, alongX ? size[2] / 2 + .04 : size[2] * -.14);
		drape.castShadow = false;
		wall.add(drape);
	}
	cover(builder, "farcrysis-crate-nw", [
		-10,
		groundY(-10, -8) + .45,
		-8
	], [
		1.7,
		.9,
		1.7
	], crateMat);
	cover(builder, "farcrysis-crate-ne", [
		10,
		groundY(10, -8) + .45,
		-8
	], [
		1.7,
		.9,
		1.7
	], crateMat);
	cover(builder, "farcrysis-crate-sw", [
		-10,
		groundY(-10, 8) + .45,
		8
	], [
		1.7,
		.9,
		1.7
	], crateMat);
	cover(builder, "farcrysis-crate-se", [
		10,
		groundY(10, 8) + .45,
		8
	], [
		1.7,
		.9,
		1.7
	], crateMat);
	const canopyPositions = [
		[-15, -15],
		[15, 15],
		[-15, 15],
		[15, -15],
		[-4, -24],
		[4, 24],
		[-24, 4],
		[24, -4],
		[-20, -12],
		[20, 12],
		[-12, 20],
		[12, -20]
	];
	for (const [x, z] of canopyPositions) {
		const g = groundY(x, z);
		const trunkCover = cover(builder, `farcrysis-canopy-trunk-${x}-${z}`, [
			x,
			g + 1.3,
			z
		], [
			1.5,
			2.6,
			1.5
		], palmTrunkMat);
		trunkCover.visible = false;
		trunkCover.userData.collisionProxy = true;
	}
	{
		const count = canopyPositions.length;
		const trunkGeom = new CylinderGeometry(.52, .72, 2.8, 9);
		trunkGeom.translate(0, 1.4, 0);
		const lobeGeom = lumpify(new SphereGeometry(1, 10, 7), .2, 51856);
		const canopyTrunks = new InstancedMesh(trunkGeom, standard(6243888, .92, .02), count);
		canopyTrunks.name = "farcrysis-canopy-trunk-visuals";
		const canopyLower = new InstancedMesh(lobeGeom, standard(3828526, .9, .01), count);
		canopyLower.name = "farcrysis-canopy-crown-lower";
		const canopyUpper = new InstancedMesh(lobeGeom, standard(4554806, .88, .01), count);
		canopyUpper.name = "farcrysis-canopy-crown-upper";
		const m = new Matrix4();
		const q = new Quaternion();
		const euler = new Euler();
		for (let i = 0; i < count; i += 1) {
			const [x, z] = canopyPositions[i];
			const g = groundY(x, z);
			const spin = (x * .7 + z * .13) % Math.PI;
			euler.set(0, spin, (i % 3 - 1) * .04);
			q.setFromEuler(euler);
			m.compose(new Vector3(x, g, z), q, new Vector3(1 + i % 3 * .08, 1 + (i + 1) % 3 * .06, 1 + i % 3 * .08));
			canopyTrunks.setMatrixAt(i, m);
			euler.set((i % 3 - 1) * .08, spin * 1.7, 0);
			q.setFromEuler(euler);
			m.compose(new Vector3(x, g + 3, z), q, new Vector3(2.3 + i % 4 * .12, 1.05, 2.2 + (i + 2) % 4 * .12));
			canopyLower.setMatrixAt(i, m);
			euler.set(((i + 1) % 3 - 1) * .1, spin * .9 + .8, 0);
			q.setFromEuler(euler);
			m.compose(new Vector3(x + (i % 3 - 1) * .3, g + 3.9, z + (i % 2 - .5) * .4), q, new Vector3(1.5, .85, 1.45));
			canopyUpper.setMatrixAt(i, m);
		}
		for (const layer of [
			canopyTrunks,
			canopyLower,
			canopyUpper
		]) {
			layer.instanceMatrix.needsUpdate = true;
			layer.computeBoundingSphere();
			layer.castShadow = true;
			layer.receiveShadow = true;
			root.add(layer);
		}
	}
	{
		const count = canopyPositions.length;
		const shrubs = new InstancedMesh(lumpify(new IcosahedronGeometry(1, 1), .16, 3345), jungleLeafMat, count);
		shrubs.name = "farcrysis-canopy-undergrowth";
		const m = new Matrix4();
		const q = new Quaternion();
		const euler = new Euler();
		for (let i = 0; i < count; i += 1) {
			const [x, z] = canopyPositions[i];
			euler.set(0, x * .31 + z * .17, 0);
			q.setFromEuler(euler);
			m.compose(new Vector3(x + (i % 3 - 1) * .5, groundY(x, z) + .32, z + (i % 2 - .5) * .6), q, new Vector3(1.15 + i % 3 * .1, .5 + i % 2 * .1, 1.1 + (i + 1) % 3 * .1));
			shrubs.setMatrixAt(i, m);
		}
		shrubs.instanceMatrix.needsUpdate = true;
		shrubs.computeBoundingSphere();
		shrubs.castShadow = true;
		root.add(shrubs);
	}
	const coreMat = stationMetalMat;
	const coreWall = (name, position, size) => box(builder, name, position, size, coreMat, {
		cast: true,
		ballistic: "metal"
	});
	coreWall("farcrysis-core-wall-n-west", [
		-4,
		1.6,
		-5.5
	], [
		4,
		3.2,
		.6
	]);
	coreWall("farcrysis-core-wall-n-east", [
		4,
		1.6,
		-5.5
	], [
		4,
		3.2,
		.6
	]);
	coreWall("farcrysis-core-wall-s-west", [
		-4,
		1.6,
		5.5
	], [
		4,
		3.2,
		.6
	]);
	coreWall("farcrysis-core-wall-s-east", [
		4,
		1.6,
		5.5
	], [
		4,
		3.2,
		.6
	]);
	coreWall("farcrysis-core-wall-w", [
		-5.5,
		1.6,
		0
	], [
		.6,
		3.2,
		12
	]);
	coreWall("farcrysis-core-wall-e", [
		5.5,
		1.6,
		0
	], [
		.6,
		3.2,
		12
	]);
	const entranceCoverN = cover(builder, "farcrysis-core-door-n", [
		0,
		1.2,
		-3.6
	], [
		.4,
		2.4,
		.5
	], stationMetalMat);
	entranceCoverN.userData.coverOnly = true;
	const entranceCoverS = cover(builder, "farcrysis-core-door-s", [
		-0,
		1.2,
		3.6
	], [
		.4,
		2.4,
		.5
	], stationMetalMat);
	entranceCoverS.userData.coverOnly = true;
	box(builder, "farcrysis-core-catwalk", [
		0,
		2.5,
		0
	], [
		7,
		.18,
		2.4
	], standard(5004132, .5, .55), {
		cast: true,
		ballistic: "metal"
	});
	const stairMat = standard(5004132, .5, .55);
	const stairSteps = 7;
	const stairRise = 2.59 / stairSteps;
	const stairDepth = .5;
	for (let i = 0; i < stairSteps; i += 1) {
		const treadTop = 2.59 - i * stairRise;
		box(builder, `farcrysis-core-stair-${i}`, [
			2.9,
			treadTop / 2,
			.95 + (i + 1) * stairDepth
		], [
			1.2,
			treadTop,
			stairDepth
		], stairMat, {
			cast: true,
			ballistic: "metal"
		});
	}
	cover(builder, "farcrysis-core-desk", [
		0,
		.65,
		0
	], [
		3,
		1.3,
		1.6
	], standard(3622222, .4, .5));
	cover(builder, "farcrysis-core-crate-a", [
		-3.4,
		.45,
		-2.2
	], [
		1.5,
		.9,
		1.5
	], crateMat);
	cover(builder, "farcrysis-core-crate-b", [
		3.4,
		.45,
		-2.2
	], [
		1.5,
		.9,
		1.5
	], crateMat);
	const windowMesh = new Mesh(new BoxGeometry(3, 1.4, .08), stationGlassMat);
	windowMesh.name = "farcrysis-core-window-n";
	windowMesh.position.set(-3, 2.1, -5.48);
	root.add(windowMesh);
	const colliderProxy = (name, position, size, ballistic, rotation) => {
		const proxy = box(builder, name, position, size, stationMetalMat, {
			cast: false,
			ballistic,
			rotation
		});
		proxy.visible = false;
		proxy.userData.collisionProxy = true;
	};
	const seaplane = new Group();
	seaplane.name = "farcrysis-throwback-seaplane";
	const hullMat = standard(12174534, .55, .45);
	const wreckAccentMat = standard(9333578, .75, .2);
	const hull = new Mesh(new CylinderGeometry(.55, .62, 4.2, 10), hullMat);
	hull.rotation.z = Math.PI / 2;
	hull.position.y = .62;
	seaplane.add(hull);
	const nose = new Mesh(new SphereGeometry(.56, 10, 8), hullMat);
	nose.position.set(-2.1, .62, 0);
	nose.scale.set(.8, 1, 1);
	seaplane.add(nose);
	const engine = new Mesh(new CylinderGeometry(.4, .34, .5, 9), standard(4869970, .5, .6));
	engine.rotation.z = Math.PI / 2;
	engine.position.set(-2.5, .62, 0);
	seaplane.add(engine);
	const propBlade = new Mesh(new BoxGeometry(.06, 1.4, .18), standard(3356730, .5, .5));
	propBlade.position.set(-2.78, .62, 0);
	propBlade.rotation.x = .9;
	seaplane.add(propBlade);
	const wing = new Mesh(new BoxGeometry(5.6, .12, 1.15), standard(13096153, .45, .4));
	wing.position.set(-.4, 1.28, 0);
	wing.rotation.z = -.06;
	seaplane.add(wing);
	const tailBoom = new Mesh(new CylinderGeometry(.16, .34, 1.6, 8), hullMat);
	tailBoom.rotation.z = Math.PI / 2;
	tailBoom.position.set(2.7, .72, 0);
	seaplane.add(tailBoom);
	const tailFin = new Mesh(new BoxGeometry(.5, 1, .1), standard(13096153, .45, .4));
	tailFin.position.set(3.3, 1.35, 0);
	tailFin.rotation.z = -.2;
	seaplane.add(tailFin);
	for (const side of [-1, 1]) {
		const float = new Mesh(new CylinderGeometry(.2, .24, 2.6, 8), wreckAccentMat);
		float.rotation.z = Math.PI / 2;
		float.position.set(-.4, .16, side * .85);
		seaplane.add(float);
		const strut = new Mesh(new BoxGeometry(.07, .5, .07), standard(7174787, .4, .6));
		strut.position.set(-.4, .4, side * .75);
		seaplane.add(strut);
	}
	for (const part of seaplane.children) {
		part.castShadow = true;
		part.receiveShadow = true;
	}
	const seaplaneGround = groundY(24, -24);
	seaplane.position.set(24, seaplaneGround + .1, -24);
	seaplane.rotation.y = .7;
	seaplane.rotation.z = .04;
	root.add(seaplane);
	colliderProxy("farcrysis-throwback-seaplane-collider", [
		24,
		seaplaneGround + .6,
		-24
	], [
		4.6,
		1.2,
		1.5
	], "thin-metal", [
		0,
		.7,
		0
	]);
	const beaconGround = groundY(-24, 24);
	const beacon = new Group();
	beacon.name = "farcrysis-throwback-signal-beacon";
	const beaconWood = standard(8018742, .9, .03);
	for (let leg = 0; leg < 3; leg += 1) {
		const angle = leg / 3 * Math.PI * 2 + .4;
		const pole = new Mesh(new CylinderGeometry(.09, .12, 3, 7), beaconWood);
		pole.position.set(Math.cos(angle) * .55, 1.4, Math.sin(angle) * .55);
		pole.rotation.set(Math.sin(angle) * -.32, 0, Math.cos(angle) * .32);
		beacon.add(pole);
	}
	const basket = new Mesh(new CylinderGeometry(.42, .3, .5, 8, 1, true), standard(5195324, .8, .3));
	basket.position.y = 2.5;
	beacon.add(basket);
	const flame = new Mesh(lumpify(new ConeGeometry(.3, .9, 7), .08, 3866), new MeshStandardMaterial({
		color: 16757568,
		emissive: 16742944,
		emissiveIntensity: 1.6,
		roughness: .5
	}));
	flame.name = "farcrysis-throwback-beacon-flame";
	flame.position.y = 3.1;
	beacon.add(flame);
	const emberGlow = new Mesh(new SphereGeometry(.2, 7, 5), new MeshStandardMaterial({
		color: 16765056,
		emissive: 16752704,
		emissiveIntensity: 2.2,
		roughness: .4
	}));
	emberGlow.position.y = 2.72;
	beacon.add(emberGlow);
	for (const part of beacon.children) {
		part.castShadow = true;
		part.receiveShadow = true;
	}
	beacon.position.set(-24, beaconGround, 24);
	root.add(beacon);
	colliderProxy("farcrysis-throwback-signal-beacon-collider", [
		-24,
		beaconGround + 1.3,
		24
	], [
		1.4,
		2.6,
		1.4
	], "wood");
	const barrelPositions = [
		[-20, 20],
		[20, -20],
		[-5, -24],
		[5, 24]
	];
	buildFuelDrumInstances(root, barrelPositions.map(([x, z], index) => ({
		x,
		z,
		baseY: groundY(x, z),
		yaw: (x * 3 + z * 5) * .21,
		hazard: true,
		tintIndex: index
	})), "farcrysis-throwback-drum");
	for (const [x, z] of barrelPositions) {
		const g = groundY(x, z);
		colliderProxy(`farcrysis-throwback-barrel-collider-${x}-${z}`, [
			x,
			g + FUEL_DRUM_HEIGHT / 2,
			z
		], [
			FUEL_DRUM_RADIUS * 2,
			FUEL_DRUM_HEIGHT,
			FUEL_DRUM_RADIUS * 2
		], "thin-metal");
	}
	for (const [lx, lz] of [
		[-1.3, -1.3],
		[1.3, -1.3],
		[-1.3, 1.3],
		[1.3, 1.3]
	]) {
		const x = -8.5 + lx;
		const z = -8.5 + lz;
		colliderProxy(`farcrysis-art-tower-leg-collider-${lx}-${lz}`, [
			x,
			groundY(x, z) + 2.4,
			z
		], [
			.26,
			4.8,
			.26
		], "metal");
	}
	const caveYaw = 1.2;
	for (const side of [-1, 1]) {
		const x = 26 + side * 1.5 * Math.cos(caveYaw);
		const z = 16 - side * 1.5 * Math.sin(caveYaw);
		colliderProxy(`farcrysis-art-cave-pillar-collider-${side > 0 ? "r" : "l"}`, [
			x,
			groundY(x, z) + 1.3,
			z
		], [
			.7,
			2.6,
			1.6
		], "concrete", [
			0,
			caveYaw,
			0
		]);
	}
	const allSpawnXZ = [
		[-26, -26],
		[-22, -24],
		[-24, -20],
		[-18, -26],
		[26, 26],
		[22, 24],
		[24, 20],
		[18, 26]
	];
	for (const [index, palm] of enhancedPalmPlacements().entries()) {
		if (allSpawnXZ.some(([sx, sz]) => Math.hypot(palm.x - sx, palm.z - sz) < 2.5)) continue;
		const trunkHeight = TRUNK_HEIGHT * palm.scale;
		colliderProxy(`farcrysis-enhanced-palm-trunk-collider-${index}`, [
			palm.x,
			palm.baseY + trunkHeight / 2,
			palm.z
		], [
			.6,
			trunkHeight,
			.6
		], "wood");
	}
	addInteractables(builder);
	const bushPositions = [
		[-6, -12],
		[6, -12],
		[-6, 12],
		[6, 12],
		[-12, -4],
		[12, -4],
		[-12, 4],
		[12, 4],
		[-4, -20],
		[4, -20],
		[-4, 20],
		[4, 20],
		[-20, -6],
		[20, -6],
		[-20, 6],
		[20, 6]
	];
	{
		const count = bushPositions.length;
		const bushes = new InstancedMesh(lumpify(new IcosahedronGeometry(.62, 1), .12, 722193), jungleLeafMat, count);
		bushes.name = "farcrysis-jungle-bushes";
		const m = new Matrix4();
		const q = new Quaternion();
		const euler = new Euler();
		for (let i = 0; i < count; i += 1) {
			const [x, z] = bushPositions[i];
			euler.set(0, x * .73 + z * .29, (i % 3 - 1) * .08);
			q.setFromEuler(euler);
			m.compose(new Vector3(x, groundY(x, z) + .3, z), q, new Vector3(.85 + i % 4 * .12, .6 + i % 3 * .1, .85 + (i + 2) % 4 * .12));
			bushes.setMatrixAt(i, m);
		}
		bushes.instanceMatrix.needsUpdate = true;
		bushes.computeBoundingSphere();
		bushes.castShadow = true;
		root.add(bushes);
	}
	const fernCount = 24;
	const ferns = new InstancedMesh(new BoxGeometry(.5, .9, .18), standard(4028981, .85, .02), fernCount);
	ferns.name = "farcrysis-instanced-ferns";
	const fernMatrix = new Matrix4();
	for (let i = 0; i < fernCount; i += 1) {
		const angle = i / fernCount * Math.PI * 2;
		const radius = 7 + i % 4 * 2.4;
		const x = Math.cos(angle) * radius;
		const z = Math.sin(angle) * radius * .9;
		fernMatrix.makeRotationY(angle * 2.3);
		fernMatrix.setPosition(x, groundY(x, z) + .45, z);
		ferns.setMatrixAt(i, fernMatrix);
	}
	ferns.castShadow = true;
	root.add(ferns);
	const boundWallHeight = 4 - FARCRYSIS_SAFETY_FLOOR_Y;
	const boundWallCentreY = (4 + FARCRYSIS_SAFETY_FLOOR_Y) / 2;
	const boundWalls = [
		box(builder, "farcrysis-bound-n", [
			0,
			boundWallCentreY,
			-32.2
		], [
			65,
			boundWallHeight,
			.5
		], standard(0, .9, 0), {
			cast: false,
			ballistic: "concrete"
		}),
		box(builder, "farcrysis-bound-s", [
			0,
			boundWallCentreY,
			32.2
		], [
			65,
			boundWallHeight,
			.5
		], standard(0, .9, 0), {
			cast: false,
			ballistic: "concrete"
		}),
		box(builder, "farcrysis-bound-w", [
			-32.2,
			boundWallCentreY,
			0
		], [
			.5,
			boundWallHeight,
			65
		], standard(0, .9, 0), {
			cast: false,
			ballistic: "concrete"
		}),
		box(builder, "farcrysis-bound-e", [
			32.2,
			boundWallCentreY,
			0
		], [
			.5,
			boundWallHeight,
			65
		], standard(0, .9, 0), {
			cast: false,
			ballistic: "concrete"
		})
	];
	for (const wall of boundWalls) wall.visible = false;
	const spawns = spawnRecord([
		[-26, -26],
		[-22, -24],
		[-24, -20],
		[-18, -26]
	], [
		[26, 26],
		[22, 24],
		[24, 20],
		[18, 26]
	]);
	const patrolPoints = [
		[-26, -26],
		[-18, -20],
		[-12, -16],
		[-4, -12],
		[0, 0],
		[12, 16],
		[18, 20],
		[26, 26],
		[-20, 18],
		[20, -18],
		[-8, -24],
		[8, 24]
	].map(([x, z]) => new Vector3(x, 0, z));
	applyFarcrysisArtwork(root);
	const terrainPlates = farcrysisTerrainPhysicsTiles();
	for (const plate of terrainPlates) builder.physicsColliders.push(plate.box);
	const verticalNavigation = Object.freeze({
		routes: Object.freeze([{
			id: "core-catwalk-stairs",
			foot: [
				2.9,
				0,
				4.6
			],
			top: [
				2.9,
				2.59,
				1.35
			]
		}]),
		ramps: Object.freeze([{
			id: "core-catwalk-stairs",
			from: [
				2.9,
				0,
				4.6
			],
			to: [
				2.9,
				2.59,
				1.35
			],
			width: 1.2
		}]),
		platforms: Object.freeze([{
			id: "core-catwalk",
			minX: -3.5,
			maxX: 3.5,
			minZ: -1.2,
			maxZ: 1.2,
			y: 2.59
		}, ...farcrysisBotGroundPlatforms()])
	});
	root.userData.verticalNavigation = verticalNavigation;
	root.userData.farcrysisColliderAudit = Object.freeze(builder.colliderAudit.map((entry) => Object.freeze({ ...entry })));
	root.userData.farcrysisTerrainPlateCount = terrainPlates.length;
	return {
		id: "farcrysis",
		label: "Farcrysis",
		root,
		colliders: builder.colliders,
		physicsColliders: builder.physicsColliders,
		raycastMeshes: builder.raycastMeshes,
		shotSurfaces: builder.shotSurfaces,
		spawns,
		patrolPoints,
		targets: [],
		houses: [],
		breakableWindows: [],
		physicalCover: builder.physicalCover,
		bounds: {
			minX: FARCRYSIS_BOUNDS.minX,
			maxX: FARCRYSIS_BOUNDS.maxX,
			minZ: FARCRYSIS_BOUNDS.minZ,
			maxZ: FARCRYSIS_BOUNDS.maxZ
		},
		physicsSafetyFloorY: FARCRYSIS_SAFETY_FLOOR_Y,
		houseTelemetry: emptyTelemetry()
	};
}
/** Compute HITL overlay state from a built arena (dev-only, ?hitl=1 gated). */
function farcrysisHITL(a) {
	const violations = [];
	const allSpawns = [...a.spawns[0], ...a.spawns[1]];
	let maxSightline = 0;
	for (const spawn of allSpawns) for (const coverEntry of a.physicalCover) {
		const b = coverEntry.bounds;
		const sx = spawn.x;
		const sz = spawn.z;
		const inX = sx >= b.minX && sx <= b.maxX;
		const inZ = sz >= b.minZ && sz <= b.maxZ;
		if (inX && inZ) violations.push(`spawn(${sx.toFixed(1)},${sz.toFixed(1)}) inside cover ${coverEntry.id}`);
		const dist = Math.hypot(sx - b.maxX, sz - b.maxZ);
		if (dist > maxSightline) maxSightline = dist;
	}
	return {
		active: true,
		spawnCount: allSpawns.length,
		coverCount: a.physicalCover.length,
		maxSightline,
		violations,
		matchFlow: "idle"
	};
}
//#endregion
export { waterBodyForArena as i, farcrysisHITL as n, sharedWaterBodyForArena as r, buildFarcrysis as t };
