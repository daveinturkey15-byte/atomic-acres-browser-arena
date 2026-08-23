import { Ac as MathUtils, Fc as Mesh, Fl as PlaneGeometry, Go as Euler, Ic as MeshBasicMaterial, Jl as Quaternion, Jo as ExtrudeGeometry, Ju as RepeatWrapping, Ka as ConeGeometry, Kd as TorusGeometry, Ll as PointLight, Ma as CapsuleGeometry, Nc as Matrix4, Sa as BoxGeometry, Ta as BufferGeometry, Wc as MeshStandardMaterial, Zo as Float32BufferAttribute, _d as SphereGeometry, _f as Vector3, ba as Box3, cd as ShapeGeometry, dc as LinearFilter, hc as LinearMipmapLinearFilter, hs as Group, i as mergeGeometries, ja as CanvasTexture, ks as InstancedMesh, mo as CylinderGeometry, nd as SRGBColorSpace, ru as RGBAFormat, sd as Shape, vo as DataTexture, vs as HemisphereLight, xd as SpotLight } from "./vendor-three-VV5gneRl.js";
import { E as movementProfile, Ot as WEAPON_IDS, P as buildOperator, Qn as PASS65_KILLSTREAK_CATALOG, Qr as applyBotEmissiveBrightness, U as poseOperator, o as WEAPONS } from "./gameplay-D7mQKMV7.js";
import { c as createBallisticSurface, n as classifyImpactSurface } from "./combat-feedback-bO2zzrSz.js";
//#region src/rendering/light-occlusion.ts
/** Keep the visible emitter, baked contribution or global rig; remove the unoccluded runtime volume. */
function makeEmissiveOnly(light) {
	const tagged = light;
	tagged.userData.occlusionPolicy = "emissive-only";
	tagged.userData.authoredIntensity = light.intensity;
	light.intensity = 0;
	light.visible = false;
	light.castShadow = false;
}
function makeShadowedLocal(light) {
	const tagged = light;
	tagged.userData.occlusionPolicy = "shadowed-local";
	light.castShadow = true;
}
function auditLocalLightOcclusion(root, layerMask) {
	let activeLocalLights = 0;
	let shadowedLocalLights = 0;
	let emissiveOnlySources = 0;
	const violations = [];
	root.traverse((node) => {
		if (!(node instanceof PointLight || node instanceof SpotLight)) return;
		if (layerMask !== void 0 && (node.layers.mask & layerMask) === 0) return;
		const tagged = node;
		if (tagged.userData.occlusionPolicy === "emissive-only") {
			emissiveOnlySources += 1;
			if (node.visible) violations.push(`${node.name || "(unnamed)"}:emissive-only-render-visible`);
			if (node.intensity !== 0 || node.castShadow) violations.push(`${node.name}:emissive-only-runtime-light`);
			return;
		}
		if (node.intensity <= 0) return;
		activeLocalLights += 1;
		if (tagged.userData.occlusionPolicy === "shadowed-local" && node.castShadow) shadowedLocalLights += 1;
		else violations.push(`${node.name || "(unnamed)"}:unoccluded-active-light`);
	});
	return {
		activeLocalLights,
		shadowedLocalLights,
		emissiveOnlySources,
		violations
	};
}
//#endregion
//#region src/gun-range-armory.ts
var GUN_RANGE_ARMORY_INTERACTION_RANGE = 2.6;
var GUN_RANGE_WEAPON_STATIONS = Object.freeze([
	Object.freeze({
		id: "range-carbine",
		weapon: "carbine",
		label: "CARBINE",
		position: Object.freeze({
			x: -12,
			y: 1.4,
			z: 11
		})
	}),
	Object.freeze({
		id: "range-smg",
		weapon: "smg",
		label: "SMG",
		position: Object.freeze({
			x: -6,
			y: 1.4,
			z: 11
		})
	}),
	Object.freeze({
		id: "range-lmg",
		weapon: "lmg",
		label: "LMG",
		position: Object.freeze({
			x: 0,
			y: 1.4,
			z: 11
		})
	}),
	Object.freeze({
		id: "range-scattergun",
		weapon: "scattergun",
		label: "SCATTERGUN",
		position: Object.freeze({
			x: 6,
			y: 1.4,
			z: 11
		})
	}),
	Object.freeze({
		id: "range-sniper",
		weapon: "sniper",
		label: "SNIPER",
		position: Object.freeze({
			x: 12,
			y: 1.4,
			z: 11
		})
	})
]);
function nearestGunRangeWeaponStation(position, maximumDistance = GUN_RANGE_ARMORY_INTERACTION_RANGE) {
	if (![
		position.x,
		position.y,
		position.z,
		maximumDistance
	].every(Number.isFinite) || maximumDistance < 0) return null;
	let nearest = null;
	let nearestDistanceSquared = maximumDistance * maximumDistance;
	for (const station of GUN_RANGE_WEAPON_STATIONS) {
		const dx = position.x - station.position.x;
		const dy = position.y - station.position.y;
		const dz = position.z - station.position.z;
		const distanceSquared = dx * dx + dy * dy + dz * dz;
		if (distanceSquared > nearestDistanceSquared) continue;
		nearest = station;
		nearestDistanceSquared = distanceSquared;
	}
	return nearest;
}
//#endregion
//#region src/gun-range-test-bay.ts
var GUN_RANGE_TEST_BAY_DOOR_ID = "gun-range:test-bay-secure-door";
var GUN_RANGE_TEST_BAY_DOOR_TRIGGER_RADIUS_M = 4.2;
var GUN_RANGE_TEST_BAY_DOOR_RELEASE_RADIUS_M = 6.4;
var GUN_RANGE_TEST_BAY_STATION_INTERACTION_RANGE_M = 2.8;
var GUN_RANGE_TEST_BAY_DOOR_BALLISTIC_ID = `${GUN_RANGE_TEST_BAY_DOOR_ID}:ballistic`;
var structureDefinition = (definition) => Object.freeze(definition);
/**
* One source of truth for the annex's visible mass, player/Rapier collision,
* and ballistic surfaces. Every entry is core geometry in every presentation
* profile; decorative skins and lights may vary without changing this list.
*/
var GUN_RANGE_TEST_BAY_STRUCTURE = Object.freeze([
	structureDefinition({
		id: "gun-range-test-bay-corridor-floor",
		position: [
			36,
			-.1,
			12
		],
		size: [
			31.5,
			.2,
			8.5
		],
		material: "floor",
		ballisticMaterial: "concrete"
	}),
	structureDefinition({
		id: "gun-range-test-bay-corridor-north-wall",
		position: [
			36,
			2.6,
			7.75
		],
		size: [
			31.5,
			5.2,
			.5
		],
		material: "wall",
		ballisticMaterial: "structural-metal"
	}),
	structureDefinition({
		id: "gun-range-test-bay-corridor-south-wall",
		position: [
			36,
			2.6,
			16.25
		],
		size: [
			31.5,
			5.2,
			.5
		],
		material: "wall",
		ballisticMaterial: "structural-metal"
	}),
	structureDefinition({
		id: "gun-range-test-bay-corridor-ceiling",
		position: [
			36,
			5.15,
			12
		],
		size: [
			31.5,
			.35,
			9
		],
		material: "ceiling",
		ballisticMaterial: "structural-metal"
	}),
	structureDefinition({
		id: "gun-range-test-bay-floor",
		position: [
			75.75,
			-.1,
			6
		],
		size: [
			48.5,
			.2,
			64
		],
		material: "floor",
		ballisticMaterial: "concrete"
	}),
	structureDefinition({
		id: "gun-range-test-bay-ceiling",
		position: [
			75.75,
			25.35,
			6
		],
		size: [
			48.5,
			.35,
			64
		],
		material: "ceiling",
		ballisticMaterial: "structural-metal"
	}),
	structureDefinition({
		id: "gun-range-test-bay-east-wall",
		position: [
			100.25,
			12.7625,
			6
		],
		size: [
			.5,
			25.525,
			64.5
		],
		material: "wall",
		ballisticMaterial: "structural-metal"
	}),
	structureDefinition({
		id: "gun-range-test-bay-north-wall",
		position: [
			75.75,
			12.7625,
			-26.25
		],
		size: [
			49,
			25.525,
			.5
		],
		material: "wall",
		ballisticMaterial: "structural-metal"
	}),
	structureDefinition({
		id: "gun-range-test-bay-south-wall",
		position: [
			75.75,
			12.7625,
			38.25
		],
		size: [
			49,
			25.525,
			.5
		],
		material: "wall",
		ballisticMaterial: "structural-metal"
	}),
	structureDefinition({
		id: "gun-range-test-bay-west-wall-north",
		position: [
			51.75,
			12.7625,
			-9.1
		],
		size: [
			.5,
			25.525,
			33.8
		],
		material: "wall",
		ballisticMaterial: "structural-metal"
	}),
	structureDefinition({
		id: "gun-range-test-bay-west-wall-south",
		position: [
			51.75,
			12.7625,
			27.1
		],
		size: [
			.5,
			25.525,
			21.8
		],
		material: "wall",
		ballisticMaterial: "structural-metal"
	}),
	structureDefinition({
		id: "gun-range-test-bay-door-jamb-north",
		position: [
			51.75,
			3.25,
			8
		],
		size: [
			.5,
			6.5,
			.4
		],
		material: "door-frame",
		ballisticMaterial: "structural-metal",
		assemblyRole: "jamb"
	}),
	structureDefinition({
		id: "gun-range-test-bay-door-jamb-south",
		position: [
			51.75,
			3.25,
			16
		],
		size: [
			.5,
			6.5,
			.4
		],
		material: "door-frame",
		ballisticMaterial: "structural-metal",
		assemblyRole: "jamb"
	}),
	structureDefinition({
		id: "gun-range-test-bay-door-frame-top",
		position: [
			51.75,
			7.45,
			12
		],
		size: [
			.5,
			1.9,
			7.6
		],
		material: "door-frame",
		ballisticMaterial: "structural-metal",
		assemblyRole: "header"
	}),
	structureDefinition({
		id: "gun-range-test-bay-door-bulkhead",
		position: [
			51.75,
			16.9625,
			12
		],
		size: [
			.5,
			17.125,
			7.6
		],
		material: "wall",
		ballisticMaterial: "structural-metal",
		assemblyRole: "bulkhead"
	})
]);
var WALK_SPEED_MPS = movementProfile({
	crouched: false,
	prone: false,
	ads: false,
	sprinting: false,
	grounded: true
}).maxSpeed;
var corridorEntry = Object.freeze({
	x: 20.5,
	y: 1.7,
	z: 12
});
var doorApproach = Object.freeze({
	x: 51.25,
	y: 1.7,
	z: 12
});
var corridorLengthM = doorApproach.x - corridorEntry.x;
var supportStations = Object.freeze(PASS65_KILLSTREAK_CATALOG.definitions.filter((definition) => definition.availability !== "care-only").map((definition, index) => Object.freeze({
	id: definition.id,
	position: Object.freeze({
		x: 92 - Math.floor(index / 6) * 8,
		y: .08,
		z: -19 + index % 6 * 9.6
	}),
	runtimeStatus: "active-training-station"
})));
var weaponStations = Object.freeze(WEAPON_IDS.map((weaponId, index) => Object.freeze({
	id: weaponId,
	position: Object.freeze({
		x: 59 + index % 6 * 6.2,
		y: .08,
		z: 31 - Math.floor(index / 6) * 4.2
	}),
	runtimeStatus: "active-training-station"
})));
var GUN_RANGE_TEST_BAY_CONTRACT = Object.freeze({
	schemaVersion: 1,
	corridor: Object.freeze({
		entry: corridorEntry,
		doorApproach,
		lengthM: corridorLengthM,
		canonicalWalkSpeedMps: WALK_SPEED_MPS,
		nominalTraversalSeconds: corridorLengthM / WALK_SPEED_MPS,
		clearWidthM: 7.5,
		clearHeightM: 4.8
	}),
	bay: Object.freeze({
		bounds: Object.freeze({
			minX: 52,
			maxX: 100,
			minY: 0,
			maxY: 25.175,
			minZ: -26,
			maxZ: 38
		}),
		clearFloorAreaM2: 3072
	}),
	door: Object.freeze({
		id: GUN_RANGE_TEST_BAY_DOOR_ID,
		trigger: Object.freeze({
			x: 48.75,
			y: 1.7,
			z: 12
		}),
		closedBounds: Object.freeze({
			minX: 51.15,
			maxX: 51.85,
			minY: 0,
			maxY: 6.5,
			minZ: 8.2,
			maxZ: 15.8
		}),
		travelM: 7,
		openDurationMs: 720,
		thumpIntent: "secure-door-opening-thump"
	}),
	dummies: Object.freeze([
		Object.freeze({
			id: "test-dummy-alpha",
			start: Object.freeze({
				x: 63,
				y: 0,
				z: -16
			}),
			end: Object.freeze({
				x: 77,
				y: 0,
				z: -16
			}),
			speedMps: .72,
			phase: 0,
			armed: false
		}),
		Object.freeze({
			id: "test-dummy-bravo",
			start: Object.freeze({
				x: 62,
				y: 0,
				z: -6
			}),
			end: Object.freeze({
				x: 78,
				y: 0,
				z: -6
			}),
			speedMps: .68,
			phase: .33,
			armed: false
		}),
		Object.freeze({
			id: "test-dummy-charlie",
			start: Object.freeze({
				x: 63,
				y: 0,
				z: 4
			}),
			end: Object.freeze({
				x: 77,
				y: 0,
				z: 4
			}),
			speedMps: .76,
			phase: .66,
			armed: false
		}),
		Object.freeze({
			id: "test-dummy-delta",
			start: Object.freeze({
				x: 62,
				y: 0,
				z: 14
			}),
			end: Object.freeze({
				x: 78,
				y: 0,
				z: 14
			}),
			speedMps: .7,
			phase: .91,
			armed: false
		})
	]),
	supportStations,
	weaponStations,
	provenance: Object.freeze({
		policy: "repository-procedural-original",
		authority: "src/gun-range-test-bay.ts+src/additional-maps.ts",
		assetDependencies: Object.freeze([])
	})
});
var GUN_RANGE_TEST_BAY_DOOR_STATE_KEYS = Object.freeze([
	"phase",
	"openness",
	"updatedAtMs",
	"thumpSequence"
]);
function distanceToDoorTrigger(position) {
	const trigger = GUN_RANGE_TEST_BAY_CONTRACT.door.trigger;
	return Math.hypot(position.x - trigger.x, position.y - trigger.y, position.z - trigger.z);
}
function isGunRangeTestBayDoorState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const state = value;
	return Object.keys(state).length === GUN_RANGE_TEST_BAY_DOOR_STATE_KEYS.length && GUN_RANGE_TEST_BAY_DOOR_STATE_KEYS.every((key) => Object.hasOwn(state, key)) && (state.phase === "closed" || state.phase === "opening" || state.phase === "open" || state.phase === "closing") && Number.isFinite(state.openness) && Number(state.openness) >= 0 && Number(state.openness) <= 1 && Number.isFinite(state.updatedAtMs) && Number(state.updatedAtMs) >= 0 && Number.isSafeInteger(state.thumpSequence) && Number(state.thumpSequence) >= 0 && Number(state.thumpSequence) <= 1e9 && (state.phase !== "closed" || state.openness === 0) && (state.phase !== "open" || state.openness === 1);
}
function createGunRangeTestBayDoorState(nowMs = 0) {
	if (!Number.isFinite(nowMs) || nowMs < 0) throw new TypeError("door time must be finite and non-negative");
	return Object.freeze({
		phase: "closed",
		openness: 0,
		updatedAtMs: nowMs,
		thumpSequence: 0
	});
}
function advanceGunRangeTestBayDoorForObservers(state, nowMs, observerPositions) {
	if (!Number.isFinite(nowMs) || nowMs < state.updatedAtMs || !isGunRangeTestBayDoorState(state) || !Array.isArray(observerPositions) || !observerPositions.every((position) => [
		position.x,
		position.y,
		position.z
	].every(Number.isFinite))) throw new TypeError("door step requires monotonic finite time and finite observer positions");
	const threshold = state.openness > 0 ? GUN_RANGE_TEST_BAY_DOOR_RELEASE_RADIUS_M : GUN_RANGE_TEST_BAY_DOOR_TRIGGER_RADIUS_M;
	const wantsOpen = observerPositions.some((position) => distanceToDoorTrigger(position) <= threshold);
	const delta = (nowMs - state.updatedAtMs) / 720;
	const openness = Math.min(1, Math.max(0, state.openness + (wantsOpen ? delta : -delta)));
	const phase = openness <= 0 ? wantsOpen ? "opening" : "closed" : openness >= 1 ? "open" : wantsOpen ? "opening" : "closing";
	const openingStarted = wantsOpen && state.phase !== "opening" && state.phase !== "open";
	const collisionChanged = Math.abs(openness - state.openness) > Number.EPSILON;
	const next = Object.freeze({
		phase,
		openness,
		updatedAtMs: nowMs,
		thumpSequence: state.thumpSequence + (openingStarted ? 1 : 0)
	});
	return Object.freeze({
		state: next,
		audioIntent: openingStarted ? GUN_RANGE_TEST_BAY_CONTRACT.door.thumpIntent : null,
		collisionChanged
	});
}
/** Advance a host-authored transition on a replica without admitting any
* local observer. The phase is the authority decision; only its bounded leaf
* travel is projected through the host-to-guest monotonic clock mapping. */
function projectGunRangeTestBayDoorState(state, nowMs) {
	if (!isGunRangeTestBayDoorState(state) || !Number.isFinite(nowMs) || nowMs < state.updatedAtMs) throw new TypeError("door projection requires valid state and monotonic mapped time");
	const delta = (nowMs - state.updatedAtMs) / 720;
	const openness = state.phase === "opening" ? Math.min(1, state.openness + delta) : state.phase === "closing" ? Math.max(0, state.openness - delta) : state.openness;
	return Object.freeze({
		phase: openness <= 0 ? "closed" : openness >= 1 ? "open" : state.phase,
		openness,
		updatedAtMs: nowMs,
		thumpSequence: state.thumpSequence
	});
}
function gunRangeTestBayDoorLeafBounds(state) {
	const closed = GUN_RANGE_TEST_BAY_CONTRACT.door.closedBounds;
	const offsetY = GUN_RANGE_TEST_BAY_CONTRACT.door.travelM * state.openness;
	return Object.freeze({
		minX: closed.minX,
		maxX: closed.maxX,
		minY: closed.minY + offsetY,
		maxY: closed.maxY + offsetY,
		minZ: closed.minZ,
		maxZ: closed.maxZ
	});
}
function gunRangeTestBayDoorDynamicColliders(state) {
	if (state.openness >= 1) return Object.freeze([]);
	const bounds = gunRangeTestBayDoorLeafBounds(state);
	return Object.freeze([Object.freeze({
		id: GUN_RANGE_TEST_BAY_DOOR_ID,
		bounds
	})]);
}
/** Hitscan authority for the same moving secure leaf used by Rapier/projectiles. */
function gunRangeTestBayDoorDynamicBallisticSurfaces(state) {
	if (state.openness >= 1) return Object.freeze([]);
	return Object.freeze([createBallisticSurface(GUN_RANGE_TEST_BAY_DOOR_BALLISTIC_ID, "gun-range-test-bay-secure-door-leaf", gunRangeTestBayDoorLeafBounds(state), {
		impactSurface: "metal",
		material: "structural-metal"
	})]);
}
function nearestTrainingStation(stations, position, maximumDistance) {
	if (![
		position.x,
		position.y,
		position.z,
		maximumDistance
	].every(Number.isFinite) || maximumDistance < 0) return null;
	let nearest = null;
	for (const station of stations) {
		const distanceM = Math.hypot(position.x - station.position.x, position.y - station.position.y, position.z - station.position.z);
		if (distanceM > maximumDistance || nearest && distanceM >= nearest.distanceM) continue;
		nearest = Object.freeze({
			station,
			distanceM
		});
	}
	return nearest;
}
function nearestGunRangeTestBayWeaponStation(position, maximumDistance = GUN_RANGE_TEST_BAY_STATION_INTERACTION_RANGE_M) {
	return nearestTrainingStation(GUN_RANGE_TEST_BAY_CONTRACT.weaponStations, position, maximumDistance);
}
function nearestGunRangeTestBaySupportStation(position, maximumDistance = GUN_RANGE_TEST_BAY_STATION_INTERACTION_RANGE_M) {
	return nearestTrainingStation(GUN_RANGE_TEST_BAY_CONTRACT.supportStations, position, maximumDistance);
}
/** Deterministic unarmed walking-target pose. The triangle wave has no teleport at either turn. */
function gunRangeTestBayDummyPose(definition, nowMs) {
	if (!Number.isFinite(nowMs)) throw new TypeError("dummy time must be finite");
	const dx = definition.end.x - definition.start.x;
	const dy = definition.end.y - definition.start.y;
	const dz = definition.end.z - definition.start.z;
	const oneWaySeconds = Math.hypot(dx, dy, dz) / definition.speedMps;
	const cycle = ((nowMs / 1e3 / (oneWaySeconds * 2) + definition.phase) % 1 + 1) % 1;
	const forward = cycle < .5;
	const alpha = forward ? cycle * 2 : (1 - cycle) * 2;
	const travelX = forward ? dx : -dx;
	const travelZ = forward ? dz : -dz;
	return Object.freeze({
		position: Object.freeze({
			x: definition.start.x + dx * alpha,
			y: definition.start.y + dy * alpha,
			z: definition.start.z + dz * alpha
		}),
		yawRadians: Math.atan2(-travelX, -travelZ)
	});
}
function resolveGunRangeDummyDamage(healthBefore, damage, nowMs, respawnDelayMs) {
	if (!Number.isFinite(nowMs) || nowMs < 0) throw new TypeError("dummy damage time must be finite and non-negative");
	const admitted = Math.max(0, Number.isFinite(damage) ? damage : 0);
	const before = Math.max(0, Number.isFinite(healthBefore) ? healthBefore : 0);
	const healthAfter = Math.max(0, before - admitted);
	const died = before > 0 && healthAfter <= 0;
	return Object.freeze({
		appliedDamage: before - healthAfter,
		healthAfter,
		died,
		respawnAtMs: died ? nowMs + Math.max(0, respawnDelayMs) : null
	});
}
/** Full rendered root transform, including the bounded presentation-only foot bob. */
function gunRangeTestBayRenderedDummyPose(definition, index, nowMs) {
	if (!Number.isSafeInteger(index) || index < 0) throw new TypeError("dummy index must be a non-negative integer");
	const pose = gunRangeTestBayDummyPose(definition, nowMs);
	return Object.freeze({
		position: Object.freeze({
			x: pose.position.x,
			y: pose.position.y + Math.abs(Math.sin(nowMs * .004 + index)) * .025,
			z: pose.position.z
		}),
		yawRadians: pose.yawRadians
	});
}
//#endregion
//#region src/rustworks-flag.ts
var RUSTWORKS_WELSH_FLAG = Object.freeze({
	width: 6,
	height: 3.6,
	poleHeight: 20.8,
	clothCenterY: 18.65,
	waveAmplitude: .34,
	segmentsX: 20,
	segmentsY: 10
});
function welshFlagTexture() {
	if (typeof document === "undefined") {
		const texture = new DataTexture(new Uint8Array([
			255,
			255,
			255,
			255,
			206,
			17,
			38,
			255,
			34,
			139,
			34,
			255,
			206,
			17,
			38,
			255
		]), 2, 2, RGBAFormat);
		texture.needsUpdate = true;
		return texture;
	}
	const canvas = document.createElement("canvas");
	canvas.width = 1024;
	canvas.height = 614;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Welsh flag canvas is unavailable");
	context.fillStyle = "#ffffff";
	context.fillRect(0, 0, canvas.width, canvas.height / 2);
	context.fillStyle = "#168b3a";
	context.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);
	context.fillStyle = "#ce1126";
	context.strokeStyle = "#8d0718";
	context.lineWidth = 11;
	context.lineJoin = "round";
	context.lineCap = "round";
	context.beginPath();
	context.moveTo(385, 350);
	context.bezierCurveTo(330, 389, 258, 407, 204, 373);
	context.bezierCurveTo(150, 338, 147, 278, 194, 245);
	context.bezierCurveTo(238, 214, 300, 230, 319, 270);
	context.bezierCurveTo(284, 250, 242, 261, 239, 291);
	context.bezierCurveTo(236, 322, 286, 340, 343, 311);
	context.bezierCurveTo(420, 270, 519, 253, 618, 272);
	context.bezierCurveTo(667, 281, 701, 264, 729, 229);
	context.lineTo(766, 190);
	context.lineTo(759, 236);
	context.lineTo(805, 208);
	context.lineTo(786, 250);
	context.lineTo(852, 260);
	context.lineTo(892, 290);
	context.lineTo(850, 307);
	context.lineTo(891, 329);
	context.lineTo(831, 333);
	context.lineTo(802, 365);
	context.lineTo(744, 344);
	context.bezierCurveTo(714, 391, 651, 409, 584, 388);
	context.lineTo(527, 362);
	context.lineTo(458, 370);
	context.bezierCurveTo(427, 374, 404, 367, 385, 350);
	context.closePath();
	context.fill();
	context.stroke();
	context.beginPath();
	context.moveTo(432, 286);
	context.lineTo(353, 144);
	context.lineTo(476, 213);
	context.lineTo(522, 123);
	context.lineTo(560, 239);
	context.lineTo(620, 180);
	context.lineTo(599, 285);
	context.closePath();
	context.fill();
	context.stroke();
	context.beginPath();
	context.moveTo(470, 287);
	context.lineTo(448, 188);
	context.lineTo(539, 252);
	context.lineTo(583, 194);
	context.lineTo(574, 300);
	context.closePath();
	context.fill();
	context.stroke();
	for (const [hipX, hipY, kneeX, footX, raised] of [
		[
			420,
			352,
			389,
			365,
			false
		],
		[
			494,
			359,
			521,
			548,
			false
		],
		[
			611,
			374,
			588,
			565,
			false
		],
		[
			687,
			353,
			708,
			748,
			true
		]
	]) {
		context.beginPath();
		context.moveTo(hipX, hipY);
		context.lineTo(kneeX, raised ? hipY - 55 : 415);
		context.lineTo(footX, raised ? 375 : 452);
		context.lineWidth = 24;
		context.stroke();
		context.lineWidth = 9;
		const clawY = raised ? 375 : 452;
		context.beginPath();
		context.moveTo(footX, clawY);
		context.lineTo(footX - 24, clawY + 20);
		context.moveTo(footX, clawY);
		context.lineTo(footX + 4, clawY + 25);
		context.moveTo(footX, clawY);
		context.lineTo(footX + 28, clawY + 15);
		context.stroke();
	}
	context.lineWidth = 9;
	context.beginPath();
	context.moveTo(876, 296);
	context.bezierCurveTo(919, 284, 944, 276, 970, 264);
	context.moveTo(944, 276);
	context.lineTo(975, 292);
	context.stroke();
	context.fillStyle = "#ffffff";
	context.beginPath();
	context.arc(833, 280, 8, 0, Math.PI * 2);
	context.fill();
	context.fillStyle = "#111111";
	context.beginPath();
	context.arc(836, 280, 3.5, 0, Math.PI * 2);
	context.fill();
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	texture.anisotropy = 4;
	texture.needsUpdate = true;
	return texture;
}
function createRustworksWelshFlag() {
	const root = new Group();
	root.name = "rustworks-quality-welsh-flag";
	root.userData.presentationOnly = true;
	root.userData.blocksShots = false;
	root.userData.rustworksFlagAudit = {
		nation: "Wales",
		animated: true,
		width: RUSTWORKS_WELSH_FLAG.width,
		height: RUSTWORKS_WELSH_FLAG.height,
		dragon: "four-legged-passant",
		legs: 4,
		wings: 2,
		tongue: "forked",
		poleHeight: RUSTWORKS_WELSH_FLAG.poleHeight
	};
	const poleMaterial = new MeshStandardMaterial({
		color: 13095123,
		metalness: .82,
		roughness: .34
	});
	const pole = new Mesh(new CylinderGeometry(.09, .12, 7.2, 12), poleMaterial);
	pole.name = "rustworks-quality-welsh-flag-pole";
	pole.position.set(0, 17.2, 0);
	pole.castShadow = true;
	pole.receiveShadow = true;
	pole.raycast = () => void 0;
	root.add(pole);
	const geometry = new PlaneGeometry(RUSTWORKS_WELSH_FLAG.width, RUSTWORKS_WELSH_FLAG.height, RUSTWORKS_WELSH_FLAG.segmentsX, RUSTWORKS_WELSH_FLAG.segmentsY);
	geometry.translate(RUSTWORKS_WELSH_FLAG.width / 2, 0, 0);
	const basePositions = geometry.getAttribute("position").array.slice();
	const cloth = new Mesh(geometry, new MeshStandardMaterial({
		map: welshFlagTexture(),
		side: 2,
		roughness: .72,
		metalness: 0
	}));
	cloth.name = "rustworks-quality-welsh-flag-cloth";
	cloth.position.set(.08, RUSTWORKS_WELSH_FLAG.clothCenterY, 0);
	cloth.rotation.y = -Math.PI / 4;
	cloth.castShadow = true;
	cloth.receiveShadow = true;
	cloth.frustumCulled = false;
	cloth.raycast = () => void 0;
	cloth.userData.rustworksFlagCloth = true;
	cloth.userData.animated = true;
	cloth.onBeforeRender = () => {
		const time = (typeof performance === "undefined" ? Date.now() : performance.now()) * .001;
		const position = geometry.getAttribute("position");
		const values = position.array;
		for (let index = 0; index < position.count; index += 1) {
			const offset = index * 3;
			const progress = MathUtils.clamp(basePositions[offset] / RUSTWORKS_WELSH_FLAG.width, 0, 1);
			values[offset + 2] = Math.sin(time * 2.8 + progress * Math.PI * 3.2) * RUSTWORKS_WELSH_FLAG.waveAmplitude * progress + Math.sin(time * 1.7 + progress * Math.PI * 1.3) * .08 * progress;
		}
		position.needsUpdate = true;
	};
	root.add(cloth);
	return root;
}
//#endregion
//#region src/additional-maps.ts
var GUN_RANGE_FIRING_LINE_Z = 1.2;
var GUN_RANGE_FIRING_LINE_BARRIER = Object.freeze({
	minX: -20,
	maxX: 20,
	minZ: GUN_RANGE_FIRING_LINE_Z - .25,
	maxZ: 1.45,
	minY: -2,
	maxY: 8
});
var standard = (color, roughness = .86, metalness = .08) => new MeshStandardMaterial({
	color,
	roughness,
	metalness
});
function rustSurfaceTexture(kind, repeat) {
	const size = 64;
	const data = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
		const hash = (x * 73 + y * 151 + x * y * 17 ^ x << 3 ^ y << 5) & 255;
		const seam = x % 16 === 0 || y % 16 === 0;
		const streak = kind === "oxidised" && (x * 3 + y) % 29 < 3;
		const base = kind === "deck" ? 174 : kind === "oxidised" ? 188 : 202;
		const noise = hash % 31 - 15;
		const offset = (y * size + x) * 4;
		data[offset] = MathUtils.clamp(base + noise + (streak ? 36 : 0) - (seam ? 42 : 0), 0, 255);
		data[offset + 1] = MathUtils.clamp(base + noise - (streak ? 26 : 0) - (seam ? 34 : 0), 0, 255);
		data[offset + 2] = MathUtils.clamp(base + noise - (streak ? 44 : 0) - (seam ? 28 : 0), 0, 255);
		data[offset + 3] = 255;
	}
	const texture = new DataTexture(data, size, size, RGBAFormat);
	texture.name = `rustrig-${kind}-surface-v1`;
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = RepeatWrapping;
	texture.wrapT = RepeatWrapping;
	texture.repeat.set(...repeat);
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	return texture;
}
function applyRustSurface(material, kind, repeat) {
	material.map = rustSurfaceTexture(kind, repeat);
	material.userData.assetOwner = "rustworks-1v1";
	material.userData.assetKind = "deterministic-industrial-surface";
	material.userData.surfaceKind = kind;
	return material;
}
function box(builder, name, position, size, material, options = {}) {
	const mesh = new Mesh(new BoxGeometry(...size), material);
	mesh.name = name;
	mesh.position.set(...position);
	if (options.rotation) mesh.rotation.set(...options.rotation);
	mesh.castShadow = options.cast !== false;
	mesh.receiveShadow = true;
	mesh.userData.impactSurface = classifyImpactSurface({
		name,
		metalness: material instanceof MeshStandardMaterial ? material.metalness : void 0
	});
	mesh.userData.rustworksDetail = options.detail ?? "core";
	builder.root.add(mesh);
	const solid = options.solid !== false;
	const shots = options.shots ?? solid;
	mesh.userData.presentationBatchCandidate = !solid && !shots;
	const bounds = {
		minX: position[0] - size[0] / 2,
		maxX: position[0] + size[0] / 2,
		minZ: position[2] - size[2] / 2,
		maxZ: position[2] + size[2] / 2,
		minY: position[1] - size[1] / 2,
		maxY: position[1] + size[1] / 2,
		rotation: options.rotation
	};
	if (shots) {
		builder.raycastMeshes.push(mesh);
		const surface = createBallisticSurface(`${builder.root.name}:${builder.ballisticSurfaceSequence}:${name}`, name, bounds, {
			impactSurface: mesh.userData.impactSurface,
			material: options.ballisticMaterial
		}, options.breakableWindowId);
		builder.ballisticSurfaceSequence += 1;
		builder.shotSurfaces.push(surface);
		mesh.userData.ballisticSurfaceId = surface.id;
		mesh.userData.ballisticMaterial = surface.material;
	}
	if (solid) {
		builder.colliders.push(bounds);
		builder.physicsColliders.push(bounds);
	}
	return mesh;
}
/** Presentation-only beam between two authored points. */
function presentationBeam(builder, name, start, end, width, material, detail = "performance") {
	const a = new Vector3(...start);
	const b = new Vector3(...end);
	const delta = b.clone().sub(a);
	const mesh = new Mesh(new BoxGeometry(width, width, delta.length()), material);
	mesh.name = name;
	mesh.position.copy(a).add(b).multiplyScalar(.5);
	mesh.quaternion.copy(delta.clone().normalize().lengthSq() > 0 ? new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), delta.clone().normalize()) : new Quaternion());
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.userData.impactSurface = "metal";
	mesh.userData.rustworksDetail = detail;
	mesh.userData.presentationBatchCandidate = true;
	builder.root.add(mesh);
	return mesh;
}
function volumesIntersect(first, second) {
	return first.minX <= second.maxX && first.maxX >= second.minX && first.minY <= second.maxY && first.maxY >= second.minY && first.minZ <= second.maxZ && first.maxZ >= second.minZ;
}
function skylineOpeningParityAudit(builder, probes) {
	builder.root.updateMatrixWorld(true);
	const sourceMeshes = [];
	builder.root.traverse((node) => {
		if (!(node instanceof Mesh) || node.userData.staticBatchRendered === true && typeof node.userData.sourceMeshes === "number") return;
		sourceMeshes.push(node);
	});
	const profileAudit = (profile) => probes.map((probe) => {
		const opaquePresentationBlockerNames = sourceMeshes.flatMap((mesh) => {
			if (mesh.userData.rustworksDetail === "quality" && profile !== "quality") return [];
			if (mesh.userData.skylineQualityPlaceholder === true && profile === "quality") return [];
			if (!(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some((material) => material.visible && (!material.transparent || material.opacity >= .8))) return [];
			const bounds = new Box3().setFromObject(mesh);
			const meshVolume = {
				minX: bounds.min.x,
				maxX: bounds.max.x,
				minY: bounds.min.y,
				maxY: bounds.max.y,
				minZ: bounds.min.z,
				maxZ: bounds.max.z
			};
			return volumesIntersect(probe.aperture, meshVolume) ? [mesh.name] : [];
		});
		const movementBlockers = builder.physicsColliders.filter((collider) => volumesIntersect(probe.aperture, {
			minX: collider.minX,
			maxX: collider.maxX,
			minY: collider.minY ?? -Infinity,
			maxY: collider.maxY ?? Infinity,
			minZ: collider.minZ,
			maxZ: collider.maxZ
		})).length;
		const shotBlockers = builder.shotSurfaces.filter((surface) => volumesIntersect(probe.aperture, {
			minX: surface.bounds.minX,
			maxX: surface.bounds.maxX,
			minY: surface.bounds.minY ?? -Infinity,
			maxY: surface.bounds.maxY ?? Infinity,
			minZ: surface.bounds.minZ,
			maxZ: surface.bounds.maxZ
		})).length;
		return {
			id: probe.id,
			movementBlockers,
			shotBlockers,
			opaquePresentationBlockers: opaquePresentationBlockerNames.length,
			opaquePresentationBlockerNames
		};
	});
	return {
		performance: profileAudit("performance"),
		quality: profileAudit("quality")
	};
}
/**
* Collapse decorative box meshes by material/shadow state while retaining the
* named hidden source nodes for semantic inspection. Collision and shot meshes
* are deliberately excluded: only non-solid, non-raycast presentation detail
* enters these static batches.
*/
function batchPresentationOnlyBoxes(root, batchPrefix = "presentation") {
	const groups = /* @__PURE__ */ new Map();
	const candidates = [];
	for (const node of root.children) {
		if (!(node instanceof Mesh) || node.userData.presentationBatchCandidate !== true || node.userData.rustworksDetail === "quality" || !(node.geometry instanceof BoxGeometry) || Array.isArray(node.material)) continue;
		candidates.push(node);
	}
	for (const mesh of candidates) {
		const material = mesh.material;
		const key = `${material.uuid}:${Number(mesh.castShadow)}:${Number(mesh.receiveShadow)}`;
		const existing = groups.get(key);
		if (existing) {
			existing.meshes.push(mesh);
			continue;
		}
		groups.set(key, {
			material,
			castShadow: mesh.castShadow,
			receiveShadow: mesh.receiveShadow,
			meshes: [mesh]
		});
	}
	let sourceMeshes = 0;
	let batches = 0;
	for (const group of groups.values()) {
		if (group.meshes.length < 2) continue;
		const transformed = group.meshes.map((mesh) => {
			mesh.updateMatrix();
			return mesh.geometry.clone().applyMatrix4(mesh.matrix);
		});
		const geometry = mergeGeometries(transformed, false);
		transformed.forEach((entry) => entry.dispose());
		if (!geometry) continue;
		const batch = new Mesh(geometry, group.material);
		batch.name = `${batchPrefix}-presentation-batch-${batches}`;
		batch.castShadow = group.castShadow;
		batch.receiveShadow = group.receiveShadow;
		batch.userData.presentationOnly = true;
		batch.userData.staticBatchRendered = true;
		batch.userData.sourceMeshes = group.meshes.length;
		root.add(batch);
		for (const mesh of group.meshes) {
			mesh.visible = false;
			mesh.userData.staticBatchRendered = true;
		}
		sourceMeshes += group.meshes.length;
		batches += 1;
	}
	return {
		sourceMeshes,
		batches,
		savedDrawCalls: Math.max(0, sourceMeshes - batches)
	};
}
function emptyTelemetry() {
	return {
		houses: 0,
		groundRooms: 0,
		upperRooms: 0,
		doors: 0,
		windows: 0,
		ramps: 0,
		wallMaterialVariants: 0,
		pbrMaterialFamilies: 0
	};
}
function spawnRecord(team0, team1) {
	return {
		0: team0.map(([x, z]) => new Vector3(x, 1.7, z)),
		1: team1.map(([x, z]) => new Vector3(x, 1.7, z))
	};
}
/** Shared Rustworks tower metrics used by map build, tests, and Blender parity notes. */
var RUSTWORKS_TOWER = Object.freeze({
	lowerDeckCenterY: 3.35,
	upperDeckCenterY: 8.15,
	deckThickness: .34,
	lowerDeckSize: 8.4,
	upperDeckSize: 6.8,
	/** Character controller climb limit is 50°; ship-ladder stays strictly under it. */
	shipLadderAngleDegrees: 38,
	lowerRampAngleDegrees: 18,
	maxClimbDegrees: 50,
	landingOverlap: .06,
	maxLandingOverlap: .08,
	maxTransitionLip: .1,
	undercroftPassageWidth: 3.1,
	undercroftClearHeight: 2.75,
	openContainerClearWidth: 2.32,
	openContainerClearHeight: 2.46
});
/**
* Authored fixture locations shared by the RustRig presentation and its
* budgeted shadowed-local work lights. Both heads remain visible/emissive and
* own bounded, opposed shadowed volumes so the playable deck is readable from
* both ends without reintroducing unoccluded point-light leakage.
*/
var RUSTWORKS_WORK_LIGHTS = Object.freeze([Object.freeze({
	id: "north",
	position: [
		0,
		8.35,
		-4.35
	],
	mount: [
		0,
		8.35,
		-3.35
	],
	target: [
		0,
		.8,
		13.5
	],
	color: 16765600,
	intensity: 46,
	distance: 34,
	angle: .82,
	shadowed: true
}), Object.freeze({
	id: "south",
	position: [
		0,
		8.35,
		4.35
	],
	mount: [
		0,
		8.35,
		3.35
	],
	target: [
		0,
		.8,
		-13.5
	],
	color: 16765600,
	intensity: 42,
	distance: 34,
	angle: .82,
	shadowed: true
})]);
/**
* One bounded shadowed practical per freight cluster. The eight visible
* red/orange/yellow strips remain cheap emissive navigation cues; these four
* ceiling-mounted volumes add real occluded colour and slow deterministic
* intensity motion in Quality/Custom without changing container collision.
*/
var RUSTWORKS_CONTAINER_LIGHTS = Object.freeze([
	Object.freeze({
		id: "north-west",
		position: [
			-8,
			2.32,
			-13
		],
		target: [
			-8,
			.28,
			-13
		],
		volume: {
			minimum: [
				-10.76,
				.04,
				-14.18
			],
			maximum: [
				-5.24,
				2.48,
				-11.82
			]
		},
		color: 16731438,
		intensity: 18,
		distance: 4.2,
		angle: .86,
		frequencyHz: .18,
		phaseRadians: .35
	}),
	Object.freeze({
		id: "north-east",
		position: [
			8,
			2.32,
			-13
		],
		target: [
			8,
			.28,
			-13
		],
		volume: {
			minimum: [
				5.24,
				.04,
				-14.18
			],
			maximum: [
				10.76,
				2.48,
				-11.82
			]
		},
		color: 16765530,
		intensity: 17,
		distance: 4.2,
		angle: .86,
		frequencyHz: .23,
		phaseRadians: 1.7
	}),
	Object.freeze({
		id: "south-west",
		position: [
			-18,
			2.32,
			8
		],
		target: [
			-18,
			.28,
			8
		],
		volume: {
			minimum: [
				-19.18,
				.04,
				5.24
			],
			maximum: [
				-16.82,
				2.48,
				10.76
			]
		},
		color: 16751165,
		intensity: 16,
		distance: 4.2,
		angle: .86,
		frequencyHz: .29,
		phaseRadians: 3.05
	}),
	Object.freeze({
		id: "south-east",
		position: [
			18,
			2.32,
			8
		],
		target: [
			18,
			.28,
			8
		],
		volume: {
			minimum: [
				16.82,
				.04,
				5.24
			],
			maximum: [
				19.18,
				2.48,
				10.76
			]
		},
		color: 16731438,
		intensity: 17,
		distance: 4.2,
		angle: .86,
		frequencyHz: .31,
		phaseRadians: 4.4
	})
]);
function rustworksDeckTopY(centerY, thickness = RUSTWORKS_TOWER.deckThickness) {
	return centerY + thickness / 2;
}
/**
* Original compact industrial tower arena. Performance keeps climb authority and
* sparse yard cover; Quality Graphics adds denser industrial decoration plus the
* Blender central-tower overlay — same split style as Atomic Acres.
*/
function buildRustworks1v1(scene) {
	const root = new Group();
	root.name = "Rustworks arena";
	scene.add(root);
	const builder = {
		root,
		colliders: [],
		physicsColliders: [],
		raycastMeshes: [],
		shotSurfaces: [],
		ballisticSurfaceSequence: 0
	};
	const packed = applyRustSurface(standard(7232072, .98, .02), "deck", [8, 8]);
	const rust = applyRustSurface(standard(8010020, .82, .42), "oxidised", [4, 4]);
	const rustDark = applyRustSurface(standard(3942692, .9, .35), "oxidised", [6, 6]);
	const steel = applyRustSurface(standard(5858666, .58, .62), "deck", [12, 12]);
	const steelBright = applyRustSurface(standard(7174784, .48, .72), "painted-steel", [5, 5]);
	const hazard = standard(14128941, .72, .34);
	const hazardDark = standard(9067032, .8, .28);
	const concrete = standard(7828845, .98, .03);
	const concreteDark = standard(6052436, .96, .04);
	const tarp = standard(3233381, .94, .02);
	const oxide = standard(4860962, .9, .3);
	const grate = standard(5134428, .62, .55);
	const workLightHousing = standard(2107435, .58, .72);
	const workLightLens = new MeshStandardMaterial({
		color: 16772559,
		roughness: .18,
		metalness: .06,
		emissive: 16757852,
		emissiveIntensity: 4.8
	});
	const ground = new Mesh(new PlaneGeometry(54, 58), steel);
	ground.name = "rustworks-rig-deck-top";
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = 0;
	ground.receiveShadow = true;
	ground.userData.impactSurface = "metal";
	root.add(ground);
	builder.raycastMeshes.push(ground);
	const groundSurface = createBallisticSurface(`${root.name}:${builder.ballisticSurfaceSequence}:deck`, ground.name, {
		minX: -27,
		maxX: 27,
		minY: -1.6,
		maxY: 0,
		minZ: -29,
		maxZ: 29
	}, {
		impactSurface: "metal",
		material: "structural-metal"
	});
	builder.ballisticSurfaceSequence += 1;
	builder.shotSurfaces.push(groundSurface);
	ground.userData.ballisticSurfaceId = groundSurface.id;
	ground.userData.ballisticMaterial = groundSurface.material;
	box(builder, "rustworks-rig-deck-slab", [
		0,
		-.85,
		0
	], [
		54.5,
		1.6,
		58.5
	], rustDark, {
		solid: false,
		cast: true,
		shots: false
	});
	const deckEdgeSpecs = [
		{
			id: "north",
			position: [
				0,
				-.08,
				-28.85
			],
			size: [
				54.5,
				.22,
				.8
			]
		},
		{
			id: "south",
			position: [
				0,
				-.08,
				28.85
			],
			size: [
				54.5,
				.22,
				.8
			]
		},
		{
			id: "west",
			position: [
				-26.85,
				-.08,
				0
			],
			size: [
				.8,
				.22,
				56.9
			]
		},
		{
			id: "east",
			position: [
				26.85,
				-.08,
				0
			],
			size: [
				.8,
				.22,
				56.9
			]
		}
	];
	for (const edge of deckEdgeSpecs) box(builder, `rustworks-rig-deck-edge-${edge.id}`, edge.position, edge.size, hazardDark, {
		solid: false,
		cast: false,
		shots: false
	});
	for (const x of [
		-22,
		-8,
		8,
		22
	]) for (const z of [
		-24,
		-8,
		8,
		24
	]) {
		box(builder, "rustworks-rig-leg", [
			x,
			-8.5,
			z
		], [
			1.35,
			15.5,
			1.35
		], steelBright, {
			solid: false,
			detail: "performance"
		});
		box(builder, "rustworks-rig-leg-brace", [
			x,
			-4.2,
			z
		], [
			2.4,
			.35,
			.35
		], oxide, {
			solid: false,
			detail: "quality"
		});
	}
	for (const z of [
		-18,
		0,
		18
	]) box(builder, "rustworks-rig-girder", [
		0,
		-1.55,
		z
	], [
		50,
		.55,
		.7
	], steel, {
		solid: false,
		detail: "performance"
	});
	for (const x of [
		-18,
		0,
		18
	]) box(builder, "rustworks-rig-girder", [
		x,
		-1.55,
		0
	], [
		.7,
		.55,
		54
	], steel, {
		solid: false,
		detail: "performance"
	});
	const hardstandSpec = {
		id: "hardstand",
		position: [
			0,
			.03,
			0
		],
		size: [
			16,
			.06,
			16
		]
	};
	box(builder, "rustworks-tower-hardstand", hardstandSpec.position, hardstandSpec.size, packed, {
		solid: false,
		cast: false
	});
	const serviceLaneSpecs = [
		{
			id: "north",
			position: [
				0,
				.04,
				-16
			],
			size: [
				5.5,
				.05,
				16
			]
		},
		{
			id: "south",
			position: [
				0,
				.04,
				16
			],
			size: [
				5.5,
				.05,
				16
			]
		},
		{
			id: "west",
			position: [
				-16,
				.04,
				0
			],
			size: [
				16,
				.05,
				5.5
			]
		},
		{
			id: "east",
			position: [
				16,
				.04,
				0
			],
			size: [
				16,
				.05,
				5.5
			]
		}
	];
	for (const lane of serviceLaneSpecs) box(builder, `rustworks-service-lane-${lane.id}`, lane.position, lane.size, concreteDark, {
		solid: false,
		cast: false
	});
	const chevronSpecs = [-20, 20].map((z) => ({
		id: `chevron-${z < 0 ? "north" : "south"}`,
		position: [
			0,
			.075,
			z
		],
		size: [
			2.8,
			.02,
			.45
		]
	}));
	for (const chevron of chevronSpecs) box(builder, "rustworks-ground-chevron", chevron.position, chevron.size, hazard, {
		solid: false,
		cast: false,
		shots: false
	});
	for (const [x, z, sx, sz] of [
		[
			0,
			-29.2,
			52,
			.18
		],
		[
			0,
			29.2,
			52,
			.18
		],
		[
			-26.8,
			0,
			.18,
			56
		],
		[
			26.8,
			0,
			.18,
			56
		]
	]) {
		box(builder, "rustworks-perimeter-rail", [
			x,
			1.15,
			z
		], [
			sx,
			.12,
			sz
		], hazard, {
			solid: false,
			detail: "performance"
		});
		box(builder, "rustworks-perimeter-rail", [
			x,
			.55,
			z
		], [
			sx,
			.1,
			sz
		], steel, {
			solid: false,
			detail: "performance"
		});
	}
	for (const [x, z] of [
		[-20, -29],
		[-8, -29],
		[8, -29],
		[20, -29],
		[-20, 29],
		[-8, 29],
		[8, 29],
		[20, 29],
		[-26.6, -16],
		[-26.6, 0],
		[-26.6, 16],
		[26.6, -16],
		[26.6, 0],
		[26.6, 16]
	]) box(builder, "rustworks-perimeter-post", [
		x,
		.7,
		z
	], [
		.28,
		1.4,
		.28
	], steel, {
		solid: false,
		detail: "performance"
	});
	const { lowerDeckCenterY, upperDeckCenterY, deckThickness, lowerDeckSize, upperDeckSize, shipLadderAngleDegrees, lowerRampAngleDegrees, landingOverlap } = RUSTWORKS_TOWER;
	const lowerTop = rustworksDeckTopY(lowerDeckCenterY, deckThickness);
	const upperTop = rustworksDeckTopY(upperDeckCenterY, deckThickness);
	const lowerHalf = lowerDeckSize / 2;
	for (const x of [-3.2, 3.2]) for (const z of [-3.2, 3.2]) {
		box(builder, "rustworks-tower-leg", [
			x,
			5.4,
			z
		], [
			.58,
			10.8,
			.58
		], steelBright);
		box(builder, "rustworks-tower-leg-base", [
			x,
			.28,
			z
		], [
			.95,
			.56,
			.95
		], concrete);
	}
	const undercroftModuleSize = 2.2;
	const undercroftModuleOffset = (RUSTWORKS_TOWER.undercroftPassageWidth + undercroftModuleSize) / 2;
	for (const x of [-undercroftModuleOffset, undercroftModuleOffset]) for (const z of [-undercroftModuleOffset, undercroftModuleOffset]) {
		const module = box(builder, "rustworks-undercroft-module", [
			x,
			RUSTWORKS_TOWER.undercroftClearHeight / 2,
			z
		], [
			undercroftModuleSize,
			RUSTWORKS_TOWER.undercroftClearHeight,
			undercroftModuleSize
		], rustDark, { ballisticMaterial: "structural-metal" });
		module.userData.rustworksRouteRole = "undercroft-corner-cover";
		box(builder, "rustworks-undercroft-module-cap", [
			x,
			RUSTWORKS_TOWER.undercroftClearHeight - .08,
			z
		], [
			2.45,
			.16,
			2.45
		], hazardDark, {
			solid: false,
			shots: false,
			detail: "performance"
		});
	}
	box(builder, "rustworks-undercroft-floor-east-west", [
		0,
		.045,
		0
	], [
		8.1,
		.05,
		2.7
	], grate, {
		solid: false,
		cast: false,
		shots: false
	});
	box(builder, "rustworks-undercroft-floor-north-south", [
		0,
		.05,
		0
	], [
		2.7,
		.05,
		8.1
	], grate, {
		solid: false,
		cast: false,
		shots: false
	});
	for (const [x, z, sx, sz] of [
		[
			0,
			-4,
			3.25,
			.12
		],
		[
			0,
			4,
			3.25,
			.12
		],
		[
			-4,
			0,
			.12,
			3.25
		],
		[
			4,
			0,
			.12,
			3.25
		]
	]) box(builder, "rustworks-undercroft-portal-header", [
		x,
		2.72,
		z
	], [
		sx,
		.18,
		sz
	], hazard, {
		solid: false,
		shots: false,
		detail: "performance"
	});
	for (const z of [-3.35, 3.35]) for (const [y0, y1] of [[3.7, 7.85], [8.45, 11.1]]) {
		const midY = (y0 + y1) / 2;
		const rise = y1 - y0;
		const run = 6.4;
		const length = Math.hypot(run, rise);
		const angle = Math.atan2(rise, run);
		box(builder, "rustworks-structural-brace", [
			0,
			midY,
			z
		], [
			length,
			.14,
			.14
		], rust, {
			solid: false,
			rotation: [
				0,
				0,
				angle
			],
			detail: "performance"
		});
		box(builder, "rustworks-structural-brace", [
			0,
			midY,
			z
		], [
			length,
			.14,
			.14
		], oxide, {
			solid: false,
			rotation: [
				0,
				0,
				-angle
			],
			detail: "performance"
		});
	}
	for (const x of [-3.35, 3.35]) for (const [y0, y1] of [[3.7, 7.85], [8.45, 11.1]]) {
		const midY = (y0 + y1) / 2;
		const rise = y1 - y0;
		const run = 6.4;
		const length = Math.hypot(run, rise);
		const angle = Math.atan2(rise, run);
		box(builder, "rustworks-structural-brace", [
			x,
			midY,
			0
		], [
			.14,
			.14,
			length
		], steel, {
			solid: false,
			rotation: [
				angle,
				0,
				0
			],
			detail: "performance"
		});
		box(builder, "rustworks-structural-brace", [
			x,
			midY,
			0
		], [
			.14,
			.14,
			length
		], steel, {
			solid: false,
			rotation: [
				-angle,
				0,
				0
			],
			detail: "performance"
		});
	}
	box(builder, "rustworks-lower-deck", [
		0,
		lowerDeckCenterY,
		0
	], [
		lowerDeckSize,
		deckThickness,
		lowerDeckSize
	], grate);
	box(builder, "rustworks-upper-deck", [
		0,
		upperDeckCenterY,
		0
	], [
		upperDeckSize,
		deckThickness,
		upperDeckSize
	], rust);
	box(builder, "rustworks-lower-deck-grating-trim", [
		0,
		lowerTop + .02,
		0
	], [
		lowerDeckSize - .8,
		.04,
		lowerDeckSize - .8
	], steel, {
		solid: false,
		cast: false,
		detail: "performance"
	});
	box(builder, "rustworks-upper-walk-ring", [
		0,
		upperTop + .03,
		0
	], [
		upperDeckSize - 1.8,
		.03,
		upperDeckSize - 1.8
	], hazardDark, {
		solid: false,
		cast: false,
		shots: false,
		detail: "performance"
	});
	for (const fixture of RUSTWORKS_WORK_LIGHTS) {
		const head = new Vector3(...fixture.position);
		const direction = new Vector3(...fixture.target).clone().sub(head).normalize();
		const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), direction);
		presentationBeam(builder, `rustworks-work-light-mount-${fixture.id}`, [...fixture.mount], [...fixture.position], .16, steelBright);
		const housingPosition = head.clone().addScaledVector(direction, -.12);
		box(builder, `rustworks-work-light-housing-${fixture.id}`, housingPosition.toArray(), [
			.92,
			.52,
			.34
		], workLightHousing, {
			solid: false,
			shots: false,
			detail: "performance"
		}).quaternion.copy(orientation);
		const lens = box(builder, `rustworks-work-light-lens-${fixture.id}`, [...fixture.position], [
			.72,
			.34,
			.055
		], workLightLens, {
			solid: false,
			shots: false,
			cast: false,
			detail: "performance"
		});
		lens.quaternion.copy(orientation);
		lens.userData.occlusionPolicy = "emissive-only";
		lens.userData.practicalPolicyId = "tower-work-light-lenses";
		lens.userData.fixtureId = fixture.id;
	}
	const managedSurfaceSpecs = [
		hardstandSpec,
		...serviceLaneSpecs,
		...chevronSpecs,
		...deckEdgeSpecs
	];
	const coplanarOverlapPairs = [];
	for (let first = 0; first < managedSurfaceSpecs.length; first += 1) {
		const a = managedSurfaceSpecs[first];
		const aTop = a.position[1] + a.size[1] / 2;
		for (let second = first + 1; second < managedSurfaceSpecs.length; second += 1) {
			const b = managedSurfaceSpecs[second];
			const bTop = b.position[1] + b.size[1] / 2;
			const overlapX = Math.min(a.position[0] + a.size[0] / 2, b.position[0] + b.size[0] / 2) - Math.max(a.position[0] - a.size[0] / 2, b.position[0] - b.size[0] / 2);
			const overlapZ = Math.min(a.position[2] + a.size[2] / 2, b.position[2] + b.size[2] / 2) - Math.max(a.position[2] - a.size[2] / 2, b.position[2] - b.size[2] / 2);
			if (Math.abs(aTop - bTop) < 1e-4 && overlapX > 1e-4 && overlapZ > 1e-4) coplanarOverlapPairs.push(`${a.id}:${b.id}`);
		}
	}
	root.userData.rustworksDeckSurfaceAudit = {
		perimeterEdgeSegments: deckEdgeSpecs.length,
		serviceLaneSegments: serviceLaneSpecs.length,
		fullDeckLipOverlay: false,
		coplanarOverlapPairs
	};
	root.userData.rustworksWorkLightAudit = {
		fixtures: RUSTWORKS_WORK_LIGHTS.map((fixture) => ({
			id: fixture.id,
			position: [...fixture.position],
			target: [...fixture.target],
			emissiveOnlyLens: true,
			shadowedLocalVolume: fixture.shadowed
		})),
		containerFixtures: RUSTWORKS_CONTAINER_LIGHTS.map((fixture) => ({
			id: fixture.id,
			position: [...fixture.position],
			target: [...fixture.target],
			color: fixture.color,
			shadowedLocalVolume: true
		})),
		shadowedLocalVolumes: RUSTWORKS_WORK_LIGHTS.filter((fixture) => fixture.shadowed).length + RUSTWORKS_CONTAINER_LIGHTS.length,
		maximumShadowCastersIncludingMoon: 7
	};
	const lowerRampAngle = lowerRampAngleDegrees * Math.PI / 180;
	const lowerRampLength = (lowerTop - .12) / Math.sin(lowerRampAngle);
	const lowerRampThickness = .28;
	const lowerRampWidth = 4.8;
	const lowerLandingDepth = 1.55;
	const lowerLandingCenterZ = -lowerHalf - lowerLandingDepth / 2 + landingOverlap;
	const lowerRampCenterZ = lowerLandingCenterZ - lowerLandingDepth / 2 + landingOverlap - Math.cos(lowerRampAngle) * (lowerRampLength / 2);
	const lowerRampPosY = lowerTop - Math.sin(lowerRampAngle) * (lowerRampLength / 2) - Math.cos(lowerRampAngle) * (lowerRampThickness / 2);
	box(builder, "rustworks-lower-ramp-foot-pad", [
		0,
		.08,
		lowerRampCenterZ - Math.cos(lowerRampAngle) * (lowerRampLength / 2) - .55
	], [
		5.6,
		.16,
		1.6
	], concrete);
	box(builder, "rustworks-lower-ramp", [
		0,
		lowerRampPosY,
		lowerRampCenterZ
	], [
		lowerRampWidth,
		lowerRampThickness,
		lowerRampLength
	], steelBright, { rotation: [
		-lowerRampAngle,
		0,
		0
	] });
	box(builder, "rustworks-lower-ramp-landing", [
		0,
		lowerDeckCenterY,
		lowerLandingCenterZ
	], [
		5.25,
		deckThickness,
		lowerLandingDepth
	], grate);
	const shipAngle = shipLadderAngleDegrees * Math.PI / 180;
	const shipRise = upperTop - lowerTop;
	const shipRun = shipRise / Math.tan(shipAngle);
	const shipLength = shipRise / Math.sin(shipAngle);
	const shipThickness = .22;
	const shipWidth = 2.6;
	const shipX = lowerHalf - .1;
	const lowerShipLandingDepth = 1.25;
	const upperOutboardLandingDepth = 1.35;
	const shipRotation = [
		shipAngle,
		0,
		0
	];
	const shipLowerLandingCenterZ = lowerHalf - .2 + lowerShipLandingDepth / 2 - landingOverlap;
	const shipLowSurfaceZ = shipLowerLandingCenterZ - lowerShipLandingDepth / 2 + landingOverlap;
	const shipHighSurfaceZ = shipLowSurfaceZ - shipRun;
	const shipCenterZ = (shipLowSurfaceZ + shipHighSurfaceZ) / 2;
	const shipPosY = (lowerTop + upperTop) / 2 - Math.cos(shipAngle) * (shipThickness / 2);
	const upperHalf = upperDeckSize / 2;
	const upperOutboardCenterZ = shipHighSurfaceZ - upperOutboardLandingDepth / 2 + landingOverlap;
	const upperBridgeCenterX = (shipX + upperHalf - .35) / 2;
	const upperBridgeWidth = Math.abs(shipX - (upperHalf - .35)) + .55;
	box(builder, "rustworks-ship-ladder-lower-landing", [
		shipX,
		lowerDeckCenterY,
		shipLowerLandingCenterZ
	], [
		3.1500000000000004,
		deckThickness,
		lowerShipLandingDepth
	], grate);
	const shipLadderAuthority = box(builder, "rustworks-ship-ladder", [
		shipX,
		shipPosY,
		shipCenterZ
	], [
		shipWidth,
		shipThickness,
		shipLength
	], steelBright, { rotation: shipRotation });
	const invisibleAuthorityMaterial = steelBright.clone();
	invisibleAuthorityMaterial.name = "rustworks-ship-ladder-collision-authority";
	invisibleAuthorityMaterial.visible = false;
	shipLadderAuthority.material = invisibleAuthorityMaterial;
	shipLadderAuthority.userData.collisionOnly = true;
	box(builder, "rustworks-ship-ladder-upper-landing", [
		shipX,
		upperDeckCenterY,
		upperOutboardCenterZ
	], [
		3.0500000000000003,
		deckThickness,
		upperOutboardLandingDepth
	], rust);
	box(builder, "rustworks-upper-access", [
		upperBridgeCenterX,
		upperDeckCenterY,
		upperOutboardCenterZ
	], [
		upperBridgeWidth,
		deckThickness,
		upperOutboardLandingDepth
	], grate);
	for (const side of [-1, 1]) box(builder, `rustworks-ship-ladder-rail-${side < 0 ? "west" : "east"}`, [
		shipX + side * 1.3800000000000001,
		shipPosY + .62,
		shipCenterZ
	], [
		.09,
		.09,
		shipLength
	], hazard, {
		solid: false,
		rotation: shipRotation,
		detail: "performance"
	});
	const rungCount = 9;
	for (let index = 0; index < rungCount; index += 1) {
		const t = (index + .5) / rungCount;
		const z = shipLowSurfaceZ - shipRun * t;
		const y = lowerTop + shipRise * t + .04;
		box(builder, `rustworks-ship-ladder-rung-${index}`, [
			shipX,
			y,
			z
		], [
			shipWidth - .12,
			.08,
			.1
		], hazard, {
			solid: false,
			detail: "performance"
		});
	}
	for (const side of [-1, 1]) box(builder, "rustworks-ship-ladder-stringer", [
		shipX + side * 1.32,
		shipPosY - .08,
		shipCenterZ
	], [
		.08,
		.18,
		shipLength + .08
	], oxide, {
		solid: false,
		rotation: shipRotation,
		detail: "performance"
	});
	const lowerRailY = lowerTop + 1.2;
	box(builder, "rustworks-lower-deck-rail", [
		-4.15,
		lowerRailY,
		.1
	], [
		.12,
		.12,
		7.6
	], hazard, {
		solid: false,
		detail: "performance"
	});
	box(builder, "rustworks-lower-deck-rail", [
		4.15,
		lowerRailY,
		-.35
	], [
		.12,
		.12,
		5.4
	], hazard, {
		solid: false,
		detail: "performance"
	});
	box(builder, "rustworks-lower-deck-rail", [
		-3.4,
		lowerRailY,
		-4.15
	], [
		1.5,
		.12,
		.12
	], hazard, {
		solid: false,
		detail: "performance"
	});
	box(builder, "rustworks-lower-deck-rail", [
		3.4,
		lowerRailY,
		-4.15
	], [
		1.5,
		.12,
		.12
	], hazard, {
		solid: false,
		detail: "performance"
	});
	box(builder, "rustworks-lower-deck-rail", [
		-3.4,
		lowerRailY,
		4.15
	], [
		1.5,
		.12,
		.12
	], hazard, {
		solid: false,
		detail: "performance"
	});
	box(builder, "rustworks-lower-deck-rail", [
		3.4,
		lowerRailY,
		4.15
	], [
		1.5,
		.12,
		.12
	], hazard, {
		solid: false,
		detail: "performance"
	});
	for (const [x, z] of [
		[-4.15, -4.15],
		[-2.85, -4.15],
		[2.85, -4.15],
		[4.15, -4.15],
		[-4.15, 4.15],
		[4.15, 4.15],
		[4.15, 2.35]
	]) box(builder, "rustworks-lower-deck-rail-post", [
		x,
		lowerTop + .62,
		z
	], [
		.12,
		1.2,
		.12
	], hazard, {
		solid: false,
		detail: "performance"
	});
	const upperRailY = upperTop + 1.2;
	for (const z of [-3.35, 3.35]) box(builder, "rustworks-upper-deck-rail", [
		-.3,
		upperRailY,
		z
	], [
		5.6,
		.12,
		.12
	], hazard, {
		solid: false,
		detail: "performance"
	});
	box(builder, "rustworks-upper-deck-rail", [
		-3.35,
		upperRailY,
		-.15
	], [
		.12,
		.12,
		5.9
	], hazard, {
		solid: false,
		detail: "performance"
	});
	box(builder, "rustworks-upper-deck-rail", [
		3.35,
		upperRailY,
		1.85
	], [
		.12,
		.12,
		2.9
	], hazard, {
		solid: false,
		detail: "performance"
	});
	for (const [x, z] of [
		[-3.35, -3.35],
		[-3.35, 3.35],
		[2.7, 3.35],
		[3.35, -1.75],
		[3.35, .2],
		[3.35, 3.35]
	]) box(builder, "rustworks-upper-deck-rail-post", [
		x,
		upperTop + .62,
		z
	], [
		.12,
		1.2,
		.12
	], hazard, {
		solid: false,
		detail: "performance"
	});
	const derrickBaseY = upperTop + .15;
	const derrickRingY = 11.35;
	const derrickTopY = 14.35;
	for (const x of [-2.75, 2.75]) for (const z of [-2.75, 2.75]) presentationBeam(builder, "rustworks-derrick-leg", [
		x,
		derrickBaseY,
		z
	], [
		Math.sign(x) * .78,
		derrickTopY,
		Math.sign(z) * .78
	], .22, x === z ? rust : steelBright, "performance");
	for (const y of [derrickRingY, derrickTopY]) {
		const half = y === derrickRingY ? 1.9 : .84;
		box(builder, "rustworks-derrick-ring", [
			0,
			y,
			-half
		], [
			half * 2,
			.16,
			.16
		], steelBright, {
			solid: false,
			shots: false,
			detail: "performance"
		});
		box(builder, "rustworks-derrick-ring", [
			0,
			y,
			half
		], [
			half * 2,
			.16,
			.16
		], steelBright, {
			solid: false,
			shots: false,
			detail: "performance"
		});
		box(builder, "rustworks-derrick-ring", [
			-half,
			y,
			0
		], [
			.16,
			.16,
			half * 2
		], steelBright, {
			solid: false,
			shots: false,
			detail: "performance"
		});
		box(builder, "rustworks-derrick-ring", [
			half,
			y,
			0
		], [
			.16,
			.16,
			half * 2
		], steelBright, {
			solid: false,
			shots: false,
			detail: "performance"
		});
	}
	box(builder, "rustworks-derrick-service-platform", [
		0,
		derrickRingY - .12,
		0
	], [
		4.3,
		.18,
		4.3
	], grate, {
		solid: false,
		shots: false,
		detail: "quality"
	});
	box(builder, "rustworks-derrick-beacon-mast", [
		0,
		15.05,
		0
	], [
		.16,
		1.4,
		.16
	], hazard, {
		solid: false,
		shots: false,
		detail: "quality"
	});
	box(builder, "rustworks-derrick-beacon", [
		0,
		15.78,
		0
	], [
		.42,
		.18,
		.42
	], hazard, {
		solid: false,
		shots: false,
		detail: "quality"
	});
	const trenchX = -13.8;
	const trenchWallXs = [trenchX - 1.85, -11.950000000000001];
	const trenchSegments = [
		-12,
		0,
		12
	];
	box(builder, "rustworks-service-trench-floor", [
		trenchX,
		.045,
		0
	], [
		3.4,
		.05,
		34
	], grate, {
		solid: false,
		cast: false,
		shots: false
	});
	for (const x of trenchWallXs) for (const z of trenchSegments) {
		const wall = box(builder, "rustworks-service-trench-wall", [
			x,
			.65,
			z
		], [
			.32,
			1.3,
			7
		], concreteDark);
		wall.userData.rustworksRouteRole = "west-service-trench-cover";
		box(builder, "rustworks-service-trench-coping", [
			x,
			1.34,
			z
		], [
			.46,
			.08,
			7.05
		], hazard, {
			solid: false,
			shots: false,
			detail: "performance"
		});
	}
	root.userData.rustworksCentreCoverAudit = {
		styles: [],
		count: 0,
		deckGroundY: 0,
		minimumTowerDistance: null,
		removedMixedCover: true,
		lanesPreserved: [
			"north-south-service",
			"east-west-service",
			"west-trench",
			"tower-undercroft"
		]
	};
	const containerRows = [
		{
			cluster: "north-west",
			side: "north",
			slot: 0,
			axis: "x",
			x: -8,
			z: -13,
			opening: "open-both"
		},
		{
			cluster: "north-west",
			side: "west",
			slot: 1,
			axis: "z",
			x: -18,
			z: -8,
			opening: "closed"
		},
		{
			cluster: "north-west",
			side: "north",
			slot: 2,
			axis: "x",
			x: -19,
			z: -17,
			opening: "closed"
		},
		{
			cluster: "north-west",
			side: "west",
			slot: 3,
			axis: "z",
			x: -7,
			z: -19,
			opening: "open-one"
		},
		{
			cluster: "north-east",
			side: "north",
			slot: 0,
			axis: "x",
			x: 8,
			z: -13,
			opening: "open-one"
		},
		{
			cluster: "north-east",
			side: "east",
			slot: 1,
			axis: "z",
			x: 18,
			z: -8,
			opening: "closed"
		},
		{
			cluster: "north-east",
			side: "north",
			slot: 2,
			axis: "x",
			x: 19,
			z: -17,
			opening: "open-both"
		},
		{
			cluster: "north-east",
			side: "east",
			slot: 3,
			axis: "z",
			x: 7,
			z: -19,
			opening: "closed"
		},
		{
			cluster: "south-west",
			side: "south",
			slot: 0,
			axis: "x",
			x: -8,
			z: 13,
			opening: "closed"
		},
		{
			cluster: "south-west",
			side: "west",
			slot: 1,
			axis: "z",
			x: -18,
			z: 8,
			opening: "open-one"
		},
		{
			cluster: "south-west",
			side: "south",
			slot: 2,
			axis: "x",
			x: -19,
			z: 17,
			opening: "open-both"
		},
		{
			cluster: "south-west",
			side: "west",
			slot: 3,
			axis: "z",
			x: -7,
			z: 19,
			opening: "closed"
		},
		{
			cluster: "south-east",
			side: "south",
			slot: 0,
			axis: "x",
			x: 8,
			z: 13,
			opening: "closed"
		},
		{
			cluster: "south-east",
			side: "east",
			slot: 1,
			axis: "z",
			x: 18,
			z: 8,
			opening: "open-both"
		},
		{
			cluster: "south-east",
			side: "south",
			slot: 2,
			axis: "x",
			x: 19,
			z: 17,
			opening: "closed"
		},
		{
			cluster: "south-east",
			side: "east",
			slot: 3,
			axis: "z",
			x: 7,
			z: 19,
			opening: "open-one"
		}
	];
	const containerPalette = [
		hazardDark,
		rustDark,
		tarp
	];
	const containerPracticalPalette = [
		16731438,
		16751165,
		16765530
	];
	const containerPracticalMaterials = containerPracticalPalette.map((color, index) => {
		const material = new MeshStandardMaterial({
			color,
			emissive: color,
			emissiveIntensity: 1.55 + index * .1,
			roughness: .24,
			metalness: .28
		});
		material.name = `RustRig_Container_Practical_${index}`;
		return material;
	});
	const openContainerRoutes = [];
	const containerPracticalIds = [];
	let openPracticalSequence = 0;
	for (const [index, placement] of containerRows.entries()) {
		const alongX = placement.axis === "x";
		const containerSize = alongX ? [
			5.8,
			2.6,
			2.5
		] : [
			2.5,
			2.6,
			5.8
		];
		const marker = new Group();
		marker.name = "rustworks-container-placement";
		marker.position.set(placement.x, 0, placement.z);
		marker.userData.rustworksContainerSide = placement.side;
		marker.userData.rustworksContainerCluster = placement.cluster;
		marker.userData.rustworksContainerSlot = placement.slot;
		marker.userData.rustworksContainerType = placement.opening;
		root.add(marker);
		if (placement.opening !== "closed") {
			const thickness = .14;
			const material = containerPalette[placement.slot % containerPalette.length];
			const shellParts = alongX ? [
				{
					suffix: "wall-a",
					position: [
						placement.x,
						1.3,
						placement.z - (containerSize[2] - thickness) / 2
					],
					size: [
						containerSize[0],
						containerSize[1],
						thickness
					]
				},
				{
					suffix: "wall-b",
					position: [
						placement.x,
						1.3,
						placement.z + (containerSize[2] - thickness) / 2
					],
					size: [
						containerSize[0],
						containerSize[1],
						thickness
					]
				},
				{
					suffix: "roof",
					position: [
						placement.x,
						containerSize[1] - thickness / 2,
						placement.z
					],
					size: [
						containerSize[0],
						thickness,
						containerSize[2]
					]
				}
			] : [
				{
					suffix: "wall-a",
					position: [
						placement.x - (containerSize[0] - thickness) / 2,
						1.3,
						placement.z
					],
					size: [
						thickness,
						containerSize[1],
						containerSize[2]
					]
				},
				{
					suffix: "wall-b",
					position: [
						placement.x + (containerSize[0] - thickness) / 2,
						1.3,
						placement.z
					],
					size: [
						thickness,
						containerSize[1],
						containerSize[2]
					]
				},
				{
					suffix: "roof",
					position: [
						placement.x,
						containerSize[1] - thickness / 2,
						placement.z
					],
					size: [
						containerSize[0],
						thickness,
						containerSize[2]
					]
				}
			];
			for (const part of shellParts) {
				const shell = box(builder, `rustworks-open-container-${part.suffix}`, part.position, part.size, material);
				shell.userData.rustworksContainerSide = placement.side;
				shell.userData.rustworksContainerSlot = placement.slot;
			}
			box(builder, `rustworks-open-container-floor-${index}`, [
				placement.x,
				.045,
				placement.z
			], [
				containerSize[0],
				.05,
				containerSize[2]
			], grate, {
				solid: false,
				shots: false,
				cast: false,
				detail: "performance"
			});
			const practicalId = `rustworks-container-practical-${placement.cluster}-${placement.slot}`;
			const practicalPaletteIndex = openPracticalSequence % containerPracticalMaterials.length;
			const practicalMaterial = containerPracticalMaterials[practicalPaletteIndex];
			openPracticalSequence += 1;
			const practical = box(builder, practicalId, [
				placement.x,
				2.36,
				placement.z
			], alongX ? [
				2.1,
				.08,
				.16
			] : [
				.16,
				.08,
				2.1
			], practicalMaterial, {
				solid: false,
				shots: false,
				cast: false,
				detail: "performance"
			});
			practical.userData.occlusionPolicy = "emissive-only";
			practical.userData.practicalPolicyId = "container-interior-warm-practicals";
			practical.userData.containerInterior = true;
			practical.userData.containerCluster = placement.cluster;
			practical.userData.paletteIndex = practicalPaletteIndex;
			containerPracticalIds.push(practicalId);
			if (placement.opening === "open-one") {
				const endThickness = .16;
				const direction = placement.side === "north" || placement.side === "west" ? 1 : -1;
				const end = box(builder, "rustworks-open-one-container-closed-end", alongX ? [
					placement.x + direction * (containerSize[0] - endThickness) / 2,
					1.3,
					placement.z
				] : [
					placement.x,
					1.3,
					placement.z + direction * (containerSize[2] - endThickness) / 2
				], alongX ? [
					endThickness,
					containerSize[1],
					containerSize[2]
				] : [
					containerSize[0],
					containerSize[1],
					endThickness
				], material);
				end.userData.rustworksContainerSide = placement.side;
				end.userData.rustworksContainerSlot = placement.slot;
			} else {
				const halfLength = (alongX ? containerSize[0] : containerSize[2]) / 2;
				openContainerRoutes.push({
					id: `open-container-${placement.side}-${placement.slot}`,
					side: placement.side,
					axis: alongX ? "x" : "z",
					anchors: alongX ? [
						[
							placement.x - halfLength - .5,
							1.7,
							placement.z
						],
						[
							placement.x,
							1.7,
							placement.z
						],
						[
							placement.x + halfLength + .5,
							1.7,
							placement.z
						]
					] : [
						[
							placement.x,
							1.7,
							placement.z - halfLength - .5
						],
						[
							placement.x,
							1.7,
							placement.z
						],
						[
							placement.x,
							1.7,
							placement.z + halfLength + .5
						]
					]
				});
			}
		} else {
			const container = box(builder, "rustworks-shipping-container", [
				placement.x,
				1.3,
				placement.z
			], containerSize, containerPalette[placement.slot % containerPalette.length]);
			container.userData.rustworksContainerSide = placement.side;
			container.userData.rustworksContainerSlot = placement.slot;
			for (const offset of [
				-1.45,
				0,
				1.45
			]) {
				const ribPosition = alongX ? [
					placement.x + offset,
					1.3,
					placement.z + (placement.side === "north" ? -1.27 : 1.27)
				] : [
					placement.x + (placement.side === "west" ? -1.27 : 1.27),
					1.3,
					placement.z + offset
				];
				box(builder, `rustworks-container-rib-${index}`, ribPosition, alongX ? [
					.08,
					2.2,
					.05
				] : [
					.05,
					2.2,
					.08
				], steelBright, {
					solid: false,
					shots: false,
					cast: false,
					detail: "performance"
				});
			}
		}
	}
	root.userData.rustworksContainerLayout = {
		total: containerRows.length,
		closed: containerRows.filter((placement) => placement.opening === "closed").length,
		open: containerRows.filter((placement) => placement.opening !== "closed").length,
		openBothEnds: containerRows.filter((placement) => placement.opening === "open-both").length,
		openOneEnd: containerRows.filter((placement) => placement.opening === "open-one").length,
		closedPercent: 50,
		openPercent: 50,
		clusters: 4,
		perCluster: 4,
		perimeterWall: false,
		minimumTowerDistance: Math.min(...containerRows.map((placement) => Math.hypot(placement.x, placement.z))),
		onlyShippingContainers: true
	};
	root.userData.rustworksContainerPracticalAudit = {
		ids: containerPracticalIds,
		count: containerPracticalIds.length,
		palette: [...containerPracticalPalette],
		fixtureOcclusionPolicy: "emissive-only",
		dynamicOcclusionPolicy: "shadowed-local",
		shadowedDynamicFill: "four-cluster-container-practical-pulse",
		dynamicPracticalIds: RUSTWORKS_CONTAINER_LIGHTS.map((fixture) => `container-dynamic-${fixture.id}`)
	};
	root.userData.rustworksOpenContainerRoutes = openContainerRoutes;
	root.userData.rustworksUndercroft = {
		passageWidth: RUSTWORKS_TOWER.undercroftPassageWidth,
		clearHeight: RUSTWORKS_TOWER.undercroftClearHeight,
		portals: [
			"north",
			"south",
			"west",
			"east"
		]
	};
	root.userData.rustworksTrench = {
		side: "west",
		x: trenchX,
		width: 3.4,
		segmentCentres: [...trenchSegments],
		lateralExitGaps: 4
	};
	const labelBoard = box(builder, "rustworks-original-arena-sign", [
		0,
		11.1,
		2.15
	], [
		3.8,
		.72,
		.12
	], hazard, {
		solid: false,
		shots: false,
		detail: "performance"
	});
	labelBoard.userData.label = "RUSTRIG";
	const welshFlag = createRustworksWelshFlag();
	root.add(welshFlag);
	root.userData.rustworksFlagAudit = welshFlag.userData.rustworksFlagAudit;
	root.userData.rustworksPresentationBatches = batchPresentationOnlyBoxes(root, "rustworks");
	applyRustworksPresentationProfile(root, "blender");
	root.userData.rustworksRoutes = {
		"ground-to-lower": [
			{
				id: "lower-ramp-foot",
				position: [
					0,
					1.7,
					lowerRampCenterZ - Math.cos(lowerRampAngle) * (lowerRampLength / 2) - .35
				]
			},
			{
				id: "lower-ramp-top",
				position: [
					0,
					lowerTop + 1.7,
					lowerLandingCenterZ
				]
			},
			{
				id: "lower-deck-center",
				position: [
					0,
					lowerTop + 1.7,
					0
				]
			}
		],
		"lower-to-upper": [
			{
				id: "ship-ladder-foot",
				position: [
					shipX,
					lowerTop + 1.7,
					shipLowerLandingCenterZ
				]
			},
			{
				id: "ship-ladder-top",
				position: [
					shipX,
					upperTop + 1.7,
					upperOutboardCenterZ
				]
			},
			{
				id: "upper-deck-center",
				position: [
					.4,
					upperTop + 1.7,
					.2
				]
			}
		],
		"undercroft-east-west": [
			{
				id: "undercroft-west-portal",
				position: [
					-5.2,
					1.7,
					0
				]
			},
			{
				id: "undercroft-centre-ew",
				position: [
					0,
					1.7,
					0
				]
			},
			{
				id: "undercroft-east-portal",
				position: [
					5.2,
					1.7,
					0
				]
			}
		],
		"undercroft-north-south": [
			{
				id: "undercroft-north-portal",
				position: [
					0,
					1.7,
					-5.2
				]
			},
			{
				id: "undercroft-centre-ns",
				position: [
					0,
					1.7,
					0
				]
			},
			{
				id: "undercroft-south-portal",
				position: [
					0,
					1.7,
					5.2
				]
			}
		],
		"west-service-trench": [
			{
				id: "trench-north",
				position: [
					trenchX,
					1.7,
					-17
				]
			},
			{
				id: "trench-centre",
				position: [
					trenchX,
					1.7,
					0
				]
			},
			{
				id: "trench-south",
				position: [
					trenchX,
					1.7,
					17
				]
			}
		]
	};
	root.userData.rustworksAccess = {
		lowerRampAngleDegrees,
		shipLadderAngleDegrees,
		lowerRamp: {
			position: [
				0,
				lowerRampPosY,
				lowerRampCenterZ
			],
			size: [
				lowerRampWidth,
				lowerRampThickness,
				lowerRampLength
			],
			rotation: [
				-lowerRampAngle,
				0,
				0
			],
			landingPosition: [
				0,
				lowerDeckCenterY,
				lowerLandingCenterZ
			],
			landingSize: [
				5.25,
				deckThickness,
				lowerLandingDepth
			]
		},
		shipLadder: {
			position: [
				shipX,
				shipPosY,
				shipCenterZ
			],
			size: [
				shipWidth,
				shipThickness,
				shipLength
			],
			rotation: shipRotation,
			lowerLandingPosition: [
				shipX,
				lowerDeckCenterY,
				shipLowerLandingCenterZ
			],
			lowerLandingSize: [
				3.1500000000000004,
				deckThickness,
				lowerShipLandingDepth
			],
			upperLandingPosition: [
				shipX,
				upperDeckCenterY,
				upperOutboardCenterZ
			],
			upperLandingSize: [
				3.0500000000000003,
				deckThickness,
				upperOutboardLandingDepth
			],
			bridgePosition: [
				upperBridgeCenterX,
				upperDeckCenterY,
				upperOutboardCenterZ
			],
			bridgeSize: [
				upperBridgeWidth,
				deckThickness,
				upperOutboardLandingDepth
			],
			run: shipRun,
			rise: shipRise
		}
	};
	return {
		id: "rustworks-1v1",
		label: "RustRig",
		root,
		colliders: builder.colliders,
		physicsColliders: builder.physicsColliders,
		raycastMeshes: builder.raycastMeshes,
		shotSurfaces: builder.shotSurfaces,
		spawns: spawnRecord([
			[0, 19],
			[-13, 19],
			[13, 19],
			[-19, 11],
			[-19, 0],
			[-13, 14]
		], [
			[0, -19],
			[13, -19],
			[-13, -19],
			[19, -11],
			[19, 0],
			[13, -14]
		]),
		patrolPoints: [
			[-18, 18],
			[-10, 9],
			[0, 10],
			[12, 8],
			[18, -18],
			[8, -11],
			[0, -15],
			[-12, -8]
		].map(([x, z]) => new Vector3(x, 0, z)),
		targets: [],
		houses: [],
		breakableWindows: [],
		physicalCover: [],
		bounds: {
			minX: -27,
			maxX: 27,
			minZ: -29,
			maxZ: 29
		},
		houseTelemetry: emptyTelemetry()
	};
}
/**
* Match Atomic Acres' Performance vs Quality split on Rustworks:
* Performance keeps climbable/combat core and sparse yard cover;
* Quality enables heavy industrial decoration + Blender tower overlay.
*/
function applyAdditionalMapPresentationProfile(root, profile) {
	let hidden = 0;
	let shown = 0;
	const allowPerformance = profile === "performance" || profile === "blender";
	const allowQuality = profile === "blender";
	root.traverse((node) => {
		if (node.userData.staticBatchRendered === true && (root.userData.pass65StaticBatchReady === true || !String(node.name).startsWith("rustworks-presentation-batch-"))) {
			if (node.visible) {
				node.visible = false;
				hidden += 1;
			}
			return;
		}
		const detail = node.userData.rustworksDetail;
		if (node.userData.blenderAuthoredEnvironment) {
			if (node.visible) {
				node.visible = false;
				hidden += 1;
			}
			return;
		}
		if (!detail || detail === "core") return;
		let visible = true;
		if (detail === "performance") visible = allowPerformance;
		if (detail === "quality") visible = allowQuality;
		if (node.visible === visible) return;
		node.visible = visible;
		if (visible) shown += 1;
		else hidden += 1;
	});
	root.traverse((node) => {
		if (!(node instanceof Mesh) || node.userData.skylineQualityPlaceholder !== true) return;
		const authorityId = node.userData.skylineCollisionAuthorityId;
		let visiblePresentation = false;
		if (authorityId) root.traverse((candidate) => {
			if (candidate === node || candidate.userData.skylineCollisionAuthorityId !== authorityId || !candidate.visible || candidate.userData.skylineQualityPlaceholder === true || !(candidate instanceof Mesh)) return;
			if ((Array.isArray(candidate.material) ? candidate.material : [candidate.material]).some((material) => material.visible && material.colorWrite)) visiblePresentation = true;
		});
		node.castShadow = false;
		node.receiveShadow = false;
		const materials = Array.isArray(node.material) ? node.material : [node.material];
		for (const material of materials) {
			material.colorWrite = !visiblePresentation;
			material.depthWrite = !visiblePresentation;
			material.needsUpdate = true;
		}
		node.userData.skylineCollisionPresentationVisible = visiblePresentation;
	});
	return {
		hidden,
		shown
	};
}
/** Backward-compatible name retained for existing Rustworks callers. */
function applyRustworksPresentationProfile(root, profile) {
	return applyAdditionalMapPresentationProfile(root, profile);
}
function fitCanvasText(context, text, preferredSize, availableWidth, minimumSize = 18) {
	let fontSize = Math.max(minimumSize, Math.floor(preferredSize));
	const family = "\"Arial Narrow\", \"Roboto Condensed\", Arial, sans-serif";
	context.font = `900 ${fontSize}px ${family}`;
	while (fontSize > minimumSize && context.measureText(text).width > availableWidth) {
		fontSize -= 2;
		context.font = `900 ${fontSize}px ${family}`;
	}
	return {
		fontSize,
		measuredWidth: context.measureText(text).width,
		availableWidth
	};
}
function rangeSign(text, accent, name, scale) {
	if (typeof document === "undefined") return null;
	const canvas = document.createElement("canvas");
	canvas.width = 1024;
	const aspect = MathUtils.clamp(scale[0] / Math.max(.1, scale[1]), 3.2, 12);
	canvas.height = Math.round(MathUtils.clamp(canvas.width / aspect, 128, 320));
	const context = canvas.getContext("2d");
	if (!context) return null;
	const border = Math.max(8, Math.round(canvas.height * .055));
	const inset = Math.max(7, Math.round(border * .7));
	context.fillStyle = "rgba(10, 17, 20, 0.94)";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.strokeStyle = `#${accent.toString(16).padStart(6, "0")}`;
	context.lineWidth = border;
	context.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);
	context.fillStyle = "#f8f0d2";
	const horizontalPadding = Math.max(50, Math.round(canvas.width * .055));
	const layout = fitCanvasText(context, text, canvas.height * .48, canvas.width - horizontalPadding * 2, 30);
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillText(text, canvas.width / 2, canvas.height / 2 + Math.round(canvas.height * .025));
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	texture.needsUpdate = true;
	const sign = new Mesh(new PlaneGeometry(scale[0], scale[1]), new MeshBasicMaterial({
		map: texture,
		transparent: true,
		depthTest: true,
		depthWrite: false,
		toneMapped: false,
		side: 2
	}));
	sign.name = name;
	sign.renderOrder = 8;
	sign.userData.presentationOnly = true;
	sign.userData.text = text;
	sign.userData.textLayout = {
		...layout,
		canvasWidth: canvas.width,
		canvasHeight: canvas.height,
		worldAspect: scale[0] / scale[1],
		boardAnchored: true
	};
	return sign;
}
function rangeTarget(builder, targets, id, x, z, scoreValue, distanceBand) {
	const root = new Group();
	root.name = "gun-range-scoring-target";
	root.userData.targetId = id;
	root.userData.scoreValue = scoreValue;
	root.position.set(x, 0, z);
	const stand = new Mesh(new BoxGeometry(.12, 1.2, .12), standard(4934985, .8, .5));
	stand.position.y = .6;
	const plate = new Mesh(new CylinderGeometry(.7, .7, .12, 24), standard(distanceBand === "near" ? 5825500 : distanceBand === "mid" ? 16041039 : 16741983, .58, .28));
	plate.name = `${scoreValue}-point-range-plate`;
	plate.userData.hitZone = "body";
	plate.position.y = 1.65;
	plate.rotation.x = Math.PI / 2;
	const bullseye = new Mesh(new CylinderGeometry(.19, .19, .135, 20), standard(16117472, .48, .18));
	bullseye.name = "range-bullseye";
	bullseye.userData.hitZone = "head";
	bullseye.position.set(0, 1.65, .01);
	bullseye.rotation.x = Math.PI / 2;
	root.add(stand, plate, bullseye);
	root.traverse((child) => {
		child.userData.targetRoot = root;
		child.userData.impactSurface = "metal";
	});
	builder.root.add(root);
	targets.push({
		id,
		root,
		active: true,
		respawnAt: 0,
		scoreValue,
		distanceBand,
		maxHealth: 500,
		health: 500,
		kind: "plate"
	});
}
function lateralRangeTarget(builder, targets, id, originX, z, phase, color) {
	const root = new Group();
	root.name = "gun-range-lateral-illuminated-target";
	root.userData.targetId = id;
	root.userData.scoreValue = 250;
	root.userData.lateralOriginX = originX;
	root.userData.lateralAmplitudeM = 3.6;
	root.userData.lateralFrequencyHz = .065;
	root.userData.lateralPhaseRadians = phase;
	root.position.set(originX, 0, z);
	const plate = new Mesh(new BoxGeometry(.92, 1.45, .16), new MeshStandardMaterial({
		color,
		emissive: color,
		emissiveIntensity: 2.8,
		roughness: .34,
		metalness: .4
	}));
	plate.name = "gun-range-lateral-target-plate";
	plate.position.y = 1.72;
	plate.userData.hitZone = "body";
	root.add(plate);
	root.traverse((child) => {
		child.userData.targetRoot = root;
		child.userData.impactSurface = "metal";
	});
	builder.root.add(root);
	(builder.root.userData.gunRangeLateralTargets ??= []).push(root);
	targets.push({
		id,
		root,
		active: true,
		respawnAt: 0,
		scoreValue: 250,
		distanceBand: "mid",
		maxHealth: 500,
		health: 500,
		kind: "plate"
	});
}
function fivePointStarGeometry(outerRadius = .16, innerRadius = .065) {
	const shape = new Shape();
	for (let point = 0; point < 10; point += 1) {
		const angle = -Math.PI / 2 + point * Math.PI / 5;
		const radius = point % 2 === 0 ? outerRadius : innerRadius;
		const x = Math.cos(angle) * radius;
		const y = Math.sin(angle) * radius;
		if (point === 0) shape.moveTo(x, y);
		else shape.lineTo(x, y);
	}
	shape.closePath();
	return new ShapeGeometry(shape);
}
function flyingBlackCat(targets, root) {
	const cat = new Group();
	cat.name = "gun-range-flying-black-cat";
	cat.userData.targetId = "flying-black-cat";
	cat.userData.scoreValue = 500;
	cat.userData.flyingCat = true;
	cat.position.set(10.5, 3.8, -18);
	const fur = new MeshStandardMaterial({
		color: 329224,
		roughness: .78,
		metalness: .02
	});
	const eyes = new MeshBasicMaterial({
		color: 16041039,
		toneMapped: false
	});
	const body = new Mesh(new SphereGeometry(.46, 16, 10), fur);
	body.name = "flying-black-cat-body";
	body.scale.set(1.45, .72, .78);
	body.userData.hitZone = "head";
	const head = new Mesh(new SphereGeometry(.34, 14, 10), fur);
	head.name = "flying-black-cat-head";
	head.position.set(0, .18, -.52);
	head.userData.hitZone = "head";
	const earGeometry = new ConeGeometry(.13, .3, 4);
	for (const side of [-1, 1]) {
		const ear = new Mesh(earGeometry, fur);
		ear.name = "flying-black-cat-ear";
		ear.position.set(side * .19, .47, -.54);
		ear.rotation.y = Math.PI / 4;
		ear.userData.hitZone = "head";
		cat.add(ear);
		const eye = new Mesh(new SphereGeometry(.045, 8, 6), eyes);
		eye.name = "flying-black-cat-eye";
		eye.position.set(side * .12, .23, -.82);
		eye.userData.hitZone = "head";
		cat.add(eye);
	}
	const tail = new Mesh(new TorusGeometry(.48, .07, 8, 20, Math.PI * 1.35), fur);
	tail.name = "flying-black-cat-tail";
	tail.position.set(.46, .06, .38);
	tail.rotation.set(Math.PI / 2, .35, .3);
	tail.userData.hitZone = "head";
	cat.add(body, head, tail);
	const starMaterial = new MeshBasicMaterial({
		color: 0,
		side: 2,
		transparent: true,
		opacity: .9,
		toneMapped: false
	});
	const starGeometry = fivePointStarGeometry();
	const trail = [];
	for (let index = 0; index < 8; index += 1) {
		const star = new Mesh(starGeometry, starMaterial.clone());
		star.name = "flying-black-cat-trail-star";
		star.position.set(Math.sin(index * 1.7) * .18, Math.cos(index * 1.3) * .14, .65 + index * .34);
		star.scale.setScalar(1 - index * .075);
		star.userData.presentationOnly = true;
		star.userData.blocksShots = false;
		star.raycast = () => void 0;
		cat.add(star);
		trail.push(star);
	}
	cat.userData.starTrail = trail;
	cat.traverse((child) => {
		if (child.userData.presentationOnly === true) return;
		child.userData.targetRoot = cat;
		child.userData.targetId = "flying-black-cat";
		child.userData.hitZone = "head";
		child.userData.impactSurface = "organic";
	});
	root.add(cat);
	targets.push({
		id: "flying-black-cat",
		root: cat,
		active: true,
		respawnAt: 0,
		respawnDelayMs: 3e4,
		scoreValue: 500,
		distanceBand: "mid",
		maxHealth: 100,
		health: 100,
		alwaysCritical: true,
		kind: "flying-cat"
	});
}
function gunRangeTrainingDummy(builder, targets, definition, index) {
	const root = new Group();
	root.name = `gun-range-${definition.id}`;
	root.userData.targetId = definition.id;
	root.userData.targetKind = "training-dummy";
	root.userData.armed = false;
	root.userData.walkSpeedMps = definition.speedMps;
	root.userData.scoreValue = 250;
	root.userData.maxHealth = 300;
	const rigged = (() => {
		try {
			return buildOperator(index % 2 === 0 ? 1 : 0, `gun-range-${definition.id}`, false, null, "neon-purple");
		} catch {
			return null;
		}
	})();
	if (rigged) {
		applyBotEmissiveBrightness(rigged);
		rigged.position.set(0, 0, 0);
		rigged.userData.targetRoot = root;
		rigged.userData.targetId = definition.id;
		rigged.traverse((node) => {
			node.userData.targetRoot = root;
			node.userData.targetId = definition.id;
			if (node instanceof Mesh) node.userData.impactSurface = "metal";
		});
		root.add(rigged);
		const parts = [];
		rigged.traverse((node) => {
			if (!(node instanceof Mesh) || node.userData.authoritativeProxy === true) return;
			parts.push(node);
			builder.raycastMeshes.push(node);
		});
		root.userData.targetMeshes = parts;
		root.userData.riggedOperator = true;
		root.position.set(definition.start.x, definition.start.y, definition.start.z);
		builder.root.add(root);
		targets.push({
			id: definition.id,
			root,
			active: true,
			respawnAt: 0,
			respawnDelayMs: 2500,
			scoreValue: 250,
			distanceBand: "mid",
			maxHealth: 300,
			health: 300,
			kind: "training-dummy"
		});
		return Object.freeze({
			root,
			definition,
			riggedOperator: rigged
		});
	}
	const shell = new MeshBasicMaterial({
		color: index % 2 === 0 ? 12175562 : 10136493,
		toneMapped: false
	});
	const armour = new MeshBasicMaterial({
		color: index % 2 === 0 ? 2595488 : 12089394,
		toneMapped: false
	});
	const joint = new MeshBasicMaterial({
		color: 2503479,
		toneMapped: false
	});
	const parts = [];
	const part = (name, geometry, material, position, hitZone) => {
		const mesh = new Mesh(geometry, material);
		mesh.name = `gun-range-${definition.id}-${name}`;
		mesh.position.set(...position);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.userData.targetRoot = root;
		mesh.userData.targetId = definition.id;
		mesh.userData.hitZone = hitZone;
		mesh.userData.impactSurface = "metal";
		root.add(mesh);
		builder.raycastMeshes.push(mesh);
		parts.push(mesh);
		return mesh;
	};
	part("torso", new BoxGeometry(.72, .94, .38), armour, [
		0,
		1.32,
		0
	], "body");
	part("pelvis", new BoxGeometry(.55, .34, .34), shell, [
		0,
		.72,
		0
	], "body");
	part("head", new SphereGeometry(.27, 14, 10), shell, [
		0,
		2.08,
		0
	], "head");
	for (const side of [-1, 1]) {
		part(`arm-${side}`, new CapsuleGeometry(.105, .62, 4, 8), shell, [
			side * .52,
			1.28,
			0
		], "limb").rotation.z = side * .13;
		part(`leg-${side}`, new CapsuleGeometry(.13, .72, 4, 8), joint, [
			side * .2,
			.24,
			0
		], "limb");
	}
	root.userData.targetMeshes = parts;
	root.position.set(definition.start.x, definition.start.y, definition.start.z);
	builder.root.add(root);
	targets.push({
		id: definition.id,
		root,
		active: true,
		respawnAt: 0,
		respawnDelayMs: 2500,
		scoreValue: 250,
		distanceBand: "mid",
		maxHealth: 300,
		health: 300,
		kind: "training-dummy"
	});
	return Object.freeze({
		root,
		definition,
		riggedOperator: null
	});
}
function syncGunRangeTestBayDoorLeaf(root, state) {
	const leaf = root.getObjectByName("gun-range-test-bay-secure-door-leaf");
	if (!leaf) return;
	const bounds = gunRangeTestBayDoorLeafBounds(state);
	leaf.position.y = ((bounds.minY ?? 0) + (bounds.maxY ?? 0)) / 2;
	leaf.userData.phase = state.phase;
	leaf.userData.openness = state.openness;
}
/** Apply a host-authored or host-clock-projected leaf state. No observer is
* accepted here, so a guest can never author its own collision corridor. */
function applyGunRangeTestBayDoorState(root, state) {
	const prior = root.userData.gunRangeTestBayDoorState;
	root.userData.gunRangeTestBayDoorState = state;
	syncGunRangeTestBayDoorLeaf(root, state);
	return Object.freeze({
		state,
		audioIntent: null,
		collisionChanged: prior === void 0 || Math.abs(prior.openness - state.openness) > Number.EPSILON,
		dynamicColliders: gunRangeTestBayDoorDynamicColliders(state),
		dynamicBallisticSurfaces: gunRangeTestBayDoorDynamicBallisticSurfaces(state)
	});
}
function buildGunRange(scene) {
	const root = new Group();
	root.name = "Acres Indoor Gun Range arena";
	scene.add(root);
	const builder = {
		root,
		colliders: [],
		physicsColliders: [],
		raycastMeshes: [],
		shotSurfaces: [],
		ballisticSurfaceSequence: 0
	};
	const concrete = standard(6449773, .98, .02);
	const wall = terminalSurfaceMaterial("panel", 12108228, "#69777d", .5, .38, [7, 4]);
	wall.name = "GunRange_SilverWall_PanelTexture";
	wall.userData.gunRangeShell = "white-silver-wall";
	const ceiling = terminalSurfaceMaterial("panel", 14146524, "#8e9a9e", .42, .46, [8, 10]);
	ceiling.name = "GunRange_SilverCeiling_PanelTexture";
	ceiling.userData.gunRangeShell = "white-silver-ceiling";
	const dark = standard(1120541, .7, .62);
	const acoustic = standard(3160895, .96, .08);
	const timber = standard(7754038, .91, .04);
	const safety = new MeshStandardMaterial({
		color: 14723639,
		emissive: 4926208,
		emissiveIntensity: .5,
		roughness: .62,
		metalness: .28
	});
	const redSafety = new MeshStandardMaterial({
		color: 13058613,
		emissive: 4851716,
		emissiveIntensity: .72,
		roughness: .54,
		metalness: .2
	});
	const lamp = new MeshStandardMaterial({
		color: 15859711,
		emissive: 11073023,
		emissiveIntensity: 4.2,
		roughness: .18,
		metalness: .08
	});
	const targets = [];
	root.userData.gunRangeBayLightMaterial = lamp;
	const floor = new Mesh(new PlaneGeometry(42, 70), concrete);
	floor.name = "gun-range-concrete-lanes";
	floor.rotation.x = -Math.PI / 2;
	floor.position.z = -14.5;
	floor.receiveShadow = true;
	floor.userData.impactSurface = "concrete";
	root.add(floor);
	builder.raycastMeshes.push(floor);
	const floorSurface = createBallisticSurface(`${root.name}:${builder.ballisticSurfaceSequence}:floor`, floor.name, {
		minX: -16,
		maxX: 16,
		minY: -1.2,
		maxY: 0,
		minZ: -44,
		maxZ: 10
	}, {
		impactSurface: "concrete",
		material: "concrete"
	});
	builder.ballisticSurfaceSequence += 1;
	builder.shotSurfaces.push(floorSurface);
	floor.userData.ballisticSurfaceId = floorSurface.id;
	floor.userData.ballisticMaterial = floorSurface.material;
	box(builder, "gun-range-backstop", [
		0,
		3.6,
		-49
	], [
		42,
		7.2,
		1.2
	], dark);
	box(builder, "gun-range-left-wall", [
		-20.5,
		3.6,
		-14.5
	], [
		1,
		7.2,
		70
	], wall);
	box(builder, "gun-range-right-wall", [
		20.5,
		3.6,
		-20.5
	], [
		1,
		7.2,
		57
	], wall);
	box(builder, "gun-range-right-wall", [
		20.5,
		3.6,
		18
	], [
		1,
		7.2,
		4
	], wall);
	box(builder, "gun-range-rear-wall", [
		0,
		3.6,
		20
	], [
		42,
		7.2,
		1
	], wall);
	box(builder, "gun-range-ceiling", [
		0,
		7.1,
		-14.5
	], [
		42,
		.45,
		70
	], ceiling, {
		solid: false,
		shots: true
	});
	const testBayWall = terminalSurfaceMaterial("panel", 10134438, "#4e5a5e", .62, .48, [6, 4]);
	testBayWall.name = "GunRange_TestBay_GreyWall_PanelTexture";
	testBayWall.emissive.setHex(4608341);
	testBayWall.emissiveIntensity = .52;
	const testBayFloor = terminalSurfaceMaterial("concrete", 5857636, "#a5afb2", .88, .16, [12, 16]);
	testBayFloor.name = "GunRange_TestBay_GreyFloor_Texture";
	testBayFloor.emissive.setHex(2699829);
	testBayFloor.emissiveIntensity = .42;
	const testBayCeiling = terminalSurfaceMaterial("panel", 5397857, "#192225", .7, .5, [10, 8]);
	testBayCeiling.name = "GunRange_TestBay_GreyCeiling_PanelTexture";
	testBayCeiling.emissive.setHex(2436914);
	testBayCeiling.emissiveIntensity = .4;
	const testBayCyan = new MeshBasicMaterial({
		color: 3520950,
		toneMapped: false
	});
	const testBayAmber = new MeshBasicMaterial({
		color: 13932354,
		toneMapped: false
	});
	const testBayVisibleFloor = terminalSurfaceMaterial("concrete", 4805719, "#8c999d", .84, .18, [16, 20]);
	testBayVisibleFloor.name = "GunRange_TestBay_VisibleFloor_PBR";
	testBayVisibleFloor.emissive.setHex(1120540);
	testBayVisibleFloor.emissiveIntensity = .18;
	const testBayVisibleWall = terminalSurfaceMaterial("panel", 7438470, "#263237", .62, .42, [12, 8]);
	testBayVisibleWall.name = "GunRange_TestBay_VisibleWall_PBR";
	testBayVisibleWall.emissive.setHex(1515813);
	testBayVisibleWall.emissiveIntensity = .2;
	const testBayVisibleCeiling = terminalSurfaceMaterial("panel", 4608857, "#151f23", .76, .34, [12, 8]);
	testBayVisibleCeiling.name = "GunRange_TestBay_VisibleCeiling_PBR";
	testBayVisibleCeiling.emissive.setHex(1055004);
	testBayVisibleCeiling.emissiveIntensity = .16;
	const secureDoorMaterial = new MeshStandardMaterial({
		color: 5398888,
		emissive: 1055519,
		emissiveIntensity: .24,
		roughness: .42,
		metalness: .82
	});
	secureDoorMaterial.name = "GunRange_TestBay_SecureDoor_FrameMetal";
	const secureDoorPanelMaterial = terminalSurfaceMaterial("panel", 6254196, "#1e2b30", .44, .78, [4, 6]);
	secureDoorPanelMaterial.name = "GunRange_TestBay_SecureDoor_PanelTexture";
	secureDoorPanelMaterial.color.setHex(8887202);
	secureDoorPanelMaterial.emissive.setHex(2769225);
	secureDoorPanelMaterial.emissiveIntensity = .78;
	secureDoorPanelMaterial.roughness = .56;
	secureDoorPanelMaterial.metalness = .52;
	secureDoorPanelMaterial.userData.testBayDoorTextureMapping = Object.freeze({
		pattern: "panel",
		repeat: [2, 3]
	});
	const doorAssembly = new Group();
	doorAssembly.name = "gun-range-test-bay-secure-door-assembly";
	doorAssembly.userData.authorityId = GUN_RANGE_TEST_BAY_CONTRACT.door.id;
	doorAssembly.userData.structure = "static-frame-with-dynamic-leaf";
	doorAssembly.userData.practicalIds = Object.freeze(["test-bay-door-approach-key", "test-bay-door-bay-key"]);
	doorAssembly.userData.fixtureDepthPlanes = Object.freeze({
		leafHalfThicknessM: .35,
		armourFaceM: .358,
		braceFaceM: .37,
		spineFaceM: .382,
		detailFaceM: .394,
		emissiveFaceM: .406,
		emissiveSecondaryFaceM: .418,
		minimumGapM: .004
	});
	doorAssembly.userData.emissiveIndicatorAnimation = "static";
	root.add(doorAssembly);
	const structureMaterials = {
		wall: testBayWall,
		floor: testBayFloor,
		ceiling: testBayCeiling,
		"door-frame": secureDoorMaterial
	};
	for (const definition of GUN_RANGE_TEST_BAY_STRUCTURE) {
		const mesh = box(builder, definition.id, [...definition.position], [...definition.size], structureMaterials[definition.material], { ballisticMaterial: definition.ballisticMaterial });
		mesh.userData.testBayAuthority = "visible-movement-physics-ballistic";
		mesh.userData.testBayStructureId = definition.id;
		if (definition.assemblyRole) {
			mesh.userData.doorAssemblyRole = definition.assemblyRole;
			doorAssembly.add(mesh);
		}
	}
	for (const skin of [
		box(builder, "gun-range-test-bay-corridor-floor-skin", [
			35.75,
			.012,
			12
		], [
			30.25,
			.024,
			7.55
		], testBayVisibleFloor, {
			solid: false,
			shots: false,
			cast: false
		}),
		box(builder, "gun-range-test-bay-corridor-north-skin", [
			35.75,
			2.55,
			8.015
		], [
			30.25,
			4.9,
			.03
		], testBayVisibleWall, {
			solid: false,
			shots: false,
			cast: false
		}),
		box(builder, "gun-range-test-bay-corridor-south-skin", [
			35.75,
			2.55,
			15.985
		], [
			30.25,
			4.9,
			.03
		], testBayVisibleWall, {
			solid: false,
			shots: false,
			cast: false
		}),
		box(builder, "gun-range-test-bay-corridor-ceiling-skin", [
			35.75,
			4.955,
			12
		], [
			30.25,
			.03,
			7.55
		], testBayVisibleCeiling, {
			solid: false,
			shots: false,
			cast: false
		})
	]) skin.userData.presentationBatchCandidate = false;
	for (const x of [
		24,
		29,
		34,
		39,
		44,
		49
	]) {
		const ceilingRib = box(builder, "gun-range-test-bay-corridor-light-rib", [
			x,
			4.88,
			12
		], [
			.18,
			.12,
			7.2
		], x % 2 === 0 ? testBayCyan : testBayAmber, {
			solid: false,
			shots: false,
			cast: false
		});
		ceilingRib.userData.presentationBatchCandidate = false;
		for (const [sideIndex, z] of [8.03, 15.97].entries()) {
			const wallRib = box(builder, "gun-range-test-bay-corridor-wall-rib", [
				x,
				2.45,
				z
			], [
				.16,
				4.55,
				.08
			], sideIndex === 0 ? testBayCyan : testBayAmber, {
				solid: false,
				shots: false,
				cast: false
			});
			wallRib.userData.presentationBatchCandidate = false;
		}
	}
	for (const guide of [
		box(builder, "gun-range-test-bay-corridor-guide-cyan", [
			35.75,
			.025,
			9.15
		], [
			30.5,
			.05,
			.18
		], testBayCyan, {
			solid: false,
			shots: false,
			cast: false
		}),
		box(builder, "gun-range-test-bay-corridor-guide-amber", [
			35.75,
			.026,
			14.85
		], [
			30.5,
			.052,
			.18
		], testBayAmber, {
			solid: false,
			shots: false,
			cast: false
		}),
		box(builder, "gun-range-test-bay-corridor-wall-guide-cyan", [
			35.75,
			1.12,
			8.03
		], [
			30.5,
			.15,
			.08
		], testBayCyan, {
			solid: false,
			shots: false,
			cast: false
		}),
		box(builder, "gun-range-test-bay-corridor-wall-guide-amber", [
			35.75,
			1.12,
			15.97
		], [
			30.5,
			.15,
			.08
		], testBayAmber, {
			solid: false,
			shots: false,
			cast: false
		})
	]) guide.userData.presentationBatchCandidate = false;
	for (const skin of [
		box(builder, "gun-range-test-bay-floor-skin", [
			75.75,
			.012,
			6
		], [
			48,
			.024,
			63.5
		], testBayVisibleFloor, {
			solid: false,
			shots: false,
			cast: false
		}),
		box(builder, "gun-range-test-bay-ceiling-skin", [
			75.75,
			25.155,
			6
		], [
			48,
			.03,
			63.5
		], testBayVisibleCeiling, {
			solid: false,
			shots: false,
			cast: false
		}),
		box(builder, "gun-range-test-bay-east-wall-skin", [
			99.985,
			13.15,
			6
		], [
			.03,
			24.5,
			63.5
		], testBayVisibleWall, {
			solid: false,
			shots: false,
			cast: false
		}),
		box(builder, "gun-range-test-bay-north-wall-skin", [
			75.75,
			13.15,
			-25.985
		], [
			48,
			24.5,
			.03
		], testBayVisibleWall, {
			solid: false,
			shots: false,
			cast: false
		}),
		box(builder, "gun-range-test-bay-south-wall-skin", [
			75.75,
			13.15,
			37.985
		], [
			48,
			24.5,
			.03
		], testBayVisibleWall, {
			solid: false,
			shots: false,
			cast: false
		})
	]) skin.userData.presentationBatchCandidate = false;
	for (const rail of [box(builder, "gun-range-test-bay-door-rail-north", [
		51.47,
		3.3,
		8.24
	], [
		.12,
		6.6,
		.16
	], secureDoorMaterial, {
		solid: false,
		shots: false
	}), box(builder, "gun-range-test-bay-door-rail-south", [
		51.47,
		3.3,
		15.76
	], [
		.12,
		6.6,
		.16
	], secureDoorMaterial, {
		solid: false,
		shots: false
	})]) {
		rail.userData.doorAssemblyRole = "track";
		rail.userData.presentationBatchCandidate = false;
		doorAssembly.add(rail);
	}
	const secureDoor = box(builder, "gun-range-test-bay-secure-door-leaf", [
		51.5,
		3.25,
		12
	], [
		.7,
		6.5,
		7.6
	], secureDoorPanelMaterial, {
		solid: false,
		shots: false
	});
	doorAssembly.add(secureDoor);
	secureDoor.userData.presentationBatchCandidate = false;
	secureDoor.userData.dynamic = true;
	secureDoor.userData.authorityId = GUN_RANGE_TEST_BAY_CONTRACT.door.id;
	secureDoor.userData.portalCollisionStatus = "runtime-helper-required";
	secureDoor.userData.defaultFailsOpen = false;
	const doorStatusRangeMaterial = new MeshStandardMaterial({
		color: 15774283,
		emissive: 15774283,
		emissiveIntensity: 3.1,
		roughness: .28,
		metalness: .18,
		toneMapped: false
	});
	doorStatusRangeMaterial.name = "GunRange_TestBay_DoorStatus_Amber";
	const doorStatusBayMaterial = new MeshStandardMaterial({
		color: 5496536,
		emissive: 5496536,
		emissiveIntensity: 3.1,
		roughness: .28,
		metalness: .18,
		toneMapped: false
	});
	doorStatusBayMaterial.name = "GunRange_TestBay_DoorStatus_Cyan";
	const doorInlayMaterial = new MeshStandardMaterial({
		color: 1516328,
		emissive: 463125,
		emissiveIntensity: .25,
		roughness: .34,
		metalness: .88
	});
	doorInlayMaterial.name = "GunRange_TestBay_DoorInlay_Gunmetal";
	const doorArmourPlateMaterial = new MeshStandardMaterial({
		color: 10137267,
		emissive: 3229517,
		emissiveIntensity: .62,
		roughness: .5,
		metalness: .58
	});
	doorArmourPlateMaterial.name = "GunRange_TestBay_DoorArmour_SatinSteel";
	const doorGlassMaterial = new MeshStandardMaterial({
		color: 7859946,
		emissive: 1474433,
		emissiveIntensity: 1.35,
		roughness: .18,
		metalness: .08,
		transparent: true,
		opacity: .42,
		depthWrite: false,
		toneMapped: false
	});
	doorGlassMaterial.name = "GunRange_TestBay_DoorGlass_ClearCyan";
	const attachDoorFixture = (name, position, size, material, role) => {
		const fixture = new Mesh(new BoxGeometry(...size), material);
		fixture.name = name;
		fixture.position.set(...position);
		fixture.castShadow = false;
		fixture.receiveShadow = false;
		fixture.userData.presentationOnly = true;
		fixture.userData.presentationBatchCandidate = false;
		fixture.userData.dynamic = true;
		fixture.userData.doorAssemblyRole = role;
		fixture.userData.depthPlaneX = position[0];
		secureDoor.add(fixture);
		return fixture;
	};
	attachDoorFixture("gun-range-test-bay-door-edge-north", [
		0,
		0,
		-3.86
	], [
		.7,
		6.5,
		.12
	], doorStatusRangeMaterial, "edge");
	attachDoorFixture("gun-range-test-bay-door-edge-south", [
		0,
		0,
		3.86
	], [
		.7,
		6.5,
		.12
	], doorStatusBayMaterial, "edge");
	attachDoorFixture("gun-range-test-bay-door-armour-range-face", [
		-.358,
		.12,
		0
	], [
		.008,
		4.9,
		5.8
	], secureDoorPanelMaterial, "armour-panel");
	attachDoorFixture("gun-range-test-bay-door-armour-bay-face", [
		.358,
		.12,
		0
	], [
		.008,
		4.9,
		5.8
	], secureDoorPanelMaterial, "armour-panel");
	for (const [face, sign] of [["range", -1], ["bay", 1]]) {
		const braceX = sign * .37;
		const spineX = sign * .382;
		const detailX = sign * .394;
		const emissiveX = sign * .406;
		const emissiveSecondaryX = sign * .418;
		attachDoorFixture(`gun-range-test-bay-door-brace-${face}-upper`, [
			braceX,
			1.72,
			0
		], [
			.008,
			.18,
			6.25
		], secureDoorMaterial, "brace");
		attachDoorFixture(`gun-range-test-bay-door-brace-${face}-lower`, [
			braceX,
			-1.52,
			0
		], [
			.008,
			.18,
			6.25
		], secureDoorMaterial, "brace");
		attachDoorFixture(`gun-range-test-bay-door-spine-${face}`, [
			spineX,
			.12,
			0
		], [
			.008,
			4.9,
			.34
		], doorInlayMaterial, "brace");
		for (const [vertical, y] of [["upper", 1.72], ["lower", -1.48]]) for (const [side, z] of [["north", -2.42], ["south", 2.42]]) attachDoorFixture(`gun-range-test-bay-door-armour-tile-${face}-${vertical}-${side}`, [
			detailX,
			y,
			z
		], [
			.008,
			1.12,
			1.18
		], doorArmourPlateMaterial, "armour-panel");
		for (const [side, z] of [["north", -1.42], ["south", 1.42]]) attachDoorFixture(`gun-range-test-bay-door-glass-${face}-${side}`, [
			detailX,
			.28,
			z
		], [
			.008,
			2.65,
			.62
		], doorGlassMaterial, "glass");
		const chevronUpper = attachDoorFixture(`gun-range-test-bay-door-chevron-${face}-upper`, [
			emissiveSecondaryX,
			.55,
			0
		], [
			.008,
			.13,
			3.2
		], face === "range" ? doorStatusRangeMaterial : doorStatusBayMaterial, "glyph");
		chevronUpper.rotation.x = Math.PI / 7;
		const chevronLower = attachDoorFixture(`gun-range-test-bay-door-chevron-${face}-lower`, [
			emissiveX,
			.55,
			0
		], [
			.008,
			.13,
			3.2
		], face === "range" ? doorStatusRangeMaterial : doorStatusBayMaterial, "glyph");
		chevronLower.rotation.x = -Math.PI / 7;
	}
	attachDoorFixture("gun-range-test-bay-door-status-range-face", [
		-.406,
		-2.3,
		0
	], [
		.008,
		.82,
		1.45
	], doorStatusRangeMaterial, "status-light");
	attachDoorFixture("gun-range-test-bay-door-status-bay-face", [
		.406,
		-2.3,
		0
	], [
		.008,
		.82,
		1.45
	], doorStatusBayMaterial, "status-light");
	doorAssembly.userData.statusLightMaterials = Object.freeze([doorStatusRangeMaterial, doorStatusBayMaterial]);
	const practicalHousing = box(builder, "gun-range-test-bay-door-practical-housing", [
		51.12,
		6.78,
		12
	], [
		.12,
		.42,
		2.6
	], secureDoorMaterial, {
		solid: false,
		shots: false,
		cast: false
	});
	practicalHousing.userData.doorAssemblyRole = "practical-housing";
	practicalHousing.userData.presentationBatchCandidate = false;
	doorAssembly.add(practicalHousing);
	const practicalEmitter = box(builder, "gun-range-test-bay-door-practical-emitter", [
		51.04,
		6.7,
		12
	], [
		.04,
		.16,
		1.9
	], testBayCyan, {
		solid: false,
		shots: false,
		cast: false
	});
	practicalEmitter.userData.doorAssemblyRole = "practical-emitter";
	practicalEmitter.userData.practicalId = "test-bay-door-approach-key";
	practicalEmitter.userData.presentationBatchCandidate = false;
	doorAssembly.add(practicalEmitter);
	const bayPracticalHousing = box(builder, "gun-range-test-bay-door-bay-practical-housing", [
		52.02,
		6.78,
		12
	], [
		.12,
		.42,
		2.6
	], secureDoorMaterial, {
		solid: false,
		shots: false,
		cast: false
	});
	bayPracticalHousing.userData.doorAssemblyRole = "practical-housing";
	bayPracticalHousing.userData.presentationBatchCandidate = false;
	doorAssembly.add(bayPracticalHousing);
	const bayPracticalEmitter = box(builder, "gun-range-test-bay-door-bay-practical-emitter", [
		52.1,
		6.7,
		12
	], [
		.04,
		.16,
		1.9
	], testBayAmber, {
		solid: false,
		shots: false,
		cast: false
	});
	bayPracticalEmitter.userData.doorAssemblyRole = "practical-emitter";
	bayPracticalEmitter.userData.practicalId = "test-bay-door-bay-key";
	bayPracticalEmitter.userData.presentationBatchCandidate = false;
	doorAssembly.add(bayPracticalEmitter);
	doorAssembly.userData.fixtureIds = Object.freeze([
		"gun-range-test-bay-door-rail-north",
		"gun-range-test-bay-door-rail-south",
		"gun-range-test-bay-door-practical-housing",
		"gun-range-test-bay-door-practical-emitter",
		"gun-range-test-bay-door-bay-practical-housing",
		"gun-range-test-bay-door-bay-practical-emitter"
	]);
	for (const z of [
		-19,
		-7,
		5,
		17,
		29
	]) box(builder, "gun-range-test-bay-ceiling-light", [
		75.5,
		25.02,
		z
	], [
		35,
		.12,
		.3
	], z % 2 === 0 ? testBayAmber : testBayCyan, {
		solid: false,
		shots: false,
		cast: false
	});
	for (const x of [
		59,
		67,
		75,
		83,
		91,
		99
	]) {
		const grid = box(builder, "gun-range-test-bay-floor-grid-x", [
			x,
			.023,
			6
		], [
			.11,
			.046,
			62
		], x % 2 === 0 ? testBayAmber : testBayCyan, {
			solid: false,
			shots: false,
			cast: false
		});
		grid.userData.presentationBatchCandidate = false;
	}
	for (const z of [
		-20,
		-10,
		0,
		10,
		20,
		30
	]) {
		const grid = box(builder, "gun-range-test-bay-floor-grid-z", [
			75.75,
			.024,
			z
		], [
			47,
			.048,
			.11
		], z % 20 === 0 ? testBayAmber : testBayCyan, {
			solid: false,
			shots: false,
			cast: false
		});
		grid.userData.presentationBatchCandidate = false;
	}
	const testBaySign = rangeSign("SECURE SYSTEMS TEST BAY", 5496536, "gun-range-test-bay-sign", [13.5, .95]);
	if (testBaySign) {
		testBaySign.position.set(52.15, 6.65, 12);
		testBaySign.rotation.y = -Math.PI / 2;
		if (!Array.isArray(testBaySign.material)) testBaySign.material.side = 0;
		root.add(testBaySign);
	}
	const supportSign = rangeSign("ALL SUPPORT SYSTEMS", 15774283, "gun-range-test-bay-support-sign", [11.5, .82]);
	if (supportSign) {
		supportSign.position.set(99.85, 6.6, 6);
		supportSign.rotation.y = -Math.PI / 2;
		if (!Array.isArray(supportSign.material)) supportSign.material.side = 0;
		root.add(supportSign);
	}
	for (const [index, station] of GUN_RANGE_TEST_BAY_CONTRACT.supportStations.entries()) {
		const pad = box(builder, `gun-range-test-bay-support-pad-${station.id}`, [
			station.position.x,
			.06,
			station.position.z
		], [
			5.6,
			.12,
			5.6
		], index % 2 === 0 ? testBayAmber : testBayCyan, {
			solid: false,
			shots: false,
			cast: false
		});
		pad.userData.supportId = station.id;
		pad.userData.runtimeStatus = station.runtimeStatus;
	}
	for (const [index, station] of GUN_RANGE_TEST_BAY_CONTRACT.weaponStations.entries()) {
		const marker = box(builder, `gun-range-test-bay-weapon-marker-${station.id}`, [
			station.position.x,
			.055,
			station.position.z
		], [
			4.8,
			.11,
			.5
		], index % 2 === 0 ? testBayCyan : testBayAmber, {
			solid: false,
			shots: false,
			cast: false
		});
		marker.userData.weaponId = station.id;
		marker.userData.runtimeStatus = station.runtimeStatus;
		const weapon = WEAPONS[station.id];
		const label = rangeSign(weapon.name.toUpperCase(), weapon.color, `gun-range-test-bay-weapon-label-${station.id}`, [5.2, .7]);
		if (label) {
			label.position.set(0, .72, -1.05);
			label.rotation.x = -Math.PI * .08;
			label.userData.weaponId = station.id;
			label.userData.canonicalWeaponName = weapon.name;
			marker.add(label);
		}
	}
	const testDummyPresentations = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map((definition, index) => gunRangeTrainingDummy(builder, targets, definition, index));
	root.userData.gunRangeTestDummies = testDummyPresentations;
	root.userData.gunRangeTestBayWeaponLabels = Object.freeze(GUN_RANGE_TEST_BAY_CONTRACT.weaponStations.map((station) => Object.freeze({
		id: station.id,
		name: WEAPONS[station.id].name,
		objectName: `gun-range-test-bay-weapon-label-${station.id}`
	})));
	root.userData.gunRangeTestBayContract = GUN_RANGE_TEST_BAY_CONTRACT;
	root.userData.gunRangeTestBayRuntime = Object.freeze({
		structure: "implemented",
		slowUnarmedTargets: "implemented",
		doorHelper: "integrated-by-main-runtime",
		supportActivation: "host-authoritative-training-integration",
		weaponInteraction: "canonical-training-integration"
	});
	for (const z of [
		-41,
		-31,
		-21,
		-11,
		-1,
		9,
		17
	]) box(builder, "gun-range-acoustic-baffle", [
		0,
		6.35,
		z
	], [
		37,
		.32,
		1.15
	], acoustic, {
		solid: false,
		shots: false,
		cast: false
	});
	for (const side of [-1, 1]) {
		box(builder, "gun-range-ventilation-duct", [
			side * 17.7,
			5.7,
			-17
		], [
			2.1,
			1.25,
			51
		], dark, {
			solid: false,
			shots: false,
			cast: false
		});
		for (const z of [
			-38,
			-24,
			-10,
			4,
			15
		]) box(builder, "gun-range-vent-grille", [
			side * 16.62,
			5.7,
			z
		], [
			.08,
			.8,
			3.4
		], acoustic, {
			solid: false,
			shots: false,
			cast: false
		});
	}
	for (const z of [
		-42,
		-32,
		-22,
		-12,
		-2,
		8,
		16
	]) {
		box(builder, "gun-range-ceiling-light", [
			0,
			6.82,
			z
		], [
			18,
			.08,
			.28
		], lamp, {
			solid: false,
			shots: false,
			cast: false
		});
		const light = new PointLight(z > 1 ? 16766362 : 13169663, z > 1 ? 13 : 10, 17, 2.1);
		light.name = "gun-range-interior-light";
		light.position.set(z % 4 === 0 ? -7 : 7, 5.9, z);
		light.castShadow = false;
		light.userData.presentationOnly = true;
		makeEmissiveOnly(light);
		root.add(light);
	}
	const ambient = new HemisphereLight(15925247, 5202538, 1.24);
	ambient.name = "gun-range-moderate-ambient";
	ambient.userData.presentationOnly = true;
	root.add(ambient);
	const neonMaterials = [];
	const neonLights = [];
	for (const [index, z] of [
		-37,
		-21,
		-5,
		11
	].entries()) {
		const material = new MeshStandardMaterial({
			color: 5695455,
			emissive: 5695455,
			emissiveIntensity: 1.55,
			roughness: .22,
			metalness: .28
		});
		material.name = `GunRange_CyclingNeon_${index}`;
		neonMaterials.push(material);
		for (const side of [-1, 1]) box(builder, "gun-range-cycling-neon-strip", [
			side * 19.88,
			4.65,
			z
		], [
			.08,
			.16,
			7.2
		], material, {
			solid: false,
			shots: false,
			cast: false
		});
		const light = new PointLight(5695455, 2.8, 13, 2.2);
		light.name = "gun-range-cycling-neon-light";
		light.position.set(index % 2 === 0 ? -12 : 12, 4.8, z);
		light.userData.presentationOnly = true;
		light.userData.neonIndex = index;
		makeEmissiveOnly(light);
		neonLights.push(light);
		root.add(light);
	}
	const perimeterNeon = neonMaterials[1];
	for (const side of [-1, 1]) {
		box(builder, "gun-range-floor-neon-strip", [
			side * 19.55,
			.12,
			-14
		], [
			.34,
			.14,
			60
		], perimeterNeon, {
			solid: false,
			shots: false,
			cast: false
		});
		box(builder, "gun-range-ceiling-neon-strip", [
			side * 19.55,
			6.68,
			-14
		], [
			.34,
			.14,
			60
		], perimeterNeon, {
			solid: false,
			shots: false,
			cast: false
		});
	}
	for (const [index, z] of [
		-37,
		-21,
		-5,
		11
	].entries()) box(builder, "gun-range-ceiling-neon-rib", [
		0,
		6.69,
		z
	], [
		29,
		.1,
		.22
	], neonMaterials[index], {
		solid: false,
		shots: false,
		cast: false
	});
	root.userData.gunRangeNeonMaterials = neonMaterials;
	root.userData.gunRangeNeonLights = neonLights;
	box(builder, "gun-range-control-room", [
		-16.5,
		2.1,
		15.5
	], [
		6.2,
		4.2,
		6.2
	], wall, { ballisticMaterial: "interior-wall" });
	box(builder, "gun-range-control-window", [
		-13.34,
		2.5,
		15.2
	], [
		.08,
		2,
		3.6
	], new MeshStandardMaterial({
		color: 7780549,
		emissive: 665392,
		emissiveIntensity: .5,
		roughness: .18,
		metalness: .1,
		transparent: true,
		opacity: .52
	}), {
		solid: false,
		shots: false
	});
	box(builder, "gun-range-ready-bench", [
		16.2,
		.62,
		15.4
	], [
		6.4,
		1.05,
		2.1
	], timber);
	box(builder, "gun-range-ready-lockers", [
		18.5,
		2.35,
		8.4
	], [
		2.8,
		4.6,
		5.8
	], acoustic, { ballisticMaterial: "structural-metal" });
	for (const x of [
		-15,
		-9,
		-3,
		3,
		9,
		15
	]) {
		box(builder, "gun-range-booth-divider", [
			x,
			1.45,
			4.2
		], [
			.16,
			2.9,
			5.5
		], dark);
		box(builder, "gun-range-booth-safety-lamp", [
			x,
			3.35,
			4.2
		], [
			.18,
			.18,
			1.1
		], redSafety, {
			solid: false,
			shots: false
		});
	}
	box(builder, "gun-range-firing-line", [
		0,
		.05,
		GUN_RANGE_FIRING_LINE_Z
	], [
		40,
		.1,
		.5
	], safety, {
		solid: false,
		shots: false
	});
	builder.physicsColliders.push({ ...GUN_RANGE_FIRING_LINE_BARRIER });
	for (const z of [
		-9,
		-22,
		-35
	]) box(builder, "gun-range-distance-stripe", [
		0,
		.035,
		z
	], [
		40,
		.06,
		.22
	], safety, {
		solid: false,
		shots: false
	});
	for (const [band, z, score] of [
		[
			"near",
			-10,
			100
		],
		[
			"mid",
			-23,
			200
		],
		[
			"far",
			-36,
			300
		]
	]) for (const x of [
		-7,
		0,
		7
	]) rangeTarget(builder, targets, `${band}-${x}`, x, z, score, band);
	const movingTargetSign = rangeSign("MOVING 250 PTS", 16041039, "gun-range-moving-score-sign", [4.2, .72]);
	if (movingTargetSign) {
		movingTargetSign.position.set(16.2, 2.75, -29);
		root.add(movingTargetSign);
	}
	box(builder, "gun-range-lateral-target-rail", [
		0,
		3.02,
		-29
	], [
		25,
		.12,
		.16
	], dark, {
		solid: false,
		shots: false,
		cast: false
	});
	lateralRangeTarget(builder, targets, "lateral-cyan", -6.2, -29, 0, 5695455);
	lateralRangeTarget(builder, targets, "lateral-amber", 6.2, -29, Math.PI, 16757575);
	const wallbangPanels = [
		{
			x: -17.1,
			label: "GLASS 8 CM",
			material: "glass",
			thickness: .08,
			render: new MeshStandardMaterial({
				color: 9227218,
				transparent: true,
				opacity: .34,
				roughness: .16,
				metalness: .04
			})
		},
		{
			x: -14.7,
			label: "WOOD 24 CM",
			material: "wood",
			thickness: .24,
			render: timber
		},
		{
			x: -12.3,
			label: "PLASTER 42 CM",
			material: "interior-wall",
			thickness: .42,
			render: wall
		},
		{
			x: -9.9,
			label: "BRICK 70 CM",
			material: "brick",
			thickness: .7,
			render: standard(7620664, .93, .04)
		}
	];
	for (const [index, panel] of wallbangPanels.entries()) {
		box(builder, `gun-range-wallbang-panel-${panel.material}`, [
			panel.x,
			1.45,
			-7.6
		], [
			2.05,
			2.9,
			panel.thickness
		], panel.render, {
			solid: false,
			shots: true,
			ballisticMaterial: panel.material
		});
		rangeTarget(builder, targets, `wallbang-${panel.material}`, panel.x, -12.4, 50, "near");
		const label = rangeSign(panel.label, index === 0 ? 7986406 : 14723639, `gun-range-wallbang-label-${panel.material}`, [2.05, .55]);
		if (label) {
			label.position.set(panel.x, 3.35, -7.5);
			root.add(label);
		}
	}
	box(builder, "gun-range-wallbang-lab-left", [
		-18.45,
		1.6,
		-8.8
	], [
		.18,
		3.2,
		9.8
	], dark, { ballisticMaterial: "structural-metal" });
	box(builder, "gun-range-wallbang-lab-right", [
		-8.55,
		1.6,
		-8.8
	], [
		.18,
		3.2,
		9.8
	], dark, { ballisticMaterial: "structural-metal" });
	const wallbangHeader = rangeSign("WALLBANG TEST · MATERIAL / THICKNESS", 14723639, "gun-range-wallbang-header", [8.8, .72]);
	if (wallbangHeader) {
		wallbangHeader.position.set(-13.5, 4.45, -5.25);
		root.add(wallbangHeader);
	}
	flyingBlackCat(targets, root);
	for (const station of GUN_RANGE_WEAPON_STATIONS) {
		const accent = new MeshStandardMaterial({
			color: WEAPONS[station.weapon].color,
			emissive: WEAPONS[station.weapon].color,
			emissiveIntensity: .34,
			roughness: .48,
			metalness: .32
		});
		box(builder, "gun-range-weapon-bench", [
			station.position.x,
			.62,
			station.position.z
		], [
			4.6,
			1.05,
			1.35
		], timber);
		box(builder, `gun-range-station-accent-${station.weapon}`, [
			station.position.x,
			1.17,
			station.position.z + .55
		], [
			4.2,
			.09,
			.15
		], accent, {
			solid: false,
			shots: false
		});
		const stationRoot = new Group();
		stationRoot.name = `gun-range-weapon-station-${station.weapon}`;
		stationRoot.position.set(station.position.x, station.position.y, station.position.z);
		stationRoot.userData.stationId = station.id;
		stationRoot.userData.weapon = station.weapon;
		stationRoot.userData.label = `${station.label} / ${WEAPONS[station.weapon].name}`;
		stationRoot.userData.rackPresentationSource = "fail-closed-unloaded";
		const label = rangeSign(`${station.label} · ${WEAPONS[station.weapon].name.toUpperCase()}`, WEAPONS[station.weapon].color, `gun-range-station-label-${station.weapon}`, [4.15, .62]);
		if (label) {
			label.position.set(0, .78, .65);
			stationRoot.add(label);
		}
		const stationLight = new PointLight(WEAPONS[station.weapon].color, 5.5, 7, 2);
		stationLight.name = "gun-range-armory-light";
		stationLight.position.set(0, 2.2, .6);
		stationLight.userData.presentationOnly = true;
		makeEmissiveOnly(stationLight);
		stationRoot.add(stationLight);
		root.add(stationRoot);
	}
	root.userData.gunRangeRackPresentation = Object.freeze({
		status: "unloaded",
		required: GUN_RANGE_WEAPON_STATIONS.length,
		ready: 0,
		source: "fail-closed",
		error: null
	});
	box(builder, "gun-range-armory-header", [
		0,
		3.8,
		9.45
	], [
		32,
		1.15,
		.25
	], dark, {
		solid: false,
		shots: false
	});
	box(builder, "gun-range-live-fire-sign", [
		0,
		4.45,
		1
	], [
		12,
		.75,
		.22
	], redSafety, {
		solid: false,
		shots: false
	});
	root.getObjectByName("gun-range-armory-header").userData.label = "CHOOSE A WEAPON · PRESS F";
	root.getObjectByName("gun-range-live-fire-sign").userData.label = "LIVE FIRE · EYES AND EARS";
	const armorySign = rangeSign("ARMORY · PICK UP WITH F", 5825500, "gun-range-armory-sign-text", [13.5, .95]);
	if (armorySign) {
		armorySign.position.set(0, 3.8, 9.59);
		root.add(armorySign);
	}
	const liveFireSign = rangeSign("LIVE FIRE · EYES AND EARS", 16741983, "gun-range-live-fire-sign-text", [10.5, .82]);
	if (liveFireSign) {
		liveFireSign.position.set(0, 4.45, 1.13);
		root.add(liveFireSign);
	}
	root.userData.gunRangePresentationBatches = batchPresentationOnlyBoxes(root, "gun-range");
	return {
		id: "gun-range",
		label: "Indoor Gun Range",
		root,
		colliders: builder.colliders,
		physicsColliders: builder.physicsColliders,
		raycastMeshes: builder.raycastMeshes,
		shotSurfaces: builder.shotSurfaces,
		spawns: spawnRecord([
			[0, 16.5],
			[-8, 16.5],
			[8, 16.5]
		], [
			[0, 16.5],
			[-8, 16.5],
			[8, 16.5]
		]),
		patrolPoints: [],
		targets,
		houses: [],
		breakableWindows: [],
		physicalCover: [],
		bounds: {
			minX: -20,
			maxX: 100,
			minZ: -48,
			maxZ: 38
		},
		houseTelemetry: emptyTelemetry()
	};
}
/** Slow colour motion adds life without strobing or changing gameplay light authority. */
function updateGunRangePresentation(root, nowMs) {
	const materials = root.userData.gunRangeNeonMaterials;
	const lights = root.userData.gunRangeNeonLights;
	if (!materials || !lights) return;
	materials.forEach((material, index) => {
		const hue = (nowMs / 18e3 + index * .17) % 1;
		material.color.setHSL(hue, .68, .58);
		material.emissive.copy(material.color);
	});
	lights.forEach((light, index) => {
		light.color.copy(materials[index % materials.length].color);
	});
	const bayMaterial = root.userData.gunRangeBayLightMaterial;
	if (bayMaterial) bayMaterial.emissiveIntensity = 3.7 + (Math.sin(nowMs * 62e-5) * .5 + .5) * .9;
	root.userData.gunRangeLateralTargets?.forEach((target) => {
		const phase = nowMs / 1e3 * Math.PI * 2 * Number(target.userData.lateralFrequencyHz) + Number(target.userData.lateralPhaseRadians);
		target.position.x = Number(target.userData.lateralOriginX) + Math.sin(phase) * Number(target.userData.lateralAmplitudeM);
	});
	root.userData.gunRangeTestDummies?.forEach(({ root: dummy, definition, riggedOperator }, index) => {
		const pose = gunRangeTestBayRenderedDummyPose(definition, index, nowMs);
		dummy.position.set(pose.position.x, pose.position.y, pose.position.z);
		dummy.rotation.y = pose.yawRadians;
		if (riggedOperator) {
			poseOperator(riggedOperator, "stand", definition.speedMps, nowMs * .008 + index, Math.min(1, .016 * 24), 0, .016);
			return;
		}
		const arms = [dummy.getObjectByName(`gun-range-${definition.id}-arm--1`), dummy.getObjectByName(`gun-range-${definition.id}-arm-1`)];
		const legs = [dummy.getObjectByName(`gun-range-${definition.id}-leg--1`), dummy.getObjectByName(`gun-range-${definition.id}-leg-1`)];
		const stride = Math.sin(nowMs * .0045 + index * .8) * .26;
		arms.forEach((limb, limbIndex) => {
			if (limb) limb.rotation.x = limbIndex === 0 ? stride : -stride;
		});
		legs.forEach((limb, limbIndex) => {
			if (limb) limb.rotation.x = limbIndex === 0 ? -stride : stride;
		});
	});
}
function terminalWayfindingMaterial(title, subtitle, accent) {
	if (typeof document === "undefined") return new MeshStandardMaterial({
		color: 404029,
		roughness: .32,
		metalness: .52
	});
	const canvas = document.createElement("canvas");
	canvas.width = 1024;
	canvas.height = 192;
	const context = canvas.getContext("2d");
	if (!context) return standard(1515814, .48, .36);
	const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
	gradient.addColorStop(0, "#031d31");
	gradient.addColorStop(.62, "#083f54");
	gradient.addColorStop(1, "#071523");
	context.fillStyle = gradient;
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = accent;
	context.fillRect(0, 0, 34, canvas.height);
	context.fillRect(0, canvas.height - 16, canvas.width, 16);
	context.fillStyle = "#f4fdff";
	context.font = "900 66px sans-serif";
	context.textAlign = "left";
	context.textBaseline = "middle";
	context.fillText(title, 62, 76);
	context.fillStyle = "#a9f4ff";
	context.font = "700 30px sans-serif";
	context.fillText(subtitle, 64, 142);
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	return new MeshBasicMaterial({
		map: texture,
		toneMapped: false
	});
}
function terminalSurfaceTexture(pattern, base, accent, repeat) {
	if (typeof document === "undefined") return null;
	const canvas = document.createElement("canvas");
	canvas.width = 256;
	canvas.height = 256;
	const context = canvas.getContext("2d");
	if (!context) return null;
	context.fillStyle = base;
	context.fillRect(0, 0, 256, 256);
	context.strokeStyle = accent;
	context.fillStyle = accent;
	if (pattern === "terrazzo" || pattern === "asphalt" || pattern === "concrete") {
		const count = pattern === "terrazzo" ? 170 : pattern === "concrete" ? 110 : 260;
		for (let index = 0; index < count; index += 1) {
			const x = (index * 73 + 19) % 256;
			const y = (index * 151 + 47) % 256;
			const radius = pattern === "terrazzo" ? 1 + index % 3 : pattern === "concrete" ? .8 + index % 2 : .6 + index % 2;
			context.globalAlpha = pattern === "terrazzo" ? .34 : pattern === "concrete" ? .16 : .2;
			context.fillRect(x, y, radius, radius);
		}
		context.globalAlpha = 1;
	} else if (pattern === "panel") {
		context.globalAlpha = .34;
		context.lineWidth = 2;
		for (let x = 0; x <= 256; x += 64) {
			context.beginPath();
			context.moveTo(x, 0);
			context.lineTo(x, 256);
			context.stroke();
		}
		for (let y = 0; y <= 256; y += 128) {
			context.beginPath();
			context.moveTo(0, y);
			context.lineTo(256, y);
			context.stroke();
		}
		context.globalAlpha = 1;
	} else if (pattern === "rubber" || pattern === "fabric") {
		context.globalAlpha = pattern === "fabric" ? .24 : .3;
		context.lineWidth = 1;
		for (let offset = -256; offset < 512; offset += pattern === "fabric" ? 12 : 20) {
			context.beginPath();
			context.moveTo(offset, 0);
			context.lineTo(offset + 256, 256);
			context.stroke();
			if (pattern === "fabric") {
				context.beginPath();
				context.moveTo(offset + 256, 0);
				context.lineTo(offset, 256);
				context.stroke();
			}
		}
		context.globalAlpha = 1;
	} else if (pattern === "aircraft") {
		context.globalAlpha = .32;
		context.lineWidth = 2;
		for (let x = 0; x <= 256; x += 64) {
			context.beginPath();
			context.moveTo(x, 0);
			context.lineTo(x, 256);
			context.stroke();
		}
		for (let y = 32; y < 256; y += 64) {
			context.beginPath();
			context.moveTo(0, y);
			context.lineTo(256, y);
			context.stroke();
			for (let x = 12; x < 256; x += 32) context.fillRect(x, y - 1, 2, 2);
		}
		context.globalAlpha = 1;
	} else if (pattern === "cargo") {
		context.globalAlpha = .32;
		context.lineWidth = 5;
		for (let x = 10; x < 256; x += 24) {
			context.beginPath();
			context.moveTo(x, 0);
			context.lineTo(x, 256);
			context.stroke();
		}
		context.globalAlpha = 1;
	} else if (pattern === "timber") {
		context.globalAlpha = .28;
		context.lineWidth = 2;
		for (let y = 16; y < 256; y += 24) {
			context.beginPath();
			context.moveTo(0, y);
			context.bezierCurveTo(58, y - 6, 126, y + 7, 256, y - 2);
			context.stroke();
		}
		context.globalAlpha = 1;
	}
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = RepeatWrapping;
	texture.wrapT = RepeatWrapping;
	texture.repeat.set(...repeat);
	texture.needsUpdate = true;
	return texture;
}
function terminalSurfaceMaterial(pattern, color, accent, roughness, metalness, repeat) {
	const material = new MeshStandardMaterial({
		color,
		roughness,
		metalness
	});
	material.userData.assetOwner = "skyline-terminal";
	material.userData.assetKind = "runtime-generated-surface";
	material.userData.surfacePattern = pattern;
	const texture = terminalSurfaceTexture(pattern, `#${color.toString(16).padStart(6, "0")}`, accent, repeat);
	if (texture) material.map = texture;
	return material;
}
function prismGeometryXZ(points, thickness) {
	const half = thickness / 2;
	const positions = [];
	const uvs = [];
	const minimumX = Math.min(...points.map(([x]) => x));
	const maximumX = Math.max(...points.map(([x]) => x));
	const minimumZ = Math.min(...points.map(([, z]) => z));
	const maximumZ = Math.max(...points.map(([, z]) => z));
	const extentX = Math.max(Number.EPSILON, maximumX - minimumX);
	const extentZ = Math.max(Number.EPSILON, maximumZ - minimumZ);
	const indices = [];
	for (const y of [-half, half]) for (const [x, z] of points) {
		positions.push(x, y, z);
		uvs.push((x - minimumX) / extentX, (z - minimumZ) / extentZ);
	}
	const count = points.length;
	for (let index = 1; index < count - 1; index += 1) {
		indices.push(0, index + 1, index);
		indices.push(count, count + index, count + index + 1);
	}
	for (let index = 0; index < count; index += 1) {
		const next = (index + 1) % count;
		indices.push(index, next, count + next, index, count + next, count + index);
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
	geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}
function buildSkylineTerminal(scene) {
	const root = new Group();
	root.name = "Skyline Terminal arena";
	scene.add(root);
	const builder = {
		root,
		colliders: [],
		physicsColliders: [],
		raycastMeshes: [],
		shotSurfaces: [],
		ballisticSurfaceSequence: 0
	};
	const tarmacMat = terminalSurfaceMaterial("concrete", 7831424, "#aeb5b4", .78, .06, [5, 5]);
	const floorMat = terminalSurfaceMaterial("terrazzo", 14477545, "#4f8791", .34, .2, [5, 5]);
	const wallMat = terminalSurfaceMaterial("panel", 15002860, "#7899a1", .4, .42, [6, 3]);
	const trimMat = standard(9350065, .3, .7);
	const glassMat = new MeshStandardMaterial({
		color: 7920102,
		roughness: .2,
		metalness: .08,
		transparent: true,
		opacity: .46,
		depthWrite: false
	});
	const planeHullMat = terminalSurfaceMaterial("aircraft", 15857396, "#7697a0", .24, .46, [8, 2]);
	const planeWingMat = terminalSurfaceMaterial("panel", 13162200, "#55717a", .3, .68, [4, 2]);
	const engineMat = standard(1454914, .24, .78);
	const jetbridgeMat = terminalSurfaceMaterial("panel", 12177619, "#3f7781", .34, .62, [5, 2]);
	const kioskMat = standard(555917, .42, .36);
	const cargoMat = terminalSurfaceMaterial("cargo", 5533570, "#b8dce1", .6, .38, [3, 2]);
	const palletMat = terminalSurfaceMaterial("timber", 9068604, "#c49a67", .82, .02, [3, 2]);
	const hazardMat = standard(15113010, .42, .36);
	const floorBorderMat = standard(1588042, .34, .46);
	const floorInsetMat = new MeshStandardMaterial({
		color: 1468793,
		roughness: .38,
		metalness: .38,
		emissive: 408135,
		emissiveIntensity: .52
	});
	const wallLowerMat = standard(11322311, .46, .4);
	const structureMat = standard(4746101, .3, .72);
	const rubberMat = terminalSurfaceMaterial("rubber", 1514527, "#536063", .92, .04, [4, 4]);
	const seatMat = terminalSurfaceMaterial("fabric", 555654, "#8ef2f0", .7, .08, [4, 4]);
	const cockpitGlassMat = new MeshStandardMaterial({
		color: 6866644,
		roughness: .14,
		metalness: .16,
		transparent: true,
		opacity: .34,
		depthWrite: false,
		side: 2
	});
	cockpitGlassMat.name = "skyline-cockpit-glass-material";
	const flightScreenMat = new MeshStandardMaterial({
		color: 1195339,
		roughness: .34,
		metalness: .24,
		emissive: 947591,
		emissiveIntensity: .8
	});
	flightScreenMat.name = "skyline-flight-screen-material";
	const planeStripeMat = standard(690585, .32, .52);
	const stainMat = standard(1055523, 1, 0);
	const practicalMat = new MeshStandardMaterial({
		color: 14286079,
		roughness: .24,
		metalness: .08,
		emissive: 5037034,
		emissiveIntensity: 1.9
	});
	const magentaPracticalMat = new MeshStandardMaterial({
		color: 16766195,
		roughness: .26,
		metalness: .1,
		emissive: 14826138,
		emissiveIntensity: 1.45
	});
	const ivoryPanelMat = terminalSurfaceMaterial("panel", 15922673, "#9bb1b4", .28, .42, [8, 4]);
	const soffitMat = new MeshStandardMaterial({
		color: 15134702,
		roughness: .58,
		metalness: .24,
		emissive: 1055002,
		emissiveIntensity: .12
	});
	const skylineClusterIds = [
		"floor-language",
		"wall-structure",
		"escalator-detail",
		"window-frame",
		"aircraft-skin",
		"apron-marking",
		"terminal-story",
		"concourse-cover",
		"boarding-route",
		"quality-aircraft",
		"service-equipment"
	];
	const detailBox = (cluster, name, position, size, material, detail = "performance", rotation, cast = false) => {
		const mesh = box(builder, name, position, size, material, {
			solid: false,
			shots: false,
			detail,
			rotation,
			cast
		});
		mesh.userData.skylineCluster = cluster;
		mesh.userData.assetOwner = "skyline-terminal";
		return mesh;
	};
	const detailMesh = (cluster, name, geometry, material, position, rotation = [
		0,
		0,
		0
	], detail = "quality", cast = true) => {
		const mesh = new Mesh(geometry, material);
		mesh.name = name;
		mesh.position.set(...position);
		mesh.rotation.set(...rotation);
		mesh.castShadow = cast;
		mesh.receiveShadow = true;
		mesh.userData.presentationOnly = true;
		mesh.userData.blocksShots = false;
		mesh.userData.rustworksDetail = detail;
		mesh.userData.skylineCluster = cluster;
		mesh.userData.assetOwner = "skyline-terminal";
		mesh.raycast = () => void 0;
		root.add(mesh);
		return mesh;
	};
	const qualityPlaceholderBox = (name, position, size, material, collisionAuthorityId) => {
		const mesh = box(builder, name, position, size, material.clone());
		mesh.userData.skylineQualityPlaceholder = true;
		mesh.userData.skylineCollisionAuthorityId = collisionAuthorityId;
		return mesh;
	};
	const walkablePlatforms = [];
	const addWalkablePlatform = (id, presentationName, position, size, material, options = {}) => {
		const mesh = options.qualityPlaceholder ? qualityPlaceholderBox(presentationName, position, size, material, options.qualityPresentationName ?? id) : box(builder, presentationName, position, size, material);
		const bounds = builder.physicsColliders[builder.physicsColliders.length - 1];
		walkablePlatforms.push({
			id,
			presentationName,
			bounds,
			y: position[1] + size[1] / 2,
			ballisticSurfaceId: mesh.userData.ballisticSurfaceId,
			qualityPresentationName: options.qualityPresentationName
		});
		mesh.userData.skylineWalkablePlatformId = id;
		return mesh;
	};
	root.userData.skylineDetailClusters = [...skylineClusterIds];
	root.userData.skylineAssetAudit = {
		retained: [
			"terminal-shell",
			"mezzanine-routes",
			"breakable-facade",
			"jetbridge",
			"airstair",
			"apron-boundaries"
		],
		adjusted: [
			"team-aqua-spawns",
			"cabin-seat-clearance",
			"jetbridge-lighting",
			"concourse-cover",
			"open-aircraft-walkways"
		],
		qualityReplaced: [
			"fuselage-roof",
			"aircraft-nose",
			"wing-boxes",
			"engine-boxes",
			"cargo-boxes",
			"fuel-trailer-box"
		],
		generatedOriginal: [
			"runtime-surface-patterns",
			"curved-aircraft-shell",
			"airport-uld-shells",
			"luminous-terminal-canopy",
			"stacked-wood-pallets",
			"upper-kiosks"
		]
	};
	root.userData.skylineReskin = {
		version: "pass-60-total-overhaul",
		palette: "white-silver-cyan-magenta",
		routeGeometryChanged: false,
		authoritativeCeiling: true
	};
	const tarmac = new Mesh(new PlaneGeometry(76, 76), tarmacMat);
	tarmac.name = "skyline-tarmac-apron";
	tarmac.rotation.x = -Math.PI / 2;
	tarmac.position.y = 0;
	tarmac.receiveShadow = true;
	tarmac.userData.impactSurface = "concrete";
	root.add(tarmac);
	builder.raycastMeshes.push(tarmac);
	const tarmacSurface = createBallisticSurface(`${root.name}:${builder.ballisticSurfaceSequence}:tarmac`, tarmac.name, {
		minX: -36,
		maxX: 36,
		minY: -2,
		maxY: 0,
		minZ: -36,
		maxZ: 36
	}, {
		impactSurface: "concrete",
		material: "concrete"
	});
	builder.ballisticSurfaceSequence += 1;
	builder.shotSurfaces.push(tarmacSurface);
	tarmac.userData.ballisticSurfaceId = tarmacSurface.id;
	tarmac.userData.ballisticMaterial = tarmacSurface.material;
	const addPalletStack = (id, x, z, alongX) => {
		for (let level = 0; level < 4; level += 1) {
			const baseY = .13 + level * .32;
			for (const offset of [
				-2.08,
				-1.04,
				0,
				1.04,
				2.08
			]) box(builder, `skyline-wood-pallet-${id}-deck-${level}-${offset}`, alongX ? [
				x + offset,
				baseY + .09,
				z
			] : [
				x,
				baseY + .09,
				z + offset
			], alongX ? [
				.72,
				.18,
				2.6
			] : [
				2.6,
				.18,
				.72
			], palletMat);
			for (const offset of [
				-1.02,
				0,
				1.02
			]) box(builder, `skyline-wood-pallet-${id}-runner-${level}-${offset}`, alongX ? [
				x,
				baseY - .05,
				z + offset
			] : [
				x + offset,
				baseY - .05,
				z
			], alongX ? [
				5.2,
				.14,
				.24
			] : [
				.24,
				.14,
				5.2
			], palletMat);
		}
	};
	addPalletStack("west", -25, 9, true);
	addPalletStack("east", 24, 22, false);
	const apronSeamXMat = stainMat.clone();
	apronSeamXMat.name = "skyline-apron-seam-x-material";
	apronSeamXMat.polygonOffset = true;
	apronSeamXMat.polygonOffsetFactor = -1;
	apronSeamXMat.polygonOffsetUnits = -1;
	const apronEngineStainMat = stainMat.clone();
	apronEngineStainMat.name = "skyline-engine-stain-material";
	apronEngineStainMat.polygonOffset = true;
	apronEngineStainMat.polygonOffsetFactor = -1.5;
	apronEngineStainMat.polygonOffsetUnits = -1.5;
	const apronSeamZMat = stainMat.clone();
	apronSeamZMat.name = "skyline-apron-seam-z-material";
	apronSeamZMat.polygonOffset = true;
	apronSeamZMat.polygonOffsetFactor = -2;
	apronSeamZMat.polygonOffsetUnits = -2;
	const apronLeadInDarkMat = floorBorderMat.clone();
	apronLeadInDarkMat.name = "skyline-apron-lead-in-dark-material";
	apronLeadInDarkMat.polygonOffset = true;
	apronLeadInDarkMat.polygonOffsetFactor = -2.5;
	apronLeadInDarkMat.polygonOffsetUnits = -2.5;
	const tarmacStripeMat = hazardMat.clone();
	tarmacStripeMat.name = "skyline-tarmac-stripe-material";
	tarmacStripeMat.polygonOffset = true;
	tarmacStripeMat.polygonOffsetFactor = -3;
	tarmacStripeMat.polygonOffsetUnits = -3;
	const apronLeadInAmberMat = hazardMat.clone();
	apronLeadInAmberMat.name = "skyline-apron-lead-in-amber-material";
	apronLeadInAmberMat.polygonOffset = true;
	apronLeadInAmberMat.polygonOffsetFactor = -3.5;
	apronLeadInAmberMat.polygonOffsetUnits = -3.5;
	const aircraftStandNSMat = hazardMat.clone();
	aircraftStandNSMat.name = "skyline-aircraft-stand-ns-material";
	aircraftStandNSMat.polygonOffset = true;
	aircraftStandNSMat.polygonOffsetFactor = -4;
	aircraftStandNSMat.polygonOffsetUnits = -4;
	const apronGuidanceCyanMat = practicalMat.clone();
	apronGuidanceCyanMat.name = "skyline-apron-guidance-cyan-material";
	apronGuidanceCyanMat.polygonOffset = true;
	apronGuidanceCyanMat.polygonOffsetFactor = -4.5;
	apronGuidanceCyanMat.polygonOffsetUnits = -4.5;
	const apronGuidanceMagentaMat = magentaPracticalMat.clone();
	apronGuidanceMagentaMat.name = "skyline-apron-guidance-magenta-material";
	apronGuidanceMagentaMat.polygonOffset = true;
	apronGuidanceMagentaMat.polygonOffsetFactor = -4.5;
	apronGuidanceMagentaMat.polygonOffsetUnits = -4.5;
	const aircraftStandEWMat = hazardMat.clone();
	aircraftStandEWMat.name = "skyline-aircraft-stand-ew-material";
	aircraftStandEWMat.polygonOffset = true;
	aircraftStandEWMat.polygonOffsetFactor = -5;
	aircraftStandEWMat.polygonOffsetUnits = -5;
	const apronChevronMat = practicalMat.clone();
	apronChevronMat.name = "skyline-apron-chevron-material";
	apronChevronMat.polygonOffset = true;
	apronChevronMat.polygonOffsetFactor = -5.5;
	apronChevronMat.polygonOffsetUnits = -5.5;
	const apronChevronMagentaMat = magentaPracticalMat.clone();
	apronChevronMagentaMat.name = "skyline-apron-chevron-magenta-material";
	apronChevronMagentaMat.polygonOffset = true;
	apronChevronMagentaMat.polygonOffsetFactor = -5.5;
	apronChevronMagentaMat.polygonOffsetUnits = -5.5;
	const floorJointXMat = floorBorderMat.clone();
	floorJointXMat.name = "skyline-floor-joint-x-material";
	floorJointXMat.polygonOffset = true;
	floorJointXMat.polygonOffsetFactor = -1;
	floorJointXMat.polygonOffsetUnits = -1;
	const floorJointZMat = floorBorderMat.clone();
	floorJointZMat.name = "skyline-floor-joint-z-material";
	floorJointZMat.polygonOffset = true;
	floorJointZMat.polygonOffsetFactor = -3;
	floorJointZMat.polygonOffsetUnits = -3;
	const floorDarkRunnerMat = floorInsetMat.clone();
	floorDarkRunnerMat.name = "skyline-floor-dark-runner-material";
	floorDarkRunnerMat.polygonOffset = true;
	floorDarkRunnerMat.polygonOffsetFactor = -2.5;
	floorDarkRunnerMat.polygonOffsetUnits = -2.5;
	const floorBorderDecalMat = floorBorderMat.clone();
	floorBorderDecalMat.name = "skyline-floor-border-decal-material";
	floorBorderDecalMat.polygonOffset = true;
	floorBorderDecalMat.polygonOffsetFactor = -3;
	floorBorderDecalMat.polygonOffsetUnits = -3;
	const floorCyanRunnerMat = practicalMat.clone();
	floorCyanRunnerMat.name = "skyline-floor-cyan-runner-material";
	floorCyanRunnerMat.polygonOffset = true;
	floorCyanRunnerMat.polygonOffsetFactor = -4;
	floorCyanRunnerMat.polygonOffsetUnits = -4;
	const floorMagentaCrossingMat = magentaPracticalMat.clone();
	floorMagentaCrossingMat.name = "skyline-floor-magenta-crossing-material";
	floorMagentaCrossingMat.polygonOffset = true;
	floorMagentaCrossingMat.polygonOffsetFactor = -5;
	floorMagentaCrossingMat.polygonOffsetUnits = -5;
	const mezzanineCofferMat = ivoryPanelMat.clone();
	mezzanineCofferMat.name = "skyline-mezzanine-coffer-material";
	mezzanineCofferMat.polygonOffset = true;
	mezzanineCofferMat.polygonOffsetFactor = -1;
	mezzanineCofferMat.polygonOffsetUnits = -1;
	const mezzanineUnderlightMat = practicalMat.clone();
	mezzanineUnderlightMat.name = "skyline-mezzanine-underlight-material";
	mezzanineUnderlightMat.polygonOffset = true;
	mezzanineUnderlightMat.polygonOffsetFactor = -2;
	mezzanineUnderlightMat.polygonOffsetUnits = -2;
	const mezzanineUnderlightMagentaMat = magentaPracticalMat.clone();
	mezzanineUnderlightMagentaMat.name = "skyline-mezzanine-underlight-magenta-material";
	mezzanineUnderlightMagentaMat.polygonOffset = true;
	mezzanineUnderlightMagentaMat.polygonOffsetFactor = -2;
	mezzanineUnderlightMagentaMat.polygonOffsetUnits = -2;
	for (let z = -10; z <= 30; z += 10) box(builder, "skyline-tarmac-stripe", [
		0,
		.027,
		z
	], [
		1.2,
		.03,
		4
	], tarmacStripeMat, {
		solid: false,
		shots: false
	});
	for (let seamX = -28; seamX <= 28; seamX += 7) detailBox("apron-marking", `skyline-apron-seam-x-${seamX}`, [
		seamX,
		.023,
		8
	], [
		.035,
		.018,
		54
	], apronSeamXMat);
	for (let seamZ = -16; seamZ <= 32; seamZ += 8) detailBox("apron-marking", `skyline-apron-seam-z-${seamZ}`, [
		0,
		.028,
		seamZ
	], [
		68,
		.018,
		.035
	], apronSeamZMat);
	for (const [name, x, z, width, depth] of [
		[
			"north",
			0,
			-.15,
			43,
			.16
		],
		[
			"south",
			0,
			4.15,
			43,
			.16
		],
		[
			"west",
			-21.4,
			2,
			.16,
			4.45
		],
		[
			"east",
			21.4,
			2,
			.16,
			4.45
		]
	]) {
		const markingY = name === "west" || name === "east" ? .041 : .036;
		const standMat = name === "north" || name === "south" ? aircraftStandNSMat : aircraftStandEWMat;
		detailBox("apron-marking", `skyline-aircraft-stand-${name}`, [
			x,
			markingY,
			z
		], [
			width,
			.025,
			depth
		], standMat);
	}
	detailBox("apron-marking", "skyline-apron-lead-in-dark", [
		0,
		.034,
		20
	], [
		.35,
		.025,
		28
	], apronLeadInDarkMat);
	detailBox("apron-marking", "skyline-apron-lead-in-amber", [
		0,
		.049,
		20
	], [
		.12,
		.02,
		28
	], apronLeadInAmberMat);
	detailBox("apron-marking", "skyline-apron-cyan-guidance-west", [
		-6.5,
		.051,
		11
	], [
		.11,
		.024,
		46
	], apronGuidanceCyanMat);
	detailBox("apron-marking", "skyline-apron-magenta-guidance-east", [
		6.5,
		.051,
		11
	], [
		.11,
		.024,
		46
	], apronGuidanceMagentaMat);
	for (const z of [
		-8,
		2,
		12,
		22,
		32
	]) detailBox("apron-marking", `skyline-apron-gate-chevron-${z}`, [
		0,
		.054,
		z
	], [
		8.6,
		.022,
		.12
	], z === 12 ? apronChevronMagentaMat : apronChevronMat);
	for (const [z, rotationY] of [[12, .08], [-8, -.08]]) detailBox("apron-marking", `skyline-engine-stain-${z}`, [
		0,
		.041,
		z
	], [
		3.4,
		.022,
		5.2
	], apronEngineStainMat, "performance", [
		0,
		rotationY,
		0
	]);
	box(builder, "skyline-concourse-floor", [
		0,
		.02,
		-23
	], [
		60,
		.08,
		22
	], floorMat, { solid: false });
	detailBox("floor-language", "skyline-floor-dark-runner", [
		0,
		.073,
		-22.5
	], [
		5.2,
		.025,
		20.5
	], floorDarkRunnerMat);
	box(builder, "skyline-terminal-silver-ceiling", [
		0,
		7.05,
		-23
	], [
		62,
		.24,
		22.6
	], ivoryPanelMat);
	for (const z of [
		-31.5,
		-28.5,
		-25.5,
		-22.5,
		-19.5,
		-16.5,
		-13.5
	]) {
		detailBox("wall-structure", `skyline-ceiling-white-baffle-${z}`, [
			0,
			6.86,
			z
		], [
			60.2,
			.13,
			.72
		], ivoryPanelMat, "performance", void 0, true);
		detailBox("terminal-story", `skyline-ceiling-cyan-spine-${z}`, [
			0,
			6.76,
			z
		], [
			38,
			.055,
			.12
		], practicalMat);
	}
	detailBox("floor-language", "skyline-floor-cyan-runner-west", [
		-2.3,
		.091,
		-22.5
	], [
		.16,
		.022,
		20.2
	], floorCyanRunnerMat);
	detailBox("floor-language", "skyline-floor-cyan-runner-east", [
		2.3,
		.091,
		-22.5
	], [
		.16,
		.022,
		20.2
	], floorCyanRunnerMat);
	detailBox("floor-language", "skyline-floor-magenta-crossing", [
		0,
		.095,
		-20.4
	], [
		24,
		.024,
		.16
	], floorMagentaCrossingMat);
	detailBox("floor-language", "skyline-floor-window-border", [
		0,
		.08,
		-12.55
	], [
		59.2,
		.028,
		.52
	], floorBorderDecalMat);
	detailBox("floor-language", "skyline-floor-backwall-border", [
		0,
		.074,
		-33.4
	], [
		59.2,
		.028,
		.52
	], floorBorderDecalMat);
	for (let tileX = -27; tileX <= 27; tileX += 6) detailBox("floor-language", `skyline-floor-joint-x-${tileX}`, [
		tileX,
		.076,
		-23
	], [
		.025,
		.018,
		20.2
	], floorJointXMat);
	for (let tileZ = -31; tileZ <= -15; tileZ += 4) detailBox("floor-language", `skyline-floor-joint-z-${tileZ}`, [
		0,
		.084,
		tileZ
	], [
		58.5,
		.018,
		.025
	], floorJointZMat);
	addWalkablePlatform("mezzanine-back", "skyline-concourse-mezzanine", [
		0,
		3.2,
		-31.25
	], [
		52,
		.28,
		5.5
	], floorMat);
	addWalkablePlatform("mezzanine-front-center", "skyline-mezzanine-front-center", [
		0,
		3.2,
		-25.25
	], [
		36.4,
		.28,
		6.5
	], floorMat);
	addWalkablePlatform("mezzanine-front-west", "skyline-mezzanine-front-west", [
		-23.8,
		3.2,
		-25.25
	], [
		4.4,
		.28,
		6.5
	], floorMat);
	addWalkablePlatform("mezzanine-front-east", "skyline-mezzanine-front-east", [
		23.8,
		3.2,
		-25.25
	], [
		4.4,
		.28,
		6.5
	], floorMat);
	detailBox("wall-structure", "skyline-mezzanine-soffit-back", [
		0,
		3.035,
		-31.25
	], [
		51.4,
		.035,
		4.95
	], soffitMat);
	detailBox("wall-structure", "skyline-mezzanine-soffit-center", [
		0,
		3.035,
		-25.25
	], [
		35.9,
		.035,
		5.95
	], soffitMat);
	detailBox("wall-structure", "skyline-mezzanine-soffit-west", [
		-23.8,
		3.035,
		-25.25
	], [
		4,
		.035,
		5.95
	], soffitMat);
	detailBox("wall-structure", "skyline-mezzanine-soffit-east", [
		23.8,
		3.035,
		-25.25
	], [
		4,
		.035,
		5.95
	], soffitMat);
	for (const x of [
		-21,
		-14,
		-7,
		0,
		7,
		14,
		21
	]) {
		detailBox("wall-structure", `skyline-mezzanine-coffer-${x}`, [
			x,
			3.002,
			-30.3
		], [
			5.65,
			.025,
			3.9
		], mezzanineCofferMat);
		detailBox("terminal-story", `skyline-mezzanine-coffer-light-${x}`, [
			x,
			2.982,
			-30.25
		], [
			3.8,
			.022,
			.13
		], x === 0 ? mezzanineUnderlightMagentaMat : mezzanineUnderlightMat);
	}
	for (const x of [
		-16,
		-8,
		0,
		8,
		16
	]) {
		detailBox("wall-structure", `skyline-mezzanine-front-coffer-${x}`, [
			x,
			3.001,
			-25.3
		], [
			6.5,
			.024,
			4.9
		], mezzanineCofferMat);
		detailBox("terminal-story", `skyline-mezzanine-front-coffer-light-${x}`, [
			x,
			2.981,
			-25.2
		], [
			4.6,
			.022,
			.13
		], x === 0 ? mezzanineUnderlightMagentaMat : mezzanineUnderlightMat);
	}
	for (const lightX of [
		-18,
		-10,
		0,
		10,
		18
	]) {
		detailBox("terminal-story", `skyline-mezzanine-underlight-${lightX}`, [
			lightX,
			3.007,
			-29.8
		], [
			5.4,
			.025,
			.11
		], mezzanineUnderlightMat);
		detailBox("terminal-story", `skyline-mezzanine-underlight-front-${lightX}`, [
			lightX,
			3.007,
			-24.3
		], [
			5.4,
			.025,
			.11
		], mezzanineUnderlightMat);
	}
	detailBox("floor-language", "skyline-mezzanine-front-edge", [
		0,
		3.36,
		-22.12
	], [
		52,
		.12,
		.34
	], floorBorderMat);
	for (const x of [
		-23.5,
		-16,
		-8,
		0,
		8,
		16,
		23.5
	]) detailBox("floor-language", `skyline-mezzanine-inlay-${x}`, [
		x,
		3.355,
		-27.1
	], [
		.035,
		.025,
		12.8
	], floorBorderMat);
	box(builder, "skyline-mezzanine-rail", [
		-14,
		4.2,
		-22.1
	], [
		24,
		1.1,
		.15
	], trimMat, {
		solid: false,
		detail: "performance"
	});
	box(builder, "skyline-mezzanine-rail", [
		14,
		4.2,
		-22.1
	], [
		24,
		1.1,
		.15
	], trimMat, {
		solid: false,
		detail: "performance"
	});
	addWalkablePlatform("gate-connector", "skyline-gate-connector-floor", [
		0,
		3.2,
		-17
	], [
		3.6,
		.24,
		10
	], soffitMat);
	detailBox("boarding-route", "skyline-gate-connector-soffit", [
		0,
		3.065,
		-17
	], [
		3.42,
		.035,
		9.72
	], soffitMat);
	for (const lightZ of [
		-20.2,
		-17,
		-13.8
	]) detailBox("boarding-route", `skyline-gate-connector-underlight-${lightZ}`, [
		0,
		3.035,
		lightZ
	], [
		2.65,
		.025,
		.11
	], practicalMat);
	box(builder, "skyline-gate-connector-rail-left", [
		-1.75,
		4.15,
		-17
	], [
		.12,
		1.7,
		10
	], trimMat, {
		solid: false,
		detail: "performance"
	});
	box(builder, "skyline-gate-connector-rail-right", [
		1.75,
		4.15,
		-17
	], [
		.12,
		1.7,
		10
	], trimMat, {
		solid: false,
		detail: "performance"
	});
	for (const seatX of [-10, 10]) {
		box(builder, `skyline-concourse-seat-cover-${seatX}`, [
			seatX,
			.57,
			-16.7
		], [
			5.2,
			1.14,
			.5
		], seatMat);
		detailBox("concourse-cover", `skyline-concourse-seat-plinth-${seatX}`, [
			seatX,
			.18,
			-16.7
		], [
			5.5,
			.34,
			1.5
		], structureMat);
		for (const offsetX of [
			-1.9,
			-.95,
			0,
			.95,
			1.9
		]) {
			detailBox("concourse-cover", `skyline-concourse-seat-pad-${seatX}-${offsetX}`, [
				seatX + offsetX,
				.57,
				-16.28
			], [
				.82,
				.18,
				.82
			], seatMat);
			detailBox("concourse-cover", `skyline-concourse-seat-back-${seatX}-${offsetX}`, [
				seatX + offsetX,
				.96,
				-16.83
			], [
				.82,
				.72,
				.14
			], seatMat);
		}
		detailBox("concourse-cover", `skyline-concourse-seat-endcap-left-${seatX}`, [
			seatX - 2.65,
			.62,
			-16.7
		], [
			.12,
			.82,
			1.2
		], trimMat);
		detailBox("concourse-cover", `skyline-concourse-seat-endcap-right-${seatX}`, [
			seatX + 2.65,
			.62,
			-16.7
		], [
			.12,
			.82,
			1.2
		], trimMat);
	}
	for (const planterX of [-25, 25]) {
		box(builder, `skyline-concourse-charging-planter-${planterX}`, [
			planterX,
			.56,
			-18
		], [
			3.8,
			1.12,
			1.55
		], wallLowerMat);
		detailBox("concourse-cover", `skyline-concourse-planter-cap-${planterX}`, [
			planterX,
			1.15,
			-18
		], [
			4,
			.12,
			1.7
		], trimMat);
		detailBox("concourse-cover", `skyline-concourse-planter-soil-${planterX}`, [
			planterX,
			1.23,
			-18
		], [
			3.45,
			.08,
			1.2
		], stainMat);
		for (const leafOffset of [
			-1.05,
			0,
			1.05
		]) detailMesh("concourse-cover", `skyline-concourse-planter-leaf-${planterX}-${leafOffset}`, new ConeGeometry(.35, 1.15, 7), standard(4216906, .9, .02), [
			planterX + leafOffset,
			1.78,
			-18
		], [
			0,
			leafOffset * .2,
			leafOffset * .1
		], "quality", false);
	}
	const mainSign = box(builder, "skyline-terminal-main-sign", [
		0,
		6.2,
		-33.8
	], [
		14,
		1.2,
		.2
	], terminalWayfindingMaterial("TERMINAL", "GATES 01—12  •  CONCOURSE A", "#d69a2d"), {
		solid: false,
		shots: false,
		detail: "performance"
	});
	mainSign.userData.label = "TERMINAL - GATES 1-12";
	mainSign.userData.skylineCluster = "terminal-story";
	const flightDisplay = box(builder, "skyline-flight-display-board", [
		0,
		4.8,
		-27.8
	], [
		6.5,
		1.4,
		.25
	], terminalWayfindingMaterial("DEPARTURES", "AERO 86  •  BOARDING", "#4d9b98"), {
		solid: false,
		shots: false,
		detail: "quality"
	});
	flightDisplay.userData.label = "DEPARTURES - FLIGHT AERO 86";
	flightDisplay.userData.skylineCluster = "terminal-story";
	for (const [x, title, subtitle, accent] of [[
		-18,
		"GATES 01—06",
		"SECURITY  •  LOUNGE",
		"#4ce5ec"
	], [
		18,
		"GATES 07—12",
		"BOARDING  •  AIRSIDE",
		"#ee62bd"
	]]) {
		const portalSign = box(builder, `skyline-overhead-gate-sign-${x}`, [
			x,
			5.55,
			-16.2
		], [
			11.5,
			1.28,
			.16
		], terminalWayfindingMaterial(title, subtitle, accent), {
			solid: false,
			shots: false,
			detail: "performance"
		});
		portalSign.userData.skylineCluster = "terminal-story";
		detailBox("terminal-story", `skyline-gate-sign-crown-${x}`, [
			x,
			6.27,
			-16.2
		], [
			12.2,
			.12,
			.22
		], x < 0 ? practicalMat : magentaPracticalMat);
		for (const postX of [x - 5.65, x + 5.65]) detailBox("wall-structure", `skyline-gate-sign-drop-${postX}`, [
			postX,
			6.42,
			-16.2
		], [
			.12,
			1.1,
			.12
		], structureMat);
	}
	const rampAngle = 22 * Math.PI / 180;
	const rampLen = 3.2 / Math.sin(rampAngle);
	for (const sideX of [-20, 20]) {
		box(builder, "skyline-concourse-escalator", [
			sideX,
			1.6,
			-24.5
		], [
			3.2,
			.25,
			rampLen
		], jetbridgeMat, { rotation: [
			rampAngle,
			0,
			0
		] });
		for (const railX of [sideX - 1.48, sideX + 1.48]) {
			detailBox("escalator-detail", `skyline-escalator-side-${railX}`, [
				railX,
				1.82,
				-24.5
			], [
				.14,
				.44,
				rampLen + .35
			], wallLowerMat, "performance", [
				rampAngle,
				0,
				0
			], true);
			detailBox("escalator-detail", `skyline-escalator-rail-${railX}`, [
				railX,
				2.45,
				-24.5
			], [
				.09,
				.09,
				rampLen + .3
			], structureMat, "performance", [
				rampAngle,
				0,
				0
			]);
		}
		for (let tread = -3.6; tread <= 3.6; tread += .72) {
			const y = 1.6 - tread * Math.sin(rampAngle) + .17;
			const z = -24.5 + tread * Math.cos(rampAngle);
			detailBox("escalator-detail", `skyline-escalator-tread-${sideX}-${tread.toFixed(2)}`, [
				sideX,
				y,
				z
			], [
				2.85,
				.055,
				.18
			], rubberMat, "performance", [
				rampAngle,
				0,
				0
			]);
		}
		detailBox("escalator-detail", `skyline-escalator-comb-foot-${sideX}`, [
			sideX,
			.095,
			-20.45
		], [
			3.05,
			.04,
			.5
		], hazardMat);
		detailBox("escalator-detail", `skyline-escalator-comb-top-${sideX}`, [
			sideX,
			3.375,
			-28.45
		], [
			3.05,
			.04,
			.5
		], hazardMat);
		detailBox("escalator-detail", `skyline-escalator-underlight-${sideX}`, [
			sideX,
			1.38,
			-24.5
		], [
			2.3,
			.06,
			rampLen - .45
		], practicalMat, "performance", [
			rampAngle,
			0,
			0
		]);
	}
	box(builder, "skyline-terminal-backwall", [
		0,
		3.5,
		-34.1
	], [
		62,
		7,
		.4
	], wallMat);
	box(builder, "skyline-terminal-leftwall", [
		-31.1,
		3.5,
		-23
	], [
		.4,
		7,
		22.6
	], wallMat);
	box(builder, "skyline-terminal-rightwall", [
		31.1,
		3.5,
		-23
	], [
		.4,
		7,
		22.6
	], wallMat);
	detailBox("wall-structure", "skyline-backwall-wainscot", [
		0,
		1.05,
		-33.84
	], [
		60.8,
		2.1,
		.14
	], wallLowerMat);
	detailBox("terminal-story", "skyline-backwall-luminous-crown-cyan", [
		-15.5,
		6.72,
		-33.68
	], [
		30.4,
		.16,
		.14
	], practicalMat);
	detailBox("terminal-story", "skyline-backwall-luminous-crown-magenta", [
		15.5,
		6.72,
		-33.68
	], [
		30.4,
		.16,
		.14
	], magentaPracticalMat);
	for (const columnX of [
		-28,
		-21,
		-14,
		-7,
		0,
		7,
		14,
		21,
		28
	]) detailBox("wall-structure", `skyline-backwall-column-${columnX}`, [
		columnX,
		3.5,
		-33.69
	], [
		.34,
		7,
		.26
	], structureMat, "performance", void 0, true);
	for (const sideX of [-30.84, 30.84]) {
		detailBox("wall-structure", `skyline-sidewall-wainscot-${sideX}`, [
			sideX,
			1.05,
			-23
		], [
			.14,
			2.1,
			21.8
		], wallLowerMat);
		for (const columnZ of [
			-32,
			-27,
			-22,
			-17,
			-12.5
		]) detailBox("wall-structure", `skyline-sidewall-column-${sideX}-${columnZ}`, [
			sideX,
			3.5,
			columnZ
		], [
			.26,
			7,
			.34
		], structureMat, "performance", void 0, true);
	}
	for (const sideX of [-30.7, 30.7]) for (const z of [
		-31,
		-27,
		-23,
		-19,
		-15
	]) detailBox("terminal-story", `skyline-sidewall-light-fin-${sideX}-${z}`, [
		sideX,
		3.6,
		z
	], [
		.08,
		4.6,
		.16
	], z === -23 ? magentaPracticalMat : practicalMat);
	for (const ribZ of [
		-32.5,
		-28.5,
		-24.5,
		-20.5,
		-16.5,
		-12.7
	]) {
		detailBox("wall-structure", `skyline-ceiling-rib-${ribZ}`, [
			0,
			6.78,
			ribZ
		], [
			60.5,
			.2,
			.28
		], structureMat, "performance", void 0, true);
		for (const lightX of [
			-20,
			-10,
			0,
			10,
			20
		]) detailBox("terminal-story", `skyline-ceiling-practical-${ribZ}-${lightX}`, [
			lightX,
			6.64,
			ribZ + .18
		], [
			6.4,
			.055,
			.1
		], practicalMat);
	}
	for (const archX of [-6, 6]) {
		box(builder, "skyline-security-scanner", [
			archX,
			1.35,
			-20
		], [
			.35,
			2.7,
			1.8
		], trimMat);
		detailBox("terminal-story", `skyline-security-crown-${archX}`, [
			archX,
			2.64,
			-20
		], [
			2.1,
			.18,
			1.85
		], structureMat);
		detailBox("terminal-story", `skyline-security-lamp-${archX}`, [
			archX,
			2.51,
			-20.82
		], [
			1.25,
			.08,
			.08
		], practicalMat);
	}
	box(builder, "skyline-security-belt", [
		0,
		.55,
		-20
	], [
		8,
		1.1,
		1.4
	], wallMat);
	detailBox("terminal-story", "skyline-security-belt-top", [
		0,
		1.13,
		-20
	], [
		8.15,
		.12,
		1.52
	], rubberMat);
	for (const [index, x, z] of [
		[
			0,
			-11,
			-18.6
		],
		[
			1,
			-11,
			-21.4
		],
		[
			2,
			-8.5,
			-18.6
		],
		[
			3,
			-8.5,
			-21.4
		],
		[
			4,
			8.5,
			-18.6
		],
		[
			5,
			8.5,
			-21.4
		],
		[
			6,
			11,
			-18.6
		],
		[
			7,
			11,
			-21.4
		]
	]) detailMesh("terminal-story", `skyline-queue-post-${index}`, new CylinderGeometry(.07, .1, 1.05, 10), trimMat, [
		x,
		.525,
		z
	], [
		0,
		0,
		0
	], "performance", false);
	for (const [index, x, z] of [
		[
			0,
			-9.75,
			-18.6
		],
		[
			1,
			-9.75,
			-21.4
		],
		[
			2,
			9.75,
			-18.6
		],
		[
			3,
			9.75,
			-21.4
		]
	]) detailBox("terminal-story", `skyline-queue-belt-${index}`, [
		x,
		.91,
		z
	], [
		2.35,
		.09,
		.05
	], hazardMat);
	box(builder, "skyline-cafe-counter", [
		-14,
		.55,
		-28
	], [
		5.5,
		1.1,
		2.8
	], kioskMat);
	box(builder, "skyline-dutyfree-kiosk", [
		14,
		.55,
		-28
	], [
		5.5,
		1.1,
		2.8
	], kioskMat);
	for (const x of [-14, 14]) {
		detailBox("terminal-story", `skyline-kiosk-countertop-${x}`, [
			x,
			1.14,
			-28
		], [
			5.8,
			.14,
			3.05
		], structureMat);
		detailBox("terminal-story", `skyline-kiosk-front-band-${x}`, [
			x,
			.58,
			-26.54
		], [
			4.6,
			.36,
			.12
		], hazardMat);
		detailBox("terminal-story", `skyline-kiosk-canopy-${x}`, [
			x,
			2.65,
			-28
		], [
			5.9,
			.22,
			3.1
		], floorBorderMat, "performance", void 0, true);
		for (const postX of [x - 2.55, x + 2.55]) detailBox("terminal-story", `skyline-kiosk-post-${postX}`, [
			postX,
			1.88,
			-28
		], [
			.12,
			1.45,
			.12
		], structureMat);
	}
	for (const x of [-12, 12]) {
		box(builder, `skyline-upper-kiosk-${x}`, [
			x,
			3.92,
			-31
		], [
			4.4,
			1.16,
			2.2
		], kioskMat);
		detailBox("terminal-story", `skyline-upper-kiosk-countertop-${x}`, [
			x,
			4.54,
			-31
		], [
			4.65,
			.12,
			2.4
		], structureMat);
		detailBox("terminal-story", `skyline-upper-kiosk-sign-${x}`, [
			x,
			5.22,
			-31.92
		], [
			3.7,
			.62,
			.1
		], x < 0 ? practicalMat : magentaPracticalMat);
	}
	box(builder, "skyline-baggage-claim-carousel", [
		0,
		.4,
		-31
	], [
		9.5,
		.8,
		4.2
	], kioskMat);
	detailBox("terminal-story", "skyline-baggage-rubber-belt", [
		0,
		.84,
		-31
	], [
		8.8,
		.12,
		3.55
	], rubberMat);
	detailBox("terminal-story", "skyline-baggage-bumper-north", [
		0,
		.9,
		-29.1
	], [
		9.4,
		.18,
		.16
	], structureMat);
	detailBox("terminal-story", "skyline-baggage-bumper-south", [
		0,
		.9,
		-32.9
	], [
		9.4,
		.18,
		.16
	], structureMat);
	detailBox("terminal-story", "skyline-baggage-bumper-west", [
		-4.6,
		.9,
		-31
	], [
		.16,
		.18,
		3.65
	], structureMat);
	detailBox("terminal-story", "skyline-baggage-bumper-east", [
		4.6,
		.9,
		-31
	], [
		.16,
		.18,
		3.65
	], structureMat);
	box(builder, "skyline-baggage-item-1", [
		-2.5,
		.9,
		-31
	], [
		1.1,
		.5,
		.7
	], cargoMat, {
		solid: false,
		detail: "quality"
	});
	box(builder, "skyline-baggage-item-2", [
		2.2,
		.9,
		-31
	], [
		.9,
		.45,
		.65
	], hazardMat, {
		solid: false,
		detail: "quality"
	});
	detailBox("boarding-route", "skyline-terminal-gate-jamb-left", [
		-1.84,
		4.15,
		-11.86
	], [
		.18,
		2.2,
		.28
	], trimMat, "performance", void 0, true);
	detailBox("boarding-route", "skyline-terminal-gate-jamb-right", [
		1.84,
		4.15,
		-11.86
	], [
		.18,
		2.2,
		.28
	], trimMat, "performance", void 0, true);
	detailBox("boarding-route", "skyline-terminal-gate-header", [
		0,
		5.2,
		-11.86
	], [
		3.86,
		.18,
		.28
	], trimMat, "performance", void 0, true);
	detailBox("boarding-route", "skyline-terminal-gate-threshold", [
		0,
		3.34,
		-11.84
	], [
		3.55,
		.08,
		.34
	], rubberMat);
	for (const [id, x] of [["west", -22], ["east", 22]]) {
		detailBox("terminal-story", "skyline-staff-door-" + id, [
			x,
			1.25,
			-33.66
		], [
			2.25,
			2.5,
			.12
		], glassMat, "performance");
		detailBox("terminal-story", "skyline-staff-door-" + id + "-header", [
			x,
			2.62,
			-33.61
		], [
			2.55,
			.18,
			.2
		], structureMat, "performance", void 0, true);
		for (const side of [-1, 1]) detailBox("terminal-story", "skyline-staff-door-" + id + "-jamb-" + side, [
			x + side * 1.22,
			1.35,
			-33.61
		], [
			.18,
			2.7,
			.2
		], structureMat, "performance", void 0, true);
		detailBox("terminal-story", "skyline-staff-door-" + id + "-handle", [
			x + .7,
			1.25,
			-33.52
		], [
			.08,
			.36,
			.1
		], hazardMat);
	}
	root.userData.skylineDoorAudit = [
		{
			id: "terminal-gate",
			state: "open",
			mechanicalAuthority: "open-facade-gap",
			clearWidth: 3.5
		},
		{
			id: "aircraft-boarding",
			state: "open",
			mechanicalAuthority: "split-fuselage-wall",
			clearWidth: 2.68
		},
		{
			id: "cockpit-entry",
			state: "open",
			mechanicalAuthority: "open-cabin-shell-gap",
			clearWidth: 2.8
		},
		{
			id: "staff-west",
			state: "closed",
			mechanicalAuthority: "skyline-terminal-backwall",
			clearWidth: 0
		},
		{
			id: "staff-east",
			state: "closed",
			mechanicalAuthority: "skyline-terminal-backwall",
			clearWidth: 0
		}
	];
	for (const [row, z] of [-21.5, -25.2].entries()) for (const x of [
		-24,
		-18,
		18,
		24
	]) {
		detailBox("terminal-story", `skyline-lounge-seat-${row}-${x}`, [
			x,
			.48,
			z
		], [
			4.2,
			.22,
			1.25
		], seatMat, "performance");
		detailBox("terminal-story", `skyline-lounge-seat-back-${row}-${x}`, [
			x,
			.9,
			z + .52
		], [
			4.2,
			.72,
			.15
		], seatMat, "performance");
		for (const leg of [-1.65, 1.65]) detailBox("terminal-story", `skyline-lounge-leg-${row}-${x}-${leg}`, [
			x + leg,
			.24,
			z
		], [
			.12,
			.48,
			.85
		], structureMat, "performance");
	}
	for (const x of [
		-29,
		-10,
		10,
		29
	]) {
		detailBox("terminal-story", `skyline-flight-screen-post-${x}`, [
			x,
			1.8,
			-20
		], [
			.16,
			3.6,
			.16
		], structureMat, "performance");
		detailBox("terminal-story", `skyline-flight-screen-${x}`, [
			x,
			3.25,
			-20
		], [
			3.6,
			1.5,
			.18
		], flightScreenMat, "performance");
		const gate = x < -20 ? "01—03" : x < 0 ? "04—06" : x < 20 ? "07—09" : "10—12";
		const accent = x < 0 ? "#4ce5ec" : "#ee62bd";
		for (const faceZ of [-20.105, -19.895]) {
			const face = detailBox("terminal-story", `skyline-flight-screen-face-${x}-${faceZ}`, [
				x,
				3.25,
				faceZ
			], [
				3.34,
				1.24,
				.025
			], terminalWayfindingMaterial("FLIGHT INFO", `GATES ${gate}  •  ON TIME`, accent), "performance");
			face.userData.label = `FLIGHT INFO - GATES ${gate}`;
		}
		detailBox("terminal-story", `skyline-flight-screen-frame-top-${x}`, [
			x,
			3.96,
			-20
		], [
			3.85,
			.12,
			.28
		], structureMat, "performance");
		detailBox("terminal-story", `skyline-flight-screen-frame-bottom-${x}`, [
			x,
			2.54,
			-20
		], [
			3.85,
			.12,
			.28
		], structureMat, "performance");
		detailBox("terminal-story", `skyline-baggage-cart-basket-${x}`, [
			x,
			.62,
			-30.5
		], [
			1.65,
			.72,
			.82
		], structureMat, "performance");
		detailBox("terminal-story", `skyline-baggage-cart-handle-${x}`, [
			x,
			1.15,
			-30.88
		], [
			1.65,
			.08,
			.08
		], trimMat, "performance");
	}
	const breakableWindows = [];
	for (const winX of [
		-22,
		-14,
		-6,
		6,
		14,
		22
	]) {
		const windowId = `skyline-window-${winX}`;
		const winMesh = box(builder, `skyline-facade-window-${winX}`, [
			winX,
			2.5,
			-12
		], [
			6.8,
			5,
			.2
		], glassMat, {
			solid: false,
			shots: true,
			ballisticMaterial: "glass",
			breakableWindowId: windowId
		});
		winMesh.userData.breakableWindowId = windowId;
		winMesh.userData.dynamic = true;
		breakableWindows.push({
			id: windowId,
			mesh: winMesh,
			broken: false
		});
		detailBox("window-frame", `skyline-window-frame-top-${winX}`, [
			winX,
			5.04,
			-11.86
		], [
			7.15,
			.18,
			.24
		], structureMat, "performance", void 0, true);
		detailBox("window-frame", `skyline-window-frame-bottom-${winX}`, [
			winX,
			.14,
			-11.86
		], [
			7.15,
			.2,
			.24
		], structureMat);
		detailBox("window-frame", `skyline-window-frame-left-${winX}`, [
			winX - 3.48,
			2.58,
			-11.86
		], [
			.18,
			5.1,
			.24
		], structureMat, "performance", void 0, true);
		detailBox("window-frame", `skyline-window-frame-right-${winX}`, [
			winX + 3.48,
			2.58,
			-11.86
		], [
			.18,
			5.1,
			.24
		], structureMat, "performance", void 0, true);
		detailBox("window-frame", `skyline-window-mullion-${winX}`, [
			winX,
			2.58,
			-11.84
		], [
			.11,
			4.95,
			.2
		], structureMat);
	}
	detailBox("wall-structure", "skyline-airside-roof-crown", [
		0,
		7.24,
		-12
	], [
		63,
		.42,
		1.05
	], structureMat, "performance", void 0, true);
	detailBox("terminal-story", "skyline-airside-roof-cyan-line", [
		-15.5,
		7.02,
		-11.43
	], [
		31,
		.14,
		.12
	], practicalMat);
	detailBox("terminal-story", "skyline-airside-roof-magenta-line", [
		15.5,
		7.02,
		-11.43
	], [
		31,
		.14,
		.12
	], magentaPracticalMat);
	for (const x of [
		-24,
		-12,
		0,
		12,
		24
	]) {
		detailBox("wall-structure", `skyline-roof-sculptural-fin-${x}`, [
			x,
			8.45,
			-12.2
		], [
			.22,
			2.5,
			1.45
		], ivoryPanelMat, "performance", [
			0,
			0,
			x * .006
		], true);
		detailBox("terminal-story", `skyline-roof-sculptural-fin-light-${x}`, [
			x,
			8.45,
			-11.43
		], [
			.09,
			2.1,
			.08
		], x === 0 ? magentaPracticalMat : practicalMat);
	}
	for (const [x, title, subtitle, accent] of [[
		-18,
		"SKYLINE",
		"INTERNATIONAL TERMINAL",
		"#4ce5ec"
	], [
		18,
		"GATE 07",
		"AERO 86  •  BOARDING",
		"#ee62bd"
	]]) {
		const airsideSign = box(builder, `skyline-airside-identity-${x}`, [
			x,
			6.25,
			-11.51
		], [
			12.2,
			1.05,
			.12
		], terminalWayfindingMaterial(title, subtitle, accent), {
			solid: false,
			shots: false,
			detail: "performance"
		});
		airsideSign.userData.skylineCluster = "terminal-story";
	}
	for (const sideX of [-1.93, 1.93]) {
		detailBox("boarding-route", `skyline-jetbridge-bellows-side-${sideX}`, [
			sideX,
			4.3,
			-11.8
		], [
			.24,
			2.6,
			.5
		], jetbridgeMat, "quality");
		for (const ribY of [
			3.35,
			3.85,
			4.35,
			4.85
		]) detailBox("boarding-route", `skyline-jetbridge-bellows-rib-${sideX}-${ribY}`, [
			sideX - Math.sign(sideX) * .08,
			ribY,
			-11.51
		], [
			.12,
			.11,
			.08
		], structureMat, "quality");
	}
	detailBox("boarding-route", "skyline-jetbridge-bellows-header", [
		0,
		5.42,
		-11.8
	], [
		4.1,
		.36,
		.5
	], jetbridgeMat, "quality");
	addWalkablePlatform("jetbridge", "skyline-jetbridge-floor", [
		0,
		3.2,
		-7
	], [
		3.6,
		.24,
		10
	], jetbridgeMat);
	box(builder, "skyline-jetbridge-wall-left", [
		-1.75,
		4.4,
		-6
	], [
		.15,
		2.2,
		12
	], wallMat);
	box(builder, "skyline-jetbridge-wall-right", [
		1.75,
		4.4,
		-6
	], [
		.15,
		2.2,
		12
	], wallMat);
	box(builder, "skyline-jetbridge-roof", [
		0,
		5.5,
		-6
	], [
		3.6,
		.15,
		12
	], jetbridgeMat, {
		solid: false,
		shots: false
	});
	for (const sideX of [-1.66, 1.66]) {
		detailBox("boarding-route", `skyline-jetbridge-inner-panel-${sideX}`, [
			sideX,
			3.8,
			-6
		], [
			.035,
			.7,
			11.4
		], soffitMat);
		detailBox("boarding-route", `skyline-jetbridge-window-band-${sideX}`, [
			sideX,
			4.68,
			-6
		], [
			.028,
			.72,
			10.8
		], cockpitGlassMat, "quality");
	}
	for (const lightZ of [
		-10,
		-7,
		-4,
		-1.8
	]) detailBox("boarding-route", `skyline-jetbridge-practical-${lightZ}`, [
		0,
		5.36,
		lightZ
	], [
		2.55,
		.045,
		.13
	], practicalMat);
	const jetbridgeRampAngle = Math.atan2(.79, 2.2);
	box(builder, "skyline-jetbridge-cabin-ramp", [
		0,
		2.935,
		-1
	], [
		3.6,
		.24,
		2.2
	], jetbridgeMat, { rotation: [
		jetbridgeRampAngle,
		0,
		0
	] });
	for (const legZ of [-10, -2]) box(builder, "skyline-jetbridge-leg", [
		0,
		1.5,
		legZ
	], [
		.4,
		3,
		.4
	], jetbridgeMat, { solid: false });
	for (const ribZ of [
		-10.8,
		-8.8,
		-6.8,
		-4.8,
		-2.8
	]) {
		detailBox("wall-structure", `skyline-jetbridge-rib-left-${ribZ}`, [
			-1.86,
			4.4,
			ribZ
		], [
			.16,
			2.45,
			.2
		], structureMat);
		detailBox("wall-structure", `skyline-jetbridge-rib-right-${ribZ}`, [
			1.86,
			4.4,
			ribZ
		], [
			.16,
			2.45,
			.2
		], structureMat);
		detailBox("wall-structure", `skyline-jetbridge-rib-roof-${ribZ}`, [
			0,
			5.47,
			ribZ
		], [
			3.9,
			.16,
			.2
		], structureMat);
	}
	detailBox("floor-language", "skyline-gate-threshold-terminal", [
		0,
		3.35,
		-11.65
	], [
		3.35,
		.04,
		.42
	], hazardMat);
	detailBox("floor-language", "skyline-gate-threshold-aircraft", [
		0,
		2.69,
		-.18
	], [
		3.35,
		.04,
		.42
	], hazardMat);
	detailBox("terminal-story", "skyline-jetbridge-light-spine", [
		0,
		5.38,
		-6.2
	], [
		.24,
		.06,
		10.2
	], practicalMat);
	qualityPlaceholderBox("skyline-jetliner-fuselage-top", [
		0,
		5.8,
		2
	], [
		36,
		1.2,
		4.2
	], planeHullMat, "jetliner-fuselage-roof");
	addWalkablePlatform("jetliner-cabin", "skyline-jetliner-cabin-floor", [
		0,
		2.4,
		2
	], [
		35,
		.3,
		3.8
	], floorMat);
	box(builder, "skyline-jetliner-side-north", [
		-9.65,
		3.75,
		.2
	], [
		15.7,
		2.4,
		.2
	], planeHullMat);
	box(builder, "skyline-jetliner-side-north", [
		9.65,
		3.75,
		.2
	], [
		15.7,
		2.4,
		.2
	], planeHullMat);
	box(builder, "skyline-jetliner-side-south", [
		0,
		3.75,
		3.8
	], [
		35,
		2.4,
		.2
	], planeHullMat);
	addWalkablePlatform("jetliner-cockpit", "skyline-cockpit-floor", [
		-18.75,
		2.4,
		2
	], [
		2.5,
		.3,
		3.8
	], floorMat);
	box(builder, "skyline-cockpit-lower-side-north", [
		-18.75,
		3.3,
		.2
	], [
		2.5,
		1.5,
		.2
	], planeHullMat);
	box(builder, "skyline-cockpit-lower-side-south", [
		-18.75,
		3.3,
		3.8
	], [
		2.5,
		1.5,
		.2
	], planeHullMat);
	box(builder, "skyline-cockpit-glass-north", [
		-18.75,
		4.42,
		.2
	], [
		2.5,
		.74,
		.2
	], cockpitGlassMat, { ballisticMaterial: "glass" });
	box(builder, "skyline-cockpit-glass-south", [
		-18.75,
		4.42,
		3.8
	], [
		2.5,
		.74,
		.2
	], cockpitGlassMat, { ballisticMaterial: "glass" });
	box(builder, "skyline-cockpit-roof", [
		-18.75,
		5.18,
		2
	], [
		2.5,
		.3,
		3.8
	], planeHullMat);
	box(builder, "skyline-cockpit-front-lower", [
		-20.08,
		3.25,
		2
	], [
		.2,
		1.7,
		3.8
	], planeHullMat);
	box(builder, "skyline-cockpit-glass-front", [
		-20.08,
		4.52,
		2
	], [
		.2,
		.84,
		3.8
	], cockpitGlassMat, { ballisticMaterial: "glass" });
	const fuselageShellSpecs = [{
		name: "skyline-quality-fuselage-shell-forward",
		x: -9.35,
		length: 14.9
	}, {
		name: "skyline-quality-fuselage-shell-aft",
		x: 9.7,
		length: 15.6
	}];
	const fuselageShells = fuselageShellSpecs.map(({ name, x, length }) => detailMesh("quality-aircraft", name, new CylinderGeometry(2.1, 2.1, length, 28, 1, true, 0, Math.PI), planeHullMat, [
		x,
		4.3,
		2
	], [
		0,
		0,
		Math.PI / 2
	]));
	for (const shell of fuselageShells) {
		shell.userData.assetOwner = "skyline-terminal";
		shell.userData.rustworksDetail = "core";
		shell.userData.skylineCollisionAuthorityId = "jetliner-fuselage-roof";
	}
	const cabinCeilingMaterial = planeHullMat.clone();
	cabinCeilingMaterial.name = "skyline-aircraft-interior-ceiling-material";
	cabinCeilingMaterial.side = 1;
	const cabinCeilingShells = fuselageShellSpecs.map(({ name, x, length }) => detailMesh("quality-aircraft", name.replace("fuselage-shell", "cabin-ceiling-shell"), new CylinderGeometry(2.02, 2.02, length, 28, 1, true, 0, Math.PI), cabinCeilingMaterial, [
		x,
		4.3,
		2
	], [
		0,
		0,
		Math.PI / 2
	]));
	for (const shell of cabinCeilingShells) {
		shell.userData.assetOwner = "skyline-terminal";
		shell.userData.rustworksDetail = "core";
		shell.userData.interiorFaceOrientation = "back-side";
		shell.userData.boardingAperturePreserved = true;
		shell.userData.skylineCollisionAuthorityId = "jetliner-fuselage-roof";
	}
	detailBox("quality-aircraft", "skyline-quality-fuselage-door-crown", [
		0,
		6.08,
		2
	], [
		3.8,
		.58,
		4.15
	], planeHullMat, "quality");
	const qualityNose = detailMesh("quality-aircraft", "skyline-quality-aircraft-nose", new SphereGeometry(1, 28, 16, -Math.PI / 2, Math.PI), planeHullMat, [
		-18.2,
		4.3,
		2
	]);
	qualityNose.scale.set(2.45, 2.1, 2.1);
	qualityNose.userData.assetOwner = "skyline-terminal";
	qualityNose.userData.rustworksDetail = "core";
	const tailShape = new Shape();
	tailShape.moveTo(0, 0);
	tailShape.lineTo(3.1, 0);
	tailShape.lineTo(2.15, 4.25);
	tailShape.lineTo(.55, 4.25);
	tailShape.closePath();
	const qualityTail = detailMesh("quality-aircraft", "skyline-quality-aircraft-tail-fin", new ExtrudeGeometry(tailShape, {
		depth: .32,
		bevelEnabled: true,
		bevelSize: .05,
		bevelThickness: .05,
		bevelSegments: 2
	}), planeStripeMat, [
		16.7,
		4.35,
		1.84
	]);
	qualityTail.userData.assetOwner = "skyline-terminal";
	for (const [segment, x] of [["forward", -9.65], ["aft", 9.65]]) {
		detailBox("aircraft-skin", `skyline-aircraft-belly-north-${segment}`, [
			x,
			3.12,
			.06
		], [
			15.7,
			.58,
			.08
		], planeStripeMat);
		detailBox("aircraft-skin", `skyline-aircraft-livery-cyan-north-${segment}`, [
			x,
			3.7,
			.045
		], [
			15.7,
			.18,
			.06
		], practicalMat);
	}
	detailBox("aircraft-skin", "skyline-aircraft-belly-south", [
		0,
		3.12,
		3.94
	], [
		34.2,
		.58,
		.08
	], planeStripeMat);
	detailBox("aircraft-skin", "skyline-aircraft-livery-cyan-south", [
		0,
		3.7,
		3.955
	], [
		32.8,
		.18,
		.06
	], practicalMat);
	detailBox("aircraft-skin", "skyline-aircraft-livery-magenta-north", [
		9.8,
		3.98,
		.038
	], [
		12.5,
		.1,
		.05
	], magentaPracticalMat);
	detailBox("aircraft-skin", "skyline-aircraft-livery-magenta-south", [
		9.8,
		3.98,
		3.962
	], [
		12.5,
		.1,
		.05
	], magentaPracticalMat);
	detailBox("aircraft-skin", "skyline-aircraft-roof-spine", [
		0,
		6.43,
		2
	], [
		33.8,
		.12,
		.54
	], planeStripeMat, "quality");
	for (const windowX of [
		-13.5,
		-10.5,
		-7.5,
		-4.5,
		4.5,
		7.5,
		10.5,
		13.5
	]) {
		detailBox("aircraft-skin", `skyline-cabin-window-north-${windowX}`, [
			windowX,
			4.28,
			.055
		], [
			1.28,
			.5,
			.08
		], cockpitGlassMat);
		detailBox("aircraft-skin", `skyline-cabin-window-south-${windowX}`, [
			windowX,
			4.28,
			3.945
		], [
			1.28,
			.5,
			.08
		], cockpitGlassMat);
		detailBox("aircraft-skin", `skyline-cabin-window-cap-north-${windowX}`, [
			windowX,
			4.58,
			.04
		], [
			1.42,
			.055,
			.1
		], planeStripeMat);
		detailBox("aircraft-skin", `skyline-cabin-window-cap-south-${windowX}`, [
			windowX,
			4.58,
			3.96
		], [
			1.42,
			.055,
			.1
		], planeStripeMat);
	}
	detailBox("aircraft-skin", "skyline-tail-slate-panel", [
		19.02,
		6.42,
		2.22
	], [
		1.86,
		2.55,
		.06
	], planeStripeMat);
	detailBox("aircraft-skin", "skyline-tail-amber-mark", [
		19.02,
		6.55,
		2.27
	], [
		1.35,
		.28,
		.07
	], hazardMat);
	const cabinSeatDepth = .72;
	const cabinSeatLeftZ = .86;
	const cabinSeatRightZ = 3.14;
	const cabinAisleClearance = cabinSeatRightZ - cabinSeatDepth / 2 - 1.22;
	root.userData.skylineCabinClearance = {
		aisleMetres: cabinAisleClearance,
		physicsPlayerDiameterMetres: .76,
		clearanceProbeDiameterMetres: .88,
		doorVisibleApertureMetres: 2.68,
		cockpitVisibleApertureMetres: 2.8,
		cockpitAccessibleDepthMetres: 2.5,
		opaqueDoorPanels: 0
	};
	for (const seatX of [
		-12,
		-8,
		-4,
		4,
		8,
		12
	]) {
		box(builder, `skyline-cabin-seat-left-${seatX}`, [
			seatX,
			3.05,
			cabinSeatLeftZ
		], [
			1,
			1,
			cabinSeatDepth
		], seatMat);
		box(builder, `skyline-cabin-seat-right-${seatX}`, [
			seatX,
			3.05,
			cabinSeatRightZ
		], [
			1,
			1,
			cabinSeatDepth
		], seatMat);
		box(builder, `skyline-cabin-overhead-bin-left-${seatX}`, [
			seatX,
			4.5,
			.58
		], [
			1.8,
			.45,
			.58
		], planeHullMat, {
			solid: false,
			shots: false
		});
		box(builder, `skyline-cabin-overhead-bin-right-${seatX}`, [
			seatX,
			4.5,
			3.42
		], [
			1.8,
			.45,
			.58
		], planeHullMat, {
			solid: false,
			shots: false
		});
		detailBox("terminal-story", `skyline-seat-headrest-left-${seatX}`, [
			seatX,
			3.45,
			cabinSeatLeftZ
		], [
			.78,
			.3,
			.58
		], planeStripeMat);
		detailBox("terminal-story", `skyline-seat-headrest-right-${seatX}`, [
			seatX,
			3.45,
			cabinSeatRightZ
		], [
			.78,
			.3,
			.58
		], planeStripeMat);
		detailBox("terminal-story", `skyline-bin-latch-left-${seatX}`, [
			seatX,
			4.3,
			.9
		], [
			.44,
			.06,
			.05
		], hazardMat);
		detailBox("terminal-story", `skyline-bin-latch-right-${seatX}`, [
			seatX,
			4.3,
			3.1
		], [
			.44,
			.06,
			.05
		], hazardMat);
	}
	detailBox("floor-language", "skyline-cabin-aisle-runner", [
		-.25,
		2.77,
		2
	], [
		31.8,
		.035,
		.72
	], floorInsetMat);
	detailBox("terminal-story", "skyline-cabin-light-north", [
		-.5,
		5.47,
		1.12
	], [
		31,
		.07,
		.11
	], practicalMat);
	detailBox("terminal-story", "skyline-cabin-light-south", [
		-.5,
		5.47,
		2.88
	], [
		31,
		.07,
		.11
	], practicalMat);
	for (const windowX of [
		-13.5,
		-10.5,
		-7.5,
		-4.5,
		4.5,
		7.5,
		10.5,
		13.5
	]) {
		detailBox("aircraft-skin", `skyline-cabin-window-inner-north-${windowX}`, [
			windowX,
			4.05,
			.415
		], [
			1.26,
			.48,
			.055
		], cockpitGlassMat);
		detailBox("aircraft-skin", `skyline-cabin-window-inner-south-${windowX}`, [
			windowX,
			4.05,
			3.585
		], [
			1.26,
			.48,
			.055
		], cockpitGlassMat);
	}
	for (const ribX of [
		-14,
		-11,
		-8,
		-5,
		-2,
		1,
		4,
		7,
		10,
		13,
		16
	]) detailBox("wall-structure", `skyline-cabin-ceiling-rib-${ribX}`, [
		ribX,
		5.42,
		2
	], [
		.11,
		.08,
		3.15
	], structureMat);
	detailBox("terminal-story", "skyline-cabin-exit-sign", [
		15.9,
		4.95,
		2
	], [
		.1,
		.32,
		1.25
	], practicalMat);
	const wingSliceCount = 8;
	const wingAuthorityMaximumOverhang = 1.9 / wingSliceCount;
	const addWingAuthority = (side, rootZ, tipDeltaZ, qualityPresentationName) => {
		for (let index = 0; index < wingSliceCount; index += 1) {
			const start = index / wingSliceCount;
			const end = (index + 1) / wingSliceCount;
			const startZ = rootZ + tipDeltaZ * start;
			const endZ = rootZ + tipDeltaZ * end;
			const minX = -3.2 + 1.9 * start;
			const maxX = 2.7 - .9 * start;
			addWalkablePlatform(`jetliner-wing-${side}-${index + 1}`, `skyline-jetliner-wing-${side}-authority-${index + 1}`, [
				(minX + maxX) / 2,
				2.82,
				(startZ + endZ) / 2
			], [
				maxX - minX,
				.28,
				Math.abs(endZ - startZ)
			], planeWingMat, {
				qualityPlaceholder: true,
				qualityPresentationName
			});
		}
	};
	addWingAuthority("port", 3.6, 16.8, "skyline-quality-wing-port");
	addWingAuthority("starboard", .4, -16.8, "skyline-quality-wing-starboard");
	qualityPlaceholderBox("skyline-jetliner-engine-1", [
		0,
		1.6,
		12
	], [
		1.9,
		1.9,
		4.1
	], engineMat, "jetliner-engine-nacelles");
	qualityPlaceholderBox("skyline-jetliner-engine-2", [
		0,
		1.6,
		-8
	], [
		1.9,
		1.9,
		4.1
	], engineMat, "jetliner-engine-nacelles");
	const portWing = detailMesh("quality-aircraft", "skyline-quality-wing-port", prismGeometryXZ([
		[-3.2, 0],
		[2.7, 0],
		[1.8, 16.8],
		[-1.3, 16.8]
	], .28), planeWingMat, [
		0,
		2.82,
		3.6
	]);
	portWing.userData.assetOwner = "skyline-terminal";
	portWing.userData.rustworksDetail = "core";
	portWing.userData.skylineCollisionAuthorityId = "skyline-quality-wing-port";
	const starboardWing = detailMesh("quality-aircraft", "skyline-quality-wing-starboard", prismGeometryXZ([
		[-3.2, 0],
		[2.7, 0],
		[1.8, -16.8],
		[-1.3, -16.8]
	], .28), planeWingMat, [
		0,
		2.82,
		.4
	]);
	starboardWing.userData.assetOwner = "skyline-terminal";
	starboardWing.userData.rustworksDetail = "core";
	starboardWing.userData.skylineCollisionAuthorityId = "skyline-quality-wing-starboard";
	detailBox("aircraft-skin", "skyline-wingtip-port", [
		0,
		2.99,
		18.42
	], [
		5.1,
		.08,
		.14
	], planeStripeMat);
	detailBox("aircraft-skin", "skyline-wingtip-starboard", [
		0,
		2.99,
		-14.42
	], [
		5.1,
		.08,
		.14
	], planeStripeMat);
	detailBox("aircraft-skin", "skyline-wing-navigation-port", [
		-2.35,
		3.06,
		18.48
	], [
		.42,
		.16,
		.16
	], practicalMat);
	detailBox("aircraft-skin", "skyline-wing-navigation-starboard", [
		-2.35,
		3.06,
		-14.48
	], [
		.42,
		.16,
		.16
	], practicalMat);
	const engineNacelles = new InstancedMesh(new CylinderGeometry(.95, .78, 4.1, 20), planeStripeMat, 2);
	engineNacelles.name = "skyline-aircraft-engine-nacelles";
	engineNacelles.castShadow = true;
	engineNacelles.receiveShadow = true;
	engineNacelles.userData.presentationOnly = true;
	engineNacelles.userData.rustworksDetail = "core";
	engineNacelles.userData.skylineCluster = "aircraft-skin";
	engineNacelles.userData.skylineCollisionAuthorityId = "jetliner-engine-nacelles";
	const nacelleMatrix = new Matrix4();
	const nacelleRotation = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2));
	for (const [index, z] of [12, -8].entries()) {
		nacelleMatrix.compose(new Vector3(0, 1.6, z), nacelleRotation, new Vector3(1, 1, 1));
		engineNacelles.setMatrixAt(index, nacelleMatrix);
	}
	engineNacelles.instanceMatrix.needsUpdate = true;
	root.add(engineNacelles);
	const stairAngle = 32 * Math.PI / 180;
	const stairLen = 2.4 / Math.sin(stairAngle);
	box(builder, "skyline-airstair", [
		19.4,
		1.2,
		2
	], [
		stairLen,
		.2,
		2.2
	], trimMat, { rotation: [
		0,
		0,
		-stairAngle
	] });
	for (const railZ of [.95, 3.05]) {
		detailBox("escalator-detail", `skyline-airstair-side-${railZ}`, [
			19.4,
			1.42,
			railZ
		], [
			stairLen + .2,
			.38,
			.12
		], wallLowerMat, "performance", [
			0,
			0,
			-stairAngle
		], true);
		detailBox("escalator-detail", `skyline-airstair-rail-${railZ}`, [
			19.4,
			2.05,
			railZ
		], [
			stairLen + .1,
			.08,
			.08
		], structureMat, "performance", [
			0,
			0,
			-stairAngle
		]);
	}
	for (let tread = -1.8; tread <= 1.8; tread += .45) {
		const x = 19.4 + tread * Math.cos(stairAngle);
		const y = 1.2 - tread * Math.sin(stairAngle) + .15;
		detailBox("escalator-detail", `skyline-airstair-tread-${tread.toFixed(2)}`, [
			x,
			y,
			2
		], [
			.18,
			.05,
			1.94
		], rubberMat, "performance", [
			0,
			0,
			-stairAngle
		]);
	}
	detailBox("floor-language", "skyline-airstair-comb-foot", [
		21.35,
		.08,
		2
	], [
		.5,
		.04,
		2.15
	], hazardMat);
	detailBox("floor-language", "skyline-airstair-comb-top", [
		17.45,
		2.7,
		2
	], [
		.5,
		.04,
		2.15
	], hazardMat);
	qualityPlaceholderBox("skyline-fuel-trailer", [
		-10,
		1.5,
		18
	], [
		5.2,
		2.2,
		2.2
	], hazardMat, "fuel-trailer");
	const fuelTank = new Mesh(new CylinderGeometry(1.1, 1.1, 5.2, 14), cargoMat);
	fuelTank.name = "skyline-fuel-trailer-tank";
	fuelTank.rotation.z = Math.PI / 2;
	fuelTank.position.set(-10, 1.5, 18);
	fuelTank.castShadow = true;
	fuelTank.receiveShadow = true;
	fuelTank.userData.presentationOnly = true;
	fuelTank.userData.impactSurface = "metal";
	fuelTank.userData.rustworksDetail = "core";
	fuelTank.userData.skylineCluster = "service-equipment";
	fuelTank.userData.assetOwner = "skyline-terminal";
	fuelTank.userData.skylineCollisionAuthorityId = "fuel-trailer";
	fuelTank.raycast = () => void 0;
	root.add(fuelTank);
	detailBox("service-equipment", "skyline-fuel-trailer-chassis", [
		-10,
		.38,
		18
	], [
		6.1,
		.28,
		2.3
	], structureMat, "performance");
	for (const wheelX of [-12.1, -8.2]) for (const wheelZ of [17.05, 18.95]) detailMesh("service-equipment", `skyline-fuel-trailer-wheel-${wheelX}-${wheelZ}`, new CylinderGeometry(.38, .38, .22, 14), rubberMat, [
		wheelX,
		.38,
		wheelZ
	], [
		Math.PI / 2,
		0,
		0
	], "performance");
	detailMesh("service-equipment", "skyline-fuel-hose-reel", new TorusGeometry(.58, .12, 8, 18), rubberMat, [
		-7.25,
		1.3,
		18
	], [
		0,
		Math.PI / 2,
		0
	], "quality");
	detailBox("service-equipment", "skyline-fuel-control-cabinet", [
		-7.15,
		1.15,
		16.95
	], [
		.9,
		1.6,
		.48
	], wallMat, "quality");
	const uldShape = new Shape();
	uldShape.moveTo(-2.25, 0);
	uldShape.lineTo(2.25, 0);
	uldShape.lineTo(2.02, 2.6);
	uldShape.lineTo(-1.72, 2.6);
	uldShape.lineTo(-2.25, 1.95);
	uldShape.closePath();
	for (const [x, z, col] of [
		[
			-20,
			18,
			cargoMat
		],
		[
			20,
			18,
			wallMat
		],
		[
			-12,
			26,
			hazardMat
		],
		[
			12,
			26,
			cargoMat
		],
		[
			0,
			28,
			trimMat
		]
	]) {
		const cargoAuthorityId = `tarmac-cargo-${x}-${z}`;
		qualityPlaceholderBox(`skyline-tarmac-cargo-${x}-${z}-lower`, [
			x,
			.975,
			z
		], [
			4.5,
			1.95,
			2.6
		], col, cargoAuthorityId);
		qualityPlaceholderBox(`skyline-tarmac-cargo-${x}-${z}-upper`, [
			x + .15,
			2.275,
			z
		], [
			3.74,
			.65,
			2.6
		], col, cargoAuthorityId);
		const shell = detailMesh("service-equipment", `skyline-quality-uld-${x}-${z}`, new ExtrudeGeometry(uldShape, {
			depth: 2.6,
			bevelEnabled: true,
			bevelSize: .06,
			bevelThickness: .06,
			bevelSegments: 2
		}), col, [
			x,
			0,
			z - 1.3
		]);
		shell.userData.assetOwner = "skyline-terminal";
		shell.userData.rustworksDetail = "core";
		shell.userData.skylineCollisionAuthorityId = cargoAuthorityId;
		detailBox("service-equipment", `skyline-uld-rail-${x}-${z}`, [
			x,
			1.42,
			z + 1.34
		], [
			4.15,
			.12,
			.08
		], hazardMat, "quality");
	}
	for (const [x, z] of [
		[-8, 14],
		[8, 14],
		[-22, 26],
		[22, 26]
	]) {
		box(builder, "skyline-luggage-cart", [
			x,
			.6,
			z
		], [
			2.4,
			1.2,
			1.6
		], hazardMat);
		detailBox("terminal-story", `skyline-cart-rubber-top-${x}-${z}`, [
			x,
			1.24,
			z
		], [
			2.2,
			.12,
			1.38
		], rubberMat);
		detailBox("terminal-story", `skyline-cart-rail-north-${x}-${z}`, [
			x,
			1.58,
			z - .69
		], [
			2.35,
			.08,
			.08
		], structureMat);
		detailBox("terminal-story", `skyline-cart-rail-south-${x}-${z}`, [
			x,
			1.58,
			z + .69
		], [
			2.35,
			.08,
			.08
		], structureMat);
		for (const wheelX of [x - .82, x + .82]) {
			detailBox("terminal-story", `skyline-cart-wheel-${wheelX}-${z}`, [
				wheelX,
				.22,
				z - .68
			], [
				.42,
				.42,
				.18
			], rubberMat);
			detailBox("terminal-story", `skyline-cart-wheel-${wheelX}-${z}-south`, [
				wheelX,
				.22,
				z + .68
			], [
				.42,
				.42,
				.18
			], rubberMat);
		}
	}
	for (const [x, z] of [
		[-2.1, 11.5],
		[2.1, 11.5],
		[-2.1, -7.5],
		[2.1, -7.5]
	]) detailBox("apron-marking", `skyline-wheel-chock-${x}-${z}`, [
		x,
		.18,
		z
	], [
		.58,
		.34,
		.42
	], hazardMat, "performance", [
		0,
		Math.PI / 4,
		0
	]);
	for (const bandX of [
		-12.2,
		-10,
		-7.8
	]) detailBox("terminal-story", `skyline-fuel-tank-band-${bandX}`, [
		bandX,
		1.5,
		18
	], [
		.12,
		2.3,
		2.72
	], structureMat);
	box(builder, "skyline-fence-north", [
		0,
		1.5,
		-35.8
	], [
		72,
		3,
		.4
	], jetbridgeMat);
	box(builder, "skyline-fence-south", [
		0,
		1.5,
		35.8
	], [
		72,
		3,
		.4
	], jetbridgeMat);
	box(builder, "skyline-fence-west", [
		-35.8,
		1.5,
		0
	], [
		.4,
		3,
		72
	], jetbridgeMat);
	box(builder, "skyline-fence-east", [
		35.8,
		1.5,
		0
	], [
		.4,
		3,
		72
	], jetbridgeMat);
	const physicalCover = [
		{
			id: "jetliner-engine-south",
			bounds: {
				minX: -1.1,
				maxX: 1.1,
				minZ: 9.75,
				maxZ: 14.25
			},
			blocksMovement: true,
			blocksShots: true
		},
		{
			id: "terminal-backwall",
			bounds: {
				minX: -31,
				maxX: 31,
				minZ: -34.3,
				maxZ: -33.9
			},
			blocksMovement: true,
			blocksShots: true
		},
		{
			id: "concourse-seating-west",
			bounds: {
				minX: -12.6,
				maxX: -7.4,
				minZ: -16.95,
				maxZ: -16.45
			},
			blocksMovement: true,
			blocksShots: true
		},
		{
			id: "concourse-seating-east",
			bounds: {
				minX: 7.4,
				maxX: 12.6,
				minZ: -16.95,
				maxZ: -16.45
			},
			blocksMovement: true,
			blocksShots: true
		},
		{
			id: "concourse-planter-west",
			bounds: {
				minX: -26.9,
				maxX: -23.1,
				minZ: -18.78,
				maxZ: -17.22
			},
			blocksMovement: true,
			blocksShots: true
		},
		{
			id: "concourse-planter-east",
			bounds: {
				minX: 23.1,
				maxX: 26.9,
				minZ: -18.78,
				maxZ: -17.22
			},
			blocksMovement: true,
			blocksShots: true
		},
		{
			id: "cargo-stack-north",
			bounds: {
				minX: -22.3,
				maxX: -17.7,
				minZ: 16.7,
				maxZ: 19.3
			},
			blocksMovement: true,
			blocksShots: true
		},
		{
			id: "cargo-stack-south",
			bounds: {
				minX: 17.7,
				maxX: 22.3,
				minZ: 16.7,
				maxZ: 19.3
			},
			blocksMovement: true,
			blocksShots: true
		},
		{
			id: "fuel-trailer-station",
			bounds: {
				minX: -13,
				maxX: -7,
				minZ: 16.6,
				maxZ: 19.4
			},
			blocksMovement: true,
			blocksShots: true
		},
		{
			id: "upper-kiosk-west",
			bounds: {
				minX: -14.2,
				maxX: -9.8,
				minZ: -32.1,
				maxZ: -29.9
			},
			blocksMovement: true,
			blocksShots: true
		},
		{
			id: "upper-kiosk-east",
			bounds: {
				minX: 9.8,
				maxX: 14.2,
				minZ: -32.1,
				maxZ: -29.9
			},
			blocksMovement: true,
			blocksShots: true
		},
		{
			id: "wood-pallet-stack-west",
			bounds: {
				minX: -27.6,
				maxX: -22.4,
				minZ: 7.7,
				maxZ: 10.3
			},
			blocksMovement: true,
			blocksShots: true
		},
		{
			id: "wood-pallet-stack-east",
			bounds: {
				minX: 22.7,
				maxX: 25.3,
				minZ: 19.4,
				maxZ: 24.6
			},
			blocksMovement: true,
			blocksShots: true
		}
	];
	root.userData.skylinePresentationBatches = batchPresentationOnlyBoxes(root, "skyline");
	const collisionPresentationAudit = [];
	root.traverse((node) => {
		if (!(node instanceof Mesh) || node.userData.skylineQualityPlaceholder !== true) return;
		const authorityId = node.userData.skylineCollisionAuthorityId;
		const presentationNames = [];
		if (authorityId) root.traverse((candidate) => {
			if (candidate !== node && candidate instanceof Mesh && candidate.userData.skylineQualityPlaceholder !== true && candidate.userData.skylineCollisionAuthorityId === authorityId) presentationNames.push(candidate.name);
		});
		collisionPresentationAudit.push(Object.freeze({
			placeholder: node.name,
			authorityId: authorityId ?? null,
			presentationNames: Object.freeze(presentationNames.sort())
		}));
	});
	root.userData.skylineCollisionPresentationAudit = Object.freeze({
		version: "hf-188-profile-authority-v1",
		entries: Object.freeze(collisionPresentationAudit.sort((left, right) => left.placeholder.localeCompare(right.placeholder))),
		unownedPlaceholders: Object.freeze(collisionPresentationAudit.filter((entry) => !entry.authorityId || entry.presentationNames.length === 0).map((entry) => entry.placeholder).sort())
	});
	root.userData.skylineOpeningAudit = skylineOpeningParityAudit(builder, [
		{
			id: "terminal-gate",
			aperture: {
				minX: -1.5,
				maxX: 1.5,
				minY: 3.55,
				maxY: 5,
				minZ: -12.05,
				maxZ: -11.55
			}
		},
		{
			id: "aircraft-boarding",
			aperture: {
				minX: -1.45,
				maxX: 1.45,
				minY: 4,
				maxY: 5.05,
				minZ: -.05,
				maxZ: .45
			}
		},
		{
			id: "cockpit-entry",
			aperture: {
				minX: -17.75,
				maxX: -17.3,
				minY: 2.8,
				maxY: 5,
				minZ: .6,
				maxZ: 3.4
			}
		}
	]);
	root.userData.skylinePlatformAuthorityAudit = {
		version: "pass64-shared-platform-authority-v1",
		wingSliceCount,
		wingAuthorityMaximumOverhang,
		platforms: walkablePlatforms.map((platform) => ({
			id: platform.id,
			presentationName: platform.presentationName,
			qualityPresentationName: platform.qualityPresentationName ?? null,
			bounds: { ...platform.bounds },
			y: platform.y,
			movementAuthority: builder.colliders.includes(platform.bounds),
			physicsAuthority: builder.physicsColliders.includes(platform.bounds),
			shotAuthority: builder.shotSurfaces.some((surface) => surface.id === platform.ballisticSurfaceId)
		}))
	};
	root.userData.skylineRoutes = {
		"concourse-to-mezzanine": [
			{
				id: "escalator-foot",
				position: [
					-20,
					1.7,
					-20.45
				]
			},
			{
				id: "escalator-top",
				position: [
					-20,
					5.04,
					-28.45
				]
			},
			{
				id: "mezzanine-center",
				position: [
					0,
					5.04,
					-28
				]
			}
		],
		"mezzanine-to-jetbridge": [
			{
				id: "mezzanine-gate",
				position: [
					0,
					5.04,
					-22
				]
			},
			{
				id: "gate-connector",
				position: [
					0,
					5.02,
					-17
				]
			},
			{
				id: "jetbridge-interior",
				position: [
					0,
					5.02,
					-7
				]
			},
			{
				id: "jetbridge-ramp-top",
				position: [
					0,
					5.02,
					-2.03
				]
			},
			{
				id: "cabin-door",
				position: [
					0,
					4.25,
					.4
				]
			}
		],
		"fuselage-to-tarmac": [
			{
				id: "cabin-rear",
				position: [
					14,
					4.25,
					2
				]
			},
			{
				id: "airstair-top",
				position: [
					17.45,
					4.25,
					2
				]
			},
			{
				id: "airstair-foot",
				position: [
					21.35,
					1.7,
					2
				]
			},
			{
				id: "apron-tarmac",
				position: [
					24,
					1.7,
					2
				]
			}
		],
		"cabin-through-aisle": [
			{
				id: "cabin-forward",
				position: [
					-15.4,
					4.25,
					2
				]
			},
			{
				id: "cabin-mid",
				position: [
					0,
					4.25,
					2
				]
			},
			{
				id: "cabin-rear",
				position: [
					15.4,
					4.25,
					2
				]
			}
		],
		"cabin-to-cockpit": [
			{
				id: "cabin-forward",
				position: [
					-15.4,
					4.25,
					2
				]
			},
			{
				id: "cockpit-entry",
				position: [
					-17.55,
					4.25,
					2
				]
			},
			{
				id: "cockpit-controls",
				position: [
					-19.25,
					4.25,
					2
				]
			}
		]
	};
	root.userData.verticalNavigation = {
		routes: [
			{
				id: "west-escalator",
				foot: [
					-20,
					0,
					-20.45
				],
				top: [
					-20,
					3.34,
					-28.45
				]
			},
			{
				id: "east-escalator",
				foot: [
					20,
					0,
					-20.45
				],
				top: [
					20,
					3.34,
					-28.45
				]
			},
			{
				id: "rear-airstair",
				foot: [
					21.35,
					0,
					2
				],
				top: [
					17.45,
					2.55,
					2
				]
			}
		],
		ramps: [
			{
				id: "west-escalator",
				from: [
					-20,
					0,
					-20.45
				],
				to: [
					-20,
					3.34,
					-28.45
				],
				width: 3.2
			},
			{
				id: "east-escalator",
				from: [
					20,
					0,
					-20.45
				],
				to: [
					20,
					3.34,
					-28.45
				],
				width: 3.2
			},
			{
				id: "jetbridge-cabin-ramp",
				from: [
					0,
					3.32,
					-2.03
				],
				to: [
					0,
					2.55,
					.03
				],
				width: 3.6
			},
			{
				id: "rear-airstair",
				from: [
					21.35,
					0,
					2
				],
				to: [
					17.45,
					2.55,
					2
				],
				width: 2.2
			}
		],
		platforms: walkablePlatforms.map((platform) => ({
			id: platform.id,
			minX: platform.bounds.minX,
			maxX: platform.bounds.maxX,
			minZ: platform.bounds.minZ,
			maxZ: platform.bounds.maxZ,
			y: platform.y
		}))
	};
	root.userData.skylineAccess = {
		escalatorAngleDegrees: 22,
		jetbridgeRampAngleDegrees: MathUtils.radToDeg(jetbridgeRampAngle),
		airstairAngleDegrees: 32,
		maxClimbDegrees: 50
	};
	return {
		id: "skyline-terminal",
		label: "Terminal",
		root,
		colliders: builder.colliders,
		physicsColliders: builder.physicsColliders,
		raycastMeshes: builder.raycastMeshes,
		shotSurfaces: builder.shotSurfaces,
		spawns: spawnRecord([
			[-27, -14],
			[-18, -14],
			[-6, -14],
			[6, -14],
			[18, -14],
			[27, -14]
		], [
			[-24, 30],
			[-16, 30],
			[-8, 30],
			[8, 30],
			[16, 30],
			[24, 30]
		]),
		patrolPoints: [
			[-26, -18],
			[-16, -18],
			[-8, -18],
			[8, -18],
			[16, -18],
			[26, -18],
			[0, 8],
			[-18, 12],
			[18, 12],
			[-26, 24],
			[-4, 24],
			[4, 24],
			[26, 24],
			[0, 32]
		].map(([x, z]) => new Vector3(x, 0, z)),
		targets: [],
		houses: [],
		breakableWindows,
		physicalCover,
		bounds: {
			minX: -35,
			maxX: 35,
			minZ: -35,
			maxZ: 35
		},
		houseTelemetry: emptyTelemetry()
	};
}
//#endregion
export { makeEmissiveOnly as C, auditLocalLightOcclusion as S, nearestGunRangeTestBayWeaponStation as _, applyGunRangeTestBayDoorState as a, GUN_RANGE_WEAPON_STATIONS as b, buildRustworks1v1 as c, GUN_RANGE_TEST_BAY_CONTRACT as d, advanceGunRangeTestBayDoorForObservers as f, nearestGunRangeTestBaySupportStation as g, gunRangeTestBayRenderedDummyPose as h, applyAdditionalMapPresentationProfile as i, buildSkylineTerminal as l, gunRangeTestBayDummyPose as m, RUSTWORKS_CONTAINER_LIGHTS as n, applyRustworksPresentationProfile as o, createGunRangeTestBayDoorState as p, RUSTWORKS_WORK_LIGHTS as r, buildGunRange as s, GUN_RANGE_FIRING_LINE_Z as t, updateGunRangePresentation as u, projectGunRangeTestBayDoorState as v, makeShadowedLocal as w, nearestGunRangeWeaponStation as x, resolveGunRangeDummyDamage as y };
