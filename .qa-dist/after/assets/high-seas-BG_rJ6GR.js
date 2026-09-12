import { Ba as Box3, Cu as RGBAFormat, Fc as LinearMipmapLinearFilter, Fs as Group, Ga as BufferGeometry, Ha as BoxGeometry, If as Vector3, Ld as SphereGeometry, Po as CylinderGeometry, Ro as DataTexture, Sd as SRGBColorSpace, Wa as BufferAttribute, Xc as MathUtils, _d as RingGeometry, _s as Float32BufferAttribute, io as Color, jc as LinearFilter, md as RepeatWrapping, tl as Mesh, to as CircleGeometry, tu as PlaneGeometry, ul as MeshStandardMaterial } from "./vendor-three-aHPbjK02.js";
import { c as createBallisticSurface, n as classifyImpactSurface } from "./combat-feedback-BhVh1Qvu.js";
//#region src/high-seas.ts
var HIGH_SEAS_LEVELS = Object.freeze({
	engine: 0,
	mainDeck: 3.2,
	upperDeck: 6.2,
	roof: 8.92,
	ocean: -2.2
});
var HIGH_SEAS_BOUNDS = Object.freeze({
	minX: -12,
	maxX: 12,
	minZ: -44,
	maxZ: 44
});
var HIGH_SEAS_ENGINE_ACCESS = Object.freeze({
	width: 2.6,
	run: 4.1,
	rise: HIGH_SEAS_LEVELS.mainDeck,
	bowFoot: [
		0,
		HIGH_SEAS_LEVELS.engine,
		-20.15
	],
	bowTop: [
		0,
		HIGH_SEAS_LEVELS.mainDeck,
		-24.25
	],
	sternFoot: [
		0,
		HIGH_SEAS_LEVELS.engine,
		20.15
	],
	sternTop: [
		0,
		HIGH_SEAS_LEVELS.mainDeck,
		24.25
	]
});
var DECK_THICKNESS = .28;
var CABIN_HALF_WIDTH = 7.4;
var CABIN_GROUND_WALL_HEIGHT = 2.68;
var CABIN_UPPER_WALL_HEIGHT = 2.6;
var RAMP_THICKNESS = .18;
var TEXTURE_CACHE = /* @__PURE__ */ new Map();
function hash2D(x, y, seed = 0) {
	let h = x * 374761393 + y * 668265263 + seed * 15485863 | 0;
	h = Math.imul(h ^ h >>> 13, 1274126177);
	return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function smoothNoise2D(x, y, seed = 0) {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = x - ix;
	const fy = y - iy;
	const sx = fx * fx * (3 - 2 * fx);
	const sy = fy * fy * (3 - 2 * fy);
	const n00 = hash2D(ix, iy, seed);
	const n10 = hash2D(ix + 1, iy, seed);
	const n01 = hash2D(ix, iy + 1, seed);
	const n11 = hash2D(ix + 1, iy + 1, seed);
	const a = n00 + sx * (n10 - n00);
	return a + sy * (n01 + sx * (n11 - n01) - a);
}
function fbm2D(x, y, octaves = 3, seed = 0) {
	let value = 0;
	let amp = .5;
	let freq = 1;
	let total = 0;
	for (let i = 0; i < octaves; i += 1) {
		value += amp * smoothNoise2D(x * freq, y * freq, seed + i * 31);
		total += amp;
		freq *= 2;
		amp *= .5;
	}
	return value / total;
}
function createDataTexture(name, width, height, data, colorSpace = SRGBColorSpace, repeat = [1, 1]) {
	const cacheKey = `${name}:${width}x${height}:${colorSpace}:${repeat[0]}x${repeat[1]}`;
	const existing = TEXTURE_CACHE.get(cacheKey);
	if (existing) return existing;
	const texture = new DataTexture(data, width, height, RGBAFormat);
	texture.name = `high-seas-tex-${name}`;
	texture.colorSpace = colorSpace;
	texture.wrapS = RepeatWrapping;
	texture.wrapT = RepeatWrapping;
	texture.repeat.set(repeat[0], repeat[1]);
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	TEXTURE_CACHE.set(cacheKey, texture);
	return texture;
}
function normalsFromHeights(width, height, heights, strength = 3) {
	const data = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		const yPrev = (y - 1 + height) % height;
		const yNext = (y + 1) % height;
		for (let x = 0; x < width; x += 1) {
			const xPrev = (x - 1 + width) % width;
			const xNext = (x + 1) % width;
			const hL = heights[y * width + xPrev];
			const hR = heights[y * width + xNext];
			const hD = heights[yPrev * width + x];
			const hU = heights[yNext * width + x];
			const dx = (hR - hL) * strength;
			const dy = (hU - hD) * strength;
			const len = Math.hypot(dx, dy, 1);
			const nx = -dx / len;
			const ny = -dy / len;
			const nz = 1 / len;
			const offset = (y * width + x) * 4;
			data[offset] = MathUtils.clamp(Math.round((nx * .5 + .5) * 255), 0, 255);
			data[offset + 1] = MathUtils.clamp(Math.round((ny * .5 + .5) * 255), 0, 255);
			data[offset + 2] = MathUtils.clamp(Math.round((nz * .5 + .5) * 255), 0, 255);
			data[offset + 3] = 255;
		}
	}
	return data;
}
/**
* World size, in metres, that ONE tile of each family's texture covers.
*
* WHY THIS EXISTS. The first pass at these materials set a fixed `repeat` per
* family, which meant texel density scaled with the mesh: the same wall texture
* that read as 1-metre composite panels on a 20 m superstructure collapsed into
* a dense brick grid on a 2 m crate. Density has to be a property of the WORLD,
* not of the mesh, so it is expressed here in metres and applied through UVs.
*
* Values are chosen from the feature size baked into each generator: `wall`
* draws a 4x4 grid of panels per tile, so 4 m/tile yields 1 m panels; `deck`
* draws 8 planks per tile, so 1.1 m/tile yields ~14 cm planks.
*/
var HIGH_SEAS_TILE_METRES = Object.freeze({
	deck: 1.1,
	stair: .9,
	hull: 5,
	wall: 4,
	roof: 3,
	"teal-trim": 2,
	"engine-bulkhead": 3,
	"engine-grating": 1.2,
	"engine-machinery": 1.5,
	"engine-amber": 1,
	"engine-practical": .6,
	upholstery: .8,
	glass: 3,
	water: 4
});
/**
* Rewrites a geometry's UVs as a world-scale box projection.
*
* Each vertex is projected along its dominant normal axis and divided by the
* family's tile size, so one texture tile always covers the same number of
* metres no matter how large the mesh is. This is what makes a shared material
* viable: the material and its texture stay shared (one upload, one draw-call
* group), while density is carried per-vertex in the geometry.
*
* Runs once at build time, so it costs nothing per frame. Local coordinates are
* used deliberately - box geometry here is authored at true world size with no
* mesh scaling, and projecting locally keeps the grain aligned to the object
* rather than swimming when the object is rotated.
*/
function applyBoxProjectedUv(geometry, tileMetres) {
	const position = geometry.getAttribute("position");
	const normal = geometry.getAttribute("normal");
	if (!position || !normal) return;
	const inverse = 1 / Math.max(.05, tileMetres);
	const uv = new Float32Array(position.count * 2);
	for (let index = 0; index < position.count; index += 1) {
		const px = position.getX(index);
		const py = position.getY(index);
		const pz = position.getZ(index);
		const nx = Math.abs(normal.getX(index));
		const ny = Math.abs(normal.getY(index));
		const nz = Math.abs(normal.getZ(index));
		let u;
		let v;
		if (nx >= ny && nx >= nz) {
			u = pz;
			v = py;
		} else if (ny >= nx && ny >= nz) {
			u = px;
			v = pz;
		} else {
			u = px;
			v = py;
		}
		uv[index * 2] = u * inverse;
		uv[index * 2 + 1] = v * inverse;
	}
	geometry.setAttribute("uv", new BufferAttribute(uv, 2));
	geometry.getAttribute("uv").needsUpdate = true;
}
/** Tile size for whatever material a mesh was given, or null when untextured. */
function tileMetresForMaterial(meshMaterial) {
	const family = meshMaterial.userData?.textureFamily;
	if (!family) return null;
	return HIGH_SEAS_TILE_METRES[family] ?? null;
}
function generateMaterialTextureSet(family, baseColorHex) {
	const size = 256;
	const baseR = baseColorHex >> 16 & 255;
	const baseG = baseColorHex >> 8 & 255;
	const baseB = baseColorHex & 255;
	const albedoData = new Uint8Array(size * size * 4);
	const roughnessData = new Uint8Array(size * size * 4);
	const heightData = new Float32Array(size * size);
	let hasAlbedo = true;
	let normalStrength = 3;
	switch (family) {
		case "deck":
		case "stair":
			normalStrength = family === "deck" ? 2.2 : 3.2;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const plankIdx = Math.floor(x / 32);
				const px = x % 32;
				const isCaulk = px < 3;
				const plankTone = (hash2D(plankIdx, 0, family === "deck" ? 101 : 202) - .5) * .18;
				const grain = (Math.sin(y * .15 + Math.sin(x * .08) * 2.5) * .5 + .5) * .14 + (smoothNoise2D(x * .25, y * .05, 42) - .5) * .1;
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				if (isCaulk) {
					albedoData[offset] = 64;
					albedoData[offset + 1] = 56;
					albedoData[offset + 2] = 48;
					albedoData[offset + 3] = 255;
					roughnessData[offset] = 230;
					roughnessData[offset + 1] = 230;
					roughnessData[offset + 2] = 230;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .24;
				} else {
					const edgeDist = Math.min(px - 3, 31 - px);
					const bevel = Math.min(1, edgeDist / 2);
					const r = MathUtils.clamp(Math.round(baseR * (1 + plankTone + grain) * (.92 + .08 * bevel)), 0, 255);
					const g = MathUtils.clamp(Math.round(baseG * (1 + plankTone + grain) * (.92 + .08 * bevel)), 0, 255);
					const b = MathUtils.clamp(Math.round(baseB * (1 + plankTone + grain) * (.92 + .08 * bevel)), 0, 255);
					albedoData[offset] = r;
					albedoData[offset + 1] = g;
					albedoData[offset + 2] = b;
					albedoData[offset + 3] = 255;
					const rough = MathUtils.clamp(Math.round((.6 + (1 - bevel) * .15 + grain * .05) * 255), 0, 255);
					roughnessData[offset] = rough;
					roughnessData[offset + 1] = rough;
					roughnessData[offset + 2] = rough;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .7 + .25 * bevel + grain * .08;
				}
			}
			break;
		case "hull":
			normalStrength = 2.5;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const isSeam = y % 64 < 2;
				const micro = (smoothNoise2D(x * .2, y * .2, 7) - .5) * .04;
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				if (isSeam) {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * .85), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * .85), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * .85), 0, 255);
					albedoData[offset + 3] = 255;
					roughnessData[offset] = 115;
					roughnessData[offset + 1] = 115;
					roughnessData[offset + 2] = 115;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .25;
				} else {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * (1 + micro)), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * (1 + micro)), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * (1 + micro)), 0, 255);
					albedoData[offset + 3] = 255;
					const rough = MathUtils.clamp(Math.round((.24 + micro * .04) * 255), 0, 255);
					roughnessData[offset] = rough;
					roughnessData[offset + 1] = rough;
					roughnessData[offset + 2] = rough;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .85 + micro * .1;
				}
			}
			break;
		case "wall":
			normalStrength = 2.2;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const px = x % 128;
				const py = y % 64;
				const distX = Math.min(px, 128 - px);
				const distY = Math.min(py, 64 - py);
				const edgeDist = Math.min(distX, distY);
				const isSeam = edgeDist < 2;
				const bevel = edgeDist >= 2 ? Math.min(1, (edgeDist - 2) / 3) : 0;
				const surfaceNoise = (smoothNoise2D(x * .1, y * .1, 13) - .5) * .03;
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				if (isSeam) {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * .88), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * .88), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * .88), 0, 255);
					albedoData[offset + 3] = 255;
					roughnessData[offset] = 165;
					roughnessData[offset + 1] = 165;
					roughnessData[offset + 2] = 165;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .35;
				} else {
					const factor = (1 + surfaceNoise) * (.965 + .035 * bevel);
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * factor), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * factor), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * factor), 0, 255);
					albedoData[offset + 3] = 255;
					const rough = MathUtils.clamp(Math.round((.42 + (1 - bevel) * .08) * 255), 0, 255);
					roughnessData[offset] = rough;
					roughnessData[offset + 1] = rough;
					roughnessData[offset + 2] = rough;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .55 + .35 * bevel + surfaceNoise * .05;
				}
			}
			break;
		case "roof":
			normalStrength = 3.2;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const px = x % 64;
				const py = y % 128;
				const distX = Math.min(px, 64 - px);
				const distY = Math.min(py, 128 - py);
				const isSeam = distX < 2 || distY < 2;
				const isRivet = (Math.abs(px - 10) < 3 || Math.abs(px - 54) < 3) && (Math.abs(py - 12) < 3 || Math.abs(py - 116) < 3);
				const brushed = (smoothNoise2D(x * .5, y * .04, 33) - .5) * .08;
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				if (isRivet) {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * 1.15), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * 1.15), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * 1.15), 0, 255);
					albedoData[offset + 3] = 255;
					roughnessData[offset] = 56;
					roughnessData[offset + 1] = 56;
					roughnessData[offset + 2] = 56;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .95;
				} else if (isSeam) {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * .68), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * .68), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * .68), 0, 255);
					albedoData[offset + 3] = 255;
					roughnessData[offset] = 140;
					roughnessData[offset + 1] = 140;
					roughnessData[offset + 2] = 140;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .2;
				} else {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * (1 + brushed)), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * (1 + brushed)), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * (1 + brushed)), 0, 255);
					albedoData[offset + 3] = 255;
					const rough = MathUtils.clamp(Math.round((.28 + brushed * .06) * 255), 0, 255);
					roughnessData[offset] = rough;
					roughnessData[offset + 1] = rough;
					roughnessData[offset + 2] = rough;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .75 + brushed * .1;
				}
			}
			break;
		case "teal-trim":
			normalStrength = 2.8;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const brushed = (smoothNoise2D(x * .6, y * .06, 55) - .5) * .14;
				const band = Math.cos(x * Math.PI * 2 / 128) * .06;
				const factor = 1 + brushed + band;
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				albedoData[offset] = MathUtils.clamp(Math.round(baseR * factor), 0, 255);
				albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * factor), 0, 255);
				albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * factor), 0, 255);
				albedoData[offset + 3] = 255;
				const rough = MathUtils.clamp(Math.round((.28 + (smoothNoise2D(x * .1, y * .1, 77) - .5) * .05) * 255), 0, 255);
				roughnessData[offset] = rough;
				roughnessData[offset + 1] = rough;
				roughnessData[offset + 2] = rough;
				roughnessData[offset + 3] = 255;
				heightData[pIndex] = .7 + brushed * .15;
			}
			break;
		case "engine-bulkhead":
			normalStrength = 4;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const px = x % 64;
				const isSeam = px < 3;
				const isRivet = Math.abs(px - 8) < 3 && y % 24 < 3;
				const mottle = (fbm2D(x * .06, y * .06, 3, 88) - .5) * .15;
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				if (isRivet) {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * 1.25), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * 1.25), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * 1.25), 0, 255);
					albedoData[offset + 3] = 255;
					roughnessData[offset] = 95;
					roughnessData[offset + 1] = 95;
					roughnessData[offset + 2] = 95;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .95;
				} else if (isSeam) {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * .6), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * .6), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * .6), 0, 255);
					albedoData[offset + 3] = 255;
					roughnessData[offset] = 184;
					roughnessData[offset + 1] = 184;
					roughnessData[offset + 2] = 184;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .2;
				} else {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * (1 + mottle)), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * (1 + mottle)), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * (1 + mottle)), 0, 255);
					albedoData[offset + 3] = 255;
					const rough = MathUtils.clamp(Math.round((.52 + mottle * .08) * 255), 0, 255);
					roughnessData[offset] = rough;
					roughnessData[offset + 1] = rough;
					roughnessData[offset + 2] = rough;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .7 + mottle * .1;
				}
			}
			break;
		case "engine-grating":
			normalStrength = 4.5;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const u = (x + y) % 16 - 8;
				const v = (x - y + 1600) % 16 - 8;
				const diamondDist = Math.abs(u) * 1.4 + Math.abs(v);
				const isTread = diamondDist < 4.5;
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				if (isTread) {
					const treadPeak = 1 - diamondDist / 4.5;
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * (1.2 + .8 * treadPeak)), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * (1.2 + .8 * treadPeak)), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * (1.2 + .8 * treadPeak)), 0, 255);
					albedoData[offset + 3] = 255;
					const rough = MathUtils.clamp(Math.round((.28 + .1 * (1 - treadPeak)) * 255), 0, 255);
					roughnessData[offset] = rough;
					roughnessData[offset + 1] = rough;
					roughnessData[offset + 2] = rough;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .45 + .5 * treadPeak;
				} else {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * .6), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * .6), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * .6), 0, 255);
					albedoData[offset + 3] = 255;
					roughnessData[offset] = 204;
					roughnessData[offset + 1] = 204;
					roughnessData[offset + 2] = 204;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .2;
				}
			}
			break;
		case "engine-machinery":
			normalStrength = 3.5;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const px = x % 64;
				const py = y % 64;
				const isLouver = px >= 12 && px <= 52 && py % 16 < 6;
				const isFlange = px < 4 || px >= 60 || py < 4 || py >= 60;
				const castNoise = (smoothNoise2D(x * .3, y * .3, 109) - .5) * .08;
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				if (isLouver) {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * .45), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * .45), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * .45), 0, 255);
					albedoData[offset + 3] = 255;
					roughnessData[offset] = 178;
					roughnessData[offset + 1] = 178;
					roughnessData[offset + 2] = 178;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .15;
				} else if (isFlange) {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * 1.15), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * 1.15), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * 1.15), 0, 255);
					albedoData[offset + 3] = 255;
					roughnessData[offset] = 82;
					roughnessData[offset + 1] = 82;
					roughnessData[offset + 2] = 82;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .85;
				} else {
					albedoData[offset] = MathUtils.clamp(Math.round(baseR * (1 + castNoise)), 0, 255);
					albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * (1 + castNoise)), 0, 255);
					albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * (1 + castNoise)), 0, 255);
					albedoData[offset + 3] = 255;
					const rough = MathUtils.clamp(Math.round((.42 + castNoise * .06) * 255), 0, 255);
					roughnessData[offset] = rough;
					roughnessData[offset + 1] = rough;
					roughnessData[offset + 2] = rough;
					roughnessData[offset + 3] = 255;
					heightData[pIndex] = .65 + castNoise * .1;
				}
			}
			break;
		case "engine-amber":
			normalStrength = 3;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const ridge = Math.sin(y * Math.PI / 8) * .5 + .5;
				const factor = .85 + .3 * ridge;
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				albedoData[offset] = MathUtils.clamp(Math.round(baseR * factor), 0, 255);
				albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * factor), 0, 255);
				albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * factor), 0, 255);
				albedoData[offset + 3] = 255;
				const rough = MathUtils.clamp(Math.round((.3 + .12 * (1 - ridge)) * 255), 0, 255);
				roughnessData[offset] = rough;
				roughnessData[offset + 1] = rough;
				roughnessData[offset + 2] = rough;
				roughnessData[offset + 3] = 255;
				heightData[pIndex] = .4 + .55 * ridge;
			}
			break;
		case "engine-practical":
			normalStrength = 2.2;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const across = Math.abs(y / size * 2 - 1);
				const lens = Math.cos(across * Math.PI * .5) ** .6;
				const isCap = x % 128 < 7;
				const rib = .94 + .06 * Math.sin(x % 16 * Math.PI / 8);
				const factor = isCap ? .16 : (.34 + .66 * lens) * rib;
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				albedoData[offset] = MathUtils.clamp(Math.round(baseR * factor), 0, 255);
				albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * factor), 0, 255);
				albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * factor), 0, 255);
				albedoData[offset + 3] = 255;
				const rough = MathUtils.clamp(Math.round((isCap ? .62 : .24 + .14 * (1 - lens)) * 255), 0, 255);
				roughnessData[offset] = rough;
				roughnessData[offset + 1] = rough;
				roughnessData[offset + 2] = rough;
				roughnessData[offset + 3] = 255;
				heightData[pIndex] = isCap ? .15 : .55 + .35 * lens;
			}
			break;
		case "upholstery":
			normalStrength = 3.2;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const cellX = Math.floor(x / 4);
				const cellY = Math.floor(y / 4);
				const subX = x % 4 / 4;
				const subY = y % 4 / 4;
				const thread = (cellX + cellY) % 2 === 0 ? Math.sin(subX * Math.PI) : Math.sin(subY * Math.PI);
				const factor = .82 + .3 * thread;
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				albedoData[offset] = MathUtils.clamp(Math.round(baseR * factor), 0, 255);
				albedoData[offset + 1] = MathUtils.clamp(Math.round(baseG * factor), 0, 255);
				albedoData[offset + 2] = MathUtils.clamp(Math.round(baseB * factor), 0, 255);
				albedoData[offset + 3] = 255;
				const rough = MathUtils.clamp(Math.round((.78 + .08 * (1 - thread)) * 255), 0, 255);
				roughnessData[offset] = rough;
				roughnessData[offset + 1] = rough;
				roughnessData[offset + 2] = rough;
				roughnessData[offset + 3] = 255;
				heightData[pIndex] = .45 + .35 * thread;
			}
			break;
		case "glass":
			hasAlbedo = false;
			normalStrength = 1.5;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				const wave = smoothNoise2D(x * .05, y * .05, 31) * .04;
				roughnessData[offset] = 36;
				roughnessData[offset + 1] = 36;
				roughnessData[offset + 2] = 36;
				roughnessData[offset + 3] = 255;
				heightData[pIndex] = .5 + wave;
			}
			break;
		case "water":
			hasAlbedo = false;
			normalStrength = 3.5;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
				const wave = Math.sin(x * .12 + y * .08) * .35 + Math.sin(x * .06 - y * .15) * .35 + (smoothNoise2D(x * .1, y * .1, 99) - .5) * .3;
				const offset = (y * size + x) * 4;
				const pIndex = y * size + x;
				roughnessData[offset] = 26;
				roughnessData[offset + 1] = 26;
				roughnessData[offset + 2] = 26;
				roughnessData[offset + 3] = 255;
				heightData[pIndex] = .5 + wave * .4;
			}
			break;
	}
	const normalData = normalsFromHeights(size, size, heightData, normalStrength);
	return {
		map: hasAlbedo ? createDataTexture(`${family}-albedo`, size, size, albedoData, SRGBColorSpace) : void 0,
		normalMap: createDataTexture(`${family}-normal`, size, size, normalData, ""),
		roughnessMap: createDataTexture(`${family}-roughness`, size, size, roughnessData, ""),
		tileMetres: HIGH_SEAS_TILE_METRES[family]
	};
}
function pbrMaterial(name, family, color, roughness, metalness, emissive = 0, emissiveIntensity = 0) {
	const textures = generateMaterialTextureSet(family, color);
	const MAP_CARRIES_ALBEDO = /* @__PURE__ */ new Set([
		"deck",
		"stair",
		"hull",
		"wall",
		"roof",
		"teal-trim",
		"upholstery"
	]);
	const value = new MeshStandardMaterial({
		color: textures.map && MAP_CARRIES_ALBEDO.has(family) ? 16777215 : color,
		roughness,
		metalness,
		emissive,
		emissiveIntensity,
		...textures.map ? { map: textures.map } : {},
		...textures.normalMap ? { normalMap: textures.normalMap } : {},
		...textures.roughnessMap ? { roughnessMap: textures.roughnessMap } : {}
	});
	value.name = `high-seas-${name}`;
	value.userData.assetOwner = "high-seas";
	value.userData.assetKind = "procedural-original-material";
	value.userData.textureFamily = family;
	return value;
}
function material(name, color, roughness, metalness, emissive = 0, emissiveIntensity = 0) {
	return pbrMaterial(name, {
		"pearl-hull": "hull",
		"warm-cabin-shell": "wall",
		"silver-roof": "roof",
		"honey-deck": "deck",
		"dark-deck-stair": "stair",
		"deep-teal-trim": "teal-trim",
		"engine-bulkhead": "engine-bulkhead",
		"engine-grating": "engine-grating",
		"engine-machinery": "engine-machinery",
		"engine-amber": "engine-amber",
		"engine-practical": "engine-practical",
		"cabana-upholstery": "upholstery"
	}[name] ?? "wall", color, roughness, metalness, emissive, emissiveIntensity);
}
/**
* Below-deck lighting (HF-373, and the Pass 77 correction to it).
*
* HF-373 read the owner's "too dark down at the bottom of hijacked" as a
* brightness problem and answered it the only way the emissive-only policy
* allowed: a dedicated fixture material for the strips, plus an emissive fill
* on the three sealed-volume families. That was a real improvement over pure
* black and it is why those two ideas survive below - but it could not work,
* because emissive geometry illuminates nothing but itself.
*
* Measured on hardware WebGPU, standing in the corridor at eye height, the
* result was mean 46/255 with 85% of the frame below 12/255, and the deck plate
* under the player's own feet at 6/255 with 99% crushed: bright bars hanging in
* a void, no walls, no floor, nothing to read a body against.
*
* The fix is three things, in order of how much each moved the measurement:
*  1. real light. Eight shadowed-local spot practicals authored on the arena
*     DEFINITION (rendering/arenas/high-seas.ts), each aimed straight down
*     inside a declared volume whose ceiling is below the main deck. They cast
*     shadows, so they cannot spill through a bulkhead - which is the property
*     the emissive-only policy existed to protect in the first place.
*  2. surfaces that can answer it. The families were 58-74% metallic over a
*     2-5% albedo, so they stayed black even under a full rig; see
*     BELOW_DECK_METALNESS.
*  3. the emissive sources step DOWN, not up. With a key present, a fill that
*     takes no falloff and no shadow only flattens the depth the light just
*     created.
*
* What has not changed: everything here is still scoped to materials that exist
* only inside the sealed volume, because the one thing this must not do is
* brighten the open deck above. The practicals still own their own material
* rather than sharing `engine-amber` with the DECK-LEVEL hatch guards, so the
* strips can be tuned without the guards glowing along with them.
*/
var BELOW_DECK_PRACTICAL_EMISSIVE_INTENSITY = 1.4;
/**
* Residual fill, now that the service deck has real lights.
*
* These numbers used to be the ONLY thing standing between the corridor and
* pure black, so they were pushed as far as an emissive lift can go (grating
* sat at 1.15). Emissive is self-lit: it takes no falloff, no shadow and no
* direction, so pushing it flattens exactly the depth the owner wants back.
* The first practical rig therefore dropped the fill to a floor-of-black role
* - and the Pass 79 re-measurement showed that overshot: with the rig live the
* deck plate under the player still read median 12/255 with 50% of pixels
* crushed, and the engine-room walls 28-33% crushed between fixture pools.
* Crushed pixels are by definition outside the pool cores, so no fixture
* intensity reaches them; the fill is the only lever that does, and it is
* re-raised to a measured middle ground - well under the old 1.15, well above
* floor-of-black. It remains the entire below-deck lighting story on the
* `performance`/`compat` profiles, where ArenaContrastLighting builds no rig.
*
* Pass 79 (gauntlet round 3) re-measurement on hardware WebGPU against the
* production bundle: the corridor legs and ramp mouths are fightable (mean
* 117-121/255, <1% crushed), but the deck plate between fixture pools still
* read median 28.9/255 with 36% of pixels crushed and 46% under-readable
* (station `floor-check-down`, z=-6). Crushed pixels sit between pool cores,
* so fixture intensity cannot reach them; the textured grating fill is the
* only lever that does. 0.5 -> 0.8, still under the old flat 1.15 and still
* routed through the family's own albedo so plate seams keep their contrast.
*/
var BELOW_DECK_FILL = Object.freeze({
	bulkhead: Object.freeze({
		tint: 10470354,
		intensity: .28
	}),
	machinery: Object.freeze({
		tint: 11060428,
		intensity: .19
	}),
	grating: Object.freeze({
		tint: 8825012,
		intensity: .436
	})
});
/**
* Below-deck surface response.
*
* The measured second cause of the darkness. The three service-deck families
* were authored at metalness 0.58-0.74 over a 2-5% albedo. A metal surface has
* almost no diffuse response, so those surfaces returned nearly nothing no
* matter what lit them: with a full practical rig injected into the live scene,
* the deck plate under the player's own feet still measured 20/255 mean with
* 94% of pixels crushed, and only dropping metalness moved it (43/255 at 0.15).
*
* Painted marine steel is a dielectric - bulkheads and deck plate are painted,
* so they belong near zero. The machinery keeps the most metal of the three
* because bare machined housings genuinely are metal, and it is cover rather
* than a walkable surface, so it is allowed to stay moodier.
*/
var BELOW_DECK_METALNESS = Object.freeze({
	bulkhead: .16,
	grating: .18,
	machinery: .34
});
/**
* Lifts a below-deck material off pure black without flattening it.
*
* The lift is routed through `emissiveMap` (the family's own albedo) instead of
* a flat emissive colour: panel lines, louvers and flange edges keep their
* contrast, so a player still reads shape and depth - and an enemy still reads
* as a silhouette against a textured wall rather than against a milk-white
* slab. `belowDeckFill` is the tag the leak test asserts against.
*/
function applyEnclosedVolumeFill(value, fill) {
	value.emissive.setHex(fill.tint);
	value.emissiveIntensity = fill.intensity;
	if (value.map) value.emissiveMap = value.map;
	value.userData.belowDeckFill = true;
	value.userData.belowDeckFillTint = fill.tint;
	value.userData.belowDeckFillIntensity = fill.intensity;
	return value;
}
/** The service-deck light strips: a real fixture, not a tinted accent panel. */
function createPracticalMaterial() {
	const value = material("engine-practical", 16770756, .26, .04, 16761466, BELOW_DECK_PRACTICAL_EMISSIVE_INTENSITY);
	if (value.map) value.emissiveMap = value.map;
	value.userData.belowDeckFill = true;
	value.userData.belowDeckPractical = true;
	return value;
}
function containedWaterMaterial(name, color) {
	const textures = generateMaterialTextureSet("water", color);
	const value = new MeshStandardMaterial({
		color,
		roughness: .12,
		metalness: .28,
		transparent: true,
		opacity: .72,
		depthWrite: false,
		...textures.normalMap ? { normalMap: textures.normalMap } : {},
		...textures.roughnessMap ? { roughnessMap: textures.roughnessMap } : {}
	});
	value.name = `high-seas-${name}`;
	value.userData.assetOwner = "high-seas";
	value.userData.assetKind = "contained-presentation-water";
	value.userData.waterScope = "contained-feature-only";
	value.userData.textureFamily = "water";
	return value;
}
function getHighSeasMaterialInventory() {
	return Object.freeze([
		{
			name: "pearl-hull",
			family: "hull",
			color: 15397359
		},
		{
			name: "warm-cabin-shell",
			family: "wall",
			color: 16118761
		},
		{
			name: "silver-roof",
			family: "roof",
			color: 13358805
		},
		{
			name: "honey-deck",
			family: "deck",
			color: 11047006
		},
		{
			name: "dark-deck-stair",
			family: "stair",
			color: 7033408
		},
		{
			name: "deep-teal-trim",
			family: "teal-trim",
			color: 3108992
		},
		{
			name: "engine-bulkhead",
			family: "engine-bulkhead",
			color: 6058104
		},
		{
			name: "engine-grating",
			family: "engine-grating",
			color: 5136487
		},
		{
			name: "engine-machinery",
			family: "engine-machinery",
			color: 7833483
		},
		{
			name: "engine-amber",
			family: "engine-amber",
			color: 14132289
		},
		{
			name: "engine-practical",
			family: "engine-practical",
			color: 16770756
		},
		{
			name: "cabana-upholstery",
			family: "upholstery",
			color: 4949904
		},
		{
			name: "side-glass",
			family: "glass",
			color: 2047302
		},
		{
			name: "cabin-ceiling",
			family: "wall",
			color: 15263194
		},
		{
			name: "contained-feature-water",
			family: "water",
			color: 2996676
		}
	].map(({ name, family, color }) => {
		const tex = generateMaterialTextureSet(family, color);
		return Object.freeze({
			name: `high-seas-${name}`,
			family,
			hasMap: tex.map !== void 0,
			hasNormalMap: tex.normalMap !== void 0,
			hasRoughnessMap: tex.roughnessMap !== void 0,
			resolution: 256,
			tileMetres: tex.tileMetres
		});
	}));
}
function box(builder, name, position, size, meshMaterial, options = {}) {
	const geometry = new BoxGeometry(...size);
	const boxTileMetres = tileMetresForMaterial(meshMaterial);
	if (boxTileMetres !== null) applyBoxProjectedUv(geometry, boxTileMetres);
	const mesh = new Mesh(geometry, meshMaterial);
	mesh.name = name;
	mesh.position.set(...position);
	if (options.rotation) mesh.rotation.set(...options.rotation);
	mesh.castShadow = options.cast !== false;
	mesh.receiveShadow = true;
	mesh.userData.assetOwner = "high-seas";
	mesh.userData.assetKind = "procedural-original-geometry";
	mesh.userData.highSeasDetail = options.detail ?? "core";
	mesh.userData.impactSurface = classifyImpactSurface({
		name,
		metalness: meshMaterial instanceof MeshStandardMaterial ? meshMaterial.metalness : void 0
	});
	builder.root.add(mesh);
	const solid = options.solid !== false;
	const shots = options.shots ?? solid;
	const bounds = {
		minX: position[0] - size[0] / 2,
		maxX: position[0] + size[0] / 2,
		minY: position[1] - size[1] / 2,
		maxY: position[1] + size[1] / 2,
		minZ: position[2] - size[2] / 2,
		maxZ: position[2] + size[2] / 2,
		...options.rotation ? { rotation: options.rotation } : {}
	};
	let ballisticSurfaceId = null;
	if (shots) {
		builder.raycastMeshes.push(mesh);
		const surface = createBallisticSurface(`high-seas:${builder.ballisticSurfaceSequence}:${name}`, name, bounds, {
			impactSurface: mesh.userData.impactSurface,
			material: options.ballisticMaterial ?? "reinforced"
		}, options.breakableWindowId);
		builder.ballisticSurfaceSequence += 1;
		builder.shotSurfaces.push(surface);
		ballisticSurfaceId = surface.id;
		mesh.userData.ballisticSurfaceId = surface.id;
		mesh.userData.ballisticMaterial = surface.material;
		if (options.breakableWindowId) {
			mesh.userData.breakableWindowId = options.breakableWindowId;
			mesh.userData.dynamic = true;
			builder.breakableWindows.push({
				id: options.breakableWindowId,
				mesh,
				broken: false
			});
		}
	} else {
		mesh.userData.presentationOnly = true;
		mesh.userData.blocksShots = false;
		mesh.userData.highSeasPresentationOnly = true;
		mesh.raycast = () => void 0;
	}
	if (solid) {
		builder.colliders.push(bounds);
		builder.physicsColliders.push(bounds);
		mesh.userData.collisionAuthority = name;
	}
	if (options.cover) {
		if (!solid || !shots) throw new Error(`High Seas cover ${name} must block both movement and shots`);
		builder.physicalCover.push({
			id: name,
			bounds,
			blocksMovement: true,
			blocksShots: true
		});
	}
	if (options.walkable) {
		if (!solid || !ballisticSurfaceId) throw new Error(`High Seas platform ${name} requires shared authority`);
		builder.walkable.push({
			id: options.walkable.id,
			presentationName: name,
			bounds,
			y: options.walkable.elevation,
			navigation: options.walkable.navigation,
			ballisticSurfaceId
		});
	}
	builder.authorities.push({
		name,
		bounds,
		mesh,
		solid,
		shots,
		ballisticSurfaceId,
		externalPhysicsAuthority: options.externalPhysicsAuthority ?? null
	});
	return mesh;
}
function detailBox(builder, name, position, size, meshMaterial, rotation, detail = "performance") {
	return box(builder, name, position, size, meshMaterial, {
		solid: false,
		shots: false,
		rotation,
		cast: detail === "quality",
		detail
	});
}
function coverBox(builder, name, position, size, meshMaterial, ballisticMaterial, rotation) {
	return box(builder, name, position, size, meshMaterial, {
		cover: true,
		rotation,
		ballisticMaterial
	});
}
function presentationMesh(builder, name, geometry, meshMaterial, position, rotation = [
	0,
	0,
	0
], detail = "performance") {
	const presentationTileMetres = tileMetresForMaterial(meshMaterial);
	if (presentationTileMetres !== null) applyBoxProjectedUv(geometry, presentationTileMetres);
	const mesh = new Mesh(geometry, meshMaterial);
	mesh.name = name;
	mesh.position.set(...position);
	mesh.rotation.set(...rotation);
	mesh.castShadow = detail === "quality";
	mesh.receiveShadow = true;
	mesh.userData.assetOwner = "high-seas";
	mesh.userData.assetKind = "procedural-original-geometry";
	mesh.userData.highSeasDetail = detail;
	mesh.userData.presentationOnly = true;
	mesh.userData.blocksShots = false;
	mesh.userData.highSeasPresentationOnly = true;
	mesh.raycast = () => void 0;
	builder.root.add(mesh);
	return mesh;
}
function addWalkableBox(builder, id, position, size, meshMaterial, elevation, navigation) {
	return box(builder, `high-seas-platform-${id}`, position, size, meshMaterial, {
		ballisticMaterial: "structural-metal",
		walkable: {
			id,
			elevation,
			navigation
		}
	});
}
function addRamp(builder, id, from, to, width, meshMaterial, ballisticMaterial) {
	const deltaX = to[0] - from[0];
	const deltaZ = to[2] - from[2];
	if (Math.abs(deltaX) > 1e-6) throw new Error(`High Seas ramp ${id} must remain Z-aligned`);
	const run = Math.abs(deltaZ);
	const rise = to[1] - from[1];
	const angle = Math.atan2(rise, run);
	const rotationX = -Math.sign(deltaZ) * angle;
	const length = Math.hypot(run, rise);
	const position = [
		(from[0] + to[0]) / 2,
		(from[1] + to[1]) / 2 - Math.cos(angle) * RAMP_THICKNESS / 2,
		(from[2] + to[2]) / 2
	];
	const size = [
		width,
		RAMP_THICKNESS,
		length
	];
	const rotation = [
		rotationX,
		0,
		0
	];
	const ramp = box(builder, `high-seas-ramp-${id}`, position, size, meshMaterial, {
		rotation,
		ballisticMaterial
	});
	ramp.userData.highSeasRampId = id;
	ramp.userData.rampFrom = [...from];
	ramp.userData.rampTo = [...to];
	return {
		position,
		size,
		rotation,
		angleDegrees: MathUtils.radToDeg(angle)
	};
}
/** Concatenates indexed geometries that carry position and normal attributes. */
function concatGeometries(geometries) {
	const positions = [];
	const normals = [];
	const indices = [];
	for (const geometry of geometries) {
		const position = geometry.getAttribute("position");
		const normal = geometry.getAttribute("normal");
		const index = geometry.getIndex();
		if (!position || !normal || !index) throw new Error("High Seas merged geometry requires indexed position+normal");
		const base = positions.length / 3;
		for (let vertex = 0; vertex < position.count; vertex += 1) {
			positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
			normals.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
		}
		for (let entry = 0; entry < index.count; entry += 1) indices.push(index.getX(entry) + base);
		geometry.dispose();
	}
	const merged = new BufferGeometry();
	merged.setAttribute("position", new Float32BufferAttribute(positions, 3));
	merged.setAttribute("normal", new Float32BufferAttribute(normals, 3));
	merged.setIndex(indices);
	return merged;
}
/**
* Bakes many axis-aligned dressing boxes of ONE material into a single
* presentation mesh.
*
* WHY. The visible-geometry budget counts draw calls, and dressing such as
* stair treads, light strips, machinery bands and the hull-void liner is many
* small boxes sharing one material - one draw each was most of the budget.
* Parts are re-expressed relative to their shared AABB centre before merging:
* `applyBoxProjectedUv` reads LOCAL coordinates, so a group baked at raw world
* coordinates far from the origin would smear its UV span across unrelated
* axes and break the world-space texel-density invariant.
*/
function mergedDetailBoxes(builder, name, parts, meshMaterial, portalAuditExclusionReason) {
	const min = [
		Infinity,
		Infinity,
		Infinity
	];
	const max = [
		-Infinity,
		-Infinity,
		-Infinity
	];
	for (const part of parts) for (let axis = 0; axis < 3; axis += 1) {
		min[axis] = Math.min(min[axis], part.center[axis] - part.size[axis] / 2);
		max[axis] = Math.max(max[axis], part.center[axis] + part.size[axis] / 2);
	}
	const origin = [
		(min[0] + max[0]) / 2,
		(min[1] + max[1]) / 2,
		(min[2] + max[2]) / 2
	];
	const mesh = presentationMesh(builder, name, concatGeometries(parts.map((part) => {
		const partGeometry = new BoxGeometry(...part.size);
		partGeometry.translate(part.center[0] - origin[0], part.center[1] - origin[1], part.center[2] - origin[2]);
		return partGeometry;
	})), meshMaterial, origin);
	if (portalAuditExclusionReason) {
		mesh.userData.portalAuditExcluded = true;
		mesh.userData.portalAuditExclusionReason = portalAuditExclusionReason;
	}
	return mesh;
}
function addRampTreads(builder, id, from, to, width, treadMaterial) {
	const parts = [];
	for (let step = 1; step <= 10; step += 1) {
		const progress = step / 11;
		parts.push({
			center: [
				MathUtils.lerp(from[0], to[0], progress),
				MathUtils.lerp(from[1], to[1], progress) + .035,
				MathUtils.lerp(from[2], to[2], progress)
			],
			size: [
				width - .16,
				.055,
				.22
			]
		});
	}
	mergedDetailBoxes(builder, `high-seas-${id}-treads`, parts, treadMaterial);
}
/**
* Analytic outward normals for the sculpted hull.
*
* WHY NOT computeVertexNormals. The hull index buffer deliberately winds the
* two lower strips opposite to the upper two (the profile reverses direction
* at the chine), and the bow/stern cap fans wind differently again, so
* computeVertexNormals averaged ACROSS those winding boundaries and produced
* normals that point inward or sideways - measured on the live scene, a keel
* vertex at (0, -5.25) carried the sideways normal (-0.99, 0.04, 0.12) and a
* starboard-side vertex carried a port-pointing one. A surface whose normals
* oppose the light renders near-black at any sun angle, which is exactly why
* the hull flank read as a black slab from every deck viewpoint while the
* material itself is pearl white.
*
* These normals are computed from the surface's own tangents instead: the
* along-profile tangent crossed with the along-hull tangent, which for this
* profile order (rail -> chine -> keel -> chine -> rail, bow to stern) points
* outward on every side vertex, straight down at the keel, and the caps get
* their exact +/-z face normal. Smooth across rings, per-profile-point within
* a ring - the crease at each chine is preserved because the profile tangent
* turns sharply there.
*/
function hullNormals(rings) {
	const profilePoint = (ring, index) => {
		switch (index) {
			case 0: return [
				-ring.width,
				2.9,
				ring.z
			];
			case 1: return [
				-ring.chine,
				-1.8,
				ring.z
			];
			case 2: return [
				0,
				ring.keel,
				ring.z
			];
			case 3: return [
				ring.chine,
				-1.8,
				ring.z
			];
			default: return [
				ring.width,
				2.9,
				ring.z
			];
		}
	};
	const normals = new Float32Array(rings.length * 5 * 3);
	for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
		const previous = rings[Math.max(0, ringIndex - 1)];
		const next = rings[Math.min(rings.length - 1, ringIndex + 1)];
		for (let profileIndex = 0; profileIndex < 5; profileIndex += 1) {
			const profileAhead = profilePoint(rings[ringIndex], Math.min(4, profileIndex + 1));
			const profileBehind = profilePoint(rings[ringIndex], Math.max(0, profileIndex - 1));
			const hullAhead = profilePoint(next, profileIndex);
			const hullBehind = profilePoint(previous, profileIndex);
			const tangentProfile = [
				profileAhead[0] - profileBehind[0],
				profileAhead[1] - profileBehind[1],
				0
			];
			const tangentHull = [
				hullAhead[0] - hullBehind[0],
				hullAhead[1] - hullBehind[1],
				hullAhead[2] - hullBehind[2]
			];
			let nx = tangentProfile[1] * tangentHull[2] - tangentProfile[2] * tangentHull[1];
			let ny = tangentProfile[2] * tangentHull[0] - tangentProfile[0] * tangentHull[2];
			let nz = tangentProfile[0] * tangentHull[1] - tangentProfile[1] * tangentHull[0];
			const length = Math.hypot(nx, ny, nz) || 1;
			nx /= length;
			ny /= length;
			nz /= length;
			const offset = (ringIndex * 5 + profileIndex) * 3;
			normals[offset] = nx;
			normals[offset + 1] = ny;
			normals[offset + 2] = nz;
		}
		for (const [profileIndex, capNormalZ] of [
			[0, -1],
			[1, -1],
			[2, -1],
			[3, -1],
			[4, -1]
		]) {
			if (ringIndex !== 0) continue;
			const offset = (ringIndex * 5 + profileIndex) * 3;
			normals[offset] = 0;
			normals[offset + 1] = 0;
			normals[offset + 2] = capNormalZ;
		}
		for (const [profileIndex, capNormalZ] of [
			[0, 1],
			[1, 1],
			[2, 1],
			[3, 1],
			[4, 1]
		]) {
			if (ringIndex !== rings.length - 1) continue;
			const offset = (ringIndex * 5 + profileIndex) * 3;
			normals[offset] = 0;
			normals[offset + 1] = 0;
			normals[offset + 2] = capNormalZ;
		}
	}
	return normals;
}
function createHullGeometry() {
	const rings = [
		{
			z: -44,
			width: 1.25,
			chine: .88,
			keel: -4.5
		},
		{
			z: -41,
			width: 5.4,
			chine: 4.15,
			keel: -5.25
		},
		{
			z: -40.45,
			width: 10.3,
			chine: 7.65,
			keel: -5.48
		},
		{
			z: -36.5,
			width: 10.25,
			chine: 7.7,
			keel: -5.7
		},
		{
			z: 35.5,
			width: 10.35,
			chine: 7.8,
			keel: -5.75
		},
		{
			z: 42.2,
			width: 9.65,
			chine: 7.2,
			keel: -5.15
		},
		{
			z: 43.5,
			width: 10.35,
			chine: 7.55,
			keel: -4.85
		},
		{
			z: 44,
			width: 8.3,
			chine: 6.1,
			keel: -4.6
		}
	];
	const positions = [];
	const uvs = [];
	const indices = [];
	for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
		const ring = rings[ringIndex];
		const v = ringIndex / (rings.length - 1);
		for (const [x, y, u] of [
			[
				-ring.width,
				2.9,
				0
			],
			[
				-ring.chine,
				-1.8,
				.25
			],
			[
				0,
				ring.keel,
				.5
			],
			[
				ring.chine,
				-1.8,
				.75
			],
			[
				ring.width,
				2.9,
				1
			]
		]) {
			positions.push(x, y, ring.z);
			uvs.push(u, v);
		}
	}
	for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
		const start = ringIndex * 5;
		const next = start + 5;
		for (let strip = 0; strip < 4; strip += 1) if (strip < 2) {
			indices.push(start + strip, next + strip + 1, next + strip);
			indices.push(start + strip, start + strip + 1, next + strip + 1);
		} else {
			indices.push(start + strip, next + strip, next + strip + 1);
			indices.push(start + strip, next + strip + 1, start + strip + 1);
		}
	}
	indices.push(0, 2, 1, 0, 3, 2, 0, 4, 3);
	const stern = (rings.length - 1) * 5;
	indices.push(stern, stern + 1, stern + 2, stern, stern + 2, stern + 3, stern, stern + 3, stern + 4);
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
	geometry.setAttribute("normal", new Float32BufferAttribute(hullNormals(rings), 3));
	geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
	geometry.setIndex(indices);
	return geometry;
}
function addDecks(builder, deckMaterial) {
	const centerY = HIGH_SEAS_LEVELS.mainDeck - DECK_THICKNESS / 2;
	const add = (id, x, z, width, depth) => {
		addWalkableBox(builder, id, [
			x,
			centerY,
			z
		], [
			width,
			DECK_THICKNESS,
			depth
		], deckMaterial, HIGH_SEAS_LEVELS.mainDeck, "bot");
	};
	add("bow-tip", 0, -42.25, 8, 3.5);
	add("bow-shoulder", 0, -39, 20.8, 3);
	add("bow-spawn", 0, -33.25, 20.8, 8.5);
	add("bow-cabin-forward", 0, -26.775, 20.8, 4.45);
	add("bow-hatch-port", -5.975, -22.15, 8.85, 4.8);
	add("bow-hatch-starboard", 5.975, -22.15, 8.85, 4.8);
	add("bow-cabin-aft", 0, -16.375, 20.8, 6.75);
	add("center", 0, 0, 20.8, 26);
	add("stern-cabin-forward", 0, 16.375, 20.8, 6.75);
	add("stern-hatch-port", -5.975, 22.15, 8.85, 4.8);
	add("stern-hatch-starboard", 5.975, 22.15, 8.85, 4.8);
	add("stern-cabin-aft", 0, 26.775, 20.8, 4.45);
	add("stern-spawn", 0, 36.25, 20.8, 14.5);
	add("port-viewing-catwalk", -11, 0, 1.5, 22);
}
function addUpperFloor(builder, prefix, stairX, holeMinZ, holeMaxZ, cabinMinZ, cabinMaxZ, deckMaterial) {
	const holeMinX = stairX - 1.05;
	const holeMaxX = stairX + 1.05;
	const centerY = HIGH_SEAS_LEVELS.upperDeck - DECK_THICKNESS / 2;
	const add = (id, minX, maxX, minZ, maxZ) => {
		if (maxX - minX <= 0 || maxZ - minZ <= 0) return;
		addWalkableBox(builder, `${prefix}-upper-${id}`, [
			(minX + maxX) / 2,
			centerY,
			(minZ + maxZ) / 2
		], [
			maxX - minX,
			DECK_THICKNESS,
			maxZ - minZ
		], deckMaterial, HIGH_SEAS_LEVELS.upperDeck, "bot");
	};
	add("port", -7.4, holeMinX, cabinMinZ, cabinMaxZ);
	add("starboard", holeMaxX, CABIN_HALF_WIDTH, cabinMinZ, cabinMaxZ);
	add("stair-forward", holeMinX, holeMaxX, cabinMinZ, holeMinZ);
	add("stair-aft", holeMinX, holeMaxX, holeMaxZ, cabinMaxZ);
}
function addSplitEndWall(builder, name, z, centerX, openingWidth, y, height, wallMaterial) {
	const openingMin = centerX - openingWidth / 2;
	const openingMax = centerX + openingWidth / 2;
	const leftWidth = openingMin + CABIN_HALF_WIDTH;
	const rightWidth = CABIN_HALF_WIDTH - openingMax;
	if (leftWidth > 0) box(builder, `${name}-port`, [
		-7.4 + leftWidth / 2,
		y,
		z
	], [
		leftWidth,
		height,
		.22
	], wallMaterial, { ballisticMaterial: "interior-wall" });
	if (rightWidth > 0) box(builder, `${name}-starboard`, [
		openingMax + rightWidth / 2,
		y,
		z
	], [
		rightWidth,
		height,
		.22
	], wallMaterial, { ballisticMaterial: "interior-wall" });
}
function addCabin(builder, end, wallMaterial, deckMaterial, roofMaterial, stairMaterial, trimMaterial, glassMaterial, ceilingMaterial, upholsteryMaterial) {
	const direction = end === "bow" ? -1 : 1;
	const minZ = end === "bow" ? -29 : 13;
	const maxZ = end === "bow" ? -13 : 29;
	const innerZ = direction * 13;
	const outerZ = direction * 29;
	const centerZ = direction * 21;
	const internalX = direction < 0 ? 4.6 : -4.6;
	const externalX = -internalX;
	const groundY = HIGH_SEAS_LEVELS.mainDeck + CABIN_GROUND_WALL_HEIGHT / 2;
	const upperY = HIGH_SEAS_LEVELS.upperDeck + CABIN_UPPER_WALL_HEIGHT / 2;
	addSplitEndWall(builder, `high-seas-${end}-ground-inner-wall`, innerZ, 0, 3.4, groundY, CABIN_GROUND_WALL_HEIGHT, wallMaterial);
	addSplitEndWall(builder, `high-seas-${end}-ground-outer-wall`, outerZ, 0, 3.4, groundY, CABIN_GROUND_WALL_HEIGHT, wallMaterial);
	const doorMinZ = centerZ - 1.6;
	const doorMaxZ = centerZ + 1.6;
	for (const [side, x] of [["port", -7.4], ["starboard", CABIN_HALF_WIDTH]]) {
		const firstDepth = doorMinZ - minZ;
		const secondDepth = maxZ - doorMaxZ;
		if (firstDepth > 0) box(builder, `high-seas-${end}-ground-${side}-wall-forward`, [
			x,
			groundY,
			minZ + firstDepth / 2
		], [
			.22,
			CABIN_GROUND_WALL_HEIGHT,
			firstDepth
		], wallMaterial, { ballisticMaterial: "interior-wall" });
		if (secondDepth > 0) box(builder, `high-seas-${end}-ground-${side}-wall-aft`, [
			x,
			groundY,
			doorMaxZ + secondDepth / 2
		], [
			.22,
			CABIN_GROUND_WALL_HEIGHT,
			secondDepth
		], wallMaterial, { ballisticMaterial: "interior-wall" });
	}
	const internalLow = [
		internalX,
		HIGH_SEAS_LEVELS.mainDeck,
		direction * 15.9
	];
	const internalHigh = [
		internalX,
		HIGH_SEAS_LEVELS.upperDeck,
		direction * 20.7
	];
	addUpperFloor(builder, end, internalX, Math.min(internalLow[2], internalHigh[2]) - .55, Math.max(internalLow[2], internalHigh[2]) + .55, minZ, maxZ, deckMaterial);
	const internalAccess = addRamp(builder, `${end}-internal-stair`, internalLow, internalHigh, 1.8, stairMaterial, "wood");
	addRampTreads(builder, `${end}-internal-stair`, internalLow, internalHigh, 1.8, trimMaterial);
	const externalLow = [
		externalX,
		HIGH_SEAS_LEVELS.mainDeck,
		direction * 33.9
	];
	const externalHigh = [
		externalX,
		HIGH_SEAS_LEVELS.upperDeck,
		direction * 29.1
	];
	const externalAccess = addRamp(builder, `${end}-external-stair`, externalLow, externalHigh, 1.8, stairMaterial, "wood");
	addRampTreads(builder, `${end}-external-stair`, externalLow, externalHigh, 1.8, trimMaterial);
	const GLAZING_HALF_THICKNESS = .03;
	const APERTURE_BOTTOM = HIGH_SEAS_LEVELS.upperDeck + .46;
	const APERTURE_TOP = HIGH_SEAS_LEVELS.upperDeck + CABIN_UPPER_WALL_HEIGHT - .54;
	const GLASS_EDGE_INSET = .004;
	const APERTURE_HEIGHT = APERTURE_TOP - APERTURE_BOTTOM;
	addSplitEndWall(builder, `high-seas-${end}-upper-inner-wall`, innerZ, 0, 4.4, upperY, CABIN_UPPER_WALL_HEIGHT, wallMaterial);
	box(builder, `high-seas-${end}-upper-window-sill`, [
		0,
		6.43,
		innerZ
	], [
		4.4,
		.46,
		.22
	], trimMaterial, { ballisticMaterial: "interior-wall" });
	box(builder, `high-seas-${end}-upper-window-header`, [
		0,
		8.53,
		innerZ
	], [
		4.4,
		.54,
		.22
	], trimMaterial, { ballisticMaterial: "interior-wall" });
	box(builder, `high-seas-${end}-upper-inner-mullion`, [
		0,
		upperY,
		innerZ
	], [
		.28,
		CABIN_UPPER_WALL_HEIGHT,
		.18
	], trimMaterial, { ballisticMaterial: "interior-wall" });
	for (const [bay, centreX] of [["port", -1.17], ["starboard", 1.17]]) {
		const bayWidth = 2.06;
		const innerGlassId = `high-seas-${end}-upper-inner-glazing-${bay}`;
		box(builder, innerGlassId, [
			centreX,
			(APERTURE_BOTTOM + APERTURE_TOP) / 2,
			innerZ
		], [
			bayWidth - GLASS_EDGE_INSET * 2,
			APERTURE_HEIGHT - GLASS_EDGE_INSET * 2,
			GLAZING_HALF_THICKNESS * 2
		], glassMaterial, {
			shots: true,
			ballisticMaterial: "glass",
			breakableWindowId: innerGlassId
		});
	}
	const WINDSCREEN_DOOR_HALF = 1.15;
	for (const [flank, flankMinX, flankMaxX] of [[
		"port",
		-7.4,
		externalX - WINDSCREEN_DOOR_HALF
	], [
		"starboard",
		externalX + WINDSCREEN_DOOR_HALF,
		CABIN_HALF_WIDTH
	]]) {
		const width = flankMaxX - flankMinX;
		if (width <= 0) continue;
		const midX = (flankMinX + flankMaxX) / 2;
		box(builder, `high-seas-${end}-upper-windscreen-${flank}-spandrel`, [
			midX,
			HIGH_SEAS_LEVELS.upperDeck + .23,
			outerZ
		], [
			width,
			.46,
			.22
		], wallMaterial, { ballisticMaterial: "interior-wall" });
		box(builder, `high-seas-${end}-upper-windscreen-${flank}-header`, [
			midX,
			APERTURE_TOP + .27,
			outerZ
		], [
			width,
			.54,
			.22
		], trimMaterial, { ballisticMaterial: "interior-wall" });
		const windscreenId = `high-seas-${end}-upper-windscreen-${flank}-glass`;
		box(builder, windscreenId, [
			midX,
			(APERTURE_BOTTOM + APERTURE_TOP) / 2,
			outerZ
		], [
			width - GLASS_EDGE_INSET * 2,
			APERTURE_HEIGHT - GLASS_EDGE_INSET * 2,
			GLAZING_HALF_THICKNESS * 2
		], glassMaterial, {
			shots: true,
			ballisticMaterial: "glass",
			breakableWindowId: windscreenId
		});
		if (width > 6) box(builder, `high-seas-${end}-upper-windscreen-${flank}-mullion`, [
			midX,
			upperY,
			outerZ
		], [
			.28,
			CABIN_UPPER_WALL_HEIGHT,
			.18
		], trimMaterial, { ballisticMaterial: "interior-wall" });
	}
	for (const [side, x] of [["port", -7.4], ["starboard", CABIN_HALF_WIDTH]]) {
		box(builder, `high-seas-${end}-upper-${side}-window-sill`, [
			x,
			HIGH_SEAS_LEVELS.upperDeck + .23,
			centerZ
		], [
			.22,
			.46,
			maxZ - minZ
		], trimMaterial, { ballisticMaterial: "interior-wall" });
		box(builder, `high-seas-${end}-upper-${side}-window-header`, [
			x,
			APERTURE_TOP + .27,
			centerZ
		], [
			.22,
			.54,
			maxZ - minZ
		], trimMaterial, { ballisticMaterial: "interior-wall" });
		const END_FACE_OFFSET = 7.89;
		const MULLION_HALF_DEPTH = .14;
		const bays = [];
		let bayCursor = -7.89;
		for (const centre of [
			-6.4,
			-2.25,
			2.25,
			6.4
		]) {
			const mullionMin = centre - MULLION_HALF_DEPTH;
			bays.push([bayCursor, mullionMin]);
			bayCursor = centre + MULLION_HALF_DEPTH;
		}
		bays.push([bayCursor, END_FACE_OFFSET]);
		let bayIndex = 0;
		for (const [bayMin, bayMax] of bays) {
			const sideGlassId = `high-seas-${end}-upper-${side}-glazing-${bayIndex}`;
			box(builder, sideGlassId, [
				x,
				(APERTURE_BOTTOM + APERTURE_TOP) / 2,
				centerZ + (bayMin + bayMax) / 2
			], [
				GLAZING_HALF_THICKNESS * 2,
				APERTURE_HEIGHT - GLASS_EDGE_INSET * 2,
				bayMax - bayMin - GLASS_EDGE_INSET * 2
			], glassMaterial, {
				shots: true,
				ballisticMaterial: "glass",
				breakableWindowId: sideGlassId
			});
			bayIndex += 1;
		}
		for (const segmentCenter of [
			centerZ - 6.4,
			centerZ - 2.25,
			centerZ + 2.25,
			centerZ + 6.4
		]) box(builder, `high-seas-${end}-upper-${side}-mullion-${segmentCenter}`, [
			x,
			upperY,
			segmentCenter
		], [
			.18,
			CABIN_UPPER_WALL_HEIGHT,
			.28
		], trimMaterial, { ballisticMaterial: "interior-wall" });
	}
	box(builder, `high-seas-${end}-cabin-roof`, [
		0,
		HIGH_SEAS_LEVELS.roof - .1,
		centerZ
	], [
		15.4,
		.2,
		16.6
	], roofMaterial, { ballisticMaterial: "structural-metal" });
	detailBox(builder, `high-seas-${end}-roof-teal-inlay`, [
		0,
		HIGH_SEAS_LEVELS.roof + .015,
		centerZ
	], [
		10.8,
		.035,
		10.6
	], trimMaterial);
	mergedDetailBoxes(builder, `high-seas-${end}-roof-fascia`, [...[centerZ - 8.3, centerZ + 8.3].map((fasciaZ) => ({
		center: [
			0,
			HIGH_SEAS_LEVELS.roof - .1,
			fasciaZ
		],
		size: [
			15.56,
			.36,
			.16
		]
	})), ...[-7.7, 7.7].map((fasciaX) => ({
		center: [
			fasciaX,
			HIGH_SEAS_LEVELS.roof - .1,
			centerZ
		],
		size: [
			.16,
			.36,
			16.76
		]
	}))], wallMaterial, "roof fascia wraps the deckhouse; the merged AABB spans end-wall portals it sits above");
	mergedDetailBoxes(builder, `high-seas-${end}-roof-inlay-border`, [...[centerZ - 5.45, centerZ + 5.45].map((borderZ) => ({
		center: [
			0,
			HIGH_SEAS_LEVELS.roof + .025,
			borderZ
		],
		size: [
			11.3,
			.05,
			.34
		]
	})), ...[-5.55, 5.55].map((borderX) => ({
		center: [
			borderX,
			HIGH_SEAS_LEVELS.roof + .025,
			centerZ
		],
		size: [
			.34,
			.05,
			11.1
		]
	}))], wallMaterial);
	detailBox(builder, `high-seas-${end}-cabin-ceiling`, [
		0,
		HIGH_SEAS_LEVELS.roof - .25,
		centerZ
	], [
		15,
		.08,
		16.2
	], ceilingMaterial);
	const setteeZ = direction * 24.5;
	const tableZ = direction * 18;
	const helmZ = direction * 27.9;
	mergedDetailBoxes(builder, `high-seas-${end}-upper-woodwork`, [
		{
			center: [
				-6.75,
				HIGH_SEAS_LEVELS.upperDeck + .19,
				setteeZ
			],
			size: [
				.8,
				.38,
				5
			]
		},
		{
			center: [
				6.6,
				HIGH_SEAS_LEVELS.upperDeck + .36,
				tableZ
			],
			size: [
				.9,
				.72,
				1.7
			]
		},
		{
			center: [
				0,
				HIGH_SEAS_LEVELS.upperDeck + .5,
				helmZ
			],
			size: [
				2.4,
				1,
				.45
			]
		}
	], trimMaterial, "upper-room woodwork shares the room AABB with the stair hole and door it is cleared from");
	mergedDetailBoxes(builder, `high-seas-${end}-upper-upholstery`, [
		{
			center: [
				-6.75,
				HIGH_SEAS_LEVELS.upperDeck + .45,
				setteeZ
			],
			size: [
				.78,
				.16,
				4.9
			]
		},
		{
			center: [
				-7.12,
				HIGH_SEAS_LEVELS.upperDeck + .75,
				setteeZ
			],
			size: [
				.14,
				.55,
				5
			]
		},
		{
			center: [
				0,
				HIGH_SEAS_LEVELS.upperDeck + 1.03,
				helmZ
			],
			size: [
				2.4,
				.08,
				.55
			]
		}
	], upholsteryMaterial, "upper-room upholstery shares the room AABB with the stair hole and door it is cleared from");
	detailBox(builder, `high-seas-${end}-upper-chart-table-top`, [
		6.6,
		HIGH_SEAS_LEVELS.upperDeck + .75,
		tableZ
	], [
		1.1,
		.06,
		1.9
	], deckMaterial);
	coverBox(builder, `high-seas-${end}-galley-island`, [
		0,
		3.76,
		direction * 16.4
	], [
		3.4,
		1.12,
		1.05
	], trimMaterial, "structural-metal");
	coverBox(builder, `high-seas-${end}-side-locker-port`, [
		-6.1,
		3.83,
		direction * 24.6
	], [
		1.55,
		1.26,
		2.3
	], wallMaterial, "interior-wall");
	coverBox(builder, `high-seas-${end}-side-locker-starboard`, [
		6.1,
		3.83,
		direction * 24.6
	], [
		1.55,
		1.26,
		2.3
	], wallMaterial, "interior-wall");
	for (const mastX of [-2.2, 2.2]) presentationMesh(builder, `high-seas-${end}-roof-antenna-${mastX}`, new CylinderGeometry(.055, .08, 1.4, 8), trimMaterial, [
		mastX,
		9.62,
		centerZ
	], [
		0,
		0,
		0
	], "quality");
	presentationMesh(builder, `high-seas-${end}-roof-radome`, new SphereGeometry(.58, 16, 10), roofMaterial, [
		0,
		9.36,
		centerZ
	], [
		0,
		0,
		0
	], "quality");
	return {
		internalRoute: [
			{
				id: `${end}-internal-main`,
				position: internalLow
			},
			{
				id: `${end}-internal-mid`,
				position: [
					internalX,
					4.7,
					direction * 18.3
				]
			},
			{
				id: `${end}-internal-upper`,
				position: internalHigh
			},
			{
				id: `${end}-upper-room`,
				position: [
					0,
					HIGH_SEAS_LEVELS.upperDeck,
					centerZ
				]
			}
		],
		externalRoute: [
			{
				id: `${end}-external-main`,
				position: externalLow
			},
			{
				id: `${end}-external-mid`,
				position: [
					externalX,
					4.7,
					direction * 31.5
				]
			},
			{
				id: `${end}-external-upper`,
				position: externalHigh
			},
			{
				id: `${end}-upper-room`,
				position: [
					0,
					HIGH_SEAS_LEVELS.upperDeck,
					centerZ
				]
			}
		],
		internalAccess,
		externalAccess
	};
}
function addEngineRoom(builder, floorMaterial, wallMaterial, machineryMaterial, accentMaterial, practicalMaterial) {
	addWalkableBox(builder, "engine-floor", [
		0,
		-.06,
		0
	], [
		5.8,
		.12,
		40.2
	], floorMaterial, HIGH_SEAS_LEVELS.engine, "bot").castShadow = false;
	const CORRIDOR_HALF = .72;
	const ROOM_HALF = 2.35;
	const VESTIBULE_HALF = 1.35;
	const WALL = .24;
	const ROOM_END = 6.5;
	const NARROW_END = 18.6;
	const FLOOR_END = 20.1;
	const wallY = 1.4;
	const wallHeight = 3.04;
	const solidWall = (name, position, size) => {
		box(builder, name, position, size, wallMaterial, { ballisticMaterial: "structural-metal" });
	};
	for (const [sideName, side] of [["port", -1], ["starboard", 1]]) {
		solidWall(`high-seas-engine-room-wall-${sideName}`, [
			side * 2.47,
			wallY,
			0
		], [
			WALL,
			wallHeight,
			ROOM_END * 2
		]);
		for (const [endName, direction] of [["bow", -1], ["stern", 1]]) {
			solidWall(`high-seas-engine-corridor-wall-${endName}-${sideName}`, [
				side * .84,
				wallY,
				direction * 25.1 / 2
			], [
				WALL,
				wallHeight,
				NARROW_END - ROOM_END
			]);
			solidWall(`high-seas-engine-vestibule-wall-${endName}-${sideName}`, [
				side * 1.4700000000000002,
				wallY,
				direction * 38.7 / 2
			], [
				WALL,
				wallHeight,
				FLOOR_END - NARROW_END
			]);
			solidWall(`high-seas-engine-room-shoulder-${endName}-${sideName}`, [
				side * (3.3100000000000005 / 2),
				wallY,
				direction * ROOM_END
			], [
				2.59 - CORRIDOR_HALF,
				wallHeight,
				WALL
			]);
			solidWall(`high-seas-engine-vestibule-shoulder-${endName}-${sideName}`, [
				side * (2.3100000000000005 / 2),
				wallY,
				direction * NARROW_END
			], [
				1.59 - CORRIDOR_HALF,
				wallHeight,
				WALL
			]);
			solidWall(`high-seas-engine-end-bulkhead-${endName}-${sideName}`, [
				side * 1.435,
				wallY,
				direction * 20.220000000000002
			], [
				.37,
				wallHeight,
				WALL
			]);
		}
	}
	const bow = addRamp(builder, "bow-engine-access", HIGH_SEAS_ENGINE_ACCESS.bowFoot, HIGH_SEAS_ENGINE_ACCESS.bowTop, HIGH_SEAS_ENGINE_ACCESS.width, floorMaterial, "structural-metal");
	const stern = addRamp(builder, "stern-engine-access", HIGH_SEAS_ENGINE_ACCESS.sternFoot, HIGH_SEAS_ENGINE_ACCESS.sternTop, HIGH_SEAS_ENGINE_ACCESS.width, floorMaterial, "structural-metal");
	addRampTreads(builder, "bow-engine-access", HIGH_SEAS_ENGINE_ACCESS.bowFoot, HIGH_SEAS_ENGINE_ACCESS.bowTop, HIGH_SEAS_ENGINE_ACCESS.width, floorMaterial);
	addRampTreads(builder, "stern-engine-access", HIGH_SEAS_ENGINE_ACCESS.sternFoot, HIGH_SEAS_ENGINE_ACCESS.sternTop, HIGH_SEAS_ENGINE_ACCESS.width, floorMaterial);
	for (const [end, z] of [["bow", -22.15], ["stern", 22.15]]) {
		for (const x of [-1.52, 1.52]) box(builder, `high-seas-${end}-hatch-guard-${x}`, [
			x,
			3.72,
			z
		], [
			.12,
			1.04,
			4.7
		], accentMaterial, { ballisticMaterial: "structural-metal" });
		box(builder, `high-seas-${end}-hatch-end-guard`, [
			0,
			3.72,
			end === "bow" ? -19.72 : 19.72
		], [
			3.1,
			1.04,
			.12
		], accentMaterial, { ballisticMaterial: "structural-metal" });
	}
	for (const [end, direction] of [["bow", -1], ["stern", 1]]) for (const [sideName, side] of [["port", -1], ["starboard", 1]]) box(builder, `high-seas-${end}-hatch-shaft-wall-${sideName}`, [
		side * 1.44,
		1.4,
		direction * 22.3
	], [
		.24,
		3.04,
		4.4
	], wallMaterial, { ballisticMaterial: "structural-metal" });
	for (const [end, direction] of [["bow", -1], ["stern", 1]]) {
		for (const [sideName, side] of [["port", -1], ["starboard", 1]]) box(builder, `high-seas-${end}-hatch-rim-${sideName}`, [
			side * 1.425,
			3.06,
			direction * 22.15
		], [
			.25,
			.28,
			4.8
		], floorMaterial, { ballisticMaterial: "structural-metal" });
		box(builder, `high-seas-${end}-hatch-rim-end`, [
			0,
			3.06,
			direction * 24.4
		], [
			3.1,
			.28,
			.3
		], floorMaterial, { ballisticMaterial: "structural-metal" });
	}
	const machineryLayout = [
		-4.6,
		-2.3,
		0,
		2.3,
		4.6
	];
	for (const [index, z] of machineryLayout.entries()) {
		const x = index % 2 === 0 ? -1.62 : 1.62;
		coverBox(builder, `high-seas-engine-machinery-${index}`, [
			x,
			.72,
			z
		], [
			1.18,
			1.44,
			2.15
		], machineryMaterial, "structural-metal");
	}
	coverBox(builder, "high-seas-engine-exhaust-trunk", [
		0,
		1.45,
		0
	], [
		.9,
		2.9,
		.9
	], machineryMaterial, "structural-metal");
	detailBox(builder, "high-seas-engine-exhaust-trunk-collar", [
		0,
		2.72,
		0
	], [
		1.12,
		.16,
		1.12
	], accentMaterial);
	mergedDetailBoxes(builder, "high-seas-engine-machinery-bands", machineryLayout.map((z, index) => ({
		center: [
			index % 2 === 0 ? -1.62 : 1.62,
			1.02,
			z
		],
		size: [
			1.24,
			.1,
			2.2
		]
	})), accentMaterial);
	mergedDetailBoxes(builder, "high-seas-engine-ceiling", [
		{
			center: [
				0,
				2.895,
				0
			],
			size: [
				ROOM_HALF * 2,
				.05,
				ROOM_END * 2
			]
		},
		{
			center: [
				0,
				2.895,
				-25.1 / 2
			],
			size: [
				CORRIDOR_HALF * 2,
				.05,
				NARROW_END - ROOM_END
			]
		},
		{
			center: [
				0,
				2.895,
				25.1 / 2
			],
			size: [
				CORRIDOR_HALF * 2,
				.05,
				NARROW_END - ROOM_END
			]
		},
		{
			center: [
				0,
				2.895,
				-19.175
			],
			size: [
				VESTIBULE_HALF * 2,
				.05,
				1.15
			]
		},
		{
			center: [
				0,
				2.895,
				19.175
			],
			size: [
				VESTIBULE_HALF * 2,
				.05,
				1.15
			]
		}
	], wallMaterial);
	const lightStrips = [];
	for (const z of [
		-5.2,
		-2.6,
		0,
		2.6,
		5.2
	]) lightStrips.push({
		center: [
			0,
			2.845,
			z
		],
		size: [
			2.6,
			.05,
			.16
		]
	});
	for (const side of [-1, 1]) lightStrips.push({
		center: [
			side * (ROOM_HALF - .3),
			2.845,
			0
		],
		size: [
			.16,
			.05,
			ROOM_END * 2 - .6
		]
	});
	for (const direction of [-1, 1]) {
		for (const z of [
			7.9,
			10.5,
			13.1,
			15.7
		]) lightStrips.push({
			center: [
				0,
				2.845,
				direction * z
			],
			size: [
				.16,
				.05,
				2
			]
		});
		lightStrips.push({
			center: [
				0,
				2.845,
				direction * 17.9
			],
			size: [
				.16,
				.05,
				1.2
			]
		});
		lightStrips.push({
			center: [
				0,
				2.845,
				direction * 19.35
			],
			size: [
				.16,
				.05,
				1.1
			]
		});
	}
	mergedDetailBoxes(builder, "high-seas-engine-light-strips", lightStrips, practicalMaterial);
	const guideStrips = [];
	for (const side of [-1, 1]) {
		guideStrips.push({
			center: [
				side * (ROOM_HALF - .05),
				.04,
				0
			],
			size: [
				.1,
				.08,
				ROOM_END * 2 - .4
			]
		});
		for (const direction of [-1, 1]) {
			guideStrips.push({
				center: [
					side * (CORRIDOR_HALF - .05),
					.04,
					direction * 25.1 / 2
				],
				size: [
					.1,
					.08,
					NARROW_END - ROOM_END - .4
				]
			});
			guideStrips.push({
				center: [
					side * (VESTIBULE_HALF - .05),
					.04,
					direction * 38.7 / 2
				],
				size: [
					.1,
					.08,
					FLOOR_END - NARROW_END - .2
				]
			});
		}
	}
	mergedDetailBoxes(builder, "high-seas-engine-floor-guide-strips", guideStrips, practicalMaterial);
	presentationMesh(builder, "high-seas-engine-service-pipes", concatGeometries([-.45, .45].map((x) => {
		const cylinder = new CylinderGeometry(.1, .1, 36, 10);
		cylinder.rotateX(Math.PI / 2);
		cylinder.translate(x, 0, 0);
		return cylinder;
	})), accentMaterial, [
		0,
		2.62,
		0
	]);
	return {
		bow,
		stern
	};
}
/**
* Dry hull interior liner.
*
* WHY. The sculpted hull is backface-culled presentation and the SHARED ocean
* plane runs straight through it at y=-2.2, so before this liner everything
* below deck outside the corridor read as open water. The liner authors a
* dark bilge floor above the expected wave envelope plus inner hull walls up
* to the deck underside, so the space under the deck reads as a boat's hull,
* not ocean. Players can never reach this volume - the service corridor is
* fully sealed - so the liner stays presentation-only, mirroring the sculpted
* hull's own authority model. Part extents stay inside the hull's chine line
* so nothing pokes through the visible hull above the waterline.
*/
function addHullBilge(builder, floorMaterial, wallMaterial) {
	const BILGE_TOP = -1.6;
	const floorY = BILGE_TOP - .06;
	const wallY = 1.3199999999999998 / 2;
	const wallHeight = 2.92 - BILGE_TOP;
	const linerReason = "concave-enclosing-liner-has-conservative-world-aabb";
	mergedDetailBoxes(builder, "high-seas-bilge-floor", [
		{
			center: [
				0,
				floorY,
				0
			],
			size: [
				15,
				.12,
				72
			]
		},
		{
			center: [
				0,
				floorY,
				-38.2
			],
			size: [
				13.6,
				.12,
				4.4
			]
		},
		{
			center: [
				0,
				floorY,
				39
			],
			size: [
				13.6,
				.12,
				6
			]
		}
	], floorMaterial, linerReason);
	mergedDetailBoxes(builder, "high-seas-bilge-hull-liner", [
		{
			center: [
				-7.44,
				wallY,
				0
			],
			size: [
				.12,
				wallHeight,
				72
			]
		},
		{
			center: [
				7.44,
				wallY,
				0
			],
			size: [
				.12,
				wallHeight,
				72
			]
		},
		{
			center: [
				-6.74,
				wallY,
				-38.2
			],
			size: [
				.12,
				wallHeight,
				4.4
			]
		},
		{
			center: [
				6.74,
				wallY,
				-38.2
			],
			size: [
				.12,
				wallHeight,
				4.4
			]
		},
		{
			center: [
				-6.74,
				wallY,
				39
			],
			size: [
				.12,
				wallHeight,
				6
			]
		},
		{
			center: [
				6.74,
				wallY,
				39
			],
			size: [
				.12,
				wallHeight,
				6
			]
		},
		{
			center: [
				-7.09,
				wallY,
				-36
			],
			size: [
				.82,
				wallHeight,
				.12
			]
		},
		{
			center: [
				7.09,
				wallY,
				-36
			],
			size: [
				.82,
				wallHeight,
				.12
			]
		},
		{
			center: [
				-7.09,
				wallY,
				36
			],
			size: [
				.82,
				wallHeight,
				.12
			]
		},
		{
			center: [
				7.09,
				wallY,
				36
			],
			size: [
				.82,
				wallHeight,
				.12
			]
		},
		{
			center: [
				0,
				wallY,
				-40.34
			],
			size: [
				13.6,
				wallHeight,
				.12
			]
		},
		{
			center: [
				0,
				wallY,
				41.94
			],
			size: [
				13.6,
				wallHeight,
				.12
			]
		}
	], wallMaterial, linerReason);
}
function addCenterFeatures(builder, wallMaterial, trimMaterial, upholsteryMaterial, waterMaterial) {
	const tubCenterX = -5.45;
	const tubRadius = 2.55;
	for (let index = 0; index < 12; index += 1) {
		if (index === 0 || index === 6) continue;
		const theta = index * Math.PI * 2 / 12;
		coverBox(builder, `high-seas-hot-tub-rim-${index}`, [
			tubCenterX + Math.cos(theta) * tubRadius,
			3.67,
			Math.sin(theta) * tubRadius
		], [
			1.42,
			.9,
			.34
		], wallMaterial, "reinforced", [
			0,
			-theta - Math.PI / 2,
			0
		]);
	}
	const tubWater = presentationMesh(builder, "high-seas-hot-tub-contained-water", new CircleGeometry(2.15, 32), waterMaterial, [
		tubCenterX,
		3.28,
		0
	], [
		-Math.PI / 2,
		0,
		0
	]);
	tubWater.userData.waterScope = "contained-feature-only";
	tubWater.userData.containedWaterFeature = "hot-tub";
	coverBox(builder, "high-seas-shower-port-partition", [
		-1.08,
		4.22,
		-1.15
	], [
		.2,
		2.04,
		3.7
	], wallMaterial, "interior-wall");
	coverBox(builder, "high-seas-shower-starboard-partition", [
		1.08,
		4.22,
		1.15
	], [
		.2,
		2.04,
		3.7
	], wallMaterial, "interior-wall");
	detailBox(builder, "high-seas-shower-canopy", [
		0,
		5.35,
		0
	], [
		3.2,
		.18,
		5.8
	], trimMaterial);
	box(builder, "high-seas-cabana-roof", [
		6.55,
		5.48,
		0
	], [
		6.1,
		.2,
		8
	], wallMaterial, { ballisticMaterial: "structural-metal" });
	for (const x of [3.75, 9.35]) for (const z of [-3.65, 3.65]) box(builder, `high-seas-cabana-post-${x}-${z}`, [
		x,
		4.34,
		z
	], [
		.18,
		2.28,
		.18
	], trimMaterial, { ballisticMaterial: "structural-metal" });
	coverBox(builder, "high-seas-cabana-bench-forward", [
		6.55,
		3.66,
		-3
	], [
		4.15,
		.92,
		.88
	], upholsteryMaterial, "interior-wall");
	coverBox(builder, "high-seas-cabana-bench-aft", [
		6.55,
		3.66,
		3
	], [
		4.15,
		.92,
		.88
	], upholsteryMaterial, "interior-wall");
	detailBox(builder, "high-seas-cabana-table", [
		6.55,
		3.62,
		0
	], [
		1.8,
		.82,
		1.15
	], trimMaterial);
}
function addSpawnFeatures(builder, wallMaterial, trimMaterial, waterMaterial) {
	const landingRing = presentationMesh(builder, "high-seas-bow-emergency-circle", new RingGeometry(2.7, 2.94, 48), trimMaterial, [
		0,
		3.215,
		-35.8
	], [
		-Math.PI / 2,
		0,
		0
	]);
	landingRing.userData.markingLanguage = "original-unbranded-emergency-circle";
	for (const [index, rotationY] of [
		0,
		Math.PI / 3,
		-Math.PI / 3
	].entries()) detailBox(builder, `high-seas-bow-circle-spoke-${rotationY}`, [
		0,
		3.22 + index * .007,
		-35.8
	], [
		.16,
		.025,
		4.8
	], trimMaterial, [
		0,
		rotationY,
		0
	]);
	box(builder, "high-seas-bow-canopy", [
		0,
		5.66,
		-31.2
	], [
		7.4,
		.24,
		3.2
	], wallMaterial, { ballisticMaterial: "structural-metal" });
	for (const x of [-3.25, 3.25]) box(builder, `high-seas-bow-canopy-post-${x}`, [
		x,
		4.42,
		-31.2
	], [
		.2,
		2.48,
		.2
	], trimMaterial, { ballisticMaterial: "structural-metal" });
	const poolWater = presentationMesh(builder, "high-seas-stern-pool-contained-water", new PlaneGeometry(5.35, 4.55), waterMaterial, [
		0,
		3.27,
		36
	], [
		-Math.PI / 2,
		0,
		0
	]);
	poolWater.userData.waterScope = "contained-feature-only";
	poolWater.userData.containedWaterFeature = "stern-pool";
	coverBox(builder, "high-seas-stern-pool-rim-port", [
		-2.92,
		3.61,
		36
	], [
		.42,
		.82,
		5.3
	], wallMaterial, "reinforced");
	coverBox(builder, "high-seas-stern-pool-rim-starboard", [
		2.92,
		3.61,
		36
	], [
		.42,
		.82,
		5.3
	], wallMaterial, "reinforced");
	for (const [side, x] of [["port", -1.92], ["starboard", 1.92]]) {
		coverBox(builder, `high-seas-stern-pool-rim-forward-${side}`, [
			x,
			3.61,
			33.36
		], [
			1.65,
			.82,
			.42
		], wallMaterial, "reinforced");
		coverBox(builder, `high-seas-stern-pool-rim-aft-${side}`, [
			x,
			3.61,
			38.64
		], [
			1.65,
			.82,
			.42
		], wallMaterial, "reinforced");
	}
	for (const [end, z] of [["bow", -31], ["stern", 31]]) for (const [side, x] of [["port", -8.45], ["starboard", 8.45]]) coverBox(builder, `high-seas-${end}-rescue-locker-${side}`, [
		x,
		3.78,
		z
	], [
		1.25,
		1.16,
		1.7
	], trimMaterial, "structural-metal");
}
function addRails(builder, railMaterial, deckMaterial, capMaterial) {
	const caprailParts = [];
	const addRail = (id, x, z, width, depth) => {
		box(builder, `high-seas-perimeter-rail-${id}`, [
			x,
			3.72,
			z
		], [
			width,
			1.04,
			depth
		], railMaterial, { ballisticMaterial: "thin-metal" });
		caprailParts.push({
			center: [
				x,
				4.28,
				z
			],
			size: [
				width,
				.08,
				depth
			]
		});
	};
	addRail("starboard", 10.34, 1.48, .12, 83.72);
	addRail("port-bow", -10.34, -25.85, .12, 29.3);
	addRail("port-center-outer", -11.73, 0, .12, 22);
	addRail("port-stern", -10.34, 27.35, .12, 32.3);
	addRail("bow-tip-port", -3.94, -42.18, .12, 3.24);
	addRail("bow-tip-starboard", 3.94, -42.18, .12, 3.24);
	addRail("bow-shoulder-port", -7.17, -40.56, 6.46, .12);
	addRail("bow-shoulder-starboard", 7.17, -40.56, 6.46, .12);
	addRail("bow-tip", 0, -43.82, 8, .12);
	addRail("stern", 0, 43.48, 20.7, .12);
	mergedDetailBoxes(builder, "high-seas-perimeter-caprail-band", caprailParts, capMaterial, "caprail dressing rings the hull; the merged AABB spans every portal without intersecting any aperture");
	for (const z of [-10.8, 10.8]) box(builder, `high-seas-catwalk-threshold-${z}`, [
		-11,
		3.46,
		z
	], [
		1.48,
		.52,
		.16
	], railMaterial, { ballisticMaterial: "thin-metal" });
	const starboardStanchionParts = [];
	for (let z = -40; z <= 40; z += 5) {
		if (z >= -10 && z <= 10) continue;
		starboardStanchionParts.push({
			center: [
				10.26,
				4.42,
				z
			],
			size: [
				.06,
				.58,
				.06
			]
		});
	}
	mergedDetailBoxes(builder, "high-seas-starboard-stanchions", starboardStanchionParts, railMaterial);
	const catwalkStanchionParts = [];
	for (const z of [
		-8,
		-4,
		0,
		4,
		8
	]) catwalkStanchionParts.push({
		center: [
			-11.66,
			4.42,
			z
		],
		size: [
			.06,
			.58,
			.06
		]
	});
	mergedDetailBoxes(builder, "high-seas-catwalk-stanchions", catwalkStanchionParts, railMaterial);
	detailBox(builder, "high-seas-port-catwalk-teak-inlay", [
		-11,
		3.215,
		0
	], [
		1.18,
		.025,
		20.8
	], deckMaterial);
}
function portalAudit(builder, portals) {
	const overlaps = (aperture, bounds) => {
		const epsilon = 1e-4;
		return aperture.minX < bounds.maxX - epsilon && aperture.maxX > bounds.minX + epsilon && aperture.minY < (bounds.maxY ?? Number.POSITIVE_INFINITY) - epsilon && aperture.maxY > (bounds.minY ?? Number.NEGATIVE_INFINITY) + epsilon && aperture.minZ < bounds.maxZ - epsilon && aperture.maxZ > bounds.minZ + epsilon;
	};
	builder.root.updateMatrixWorld(true);
	const presentationMeshes = [];
	builder.root.traverse((node) => {
		if (node instanceof Mesh && node.userData.highSeasPresentationOnly === true && node.userData.portalAuditExcluded !== true) presentationMeshes.push(node);
	});
	return portals.map((portal) => {
		const opaquePresentationBlockerNames = presentationMeshes.flatMap((mesh) => {
			if (!(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some((entry) => entry.visible && (!entry.transparent || entry.opacity >= .8))) return [];
			const bounds3 = new Box3().setFromObject(mesh);
			const bounds = {
				minX: bounds3.min.x,
				maxX: bounds3.max.x,
				minY: bounds3.min.y,
				maxY: bounds3.max.y,
				minZ: bounds3.min.z,
				maxZ: bounds3.max.z
			};
			return overlaps(portal.aperture, bounds) ? [mesh.name] : [];
		});
		return Object.freeze({
			id: portal.id,
			movementBlockers: builder.physicsColliders.filter((bounds) => overlaps(portal.aperture, bounds)).length,
			shotBlockers: builder.shotSurfaces.filter((surface) => overlaps(portal.aperture, surface.bounds)).length,
			opaquePresentationBlockers: opaquePresentationBlockerNames.length,
			opaquePresentationBlockerNames: Object.freeze(opaquePresentationBlockerNames.sort())
		});
	});
}
function spawnRecord() {
	const stern = [
		[-9, 34],
		[-9, 40],
		[-3, 40.2],
		[3, 40.2],
		[9, 40],
		[9, 34]
	];
	const bow = stern.map(([x, z]) => [-x, -z]);
	const create = (entries) => entries.map(([x, z]) => new Vector3(x, HIGH_SEAS_LEVELS.mainDeck + 1.7, z));
	return {
		0: create(stern),
		1: create(bow)
	};
}
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
function buildHighSeas(scene) {
	const root = new Group();
	root.name = "High Seas original ocean yacht arena";
	scene.add(root);
	const builder = {
		root,
		colliders: [],
		physicsColliders: [],
		raycastMeshes: [],
		shotSurfaces: [],
		physicalCover: [],
		breakableWindows: [],
		authorities: [],
		walkable: [],
		ballisticSurfaceSequence: 0
	};
	const hullMaterial = material("pearl-hull", 15397359, .28, .22);
	const wallMaterial = material("warm-cabin-shell", 16118761, .45, .08);
	const roofMaterial = material("silver-roof", 13358805, .3, .48);
	const tealTrimMaterial = material("deep-teal-trim", 3108992, .32, .08);
	const stairMaterial = material("dark-deck-stair", 7033408, .76, .08);
	const deckMaterial = material("honey-deck", 11047006, .7, .08);
	const engineWallMaterial = applyEnclosedVolumeFill(material("engine-bulkhead", 6058104, .52, BELOW_DECK_METALNESS.bulkhead), BELOW_DECK_FILL.bulkhead);
	const engineFloorMaterial = applyEnclosedVolumeFill(material("engine-grating", 5136487, .46, BELOW_DECK_METALNESS.grating), BELOW_DECK_FILL.grating);
	const engineMachineMaterial = applyEnclosedVolumeFill(material("engine-machinery", 7833483, .38, BELOW_DECK_METALNESS.machinery), BELOW_DECK_FILL.machinery);
	const engineAccentMaterial = material("engine-amber", 14132289, .34, .52, 7158792, .65);
	const enginePracticalMaterial = createPracticalMaterial();
	const upholsteryMaterial = material("cabana-upholstery", 4949904, .76, .04);
	const cabinCeilingMaterial = material("cabin-ceiling", 15263194, .62, .03, 9078138, .22);
	if (cabinCeilingMaterial.map) cabinCeilingMaterial.emissiveMap = cabinCeilingMaterial.map;
	cabinCeilingMaterial.name = "high-seas-cabin-ceiling";
	const glassTextures = generateMaterialTextureSet("glass", 2047302);
	const glassMaterial = new MeshStandardMaterial({
		color: 2047302,
		roughness: .1,
		metalness: .05,
		transparent: true,
		opacity: .4,
		depthWrite: false,
		...glassTextures.normalMap ? { normalMap: glassTextures.normalMap } : {},
		...glassTextures.roughnessMap ? { roughnessMap: glassTextures.roughnessMap } : {}
	});
	glassMaterial.name = "high-seas-side-glass";
	glassMaterial.emissive = new Color(4537902);
	glassMaterial.emissiveIntensity = .9;
	glassMaterial.userData.assetOwner = "high-seas";
	glassMaterial.userData.assetKind = "procedural-original-material";
	glassMaterial.userData.textureFamily = "glass";
	const waterMaterial = containedWaterMaterial("contained-feature-water", 2996676);
	const hull = presentationMesh(builder, "high-seas-sculpted-hull", createHullGeometry(), hullMaterial, [
		0,
		0,
		0
	]);
	hull.userData.sharedOceanExpectedAtY = HIGH_SEAS_LEVELS.ocean;
	hull.userData.collisionRole = "presentation-around-authoritative-decks-and-bounds";
	hull.userData.portalAuditExcluded = true;
	hull.userData.portalAuditExclusionReason = "concave-enclosing-shell-has-conservative-world-aabb";
	addDecks(builder, deckMaterial);
	const engine = addEngineRoom(builder, engineFloorMaterial, engineWallMaterial, engineMachineMaterial, engineAccentMaterial, enginePracticalMaterial);
	addHullBilge(builder, engineFloorMaterial, engineWallMaterial);
	const bowCabin = addCabin(builder, "bow", wallMaterial, deckMaterial, roofMaterial, stairMaterial, tealTrimMaterial, glassMaterial, cabinCeilingMaterial, upholsteryMaterial);
	const sternCabin = addCabin(builder, "stern", wallMaterial, deckMaterial, roofMaterial, stairMaterial, tealTrimMaterial, glassMaterial, cabinCeilingMaterial, upholsteryMaterial);
	addCenterFeatures(builder, wallMaterial, tealTrimMaterial, upholsteryMaterial, waterMaterial);
	addSpawnFeatures(builder, wallMaterial, tealTrimMaterial, waterMaterial);
	addRails(builder, tealTrimMaterial, deckMaterial, wallMaterial);
	const routes = Object.freeze({
		"surface-port": Object.freeze([
			{
				id: "bow-port-spawn",
				position: [
					-8.8,
					3.2,
					-34
				]
			},
			{
				id: "bow-port-walkway",
				position: [
					-9,
					3.2,
					-20
				]
			},
			{
				id: "port-catwalk-bow",
				position: [
					-11,
					3.2,
					-9
				]
			},
			{
				id: "port-catwalk-center",
				position: [
					-11,
					3.2,
					0
				]
			},
			{
				id: "port-catwalk-stern",
				position: [
					-11,
					3.2,
					9
				]
			},
			{
				id: "stern-port-walkway",
				position: [
					-9,
					3.2,
					20
				]
			},
			{
				id: "stern-port-spawn",
				position: [
					-8.8,
					3.2,
					34
				]
			}
		]),
		"surface-center": Object.freeze([
			{
				id: "bow-center-spawn",
				position: [
					0,
					3.2,
					-36
				]
			},
			{
				id: "bow-cabin-entry",
				position: [
					0,
					3.2,
					-28.5
				]
			},
			{
				id: "bow-cabin-exit",
				position: [
					0,
					3.2,
					-13.5
				]
			},
			{
				id: "center-shower-bow",
				position: [
					0,
					3.2,
					-5.2
				]
			},
			{
				id: "center-shower-port-weave",
				position: [
					-.45,
					3.2,
					-.1
				]
			},
			{
				id: "center-shower-stern",
				position: [
					0,
					3.2,
					5.2
				]
			},
			{
				id: "stern-cabin-entry",
				position: [
					0,
					3.2,
					13.5
				]
			},
			{
				id: "stern-cabin-exit",
				position: [
					0,
					3.2,
					28.5
				]
			},
			{
				id: "stern-center-spawn",
				position: [
					0,
					3.2,
					31
				]
			}
		]),
		"surface-starboard": Object.freeze([
			{
				id: "bow-starboard-spawn",
				position: [
					8.8,
					3.2,
					-34
				]
			},
			{
				id: "bow-starboard-walkway",
				position: [
					9,
					3.2,
					-20
				]
			},
			{
				id: "starboard-cabana-bow",
				position: [
					9.6,
					3.2,
					-8.5
				]
			},
			{
				id: "starboard-cabana-center",
				position: [
					9.6,
					3.2,
					0
				]
			},
			{
				id: "starboard-cabana-stern",
				position: [
					9.6,
					3.2,
					8.5
				]
			},
			{
				id: "stern-starboard-walkway",
				position: [
					9,
					3.2,
					20
				]
			},
			{
				id: "stern-starboard-spawn",
				position: [
					8.8,
					3.2,
					34
				]
			}
		]),
		"engine-through-route": Object.freeze([
			{
				id: "bow-engine-top",
				position: HIGH_SEAS_ENGINE_ACCESS.bowTop
			},
			{
				id: "bow-engine-ramp-mid",
				position: [
					0,
					1.6,
					-22.2
				]
			},
			{
				id: "bow-engine-foot",
				position: HIGH_SEAS_ENGINE_ACCESS.bowFoot
			},
			{
				id: "engine-forward",
				position: [
					0,
					0,
					-12
				]
			},
			{
				id: "engine-room-bow-mouth",
				position: [
					0,
					0,
					-7.2
				]
			},
			{
				id: "engine-trunk-bypass-starboard",
				position: [
					1.5,
					0,
					0
				]
			},
			{
				id: "engine-room-stern-mouth",
				position: [
					0,
					0,
					7.2
				]
			},
			{
				id: "engine-aft",
				position: [
					0,
					0,
					12
				]
			},
			{
				id: "stern-engine-foot",
				position: HIGH_SEAS_ENGINE_ACCESS.sternFoot
			},
			{
				id: "stern-engine-ramp-mid",
				position: [
					0,
					1.6,
					22.2
				]
			},
			{
				id: "stern-engine-top",
				position: HIGH_SEAS_ENGINE_ACCESS.sternTop
			}
		]),
		"bow-upper-internal-player": Object.freeze(bowCabin.internalRoute),
		"bow-upper-external-player": Object.freeze(bowCabin.externalRoute),
		"stern-upper-internal-player": Object.freeze(sternCabin.internalRoute),
		"stern-upper-external-player": Object.freeze(sternCabin.externalRoute)
	});
	const portals = Object.freeze([
		{
			id: "bow-ground-inner",
			purpose: "movement",
			aperture: {
				minX: -1.5,
				maxX: 1.5,
				minY: 3.3,
				maxY: 5.72,
				minZ: -13.16,
				maxZ: -12.84
			}
		},
		{
			id: "bow-ground-outer",
			purpose: "movement",
			aperture: {
				minX: -1.5,
				maxX: 1.5,
				minY: 3.3,
				maxY: 5.72,
				minZ: -29.16,
				maxZ: -28.84
			}
		},
		{
			id: "stern-ground-inner",
			purpose: "movement",
			aperture: {
				minX: -1.5,
				maxX: 1.5,
				minY: 3.3,
				maxY: 5.72,
				minZ: 12.84,
				maxZ: 13.16
			}
		},
		{
			id: "stern-ground-outer",
			purpose: "movement",
			aperture: {
				minX: -1.5,
				maxX: 1.5,
				minY: 3.3,
				maxY: 5.72,
				minZ: 28.84,
				maxZ: 29.16
			}
		},
		{
			id: "bow-port-side-door",
			purpose: "movement",
			aperture: {
				minX: -7.56,
				maxX: -7.24,
				minY: 3.3,
				maxY: 5.72,
				minZ: -22.4,
				maxZ: -19.6
			}
		},
		{
			id: "bow-starboard-side-door",
			purpose: "movement",
			aperture: {
				minX: 7.24,
				maxX: 7.56,
				minY: 3.3,
				maxY: 5.72,
				minZ: -22.4,
				maxZ: -19.6
			}
		},
		{
			id: "stern-port-side-door",
			purpose: "movement",
			aperture: {
				minX: -7.56,
				maxX: -7.24,
				minY: 3.3,
				maxY: 5.72,
				minZ: 19.6,
				maxZ: 22.4
			}
		},
		{
			id: "stern-starboard-side-door",
			purpose: "movement",
			aperture: {
				minX: 7.24,
				maxX: 7.56,
				minY: 3.3,
				maxY: 5.72,
				minZ: 19.6,
				maxZ: 22.4
			}
		},
		{
			id: "bow-upper-external-door",
			purpose: "movement",
			aperture: {
				minX: -5.55,
				maxX: -3.65,
				minY: 6.3,
				maxY: 8.3,
				minZ: -29.16,
				maxZ: -28.84
			}
		},
		{
			id: "stern-upper-external-door",
			purpose: "movement",
			aperture: {
				minX: 3.65,
				maxX: 5.55,
				minY: 6.3,
				maxY: 8.3,
				minZ: 28.84,
				maxZ: 29.16
			}
		},
		{
			id: "bow-engine-foot",
			purpose: "engine-access",
			aperture: {
				minX: -1.05,
				maxX: 1.05,
				minY: .34,
				maxY: 2.54,
				minZ: -19.4,
				maxZ: -19.08
			}
		},
		{
			id: "stern-engine-foot",
			purpose: "engine-access",
			aperture: {
				minX: -1.05,
				maxX: 1.05,
				minY: .34,
				maxY: 2.54,
				minZ: 19.08,
				maxZ: 19.4
			}
		},
		{
			id: "bow-engine-top",
			purpose: "engine-access",
			aperture: {
				minX: -1.05,
				maxX: 1.05,
				minY: 3.31,
				maxY: 5.42,
				minZ: -24.42,
				maxZ: -24.02
			}
		},
		{
			id: "stern-engine-top",
			purpose: "engine-access",
			aperture: {
				minX: -1.05,
				maxX: 1.05,
				minY: 3.31,
				maxY: 5.42,
				minZ: 24.02,
				maxZ: 24.42
			}
		}
	]);
	const verticalNavigation = Object.freeze({
		routes: Object.freeze([
			{
				id: "bow-engine-access",
				foot: HIGH_SEAS_ENGINE_ACCESS.bowFoot,
				top: HIGH_SEAS_ENGINE_ACCESS.bowTop
			},
			{
				id: "stern-engine-access",
				foot: HIGH_SEAS_ENGINE_ACCESS.sternFoot,
				top: HIGH_SEAS_ENGINE_ACCESS.sternTop
			},
			{
				id: "bow-internal-stair",
				foot: [
					4.6,
					3.2,
					-15.9
				],
				top: [
					4.6,
					6.2,
					-20.7
				]
			},
			{
				id: "bow-external-stair",
				foot: [
					-4.6,
					3.2,
					-33.9
				],
				top: [
					-4.6,
					6.2,
					-29.1
				]
			},
			{
				id: "stern-internal-stair",
				foot: [
					-4.6,
					3.2,
					15.9
				],
				top: [
					-4.6,
					6.2,
					20.7
				]
			},
			{
				id: "stern-external-stair",
				foot: [
					4.6,
					3.2,
					33.9
				],
				top: [
					4.6,
					6.2,
					29.1
				]
			}
		]),
		ramps: Object.freeze([
			{
				id: "bow-engine-access",
				from: HIGH_SEAS_ENGINE_ACCESS.bowFoot,
				to: HIGH_SEAS_ENGINE_ACCESS.bowTop,
				width: HIGH_SEAS_ENGINE_ACCESS.width
			},
			{
				id: "stern-engine-access",
				from: HIGH_SEAS_ENGINE_ACCESS.sternFoot,
				to: HIGH_SEAS_ENGINE_ACCESS.sternTop,
				width: HIGH_SEAS_ENGINE_ACCESS.width
			},
			{
				id: "bow-internal-stair",
				from: [
					4.6,
					3.2,
					-15.9
				],
				to: [
					4.6,
					6.2,
					-20.7
				],
				width: 1.8
			},
			{
				id: "bow-external-stair",
				from: [
					-4.6,
					3.2,
					-33.9
				],
				to: [
					-4.6,
					6.2,
					-29.1
				],
				width: 1.8
			},
			{
				id: "stern-internal-stair",
				from: [
					-4.6,
					3.2,
					15.9
				],
				to: [
					-4.6,
					6.2,
					20.7
				],
				width: 1.8
			},
			{
				id: "stern-external-stair",
				from: [
					4.6,
					3.2,
					33.9
				],
				to: [
					4.6,
					6.2,
					29.1
				],
				width: 1.8
			}
		]),
		platforms: Object.freeze(builder.walkable.map((entry) => Object.freeze({
			id: entry.id,
			minX: entry.bounds.minX,
			maxX: entry.bounds.maxX,
			minZ: entry.bounds.minZ,
			maxZ: entry.bounds.maxZ,
			y: entry.y
		})))
	});
	const patrolPoints = [
		[
			-8.8,
			3.2,
			-36
		],
		[
			0,
			3.2,
			-34
		],
		[
			8.8,
			3.2,
			-36
		],
		[
			-9,
			3.2,
			-25
		],
		[
			-9,
			3.2,
			-16
		],
		[
			0,
			3.2,
			-27.5
		],
		[
			0,
			3.2,
			-14.5
		],
		[
			9,
			3.2,
			-25
		],
		[
			9,
			3.2,
			-16
		],
		[
			-11,
			3.2,
			-8
		],
		[
			-11,
			3.2,
			0
		],
		[
			-11,
			3.2,
			8
		],
		[
			0,
			3.2,
			-7
		],
		[
			0,
			3.2,
			7
		],
		[
			9.5,
			3.2,
			-8
		],
		[
			9.5,
			3.2,
			0
		],
		[
			9.5,
			3.2,
			8
		],
		[
			-9,
			3.2,
			16
		],
		[
			-9,
			3.2,
			25
		],
		[
			0,
			3.2,
			14.5
		],
		[
			0,
			3.2,
			27.5
		],
		[
			9,
			3.2,
			16
		],
		[
			9,
			3.2,
			25
		],
		[
			-8.8,
			3.2,
			36
		],
		[
			0,
			3.2,
			31
		],
		[
			8.8,
			3.2,
			36
		],
		[
			0,
			0,
			-20
		],
		[
			0,
			0,
			-12
		],
		[
			0,
			0,
			0
		],
		[
			0,
			0,
			12
		],
		[
			0,
			0,
			20
		]
	];
	root.userData.verticalNavigation = verticalNavigation;
	root.userData.highSeasRoutes = routes;
	root.userData.highSeasPortals = portals;
	root.userData.highSeasPortalAudit = Object.freeze(portalAudit(builder, portals));
	root.userData.highSeasSupportAudit = Object.freeze({
		version: "pass75-shared-platform-authority-v1",
		engineFloor: Object.freeze({
			y: HIGH_SEAS_LEVELS.engine,
			physicsAuthority: "high-seas-platform-engine-floor",
			presentationName: "high-seas-platform-engine-floor"
		}),
		platforms: Object.freeze(builder.walkable.map((entry) => Object.freeze({
			id: entry.id,
			presentationName: entry.presentationName,
			bounds: { ...entry.bounds },
			y: entry.y,
			navigation: entry.navigation,
			movementAuthority: builder.colliders.includes(entry.bounds),
			physicsAuthority: builder.physicsColliders.includes(entry.bounds),
			shotAuthority: builder.shotSurfaces.some((surface) => surface.id === entry.ballisticSurfaceId)
		})))
	});
	root.userData.highSeasAuthorityAudit = Object.freeze(builder.authorities.map((entry) => Object.freeze({
		name: entry.name,
		bounds: { ...entry.bounds },
		solid: entry.solid,
		shots: entry.shots,
		movementAuthority: !entry.solid || builder.colliders.includes(entry.bounds),
		physicsAuthority: !entry.solid || builder.physicsColliders.includes(entry.bounds),
		raycastAuthority: !entry.shots || builder.raycastMeshes.includes(entry.mesh),
		ballisticAuthority: !entry.shots || builder.shotSurfaces.some((surface) => surface.id === entry.ballisticSurfaceId),
		ballisticSurfaceId: entry.ballisticSurfaceId,
		externalPhysicsAuthority: entry.externalPhysicsAuthority
	})));
	root.userData.highSeasAccess = Object.freeze({
		maximumPlayerClimbDegrees: 50,
		engineRampDegrees: engine.bow.angleDegrees,
		engineRampSymmetryError: Math.abs(engine.bow.angleDegrees - engine.stern.angleDegrees),
		internalStairDegrees: [bowCabin.internalAccess.angleDegrees, sternCabin.internalAccess.angleDegrees],
		externalStairDegrees: [bowCabin.externalAccess.angleDegrees, sternCabin.externalAccess.angleDegrees],
		upperStoreys: "bot-pursuit-capable-no-routine-patrols"
	});
	root.userData.highSeasProvenance = Object.freeze({
		version: "pass75-clean-room-v1",
		ownership: "original-procedural",
		functionalReferenceBoundary: "publicly-described-narrow-yacht-topology-only",
		copiedAssets: Object.freeze([]),
		runtimeBranding: "high-seas-original-only",
		surroundingWaterAuthority: "shared-water-authoring-path",
		expectedWaveEnvelope: Object.freeze({
			minimumY: -2.55,
			maximumY: -1.85
		}),
		safetyFloorY: -6,
		containedWaterFeatures: Object.freeze(["hot-tub", "stern-pool"])
	});
	root.userData.highSeasReviewCameras = Object.freeze([
		{
			id: "high-seas-overview",
			position: [
				28,
				24,
				50
			],
			target: [
				0,
				3.2,
				0
			],
			purpose: "overview"
		},
		{
			id: "high-seas-center-deck",
			position: [
				10,
				5.2,
				6
			],
			target: [
				-2,
				4,
				0
			],
			purpose: "topology"
		},
		{
			id: "high-seas-port-catwalk",
			position: [
				-11.3,
				4.9,
				10
			],
			target: [
				-10.8,
				4.2,
				-10
			],
			purpose: "route"
		},
		{
			id: "high-seas-opposed-cabins",
			position: [
				0,
				7.9,
				10.5
			],
			target: [
				0,
				7.9,
				-10.5
			],
			purpose: "sightline"
		},
		{
			id: "high-seas-engine-corridor",
			position: [
				0,
				1.55,
				19
			],
			target: [
				0,
				1.4,
				-19
			],
			purpose: "route"
		},
		{
			id: "high-seas-engine-open-portal",
			position: [
				0,
				1.6,
				-18
			],
			target: [
				0,
				2.2,
				-24
			],
			purpose: "portal"
		},
		{
			id: "high-seas-engine-wall-closed",
			position: [
				1.7,
				1.5,
				0
			],
			target: [
				2.45,
				1.5,
				0
			],
			purpose: "light-occlusion"
		},
		{
			id: "high-seas-engine-room-bulge",
			position: [
				1.9,
				2.4,
				-5.9
			],
			target: [
				-1.6,
				.9,
				4.2
			],
			purpose: "topology"
		}
	]);
	root.userData.highSeasMaterialInventory = Object.freeze(getHighSeasMaterialInventory());
	root.userData.highSeasBelowDeckLighting = Object.freeze({
		version: "pass77-service-deck-practical-rig-v1",
		policy: "definition-shadowed-local-practicals-plus-residual-emissive-fill",
		arenaRootAddsThreeLights: false,
		deckPlaneY: HIGH_SEAS_LEVELS.mainDeck,
		metalness: Object.freeze({ ...BELOW_DECK_METALNESS }),
		practical: Object.freeze({
			material: enginePracticalMaterial.name,
			emissiveIntensity: enginePracticalMaterial.emissiveIntensity,
			fixtures: Object.freeze(["high-seas-engine-light-strips", "high-seas-engine-floor-guide-strips"])
		}),
		fill: Object.freeze([
			engineWallMaterial,
			engineFloorMaterial,
			engineMachineMaterial
		].map((entry) => Object.freeze({
			material: entry.name,
			emissiveIntensity: entry.emissiveIntensity,
			texturedEmissive: entry.emissiveMap !== null
		}))),
		sharedAccent: Object.freeze({
			material: engineAccentMaterial.name,
			emissiveIntensity: engineAccentMaterial.emissiveIntensity
		})
	});
	return {
		id: "high-seas",
		label: "High Seas",
		root,
		colliders: builder.colliders,
		physicsColliders: builder.physicsColliders,
		raycastMeshes: builder.raycastMeshes,
		shotSurfaces: builder.shotSurfaces,
		spawns: spawnRecord(),
		patrolPoints: patrolPoints.map(([x, y, z]) => new Vector3(x, y, z)),
		targets: [],
		houses: [],
		breakableWindows: builder.breakableWindows,
		physicalCover: builder.physicalCover,
		bounds: { ...HIGH_SEAS_BOUNDS },
		physicsSafetyFloorY: -6,
		houseTelemetry: emptyTelemetry()
	};
}
//#endregion
export { buildHighSeas as n, HIGH_SEAS_LEVELS as t };
