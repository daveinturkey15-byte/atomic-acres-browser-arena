import { Jo as DirectionalLight, Vd as SpotLight, ru as PointLight, sf as Texture, wd as Scene } from "./vendor-three-aHPbjK02.js";
function arenaVolumeContainsPoint(volume, point) {
	return point.every((value, axis) => value >= volume.minimum[axis] && value <= volume.maximum[axis]);
}
function assertFiniteVector(value, label) {
	if (value.length !== 3 || value.some((component) => !Number.isFinite(component))) throw new Error(`${label} must contain three finite coordinates`);
}
function validateSpotLightDefinition(definition, practical, light) {
	const label = `${definition.id}/${practical.id}`;
	assertFiniteVector(light.position, `${label} position`);
	assertFiniteVector(light.target, `${label} target`);
	assertFiniteVector(light.intendedVolume.minimum, `${label} volume minimum`);
	assertFiniteVector(light.intendedVolume.maximum, `${label} volume maximum`);
	if (light.intendedVolume.minimum.some((minimum, axis) => minimum >= light.intendedVolume.maximum[axis])) throw new Error(`${label} intended volume must have positive extent on every axis`);
	if (!arenaVolumeContainsPoint(light.intendedVolume, light.position)) throw new Error(`${label} position escapes intended volume ${light.intendedVolume.id}`);
	if (!arenaVolumeContainsPoint(light.intendedVolume, light.target)) throw new Error(`${label} target escapes intended volume ${light.intendedVolume.id}`);
	if (!Number.isFinite(light.intensity) || light.intensity <= 0) throw new Error(`${label} intensity must be positive and finite`);
	if (!Number.isFinite(light.distance) || light.distance <= 0 || light.distance > practical.maximumDistance) throw new Error(`${label} distance must be positive and no greater than its practical policy`);
	if (!Number.isFinite(light.angle) || light.angle <= 0 || light.angle >= Math.PI / 2) throw new Error(`${label} spot angle must be between zero and PI/2`);
	if (!Number.isFinite(light.penumbra) || light.penumbra < 0 || light.penumbra > 1) throw new Error(`${label} penumbra must be between zero and one`);
	if (!Number.isFinite(light.decay) || light.decay < 0) throw new Error(`${label} decay must be finite and non-negative`);
	if (!Number.isSafeInteger(light.shadowMapSize) || light.shadowMapSize < 64 || (light.shadowMapSize & light.shadowMapSize - 1) !== 0) throw new Error(`${label} shadow map size must be a power of two at least 64`);
	const motion = light.motion;
	if (!motion) return;
	if (!motion.intensity && !motion.target) throw new Error(`${label} motion must animate at least one channel`);
	if (motion.intensity) {
		const { amplitudeRatio, frequencyHz, phaseRadians } = motion.intensity;
		if (!Number.isFinite(amplitudeRatio) || amplitudeRatio <= 0 || amplitudeRatio > .2) throw new Error(`${label} intensity motion amplitude must be in (0, 0.2]`);
		if (!Number.isFinite(frequencyHz) || frequencyHz <= 0 || frequencyHz > .5) throw new Error(`${label} intensity motion exceeds the non-strobe frequency bound`);
		if (!Number.isFinite(phaseRadians)) throw new Error(`${label} intensity phase must be finite`);
	}
	if (motion.target) {
		const { amplitude, frequencyHz, phaseRadians } = motion.target;
		assertFiniteVector(amplitude, `${label} target motion amplitude`);
		if (amplitude.every((component) => component === 0)) throw new Error(`${label} target motion must have non-zero travel`);
		if (!Number.isFinite(frequencyHz) || frequencyHz <= 0 || frequencyHz > .5) throw new Error(`${label} target motion exceeds the non-strobe frequency bound`);
		if (!Number.isFinite(phaseRadians)) throw new Error(`${label} target phase must be finite`);
		const minimumTarget = light.target.map((component, axis) => component - Math.abs(amplitude[axis]));
		const maximumTarget = light.target.map((component, axis) => component + Math.abs(amplitude[axis]));
		if (!arenaVolumeContainsPoint(light.intendedVolume, minimumTarget) || !arenaVolumeContainsPoint(light.intendedVolume, maximumTarget)) throw new Error(`${label} animated target escapes intended volume ${light.intendedVolume.id}`);
	}
}
function abortError() {
	return new DOMException("Arena visual load aborted", "AbortError");
}
function materialsOf(node) {
	const material = node.material;
	if (!material) return [];
	return Array.isArray(material) ? material : [material];
}
var TEXTURE_PROPERTIES = [
	"map",
	"normalMap",
	"roughnessMap",
	"metalnessMap",
	"aoMap",
	"emissiveMap",
	"alphaMap",
	"lightMap",
	"envMap"
];
function createIdempotentRootDisposer(root) {
	let disposed = false;
	return () => {
		if (disposed) return;
		disposed = true;
		root.removeFromParent();
		const geometries = /* @__PURE__ */ new Set();
		const materials = /* @__PURE__ */ new Set();
		const textures = /* @__PURE__ */ new Set();
		root.traverse((node) => {
			const geometry = node.geometry;
			if (geometry) geometries.add(geometry);
			for (const material of materialsOf(node)) {
				materials.add(material);
				const record = material;
				for (const property of TEXTURE_PROPERTIES) {
					const texture = record[property];
					if (texture instanceof Texture) textures.add(texture);
				}
			}
			if (node instanceof PointLight || node instanceof SpotLight || node instanceof DirectionalLight) node.shadow.map?.dispose();
		});
		for (const texture of textures) texture.dispose();
		for (const material of materials) material.dispose();
		for (const geometry of geometries) geometry.dispose();
		root.clear();
	};
}
function createProceduralArenaVisualDefinition(metadata, build) {
	const definition = Object.freeze({
		...metadata,
		async load(context) {
			if (context.signal.aborted) throw abortError();
			const scratchScene = new Scene();
			const map = build(scratchScene);
			scratchScene.remove(map.root);
			map.root.userData.arenaVisualDefinitionId = metadata.id;
			map.root.userData.arenaVisualGeneration = context.generation;
			if (context.signal.aborted) {
				createIdempotentRootDisposer(map.root)();
				throw abortError();
			}
			return Object.freeze({
				definitionId: metadata.id,
				generation: context.generation,
				root: map.root,
				requestedResources: [],
				dispose: createIdempotentRootDisposer(map.root)
			});
		}
	});
	validateArenaVisualDefinition(definition);
	return definition;
}
function validateArenaVisualDefinition(definition) {
	if (definition.id !== definition.collisionIdentity.authoritativeArenaId) throw new Error(`${definition.id} visual identity does not match collision authority`);
	if (definition.collisionIdentity.presentationMayMutateAuthority !== false) throw new Error(`${definition.id} presentation may not mutate gameplay authority`);
	if (definition.reviewCameras.length < 3) throw new Error(`${definition.id} needs at least three deterministic review cameras`);
	if (new Set(definition.reviewCameras.map((camera) => camera.id)).size !== definition.reviewCameras.length) throw new Error(`${definition.id} has duplicate review camera IDs`);
	if (!definition.reviewCameras.some((camera) => camera.purpose === "light-occlusion")) throw new Error(`${definition.id} lacks a light-occlusion review camera`);
	const practicalIds = /* @__PURE__ */ new Set();
	let canonicalShadowPixels = 0;
	let canonicalShadowLightCount = 0;
	for (const practical of definition.lighting.practicals) {
		if (practicalIds.has(practical.id)) throw new Error(`${definition.id} has duplicate practical ID ${practical.id}`);
		practicalIds.add(practical.id);
		if (practical.policy === "shadowed-local" && !practical.castsShadow) throw new Error(`${definition.id}/${practical.id} claims shadowed-local without a shadow`);
		if (practical.policy !== "shadowed-local" && practical.castsShadow) throw new Error(`${definition.id}/${practical.id} allocates a shadow for ${practical.policy}`);
		if (practical.light && practical.policy !== "shadowed-local") throw new Error(`${definition.id}/${practical.id} defines a runtime light without shadowed-local policy`);
		if (practical.light) {
			validateSpotLightDefinition(definition, practical, practical.light);
			canonicalShadowPixels += practical.light.shadowMapSize ** 2;
			canonicalShadowLightCount += 1;
		}
	}
	const shadowedPracticalCount = definition.lighting.practicals.filter((practical) => practical.castsShadow).length;
	if (canonicalShadowLightCount > 0 && canonicalShadowLightCount !== shadowedPracticalCount) throw new Error(`${definition.id} may not mix canonical and legacy shadowed practicals`);
	if (shadowedPracticalCount > definition.budgets.maximumShadowLights) throw new Error(`${definition.id} practicals exceed the shadow-light budget`);
	if (canonicalShadowPixels > definition.budgets.maximumShadowMapPixels) throw new Error(`${definition.id} practicals exceed the shadow-map pixel budget`);
	if (definition.colorPipeline.workingSpace !== "linear-srgb-hdr" || definition.colorPipeline.output !== "srgb") throw new Error(`${definition.id} must use the controlled linear HDR to sRGB pipeline`);
}
//#endregion
//#region src/rendering/arenas/shared.ts
var SHARED_GAMEPLAY_ASSETS = Object.freeze([
	"./assets/original/models/operators/pass65-third-person-operator-lod0.glb",
	"./assets/original/models/operators/pass65-third-person-operator-lod1.glb",
	"./assets/third-party/quaternius/animated-guns/"
]);
function colorPipeline(id, exposure) {
	return Object.freeze({
		id,
		workingSpace: "linear-srgb-hdr",
		toneMap: "aces-filmic",
		exposure,
		grade: Object.freeze({
			contrast: 1.025,
			saturation: 1.02,
			shadowTint: 2573142,
			highlightTint: 16766370
		}),
		grain: Object.freeze({
			mode: "ordered-dither",
			strength: .72,
			deterministic: true
		}),
		output: "srgb"
	});
}
function budgets(overrides = {}) {
	return Object.freeze({
		maximumDrawCalls: 520,
		maximumTriangles: 14e5,
		maximumTextureBytes: 384 * 1024 * 1024,
		maximumResidentTextureBytes: 512 * 1024 * 1024,
		maximumShadowLights: 3,
		maximumShadowMapPixels: 6 * 2048 * 2048,
		maximumPostTextureSamples: 28,
		maximumTransientBytes: 256 * 1024 * 1024,
		cpuFrameP95Ms: 16.7,
		gpuFrameP95Ms: 16.7,
		...overrides
	});
}
function camera(id, position, target, purpose, exposure) {
	return Object.freeze({
		id,
		position,
		target,
		fov: 70,
		near: .08,
		far: 190,
		fixedTimeMs: 63e3,
		seed: 6401,
		exposure,
		hud: "hidden",
		purpose
	});
}
//#endregion
export { createProceduralArenaVisualDefinition as a, colorPipeline as i, budgets as n, camera as r, SHARED_GAMEPLAY_ASSETS as t };
