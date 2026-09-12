import { If as Vector3, ds as Euler, mu as Quaternion } from "./vendor-three-aHPbjK02.js";
//#region src/arena-layout.ts
var ARENA_BOUNDS = Object.freeze({
	minX: -37,
	maxX: 37,
	minZ: -30,
	maxZ: 30
});
/** Half width of the drivable asphalt. The kerbs sit immediately outside it.
* HF-383 completion: widened from 5 to 6.5 m so the mid-street vehicles plus
* walkable flank channels fit beside the bus, matching the reference map's
* road-to-bus proportion. */
var STREET_HALF_WIDTH = 6.5;
/** Centre of the single central transit bus, the map's hard cover anchor. */
var CENTRAL_BUS = Object.freeze({
	x: 0,
	z: 0,
	size: Object.freeze([
		12.6,
		3,
		5.6
	]),
	/** Length of the authored bus body the collider wraps. */
	assetLength: 12.4
});
/**
* Two delivery vans staged IN THE MIDDLE OF THE STREET as a staggered pair,
* one flush against each end of the central bus and offset toward opposite
* kerbs diagonally - the reference map's bus-plus-two-vehicles midfield.
* Each van is flush to the bus end on its inner face (no seam to enter) and
* leaves a >= 1.4 m walk-through lane on its outer face, so it plays as hard
* cover on the crossing routes without walling the road. Height clears the
* crouched eye-line. 180-degree symmetric by pairing.
*/
var PARKED_VAN_LAYOUT = Object.freeze([Object.freeze({
	id: "east-parked-van",
	x: 8.6,
	z: -1.5
}), Object.freeze({
	id: "west-parked-van",
	x: -8.6,
	z: 1.5
})]);
/** [length along the street, height, width]. Height clears the 1.65 m eye-line. */
var PARKED_VAN_SIZE = Object.freeze([
	4.6,
	2.3,
	1.9
]);
/**
* REDESIGN: kerb-parked driveway cars, one per house, on the verge between the
* front hedge and the kerb - the reference's own break for the long sidewalk
* lanes (its yards park a car on each drive). Lower than the vans: crouch
* cover, but they kill the standing verge eye-line at |x| = 22. 180-degree
* symmetric by pairing.
*/
var KERB_CAR_LAYOUT = Object.freeze([Object.freeze({
	id: "north-kerb-car",
	x: 17,
	z: -7.3
}), Object.freeze({
	id: "south-kerb-car",
	x: -17,
	z: 7.3
})]);
var KERB_CAR_SIZE = Object.freeze([
	4.4,
	1.75,
	1.8
]);
/** Street-life props: benches on the verges, paired by rotation. */
var NEIGHBOURHOOD_BENCH_LAYOUT = Object.freeze([
	[
		12,
		-7.5,
		0
	],
	[
		-12,
		7.5,
		Math.PI
	],
	[
		4.5,
		-7.5,
		0
	],
	[
		-4.5,
		7.5,
		Math.PI
	]
]);
var HOUSE_LAYOUT = Object.freeze([Object.freeze({
	team: 0,
	x: -19,
	z: -17.4,
	facing: 1
}), Object.freeze({
	team: 1,
	x: 19,
	z: 17.4,
	facing: -1
})]);
var GARAGE_LAYOUT = Object.freeze([Object.freeze({
	x: -5.1,
	z: -12.5
}), Object.freeze({
	x: 5.1,
	z: 12.5
})]);
var GARAGE_SIZE = Object.freeze([
	7.2,
	3.3,
	6.6
]);
var COVER_LAYOUT = Object.freeze([
	[
		-10.1,
		-1.3,
		1.7,
		2.2
	],
	[
		10.1,
		1.3,
		1.7,
		2.2
	],
	[
		-8.1,
		-1.6,
		1.7,
		2.2
	],
	[
		8.1,
		1.6,
		1.7,
		2.2
	],
	[
		-9,
		-26,
		3,
		2.2
	],
	[
		9,
		26,
		3,
		2.2
	],
	[
		27,
		-13,
		2.8,
		4.4
	],
	[
		-27,
		13,
		2.8,
		4.4
	]
]);
/** Owner 2026-08-29/30: the street crates are JUMP-MOUNTABLE platforms
* (jump apex measures 0.82 m at 6.35 m/s vs 24.5 gravity). v5 makes them a
* stairway: the outer pair is one rise, the inner pair two rises, the bus
* roof the third. */
var STREET_CRATE_HEIGHT = .75;
var STREET_CRATE_TALL_HEIGHT = 1.5;
/** |x| of the outer (low) and inner (tall) stair crates in COVER_LAYOUT. */
var STREET_CRATE_LOW_X = 10.1;
var STREET_CRATE_TALL_X = 8.1;
/**
* REDESIGN D1: spawns live in the two END gardens, behind the spawn fences,
* looking down the street - the reference's defining flow. Team 0 owns the
* WEST garden (x <= -28.2), team 1 the exact 180-degree rotation in the east.
* Back row against the boundary, mid row behind the fence line, one forward
* corner spawn per team. Every point verified against the built colliders by
* the spawn-safety suite; the frozen world-identity spawn pin is re-pinned
* once for this redesign with docs/NUKETOWN_REDESIGN_2026-08-29.md as the
* recorded reason.
*/
var SPAWN_LAYOUT = Object.freeze({
	0: Object.freeze([
		[-35.5, -20],
		[-35.5, -12],
		[-35.5, -4],
		[-35.5, 4],
		[-35.5, 12],
		[-35.5, 20],
		[-33.5, -16],
		[-33.5, -8],
		[-33.5, 0],
		[-33.5, 8],
		[-33.5, 16],
		[-34.5, 23]
	]),
	1: Object.freeze([
		[35.5, 20],
		[35.5, 12],
		[35.5, 4],
		[35.5, -4],
		[35.5, -12],
		[35.5, -20],
		[33.5, 16],
		[33.5, 8],
		[33.5, 0],
		[33.5, -8],
		[33.5, -16],
		[34.5, -23]
	])
});
/** Bot patrol anchors along the redesigned street-axis flow: the two street
* mouths, the verge lanes beside each house, and the mid-street crossings.
* 180-degree symmetric by pairing. */
var PATROL_LAYOUT = Object.freeze([
	[-26, 0],
	[26, 0],
	[-5, 5.2],
	[5, -5.2],
	[0, 7.5],
	[0, -7.5],
	[-20, -7.5],
	[20, 7.5]
]);
var NEIGHBOURHOOD_BIN_POSITIONS = Object.freeze([
	[-12.5, -8.4],
	[12.5, 8.4],
	[1.2, -6.5],
	[-1.2, 6.5],
	[-30.5, -26],
	[30.5, 26]
]);
var NEIGHBOURHOOD_BENCH_COLLIDER_SIZE = Object.freeze([
	2.5,
	1.34,
	.72
]);
var NEIGHBOURHOOD_BIN_COLLIDER_SIZE = Object.freeze([
	.78,
	1.08,
	.72
]);
//#endregion
//#region src/ballistics.ts
/** One canonical resistance table for every arena and every firearm. */
var BALLISTIC_MATERIALS = Object.freeze({
	glass: Object.freeze({
		entryCost: .08,
		costPerMeter: .25
	}),
	fence: Object.freeze({
		entryCost: .18,
		costPerMeter: .38
	}),
	wood: Object.freeze({
		entryCost: .38,
		costPerMeter: .78
	}),
	"interior-wall": Object.freeze({
		entryCost: .42,
		costPerMeter: 1.05
	}),
	brick: Object.freeze({
		entryCost: 1.7,
		costPerMeter: 5
	}),
	concrete: Object.freeze({
		entryCost: 2.5,
		costPerMeter: 7
	}),
	"thin-metal": Object.freeze({
		entryCost: .95,
		costPerMeter: 3
	}),
	"structural-metal": Object.freeze({
		entryCost: 2.15,
		costPerMeter: 6.4
	}),
	vehicle: Object.freeze({
		entryCost: 2.5,
		costPerMeter: 4.8
	}),
	container: Object.freeze({
		entryCost: 3,
		costPerMeter: 7.2
	}),
	earth: Object.freeze({
		entryCost: 4,
		costPerMeter: 12
	}),
	reinforced: Object.freeze({
		entryCost: 1e3,
		costPerMeter: 1e3
	})
});
/**
* Central material rule. Unknown future shot blockers stay safe as reinforced
* cover and fail the arena coverage verifier through `classification=fallback`.
*/
function isBallisticMaterialId(candidate) {
	return typeof candidate === "string" && Object.hasOwn(BALLISTIC_MATERIALS, candidate);
}
function classifyBallisticMaterial(evidence) {
	if (evidence.material !== void 0) {
		if (isBallisticMaterialId(evidence.material)) return {
			material: evidence.material,
			classification: "explicit"
		};
		return {
			material: "reinforced",
			classification: "fallback"
		};
	}
	const name = evidence.name.toLowerCase();
	if (/(glass|window|pane)/.test(name)) return {
		material: "glass",
		classification: "rule"
	};
	if (/(fence|mesh barrier|chain.?link)/.test(name)) return {
		material: "fence",
		classification: "rule"
	};
	if (/(shipping.container|cargo.stack|freight.crate|tarmac.cargo|baggage.item)/.test(name)) return {
		material: "container",
		classification: "rule"
	};
	if (/(bus|coach|shuttle|vehicle|trailer|jetliner|fuselage|wing|engine|airstair|luggage.cart)/.test(name)) return {
		material: "vehicle",
		classification: "rule"
	};
	if (/(berm|soil|ground|grass|sand|earth)/.test(name)) return {
		material: "earth",
		classification: "rule"
	};
	if (/(brick|masonry)/.test(name)) return {
		material: "brick",
		classification: "rule"
	};
	if (/(timber|wood|pallet|deck|ramp|landing|bench|seat|counter)/.test(name)) return {
		material: "wood",
		classification: "rule"
	};
	if (/(plaster|partition|house|garage|hut|kiosk|wall|ceiling)/.test(name)) return {
		material: "interior-wall",
		classification: "rule"
	};
	if (/(container|backstop|foundation|plinth|concrete|curb|sidewalk|hardstand|cover|barrier|mezzanine|floor)/.test(name)) return {
		material: "concrete",
		classification: "rule"
	};
	if (/(rail|post|column|divider|scanner|belt|carousel|manifold|tank|steel|metal|tower|brace|girder|grate)/.test(name)) return {
		material: "structural-metal",
		classification: "rule"
	};
	if (evidence.impactSurface === "glass") return {
		material: "glass",
		classification: "rule"
	};
	if (evidence.impactSurface === "wood") return {
		material: "wood",
		classification: "rule"
	};
	if (evidence.impactSurface === "soil") return {
		material: "earth",
		classification: "rule"
	};
	if (evidence.impactSurface === "metal") return {
		material: "structural-metal",
		classification: "rule"
	};
	return {
		material: "reinforced",
		classification: "fallback"
	};
}
function createBallisticSurface(id, name, bounds, evidence = {}, breakableWindowId) {
	return Object.freeze({
		id,
		name,
		bounds: { ...bounds },
		...classifyBallisticMaterial({
			name,
			...evidence
		}),
		...breakableWindowId ? { breakableWindowId } : {}
	});
}
function finitePoint(point) {
	return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}
