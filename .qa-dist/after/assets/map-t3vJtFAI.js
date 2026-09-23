import { t as __vitePreload } from "./preload-helper-d_geVdlX.js";
import { Ba as Box3, Dd as Shape, Fs as Group, Ha as BoxGeometry, If as Vector3, Ld as SphereGeometry, Po as CylinderGeometry, Qa as CapsuleGeometry, Ql as Path, Sd as SRGBColorSpace, Za as CanvasTexture, ll as MeshPhysicalMaterial, ms as ExtrudeGeometry, nl as MeshBasicMaterial, tl as Mesh, tu as PlaneGeometry, ul as MeshStandardMaterial } from "./vendor-three-aHPbjK02.js";
import { Dn as HOUSE_DESTRUCTION_DEFINITION_SET_ID, On as createAtomicHouseFragmentDefinitions, q as texturedMaterial } from "./gameplay-CLjw_XSX.js";
import { C as PARKED_VAN_LAYOUT, D as STREET_CRATE_HEIGHT, E as SPAWN_LAYOUT, S as NEIGHBOURHOOD_BIN_POSITIONS, T as PATROL_LAYOUT, _ as KERB_CAR_LAYOUT, b as NEIGHBOURHOOD_BENCH_LAYOUT, c as createBallisticSurface, d as ARENA_BOUNDS, f as CENTRAL_BUS, g as HOUSE_LAYOUT, h as GARAGE_SIZE, j as STREET_HALF_WIDTH, k as STREET_CRATE_TALL_HEIGHT, m as GARAGE_LAYOUT, n as classifyImpactSurface, p as COVER_LAYOUT, v as KERB_CAR_SIZE, w as PARKED_VAN_SIZE, x as NEIGHBOURHOOD_BIN_COLLIDER_SIZE, y as NEIGHBOURHOOD_BENCH_COLLIDER_SIZE } from "./combat-feedback-BhVh1Qvu.js";
//#region src/retry-load.ts
/**
* Owner 2026-08-30: a single transient 503 from GitHub Pages on the rapier
* chunk permanently killed map selection ("[Nuke Town map selection failed]
* TypeError: Failed to fetch dynamically imported module") — the player saw
* an unplayable build because one CDN hiccup was treated as fatal. Network
* failures on dynamic chunks and streamed assets are retryable by spec (the
* module map only caches successful resolutions), so every lazy load goes
* through this bounded retry.
*/
async function retryLoad(label, load, attempts = 3, baseDelayMs = 450, wait = (ms) => new Promise((resolve) => {
	setTimeout(resolve, ms);
})) {
	let lastError;
	for (let attempt = 1; attempt <= attempts; attempt += 1) try {
		return await load();
	} catch (error) {
		lastError = error;
		if (attempt === attempts) break;
		console.warn(`[retry-load] ${label} attempt ${attempt}/${attempts} failed; retrying`, error);
		await wait(baseDelayMs * attempt);
	}
	throw lastError;
}
//#endregion
//#region src/house-navigation.ts
var WIDTH = 20.2;
var DEPTH = 16.4;
var WALL = .42;
var GROUND_HEIGHT = 3.35;
var UPPER_HEIGHT = 3.45;
var FLOOR_Y = 3.48;
var HALF_WIDTH = WIDTH / 2;
var HALF_DEPTH = DEPTH / 2;
var WINDOW_SILL_TOP = .58;
var WINDOW_OPENING_TOP = 2.55;
var WINDOW_OPENING_HEIGHT = WINDOW_OPENING_TOP - WINDOW_SILL_TOP;
var WINDOW_CENTRE_Y = 3.13 / 2;
var UPPER_WINDOW_SILL_TOP = .32;
var UPPER_WINDOW_OPENING_HEIGHT = WINDOW_OPENING_TOP - UPPER_WINDOW_SILL_TOP;
var RAMP_BOTTOM_Z = 6;
var RAMP_TOP_Z = -3.4;
var RAMP_ENTRY_Z = -4.8;
var RAMP_RISE = FLOOR_Y;
var RAMP_RUN = RAMP_BOTTOM_Z - RAMP_TOP_Z;
var RAMP_WIDTH = 2.8;
var INDOOR_RAMP_BOTTOM_Z = 7;
var INDOOR_RAMP_TOP_Z = .8;
var INDOOR_RAMP_RISE = FLOOR_Y;
var INDOOR_RAMP_RUN = INDOOR_RAMP_BOTTOM_Z - INDOOR_RAMP_TOP_Z;
var INDOOR_RAMP_WIDTH = 2.2;
var INDOOR_RAMP_X = HALF_WIDTH - 1.75;
var INDOOR_OPENING_FRONT_Z = 6.1;
var INDOOR_OPENING_REAR_Z = .1;
var FLOOR_OUTER_X = HALF_WIDTH - .1;
var FLOOR_OUTER_Z = HALF_DEPTH - .1;
var INDOOR_OPENING_INNER_X = HALF_WIDTH - 3.4;
var DOOR_FRAME_OUTSET = .3;
var SEAM_OUTSET = .29;
var solid = (name, position, size, surface, collidable = true, kind = "wall", rotation) => ({
	id: name,
	name,
	position,
	size,
	surface,
	collidable,
	kind,
	breakable: kind === "glass",
	rotation
});
function splitWallAroundDoor(name, z, centreX, width, surface, baseY = 0, openToCeiling = false) {
	const left = centreX - width / 2;
	const right = centreX + width / 2;
	const height = baseY === 0 ? GROUND_HEIGHT : UPPER_HEIGHT;
	return [
		solid(`${name}-left`, [
			(-10.1 + left) / 2,
			baseY + height / 2,
			z
		], [
			left + HALF_WIDTH,
			height,
			WALL
		], surface),
		solid(`${name}-right`, [
			(right + HALF_WIDTH) / 2,
			baseY + height / 2,
			z
		], [
			HALF_WIDTH - right,
			height,
			WALL
		], surface),
		...openToCeiling ? [] : [solid(`${name}-lintel`, [
			centreX,
			baseY + height - .28,
			z
		], [
			width,
			.56,
			WALL
		], "trim")]
	];
}
function splitSideWallAroundDoor(name, x, centreZ, width, surface, baseY, openToCeiling = false) {
	const rearEdge = centreZ - width / 2;
	const frontEdge = centreZ + width / 2;
	const sideRear = -7.989999999999999;
	const sideFront = HALF_DEPTH - WALL / 2;
	const height = baseY === 0 ? GROUND_HEIGHT : UPPER_HEIGHT;
	return [
		solid(`${name}-rear`, [
			x,
			baseY + height / 2,
			(sideRear + rearEdge) / 2
		], [
			WALL,
			height,
			rearEdge - sideRear
		], surface),
		solid(`${name}-front`, [
			x,
			baseY + height / 2,
			(frontEdge + sideFront) / 2
		], [
			WALL,
			height,
			sideFront - frontEdge
		], surface),
		...openToCeiling ? [] : [solid(`${name}-lintel`, [
			x,
			baseY + height - .28,
			centreZ
		], [
			WALL,
			.56,
			width
		], "trim")]
	];
}
function groundFrontWall(surface) {
	const doorX = -3.8;
	const doorWidth = 2.2;
	const windowX = 4.8;
	const windowWidth = 2.8;
	const doorRight = -2.6999999999999997;
	const windowLeft = windowX - windowWidth / 2;
	return [
		solid("front-ground-far-left", [
			-15 / 2,
			GROUND_HEIGHT / 2,
			HALF_DEPTH
		], [
			5.199999999999999,
			GROUND_HEIGHT,
			WALL
		], surface),
		solid("front-ground-centre", [
			.7000000000000002 / 2,
			GROUND_HEIGHT / 2,
			HALF_DEPTH
		], [
			windowLeft - doorRight,
			GROUND_HEIGHT,
			WALL
		], surface),
		solid("front-ground-far-right", [
			16.299999999999997 / 2,
			GROUND_HEIGHT / 2,
			HALF_DEPTH
		], [
			HALF_WIDTH - 6.199999999999999,
			GROUND_HEIGHT,
			WALL
		], surface),
		solid("front-door-lintel", [
			doorX,
			3.05,
			HALF_DEPTH
		], [
			doorWidth,
			.6,
			WALL
		], "trim"),
		solid("ground-window-sill-wall", [
			windowX,
			WINDOW_SILL_TOP / 2,
			HALF_DEPTH
		], [
			windowWidth,
			WINDOW_SILL_TOP,
			WALL
		], surface),
		solid("ground-window-lintel-wall", [
			windowX,
			5.9 / 2,
			HALF_DEPTH
		], [
			windowWidth,
			GROUND_HEIGHT - WINDOW_OPENING_TOP,
			WALL
		], surface),
		solid("ground-window-glass", [
			windowX,
			WINDOW_CENTRE_Y,
			8.219999999999999
		], [
			windowWidth,
			WINDOW_OPENING_HEIGHT,
			.08
		], "glass", false, "glass")
	];
}
function groundRearWall(surface) {
	const doorX = 3.8;
	const doorWidth = 2.2;
	const windowX = -4.8;
	const windowWidth = 2.8;
	const windowRight = -3.4;
	const doorLeft = doorX - doorWidth / 2;
	return [
		solid("rear-ground-far-left", [
			-16.299999999999997 / 2,
			GROUND_HEIGHT / 2,
			-8.2
		], [
			3.9000000000000004,
			GROUND_HEIGHT,
			WALL
		], surface),
		solid("rear-ground-centre", [
			-.7000000000000002 / 2,
			GROUND_HEIGHT / 2,
			-8.2
		], [
			doorLeft - windowRight,
			GROUND_HEIGHT,
			WALL
		], surface),
		solid("rear-ground-far-right", [
			15 / 2,
			GROUND_HEIGHT / 2,
			-8.2
		], [
			HALF_WIDTH - 4.9,
			GROUND_HEIGHT,
			WALL
		], surface),
		solid("rear-door-lintel", [
			doorX,
			3.05,
			-8.2
		], [
			doorWidth,
			.6,
			WALL
		], "trim"),
		solid("rear-ground-window-sill-wall", [
			windowX,
			WINDOW_SILL_TOP / 2,
			-8.2
		], [
			windowWidth,
			WINDOW_SILL_TOP,
			WALL
		], surface),
		solid("rear-ground-window-lintel-wall", [
			windowX,
			5.9 / 2,
			-8.2
		], [
			windowWidth,
			GROUND_HEIGHT - WINDOW_OPENING_TOP,
			WALL
		], surface),
		solid("rear-ground-window-glass", [
			windowX,
			WINDOW_CENTRE_Y,
			-8.219999999999999
		], [
			windowWidth,
			WINDOW_OPENING_HEIGHT,
			.08
		], "glass", false, "glass")
	];
}
function upperFrontWall(surface) {
	const windowX = 0;
	const windowWidth = 3.2;
	return [
		solid("front-upper-left", [
			-11.7 / 2,
			5.205,
			HALF_DEPTH
		], [
			8.5,
			UPPER_HEIGHT,
			WALL
		], surface),
		solid("front-upper-right", [
			11.7 / 2,
			5.205,
			HALF_DEPTH
		], [
			HALF_WIDTH - 1.6,
			UPPER_HEIGHT,
			WALL
		], surface),
		solid("upper-window-sill-wall", [
			windowX,
			3.64,
			HALF_DEPTH
		], [
			windowWidth,
			UPPER_WINDOW_SILL_TOP,
			WALL
		], surface),
		solid("upper-window-lintel-wall", [
			windowX,
			12.96 / 2,
			HALF_DEPTH
		], [
			windowWidth,
			.9000000000000004,
			WALL
		], surface),
		solid("upper-window-glass", [
			windowX,
			4.915,
			8.219999999999999
		], [
			windowWidth,
			UPPER_WINDOW_OPENING_HEIGHT,
			.12
		], "glass", false, "glass")
	];
}
/**
* HF-387 player-body half: frame trim used to be authored non-collidable,
* so brushing a jamb put the camera eye up to 1.5 cm from (or inside) the
* visible trim slab while the wall opening itself stopped the capsule. The
* posts sit exactly on the opening edges, so giving them colliders does not
* narrow any walk-through width; it makes visible mass match movement and
* shot authority as the forging review requires.
*/
function doorFrame(id, x, z, baseY = 0) {
	const width = 2.2;
	return [
		solid(`${id}-frame-left`, [
			x - width / 2 - .09,
			baseY + 1.42,
			z
		], [
			.18,
			2.84,
			.16
		], "trim", true, "frame"),
		solid(`${id}-frame-right`, [
			x + width / 2 + .09,
			baseY + 1.42,
			z
		], [
			.18,
			2.84,
			.16
		], "trim", true, "frame"),
		solid(`${id}-frame-head`, [
			x,
			baseY + 2.78,
			z
		], [
			2.56,
			.18,
			.16
		], "trim", true, "frame")
	];
}
function sideDoorFrame(id, side, z, baseY) {
	const width = 2.6;
	const x = side * 10.4;
	return [
		solid(`${id}-frame-rear`, [
			x,
			baseY + 1.42,
			z - width / 2 - .09
		], [
			.16,
			2.84,
			.18
		], "trim", true, "frame"),
		solid(`${id}-frame-front`, [
			x,
			baseY + 1.42,
			z + width / 2 + .09
		], [
			.16,
			2.84,
			.18
		], "trim", true, "frame"),
		solid(`${id}-frame-head`, [
			x,
			baseY + 2.78,
			z
		], [
			.16,
			.18,
			2.96
		], "trim", true, "frame")
	];
}
function rampSolids(side) {
	const slopeLength = Math.hypot(RAMP_RUN, RAMP_RISE);
	const angle = Math.atan2(RAMP_RISE, RAMP_RUN);
	return [solid("exterior-access-ramp", [
		side * 11.95,
		1.78,
		2.6 / 2
	], [
		RAMP_WIDTH,
		.18,
		slopeLength
	], "timber", true, "ramp", [
		angle,
		0,
		0
	])];
}
function indoorRampSolids(side) {
	const slopeLength = Math.hypot(INDOOR_RAMP_RUN, INDOOR_RAMP_RISE);
	const angle = Math.atan2(INDOOR_RAMP_RISE, INDOOR_RAMP_RUN);
	const x = side * INDOOR_RAMP_X;
	const y = 1.78;
	const z = 7.8 / 2;
	const railXs = [x - side * 1.1700000000000002, x + side * 1.1700000000000002];
	const posts = [.18, .82].flatMap((progress, index) => {
		const postZ = INDOOR_RAMP_BOTTOM_Z - INDOOR_RAMP_RUN * progress;
		const postBaseY = INDOOR_RAMP_RISE * progress;
		return railXs.map((railX, sideIndex) => solid(`interior-ramp-post-${index}-${sideIndex}`, [
			railX,
			postBaseY + .38,
			postZ
		], [
			.08,
			.76,
			.08
		], "metal", false, "frame"));
	});
	return [
		solid("interior-access-ramp", [
			x,
			y,
			z
		], [
			INDOOR_RAMP_WIDTH,
			.18,
			slopeLength
		], "timber", true, "ramp", [
			angle,
			0,
			0
		]),
		solid("interior-ramp-rail-inner", [
			railXs[0],
			2.4,
			z
		], [
			.08,
			.08,
			slopeLength
		], "metal", false, "frame", [
			angle,
			0,
			0
		]),
		solid("interior-ramp-rail-outer", [
			railXs[1],
			2.4,
			z
		], [
			.08,
			.08,
			slopeLength
		], "metal", false, "frame", [
			angle,
			0,
			0
		]),
		...posts
	];
}
function upperFloorSolids(indoorSide) {
	const mainInnerEdge = indoorSide * INDOOR_OPENING_INNER_X;
	const mainMinX = indoorSide === 1 ? -10 : mainInnerEdge;
	const mainMaxX = indoorSide === 1 ? mainInnerEdge : FLOOR_OUTER_X;
	const stripMinX = indoorSide === 1 ? INDOOR_OPENING_INNER_X : -10;
	const stripMaxX = indoorSide === 1 ? FLOOR_OUTER_X : -6.699999999999999;
	const floorDepth = FLOOR_OUTER_Z * 2;
	const frontDepth = FLOOR_OUTER_Z - INDOOR_OPENING_FRONT_Z;
	return [
		solid("upper-floor-main", [
			(mainMinX + mainMaxX) / 2,
			FLOOR_Y,
			0
		], [
			mainMaxX - mainMinX,
			.32,
			floorDepth
		], "timber", true, "floor"),
		solid("upper-floor-ramp-front", [
			(stripMinX + stripMaxX) / 2,
			FLOOR_Y,
			14.2 / 2
		], [
			stripMaxX - stripMinX,
			.32,
			frontDepth
		], "timber", true, "floor"),
		solid("upper-floor-ramp-rear", [
			(stripMinX + stripMaxX) / 2,
			FLOOR_Y,
			-8 / 2
		], [
			stripMaxX - stripMinX,
			.32,
			8.2
		], "timber", true, "floor")
	];
}
function simplePlan(surface, rampSide) {
	const doorX = -3.8;
	const rearDoorX = 3.8;
	const partitionOpeningX = 2;
	const rampWallX = rampSide * HALF_WIDTH;
	const indoorRampSide = -rampSide;
	const sideWallDepth = DEPTH - WALL;
	const westUpperWall = rampSide === -1 ? splitSideWallAroundDoor("upper-ramp-side-wall", -10.1, RAMP_ENTRY_Z, 2.6, surface, FLOOR_Y, true) : [solid("upper-west-wall", [
		-10.1,
		5.205,
		0
	], [
		WALL,
		UPPER_HEIGHT,
		sideWallDepth
	], surface)];
	const eastUpperWall = rampSide === 1 ? splitSideWallAroundDoor("upper-ramp-side-wall", HALF_WIDTH, RAMP_ENTRY_Z, 2.6, surface, FLOOR_Y, true) : [solid("upper-east-wall", [
		HALF_WIDTH,
		5.205,
		0
	], [
		WALL,
		UPPER_HEIGHT,
		sideWallDepth
	], surface)];
	const solids = [
		solid("ground-west-wall", [
			-10.1,
			GROUND_HEIGHT / 2,
			0
		], [
			WALL,
			GROUND_HEIGHT,
			sideWallDepth
		], surface),
		solid("ground-east-wall", [
			HALF_WIDTH,
			GROUND_HEIGHT / 2,
			0
		], [
			WALL,
			GROUND_HEIGHT,
			sideWallDepth
		], surface),
		...groundRearWall(surface),
		...groundFrontWall(surface),
		...doorFrame("front-entry", doorX, 8.5),
		...doorFrame("rear-entry", rearDoorX, -8.2 - DOOR_FRAME_OUTSET),
		...splitWallAroundDoor("ground-room-partition", 0, partitionOpeningX, 2.6, "plaster", 0, true),
		solid("ground-floor-slab", [
			0,
			.06,
			0
		], [
			WIDTH - .2,
			.12,
			DEPTH - .2
		], "concrete", false, "floor"),
		solid("authored-storage-locker", [
			indoorRampSide * 6.75,
			.82,
			-5.65
		], [
			1.24,
			1.64,
			.72
		], "metal", true, "wall"),
		...westUpperWall,
		...eastUpperWall,
		solid("upper-rear-wall", [
			0,
			5.205,
			-8.2
		], [
			20.62,
			UPPER_HEIGHT,
			WALL
		], surface),
		...upperFrontWall(surface),
		...splitWallAroundDoor("upper-room-partition", 0, partitionOpeningX, 2.6, "plaster", FLOOR_Y, true),
		...sideDoorFrame("upper-ramp-entry", rampSide, RAMP_ENTRY_Z, FLOOR_Y),
		solid("floor-seam-front", [
			0,
			FLOOR_Y - .05,
			8.489999999999998
		], [
			20.439999999999998,
			.18,
			.14
		], "trim", false, "frame"),
		solid("floor-seam-rear", [
			0,
			FLOOR_Y - .05,
			-8.2 - SEAM_OUTSET
		], [
			20.439999999999998,
			.18,
			.14
		], "trim", false, "frame"),
		solid("floor-seam-west", [
			-10.1 - SEAM_OUTSET,
			FLOOR_Y - .05,
			0
		], [
			.14,
			.18,
			DEPTH
		], "trim", false, "frame"),
		solid("floor-seam-east", [
			10.389999999999999,
			FLOOR_Y - .05,
			0
		], [
			.14,
			.18,
			DEPTH
		], "trim", false, "frame"),
		solid("entrance-canopy", [
			surface === "aqua" ? .55 : -.55,
			3.05,
			8.78
		], [
			4.4,
			.16,
			1.4
		], "metal", true, "landing"),
		...upperFloorSolids(indoorRampSide),
		solid("ramp-top-landing", [
			rampSide * 11.95,
			FLOOR_Y,
			-8.54 / 2
		], [
			3.9,
			.32,
			-3.34 - (RAMP_ENTRY_Z - .4)
		], "timber", true, "landing"),
		solid("interior-ramp-top-landing", [
			indoorRampSide * (16.15 / 2),
			FLOOR_Y,
			.9600000000000001 / 2
		], [
			9.45 - INDOOR_OPENING_INNER_X,
			.32,
			.8600000000000001 - INDOOR_OPENING_REAR_Z
		], "timber", true, "landing"),
		...rampSolids(rampSide),
		...indoorRampSolids(indoorRampSide)
	];
	const rooms = [
		{
			id: "ground-front-room",
			level: "ground",
			centre: [
				0,
				0,
				4
			],
			size: [19.4, 7.6]
		},
		{
			id: "ground-rear-room",
			level: "ground",
			centre: [
				0,
				0,
				-4
			],
			size: [19.4, 7.6]
		},
		{
			id: "upper-front-room",
			level: "upper",
			centre: [
				0,
				FLOOR_Y,
				4
			],
			size: [19.4, 7.6]
		},
		{
			id: "upper-rear-room",
			level: "upper",
			centre: [
				0,
				FLOOR_Y,
				-4
			],
			size: [19.4, 7.6]
		}
	];
	const openings = [
		{
			id: "front-door",
			kind: "exterior-door",
			centre: [
				doorX,
				1.4,
				HALF_DEPTH
			],
			width: 2.2,
			height: 2.8,
			route: true
		},
		{
			id: "rear-door",
			kind: "exterior-door",
			centre: [
				rearDoorX,
				1.4,
				-8.2
			],
			width: 2.2,
			height: 2.8,
			route: true
		},
		{
			id: "ground-room-opening",
			kind: "interior-opening",
			centre: [
				partitionOpeningX,
				1.4,
				0
			],
			width: 2.6,
			height: 2.8,
			route: true
		},
		{
			id: "upper-room-opening",
			kind: "interior-opening",
			centre: [
				partitionOpeningX,
				4.88,
				0
			],
			width: 2.6,
			height: 2.8,
			route: true
		},
		{
			id: "upper-ramp-entry",
			kind: "ramp-entry",
			centre: [
				rampWallX,
				4.88,
				RAMP_ENTRY_Z
			],
			width: 2.6,
			height: 2.8,
			route: true
		},
		{
			id: "front-ground-window",
			kind: "window",
			centre: [
				4.8,
				WINDOW_CENTRE_Y,
				HALF_DEPTH
			],
			width: 2.8,
			height: WINDOW_OPENING_HEIGHT,
			route: true
		},
		{
			id: "rear-ground-window",
			kind: "window",
			centre: [
				-4.8,
				WINDOW_CENTRE_Y,
				-8.2
			],
			width: 2.8,
			height: WINDOW_OPENING_HEIGHT,
			route: true
		},
		{
			id: "upper-window",
			kind: "window",
			centre: [
				0,
				4.915,
				HALF_DEPTH
			],
			width: 3.2,
			height: UPPER_WINDOW_OPENING_HEIGHT,
			route: true
		}
	];
	const rampX = rampSide * 11.95;
	const indoorRampX = indoorRampSide * INDOOR_RAMP_X;
	return {
		rooms,
		solids,
		openings,
		anchors: [
			{
				id: "front-yard",
				position: [
					doorX,
					1.7,
					9.9
				],
				level: "ground"
			},
			{
				id: "front-door-inside",
				position: [
					doorX,
					1.7,
					7
				],
				level: "ground"
			},
			{
				id: "ground-front",
				position: [
					doorX,
					1.7,
					3.2
				],
				level: "ground"
			},
			{
				id: "ground-opening",
				position: [
					partitionOpeningX,
					1.7,
					0
				],
				level: "ground"
			},
			{
				id: "ground-rear",
				position: [
					rearDoorX,
					1.7,
					-3.2
				],
				level: "ground"
			},
			{
				id: "rear-door-inside",
				position: [
					rearDoorX,
					1.7,
					-7
				],
				level: "ground"
			},
			{
				id: "rear-yard",
				position: [
					rearDoorX,
					1.7,
					-9.9
				],
				level: "ground"
			},
			{
				id: "ramp-approach",
				position: [
					rampX,
					1.7,
					8
				],
				level: "ground"
			},
			{
				id: "ramp-foot",
				position: [
					rampX,
					1.7,
					RAMP_BOTTOM_Z
				],
				level: "ground"
			},
			{
				id: "ramp-mid",
				position: [
					rampX,
					3.44,
					2.6 / 2
				],
				level: "upper"
			},
			{
				id: "ramp-top",
				position: [
					rampX,
					5.18,
					RAMP_TOP_Z
				],
				level: "upper"
			},
			{
				id: "landing-exit",
				position: [
					rampSide * (HALF_WIDTH - 1),
					5.18,
					RAMP_ENTRY_Z
				],
				level: "upper"
			},
			{
				id: "indoor-ramp-foot",
				position: [
					indoorRampX,
					1.7,
					INDOOR_RAMP_BOTTOM_Z
				],
				level: "ground"
			},
			{
				id: "indoor-ramp-mid",
				position: [
					indoorRampX,
					3.44,
					7.8 / 2
				],
				level: "upper"
			},
			{
				id: "indoor-ramp-top",
				position: [
					indoorRampX,
					5.18,
					INDOOR_RAMP_TOP_Z
				],
				level: "upper"
			},
			{
				id: "indoor-landing-exit",
				position: [
					indoorRampSide * (INDOOR_OPENING_INNER_X - .4),
					5.18,
					INDOOR_RAMP_TOP_Z
				],
				level: "upper"
			},
			{
				id: "upper-rear",
				position: [
					rampSide * 4,
					5.18,
					-3.5
				],
				level: "upper"
			},
			{
				id: "upper-opening",
				position: [
					partitionOpeningX,
					5.18,
					0
				],
				level: "upper"
			},
			{
				id: "upper-front",
				position: [
					partitionOpeningX,
					5.18,
					3.5
				],
				level: "upper"
			}
		],
		routes: {
			"ground-room-flow": [
				"front-yard",
				"front-door-inside",
				"ground-front",
				"ground-opening",
				"ground-rear",
				"rear-door-inside",
				"rear-yard"
			],
			"ramp-room-flow": [
				"front-yard",
				"ramp-approach",
				"ramp-foot",
				"ramp-mid",
				"ramp-top",
				"landing-exit",
				"upper-rear",
				"upper-opening",
				"upper-front"
			],
			"indoor-ramp-room-flow": [
				"front-door-inside",
				"ground-front",
				"indoor-ramp-foot",
				"indoor-ramp-mid",
				"indoor-ramp-top",
				"indoor-landing-exit",
				"upper-front",
				"upper-opening",
				"upper-rear"
			]
		}
	};
}
function worldPosition(position, x, z, facing) {
	return [
		x + position[0],
		position[1],
		z + facing * position[2]
	];
}
function worldRotation(rotation, facing) {
	return rotation ? [
		rotation[0] * facing,
		rotation[1],
		rotation[2]
	] : void 0;
}
/** Shared simplified declaration used by rendering, collision and traversal tests. */
function createHouseArchitecture(team, x, z, facing) {
	const local = simplePlan(team === 0 ? "aqua" : "coral", team === 0 ? -1 : 1);
	const id = team === 0 ? "aqua-irrigation-workshop" : "coral-orchard-conservatory";
	return {
		id,
		label: team === 0 ? "Aqua House" : "Coral House",
		team,
		origin: {
			x,
			z,
			facing
		},
		dimensions: {
			width: WIDTH,
			depth: DEPTH,
			wallThickness: WALL
		},
		rooms: local.rooms.map((entry) => ({
			...entry,
			centre: worldPosition(entry.centre, x, z, facing)
		})),
		solids: local.solids.map((entry) => ({
			...entry,
			id: `${id}:${entry.id}`,
			position: worldPosition(entry.position, x, z, facing),
			rotation: worldRotation(entry.rotation, facing)
		})),
		openings: local.openings.map((entry) => ({
			...entry,
			centre: worldPosition(entry.centre, x, z, facing)
		})),
		anchors: local.anchors.map((entry) => ({
			...entry,
			position: worldPosition(entry.position, x, z, facing)
		})),
		routes: local.routes
	};
}
function solidBounds(solidEntry) {
	return {
		minX: solidEntry.position[0] - solidEntry.size[0] / 2,
		maxX: solidEntry.position[0] + solidEntry.size[0] / 2,
		minY: solidEntry.position[1] - solidEntry.size[1] / 2,
		maxY: solidEntry.position[1] + solidEntry.size[1] / 2,
		minZ: solidEntry.position[2] - solidEntry.size[2] / 2,
		maxZ: solidEntry.position[2] + solidEntry.size[2] / 2,
		rotation: solidEntry.rotation
	};
}
//#endregion
//#region src/physics.ts
var CHARACTER_PHYSICS_CONFIG = Object.freeze({
	controllerOffset: .025,
	autostepHeight: .42,
	autostepMinimumWidth: .22,
	snapToGround: .24,
	maximumSlopeClimbDegrees: 50,
	minimumSlopeSlideDegrees: 55,
	gravity: -22,
	playerRadius: .38,
	playerHalfHeight: .53
});
var STANCE_SHAPES = {
	stand: {
		halfHeight: CHARACTER_PHYSICS_CONFIG.playerHalfHeight,
		radius: CHARACTER_PHYSICS_CONFIG.playerRadius,
		eyeFromCenter: .79
	},
	crouch: {
		halfHeight: .22,
		radius: .36,
		eyeFromCenter: .58
	},
	prone: {
		halfHeight: .02,
		radius: .36,
		eyeFromCenter: .23
	}
};
var WORLD_BOUNDARY_THICKNESS = .5;
/** Physics-only perimeter walls. Their inner faces exactly match playable bounds. */
function worldBoundaryColliders(bounds, minimumY = -2) {
	return [
		{
			minX: bounds.minX - WORLD_BOUNDARY_THICKNESS,
			maxX: bounds.minX,
			minZ: bounds.minZ,
			maxZ: bounds.maxZ,
			minY: minimumY,
			maxY: 14
		},
		{
			minX: bounds.maxX,
			maxX: bounds.maxX + WORLD_BOUNDARY_THICKNESS,
			minZ: bounds.minZ,
			maxZ: bounds.maxZ,
			minY: minimumY,
			maxY: 14
		},
		{
			minX: bounds.minX,
			maxX: bounds.maxX,
			minZ: bounds.minZ - WORLD_BOUNDARY_THICKNESS,
			maxZ: bounds.minZ,
			minY: minimumY,
			maxY: 14
		},
		{
			minX: bounds.minX,
			maxX: bounds.maxX,
			minZ: bounds.maxZ,
			maxZ: bounds.maxZ + WORLD_BOUNDARY_THICKNESS,
			minY: minimumY,
			maxY: 14
		}
	];
}
function boxRotation(box) {
	if (!box.rotation) return {
		x: 0,
		y: 0,
		z: 0,
		w: 1
	};
	const [x, y, z] = box.rotation;
	const [sx, cx] = [Math.sin(x / 2), Math.cos(x / 2)];
	const [sy, cy] = [Math.sin(y / 2), Math.cos(y / 2)];
	const [sz, cz] = [Math.sin(z / 2), Math.cos(z / 2)];
	return {
		x: sx * cy * cz + cx * sy * sz,
		y: cx * sy * cz - sx * cy * sz,
		z: cx * cy * sz + sx * sy * cz,
		w: cx * cy * cz - sx * sy * sz
	};
}
function boxShape(box) {
	const minY = box.minY ?? 0;
	const maxY = box.maxY ?? 8;
	return Object.freeze({
		centre: Object.freeze({
			x: (box.minX + box.maxX) / 2,
			y: (minY + maxY) / 2,
			z: (box.minZ + box.maxZ) / 2
		}),
		halfExtents: Object.freeze({
			x: Math.max(.01, (box.maxX - box.minX) / 2),
			y: Math.max(.01, (maxY - minY) / 2),
			z: Math.max(.01, (box.maxZ - box.minZ) / 2)
		}),
		rotation: Object.freeze(boxRotation(box))
	});
}
/** Rapier-backed kinematic FPS character with stairs, slopes, sliding and ground snap. */
var CharacterPhysics = class CharacterPhysics {
	makeCapsule;
	makeCuboidDescriptor;
	makeDynamicBodyDescriptor;
	world;
	body;
	collider;
	controller;
	dynamicColliders = /* @__PURE__ */ new Map();
	majorDebrisBodies = /* @__PURE__ */ new Map();
	stance = "stand";
	constructor(world, body, collider, makeCapsule, makeCuboidDescriptor, makeDynamicBodyDescriptor) {
		this.makeCapsule = makeCapsule;
		this.makeCuboidDescriptor = makeCuboidDescriptor;
		this.makeDynamicBodyDescriptor = makeDynamicBodyDescriptor;
		this.world = world;
		this.body = body;
		this.collider = collider;
		this.controller = world.createCharacterController(CHARACTER_PHYSICS_CONFIG.controllerOffset);
		this.controller.setSlideEnabled(true);
		this.controller.setApplyImpulsesToDynamicBodies(true);
		this.controller.setCharacterMass(78);
		this.controller.enableAutostep(CHARACTER_PHYSICS_CONFIG.autostepHeight, CHARACTER_PHYSICS_CONFIG.autostepMinimumWidth, false);
		this.controller.enableSnapToGround(CHARACTER_PHYSICS_CONFIG.snapToGround);
		this.controller.setMaxSlopeClimbAngle(CHARACTER_PHYSICS_CONFIG.maximumSlopeClimbDegrees * Math.PI / 180);
		this.controller.setMinSlopeSlideAngle(CHARACTER_PHYSICS_CONFIG.minimumSlopeSlideDegrees * Math.PI / 180);
	}
	static async create(colliders, bounds, safetyFloorY = 0) {
		const { default: RAPIER } = await retryLoad("rapier3d chunk", () => __vitePreload(() => import("./rapier-CGwJCLUs.js"), [], import.meta.url));
		const originalWarn = console.warn;
		console.warn = (...args) => {
			if (args.length === 1 && args[0] === "using deprecated parameters for the initialization function; pass a single object instead") return;
			originalWarn(...args);
		};
		try {
			await RAPIER.init();
		} finally {
			console.warn = originalWarn;
		}
		const world = new RAPIER.World({
			x: 0,
			y: CHARACTER_PHYSICS_CONFIG.gravity,
			z: 0
		});
		world.timestep = 1 / 120;
		const resolvedSafetyFloorY = Number.isFinite(safetyFloorY) ? safetyFloorY : 0;
		world.createCollider(RAPIER.ColliderDesc.cuboid((bounds.maxX - bounds.minX) / 2, .1, (bounds.maxZ - bounds.minZ) / 2).setTranslation((bounds.minX + bounds.maxX) / 2, resolvedSafetyFloorY - .1, (bounds.minZ + bounds.maxZ) / 2));
		const boundaryMinimumY = Math.min(-2, resolvedSafetyFloorY - 2);
		for (const box of [...worldBoundaryColliders(bounds, boundaryMinimumY), ...colliders]) {
			const shape = boxShape(box);
			const descriptor = RAPIER.ColliderDesc.cuboid(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z).setTranslation(shape.centre.x, shape.centre.y, shape.centre.z).setRotation(shape.rotation);
			world.createCollider(descriptor);
		}
		const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
		const collider = world.createCollider(RAPIER.ColliderDesc.capsule(CHARACTER_PHYSICS_CONFIG.playerHalfHeight, CHARACTER_PHYSICS_CONFIG.playerRadius).setFriction(0).setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL), body);
		const physics = new CharacterPhysics(world, body, collider, (halfHeight, radius) => new RAPIER.Capsule(halfHeight, radius), (halfX, halfY, halfZ) => RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ), () => RAPIER.RigidBodyDesc.dynamic());
		physics.teleportEye({
			x: 0,
			y: 1.7,
			z: 0
		});
		return physics;
	}
	teleportEye(position) {
		const eyeFromCenter = STANCE_SHAPES[this.stance].eyeFromCenter;
		this.body.setTranslation({
			x: position.x,
			y: position.y - eyeFromCenter,
			z: position.z
		}, true);
		this.world.propagateModifiedBodyPositionsToColliders();
	}
	eyePosition() {
		const position = this.body.translation();
		return {
			x: position.x,
			y: position.y + STANCE_SHAPES[this.stance].eyeFromCenter,
			z: position.z
		};
	}
	/** Changes the real player collider while preserving foot position. Raising fails under hard cover. */
	setStance(next) {
		if (next === this.stance) return true;
		const currentShape = STANCE_SHAPES[this.stance];
		const nextShape = STANCE_SHAPES[next];
		const current = this.body.translation();
		const currentExtent = currentShape.halfHeight + currentShape.radius;
		const nextExtent = nextShape.halfHeight + nextShape.radius;
		const footY = current.y - currentExtent;
		const candidate = {
			x: current.x,
			y: footY + nextExtent,
			z: current.z
		};
		const shape = this.makeCapsule(nextShape.halfHeight, nextShape.radius);
		if (nextExtent > currentExtent) {
			let blocked = false;
			const clearanceCandidate = {
				...candidate,
				y: candidate.y + .015
			};
			this.world.intersectionsWithShape(clearanceCandidate, {
				x: 0,
				y: 0,
				z: 0,
				w: 1
			}, shape, () => {
				blocked = true;
				return false;
			}, void 0, void 0, this.collider);
			if (blocked) return false;
		}
		this.collider.setShape(shape);
		this.body.setTranslation(candidate, true);
		this.world.propagateModifiedBodyPositionsToColliders();
		this.stance = next;
		if (next === "prone") this.controller.disableAutostep();
		else this.controller.enableAutostep(CHARACTER_PHYSICS_CONFIG.autostepHeight, CHARACTER_PHYSICS_CONFIG.autostepMinimumWidth, false);
		return true;
	}
	currentStance() {
		return this.stance;
	}
	/**
	* Reconciles one revisioned dynamic collision view without rebuilding the
	* Rapier world. Doors and authored shed panels therefore move/disappear in
	* the same simulation tick as their ballistic authority.
	*/
	syncDynamicColliders(entries) {
		const ids = entries.map((entry) => entry.id);
		if (new Set(ids).size !== ids.length || ids.some((id) => !/^[a-z0-9][a-z0-9:-]{0,127}$/.test(id))) throw new TypeError("Dynamic collider IDs must be unique canonical identifiers");
		const retained = new Set(ids);
		for (const [id, collider] of this.dynamicColliders) {
			if (retained.has(id)) continue;
			this.world.removeCollider(collider, true);
			this.dynamicColliders.delete(id);
		}
		for (const entry of entries) {
			const shape = boxShape(entry.bounds);
			let collider = this.dynamicColliders.get(entry.id);
			if (!collider) {
				collider = this.world.createCollider(this.makeCuboidDescriptor(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z).setTranslation(shape.centre.x, shape.centre.y, shape.centre.z).setRotation(shape.rotation));
				this.dynamicColliders.set(entry.id, collider);
				continue;
			}
			const cuboid = collider.shape;
			if ("halfExtents" in cuboid) {
				const halfExtents = cuboid.halfExtents;
				if (Math.abs(halfExtents.x - shape.halfExtents.x) > 1e-6 || Math.abs(halfExtents.y - shape.halfExtents.y) > 1e-6 || Math.abs(halfExtents.z - shape.halfExtents.z) > 1e-6) {
					this.world.removeCollider(collider, true);
					collider = this.world.createCollider(this.makeCuboidDescriptor(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z).setTranslation(shape.centre.x, shape.centre.y, shape.centre.z).setRotation(shape.rotation));
					this.dynamicColliders.set(entry.id, collider);
					continue;
				}
			}
			collider.setTranslation(shape.centre);
			collider.setRotation(shape.rotation);
		}
		this.world.propagateModifiedBodyPositionsToColliders();
	}
	dynamicColliderCount() {
		return this.dynamicColliders.size;
	}
	/**
	* Owns exact disabled rigid-body/collider pairs before gameplay begins. A
	* later sync with the same identity and bounds only writes pose/velocity and
	* enables the retained pair; it does not enter Rapier's allocation path on
	* the first live fracture. The batch commits transactionally.
	*/
	prewarmMajorDebrisBodies(entries) {
		const ids = entries.map((entry) => entry.id);
		if (entries.length > 64 || new Set(ids).size !== ids.length || ids.some((id) => !/^[a-z0-9][a-z0-9:-]{0,127}$/.test(id)) || entries.some((entry) => ![
			entry.halfExtents.x,
			entry.halfExtents.y,
			entry.halfExtents.z
		].every(Number.isFinite) || entry.halfExtents.x <= 0 || entry.halfExtents.y <= 0 || entry.halfExtents.z <= 0)) throw new TypeError("Major debris prewarm exceeds cap or uses invalid identities/bounds");
		for (const entry of entries) {
			const existing = this.majorDebrisBodies.get(entry.id);
			if (!existing) continue;
			if (!existing.prewarmed || Math.abs(existing.halfExtents.x - entry.halfExtents.x) > 1e-6 || Math.abs(existing.halfExtents.y - entry.halfExtents.y) > 1e-6 || Math.abs(existing.halfExtents.z - entry.halfExtents.z) > 1e-6) throw new TypeError(`Major debris prewarm identity ${entry.id} is already owned by incompatible physics`);
		}
		const created = [];
		try {
			for (const [index, entry] of entries.entries()) {
				if (this.majorDebrisBodies.has(entry.id)) continue;
				const body = this.world.createRigidBody(this.makeDynamicBodyDescriptor().setTranslation(0, -64 - index * 2, 0).setLinearDamping(1.35).setAngularDamping(1.8).setCanSleep(true).setSleeping(true).setSoftCcdPrediction(.4).setEnabled(false));
				created.push({
					id: entry.id,
					body
				});
				this.world.createCollider(this.makeCuboidDescriptor(entry.halfExtents.x, entry.halfExtents.y, entry.halfExtents.z).setDensity(42).setFriction(.78).setRestitution(.08), body);
				this.majorDebrisBodies.set(entry.id, {
					body,
					halfExtents: Object.freeze({ ...entry.halfExtents }),
					prewarmed: true,
					active: false
				});
			}
		} catch (error) {
			for (const entry of created.reverse()) {
				this.majorDebrisBodies.delete(entry.id);
				try {
					this.world.removeRigidBody(entry.body);
				} catch {}
			}
			throw error;
		}
	}
	/** Creates/removes bounded host-simulated major debris without arbitrary fracture bodies. */
	syncMajorDebrisBodies(entries, authoritativeResync = false) {
		const ids = entries.map((entry) => entry.id);
		if (entries.length > 18 || new Set(ids).size !== ids.length || ids.some((id) => !/^[a-z0-9][a-z0-9:-]{0,127}$/.test(id))) throw new TypeError("Major debris bodies exceed cap or use invalid identities");
		const retained = new Set(ids);
		for (const [id, entry] of this.majorDebrisBodies) {
			if (retained.has(id)) continue;
			if (entry.prewarmed) {
				if (entry.active) {
					entry.body.setEnabled(false);
					entry.active = false;
				}
				continue;
			}
			this.world.removeRigidBody(entry.body);
			this.majorDebrisBodies.delete(id);
		}
		for (const entry of entries) {
			if (![
				entry.position.x,
				entry.position.y,
				entry.position.z,
				entry.rotation.x,
				entry.rotation.y,
				entry.rotation.z,
				entry.rotation.w,
				entry.halfExtents.x,
				entry.halfExtents.y,
				entry.halfExtents.z,
				entry.linearVelocity.x,
				entry.linearVelocity.y,
				entry.linearVelocity.z,
				entry.angularVelocity.x,
				entry.angularVelocity.y,
				entry.angularVelocity.z
			].every(Number.isFinite) || entry.halfExtents.x <= 0 || entry.halfExtents.y <= 0 || entry.halfExtents.z <= 0) throw new TypeError("Major debris body contains invalid pose or bounds");
			const existing = this.majorDebrisBodies.get(entry.id);
			if (existing) {
				if (Math.abs(existing.halfExtents.x - entry.halfExtents.x) > 1e-6 || Math.abs(existing.halfExtents.y - entry.halfExtents.y) > 1e-6 || Math.abs(existing.halfExtents.z - entry.halfExtents.z) > 1e-6) throw new TypeError(`Major debris body ${entry.id} changed its immutable bounds`);
				if (!existing.active || authoritativeResync) {
					existing.body.setTranslation(entry.position, !entry.sleeping);
					existing.body.setRotation(entry.rotation, !entry.sleeping);
					existing.body.setLinvel(entry.linearVelocity, !entry.sleeping);
					existing.body.setAngvel(entry.angularVelocity, !entry.sleeping);
					if (!existing.active) existing.body.setEnabled(true);
					if (entry.sleeping) existing.body.sleep();
					else existing.body.wakeUp();
					existing.active = true;
				}
				continue;
			}
			const body = this.world.createRigidBody(this.makeDynamicBodyDescriptor().setTranslation(entry.position.x, entry.position.y, entry.position.z).setRotation(entry.rotation).setLinvel(entry.linearVelocity.x, entry.linearVelocity.y, entry.linearVelocity.z).setAngvel(entry.angularVelocity).setLinearDamping(1.35).setAngularDamping(1.8).setCanSleep(true).setSleeping(entry.sleeping).setSoftCcdPrediction(.4));
			this.world.createCollider(this.makeCuboidDescriptor(entry.halfExtents.x, entry.halfExtents.y, entry.halfExtents.z).setDensity(42).setFriction(.78).setRestitution(.08), body);
			this.majorDebrisBodies.set(entry.id, {
				body,
				halfExtents: Object.freeze({ ...entry.halfExtents }),
				prewarmed: false,
				active: true
			});
		}
	}
	applyMajorDebrisImpulse(id, impulse, point) {
		const entry = this.majorDebrisBodies.get(id);
		if (!entry?.active || ![
			impulse.x,
			impulse.y,
			impulse.z
		].every(Number.isFinite)) return false;
		const magnitude = Math.hypot(impulse.x, impulse.y, impulse.z);
		if (magnitude <= 0 || magnitude > 80) return false;
		if (point && [
			point.x,
			point.y,
			point.z
		].every(Number.isFinite)) entry.body.applyImpulseAtPoint(impulse, point, true);
		else entry.body.applyImpulse(impulse, true);
		return true;
	}
	majorDebrisSnapshots() {
		return Object.freeze([...this.majorDebrisBodies.entries()].filter(([, entry]) => entry.active).sort(([left], [right]) => left.localeCompare(right)).map(([id, entry]) => {
			const position = entry.body.translation();
			const rotation = entry.body.rotation();
			const linearVelocity = entry.body.linvel();
			const angularVelocity = entry.body.angvel();
			const localUpWorldY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
			const settled = Math.hypot(linearVelocity.x, linearVelocity.y, linearVelocity.z) < .12 && Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z) < .18;
			return Object.freeze({
				id,
				position: Object.freeze({
					x: position.x,
					y: position.y,
					z: position.z
				}),
				rotation: Object.freeze({
					x: rotation.x,
					y: rotation.y,
					z: rotation.z,
					w: rotation.w
				}),
				linearVelocity: Object.freeze({
					x: linearVelocity.x,
					y: linearVelocity.y,
					z: linearVelocity.z
				}),
				angularVelocity: Object.freeze({
					x: angularVelocity.x,
					y: angularVelocity.y,
					z: angularVelocity.z
				}),
				sleeping: entry.body.isSleeping(),
				flat: settled && Math.abs(localUpWorldY) >= Math.cos(15 * Math.PI / 180)
			});
		}));
	}
	majorDebrisBodyCount() {
		let active = 0;
		for (const entry of this.majorDebrisBodies.values()) if (entry.active) active += 1;
		return active;
	}
	prewarmedMajorDebrisBodyCount() {
		let prewarmed = 0;
		for (const entry of this.majorDebrisBodies.values()) if (entry.prewarmed) prewarmed += 1;
		return prewarmed;
	}
	move(desiredDelta, dt) {
		this.world.timestep = dt;
		this.controller.computeColliderMovement(this.collider, desiredDelta);
		const allowed = this.controller.computedMovement();
		const current = this.body.translation();
		this.body.setNextKinematicTranslation({
			x: current.x + allowed.x,
			y: current.y + allowed.y,
			z: current.z + allowed.z
		});
		this.world.step();
		const position = this.eyePosition();
		const epsilon = 5e-4;
		const grounded = this.controller.computedGrounded();
		const slopeAdjusted = grounded && Math.abs(allowed.y - desiredDelta.y) > epsilon && Math.hypot(allowed.x, allowed.z) > epsilon;
		return {
			position,
			grounded,
			blockedX: Math.abs(allowed.x - desiredDelta.x) > epsilon,
			blockedY: Math.abs(allowed.y - desiredDelta.y) > epsilon,
			blockedZ: Math.abs(allowed.z - desiredDelta.z) > epsilon,
			slopeAdjusted,
			appliedDelta: {
				x: allowed.x,
				y: allowed.y,
				z: allowed.z
			}
		};
	}
	dispose() {
		this.dynamicColliders.clear();
		this.majorDebrisBodies.clear();
		this.world.free();
	}
};
//#endregion
//#region src/pass73-collision-route-authority.ts
var PASS73_COLLISION_ROUTE_SCHEMA = "atomic-acres/collision-route-authority@1";
var PASS73_COLLISION_VISUAL_AXIS_TOLERANCE_METRES = .002;
var PASS73_ROUTE_STANCES = Object.freeze([
	"stand",
	"crouch",
	"prone"
]);
var PASS73_COLLISION_VISUAL_ROLES = Object.freeze({
	"ground-west-wall": "wall",
	"upper-floor-main": "floor",
	"front-door-lintel": "underside",
	"entrance-canopy": "canopy",
	"upper-window-sill-wall": "window-approach"
});
Object.freeze([
	"minX",
	"minY",
	"minZ",
	"maxX",
	"maxY",
	"maxZ"
]);
var AUTHORITY_EPSILON = 1e-6;
var CLEARANCE_EPSILON = .003;
function boxTuple(box) {
	return Object.freeze([
		box.minX,
		box.minY ?? 0,
		box.minZ,
		box.maxX,
		box.maxY ?? 8,
		box.maxZ
	]);
}
function solidTuple(solid) {
	return boxTuple(solidBounds(solid));
}
function box3Tuple(box) {
	return Object.freeze([
		box.min.x,
		box.min.y,
		box.min.z,
		box.max.x,
		box.max.y,
		box.max.z
	]);
}
function tupleAxisErrors(actual, expected) {
	return Object.freeze(actual.map((value, index) => Math.abs(value - expected[index])));
}
function tupleMatches(left, right, tolerance = AUTHORITY_EPSILON) {
	return left.every((value, index) => Math.abs(value - right[index]) <= tolerance);
}
function nodeVisibleWithin(node, root) {
	let cursor = node;
	while (cursor) {
		if (!cursor.visible) return false;
		if (cursor === root) return true;
		cursor = cursor.parent;
	}
	return false;
}
function meshWorldBounds(mesh) {
	const position = mesh.geometry.getAttribute("position");
	if (!position || position.count === 0) return null;
	if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
	return mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld) ?? null;
}
function ownerWorldBounds(owner, presentationRoot) {
	const bounds = new Box3();
	let found = false;
	owner.traverse((node) => {
		if (!(node instanceof Mesh) || !nodeVisibleWithin(node, presentationRoot)) return;
		const meshBounds = meshWorldBounds(node);
		if (!meshBounds) return;
		bounds.union(meshBounds);
		found = true;
	});
	return found ? bounds : null;
}
function ownerMetadata(node) {
	const blenderOwner = node.userData.atomic_semantic === "collision-visual-owner";
	const performanceOwner = node.userData.pass73CollisionVisualOwner === true;
	return Object.freeze({
		owner: blenderOwner || performanceOwner,
		houseId: blenderOwner ? node.userData.atomic_house_id : node.userData.pass73HouseId,
		solidId: blenderOwner ? node.userData.atomic_solid_id : node.userData.pass73SolidId,
		role: blenderOwner ? node.userData.atomic_route_role : node.userData.pass73RouteRole,
		declaredBounds: blenderOwner ? node.userData.atomic_collision_bounds : node.userData.pass73CollisionBounds
	});
}
function exactBoxMatches(boxes, expected) {
	return boxes.filter((box) => tupleMatches(boxTuple(box), expected));
}
function exactShotMatches(surfaces, solidName, expected) {
	return surfaces.filter((surface) => surface.name === solidName && tupleMatches(boxTuple(surface.bounds), expected));
}
function routeBindings(arena) {
	return Object.freeze(arena.houses.flatMap((house) => Object.entries(PASS73_COLLISION_VISUAL_ROLES).map(([solidName, role]) => {
		const solid = house.solids.find((candidate) => candidate.name === solidName);
		if (!solid) throw new TypeError(`Missing Pass 73 route solid ${house.id}:${solidName}`);
		if (!solid.collidable || solid.rotation?.some((value) => Math.abs(value) > AUTHORITY_EPSILON)) throw new TypeError(`Pass 73 route solid must be an axis-aligned collidable: ${solid.id}`);
		return Object.freeze({
			houseId: house.id,
			team: house.team,
			solidId: solid.id,
			solidName,
			role,
			bounds: solidTuple(solid)
		});
	})));
}
function bindPass73CollisionVisualOwner(mesh, house, solid) {
	const role = PASS73_COLLISION_VISUAL_ROLES[solid.name];
	if (!role) return;
	mesh.userData.pass73CollisionVisualOwner = true;
	mesh.userData.pass73HouseId = house.id;
	mesh.userData.pass73SolidId = solid.id;
	mesh.userData.pass73RouteRole = role;
	mesh.userData.pass73CollisionBounds = [...solidTuple(solid)];
}
function openingNormalAxis(opening) {
	return opening.kind === "ramp-entry" ? "x" : "z";
}
function strictVolumesIntersect(left, right) {
	return left[3] > right[0] + CLEARANCE_EPSILON && left[0] < right[3] - CLEARANCE_EPSILON && left[4] > right[1] + CLEARANCE_EPSILON && left[1] < right[4] - CLEARANCE_EPSILON && left[5] > right[2] + CLEARANCE_EPSILON && left[2] < right[5] - CLEARANCE_EPSILON;
}
function openingBaseY(opening, physicsColliders, radius) {
	const declaredBottom = opening.centre[1] - opening.height / 2;
	const candidates = physicsColliders.filter((box) => {
		return (box.maxY ?? 8) <= declaredBottom + .25 + AUTHORITY_EPSILON && box.minX <= opening.centre[0] + radius && box.maxX >= opening.centre[0] - radius && box.minZ <= opening.centre[2] + radius && box.maxZ >= opening.centre[2] - radius;
	});
	return Math.max(declaredBottom, ...candidates.map((box) => box.maxY ?? 8));
}
function auditRouteClearances(arena) {
	return Object.freeze(arena.houses.flatMap((house) => house.openings.filter((opening) => opening.route).flatMap((opening) => PASS73_ROUTE_STANCES.map((stance) => {
		const shape = STANCE_SHAPES[stance];
		const extent = shape.halfHeight + shape.radius;
		const baseY = openingBaseY(opening, arena.physicsColliders, shape.radius);
		const normalAxis = openingNormalAxis(opening);
		const horizontalAxis = normalAxis === "x" ? "z" : "x";
		const halfUsableWidth = Math.max(0, opening.width / 2 - shape.radius - .05);
		const horizontalOffsets = [
			-halfUsableWidth * .6,
			0,
			halfUsableWidth * .6
		];
		let blockers = 0;
		for (const offset of horizontalOffsets) {
			const centreX = opening.centre[0] + (horizontalAxis === "x" ? offset : 0);
			const centreZ = opening.centre[2] + (horizontalAxis === "z" ? offset : 0);
			const normalReach = shape.radius + .24;
			const body = normalAxis === "x" ? [
				centreX - normalReach,
				baseY + CLEARANCE_EPSILON,
				centreZ - shape.radius,
				centreX + normalReach,
				baseY + extent * 2 - CLEARANCE_EPSILON,
				centreZ + shape.radius
			] : [
				centreX - shape.radius,
				baseY + CLEARANCE_EPSILON,
				centreZ - normalReach,
				centreX + shape.radius,
				baseY + extent * 2 - CLEARANCE_EPSILON,
				centreZ + normalReach
			];
			blockers += arena.physicsColliders.filter((box) => strictVolumesIntersect(body, boxTuple(box))).length;
		}
		const issues = blockers > 0 ? [`invisible-or-intruding-route-blockers:${blockers}`] : [];
		return Object.freeze({
			houseId: house.id,
			openingId: opening.id,
			openingKind: opening.kind,
			stance,
			samples: horizontalOffsets.length,
			blockers,
			baseY: Number(baseY.toFixed(4)),
			issues: Object.freeze(issues)
		});
	}))));
}
function auditPass73CollisionRouteAuthority(arena, presentationRoot, profile) {
	presentationRoot.updateWorldMatrix(true, true);
	const bindings = routeBindings(arena);
	const ownerNodes = [];
	presentationRoot.traverse((node) => {
		if (ownerMetadata(node).owner && nodeVisibleWithin(node, presentationRoot)) ownerNodes.push(node);
	});
	const entries = bindings.map((binding) => {
		const issues = [];
		const owners = ownerNodes.filter((owner) => {
			const metadata = ownerMetadata(owner);
			return metadata.houseId === binding.houseId && metadata.solidId === binding.solidId && metadata.role === binding.role;
		});
		if (owners.length !== 1) issues.push(`visible-owner-count:${owners.length}`);
		const owner = owners.length === 1 ? owners[0] : null;
		const renderedBox = owner ? ownerWorldBounds(owner, presentationRoot) : null;
		const renderedBounds = renderedBox ? box3Tuple(renderedBox) : null;
		const axisErrors = renderedBounds ? tupleAxisErrors(renderedBounds, binding.bounds) : null;
		const maximumAxisError = axisErrors ? Math.max(...axisErrors) : null;
		if (maximumAxisError === null || maximumAxisError > .002) issues.push(`rendered-bounds-drift:${maximumAxisError === null ? "missing" : maximumAxisError.toFixed(6)}`);
		if (owner) {
			const declared = ownerMetadata(owner).declaredBounds;
			if (!Array.isArray(declared) || declared.length !== 6 || !declared.every(Number.isFinite) || !tupleMatches(declared, binding.bounds)) issues.push("owner-declared-bounds-drift");
		}
		const movement = exactBoxMatches(arena.colliders, binding.bounds);
		const physics = exactBoxMatches(arena.physicsColliders, binding.bounds);
		const shots = exactShotMatches(arena.shotSurfaces, binding.solidName, binding.bounds);
		if (movement.length !== 1) issues.push(`movement-bounds-count:${movement.length}`);
		if (physics.length !== 1) issues.push(`physics-bounds-count:${physics.length}`);
		if (shots.length !== 1) issues.push(`shot-bounds-count:${shots.length}`);
		const supportCount = binding.role === "floor" || binding.role === "canopy" ? physics.length : null;
		if (supportCount !== null && supportCount !== 1) issues.push(`support-bounds-count:${supportCount}`);
		return Object.freeze({
			...binding,
			expectedBounds: binding.bounds,
			renderedBounds,
			renderedAxisErrorMetres: axisErrors,
			maximumRenderedAxisErrorMetres: maximumAxisError,
			visibleOwnerCount: owners.length,
			movementBoundsCount: movement.length,
			physicsBoundsCount: physics.length,
			shotBoundsCount: shots.length,
			supportBoundsCount: supportCount,
			issues: Object.freeze(issues)
		});
	});
	const routeClearances = auditRouteClearances(arena);
	const issues = [...entries.flatMap((entry) => entry.issues.map((issue) => `${entry.solidId}:${issue}`)), ...routeClearances.flatMap((entry) => entry.issues.map((issue) => `${entry.houseId}:${entry.openingId}:${entry.stance}:${issue}`))];
	return Object.freeze({
		schema: PASS73_COLLISION_ROUTE_SCHEMA,
		profile,
		axisToleranceMetres: PASS73_COLLISION_VISUAL_AXIS_TOLERANCE_METRES,
		expectedOwners: bindings.length,
		passedOwners: entries.filter((entry) => entry.issues.length === 0).length,
		expectedRouteClearances: routeClearances.length,
		passedRouteClearances: routeClearances.filter((entry) => entry.issues.length === 0).length,
		pass: issues.length === 0,
		issues: Object.freeze(issues),
		entries: Object.freeze(entries),
		routeClearances
	});
}
function assertPass73CollisionRouteAuthority(report) {
	if (!report.pass) throw new Error(`Pass 73 collision/visual route authority failed (${report.profile}): ${report.issues.join(", ")}`);
}
function stanceEyeY(footY, stance) {
	const shape = STANCE_SHAPES[stance];
	return footY + shape.halfHeight + shape.radius + shape.eyeFromCenter;
}
function pass73CollisionRouteFixtures(arena, profile) {
	const houses = new Map(arena.houses.map((house) => [house.id, house]));
	const bindings = routeBindings(arena);
	return Object.freeze(bindings.flatMap((binding) => PASS73_ROUTE_STANCES.map((stance) => {
		const house = houses.get(binding.houseId);
		const [minX, , minZ, maxX, maxY, maxZ] = binding.bounds;
		const centreX = (minX + maxX) / 2;
		const centreZ = (minZ + maxZ) / 2;
		const radius = STANCE_SHAPES[stance].radius;
		let footY = 0;
		let x = centreX;
		let z = centreZ;
		let yaw = 0;
		let pitch = 0;
		let supportTopY = null;
		if (binding.role === "wall") {
			x = maxX + radius + .035;
			z = centreZ + house.origin.facing * 2;
			yaw = Math.PI / 2;
		} else if (binding.role === "floor") {
			const upperOpening = house.anchors.find((anchor) => anchor.id === "upper-opening");
			if (!upperOpening) throw new TypeError(`Missing upper-opening fixture anchor for ${house.id}`);
			x = upperOpening.position[0];
			z = upperOpening.position[2] + house.origin.facing * 1.3;
			footY = maxY;
			supportTopY = maxY;
			pitch = 1.05;
		} else if (binding.role === "underside") {
			z = centreZ + house.origin.facing * .68;
			yaw = house.origin.facing === 1 ? 0 : Math.PI;
			pitch = .82;
		} else if (binding.role === "canopy") {
			footY = maxY;
			supportTopY = maxY;
			pitch = .9;
		} else {
			const floor = bindings.find((candidate) => candidate.houseId === binding.houseId && candidate.role === "floor");
			if (!floor) throw new TypeError(`Missing floor fixture for ${house.id}`);
			footY = floor.bounds[4];
			supportTopY = floor.bounds[4];
			z = centreZ - house.origin.facing * (radius + (maxZ - minZ) / 2 + .035);
			yaw = house.origin.facing === 1 ? Math.PI : 0;
			pitch = .12;
		}
		return Object.freeze({
			id: `${profile}:${binding.houseId}:${binding.role}:${stance}`,
			profile,
			houseId: binding.houseId,
			team: binding.team,
			solidId: binding.solidId,
			role: binding.role,
			stance,
			radius,
			eyeAboveFoot: stanceEyeY(0, stance),
			bodyHeight: (STANCE_SHAPES[stance].halfHeight + radius) * 2,
			teleportPosition: Object.freeze([
				x,
				stanceEyeY(footY, stance),
				z
			]),
			yaw,
			pitch,
			supportTopY
		});
	})));
}
//#endregion
//#region src/map.ts
var material = (color, roughness = .78, metalness = .03) => new MeshStandardMaterial({
	color,
	roughness,
	metalness
});
/**
* The four lane anchors that carry authored art instead of a blockout box, keyed
* by ANCHOR COORDINATE rather than by COVER_LAYOUT array index.
*
* HF-383 removed the two leading COVER_LAYOUT entries. Both production
* consumers - this file and the fallback/Performance art in
* environment-assets.ts - keyed their authored art by literal index, so the
* removal silently retired `west-service-skip` and `east-generator-trailer`
* (indices 6 and 7 stopped existing) and re-pointed the cargo and pipe stacks
* at the former 6/7 anchors, against a 2.8 x 4.4 collider they are not modelled
* for. Nothing failed loudly: two minimap landmarks disappeared, two moved, and
* the orphaned (-8,-22)/(8,22) anchors went back to rendering as plain
* aqua/coral blockout cubes. Anchors are what the art is actually modelled
* against, so keying on them means a future layout edit either keeps the anchor
* (art follows it automatically) or deletes it, which fails
* src/atomic-authored-cover.test.ts instead of passing quietly.
*/
var AUTHORED_LARGE_COVER_ANCHORS = Object.freeze([
	Object.freeze([
		-9,
		-26,
		"north-cargo-stack"
	]),
	Object.freeze([
		9,
		26,
		"south-pipe-stack"
	]),
	Object.freeze([
		27,
		-13,
		"west-service-skip"
	]),
	Object.freeze([
		-27,
		13,
		"east-generator-trailer"
	])
]);
/** Authored large cover is the tall lane-breaking class; ordinary cover is 1.6 m. */
var AUTHORED_LARGE_COVER_HEIGHT = 2.2;
/** Resolve the authored asset seated on a cover anchor, or null for plain cover. */
function authoredLargeCoverIdAt(x, z) {
	const anchor = AUTHORED_LARGE_COVER_ANCHORS.find((entry) => Math.abs(entry[0] - x) < 1e-6 && Math.abs(entry[1] - z) < 1e-6);
	return anchor ? anchor[2] : null;
}
function buildArena(scene) {
	const colliders = [];
	const physicsColliders = [];
	const raycastMeshes = [];
	const shotSurfaces = [];
	let ballisticSurfaceSequence = 0;
	const targets = [];
	const houses = [];
	const houseFragmentDefinitions = [];
	const staticHouseFragmentColliders = [];
	const staticHouseFragmentBallisticSurfaceIds = [];
	const breakableWindows = [];
	const physicalCover = [];
	const houseTelemetry = {
		houses: 0,
		groundRooms: 0,
		upperRooms: 0,
		doors: 0,
		windows: 0,
		ramps: 0,
		wallMaterialVariants: 6,
		pbrMaterialFamilies: 9
	};
	const world = new Group();
	world.name = "Atomic Acres arena";
	scene.add(world);
	const pbrTexture = (stem, options = {}) => texturedMaterial(`./assets/original/textures/${stem}.png`, {
		...options,
		normalPath: `./assets/original/textures/${stem}-normal.png`,
		roughnessPath: `./assets/original/textures/${stem}-roughness.png`
	});
	const palette = {
		grass: pbrTexture("grass-turf", {
			roughness: 1,
			repeatX: 12,
			repeatY: 16,
			normalScale: .24
		}),
		grassDark: texturedMaterial("./assets/original/textures/grass-turf.png", {
			color: 8294762,
			roughness: 1,
			repeatX: 8,
			repeatY: 8
		}),
		road: pbrTexture("asphalt-aged", {
			roughness: .98,
			repeatX: 5,
			repeatY: 20,
			normalScale: .32
		}),
		concrete: pbrTexture("concrete-poured", {
			roughness: .94,
			repeatX: 3,
			repeatY: 3,
			normalScale: .38
		}),
		cream: pbrTexture("plaster-warm", {
			roughness: .92,
			repeatX: 3,
			repeatY: 3,
			normalScale: .36
		}),
		aqua: pbrTexture("siding-aqua", {
			roughness: .76,
			repeatX: 4,
			repeatY: 4,
			normalScale: .5
		}),
		aquaUpper: pbrTexture("siding-aqua", {
			color: 12707037,
			roughness: .8,
			repeatX: 6,
			repeatY: 5,
			normalScale: .65
		}),
		coral: pbrTexture("siding-coral", {
			roughness: .76,
			repeatX: 4,
			repeatY: 4,
			normalScale: .5
		}),
		coralUpper: pbrTexture("brick-warm", {
			color: 15188141,
			roughness: .91,
			repeatX: 7,
			repeatY: 4,
			normalScale: .72
		}),
		mustard: material(14263355, .58, .18),
		dark: texturedMaterial("./assets/original/textures/weapon-gunmetal.png", {
			roughness: .56,
			metalness: .3,
			repeatX: 3,
			repeatY: 2
		}),
		timber: pbrTexture("wood-deck", {
			roughness: .92,
			repeatX: 4,
			repeatY: 2,
			normalScale: .42
		}),
		glass: new MeshPhysicalMaterial({
			color: 7912144,
			roughness: .1,
			metalness: .04,
			transparent: true,
			opacity: .54,
			transmission: .12
		}),
		white: material(15787209, .68),
		chrome: material(11451841, .18, .76),
		brick: pbrTexture("brick-warm", {
			roughness: .9,
			repeatX: 5,
			repeatY: 3,
			normalScale: .65
		}),
		roof: pbrTexture("roof-shingles", {
			roughness: .86,
			repeatX: 5,
			repeatY: 6,
			normalScale: .48
		})
	};
	palette.chrome.userData.batchColor = 6253938;
	function box(name, position, size, mat, solid = true, cast = true, blocksShots = solid, ballisticMaterial, breakableWindowId, rotation) {
		const mesh = new Mesh(new BoxGeometry(...size), mat);
		mesh.name = name;
		mesh.userData.impactSurface = classifyImpactSurface({
			name,
			metalness: mat instanceof MeshStandardMaterial ? mat.metalness : void 0
		});
		mesh.position.set(...position);
		if (rotation) mesh.rotation.set(...rotation);
		mesh.castShadow = cast;
		mesh.receiveShadow = true;
		world.add(mesh);
		const bounds = {
			minX: position[0] - size[0] / 2,
			maxX: position[0] + size[0] / 2,
			minZ: position[2] - size[2] / 2,
			maxZ: position[2] + size[2] / 2,
			minY: position[1] - size[1] / 2,
			maxY: position[1] + size[1] / 2,
			...rotation ? { rotation } : {}
		};
		if (blocksShots) {
			raycastMeshes.push(mesh);
			const surface = createBallisticSurface(`atomic-acres:${ballisticSurfaceSequence}:${name}`, name, bounds, {
				impactSurface: mesh.userData.impactSurface,
				material: ballisticMaterial
			}, breakableWindowId);
			ballisticSurfaceSequence += 1;
			shotSurfaces.push(surface);
			mesh.userData.ballisticSurfaceId = surface.id;
			mesh.userData.ballisticMaterial = surface.material;
		}
		if (solid) {
			colliders.push(bounds);
			physicsColliders.push(bounds);
		}
		return mesh;
	}
	function authoredCollisionProxy(name, position, size, ballisticMaterial) {
		const proxy = box(name, position, size, palette.dark, true, false, true, ballisticMaterial);
		proxy.visible = false;
		proxy.userData.collisionProxy = true;
		proxy.userData.authoredCollisionAuthority = true;
		return proxy;
	}
	function performanceCoverBox(coverId, name, position, size, mat) {
		const mesh = box(name, position, size, mat, false, false, false);
		mesh.userData.performanceCoverId = coverId;
		mesh.userData.presentationOnly = true;
		mesh.userData.blocksShots = false;
		return mesh;
	}
	function performanceCoverCylinder(coverId, name, position, radius, length, mat, rotation, hollow = false) {
		let geometry;
		if (hollow) {
			const profile = new Shape();
			profile.absarc(0, 0, radius, 0, Math.PI * 2, false);
			const opening = new Path();
			opening.absarc(0, 0, radius * .58, 0, Math.PI * 2, true);
			profile.holes.push(opening);
			geometry = new ExtrudeGeometry(profile, {
				depth: length,
				bevelEnabled: false,
				steps: 1,
				curveSegments: 6
			});
			geometry.translate(0, 0, -length / 2);
			geometry.rotateX(-Math.PI / 2);
		} else geometry = new CylinderGeometry(radius, radius, length, 6);
		const mesh = new Mesh(geometry, mat);
		mesh.name = name;
		mesh.position.set(...position);
		mesh.rotation.set(...rotation);
		mesh.receiveShadow = true;
		mesh.userData.performanceCoverId = coverId;
		mesh.userData.presentationOnly = true;
		mesh.userData.blocksShots = false;
		mesh.userData.impactSurface = "metal";
		world.add(mesh);
		return mesh;
	}
	function addPerformanceLargeCover(id, x, z) {
		let meshes = 0;
		const addBox = (name, position, size, mat) => {
			performanceCoverBox(id, name, position, size, mat);
			meshes += 1;
		};
		const addCylinder = (name, position, radius, length, mat, rotation, hollow = false) => {
			performanceCoverCylinder(id, name, position, radius, length, mat, rotation, hollow);
			meshes += 1;
		};
		if (id === "north-cargo-stack") {
			for (const offset of [-.7, .7]) addBox("performance-cargo-lower", [
				x + offset,
				.52,
				z
			], [
				1.4,
				1.04,
				1.82
			], offset < 0 ? palette.aqua : palette.mustard);
			addBox("performance-cargo-upper", [
				x,
				1.62,
				z
			], [
				2.15,
				1.04,
				1.82
			], palette.aqua);
			for (const offset of [-.62, .62]) addBox("performance-cargo-lock-rail", [
				x + offset,
				1.62,
				z - .93
			], [
				.12,
				.9,
				.08
			], palette.dark);
			return {
				kind: "cargo-stack",
				meshes
			};
		}
		if (id === "south-pipe-stack") {
			for (const offset of [
				-.85,
				0,
				.85
			]) addCylinder("performance-concrete-pipe", [
				x + offset,
				.53,
				z
			], .52, 1.82, palette.concrete, [
				Math.PI / 2,
				0,
				0
			], true);
			for (const offset of [-.58, .58]) addCylinder("performance-concrete-pipe", [
				x + offset,
				1.52,
				z
			], .52, 1.82, palette.concrete, [
				Math.PI / 2,
				0,
				0
			], true);
			return {
				kind: "pipe-stack",
				meshes
			};
		}
		if (id === "west-service-skip") {
			addBox("performance-skip-floor", [
				x,
				.18,
				z
			], [
				2.72,
				.28,
				4.3
			], palette.dark);
			for (const offset of [-1.25, 1.25]) addBox("performance-skip-side", [
				x + offset,
				1.02,
				z
			], [
				.22,
				1.72,
				4.3
			], palette.aqua);
			addBox("performance-skip-rear", [
				x,
				1.02,
				z + 2.04
			], [
				2.6,
				1.72,
				.22
			], palette.aqua);
			addBox("performance-skip-front", [
				x,
				.62,
				z - 2.04
			], [
				2.6,
				.92,
				.22
			], palette.mustard);
			for (const offset of [-1.25, 1.25]) addBox("performance-skip-top-rail", [
				x + offset,
				1.92,
				z
			], [
				.28,
				.16,
				4.3
			], palette.mustard);
			return {
				kind: "service-skip",
				meshes
			};
		}
		addBox("performance-generator-chassis", [
			x,
			.48,
			z
		], [
			2.72,
			.22,
			4.3
		], palette.dark);
		addBox("performance-generator-body", [
			x,
			1.28,
			z + .28
		], [
			2.42,
			1.5,
			3.05
		], palette.mustard);
		addBox("performance-generator-panel", [
			x - 1.23,
			1.3,
			z + .28
		], [
			.08,
			.92,
			1.75
		], palette.dark);
		addBox("performance-generator-drawbar", [
			x,
			.48,
			z - 1.68
		], [
			.18,
			.18,
			.9
		], palette.chrome);
		for (const wheelX of [-1.22, 1.22]) for (const wheelZ of [-1.08, 1.08]) addCylinder("performance-generator-wheel", [
			x + wheelX,
			.48,
			z + wheelZ
		], .38, .24, palette.dark, [
			0,
			0,
			Math.PI / 2
		]);
		addCylinder("performance-generator-exhaust", [
			x + .83,
			1.75,
			z + .82
		], .1, .82, palette.dark, [
			0,
			0,
			0
		]);
		return {
			kind: "generator-trailer",
			meshes
		};
	}
	const ground = new Mesh(new PlaneGeometry(70, 68), palette.grass);
	ground.rotation.x = -Math.PI / 2;
	ground.receiveShadow = true;
	ground.userData.impactSurface = "soil";
	world.add(ground);
	raycastMeshes.push(ground);
	const groundSurface = createBallisticSurface(`atomic-acres:${ballisticSurfaceSequence}:ground`, "atomic-acres-ground", {
		minX: -35,
		maxX: 35,
		minY: -8,
		maxY: 0,
		minZ: -34,
		maxZ: 34
	}, {
		impactSurface: "soil",
		material: "earth"
	});
	ballisticSurfaceSequence += 1;
	shotSurfaces.push(groundSurface);
	ground.userData.ballisticSurfaceId = groundSurface.id;
	ground.userData.ballisticMaterial = groundSurface.material;
	const road = new Mesh(new PlaneGeometry(70, STREET_HALF_WIDTH * 2), palette.road);
	road.name = "aged asphalt road";
	road.rotation.x = -Math.PI / 2;
	road.position.y = .025;
	road.receiveShadow = true;
	road.userData.impactSurface = "concrete";
	world.add(road);
	raycastMeshes.push(road);
	const roadSurface = createBallisticSurface(`atomic-acres:${ballisticSurfaceSequence}:road`, "atomic-acres-road", {
		minX: -35,
		maxX: 35,
		minY: -.25,
		maxY: .03,
		minZ: -STREET_HALF_WIDTH,
		maxZ: STREET_HALF_WIDTH
	}, {
		impactSurface: "concrete",
		material: "concrete"
	});
	ballisticSurfaceSequence += 1;
	shotSurfaces.push(roadSurface);
	road.userData.ballisticSurfaceId = roadSurface.id;
	road.userData.ballisticMaterial = roadSurface.material;
	for (const z of [-5.6, 5.6]) box("curb", [
		0,
		.12,
		z
	], [
		70,
		.24,
		1.2
	], palette.concrete, false, false);
	for (const z of [-7.5, 7.5]) box("sidewalk", [
		0,
		.07,
		z
	], [
		70,
		.14,
		2.6
	], palette.concrete, false, false);
	for (const x of [
		-32,
		-24,
		-16,
		-8,
		8,
		16,
		24,
		32
	]) box("lane marker", [
		x,
		.055,
		0
	], [
		3.6,
		.03,
		.18
	], palette.mustard, false, false);
	for (const x of [-16, 16]) for (let z = -4.5; z <= 4.5; z += 1.5) box("crosswalk stripe", [
		x,
		.062,
		z
	], [
		3.2,
		.025,
		1.4
	], palette.white, false, false);
	function addHouse(team, x, z, facing) {
		const architecture = createHouseArchitecture(team, x, z, facing);
		const destructionDefinitions = createAtomicHouseFragmentDefinitions([architecture]);
		houseFragmentDefinitions.push(...destructionDefinitions);
		houses.push(architecture);
		houseTelemetry.houses += 1;
		houseTelemetry.groundRooms += architecture.rooms.filter((room) => room.level === "ground").length;
		houseTelemetry.upperRooms += architecture.rooms.filter((room) => room.level === "upper").length;
		houseTelemetry.doors += architecture.openings.filter((opening) => opening.kind === "exterior-door").length;
		houseTelemetry.windows += architecture.openings.filter((opening) => opening.kind === "window").length;
		houseTelemetry.ramps += architecture.solids.filter((solid) => solid.kind === "ramp").length;
		const surfaceMaterial = {
			aqua: palette.aqua,
			coral: palette.coral,
			plaster: palette.cream,
			brick: palette.brick,
			timber: palette.timber,
			concrete: palette.concrete,
			trim: palette.white,
			glass: palette.glass,
			metal: palette.chrome,
			ceiling: palette.cream,
			light: new MeshBasicMaterial({
				color: 16769699,
				toneMapped: false
			})
		};
		const wallMaterial = (solid) => {
			if (solid.surface === "glass" && solid.name.includes("upper-window")) return new MeshPhysicalMaterial({
				color: 12185330,
				roughness: .06,
				metalness: 0,
				transparent: true,
				opacity: .2,
				transmission: .48,
				depthWrite: false,
				side: 2
			});
			if (solid.surface === "aqua") {
				if (solid.name.includes("upper")) return palette.aquaUpper;
				if (solid.name.startsWith("rear-ground")) return palette.cream;
			}
			if (solid.surface === "coral") {
				if (solid.name.includes("upper")) return palette.coralUpper;
				if (solid.name.startsWith("rear-ground")) return palette.cream;
			}
			return surfaceMaterial[solid.surface];
		};
		const wallBallistics = {
			aqua: "interior-wall",
			coral: "interior-wall",
			plaster: "interior-wall",
			brick: "brick",
			timber: "wood",
			concrete: "concrete",
			trim: "wood",
			glass: "glass",
			metal: "thin-metal",
			ceiling: "interior-wall",
			light: "reinforced"
		};
		const bindPreauthoredFragment = (rendered, definition) => {
			const collider = colliders.at(-1);
			const physicsCollider = physicsColliders.at(-1);
			const surface = shotSurfaces.at(-1);
			if (!collider || physicsCollider !== collider || !surface || rendered.userData.ballisticSurfaceId !== surface.id) throw new Error(`Atomic house fragment ${definition.id} did not bind one static authority tuple`);
			physicsColliders.pop();
			staticHouseFragmentColliders.push(collider);
			staticHouseFragmentBallisticSurfaceIds.push(surface.id);
			shotSurfaces[shotSurfaces.length - 1] = Object.freeze({
				...surface,
				houseFragment: Object.freeze({
					definitionSetId: HOUSE_DESTRUCTION_DEFINITION_SET_ID,
					fragmentId: definition.id
				})
			});
			rendered.visible = false;
			rendered.userData.preAuthoredHouseFragmentId = definition.id;
			rendered.userData.dynamicAuthorityReplacement = true;
		};
		for (const solid of architecture.solids) {
			const solidMaterial = wallMaterial(solid);
			if (solid.kind === "ramp") {
				bindPass73CollisionVisualOwner(box(solid.name, solid.position, solid.size, solidMaterial, false, true, true, wallBallistics[solid.surface], void 0, solid.rotation), architecture, solid);
				physicsColliders.push(solidBounds(solid));
				continue;
			}
			const isBreakableGlass = solid.kind === "glass" && solid.breakable;
			const destructionDefinition = destructionDefinitions.find((definition) => definition.sourceKind === "architecture-solid" && definition.sourceId === solid.id);
			const rendered = box(solid.name, solid.position, solid.size, solidMaterial, solid.collidable, solid.kind !== "glass", isBreakableGlass || solid.collidable, wallBallistics[solid.surface], isBreakableGlass ? solid.id : void 0);
			if (solid.rotation) rendered.rotation.set(...solid.rotation);
			bindPass73CollisionVisualOwner(rendered, architecture, solid);
			if (destructionDefinition) bindPreauthoredFragment(rendered, destructionDefinition);
			if (isBreakableGlass) {
				rendered.userData.breakableWindowId = solid.id;
				rendered.userData.dynamic = true;
				breakableWindows.push({
					id: solid.id,
					mesh: rendered,
					broken: false
				});
			}
		}
		for (const definition of destructionDefinitions.filter((candidate) => candidate.role === "roof")) bindPreauthoredFragment(box(definition.sourceId, [
			definition.position.x,
			definition.position.y,
			definition.position.z
		], [
			definition.halfExtents.x * 2,
			definition.halfExtents.y * 2,
			definition.halfExtents.z * 2
		], palette.roof, true, true, true, definition.ballisticMaterial), definition);
	}
	for (const house of HOUSE_LAYOUT) addHouse(house.team, house.x, house.z, house.facing);
	for (const [index, [x, z, rotation]] of NEIGHBOURHOOD_BENCH_LAYOUT.entries()) {
		const [width, height, depth] = NEIGHBOURHOOD_BENCH_COLLIDER_SIZE;
		const rotated = Math.abs(Math.sin(rotation)) > .5;
		const proxy = box(`street-bench-collider-${index}`, [
			x,
			height / 2,
			z
		], [
			rotated ? depth : width,
			height,
			rotated ? width : depth
		], palette.timber, true, false, true, "wood");
		proxy.visible = false;
		proxy.userData.collisionProxy = true;
	}
	for (const [index, [x, z]] of NEIGHBOURHOOD_BIN_POSITIONS.entries()) {
		const [width, height, depth] = NEIGHBOURHOOD_BIN_COLLIDER_SIZE;
		const proxy = box(`street-recycling-bin-collider-${index}`, [
			x,
			height / 2,
			z
		], [
			width,
			height,
			depth
		], palette.dark, true, false, true, "thin-metal");
		proxy.visible = false;
		proxy.userData.collisionProxy = true;
	}
	const [busLength, busHeight, busWidth] = CENTRAL_BUS.size;
	const busHullTopY = 1.1;
	const busWindowTopY = 2.1;
	const busDeckTopY = 2.25;
	const busMidHalf = 4.1;
	const busSideZ = busWidth / 2 - .14;
	const busDoorHalf = .85;
	const busDoorX = 2.8;
	for (const side of [-1, 1]) {
		const doorCentre = -side * busDoorX;
		const sideName = side < 0 ? "north" : "south";
		const segments = [[-busLength / 2, doorCentre - busDoorHalf], [doorCentre + busDoorHalf, busLength / 2]];
		for (const [fromX, toX] of segments) {
			const width = toX - fromX;
			const centre = (fromX + toX) / 2;
			box(`central bus hull ${sideName} ${fromX < doorCentre ? "a" : "b"}`, [
				CENTRAL_BUS.x + centre,
				busHullTopY / 2,
				CENTRAL_BUS.z + side * busSideZ
			], [
				width,
				busHullTopY,
				.28
			], palette.mustard, true, true, true, "vehicle");
			const bandProxy = box(`central bus window band ${sideName} ${fromX < doorCentre ? "a" : "b"}`, [
				CENTRAL_BUS.x + centre,
				3.2 / 2,
				CENTRAL_BUS.z + side * (busWidth / 2 + .02)
			], [
				width,
				busWindowTopY - busHullTopY,
				.12
			], palette.glass, true, false, false, "glass");
			bandProxy.visible = false;
			bandProxy.userData.collisionProxy = true;
			bandProxy.userData.authoredCollisionAuthority = true;
			const bayCount = Math.max(1, Math.round(width / 2.1));
			const bayWidth = width / bayCount;
			for (let bay = 0; bay < bayCount; bay += 1) {
				const bayCentre = fromX + bayWidth * (bay + .5);
				const paneId = `central-bus-pane-${sideName}-${fromX < doorCentre ? "a" : "b"}-${bay}`;
				const pane = box(paneId, [
					CENTRAL_BUS.x + bayCentre,
					3.2 / 2,
					CENTRAL_BUS.z + side * (busWidth / 2 + .02)
				], [
					bayWidth,
					busWindowTopY - busHullTopY,
					.12
				], palette.glass, false, true, true, "glass", paneId);
				pane.userData.breakableWindowId = paneId;
				pane.userData.dynamic = true;
				breakableWindows.push({
					id: paneId,
					mesh: pane,
					broken: false
				});
			}
		}
		box(`central bus roof band mid ${sideName}`, [
			CENTRAL_BUS.x,
			(2.2 + busHeight) / 2,
			CENTRAL_BUS.z + side * busSideZ
		], [
			busMidHalf * 2,
			busHeight - 2.2,
			.28
		], palette.mustard, true, true, true, "vehicle");
		for (const deckEnd of [-1, 1]) box(`central bus deck lip ${sideName} ${deckEnd < 0 ? "west" : "east"}`, [
			CENTRAL_BUS.x + deckEnd * (busMidHalf + (busLength / 2 - busMidHalf) / 2),
			4.35 / 2,
			CENTRAL_BUS.z + side * busSideZ
		], [
			busLength / 2 - busMidHalf,
			busDeckTopY - busWindowTopY,
			.28
		], palette.mustard, true, true, true, "vehicle");
	}
	for (const end of [-1, 1]) {
		box(`central bus end cap ${end < 0 ? "west" : "east"}`, [
			CENTRAL_BUS.x + end * (busLength / 2 - .15),
			busWindowTopY / 2,
			CENTRAL_BUS.z
		], [
			.3,
			busWindowTopY,
			busWidth
		], palette.mustard, true, true, true, "vehicle");
		box(`central bus end roofline ${end < 0 ? "west" : "east"}`, [
			CENTRAL_BUS.x + end * (busLength / 2 - .15),
			4.35 / 2,
			CENTRAL_BUS.z
		], [
			.3,
			busDeckTopY - busWindowTopY,
			busWidth
		], palette.mustard, true, true, true, "vehicle");
	}
	for (const deckEnd of [-1, 1]) {
		box(`central bus deck ${deckEnd < 0 ? "west" : "east"}`, [
			CENTRAL_BUS.x + deckEnd * (busMidHalf + (busLength / 2 - busMidHalf) / 2),
			busDeckTopY - .06,
			CENTRAL_BUS.z
		], [
			busLength / 2 - busMidHalf,
			.12,
			busWidth
		], palette.white, true, true, true, "vehicle");
		box(`central bus roof riser ${deckEnd < 0 ? "west" : "east"}`, [
			CENTRAL_BUS.x + deckEnd * busMidHalf,
			(busDeckTopY + busHeight) / 2,
			CENTRAL_BUS.z
		], [
			.24,
			busHeight - busDeckTopY,
			busWidth
		], palette.mustard, true, true, true, "vehicle");
	}
	box("central bus roof", [
		CENTRAL_BUS.x,
		busHeight - .06,
		CENTRAL_BUS.z
	], [
		busMidHalf * 2,
		.12,
		busWidth
	], palette.white, true, true, true, "vehicle");
	physicalCover.push({
		id: "central-transit-bus",
		bounds: {
			minX: CENTRAL_BUS.x - busLength / 2,
			maxX: CENTRAL_BUS.x + busLength / 2,
			minY: 0,
			maxY: busHeight,
			minZ: CENTRAL_BUS.z - busWidth / 2,
			maxZ: CENTRAL_BUS.z + busWidth / 2
		},
		blocksMovement: true,
		blocksShots: true
	});
	for (const [index, [wheelX, wheelZ]] of [
		[-4.64, -1.71],
		[4.64, 1.71],
		[-4.56, 1.89],
		[4.56, -1.89]
	].entries()) box(`central bus wheel ${index}`, [
		CENTRAL_BUS.x + wheelX,
		.45,
		CENTRAL_BUS.z + wheelZ
	], [
		1.3,
		.9,
		.4
	], palette.dark, true, false, true, "vehicle");
	const busMirrored = (name, twinName, [pieceX, pieceY, pieceZ], size, material, shots = true) => {
		box(name, [
			CENTRAL_BUS.x + pieceX,
			pieceY,
			CENTRAL_BUS.z + pieceZ
		], size, material, true, shots, true, "vehicle");
		box(twinName, [
			CENTRAL_BUS.x - pieceX,
			pieceY,
			CENTRAL_BUS.z - pieceZ
		], size, material, true, shots, true, "vehicle");
	};
	busMirrored("central bus cab dash", "central bus engine workbench", [
		-5.6,
		.75,
		-1.35
	], [
		1,
		1.5,
		2.3
	], palette.dark);
	busMirrored("central bus cab bulkhead", "central bus engine bulkhead", [
		-3.9,
		.95,
		-1.65
	], [
		.14,
		1.9,
		1.6
	], palette.mustard);
	busMirrored("central bus cab seat", "central bus engine crate", [
		-4.5,
		.3,
		-1.35
	], [
		.7,
		.6,
		.7
	], palette.aqua);
	for (const [index, seatX] of [-1.1, 1.1].entries()) {
		busMirrored(`central bus seat ${index} north`, `central bus seat ${index} south`, [
			seatX,
			.225,
			-1.95
		], [
			1.5,
			.45,
			.75
		], palette.aqua);
		busMirrored(`central bus seat back ${index} north`, `central bus seat back ${index} south`, [
			seatX - .68,
			.66,
			-1.95
		], [
			.14,
			.58,
			.75
		], palette.aqua);
		busMirrored(`central bus stanchion ${index} north`, `central bus stanchion ${index} south`, [
			seatX + .62,
			1.5,
			-1.5
		], [
			.07,
			1.2,
			.07
		], palette.white, false);
	}
	for (const [name, endX, endZ] of [[
		"coach windshield",
		-6.82,
		.14
	], [
		"coach rear glass",
		6.82,
		-.14
	]]) {
		const pane = box(name, [
			CENTRAL_BUS.x + endX,
			1.6,
			CENTRAL_BUS.z + endZ
		], [
			.27,
			1,
			4.28
		], palette.glass, false, false, true, "glass");
		pane.visible = false;
		pane.userData.collisionProxy = true;
		pane.userData.authoredCollisionAuthority = true;
	}
	const [vanLength, vanHeight, vanWidth] = PARKED_VAN_SIZE;
	for (const van of PARKED_VAN_LAYOUT) {
		box(van.id, [
			van.x,
			vanHeight / 2,
			van.z
		], [
			vanLength,
			vanHeight,
			vanWidth
		], palette.white, true, true, true, "vehicle");
		physicalCover.push({
			id: van.id,
			bounds: { ...colliders[colliders.length - 1] },
			blocksMovement: true,
			blocksShots: true
		});
		box(`${van.id} windscreen`, [
			van.x + (van.x > 0 ? -1.45 : 1.45),
			1.85,
			van.z
		], [
			.9,
			.7,
			vanWidth - .2
		], palette.glass, false, false);
		for (const wheelX of [-vanLength / 2 + .95, vanLength / 2 - .95]) {
			const wheel = new Mesh(new CylinderGeometry(.42, .42, .3, 8), palette.dark);
			wheel.rotation.x = Math.PI / 2;
			wheel.position.set(van.x + wheelX, .42, van.z);
			world.add(wheel);
		}
	}
	const [garageWidth, garageHeight, garageDepth] = GARAGE_SIZE;
	for (const [index, garage] of GARAGE_LAYOUT.entries()) {
		const facing = garage.z < 0 ? 1 : -1;
		box(`garage ${index}`, [
			garage.x,
			garageHeight / 2,
			garage.z
		], [
			garageWidth,
			garageHeight,
			garageDepth
		], palette.cream);
		box("garage door", [
			garage.x,
			1.35,
			garage.z + facing * (garageDepth / 2)
		], [
			garageWidth - 1.8,
			2.5,
			.18
		], palette.chrome, true, false, true, "thin-metal");
	}
	for (const car of KERB_CAR_LAYOUT) {
		const [carLength, carHeight, carWidth] = KERB_CAR_SIZE;
		box(car.id, [
			car.x,
			carHeight / 2,
			car.z
		], [
			carLength,
			carHeight,
			carWidth
		], palette.coral, true, false, true, "vehicle");
	}
	const moundAudit = [];
	for (const [id, x, z, sx, sz] of [[
		"west-verge",
		-36.2,
		-28.8,
		1.6,
		2.2
	], [
		"east-verge",
		36.2,
		28.8,
		1.6,
		2.2
	]]) {
		const colliderName = `terrain-mound-${id}-collider`;
		const authority = box(colliderName, [
			x,
			.55,
			z
		], [
			sx,
			1.1,
			sz
		], palette.grass, true, false, true, "earth");
		authority.visible = false;
		authority.userData.collisionAuthorityFor = `terrain-mound-${id}`;
		const mound = new Mesh(new SphereGeometry(1, 18, 10), palette.grass);
		mound.name = `terrain-mound-${id}`;
		mound.position.set(x, .28, z);
		mound.scale.set(sx / 2, .72, sz / 2);
		mound.castShadow = true;
		mound.receiveShadow = true;
		mound.userData.impactSurface = "soil";
		mound.userData.collisionAuthority = colliderName;
		world.add(mound);
		moundAudit.push({
			id,
			collider: colliderName,
			bottomY: -.44
		});
	}
	world.userData.atomicCollisionAudit = { terrainMounds: moundAudit };
	COVER_LAYOUT.forEach(([x, z, w, d], index) => {
		const id = authoredLargeCoverIdAt(x, z);
		const height = id ? AUTHORED_LARGE_COVER_HEIGHT : Math.abs(x) === 10.1 ? STREET_CRATE_HEIGHT : Math.abs(x) === 8.1 ? STREET_CRATE_TALL_HEIGHT : 1.6;
		const authoritativeCover = box(`cover ${index}`, [
			x,
			height / 2,
			z
		], [
			w,
			height,
			d
		], index % 2 ? palette.coral : palette.aqua);
		if (id) {
			authoritativeCover.visible = false;
			const visual = addPerformanceLargeCover(id, x, z);
			physicalCover.push({
				id,
				bounds: { ...colliders[colliders.length - 1] },
				blocksMovement: true,
				blocksShots: true,
				performanceVisualKind: visual.kind,
				performanceVisualMeshes: visual.meshes
			});
		}
	});
	const substantialPropColliders = [];
	const substantial = (name, position, size, material) => {
		substantialPropColliders.push(authoredCollisionProxy(name, position, size, material).name);
	};
	for (const [index, [x, z, scale]] of [
		[
			-9,
			-28.5,
			1
		],
		[
			9,
			28.5,
			1
		],
		[
			-33.5,
			-26,
			.9
		],
		[
			33.5,
			26,
			.9
		],
		[
			-13,
			27.5,
			.85
		],
		[
			13,
			-27.5,
			.85
		],
		[
			-34.5,
			10,
			.9
		],
		[
			34.5,
			-10,
			.9
		]
	].entries()) substantial(`authored-tree-trunk-collider-${index}`, [
		x,
		2 * scale,
		z
	], [
		.68 * scale,
		4 * scale,
		.68 * scale
	], "wood");
	for (const [index, [x, z]] of [[-16, -28.5], [16, 28.5]].entries()) substantial(`authored-planter-collider-${index}`, [
		x,
		.35,
		z
	], [
		2.2,
		.7,
		1.05
	], "concrete");
	for (const [index, [x, z]] of [[-30, -8], [30, 8]].entries()) substantial(`authored-extra-lamp-collider-${index}`, [
		x,
		2.8,
		z
	], [
		.3,
		5.6,
		.3
	], "structural-metal");
	for (const [index, z] of [-6.5, 6.5].entries()) substantial(`authored-civic-post-collider-${index}`, [
		0,
		3.25,
		z
	], [
		.32,
		6.5,
		.32
	], "structural-metal");
	for (const [houseIndex, house] of HOUSE_LAYOUT.entries()) {
		const { x, z, facing } = house;
		const tableX = x - 3;
		const tableZ = z - facing * 2.7;
		substantial(`authored-house-${houseIndex}-dining-collider`, [
			tableX,
			.62,
			tableZ
		], [
			2.8,
			1.24,
			1.45
		], "wood");
		for (const [chairIndex, [chairX, chairZ]] of [
			[tableX - 1.72, tableZ],
			[tableX + 1.72, tableZ],
			[tableX, tableZ - 1.05],
			[tableX, tableZ + 1.05]
		].entries()) substantial(`authored-house-${houseIndex}-chair-collider-${chairIndex}`, [
			chairX,
			.6,
			chairZ
		], [
			.72,
			1.2,
			.72
		], "wood");
		const sofaX = x + 3.7;
		const sofaZ = z + facing * 2.7;
		substantial(`authored-house-${houseIndex}-sofa-collider`, [
			sofaX,
			.85,
			sofaZ
		], [
			3.25,
			1.7,
			1.3
		], "wood");
		substantial(`authored-house-${houseIndex}-kitchen-collider`, [
			x - 3.75,
			1.15,
			z - facing * 5.25
		], [
			6.5,
			2.3,
			.85
		], "wood");
		substantial(`authored-house-${houseIndex}-coffee-table-collider`, [
			sofaX - .3,
			.36,
			sofaZ - facing * 1.5
		], [
			1.9,
			.72,
			.9
		], "wood");
		substantial(`authored-house-${houseIndex}-media-collider`, [
			x + 3.7,
			1.1,
			z - facing * 3.1
		], [
			2.6,
			2.2,
			.82
		], "wood");
		substantial(`authored-house-${houseIndex}-upper-bed-collider`, [
			x + 6.1,
			4,
			z - facing * 2.5
		], [
			3.2,
			1.05,
			2.2
		], "wood");
		substantial(`authored-house-${houseIndex}-upper-desk-collider`, [
			x - 3.2,
			4.25,
			z + facing * 2.8
		], [
			2.7,
			1.65,
			.92
		], "wood");
	}
	world.userData.atomicCollisionAudit.substantialProps = substantialPropColliders;
	const boundaryHalfX = ARENA_BOUNDS.maxX + .3;
	const boundaryHalfZ = ARENA_BOUNDS.maxZ + .3;
	const sideFenceLength = ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ + 1.6;
	const endFenceLength = ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX + 1;
	box("west fence", [
		-boundaryHalfX,
		1.5,
		0
	], [
		.6,
		3,
		sideFenceLength
	], palette.timber);
	box("east fence", [
		boundaryHalfX,
		1.5,
		0
	], [
		.6,
		3,
		sideFenceLength
	], palette.timber);
	box("north fence", [
		0,
		1.5,
		-boundaryHalfZ
	], [
		endFenceLength,
		3,
		.6
	], palette.timber);
	box("south fence", [
		0,
		1.5,
		boundaryHalfZ
	], [
		endFenceLength,
		3,
		.6
	], palette.timber);
	const postX = boundaryHalfX + .15;
	const postSpan = ARENA_BOUNDS.maxZ - 3.6;
	for (let postIndex = 0; postIndex < 8; postIndex += 1) {
		const z = -postSpan + postIndex * (2 * postSpan) / 7;
		box("fence post", [
			-postX,
			2.1,
			z
		], [
			.8,
			4.2,
			.8
		], palette.dark, false);
		box("fence post", [
			postX,
			2.1,
			z
		], [
			.8,
			4.2,
			.8
		], palette.dark, false);
	}
	function sign(text, x, y, z, rotationY = 0) {
		if (typeof document === "undefined") return;
		const canvas = document.createElement("canvas");
		canvas.width = 512;
		canvas.height = 192;
		const ctx = canvas.getContext("2d");
		ctx.fillStyle = "#13242b";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.strokeStyle = "#f3c34d";
		ctx.lineWidth = 16;
		ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
		ctx.fillStyle = "#f6ead6";
		ctx.font = "900 58px Arial";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(text, canvas.width / 2, canvas.height / 2);
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		const board = new Mesh(new PlaneGeometry(7, 2.65), new MeshBasicMaterial({ map: texture }));
		board.position.set(x, y, z);
		board.rotation.y = rotationY;
		world.add(board);
	}
	sign("NUKE TOWN", 0, 4.7, -29.9, 0);
	sign("TEST BLOCK 86", 0, 4.7, 29.9, Math.PI);
	function target(id, x, z, team) {
		const root = new Group();
		root.name = "practice-target";
		root.userData.targetId = id;
		root.position.set(x, 0, z);
		const targetMat = team === 0 ? palette.aqua : palette.coral;
		const torso = new Mesh(new CapsuleGeometry(.34, 1.05, 5, 10), targetMat);
		torso.name = `${id}-torso`;
		torso.position.y = 1.05;
		torso.castShadow = true;
		const head = new Mesh(new SphereGeometry(.28, 12, 8), palette.cream);
		head.name = `${id}-head`;
		head.position.y = 1.92;
		head.castShadow = true;
		root.add(torso, head);
		root.traverse((child) => {
			child.userData.targetRoot = root;
		});
		world.add(root);
		targets.push({
			id,
			root,
			active: true,
			respawnAt: 0,
			scoreValue: 1,
			distanceBand: "mid",
			maxHealth: 1,
			health: 1
		});
	}
	target("north-yard", -20, -20, 1);
	target("north-lane", 18, -6, 1);
	target("south-yard", 20, 20, 0);
	target("south-lane", -18, 6, 0);
	target("mid-coach", 8, 3, 1);
	target("mid-truck", -8, -3, 0);
	for (const [x, z] of [
		[-18, -16],
		[18, 16],
		[-26, -2],
		[26, 2]
	]) {
		box("lamp pole", [
			x,
			2.8,
			z
		], [
			.15,
			5.6,
			.15
		], palette.dark, true, true, true, "structural-metal");
		const lamp = new Mesh(new SphereGeometry(.28, 10, 8), new MeshStandardMaterial({
			color: 16773045,
			emissive: 16758861,
			emissiveIntensity: 2.2
		}));
		lamp.position.set(x, 5.55, z);
		world.add(lamp);
	}
	return {
		id: "atomic-acres",
		label: "Nuke Town",
		root: world,
		colliders,
		physicsColliders,
		raycastMeshes,
		shotSurfaces,
		patrolPoints: PATROL_LAYOUT.map(([x, z]) => new Vector3(x, 0, z)),
		targets,
		houses,
		houseDestruction: Object.freeze({
			definitions: Object.freeze([...houseFragmentDefinitions].sort((left, right) => left.id.localeCompare(right.id))),
			staticColliders: Object.freeze(staticHouseFragmentColliders),
			staticBallisticSurfaceIds: Object.freeze(staticHouseFragmentBallisticSurfaceIds)
		}),
		breakableWindows,
		physicalCover,
		houseTelemetry,
		bounds: { ...ARENA_BOUNDS },
		spawns: {
			0: SPAWN_LAYOUT[0].map(([x, z]) => new Vector3(x, 1.7, z)),
			1: SPAWN_LAYOUT[1].map(([x, z]) => new Vector3(x, 1.7, z))
		}
	};
}
//#endregion
export { pass73CollisionRouteFixtures as a, createHouseArchitecture as c, auditPass73CollisionRouteAuthority as i, solidBounds as l, buildArena as n, CharacterPhysics as o, assertPass73CollisionRouteAuthority as r, worldBoundaryColliders as s, authoredLargeCoverIdAt as t, retryLoad as u };
