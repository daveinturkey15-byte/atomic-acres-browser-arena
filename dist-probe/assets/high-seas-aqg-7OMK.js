import { r as TERMINAL_GENERATED_SKY_ASSET_URL } from "./sky-backdrop-6F0V0pgq.js";
import { t as buildHighSeas } from "./high-seas-CzSFpiSU.js";
import { a as createProceduralArenaVisualDefinition, i as colorPipeline, n as budgets, r as camera, t as SHARED_GAMEPLAY_ASSETS } from "./shared-DFzEBZ4K.js";
//#region src/rendering/arenas/high-seas.ts
var definition = createProceduralArenaVisualDefinition({
	id: "high-seas",
	displayLabel: "High Seas",
	moduleId: "arena.visual.high-seas.v1",
	assetDependencies: [TERMINAL_GENERATED_SKY_ASSET_URL],
	sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
	lighting: {
		sunColor: 16769979,
		sunIntensity: 3,
		ambientColor: 10471375,
		ambientIntensity: .4,
		practicals: [
			{
				id: "high-seas-deck-practicals",
				policy: "emissive-only",
				maximumDistance: 0,
				castsShadow: false
			},
			{
				id: "high-seas-cabin-contrast-key",
				policy: "shadowed-local",
				maximumDistance: 24,
				castsShadow: true
			},
			{
				id: "high-seas-upper-deck-key",
				policy: "shadowed-local",
				maximumDistance: 28,
				castsShadow: true
			}
		]
	},
	fog: {
		color: 12113628,
		near: 42,
		far: 132
	},
	shadows: {
		enabled: true,
		mapSize: 2048,
		maximumDistance: 150,
		normalBias: .03
	},
	atmosphere: {
		preset: "open-ocean-day",
		mist: .16,
		dust: .04,
		clouds: true
	},
	colorPipeline: colorPipeline("pass75.high-seas.hdr.v1", 1.06),
	budgets: budgets({
		maximumDrawCalls: 480,
		maximumTriangles: 95e4
	}),
	reviewCameras: [
		camera("high-seas-starboard-overview", [
			22,
			18,
			54
		], [
			0,
			4.8,
			0
		], "overview", 1.06),
		camera("high-seas-stern-main-deck", [
			-8,
			5.2,
			34
		], [
			0,
			4.9,
			12
		], "geometry", 1.06),
		camera("high-seas-upper-deck-occlusion", [
			8,
			7.8,
			5
		], [
			0,
			6.6,
			-16
		], "light-occlusion", 1.06),
		camera("high-seas-bow-lane", [
			-8,
			4.9,
			-34
		], [
			0,
			4.9,
			-12
		], "portal", 1.06)
	],
	collisionIdentity: {
		authoritativeArenaId: "high-seas",
		evidence: "ArenaMap high-seas collider, elevated-deck navigation and shot-surface identity",
		presentationMayMutateAuthority: false
	},
	exceptions: ["surrounding ocean remains presentation/float-zone authority and never becomes a shot or movement collider"]
}, buildHighSeas);
//#endregion
export { definition };