function surfaceInterval(origin, unitDirection, maxDistance, surface) {
	const box = surface.bounds;
	const centre = new Vector3((box.minX + box.maxX) / 2, ((box.minY ?? 0) + (box.maxY ?? 8)) / 2, (box.minZ + box.maxZ) / 2);
	const half = new Vector3(Math.max(0, box.maxX - box.minX) / 2, Math.max(0, (box.maxY ?? 8) - (box.minY ?? 0)) / 2, Math.max(0, box.maxZ - box.minZ) / 2);
	const worldRotation = new Quaternion();
	if (box.rotation) worldRotation.setFromEuler(new Euler(...box.rotation));
	const inverseRotation = worldRotation.clone().invert();
	const localOrigin = new Vector3(origin.x, origin.y, origin.z).sub(centre).applyQuaternion(inverseRotation);
	const localDirection = new Vector3(unitDirection.x, unitDirection.y, unitDirection.z).applyQuaternion(inverseRotation);
	let near = 0;
	let far = maxDistance;
	let nearAxis = -1;
	let nearSign = 0;
	for (const [axis, start, delta, extent] of [
		[
			0,
			localOrigin.x,
			localDirection.x,
			half.x
		],
		[
			1,
			localOrigin.y,
			localDirection.y,
			half.y
		],
		[
			2,
			localOrigin.z,
			localDirection.z,
			half.z
		]
	]) {
		if (Math.abs(delta) < 1e-8) {
			if (start < -extent || start > extent) return null;
			continue;
		}
		let first = (-extent - start) / delta;
		let second = (extent - start) / delta;
		let sign = -Math.sign(delta);
		if (first > second) {
			[first, second] = [second, first];
			sign *= -1;
		}
		if (first > near) {
			near = first;
			nearAxis = axis;
			nearSign = sign;
		}
		far = Math.min(far, second);
		if (near > far) return null;
	}
	if (far <= 1e-5 || near >= maxDistance) return null;
	const localNormal = new Vector3();
	if (nearAxis === 0) localNormal.x = nearSign;
	else if (nearAxis === 1) localNormal.y = nearSign;
	else if (nearAxis === 2) localNormal.z = nearSign;
	else localNormal.copy(localDirection).multiplyScalar(-1).normalize();
	const normal = localNormal.applyQuaternion(worldRotation).normalize();
	return {
		surface,
		entryDistance: Math.max(0, near),
		exitDistance: Math.min(maxDistance, far),
		entryNormal: {
			x: normal.x,
			y: normal.y,
			z: normal.z
		}
	};
}
/**
* HF-368: single place the per-weapon wallbang scalar enters the model. It scales
* the energy budget only - material entry/traversal costs are untouched - so more
* penetration means thicker surfaces become shootable and more damage survives a
* surface, never that a crossed surface becomes free damage: every material still
* charges its full toll, and `damageMultiplier` stays strictly below 1 for any
* traversed surface because `entryCost` is positive for every material.
*/
function weaponPenetrationEnergy(profile) {
	const scalar = Number.isFinite(profile.wallPenetrationMultiplier) && (profile.wallPenetrationMultiplier ?? 0) > 0 ? profile.wallPenetrationMultiplier : 1;
	return Math.max(0, profile.penetrationPower * profile.fmjMultiplier * scalar);
}
function penetrationEnergyRetention(profile, distance) {
	const clamped = Math.max(0, Number.isFinite(distance) ? distance : 0);
	if (clamped <= profile.energyFalloffStart) return 1;
	const progress = Math.min(1, (clamped - profile.energyFalloffStart) / Math.max(.001, profile.energyFalloffEnd - profile.energyFalloffStart));
	return 1 + (profile.minimumEnergyRetention - 1) * progress;
}
/** Shared deterministic FMJ-like trace used by local, bot, and network authority. */
function traceBallisticPath(origin, direction, requestedDistance, profile, surfaces, apertureQuery) {
	const directionMagnitude = Math.hypot(direction.x, direction.y, direction.z);
	const targetDistance = Math.max(0, Number.isFinite(requestedDistance) ? requestedDistance : 0);
	if (!finitePoint(origin) || !finitePoint(direction) || directionMagnitude < 1e-8 || targetDistance <= 0) return {
		reachedDistance: false,
		travelDistance: 0,
		damageMultiplier: 0,
		remainingEnergy: 0,
		impacts: []
	};
	const unit = {
		x: direction.x / directionMagnitude,
		y: direction.y / directionMagnitude,
		z: direction.z / directionMagnitude
	};
	const intervals = surfaces.map((surface) => surfaceInterval(origin, unit, targetDistance, surface)).filter((entry) => entry !== null).filter((entry) => !apertureQuery?.(entry.surface, {
		x: origin.x + unit.x * entry.entryDistance,
		y: origin.y + unit.y * entry.entryDistance,
		z: origin.z + unit.z * entry.entryDistance
	})).sort((a, b) => a.entryDistance - b.entryDistance || a.exitDistance - b.exitDistance || a.surface.id.localeCompare(b.surface.id));
	const initialEnergy = weaponPenetrationEnergy(profile);
	let energy = initialEnergy;
	let lastDistance = 0;
	let penetratedSurfaces = 0;
	const impacts = [];
	for (const interval of intervals) {
		const entryRetention = penetrationEnergyRetention(profile, interval.entryDistance);
		const priorRetention = penetrationEnergyRetention(profile, lastDistance);
		energy *= priorRetention > 0 ? entryRetention / priorRetention : 0;
		const thickness = Math.max(0, interval.exitDistance - interval.entryDistance);
		const resistance = BALLISTIC_MATERIALS[interval.surface.material];
		const traversalCost = resistance.entryCost + resistance.costPerMeter * thickness;
		const exceedsSurfaceLimit = penetratedSurfaces >= profile.maxPenetratedSurfaces;
		if (exceedsSurfaceLimit || energy <= traversalCost + 1e-8) {
			const afterEntry = Math.max(0, energy - resistance.entryCost);
			const distanceIntoSurface = exceedsSurfaceLimit || resistance.costPerMeter <= 0 ? 0 : Math.min(thickness, afterEntry / resistance.costPerMeter);
			const stopDistance = interval.entryDistance + distanceIntoSurface;
			impacts.push({
				surface: interval.surface,
				entryDistance: interval.entryDistance,
				exitDistance: stopDistance,
				thickness: distanceIntoSurface,
				penetrated: false,
				entryNormal: interval.entryNormal
			});
			return {
				reachedDistance: false,
				travelDistance: stopDistance,
				damageMultiplier: 0,
				remainingEnergy: 0,
				impacts,
				stoppedBy: interval.surface
			};
		}
		energy -= traversalCost;
		penetratedSurfaces += 1;
		lastDistance = interval.exitDistance;
		impacts.push({
			surface: interval.surface,
			entryDistance: interval.entryDistance,
			exitDistance: interval.exitDistance,
			thickness,
			penetrated: true,
			entryNormal: interval.entryNormal
		});
	}
	const targetRetention = penetrationEnergyRetention(profile, targetDistance);
	const priorRetention = penetrationEnergyRetention(profile, lastDistance);
	energy *= priorRetention > 0 ? targetRetention / priorRetention : 0;
	const unoccludedEnergyAtTarget = initialEnergy * targetRetention;
	const retainedThroughCover = unoccludedEnergyAtTarget > 1e-8 ? energy / unoccludedEnergyAtTarget : 0;
	return {
		reachedDistance: true,
		travelDistance: targetDistance,
		damageMultiplier: impacts.length === 0 ? 1 : Math.min(1, Math.max(profile.minimumWallDamageMultiplier, retainedThroughCover)),
		remainingEnergy: Math.max(0, energy),
		impacts
	};
}
function applyPenetrationDamage(baseDamage, multiplier) {
	if (!Number.isFinite(baseDamage) || baseDamage <= 0 || !Number.isFinite(multiplier) || multiplier <= 0) return 0;
	const boundedMultiplier = Math.min(1, multiplier);
	return boundedMultiplier >= 1 ? baseDamage : Math.max(1, Math.round(baseDamage * boundedMultiplier));
}
function applyObstructionSpreadPenalty(baseSpreadRadians, penaltyRadians) {
	if (!Number.isFinite(baseSpreadRadians) || baseSpreadRadians <= 0) return baseSpreadRadians;
	if (!Number.isFinite(penaltyRadians) || penaltyRadians <= 0) return baseSpreadRadians;
	return baseSpreadRadians + penaltyRadians;
}
function ballisticImpactSurface(material) {
	if (material === "glass") return "glass";
	if (material === "fence" || material === "wood" || material === "interior-wall") return "wood";
	if (material === "thin-metal" || material === "structural-metal" || material === "vehicle" || material === "container") return "metal";
	if (material === "earth") return "soil";
	return "concrete";
}
/** Target proximity and cover penetration resolved from the exact same ray. */
function resolveBallisticHitscanAgainstTarget(origin, direction, maxDistance, target, targetRadius, profile, surfaces) {
	const magnitude = Math.hypot(direction.x, direction.y, direction.z) || 1;
	const unit = {
		x: direction.x / magnitude,
		y: direction.y / magnitude,
		z: direction.z / magnitude
	};
	const toTarget = {
		x: target.x - origin.x,
		y: target.y - origin.y,
		z: target.z - origin.z
	};
	const along = toTarget.x * unit.x + toTarget.y * unit.y + toTarget.z * unit.z;
	const closest = {
		x: origin.x + unit.x * along,
		y: origin.y + unit.y * along,
		z: origin.z + unit.z * along
	};
	const missDistance = Math.hypot(target.x - closest.x, target.y - closest.y, target.z - closest.z);
	const targetCandidate = along > 0 && along <= maxDistance && missDistance < targetRadius;
	const trace = traceBallisticPath(origin, unit, targetCandidate ? along : maxDistance, profile, surfaces);
	return {
		hitTarget: targetCandidate && trace.reachedDistance,
		tracerDistance: trace.travelDistance,
		targetDistanceAlongRay: along,
		damageMultiplier: targetCandidate && trace.reachedDistance ? trace.damageMultiplier : 0,
		trace
	};
}
//#endregion
//#region src/combat-feedback.ts
var CONFIRM_ENVELOPES = {
	body: {
		durationMs: 180,
		visualScale: 1,
		audioLayers: 2,
		frequencyHz: [910, 1320]
	},
	head: {
		durationMs: 210,
		visualScale: 1.18,
		audioLayers: 2,
		frequencyHz: [1260, 1840]
	},
	kill: {
		durationMs: 330,
		visualScale: 1.42,
		audioLayers: 3,
		frequencyHz: [
			510,
			790,
			1120
		]
	}
};
/** Shared deterministic timing/intensity contract for visual and synthesized confirms. */
function combatConfirmEnvelope(kind) {
	return CONFIRM_ENVELOPES[kind];
}
var SURFACES = /* @__PURE__ */ new Set([
	"metal",
	"concrete",
	"wood",
	"soil",
	"glass"
]);
function classifyImpactSurface(evidence) {
	if (typeof evidence.hint === "string" && SURFACES.has(evidence.hint)) return evidence.hint;
	const name = (evidence.name ?? "").toLowerCase();
	if (/(glass|window|pane)/.test(name)) return "glass";
	if (/(metal|steel|chrome|vehicle|coach|truck|hydrant|mailbox|barrier|fence post|utility|tower)/.test(name)) return "metal";
	if (/(wood|timber|deck|tree|trunk|branch|fence)/.test(name)) return "wood";
	if (/(grass|ground|soil|garden|planter|shrub|hedge)/.test(name)) return "soil";
	if (typeof evidence.metalness === "number" && evidence.metalness >= .42) return "metal";
	return "concrete";
}
function distancePointToSegment(point, start, end) {
	const abX = end.x - start.x;
	const abY = end.y - start.y;
	const abZ = end.z - start.z;
	const apX = point.x - start.x;
	const apY = point.y - start.y;
	const apZ = point.z - start.z;
	const lengthSq = abX * abX + abY * abY + abZ * abZ;
	const t = lengthSq <= 1e-9 ? 0 : Math.min(1, Math.max(0, (apX * abX + apY * abY + apZ * abZ) / lengthSq));
	const dx = start.x + abX * t - point.x;
	const dy = start.y + abY * t - point.y;
	const dz = start.z + abZ * t - point.z;
	return Math.hypot(dx, dy, dz);
}
function nearMissStrength(point, start, end) {
	const distance = distancePointToSegment(point, start, end);
	if (distance < .6 || distance > 2.6) return 0;
	return Math.min(1, Math.max(0, 1 - (distance - .6) / 2));
}
/** Authored walkable-surface classifier for synthesized first-person footsteps. */
function classifyFootstepSurface(point) {
	if (![
		point.x,
		point.y,
		point.z
	].every(Number.isFinite)) return "soil";
	for (const house of HOUSE_LAYOUT) {
		const localX = Math.abs(point.x - house.x);
		const localZ = Math.abs(point.z - house.z);
		if (point.y > 3.05 && localX <= 9.1 && localZ <= 8.2) return "wood";
		const deckZ = house.z - house.facing * 10.2;
		if (localX <= 5 && Math.abs(point.z - deckZ) <= 1.8 && point.y < 1.4) return "wood";
	}
	const roadDistance = Math.abs(point.z);
	if (roadDistance <= 6.5) return "asphalt";
	if (roadDistance <= 8.8) return "concrete";
	return "soil";
}
//#endregion
export { STREET_CRATE_TALL_X as A, PARKED_VAN_LAYOUT as C, STREET_CRATE_HEIGHT as D, SPAWN_LAYOUT as E, STREET_CRATE_LOW_X as O, NEIGHBOURHOOD_BIN_POSITIONS as S, PATROL_LAYOUT as T, KERB_CAR_LAYOUT as _, applyObstructionSpreadPenalty as a, NEIGHBOURHOOD_BENCH_LAYOUT as b, createBallisticSurface as c, ARENA_BOUNDS as d, CENTRAL_BUS as f, HOUSE_LAYOUT as g, GARAGE_SIZE as h, nearMissStrength as i, STREET_HALF_WIDTH as j, STREET_CRATE_TALL_HEIGHT as k, resolveBallisticHitscanAgainstTarget as l, GARAGE_LAYOUT as m, classifyImpactSurface as n, applyPenetrationDamage as o, COVER_LAYOUT as p, combatConfirmEnvelope as r, ballisticImpactSurface as s, classifyFootstepSurface as t, traceBallisticPath as u, KERB_CAR_SIZE as v, PARKED_VAN_SIZE as w, NEIGHBOURHOOD_BIN_COLLIDER_SIZE as x, NEIGHBOURHOOD_BENCH_COLLIDER_SIZE as y };
