import { $c as Matrix4, Bs as IcosahedronGeometry, Ff as Vector2, Fs as Group, Ga as BufferGeometry, Ha as BoxGeometry, If as Vector3, Po as CylinderGeometry, Sd as SRGBColorSpace, Xc as MathUtils, Ys as InstancedMesh, Za as CanvasTexture, _s as Float32BufferAttribute, ds as Euler, ff as TorusGeometry, fo as ConeGeometry, i as mergeGeometries, io as Color, md as RepeatWrapping, mu as Quaternion, tl as Mesh, ul as MeshStandardMaterial } from "./vendor-three-aHPbjK02.js";
import { c as box, f as emptyTelemetry, m as standard, p as spawnRecord, s as batchPresentationOnlyBoxes } from "./additional-maps-4DNt5pMv.js";
//#region src/rendering/environment-kit.ts
/**
* environment-kit.ts — arena-agnostic vegetation scatter + terrain backdrop.
*
* WHY THIS EXISTS: the owner played the new maps and called the backdrop thin
* ("we need to use some of your better techniques to sort the quality of
* trees, grass mountains etc"). Today Test1 dresses its horizon with ~140
* `ConeGeometry` tufts and 18 squashed `SphereGeometry` domes
* (src/test-maps-art.ts:541-552, :608-636) and Test2 with twelve cones in two
* dead-straight 11 m rows plus twelve separate trunk draws
* (src/test-maps-art.ts:709-729). Both read as obvious primitives: identical
* clones, all plumb, all the same size, meeting a flat plane on a razor edge.
*
* WHAT THIS IS: a reusable kit implementing the vegetation and world-building
* techniques restated in docs/UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md, in
* our own code:
*
*   - MULTI-PART INSTANCED PROTOTYPES. A plant is a prototype with N parts
*     (trunk, canopy, contact skirt) that share one XZ position and one
*     instance basis, each part emitted as its own InstancedMesh. One draw
*     call per (kind, tier, part), never per plant.
*     (doc: "Instanced prop prototypes with per-instance jitter", "Assembler
*     with prop prototypes ... per-prototype cull distance")
*   - POSITION-HASHED VARIATION. Yaw, scale, stretch and tilt come from a
*     hash of the instance's QUANTISED WORLD POSITION plus a stream id, never
*     from `Math.random` and never from the instance index. The doc is
*     explicit about why index hashing is a latent bug: an index-derived
*     value changes the moment a candidate ahead of it is rejected or the
*     batch is split, so a keep-out tweak silently re-rolls the whole field.
*     Position hashing is immune to rejection, reordering and bucketing.
*     (doc: "Position-hashed per-instance variation ... never the instance
*     index")
*   - FORKED STREAMS. Placement runs on a seeded mulberry32; variation runs
*     on the position hash. They are never the same stream, so retuning the
*     look cannot reshuffle positions across peers.
*     (doc: "Per-prototype 'looseness': jitter rig on a forked RNG stream")
*   - LAYERED POISSON CLEARANCE. Layer N declares a vector of N+1 distances:
*     entries 0..N-1 are the minimum separation from each PRIOR layer and the
*     last entry is its own self-spacing. Length is a build-time contract
*     that throws. This is what expresses "no shrub within 1.5 m of a
*     cypress" — a jittered grid cannot.
*     (doc: "32 m periodic Poisson tile with layered inter-layer clearance")
*   - REJECTION-STABLE SAMPLING. Every candidate attempt consumes exactly the
*     same two RNG draws whether it is accepted or rejected, so adding a
*     keep-out never rearranges the rest of the field — the same discipline
*     src/rendering/instanced-grass-field.ts already applies to grass.
*   - CLEARANCE PREDICATE. Callers pass `allow(x, z, radiusM)` and keep their
*     own gameplay lanes, spawns and capture zones clear. Art that blocks no
*     shots can still block SIGHT; the predicate is where that is decided.
*     (doc: "Clearance zones with a build-time contract that throws")
*   - CONTACT SKIRTS. Woody prototypes emit a low, never-tilted ground fillet
*     so a trunk stops meeting the deck on a straight polygon edge.
*     (doc: "Contact skirt: a dust fillet auto-emitted under every heavy
*     instance"; note the doc's NOT-adopted warning — never per grass blade)
*   - SLOPE AWARENESS. Layers may tilt to the ground normal via Gram-Schmidt
*     off the authored yaw. Default is FALSE, because the upstream rule worth
*     writing down is that trunks stay vertical regardless of terrain.
*   - TWO BUILD-TIME LOD TIERS. Tier is chosen once, at build, by a distance
*     band from an authored origin — we cannot swap per frame cheaply. The
*     far tier collapses a multi-part plant into one merged silhouette part,
*     so the far band costs fewer draw calls as well as fewer triangles.
*   - RIDGELINE BACKDROP. A seeded, displaced heightfield annulus with real
*     computed normals, a seamless theta wrap and per-vertex distance haze —
*     landforms on the horizon instead of squashed spheres.
*     (doc: "Terrain: gameplay-flat by construction, visually undulating
*     everywhere else"; "Mountains" build-order note)
*
* WHAT THIS IS NOT: gameplay authority. Nothing here adds a collider, a shot
* surface, a spawn or navigation. Every mesh is tagged
* `userData.presentationOnly = true`, `userData.blocksShots = false` and has
* its `raycast` replaced with a no-op, matching src/test-maps-art.ts:487-493.
*
* DETERMINISTIC: seeded mulberry32 + integer position hashes only, no
* `Math.random`, so the arena builds identically on every peer and run.
*
* HEADLESS-SAFE: pure `three` geometry and MeshStandardMaterial. No canvas,
* no `document`, no renderer, no WebGPU. The collider/visual parity audit and
* the vitest suites construct arenas in plain Node, so every path here must
* work with nothing but the three core classes — and does.
*/
/** Placement stream. Same generator as src/test-maps-art.ts:19-27. */
function mulberry32$1(seed) {
	let state = seed;
	return () => {
		state |= 0;
		state = state + 1831565813 | 0;
		let t = Math.imul(state ^ state >>> 15, 1 | state);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
/** Quantise a world coordinate to a 1/256 m lattice for hashing. */
function quantise(v) {
	return Math.round(v * 256) | 0;
}
/**
* Variation stream: an xor-multiply-shift finaliser over the quantised world
* position plus a stream id. The SAME point yields the SAME plant whether it
* was the 3rd or the 3000th accepted candidate, whether its neighbours were
* rejected, or whether the batch was later split for LOD.
*/
function detailHash(seed, hx, hz, stream) {
	let h = (seed | 0) ^ Math.imul(hx | 0, 2654435769) ^ Math.imul(hz | 0, 2246822507) ^ Math.imul(stream | 0, 3266489909);
	h = Math.imul(h ^ h >>> 15, 739982445);
	h ^= h >>> 12;
	h = Math.imul(h ^ h >>> 16, 695872825);
	h ^= h >>> 15;
	return (h >>> 0) / 4294967296;
}
/** Deterministic integer-mixed hash used by the ridge displacement. */
function coordHash(a, b, c) {
	let h = Math.imul(a | 0, 668265261) ^ Math.imul(b | 0, 374761393) ^ Math.imul(c | 0, 2654435769);
	h = Math.imul(h ^ h >>> 15, 2246822507);
	h ^= h >>> 13;
	return (h >>> 0) / 4294967296;
}
/**
* Stamp the art-layer contract onto a mesh: presentation-only, blocks no
* shots, and unreachable by any raycast (so it can never become movement,
* ballistic or interaction authority). Matches src/test-maps-art.ts:487-493.
*/
function presentationMesh$1(mesh, castShadow, receiveShadow = true) {
	mesh.castShadow = castShadow;
	mesh.receiveShadow = receiveShadow;
	mesh.userData.presentationOnly = true;
	mesh.userData.blocksShots = false;
	mesh.raycast = () => void 0;
	return mesh;
}
/** Triangle count of a geometry, indexed or not. */
function triangleCount(geometry) {
	const index = geometry.getIndex();
	if (index) return index.count / 3;
	const position = geometry.getAttribute("position");
	return position ? position.count / 3 : 0;
}
/**
* Merge authored pieces into one part geometry. three's primitives mix
* indexed (Cylinder/Cone/Circle) and non-indexed (Icosahedron) forms and
* `mergeGeometries` refuses the mix, so every piece is normalised to
* non-indexed first. Every piece comes from a three primitive, so the index
* buffers are in range by construction (the toNonIndexed NaN gotcha only
* bites hand-built index buffers).
*/
function mergePieces(pieces) {
	if (pieces.length === 1) {
		const only = pieces[0];
		return only.getIndex() ? only.toNonIndexed() : only;
	}
	const merged = mergeGeometries(pieces.map((piece) => piece.getIndex() ? piece.toNonIndexed() : piece), false);
	if (!merged) throw new Error("environment-kit: part merge failed (mismatched attributes)");
	merged.clearGroups();
	return merged;
}
function cylinderPiece(radiusTop, radiusBottom, height, segments, baseY) {
	const geometry = new CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, true);
	geometry.translate(0, baseY + height / 2, 0);
	return geometry;
}
function conePiece(radius, height, segments, baseY) {
	const geometry = new ConeGeometry(radius, height, segments);
	geometry.translate(0, baseY + height / 2, 0);
	return geometry;
}
function lobePiece(radius, detail, x, y, z, squash) {
	const geometry = new IcosahedronGeometry(radius, detail);
	geometry.scale(1, squash, 1);
	geometry.translate(x, y, z);
	return geometry;
}
/**
* The contact skirt: a low lobed disc of ground litter. Deliberately NOT a
* clean circle — the radius is modulated by a deterministic hash per rim
* vertex so it reads as a dust pile rather than a decal ring.
*/
function skirtPiece(radius, segments, seed) {
	const positions = [];
	const normals = [];
	const uvs = [];
	const rim = [];
	for (let i = 0; i < segments; i += 1) {
		const theta = i / segments * Math.PI * 2;
		const wobble = .72 + coordHash(seed, i, 5) * .5;
		rim.push([Math.cos(theta) * radius * wobble, Math.sin(theta) * radius * wobble]);
	}
	for (let i = 0; i < segments; i += 1) {
		const a = rim[i];
		const b = rim[(i + 1) % segments];
		positions.push(0, 0, 0, b[0], 0, b[1], a[0], 0, a[1]);
		normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
		uvs.push(.5, .5, .5 + b[0] / (radius * 2), .5 + b[1] / (radius * 2), .5 + a[0] / (radius * 2), .5 + a[1] / (radius * 2));
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
	geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
	geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
	geometry.translate(0, .008, 0);
	return geometry;
}
/** Sun-bleached defaults; every arena is expected to override for its brief. */
var DEFAULT_VEGETATION_PALETTE = Object.freeze({
	trunk: 5915952,
	broadleafCanopy: 5532470,
	coniferCanopy: 3362609,
	shrub: 4875064,
	dryScrub: 10061914,
	litter: 9403480
});
var PLANT_KINDS = Object.freeze([
	"broadleaf",
	"conifer",
	"shrub",
	"dry-scrub"
]);
/**
* Canopy radius and scale band per kind, at unit scale. Declared as data so a
* caller-facing decision (clearance radius, scale jitter) never has to build
* geometry to be answered.
*/
var PROTOTYPE_RADIUS = Object.freeze({
	broadleaf: 1.6,
	conifer: 1.05,
	shrub: .78,
	"dry-scrub": .36
});
var PROTOTYPE_SCALE_RANGE = Object.freeze({
	broadleaf: [.78, 1.28],
	conifer: [.72, 1.34],
	shrub: [.7, 1.35],
	"dry-scrub": [.62, 1.4]
});
function foliageMaterial(color, name) {
	const material = new MeshStandardMaterial({
		color,
		roughness: .95,
		metalness: 0
	});
	material.name = name;
	return material;
}
function buildMaterials(palette) {
	const trunk = new MeshStandardMaterial({
		color: palette.trunk,
		roughness: .98,
		metalness: 0
	});
	trunk.name = "env-kit-trunk";
	const litter = new MeshStandardMaterial({
		color: palette.litter,
		roughness: 1,
		metalness: 0
	});
	litter.name = "env-kit-litter";
	return {
		trunk,
		broadleaf: foliageMaterial(palette.broadleafCanopy, "env-kit-broadleaf"),
		conifer: foliageMaterial(palette.coniferCanopy, "env-kit-conifer"),
		shrub: foliageMaterial(palette.shrub, "env-kit-shrub"),
		scrub: foliageMaterial(palette.dryScrub, "env-kit-dry-scrub"),
		litter
	};
}
/**
* Build the prototype for one kind at one tier.
*
* NEAR tiers are genuinely multi-part: trunk and canopy are separate
* InstancedMeshes sharing the instance basis, which is what lets bark and
* foliage carry different materials without a per-plant draw.
*
* FAR tiers collapse the same plant into ONE merged silhouette part. At the
* distances where the far band lives the material split is invisible, and
* collapsing it halves the far band's draw calls as well as its triangles.
*/
function buildPrototype(kind, tier, materials, wantSkirt) {
	const parts = [];
	const push = (id, geometry, material, castShadow, rigid = false) => {
		parts.push({
			id,
			geometry,
			material,
			castShadow,
			rigid
		});
	};
	if (kind === "broadleaf") {
		if (tier === "near") {
			push("trunk", mergePieces([cylinderPiece(.13, .21, 2.35, 6, 0), cylinderPiece(.07, .11, .9, 5, 2.2)]), materials.trunk, true);
			push("canopy", mergePieces([
				lobePiece(1.42, 1, 0, 3.25, 0, .82),
				lobePiece(.94, 0, -.85, 2.86, .42, .86),
				lobePiece(.86, 0, .72, 3.02, -.58, .8)
			]), materials.broadleaf, true);
		} else push("silhouette", mergePieces([cylinderPiece(.14, .2, 2.4, 4, 0), lobePiece(1.5, 0, 0, 3.2, 0, .84)]), materials.broadleaf, true);
		if (wantSkirt) push("skirt", skirtPiece(1.05, 9, 4273), materials.litter, false, true);
		return {
			kind,
			tier,
			parts,
			radiusM: 1.6,
			heightM: 4.4,
			scaleRange: [.78, 1.28],
			tiltRad: .035,
			sinkM: .06,
			skirtRadiusM: 1.05
		};
	}
	if (kind === "conifer") {
		if (tier === "near") {
			push("trunk", mergePieces([cylinderPiece(.1, .17, 1.05, 6, 0)]), materials.trunk, true);
			push("canopy", mergePieces([
				conePiece(1.02, 2.3, 7, .75),
				conePiece(.78, 2.05, 7, 2.15),
				conePiece(.5, 1.9, 6, 3.45)
			]), materials.conifer, true);
		} else push("silhouette", mergePieces([cylinderPiece(.11, .16, 1, 4, 0), conePiece(1, 4.5, 6, .8)]), materials.conifer, true);
		if (wantSkirt) push("skirt", skirtPiece(.78, 8, 8386), materials.litter, false, true);
		return {
			kind,
			tier,
			parts,
			radiusM: 1.05,
			heightM: 5.35,
			scaleRange: [.72, 1.34],
			tiltRad: 0,
			sinkM: .05,
			skirtRadiusM: .78
		};
	}
	if (kind === "shrub") {
		if (tier === "near") {
			push("stems", mergePieces([cylinderPiece(.045, .07, .34, 5, 0), cylinderPiece(.03, .05, .26, 4, .1)]), materials.trunk, false);
			push("foliage", mergePieces([
				lobePiece(.52, 1, 0, .62, 0, .78),
				lobePiece(.36, 0, -.36, .46, .2, .8),
				lobePiece(.33, 0, .31, .52, -.26, .78),
				lobePiece(.27, 0, .05, .86, .22, .74)
			]), materials.shrub, true);
		} else push("silhouette", mergePieces([lobePiece(.58, 0, 0, .56, 0, .8)]), materials.shrub, true);
		if (wantSkirt) push("skirt", skirtPiece(.52, 8, 12499), materials.litter, false, true);
		return {
			kind,
			tier,
			parts,
			radiusM: .78,
			heightM: 1.12,
			scaleRange: [.7, 1.35],
			tiltRad: .1,
			sinkM: .04,
			skirtRadiusM: .52
		};
	}
	if (tier === "near") {
		const blades = [];
		for (let blade = 0; blade < 3; blade += 1) {
			const piece = conePiece(.2, .48, 4, 0);
			piece.rotateZ(.34 * (blade - 1));
			piece.rotateY(blade * 1.9);
			piece.translate((blade - 1) * .12, 0, blade % 2 === 0 ? .1 : -.11);
			blades.push(piece);
		}
		push("tuft", mergePieces(blades), materials.scrub, false);
	} else push("tuft", mergePieces([conePiece(.3, .42, 4, 0)]), materials.scrub, false);
	return {
		kind,
		tier,
		parts,
		radiusM: .36,
		heightM: .5,
		scaleRange: [.62, 1.4],
		tiltRad: .2,
		sinkM: .02,
		skirtRadiusM: 0
	};
}
var SCRATCH_POSITION = new Vector3();
var SCRATCH_SCALE = new Vector3();
var SCRATCH_QUATERNION = new Quaternion();
var SCRATCH_EULER = new Euler();
var SCRATCH_MATRIX = new Matrix4();
var SCRATCH_UP = new Vector3();
var SCRATCH_FORWARD = new Vector3();
var SCRATCH_RIGHT = new Vector3();
/** Central-difference normal from whatever `groundY` the caller supplied. */
function defaultGroundNormal(groundY) {
	const step = .25;
	return (x, z) => {
		const dx = groundY(x + step, z) - groundY(x - step, z);
		const dz = groundY(x, z + step) - groundY(x, z - step);
		return new Vector3(-dx, 2 * step, -dz).normalize();
	};
}
function validateLayers(layers) {
	layers.forEach((layer, index) => {
		if (layer.spacings.length !== index + 1) throw new Error(`environment-kit: layer ${index} ("${layer.kind}") declares ${layer.spacings.length} spacings; a layer's spacing vector must hold one clearance per PRIOR layer plus its own self-spacing (expected ${index + 1}).`);
		for (const spacing of layer.spacings) if (!(spacing > 0) || !Number.isFinite(spacing)) throw new Error(`environment-kit: layer ${index} ("${layer.kind}") has a non-positive spacing (${spacing}).`);
		if (!Number.isInteger(layer.count) || layer.count < 0) throw new Error(`environment-kit: layer ${index} ("${layer.kind}") count must be a non-negative integer.`);
	});
}
/**
* Place instanced vegetation into `root`.
*
* Determinism contract: placement consumes exactly two draws from the seeded
* stream per ATTEMPT — accepted or not — so adding, removing or tightening a
* keep-out never rearranges the candidate sequence. Per-instance look is a
* pure function of the quantised world position, so any instance that
* survives both a before and an after build is byte-identical in both.
*/
function scatterVegetation(root, options) {
	validateLayers(options.layers);
	const { area } = options;
	if (!(area.maxX > area.minX) || !(area.maxZ > area.minZ)) throw new Error("environment-kit: scatter area must have positive extent on both axes.");
	const materials = buildMaterials({
		...DEFAULT_VEGETATION_PALETTE,
		...options.palette
	});
	const namePrefix = options.namePrefix ?? "env";
	const groundY = options.groundY ?? (() => 0);
	const groundNormal = options.groundNormal ?? defaultGroundNormal(groundY);
	const lodOriginX = options.lod?.originX ?? 0;
	const lodOriginZ = options.lod?.originZ ?? 0;
	const nearBandM = options.lod?.nearBandM ?? Number.POSITIVE_INFINITY;
	const group = new Group();
	group.name = `${namePrefix}-vegetation`;
	group.userData.presentationOnly = true;
	const placeRng = mulberry32$1(options.seed);
	let maxSpacing = 0;
	for (const layer of options.layers) for (const spacing of layer.spacings) maxSpacing = Math.max(maxSpacing, spacing);
	const cellSize = Math.max(maxSpacing, .25);
	const grid = /* @__PURE__ */ new Map();
	const cellKey = (x, z) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
	const placed = [];
	let rejected = 0;
	options.layers.forEach((layer, layerIndex) => {
		const scaleRange = layer.scaleRange ?? PROTOTYPE_SCALE_RANGE[layer.kind];
		const radiusAtUnit = PROTOTYPE_RADIUS[layer.kind];
		const attemptCap = layer.count * (layer.attemptsPerInstance ?? 30);
		let accepted = 0;
		for (let attempt = 0; attempt < attemptCap && accepted < layer.count; attempt += 1) {
			const u = placeRng();
			const v = placeRng();
			const x = area.minX + u * (area.maxX - area.minX);
			const z = area.minZ + v * (area.maxZ - area.minZ);
			const hx = quantise(x);
			const hz = quantise(z);
			const scale = scaleRange[0] + detailHash(options.seed, hx, hz, 3) * (scaleRange[1] - scaleRange[0]);
			const radius = radiusAtUnit * scale;
			let clear = true;
			const cx = Math.floor(x / cellSize);
			const cz = Math.floor(z / cellSize);
			for (let ox = -1; ox <= 1 && clear; ox += 1) for (let oz = -1; oz <= 1 && clear; oz += 1) {
				const bucket = grid.get(`${cx + ox},${cz + oz}`);
				if (!bucket) continue;
				for (const point of bucket) {
					const required = layer.spacings[point.layer];
					const dx = point.x - x;
					const dz = point.z - z;
					if (dx * dx + dz * dz < required * required) {
						clear = false;
						break;
					}
				}
			}
			if (!clear) {
				rejected += 1;
				continue;
			}
			if (options.allow && !options.allow(x, z, radius, layer.kind)) {
				rejected += 1;
				continue;
			}
			const distanceToOrigin = Math.hypot(x - lodOriginX, z - lodOriginZ);
			const point = {
				x,
				z,
				layer: layerIndex,
				kind: layer.kind,
				tier: distanceToOrigin <= nearBandM ? "near" : "far",
				tiltToSlope: layer.tiltToSlope === true,
				scale
			};
			placed.push(point);
			const key = cellKey(x, z);
			const bucket = grid.get(key);
			if (bucket) bucket.push(point);
			else grid.set(key, [point]);
			accepted += 1;
		}
	});
	const skirtByKind = /* @__PURE__ */ new Map();
	for (const layer of options.layers) {
		const wants = layer.skirt ?? layer.kind !== "dry-scrub";
		skirtByKind.set(layer.kind, (skirtByKind.get(layer.kind) ?? false) || wants);
	}
	const buckets = /* @__PURE__ */ new Map();
	for (const point of placed) {
		const key = `${point.kind}|${point.tier}`;
		const bucket = buckets.get(key);
		if (bucket) bucket.push(point);
		else buckets.set(key, [point]);
	}
	const meshes = [];
	let triangles = 0;
	const perKind = {
		broadleaf: 0,
		conifer: 0,
		shrub: 0,
		"dry-scrub": 0
	};
	const perTier = {
		near: 0,
		far: 0
	};
	for (const key of Array.from(buckets.keys()).sort()) {
		const points = buckets.get(key);
		if (!points || points.length === 0) continue;
		const first = points[0];
		const prototype = buildPrototype(first.kind, first.tier, materials, skirtByKind.get(first.kind) === true && first.tier === "near");
		perKind[first.kind] += points.length;
		perTier[first.tier] += points.length;
		for (const part of prototype.parts) {
			const mesh = new InstancedMesh(part.geometry, part.material, points.length);
			mesh.name = `${namePrefix}-${first.kind}-${first.tier}-${part.id}`;
			for (let i = 0; i < points.length; i += 1) {
				writeInstanceMatrix(SCRATCH_MATRIX, points[i], prototype, part, options.seed, groundY, groundNormal);
				mesh.setMatrixAt(i, SCRATCH_MATRIX);
			}
			mesh.instanceMatrix.needsUpdate = true;
			mesh.computeBoundingSphere();
			mesh.userData.plantKind = first.kind;
			mesh.userData.lodTier = first.tier;
			mesh.userData.partId = part.id;
			group.add(presentationMesh$1(mesh, part.castShadow));
			meshes.push(mesh);
			triangles += triangleCount(part.geometry) * points.length;
		}
	}
	root.add(group);
	const plantTypes = PLANT_KINDS.filter((kind) => perKind[kind] > 0).length;
	return {
		group,
		meshes,
		stats: {
			instances: placed.length,
			plantTypes,
			triangles,
			drawCalls: meshes.length,
			rejected,
			perKind,
			perTier
		}
	};
}
/**
* Compose one instance basis. Every varying term is a position hash, so this
* is a pure function of (seed, x, z, prototype, part).
*/
function writeInstanceMatrix(target, point, prototype, part, seed, groundY, groundNormal) {
	const hx = quantise(point.x);
	const hz = quantise(point.z);
	const yaw = detailHash(seed, hx, hz, part.rigid ? 7 : 4) * Math.PI * 2;
	const scale = point.scale;
	const surfaceY = groundY(point.x, point.z);
	if (part.rigid) {
		SCRATCH_POSITION.set(point.x, surfaceY, point.z);
		SCRATCH_EULER.set(0, yaw, 0, "YXZ");
		SCRATCH_QUATERNION.setFromEuler(SCRATCH_EULER);
		SCRATCH_SCALE.set(scale, 1, scale);
		target.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
		return;
	}
	const stretch = .86 + detailHash(seed, hx, hz, 8) * .34;
	SCRATCH_SCALE.set(scale, scale * stretch, scale);
	SCRATCH_POSITION.set(point.x, surfaceY - prototype.sinkM * scale, point.z);
	if (point.tiltToSlope) {
		SCRATCH_UP.copy(groundNormal(point.x, point.z));
		if (!Number.isFinite(SCRATCH_UP.lengthSq()) || SCRATCH_UP.lengthSq() < 1e-8) SCRATCH_UP.set(0, 1, 0);
		SCRATCH_UP.normalize();
		SCRATCH_FORWARD.set(Math.sin(yaw), 0, Math.cos(yaw));
		SCRATCH_FORWARD.addScaledVector(SCRATCH_UP, -SCRATCH_FORWARD.dot(SCRATCH_UP));
		if (SCRATCH_FORWARD.lengthSq() < 1e-8) SCRATCH_FORWARD.set(0, 0, 1);
		SCRATCH_FORWARD.normalize();
		SCRATCH_RIGHT.copy(SCRATCH_UP).cross(SCRATCH_FORWARD).normalize();
		target.makeBasis(SCRATCH_RIGHT, SCRATCH_UP, SCRATCH_FORWARD);
		target.scale(SCRATCH_SCALE);
		target.setPosition(SCRATCH_POSITION);
		return;
	}
	const tilt = prototype.tiltRad;
	const tiltX = tilt === 0 ? 0 : (detailHash(seed, hx, hz, 5) * 2 - 1) * tilt;
	const tiltZ = tilt === 0 ? 0 : (detailHash(seed, hx, hz, 6) * 2 - 1) * tilt;
	SCRATCH_EULER.set(tiltX, yaw, tiltZ, "YXZ");
	SCRATCH_QUATERNION.setFromEuler(SCRATCH_EULER);
	target.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
}
/**
* A seeded, displaced heightfield annulus: the horizon reads as landforms
* rather than a ring of squashed spheres.
*
* Both rims sit at `baseY` (below y = 0), so the band rises out of the ground
* and falls away again — the far side drops below the horizon and is never
* seen. Displacement is three ridge lobes plus a position-hashed crag term,
* all evaluated from theta and the band parameter, so the theta = 0 seam is
* exact: the last column reuses the FIRST column's vertices by index, which
* makes `computeVertexNormals` continuous across the join with no welding.
*/
function buildRidgeRing(options) {
	const radialSegments = Math.max(16, Math.floor(options.radialSegments ?? 128));
	const bandSegments = Math.max(2, Math.floor(options.bandSegments ?? 12));
	const baseY = options.baseY ?? -1.6;
	const peakHeightM = options.peakHeightM ?? 24;
	const inner = options.innerRadiusM;
	const outer = options.outerRadiusM;
	if (!(outer > inner) || !(inner > 0)) throw new Error(`environment-kit: ridge ring needs 0 < innerRadiusM (${inner}) < outerRadiusM (${outer}).`);
	if (options.arenaClearRadiusM !== void 0 && inner <= options.arenaClearRadiusM) throw new Error(`environment-kit: ridge ring inner rim ${inner} m is inside the arena clear radius ${options.arenaClearRadiusM} m. The backdrop must sit outside arena bounds so it can never occlude a gameplay sightline.`);
	const lobes = options.lobes ?? [
		3,
		7,
		13
	];
	const phaseA = coordHash(options.seed, 11, 1) * Math.PI * 2;
	const phaseB = coordHash(options.seed, 23, 2) * Math.PI * 2;
	const phaseC = coordHash(options.seed, 37, 3) * Math.PI * 2;
	const phaseR = coordHash(options.seed, 53, 4) * Math.PI * 2;
	const nearColor = new Color(options.nearColor ?? 7301714);
	const farColor = new Color(options.farColor ?? 9077096);
	const hazeColor = new Color(options.hazeColor ?? 13090986);
	const hazeStrength = MathUtils.clamp(options.hazeStrength ?? .72, 0, 1);
	const columns = radialSegments;
	const rows = bandSegments + 1;
	const vertexCount = columns * rows;
	const positions = new Float32Array(vertexCount * 3);
	const uvs = new Float32Array(vertexCount * 2);
	const colors = new Float32Array(vertexCount * 3);
	const scratchColor = new Color();
	let peakY = baseY;
	let minRadius = Number.POSITIVE_INFINITY;
	let maxRadius = 0;
	let maxElevationDeg = 0;
	for (let column = 0; column < columns; column += 1) {
		const theta = column / columns * Math.PI * 2;
		const cos = Math.cos(theta);
		const sin = Math.sin(theta);
		const radialWobble = 1 + .07 * Math.sin(theta * 5 + phaseR) + .035 * Math.sin(theta * 11 + phaseB);
		const ridge = .5 + .5 * (.55 * Math.sin(theta * lobes[0] + phaseA) + .29 * Math.sin(theta * lobes[1] + phaseB) + .16 * Math.sin(theta * lobes[2] + phaseC));
		for (let row = 0; row < rows; row += 1) {
			const t = row / bandSegments;
			const shape = Math.sin(Math.PI * Math.pow(t, .62));
			const radius = inner + (outer - inner) * t * radialWobble;
			const x = cos * radius;
			const z = sin * radius;
			const crag = (coordHash(Math.round(x * 8), Math.round(z * 8), options.seed | 0) - .5) * 2;
			const height = baseY + peakHeightM * shape * (.42 + .58 * ridge) + crag * peakHeightM * .085 * shape;
			const index = column * rows + row;
			positions[index * 3] = x;
			positions[index * 3 + 1] = height;
			positions[index * 3 + 2] = z;
			uvs[index * 2] = column / columns;
			uvs[index * 2 + 1] = t;
			scratchColor.copy(nearColor).lerp(farColor, MathUtils.clamp(shape * .6 + t * .4, 0, 1));
			scratchColor.lerp(hazeColor, hazeStrength * MathUtils.smoothstep(t, .05, .95));
			colors[index * 3] = scratchColor.r;
			colors[index * 3 + 1] = scratchColor.g;
			colors[index * 3 + 2] = scratchColor.b;
			if (height > peakY) peakY = height;
			const horizontal = Math.hypot(x, z);
			if (horizontal < minRadius) minRadius = horizontal;
			if (horizontal > maxRadius) maxRadius = horizontal;
			const elevation = Math.atan2(height - 1.6, Math.max(horizontal, .001)) * (180 / Math.PI);
			if (elevation > maxElevationDeg) maxElevationDeg = elevation;
		}
	}
	const indices = [];
	for (let column = 0; column < columns; column += 1) {
		const next = (column + 1) % columns;
		for (let row = 0; row < bandSegments; row += 1) {
			const a = column * rows + row;
			const b = next * rows + row;
			const c = next * rows + row + 1;
			const d = column * rows + row + 1;
			indices.push(a, d, b, b, d, c);
		}
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
	geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
	geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	geometry.computeBoundingSphere();
	const material = new MeshStandardMaterial({
		vertexColors: true,
		roughness: 1,
		metalness: 0
	});
	material.name = "env-kit-ridge";
	const mesh = new Mesh(geometry, material);
	mesh.name = options.name ?? "env-ridge-ring";
	mesh.matrixAutoUpdate = false;
	mesh.updateMatrix();
	presentationMesh$1(mesh, false, false);
	return {
		mesh,
		stats: {
			triangles: indices.length / 3,
			vertices: vertexCount,
			drawCalls: 1,
			peakY,
			minRadiusM: minRadius,
			maxRadiusM: maxRadius,
			maxElevationDeg
		}
	};
}
var EMPTY_STATS = Object.freeze({
	instances: 0,
	plantTypes: 0,
	triangles: 0,
	drawCalls: 0,
	rejected: 0,
	perKind: Object.freeze({
		broadleaf: 0,
		conifer: 0,
		shrub: 0,
		"dry-scrub": 0
	}),
	perTier: Object.freeze({
		near: 0,
		far: 0
	})
});
/** Build both halves of the kit under one presentation-only group. */
function buildEnvironment(root, options) {
	const group = new Group();
	group.name = options.name ?? "environment-kit";
	group.userData.presentationOnly = true;
	root.add(group);
	const vegetation = options.vegetation ? scatterVegetation(group, options.vegetation) : null;
	const ridge = options.ridge ? buildRidgeRing(options.ridge) : null;
	if (ridge) group.add(ridge.mesh);
	const base = vegetation?.stats ?? EMPTY_STATS;
	return {
		group,
		vegetation,
		ridge,
		stats: {
			...base,
			triangles: base.triangles + (ridge?.stats.triangles ?? 0),
			drawCalls: base.drawCalls + (ridge?.stats.drawCalls ?? 0)
		}
	};
}
//#endregion
//#region src/rendering/surface-forge.ts
/**
* Surface forge - one authored surface function, a full PBR texture set.
*
* Owner brief 2026-08-30 ("we need a deeper recreation actually using some of
* the x.com and other techniques we ingested"). Implements, in our own code,
* the two techniques the extraction doc rates highest for our two new maps:
*
*   docs/UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md
*     - "Sobel height-to-normal with physically scaled slope" (adopt: yes)
*     - "Two shared maps for the whole game: one micro detail tile and one
*        4-band macro variation tile" (adopt: yes)
*     - "detailWorld - the micro tooth is pinned to a fixed physical size"
*     - "Nyquist discipline - every noise band is budgeted in texels"
*
* The measured problem it fixes: src/test-maps-art.ts paints 13 canvas
* textures and binds only `material.map`. Every hardpan, plywood, cinderblock
* and travertine surface in Test1/Test2 is a flat painted plane - no
* grazing-angle break-up, no sun catch, no relief.
*
* SINGLE SOURCE OF TRUTH
* ----------------------
* A surface is authored ONCE as a `SurfaceDescription`: for a normalised
* (u, v) it returns { albedo, height, roughness, ao }. From that one function
* the forge derives albedo, a tangent-space normal, roughness and AO. Callers
* never paint four textures by hand and the four maps can never disagree.
*
* CONTRACTS
* ---------
* - PRESENTATION ONLY. This module produces textures and materials. It adds no
*   colliders, shot surfaces, spawns or navigation, and holds no gameplay
*   authority. Nothing here may be used to derive collision.
* - DETERMINISTIC. Every value comes from a seeded integer hash. No
*   Math.random, no Date, no iteration-order dependence: the same seed
*   produces byte-identical rasters on every peer, every run.
* - HEADLESS-SAFE. `rasterizeSurface` is pure CPU and always works (the vitest
*   suites and the collider/visual parity audit run in plain Node).
*   `forgeSurface` probes for a real 2D canvas first and returns an
*   all-null set when there is none, so callers fall back to flat colours -
*   the same discipline as `paintedTexture` in src/test-maps-art.ts:36-65.
*   Nothing in this file throws on a missing DOM.
* - MeshStandardMaterial only. No ShaderMaterial in art paths.
*
* UV / SIGN CONVENTION (the trap the extraction doc flags at line 215)
* -------------------------------------------------------------------
* We emit CanvasTextures, which inherit `Texture.flipY = true`, so texture
* coordinate v = 1 is the canvas's TOP row. The description therefore receives
* v as the coordinate a shader will sample with (v up), and the rasteriser maps
* it to canvas row y via `v = 1 - (y + 0.5) / size`.
*
* A tangent-space (OpenGL/three.js convention) normal is
* `normalize(-dH/du, -dH/dv, 1)`. Because dv = -dy_canvas, the canvas-space
* form is `normalize(-slopeU, +slopeV_canvasDown, 1)`, which is what the
* encoder below writes.
*
* Note for anyone auditing the other two normal producers in this repo: they
* disagree in sign but both are CORRECT, because they ship different texture
* types. src/farcrysis-ground-materials.ts:209-211 writes (-dx, -dy) into a
* DataTexture, whose flipY defaults to false, so v = 0 is data row 0.
* scripts/generate-art-textures.py:365-368 writes (-dx, +dy) into a PNG, which
* TextureLoader loads with flipY = true, so v = 1 is image row 0. The sign
* follows flipY; there is no bug to fix in either.
*
* NYQUIST BUDGET (extraction doc: "Nyquist discipline", adopt: yes)
* ----------------------------------------------------------------
* Shared micro tile:  256 px over 0.25 m  = 0.98 mm/texel.
*   Finest authored band 32 cells = 8.0 texels/cell (7.8 mm). >= 5 texels: OK.
* Shared macro tile:  256 px, low-frequency only, finest band 24 cells
*   = 10.7 texels/cell. >= 5 texels: OK.
* Per-surface tiles declare `tileMetres`, so `metresPerTexel` is derivable and
* a surface author can budget their own bands. `surfaceTexelBudget()` reports
* it; keep every authored band at or above 5 texels per cycle.
*
* COST
* ----
* Zero draw calls, zero triangles, no per-frame work. Build-time CPU only.
* Memory per forged surface at the default 512 px is 4 x 1 MB of RGBA plus its
* mip chain (~5.6 MB resident). The two shared 256 px maps are 256 KB each
* plus mips and are built at most once for the whole game.
*
* MEASURED bake time (Node 22, dave-gaming-pc, 4-octave fbm + Worley height):
* shared micro tile 19.9 ms once; one 512 px surface 105 ms; one 1024 px
* surface 358 ms. Boot cost is therefore roughly 0.1 s per surface at the
* default size - budget it. Prefer 512, keep Worley to one band, and do not
* raise a surface to 1024 without a Nyquist reason (`surfaceTexelBudget`).
*/
/**
* Sin-free integer hash. Sin-based hashes band badly at high lattice
* coordinates; this is a Wang-style avalanche mix over three Math.imul rounds.
*/
function hash2(ix, iy, seed) {
	let h = Math.imul(ix | 0, 668265261) ^ Math.imul(iy | 0, 374761393) ^ Math.imul(seed | 0, 2654435761);
	h = Math.imul(h ^ h >>> 15, 739982445);
	h = Math.imul(h ^ h >>> 13, 695872825);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}
function wrapIndex(index, period) {
	const wrapped = index % period;
	return wrapped < 0 ? wrapped + period : wrapped;
}
/** Builds the seeded noise toolkit. Exported so tileability can be tested. */
function createSurfaceNoise(seed) {
	const base = seed | 0;
	const noise = (x, y, period, salt = 0) => {
		const cells = Math.max(1, Math.round(period));
		const xi = Math.floor(x);
		const yi = Math.floor(y);
		const xf = x - xi;
		const yf = y - yi;
		const u = xf * xf * (3 - 2 * xf);
		const v = yf * yf * (3 - 2 * yf);
		const x0 = wrapIndex(xi, cells);
		const x1 = wrapIndex(xi + 1, cells);
		const y0 = wrapIndex(yi, cells);
		const y1 = wrapIndex(yi + 1, cells);
		const s = base + salt;
		const a = hash2(x0, y0, s);
		const b = hash2(x1, y0, s);
		const c = hash2(x0, y1, s);
		const d = hash2(x1, y1, s);
		const top = a + (b - a) * u;
		return top + (c + (d - c) * u - top) * v;
	};
	const fbm = (x, y, period, octaves = 4, gain = .5) => {
		let sum = 0;
		let norm = 0;
		let amplitude = 1;
		let frequency = 1;
		let cells = Math.max(1, Math.round(period));
		for (let octave = 0; octave < octaves; octave += 1) {
			sum += amplitude * noise(x * frequency, y * frequency, cells, octave * 101);
			norm += amplitude;
			amplitude *= gain;
			frequency *= 2;
			cells *= 2;
		}
		return norm > 0 ? sum / norm : 0;
	};
	return {
		hash: (ix, iy) => hash2(ix, iy, base),
		noise: (x, y, period) => noise(x, y, period),
		fbm,
		warp: (x, y, period, amount) => {
			const dx = (fbm(x, y, period, 2) - .5) * amount;
			const dy = (fbm(x + 7.13, y + 3.71, period, 2) - .5) * amount;
			return fbm(x + dx, y + dy, period, 3);
		},
		worley: (x, y, period) => {
			const cells = Math.max(1, Math.round(period));
			const xi = Math.floor(x);
			const yi = Math.floor(y);
			let best = 1e9;
			for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
				const cx = xi + ox;
				const cy = yi + oy;
				const wx = wrapIndex(cx, cells);
				const wy = wrapIndex(cy, cells);
				const px = cx + hash2(wx, wy, base + 17);
				const py = cy + hash2(wx, wy, base + 31);
				const dx = px - x;
				const dy = py - y;
				const distance = dx * dx + dy * dy;
				if (distance < best) best = distance;
			}
			return Math.min(1, Math.sqrt(best));
		}
	};
}
var DEFAULT_SIZE = 512;
var DEFAULT_TILE_METRES = 2;
var DEFAULT_RELIEF_METRES = .006;
/** The shared micro tile's authored physical size. Never change one alone. */
var MICRO_TILE_METRES = .25;
var MICRO_SIZE = 256;
var MICRO_RELIEF_METRES = .0016;
/**
* Fills `outU`/`outV` with the surface slope in metres per metre.
*
* The 3x3 Sobel response is normalised by the kernel weight (8) to become a
* per-texel delta, then divided by the texel size (1 / size) to become a
* gradient across the whole tile, then scaled by `reliefRatio` = relief metres
* over tile metres. The result is physical, not resolution-dependent: a 5 mm
* mortar recess on a 1.35 m tile produces exactly the slope 5 mm over 1.35 m
* implies, at 256 px or at 2048 px.
*
* `outV` is the slope in the CANVAS-DOWN direction. The encoder negates dv for
* the flipY convention documented in the module header.
*/
function sobelSlopes(height, size, reliefRatio, outU, outV) {
	const scale = size * reliefRatio;
	for (let y = 0; y < size; y += 1) {
		const up = (y - 1 + size) % size;
		const down = (y + 1) % size;
		const rowUp = up * size;
		const rowMid = y * size;
		const rowDown = down * size;
		for (let x = 0; x < size; x += 1) {
			const left = (x - 1 + size) % size;
			const right = (x + 1) % size;
			const lu = height[rowUp + left];
			const cu = height[rowUp + x];
			const ru = height[rowUp + right];
			const lm = height[rowMid + left];
			const rm = height[rowMid + right];
			const ld = height[rowDown + left];
			const cd = height[rowDown + x];
			const rd = height[rowDown + right];
			const gx = (ru + 2 * rm + rd - (lu + 2 * lm + ld)) / 8;
			const gy = (ld + 2 * cd + rd - (lu + 2 * cu + ru)) / 8;
			outU[rowMid + x] = gx * scale;
			outV[rowMid + x] = gy * scale;
		}
	}
}
/** Wrapped bilinear read of a periodic float field. */
function sampleWrapped(field, size, x, y) {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const fx = x - x0;
	const fy = y - y0;
	const xa = wrapIndex(x0, size);
	const xb = wrapIndex(x0 + 1, size);
	const ya = wrapIndex(y0, size) * size;
	const yb = wrapIndex(y0 + 1, size) * size;
	const top = field[ya + xa] + (field[ya + xb] - field[ya + xa]) * fx;
	return top + (field[yb + xa] + (field[yb + xb] - field[yb + xa]) * fx - top) * fy;
}
var microRaster = null;
/**
* The shared micro-detail raster: aggregate tooth at a FIXED physical size of
* 0.25 m, so it can be tiled at whatever frequency each surface needs without
* its world scale drifting.
*
* Bands are Nyquist-budgeted against 256 px / 0.25 m = 0.98 mm/texel:
* a 10-cell base (25.6 texels) with 2 octaves down to 20 cells (12.8 texels),
* plus a 32-cell grain band (8.0 texels, 7.8 mm). Nothing finer is authored.
*/
function sharedMicroDetailRaster() {
	if (microRaster) return microRaster;
	const size = MICRO_SIZE;
	const noise = createSurfaceNoise(1293688993);
	const height = new Float32Array(size * size);
	const rgba = new Uint8ClampedArray(size * size * 4);
	for (let y = 0; y < size; y += 1) {
		const v = 1 - (y + .5) / size;
		for (let x = 0; x < size; x += 1) {
			const u = (x + .5) / size;
			const bed = noise.fbm(u * 10, v * 10, 10, 2, .5);
			const grain = noise.noise(u * 32, v * 32, 32);
			const stone = 1 - noise.worley(u * 14, v * 14, 14);
			const h = Math.min(1, Math.max(0, bed * .5 + grain * .28 + stone * .22));
			const index = y * size + x;
			height[index] = h;
			const variation = Math.round((.5 + (h - .5) * .45) * 255);
			const offset = index * 4;
			rgba[offset] = variation;
			rgba[offset + 1] = variation;
			rgba[offset + 2] = variation;
			rgba[offset + 3] = Math.round(h * 255);
		}
	}
	const slopeU = new Float32Array(size * size);
	const slopeV = new Float32Array(size * size);
	sobelSlopes(height, size, MICRO_RELIEF_METRES / MICRO_TILE_METRES, slopeU, slopeV);
	microRaster = {
		size,
		height,
		slopeU,
		slopeV,
		rgba
	};
	return microRaster;
}
var canvasSupport = null;
/**
* True only when a real, readable 2D canvas exists. The parity audit's shimmed
* context swallows draw calls, so we verify a written pixel actually reads
* back rather than trusting `getContext('2d') !== null`.
*/
function surfaceForgeCanvasAvailable() {
	if (canvasSupport !== null) return canvasSupport;
	canvasSupport = false;
	try {
		if (typeof document === "undefined" || typeof document.createElement !== "function") return false;
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		const context = canvas.getContext("2d");
		if (!context || typeof context.createImageData !== "function" || typeof context.putImageData !== "function" || typeof context.getImageData !== "function") return false;
		const image = context.createImageData(1, 1);
		if (!image?.data || image.data.length < 4) return false;
		image.data[0] = 17;
		image.data[1] = 71;
		image.data[2] = 113;
		image.data[3] = 255;
		context.putImageData(image, 0, 0);
		const probe = context.getImageData(0, 0, 1, 1);
		canvasSupport = Boolean(probe?.data && probe.data.length >= 4 && probe.data[0] === 17 && probe.data[1] === 71 && probe.data[2] === 113 && probe.data[3] === 255);
		return canvasSupport;
	} catch {
		canvasSupport = false;
		return false;
	}
}
function canvasTexture(name, rgba, size, colorSpace, repeat, anisotropy) {
	try {
		if (!surfaceForgeCanvasAvailable()) return null;
		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		const context = canvas.getContext("2d");
		if (!context) return null;
		const image = context.createImageData(size, size);
		if (!image?.data || image.data.length !== rgba.length) return null;
		image.data.set(rgba);
		context.putImageData(image, 0, 0);
		const texture = new CanvasTexture(canvas);
		texture.name = name;
		texture.colorSpace = colorSpace;
		texture.wrapS = RepeatWrapping;
		texture.wrapT = RepeatWrapping;
		texture.repeat.set(repeat[0], repeat[1]);
		texture.anisotropy = anisotropy;
		texture.needsUpdate = true;
		return texture;
	} catch {
		return null;
	}
}
function clamp01$1(value) {
	if (!Number.isFinite(value)) return 0;
	return value < 0 ? 0 : value > 1 ? 1 : value;
}
function toByte(value) {
	return Math.round(clamp01$1(value) * 255);
}
/**
* Derives the micro repetition count from the surface's physical footprint so
* the tooth keeps a fixed real-world size. Capped so one micro repeat never
* gets fewer than 64 surface texels, which would alias the 8-texel grain band
* into salt-and-pepper (extraction doc, "Nyquist discipline").
*/
function deriveMicroTiles(tileMetres, size) {
	const ideal = Math.max(1, Math.round(tileMetres / MICRO_TILE_METRES));
	return Math.max(1, Math.min(ideal, Math.floor(size / 64) || 1));
}
/**
* Turns one `SurfaceDescription` into four RGBA rasters plus the height field.
* Pure CPU: no DOM, no renderer, never throws on a headless host.
*/
function rasterizeSurface(description, options = {}) {
	const size = Math.max(4, Math.round(options.size ?? DEFAULT_SIZE));
	const seed = options.seed ?? 1592594597;
	const tileMetres = Math.max(1e-4, options.tileMetres ?? DEFAULT_TILE_METRES);
	const reliefMetres = Math.max(0, options.reliefMetres ?? DEFAULT_RELIEF_METRES);
	const normalStrength = options.normalStrength ?? 1;
	const noise = createSurfaceNoise(seed);
	const texels = size * size;
	const albedo = new Uint8ClampedArray(texels * 4);
	const roughness = new Uint8ClampedArray(texels * 4);
	const ao = new Uint8ClampedArray(texels * 4);
	const normal = new Uint8ClampedArray(texels * 4);
	const height = new Float32Array(texels);
	const albedoLinearish = new Float32Array(texels * 3);
	const aoField = new Float32Array(texels);
	for (let y = 0; y < size; y += 1) {
		const v = 1 - (y + .5) / size;
		for (let x = 0; x < size; x += 1) {
			const u = (x + .5) / size;
			const index = y * size + x;
			const sample = description(u, v, noise);
			height[index] = clamp01$1(sample.height);
			albedoLinearish[index * 3] = clamp01$1(sample.albedo[0]);
			albedoLinearish[index * 3 + 1] = clamp01$1(sample.albedo[1]);
			albedoLinearish[index * 3 + 2] = clamp01$1(sample.albedo[2]);
			aoField[index] = clamp01$1(sample.ao ?? 1);
			const offset = index * 4;
			roughness[offset] = toByte(sample.roughness);
			roughness[offset + 1] = roughness[offset];
			roughness[offset + 2] = roughness[offset];
			roughness[offset + 3] = 255;
		}
	}
	const slopeU = new Float32Array(texels);
	const slopeV = new Float32Array(texels);
	sobelSlopes(height, size, reliefMetres / tileMetres * normalStrength, slopeU, slopeV);
	const micro = options.micro === false ? null : options.micro ?? {};
	const microTiles = micro ? micro.tiles ?? deriveMicroTiles(tileMetres, size) : 0;
	const microStrength = micro ? micro.strength ?? .85 : 0;
	const microAo = micro ? micro.aoAmount ?? .22 : 0;
	const microAlbedo = micro ? micro.albedoAmount ?? .07 : 0;
	const detail = micro && microTiles > 0 ? sharedMicroDetailRaster() : null;
	const microScale = detail ? microTiles * detail.size / size : 0;
	for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
		const index = y * size + x;
		const offset = index * 4;
		let du = slopeU[index];
		let dv = slopeV[index];
		let occlusion = aoField[index];
		let tint = 1;
		if (detail) {
			const mx = (x + .5) * microScale - .5;
			const my = (y + .5) * microScale - .5;
			du += sampleWrapped(detail.slopeU, detail.size, mx, my) * microStrength;
			dv += sampleWrapped(detail.slopeV, detail.size, mx, my) * microStrength;
			const microHeight = sampleWrapped(detail.height, detail.size, mx, my);
			occlusion *= 1 - microAo * (1 - microHeight);
			tint = 1 + microAlbedo * (microHeight - .5) * 2;
		}
		albedo[offset] = toByte(albedoLinearish[index * 3] * tint);
		albedo[offset + 1] = toByte(albedoLinearish[index * 3 + 1] * tint);
		albedo[offset + 2] = toByte(albedoLinearish[index * 3 + 2] * tint);
		albedo[offset + 3] = 255;
		ao[offset] = toByte(occlusion);
		ao[offset + 1] = ao[offset];
		ao[offset + 2] = ao[offset];
		ao[offset + 3] = 255;
		const inverse = 1 / Math.hypot(du, dv, 1);
		normal[offset] = Math.round((-du * inverse * .5 + .5) * 255);
		normal[offset + 1] = Math.round((dv * inverse * .5 + .5) * 255);
		normal[offset + 2] = Math.round((inverse * .5 + .5) * 255);
		normal[offset + 3] = 255;
	}
	return {
		size,
		albedo,
		normal,
		roughness,
		ao,
		height,
		microTiles
	};
}
var surfaceCache = /* @__PURE__ */ new Map();
function unavailableSurface(name, size, tileMetres, reliefRatio) {
	return Object.freeze({
		name,
		size,
		available: false,
		map: null,
		normalMap: null,
		roughnessMap: null,
		aoMap: null,
		reliefRatio,
		tileMetres
	});
}
/**
* Forges the full PBR set for one authored surface, cached by `name`.
*
* Repeat calls with the same name return the IDENTICAL object, so callers may
* forge freely at build time; the name must therefore be unique per
* (description, options) pair, exactly like the `textureCache` key discipline
* in src/test-maps-art.ts:34.
*
* On a headless host every map is null and `available` is false: callers must
* fall back to a flat colour. This function never throws.
*/
function forgeSurface(name, description, options = {}) {
	const cached = surfaceCache.get(name);
	if (cached) return cached;
	const size = Math.max(4, Math.round(options.size ?? DEFAULT_SIZE));
	const tileMetres = Math.max(1e-4, options.tileMetres ?? DEFAULT_TILE_METRES);
	const reliefRatio = Math.max(0, options.reliefMetres ?? DEFAULT_RELIEF_METRES) / tileMetres;
	const repeat = options.repeat ?? [1, 1];
	const anisotropy = options.anisotropy ?? 4;
	if (!surfaceForgeCanvasAvailable()) {
		const empty = unavailableSurface(name, size, tileMetres, reliefRatio);
		surfaceCache.set(name, empty);
		return empty;
	}
	let forged;
	try {
		const raster = rasterizeSurface(description, options);
		const map = canvasTexture(`${name}-albedo`, raster.albedo, size, SRGBColorSpace, repeat, anisotropy);
		const normalMap = canvasTexture(`${name}-normal`, raster.normal, size, "", repeat, anisotropy);
		const roughnessMap = canvasTexture(`${name}-roughness`, raster.roughness, size, "", repeat, anisotropy);
		const aoMap = canvasTexture(`${name}-ao`, raster.ao, size, "", repeat, anisotropy);
		forged = Object.freeze({
			name,
			size,
			available: map !== null,
			map,
			normalMap,
			roughnessMap,
			aoMap,
			reliefRatio,
			tileMetres
		});
	} catch {
		forged = unavailableSurface(name, size, tileMetres, reliefRatio);
	}
	surfaceCache.set(name, forged);
	return forged;
}
/**
* Builds a MeshStandardMaterial from a forged set with the correct colour
* spaces already carried by the textures (albedo sRGB; normal, roughness and
* AO in NoColorSpace) and one repeat across every map.
*
* When the set is unavailable the material is a plain flat colour, which is
* the headless / parity-audit path.
*/
function surfaceStandardMaterial(forged, options = {}) {
	const material = new MeshStandardMaterial({
		color: options.color ?? 16777215,
		roughness: options.roughness ?? .9,
		metalness: options.metalness ?? 0,
		side: options.side ?? 0
	});
	material.name = `${forged.name}-standard`;
	const repeat = options.repeat;
	const apply = (texture) => {
		if (!texture || !repeat) return;
		texture.repeat.set(repeat[0], repeat[1]);
		texture.needsUpdate = true;
	};
	if (forged.map) {
		material.map = forged.map;
		apply(forged.map);
	}
	if (forged.normalMap) {
		material.normalMap = forged.normalMap;
		material.normalScale = new Vector2(options.normalScale ?? 1, options.normalScale ?? 1);
		apply(forged.normalMap);
	}
	if (forged.roughnessMap) {
		material.roughnessMap = forged.roughnessMap;
		material.roughness = 1;
		apply(forged.roughnessMap);
	}
	if (forged.aoMap) {
		material.aoMap = forged.aoMap;
		material.aoMapIntensity = options.aoMapIntensity ?? 1;
		apply(forged.aoMap);
	}
	material.needsUpdate = true;
	return material;
}
//#endregion
//#region src/test-maps-art.ts
/**
* Test1/Test2 procedural art — forged PBR surfaces plus the shared
* environment kit.
*
* OWNER 2026-08-30, on playing the first pass: "test 1 and test 2 map are a
* good start but only a small portion of the map and style, we need a deeper
* recreation ... we need to use some of your better techniques to sort the
* quality of trees, grass mountains etc, i seen so much better, and lighting".
*
* WHAT CHANGED AND WHY
* --------------------
* v1 of this file painted 13 canvas textures and bound exactly one slot,
* `material.map`. Every hardpan, plywood, cinderblock and travertine surface
* in both maps was therefore a FLAT PAINTED PLANE: no normal, no roughness
* variation, no AO, so nothing broke at a grazing angle, nothing caught the
* sun, and the "lit by a constant" read the owner called out survived any
* amount of lighting work. v1 also hand-rolled its vegetation and backdrop —
* 140 cloned cones, 18 squashed hemispheres, and a dead-straight row of 12
* cypress cones with 12 separate trunk draws.
*
* v2 replaces both halves with the two kits built for exactly this
* (docs/UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md):
*
*   - src/rendering/surface-forge.ts. ONE authored `SurfaceDescription` per
*     surface yields albedo + a Sobel tangent NORMAL + roughness + AO, all
*     four derived from the same height/colour function so they cannot
*     disagree, plus a shared two-scale micro/macro detail layer pinned to a
*     fixed physical size. Every surface in both maps now has a normal map.
*   - src/rendering/environment-kit.ts. Deterministic instanced vegetation
*     (Poisson with layered inter-layer clearance, position-hashed variation,
*     two build-time LOD tiers, contact skirts) and a displaced ridgeline
*     ring in place of the hemisphere hills.
*
* BAKE BUDGET (the forge measures ~105 ms per 512 px set — budget it)
* ------------------------------------------------------------------
* Surfaces are SHARED, not one per material. Six forged sets per arena carry
* eleven Test1 materials and eight Test2 materials; near-identical materials
* differ only by tint, roughness and repeat, which costs nothing.
*
* MEASURED end to end on dave-gaming-pc (Node 24), each arena in its OWN
* process so the shared tiles are paid once per measurement exactly as they
* are at boot, calling the real `test1Materials()` / `test2Materials()` against
* a byte-accurate 2D canvas. Two runs each, 2026-08-30:
*
*   test1Materials()   502 / 540 ms   6 sets + both shared tiles  (~81 ms/set)
*   test2Materials()   666 / 630 ms   6 sets + both shared tiles (~102 ms/set)
*   shared micro tile   12 ms   shared macro tile   24 ms
*
* Only ONE arena is ever built, so the boot cost a player pays is ~0.52 s
* (Test1) or ~0.65 s (Test2) — comfortably inside the ~1.2 s ceiling, with
* room for a seventh surface later if one is ever justified. Test2 is the
* dearer half because travertine, stucco and pool tile each run a `warp`,
* which is three fbm stacks rather than one; that is the knob to turn first if
* a future surface pushes the budget.
*
* NOTHING here is baked at 1024. `surfaceTexelBudget` says every authored band
* already clears the 5-texel Nyquist floor at 512 (the per-surface numbers are
* on each description), and 1024 measures 358 ms — 3.4x the cost for bands
* that are already resolved.
*
* CONTRACTS (unchanged from v1, and all still enforced)
* ----------------------------------------------------
* - PRESENTATION ONLY. Nothing in this file adds a collider, shot surface,
*   spawn or navigation. Every mesh is tagged `presentationOnly`, has its
*   `raycast` replaced with a no-op, and the vegetation kit does the same.
* - DETERMINISTIC. Seeded mulberry32 and integer position hashes only; no
*   `Math.random`, no `Date`, no iteration-order dependence.
* - HEADLESS-SAFE. `forgeSurface` probes for a real, readable 2D canvas and
*   returns an all-null set when there is none, so the collider/visual parity
*   audit and the vitest suites pay ZERO bake cost and fall back to flat
*   colours. The environment kit is pure `three` geometry.
* - DRESSING NEVER BECOMES GHOST COVER. Every prop below is under 0.9 m tall,
*   thinner than 0.35 m in its widest axis, sits at or above the 2.6 m
*   reachable ceiling, lies outside the arena bounds, or carries a name the
*   parity audit's foliage/cloth rules exclude by construction. Anything that
*   should stop a body or a bullet is authored in src/test-maps.ts as a real
*   collider instead.
*/
function mulberry32(seed) {
	return () => {
		seed |= 0;
		seed = seed + 1831565813 | 0;
		let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
/**
* One scratch sample, reused for every texel. The forge copies the returned
* value immediately (surface-forge.ts `SurfaceDescription`), so a description
* must NOT allocate 262 144 objects per bake.
*/
var SAMPLE_ALBEDO = [
	0,
	0,
	0
];
var SAMPLE = {
	albedo: SAMPLE_ALBEDO,
	height: 0,
	roughness: 1,
	ao: 1
};
/**
* AO IS BAKED AS sqrt(ao), NOT ao.
*
* `aoMap` multiplies the INDIRECT term only, and indirect is most of the
* lighting budget of every shadowed pixel: the flat ambient, the global
* hemisphere, the 0.22 shadow-side fill and - since 2026-08-31 - the arena
* environment. An authored AO floor of 0.28 (hedge) or 0.10 (travertine
* joints) therefore removes 72-90% of nearly all the light a crevice will ever
* receive, which is why the crevices measured at linear luma 0.0005 while the
* same material's open face measured 0.12 on the same frame.
*
* The 2026-08-30 wording said these arenas have NO `scene.environment` at all.
* That was true of the first arena of every page load and false from the
* second onward, and the difference was a bug, not a policy - it is fixed
* (docs/IBL_FIRST_ARENA_BUG_2026-08-31.md). The sqrt rule is unaffected: it
* was never about how much indirect there is, only about a multiplier that can
* drive whatever indirect exists to zero. Restoring the environment makes the
* rule matter MORE, because there is now more indirect light for a floor of
* 0.10 to delete.
*
* Upstream states the rule outright (UPSTREAM_TECHNIQUE_EXTRACTION, "Two-band
* normal-gated bounce fill", citing materialpatch.js:49-58): the fill bands are
* "occluded by sqrt(AO), never AO - a fill term that AO can drive to zero is
* not a fill, it is another way to make a black hole". We cannot patch the
* shader from here, but sqrt is a pointwise function of the authored value, so
* baking sqrt(ao) into the map is exactly equivalent and costs nothing.
*
* It also has the right SHAPE: contact darkening at ao 0.8 is barely touched
* (0.89) while a floor at 0.10 lifts to 0.32, so grooves keep their read and
* stop being holes. Every `ao` expression below is authored as the real
* occlusion; the sqrt is applied once, here.
*/
function emit(r, g, b, height, roughness, ao = 1) {
	SAMPLE_ALBEDO[0] = r;
	SAMPLE_ALBEDO[1] = g;
	SAMPLE_ALBEDO[2] = b;
	SAMPLE.height = height;
	SAMPLE.roughness = roughness;
	SAMPLE.ao = Math.sqrt(clamp01(ao));
	return SAMPLE;
}
/** sRGB 0..1 triple from a hex literal, so palettes stay readable as colours. */
function rgb(hex) {
	return [
		(hex >> 16 & 255) / 255,
		(hex >> 8 & 255) / 255,
		(hex & 255) / 255
	];
}
function lerp(a, b, t) {
	return a + (b - a) * t;
}
function clamp01(value) {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}
function smooth(edge0, edge1, x) {
	const t = clamp01((x - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}
/** Emit a two-stop colour ramp without allocating an intermediate triple. */
function emitMix(a, b, t, height, roughness, ao = 1) {
	return emit(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), height, roughness, ao);
}
/**
* Shortest distance between two coordinates on the unit circle. Every
* authored feature uses this rather than `|a - b|` so a groove or a rut
* placed near u = 0 stays continuous across the tile seam — the property the
* v1 canvas painters lacked, where blobs drawn near an edge were clipped and
* the tile showed a seam grid at high repeat counts.
*/
function wrapDelta(a, b) {
	const d = Math.abs(a - b) % 1;
	return d > .5 ? 1 - d : d;
}
/** 1 at the groove centre falling smoothly to 0 at `halfWidth`. Seamless. */
function groove(coord, centre, halfWidth) {
	return 1 - smooth(0, halfWidth, wrapDelta(coord, centre));
}
/**
* Seamless anisotropic streaking.
*
* The noise toolkit wraps x and y on the SAME integer period, so
* `fbm(u * 3, v * 48, 48)` would tear at u = 1. A phase-modulated sinusoid
* carries the fine direction instead: `sin(2*pi*cycles*coord + warp)` is
* periodic for integer `cycles` whatever periodic field `warp` is, which is
* what lets plywood grain, corrugation and plank runs be both directional and
* seam-free.
*/
function streak(coord, cycles, warp) {
	return .5 + .5 * Math.sin(coord * Math.PI * 2 * cycles + warp);
}
var HARDPAN_SHADOW = rgb(7302478);
var HARDPAN_MID = rgb(11571804);
var HARDPAN_BLEACH = rgb(14205331);
/**
* Dust hardpan with tyre ruts. tileMetres 4, 512 px = 7.8 mm/texel.
* Finest band: the 32-cell grit Worley = 12.5 cm cells = 16 texels/cell.
*/
var hardpanSurface = (u, v, noise) => {
	const drift = noise.fbm(u * 8, v * 8, 8, 4);
	const grit = 1 - noise.worley(u * 32, v * 32, 32);
	const rut = Math.max(groove(u, .29, .052), groove(u, .71, .052));
	const bleach = smooth(.52, .92, drift);
	const tone = clamp01(drift * .85 + grit * .3 - rut * .45);
	const height = .5 + (drift - .5) * .55 + grit * .22 - rut * .4;
	const roughness = .99 - rut * .22 - bleach * .05;
	const ao = 1 - rut * .3 - grit * .12;
	return emitMix(HARDPAN_SHADOW, tone > .55 ? HARDPAN_BLEACH : HARDPAN_MID, tone, height, roughness, ao);
};
var PLYWOOD_DARK = rgb(9136700);
var PLYWOOD_MID = rgb(12557668);
var PLYWOOD_PALE = rgb(14467210);
/**
* Softwood ply sheet. tileMetres 1.2, 512 px = 2.3 mm/texel.
* Finest band: 26 grain cycles = 19.7 texels/cycle.
*/
var plywoodSurface = (u, v, noise) => {
	const grain = streak(v, 26, (noise.fbm(u * 6, v * 6, 6, 3) - .5) * 8);
	const figure = noise.fbm(u * 4, v * 4, 4, 3);
	const cell = noise.worley(u * 4, v * 4, 4);
	const knot = 1 - smooth(0, .16, cell);
	const rings = knot > 0 ? .5 + .5 * Math.sin(cell * 90) : 0;
	const seam = groove(u, .5, .02) + groove(u, 0, .02);
	const tone = clamp01(.28 + grain * .34 + figure * .34 - knot * .55 - seam * .4);
	const height = .62 + (grain - .5) * .1 - knot * .22 - rings * knot * .12 - seam * .55;
	return emitMix(PLYWOOD_DARK, tone > .6 ? PLYWOOD_PALE : PLYWOOD_MID, tone, height, .86 + knot * .08, 1 - seam * .45 - knot * .2);
};
var STEEL_SHADOW = rgb(8358030);
var STEEL_MID = rgb(12173766);
var RUST = rgb(11034938);
/**
* Corrugated container steel. tileMetres 2.4, 512 px = 4.7 mm/texel.
* Finest band: 12 corrugations = 20 cm pitch = 42.7 texels/cycle. The 22 mm
* relief on a 2.4 m tile gives a peak slope of 19 degrees, which is what puts
* a real sun-catch band down every rib instead of a painted gradient.
*/
var corrugatedSurface = (u, v, noise) => {
	const rib = streak(u, 12, 0);
	const rail = Math.max(groove(v, .08, .03), groove(v, .92, .03));
	const oxide = noise.fbm(u * 6, v * 6, 6, 4);
	const bleed = clamp01((noise.fbm(u * 24, v * 3, 3, 2) - .42) * 3.4) * smooth(.55, .1, v);
	const rustMask = clamp01(rail * .8 + bleed * .75 + smooth(.72, .95, oxide) * .6);
	const shade = clamp01(rib * .85 + oxide * .25);
	const height = .5 + (rib - .5) * .86 - rail * .22;
	const base = shade > .55 ? STEEL_MID : STEEL_SHADOW;
	const t = rustMask > .5 ? 1 : clamp01(shade + rustMask * .4);
	const roughness = lerp(.34, .95, rustMask) + (1 - rib) * .06;
	return emitMix(base, rustMask > .35 ? RUST : STEEL_MID, clamp01(rustMask * 1.4) * .85 + (rustMask > .35 ? 0 : t * .15), height, roughness, 1 - rail * .35 - (1 - rib) * .2);
};
var SANDBAG_SHADOW = rgb(7172944);
var SANDBAG_MID = rgb(11051379);
var SANDBAG_SUN = rgb(13617570);
/**
* Filled hessian sandbag courses. tileMetres 1.6, 512 px = 3.1 mm/texel.
* 6 courses x 3 bags = 27 cm x 53 cm bags; the finest band is the 48-cycle
* hessian weave at 10.7 texels/cycle. Relief is 60 mm: sandbags are the one
* surface on this map whose silhouette is genuinely made of the normal map.
*/
var sandbagSurface = (u, v, noise) => {
	const rows = 6;
	const cols = 3;
	const ry = v * rows;
	const row = Math.floor(ry);
	const fy = ry - row;
	const cx = u * cols + row % 2 * .5;
	const dx = (cx - Math.floor(cx) - .5) * 2;
	const dy = (fy - .5) * 2;
	const inside = clamp01(1 - (dx * dx * .82 + dy * dy));
	const lobe = Math.sqrt(inside);
	const weave = streak(u * cols, 16, 0) * .5 + streak(v * rows, 16, 0) * .5;
	const dirt = noise.fbm(u * 10, v * 10, 10, 3);
	const tone = clamp01(lobe * .72 + weave * .14 + dirt * .2 - .06);
	const height = lobe * .92 + weave * .05;
	return emitMix(SANDBAG_SHADOW, tone > .62 ? SANDBAG_SUN : SANDBAG_MID, tone, height, .97 - lobe * .04, .35 + lobe * .65);
};
var CINDER_SHADOW = rgb(7239292);
var CINDER_MID = rgb(10199977);
var CINDER_PALE = rgb(12765387);
/**
* Cinderblock with struck mortar joints. tileMetres 1.6, 512 px = 3.1 mm/texel.
* 8 courses x 4 blocks = 20 cm x 40 cm — real CMU. The 15 mm mortar joint is
* the finest band at 4.8 texels; the joint carries a smooth shoulder so it
* reads as a recess rather than a one-texel line at mip 0.
*/
var cinderSurface = (u, v, noise) => {
	const rows = 8;
	const cols = 4;
	const ry = v * rows;
	const row = Math.floor(ry);
	const fy = ry - row;
	const cx = u * cols + row % 2 * .5;
	const fx = cx - Math.floor(cx);
	const joint = clamp01(1 - smooth(0, .06, Math.min(fy, 1 - fy)) + (1 - smooth(0, .03, Math.min(fx, 1 - fx))));
	const aggregate = 1 - noise.worley(u * 40, v * 40, 40);
	const stain = noise.fbm(u * 5, v * 5, 5, 4);
	const tone = clamp01(.34 + stain * .5 + aggregate * .24 - joint * .5);
	const height = .72 + aggregate * .16 + (stain - .5) * .08 - joint * .7;
	return emitMix(CINDER_SHADOW, tone > .58 ? CINDER_PALE : CINDER_MID, tone, height, .93 + aggregate * .06, 1 - joint * .5 - aggregate * .1);
};
var TARP_SHADOW = rgb(6187845);
var TARP_MID = rgb(8227419);
var TARP_SUN = rgb(10858112);
/**
* Olive-drab canvas awning/camo net. tileMetres 2.0, 512 px = 3.9 mm/texel.
* Finest band: the 40-cycle weave at 12.8 texels/cycle.
*/
var tarpSurface = (u, v, noise) => {
	const warpThread = streak(u, 40, 0);
	const weftThread = streak(v, 40, 0);
	const weave = Math.max(warpThread, weftThread) * .5 + warpThread * weftThread * .5;
	const fold = noise.warp(u * 4, v * 4, 4, 1.4);
	const fade = noise.fbm(u * 3, v * 3, 3, 2);
	const tone = clamp01(.24 + weave * .2 + fold * .42 + fade * .24);
	const height = .42 + (weave - .5) * .18 + (fold - .5) * .8;
	return emitMix(TARP_SHADOW, tone > .6 ? TARP_SUN : TARP_MID, tone, height, .95 - weave * .06, .72 + weave * .28);
};
var TRAVERTINE_JOINT = rgb(9409680);
var TRAVERTINE_MID = rgb(14076336);
var TRAVERTINE_PALE = rgb(15524557);
/**
* Travertine pavers. tileMetres 2.4, 512 px = 4.7 mm/texel.
* 3 x 3 pavers = 80 cm. Finest band: the 25 mm joint groove at 5.3 texels,
* and the 24-cell pitting Worley at 21 texels/cell.
*/
var travertineSurface = (u, v, noise) => {
	const cells = 3;
	const fx = u * cells - Math.floor(u * cells);
	const fy = v * cells - Math.floor(v * cells);
	const joint = clamp01(1 - smooth(0, .012, Math.min(fx, 1 - fx)) + (1 - smooth(0, .012, Math.min(fy, 1 - fy))));
	const vein = noise.warp(u * 6, v * 6, 6, 1.8);
	const banding = smooth(.44, .56, vein);
	const pitting = smooth(.72, 1, 1 - noise.worley(u * 24, v * 24, 24));
	const tone = clamp01(.46 + vein * .42 - pitting * .3 - joint * .6);
	const height = .78 - pitting * .5 - joint * .78 - banding * .05;
	const roughness = .42 + pitting * .45 + joint * .4;
	return emitMix(TRAVERTINE_JOINT, tone > .62 ? TRAVERTINE_PALE : TRAVERTINE_MID, tone, height, roughness, 1 - joint * .4 - pitting * .24);
};
var STUCCO_SHADE = rgb(13616302);
var STUCCO_MID = rgb(15327439);
var STUCCO_SUN = rgb(16183264);
/**
* Warm white villa stucco. tileMetres 2.4, 512 px = 4.7 mm/texel.
* Finest band: the 36-cell trowel-grain Worley at 14.2 texels/cell.
*/
var stuccoSurface = (u, v, noise) => {
	const trowel = noise.warp(u * 5, v * 5, 5, 2.2);
	const grain = 1 - noise.worley(u * 36, v * 36, 36);
	const wash = smooth(.34, 0, v) * smooth(.4, .75, noise.fbm(u * 7, v * 7, 7, 3));
	const tone = clamp01(.38 + trowel * .44 + grain * .18 - wash * .36);
	const height = .6 + (trowel - .5) * .34 + grain * .24;
	return emitMix(STUCCO_SHADE, tone > .62 ? STUCCO_SUN : STUCCO_MID, tone, height, .82 + grain * .14 + wash * .06, 1 - grain * .16 - wash * .14);
};
var HEDGE_DEEP = rgb(2377770);
var HEDGE_MID = rgb(4027702);
var HEDGE_LIT = rgb(6267972);
/**
* Clipped box hedge. tileMetres 1.0, 512 px = 2.0 mm/texel.
* Finest band: the 40-cell leaf-clump Worley at 12.8 texels/cell. 30 mm of
* relief on a 1 m tile is what turns a flat green box into a surface whose
* clipped face catches the sun and holds shadow between the clumps.
*/
var hedgeSurface = (u, v, noise) => {
	const clump = 1 - noise.worley(u * 40, v * 40, 40);
	const mass = noise.fbm(u * 8, v * 8, 8, 4);
	const sprig = noise.fbm(u * 20, v * 20, 20, 2);
	const depth = clamp01(clump * .62 + sprig * .38);
	const tone = clamp01(depth * .72 + mass * .34 - .1);
	const height = depth * .86 + mass * .14;
	const roughness = .99 - depth * .22;
	return emitMix(HEDGE_DEEP, tone > .58 ? HEDGE_LIT : HEDGE_MID, tone, height, roughness, .4 + depth * .6);
};
var POOL_GROUT = rgb(3837110);
var POOL_TILE = rgb(6536429);
var POOL_GLINT = rgb(10870778);
/**
* Glazed pool tile with a baked caustic web. tileMetres 1.2, 512 px =
* 2.3 mm/texel. 4 x 4 tiles = 30 cm; the 12 mm grout line is the finest band
* at 5.1 texels.
*/
var poolTileSurface = (u, v, noise) => {
	const cells = 4;
	const fx = u * cells - Math.floor(u * cells);
	const fy = v * cells - Math.floor(v * cells);
	const grout = clamp01(1 - smooth(0, .02, Math.min(fx, 1 - fx)) + (1 - smooth(0, .02, Math.min(fy, 1 - fy))));
	const web = noise.warp(u * 7, v * 7, 7, 2.6);
	const caustic = Math.pow(1 - Math.abs(web - .5) * 2, 4);
	const tone = clamp01(.4 + noise.fbm(u * 12, v * 12, 12, 2) * .24 + caustic * .62 - grout * .7);
	const height = .82 - grout * .85;
	return emitMix(POOL_GROUT, tone > .6 ? POOL_GLINT : POOL_TILE, tone, height, .14 + grout * .62, 1 - grout * .4);
};
var COURT_SHADOW = rgb(9061430);
var COURT_MID = rgb(11557444);
var COURT_SUN = rgb(13203292);
/**
* Acrylic sport-court topcoat. tileMetres 3.0, 512 px = 5.9 mm/texel.
* Finest band: the 44-cell silica-grain Worley at 11.6 texels/cell. The court
* MARKINGS are deliberately geometry, not texture — at this mapping a 5 cm
* line would be 8.5 texels across a whole 12 m court and would blur to a
* smear by mip 2, so `applyTest2Dressing` lays them as flush painted quads.
*/
var courtSurface = (u, v, noise) => {
	const silica = 1 - noise.worley(u * 44, v * 44, 44);
	const rollMark = noise.fbm(u * 4, v * 4, 4, 3);
	const wear = smooth(.55, .95, noise.fbm(u * 9, v * 9, 9, 2));
	const tone = clamp01(.4 + rollMark * .36 + silica * .22 + wear * .12);
	const height = .55 + silica * .34 + (rollMark - .5) * .12;
	return emitMix(COURT_SHADOW, tone > .6 ? COURT_SUN : COURT_MID, tone, height, .62 + silica * .24 - wear * .08, 1 - silica * .14);
};
var TIMBER_SHADOW = rgb(7164214);
var TIMBER_MID = rgb(9859403);
var TIMBER_SUN = rgb(12162665);
/**
* Oiled hardwood decking. tileMetres 1.6, 512 px = 3.1 mm/texel.
* 8 boards = 20 cm; the 15 mm board gap is the finest band at 4.8 texels.
*/
var timberSurface = (u, v, noise) => {
	const by = v * 8;
	const board = Math.floor(by);
	const fy = by - board;
	const gap = 1 - smooth(0, .045, Math.min(fy, 1 - fy));
	const boardTone = noise.hash(board, 7);
	const grain = streak(v, 30, (noise.fbm(u * 5, v * 5, 5, 3) - .5) * 6);
	const weather = noise.fbm(u * 3, v * 3, 3, 3);
	const tone = clamp01(.26 + grain * .3 + weather * .28 + boardTone * .22 - gap * .7);
	const height = .7 + (grain - .5) * .14 - gap * .8;
	return emitMix(TIMBER_SHADOW, tone > .6 ? TIMBER_SUN : TIMBER_MID, tone, height, .7 + weather * .22 + gap * .1, 1 - gap * .55);
};
/**
* A material on a forged set.
*
* The forged set is cached by name and its four textures are SHARED by every
* material built from it, so no variant may write a repeat onto them. Scale is
* carried per MESH instead, by `worldTiled` — see the note there for why the
* old per-material repeat could not be right for more than one mesh size.
*/
function forgedMaterial(forged, name, options) {
	const material = surfaceStandardMaterial(forged, {
		color: options.color ?? 16777215,
		roughness: options.roughness ?? .92,
		metalness: options.metalness ?? 0,
		normalScale: options.normalScale ?? 1,
		aoMapIntensity: options.aoMapIntensity ?? 1,
		side: options.side
	});
	material.name = name;
	material.userData.metresPerTile = options.metresPerTile;
	return material;
}
/**
* Re-scale a box's UVs so a shared material tiles at a FIXED WORLD SIZE.
*
* `BoxGeometry` emits 0..1 per face whatever the face measures, so a single
* `map.repeat` can only ever be correct for one mesh size. v1 tuned each
* repeat to whichever mesh was biggest and every other user of that material
* came out at the wrong density — the 84 m ground slab and a 5 m shed roof
* wearing one hardpan repeat differ by a factor of seventeen. Scaling the
* geometry's own UVs makes the density a property of the MESH, which is what
* it physically is, and lets eleven Test1 materials share six forged sets
* without a single cloned texture.
*
* One scale pair has to serve all six faces, so the pair is chosen from the
* face the viewer actually reads: a SLAB (thin in Y) is read from above, so
* the pair is (width, depth); a WALL (thin in X or Z) is read on its long
* elevation, so the pair is (long horizontal, height). Getting those right is
* what matters — the remaining faces are the 0.3-1 m edge bands where the
* difference is not readable.
*/
function worldTiled(mesh, size) {
	const material = mesh.material;
	const metres = typeof material?.userData?.metresPerTile === "number" ? material.userData.metresPerTile : 0;
	const uv = mesh.geometry.getAttribute("uv");
	if (!(metres > 0) || !uv) return mesh;
	const [sizeX, sizeY, sizeZ] = size;
	const slab = sizeY <= Math.min(sizeX, sizeZ);
	const su = Math.max(slab ? sizeX : Math.max(sizeX, sizeZ), .01) / metres;
	const sv = Math.max(slab ? sizeZ : sizeY, .01) / metres;
	for (let index = 0; index < uv.count; index += 1) uv.setXY(index, uv.getX(index) * su, uv.getY(index) * sv);
	uv.needsUpdate = true;
	return mesh;
}
/**
* Six forged sets carrying eleven materials. The repeats below are authored in
* WORLD terms: a BoxGeometry face is 0..1 in UV whatever its size, so a repeat
* of R means R tiles across that face, and the numbers are picked so the
* surface's `tileMetres` lands close to its real-world scale on the mesh the
* material is dominantly used on.
*/
function test1Materials() {
	const hardpan = forgeSurface("test1-hardpan", hardpanSurface, {
		size: 512,
		seed: 41242,
		tileMetres: 4,
		reliefMetres: .032,
		anisotropy: 8
	});
	const plywood = forgeSurface("test1-plywood", plywoodSurface, {
		size: 512,
		seed: 41515,
		tileMetres: 1.2,
		reliefMetres: .006
	});
	const corrugated = forgeSurface("test1-corrugated", corrugatedSurface, {
		size: 512,
		seed: 41788,
		tileMetres: 2.4,
		reliefMetres: .022
	});
	const sandbag = forgeSurface("test1-sandbag", sandbagSurface, {
		size: 512,
		seed: 42061,
		tileMetres: 1.6,
		reliefMetres: .06
	});
	const cinder = forgeSurface("test1-cinder", cinderSurface, {
		size: 512,
		seed: 42334,
		tileMetres: 1.6,
		reliefMetres: .014
	});
	const tarp = forgeSurface("test1-tarp", tarpSurface, {
		size: 512,
		seed: 42607,
		tileMetres: 2,
		reliefMetres: .01
	});
	const container = (color, name) => forgedMaterial(corrugated, name, {
		color,
		metalness: 0,
		normalScale: 1.1,
		metresPerTile: 2.4
	});
	return Object.freeze({
		hardpan: forgedMaterial(hardpan, "test1-hardpan", {
			roughness: .99,
			normalScale: .85,
			metresPerTile: 4
		}),
		road: forgedMaterial(hardpan, "test1-road", {
			color: 12826011,
			roughness: .97,
			normalScale: 1.1,
			metresPerTile: 5
		}),
		plywood: forgedMaterial(plywood, "test1-plywood", {
			roughness: .9,
			metresPerTile: 1.2
		}),
		plywoodDark: forgedMaterial(plywood, "test1-plywood-dark", {
			color: 12623985,
			roughness: .93,
			metresPerTile: 1.2
		}),
		sandbag: forgedMaterial(sandbag, "test1-sandbag", {
			roughness: .99,
			normalScale: 1.05,
			metresPerTile: 1.6
		}),
		containerRed: container(14252642, "test1-container-red"),
		containerBlue: container(7315396, "test1-container-blue"),
		containerGreen: container(8367724, "test1-container-green"),
		steel: forgedMaterial(corrugated, "test1-steel", {
			color: 14147298,
			metalness: .08,
			normalScale: .4,
			metresPerTile: 3.6
		}),
		cinder: forgedMaterial(cinder, "test1-cinder", {
			roughness: .95,
			normalScale: 1.15,
			metresPerTile: 1.6
		}),
		tarp: forgedMaterial(tarp, "test1-tarp", {
			roughness: .96,
			side: 2,
			metresPerTile: 2
		})
	});
}
function test2Materials() {
	const travertine = forgeSurface("test2-travertine", travertineSurface, {
		size: 512,
		seed: 45338,
		tileMetres: 2.4,
		reliefMetres: .009,
		anisotropy: 8
	});
	const stucco = forgeSurface("test2-stucco", stuccoSurface, {
		size: 512,
		seed: 45611,
		tileMetres: 2.4,
		reliefMetres: .005
	});
	const hedge = forgeSurface("test2-hedge", hedgeSurface, {
		size: 512,
		seed: 45884,
		tileMetres: 1,
		reliefMetres: .03
	});
	const poolTile = forgeSurface("test2-pool-tile", poolTileSurface, {
		size: 512,
		seed: 46157,
		tileMetres: 1.2,
		reliefMetres: .004
	});
	const court = forgeSurface("test2-court", courtSurface, {
		size: 512,
		seed: 46430,
		tileMetres: 3,
		reliefMetres: .003
	});
	const timber = forgeSurface("test2-timber", timberSurface, {
		size: 512,
		seed: 46703,
		tileMetres: 1.6,
		reliefMetres: .007
	});
	return Object.freeze({
		travertine: forgedMaterial(travertine, "test2-travertine", {
			roughness: .86,
			normalScale: .9,
			metresPerTile: 2.4
		}),
		stucco: forgedMaterial(stucco, "test2-stucco", {
			roughness: .9,
			normalScale: .9,
			metresPerTile: 3
		}),
		stone: forgedMaterial(travertine, "test2-stone", {
			color: 13028052,
			roughness: .88,
			normalScale: 1.1,
			metresPerTile: .8
		}),
		hedge: forgedMaterial(hedge, "test2-hedge", {
			roughness: .97,
			normalScale: 1.4,
			metresPerTile: 1
		}),
		poolTile: forgedMaterial(poolTile, "test2-pool-tile", {
			roughness: .3,
			metalness: .05,
			normalScale: .7,
			metresPerTile: 1.2
		}),
		court: forgedMaterial(court, "test2-court", {
			roughness: .72,
			normalScale: .8,
			metresPerTile: 3
		}),
		timber: forgedMaterial(timber, "test2-timber", {
			roughness: .8,
			normalScale: 1.1,
			metresPerTile: 1.6
		})
	});
}
function presentationMesh(mesh, castShadow = true) {
	mesh.castShadow = castShadow;
	mesh.receiveShadow = true;
	mesh.userData.presentationOnly = true;
	mesh.userData.blocksShots = false;
	mesh.raycast = () => void 0;
	return mesh;
}
function addBox(root, name, position, size, material, rotationY = 0, castShadow = true) {
	const mesh = new Mesh(new BoxGeometry(...size), material);
	mesh.name = name;
	mesh.position.set(...position);
	mesh.rotation.y = rotationY;
	worldTiled(mesh, size);
	root.add(presentationMesh(mesh, castShadow));
	return mesh;
}
function addCylinder(root, name, position, radiusTop, radiusBottom, height, material, segments = 10) {
	const mesh = new Mesh(new CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
	mesh.name = name;
	mesh.position.set(...position);
	root.add(presentationMesh(mesh));
	return mesh;
}
/**
* Builds the kit's `allow` predicate from planting bands plus keep-out rects.
*
* THE RULE THIS ENCODES: no vegetation stands in a fighting area unless it is
* too short to hide anyone. Vegetation is presentation-only — a round crosses
* it without a scratch — so a canopy that blocks SIGHT while blocking no shots
* is the worst object a map can contain, and the extraction doc's clearance
* contract exists exactly to keep it out. Everything the player can actually
* hide behind on these maps is an authored, collided, shot-rated mass in
* src/test-maps.ts (hedge blocks, planters, berms, containers); the kit
* supplies the density AROUND the fight.
*
* Bands are declared PER KIND, because the answer differs by height: a 0.5 m
* dry-scrub tuft sits below the crouched eye-line and is welcome along a
* verge, while a 1.1 m shrub or a 5 m cypress is not, and lives beyond the
* fence or wall. Keep-outs are inflated by the plant's canopy radius at its
* final scale, so an overhang is rejected as well as a trunk.
*/
function clearancePredicate(bandsByKind, keepOuts) {
	return (x, z, radiusM, kind) => {
		let inBand = false;
		for (const [minX, maxX, minZ, maxZ] of bandsByKind[kind]) if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
			inBand = true;
			break;
		}
		if (!inBand) return false;
		for (const [minX, maxX, minZ, maxZ] of keepOuts) if (x >= minX - radiusM && x <= maxX + radiusM && z >= minZ - radiusM && z <= maxZ + radiusM) return false;
		return true;
	};
}
/** No planting of this kind anywhere. Keeps the per-kind band table total. */
var NO_BAND = Object.freeze([]);
/** Mirror a keep-out rect across z = 0 (the Test1 fairness involution). */
function mirroredZ(rect) {
	return [
		rect[0],
		rect[1],
		-rect[3],
		-rect[2]
	];
}
/**
* Vegetation and backdrop for Test1, plus the small props.
*
* Every keep-out below is authored as a `[minX, maxX, minZ, maxZ]` rect and
* mirrored through z = 0, which is the involution that swaps the two teams on
* this map (see the symmetry note at the top of src/test-maps.ts).
*/
function applyTest1Dressing(root, materials) {
	const rng = mulberry32(517489);
	const dressing = new Group();
	dressing.name = "test1-dressing";
	dressing.userData.presentationOnly = true;
	root.add(dressing);
	const steelDark = new MeshStandardMaterial({
		color: 6121067,
		roughness: .6,
		metalness: .12
	});
	const drumOlive = new MeshStandardMaterial({
		color: 7175248,
		roughness: .7,
		metalness: 0
	});
	const drumRust = new MeshStandardMaterial({
		color: 9788472,
		roughness: .8,
		metalness: 0
	});
	const rubber = new MeshStandardMaterial({
		color: 3551788,
		roughness: .95,
		metalness: 0
	});
	const flagRed = new MeshStandardMaterial({
		color: 12729388,
		roughness: .85,
		metalness: 0,
		side: 2
	});
	const paintWhite = new MeshStandardMaterial({
		color: 15130831,
		roughness: .85,
		metalness: 0
	});
	const paintYellow = new MeshStandardMaterial({
		color: 14201404,
		roughness: .88,
		metalness: 0
	});
	const bermMaterial = materials.road;
	for (const [bx, bz, bw, bd] of [
		[
			0,
			-30,
			74,
			8
		],
		[
			0,
			30,
			74,
			8
		],
		[
			-37,
			0,
			8,
			60
		],
		[
			37,
			0,
			8,
			60
		]
	]) addBox(dressing, "test1-berm-ring", [
		bx,
		1.3,
		bz
	], [
		bw,
		2.6,
		bd
	], bermMaterial, 0, false);
	const test1Verge = [
		[
			-31.4,
			-27.4,
			-22.4,
			22.4
		],
		[
			27.4,
			31.4,
			-22.4,
			22.4
		],
		[
			-31.4,
			31.4,
			-22.4,
			-18.4
		],
		[
			-31.4,
			31.4,
			18.4,
			22.4
		]
	];
	const test1KeepOutHalf = [
		[
			-6.5,
			6.5,
			-22.6,
			-17
		],
		[
			-27.5,
			-15.5,
			-22.6,
			-15.5
		],
		[
			15.5,
			28.5,
			-20.5,
			-13.5
		],
		[
			-32,
			32,
			-21.6,
			-17.4
		]
	];
	const test1KeepOuts = [...test1KeepOutHalf, ...test1KeepOutHalf.map(mirroredZ)];
	buildEnvironment(dressing, {
		name: "test1-verge",
		vegetation: {
			seed: 8279825,
			namePrefix: "test1-foliage-verge",
			area: {
				minX: -31.4,
				maxX: 31.4,
				minZ: -22.4,
				maxZ: 22.4
			},
			palette: {
				dryScrub: 10324824,
				litter: 10259040
			},
			layers: [{
				kind: "dry-scrub",
				count: 220,
				spacings: [1.05]
			}],
			allow: clearancePredicate({
				"dry-scrub": test1Verge,
				shrub: NO_BAND,
				conifer: NO_BAND,
				broadleaf: NO_BAND
			}, test1KeepOuts),
			lod: { nearBandM: 26 }
		}
	});
	const test1Treeline = [
		[
			-52,
			-42,
			-48,
			48
		],
		[
			42,
			52,
			-48,
			48
		],
		[
			-52,
			52,
			-48,
			-35
		],
		[
			-52,
			52,
			35,
			48
		]
	];
	const environment = buildEnvironment(dressing, {
		name: "test1-treeline",
		vegetation: {
			seed: 8279827,
			namePrefix: "test1-foliage-treeline",
			area: {
				minX: -52,
				maxX: 52,
				minZ: -48,
				maxZ: 48
			},
			palette: {
				dryScrub: 10324824,
				shrub: 7304259,
				trunk: 6968633,
				coniferCanopy: 4215599,
				litter: 10259040
			},
			layers: [
				{
					kind: "conifer",
					count: 34,
					spacings: [6.5],
					scaleRange: [.7, 1.1]
				},
				{
					kind: "shrub",
					count: 90,
					spacings: [3.2, 2.4]
				},
				{
					kind: "dry-scrub",
					count: 220,
					spacings: [
						2.2,
						1.4,
						1.3
					]
				}
			],
			allow: clearancePredicate({
				conifer: test1Treeline,
				shrub: test1Treeline,
				"dry-scrub": test1Treeline,
				broadleaf: NO_BAND
			}, []),
			lod: { nearBandM: 34 }
		},
		ridge: {
			seed: 8279826,
			arenaClearRadiusM: 42,
			innerRadiusM: 66,
			outerRadiusM: 172,
			peakHeightM: 30,
			lobes: [
				3,
				7,
				13
			],
			nearColor: 9338718,
			farColor: 10984056,
			hazeColor: 13489885,
			hazeStrength: .7,
			name: "test1-ridge-ring"
		}
	});
	for (let post = -7; post <= 7; post += 1) {
		addBox(dressing, "test1-fence-post-n", [
			post * 4.2,
			1.5,
			-22.9
		], [
			.22,
			3,
			.22
		], materials.plywoodDark);
		addBox(dressing, "test1-fence-post-s", [
			post * 4.2,
			1.5,
			22.9
		], [
			.22,
			3,
			.22
		], materials.plywoodDark);
	}
	for (let post = -5; post <= 5; post += 1) {
		addBox(dressing, "test1-fence-post-w", [
			-31.9,
			1.5,
			post * 4.2
		], [
			.22,
			3,
			.22
		], materials.plywoodDark);
		addBox(dressing, "test1-fence-post-e", [
			31.9,
			1.5,
			post * 4.2
		], [
			.22,
			3,
			.22
		], materials.plywoodDark);
	}
	for (const railZ of [-22.85, 22.85]) addBox(dressing, "test1-fence-rail", [
		0,
		2.7,
		railZ
	], [
		64,
		.18,
		.14
	], materials.plywoodDark, 0, false);
	for (const railX of [-31.85, 31.85]) addBox(dressing, "test1-fence-rail-end", [
		railX,
		2.7,
		0
	], [
		.14,
		.18,
		46
	], materials.plywoodDark, 0, false);
	for (let lane = 0; lane < 7; lane += 1) {
		const laneZ = (lane - 3) * 5;
		addBox(dressing, "test1-lane-marker", [
			-15.5,
			.21,
			laneZ
		], [
			.06,
			.42,
			.6
		], paintWhite, 0, false);
		addBox(dressing, "test1-lane-number", [
			-15.46,
			.26,
			laneZ
		], [
			.03,
			.26,
			.34
		], paintYellow, 0, false);
	}
	for (const flagZ of [-19.5, 19.5]) {
		addCylinder(dressing, "test1-flag-pole", [
			-19.5,
			2.4,
			flagZ
		], .05, .07, 4.8, steelDark, 6);
		addBox(dressing, "test1-flag-cloth", [
			-19.1,
			4.4,
			flagZ + .45
		], [
			.9,
			.55,
			.03
		], flagRed);
	}
	for (const netZ of [-8, 8]) {
		const net = addBox(dressing, "test1-camo-net-tarp", [
			21,
			2.95,
			netZ
		], [
			9,
			.06,
			6.4
		], materials.tarp, 0, false);
		net.rotation.z = .035;
	}
	for (const [dx, dz] of [
		[-6.5, 6.5],
		[11.2, 5.5],
		[19.5, 7.8],
		[24.5, 0],
		[2.5, 13.5],
		[-19.5, 13.5]
	]) for (const end of [-1, 1]) addCylinder(dressing, "test1-drum", [
		dx,
		.425,
		end * dz
	], .4, .4, .85, rng() > .5 ? drumOlive : drumRust, 12);
	for (const [tx, tz] of [
		[-11.6, 6],
		[12.6, 4.6],
		[9.6, 15.5]
	]) for (const end of [-1, 1]) for (let tyre = 0; tyre < 3; tyre += 1) {
		const mesh = new Mesh(new TorusGeometry(.42, .16, 8, 14), rubber);
		mesh.name = "test1-tyre";
		mesh.position.set(tx + (rng() - .5) * .2, .18 + tyre * .34, end * tz + (rng() - .5) * .2);
		mesh.rotation.x = Math.PI / 2;
		dressing.add(presentationMesh(mesh));
	}
	for (const [cx, cz] of [
		[19.4, 17.2],
		[20.6, 16.3],
		[24.2, 17.4],
		[25.4, 16.4],
		[22, 18.4],
		[10.9, 1.6],
		[11.3, -1.8],
		[22.4, 7.4]
	]) for (const end of [-1, 1]) addBox(dressing, "test1-ammo-crate", [
		cx,
		.24,
		end * cz
	], [
		.9,
		.48,
		.55
	], materials.plywoodDark, rng() * Math.PI);
	for (const parkZ of [-1, 1]) for (let bay = 0; bay < 4; bay += 1) addBox(dressing, "test1-bay-stripe", [
		-26 + bay * 3.4,
		.04,
		parkZ * 18.5
	], [
		.16,
		.04,
		5.2
	], paintYellow, 0, false);
	for (const poleZ of [
		-16,
		-8,
		0,
		8,
		16
	]) {
		addCylinder(dressing, "test1-power-pole", [
			31.2,
			2.8,
			poleZ
		], .09, .12, 5.6, materials.plywoodDark, 7);
		addBox(dressing, "test1-power-cross", [
			31.2,
			5.1,
			poleZ
		], [
			1.4,
			.09,
			.09
		], materials.plywoodDark);
	}
	addCylinder(dressing, "test1-control-mast", [
		1.6,
		5.4,
		0
	], .06, .09, 5.4, steelDark, 6);
	addBox(dressing, "test1-control-speaker", [
		1.6,
		7.6,
		.34
	], [
		.34,
		.34,
		.3
	], steelDark, 0, false);
	for (const [gx, gz, gw, gd] of [
		[
			0,
			0,
			20.4,
			8.4
		],
		[
			-13.8,
			0,
			6.4,
			34
		],
		[
			-29.5,
			0,
			4,
			42
		],
		[
			0,
			-20,
			10.6,
			4.8
		],
		[
			0,
			20,
			10.6,
			4.8
		],
		[
			22,
			-16.7,
			11.4,
			5.6
		],
		[
			22,
			16.7,
			11.4,
			5.6
		]
	]) addBox(dressing, "test1-contact-grime", [
		gx,
		.11,
		gz
	], [
		gw + .6,
		.22,
		gd + .6
	], bermMaterial, 0, false);
	return environment;
}
/**
* Vegetation, backdrop and props for Test2.
*
* Every keep-out is authored once and rotated 180 degrees through the origin,
* which is Test2's fairness involution: it maps team 0's half onto team 1's
* and Domination zone A onto zone C.
*/
function applyTest2Dressing(root, materials) {
	const rng = mulberry32(517490);
	const dressing = new Group();
	dressing.name = "test2-dressing";
	dressing.userData.presentationOnly = true;
	root.add(dressing);
	const chrome = new MeshStandardMaterial({
		color: 14278370,
		roughness: .16,
		metalness: .85
	});
	const canvasCream = new MeshStandardMaterial({
		color: 15722194,
		roughness: .9,
		metalness: 0,
		side: 2
	});
	const gravel = new MeshStandardMaterial({
		color: 9410212,
		roughness: 1,
		metalness: 0
	});
	const courtLine = new MeshStandardMaterial({
		color: 15789282,
		roughness: .7,
		metalness: 0
	});
	const glassBlue = new MeshStandardMaterial({
		color: 10471640,
		roughness: .08,
		metalness: .1,
		transparent: true,
		opacity: .35
	});
	const hillside = materials.stucco.clone();
	hillside.name = "test2-hillside";
	hillside.color.setHex(9215084);
	hillside.roughness = 1;
	hillside.userData.metresPerTile = 5;
	addBox(dressing, "test2-hillside-terrain", [
		0,
		-2.4,
		0
	], [
		190,
		1.6,
		176
	], hillside, 0, false);
	const estatePalette = {
		trunk: 7034428,
		broadleafCanopy: 5213242,
		coniferCanopy: 2576943,
		shrub: 4027444,
		dryScrub: 9411166,
		litter: 10721920
	};
	const test2Hillside = [
		[
			-80,
			-58,
			-72,
			72
		],
		[
			58,
			80,
			-72,
			72
		],
		[
			-80,
			80,
			-72,
			-48
		],
		[
			-80,
			80,
			48,
			72
		]
	];
	const environment = buildEnvironment(dressing, {
		name: "test2-hillside",
		vegetation: {
			seed: 8279843,
			namePrefix: "test2-foliage-hillside",
			area: {
				minX: -80,
				maxX: 80,
				minZ: -72,
				maxZ: 72
			},
			palette: estatePalette,
			layers: [
				{
					kind: "broadleaf",
					count: 48,
					spacings: [7.5]
				},
				{
					kind: "conifer",
					count: 44,
					spacings: [6, 5.4]
				},
				{
					kind: "shrub",
					count: 130,
					spacings: [
						3.4,
						2.8,
						2.4
					]
				},
				{
					kind: "dry-scrub",
					count: 210,
					spacings: [
						2.2,
						1.8,
						1.4,
						1.3
					]
				}
			],
			allow: clearancePredicate({
				broadleaf: test2Hillside,
				conifer: test2Hillside,
				shrub: test2Hillside,
				"dry-scrub": test2Hillside
			}, []),
			lod: { nearBandM: 52 }
		},
		ridge: {
			seed: 8279842,
			arenaClearRadiusM: 66,
			innerRadiusM: 94,
			outerRadiusM: 212,
			peakHeightM: 34,
			lobes: [
				2,
				5,
				11
			],
			nearColor: 7635034,
			farColor: 9673333,
			hazeColor: 14468301,
			hazeStrength: .74,
			name: "test2-ridge-ring"
		}
	});
	for (const [ux, uz] of [
		[-4, -32.5],
		[10, -32.5],
		[-4, -27.5],
		[10, -27.5]
	]) {
		addCylinder(dressing, "test2-umbrella-pole", [
			ux,
			1.36,
			uz
		], .05, .05, 2.72, chrome, 8);
		const canopy = new Mesh(new ConeGeometry(1.9, .8, 10), canvasCream);
		canopy.name = "test2-umbrella-canopy";
		canopy.position.set(ux, 3.1, uz);
		dressing.add(presentationMesh(canopy));
	}
	for (const ladderX of [-6.4, 12.4]) {
		addCylinder(dressing, "test2-pool-ladder-a", [
			ladderX,
			.35,
			-25.9
		], .04, .04, 1.3, chrome, 6);
		addCylinder(dressing, "test2-pool-ladder-b", [
			ladderX + .6,
			.35,
			-25.9
		], .04, .04, 1.3, chrome, 6);
	}
	addBox(dressing, "test2-towel-stack", [
		-9,
		.62,
		-23.4
	], [
		.6,
		.4,
		.5
	], canvasCream, .3, false);
	for (let lounger = 0; lounger < 5; lounger += 1) addBox(dressing, "test2-lounger", [
		-6 + lounger * 4.4 + rng() * .4,
		.3,
		-23.8
	], [
		.8,
		.4,
		2
	], materials.timber, .05 - rng() * .1, true);
	const courtY = -.34;
	const courtX = -28;
	const courtZ = -27;
	for (const edge of [-1, 1]) {
		addBox(dressing, "test2-court-line-side", [
			courtX + edge * 8.4,
			courtY,
			courtZ
		], [
			.08,
			.03,
			11.4
		], courtLine, 0, false);
		addBox(dressing, "test2-court-line-end", [
			courtX,
			courtY,
			courtZ + edge * 5.7
		], [
			17,
			.03,
			.08
		], courtLine, 0, false);
		addBox(dressing, "test2-court-line-key", [
			courtX + edge * 6.6,
			courtY,
			courtZ
		], [
			3.2,
			.03,
			4.4
		], courtLine, 0, false);
	}
	addBox(dressing, "test2-court-line-centre", [
		courtX,
		courtY,
		courtZ
	], [
		.08,
		.03,
		11.4
	], courtLine, 0, false);
	const centreCircle = new Mesh(new TorusGeometry(1.8, .04, 6, 36), courtLine);
	centreCircle.name = "test2-court-line-circle";
	centreCircle.position.set(courtX, courtY, courtZ);
	centreCircle.rotation.x = Math.PI / 2;
	dressing.add(presentationMesh(centreCircle, false));
	for (const hoopEnd of [-1, 1]) {
		const hx = courtX + hoopEnd * 8;
		addCylinder(dressing, "test2-hoop-pole", [
			hx,
			1.7,
			courtZ
		], .09, .11, 4, chrome, 8);
		addBox(dressing, "test2-hoop-board", [
			hx - hoopEnd * .5,
			3.35,
			courtZ
		], [
			.08,
			1,
			1.6
		], glassBlue, 0, false);
		const ring = new Mesh(new TorusGeometry(.28, .03, 6, 14), new MeshStandardMaterial({
			color: 13918764,
			roughness: .5,
			metalness: .5
		}));
		ring.name = "test2-hoop-ring";
		ring.position.set(hx - hoopEnd * .85, 3.05, courtZ);
		ring.rotation.x = Math.PI / 2;
		dressing.add(presentationMesh(ring, false));
	}
	addBox(dressing, "test2-drive-gravel-ring", [
		2,
		.31,
		24
	], [
		26,
		.04,
		15
	], gravel, 0, false);
	for (const [bx, bz] of [
		[-1.5, 23],
		[5.5, 23],
		[-1.5, 27],
		[5.5, 27]
	]) addBox(dressing, "test2-drive-bed", [
		bx,
		.33,
		bz
	], [
		3,
		.06,
		2.6
	], gravel, 0, false);
	for (const urnZ of [23.4, 26.6]) {
		addCylinder(dressing, "test2-urn", [
			2,
			.72,
			urnZ
		], .4, .3, .84, materials.stone, 9);
		const urnShrub = new Mesh(new IcosahedronGeometry(.45, 1), materials.hedge);
		urnShrub.name = "test2-urn-shrub";
		urnShrub.position.set(2, 1.4, urnZ);
		dressing.add(presentationMesh(urnShrub));
	}
	for (const bayX of [
		-22,
		-18.5,
		-8,
		-4.5,
		0,
		3.5,
		11.5,
		16,
		26
	]) addBox(dressing, "test2-pilaster", [
		bayX,
		1.7,
		-19.75
	], [
		.9,
		3.4,
		.34
	], materials.stucco);
	for (const windowX of [
		-20.25,
		-6.25,
		1.75,
		13.75
	]) addBox(dressing, "test2-wing-window", [
		windowX,
		1.9,
		-19.75
	], [
		2.4,
		1.6,
		.3
	], glassBlue, 0, false);
	addBox(dressing, "test2-cornice", [
		2,
		3.55,
		-19.9
	], [
		52,
		.4,
		.7
	], materials.stone, 0, false);
	for (const pierZ of [
		-10.5,
		-6.5,
		-2,
		2,
		6.5,
		10.5
	]) addBox(dressing, "test2-garage-lintel", [
		36.35,
		3.7,
		pierZ
	], [
		.5,
		.5,
		3.4
	], materials.stone, 0, false);
	for (const [gx, gz, gw, gd] of [
		[
			2,
			-13,
			52,
			14
		],
		[
			22,
			-26,
			12,
			12
		],
		[
			-17.5,
			10.5,
			25,
			11
		],
		[
			22,
			8,
			20,
			8
		],
		[
			43,
			-1,
			14,
			24
		],
		[
			-14.75,
			-29,
			6.5,
			6
		],
		[
			-26,
			22,
			8,
			8
		],
		[
			-34,
			-13,
			8,
			8
		],
		[
			28,
			14,
			8,
			4
		]
	]) addBox(dressing, "test2-contact-grime", [
		gx,
		.05,
		gz
	], [
		gw + .6,
		.1,
		gd + .6
	], gravel, 0, false);
	return environment;
}
//#endregion
//#region src/test-maps.ts
/**
* Test1 & Test2 (owner 2026-08-30) — see docs/TEST1_MAP_BRIEF.md and
* docs/TEST2_MAP_BRIEF.md. Original procedural art throughout; the briefs'
* archetypes inform layout beats only.
*
* FULL-COMPLEX PASS (owner: "test 1 and test 2 map are a good start but only a
* small portion of the map and style, we need a deeper recreation"). v1 built
* the central quarter of each brief and stopped. v2 builds the whole thing:
*
*   Test1  64 x 46 m (was 52 x 38). Approach road and vehicle park at each
*          end, a COVERED firing line with seven numbered lanes under a
*          corrugated roof, a range-control tower that reads as a building
*          (two annexes, a clerestory band, a walkable deck reached from BOTH
*          ends and opening onto both annex roofs), an ammunition/stores block
*          at each end, the container yard
*          with a real climb ladder onto a container roof, berms, and a fenced
*          perimeter with a posted rhythm.
*   Test2  100 x 76 m. REBUILT 2026-08-31 against
*          docs/TEST2_RAID_LAYOUT_SPEC_2026-08-31.md - see the Test2 section
*          below for what changed and why. The 76 x 58 estate this line used to
*          describe (motor courts, two villa wings, verandas, a central sunken
*          sport court, a sunken parterre, four diagonal outbuildings) is gone:
*          it was a rotationally symmetric walled slab, and the owner's report
*          was that it is "not the layout at all".
*
* Test1's extent still sits inside the shadow volume authored for it in
* src/graphics-refinement.ts (68 x 54). TEST2'S NO LONGER DOES: the old claim
* that "no table this pass does not own had to move" died with the rebuild, and
* the test2 shadow volume, fog near plane, killstreak flight radius and review
* cameras were all re-measured and re-pinned by the same pass (2026-08-31).
*
* THE FAIRNESS INVOLUTION
* -----------------------
* Every gameplay mass on each map is authored as a PAIR under the involution
* that swaps the two teams, so neither team owns a better half:
*
*   Test1 — teams separate along Z (team 0 at z < 0, team 1 at z > 0) and the
*     two lanes differ in kind by the brief (a firing line west, a container
*     yard east). The team-swapping involution is therefore the Z MIRROR
*     (x, z) -> (x, -z), and every structure below is either centred on z = 0
*     or authored as a +/-z pair. A literal 180-degree rotation would
*     additionally demand that the firing line EQUAL the container yard, which
*     the brief's own lane programme forbids; v1 claimed the rotation and had
*     neither (its five containers had no partners at all). The spawn sets are
*     symmetric in x, so they map onto each other under the mirror AND under
*     the rotation.
*   Test2 — teams separate along X, and as of the 2026-08-31 rebuild this
*     map's involution is the X MIRROR (x, z) -> (-x, z). It used to be the
*     180-degree rotation, and that was wrong on the evidence: the archetype's
*     measured objective anchors are A(-34.6, -0.1) and C(+33.1, -0.9), which
*     are x-mirrors of one another and NOT 180-degree images (a rotation would
*     put A's partner at (+34.6, +0.1)). Every other paired feature agrees -
*     the two service buildings flank the drive from the same side, both upper
*     balconies look INTO the drive, and the two flank lanes differ in kind (a
*     pool terrace and a motor circle), so neither rotates into the other.
*
*     This is the same argument the Test1 paragraph above already makes, on the
*     other axis. Under the mirror the fairness obligations are: every spawn
*     point maps to a spawn point of the other team; every lane mouth is the
*     same distance from each spawn; each team has exactly one elevated room
*     per flank lane; and A maps to C exactly while B sits on x = 0. Holding
*     the rotation instead would have demanded the pool lane EQUAL the drive
*     lane, which is precisely the demand that produced the old build's
*     pool-and-its-180-degree-partner-parterre and its uniform open terrace.
*
* THE COVER RULE (owner: cover breaks BOTH stances or is jump-mountable)
* ---------------------------------------------------------------------
* The measured jump apex on this controller is 0.82 m (arena-layout.ts:130).
* Every cover piece on both maps is therefore one of:
*   - a MOUNTABLE platform whose top is reachable in a rise of <= 0.75 m from
*     the surface beside it (0.7 / 1.45 / 2.15 / 2.6 is the container ladder);
*   - HARD cover at >= 1.9 m, which clears the 1.65 m standing eye-line.
* Nothing is authored in the 0.9-1.8 m dead band, where a piece hides a
* crouched player from nobody and cannot be climbed. v1 shipped six pieces in
* that band (1.25 m sandbag walls, 1.6 m berms, 1.5 m crates, 1.2 m drums);
* they are re-cut here, not re-labelled.
*/
var TEST1_BOUNDS = Object.freeze({
	minX: -32,
	maxX: 32,
	minZ: -23,
	maxZ: 23
});
/**
* 100 x 76 m (Pass 79 rebuild, 2026-08-31). Derived, not guessed - see
* docs/TEST2_RAID_LAYOUT_SPEC_2026-08-31.md section 1.3: the archetype's long
* axis measures 85-92 m off four independent architectural anchors, and this
* controller sprints at 8.7 m/s against the reference engine's derived
* 7.24 m/s, so a faithful metre-for-metre copy would be crossed 20% faster and
* would feel SMALLER than the map it copies. 85-92 x 1.20 = 102-110 m; 100 m is
* the conservative bottom of that band, and 100 / 76 = 1.316 reproduces the
* measured 1.311 aspect to within 0.4%.
*
* The old 76 x 58 = 4408 m2 was within 1% of Atomic Acres' 74 x 60 = 4440 m2 -
* the "big estate map" was the same size as the small street map, which is what
* the owner reported.
*/
var TEST2_BOUNDS = Object.freeze({
	minX: -50,
	maxX: 50,
	minZ: -38,
	maxZ: 38
});
/**
* Domination anchors for Test2 (A west end, B drive-lane mouth, C garage drive).
*
* B IS DELIBERATELY OFF-CENTRE at (0, +14) and must stay there. With A and C on
* the long axis at the two ends and B pulled into one flank, a team that owns B
* is committed to one side of the map, so the losing team's spawn stays anchored
* behind its own end instead of flipping through the middle. Moving B into the
* courtyard is the obvious "fix" and it would break spawn stability.
*/
var TEST2_DOMINATION_ZONES = Object.freeze([
	Object.freeze({
		id: "A",
		centre: Object.freeze([
			-34,
			0,
			-.5
		])
	}),
	Object.freeze({
		id: "B",
		centre: Object.freeze([
			0,
			0,
			14
		])
	}),
	Object.freeze({
		id: "C",
		centre: Object.freeze([
			34,
			0,
			-.5
		])
	})
]);
/**
* The traversal ladder, in metres of TOP height above the surface beside each
* piece. Consecutive rises are <= 0.75 m against a measured 0.82 m jump apex.
*/
var MOUNT_LOW = .7;
var MOUNT_MID = 1.45;
var MOUNT_HIGH = 2.15;
/** Clears the 1.65 m standing eye-line, so it breaks both stances. */
var HARD_COVER = 1.9;
/** ISO container: the yard's cover module and the top of the climb ladder. */
var CONTAINER_SIZE = [
	6,
	2.6,
	2.6
];
function makeBuilder(scene, name) {
	const root = new Group();
	root.name = name;
	scene.add(root);
	return {
		root,
		colliders: [],
		physicsColliders: [],
		raycastMeshes: [],
		shotSurfaces: [],
		ballisticSurfaceSequence: 0
	};
}
/**
* `box` plus world-space UV scaling.
*
* A BoxGeometry face is 0..1 in UV whatever it measures, so one texture repeat
* can only ever be right for one mesh size. Both maps now share six forged
* surfaces across ~20 material uses and dozens of mesh sizes, so scale is
* carried per MESH (see `worldTiled` in test-maps-art.ts) and every authored
* block goes through here. Nothing else about `box` changes: solidity, shot
* registration and the collider bounds are still its business alone.
*/
function block(builder, name, position, size, material, options = {}) {
	return worldTiled(box(builder, name, position, size, material, options), size);
}
function perimeter(builder, name, bounds, height, material) {
	const width = bounds.maxX - bounds.minX;
	const depth = bounds.maxZ - bounds.minZ;
	block(builder, `${name} north`, [
		0,
		height / 2,
		bounds.minZ - .4
	], [
		width + 2,
		height,
		.8
	], material);
	block(builder, `${name} south`, [
		0,
		height / 2,
		bounds.maxZ + .4
	], [
		width + 2,
		height,
		.8
	], material);
	block(builder, `${name} west`, [
		bounds.minX - .4,
		height / 2,
		0
	], [
		.8,
		height,
		depth + 2
	], material);
	block(builder, `${name} east`, [
		bounds.maxX + .4,
		height / 2,
		0
	], [
		.8,
		height,
		depth + 2
	], material);
}
function buildTest1(scene) {
	const builder = makeBuilder(scene, "Test1 arena");
	const materials = test1Materials();
	const { hardpan, road, plywood, plywoodDark, sandbag, steel, cinder } = materials;
	const rangeGlass = new MeshStandardMaterial({
		color: 12111060,
		roughness: .08,
		metalness: .1,
		transparent: true,
		opacity: .42
	});
	block(builder, "test1 hardpan", [
		0,
		-.5,
		0
	], [
		150,
		1,
		130
	], hardpan, { cast: false });
	perimeter(builder, "test1 fence", TEST1_BOUNDS, 3, plywoodDark);
	for (const end of [-1, 1]) block(builder, `test1 tower sill ${end}`, [
		0,
		HARD_COVER / 2,
		end * 4.05
	], [
		8.4,
		HARD_COVER,
		.35
	], cinder);
	for (const side of [-1, 1]) for (const end of [-1, 1]) block(builder, `test1 tower wall ${side} ${end}`, [
		side * 4.05,
		1.35,
		end * 2.65
	], [
		.35,
		2.7,
		3.1
	], cinder);
	block(builder, "test1 tower deck", [
		0,
		2.82,
		0
	], [
		9.2,
		.16,
		9.2
	], steel);
	for (const end of [-1, 1]) {
		block(builder, `test1 tower parapet ${end} west`, [
			-3.05,
			3.4,
			end * 4.45
		], [
			3.1,
			1,
			.3
		], cinder);
		block(builder, `test1 tower parapet ${end} east`, [
			3.05,
			3.4,
			end * 4.45
		], [
			3.1,
			1,
			.3
		], cinder);
	}
	for (const side of [-1, 1]) {
		for (const end of [-1, 1]) block(builder, `test1 tower parapet side ${side} ${end}`, [
			side * 4.45,
			3.4,
			end * 3.05
		], [
			.3,
			1,
			3.1
		], cinder);
		block(builder, `test1 tower glazing ${side}`, [
			side * 4.45,
			4.35,
			0
		], [
			.12,
			.9,
			9.2
		], rangeGlass, {
			solid: false,
			shots: true
		});
	}
	for (const end of [-1, 1]) for (let step = 0; step < 4; step += 1) {
		const top = 2.9 * (step + 1) / 4;
		block(builder, `test1 tower stair ${end} ${step}`, [
			0,
			top / 2,
			end * (5.15 + (3 - step) * 1.1)
		], [
			1.8,
			top,
			1.1
		], steel);
	}
	for (const side of [-1, 1]) {
		const cx = side * 7.2;
		for (const end of [-1, 1]) {
			block(builder, `test1 annex outer ${side} ${end}`, [
				side * 10.05,
				1.2,
				end * 2.25
			], [
				.35,
				2.4,
				2.9
			], cinder);
			block(builder, `test1 annex flank ${side} ${end}`, [
				cx,
				1.2,
				end * 3.45
			], [
				6,
				2.4,
				.35
			], cinder);
		}
		block(builder, `test1 annex roof ${side}`, [
			cx,
			2.52,
			0
		], [
			6.3,
			.24,
			7.5
		], steel);
	}
	block(builder, "test1 firing line roof", [
		-13.8,
		3.32,
		0
	], [
		6.4,
		.28,
		34
	], steel);
	for (const columnX of [-16.7, -10.9]) for (const columnZ of [
		-15,
		-9,
		-3,
		3,
		9,
		15
	]) block(builder, `test1 firing column ${columnX} ${columnZ}`, [
		columnX,
		1.59,
		columnZ
	], [
		.32,
		3.18,
		.32
	], steel);
	for (const laneZ of [
		-15,
		-10,
		-5,
		0,
		5,
		10,
		15
	]) block(builder, `test1 firing kerb ${laneZ}`, [
		-17.6,
		MOUNT_LOW / 2,
		laneZ
	], [
		.9,
		MOUNT_LOW,
		4.2
	], sandbag);
	for (const end of [-1, 1]) block(builder, `test1 lane traverse ${end}`, [
		-14.8,
		HARD_COVER / 2,
		end * 11.5
	], [
		5.6,
		HARD_COVER,
		.9
	], sandbag);
	for (const targetZ of [
		-15,
		-10,
		-5,
		0,
		5,
		10,
		15
	]) {
		block(builder, `test1 target post ${targetZ}`, [
			-25.5,
			.9,
			targetZ
		], [
			.14,
			1.8,
			.14
		], plywoodDark, {
			solid: false,
			shots: true
		});
		block(builder, `test1 target silhouette ${targetZ}`, [
			-25.5,
			1.95,
			targetZ
		], [
			.9,
			1.1,
			.06
		], plywood, {
			solid: false,
			shots: true
		});
	}
	block(builder, "test1 backstop berm", [
		-29.75,
		1.3,
		0
	], [
		4.5,
		2.6,
		44
	], road);
	const containerPairs = [
		[
			"test1 container a",
			15,
			7.5,
			0,
			materials.containerRed
		],
		[
			"test1 container b",
			22,
			3,
			Math.PI / 16,
			materials.containerBlue
		],
		[
			"test1 container c",
			27.5,
			11,
			0,
			materials.containerGreen
		],
		[
			"test1 container d",
			13,
			15,
			-Math.PI / 18,
			materials.containerGreen
		]
	];
	for (const [name, x, z, yaw, material] of containerPairs) for (const end of [-1, 1]) block(builder, `${name} ${end}`, [
		x,
		1.3,
		end * z
	], [...CONTAINER_SIZE], material, yaw ? { rotation: [
		0,
		end * yaw,
		0
	] } : {});
	block(builder, "test1 container e", [
		28.5,
		1.3,
		0
	], [...CONTAINER_SIZE], materials.containerBlue, { rotation: [
		0,
		Math.PI / 2,
		0
	] });
	for (const end of [-1, 1]) block(builder, `test1 container stack ${end}`, [
		27.5,
		3.9,
		end * 11
	], [...CONTAINER_SIZE], materials.containerRed);
	for (const end of [-1, 1]) {
		block(builder, `test1 yard pallet step ${end}`, [
			15,
			MOUNT_LOW / 2,
			end * 11.9
		], [
			2.2,
			MOUNT_LOW,
			1.6
		], plywood);
		block(builder, `test1 yard crate ${end}`, [
			15,
			MOUNT_MID / 2,
			end * 10.2
		], [
			2.2,
			MOUNT_MID,
			1.4
		], plywood);
		block(builder, `test1 yard barrier ${end}`, [
			15,
			MOUNT_HIGH / 2,
			end * 9.1
		], [
			2.2,
			MOUNT_HIGH,
			.6
		], cinder);
	}
	for (const end of [-1, 1]) for (const side of [-1, 1]) {
		block(builder, `test1 mid crate low ${side} ${end}`, [
			side * 8,
			MOUNT_LOW / 2,
			end * 12
		], [
			1.8,
			MOUNT_LOW,
			1.8
		], plywood);
		block(builder, `test1 mid crate high ${side} ${end}`, [
			side * 8,
			HARD_COVER / 2,
			end * 13.9
		], [
			1.8,
			HARD_COVER,
			1.8
		], plywood);
		block(builder, `test1 concrete block ${side} ${end}`, [
			side * 7.5,
			HARD_COVER / 2,
			end * 7.5
		], [
			2.4,
			HARD_COVER,
			1.2
		], cinder);
	}
	for (const end of [-1, 1]) {
		block(builder, `test1 spawn shed rear ${end}`, [
			0,
			1.5,
			end * 22
		], [
			10,
			3,
			.35
		], plywoodDark);
		for (const side of [-1, 1]) block(builder, `test1 spawn shed side ${side} ${end}`, [
			side * 4.8,
			1.5,
			end * 20
		], [
			.35,
			3,
			4.4
		], plywoodDark);
		block(builder, `test1 spawn shed roof ${end}`, [
			0,
			3.15,
			end * 20
		], [
			10.6,
			.3,
			4.8
		], steel);
		for (const side of [-1, 1]) block(builder, `test1 end berm ${side} ${end}`, [
			side * 11,
			HARD_COVER / 2,
			end * 18.5
		], [
			7,
			HARD_COVER,
			2.2
		], road);
		block(builder, `test1 approach road ${end}`, [
			-21.5,
			.03,
			end * 20.6
		], [
			10,
			.06,
			5
		], road, {
			solid: false,
			shots: false,
			cast: false
		});
		block(builder, `test1 vehicle park apron ${end}`, [
			-21.5,
			.03,
			end * 16.5
		], [
			13,
			.06,
			4
		], road, {
			solid: false,
			shots: false,
			cast: false
		});
		for (const barrierX of [
			-25.5,
			-21.5,
			-17.5
		]) block(builder, `test1 jersey barrier ${barrierX} ${end}`, [
			barrierX,
			MOUNT_LOW / 2,
			end * 18.5
		], [
			3.2,
			MOUNT_LOW,
			.7
		], cinder);
		block(builder, `test1 stores rear ${end}`, [
			22,
			1.6,
			end * 19.1
		], [
			11,
			3.2,
			.35
		], cinder);
		for (const side of [-1, 1]) {
			block(builder, `test1 stores side ${side} ${end}`, [
				22 + side * 5.3,
				1.6,
				end * 16.7
			], [
				.35,
				3.2,
				5.2
			], cinder);
			block(builder, `test1 stores front ${side} ${end}`, [
				22 + side * 3.4,
				1.6,
				end * 14.25
			], [
				3.2,
				3.2,
				.35
			], cinder);
		}
		block(builder, `test1 stores roof ${end}`, [
			22,
			3.35,
			end * 16.7
		], [
			11.4,
			.3,
			5.6
		], steel);
	}
	applyTest1Dressing(builder.root, materials);
	batchPresentationOnlyBoxes(builder.root, "test1-presentation");
	return {
		id: "test1",
		label: "Test1",
		root: builder.root,
		colliders: builder.colliders,
		physicsColliders: builder.physicsColliders,
		raycastMeshes: builder.raycastMeshes,
		shotSurfaces: builder.shotSurfaces,
		spawns: spawnRecord([
			[-20, -20.8],
			[-11.5, -20.8],
			[-2.6, -20],
			[2.6, -20],
			[11.5, -20.8],
			[20, -20.8]
		], [
			[20, 20.8],
			[11.5, 20.8],
			[2.6, 20],
			[-2.6, 20],
			[-11.5, 20.8],
			[-20, 20.8]
		]),
		patrolPoints: [
			[-19, -14],
			[-19, 0],
			[-19, 14],
			[-24, -6],
			[-24, 6],
			[0, -12],
			[0, 12],
			[19.5, -11],
			[19.5, 11],
			[24, 0],
			[-8, -21],
			[8, 21]
		].map(([x, z]) => new Vector3(x, 0, z)),
		targets: [],
		houses: [],
		breakableWindows: [],
		physicalCover: [],
		bounds: { ...TEST1_BOUNDS },
		houseTelemetry: emptyTelemetry()
	};
}
/**
* The playable BLOB, read off the spec's 2 m/cell top-down diagram (section 6)
* row by row: `[minZ, maxZ, minX, maxX]`, z ascending, each row's x extent the
* diagram's own contiguous span.
*
* This table is the map's outline. The paving is authored inside it, the
* boundary is generated around it, and the ~26% of the 100 x 76 bounding box it
* leaves out is where the arena's corners, dead ends and cover-by-architecture
* come from. The old build filled ~100% of its rectangle, which is exactly why
* it played as one open field.
*/
var TEST2_BLOB = [
	[
		-38,
		-36,
		-28,
		34
	],
	[
		-36,
		-34,
		-40,
		28
	],
	[
		-34,
		-20,
		-40,
		32
	],
	[
		-20,
		-14,
		-40,
		42
	],
	[
		-14,
		-10,
		-42,
		50
	],
	[
		-10,
		4,
		-50,
		50
	],
	[
		4,
		10,
		-42,
		50
	],
	[
		10,
		16,
		-38,
		42
	],
	[
		16,
		24,
		-34,
		26
	],
	[
		24,
		30,
		-30,
		22
	],
	[
		30,
		36,
		-22,
		16
	],
	[
		36,
		38,
		-10,
		10
	]
];
/**
* Paving: the blob minus the two sunken cutouts (sport court -0.35, pool basin
* -0.55). Authored as the COMPLEMENT rather than one slab with holes - the
* technique the first art pass had to learn when a one-piece slab buried the
* water sheet. `[name, minX, maxX, minZ, maxZ]`.
*/
var TEST2_PAVING = [
	[
		"north tip",
		-28,
		34,
		-38,
		-36
	],
	[
		"pool head",
		-40,
		28,
		-36,
		-35
	],
	[
		"pool head west",
		-40,
		-10,
		-35,
		-34
	],
	[
		"pool head east",
		16,
		28,
		-35,
		-34
	],
	[
		"court head west",
		-40,
		-10,
		-34,
		-33
	],
	[
		"court head east",
		16,
		32,
		-34,
		-33
	],
	[
		"court flank west",
		-40,
		-37,
		-33,
		-25
	],
	[
		"court walk",
		-19,
		-10,
		-33,
		-25
	],
	[
		"pool flank east",
		16,
		32,
		-33,
		-25
	],
	[
		"court flank south",
		-40,
		-37,
		-25,
		-21
	],
	[
		"pool deck",
		-19,
		32,
		-25,
		-21
	],
	[
		"lane sill",
		-40,
		32,
		-21,
		-20
	],
	[
		"house north band",
		-40,
		42,
		-20,
		-14
	],
	[
		"approach band",
		-42,
		50,
		-14,
		-10
	],
	[
		"long axis",
		-50,
		50,
		-10,
		4
	],
	[
		"drive north band",
		-42,
		50,
		4,
		10
	],
	[
		"drive mid band",
		-38,
		42,
		10,
		16
	],
	[
		"drive band",
		-34,
		26,
		16,
		24
	],
	[
		"drive circle",
		-30,
		22,
		24,
		30
	],
	[
		"drive approach",
		-22,
		16,
		30,
		36
	],
	[
		"drive tip",
		-10,
		10,
		36,
		38
	]
];
/** First-floor height. Four rooms sit here and nothing else is standable above it. */
var UPPER_FLOOR_Y = 3.4;
var UPPER_SOFFIT = UPPER_FLOOR_Y - .24;
/**
* The canonical stair module, built once and reused four times. 9 risers of
* 0.3778 m and 0.45 m treads: EVERY riser is under the 0.42 m autostep
* (CHARACTER_PHYSICS_CONFIG), so the player walks up with no jump and no
* timing, and 0.45 m clears the 0.22 m autostep minimum width with margin.
* Rise 3.40 m over a 4.05 m run is a 40 degree pitch, inside the 50 degree
* slope-climb limit, so a smooth-ramp fallback stays available.
*/
var STAIR_RISERS = 9;
var STAIR_TREAD = .45;
var STAIR_RUN = STAIR_RISERS * STAIR_TREAD;
/** Roof parapet top. Set so no upper room can see across the map into a second lane. */
var PARAPET_TOP = 4.8;
function buildTest2(scene) {
	const builder = makeBuilder(scene, "Test2 arena");
	const materials = test2Materials();
	const { travertine, stucco, stone, hedge, poolTile, court, timber } = materials;
	const poolWater = new MeshStandardMaterial({
		color: 3054768,
		roughness: .12,
		metalness: .05,
		transparent: true,
		opacity: .82
	});
	const glass = new MeshStandardMaterial({
		color: 12572894,
		roughness: .1,
		metalness: .1,
		transparent: true,
		opacity: .4
	});
	/**
	* Axis-aligned rectangular prism from corner to corner. Every mass in this
	* arena is authored as an EXTENT, not a centre and a size: the spec is a
	* table of extents, walls have to meet exactly, and a stairwell hole has to
	* line up with a stair tread to the centimetre. Centre/size arithmetic done
	* by hand is where the old build's 0.5 m seams came from.
	*/
	const rect = (name, x0, x1, y0, y1, z0, z1, material, options = {}) => block(builder, name, [
		(x0 + x1) / 2,
		(y0 + y1) / 2,
		(z0 + z1) / 2
	], [
		x1 - x0,
		y1 - y0,
		z1 - z0
	], material, options);
	/**
	* One canonical stair run inside the given footprint, climbing to
	* UPPER_FLOOR_Y along `direction`. The run must be exactly STAIR_RUN long on
	* the climbing axis; the caller sizes the stairwell hole to match so the top
	* riser lands flush against the floor slab it serves.
	*/
	const stairRun = (name, x0, x1, z0, z1, direction, material) => {
		for (let step = 0; step < STAIR_RISERS; step += 1) {
			const top = UPPER_FLOOR_Y * (step + 1) / STAIR_RISERS;
			const near = step * STAIR_TREAD;
			const far = (step + 1) * STAIR_TREAD;
			if (direction === "x+") rect(`${name} riser ${step}`, x0 + near, x0 + far, 0, top, z0, z1, material);
			else if (direction === "x-") rect(`${name} riser ${step}`, x1 - far, x1 - near, 0, top, z0, z1, material);
			else if (direction === "z+") rect(`${name} riser ${step}`, x0, x1, 0, top, z0 + near, z0 + far, material);
			else rect(`${name} riser ${step}`, x0, x1, 0, top, z1 - far, z1 - near, material);
		}
	};
	for (const [name, x0, x1, z0, z1] of TEST2_PAVING) rect(`test2 paving ${name}`, x0, x1, -1, 0, z0, z1, travertine, { cast: false });
	const boundaryHeight = (z0) => z0 >= 24 ? 1.9 : 3.4;
	const BOUNDARY_FOOT = -2;
	{
		const runs = (edge) => {
			let index = 0;
			while (index < TEST2_BLOB.length) {
				const value = edge === "min" ? TEST2_BLOB[index][2] : TEST2_BLOB[index][3];
				let end = index;
				while (end + 1 < TEST2_BLOB.length && (edge === "min" ? TEST2_BLOB[end + 1][2] : TEST2_BLOB[end + 1][3]) === value) end += 1;
				const z0 = TEST2_BLOB[index][0];
				const z1 = TEST2_BLOB[end][1];
				const height = boundaryHeight(z0);
				if (edge === "min") rect(`test2 boundary west ${index}`, value - .8, value, BOUNDARY_FOOT, height, z0, z1, stucco);
				else rect(`test2 boundary east ${index}`, value, value + .8, BOUNDARY_FOOT, height, z0, z1, stucco);
				index = end + 1;
			}
		};
		runs("min");
		runs("max");
		for (let index = 0; index + 1 < TEST2_BLOB.length; index += 1) {
			const [, z, minA, maxA] = TEST2_BLOB[index];
			const [, , minB, maxB] = TEST2_BLOB[index + 1];
			const height = boundaryHeight(z);
			if (minA !== minB) rect(`test2 boundary jog west ${index}`, Math.min(minA, minB) - .8, Math.max(minA, minB), BOUNDARY_FOOT, height, z - .8, z, stucco);
			if (maxA !== maxB) rect(`test2 boundary jog east ${index}`, Math.min(maxA, maxB), Math.max(maxA, maxB) + .8, BOUNDARY_FOOT, height, z - .8, z, stucco);
		}
		rect("test2 boundary cap north", -28.8, 34.8, BOUNDARY_FOOT, 3.4, -38.8, -38, stucco);
		rect("test2 boundary cap south", -10.8, 10.8, BOUNDARY_FOOT, 1.9, 38, 38.8, stucco);
	}
	rect("test2 court floor", -37, -19, -1.35, -.35, -33, -21, court, { cast: false });
	rect("test2 court kerb north", -36, -30, -.35, .35, -32.6, -32, stone);
	rect("test2 court kerb south", -26, -20, -.35, .35, -22, -21.4, stone);
	rect("test2 court equipment box", -36.4, -34.4, -.35, 1.55, -24.5, -22.5, stucco);
	rect("test2 court store base", -22.4, -19, 0, .7, -25.4, -21, stone);
	rect("test2 court store body", -22.4, -19, .7, 3, -25.4, -21, stucco);
	rect("test2 court store roof", -22.7, -18.7, 3, 3.3, -25.7, -20.7, travertine);
	rect("test2 pavilion wall north", -18, -11.5, 0, 3.4, -32, -31.6, stucco);
	rect("test2 pavilion wall west", -18, -17.6, 0, 3.4, -32, -26, stucco);
	rect("test2 pavilion wall east", -11.9, -11.5, 0, 3.4, -32, -26, stucco);
	rect("test2 pavilion wall south west", -18, -16, 0, 3.4, -26.4, -26, stucco);
	rect("test2 pavilion wall south east", -14, -11.5, 0, 3.4, -26.4, -26, stucco);
	rect("test2 pavilion roof", -18.3, -11.2, 3.4, 3.7, -32.3, -25.7, travertine);
	rect("test2 pavilion bar", -17, -13, 0, 1.9, -31, -30.4, stone);
	rect("test2 pool basin floor", -10, 16, -1.55, -.55, -35, -25, poolTile, { cast: false });
	rect("test2 pool basin wall north", -10, 16, -.55, 0, -35, -34.7, poolTile);
	rect("test2 pool basin wall south", -10, 16, -.55, 0, -25.3, -25, poolTile);
	rect("test2 pool basin wall west", -10, -9.7, -.55, 0, -35, -25, poolTile);
	rect("test2 pool basin wall east", 15.7, 16, -.55, 0, -35, -25, poolTile);
	rect("test2 pool step sw low", -9, -6.8, -1.55, -.28, -26.8, -26, poolTile);
	rect("test2 pool step sw high", -9, -6.8, -1.55, 0, -26, -25.2, poolTile);
	rect("test2 pool step ne high", 10, 12.2, -1.55, 0, -34.4, -33.6, poolTile);
	rect("test2 pool step ne low", 10, 12.2, -1.55, -.28, -33.6, -32.8, poolTile);
	rect("test2 pool coping south", -10.6, 16.6, 0, .3, -25, -24.4, stone);
	rect("test2 pool coping west", -10.6, -10, 0, .3, -35, -25, stone);
	rect("test2 pool coping east", 16, 16.6, 0, .3, -35, -25, stone);
	rect("test2 pool water sheet", -9.8, 15.8, -.4, -.35, -34.8, -25.2, poolWater, {
		solid: false,
		shots: false,
		cast: false
	});
	rect("test2 deck planter run", -8, 14, 0, .7, -22.9, -22.1, stone);
	rect("test2 deck cabana pier west", -3.3, -2.7, 0, 1.9, -24.6, -24, stucco);
	rect("test2 deck cabana pier east", 7.7, 8.3, 0, 1.9, -24.6, -24, stucco);
	rect("test2 ledge east flank", 28.4, 31.6, 0, .7, -33.6, -20.4, stone);
	rect("test2 ledge north rim", -10.6, 28.4, 0, .7, -35.6, -35, stone);
	rect("test2 wing wall north", 16, 28, 0, UPPER_SOFFIT, -32, -31.6, stucco);
	rect("test2 wing wall east", 27.6, 28, 0, UPPER_SOFFIT, -32, -20, stucco);
	rect("test2 wing wall west", 16, 16.4, 0, UPPER_SOFFIT, -32, -26, stucco);
	rect("test2 wing wall south west", 16, 20, 0, UPPER_SOFFIT, -26.4, -26, stucco);
	rect("test2 wing wall south east", 22.4, 28, 0, UPPER_SOFFIT, -26.4, -26, stucco);
	rect("test2 wing room divider", 22, 22.4, 0, UPPER_SOFFIT, -31.6, -28.6, stucco);
	rect("test2 wing counter", 17, 20, 0, 1.9, -30, -29.4, stone);
	rect("test2 wing glazing north", 17.5, 21, .7, 2.6, -31.9, -31.7, glass, {
		solid: false,
		shots: true
	});
	for (const pierX of [
		17.5,
		22,
		26.5
	]) for (const pierZ of [-25.2, -21.2]) rect(`test2 walk pier ${pierX} ${pierZ}`, pierX - .3, pierX + .3, 0, UPPER_SOFFIT, pierZ - .3, pierZ + .3, stucco);
	rect("test2 wing floor landing", 22.05, 28, UPPER_SOFFIT, UPPER_FLOOR_Y, -32, -29.5, travertine);
	rect("test2 wing floor main", 16, 28, UPPER_SOFFIT, UPPER_FLOOR_Y, -29.5, -20, travertine);
	stairRun("test2 wing stair", 18, 22.05, -31.8, -30, "x+", stone);
	rect("test2 wing upper wall north", 16, 28, UPPER_FLOOR_Y, 5.3, -32, -31.6, stucco);
	rect("test2 wing upper wall east", 27.6, 28, UPPER_FLOOR_Y, 5.3, -32, -20, stucco);
	rect("test2 wing balcony rail west", 16, 16.4, UPPER_FLOOR_Y, 4.45, -29.5, -20, stone);
	rect("test2 wing balcony rail south", 16, 28, UPPER_FLOOR_Y, 4.45, -20.4, -20, stone);
	rect("test2 wing stairwell rail", 16, 22.05, UPPER_FLOOR_Y, 4.45, -29.9, -29.5, stone);
	for (const [x0, x1] of [
		[-24, -14],
		[-11.5, 6],
		[8.5, 20],
		[24, 28]
	]) rect(`test2 house north wall ${x0}`, x0, x1, 0, 3.4, -20, -19.6, stucco);
	rect("test2 house office sill", 20, 24, 0, .7, -20, -19.6, stone);
	rect("test2 house office lintel", 20, 24, 2.7, 3.4, -20, -19.6, stucco);
	rect("test2 house office step low", 20, 24, 0, .35, -21.3, -20.7, stone);
	rect("test2 house office step high", 20, 24, 0, .7, -20.7, -20, stone);
	for (const [x0, x1] of [
		[-24, -20],
		[-17, -2],
		[4, 16],
		[19, 28]
	]) rect(`test2 house south wall ${x0}`, x0, x1, 0, 3.4, -6.4, -6, stucco);
	rect("test2 house wall west", -24, -23.6, 0, 3.4, -20, -6, stucco);
	rect("test2 house wall east", 27.6, 28, 0, 3.4, -20, -6, stucco);
	rect("test2 house cross west a", -10.2, -9.8, 0, 3.4, -20, -14, stucco);
	rect("test2 house cross west b", -10.2, -9.8, 0, 3.4, -11.5, -6, stucco);
	rect("test2 house cross east a", 13.8, 14.2, 0, 3.4, -20, -18, stucco);
	rect("test2 house cross east b", 13.8, 14.2, 0, 3.4, -15.5, -6, stucco);
	rect("test2 house door screen west", -16, -10, 0, 3.4, -17.5, -17.1, stucco);
	rect("test2 house door screen east", 4, 10.5, 0, 3.4, -17.5, -17.1, stucco);
	rect("test2 house spine counter", -6, -2, 0, 1.9, -12.6, -12, stone);
	rect("test2 house office counter", 17, 21, 0, 1.9, -12, -11.4, stone);
	rect("test2 house upper floor landing", -15.95, -4, UPPER_SOFFIT, UPPER_FLOOR_Y, -19.6, -17.8, travertine);
	rect("test2 house upper floor main", -20, -4, UPPER_SOFFIT, UPPER_FLOOR_Y, -17.8, -12, travertine);
	stairRun("test2 house stair", -20, -15.95, -19.6, -17.8, "x+", stone);
	for (const [x0, x1] of [
		[-15.95, -13],
		[-11, -8],
		[-6, -4]
	]) rect(`test2 house upper north wall ${x0}`, x0, x1, UPPER_FLOOR_Y, 5.3, -19.6, -19.2, stucco);
	for (const [x0, x1] of [[-13, -11], [-8, -6]]) rect(`test2 house window slot ${x0}`, x0, x1, UPPER_FLOOR_Y, 4.45, -19.6, -19.2, stone);
	rect("test2 house upper wall west", -20, -19.6, UPPER_FLOOR_Y, 5.3, -17.8, -12, stucco);
	rect("test2 house upper wall south", -20, -4, UPPER_FLOOR_Y, 5.3, -12.4, -12, stucco);
	rect("test2 house upper wall east", -4.4, -4, UPPER_FLOOR_Y, 5.3, -19.6, -12, stucco);
	rect("test2 house stairwell rail", -20, -15.95, UPPER_FLOOR_Y, 4.45, -17.8, -17.4, stone);
	rect("test2 house roof west", -24, -20, 3.4, 3.7, -20, -6, travertine);
	rect("test2 house roof south", -20, -4, 3.4, 3.7, -12, -6, travertine);
	rect("test2 house roof east", -4, 28, 3.4, 3.7, -20, -6, travertine);
	rect("test2 house parapet west", -24, -23.6, 3.7, PARAPET_TOP, -20, -6, stone);
	rect("test2 house parapet east", 27.6, 28, 3.7, PARAPET_TOP, -20, -6, stone);
	rect("test2 house parapet south", -24, 28, 3.7, PARAPET_TOP, -6.4, -6, stone);
	rect("test2 house parapet north west", -24, -20, 3.7, PARAPET_TOP, -20, -19.6, stone);
	rect("test2 house parapet north east", -4, 28, 3.7, PARAPET_TOP, -20, -19.6, stone);
	rect("test2 living wall west", -24, -23.6, 0, 3.4, -3, 4, stucco);
	for (const [x0, x1] of [[-24, -18], [-14, -8]]) rect(`test2 living wall south ${x0}`, x0, x1, 0, 3.4, 3.6, 4, stucco);
	rect("test2 living window sill", -18, -14, 0, .7, 3.6, 4, stone);
	rect("test2 living window lintel", -18, -14, 1.9, 3.4, 3.6, 4, stucco);
	rect("test2 living glazing south", -23, -19, .7, 2.6, 3.75, 3.85, glass, {
		solid: false,
		shots: true
	});
	rect("test2 living sofa run", -22, -18, 0, .7, -1.4, -.6, timber);
	rect("test2 living chimney breast", -14.6, -12.6, 0, 1.9, -3, 1, stone);
	rect("test2 living roof", -24, -7, 3.4, 3.7, -6, 4, travertine);
	rect("test2 living parapet west", -24, -23.6, 3.7, PARAPET_TOP, -6, 4, stone);
	rect("test2 living parapet south", -24, -7, 3.7, PARAPET_TOP, 3.6, 4, stone);
	for (const [z0, z1] of [[-6, -2], [2, 4]]) {
		rect(`test2 courtyard wall west ${z0}`, -7, -6.6, 0, PARAPET_TOP, z0, z1, stucco);
		rect(`test2 courtyard wall east ${z0}`, 10, 10.4, 0, PARAPET_TOP, z0, z1, stucco);
	}
	for (const [x0, x1] of [[-6.6, -2], [4, 10]]) rect(`test2 courtyard wall south ${x0}`, x0, x1, 0, PARAPET_TOP, 4, 4.4, stucco);
	for (const pierX of [-2.5, 6.5]) for (const pierZ of [-3.5, 1.5]) rect(`test2 courtyard pier ${pierX} ${pierZ}`, pierX - .35, pierX + .35, 0, 3.4, pierZ - .35, pierZ + .35, stone);
	rect("test2 courtyard fountain kerb", .1, 3.3, 0, .7, -2.4, .4, stone);
	rect("test2 kitchen wall east", 27.6, 28, 0, 3.4, -6, 4, stucco);
	for (const [x0, x1] of [[10.4, 21], [24, 28]]) rect(`test2 kitchen wall south ${x0}`, x0, x1, 0, 3.4, 3.6, 4, stucco);
	for (const [z0, z1] of [[-6, 0], [2.5, 4]]) rect(`test2 kitchen divider ${z0}`, 19, 19.4, 0, 3.4, z0, z1, stucco);
	rect("test2 kitchen glazing south", 12.5, 18, .7, 2.6, 3.75, 3.85, glass, {
		solid: false,
		shots: true
	});
	rect("test2 kitchen counter run", 12, 16, 0, 1.9, -2, -1.2, stone);
	rect("test2 kitchen island", 21, 25, 0, .7, -1.4, -.2, stone);
	rect("test2 kitchen roof", 10.4, 28, 3.4, 3.7, -6, 4, travertine);
	rect("test2 kitchen parapet east", 27.6, 28, 3.7, PARAPET_TOP, -6, 4, stone);
	rect("test2 kitchen parapet south", 10.4, 28, 3.7, PARAPET_TOP, 3.6, 4, stone);
	for (const [x0, x1] of [
		[-30, -26],
		[-23.5, -12],
		[-9.5, -5]
	]) rect(`test2 laundry wall north ${x0}`, x0, x1, 0, 3.4, 5, 5.4, stucco);
	for (const [z0, z1] of [[5, 8], [10.5, 16]]) rect(`test2 laundry wall west ${z0}`, -30, -29.6, 0, 3.4, z0, z1, stucco);
	for (const [x0, x1] of [[-30, -18], [-15, -5]]) rect(`test2 laundry wall south ${x0}`, x0, x1, 0, 3.4, 15.6, 16, stucco);
	for (const [z0, z1] of [[5, 8], [11, 16]]) rect(`test2 laundry wall east ${z0}`, -5.4, -5, 0, 3.4, z0, z1, stucco);
	for (const [z0, z1] of [[5, 11], [13.5, 16]]) rect(`test2 laundry cross ${z0}`, -18, -17.6, 0, 3.4, z0, z1, stucco);
	rect("test2 laundry bench", -27, -23, 0, 1.9, 8, 8.6, stone);
	rect("test2 laundry floor west", -30, -10.5, UPPER_SOFFIT, UPPER_FLOOR_Y, 5, 16, travertine);
	rect("test2 laundry floor south", -10.5, -5, UPPER_SOFFIT, UPPER_FLOOR_Y, 5, 7.35, travertine);
	rect("test2 laundry floor north", -10.5, -5, UPPER_SOFFIT, UPPER_FLOOR_Y, 11.4, 16, travertine);
	stairRun("test2 laundry stair", -9.6, -7.8, 11.4 - STAIR_RUN, 11.4, "z-", stone);
	rect("test2 laundry upper wall north", -30, -5, UPPER_FLOOR_Y, 5.3, 5, 5.4, stucco);
	rect("test2 laundry upper wall west", -30, -29.6, UPPER_FLOOR_Y, 5.3, 5, 16, stucco);
	rect("test2 laundry upper wall east a", -5.4, -5, UPPER_FLOOR_Y, 5.3, 5, 7.35, stucco);
	rect("test2 laundry upper wall east b", -5.4, -5, UPPER_FLOOR_Y, 5.3, 11.4, 16, stucco);
	rect("test2 laundry balcony rail", -30, -5, UPPER_FLOOR_Y, 4.45, 15.6, 16, stone);
	rect("test2 laundry stairwell rail west", -10.9, -10.5, UPPER_FLOOR_Y, 4.45, 7.35, 11.4, stone);
	rect("test2 laundry stairwell rail north", -10.5, -5, UPPER_FLOOR_Y, 4.45, 11.4, 11.8, stone);
	for (const [x0, x1] of [[12, 21], [24, 32]]) rect(`test2 gallery wall north ${x0}`, x0, x1, 0, 3.4, 4, 4.4, stucco);
	for (const [z0, z1] of [[4, 9.5]]) rect(`test2 gallery wall west ${z0}`, 12, 12.4, 0, 3.4, z0, z1, stucco);
	for (const [x0, x1] of [[12, 20], [23, 32]]) rect(`test2 gallery wall south ${x0}`, x0, x1, 0, 3.4, 11.6, 12, stucco);
	rect("test2 gallery wall east", 31.6, 32, 0, 3.4, 4, 12, stucco);
	rect("test2 gallery glazing north", 14, 19.5, .7, 2.6, 4.15, 4.25, glass, {
		solid: false,
		shots: true
	});
	rect("test2 gallery sculpture", 20, 22, 0, 1.9, 7, 9, stone);
	rect("test2 gallery service north", 24, 32, 0, 3.4, 12, 12.4, stucco);
	rect("test2 gallery service east", 31.6, 32, 0, 3.4, 12, 16, stucco);
	rect("test2 gallery service south", 24, 32, 0, 3.4, 15.6, 16, stucco);
	rect("test2 gallery service west", 24, 24.4, 0, 3.4, 12, 16, stucco);
	rect("test2 gallery service roof", 23.7, 32.3, 3.4, 3.7, 11.7, 16.3, travertine);
	rect("test2 gallery floor east", 17.5, 32, UPPER_SOFFIT, UPPER_FLOOR_Y, 4, 12, travertine);
	rect("test2 gallery floor north", 12, 17.5, UPPER_SOFFIT, UPPER_FLOOR_Y, 4, 4.6, travertine);
	rect("test2 gallery floor south", 12, 17.5, UPPER_SOFFIT, UPPER_FLOOR_Y, 9.45, 12, travertine);
	stairRun("test2 gallery stair", 13.5, 15.3, 5.4, 9.45, "z+", stone);
	rect("test2 gallery upper wall north", 12, 32, UPPER_FLOOR_Y, 5.3, 4, 4.4, stucco);
	rect("test2 gallery upper wall east", 31.6, 32, UPPER_FLOOR_Y, 5.3, 4, 12, stucco);
	rect("test2 gallery upper wall west a", 12, 12.4, UPPER_FLOOR_Y, 5.3, 4, 4.6, stucco);
	rect("test2 gallery upper wall west b", 12, 12.4, UPPER_FLOOR_Y, 5.3, 9.45, 12, stucco);
	rect("test2 gallery balcony rail", 12, 32, UPPER_FLOOR_Y, 4.45, 11.6, 12, stone);
	rect("test2 gallery stairwell rail east", 17.5, 17.9, UPPER_FLOOR_Y, 4.45, 4.6, 9.45, stone);
	rect("test2 gallery stairwell rail north", 12, 17.5, UPPER_FLOOR_Y, 4.45, 4.2, 4.6, stone);
	rect("test2 drive island kerb", -4, 8, -.3, .3, 21, 29, stone, { cast: false });
	for (const [px, pz] of [
		[-3, 22],
		[2, 21.6],
		[7, 22],
		[-3, 28],
		[2, 28.4],
		[7, 28]
	]) rect(`test2 drive planter ${px} ${pz}`, px - .8, px + .8, .3, 2.2, pz - .8, pz + .8, hedge);
	rect("test2 drive fountain plinth", .5, 3.5, .3, 2.2, 24, 26, stone);
	rect("test2 carport wall north", -30, -22, 0, 3.4, 18, 18.4, stucco);
	rect("test2 carport wall west", -30, -29.6, 0, 3.4, 18, 26, stucco);
	rect("test2 carport wall south", -30, -22, 0, 3.4, 25.6, 26, stucco);
	rect("test2 carport pier east", -22.4, -22, 0, 3.4, 18, 21, stucco);
	rect("test2 carport pier east b", -22.4, -22, 0, 3.4, 23, 26, stucco);
	rect("test2 carport roof", -30.3, -21.7, 3.4, 3.7, 17.7, 26.3, travertine);
	for (const [px, pz] of [[16.5, 18.5], [19.5, 18.5]]) rect(`test2 drive verge ${px}`, px - 1.5, px + 1.5, 0, 1.9, pz - 1.5, pz + 1.5, hedge);
	rect("test2 drive approach kerb west", -14, -6, 0, .7, 32, 32.8, stone);
	rect("test2 drive approach kerb east", 4, 12, 0, .7, 32, 32.8, stone);
	rect("test2 apron garden wall north", -44, -40.5, 0, .7, -7.4, -6.8, stone);
	rect("test2 apron garden wall south", -44, -40.5, 0, .7, 1.4, 2, stone);
	rect("test2 apron planter run", -40.4, -39.6, 0, .7, -6, 1, hedge);
	rect("test2 store wall north", -38, -30, 0, 3.4, -17, -16.6, stucco);
	rect("test2 store wall south", -38, -30, 0, 3.4, -9.4, -9, stucco);
	rect("test2 store wall west", -38, -37.6, 0, 3.4, -17, -9, stucco);
	rect("test2 store wall east a", -30.4, -30, 0, 3.4, -17, -14, stucco);
	rect("test2 store wall east b", -30.4, -30, 0, 3.4, -11.5, -9, stucco);
	rect("test2 store roof", -38.3, -29.7, 3.4, 3.7, -17.3, -8.7, travertine);
	rect("test2 store rack", -36, -33, 0, 1.9, -14, -13.4, stone);
	rect("test2 garage wall north", 36, 50, 0, 4, -13.4, -13, stucco);
	rect("test2 garage wall south", 36, 50, 0, 4, 11, 11.4, stucco);
	rect("test2 garage wall east", 49.6, 50, 0, 4, -13, 11, stucco);
	rect("test2 garage roof", 35.6, 50, 4, 4.3, -13.4, 11.4, travertine);
	for (const pierZ of [
		-12,
		-8,
		-4,
		0,
		4,
		8
	]) rect(`test2 garage pier ${pierZ}`, 36, 36.6, 0, 4, pierZ - .35, pierZ + .35, stucco);
	rect("test2 garage kerb", 37.4, 38.2, 0, .7, -12, 10, stone);
	rect("test2 garage bench", 44, 48, 0, 1.9, 9.4, 10, stone);
	for (const zone of TEST2_DOMINATION_ZONES) {
		const [zoneX, , zoneZ] = zone.centre;
		block(builder, `test2 zone plinth ${zone.id}`, [
			zoneX,
			.12,
			zoneZ
		], [
			1.6,
			.24,
			1.6
		], stone);
		block(builder, `test2-zone-flag-pole-${zone.id}`, [
			zoneX,
			2.1,
			zoneZ
		], [
			.12,
			4,
			.12
		], standard(9147548, .5, .7), {
			solid: false,
			shots: false
		});
		block(builder, `test2-zone-flag-banner-${zone.id}`, [
			zoneX + .65,
			3.55,
			zoneZ
		], [
			1.3,
			.8,
			.06
		], standard(13421772, .85, .02), {
			solid: false,
			shots: false
		});
	}
	applyTest2Dressing(builder.root, materials);
	batchPresentationOnlyBoxes(builder.root, "test2-presentation");
	return {
		id: "test2",
		label: "Test2",
		root: builder.root,
		colliders: builder.colliders,
		physicsColliders: builder.physicsColliders,
		raycastMeshes: builder.raycastMeshes,
		shotSurfaces: builder.shotSurfaces,
		spawns: spawnRecord([
			[-47, -8],
			[-47, -2],
			[-47, 2],
			[-45, -5],
			[-45, 0],
			[-43, -7]
		], [
			[47, -8],
			[47, -2],
			[47, 2],
			[45, -5],
			[45, 0],
			[43, -7]
		]),
		patrolPoints: [
			[
				-44,
				0,
				-3
			],
			[
				-30,
				0,
				-26
			],
			[
				0,
				0,
				-23
			],
			[
				24,
				0,
				-22
			],
			[
				2,
				0,
				-1
			],
			[
				-16,
				0,
				-1
			],
			[
				22,
				0,
				-1
			],
			[
				2,
				0,
				24
			],
			[
				44,
				0,
				0
			],
			[
				-16,
				0,
				12
			],
			[
				22,
				UPPER_FLOOR_Y,
				-25
			],
			[
				-12,
				UPPER_FLOOR_Y,
				-15
			],
			[
				-16,
				UPPER_FLOOR_Y,
				11
			],
			[
				24,
				UPPER_FLOOR_Y,
				8
			]
		].map(([x, y, z]) => new Vector3(x, y, z)),
		targets: [],
		houses: [],
		breakableWindows: [],
		physicalCover: [],
		bounds: { ...TEST2_BOUNDS },
		houseTelemetry: emptyTelemetry(),
		physicsSafetyFloorY: -1.2
	};
}
//#endregion
export { buildTest1 as n, buildTest2 as r, TEST2_DOMINATION_ZONES as t };
