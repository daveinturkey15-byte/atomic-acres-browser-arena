import { s as buildGunRange } from "./additional-maps-CaqfawcT.js";
import { t as GUN_RANGE_RACK_ASSETS } from "./gun-range-rack-presentation-BFlDcKf0.js";
import { a as createProceduralArenaVisualDefinition, i as colorPipeline, n as budgets, r as camera, t as SHARED_GAMEPLAY_ASSETS } from "./shared-DFzEBZ4K.js";
//#region src/rendering/arenas/gun-range.ts
var GUN_RANGE_INTERIOR_VOLUME = Object.freeze({
	id: "gun-range-authored-shell-interior",
	minimum: [
		-19.95,
		.05,
		-48.35
	],
	maximum: [
		19.95,
		6.825,
		19.45
	]
});
var GUN_RANGE_TEST_BAY_INTERIOR_VOLUME = Object.freeze({
	id: "gun-range-test-bay-interior",
	minimum: [
		52.05,
		.05,
		-25.95
	],
	maximum: [
		99.95,
		8.125,
		37.95
	]
});
var GUN_RANGE_TEST_BAY_DOOR_APPROACH_VOLUME = Object.freeze({
	id: "gun-range-test-bay-door-approach-interior",
	minimum: [
		20.3,
		.05,
		7.8
	],
	maximum: [
		51.55,
		7.15,
		16.2
	]
});
var GUN_RANGE_TEST_BAY_DOOR_PORTAL_VOLUME = Object.freeze({
	id: "gun-range-test-bay-door-portal-interior",
	minimum: [
		50.9,
		.05,
		7.8
	],
	maximum: [
		52.1,
		7.15,
		16.2
	]
});
var definition = createProceduralArenaVisualDefinition({
	id: "gun-range",
	displayLabel: "Gun Range",
	moduleId: "arena.visual.gun-range.v1",
	assetDependencies: GUN_RANGE_RACK_ASSETS.map((asset) => asset.url),
	sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
	lighting: {
		sunColor: 16777215,
		sunIntensity: 0,
		ambientColor: 13165286,
		ambientIntensity: .64,
		practicals: [
			{
				id: "ceiling-panels",
				policy: "emissive-only",
				maximumDistance: 0,
				castsShadow: false
			},
			{
				id: "weapon-stations",
				policy: "emissive-only",
				maximumDistance: 0,
				castsShadow: false
			},
			{
				id: "range-inspection-key",
				policy: "shadowed-local",
				maximumDistance: 38,
				castsShadow: true,
				light: {
					kind: "spot",
					position: [
						0,
						6.05,
						13.4
					],
					target: [
						0,
						1.7,
						-17.5
					],
					color: 12447743,
					intensity: 30,
					distance: 38,
					angle: .44,
					penumbra: .82,
					decay: 2,
					shadowMapSize: 512,
					intendedVolume: GUN_RANGE_INTERIOR_VOLUME,
					motion: {
						intensity: {
							amplitudeRatio: .06,
							frequencyHz: .09,
							phaseRadians: -Math.PI / 2
						},
						target: {
							amplitude: [
								2.25,
								.18,
								0
							],
							frequencyHz: .045,
							phaseRadians: 0
						}
					}
				}
			},
			{
				id: "range-cyan-lane-key",
				policy: "shadowed-local",
				maximumDistance: 30,
				castsShadow: true,
				light: {
					kind: "spot",
					position: [
						-11.5,
						6.02,
						-6
					],
					target: [
						-6.5,
						1.55,
						-28
					],
					color: 5499361,
					intensity: 21,
					distance: 30,
					angle: .5,
					penumbra: .86,
					decay: 2,
					shadowMapSize: 256,
					intendedVolume: GUN_RANGE_INTERIOR_VOLUME,
					motion: {
						intensity: {
							amplitudeRatio: .1,
							frequencyHz: .07,
							phaseRadians: .4
						},
						target: {
							amplitude: [
								1.1,
								.12,
								0
							],
							frequencyHz: .035,
							phaseRadians: .8
						}
					}
				}
			},
			{
				id: "range-amber-lane-key",
				policy: "shadowed-local",
				maximumDistance: 30,
				castsShadow: true,
				light: {
					kind: "spot",
					position: [
						11.5,
						6.02,
						-13
					],
					target: [
						6.5,
						1.55,
						-35
					],
					color: 16758863,
					intensity: 19,
					distance: 30,
					angle: .5,
					penumbra: .86,
					decay: 2,
					shadowMapSize: 256,
					intendedVolume: GUN_RANGE_INTERIOR_VOLUME,
					motion: {
						intensity: {
							amplitudeRatio: .09,
							frequencyHz: .055,
							phaseRadians: 2.1
						},
						target: {
							amplitude: [
								1.05,
								.1,
								0
							],
							frequencyHz: .03,
							phaseRadians: 2.4
						}
					}
				}
			},
			{
				id: "test-bay-door-approach-key",
				policy: "shadowed-local",
				maximumDistance: 16,
				castsShadow: true,
				light: {
					kind: "spot",
					position: [
						51.04,
						6.7,
						12
					],
					target: [
						47.5,
						2.5,
						12
					],
					color: 7533805,
					intensity: 12,
					distance: 16,
					angle: .82,
					penumbra: .84,
					decay: 2,
					shadowMapSize: 256,
					intendedVolume: GUN_RANGE_TEST_BAY_DOOR_APPROACH_VOLUME
				}
			},
			{
				id: "test-bay-door-bay-key",
				policy: "shadowed-local",
				maximumDistance: 16,
				castsShadow: true,
				light: {
					kind: "spot",
					position: [
						52.1,
						6.7,
						12
					],
					target: [
						55.8,
						2.5,
						12
					],
					color: 16760938,
					intensity: 14,
					distance: 16,
					angle: .76,
					penumbra: .86,
					decay: 2,
					shadowMapSize: 256,
					intendedVolume: GUN_RANGE_TEST_BAY_INTERIOR_VOLUME
				}
			},
			{
				id: "test-bay-inspection-key",
				policy: "shadowed-local",
				maximumDistance: 54,
				castsShadow: true,
				light: {
					kind: "spot",
					position: [
						70,
						7.75,
						27
					],
					target: [
						73,
						1.2,
						-5
					],
					color: 13170687,
					intensity: 38,
					distance: 54,
					angle: .68,
					penumbra: .86,
					decay: 2,
					shadowMapSize: 512,
					intendedVolume: GUN_RANGE_TEST_BAY_INTERIOR_VOLUME,
					motion: {
						intensity: {
							amplitudeRatio: .055,
							frequencyHz: .045,
							phaseRadians: 1.2
						},
						target: {
							amplitude: [
								2.2,
								.1,
								0
							],
							frequencyHz: .028,
							phaseRadians: .6
						}
					}
				}
			},
			{
				id: "test-bay-support-key",
				policy: "shadowed-local",
				maximumDistance: 36,
				castsShadow: true,
				light: {
					kind: "spot",
					position: [
						92,
						7.75,
						12
					],
					target: [
						88,
						.35,
						5
					],
					color: 16760678,
					intensity: 29,
					distance: 36,
					angle: .78,
					penumbra: .88,
					decay: 2,
					shadowMapSize: 256,
					intendedVolume: GUN_RANGE_TEST_BAY_INTERIOR_VOLUME,
					motion: {
						intensity: {
							amplitudeRatio: .06,
							frequencyHz: .052,
							phaseRadians: 2.25
						},
						target: {
							amplitude: [
								.8,
								.08,
								1.5
							],
							frequencyHz: .024,
							phaseRadians: 1.8
						}
					}
				}
			}
		]
	},
	fog: {
		color: 2634554,
		near: 48,
		far: 148
	},
	shadows: {
		enabled: true,
		mapSize: 1024,
		maximumDistance: 128,
		normalBias: .03
	},
	atmosphere: {
		preset: "indoor-range",
		mist: .08,
		dust: .08,
		clouds: false
	},
	colorPipeline: colorPipeline("pass64.gun-range.hdr.v1", 1),
	budgets: budgets({
		maximumDrawCalls: 402,
		maximumTriangles: 78e4,
		maximumTextureBytes: 224 * 1024 * 1024,
		maximumShadowLights: 7
	}),
	reviewCameras: [
		camera("gun-range-overview", [
			10,
			3.2,
			15.5
		], [
			0,
			1.7,
			-28
		], "overview", 1.12),
		camera("gun-range-armory-support", [
			10,
			2.2,
			12
		], [
			0,
			2,
			10
		], "geometry", 1),
		camera("gun-range-lane-wall", [
			6,
			2,
			-4
		], [
			0,
			2,
			-4
		], "light-occlusion", 1),
		camera("gun-range-neon-lanes", [
			0,
			2.55,
			-1
		], [
			0,
			1.7,
			-36
		], "light-occlusion", 1.16),
		camera("gun-range-lateral-targets", [
			0,
			2.45,
			-18.5
		], [
			0,
			1.72,
			-29
		], "geometry", 1.18),
		camera("gun-range-test-bay-corridor", [
			24,
			2.25,
			10.25
		], [
			51.5,
			2.15,
			12
		], "geometry", 1.08),
		camera("gun-range-test-bay-door-approach", [
			44.5,
			2.3,
			10.1
		], [
			51.5,
			3.05,
			12
		], "geometry", 1.02),
		camera("gun-range-test-bay-door-relief", [
			43.2,
			3.15,
			12
		], [
			51.5,
			3.15,
			12
		], "geometry", .84),
		camera("gun-range-test-bay-door-bay-face", [
			59,
			2.55,
			13.9
		], [
			51.5,
			3.05,
			12
		], "light-occlusion", 1.02),
		camera("gun-range-test-bay-overview", [
			92,
			4.3,
			34
		], [
			72,
			1.2,
			1
		], "overview", 1.05)
	],
	collisionIdentity: {
		authoritativeArenaId: "gun-range",
		evidence: "ArenaMap gun-range collider and shot-surface identity",
		presentationMayMutateAuthority: false
	},
	exceptions: ["target plate animation is gameplay presentation attached to authoritative targets"]
}, buildGunRange);
//#endregion
export { GUN_RANGE_INTERIOR_VOLUME, GUN_RANGE_TEST_BAY_DOOR_APPROACH_VOLUME, GUN_RANGE_TEST_BAY_DOOR_PORTAL_VOLUME, GUN_RANGE_TEST_BAY_INTERIOR_VOLUME, definition };
