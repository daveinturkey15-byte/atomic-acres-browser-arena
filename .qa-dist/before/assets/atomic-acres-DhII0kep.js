import { n as buildArena } from "./map-t3vJtFAI.js";
import { t as ATOMIC_ACRES_GENERATED_SKY_ASSET_URL } from "./sky-backdrop-NeXnBnPk.js";
import { a as createProceduralArenaVisualDefinition, i as colorPipeline, n as budgets, r as camera, t as SHARED_GAMEPLAY_ASSETS } from "./shared-DJLv0O_l.js";
//#region src/rendering/arenas/atomic-acres.ts
var definition = createProceduralArenaVisualDefinition({
	id: "atomic-acres",
	displayLabel: "Nuke Town",
	moduleId: "arena.visual.atomic-acres.v1",
	assetDependencies: ["./assets/original/models/atomic-acres-blender-arena.glb?v=pass73-20260821-route-authority1", ATOMIC_ACRES_GENERATED_SKY_ASSET_URL],
	sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
	lighting: {
		sunColor: 16773582,
		sunIntensity: 3.2,
		ambientColor: 9416895,
		ambientIntensity: .42,
		practicals: [{
			id: "house-fixtures",
			policy: "emissive-only",
			maximumDistance: 0,
			castsShadow: false
		}, {
			id: "exterior-contrast-keys",
			policy: "shadowed-local",
			maximumDistance: 32,
			castsShadow: true
		}]
	},
	fog: {
		color: 11649214,
		near: 58,
		far: 148
	},
	shadows: {
		enabled: true,
		mapSize: 2048,
		maximumDistance: 176,
		normalBias: .035
	},
	atmosphere: {
		preset: "sunset-farmland",
		mist: .42,
		dust: .28,
		clouds: true
	},
	colorPipeline: colorPipeline("pass64.nuke-town.hdr.v1", 1.08),
	budgets: budgets({
		maximumDrawCalls: 560,
		maximumTriangles: 16e5
	}),
	reviewCameras: [
		camera("nuke-town-overview", [
			30,
			20,
			34
		], [
			0,
			2,
			0
		], "overview", 1.08),
		camera("nuke-town-plan", [
			0,
			62,
			.01
		], [
			0,
			0,
			0
		], "overview", 1.08),
		camera("nuke-town-street-axis", [
			-27,
			1.7,
			0
		], [
			34,
			1.5,
			0
		], "overview", 1.08),
		camera("nuke-town-west-garden", [
			-35.5,
			1.7,
			-8
		], [
			-20,
			1.4,
			8
		], "overview", 1.08),
		camera("nuke-town-aqua-upper-roof", [
			-33,
			6,
			-20.4
		], [
			-19,
			5,
			-17.4
		], "geometry", 1.08),
		camera("nuke-town-aqua-wall-closed", [
			-19,
			2.2,
			-12.4
		], [
			-24,
			2.2,
			-17.4
		], "light-occlusion", 1.08),
		camera("nuke-town-aqua-door-open", [
			-19,
			2.2,
			-12.4
		], [
			-17,
			2.2,
			-17.4
		], "portal", 1.08)
	],
	collisionIdentity: {
		authoritativeArenaId: "atomic-acres",
		evidence: "ArenaMap atomic-acres collider and shot-surface identity",
		presentationMayMutateAuthority: false
	},
	exceptions: ["grass, decals, particles and overhead dressing remain presentation-only"]
}, buildArena);
//#endregion
export { definition };
