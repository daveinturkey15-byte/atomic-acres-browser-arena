import { r as buildTest2 } from "./test-maps-Ch400swx.js";
import { a as createProceduralArenaVisualDefinition, i as colorPipeline, n as budgets, r as camera, t as SHARED_GAMEPLAY_ASSETS } from "./shared-DJLv0O_l.js";
//#region src/rendering/arenas/test2.ts
/**
* Test2 (owner 2026-08-30, docs/TEST2_MAP_BRIEF.md): sun-drenched hillside
* mansion at late afternoon - long warm shadows over travertine, pool glint,
* hedges. Open-air throughout; emissive-only practicals, golden key light.
*
* Lighting rig v2, same programme as test1.ts and from the same source
* (docs/UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md, "Lighting, sky and
* atmosphere"), tuned for the opposite end of the day:
*
* 0. WHAT IS NOT TRUE ON THIS ROUTE. See the identical note in test1.ts:
*    `scene.environment` measures NULL on all eight arenas on the WebGPU
*    quality route (2026-08-30), so the PMREM every claim below leans on is not
*    reaching any surface. `arenaEnvironmentScale('test2') = 0.22` is inert,
*    the authored ground hemisphere lights nothing, and metalness is a pure
*    subtraction. The numbers here are authored for the route as it runs.
*
* 1. THE SKY IS NOW THE ARENA'S OWN. 'estate-golden-hour' was being replaced at
*    runtime by the terminal airport-dawn panorama - a clear blue mid-morning
*    dome standing in for golden hour - and, through the PMREM in
*    arena-environment-ibl.ts, that dome was also the arena's entire ambient
*    and reflection source. Removed in sky-backdrop.ts. Its authored sun disc
*    was additionally 21.6 degrees BELOW the horizon, so its glow was baked
*    into the ground half of the IBL; it now sits on the key.
* 2. THE FLAT AMBIENT STAYS COOL. The extraction is explicit that lerping a
*    warm bounce into the fill instead of normal-gating it puts a warm street
*    bounce on every wall and makes shadows warmer than the sun casting them,
*    so the one flat term this definition owns is held cool (0xa9c2d8 ->
*    0x8fb2d8) and the warmth is left to the key.
*
*    v2 also cut it 0.46 -> 0.36 on the strength of the preset's authored
*    ground hemisphere reaching surfaces through PMREM. It does not (note 0),
*    so the intensity is restored (art pass 2026-08-30). Shadowed pixels in the
*    shipped flyover measured mean linear Y 0.038 against Atomic Acres' 0.050
*    and Farcrysis' 0.121 at an identical key.
* 3. THE KEY IS RE-SPECTRALISED AT CONSTANT LUMINANCE. 0xffd9a0 at 2.9 has
*    Rec.709 luminance 0.867 * 2.9 = 2.513. The golden-hour hue 0xffcf92
*    measures 0.835, so 3.0 reproduces the same 2.51 luminous key with a fully
*    golden spectrum: the arena gets warmer without getting brighter, and the
*    change is arithmetic rather than a re-eyeball.
* 4. SHADOW BIAS DERIVED, AND RE-DERIVED 2026-08-31. The same arithmetic, on
*    the rebuilt map. graphics-refinement.ts now fits Test2 a 108 x 84 m shadow
*    volume (was 80 x 64), so 2048 gives 52.7 mm per texel rather than 39 mm.
*    Upstream's normal-offset bias is texelWorld * (0.55 + 1.1 * (1 - NdL));
*    the ground here sees NdL = sin(18.4 deg) = 0.315, giving 1.30 * 0.0527 =
*    0.069. Holding the old 0.051 through a 35% larger texel is how acne comes
*    back on the long travertine runs this arena is mostly made of. 2048 is
*    kept: 108 m at 4096 would quarter the texel and double the shadow-map
*    pixel budget for a map whose tallest mass is a 4.8 m parapet.
*
* indirectScale/exposureBias are deliberately left at unity: the extraction's
* curves only start stopping the indirect budget down below 14 degrees of solar
* elevation, and the key this arena is actually given sits at 18.4.
*/
var definition = createProceduralArenaVisualDefinition({
	id: "test2",
	displayLabel: "Test2",
	moduleId: "arena.visual.test2.v1",
	assetDependencies: [],
	sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
	lighting: {
		sunColor: 16764818,
		sunIntensity: 3,
		ambientColor: 9417432,
		ambientIntensity: .46,
		practicals: [{
			id: "test2-estate-practicals",
			policy: "emissive-only",
			maximumDistance: 0,
			castsShadow: false
		}]
	},
	fog: {
		color: 14468301,
		near: 128,
		far: 216
	},
	shadows: {
		enabled: true,
		mapSize: 2048,
		maximumDistance: 150,
		normalBias: .069
	},
	atmosphere: {
		preset: "estate-golden-hour",
		mist: .1,
		dust: .08,
		clouds: true
	},
	colorPipeline: colorPipeline("pass81.test2.hdr.v1", 1.07),
	budgets: budgets({
		maximumDrawCalls: 420,
		maximumTriangles: 7e5
	}),
	reviewCameras: [
		camera("test2-estate-overview", [
			44,
			34,
			50
		], [
			-2,
			2,
			-6
		], "overview", 1.07),
		camera("test2-pool-lane", [
			-34,
			1.65,
			-23
		], [
			14,
			1.4,
			-23
		], "geometry", 1.07),
		camera("test2-garden-occlusion", [
			24,
			2.4,
			22
		], [
			-12,
			1.4,
			20
		], "light-occlusion", 1.07),
		camera("test2-into-sun-terrace", [
			20,
			1.9,
			15
		], [
			-5.6,
			3.6,
			30.7
		], "light-occlusion", 1.07)
	],
	collisionIdentity: {
		authoritativeArenaId: "test2",
		evidence: "ArenaMap test2 collider, spawn and shot-surface identity from buildTest2",
		presentationMayMutateAuthority: false
	},
	exceptions: ["pool water sheet is presentation-only; the basin slab beneath it is the movement/shot authority"]
}, buildTest2);
//#endregion
export { definition };
