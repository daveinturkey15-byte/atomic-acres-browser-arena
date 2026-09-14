import { Hs as ImageLoader, Sd as SRGBColorSpace, Za as CanvasTexture, jc as LinearFilter, md as RepeatWrapping, no as ClampToEdgeWrapping, sf as Texture } from "./vendor-three-aHPbjK02.js";
//#region src/rendering/sky-backdrop.ts
var SKY_BACKDROP_TEXTURE_SIZE = Object.freeze({
	width: 2048,
	height: 1024
});
var ATOMIC_ACRES_GENERATED_SKY_ASSET_URL = "./assets/original/skies/atomic-acres-sunset.webp";
var RUSTWORKS_GENERATED_SKY_ASSET_URL = "./assets/original/skies/rustworks-industrial-night.webp";
var TERMINAL_GENERATED_SKY_ASSET_URL = "./assets/original/skies/terminal-airport-dawn.webp";
var SKY_BACKDROP_WEBGPU_ADMISSION_TIMEOUT_MS = 4e3;
/**
* Owner-directed per-arena sky gradients.
*
* This is a `scene.background` equirectangular gradient rather than dome
* geometry, so it is identical on the WebGPU path and the WebGL2 compatibility
* path (HF-331: Firefox 141+ on Windows ships WebGPU and takes the WebGPU
* route; WebGL2 remains for Safari and older browsers). It is drawn behind every
* object, so it can never be frustum-clipped by the 180 m camera far plane nor
* washed out by the gameplay fog band - both of which previously left arenas
* with no visible sky at all.
*/
var SKY_BACKDROP_GRADIENTS = Object.freeze({
	"sunset-farmland": Object.freeze([
		[0, "#150d38"],
		[.18, "#2c1654"],
		[.38, "#5c2566"],
		[.55, "#9c3a5e"],
		[.68, "#d4553f"],
		[.8, "#f07f36"],
		[.9, "#fca94a"],
		[1, "#ffd98a"]
	]),
	"industrial-night": Object.freeze([
		[0, "#04070f"],
		[.42, "#0a1526"],
		[.74, "#13314a"],
		[.92, "#1c5157"],
		[1, "#27706a"]
	]),
	"airport-dawn": Object.freeze([
		[0, "#3f86c9"],
		[.44, "#79b6e0"],
		[.78, "#bcd9ec"],
		[1, "#e6eff5"]
	]),
	"indoor-range": Object.freeze([[0, "#151d22"], [1, "#232f36"]]),
	"jungle-golden-hour": Object.freeze([
		[0, "#08418c"],
		[.3, "#155fae"],
		[.55, "#2a7cc6"],
		[.75, "#4d9ad6"],
		[.9, "#87bce4"],
		[1, "#c4dfef"]
	]),
	"open-ocean-day": Object.freeze([
		[0, "#0f4f9b"],
		[.3, "#2f7fc4"],
		[.58, "#69aad9"],
		[.82, "#a9cfe8"],
		[1, "#dceaf2"]
	]),
	"range-midmorning": Object.freeze([
		[0, "#2f5f9e"],
		[.16, "#3b73b0"],
		[.32, "#4e8ac2"],
		[.42, "#66a0d0"],
		[.474, "#8fbcdc"],
		[.492, "#b7c8cf"],
		[.4985, "#e7d9ba"],
		[.505, "#c6d5e2"],
		[.52, "#93aecb"],
		[.548, "#86a2c0"],
		[.578, "#aebdca"],
		[.608, "#c7bb9c"],
		[.72, "#b39a72"],
		[1, "#7d6c4e"]
	]),
	"estate-golden-hour": Object.freeze([
		[0, "#1d4a8c"],
		[.16, "#2f5c9b"],
		[.3, "#47709f"],
		[.4, "#6b7f9c"],
		[.462, "#a98a92"],
		[.482, "#e39f6d"],
		[.4985, "#ffcf90"],
		[.506, "#eab89e"],
		[.522, "#9d8fbe"],
		[.552, "#8177ac"],
		[.582, "#a691ae"],
		[.612, "#d7b287"],
		[.72, "#c2a87f"],
		[1, "#8a7657"]
	])
});
/**
* Per-preset cloud fields baked into the backdrop so every backend (WebGPU -
* including Firefox 141+, which ships WebGPU on Windows per HF-331 - and the
* WebGL2 compatibility path alike) gets a real sky with clouds, not a flat
* gradient.
* Bands are vertical fractions of the texture (0 = zenith, 1 = horizon).
*/
var SKY_BACKDROP_CLOUDS = Object.freeze({
	"sunset-farmland": Object.freeze({
		count: 34,
		bandTop: .18,
		bandBottom: .56,
		rgb: [
			255,
			188,
			142
		],
		shadowRgb: [
			74,
			42,
			91
		],
		alpha: .56,
		scale: .72
	}),
	"industrial-night": Object.freeze({
		count: 16,
		bandTop: .2,
		bandBottom: .54,
		rgb: [
			72,
			101,
			128
		],
		shadowRgb: [
			8,
			18,
			34
		],
		alpha: .26,
		scale: .82
	}),
	"airport-dawn": Object.freeze({
		count: 38,
		bandTop: .12,
		bandBottom: .55,
		rgb: [
			255,
			255,
			255
		],
		shadowRgb: [
			105,
			140,
			167
		],
		alpha: .66,
		scale: .68
	}),
	"indoor-range": null,
	"jungle-golden-hour": Object.freeze({
		count: 13,
		bandTop: .08,
		bandBottom: .34,
		rgb: [
			255,
			255,
			252
		],
		shadowRgb: [
			88,
			118,
			152
		],
		alpha: .44,
		scale: .7
	}),
	"open-ocean-day": Object.freeze({
		count: 24,
		bandTop: .1,
		bandBottom: .46,
		rgb: [
			255,
			255,
			255
		],
		shadowRgb: [
			120,
			156,
			184
		],
		alpha: .58,
		scale: .54
	}),
	"range-midmorning": Object.freeze({
		count: 26,
		bandTop: .22,
		bandBottom: .505,
		rgb: [
			253,
			250,
			244
		],
		shadowRgb: [
			116,
			136,
			168
		],
		alpha: .42,
		scale: .42
	}),
	"estate-golden-hour": Object.freeze({
		count: 32,
		bandTop: .2,
		bandBottom: .505,
		rgb: [
			255,
			243,
			228
		],
		shadowRgb: [
			88,
			84,
			134
		],
		alpha: .56,
		scale: .5
	})
});
function skyRandom(seed) {
	let state = seed >>> 0;
	return () => {
		state = Math.imul(state, 1664525) + 1013904223 >>> 0;
		return state / 4294967296;
	};
}
/**
* Per-preset sun disc baked into the backdrop. x is a horizontal fraction of
* the texture width; y is a vertical fraction where 0 = zenith, 0.5 = the
* horizon and 1 = nadir (the equirectangular polar axis - a sun authored above
* 0.5 is below the horizon and cannot be seen at all).
*/
var SKY_BACKDROP_SUN = Object.freeze({
	"sunset-farmland": Object.freeze({
		x: .3,
		y: .5,
		coreRgb: [
			255,
			236,
			190
		],
		glowRgb: [
			255,
			158,
			64
		],
		coreRadius: 18,
		glowRadius: 92
	}),
	"industrial-night": null,
	"airport-dawn": Object.freeze({
		x: .72,
		y: .38,
		coreRgb: [
			255,
			252,
			240
		],
		glowRgb: [
			255,
			240,
			205
		],
		coreRadius: 14,
		glowRadius: 70
	}),
	"indoor-range": null,
	"jungle-golden-hour": Object.freeze({
		x: .62,
		y: .24,
		coreRgb: [
			255,
			253,
			245
		],
		glowRgb: [
			214,
			234,
			250
		],
		coreRadius: 13,
		glowRadius: 66
	}),
	"open-ocean-day": Object.freeze({
		x: .38,
		y: .22,
		coreRgb: [
			255,
			255,
			250
		],
		glowRgb: [
			214,
			236,
			255
		],
		coreRadius: 11,
		glowRadius: 58
	}),
	"range-midmorning": Object.freeze({
		x: .913,
		y: .398,
		coreRgb: [
			255,
			252,
			240
		],
		glowRgb: [
			252,
			234,
			196
		],
		coreRadius: 12,
		glowRadius: 20,
		aureole: Object.freeze({
			reachDegrees: 20,
			coreDegrees: 4,
			strength: .66,
			anisotropy: .8
		})
	}),
	"estate-golden-hour": Object.freeze({
		x: .913,
		y: .398,
		coreRgb: [
			255,
			242,
			208
		],
		glowRgb: [
			255,
			190,
			116
		],
		coreRadius: 17,
		glowRadius: 19,
		aureole: Object.freeze({
			reachDegrees: 22,
			coreDegrees: 5.2,
			strength: .52,
			anisotropy: .7
		})
	})
});
/** Cornette-Shanks phase function; the analytic stand-in for the Mie forward lobe. */
function cornetteShanksPhase(cosTheta, anisotropy) {
	const g2 = anisotropy * anisotropy;
	const denominator = Math.pow(Math.max(1e-6, 1 + g2 - 2 * anisotropy * cosTheta), 1.5);
	return (1 - g2) * (1 + cosTheta * cosTheta) / (2 * (2 + g2) * denominator);
}
/** Stops across the aureole cone. Eight resolves the near-sun knee without banding. */
var AUREOLE_GRADIENT_STOPS = 8;
/**
* Draws the circumsolar halo as the phase function's excess over its value at
* the cone edge, so the term is continuous where it ends. Deterministic: pure
* arithmetic over the authored constants, no RNG.
*/
function paintAureole(context, aureole, rgb, cx, cy, pixelsPerDegree) {
	const radius = aureole.reachDegrees * pixelsPerDegree;
	if (radius <= 0) return;
	const reachRadians = aureole.reachDegrees * Math.PI / 180;
	const peak = cornetteShanksPhase(1, aureole.anisotropy);
	const edge = cornetteShanksPhase(Math.cos(reachRadians), aureole.anisotropy);
	const span = Math.max(peak - edge, 1e-6);
	const [r, g, b] = rgb;
	const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
	for (let stop = 0; stop < AUREOLE_GRADIENT_STOPS; stop += 1) {
		const offset = stop / (AUREOLE_GRADIENT_STOPS - 1);
		const excess = (cornetteShanksPhase(Math.cos(offset * reachRadians), aureole.anisotropy) - edge) / span;
		const alpha = aureole.strength * Math.max(0, excess);
		gradient.addColorStop(offset, `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(4)})`);
	}
	context.fillStyle = gradient;
	context.beginPath();
	context.arc(cx, cy, radius, 0, Math.PI * 2);
	context.fill();
}
function paintSun(context, preset, width, height) {
	const sun = SKY_BACKDROP_SUN[preset];
	if (!sun) return;
	const cx = sun.x * width;
	const cy = sun.y * height;
	const resolutionScale = width / 512;
	const pixelsPerDegree = width / 360;
	const [gr, gg, gb] = sun.glowRgb;
	if (sun.aureole) paintAureole(context, sun.aureole, sun.glowRgb, cx, cy, pixelsPerDegree);
	else {
		const glowRadius = sun.glowRadius * resolutionScale;
		const glow = context.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
		glow.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, 0.85)`);
		glow.addColorStop(.4, `rgba(${gr}, ${gg}, ${gb}, 0.32)`);
		glow.addColorStop(1, `rgba(${gr}, ${gg}, ${gb}, 0)`);
		context.fillStyle = glow;
		context.beginPath();
		context.arc(cx, cy, glowRadius, 0, Math.PI * 2);
		context.fill();
	}
	const coreRadius = sun.aureole ? sun.aureole.coreDegrees * pixelsPerDegree : sun.coreRadius * resolutionScale;
	const [cr, cg, cb] = sun.coreRgb;
	const core = context.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
	core.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 1)`);
	core.addColorStop(.7, `rgba(${cr}, ${cg}, ${cb}, 0.9)`);
	core.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
	context.fillStyle = core;
	context.beginPath();
	context.arc(cx, cy, coreRadius, 0, Math.PI * 2);
	context.fill();
}
function paintNightDetails(context, preset, width, height) {
	if (preset !== "industrial-night") return;
	const random = skyRandom(8611);
	context.save();
	context.translate(width * .58, height * .2);
	context.rotate(-.16);
	context.scale(1, .18);
	const galaxy = context.createRadialGradient(0, 0, 0, 0, 0, width * .43);
	galaxy.addColorStop(0, "rgba(116, 145, 180, 0.16)");
	galaxy.addColorStop(.42, "rgba(72, 99, 137, 0.1)");
	galaxy.addColorStop(1, "rgba(40, 58, 88, 0)");
	context.fillStyle = galaxy;
	context.beginPath();
	context.arc(0, 0, width * .43, 0, Math.PI * 2);
	context.fill();
	context.restore();
	for (let index = 0; index < 520; index += 1) {
		const x = random() * width;
		const y = random() * height * .53;
		const radius = .45 + random() * (index % 37 === 0 ? 1.8 : .9);
		context.fillStyle = `rgba(218, 232, 255, ${(.28 + random() * .62).toFixed(3)})`;
		context.beginPath();
		context.arc(x, y, radius, 0, Math.PI * 2);
		context.fill();
	}
}
function paintWrappedCloudPuff(context, width, x, y, radius, horizontalScale, rotation, rgb, alpha) {
	const [r, g, b] = rgb;
	for (const wrap of [
		-width,
		0,
		width
	]) {
		const wrappedX = x + wrap;
		if (wrappedX + radius * horizontalScale < 0 || wrappedX - radius * horizontalScale > width) continue;
		context.save();
		context.translate(wrappedX, y);
		context.rotate(rotation);
		context.scale(horizontalScale, 1);
		const blob = context.createRadialGradient(0, 0, 0, 0, 0, radius);
		blob.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`);
		blob.addColorStop(.58, `rgba(${r}, ${g}, ${b}, ${(alpha * .72).toFixed(3)})`);
		blob.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
		context.fillStyle = blob;
		context.beginPath();
		context.arc(0, 0, radius, 0, Math.PI * 2);
		context.fill();
		context.restore();
	}
}
function paintClouds(context, preset, width, height) {
	const config = SKY_BACKDROP_CLOUDS[preset];
	if (!config) return;
	const random = skyRandom(preset.length * 7919 + 13);
	const [r, g, b] = config.rgb;
	const sun = SKY_BACKDROP_SUN[preset];
	const resolutionScale = width / 512;
	for (let index = 0; index < config.count; index += 1) {
		const cx = random() * width;
		const cy = (config.bandTop + random() * (config.bandBottom - config.bandTop)) * height;
		const puffs = 7 + Math.floor(random() * 6);
		const baseRadius = (18 + random() * 30) * config.scale * resolutionScale;
		const bankRotation = (random() - .5) * .16;
		const sunLift = sun ? Math.max(0, 1 - Math.hypot(cx - sun.x * width, cy - sun.y * height) / (sun.glowRadius * resolutionScale * 2.2)) : 0;
		for (let puff = 0; puff < puffs; puff += 1) {
			const px = cx + (random() - .5) * baseRadius * 3.4;
			const py = cy + (random() - .5) * baseRadius * .9;
			const radius = baseRadius * (.5 + random() * .7);
			const density = config.alpha * (.4 + random() * .6);
			const lr = Math.min(255, Math.round(r + (255 - r) * sunLift * .5));
			const lg = Math.min(255, Math.round(g + (255 - g) * sunLift * .35));
			const lb = Math.min(255, Math.round(b + (255 - b) * sunLift * .2));
			const horizontalScale = 1.25 + random() * 1.35;
			paintWrappedCloudPuff(context, width, px, py + radius * .18, radius * 1.04, horizontalScale, bankRotation, config.shadowRgb, density * .64);
			paintWrappedCloudPuff(context, width, px, py - radius * .08, radius, horizontalScale, bankRotation, [
				lr,
				lg,
				lb
			], density);
		}
	}
}
function configureEquirectangularTexture(texture, name) {
	texture.name = name;
	texture.colorSpace = SRGBColorSpace;
	texture.mapping = 303;
	texture.wrapS = RepeatWrapping;
	texture.wrapT = ClampToEdgeWrapping;
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearFilter;
	texture.generateMipmaps = false;
	return texture;
}
function gradientTexture(preset) {
	const { width, height } = SKY_BACKDROP_TEXTURE_SIZE;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Sky backdrop requires a 2D context");
	const gradient = context.createLinearGradient(0, 0, 0, height);
	for (const [offset, css] of SKY_BACKDROP_GRADIENTS[preset]) gradient.addColorStop(offset, css);
	context.fillStyle = gradient;
	context.fillRect(0, 0, width, height);
	paintNightDetails(context, preset, width, height);
	paintSun(context, preset, width, height);
	paintClouds(context, preset, width, height);
	return configureEquirectangularTexture(new CanvasTexture(canvas), `pass66-sky-backdrop-${preset}`);
}
var backdropCache = /* @__PURE__ */ new Map();
var generatedSkyTextures = /* @__PURE__ */ new Map();
var generatedSkyRequests = /* @__PURE__ */ new Map();
var backdropLifetime = 0;
var sceneBackdropAdmissions = /* @__PURE__ */ new WeakMap();
function sceneBackdropStatus(scene) {
	const status = scene.userData.pass66SkyBackdropStatus;
	return status === "asset-loading" || status === "asset-ready" || status === "procedural-fallback" ? status : "procedural-ready";
}
function skyBackdropPreset(preset) {
	return preset === "sunset-farmland" || preset === "industrial-night" || preset === "airport-dawn" || preset === "indoor-range" || preset === "jungle-golden-hour" || preset === "open-ocean-day" || preset === "range-midmorning" || preset === "estate-golden-hour" ? preset : "airport-dawn";
}
function skyBackdropAssetForPreset(preset) {
	const resolved = skyBackdropPreset(preset);
	if (resolved === "sunset-farmland") return ATOMIC_ACRES_GENERATED_SKY_ASSET_URL;
	if (resolved === "industrial-night") return RUSTWORKS_GENERATED_SKY_ASSET_URL;
	if (resolved === "airport-dawn") return TERMINAL_GENERATED_SKY_ASSET_URL;
	return null;
}
function requestGeneratedSkyTexture(preset, assetUrl) {
	const loaded = generatedSkyTextures.get(preset);
	if (loaded) return Promise.resolve(loaded);
	const pending = generatedSkyRequests.get(preset);
	if (pending) return pending;
	const requestLifetime = backdropLifetime;
	let request;
	request = new Promise((resolve) => {
		try {
			new ImageLoader().load(assetUrl, (image) => {
				const texture = new Texture(image);
				configureEquirectangularTexture(texture, `pass66-generated-sky-backdrop-${preset}`);
				texture.needsUpdate = true;
				if (requestLifetime !== backdropLifetime) {
					texture.dispose();
					resolve(null);
					return;
				}
				generatedSkyTextures.set(preset, texture);
				resolve(texture);
			}, void 0, () => resolve(null));
		} catch {
			resolve(null);
		}
	});
	generatedSkyRequests.set(preset, request);
	request.then(() => {
		if (generatedSkyRequests.get(preset) === request) generatedSkyRequests.delete(preset);
	});
	return request;
}
/**
* Applies the arena's procedural sky immediately on every renderer backend.
* Each outdoor arena then admits its selected high-detail source asynchronously.
* A failed or stale decode leaves the procedural CanvasTexture in place, so sky
* enhancement can never block arena admission or replace the frame with white.
*/
function applySkyBackdrop(scene, preset, recordSelectedAssetRequest) {
	const resolved = skyBackdropPreset(preset);
	let texture = backdropCache.get(resolved);
	if (!texture) {
		texture = gradientTexture(resolved);
		backdropCache.set(resolved, texture);
	}
	scene.background = texture;
	scene.userData.pass66SkyBackdropPreset = resolved;
	const application = Number(scene.userData.pass66SkyBackdropApplication ?? 0) + 1;
	scene.userData.pass66SkyBackdropApplication = application;
	scene.userData.pass66SkyBackdropStatus = "procedural-ready";
	scene.userData.pass66SkyBackdropSource = "procedural-canvas";
	scene.userData.pass66SkyBackdropAssetUrl = null;
	sceneBackdropAdmissions.delete(scene);
	const assetUrl = skyBackdropAssetForPreset(resolved);
	if (assetUrl) {
		scene.userData.pass66SkyBackdropStatus = "asset-loading";
		scene.userData.pass66SkyBackdropAssetUrl = assetUrl;
		recordSelectedAssetRequest?.(assetUrl);
		const settled = requestGeneratedSkyTexture(resolved, assetUrl).then((loaded) => {
			if (scene.userData.pass66SkyBackdropApplication !== application || scene.userData.pass66SkyBackdropPreset !== resolved) return sceneBackdropStatus(scene);
			if (!loaded) {
				scene.userData.pass66SkyBackdropStatus = "procedural-fallback";
				return "procedural-fallback";
			}
			scene.background = loaded;
			scene.userData.pass66SkyBackdropStatus = "asset-ready";
			scene.userData.pass66SkyBackdropSource = "generated-equirectangular-webp";
			return "asset-ready";
		});
		sceneBackdropAdmissions.set(scene, Object.freeze({
			application,
			settled
		}));
	}
	return texture;
}
/**
* Seals the selected backdrop before native-WebGPU presentation prewarm. Each
* generated image is local and normally settles immediately; the bound prevents
* a corrupt/stalled decode from blocking map admission. On timeout the current
* application is invalidated, so a late decode may populate the shared cache
* for a later map switch but cannot mutate the already-compiled live scene.
*/
async function waitForSkyBackdropAdmission(scene, timeoutMs = SKY_BACKDROP_WEBGPU_ADMISSION_TIMEOUT_MS) {
	const admission = sceneBackdropAdmissions.get(scene);
	if (!admission) return sceneBackdropStatus(scene);
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return admission.settled;
	let timeout;
	const outcome = await Promise.race([admission.settled.then((status) => Object.freeze({
		timedOut: false,
		status
	})), new Promise((resolve) => {
		timeout = setTimeout(() => resolve(Object.freeze({
			timedOut: true,
			status: "procedural-fallback"
		})), timeoutMs);
	})]);
	if (timeout !== void 0) clearTimeout(timeout);
	if (!outcome.timedOut) return outcome.status;
	if (scene.userData.pass66SkyBackdropApplication === admission.application) {
		scene.userData.pass66SkyBackdropApplication = admission.application + 1;
		scene.userData.pass66SkyBackdropStatus = "procedural-fallback";
		scene.userData.pass66SkyBackdropSource = "procedural-canvas";
	}
	if (sceneBackdropAdmissions.get(scene) === admission) sceneBackdropAdmissions.delete(scene);
	return "procedural-fallback";
}
/** Terminal teardown only; never call while a frame may still sample these. */
function disposeSkyBackdrops() {
	backdropLifetime += 1;
	generatedSkyRequests.clear();
	for (const texture of generatedSkyTextures.values()) texture.dispose();
	generatedSkyTextures.clear();
	for (const texture of backdropCache.values()) texture.dispose();
	backdropCache.clear();
}
//#endregion
export { disposeSkyBackdrops as a, applySkyBackdrop as i, RUSTWORKS_GENERATED_SKY_ASSET_URL as n, waitForSkyBackdropAdmission as o, TERMINAL_GENERATED_SKY_ASSET_URL as r, ATOMIC_ACRES_GENERATED_SKY_ASSET_URL as t };
