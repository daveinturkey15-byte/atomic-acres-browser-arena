import { r as TERMINAL_GENERATED_SKY_ASSET_URL } from "./sky-backdrop-NeXnBnPk.js";
import { n as buildHighSeas, t as HIGH_SEAS_LEVELS } from "./high-seas-BG_rJ6GR.js";
import { a as createProceduralArenaVisualDefinition, i as colorPipeline, n as budgets, r as camera, t as SHARED_GAMEPLAY_ASSETS } from "./shared-DJLv0O_l.js";
//#region src/rendering/arenas/high-seas.ts
/**
* The sealed service deck, as a declared volume.
*
* Its ceiling is deliberately BELOW the main-deck plane: every below-deck light
* has to declare this volume, the definition validator refuses a light whose
* position or target escapes it, and the arena test asserts `maximum[1]` stays
* under `HIGH_SEAS_LEVELS.mainDeck`. That chain is what makes "below-deck light
* cannot reach the deck players fight on" a checked property rather than a
* comment.
*/
var HIGH_SEAS_SERVICE_DECK_VOLUME = Object.freeze({
	id: "high-seas-service-deck",
	minimum: [
		-2.6,
		-.2,
		-20.4
	],
	maximum: [
		2.6,
		3,
		20.4
	]
});
/** Ceiling height of the service-deck fixtures; the liner itself sits at 2.895. */
var FIXTURE_Y = 2.62;
/** Every fixture aims straight down, so its cone can only ever illuminate below itself. */
var FLOOR_Y = .05;
/**
* WHY THESE ARE REAL LIGHTS NOW (HF-373 follow-up).
*
* The service deck used to be emissive-only: bright strips, and nothing they
* touched. Measured on hardware WebGPU at eye height in the corridor, the
* gameplay window read mean 46/255 with 85% of pixels below 12/255 - glowing
* bars floating in a black void, with the floor at 6/255. The owner's report
* ("too dark down at the bottom") was exactly right, and no emissive tuning
* fixes it: emissive geometry lights nothing but itself.
*
* These are authored through the definition's canonical practical path, which
* is the repo's sanctioned way to own a runtime light: ArenaContrastLighting
* builds each one with makeShadowedLocal, so every fixture casts a shadow and
* therefore cannot spill through a bulkhead - the exact property the
* emissive-only policy existed to protect. Containment is doubly held:
*  - each cone points straight down (target directly beneath the position),
*    so the lit half-space is strictly below the fixture, and
*  - the fixture sits inside HIGH_SEAS_SERVICE_DECK_VOLUME, whose ceiling is
*    below the main deck.
*
* Eight fixtures, spaced so their floor pools overlap along the whole 40 m run:
* two in the engine-room bulge, four down the corridor legs, one at each ramp
* vestibule. Shadow maps are small on purpose (256 in the corridor, 512 in the
* room where players actually fight around the machinery) - a service corridor
* wants soft contact shading, not crisp shadows, and it keeps the whole rig at
* 1.3 Mpx against a 25 Mpx budget.
*/
function serviceDeckPractical(id, x, z, intensity, shadowMapSize) {
	return {
		id,
		policy: "shadowed-local",
		maximumDistance: 20,
		castsShadow: true,
		light: {
			kind: "spot",
			position: [
				x,
				FIXTURE_Y,
				z
			],
			target: [
				x,
				FLOOR_Y,
				z
			],
			color: 16763296,
			intensity,
			distance: 18,
			angle: 1.3,
			penumbra: .2,
			decay: 1.2,
			shadowMapSize,
			intendedVolume: HIGH_SEAS_SERVICE_DECK_VOLUME
		}
	};
}
var HIGH_SEAS_SERVICE_DECK_PRACTICALS = Object.freeze([
	serviceDeckPractical("high-seas-service-deck-room-port", -1.55, -3.4, 68, 512),
	serviceDeckPractical("high-seas-service-deck-room-starboard", 1.55, 3.4, 68, 512),
	serviceDeckPractical("high-seas-service-deck-bow-corridor-inner", 0, -9.5, 42, 256),
	serviceDeckPractical("high-seas-service-deck-bow-corridor-outer", 0, -15.5, 42, 256),
	serviceDeckPractical("high-seas-service-deck-stern-corridor-inner", 0, 9.5, 42, 256),
	serviceDeckPractical("high-seas-service-deck-stern-corridor-outer", 0, 15.5, 42, 256),
	serviceDeckPractical("high-seas-service-deck-bow-vestibule", 0, -19.3, 26, 256),
	serviceDeckPractical("high-seas-service-deck-stern-vestibule", 0, 19.3, 26, 256)
]);
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
		practicals: [{
			id: "high-seas-deck-practicals",
			policy: "emissive-only",
			maximumDistance: 0,
			castsShadow: false
		}, ...HIGH_SEAS_SERVICE_DECK_PRACTICALS]
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
		maximumTriangles: 95e4,
		maximumShadowLights: 8
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
/** Guard rail for the containment claim above, asserted by the arena test. */
var HIGH_SEAS_SERVICE_DECK_CEILING_BELOW_MAIN_DECK = HIGH_SEAS_SERVICE_DECK_VOLUME.maximum[1] < HIGH_SEAS_LEVELS.mainDeck;
//#endregion
export { HIGH_SEAS_SERVICE_DECK_CEILING_BELOW_MAIN_DECK, HIGH_SEAS_SERVICE_DECK_PRACTICALS, HIGH_SEAS_SERVICE_DECK_VOLUME, definition };
