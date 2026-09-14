import { d as buildSkylineTerminal } from "./additional-maps-4DNt5pMv.js";
import { r as TERMINAL_GENERATED_SKY_ASSET_URL } from "./sky-backdrop-NeXnBnPk.js";
import { a as createProceduralArenaVisualDefinition, i as colorPipeline, n as budgets, r as camera, t as SHARED_GAMEPLAY_ASSETS } from "./shared-DJLv0O_l.js";
//#region src/rendering/arenas/skyline-terminal.ts
var definition = createProceduralArenaVisualDefinition({
	id: "skyline-terminal",
	displayLabel: "Terminal",
	moduleId: "arena.visual.skyline-terminal.v1",
	assetDependencies: [TERMINAL_GENERATED_SKY_ASSET_URL],
	sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
	lighting: {
		sunColor: 15398911,
		sunIntensity: 2.9,
		ambientColor: 9086383,
		ambientIntensity: .38,
		practicals: [
			{
				id: "terminal-ceiling-practicals",
				policy: "emissive-only",
				maximumDistance: 0,
				castsShadow: false
			},
			{
				id: "aircraft-cabin-contrast-key",
				policy: "shadowed-local",
				maximumDistance: 30,
				castsShadow: true
			},
			{
				id: "concourse-contrast-key",
				policy: "shadowed-local",
				maximumDistance: 34,
				castsShadow: true
			}
		]
	},
	fog: {
		color: 11124420,
		near: 64,
		far: 156
	},
	shadows: {
		enabled: true,
		mapSize: 2048,
		maximumDistance: 182,
		normalBias: .035
	},
	atmosphere: {
		preset: "airport-dawn",
		mist: .28,
		dust: .08,
		clouds: true
	},
	colorPipeline: colorPipeline("pass64.terminal.hdr.v1", 1.06),
	budgets: budgets({
		maximumDrawCalls: 590,
		maximumTriangles: 15e5
	}),
	reviewCameras: [
		camera("terminal-overview", [
			42,
			29,
			42
		], [
			0,
			3,
			-10
		], "overview", 1.06),
		camera("terminal-cabin-ceiling", [
			-4,
			4.05,
			2
		], [
			10,
			4.45,
			2
		], "geometry", 1.06),
		camera("terminal-concourse-wall-closed", [
			-13,
			1.9,
			-32
		], [
			-21,
			1.9,
			-34
		], "light-occlusion", 1.06),
		camera("terminal-boarding-open", [
			0,
			5,
			-7
		], [
			0,
			4.2,
			1
		], "portal", 1.06),
		camera("terminal-port-wing-authority", [
			11,
			7.8,
			23
		], [
			0,
			2.82,
			12
		], "geometry", 1.06),
		camera("terminal-starboard-wing-authority", [
			11,
			7.8,
			-19
		], [
			0,
			2.82,
			-8
		], "geometry", 1.06)
	],
	collisionIdentity: {
		authoritativeArenaId: "skyline-terminal",
		evidence: "ArenaMap skyline-terminal collider, portal and shot-surface identity",
		presentationMayMutateAuthority: false
	},
	exceptions: ["aircraft skin, windows and apron markings may remain presentation-only when authoritative hull surfaces remain unchanged"]
}, buildSkylineTerminal);
//#endregion
export { definition };
