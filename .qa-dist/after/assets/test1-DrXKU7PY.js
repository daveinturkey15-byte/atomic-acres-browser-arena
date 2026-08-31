import { n as buildTest1 } from "./test-maps-Ch400swx.js";
import { a as createProceduralArenaVisualDefinition, i as colorPipeline, n as budgets, r as camera, t as SHARED_GAMEPLAY_ASSETS } from "./shared-DJLv0O_l.js";
//#region src/rendering/arenas/test1.ts
/**
* Test1 (owner 2026-08-30, docs/TEST1_MAP_BRIEF.md): sun-bleached range
* training ground. Hard mid-morning sun, dry dust, no interior volumes - every
* structure is open-air, so the rig stays sun + ambient with emissive-only
* practicals (the D3D12 pipeline-budget posture all outdoor arenas share; see
* followUps for why a real punctual light is still not justified here).
*
* Lighting rig v2 (owner "we need to use some of your better techniques ... and
* lighting", against docs/UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md
* "Lighting, sky and atmosphere"). Four changes, in payoff order:
*
* 0. WHAT IS NOT TRUE ON THIS ROUTE, recorded because three of the four notes
*    below were written against it. `arena-environment-ibl.ts` PMREMs the sky
*    backdrop into `scene.environment`, and that is where every claim about
*    "the lower hemisphere IS the ground-bounce irradiance band" comes from.
*    Measured 2026-08-30 on installed Chrome, WebGPU, render=quality:
*    `scene.environment === null` on all eight arenas, `scene.environmentIntensity
*    === 1` (its untouched default). So `arenaEnvironmentScale('test1') = 0.16`
*    never reaches a shader, the sky's authored hemispheres light nothing, and
*    any `metalness > 0` is a pure subtraction of diffuse with no specular to
*    replace it. Fixing that is engine work outside this file; the numbers
*    below are authored for the route as it actually runs.
*
* 1. THE SKY IS NOW THE ARENA'S OWN. The 'range-midmorning' preset used to be
*    overwritten at runtime by the terminal airport-dawn panorama, so nothing
*    authored for this arena's time of day ever reached the frame - and since
*    arena-environment-ibl.ts PMREMs scene.background, the ambient and IBL were
*    another arena's sky as well. That substitution is gone (sky-backdrop.ts),
*    which is what makes every number below mean anything.
* 2. AMBIENT RE-HUED COOL. The extraction's headline finding is that a flat
*    AmbientLight adds identical irradiance to a soffit, a north wall and the
*    ground, which is the "lit by a constant" read. The fix it prescribes is a
*    normal-gated two-band fill node, which an arena definition cannot inject;
*    what a definition CAN do is make the one flat term it owns a COOL fill
*    against the warm key, which is the warm-light/blue-shadow separation that
*    reads as crisp desert light. Hue moved from near-grey 0xc9d4dd to a
*    saturated sky blue - the extraction's k=1.18 chroma push applied to an
*    authored colour instead of a computed one.
*
*    v2 ALSO cut the intensity 0.42 -> 0.33, on the theory that PMREM would
*    make up the difference from the sky preset's authored ground hemisphere.
*    That theory is false on this route and the intensity is restored (art
*    pass 2026-08-30). `scene.environment` measures NULL on every one of the
*    eight arenas under `?renderer=webgpu&render=quality`, so no PMREM
*    irradiance reaches any surface: the two-band gating that was supposed to
*    replace the flat term never ran, and the cut was 0.35 stops taken off the
*    only fill these arenas have. Shadowed pixels in the shipped flyover
*    measured mean linear Y 0.023 against Atomic Acres' 0.050 and Farcrysis'
*    0.121 at an identical key (0.42/0.41/0.37) - the entire luminance gap
*    between this arena and the ones it ships beside is in the fill.
* 3. FOG STOPPED HAZING THE MAP. near 46 m hazed the far third of every
*    sightline, on a brief that says "hard, clear sky". The v2 fix computed the
*    diagonal from the 52x38 m ground rather than from TEST1_BOUNDS (64x46 m,
*    diagonal 78.7 m), so near 62 still hazed the longest 17 m of the map. near
*    is now 82 m, genuinely past the diagonal, so haze is aerial perspective on
*    the backdrop only and its colour is the horizon dust band.
* 4. SHADOW BIAS DERIVED, NOT EYEBALLED. graphics-refinement.ts fits this arena
*    a 68x54 m shadow volume; at mapSize 2048 that is 33 mm per texel. Upstream
*    expresses normal-offset bias as texelWorld * (0.55 + 1.1 * (1 - NdL)),
*    which at a mid-morning NdL of ~0.6 gives 0.033 - so the authored 0.03 was
*    slightly under one texel. 2048 is kept deliberately: upstream measured
*    that 4 x 4096 R32F is a quarter of a gigabyte of shadow nobody can see.
*/
var definition = createProceduralArenaVisualDefinition({
	id: "test1",
	displayLabel: "Test1",
	moduleId: "arena.visual.test1.v1",
	assetDependencies: [],
	sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
	lighting: {
		sunColor: 16773846,
		sunIntensity: 3.2,
		ambientColor: 11126504,
		ambientIntensity: .42,
		practicals: [{
			id: "test1-range-practicals",
			policy: "emissive-only",
			maximumDistance: 0,
			castsShadow: false
		}]
	},
	fog: {
		color: 13489885,
		near: 82,
		far: 168
	},
	shadows: {
		enabled: true,
		mapSize: 2048,
		maximumDistance: 130,
		normalBias: .033
	},
	atmosphere: {
		preset: "range-midmorning",
		mist: .05,
		dust: .22,
		clouds: false
	},
	colorPipeline: colorPipeline("pass81.test1.hdr.v1", 1.05),
	budgets: budgets({
		maximumDrawCalls: 380,
		maximumTriangles: 6e5
	}),
	reviewCameras: [
		camera("test1-tower-overview", [
			20,
			16,
			26
		], [
			0,
			2.4,
			0
		], "overview", 1.05),
		camera("test1-firing-line", [
			-24,
			1.7,
			-14
		], [
			-14,
			1.4,
			8
		], "geometry", 1.05),
		camera("test1-container-occlusion", [
			10,
			2.2,
			-12
		], [
			18,
			1.6,
			4
		], "light-occlusion", 1.05),
		camera("test1-into-sun-hardpan", [
			4.5,
			1.85,
			-13.5
		], [
			-17.7,
			3.4,
			.1
		], "light-occlusion", 1.05)
	],
	collisionIdentity: {
		authoritativeArenaId: "test1",
		evidence: "ArenaMap test1 collider, spawn and shot-surface identity from buildTest1",
		presentationMayMutateAuthority: false
	},
	exceptions: []
}, buildTest1);
//#endregion
export { definition };
