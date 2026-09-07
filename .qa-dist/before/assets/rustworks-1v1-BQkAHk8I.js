import { n as RUSTWORKS_CONTAINER_LIGHTS, r as RUSTWORKS_WORK_LIGHTS, u as buildRustworks1v1 } from "./additional-maps-4DNt5pMv.js";
import { n as RUSTWORKS_GENERATED_SKY_ASSET_URL } from "./sky-backdrop-NeXnBnPk.js";
import { a as createProceduralArenaVisualDefinition, i as colorPipeline, n as budgets, r as camera, t as SHARED_GAMEPLAY_ASSETS } from "./shared-DJLv0O_l.js";
//#region src/rendering/arenas/rustworks-1v1.ts
var towerPracticals = RUSTWORKS_WORK_LIGHTS.map((fixture, index) => Object.freeze({
	id: `tower-mounted-work-light${fixture.id === "north" ? "" : `-${fixture.id}`}`,
	policy: "shadowed-local",
	maximumDistance: fixture.distance,
	castsShadow: true,
	light: Object.freeze({
		kind: "spot",
		position: fixture.position,
		target: fixture.target,
		color: fixture.color,
		intensity: fixture.intensity,
		distance: fixture.distance,
		angle: fixture.angle,
		penumbra: .7,
		decay: 2,
		shadowMapSize: 512,
		intendedVolume: Object.freeze({
			id: `rustrig-tower-work-light-${fixture.id}-volume`,
			minimum: [
				-18,
				.05,
				fixture.id === "north" ? -5.5 : -18
			],
			maximum: [
				18,
				8.8,
				fixture.id === "north" ? 18 : 5.5
			]
		}),
		motion: Object.freeze({ intensity: Object.freeze({
			amplitudeRatio: .075,
			frequencyHz: .115,
			phaseRadians: index * 1.73
		}) })
	})
}));
var containerPracticals = RUSTWORKS_CONTAINER_LIGHTS.map((fixture) => Object.freeze({
	id: `container-dynamic-${fixture.id}`,
	policy: "shadowed-local",
	maximumDistance: fixture.distance,
	castsShadow: true,
	light: Object.freeze({
		kind: "spot",
		position: fixture.position,
		target: fixture.target,
		color: fixture.color,
		intensity: fixture.intensity,
		distance: fixture.distance,
		angle: fixture.angle,
		penumbra: .76,
		decay: 2,
		shadowMapSize: 256,
		intendedVolume: Object.freeze({
			id: `rustrig-container-${fixture.id}-interior`,
			minimum: fixture.volume.minimum,
			maximum: fixture.volume.maximum
		}),
		motion: Object.freeze({ intensity: Object.freeze({
			amplitudeRatio: .12,
			frequencyHz: fixture.frequencyHz,
			phaseRadians: fixture.phaseRadians
		}) })
	})
}));
var definition = createProceduralArenaVisualDefinition({
	id: "rustworks-1v1",
	displayLabel: "RustRig",
	moduleId: "arena.visual.rustworks-1v1.v1",
	assetDependencies: [RUSTWORKS_GENERATED_SKY_ASSET_URL],
	sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
	lighting: {
		sunColor: 14871551,
		sunIntensity: 3.6,
		ambientColor: 7441061,
		ambientIntensity: .72,
		practicals: [
			{
				id: "tower-work-light-lenses",
				policy: "emissive-only",
				maximumDistance: 0,
				castsShadow: false
			},
			{
				id: "container-interior-warm-practicals",
				policy: "emissive-only",
				maximumDistance: 0,
				castsShadow: false
			},
			...towerPracticals,
			...containerPracticals
		]
	},
	fog: {
		color: 2701127,
		near: 58,
		far: 152
	},
	shadows: {
		enabled: true,
		mapSize: 2048,
		maximumDistance: 180,
		normalBias: .038
	},
	atmosphere: {
		preset: "industrial-night",
		mist: .28,
		dust: .1,
		clouds: true
	},
	colorPipeline: colorPipeline("pass64.rustrig.hdr.v1", 2),
	budgets: budgets({
		maximumDrawCalls: 500,
		maximumTriangles: 125e4,
		maximumShadowLights: 7
	}),
	reviewCameras: [
		camera("rustrig-overview", [
			38,
			31,
			42
		], [
			0,
			5,
			0
		], "overview", 2),
		camera("rustrig-tower-support", [
			14,
			2.4,
			12
		], [
			0,
			5,
			0
		], "geometry", 2),
		camera("rustrig-container-wall", [
			10,
			2.1,
			-18
		], [
			4,
			2.1,
			-18
		], "light-occlusion", 2),
		camera("rustrig-container-dynamic-northwest", [
			-1.4,
			1.7,
			-13
		], [
			-8,
			1.15,
			-13
		], "light-occlusion", 1.3),
		camera("rustrig-container-dynamic-southeast", [
			18,
			1.7,
			1.4
		], [
			18,
			1.15,
			8
		], "light-occlusion", 1.3),
		camera("rustrig-mounted-work-lights", [
			11,
			5.4,
			-12
		], [
			0,
			6.4,
			0
		], "light-occlusion", 2),
		camera("rustrig-deck-surface", [
			18,
			2.2,
			18
		], [
			0,
			.04,
			0
		], "geometry", 2)
	],
	collisionIdentity: {
		authoritativeArenaId: "rustworks-1v1",
		evidence: "ArenaMap rustworks-1v1 collider and shot-surface identity",
		presentationMayMutateAuthority: false
	},
	exceptions: ["animated Welsh flag cloth is presentation-only"]
}, buildRustworks1v1);
//#endregion
export { definition };
