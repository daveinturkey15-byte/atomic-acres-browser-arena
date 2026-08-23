import { t as buildFarcrysis } from "./farcrysis-Bte6TqEY.js";
import { t as ATOMIC_ACRES_GENERATED_SKY_ASSET_URL } from "./sky-backdrop-6F0V0pgq.js";
import { a as createProceduralArenaVisualDefinition, i as colorPipeline, n as budgets, r as camera, t as SHARED_GAMEPLAY_ASSETS } from "./shared-DFzEBZ4K.js";
//#region src/rendering/arenas/farcrysis.ts
var definition = createProceduralArenaVisualDefinition({
	id: "farcrysis",
	displayLabel: "Farcrysis",
	moduleId: "arena.visual.farcrysis.v1",
	assetDependencies: [ATOMIC_ACRES_GENERATED_SKY_ASSET_URL],
	sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
	lighting: {
		sunColor: 16772818,
		sunIntensity: 2.4,
		ambientColor: 12113118,
		ambientIntensity: .3,
		practicals: [
			{
				id: "farcrysis-beach-golden-hour",
				policy: "emissive-only",
				maximumDistance: 0,
				castsShadow: false
			},
			{
				id: "farcrysis-core-work-lights",
				policy: "shadowed-local",
				maximumDistance: 22,
				castsShadow: true
			},
			{
				id: "farcrysis-jungle-dapple",
				policy: "shadowed-local",
				maximumDistance: 18,
				castsShadow: true
			}
		]
	},
	fog: {
		color: 11063264,
		near: 78,
		far: 200
	},
	shadows: {
		enabled: true,
		mapSize: 2048,
		maximumDistance: 120,
		normalBias: .03
	},
	atmosphere: {
		preset: "jungle-golden-hour",
		mist: .12,
		dust: .05,
		clouds: true
	},
	colorPipeline: colorPipeline("pass69.farcrysis.hdr.v1", 1.08),
	budgets: budgets({
		maximumDrawCalls: 460,
		maximumTriangles: 11e5
	}),
	reviewCameras: [
		camera("farcrysis-beach-golden", [
			-27,
			3.2,
			-27
		], [
			0,
			1.2,
			0
		], "overview", 1.08),
		camera("farcrysis-jungle-dapple", [
			-10,
			1.9,
			-12
		], [
			0,
			1.7,
			0
		], "light-occlusion", 1.08),
		camera("farcrysis-core-interior", [
			0,
			2.6,
			0
		], [
			0,
			1.7,
			4
		], "geometry", 1.08),
		camera("farcrysis-seaplane-throwback", [
			24,
			2.4,
			-24
		], [
			20,
			1.2,
			-20
		], "overview", 1.08)
	],
	collisionIdentity: {
		authoritativeArenaId: "farcrysis",
		evidence: "ArenaMap farcrysis collider, cover and shot-surface identity",
		presentationMayMutateAuthority: false
	},
	exceptions: ["beach/jungle foliage may remain presentation-only while authoritative cover and shot surfaces remain unchanged"]
}, buildFarcrysis);
//#endregion
export { definition };
