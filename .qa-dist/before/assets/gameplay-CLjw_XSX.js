import { $c as Matrix4, $l as PerspectiveCamera, Ba as Box3, Cu as RGBAFormat, Dd as Shape, Fs as Group, Ga as BufferGeometry, Gc as LoopRepeat, Ha as BoxGeometry, If as Vector3, La as Bone, Ld as SphereGeometry, Od as ShapeGeometry, Pd as SkinnedMesh, Po as CylinderGeometry, Ql as Path, Rl as Object3D, Ro as DataTexture, Sd as SRGBColorSpace, Uc as LoopOnce, Wa as BufferAttribute, Xc as MathUtils, Yl as OrthographicCamera, Ys as InstancedMesh, Za as CanvasTexture, _a as AnimationClip, _s as Float32BufferAttribute, al as MeshLambertMaterial, cf as TextureLoader, cl as MeshPhongMaterial, ds as Euler, ff as TorusGeometry, fo as ConeGeometry, hu as QuaternionKeyframeTrack, i as mergeGeometries, io as Color, ll as MeshPhysicalMaterial, md as RepeatWrapping, mu as Quaternion, n as clone, nl as MeshBasicMaterial, ns as DynamicDrawUsage, od as Ray, r as RoundedBoxGeometry, sf as Texture, t as MeshoptDecoder, tc as InterleavedBufferAttribute, tl as Mesh, to as CircleGeometry, tu as PlaneGeometry, ul as MeshStandardMaterial, uu as PropertyBinding, wd as Scene, ya as AnimationMixer } from "./vendor-three-aHPbjK02.js";
import { g as HOUSE_LAYOUT } from "./combat-feedback-BhVh1Qvu.js";
import { n as createRandomStreams } from "./deterministic-rng-BQQqJEF8.js";
import { t as GLTFLoader } from "./vendor-three-loaders-LNfkXuCO.js";
//#region src/arena-identity.ts
/**
* Lightweight canonical arena identity boundary.
*
* Protocol and persistence validators import this module instead of the full
* selector registry so validation cannot initialize gameplay/bot systems in a
* partially constructed module cycle.
*/
var ARENA_IDS = Object.freeze([
	"atomic-acres",
	"skyline-terminal",
	"rustworks-1v1",
	"gun-range",
	"farcrysis",
	"high-seas",
	"test1",
	"test2"
]);
var CURRENT_ARENA_IDS = new Set(ARENA_IDS);
/** Strict current-id guard; routes, aliases and case variants are rejected. */
function isArenaId(value) {
	return typeof value === "string" && CURRENT_ARENA_IDS.has(value);
}
//#endregion
//#region src/combat/weapon-schema.ts
var WEAPON_MATERIAL_POLICY_ID = "pass64-ballistic-materials-v1";
var WEAPON_SLOTS = Object.freeze([
	"primary",
	"secondary",
	"special"
]);
var WEAPON_FAMILIES = Object.freeze([
	"assault-rifle",
	"smg",
	"lmg",
	"marksman",
	"shotgun",
	"sidearm",
	"launcher"
]);
var WEAPON_FIRE_KINDS = Object.freeze([
	"hitscan",
	"pellet",
	"slug",
	"projectile"
]);
var WEAPON_FIRE_MODES = Object.freeze(["semi", "automatic"]);
var WeaponSchemaValidationError = class extends Error {
	issues;
	constructor(issues) {
		super(`Invalid weapon schema: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
		this.name = "WeaponSchemaValidationError";
		this.issues = Object.freeze([...issues]);
	}
};
var IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
var FORBIDDEN_DISPLAY_NAME_PATTERN = /[\u0000-\u001f\u007f]/;
var MAX_DEFINITION_COUNT = 128;
var MAX_EVIDENCE_ID_COUNT = 64;
var MAX_COMPANION_PRIMARY_COUNT = 64;
var MAX_SCHEMA_ISSUES = 128;
var MAX_SNAPSHOT_KEYS = 256;
var MAX_SNAPSHOT_DEPTH = 12;
var MAX_SNAPSHOT_ARRAY_LENGTH = MAX_DEFINITION_COUNT;
var WEAPON_KEYS = Object.freeze([
	"id",
	"displayName",
	"slot",
	"family",
	"fireKind",
	"fireMode",
	"rpm",
	"pellets",
	"spinUpMs",
	"movementMultiplier",
	"damage",
	"spread",
	"recoil",
	"ammo",
	"penetration",
	"effects",
	"optic",
	"projectileId",
	"policies",
	"modelSetId",
	"presentationId",
	"audioId",
	"provenanceId",
	"evidenceIds"
]);
function issue(issues, path, code, message) {
	if (issues.length >= MAX_SCHEMA_ISSUES) {
		if (issues[MAX_SCHEMA_ISSUES - 1]?.code !== "issue-limit") issues[MAX_SCHEMA_ISSUES - 1] = Object.freeze({
			path: "$",
			code: "issue-limit",
			message: `validation stopped after ${MAX_SCHEMA_ISSUES - 1} detailed issues`
		});
		return;
	}
	issues.push(Object.freeze({
		path,
		code,
		message
	}));
}
function isRecord$11(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function snapshotFailure(issues, path, operation) {
	issue(issues, path, "type", `${operation} could not be read safely`);
}
function snapshotOwnKeys(value, path, issues) {
	try {
		const keys = Reflect.ownKeys(value);
		if (keys.length > MAX_SNAPSHOT_KEYS) issue(issues, path, "bounds", `must not expose more than ${MAX_SNAPSHOT_KEYS} own properties`);
		return keys.slice(0, MAX_SNAPSHOT_KEYS);
	} catch {
		snapshotFailure(issues, path, "own property keys");
		return null;
	}
}
function snapshotDescriptor(value, key, path, issues) {
	try {
		const first = Reflect.getOwnPropertyDescriptor(value, key);
		const second = Reflect.getOwnPropertyDescriptor(value, key);
		if (!first || !second) {
			snapshotFailure(issues, path, "own property descriptor");
			return null;
		}
		const firstIsData = Object.hasOwn(first, "value");
		if (!(firstIsData === Object.hasOwn(second, "value") && first.configurable === second.configurable && first.enumerable === second.enumerable && (firstIsData ? first.writable === second.writable && Object.is(first.value, second.value) : first.get === second.get && first.set === second.set))) {
			issue(issues, path, "cross-field", "own property descriptor changed during snapshot");
			return null;
		}
		return first;
	} catch {
		snapshotFailure(issues, path, "own property descriptor");
		return null;
	}
}
function snapshotArray(value, path, issues, active, depth) {
	const lengthDescriptor = snapshotDescriptor(value, "length", `${path}.length`, issues);
	if (!lengthDescriptor) return [];
	if (!Object.hasOwn(lengthDescriptor, "value")) {
		issue(issues, `${path}.length`, "type", "accessor properties are forbidden");
		return [];
	}
	const length = lengthDescriptor.value;
	if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > MAX_SNAPSHOT_ARRAY_LENGTH) {
		issue(issues, `${path}.length`, "bounds", `must be a safe integer from 0 through ${MAX_SNAPSHOT_ARRAY_LENGTH}`);
		return [];
	}
	const snapshot = new Array(length);
	const keys = snapshotOwnKeys(value, path, issues);
	if (!keys) return snapshot;
	for (const key of keys) {
		if (key === "length") continue;
		if (typeof key === "symbol") {
			issue(issues, `${path}[${String(key)}]`, "unknown-key", "symbol array properties are forbidden");
			continue;
		}
		const index = Number(key);
		if (!(Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key)) {
			issue(issues, `${path}.${key}`, "unknown-key", "non-index array properties are forbidden");
			continue;
		}
		const propertyPath = `${path}[${index}]`;
		const descriptor = snapshotDescriptor(value, key, propertyPath, issues);
		if (!descriptor) continue;
		if (!descriptor.enumerable) {
			issue(issues, propertyPath, "unknown-key", "non-enumerable array entries are forbidden");
			continue;
		}
		if (!Object.hasOwn(descriptor, "value")) {
			issue(issues, propertyPath, "type", "accessor properties are forbidden");
			continue;
		}
		snapshot[index] = snapshotValue(descriptor.value, propertyPath, issues, active, depth + 1);
	}
	return snapshot;
}
function snapshotRecord(value, path, issues, active, depth) {
	const snapshot = Object.create(null);
	const keys = snapshotOwnKeys(value, path, issues);
	if (!keys) return snapshot;
	for (const key of keys) {
		if (typeof key === "symbol") {
			issue(issues, `${path}[${String(key)}]`, "unknown-key", "symbol object properties are forbidden");
			continue;
		}
		const propertyPath = `${path}.${key}`;
		const descriptor = snapshotDescriptor(value, key, propertyPath, issues);
		if (!descriptor) continue;
		if (!descriptor.enumerable) {
			issue(issues, propertyPath, "unknown-key", "non-enumerable object properties are forbidden");
			continue;
		}
		if (!Object.hasOwn(descriptor, "value")) {
			issue(issues, propertyPath, "type", "accessor properties are forbidden");
			continue;
		}
		snapshot[key] = snapshotValue(descriptor.value, propertyPath, issues, active, depth + 1);
	}
	return snapshot;
}
function snapshotValue(value, path, issues, active, depth) {
	if (value === null || typeof value !== "object") return value;
	if (depth > MAX_SNAPSHOT_DEPTH) {
		issue(issues, path, "bounds", `must not exceed snapshot depth ${MAX_SNAPSHOT_DEPTH}`);
		return null;
	}
	if (active.has(value)) {
		issue(issues, path, "cross-field", "cyclic values are forbidden");
		return null;
	}
	let array;
	try {
		array = Array.isArray(value);
	} catch {
		snapshotFailure(issues, path, "value kind");
		return null;
	}
	active.add(value);
	try {
		return array ? snapshotArray(value, path, issues, active, depth) : snapshotRecord(value, path, issues, active, depth);
	} catch {
		snapshotFailure(issues, path, "value snapshot");
		return null;
	} finally {
		active.delete(value);
	}
}
function snapshotInput(value, issues) {
	try {
		return snapshotValue(value, "$", issues, /* @__PURE__ */ new WeakSet(), 0);
	} catch {
		snapshotFailure(issues, "$", "input snapshot");
		return null;
	}
}
function exactRecord(value, path, keys, issues) {
	if (!isRecord$11(value)) {
		issue(issues, path, "type", "must be an object");
		return null;
	}
	const allowed = new Set(keys);
	for (const key of keys) if (!Object.hasOwn(value, key)) issue(issues, `${path}.${key}`, "missing-key", "is required");
	for (const key of Object.keys(value)) if (!allowed.has(key)) issue(issues, `${path}.${key}`, "unknown-key", "is not allowed");
	return value;
}
function oneOf(value, values, path, issues) {
	if (typeof value !== "string" || !values.includes(value)) {
		issue(issues, path, "unsupported-value", `must be one of ${values.join(", ")}`);
		return false;
	}
	return true;
}
function boundedNumber(value, minimum, maximum, path, issues) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		issue(issues, path, "type", "must be a finite number");
		return false;
	}
	if (value < minimum || value > maximum) {
		issue(issues, path, "bounds", `must be between ${minimum} and ${maximum}`);
		return false;
	}
	return true;
}
function boundedInteger$7(value, minimum, maximum, path, issues) {
	if (!boundedNumber(value, minimum, maximum, path, issues)) return false;
	if (!Number.isInteger(value)) {
		issue(issues, path, "type", "must be an integer");
		return false;
	}
	return true;
}
function identifier(value, path, issues) {
	if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
		issue(issues, path, "format", "must be a lowercase ASCII slug of at most 64 characters");
		return false;
	}
	return true;
}
function displayName(value, path, issues) {
	if (typeof value !== "string" || value.length < 2 || value.length > 80 || value.trim() !== value || FORBIDDEN_DISPLAY_NAME_PATTERN.test(value)) issue(issues, path, "format", "must be a trimmed 2-80 character string without control characters");
}
function validateDenseArray(value, path, issues) {
	for (let index = 0; index < value.length; index += 1) if (!Object.hasOwn(value, index)) issue(issues, `${path}[${index}]`, "missing-key", "sparse array slots are forbidden");
	for (const key of Reflect.ownKeys(value)) {
		if (!Object.getOwnPropertyDescriptor(value, key)?.enumerable) continue;
		if (typeof key === "symbol") {
			issue(issues, `${path}[${String(key)}]`, "unknown-key", "non-index array properties are forbidden");
			continue;
		}
		const index = Number(key);
		if (!(Number.isSafeInteger(index) && index >= 0 && index < value.length && String(index) === key)) issue(issues, `${path}.${key}`, "unknown-key", "non-index array properties are forbidden");
	}
}
function uniqueIdentifierArray(value, path, minimum, maximum, issues) {
	if (!Array.isArray(value)) {
		issue(issues, path, "type", "must be an array");
		return;
	}
	if (value.length < minimum || value.length > maximum) issue(issues, path, "bounds", `must contain between ${minimum} and ${maximum} entries`);
	if (value.length > maximum) return;
	validateDenseArray(value, path, issues);
	const seen = /* @__PURE__ */ new Set();
	for (let index = 0; index < value.length; index += 1) {
		if (!Object.hasOwn(value, index)) continue;
		const entry = value[index];
		if (!identifier(entry, `${path}[${index}]`, issues)) continue;
		if (seen.has(entry)) issue(issues, `${path}[${index}]`, "duplicate", `duplicates ${entry}`);
		seen.add(entry);
	}
}
function validateDamage(value, path, issues) {
	const damage = exactRecord(value, path, [
		"policy",
		"base",
		"minimum",
		"falloffStartM",
		"falloffEndM",
		"headMultiplier",
		"limbMultiplier"
	], issues);
	if (!damage) return;
	const policyValid = oneOf(damage.policy, ["standard", "head-only"], `${path}.policy`, issues);
	const base = damage.base;
	const minimum = damage.minimum;
	const falloffStartM = damage.falloffStartM;
	const falloffEndM = damage.falloffEndM;
	const baseValid = boundedNumber(base, 0, 1e4, `${path}.base`, issues);
	const minimumValid = boundedNumber(minimum, 0, 1e4, `${path}.minimum`, issues);
	const startValid = boundedNumber(falloffStartM, 0, 2e3, `${path}.falloffStartM`, issues);
	const endValid = boundedNumber(falloffEndM, 0, 2e3, `${path}.falloffEndM`, issues);
	boundedNumber(damage.headMultiplier, 0, 10, `${path}.headMultiplier`, issues);
	boundedNumber(damage.limbMultiplier, 0, 10, `${path}.limbMultiplier`, issues);
	if (baseValid && minimumValid && minimum > base) issue(issues, `${path}.minimum`, "cross-field", "cannot exceed base damage");
	if (startValid && endValid && falloffEndM < falloffStartM) issue(issues, `${path}.falloffEndM`, "cross-field", "cannot precede falloffStartM");
	if (policyValid && damage.policy === "head-only" && (damage.headMultiplier !== 1 || damage.limbMultiplier !== 0)) issue(issues, path, "cross-field", "head-only requires headMultiplier 1 and limbMultiplier 0");
}
function validateSpread(value, path, issues) {
	const spread = exactRecord(value, path, [
		"hipRadians",
		"adsMultiplier",
		"movementMultiplier",
		"standMultiplier",
		"crouchMultiplier",
		"proneMultiplier",
		"sustainedPerShot",
		"maximumRadians"
	], issues);
	if (!spread) return;
	const hipRadians = spread.hipRadians;
	const maximumRadians = spread.maximumRadians;
	const sustainedPerShot = spread.sustainedPerShot;
	const hipValid = boundedNumber(hipRadians, 0, Math.PI / 2, `${path}.hipRadians`, issues);
	const maximumValid = boundedNumber(maximumRadians, 0, Math.PI / 2, `${path}.maximumRadians`, issues);
	for (const key of [
		"adsMultiplier",
		"movementMultiplier",
		"standMultiplier",
		"crouchMultiplier",
		"proneMultiplier"
	]) boundedNumber(spread[key], 0, 4, `${path}.${key}`, issues);
	const sustainedValid = boundedNumber(sustainedPerShot, 0, Math.PI / 2, `${path}.sustainedPerShot`, issues);
	if (spread.standMultiplier !== 1) issue(issues, `${path}.standMultiplier`, "cross-field", "must equal 1");
	if (hipValid && maximumValid && maximumRadians < hipRadians) issue(issues, `${path}.maximumRadians`, "cross-field", "cannot be less than hipRadians");
	if (sustainedValid && maximumValid && sustainedPerShot > maximumRadians) issue(issues, `${path}.sustainedPerShot`, "cross-field", "cannot exceed maximumRadians");
}
function validateRecoil(value, path, issues) {
	const recoil = exactRecord(value, path, [
		"pitchRadians",
		"yawRadians",
		"recoveryPerSecond",
		"adsMultiplier",
		"standMultiplier",
		"crouchMultiplier",
		"proneMultiplier",
		"deterministicPatternId"
	], issues);
	if (!recoil) return;
	boundedNumber(recoil.pitchRadians, 0, Math.PI, `${path}.pitchRadians`, issues);
	boundedNumber(recoil.yawRadians, 0, Math.PI, `${path}.yawRadians`, issues);
	boundedNumber(recoil.recoveryPerSecond, .01, 100, `${path}.recoveryPerSecond`, issues);
	for (const key of [
		"adsMultiplier",
		"standMultiplier",
		"crouchMultiplier",
		"proneMultiplier"
	]) boundedNumber(recoil[key], 0, 4, `${path}.${key}`, issues);
	if (recoil.standMultiplier !== 1) issue(issues, `${path}.standMultiplier`, "cross-field", "must equal 1");
	identifier(recoil.deterministicPatternId, `${path}.deterministicPatternId`, issues);
}
function validateAmmo(value, path, issues) {
	const ammo = exactRecord(value, path, [
		"magazine",
		"reserve",
		"reloadSeconds",
		"emptyReloadSeconds",
		"switchSeconds"
	], issues);
	if (!ammo) return;
	boundedInteger$7(ammo.magazine, 1, 2e3, `${path}.magazine`, issues);
	boundedInteger$7(ammo.reserve, 0, 1e4, `${path}.reserve`, issues);
	const reloadSeconds = ammo.reloadSeconds;
	const emptyReloadSeconds = ammo.emptyReloadSeconds;
	const reloadValid = boundedNumber(reloadSeconds, .05, 30, `${path}.reloadSeconds`, issues);
	const emptyValid = boundedNumber(emptyReloadSeconds, .05, 30, `${path}.emptyReloadSeconds`, issues);
	boundedNumber(ammo.switchSeconds, .01, 10, `${path}.switchSeconds`, issues);
	if (reloadValid && emptyValid && emptyReloadSeconds < reloadSeconds) issue(issues, `${path}.emptyReloadSeconds`, "cross-field", "cannot be shorter than reloadSeconds");
}
function validatePenetration(value, path, issues) {
	const penetration = exactRecord(value, path, [
		"calibreLabel",
		"power",
		"fmjMultiplier",
		"wallPenetrationMultiplier",
		"materialPolicyId",
		"energyFalloffStartM",
		"energyFalloffEndM",
		"minimumEnergyRetention",
		"minimumWallDamageMultiplier",
		"maximumSurfaces"
	], issues);
	if (!penetration) return;
	if (typeof penetration.calibreLabel !== "string" || penetration.calibreLabel.length < 1 || penetration.calibreLabel.length > 40 || penetration.calibreLabel.trim() !== penetration.calibreLabel || FORBIDDEN_DISPLAY_NAME_PATTERN.test(penetration.calibreLabel)) issue(issues, `${path}.calibreLabel`, "format", "must be a trimmed 1-40 character string without control characters");
	boundedNumber(penetration.power, 0, 1e5, `${path}.power`, issues);
	boundedNumber(penetration.fmjMultiplier, 1, 4, `${path}.fmjMultiplier`, issues);
	boundedNumber(penetration.wallPenetrationMultiplier, .25, 4, `${path}.wallPenetrationMultiplier`, issues);
	if (penetration.materialPolicyId !== "pass64-ballistic-materials-v1") issue(issues, `${path}.materialPolicyId`, "unsupported-value", `must equal ${WEAPON_MATERIAL_POLICY_ID}`);
	const energyFalloffStartM = penetration.energyFalloffStartM;
	const energyFalloffEndM = penetration.energyFalloffEndM;
	const startValid = boundedNumber(energyFalloffStartM, 0, 2e3, `${path}.energyFalloffStartM`, issues);
	const endValid = boundedNumber(energyFalloffEndM, 0, 2001, `${path}.energyFalloffEndM`, issues);
	if (startValid && endValid && energyFalloffEndM <= energyFalloffStartM) issue(issues, `${path}.energyFalloffEndM`, "cross-field", "must be greater than energyFalloffStartM");
	boundedNumber(penetration.minimumEnergyRetention, 0, 1, `${path}.minimumEnergyRetention`, issues);
	boundedNumber(penetration.minimumWallDamageMultiplier, 0, 1, `${path}.minimumWallDamageMultiplier`, issues);
	boundedInteger$7(penetration.maximumSurfaces, 0, 64, `${path}.maximumSurfaces`, issues);
}
function validateEffects(value, path, issues) {
	const effects = exactRecord(value, path, [
		"tracerColorHex",
		"muzzleFlashScale",
		"reportGain",
		"flashlight"
	], issues);
	if (!effects) return;
	boundedInteger$7(effects.tracerColorHex, 0, 16777215, `${path}.tracerColorHex`, issues);
	boundedNumber(effects.muzzleFlashScale, .1, 4, `${path}.muzzleFlashScale`, issues);
	boundedNumber(effects.reportGain, .1, 2, `${path}.reportGain`, issues);
	if (effects.flashlight === null) return;
	const flashlight = exactRecord(effects.flashlight, `${path}.flashlight`, [
		"kind",
		"colorHex",
		"intensity",
		"rangeM",
		"coneAngleRadians",
		"solidOcclusion"
	], issues);
	if (!flashlight) return;
	if (flashlight.kind !== "always-on") issue(issues, `${path}.flashlight.kind`, "unsupported-value", "must equal always-on");
	boundedInteger$7(flashlight.colorHex, 0, 16777215, `${path}.flashlight.colorHex`, issues);
	boundedNumber(flashlight.intensity, .1, 40, `${path}.flashlight.intensity`, issues);
	boundedNumber(flashlight.rangeM, 1, 40, `${path}.flashlight.rangeM`, issues);
	boundedNumber(flashlight.coneAngleRadians, .05, Math.PI / 2, `${path}.flashlight.coneAngleRadians`, issues);
	if (flashlight.solidOcclusion !== "required") issue(issues, `${path}.flashlight.solidOcclusion`, "unsupported-value", "must equal required");
}
function validateOptic(value, path, issues) {
	if (value === null) return;
	if (!isRecord$11(value)) {
		issue(issues, path, "type", "must be null or an optic object");
		return;
	}
	if (value.kind === "standard") {
		const optic = exactRecord(value, path, [
			"kind",
			"magnification",
			"solidOcclusion"
		], issues);
		if (!optic) return;
		boundedNumber(optic.magnification, 1, 16, `${path}.magnification`, issues);
		if (optic.solidOcclusion !== "required") issue(issues, `${path}.solidOcclusion`, "unsupported-value", "must equal required");
		return;
	}
	if (value.kind === "thermal-smoke-only") {
		const optic = exactRecord(value, path, [
			"kind",
			"magnification",
			"solidOcclusion",
			"targetPolicy",
			"authority"
		], issues);
		if (!optic) return;
		if (optic.magnification !== 2.5) issue(issues, `${path}.magnification`, "unsupported-value", "must equal 2.5");
		if (optic.solidOcclusion !== "required") issue(issues, `${path}.solidOcclusion`, "unsupported-value", "must equal required");
		if (optic.targetPolicy !== "living-targets-through-smoke") issue(issues, `${path}.targetPolicy`, "unsupported-value", "must equal living-targets-through-smoke");
		if (optic.authority !== "presentation-only") issue(issues, `${path}.authority`, "unsupported-value", "must equal presentation-only");
		return;
	}
	if (value.kind === "special-authority") {
		const optic = exactRecord(value, path, [
			"kind",
			"magnification",
			"solidOcclusion",
			"authorityPolicyId"
		], issues);
		if (!optic) return;
		boundedNumber(optic.magnification, 1, 16, `${path}.magnification`, issues);
		if (optic.solidOcclusion !== "required") issue(issues, `${path}.solidOcclusion`, "unsupported-value", "must equal required");
		oneOf(optic.authorityPolicyId, ["host-shot-v1", "host-railgun-v1"], `${path}.authorityPolicyId`, issues);
		return;
	}
	exactRecord(value, path, ["kind"], issues);
	issue(issues, `${path}.kind`, "unsupported-value", "must be standard, thermal-smoke-only, or special-authority");
}
function validateRangePolicy(value, path, issues) {
	if (!isRecord$11(value)) {
		issue(issues, path, "type", "must be a range policy object");
		return;
	}
	if (value.kind === "station") {
		const policy = exactRecord(value, path, ["kind", "stationId"], issues);
		if (policy) identifier(policy.stationId, `${path}.stationId`, issues);
		return;
	}
	if (value.kind === "companion-sidearm") {
		const policy = exactRecord(value, path, ["kind", "primaryIds"], issues);
		if (policy) uniqueIdentifierArray(policy.primaryIds, `${path}.primaryIds`, 1, MAX_COMPANION_PRIMARY_COUNT, issues);
		return;
	}
	if (value.kind === "entitlement-only") {
		const policy = exactRecord(value, path, ["kind", "entitlementPolicyId"], issues);
		if (policy) identifier(policy.entitlementPolicyId, `${path}.entitlementPolicyId`, issues);
		return;
	}
	if (value.kind === "never") {
		exactRecord(value, path, ["kind"], issues);
		return;
	}
	exactRecord(value, path, ["kind"], issues);
	issue(issues, `${path}.kind`, "unsupported-value", "must be station, companion-sidearm, entitlement-only, or never");
}
function validatePolicies(value, path, issues) {
	const policies = exactRecord(value, path, [
		"loadout",
		"bot",
		"drop",
		"range",
		"replay",
		"telemetry",
		"stance",
		"authority"
	], issues);
	if (!policies) return;
	oneOf(policies.loadout, [
		"eligible",
		"curated-only",
		"pickup-only",
		"never"
	], `${path}.loadout`, issues);
	oneOf(policies.bot, [
		"eligible",
		"diagnostic-only",
		"never"
	], `${path}.bot`, issues);
	oneOf(policies.drop, [
		"droppable",
		"map-pickup",
		"never"
	], `${path}.drop`, issues);
	validateRangePolicy(policies.range, `${path}.range`, issues);
	oneOf(policies.replay, ["serialized", "decode-only"], `${path}.replay`, issues);
	oneOf(policies.telemetry, ["standard", "not-applicable"], `${path}.telemetry`, issues);
	oneOf(policies.authority, [
		"host-shot-v1",
		"host-railgun-v1",
		"host-projectile-v1"
	], `${path}.authority`, issues);
	const stance = exactRecord(policies.stance, `${path}.stance`, [
		"stand",
		"crouch",
		"prone"
	], issues);
	if (!stance) return;
	for (const key of [
		"stand",
		"crouch",
		"prone"
	]) oneOf(stance[key], ["allowed", "blocked"], `${path}.stance.${key}`, issues);
}
function validateCrossFields(weapon, path, issues) {
	if (weapon.fireKind === "pellet") {
		if (typeof weapon.pellets === "number" && weapon.pellets <= 1) issue(issues, `${path}.pellets`, "cross-field", "pellet fire requires more than one pellet");
	} else if (typeof weapon.fireKind === "string" && WEAPON_FIRE_KINDS.includes(weapon.fireKind) && weapon.pellets !== 1) issue(issues, `${path}.pellets`, "cross-field", "non-pellet fire requires exactly one ray or projectile");
	const policies = isRecord$11(weapon.policies) ? weapon.policies : null;
	if (weapon.fireKind === "projectile") {
		if (!identifier(weapon.projectileId, `${path}.projectileId`, issues)) issue(issues, `${path}.projectileId`, "cross-field", "projectile fire requires a projectile ID");
		if (policies && policies.authority !== "host-projectile-v1") issue(issues, `${path}.policies.authority`, "cross-field", "projectile fire requires host-projectile-v1");
	} else if (weapon.projectileId !== null) issue(issues, `${path}.projectileId`, "cross-field", "non-projectile fire requires null");
	if (weapon.fireKind !== "projectile" && policies?.authority === "host-projectile-v1") issue(issues, `${path}.policies.authority`, "cross-field", "host-projectile-v1 requires projectile fire");
	const optic = isRecord$11(weapon.optic) ? weapon.optic : null;
	if (optic?.kind === "thermal-smoke-only") {
		if (weapon.family !== "marksman" || weapon.slot !== "primary" || weapon.fireMode !== "semi" || weapon.fireKind !== "hitscan") issue(issues, `${path}.optic`, "cross-field", "thermal-smoke-only is limited to a primary semi-auto marksman hitscan definition");
		if (policies?.authority !== "host-shot-v1") issue(issues, `${path}.policies.authority`, "cross-field", "thermal presentation cannot change shot authority");
	}
	if (optic?.kind === "special-authority" && policies && typeof optic.authorityPolicyId === "string" && optic.authorityPolicyId !== policies.authority) issue(issues, `${path}.optic.authorityPolicyId`, "cross-field", "must match policies.authority");
	const range = policies && isRecord$11(policies.range) ? policies.range : null;
	if (range?.kind === "station" && weapon.slot !== "primary") issue(issues, `${path}.policies.range`, "cross-field", "station range policy requires a primary weapon");
	if (range?.kind === "companion-sidearm" && weapon.slot !== "secondary") issue(issues, `${path}.policies.range`, "cross-field", "companion-sidearm range policy requires a secondary weapon");
}
function collectWeaponDefinitionIssues(value, path, issues) {
	const weapon = exactRecord(value, path, WEAPON_KEYS, issues);
	if (!weapon) return;
	identifier(weapon.id, `${path}.id`, issues);
	displayName(weapon.displayName, `${path}.displayName`, issues);
	oneOf(weapon.slot, WEAPON_SLOTS, `${path}.slot`, issues);
	oneOf(weapon.family, WEAPON_FAMILIES, `${path}.family`, issues);
	oneOf(weapon.fireKind, WEAPON_FIRE_KINDS, `${path}.fireKind`, issues);
	oneOf(weapon.fireMode, WEAPON_FIRE_MODES, `${path}.fireMode`, issues);
	boundedNumber(weapon.rpm, 1, 3e3, `${path}.rpm`, issues);
	boundedInteger$7(weapon.pellets, 1, 12, `${path}.pellets`, issues);
	boundedInteger$7(weapon.spinUpMs, 0, 1e4, `${path}.spinUpMs`, issues);
	boundedNumber(weapon.movementMultiplier, .1, 1.5, `${path}.movementMultiplier`, issues);
	validateDamage(weapon.damage, `${path}.damage`, issues);
	validateSpread(weapon.spread, `${path}.spread`, issues);
	validateRecoil(weapon.recoil, `${path}.recoil`, issues);
	validateAmmo(weapon.ammo, `${path}.ammo`, issues);
	validatePenetration(weapon.penetration, `${path}.penetration`, issues);
	validateEffects(weapon.effects, `${path}.effects`, issues);
	validateOptic(weapon.optic, `${path}.optic`, issues);
	if (weapon.projectileId !== null && typeof weapon.projectileId !== "string") issue(issues, `${path}.projectileId`, "type", "must be null or a lowercase ASCII slug");
	validatePolicies(weapon.policies, `${path}.policies`, issues);
	for (const key of [
		"modelSetId",
		"presentationId",
		"audioId",
		"provenanceId"
	]) identifier(weapon[key], `${path}.${key}`, issues);
	uniqueIdentifierArray(weapon.evidenceIds, `${path}.evidenceIds`, 1, MAX_EVIDENCE_ID_COUNT, issues);
	validateCrossFields(weapon, path, issues);
}
function cloneAndFreeze(value) {
	if (Array.isArray(value)) return Object.freeze(value.map((entry) => cloneAndFreeze(entry)));
	if (isRecord$11(value)) {
		const clone = {};
		for (const [key, entry] of Object.entries(value)) clone[key] = cloneAndFreeze(entry);
		return Object.freeze(clone);
	}
	return value;
}
function sortedIssues(issues) {
	return Object.freeze([...issues].sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message)));
}
function collectWeaponDefinitionsIssues(value, issues) {
	if (!Array.isArray(value)) {
		issue(issues, "$", "type", "must be an array of weapon definitions");
		return;
	}
	if (value.length < 1 || value.length > MAX_DEFINITION_COUNT) issue(issues, "$", "bounds", `must contain between 1 and ${MAX_DEFINITION_COUNT} definitions`);
	if (value.length > MAX_DEFINITION_COUNT) return;
	validateDenseArray(value, "$", issues);
	for (let index = 0; index < value.length; index += 1) {
		if (!Object.hasOwn(value, index)) continue;
		collectWeaponDefinitionIssues(value[index], `$[${index}]`, issues);
	}
	for (const field of [
		"id",
		"modelSetId",
		"presentationId",
		"audioId",
		"provenanceId"
	]) {
		const firstIndexByValue = /* @__PURE__ */ new Map();
		for (let index = 0; index < value.length; index += 1) {
			if (!Object.hasOwn(value, index)) continue;
			const entry = value[index];
			if (!isRecord$11(entry) || typeof entry[field] !== "string") continue;
			const previousIndex = firstIndexByValue.get(entry[field]);
			if (previousIndex !== void 0) issue(issues, `$[${index}].${field}`, "duplicate", `duplicates $[${previousIndex}].${field}`);
			else firstIndexByValue.set(entry[field], index);
		}
	}
	const firstPatternIndex = /* @__PURE__ */ new Map();
	for (let index = 0; index < value.length; index += 1) {
		if (!Object.hasOwn(value, index)) continue;
		const entry = value[index];
		if (!isRecord$11(entry) || !isRecord$11(entry.recoil) || typeof entry.recoil.deterministicPatternId !== "string") continue;
		const pattern = entry.recoil.deterministicPatternId;
		const previousIndex = firstPatternIndex.get(pattern);
		if (previousIndex !== void 0) issue(issues, `$[${index}].recoil.deterministicPatternId`, "duplicate", `duplicates $[${previousIndex}].recoil.deterministicPatternId`);
		else firstPatternIndex.set(pattern, index);
	}
}
function parseWeaponDefinitions(value) {
	const issues = [];
	const snapshot = snapshotInput(value, issues);
	collectWeaponDefinitionsIssues(snapshot, issues);
	const orderedIssues = sortedIssues(issues);
	if (orderedIssues.length > 0) throw new WeaponSchemaValidationError(orderedIssues);
	const parsed = cloneAndFreeze(snapshot);
	const invariantIssues = [];
	collectWeaponDefinitionsIssues(parsed, invariantIssues);
	if (invariantIssues.length > 0) throw new WeaponSchemaValidationError(sortedIssues(invariantIssues));
	return parsed;
}
var MINIGUN_PRE_PASS65_MINIMUM_DAMAGE = 11.25;
var MINIGUN_PASS65_DAMAGE_MULTIPLIER = .75;
/** Pass 64 insertion order is observable through Object.keys/Object.values consumers. */
var LEGACY_WEAPON_ENUMERATION_ORDER = Object.freeze([
	"carbine",
	"smg",
	"lmg",
	"scattergun",
	"sniper",
	"railgun",
	"pistol",
	"magnum",
	"machine-pistol",
	"mini-uzi",
	"mp5",
	"m4a1",
	"ak-47",
	"minigun",
	"m14-ebr",
	"slug-shotgun",
	"flashlight-pistol",
	"explosive-crossbow",
	"flamethrower",
	"flare-gun",
	"crimson-flamethrower"
]);
/** Canonical, schema-validated B1 definitions. Target metadata remains inert until its owning migration. */
var WEAPON_CATALOG = parseWeaponDefinitions([
	{
		id: "carbine",
		displayName: "HK416",
		slot: "primary",
		family: "assault-rifle",
		fireKind: "hitscan",
		fireMode: "automatic",
		rpm: 650,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1,
		damage: {
			policy: "standard",
			base: 31,
			minimum: 20,
			falloffStartM: 24,
			falloffEndM: 72,
			headMultiplier: 1.5,
			limbMultiplier: .82
		},
		spread: {
			hipRadians: .012,
			adsMultiplier: .28,
			movementMultiplier: 1.65,
			standMultiplier: 1,
			crouchMultiplier: .78,
			proneMultiplier: .65,
			sustainedPerShot: .0016,
			maximumRadians: .045
		},
		recoil: {
			pitchRadians: .016,
			yawRadians: .006,
			recoveryPerSecond: 12,
			adsMultiplier: .72,
			standMultiplier: 1,
			crouchMultiplier: .84,
			proneMultiplier: .65,
			deterministicPatternId: "carbine-pattern-v1"
		},
		ammo: {
			magazine: 30,
			reserve: 120,
			reloadSeconds: 1.8,
			emptyReloadSeconds: 2.05,
			switchSeconds: .48
		},
		penetration: {
			calibreLabel: "5.56 mm",
			power: 5.8,
			fmjMultiplier: 1.12,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 20,
			energyFalloffEndM: 76,
			minimumEnergyRetention: .48,
			minimumWallDamageMultiplier: .34,
			maximumSurfaces: 2
		},
		effects: {
			tracerColorHex: 16765286,
			muzzleFlashScale: 1,
			reportGain: 1,
			flashlight: null
		},
		optic: {
			kind: "standard",
			magnification: 1.25,
			solidOcclusion: "required"
		},
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: {
				kind: "station",
				stationId: "range-carbine"
			},
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "carbine-model-set-v1",
		presentationId: "carbine-view-v1",
		audioId: "carbine-audio-v1",
		provenanceId: "carbine-provenance-v1",
		evidenceIds: ["r232-carbine"]
	},
	{
		id: "smg",
		displayName: "FN P90",
		slot: "primary",
		family: "smg",
		fireKind: "hitscan",
		fireMode: "automatic",
		rpm: 860,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1,
		damage: {
			policy: "standard",
			base: 23,
			minimum: 14,
			falloffStartM: 15,
			falloffEndM: 52,
			headMultiplier: 1.5,
			limbMultiplier: .8
		},
		spread: {
			hipRadians: .018,
			adsMultiplier: .42,
			movementMultiplier: 1.45,
			standMultiplier: 1,
			crouchMultiplier: .82,
			proneMultiplier: .72,
			sustainedPerShot: .0021,
			maximumRadians: .058
		},
		recoil: {
			pitchRadians: .011,
			yawRadians: .009,
			recoveryPerSecond: 15,
			adsMultiplier: .78,
			standMultiplier: 1,
			crouchMultiplier: .88,
			proneMultiplier: .72,
			deterministicPatternId: "smg-pattern-v1"
		},
		ammo: {
			magazine: 32,
			reserve: 128,
			reloadSeconds: 1.5,
			emptyReloadSeconds: 1.75,
			switchSeconds: .4
		},
		penetration: {
			calibreLabel: "9 mm",
			power: 3.05,
			fmjMultiplier: 1.08,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 8,
			energyFalloffEndM: 38,
			minimumEnergyRetention: .22,
			minimumWallDamageMultiplier: .22,
			maximumSurfaces: 1
		},
		effects: {
			tracerColorHex: 6678527,
			muzzleFlashScale: .78,
			reportGain: .86,
			flashlight: null
		},
		optic: null,
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: {
				kind: "station",
				stationId: "range-smg"
			},
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "smg-model-set-v1",
		presentationId: "smg-view-v1",
		audioId: "smg-audio-v1",
		provenanceId: "smg-provenance-v1",
		evidenceIds: ["r232-smg"]
	},
	{
		id: "lmg",
		displayName: "M249 SAW",
		slot: "primary",
		family: "lmg",
		fireKind: "hitscan",
		fireMode: "automatic",
		rpm: 720,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1,
		damage: {
			policy: "standard",
			base: 27,
			minimum: 18,
			falloffStartM: 30,
			falloffEndM: 82,
			headMultiplier: 1.5,
			limbMultiplier: .82
		},
		spread: {
			hipRadians: .022,
			adsMultiplier: .34,
			movementMultiplier: 1.78,
			standMultiplier: 1,
			crouchMultiplier: .7,
			proneMultiplier: .6,
			sustainedPerShot: .0025,
			maximumRadians: .064
		},
		recoil: {
			pitchRadians: .019,
			yawRadians: .01,
			recoveryPerSecond: 10,
			adsMultiplier: .76,
			standMultiplier: 1,
			crouchMultiplier: .8,
			proneMultiplier: .6,
			deterministicPatternId: "lmg-pattern-v1"
		},
		ammo: {
			magazine: 62,
			reserve: 186,
			reloadSeconds: 3.25,
			emptyReloadSeconds: 3.6,
			switchSeconds: .78
		},
		penetration: {
			calibreLabel: "7.62 mm",
			power: 6.9,
			fmjMultiplier: 1.14,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 30,
			energyFalloffEndM: 90,
			minimumEnergyRetention: .58,
			minimumWallDamageMultiplier: .4,
			maximumSurfaces: 2
		},
		effects: {
			tracerColorHex: 10476146,
			muzzleFlashScale: 1.14,
			reportGain: 1.06,
			flashlight: null
		},
		optic: {
			kind: "standard",
			magnification: 1.25,
			solidOcclusion: "required"
		},
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: {
				kind: "station",
				stationId: "range-lmg"
			},
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "lmg-model-set-v1",
		presentationId: "lmg-view-v1",
		audioId: "lmg-audio-v1",
		provenanceId: "lmg-provenance-v1",
		evidenceIds: ["r232-lmg"]
	},
	{
		id: "scattergun",
		displayName: "Remington 870",
		slot: "primary",
		family: "shotgun",
		fireKind: "pellet",
		fireMode: "semi",
		rpm: 95,
		pellets: 9,
		spinUpMs: 0,
		movementMultiplier: 1,
		damage: {
			policy: "standard",
			base: 13,
			minimum: 5,
			falloffStartM: 10,
			falloffEndM: 38,
			headMultiplier: 1.35,
			limbMultiplier: .86
		},
		spread: {
			hipRadians: .082,
			adsMultiplier: .74,
			movementMultiplier: 1.24,
			standMultiplier: 1,
			crouchMultiplier: .88,
			proneMultiplier: .8,
			sustainedPerShot: .0024,
			maximumRadians: .112
		},
		recoil: {
			pitchRadians: .052,
			yawRadians: .012,
			recoveryPerSecond: 8,
			adsMultiplier: .84,
			standMultiplier: 1,
			crouchMultiplier: .9,
			proneMultiplier: .8,
			deterministicPatternId: "scattergun-pattern-v1"
		},
		ammo: {
			magazine: 8,
			reserve: 40,
			reloadSeconds: 2.35,
			emptyReloadSeconds: 2.7,
			switchSeconds: .62
		},
		penetration: {
			calibreLabel: "12 ga pellet",
			power: 2.15,
			fmjMultiplier: 1,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 4,
			energyFalloffEndM: 20,
			minimumEnergyRetention: .16,
			minimumWallDamageMultiplier: .18,
			maximumSurfaces: 1
		},
		effects: {
			tracerColorHex: 16747099,
			muzzleFlashScale: 1.45,
			reportGain: 1.14,
			flashlight: null
		},
		optic: null,
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: {
				kind: "station",
				stationId: "range-scattergun"
			},
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "scattergun-model-set-v1",
		presentationId: "scattergun-view-v1",
		audioId: "scattergun-audio-v1",
		provenanceId: "scattergun-provenance-v1",
		evidenceIds: ["r232-scattergun"]
	},
	{
		id: "sniper",
		displayName: "M40A5",
		slot: "primary",
		family: "marksman",
		fireKind: "hitscan",
		fireMode: "semi",
		rpm: 55,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1,
		damage: {
			policy: "standard",
			base: 67,
			minimum: 67,
			falloffStartM: 96,
			falloffEndM: 120,
			headMultiplier: 3,
			limbMultiplier: .9
		},
		spread: {
			hipRadians: .052,
			adsMultiplier: .05,
			movementMultiplier: 1.8,
			standMultiplier: 1,
			crouchMultiplier: .72,
			proneMultiplier: .52,
			sustainedPerShot: .004,
			maximumRadians: .07
		},
		recoil: {
			pitchRadians: .072,
			yawRadians: .016,
			recoveryPerSecond: 6.5,
			adsMultiplier: .6,
			standMultiplier: 1,
			crouchMultiplier: .76,
			proneMultiplier: .52,
			deterministicPatternId: "sniper-pattern-v1"
		},
		ammo: {
			magazine: 5,
			reserve: 25,
			reloadSeconds: 2.6,
			emptyReloadSeconds: 2.9,
			switchSeconds: .68
		},
		penetration: {
			calibreLabel: "7.62 mm",
			power: 9.4,
			fmjMultiplier: 1.16,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 58,
			energyFalloffEndM: 120,
			minimumEnergyRetention: .7,
			minimumWallDamageMultiplier: .48,
			maximumSurfaces: 3
		},
		effects: {
			tracerColorHex: 11134975,
			muzzleFlashScale: 1.22,
			reportGain: 1.12,
			flashlight: null
		},
		optic: {
			kind: "standard",
			magnification: 4,
			solidOcclusion: "required"
		},
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: {
				kind: "station",
				stationId: "range-sniper"
			},
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "sniper-model-set-v1",
		presentationId: "sniper-view-v1",
		audioId: "sniper-audio-v1",
		provenanceId: "sniper-provenance-v1",
		evidenceIds: ["r232-sniper"]
	},
	{
		id: "railgun",
		displayName: "EMRG Railgun",
		slot: "special",
		family: "marksman",
		fireKind: "hitscan",
		fireMode: "semi",
		rpm: 40,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1,
		damage: {
			policy: "standard",
			base: 50,
			minimum: 50,
			falloffStartM: 512,
			falloffEndM: 512,
			headMultiplier: 1,
			limbMultiplier: 1
		},
		spread: {
			hipRadians: .035,
			adsMultiplier: 0,
			movementMultiplier: 1,
			standMultiplier: 1,
			crouchMultiplier: 1,
			proneMultiplier: 1,
			sustainedPerShot: 0,
			maximumRadians: .035
		},
		recoil: {
			pitchRadians: .085,
			yawRadians: 0,
			recoveryPerSecond: 5.8,
			adsMultiplier: 1,
			standMultiplier: 1,
			crouchMultiplier: 1,
			proneMultiplier: 1,
			deterministicPatternId: "railgun-pattern-v1"
		},
		ammo: {
			magazine: 8,
			reserve: 0,
			reloadSeconds: 1.5,
			emptyReloadSeconds: 1.75,
			switchSeconds: .72
		},
		penetration: {
			calibreLabel: "electromagnetic sabot",
			power: 1e5,
			fmjMultiplier: 1,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 512,
			energyFalloffEndM: 513,
			minimumEnergyRetention: 1,
			minimumWallDamageMultiplier: 1,
			maximumSurfaces: 64
		},
		effects: {
			tracerColorHex: 8255743,
			muzzleFlashScale: 1.5,
			reportGain: 1.2,
			flashlight: null
		},
		optic: {
			kind: "special-authority",
			magnification: 2.5,
			solidOcclusion: "required",
			authorityPolicyId: "host-railgun-v1"
		},
		projectileId: null,
		policies: {
			loadout: "pickup-only",
			bot: "never",
			drop: "map-pickup",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-railgun-v1"
		},
		modelSetId: "railgun-model-set-v1",
		presentationId: "railgun-view-v1",
		audioId: "railgun-audio-v1",
		provenanceId: "railgun-provenance-v1",
		evidenceIds: ["r232-railgun"]
	},
	{
		id: "pistol",
		displayName: "Glock 17",
		slot: "secondary",
		family: "sidearm",
		fireKind: "hitscan",
		fireMode: "semi",
		rpm: 420,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1,
		damage: {
			policy: "standard",
			base: 36,
			minimum: 22,
			falloffStartM: 20,
			falloffEndM: 58,
			headMultiplier: 1.5,
			limbMultiplier: .84
		},
		spread: {
			hipRadians: .02,
			adsMultiplier: .34,
			movementMultiplier: 1.42,
			standMultiplier: 1,
			crouchMultiplier: .8,
			proneMultiplier: .7,
			sustainedPerShot: .0024,
			maximumRadians: .052
		},
		recoil: {
			pitchRadians: .021,
			yawRadians: .008,
			recoveryPerSecond: 14,
			adsMultiplier: .74,
			standMultiplier: 1,
			crouchMultiplier: .86,
			proneMultiplier: .7,
			deterministicPatternId: "pistol-pattern-v1"
		},
		ammo: {
			magazine: 15,
			reserve: 60,
			reloadSeconds: 1.35,
			emptyReloadSeconds: 1.55,
			switchSeconds: .28
		},
		penetration: {
			calibreLabel: "9 mm",
			power: 3.65,
			fmjMultiplier: 1.08,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 12,
			energyFalloffEndM: 48,
			minimumEnergyRetention: .3,
			minimumWallDamageMultiplier: .26,
			maximumSurfaces: 1
		},
		effects: {
			tracerColorHex: 15255419,
			muzzleFlashScale: .7,
			reportGain: .82,
			flashlight: null
		},
		optic: null,
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: {
				kind: "companion-sidearm",
				primaryIds: [
					"carbine",
					"smg",
					"lmg",
					"scattergun"
				]
			},
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "pistol-model-set-v1",
		presentationId: "pistol-view-v1",
		audioId: "pistol-audio-v1",
		provenanceId: "pistol-provenance-v1",
		evidenceIds: ["r232-pistol"]
	},
	{
		id: "magnum",
		displayName: "Desert Eagle .50 AE",
		slot: "secondary",
		family: "sidearm",
		fireKind: "hitscan",
		fireMode: "semi",
		rpm: 90,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1,
		damage: {
			policy: "standard",
			base: 52,
			minimum: 34,
			falloffStartM: 18,
			falloffEndM: 55,
			headMultiplier: 1.9,
			limbMultiplier: .75
		},
		spread: {
			hipRadians: .026,
			adsMultiplier: .3,
			movementMultiplier: 1.5,
			standMultiplier: 1,
			crouchMultiplier: .8,
			proneMultiplier: .68,
			sustainedPerShot: .006,
			maximumRadians: .06
		},
		recoil: {
			pitchRadians: .05,
			yawRadians: .012,
			recoveryPerSecond: 8,
			adsMultiplier: .74,
			standMultiplier: 1,
			crouchMultiplier: .84,
			proneMultiplier: .68,
			deterministicPatternId: "magnum-pattern-v1"
		},
		ammo: {
			magazine: 6,
			reserve: 30,
			reloadSeconds: 1.75,
			emptyReloadSeconds: 2,
			switchSeconds: .34
		},
		penetration: {
			calibreLabel: ".50 AE",
			power: 4.7,
			fmjMultiplier: 1.08,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 30,
			energyFalloffEndM: 82,
			minimumEnergyRetention: .4,
			minimumWallDamageMultiplier: .3,
			maximumSurfaces: 1
		},
		effects: {
			tracerColorHex: 16765802,
			muzzleFlashScale: 1.12,
			reportGain: 1.2,
			flashlight: null
		},
		optic: null,
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: {
				kind: "companion-sidearm",
				primaryIds: [
					"carbine",
					"smg",
					"lmg",
					"scattergun",
					"sniper"
				]
			},
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "magnum-model-set-v1",
		presentationId: "magnum-view-v1",
		audioId: "magnum-audio-v1",
		provenanceId: "magnum-provenance-v1",
		evidenceIds: ["r232-magnum"]
	},
	{
		id: "machine-pistol",
		displayName: "Glock 18",
		slot: "secondary",
		family: "sidearm",
		fireKind: "hitscan",
		fireMode: "automatic",
		rpm: 900,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1,
		damage: {
			policy: "standard",
			base: 18,
			minimum: 11,
			falloffStartM: 11,
			falloffEndM: 34,
			headMultiplier: 1.5,
			limbMultiplier: .8
		},
		spread: {
			hipRadians: .026,
			adsMultiplier: .46,
			movementMultiplier: 1.55,
			standMultiplier: 1,
			crouchMultiplier: .82,
			proneMultiplier: .78,
			sustainedPerShot: .0032,
			maximumRadians: .072
		},
		recoil: {
			pitchRadians: .014,
			yawRadians: .012,
			recoveryPerSecond: 13,
			adsMultiplier: .82,
			standMultiplier: 1,
			crouchMultiplier: .9,
			proneMultiplier: .78,
			deterministicPatternId: "machine-pistol-pattern-v1"
		},
		ammo: {
			magazine: 20,
			reserve: 80,
			reloadSeconds: 1.55,
			emptyReloadSeconds: 1.75,
			switchSeconds: .3
		},
		penetration: {
			calibreLabel: "9 mm",
			power: 2.75,
			fmjMultiplier: 1.06,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 6,
			energyFalloffEndM: 30,
			minimumEnergyRetention: .18,
			minimumWallDamageMultiplier: .2,
			maximumSurfaces: 1
		},
		effects: {
			tracerColorHex: 16752451,
			muzzleFlashScale: .76,
			reportGain: .84,
			flashlight: null
		},
		optic: null,
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: {
				kind: "companion-sidearm",
				primaryIds: ["sniper"]
			},
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "machine-pistol-model-set-v1",
		presentationId: "machine-pistol-view-v1",
		audioId: "machine-pistol-audio-v1",
		provenanceId: "machine-pistol-provenance-v1",
		evidenceIds: ["r232-machine-pistol"]
	},
	{
		id: "mini-uzi",
		displayName: "Mini Uzi",
		slot: "primary",
		family: "smg",
		fireKind: "hitscan",
		fireMode: "automatic",
		rpm: 1050,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1.05,
		damage: {
			policy: "standard",
			base: 19,
			minimum: 8,
			falloffStartM: 9,
			falloffEndM: 36,
			headMultiplier: 1.45,
			limbMultiplier: .78
		},
		spread: {
			hipRadians: .022,
			adsMultiplier: .5,
			movementMultiplier: 1.35,
			standMultiplier: 1,
			crouchMultiplier: .86,
			proneMultiplier: .76,
			sustainedPerShot: .003,
			maximumRadians: .078
		},
		recoil: {
			pitchRadians: .013,
			yawRadians: .013,
			recoveryPerSecond: 14,
			adsMultiplier: .84,
			standMultiplier: 1,
			crouchMultiplier: .9,
			proneMultiplier: .78,
			deterministicPatternId: "mini-uzi-pattern-v1"
		},
		ammo: {
			magazine: 32,
			reserve: 128,
			reloadSeconds: 1.55,
			emptyReloadSeconds: 1.8,
			switchSeconds: .34
		},
		penetration: {
			calibreLabel: "9 mm",
			power: 2.35,
			fmjMultiplier: 1.05,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 5,
			energyFalloffEndM: 26,
			minimumEnergyRetention: .14,
			minimumWallDamageMultiplier: .18,
			maximumSurfaces: 1
		},
		effects: {
			tracerColorHex: 16757339,
			muzzleFlashScale: .82,
			reportGain: .86,
			flashlight: null
		},
		optic: null,
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "mini-uzi-model-set-v1",
		presentationId: "mini-uzi-family-view-v1",
		audioId: "mini-uzi-audio-v1",
		provenanceId: "mini-uzi-procedural-cc0-v1",
		evidenceIds: ["r220-mini-uzi", "r232-mini-uzi"]
	},
	{
		id: "mp5",
		displayName: "MP5",
		slot: "primary",
		family: "smg",
		fireKind: "hitscan",
		fireMode: "automatic",
		rpm: 800,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1.02,
		damage: {
			policy: "standard",
			base: 25,
			minimum: 16,
			falloffStartM: 18,
			falloffEndM: 58,
			headMultiplier: 1.5,
			limbMultiplier: .82
		},
		spread: {
			hipRadians: .016,
			adsMultiplier: .34,
			movementMultiplier: 1.38,
			standMultiplier: 1,
			crouchMultiplier: .8,
			proneMultiplier: .7,
			sustainedPerShot: .0017,
			maximumRadians: .052
		},
		recoil: {
			pitchRadians: .01,
			yawRadians: .0065,
			recoveryPerSecond: 16,
			adsMultiplier: .72,
			standMultiplier: 1,
			crouchMultiplier: .84,
			proneMultiplier: .7,
			deterministicPatternId: "mp5-pattern-v1"
		},
		ammo: {
			magazine: 30,
			reserve: 120,
			reloadSeconds: 1.65,
			emptyReloadSeconds: 1.9,
			switchSeconds: .38
		},
		penetration: {
			calibreLabel: "9 mm",
			power: 3.15,
			fmjMultiplier: 1.08,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 10,
			energyFalloffEndM: 44,
			minimumEnergyRetention: .24,
			minimumWallDamageMultiplier: .23,
			maximumSurfaces: 1
		},
		effects: {
			tracerColorHex: 6743751,
			muzzleFlashScale: .72,
			reportGain: .82,
			flashlight: null
		},
		optic: {
			kind: "standard",
			magnification: 1.2,
			solidOcclusion: "required"
		},
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "mp5-model-set-v1",
		presentationId: "mp5-family-view-v1",
		audioId: "mp5-audio-v1",
		provenanceId: "mp5-procedural-cc0-v1",
		evidenceIds: ["r221-mp5", "r232-mp5"]
	},
	{
		id: "m4a1",
		displayName: "M4A1",
		slot: "primary",
		family: "assault-rifle",
		fireKind: "hitscan",
		fireMode: "automatic",
		rpm: 700,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1,
		damage: {
			policy: "standard",
			base: 29,
			minimum: 19,
			falloffStartM: 26,
			falloffEndM: 78,
			headMultiplier: 1.5,
			limbMultiplier: .82
		},
		spread: {
			hipRadians: .011,
			adsMultiplier: .27,
			movementMultiplier: 1.58,
			standMultiplier: 1,
			crouchMultiplier: .76,
			proneMultiplier: .64,
			sustainedPerShot: .0014,
			maximumRadians: .042
		},
		recoil: {
			pitchRadians: .014,
			yawRadians: .005,
			recoveryPerSecond: 13.5,
			adsMultiplier: .7,
			standMultiplier: 1,
			crouchMultiplier: .82,
			proneMultiplier: .64,
			deterministicPatternId: "m4a1-pattern-v1"
		},
		ammo: {
			magazine: 30,
			reserve: 120,
			reloadSeconds: 1.75,
			emptyReloadSeconds: 2,
			switchSeconds: .46
		},
		penetration: {
			calibreLabel: "5.56 mm",
			power: 5.7,
			fmjMultiplier: 1.12,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 22,
			energyFalloffEndM: 78,
			minimumEnergyRetention: .47,
			minimumWallDamageMultiplier: .34,
			maximumSurfaces: 2
		},
		effects: {
			tracerColorHex: 16767372,
			muzzleFlashScale: .96,
			reportGain: .96,
			flashlight: null
		},
		optic: {
			kind: "standard",
			magnification: 1.25,
			solidOcclusion: "required"
		},
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "m4a1-model-set-v1",
		presentationId: "m4a1-family-view-v1",
		audioId: "m4a1-audio-v1",
		provenanceId: "m4a1-procedural-cc0-v1",
		evidenceIds: ["r225-m4a1", "r232-m4a1"]
	},
	{
		id: "ak-47",
		displayName: "AK-47",
		slot: "primary",
		family: "assault-rifle",
		fireKind: "hitscan",
		fireMode: "automatic",
		rpm: 600,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: .96,
		damage: {
			policy: "standard",
			base: 35,
			minimum: 22,
			falloffStartM: 28,
			falloffEndM: 86,
			headMultiplier: 1.5,
			limbMultiplier: .82
		},
		spread: {
			hipRadians: .015,
			adsMultiplier: .32,
			movementMultiplier: 1.7,
			standMultiplier: 1,
			crouchMultiplier: .78,
			proneMultiplier: .62,
			sustainedPerShot: .0021,
			maximumRadians: .054
		},
		recoil: {
			pitchRadians: .021,
			yawRadians: .009,
			recoveryPerSecond: 10,
			adsMultiplier: .76,
			standMultiplier: 1,
			crouchMultiplier: .82,
			proneMultiplier: .62,
			deterministicPatternId: "ak-47-pattern-v1"
		},
		ammo: {
			magazine: 30,
			reserve: 120,
			reloadSeconds: 2.05,
			emptyReloadSeconds: 2.35,
			switchSeconds: .54
		},
		penetration: {
			calibreLabel: "7.62x39 mm",
			power: 7.35,
			fmjMultiplier: 1.15,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 30,
			energyFalloffEndM: 94,
			minimumEnergyRetention: .6,
			minimumWallDamageMultiplier: .42,
			maximumSurfaces: 2
		},
		effects: {
			tracerColorHex: 16756070,
			muzzleFlashScale: 1.16,
			reportGain: 1.12,
			flashlight: null
		},
		optic: {
			kind: "standard",
			magnification: 1.15,
			solidOcclusion: "required"
		},
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "ak-47-model-set-v1",
		presentationId: "ak-47-family-view-v1",
		audioId: "ak-47-audio-v1",
		provenanceId: "ak-47-procedural-cc0-v1",
		evidenceIds: ["r226-ak-47", "r232-ak-47"]
	},
	{
		id: "minigun",
		displayName: "M134 Minigun",
		slot: "primary",
		family: "lmg",
		fireKind: "hitscan",
		fireMode: "automatic",
		rpm: 1200,
		pellets: 1,
		spinUpMs: 1200,
		movementMultiplier: .8,
		damage: {
			policy: "standard",
			base: 15 * MINIGUN_PASS65_DAMAGE_MULTIPLIER,
			minimum: MINIGUN_PRE_PASS65_MINIMUM_DAMAGE * MINIGUN_PASS65_DAMAGE_MULTIPLIER,
			falloffStartM: 24,
			falloffEndM: 74,
			headMultiplier: 1,
			limbMultiplier: .85
		},
		spread: {
			hipRadians: .026,
			adsMultiplier: .7,
			movementMultiplier: 1.8,
			standMultiplier: 1,
			crouchMultiplier: .82,
			proneMultiplier: .72,
			sustainedPerShot: .0012,
			maximumRadians: .06
		},
		recoil: {
			pitchRadians: .008,
			yawRadians: .008,
			recoveryPerSecond: 14,
			adsMultiplier: .9,
			standMultiplier: 1,
			crouchMultiplier: .86,
			proneMultiplier: .72,
			deterministicPatternId: "minigun-pattern-v1"
		},
		ammo: {
			magazine: 240,
			reserve: 480,
			reloadSeconds: 5.4,
			emptyReloadSeconds: 5.8,
			switchSeconds: 1.05
		},
		penetration: {
			calibreLabel: "7.62 mm",
			power: 6.5,
			fmjMultiplier: 1.12,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 24,
			energyFalloffEndM: 82,
			minimumEnergyRetention: .52,
			minimumWallDamageMultiplier: .38,
			maximumSurfaces: 2
		},
		effects: {
			tracerColorHex: 16773018,
			muzzleFlashScale: 1.25,
			reportGain: 1.04,
			flashlight: null
		},
		optic: null,
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "diagnostic-only",
			drop: "droppable",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "minigun-model-set-v1",
		presentationId: "minigun-family-view-v1",
		audioId: "minigun-audio-v1",
		provenanceId: "minigun-procedural-cc0-v1",
		evidenceIds: ["r228-minigun", "r232-minigun"]
	},
	{
		id: "m14-ebr",
		displayName: "M14 EBR",
		slot: "primary",
		family: "marksman",
		fireKind: "hitscan",
		fireMode: "semi",
		rpm: 37,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: .94,
		damage: {
			policy: "standard",
			base: 37.2,
			minimum: 24,
			falloffStartM: 38,
			falloffEndM: 100,
			headMultiplier: 1.7,
			limbMultiplier: .82
		},
		spread: {
			hipRadians: .032,
			adsMultiplier: .08,
			movementMultiplier: 1.85,
			standMultiplier: 1,
			crouchMultiplier: .7,
			proneMultiplier: .5,
			sustainedPerShot: .004,
			maximumRadians: .062
		},
		recoil: {
			pitchRadians: .045,
			yawRadians: .012,
			recoveryPerSecond: 7.5,
			adsMultiplier: .62,
			standMultiplier: 1,
			crouchMultiplier: .74,
			proneMultiplier: .5,
			deterministicPatternId: "m14-ebr-pattern-v1"
		},
		ammo: {
			magazine: 20,
			reserve: 80,
			reloadSeconds: 2.35,
			emptyReloadSeconds: 2.65,
			switchSeconds: .66
		},
		penetration: {
			calibreLabel: "7.62 mm",
			power: .55,
			fmjMultiplier: 1.16,
			wallPenetrationMultiplier: 1.5,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 45,
			energyFalloffEndM: 112,
			minimumEnergyRetention: .68,
			minimumWallDamageMultiplier: .12,
			maximumSurfaces: 1
		},
		effects: {
			tracerColorHex: 10283775,
			muzzleFlashScale: 1.08,
			reportGain: 1.08,
			flashlight: null
		},
		optic: {
			kind: "thermal-smoke-only",
			magnification: 2.5,
			solidOcclusion: "required",
			targetPolicy: "living-targets-through-smoke",
			authority: "presentation-only"
		},
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "m14-ebr-model-set-v1",
		presentationId: "m14-ebr-family-view-v1",
		audioId: "m14-ebr-audio-v1",
		provenanceId: "m14-ebr-procedural-cc0-v1",
		evidenceIds: ["r229-m14-ebr", "r232-m14-ebr"]
	},
	{
		id: "slug-shotgun",
		displayName: "Benelli M4 Slug",
		slot: "primary",
		family: "shotgun",
		fireKind: "slug",
		fireMode: "semi",
		rpm: 85,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: .96,
		damage: {
			policy: "standard",
			base: 88,
			minimum: 45,
			falloffStartM: 20,
			falloffEndM: 72,
			headMultiplier: 1.35,
			limbMultiplier: .72
		},
		spread: {
			hipRadians: .025,
			adsMultiplier: .16,
			movementMultiplier: 1.72,
			standMultiplier: 1,
			crouchMultiplier: .72,
			proneMultiplier: .62,
			sustainedPerShot: .006,
			maximumRadians: .052
		},
		recoil: {
			pitchRadians: .082,
			yawRadians: .015,
			recoveryPerSecond: 5.5,
			adsMultiplier: .68,
			standMultiplier: 1,
			crouchMultiplier: .78,
			proneMultiplier: .62,
			deterministicPatternId: "slug-shotgun-pattern-v1"
		},
		ammo: {
			magazine: 8,
			reserve: 32,
			reloadSeconds: 2.55,
			emptyReloadSeconds: 2.9,
			switchSeconds: .68
		},
		penetration: {
			calibreLabel: "12 ga slug",
			power: 8.1,
			fmjMultiplier: 1.1,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 18,
			energyFalloffEndM: 78,
			minimumEnergyRetention: .62,
			minimumWallDamageMultiplier: .45,
			maximumSurfaces: 2
		},
		effects: {
			tracerColorHex: 16760184,
			muzzleFlashScale: 1.35,
			reportGain: 1.16,
			flashlight: null
		},
		optic: {
			kind: "standard",
			magnification: 1.35,
			solidOcclusion: "required"
		},
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "eligible",
			drop: "droppable",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "slug-shotgun-model-set-v1",
		presentationId: "slug-shotgun-family-view-v1",
		audioId: "slug-shotgun-audio-v1",
		provenanceId: "slug-shotgun-procedural-cc0-v1",
		evidenceIds: [
			"r230-slug-shotgun",
			"r231-scatter-comparator",
			"r232-slug-shotgun"
		]
	},
	{
		id: "flashlight-pistol",
		displayName: "HK USP .45 Tactical",
		slot: "secondary",
		family: "sidearm",
		fireKind: "hitscan",
		fireMode: "semi",
		rpm: 300,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1,
		damage: {
			policy: "standard",
			base: 45,
			minimum: 28,
			falloffStartM: 18,
			falloffEndM: 56,
			headMultiplier: 1.5,
			limbMultiplier: .82
		},
		spread: {
			hipRadians: .022,
			adsMultiplier: .32,
			movementMultiplier: 1.48,
			standMultiplier: 1,
			crouchMultiplier: .8,
			proneMultiplier: .7,
			sustainedPerShot: .003,
			maximumRadians: .055
		},
		recoil: {
			pitchRadians: .032,
			yawRadians: .01,
			recoveryPerSecond: 10,
			adsMultiplier: .72,
			standMultiplier: 1,
			crouchMultiplier: .84,
			proneMultiplier: .7,
			deterministicPatternId: "flashlight-pistol-pattern-v1"
		},
		ammo: {
			magazine: 10,
			reserve: 50,
			reloadSeconds: 1.5,
			emptyReloadSeconds: 1.75,
			switchSeconds: .3
		},
		penetration: {
			calibreLabel: ".45 ACP",
			power: 4.1,
			fmjMultiplier: 1.08,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 14,
			energyFalloffEndM: 52,
			minimumEnergyRetention: .34,
			minimumWallDamageMultiplier: .28,
			maximumSurfaces: 1
		},
		effects: {
			tracerColorHex: 16766881,
			muzzleFlashScale: 1.08,
			reportGain: 1.4,
			flashlight: {
				kind: "always-on",
				colorHex: 15135999,
				intensity: 8,
				rangeM: 18,
				coneAngleRadians: .42,
				solidOcclusion: "required"
			}
		},
		optic: null,
		projectileId: null,
		policies: {
			loadout: "eligible",
			bot: "diagnostic-only",
			drop: "droppable",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "flashlight-pistol-model-set-v1",
		presentationId: "flashlight-pistol-family-view-v1",
		audioId: "flashlight-pistol-audio-v1",
		provenanceId: "flashlight-pistol-procedural-cc0-v1",
		evidenceIds: ["r222-flashlight-pistol", "r232-flashlight-pistol"]
	},
	{
		id: "explosive-crossbow",
		displayName: "TAC-15 Explosive Crossbow",
		slot: "secondary",
		family: "launcher",
		fireKind: "projectile",
		fireMode: "semi",
		rpm: 36,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: .94,
		damage: {
			policy: "standard",
			base: 45,
			minimum: 45,
			falloffStartM: 120,
			falloffEndM: 121,
			headMultiplier: 1,
			limbMultiplier: 1
		},
		spread: {
			hipRadians: .028,
			adsMultiplier: .12,
			movementMultiplier: 1.8,
			standMultiplier: 1,
			crouchMultiplier: .72,
			proneMultiplier: .58,
			sustainedPerShot: 0,
			maximumRadians: .028
		},
		recoil: {
			pitchRadians: .024,
			yawRadians: .004,
			recoveryPerSecond: 8,
			adsMultiplier: .72,
			standMultiplier: 1,
			crouchMultiplier: .82,
			proneMultiplier: .58,
			deterministicPatternId: "explosive-crossbow-pattern-v1"
		},
		ammo: {
			magazine: 1,
			reserve: 8,
			reloadSeconds: 2.45,
			emptyReloadSeconds: 2.45,
			switchSeconds: .58
		},
		penetration: {
			calibreLabel: "explosive bolt",
			power: 0,
			fmjMultiplier: 1,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 0,
			energyFalloffEndM: 1,
			minimumEnergyRetention: 0,
			minimumWallDamageMultiplier: 0,
			maximumSurfaces: 0
		},
		effects: {
			tracerColorHex: 16740943,
			muzzleFlashScale: .2,
			reportGain: .5,
			flashlight: null
		},
		optic: {
			kind: "standard",
			magnification: 1.5,
			solidOcclusion: "required"
		},
		projectileId: "explosive-bolt-v1",
		policies: {
			loadout: "eligible",
			bot: "never",
			drop: "droppable",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-projectile-v1"
		},
		modelSetId: "explosive-crossbow-model-set-v1",
		presentationId: "explosive-crossbow-family-view-v1",
		audioId: "explosive-crossbow-audio-v1",
		provenanceId: "explosive-crossbow-procedural-cc0-v1",
		evidenceIds: ["r223-explosive-crossbow", "r232-explosive-crossbow"]
	},
	{
		id: "flamethrower",
		displayName: "M2 Flamethrower",
		slot: "special",
		family: "launcher",
		fireKind: "hitscan",
		fireMode: "automatic",
		rpm: 600,
		pellets: 1,
		spinUpMs: 180,
		movementMultiplier: .82,
		damage: {
			policy: "standard",
			base: 81,
			minimum: 0,
			falloffStartM: 8,
			falloffEndM: 18,
			headMultiplier: 1,
			limbMultiplier: 1
		},
		spread: {
			hipRadians: .038,
			adsMultiplier: .72,
			movementMultiplier: 1.4,
			standMultiplier: 1,
			crouchMultiplier: .9,
			proneMultiplier: .82,
			sustainedPerShot: 8e-4,
			maximumRadians: .055
		},
		recoil: {
			pitchRadians: .004,
			yawRadians: .003,
			recoveryPerSecond: 18,
			adsMultiplier: .9,
			standMultiplier: 1,
			crouchMultiplier: .9,
			proneMultiplier: .82,
			deterministicPatternId: "flamethrower-pattern-v1"
		},
		ammo: {
			magazine: 100,
			reserve: 100,
			reloadSeconds: 3.8,
			emptyReloadSeconds: 4.2,
			switchSeconds: .85
		},
		penetration: {
			calibreLabel: "ignited fuel stream",
			power: 0,
			fmjMultiplier: 1,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 0,
			energyFalloffEndM: 18,
			minimumEnergyRetention: 0,
			minimumWallDamageMultiplier: 0,
			maximumSurfaces: 0
		},
		effects: {
			tracerColorHex: 16742948,
			muzzleFlashScale: 1.8,
			reportGain: .92,
			flashlight: null
		},
		optic: null,
		projectileId: null,
		policies: {
			loadout: "pickup-only",
			bot: "eligible",
			drop: "map-pickup",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "flamethrower-model-set-v1",
		presentationId: "flamethrower-family-view-v1",
		audioId: "flamethrower-audio-v1",
		provenanceId: "flamethrower-original-project-v1",
		evidenceIds: ["pass66-flamethrower-canonical-family"]
	},
	{
		id: "flare-gun",
		displayName: "Orion Flare Pistol",
		slot: "special",
		family: "launcher",
		fireKind: "projectile",
		fireMode: "semi",
		rpm: 24,
		pellets: 1,
		spinUpMs: 0,
		movementMultiplier: 1,
		damage: {
			policy: "standard",
			base: 42,
			minimum: 42,
			falloffStartM: 45,
			falloffEndM: 90,
			headMultiplier: 1,
			limbMultiplier: 1
		},
		spread: {
			hipRadians: .04,
			adsMultiplier: .2,
			movementMultiplier: 1.5,
			standMultiplier: 1,
			crouchMultiplier: .82,
			proneMultiplier: .72,
			sustainedPerShot: 0,
			maximumRadians: .04
		},
		recoil: {
			pitchRadians: .035,
			yawRadians: .006,
			recoveryPerSecond: 8,
			adsMultiplier: .75,
			standMultiplier: 1,
			crouchMultiplier: .84,
			proneMultiplier: .72,
			deterministicPatternId: "flare-gun-pattern-v1"
		},
		ammo: {
			magazine: 1,
			reserve: 5,
			reloadSeconds: 2.1,
			emptyReloadSeconds: 2.1,
			switchSeconds: .42
		},
		penetration: {
			calibreLabel: "37 mm signal flare",
			power: 0,
			fmjMultiplier: 1,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 0,
			energyFalloffEndM: 1,
			minimumEnergyRetention: 0,
			minimumWallDamageMultiplier: 0,
			maximumSurfaces: 0
		},
		effects: {
			tracerColorHex: 16727072,
			muzzleFlashScale: .9,
			reportGain: .82,
			flashlight: null
		},
		optic: {
			kind: "standard",
			magnification: 1.1,
			solidOcclusion: "required"
		},
		projectileId: "signal-flare-v1",
		policies: {
			loadout: "pickup-only",
			bot: "eligible",
			drop: "map-pickup",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-projectile-v1"
		},
		modelSetId: "flare-gun-model-set-v1",
		presentationId: "flare-gun-family-view-v1",
		audioId: "flare-gun-audio-v1",
		provenanceId: "flare-gun-original-project-v1",
		evidenceIds: ["pass66-flare-gun-canonical-family"]
	},
	{
		id: "crimson-flamethrower",
		displayName: "Crimson Flamethrower",
		slot: "special",
		family: "launcher",
		fireKind: "hitscan",
		fireMode: "automatic",
		rpm: 600,
		pellets: 1,
		spinUpMs: 180,
		movementMultiplier: .82,
		damage: {
			policy: "standard",
			base: 56.7,
			minimum: 0,
			falloffStartM: 8,
			falloffEndM: 18,
			headMultiplier: 1,
			limbMultiplier: 1
		},
		spread: {
			hipRadians: .038,
			adsMultiplier: .72,
			movementMultiplier: 1.4,
			standMultiplier: 1,
			crouchMultiplier: .9,
			proneMultiplier: .82,
			sustainedPerShot: 8e-4,
			maximumRadians: .055
		},
		recoil: {
			pitchRadians: .004,
			yawRadians: .003,
			recoveryPerSecond: 18,
			adsMultiplier: .9,
			standMultiplier: 1,
			crouchMultiplier: .9,
			proneMultiplier: .82,
			deterministicPatternId: "crimson-flamethrower-pattern-v1"
		},
		ammo: {
			magazine: 100,
			reserve: 0,
			reloadSeconds: 3.8,
			emptyReloadSeconds: 4.2,
			switchSeconds: .85
		},
		penetration: {
			calibreLabel: "ignited fuel stream",
			power: 0,
			fmjMultiplier: 1,
			wallPenetrationMultiplier: 1,
			materialPolicyId: "pass64-ballistic-materials-v1",
			energyFalloffStartM: 0,
			energyFalloffEndM: 18,
			minimumEnergyRetention: 0,
			minimumWallDamageMultiplier: 0,
			maximumSurfaces: 0
		},
		effects: {
			tracerColorHex: 16719636,
			muzzleFlashScale: 1.8,
			reportGain: .92,
			flashlight: null
		},
		optic: null,
		projectileId: null,
		policies: {
			loadout: "pickup-only",
			bot: "never",
			drop: "map-pickup",
			range: { kind: "never" },
			replay: "serialized",
			telemetry: "standard",
			stance: {
				stand: "allowed",
				crouch: "allowed",
				prone: "allowed"
			},
			authority: "host-shot-v1"
		},
		modelSetId: "crimson-flamethrower-model-set-v1",
		presentationId: "crimson-flamethrower-family-view-v1",
		audioId: "crimson-flamethrower-audio-v1",
		provenanceId: "crimson-flamethrower-original-project-v1",
		evidenceIds: ["pass74-crimson-flamethrower-canonical-family"]
	}
]);
/** Angular impulse per second, normalized by authored recovery rate. */
function sustainedRecoilBurden(definition) {
	return Math.hypot(definition.recoil.pitchRadians, definition.recoil.yawRadians) * (definition.rpm / 60) / definition.recoil.recoveryPerSecond;
}
//#endregion
//#region src/hosted-bots.ts
function interpolateYaw(before, after, alpha) {
	return before + (((after - before + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * alpha;
}
/**
* Guest presentation interpolation keeps continuous pose fields smooth while
* all authoritative combat/loadout fields come from the newer host snapshot.
*/
function interpolateHostedBotSnapshot(before, after, alpha) {
	const boundedAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 0));
	return Object.freeze({
		...after,
		x: before.x + (after.x - before.x) * boundedAlpha,
		y: before.y + (after.y - before.y) * boundedAlpha,
		z: before.z + (after.z - before.z) * boundedAlpha,
		yaw: interpolateYaw(before.yaw, after.yaw, boundedAlpha)
	});
}
/** Death and respawn are discontinuities: never interpolate a bot across them. */
function hostedBotSnapshotContinuity(snapshot) {
	return snapshot.deaths * 2 + Number(snapshot.alive) + 1;
}
function isHostedBotCount(value) {
	return value === 0 || value === 2 || value === 4;
}
function hostedBotIds(count) {
	return Array.from({ length: count }, (_, index) => `host-bot-${index}`);
}
/** Hosted bots remain host-authoritative while the host player is waiting to
* respawn. Their replica heartbeat must therefore not inherit player.alive. */
function hostedBotReplicationActive(role, gameStarted, matchPhase, hostedBotCount) {
	return role === "host" && gameStarted && matchPhase === "active" && hostedBotCount > 0;
}
function isHostedBotSnapshot(value) {
	if (!value || typeof value !== "object") return false;
	const bot = value;
	return typeof bot.id === "string" && /^host-bot-[0-3]$/.test(bot.id) && typeof bot.name === "string" && bot.name.length >= 1 && bot.name.length <= 20 && (bot.team === 0 || bot.team === 1) && WEAPON_CATALOG.some((definition) => definition.id === bot.weapon && definition.policies.bot === "eligible") && [
		"x",
		"y",
		"z",
		"yaw",
		"hp"
	].every((key) => Number.isFinite(bot[key])) && Number(bot.hp) >= 0 && Number(bot.hp) <= 100 && [
		"kills",
		"deaths",
		"seq"
	].every((key) => Number.isSafeInteger(bot[key]) && Number(bot[key]) >= 0) && typeof bot.alive === "boolean" && bot.alive === Number(bot.hp) > 0;
}
//#endregion
//#region src/handicap.ts
var DHV_VALUES = [
	10,
	8,
	6,
	4,
	2,
	"X"
];
function isDhv(value) {
	return DHV_VALUES.includes(value);
}
/** Lower DHV values deliberately reduce outgoing damage. X keeps the DHV 2 output. */
function dhvOutgoingMultiplier(value) {
	return value === "X" ? .2 : value / 10;
}
/** Lower DHV values deliberately increase incoming damage. X is handled as one-hit lethal. */
function dhvIncomingMultiplier(value) {
	return value === "X" ? Number.POSITIVE_INFINITY : 2 - value / 10;
}
function applyDhvOutgoingDamage(damage, value) {
	return Math.max(0, Number.isFinite(damage) ? damage : 0) * dhvOutgoingMultiplier(value);
}
/** The X-mode magnum's clean headshot is the one deliberate exception to reduced output. */
function applyDhvWeaponOutgoingDamage(damage, value, magnumHeadshot) {
	const admitted = Math.max(0, Number.isFinite(damage) ? damage : 0);
	if (value === "X" && magnumHeadshot && admitted >= 99) return 100;
	return applyDhvOutgoingDamage(admitted, value);
}
function applyDhvIncomingDamage(damage, currentHealth, value) {
	const admitted = Math.max(0, Number.isFinite(damage) ? damage : 0);
	if (admitted <= 0) return 0;
	if (value === "X") return Math.max(0, Number.isFinite(currentHealth) ? currentHealth : 0);
	return admitted * dhvIncomingMultiplier(value);
}
/**
* Reports theoretical pre-health-clamp damage on the same target-DHV scale as
* the authoritative applied value. The applied floor absorbs harmless binary
* floating-point drift and keeps shot-result packets protocol-valid.
*/
function reportedDhvRawDamage(rawDamage, currentHealth, value, appliedDamage) {
	return Math.max(Math.max(0, Number.isFinite(appliedDamage) ? appliedDamage : 0), applyDhvIncomingDamage(rawDamage, currentHealth, value));
}
function dhvLabel(value) {
	return value === 10 ? "STANDARD" : value === "X" ? "ONE-SHOT / MAGNUM" : `${Math.round((1 - value / 10) * 100)}% HANDICAP`;
}
var MAX_CLOCK_REVISION = 1e9;
function finiteClockInputs(...values) {
	return values.every(Number.isFinite);
}
function isGunRangeMatchClockSnapshot(value, durationMs) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const state = value;
	const exactKeys = [
		"schemaVersion",
		"revision",
		"paused",
		"remainingMs",
		"sampledAtHostTimeMs"
	];
	const boundedDuration = durationMs === void 0 || Number.isFinite(durationMs) && durationMs >= 0 && Number(state.remainingMs) <= durationMs;
	return Object.keys(state).length === exactKeys.length && exactKeys.every((key) => Object.hasOwn(state, key)) && state.schemaVersion === 1 && Number.isSafeInteger(state.revision) && Number(state.revision) >= 0 && Number(state.revision) <= MAX_CLOCK_REVISION && typeof state.paused === "boolean" && Number.isFinite(state.remainingMs) && Number(state.remainingMs) >= 0 && boundedDuration && Number.isFinite(state.sampledAtHostTimeMs) && Number(state.sampledAtHostTimeMs) >= 0;
}
function createGunRangeMatchClockSnapshot(durationMs, sampledAtHostTimeMs, revision = 0) {
	const state = Object.freeze({
		schemaVersion: 1,
		revision,
		paused: false,
		remainingMs: durationMs,
		sampledAtHostTimeMs
	});
	if (!isGunRangeMatchClockSnapshot(state, durationMs)) throw new TypeError("Gun Range match clock requires bounded duration, revision, and host time");
	return state;
}
function advanceGunRangeMatchClock(state, nowHostTimeMs, pauseRequested, durationMs, boundaryEdgeCount = pauseRequested === state.paused ? 0 : 1) {
	if (!isGunRangeMatchClockSnapshot(state, durationMs) || !finiteClockInputs(nowHostTimeMs, durationMs, boundaryEdgeCount) || nowHostTimeMs < state.sampledAtHostTimeMs || durationMs < 0 || !Number.isSafeInteger(boundaryEdgeCount) || boundaryEdgeCount < 0 || pauseRequested !== state.paused && boundaryEdgeCount === 0 || state.revision + boundaryEdgeCount > MAX_CLOCK_REVISION) throw new TypeError("Gun Range clock step requires a valid state and monotonic host time");
	const elapsedMs = state.paused ? 0 : nowHostTimeMs - state.sampledAtHostTimeMs;
	const remainingMs = boundaryEdgeCount > 0 ? durationMs : Math.max(0, Math.min(durationMs, state.remainingMs - elapsedMs));
	const transition = boundaryEdgeCount === 0 ? null : pauseRequested === state.paused ? "reset" : pauseRequested ? "paused" : "resumed";
	return Object.freeze({
		state: Object.freeze({
			schemaVersion: 1,
			revision: state.revision + boundaryEdgeCount,
			paused: pauseRequested,
			remainingMs,
			sampledAtHostTimeMs: nowHostTimeMs
		}),
		transition,
		boundaryEdgeCount
	});
}
/** Counts exact admitted participant entry/exit edges between authority samples. */
function gunRangeTestBayOccupancyBoundaryCount(previousOccupantIds, nextOccupantIds) {
	const validate = (ids) => {
		if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id.length < 1 || id.length > 80) || new Set(ids).size !== ids.length) throw new TypeError("Gun Range occupancy edges require unique bounded participant IDs");
		return new Set(ids);
	};
	const previous = validate(previousOccupantIds);
	const next = validate(nextOccupantIds);
	let boundaryEdgeCount = 0;
	for (const id of previous) if (!next.has(id)) boundaryEdgeCount += 1;
	for (const id of next) if (!previous.has(id)) boundaryEdgeCount += 1;
	return boundaryEdgeCount;
}
function restoreGunRangeMatchClock(state, nowHostTimeMs, downtimeMs, durationMs) {
	if (!isGunRangeMatchClockSnapshot(state, durationMs) || !finiteClockInputs(nowHostTimeMs, downtimeMs, durationMs) || downtimeMs < 0) throw new TypeError("Gun Range clock restore requires a valid checkpoint and non-negative downtime");
	return Object.freeze({
		...state,
		remainingMs: state.paused ? state.remainingMs : Math.max(0, state.remainingMs - downtimeMs),
		sampledAtHostTimeMs: nowHostTimeMs
	});
}
function projectGunRangeMatchClock(state, sampleAtLocalMonoMs, nowLocalMonoMs, durationMs) {
	if (!isGunRangeMatchClockSnapshot(state, durationMs) || !finiteClockInputs(sampleAtLocalMonoMs, nowLocalMonoMs, durationMs) || durationMs < 0) throw new TypeError("Gun Range clock projection requires a valid state and local clock mapping");
	const elapsedSinceSampleMs = state.paused ? 0 : Math.max(0, nowLocalMonoMs - sampleAtLocalMonoMs);
	const endsAt = nowLocalMonoMs + Math.max(0, Math.min(durationMs, state.remainingMs - elapsedSinceSampleMs));
	return Object.freeze({
		phaseStartedAt: endsAt - durationMs,
		endsAt
	});
}
/**
* A replica may project a few milliseconds ahead of the host. Keep it active
* at zero until the reliable host lobby revision declares the round ended, so
* a delayed pause edge can still move the shared clock back above zero.
*/
function holdGunRangeReplicaAtAuthorityBoundary(previous, advanced, hostLobbyStillActive) {
	return hostLobbyStillActive && previous.phase === "active" && advanced.phase === "ended" && advanced.endReason === "time" ? {
		...previous,
		endsAt: advanced.endsAt
	} : advanced;
}
function gunRangeTestBayOccupants(participants, bounds) {
	if (!finiteClockInputs(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, bounds.minZ, bounds.maxZ) || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY || bounds.minZ > bounds.maxZ) throw new TypeError("Gun Range test-bay occupancy requires finite ordered bounds");
	return Object.freeze(participants.filter((participant) => participant.admitted && participant.connected && participant.alive && finiteClockInputs(participant.position.x, participant.position.y, participant.position.z) && participant.position.x >= bounds.minX && participant.position.x <= bounds.maxX && participant.position.y >= bounds.minY && participant.position.y <= bounds.maxY && participant.position.z >= bounds.minZ && participant.position.z <= bounds.maxZ).map((participant) => participant.id).sort());
}
/** Timed Gun Range round length (2 minutes). */
var GUN_RANGE_ROUND_MS = 12e4;
function isGunRange(arenaId) {
	return arenaId === "gun-range";
}
function hasUnlimitedRangeAmmo(arenaId) {
	return isGunRange(arenaId);
}
/** Frags are range-safety banned on the Gun Range lane. */
function rangeGrenadesAllowed(arenaId) {
	return !isGunRange(arenaId);
}
function reloadSupply(arenaId, currentReserve, magazineSize) {
	return hasUnlimitedRangeAmmo(arenaId) ? Math.max(currentReserve, magazineSize) : currentReserve;
}
function reserveAfterCompletedReload(arenaId, currentReserve, completedReserve) {
	return hasUnlimitedRangeAmmo(arenaId) ? currentReserve : completedReserve;
}
function reserveHudValue(arenaId, reserve) {
	return hasUnlimitedRangeAmmo(arenaId) ? "∞" : String(Math.max(0, Math.floor(reserve)));
}
function advanceRangeScore(currentScore, targetValue) {
	const current = Number.isSafeInteger(currentScore) && currentScore >= 0 ? currentScore : 0;
	const award = Number.isSafeInteger(targetValue) && targetValue > 0 ? targetValue : 0;
	return Math.min(Number.MAX_SAFE_INTEGER, current + award);
}
/** Hits ÷ shots as a 0–100 whole percent. Zero shots → 0%. */
function rangeAccuracyPercent(hits, shots) {
	const safeHits = Number.isFinite(hits) ? Math.max(0, Math.floor(hits)) : 0;
	const safeShots = Number.isFinite(shots) ? Math.max(0, Math.floor(shots)) : 0;
	if (safeShots <= 0) return 0;
	return Math.min(100, Math.round(safeHits / safeShots * 100));
}
//#endregion
//#region src/squad-presentation.ts
var DEFAULT_SQUAD_PRESENTATION = Object.freeze({
	aqua: Object.freeze({
		name: "AQUA",
		color: "#55e6ff"
	}),
	coral: Object.freeze({
		name: "CORAL",
		color: "#ff6b73"
	})
});
/**
* Wire-boundedness validator only (protocol-18 `lobby-squad` / `lobby-join`
* compatibility). Passing this check does NOT make a value a squad identity:
* the host stamps the canonical pair regardless (HF-328).
*/
function isSquadName(value) {
	return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/.test(value);
}
/** Wire-boundedness validator only; see isSquadName (HF-328). */
function isSquadColor(value) {
	return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
function defaultSquadPresentation(team) {
	return team === 0 ? DEFAULT_SQUAD_PRESENTATION.aqua : DEFAULT_SQUAD_PRESENTATION.coral;
}
/**
* HF-328 host-side validation: client-supplied names and colours (including
* protocol-18 `lobby-squad` wire values and pre-Pass-74 checkpoint restores)
* are accepted for compatibility but IGNORED. The canonical colour-name pair
* for the member's team is always the identity, so pre-match and mid-match
* squad rendering can never diverge from team authority.
*/
function sanitizeSquadPresentation(_name, _color, team) {
	return defaultSquadPresentation(team);
}
function escapeHtml(value) {
	return value.replace(/[&<>'"]/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"'": "&#39;",
		"\"": "&quot;"
	})[character]);
}
/** Render the prescribed identity for the team; gameplay team remains authoritative. */
function renderSquadRosterBadge(name, color, team) {
	const squad = sanitizeSquadPresentation(name, color, team);
	return `<span class="lobby-squad-badge" style="--lobby-squad-color:${squad.color}"><span class="lobby-squad-swatch" aria-hidden="true"></span>${escapeHtml(squad.name)}</span>`;
}
//#endregion
//#region src/operator-skin-catalog.ts
var SOURCE_KEYS$1 = Object.freeze([
	"id",
	"displayName",
	"archetype",
	"assetId",
	"availability",
	"rigContract"
]);
var RIG_CONTRACT_KEYS = Object.freeze([
	"rigId",
	"jointCount",
	"animationClipCount"
]);
var AVAILABILITIES$1 = ["selectable", "retired"];
function isPlainObject$1(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys$12(value, expected, label) {
	const unknown = Object.keys(value).filter((key) => !expected.includes(key));
	const missing = expected.filter((key) => !Object.hasOwn(value, key));
	if (unknown.length > 0 || missing.length > 0) throw new Error(`${label} keys invalid; unknown=[${unknown.join(",")}] missing=[${missing.join(",")}]`);
}
function validateSourceDefinition$1(value, index) {
	if (!isPlainObject$1(value)) throw new Error(`catalog[${index}] must be an object`);
	exactKeys$12(value, SOURCE_KEYS$1, `catalog[${index}]`);
	const label = typeof value.id === "string" ? value.id : `catalog[${index}]`;
	if (typeof value.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value.id)) throw new Error(`${label} has invalid ID`);
	if (typeof value.displayName !== "string" || value.displayName.trim().length === 0 || value.displayName.length > 80) throw new Error(`${label} has invalid display name`);
	if (typeof value.archetype !== "string" || value.archetype.trim().length === 0 || value.archetype.length > 80) throw new Error(`${label} has invalid archetype`);
	if (typeof value.assetId !== "string" || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value.assetId)) throw new Error(`${label} has invalid assetId`);
	if (!AVAILABILITIES$1.includes(value.availability)) throw new Error(`${label} has invalid availability`);
	if (!isPlainObject$1(value.rigContract)) throw new Error(`${label} has invalid rig contract`);
	const rig = value.rigContract;
	exactKeys$12(rig, RIG_CONTRACT_KEYS, `${label}.rigContract`);
	if (typeof rig.rigId !== "string" || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(rig.rigId)) throw new Error(`${label} has invalid rig id`);
	if (!Number.isSafeInteger(rig.jointCount) || Number(rig.jointCount) < 1 || Number(rig.jointCount) > 500) throw new Error(`${label} has invalid rig joint count`);
	if (!Number.isSafeInteger(rig.animationClipCount) || Number(rig.animationClipCount) < 1 || Number(rig.animationClipCount) > 500) throw new Error(`${label} has invalid rig clip count`);
}
function freezeSourceDefinitions$1(sources) {
	for (const source of sources) Object.freeze(source);
	Object.freeze(sources);
	return sources;
}
/**
* Builds the immutable operator skin catalog from one authored definition list.
* This is the SINGLE canonical source of selectable operator skins.
* Adding, renaming, or retiring an entry necessarily reruns this projection;
* callers cannot provide a second parallel eligibility list.
*/
function createOperatorSkinCatalog(rawSources) {
	if (!Array.isArray(rawSources) || rawSources.length === 0) throw new Error("operator skin catalog must be a non-empty array");
	rawSources.forEach((source, index) => validateSourceDefinition$1(source, index));
	const sources = rawSources;
	const ids = sources.map((source) => source.id);
	if (new Set(ids).size !== ids.length) throw new Error("operator skin catalog IDs must be unique");
	const defaultEntry = sources.find((source) => source.id === "default");
	if (!defaultEntry) throw new Error("default operator skin is required");
	if (defaultEntry.availability !== "selectable") throw new Error("default must be selectable");
	const canonicalRig = defaultEntry.rigContract;
	for (const source of sources) if (source.rigContract.rigId !== canonicalRig.rigId || source.rigContract.jointCount !== canonicalRig.jointCount || source.rigContract.animationClipCount !== canonicalRig.animationClipCount) throw new Error(`${source.id} rig contract diverges from the canonical rig; clips cannot retarget`);
	const definitions = Object.freeze(sources.map((source) => Object.freeze({
		...source,
		rigContract: Object.freeze({ ...source.rigContract })
	})));
	return Object.freeze({ definitions });
}
function validateOperatorSkinId(catalog, id) {
	return catalog.definitions.some((def) => def.id === id && def.availability === "selectable");
}
/**
* Wire-safe membership check for the canonical catalog: exactly the currently
* SELECTABLE ids. Retired ids fail here, so a stale client cannot force a
* retired skin back onto other peers' screens.
*/
function isSelectableOperatorSkinId(value) {
	return typeof value === "string" && validateOperatorSkinId(OPERATOR_SKIN_CATALOG, value);
}
var OPERATOR_SKIN_SOURCES = freezeSourceDefinitions$1([
	{
		id: "default",
		displayName: "Standard Operator",
		archetype: "standard",
		assetId: "pass65-third-person-operator-family-v1",
		availability: "selectable",
		rigContract: {
			rigId: "pass65-third-person-operator-family-v1",
			jointCount: 62,
			animationClipCount: 24
		}
	},
	{
		id: "explorer",
		displayName: "Sunspire Wayfarer",
		archetype: "explorer",
		assetId: "explorer-trailworn-canvas-v1",
		availability: "selectable",
		rigContract: {
			rigId: "pass65-third-person-operator-family-v1",
			jointCount: 62,
			animationClipCount: 24
		}
	},
	{
		id: "symbiote",
		displayName: "Carapace Bulwark",
		archetype: "symbiote",
		assetId: "symbiote-graftplate-composite-v1",
		availability: "selectable",
		rigContract: {
			rigId: "pass65-third-person-operator-family-v1",
			jointCount: 62,
			animationClipCount: 24
		}
	},
	{
		id: "navalops",
		displayName: "Tidewrack Operative",
		archetype: "navalops",
		assetId: "navalops-bluewater-lowprofile-v1",
		availability: "selectable",
		rigContract: {
			rigId: "pass65-third-person-operator-family-v1",
			jointCount: 62,
			animationClipCount: 24
		}
	}
]);
var OPERATOR_SKIN_CATALOG = createOperatorSkinCatalog(OPERATOR_SKIN_SOURCES);
/**
* Team colours, and how much of one is washed over the body palette.
*
* 0.34 was chosen against the falsifier in operator-skin-appearance.test.ts:
* it is high enough that the same skin on the two teams stays separable, and
* low enough that four skins on the SAME team stay separable from each other.
* Both halves are asserted; neither may be traded for the other.
*/
var OPERATOR_TEAM_TINTS = Object.freeze({
	0: 2979970,
	1: 11750719
});
var OPERATOR_TEAM_IDENTITY_BLEND = .34;
/** The under-suit carries a heavier team wash: it is dark either way, so it
* costs the skin little and buys the team read back at distance. */
var OPERATOR_TEAM_UNDERSUIT_BLEND = .46;
/**
* The hue window every bot-identity colour/emissive must stay inside. The
* shipped default purples measure 269-286 degrees; the band leaves room for
* the explorer's warmer orchid and the naval operative's blue-violet while
* excluding both team tints (aqua ~187deg, coral ~7deg) by a wide margin.
* Enforced at module load below and pinned in operator-skin-appearance.test.
*/
var OPERATOR_BOT_IDENTITY_HUE_BAND = Object.freeze({
	minDeg: 252,
	maxDeg: 320
});
Object.freeze({
	swat: 1.2,
	swatBlack: 1.05,
	grey: .72
});
var PALETTES = Object.freeze({
	default: Object.freeze({
		id: "default",
		arm: Object.freeze({
			sleeve: 10471116,
			glove: 9413545,
			fingerGlove: 10137268,
			accent: 8382190,
			sleeveRoughness: .86,
			gloveRoughness: .72,
			accentMetalness: .22,
			accentEmissive: 866879
		}),
		body: Object.freeze({
			swat: 7648188,
			swatBlack: 3360589,
			grey: 9418426,
			visor: 6283498,
			swatRoughness: .78,
			swatBlackRoughness: .86,
			lift: .06
		}),
		card: Object.freeze({
			backdropTop: 1915456,
			backdropBottom: 794147,
			torso: 3103328,
			webbing: 1452077,
			trim: 1222577,
			visor: 4183005,
			skin: 12950134,
			ink: 14676980,
			materialLabel: "ISSUE WEAVE"
		}),
		bot: Object.freeze({
			swat: Object.freeze({
				color: 14179583,
				emissive: 8197821,
				roughness: .46,
				metalness: .08
			}),
			swatBlack: Object.freeze({
				color: 11091199,
				emissive: 6098088,
				roughness: .5,
				metalness: .06
			}),
			grey: Object.freeze({
				color: 14919167,
				emissive: 6558110,
				roughness: .54,
				metalness: .04
			})
		})
	}),
	explorer: Object.freeze({
		id: "explorer",
		arm: Object.freeze({
			sleeve: 6737090,
			glove: 8015400,
			fingerGlove: 12618334,
			accent: 14263361,
			sleeveRoughness: .95,
			gloveRoughness: .7,
			accentMetalness: .06,
			accentEmissive: 3810312
		}),
		body: Object.freeze({
			swat: 3116938,
			swatBlack: 5913120,
			grey: 13215864,
			visor: 16766090,
			swatRoughness: .94,
			swatBlackRoughness: .95,
			lift: .11
		}),
		card: Object.freeze({
			backdropTop: 1980984,
			backdropBottom: 660499,
			torso: 3116938,
			webbing: 5913120,
			trim: 14263361,
			visor: 16766090,
			skin: 12618334,
			ink: 16445144,
			materialLabel: "CANVAS"
		}),
		bot: Object.freeze({
			swat: Object.freeze({
				color: 13594576,
				emissive: 6691471,
				roughness: .68,
				metalness: .04
			}),
			swatBlack: Object.freeze({
				color: 10311112,
				emissive: 4722050,
				roughness: .7,
				metalness: .03
			}),
			grey: Object.freeze({
				color: 14656226,
				emissive: 6034055,
				roughness: .64,
				metalness: .03
			})
		})
	}),
	symbiote: Object.freeze({
		id: "symbiote",
		arm: Object.freeze({
			sleeve: 11048136,
			glove: 7298946,
			fingerGlove: 10128048,
			accent: 15262422,
			sleeveRoughness: .35,
			gloveRoughness: .3,
			accentMetalness: .15,
			accentEmissive: 2366e3
		}),
		body: Object.freeze({
			swat: 9071812,
			swatBlack: 1183255,
			grey: 4865109,
			visor: 15262422,
			swatRoughness: .38,
			swatBlackRoughness: .3,
			lift: .22
		}),
		card: Object.freeze({
			backdropTop: 1840164,
			backdropBottom: 657168,
			torso: 3813191,
			webbing: 1511966,
			trim: 15262422,
			visor: 15262422,
			skin: 11571070,
			ink: 15786751,
			materialLabel: "CHITIN"
		}),
		bot: Object.freeze({
			swat: Object.freeze({
				color: 13192703,
				emissive: 9114319,
				roughness: .22,
				metalness: .18
			}),
			swatBlack: Object.freeze({
				color: 9053652,
				emissive: 4196476,
				roughness: .16,
				metalness: .2
			}),
			grey: Object.freeze({
				color: 15313151,
				emissive: 7344813,
				roughness: .2,
				metalness: .12
			})
		})
	}),
	navalops: Object.freeze({
		id: "navalops",
		arm: Object.freeze({
			sleeve: 9680600,
			glove: 8689320,
			fingerGlove: 9348021,
			accent: 9423093,
			sleeveRoughness: .74,
			gloveRoughness: .58,
			accentMetalness: .28,
			accentEmissive: 862016
		}),
		body: Object.freeze({
			swat: 4882618,
			swatBlack: 2373707,
			grey: 8368340,
			visor: 10474751,
			swatRoughness: .52,
			swatBlackRoughness: .7,
			lift: .19
		}),
		card: Object.freeze({
			backdropTop: 1452348,
			backdropBottom: 462100,
			torso: 3367055,
			webbing: 1054495,
			trim: 5217240,
			visor: 10474751,
			skin: 12160364,
			ink: 14478586,
			materialLabel: "WET SHELL"
		}),
		bot: Object.freeze({
			swat: Object.freeze({
				color: 11107839,
				emissive: 5575869,
				roughness: .34,
				metalness: .14
			}),
			swatBlack: Object.freeze({
				color: 9395432,
				emissive: 4000416,
				roughness: .38,
				metalness: .1
			}),
			grey: Object.freeze({
				color: 13938943,
				emissive: 5378464,
				roughness: .36,
				metalness: .08
			})
		})
	})
});
for (const definition of OPERATOR_SKIN_CATALOG.definitions) {
	if (definition.availability !== "selectable") continue;
	if (!Object.hasOwn(PALETTES, definition.id)) throw new Error(`selectable operator skin ${definition.id} has no palette; the menu and first-person arms cannot show it`);
}
for (const definition of OPERATOR_SKIN_CATALOG.definitions) {
	if (definition.availability !== "selectable") continue;
	const identity = PALETTES[definition.id]?.bot;
	if (!identity) throw new Error(`selectable operator skin ${definition.id} has no bot identity; bots could not carry it`);
	for (const role of [
		"swat",
		"swatBlack",
		"grey"
	]) for (const key of ["color", "emissive"]) {
		const hex = identity[role][key];
		const max = Math.max((hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255);
		const delta = max - Math.min((hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255);
		let hue = 0;
		if (delta > 0) {
			const r = (hex >> 16 & 255) / 255;
			const g = (hex >> 8 & 255) / 255;
			const b = (hex & 255) / 255;
			if (max === r) hue = ((g - b) / delta + 6) % 6;
			else if (max === g) hue = (b - r) / delta + 2;
			else hue = (r - g) / delta + 4;
			hue *= 60;
		}
		if (hue < OPERATOR_BOT_IDENTITY_HUE_BAND.minDeg || hue > OPERATOR_BOT_IDENTITY_HUE_BAND.maxDeg) throw new Error(`operator skin ${definition.id} bot ${role}.${key} #${hex.toString(16).padStart(6, "0")} hue ${hue.toFixed(1)}deg is outside the bot purple band [${OPERATOR_BOT_IDENTITY_HUE_BAND.minDeg}, ${OPERATOR_BOT_IDENTITY_HUE_BAND.maxDeg}]`);
	}
}
/** Unknown/retired ids resolve to the standard operator rather than throwing:
* a stale peer selection must never leave a player with untinted arms. */
function operatorSkinPalette(id) {
	return PALETTES[id] ?? PALETTES.default;
}
var LOCAL_OPERATOR_SKIN_STORAGE_KEY = "atomic-acres-operator-skin";
function readLocalOperatorSkinId(storage) {
	const store = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
	if (!store) return "default";
	try {
		const stored = store.getItem(LOCAL_OPERATOR_SKIN_STORAGE_KEY);
		return stored !== null && isSelectableOperatorSkinId(stored) ? stored : "default";
	} catch {
		return "default";
	}
}
/**
* Calls back with the selected skin id whenever it changes, and once up front.
*
* A same-document `localStorage.setItem` does NOT raise a `storage` event -
* that fires only in OTHER tabs - so listening for `storage` alone would have
* been another silently-dead path. The skin cards are the one place a player
* can change this, so their click is the signal; `storage` is kept as well for
* a change made in a second tab.
*/
function observeLocalOperatorSkinId(onChange, target = typeof document === "undefined" ? null : document) {
	let current = readLocalOperatorSkinId();
	onChange(current);
	if (!target || typeof target.addEventListener !== "function" || typeof target.removeEventListener !== "function") return () => void 0;
	const publish = (next) => {
		if (next === current) return;
		current = next;
		onChange(next);
	};
	const onClick = (event) => {
		const chosen = (event.target?.closest?.("[data-operator-skin]"))?.dataset?.operatorSkin;
		if (chosen !== void 0 && isSelectableOperatorSkinId(chosen)) publish(chosen);
	};
	const onStorage = (event) => {
		if (event.key !== "atomic-acres-operator-skin") return;
		publish(readLocalOperatorSkinId());
	};
	target.addEventListener("click", onClick);
	const windowTarget = typeof window === "undefined" || typeof window.addEventListener !== "function" ? null : window;
	windowTarget?.addEventListener("storage", onStorage);
	return () => {
		target.removeEventListener("click", onClick);
		windowTarget?.removeEventListener("storage", onStorage);
	};
}
/**
* The team's own colour blended over a skin's body colour. Exported so the test
* can assert BOTH halves of the compromise on real numbers: four skins on one
* team must stay separable from each other, and one skin on the two teams must
* stay separable from itself.
*/
function operatorBodyColour(skinId, team, role) {
	const body = operatorSkinPalette(skinId).body;
	const blend = role === "swatBlack" ? OPERATOR_TEAM_UNDERSUIT_BLEND : OPERATOR_TEAM_IDENTITY_BLEND;
	const skin = body[role];
	const teamTint = OPERATOR_TEAM_TINTS[team];
	const mix = (shift) => {
		const a = skin >> shift & 255;
		const b = teamTint >> shift & 255;
		return Math.round(a + (b - a) * blend) & 255;
	};
	return mix(16) << 16 | mix(8) << 8 | mix(0);
}
//#endregion
//#region src/operator-appearance-catalog.ts
var OPERATOR_STANCES = Object.freeze([
	Object.freeze({
		id: "ready",
		displayName: "Weapon Ready",
		description: "Rifle up and levelled. The default combat posture.",
		clipName: "Idle_Gun_Pointing"
	}),
	Object.freeze({
		id: "low",
		displayName: "Low Carry",
		description: "Muzzle down and relaxed between contacts.",
		clipName: "Idle_Gun"
	}),
	Object.freeze({
		id: "alert",
		displayName: "On The Trigger",
		description: "Tensed on the grip, ready to fire.",
		clipName: "Idle_Gun_Shoot"
	})
]);
var OPERATOR_EMOTES = Object.freeze([
	Object.freeze({
		id: "none",
		displayName: "None",
		description: "No emote bound.",
		clipName: null
	}),
	Object.freeze({
		id: "wave",
		displayName: "Wave",
		description: "A clear friendly signal across the map.",
		clipName: "Wave"
	}),
	Object.freeze({
		id: "salute-punch",
		displayName: "Fist",
		description: "Short jab - taunt or acknowledgement.",
		clipName: "Punch_Right"
	}),
	Object.freeze({
		id: "boot",
		displayName: "Boot",
		description: "Front kick. Strictly for celebration.",
		clipName: "Kick_Right"
	})
]);
var DEFAULT_OPERATOR_STANCE = "ready";
var DEFAULT_OPERATOR_EMOTE = "none";
function isOperatorStanceId(value) {
	return typeof value === "string" && OPERATOR_STANCES.some((stance) => stance.id === value);
}
function isOperatorEmoteId(value) {
	return typeof value === "string" && OPERATOR_EMOTES.some((emote) => emote.id === value);
}
function operatorStance(id) {
	const found = OPERATOR_STANCES.find((stance) => stance.id === id);
	if (!found) throw new Error(`unknown operator stance ${id}`);
	return found;
}
function operatorEmote(id) {
	const found = OPERATOR_EMOTES.find((emote) => emote.id === id);
	if (!found) throw new Error(`unknown operator emote ${id}`);
	return found;
}
/**
* The idle clip a given stance requests, falling back through the bound idles
* when a skin's mixer does not carry the exact clip. Fail-soft on purpose: an
* appearance choice must never leave an operator with no idle animation.
*/
function stanceIdleClip(id, availableClips) {
	const preferred = operatorStance(id).clipName;
	if (availableClips.has(preferred)) return preferred;
	for (const fallback of [
		"Idle_Gun_Pointing",
		"Idle_Gun",
		"Idle_Gun_Shoot",
		"Idle"
	]) if (availableClips.has(fallback)) return fallback;
	return preferred;
}
Object.freeze([.../* @__PURE__ */ new Set([...OPERATOR_STANCES.map((stance) => stance.clipName), ...OPERATOR_EMOTES.map((emote) => emote.clipName).filter((name) => name !== null)])]);
//#endregion
//#region src/private-match.ts
var DEFAULT_PRIVATE_MATCH_CONFIG = Object.freeze({
	arenaId: "atomic-acres",
	mode: "ffa",
	capacity: 4,
	hostedBotCount: 0,
	autoBalance: true,
	durationMs: 3e5,
	scoreLimit: null
});
function isDominationLobbyState(value) {
	if (!value || typeof value !== "object") return false;
	const state = value;
	if (!Array.isArray(state.zones) || state.zones.length !== 3) return false;
	const ids = /* @__PURE__ */ new Set();
	for (const zone of state.zones) {
		if (!zone || typeof zone !== "object") return false;
		if (zone.id !== "A" && zone.id !== "B" && zone.id !== "C") return false;
		ids.add(zone.id);
		if (zone.owner !== null && zone.owner !== 0 && zone.owner !== 1) return false;
		if (zone.capturingTeam !== null && zone.capturingTeam !== 0 && zone.capturingTeam !== 1) return false;
		if (typeof zone.progress !== "number" || !Number.isFinite(zone.progress) || zone.progress < 0 || zone.progress > 1) return false;
		if (typeof zone.contested !== "boolean") return false;
	}
	if (ids.size !== 3) return false;
	return Array.isArray(state.scores) && state.scores.length === 2 && state.scores.every((score) => typeof score === "number" && Number.isSafeInteger(score) && score >= 0 && score <= 1e5);
}
var REJOIN_GRACE_MS = 9e4;
function rejoinReservationExpired(disconnectedAtMonoMs, nowMonoMs) {
	return Number.isFinite(disconnectedAtMonoMs) && Number.isFinite(nowMonoMs) && nowMonoMs - disconnectedAtMonoMs >= 9e4;
}
var LOBBY_START_LEAD_MS = 3500;
var CLOCK_PING_INTERVAL_MS = 2e3;
function isRoomCapacity(value) {
	return value === 4 || value === 6;
}
function isMatchMode(value) {
	return value === "tdm" || value === "ffa" || value === "domination";
}
/** HF-377: the only kill limits a lobby can publish. `null` means uncapped and
* is rendered as OFF; every other entry is a first-to-N kills target applied
* identically to TDM squads and FFA leaders through MatchRules.scoreLimit. */
var LOBBY_KILL_LIMITS = Object.freeze([
	null,
	10,
	25,
	50,
	100
]);
/** HF-377: the only match durations a lobby can publish, in milliseconds.
* Bounded by MAX_PRIVATE_MATCH_DURATION_MS below. */
var LOBBY_TIME_LIMITS_MS = Object.freeze([
	12e4,
	3e5,
	6e5,
	9e5
]);
function isLobbyKillLimit(value) {
	return value === null || typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 999;
}
function isLobbyTimeLimitMs(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 6e4 && value <= 9e5;
}
function isPrivateMatchConfig(value) {
	if (!value || typeof value !== "object") return false;
	const config = value;
	return isArenaId(config.arenaId) && isMatchMode(config.mode) && isRoomCapacity(config.capacity) && isHostedBotCount(config.hostedBotCount) && typeof config.autoBalance === "boolean" && isLobbyTimeLimitMs(config.durationMs) && isLobbyKillLimit(config.scoreLimit) && (config.arenaId !== "gun-range" || config.mode === "ffa" && config.hostedBotCount === 0 && config.autoBalance === false && config.durationMs === 12e4 && config.scoreLimit === null) && (config.mode !== "domination" || config.arenaId === "test2");
}
function isLobbyMember(value) {
	if (!value || typeof value !== "object") return false;
	const member = value;
	return typeof member.id === "string" && member.id.length > 0 && member.id.length <= 80 && typeof member.name === "string" && member.name.length > 0 && member.name.length <= 20 && (member.team === 0 || member.team === 1) && typeof member.ready === "boolean" && typeof member.connected === "boolean" && isDhv(member.dhv) && (member.squadName === void 0 || isSquadName(member.squadName)) && (member.squadColor === void 0 || isSquadColor(member.squadColor)) && (member.skinId === void 0 || isSelectableOperatorSkinId(member.skinId)) && (member.stanceId === void 0 || isOperatorStanceId(member.stanceId)) && (member.pingMs === null || Number.isFinite(member.pingMs) && Number(member.pingMs) >= 0 && Number(member.pingMs) <= 5e3);
}
function isPlayerScore(value) {
	if (!value || typeof value !== "object") return false;
	const score = value;
	return typeof score.id === "string" && score.id.length > 0 && score.id.length <= 80 && Number.isSafeInteger(score.kills) && Number(score.kills) >= 0 && Number(score.kills) <= 500 && Number.isSafeInteger(score.deaths) && Number(score.deaths) >= 0 && Number(score.deaths) <= 500 && Number.isSafeInteger(score.damageDealt) && Number(score.damageDealt) >= 0 && Number(score.damageDealt) <= 1e6 && Number.isSafeInteger(score.damageTaken) && Number(score.damageTaken) >= 0 && Number(score.damageTaken) <= 1e6 && (score.rangeScore === void 0 || Number.isSafeInteger(score.rangeScore) && Number(score.rangeScore) >= 0 && Number(score.rangeScore) <= 1e7) && (score.rangeHits === void 0 || Number.isSafeInteger(score.rangeHits) && Number(score.rangeHits) >= 0 && Number(score.rangeHits) <= 1e5) && (score.rangeShots === void 0 || Number.isSafeInteger(score.rangeShots) && Number(score.rangeShots) >= 0 && Number(score.rangeShots) <= 1e5);
}
function isGunRangeDummySnapshotEntry(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const entry = value;
	const keys = [
		"id",
		"active",
		"health",
		"respawnAtHostTimeMs"
	];
	return Object.keys(entry).length === keys.length && keys.every((key) => Object.hasOwn(entry, key)) && typeof entry.id === "string" && entry.id.startsWith("test-dummy-") && entry.id.length <= 80 && typeof entry.active === "boolean" && Number.isFinite(entry.health) && Number(entry.health) >= 0 && Number(entry.health) <= 500 && Number.isFinite(entry.respawnAtHostTimeMs) && Number(entry.respawnAtHostTimeMs) >= 0 && (entry.active === false || Number(entry.health) > 0);
}
function isLobbyTestBayDoorState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const state = value;
	const keys = [
		"phase",
		"openness",
		"updatedAtMs",
		"thumpSequence"
	];
	return Object.keys(state).length === keys.length && keys.every((key) => Object.hasOwn(state, key)) && (state.phase === "closed" || state.phase === "opening" || state.phase === "open" || state.phase === "closing") && Number.isFinite(state.openness) && Number(state.openness) >= 0 && Number(state.openness) <= 1 && Number.isFinite(state.updatedAtMs) && Number(state.updatedAtMs) >= 0 && Number.isSafeInteger(state.thumpSequence) && Number(state.thumpSequence) >= 0 && Number(state.thumpSequence) <= 1e9 && (state.phase !== "closed" || state.openness === 0) && (state.phase !== "open" || state.openness === 1);
}
function emptyPlayerScore(id) {
	return {
		id,
		kills: 0,
		deaths: 0,
		damageDealt: 0,
		damageTaken: 0
	};
}
function recordPlayerDamage(scores, attackerId, victimId, damage) {
	const next = new Map(scores);
	if (attackerId === victimId || !Number.isFinite(damage) || damage <= 0) return next;
	const admittedDamage = Math.max(1, Math.round(damage));
	const attacker = next.get(attackerId) ?? emptyPlayerScore(attackerId);
	const victim = next.get(victimId) ?? emptyPlayerScore(victimId);
	next.set(attackerId, {
		...attacker,
		damageDealt: Math.min(1e6, attacker.damageDealt + admittedDamage)
	});
	next.set(victimId, {
		...victim,
		damageTaken: Math.min(1e6, victim.damageTaken + admittedDamage)
	});
	return next;
}
function isLobbySnapshot(value) {
	if (!value || typeof value !== "object") return false;
	const snapshot = value;
	if (!Number.isSafeInteger(snapshot.revision) || Number(snapshot.revision) < 0) return false;
	if (typeof snapshot.hostId !== "string" || snapshot.hostId.length < 1 || snapshot.hostId.length > 80) return false;
	if (snapshot.phase !== "waiting" && snapshot.phase !== "countdown" && snapshot.phase !== "active" && snapshot.phase !== "ended") return false;
	if (!isPrivateMatchConfig(snapshot.config)) return false;
	if (!Array.isArray(snapshot.members) || snapshot.members.length < 1 || snapshot.members.length > 6 || !snapshot.members.every(isLobbyMember)) return false;
	if (new Set(snapshot.members.map((member) => member.id)).size !== snapshot.members.length) return false;
	if (!snapshot.members.some((member) => member.id === snapshot.hostId)) return false;
	if (!Array.isArray(snapshot.scores) || snapshot.scores.length > 10 || !snapshot.scores.every(isPlayerScore)) return false;
	if (new Set(snapshot.scores.map((score) => score.id)).size !== snapshot.scores.length) return false;
	if (!Number.isFinite(snapshot.snapshotHostTimeMs) || Number(snapshot.snapshotHostTimeMs) < 0) return false;
	const validHostStart = snapshot.activeAtHostTimeMs === null || Number.isFinite(snapshot.activeAtHostTimeMs) && Number(snapshot.activeAtHostTimeMs) >= -9e5 && Number(snapshot.activeAtHostTimeMs) <= Number(snapshot.snapshotHostTimeMs) + 1e4;
	const validEpochStart = snapshot.activeAtEpochMs === null || Number.isFinite(snapshot.activeAtEpochMs) && Number(snapshot.activeAtEpochMs) >= 0 && Number(snapshot.activeAtEpochMs) <= 0x9184e72a000;
	const activeGunRange = snapshot.config.arenaId === "gun-range" && snapshot.phase === "active";
	const validMatchClock = activeGunRange ? isGunRangeMatchClockSnapshot(snapshot.matchClock, snapshot.config.durationMs) && snapshot.matchClock.sampledAtHostTimeMs <= Number(snapshot.snapshotHostTimeMs) : snapshot.matchClock === null;
	const validTestBayDoor = activeGunRange ? isLobbyTestBayDoorState(snapshot.testBayDoor) && snapshot.testBayDoor.updatedAtMs <= Number(snapshot.snapshotHostTimeMs) : snapshot.testBayDoor === null;
	const validTestDummies = snapshot.testDummies === void 0 || (activeGunRange ? Array.isArray(snapshot.testDummies) && snapshot.testDummies.length <= 16 && snapshot.testDummies.every(isGunRangeDummySnapshotEntry) && new Set(snapshot.testDummies.map((entry) => entry.id)).size === snapshot.testDummies.length : snapshot.testDummies === null);
	const activeDomination = snapshot.config.mode === "domination" && snapshot.phase === "active";
	const validDomination = snapshot.domination === void 0 || (activeDomination ? isDominationLobbyState(snapshot.domination) : snapshot.domination === null);
	return validHostStart && validEpochStart && snapshot.activeAtHostTimeMs === null === (snapshot.activeAtEpochMs === null) && validMatchClock && validTestDummies && validTestBayDoor && validDomination;
}
/**
* Deterministic host-first / stable-id / alternate-fill assignment.
* HF-328: wrapped by team-prescription.ts `prescribeTeams`, the prescription
* authority that also stamps canonical squad identities; new host-side call
* sites should go through that module rather than calling this directly.
*/
function balanceLobbyTeams(members) {
	const connected = members.filter((member) => member.connected).sort((a, b) => Number(b.id === members[0]?.id) - Number(a.id === members[0]?.id) || a.id.localeCompare(b.id));
	const assigned = /* @__PURE__ */ new Map();
	let aqua = 0;
	let coral = 0;
	for (const member of connected) {
		const team = aqua <= coral ? 0 : 1;
		assigned.set(member.id, team);
		if (team === 0) aqua += 1;
		else coral += 1;
	}
	return members.map((member) => ({
		...member,
		team: assigned.get(member.id) ?? member.team
	}));
}
function canHostStart(snapshot, hasPendingGuests = false) {
	const connected = snapshot.members.filter((member) => member.connected);
	return !hasPendingGuests && snapshot.phase === "waiting" && connected.length >= 1 && connected.length <= snapshot.config.capacity && connected.every((member) => member.ready);
}
function canHostCommitStart(snapshot, hasPendingGuests = false) {
	const connected = snapshot.members.filter((member) => member.connected);
	return !hasPendingGuests && snapshot.phase === "waiting" && connected.length >= 1 && connected.length <= snapshot.config.capacity && connected.some((member) => member.id === snapshot.hostId) && connected.every((member) => member.id === snapshot.hostId || member.ready);
}
function playersAreHostile(mode, first, second) {
	if (first.id === second.id) return false;
	return mode === "ffa" || first.team !== second.team;
}
function teamTotals(scores, members) {
	const teams = new Map(members.map((member) => [member.id, member.team]));
	let aqua = 0;
	let coral = 0;
	for (const score of scores) if (teams.get(score.id) === 0) aqua += score.kills;
	else if (teams.get(score.id) === 1) coral += score.kills;
	return [aqua, coral];
}
function freeForAllLeaders(scores) {
	return [...scores].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id.localeCompare(b.id));
}
function latencyQuality(pingMs) {
	if (pingMs === null || !Number.isFinite(pingMs)) return "unknown";
	if (pingMs <= 70) return "good";
	if (pingMs <= 140) return "fair";
	return "poor";
}
//#endregion
//#region src/animation-additive-pose.ts
/**
* How much of the total aim pitch each joint carries. Weighted toward the chest
* and spine so the weapon (socketed on the body, not on a hand bone) actually
* follows the aim, with the head finishing the line of sight. The four weights
* sum to 1 by contract, which is what lets the distribution be verified against
* the requested pitch instead of eyeballed.
*/
var AIM_PITCH_DISTRIBUTION = Object.freeze({
	spine: .3,
	chest: .32,
	neck: .18,
	head: .2
});
/**
* Asymmetric on purpose: a standing human folds further forward than backward.
* ~35 degrees up, ~45 degrees down covers every firing line the arenas contain.
*/
var AIM_PITCH_LIMITS = Object.freeze({
	maximumUpRadians: .61,
	maximumDownRadians: .79
});
var MAXIMUM_LEAN_RADIANS = .28;
var DEFAULT_ADDITIVE_POSE_PROFILE = Object.freeze({
	aimResponseHz: 6,
	leanResponseHz: 4,
	leanGainRadiansPerMps: .03,
	maximumLeanRadians: .2,
	turnEnterRadians: .79,
	turnExitRadians: .1,
	turnRateRadiansPerSecond: 3.4,
	turnSpeedCeilingMps: .6,
	movingTurnRateScale: 2.6,
	breathHz: .26,
	breathAmplitudeRadians: .018
});
var TWO_PI = Math.PI * 2;
function finiteOr$6(value, fallback) {
	return Number.isFinite(value) ? value : fallback;
}
function clamp$4(value, minimum, maximum) {
	return value < minimum ? minimum : value > maximum ? maximum : value;
}
/** Shortest signed representation of an angle, in (-pi, pi]. */
function wrapAngleRadians(angle) {
	const value = finiteOr$6(angle, 0);
	const wrapped = value - TWO_PI * Math.floor((value + Math.PI) / TWO_PI);
	return wrapped <= -Math.PI ? wrapped + TWO_PI : wrapped;
}
/**
* Exponential approach expressed as a half-life in hertz rather than a per-frame
* lerp factor. A per-frame factor makes the pose depend on frame rate, which is
* how two clients watching the same replicated operator end up disagreeing.
*/
function smoothTowards(current, target, deltaSeconds, responseHz) {
	const from = finiteOr$6(current, 0);
	const to = finiteOr$6(target, 0);
	const dt = Math.max(0, finiteOr$6(deltaSeconds, 0));
	const hz = Math.max(0, finiteOr$6(responseHz, 0));
	if (dt <= 0 || hz <= 0) return from;
	return from + (to - from) * (1 - Math.exp(-TWO_PI * hz * dt));
}
function clampAimPitch(pitchRadians, limits = AIM_PITCH_LIMITS) {
	const up = Math.abs(finiteOr$6(limits.maximumUpRadians, AIM_PITCH_LIMITS.maximumUpRadians));
	const down = Math.abs(finiteOr$6(limits.maximumDownRadians, AIM_PITCH_LIMITS.maximumDownRadians));
	return clamp$4(finiteOr$6(pitchRadians, 0), -down, up);
}
/**
* Splits a clamped aim pitch across the spine chain. The returned offsets sum to
* the clamped pitch, so the chain as a whole points exactly where the shot goes.
*/
function distributeAimPitch(pitchRadians, distribution = AIM_PITCH_DISTRIBUTION, limits = AIM_PITCH_LIMITS) {
	const pitch = clampAimPitch(pitchRadians, limits);
	const roles = [
		"spine",
		"chest",
		"neck",
		"head"
	];
	const total = roles.reduce((sum, role) => sum + Math.max(0, finiteOr$6(distribution[role], 0)), 0);
	if (total <= 0) return Object.freeze({
		spine: 0,
		chest: 0,
		neck: 0,
		head: 0
	});
	const scaled = roles.map((role) => Math.max(0, finiteOr$6(distribution[role], 0)) / total * pitch);
	const residue = pitch - scaled.reduce((sum, value) => sum + value, 0);
	let heaviest = 0;
	for (let index = 1; index < roles.length; index += 1) if (scaled[index] > scaled[heaviest]) heaviest = index;
	scaled[heaviest] = scaled[heaviest] + residue;
	return Object.freeze({
		spine: scaled[0],
		chest: scaled[1],
		neck: scaled[2],
		head: scaled[3]
	});
}
function createAdditivePoseState(breathPhase = 0) {
	return {
		aimPitchRadians: 0,
		leanRollRadians: 0,
		turning: 0,
		breathPhase: (finiteOr$6(breathPhase, 0) % 1 + 1) % 1
	};
}
function advanceAdditivePose(state, input, profile = DEFAULT_ADDITIVE_POSE_PROFILE) {
	const dt = Math.max(0, finiteOr$6(input.deltaSeconds, 0));
	const groundSpeedMps = Math.max(0, finiteOr$6(input.groundSpeedMps, 0));
	const yawError = wrapAngleRadians(input.yawErrorRadians);
	state.aimPitchRadians = clampAimPitch(smoothTowards(state.aimPitchRadians, clampAimPitch(input.desiredAimPitchRadians), dt, profile.aimResponseHz));
	const leanTarget = clamp$4(finiteOr$6(input.strafeMps, 0) * finiteOr$6(profile.leanGainRadiansPerMps, 0), -Math.min(MAXIMUM_LEAN_RADIANS, Math.abs(profile.maximumLeanRadians)), Math.min(MAXIMUM_LEAN_RADIANS, Math.abs(profile.maximumLeanRadians)));
	state.leanRollRadians = smoothTowards(state.leanRollRadians, leanTarget, dt, profile.leanResponseHz);
	const stationary = groundSpeedMps <= Math.max(0, finiteOr$6(profile.turnSpeedCeilingMps, 0));
	const enter = Math.abs(finiteOr$6(profile.turnEnterRadians, DEFAULT_ADDITIVE_POSE_PROFILE.turnEnterRadians));
	const exit = Math.min(enter, Math.abs(finiteOr$6(profile.turnExitRadians, DEFAULT_ADDITIVE_POSE_PROFILE.turnExitRadians)));
	if (!stationary) state.turning = 0;
	else if (state.turning === 0) {
		if (Math.abs(yawError) >= enter) state.turning = yawError >= 0 ? 1 : -1;
	} else if (Math.abs(yawError) <= exit) state.turning = 0;
	const baseRate = Math.max(0, finiteOr$6(profile.turnRateRadiansPerSecond, 0));
	const maximumDelta = (stationary ? baseRate : baseRate * Math.max(1, finiteOr$6(profile.movingTurnRateScale, 1))) * dt;
	const bodyYawDeltaRadians = clamp$4(yawError, -maximumDelta, maximumDelta);
	const breathHz = Math.max(0, finiteOr$6(profile.breathHz, 0));
	state.breathPhase = (state.breathPhase + breathHz * dt) % 1;
	const breathOffsetRadians = Math.sin(state.breathPhase * TWO_PI) * Math.max(0, finiteOr$6(profile.breathAmplitudeRadians, 0));
	return Object.freeze({
		aimPitchRadians: state.aimPitchRadians,
		aimJointRadians: distributeAimPitch(state.aimPitchRadians),
		leanRollRadians: state.leanRollRadians,
		turning: state.turning,
		bodyYawDeltaRadians,
		residualYawErrorRadians: yawError - bodyYawDeltaRadians,
		breathPhase: state.breathPhase,
		breathOffsetRadians
	});
}
//#endregion
//#region src/browser-preparation-scheduler.ts
var VISIBLE_FRAME_FALLBACK_MS = 250;
function defaultMessageChannel() {
	return typeof globalThis.MessageChannel === "function" ? new globalThis.MessageChannel() : null;
}
/**
* Browser task lane for CPU/decode preparation that must progress in a hidden
* tab. One callback is admitted per MessageChannel turn, so chained work still
* yields to other browser task sources without inheriting hidden timer clamps.
*/
var BrowserCpuTaskLane = class {
	dependencies;
	queue = [];
	channel = null;
	messagePending = false;
	postedTurns = 0;
	completedTasks = 0;
	fallbackTasks = 0;
	cleanupCount = 0;
	constructor(dependencies = {
		createMessageChannel: defaultMessageChannel,
		scheduleTimer: (task) => {
			globalThis.setTimeout(task, 0);
		}
	}) {
		this.dependencies = dependencies;
	}
	schedule(task) {
		this.queue.push(task);
		this.postNextTurn();
	}
	telemetry() {
		return Object.freeze({
			queuedTasks: this.queue.length,
			channelActive: this.channel !== null,
			messagePending: this.messagePending,
			postedTurns: this.postedTurns,
			completedTasks: this.completedTasks,
			fallbackTasks: this.fallbackTasks,
			cleanupCount: this.cleanupCount
		});
	}
	openChannel() {
		if (this.channel) return this.channel;
		try {
			const channel = this.dependencies.createMessageChannel();
			if (!channel) return null;
			this.channel = channel;
			channel.port1.onmessage = () => this.runOneTurn();
			channel.port1.start();
			return channel;
		} catch {
			this.closeChannel();
			return null;
		}
	}
	postNextTurn() {
		if (this.messagePending || this.queue.length === 0) return;
		const channel = this.openChannel();
		if (!channel) {
			this.fallbackQueuedTasks();
			return;
		}
		try {
			channel.port2.postMessage(void 0);
			this.messagePending = true;
			this.postedTurns += 1;
		} catch {
			this.fallbackQueuedTasks();
		}
	}
	runOneTurn() {
		this.messagePending = false;
		const task = this.queue.shift();
		if (!task) {
			this.closeChannel();
			return;
		}
		try {
			task();
		} finally {
			this.completedTasks += 1;
			if (this.queue.length > 0) this.postNextTurn();
			else this.scheduleDrainCleanup();
		}
	}
	scheduleDrainCleanup() {
		const drainedChannel = this.channel;
		queueMicrotask(() => {
			if (this.channel === drainedChannel && this.queue.length === 0 && !this.messagePending) this.closeChannel();
		});
	}
	fallbackQueuedTasks() {
		const queued = this.queue.splice(0, this.queue.length);
		this.closeChannel();
		for (const task of queued) {
			this.fallbackTasks += 1;
			this.dependencies.scheduleTimer(() => {
				try {
					task();
				} finally {
					this.completedTasks += 1;
				}
			});
		}
	}
	closeChannel() {
		const channel = this.channel;
		this.channel = null;
		this.messagePending = false;
		if (!channel) return;
		try {
			channel.port1.onmessage = null;
		} catch {}
		try {
			channel.port1.close();
		} catch {}
		try {
			channel.port2.close();
		} catch {}
		this.cleanupCount += 1;
	}
};
var browserCpuTaskLane = new BrowserCpuTaskLane();
function scheduleBrowserCpuTask(task) {
	browserCpuTaskLane.schedule(task);
}
function yieldBrowserCpuTask() {
	return new Promise((resolve) => scheduleBrowserCpuTask(resolve));
}
function documentIsBackgrounded() {
	return typeof document !== "undefined" && document.visibilityState !== "visible";
}
function browserOwnsForegroundPresentation() {
	if (documentIsBackgrounded()) return false;
	return typeof document === "undefined" || typeof document.hasFocus !== "function" || document.hasFocus();
}
/**
* Weaker sibling of {@link browserOwnsForegroundPresentation}: the document is
* VISIBLE, but may not hold keyboard focus.
*
* The hidden-tab contract forbids authoring GPU work while a tab is HIDDEN.
* Focus is a different question, and conflating the two turned a bounded wait
* into an unbounded one: the cold-prewarm submission loop retried until it
* owned focus, so a visible-but-unfocused window - a user who alt-tabs while
* the map loads, a window the OS never reports focus for (RDP, occluded, some
* window managers) - never finished loading at all. It sat on the streaming
* screen forever.
*
* Prewarm may fall back to this after it has waited politely for real focus.
* A visible window is a legitimate place to present; an invisible one is not,
* and this still refuses that.
*/
function browserPresentationIsVisible() {
	return !documentIsBackgrounded();
}
/**
* Yields preparation to a real presentation frame while one is available, but
* never makes asset/decode work depend on requestAnimationFrame. Browsers may
* suspend a previously requested frame when the page becomes hidden.
*/
function yieldBrowserPreparationFrame() {
	if (typeof document === "undefined") return Promise.resolve();
	if (documentIsBackgrounded() || typeof requestAnimationFrame !== "function") return yieldBrowserCpuTask();
	return new Promise((resolve) => {
		let settled = false;
		let frameHandle = null;
		let fallbackHandle = null;
		const canObserveVisibility = typeof document.addEventListener === "function" && typeof document.removeEventListener === "function";
		const finish = () => {
			if (settled) return;
			settled = true;
			if (fallbackHandle !== null) globalThis.clearTimeout(fallbackHandle);
			if (frameHandle !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameHandle);
			if (canObserveVisibility) document.removeEventListener("visibilitychange", onVisibilityChange);
			resolve();
		};
		const onVisibilityChange = () => {
			if (documentIsBackgrounded()) scheduleBrowserCpuTask(finish);
		};
		if (canObserveVisibility) document.addEventListener("visibilitychange", onVisibilityChange);
		fallbackHandle = globalThis.setTimeout(finish, VISIBLE_FRAME_FALLBACK_MS);
		frameHandle = requestAnimationFrame(() => finish());
	});
}
var FOREGROUND_WAIT_FALLBACK_MS = 8e3;
/**
* Waits for a browser-visible task turn without ever authoring a hidden
* presentation frame. CPU/network/decode preparation uses the timer-backed
* helper above; renderer submissions use this foreground ownership barrier.
* A bounded fallback timer prevents indefinite hangs when the browser does
* not report focus (RDP, occluded windows, some Windows configurations).
*/
function waitForVisibleBrowserPreparation(signal) {
	if (typeof document === "undefined" || typeof document.addEventListener !== "function" || typeof document.removeEventListener !== "function" || browserOwnsForegroundPresentation()) return Promise.resolve();
	if (signal?.aborted) return Promise.reject(signal.reason);
	return new Promise((resolve, reject) => {
		let settled = false;
		const foregroundWindow = typeof window !== "undefined" && typeof window.addEventListener === "function" && typeof window.removeEventListener === "function" ? window : null;
		const cleanup = () => {
			globalThis.clearTimeout(fallbackHandle);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			foregroundWindow?.removeEventListener("focus", onWindowFocus);
			signal?.removeEventListener("abort", onAbort);
		};
		const finish = () => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve();
		};
		const onAbort = () => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(signal?.reason);
		};
		const finishIfForeground = () => {
			if (!browserOwnsForegroundPresentation()) return;
			finish();
		};
		const onVisibilityChange = () => finishIfForeground();
		const onWindowFocus = () => finishIfForeground();
		const fallbackHandle = globalThis.setTimeout(finish, FOREGROUND_WAIT_FALLBACK_MS);
		signal?.addEventListener("abort", onAbort, { once: true });
		document.addEventListener("visibilitychange", onVisibilityChange);
		foregroundWindow?.addEventListener("focus", onWindowFocus);
		finishIfForeground();
	});
}
/** One actual compositor boundary, retried if visibility changes before rAF. */
async function yieldVisibleBrowserPresentationFrame(signal) {
	if (typeof document === "undefined" || typeof requestAnimationFrame !== "function") return performance.now();
	const foregroundWindow = typeof window !== "undefined" && typeof window.addEventListener === "function" && typeof window.removeEventListener === "function" ? window : null;
	while (true) {
		if (signal?.aborted) throw signal.reason;
		await waitForVisibleBrowserPreparation(signal);
		const frame = await new Promise((resolve, reject) => {
			let settled = false;
			let frameHandle = 0;
			const cleanup = () => {
				document.removeEventListener("visibilitychange", onForegroundLoss);
				foregroundWindow?.removeEventListener("blur", onForegroundLoss);
				signal?.removeEventListener("abort", onAbort);
			};
			const cancelPending = () => {
				if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameHandle);
			};
			const onForegroundLoss = () => {
				if (settled || browserOwnsForegroundPresentation()) return;
				settled = true;
				cancelPending();
				cleanup();
				resolve(null);
			};
			const onAbort = () => {
				if (settled) return;
				settled = true;
				cancelPending();
				cleanup();
				reject(signal?.reason);
			};
			frameHandle = requestAnimationFrame((at) => {
				if (settled) return;
				settled = true;
				cleanup();
				resolve(browserOwnsForegroundPresentation() ? at : null);
			});
			document.addEventListener("visibilitychange", onForegroundLoss);
			foregroundWindow?.addEventListener("blur", onForegroundLoss);
			signal?.addEventListener("abort", onAbort, { once: true });
		});
		if (frame !== null) return frame;
	}
}
/**
* Keeps noncritical asset preparation on the browser idle lane while visible,
* then immediately transfers ownership to a timer task if the page is hidden.
*/
function scheduleBrowserPreparationIdleTask(task, timeoutMs = 2e3) {
	if (typeof document === "undefined" || typeof window === "undefined" || documentIsBackgrounded()) {
		scheduleBrowserCpuTask(task);
		return;
	}
	const idleWindow = window;
	if (typeof idleWindow.requestIdleCallback !== "function") {
		globalThis.setTimeout(task, 0);
		return;
	}
	let settled = false;
	let idleHandle = null;
	let fallbackHandle = null;
	const canObserveVisibility = typeof document.addEventListener === "function" && typeof document.removeEventListener === "function";
	const run = () => {
		if (settled) return;
		settled = true;
		if (idleHandle !== null && typeof idleWindow.cancelIdleCallback === "function") idleWindow.cancelIdleCallback(idleHandle);
		if (fallbackHandle !== null) globalThis.clearTimeout(fallbackHandle);
		if (canObserveVisibility) document.removeEventListener("visibilitychange", onVisibilityChange);
		task();
	};
	const onVisibilityChange = () => {
		if (documentIsBackgrounded()) scheduleBrowserCpuTask(run);
	};
	if (canObserveVisibility) document.addEventListener("visibilitychange", onVisibilityChange);
	idleHandle = idleWindow.requestIdleCallback.call(idleWindow, run, { timeout: timeoutMs });
	fallbackHandle = globalThis.setTimeout(run, timeoutMs);
}
//#endregion
//#region src/collision.ts
var boxFrameCache = /* @__PURE__ */ new WeakMap();
/** Matches the XYZ Euler-to-quaternion convention used by the Rapier adapter. */
function rotationMatrix(rotation) {
	if (!rotation) return {
		xx: 1,
		xy: 0,
		xz: 0,
		yx: 0,
		yy: 1,
		yz: 0,
		zx: 0,
		zy: 0,
		zz: 1
	};
	const [x, y, z] = rotation;
	const [sx, cx] = [Math.sin(x / 2), Math.cos(x / 2)];
	const [sy, cy] = [Math.sin(y / 2), Math.cos(y / 2)];
	const [sz, cz] = [Math.sin(z / 2), Math.cos(z / 2)];
	const qx = sx * cy * cz + cx * sy * sz;
	const qy = cx * sy * cz - sx * cy * sz;
	const qz = cx * cy * sz + sx * sy * cz;
	const qw = cx * cy * cz - sx * sy * sz;
	const xx2 = qx * qx;
	const yy2 = qy * qy;
	const zz2 = qz * qz;
	const xy = qx * qy;
	const xz = qx * qz;
	const yz = qy * qz;
	const wx = qw * qx;
	const wy = qw * qy;
	const wz = qw * qz;
	return {
		xx: 1 - 2 * (yy2 + zz2),
		xy: 2 * (xy - wz),
		xz: 2 * (xz + wy),
		yx: 2 * (xy + wz),
		yy: 1 - 2 * (xx2 + zz2),
		yz: 2 * (yz - wx),
		zx: 2 * (xz - wy),
		zy: 2 * (yz + wx),
		zz: 1 - 2 * (xx2 + yy2)
	};
}
function boxFrame(box) {
	const minY = box.minY ?? 0;
	const maxY = box.maxY ?? 8;
	const rotationX = box.rotation?.[0] ?? 0;
	const rotationY = box.rotation?.[1] ?? 0;
	const rotationZ = box.rotation?.[2] ?? 0;
	const cached = boxFrameCache.get(box);
	if (cached && cached.source[0] === box.minX && cached.source[1] === box.maxX && cached.source[2] === minY && cached.source[3] === maxY && cached.source[4] === box.minZ && cached.source[5] === box.maxZ && cached.source[6] === rotationX && cached.source[7] === rotationY && cached.source[8] === rotationZ) return cached;
	const frame = {
		source: [
			box.minX,
			box.maxX,
			minY,
			maxY,
			box.minZ,
			box.maxZ,
			rotationX,
			rotationY,
			rotationZ
		],
		centre: {
			x: (box.minX + box.maxX) / 2,
			y: (minY + maxY) / 2,
			z: (box.minZ + box.maxZ) / 2
		},
		halfExtents: {
			x: Math.max(0, (box.maxX - box.minX) / 2),
			y: Math.max(0, (maxY - minY) / 2),
			z: Math.max(0, (box.maxZ - box.minZ) / 2)
		},
		rotation: rotationMatrix(box.rotation)
	};
	boxFrameCache.set(box, frame);
	return frame;
}
function worldPointToLocal(frame, point) {
	const x = point.x - frame.centre.x;
	const y = point.y - frame.centre.y;
	const z = point.z - frame.centre.z;
	const rotation = frame.rotation;
	return {
		x: rotation.xx * x + rotation.yx * y + rotation.zx * z,
		y: rotation.xy * x + rotation.yy * y + rotation.zy * z,
		z: rotation.xz * x + rotation.yz * y + rotation.zz * z
	};
}
function worldPointToLocalInto(frame, point, result) {
	const x = point.x - frame.centre.x;
	const y = point.y - frame.centre.y;
	const z = point.z - frame.centre.z;
	const rotation = frame.rotation;
	result.x = rotation.xx * x + rotation.yx * y + rotation.zx * z;
	result.y = rotation.xy * x + rotation.yy * y + rotation.zy * z;
	result.z = rotation.xz * x + rotation.yz * y + rotation.zz * z;
}
function worldVectorToLocalInto(frame, vector, result) {
	const rotation = frame.rotation;
	const x = vector.x;
	const y = vector.y;
	const z = vector.z;
	result.x = rotation.xx * x + rotation.yx * y + rotation.zx * z;
	result.y = rotation.xy * x + rotation.yy * y + rotation.zy * z;
	result.z = rotation.xz * x + rotation.yz * y + rotation.zz * z;
}
function cleanNormalComponent(value, magnitude) {
	const normalized = value / magnitude;
	if (Math.abs(normalized) < 1e-12) return 0;
	if (Math.abs(normalized - 1) < 1e-12) return 1;
	if (Math.abs(normalized + 1) < 1e-12) return -1;
	return normalized;
}
function localAxisNormalToWorld(frame, axis, sign) {
	const rotation = frame.rotation;
	const x = sign * (axis === 0 ? rotation.xx : axis === 1 ? rotation.xy : rotation.xz);
	const y = sign * (axis === 0 ? rotation.yx : axis === 1 ? rotation.yy : rotation.yz);
	const z = sign * (axis === 0 ? rotation.zx : axis === 1 ? rotation.zy : rotation.zz);
	const magnitude = Math.hypot(x, y, z) || 1;
	return {
		x: cleanNormalComponent(x, magnitude),
		y: cleanNormalComponent(y, magnitude),
		z: cleanNormalComponent(z, magnitude)
	};
}
function segmentSlabHit(start, delta, halfExtents, padding, result) {
	let near = 0;
	let far = 1;
	let nearAxis = -1;
	let nearSign = 0;
	for (let axis = 0; axis < 3; axis += 1) {
		const origin = axis === 0 ? start.x : axis === 1 ? start.y : start.z;
		const direction = axis === 0 ? delta.x : axis === 1 ? delta.y : delta.z;
		const axisPadding = typeof padding === "number" ? padding : axis === 0 ? padding.x : axis === 1 ? padding.y : padding.z;
		const halfSize = (axis === 0 ? halfExtents.x : axis === 1 ? halfExtents.y : halfExtents.z) + axisPadding;
		if (Math.abs(direction) < 1e-8) {
			if (origin < -halfSize || origin > halfSize) return false;
			continue;
		}
		let first = (-halfSize - origin) / direction;
		let second = (halfSize - origin) / direction;
		let sign = -Math.sign(direction);
		if (first > second) {
			const swap = first;
			first = second;
			second = swap;
			sign *= -1;
		}
		if (first > near) {
			near = first;
			nearAxis = axis;
			nearSign = sign;
		}
		far = Math.min(far, second);
		if (near > far) return false;
	}
	result.near = near;
	result.far = far;
	result.nearAxis = nearAxis;
	result.nearSign = nearSign;
	return true;
}
var collisionLocalStartScratch = {
	x: 0,
	y: 0,
	z: 0
};
var collisionLocalDeltaScratch = {
	x: 0,
	y: 0,
	z: 0
};
var collisionSlabHitScratch = {
	near: 0,
	far: 0,
	nearAxis: -1,
	nearSign: 0
};
var collisionOrientedPaddingScratch = {
	x: 0,
	y: 0,
	z: 0
};
function validOrientedEnvelope(envelope) {
	return [
		envelope.halfExtents.x,
		envelope.halfExtents.y,
		envelope.halfExtents.z,
		envelope.centreOffset.x,
		envelope.centreOffset.y,
		envelope.centreOffset.z,
		envelope.yaw
	].every(Number.isFinite) && envelope.halfExtents.x > 0 && envelope.halfExtents.y > 0 && envelope.halfExtents.z > 0;
}
function orientedEnvelopeCentre(root, envelope) {
	const cosine = Math.cos(envelope.yaw);
	const sine = Math.sin(envelope.yaw);
	return {
		x: root.x + cosine * envelope.centreOffset.x + sine * envelope.centreOffset.z,
		y: root.y + envelope.centreOffset.y,
		z: root.z - sine * envelope.centreOffset.x + cosine * envelope.centreOffset.z
	};
}
function orientedEnvelopePaddingInBoxFrame(frame, envelope) {
	const cosine = Math.cos(envelope.yaw);
	const sine = Math.sin(envelope.yaw);
	const aircraftX = {
		x: cosine,
		y: 0,
		z: -sine
	};
	const aircraftY = {
		x: 0,
		y: 1,
		z: 0
	};
	const aircraftZ = {
		x: sine,
		y: 0,
		z: cosine
	};
	const projection = (axis) => Math.abs(axis.x * aircraftX.x + axis.y * aircraftX.y + axis.z * aircraftX.z) * envelope.halfExtents.x + Math.abs(axis.x * aircraftY.x + axis.y * aircraftY.y + axis.z * aircraftY.z) * envelope.halfExtents.y + Math.abs(axis.x * aircraftZ.x + axis.y * aircraftZ.y + axis.z * aircraftZ.z) * envelope.halfExtents.z;
	collisionOrientedPaddingScratch.x = projection({
		x: frame.rotation.xx,
		y: frame.rotation.yx,
		z: frame.rotation.zx
	});
	collisionOrientedPaddingScratch.y = projection({
		x: frame.rotation.xy,
		y: frame.rotation.yy,
		z: frame.rotation.zy
	});
	collisionOrientedPaddingScratch.z = projection({
		x: frame.rotation.xz,
		y: frame.rotation.yz,
		z: frame.rotation.zz
	});
	return collisionOrientedPaddingScratch;
}
/** Exact fixed-yaw aircraft OBB against an arbitrarily rotated arena box. */
function orientedBoxIntersectsBox(root, envelope, box) {
	if (!validOrientedEnvelope(envelope) || ![
		root.x,
		root.y,
		root.z
	].every(Number.isFinite)) return false;
	const frame = boxFrame(box);
	const centre = orientedEnvelopeCentre(root, envelope);
	const cosine = Math.cos(envelope.yaw);
	const sine = Math.sin(envelope.yaw);
	const aircraftAxes = [
		{
			x: cosine,
			y: 0,
			z: -sine
		},
		{
			x: 0,
			y: 1,
			z: 0
		},
		{
			x: sine,
			y: 0,
			z: cosine
		}
	];
	const colliderAxes = [
		{
			x: frame.rotation.xx,
			y: frame.rotation.yx,
			z: frame.rotation.zx
		},
		{
			x: frame.rotation.xy,
			y: frame.rotation.yy,
			z: frame.rotation.zy
		},
		{
			x: frame.rotation.xz,
			y: frame.rotation.yz,
			z: frame.rotation.zz
		}
	];
	const aircraftExtents = [
		envelope.halfExtents.x,
		envelope.halfExtents.y,
		envelope.halfExtents.z
	];
	const colliderExtents = [
		frame.halfExtents.x,
		frame.halfExtents.y,
		frame.halfExtents.z
	];
	const rotation = aircraftAxes.map((aircraftAxis) => colliderAxes.map((colliderAxis) => aircraftAxis.x * colliderAxis.x + aircraftAxis.y * colliderAxis.y + aircraftAxis.z * colliderAxis.z));
	const absoluteRotation = rotation.map((row) => row.map((value) => Math.abs(value) + 1e-10));
	const centreDelta = {
		x: frame.centre.x - centre.x,
		y: frame.centre.y - centre.y,
		z: frame.centre.z - centre.z
	};
	const translation = aircraftAxes.map((axis) => centreDelta.x * axis.x + centreDelta.y * axis.y + centreDelta.z * axis.z);
	for (let axis = 0; axis < 3; axis += 1) {
		const aircraftRadius = aircraftExtents[axis];
		const colliderRadius = colliderExtents[0] * absoluteRotation[axis][0] + colliderExtents[1] * absoluteRotation[axis][1] + colliderExtents[2] * absoluteRotation[axis][2];
		if (Math.abs(translation[axis]) > aircraftRadius + colliderRadius) return false;
	}
	for (let axis = 0; axis < 3; axis += 1) {
		const aircraftRadius = aircraftExtents[0] * absoluteRotation[0][axis] + aircraftExtents[1] * absoluteRotation[1][axis] + aircraftExtents[2] * absoluteRotation[2][axis];
		const colliderRadius = colliderExtents[axis];
		if (Math.abs(translation[0] * rotation[0][axis] + translation[1] * rotation[1][axis] + translation[2] * rotation[2][axis]) > aircraftRadius + colliderRadius) return false;
	}
	for (let aircraftAxis = 0; aircraftAxis < 3; aircraftAxis += 1) {
		const nextAircraftAxis = (aircraftAxis + 1) % 3;
		const lastAircraftAxis = (aircraftAxis + 2) % 3;
		for (let colliderAxis = 0; colliderAxis < 3; colliderAxis += 1) {
			const nextColliderAxis = (colliderAxis + 1) % 3;
			const lastColliderAxis = (colliderAxis + 2) % 3;
			const aircraftRadius = aircraftExtents[nextAircraftAxis] * absoluteRotation[lastAircraftAxis][colliderAxis] + aircraftExtents[lastAircraftAxis] * absoluteRotation[nextAircraftAxis][colliderAxis];
			const colliderRadius = colliderExtents[nextColliderAxis] * absoluteRotation[aircraftAxis][lastColliderAxis] + colliderExtents[lastColliderAxis] * absoluteRotation[aircraftAxis][nextColliderAxis];
			if (Math.abs(translation[lastAircraftAxis] * rotation[nextAircraftAxis][colliderAxis] - translation[nextAircraftAxis] * rotation[lastAircraftAxis][colliderAxis]) > aircraftRadius + colliderRadius) return false;
		}
	}
	return true;
}
function startOverlapNormal(centre, frame, delta) {
	const movementMagnitude = Math.hypot(delta.x, delta.y, delta.z);
	if (movementMagnitude > 1e-8) return {
		x: cleanNormalComponent(-delta.x, movementMagnitude),
		y: cleanNormalComponent(-delta.y, movementMagnitude),
		z: cleanNormalComponent(-delta.z, movementMagnitude)
	};
	const x = centre.x - frame.centre.x;
	const y = centre.y - frame.centre.y;
	const z = centre.z - frame.centre.z;
	const separationMagnitude = Math.hypot(x, y, z);
	if (separationMagnitude > 1e-8) return {
		x: cleanNormalComponent(x, separationMagnitude),
		y: cleanNormalComponent(y, separationMagnitude),
		z: cleanNormalComponent(z, separationMagnitude)
	};
	return {
		x: 0,
		y: 1,
		z: 0
	};
}
/**
* Conservative continuous OBB sweep. Projecting the truthful aircraft OBB
* onto each collider axis expands that collider's local slabs without turning
* a 1.65m-tall airframe into an isotropic 17m sphere.
*/
function sweepOrientedBoxAgainstBoxes(rootStart, rootDelta, boxes, envelope) {
	if (!validOrientedEnvelope(envelope) || ![
		rootStart.x,
		rootStart.y,
		rootStart.z,
		rootDelta.x,
		rootDelta.y,
		rootDelta.z
	].every(Number.isFinite)) return null;
	const centreStart = orientedEnvelopeCentre(rootStart, envelope);
	let bestTime = Number.POSITIVE_INFINITY;
	let bestFrame = null;
	let bestBox = null;
	let bestAxis = -1;
	let bestSign = 0;
	for (const box of boxes) {
		const frame = boxFrame(box);
		if (orientedBoxIntersectsBox(rootStart, envelope, box)) return {
			time: 0,
			normal: startOverlapNormal(centreStart, frame, rootDelta),
			box
		};
		worldPointToLocalInto(frame, centreStart, collisionLocalStartScratch);
		worldVectorToLocalInto(frame, rootDelta, collisionLocalDeltaScratch);
		if (!segmentSlabHit(collisionLocalStartScratch, collisionLocalDeltaScratch, frame.halfExtents, orientedEnvelopePaddingInBoxFrame(frame, envelope), collisionSlabHitScratch)) continue;
		if (collisionSlabHitScratch.nearAxis < 0 || collisionSlabHitScratch.near < 0 || collisionSlabHitScratch.near > 1 || collisionSlabHitScratch.near >= bestTime) continue;
		bestTime = collisionSlabHitScratch.near;
		bestFrame = frame;
		bestBox = box;
		bestAxis = collisionSlabHitScratch.nearAxis;
		bestSign = collisionSlabHitScratch.nearSign;
	}
	if (!bestFrame || !bestBox) return null;
	return {
		time: bestTime,
		normal: localAxisNormalToWorld(bestFrame, bestAxis, bestSign),
		box: bestBox
	};
}
function cross2d(origin, a, b) {
	return (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
}
function worldVertices(frame) {
	if (frame.worldVertices) return frame.worldVertices;
	const vertices = [];
	const { halfExtents: half, rotation, centre } = frame;
	for (const xSign of [-1, 1]) for (const ySign of [-1, 1]) for (const zSign of [-1, 1]) {
		const x = half.x * xSign;
		const y = half.y * ySign;
		const z = half.z * zSign;
		vertices.push({
			x: centre.x + rotation.xx * x + rotation.xy * y + rotation.xz * z,
			y: centre.y + rotation.yx * x + rotation.yy * y + rotation.yz * z,
			z: centre.z + rotation.zx * x + rotation.zy * y + rotation.zz * z
		});
	}
	frame.worldVertices = vertices;
	return vertices;
}
function convexHull(points) {
	const sorted = [...points];
	sorted.sort((left, right) => left.x - right.x || left.z - right.z);
	const unique = sorted.filter((point, index) => index === 0 || Math.abs(point.x - sorted[index - 1].x) > 1e-10 || Math.abs(point.z - sorted[index - 1].z) > 1e-10);
	if (unique.length <= 2) return unique;
	const lower = [];
	for (const point of unique) {
		while (lower.length >= 2 && cross2d(lower[lower.length - 2], lower[lower.length - 1], point) <= 1e-12) lower.pop();
		lower.push(point);
	}
	const upper = [];
	for (let index = unique.length - 1; index >= 0; index -= 1) {
		const point = unique[index];
		while (upper.length >= 2 && cross2d(upper[upper.length - 2], upper[upper.length - 1], point) <= 1e-12) upper.pop();
		upper.push(point);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function projectedHull(frame) {
	if (frame.projectedHull) return frame.projectedHull;
	frame.projectedHull = convexHull(worldVertices(frame).map((vertex) => ({
		x: vertex.x,
		z: vertex.z
	})));
	return frame.projectedHull;
}
var BOX_EDGES = [
	[0, 4],
	[1, 5],
	[2, 6],
	[3, 7],
	[0, 2],
	[1, 3],
	[4, 6],
	[5, 7],
	[0, 1],
	[2, 3],
	[4, 5],
	[6, 7]
];
/** Horizontal footprint of the OBB portion intersecting a player's vertical body span. */
function projectedHullWithinVerticalSpan(frame, minimumY, maximumY) {
	const vertices = worldVertices(frame);
	const points = vertices.filter((vertex) => vertex.y >= minimumY - 1e-10 && vertex.y <= maximumY + 1e-10).map((vertex) => ({
		x: vertex.x,
		z: vertex.z
	}));
	for (const [startIndex, endIndex] of BOX_EDGES) {
		const start = vertices[startIndex];
		const end = vertices[endIndex];
		const deltaY = end.y - start.y;
		if (Math.abs(deltaY) < 1e-12) continue;
		for (const planeY of [minimumY, maximumY]) {
			if (!Number.isFinite(planeY)) continue;
			const time = (planeY - start.y) / deltaY;
			if (time < -1e-10 || time > 1.0000000001) continue;
			points.push({
				x: start.x + (end.x - start.x) * time,
				z: start.z + (end.z - start.z) * time
			});
		}
	}
	return convexHull(points);
}
function squaredDistanceToSegment(point, start, end) {
	const edgeX = end.x - start.x;
	const edgeZ = end.z - start.z;
	const lengthSquared = edgeX * edgeX + edgeZ * edgeZ;
	const projection = lengthSquared > 1e-16 ? Math.max(0, Math.min(1, ((point.x - start.x) * edgeX + (point.z - start.z) * edgeZ) / lengthSquared)) : 0;
	const dx = point.x - (start.x + edgeX * projection);
	const dz = point.z - (start.z + edgeZ * projection);
	return dx * dx + dz * dz;
}
function circleIntersectsProjectedHull(x, z, radius, hull) {
	const radiusSquared = radius * radius;
	if (radiusSquared === 0 || hull.length === 0) return false;
	const point = {
		x,
		z
	};
	if (hull.length >= 3) {
		let positive = false;
		let negative = false;
		for (let index = 0; index < hull.length; index += 1) {
			const cross = cross2d(hull[index], hull[(index + 1) % hull.length], point);
			if (cross > 1e-12) positive = true;
			else if (cross < -1e-12) negative = true;
			if (positive && negative) break;
		}
		if (!(positive && negative)) return true;
	}
	let distanceSquared = Number.POSITIVE_INFINITY;
	const edgeCount = hull.length === 1 ? 1 : hull.length;
	for (let index = 0; index < edgeCount; index += 1) distanceSquared = Math.min(distanceSquared, squaredDistanceToSegment(point, hull[index], hull[(index + 1) % hull.length]));
	return distanceSquared < radiusSquared;
}
/** Earliest swept-sphere hit against authored boxes, including oriented boxes. */
function sweepSphereAgainstBoxes(start, delta, boxes, radius = .17) {
	let bestTime = Number.POSITIVE_INFINITY;
	let bestFrame = null;
	let bestBox = null;
	let bestAxis = -1;
	let bestSign = 0;
	for (const box of boxes) {
		const frame = boxFrame(box);
		worldPointToLocalInto(frame, start, collisionLocalStartScratch);
		worldVectorToLocalInto(frame, delta, collisionLocalDeltaScratch);
		if (!segmentSlabHit(collisionLocalStartScratch, collisionLocalDeltaScratch, frame.halfExtents, radius, collisionSlabHitScratch)) continue;
		if (collisionSlabHitScratch.nearAxis < 0 || collisionSlabHitScratch.near < 0 || collisionSlabHitScratch.near > 1 || collisionSlabHitScratch.near >= bestTime) continue;
		bestTime = collisionSlabHitScratch.near;
		bestFrame = frame;
		bestBox = box;
		bestAxis = collisionSlabHitScratch.nearAxis;
		bestSign = collisionSlabHitScratch.nearSign;
	}
	if (!bestFrame || !bestBox) return null;
	return {
		time: bestTime,
		normal: localAxisNormalToWorld(bestFrame, bestAxis, bestSign),
		box: bestBox
	};
}
/** Exact sphere overlap against an authored axis-aligned or oriented box. */
function sphereIntersectsBox(point, radius, box) {
	if (!Number.isFinite(radius) || radius < 0) return false;
	const frame = boxFrame(box);
	const local = worldPointToLocal(frame, point);
	const dx = Math.max(0, Math.abs(local.x) - frame.halfExtents.x);
	const dy = Math.max(0, Math.abs(local.y) - frame.halfExtents.y);
	const dz = Math.max(0, Math.abs(local.z) - frame.halfExtents.z);
	return dx * dx + dy * dy + dz * dz < radius * radius;
}
function circleIntersectsBox(x, z, radius, box) {
	if (box.rotation) return circleIntersectsProjectedHull(x, z, radius, projectedHull(boxFrame(box)));
	const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
	const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
	const dx = x - nearestX;
	const dz = z - nearestZ;
	return dx * dx + dz * dz < radius * radius;
}
/** Exact three-dimensional segment/box entry time. Null means the segment is not blocked. */
function segmentBoxHitTime(start, end, box, padding = .02) {
	const frame = boxFrame(box);
	worldPointToLocalInto(frame, start, collisionLocalStartScratch);
	collisionLocalDeltaScratch.x = end.x - start.x;
	collisionLocalDeltaScratch.y = end.y - start.y;
	collisionLocalDeltaScratch.z = end.z - start.z;
	worldVectorToLocalInto(frame, collisionLocalDeltaScratch, collisionLocalDeltaScratch);
	return segmentSlabHit(collisionLocalStartScratch, collisionLocalDeltaScratch, frame.halfExtents, padding, collisionSlabHitScratch) && collisionSlabHitScratch.far > .01 && collisionSlabHitScratch.near < .99 ? Math.max(0, collisionSlabHitScratch.near) : null;
}
/** Exact line-of-sight check against a solid 3D box. */
function segmentIntersectsBox(start, end, box, padding = .02) {
	return segmentBoxHitTime(start, end, box, padding) !== null;
}
function firstSegmentBoxHit(start, end, boxes, padding = .02) {
	let first = null;
	for (const box of boxes) {
		const time = segmentBoxHitTime(start, end, box, padding);
		if (time !== null && (!first || time < first.time)) first = {
			box,
			time
		};
	}
	return first;
}
function isBlocked(point, colliders, radius = .42) {
	return colliders.some((box) => {
		if (box.rotation) {
			const frame = boxFrame(box);
			const rotation = frame.rotation;
			const worldHalfY = Math.abs(rotation.yx) * frame.halfExtents.x + Math.abs(rotation.yy) * frame.halfExtents.y + Math.abs(rotation.yz) * frame.halfExtents.z;
			const minimumY = box.maxY === void 0 ? Number.NEGATIVE_INFINITY : point.y - 1.65;
			const maximumY = box.minY === void 0 ? Number.POSITIVE_INFINITY : point.y;
			if (maximumY < frame.centre.y - worldHalfY || minimumY > frame.centre.y + worldHalfY) return false;
			const hull = Math.abs(rotation.xy) < 1e-12 && Math.abs(rotation.zy) < 1e-12 && Math.abs(rotation.yx) < 1e-12 && Math.abs(rotation.yz) < 1e-12 ? projectedHull(frame) : projectedHullWithinVerticalSpan(frame, minimumY, maximumY);
			return circleIntersectsProjectedHull(point.x, point.z, radius, hull);
		} else {
			if (box.minY !== void 0 && point.y < box.minY) return false;
			if (box.maxY !== void 0 && point.y - 1.65 > box.maxY) return false;
		}
		return circleIntersectsBox(point.x, point.z, radius, box);
	});
}
/**
* Returns the original collider objects whose world-space vertical extent
* overlaps a capsule span. Identity is preserved for telemetry and authority
* comparisons; this is only a per-movement navigation view.
*/
function collidersOverlappingVerticalSpan(colliders, minimumY, maximumY) {
	if (!Number.isFinite(minimumY) || !Number.isFinite(maximumY) || maximumY < minimumY) return [];
	return colliders.filter((box) => {
		if (box.minY === void 0 && box.maxY === void 0) return true;
		if (box.rotation) {
			const frame = boxFrame(box);
			const rotation = frame.rotation;
			const worldHalfY = Math.abs(rotation.yx) * frame.halfExtents.x + Math.abs(rotation.yy) * frame.halfExtents.y + Math.abs(rotation.yz) * frame.halfExtents.z;
			const boxMinimumY = box.minY === void 0 ? Number.NEGATIVE_INFINITY : frame.centre.y - worldHalfY;
			const boxMaximumY = box.maxY === void 0 ? Number.POSITIVE_INFINITY : frame.centre.y + worldHalfY;
			return maximumY >= boxMinimumY && minimumY <= boxMaximumY;
		}
		return maximumY >= (box.minY ?? Number.NEGATIVE_INFINITY) && minimumY <= (box.maxY ?? Number.POSITIVE_INFINITY);
	});
}
function resolveHorizontalMove(current, desired, colliders, bounds, radius = .42) {
	const next = { ...current };
	const clampedX = Math.max(bounds.minX + radius, Math.min(desired.x, bounds.maxX - radius));
	if (!isBlocked({
		x: clampedX,
		y: desired.y,
		z: current.z
	}, colliders, radius)) next.x = clampedX;
	const clampedZ = Math.max(bounds.minZ + radius, Math.min(desired.z, bounds.maxZ - radius));
	if (!isBlocked({
		x: next.x,
		y: desired.y,
		z: clampedZ
	}, colliders, radius)) next.z = clampedZ;
	next.y = desired.y;
	return next;
}
function pointInsideBounds(point, bounds, margin = 0) {
	return point.x >= bounds.minX + margin && point.x <= bounds.maxX - margin && point.z >= bounds.minZ + margin && point.z <= bounds.maxZ - margin;
}
function clampPointToBounds(point, bounds, margin = 0) {
	return {
		x: Math.max(bounds.minX + margin, Math.min(point.x, bounds.maxX - margin)),
		y: point.y,
		z: Math.max(bounds.minZ + margin, Math.min(point.z, bounds.maxZ - margin))
	};
}
function damp(current, target, smoothing, dt) {
	return current + (target - current) * (1 - Math.exp(-smoothing * dt));
}
//#endregion
//#region src/prone-clearance.ts
/**
* Prone body presentation envelope, measured from the pelvis pivot.
*
* These are approximations derived from the rigged operator skeleton. The
* pivot sits ~0.43 m above the ground when prone, and the torso+head reach
* forward while the legs reach backward. Total visual length is ~1.7 m.
*/
var PRONE_PRESENTATION_ENVELOPE = Object.freeze({
	/** Distance the head/torso extend forward of the pelvis pivot (m). */
	forwardM: .82,
	/** Distance the legs extend backward of the pelvis pivot (m). */
	backwardM: .88,
	/** Half-thickness of the prone body used for side-clearance probes (m). */
	halfThicknessM: .16,
	/** Pelvis pivot height above the ground when prone (m). */
	pivotHeightM: .43
});
function finiteOr$5(value, fallback) {
	return Number.isFinite(value) ? value : fallback;
}
function yawDirection(yaw) {
	return {
		x: Math.sin(yaw),
		y: 0,
		z: Math.cos(yaw)
	};
}
function yawRight(yaw) {
	return {
		x: Math.cos(yaw),
		y: 0,
		z: -Math.sin(yaw)
	};
}
/**
* Measures presentation clearance for a prone operator lying at `position`
* with body axis `yaw`.
*
* @param position World-space pelvis/authority position (usually the player
*   capsule centre). Only x and z are used; y is taken from the prone pivot
*   height because the body lies horizontally at that height.
* @param yaw Body yaw in radians. 0 means facing +Z, π/2 means facing +X.
* @param colliders Axis-aligned or rotated solid box colliders to test against.
* @returns Forward and backward clearance along the body axis, in metres, plus
*   a clipped flag for quick consumers.
*
* The function is pure: no side effects, no mutations of inputs, no gameplay
* authority change. It reuses the same segment/box primitive
* (`segmentIntersectsBox`) that killstreak line-of-sight uses.
*/
function proneBodyClearance(position, yaw, colliders) {
	const safePosition = {
		x: finiteOr$5(position.x, 0),
		y: finiteOr$5(position.y, PRONE_PRESENTATION_ENVELOPE.pivotHeightM),
		z: finiteOr$5(position.z, 0)
	};
	const safeYaw = Number.isFinite(yaw) ? yaw : 0;
	const pivot = {
		x: safePosition.x,
		y: PRONE_PRESENTATION_ENVELOPE.pivotHeightM,
		z: safePosition.z
	};
	const forwardDir = yawDirection(safeYaw);
	const rightDir = yawRight(safeYaw);
	const halfThick = PRONE_PRESENTATION_ENVELOPE.halfThicknessM;
	const probes = [
		{
			lateralX: 0,
			lateralZ: 0
		},
		{
			lateralX: rightDir.x * halfThick,
			lateralZ: rightDir.z * halfThick
		},
		{
			lateralX: -rightDir.x * halfThick,
			lateralZ: -rightDir.z * halfThick
		}
	];
	const maxForward = PRONE_PRESENTATION_ENVELOPE.forwardM;
	const maxBackward = PRONE_PRESENTATION_ENVELOPE.backwardM;
	let bestForward = maxForward;
	let bestBackward = maxBackward;
	for (const probe of probes) {
		const start = {
			x: pivot.x + probe.lateralX,
			y: pivot.y,
			z: pivot.z + probe.lateralZ
		};
		const forwardHit = firstBoxHitTime(start, {
			x: start.x + forwardDir.x * maxForward,
			y: start.y,
			z: start.z + forwardDir.z * maxForward
		}, colliders);
		const forwardClear = forwardHit === null ? maxForward : forwardHit * maxForward;
		const backwardHit = firstBoxHitTime(start, {
			x: start.x - forwardDir.x * maxBackward,
			y: start.y,
			z: start.z - forwardDir.z * maxBackward
		}, colliders);
		const backwardClear = backwardHit === null ? maxBackward : backwardHit * maxBackward;
		if (forwardClear < bestForward) bestForward = forwardClear;
		if (backwardClear < bestBackward) bestBackward = backwardClear;
	}
	bestForward = Math.max(0, bestForward);
	bestBackward = Math.max(0, bestBackward);
	return Object.freeze({
		forwardM: bestForward,
		backwardM: bestBackward,
		clipped: bestForward < maxForward || bestBackward < maxBackward
	});
}
function firstBoxHitTime(start, end, colliders) {
	let first = null;
	for (const box of colliders) {
		if (!segmentIntersectsBox(start, end, box, 0)) continue;
		const time = segmentBoxHitTime(start, end, box, 0);
		if (time !== null && (first === null || time < first)) first = time;
	}
	return first;
}
/**
* Chooses how to seat a prone body in the room it actually has.
*
* Two levers, applied in order of least visual damage:
*
* 1. SLIDE. If the head end is short of room but the leg end has spare, move
*    the whole body backward. The pose is unchanged - it just sits further
*    back - so this is invisible to the player and always preferred.
* 2. PROP. If sliding cannot recover the deficit (a corridor shorter than the
*    body, say) the body cannot lie flat at all, so reduce the pitch. A partly
*    raised torso is shorter along the ground, and reads as someone bracing
*    against a wall rather than as a body buried inside it.
*
* The authority capsule is NOT affected by either lever: this is presentation
* only, exactly as the original module intended.
*/
function proneStanceAdjustment(clearance) {
	const { forwardM: maxForward, backwardM: maxBackward } = PRONE_PRESENTATION_ENVELOPE;
	const forward = Math.max(0, finiteOr$5(clearance.forwardM, maxForward));
	const backward = Math.max(0, finiteOr$5(clearance.backwardM, maxBackward));
	const forwardDeficit = Math.max(0, maxForward - forward);
	const backwardDeficit = Math.max(0, maxBackward - backward);
	const forwardSurplus = Math.max(0, forward - maxForward);
	const backwardSurplus = Math.max(0, backward - maxBackward);
	let slideM = 0;
	if (forwardDeficit > 0) slideM = Math.min(forwardDeficit, backwardSurplus);
	else if (backwardDeficit > 0) slideM = -Math.min(backwardDeficit, forwardSurplus);
	const residual = Math.max(Math.max(0, forwardDeficit - Math.max(0, slideM)), Math.max(0, backwardDeficit - Math.max(0, -slideM)));
	const reference = Math.max(maxForward, maxBackward);
	const pitchScale = reference > 0 ? Math.min(1, Math.max(.25, 1 - residual / reference)) : 1;
	return Object.freeze({
		slideM: Number.isFinite(slideM) ? slideM : 0,
		pitchScale
	});
}
//#endregion
//#region src/gpu-resource-ownership.ts
var GPU_GEOMETRY_OWNER_KEY = "atomicAcresGpuGeometryOwner";
var GPU_SHARED_GEOMETRY_KEY = "atomicAcresGpuSharedGeometry";
/**
* SkeletonUtils clones scene graphs but deliberately shares mesh geometries.
* Runtime entities that can retire independently must own their geometry so a
* fenced disposal cannot invalidate another live operator or the source GLB.
*/
function cloneMeshGeometriesForOwner(root, owner) {
	const ownedClones = /* @__PURE__ */ new Map();
	root.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		const source = node.geometry;
		const existing = ownedClones.get(source);
		const geometry = existing ?? source.clone();
		if (!existing) {
			geometry.userData = {
				...geometry.userData,
				[GPU_GEOMETRY_OWNER_KEY]: owner
			};
			ownedClones.set(source, geometry);
		}
		node.geometry = geometry;
	});
	root.userData.gpuGeometryOwner = owner;
	root.userData.gpuOwnedGeometryCount = ownedClones.size;
	return ownedClones.size;
}
/**
* Marks immutable source geometry that may be reused by independently retired
* scene graphs. Retirement disposes each instance's materials but must retain
* these buffers until their long-lived source asset is released.
*/
function markMeshGeometriesShared(root, owner) {
	const shared = /* @__PURE__ */ new Set();
	root.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		node.geometry.userData = {
			...node.geometry.userData,
			[GPU_SHARED_GEOMETRY_KEY]: owner
		};
		shared.add(node.geometry);
	});
	root.userData.gpuSharedGeometryOwner = owner;
	root.userData.gpuSharedGeometryCount = shared.size;
	return shared.size;
}
function isSharedMeshGeometry(geometry) {
	return typeof geometry.userData[GPU_SHARED_GEOMETRY_KEY] === "string";
}
//#endregion
//#region src/character-presentation-contract.ts
var clamp01$1 = (value) => MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
/**
* One deterministic priority contract for viewmodel states. Presentation may
* blend between poses, but telemetry and tests always agree which action owns
* the hands/weapon: melee > reload > sprint > settled ADS > hip.
*/
function characterActionContract(input) {
	const aimBlend = clamp01$1(input.aimBlend);
	const sprintBlend = clamp01$1(input.sprintBlend);
	const reloadProgress = input.reloadProgress === null ? null : clamp01$1(input.reloadProgress);
	const meleeProgress = input.meleeProgress === null ? null : clamp01$1(input.meleeProgress);
	const state = meleeProgress !== null && meleeProgress < 1 ? "melee" : reloadProgress !== null && reloadProgress < 1 ? "reload" : sprintBlend >= .5 ? "sprint" : aimBlend >= .92 ? "ads" : "hip";
	return {
		state,
		weapon: input.weapon,
		aimBlend,
		reloadProgress,
		meleeProgress,
		supportContactExpected: state !== "melee",
		weaponVisible: state !== "melee"
	};
}
/** Resolve a socket only after propagating its complete, current parent chain. */
function resolveSocketWorld(socket, target = new Vector3()) {
	socket.updateWorldMatrix(true, false);
	return socket.getWorldPosition(target);
}
function effectivelyVisibleWithin(child, root) {
	let current = child;
	while (current) {
		if (!current.visible) return false;
		if (current === root) return true;
		current = current.parent;
	}
	return false;
}
/**
* Geometry bounds expressed in the object's own space. This avoids the
* misleading world Box3 produced by animated/skinned wrist ancestry.
*/
function objectLocalGeometryBounds(root) {
	root.updateWorldMatrix(true, true);
	const inverseRoot = root.matrixWorld.clone().invert();
	const bounds = new Box3().makeEmpty();
	root.traverse((child) => {
		if (!(child instanceof Mesh) || !child.geometry || !effectivelyVisibleWithin(child, root)) return;
		if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
		if (!child.geometry.boundingBox) return;
		const meshToRoot = inverseRoot.clone().multiply(child.matrixWorld);
		bounds.union(child.geometry.boundingBox.clone().applyMatrix4(meshToRoot));
	});
	return bounds.isEmpty() ? null : bounds;
}
/** Deterministic near-plane and viewport framing for a visible object bounds. */
function measureCameraFraming(object, camera, includeMesh = () => true) {
	object.updateWorldMatrix(true, true);
	camera.updateWorldMatrix(true, false);
	const bounds = new Box3().makeEmpty();
	object.traverse((child) => {
		if (!(child instanceof Mesh) || !effectivelyVisibleWithin(child, object) || !includeMesh(child)) return;
		if (child instanceof SkinnedMesh) {
			child.computeBoundingBox();
			if (child.boundingBox) bounds.union(child.boundingBox.clone().applyMatrix4(child.matrixWorld));
			return;
		}
		child.geometry.computeBoundingBox();
		if (child.geometry.boundingBox) bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
	});
	if (bounds.isEmpty()) return null;
	const corners = [];
	for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new Vector3(x, y, z));
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let nearestDepth = Infinity;
	let finite = true;
	for (const world of corners) {
		const cameraPoint = camera.worldToLocal(world.clone());
		nearestDepth = Math.min(nearestDepth, -cameraPoint.z);
		const projected = world.project(camera);
		finite = finite && projected.toArray().every(Number.isFinite) && Number.isFinite(nearestDepth);
		minX = Math.min(minX, projected.x);
		minY = Math.min(minY, projected.y);
		maxX = Math.max(maxX, projected.x);
		maxY = Math.max(maxY, projected.y);
	}
	const near = camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera ? camera.near : 0;
	return {
		finite,
		nearPlaneClear: finite && nearestDepth > near,
		intersectsViewport: finite && maxX >= -1 && minX <= 1 && maxY >= -1 && minY <= 1,
		fullyInsideViewport: finite && minX >= -1 && maxX <= 1 && minY >= -1 && maxY <= 1,
		ndcMin: [minX, minY],
		ndcMax: [maxX, maxY],
		nearestDepth
	};
}
//#endregion
//#region src/ik.ts
function solveTwoBoneElbowInto(shoulder, target, upperLength, lowerLength, bendHint, result, scratch) {
	const direction = scratch.toTarget.copy(target).sub(shoulder);
	const rawDistance = direction.length();
	if (rawDistance > 1e-6) direction.multiplyScalar(1 / rawDistance);
	else direction.set(0, 0, -1);
	const minimum = Math.abs(upperLength - lowerLength) + 1e-4;
	const maximum = upperLength + lowerLength - 1e-4;
	const distance = MathUtils.clamp(rawDistance, minimum, maximum);
	const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
	const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
	const perpendicular = scratch.perpendicular.copy(bendHint).sub(scratch.projection.copy(direction).multiplyScalar(bendHint.dot(direction)));
	if (perpendicular.lengthSq() < 1e-6) {
		scratch.projection.set(Math.abs(direction.y) < .9 ? 0 : 1, Math.abs(direction.y) < .9 ? 1 : 0, 0);
		perpendicular.crossVectors(direction, scratch.projection);
	}
	perpendicular.normalize();
	return result.copy(shoulder).addScaledVector(direction, along).addScaledVector(perpendicular, height);
}
/**
* Returns a stable elbow point for a two-segment chain. Targets beyond reach are
* clamped onto the reachable sphere rather than producing NaN or a flipped arm.
*/
function solveTwoBoneElbow(shoulder, target, upperLength, lowerLength, bendHint) {
	return solveTwoBoneElbowInto(shoulder, target, upperLength, lowerLength, bendHint, new Vector3(), {
		toTarget: new Vector3(),
		perpendicular: new Vector3(),
		projection: new Vector3()
	});
}
function finiteOr$4(value, fallback) {
	return Number.isFinite(value) ? value : fallback;
}
function clamp01(value) {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}
/**
* Smoothstep rather than a linear ramp: a linear cross-fade lands with a
* velocity discontinuity that reads as a pop on short transitions. Smoothstep is
* strictly increasing on [0,1], so it preserves the monotonicity guarantee.
*/
function smoothstep(value) {
	const t = clamp01(value);
	return t * t * (3 - 2 * t);
}
function blendTransitionSeconds(definition, from, to) {
	const exact = definition.transitions[`${from}->${to}`];
	const wildcard = definition.transitions[`*->${to}`];
	const chosen = Number.isFinite(exact) ? exact : Number.isFinite(wildcard) ? wildcard : definition.defaultTransitionS;
	return Math.min(2, Math.max(0, finiteOr$4(chosen, 0)));
}
function createBlendGraph(definition, initialState) {
	return {
		target: initialState,
		startWeight: 1,
		residual: [],
		transitionS: 0,
		elapsedS: 0,
		definition: Object.freeze({
			defaultTransitionS: Math.max(0, finiteOr$4(definition.defaultTransitionS, .15)),
			maximumLayers: Math.max(2, Math.trunc(finiteOr$4(definition.maximumLayers, 3))),
			transitions: definition.transitions
		})
	};
}
function targetWeightNow(state) {
	if (state.transitionS <= 0) return 1;
	return clamp01(state.startWeight + (1 - state.startWeight) * smoothstep(state.elapsedS / state.transitionS));
}
/**
* Current weights WITHOUT advancing the clock. The target holds
* `targetWeightNow` and the outgoing states split the exact remainder by their
* fixed shares, so the sum is 1 by construction rather than by rounding.
*/
function blendGraphLayers(state) {
	const target = targetWeightNow(state);
	const remainder = 1 - target;
	return Object.freeze([{
		state: state.target,
		weight: target
	}, ...state.residual.map((entry) => ({
		state: entry.state,
		weight: remainder * entry.share
	}))]);
}
/**
* Retargets the graph. Requesting the state that is already the target is a
* no-op: restarting an in-flight fade to the same destination every frame is
* what makes a blend stall forever when gameplay re-asserts its intent.
*/
function requestBlendTarget(state, next, overrideTransitionS) {
	if (next === state.target) return;
	const current = blendGraphLayers(state);
	const startWeight = clamp01(current.find((layer) => layer.state === next)?.weight ?? 0);
	const outgoing = current.filter((layer) => layer.state !== next && layer.weight > 0).map((layer) => ({
		state: layer.state,
		weight: layer.weight
	})).sort((left, right) => right.weight - left.weight || left.state.localeCompare(right.state));
	const keep = outgoing.slice(0, Math.max(0, state.definition.maximumLayers - 1));
	const droppedWeight = outgoing.slice(keep.length).reduce((total, layer) => total + layer.weight, 0);
	const keptWeight = keep.reduce((total, layer) => total + layer.weight, 0);
	const effectiveStart = clamp01(startWeight + droppedWeight);
	state.residual = 1 - effectiveStart > 0 && keptWeight > 0 ? keep.map((layer) => ({
		state: layer.state,
		share: layer.weight / keptWeight
	})) : [];
	state.startWeight = effectiveStart;
	state.transitionS = state.residual.length === 0 ? 0 : Math.min(2, Math.max(0, finiteOr$4(overrideTransitionS ?? NaN, blendTransitionSeconds(state.definition, state.target, next))));
	state.elapsedS = 0;
	state.target = next;
}
/** Advances the transition clock and returns the resulting layer weights. */
function advanceBlendGraph(state, deltaSeconds) {
	const dt = Math.max(0, finiteOr$4(deltaSeconds, 0));
	if (state.transitionS > 0) state.elapsedS = Math.min(state.transitionS, state.elapsedS + dt);
	if (state.transitionS <= 0 || state.elapsedS >= state.transitionS) {
		state.startWeight = 1;
		state.residual = [];
		state.transitionS = 0;
		state.elapsedS = 0;
	}
	return blendGraphLayers(state);
}
//#endregion
//#region src/animation-locomotion.ts
/**
* Measured from `public/assets/third-party/quaternius/ultimate-modular-males/Swat.gltf`,
* the licence-vetted source the whole operator skin family is derived from. Every
* skin shares this skeleton and clip set by catalog contract
* (`createOperatorSkinCatalog` rejects a divergent rig), so one calibration is
* correct for all of them. Re-derive with:
*   python scripts/blender/measure-pass77-operator-locomotion.py
*/
var OPERATOR_LOCOMOTION_CALIBRATION = Object.freeze({
	Walk: Object.freeze({
		durationS: 1.3333,
		authoredGroundSpeedMps: 1.3416,
		axis: "forward"
	}),
	Run: Object.freeze({
		durationS: .8,
		authoredGroundSpeedMps: 3.0832,
		axis: "forward"
	}),
	Run_Shoot: Object.freeze({
		durationS: .8333,
		authoredGroundSpeedMps: 3.0832,
		axis: "forward"
	}),
	Run_Back: Object.freeze({
		durationS: .8333,
		authoredGroundSpeedMps: 3.1215,
		axis: "backward"
	}),
	Run_Left: Object.freeze({
		durationS: .8,
		authoredGroundSpeedMps: 3.0856,
		axis: "left"
	}),
	Run_Right: Object.freeze({
		durationS: .8,
		authoredGroundSpeedMps: 3.0856,
		axis: "right"
	})
});
/**
* Playback rate bounds. Below ~0.55 a walk cycle reads as slow motion; above
* ~1.75 the legs blur and the upper body judders. The residual slide outside
* this window is reported rather than hidden, because closing it needs a faster
* authored sprint clip, not a bigger multiplier.
*/
var LOCOMOTION_PLAYBACK_LIMITS = Object.freeze({
	minimum: .55,
	maximum: 1.75
});
/** Below this the operator is standing still and the caller should use idle. */
var LOCOMOTION_IDLE_SPEED_MPS = .15;
var AXIS_UNIT = Object.freeze({
	forward: Object.freeze({
		forward: 1,
		strafe: 0
	}),
	backward: Object.freeze({
		forward: -1,
		strafe: 0
	}),
	left: Object.freeze({
		forward: 0,
		strafe: -1
	}),
	right: Object.freeze({
		forward: 0,
		strafe: 1
	})
});
function finiteOr$3(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function clamp$3(value, minimum, maximum) {
	return value < minimum ? minimum : value > maximum ? maximum : value;
}
function smoothstep01$1(value) {
	const t = clamp$3(value, 0, 1);
	return t * t * (3 - 2 * t);
}
/**
* The playback rate that makes a clip authored for `authoredMps` carry a body
* travelling at `desiredMps`. Clamped, because an unbounded rate trades foot
* sliding for a rig that vibrates.
*/
function playbackRateForGroundSpeed(authoredMps, desiredMps, limits = LOCOMOTION_PLAYBACK_LIMITS) {
	const authored = finiteOr$3(authoredMps, 0);
	const desired = Math.abs(finiteOr$3(desiredMps, 0));
	const minimum = Math.max(.01, finiteOr$3(limits.minimum, LOCOMOTION_PLAYBACK_LIMITS.minimum));
	const maximum = Math.max(minimum, finiteOr$3(limits.maximum, LOCOMOTION_PLAYBACK_LIMITS.maximum));
	if (authored <= 0) return 1;
	return clamp$3(desired / authored, minimum, maximum);
}
/** Metres per second of ground the planted foot slips after speed matching. */
function footSlideMetresPerSecond(authoredMps, desiredMps, playbackRate) {
	const authored = Math.abs(finiteOr$3(authoredMps, 0));
	const desired = Math.abs(finiteOr$3(desiredMps, 0));
	return Math.abs(desired - authored * Math.max(0, finiteOr$3(playbackRate, 0)));
}
function pickForwardRun(available, armed) {
	return (armed ? ["Run_Shoot", "Run"] : ["Run", "Run_Shoot"]).find((clip) => available.has(clip)) ?? null;
}
/**
* Cardinal weights from an L1 normalisation of the local velocity. L1 is used
* deliberately: the four weights then sum to exactly 1 with no square roots and
* no renormalisation step, which is what keeps the emitted blend exact.
*/
function cardinalWeights(forwardMps, strafeMps) {
	const total = Math.abs(forwardMps) + Math.abs(strafeMps);
	if (total <= 0) return {
		forward: 1,
		backward: 0,
		left: 0,
		right: 0
	};
	return {
		forward: Math.max(0, forwardMps) / total,
		backward: Math.max(0, -forwardMps) / total,
		right: Math.max(0, strafeMps) / total,
		left: Math.max(0, -strafeMps) / total
	};
}
function solveLocomotion(sample) {
	const forwardMps = finiteOr$3(sample.forwardMps, 0);
	const strafeMps = finiteOr$3(sample.strafeMps, 0);
	const groundSpeedMps = Math.hypot(forwardMps, strafeMps);
	const available = new Set(sample.availableClips);
	const armed = sample.armed !== false;
	const limits = sample.playbackLimits ?? LOCOMOTION_PLAYBACK_LIMITS;
	const walk = available.has("Walk") ? "Walk" : null;
	const forwardRun = pickForwardRun(available, armed);
	const back = available.has("Run_Back") ? "Run_Back" : null;
	const left = available.has("Run_Left") ? "Run_Left" : null;
	const right = available.has("Run_Right") ? "Run_Right" : null;
	const directional = back !== null || left !== null || right !== null;
	const idle = Object.freeze({
		clips: Object.freeze([]),
		moving: false,
		groundSpeedMps,
		authoredGroundSpeedMps: 0,
		playbackRate: 1,
		strideFrequencyHz: 0,
		footSlideMps: 0,
		footSlideRatio: 0,
		directionMismatch: 0,
		directional
	});
	if (groundSpeedMps < .15 || walk === null && forwardRun === null && !directional) return idle;
	const cardinals = directional ? cardinalWeights(forwardMps, strafeMps) : {
		forward: 1,
		backward: 0,
		left: 0,
		right: 0
	};
	const walkSpeed = OPERATOR_LOCOMOTION_CALIBRATION.Walk.authoredGroundSpeedMps;
	const runSpeed = forwardRun ? OPERATOR_LOCOMOTION_CALIBRATION[forwardRun].authoredGroundSpeedMps : walkSpeed;
	const gait = walk === null ? 1 : forwardRun === null ? 0 : smoothstep01$1((groundSpeedMps - walkSpeed) / Math.max(1e-6, runSpeed - walkSpeed));
	const raw = [];
	const push = (clip, weight) => {
		if (clip !== null && weight > 0) raw.push({
			clip,
			weight
		});
	};
	push(walk, cardinals.forward * (1 - gait));
	push(forwardRun, cardinals.forward * gait);
	push(back ?? forwardRun, cardinals.backward);
	push(left ?? forwardRun, cardinals.left);
	push(right ?? forwardRun, cardinals.right);
	const merged = /* @__PURE__ */ new Map();
	for (const entry of raw) merged.set(entry.clip, (merged.get(entry.clip) ?? 0) + entry.weight);
	const total = [...merged.values()].reduce((sum, weight) => sum + weight, 0);
	if (total <= 0) return idle;
	let authoredGroundSpeedMps = 0;
	let naturalCycleHz = 0;
	let axisForward = 0;
	let axisStrafe = 0;
	const normalized = [...merged.entries()].map(([clip, weight]) => ({
		clip,
		weight: weight / total
	})).sort((leftEntry, rightEntry) => rightEntry.weight - leftEntry.weight || leftEntry.clip.localeCompare(rightEntry.clip));
	for (const entry of normalized) {
		const calibration = OPERATOR_LOCOMOTION_CALIBRATION[entry.clip];
		authoredGroundSpeedMps += entry.weight * calibration.authoredGroundSpeedMps;
		naturalCycleHz += entry.weight / calibration.durationS;
		axisForward += entry.weight * AXIS_UNIT[calibration.axis].forward;
		axisStrafe += entry.weight * AXIS_UNIT[calibration.axis].strafe;
	}
	const playbackRate = playbackRateForGroundSpeed(authoredGroundSpeedMps, groundSpeedMps, limits);
	const strideFrequencyHz = naturalCycleHz * playbackRate;
	const clips = Object.freeze(normalized.map((entry) => Object.freeze({
		clip: entry.clip,
		weight: entry.weight,
		timeScale: strideFrequencyHz * OPERATOR_LOCOMOTION_CALIBRATION[entry.clip].durationS
	})));
	const footSlideMps = footSlideMetresPerSecond(authoredGroundSpeedMps, groundSpeedMps, playbackRate);
	const axisLength = Math.hypot(axisForward, axisStrafe);
	const alignment = axisLength <= 1e-9 ? 0 : (axisForward * forwardMps + axisStrafe * strafeMps) / (axisLength * groundSpeedMps);
	return Object.freeze({
		clips,
		moving: true,
		groundSpeedMps,
		authoredGroundSpeedMps,
		playbackRate,
		strideFrequencyHz,
		footSlideMps,
		footSlideRatio: footSlideMps / Math.max(LOCOMOTION_IDLE_SPEED_MPS, groundSpeedMps),
		directionMismatch: clamp$3((1 - alignment) / 2, 0, 1),
		directional
	});
}
//#endregion
//#region src/animation-hit-reaction.ts
var HIT_REACTION_SHAPES = Object.freeze({
	head: Object.freeze({
		riseSeconds: .045,
		decaySeconds: .34,
		peak: 1
	}),
	body: Object.freeze({
		riseSeconds: .06,
		decaySeconds: .28,
		peak: .78
	}),
	limb: Object.freeze({
		riseSeconds: .05,
		decaySeconds: .2,
		peak: .5
	})
});
/**
* The reaction layer never reaches 1. A full-weight reaction is a clip swap by
* another name; leaving headroom is what makes it read as a flinch while the
* operator keeps running.
*/
var MAXIMUM_HIT_REACTION_WEIGHT = .85;
/** Torso deflection ceiling. Beyond this the spine visibly breaks. */
var MAXIMUM_HIT_REACTION_OFFSET_RADIANS = .35;
function finiteOr$2(value, fallback) {
	return Number.isFinite(value) ? value : fallback;
}
function clamp$2(value, minimum, maximum) {
	return value < minimum ? minimum : value > maximum ? maximum : value;
}
function smoothstep01(value) {
	const t = clamp$2(value, 0, 1);
	return t * t * (3 - 2 * t);
}
/**
* Rise-then-decay envelope with a hard end. Continuous at the peak, exactly 0
* at and after `riseSeconds + decaySeconds`, so an impulse cannot linger.
*/
function hitImpulseEnvelope(ageSeconds, shape) {
	const age = finiteOr$2(ageSeconds, 0);
	const rise = Math.max(1e-6, finiteOr$2(shape.riseSeconds, 0));
	const decay = Math.max(1e-6, finiteOr$2(shape.decaySeconds, 0));
	if (age <= 0) return 0;
	if (age < rise) return smoothstep01(age / rise);
	if (age < rise + decay) return 1 - smoothstep01((age - rise) / decay);
	return 0;
}
function createHitReactionState() {
	return {
		impulses: [],
		received: 0
	};
}
function pushHitImpulse(state, impulse) {
	const zone = impulse.zone in HIT_REACTION_SHAPES ? impulse.zone : "body";
	state.received += 1;
	state.impulses.push({
		zone,
		severity: clamp$2(finiteOr$2(impulse.severity, 1), 0, 1),
		incomingYawRadians: finiteOr$2(impulse.incomingYawRadians, 0),
		ageSeconds: 0,
		alternate: state.received % 2 === 0
	});
	if (state.impulses.length > 4) state.impulses.splice(0, state.impulses.length - 4);
}
/**
* Advances every live impulse and sums them into one bounded layer.
* `gain` is the per-skin absorption factor: a plated archetype flinches less.
*/
function advanceHitReaction(state, deltaSeconds, gain = 1) {
	const dt = Math.max(0, finiteOr$2(deltaSeconds, 0));
	const scale = clamp$2(finiteOr$2(gain, 1), 0, 2);
	let rawWeight = 0;
	let pitch = 0;
	let roll = 0;
	let dominant = null;
	let dominantContribution = 0;
	const surviving = [];
	for (const impulse of state.impulses) {
		impulse.ageSeconds += dt;
		const shape = HIT_REACTION_SHAPES[impulse.zone];
		if (impulse.ageSeconds >= shape.riseSeconds + shape.decaySeconds) continue;
		surviving.push(impulse);
		const contribution = hitImpulseEnvelope(impulse.ageSeconds, shape) * shape.peak * impulse.severity * scale;
		if (contribution <= 0) continue;
		rawWeight += contribution;
		pitch -= contribution * Math.cos(impulse.incomingYawRadians) * MAXIMUM_HIT_REACTION_OFFSET_RADIANS;
		roll -= contribution * Math.sin(impulse.incomingYawRadians) * MAXIMUM_HIT_REACTION_OFFSET_RADIANS;
		if (contribution > dominantContribution) {
			dominantContribution = contribution;
			dominant = impulse;
		}
	}
	state.impulses = surviving;
	return Object.freeze({
		clipWeight: clamp$2(rawWeight, 0, MAXIMUM_HIT_REACTION_WEIGHT),
		alternate: dominant?.alternate ?? false,
		pitchOffsetRadians: clamp$2(pitch, -.35, MAXIMUM_HIT_REACTION_OFFSET_RADIANS),
		rollOffsetRadians: clamp$2(roll, -.35, MAXIMUM_HIT_REACTION_OFFSET_RADIANS),
		activeImpulses: surviving.length
	});
}
//#endregion
//#region src/rigged-operator-skin-animation.ts
/**
* Pass 77 / HF-375. Per-skin animation differentiation.
*
* BE PRECISE ABOUT WHAT IS AND IS NOT PER-SKIN, because the catalog forbids the
* obvious answer. `createOperatorSkinCatalog` rejects any skin whose rig
* contract diverges from the default's (62 joints, 24 clips,
* `pass65-third-person-operator-family-v1`), so every archetype is animated by
* the SAME clips on the SAME skeleton. A per-skin clip library would need new
* authored art and a new rig contract; it is not available here.
*
* Genuinely per-skin (this module):
*   - which idle the archetype prefers, from the shared corpus;
*   - a static posture bias in radians applied to the spine chain after the
*     mixer - the hunch, the squared shoulders, the low-profile crouch;
*   - breathing rate and amplitude, and a stable per-operator phase offset so
*     two operators of the same archetype do not breathe in lockstep;
*   - aim, lean and turn response rates;
*   - hit-reaction gain, so a plated archetype absorbs where a light one flinches;
*   - playback-rate limits and a transition-duration scale (heavy archetypes
*     commit to a movement, light ones change their mind faster).
*
* Shared by every skin (deliberately, and stated so nobody claims otherwise):
*   - the clip corpus, the skeleton, and the locomotion calibration measured
*     from it;
*   - the blend-weight arithmetic, the additive-layer maths and the hit envelope.
*
* The phase offset is a hash of replicated identity, never `Math.random`, so
* every peer renders the same operator with the same idle phase.
*/
/** No posture bias may exceed this; past it the rig reads as deformed, not styled. */
var MAXIMUM_POSTURE_BIAS_RADIANS = .26;
var IDLE_CORPUS = Object.freeze([
	"Idle_Gun_Pointing",
	"Idle_Gun",
	"Idle_Gun_Shoot"
]);
function profile$1(archetype, idleClipPreference, posture, additive, hitReactionGain, transitionScale, locomotionPlaybackLimits = LOCOMOTION_PLAYBACK_LIMITS) {
	return Object.freeze({
		archetype,
		idleClipPreference: Object.freeze([...idleClipPreference]),
		posture: Object.freeze(posture),
		additive: Object.freeze({
			...DEFAULT_ADDITIVE_POSE_PROFILE,
			...additive
		}),
		hitReactionGain,
		locomotionPlaybackLimits: Object.freeze({ ...locomotionPlaybackLimits }),
		transitionScale
	});
}
/**
* Keyed by the catalog's `archetype`, not by skin id, so a future re-skin of an
* existing archetype inherits its movement identity for free. A test asserts
* set equality against the catalog: adding a skin without a profile fails there
* rather than silently falling back at runtime.
*/
var OPERATOR_SKIN_ANIMATION_PROFILES = Object.freeze({
	standard: profile$1("standard", IDLE_CORPUS, {
		spinePitchRadians: 0,
		chestPitchRadians: 0,
		headPitchRadians: 0,
		shoulderRollRadians: 0
	}, {}, 1, 1),
	explorer: profile$1("explorer", [
		"Idle_Gun",
		"Idle_Gun_Pointing",
		"Idle_Gun_Shoot"
	], {
		spinePitchRadians: .05,
		chestPitchRadians: .03,
		headPitchRadians: -.02,
		shoulderRollRadians: -.03
	}, {
		aimResponseHz: 7,
		leanResponseHz: 5,
		leanGainRadiansPerMps: .038,
		maximumLeanRadians: .24,
		turnRateRadiansPerSecond: 4.2,
		breathHz: .32,
		breathAmplitudeRadians: .026
	}, 1.25, .86, Object.freeze({
		minimum: .6,
		maximum: 1.9
	})),
	symbiote: profile$1("symbiote", [
		"Idle_Gun_Pointing",
		"Idle_Gun_Shoot",
		"Idle_Gun"
	], {
		spinePitchRadians: .12,
		chestPitchRadians: .06,
		headPitchRadians: -.07,
		shoulderRollRadians: .08
	}, {
		aimResponseHz: 4.2,
		leanResponseHz: 2.8,
		leanGainRadiansPerMps: .018,
		maximumLeanRadians: .13,
		turnEnterRadians: .68,
		turnRateRadiansPerSecond: 2.4,
		movingTurnRateScale: 2,
		breathHz: .19,
		breathAmplitudeRadians: .031
	}, .6, 1.24, Object.freeze({
		minimum: .5,
		maximum: 1.5
	})),
	navalops: profile$1("navalops", [
		"Idle_Gun_Pointing",
		"Idle_Gun",
		"Idle_Gun_Shoot"
	], {
		spinePitchRadians: .07,
		chestPitchRadians: .02,
		headPitchRadians: -.03,
		shoulderRollRadians: .02
	}, {
		aimResponseHz: 8.5,
		leanResponseHz: 4.6,
		leanGainRadiansPerMps: .024,
		maximumLeanRadians: .16,
		turnEnterRadians: .62,
		turnExitRadians: .07,
		turnRateRadiansPerSecond: 3.9,
		breathHz: .22,
		breathAmplitudeRadians: .013
	}, .85, .92)
});
var DEFAULT_OPERATOR_SKIN_ANIMATION_PROFILE = OPERATOR_SKIN_ANIMATION_PROFILES.standard;
var ARCHETYPE_BY_SKIN_ID = new Map(OPERATOR_SKIN_SOURCES.map((source) => [source.id, source.archetype]));
/** Falls back to the standard profile rather than throwing: a skin that loads is presentation-only. */
function resolveOperatorSkinAnimationProfile(skinId) {
	const archetype = ARCHETYPE_BY_SKIN_ID.get(skinId);
	return (archetype ? OPERATOR_SKIN_ANIMATION_PROFILES[archetype] : void 0) ?? DEFAULT_OPERATOR_SKIN_ANIMATION_PROFILE;
}
/** First preferred idle the mixer has actually bound, or null when none is. */
function resolveOperatorIdleClip(profileForSkin, availableClips) {
	const available = new Set(availableClips);
	return profileForSkin.idleClipPreference.find((clip) => available.has(clip)) ?? null;
}
/**
* FNV-1a over the replicated identity. Deterministic across peers and runs,
* which `Math.random` would not be - two clients must not disagree about where
* in its breathing cycle a remote operator is.
*/
function operatorIdlePhase(skinId, operatorName) {
	const key = `${skinId}:${operatorName}`;
	let hash = 2166136261;
	for (let index = 0; index < key.length; index += 1) {
		hash ^= key.charCodeAt(index);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return (hash >>> 8) / 16777216;
}
/** Posture bias clamped to the sane band, ready to add to post-mixer bones. */
function clampedPostureBias(posture) {
	const bound = (value) => {
		return Math.max(-.26, Math.min(MAXIMUM_POSTURE_BIAS_RADIANS, Number.isFinite(value) ? value : 0));
	};
	return Object.freeze({
		spinePitchRadians: bound(posture.spinePitchRadians),
		chestPitchRadians: bound(posture.chestPitchRadians),
		headPitchRadians: bound(posture.headPitchRadians),
		shoulderRollRadians: bound(posture.shoulderRollRadians)
	});
}
//#endregion
//#region src/rigged-operator-animation-director.ts
/**
* Pass 77 / HF-375. The composed operator animation director.
*
* One call per operator per frame turns gameplay state into a POSE DESCRIPTION:
* which clips to mix, at what weight, at what playback rate, plus the additive
* bone offsets to apply after the mixer has written the pose. It deliberately
* knows nothing about THREE, the scene graph or bone names - that binding lives
* in the runtime that owns the rig - which is what makes every rule in here
* testable without a GPU.
*
* What it replaces, concretely:
*   - one 0.14 s fade for every transition -> a per-transition table, scaled per
*     archetype, with weights that provably sum to 1 through the blend;
*   - clip choice from a scalar speed -> a direction-aware, speed-matched blend;
*   - a dropped aim pitch -> a smoothed, clamped spine distribution;
*   - one-shots left clamped at full weight forever -> bounded envelopes that
*     return to exactly zero and never fully hide locomotion.
*
* Deterministic by construction: deltas in, no clock reads, no `Math.random`.
*/
/**
* Per-transition durations. These are not decoration: leaving idle needs to be
* quicker than settling into it or the operator looks like it is wading, a pivot
* is quicker still, and death has to be near-instant so the ragdoll-less corpse
* does not glide out of its run.
*/
var OPERATOR_ANIMATION_TRANSITIONS = Object.freeze({
	defaultTransitionS: .16,
	maximumLayers: 3,
	transitions: Object.freeze({
		"idle->locomotion": .16,
		"locomotion->idle": .26,
		"idle->turn": .1,
		"turn->idle": .16,
		"locomotion->turn": .12,
		"turn->locomotion": .12,
		"*->death": .06
	})
});
/**
* Bounded one-shot envelopes. Peaks stay well below 1 so the layer reads as an
* accent on top of locomotion, and each has a hard end, unlike the shipped
* `clampWhenFinished` one-shots that never stop contributing.
*/
var OPERATOR_ONE_SHOT_SHAPES = Object.freeze({
	fire: Object.freeze({
		riseSeconds: .025,
		decaySeconds: .13,
		peak: .5
	}),
	melee: Object.freeze({
		riseSeconds: .07,
		decaySeconds: .38,
		peak: .9
	}),
	"emote-wave": Object.freeze({
		riseSeconds: .08,
		decaySeconds: 1.05,
		peak: .95
	}),
	"emote-punch": Object.freeze({
		riseSeconds: .06,
		decaySeconds: .6,
		peak: .95
	}),
	"emote-boot": Object.freeze({
		riseSeconds: .06,
		decaySeconds: .7,
		peak: .95
	})
});
var EMPTY_LAYERS = Object.freeze([]);
function finiteOr$1(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function createOperatorAnimationDirector(skinId, operatorName) {
	return {
		profile: resolveOperatorSkinAnimationProfile(skinId),
		graph: createBlendGraph(OPERATOR_ANIMATION_TRANSITIONS, "idle"),
		pose: createAdditivePoseState(operatorIdlePhase(skinId, operatorName)),
		hits: createHitReactionState(),
		oneShots: []
	};
}
function pushOperatorHitImpulse(director, impulse) {
	pushHitImpulse(director.hits, impulse);
}
/** Retriggering restarts the envelope rather than stacking a second copy. */
function pushOperatorOneShot(director, kind) {
	const existing = director.oneShots.find((entry) => entry.kind === kind);
	if (existing) {
		existing.ageSeconds = 0;
		return;
	}
	director.oneShots.push({
		kind,
		ageSeconds: 0
	});
}
function selectIdleClip(director, availableClips) {
	return resolveOperatorIdleClip(director.profile, availableClips);
}
/**
* The pivot state. The corpus has no authored turn-in-place, but it does have
* lateral runs, and a lateral run at a low playback rate is exactly the shuffle
* a pivot is made of. Without them the state still exists and still rate-limits
* the body yaw - it just has no shuffle under it, which is honest degradation
* rather than a snap.
*/
function turnClips(turning, availableClips, idleClip) {
	const available = new Set(availableClips);
	const lateral = turning > 0 ? "Run_Right" : "Run_Left";
	if (available.has(lateral)) return [{
		clip: lateral,
		weight: 1,
		timeScale: .62
	}];
	return idleClip ? [{
		clip: idleClip,
		weight: 1,
		timeScale: 1
	}] : [];
}
function stateClips(name, director, input, locomotion, idleClip) {
	if (name === "death") return input.availableClips.includes("Death") ? [{
		clip: "Death",
		weight: 1,
		timeScale: 1
	}] : [];
	if (name === "locomotion" && locomotion.clips.length > 0) return locomotion.clips.map((entry) => ({
		clip: entry.clip,
		weight: entry.weight,
		timeScale: entry.timeScale
	}));
	if (name === "turn") return turnClips(director.pose.turning, input.availableClips, idleClip);
	return idleClip ? [{
		clip: idleClip,
		weight: 1,
		timeScale: 1
	}] : [];
}
/**
* Folds the blend graph's state weights into per-clip weights. A clip reachable
* from two states is merged once, with its playback rate weight-averaged, so the
* mixer is never handed the same action twice with contradictory rates.
*/
function mergeLayers(contributions) {
	const totals = /* @__PURE__ */ new Map();
	for (const [stateWeight, layers] of contributions) for (const layer of layers) {
		const weight = stateWeight * layer.weight;
		if (weight <= 0) continue;
		const entry = totals.get(layer.clip) ?? {
			weight: 0,
			rateWeight: 0
		};
		entry.weight += weight;
		entry.rateWeight += weight * layer.timeScale;
		totals.set(layer.clip, entry);
	}
	const total = [...totals.values()].reduce((sum, entry) => sum + entry.weight, 0);
	if (total <= 0) return EMPTY_LAYERS;
	return Object.freeze([...totals.entries()].map(([clip, entry]) => Object.freeze({
		clip,
		weight: entry.weight / total,
		timeScale: entry.rateWeight / entry.weight
	})).sort((left, right) => right.weight - left.weight || left.clip.localeCompare(right.clip)));
}
function advanceOneShots(director, deltaSeconds) {
	const live = [];
	const surviving = [];
	for (const entry of director.oneShots) {
		entry.ageSeconds += deltaSeconds;
		const shape = OPERATOR_ONE_SHOT_SHAPES[entry.kind];
		if (entry.ageSeconds >= shape.riseSeconds + shape.decaySeconds) continue;
		surviving.push(entry);
		const weight = hitImpulseEnvelope(entry.ageSeconds, shape) * shape.peak;
		if (weight > 0) live.push({
			kind: entry.kind,
			weight
		});
	}
	director.oneShots = surviving;
	return live;
}
var ONE_SHOT_CLIPS = Object.freeze({
	fire: Object.freeze(["Gun_Shoot", "Idle_Gun_Shoot"]),
	melee: Object.freeze(["Punch_Right", "Kick_Right"]),
	"emote-wave": Object.freeze(["Wave"]),
	"emote-punch": Object.freeze(["Punch_Right"]),
	"emote-boot": Object.freeze(["Kick_Right"])
});
var HIT_CLIPS = Object.freeze(["HitRecieve", "HitRecieve_2"]);
function advanceOperatorAnimation(director, input) {
	const deltaSeconds = Math.min(.05, Math.max(0, finiteOr$1(input.deltaSeconds, 0)));
	const available = new Set(input.availableClips);
	const idleClip = selectIdleClip(director, input.availableClips);
	const locomotion = solveLocomotion({
		forwardMps: input.forwardMps,
		strafeMps: input.strafeMps,
		availableClips: input.availableClips,
		armed: input.armed,
		playbackLimits: director.profile.locomotionPlaybackLimits
	});
	const aim = advanceAdditivePose(director.pose, {
		deltaSeconds,
		desiredAimPitchRadians: input.aimPitchRadians,
		yawErrorRadians: input.yawErrorRadians,
		strafeMps: input.strafeMps,
		groundSpeedMps: locomotion.groundSpeedMps
	}, director.profile.additive);
	const next = input.dead ? "death" : locomotion.moving ? "locomotion" : director.pose.turning !== 0 ? "turn" : "idle";
	if (director.graph.target !== "death") {
		const base = blendTransitionSeconds(OPERATOR_ANIMATION_TRANSITIONS, director.graph.target, next);
		requestBlendTarget(director.graph, next, base * Math.max(.1, director.profile.transitionScale));
	}
	const layers = mergeLayers((deltaSeconds > 0 ? advanceBlendGraph(director.graph, deltaSeconds) : blendGraphLayers(director.graph)).map((layer) => [layer.weight, stateClips(layer.state, director, input, locomotion, idleClip)]));
	const hitReaction = advanceHitReaction(director.hits, deltaSeconds, director.profile.hitReactionGain);
	const additiveLayers = [];
	if (hitReaction.clipWeight > 0) {
		const clip = (hitReaction.alternate ? [HIT_CLIPS[1], HIT_CLIPS[0]] : [HIT_CLIPS[0], HIT_CLIPS[1]]).find((candidate) => available.has(candidate));
		if (clip) additiveLayers.push({
			clip,
			weight: hitReaction.clipWeight,
			timeScale: 1
		});
	}
	for (const entry of advanceOneShots(director, deltaSeconds)) {
		const clip = ONE_SHOT_CLIPS[entry.kind].find((candidate) => available.has(candidate));
		if (clip) additiveLayers.push({
			clip,
			weight: entry.weight,
			timeScale: 1
		});
	}
	const selected = stateClips(director.graph.target, director, input, locomotion, idleClip).reduce((best, layer) => best === null || layer.weight > best.weight ? layer : best, null);
	return Object.freeze({
		state: director.graph.target,
		selectedClip: selected?.clip ?? null,
		layers,
		additiveLayers: Object.freeze(additiveLayers.sort((left, right) => right.weight - left.weight || left.clip.localeCompare(right.clip))),
		aim,
		posture: clampedPostureBias(director.profile.posture),
		hitReaction,
		locomotion
	});
}
//#endregion
//#region src/rigged-operator-animation-runtime.ts
/**
* Pass 77 / HF-375. The binding layer between the animation director and three.
*
* The director (`rigged-operator-animation-director`) turns gameplay state into
* a pose DESCRIPTION and deliberately knows nothing about three. Until this file
* existed, nothing consumed that description: every module the previous lane
* landed was imported only by its own tests, so not one frame of the game had
* changed. This is the consumer.
*
* Two jobs, kept apart on purpose:
*
*   1. `planOperatorMixer` - pure. Folds the director's base and additive layers
*      into per-clip mixer commands, and - the part that matters - works out
*      which clips must be RELEASED. The shipped runtime never released
*      anything: `playOneShot` sets `clampWhenFinished = true` and there is no
*      `finished` listener anywhere, and three's handling of a finished clamped
*      action is `this.paused = true`, NOT `enabled = false`. The action stays
*      enabled at weight 1 and keeps contributing to the mix for the rest of the
*      operator's life. An operator that has fired, been hit and meleed is a
*      running average of three frozen poses and whatever it is actually doing.
*      Every clip that leaves the plan is stopped here, so that cannot happen.
*
*   2. `applyOperatorMixerPlan` / `applyOperatorAnimationPose` - the three-side
*      application. Weights and playback rates onto real actions, additive bone
*      offsets onto the post-mixer spine.
*
* Phase continuity is handled here rather than in the director because it needs
* the live action clock: when a locomotion clip enters a blend that already has
* one running, it is seeded at the same NORMALISED phase, so the two clips'
* footfalls line up instead of the entering clip restarting from its first
* frame mid-stride.
*/
/** Clips whose phase is meaningful to match across a cross-fade. */
var LOCOMOTION_CLIPS = /* @__PURE__ */ new Set([
	"Walk",
	"Run",
	"Run_Shoot",
	"Run_Back",
	"Run_Left",
	"Run_Right"
]);
/**
* Terminal clips hold their last frame instead of looping. Death is the only
* one: a corpse that loops its own collapse is worse than no animation at all.
*/
var TERMINAL_CLIPS = /* @__PURE__ */ new Set(["Death"]);
var EPSILON_WEIGHT = 1e-4;
function finiteOr(value, fallback) {
	return Number.isFinite(value) ? value : fallback;
}
/**
* Pure. Everything about which clip is mixed, at what weight, and - critically -
* which clips stop being mixed, decided without touching three.
*/
function planOperatorMixer(output, previouslyActive) {
	const previous = new Set(previouslyActive);
	const commands = [];
	const active = /* @__PURE__ */ new Set();
	const stillMixedLocomotion = [...previous].filter((clip) => LOCOMOTION_CLIPS.has(clip)).sort();
	const phaseSource = output.layers.find((layer) => stillMixedLocomotion.includes(layer.clip))?.clip ?? stillMixedLocomotion[0] ?? null;
	for (const layer of output.layers) {
		const weight = finiteOr(layer.weight, 0);
		if (weight <= EPSILON_WEIGHT) continue;
		const role = TERMINAL_CLIPS.has(layer.clip) ? "terminal" : "base";
		const enter = !previous.has(layer.clip);
		active.add(layer.clip);
		commands.push(Object.freeze({
			clip: layer.clip,
			weight,
			timeScale: Math.max(0, finiteOr(layer.timeScale, 1)),
			role,
			enter,
			phaseSource: enter && LOCOMOTION_CLIPS.has(layer.clip) && phaseSource !== layer.clip ? phaseSource : null
		}));
	}
	for (const layer of output.additiveLayers) {
		const weight = finiteOr(layer.weight, 0);
		if (weight <= EPSILON_WEIGHT) continue;
		if (active.has(layer.clip)) continue;
		active.add(layer.clip);
		commands.push(Object.freeze({
			clip: layer.clip,
			weight,
			timeScale: Math.max(0, finiteOr(layer.timeScale, 1)),
			role: "accent",
			enter: !previous.has(layer.clip),
			phaseSource: null
		}));
	}
	const released = [...previous].filter((clip) => !active.has(clip)).sort();
	return Object.freeze({
		commands: Object.freeze(commands),
		released: Object.freeze(released),
		active: Object.freeze([...active].sort())
	});
}
function normalisedPhase(action) {
	const duration = action.getClip().duration;
	if (!(duration > 0)) return 0;
	const phase = action.time % duration / duration;
	return phase < 0 ? phase + 1 : phase;
}
/** Applies a plan to real three actions. The only three-mutating half. */
function applyOperatorMixerPlan(plan, resolve) {
	let applied = 0;
	let released = 0;
	let entered = 0;
	let phaseSynced = 0;
	const phases = /* @__PURE__ */ new Map();
	for (const command of plan.commands) {
		if (!command.enter || command.phaseSource === null || phases.has(command.phaseSource)) continue;
		const source = resolve(command.phaseSource);
		if (source) phases.set(command.phaseSource, normalisedPhase(source));
	}
	for (const clip of plan.released) {
		const action = resolve(clip);
		if (!action) continue;
		action.stop();
		action.enabled = false;
		action.clampWhenFinished = false;
		released += 1;
	}
	for (const command of plan.commands) {
		const action = resolve(command.clip);
		if (!action) continue;
		if (command.enter) {
			const phase = command.phaseSource === null ? void 0 : phases.get(command.phaseSource);
			action.reset();
			if (command.role === "terminal") {
				action.setLoop(LoopOnce, 1);
				action.clampWhenFinished = true;
			} else {
				action.setLoop(LoopRepeat, Infinity);
				action.clampWhenFinished = false;
			}
			if (phase !== void 0) {
				action.time = phase * action.getClip().duration;
				phaseSynced += 1;
			}
			action.play();
			entered += 1;
		}
		action.enabled = true;
		action.paused = false;
		action.setEffectiveWeight(command.weight);
		action.setEffectiveTimeScale(command.timeScale);
		applied += 1;
	}
	return Object.freeze({
		applied,
		released,
		entered,
		phaseSynced
	});
}
/**
* Sign convention, recovered from the shipped stance code rather than guessed:
* `applyStancePose` bends the crouch with POSITIVE local X on abdomen, torso and
* chest, so +X pitches the body forward and down. Aiming up is therefore a
* NEGATIVE X offset, and a forward-hunched posture bias is a positive one.
*/
var AIM_PITCH_SIGN = -1;
/** How much of the hit-reaction torso deflection each spine joint absorbs. */
var HIT_DEFLECTION_SHARE = Object.freeze({
	abdomen: .3,
	chest: .45,
	head: .25
});
/**
* Adds the director's additive channels onto the post-mixer pose. Called every
* frame straight after `mixer.update`, and the caller restores the clean pose
* before the next mixer evaluation, so these never accumulate.
*/
function applyOperatorAnimationPose(bones, output) {
	const aim = output.aim;
	const posture = output.posture;
	const hit = output.hitReaction;
	let bonesWritten = 0;
	const add = (bone, x, z) => {
		if (!bone) return;
		if (x === 0 && z === 0) return;
		bone.rotation.x += x;
		bone.rotation.z += z;
		bonesWritten += 1;
	};
	add(bones.abdomen, AIM_PITCH_SIGN * aim.aimJointRadians.spine + posture.spinePitchRadians + hit.pitchOffsetRadians * HIT_DEFLECTION_SHARE.abdomen, aim.leanRollRadians * .35 + hit.rollOffsetRadians * HIT_DEFLECTION_SHARE.abdomen);
	add(bones.chest, AIM_PITCH_SIGN * aim.aimJointRadians.chest + posture.chestPitchRadians + aim.breathOffsetRadians + hit.pitchOffsetRadians * HIT_DEFLECTION_SHARE.chest, posture.shoulderRollRadians + aim.leanRollRadians * .45 + hit.rollOffsetRadians * HIT_DEFLECTION_SHARE.chest);
	add(bones.neck, AIM_PITCH_SIGN * aim.aimJointRadians.neck, 0);
	add(bones.head, AIM_PITCH_SIGN * aim.aimJointRadians.head + posture.headPitchRadians - aim.breathOffsetRadians * .5 + hit.pitchOffsetRadians * HIT_DEFLECTION_SHARE.head, hit.rollOffsetRadians * HIT_DEFLECTION_SHARE.head);
	add(bones.hips, 0, aim.leanRollRadians * .2);
	return Object.freeze({
		bonesWritten,
		aimPitchRadians: aim.aimPitchRadians,
		postureSpineRadians: posture.spinePitchRadians,
		leanRollRadians: aim.leanRollRadians,
		hitPitchRadians: hit.pitchOffsetRadians,
		breathOffsetRadians: aim.breathOffsetRadians
	});
}
/**
* Local-frame decomposition of a world-space ground velocity, using the yaw
* convention `operatorYawToward` establishes: forward is local -Z, so a body at
* yaw t faces (-sin t, 0, -cos t) and its right is (cos t, 0, -sin t).
*
* This is what turns a scalar `speed` into the direction-aware input the
* locomotion solver needs, and it is why a retreating or strafing bot can stop
* playing a forward run.
*/
function localGroundVelocity(worldDeltaX, worldDeltaZ, yawRadians, deltaSeconds) {
	const dt = finiteOr(deltaSeconds, 0);
	if (!(dt > 0)) return Object.freeze({
		forwardMps: 0,
		strafeMps: 0
	});
	const dx = finiteOr(worldDeltaX, 0) / dt;
	const dz = finiteOr(worldDeltaZ, 0) / dt;
	const yaw = finiteOr(yawRadians, 0);
	const sin = Math.sin(yaw);
	const cos = Math.cos(yaw);
	return Object.freeze({
		forwardMps: dx * -sin + dz * -cos,
		strafeMps: dx * cos + dz * -sin
	});
}
/**
* Combines a caller-declared speed with a measured direction.
*
* Every `poseOperator` call site passes a scalar speed and nothing else, and one
* of them (the frozen debug presentation route) declares a speed while the
* operator does not move at all. Taking the MAGNITUDE from the caller and the
* DIRECTION from measured motion keeps that route working while giving every
* ordinary frame a real direction - so a strafing bot gets a lateral clip
* without a single call site having to be rewritten to supply one.
*/
function directedGroundVelocity(declaredSpeedMps, measured, minimumMeasuredMps = .05) {
	const speed = Math.max(0, finiteOr(declaredSpeedMps, 0));
	const magnitude = Math.hypot(measured.forwardMps, measured.strafeMps);
	if (speed <= 0) return Object.freeze({
		forwardMps: 0,
		strafeMps: 0
	});
	if (magnitude < Math.max(0, minimumMeasuredMps)) return Object.freeze({
		forwardMps: speed,
		strafeMps: 0
	});
	const scale = speed / magnitude;
	return Object.freeze({
		forwardMps: measured.forwardMps * scale,
		strafeMps: measured.strafeMps * scale
	});
}
//#endregion
//#region src/operator-model.ts
var BOT_EMISSIVE_BRIGHTNESS_SCALE = .5;
/** Applies the global bot-only emissive budget once without dimming players. */
function applyBotEmissiveBrightness(root) {
	const materials = /* @__PURE__ */ new Set();
	root.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		const candidates = Array.isArray(node.material) ? node.material : [node.material];
		for (const material of candidates) materials.add(material);
	});
	let adjusted = 0;
	for (const material of materials) {
		if (!(material instanceof MeshStandardMaterial) && !(material instanceof MeshLambertMaterial) && !(material instanceof MeshPhongMaterial)) continue;
		const stored = material.userData.botEmissiveBaseIntensity;
		const base = typeof stored === "number" ? stored : material.emissiveIntensity;
		material.userData.botEmissiveBaseIntensity = base;
		material.emissiveIntensity = base * BOT_EMISSIVE_BRIGHTNESS_SCALE;
		adjusted += 1;
	}
	root.userData.botEmissiveBrightnessScale = BOT_EMISSIVE_BRIGHTNESS_SCALE;
	root.userData.botEmissiveMaterialsAdjusted = adjusted;
	return adjusted;
}
var OPERATOR_QUALITY_URL = "./assets/original/models/operators/pass65-third-person-operator-lod0.glb";
var OPERATOR_PERFORMANCE_URL = "./assets/original/models/operators/pass65-third-person-operator-lod1.glb";
var FIRST_PERSON_ARMS_URL = "./assets/original/models/operators/pass65-first-person-arms-lod0.glb";
/**
* ROTATION only, and deliberately so. The authored clips carry translation and
* scale channels for every digit alongside the rotation, and the old
* `(?:\.|$)` suffix admitted all three. A digit is a hinge: animating its
* translation and scale stretched the finger bones into needles that shot out
* past the weapon. It stayed hidden while the only clips ever played were brief
* one-shots and the per-frame finger reset restored quaternions (and nothing
* else), which is exactly the drift this pattern leaves behind. Admitting the
* hinge channel only is strictly narrower than before.
*/
var FIRST_PERSON_RUNTIME_FINGER_TRACK = /(?:Index|Middle|Ring|Pinky|Thumb)[123][LR]\.quaternion$/;
/**
* The authored Blender clips retain complete arm-chain motion for offline
* contact review. In the live viewmodel only digit rotation tracks are
* admitted: the shoulder, elbow and wrist are solved after animation by weapon
* socket IK (or the dedicated melee solve), so a clip can never pull a hand off
* its socket, and no digit can be translated or scaled off its knuckle.
*/
function firstPersonArmRuntimeClip(clip) {
	return new AnimationClip(clip.name, clip.duration, clip.tracks.filter((track) => FIRST_PERSON_RUNTIME_FINGER_TRACK.test(track.name)).map((track) => track.clone()), clip.blendMode);
}
/** Identical numeric bound to weapon-presentation's procedural pole cap. */
var FIRST_PERSON_ARM_AUTHORED_MAX_POLE_RADIANS = .24;
/** Identical numeric bound to weapon-presentation's procedural wrist-roll cap. */
var FIRST_PERSON_ARM_AUTHORED_MAX_WRIST_ROLL_RADIANS = .03;
/**
* Carriage is a translation of the whole shoulder entry, so it competes with
* reach and near-plane framing; it is bounded far below the pole cap.
*/
var FIRST_PERSON_ARM_AUTHORED_MAX_CARRIAGE_METERS = .05;
var FIRST_PERSON_ARM_AUTHORED_ZERO_CHANNEL = Object.freeze({
	poleRadians: 0,
	wristRollRadians: 0,
	carriageOffset: Object.freeze([
		0,
		0,
		0
	])
});
/**
* Evaluates a clip's rotation track at its last key into `target`. Missing or
* non-rotation tracks leave `target` untouched and return false, which the
* builder treats as "this clip holds bind on that joint".
*/
function clipQuatAt(clip, trackName, target) {
	const track = clip.tracks.find((candidate) => candidate.name === trackName);
	if (!(track instanceof QuaternionKeyframeTrack) || track.times.length === 0) return false;
	const base = (track.times.length - 1) * 4;
	if (track.values.length < base + 4) return false;
	target.set(track.values[base], track.values[base + 1], track.values[base + 2], track.values[base + 3]).normalize();
	return true;
}
/**
* Decomposes one clip's arm-chain hold pose into IK-layer channels for both
* sides. Pure FK math on local transforms — no bone in the scene is read or
* written beyond the bind reference supplied by `joints`, whose bones must be
* resting at their loaded bind pose when this runs (true inside
* createFirstPersonRiggedArms before any mixer action has played).
*/
function buildFirstPersonArmAuthoredPoseLayer(clips, joints) {
	const references = joints.map((joint) => ({
		side: joint.side,
		suffix: joint.side === "left" ? "L" : "R",
		shoulderToElbow: joint.elbow.position.clone(),
		elbowToWrist: joint.wrist.position.clone(),
		bindShoulder: joint.shoulder.quaternion.clone(),
		bindElbow: joint.elbow.quaternion.clone(),
		bindWrist: joint.wrist.quaternion.clone()
	}));
	const clipQuat = new Quaternion();
	const swing = new Quaternion();
	const elbowWorld = new Vector3();
	const wristWorld = new Vector3();
	const bindElbowWorld = new Vector3();
	const bindWristWorld = new Vector3();
	const axis = new Vector3();
	const bindElbowDir = new Vector3();
	const clipElbowDir = new Vector3();
	const cross = new Vector3();
	const forearmAxis = new Vector3();
	const carriage = new Vector3();
	const layer = /* @__PURE__ */ new Map();
	for (const clip of clips) {
		const sides = {};
		for (const reference of references) {
			const posedShoulder = clipQuatAt(clip, `UpperArm${reference.suffix}.quaternion`, clipQuat) ? clipQuat.clone() : reference.bindShoulder.clone();
			const posedElbow = clipQuatAt(clip, `LowerArm${reference.suffix}.quaternion`, clipQuat) ? clipQuat.clone() : reference.bindElbow.clone();
			const posedWrist = clipQuatAt(clip, `Wrist${reference.suffix}.quaternion`, clipQuat) ? clipQuat.clone() : reference.bindWrist.clone();
			elbowWorld.copy(reference.shoulderToElbow).applyQuaternion(posedShoulder);
			wristWorld.copy(reference.elbowToWrist).applyQuaternion(swing.copy(posedShoulder).multiply(posedElbow)).add(elbowWorld);
			bindElbowWorld.copy(reference.shoulderToElbow).applyQuaternion(reference.bindShoulder);
			bindWristWorld.copy(reference.elbowToWrist).applyQuaternion(swing.copy(reference.bindShoulder).multiply(reference.bindElbow)).add(bindElbowWorld);
			axis.copy(wristWorld).normalize();
			bindElbowDir.copy(bindElbowWorld).addScaledVector(axis, -bindElbowWorld.dot(axis));
			clipElbowDir.copy(elbowWorld).addScaledVector(axis, -elbowWorld.dot(axis));
			let poleRadians = 0;
			if (bindElbowDir.lengthSq() > 1e-10 && clipElbowDir.lengthSq() > 1e-10) {
				cross.crossVectors(bindElbowDir.normalize(), clipElbowDir.normalize());
				poleRadians = Math.atan2(cross.dot(axis), bindElbowDir.dot(clipElbowDir));
			}
			forearmAxis.copy(wristWorld).sub(elbowWorld);
			let wristRollRadians = 0;
			if (forearmAxis.lengthSq() > 1e-10) {
				forearmAxis.normalize();
				swing.copy(posedWrist).multiply(reference.bindWrist.clone().invert());
				wristRollRadians = 2 * Math.atan2(swing.x * forearmAxis.x + swing.y * forearmAxis.y + swing.z * forearmAxis.z, swing.w);
			}
			carriage.copy(wristWorld).sub(bindWristWorld);
			sides[reference.side] = Object.freeze({
				poleRadians,
				wristRollRadians,
				carriageOffset: Object.freeze([
					carriage.x,
					carriage.y,
					carriage.z
				])
			});
		}
		layer.set(clip.name, Object.freeze({
			left: sides.left,
			right: sides.right
		}));
	}
	return layer;
}
function clampFirstPersonArmAuthoredChannel(channel) {
	if (!channel) return FIRST_PERSON_ARM_AUTHORED_ZERO_CHANNEL;
	const [x, y, z] = channel.carriageOffset;
	const magnitude = Math.hypot(x, y, z);
	const scale = magnitude > .05 ? FIRST_PERSON_ARM_AUTHORED_MAX_CARRIAGE_METERS / magnitude : 1;
	return Object.freeze({
		poleRadians: MathUtils.clamp(channel.poleRadians, -.24, FIRST_PERSON_ARM_AUTHORED_MAX_POLE_RADIANS),
		wristRollRadians: MathUtils.clamp(channel.wristRollRadians, -.03, FIRST_PERSON_ARM_AUTHORED_MAX_WRIST_ROLL_RADIANS),
		carriageOffset: Object.freeze([
			x * scale,
			y * scale,
			z * scale
		])
	});
}
/**
* Combines the looping base pose with the active one-shot pose. The runtime
* mixer already collapses weight (updateFirstPersonArmAnimations holds the
* base at zero while a one-shot runs), so the one-shot simply overrides here;
* the consumer's exponential smoothing provides the crossfade in time.
*/
function firstPersonArmAuthoredLayerSample(layer, baseAction, oneShotAction) {
	const selected = (oneShotAction ? layer?.get(oneShotAction) : void 0) ?? (baseAction ? layer?.get(baseAction) : void 0) ?? null;
	return {
		left: clampFirstPersonArmAuthoredChannel(selected?.left),
		right: clampFirstPersonArmAuthoredChannel(selected?.right)
	};
}
function getFirstPersonArmAuthoredLayer(root) {
	return root.userData.firstPersonArmAuthoredLayer ?? null;
}
var RIGGED_OPERATOR_ARM_BONES = Object.freeze([
	Object.freeze({
		side: "left",
		role: "shoulder",
		sourceBone: "UpperArm.L",
		names: Object.freeze(["UpperArmL", "UpperArm.L"])
	}),
	Object.freeze({
		side: "left",
		role: "elbow",
		sourceBone: "LowerArm.L",
		names: Object.freeze(["LowerArmL", "LowerArm.L"])
	}),
	Object.freeze({
		side: "left",
		role: "wrist-hand",
		sourceBone: "Wrist.L",
		names: Object.freeze(["WristL", "Wrist.L"])
	}),
	Object.freeze({
		side: "right",
		role: "shoulder",
		sourceBone: "UpperArm.R",
		names: Object.freeze(["UpperArmR", "UpperArm.R"])
	}),
	Object.freeze({
		side: "right",
		role: "elbow",
		sourceBone: "LowerArm.R",
		names: Object.freeze(["LowerArmR", "LowerArm.R"])
	}),
	Object.freeze({
		side: "right",
		role: "wrist-hand",
		sourceBone: "Wrist.R",
		names: Object.freeze(["WristR", "Wrist.R"])
	})
]);
var RIGGED_OPERATOR_HAND_BONES = Object.freeze([
	Object.freeze({
		side: "left",
		digit: "thumb",
		joint: 2,
		sourceBone: "Thumb2.L",
		names: Object.freeze(["Thumb2L", "Thumb2.L"])
	}),
	Object.freeze({
		side: "left",
		digit: "index",
		joint: 2,
		sourceBone: "Index2.L",
		names: Object.freeze(["Index2L", "Index2.L"])
	}),
	Object.freeze({
		side: "left",
		digit: "middle",
		joint: 2,
		sourceBone: "Middle2.L",
		names: Object.freeze(["Middle2L", "Middle2.L"])
	}),
	Object.freeze({
		side: "left",
		digit: "ring",
		joint: 2,
		sourceBone: "Ring2.L",
		names: Object.freeze(["Ring2L", "Ring2.L"])
	}),
	Object.freeze({
		side: "left",
		digit: "pinky",
		joint: 2,
		sourceBone: "Pinky2.L",
		names: Object.freeze(["Pinky2L", "Pinky2.L"])
	}),
	Object.freeze({
		side: "right",
		digit: "thumb",
		joint: 2,
		sourceBone: "Thumb2.R",
		names: Object.freeze(["Thumb2R", "Thumb2.R"])
	}),
	Object.freeze({
		side: "right",
		digit: "index",
		joint: 2,
		sourceBone: "Index2.R",
		names: Object.freeze(["Index2R", "Index2.R"])
	}),
	Object.freeze({
		side: "right",
		digit: "middle",
		joint: 2,
		sourceBone: "Middle2.R",
		names: Object.freeze(["Middle2R", "Middle2.R"])
	}),
	Object.freeze({
		side: "right",
		digit: "ring",
		joint: 2,
		sourceBone: "Ring2.R",
		names: Object.freeze(["Ring2R", "Ring2.R"])
	}),
	Object.freeze({
		side: "right",
		digit: "pinky",
		joint: 2,
		sourceBone: "Pinky2.R",
		names: Object.freeze(["Pinky2R", "Pinky2.R"])
	})
]);
var RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS = Object.freeze({
	minimumNormalizedWeight: .05,
	minimumInfluencedVertices: 4,
	minimumMaximumNormalizedWeight: .2
});
var RIGGED_OPERATOR_ANTI_T_THRESHOLDS = Object.freeze({
	minimumVerticalDropM: .08,
	minimumVerticalDropRatio: .18,
	maximumHorizontalReachRatio: .9,
	maximumOutwardReachRatio: .82,
	minimumElbowFlexRadians: .3
});
/**
* Only clips reachable from the live operator controller belong in the runtime
* mixer. The source GLB deliberately retains the complete authored animation
* library for offline review, but binding every track of every unused clip at
* spawn time creates a multi-hundred-millisecond main-thread task.
*/
var RIGGED_OPERATOR_RUNTIME_ACTION_NAMES = Object.freeze([
	"Idle_Gun_Pointing",
	"Idle_Gun",
	"Idle_Gun_Shoot",
	"Walk",
	"Run_Shoot",
	"Run",
	"Gun_Shoot",
	"HitRecieve_2",
	"HitRecieve",
	"Death",
	"Punch_Right",
	"Kick_Right",
	"Wave"
]);
var RIGGED_OPERATOR_CORPSE_ACTION_NAMES = Object.freeze(["Death"]);
/**
* Pass 77 / HF-375. The three authored directional runs, which the corpus has
* carried since Pass 65 and the runtime has never used. Without them a bot
* retreating at 4.65 m/s or strafing at 4.05 m/s plays a FORWARD run - it
* moonwalks - because clip choice was made from a scalar speed.
*
* They are deliberately NOT in `RIGGED_OPERATOR_RUNTIME_ACTION_NAMES`. That list
* is the SPAWN-TIME prewarm budget, capped at 14 by
* `operator-appearance-catalog.test.ts` for a measured main-thread cost, and
* raising that cap without re-measuring would be weakening a gate to get green.
* These are made available to the mixer and bound lazily by `actionFor` on the
* first frame an operator actually moves sideways or backwards - one clip, once
* per operator lifetime, at the moment it is needed. Spawn cost is unchanged;
* `lazilyBoundDirectionalClips` reports what the lazy path actually cost.
*/
var RIGGED_OPERATOR_DIRECTIONAL_ACTION_NAMES = Object.freeze([
	"Run_Back",
	"Run_Left",
	"Run_Right"
]);
function riggedOperatorRuntimeClips(clips) {
	const clipsByName = new Map(clips.map((clip) => [clip.name, clip]));
	return RIGGED_OPERATOR_RUNTIME_ACTION_NAMES.flatMap((name) => {
		const clip = clipsByName.get(name);
		return clip ? [clip] : [];
	});
}
/**
* Every clip the live mixer may reach: the prewarmed controller set plus the
* lazily bound directional runs. Availability is not binding - a clip only costs
* anything once `actionFor` is asked for it.
*/
function riggedOperatorAvailableClips(clips) {
	const clipsByName = new Map(clips.map((clip) => [clip.name, clip]));
	return [...riggedOperatorRuntimeClips(clips), ...RIGGED_OPERATOR_DIRECTIONAL_ACTION_NAMES.flatMap((name) => {
		const clip = clipsByName.get(name);
		return clip ? [clip] : [];
	})];
}
var operatorAssets = {};
var firstPersonArmsAsset = null;
var operatorAssetPromise = null;
var firstPersonArmsAssetPromise = null;
/**
* HF-360: per-skin third-person operator deliveries. Every archetype GLB was
* authored on the SAME canonical rig (62 joints, 24 clips —
* pass65-third-person-operator-family-v1, verified from the binaries), so a
* skin swap is a model swap with identical animation, sockets and hit proxies.
* Assets load lazily per selected skin; nobody pays for skins nobody picked.
* The 'default' id maps to the retained pass65 operator via operatorAssets.
*/
var OPERATOR_SKIN_MODEL_URLS = Object.freeze({
	explorer: Object.freeze({
		quality: "./assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-explorer-lod0.glb",
		performance: "./assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-explorer-lod1.glb"
	}),
	symbiote: Object.freeze({
		quality: "./assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-symbiote-lod0.glb",
		performance: "./assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-symbiote-lod1.glb"
	}),
	navalops: Object.freeze({
		quality: "./assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-navalops-lod0.glb",
		performance: "./assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-navalops-lod1.glb"
	})
});
var operatorSkinAssets = /* @__PURE__ */ new Map();
var operatorSkinAssetPromises = /* @__PURE__ */ new Map();
/** Lazily loads both LODs for a non-default skin. Unknown ids resolve without
* loading anything, so a stale peer selection can never wedge deployment. */
function loadOperatorSkinAsset(skinId) {
	if (skinId === "default") return loadRiggedOperatorAsset();
	const urls = OPERATOR_SKIN_MODEL_URLS[skinId];
	if (!urls) return Promise.resolve();
	const existing = operatorSkinAssetPromises.get(skinId);
	if (existing) return existing;
	const promise = Promise.all([loadRiggedGltf(urls.quality).then((operator) => {
		const store = operatorSkinAssets.get(skinId) ?? {};
		store.quality = describeOperatorAsset(operator, 0, urls.quality);
		operatorSkinAssets.set(skinId, store);
	}), loadRiggedGltf(urls.performance).then((operator) => {
		const store = operatorSkinAssets.get(skinId) ?? {};
		store.performance = describeOperatorAsset(operator, 1, urls.performance);
		operatorSkinAssets.set(skinId, store);
	})]).then(() => void 0);
	operatorSkinAssetPromises.set(skinId, promise);
	return promise;
}
function operatorSkinAssetReady(skinId) {
	if (skinId === "default") return operatorAssets.quality !== void 0 && operatorAssets.performance !== void 0;
	const store = operatorSkinAssets.get(skinId);
	return store?.quality !== void 0 && store?.performance !== void 0;
}
var STANCE_PIVOT_HEIGHT = .84;
var EMBEDDED_WEAPON_NAME = /(^|[\s_.-])(pistol|rifle|shotgun|smg|gun|weapon)([\s_.-]|$)/i;
var PRONE_WEAPON_MOUNT = {
	carbine: {
		x: .1,
		y: .425,
		z: -.14
	},
	smg: {
		x: .09,
		y: .425,
		z: -.14
	},
	lmg: {
		x: .1,
		y: .435,
		z: -.11
	},
	scattergun: {
		x: .09,
		y: .425,
		z: -.14
	},
	sniper: {
		x: .1,
		y: .425,
		z: -.14
	},
	pistol: {
		x: .065,
		y: .45,
		z: -.23
	},
	"machine-pistol": {
		x: .065,
		y: .45,
		z: -.23
	}
};
/** The character source includes its own skinned pistol. Runtime loadouts own all visible weapons. */
function isEmbeddedWeaponObjectName(name) {
	return EMBEDDED_WEAPON_NAME.test(name.trim());
}
function suppressEmbeddedWeaponObjects(root) {
	let suppressed = 0;
	root.traverse((node) => {
		if (!isEmbeddedWeaponObjectName(node.name)) return;
		node.visible = false;
		node.userData.embeddedWeaponSuppressed = true;
		suppressed += 1;
	});
	return suppressed;
}
function riggedStanceTarget(stance) {
	if (stance === "prone") return {
		pivotHeight: .43,
		pivotPitch: -1.42,
		crouch: 0,
		prone: 1
	};
	if (stance === "crouch") return {
		pivotHeight: STANCE_PIVOT_HEIGHT,
		pivotPitch: 0,
		crouch: 1,
		prone: 0
	};
	return {
		pivotHeight: STANCE_PIVOT_HEIGHT,
		pivotPitch: 0,
		crouch: 0,
		prone: 0
	};
}
function addLocalPose(bone, x, y, z, weight) {
	if (!bone || weight <= 0) return;
	bone.quaternion.multiply(new Quaternion().setFromEuler(new Euler(x * weight, y * weight, z * weight, "XYZ")));
}
function orientBoneTowardWorld(bone, child, targetWorld) {
	bone.updateWorldMatrix(true, true);
	const origin = bone.getWorldPosition(new Vector3());
	const currentDirection = child.getWorldPosition(new Vector3()).sub(origin).normalize();
	const desiredDirection = targetWorld.clone().sub(origin).normalize();
	if (currentDirection.lengthSq() < 1e-6 || desiredDirection.lengthSq() < 1e-6) return;
	const currentWorld = bone.getWorldQuaternion(new Quaternion());
	const desiredWorld = new Quaternion().setFromUnitVectors(currentDirection, desiredDirection).multiply(currentWorld);
	const parentWorld = bone.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
	bone.quaternion.copy(parentWorld.invert().multiply(desiredWorld));
	bone.updateWorldMatrix(false, true);
}
function plantCrouchLeg(upper, lower, foot, footTarget, bendHint) {
	if (!upper || !lower || !foot || !footTarget) return;
	upper.updateWorldMatrix(true, true);
	const hip = upper.getWorldPosition(new Vector3());
	const knee = lower.getWorldPosition(new Vector3());
	const ankle = foot.getWorldPosition(new Vector3());
	const upperLength = hip.distanceTo(knee);
	const lowerLength = knee.distanceTo(ankle);
	const footWorldRotation = foot.getWorldQuaternion(new Quaternion());
	orientBoneTowardWorld(upper, lower, solveTwoBoneElbow(hip, footTarget, upperLength, lowerLength, bendHint));
	orientBoneTowardWorld(lower, foot, footTarget);
	const parentWorld = foot.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
	foot.quaternion.copy(parentWorld.invert().multiply(footWorldRotation));
	foot.updateWorldMatrix(false, true);
}
function applyStancePose(runtimeState, dt) {
	const target = riggedStanceTarget(runtimeState.stance);
	const alpha = 1 - Math.exp(-Math.max(0, dt) * 12);
	runtimeState.crouchBlend = MathUtils.lerp(runtimeState.crouchBlend, target.crouch, alpha);
	runtimeState.proneBlend = MathUtils.lerp(runtimeState.proneBlend, target.prone, alpha);
	const proneAdjustment = runtimeState.stance === "prone" && runtimeState.proneClearance ? proneStanceAdjustment(runtimeState.proneClearance) : null;
	runtimeState.stancePivot.position.y = MathUtils.lerp(runtimeState.stancePivot.position.y, target.pivotHeight, alpha);
	runtimeState.stancePivot.position.z = MathUtils.lerp(runtimeState.stancePivot.position.z, proneAdjustment ? proneAdjustment.slideM : 0, alpha);
	runtimeState.stancePivot.rotation.x = MathUtils.lerp(runtimeState.stancePivot.rotation.x, proneAdjustment ? target.pivotPitch * proneAdjustment.pitchScale : target.pivotPitch, alpha);
	const sprint = runtimeState.stance === "stand" ? MathUtils.smoothstep(runtimeState.speed, 3.2, 6.8) : 0;
	const proneMount = PRONE_WEAPON_MOUNT[String(runtimeState.weaponSocket.children[0]?.userData.weaponId ?? "carbine")] ?? PRONE_WEAPON_MOUNT.carbine;
	const weaponX = runtimeState.stance === "prone" ? proneMount.x : 0;
	const weaponY = runtimeState.stance === "prone" ? proneMount.y : runtimeState.stance === "crouch" ? .82 : MathUtils.lerp(1.31, 1.14, sprint);
	const weaponZ = runtimeState.stance === "prone" ? proneMount.z : MathUtils.lerp(-.18, -.08, sprint);
	runtimeState.weaponSocket.position.x = MathUtils.lerp(runtimeState.weaponSocket.position.x, weaponX, alpha);
	runtimeState.weaponSocket.position.y = MathUtils.lerp(runtimeState.weaponSocket.position.y, weaponY, alpha);
	runtimeState.weaponSocket.position.z = MathUtils.lerp(runtimeState.weaponSocket.position.z, weaponZ, alpha);
	runtimeState.weaponSocket.rotation.x = MathUtils.lerp(runtimeState.weaponSocket.rotation.x, -.2 * sprint, alpha);
	runtimeState.weaponSocket.rotation.z = MathUtils.lerp(runtimeState.weaponSocket.rotation.z, -.08 * sprint, alpha);
	const crouch = runtimeState.crouchBlend;
	const prone = runtimeState.proneBlend;
	const bones = runtimeState.poseBones;
	const leftFootTarget = crouch > .001 ? bones.footLeft?.getWorldPosition(new Vector3()) ?? null : null;
	const rightFootTarget = crouch > .001 ? bones.footRight?.getWorldPosition(new Vector3()) ?? null : null;
	if (bones.hips) bones.hips.position.y -= .44 * crouch;
	addLocalPose(bones.hips, .05, 0, 0, crouch);
	addLocalPose(bones.abdomen, .08, 0, 0, crouch);
	addLocalPose(bones.torso, .12, 0, 0, crouch);
	addLocalPose(bones.chest, -.05, 0, 0, crouch);
	if (crouch > .001) {
		runtimeState.visual.updateWorldMatrix(true, true);
		const bodyRotation = runtimeState.stancePivot.getWorldQuaternion(new Quaternion());
		const forward = new Vector3(0, 0, -1).applyQuaternion(bodyRotation);
		const right = new Vector3(1, 0, 0).applyQuaternion(bodyRotation);
		plantCrouchLeg(bones.upperLegLeft, bones.lowerLegLeft, bones.footLeft, leftFootTarget, forward.clone().addScaledVector(right, -.18));
		plantCrouchLeg(bones.upperLegRight, bones.lowerLegRight, bones.footRight, rightFootTarget, forward.clone().addScaledVector(right, .18));
	}
	addLocalPose(bones.chest, -.025, 0, 0, prone);
}
/**
* HF-366: the operator body carries the SELECTED SKIN, not one fixed team paint.
*
* Measured at HEAD before this change, from the running build: all four skin
* GLBs load correctly and then arrive here sharing the canonical material names
* (`Swat`, `Swat_Black`, `Visor`, `Skin`), so the old exact-name branches below
* stamped identical colours on every one of them - `Swat` came out #2d7882 for
* default, explorer, symbiote AND navalops. Four different multi-megabyte
* deliveries, one colour. "They all looked greyed out" was the correct report.
*
* The team is still applied, as a bounded wash over the skin's own colour
* (`operatorBodyColour`), so aqua and coral stay separable at range. The
* `lift` term exists because two of the four skins ship a garment atlas whose
* mean is ~40/255: no multiply tint, not even white, can make those read as a
* colour, so a small flat palette-hued fill does the part multiply cannot.
*
* `showcase` is the menu's appearance: no team wash at all, because a player
* looking at their own operator in the OPERATOR panel is not on a team yet and
* should see the skin they are actually buying into.
*/
function skinPaintedBodyMaterial(result, role, team, appearance, skinId, flattenMaterials) {
	const body = operatorSkinPalette(skinId).body;
	const colour = appearance === "showcase" ? body[role] : operatorBodyColour(skinId, team === 0 ? 0 : 1, role);
	result.color.setHex(colour);
	result.emissive.setHex(colour);
	const lift = role === "grey" ? body.lift * .6 : body.lift;
	result.emissiveIntensity = flattenMaterials ? lift * 1.35 : lift;
	if (role === "swat") result.roughness = body.swatRoughness;
	else if (role === "swatBlack") result.roughness = body.swatBlackRoughness;
}
function materialForTeam(material, team, flattenMaterials, appearance = "team", skinId = "default") {
	if (!(material instanceof MeshStandardMaterial)) return material.clone();
	const result = material.clone();
	const name = material.name.toLowerCase();
	if (appearance === "neon-purple" && name === "swat") {
		result.color.setHex(14179583);
		result.emissive.setHex(8197821);
		result.emissiveIntensity = 1.2;
		result.roughness = .46;
		result.metalness = .08;
	} else if (appearance === "neon-purple" && name.includes("swat_black")) {
		result.color.setHex(11091199);
		result.emissive.setHex(6098088);
		result.emissiveIntensity = 1.05;
		result.roughness = .5;
		result.metalness = .06;
	} else if (appearance === "neon-purple" && name.includes("grey")) {
		result.color.setHex(14919167);
		result.emissive.setHex(6558110);
		result.emissiveIntensity = .72;
		result.roughness = .54;
		result.metalness = .04;
	} else if (name === "swat") skinPaintedBodyMaterial(result, "swat", team, appearance, skinId, flattenMaterials);
	else if (name.includes("swat_black")) skinPaintedBodyMaterial(result, "swatBlack", team, appearance, skinId, flattenMaterials);
	else if (name.includes("grey")) skinPaintedBodyMaterial(result, "grey", team, appearance, skinId, flattenMaterials);
	else if (name === "visor") {
		if (result.map) {
			result.userData.authoredVisorBaseColorMap = result.map;
			result.map = null;
		}
		result.color.setHex(operatorSkinPalette(skinId).body.visor);
	}
	if (flattenMaterials && appearance !== "neon-purple") {
		if (name !== "swat" && !name.includes("swat_black")) result.roughness = 1;
		result.metalness = 0;
	}
	return result;
}
/**
* One operator owns one mutable material set, but meshes inside that operator
* which referenced the same authored source material should continue sharing a
* single clone. Cloning per mesh multiplied material objects during every bot
* and corpse build, while sharing across operators would make independent
* fenced retirement unsafe.
*/
function createOperatorInstanceMaterialResolver(team, flattenMaterials, appearance = "team", skinId = "default") {
	const instanceMaterials = /* @__PURE__ */ new Map();
	return (material) => {
		const existing = instanceMaterials.get(material);
		if (existing) return existing;
		const result = materialForTeam(material, team, flattenMaterials, appearance, skinId);
		result.transparent = false;
		result.opacity = 1;
		result.depthWrite = true;
		result.depthTest = true;
		result.alphaTest = 0;
		instanceMaterials.set(material, result);
		return result;
	};
}
var FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY = .18;
function firstPersonArmMaterialReadabilityProfile(materialName) {
	const normalized = materialName.toLowerCase();
	if (normalized === "skin") return Object.freeze({
		emissive: 2364943,
		emissiveIntensity: .08
	});
	if (normalized.includes("arms_glove") || normalized.includes("arms_fingerglove")) return Object.freeze({
		emissive: 1585720,
		emissiveIntensity: .14
	});
	if (normalized.includes("arms_sleeve")) return Object.freeze({
		emissive: 1321776,
		emissiveIntensity: .12
	});
	if (normalized.includes("arms_armorpad")) return Object.freeze({
		emissive: 1519412,
		emissiveIntensity: .1
	});
	return null;
}
/**
* Classifies one authored arm material into the role the skin palette paints.
* Exported because the skin -> arm resolution is the testable half of HF-366:
* a renamed or newly added arm material that falls through to null would be
* left untinted and would visibly disagree with the menu portrait.
*/
function firstPersonArmMaterialRole(materialName) {
	const normalized = materialName.toLowerCase();
	if (normalized === "skin") return "skin";
	if (normalized.includes("arms_fingerglove")) return "finger-glove";
	if (normalized.includes("arms_glove")) return "glove";
	if (normalized.includes("arms_sleeve")) return "sleeve";
	if (normalized.includes("arms_wristaccent") || normalized.includes("arms_armorpad")) return "accent";
	return null;
}
var FIRST_PERSON_ARM_SKIN_CONTRACT = "measured-albedo-aware-arm-skin-v2";
Object.freeze(["sleeve", "glove"]);
/**
* The hand island is bare skin. Tinting it to the palette's glove colour at
* full strength turned the player's own hands grey-blue; a partial wash keeps
* flesh reading as flesh while still shifting with the skin.
*/
var FIRST_PERSON_ARM_HAND_TINT_BLEND = .42;
/** sRGB luminance the arm's two largest regions are re-based onto. */
var FIRST_PERSON_ARM_TARGET_SRGB_LUMINANCE = Object.freeze({
	sleeve: .35,
	glove: .28
});
/**
* Chroma restoration applied while re-basing onto the luminance target.
* 1.4 left the tightest produced pair (default vs navalops sleeve) at
* 40/255 sRGB separation - below the four-skin separability contract's
* 0.16 floor (operator-model.test.ts). 1.45 puts that pair at 44/255
* (0.1725) with no channel clamped on any skin or role, so the exact
* luminance landing is preserved.
*/
var FIRST_PERSON_ARM_CHROMA_GAIN = 1.45;
/**
* HF-388 follow-up: why the arm had no weave, wrinkle or material character
* even after its albedo was corrected.
*
* The crushed-albedo fix above drops the base-colour map for sleeve and glove
* and keeps the normal (1.0 MB) and roughness (0.5 MB) maps, on the stated
* grounds that they are "where the weave, wrinkles and seams actually live".
* They are - but MEASURED live on the shipped GLB 2026-08-25, the authored
* materials arrive with `normalScale` 0.68-0.72, i.e. the asset itself
* attenuates that detail to about seven tenths before it is ever shaded. With
* the base-colour map deliberately removed, the normal map is now the ONLY
* spatial signal the sleeve has, and it was being delivered at a discount.
*
* That is the second half of "a bright, nearly featureless pale shape": the
* first half was the viewmodel fill's white specular veil
* (FIRST_PERSON_VIEWMODEL_FILL_INTENSITY), and with the veil reduced the
* detail underneath still has to be strong enough to read at arm's length.
*
* Verified by sweep on real WebGPU at Nuke Town sunset, over arm pixels only,
* measuring mean absolute one-pixel luminance step BETWEEN neighbouring arm
* pixels - a silhouette-free local-detail term, because a limb under a broad
* gradient keeps a healthy stdDev while being locally flat:
*     authored 0.72 -> 8.42     2.4 -> 9.24     3.2 -> 9.85     4.0 -> 9.69
* Frames were read, not just the numbers: at the authored value the sleeve is
* a smooth latex tube, at 2.4 it carries fabric folds and creases, and by 4.0
* it starts to look ropey and synthetic. 2.4 is the value that reads as cloth.
*
* The geometry supports this honestly - the arm meshes ship `tangent` and
* `uv1` attributes, so this is a real tangent-space normal map being turned up
* to full strength, not a flat surface being faked.
*/
var FIRST_PERSON_ARM_NORMAL_SCALE = 2.4;
function srgbChannels(hex) {
	return [
		(hex >> 16 & 255) / 255,
		(hex >> 8 & 255) / 255,
		(hex & 255) / 255
	];
}
function srgbLuminance(channels) {
	return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
/**
* Re-bases one palette arm colour onto the first-person luminance target,
* preserving (and gaining) its chroma. Returns an sRGB hex, because that is
* the space the palette is authored in and the space the separability gate
* judges; `THREE.Color.setHex` converts to linear on the way in.
*
* The chroma offsets sum to zero luminance by construction, so the result
* lands on the target EXACTLY - as long as no channel is clamped. A clamp
* would silently push the surface back up in value, which is the failure being
* fixed, so the gain is capped per colour at whatever that colour can take
* instead. Only the explorer sleeve is anywhere near that cap; every other
* arm colour takes the full gain.
*/
function firstPersonArmSkinAlbedo(paletteHex, role) {
	const channels = srgbChannels(paletteHex);
	const grey = srgbLuminance(channels);
	const target = FIRST_PERSON_ARM_TARGET_SRGB_LUMINANCE[role];
	const offsets = channels.map((channel) => channel - grey);
	const admissibleGain = offsets.reduce((limit, offset) => {
		if (Math.abs(offset) < 1e-6) return limit;
		const headroom = offset < 0 ? target : 1 - target;
		return Math.min(limit, headroom / Math.abs(offset));
	}, FIRST_PERSON_ARM_CHROMA_GAIN);
	const gain = Math.max(1, Math.min(FIRST_PERSON_ARM_CHROMA_GAIN, admissibleGain));
	return offsets.reduce((hex, offset) => hex << 8 | Math.round(Math.max(0, Math.min(1, target + offset * gain)) * 255), 0);
}
var armHandTintScratch = new Color();
/**
* HF-366: paints one already-cloned arm material with the selected skin.
*
* The tint MULTIPLIES the authored base-colour map, so the licensed albedo,
* normal and ORM detail survives and only the hue/response changes. This is
* the honest limit of what the shipped assets allow: the arms GLB has no
* per-skin variant and each skin's own atlas is UV-mapped for the full body,
* so sampling it through arm UVs would land on legs and webbing.
*/
function applyFirstPersonArmSkinMaterial(material, materialName, skinId) {
	if (!(material instanceof MeshStandardMaterial)) return false;
	const role = firstPersonArmMaterialRole(materialName);
	if (role === null || role === "skin") return false;
	const palette = operatorSkinPalette(skinId).arm;
	if (material.normalMap !== null) material.normalScale.set(FIRST_PERSON_ARM_NORMAL_SCALE, FIRST_PERSON_ARM_NORMAL_SCALE);
	if (role === "sleeve" || role === "glove") {
		material.color.setHex(firstPersonArmSkinAlbedo(role === "sleeve" ? palette.sleeve : palette.glove, role));
		material.roughness = role === "sleeve" ? palette.sleeveRoughness : palette.gloveRoughness;
		material.metalness = 0;
		if (material.map !== null) {
			material.userData.authoredArmBaseColorMap = material.map;
			material.map = null;
			material.needsUpdate = true;
		}
	} else if (role === "finger-glove") {
		armHandTintScratch.setHex(palette.fingerGlove);
		material.color.setRGB(1 + (armHandTintScratch.r - 1) * FIRST_PERSON_ARM_HAND_TINT_BLEND, 1 + (armHandTintScratch.g - 1) * FIRST_PERSON_ARM_HAND_TINT_BLEND, 1 + (armHandTintScratch.b - 1) * FIRST_PERSON_ARM_HAND_TINT_BLEND);
		material.roughness = .86;
		material.metalness = 0;
	} else {
		material.color.setHex(palette.accent);
		material.metalness = palette.accentMetalness;
		material.emissive.setHex(palette.accentEmissive);
		material.emissiveIntensity = Math.min(.16, FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY);
	}
	return true;
}
/**
* Repaints a live first-person arms root for a new skin selection. Materials
* are per-instance clones (materialForFirstPerson clones every source), so this
* mutates only the caller's own arms and never the shared authored asset.
*/
function applyFirstPersonArmSkin(root, skinId) {
	let painted = 0;
	const seen = /* @__PURE__ */ new Set();
	root.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		const materials = Array.isArray(node.material) ? node.material : [node.material];
		for (const material of materials) {
			if (seen.has(material)) continue;
			seen.add(material);
			if (applyFirstPersonArmSkinMaterial(material, String(material.userData.authoredArmMaterialName ?? material.name), skinId)) painted += 1;
		}
	});
	root.userData.firstPersonArmSkinId = skinId;
	root.userData.firstPersonArmSkinContract = FIRST_PERSON_ARM_SKIN_CONTRACT;
	root.userData.firstPersonArmSkinPaintedMaterials = painted;
	return painted;
}
function materialForFirstPerson(material, flattenMaterials, skinId) {
	const result = materialForTeam(material, 0, flattenMaterials);
	const profile = firstPersonArmMaterialReadabilityProfile(material.name);
	if (result instanceof MeshStandardMaterial && profile) {
		result.emissive.setHex(profile.emissive);
		result.emissiveIntensity = Math.min(profile.emissiveIntensity, FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY);
		if (profile.color !== void 0) result.color.setHex(profile.color);
	}
	if (result instanceof MeshStandardMaterial && material.name.toLowerCase() === "skin") {
		result.roughness = .92;
		result.metalness = 0;
	}
	result.userData.authoredArmMaterialName = material.name;
	applyFirstPersonArmSkinMaterial(result, material.name, skinId);
	return result;
}
var loadRiggedGltf = (url) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
function describeOperatorAsset(operator, lod, source) {
	let skinnedMeshes = 0;
	const pbrMaterials = /* @__PURE__ */ new Set();
	operator.scene.traverse((node) => {
		if (node instanceof SkinnedMesh) skinnedMeshes += 1;
		if (!(node instanceof Mesh)) return;
		const materials = Array.isArray(node.material) ? node.material : [node.material];
		for (const material of materials) if (material instanceof MeshStandardMaterial && material.map && material.normalMap && material.roughnessMap && material.metalnessMap) pbrMaterials.add(material);
	});
	return {
		scene: operator.scene,
		clips: operator.animations,
		lod,
		source,
		skinnedMeshes,
		pbrMaterials: pbrMaterials.size
	};
}
var FIRST_PERSON_ARM_GIRTH_CONTRACT = "authored-normal-shell-limb-girth-v1";
/**
* HF-365 ("the arms are thin"): metres of radius added along the authored
* vertex normals, per material role, in the arms GLB's own local units.
*
* A normal-offset shell is the one girth operation that leaves EVERYTHING else
* the release gates depend on untouched: no bone is scaled (the reviewed
* "no skinned bone receives scale or length mutation" contract holds), no
* segment length changes, no socket, palm contact or knife mount moves, and
* the skin weights are the authored ones because only positions move. Fingers
* take a much smaller shell than the sleeve so digits thicken without fusing.
*
* HF-354 previously recorded arm thickness as correct. The owner played the
* Pass 76 candidate and said the opposite, so that status is superseded here.
*/
var FIRST_PERSON_ARM_GIRTH_METRES = Object.freeze({
	sleeve: .0172,
	accent: .0148,
	glove: .0112,
	"finger-glove": .0031,
	skin: .0031
});
var ARM_GIRTH_APPLIED_KEY = "firstPersonArmGirthMetres";
/**
* Thickens the shared authored arm geometry exactly once. SkeletonUtils.clone
* SHARES geometry between every arms instance, so inflating per instance would
* compound the shell on every viewmodel build; the applied amount is stamped on
* the geometry and re-entry is a no-op.
*/
function inflateFirstPersonArmGirth(root) {
	let inflated = 0;
	const done = /* @__PURE__ */ new Set();
	root.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		const geometry = node.geometry;
		if (done.has(geometry)) return;
		done.add(geometry);
		if (typeof geometry.userData[ARM_GIRTH_APPLIED_KEY] === "number") return;
		const roles = (Array.isArray(node.material) ? node.material : [node.material]).map((material) => firstPersonArmMaterialRole(material.name)).filter((role) => role !== null);
		if (roles.length !== 1) return;
		const girth = FIRST_PERSON_ARM_GIRTH_METRES[roles[0]];
		const position = geometry.getAttribute("position");
		const normal = geometry.getAttribute("normal");
		if (!position || !normal || position.count !== normal.count) return;
		const shelled = new Float32Array(position.count * 3);
		for (let index = 0; index < position.count; index += 1) {
			shelled[index * 3] = position.getX(index) + normal.getX(index) * girth;
			shelled[index * 3 + 1] = position.getY(index) + normal.getY(index) * girth;
			shelled[index * 3 + 2] = position.getZ(index) + normal.getZ(index) * girth;
		}
		geometry.setAttribute("position", new BufferAttribute(shelled, 3));
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		geometry.userData[ARM_GIRTH_APPLIED_KEY] = girth;
		geometry.userData.firstPersonArmGirthContract = FIRST_PERSON_ARM_GIRTH_CONTRACT;
		inflated += 1;
	});
	return inflated;
}
function loadFirstPersonArmsAsset() {
	if (firstPersonArmsAsset) return Promise.resolve();
	firstPersonArmsAssetPromise ??= loadRiggedGltf(FIRST_PERSON_ARMS_URL).catch((error) => {
		firstPersonArmsAssetPromise = null;
		throw error;
	}).then((arms) => {
		inflateFirstPersonArmGirth(arms.scene);
		firstPersonArmsAsset = {
			scene: arms.scene,
			clips: arms.animations
		};
	});
	return firstPersonArmsAssetPromise;
}
function loadRiggedOperatorAsset() {
	if (operatorAssets.quality && operatorAssets.performance && firstPersonArmsAsset) return Promise.resolve();
	if (operatorAssetPromise) return operatorAssetPromise;
	operatorAssetPromise = Promise.all([
		operatorAssets.quality ? Promise.resolve() : loadRiggedGltf(OPERATOR_QUALITY_URL).then((operator) => {
			operatorAssets.quality = describeOperatorAsset(operator, 0, OPERATOR_QUALITY_URL);
		}),
		operatorAssets.performance ? Promise.resolve() : loadRiggedGltf(OPERATOR_PERFORMANCE_URL).then((operator) => {
			operatorAssets.performance = describeOperatorAsset(operator, 1, OPERATOR_PERFORMANCE_URL);
		}),
		loadFirstPersonArmsAsset()
	]).then(() => void 0).catch((error) => {
		operatorAssetPromise = null;
		throw error;
	});
	return operatorAssetPromise;
}
function riggedOperatorAssetReady() {
	return operatorAssets.quality !== void 0 && operatorAssets.performance !== void 0 && firstPersonArmsAsset !== null;
}
/**
* Audits the exported scene in world space. Local bone translations are not a
* handedness signal because the GLB owns parent rotations and scale. The Pass
* 65 delivery already resolves its right chain to camera-positive X; reflecting
* the runtime root a second time crossed both shoulders and inverted tangents.
*/
function firstPersonArmHandedness(visual) {
	visual.updateWorldMatrix(true, true);
	const right = visual.getObjectByName("UpperArmR");
	const left = visual.getObjectByName("UpperArmL");
	const rightShoulderX = right?.getWorldPosition(new Vector3()).x ?? NaN;
	const leftShoulderX = left?.getWorldPosition(new Vector3()).x ?? NaN;
	const shoulderSeparation = rightShoulderX - leftShoulderX;
	const visualDeterminant = visual.matrixWorld.determinant();
	return Object.freeze({
		contract: "authored-positive-determinant-right-on-positive-x-v1",
		valid: Number.isFinite(rightShoulderX) && Number.isFinite(leftShoulderX) && shoulderSeparation > .05 && visualDeterminant > 0,
		rightShoulderX,
		leftShoulderX,
		shoulderSeparation,
		visualDeterminant
	});
}
function createFirstPersonRiggedArms(flattenMaterials, skinId = "default") {
	if (!firstPersonArmsAsset) return null;
	const root = new Group();
	root.name = "first-person-arms";
	const visual = clone(firstPersonArmsAsset.scene);
	visual.name = "authored-first-person-arms-visual";
	visual.scale.set(1, 1, 1);
	visual.position.set(0, 0, 0);
	const handedness = firstPersonArmHandedness(visual);
	if (!handedness.valid) return null;
	visual.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		node.castShadow = false;
		node.receiveShadow = false;
		node.frustumCulled = false;
		const prepare = (material) => {
			const result = materialForFirstPerson(material, flattenMaterials, skinId);
			result.transparent = false;
			result.opacity = 1;
			result.depthWrite = true;
			result.side = 0;
			return result;
		};
		if (Array.isArray(node.material)) node.material = node.material.map(prepare);
		else node.material = prepare(node.material);
	});
	root.add(visual);
	const chain = (side) => {
		const suffix = side === "left" ? "L" : "R";
		const shoulder = visual.getObjectByName(`UpperArm${suffix}`);
		const elbow = visual.getObjectByName(`LowerArm${suffix}`);
		const wrist = visual.getObjectByName(`Wrist${suffix}`);
		const finger = visual.getObjectByName(`Index1${suffix}`);
		const palmContact = visual.getObjectByName(`${side}-palm-contact`);
		let palmAncestor = palmContact?.parent ?? null;
		while (palmAncestor && palmAncestor !== wrist) palmAncestor = palmAncestor.parent;
		return shoulder instanceof Bone && elbow instanceof Bone && wrist instanceof Bone && finger instanceof Bone && palmContact !== void 0 && palmAncestor === wrist && palmContact.userData.positive_determinant === true && palmContact.userData.palm_forward_axis === "+Y" && palmContact.userData.palm_up_axis === "+Z" ? {
			shoulder,
			elbow,
			wrist,
			finger,
			palmContact,
			side
		} : null;
	};
	const chains = [chain("right"), chain("left")].filter((value) => value !== null);
	const fingers = [];
	const digitNames = [
		"Index",
		"Middle",
		"Ring",
		"Pinky",
		"Thumb"
	];
	for (const [suffix, side] of [["L", "left"], ["R", "right"]]) for (const digitName of digitNames) for (const joint of [
		1,
		2,
		3
	]) {
		const bone = visual.getObjectByName(`${digitName}${joint}${suffix}`);
		if (bone instanceof Bone) fingers.push({
			bone,
			bindQuaternion: bone.quaternion.clone(),
			bindPosition: bone.position.clone(),
			bindScale: bone.scale.clone(),
			side,
			digit: digitName.toLowerCase(),
			joint
		});
	}
	const knifeSocket = visual.getObjectByName("right-wrist-knife-socket");
	const rightWrist = visual.getObjectByName("WristR");
	let knifeAncestor = knifeSocket?.parent ?? null;
	while (knifeAncestor && knifeAncestor !== rightWrist) knifeAncestor = knifeAncestor.parent;
	if (!knifeSocket || !(rightWrist instanceof Bone) || knifeAncestor !== rightWrist || fingers.length !== 30) return null;
	const mixer = new AnimationMixer(visual);
	const runtimeClips = firstPersonArmsAsset.clips.map(firstPersonArmRuntimeClip);
	const authoredTrackCount = firstPersonArmsAsset.clips.reduce((count, clip) => count + clip.tracks.length, 0);
	const runtimeTrackCount = runtimeClips.reduce((count, clip) => count + clip.tracks.length, 0);
	const actions = new Map(runtimeClips.map((clip) => [clip.name, mixer.clipAction(clip)]));
	root.userData.firstPersonArmAuthoredLayer = buildFirstPersonArmAuthoredPoseLayer(firstPersonArmsAsset.clips, chains.map((entry) => ({
		side: entry.side,
		shoulder: entry.shoulder,
		elbow: entry.elbow,
		wrist: entry.wrist
	})));
	root.userData.firstPersonArmsRuntime = {
		mixer,
		actions,
		activeAction: null,
		baseAction: null
	};
	root.userData.firstPersonArmSkinId = skinId;
	root.userData.firstPersonArmSkinContract = FIRST_PERSON_ARM_SKIN_CONTRACT;
	root.userData.firstPersonArmGirthContract = FIRST_PERSON_ARM_GIRTH_CONTRACT;
	root.userData.importedFirstPersonArms = false;
	root.userData.authoredFirstPersonArms = true;
	root.userData.firstPersonArmsSource = FIRST_PERSON_ARMS_URL;
	root.userData.materialContract = "opaque-depth-writing";
	root.userData.firstPersonArmSurfaceContract = "front-face-authored-pbr-v1";
	root.userData.firstPersonArmHandedness = handedness;
	root.userData.importedFirstPersonArmChains = chains.length;
	root.userData.authoredAnimationClipCount = actions.size;
	root.userData.authoredAnimationBlendPolicy = "finger-tracks-first-runtime-ik-last";
	root.userData.authoredAnimationTrackPolicy = "finger-bones-only";
	root.userData.authoredAnimationTrackCount = runtimeTrackCount;
	root.userData.authoredUpperChainTracksExcluded = authoredTrackCount - runtimeTrackCount;
	root.userData.authoredKnifeSocket = knifeSocket.name;
	root.userData.authoredPalmContactContract = "full-transform-positive-determinant-plus-y-forward-plus-z-up-v1";
	root.userData.authoredPalmContacts = chains.map((entry) => entry.palmContact.name);
	return {
		root,
		chains,
		fingers,
		knifeSocket
	};
}
function firstPersonArmsRuntime(root) {
	return root.userData.firstPersonArmsRuntime ?? null;
}
/**
* Restores the COMPLETE authored digit transform each frame, not only the
* rotation. The runtime clip filter already refuses translation and scale
* channels; this is the second guard, so a future asset that smuggles one in
* cannot leave a finger drifted off its knuckle.
*/
function resetFirstPersonArmFingers(fingers) {
	for (const finger of fingers) {
		finger.bone.quaternion.copy(finger.bindQuaternion);
		finger.bone.position.copy(finger.bindPosition);
		finger.bone.scale.copy(finger.bindScale);
	}
}
Object.freeze([
	"idle",
	"walk",
	"sprint"
]);
/**
* Selects the looping locomotion clip for a movement state. Pure so the
* mapping is testable without a mixer.
*/
function firstPersonArmBaseActionFor(moving, sprinting) {
	if (sprinting) return "sprint";
	return moving ? "walk" : "idle";
}
/**
* Crossfades the looping locomotion clip underneath the one-shots. Returns the
* action that is now the base, or null when the asset does not carry it.
*/
function setFirstPersonArmBaseAction(root, actionName) {
	const runtime = firstPersonArmsRuntime(root);
	const action = runtime?.actions.get(actionName);
	if (!runtime || !action) return null;
	if (runtime.baseAction === actionName) return actionName;
	const previous = runtime.baseAction ? runtime.actions.get(runtime.baseAction) : void 0;
	action.reset().setLoop(LoopRepeat, Infinity);
	action.clampWhenFinished = false;
	action.enabled = true;
	action.play();
	if (previous && previous !== action) previous.crossFadeTo(action, .18, false);
	else action.fadeIn(.18);
	runtime.baseAction = actionName;
	return actionName;
}
function playFirstPersonArmAction(root, actionName) {
	const runtime = firstPersonArmsRuntime(root);
	const action = runtime?.actions.get(actionName);
	if (!runtime || !action) return false;
	const previousOneShot = runtime.activeAction ? runtime.actions.get(runtime.activeAction) : void 0;
	if (previousOneShot && previousOneShot !== action) previousOneShot.stop();
	action.reset().setLoop(LoopOnce, 1);
	action.clampWhenFinished = false;
	action.setEffectiveWeight(1);
	action.play();
	runtime.activeAction = actionName;
	return true;
}
function updateFirstPersonArmAnimations(root, dt) {
	const runtime = firstPersonArmsRuntime(root);
	if (!runtime) return;
	const oneShot = runtime.activeAction ? runtime.actions.get(runtime.activeAction) : void 0;
	const base = runtime.baseAction ? runtime.actions.get(runtime.baseAction) : void 0;
	if (base) base.setEffectiveWeight(oneShot?.isRunning() === true ? 0 : 1);
	runtime.mixer.update(Math.min(.05, Math.max(0, dt)));
	if (runtime.activeAction && runtime.actions.get(runtime.activeAction)?.isRunning() !== true) runtime.activeAction = null;
}
/** Clears a retained first-person action without advancing its mixer clock. */
function resetFirstPersonArmAnimations(root) {
	const runtime = firstPersonArmsRuntime(root);
	if (!runtime) return;
	runtime.mixer.stopAllAction();
	for (const action of runtime.actions.values()) action.stop();
	runtime.mixer.setTime(0);
	runtime.activeAction = null;
	runtime.baseAction = null;
}
function firstPersonArmAnimationState(root) {
	if (!root) return null;
	const runtime = firstPersonArmsRuntime(root);
	if (!runtime) return null;
	return Object.freeze({
		clips: runtime.actions.size,
		activeAction: runtime.activeAction,
		baseAction: runtime.baseAction,
		skinId: String(root.userData.firstPersonArmSkinId ?? "default"),
		blendPolicy: String(root.userData.authoredAnimationBlendPolicy ?? "unknown"),
		trackPolicy: String(root.userData.authoredAnimationTrackPolicy ?? "unknown"),
		runtimeTracks: Number(root.userData.authoredAnimationTrackCount ?? 0),
		upperChainTracksExcluded: Number(root.userData.authoredUpperChainTracksExcluded ?? 0)
	});
}
function runtime$1(root) {
	return root.userData.riggedOperatorRuntime;
}
function canonicalEvidenceManifest(evidence) {
	if (evidence.manifest) return evidence.manifest;
	const skinnedMeshes = Object.freeze(evidence.skinnedMeshes.map((mesh) => {
		const boneIndices = new Map(mesh.skeleton.bones.map((bone, index) => [bone, index]));
		const position = mesh.geometry.getAttribute("position");
		const skinIndex = mesh.geometry.getAttribute("skinIndex");
		const skinWeight = mesh.geometry.getAttribute("skinWeight");
		return Object.freeze({
			name: mesh.name,
			uuid: mesh.uuid,
			geometryUuid: mesh.geometry.uuid,
			positionCount: position?.count ?? -1,
			skinIndexCount: skinIndex?.count ?? -1,
			skinIndexItemSize: skinIndex?.itemSize ?? -1,
			skinIndexNormalized: skinIndex?.normalized ?? false,
			skinWeightCount: skinWeight?.count ?? -1,
			skinWeightItemSize: skinWeight?.itemSize ?? -1,
			skinWeightNormalized: skinWeight?.normalized ?? false,
			skeletonBones: Object.freeze(mesh.skeleton.bones.map((bone, index) => Object.freeze({
				index,
				name: bone.name,
				uuid: bone.uuid,
				parentIndex: bone.parent instanceof Bone ? boneIndices.get(bone.parent) ?? -1 : -1
			})))
		});
	}));
	evidence.manifest = Object.freeze({
		contract: "runtime-canonical-operator-skin-manifest-v1",
		assetUrl: evidence.assetUrl,
		lod: evidence.lod,
		visual: Object.freeze({
			name: evidence.visual.name,
			uuid: evidence.visual.uuid
		}),
		skinnedMeshes,
		wrists: Object.freeze(["left", "right"].flatMap((side) => {
			const wrist = evidence.wrists[side];
			return wrist ? [Object.freeze({
				side,
				name: wrist.name,
				uuid: wrist.uuid
			})] : [];
		}))
	});
	return evidence.manifest;
}
function riggedOperatorCanonicalEvidenceManifest(root) {
	const evidence = runtime$1(root)?.canonicalEvidence;
	return evidence ? canonicalEvidenceManifest(evidence) : null;
}
function riggedOperatorHandEvidenceIdentity(root, side) {
	const runtimeState = runtime$1(root);
	const wrist = runtimeState?.canonicalEvidence.wrists[side];
	if (!runtimeState || !wrist || runtimeState.canonicalEvidence.skinnedMeshes.length === 0) return null;
	const manifest = canonicalEvidenceManifest(runtimeState.canonicalEvidence);
	return Object.freeze({
		operatorRoot: root,
		visual: runtimeState.canonicalEvidence.visual,
		side,
		wrist,
		skinnedMeshes: runtimeState.canonicalEvidence.skinnedMeshes,
		manifest
	});
}
function resolveRiggedOperatorRuntimeRoot(root) {
	if (runtime$1(root)) return root;
	const candidates = root.children.filter((child) => runtime$1(child) !== void 0);
	return candidates.length === 1 ? candidates[0] : null;
}
var DIRECTIONAL_ACTION_NAME_SET = new Set(RIGGED_OPERATOR_DIRECTIONAL_ACTION_NAMES);
/**
* The runtime lives in `userData`, which is an untyped bag: the Gun Range
* training dummy and other presentations assemble one by hand rather than going
* through `createRiggedOperator`, and TypeScript cannot see that. Rather than
* requiring every such site to know about the Pass 77 fields, the one function
* that reads them fills in whatever is missing, once, from the operator itself.
*/
function ensureAnimationRuntime(runtimeState, root) {
	if (runtimeState.director) return;
	runtimeState.director = createOperatorAnimationDirector(String(root.userData.operatorSkinId ?? "default"), root.name);
	runtimeState.dead = runtimeState.currentBase === "Death";
	runtimeState.activeAnimationClips = runtimeState.currentBase ? [runtimeState.currentBase] : [];
	runtimeState.visualYawRadians = root.rotation.y;
	runtimeState.lastGroundX = root.position.x;
	runtimeState.lastGroundZ = root.position.z;
	runtimeState.lastAnimation = null;
	runtimeState.lazilyBoundDirectionalClips = 0;
}
function actionFor(runtimeState, name) {
	const existing = runtimeState.actions.get(name);
	if (existing) return existing;
	const clip = runtimeState.clips.get(name);
	if (!clip) return void 0;
	const action = runtimeState.mixer.clipAction(clip);
	runtimeState.actions.set(name, action);
	if (DIRECTIONAL_ACTION_NAME_SET.has(name)) runtimeState.lazilyBoundDirectionalClips += 1;
	return action;
}
var RIGGED_OPERATOR_ACTIONS_PER_TASK = 2;
async function performRiggedOperatorActionPrewarm(runtimeState, actionNames) {
	let bound = 0;
	for (let index = 0; index < actionNames.length; index += 1) {
		const name = actionNames[index];
		const existed = runtimeState.actions.has(name);
		if (actionFor(runtimeState, name) && !existed) bound += 1;
		if (typeof document !== "undefined" && (index + 1) % RIGGED_OPERATOR_ACTIONS_PER_TASK === 0 && index + 1 < actionNames.length) await yieldBrowserCpuTask();
	}
	return bound;
}
/** Binds requested live animation actions in short CPU tasks before admission. */
function prewarmRiggedOperatorActions(root, actionNames = RIGGED_OPERATOR_RUNTIME_ACTION_NAMES) {
	const runtimeState = runtime$1(root);
	if (!runtimeState) return Promise.resolve(0);
	return performRiggedOperatorActionPrewarm(runtimeState, actionNames);
}
function createRiggedOperator(team, name, flattenMaterials, appearance = "team", skinId = "default") {
	const skinStore = skinId !== "default" && operatorSkinAssetReady(skinId) ? operatorSkinAssets.get(skinId) : void 0;
	const operatorAsset = flattenMaterials ? skinStore?.performance ?? operatorAssets.performance : skinStore?.quality ?? operatorAssets.quality;
	if (!operatorAsset) return null;
	const root = new Group();
	root.name = name;
	root.userData.dynamic = true;
	const visual = clone(operatorAsset.scene);
	visual.name = "rigged-operator-visual";
	visual.rotation.y = Math.PI;
	const embeddedWeaponsSuppressed = suppressEmbeddedWeaponObjects(visual);
	const prepareMaterial = createOperatorInstanceMaterialResolver(team, flattenMaterials, appearance, skinId);
	const canonicalSkinnedMeshes = [];
	visual.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		if (node instanceof SkinnedMesh) canonicalSkinnedMeshes.push(node);
		node.castShadow = !flattenMaterials;
		node.receiveShadow = !flattenMaterials;
		node.userData.presentationOnly = true;
		node.raycast = () => void 0;
		if (Array.isArray(node.material)) node.material = node.material.map(prepareMaterial);
		else node.material = prepareMaterial(node.material);
	});
	markMeshGeometriesShared(visual, "rigged-operator-source");
	const stancePivot = new Group();
	stancePivot.name = "operator-stance-pivot";
	stancePivot.position.y = STANCE_PIVOT_HEIGHT;
	visual.position.y -= STANCE_PIVOT_HEIGHT;
	stancePivot.add(visual);
	root.add(stancePivot);
	const weaponSocket = new Group();
	weaponSocket.name = "weapon-socket";
	weaponSocket.position.set(0, 1.31, -.18);
	root.add(weaponSocket);
	const mixer = new AnimationMixer(visual);
	const clips = new Map(riggedOperatorAvailableClips(operatorAsset.clips).map((clip) => [clip.name, clip]));
	const actions = /* @__PURE__ */ new Map();
	const base = clips.has("Idle_Gun_Pointing") ? "Idle_Gun_Pointing" : clips.has("Idle_Gun") ? "Idle_Gun" : "Idle_Gun_Shoot";
	const baseClip = clips.get(base);
	if (baseClip) {
		const baseAction = mixer.clipAction(baseClip);
		actions.set(base, baseAction);
		baseAction.setLoop(LoopRepeat, Infinity).play();
	}
	const poseBone = (...names) => {
		for (const candidate of names) {
			const node = visual.getObjectByName(candidate);
			if (node instanceof Bone) return node;
		}
	};
	const armBindPose = RIGGED_OPERATOR_ARM_BONES.flatMap(({ side, role, sourceBone, names }) => {
		const bone = poseBone(...names);
		return bone ? [{
			side,
			role,
			sourceBone,
			bone,
			position: bone.position.clone(),
			quaternion: bone.quaternion.clone()
		}] : [];
	});
	const handBindPose = RIGGED_OPERATOR_HAND_BONES.flatMap(({ side, digit, joint, sourceBone, names }) => {
		const bone = poseBone(...names);
		return bone ? [{
			side,
			digit,
			joint,
			sourceBone,
			bone,
			position: bone.position.clone(),
			quaternion: bone.quaternion.clone()
		}] : [];
	});
	const canonicalWrists = Object.freeze({
		left: armBindPose.find((entry) => entry.side === "left" && entry.role === "wrist-hand")?.bone,
		right: armBindPose.find((entry) => entry.side === "right" && entry.role === "wrist-hand")?.bone
	});
	const canonicalEvidence = {
		visual,
		skinnedMeshes: Object.freeze([...canonicalSkinnedMeshes]),
		wrists: canonicalWrists,
		assetUrl: operatorAsset.source,
		lod: operatorAsset.lod
	};
	root.updateWorldMatrix(true, true);
	const operatorRootWorld = root.getWorldQuaternion(new Quaternion());
	for (const entry of armBindPose.filter(({ role }) => role === "wrist-hand")) {
		const wristWorld = entry.bone.getWorldQuaternion(new Quaternion());
		entry.bone.userData.riggedGripBasisCorrection = wristWorld.invert().multiply(operatorRootWorld).normalize().toArray();
		entry.bone.userData.riggedGripBasisReference = {
			contract: "authored-wrist-bind-to-operator-root-v1",
			sourceAsset: operatorAsset.source,
			sourceBone: entry.sourceBone
		};
	}
	root.userData.riggedOperatorRuntime = {
		mixer,
		clips,
		actions,
		currentBase: base,
		lastUpdatedAt: performance.now(),
		stancePivot,
		visual,
		weaponSocket,
		canonicalEvidence,
		stance: "stand",
		crouchBlend: 0,
		proneBlend: 0,
		speed: 0,
		director: createOperatorAnimationDirector(skinId, name),
		dead: false,
		activeAnimationClips: base ? [base] : [],
		visualYawRadians: root.rotation.y,
		lastGroundX: root.position.x,
		lastGroundZ: root.position.z,
		stanceIdleFade: {
			clipName: null,
			fadeFrom: null,
			fadeSeconds: 0
		},
		lastAnimation: null,
		lazilyBoundDirectionalClips: 0,
		poseBones: {
			hips: poseBone("Hips"),
			abdomen: poseBone("Abdomen"),
			torso: poseBone("Torso"),
			chest: poseBone("Chest"),
			neck: poseBone("Neck"),
			head: poseBone("Head"),
			upperLegLeft: poseBone("UpperLegL", "UpperLeg.L"),
			upperLegRight: poseBone("UpperLegR", "UpperLeg.R"),
			lowerLegLeft: poseBone("LowerLegL", "LowerLeg.L"),
			lowerLegRight: poseBone("LowerLegR", "LowerLeg.R"),
			footLeft: poseBone("FootL", "Foot.L"),
			footRight: poseBone("FootR", "Foot.R")
		},
		armBindPose,
		handBindPose,
		proneClearance: null
	};
	root.userData.operatorAsset = {
		source: "Atomic Acres Pass 65 operator / Quaternius CC0 derivative",
		assetUrl: operatorAsset.source,
		license: "CC0-1.0",
		lod: operatorAsset.lod,
		skinnedMeshes: operatorAsset.skinnedMeshes,
		pbrMaterials: operatorAsset.pbrMaterials,
		materialContract: "opaque-embedded-pbr-depth-writing",
		clips: operatorAsset.clips.length,
		embeddedWeaponsSuppressed
	};
	root.userData.operatorAppearance = appearance;
	root.userData.operatorSkinId = skinId;
	return {
		root,
		weaponSocket
	};
}
/**
* HF-382: how long an idle-to-idle stance change cross-fades. Short enough to
* feel responsive in the menu turntable, long enough that the outgoing clip
* still carries weight on the first frame after the switch - a released and
* restarted action reads as a pose snap.
*/
var OPERATOR_STANCE_IDLE_FADE_SECONDS = .28;
/** The idle corpus the stance catalog draws from (same clips as the director's). */
var STANCE_IDLE_CLIP_CORPUS = Object.freeze({
	Idle_Gun_Pointing: true,
	Idle_Gun: true,
	Idle_Gun_Shoot: true
});
/**
* The per-root stance preference, published by callers (the menu preview writes
* it directly; gameplay replication should write the same channel). Null when
* nothing valid is published, which preserves the pre-HF-382 behaviour exactly:
* the skin profile's own idle preference decides.
*/
function rootOperatorStancePreference(root) {
	const value = root.userData.operatorStanceId;
	return isOperatorStanceId(value) ? value : null;
}
/**
* HF-382: folds the selected IDLE STANCE into a director output. Advances the
* cross-fade state, then replaces every emitted idle-corpus layer with the
* stance's authored clip - split between the outgoing and incoming clips while
* the fade runs so the mixer never releases-and-restarts a visible pose. Weights
* are conserved, so the blend graph's renormalisation contract still holds.
*
* Pure with respect to the animation; the only mutation is `fadeState`, which
* lives on the per-operator runtime. Death layers pass through untouched.
*/
function applyOperatorStanceIdlePreference(animation, availableClips, stance, fadeState, deltaSeconds) {
	const preferred = stanceIdleClip(stance, availableClips);
	if (fadeState.clipName !== preferred) {
		fadeState.fadeFrom = fadeState.clipName;
		fadeState.clipName = preferred;
		fadeState.fadeSeconds = 0;
	}
	let blend = 1;
	if (fadeState.fadeFrom !== null && fadeState.fadeFrom !== fadeState.clipName) {
		fadeState.fadeSeconds += Math.max(0, deltaSeconds);
		blend = Math.min(1, fadeState.fadeSeconds / OPERATOR_STANCE_IDLE_FADE_SECONDS);
		if (blend >= 1) fadeState.fadeFrom = null;
	}
	if (!availableClips.has(preferred)) return animation;
	if (!(animation.layers.some((layer) => STANCE_IDLE_CLIP_CORPUS[layer.clip] === true) || animation.selectedClip !== null && STANCE_IDLE_CLIP_CORPUS[animation.selectedClip] === true)) return animation;
	const layers = [];
	for (const layer of animation.layers) {
		if (!STANCE_IDLE_CLIP_CORPUS[layer.clip]) {
			layers.push({ ...layer });
			continue;
		}
		if (fadeState.fadeFrom !== null && blend < 1) {
			if (fadeState.fadeFrom !== preferred && availableClips.has(fadeState.fadeFrom)) layers.push({
				clip: fadeState.fadeFrom,
				weight: layer.weight * (1 - blend),
				timeScale: layer.timeScale
			});
			layers.push({
				clip: preferred,
				weight: layer.weight * blend,
				timeScale: layer.timeScale
			});
		} else layers.push({
			...layer,
			clip: preferred
		});
	}
	const sorted = layers.filter((layer) => availableClips.has(layer.clip)).sort((left, right) => right.weight - left.weight || left.clip.localeCompare(right.clip));
	return {
		...animation,
		layers: Object.freeze(sorted),
		selectedClip: STANCE_IDLE_CLIP_CORPUS[animation.selectedClip ?? ""] === true ? preferred : animation.selectedClip
	};
}
function updateRiggedOperator(root, speed, stance, motion) {
	const runtimeState = runtime$1(root);
	if (!runtimeState) return false;
	ensureAnimationRuntime(runtimeState, root);
	const now = performance.now();
	const dt = Math.min(.05, Math.max(0, (now - runtimeState.lastUpdatedAt) / 1e3));
	runtimeState.lastUpdatedAt = now;
	runtimeState.stance = stance;
	runtimeState.speed = Math.max(0, Number.isFinite(speed) ? speed : 0);
	const publishedClearance = root.userData.proneClearance;
	runtimeState.proneClearance = publishedClearance && Number.isFinite(publishedClearance.forwardM) ? publishedClearance : null;
	for (const entry of runtimeState.poseBeforeStance ?? []) {
		entry.bone.position.copy(entry.position);
		entry.bone.quaternion.copy(entry.quaternion);
	}
	const measured = localGroundVelocity(root.position.x - runtimeState.lastGroundX, root.position.z - runtimeState.lastGroundZ, root.rotation.y, dt);
	runtimeState.lastGroundX = root.position.x;
	runtimeState.lastGroundZ = root.position.z;
	const velocity = directedGroundVelocity(runtimeState.speed, measured);
	const yawError = wrapAngleRadians(root.rotation.y - runtimeState.visualYawRadians);
	let animation = advanceOperatorAnimation(runtimeState.director, {
		deltaSeconds: dt,
		forwardMps: velocity.forwardMps,
		strafeMps: velocity.strafeMps,
		aimPitchRadians: stance === "prone" ? 0 : motion?.aimPitchRadians ?? 0,
		yawErrorRadians: yawError,
		dead: runtimeState.dead,
		armed: motion?.armed ?? true,
		availableClips: [...runtimeState.clips.keys()]
	});
	const stancePreference = rootOperatorStancePreference(root);
	if (stancePreference !== null) animation = applyOperatorStanceIdlePreference(animation, new Set(runtimeState.clips.keys()), stancePreference, runtimeState.stanceIdleFade, dt);
	runtimeState.lastAnimation = animation;
	runtimeState.visualYawRadians = wrapAngleRadians(runtimeState.visualYawRadians + animation.aim.bodyYawDeltaRadians);
	const plan = planOperatorMixer(animation, runtimeState.activeAnimationClips);
	applyOperatorMixerPlan(plan, (clip) => actionFor(runtimeState, clip));
	runtimeState.activeAnimationClips = plan.active;
	runtimeState.currentBase = runtimeState.dead ? "Death" : animation.selectedClip ?? runtimeState.currentBase;
	runtimeState.mixer.update(dt);
	if (runtimeState.dead) return true;
	runtimeState.poseBeforeStance = Object.values(runtimeState.poseBones).filter((bone) => bone instanceof Bone).map((bone) => ({
		bone,
		position: bone.position.clone(),
		quaternion: bone.quaternion.clone()
	}));
	applyOperatorAnimationPose(runtimeState.poseBones, animation);
	runtimeState.stancePivot.rotation.y = wrapAngleRadians(runtimeState.visualYawRadians - root.rotation.y);
	applyStancePose(runtimeState, dt);
	return true;
}
var UNARMED_WRIST_BIND_DELTA_FLOOR_RADIANS = .075;
var UNARMED_WRIST_AXIS_EPSILON = 1e-6;
var HAND_BIND_FLOOR_COMPARISON_EPSILON = 1e-9;
var HAND_BIND_FLOOR_AXIS_EPSILON = 1e-8;
var HAND_BIND_FLOOR_AXIS_CACHE_KEY = "riggedHandBindFloorAxis";
var HAND_BIND_FLOOR_TELEMETRY_KEY = "riggedHandBindFloorTelemetry";
var HAND_BIND_FLOOR_OBSERVED_AXIS_STORAGE_KEY = "riggedHandBindFloorObservedAxisStorage";
var HAND_BIND_FLOOR_SCRATCH = {
	before: new Quaternion(),
	relative: new Quaternion(),
	observedAxis: new Vector3(),
	cachedAxis: new Vector3(),
	fallbackAxis: new Vector3(),
	appliedAxis: new Vector3(),
	targetDelta: new Quaternion(),
	normalizedBefore: new Quaternion(),
	normalizedAfter: new Quaternion()
};
var UNARMED_WRIST_FALLBACK_AXIS = Object.freeze({
	left: Object.freeze([
		1,
		-.45,
		-.6
	]),
	right: Object.freeze([
		1,
		.45,
		.6
	])
});
function writeQuaternionArray(target, value) {
	target[0] = value.x;
	target[1] = value.y;
	target[2] = value.z;
	target[3] = value.w;
}
function writeVectorArray(target, value) {
	target[0] = value.x;
	target[1] = value.y;
	target[2] = value.z;
}
/**
* Enforce a post-mixer angular floor on one rendered hand joint relative to
* its immutable authored GLB bind quaternion. Nonzero poses retain the
* shortest bind-relative rotation axis; exact cancellation reuses the last
* observed axis before falling back to the caller's authored curl axis.
*/
function enforceRiggedOperatorHandBindDeltaFloor(root, side, digit, minimumBindDeltaRadians, fallbackAxis) {
	const runtimeState = runtime$1(root);
	if (!runtimeState) return null;
	let entry;
	for (const candidate of runtimeState.handBindPose) if (candidate.side === side && candidate.digit === digit) {
		entry = candidate;
		break;
	}
	if (!entry || !Number.isFinite(minimumBindDeltaRadians) || minimumBindDeltaRadians <= 0 || minimumBindDeltaRadians >= Math.PI) return null;
	const bindLocalQuaternion = entry.quaternion;
	const bindQuaternionNorm = bindLocalQuaternion.length();
	const normalizedBindDotTarget = Math.cos(minimumBindDeltaRadians / 2) / bindQuaternionNorm;
	if (!Number.isFinite(bindQuaternionNorm) || bindQuaternionNorm <= HAND_BIND_FLOOR_AXIS_EPSILON || !Number.isFinite(normalizedBindDotTarget) || normalizedBindDotTarget > 1) return null;
	const floorTargetRelativeAngleRadians = 2 * Math.acos(MathUtils.clamp(normalizedBindDotTarget, -1, 1));
	const beforeLocalQuaternion = HAND_BIND_FLOOR_SCRATCH.before.copy(entry.bone.quaternion);
	const beforeBindDeltaRadians = beforeLocalQuaternion.angleTo(bindLocalQuaternion);
	const relative = HAND_BIND_FLOOR_SCRATCH.relative.copy(bindLocalQuaternion).invert().multiply(beforeLocalQuaternion).normalize();
	if (relative.w < 0) relative.set(-relative.x, -relative.y, -relative.z, -relative.w);
	const relativeAxisLength = Math.hypot(relative.x, relative.y, relative.z);
	const observedAxisAvailable = relativeAxisLength > HAND_BIND_FLOOR_AXIS_EPSILON;
	if (observedAxisAvailable) HAND_BIND_FLOOR_SCRATCH.observedAxis.set(relative.x, relative.y, relative.z).divideScalar(relativeAxisLength);
	const cachedAxisValue = entry.bone.userData[HAND_BIND_FLOOR_AXIS_CACHE_KEY];
	const cachedAxisAvailable = Array.isArray(cachedAxisValue) && cachedAxisValue.length === 3 && typeof cachedAxisValue[0] === "number" && Number.isFinite(cachedAxisValue[0]) && typeof cachedAxisValue[1] === "number" && Number.isFinite(cachedAxisValue[1]) && typeof cachedAxisValue[2] === "number" && Number.isFinite(cachedAxisValue[2]) && HAND_BIND_FLOOR_SCRATCH.cachedAxis.fromArray(cachedAxisValue).lengthSq() > HAND_BIND_FLOOR_AXIS_EPSILON ** 2;
	if (cachedAxisAvailable) HAND_BIND_FLOOR_SCRATCH.cachedAxis.normalize();
	const authoredFallbackAxis = HAND_BIND_FLOOR_SCRATCH.fallbackAxis.set(...fallbackAxis);
	if (authoredFallbackAxis.lengthSq() <= HAND_BIND_FLOOR_AXIS_EPSILON ** 2) return null;
	authoredFallbackAxis.normalize();
	const intervened = beforeBindDeltaRadians < minimumBindDeltaRadians - HAND_BIND_FLOOR_COMPARISON_EPSILON;
	const continuityReferenceAxis = cachedAxisAvailable ? HAND_BIND_FLOOR_SCRATCH.cachedAxis : authoredFallbackAxis;
	const appliedAxis = HAND_BIND_FLOOR_SCRATCH.appliedAxis.copy(observedAxisAvailable ? HAND_BIND_FLOOR_SCRATCH.observedAxis : continuityReferenceAxis);
	const alignedObservedAxisHemisphere = intervened && observedAxisAvailable && cachedAxisAvailable && appliedAxis.dot(continuityReferenceAxis) < 0;
	if (alignedObservedAxisHemisphere) appliedAxis.negate();
	const axisSource = observedAxisAvailable ? alignedObservedAxisHemisphere ? "shortest-bind-relative-aligned-to-previous" : "shortest-bind-relative" : cachedAxisAvailable ? "previous-shortest-bind-relative" : "authored-curl-fallback";
	if (intervened) entry.bone.quaternion.copy(bindLocalQuaternion).multiply(HAND_BIND_FLOOR_SCRATCH.targetDelta.setFromAxisAngle(appliedAxis, floorTargetRelativeAngleRadians)).normalize();
	let persistentAxisCache = cachedAxisValue;
	if (!Array.isArray(persistentAxisCache) || persistentAxisCache.length !== 3) {
		persistentAxisCache = [
			0,
			0,
			0
		];
		entry.bone.userData[HAND_BIND_FLOOR_AXIS_CACHE_KEY] = persistentAxisCache;
	}
	if (observedAxisAvailable) writeVectorArray(persistentAxisCache, intervened ? appliedAxis : HAND_BIND_FLOOR_SCRATCH.observedAxis);
	else if (!cachedAxisAvailable) writeVectorArray(persistentAxisCache, appliedAxis);
	entry.bone.updateWorldMatrix(false, true);
	const afterBindDeltaRadians = entry.bone.quaternion.angleTo(bindLocalQuaternion);
	const reportedBindDeltaCorrectionRadians = intervened ? Math.max(0, minimumBindDeltaRadians - beforeBindDeltaRadians) : 0;
	const renderedOrientationCorrectionRadians = intervened ? HAND_BIND_FLOOR_SCRATCH.normalizedBefore.copy(beforeLocalQuaternion).normalize().angleTo(HAND_BIND_FLOOR_SCRATCH.normalizedAfter.copy(entry.bone.quaternion).normalize()) : 0;
	let telemetry = entry.bone.userData[HAND_BIND_FLOOR_TELEMETRY_KEY];
	if (telemetry?.allocationContract !== "persistent-per-rendered-hand-bone-v1") {
		telemetry = {
			contract: "post-mixer-authored-bind-relative-hand-floor-v1",
			allocationContract: "persistent-per-rendered-hand-bone-v1",
			generation: 0,
			bindLocalQuaternion: [
				0,
				0,
				0,
				1
			],
			beforeLocalQuaternion: [
				0,
				0,
				0,
				1
			],
			afterLocalQuaternion: [
				0,
				0,
				0,
				1
			],
			observedShortestRelativeAxis: null,
			appliedAxis: [
				0,
				0,
				0
			]
		};
		entry.bone.userData[HAND_BIND_FLOOR_TELEMETRY_KEY] = telemetry;
	}
	let observedAxisStorage = entry.bone.userData[HAND_BIND_FLOOR_OBSERVED_AXIS_STORAGE_KEY];
	if (!Array.isArray(observedAxisStorage) || observedAxisStorage.length !== 3) {
		observedAxisStorage = [
			0,
			0,
			0
		];
		entry.bone.userData[HAND_BIND_FLOOR_OBSERVED_AXIS_STORAGE_KEY] = observedAxisStorage;
	}
	if (observedAxisAvailable) writeVectorArray(observedAxisStorage, HAND_BIND_FLOOR_SCRATCH.observedAxis);
	writeQuaternionArray(telemetry.bindLocalQuaternion, bindLocalQuaternion);
	writeQuaternionArray(telemetry.beforeLocalQuaternion, beforeLocalQuaternion);
	writeQuaternionArray(telemetry.afterLocalQuaternion, entry.bone.quaternion);
	writeVectorArray(telemetry.appliedAxis, appliedAxis);
	telemetry.generation += 1;
	telemetry.reference = "immutable-authored-handBindPose-before-animation";
	telemetry.side = side;
	telemetry.digit = digit;
	telemetry.sourceBone = entry.sourceBone;
	telemetry.bone = entry.bone.name;
	telemetry.minimumBindDeltaRadians = minimumBindDeltaRadians;
	telemetry.bindQuaternionNorm = bindQuaternionNorm;
	telemetry.floorTargetRelativeAngleRadians = floorTargetRelativeAngleRadians;
	telemetry.bindNormCompensationRadians = floorTargetRelativeAngleRadians - minimumBindDeltaRadians;
	telemetry.beforeBindDeltaRadians = beforeBindDeltaRadians;
	telemetry.afterBindDeltaRadians = afterBindDeltaRadians;
	telemetry.reportedBindDeltaCorrectionRadians = reportedBindDeltaCorrectionRadians;
	telemetry.renderedOrientationCorrectionRadians = renderedOrientationCorrectionRadians;
	telemetry.observedShortestRelativeAxis = observedAxisAvailable ? observedAxisStorage : null;
	telemetry.axisSource = axisSource;
	telemetry.alignedObservedAxisHemisphere = alignedObservedAxisHemisphere;
	telemetry.continuityReference = intervened ? cachedAxisAvailable ? "previous-shortest-bind-relative" : observedAxisAvailable ? null : "authored-curl-fallback" : null;
	telemetry.intervened = intervened;
	telemetry.preservedShortestRelativeAxis = observedAxisAvailable ? Math.abs(HAND_BIND_FLOOR_SCRATCH.observedAxis.dot(appliedAxis)) >= .999999999 : intervened ? null : true;
	telemetry.usedPreviousAxis = !observedAxisAvailable && cachedAxisAvailable;
	telemetry.usedFallbackAxis = !observedAxisAvailable && !cachedAxisAvailable;
	telemetry.appliedToRenderedBone = true;
	telemetry.allFinite = Number.isFinite(minimumBindDeltaRadians) && Number.isFinite(bindQuaternionNorm) && Number.isFinite(floorTargetRelativeAngleRadians) && Number.isFinite(beforeBindDeltaRadians) && Number.isFinite(afterBindDeltaRadians) && Number.isFinite(reportedBindDeltaCorrectionRadians) && Number.isFinite(renderedOrientationCorrectionRadians) && telemetry.bindLocalQuaternion.every(Number.isFinite) && telemetry.beforeLocalQuaternion.every(Number.isFinite) && telemetry.afterLocalQuaternion.every(Number.isFinite) && telemetry.appliedAxis.every(Number.isFinite);
	return telemetry;
}
/**
* Keep an unarmed operator's rendered hands in a natural, deterministic rest
* pose after the locomotion mixer. Shoulder, elbow and finger animation stays
* live. A wrist already beyond the floor is untouched; a near-bind wrist keeps
* its animated relative-rotation axis and only gains enough angle to reach the
* floor. Exact bind pose uses a mirrored natural fallback axis. Armed operators
* never call this path because their final wrist pose is owned by weapon grip IK.
*/
function poseUnarmedRiggedOperatorHands(root) {
	const runtimeState = runtime$1(root);
	if (!runtimeState) return null;
	const entries = runtimeState.armBindPose.filter(({ role }) => role === "wrist-hand").map((entry) => {
		const beforeBindDeltaRadians = entry.bone.quaternion.angleTo(entry.quaternion);
		let intervened = false;
		let usedMirroredFallbackAxis = false;
		if (beforeBindDeltaRadians < UNARMED_WRIST_BIND_DELTA_FLOOR_RADIANS) {
			const relative = entry.quaternion.clone().invert().multiply(entry.bone.quaternion).normalize();
			if (relative.w < 0) relative.set(-relative.x, -relative.y, -relative.z, -relative.w);
			const relativeAxisLength = Math.hypot(relative.x, relative.y, relative.z);
			const axis = beforeBindDeltaRadians > UNARMED_WRIST_AXIS_EPSILON && relativeAxisLength > UNARMED_WRIST_AXIS_EPSILON ? new Vector3(relative.x, relative.y, relative.z).divideScalar(relativeAxisLength) : new Vector3(...UNARMED_WRIST_FALLBACK_AXIS[entry.side]).normalize();
			usedMirroredFallbackAxis = beforeBindDeltaRadians <= UNARMED_WRIST_AXIS_EPSILON;
			const enforcedDelta = new Quaternion().setFromAxisAngle(axis, UNARMED_WRIST_BIND_DELTA_FLOOR_RADIANS);
			entry.bone.quaternion.copy(entry.quaternion).multiply(enforcedDelta).normalize();
			intervened = true;
		}
		entry.bone.updateWorldMatrix(false, true);
		return {
			side: entry.side,
			sourceBone: entry.sourceBone,
			bone: entry.bone.name,
			minimumBindDeltaRadians: UNARMED_WRIST_BIND_DELTA_FLOOR_RADIANS,
			beforeBindDeltaRadians,
			afterBindDeltaRadians: entry.bone.quaternion.angleTo(entry.quaternion),
			intervened,
			preservedAnimatedAxis: intervened && !usedMirroredFallbackAxis,
			usedMirroredFallbackAxis,
			appliedToRenderedBone: true
		};
	});
	return {
		contract: "post-mixer-unarmed-wrist-rest-v1",
		expectedBoneCount: 2,
		entries,
		allApplied: entries.length === 2 && entries.every(({ appliedToRenderedBone }) => appliedToRenderedBone),
		allAtOrAboveFloor: entries.length === 2 && entries.every(({ afterBindDeltaRadians }) => afterBindDeltaRadians >= UNARMED_WRIST_BIND_DELTA_FLOOR_RADIANS - 1e-9)
	};
}
/**
* Pass 77: a shot is an ACCENT on top of whatever the operator is doing, with a
* defined end - not a full-weight clip swap that stays clamped forever. The
* director owns the envelope; nothing has to remember to switch it off.
*/
function fireRiggedOperator(root) {
	const runtimeState = runtime$1(root);
	if (!runtimeState) return false;
	ensureAnimationRuntime(runtimeState, root);
	pushOperatorOneShot(runtimeState.director, "fire");
	return true;
}
/** Catalog emote id -> director one-shot kind. 'none' maps to nothing on purpose. */
var EMOTE_ONE_SHOT_KINDS = Object.freeze({
	wave: "emote-wave",
	"salute-punch": "emote-punch",
	boot: "emote-boot"
});
/**
* Play a replicated emote on a third-person rig as a bounded one-shot. Same
* contract as fireRiggedOperator: the director owns the envelope, so nothing has
* to remember to switch it off, and an off-catalog id is a no-op rather than a
* throw - the message was already host-validated, this is defence in depth.
*/
function emoteRiggedOperator(root, emoteId) {
	const kind = EMOTE_ONE_SHOT_KINDS[emoteId];
	if (!kind) return false;
	const runtimeState = runtime$1(root);
	if (!runtimeState) return false;
	ensureAnimationRuntime(runtimeState, root);
	pushOperatorOneShot(runtimeState.director, kind);
	return true;
}
/**
* `zone` used to be a boolean that only chose between the two authored hit
* clips. It now carries real severity and direction into the reaction layer, so
* a headshot flinches harder than a limb graze and a hit from the right rolls
* the torso left - while the operator keeps running underneath.
*/
function reactRiggedOperator(root, zone = "body", incomingYawRadians = 0) {
	const runtimeState = runtime$1(root);
	if (!runtimeState) return false;
	ensureAnimationRuntime(runtimeState, root);
	const resolved = typeof zone === "boolean" ? zone ? "limb" : "body" : zone;
	pushOperatorHitImpulse(runtimeState.director, {
		zone: resolved,
		severity: resolved === "head" ? 1 : resolved === "body" ? .72 : .45,
		incomingYawRadians
	});
	return true;
}
function deathRiggedOperator(root) {
	const runtimeState = runtime$1(root);
	if (!runtimeState || !runtimeState.clips.has("Death")) return false;
	runtimeState.dead = true;
	runtimeState.currentBase = "Death";
	return true;
}
function resetRiggedOperator(root) {
	const runtimeState = runtime$1(root);
	if (!runtimeState) return false;
	for (const action of runtimeState.actions.values()) {
		action.stop();
		action.enabled = false;
		action.clampWhenFinished = false;
	}
	const base = runtimeState.clips.has("Idle_Gun_Pointing") ? "Idle_Gun_Pointing" : runtimeState.clips.has("Idle_Gun") ? "Idle_Gun" : "Idle_Gun_Shoot";
	actionFor(runtimeState, base)?.reset().setLoop(LoopRepeat, Infinity).play();
	runtimeState.currentBase = base;
	runtimeState.dead = false;
	runtimeState.stanceIdleFade = {
		clipName: null,
		fadeFrom: null,
		fadeSeconds: 0
	};
	runtimeState.director = createOperatorAnimationDirector(String(root.userData.operatorSkinId ?? "default"), root.name);
	runtimeState.activeAnimationClips = [base];
	runtimeState.lastAnimation = null;
	runtimeState.visualYawRadians = root.rotation.y;
	runtimeState.lastGroundX = root.position.x;
	runtimeState.lastGroundZ = root.position.z;
	runtimeState.stance = "stand";
	runtimeState.crouchBlend = 0;
	runtimeState.proneBlend = 0;
	runtimeState.poseBeforeStance = void 0;
	runtimeState.stancePivot.position.set(0, STANCE_PIVOT_HEIGHT, 0);
	runtimeState.stancePivot.rotation.set(0, 0, 0);
	runtimeState.weaponSocket.position.set(0, 1.31, -.18);
	runtimeState.weaponSocket.rotation.set(0, 0, 0);
	runtimeState.lastUpdatedAt = performance.now();
	return true;
}
function meleeRiggedOperator(root) {
	const runtimeState = runtime$1(root);
	if (!runtimeState) return false;
	ensureAnimationRuntime(runtimeState, root);
	pushOperatorOneShot(runtimeState.director, "melee");
	return true;
}
function riggedOperatorTelemetry(root) {
	const runtimeState = runtime$1(root);
	if (!runtimeState) return null;
	const weaponRoot = runtimeState.weaponSocket.children[0];
	let weaponBounds = null;
	if (weaponRoot) {
		weaponRoot.updateWorldMatrix(true, true);
		const rootInverse = weaponRoot.matrixWorld.clone().invert();
		const localBounds = new Box3().makeEmpty();
		weaponRoot.traverse((child) => {
			if (!(child instanceof Mesh) || !child.geometry) return;
			child.geometry.computeBoundingBox();
			if (!child.geometry.boundingBox) return;
			const meshToWeapon = rootInverse.clone().multiply(child.matrixWorld);
			localBounds.union(child.geometry.boundingBox.clone().applyMatrix4(meshToWeapon));
		});
		if (!localBounds.isEmpty()) {
			const center = localBounds.getCenter(new Vector3()).applyMatrix4(weaponRoot.matrixWorld);
			const size = localBounds.getSize(new Vector3());
			const worldScale = weaponRoot.getWorldScale(new Vector3());
			size.multiply(new Vector3(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z)));
			const socketPosition = runtimeState.weaponSocket.getWorldPosition(new Vector3());
			weaponBounds = {
				center: center.toArray(),
				size: size.toArray(),
				distanceFromSocket: center.distanceTo(socketPosition)
			};
		}
	}
	const localMountBounds = weaponRoot ? objectLocalGeometryBounds(weaponRoot) : null;
	let muzzleForwardDot = null;
	if (weaponRoot) {
		const grip = weaponRoot.getObjectByName("grip-socket-r");
		const muzzle = weaponRoot.getObjectByName("muzzle-socket");
		if (grip && muzzle) {
			const aim = muzzle.getWorldPosition(new Vector3()).sub(grip.getWorldPosition(new Vector3()));
			const operatorForward = new Vector3(0, 0, -1).applyQuaternion(root.getWorldQuaternion(new Quaternion()));
			if (aim.lengthSq() > 1e-8) muzzleForwardDot = aim.normalize().dot(operatorForward.normalize());
		}
	}
	const effectivelyVisible = (node) => {
		let cursor = node;
		while (cursor) {
			if (!cursor.visible) return false;
			cursor = cursor.parent;
		}
		return true;
	};
	const skinnedMeshIsRenderable = (mesh) => {
		const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		return effectivelyVisible(mesh) && materials.some((material) => material.visible && material.colorWrite && (!material.transparent || material.opacity > 0)) && (mesh.geometry.getAttribute("position")?.count ?? 0) > 0;
	};
	const effectiveSkinnedMeshes = [];
	let visibleSkinnedMeshes = 0;
	let visibleEmbeddedWeapons = 0;
	runtimeState.visual.traverse((node) => {
		if (node instanceof SkinnedMesh && node.visible) {
			visibleSkinnedMeshes += 1;
			if (skinnedMeshIsRenderable(node)) effectiveSkinnedMeshes.push(node);
		}
		if (node.userData.embeddedWeaponSuppressed === true && node.visible) visibleEmbeddedWeapons += 1;
	});
	const headBoneWorld = runtimeState.poseBones.head?.getWorldPosition(new Vector3()) ?? null;
	const hitProxyHeadWorld = (root.getObjectByName("authoritative-hit-proxies")?.children.find((node) => node.userData.authoritativeProxy === true && node.userData.hitZone === "head"))?.getWorldPosition(new Vector3()) ?? null;
	root.updateWorldMatrix(true, true);
	const skinMembership = (bone) => effectiveSkinnedMeshes.filter((mesh) => mesh.skeleton.bones.includes(bone)).map((mesh) => mesh.name);
	const attributeComponent = (attribute, vertex, slot) => {
		if (slot === 0) return attribute.getX(vertex);
		if (slot === 1) return attribute.getY(vertex);
		if (slot === 2) return attribute.getZ(vertex);
		return attribute.getW(vertex);
	};
	const bufferAttributeVersion = (attribute) => {
		if (!attribute) return -1;
		return attribute instanceof InterleavedBufferAttribute ? attribute.data.version : attribute.version;
	};
	const renderedInfluenceSignature = effectiveSkinnedMeshes.map((mesh) => {
		const joints = mesh.geometry.getAttribute("skinIndex");
		const weights = mesh.geometry.getAttribute("skinWeight");
		const positions = mesh.geometry.getAttribute("position");
		return [
			mesh.uuid,
			mesh.geometry.uuid,
			positions?.count ?? -1,
			bufferAttributeVersion(joints),
			bufferAttributeVersion(weights),
			mesh.geometry.index?.version ?? -1,
			mesh.geometry.drawRange.start,
			mesh.geometry.drawRange.count
		].join(":");
	}).join("|");
	let renderedInfluenceCache = runtimeState.renderedInfluenceCache;
	if (!renderedInfluenceCache || renderedInfluenceCache.signature !== renderedInfluenceSignature) {
		renderedInfluenceCache = {
			signature: renderedInfluenceSignature,
			generation: (renderedInfluenceCache?.generation ?? 0) + 1,
			byBone: /* @__PURE__ */ new Map()
		};
		runtimeState.renderedInfluenceCache = renderedInfluenceCache;
	}
	let renderedInfluenceComputedBones = 0;
	let renderedInfluenceReusedBones = 0;
	const renderedVertexInfluence = (bone) => {
		const cached = renderedInfluenceCache.byBone.get(bone);
		if (cached) {
			renderedInfluenceReusedBones += 1;
			return cached;
		}
		let influencedVertexCount = 0;
		let maximumNormalizedWeight = 0;
		const meshes = [];
		for (const mesh of effectiveSkinnedMeshes) {
			const jointIndex = mesh.skeleton.bones.indexOf(bone);
			const joints = mesh.geometry.getAttribute("skinIndex");
			const weights = mesh.geometry.getAttribute("skinWeight");
			const positions = mesh.geometry.getAttribute("position");
			if (jointIndex < 0 || !joints || !weights || !positions || joints.itemSize < 4 || weights.itemSize < 4) continue;
			const renderedVertices = /* @__PURE__ */ new Set();
			const index = mesh.geometry.index;
			const drawStart = Math.max(0, mesh.geometry.drawRange.start);
			const available = index?.count ?? positions.count;
			const drawCount = Number.isFinite(mesh.geometry.drawRange.count) ? Math.min(mesh.geometry.drawRange.count, available - drawStart) : available - drawStart;
			for (let drawIndex = drawStart; drawIndex < drawStart + Math.max(0, drawCount); drawIndex += 1) renderedVertices.add(index ? index.getX(drawIndex) : drawIndex);
			let meshInfluencedVertexCount = 0;
			let meshMaximumNormalizedWeight = 0;
			for (const vertex of renderedVertices) {
				let totalWeight = 0;
				let boneWeight = 0;
				for (let slot = 0; slot < 4; slot += 1) {
					const weight = attributeComponent(weights, vertex, slot);
					totalWeight += weight;
					if (Math.round(attributeComponent(joints, vertex, slot)) === jointIndex) boneWeight += weight;
				}
				const normalizedWeight = totalWeight > 1e-8 ? boneWeight / totalWeight : 0;
				if (normalizedWeight >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumNormalizedWeight) meshInfluencedVertexCount += 1;
				meshMaximumNormalizedWeight = Math.max(meshMaximumNormalizedWeight, normalizedWeight);
			}
			if (meshInfluencedVertexCount > 0 || meshMaximumNormalizedWeight > 0) meshes.push({
				mesh: mesh.name,
				meshUuid: mesh.uuid,
				geometryUuid: mesh.geometry.uuid,
				influencedVertexCount: meshInfluencedVertexCount,
				maximumNormalizedWeight: meshMaximumNormalizedWeight
			});
			influencedVertexCount += meshInfluencedVertexCount;
			maximumNormalizedWeight = Math.max(maximumNormalizedWeight, meshMaximumNormalizedWeight);
		}
		const telemetry = {
			contract: "rendered-joints0-weights0-influence-v2",
			bone: bone.name,
			boneUuid: bone.uuid,
			thresholds: RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS,
			influencedVertexCount,
			maximumNormalizedWeight,
			meshes,
			passes: influencedVertexCount >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumInfluencedVertices && maximumNormalizedWeight >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumMaximumNormalizedWeight
		};
		renderedInfluenceCache.byBone.set(bone, telemetry);
		renderedInfluenceComputedBones += 1;
		return telemetry;
	};
	const descendantPath = (descendant, ancestor) => {
		const path = [descendant.name];
		let cursor = descendant.parent;
		while (cursor) {
			path.unshift(cursor.name);
			if (cursor === ancestor) return path;
			cursor = cursor.parent;
		}
		return null;
	};
	const armPoseBones = (runtimeState.armBindPose ?? []).map((entry) => {
		const localPosition = entry.bone.position.toArray();
		const localQuaternion = entry.bone.quaternion.toArray();
		const worldPosition = entry.bone.getWorldPosition(new Vector3()).toArray();
		const worldQuaternion = entry.bone.getWorldQuaternion(new Quaternion()).toArray();
		const bindPositionDelta = entry.bone.position.distanceTo(entry.position);
		const bindQuaternionDeltaRadians = entry.bone.quaternion.angleTo(entry.quaternion);
		const vertexInfluence = renderedVertexInfluence(entry.bone);
		return {
			side: entry.side,
			role: entry.role,
			sourceBone: entry.sourceBone,
			bone: entry.bone.name,
			parentBone: entry.bone.parent?.name ?? null,
			effectiveSkinnedMeshes: skinMembership(entry.bone),
			localPosition,
			localQuaternion,
			worldPosition,
			worldQuaternion,
			bindLocalPosition: entry.position.toArray(),
			bindLocalQuaternion: entry.quaternion.toArray(),
			bindPositionDelta,
			bindQuaternionDeltaRadians,
			inEffectivelyVisibleSkinnedMesh: skinMembership(entry.bone).length > 0,
			vertexInfluence,
			finite: [
				...localPosition,
				...localQuaternion,
				...worldPosition,
				...worldQuaternion,
				bindPositionDelta,
				bindQuaternionDeltaRadians
			].every(Number.isFinite)
		};
	});
	const handPoseBones = (runtimeState.handBindPose ?? []).map((entry) => {
		const wrist = runtimeState.armBindPose.find((candidate) => candidate.side === entry.side && candidate.role === "wrist-hand")?.bone;
		const localPosition = entry.bone.position.toArray();
		const localQuaternion = entry.bone.quaternion.toArray();
		const worldPosition = entry.bone.getWorldPosition(new Vector3()).toArray();
		const worldQuaternion = entry.bone.getWorldQuaternion(new Quaternion()).toArray();
		const bindQuaternionDeltaRadians = entry.bone.quaternion.angleTo(entry.quaternion);
		const effectiveSkinMembership = skinMembership(entry.bone);
		const wristDescendantPath = wrist ? descendantPath(entry.bone, wrist) : null;
		const vertexInfluence = renderedVertexInfluence(entry.bone);
		return {
			side: entry.side,
			digit: entry.digit,
			joint: entry.joint,
			sourceBone: entry.sourceBone,
			bone: entry.bone.name,
			parentBone: entry.bone.parent?.name ?? null,
			wristBone: wrist?.name ?? null,
			wristDescendantPath,
			descendantOfWrist: wristDescendantPath !== null,
			effectiveSkinnedMeshes: effectiveSkinMembership,
			inEffectivelyVisibleSkinnedMesh: effectiveSkinMembership.length > 0,
			vertexInfluence,
			localPosition,
			localQuaternion,
			worldPosition,
			worldQuaternion,
			bindLocalPosition: entry.position.toArray(),
			bindLocalQuaternion: entry.quaternion.toArray(),
			bindQuaternionDeltaRadians,
			finite: [
				...localPosition,
				...localQuaternion,
				...worldPosition,
				...worldQuaternion,
				bindQuaternionDeltaRadians
			].every(Number.isFinite)
		};
	});
	const commonEffectiveSkinMeshes = effectiveSkinnedMeshes.filter((mesh) => [...runtimeState.armBindPose ?? [], ...runtimeState.handBindPose ?? []].every((entry) => mesh.skeleton.bones.includes(entry.bone))).map((mesh) => mesh.name);
	const armChains = ["left", "right"].map((side) => {
		const shoulder = armPoseBones.find((bone) => bone.side === side && bone.role === "shoulder");
		const elbow = armPoseBones.find((bone) => bone.side === side && bone.role === "elbow");
		const wrist = armPoseBones.find((bone) => bone.side === side && bone.role === "wrist-hand");
		if (!shoulder || !elbow || !wrist) return {
			side,
			complete: false
		};
		const shoulderWorld = new Vector3().fromArray(shoulder.worldPosition);
		const elbowWorld = new Vector3().fromArray(elbow.worldPosition);
		const wristWorld = new Vector3().fromArray(wrist.worldPosition);
		const shoulderToElbow = elbowWorld.clone().sub(shoulderWorld);
		const elbowToWrist = wristWorld.clone().sub(elbowWorld);
		const shoulderToWrist = wristWorld.clone().sub(shoulderWorld);
		const upperArmLength = shoulderToElbow.length();
		const forearmLength = elbowToWrist.length();
		const armLength = upperArmLength + forearmLength;
		const elbowBendRadians = shoulderWorld.clone().sub(elbowWorld).angleTo(elbowToWrist);
		const elbowFlexRadians = Math.PI - elbowBendRadians;
		const shoulderToWristVerticalDrop = shoulderWorld.y - wristWorld.y;
		const shoulderToWristHorizontalReach = Math.hypot(shoulderToWrist.x, shoulderToWrist.z);
		const torsoWorld = runtimeState.poseBones.torso?.getWorldPosition(new Vector3()) ?? null;
		const outwardAxis = torsoWorld ? shoulderWorld.clone().sub(torsoWorld).setY(0) : new Vector3();
		const shoulderToWristOutwardReach = outwardAxis.lengthSq() > 1e-8 ? shoulderToWrist.dot(outwardAxis.normalize()) : NaN;
		const hierarchyPath = descendantPath(runtimeState.armBindPose.find((entry) => entry.side === side && entry.role === "wrist-hand").bone, runtimeState.armBindPose.find((entry) => entry.side === side && entry.role === "shoulder").bone);
		const directHierarchy = hierarchyPath?.length === 3 && runtimeState.armBindPose.find((entry) => entry.side === side && entry.role === "elbow")?.bone.parent === runtimeState.armBindPose.find((entry) => entry.side === side && entry.role === "shoulder")?.bone && runtimeState.armBindPose.find((entry) => entry.side === side && entry.role === "wrist-hand")?.bone.parent === runtimeState.armBindPose.find((entry) => entry.side === side && entry.role === "elbow")?.bone;
		const shoulderToWristVerticalDropRatio = shoulderToWristVerticalDrop / Math.max(armLength, 1e-6);
		const shoulderToWristHorizontalReachRatio = shoulderToWristHorizontalReach / Math.max(armLength, 1e-6);
		const shoulderToWristOutwardReachRatio = Math.abs(shoulderToWristOutwardReach) / Math.max(armLength, 1e-6);
		return {
			side,
			complete: true,
			hierarchyPath,
			directHierarchy,
			upperArmLength,
			forearmLength,
			armLength,
			elbowBendRadians,
			elbowFlexRadians,
			upperArmVerticalDrop: shoulderWorld.y - elbowWorld.y,
			forearmVerticalDrop: elbowWorld.y - wristWorld.y,
			shoulderToWristVerticalDrop,
			shoulderToWristVerticalDropRatio,
			shoulderToWristHorizontalReach,
			shoulderToWristHorizontalReachRatio,
			shoulderOutwardAxis: outwardAxis.toArray(),
			shoulderToWristOutwardReach,
			shoulderToWristOutwardReachRatio,
			verticalDropToOutwardReachRatio: shoulderToWristVerticalDrop / Math.max(Math.abs(shoulderToWristOutwardReach), 1e-6),
			antiTPoseGeometry: directHierarchy === true && shoulderToWristVerticalDrop >= RIGGED_OPERATOR_ANTI_T_THRESHOLDS.minimumVerticalDropM && shoulderToWristVerticalDropRatio >= RIGGED_OPERATOR_ANTI_T_THRESHOLDS.minimumVerticalDropRatio && shoulderToWristHorizontalReachRatio <= RIGGED_OPERATOR_ANTI_T_THRESHOLDS.maximumHorizontalReachRatio && shoulderToWristOutwardReachRatio <= RIGGED_OPERATOR_ANTI_T_THRESHOLDS.maximumOutwardReachRatio && elbowFlexRadians >= RIGGED_OPERATOR_ANTI_T_THRESHOLDS.minimumElbowFlexRadians
		};
	});
	return {
		source: root.userData.operatorAsset?.source,
		assetUrl: root.userData.operatorAsset?.assetUrl,
		appearance: root.userData.operatorAppearance,
		license: root.userData.operatorAsset?.license,
		lod: root.userData.operatorAsset?.lod,
		skinnedMeshes: root.userData.operatorAsset?.skinnedMeshes,
		pbrMaterials: root.userData.operatorAsset?.pbrMaterials,
		materialContract: root.userData.operatorAsset?.materialContract,
		clips: root.userData.operatorAsset?.clips,
		runtimeClips: runtimeState.clips.size,
		runtimeActionsBound: runtimeState.actions.size,
		embeddedWeaponsSuppressed: root.userData.operatorAsset?.embeddedWeaponsSuppressed,
		visibleEmbeddedWeapons,
		activeClip: runtimeState.currentBase,
		animationContract: {
			base: runtimeState.currentBase,
			stance: runtimeState.stance,
			crouchBlend: runtimeState.crouchBlend,
			proneBlend: runtimeState.proneBlend,
			pivotHeight: runtimeState.stancePivot.position.y,
			pivotPitch: runtimeState.stancePivot.rotation.x,
			speed: runtimeState.speed,
			mixerBeforeSupportIk: true,
			pass77: runtimeState.director === void 0 ? null : {
				contract: "director-composed-operator-animation-v1",
				archetype: runtimeState.director.profile.archetype,
				state: runtimeState.lastAnimation?.state ?? null,
				layers: (runtimeState.lastAnimation?.layers ?? []).map((layer) => ({
					clip: layer.clip,
					weight: Number(layer.weight.toFixed(4)),
					timeScale: Number(layer.timeScale.toFixed(4))
				})),
				baseWeightSum: Number((runtimeState.lastAnimation?.layers ?? []).reduce((sum, layer) => sum + layer.weight, 0).toFixed(6)),
				additiveLayers: (runtimeState.lastAnimation?.additiveLayers ?? []).map((layer) => ({
					clip: layer.clip,
					weight: Number(layer.weight.toFixed(4))
				})),
				mixedClips: [...runtimeState.activeAnimationClips],
				mixedActions: [...runtimeState.actions.entries()].filter(([, action]) => action.isScheduled() && action.enabled && action.getEffectiveWeight() > 1e-4).map(([name, action]) => ({
					name,
					weight: Number(action.getEffectiveWeight().toFixed(4)),
					paused: action.paused
				})),
				boundActions: runtimeState.actions.size,
				playbackRate: runtimeState.lastAnimation?.locomotion.playbackRate ?? null,
				footSlideMps: runtimeState.lastAnimation ? Number(runtimeState.lastAnimation.locomotion.footSlideMps.toFixed(4)) : null,
				footSlideRatio: runtimeState.lastAnimation ? Number(runtimeState.lastAnimation.locomotion.footSlideRatio.toFixed(4)) : null,
				directional: runtimeState.lastAnimation?.locomotion.directional ?? null,
				directionMismatch: runtimeState.lastAnimation ? Number(runtimeState.lastAnimation.locomotion.directionMismatch.toFixed(4)) : null,
				aimPitchRadians: runtimeState.lastAnimation ? Number(runtimeState.lastAnimation.aim.aimPitchRadians.toFixed(4)) : null,
				aimJointRadians: runtimeState.lastAnimation?.aim.aimJointRadians ?? null,
				postureSpineRadians: runtimeState.director.profile.posture.spinePitchRadians,
				turning: runtimeState.lastAnimation?.aim.turning ?? 0,
				visualYawLagRadians: Number(runtimeState.stancePivot.rotation.y.toFixed(4)),
				hitReactionWeight: runtimeState.lastAnimation ? Number(runtimeState.lastAnimation.hitReaction.clipWeight.toFixed(4)) : null,
				lazilyBoundDirectionalClips: runtimeState.lazilyBoundDirectionalClips
			}
		},
		skeletons: runtimeState.visual.getObjectsByProperty("isSkinnedMesh", true).length,
		visibleSkinnedMeshes,
		effectivelyVisibleSkinnedMeshes: effectiveSkinnedMeshes.map((mesh) => mesh.name),
		headBoneWorld: headBoneWorld?.toArray() ?? null,
		hitProxyHeadWorld: hitProxyHeadWorld?.toArray() ?? null,
		hitProxyHeadDelta: headBoneWorld && hitProxyHeadWorld ? headBoneWorld.distanceTo(hitProxyHeadWorld) : null,
		armBonesPresent: (runtimeState.armBindPose ?? []).length,
		armPose: {
			contract: "source-glb-skinned-anti-t-arm-chain-v2",
			reference: "authored-glb-local-transform-before-animation",
			thresholds: RIGGED_OPERATOR_ANTI_T_THRESHOLDS,
			expectedBoneCount: RIGGED_OPERATOR_ARM_BONES.length,
			bones: armPoseBones,
			chains: armChains,
			commonEffectiveSkinnedMeshes: commonEffectiveSkinMeshes,
			allPresent: armPoseBones.length === RIGGED_OPERATOR_ARM_BONES.length && armChains.every((chain) => chain.complete),
			allHierarchyValid: armChains.every((chain) => chain.complete && chain.directHierarchy === true),
			allInEffectivelyVisibleSkinnedMesh: armPoseBones.every((bone) => bone.inEffectivelyVisibleSkinnedMesh) && commonEffectiveSkinMeshes.length > 0,
			allHaveRenderedVertexInfluence: armPoseBones.every((bone) => bone.vertexInfluence.passes),
			renderedInfluenceCache: {
				contract: "static-rendered-influence-cache-v1",
				generation: renderedInfluenceCache.generation,
				computedBones: renderedInfluenceComputedBones,
				reusedBones: renderedInfluenceReusedBones,
				cachedBones: renderedInfluenceCache.byBone.size
			},
			allAntiTPoseGeometry: armChains.every((chain) => chain.complete && chain.antiTPoseGeometry === true),
			allFinite: armPoseBones.every((bone) => bone.finite) && armChains.every((chain) => !chain.complete || "armLength" in chain && chain.shoulderOutwardAxis?.length === 3 && chain.shoulderOutwardAxis.every(Number.isFinite) && [
				chain.upperArmLength,
				chain.forearmLength,
				chain.armLength,
				chain.elbowBendRadians,
				chain.elbowFlexRadians,
				chain.upperArmVerticalDrop,
				chain.forearmVerticalDrop,
				chain.shoulderToWristVerticalDrop,
				chain.shoulderToWristVerticalDropRatio,
				chain.shoulderToWristHorizontalReach,
				chain.shoulderToWristHorizontalReachRatio,
				chain.shoulderToWristOutwardReach,
				chain.shoulderToWristOutwardReachRatio,
				chain.verticalDropToOutwardReachRatio
			].every(Number.isFinite))
		},
		handPose: {
			contract: "source-glb-weighted-five-digit-sentinels-v2",
			reference: "shipped-lod0-walk-animated-second-phalanges",
			expectedBoneCount: RIGGED_OPERATOR_HAND_BONES.length,
			bones: handPoseBones,
			allPresent: handPoseBones.length === RIGGED_OPERATOR_HAND_BONES.length,
			allDescendantOfWrist: handPoseBones.every((bone) => bone.descendantOfWrist),
			allInEffectivelyVisibleSkinnedMesh: handPoseBones.every((bone) => bone.inEffectivelyVisibleSkinnedMesh) && commonEffectiveSkinMeshes.length > 0,
			allHaveRenderedVertexInfluence: handPoseBones.every((bone) => bone.vertexInfluence.passes),
			allFinite: handPoseBones.every((bone) => bone.finite)
		},
		meleeKnifeVisible: root.getObjectByName("operator-melee-knife")?.visible === true,
		mergedVertexLod: runtimeState.visual.getObjectByName("Swat_Merged_Vertex_LOD")?.visible === true,
		weaponChildren: runtimeState.weaponSocket.children.length,
		weaponSocketWorld: runtimeState.weaponSocket.getWorldPosition(new Vector3()).toArray(),
		weaponSocketQuaternion: runtimeState.weaponSocket.getWorldQuaternion(new Quaternion()).toArray(),
		weaponBounds,
		muzzleForwardDot,
		weaponMount: weaponRoot ? {
			modelId: weaponRoot.userData.weaponModelId ?? null,
			finishId: weaponRoot.userData.weaponFinishId ?? null,
			forwardCorrection: weaponRoot.userData.riggedForwardCorrection ?? null,
			directChild: weaponRoot.parent === runtimeState.weaponSocket,
			localPosition: weaponRoot.position.toArray(),
			localQuaternion: weaponRoot.quaternion.toArray(),
			localScale: weaponRoot.scale.toArray(),
			finite: [
				...weaponRoot.position.toArray(),
				...weaponRoot.quaternion.toArray(),
				...weaponRoot.scale.toArray()
			].every(Number.isFinite),
			localBounds: localMountBounds ? {
				center: localMountBounds.getCenter(new Vector3()).toArray(),
				size: localMountBounds.getSize(new Vector3()).toArray()
			} : null
		} : null,
		supportGrip: root.userData.operatorGripTelemetry ?? null,
		minigunSpool: root.userData.operatorMinigunSpoolTelemetry ?? null
	};
}
//#endregion
//#region src/minigun-spool.ts
var MINIGUN_PRESENTATION_SPIN_UP_MS = 1200;
function createMinigunSpoolState() {
	return {
		fraction: 0,
		angleRadians: 0,
		radiansPerSecond: 0,
		phase: "idle"
	};
}
function finiteDeltaSeconds(value) {
	return Number.isFinite(value) ? Math.max(0, Math.min(.05, value)) : 0;
}
/**
* Advances presentation only. Host shot admission remains the sole authority
* for the first legal round and consumes its own trigger-start timestamp.
*/
function advanceMinigunSpool(state, input) {
	const dt = finiteDeltaSeconds(input.dt);
	const target = input.equipped && input.triggerHeld ? 1 : 0;
	const priorFraction = state.fraction;
	const seconds = target > priorFraction ? MINIGUN_PRESENTATION_SPIN_UP_MS / 1e3 : 720 / 1e3;
	const step = seconds > 0 ? dt / seconds : 1;
	state.fraction = target > priorFraction ? Math.min(target, priorFraction + step) : Math.max(target, priorFraction - step);
	state.radiansPerSecond = 42 * state.fraction;
	state.angleRadians = (state.angleRadians + state.radiansPerSecond * dt) % (Math.PI * 2);
	state.phase = state.fraction <= 1e-6 ? "idle" : target === 1 && state.fraction >= .999999 ? "ready" : target === 1 ? "spooling-up" : "spooling-down";
	return state;
}
function resetMinigunSpool(state) {
	state.fraction = 0;
	state.angleRadians = 0;
	state.radiansPerSecond = 0;
	state.phase = "idle";
}
//#endregion
//#region src/runtime-random.ts
var streams = createRandomStreams("atomic-acres-unconfigured");
var configuredSeed = "atomic-acres-unconfigured";
function configureRuntimeRandom(seed) {
	configuredSeed = String(seed);
	streams = createRandomStreams(seed);
}
function gameplayRandom() {
	return streams.gameplay.next();
}
function presentationRandom() {
	return streams.presentation.next();
}
function protocolRandom() {
	return streams.protocol.next();
}
function runtimeRandomTelemetry() {
	return {
		seed: configuredSeed,
		gameplayState: streams.gameplay.snapshot(),
		presentationState: streams.presentation.snapshot(),
		protocolState: streams.protocol.snapshot()
	};
}
function runtimeSeed(search, cryptoSource = globalThis.crypto) {
	const requested = new URLSearchParams(search).get("seed")?.trim();
	if (requested) return requested;
	if (cryptoSource) {
		const values = /* @__PURE__ */ new Uint32Array(2);
		cryptoSource.getRandomValues(values);
		return `${values[0].toString(36)}-${values[1].toString(36)}`;
	}
	return Date.now();
}
//#endregion
//#region shared/leaderboard-policy.ts
/**
* Dependency-free leaderboard bounds shared by the browser client and the
* Cloudflare Worker. Import this module from both sides so kill/streak/death
* ceilings and hostile-input rejection stay exactly aligned.
*/
/** Shared defensive ceiling for kills and best-streak claims (Pass 40). */
var MAX_MATCH_KILLS = 9999;
/** Earliest accepted recordedAt (UTC ms). Rejects pre-product epoch garbage. */
var MIN_RECORDED_AT_MS = Date.UTC(2026, 0, 1);
function isSafeNonNegativeInteger(value, maxInclusive) {
	return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maxInclusive;
}
function isSafePositiveInteger(value, maxInclusive) {
	return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= maxInclusive;
}
function isValidKillCount(value) {
	return isSafeNonNegativeInteger(value, MAX_MATCH_KILLS);
}
function isValidDeathCount(value) {
	return isSafeNonNegativeInteger(value, 200);
}
function isValidStreakCount(value) {
	return isSafeNonNegativeInteger(value, MAX_MATCH_KILLS);
}
/** Immediate global streak submissions require a positive streak. */
function isValidSubmittedStreak(value) {
	return isSafePositiveInteger(value, MAX_MATCH_KILLS);
}
/**
* Kills must be a safe integer in range and cannot be below the claimed streak
* (a streak is a contiguous subset of kills).
*/
function isValidKillsForStreak(kills, streak) {
	return isValidKillCount(kills) && isValidStreakCount(streak) && Number(kills) >= Number(streak);
}
function isValidRecordedAt(value, now = Date.now()) {
	return Number.isSafeInteger(value) && Number(value) >= MIN_RECORDED_AT_MS && Number(value) <= now + 3e5;
}
/**
* Strict scalar validation for immediate streak rows. Rejects Infinity, NaN,
* fractions, negatives, over-ceiling values, kills < streak, and bad timestamps.
* Callers must still validate name/install identity separately.
*/
function parseImmediateStreakScalars(streak, kills, deaths, recordedAt, now = Date.now()) {
	if (!isValidSubmittedStreak(streak)) return null;
	if (!isValidKillsForStreak(kills, streak)) return null;
	if (!isValidDeathCount(deaths)) return null;
	if (!isValidRecordedAt(recordedAt, now)) return null;
	return {
		streak: Number(streak),
		kills: Number(kills),
		deaths: Number(deaths),
		recordedAt: Number(recordedAt)
	};
}
//#endregion
//#region src/high-scores.ts
var HIGH_SCORE_STORAGE_KEY = "atomic-acres:high-scores:v2";
function normalizeRequiredPlayerName(value) {
	const clean = value.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
	return /[a-zA-Z0-9]/.test(clean) ? clean : null;
}
function leaderboardNameKey(value) {
	const name = normalizeRequiredPlayerName(value);
	if (!name) return null;
	return [...name.toLocaleLowerCase()].map((character) => {
		if (/[a-z0-9]/.test(character)) return character;
		if (character === " ") return "_20";
		if (character === "-") return "_2d";
		return "_5f";
	}).join("");
}
function peerOwnedHighScores(senderName, entries) {
	const senderKey = leaderboardNameKey(senderName);
	if (!senderKey) return [];
	return entries.filter((entry) => leaderboardNameKey(entry.name) === senderKey);
}
function isHighScoreEntry(value, now = Date.now()) {
	if (!value || typeof value !== "object") return false;
	const entry = value;
	const normalizedName = typeof entry.name === "string" ? normalizeRequiredPlayerName(entry.name) : null;
	return typeof entry.id === "string" && /^[a-zA-Z0-9:_-]{1,120}$/.test(entry.id) && normalizedName === entry.name && isValidKillCount(entry.kills) && isValidDeathCount(entry.deaths) && isValidStreakCount(entry.bestStreak) && typeof entry.won === "boolean" && isValidRecordedAt(entry.recordedAt, now);
}
function compareHighScores(a, b) {
	return b.bestStreak - a.bestStreak || b.kills - a.kills || a.deaths - b.deaths || Number(b.won) - Number(a.won) || a.recordedAt - b.recordedAt || a.id.localeCompare(b.id);
}
function mergeHighScores(current, incoming, now = Date.now()) {
	const byPlayer = /* @__PURE__ */ new Map();
	for (const candidate of [...current, ...incoming]) {
		if (!isHighScoreEntry(candidate, now)) continue;
		const playerKey = leaderboardNameKey(candidate.name);
		if (!playerKey) continue;
		const existing = byPlayer.get(playerKey);
		if (!existing || compareHighScores(candidate, existing) < 0) byPlayer.set(playerKey, { ...candidate });
	}
	return [...byPlayer.values()].sort(compareHighScores).slice(0, 20);
}
function loadHighScores(storage, now = Date.now()) {
	try {
		const raw = storage.getItem(HIGH_SCORE_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (parsed.version !== 4 || !Array.isArray(parsed.entries)) return [];
		const merged = mergeHighScores([], parsed.entries.map((entry) => {
			if (!isHighScoreEntry(entry, now) || !entry.id.startsWith("global:")) return entry;
			const key = leaderboardNameKey(entry.name);
			return key ? {
				...entry,
				id: `global:${key}`
			} : entry;
		}), now);
		saveHighScores(storage, merged);
		return merged;
	} catch {
		return [];
	}
}
function saveHighScores(storage, entries) {
	const document = {
		version: 4,
		entries: mergeHighScores([], entries)
	};
	storage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify(document));
}
function personalBest(entries, playerName) {
	const normalized = normalizeRequiredPlayerName(playerName)?.toLocaleLowerCase();
	if (!normalized) return null;
	return entries.filter((entry) => entry.name.toLocaleLowerCase() === normalized).sort(compareHighScores)[0] ?? null;
}
function immediateStreakEntry(playerName, streak, kills, deaths, recordedAt = Date.now(), now = Date.now()) {
	const name = normalizeRequiredPlayerName(playerName);
	if (!name) return null;
	const scalars = parseImmediateStreakScalars(streak, kills, deaths, recordedAt, now);
	if (!scalars) return null;
	const nameKey = leaderboardNameKey(name);
	if (!nameKey) return null;
	return {
		id: `global:${nameKey}`,
		name,
		kills: scalars.kills,
		deaths: scalars.deaths,
		bestStreak: scalars.streak,
		won: false,
		recordedAt: scalars.recordedAt
	};
}
//#endregion
//#region shared/leaderboard-season.ts
var LEADERBOARD_SEASON = "2026-07-22-reset-01";
//#endregion
//#region src/participant-identity.ts
/**
* Protocol-owned actor namespaces must never be admitted as human identities.
* Otherwise a guest can alias map attribution or a hosted bot and corrupt the
* shared health, score and presentation maps keyed by participant id.
*/
function isReservedMultiplayerParticipantId(playerId) {
	return typeof playerId === "string" && (playerId.startsWith("map:") || playerId.startsWith("host-bot-"));
}
var CONTROL_AND_DIRECTIONAL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
function truncateCodePoints(value, maximum) {
	return Array.from(value).slice(0, maximum).join("");
}
function normalizeChatText(value) {
	return truncateCodePoints(value.normalize("NFKC").replace(CONTROL_AND_DIRECTIONAL_CHARACTERS, " ").replace(/\s+/gu, " ").trim(), 240) || null;
}
function isCanonicalChatText(value) {
	return typeof value === "string" && normalizeChatText(value) === value;
}
function normalizeChatSenderName(value) {
	return truncateCodePoints(value.normalize("NFKC").replace(CONTROL_AND_DIRECTIONAL_CHARACTERS, " ").replace(/\s+/gu, " ").trim(), 16) || "PLAYER";
}
function isChatEntry(value) {
	if (!value || typeof value !== "object") return false;
	const entry = value;
	return Number.isSafeInteger(entry.id) && Number(entry.id) >= 0 && typeof entry.senderId === "string" && entry.senderId.length > 0 && entry.senderId.length <= 80 && typeof entry.senderName === "string" && normalizeChatSenderName(entry.senderName) === entry.senderName && isCanonicalChatText(entry.text) && Number.isFinite(entry.sentAtHostTimeMs) && Number(entry.sentAtHostTimeMs) >= 0;
}
function appendChatHistory(history, entry) {
	if (history.some((candidate) => candidate.id === entry.id)) return [...history];
	return [...history, entry].slice(-32);
}
function normalizeChatHistory(value) {
	const unique = /* @__PURE__ */ new Map();
	for (const entry of value) if (isChatEntry(entry)) unique.set(entry.id, entry);
	return [...unique.values()].sort((a, b) => a.sentAtHostTimeMs - b.sentAtHostTimeMs || a.id - b.id).slice(-32);
}
function admitChatRate(state, nowMs) {
	const recent = state.filter((sentAt) => Number.isFinite(sentAt) && sentAt > nowMs - 4e3 && sentAt <= nowMs);
	if (recent.length >= 4) return {
		accepted: false,
		state: recent
	};
	return {
		accepted: true,
		state: [...recent, nowMs]
	};
}
var RAILGUN_SPAWN_DELAY_BASE_MS = 15e4;
var RAILGUN_SPAWN_DELAY_JITTER_MS = 3e4;
/** Legacy fixed delay, kept for the debug staging path and the protocol fixtures. */
var RAILGUN_SPAWN_DELAY_MS = 18e4;
function railgunSpawnDelayMs(randomUnit) {
	const decorrelated = (Number.isFinite(randomUnit) ? Math.min(Math.max(randomUnit, 0), 1) : 0) * .618033988749895 % 1;
	return Math.round(RAILGUN_SPAWN_DELAY_BASE_MS + (decorrelated * 2 - 1) * RAILGUN_SPAWN_DELAY_JITTER_MS);
}
var RAILGUN_RECHAMBER_MS = 1500;
var RAILGUN_TARGET_RADIUS_M = .62;
var RAILGUN_TARGET_HALF_HEIGHT_M = .78;
/**
* HF-384. World-space upper-room centres, derived from the LIVE layout.
*
* HOUSE_LAYOUT seats the aqua house at (4, -17.4) facing +1 and the coral house at
* (-4, 17.4) facing -1. Each house has two upper rooms at local (0, FLOOR_Y, +/-4)
* with FLOOR_Y 3.48, and worldPosition mirrors Z by `facing` but never X. Pickup
* height is FLOOR_Y + 0.70 = 4.18 m. The set stays exactly 180-degree symmetric.
*
* These were authored against the PRE-PASS-78 street-along-Z layout and never moved
* when the arena was rebuilt. After the rebuild not one of them was inside a house,
* and aqua-rear/coral-rear sat at |z| = 32 against ARENA_BOUNDS of |z| <= 30 - outside
* the map, where no player can stand. Sites are chosen uniformly, so HALF of all
* matches put the map's rare weapon permanently out of reach. Nothing failed: there is
* no clamping, no floor projection, and the pickup test is a bare distance check.
*
* The lesson is in the test below, not here. A hand-written coordinate cannot know the
* layout moved; the guard derives the rooms from the same source the arena is built
* from, so the next rebuild fails loudly instead of silently relocating the weapon.
*/
var RAILGUN_UPPER_ROOM_SPAWN_SITES = Object.freeze([
	Object.freeze({
		id: "aqua-front",
		position: [
			HOUSE_LAYOUT[0].x,
			4.18,
			HOUSE_LAYOUT[0].z + 4 * HOUSE_LAYOUT[0].facing
		]
	}),
	Object.freeze({
		id: "aqua-rear",
		position: [
			HOUSE_LAYOUT[0].x,
			4.18,
			HOUSE_LAYOUT[0].z - 4 * HOUSE_LAYOUT[0].facing
		]
	}),
	Object.freeze({
		id: "coral-front",
		position: [
			HOUSE_LAYOUT[1].x,
			4.18,
			HOUSE_LAYOUT[1].z + 4 * HOUSE_LAYOUT[1].facing
		]
	}),
	Object.freeze({
		id: "coral-rear",
		position: [
			HOUSE_LAYOUT[1].x,
			4.18,
			HOUSE_LAYOUT[1].z - 4 * HOUSE_LAYOUT[1].facing
		]
	})
]);
function validHostTime$1(value) {
	return Number.isFinite(value) && value >= 0;
}
function validPlayerId$1(value) {
	return value.length > 0 && value.length <= 80;
}
function copyPosition$1(value) {
	return [
		value[0],
		value[1],
		value[2]
	];
}
function chooseRailgunUpperRoom(randomUnit) {
	return RAILGUN_UPPER_ROOM_SPAWN_SITES[Math.floor((Number.isFinite(randomUnit) ? Math.max(0, Math.min(.999999999999, randomUnit)) : 0) * RAILGUN_UPPER_ROOM_SPAWN_SITES.length)];
}
/** Host-only match initialization. Non-Nuke-Town arenas never schedule the pickup. */
function createRailgunAuthorityState(arenaId, matchStartedAtHostTimeMs, randomUnit = Math.random(), generation = 1) {
	if (arenaId !== "atomic-acres" || !validHostTime$1(matchStartedAtHostTimeMs)) return {
		generation,
		revision: 0,
		status: "disabled",
		spawnAtHostTimeMs: null,
		spawnSite: null,
		pickupPosition: null,
		holderId: null,
		roundsRemaining: 8,
		chamberReadyAtHostTimeMs: 0,
		announcementSent: false,
		processedShotIds: []
	};
	const spawnSite = chooseRailgunUpperRoom(randomUnit);
	return {
		generation,
		revision: 0,
		status: "scheduled",
		spawnAtHostTimeMs: matchStartedAtHostTimeMs + railgunSpawnDelayMs(randomUnit),
		spawnSite,
		pickupPosition: copyPosition$1(spawnSite.position),
		holderId: null,
		roundsRemaining: 8,
		chamberReadyAtHostTimeMs: 0,
		announcementSent: false,
		processedShotIds: []
	};
}
/** Advance on the host monotonic clock. The announcement is emitted exactly on the spawn transition. */
function advanceRailgunAuthority(state, now) {
	if (state.status !== "scheduled" || state.spawnAtHostTimeMs === null || !validHostTime$1(now) || now < state.spawnAtHostTimeMs) return {
		state,
		spawned: false,
		announcement: null
	};
	const announce = !state.announcementSent;
	return {
		state: {
			...state,
			revision: state.revision + 1,
			status: "available",
			announcementSent: true
		},
		spawned: true,
		announcement: announce ? "RARE WEAPON SPAWNED" : null
	};
}
function claimRailgun(state, playerId, generation) {
	if (state.status !== "available" || state.generation !== generation || !validPlayerId$1(playerId) || state.roundsRemaining <= 0) return {
		accepted: false,
		state
	};
	return {
		accepted: true,
		state: {
			...state,
			revision: state.revision + 1,
			status: "held",
			holderId: playerId,
			pickupPosition: null
		}
	};
}
/**
* Re-arms the canonical railgun only from the secure Gun Range test bay. This
* is host/offline authority, never a peer claim, and deliberately resets the
* finite eight-round training magazine without weakening normal match rules.
*/
function grantTrainingRailgun(state, playerId, context) {
	if (!validPlayerId$1(playerId) || context.arenaId !== "gun-range" || context.stationKind !== "secure-test-bay" || context.authorityRole !== "offline" && context.authorityRole !== "host") return {
		accepted: false,
		state
	};
	return {
		accepted: true,
		state: {
			...state,
			revision: state.revision + 1,
			status: "held",
			spawnAtHostTimeMs: null,
			spawnSite: null,
			pickupPosition: null,
			holderId: playerId,
			roundsRemaining: 8,
			chamberReadyAtHostTimeMs: 0,
			announcementSent: true,
			processedShotIds: []
		}
	};
}
function advanceRailgunChamber(state, now) {
	if (state.status !== "held" || state.roundsRemaining <= 0 || state.chamberReadyAtHostTimeMs <= 0 || !validHostTime$1(now)) return state;
	return now >= state.chamberReadyAtHostTimeMs ? {
		...state,
		revision: state.revision + 1,
		chamberReadyAtHostTimeMs: 0
	} : state;
}
function fireRailgun(state, playerId, shotId, now) {
	const base = {
		state,
		accepted: false,
		duplicate: false,
		damage: 0,
		penetrationMultiplier: 0,
		adsAfterShot: false,
		rechamberMs: 0
	};
	if (state.processedShotIds.includes(shotId)) return {
		...base,
		duplicate: true,
		reason: "duplicate"
	};
	if (!validPlayerId$1(playerId) || shotId.length < 8 || shotId.length > 128 || !validHostTime$1(now)) return {
		...base,
		reason: "invalid"
	};
	if (state.status !== "held" || state.holderId !== playerId) return {
		...base,
		reason: "not-holder"
	};
	if (state.roundsRemaining <= 0) return {
		...base,
		reason: "empty"
	};
	if (state.chamberReadyAtHostTimeMs > now) return {
		...base,
		reason: "not-ready"
	};
	const roundsRemaining = state.roundsRemaining - 1;
	const nextProcessed = [...state.processedShotIds, shotId].slice(-64);
	return {
		state: {
			...state,
			revision: state.revision + 1,
			status: roundsRemaining === 0 ? "depleted" : "held",
			roundsRemaining,
			chamberReadyAtHostTimeMs: roundsRemaining === 0 ? 0 : now + RAILGUN_RECHAMBER_MS,
			processedShotIds: nextProcessed
		},
		accepted: true,
		duplicate: false,
		reason: "accepted",
		damage: 50,
		penetrationMultiplier: 1,
		adsAfterShot: false,
		rechamberMs: roundsRemaining === 0 ? 0 : RAILGUN_RECHAMBER_MS
	};
}
function dropRailgun(state, playerId, position) {
	if (state.status !== "held" || state.holderId !== playerId || state.roundsRemaining <= 0 || position.length !== 3 || !position.every(Number.isFinite)) return {
		dropped: false,
		state
	};
	return {
		dropped: true,
		state: {
			...state,
			revision: state.revision + 1,
			status: "available",
			holderId: null,
			pickupPosition: copyPosition$1(position)
		}
	};
}
function isStaleRailgunAuthorityState(current, incoming) {
	return incoming.generation < current.generation || incoming.generation === current.generation && incoming.revision < current.revision;
}
function railgunStateResyncDue(lastSentAt, now) {
	return validHostTime$1(now) && (!Number.isFinite(lastSentAt) || now - lastSentAt >= 1e3);
}
function railgunThermalTargetEligible(observer, target, mode) {
	if (!target.alive || observer.id === target.id) return false;
	return mode === "ffa" || observer.team !== target.team;
}
/**
* Host-only geometric oracle for the map-spanning shot. The caller supplies
* current-life hostility; this function owns ray admission and deterministic
* near-to-far ordering. Invalid or over-cap actor sets fail closed.
*/
function admitRailgunTargets(origin, direction, candidates) {
	if (!isVector3(origin) || !isVector3(direction)) return Object.freeze({
		accepted: false,
		reason: "invalid-ray",
		targets: Object.freeze([])
	});
	const magnitude = Math.hypot(direction[0], direction[1], direction[2]);
	if (magnitude < .96 || magnitude > 1.04) return Object.freeze({
		accepted: false,
		reason: "invalid-ray",
		targets: Object.freeze([])
	});
	if (candidates.length > 9) return Object.freeze({
		accepted: false,
		reason: "candidate-cap",
		targets: Object.freeze([])
	});
	const ids = /* @__PURE__ */ new Set();
	for (const candidate of candidates) {
		if (!validPlayerId$1(candidate.target) || !isVector3(candidate.position) || typeof candidate.alive !== "boolean" || typeof candidate.hostile !== "boolean") return Object.freeze({
			accepted: false,
			reason: "invalid-candidate",
			targets: Object.freeze([])
		});
		if (ids.has(candidate.target)) return Object.freeze({
			accepted: false,
			reason: "duplicate-candidate",
			targets: Object.freeze([])
		});
		ids.add(candidate.target);
	}
	const normalized = [
		direction[0] / magnitude,
		direction[1] / magnitude,
		direction[2] / magnitude
	];
	const radiusSquared = RAILGUN_TARGET_RADIUS_M * RAILGUN_TARGET_RADIUS_M;
	const targets = candidates.flatMap((candidate) => {
		if (!candidate.alive || !candidate.hostile) return [];
		const deltaX = candidate.position[0] - origin[0];
		const deltaY = candidate.position[1] - origin[1];
		const deltaZ = candidate.position[2] - origin[2];
		const distanceMeters = deltaX * normalized[0] + deltaY * normalized[1] + deltaZ * normalized[2];
		if (distanceMeters < .1 || distanceMeters > 180) return [];
		const closestX = origin[0] + normalized[0] * distanceMeters;
		const closestY = origin[1] + normalized[1] * distanceMeters;
		const closestZ = origin[2] + normalized[2] * distanceMeters;
		const verticalExcess = Math.max(0, Math.abs(candidate.position[1] - closestY) - RAILGUN_TARGET_HALF_HEIGHT_M);
		return (candidate.position[0] - closestX) ** 2 + verticalExcess ** 2 + (candidate.position[2] - closestZ) ** 2 <= radiusSquared ? [{
			target: candidate.target,
			distanceMeters
		}] : [];
	}).sort((left, right) => left.distanceMeters - right.distanceMeters || left.target.localeCompare(right.target));
	return Object.freeze({
		accepted: true,
		reason: "accepted",
		targets: Object.freeze(targets.map((target) => Object.freeze(target)))
	});
}
function createRailgunBeamAuthority(generation, shotId, origin, direction) {
	const magnitude = Math.hypot(direction[0], direction[1], direction[2]);
	if (!Number.isSafeInteger(generation) || generation < 0 || shotId.length < 8 || shotId.length > 128 || !isVector3(origin) || !isVector3(direction) || magnitude < .96 || magnitude > 1.04) throw new Error("invalid authoritative railgun beam");
	const normalized = [
		direction[0] / magnitude,
		direction[1] / magnitude,
		direction[2] / magnitude
	];
	return Object.freeze({
		generation,
		shotId,
		start: Object.freeze([...origin]),
		end: Object.freeze([
			origin[0] + normalized[0] * 180,
			origin[1] + normalized[1] * 180,
			origin[2] + normalized[2] * 180
		])
	});
}
function isRailgunBeamAuthority(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const beam = value;
	if (Object.keys(value).some((key) => key !== "generation" && key !== "shotId" && key !== "start" && key !== "end") || !Number.isSafeInteger(beam.generation) || Number(beam.generation) < 0 || typeof beam.shotId !== "string" || beam.shotId.length < 8 || beam.shotId.length > 128 || !isVector3(beam.start) || !isVector3(beam.end)) return false;
	const length = Math.hypot(beam.end[0] - beam.start[0], beam.end[1] - beam.start[1], beam.end[2] - beam.start[2]);
	return Math.abs(length - 180) <= 1e-4;
}
function isVector3(value) {
	return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}
function hasExactKeys(value, expected) {
	const keys = Object.keys(value);
	return keys.length === expected.length && keys.every((key) => expected.includes(key));
}
var RAILGUN_AUTHORITY_STATE_KEYS = Object.freeze([
	"generation",
	"revision",
	"status",
	"spawnAtHostTimeMs",
	"spawnSite",
	"pickupPosition",
	"holderId",
	"roundsRemaining",
	"chamberReadyAtHostTimeMs",
	"announcementSent",
	"processedShotIds"
]);
var RAILGUN_SPAWN_SITE_KEYS = Object.freeze(["id", "position"]);
var RAILGUN_CLAIM_REQUEST_KEYS = Object.freeze([
	"type",
	"protocolVersion",
	"by",
	"generation",
	"position",
	"nonce"
]);
var RAILGUN_SHOT_REQUEST_KEYS = Object.freeze([
	"type",
	"protocolVersion",
	"by",
	"generation",
	"shotId",
	"origin",
	"direction",
	"fireTimeMs",
	"nonce"
]);
var RAILGUN_STATE_MESSAGE_KEYS = Object.freeze([
	"type",
	"protocolVersion",
	"by",
	"state",
	"nonce"
]);
var RAILGUN_SHOT_RESULT_KEYS = Object.freeze([
	"type",
	"protocolVersion",
	"by",
	"forPlayerId",
	"generation",
	"shotId",
	"status",
	"reason",
	"outcomes",
	"beam",
	"nonce"
]);
function isRailgunAuthorityState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value) || !hasExactKeys(value, RAILGUN_AUTHORITY_STATE_KEYS)) return false;
	const state = value;
	return Number.isSafeInteger(state.generation) && Number(state.generation) >= 0 && Number.isSafeInteger(state.revision) && Number(state.revision) >= 0 && (state.status === "disabled" || state.status === "scheduled" || state.status === "available" || state.status === "held" || state.status === "depleted") && (state.spawnAtHostTimeMs === null || validHostTime$1(Number(state.spawnAtHostTimeMs))) && (state.spawnSite === null || typeof state.spawnSite === "object" && !Array.isArray(state.spawnSite) && hasExactKeys(state.spawnSite, RAILGUN_SPAWN_SITE_KEYS) && RAILGUN_UPPER_ROOM_SPAWN_SITES.some((site) => site.id === state.spawnSite?.id && isVector3(state.spawnSite.position) && site.position.every((valueAtAxis, axis) => valueAtAxis === state.spawnSite?.position[axis]))) && (state.pickupPosition === null || isVector3(state.pickupPosition)) && (state.holderId === null || typeof state.holderId === "string" && validPlayerId$1(state.holderId)) && Number.isSafeInteger(state.roundsRemaining) && Number(state.roundsRemaining) >= 0 && Number(state.roundsRemaining) <= 8 && validHostTime$1(Number(state.chamberReadyAtHostTimeMs)) && typeof state.announcementSent === "boolean" && Array.isArray(state.processedShotIds) && state.processedShotIds.length <= 64 && state.processedShotIds.every((id) => typeof id === "string" && id.length >= 8 && id.length <= 128) && new Set(state.processedShotIds).size === state.processedShotIds.length;
}
function isRailgunProtocolMessage(value, protocolVersion) {
	if (!value || typeof value !== "object") return false;
	const message = value;
	if (message.protocolVersion !== protocolVersion || typeof message.by !== "string" || !validPlayerId$1(message.by) || !Number.isSafeInteger(message.nonce) || Number(message.nonce) < 0) return false;
	if (message.type === "railgun-claim-request") return hasExactKeys(message, RAILGUN_CLAIM_REQUEST_KEYS) && Number.isSafeInteger(message.generation) && Number(message.generation) >= 0 && isVector3(message.position);
	if (message.type === "railgun-shot-request") return hasExactKeys(message, RAILGUN_SHOT_REQUEST_KEYS) && Number.isSafeInteger(message.generation) && Number(message.generation) >= 0 && typeof message.shotId === "string" && message.shotId.length >= 8 && message.shotId.length <= 128 && isVector3(message.origin) && isVector3(message.direction) && validHostTime$1(Number(message.fireTimeMs));
	if (message.type === "railgun-shot-result") {
		const outcomes = message.outcomes;
		const reasons = /* @__PURE__ */ new Set([
			"accepted",
			"not-holder",
			"not-ready",
			"empty",
			"invalid",
			"duplicate"
		]);
		const accepted = message.status === "accepted-hit" || message.status === "accepted-miss";
		const beam = message.beam;
		return hasExactKeys(message, RAILGUN_SHOT_RESULT_KEYS) && typeof message.forPlayerId === "string" && validPlayerId$1(message.forPlayerId) && Number.isSafeInteger(message.generation) && Number(message.generation) >= 0 && typeof message.shotId === "string" && message.shotId.length >= 8 && message.shotId.length <= 128 && (message.status === "accepted-hit" || message.status === "accepted-miss" || message.status === "rejected") && reasons.has(message.reason) && (accepted ? message.reason === "accepted" && isRailgunBeamAuthority(beam) && beam.generation === message.generation && beam.shotId === message.shotId : message.reason !== "accepted" && beam === null) && Array.isArray(outcomes) && outcomes.length <= 9 && (message.status === "accepted-hit" ? outcomes.length >= 1 : outcomes.length === 0) && new Set(outcomes.map((outcome) => outcome && typeof outcome === "object" ? outcome.target : null)).size === outcomes.length && outcomes.every((outcome) => {
			if (!outcome || typeof outcome !== "object") return false;
			const candidate = outcome;
			return Object.keys(outcome).length === 6 && Object.keys(outcome).every((key) => key === "target" || key === "damageRequested" || key === "damageApplied" || key === "resultingHealth" || key === "died" || key === "distanceMeters") && typeof candidate.target === "string" && validPlayerId$1(candidate.target) && candidate.target !== message.forPlayerId && candidate.damageRequested === 50 && Number.isFinite(candidate.damageApplied) && Number(candidate.damageApplied) > 0 && Number(candidate.damageApplied) <= 50 && Number.isFinite(candidate.resultingHealth) && Number(candidate.resultingHealth) >= 0 && Number(candidate.resultingHealth) <= 100 && typeof candidate.died === "boolean" && candidate.died === (candidate.resultingHealth === 0) && Number.isFinite(candidate.distanceMeters) && Number(candidate.distanceMeters) >= .1 && Number(candidate.distanceMeters) <= 180;
		}) && outcomes.every((outcome, index) => {
			if (index === 0) return true;
			const previous = outcomes[index - 1];
			const current = outcome;
			return current.distanceMeters > previous.distanceMeters || current.distanceMeters === previous.distanceMeters && current.target.localeCompare(previous.target) > 0;
		});
	}
	return message.type === "railgun-state" && hasExactKeys(message, RAILGUN_STATE_MESSAGE_KEYS) && isRailgunAuthorityState(message.state);
}
//#endregion
//#region src/killstreak-support-catalog.ts
/** Frozen inspected baseline; variants derive exact multipliers from this row. */
var DRONE_GUN_PROFILE_ID = "drone-gun-inspected-baseline-v1";
var PILOTED_DRONE_GUN_PROFILE_ID = "piloted-drone-gun-half-baseline-v1";
var DRONE_SWARM_GUN_PROFILE_ID = "drone-swarm-gun-double-baseline-v1";
/**
* One immutable combat profile is shared by both drone modes. Reserve policy,
* lifetime, and controller are intentionally absent so they cannot drift the
* damage, cadence, range, ammunition, reload, falloff, or penetration rules.
*/
var DRONE_GUN_PROFILE = Object.freeze({
	id: DRONE_GUN_PROFILE_ID,
	damage: 12,
	minimumDamage: 8,
	falloffStartM: 18,
	cadenceMs: 300,
	rpm: 200,
	maximumRangeM: 45,
	magazineSize: 20,
	reloadMs: 1400,
	falloff: "linear",
	penetration: "solid-occluded",
	criticalHits: false
});
function scaledDroneGunProfile(id, multiplier) {
	return Object.freeze({
		...DRONE_GUN_PROFILE,
		id,
		damage: DRONE_GUN_PROFILE.damage * multiplier,
		minimumDamage: DRONE_GUN_PROFILE.minimumDamage * multiplier
	});
}
/** Exact user-approved combat variants; all non-damage behavior stays baseline-identical. */
var PILOTED_DRONE_GUN_PROFILE = scaledDroneGunProfile(PILOTED_DRONE_GUN_PROFILE_ID, .5);
var DRONE_SWARM_GUN_PROFILE = scaledDroneGunProfile(DRONE_SWARM_GUN_PROFILE_ID, 2);
var CHOPPER_GUN_PROFILE = Object.freeze({
	id: "chopper-gun-standard-v2",
	damage: 34,
	minimumDamage: 22,
	falloffStartM: 28,
	maximumRangeM: 78,
	cadenceMs: 240,
	rpm: 6e4 / 240,
	penetration: "solid-occluded",
	criticalHits: false
});
/**
* Host-owned geometry for the possessed Chopper Gunner fire contract. These
* offsets are the authored LOD0 socket transforms after Blender-to-glTF axis
* conversion; gameplay never reads a rendered/interpolated Object3D pose.
*/
var CHOPPER_GUNNER_RAY_POLICY = Object.freeze({
	cameraSocketLocalM: Object.freeze([
		0,
		.74,
		-.38
	]),
	cameraForwardNudgeM: .08,
	muzzleSocketLocalM: Object.freeze([
		0,
		-.82,
		-3.32
	]),
	/**
	* HF-135 replaced a forgiving cone with a centre-ray capsule so off-crosshair
	* targets can never register. The owner reported twice that a 0.62 m capsule
	* made held fire from orbit altitude feel completely dead, so this is widened
	* to one torso width. It remains a centre-ray capsule: a target a full 2 m off
	* the crosshair is still rejected, and it must never become a cone again.
	*/
	targetRadiusM: 1
});
/** Pure host-side balance oracle shared by AI and owner-controlled fire. */
function supportGunDamageAtDistance(profile, distanceM) {
	if (!Number.isFinite(distanceM) || distanceM < 0 || distanceM > profile.maximumRangeM) return 0;
	const falloffSpan = Math.max(.001, profile.maximumRangeM - profile.falloffStartM);
	const alpha = Math.max(0, Math.min(1, (distanceM - profile.falloffStartM) / falloffSpan));
	return Math.max(1, Math.round(profile.damage + (profile.minimumDamage - profile.damage) * alpha));
}
var PILOTED_DRONE_SENSOR_PROFILE = Object.freeze({
	id: "piloted-drone-hostile-through-wall-v1",
	maximumRangeM: 50,
	forwardConeDegrees: 90,
	refreshMs: 250,
	revealPolicy: "living-hostiles-only",
	presentationOnly: true,
	changesBallisticAuthority: false
});
var DRONE_PRESENTATION_FAMILY_ID = "hunter-drone-visual-family-v1";
/**
* Shared deployment and movement policy for both drone variants. Spawn origin
* is authority, not presentation: callers cannot relocate either variant by
* supplying an activation anchor. The standalone AI is deliberately twice as
* quick as direct owner control while the 24-unit Swarm retains its separately
* pressure-calibrated ingress and patrol speeds.
*/
var DRONE_DEPLOYMENT_POLICY = Object.freeze({
	spawnOrigin: "deterministic-valid-centre-map-volume",
	minimumSpawnSeparationM: 1.15,
	maximumAdmissionProbesPerUnit: 36,
	manualHorizontalSpeedMps: 3,
	manualVerticalSpeedMps: 3,
	autonomousStandaloneSpeedMultiplier: 2,
	autonomousStandaloneSpeedMps: 6,
	swarmIngressSpeedMps: 22,
	swarmPatrolSpeedMps: 7
});
/** Later owner correction: both standalone and 24-unit swarm support expire after 30 seconds. */
var DRONE_SUPPORT_LIFETIMES_MS = Object.freeze({
	piloted: 3e4,
	swarm: 3e4
});
var DRONE_SUPPORT_DEFINITIONS = Object.freeze({
	piloted: Object.freeze({
		mode: "piloted",
		gunProfileId: PILOTED_DRONE_GUN_PROFILE_ID,
		magazineSize: 20,
		reservePolicy: "three-magazines-total",
		lifetimeMs: DRONE_SUPPORT_LIFETIMES_MS.piloted,
		sensorProfileId: PILOTED_DRONE_SENSOR_PROFILE.id,
		presentationFamilyId: DRONE_PRESENTATION_FAMILY_ID,
		controllerOptions: Object.freeze(["ai", "owner-player"])
	}),
	swarm: Object.freeze({
		mode: "swarm",
		gunProfileId: DRONE_SWARM_GUN_PROFILE_ID,
		magazineSize: 20,
		reservePolicy: "unlimited-reloads-until-expiry",
		lifetimeMs: DRONE_SUPPORT_LIFETIMES_MS.swarm,
		sensorProfileId: null,
		presentationFamilyId: DRONE_PRESENTATION_FAMILY_ID,
		controllerOptions: Object.freeze(["ai"])
	})
});
function droneGunProfileFor(mode) {
	const definition = DRONE_SUPPORT_DEFINITIONS[mode];
	const profile = mode === "piloted" ? PILOTED_DRONE_GUN_PROFILE : DRONE_SWARM_GUN_PROFILE;
	if (definition.gunProfileId !== profile.id) throw new Error(`${mode} drone references an unknown gun profile`);
	return profile;
}
//#endregion
//#region src/killstreak-catalog.ts
var CARE_PACKAGE_KILLSTREAK_ID = "care-package";
var NUKE_KILLSTREAK_ID = "nuke";
var CRIMSON_FLAMETHROWER_KILLSTREAK_ID = "crimson-flamethrower";
/**
* HF-334: rewards whose care-package probability is an EXACT percentage rather
* than a share of the weighted pool. The Nuke has always been exactly 1%; the
* owner asked for the flamethrower reward at exactly 10%, which no integer
* base weight can express while the Nuke stays exactly 1% (the arithmetic
* demands a weight of 1230/89). Declaring it fixed makes the owner's number
* exact instead of approximated.
*
* A fixed reward carries zero base weight and is optional: a catalog that
* omits one simply redistributes its percentage to the weighted entries, so
* this stays backwards-compatible with any catalog that predates it.
*/
var CARE_PACKAGE_FIXED_PERCENTS = Object.freeze({
	[NUKE_KILLSTREAK_ID]: 1,
	[CRIMSON_FLAMETHROWER_KILLSTREAK_ID]: 10
});
var SOURCE_KEYS = Object.freeze([
	"id",
	"displayName",
	"cost",
	"tier",
	"availability",
	"carePackageBaseWeightUnits",
	"relationship",
	"activation",
	"durationMs",
	"repeatable"
]);
var TIERS = [
	"low",
	"mid",
	"high",
	"top"
];
var AVAILABILITIES = [
	"selectable",
	"care-only",
	"retired"
];
var ACTIVATIONS = [
	"instant",
	"target-point",
	"target-line",
	"possession"
];
function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys$11(value, expected, label) {
	const unknown = Object.keys(value).filter((key) => !expected.includes(key));
	const missing = expected.filter((key) => !Object.hasOwn(value, key));
	if (unknown.length > 0 || missing.length > 0) throw new Error(`${label} keys invalid; unknown=[${unknown.join(",")}] missing=[${missing.join(",")}]`);
}
function safeMultiply(left, right, label) {
	const result = left * right;
	if (!Number.isSafeInteger(result)) throw new Error(`${label} exceeds safe-integer range`);
	return result;
}
function safeAdd(left, right, label) {
	const result = left + right;
	if (!Number.isSafeInteger(result)) throw new Error(`${label} exceeds safe-integer range`);
	return result;
}
function validateSourceDefinition(value, index) {
	if (!isPlainObject(value)) throw new Error(`catalog[${index}] must be an object`);
	exactKeys$11(value, SOURCE_KEYS, `catalog[${index}]`);
	const label = typeof value.id === "string" ? value.id : `catalog[${index}]`;
	if (typeof value.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value.id)) throw new Error(`${label} has invalid ID`);
	if (typeof value.displayName !== "string" || value.displayName.trim().length === 0 || value.displayName.length > 80) throw new Error(`${label} has invalid display name`);
	const minimumCost = value.availability === "care-only" ? 0 : 1;
	if (!Number.isSafeInteger(value.cost) || value.cost < minimumCost || value.cost > 100) throw new Error(`${label} has invalid cost`);
	if (!TIERS.includes(value.tier)) throw new Error(`${label} has invalid tier`);
	if (!AVAILABILITIES.includes(value.availability)) throw new Error(`${label} has invalid availability`);
	if (!Number.isSafeInteger(value.carePackageBaseWeightUnits) || value.carePackageBaseWeightUnits < 0) throw new Error(`${label} has invalid care-package base weight`);
	if (typeof value.relationship !== "string" || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value.relationship)) throw new Error(`${label} has invalid relationship`);
	if (!ACTIVATIONS.includes(value.activation)) throw new Error(`${label} has invalid activation`);
	if (!Number.isSafeInteger(value.durationMs) || value.durationMs < 0 || value.durationMs > 6e5) throw new Error(`${label} has invalid duration`);
	if (typeof value.repeatable !== "boolean") throw new Error(`${label} has invalid repeatable policy`);
}
function freezeSourceDefinitions(sources) {
	for (const source of sources) Object.freeze(source);
	Object.freeze(sources);
	return sources;
}
/**
* Builds the immutable catalog and care pool from one authored definition list.
* Adding, renaming, retiring, repricing, or reweighting an entry necessarily
* reruns this projection; callers cannot provide a second eligible-ID list or
* independently authored derived weight.
*/
function createKillstreakCatalog(rawSources) {
	if (!Array.isArray(rawSources) || rawSources.length === 0) throw new Error("killstreak catalog must be a non-empty array");
	rawSources.forEach((source, index) => validateSourceDefinition(source, index));
	const sources = rawSources;
	const ids = sources.map((source) => source.id);
	if (new Set(ids).size !== ids.length) throw new Error("killstreak catalog IDs must be unique");
	const carePackage = sources.find((source) => source.id === CARE_PACKAGE_KILLSTREAK_ID);
	const nuke = sources.find((source) => source.id === NUKE_KILLSTREAK_ID);
	if (!carePackage) throw new Error("care-package definition is required");
	if (!nuke) throw new Error("nuke definition is required");
	if (carePackage.availability !== "selectable" || carePackage.carePackageBaseWeightUnits !== 0) throw new Error("care-package must be selectable with zero recursive base weight");
	if (nuke.availability !== "selectable" || nuke.carePackageBaseWeightUnits !== 0) throw new Error("nuke must be selectable with its fixed-probability base weight set to zero");
	const fixedPercentById = /* @__PURE__ */ new Map();
	for (const source of sources) {
		const percent = CARE_PACKAGE_FIXED_PERCENTS[source.id];
		if (percent === void 0 || source.availability === "retired") continue;
		fixedPercentById.set(source.id, percent);
	}
	const fixedPercentTotal = [...fixedPercentById.values()].reduce((total, percent) => total + percent, 0);
	if (fixedPercentTotal >= 100) throw new Error("care-package fixed rewards cannot claim the whole pool");
	const weightedScale = 100 - fixedPercentTotal;
	let nonNukeBaseWeightTotal = 0;
	for (const source of sources) {
		if (!(source.availability !== "retired" && source.id !== "care-package") || fixedPercentById.has(source.id)) {
			if (source.carePackageBaseWeightUnits !== 0) throw new Error(`${source.id} must have zero care-package base weight`);
			continue;
		}
		if (source.carePackageBaseWeightUnits <= 0) throw new Error(`${source.id} is care-package eligible and requires positive base weight`);
		nonNukeBaseWeightTotal = safeAdd(nonNukeBaseWeightTotal, source.carePackageBaseWeightUnits, "care-package non-Nuke base total");
	}
	if (nonNukeBaseWeightTotal <= 0) throw new Error("care-package pool requires a positive non-Nuke base total");
	const weightFor = (source) => {
		if (source.availability === "retired" || source.id === "care-package") return 0;
		const fixedPercent = fixedPercentById.get(source.id);
		if (fixedPercent !== void 0) return safeMultiply(nonNukeBaseWeightTotal, fixedPercent, `${source.id} fixed care weight`);
		return safeMultiply(source.carePackageBaseWeightUnits, weightedScale, `${source.id} derived care weight`);
	};
	const definitions = Object.freeze(sources.map((source) => Object.freeze({
		...source,
		carePackageWeightUnits: weightFor(source)
	})));
	let cursor = 0;
	const entries = [];
	for (const definition of definitions) {
		if (definition.carePackageWeightUnits === 0) continue;
		const startInclusive = cursor;
		cursor = safeAdd(cursor, definition.carePackageWeightUnits, "care-package derived total");
		entries.push(Object.freeze({
			id: definition.id,
			weightUnits: definition.carePackageWeightUnits,
			startInclusive,
			endExclusive: cursor
		}));
	}
	const expectedTotal = safeMultiply(nonNukeBaseWeightTotal, 100, "care-package expected total");
	if (cursor !== expectedTotal) throw new Error(`care-package formula mismatch ${cursor}/${expectedTotal}`);
	for (const [fixedId, percent] of fixedPercentById) {
		const entry = entries.find((candidate) => candidate.id === fixedId);
		if (!entry || safeMultiply(entry.weightUnits, 100, `${fixedId} fixed check`) !== safeMultiply(cursor, percent, `${fixedId} fixed target`)) throw new Error(`${fixedId} must equal exactly ${percent} percent of the care-package pool`);
	}
	return Object.freeze({
		definitions,
		carePackagePool: Object.freeze({
			entries: Object.freeze(entries),
			nonNukeBaseWeightTotal,
			totalWeightUnits: cursor,
			fixedNukeProbability: Object.freeze({
				numerator: 1,
				denominator: 100
			}),
			fixedPercents: Object.freeze(Object.fromEntries(fixedPercentById))
		})
	});
}
function rewardForCarePackageUnit(catalog, unit) {
	if (!Number.isSafeInteger(unit) || unit < 0 || unit >= catalog.carePackagePool.totalWeightUnits) throw new Error(`care-package roll unit ${unit} is out of range`);
	const reward = catalog.carePackagePool.entries.find((entry) => unit < entry.endExclusive);
	if (!reward) throw new Error("care-package pool has no reward for admitted unit");
	return reward.id;
}
var PASS65_KILLSTREAK_CATALOG = createKillstreakCatalog(freezeSourceDefinitions([
	{
		id: "scout-sweep",
		displayName: "Scout Sweep",
		cost: 3,
		tier: "low",
		availability: "selectable",
		carePackageBaseWeightUnits: 24,
		relationship: "retained-slot-1",
		activation: "instant",
		durationMs: 12e3,
		repeatable: false
	},
	{
		id: "adrenaline",
		displayName: "Adrenaline Boost",
		cost: 3,
		tier: "low",
		availability: "selectable",
		carePackageBaseWeightUnits: 24,
		relationship: "scout-sweep-slot-alternative",
		activation: "instant",
		durationMs: 15e3,
		repeatable: false
	},
	{
		id: "care-package",
		displayName: "Care Package",
		cost: 4,
		tier: "low",
		availability: "selectable",
		carePackageBaseWeightUnits: 0,
		relationship: "nonrecursive-slot-1",
		activation: "instant",
		durationMs: 6e4,
		repeatable: false
	},
	{
		id: "yardhawk",
		displayName: "Yardhawk",
		cost: 5,
		tier: "mid",
		availability: "selectable",
		carePackageBaseWeightUnits: 16,
		relationship: "retained-slot-2",
		activation: "instant",
		durationMs: 15e3,
		repeatable: false
	},
	{
		id: "piloted-drone",
		displayName: "Piloted Drone",
		cost: 5,
		tier: "mid",
		availability: "selectable",
		carePackageBaseWeightUnits: 16,
		relationship: "yardhawk-slot-alternative",
		activation: "possession",
		durationMs: DRONE_SUPPORT_LIFETIMES_MS.piloted,
		repeatable: false
	},
	{
		id: "tri-pass",
		displayName: "Tri-Pass Strike",
		cost: 7,
		tier: "high",
		availability: "selectable",
		carePackageBaseWeightUnits: 12,
		relationship: "retained-slot-3-or-4",
		activation: "target-line",
		durationMs: 12e3,
		repeatable: false
	},
	{
		id: "carpet-bomber",
		displayName: "Carpet Bomber",
		cost: 7,
		tier: "high",
		availability: "selectable",
		carePackageBaseWeightUnits: 12,
		relationship: "slot-3-or-4-alternative",
		activation: "target-point",
		durationMs: 12e3,
		repeatable: false
	},
	{
		id: "hunter-swarm",
		displayName: "Hunter Swarm",
		cost: 8,
		tier: "high",
		availability: "selectable",
		carePackageBaseWeightUnits: 9,
		relationship: "retained-slot-3-or-4",
		activation: "instant",
		durationMs: 2e4,
		repeatable: false
	},
	{
		id: "chopper",
		displayName: "Chopper Gunner",
		cost: 8,
		tier: "high",
		availability: "selectable",
		carePackageBaseWeightUnits: 9,
		relationship: "slot-3-or-4-alternative",
		activation: "instant",
		durationMs: 3e4,
		repeatable: false
	},
	{
		id: "drone-swarm",
		displayName: "Drone Swarm",
		cost: 15,
		tier: "top",
		availability: "selectable",
		carePackageBaseWeightUnits: 1,
		relationship: "nuke-slot-alternative",
		activation: "instant",
		durationMs: DRONE_SUPPORT_LIFETIMES_MS.swarm,
		repeatable: false
	},
	{
		id: "crimson-flamethrower",
		displayName: "Crimson Flamethrower",
		cost: 0,
		tier: "mid",
		availability: "care-only",
		carePackageBaseWeightUnits: 0,
		relationship: "care-package-fixed-ten-percent",
		activation: "instant",
		durationMs: 45e3,
		repeatable: true
	},
	{
		id: "nuke",
		displayName: "Nuke",
		cost: 15,
		tier: "top",
		availability: "selectable",
		carePackageBaseWeightUnits: 0,
		relationship: "drone-swarm-slot-alternative-and-one-percent-care-reward",
		activation: "instant",
		durationMs: 0,
		repeatable: false
	}
]));
var PASS65_KILLSTREAK_SLOT_DEFINITIONS = Object.freeze([
	Object.freeze({
		slot: 1,
		allowedIds: Object.freeze([
			"scout-sweep",
			"adrenaline",
			"care-package"
		])
	}),
	Object.freeze({
		slot: 2,
		allowedIds: Object.freeze(["yardhawk", "piloted-drone"])
	}),
	Object.freeze({
		slot: 3,
		allowedIds: Object.freeze([
			"tri-pass",
			"carpet-bomber",
			"hunter-swarm",
			"chopper"
		])
	}),
	Object.freeze({
		slot: 4,
		allowedIds: Object.freeze([
			"tri-pass",
			"carpet-bomber",
			"hunter-swarm",
			"chopper"
		])
	}),
	Object.freeze({
		slot: 5,
		allowedIds: Object.freeze(["nuke", "drone-swarm"])
	})
]);
function validateKillstreakLoadout(value) {
	const errors = [];
	if (!isPlainObject(value)) return Object.freeze({
		valid: false,
		errors: Object.freeze(["loadout must be an object"])
	});
	const actualKeys = Object.keys(value);
	for (const key of actualKeys) if (!["schemaVersion", "slots"].includes(key)) errors.push(`loadout has unknown key ${key}`);
	for (const key of ["schemaVersion", "slots"]) if (!Object.hasOwn(value, key)) errors.push(`loadout is missing key ${key}`);
	if (value.schemaVersion !== 1) errors.push("loadout schemaVersion must equal 1");
	if (!Array.isArray(value.slots) || value.slots.length !== 5) {
		errors.push("loadout must contain exactly five ordered slots");
		return Object.freeze({
			valid: false,
			errors: Object.freeze(errors)
		});
	}
	const slots = value.slots;
	const ids = /* @__PURE__ */ new Set();
	for (const [index, id] of slots.entries()) {
		if (typeof id !== "string") {
			errors.push(`slot ${index + 1} must contain a killstreak ID`);
			continue;
		}
		if (ids.has(id)) errors.push(`duplicate killstreak ${id}`);
		ids.add(id);
		const definition = PASS65_KILLSTREAK_CATALOG.definitions.find((entry) => entry.id === id);
		if (!definition) errors.push(`slot ${index + 1} contains unknown killstreak ${id}`);
		else if (definition.availability !== "selectable") errors.push(`slot ${index + 1} contains non-selectable killstreak ${id}`);
		if (!PASS65_KILLSTREAK_SLOT_DEFINITIONS[index].allowedIds.includes(id)) errors.push(`slot ${index + 1} does not allow ${id}`);
	}
	if (slots[2] === slots[3]) errors.push("slots 3 and 4 must be distinct");
	if (slots.includes("nuke") && slots.includes("drone-swarm")) errors.push("nuke and drone-swarm are mutually exclusive slot-5 alternatives");
	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors)
	});
}
function parseKillstreakLoadout(value) {
	const validation = validateKillstreakLoadout(value);
	if (!validation.valid) throw new Error(validation.errors.join("; "));
	return Object.freeze({
		schemaVersion: 1,
		slots: Object.freeze([...value.slots])
	});
}
//#endregion
//#region src/killstreak-drone-formation.ts
var DRONE_SWARM_ENGAGEMENT_FORMATION = Object.freeze({
	unitCount: 24,
	clusterCount: 4,
	unitsPerCluster: 6,
	clusterRadiusM: 5.5,
	memberRadiusM: 1.6,
	verticalStepM: .55,
	minimumDesignedSeparationM: 1.5
});
function hashText$1(value) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}
/**
* Four six-drone clusters surround one target without sharing a destination.
* The activation/target phase is deterministic host state, never client pose.
*/
function droneSwarmEngagementOffset(input) {
	if (!Number.isSafeInteger(input.ordinal) || input.ordinal < 0 || input.ordinal >= DRONE_SWARM_ENGAGEMENT_FORMATION.unitCount) throw new Error("swarm formation ordinal must be in the inclusive 0..23 range");
	const cluster = input.ordinal % DRONE_SWARM_ENGAGEMENT_FORMATION.clusterCount;
	const member = Math.floor(input.ordinal / DRONE_SWARM_ENGAGEMENT_FORMATION.clusterCount);
	const phase = hashText$1(`${input.activationId}:${input.targetId}`) / 4294967296 * Math.PI * 2;
	const clusterAngle = phase + cluster / DRONE_SWARM_ENGAGEMENT_FORMATION.clusterCount * Math.PI * 2;
	const memberAngle = phase + cluster * .17 + member / DRONE_SWARM_ENGAGEMENT_FORMATION.unitsPerCluster * Math.PI * 2;
	const x = Math.cos(clusterAngle) * DRONE_SWARM_ENGAGEMENT_FORMATION.clusterRadiusM + Math.cos(memberAngle) * DRONE_SWARM_ENGAGEMENT_FORMATION.memberRadiusM;
	const z = Math.sin(clusterAngle) * DRONE_SWARM_ENGAGEMENT_FORMATION.clusterRadiusM + Math.sin(memberAngle) * DRONE_SWARM_ENGAGEMENT_FORMATION.memberRadiusM;
	const y = (member % 3 - 1) * DRONE_SWARM_ENGAGEMENT_FORMATION.verticalStepM + (cluster % 2 === 0 ? -.25 : .25);
	return Object.freeze([
		x,
		y,
		z
	]);
}
function droneSwarmEngagementPoint(targetPosition, input) {
	const offset = droneSwarmEngagementOffset(input);
	return Object.freeze([
		targetPosition[0] + offset[0],
		targetPosition[1] + 1.5 + offset[1],
		targetPosition[2] + offset[2]
	]);
}
//#endregion
//#region src/support-forward-axis.ts
var SUPPORT_FORWARD_AXIS = Object.freeze([
	0,
	0,
	-1
]);
/** Three.js cameras and authored support assets face local negative Z. */
function supportForwardFromYawPitch(yaw, pitch) {
	const cosinePitch = Math.cos(pitch);
	return Object.freeze([
		-Math.sin(yaw) * cosinePitch,
		Math.sin(pitch),
		-Math.cos(yaw) * cosinePitch
	]);
}
function supportYawForDirection(deltaX, deltaZ, fallbackYaw = 0) {
	if (Math.hypot(deltaX, deltaZ) < 1e-8) return fallbackYaw;
	return Math.atan2(-deltaX, -deltaZ);
}
//#endregion
//#region src/killstreak-drone-input.ts
var clamp$1 = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0));
var PILOTED_DRONE_VIEW_CONTRACT = Object.freeze({
	cameraMode: "first-person-optic",
	inputPreset: "fps-non-inverted",
	maximumPitchRadians: 1.2,
	cameraForwardOffsetM: .31,
	cameraVerticalOffsetM: .035,
	hidesPossessedDroneBody: true
});
/**
* Converts browser/gamepad screen-space look deltas to Three.js camera yaw and
* pitch. Positive screen X means look right and positive screen Y means look
* down, while Three.js local -Z uses negative yaw for a right turn and positive
* pitch for an upward turn.
*/
function applyPilotedDroneScreenLookDelta(input) {
	const horizontal = Number.isFinite(input.horizontalLookDelta) ? input.horizontalLookDelta : 0;
	const vertical = Number.isFinite(input.verticalLookDelta) ? input.verticalLookDelta : 0;
	const yaw = input.yaw - horizontal;
	const pitch = input.pitch - vertical;
	return Object.freeze({
		yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
		pitch: clamp$1(pitch, -PILOTED_DRONE_VIEW_CONTRACT.maximumPitchRadians, PILOTED_DRONE_VIEW_CONTRACT.maximumPitchRadians)
	});
}
/**
* Browser pointer Y grows downward; world pitch grows upward. Negating deltaY
* gives conventional FPS look (mouse up looks up) and prevents the previously
* perceived inverted drone control.
*/
function applyPilotedDronePointerDelta(input) {
	const horizontalSensitivity = clamp$1(input.radiansPerPixel, 1e-4, .05);
	const verticalSensitivity = clamp$1(input.verticalRadiansPerPixel ?? input.radiansPerPixel, 1e-4, .05);
	return applyPilotedDroneScreenLookDelta({
		yaw: input.yaw,
		pitch: input.pitch,
		horizontalLookDelta: (Number.isFinite(input.deltaX) ? input.deltaX : 0) * horizontalSensitivity,
		verticalLookDelta: (Number.isFinite(input.deltaY) ? input.deltaY : 0) * verticalSensitivity
	});
}
/** One signed FPS convention for keyboard and standard-gamepad translation. */
function pilotedDroneControlAxes(input) {
	const gamepadX = clamp$1(input.gamepadMoveX, -1, 1);
	const gamepadY = clamp$1(input.gamepadMoveY, -1, 1);
	const gamepadVertical = clamp$1(input.gamepadVertical, -1, 1);
	return Object.freeze({
		thrust: clamp$1(Number(input.keyboardForward) - Number(input.keyboardBackward) - gamepadY, -1, 1),
		strafe: clamp$1(Number(input.keyboardRight) - Number(input.keyboardLeft) + gamepadX, -1, 1),
		vertical: clamp$1(Number(input.keyboardAscend) - Number(input.keyboardDescend) + gamepadVertical, -1, 1)
	});
}
/**
* Projects the signed input axes into the shared -Z-forward world convention
* and caps diagonal/combined travel at the standalone manual speed.
*/
function pilotedDroneWorldVelocity(input) {
	const yaw = Number.isFinite(input.yaw) ? input.yaw : 0;
	const pitch = clamp$1(input.pitch, -PILOTED_DRONE_VIEW_CONTRACT.maximumPitchRadians, PILOTED_DRONE_VIEW_CONTRACT.maximumPitchRadians);
	const maximumSpeedMps = clamp$1(input.maximumSpeedMps, 0, 100);
	const forward = supportForwardFromYawPitch(yaw, pitch);
	const rightX = Math.cos(yaw);
	const rightZ = -Math.sin(yaw);
	let x = forward[0] * clamp$1(input.axes.thrust, -1, 1) + rightX * clamp$1(input.axes.strafe, -1, 1);
	let y = forward[1] * clamp$1(input.axes.thrust, -1, 1) + clamp$1(input.axes.vertical, -1, 1);
	let z = forward[2] * clamp$1(input.axes.thrust, -1, 1) + rightZ * clamp$1(input.axes.strafe, -1, 1);
	const magnitude = Math.hypot(x, y, z);
	if (magnitude > 1) {
		x /= magnitude;
		y /= magnitude;
		z /= magnitude;
	}
	const canonical = (component) => {
		const scaled = component * maximumSpeedMps;
		return Math.abs(scaled) < Number.EPSILON ? 0 : scaled;
	};
	return Object.freeze([
		canonical(x),
		canonical(y),
		canonical(z)
	]);
}
//#endregion
//#region src/support-aircraft-collision.ts
/**
* LOD0/1 shipped presentation bounds after the production 17m scale:
* 17.000 x 1.651 x 10.311m, centred 0.013m down and 0.791m forward of root.
* LOD2 is vertically smaller, so this envelope conservatively covers all LODs.
*/
var CARPET_BOMBER_COLLISION_ENVELOPE = Object.freeze({
	halfExtents: Object.freeze([
		8.5,
		.826,
		5.156
	]),
	centreOffset: Object.freeze([
		0,
		-.013,
		-.791
	])
});
function pointEnvelope(envelope) {
	return {
		halfExtents: {
			x: envelope.halfExtents[0],
			y: envelope.halfExtents[1],
			z: envelope.halfExtents[2]
		},
		centreOffset: {
			x: envelope.centreOffset[0],
			y: envelope.centreOffset[1],
			z: envelope.centreOffset[2]
		},
		yaw: envelope.yaw
	};
}
function worldOffset(envelope) {
	const cosine = Math.cos(envelope.yaw);
	const sine = Math.sin(envelope.yaw);
	return {
		x: cosine * envelope.centreOffset[0] + sine * envelope.centreOffset[2],
		y: envelope.centreOffset[1],
		z: -sine * envelope.centreOffset[0] + cosine * envelope.centreOffset[2]
	};
}
function supportAircraftRootClearance(envelope) {
	const cosine = Math.cos(envelope.yaw);
	const sine = Math.sin(envelope.yaw);
	const extentX = Math.abs(cosine) * envelope.halfExtents[0] + Math.abs(sine) * envelope.halfExtents[2];
	const extentZ = Math.abs(sine) * envelope.halfExtents[0] + Math.abs(cosine) * envelope.halfExtents[2];
	const offset = worldOffset(envelope);
	return Object.freeze({
		negativeX: extentX - offset.x,
		positiveX: extentX + offset.x,
		negativeY: envelope.halfExtents[1] - offset.y,
		positiveY: envelope.halfExtents[1] + offset.y,
		negativeZ: extentZ - offset.z,
		positiveZ: extentZ + offset.z
	});
}
/** Exact fixed-yaw OBB overlap gate, including rotated collider cross-axes. */
function supportAircraftEnvelopeIntersectsBox(root, envelope, box) {
	return orientedBoxIntersectsBox(root, pointEnvelope(envelope), box);
}
function resolveSupportAircraftEnvelopeStep(input) {
	const clearance = supportAircraftRootClearance(input.envelope);
	const clampRoot = (position) => [
		Math.max(input.bounds.minX + clearance.negativeX, Math.min(position[0], input.bounds.maxX - clearance.positiveX)),
		Math.max(input.bounds.floorY + clearance.negativeY, Math.min(position[1], input.bounds.ceilingY - clearance.positiveY)),
		Math.max(input.bounds.minZ + clearance.negativeZ, Math.min(position[2], input.bounds.maxZ - clearance.positiveZ))
	];
	const from = clampRoot(input.from);
	const desired = clampRoot(input.desired);
	const movement = {
		x: desired[0] - from[0],
		y: desired[1] - from[1],
		z: desired[2] - from[2]
	};
	const collisionEnvelope = pointEnvelope(input.envelope);
	const hit = sweepOrientedBoxAgainstBoxes({
		x: from[0],
		y: from[1],
		z: from[2]
	}, movement, input.solids, collisionEnvelope);
	if (!hit) return Object.freeze({
		position: Object.freeze(desired),
		collided: false,
		recovery: "direct"
	});
	const length = Math.hypot(movement.x, movement.y, movement.z);
	const contactTime = Math.max(0, hit.time - .004 / Math.max(.004, length));
	const contact = clampRoot([
		from[0] + movement.x * contactTime,
		from[1] + movement.y * contactTime,
		from[2] + movement.z * contactTime
	]);
	if (input.solids.some((solid) => supportAircraftEnvelopeIntersectsBox({
		x: contact[0],
		y: contact[1],
		z: contact[2]
	}, input.envelope, solid))) return Object.freeze({
		position: Object.freeze(from),
		collided: true,
		recovery: "hold"
	});
	return Object.freeze({
		position: Object.freeze(contact),
		collided: true,
		recovery: "contact"
	});
}
//#endregion
//#region src/care-package-weapon-reward.ts
/**
* HF-334 (owner: "add 10% chance in care package to get a flamethrower"):
* a fixed 10-in-100 flamethrower band layered over the existing care-package
* pool with exact integer arithmetic mirroring the nuke 1% pattern. The
* remaining 90% delegates back to the derived-weight pool, so the pool keeps
* its internal shape exactly (recorded owner consequence: every pool entry —
* including the nuke's fixed 1-in-100 of the pool roll — now lands at 90% of
* its former overall rate; the nuke becomes exactly 0.9% of a care roll).
*/
var CARE_PACKAGE_FLAMETHROWER_PROBABILITY = Object.freeze({
	numerator: 10,
	denominator: 100
});
/** The only weapon the care package may currently grant. */
var CARE_PACKAGE_WEAPON_REWARD_ID = "flamethrower";
function assertCatalogPool(catalog) {
	const totalWeightUnits = catalog.carePackagePool.totalWeightUnits;
	if (!Number.isSafeInteger(totalWeightUnits) || totalWeightUnits <= 0) throw new Error("care-package pool total weight is invalid");
	return totalWeightUnits;
}
/** The size of the layered roll domain: pool total x fixed denominator (100). */
function carePackageLayeredTotalUnits(catalog) {
	const layeredTotal = assertCatalogPool(catalog) * CARE_PACKAGE_FLAMETHROWER_PROBABILITY.denominator;
	if (!Number.isSafeInteger(layeredTotal)) throw new Error("care-package layered total exceeds safe-integer range");
	return layeredTotal;
}
/** Exclusive end of the flamethrower band inside the layered domain. */
function carePackageWeaponBandEndExclusive(catalog) {
	return assertCatalogPool(catalog) * CARE_PACKAGE_FLAMETHROWER_PROBABILITY.numerator;
}
/**
* Host-only reward roll for one care crate. When the flamethrower band is
* open, the seed is reduced over layeredTotal = totalWeightUnits * 100; the
* first totalWeightUnits * 10 units are the flamethrower (exactly 10%), and
* every remaining unit delegates to the existing pool via
* (layeredUnit - band) % totalWeightUnits, which sweeps every pool residue
* exactly 90 times — the pool's internal shape is preserved bit-exactly.
* When the band is closed (no grant path wired, weapon already held or
* pending), the roll reproduces the original pool distribution exactly.
*/
function rollCarePackageReward(catalog, seed, options) {
	if (!Number.isSafeInteger(seed) || seed < 0) throw new Error(`care-package roll seed ${seed} is invalid`);
	const totalWeightUnits = assertCatalogPool(catalog);
	if (options.flamethrowerAdmissible !== true) {
		const rollUnit = seed % totalWeightUnits;
		return Object.freeze({
			reward: Object.freeze({
				kind: "killstreak",
				id: rewardForCarePackageUnit(catalog, rollUnit)
			}),
			rollUnit,
			rollDomainUnits: totalWeightUnits
		});
	}
	const layeredTotal = carePackageLayeredTotalUnits(catalog);
	const bandEndExclusive = carePackageWeaponBandEndExclusive(catalog);
	const layeredUnit = seed % layeredTotal;
	if (layeredUnit < bandEndExclusive) return Object.freeze({
		reward: Object.freeze({
			kind: "timed-map-weapon",
			weaponId: CARE_PACKAGE_WEAPON_REWARD_ID
		}),
		rollUnit: layeredUnit,
		rollDomainUnits: layeredTotal
	});
	return Object.freeze({
		reward: Object.freeze({
			kind: "killstreak",
			id: rewardForCarePackageUnit(catalog, (layeredUnit - bandEndExclusive) % totalWeightUnits)
		}),
		rollUnit: layeredUnit,
		rollDomainUnits: layeredTotal
	});
}
/**
* Deterministic capture-time downgrade for a weapon-reward crate whose grant
* became inadmissible between roll and capture (e.g. another player took the
* single flamethrower instance). Maps the crate's stored roll unit back onto
* the pool so a capture never silently drops a reward.
*/
function downgradeCarePackageWeaponReward(catalog, rollUnit) {
	if (!Number.isSafeInteger(rollUnit) || rollUnit < 0) throw new Error(`care-package downgrade unit ${rollUnit} is invalid`);
	return rewardForCarePackageUnit(catalog, rollUnit % assertCatalogPool(catalog));
}
//#endregion
//#region src/killstreak-runtime.ts
var ADRENALINE_DURATION_MS = 15e3;
var ADRENALINE_DAMAGE_MULTIPLIER = 1.1;
var ADRENALINE_MOVEMENT_MULTIPLIER = 1.1;
var ADRENALINE_RELOAD_DURATION_MULTIPLIER = .9;
var CHOPPER_DURATION_MS = 3e4;
var CHOPPER_MISSILE_CADENCE_MS = 1e3;
var CHOPPER_MISSILE_SOCKET_LOCAL_M = [
	-1.15,
	-.45,
	-.6
];
var CHOPPER_MISSILE_BLAST_RADIUS_M = 4.5;
/**
* Owner 2026-08-30 ("the normal gun previously had splash damage and a good
* radius so you could actually hit people"): possessed autocannon shells now
* BURST where they land. A clean centre-ray hit still deals the full profile
* damage; a near-miss chips everyone inside the burst radius instead of
* evaporating. AI-controlled choppers keep their target-locked fire.
*/
var CHOPPER_GUN_SPLASH_RADIUS_M = 2.6;
var PILOTED_DRONE_DURATION_MS = DRONE_SUPPORT_DEFINITIONS.piloted.lifetimeMs;
var DRONE_SWARM_DURATION_MS = DRONE_SUPPORT_DEFINITIONS.swarm.lifetimeMs;
var DRONE_MAGAZINE_SIZE = DRONE_GUN_PROFILE.magazineSize;
var CARE_AIRCRAFT_DURATION_MS = 7e3;
var CARE_CRATE_DESCENT_MS = 5200;
var CARPET_BOMBER_RESIDUAL_FIRE_DURATION_MS = 5e3;
var CARPET_BOMBER_ROUTE_CLEARANCE_M = .05;
var CARPET_BOMBER_ROUTE_ADMISSION_EPSILON_M = .002;
var CARPET_BOMBER_ROUTE_HEADING_OFFSETS = Object.freeze([
	0,
	Math.PI / 2,
	-Math.PI / 2,
	Math.PI / 4,
	-Math.PI / 4,
	Math.PI * 3 / 4,
	-Math.PI * 3 / 4,
	Math.PI
]);
var CARPET_BOMBER_BLAST_RADIUS_M = 4.5;
var CARPET_BOMBER_IMPACT_FLASH_BASE_RADIUS_M = 1.2;
var CARPET_BOMBER_IMPACT_FLASH_MAXIMUM_SCALE = 3.8;
/** Keeps every authoritative and presentation footprint out of walls and the secure door. */
var CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M = Math.max(CARPET_BOMBER_IMPACT_FLASH_BASE_RADIUS_M * CARPET_BOMBER_IMPACT_FLASH_MAXIMUM_SCALE, 4.75) + .05;
/** Recipient-snapshot presentation bounds; these are not gameplay ranges. */
var CARE_TARGET_MARKER_MAX_LIFETIME_MS = 6e3;
var CARPET_TARGET_MARKER_MAX_LIFETIME_MS = 1e3;
/** The aircraft reaches the last station when its final shell is released. */
var CARPET_BOMBER_ROUTE_TRAVERSE_MS = 4e3;
var MAX_REPLICATED_KILLSTREAK_STREAK = 1e5;
var CHOPPER_GUNNER_CAMERA_ORIGIN_LOCAL = Object.freeze([
	CHOPPER_GUNNER_RAY_POLICY.cameraSocketLocalM[0],
	CHOPPER_GUNNER_RAY_POLICY.cameraSocketLocalM[1],
	CHOPPER_GUNNER_RAY_POLICY.cameraSocketLocalM[2] - CHOPPER_GUNNER_RAY_POLICY.cameraForwardNudgeM
]);
function isCheckpointRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function hasCheckpointKeys(value, keys) {
	return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function isCheckpointInteger(value, minimum, maximum) {
	return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function isCheckpointKillstreakId(value) {
	return typeof value === "string" && PASS65_KILLSTREAK_CATALOG.definitions.some((definition) => definition.id === value);
}
function isKillstreakActorCheckpoint(value) {
	if (!isCheckpointRecord(value) || !hasCheckpointKeys(value, [
		"actorId",
		"team",
		"lifeId",
		"loadout",
		"streak",
		"cycleProgress",
		"earned",
		"availableCharges",
		"careRewards",
		"adrenalineRemainingMs",
		"lastActivationSequence",
		"lastControlSequence"
	])) return false;
	let loadout;
	try {
		loadout = parseKillstreakLoadout(value.loadout);
	} catch {
		return false;
	}
	if (typeof value.actorId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value.actorId) || value.team !== 0 && value.team !== 1 || !isCheckpointInteger(value.lifeId, 0, 1e9) || !isCheckpointInteger(value.streak, 0, 1e5) || !isCheckpointInteger(value.cycleProgress, 0, 1e5) || !Number.isFinite(value.adrenalineRemainingMs) || Number(value.adrenalineRemainingMs) < 0 || Number(value.adrenalineRemainingMs) > 15e3 || !isCheckpointInteger(value.lastActivationSequence, -1, 1e9) || !isCheckpointInteger(value.lastControlSequence, -1, 1e9) || !Array.isArray(value.earned) || !Array.isArray(value.availableCharges) || !Array.isArray(value.careRewards) || value.careRewards.length > 8) return false;
	const finalThreshold = Math.max(...loadout.slots.map((id) => exactDefinition(id, PASS65_KILLSTREAK_CATALOG)?.cost ?? 0));
	if (Number(value.cycleProgress) >= finalThreshold || Number(value.streak) < Number(value.cycleProgress)) return false;
	const earned = value.earned;
	if (earned.length > loadout.slots.length || !earned.every(isCheckpointKillstreakId) || new Set(earned).size !== earned.length || earned.some((id) => !loadout.slots.includes(String(id)))) return false;
	const expectedEarned = loadout.slots.filter((id) => (exactDefinition(id, PASS65_KILLSTREAK_CATALOG)?.cost ?? Number.POSITIVE_INFINITY) <= Number(value.cycleProgress));
	if (earned.length !== expectedEarned.length || expectedEarned.some((id) => !earned.includes(id))) return false;
	const charges = value.availableCharges;
	const chargeIds = [];
	for (const charge of charges) {
		if (!isCheckpointRecord(charge) || !hasCheckpointKeys(charge, ["id", "count"]) || !isCheckpointKillstreakId(charge.id) || !loadout.slots.includes(String(charge.id)) || !isCheckpointInteger(charge.count, 1, 255)) return false;
		chargeIds.push(charge.id);
	}
	return new Set(chargeIds).size === chargeIds.length && value.careRewards.every(isCheckpointKillstreakId);
}
function isKillstreakRuntimeCheckpoint(value) {
	if (!isCheckpointRecord(value) || !hasCheckpointKeys(value, [
		"schemaVersion",
		"matchEpoch",
		"revision",
		"entityCounter",
		"activationCounter",
		"resultCounter",
		"seenActivationRequestIds",
		"actors"
	])) return false;
	if (value.schemaVersion !== 1 || !isCheckpointInteger(value.matchEpoch, 0, 999999999) || !isCheckpointInteger(value.revision, 0, 1e9) || !isCheckpointInteger(value.entityCounter, 0, 1e9) || !isCheckpointInteger(value.activationCounter, 0, 1e9) || !isCheckpointInteger(value.resultCounter, 0, 1e9) || !Array.isArray(value.seenActivationRequestIds) || value.seenActivationRequestIds.length > 512 || !value.seenActivationRequestIds.every((id) => typeof id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(id)) || new Set(value.seenActivationRequestIds).size !== value.seenActivationRequestIds.length || !Array.isArray(value.actors) || value.actors.length > 10 || !value.actors.every(isKillstreakActorCheckpoint)) return false;
	const actorIds = value.actors.map((actor) => actor.actorId);
	return new Set(actorIds).size === actorIds.length;
}
var CHOPPER_MOTION_VARIANCE = Object.freeze({
	maximumPitchRadians: .12,
	maximumYawOffsetRadians: .14,
	maximumBankRadians: .18,
	maximumAltitudeOffsetM: 1.25,
	maximumRadiusScaleDelta: .045
});
function hashText(value) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}
function unit(seed, salt) {
	let value = (seed ^ Math.imul(salt + 1, 2654435761)) >>> 0;
	value ^= value >>> 16;
	value = Math.imul(value, 2146121005);
	value ^= value >>> 15;
	value = Math.imul(value, 2221713035);
	value ^= value >>> 16;
	return (value >>> 0) / 4294967296;
}
function clamp(value, minimum, maximum) {
	return Math.max(minimum, Math.min(maximum, value));
}
/**
* HF-404: yaw is periodic; pitch is not. Aim yaw arrives from a first-person
* camera whose yaw is an unbounded accumulator, so clamping it to [-pi, pi]
* pinned the turret at the clamp boundary the moment the gunner swept past a
* half turn of accumulated yaw — the damage ray stopped following the
* crosshair entirely while the cockpit camera kept rotating. Wrapping is the
* only correct normalisation: 7.5 rad and 7.5 - 2*pi are the same heading.
* Pitch stays clamped because its limits are a real mechanical stop.
*/
function wrapAngle(value) {
	if (!Number.isFinite(value)) return 0;
	const wrapped = value - Math.PI * 2 * Math.floor((value + Math.PI) / (Math.PI * 2));
	return wrapped <= -Math.PI ? wrapped + Math.PI * 2 : wrapped;
}
function finiteTuple(value) {
	return value !== void 0 && value.length === 3 && value.every(Number.isFinite);
}
function distance(left, right) {
	return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}
function rotateSupportOffsetYXZ(offset, attitude) {
	const [pitch, yaw, bank] = attitude;
	const c1 = Math.cos(pitch / 2);
	const c2 = Math.cos(yaw / 2);
	const c3 = Math.cos(bank / 2);
	const s1 = Math.sin(pitch / 2);
	const s2 = Math.sin(yaw / 2);
	const s3 = Math.sin(bank / 2);
	const qx = s1 * c2 * c3 + c1 * s2 * s3;
	const qy = c1 * s2 * c3 - s1 * c2 * s3;
	const qz = c1 * c2 * s3 - s1 * s2 * c3;
	const qw = c1 * c2 * c3 + s1 * s2 * s3;
	const uvx = qy * offset[2] - qz * offset[1];
	const uvy = qz * offset[0] - qx * offset[2];
	const uvz = qx * offset[1] - qy * offset[0];
	const uuvx = qy * uvz - qz * uvy;
	const uuvy = qz * uvx - qx * uvz;
	const uuvz = qx * uvy - qy * uvx;
	return Object.freeze([
		offset[0] + 2 * (qw * uvx + uuvx),
		offset[1] + 2 * (qw * uvy + uuvy),
		offset[2] + 2 * (qw * uvz + uuvz)
	]);
}
function translatedSupportOffset(position, attitude, offset) {
	const rotated = rotateSupportOffsetYXZ(offset, attitude);
	return Object.freeze([
		position[0] + rotated[0],
		position[1] + rotated[1],
		position[2] + rotated[2]
	]);
}
/**
* One pure host/client geometry contract for the possessed gunner camera and
* visual muzzle. Both derive from the immutable support snapshot; neither may
* read the interpolated presentation hierarchy.
*/
function chopperGunnerCameraOrigin(position, attitude) {
	return translatedSupportOffset(position, attitude, CHOPPER_GUNNER_CAMERA_ORIGIN_LOCAL);
}
function chopperGunnerAuthoritativeRay(position, attitude, aimYaw, aimPitch) {
	return Object.freeze({
		origin: chopperGunnerCameraOrigin(position, attitude),
		direction: supportForwardFromYawPitch(aimYaw, aimPitch),
		tracerOrigin: translatedSupportOffset(position, attitude, CHOPPER_GUNNER_RAY_POLICY.muzzleSocketLocalM)
	});
}
/**
* Resolves the possessed gunner's centre ray onto host-owned terrain. Clients
* send only yaw/pitch; bounds and ground height remain authoritative here.
* An upward/horizon ray deterministically falls back to the last in-bounds
* ground sample instead of accepting a client-authored impact coordinate.
*/
function chopperMissileGroundTarget(position, attitude, aimYaw, aimPitch, world) {
	const ray = chopperGunnerAuthoritativeRay(position, attitude, aimYaw, aimPitch);
	const margin = .05;
	let targetX = clamp(ray.origin[0], world.bounds.minX + margin, world.bounds.maxX - margin);
	let targetZ = clamp(ray.origin[2], world.bounds.minZ + margin, world.bounds.maxZ - margin);
	let targetY = supportGroundHeight(world, targetX, targetZ);
	for (let distanceM = .5; distanceM <= 120; distanceM += .5) {
		const x = ray.origin[0] + ray.direction[0] * distanceM;
		const z = ray.origin[2] + ray.direction[2] * distanceM;
		if (x < world.bounds.minX + margin || x > world.bounds.maxX - margin || z < world.bounds.minZ + margin || z > world.bounds.maxZ - margin) break;
		const y = supportGroundHeight(world, x, z);
		targetX = x;
		targetY = y;
		targetZ = z;
		if (ray.origin[1] + ray.direction[1] * distanceM <= y + .08) break;
	}
	return Object.freeze([
		targetX,
		targetY,
		targetZ
	]);
}
function hostileTargets(world, ownerId, team) {
	return world.targets.filter((target) => target.alive && target.id !== ownerId && (world.areHostile?.(ownerId, team, target) ?? target.team !== team) && (target.kind === "player" || target.kind === "bot"));
}
function lineOfSight(world, from, to) {
	return world.hasLineOfSight?.(from, to) ?? true;
}
function actorPosition(world, actorId) {
	return world.targets.find((target) => target.id === actorId && target.alive)?.position ?? null;
}
function supportGroundHeight(world, x, z) {
	const queried = world.groundHeightAt?.(x, z);
	return clamp(Number.isFinite(queried) ? queried : world.bounds.floorY, world.bounds.floorY, world.bounds.ceilingY - .5);
}
/**
* Dynamic terrain/roof clearance for a swarm step. Both ends are sampled so a
* raised surface between snapshots cannot be crossed using a stale flat-ground
* floor. The nominal floor is exactly halfway to the admitted spawn height.
*/
function droneSwarmStepMinimumAltitudeY(admittedSpawnY, current, desired, world) {
	const midpointAt = (x, z) => {
		const surfaceY = supportGroundHeight(world, x, z);
		return clamp(surfaceY + Math.max(1, (admittedSpawnY - surfaceY) * .5), world.bounds.floorY + 1, world.bounds.ceilingY - .5);
	};
	return Math.max(midpointAt(current[0], current[2]), midpointAt(desired[0], desired[2]));
}
function exactDefinition(id, catalog) {
	return catalog.definitions.find((definition) => definition.id === id);
}
function chopperPositionAt(seed, createdAtMs, nowMs, routeCentre, bounds) {
	const seconds = clamp((nowMs - createdAtMs) / 1e3, 0, CHOPPER_DURATION_MS / 1e3);
	const progress = seconds / (CHOPPER_DURATION_MS / 1e3);
	const phase = (salt) => unit(seed, salt) * Math.PI * 2;
	const directionVariance = Math.sin(seconds * .61 + phase(11)) * .09 + Math.sin(seconds * .23 + phase(12)) * .045;
	const angle = progress * Math.PI * 2 * 1.35 + phase(10) + directionVariance;
	const radiusX = Math.max(2, Math.min((bounds.maxX - bounds.minX) * .36 * (1 + Math.sin(seconds * .31 + phase(13)) * CHOPPER_MOTION_VARIANCE.maximumRadiusScaleDelta), routeCentre[0] - bounds.minX - 1, bounds.maxX - routeCentre[0] - 1));
	const radiusZ = Math.max(2, Math.min((bounds.maxZ - bounds.minZ) * .36 * (1 + Math.sin(seconds * .27 + phase(14)) * CHOPPER_MOTION_VARIANCE.maximumRadiusScaleDelta), routeCentre[2] - bounds.minZ - 1, bounds.maxZ - routeCentre[2] - 1));
	const altitudeVariance = Math.sin(seconds * .47 + phase(15)) * .8 + Math.sin(seconds * .19 + phase(16)) * .45;
	return [
		clamp(routeCentre[0] + Math.cos(angle) * radiusX, bounds.minX + 1, bounds.maxX - 1),
		clamp(routeCentre[1] + altitudeVariance, bounds.floorY + 6, bounds.ceilingY - 1),
		clamp(routeCentre[2] + Math.sin(angle) * radiusZ, bounds.minZ + 1, bounds.maxZ - 1)
	];
}
/** Pure host route pose used for deterministic two-peer convergence evidence. */
function chopperRoutePose(seed, createdAtMs, nowMs, routeCentre, bounds) {
	const position = chopperPositionAt(seed, createdAtMs, nowMs, routeCentre, bounds);
	const next = chopperPositionAt(seed, createdAtMs, Math.min(createdAtMs + CHOPPER_DURATION_MS, nowMs + 50), routeCentre, bounds);
	const dx = next[0] - position[0];
	const dy = next[1] - position[1];
	const dz = next[2] - position[2];
	const horizontal = Math.max(.001, Math.hypot(dx, dz));
	const seconds = clamp((nowMs - createdAtMs) / 1e3, 0, CHOPPER_DURATION_MS / 1e3);
	const phase = (salt) => unit(seed, salt) * Math.PI * 2;
	const pitch = clamp(Math.atan2(dy, horizontal) + Math.sin(seconds * .43 + phase(21)) * .025, -CHOPPER_MOTION_VARIANCE.maximumPitchRadians, CHOPPER_MOTION_VARIANCE.maximumPitchRadians);
	const yaw = supportYawForDirection(dx, dz);
	const bank = clamp(Math.sin(seconds * .36 + phase(22)) * .11 + Math.sin(seconds * .17 + phase(23)) * .05, -CHOPPER_MOTION_VARIANCE.maximumBankRadians, CHOPPER_MOTION_VARIANCE.maximumBankRadians);
	return Object.freeze({
		position: Object.freeze(position),
		attitude: Object.freeze([
			pitch,
			yaw,
			bank
		])
	});
}
function clampFlightPosition(position, world, radius) {
	return [
		clamp(position[0], world.bounds.minX + radius, world.bounds.maxX - radius),
		clamp(position[1], world.bounds.floorY + radius, world.bounds.ceilingY - radius),
		clamp(position[2], world.bounds.minZ + radius, world.bounds.maxZ - radius)
	];
}
function resolveFlightPosition(from, desired, radius, world) {
	const clamped = clampFlightPosition(desired, world, radius);
	const resolved = world.resolveFlightPosition?.(from, clamped, radius) ?? clamped;
	if (!finiteTuple(resolved)) return [...from];
	const bounded = clampFlightPosition(resolved, world, radius);
	if (world.isFlightPositionValid?.(bounded) === false) return [...from];
	return bounded;
}
function clampFlightEnvelopePosition(position, world, envelope) {
	const clearance = supportAircraftRootClearance(envelope);
	const boundedAxis = (value, minimum, maximum) => minimum <= maximum ? clamp(value, minimum, maximum) : (minimum + maximum) / 2;
	return [
		boundedAxis(position[0], world.bounds.minX + clearance.negativeX, world.bounds.maxX - clearance.positiveX),
		boundedAxis(position[1], world.bounds.floorY + clearance.negativeY, world.bounds.ceilingY - clearance.positiveY),
		boundedAxis(position[2], world.bounds.minZ + clearance.negativeZ, world.bounds.maxZ - clearance.positiveZ)
	];
}
function resolveFlightEnvelopePosition(from, desired, envelope, world) {
	const clamped = clampFlightEnvelopePosition(desired, world, envelope);
	const resolved = world.resolveFlightEnvelopePosition?.(from, clamped, envelope) ?? clamped;
	if (!finiteTuple(resolved)) return clampFlightEnvelopePosition(from, world, envelope);
	return clampFlightEnvelopePosition(resolved, world, envelope);
}
function supportVec3Distance(left, right) {
	return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}
/**
* Admission uses the same host-provided continuous swept-envelope resolver as
* live movement. Checking both directions also proves that neither endpoint is
* an already-overlapping hold position. A missing resolver means the arena has
* no authored aircraft solids and the clamped route remains authoritative.
*/
function carpetFlightRouteAdmitted(start, end, envelope, world) {
	if (!world.resolveFlightEnvelopePosition) return supportVec3Distance(start, end) > .5;
	const admittedStart = resolveFlightEnvelopePosition(start, start, envelope, world);
	const admittedForward = resolveFlightEnvelopePosition(start, end, envelope, world);
	const admittedEnd = resolveFlightEnvelopePosition(end, end, envelope, world);
	const admittedReverse = resolveFlightEnvelopePosition(end, start, envelope, world);
	return supportVec3Distance(start, end) > .5 && supportVec3Distance(admittedStart, start) <= CARPET_BOMBER_ROUTE_ADMISSION_EPSILON_M && supportVec3Distance(admittedForward, end) <= CARPET_BOMBER_ROUTE_ADMISSION_EPSILON_M && supportVec3Distance(admittedEnd, end) <= CARPET_BOMBER_ROUTE_ADMISSION_EPSILON_M && supportVec3Distance(admittedReverse, start) <= CARPET_BOMBER_ROUTE_ADMISSION_EPSILON_M;
}
function admittedAircraftRouteProgress(entity) {
	const dx = entity.routeEnd[0] - entity.routeStart[0];
	const dz = entity.routeEnd[2] - entity.routeStart[2];
	const lengthSquared = dx * dx + dz * dz;
	if (lengthSquared <= 1e-8) return null;
	const progress = clamp(((entity.position[0] - entity.routeStart[0]) * dx + (entity.position[2] - entity.routeStart[2]) * dz) / lengthSquared, 0, 1);
	const lateralX = entity.position[0] - (entity.routeStart[0] + dx * progress);
	const lateralZ = entity.position[2] - (entity.routeStart[2] + dz * progress);
	return Math.hypot(lateralX, lateralZ) <= CARPET_BOMBER_ROUTE_ADMISSION_EPSILON_M * 4 ? progress : null;
}
function supportFlightCentreVolume(world) {
	const width = Math.max(1, world.bounds.maxX - world.bounds.minX);
	const depth = Math.max(1, world.bounds.maxZ - world.bounds.minZ);
	const height = Math.max(1, world.bounds.ceilingY - world.bounds.floorY);
	const fallbackCentre = Object.freeze([
		(world.bounds.minX + world.bounds.maxX) / 2,
		clamp(world.bounds.floorY + height * .45, world.bounds.floorY + 1, world.bounds.ceilingY - .5),
		(world.bounds.minZ + world.bounds.maxZ) / 2
	]);
	const requested = world.supportFlightCentreVolume;
	const centre = finiteTuple(requested?.centre) ? clampFlightPosition(requested.centre, world, .35) : fallbackCentre;
	const requestedExtents = requested?.halfExtents;
	const halfExtents = Object.freeze([
		clamp(finiteTuple(requestedExtents) ? Math.abs(requestedExtents[0]) : width * .12, 1.5, Math.min(8, width * .32)),
		clamp(finiteTuple(requestedExtents) ? Math.abs(requestedExtents[1]) : height * .05, .6, Math.min(2.5, height * .2)),
		clamp(finiteTuple(requestedExtents) ? Math.abs(requestedExtents[2]) : depth * .12, 1.5, Math.min(8, depth * .32))
	]);
	return Object.freeze({
		centre: Object.freeze([...centre]),
		halfExtents
	});
}
/**
* Host-only deterministic centre-map deployment. The first candidate is a
* separated 6x4 formation; bounded seeded probes recover individual slots from
* colliders without accepting a caller-provided anchor or collapsing units.
*/
function planDroneCentreSpawns(world, count, seed) {
	if (!Number.isSafeInteger(count) || count < 1 || count > 24) throw new Error("drone centre spawn count must be between 1 and 24");
	const volume = supportFlightCentreVolume(world);
	const columns = count === 1 ? 1 : 6;
	const rows = Math.ceil(count / columns);
	const positions = [];
	const rotation = count === 1 ? 0 : seed % 4 * Math.PI / 2;
	const cosine = Math.cos(rotation);
	const sine = Math.sin(rotation);
	const rotate = (x, z) => Object.freeze([x * cosine - z * sine, x * sine + z * cosine]);
	for (let index = 0; index < count; index += 1) {
		const column = index % columns;
		const row = Math.floor(index / columns);
		const [rotatedX, rotatedZ] = rotate(columns === 1 ? 0 : (column / (columns - 1) - .5) * volume.halfExtents[0] * 2, rows === 1 ? 0 : (row / (rows - 1) - .5) * volume.halfExtents[2] * 2);
		let admitted = null;
		for (let attempt = 0; attempt < DRONE_DEPLOYMENT_POLICY.maximumAdmissionProbesPerUnit; attempt += 1) {
			const probeAngle = unit(seed ^ index, 300 + attempt) * Math.PI * 2;
			const probeRadius = attempt === 0 ? 0 : Math.min(Math.min(volume.halfExtents[0], volume.halfExtents[2]) * .72, .48 * Math.ceil(attempt / 4));
			const raw = Object.freeze([
				clamp(volume.centre[0] + rotatedX + Math.cos(probeAngle) * probeRadius, world.bounds.minX + .35, world.bounds.maxX - .35),
				clamp(volume.centre[1] + (index % 3 - 1) * Math.min(.8, volume.halfExtents[1]) + Math.sin(probeAngle * .5) * Math.min(.35, volume.halfExtents[1] * .25), world.bounds.floorY + .5, world.bounds.ceilingY - .5),
				clamp(volume.centre[2] + rotatedZ + Math.sin(probeAngle) * probeRadius, world.bounds.minZ + .35, world.bounds.maxZ - .35)
			]);
			const candidate = world.resolveFlightPosition?.(raw, raw, .35) ?? raw;
			if (!finiteTuple(candidate)) continue;
			const resolved = clampFlightPosition(candidate, world, .35);
			if (world.isFlightPositionValid?.(resolved) === false) continue;
			if (positions.some((position) => distance(position, resolved) < DRONE_DEPLOYMENT_POLICY.minimumSpawnSeparationM)) continue;
			admitted = Object.freeze([...resolved]);
			break;
		}
		if (!admitted) return Object.freeze({
			centre: volume.centre,
			positions: Object.freeze([])
		});
		positions.push(admitted);
	}
	return Object.freeze({
		centre: volume.centre,
		positions: Object.freeze(positions)
	});
}
function attitudeFromMotion(from, to, fallback) {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	const dz = to[2] - from[2];
	const horizontal = Math.hypot(dx, dz);
	if (horizontal < 1e-5 && Math.abs(dy) < 1e-5) return [...fallback];
	return [
		clamp(Math.atan2(dy, Math.max(.001, horizontal)), -.35, .35),
		horizontal >= 1e-5 ? supportYawForDirection(dx, dz, fallback[1]) : fallback[1],
		fallback[2]
	];
}
function adrenalineModifiers(activeUntilMs, nowMs) {
	const active = Number.isFinite(activeUntilMs) && Number.isFinite(nowMs) && nowMs < activeUntilMs;
	return Object.freeze({
		active,
		damage: active ? ADRENALINE_DAMAGE_MULTIPLIER : 1,
		movement: active ? ADRENALINE_MOVEMENT_MULTIPLIER : 1,
		reloadDuration: active ? ADRENALINE_RELOAD_DURATION_MULTIPLIER : 1
	});
}
var HostKillstreakRuntime = class {
	matchEpoch;
	catalog;
	actors = /* @__PURE__ */ new Map();
	entities = /* @__PURE__ */ new Map();
	carpetBombers = /* @__PURE__ */ new Map();
	timedActivations = /* @__PURE__ */ new Map();
	swarmFireLanes = /* @__PURE__ */ new Map();
	revision = 0;
	entityCounter = 0;
	activationCounter = 0;
	resultCounter = 0;
	seenActivationRequestIds = /* @__PURE__ */ new Set();
	lastAdvancedAtMs = 0;
	hostileTargetCache = /* @__PURE__ */ new Map();
	sortedHostileTargetCache = /* @__PURE__ */ new Map();
	/** HF-334: host-injected grant-admissibility port; null = band closed. */
	carePackageWeaponGrantPort;
	constructor(matchEpoch, catalog = PASS65_KILLSTREAK_CATALOG, carePackageWeaponGrantPort = null) {
		if (!Number.isSafeInteger(matchEpoch) || matchEpoch < 0) throw new Error("match epoch must be a non-negative safe integer");
		this.matchEpoch = matchEpoch;
		this.catalog = catalog;
		this.carePackageWeaponGrantPort = carePackageWeaponGrantPort;
	}
	/**
	* HF-334: the flamethrower band is open only while the injected host port
	* reports the grant honorable AND no already-rolled crate is still carrying
	* one (prevents two flamethrowers under the single-instance authority).
	*/
	isFlamethrowerRollAdmissible() {
		if (this.carePackageWeaponGrantPort?.isFlamethrowerGrantAdmissible() !== true) return false;
		for (const entity of this.entities.values()) if (entity.kind === "care-crate" && entity.reward.kind === "timed-map-weapon") return false;
		return true;
	}
	registerActor(actorId, team, lifeId, loadout) {
		if (!/^[A-Za-z0-9_-]{1,80}$/.test(actorId)) throw new Error("invalid support actor ID");
		if (!Number.isSafeInteger(lifeId) || lifeId < 0) throw new Error("invalid actor life ID");
		this.actors.set(actorId, {
			actorId,
			team,
			lifeId,
			loadout: parseKillstreakLoadout(loadout),
			streak: 0,
			cycleProgress: 0,
			earned: /* @__PURE__ */ new Set(),
			availableCharges: /* @__PURE__ */ new Map(),
			careRewards: [],
			trainingReward: null,
			adrenalineUntilMs: 0,
			possession: null,
			lastActivationSequence: -1,
			lastControlSequence: -1
		});
		this.revision += 1;
	}
	/** Host-owned attribution retained through the final residual-fire expiry. */
	carpetBomberOwner(activationId) {
		const activation = this.carpetBombers.get(activationId);
		if (activation) return Object.freeze({
			ownerId: activation.ownerId,
			team: activation.team
		});
		for (const entity of this.entities.values()) if (entity.activationId === activationId && entity.kind === "aircraft") return Object.freeze({
			ownerId: entity.ownerId,
			team: entity.team
		});
		return null;
	}
	carpetBomberReservationCount() {
		return this.carpetBombers.size;
	}
	/**
	* Creates canonical, collision-free damage receipts for hosted humans inside
	* one admitted Carpet Bomber ground-fire patch. The caller supplies only the
	* host's remote-human snapshot; local-player and bot lanes remain unchanged.
	*/
	carpetGroundFireDamageEvents(input, targets, hasLineOfSight = () => true) {
		if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.activationId) || !/^[A-Za-z0-9_-]{1,80}$/.test(input.ownerId) || !finiteTuple(input.point) || !Number.isFinite(input.radiusM) || input.radiusM <= 0 || !Number.isFinite(input.damage) || input.damage <= 0 || !Number.isFinite(input.atMs) || input.atMs < 0) return Object.freeze([]);
		const radiusSquared = input.radiusM * input.radiusM;
		const events = [];
		for (const target of [...targets].sort((left, right) => left.id.localeCompare(right.id))) {
			if (target.kind !== "player" || !target.alive || !finiteTuple(target.position)) continue;
			const dx = target.position[0] - input.point[0];
			const dz = target.position[2] - input.point[2];
			if (dx * dx + dz * dz >= radiusSquared || !hasLineOfSight(input.point, target.position)) continue;
			events.push(this.damageEvent(input.activationId, "carpet-bomber", input.ownerId, target, input.damage, input.point, input.atMs, target.position, input.point));
			if (events.length >= 64) break;
		}
		return Object.freeze(events);
	}
	checkpoint(nowMs) {
		if (!Number.isFinite(nowMs) || this.actors.size > 10 || this.seenActivationRequestIds.size > 512) return null;
		const actors = [...this.actors.values()].sort((left, right) => left.actorId.localeCompare(right.actorId)).map((actor) => Object.freeze({
			actorId: actor.actorId,
			team: actor.team,
			lifeId: actor.lifeId,
			loadout: parseKillstreakLoadout(actor.loadout),
			streak: actor.streak,
			cycleProgress: actor.cycleProgress,
			earned: Object.freeze(actor.loadout.slots.filter((id) => actor.earned.has(id))),
			availableCharges: Object.freeze(actor.loadout.slots.flatMap((id) => {
				const count = actor.availableCharges.get(id) ?? 0;
				return count > 0 ? [Object.freeze({
					id,
					count
				})] : [];
			})),
			careRewards: Object.freeze([...actor.careRewards]),
			adrenalineRemainingMs: Math.max(0, actor.adrenalineUntilMs - nowMs),
			lastActivationSequence: actor.lastActivationSequence,
			lastControlSequence: actor.lastControlSequence
		}));
		const checkpoint = Object.freeze({
			schemaVersion: 1,
			matchEpoch: this.matchEpoch,
			revision: this.revision,
			entityCounter: this.entityCounter,
			activationCounter: this.activationCounter,
			resultCounter: this.resultCounter,
			seenActivationRequestIds: Object.freeze([...this.seenActivationRequestIds].sort()),
			actors: Object.freeze(actors)
		});
		return isKillstreakRuntimeCheckpoint(checkpoint) ? checkpoint : null;
	}
	/** Restore once into a fresh runtime; caller resets disconnected transport sequences afterwards. */
	restoreCheckpoint(checkpoint, nowMs, downtimeMs = 0) {
		if (!Number.isFinite(nowMs) || !Number.isFinite(downtimeMs) || downtimeMs < 0 || !isKillstreakRuntimeCheckpoint(checkpoint) || checkpoint.matchEpoch !== this.matchEpoch || this.actors.size !== 0 || this.entities.size !== 0 || this.carpetBombers.size !== 0 || this.timedActivations.size !== 0 || this.swarmFireLanes.size !== 0 || this.seenActivationRequestIds.size !== 0 || this.revision !== 0 || this.entityCounter !== 0 || this.activationCounter !== 0 || this.resultCounter !== 0 || this.lastAdvancedAtMs !== 0) return false;
		const restoredActors = checkpoint.actors.map((actor) => ({
			actorId: actor.actorId,
			team: actor.team,
			lifeId: actor.lifeId,
			loadout: parseKillstreakLoadout(actor.loadout),
			streak: actor.streak,
			cycleProgress: actor.cycleProgress,
			earned: new Set(actor.earned),
			availableCharges: new Map(actor.availableCharges.map((charge) => [charge.id, charge.count])),
			careRewards: [...actor.careRewards],
			trainingReward: null,
			adrenalineUntilMs: nowMs + Math.max(0, actor.adrenalineRemainingMs - downtimeMs),
			possession: null,
			lastActivationSequence: actor.lastActivationSequence,
			lastControlSequence: actor.lastControlSequence
		}));
		for (const actor of restoredActors) this.actors.set(actor.actorId, actor);
		for (const requestId of checkpoint.seenActivationRequestIds) this.seenActivationRequestIds.add(requestId);
		this.revision = checkpoint.revision;
		this.entityCounter = checkpoint.entityCounter;
		this.activationCounter = checkpoint.activationCounter;
		this.resultCounter = checkpoint.resultCounter;
		this.lastAdvancedAtMs = nowMs;
		return true;
	}
	recordEligibleElimination(actorId, source) {
		const actor = this.actors.get(actorId);
		if (!actor || source === "killstreak") return [];
		actor.streak = Math.min(MAX_REPLICATED_KILLSTREAK_STREAK, actor.streak + 1);
		const nextCycleProgress = actor.cycleProgress + 1;
		const unlocks = actor.loadout.slots.filter((id) => {
			const definition = exactDefinition(id, this.catalog);
			return definition && !actor.earned.has(id) && nextCycleProgress >= definition.cost;
		});
		if (unlocks.some((id) => (actor.availableCharges.get(id) ?? 0) >= 255)) {
			this.revision += 1;
			return Object.freeze([]);
		}
		actor.cycleProgress = nextCycleProgress;
		const newlyEarned = [];
		for (const id of unlocks) {
			actor.earned.add(id);
			actor.availableCharges.set(id, (actor.availableCharges.get(id) ?? 0) + 1);
			newlyEarned.push(id);
		}
		const finalThreshold = Math.max(...actor.loadout.slots.map((id) => exactDefinition(id, this.catalog)?.cost ?? 0));
		if (finalThreshold > 0 && actor.cycleProgress >= finalThreshold) {
			actor.cycleProgress = 0;
			actor.earned.clear();
		}
		this.revision += 1;
		return Object.freeze(newlyEarned);
	}
	/** Host-owned life identity used to rebind an authenticated replacement transport. */
	actorLifeId(actorId) {
		return this.actors.get(actorId)?.lifeId ?? null;
	}
	recordActorDeath(actorId, nextLifeId) {
		const actor = this.actors.get(actorId);
		if (!actor) return;
		actor.lifeId = nextLifeId;
		actor.streak = 0;
		actor.cycleProgress = 0;
		actor.earned.clear();
		actor.trainingReward = null;
		actor.adrenalineUntilMs = 0;
		actor.lastActivationSequence = -1;
		actor.lastControlSequence = -1;
		this.restoreActorControl(actor, true);
		for (const entity of this.entities.values()) if (entity.kind === "chopper" && entity.ownerId === actorId && entity.gunController !== "ai") {
			entity.gunController = "ai";
			entity.pendingPlayerFire = false;
			entity.pendingPlayerMissile = null;
			entity.revision += 1;
		} else if (entity.kind === "care-crate" && entity.captureActorId === actorId) {
			entity.phase = "landed";
			entity.captureActorId = null;
			entity.captureStartedAtMs = null;
			entity.revision += 1;
		}
		this.revision += 1;
	}
	/**
	* A transport disconnect ends possession immediately without deleting earned
	* rewards or per-match progress. Sequence domains restart on the replacement
	* transport, while activation request IDs remain globally replay-protected.
	*/
	recordActorDisconnect(actorId) {
		const actor = this.actors.get(actorId);
		if (!actor) return;
		actor.lastActivationSequence = -1;
		actor.lastControlSequence = -1;
		actor.trainingReward = null;
		this.restoreActorControl(actor, true);
		for (const entity of this.entities.values()) if (entity.kind === "chopper" && entity.ownerId === actorId && entity.gunController !== "ai") {
			entity.gunController = "ai";
			entity.pendingPlayerFire = false;
			entity.pendingPlayerMissile = null;
			entity.revision += 1;
		} else if (entity.kind === "care-crate" && entity.captureActorId === actorId) {
			entity.phase = "landed";
			entity.captureActorId = null;
			entity.captureStartedAtMs = null;
			entity.revision += 1;
		}
		this.revision += 1;
	}
	/** Permanently removes an actor and every support resource it owns. */
	unregisterActor(actorId) {
		if (!this.actors.get(actorId)) return;
		this.recordActorDisconnect(actorId);
		for (const entity of [...this.entities.values()]) if (entity.ownerId === actorId) this.expireEntity(entity.id);
		for (const [activationId, activation] of this.carpetBombers) {
			if (activation.ownerId !== actorId) continue;
			if (activation.authorityReleaseAtMs === null) {
				this.carpetBombers.delete(activationId);
				continue;
			}
			activation.nextDropOrdinal = activation.impacts.length;
			activation.nextImpactOrdinal = activation.impacts.length;
		}
		for (const [activationId, activation] of this.timedActivations) if (activation.ownerId === actorId) this.timedActivations.delete(activationId);
		this.actors.delete(actorId);
		this.revision += 1;
	}
	/** Ends the epoch's active support while retaining a final, non-possessed projection. */
	endMatch() {
		for (const actor of this.actors.values()) {
			actor.adrenalineUntilMs = 0;
			actor.trainingReward = null;
			this.restoreActorControl(actor, true);
		}
		const expired = [...this.entities.keys()];
		for (const entityId of expired) this.expireEntity(entityId);
		this.carpetBombers.clear();
		this.timedActivations.clear();
		this.swarmFireLanes.clear();
		this.revision += 1;
		return Object.freeze(expired);
	}
	nextEntityId(kind) {
		this.entityCounter += 1;
		return `ks-${this.matchEpoch}-${kind}-${this.entityCounter}`;
	}
	nextActivationId() {
		this.activationCounter += 1;
		return `ks-activation-${this.matchEpoch}-${this.activationCounter}`;
	}
	actualActivationId(actor, slot) {
		if (slot === 1 && actor.trainingReward) return actor.trainingReward;
		if (slot === 1 && actor.careRewards.length > 0) return actor.careRewards[0];
		return actor.loadout.slots[slot - 1];
	}
	/**
	* Host/offline-only bridge for the secure Gun Range test bay. The next
	* activation still traverses the normal activation admission, entity caps,
	* placement, damage and replication path; this grants no client authority.
	*/
	grantTrainingReward(actorId, lifeId, id, context) {
		const reject = (reason) => Object.freeze({
			accepted: false,
			reason
		});
		if (context.arenaId !== "gun-range" || context.stationKind !== "secure-test-bay" || context.authorityRole !== "offline" && context.authorityRole !== "host") return reject("invalid-training-context");
		const actor = this.actors.get(actorId);
		if (!actor) return reject("unknown-actor");
		if (actor.lifeId !== lifeId) return reject("life-mismatch");
		if (!exactDefinition(id, this.catalog)) return reject("unknown-reward");
		actor.trainingReward = id;
		this.revision += 1;
		return Object.freeze({
			accepted: true,
			reason: "accepted"
		});
	}
	activate(intent, nowMs, world) {
		const actor = this.actors.get(intent.by);
		const reject = (reason) => Object.freeze({
			accepted: false,
			reason,
			activationId: null,
			activatedId: null,
			entityIds: []
		});
		if (!actor) return reject("unknown-actor");
		if (intent.matchEpoch !== this.matchEpoch) return reject("match-epoch-mismatch");
		if (intent.lifeId !== actor.lifeId) return reject("life-mismatch");
		if (!Number.isSafeInteger(intent.sequence) || intent.sequence <= actor.lastActivationSequence) return reject("replayed-sequence");
		if (!/^[A-Za-z0-9_-]{8,80}$/.test(intent.activationId)) return reject("invalid-activation-id");
		if (!Number.isFinite(nowMs)) return reject("invalid-time");
		const actualId = this.actualActivationId(actor, intent.slot);
		if (actualId !== intent.expectedId) return reject("selection-mismatch");
		const fromTraining = intent.slot === 1 && actor.trainingReward === actualId;
		const fromCare = !fromTraining && intent.slot === 1 && actor.careRewards[0] === actualId;
		if (!fromTraining && !fromCare && (actor.availableCharges.get(actualId) ?? 0) < 1) return reject("reward-not-earned");
		if (this.seenActivationRequestIds.has(intent.activationId)) return reject("duplicate-activation-id");
		const entityNeed = actualId === "drone-swarm" ? 24 : actualId === "care-package" ? 2 : actualId === "chopper" || actualId === "piloted-drone" || actualId === "carpet-bomber" ? 1 : 0;
		if (this.entities.size + entityNeed > 32) return reject("support-entity-cap");
		if (actualId === "carpet-bomber" && this.carpetBombers.size >= 32) return reject("carpet-reservation-cap");
		if ([...this.entities.values()].some((entity) => entity.ownerId === actor.actorId && (actualId === "chopper" && entity.kind === "chopper" || actualId === "piloted-drone" && entity.kind === "drone" && entity.mode === "piloted" || actualId === "drone-swarm" && entity.kind === "drone" && entity.mode === "swarm"))) return reject("duplicate-owner-support-kind");
		const activationId = this.nextActivationId();
		const seed = hashText(`${this.matchEpoch}:${activationId}:${actualId}`);
		const requestedAnchor = finiteTuple(intent.anchor) ? this.clampAnchor(intent.anchor, world) : this.defaultAnchor(actor.actorId, world);
		const anchor = actualId === "care-package" || actualId === "carpet-bomber" ? [
			requestedAnchor[0],
			supportGroundHeight(world, requestedAnchor[0], requestedAnchor[2]),
			requestedAnchor[2]
		] : requestedAnchor;
		const carpetPlan = actualId === "carpet-bomber" ? this.carpetImpactPattern(anchor, seed, world, intent.facing) : null;
		if (actualId === "carpet-bomber" && carpetPlan === null) return reject("no-clear-carpet-route");
		const droneSpawnPlan = actualId === "piloted-drone" ? planDroneCentreSpawns(world, 1, seed) : actualId === "drone-swarm" ? planDroneCentreSpawns(world, 24, seed) : null;
		if (droneSpawnPlan && droneSpawnPlan.positions.length !== (actualId === "drone-swarm" ? 24 : 1)) return reject("no-valid-centre-drone-spawn-volume");
		actor.lastActivationSequence = intent.sequence;
		this.seenActivationRequestIds.add(intent.activationId);
		if (fromTraining) actor.trainingReward = null;
		else if (fromCare) actor.careRewards.shift();
		else {
			const remainingCharges = (actor.availableCharges.get(actualId) ?? 0) - 1;
			if (remainingCharges > 0) actor.availableCharges.set(actualId, remainingCharges);
			else actor.availableCharges.delete(actualId);
		}
		const entityIds = [];
		if (actualId === "adrenaline") {
			actor.adrenalineUntilMs = nowMs + ADRENALINE_DURATION_MS;
			this.timedActivations.set(activationId, {
				activationId,
				ownerId: actor.actorId,
				id: actualId,
				expiresAtMs: actor.adrenalineUntilMs
			});
		} else if (actualId === "care-package") {
			const roll = rollCarePackageReward(this.catalog, seed, { flamethrowerAdmissible: this.isFlamethrowerRollAdmissible() });
			const reward = roll.reward;
			const rollUnit = roll.rollUnit;
			const id = this.nextEntityId("care");
			const aircraftId = this.nextEntityId("care-aircraft");
			const top = Math.min(world.bounds.ceilingY - 1, Math.max(world.bounds.floorY + 12, world.bounds.floorY + 24));
			const direction = unit(seed, 31) < .5 ? -1 : 1;
			const lateral = (unit(seed, 32) - .5) * 2.4;
			const routeStart = [
				clamp(anchor[0] - direction * 18, world.bounds.minX + 1.5, world.bounds.maxX - 1.5),
				top,
				clamp(anchor[2] + lateral, world.bounds.minZ + 1.5, world.bounds.maxZ - 1.5)
			];
			const routeEnd = [
				clamp(anchor[0] + direction * 90, world.bounds.minX + 1.5, world.bounds.maxX - 1.5),
				top,
				clamp(anchor[2] - lateral, world.bounds.minZ + 1.5, world.bounds.maxZ - 1.5)
			];
			const dropProgress = 800 / CARE_AIRCRAFT_DURATION_MS;
			const dropEased = dropProgress * dropProgress * (3 - 2 * dropProgress);
			const descentStartPosition = [
				routeStart[0] + (routeEnd[0] - routeStart[0]) * dropEased,
				routeStart[1] + Math.sin(dropProgress * Math.PI + unit(seed, 33) * Math.PI) * .28 - .9,
				routeStart[2] + (routeEnd[2] - routeStart[2]) * dropEased
			];
			this.entities.set(aircraftId, {
				id: aircraftId,
				activationId,
				ownerId: actor.actorId,
				team: actor.team,
				createdAtMs: nowMs,
				expiresAtMs: nowMs + CARE_AIRCRAFT_DURATION_MS,
				position: routeStart,
				velocity: [
					0,
					0,
					0
				],
				attitude: [
					0,
					supportYawForDirection(routeEnd[0] - routeStart[0], routeEnd[2] - routeStart[2]),
					0
				],
				health: 1,
				revision: 0,
				kind: "aircraft",
				variant: "care",
				phase: "inbound",
				seed,
				routeStart,
				routeEnd
			});
			this.entities.set(id, {
				id,
				activationId,
				ownerId: actor.actorId,
				team: actor.team,
				createdAtMs: nowMs,
				expiresAtMs: nowMs + 6e4,
				position: [...routeStart],
				velocity: [
					0,
					0,
					0
				],
				attitude: [
					0,
					0,
					0
				],
				health: 100,
				revision: 0,
				kind: "care-crate",
				phase: "inbound",
				dropPosition: [
					anchor[0],
					anchor[1] + .45,
					anchor[2]
				],
				descentStartPosition,
				descentStartsAtMs: nowMs + 800,
				aircraftId,
				reward,
				rollUnit,
				captureActorId: null,
				captureStartedAtMs: null,
				captureRequiredMs: null
			});
			entityIds.push(id, aircraftId);
		} else if (actualId === "carpet-bomber") {
			const plan = carpetPlan;
			const impacts = plan.impacts;
			const groundAnchor = Object.freeze([...anchor]);
			const aircraftId = this.nextEntityId("carpet-aircraft");
			const pathStart = plan.pathStart;
			const pathEnd = plan.pathEnd;
			this.carpetBombers.set(activationId, {
				activationId,
				ownerId: actor.actorId,
				team: actor.team,
				createdAtMs: nowMs,
				aircraftId,
				authorityReleaseAtMs: null,
				impacts,
				impactAtMs: impacts.map((_, ordinal) => nowMs + CARPET_TARGET_MARKER_MAX_LIFETIME_MS + ordinal * 180),
				anchor: groundAnchor,
				pathStart,
				pathEnd,
				halfWidthM: plan.halfWidthM,
				nextDropOrdinal: 0,
				nextImpactOrdinal: 0,
				dropRouteProgress: plan.dropRouteProgress,
				routeCompleted: false,
				routeCanceled: false
			});
			const flightStart = plan.flightStart;
			const flightEnd = plan.flightEnd;
			this.entities.set(aircraftId, {
				id: aircraftId,
				activationId,
				ownerId: actor.actorId,
				team: actor.team,
				createdAtMs: nowMs,
				expiresAtMs: nowMs + CARE_AIRCRAFT_DURATION_MS,
				position: [...flightStart],
				velocity: [
					0,
					0,
					0
				],
				attitude: [
					0,
					supportYawForDirection(flightEnd[0] - flightStart[0], flightEnd[2] - flightStart[2]),
					0
				],
				health: 1,
				revision: 0,
				kind: "aircraft",
				variant: "carpet",
				phase: "inbound",
				seed,
				routeStart: [...flightStart],
				routeEnd: [...flightEnd]
			});
			entityIds.push(aircraftId);
		} else if (actualId === "chopper") {
			const id = this.nextEntityId("chopper");
			const centre = [...supportFlightCentreVolume(world).centre];
			const chopper = {
				id,
				activationId,
				ownerId: actor.actorId,
				team: actor.team,
				createdAtMs: nowMs,
				expiresAtMs: nowMs + CHOPPER_DURATION_MS,
				position: [
					centre[0],
					centre[1],
					centre[2]
				],
				velocity: [
					0,
					0,
					0
				],
				attitude: [
					0,
					0,
					0
				],
				health: 800,
				revision: 0,
				kind: "chopper",
				phase: "inbound",
				seed,
				routeCentre: centre,
				gunController: "ai",
				nextShotAtMs: nowMs + 600,
				nextShotOrdinal: 0,
				aimYaw: 0,
				aimPitch: 0,
				pendingPlayerFire: false,
				pendingPlayerMissile: null,
				missilesRemaining: 6,
				nextMissileAtMs: nowMs,
				nextMissileOrdinal: 0,
				pendingMissiles: []
			};
			const pose = chopperRoutePose(seed, nowMs, nowMs, centre, world.bounds);
			chopper.position = resolveFlightPosition(centre, pose.position, 1.25, world);
			chopper.attitude = attitudeFromMotion(centre, chopper.position, pose.attitude);
			this.entities.set(id, chopper);
			entityIds.push(id);
		} else if (actualId === "piloted-drone") {
			this.restoreActorControl(actor, true);
			const id = this.nextEntityId("pilot-drone");
			const admittedSpawn = [...droneSpawnPlan.positions[0]];
			this.entities.set(id, {
				id,
				activationId,
				ownerId: actor.actorId,
				team: actor.team,
				createdAtMs: nowMs,
				expiresAtMs: nowMs + PILOTED_DRONE_DURATION_MS,
				position: admittedSpawn,
				velocity: [
					0,
					0,
					0
				],
				attitude: [
					0,
					0,
					0
				],
				health: 50,
				revision: 0,
				kind: "drone",
				mode: "piloted",
				phase: "active",
				seed,
				magazine: DRONE_MAGAZINE_SIZE,
				reserveClips: 2,
				reloadCompletesAtMs: null,
				nextShotAtMs: nowMs,
				nextShotOrdinal: 0,
				targetId: null,
				yaw: 0,
				pitch: 0,
				thrust: 0,
				strafe: 0,
				vertical: 0,
				pendingPlayerFire: false,
				gunProfileId: DRONE_SUPPORT_DEFINITIONS.piloted.gunProfileId,
				nextSensorRefreshAtMs: nowMs,
				sensorContacts: [],
				swarmOrdinal: null,
				swarmIngressTarget: null,
				swarmPatrolTarget: null,
				swarmPatrolRefreshAtMs: Number.POSITIVE_INFINITY,
				swarmAdmittedSpawnY: null
			});
			entityIds.push(id);
		} else if (actualId === "drone-swarm") {
			for (let index = 0; index < 24; index += 1) {
				const id = this.nextEntityId("swarm-drone");
				const group = index % 6;
				const row = Math.floor(index / 6);
				const admittedSpawn = [...droneSpawnPlan.positions[index]];
				const routeAngle = group / 6 * Math.PI * 2 + (row - 1.5) * .11 + (unit(seed ^ index, 71) - .5) * .16;
				const routeDistance = Math.min((world.bounds.maxX - world.bounds.minX) * .31, (world.bounds.maxZ - world.bounds.minZ) * .31) * (.72 + row * .06);
				const ingressTarget = resolveFlightPosition(admittedSpawn, [
					clamp(droneSpawnPlan.centre[0] + Math.cos(routeAngle) * routeDistance, world.bounds.minX + .5, world.bounds.maxX - .5),
					clamp(admittedSpawn[1] + (index % 3 - 1) * .7, world.bounds.floorY + 1, world.bounds.ceilingY - .5),
					clamp(droneSpawnPlan.centre[2] + Math.sin(routeAngle) * routeDistance, world.bounds.minZ + .5, world.bounds.maxZ - .5)
				], .35, world);
				const ingressDx = ingressTarget[0] - admittedSpawn[0];
				const ingressDy = ingressTarget[1] - admittedSpawn[1];
				const ingressDz = ingressTarget[2] - admittedSpawn[2];
				const ingressRange = Math.max(.001, Math.hypot(ingressDx, ingressDy, ingressDz));
				const inboundSpeed = DRONE_DEPLOYMENT_POLICY.swarmIngressSpeedMps;
				this.entities.set(id, {
					id,
					activationId,
					ownerId: actor.actorId,
					team: actor.team,
					createdAtMs: nowMs,
					expiresAtMs: nowMs + DRONE_SWARM_DURATION_MS,
					position: admittedSpawn,
					velocity: [
						ingressDx / ingressRange * inboundSpeed,
						ingressDy / ingressRange * inboundSpeed,
						ingressDz / ingressRange * inboundSpeed
					],
					attitude: [
						0,
						supportYawForDirection(ingressDx, ingressDz),
						0
					],
					health: 50,
					revision: 0,
					kind: "drone",
					mode: "swarm",
					phase: "active",
					seed: seed ^ index,
					magazine: DRONE_MAGAZINE_SIZE,
					reserveClips: null,
					reloadCompletesAtMs: null,
					nextShotAtMs: nowMs + 500 + index * 35,
					nextShotOrdinal: 0,
					targetId: null,
					yaw: 0,
					pitch: 0,
					thrust: 0,
					strafe: 0,
					vertical: 0,
					pendingPlayerFire: false,
					gunProfileId: DRONE_SUPPORT_DEFINITIONS.swarm.gunProfileId,
					nextSensorRefreshAtMs: Number.POSITIVE_INFINITY,
					sensorContacts: [],
					swarmOrdinal: index,
					swarmIngressTarget: [...ingressTarget],
					swarmPatrolTarget: null,
					swarmPatrolRefreshAtMs: nowMs + 2e3,
					swarmAdmittedSpawnY: admittedSpawn[1]
				});
				entityIds.push(id);
			}
			this.swarmFireLanes.set(activationId, {
				nextAtMs: nowMs + 500,
				cursor: 0
			});
		} else {
			const definition = exactDefinition(actualId, this.catalog);
			this.timedActivations.set(activationId, {
				activationId,
				ownerId: actor.actorId,
				id: actualId,
				expiresAtMs: nowMs + Math.max(1, definition?.durationMs ?? 1)
			});
		}
		this.revision += 1;
		return Object.freeze({
			accepted: true,
			reason: "accepted",
			activationId,
			activatedId: actualId,
			entityIds: Object.freeze(entityIds)
		});
	}
	clampAnchor(anchor, world) {
		return [
			clamp(anchor[0], world.bounds.minX, world.bounds.maxX),
			clamp(anchor[1], world.bounds.floorY, world.bounds.ceilingY),
			clamp(anchor[2], world.bounds.minZ, world.bounds.maxZ)
		];
	}
	defaultAnchor(actorId, world) {
		const actor = actorPosition(world, actorId);
		return this.clampAnchor(actor ?? [
			(world.bounds.minX + world.bounds.maxX) / 2,
			world.bounds.floorY,
			(world.bounds.minZ + world.bounds.maxZ) / 2
		], world);
	}
	carpetImpactPattern(anchor, seed, world, requestedFacing, headingAttempt = 0, admittedBaseAngle) {
		const requestedStrikeBounds = world.supportStrikeBoundsAt?.(anchor);
		const strikeBounds = requestedStrikeBounds && [
			requestedStrikeBounds.minX,
			requestedStrikeBounds.maxX,
			requestedStrikeBounds.minZ,
			requestedStrikeBounds.maxZ
		].every(Number.isFinite) && requestedStrikeBounds.minX <= anchor[0] && anchor[0] <= requestedStrikeBounds.maxX && requestedStrikeBounds.minZ <= anchor[2] && anchor[2] <= requestedStrikeBounds.maxZ && requestedStrikeBounds.minX >= world.bounds.minX && requestedStrikeBounds.maxX <= world.bounds.maxX && requestedStrikeBounds.minZ >= world.bounds.minZ && requestedStrikeBounds.maxZ <= world.bounds.maxZ ? requestedStrikeBounds : world.bounds;
		const requestedLength = requestedFacing ? Math.hypot(requestedFacing[0], requestedFacing[2]) : 0;
		const baseAngle = admittedBaseAngle ?? (requestedFacing && Number.isFinite(requestedLength) && requestedLength > .001 ? Math.atan2(requestedFacing[2] / requestedLength, requestedFacing[0] / requestedLength) : unit(seed, 1) * Math.PI * 2);
		const angle = baseAngle + (CARPET_BOMBER_ROUTE_HEADING_OFFSETS[headingAttempt] ?? 0);
		const forward = [Math.cos(angle), Math.sin(angle)];
		const side = [-forward[1], forward[0]];
		const impactInsetM = CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M;
		const impactMinX = strikeBounds.maxX - strikeBounds.minX >= impactInsetM * 2 ? strikeBounds.minX + impactInsetM : (strikeBounds.minX + strikeBounds.maxX) / 2;
		const impactMaxX = strikeBounds.maxX - strikeBounds.minX >= impactInsetM * 2 ? strikeBounds.maxX - impactInsetM : impactMinX;
		const impactMinZ = strikeBounds.maxZ - strikeBounds.minZ >= impactInsetM * 2 ? strikeBounds.minZ + impactInsetM : (strikeBounds.minZ + strikeBounds.maxZ) / 2;
		const impactMaxZ = strikeBounds.maxZ - strikeBounds.minZ >= impactInsetM * 2 ? strikeBounds.maxZ - impactInsetM : impactMinZ;
		const impactCentre = Object.freeze([
			clamp(anchor[0], impactMinX, impactMaxX),
			anchor[1],
			clamp(anchor[2], impactMinZ, impactMaxZ)
		]);
		const runLengthM = Number.isFinite(requestedLength) && requestedLength > 1.5 ? clamp(requestedLength, 20, 60) : 34;
		const impacts = Object.freeze(Array.from({ length: 20 }, (_, index) => {
			const along = (index / 19 - .5) * runLengthM;
			const zigzag = (index % 2 === 0 ? -1 : 1) * (3.4 + unit(seed, index + 2) * 2.2);
			const deltaX = forward[0] * along + side[0] * zigzag;
			const deltaZ = forward[1] * along + side[1] * zigzag;
			let boundaryScale = 1;
			if (deltaX > 0) boundaryScale = Math.min(boundaryScale, (impactMaxX - impactCentre[0]) / deltaX);
			else if (deltaX < 0) boundaryScale = Math.min(boundaryScale, (impactMinX - impactCentre[0]) / deltaX);
			if (deltaZ > 0) boundaryScale = Math.min(boundaryScale, (impactMaxZ - impactCentre[2]) / deltaZ);
			else if (deltaZ < 0) boundaryScale = Math.min(boundaryScale, (impactMinZ - impactCentre[2]) / deltaZ);
			boundaryScale = clamp(boundaryScale, 0, 1);
			const x = impactCentre[0] + deltaX * boundaryScale;
			const z = impactCentre[2] + deltaZ * boundaryScale;
			return Object.freeze([
				x,
				supportGroundHeight(world, x, z),
				z
			]);
		}));
		const projections = impacts.map((impact) => (impact[0] - impactCentre[0]) * forward[0] + (impact[2] - impactCentre[2]) * forward[1]);
		const minimumProjection = Math.min(...projections);
		const maximumProjection = Math.max(...projections);
		const start = Object.freeze([
			impactCentre[0] + forward[0] * minimumProjection,
			anchor[1],
			impactCentre[2] + forward[1] * minimumProjection
		]);
		const end = Object.freeze([
			impactCentre[0] + forward[0] * maximumProjection,
			anchor[1],
			impactCentre[2] + forward[1] * maximumProjection
		]);
		const dx = end[0] - start[0];
		const dz = end[2] - start[2];
		const length = Math.max(.001, Math.hypot(dx, dz));
		let maximumPerpendicular = 0;
		for (const impact of impacts) {
			const perpendicular = Math.abs((impact[0] - start[0]) * dz - (impact[2] - start[2]) * dx) / length;
			maximumPerpendicular = Math.max(maximumPerpendicular, perpendicular);
		}
		const yaw = supportYawForDirection(forward[0], forward[1]);
		const flightEnvelope = {
			...CARPET_BOMBER_COLLISION_ENVELOPE,
			yaw
		};
		const clearance = supportAircraftRootClearance(flightEnvelope);
		const safeMinX = strikeBounds.minX + clearance.negativeX + CARPET_BOMBER_ROUTE_CLEARANCE_M;
		const safeMaxX = strikeBounds.maxX - clearance.positiveX - CARPET_BOMBER_ROUTE_CLEARANCE_M;
		const safeMinZ = strikeBounds.minZ + clearance.negativeZ + CARPET_BOMBER_ROUTE_CLEARANCE_M;
		const safeMaxZ = strikeBounds.maxZ - clearance.positiveZ - CARPET_BOMBER_ROUTE_CLEARANCE_M;
		const flightCentreX = safeMinX <= safeMaxX ? clamp(impactCentre[0], safeMinX, safeMaxX) : impactCentre[0];
		const flightCentreZ = safeMinZ <= safeMaxZ ? clamp(impactCentre[2], safeMinZ, safeMaxZ) : impactCentre[2];
		let minimumFlightProjection = minimumProjection;
		let maximumFlightProjection = maximumProjection;
		const restrictProjection = (direction, centre, minimum, maximum) => {
			if (Math.abs(direction) < 1e-8) return;
			const first = (minimum - centre) / direction;
			const second = (maximum - centre) / direction;
			minimumFlightProjection = Math.max(minimumFlightProjection, Math.min(first, second));
			maximumFlightProjection = Math.min(maximumFlightProjection, Math.max(first, second));
		};
		restrictProjection(forward[0], flightCentreX, safeMinX, safeMaxX);
		restrictProjection(forward[1], flightCentreZ, safeMinZ, safeMaxZ);
		if (minimumFlightProjection > maximumFlightProjection) {
			minimumFlightProjection = 0;
			maximumFlightProjection = 0;
		}
		const flightY = Math.min(world.bounds.ceilingY - 1, Math.max(world.bounds.floorY + 12, world.bounds.floorY + 24));
		const flightStart = Object.freeze([
			flightCentreX + forward[0] * minimumFlightProjection,
			flightY,
			flightCentreZ + forward[1] * minimumFlightProjection
		]);
		const flightEnd = Object.freeze([
			flightCentreX + forward[0] * maximumFlightProjection,
			flightY,
			flightCentreZ + forward[1] * maximumFlightProjection
		]);
		if (!carpetFlightRouteAdmitted(flightStart, flightEnd, flightEnvelope, world)) {
			const nextAttempt = headingAttempt + 1;
			return nextAttempt < CARPET_BOMBER_ROUTE_HEADING_OFFSETS.length ? this.carpetImpactPattern(anchor, seed, world, requestedFacing, nextAttempt, baseAngle) : null;
		}
		const dropRouteProgress = Object.freeze(impacts.map((_, ordinal) => {
			const raw = clamp((CARPET_TARGET_MARKER_MAX_LIFETIME_MS + ordinal * 180 - 420) / CARPET_BOMBER_ROUTE_TRAVERSE_MS, 0, 1);
			return raw * raw * (3 - 2 * raw);
		}));
		return Object.freeze({
			impacts,
			pathStart: start,
			pathEnd: end,
			flightStart,
			flightEnd,
			dropRouteProgress,
			halfWidthM: Math.max(.5, maximumPerpendicular + .35)
		});
	}
	control(intent, nowMs) {
		const actor = this.actors.get(intent.by);
		const reject = (reason) => Object.freeze({
			accepted: false,
			reason
		});
		if (!actor) return reject("unknown-actor");
		if (!Number.isFinite(nowMs)) return reject("invalid-time");
		if (intent.matchEpoch !== this.matchEpoch || intent.lifeId !== actor.lifeId) return reject("identity-mismatch");
		if (!Number.isSafeInteger(intent.sequence) || intent.sequence <= actor.lastControlSequence) return reject("replayed-sequence");
		const entity = this.entities.get(intent.entityId);
		if (!entity || entity.ownerId !== actor.actorId || nowMs >= entity.expiresAtMs || entity.health <= 0) return reject("entity-unavailable");
		actor.lastControlSequence = intent.sequence;
		if (intent.action === "toggle-chopper-gunner") {
			if (entity.kind !== "chopper") return reject("wrong-entity-kind");
			if (entity.gunController === "ai") {
				this.restoreActorControl(actor, true);
				entity.gunController = Object.freeze({
					actorId: actor.actorId,
					lifeId: actor.lifeId
				});
				actor.possession = Object.freeze({
					kind: "chopper-gunner",
					entityId: entity.id
				});
			} else {
				entity.gunController = "ai";
				entity.pendingPlayerFire = false;
				entity.pendingPlayerMissile = null;
				this.restoreActorControl(actor, false);
			}
			entity.revision += 1;
		} else if (intent.action === "toggle-piloted-drone") {
			if (entity.kind !== "drone" || entity.mode !== "piloted") return reject("wrong-entity-kind");
			if (actor.possession?.kind === "piloted-drone" && actor.possession.entityId === entity.id) {
				entity.pendingPlayerFire = false;
				entity.thrust = 0;
				entity.strafe = 0;
				entity.vertical = 0;
				entity.velocity = [
					0,
					0,
					0
				];
				entity.targetId = null;
				entity.sensorContacts.length = 0;
				this.restoreActorControl(actor, false);
			} else {
				this.restoreActorControl(actor, true);
				actor.possession = Object.freeze({
					kind: "piloted-drone",
					entityId: entity.id
				});
				entity.thrust = 0;
				entity.strafe = 0;
				entity.vertical = 0;
				entity.velocity = [
					0,
					0,
					0
				];
				entity.targetId = null;
				entity.nextSensorRefreshAtMs = Math.min(entity.nextSensorRefreshAtMs, nowMs);
			}
			entity.revision += 1;
		} else if (intent.action === "exit-piloted-drone") {
			if (entity.kind !== "drone" || entity.mode !== "piloted") return reject("wrong-entity-kind");
			entity.pendingPlayerFire = false;
			entity.thrust = 0;
			entity.strafe = 0;
			entity.vertical = 0;
			entity.velocity = [
				0,
				0,
				0
			];
			entity.targetId = null;
			entity.sensorContacts.length = 0;
			this.restoreActorControl(actor, false);
		} else {
			if (![
				intent.yawQ,
				intent.pitchQ,
				intent.thrustQ,
				intent.strafeQ,
				intent.verticalQ
			].every((value) => value === void 0 || Number.isFinite(value)) || intent.missileFire !== void 0 && typeof intent.missileFire !== "boolean") return reject("invalid-control-value");
			if (entity.kind === "chopper") {
				if (entity.gunController === "ai" || entity.gunController.actorId !== actor.actorId || entity.gunController.lifeId !== actor.lifeId) return reject("not-gun-controller");
				entity.aimYaw = wrapAngle(intent.yawQ ?? entity.aimYaw);
				entity.aimPitch = clamp(intent.pitchQ ?? entity.aimPitch, -1.2, .5);
				entity.pendingPlayerFire = intent.fire === true;
				if (intent.missileFire === true && entity.pendingPlayerMissile === null && entity.missilesRemaining > 0 && nowMs >= entity.nextMissileAtMs) entity.pendingPlayerMissile = Object.freeze({
					aimYaw: entity.aimYaw,
					aimPitch: entity.aimPitch
				});
			} else if (entity.kind === "drone" && entity.mode === "piloted") {
				if (intent.missileFire === true) return reject("missile-unavailable");
				if (actor.possession?.kind !== "piloted-drone" || actor.possession.entityId !== entity.id) return reject("not-drone-controller");
				entity.yaw = wrapAngle(intent.yawQ ?? entity.yaw);
				entity.pitch = clamp(intent.pitchQ ?? entity.pitch, -1.2, 1.2);
				entity.thrust = clamp(intent.thrustQ ?? entity.thrust, -1, 1);
				entity.strafe = clamp(intent.strafeQ ?? entity.strafe, -1, 1);
				entity.vertical = clamp(intent.verticalQ ?? entity.vertical, -1, 1);
				entity.pendingPlayerFire = intent.fire === true;
				entity.nextSensorRefreshAtMs = Math.min(entity.nextSensorRefreshAtMs, nowMs);
			} else return reject("wrong-entity-kind");
			entity.revision += 1;
		}
		this.revision += 1;
		return Object.freeze({
			accepted: true,
			reason: "accepted"
		});
	}
	restoreActorControl(actor, forceAll) {
		const possession = actor.possession;
		if (possession?.kind === "chopper-gunner") {
			const chopper = this.entities.get(possession.entityId);
			if (chopper?.kind === "chopper") {
				chopper.gunController = "ai";
				chopper.pendingPlayerFire = false;
				chopper.pendingPlayerMissile = null;
			}
		}
		if (forceAll && possession?.kind === "piloted-drone") {
			const drone = this.entities.get(possession.entityId);
			if (drone?.kind === "drone") {
				drone.pendingPlayerFire = false;
				drone.thrust = 0;
				drone.strafe = 0;
				drone.vertical = 0;
				drone.velocity = [
					0,
					0,
					0
				];
				drone.targetId = null;
				drone.sensorContacts.length = 0;
			}
		}
		actor.possession = null;
	}
	beginCareCapture(actorId, lifeId, crateId, nowMs, world) {
		const actor = this.actors.get(actorId);
		const entity = this.entities.get(crateId);
		if (!actor || actor.lifeId !== lifeId) return Object.freeze({
			accepted: false,
			reason: "identity-mismatch"
		});
		if (!Number.isFinite(nowMs)) return Object.freeze({
			accepted: false,
			reason: "invalid-time"
		});
		const grantPortOpen = this.carePackageWeaponGrantPort?.isFlamethrowerGrantAdmissible() === true;
		if (!(entity?.kind === "care-crate" && entity.reward.kind === "timed-map-weapon" && grantPortOpen) && actor.careRewards.length >= 8) return Object.freeze({
			accepted: false,
			reason: "reward-capacity"
		});
		if (!entity || entity.kind !== "care-crate" || entity.phase !== "landed") return Object.freeze({
			accepted: false,
			reason: "crate-unavailable"
		});
		if ([...this.entities.values()].some((candidate) => candidate.kind === "care-crate" && candidate.id !== entity.id && candidate.captureActorId === actorId)) return Object.freeze({
			accepted: false,
			reason: "actor-already-capturing"
		});
		const position = actorPosition(world, actorId);
		if (!position || distance(position, entity.position) > 2.75 || !lineOfSight(world, position, entity.position)) return Object.freeze({
			accepted: false,
			reason: "capture-admission-failed"
		});
		const friendlyToCrate = world.areHostile ? !world.areHostile(entity.ownerId, entity.team, {
			id: actor.actorId,
			kind: "player",
			team: actor.team,
			lifeId: actor.lifeId,
			alive: true,
			position: [
				0,
				0,
				0
			]
		}) : actor.team === entity.team;
		if (friendlyToCrate) {
			if (entity.reward.kind === "timed-map-weapon" && grantPortOpen) {
				const weaponGrant = Object.freeze({
					activationId: entity.activationId,
					crateId: entity.id,
					actorId: actor.actorId,
					lifeId: actor.lifeId,
					weaponId: entity.reward.weaponId,
					atMs: nowMs
				});
				this.entities.delete(entity.id);
				this.revision += 1;
				return Object.freeze({
					accepted: true,
					reason: "accepted",
					weaponGrant
				});
			}
			actor.careRewards.push(entity.reward.kind === "killstreak" ? entity.reward.id : downgradeCarePackageWeaponReward(this.catalog, entity.rollUnit));
			this.entities.delete(entity.id);
			this.revision += 1;
			return Object.freeze({
				accepted: true,
				reason: "accepted"
			});
		}
		entity.phase = "capturing";
		entity.captureActorId = actorId;
		entity.captureStartedAtMs = nowMs;
		entity.captureRequiredMs = friendlyToCrate ? 1250 : 2500;
		entity.revision += 1;
		this.revision += 1;
		return Object.freeze({
			accepted: true,
			reason: "accepted"
		});
	}
	interruptCareCapture(actorId, lifeId) {
		if (this.actors.get(actorId)?.lifeId !== lifeId) return false;
		let interrupted = false;
		for (const entity of this.entities.values()) {
			if (entity.kind !== "care-crate" || entity.captureActorId !== actorId) continue;
			entity.phase = "landed";
			entity.captureActorId = null;
			entity.captureStartedAtMs = null;
			entity.revision += 1;
			this.revision += 1;
			interrupted = true;
		}
		return interrupted;
	}
	recordActorDamage(actorId) {
		const actor = this.actors.get(actorId);
		return actor ? this.interruptCareCapture(actorId, actor.lifeId) : false;
	}
	damageEntity(entityId, damage) {
		const entity = this.entities.get(entityId);
		if (!entity || entity.kind === "aircraft" || entity.kind === "care-crate" || !Number.isFinite(damage) || damage <= 0) return Object.freeze({
			applied: false,
			destroyed: false,
			health: entity?.health ?? 0
		});
		entity.health = Math.max(0, entity.health - damage);
		entity.revision += 1;
		const destroyed = entity.health === 0;
		if (destroyed) this.expireEntity(entityId);
		this.revision += 1;
		return Object.freeze({
			applied: true,
			destroyed,
			health: entity.health
		});
	}
	advance(nowMs, world) {
		if (!Number.isFinite(nowMs)) return Object.freeze({
			damageEvents: Object.freeze([]),
			shotEvents: Object.freeze([]),
			impactEvents: Object.freeze([]),
			expiredEntityIds: Object.freeze([]),
			careWeaponGrantEvents: Object.freeze([])
		});
		if (this.lastAdvancedAtMs !== 0 && nowMs < this.lastAdvancedAtMs) return Object.freeze({
			damageEvents: Object.freeze([]),
			shotEvents: Object.freeze([]),
			impactEvents: Object.freeze([]),
			expiredEntityIds: Object.freeze([]),
			careWeaponGrantEvents: Object.freeze([])
		});
		const canonicalNowMs = Math.max(this.lastAdvancedAtMs, nowMs);
		const dt = clamp((canonicalNowMs - (this.lastAdvancedAtMs === 0 ? canonicalNowMs : this.lastAdvancedAtMs)) / 1e3, 0, .1);
		this.lastAdvancedAtMs = canonicalNowMs;
		const hadRuntimeState = this.entities.size > 0 || this.carpetBombers.size > 0 || this.timedActivations.size > 0;
		const damageEvents = [];
		const shotEvents = [];
		const impactEvents = [];
		const expiredEntityIds = [];
		const careWeaponGrantEvents = [];
		this.hostileTargetCache.clear();
		this.sortedHostileTargetCache.clear();
		for (const bomber of this.carpetBombers.values()) {
			const aircraft = this.entities.get(bomber.aircraftId);
			if (!aircraft || aircraft.kind !== "aircraft" || aircraft.variant !== "carpet" || canonicalNowMs > aircraft.expiresAtMs || aircraft.health <= 0) {
				if (!bomber.routeCompleted) bomber.routeCanceled = bomber.nextDropOrdinal < bomber.impacts.length;
				continue;
			}
			this.advanceAircraft(aircraft, canonicalNowMs, dt, world);
			bomber.routeCompleted = (admittedAircraftRouteProgress(aircraft) ?? 0) >= .999999;
		}
		for (const [activationId, activation] of this.timedActivations) if (canonicalNowMs >= activation.expiresAtMs) this.timedActivations.delete(activationId);
		for (const [activationId, bomber] of this.carpetBombers) {
			const aircraft = this.entities.get(bomber.aircraftId);
			const routeProgress = aircraft?.kind === "aircraft" && aircraft.variant === "carpet" ? admittedAircraftRouteProgress(aircraft) : bomber.routeCompleted ? 1 : null;
			while (!bomber.routeCanceled && routeProgress !== null && bomber.nextDropOrdinal < bomber.impacts.length && routeProgress + .002 >= bomber.dropRouteProgress[bomber.nextDropOrdinal] && canonicalNowMs >= bomber.impactAtMs[bomber.nextDropOrdinal] - 420 && impactEvents.length < 40) {
				const ordinal = bomber.nextDropOrdinal;
				const minimumImpactAtMs = canonicalNowMs + 420;
				const scheduleShiftMs = Math.max(0, minimumImpactAtMs - bomber.impactAtMs[ordinal]);
				if (scheduleShiftMs > 0) for (let pending = ordinal; pending < bomber.impactAtMs.length; pending += 1) bomber.impactAtMs[pending] += scheduleShiftMs;
				const impactAtMs = bomber.impactAtMs[ordinal];
				bomber.nextDropOrdinal += 1;
				impactEvents.push(Object.freeze({
					activationId,
					source: "carpet-bomber",
					ordinal,
					phase: "drop",
					position: bomber.impacts[ordinal],
					impactAtMs,
					atMs: impactAtMs - 420
				}));
			}
			while (bomber.nextImpactOrdinal < bomber.nextDropOrdinal && canonicalNowMs >= bomber.impactAtMs[bomber.nextImpactOrdinal] && impactEvents.length < 40) {
				const ordinal = bomber.nextImpactOrdinal;
				const position = bomber.impacts[ordinal];
				const impactAtMs = bomber.impactAtMs[ordinal];
				bomber.nextImpactOrdinal += 1;
				bomber.authorityReleaseAtMs = canonicalNowMs + CARPET_BOMBER_RESIDUAL_FIRE_DURATION_MS;
				impactEvents.push(Object.freeze({
					activationId,
					source: "carpet-bomber",
					ordinal,
					phase: "impact",
					position,
					impactAtMs,
					atMs: impactAtMs
				}));
				const owner = this.actors.get(bomber.ownerId);
				if (owner) this.damageAround(owner, activationId, "carpet-bomber", position, CARPET_BOMBER_BLAST_RADIUS_M, 240, canonicalNowMs, world, damageEvents, true);
			}
			if (bomber.routeCanceled && bomber.nextImpactOrdinal >= bomber.nextDropOrdinal) {
				if (bomber.authorityReleaseAtMs === null || canonicalNowMs >= bomber.authorityReleaseAtMs) this.carpetBombers.delete(activationId);
			} else if (bomber.nextImpactOrdinal >= bomber.impacts.length && bomber.authorityReleaseAtMs !== null && canonicalNowMs >= bomber.authorityReleaseAtMs) this.carpetBombers.delete(activationId);
		}
		for (const entity of this.entities.values()) {
			if (canonicalNowMs >= entity.expiresAtMs || entity.health <= 0) {
				expiredEntityIds.push(entity.id);
				this.expireEntity(entity.id);
				continue;
			}
			if (entity.kind === "aircraft") {
				if (entity.variant !== "carpet") this.advanceAircraft(entity, canonicalNowMs, dt, world);
			} else if (entity.kind === "care-crate") this.advanceCareCrate(entity, canonicalNowMs, dt, world, careWeaponGrantEvents);
			else if (entity.kind === "chopper") this.advanceChopper(entity, canonicalNowMs, dt, world, damageEvents, shotEvents, impactEvents);
			else this.advanceDrone(entity, canonicalNowMs, dt, world, damageEvents, shotEvents);
		}
		this.enforceSwarmSeparation(dt, world);
		if (hadRuntimeState) this.revision += 1;
		return Object.freeze({
			damageEvents: Object.freeze(damageEvents.slice(0, 64)),
			shotEvents: Object.freeze(shotEvents),
			impactEvents: Object.freeze(impactEvents),
			expiredEntityIds: Object.freeze(expiredEntityIds),
			careWeaponGrantEvents: Object.freeze(careWeaponGrantEvents)
		});
	}
	advanceAircraft(entity, nowMs, dt, world) {
		const routeDurationMs = entity.variant === "carpet" ? CARPET_BOMBER_ROUTE_TRAVERSE_MS : CARE_AIRCRAFT_DURATION_MS;
		const progress = clamp((nowMs - entity.createdAtMs) / routeDurationMs, 0, 1);
		entity.phase = progress < .12 ? "inbound" : progress > .82 ? "outbound" : "active";
		const eased = progress * progress * (3 - 2 * progress);
		const desired = [
			entity.routeStart[0] + (entity.routeEnd[0] - entity.routeStart[0]) * eased,
			entity.routeStart[1] + Math.sin(progress * Math.PI + unit(entity.seed, 33) * Math.PI) * .28,
			entity.routeStart[2] + (entity.routeEnd[2] - entity.routeStart[2]) * eased
		];
		const previous = [...entity.position];
		const next = entity.variant === "carpet" ? resolveFlightEnvelopePosition(previous, desired, {
			...CARPET_BOMBER_COLLISION_ENVELOPE,
			yaw: entity.attitude[1]
		}, world) : resolveFlightPosition(previous, desired, 1.25, world);
		const inverseDt = dt > 0 ? 1 / dt : 0;
		entity.velocity = [
			(next[0] - previous[0]) * inverseDt,
			(next[1] - previous[1]) * inverseDt,
			(next[2] - previous[2]) * inverseDt
		];
		entity.position = next;
		entity.attitude = attitudeFromMotion(previous, next, entity.attitude);
		entity.revision += 1;
	}
	advanceCareCrate(entity, nowMs, dt, world, careWeaponGrantEvents) {
		const previous = [...entity.position];
		if (nowMs < entity.descentStartsAtMs) {
			entity.phase = "inbound";
			const aircraft = this.entities.get(entity.aircraftId);
			if (aircraft?.kind === "aircraft") entity.position = [
				aircraft.position[0],
				aircraft.position[1] - .9,
				aircraft.position[2]
			];
		} else if (nowMs < entity.descentStartsAtMs + 5200) {
			entity.phase = "descending";
			const rawProgress = clamp((nowMs - entity.descentStartsAtMs) / CARE_CRATE_DESCENT_MS, 0, 1);
			const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
			entity.position = [
				entity.descentStartPosition[0] + (entity.dropPosition[0] - entity.descentStartPosition[0]) * progress,
				entity.descentStartPosition[1] + (entity.dropPosition[1] - entity.descentStartPosition[1]) * progress,
				entity.descentStartPosition[2] + (entity.dropPosition[2] - entity.descentStartPosition[2]) * progress
			];
		} else if (entity.phase !== "capturing") {
			entity.phase = "landed";
			entity.position = [...entity.dropPosition];
		}
		const inverseDt = dt > 0 ? 1 / dt : 0;
		entity.velocity = [
			(entity.position[0] - previous[0]) * inverseDt,
			(entity.position[1] - previous[1]) * inverseDt,
			(entity.position[2] - previous[2]) * inverseDt
		];
		entity.attitude = [
			0,
			entity.attitude[1],
			0
		];
		entity.revision += 1;
		if (entity.phase !== "capturing" || !entity.captureActorId || entity.captureStartedAtMs === null) return;
		const captureActor = this.actors.get(entity.captureActorId);
		const position = actorPosition(world, entity.captureActorId);
		if (!captureActor || !position || distance(position, entity.position) > 2.75 || !lineOfSight(world, position, entity.position)) {
			entity.phase = "landed";
			entity.captureActorId = null;
			entity.captureStartedAtMs = null;
			entity.revision += 1;
			this.revision += 1;
			return;
		}
		const requiredMs = entity.captureRequiredMs ?? (captureActor.team === entity.team ? 1250 : 2500);
		if (nowMs - entity.captureStartedAtMs < requiredMs) return;
		if (entity.reward.kind === "timed-map-weapon" && this.carePackageWeaponGrantPort?.isFlamethrowerGrantAdmissible() === true) {
			careWeaponGrantEvents.push(Object.freeze({
				activationId: entity.activationId,
				crateId: entity.id,
				actorId: captureActor.actorId,
				lifeId: captureActor.lifeId,
				weaponId: entity.reward.weaponId,
				atMs: nowMs
			}));
			this.entities.delete(entity.id);
			this.revision += 1;
			return;
		}
		if (captureActor.careRewards.length >= 8) {
			entity.phase = "landed";
			entity.captureActorId = null;
			entity.captureStartedAtMs = null;
			entity.revision += 1;
			this.revision += 1;
			return;
		}
		captureActor.careRewards.push(entity.reward.kind === "killstreak" ? entity.reward.id : downgradeCarePackageWeaponReward(this.catalog, entity.rollUnit));
		this.entities.delete(entity.id);
		this.revision += 1;
	}
	advanceChopper(entity, nowMs, dt, world, damageEvents, shotEvents, impactEvents) {
		const elapsed = clamp((nowMs - entity.createdAtMs) / CHOPPER_DURATION_MS, 0, 1);
		entity.phase = elapsed < .08 ? "inbound" : elapsed > .9 ? "outbound" : "orbiting";
		const firingPosition = [...entity.position];
		const firingAttitude = [...entity.attitude];
		const pose = chopperRoutePose(entity.seed, entity.createdAtMs, nowMs, entity.routeCentre, world.bounds);
		const previous = [...entity.position];
		const next = resolveFlightPosition(previous, pose.position, 1.25, world);
		const inverseDt = dt > 0 ? 1 / dt : 0;
		entity.velocity = [
			(next[0] - previous[0]) * inverseDt,
			(next[1] - previous[1]) * inverseDt,
			(next[2] - previous[2]) * inverseDt
		];
		entity.position = next;
		entity.attitude = attitudeFromMotion(previous, next, pose.attitude);
		entity.revision += 1;
		const owner = this.actors.get(entity.ownerId);
		if (!owner) return;
		if (entity.pendingMissiles.length > 0) {
			const pending = [];
			for (const missile of entity.pendingMissiles) {
				if (nowMs < missile.impactAtMs || impactEvents.length >= 40) {
					pending.push(missile);
					continue;
				}
				impactEvents.push(Object.freeze({
					activationId: entity.activationId,
					source: "chopper",
					ordinal: missile.ordinal,
					phase: "impact",
					position: missile.position,
					launchPosition: missile.launchPosition,
					impactAtMs: missile.impactAtMs,
					atMs: missile.impactAtMs
				}));
				this.damageAround(owner, entity.activationId, "chopper", missile.position, CHOPPER_MISSILE_BLAST_RADIUS_M, 240, nowMs, world, damageEvents);
			}
			entity.pendingMissiles = pending;
		}
		if (entity.pendingPlayerMissile !== null && entity.gunController !== "ai" && impactEvents.length < 40) {
			const request = entity.pendingPlayerMissile;
			entity.pendingPlayerMissile = null;
			entity.missilesRemaining -= 1;
			entity.nextMissileAtMs = nowMs + CHOPPER_MISSILE_CADENCE_MS;
			const ordinal = entity.nextMissileOrdinal;
			entity.nextMissileOrdinal += 1;
			const position = chopperMissileGroundTarget(firingPosition, firingAttitude, request.aimYaw, request.aimPitch, world);
			const impactAtMs = nowMs + 780;
			const socketSide = ordinal % 2 === 0 ? 1 : -1;
			const launchPosition = translatedSupportOffset(firingPosition, firingAttitude, [
				CHOPPER_MISSILE_SOCKET_LOCAL_M[0] * socketSide,
				CHOPPER_MISSILE_SOCKET_LOCAL_M[1],
				CHOPPER_MISSILE_SOCKET_LOCAL_M[2]
			]);
			entity.pendingMissiles.push(Object.freeze({
				ordinal,
				position,
				impactAtMs,
				launchPosition
			}));
			impactEvents.push(Object.freeze({
				activationId: entity.activationId,
				source: "chopper",
				ordinal,
				phase: "drop",
				position,
				launchPosition,
				impactAtMs,
				atMs: nowMs
			}));
			entity.revision += 1;
		}
		if (!(entity.gunController === "ai" ? nowMs >= entity.nextShotAtMs : entity.pendingPlayerFire && nowMs >= entity.nextShotAtMs) || damageEvents.length >= 64 || shotEvents.length >= 64) return;
		if (entity.gunController === "ai") {
			const target = this.nearestVisibleTarget(firingPosition, owner.actorId, owner.team, world);
			if (target) {
				shotEvents.push(this.supportShotEvent(entity, "chopper", owner, nowMs));
				const admittedDamage = supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, distance(firingPosition, target.position));
				if (admittedDamage > 0) damageEvents.push(this.damageEvent(entity.activationId, "chopper", owner.actorId, target, admittedDamage, firingPosition, nowMs));
			}
		} else {
			shotEvents.push(this.supportShotEvent(entity, "chopper", owner, nowMs));
			const ray = chopperGunnerAuthoritativeRay(firingPosition, firingAttitude, entity.aimYaw, entity.aimPitch);
			const hit = this.visibleTargetAlongRay(ray.origin, ray.direction, owner.actorId, owner.team, world, CHOPPER_GUN_PROFILE.maximumRangeM, true);
			if (hit) {
				const distanceDamage = supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, hit.distance);
				const admittedDamage = hit.wallbanged ? distanceDamage * .5 : distanceDamage;
				if (admittedDamage > 0) damageEvents.push(this.damageEvent(entity.activationId, "chopper", owner.actorId, hit.target, admittedDamage, ray.origin, nowMs, hit.endpoint, ray.tracerOrigin));
			} else {
				const burst = chopperMissileGroundTarget(firingPosition, firingAttitude, entity.aimYaw, entity.aimPitch, world);
				this.damageAround(owner, entity.activationId, "chopper", burst, CHOPPER_GUN_SPLASH_RADIUS_M, 16, nowMs, world, damageEvents);
			}
		}
		entity.nextShotAtMs = nowMs + CHOPPER_GUN_PROFILE.cadenceMs;
		if (entity.gunController === "ai") entity.pendingPlayerFire = false;
	}
	advanceDrone(entity, nowMs, dt, world, damageEvents, shotEvents) {
		const owner = this.actors.get(entity.ownerId);
		if (!owner) return;
		const gunProfile = droneGunProfileFor(entity.mode);
		if (entity.gunProfileId !== gunProfile.id) throw new Error(`unknown ${entity.mode} drone gun profile ${entity.gunProfileId}`);
		const playerControlled = entity.mode === "piloted" && owner.possession?.kind === "piloted-drone" && owner.possession.entityId === entity.id;
		if (playerControlled) this.updatePilotedDroneSensor(entity, owner, nowMs, world);
		if (entity.phase === "reloading") {
			if (entity.reloadCompletesAtMs !== null && nowMs >= entity.reloadCompletesAtMs) {
				if (entity.reserveClips === null || entity.reserveClips > 0) {
					if (entity.reserveClips !== null) entity.reserveClips -= 1;
					entity.magazine = gunProfile.magazineSize;
				}
				entity.reloadCompletesAtMs = null;
				entity.phase = "active";
				entity.revision += 1;
			}
			return;
		}
		if (playerControlled) {
			const velocity = pilotedDroneWorldVelocity({
				yaw: entity.yaw,
				pitch: entity.pitch,
				axes: {
					thrust: entity.thrust,
					strafe: entity.strafe,
					vertical: entity.vertical
				},
				maximumSpeedMps: DRONE_DEPLOYMENT_POLICY.manualHorizontalSpeedMps
			});
			const desired = [
				clamp(entity.position[0] + velocity[0] * dt, world.bounds.minX + .35, world.bounds.maxX - .35),
				clamp(entity.position[1] + velocity[1] * dt, world.bounds.floorY + .5, world.bounds.ceilingY - .5),
				clamp(entity.position[2] + velocity[2] * dt, world.bounds.minZ + .35, world.bounds.maxZ - .35)
			];
			const previous = [...entity.position];
			const next = resolveFlightPosition(previous, desired, .35, world);
			entity.velocity = [
				(next[0] - previous[0]) / Math.max(dt, .001),
				(next[1] - previous[1]) / Math.max(dt, .001),
				(next[2] - previous[2]) / Math.max(dt, .001)
			];
			entity.position = next;
			entity.attitude = [
				entity.pitch,
				entity.yaw,
				0
			];
			if (entity.pendingPlayerFire && nowMs >= entity.nextShotAtMs) {
				if (entity.magazine > 0 && shotEvents.length < 64) {
					shotEvents.push(this.supportShotEvent(entity, "piloted-drone", owner, nowMs));
					const target = this.aimedVisibleTarget(entity.position, entity.yaw, entity.pitch, owner.actorId, owner.team, world, gunProfile.maximumRangeM);
					if (target) {
						const admittedDamage = supportGunDamageAtDistance(gunProfile, distance(entity.position, target.position));
						if (admittedDamage > 0) damageEvents.push(this.damageEvent(entity.activationId, "piloted-drone", owner.actorId, target, admittedDamage, entity.position, nowMs));
					}
					entity.magazine -= 1;
				}
				entity.nextShotAtMs = nowMs + gunProfile.cadenceMs;
			}
		} else if (entity.mode === "swarm" && entity.swarmIngressTarget !== null && nowMs - entity.createdAtMs < 2e3 && entity.swarmIngressTarget) this.moveDroneToward(entity, entity.swarmIngressTarget, DRONE_DEPLOYMENT_POLICY.swarmIngressSpeedMps, .25, dt, world);
		else {
			entity.swarmIngressTarget = null;
			let target = this.hostileTargets(world, owner.actorId, owner.team).find((candidate) => candidate.id === entity.targetId) ?? null;
			if (!target) {
				const candidates = this.sortedHostileTargets(world, owner.actorId, owner.team);
				let pick = candidates.length > 0 ? candidates[entity.seed % candidates.length] : null;
				if (entity.mode === "swarm" && entity.swarmOrdinal !== null && candidates.length > 0) {
					const groupOrdinal = entity.swarmOrdinal % 4;
					const cx = (world.bounds.minX + world.bounds.maxX) / 2;
					const cz = (world.bounds.minZ + world.bounds.maxZ) / 2;
					let matchingQuadrantCount = 0;
					for (const candidate of candidates) {
						const dx = candidate.position[0] - cx;
						const dz = candidate.position[2] - cz;
						if (((dx >= 0 ? 1 : 0) | (dz >= 0 ? 2 : 0)) === groupOrdinal) matchingQuadrantCount += 1;
					}
					if (matchingQuadrantCount > 0) {
						let matchingOrdinal = entity.seed % matchingQuadrantCount;
						for (const candidate of candidates) {
							const dx = candidate.position[0] - cx;
							const dz = candidate.position[2] - cz;
							if (((dx >= 0 ? 1 : 0) | (dz >= 0 ? 2 : 0)) !== groupOrdinal) continue;
							if (matchingOrdinal === 0) {
								pick = candidate;
								break;
							}
							matchingOrdinal -= 1;
						}
					}
				}
				target = pick;
				entity.targetId = target?.id ?? null;
			}
			if (target) {
				const dx = target.position[0] - entity.position[0];
				const dy = target.position[1] + 1.5 - entity.position[1];
				const dz = target.position[2] - entity.position[2];
				const range = Math.max(.001, Math.hypot(dx, dy, dz));
				if (entity.mode === "swarm" && entity.swarmOrdinal !== null) {
					const engagementPoint = droneSwarmEngagementPoint(target.position, {
						activationId: entity.activationId,
						targetId: target.id,
						ordinal: entity.swarmOrdinal
					});
					const minimumY = droneSwarmStepMinimumAltitudeY(entity.swarmAdmittedSpawnY ?? entity.position[1], entity.position, engagementPoint, world);
					this.moveDroneToward(entity, [
						engagementPoint[0],
						Math.max(engagementPoint[1], minimumY),
						engagementPoint[2]
					], 8, 1, dt, world);
				} else if (range > 7) this.moveDroneToward(entity, [
					target.position[0],
					target.position[1] + 1.5,
					target.position[2]
				], DRONE_DEPLOYMENT_POLICY.autonomousStandaloneSpeedMps, 7, dt, world);
				const canFireOwnGun = range <= gunProfile.maximumRangeM && lineOfSight(world, entity.position, target.position) && nowMs >= entity.nextShotAtMs && entity.magazine > 0 && shotEvents.length < 64;
				const fireLaneAdmitted = entity.mode !== "swarm" || this.claimSwarmFireLane(entity, nowMs, canFireOwnGun);
				if (canFireOwnGun && fireLaneAdmitted) {
					const source = entity.mode === "piloted" ? "piloted-drone" : "drone-swarm";
					shotEvents.push(this.supportShotEvent(entity, source, owner, nowMs));
					const admittedDamage = supportGunDamageAtDistance(gunProfile, range);
					if (admittedDamage > 0) damageEvents.push(this.damageEvent(entity.activationId, source, owner.actorId, target, admittedDamage, entity.position, nowMs));
					entity.magazine -= 1;
					entity.nextShotAtMs = nowMs + gunProfile.cadenceMs;
				}
			} else {
				const reachedWaypoint = entity.swarmPatrolTarget ? distance(entity.position, entity.swarmPatrolTarget) <= 2 : true;
				if (entity.mode === "swarm" && entity.swarmOrdinal !== null && (reachedWaypoint || nowMs >= entity.swarmPatrolRefreshAtMs)) {
					const epoch = Math.max(0, Math.floor((nowMs - entity.createdAtMs - 2e3) / 6e3));
					const group = entity.swarmOrdinal % 6;
					const column = group % 3;
					const row = Math.floor(group / 3);
					const xAlpha = .16 + column * .34 + (unit(entity.seed, 100 + epoch * 2) - .5) * .12;
					const zAlpha = .24 + row * .52 + (unit(entity.seed, 101 + epoch * 2) - .5) * .16;
					const patrolX = clamp(world.bounds.minX + (world.bounds.maxX - world.bounds.minX) * xAlpha, world.bounds.minX + .5, world.bounds.maxX - .5);
					const patrolZ = clamp(world.bounds.minZ + (world.bounds.maxZ - world.bounds.minZ) * zAlpha, world.bounds.minZ + .5, world.bounds.maxZ - .5);
					const desiredPatrol = [
						patrolX,
						entity.position[1],
						patrolZ
					];
					entity.swarmPatrolTarget = [
						patrolX,
						droneSwarmStepMinimumAltitudeY(entity.swarmAdmittedSpawnY ?? entity.position[1], entity.position, desiredPatrol, world),
						patrolZ
					];
					entity.swarmPatrolRefreshAtMs = nowMs + 6e3;
				} else if (entity.mode === "piloted" && (reachedWaypoint || nowMs >= entity.swarmPatrolRefreshAtMs)) {
					const epoch = Math.max(0, Math.floor((nowMs - entity.createdAtMs) / 6e3));
					const angle = unit(entity.seed, 200 + epoch) * Math.PI * 2;
					const radius = Math.min(world.bounds.maxX - world.bounds.minX, world.bounds.maxZ - world.bounds.minZ) * .28;
					entity.swarmPatrolTarget = [
						clamp((world.bounds.minX + world.bounds.maxX) / 2 + Math.cos(angle) * radius, world.bounds.minX + .5, world.bounds.maxX - .5),
						clamp(world.bounds.floorY + (world.bounds.ceilingY - world.bounds.floorY) * .45, world.bounds.floorY + 1, world.bounds.ceilingY - .5),
						clamp((world.bounds.minZ + world.bounds.maxZ) / 2 + Math.sin(angle) * radius, world.bounds.minZ + .5, world.bounds.maxZ - .5)
					];
					entity.swarmPatrolRefreshAtMs = nowMs + 6e3;
				}
				if (entity.swarmPatrolTarget) this.moveDroneToward(entity, entity.swarmPatrolTarget, entity.mode === "piloted" ? DRONE_DEPLOYMENT_POLICY.autonomousStandaloneSpeedMps : DRONE_DEPLOYMENT_POLICY.swarmPatrolSpeedMps, 1.5, dt, world);
			}
		}
		if (entity.magazine === 0 && entity.reloadCompletesAtMs === null) if (entity.reserveClips === null || entity.reserveClips > 0) {
			entity.phase = "reloading";
			entity.reloadCompletesAtMs = nowMs + gunProfile.reloadMs;
		} else {
			const actor = this.actors.get(entity.ownerId);
			if (actor?.possession?.entityId === entity.id) this.restoreActorControl(actor, false);
		}
		entity.revision += 1;
	}
	moveDroneToward(entity, target, speed, stopDistance, dt, world) {
		const dx = target[0] - entity.position[0];
		const dy = target[1] - entity.position[1];
		const dz = target[2] - entity.position[2];
		const range = Math.max(.001, Math.hypot(dx, dy, dz));
		if (range <= stopDistance) {
			entity.velocity = [
				0,
				0,
				0
			];
			return;
		}
		const desired = [
			clamp(entity.position[0] + dx / range * speed * dt, world.bounds.minX + .35, world.bounds.maxX - .35),
			clamp(entity.position[1] + dy / range * speed * dt, world.bounds.floorY + 1, world.bounds.ceilingY - .5),
			clamp(entity.position[2] + dz / range * speed * dt, world.bounds.minZ + .35, world.bounds.maxZ - .35)
		];
		const previous = [...entity.position];
		const next = resolveFlightPosition(previous, desired, .35, world);
		entity.velocity = [
			(next[0] - previous[0]) / Math.max(dt, .001),
			(next[1] - previous[1]) / Math.max(dt, .001),
			(next[2] - previous[2]) / Math.max(dt, .001)
		];
		entity.position = [...next];
		entity.attitude = attitudeFromMotion(previous, next, entity.attitude);
	}
	enforceSwarmSeparation(dt, world) {
		if (dt <= 0) return;
		const swarms = /* @__PURE__ */ new Map();
		for (const entity of this.entities.values()) {
			if (entity.kind !== "drone" || entity.mode !== "swarm" || entity.swarmOrdinal === null) continue;
			const group = swarms.get(entity.activationId) ?? [];
			group.push(entity);
			swarms.set(entity.activationId, group);
		}
		const minimum = DRONE_SWARM_ENGAGEMENT_FORMATION.minimumDesignedSeparationM;
		for (const members of swarms.values()) {
			members.sort((left, right) => left.swarmOrdinal - right.swarmOrdinal || left.id.localeCompare(right.id));
			for (let pass = 0; pass < 6; pass += 1) {
				let adjusted = false;
				for (let leftIndex = 0; leftIndex < members.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
					const left = members[leftIndex];
					const right = members[rightIndex];
					let dx = right.position[0] - left.position[0];
					let dy = right.position[1] - left.position[1];
					let dz = right.position[2] - left.position[2];
					let range = Math.hypot(dx, dy, dz);
					if (range >= minimum) continue;
					adjusted = true;
					if (range < 1e-4) {
						const phase = (left.swarmOrdinal * 17 + right.swarmOrdinal * 31) % 24 / 24 * Math.PI * 2;
						dx = Math.cos(phase);
						dy = 0;
						dz = Math.sin(phase);
						range = 1;
					}
					const correction = (minimum - Math.min(range, minimum)) * .5;
					const nx = dx / range;
					const ny = dy / range;
					const nz = dz / range;
					const leftBefore = [...left.position];
					const rightBefore = [...right.position];
					const leftNext = resolveFlightPosition(leftBefore, [
						left.position[0] - nx * correction,
						left.position[1] - ny * correction,
						left.position[2] - nz * correction
					], .35, world);
					const rightNext = resolveFlightPosition(rightBefore, [
						right.position[0] + nx * correction,
						right.position[1] + ny * correction,
						right.position[2] + nz * correction
					], .35, world);
					const inverseDt = 1 / Math.max(dt, .001);
					left.velocity = [
						left.velocity[0] + (leftNext[0] - leftBefore[0]) * inverseDt,
						left.velocity[1] + (leftNext[1] - leftBefore[1]) * inverseDt,
						left.velocity[2] + (leftNext[2] - leftBefore[2]) * inverseDt
					];
					right.velocity = [
						right.velocity[0] + (rightNext[0] - rightBefore[0]) * inverseDt,
						right.velocity[1] + (rightNext[1] - rightBefore[1]) * inverseDt,
						right.velocity[2] + (rightNext[2] - rightBefore[2]) * inverseDt
					];
					left.position = leftNext;
					right.position = rightNext;
				}
				if (!adjusted) break;
			}
		}
	}
	claimSwarmFireLane(entity, nowMs, canHit) {
		if (entity.mode !== "swarm" || entity.swarmOrdinal === null) return true;
		const lane = this.swarmFireLanes.get(entity.activationId);
		if (!lane || nowMs < lane.nextAtMs || entity.swarmOrdinal !== lane.cursor) return false;
		lane.cursor = (lane.cursor + 1) % 24;
		lane.nextAtMs = nowMs + (canHit ? 460 : 80);
		return canHit;
	}
	updatePilotedDroneSensor(entity, owner, nowMs, world) {
		if (entity.mode !== "piloted" || nowMs < entity.nextSensorRefreshAtMs) return;
		if (owner.possession?.kind !== "piloted-drone" || owner.possession.entityId !== entity.id) {
			entity.sensorContacts.length = 0;
			entity.nextSensorRefreshAtMs = nowMs + PILOTED_DRONE_SENSOR_PROFILE.refreshMs;
			return;
		}
		const direction = supportForwardFromYawPitch(entity.yaw, entity.pitch);
		const minimumDot = Math.cos(PILOTED_DRONE_SENSOR_PROFILE.forwardConeDegrees / 2 * Math.PI / 180);
		const contacts = [];
		let previousTargetId = null;
		for (const target of this.sortedHostileTargets(world, owner.actorId, owner.team)) {
			if (target.id === previousTargetId) continue;
			const dx = target.position[0] - entity.position[0];
			const dy = target.position[1] - entity.position[1];
			const dz = target.position[2] - entity.position[2];
			const range = Math.hypot(dx, dy, dz);
			if (range <= .001 || range > PILOTED_DRONE_SENSOR_PROFILE.maximumRangeM) continue;
			if ((dx * direction[0] + dy * direction[1] + dz * direction[2]) / range < minimumDot) continue;
			previousTargetId = target.id;
			contacts.push(Object.freeze({
				id: target.id,
				kind: target.kind,
				team: target.team,
				lifeId: target.lifeId,
				position: Object.freeze([...target.position]),
				relation: "hostile",
				throughWall: true
			}));
			if (contacts.length === 16) break;
		}
		entity.sensorContacts = contacts;
		entity.nextSensorRefreshAtMs = nowMs + PILOTED_DRONE_SENSOR_PROFILE.refreshMs;
	}
	nearestVisibleTarget(origin, ownerId, team, world) {
		let nearest = null;
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (const target of this.hostileTargets(world, ownerId, team)) {
			if (!lineOfSight(world, origin, target.position)) continue;
			const candidateDistance = distance(origin, target.position);
			if (candidateDistance < nearestDistance || candidateDistance === nearestDistance && (nearest === null || target.id.localeCompare(nearest.id) < 0)) {
				nearest = target;
				nearestDistance = candidateDistance;
			}
		}
		return nearest;
	}
	aimedVisibleTarget(origin, yaw, pitch, ownerId, team, world, maximumRange = Number.POSITIVE_INFINITY) {
		const direction = supportForwardFromYawPitch(yaw, pitch);
		const minimumDot = Math.cos(8 * Math.PI / 180);
		let nearest = null;
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (const target of this.hostileTargets(world, ownerId, team)) {
			if (!lineOfSight(world, origin, target.position)) continue;
			const dx = target.position[0] - origin[0];
			const dy = target.position[1] - origin[1];
			const dz = target.position[2] - origin[2];
			const length = Math.max(.001, Math.hypot(dx, dy, dz));
			if (length > maximumRange) continue;
			if ((dx * direction[0] + dy * direction[1] + dz * direction[2]) / length < minimumDot || length >= nearestDistance) continue;
			nearest = target;
			nearestDistance = length;
		}
		return nearest;
	}
	visibleTargetAlongRay(origin, direction, ownerId, team, world, maximumRange, wallbang = false) {
		const radiusSquared = CHOPPER_GUNNER_RAY_POLICY.targetRadiusM ** 2;
		const hits = [];
		for (const target of hostileTargets(world, ownerId, team)) {
			const dx = target.position[0] - origin[0];
			const dy = target.position[1] - origin[1];
			const dz = target.position[2] - origin[2];
			const centreDistance = dx * direction[0] + dy * direction[1] + dz * direction[2];
			if (centreDistance <= 0 || centreDistance - CHOPPER_GUNNER_RAY_POLICY.targetRadiusM > maximumRange) continue;
			const perpendicularSquared = Math.max(0, dx * dx + dy * dy + dz * dz - centreDistance * centreDistance);
			if (perpendicularSquared > radiusSquared) continue;
			const entryDistance = Math.max(0, centreDistance - Math.sqrt(radiusSquared - perpendicularSquared));
			if (entryDistance > maximumRange) continue;
			const endpoint = Object.freeze([
				origin[0] + direction[0] * entryDistance,
				origin[1] + direction[1] * entryDistance,
				origin[2] + direction[2] * entryDistance
			]);
			const clear = lineOfSight(world, origin, endpoint);
			if (!clear && !wallbang) continue;
			hits.push(Object.freeze({
				target,
				endpoint,
				distance: entryDistance,
				wallbanged: !clear
			}));
		}
		return hits.sort((left, right) => left.distance - right.distance || left.target.id.localeCompare(right.target.id))[0] ?? null;
	}
	damageAround(owner, activationId, source, origin, radius, maximum, nowMs, world, output, friendlyFire = false) {
		const candidates = friendlyFire ? world.targets.filter((target) => target.alive && (target.kind === "player" || target.kind === "bot")) : this.hostileTargets(world, owner.actorId, owner.team);
		const visibilityOrigin = source === "carpet-bomber" || source === "chopper" ? [
			origin[0],
			Math.min(world.bounds.ceilingY, origin[1] + .08),
			origin[2]
		] : origin;
		for (const target of candidates) {
			const range = distance(origin, target.position);
			if (range > radius || !lineOfSight(world, visibilityOrigin, target.position) || output.length >= 64) continue;
			const damage = Math.max(1, Math.round(maximum * (1 - range / radius * .75)));
			output.push(this.damageEvent(activationId, source, owner.actorId, target, damage, origin, nowMs));
		}
	}
	hostileTargets(world, ownerId, team) {
		const key = `${ownerId}\u0000${team}`;
		const cached = this.hostileTargetCache.get(key);
		if (cached) return cached;
		const targets = [];
		for (const target of world.targets) {
			if (!target.alive || target.id === ownerId || target.kind !== "player" && target.kind !== "bot") continue;
			if (!(world.areHostile?.(ownerId, team, target) ?? target.team !== team)) continue;
			targets.push(target);
		}
		this.hostileTargetCache.set(key, targets);
		return targets;
	}
	sortedHostileTargets(world, ownerId, team) {
		const key = `${ownerId}\u0000${team}`;
		const cached = this.sortedHostileTargetCache.get(key);
		if (cached) return cached;
		const targets = [...this.hostileTargets(world, ownerId, team)].sort((left, right) => left.id.localeCompare(right.id));
		this.sortedHostileTargetCache.set(key, targets);
		return targets;
	}
	damageEvent(activationId, source, ownerId, target, damage, origin, nowMs, endpoint = target.position, tracerOrigin = origin) {
		this.resultCounter += 1;
		return Object.freeze({
			resultId: `ks-result-${this.matchEpoch}-${this.resultCounter}`,
			activationId,
			source,
			ownerId,
			targetId: target.id,
			targetLifeId: target.lifeId,
			targetPosition: Object.freeze([...target.position]),
			damage,
			origin: Object.freeze([...origin]),
			endpoint: Object.freeze([...endpoint]),
			tracerOrigin: Object.freeze([...tracerOrigin]),
			atMs: nowMs
		});
	}
	supportShotEvent(entity, source, owner, nowMs) {
		const ordinal = entity.nextShotOrdinal;
		entity.nextShotOrdinal += 1;
		return Object.freeze({
			activationId: entity.activationId,
			entityId: entity.id,
			source,
			ownerId: owner.actorId,
			ownerTeam: owner.team,
			ordinal,
			atMs: nowMs
		});
	}
	expireEntity(entityId) {
		const entity = this.entities.get(entityId);
		if (!entity) return;
		this.entities.delete(entityId);
		if (entity.kind === "drone" && entity.mode === "swarm" && ![...this.entities.values()].some((candidate) => candidate.kind === "drone" && candidate.mode === "swarm" && candidate.activationId === entity.activationId)) this.swarmFireLanes.delete(entity.activationId);
		const actor = this.actors.get(entity.ownerId);
		if (actor?.possession?.entityId === entityId) this.restoreActorControl(actor, false);
		if (entity.kind === "chopper" && entity.gunController !== "ai") {
			entity.gunController = "ai";
			entity.pendingPlayerFire = false;
			entity.pendingPlayerMissile = null;
		}
		this.revision += 1;
	}
	modifiersForActor(actorId, nowMs) {
		return adrenalineModifiers(this.actors.get(actorId)?.adrenalineUntilMs ?? 0, nowMs);
	}
	snapshotFor(recipientActorId, nowMs) {
		const actors = [...this.actors.values()].sort((left, right) => left.actorId.localeCompare(right.actorId)).map((actor) => Object.freeze({
			actorId: actor.actorId,
			team: actor.team,
			lifeId: actor.lifeId,
			streak: actor.streak,
			cycleProgress: actor.cycleProgress,
			loadout: parseKillstreakLoadout(actor.loadout),
			available: Object.freeze(actor.loadout.slots.filter((id) => (actor.availableCharges.get(id) ?? 0) > 0)),
			availableCharges: Object.freeze(actor.loadout.slots.flatMap((id) => {
				const count = actor.availableCharges.get(id) ?? 0;
				return count > 0 ? [Object.freeze({
					id,
					count
				})] : [];
			})),
			adrenalineRemainingMs: Math.max(0, actor.adrenalineUntilMs - nowMs),
			possession: actor.possession,
			revealedCareRewards: Object.freeze(actor.actorId === recipientActorId ? [...actor.trainingReward ? [actor.trainingReward] : [], ...actor.careRewards] : [])
		}));
		const entities = [...this.entities.values()].sort((left, right) => left.id.localeCompare(right.id)).map((entity) => {
			const captureProgress = entity.kind === "care-crate" && entity.captureStartedAtMs !== null && entity.captureActorId ? clamp((nowMs - entity.captureStartedAtMs) / (entity.captureRequiredMs ?? (this.actors.get(entity.captureActorId)?.team === entity.team ? 1250 : 2500)), 0, 1) : null;
			return Object.freeze({
				id: entity.id,
				activationId: entity.activationId,
				ownerId: entity.ownerId,
				team: entity.team,
				kind: entity.kind,
				mode: entity.kind === "drone" ? entity.mode : null,
				phase: entity.phase,
				position: Object.freeze([...entity.position]),
				velocity: Object.freeze([...entity.velocity]),
				attitude: Object.freeze([...entity.attitude]),
				health: entity.health,
				expiresInMs: Math.max(0, entity.expiresAtMs - nowMs),
				magazine: entity.kind === "drone" ? entity.magazine : null,
				reserveClips: entity.kind === "drone" ? entity.reserveClips : null,
				gunProfileId: entity.kind === "drone" ? entity.gunProfileId : null,
				gunController: entity.kind === "chopper" ? entity.gunController === "ai" ? "ai" : "owner-player" : null,
				missileAmmo: entity.kind === "chopper" ? entity.missilesRemaining : null,
				missileCooldownMs: entity.kind === "chopper" ? Math.min(CHOPPER_MISSILE_CADENCE_MS, Math.max(0, entity.nextMissileAtMs - nowMs)) : null,
				captureActorId: entity.kind === "care-crate" ? entity.captureActorId : null,
				captureProgress,
				revealedReward: null,
				revision: entity.revision
			});
		});
		const recipient = recipientActorId ? this.actors.get(recipientActorId) : null;
		const sensorEntity = recipient?.possession?.kind === "piloted-drone" ? this.entities.get(recipient.possession.entityId) : null;
		const sensorContacts = sensorEntity?.kind === "drone" && sensorEntity.mode === "piloted" ? sensorEntity.sensorContacts.map((contact) => Object.freeze({
			...contact,
			position: Object.freeze([...contact.position])
		})) : [];
		const placementMarkers = [];
		for (const entity of this.entities.values()) {
			if (entity.kind !== "care-crate" || entity.phase !== "inbound" && entity.phase !== "descending") continue;
			placementMarkers.push(Object.freeze({
				id: `${entity.activationId}:care-target`,
				activationId: entity.activationId,
				source: "care-package",
				shape: "ground-x",
				ownerId: entity.ownerId,
				team: entity.team,
				audience: "all-combatants",
				anchor: Object.freeze([
					entity.dropPosition[0],
					entity.dropPosition[1] - .45,
					entity.dropPosition[2]
				]),
				pathStart: null,
				pathEnd: null,
				halfWidthM: null,
				expiresInMs: Math.max(0, entity.createdAtMs + CARE_TARGET_MARKER_MAX_LIFETIME_MS - nowMs)
			}));
		}
		for (const activation of this.carpetBombers.values()) {
			const prestrikeRemainingMs = Math.max(0, activation.createdAtMs + CARPET_TARGET_MARKER_MAX_LIFETIME_MS - nowMs);
			if (prestrikeRemainingMs <= 0) continue;
			placementMarkers.push(Object.freeze({
				id: `${activation.activationId}:carpet-target`,
				activationId: activation.activationId,
				source: "carpet-bomber",
				shape: "ground-x",
				ownerId: activation.ownerId,
				team: activation.team,
				audience: "all-combatants",
				anchor: Object.freeze([...activation.anchor]),
				pathStart: null,
				pathEnd: null,
				expiresInMs: prestrikeRemainingMs,
				halfWidthM: null
			}));
			if (activation.ownerId === recipientActorId) placementMarkers.push(Object.freeze({
				id: `${activation.activationId}:carpet-corridor`,
				activationId: activation.activationId,
				source: "carpet-bomber",
				shape: "corridor",
				ownerId: activation.ownerId,
				team: activation.team,
				audience: "owner-only",
				anchor: Object.freeze([...activation.anchor]),
				pathStart: Object.freeze([...activation.pathStart]),
				pathEnd: Object.freeze([...activation.pathEnd]),
				halfWidthM: activation.halfWidthM,
				expiresInMs: prestrikeRemainingMs
			}));
		}
		return Object.freeze({
			schemaVersion: 3,
			matchEpoch: this.matchEpoch,
			revision: this.revision,
			actors: Object.freeze(actors),
			entities: Object.freeze(entities),
			sensorContacts: Object.freeze(sensorContacts),
			placementMarkers: Object.freeze(placementMarkers)
		});
	}
};
var CARPET_GROUND_FIRE_AUTHORITY_CAPACITY = 640;
var CARPET_GROUND_FIRE_STATE_MAX_CHUNKS = Math.ceil(CARPET_GROUND_FIRE_AUTHORITY_CAPACITY / 64);
var DEFAULT_PRESENTATION_RECEIPT_CAPACITY = CARPET_GROUND_FIRE_AUTHORITY_CAPACITY * 2;
function validSnapshot(snapshot) {
	return /^[A-Za-z0-9_-]{8,80}$/.test(snapshot.activationId) && Number.isSafeInteger(snapshot.impactOrdinal) && snapshot.impactOrdinal >= 0 && snapshot.impactOrdinal < 20 && snapshot.position.length === 3 && snapshot.position.every(Number.isFinite) && Number.isFinite(snapshot.expiresAtHostTimeMs) && snapshot.expiresAtHostTimeMs >= 0 && snapshot.expiresAtHostTimeMs <= Number.MAX_SAFE_INTEGER;
}
function carpetGroundFireStateChunks(snapshotId, fires) {
	if (!Number.isSafeInteger(snapshotId) || snapshotId < 0 || fires.length > CARPET_GROUND_FIRE_AUTHORITY_CAPACITY || !fires.every(validSnapshot) || new Set(fires.map((fire) => `${fire.activationId}:${fire.impactOrdinal}`)).size !== fires.length) return Object.freeze([]);
	const chunkCount = Math.max(1, Math.ceil(fires.length / 64));
	return Object.freeze(Array.from({ length: chunkCount }, (_, chunkIndex) => Object.freeze({
		snapshotId,
		chunkIndex,
		chunkCount,
		totalFires: fires.length,
		fires: Object.freeze(fires.slice(chunkIndex * 64, (chunkIndex + 1) * 64))
	})));
}
/**
* Recipient-local admission for retained Carpet Bomber fire presentation.
* Damage remains host-only; this ledger prevents either an impact replay or a
* rejoin-state replay from extending the host-authored expiry.
*/
var CarpetGroundFireGuestPresentationAdmission = class {
	seen = /* @__PURE__ */ new Set();
	capacity;
	constructor(capacity = DEFAULT_PRESENTATION_RECEIPT_CAPACITY) {
		this.capacity = Number.isSafeInteger(capacity) && capacity > 0 ? capacity : DEFAULT_PRESENTATION_RECEIPT_CAPACITY;
	}
	admit(matchEpoch, impact) {
		if (!Number.isSafeInteger(matchEpoch) || matchEpoch < 0 || impact.source !== "carpet-bomber" || impact.phase !== "impact") return false;
		return this.admitKey(`${matchEpoch}:${impact.activationId}:${impact.ordinal}`);
	}
	admitSnapshot(matchEpoch, snapshot, nowHostTimeMs) {
		if (!Number.isSafeInteger(matchEpoch) || matchEpoch < 0 || !validSnapshot(snapshot) || !Number.isFinite(nowHostTimeMs)) return null;
		const remainingMs = Math.min(CARPET_BOMBER_RESIDUAL_FIRE_DURATION_MS, snapshot.expiresAtHostTimeMs - nowHostTimeMs);
		if (remainingMs <= 0 || !this.admitKey(`${matchEpoch}:${snapshot.activationId}:${snapshot.impactOrdinal}`)) return null;
		return remainingMs;
	}
	clear() {
		this.seen.clear();
	}
	admitKey(key) {
		if (this.seen.has(key)) return false;
		this.seen.add(key);
		while (this.seen.size > this.capacity) {
			const oldest = this.seen.values().next().value;
			if (oldest === void 0) break;
			this.seen.delete(oldest);
		}
		return true;
	}
};
//#endregion
//#region src/killstreak-protocol.ts
function admitKillstreakCareCaptureResultMessage(message, context) {
	if (!context.expectedHostId || message.by !== context.expectedHostId) return Object.freeze({
		accepted: false,
		reason: "forged-host"
	});
	if (message.forPlayerId !== context.expectedRecipientId) return Object.freeze({
		accepted: false,
		reason: "forged-recipient"
	});
	if (message.matchEpoch !== context.expectedMatchEpoch) return Object.freeze({
		accepted: false,
		reason: "match-epoch-mismatch"
	});
	if (message.lifeId !== context.expectedLifeId) return Object.freeze({
		accepted: false,
		reason: "life-mismatch"
	});
	if (context.seenNonces.has(message.nonce)) return Object.freeze({
		accepted: false,
		reason: "duplicate-nonce"
	});
	return Object.freeze({
		accepted: true,
		reason: "accepted"
	});
}
/**
* Transport admission for the recipient-specific authority snapshot. The
* runtime validates all reward mutations; this guard prevents a peer, replay,
* or older host snapshot from replacing that canonical projection locally.
*/
function admitKillstreakStateMessage(message, context) {
	if (!context.expectedHostId || message.by !== context.expectedHostId) return Object.freeze({
		accepted: false,
		reason: "forged-host"
	});
	if (message.forPlayerId !== context.expectedRecipientId) return Object.freeze({
		accepted: false,
		reason: "forged-recipient"
	});
	if (message.snapshot.matchEpoch !== context.expectedMatchEpoch) return Object.freeze({
		accepted: false,
		reason: "match-epoch-mismatch"
	});
	if (context.seenNonces.has(message.nonce)) return Object.freeze({
		accepted: false,
		reason: "duplicate-nonce"
	});
	if (message.snapshot.revision < context.currentRevision) return Object.freeze({
		accepted: false,
		reason: "stale-revision"
	});
	return Object.freeze({
		accepted: true,
		reason: "accepted"
	});
}
var ids = new Set(PASS65_KILLSTREAK_CATALOG.definitions.map((definition) => definition.id));
var careCaptureResultReasons = /* @__PURE__ */ new Set([
	"accepted",
	"identity-mismatch",
	"invalid-time",
	"reward-capacity",
	"crate-unavailable",
	"actor-already-capturing",
	"capture-admission-failed",
	"released",
	"not-capturing"
]);
function object(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys$10(value, required, optional = []) {
	const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
	return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
function actorId(value) {
	return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}
function hostEntityId(value) {
	return typeof value === "string" && /^ks-[0-9]+-[a-z-]+-[0-9]+$/.test(value) && value.length <= 80;
}
function safeCounter(value, maximum = 1e9) {
	return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
}
function finite(value, minimum, maximum) {
	return Number.isFinite(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function vec3(value) {
	return Array.isArray(value) && value.length === 3 && value.every((entry) => finite(entry, -1e4, 1e4));
}
function attitude(value) {
	return Array.isArray(value) && value.length === 3 && value.every((entry) => finite(entry, -Math.PI, Math.PI));
}
function timing(value) {
	if (value === void 0) return true;
	return object(value) && exactKeys$10(value, ["eventSeq", "sentAtHostTimeMs"]) && safeCounter(value.eventSeq) && finite(value.sentAtHostTimeMs, 0, Number.MAX_SAFE_INTEGER);
}
function baseIntent(value) {
	return actorId(value.by) && safeCounter(value.matchEpoch) && safeCounter(value.lifeId) && safeCounter(value.sequence) && finite(value.nonce, 0, Number.MAX_SAFE_INTEGER);
}
function activationId(value) {
	return typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value);
}
function isActorSnapshot(value) {
	if (!object(value) || !exactKeys$10(value, [
		"actorId",
		"team",
		"lifeId",
		"streak",
		"cycleProgress",
		"loadout",
		"available",
		"availableCharges",
		"adrenalineRemainingMs",
		"possession",
		"revealedCareRewards"
	]) || !actorId(value.actorId) || value.team !== 0 && value.team !== 1 || !safeCounter(value.lifeId) || !safeCounter(value.streak, 1e5) || !safeCounter(value.cycleProgress, 99) || !validateKillstreakLoadout(value.loadout).valid || !Array.isArray(value.available) || value.available.length > 5 || !value.available.every((id) => ids.has(String(id))) || !Array.isArray(value.availableCharges) || value.availableCharges.length > 5 || !finite(value.adrenalineRemainingMs, 0, 15e3) || !Array.isArray(value.revealedCareRewards) || value.revealedCareRewards.length > 8 || !value.revealedCareRewards.every((id) => ids.has(String(id)))) return false;
	const loadout = value.loadout;
	const charges = value.availableCharges;
	if (!charges.every((charge) => object(charge) && exactKeys$10(charge, ["id", "count"]) && loadout.slots.includes(String(charge.id)) && safeCounter(charge.count, 255) && Number(charge.count) > 0)) return false;
	const chargedIds = charges.map((charge) => charge.id);
	const expectedChargedIds = loadout.slots.filter((id) => chargedIds.includes(id));
	if (new Set(chargedIds).size !== chargedIds.length || value.available.length !== chargedIds.length || !value.available.every((id, index) => id === chargedIds[index]) || !chargedIds.every((id, index) => id === expectedChargedIds[index])) return false;
	const finalThreshold = Math.max(...loadout.slots.map((id) => PASS65_KILLSTREAK_CATALOG.definitions.find((definition) => definition.id === id)?.cost ?? 0));
	if (Number(value.cycleProgress) >= finalThreshold) return false;
	if (value.possession === null) return true;
	return object(value.possession) && exactKeys$10(value.possession, ["kind", "entityId"]) && (value.possession.kind === "chopper-gunner" || value.possession.kind === "piloted-drone") && hostEntityId(value.possession.entityId);
}
function isEntitySnapshot(value) {
	if (!object(value) || !exactKeys$10(value, [
		"id",
		"activationId",
		"ownerId",
		"team",
		"kind",
		"mode",
		"phase",
		"position",
		"velocity",
		"attitude",
		"health",
		"expiresInMs",
		"magazine",
		"reserveClips",
		"gunProfileId",
		"gunController",
		"missileAmmo",
		"missileCooldownMs",
		"captureActorId",
		"captureProgress",
		"revealedReward",
		"revision"
	]) || !hostEntityId(value.id) || !activationId(value.activationId) || !actorId(value.ownerId) || value.team !== 0 && value.team !== 1 || value.kind !== "aircraft" && value.kind !== "chopper" && value.kind !== "drone" && value.kind !== "care-crate" || !vec3(value.position) || !vec3(value.velocity) || !attitude(value.attitude) || !finite(value.health, 0, 800) || !finite(value.expiresInMs, 0, 6e4) || typeof value.phase !== "string" || value.phase.length === 0 || value.phase.length > 24 || !safeCounter(value.revision)) return false;
	if (value.kind === "drone") {
		if (value.mode !== "piloted" && value.mode !== "swarm") return false;
		if (!safeCounter(value.magazine, 20) || (value.mode === "piloted" ? !safeCounter(value.reserveClips, 3) : value.reserveClips !== null) || value.gunProfileId !== DRONE_SUPPORT_DEFINITIONS[value.mode].gunProfileId) return false;
	} else if (value.mode !== null || value.magazine !== null || value.reserveClips !== null || value.gunProfileId !== null) return false;
	if (!(value.kind === "aircraft" ? value.phase === "inbound" || value.phase === "active" || value.phase === "outbound" : value.kind === "chopper" ? value.phase === "inbound" || value.phase === "orbiting" || value.phase === "outbound" : value.kind === "drone" ? value.phase === "active" || value.phase === "reloading" : value.phase === "inbound" || value.phase === "descending" || value.phase === "landed" || value.phase === "capturing")) return false;
	if (value.kind === "chopper") {
		if (value.gunController !== "ai" && value.gunController !== "owner-player" || !safeCounter(value.missileAmmo, 6) || !finite(value.missileCooldownMs, 0, 1e3)) return false;
	} else if (value.gunController !== null || value.missileAmmo !== null || value.missileCooldownMs !== null) return false;
	if (value.kind === "care-crate") {
		if (value.phase === "capturing" ? !actorId(value.captureActorId) || !finite(value.captureProgress, 0, 1) : value.captureActorId !== null || value.captureProgress !== null) return false;
	} else if (value.captureActorId !== null || value.captureProgress !== null) return false;
	return value.revealedReward === null || ids.has(String(value.revealedReward));
}
function isSensorContact(value) {
	return object(value) && exactKeys$10(value, [
		"id",
		"kind",
		"team",
		"lifeId",
		"position",
		"relation",
		"throughWall"
	]) && actorId(value.id) && (value.kind === "player" || value.kind === "bot") && (value.team === 0 || value.team === 1) && safeCounter(value.lifeId) && vec3(value.position) && value.relation === "hostile" && value.throughWall === true;
}
function isPlacementMarker(value) {
	if (!object(value) || !exactKeys$10(value, [
		"id",
		"activationId",
		"source",
		"shape",
		"ownerId",
		"team",
		"audience",
		"anchor",
		"pathStart",
		"pathEnd",
		"halfWidthM",
		"expiresInMs"
	]) || typeof value.id !== "string" || value.id.length > 120 || !activationId(value.activationId) || value.source !== "care-package" && value.source !== "carpet-bomber" || value.shape !== "ground-x" && value.shape !== "corridor" || !actorId(value.ownerId) || value.team !== 0 && value.team !== 1 || value.audience !== "all-combatants" && value.audience !== "owner-only" || !vec3(value.anchor)) return false;
	const maximumLifetime = value.source === "care-package" ? CARE_TARGET_MARKER_MAX_LIFETIME_MS : CARPET_TARGET_MARKER_MAX_LIFETIME_MS;
	if (!finite(value.expiresInMs, 0, maximumLifetime)) return false;
	if (value.shape === "ground-x") {
		const expectedId = `${value.activationId}:${value.source === "care-package" ? "care-target" : "carpet-target"}`;
		return value.id === expectedId && value.audience === "all-combatants" && value.pathStart === null && value.pathEnd === null && value.halfWidthM === null;
	}
	if (value.id !== `${value.activationId}:carpet-corridor` || value.source !== "carpet-bomber" || value.audience !== "owner-only" || !vec3(value.pathStart) || !vec3(value.pathEnd) || !finite(value.halfWidthM, .1, 12)) return false;
	const horizontalLength = Math.hypot(value.pathEnd[0] - value.pathStart[0], value.pathEnd[2] - value.pathStart[2]);
	return horizontalLength >= 1 && horizontalLength <= 200;
}
function isRecipientSnapshot(value) {
	if (!object(value) || !exactKeys$10(value, [
		"schemaVersion",
		"matchEpoch",
		"revision",
		"actors",
		"entities",
		"sensorContacts",
		"placementMarkers"
	]) || value.schemaVersion !== 3 || !safeCounter(value.matchEpoch) || !safeCounter(value.revision) || !Array.isArray(value.actors) || value.actors.length > 6 || !value.actors.every(isActorSnapshot) || !Array.isArray(value.entities) || value.entities.length > 32 || !value.entities.every(isEntitySnapshot) || !Array.isArray(value.sensorContacts) || value.sensorContacts.length > 16 || !value.sensorContacts.every(isSensorContact) || !Array.isArray(value.placementMarkers) || value.placementMarkers.length > 8 || !value.placementMarkers.every(isPlacementMarker)) return false;
	return new Set(value.actors.map((entry) => entry.actorId)).size === value.actors.length && new Set(value.entities.map((entry) => entry.id)).size === value.entities.length && new Set(value.sensorContacts.map((entry) => entry.id)).size === value.sensorContacts.length;
}
function placementMarkersMatchRecipient(snapshot, recipientId) {
	if (new Set(snapshot.placementMarkers.map((marker) => marker.id)).size !== snapshot.placementMarkers.length) return false;
	const sameVector = (left, right) => left.every((entry, axis) => entry === right[axis]);
	for (const marker of snapshot.placementMarkers) {
		if (marker.audience === "owner-only" && recipientId !== marker.ownerId) return false;
		const owner = snapshot.actors.find((actor) => actor.actorId === marker.ownerId);
		if (!owner || owner.team !== marker.team) return false;
		if (marker.shape !== "corridor") continue;
		const target = snapshot.placementMarkers.find((candidate) => candidate.activationId === marker.activationId && candidate.source === "carpet-bomber" && candidate.shape === "ground-x");
		if (!target || target.ownerId !== marker.ownerId || target.team !== marker.team || target.expiresInMs !== marker.expiresInMs || !sameVector(target.anchor, marker.anchor)) return false;
	}
	for (const target of snapshot.placementMarkers.filter((marker) => marker.source === "carpet-bomber" && marker.shape === "ground-x")) {
		const corridors = snapshot.placementMarkers.filter((marker) => marker.activationId === target.activationId && marker.shape === "corridor");
		if (recipientId === target.ownerId ? corridors.length !== 1 : corridors.length !== 0) return false;
	}
	return true;
}
function sensorCapabilityMatchesRecipient(snapshot, recipientId) {
	if (snapshot.sensorContacts.length === 0) return true;
	if (!recipientId) return false;
	const actor = snapshot.actors.find((entry) => entry.actorId === recipientId);
	if (actor?.possession?.kind !== "piloted-drone") return false;
	return snapshot.entities.some((entity) => entity.id === actor.possession?.entityId && entity.kind === "drone" && entity.mode === "piloted");
}
function isDamageEvent(value) {
	return object(value) && exactKeys$10(value, [
		"resultId",
		"activationId",
		"source",
		"ownerId",
		"targetId",
		"targetLifeId",
		"targetPosition",
		"damage",
		"origin",
		"endpoint",
		"tracerOrigin",
		"atMs"
	]) && typeof value.resultId === "string" && /^ks-result-[0-9]+-[0-9]+$/.test(value.resultId) && activationId(value.activationId) && ids.has(String(value.source)) && actorId(value.ownerId) && actorId(value.targetId) && safeCounter(value.targetLifeId) && vec3(value.targetPosition) && finite(value.damage, .01, 1e3) && vec3(value.origin) && vec3(value.endpoint) && vec3(value.tracerOrigin) && finite(value.atMs, 0, Number.MAX_SAFE_INTEGER);
}
function supportShotEntityMatchesSource(event) {
	if (event.source === "chopper") return /^ks-[0-9]+-chopper-[0-9]+$/.test(event.entityId);
	if (event.source === "piloted-drone") return /^ks-[0-9]+-pilot-drone-[0-9]+$/.test(event.entityId);
	return /^ks-[0-9]+-swarm-drone-[0-9]+$/.test(event.entityId);
}
function isSupportShotEvent(value) {
	if (!object(value) || !exactKeys$10(value, [
		"activationId",
		"entityId",
		"source",
		"ownerId",
		"ownerTeam",
		"ordinal",
		"atMs"
	]) || !activationId(value.activationId) || !hostEntityId(value.entityId) || value.source !== "chopper" && value.source !== "piloted-drone" && value.source !== "drone-swarm" || !actorId(value.ownerId) || value.ownerTeam !== 0 && value.ownerTeam !== 1 || !safeCounter(value.ordinal) || !finite(value.atMs, 0, Number.MAX_SAFE_INTEGER)) return false;
	return supportShotEntityMatchesSource(value);
}
function isImpactEvent(value) {
	if (!object(value)) return false;
	if (!exactKeys$10(value, [
		"activationId",
		"source",
		"ordinal",
		"phase",
		"position",
		"impactAtMs",
		"atMs"
	], ["launchPosition"]) || !activationId(value.activationId) || value.source !== "carpet-bomber" && value.source !== "chopper" || typeof value.ordinal !== "number" || !Number.isSafeInteger(value.ordinal) || value.ordinal < 0 || value.ordinal >= (value.source === "chopper" ? 6 : 20) || value.phase !== "drop" && value.phase !== "impact" || !vec3(value.position) || value.launchPosition !== void 0 && !vec3(value.launchPosition) || !finite(value.impactAtMs, 0, Number.MAX_SAFE_INTEGER) || !finite(value.atMs, 0, Number.MAX_SAFE_INTEGER)) return false;
	if (value.source === "chopper") return value.phase === "drop" ? value.impactAtMs - value.atMs === 780 : value.atMs === value.impactAtMs;
	return value.phase === "drop" ? value.atMs <= value.impactAtMs : value.atMs >= value.impactAtMs;
}
function isCarpetGroundFirePresentationSnapshot(value) {
	return object(value) && exactKeys$10(value, [
		"activationId",
		"impactOrdinal",
		"position",
		"expiresAtHostTimeMs"
	]) && activationId(value.activationId) && typeof value.impactOrdinal === "number" && Number.isSafeInteger(value.impactOrdinal) && value.impactOrdinal >= 0 && value.impactOrdinal < 20 && vec3(value.position) && finite(value.expiresAtHostTimeMs, 0, Number.MAX_SAFE_INTEGER);
}
function isKillstreakProtocolMessage(value) {
	if (!object(value) || typeof value.type !== "string") return false;
	if (value.type === "killstreak-loadout-intent") return exactKeys$10(value, [
		"type",
		"by",
		"matchEpoch",
		"lifeId",
		"sequence",
		"loadout",
		"nonce"
	]) && baseIntent(value) && validateKillstreakLoadout(value.loadout).valid;
	if (value.type === "killstreak-activate-intent") return exactKeys$10(value, [
		"type",
		"by",
		"matchEpoch",
		"lifeId",
		"sequence",
		"slot",
		"activationId",
		"expectedId",
		"nonce"
	], [
		"anchor",
		"facing",
		"timing"
	]) && baseIntent(value) && (value.slot === 1 || value.slot === 2 || value.slot === 3 || value.slot === 4 || value.slot === 5) && activationId(value.activationId) && ids.has(String(value.expectedId)) && (value.anchor === void 0 || vec3(value.anchor)) && (value.facing === void 0 || vec3(value.facing)) && timing(value.timing);
	if (value.type === "killstreak-control-intent") return exactKeys$10(value, [
		"type",
		"by",
		"matchEpoch",
		"lifeId",
		"sequence",
		"entityId",
		"action",
		"nonce"
	], [
		"yawQ",
		"pitchQ",
		"thrustQ",
		"strafeQ",
		"verticalQ",
		"fire",
		"missileFire",
		"timing"
	]) && baseIntent(value) && hostEntityId(value.entityId) && (value.action === "toggle-chopper-gunner" || value.action === "toggle-piloted-drone" || value.action === "pilot-control" || value.action === "exit-piloted-drone") && (value.yawQ === void 0 || finite(value.yawQ, -Math.PI, Math.PI)) && (value.pitchQ === void 0 || finite(value.pitchQ, -1.2, 1.2)) && (value.thrustQ === void 0 || finite(value.thrustQ, -1, 1)) && (value.strafeQ === void 0 || finite(value.strafeQ, -1, 1)) && (value.verticalQ === void 0 || finite(value.verticalQ, -1, 1)) && (value.fire === void 0 || typeof value.fire === "boolean") && (value.missileFire === void 0 || value.action === "pilot-control" && typeof value.missileFire === "boolean") && timing(value.timing);
	if (value.type === "killstreak-care-capture-intent") return exactKeys$10(value, [
		"type",
		"by",
		"matchEpoch",
		"lifeId",
		"sequence",
		"crateId",
		"holding",
		"nonce"
	], ["timing"]) && baseIntent(value) && hostEntityId(value.crateId) && typeof value.holding === "boolean" && timing(value.timing);
	if (value.type === "killstreak-care-capture-result") {
		if (!exactKeys$10(value, [
			"type",
			"by",
			"forPlayerId",
			"matchEpoch",
			"lifeId",
			"sequence",
			"crateId",
			"holding",
			"accepted",
			"reason",
			"revision",
			"nonce"
		]) || !actorId(value.by) || !actorId(value.forPlayerId) || !safeCounter(value.matchEpoch) || !safeCounter(value.lifeId) || !safeCounter(value.sequence) || !hostEntityId(value.crateId) || typeof value.holding !== "boolean" || typeof value.accepted !== "boolean" || !careCaptureResultReasons.has(value.reason) || !safeCounter(value.revision) || !finite(value.nonce, 0, Number.MAX_SAFE_INTEGER)) return false;
		if (value.accepted) return value.holding ? value.reason === "accepted" : value.reason === "released";
		return value.reason !== "accepted" && value.reason !== "released";
	}
	if (value.type === "killstreak-state") return exactKeys$10(value, [
		"type",
		"by",
		"forPlayerId",
		"snapshot",
		"nonce"
	]) && actorId(value.by) && (value.forPlayerId === null || actorId(value.forPlayerId)) && isRecipientSnapshot(value.snapshot) && sensorCapabilityMatchesRecipient(value.snapshot, value.forPlayerId) && placementMarkersMatchRecipient(value.snapshot, value.forPlayerId) && finite(value.nonce, 0, Number.MAX_SAFE_INTEGER);
	if (value.type === "killstreak-carpet-fire-state") {
		if (!exactKeys$10(value, [
			"type",
			"by",
			"forPlayerId",
			"matchEpoch",
			"snapshotId",
			"chunkIndex",
			"chunkCount",
			"totalFires",
			"fires",
			"nonce"
		]) || !actorId(value.by) || !actorId(value.forPlayerId) || !safeCounter(value.matchEpoch) || !safeCounter(value.snapshotId) || !safeCounter(value.chunkIndex) || !safeCounter(value.chunkCount) || !safeCounter(value.totalFires) || value.chunkCount < 1 || value.chunkCount > CARPET_GROUND_FIRE_STATE_MAX_CHUNKS || value.chunkIndex >= value.chunkCount || value.totalFires > CARPET_GROUND_FIRE_AUTHORITY_CAPACITY || value.chunkCount !== Math.max(1, Math.ceil(value.totalFires / 64)) || !Array.isArray(value.fires) || value.fires.length !== Math.min(64, Math.max(0, value.totalFires - value.chunkIndex * 64)) || !value.fires.every(isCarpetGroundFirePresentationSnapshot) || new Set(value.fires.map((fire) => {
			const snapshot = fire;
			return `${snapshot.activationId}:${snapshot.impactOrdinal}`;
		})).size !== value.fires.length) return false;
		return finite(value.nonce, 0, Number.MAX_SAFE_INTEGER);
	}
	if (value.type === "killstreak-damage-result") return exactKeys$10(value, [
		"type",
		"by",
		"matchEpoch",
		"revision",
		"events",
		"shots",
		"impacts",
		"nonce"
	]) && actorId(value.by) && safeCounter(value.matchEpoch) && safeCounter(value.revision) && Array.isArray(value.events) && value.events.length <= 64 && value.events.every(isDamageEvent) && new Set(value.events.map((event) => event.resultId)).size === value.events.length && Array.isArray(value.shots) && value.shots.length <= 64 && value.shots.every(isSupportShotEvent) && value.shots.every((shot) => {
		const event = shot;
		return event.entityId.startsWith(`ks-${Number(value.matchEpoch)}-`) && event.activationId.startsWith(`ks-activation-${Number(value.matchEpoch)}-`);
	}) && new Set(value.shots.map((shot) => {
		const event = shot;
		return `${event.entityId}:${event.ordinal}`;
	})).size === value.shots.length && Array.isArray(value.impacts) && value.impacts.length <= 40 && value.impacts.every(isImpactEvent) && new Set(value.impacts.map((impact) => {
		const event = impact;
		return `${event.activationId}:${event.ordinal}:${event.phase}`;
	})).size === value.impacts.length && finite(value.nonce, 0, Number.MAX_SAFE_INTEGER);
	return false;
}
function killstreakMessageBelongsToPlayer(message, playerId) {
	if (!playerId) return false;
	if (message.type === "killstreak-care-capture-result") return message.by === playerId || message.forPlayerId === playerId;
	if (message.type === "killstreak-state") return message.by === playerId || message.forPlayerId === playerId;
	if (message.type === "killstreak-carpet-fire-state") return message.by === playerId || message.forPlayerId === playerId;
	if (message.type === "killstreak-damage-result") return message.shots.length > 0 || message.impacts.length > 0 || message.by === playerId || message.events.some((event) => event.ownerId === playerId || event.targetId === playerId);
	return message.by === playerId;
}
function isKillstreakHostAuthorityMessage(message) {
	return message.type === "killstreak-care-capture-result" || message.type === "killstreak-state" || message.type === "killstreak-carpet-fire-state" || message.type === "killstreak-damage-result";
}
function isPass65KillstreakId(value) {
	return typeof value === "string" && ids.has(value);
}
//#endregion
//#region src/canonical-state.ts
function normalize(value) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("Canonical state cannot contain non-finite numbers");
		return Object.is(value, -0) ? 0 : value;
	}
	if (Array.isArray(value)) return value.map(normalize);
	if (typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== void 0).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, entry]) => [key, normalize(entry)]));
	throw new TypeError(`Unsupported canonical state value: ${typeof value}`);
}
function stableStringify(value, spacing = 0) {
	return JSON.stringify(normalize(value), null, spacing);
}
var SHA256_CONSTANTS = Object.freeze([
	1116352408,
	1899447441,
	3049323471,
	3921009573,
	961987163,
	1508970993,
	2453635748,
	2870763221,
	3624381080,
	310598401,
	607225278,
	1426881987,
	1925078388,
	2162078206,
	2614888103,
	3248222580,
	3835390401,
	4022224774,
	264347078,
	604807628,
	770255983,
	1249150122,
	1555081692,
	1996064986,
	2554220882,
	2821834349,
	2952996808,
	3210313671,
	3336571891,
	3584528711,
	113926993,
	338241895,
	666307205,
	773529912,
	1294757372,
	1396182291,
	1695183700,
	1986661051,
	2177026350,
	2456956037,
	2730485921,
	2820302411,
	3259730800,
	3345764771,
	3516065817,
	3600352804,
	4094571909,
	275423344,
	430227734,
	506948616,
	659060556,
	883997877,
	958139571,
	1322822218,
	1537002063,
	1747873779,
	1955562222,
	2024104815,
	2227730452,
	2361852424,
	2428436474,
	2756734187,
	3204031479,
	3329325298
]);
function rotateRight(value, count) {
	return value >>> count | value << 32 - count;
}
/** Browser-safe synchronous SHA-256 for authoritative snapshot identities. */
function sha256Hex(value) {
	const source = typeof value === "string" ? new TextEncoder().encode(value) : value;
	const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
	const padded = new Uint8Array(paddedLength);
	padded.set(source);
	padded[source.length] = 128;
	const bitLength = BigInt(source.length) * 8n;
	const lengthView = new DataView(padded.buffer);
	lengthView.setUint32(paddedLength - 8, Number(bitLength >> 32n & 4294967295n), false);
	lengthView.setUint32(paddedLength - 4, Number(bitLength & 4294967295n), false);
	const hash = new Uint32Array([
		1779033703,
		3144134277,
		1013904242,
		2773480762,
		1359893119,
		2600822924,
		528734635,
		1541459225
	]);
	const words = /* @__PURE__ */ new Uint32Array(64);
	const view = new DataView(padded.buffer);
	for (let offset = 0; offset < paddedLength; offset += 64) {
		for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
		for (let index = 16; index < 64; index += 1) {
			const left = words[index - 15];
			const right = words[index - 2];
			const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ left >>> 3;
			const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ right >>> 10;
			words[index] = words[index - 16] + sigma0 + words[index - 7] + sigma1 >>> 0;
		}
		let [a, b, c, d, e, f, g, h] = hash;
		for (let index = 0; index < 64; index += 1) {
			const upperSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
			const choose = e & f ^ ~e & g;
			const temp1 = h + upperSigma1 + choose + SHA256_CONSTANTS[index] + words[index] >>> 0;
			const temp2 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) + (a & b ^ a & c ^ b & c) >>> 0;
			h = g;
			g = f;
			f = e;
			e = d + temp1 >>> 0;
			d = c;
			c = b;
			b = a;
			a = temp1 + temp2 >>> 0;
		}
		hash[0] = hash[0] + a >>> 0;
		hash[1] = hash[1] + b >>> 0;
		hash[2] = hash[2] + c >>> 0;
		hash[3] = hash[3] + d >>> 0;
		hash[4] = hash[4] + e >>> 0;
		hash[5] = hash[5] + f >>> 0;
		hash[6] = hash[6] + g >>> 0;
		hash[7] = hash[7] + h >>> 0;
	}
	return [...hash].map((word) => word.toString(16).padStart(8, "0")).join("");
}
function canonicalSha256(value) {
	return sha256Hex(stableStringify(value));
}
var SHED_ANGLE_Q = 1e4;
var SHED_PANEL_COORD_Q = 1e4;
var SHED_MAJOR_DEBRIS_HALF_THICKNESS = .06;
var SHED_DAMAGE_REGION_RADIUS_Q = 1800;
var WORLD_COLLISION_CONSUMERS = Object.freeze([
	"movement",
	"ballistics",
	"grenades",
	"ai-los",
	"support-targeting",
	"spawn-nav",
	"rendering"
]);
/** Shared physical bounds for every authored debris throw, push and birth kick. */
var SHED_DEBRIS_MAX_SPEED = 9;
var SHED_DEBRIS_MAX_ANGULAR = 9;
/** Velocity/impulse quantisation: one Q unit is a millimetre (or milliradian) per second. */
var SHED_DEBRIS_VELOCITY_Q = 1e3;
/** Bound the impulse request is validated against, and therefore the bound it accumulates into. */
var SHED_DEBRIS_IMPULSE_MAX_Q = 5e4;
/**
* Detach kick (owner 2026-08-30, "its physics to destruction and push need some
* help"): a panel that lets go leaves the frame along its own outward normal
* with a slight downward bias. Small enough to read as a slump off the shell,
* not a launch.
*/
var SHED_DEBRIS_DETACH_MIN_SPEED = 1.2;
var SHED_DEBRIS_DETACH_SPEED_SPREAD = .8;
var SHED_DEBRIS_DETACH_SLUMP = .6;
var SHED_DEBRIS_DETACH_SPIN = 1.8;
/** A grenade collapse throws with the same shape as the bomber, at under half the speed. */
var SHED_GRENADE_THROW_SCALE = .45;
/** Radians per second of tumble per metre per second of push. Panels are ~1-2 m half-extents. */
var SHED_DEBRIS_IMPULSE_SPIN = .5;
var ZERO_VECTOR = Object.freeze({
	xQ: 0,
	yQ: 0,
	zQ: 0
});
var IDENTITY_POSE = Object.freeze({
	position: ZERO_VECTOR,
	rotation: Object.freeze({
		xQ: 0,
		yQ: 0,
		zQ: 0,
		wQ: SHED_PANEL_COORD_Q
	})
});
function frameRotationQ(frame) {
	const normal = {
		x: frame.uAxis.y * frame.vAxis.z - frame.uAxis.z * frame.vAxis.y,
		y: frame.uAxis.z * frame.vAxis.x - frame.uAxis.x * frame.vAxis.z,
		z: frame.uAxis.x * frame.vAxis.y - frame.uAxis.y * frame.vAxis.x
	};
	const m00 = frame.uAxis.x;
	const m01 = frame.vAxis.x;
	const m02 = normal.x;
	const m10 = frame.uAxis.y;
	const m11 = frame.vAxis.y;
	const m12 = normal.y;
	const m20 = frame.uAxis.z;
	const m21 = frame.vAxis.z;
	const m22 = normal.z;
	const trace = m00 + m11 + m22;
	let x;
	let y;
	let z;
	let w;
	if (trace > 0) {
		const scale = Math.sqrt(trace + 1) * 2;
		w = scale / 4;
		x = (m21 - m12) / scale;
		y = (m02 - m20) / scale;
		z = (m10 - m01) / scale;
	} else if (m00 > m11 && m00 > m22) {
		const scale = Math.sqrt(1 + m00 - m11 - m22) * 2;
		w = (m21 - m12) / scale;
		x = scale / 4;
		y = (m01 + m10) / scale;
		z = (m02 + m20) / scale;
	} else if (m11 > m22) {
		const scale = Math.sqrt(1 + m11 - m00 - m22) * 2;
		w = (m02 - m20) / scale;
		x = (m01 + m10) / scale;
		y = scale / 4;
		z = (m12 + m21) / scale;
	} else {
		const scale = Math.sqrt(1 + m22 - m00 - m11) * 2;
		w = (m10 - m01) / scale;
		x = (m02 + m20) / scale;
		y = (m12 + m21) / scale;
		z = scale / 4;
	}
	const length = Math.hypot(x, y, z, w) || 1;
	return Object.freeze({
		xQ: Math.round(x / length * SHED_PANEL_COORD_Q),
		yQ: Math.round(y / length * SHED_PANEL_COORD_Q),
		zQ: Math.round(z / length * SHED_PANEL_COORD_Q),
		wQ: Math.round(w / length * SHED_PANEL_COORD_Q)
	});
}
function finiteInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
	return Number.isSafeInteger(value) && value >= min && value <= max;
}
function validId(value) {
	return /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}
function exactKeys$9(value, keys) {
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function unique(values) {
	return new Set(values).size === values.length;
}
function magnitude(vector) {
	return Math.hypot(vector.x, vector.y, vector.z);
}
function shedSurfaceNormal(frame) {
	return Object.freeze({
		x: frame.uAxis.y * frame.vAxis.z - frame.uAxis.z * frame.vAxis.y,
		y: frame.uAxis.z * frame.vAxis.x - frame.uAxis.x * frame.vAxis.z,
		z: frame.uAxis.x * frame.vAxis.y - frame.uAxis.y * frame.vAxis.x
	});
}
/**
* Deterministic per-chunk noise. Host and guest replay the same detach and
* throw maths from replicated state, so every "random" component has to come
* from the chunk id instead of a PRNG. FNV-1a over the id, sampled as 16-bit
* windows; offsets at or above 32 alias back onto the low windows because JS
* shifts are taken modulo 32, which the authored throw offsets already rely on.
*/
function chunkNoise(chunkId) {
	let hash = 2166136261 ^ chunkId.length + 1;
	for (let index = 0; index < chunkId.length; index += 1) hash = Math.imul(hash ^ chunkId.charCodeAt(index), 16777619);
	hash >>>= 0;
	return (bitOffset) => (hash >>> bitOffset & 65535) / 65535;
}
function clampSpeed(value, maximum) {
	return Math.max(-maximum, Math.min(maximum, value));
}
/**
* Quantise to an integer that is never negative zero. Canonical state is JSON
* round-tripped on every join and JSON writes -0 as 0, so a host holding -0
* would never deep-equal the guest that parsed the host's own envelope. An axis
* component of exactly zero times a negative spin produces -0, so this is
* reachable from ordinary authored geometry.
*/
function roundQ(value) {
	const rounded = Math.round(value);
	return rounded === 0 ? 0 : rounded;
}
function quantizedVelocity(vector, maximum = SHED_DEBRIS_MAX_SPEED) {
	return Object.freeze({
		xQ: roundQ(clampSpeed(vector.x, maximum) * SHED_DEBRIS_VELOCITY_Q),
		yQ: roundQ(clampSpeed(vector.y, maximum) * SHED_DEBRIS_VELOCITY_Q),
		zQ: roundQ(clampSpeed(vector.z, maximum) * SHED_DEBRIS_VELOCITY_Q)
	});
}
function accumulateVelocityQ(base, delta, maximumQ) {
	return Object.freeze({
		xQ: roundQ(clampSpeed(base.xQ + delta.xQ, maximumQ)),
		yQ: roundQ(clampSpeed(base.yQ + delta.yQ, maximumQ)),
		zQ: roundQ(clampSpeed(base.zQ + delta.zQ, maximumQ))
	});
}
function validFrame(frame) {
	const uLength = magnitude(frame.uAxis);
	const vLength = magnitude(frame.vAxis);
	const dot = frame.uAxis.x * frame.vAxis.x + frame.uAxis.y * frame.vAxis.y + frame.uAxis.z * frame.vAxis.z;
	return [
		frame.centre.x,
		frame.centre.y,
		frame.centre.z,
		frame.halfU,
		frame.halfV
	].every(Number.isFinite) && frame.halfU > 0 && frame.halfV > 0 && Math.abs(uLength - 1) <= 1e-4 && Math.abs(vLength - 1) <= 1e-4 && Math.abs(dot) <= 1e-4;
}
function validateDestructibleShedDefinition(definition) {
	const errors = [];
	if (definition.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
	if (!validId(definition.id)) errors.push("definition id invalid");
	if (definition.caps.apertures !== 96) errors.push("aperture cap mismatch");
	if (definition.caps.dents !== 64) errors.push("dent cap mismatch");
	if (definition.caps.majorChunks !== 6) errors.push("major chunk cap mismatch");
	if (definition.caps.arenaAwakeMajorBodies !== 18) errors.push("arena awake-body cap mismatch");
	if (definition.preauthoredChunkIds.length !== 6 || !unique(definition.preauthoredChunkIds)) errors.push("exactly six unique pre-authored chunks required");
	if (!definition.preauthoredChunkIds.every(validId)) errors.push("pre-authored chunk id invalid");
	const surfaceIds = definition.surfaces.map((surface) => surface.id);
	if (definition.surfaces.length < 4 || !unique(surfaceIds) || !surfaceIds.every(validId)) errors.push("surface ids invalid");
	if (!surfaceIds.includes(definition.doorSurfaceId)) errors.push("door surface missing");
	if (definition.surfaces.filter((surface) => surface.role === "door").length !== 1) errors.push("exactly one door surface required");
	for (const surface of definition.surfaces) {
		if (!validFrame(surface.frame)) errors.push(`${surface.id}: invalid frame`);
		const normal = shedSurfaceNormal(surface.frame);
		const horizontalOutward = normal.x * surface.frame.centre.x + normal.z * surface.frame.centre.z;
		if (surface.role === "roof") {
			if (normal.y < .5 || horizontalOutward <= .05) errors.push(`${surface.id}: roof normal must face up and outward`);
		} else if (horizontalOutward <= .05) errors.push(`${surface.id}: wall/door normal must face outward`);
		if (surface.detachableChunkId !== null && !definition.preauthoredChunkIds.includes(surface.detachableChunkId)) errors.push(`${surface.id}: unknown detachable chunk`);
		const outline = surface.frame.outlineUVQ;
		if (outline !== void 0) {
			if (outline.length < 3) errors.push(`${surface.id}: outlineUVQ needs at least three points`);
			else if (!outline.every((point) => Number.isSafeInteger(point.uQ) && Number.isSafeInteger(point.vQ) && Math.abs(point.uQ) <= 1e4 && Math.abs(point.vQ) <= 1e4)) errors.push(`${surface.id}: outlineUVQ points must be integers within +/-${SHED_PANEL_COORD_Q}`);
		}
	}
	const usedChunkIds = definition.surfaces.map((surface) => surface.detachableChunkId).filter((chunkId) => chunkId !== null);
	if (!unique(usedChunkIds) || usedChunkIds.length !== definition.preauthoredChunkIds.length || !definition.preauthoredChunkIds.every((chunkId) => usedChunkIds.includes(chunkId))) errors.push("pre-authored chunks must map one-to-one to detachable sheet surfaces");
	const { dentDamageQ, perforateEnergyQ, detachDamageQ } = definition.thresholds;
	if (![
		dentDamageQ,
		perforateEnergyQ,
		detachDamageQ
	].every((value) => finiteInteger(value, 1, 1e6))) errors.push("damage thresholds must be bounded integers");
	else if (!(dentDamageQ < perforateEnergyQ && perforateEnergyQ < detachDamageQ)) errors.push("thresholds must increase dent < perforate < detach");
	if (definition.consumers.length !== WORLD_COLLISION_CONSUMERS.length || !WORLD_COLLISION_CONSUMERS.every((consumer) => definition.consumers.includes(consumer))) errors.push("world collision consumer parity incomplete");
	return Object.freeze(errors);
}
/**
* Canonical sheet dimensions shared by presentation, movement, ballistics and
* Rapier. Keeping these dimensions definition-derived prevents a detached roof
* or wall from becoming the old one-size-fits-all box in another consumer.
*/
function shedMajorChunkExtents(definition, chunkId) {
	const surface = definition.surfaces.find((candidate) => candidate.detachableChunkId === chunkId);
	if (!surface) throw new TypeError(`Unknown shed chunk: ${chunkId}`);
	return Object.freeze({
		halfU: surface.frame.halfU,
		halfV: surface.frame.halfV,
		halfThickness: SHED_MAJOR_DEBRIS_HALF_THICKNESS
	});
}
function createInitialShedState(definition, placement, matchEpoch) {
	const definitionErrors = validateDestructibleShedDefinition(definition);
	if (definitionErrors.length > 0) throw new TypeError(definitionErrors.join("; "));
	if (placement.definitionId !== definition.id || !validId(placement.id)) throw new TypeError("Invalid shed placement");
	if (!finiteInteger(matchEpoch, 1)) throw new TypeError("Invalid match epoch");
	const surfaces = definition.surfaces.map((surface) => Object.freeze({
		surfaceId: surface.id,
		role: surface.role,
		attachedChunkId: surface.detachableChunkId,
		healthQ: 0,
		stage: "intact",
		apertures: Object.freeze([]),
		dents: Object.freeze([])
	}));
	return Object.freeze({
		schemaVersion: 1,
		shedId: definition.id,
		placementId: placement.id,
		arenaId: placement.arenaId,
		matchEpoch,
		revision: 0,
		nextApertureId: 1,
		nextDentId: 1,
		door: Object.freeze({
			surfaceId: definition.doorSurfaceId,
			commandId: "initial",
			commandSequence: 0,
			angleQ: 0,
			motionOriginAngleQ: 0,
			desiredAngleQ: 0,
			direction: "stationary",
			phase: "closed",
			startedAtTick: 0,
			completesAtTick: 0,
			blockedAtTick: null,
			blockedBy: null,
			resumePolicy: "remain-blocked-until-new-command"
		}),
		surfaces: Object.freeze(surfaces),
		detachedChunkIds: Object.freeze([]),
		majorDebris: Object.freeze([]),
		interactionSequences: Object.freeze([])
	});
}
function withRevision$1(state, update) {
	return Object.freeze({
		...state,
		...update,
		revision: state.revision + 1
	});
}
function doorAngleAt(door, tick) {
	if (door.phase === "blocked" || door.direction === "stationary") return door.angleQ;
	const duration = Math.max(1, door.completesAtTick - door.startedAtTick);
	const progress = Math.max(0, Math.min(1, (tick - door.startedAtTick) / duration));
	return Math.round(door.motionOriginAngleQ + (door.desiredAngleQ - door.motionOriginAngleQ) * progress);
}
function advanceShedDoor(state, tick) {
	if (!finiteInteger(tick) || state.door.phase === "blocked" || state.door.direction === "stationary") return state;
	const angleQ = doorAngleAt(state.door, tick);
	const complete = tick >= state.door.completesAtTick;
	if (angleQ === state.door.angleQ && !complete) return state;
	return withRevision$1(state, { door: complete ? Object.freeze({
		...state.door,
		angleQ: state.door.desiredAngleQ,
		motionOriginAngleQ: state.door.desiredAngleQ,
		direction: "stationary",
		phase: state.door.desiredAngleQ === 1e4 ? "open" : "closed",
		blockedAtTick: null,
		blockedBy: null
	}) : Object.freeze({
		...state.door,
		angleQ
	}) });
}
function admitShedDoorInteraction(state, request) {
	if (!request.isHost) return {
		accepted: false,
		reason: "not-host",
		state
	};
	if (request.matchEpoch !== state.matchEpoch) return {
		accepted: false,
		reason: "stale-epoch",
		state
	};
	if (request.expectedRevision !== state.revision) return {
		accepted: false,
		reason: "stale-revision",
		state
	};
	if (!request.actorAlive) return {
		accepted: false,
		reason: "actor-dead",
		state
	};
	if (!Number.isFinite(request.distance) || request.distance > 2.35) return {
		accepted: false,
		reason: "out-of-range",
		state
	};
	if (!request.hasLineOfSight) return {
		accepted: false,
		reason: "line-of-sight-blocked",
		state
	};
	const prior = state.interactionSequences.find((entry) => entry.actorId === request.actorId)?.sequence ?? 0;
	const newActor = !state.interactionSequences.some((entry) => entry.actorId === request.actorId);
	if (!validId(request.actorId) || request.sequence !== prior + 1 || !finiteInteger(request.tick) || newActor && state.interactionSequences.length >= 12) return {
		accepted: false,
		reason: "invalid-sequence",
		state
	};
	const currentAngleQ = doorAngleAt(state.door, request.tick);
	const desiredAngleQ = state.door.desiredAngleQ === 1e4 ? 0 : SHED_ANGLE_Q;
	const distanceQ = Math.abs(desiredAngleQ - currentAngleQ);
	const duration = Math.max(1, Math.round(60 * distanceQ / SHED_ANGLE_Q));
	const commandSequence = state.door.commandSequence + 1;
	return {
		accepted: true,
		reason: "accepted",
		state: withRevision$1(state, {
			door: Object.freeze({
				...state.door,
				commandId: `${state.placementId}-door-${commandSequence}`,
				commandSequence,
				angleQ: currentAngleQ,
				motionOriginAngleQ: currentAngleQ,
				desiredAngleQ,
				direction: desiredAngleQ === 1e4 ? "opening" : "closing",
				phase: desiredAngleQ === 1e4 ? "opening" : "closing",
				startedAtTick: request.tick,
				completesAtTick: request.tick + duration,
				blockedAtTick: null,
				blockedBy: null
			}),
			interactionSequences: Object.freeze([...state.interactionSequences.filter((entry) => entry.actorId !== request.actorId), Object.freeze({
				actorId: request.actorId,
				sequence: request.sequence
			})].sort((left, right) => left.actorId.localeCompare(right.actorId)))
		})
	};
}
/**
* Host-owned contact response for an intact door. Walking into a closed or
* closing leaf pushes it towards open without forging an F-interaction
* sequence. Repeated overlap while it is already opening is a no-op, which
* keeps one physical contact from manufacturing revisions every simulation
* tick.
*/
function pushShedDoorFromPlayerContact(state, request) {
	if (!request.isHost) return {
		accepted: false,
		reason: "not-host",
		state
	};
	if (request.expectedRevision !== state.revision) return {
		accepted: false,
		reason: "stale-revision",
		state
	};
	if (!validId(request.actorId) || !finiteInteger(request.tick)) return {
		accepted: false,
		reason: "invalid-blocker",
		state
	};
	const doorSurface = state.surfaces.find((surface) => surface.surfaceId === state.door.surfaceId);
	if (!doorSurface || doorSurface.stage === "detached") return {
		accepted: false,
		reason: "already-detached",
		state
	};
	if (state.door.phase === "open" || state.door.phase === "opening") return {
		accepted: false,
		reason: "invalid-blocker",
		state
	};
	const currentAngleQ = doorAngleAt(state.door, request.tick);
	const distanceQ = SHED_ANGLE_Q - currentAngleQ;
	if (distanceQ <= 0) return {
		accepted: false,
		reason: "invalid-blocker",
		state
	};
	const duration = Math.max(1, Math.round(60 * distanceQ / SHED_ANGLE_Q));
	const commandSequence = state.door.commandSequence + 1;
	return {
		accepted: true,
		reason: "accepted",
		state: withRevision$1(state, { door: Object.freeze({
			...state.door,
			commandId: `${state.placementId}-door-contact-${commandSequence}`,
			commandSequence,
			angleQ: currentAngleQ,
			motionOriginAngleQ: currentAngleQ,
			desiredAngleQ: SHED_ANGLE_Q,
			direction: "opening",
			phase: "opening",
			startedAtTick: request.tick,
			completesAtTick: request.tick + duration,
			blockedAtTick: null,
			blockedBy: null,
			resumePolicy: "resume-when-clear"
		}) })
	};
}
function blockShedDoor(state, request) {
	if (!request.isHost) return {
		accepted: false,
		reason: "not-host",
		state
	};
	if (request.expectedRevision !== state.revision) return {
		accepted: false,
		reason: "stale-revision",
		state
	};
	if (!finiteInteger(request.tick) || !validId(request.blocker.entityId)) return {
		accepted: false,
		reason: "invalid-blocker",
		state
	};
	if (state.door.direction === "stationary" || state.door.phase === "blocked") return {
		accepted: false,
		reason: "invalid-blocker",
		state
	};
	const angleQ = doorAngleAt(state.door, request.tick);
	return {
		accepted: true,
		reason: "accepted",
		state: withRevision$1(state, { door: Object.freeze({
			...state.door,
			angleQ,
			motionOriginAngleQ: angleQ,
			phase: "blocked",
			blockedAtTick: request.tick,
			blockedBy: Object.freeze({ ...request.blocker }),
			resumePolicy: request.blocker.kind === "bullet" ? "remain-blocked-until-new-command" : "resume-when-clear"
		}) })
	};
}
function resumeShedDoorWhenClear(state, request) {
	if (!request.isHost) return {
		accepted: false,
		reason: "not-host",
		state
	};
	if (request.expectedRevision !== state.revision) return {
		accepted: false,
		reason: "stale-revision",
		state
	};
	if (state.door.phase !== "blocked" || state.door.resumePolicy !== "resume-when-clear" || !finiteInteger(request.tick)) return {
		accepted: false,
		reason: "invalid-blocker",
		state
	};
	const distanceQ = Math.abs(state.door.desiredAngleQ - state.door.angleQ);
	const duration = Math.max(1, Math.round(60 * distanceQ / SHED_ANGLE_Q));
	const opening = state.door.desiredAngleQ === SHED_ANGLE_Q;
	return {
		accepted: true,
		reason: "accepted",
		state: withRevision$1(state, { door: Object.freeze({
			...state.door,
			motionOriginAngleQ: state.door.angleQ,
			direction: opening ? "opening" : "closing",
			phase: opening ? "opening" : "closing",
			startedAtTick: request.tick,
			completesAtTick: request.tick + duration,
			blockedAtTick: null,
			blockedBy: null
		}) })
	};
}
function validPanelCoordinate(value) {
	return finiteInteger(value, -1e4, SHED_PANEL_COORD_Q);
}
function replaceSurface(state, surfaceId, update) {
	return Object.freeze(state.surfaces.map((surface) => surface.surfaceId === surfaceId ? update(surface) : surface));
}
function cornerSign(value) {
	return value < 0 ? -1 : 1;
}
function markOccupiesCorner(mark, uSign, vSign) {
	return Math.abs(mark.uQ) >= 6500 && Math.abs(mark.vQ) >= 6500 && cornerSign(mark.uQ) === uSign && cornerSign(mark.vQ) === vSign;
}
function markInsideDamageRegion(mark, centre, radiusQ = SHED_DAMAGE_REGION_RADIUS_Q) {
	const du = mark.uQ - centre.uQ;
	const dv = mark.vQ - centre.vQ;
	return du * du + dv * dv <= radiusQ * radiusQ;
}
/**
* Canonical bounded regional damage query. It derives exclusively from the
* persistent aperture/dent state, so clients cannot invent a separate visual
* degradation field and late join reconstructs the same result.
*/
function shedRegionalDamageAt(surface, uQ, vQ, radiusQ = SHED_DAMAGE_REGION_RADIUS_Q) {
	if (!validPanelCoordinate(uQ) || !validPanelCoordinate(vQ) || !finiteInteger(radiusQ, 1, 1e4)) throw new TypeError("Invalid shed regional-damage query");
	const centre = {
		uQ,
		vQ
	};
	const apertures = surface.apertures.filter((mark) => markInsideDamageRegion(mark, centre, radiusQ));
	const dents = surface.dents.filter((mark) => markInsideDamageRegion(mark, centre, radiusQ));
	return Object.freeze({
		apertureCount: apertures.length,
		dentCount: dents.length,
		markCount: apertures.length + dents.length,
		maximumDentDepthQ: Math.max(0, ...dents.map((dent) => dent.depthQ))
	});
}
function cornerWeakeningTriggersCollapse(definition, surface, impact) {
	if (surface.attachedChunkId === null || Math.abs(impact.uQ) < 6500 || Math.abs(impact.vQ) < 6500 || surface.healthQ < definition.thresholds.detachDamageQ) return false;
	const uSign = cornerSign(impact.uQ);
	const vSign = cornerSign(impact.vQ);
	return surface.apertures.filter((mark) => markOccupiesCorner(mark, uSign, vSign) && markInsideDamageRegion(mark, impact)).length + surface.dents.filter((mark) => markOccupiesCorner(mark, uSign, vSign) && markInsideDamageRegion(mark, impact)).length >= 3;
}
function detachSurfaceUpdate(definition, state, surfaces, surfaceId, healthQ) {
	const surface = surfaces.find((candidate) => candidate.surfaceId === surfaceId);
	if (!surface || surface.stage === "detached" || surface.attachedChunkId === null || state.detachedChunkIds.length >= definition.caps.majorChunks) return null;
	const surfaceDefinition = definition.surfaces.find((candidate) => candidate.id === surfaceId);
	if (!surfaceDefinition) return null;
	const chunkId = surface.attachedChunkId;
	const noise = chunkNoise(chunkId);
	const normal = shedSurfaceNormal(surfaceDefinition.frame);
	const speed = SHED_DEBRIS_DETACH_MIN_SPEED + noise(0) * SHED_DEBRIS_DETACH_SPEED_SPREAD;
	const spin = (noise(16) * 2 - 1) * SHED_DEBRIS_DETACH_SPIN;
	const uAxis = surfaceDefinition.frame.uAxis;
	return Object.freeze({
		surfaces: Object.freeze(surfaces.map((candidate) => candidate.surfaceId === surfaceId ? Object.freeze({
			...candidate,
			healthQ,
			stage: "detached",
			attachedChunkId: null
		}) : candidate)),
		detachedChunkIds: Object.freeze([...state.detachedChunkIds, chunkId]),
		majorDebris: Object.freeze([...state.majorDebris, Object.freeze({
			chunkId,
			poseQ: Object.freeze({
				...IDENTITY_POSE,
				position: Object.freeze({
					xQ: Math.round(surfaceDefinition.frame.centre.x * 1e3),
					yQ: Math.round(surfaceDefinition.frame.centre.y * 1e3),
					zQ: Math.round(surfaceDefinition.frame.centre.z * 1e3)
				}),
				rotation: frameRotationQ(surfaceDefinition.frame)
			}),
			velocityQ: quantizedVelocity({
				x: normal.x * speed,
				y: normal.y * speed - SHED_DEBRIS_DETACH_SLUMP,
				z: normal.z * speed
			}),
			angularVelocityQ: quantizedVelocity({
				x: uAxis.x * spin,
				y: uAxis.y * spin,
				z: uAxis.z * spin
			}, SHED_DEBRIS_MAX_ANGULAR),
			sleeping: false,
			flat: false
		})])
	});
}
function applyShedSheetImpact(definition, state, request) {
	if (!request.isHost) return {
		accepted: false,
		reason: "not-host",
		state
	};
	if (request.matchEpoch !== state.matchEpoch) return {
		accepted: false,
		reason: "stale-epoch",
		state
	};
	if (request.expectedRevision !== state.revision) return {
		accepted: false,
		reason: "stale-revision",
		state
	};
	const surface = state.surfaces.find((candidate) => candidate.surfaceId === request.surfaceId);
	if (!surface) return {
		accepted: false,
		reason: "unknown-surface",
		state
	};
	if (surface.stage === "detached") return {
		accepted: false,
		reason: "already-detached",
		state
	};
	if (!validPanelCoordinate(request.uQ) || !validPanelCoordinate(request.vQ) || !finiteInteger(request.radiusUQ, 1, 1e4 / 2) || !finiteInteger(request.radiusVQ, 1, 1e4 / 2) || !finiteInteger(request.damageQ, 0, 1e6) || !finiteInteger(request.penetrationEnergyQ, 0, 1e6)) return {
		accepted: false,
		reason: "invalid-impact",
		state
	};
	const apertureCount = state.surfaces.reduce((sum, candidate) => sum + candidate.apertures.length, 0);
	const dentCount = state.surfaces.reduce((sum, candidate) => sum + candidate.dents.length, 0);
	const perforates = request.penetrationEnergyQ >= definition.thresholds.perforateEnergyQ;
	const dents = request.damageQ >= definition.thresholds.dentDamageQ;
	if (perforates && apertureCount >= definition.caps.apertures) return {
		accepted: false,
		reason: "aperture-cap",
		state
	};
	if (!perforates && dents && dentCount >= definition.caps.dents) return {
		accepted: false,
		reason: "dent-cap",
		state
	};
	const healthQ = Math.min(1e6, surface.healthQ + request.damageQ);
	let nextApertureId = state.nextApertureId;
	let nextDentId = state.nextDentId;
	const apertures = perforates ? Object.freeze([...surface.apertures, Object.freeze({
		id: nextApertureId++,
		surfaceId: surface.surfaceId,
		uQ: request.uQ,
		vQ: request.vQ,
		radiusUQ: request.radiusUQ,
		radiusVQ: request.radiusVQ
	})]) : surface.apertures;
	const dentList = !perforates && dents ? Object.freeze([...surface.dents, Object.freeze({
		id: nextDentId++,
		surfaceId: surface.surfaceId,
		uQ: request.uQ,
		vQ: request.vQ,
		radiusQ: Math.max(request.radiusUQ, request.radiusVQ),
		depthQ: Math.min(2500, Math.max(1, Math.round(request.damageQ / 4)))
	})]) : surface.dents;
	const stage = perforates || apertures.length > 0 ? "perforated" : dentList.length > 0 ? "dented" : "intact";
	const surfaces = replaceSurface(state, surface.surfaceId, (candidate) => Object.freeze({
		...candidate,
		healthQ,
		stage,
		apertures,
		dents: dentList
	}));
	const collapse = cornerWeakeningTriggersCollapse(definition, surfaces.find((candidate) => candidate.surfaceId === surface.surfaceId), request) ? detachSurfaceUpdate(definition, state, surfaces, surface.surfaceId, healthQ) : null;
	return {
		accepted: true,
		reason: "accepted",
		state: withRevision$1(state, {
			surfaces: collapse?.surfaces ?? surfaces,
			nextApertureId,
			nextDentId,
			...collapse ? {
				detachedChunkIds: collapse.detachedChunkIds,
				majorDebris: collapse.majorDebris
			} : {}
		})
	};
}
function applyShedExplosion(definition, state, request) {
	if (!request.isHost) return {
		accepted: false,
		reason: "not-host",
		state
	};
	if (request.matchEpoch !== state.matchEpoch) return {
		accepted: false,
		reason: "stale-epoch",
		state
	};
	if (request.expectedRevision !== state.revision) return {
		accepted: false,
		reason: "stale-revision",
		state
	};
	const surface = state.surfaces.find((candidate) => candidate.surfaceId === request.surfaceId);
	if (!surface) return {
		accepted: false,
		reason: "unknown-surface",
		state
	};
	if (surface.stage === "detached") return {
		accepted: false,
		reason: "already-detached",
		state
	};
	const uQ = request.uQ ?? 0;
	const vQ = request.vQ ?? 0;
	const radiusQ = request.radiusQ ?? Math.min(3200, 900 + Math.round(request.damageQ * 8));
	if (!finiteInteger(request.damageQ, 1, 1e6) || !validPanelCoordinate(uQ) || !validPanelCoordinate(vQ) || !finiteInteger(radiusQ, 1, 1e4 / 2)) return {
		accepted: false,
		reason: "invalid-impact",
		state
	};
	const healthQ = Math.min(1e6, surface.healthQ + request.damageQ);
	const globalDentCount = state.surfaces.reduce((sum, candidate) => sum + candidate.dents.length, 0);
	const createsDent = request.damageQ >= definition.thresholds.dentDamageQ && globalDentCount < definition.caps.dents;
	let nextDentId = state.nextDentId;
	const dents = createsDent ? Object.freeze([...surface.dents, Object.freeze({
		id: nextDentId++,
		surfaceId: surface.surfaceId,
		uQ,
		vQ,
		radiusQ,
		depthQ: Math.min(2500, Math.max(1, Math.round(request.damageQ * 5)))
	})]) : surface.dents;
	const stage = surface.stage === "perforated" ? "perforated" : dents.length > 0 ? "dented" : surface.stage;
	const surfaces = replaceSurface(state, surface.surfaceId, (candidate) => Object.freeze({
		...candidate,
		healthQ,
		stage,
		dents
	}));
	if (healthQ < definition.thresholds.detachDamageQ || surface.attachedChunkId === null) return {
		accepted: true,
		reason: "accepted",
		state: withRevision$1(state, {
			surfaces,
			nextDentId
		})
	};
	if (state.detachedChunkIds.length >= definition.caps.majorChunks) return {
		accepted: false,
		reason: "chunk-cap",
		state
	};
	const collapse = detachSurfaceUpdate(definition, state, surfaces, surface.surfaceId, healthQ);
	if (!collapse) return {
		accepted: false,
		reason: "unknown-surface",
		state
	};
	return {
		accepted: true,
		reason: "accepted",
		state: withRevision$1(state, {
			...collapse,
			nextDentId
		})
	};
}
function openedDetachedDoor(door) {
	return Object.freeze({
		...door,
		angleQ: SHED_ANGLE_Q,
		motionOriginAngleQ: SHED_ANGLE_Q,
		desiredAngleQ: SHED_ANGLE_Q,
		direction: "stationary",
		phase: "open",
		blockedAtTick: null,
		blockedBy: null
	});
}
/**
* Owner requirement: a blast must knock the shed over by itself. Detached
* panels get an outward throw from the blast origin plus a pitch so they
* visibly fly out and settle flat as wreckage instead of standing upright
* waiting for a player push. All values derive from the chunk id so the
* replicated host state stays deterministic; `scale` is the only difference
* between a grenade collapse and a Carpet Bomber obliteration.
*/
function throwDetachedChunks(bodies, originLocal, scale, thrown) {
	return Object.freeze(bodies.map((body) => {
		if (!thrown(body.chunkId)) return body;
		const noise = chunkNoise(body.chunkId);
		const awayX = body.poseQ.position.xQ / SHED_DEBRIS_VELOCITY_Q - originLocal.x;
		const awayZ = body.poseQ.position.zQ / SHED_DEBRIS_VELOCITY_Q - originLocal.z;
		const away = Math.hypot(awayX, awayZ);
		const outward = away > .05 ? 1 / away : 0;
		return Object.freeze({
			...body,
			velocityQ: quantizedVelocity({
				x: awayX * outward * (3 + noise(0) * 1.4) * scale,
				y: (2.2 + noise(8) * 1.8) * scale,
				z: awayZ * outward * (3 + noise(16) * 1.4) * scale
			}),
			angularVelocityQ: quantizedVelocity({
				x: (noise(24) * 2 - 1) * 4.2 * scale,
				y: (noise(32) * 2 - 1) * 1.6 * scale,
				z: (noise(40) * 2 - 1) * 4.2 * scale
			}, SHED_DEBRIS_MAX_ANGULAR),
			flat: false,
			sleeping: false
		});
	}));
}
/**
* One host mutation owns door, supports, panels and debris. A grenade admits a
* major three-chunk collapse; Carpet Bomber removes the entire shell while the
* preauthored six-body cap keeps persistent debris bounded.
*/
function applyShedStructuralBlast(definition, state, request) {
	if (!request.isHost) return {
		accepted: false,
		reason: "not-host",
		state
	};
	if (request.matchEpoch !== state.matchEpoch) return {
		accepted: false,
		reason: "stale-epoch",
		state
	};
	if (request.expectedRevision !== state.revision) return {
		accepted: false,
		reason: "stale-revision",
		state
	};
	if (!validId(request.blastId) || !["grenade-major-collapse", "carpet-bomber-obliteration"].includes(request.blastClass) || ![
		request.originLocal.x,
		request.originLocal.y,
		request.originLocal.z
	].every(Number.isFinite)) return {
		accepted: false,
		reason: "invalid-impact",
		state
	};
	const detachable = definition.surfaces.filter((surface) => surface.detachableChunkId !== null).filter((surface) => !state.detachedChunkIds.includes(surface.detachableChunkId)).sort((left, right) => {
		return magnitude({
			x: left.frame.centre.x - request.originLocal.x,
			y: left.frame.centre.y - request.originLocal.y,
			z: left.frame.centre.z - request.originLocal.z
		}) - magnitude({
			x: right.frame.centre.x - request.originLocal.x,
			y: right.frame.centre.y - request.originLocal.y,
			z: right.frame.centre.z - request.originLocal.z
		}) || left.id.localeCompare(right.id);
	});
	const targetCount = request.blastClass === "carpet-bomber-obliteration" ? definition.caps.majorChunks : Math.min(3, definition.caps.majorChunks);
	const targets = detachable.slice(0, Math.max(0, targetCount - state.detachedChunkIds.length));
	if (request.blastClass === "carpet-bomber-obliteration" && state.surfaces.every((surface) => surface.stage === "detached")) return {
		accepted: false,
		reason: "already-detached",
		state
	};
	if (targets.length === 0 && request.blastClass !== "carpet-bomber-obliteration") return {
		accepted: false,
		reason: "already-detached",
		state
	};
	const restingBeforeBlast = new Set(state.majorDebris.filter((body) => body.velocityQ.xQ === 0 && body.velocityQ.yQ === 0 && body.velocityQ.zQ === 0).map((body) => body.chunkId));
	const detachedByBlast = /* @__PURE__ */ new Set();
	let surfaces = state.surfaces;
	let detachedChunkIds = state.detachedChunkIds;
	let majorDebris = state.majorDebris;
	for (const target of targets) {
		const detached = detachSurfaceUpdate(definition, Object.freeze({
			...state,
			surfaces,
			detachedChunkIds,
			majorDebris
		}), surfaces, target.id, 1e6);
		if (!detached) continue;
		surfaces = detached.surfaces;
		detachedChunkIds = detached.detachedChunkIds;
		majorDebris = detached.majorDebris;
		if (target.detachableChunkId !== null) detachedByBlast.add(target.detachableChunkId);
	}
	if (request.blastClass === "carpet-bomber-obliteration") {
		majorDebris = throwDetachedChunks(majorDebris, request.originLocal, 1, (chunkId) => detachedByBlast.has(chunkId) || restingBeforeBlast.has(chunkId));
		surfaces = Object.freeze(surfaces.map((surface) => surface.stage === "detached" ? surface : Object.freeze({
			...surface,
			healthQ: 1e6,
			stage: "detached",
			attachedChunkId: null
		})));
	} else {
		majorDebris = throwDetachedChunks(majorDebris, request.originLocal, SHED_GRENADE_THROW_SCALE, (chunkId) => detachedByBlast.has(chunkId));
		surfaces = Object.freeze(surfaces.map((surface) => surface.stage === "intact" ? Object.freeze({
			...surface,
			healthQ: Math.max(surface.healthQ, definition.thresholds.detachDamageQ)
		}) : surface));
	}
	const doorDetached = surfaces.find((surface) => surface.surfaceId === state.door.surfaceId)?.stage === "detached";
	return {
		accepted: true,
		reason: "accepted",
		state: withRevision$1(state, {
			surfaces,
			detachedChunkIds,
			majorDebris,
			...doorDetached ? { door: openedDetachedDoor(state.door) } : {}
		})
	};
}
function impulseMajorShedDebris(state, request) {
	if (!request.isHost) return {
		accepted: false,
		reason: "not-host",
		state
	};
	if (request.expectedRevision !== state.revision) return {
		accepted: false,
		reason: "stale-revision",
		state
	};
	const debris = state.majorDebris.find((candidate) => candidate.chunkId === request.chunkId);
	if (!debris) return {
		accepted: false,
		reason: "unknown-surface",
		state
	};
	if (request.source === "player-contact" && debris.flat) return {
		accepted: false,
		reason: "flat-contact-rejected",
		state
	};
	if (![
		request.impulseQ.xQ,
		request.impulseQ.yQ,
		request.impulseQ.zQ
	].every((value) => finiteInteger(value, -5e4, 5e4))) return {
		accepted: false,
		reason: "invalid-impact",
		state
	};
	const spinQ = Object.freeze({
		xQ: roundQ(request.impulseQ.zQ * SHED_DEBRIS_IMPULSE_SPIN),
		yQ: 0,
		zQ: roundQ(-request.impulseQ.xQ * SHED_DEBRIS_IMPULSE_SPIN)
	});
	return {
		accepted: true,
		reason: "accepted",
		state: withRevision$1(state, { majorDebris: Object.freeze(state.majorDebris.map((candidate) => candidate.chunkId === request.chunkId ? Object.freeze({
			...candidate,
			sleeping: false,
			velocityQ: accumulateVelocityQ(candidate.velocityQ, request.impulseQ, SHED_DEBRIS_IMPULSE_MAX_Q),
			angularVelocityQ: accumulateVelocityQ(candidate.angularVelocityQ, spinQ, SHED_DEBRIS_MAX_ANGULAR * SHED_DEBRIS_VELOCITY_Q)
		}) : candidate)) })
	};
}
function synchronizeMajorShedDebris(state, request) {
	if (!request.isHost) return {
		accepted: false,
		reason: "not-host",
		state
	};
	if (request.expectedRevision !== state.revision) return {
		accepted: false,
		reason: "stale-revision",
		state
	};
	if (request.bodies.length > 6 || !request.bodies.every(isMajorDebrisState) || !unique(request.bodies.map((body) => body.chunkId)) || request.bodies.some((body) => !state.detachedChunkIds.includes(body.chunkId)) || request.bodies.length !== state.majorDebris.length || state.majorDebris.some((body) => !request.bodies.some((candidate) => candidate.chunkId === body.chunkId))) return {
		accepted: false,
		reason: "invalid-impact",
		state
	};
	const majorDebris = Object.freeze([...request.bodies].sort((left, right) => left.chunkId.localeCompare(right.chunkId)));
	if (canonicalSha256(majorDebris) === canonicalSha256([...state.majorDebris].sort((left, right) => left.chunkId.localeCompare(right.chunkId)))) return {
		accepted: true,
		reason: "accepted",
		state
	};
	return {
		accepted: true,
		reason: "accepted",
		state: withRevision$1(state, { majorDebris })
	};
}
function apertureContainsPanelPoint(aperture, uQ, vQ) {
	if (!Number.isFinite(uQ) || !Number.isFinite(vQ)) return false;
	const du = (uQ - aperture.uQ) / aperture.radiusUQ;
	const dv = (vQ - aperture.vQ) / aperture.radiusVQ;
	return du * du + dv * dv <= 1;
}
function worldPointToPanelCoordinates(definition, placement, surfaceId, point) {
	const surface = definition.surfaces.find((candidate) => candidate.id === surfaceId);
	if (!surface || placement.definitionId !== definition.id || ![
		point.x,
		point.y,
		point.z
	].every(Number.isFinite)) return null;
	const translatedX = point.x - placement.position.x;
	const translatedZ = point.z - placement.position.z;
	const cosYaw = Math.cos(placement.yaw);
	const sinYaw = Math.sin(placement.yaw);
	const localPoint = {
		x: translatedX * cosYaw - translatedZ * sinYaw,
		y: point.y - placement.position.y,
		z: translatedX * sinYaw + translatedZ * cosYaw
	};
	const offset = {
		x: localPoint.x - surface.frame.centre.x,
		y: localPoint.y - surface.frame.centre.y,
		z: localPoint.z - surface.frame.centre.z
	};
	const u = offset.x * surface.frame.uAxis.x + offset.y * surface.frame.uAxis.y + offset.z * surface.frame.uAxis.z;
	const v = offset.x * surface.frame.vAxis.x + offset.y * surface.frame.vAxis.y + offset.z * surface.frame.vAxis.z;
	return Object.freeze({
		uQ: Math.round(u / surface.frame.halfU * SHED_PANEL_COORD_Q),
		vQ: Math.round(v / surface.frame.halfV * SHED_PANEL_COORD_Q)
	});
}
/** Exact query consumed by both the alpha mask and the canonical ballistic trace. */
function shedApertureContainsWorldPoint(definition, placement, state, surfaceId, point) {
	const coordinates = worldPointToPanelCoordinates(definition, placement, surfaceId, point);
	if (!coordinates) return false;
	return state.surfaces.find((candidate) => candidate.surfaceId === surfaceId)?.apertures.some((aperture) => apertureContainsPanelPoint(aperture, coordinates.uQ, coordinates.vQ)) ?? false;
}
function resetShedState(state, nextMatchEpoch, definition, placement) {
	if (!finiteInteger(nextMatchEpoch, state.matchEpoch + 1)) throw new TypeError("Reset epoch must advance");
	return createInitialShedState(definition, placement, nextMatchEpoch);
}
function isRecord$10(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isQuantizedVector$1(value) {
	return isRecord$10(value) && exactKeys$9(value, [
		"xQ",
		"yQ",
		"zQ"
	]) && [
		value.xQ,
		value.yQ,
		value.zQ
	].every((component) => finiteInteger(Number(component), -5e7, 5e7));
}
function isQuantizedPose(value) {
	return isRecord$10(value) && exactKeys$9(value, ["position", "rotation"]) && isQuantizedVector$1(value.position) && isRecord$10(value.rotation) && exactKeys$9(value.rotation, [
		"xQ",
		"yQ",
		"zQ",
		"wQ"
	]) && [
		value.rotation.xQ,
		value.rotation.yQ,
		value.rotation.zQ,
		value.rotation.wQ
	].every((component) => finiteInteger(Number(component), -1e4, 1e4));
}
function isBallisticAperture(value) {
	return isRecord$10(value) && exactKeys$9(value, [
		"id",
		"surfaceId",
		"uQ",
		"vQ",
		"radiusUQ",
		"radiusVQ"
	]) && finiteInteger(Number(value.id), 1) && typeof value.surfaceId === "string" && validId(value.surfaceId) && validPanelCoordinate(Number(value.uQ)) && validPanelCoordinate(Number(value.vQ)) && finiteInteger(Number(value.radiusUQ), 1, 1e4 / 2) && finiteInteger(Number(value.radiusVQ), 1, 1e4 / 2);
}
function isSheetDent(value) {
	return isRecord$10(value) && exactKeys$9(value, [
		"id",
		"surfaceId",
		"uQ",
		"vQ",
		"radiusQ",
		"depthQ"
	]) && finiteInteger(Number(value.id), 1) && typeof value.surfaceId === "string" && validId(value.surfaceId) && validPanelCoordinate(Number(value.uQ)) && validPanelCoordinate(Number(value.vQ)) && finiteInteger(Number(value.radiusQ), 1, 1e4 / 2) && finiteInteger(Number(value.depthQ), 1, 2500);
}
function isSheetSurfaceState(value) {
	if (!isRecord$10(value) || !exactKeys$9(value, [
		"surfaceId",
		"role",
		"attachedChunkId",
		"healthQ",
		"stage",
		"apertures",
		"dents"
	]) || typeof value.surfaceId !== "string" || !validId(value.surfaceId) || ![
		"wall",
		"roof",
		"door",
		"detached-chunk"
	].includes(String(value.role)) || !(value.attachedChunkId === null || typeof value.attachedChunkId === "string" && validId(value.attachedChunkId)) || !finiteInteger(Number(value.healthQ), 0, 1e6) || ![
		"intact",
		"dented",
		"perforated",
		"detached"
	].includes(String(value.stage)) || !Array.isArray(value.apertures) || !Array.isArray(value.dents) || !value.apertures.every(isBallisticAperture) || !value.dents.every(isSheetDent)) return false;
	return value.apertures.every((aperture) => aperture.surfaceId === value.surfaceId) && value.dents.every((dent) => dent.surfaceId === value.surfaceId);
}
function isDoorBlocker(value) {
	return isRecord$10(value) && exactKeys$9(value, ["kind", "entityId"]) && [
		"player",
		"major-debris",
		"bullet"
	].includes(String(value.kind)) && typeof value.entityId === "string" && validId(value.entityId);
}
function isShedDoorState(value) {
	if (!(isRecord$10(value) && exactKeys$9(value, [
		"surfaceId",
		"commandId",
		"commandSequence",
		"angleQ",
		"motionOriginAngleQ",
		"desiredAngleQ",
		"direction",
		"phase",
		"startedAtTick",
		"completesAtTick",
		"blockedAtTick",
		"blockedBy",
		"resumePolicy"
	]) && typeof value.surfaceId === "string" && validId(value.surfaceId) && typeof value.commandId === "string" && validId(value.commandId) && finiteInteger(Number(value.commandSequence)) && finiteInteger(Number(value.angleQ), 0, 1e4) && finiteInteger(Number(value.motionOriginAngleQ), 0, 1e4) && (value.desiredAngleQ === 0 || value.desiredAngleQ === 1e4) && [
		"opening",
		"closing",
		"stationary"
	].includes(String(value.direction)) && [
		"closed",
		"opening",
		"open",
		"closing",
		"blocked"
	].includes(String(value.phase)) && finiteInteger(Number(value.startedAtTick)) && finiteInteger(Number(value.completesAtTick)) && (value.blockedAtTick === null || finiteInteger(Number(value.blockedAtTick))) && (value.blockedBy === null || isDoorBlocker(value.blockedBy)) && ["remain-blocked-until-new-command", "resume-when-clear"].includes(String(value.resumePolicy)))) return false;
	if (value.phase === "blocked" !== (value.blockedBy !== null && value.blockedAtTick !== null)) return false;
	if (Number(value.completesAtTick) < Number(value.startedAtTick)) return false;
	if (value.phase === "closed") return value.direction === "stationary" && value.angleQ === 0 && value.desiredAngleQ === 0;
	if (value.phase === "open") return value.direction === "stationary" && value.angleQ === 1e4 && value.desiredAngleQ === 1e4;
	if (value.phase === "opening") return value.direction === "opening" && value.desiredAngleQ === 1e4;
	if (value.phase === "closing") return value.direction === "closing" && value.desiredAngleQ === 0;
	return value.direction !== "stationary";
}
function isMajorDebrisState(value) {
	return isRecord$10(value) && exactKeys$9(value, [
		"chunkId",
		"poseQ",
		"velocityQ",
		"angularVelocityQ",
		"sleeping",
		"flat"
	]) && typeof value.chunkId === "string" && validId(value.chunkId) && isQuantizedPose(value.poseQ) && isQuantizedVector$1(value.velocityQ) && isQuantizedVector$1(value.angularVelocityQ) && typeof value.sleeping === "boolean" && typeof value.flat === "boolean";
}
function isInteractionSequence(value) {
	return isRecord$10(value) && exactKeys$9(value, ["actorId", "sequence"]) && typeof value.actorId === "string" && validId(value.actorId) && finiteInteger(Number(value.sequence), 1);
}
/** Strict network/storage parser: unknown keys and cap overflow fail closed. */
function isShedState(value) {
	if (!isRecord$10(value) || !exactKeys$9(value, [
		"schemaVersion",
		"shedId",
		"placementId",
		"arenaId",
		"matchEpoch",
		"revision",
		"nextApertureId",
		"nextDentId",
		"door",
		"surfaces",
		"detachedChunkIds",
		"majorDebris",
		"interactionSequences"
	])) return false;
	if (value.schemaVersion !== 1 || typeof value.shedId !== "string" || !validId(value.shedId) || typeof value.placementId !== "string" || !validId(value.placementId) || !isArenaId(value.arenaId) || !finiteInteger(Number(value.matchEpoch), 1) || !finiteInteger(Number(value.revision)) || !finiteInteger(Number(value.nextApertureId), 1) || !finiteInteger(Number(value.nextDentId), 1) || !Array.isArray(value.surfaces) || !Array.isArray(value.detachedChunkIds) || !Array.isArray(value.majorDebris) || !Array.isArray(value.interactionSequences) || value.interactionSequences.length > 12 || value.detachedChunkIds.length > 6 || value.majorDebris.length > 6) return false;
	if (!isShedDoorState(value.door) || !value.surfaces.every(isSheetSurfaceState) || !value.detachedChunkIds.every((chunkId) => typeof chunkId === "string" && validId(chunkId)) || !value.majorDebris.every(isMajorDebrisState) || !value.interactionSequences.every(isInteractionSequence)) return false;
	const surfaceIds = value.surfaces.map((surface) => surface.surfaceId);
	const detachedChunkIds = value.detachedChunkIds;
	const debrisIds = value.majorDebris.map((debris) => debris.chunkId);
	const actorIds = value.interactionSequences.map((entry) => entry.actorId);
	if (!unique(surfaceIds) || !unique(detachedChunkIds) || !unique(debrisIds) || !unique(actorIds) || !surfaceIds.includes(value.door.surfaceId) || debrisIds.some((chunkId) => !detachedChunkIds.includes(chunkId))) return false;
	let apertures = 0;
	let dents = 0;
	const apertureIds = [];
	const dentIds = [];
	for (const entry of value.surfaces) {
		apertures += entry.apertures.length;
		dents += entry.dents.length;
		apertureIds.push(...entry.apertures.map((aperture) => aperture.id));
		dentIds.push(...entry.dents.map((dent) => dent.id));
		if (entry.stage === "intact" && (entry.apertures.length > 0 || entry.dents.length > 0)) return false;
		if (entry.stage === "dented" && (entry.dents.length === 0 || entry.apertures.length > 0)) return false;
		if (entry.stage === "perforated" && entry.apertures.length === 0) return false;
		if (entry.stage === "detached" && entry.attachedChunkId !== null) return false;
	}
	return apertures <= 96 && dents <= 64 && unique(apertureIds.map(String)) && unique(dentIds.map(String)) && Number(value.nextApertureId) > Math.max(0, ...apertureIds) && Number(value.nextDentId) > Math.max(0, ...dentIds);
}
//#endregion
//#region src/destructible-shed-definition.ts
var ROOF_COS = Math.sqrt(3) / 2;
var ROOF_SIN = .5;
/**
* One canonical identity shared by placement, authority and presentation.
* Arena builders may place or rotate this definition, but may not clone and
* silently retune its surfaces or materials per map.
*/
var FIELD_SHED_DEFINITION = Object.freeze({
	schemaVersion: 1,
	id: "field-shed-v1",
	doorSurfaceId: "door-south",
	surfaces: Object.freeze([
		Object.freeze({
			id: "door-south",
			role: "door",
			detachableChunkId: "chunk-door",
			frame: Object.freeze({
				centre: {
					x: 0,
					y: 1.1,
					z: 2.1
				},
				uAxis: {
					x: 1,
					y: 0,
					z: 0
				},
				vAxis: {
					x: 0,
					y: 1,
					z: 0
				},
				halfU: .72,
				halfV: 1.1
			})
		}),
		Object.freeze({
			id: "wall-north",
			role: "wall",
			detachableChunkId: "chunk-north",
			frame: Object.freeze({
				centre: {
					x: 0,
					y: 1.2,
					z: -2.1
				},
				uAxis: {
					x: -1,
					y: 0,
					z: 0
				},
				vAxis: {
					x: 0,
					y: 1,
					z: 0
				},
				halfU: 1.8,
				halfV: 1.2
			})
		}),
		Object.freeze({
			id: "wall-east",
			role: "wall",
			detachableChunkId: "chunk-east",
			frame: Object.freeze({
				centre: {
					x: 1.8,
					y: 1.2,
					z: 0
				},
				uAxis: {
					x: 0,
					y: 0,
					z: -1
				},
				vAxis: {
					x: 0,
					y: 1,
					z: 0
				},
				halfU: 2.1,
				halfV: 1.2
			})
		}),
		Object.freeze({
			id: "wall-west",
			role: "wall",
			detachableChunkId: "chunk-west",
			frame: Object.freeze({
				centre: {
					x: -1.8,
					y: 1.2,
					z: 0
				},
				uAxis: {
					x: 0,
					y: 0,
					z: 1
				},
				vAxis: {
					x: 0,
					y: 1,
					z: 0
				},
				halfU: 2.1,
				halfV: 1.2
			})
		}),
		Object.freeze({
			id: "wall-south-left",
			role: "wall",
			detachableChunkId: null,
			frame: Object.freeze({
				centre: {
					x: -1.26,
					y: 1.2,
					z: 2.1
				},
				uAxis: {
					x: 1,
					y: 0,
					z: 0
				},
				vAxis: {
					x: 0,
					y: 1,
					z: 0
				},
				halfU: .54,
				halfV: 1.2
			})
		}),
		Object.freeze({
			id: "wall-south-right",
			role: "wall",
			detachableChunkId: null,
			frame: Object.freeze({
				centre: {
					x: 1.26,
					y: 1.2,
					z: 2.1
				},
				uAxis: {
					x: 1,
					y: 0,
					z: 0
				},
				vAxis: {
					x: 0,
					y: 1,
					z: 0
				},
				halfU: .54,
				halfV: 1.2
			})
		}),
		Object.freeze({
			id: "wall-south-header",
			role: "wall",
			detachableChunkId: null,
			frame: Object.freeze({
				centre: {
					x: 0,
					y: 2.3,
					z: 2.1
				},
				uAxis: {
					x: 1,
					y: 0,
					z: 0
				},
				vAxis: {
					x: 0,
					y: 1,
					z: 0
				},
				halfU: .72,
				halfV: .1
			})
		}),
		Object.freeze({
			id: "gable-north",
			role: "wall",
			detachableChunkId: null,
			frame: Object.freeze({
				centre: {
					x: 0,
					y: 2.92,
					z: -2.1
				},
				uAxis: {
					x: -1,
					y: 0,
					z: 0
				},
				vAxis: {
					x: 0,
					y: 1,
					z: 0
				},
				halfU: 1.8,
				halfV: .52,
				outlineUVQ: Object.freeze([
					Object.freeze({
						uQ: -1e4,
						vQ: -1e4
					}),
					Object.freeze({
						uQ: 1e4,
						vQ: -1e4
					}),
					Object.freeze({
						uQ: 0,
						vQ: 1e4
					})
				])
			})
		}),
		Object.freeze({
			id: "gable-south",
			role: "wall",
			detachableChunkId: null,
			frame: Object.freeze({
				centre: {
					x: 0,
					y: 2.92,
					z: 2.1
				},
				uAxis: {
					x: 1,
					y: 0,
					z: 0
				},
				vAxis: {
					x: 0,
					y: 1,
					z: 0
				},
				halfU: 1.8,
				halfV: .52,
				outlineUVQ: Object.freeze([
					Object.freeze({
						uQ: -1e4,
						vQ: -1e4
					}),
					Object.freeze({
						uQ: 1e4,
						vQ: -1e4
					}),
					Object.freeze({
						uQ: 0,
						vQ: 1e4
					})
				])
			})
		}),
		Object.freeze({
			id: "roof-east",
			role: "roof",
			detachableChunkId: "chunk-roof-east",
			frame: Object.freeze({
				centre: {
					x: .9,
					y: 2.92,
					z: 0
				},
				uAxis: {
					x: 0,
					y: 0,
					z: -1
				},
				vAxis: {
					x: -ROOF_COS,
					y: ROOF_SIN,
					z: 0
				},
				halfU: 2.22,
				halfV: 1.04
			})
		}),
		Object.freeze({
			id: "roof-west",
			role: "roof",
			detachableChunkId: "chunk-roof-west",
			frame: Object.freeze({
				centre: {
					x: -.9,
					y: 2.92,
					z: 0
				},
				uAxis: {
					x: 0,
					y: 0,
					z: 1
				},
				vAxis: {
					x: ROOF_COS,
					y: ROOF_SIN,
					z: 0
				},
				halfU: 2.22,
				halfV: 1.04
			})
		})
	]),
	preauthoredChunkIds: Object.freeze([
		"chunk-door",
		"chunk-north",
		"chunk-east",
		"chunk-west",
		"chunk-roof-east",
		"chunk-roof-west"
	]),
	thresholds: Object.freeze({
		dentDamageQ: 20,
		perforateEnergyQ: 21,
		detachDamageQ: 220
	}),
	caps: Object.freeze({
		apertures: 96,
		dents: 64,
		majorChunks: 6,
		arenaAwakeMajorBodies: 18
	}),
	consumers: WORLD_COLLISION_CONSUMERS
});
var FIELD_SHED_MATERIAL_POLICY_ID = "field-shed-material-policy-v1";
var FIELD_SHED_MATERIAL_IDS = Object.freeze({
	sheet: "field-shed-sheet-corrugated-green-v1",
	frame: "field-shed-frame-structural-steel-v1",
	floor: "field-shed-floor-industrial-v1",
	apertureRim: "field-shed-aperture-rim-exposed-metal-v1",
	dent: "field-shed-dent-stressed-metal-v1",
	debris: "field-shed-debris-corrugated-green-v1"
});
var FIELD_SHED_BALLISTIC_MATERIAL_ID = "thin-metal";
//#endregion
//#region src/destructible-shed-presentation.ts
function ridgedMetalBumpTexture() {
	const width = 64;
	const data = new Uint8Array(width * 4);
	for (let x = 0; x < width; x += 1) {
		const ridge = Math.round(128 + Math.sin(x / width * Math.PI * 16) * 112);
		data[x * 4] = ridge;
		data[x * 4 + 1] = ridge;
		data[x * 4 + 2] = ridge;
		data[x * 4 + 3] = 255;
	}
	const texture = new DataTexture(data, width, 1, RGBAFormat);
	texture.name = "field-shed-ridged-metal-bump";
	texture.wrapS = RepeatWrapping;
	texture.wrapT = RepeatWrapping;
	texture.repeat.set(10, 1);
	texture.needsUpdate = true;
	return texture;
}
function panelShape(surface, state) {
	const { halfU, halfV, outlineUVQ } = surface.frame;
	const shape = new Shape();
	if (outlineUVQ && outlineUVQ.length >= 3) {
		const point = (index) => ({
			u: outlineUVQ[index].uQ / SHED_PANEL_COORD_Q * halfU,
			v: outlineUVQ[index].vQ / SHED_PANEL_COORD_Q * halfV
		});
		const first = point(0);
		shape.moveTo(first.u, first.v);
		for (let index = 1; index < outlineUVQ.length; index += 1) {
			const next = point(index);
			shape.lineTo(next.u, next.v);
		}
		shape.closePath();
	} else {
		shape.moveTo(-halfU, -halfV);
		shape.lineTo(halfU, -halfV);
		shape.lineTo(halfU, halfV);
		shape.lineTo(-halfU, halfV);
		shape.closePath();
	}
	for (const aperture of state.apertures) {
		const hole = new Path();
		hole.absellipse(aperture.uQ / SHED_PANEL_COORD_Q * halfU, aperture.vQ / SHED_PANEL_COORD_Q * halfV, aperture.radiusUQ / SHED_PANEL_COORD_Q * halfU, aperture.radiusVQ / SHED_PANEL_COORD_Q * halfV, 0, Math.PI * 2, true);
		shape.holes.push(hole);
	}
	return shape;
}
function panelBasis(surface) {
	const u = new Vector3(surface.frame.uAxis.x, surface.frame.uAxis.y, surface.frame.uAxis.z);
	const v = new Vector3(surface.frame.vAxis.x, surface.frame.vAxis.y, surface.frame.vAxis.z);
	const normal = new Vector3().crossVectors(u, v).normalize();
	return new Matrix4().makeBasis(u, v, normal).setPosition(surface.frame.centre.x, surface.frame.centre.y, surface.frame.centre.z);
}
function transformedPanelGeometry(surface, state) {
	const geometry = new ShapeGeometry(panelShape(surface, state), 18);
	geometry.applyMatrix4(panelBasis(surface));
	geometry.computeVertexNormals();
	return geometry;
}
function localPanelGeometry(surface, state) {
	const geometry = new ShapeGeometry(panelShape(surface, state), 18);
	geometry.computeVertexNormals();
	return geometry;
}
/**
* A bounded pressed-metal dimple. Unlike the retired flat circle decal, this
* mesh has a depressed centre, a raised crease ring and real normals/depth, so
* it participates in the colour, depth and shadow passes on WebGPU/WebGL.
*/
function pressedMetalDentGeometry(radialSegments = 20) {
	const rings = Object.freeze([
		Object.freeze({
			radius: .32,
			height: .2
		}),
		Object.freeze({
			radius: .7,
			height: .78
		}),
		Object.freeze({
			radius: 1,
			height: .04
		})
	]);
	const positions = [
		0,
		0,
		.1
	];
	const uvs = [.5, .5];
	for (const ring of rings) for (let segment = 0; segment < radialSegments; segment += 1) {
		const angle = segment / radialSegments * Math.PI * 2;
		const x = Math.cos(angle) * ring.radius;
		const y = Math.sin(angle) * ring.radius;
		positions.push(x, y, ring.height);
		uvs.push(x * .5 + .5, y * .5 + .5);
	}
	const indices = [];
	for (let segment = 0; segment < radialSegments; segment += 1) {
		const next = (segment + 1) % radialSegments;
		indices.push(0, 1 + segment, 1 + next);
	}
	for (let ring = 0; ring < rings.length - 1; ring += 1) {
		const innerStart = 1 + ring * radialSegments;
		const outerStart = innerStart + radialSegments;
		for (let segment = 0; segment < radialSegments; segment += 1) {
			const next = (segment + 1) % radialSegments;
			const inner = innerStart + segment;
			const innerNext = innerStart + next;
			const outer = outerStart + segment;
			const outerNext = outerStart + next;
			indices.push(inner, outer, outerNext, inner, outerNext, innerNext);
		}
	}
	const geometry = new BufferGeometry();
	geometry.name = "field-shed-pressed-metal-dent-geometry";
	geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
	geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	geometry.computeBoundingSphere();
	return geometry;
}
/**
* One normalized, closed corrugated sheet geometry. Per-chunk canonical
* half-extents provide the distinct door/wall/roof silhouettes without adding
* draw calls or inventing presentation-only collision dimensions.
*/
function corrugatedSheetDebrisGeometry() {
	const geometry = new BoxGeometry(2, 2, .12, 10, 10, 1);
	geometry.name = "field-shed-corrugated-sheet-debris-geometry";
	const positions = geometry.getAttribute("position");
	for (let index = 0; index < positions.count; index += 1) {
		const z = positions.getZ(index);
		if (Math.abs(z) < .055) continue;
		const x = positions.getX(index);
		const y = positions.getY(index);
		const corrugation = .012 * (.5 + .5 * Math.sin((x + 1) * Math.PI * 7 + y * .7));
		const crease = .007 * Math.exp(-Math.pow(x - y * .22, 2) / .045);
		positions.setZ(index, Math.sign(z) * (.06 - corrugation - crease));
	}
	positions.needsUpdate = true;
	geometry.computeVertexNormals();
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	return geometry;
}
function placeBoxInstance(mesh, index, position, scale, rotation = new Quaternion()) {
	mesh.setMatrixAt(index, new Matrix4().compose(position, rotation, scale));
}
function createFrame(material) {
	const frame = new InstancedMesh(new BoxGeometry(2, 2, 2), material, SHED_FRAME_PLACEMENTS.length);
	frame.name = "field-shed-structural-frame";
	SHED_FRAME_PLACEMENTS.forEach(([position, scale, rotation], index) => placeBoxInstance(frame, index, position, scale, rotation));
	frame.instanceMatrix.needsUpdate = true;
	frame.castShadow = true;
	frame.receiveShadow = true;
	return frame;
}
var SHED_FRAME_PLACEMENTS = [
	...[-1.8, 1.8].flatMap((x) => [-2.1, 2.1].map((z) => [new Vector3(x, 1.3, z), new Vector3(.11, 1.3, .11)])),
	[new Vector3(0, 3.45, 0), new Vector3(.09, .09, 2.22)],
	...[-2.1, 2.1].map((z) => [new Vector3(0, 2.43, z), new Vector3(1.8, .09, .09)]),
	...[-1.8, 1.8].map((x) => [new Vector3(x, 2.43, 0), new Vector3(.09, .09, 2.1)]),
	...[-2.1, 2.1].map((z) => [new Vector3(0, .12, z), new Vector3(1.8, .08, .08)]),
	...[-1.8, 1.8].map((x) => [new Vector3(x, .12, 0), new Vector3(.08, .08, 2.1)]),
	[new Vector3(-.78, 1.1, 2.13), new Vector3(.07, 1.1, .07)],
	[new Vector3(.78, 1.1, 2.13), new Vector3(.07, 1.1, .07)]
];
/**
* Deterministic toppled layout for a fully obliterated shed. Each frame member
* ends lying flat near where it stood, fanned outward with a seeded yaw, so the
* skeleton reads as broken wreckage on the ground rather than disappearing.
*/
function placeToppledFrame(frame) {
	SHED_FRAME_PLACEMENTS.forEach(([position, scale], index) => {
		const unit = deterministicFrameUnit(index);
		const longest = Math.max(scale.x, scale.y, scale.z);
		const yaw = Math.atan2(position.x, position.z) + (unit - .5) * 1.4;
		placeBoxInstance(frame, index, new Vector3(position.x * 1.18 + Math.sin(yaw) * .35, Math.min(scale.x, scale.y, scale.z) + .02 + index * .012, position.z * 1.18 + Math.cos(yaw) * .35), new Vector3(Math.min(scale.x, .12), Math.min(scale.y, scale.z, .12), longest), new Quaternion().setFromEuler(new Euler(0, yaw, (unit - .5) * .18)));
	});
	frame.instanceMatrix.needsUpdate = true;
}
function deterministicFrameUnit(index) {
	let hash = 2166136261 ^ index + 1;
	hash = Math.imul(hash, 16777619);
	hash ^= hash >>> 15;
	return (hash >>> 0) / 4294967296;
}
function damageableSheetMesh(name, geometry, material) {
	const mesh = new Mesh(geometry, material);
	mesh.name = name;
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.userData.topologyOwnedMesh = true;
	return mesh;
}
function apertureLocalPosition(surface, aperture) {
	return new Vector3(surface.frame.centre.x + surface.frame.uAxis.x * aperture.uQ / SHED_PANEL_COORD_Q * surface.frame.halfU + surface.frame.vAxis.x * aperture.vQ / SHED_PANEL_COORD_Q * surface.frame.halfV, surface.frame.centre.y + surface.frame.uAxis.y * aperture.uQ / SHED_PANEL_COORD_Q * surface.frame.halfU + surface.frame.vAxis.y * aperture.vQ / SHED_PANEL_COORD_Q * surface.frame.halfV, surface.frame.centre.z + surface.frame.uAxis.z * aperture.uQ / SHED_PANEL_COORD_Q * surface.frame.halfU + surface.frame.vAxis.z * aperture.vQ / SHED_PANEL_COORD_Q * surface.frame.halfV);
}
function panelQuaternion(surface) {
	return new Quaternion().setFromRotationMatrix(panelBasis(surface));
}
function rotateY$1(point, angle) {
	return point.clone().applyAxisAngle(new Vector3(0, 1, 0), angle);
}
function presentationSurfaceDefinition(surface, doorAngleQ) {
	if (surface.role !== "door") return surface;
	const angle = -doorAngleQ / SHED_ANGLE_Q * Math.PI / 2;
	const u = new Vector3(surface.frame.uAxis.x, surface.frame.uAxis.y, surface.frame.uAxis.z);
	const v = new Vector3(surface.frame.vAxis.x, surface.frame.vAxis.y, surface.frame.vAxis.z);
	const centre = new Vector3(surface.frame.centre.x, surface.frame.centre.y, surface.frame.centre.z).addScaledVector(u, -surface.frame.halfU).clone().add(rotateY$1(u.multiplyScalar(surface.frame.halfU), angle));
	const rotatedU = rotateY$1(new Vector3(surface.frame.uAxis.x, surface.frame.uAxis.y, surface.frame.uAxis.z), angle);
	const rotatedV = rotateY$1(v, angle);
	return Object.freeze({
		...surface,
		frame: Object.freeze({
			...surface.frame,
			centre: Object.freeze({
				x: centre.x,
				y: centre.y,
				z: centre.z
			}),
			uAxis: Object.freeze({
				x: rotatedU.x,
				y: rotatedU.y,
				z: rotatedU.z
			}),
			vAxis: Object.freeze({
				x: rotatedV.x,
				y: rotatedV.y,
				z: rotatedV.z
			})
		})
	});
}
function detachedPresentationSurfaceDefinition(surface, state) {
	if (!surface.detachableChunkId) return null;
	const body = state.majorDebris.find((candidate) => candidate.chunkId === surface.detachableChunkId);
	if (!body) return null;
	const rotation = new Quaternion(body.poseQ.rotation.xQ / SHED_PANEL_COORD_Q, body.poseQ.rotation.yQ / SHED_PANEL_COORD_Q, body.poseQ.rotation.zQ / SHED_PANEL_COORD_Q, body.poseQ.rotation.wQ / SHED_PANEL_COORD_Q).normalize();
	const uAxis = new Vector3(1, 0, 0).applyQuaternion(rotation);
	const vAxis = new Vector3(0, 1, 0).applyQuaternion(rotation);
	const normal = new Vector3().crossVectors(uAxis, vAxis).normalize();
	const centre = new Vector3(body.poseQ.position.xQ / 1e3, body.poseQ.position.yQ / 1e3, body.poseQ.position.zQ / 1e3).addScaledVector(normal, SHED_MAJOR_DEBRIS_HALF_THICKNESS);
	return Object.freeze({
		...surface,
		frame: Object.freeze({
			...surface.frame,
			centre: Object.freeze({
				x: centre.x,
				y: centre.y,
				z: centre.z
			}),
			uAxis: Object.freeze({
				x: uAxis.x,
				y: uAxis.y,
				z: uAxis.z
			}),
			vAxis: Object.freeze({
				x: vAxis.x,
				y: vAxis.y,
				z: vAxis.z
			})
		})
	});
}
function debrisTint(chunkId) {
	const palette = [
		2705975,
		3233344,
		2442035,
		3759173,
		2903866,
		2244655
	];
	let hash = 0;
	for (let index = 0; index < chunkId.length; index += 1) hash = hash * 31 + chunkId.charCodeAt(index) >>> 0;
	return new Color(palette[hash % palette.length]);
}
function regionalDamageTint(markCount) {
	const palette = [
		2505007,
		4608058,
		7691587,
		11639416
	];
	return new Color(palette[Math.max(0, Math.min(palette.length - 1, markCount - 1))]);
}
function presentationTopologySignature(state) {
	return state.surfaces.map((surface) => `${surface.surfaceId}:${surface.stage}:${surface.apertures.map((aperture) => `${aperture.uQ},${aperture.vQ},${aperture.radiusUQ},${aperture.radiusVQ}`).join(";")}`).join("|");
}
var DestructibleShedPresentation = class {
	definition;
	placement;
	retireGeometryAfterFence;
	root = new Group();
	sheetMaterial;
	frameMaterial = new MeshStandardMaterial({
		color: 1516830,
		metalness: .82,
		roughness: .3
	});
	rimMaterial = new MeshStandardMaterial({
		color: 12760734,
		metalness: .92,
		roughness: .22
	});
	dentMaterial = new MeshStandardMaterial({
		color: 16777215,
		metalness: .72,
		roughness: .46,
		side: 2
	});
	debrisMaterial = new MeshStandardMaterial({
		color: 3165499,
		metalness: .74,
		roughness: .42
	});
	bumpTexture = ridgedMetalBumpTexture();
	shell;
	doorHinge = new Group();
	door;
	structuralFrame;
	frameToppled = false;
	apertureRims;
	dents;
	debris;
	retiredGeometries = /* @__PURE__ */ new Set();
	topologySignature = "";
	revision = -1;
	disposed = false;
	gpuPrewarmGeneration = null;
	gpuPrewarmPromise = null;
	constructor(definition, placement, initialState, retireGeometryAfterFence) {
		this.definition = definition;
		this.placement = placement;
		this.retireGeometryAfterFence = retireGeometryAfterFence;
		if (initialState.placementId !== placement.id || placement.definitionId !== definition.id) throw new TypeError("Shed presentation identity mismatch");
		this.root.name = `destructible-shed:${placement.id}`;
		this.root.position.set(placement.position.x, placement.position.y, placement.position.z);
		this.root.rotation.y = placement.yaw;
		this.root.userData.interactiveWorldKind = "destructible-shed";
		this.root.userData.placementId = placement.id;
		this.root.userData.definitionId = definition.id;
		this.root.userData.materialPolicyId = FIELD_SHED_MATERIAL_POLICY_ID;
		this.root.userData.qualityInvariantMajorFragments = true;
		this.sheetMaterial = new MeshStandardMaterial({
			color: 2705975,
			metalness: .76,
			roughness: .36,
			side: 2,
			bumpMap: this.bumpTexture,
			bumpScale: .055
		});
		this.sheetMaterial.name = FIELD_SHED_MATERIAL_IDS.sheet;
		this.frameMaterial.name = FIELD_SHED_MATERIAL_IDS.frame;
		this.rimMaterial.name = FIELD_SHED_MATERIAL_IDS.apertureRim;
		this.dentMaterial.name = FIELD_SHED_MATERIAL_IDS.dent;
		this.debrisMaterial.name = FIELD_SHED_MATERIAL_IDS.debris;
		this.shell = damageableSheetMesh("field-shed-damageable-shell", new BufferGeometry(), this.sheetMaterial);
		this.root.add(this.shell);
		this.doorHinge.name = "field-shed-door-hinge";
		this.door = damageableSheetMesh("field-shed-door-leaf", new BufferGeometry(), this.sheetMaterial);
		this.doorHinge.add(this.door);
		this.root.add(this.doorHinge);
		const frame = createFrame(this.frameMaterial);
		this.structuralFrame = frame;
		this.root.add(frame);
		const floorMaterial = new MeshStandardMaterial({
			color: 4147009,
			metalness: .22,
			roughness: .82
		});
		floorMaterial.name = FIELD_SHED_MATERIAL_IDS.floor;
		const floor = new Mesh(new BoxGeometry(3.5, .1, 4.1), floorMaterial);
		floor.name = "field-shed-floor";
		floor.position.y = .05;
		floor.receiveShadow = true;
		this.root.add(floor);
		this.apertureRims = new InstancedMesh(new TorusGeometry(1, .12, 6, 16), this.rimMaterial, 96);
		this.apertureRims.name = "field-shed-aperture-rims";
		this.apertureRims.count = 0;
		this.root.add(this.apertureRims);
		this.dents = new InstancedMesh(pressedMetalDentGeometry(), this.dentMaterial, 64);
		this.dents.name = "field-shed-dents";
		this.dents.userData.deformationModel = "pressed-metal-geometry-v1";
		this.dents.userData.regionalDamageModel = "persistent-neighbour-density-v1";
		this.dents.userData.regionalRadiusQ = SHED_DAMAGE_REGION_RADIUS_Q;
		this.dents.setColorAt(0, regionalDamageTint(1));
		this.dents.instanceColor.setUsage(DynamicDrawUsage);
		this.dents.instanceColor.needsUpdate = true;
		this.dents.userData.instanceColorPrewarmed = true;
		this.dents.count = 0;
		this.dents.castShadow = true;
		this.dents.receiveShadow = true;
		this.root.add(this.dents);
		this.debris = new InstancedMesh(corrugatedSheetDebrisGeometry(), this.debrisMaterial, 6);
		this.debris.name = "field-shed-major-debris";
		this.debris.userData.geometryKind = "definition-scaled-corrugated-sheet-v1";
		this.debris.userData.authorityClass = "round-persistent-major-fragment";
		this.debris.userData.qualityInvariant = true;
		this.debris.setColorAt(0, debrisTint(definition.preauthoredChunkIds[0]));
		this.debris.instanceColor.setUsage(DynamicDrawUsage);
		this.debris.instanceColor.needsUpdate = true;
		this.debris.userData.instanceColorPrewarmed = true;
		this.debris.count = 0;
		this.debris.castShadow = true;
		this.debris.receiveShadow = true;
		this.root.add(this.debris);
		this.sync(initialState);
	}
	sync(state) {
		if (this.disposed || state.revision === this.revision) return;
		if (state.placementId !== this.placement.id) throw new TypeError("Shed state placement mismatch");
		const doorDefinition = this.definition.surfaces.find((surface) => surface.id === this.definition.doorSurfaceId);
		const doorState = state.surfaces.find((surface) => surface.surfaceId === this.definition.doorSurfaceId);
		if (!doorDefinition || !doorState) throw new TypeError("Shed door definition missing");
		const topologySignature = presentationTopologySignature(state);
		if (topologySignature !== this.topologySignature) {
			const staticGeometries = [];
			for (const surfaceDefinition of this.definition.surfaces) {
				if (surfaceDefinition.role === "door") continue;
				const surfaceState = state.surfaces.find((surface) => surface.surfaceId === surfaceDefinition.id);
				if (!surfaceState || surfaceState.stage === "detached") continue;
				staticGeometries.push(transformedPanelGeometry(surfaceDefinition, surfaceState));
			}
			const shellGeometry = staticGeometries.length > 0 ? mergeGeometries(staticGeometries, false) ?? new BufferGeometry() : new BufferGeometry();
			staticGeometries.forEach((geometry) => geometry.dispose());
			const oldShell = this.shell;
			const oldShellGeometry = oldShell.geometry;
			const nextShell = damageableSheetMesh("field-shed-damageable-shell", shellGeometry, this.sheetMaterial);
			const oldDoor = this.door;
			if (oldShellGeometry.getAttribute("position")) this.retireGeometry(oldShellGeometry);
			else oldShellGeometry.dispose();
			const oldDoorGeometry = oldDoor.geometry;
			const nextDoor = damageableSheetMesh("field-shed-door-leaf", localPanelGeometry(doorDefinition, doorState), this.sheetMaterial);
			nextDoor.visible = doorState.stage !== "detached";
			if (oldDoorGeometry.getAttribute("position")) this.retireGeometry(oldDoorGeometry);
			else oldDoorGeometry.dispose();
			this.root.add(nextShell);
			this.doorHinge.add(nextDoor);
			oldShell.removeFromParent();
			oldDoor.removeFromParent();
			this.shell = nextShell;
			this.door = nextDoor;
			this.topologySignature = topologySignature;
		}
		this.doorHinge.position.set(-doorDefinition.frame.halfU, doorDefinition.frame.centre.y, doorDefinition.frame.centre.z);
		this.door.position.set(doorDefinition.frame.halfU, 0, 0);
		this.doorHinge.rotation.y = -state.door.angleQ / SHED_ANGLE_Q * Math.PI / 2;
		let apertureIndex = 0;
		let dentIndex = 0;
		for (const surfaceState of state.surfaces) {
			const canonicalSurface = this.definition.surfaces.find((surface) => surface.id === surfaceState.surfaceId);
			if (!canonicalSurface) continue;
			const surfaceDefinition = surfaceState.stage === "detached" ? detachedPresentationSurfaceDefinition(canonicalSurface, state) : presentationSurfaceDefinition(canonicalSurface, state.door.angleQ);
			if (!surfaceDefinition) continue;
			const rotation = panelQuaternion(surfaceDefinition);
			if (surfaceState.stage !== "detached") for (const aperture of surfaceState.apertures) {
				if (apertureIndex >= 96) break;
				const scale = new Vector3(aperture.radiusUQ / SHED_PANEL_COORD_Q * surfaceDefinition.frame.halfU, aperture.radiusVQ / SHED_PANEL_COORD_Q * surfaceDefinition.frame.halfV, Math.min(surfaceDefinition.frame.halfU, surfaceDefinition.frame.halfV) * .035);
				placeBoxInstance(this.apertureRims, apertureIndex, apertureLocalPosition(surfaceDefinition, aperture), scale, rotation);
				apertureIndex += 1;
			}
			for (const dent of surfaceState.dents) {
				if (dentIndex >= 64) break;
				const apertureLike = {
					id: dent.id,
					surfaceId: dent.surfaceId,
					uQ: dent.uQ,
					vQ: dent.vQ,
					radiusUQ: dent.radiusQ,
					radiusVQ: dent.radiusQ
				};
				const radius = dent.radiusQ / SHED_PANEL_COORD_Q * Math.min(surfaceDefinition.frame.halfU, surfaceDefinition.frame.halfV);
				const regionalDamage = shedRegionalDamageAt(surfaceState, dent.uQ, dent.vQ);
				const severity = Math.max(1, Math.min(4, regionalDamage.markCount));
				const position = apertureLocalPosition(surfaceDefinition, apertureLike);
				if (severity > 1) {
					const spread = radius * Math.min(.24, (severity - 1) * .07);
					const angle = dent.id * Math.PI * (3 - Math.sqrt(5));
					position.addScaledVector(new Vector3(surfaceDefinition.frame.uAxis.x, surfaceDefinition.frame.uAxis.y, surfaceDefinition.frame.uAxis.z), Math.cos(angle) * spread).addScaledVector(new Vector3(surfaceDefinition.frame.vAxis.x, surfaceDefinition.frame.vAxis.y, surfaceDefinition.frame.vAxis.z), Math.sin(angle) * spread);
				}
				const warpedRadius = radius * (1 + (severity - 1) * .09);
				const depth = (.018 + dent.depthQ / 2500 * .082) * (1 + (severity - 1) * .14);
				placeBoxInstance(this.dents, dentIndex, position, new Vector3(warpedRadius, warpedRadius, depth), rotation);
				this.dents.setColorAt(dentIndex, regionalDamageTint(severity));
				dentIndex += 1;
			}
		}
		this.apertureRims.count = apertureIndex;
		this.apertureRims.instanceMatrix.needsUpdate = true;
		this.dents.count = dentIndex;
		this.dents.instanceMatrix.needsUpdate = true;
		if (this.dents.instanceColor) this.dents.instanceColor.needsUpdate = true;
		this.debris.visible = true;
		this.debris.count = Math.min(state.majorDebris.length, 6);
		state.majorDebris.slice(0, 6).forEach((chunk, index) => {
			const position = new Vector3(chunk.poseQ.position.xQ / 1e3, chunk.poseQ.position.yQ / 1e3, chunk.poseQ.position.zQ / 1e3);
			const rotation = new Quaternion(chunk.poseQ.rotation.xQ / SHED_PANEL_COORD_Q, chunk.poseQ.rotation.yQ / SHED_PANEL_COORD_Q, chunk.poseQ.rotation.zQ / SHED_PANEL_COORD_Q, chunk.poseQ.rotation.wQ / SHED_PANEL_COORD_Q).normalize();
			const extents = shedMajorChunkExtents(this.definition, chunk.chunkId);
			placeBoxInstance(this.debris, index, position, new Vector3(extents.halfU, extents.halfV, 1), rotation);
			this.debris.setColorAt(index, debrisTint(chunk.chunkId));
		});
		this.debris.instanceMatrix.needsUpdate = true;
		if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
		const staticSurfaces = this.definition.surfaces.filter((surface) => surface.role !== "door");
		const allStaticDetached = staticSurfaces.length > 0 && staticSurfaces.every((surfaceDefinition) => state.surfaces.find((surface) => surface.surfaceId === surfaceDefinition.id)?.stage === "detached");
		if (allStaticDetached && !this.frameToppled) {
			placeToppledFrame(this.structuralFrame);
			this.frameToppled = true;
		} else if (!allStaticDetached && this.frameToppled) {
			SHED_FRAME_PLACEMENTS.forEach(([position, scale, rotation], index) => placeBoxInstance(this.structuralFrame, index, position, scale, rotation));
			this.structuralFrame.instanceMatrix.needsUpdate = true;
			this.frameToppled = false;
		}
		this.revision = state.revision;
		this.root.userData.worldRevision = state.revision;
	}
	retireGeometry(geometry) {
		if (this.retireGeometryAfterFence) this.retireGeometryAfterFence(geometry);
		else this.retiredGeometries.add(geometry);
	}
	async prewarm(runtime, camera, sceneGeneration = 0) {
		if (this.gpuPrewarmGeneration === sceneGeneration) return;
		while (this.gpuPrewarmPromise) {
			const pending = this.gpuPrewarmPromise;
			try {
				await pending;
			} catch {
				if (this.gpuPrewarmPromise === pending) this.gpuPrewarmPromise = null;
			}
			if (this.gpuPrewarmGeneration === sceneGeneration) return;
		}
		const operation = this.performGpuPrewarm(runtime, camera, sceneGeneration);
		this.gpuPrewarmPromise = operation;
		try {
			await operation;
		} finally {
			if (this.gpuPrewarmPromise === operation) this.gpuPrewarmPromise = null;
		}
	}
	async performGpuPrewarm(runtime, camera, sceneGeneration) {
		const parentScene = this.root.parent;
		if (!(parentScene instanceof Scene)) throw new Error("Destructible shed presentation must be attached to a scene before prewarm");
		const previousRimsCount = this.apertureRims.count;
		const previousDentsCount = this.dents.count;
		const previousDebrisCount = this.debris.count;
		if (this.apertureRims.count === 0) {
			placeBoxInstance(this.apertureRims, 0, new Vector3(0, 1.5, 0), new Vector3(.5, .5, .05));
			this.apertureRims.count = 1;
			this.apertureRims.instanceMatrix.needsUpdate = true;
		}
		if (this.dents.count === 0) {
			placeBoxInstance(this.dents, 0, new Vector3(0, 1.5, 0), new Vector3(.5, .5, .05));
			this.dents.setColorAt(0, regionalDamageTint(1));
			this.dents.count = 1;
			this.dents.instanceMatrix.needsUpdate = true;
			if (this.dents.instanceColor) this.dents.instanceColor.needsUpdate = true;
		}
		if (this.debris.count === 0) {
			placeBoxInstance(this.debris, 0, new Vector3(0, .1, 0), new Vector3(1, 1, 1));
			this.debris.setColorAt(0, debrisTint(this.definition.preauthoredChunkIds[0] ?? "chunk-0"));
			this.debris.count = 1;
			this.debris.instanceMatrix.needsUpdate = true;
			if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
		}
		try {
			await runtime.compileAndRender(this.root, camera, parentScene);
			this.gpuPrewarmGeneration = sceneGeneration;
		} finally {
			this.apertureRims.count = previousRimsCount;
			this.apertureRims.instanceMatrix.needsUpdate = true;
			this.dents.count = previousDentsCount;
			this.dents.instanceMatrix.needsUpdate = true;
			if (this.dents.instanceColor) this.dents.instanceColor.needsUpdate = true;
			this.debris.count = previousDebrisCount;
			this.debris.instanceMatrix.needsUpdate = true;
			if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
		}
	}
	telemetry(state) {
		const optionalDraws = Number(this.apertureRims.count > 0) + Number(this.dents.count > 0) + Number(this.debris.count > 0);
		return Object.freeze({
			revision: this.revision,
			activeDraws: 4 + optionalDraws,
			apertures: state.surfaces.reduce((sum, surface) => sum + surface.apertures.length, 0),
			dents: state.surfaces.reduce((sum, surface) => sum + surface.dents.length, 0),
			detachedChunks: state.detachedChunkIds.length,
			retiredGeometries: this.retiredGeometries.size,
			frameCollapsed: this.frameToppled,
			prewarmed: this.gpuPrewarmGeneration !== null
		});
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		const geometries = /* @__PURE__ */ new Set();
		const materials = /* @__PURE__ */ new Set();
		this.root.traverse((node) => {
			if (!(node instanceof Mesh)) return;
			geometries.add(node.geometry);
			(Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => materials.add(material));
		});
		geometries.forEach((geometry) => geometry.dispose());
		this.retiredGeometries.forEach((geometry) => geometry.dispose());
		this.retiredGeometries.clear();
		materials.forEach((material) => material.dispose());
		this.bumpTexture.dispose();
		this.root.removeFromParent();
		this.root.clear();
	}
};
/**
* Frozen shared admission budget. New major bodies are rejected in canonical
* source order once a partition is full; authoritative bodies are never
* evicted or hidden to make room for later cosmetic work.
*/
var SHARED_MAJOR_DEBRIS_BUDGET = Object.freeze({
	total: 18,
	shed: 12,
	house: 4,
	window: 2,
	policy: "reject-newest-no-eviction",
	order: Object.freeze([
		"shed",
		"house",
		"window"
	])
});
function validMajorDebrisCounts(counts) {
	return Object.keys(counts).length === 3 && [
		"shed",
		"house",
		"window"
	].every((source) => Number.isSafeInteger(counts[source]) && counts[source] >= 0 && counts[source] <= SHARED_MAJOR_DEBRIS_BUDGET[source]) && counts.shed + counts.house + counts.window <= SHARED_MAJOR_DEBRIS_BUDGET.total;
}
function canAdmitMajorDebris(counts, source) {
	if (!validMajorDebrisCounts(counts)) return false;
	return counts[source] < SHARED_MAJOR_DEBRIS_BUDGET[source] && counts.shed + counts.house + counts.window < SHARED_MAJOR_DEBRIS_BUDGET.total;
}
//#endregion
//#region src/house-destruction.ts
var HOUSE_DESTRUCTION_DEFINITION_SET_ID = "atomic-house-structural-slice-v1";
var HOUSE_MAX_MAJOR_DEBRIS_BODIES = SHARED_MAJOR_DEBRIS_BUDGET.house;
var HOUSE_POSITION_Q = 1e3;
var HOUSE_ROTATION_Q = 1e4;
var ID_PATTERN = /^[a-z0-9][a-z0-9:-]{0,127}$/;
function frozenPoint(x, y, z) {
	return Object.freeze({
		x,
		y,
		z
	});
}
function houseWallFragment(house, suffix) {
	const solid = house.solids.find((candidate) => candidate.id === `${house.id}:${suffix}`);
	if (!solid) throw new TypeError(`Missing canonical house wall ${house.id}:${suffix}`);
	const front = suffix.startsWith("front");
	return Object.freeze({
		id: `${house.id}:wall-${front ? "front" : "rear"}-centre`,
		houseId: house.id,
		role: "wall",
		sourceKind: "architecture-solid",
		sourceId: solid.id,
		profileOwnedPresentation: true,
		position: frozenPoint(...solid.position),
		halfExtents: frozenPoint(solid.size[0] / 2, solid.size[1] / 2, solid.size[2] / 2),
		rotation: Object.freeze({
			x: 0,
			y: 0,
			z: 0,
			w: 1
		}),
		ballisticMaterial: "interior-wall",
		presentationMaterialId: house.team === 0 ? "aqua-wall" : "coral-wall",
		detachDamageQ: 280,
		detachVelocity: frozenPoint(0, 1.4, (front ? 1 : -1) * house.origin.facing * 3.1),
		detachAngularVelocity: frozenPoint(front ? .8 : -.8, .35, house.team === 0 ? -.55 : .55)
	});
}
function houseRoofFragment(house, side) {
	const width = house.dimensions.width + .6;
	const depth = house.dimensions.depth + .6;
	return Object.freeze({
		id: `${house.id}:roof-${side < 0 ? "west" : "east"}-slab`,
		houseId: house.id,
		role: "roof",
		sourceKind: "authored-roof-slab",
		sourceId: `${house.id}:authored-roof-${side < 0 ? "west" : "east"}-slab`,
		profileOwnedPresentation: true,
		position: frozenPoint(house.origin.x + side * width / 4, 7.35, house.origin.z),
		halfExtents: frozenPoint(width / 4, .21, depth / 2),
		rotation: Object.freeze({
			x: 0,
			y: 0,
			z: 0,
			w: 1
		}),
		ballisticMaterial: "wood",
		presentationMaterialId: "roof-shingles",
		detachDamageQ: 360,
		detachVelocity: frozenPoint(side * 1.35, 3.2, house.origin.facing * .45),
		detachAngularVelocity: frozenPoint(house.origin.facing * .4, side * .22, side * .75)
	});
}
function houseFurnitureFragment(house) {
	const side = house.team === 0 ? 1 : -1;
	const lockerSolid = house.solids.find((candidate) => candidate.id === `${house.id}:authored-storage-locker`);
	if (!lockerSolid) throw new TypeError(`Missing canonical locker solid ${house.id}:authored-storage-locker`);
	return Object.freeze({
		id: `${house.id}:furniture-storage-locker`,
		houseId: house.id,
		role: "furniture",
		sourceKind: "authored-furniture",
		sourceId: `${house.id}:authored-storage-locker`,
		profileOwnedPresentation: false,
		position: frozenPoint(lockerSolid.position[0], lockerSolid.position[1], lockerSolid.position[2]),
		halfExtents: frozenPoint(lockerSolid.size[0] / 2, lockerSolid.size[1] / 2, lockerSolid.size[2] / 2),
		rotation: Object.freeze({
			x: 0,
			y: 0,
			z: 0,
			w: 1
		}),
		ballisticMaterial: "thin-metal",
		presentationMaterialId: "storage-locker",
		detachDamageQ: 220,
		detachVelocity: frozenPoint(side * 1.1, 1.75, house.origin.facing * 1.25),
		detachAngularVelocity: frozenPoint(.55, side * .9, -side * .45)
	});
}
/** Exactly five authored cuboids per canonical house; no runtime fracture or CSG. */
function createAtomicHouseFragmentDefinitions(houses) {
	const definitions = houses.flatMap((house) => [
		houseWallFragment(house, "front-ground-centre"),
		houseWallFragment(house, "rear-ground-centre"),
		houseRoofFragment(house, -1),
		houseRoofFragment(house, 1),
		houseFurnitureFragment(house)
	]).sort((left, right) => left.id.localeCompare(right.id));
	const errors = validateHouseFragmentDefinitions(definitions, houses);
	if (errors.length > 0) throw new TypeError(`Invalid Atomic house fragments: ${errors.join("; ")}`);
	return Object.freeze(definitions);
}
function validateHouseFragmentDefinitions(definitions, houses) {
	const errors = [];
	if (definitions.length !== houses.length * 5 || definitions.length > 10) errors.push("exactly five fragments per house within the global definition cap required");
	if (new Set(definitions.map((definition) => definition.id)).size !== definitions.length) errors.push("duplicate fragment id");
	if (definitions.some((definition, index) => index > 0 && definitions[index - 1].id.localeCompare(definition.id) >= 0)) errors.push("fragment definitions must use deterministic id order");
	for (const house of houses) {
		const entries = definitions.filter((definition) => definition.houseId === house.id);
		if (entries.filter((definition) => definition.role === "wall").length !== 2 || entries.filter((definition) => definition.role === "roof").length !== 2 || entries.filter((definition) => definition.role === "furniture").length !== 1) errors.push(`${house.id}: requires two walls, two roof slabs and one furniture fragment`);
	}
	for (const definition of definitions) {
		if (!ID_PATTERN.test(definition.id) || !ID_PATTERN.test(definition.sourceId)) errors.push(`${definition.id}: invalid identity`);
		if (!houses.some((house) => house.id === definition.houseId)) errors.push(`${definition.id}: unknown house`);
		if (![
			definition.position.x,
			definition.position.y,
			definition.position.z,
			definition.halfExtents.x,
			definition.halfExtents.y,
			definition.halfExtents.z,
			definition.rotation.x,
			definition.rotation.y,
			definition.rotation.z,
			definition.rotation.w,
			definition.detachVelocity.x,
			definition.detachVelocity.y,
			definition.detachVelocity.z,
			definition.detachAngularVelocity.x,
			definition.detachAngularVelocity.y,
			definition.detachAngularVelocity.z
		].every(Number.isFinite) || definition.halfExtents.x <= 0 || definition.halfExtents.y <= 0 || definition.halfExtents.z <= 0 || definition.halfExtents.x > 12 || definition.halfExtents.y > 5 || definition.halfExtents.z > 12) errors.push(`${definition.id}: invalid bounded cuboid`);
		if (!Number.isSafeInteger(definition.detachDamageQ) || definition.detachDamageQ < 1 || definition.detachDamageQ > 1e6) errors.push(`${definition.id}: invalid detach threshold`);
		if (definition.role === "wall" !== (definition.sourceKind === "architecture-solid")) errors.push(`${definition.id}: wall/source mismatch`);
		if (definition.role === "roof" !== (definition.sourceKind === "authored-roof-slab")) errors.push(`${definition.id}: roof/source mismatch`);
		if (definition.role === "furniture" !== (definition.sourceKind === "authored-furniture")) errors.push(`${definition.id}: furniture/source mismatch`);
		if (definition.profileOwnedPresentation !== (definition.role !== "furniture")) errors.push(`${definition.id}: invalid profile presentation ownership`);
		if (definition.sourceKind === "architecture-solid") {
			if (!houses.find((candidate) => candidate.id === definition.houseId)?.solids.some((solid) => solid.id === definition.sourceId && solid.collidable && solid.kind === "wall")) errors.push(`${definition.id}: missing collidable architecture source`);
		}
	}
	return Object.freeze(errors);
}
function houseFragmentDefinitionHash(definitions) {
	return canonicalSha256(definitions);
}
function createInitialHouseDestructionState(definitions, matchEpoch) {
	if (!Number.isSafeInteger(matchEpoch) || matchEpoch < 1 || definitions.length < 1 || definitions.length > 10 || new Set(definitions.map((definition) => definition.id)).size !== definitions.length || definitions.some((definition, index) => index > 0 && definitions[index - 1].id.localeCompare(definition.id) >= 0)) throw new TypeError("Invalid initial house destruction state");
	return Object.freeze({
		schemaVersion: 1,
		definitionSetId: HOUSE_DESTRUCTION_DEFINITION_SET_ID,
		definitionHash: houseFragmentDefinitionHash(definitions),
		arenaId: "atomic-acres",
		matchEpoch,
		revision: 0,
		fragments: Object.freeze(definitions.map((definition) => Object.freeze({
			fragmentId: definition.id,
			damageQ: 0,
			stage: "intact"
		}))),
		detachedFragmentIds: Object.freeze([]),
		majorDebris: Object.freeze([])
	});
}
function quantizedPoint(point) {
	return Object.freeze({
		xQ: Math.round(point.x * HOUSE_POSITION_Q),
		yQ: Math.round(point.y * HOUSE_POSITION_Q),
		zQ: Math.round(point.z * HOUSE_POSITION_Q)
	});
}
function initialMajorDebris(definition) {
	return Object.freeze({
		fragmentId: definition.id,
		poseQ: Object.freeze({
			position: quantizedPoint(definition.position),
			rotation: Object.freeze({
				xQ: Math.round(definition.rotation.x * HOUSE_ROTATION_Q),
				yQ: Math.round(definition.rotation.y * HOUSE_ROTATION_Q),
				zQ: Math.round(definition.rotation.z * HOUSE_ROTATION_Q),
				wQ: Math.round(definition.rotation.w * HOUSE_ROTATION_Q)
			})
		}),
		velocityQ: quantizedPoint(definition.detachVelocity),
		angularVelocityQ: quantizedPoint(definition.detachAngularVelocity),
		sleeping: false,
		flat: false
	});
}
function withRevision(state, patch) {
	return Object.freeze({
		...state,
		...patch,
		revision: state.revision + 1
	});
}
function clampQuantizedVelocity(value) {
	return Math.max(-5e7, Math.min(5e7, value));
}
function applyHouseFragmentDamage(definitions, state, request) {
	if (!request.isHost) return {
		accepted: false,
		reason: "not-host",
		state
	};
	if (request.matchEpoch !== state.matchEpoch) return {
		accepted: false,
		reason: "stale-epoch",
		state
	};
	if (request.expectedRevision !== state.revision) return {
		accepted: false,
		reason: "stale-revision",
		state
	};
	const definition = definitions.find((candidate) => candidate.id === request.fragmentId);
	const fragment = state.fragments.find((candidate) => candidate.fragmentId === request.fragmentId);
	if (!definition || !fragment) return {
		accepted: false,
		reason: "unknown-fragment",
		state
	};
	if (fragment.stage === "detached") return {
		accepted: false,
		reason: "already-detached",
		state
	};
	if (!Number.isSafeInteger(request.damageQ) || request.damageQ < 1 || request.damageQ > 1e6) return {
		accepted: false,
		reason: "invalid-impact",
		state
	};
	const damageQ = Math.min(1e6, fragment.damageQ + request.damageQ);
	const detaches = damageQ >= definition.detachDamageQ;
	if (detaches && state.majorDebris.length >= HOUSE_MAX_MAJOR_DEBRIS_BODIES) return {
		accepted: false,
		reason: "shared-major-body-cap",
		state
	};
	const fragments = Object.freeze(state.fragments.map((candidate) => candidate.fragmentId === definition.id ? Object.freeze({
		...candidate,
		damageQ,
		stage: detaches ? "detached" : "damaged"
	}) : candidate));
	if (!detaches) return {
		accepted: true,
		reason: "accepted",
		state: withRevision(state, { fragments })
	};
	return {
		accepted: true,
		reason: "accepted",
		state: withRevision(state, {
			fragments,
			detachedFragmentIds: Object.freeze([...state.detachedFragmentIds, definition.id].sort()),
			majorDebris: Object.freeze([...state.majorDebris, initialMajorDebris(definition)].sort((left, right) => left.fragmentId.localeCompare(right.fragmentId)))
		})
	};
}
function impulseHouseMajorDebris(state, request) {
	if (!request.isHost) return {
		accepted: false,
		reason: "not-host",
		state
	};
	if (request.expectedRevision !== state.revision) return {
		accepted: false,
		reason: "stale-revision",
		state
	};
	const body = state.majorDebris.find((candidate) => candidate.fragmentId === request.fragmentId);
	if (!body) return {
		accepted: false,
		reason: "unknown-fragment",
		state
	};
	if (![
		request.impulseQ.xQ,
		request.impulseQ.yQ,
		request.impulseQ.zQ
	].every((value) => Number.isSafeInteger(value) && Math.abs(value) <= 5e4)) return {
		accepted: false,
		reason: "invalid-impact",
		state
	};
	return {
		accepted: true,
		reason: "accepted",
		state: withRevision(state, { majorDebris: Object.freeze(state.majorDebris.map((candidate) => candidate.fragmentId === body.fragmentId ? Object.freeze({
			...candidate,
			velocityQ: Object.freeze({
				xQ: clampQuantizedVelocity(candidate.velocityQ.xQ + request.impulseQ.xQ),
				yQ: clampQuantizedVelocity(candidate.velocityQ.yQ + request.impulseQ.yQ),
				zQ: clampQuantizedVelocity(candidate.velocityQ.zQ + request.impulseQ.zQ)
			}),
			sleeping: false
		}) : candidate)) })
	};
}
function synchronizeHouseMajorDebris(state, request) {
	if (!request.isHost) return {
		accepted: false,
		reason: "not-host",
		state
	};
	if (request.expectedRevision !== state.revision) return {
		accepted: false,
		reason: "stale-revision",
		state
	};
	if (request.bodies.length !== state.majorDebris.length || state.majorDebris.some((body) => !request.bodies.some((candidate) => candidate.fragmentId === body.fragmentId)) || !request.bodies.every(isHouseMajorDebrisState)) return {
		accepted: false,
		reason: "invalid-impact",
		state
	};
	const majorDebris = Object.freeze([...request.bodies].sort((left, right) => left.fragmentId.localeCompare(right.fragmentId)));
	if (canonicalSha256(majorDebris) === canonicalSha256(state.majorDebris)) return {
		accepted: true,
		reason: "accepted",
		state
	};
	return {
		accepted: true,
		reason: "accepted",
		state: withRevision(state, { majorDebris })
	};
}
function resetHouseDestructionState(state, definitions, nextMatchEpoch) {
	if (!Number.isSafeInteger(nextMatchEpoch) || nextMatchEpoch <= state.matchEpoch) throw new TypeError("House destruction epoch must advance");
	return createInitialHouseDestructionState(definitions, nextMatchEpoch);
}
function isRecord$9(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys$8(value, keys) {
	return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}
function boundedInteger$6(value, min, max) {
	return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}
function isQuantizedVector(value) {
	return isRecord$9(value) && exactKeys$8(value, [
		"xQ",
		"yQ",
		"zQ"
	]) && [
		value.xQ,
		value.yQ,
		value.zQ
	].every((entry) => boundedInteger$6(entry, -5e7, 5e7));
}
function isHouseMajorDebrisState(value) {
	return isRecord$9(value) && exactKeys$8(value, [
		"fragmentId",
		"poseQ",
		"velocityQ",
		"angularVelocityQ",
		"sleeping",
		"flat"
	]) && typeof value.fragmentId === "string" && ID_PATTERN.test(value.fragmentId) && isRecord$9(value.poseQ) && exactKeys$8(value.poseQ, ["position", "rotation"]) && isQuantizedVector(value.poseQ.position) && isRecord$9(value.poseQ.rotation) && exactKeys$8(value.poseQ.rotation, [
		"xQ",
		"yQ",
		"zQ",
		"wQ"
	]) && [
		value.poseQ.rotation.xQ,
		value.poseQ.rotation.yQ,
		value.poseQ.rotation.zQ,
		value.poseQ.rotation.wQ
	].every((entry) => boundedInteger$6(entry, -1e4, 1e4)) && isQuantizedVector(value.velocityQ) && isQuantizedVector(value.angularVelocityQ) && typeof value.sleeping === "boolean" && typeof value.flat === "boolean";
}
function isHouseDestructionState(value) {
	if (!isRecord$9(value) || !exactKeys$8(value, [
		"schemaVersion",
		"definitionSetId",
		"definitionHash",
		"arenaId",
		"matchEpoch",
		"revision",
		"fragments",
		"detachedFragmentIds",
		"majorDebris"
	]) || value.schemaVersion !== 1 || value.definitionSetId !== "atomic-house-structural-slice-v1" || typeof value.definitionHash !== "string" || !/^[a-f0-9]{64}$/.test(value.definitionHash) || value.arenaId !== "atomic-acres" || !boundedInteger$6(value.matchEpoch, 1, Number.MAX_SAFE_INTEGER) || !boundedInteger$6(value.revision, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(value.fragments) || value.fragments.length > 10 || !Array.isArray(value.detachedFragmentIds) || value.detachedFragmentIds.length > HOUSE_MAX_MAJOR_DEBRIS_BODIES || !Array.isArray(value.majorDebris) || value.majorDebris.length > HOUSE_MAX_MAJOR_DEBRIS_BODIES) return false;
	const fragments = value.fragments;
	if (!fragments.every((entry) => isRecord$9(entry) && exactKeys$8(entry, [
		"fragmentId",
		"damageQ",
		"stage"
	]) && typeof entry.fragmentId === "string" && ID_PATTERN.test(entry.fragmentId) && boundedInteger$6(entry.damageQ, 0, 1e6) && [
		"intact",
		"damaged",
		"detached"
	].includes(String(entry.stage)))) return false;
	const fragmentIds = fragments.map((entry) => entry.fragmentId);
	const detachedIds = value.detachedFragmentIds;
	const majorDebris = value.majorDebris;
	if (new Set(fragmentIds).size !== fragmentIds.length || fragmentIds.some((id, index) => index > 0 && fragmentIds[index - 1].localeCompare(id) >= 0) || !detachedIds.every((id) => typeof id === "string" && ID_PATTERN.test(id)) || new Set(detachedIds).size !== detachedIds.length || detachedIds.some((id, index) => index > 0 && String(detachedIds[index - 1]).localeCompare(String(id)) >= 0) || !majorDebris.every(isHouseMajorDebrisState)) return false;
	const detachedFromFragments = fragments.filter((entry) => entry.stage === "detached").map((entry) => entry.fragmentId);
	const debrisIds = majorDebris.map((body) => body.fragmentId);
	return canonicalSha256(detachedIds) === canonicalSha256(detachedFromFragments) && canonicalSha256(detachedIds) === canonicalSha256(debrisIds);
}
function houseDestructionStateMatchesDefinitions(state, definitions) {
	return state.definitionHash === houseFragmentDefinitionHash(definitions) && state.fragments.length === definitions.length && state.fragments.every((fragment, index) => fragment.fragmentId === definitions[index]?.id);
}
//#endregion
//#region src/house-destruction-presentation.ts
var MATERIAL_ORDER = Object.freeze([
	"aqua-wall",
	"coral-wall",
	"roof-shingles",
	"storage-locker"
]);
function createMaterial(id) {
	const material = id === "aqua-wall" ? new MeshStandardMaterial({
		color: 5938069,
		roughness: .76,
		metalness: .04
	}) : id === "coral-wall" ? new MeshStandardMaterial({
		color: 11890270,
		roughness: .76,
		metalness: .04
	}) : id === "roof-shingles" ? new MeshStandardMaterial({
		color: 4937041,
		roughness: .88,
		metalness: .08
	}) : new MeshStandardMaterial({
		color: 3496792,
		roughness: .48,
		metalness: .62
	});
	material.name = `atomic-house-fragment-${id}-v1`;
	return material;
}
function bodyMatrix(definition, state) {
	const body = state.majorDebris.find((candidate) => candidate.fragmentId === definition.id);
	const position = body ? new Vector3(body.poseQ.position.xQ / HOUSE_POSITION_Q, body.poseQ.position.yQ / HOUSE_POSITION_Q, body.poseQ.position.zQ / HOUSE_POSITION_Q) : new Vector3(definition.position.x, definition.position.y, definition.position.z);
	const rotation = body ? new Quaternion(body.poseQ.rotation.xQ / HOUSE_ROTATION_Q, body.poseQ.rotation.yQ / HOUSE_ROTATION_Q, body.poseQ.rotation.zQ / HOUSE_ROTATION_Q, body.poseQ.rotation.wQ / HOUSE_ROTATION_Q).normalize() : new Quaternion(definition.rotation.x, definition.rotation.y, definition.rotation.z, definition.rotation.w).normalize();
	return new Matrix4().compose(position, rotation, new Vector3(definition.halfExtents.x, definition.halfExtents.y, definition.halfExtents.z));
}
/**
* Four bounded instanced draws cover every authored wall, roof and furniture
* cuboid. Major fragments remain scene-level and visible in every quality
* profile; only still-attached geometry already supplied by the Quality GLB
* may be suppressed.
*/
var HouseDestructionPresentation = class {
	definitions;
	root = new Group();
	meshes = /* @__PURE__ */ new Map();
	geometry = new BoxGeometry(2, 2, 2);
	state;
	externalProfileOwnsStaticFragments = false;
	disposed = false;
	gpuPrewarmGeneration = null;
	gpuPrewarmPromise = null;
	constructor(definitions, initialState) {
		this.definitions = definitions;
		if (!houseDestructionStateMatchesDefinitions(initialState, definitions)) throw new TypeError("House destruction presentation definition mismatch");
		this.root.name = "atomic-house-structural-fragments";
		this.root.userData.dynamic = true;
		this.root.userData.authorityClass = "host-owned-preauthored-house-fragments";
		this.root.userData.qualityInvariantMajorFragments = true;
		this.root.userData.arbitraryRuntimeFracture = false;
		this.geometry.name = "atomic-house-preauthored-cuboid-fragment-geometry";
		for (const materialId of MATERIAL_ORDER) {
			const entries = definitions.filter((definition) => definition.presentationMaterialId === materialId);
			if (entries.length === 0) continue;
			const mesh = new InstancedMesh(this.geometry, createMaterial(materialId), entries.length);
			mesh.name = `atomic-house-fragments:${materialId}`;
			mesh.userData.fragmentIds = entries.map((definition) => definition.id);
			mesh.userData.blocksShots = true;
			mesh.userData.qualityInvariantMajorFragments = true;
			mesh.instanceMatrix.setUsage(DynamicDrawUsage);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			this.meshes.set(materialId, mesh);
			this.root.add(mesh);
		}
		this.state = initialState;
		this.sync(initialState);
	}
	sync(state) {
		if (!houseDestructionStateMatchesDefinitions(state, this.definitions)) throw new TypeError("House destruction presentation state mismatch");
		this.state = state;
		for (const materialId of MATERIAL_ORDER) {
			const mesh = this.meshes.get(materialId);
			if (!mesh) continue;
			const entries = this.definitions.filter((definition) => definition.presentationMaterialId === materialId);
			let visibleInstances = 0;
			entries.forEach((definition, index) => {
				const fragmentState = state.fragments.find((fragment) => fragment.fragmentId === definition.id);
				if (this.externalProfileOwnsStaticFragments && definition.profileOwnedPresentation && fragmentState.stage !== "detached") {
					mesh.setMatrixAt(index, new Matrix4().makeScale(0, 0, 0));
					return;
				}
				mesh.setMatrixAt(index, bodyMatrix(definition, state));
				visibleInstances += 1;
			});
			mesh.visible = visibleInstances > 0;
			mesh.userData.visibleInstances = visibleInstances;
			mesh.instanceMatrix.needsUpdate = true;
		}
		this.root.userData.worldRevision = state.revision;
	}
	setExternalProfileOwnsStaticFragments(active) {
		if (this.externalProfileOwnsStaticFragments === active) return;
		this.externalProfileOwnsStaticFragments = active;
		this.sync(this.state);
	}
	raycastMeshes() {
		return Object.freeze([...this.meshes.values()].filter((mesh) => mesh.visible));
	}
	async prewarm(runtime, camera, sceneGeneration = 0) {
		if (this.gpuPrewarmGeneration === sceneGeneration) return;
		while (this.gpuPrewarmPromise) {
			const pending = this.gpuPrewarmPromise;
			try {
				await pending;
			} catch {
				if (this.gpuPrewarmPromise === pending) this.gpuPrewarmPromise = null;
			}
			if (this.gpuPrewarmGeneration === sceneGeneration) return;
		}
		const operation = this.performGpuPrewarm(runtime, camera, sceneGeneration);
		this.gpuPrewarmPromise = operation;
		try {
			await operation;
		} finally {
			if (this.gpuPrewarmPromise === operation) this.gpuPrewarmPromise = null;
		}
	}
	async performGpuPrewarm(runtime, camera, sceneGeneration) {
		const parentScene = this.root.parent;
		if (!(parentScene instanceof Scene)) throw new Error("House destruction presentation must be attached to a scene before prewarm");
		for (const [, mesh] of this.meshes) {
			mesh.visible = true;
			if (mesh.count > 0 && mesh.userData.visibleInstances === 0) {
				mesh.setMatrixAt(0, new Matrix4().makeScale(1, 1, 1));
				mesh.instanceMatrix.needsUpdate = true;
			}
		}
		try {
			await runtime.compileAndRender(this.root, camera, parentScene);
			this.gpuPrewarmGeneration = sceneGeneration;
		} finally {
			this.sync(this.state);
		}
	}
	telemetry() {
		const visibleInstances = [...this.meshes.values()].reduce((sum, mesh) => sum + Number(mesh.userData.visibleInstances ?? 0), 0);
		return Object.freeze({
			fragments: this.definitions.length,
			detached: this.state.detachedFragmentIds.length,
			visibleInstances,
			activeDraws: [...this.meshes.values()].filter((mesh) => mesh.visible).length,
			externalProfileOwnsStaticFragments: this.externalProfileOwnsStaticFragments,
			prewarmed: this.gpuPrewarmGeneration !== null
		});
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		const materials = /* @__PURE__ */ new Set();
		this.meshes.forEach((mesh) => {
			(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => materials.add(material));
		});
		materials.forEach((material) => material.dispose());
		this.geometry.dispose();
		this.root.removeFromParent();
		this.root.clear();
	}
};
//#endregion
//#region src/interactive-world-runtime.ts
function interactiveWorldEnvelopeHash(value) {
	return canonicalSha256(value);
}
function isInteractiveWorldStateEnvelope(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const envelope = value;
	if (Object.keys(envelope).sort().join("|") !== [
		"arenaId",
		"matchEpoch",
		"revision",
		"schemaVersion",
		"sheds",
		"houseDestruction",
		"hashAlgorithm",
		"hash"
	].sort().join("|") || envelope.schemaVersion !== 1 || !isArenaId(envelope.arenaId) || !Number.isSafeInteger(envelope.matchEpoch) || Number(envelope.matchEpoch) < 1 || !Number.isSafeInteger(envelope.revision) || Number(envelope.revision) < 0 || envelope.hashAlgorithm !== "sha256" || typeof envelope.hash !== "string" || !/^[a-f0-9]{64}$/.test(envelope.hash) || !Array.isArray(envelope.sheds) || envelope.sheds.length > 8 || !envelope.sheds.every(isShedState) || !(envelope.houseDestruction === null || isHouseDestructionState(envelope.houseDestruction))) return false;
	const states = envelope.sheds;
	const house = envelope.houseDestruction;
	if (new Set(states.map((state) => state.placementId)).size !== states.length || states.some((state) => state.arenaId !== envelope.arenaId || state.matchEpoch !== envelope.matchEpoch) || house !== null && (envelope.arenaId !== "atomic-acres" || house.matchEpoch !== envelope.matchEpoch) || states.reduce((sum, state) => sum + state.revision, house?.revision ?? 0) !== envelope.revision) return false;
	return interactiveWorldEnvelopeHash(Object.freeze({
		schemaVersion: 1,
		arenaId: envelope.arenaId,
		matchEpoch: Number(envelope.matchEpoch),
		revision: Number(envelope.revision),
		sheds: Object.freeze([...states].sort((left, right) => left.placementId.localeCompare(right.placementId))),
		houseDestruction: house
	})) === envelope.hash;
}
function rotateY(point, yaw) {
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);
	return {
		x: point.x * cos + point.z * sin,
		y: point.y,
		z: -point.x * sin + point.z * cos
	};
}
function transformPoint(point, placement) {
	const rotated = rotateY(point, placement.yaw);
	return {
		x: placement.position.x + rotated.x,
		y: placement.position.y + rotated.y,
		z: placement.position.z + rotated.z
	};
}
function inverseTransformPoint(point, placement) {
	return rotateY({
		x: point.x - placement.position.x,
		y: point.y - placement.position.y,
		z: point.z - placement.position.z
	}, -placement.yaw);
}
function doorFrameAt(surface, angleQ) {
	const angle = -angleQ / SHED_ANGLE_Q * Math.PI / 2;
	const hinge = {
		x: surface.frame.centre.x - surface.frame.uAxis.x * surface.frame.halfU,
		y: surface.frame.centre.y - surface.frame.uAxis.y * surface.frame.halfU,
		z: surface.frame.centre.z - surface.frame.uAxis.z * surface.frame.halfU
	};
	const centreOffset = rotateY({
		x: surface.frame.uAxis.x * surface.frame.halfU,
		y: surface.frame.uAxis.y * surface.frame.halfU,
		z: surface.frame.uAxis.z * surface.frame.halfU
	}, angle);
	return Object.freeze({
		...surface.frame,
		centre: Object.freeze({
			x: hinge.x + centreOffset.x,
			y: hinge.y + centreOffset.y,
			z: hinge.z + centreOffset.z
		}),
		uAxis: Object.freeze(rotateY(surface.frame.uAxis, angle)),
		vAxis: Object.freeze(rotateY(surface.frame.vAxis, angle))
	});
}
function worldFrame(frame, placement) {
	return Object.freeze({
		...frame,
		centre: Object.freeze(transformPoint(frame.centre, placement)),
		uAxis: Object.freeze(rotateY(frame.uAxis, placement.yaw)),
		vAxis: Object.freeze(rotateY(frame.vAxis, placement.yaw))
	});
}
function surfaceFrame(surface, placement, state) {
	return worldFrame(surface.role === "door" ? doorFrameAt(surface, state.door.angleQ) : surface.frame, placement);
}
function frameQuaternion(frame) {
	const u = new Vector3(frame.uAxis.x, frame.uAxis.y, frame.uAxis.z);
	const v = new Vector3(frame.vAxis.x, frame.vAxis.y, frame.vAxis.z);
	const normal = new Vector3().crossVectors(u, v).normalize();
	return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(u, v, normal));
}
function surfaceBounds(frame, thickness = .08) {
	const euler = new Euler().setFromQuaternion(frameQuaternion(frame), "XYZ");
	return Object.freeze({
		minX: frame.centre.x - frame.halfU,
		maxX: frame.centre.x + frame.halfU,
		minY: frame.centre.y - frame.halfV,
		maxY: frame.centre.y + frame.halfV,
		minZ: frame.centre.z - thickness / 2,
		maxZ: frame.centre.z + thickness / 2,
		rotation: [
			euler.x,
			euler.y,
			euler.z
		]
	});
}
function panelCoordinates(frame, point) {
	const offset = {
		x: point.x - frame.centre.x,
		y: point.y - frame.centre.y,
		z: point.z - frame.centre.z
	};
	return Object.freeze({
		uQ: Math.round((offset.x * frame.uAxis.x + offset.y * frame.uAxis.y + offset.z * frame.uAxis.z) / frame.halfU * SHED_PANEL_COORD_Q),
		vQ: Math.round((offset.x * frame.vAxis.x + offset.y * frame.vAxis.y + offset.z * frame.vAxis.z) / frame.halfV * SHED_PANEL_COORD_Q)
	});
}
function closestPanelPoint(frame, point) {
	const offsetX = point.x - frame.centre.x;
	const offsetY = point.y - frame.centre.y;
	const offsetZ = point.z - frame.centre.z;
	const localU = Math.max(-frame.halfU, Math.min(frame.halfU, offsetX * frame.uAxis.x + offsetY * frame.uAxis.y + offsetZ * frame.uAxis.z));
	const localV = Math.max(-frame.halfV, Math.min(frame.halfV, offsetX * frame.vAxis.x + offsetY * frame.vAxis.y + offsetZ * frame.vAxis.z));
	const closestX = frame.centre.x + frame.uAxis.x * localU + frame.vAxis.x * localV;
	const closestY = frame.centre.y + frame.uAxis.y * localU + frame.vAxis.y * localV;
	const closestZ = frame.centre.z + frame.uAxis.z * localU + frame.vAxis.z * localV;
	return Object.freeze({
		distance: Math.hypot(point.x - closestX, point.y - closestY, point.z - closestZ),
		uQ: Math.round(localU / frame.halfU * SHED_PANEL_COORD_Q),
		vQ: Math.round(localV / frame.halfV * SHED_PANEL_COORD_Q)
	});
}
function majorDebrisBounds(shed, body) {
	const centre = transformPoint(new Vector3(body.poseQ.position.xQ / 1e3, body.poseQ.position.yQ / 1e3, body.poseQ.position.zQ / 1e3), shed.placement);
	const localRotation = new Quaternion(body.poseQ.rotation.xQ / SHED_PANEL_COORD_Q, body.poseQ.rotation.yQ / SHED_PANEL_COORD_Q, body.poseQ.rotation.zQ / SHED_PANEL_COORD_Q, body.poseQ.rotation.wQ / SHED_PANEL_COORD_Q).normalize();
	const worldRotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), shed.placement.yaw).multiply(localRotation);
	const euler = new Euler().setFromQuaternion(worldRotation, "XYZ");
	const extents = shedMajorChunkExtents(shed.definition, body.chunkId);
	return Object.freeze({
		minX: centre.x - extents.halfU,
		maxX: centre.x + extents.halfU,
		minY: centre.y - extents.halfV,
		maxY: centre.y + extents.halfV,
		minZ: centre.z - extents.halfThickness,
		maxZ: centre.z + extents.halfThickness,
		rotation: [
			euler.x,
			euler.y,
			euler.z
		]
	});
}
/** Movement capsule radius the host already uses for shed door blockers. */
var PLAYER_CONTACT_RADIUS = .42;
/** Share of the walker's speed one contact tick hands to a panel. */
var PLAYER_CONTACT_TRANSFER = .55;
/** Assumed walk speed when the caller resolves contact without a velocity. */
var PLAYER_CONTACT_NOMINAL_SPEED = 2.4;
/** A boosted or teleporting actor must not fling wreckage across the arena. */
var PLAYER_CONTACT_MAX_SPEED = 6;
/** Below this the shove would be invisible; skipping it stops idle contact spending a revision per tick. */
var PLAYER_CONTACT_MIN_DELTA = .05;
/** Share of a bullet's knock kept as lift once the rest follows the round. */
var BULLET_DEBRIS_LIFT_FRACTION = .25;
function boundsCentre(bounds) {
	return {
		x: (bounds.minX + bounds.maxX) / 2,
		y: ((bounds.minY ?? 0) + (bounds.maxY ?? 0)) / 2,
		z: (bounds.minZ + bounds.maxZ) / 2
	};
}
function clampImpulseComponentQ(value) {
	const clamped = Math.max(-SHED_DEBRIS_IMPULSE_MAX_Q, Math.min(SHED_DEBRIS_IMPULSE_MAX_Q, Math.round(value)));
	return clamped === 0 ? 0 : clamped;
}
/**
* Debris velocity is stored in shed-local space - majorDebrisPhysicsBodies
* rotates it back out by the placement yaw - but every gameplay impulse arrives
* in world space. Every authored placement is yawed +/-PI/2, so passing a world
* impulse straight through knocked debris ninety degrees off the shot. Owner
* 2026-08-30: "its physics to destruction and push need some help".
*/
function shedLocalImpulseQ(impulseQ, placement) {
	const local = rotateY({
		x: impulseQ.xQ,
		y: impulseQ.yQ,
		z: impulseQ.zQ
	}, -placement.yaw);
	return Object.freeze({
		xQ: clampImpulseComponentQ(local.x),
		yQ: clampImpulseComponentQ(local.y),
		zQ: clampImpulseComponentQ(local.z)
	});
}
/**
* Default world-space knock for a bullet that hits loose debris. It used to be
* purely vertical, so a shot panel hopped straight up instead of being driven
* away from the shooter. The round's travel direction is used when the caller
* has it; otherwise the panel centre out through the impact point is the
* incoming ray's outward normal, so its negation is the way the round was
* going. Only a small share stays as lift.
*/
function bulletDebrisImpulseQ(bounds, point, penetrationEnergyQ, direction) {
	const magnitudeQ = Math.max(0, Math.min(SHED_DEBRIS_IMPULSE_MAX_Q, Math.round(penetrationEnergyQ * 20)));
	const liftQ = Math.round(magnitudeQ * BULLET_DEBRIS_LIFT_FRACTION);
	const centre = boundsCentre(bounds);
	const travel = direction ?? {
		x: centre.x - point.x,
		y: 0,
		z: centre.z - point.z
	};
	const horizontal = Math.hypot(travel.x, travel.z);
	if (!(horizontal > 1e-6)) return Object.freeze({
		xQ: 0,
		yQ: liftQ,
		zQ: 0
	});
	return Object.freeze({
		xQ: Math.round(travel.x / horizontal * magnitudeQ),
		yQ: liftQ,
		zQ: Math.round(travel.z / horizontal * magnitudeQ)
	});
}
/**
* World-space shove for one contact tick. The shove tops the panel up to a
* fraction of the walker's speed instead of adding a fixed impulse every tick,
* so sustained contact converges rather than accelerating wreckage across the
* arena, and a panel already leaving faster than the walker is left alone.
*/
function playerContactImpulseQ(body, bodyCentre, placement, actorPosition, actorVelocity) {
	const walkSpeed = actorVelocity ? Math.hypot(actorVelocity.x, actorVelocity.z) : PLAYER_CONTACT_NOMINAL_SPEED;
	if (!Number.isFinite(walkSpeed) || walkSpeed <= PLAYER_CONTACT_MIN_DELTA) return null;
	const towards = actorVelocity && Math.hypot(actorVelocity.x, actorVelocity.z) > PLAYER_CONTACT_MIN_DELTA ? {
		x: actorVelocity.x,
		z: actorVelocity.z
	} : {
		x: bodyCentre.x - actorPosition.x,
		z: bodyCentre.z - actorPosition.z
	};
	const length = Math.hypot(towards.x, towards.z);
	if (!(length > 1e-4)) return null;
	const unitX = towards.x / length;
	const unitZ = towards.z / length;
	const worldVelocity = rotateY({
		x: body.velocityQ.xQ / 1e3,
		y: body.velocityQ.yQ / 1e3,
		z: body.velocityQ.zQ / 1e3
	}, placement.yaw);
	const alreadyLeaving = worldVelocity.x * unitX + worldVelocity.z * unitZ;
	const delta = Math.min(walkSpeed, PLAYER_CONTACT_MAX_SPEED) * PLAYER_CONTACT_TRANSFER - alreadyLeaving;
	if (delta <= PLAYER_CONTACT_MIN_DELTA) return null;
	return Object.freeze({
		xQ: Math.round(unitX * delta * 1e3),
		yQ: 0,
		zQ: Math.round(unitZ * delta * 1e3)
	});
}
function houseBodyId(fragmentId) {
	return `house-debris:${fragmentId}`;
}
function houseFragmentBounds(definition, body) {
	const centre = body ? {
		x: body.poseQ.position.xQ / HOUSE_POSITION_Q,
		y: body.poseQ.position.yQ / HOUSE_POSITION_Q,
		z: body.poseQ.position.zQ / HOUSE_POSITION_Q
	} : definition.position;
	const rotation = body ? new Quaternion(body.poseQ.rotation.xQ / HOUSE_ROTATION_Q, body.poseQ.rotation.yQ / HOUSE_ROTATION_Q, body.poseQ.rotation.zQ / HOUSE_ROTATION_Q, body.poseQ.rotation.wQ / HOUSE_ROTATION_Q).normalize() : new Quaternion(definition.rotation.x, definition.rotation.y, definition.rotation.z, definition.rotation.w).normalize();
	const euler = new Euler().setFromQuaternion(rotation, "XYZ");
	return Object.freeze({
		minX: centre.x - definition.halfExtents.x,
		maxX: centre.x + definition.halfExtents.x,
		minY: centre.y - definition.halfExtents.y,
		maxY: centre.y + definition.halfExtents.y,
		minZ: centre.z - definition.halfExtents.z,
		maxZ: centre.z + definition.halfExtents.z,
		rotation: [
			euler.x,
			euler.y,
			euler.z
		]
	});
}
function worldRevision(sheds, house) {
	return sheds.reduce((sum, shed) => sum + shed.state.revision, house?.state.revision ?? 0);
}
var InteractiveWorldRuntime = class {
	arenaId;
	matchEpoch;
	hostAuthority;
	root = new Group();
	sheds;
	house;
	collisionView;
	disposed = false;
	constructor(arenaId, matchEpoch, placements, hostAuthority, definition = FIELD_SHED_DEFINITION, retireGeometryAfterFence, houseDefinitions = []) {
		this.arenaId = arenaId;
		this.matchEpoch = matchEpoch;
		this.hostAuthority = hostAuthority;
		if (placements.some((placement) => placement.arenaId !== arenaId || placement.definitionId !== definition.id)) throw new TypeError("Interactive-world placement does not match arena/definition");
		if (new Set(placements.map((placement) => placement.id)).size !== placements.length) throw new TypeError("Duplicate interactive-world placement id");
		this.root.name = `interactive-world:${arenaId}`;
		this.root.userData.dynamic = true;
		this.sheds = placements.map((placement) => {
			const state = createInitialShedState(definition, placement, matchEpoch);
			const presentation = new DestructibleShedPresentation(definition, placement, state, retireGeometryAfterFence);
			this.root.add(presentation.root);
			return {
				placement,
				definition,
				state,
				presentation
			};
		});
		if (houseDefinitions.length > 0) {
			if (arenaId !== "atomic-acres") throw new TypeError("House destruction is Atomic Acres only");
			const state = createInitialHouseDestructionState(houseDefinitions, matchEpoch);
			const presentation = new HouseDestructionPresentation(houseDefinitions, state);
			this.root.add(presentation.root);
			this.house = {
				definitions: houseDefinitions,
				state,
				presentation
			};
		} else this.house = null;
		this.collisionView = this.rebuildCollisionView();
	}
	setHostAuthority(hostAuthority) {
		this.hostAuthority = hostAuthority;
	}
	hasHostAuthority() {
		return this.hostAuthority;
	}
	rebuildCollisionView() {
		const movementColliders = [];
		const dynamicColliders = [];
		const ballisticSurfaces = [];
		for (const shed of this.sheds) {
			for (const surface of shed.definition.surfaces) {
				const surfaceState = shed.state.surfaces.find((candidate) => candidate.surfaceId === surface.id);
				if (!surfaceState || surfaceState.stage === "detached") continue;
				const bounds = surfaceBounds(surfaceFrame(surface, shed.placement, shed.state));
				movementColliders.push(bounds);
				dynamicColliders.push(Object.freeze({
					id: `${shed.placement.id}:${surface.id}`,
					bounds
				}));
				ballisticSurfaces.push(Object.freeze({
					id: `${shed.placement.id}:${surface.id}`,
					name: `destructible shed ${surface.id}`,
					bounds,
					material: FIELD_SHED_BALLISTIC_MATERIAL_ID,
					classification: "explicit",
					destructibleSurface: Object.freeze({
						definitionId: shed.definition.id,
						placementId: shed.placement.id,
						surfaceId: surface.id
					})
				}));
			}
			for (const body of shed.state.majorDebris) {
				const bounds = majorDebrisBounds(shed, body);
				movementColliders.push(bounds);
				dynamicColliders.push(Object.freeze({
					id: `${shed.placement.id}:debris:${body.chunkId}`,
					bounds
				}));
				ballisticSurfaces.push(Object.freeze({
					id: `${shed.placement.id}:debris:${body.chunkId}`,
					name: `destructible shed debris ${body.chunkId}`,
					bounds,
					material: FIELD_SHED_BALLISTIC_MATERIAL_ID,
					classification: "explicit",
					majorDebris: Object.freeze({
						placementId: shed.placement.id,
						chunkId: body.chunkId
					})
				}));
			}
		}
		if (this.house) for (const definition of this.house.definitions) {
			const fragment = this.house.state.fragments.find((candidate) => candidate.fragmentId === definition.id);
			if (!fragment) continue;
			const body = this.house.state.majorDebris.find((candidate) => candidate.fragmentId === definition.id);
			const bounds = houseFragmentBounds(definition, body);
			if (fragment.stage !== "detached") {
				const id = `house-fragment:${definition.id}`;
				movementColliders.push(bounds);
				dynamicColliders.push(Object.freeze({
					id,
					bounds
				}));
				ballisticSurfaces.push(Object.freeze({
					id,
					name: `preauthored house ${definition.role} ${definition.id}`,
					bounds,
					material: definition.ballisticMaterial,
					classification: "explicit",
					houseFragment: Object.freeze({
						definitionSetId: HOUSE_DESTRUCTION_DEFINITION_SET_ID,
						fragmentId: definition.id
					})
				}));
				continue;
			}
			if (!body) continue;
			const id = houseBodyId(definition.id);
			movementColliders.push(bounds);
			dynamicColliders.push(Object.freeze({
				id,
				bounds
			}));
			ballisticSurfaces.push(Object.freeze({
				id,
				name: `persistent house major debris ${definition.id}`,
				bounds,
				material: definition.ballisticMaterial,
				classification: "explicit",
				houseMajorDebris: Object.freeze({
					definitionSetId: HOUSE_DESTRUCTION_DEFINITION_SET_ID,
					fragmentId: definition.id
				})
			}));
		}
		return Object.freeze({
			revision: worldRevision(this.sheds, this.house),
			movementColliders: Object.freeze(movementColliders),
			dynamicColliders: Object.freeze(dynamicColliders),
			ballisticSurfaces: Object.freeze(ballisticSurfaces)
		});
	}
	shedStateFitsSharedBudget(shed, state) {
		return this.sheds.reduce((sum, candidate) => sum + (candidate === shed ? 0 : candidate.state.majorDebris.length), 0) + state.majorDebris.length <= SHARED_MAJOR_DEBRIS_BUDGET.shed;
	}
	commit(shed, result) {
		if (!result.accepted) return result;
		if (!this.shedStateFitsSharedBudget(shed, result.state)) return Object.freeze({
			accepted: false,
			reason: "shared-major-body-cap",
			state: shed.state
		});
		shed.state = result.state;
		shed.presentation.sync(shed.state);
		this.collisionView = this.rebuildCollisionView();
		return result;
	}
	commitHouse(result) {
		if (!this.house || !result.accepted) return result;
		if (result.state.majorDebris.length > SHARED_MAJOR_DEBRIS_BUDGET.house) return Object.freeze({
			accepted: false,
			reason: "shared-major-body-cap",
			state: this.house.state
		});
		this.house.state = result.state;
		this.house.presentation.sync(result.state);
		this.collisionView = this.rebuildCollisionView();
		return result;
	}
	collisions() {
		return this.collisionView;
	}
	collisionSnapshot() {
		const body = Object.freeze({
			schemaVersion: 1,
			arenaId: this.arenaId,
			matchEpoch: this.matchEpoch,
			revision: worldRevision(this.sheds, this.house),
			staticDefinitionId: `${this.arenaId}-static-v65`,
			consumers: FIELD_SHED_DEFINITION.consumers,
			sheds: Object.freeze(this.sheds.map((shed) => shed.state).sort((left, right) => left.placementId.localeCompare(right.placementId))),
			houseDestruction: this.house?.state ?? null
		});
		return Object.freeze({
			...body,
			hashAlgorithm: "sha256",
			hash: canonicalSha256(body)
		});
	}
	stateEnvelope() {
		const sheds = Object.freeze(this.sheds.map((shed) => shed.state).sort((left, right) => left.placementId.localeCompare(right.placementId)));
		const body = Object.freeze({
			schemaVersion: 1,
			arenaId: this.arenaId,
			matchEpoch: this.matchEpoch,
			revision: worldRevision(this.sheds, this.house),
			sheds,
			houseDestruction: this.house?.state ?? null
		});
		return Object.freeze({
			...body,
			hashAlgorithm: "sha256",
			hash: interactiveWorldEnvelopeHash(body)
		});
	}
	applyAuthoritativeEnvelope(value) {
		if (!value || typeof value !== "object") return false;
		if (!isInteractiveWorldStateEnvelope(value)) return false;
		const envelope = value;
		if (envelope.arenaId !== this.arenaId || envelope.matchEpoch !== this.matchEpoch || envelope.sheds.length !== this.sheds.length) return false;
		const states = envelope.sheds;
		const houseState = envelope.houseDestruction;
		if (new Set(states.map((state) => state.placementId)).size !== states.length || states.some((state) => state.arenaId !== this.arenaId || state.matchEpoch !== this.matchEpoch) || states.reduce((sum, state) => sum + state.revision, houseState?.revision ?? 0) !== envelope.revision || states.reduce((sum, state) => sum + state.majorDebris.length, 0) > SHARED_MAJOR_DEBRIS_BUDGET.shed || Number(envelope.revision) < worldRevision(this.sheds, this.house) || this.house === null !== (houseState === null)) return false;
		if (this.house && houseState && (!houseDestructionStateMatchesDefinitions(houseState, this.house.definitions) || houseState.majorDebris.length > SHARED_MAJOR_DEBRIS_BUDGET.house || houseState.revision < this.house.state.revision)) return false;
		for (const shed of this.sheds) {
			const state = states.find((candidate) => candidate.placementId === shed.placement.id);
			if (!state || state.shedId !== shed.definition.id) return false;
		}
		for (const shed of this.sheds) {
			shed.state = states.find((candidate) => candidate.placementId === shed.placement.id);
			shed.presentation.sync(shed.state);
		}
		if (this.house && houseState) {
			this.house.state = houseState;
			this.house.presentation.sync(houseState);
		}
		this.collisionView = this.rebuildCollisionView();
		return true;
	}
	step(tick) {
		let changed = false;
		for (const shed of this.sheds) {
			const next = advanceShedDoor(shed.state, tick);
			if (next === shed.state) continue;
			shed.state = next;
			shed.presentation.sync(next);
			changed = true;
		}
		if (changed) this.collisionView = this.rebuildCollisionView();
		return changed;
	}
	nearestDoor(actorPosition) {
		let nearest = null;
		for (const shed of this.sheds) {
			const centre = surfaceFrame(shed.definition.surfaces.find((surface) => surface.id === shed.definition.doorSurfaceId), shed.placement, shed.state).centre;
			const distance = Math.hypot(centre.x - actorPosition.x, centre.y - actorPosition.y, centre.z - actorPosition.z);
			if (!nearest || distance < nearest.distance) nearest = Object.freeze({
				placementId: shed.placement.id,
				centre: Object.freeze({ ...centre }),
				distance
			});
		}
		return nearest;
	}
	doorCollisionStates() {
		return Object.freeze(this.sheds.map((shed) => {
			const door = shed.definition.surfaces.find((surface) => surface.id === shed.definition.doorSurfaceId);
			return Object.freeze({
				placementId: shed.placement.id,
				bounds: surfaceBounds(surfaceFrame(door, shed.placement, shed.state)),
				phase: shed.state.door.phase,
				blockedBy: shed.state.door.blockedBy,
				resumePolicy: shed.state.door.resumePolicy
			});
		}));
	}
	nextInteractionSequence(placementId, actorId) {
		const shed = this.sheds.find((candidate) => candidate.placement.id === placementId);
		if (!shed) return null;
		return (shed.state.interactionSequences.find((entry) => entry.actorId === actorId)?.sequence ?? 0) + 1;
	}
	interactDoor(request) {
		const shed = this.sheds.find((candidate) => candidate.placement.id === request.placementId);
		if (!shed) return null;
		const centre = surfaceFrame(shed.definition.surfaces.find((surface) => surface.id === shed.definition.doorSurfaceId), shed.placement, shed.state).centre;
		const distance = Math.hypot(centre.x - request.actorPosition.x, centre.y - request.actorPosition.y, centre.z - request.actorPosition.z);
		const result = admitShedDoorInteraction(shed.state, {
			isHost: this.hostAuthority,
			matchEpoch: this.matchEpoch,
			expectedRevision: shed.state.revision,
			actorId: request.actorId,
			actorAlive: request.actorAlive,
			sequence: request.sequence,
			distance,
			hasLineOfSight: request.hasLineOfSight(request.actorPosition, centre, this.collisionView),
			tick: request.tick
		});
		return this.commit(shed, result);
	}
	interactNearestDoor(request) {
		const nearest = this.nearestDoor(request.actorPosition);
		if (!nearest) return null;
		return this.interactDoor({
			...request,
			placementId: nearest.placementId
		});
	}
	pushDoorFromPlayerContact(request) {
		const shed = this.sheds.find((candidate) => candidate.placement.id === request.placementId);
		if (!shed) return null;
		return this.commit(shed, pushShedDoorFromPlayerContact(shed.state, {
			isHost: this.hostAuthority,
			expectedRevision: shed.state.revision,
			actorId: request.actorId,
			tick: request.tick
		}));
	}
	/**
	* Host-only contact shove for loose shed debris. impulseMajorShedDebris has
	* carried source 'player-contact' since it was written but nothing ever
	* called it, so walking into a fallen panel did nothing at all (owner
	* 2026-08-30: "push need some help"). Contact resolves against the very
	* bounds rebuildCollisionView publishes as each debris dynamic collider, so
	* what a player can bump is exactly what movement collides with, and the
	* mutation stays behind the same host/revision gate as every other one.
	* Returns the number of bodies actually pushed.
	*/
	pushDebrisFromPlayerContact(request) {
		if (!this.hostAuthority) return 0;
		const radius = request.actorRadius ?? PLAYER_CONTACT_RADIUS;
		if (![
			request.actorPosition.x,
			request.actorPosition.y,
			request.actorPosition.z,
			radius
		].every(Number.isFinite) || radius <= 0) return 0;
		let pushes = 0;
		for (const shed of this.sheds) for (const body of shed.state.majorDebris) {
			if (body.flat) continue;
			const bounds = majorDebrisBounds(shed, body);
			if (!isBlocked(request.actorPosition, [bounds], radius)) continue;
			const worldImpulseQ = playerContactImpulseQ(body, boundsCentre(bounds), shed.placement, request.actorPosition, request.actorVelocity);
			if (!worldImpulseQ) continue;
			if (this.commit(shed, impulseMajorShedDebris(shed.state, {
				isHost: this.hostAuthority,
				expectedRevision: shed.state.revision,
				chunkId: body.chunkId,
				source: "player-contact",
				impulseQ: shedLocalImpulseQ(worldImpulseQ, shed.placement)
			})).accepted) pushes += 1;
		}
		return pushes;
	}
	blockDoor(request) {
		const shed = this.sheds.find((candidate) => candidate.placement.id === request.placementId);
		if (!shed) return null;
		return this.commit(shed, blockShedDoor(shed.state, {
			isHost: this.hostAuthority,
			expectedRevision: shed.state.revision,
			tick: request.tick,
			blocker: {
				kind: request.kind,
				entityId: request.entityId
			}
		}));
	}
	resumeDoor(placementId, tick) {
		const shed = this.sheds.find((candidate) => candidate.placement.id === placementId);
		if (!shed) return null;
		return this.commit(shed, resumeShedDoorWhenClear(shed.state, {
			isHost: this.hostAuthority,
			expectedRevision: shed.state.revision,
			tick
		}));
	}
	applyHouseBulletImpact(request) {
		if (request.surface.houseMajorDebris) {
			if (!this.house || request.surface.houseMajorDebris.definitionSetId !== "atomic-house-structural-slice-v1") return null;
			return this.commitHouse(impulseHouseMajorDebris(this.house.state, {
				isHost: this.hostAuthority,
				expectedRevision: this.house.state.revision,
				fragmentId: request.surface.houseMajorDebris.fragmentId,
				impulseQ: request.impulseQ ?? {
					xQ: 0,
					yQ: Math.min(5e4, request.penetrationEnergyQ * 20),
					zQ: 0
				}
			}));
		}
		if (!request.surface.houseFragment || !this.house || request.surface.houseFragment.definitionSetId !== "atomic-house-structural-slice-v1") return null;
		return this.commitHouse(applyHouseFragmentDamage(this.house.definitions, this.house.state, {
			isHost: this.hostAuthority,
			matchEpoch: this.matchEpoch,
			expectedRevision: this.house.state.revision,
			fragmentId: request.surface.houseFragment.fragmentId,
			damageQ: request.damageQ
		}));
	}
	applyBulletImpact(request) {
		if (request.surface.majorDebris) {
			const shed = this.sheds.find((candidate) => candidate.placement.id === request.surface.majorDebris?.placementId);
			if (!shed) return null;
			const worldImpulseQ = request.impulseQ ?? bulletDebrisImpulseQ(request.surface.bounds, request.point, request.penetrationEnergyQ, request.direction);
			return this.commit(shed, impulseMajorShedDebris(shed.state, {
				isHost: this.hostAuthority,
				expectedRevision: shed.state.revision,
				chunkId: request.surface.majorDebris.chunkId,
				source: "bullet",
				impulseQ: shedLocalImpulseQ(worldImpulseQ, shed.placement)
			}));
		}
		const identity = request.surface.destructibleSurface;
		if (!identity) return null;
		const shed = this.sheds.find((candidate) => candidate.placement.id === identity.placementId);
		const surface = shed?.definition.surfaces.find((candidate) => candidate.id === identity.surfaceId);
		if (!shed || !surface || identity.definitionId !== shed.definition.id) return null;
		const coordinates = panelCoordinates(surfaceFrame(surface, shed.placement, shed.state), request.point);
		const impact = applyShedSheetImpact(shed.definition, shed.state, {
			isHost: this.hostAuthority,
			matchEpoch: this.matchEpoch,
			expectedRevision: shed.state.revision,
			surfaceId: surface.id,
			uQ: coordinates.uQ,
			vQ: coordinates.vQ,
			radiusUQ: request.radiusUQ,
			radiusVQ: request.radiusVQ,
			damageQ: request.damageQ,
			penetrationEnergyQ: request.penetrationEnergyQ
		});
		const impactedState = impact.accepted ? impact.state : shed.state;
		if (surface.role === "door" && impactedState.door.phase !== "blocked" && impactedState.door.direction !== "stationary") {
			const blocked = blockShedDoor(impactedState, {
				isHost: this.hostAuthority,
				expectedRevision: impactedState.revision,
				tick: request.tick,
				blocker: {
					kind: "bullet",
					entityId: `bullet-${this.matchEpoch}-${impactedState.revision + 1}`
				}
			});
			if (blocked.accepted) return this.commit(shed, blocked);
		}
		return this.commit(shed, impact);
	}
	applyExplosion(request) {
		const shed = this.sheds.find((candidate) => candidate.placement.id === request.placementId);
		if (!shed) return null;
		return this.commit(shed, applyShedExplosion(shed.definition, shed.state, {
			isHost: this.hostAuthority,
			matchEpoch: this.matchEpoch,
			expectedRevision: shed.state.revision,
			surfaceId: request.surfaceId,
			damageQ: request.damageQ,
			uQ: request.uQ,
			vQ: request.vQ,
			radiusQ: request.radiusQ
		}));
	}
	applyHouseFragmentDamage(request) {
		if (!this.house) return null;
		return this.commitHouse(applyHouseFragmentDamage(this.house.definitions, this.house.state, {
			isHost: this.hostAuthority,
			matchEpoch: request.matchEpoch ?? this.matchEpoch,
			expectedRevision: request.expectedRevision ?? this.house.state.revision,
			fragmentId: request.fragmentId,
			damageQ: request.damageQ
		}));
	}
	applyExplosionAt(request) {
		if (!this.hostAuthority || ![
			request.origin.x,
			request.origin.y,
			request.origin.z,
			request.radius,
			request.maximumDamageQ,
			request.shedMaximumDamageQ ?? request.maximumDamageQ
		].every(Number.isFinite) || request.radius <= 0 || request.maximumDamageQ < 1 || (request.shedMaximumDamageQ ?? request.maximumDamageQ) < 1) return 0;
		const shedMaximumDamageQ = request.shedMaximumDamageQ ?? request.maximumDamageQ;
		let mutations = 0;
		for (const shed of this.sheds) {
			if (request.shedBlastClass) {
				const localOrigin = inverseTransformPoint(request.origin, shed.placement);
				if (Math.hypot(localOrigin.x, Math.max(0, localOrigin.y - 1.5), localOrigin.z) <= request.radius + 5) {
					const structural = applyShedStructuralBlast(shed.definition, shed.state, {
						isHost: this.hostAuthority,
						matchEpoch: this.matchEpoch,
						expectedRevision: shed.state.revision,
						blastId: `${request.shedBlastClass}-${this.matchEpoch}-${shed.state.revision + 1}`,
						blastClass: request.shedBlastClass,
						originLocal: localOrigin
					});
					if (structural.accepted && this.shedStateFitsSharedBudget(shed, structural.state)) {
						this.commit(shed, structural);
						mutations += 1;
						continue;
					}
				}
			}
			let nextState = shed.state;
			let shedMutations = 0;
			for (const surface of shed.definition.surfaces) {
				const state = nextState.surfaces.find((candidate) => candidate.surfaceId === surface.id);
				if (!state || state.stage === "detached") continue;
				const impact = closestPanelPoint(surfaceFrame(surface, shed.placement, nextState), request.origin);
				if (impact.distance > request.radius) continue;
				const damageQ = Math.max(1, Math.round(shedMaximumDamageQ * (1 - impact.distance / request.radius)));
				const result = applyShedExplosion(shed.definition, nextState, {
					isHost: this.hostAuthority,
					matchEpoch: this.matchEpoch,
					expectedRevision: nextState.revision,
					surfaceId: surface.id,
					damageQ,
					uQ: impact.uQ,
					vQ: impact.vQ
				});
				if (!result.accepted || !this.shedStateFitsSharedBudget(shed, result.state)) continue;
				nextState = result.state;
				shedMutations += 1;
			}
			if (shedMutations > 0) {
				if (this.commit(shed, Object.freeze({
					accepted: true,
					reason: "accepted",
					state: nextState
				})).accepted) mutations += shedMutations;
			}
		}
		if (this.house) for (const definition of this.house.definitions) {
			const fragment = this.house.state.fragments.find((candidate) => candidate.fragmentId === definition.id);
			if (!fragment || fragment.stage === "detached") continue;
			const distance = Math.hypot(definition.position.x - request.origin.x, definition.position.y - request.origin.y, definition.position.z - request.origin.z);
			if (distance > request.radius) continue;
			if (this.applyHouseFragmentDamage({
				fragmentId: definition.id,
				damageQ: Math.max(1, Math.round(request.maximumDamageQ * (1 - distance / request.radius)))
			})?.accepted) mutations += 1;
		}
		return mutations;
	}
	majorDebrisPhysicsBodies() {
		const shedBodies = this.sheds.flatMap((shed) => shed.state.majorDebris.map((body) => {
			const localPosition = {
				x: body.poseQ.position.xQ / 1e3,
				y: body.poseQ.position.yQ / 1e3,
				z: body.poseQ.position.zQ / 1e3
			};
			const localRotation = new Quaternion(body.poseQ.rotation.xQ / SHED_PANEL_COORD_Q, body.poseQ.rotation.yQ / SHED_PANEL_COORD_Q, body.poseQ.rotation.zQ / SHED_PANEL_COORD_Q, body.poseQ.rotation.wQ / SHED_PANEL_COORD_Q).normalize();
			const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), shed.placement.yaw).multiply(localRotation);
			const linearVelocity = rotateY({
				x: body.velocityQ.xQ / 1e3,
				y: body.velocityQ.yQ / 1e3,
				z: body.velocityQ.zQ / 1e3
			}, shed.placement.yaw);
			const angularVelocity = rotateY({
				x: body.angularVelocityQ.xQ / 1e3,
				y: body.angularVelocityQ.yQ / 1e3,
				z: body.angularVelocityQ.zQ / 1e3
			}, shed.placement.yaw);
			const extents = shedMajorChunkExtents(shed.definition, body.chunkId);
			return Object.freeze({
				id: `${shed.placement.id}:debris:${body.chunkId}`,
				position: Object.freeze(transformPoint(localPosition, shed.placement)),
				rotation: Object.freeze({
					x: rotation.x,
					y: rotation.y,
					z: rotation.z,
					w: rotation.w
				}),
				halfExtents: Object.freeze({
					x: extents.halfU,
					y: extents.halfV,
					z: extents.halfThickness
				}),
				linearVelocity: Object.freeze(linearVelocity),
				angularVelocity: Object.freeze(angularVelocity),
				sleeping: body.sleeping
			});
		}));
		const houseBodies = this.house?.state.majorDebris.map((body) => {
			const definition = this.house.definitions.find((candidate) => candidate.id === body.fragmentId);
			return Object.freeze({
				id: houseBodyId(body.fragmentId),
				position: Object.freeze({
					x: body.poseQ.position.xQ / 1e3,
					y: body.poseQ.position.yQ / 1e3,
					z: body.poseQ.position.zQ / 1e3
				}),
				rotation: Object.freeze({
					x: body.poseQ.rotation.xQ / 1e4,
					y: body.poseQ.rotation.yQ / 1e4,
					z: body.poseQ.rotation.zQ / 1e4,
					w: body.poseQ.rotation.wQ / 1e4
				}),
				halfExtents: definition.halfExtents,
				linearVelocity: Object.freeze({
					x: body.velocityQ.xQ / 1e3,
					y: body.velocityQ.yQ / 1e3,
					z: body.velocityQ.zQ / 1e3
				}),
				angularVelocity: Object.freeze({
					x: body.angularVelocityQ.xQ / 1e3,
					y: body.angularVelocityQ.yQ / 1e3,
					z: body.angularVelocityQ.zQ / 1e3
				}),
				sleeping: body.sleeping
			});
		}) ?? [];
		const bodies = [...shedBodies, ...houseBodies].sort((left, right) => left.id.localeCompare(right.id));
		if (shedBodies.length > SHARED_MAJOR_DEBRIS_BUDGET.shed || houseBodies.length > SHARED_MAJOR_DEBRIS_BUDGET.house || bodies.length > SHARED_MAJOR_DEBRIS_BUDGET.shed + SHARED_MAJOR_DEBRIS_BUDGET.house) throw new TypeError("Interactive-world major debris exceeds shared source partitions");
		return Object.freeze(bodies);
	}
	shedMajorBodyCount() {
		return this.sheds.reduce((sum, shed) => sum + shed.state.majorDebris.length, 0);
	}
	houseMajorBodyCount() {
		return this.house?.state.majorDebris.length ?? 0;
	}
	hasDetachedProfileOwnedHouseFragment() {
		if (!this.house) return false;
		return this.house.definitions.some((definition) => definition.profileOwnedPresentation && this.house.state.detachedFragmentIds.includes(definition.id));
	}
	setExternalHouseProfilePresentationActive(active) {
		this.house?.presentation.setExternalProfileOwnsStaticFragments(active);
	}
	housePresentationRaycastMeshes() {
		return this.house?.presentation.raycastMeshes() ?? Object.freeze([]);
	}
	adoptMajorDebrisPhysics(snapshots) {
		if (!this.hostAuthority || snapshots.length > SHARED_MAJOR_DEBRIS_BUDGET.total) return false;
		let changed = false;
		for (const shed of this.sheds) {
			const bodies = shed.state.majorDebris.map((body) => {
				const id = `${shed.placement.id}:debris:${body.chunkId}`;
				const snapshot = snapshots.find((candidate) => candidate.id === id);
				if (!snapshot) return null;
				const localPosition = inverseTransformPoint(snapshot.position, shed.placement);
				const worldRotation = new Quaternion(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z, snapshot.rotation.w).normalize();
				const localRotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -shed.placement.yaw).multiply(worldRotation).normalize();
				const linearVelocity = rotateY(snapshot.linearVelocity, -shed.placement.yaw);
				const angularVelocity = rotateY(snapshot.angularVelocity, -shed.placement.yaw);
				return Object.freeze({
					chunkId: body.chunkId,
					poseQ: Object.freeze({
						position: Object.freeze({
							xQ: Math.round(localPosition.x * 1e3),
							yQ: Math.round(localPosition.y * 1e3),
							zQ: Math.round(localPosition.z * 1e3)
						}),
						rotation: Object.freeze({
							xQ: Math.round(localRotation.x * SHED_PANEL_COORD_Q),
							yQ: Math.round(localRotation.y * SHED_PANEL_COORD_Q),
							zQ: Math.round(localRotation.z * SHED_PANEL_COORD_Q),
							wQ: Math.round(localRotation.w * SHED_PANEL_COORD_Q)
						})
					}),
					velocityQ: Object.freeze({
						xQ: Math.round(linearVelocity.x * 1e3),
						yQ: Math.round(linearVelocity.y * 1e3),
						zQ: Math.round(linearVelocity.z * 1e3)
					}),
					angularVelocityQ: Object.freeze({
						xQ: Math.round(angularVelocity.x * 1e3),
						yQ: Math.round(angularVelocity.y * 1e3),
						zQ: Math.round(angularVelocity.z * 1e3)
					}),
					sleeping: snapshot.sleeping,
					flat: snapshot.flat
				});
			});
			if (bodies.some((body) => body === null)) return false;
			const result = synchronizeMajorShedDebris(shed.state, {
				isHost: true,
				expectedRevision: shed.state.revision,
				bodies
			});
			if (!result.accepted) return false;
			if (result.state !== shed.state) {
				this.commit(shed, result);
				changed = true;
			}
		}
		if (this.house) {
			const bodies = this.house.state.majorDebris.map((body) => {
				const snapshot = snapshots.find((candidate) => candidate.id === houseBodyId(body.fragmentId));
				if (!snapshot) return null;
				const rotation = new Quaternion(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z, snapshot.rotation.w).normalize();
				return Object.freeze({
					fragmentId: body.fragmentId,
					poseQ: Object.freeze({
						position: Object.freeze({
							xQ: Math.round(snapshot.position.x * HOUSE_POSITION_Q),
							yQ: Math.round(snapshot.position.y * HOUSE_POSITION_Q),
							zQ: Math.round(snapshot.position.z * HOUSE_POSITION_Q)
						}),
						rotation: Object.freeze({
							xQ: Math.round(rotation.x * HOUSE_ROTATION_Q),
							yQ: Math.round(rotation.y * HOUSE_ROTATION_Q),
							zQ: Math.round(rotation.z * HOUSE_ROTATION_Q),
							wQ: Math.round(rotation.w * HOUSE_ROTATION_Q)
						})
					}),
					velocityQ: Object.freeze({
						xQ: Math.round(snapshot.linearVelocity.x * HOUSE_POSITION_Q),
						yQ: Math.round(snapshot.linearVelocity.y * HOUSE_POSITION_Q),
						zQ: Math.round(snapshot.linearVelocity.z * HOUSE_POSITION_Q)
					}),
					angularVelocityQ: Object.freeze({
						xQ: Math.round(snapshot.angularVelocity.x * HOUSE_POSITION_Q),
						yQ: Math.round(snapshot.angularVelocity.y * HOUSE_POSITION_Q),
						zQ: Math.round(snapshot.angularVelocity.z * HOUSE_POSITION_Q)
					}),
					sleeping: snapshot.sleeping,
					flat: snapshot.flat
				});
			});
			if (bodies.some((body) => body === null)) return false;
			const result = synchronizeHouseMajorDebris(this.house.state, {
				isHost: true,
				expectedRevision: this.house.state.revision,
				bodies
			});
			if (!result.accepted) return false;
			if (result.state !== this.house.state) {
				this.commitHouse(result);
				changed = true;
			}
		}
		return changed || snapshots.length === 0;
	}
	apertureQuery = (surface, point) => {
		const identity = surface.destructibleSurface;
		if (!identity) return false;
		const shed = this.sheds.find((candidate) => candidate.placement.id === identity.placementId);
		if (!shed || identity.definitionId !== shed.definition.id) return false;
		const surfaceDefinition = shed.definition.surfaces.find((candidate) => candidate.id === identity.surfaceId);
		if (!surfaceDefinition) return false;
		if (surfaceDefinition.role !== "door") return shedApertureContainsWorldPoint(shed.definition, shed.placement, shed.state, identity.surfaceId, point);
		const coordinates = panelCoordinates(surfaceFrame(surfaceDefinition, shed.placement, shed.state), point);
		return shed.state.surfaces.find((candidate) => candidate.surfaceId === identity.surfaceId)?.apertures.some((aperture) => {
			const du = (coordinates.uQ - aperture.uQ) / aperture.radiusUQ;
			const dv = (coordinates.vQ - aperture.vQ) / aperture.radiusVQ;
			return du * du + dv * dv <= 1;
		}) ?? false;
	};
	reset(nextMatchEpoch) {
		if (!Number.isSafeInteger(nextMatchEpoch) || nextMatchEpoch <= this.matchEpoch) throw new TypeError("Interactive-world epoch must advance");
		for (const shed of this.sheds) {
			shed.state = resetShedState(shed.state, nextMatchEpoch, shed.definition, shed.placement);
			shed.presentation.sync(shed.state);
		}
		if (this.house) {
			this.house.state = resetHouseDestructionState(this.house.state, this.house.definitions, nextMatchEpoch);
			this.house.presentation.sync(this.house.state);
		}
		this.matchEpoch = nextMatchEpoch;
		this.collisionView = this.rebuildCollisionView();
	}
	telemetry() {
		const states = this.sheds.map((shed) => shed.state);
		return Object.freeze({
			arenaId: this.arenaId,
			matchEpoch: this.matchEpoch,
			revision: worldRevision(this.sheds, this.house),
			sheds: this.sheds.length,
			apertures: states.reduce((sum, state) => sum + state.surfaces.reduce((surfaceSum, surface) => surfaceSum + surface.apertures.length, 0), 0),
			dents: states.reduce((sum, state) => sum + state.surfaces.reduce((surfaceSum, surface) => surfaceSum + surface.dents.length, 0), 0),
			detachedChunks: states.reduce((sum, state) => sum + state.detachedChunkIds.length, 0),
			awakeMajorBodies: states.reduce((sum, state) => sum + state.majorDebris.filter((body) => !body.sleeping).length, 0) + (this.house?.state.majorDebris.filter((body) => !body.sleeping).length ?? 0),
			movementColliders: this.collisionView.movementColliders.length,
			ballisticSurfaces: this.collisionView.ballisticSurfaces.length,
			presentationDraws: this.sheds.reduce((sum, shed) => sum + shed.presentation.telemetry(shed.state).activeDraws, 0) + (this.house?.presentation.telemetry().activeDraws ?? 0),
			presentationRetiredGeometries: this.sheds.reduce((sum, shed) => sum + shed.presentation.telemetry(shed.state).retiredGeometries, 0),
			houseFragments: this.house?.definitions.length ?? 0,
			houseDetachedFragments: this.house?.state.detachedFragmentIds.length ?? 0,
			houseMajorBodies: this.house?.state.majorDebris.length ?? 0,
			majorBodiesTotal: this.shedMajorBodyCount() + this.houseMajorBodyCount()
		});
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.sheds.forEach((shed) => shed.presentation.dispose());
		this.house?.presentation.dispose();
		this.root.removeFromParent();
		this.root.clear();
	}
};
var MAX_INTERACTIVE_WORLD_MESSAGE_BYTES = 64 * 1024;
function isRecord$8(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys$7(value, expected) {
	return Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}
function canonicalId(value) {
	return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}
function boundedInteger$5(value, min, max = Number.MAX_SAFE_INTEGER) {
	return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}
function withinWireBudget$4(value) {
	try {
		return new TextEncoder().encode(stableStringify(value)).byteLength <= MAX_INTERACTIVE_WORLD_MESSAGE_BYTES;
	} catch {
		return false;
	}
}
function isShedInteractionIntentMessage(value) {
	if (!isRecord$8(value) || !exactKeys$7(value, [
		"type",
		"schemaVersion",
		"by",
		"arenaId",
		"placementId",
		"matchEpoch",
		"lifeId",
		"actionSequence",
		"nonce"
	]) || value.type !== "shed-interact-request" || value.schemaVersion !== 1 || !canonicalId(value.by) || !isArenaId(value.arenaId) || !canonicalId(value.placementId) || !boundedInteger$5(value.matchEpoch, 1) || !boundedInteger$5(value.lifeId, 1) || !boundedInteger$5(value.actionSequence, 1) || !boundedInteger$5(value.nonce, 0, 4294967295)) return false;
	return withinWireBudget$4(value);
}
function isInteractiveWorldSnapshotMessage(value) {
	if (!isRecord$8(value) || !exactKeys$7(value, [
		"type",
		"schemaVersion",
		"by",
		"envelope",
		"nonce"
	]) || value.type !== "interactive-world-snapshot" || value.schemaVersion !== 1 || !canonicalId(value.by) || !isInteractiveWorldStateEnvelope(value.envelope) || !boundedInteger$5(value.nonce, 0, 4294967295)) return false;
	return withinWireBudget$4(value);
}
function isInteractiveWorldProtocolMessage(value) {
	return isShedInteractionIntentMessage(value) || isInteractiveWorldSnapshotMessage(value);
}
var SMOKE_VOLUME_MIN_LIFETIME_MS = 5e3;
var SMOKE_VOLUME_LIFETIME_MS = 1e4;
/**
* Each smoke grenade picks one of these deterministically from its action hash,
* so every deployment reads as a visibly distinct coloured cloud while staying
* replicated identically on every peer. Saturation is deliberately raised over
* the original near-grey set so the colours are actually tellable apart.
*/
var SMOKE_COLOUR_PALETTE = Object.freeze([
	4161430,
	5214563,
	8018598,
	11691327,
	11049532,
	10241376
]);
var SMOKE_CORRIDOR_RADIUS_M = .42;
function finiteTime$1(value) {
	return Number.isFinite(value) && value >= 0;
}
function finiteVec3(value) {
	return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z) && Math.abs(value.x) <= 4096 && Math.abs(value.y) <= 4096 && Math.abs(value.z) <= 4096;
}
function canonicalActorId$6(value) {
	return value.length > 0 && value.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(value);
}
function canonicalResultId(value) {
	return value.length >= 3 && value.length <= 128 && /^[a-zA-Z0-9:_.|-]+$/.test(value);
}
function freezeVec3(value) {
	return Object.freeze({
		x: value.x,
		y: value.y,
		z: value.z
	});
}
function subtract(left, right) {
	return {
		x: left.x - right.x,
		y: left.y - right.y,
		z: left.z - right.z
	};
}
function dot(left, right) {
	return left.x * right.x + left.y * right.y + left.z * right.z;
}
function lengthSquared(value) {
	return dot(value, value);
}
function segmentIntersectsSphere(start, end, centre, radiusM) {
	const segment = subtract(end, start);
	const denominator = lengthSquared(segment);
	if (denominator <= 1e-8) return false;
	const centreOffset = subtract(centre, start);
	const fraction = Math.max(0, Math.min(1, dot(centreOffset, segment) / denominator));
	return lengthSquared(subtract({
		x: start.x + segment.x * fraction,
		y: start.y + segment.y * fraction,
		z: start.z + segment.z * fraction
	}, centre)) <= radiusM * radiusM;
}
function validSegment(segment) {
	if (!Number.isSafeInteger(segment.pelletIndex) || segment.pelletIndex < 0 || segment.pelletIndex >= 12 || !finiteVec3(segment.start) || !finiteVec3(segment.end)) return false;
	const lengthSq = lengthSquared(subtract(segment.end, segment.start));
	return lengthSq > 1e-8 && lengthSq <= 256 ** 2;
}
function freezeCorridor(corridor) {
	return Object.freeze({
		...corridor,
		start: freezeVec3(corridor.start),
		end: freezeVec3(corridor.end)
	});
}
function freezeVolume(volume) {
	return Object.freeze({
		...volume,
		centre: freezeVec3(volume.centre),
		corridors: Object.freeze(volume.corridors.map(freezeCorridor))
	});
}
function freezeSnapshot(snapshot) {
	return Object.freeze({
		...snapshot,
		volumes: Object.freeze(snapshot.volumes.map(freezeVolume))
	});
}
function volumeId(ownerId, actionNonce) {
	return `smoke-${ownerId}-${actionNonce}`;
}
function corridorId(volume, shotResultId, pelletIndex) {
	return `${volume.id}:corridor:${shotResultId}:${pelletIndex}`;
}
function appearanceHash(matchEpoch, ownerId, actionNonce) {
	let hash = (2166136261 ^ matchEpoch ^ actionNonce) >>> 0;
	for (let index = 0; index < ownerId.length; index += 1) {
		hash ^= ownerId.charCodeAt(index);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	hash ^= actionNonce >>> 16;
	return Math.imul(hash, 2246822519) >>> 0;
}
function smokeAppearanceFor(matchEpoch, ownerId, actionNonce) {
	const hash = appearanceHash(matchEpoch, ownerId, actionNonce);
	return Object.freeze({
		lifetimeMs: SMOKE_VOLUME_MIN_LIFETIME_MS + hash % 5001,
		colourHex: SMOKE_COLOUR_PALETTE[(hash >>> 16) % SMOKE_COLOUR_PALETTE.length]
	});
}
var SmokeAuthority = class {
	role;
	matchEpoch;
	revision = 0;
	volumes = /* @__PURE__ */ new Map();
	processedShots = /* @__PURE__ */ new Map();
	rejectedNotHost = 0;
	rejectedWrongEpoch = 0;
	rejectedMalformed = 0;
	rejectedReplay = 0;
	constructor(matchEpoch, role) {
		this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
		this.role = role;
	}
	reset(matchEpoch, role) {
		this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
		this.role = role;
		this.revision = 0;
		this.volumes.clear();
		this.processedShots.clear();
		this.rejectedNotHost = 0;
		this.rejectedWrongEpoch = 0;
		this.rejectedMalformed = 0;
		this.rejectedReplay = 0;
	}
	registerVolume(input) {
		if (this.role !== "host") {
			this.rejectedNotHost += 1;
			return false;
		}
		if (input.matchEpoch !== this.matchEpoch) {
			this.rejectedWrongEpoch += 1;
			return false;
		}
		const radiusM = input.radiusM ?? 4.2;
		const appearance = smokeAppearanceFor(this.matchEpoch, input.ownerId, input.actionNonce);
		const lifetimeMs = input.lifetimeMs ?? appearance.lifetimeMs;
		if (!canonicalActorId$6(input.ownerId) || !Number.isSafeInteger(input.actionNonce) || input.actionNonce < 0 || input.actionNonce > 4294967295 || !finiteVec3(input.centre) || !finiteTime$1(input.startsAtHostTimeMs) || !Number.isFinite(radiusM) || radiusM < .25 || radiusM > 8 || !Number.isFinite(lifetimeMs) || lifetimeMs < 5e3 || lifetimeMs > 1e4) {
			this.rejectedMalformed += 1;
			return false;
		}
		const id = volumeId(input.ownerId, input.actionNonce);
		if (this.volumes.has(id)) return false;
		this.advance(input.startsAtHostTimeMs);
		while (this.volumes.size >= 12) {
			const oldest = [...this.volumes.values()].sort((left, right) => left.startsAtMs - right.startsAtMs || left.id.localeCompare(right.id))[0];
			if (!oldest) break;
			this.volumes.delete(oldest.id);
		}
		this.volumes.set(id, freezeVolume({
			id,
			ownerId: input.ownerId,
			actionNonce: input.actionNonce,
			colourHex: appearance.colourHex,
			centre: input.centre,
			radiusM,
			startsAtMs: input.startsAtHostTimeMs,
			expiresAtMs: input.startsAtHostTimeMs + lifetimeMs,
			corridors: []
		}));
		this.revision += 1;
		return true;
	}
	admitShot(input) {
		const rejected = (reason) => Object.freeze({
			accepted: false,
			reason,
			createdCorridorIds: Object.freeze([])
		});
		if (this.role !== "host") {
			this.rejectedNotHost += 1;
			return rejected("not-host");
		}
		if (input.matchEpoch !== this.matchEpoch) {
			this.rejectedWrongEpoch += 1;
			return rejected("wrong-epoch");
		}
		if (!canonicalResultId(input.shotResultId) || !finiteTime$1(input.resolvedAtHostTimeMs) || input.segments.length < 1 || input.segments.length > 12 || !input.segments.every(validSegment) || new Set(input.segments.map((segment) => segment.pelletIndex)).size !== input.segments.length) {
			this.rejectedMalformed += 1;
			return rejected("malformed");
		}
		this.advance(input.resolvedAtHostTimeMs);
		this.pruneProcessedShots(input.resolvedAtHostTimeMs);
		if (this.processedShots.has(input.shotResultId)) {
			this.rejectedReplay += 1;
			return rejected("replay");
		}
		this.processedShots.set(input.shotResultId, input.resolvedAtHostTimeMs);
		while (this.processedShots.size > 256) this.processedShots.delete(this.processedShots.keys().next().value);
		const createdCorridorIds = [];
		for (const [id, volume] of this.volumes) {
			if (input.resolvedAtHostTimeMs < volume.startsAtMs || input.resolvedAtHostTimeMs >= volume.expiresAtMs) continue;
			const corridors = [...volume.corridors];
			for (const segment of input.segments) {
				if (!segmentIntersectsSphere(segment.start, segment.end, volume.centre, volume.radiusM)) continue;
				const idForCorridor = corridorId(volume, input.shotResultId, segment.pelletIndex);
				if (corridors.some((corridor) => corridor.id === idForCorridor)) continue;
				corridors.push(freezeCorridor({
					id: idForCorridor,
					shotResultId: input.shotResultId,
					pelletIndex: segment.pelletIndex,
					start: segment.start,
					end: segment.end,
					radiusM: SMOKE_CORRIDOR_RADIUS_M,
					createdAtHostTimeMs: input.resolvedAtHostTimeMs,
					expiresAtMs: input.resolvedAtHostTimeMs + 900
				}));
				createdCorridorIds.push(idForCorridor);
			}
			if (corridors.length > 8) corridors.splice(0, corridors.length - 8);
			if (createdCorridorIds.some((corridor) => corridor.startsWith(`${id}:corridor:`))) this.volumes.set(id, freezeVolume({
				...volume,
				corridors
			}));
		}
		if (createdCorridorIds.length > 0) this.revision += 1;
		return Object.freeze({
			accepted: true,
			reason: "accepted",
			createdCorridorIds: Object.freeze(createdCorridorIds)
		});
	}
	/** Host-only pruning. Replicas filter expired state by host time without inventing revisions. */
	advance(nowHostTimeMs) {
		if (this.role !== "host" || !finiteTime$1(nowHostTimeMs)) return false;
		let changed = false;
		for (const [id, volume] of this.volumes) {
			if (nowHostTimeMs >= volume.expiresAtMs) {
				this.volumes.delete(id);
				changed = true;
				continue;
			}
			const corridors = volume.corridors.filter((corridor) => nowHostTimeMs < corridor.expiresAtMs);
			if (corridors.length !== volume.corridors.length) {
				this.volumes.set(id, freezeVolume({
					...volume,
					corridors
				}));
				changed = true;
			}
		}
		this.pruneProcessedShots(nowHostTimeMs);
		if (changed) this.revision += 1;
		return changed;
	}
	snapshot(nowHostTimeMs) {
		if (this.role === "host") this.advance(nowHostTimeMs);
		const volumes = [...this.volumes.values()].filter((volume) => nowHostTimeMs >= volume.startsAtMs && nowHostTimeMs < volume.expiresAtMs).map((volume) => freezeVolume({
			...volume,
			corridors: volume.corridors.filter((corridor) => nowHostTimeMs < corridor.expiresAtMs)
		})).sort((left, right) => left.id.localeCompare(right.id));
		return freezeSnapshot({
			schemaVersion: 2,
			matchEpoch: this.matchEpoch,
			revision: this.revision,
			hostTimeMs: nowHostTimeMs,
			volumes
		});
	}
	applyAuthoritativeSnapshot(snapshot) {
		if (this.role !== "replica") {
			this.rejectedNotHost += 1;
			return false;
		}
		if (snapshot.matchEpoch !== this.matchEpoch) {
			this.rejectedWrongEpoch += 1;
			return false;
		}
		if (snapshot.revision <= this.revision) return false;
		this.volumes.clear();
		for (const volume of snapshot.volumes) this.volumes.set(volume.id, freezeVolume(volume));
		this.revision = snapshot.revision;
		return true;
	}
	telemetry(nowHostTimeMs) {
		const snapshot = this.snapshot(nowHostTimeMs);
		return Object.freeze({
			role: this.role,
			matchEpoch: this.matchEpoch,
			revision: this.revision,
			activeVolumes: snapshot.volumes.length,
			activeCorridors: snapshot.volumes.reduce((total, volume) => total + volume.corridors.length, 0),
			rememberedShots: this.processedShots.size,
			rejectedNotHost: this.rejectedNotHost,
			rejectedWrongEpoch: this.rejectedWrongEpoch,
			rejectedMalformed: this.rejectedMalformed,
			rejectedReplay: this.rejectedReplay
		});
	}
	pruneProcessedShots(nowHostTimeMs) {
		for (const [shotResultId, resolvedAt] of this.processedShots) if (nowHostTimeMs - resolvedAt > 6e4) this.processedShots.delete(shotResultId);
	}
};
//#endregion
//#region src/smoke-protocol.ts
var MAX_SMOKE_STATE_MESSAGE_BYTES = 48 * 1024;
function isRecord$7(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys$6(value, expected) {
	return Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}
function boundedInteger$4(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
	return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function finiteNumber(value, minimum, maximum) {
	return Number.isFinite(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function canonicalActorId$5(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(value);
}
function canonicalEntityId$1(value, maximumLength) {
	return typeof value === "string" && value.length >= 3 && value.length <= maximumLength && /^[a-zA-Z0-9:_.|-]+$/.test(value);
}
function isVec3(value) {
	if (!isRecord$7(value) || !exactKeys$6(value, [
		"x",
		"y",
		"z"
	])) return false;
	return finiteNumber(value.x, -4096, 4096) && finiteNumber(value.y, -4096, 4096) && finiteNumber(value.z, -4096, 4096);
}
function segmentLengthMeters(corridor) {
	return Math.hypot(corridor.end.x - corridor.start.x, corridor.end.y - corridor.start.y, corridor.end.z - corridor.start.z);
}
function isCorridor(value, volume) {
	if (!isRecord$7(value) || !exactKeys$6(value, [
		"id",
		"shotResultId",
		"pelletIndex",
		"start",
		"end",
		"radiusM",
		"createdAtHostTimeMs",
		"expiresAtMs"
	]) || !canonicalEntityId$1(value.id, 256) || !String(value.id).startsWith(`${volume.id}:corridor:`) || !canonicalEntityId$1(value.shotResultId, 128) || !boundedInteger$4(value.pelletIndex, 0, 11) || !isVec3(value.start) || !isVec3(value.end) || !finiteNumber(value.radiusM, .1, 1) || !finiteNumber(value.createdAtHostTimeMs, 0, Number.MAX_SAFE_INTEGER) || !finiteNumber(value.expiresAtMs, 0, Number.MAX_SAFE_INTEGER) || Number(value.expiresAtMs) <= Number(value.createdAtHostTimeMs) || Number(value.expiresAtMs) - Number(value.createdAtHostTimeMs) > 900 || segmentLengthMeters(value) <= 0 || segmentLengthMeters(value) > 256) return false;
	return true;
}
function isVolume(value) {
	if (!isRecord$7(value) || !exactKeys$6(value, [
		"id",
		"ownerId",
		"actionNonce",
		"colourHex",
		"centre",
		"radiusM",
		"startsAtMs",
		"expiresAtMs",
		"corridors"
	]) || !canonicalEntityId$1(value.id, 128) || !canonicalActorId$5(value.ownerId) || value.id !== `smoke-${value.ownerId}-${value.actionNonce}` || !boundedInteger$4(value.actionNonce, 0, 4294967295) || !boundedInteger$4(value.colourHex, 0, 16777215) || !SMOKE_COLOUR_PALETTE.includes(value.colourHex) || !isVec3(value.centre) || !finiteNumber(value.radiusM, .25, 8) || !finiteNumber(value.startsAtMs, 0, Number.MAX_SAFE_INTEGER) || !finiteNumber(value.expiresAtMs, 0, Number.MAX_SAFE_INTEGER) || Number(value.expiresAtMs) <= Number(value.startsAtMs) || Number(value.expiresAtMs) - Number(value.startsAtMs) < 5e3 || Number(value.expiresAtMs) - Number(value.startsAtMs) > 1e4 || !Array.isArray(value.corridors) || value.corridors.length > 8) return false;
	const candidate = value;
	return candidate.corridors.every((corridor) => isCorridor(corridor, candidate)) && new Set(candidate.corridors.map((corridor) => corridor.id)).size === candidate.corridors.length;
}
function isSmokeAuthoritySnapshot(value) {
	if (!isRecord$7(value) || !exactKeys$6(value, [
		"schemaVersion",
		"matchEpoch",
		"revision",
		"hostTimeMs",
		"volumes"
	]) || value.schemaVersion !== 2 || !boundedInteger$4(value.matchEpoch, 1, 1e9) || !boundedInteger$4(value.revision, 0, 1e9) || !finiteNumber(value.hostTimeMs, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(value.volumes) || value.volumes.length > 12 || !value.volumes.every(isVolume)) return false;
	const hostTimeMs = Number(value.hostTimeMs);
	const volumes = value.volumes;
	return new Set(volumes.map((volume) => volume.id)).size === volumes.length && volumes.every((volume) => volume.startsAtMs <= hostTimeMs && hostTimeMs < volume.expiresAtMs && volume.corridors.every((corridor) => corridor.createdAtHostTimeMs <= hostTimeMs && hostTimeMs < corridor.expiresAtMs));
}
function withinWireBudget$3(value) {
	try {
		return new TextEncoder().encode(stableStringify(value)).byteLength <= MAX_SMOKE_STATE_MESSAGE_BYTES;
	} catch {
		return false;
	}
}
function isSmokeStateMessage(value) {
	if (!isRecord$7(value) || !exactKeys$6(value, [
		"type",
		"schemaVersion",
		"by",
		"snapshot",
		"nonce"
	]) || value.type !== "smoke-state" || value.schemaVersion !== 2 || !canonicalActorId$5(value.by) || !isSmokeAuthoritySnapshot(value.snapshot) || !boundedInteger$4(value.nonce, 0, 4294967295)) return false;
	return withinWireBudget$3(value);
}
function isSmokeProtocolMessage(value) {
	return isSmokeStateMessage(value);
}
var FLASH_INTENSITY_QUANTA = 1e3;
var FLASH_MAX_DURATION_MS = 2800;
var FLASH_MAX_ACTIVATION_ID_LENGTH = 128;
function exactKeys$5(value, expected) {
	return Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}
function isRecord$6(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function canonicalActorId$4(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(value);
}
function canonicalEntityId(value, maximumLength = 256) {
	return typeof value === "string" && value.length >= 3 && value.length <= maximumLength && /^[a-zA-Z0-9:_.|-]+$/.test(value);
}
function boundedInteger$3(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
	return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function finiteTime(value) {
	return Number.isFinite(value) && Number(value) >= 0 && Number(value) <= Number.MAX_SAFE_INTEGER;
}
function quantizeIntensity(value) {
	return Math.max(1, Math.min(FLASH_INTENSITY_QUANTA, Math.round(value * FLASH_INTENSITY_QUANTA)));
}
function freezeResult(result) {
	return Object.freeze({ ...result });
}
function flashActivationId(matchEpoch, ownerId, actionNonce) {
	return `flash:${matchEpoch}:${ownerId}:${actionNonce}`;
}
function isFlashResult(value) {
	if (!isRecord$6(value) || !exactKeys$5(value, [
		"schemaVersion",
		"matchEpoch",
		"resultId",
		"activationId",
		"targetId",
		"targetLifeId",
		"sequence",
		"intensityQ",
		"startsAtHostTimeMs",
		"endsAtHostTimeMs"
	]) || value.schemaVersion !== 1 || !boundedInteger$3(value.matchEpoch, 1, 1e9) || !canonicalEntityId(value.resultId) || !canonicalEntityId(value.activationId, FLASH_MAX_ACTIVATION_ID_LENGTH) || !canonicalActorId$4(value.targetId) || !boundedInteger$3(value.targetLifeId, 0, 1e9) || !boundedInteger$3(value.sequence, 1, 1e9) || !boundedInteger$3(value.intensityQ, 1, 1e3) || !finiteTime(value.startsAtHostTimeMs) || !finiteTime(value.endsAtHostTimeMs)) return false;
	const durationMs = Number(value.endsAtHostTimeMs) - Number(value.startsAtHostTimeMs);
	return durationMs >= 1 && durationMs <= 2800;
}
var FlashHostAuthority = class {
	matchEpoch;
	role;
	resolvedActivations = /* @__PURE__ */ new Set();
	sequences = /* @__PURE__ */ new Map();
	rejectedNotHost = 0;
	rejectedWrongEpoch = 0;
	rejectedMalformed = 0;
	rejectedReplay = 0;
	constructor(matchEpoch, role) {
		this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
		this.role = role;
	}
	reset(matchEpoch, role) {
		this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
		this.role = role;
		this.resolvedActivations.clear();
		this.sequences.clear();
		this.rejectedNotHost = 0;
		this.rejectedWrongEpoch = 0;
		this.rejectedMalformed = 0;
		this.rejectedReplay = 0;
	}
	resolveDetonation(input) {
		const rejected = (reason) => Object.freeze({
			accepted: false,
			reason,
			results: Object.freeze([])
		});
		if (this.role !== "host") {
			this.rejectedNotHost += 1;
			return rejected("not-host");
		}
		if (input.matchEpoch !== this.matchEpoch) {
			this.rejectedWrongEpoch += 1;
			return rejected("wrong-epoch");
		}
		if (!canonicalEntityId(input.activationId, FLASH_MAX_ACTIVATION_ID_LENGTH) || !finiteTime(input.startsAtHostTimeMs) || input.victims.length > 16) {
			this.rejectedMalformed += 1;
			return rejected("malformed");
		}
		if (this.resolvedActivations.has(input.activationId)) {
			this.rejectedReplay += 1;
			return rejected("replay");
		}
		const victimKeys = input.victims.map((victim) => `${victim.targetId}:${victim.targetLifeId}`);
		if (new Set(victimKeys).size !== victimKeys.length || input.victims.some((victim) => !canonicalActorId$4(victim.targetId) || !boundedInteger$3(victim.targetLifeId, 0, 1e9) || !Number.isFinite(victim.intensity) || victim.intensity <= 0 || victim.intensity > 1 || !Number.isFinite(victim.durationMs) || victim.durationMs < 1 || victim.durationMs > 2800)) {
			this.rejectedMalformed += 1;
			return rejected("malformed");
		}
		this.resolvedActivations.add(input.activationId);
		const results = input.victims.map((victim) => {
			const victimKey = `${victim.targetId}:${victim.targetLifeId}`;
			const sequence = (this.sequences.get(victimKey) ?? 0) + 1;
			this.sequences.set(victimKey, sequence);
			const durationMs = Math.max(1, Math.min(FLASH_MAX_DURATION_MS, Math.round(victim.durationMs)));
			return freezeResult({
				schemaVersion: 1,
				matchEpoch: this.matchEpoch,
				resultId: `${input.activationId}:target:${victim.targetId}:${victim.targetLifeId}`,
				activationId: input.activationId,
				targetId: victim.targetId,
				targetLifeId: victim.targetLifeId,
				sequence,
				intensityQ: quantizeIntensity(victim.intensity),
				startsAtHostTimeMs: input.startsAtHostTimeMs,
				endsAtHostTimeMs: input.startsAtHostTimeMs + durationMs
			});
		});
		return Object.freeze({
			accepted: true,
			reason: "accepted",
			results: Object.freeze(results)
		});
	}
	telemetry() {
		return Object.freeze({
			role: this.role,
			matchEpoch: this.matchEpoch,
			resolvedActivations: this.resolvedActivations.size,
			victimLives: this.sequences.size,
			rejectedNotHost: this.rejectedNotHost,
			rejectedWrongEpoch: this.rejectedWrongEpoch,
			rejectedMalformed: this.rejectedMalformed,
			rejectedReplay: this.rejectedReplay
		});
	}
};
var FlashVictimResultConsumer = class {
	matchEpoch;
	targetId;
	targetLifeId;
	lastSequence = 0;
	resultIds = /* @__PURE__ */ new Set();
	accepted = 0;
	rejected = {
		malformed: 0,
		"wrong-epoch": 0,
		"wrong-target": 0,
		"stale-life": 0,
		duplicate: 0,
		"out-of-order": 0,
		expired: 0
	};
	constructor(matchEpoch, targetId, targetLifeId) {
		this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
		this.targetId = targetId;
		this.targetLifeId = Math.max(0, Math.floor(targetLifeId));
	}
	reset(matchEpoch, targetId, targetLifeId) {
		this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
		this.targetId = targetId;
		this.targetLifeId = Math.max(0, Math.floor(targetLifeId));
		this.lastSequence = 0;
		this.resultIds.clear();
		this.accepted = 0;
		for (const reason of Object.keys(this.rejected)) this.rejected[reason] = 0;
	}
	admit(result, estimatedHostNowMs) {
		const reject = (reason) => {
			this.rejected[reason] += 1;
			return Object.freeze({
				accepted: false,
				reason,
				intensity: 0,
				remainingDurationMs: 0
			});
		};
		if (!isFlashResult(result) || !finiteTime(estimatedHostNowMs)) return reject("malformed");
		if (result.matchEpoch !== this.matchEpoch) return reject("wrong-epoch");
		if (result.targetId !== this.targetId) return reject("wrong-target");
		if (result.targetLifeId !== this.targetLifeId) return reject("stale-life");
		if (this.resultIds.has(result.resultId)) return reject("duplicate");
		if (result.sequence !== this.lastSequence + 1) return reject("out-of-order");
		this.lastSequence = result.sequence;
		this.resultIds.add(result.resultId);
		while (this.resultIds.size > 64) {
			const oldest = this.resultIds.values().next().value;
			if (oldest === void 0) break;
			this.resultIds.delete(oldest);
		}
		const remainingDurationMs = Math.max(0, result.endsAtHostTimeMs - estimatedHostNowMs);
		if (remainingDurationMs <= 0) return reject("expired");
		this.accepted += 1;
		return Object.freeze({
			accepted: true,
			reason: "accepted",
			intensity: result.intensityQ / FLASH_INTENSITY_QUANTA,
			remainingDurationMs
		});
	}
	telemetry() {
		return Object.freeze({
			matchEpoch: this.matchEpoch,
			targetId: this.targetId,
			targetLifeId: this.targetLifeId,
			lastSequence: this.lastSequence,
			rememberedResults: this.resultIds.size,
			accepted: this.accepted,
			rejected: Object.freeze({ ...this.rejected })
		});
	}
};
//#endregion
//#region src/flash-protocol.ts
function isRecord$5(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys$4(value, expected) {
	return Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}
function canonicalActorId$3(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(value);
}
function isFlashResultMessage(value) {
	if (!isRecord$5(value) || !exactKeys$4(value, [
		"type",
		"schemaVersion",
		"by",
		"forPlayerId",
		"result",
		"nonce"
	]) || value.type !== "flash-result" || value.schemaVersion !== 1 || !canonicalActorId$3(value.by) || !canonicalActorId$3(value.forPlayerId) || !isFlashResult(value.result) || value.forPlayerId !== value.result.targetId || !Number.isSafeInteger(value.nonce) || Number(value.nonce) < 0) return false;
	return true;
}
function isFlashProtocolMessage(value) {
	return isFlashResultMessage(value);
}
//#endregion
//#region src/timed-map-weapon-authority.ts
var TIMED_MAP_WEAPON_IDS = Object.freeze(["flamethrower", "flare-gun"]);
/**
* These are gameplay positions, not decorative placements. RustRig's pickup is
* on the accessible upper deck and Terminal's is on the cabin floor at the
* midpoint of the aircraft aisle.
*/
var TIMED_MAP_WEAPON_DEFINITIONS = Object.freeze({
	flamethrower: Object.freeze({
		weaponId: "flamethrower",
		arenaId: "rustworks-1v1",
		announcement: "RARE WEAPON SPAWNED",
		spawnPosition: Object.freeze([
			.4,
			8.64,
			.2
		]),
		totalShots: 200
	}),
	"flare-gun": Object.freeze({
		weaponId: "flare-gun",
		arenaId: "skyline-terminal",
		announcement: "RARE WEAPON SPAWNED",
		spawnPosition: Object.freeze([
			0,
			3.08,
			2
		]),
		totalShots: 6
	})
});
var PROCESSED_SHOT_LIMIT = 32;
var MAX_PROCESSED_SHOT_ID_LENGTH = 96;
function validGeneration(value) {
	return Number.isSafeInteger(value) && value >= 0;
}
function validHostTime(value) {
	return Number.isFinite(value) && value >= 0;
}
function validPlayerId(value) {
	return value.length > 0 && value.length <= 80;
}
function copyPosition(position) {
	return Object.freeze([
		position[0],
		position[1],
		position[2]
	]);
}
function disabledState(weaponId, generation) {
	const definition = TIMED_MAP_WEAPON_DEFINITIONS[weaponId];
	return Object.freeze({
		generation,
		revision: 0,
		weaponId,
		arenaId: definition.arenaId,
		status: "disabled",
		spawnAtHostTimeMs: null,
		pickupPosition: null,
		holderId: null,
		shotsRemaining: definition.totalShots,
		announcementSent: false,
		processedShotIds: Object.freeze([])
	});
}
/** Host-only initialization. The pickup transition is exactly match midpoint. */
function createTimedMapWeaponAuthority(weaponId, arenaId, matchActiveAtHostTimeMs, matchEndsAtHostTimeMs, generation = 1) {
	const definition = TIMED_MAP_WEAPON_DEFINITIONS[weaponId];
	if (!validGeneration(generation) || arenaId !== definition.arenaId || !validHostTime(matchActiveAtHostTimeMs) || !validHostTime(matchEndsAtHostTimeMs) || matchEndsAtHostTimeMs <= matchActiveAtHostTimeMs) return disabledState(weaponId, validGeneration(generation) ? generation : 0);
	return Object.freeze({
		generation,
		revision: 0,
		weaponId,
		arenaId: definition.arenaId,
		status: "scheduled",
		spawnAtHostTimeMs: matchActiveAtHostTimeMs + (matchEndsAtHostTimeMs - matchActiveAtHostTimeMs) / 2,
		pickupPosition: copyPosition(definition.spawnPosition),
		holderId: null,
		shotsRemaining: definition.totalShots,
		announcementSent: false,
		processedShotIds: Object.freeze([])
	});
}
function advanceTimedMapWeaponAuthority(state, now) {
	if (state.status !== "scheduled" || state.spawnAtHostTimeMs === null || !validHostTime(now) || now < state.spawnAtHostTimeMs) return Object.freeze({
		state,
		spawned: false,
		announcement: null
	});
	const announce = !state.announcementSent;
	const next = Object.freeze({
		...state,
		revision: state.revision + 1,
		status: "available",
		announcementSent: true
	});
	return Object.freeze({
		state: next,
		spawned: true,
		announcement: announce ? TIMED_MAP_WEAPON_DEFINITIONS[state.weaponId].announcement : null
	});
}
function claimTimedMapWeapon(state, playerId, generation) {
	if (state.status !== "available" || state.generation !== generation || !validPlayerId(playerId) || state.shotsRemaining <= 0) return Object.freeze({
		accepted: false,
		state
	});
	return Object.freeze({
		accepted: true,
		state: Object.freeze({
			...state,
			revision: state.revision + 1,
			status: "held",
			pickupPosition: null,
			holderId: playerId
		})
	});
}
/** Secure Gun Range station grant; never valid from a normal map or guest. */
function grantTrainingTimedMapWeapon(state, playerId, context) {
	if (!validPlayerId(playerId) || context.arenaId !== "gun-range" || context.stationKind !== "secure-test-bay" || context.authorityRole !== "offline" && context.authorityRole !== "host") return Object.freeze({
		accepted: false,
		state
	});
	const definition = TIMED_MAP_WEAPON_DEFINITIONS[state.weaponId];
	return Object.freeze({
		accepted: true,
		state: Object.freeze({
			...state,
			revision: state.revision + 1,
			status: "held",
			spawnAtHostTimeMs: null,
			pickupPosition: null,
			holderId: playerId,
			shotsRemaining: definition.totalShots,
			announcementSent: true,
			processedShotIds: Object.freeze([])
		})
	});
}
/**
* Host-owned finite-ammunition seal for the two timed pickups. A duplicate
* client request cannot consume a second round, and a non-holder cannot fire.
*/
function consumeTimedMapWeaponShot(state, playerId, shotId) {
	const base = {
		state,
		accepted: false,
		duplicate: false
	};
	if (!validPlayerId(playerId) || shotId.length < 8 || shotId.length > MAX_PROCESSED_SHOT_ID_LENGTH) return Object.freeze({
		...base,
		reason: "invalid"
	});
	if (state.processedShotIds.includes(shotId)) return Object.freeze({
		...base,
		duplicate: true,
		reason: "duplicate"
	});
	if (state.holderId !== playerId || state.status !== "held" && state.status !== "depleted") return Object.freeze({
		...base,
		reason: "not-holder"
	});
	if (state.shotsRemaining <= 0) return Object.freeze({
		...base,
		reason: "empty"
	});
	const shotsRemaining = state.shotsRemaining - 1;
	return Object.freeze({
		accepted: true,
		duplicate: false,
		reason: "accepted",
		state: Object.freeze({
			...state,
			revision: state.revision + 1,
			status: shotsRemaining === 0 ? "depleted" : "held",
			shotsRemaining,
			processedShotIds: Object.freeze([...state.processedShotIds, shotId].slice(-32))
		})
	});
}
function dropTimedMapWeapon(state, playerId, position) {
	if (state.holderId !== playerId || state.status !== "held" && state.status !== "depleted" || position.length !== 3 || !position.every(Number.isFinite)) return Object.freeze({
		dropped: false,
		state
	});
	if (state.status === "depleted" || state.shotsRemaining <= 0) return Object.freeze({
		dropped: true,
		state: Object.freeze({
			...state,
			revision: state.revision + 1,
			status: "depleted",
			pickupPosition: null,
			holderId: null,
			shotsRemaining: 0
		})
	});
	return Object.freeze({
		dropped: true,
		state: Object.freeze({
			...state,
			revision: state.revision + 1,
			status: "available",
			pickupPosition: copyPosition(position),
			holderId: null
		})
	});
}
function isStaleTimedMapWeaponAuthority(current, incoming) {
	return current.weaponId !== incoming.weaponId || incoming.generation < current.generation || incoming.generation === current.generation && incoming.revision < current.revision;
}
function exactKeys$3(value, expected) {
	const keys = Object.keys(value).sort();
	return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}
/** Strict decoder used by the multiplayer protocol; unknown fields fail closed. */
function isTimedMapWeaponAuthorityState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const state = value;
	if (!exactKeys$3(state, [
		"generation",
		"revision",
		"weaponId",
		"arenaId",
		"status",
		"spawnAtHostTimeMs",
		"pickupPosition",
		"holderId",
		"shotsRemaining",
		"announcementSent",
		"processedShotIds"
	])) return false;
	if (!TIMED_MAP_WEAPON_IDS.includes(state.weaponId)) return false;
	const definition = TIMED_MAP_WEAPON_DEFINITIONS[state.weaponId];
	const pickupPosition = state.pickupPosition;
	const processedShotIds = state.processedShotIds;
	return state.arenaId === definition.arenaId && validGeneration(Number(state.generation)) && Number.isSafeInteger(state.revision) && Number(state.revision) >= 0 && [
		"disabled",
		"scheduled",
		"available",
		"held",
		"depleted"
	].includes(String(state.status)) && (state.spawnAtHostTimeMs === null || validHostTime(Number(state.spawnAtHostTimeMs))) && (pickupPosition === null || Array.isArray(pickupPosition) && pickupPosition.length === 3 && pickupPosition.every(Number.isFinite)) && (state.holderId === null || typeof state.holderId === "string" && validPlayerId(state.holderId)) && Number.isSafeInteger(state.shotsRemaining) && Number(state.shotsRemaining) >= 0 && Number(state.shotsRemaining) <= definition.totalShots && typeof state.announcementSent === "boolean" && Array.isArray(processedShotIds) && processedShotIds.length <= PROCESSED_SHOT_LIMIT && processedShotIds.every((shotId) => typeof shotId === "string" && shotId.length >= 8 && shotId.length <= MAX_PROCESSED_SHOT_ID_LENGTH) && new Set(processedShotIds).size === processedShotIds.length && (state.status !== "scheduled" || state.spawnAtHostTimeMs !== null && pickupPosition !== null && state.holderId === null) && (state.status !== "available" || pickupPosition !== null && state.holderId === null && Number(state.shotsRemaining) > 0) && (state.status !== "held" || pickupPosition === null && typeof state.holderId === "string" && Number(state.shotsRemaining) > 0) && (state.status !== "depleted" || pickupPosition === null && Number(state.shotsRemaining) === 0) && (state.status !== "disabled" || state.spawnAtHostTimeMs === null && pickupPosition === null && state.holderId === null);
}
var MAX_TIMED_MAP_WEAPON_MESSAGE_BYTES = 16 * 1024;
function isRecord$4(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys$2(value, expected) {
	return Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}
function canonicalActorId$2(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(value);
}
function boundedInteger$2(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
	return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function isPosition$2(value) {
	return Array.isArray(value) && value.length === 3 && value.every((entry) => Number.isFinite(entry) && Number(entry) >= -4096 && Number(entry) <= 4096);
}
function withinWireBudget$2(value) {
	try {
		return new TextEncoder().encode(stableStringify(value)).byteLength <= MAX_TIMED_MAP_WEAPON_MESSAGE_BYTES;
	} catch {
		return false;
	}
}
function isTimedMapWeaponClaimRequestMessage(value) {
	if (!isRecord$4(value) || !exactKeys$2(value, [
		"type",
		"schemaVersion",
		"by",
		"weaponId",
		"generation",
		"position",
		"nonce"
	]) || value.type !== "timed-map-weapon-claim-request" || value.schemaVersion !== 1 || !canonicalActorId$2(value.by) || !TIMED_MAP_WEAPON_IDS.includes(value.weaponId) || !boundedInteger$2(value.generation, 0, 1e9) || !isPosition$2(value.position) || !boundedInteger$2(value.nonce, 0)) return false;
	return withinWireBudget$2(value);
}
function isTimedMapWeaponStateMessage(value) {
	if (!isRecord$4(value) || !exactKeys$2(value, [
		"type",
		"schemaVersion",
		"by",
		"states",
		"nonce"
	]) || value.type !== "timed-map-weapon-state" || value.schemaVersion !== 1 || !canonicalActorId$2(value.by) || !isRecord$4(value.states) || !boundedInteger$2(value.nonce, 0)) return false;
	const states = value.states;
	if (!exactKeys$2(states, TIMED_MAP_WEAPON_IDS) || !TIMED_MAP_WEAPON_IDS.every((weaponId) => {
		const state = states[weaponId];
		return isTimedMapWeaponAuthorityState(state) && state.weaponId === weaponId;
	})) return false;
	return withinWireBudget$2(value);
}
function isTimedMapWeaponProtocolMessage(value) {
	return isTimedMapWeaponClaimRequestMessage(value) || isTimedMapWeaponStateMessage(value);
}
Object.freeze([
	"carpet-bomber-napalm",
	"flare-gun-burn",
	"flamethrower-ground-fire"
]);
var ALL_FLAME_TARGET_RELATIONS = Object.freeze([
	"self",
	"friendly",
	"enemy"
]);
function profile(id) {
	const previousDamagePerSecond = 10;
	return Object.freeze({
		id,
		previousDamagePerSecond,
		multiplier: 2,
		damagePerSecond: previousDamagePerSecond * 2,
		affectedRelations: ALL_FLAME_TARGET_RELATIONS
	});
}
/**
* HF-279 freezes the preceding source-specific fire lanes at 10 DPS, then
* applies one exact 2x balance change. Direct Flare impact, Flamethrower
* stream-hit and Carpet Bomber blast damage deliberately live outside this
* catalog and do not inherit the burn multiplier.
*/
var FLAME_DAMAGE_CATALOG = Object.freeze({
	"carpet-bomber-napalm": profile("carpet-bomber-napalm"),
	"flare-gun-burn": profile("flare-gun-burn"),
	"flamethrower-ground-fire": profile("flamethrower-ground-fire")
});
function flameDamagePerPulse(source, intervalMs = 500) {
	if (!Number.isFinite(intervalMs) || intervalMs <= 0) return 0;
	return FLAME_DAMAGE_CATALOG[source].damagePerSecond * intervalMs / 1e3;
}
function flameTargetRelation(ownerId, ownerTeam, targetId, targetTeam) {
	if (!ownerId || !targetId) return null;
	if (ownerId === targetId) return "self";
	return ownerTeam === targetTeam ? "friendly" : "enemy";
}
function flameDamageAllowsTarget(source, ownerId, ownerTeam, targetId, targetTeam) {
	const relation = flameTargetRelation(ownerId, ownerTeam, targetId, targetTeam);
	return relation !== null && FLAME_DAMAGE_CATALOG[source].affectedRelations.includes(relation);
}
Object.freeze({
	"carpet-bomber-napalm": Object.freeze({
		previousDamagePerSecond: 10,
		multiplier: 2,
		damagePerSecond: 20
	}),
	"flare-gun-burn": Object.freeze({
		previousDamagePerSecond: 10,
		multiplier: 2,
		damagePerSecond: 20
	}),
	"flamethrower-ground-fire": Object.freeze({
		previousDamagePerSecond: 10,
		multiplier: 2,
		damagePerSecond: 20
	})
});
//#endregion
//#region src/special-weapon-effects.ts
var FLAMETHROWER_EFFECT = Object.freeze({
	rangeM: 18,
	streamRadiusM: .58,
	particleLifetimeMs: 520,
	poolCapacity: 96,
	maximumActiveParticles: 72
});
var FLARE_PROJECTILE_EFFECT = Object.freeze({
	speedMps: 52,
	gravityMps2: 5.4,
	collisionRadiusM: .24,
	maximumFlightMs: 5500,
	burnDurationMs: 5e3,
	directDamage: 42,
	burnRadiusM: 3.4,
	burnDamagePerSecond: FLAME_DAMAGE_CATALOG["flare-gun-burn"].damagePerSecond,
	poolCapacity: 12
});
function finiteTriplet(value) {
	return value.length === 3 && value.every(Number.isFinite);
}
/** Fixed-step-compatible ballistic integration shared by host and presentation. */
function advanceFlareProjectileKinematics(state, deltaSeconds) {
	if (!finiteTriplet(state.position) || !finiteTriplet(state.velocity) || !Number.isFinite(state.ageMs) || state.ageMs < 0 || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || deltaSeconds > .1) return state;
	const [x, y, z] = state.position;
	const [vx, vy, vz] = state.velocity;
	const nextVy = vy - FLARE_PROJECTILE_EFFECT.gravityMps2 * deltaSeconds;
	return Object.freeze({
		position: Object.freeze([
			x + vx * deltaSeconds,
			y + nextVy * deltaSeconds,
			z + vz * deltaSeconds
		]),
		velocity: Object.freeze([
			vx,
			nextVy,
			vz
		]),
		ageMs: state.ageMs + deltaSeconds * 1e3
	});
}
/** Flat non-explosive fire DPS while a target remains inside the admitted radius. */
function flareBurnDamagePerSecond(distanceM) {
	if (!Number.isFinite(distanceM) || distanceM < 0 || distanceM >= FLARE_PROJECTILE_EFFECT.burnRadiusM) return 0;
	return FLARE_PROJECTILE_EFFECT.burnDamagePerSecond;
}
var MAX_FLARE_PRESENTATION_REPLICAS = FLARE_PROJECTILE_EFFECT.poolCapacity;
var MAX_FLARE_PRESENTATION_MESSAGE_BYTES = 8 * 1024;
function isRecord$3(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys$1(value, expected) {
	const actual = Object.keys(value).sort();
	const canonical = [...expected].sort();
	return actual.length === canonical.length && actual.every((key, index) => key === canonical[index]);
}
function canonicalActorId$1(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(value);
}
function boundedInteger$1(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
	return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function boundedFinite(value, minimum, maximum) {
	return Number.isFinite(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function isPosition$1(value) {
	return Array.isArray(value) && value.length === 3 && value.every((entry) => boundedFinite(entry, -4096, 4096));
}
function isFlightVelocity(value) {
	if (!Array.isArray(value) || value.length !== 3 || !value.every((entry) => boundedFinite(entry, -96, 96))) return false;
	const speed = Math.hypot(Number(value[0]), Number(value[1]), Number(value[2]));
	return speed > .01 && speed <= 96;
}
function flarePresentationReplicaKey(value) {
	return `${value.ownerId}:${value.actionNonce}`;
}
function compareFlarePresentationReplicaIdentity(left, right) {
	if (left.ownerId < right.ownerId) return -1;
	if (left.ownerId > right.ownerId) return 1;
	return left.actionNonce - right.actionNonce;
}
function isFlarePresentationReplicaSnapshot(value) {
	if (!isRecord$3(value) || !exactKeys$1(value, [
		"ownerId",
		"ownerTeam",
		"actionNonce",
		"phase",
		"position",
		"velocity",
		"remainingMs"
	]) || !canonicalActorId$1(value.ownerId) || value.ownerTeam !== 0 && value.ownerTeam !== 1 || !boundedInteger$1(value.actionNonce, 0) || value.phase !== "flight" && value.phase !== "burn" || !isPosition$1(value.position)) return false;
	if (value.phase === "flight") return isFlightVelocity(value.velocity) && boundedFinite(value.remainingMs, Number.MIN_VALUE, FLARE_PROJECTILE_EFFECT.maximumFlightMs);
	return value.velocity === null && boundedFinite(value.remainingMs, Number.MIN_VALUE, FLARE_PROJECTILE_EFFECT.burnDurationMs);
}
function canonicalizeFlarePresentationReplicas(values) {
	if (!Array.isArray(values) || values.length > MAX_FLARE_PRESENTATION_REPLICAS || !values.every(isFlarePresentationReplicaSnapshot)) return null;
	if (new Set(values.map(flarePresentationReplicaKey)).size !== values.length) return null;
	return Object.freeze(values.map((value) => Object.freeze({
		...value,
		position: Object.freeze([...value.position]),
		velocity: value.velocity ? Object.freeze([...value.velocity]) : null
	})).sort(compareFlarePresentationReplicaIdentity));
}
function isCanonicalReplicaSequence(values) {
	for (let index = 1; index < values.length; index += 1) if (compareFlarePresentationReplicaIdentity(values[index - 1], values[index]) >= 0) return false;
	return true;
}
function withinWireBudget$1(value) {
	try {
		return new TextEncoder().encode(stableStringify(value)).byteLength <= MAX_FLARE_PRESENTATION_MESSAGE_BYTES;
	} catch {
		return false;
	}
}
function isFlarePresentationStateMessage(value) {
	if (!isRecord$3(value) || !exactKeys$1(value, [
		"type",
		"schemaVersion",
		"by",
		"matchEpoch",
		"weaponGeneration",
		"snapshotSeq",
		"sampledAtHostTimeMs",
		"flares",
		"nonce"
	]) || value.type !== "flare-presentation-state" || value.schemaVersion !== 1 || !canonicalActorId$1(value.by) || !boundedInteger$1(value.matchEpoch, 1, 999999999) || !boundedInteger$1(value.weaponGeneration, 0, 1e9) || !boundedInteger$1(value.snapshotSeq, 0) || !boundedFinite(value.sampledAtHostTimeMs, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(value.flares) || value.flares.length > MAX_FLARE_PRESENTATION_REPLICAS || !value.flares.every(isFlarePresentationReplicaSnapshot) || !isCanonicalReplicaSequence(value.flares) || !boundedInteger$1(value.nonce, 0)) return false;
	return withinWireBudget$1(value);
}
function isFlarePresentationProtocolMessage(value) {
	return isFlarePresentationStateMessage(value);
}
var MAX_BOT_WEAPON_PRESENTATION_MESSAGE_BYTES = 2 * 1024;
function isRecord$2(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value, expected) {
	const actual = Object.keys(value).sort();
	const canonical = [...expected].sort();
	return actual.length === canonical.length && actual.every((key, index) => key === canonical[index]);
}
function canonicalActorId(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(value);
}
function boundedInteger(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
	return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function isPosition(value) {
	return Array.isArray(value) && value.length === 3 && value.every((entry) => Number.isFinite(entry) && Number(entry) >= -4096 && Number(entry) <= 4096);
}
function withinWireBudget(value) {
	try {
		return new TextEncoder().encode(stableStringify(value)).byteLength <= MAX_BOT_WEAPON_PRESENTATION_MESSAGE_BYTES;
	} catch {
		return false;
	}
}
function hasValidEnvelope(value) {
	return value.type === "bot-weapon-presentation" && value.schemaVersion === 1 && canonicalActorId(value.by) && boundedInteger(value.matchEpoch, 1, 999999999) && typeof value.botId === "string" && /^host-bot-[0-3]$/.test(value.botId) && boundedInteger(value.actionNonce, 0) && boundedInteger(value.nonce, 0);
}
function isBotWeaponPresentationMessage(value) {
	if (!isRecord$2(value) || !hasValidEnvelope(value) || !isPosition(value.origin)) return false;
	if (value.presentation === "flamethrower-stream") {
		if (!exactKeys(value, [
			"type",
			"schemaVersion",
			"by",
			"matchEpoch",
			"botId",
			"weapon",
			"presentation",
			"origin",
			"end",
			"actionNonce",
			"nonce"
		]) || value.weapon !== "flamethrower" || !isPosition(value.end)) return false;
		const distance = Math.hypot(Number(value.end[0]) - Number(value.origin[0]), Number(value.end[1]) - Number(value.origin[1]), Number(value.end[2]) - Number(value.origin[2]));
		if (!Number.isFinite(distance) || distance > FLAMETHROWER_EFFECT.rangeM + .05) return false;
	} else if (value.presentation === "signal-flare-launch") {
		if (!exactKeys(value, [
			"type",
			"schemaVersion",
			"by",
			"matchEpoch",
			"botId",
			"weapon",
			"presentation",
			"origin",
			"actionNonce",
			"nonce"
		]) || value.weapon !== "flare-gun") return false;
	} else return false;
	return withinWireBudget(value);
}
function botWeaponPresentationReplayKey(message) {
	return `${message.matchEpoch}:${message.botId}:${message.actionNonce}`;
}
/**
* Bounded action-level replay guard. A retransmit with a fresh envelope nonce
* still cannot replay the same bot trigger's sound or particles.
*/
var BotWeaponPresentationReplayGuard = class {
	capacity;
	admitted = /* @__PURE__ */ new Set();
	order = [];
	constructor(capacity = 128) {
		this.capacity = capacity;
		if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error("Bot presentation replay capacity must be positive");
	}
	admit(value, expected) {
		if (!isBotWeaponPresentationMessage(value)) return Object.freeze({
			accepted: false,
			reason: "malformed",
			message: null
		});
		if (!expected.hostId || value.by !== expected.hostId) return Object.freeze({
			accepted: false,
			reason: "wrong-host",
			message: null
		});
		if (value.matchEpoch !== expected.matchEpoch) return Object.freeze({
			accepted: false,
			reason: "wrong-match-epoch",
			message: null
		});
		const key = botWeaponPresentationReplayKey(value);
		if (this.admitted.has(key)) return Object.freeze({
			accepted: false,
			reason: "duplicate-action",
			message: null
		});
		this.admitted.add(key);
		this.order.push(key);
		while (this.order.length > this.capacity) this.admitted.delete(this.order.shift());
		return Object.freeze({
			accepted: true,
			reason: "accepted",
			message: value
		});
	}
	clear() {
		this.admitted.clear();
		this.order.length = 0;
	}
	size() {
		return this.admitted.size;
	}
};
var MAX_HOST_TERM = 1e9;
var HOST_SUCCESSION_MANDATE_TTL_MS = 9e4 + REJOIN_GRACE_MS;
var MAX_ID_LENGTH$1 = 80;
/** Matches the room-code shape the host checkpoint already enforces. */
var ROOM_CODE_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
function isRecord$1(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isParticipantId$1(value) {
	return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH$1;
}
function isBoundedInteger(value, minimum, maximum) {
	return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function isSuccessionRoster(value) {
	if (!isRecord$1(value) || !isBoundedInteger(value.revision, 0, 1e9) || !isParticipantId$1(value.hostId) || !Array.isArray(value.members) || value.members.length < 1 || value.members.length > 16) return false;
	return value.members.every((member) => isRecord$1(member) && isParticipantId$1(member.id) && typeof member.connected === "boolean");
}
/**
* The election rule, stated once so it can be relied on everywhere:
*
*   the successor is the lexicographically lowest `id` among roster members that
*   are not the host and are marked connected.
*
* Lexicographic order over the host-authored id set is total and stable, so
* every participant computing from the same roster revision reaches the same
* answer with no messages exchanged. That is the whole point: agreement is
* obtained by shared input, not by a round of chatter that a partition could
* split. Ties are impossible because ids are unique, and a roster carrying
* duplicates is refused rather than resolved.
*/
function electHostSuccessor(roster) {
	if (!isSuccessionRoster(roster)) return Object.freeze({
		decided: false,
		reason: "malformed-roster",
		candidates: Object.freeze([]),
		revision: -1
	});
	const ids = roster.members.map((member) => member.id);
	if (new Set(ids).size !== ids.length) return Object.freeze({
		decided: false,
		reason: "duplicate-member-ids",
		candidates: Object.freeze([]),
		revision: roster.revision
	});
	if (!ids.includes(roster.hostId)) return Object.freeze({
		decided: false,
		reason: "host-not-in-roster",
		candidates: Object.freeze([]),
		revision: roster.revision
	});
	const candidates = Object.freeze(roster.members.filter((member) => member.id !== roster.hostId && member.connected).map((member) => member.id).sort());
	if (candidates.length === 0) return Object.freeze({
		decided: false,
		reason: "no-connected-guests",
		candidates,
		revision: roster.revision
	});
	return Object.freeze({
		decided: true,
		successorId: candidates[0],
		candidates,
		revision: roster.revision
	});
}
/** Count of connected non-host members — the survivor population G-check. */
function survivingGuestCount(roster) {
	return roster.members.filter((member) => member.id !== roster.hostId && member.connected).length;
}
function isSuccessionMandate(value) {
	if (!isRecord$1(value)) return false;
	const allowed = /* @__PURE__ */ new Set([
		"schemaVersion",
		"term",
		"roomCode",
		"successorId",
		"lobbyRevision",
		"issuedByHostId",
		"issuedAtEpochMs",
		"expiresAtEpochMs"
	]);
	if (Object.keys(value).length !== allowed.size || !Object.keys(value).every((key) => allowed.has(key))) return false;
	return value.schemaVersion === 1 && isBoundedInteger(value.term, 1, 1e9) && typeof value.roomCode === "string" && ROOM_CODE_PATTERN.test(value.roomCode) && isParticipantId$1(value.successorId) && isParticipantId$1(value.issuedByHostId) && value.successorId !== value.issuedByHostId && isBoundedInteger(value.lobbyRevision, 0, 1e9) && isBoundedInteger(value.issuedAtEpochMs, 1, 0x9184e72a000) && value.expiresAtEpochMs === Number(value.issuedAtEpochMs) + HOST_SUCCESSION_MANDATE_TTL_MS;
}
/**
* Mint the next mandate. Returns null rather than a degraded mandate whenever
* anything is off — a missing mandate costs a dead room, a wrong one costs a
* split brain, and those are not close in severity.
*/
function mintSuccessionMandate(input) {
	if (!isSuccessionRoster(input.roster) || typeof input.roomCode !== "string" || !ROOM_CODE_PATTERN.test(input.roomCode) || !isBoundedInteger(input.previousTerm, 0, 1e9) || !isBoundedInteger(input.nowEpochMs, 1, 0x9184e72a000)) return null;
	const election = electHostSuccessor(input.roster);
	if (!election.decided) return null;
	const term = Math.max(1, input.previousTerm + 1);
	if (term > 1e9) return null;
	const mandate = Object.freeze({
		schemaVersion: 1,
		term,
		roomCode: input.roomCode,
		successorId: election.successorId,
		lobbyRevision: input.roster.revision,
		issuedByHostId: input.roster.hostId,
		issuedAtEpochMs: input.nowEpochMs,
		expiresAtEpochMs: input.nowEpochMs + HOST_SUCCESSION_MANDATE_TTL_MS
	});
	return isSuccessionMandate(mandate) ? mandate : null;
}
/** Monotonic term comparison. Equal terms do NOT supersede. */
function termSupersedes(candidateTerm, heldTerm) {
	return isBoundedInteger(candidateTerm, 1, 1e9) && isBoundedInteger(heldTerm, 0, 1e9) && candidateTerm > heldTerm;
}
/**
* Classify the guest's view of its host. Ordering matters: a deliberate close
* outranks everything (retrying against a reset room is pure waste), and an
* expired window outranks a still-pending retry.
*/
function evaluateHostLoss(sample) {
	const now = sample.nowMonoMs;
	const silentForMs = Number.isFinite(now) && sample.lastValidHostMessageMonoMs !== null && Number.isFinite(sample.lastValidHostMessageMonoMs) ? Math.max(0, now - sample.lastValidHostMessageMonoMs) : null;
	const frozen = (state, remainingMs) => Object.freeze({
		state,
		remainingMs,
		silentForMs
	});
	if (sample.role !== "client") return frozen("inactive", null);
	if (sample.lobbyClosedByHost) return frozen("closed-by-host", null);
	const deadline = sample.reconnectDeadlineMonoMs;
	const windowRunning = deadline !== null && Number.isFinite(deadline) && Number.isFinite(now);
	if (windowRunning && now >= deadline) return frozen("host-lost", 0);
	const remainingMs = windowRunning ? Math.max(0, deadline - now) : null;
	if (sample.reconnectPending || !sample.eventChannelOpen) return frozen("reconnecting", remainingMs);
	if (silentForMs !== null && silentForMs >= 15e3) return frozen("unstable", remainingMs);
	return frozen("healthy", remainingMs);
}
/**
* Turn the assessment into something a player actually sees. The owner's
* complaint was that a lost host is silent — every terminal state here names
* what happened and offers exactly one obvious next step.
*/
function hostLossPresentation(assessment) {
	const seconds = assessment.remainingMs === null ? null : Math.max(0, Math.ceil(assessment.remainingMs / 1e3));
	switch (assessment.state) {
		case "inactive":
		case "healthy": return Object.freeze({
			visible: false,
			tone: "ok",
			headline: "",
			detail: "",
			action: "none",
			actionLabel: ""
		});
		case "unstable": return Object.freeze({
			visible: true,
			tone: "warn",
			headline: "HOST CONNECTION UNSTABLE",
			detail: "No update from the host for a few seconds. Holding your place in the match.",
			action: "wait",
			actionLabel: "WAITING"
		});
		case "reconnecting": return Object.freeze({
			visible: true,
			tone: "warn",
			headline: "RECONNECTING TO HOST",
			detail: seconds === null ? "Lost the host connection. Retrying inside the rejoin window." : `Lost the host connection. Retrying for another ${seconds}s before the match is given up.`,
			action: "wait",
			actionLabel: "WAITING"
		});
		case "host-lost": return Object.freeze({
			visible: true,
			tone: "error",
			headline: "HOST LEFT THE MATCH",
			detail: "The host never came back inside the rejoin window, so this match cannot continue. Your room code is saved — if the host reopens the same lobby, REJOIN LAST MATCH will take you straight back.",
			action: "rejoin",
			actionLabel: "REJOIN LAST MATCH"
		});
		case "closed-by-host": return Object.freeze({
			visible: true,
			tone: "error",
			headline: "HOST CLOSED THE LOBBY",
			detail: "The host reset this room. The old invite code will not work again — ask for the new one.",
			action: "return-to-lobby",
			actionLabel: "BACK TO LOBBY"
		});
	}
}
/**
* The one function that may ever say "yes, become the host".
*
* Every guard is a separate named refusal so that a wiring mistake surfaces as
* a specific, greppable reason instead of a silent fallthrough. The checks run
* cheapest-and-most-decisive first, but the order carries no safety meaning:
* all of them must pass.
*/
function authorizeSelfPromotion(sample) {
	const refuse = (reason) => Object.freeze({
		promote: false,
		reason
	});
	if (sample.assessment.state === "closed-by-host") return refuse("lobby-closed-by-host");
	if (sample.assessment.state !== "host-lost") return refuse("host-not-confirmed-lost");
	if (sample.mandate === null) return refuse("no-mandate");
	if (!isSuccessionMandate(sample.mandate)) return refuse("malformed-mandate");
	const mandate = sample.mandate;
	if (!isParticipantId$1(sample.selfId)) return refuse("mandate-names-another-guest");
	if (mandate.successorId !== sample.selfId) return refuse("mandate-names-another-guest");
	if (typeof sample.roomCode !== "string" || mandate.roomCode !== sample.roomCode) return refuse("mandate-room-mismatch");
	if (!isBoundedInteger(sample.nowEpochMs, 1, 0x9184e72a000) || sample.nowEpochMs >= mandate.expiresAtEpochMs) return refuse("mandate-expired");
	if (!isBoundedInteger(sample.highestObservedTerm, 0, 1e9) || mandate.term < sample.highestObservedTerm) return refuse("mandate-superseded");
	if (!isSuccessionRoster(sample.roster)) return refuse("roster-revision-mismatch");
	if (sample.roster.revision !== mandate.lobbyRevision) return refuse("roster-revision-mismatch");
	if (sample.roster.hostId !== mandate.issuedByHostId) return refuse("roster-revision-mismatch");
	const election = electHostSuccessor(sample.roster);
	if (!election.decided) return refuse("election-undecided");
	if (election.successorId !== mandate.successorId) return refuse("election-disagrees-with-mandate");
	if (survivingGuestCount(sample.roster) < 2) return refuse("insufficient-survivors");
	if (!sample.holdsMirroredAuthority) return refuse("no-authority-to-adopt");
	return Object.freeze({
		promote: true,
		term: mandate.term + 1,
		roomCode: mandate.roomCode,
		successorId: mandate.successorId
	});
}
/**
* A promoted guest must claim the room code's PeerJS id, which only one peer on
* the signalling server may hold. That makes the claim a global lock and the
* strongest anti-split-brain guard available to this topology.
*
* `unavailable-id` therefore means "someone else already owns this room" — very
* possibly the original host, whose data channels can outlive a signalling
* blip. The only safe response is to abort the promotion for good. Retrying,
* backing off, or falling back to a fresh room code would all end with two peers
* believing they own the same match, which is exactly the outcome this module
* exists to prevent.
*/
function resolveRoomClaimOutcome(outcome) {
	return outcome === "claimed" ? "promote" : "abort";
}
/**
* Followers validate a new host rather than voting for one. A guest that
* promoted itself without a valid mandate is rejected by everybody and so never
* owns the match no matter what it believes about itself — which is what turns
* "one guest went rogue" from a split brain into a harmless no-op.
*/
function acceptPromotedHost(sample) {
	const refuse = (reason) => Object.freeze({
		accept: false,
		reason
	});
	if (!isSuccessionMandate(sample.presentedMandate)) return refuse("malformed-mandate");
	const mandate = sample.presentedMandate;
	if (typeof sample.roomCode !== "string" || mandate.roomCode !== sample.roomCode) return refuse("room-mismatch");
	if (!isParticipantId$1(sample.claimantId) || mandate.successorId !== sample.claimantId) return refuse("claimant-not-the-successor");
	if (!isBoundedInteger(sample.presentedTerm, 1, 1e9) || sample.presentedTerm !== mandate.term + 1 || !termSupersedes(sample.presentedTerm, sample.highestObservedTerm)) return refuse("stale-term");
	if (!isSuccessionRoster(sample.roster) || sample.roster.revision !== mandate.lobbyRevision) return refuse("roster-revision-mismatch");
	const election = electHostSuccessor(sample.roster);
	if (!election.decided || election.successorId !== mandate.successorId) return refuse("election-disagrees-with-mandate");
	return Object.freeze({
		accept: true,
		term: sample.presentedTerm,
		hostId: sample.claimantId
	});
}
/**
* A host that learns of a term higher than its own has been superseded and must
* stand down immediately — stop broadcasting authority, stop admitting guests,
* and surrender the room. This is the half of the term fence that guarantees a
* recovered old host cannot go on believing it owns a match that moved on
* without it. Equal terms retain, so a host is never talked out of its own room
* by a replay of its own term.
*/
function resolveHostTermConflict(ownTerm, observedTerm) {
	return termSupersedes(observedTerm, ownTerm) ? "stand-down" : "retain";
}
var MAX_ID_LENGTH = 80;
var MAX_EPOCH_MS = 0x9184e72a000;
function isRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isParticipantId(value) {
	return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}
/**
* Bounded serialized size, without trusting the sender's own accounting.
* `JSON.stringify` throws on a cyclic payload; a payload that cannot be measured
* is refused rather than admitted unmeasured.
*/
function checkpointEnvelopeWithinCap(value) {
	if (!isRecord(value)) return false;
	try {
		const serialized = JSON.stringify(value);
		return typeof serialized === "string" && serialized.length <= 65536;
	} catch {
		return false;
	}
}
/**
* HF-325: the envelope guard. Structural, bounded, and cross-checked against the
* mandate it carries — but deliberately NOT a checkpoint schema check. See the
* module header for why that check lives at the receive site instead.
*/
function isHostSuccessionProtocolMessage(value) {
	if (!isRecord(value)) return false;
	if (value.schemaVersion !== 1) return false;
	if (!isParticipantId(value.by)) return false;
	if (!Number.isFinite(value.nonce)) return false;
	switch (value.type) {
		case "host-succession-mandate": return isSuccessionMandate(value.mandate) && value.mandate.issuedByHostId === value.by;
		case "host-authority-mirror": return isParticipantId(value.forPlayerId) && isSuccessionMandate(value.mandate) && value.mandate.issuedByHostId === value.by && value.mandate.successorId === value.forPlayerId && checkpointEnvelopeWithinCap(value.checkpoint) && Number.isSafeInteger(value.hostEpochMs) && Number(value.hostEpochMs) > 0 && Number(value.hostEpochMs) <= MAX_EPOCH_MS;
		case "host-promoted": return isSuccessionMandate(value.mandate) && value.mandate.successorId === value.by && Number.isSafeInteger(value.term) && value.term === value.mandate.term + 1;
		default: return false;
	}
}
/**
* Every succession message is signed by its author's own id. The host signs the
* mandate and the mirror; the promoted successor signs `host-promoted`.
*/
function hostSuccessionMessageBelongsToPlayer(message, playerId) {
	return Boolean(playerId) && message.by === playerId;
}
Object.freeze(["shipped", "retired"]);
Object.freeze([
	"timed-explosive",
	"smoke-volume",
	"impact-flash",
	"sticky-explosive"
]);
/**
* The one shipped grenade-family registry. Protocol, loadout UI and bots all
* project from this catalog so a content change cannot silently update only
* one of those consumers.
*/
var GRENADE_CATALOG = Object.freeze([
	Object.freeze({
		id: "frag",
		displayName: "Frag",
		availability: "shipped",
		runtimeKind: "timed-explosive"
	}),
	Object.freeze({
		id: "smoke",
		displayName: "Smoke",
		availability: "shipped",
		runtimeKind: "smoke-volume"
	}),
	Object.freeze({
		id: "flash",
		displayName: "Flashbang",
		availability: "shipped",
		runtimeKind: "impact-flash"
	}),
	Object.freeze({
		id: "semtex",
		displayName: "Semtex",
		availability: "shipped",
		runtimeKind: "sticky-explosive"
	})
]);
var GRENADE_IDS = Object.freeze(GRENADE_CATALOG.filter((definition) => definition.availability === "shipped").map((definition) => definition.id));
new Set(GRENADE_IDS);
var PRIMARY_WEAPON_IDS = Object.freeze([
	"carbine",
	"smg",
	"lmg",
	"scattergun",
	"sniper",
	"mini-uzi",
	"mp5",
	"m4a1",
	"ak-47",
	"minigun",
	"m14-ebr",
	"slug-shotgun"
]);
var SIDEARM_WEAPON_IDS = Object.freeze([
	"pistol",
	"machine-pistol",
	"magnum",
	"flashlight-pistol",
	"explosive-crossbow"
]);
var SPECIAL_WEAPON_IDS = Object.freeze([
	"railgun",
	"flamethrower",
	"crimson-flamethrower",
	"flare-gun"
]);
var WEAPON_IDS = Object.freeze([
	...PRIMARY_WEAPON_IDS,
	...SIDEARM_WEAPON_IDS,
	...SPECIAL_WEAPON_IDS
]);
var ORDINARY_WEAPON_IDS = Object.freeze([...PRIMARY_WEAPON_IDS, ...SIDEARM_WEAPON_IDS]);
var weapons = new Set(WEAPON_IDS);
var primaryWeapons = new Set(PRIMARY_WEAPON_IDS);
var sidearmWeapons = new Set(SIDEARM_WEAPON_IDS);
var specialWeapons = new Set(SPECIAL_WEAPON_IDS);
var grenades = new Set(GRENADE_IDS);
var offensiveSupportSources = /* @__PURE__ */ new Set([
	"yardhawk",
	"tri-pass",
	"hunter-swarm",
	"nuke"
]);
function isPlayerSnapshot(value) {
	if (!value || typeof value !== "object") return false;
	const p = value;
	return typeof p.id === "string" && p.id.length > 0 && p.id.length <= 80 && typeof p.name === "string" && p.name.length > 0 && p.name.length <= 20 && (p.team === 0 || p.team === 1) && [
		"x",
		"y",
		"z",
		"yaw"
	].every((key) => Number.isFinite(p[key])) && typeof p.pitch === "number" && Number.isFinite(p.pitch) && p.pitch >= -1.5 && p.pitch <= 1.5 && typeof p.hp === "number" && Number.isFinite(p.hp) && p.hp >= 0 && p.hp <= 100 && [
		"kills",
		"deaths",
		"seq"
	].every((key) => Number.isSafeInteger(p[key]) && Number(p[key]) >= 0) && (p.stance === void 0 || p.stance === "stand" || p.stance === "crouch" || p.stance === "prone") && (p.swimming === void 0 || typeof p.swimming === "boolean") && primaryWeapons.has(p.primary) && sidearmWeapons.has(p.secondary) && grenades.has(p.grenade) && weapons.has(p.weapon) && (p.weapon === p.primary || p.weapon === p.secondary || p.weapon === "magnum" || specialWeapons.has(p.weapon));
}
function isGuestCombatInventory(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const inventory = value;
	if (!Object.hasOwn(inventory, "ammo") || !Object.hasOwn(inventory, "reserve") || !Object.hasOwn(inventory, "grenades") || Object.keys(inventory).some((key) => key !== "ammo" && key !== "reserve" && key !== "grenades")) return false;
	const exactCounters = (candidate) => {
		if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
		const record = candidate;
		return Object.keys(record).length === ORDINARY_WEAPON_IDS.length && ORDINARY_WEAPON_IDS.every((weapon) => Object.hasOwn(record, weapon) && Number.isSafeInteger(record[weapon]) && Number(record[weapon]) >= 0 && Number(record[weapon]) <= 1e4);
	};
	return exactCounters(inventory.ammo) && exactCounters(inventory.reserve) && (inventory.grenades === 0 || inventory.grenades === 1);
}
function isGuestCombatInventoryProjection(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const projection = value;
	if (Object.keys(projection).length !== 4 || ![
		"revision",
		"primary",
		"sidearm",
		"grenades"
	].every((key) => Object.hasOwn(projection, key))) return false;
	const weaponProjection = (candidate, kind) => {
		if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
		const counter = candidate;
		return Object.keys(counter).length === 3 && [
			"weapon",
			"ammo",
			"reserve"
		].every((key) => Object.hasOwn(counter, key)) && (kind === "primary" ? primaryWeapons.has(counter.weapon) : sidearmWeapons.has(counter.weapon)) && Number.isSafeInteger(counter.ammo) && Number(counter.ammo) >= 0 && Number(counter.ammo) <= 1e4 && Number.isSafeInteger(counter.reserve) && Number(counter.reserve) >= 0 && Number(counter.reserve) <= 1e4;
	};
	return Number.isSafeInteger(projection.revision) && Number(projection.revision) >= 0 && weaponProjection(projection.primary, "primary") && weaponProjection(projection.sidearm, "sidearm") && (projection.grenades === 0 || projection.grenades === 1);
}
function isOptionalCombatTiming(value) {
	if (value === void 0) return true;
	if (!value || typeof value !== "object") return false;
	const timing = value;
	return Number.isSafeInteger(timing.eventSeq) && Number(timing.eventSeq) >= 0 && Number.isFinite(timing.sentAtHostTimeMs) && Number(timing.sentAtHostTimeMs) >= 0;
}
function isHostVerifiedStickyAttachment(value) {
	if (!value || typeof value !== "object") return false;
	const attachment = value;
	return typeof attachment.targetId === "string" && attachment.targetId.length > 0 && attachment.targetId.length <= 80 && Number.isSafeInteger(attachment.targetLifeId) && Number(attachment.targetLifeId) >= 0;
}
function isHostHitAuthority(value) {
	if (!value || typeof value !== "object") return false;
	const authority = value;
	return typeof authority.hostId === "string" && authority.hostId.length > 0 && authority.hostId.length <= 80 && Number.isSafeInteger(authority.targetLifeId) && Number(authority.targetLifeId) >= 0 && Number.isFinite(authority.appliedDamage) && Number(authority.appliedDamage) >= 0 && Number(authority.appliedDamage) <= 100 && Number.isFinite(authority.resultingHealth) && Number(authority.resultingHealth) >= 0 && Number(authority.resultingHealth) <= 100 && (authority.stickyAttachment === null || isHostVerifiedStickyAttachment(authority.stickyAttachment));
}
function isHostWindowBreakAuthority(value) {
	if (!value || typeof value !== "object") return false;
	const authority = value;
	return typeof authority.hostId === "string" && authority.hostId.length > 0 && authority.hostId.length <= 80 && (authority.stickyAttachment === null || isHostVerifiedStickyAttachment(authority.stickyAttachment));
}
function isNormalizedDirection(value) {
	if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) return false;
	const magnitude = Math.hypot(Number(value[0]), Number(value[1]), Number(value[2]));
	return magnitude >= .96 && magnitude <= 1.04;
}
var pickupResultReasons = /* @__PURE__ */ new Set([
	"accepted",
	"duplicate",
	"unknown-sender",
	"unknown-drop",
	"weapon-mismatch",
	"out-of-bounds",
	"sender-distance",
	"drop-distance",
	"expired",
	"payload-consumed",
	"grenade-state",
	"grenade-grant",
	"no-inventory",
	"nothing-to-scavenge",
	"not-consumable"
]);
function isPickupResultDropRecord(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const drop = value;
	return Object.keys(drop).length === 5 && [
		"weapon",
		"ammo",
		"reserve",
		"position",
		"expiresAt"
	].every((key) => Object.hasOwn(drop, key)) && weapons.has(drop.weapon) && Number.isSafeInteger(drop.ammo) && Number(drop.ammo) >= 0 && Number(drop.ammo) <= 1e4 && Number.isSafeInteger(drop.reserve) && Number(drop.reserve) >= 0 && Number(drop.reserve) <= 1e4 && Array.isArray(drop.position) && drop.position.length === 3 && drop.position.every(Number.isFinite) && Number.isFinite(drop.expiresAt) && Number(drop.expiresAt) >= 0;
}
var shotRejectReasons = /* @__PURE__ */ new Set([
	"none",
	"protocol-mismatch",
	"unknown-sender",
	"duplicate",
	"sequence-gap",
	"weapon-mismatch",
	"cadence",
	"spin-up",
	"stale",
	"future",
	"invalid-direction",
	"invalid-pellets",
	"bad-origin",
	"missing-history",
	"continuity-mismatch",
	"connection-epoch-mismatch",
	"life-mismatch",
	"shooter-dead",
	"invalid-timeline",
	"empty-magazine",
	"obstructed",
	"malformed"
]);
function isGameMessage(value) {
	if (isKillstreakProtocolMessage(value)) return true;
	if (isInteractiveWorldProtocolMessage(value)) return true;
	if (isSmokeProtocolMessage(value)) return true;
	if (isFlashProtocolMessage(value)) return true;
	if (isTimedMapWeaponProtocolMessage(value)) return true;
	if (isFlarePresentationProtocolMessage(value)) return true;
	if (isBotWeaponPresentationMessage(value)) return true;
	if (isHostSuccessionProtocolMessage(value)) return true;
	if (!value || typeof value !== "object") return false;
	const msg = value;
	switch (msg.type) {
		case "join": return isPlayerSnapshot(msg.player);
		case "guest-resume-authority": return msg.protocolVersion === 18 && typeof msg.by === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(msg.by) && typeof msg.forPlayerId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(msg.forPlayerId) && msg.by !== msg.forPlayerId && typeof msg.connectionEpoch === "string" && msg.connectionEpoch.length >= 8 && msg.connectionEpoch.length <= 128 && /^[A-Za-z0-9_-]+$/.test(msg.connectionEpoch) && Number.isSafeInteger(msg.matchEpoch) && Number(msg.matchEpoch) >= 0 && Number.isSafeInteger(msg.worldRevision) && Number(msg.worldRevision) >= 0 && Number.isSafeInteger(msg.attempt) && Number(msg.attempt) >= 0 && Number(msg.attempt) <= 2 && (msg.placementReason === "retained" || msg.placementReason === "safe-fallback") && (Number(msg.attempt) === 0 ? msg.placementReason === "retained" : msg.placementReason === "safe-fallback") && isPlayerSnapshot(msg.player) && msg.player.id === msg.forPlayerId && isGuestCombatInventory(msg.combatInventory) && Number.isSafeInteger(msg.combatInventoryRevision) && Number(msg.combatInventoryRevision) >= 0 && Number.isSafeInteger(msg.continuity) && Number(msg.continuity) >= 0 && Number.isFinite(msg.respawnRemainingMs) && Number(msg.respawnRemainingMs) >= 0 && Number(msg.respawnRemainingMs) <= 1e4 && (msg.player.hp > 0 ? Number(msg.respawnRemainingMs) === 0 : Number(msg.respawnRemainingMs) > 0) && validateKillstreakLoadout(msg.loadout).valid && Number.isSafeInteger(msg.nonce) && Number(msg.nonce) >= 0;
		case "guest-resume-ack": return msg.protocolVersion === 18 && typeof msg.by === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(msg.by) && typeof msg.connectionEpoch === "string" && msg.connectionEpoch.length >= 8 && msg.connectionEpoch.length <= 128 && /^[A-Za-z0-9_-]+$/.test(msg.connectionEpoch) && Number.isSafeInteger(msg.matchEpoch) && Number(msg.matchEpoch) >= 0 && Number.isSafeInteger(msg.authorityNonce) && Number(msg.authorityNonce) >= 0 && Number.isSafeInteger(msg.nonce) && Number(msg.nonce) >= 0;
		case "guest-resume-nack": return msg.protocolVersion === 18 && typeof msg.by === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(msg.by) && typeof msg.connectionEpoch === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(msg.connectionEpoch) && Number.isSafeInteger(msg.matchEpoch) && Number(msg.matchEpoch) >= 0 && Number.isSafeInteger(msg.worldRevision) && Number(msg.worldRevision) >= 0 && Number.isSafeInteger(msg.authorityNonce) && Number(msg.authorityNonce) >= 0 && Number.isSafeInteger(msg.attempt) && Number(msg.attempt) >= 0 && Number(msg.attempt) <= 2 && (msg.reason === "world-repair-timeout" || msg.reason === "blocked-pose" || msg.reason === "stance-rejected") && Number.isSafeInteger(msg.nonce) && Number(msg.nonce) >= 0;
		case "guest-resume-failure": return msg.protocolVersion === 18 && typeof msg.by === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(msg.by) && typeof msg.forPlayerId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(msg.forPlayerId) && msg.by !== msg.forPlayerId && typeof msg.connectionEpoch === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(msg.connectionEpoch) && Number.isSafeInteger(msg.matchEpoch) && Number(msg.matchEpoch) >= 0 && Number.isSafeInteger(msg.worldRevision) && Number(msg.worldRevision) >= 0 && Number.isSafeInteger(msg.authorityNonce) && Number(msg.authorityNonce) >= 0 && Number.isSafeInteger(msg.attempt) && Number(msg.attempt) >= 0 && Number(msg.attempt) <= 2 && (msg.reason === "retry-ceiling" || msg.reason === "no-safe-pose") && Number.isSafeInteger(msg.nonce) && Number(msg.nonce) >= 0;
		case "state":
			if (!isPlayerSnapshot(msg.player)) return false;
			if (msg.combatInventory !== void 0) {
				if (!isGuestCombatInventoryProjection(msg.combatInventory)) return false;
				if (msg.combatInventory.revision !== msg.player.seq || msg.combatInventory.primary.weapon !== msg.player.primary || msg.combatInventory.sidearm.weapon !== msg.player.secondary && msg.combatInventory.sidearm.weapon !== "magnum") return false;
			}
			return Number.isFinite(msg.hostTimeMs) && Number(msg.hostTimeMs) >= 0 && Number.isSafeInteger(msg.continuity) && Number(msg.continuity) >= 0 && (msg.rateHz === 20 || msg.rateHz === 30 || msg.rateHz === 40);
		case "shot": return typeof msg.by === "string" && weapons.has(msg.weapon) && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite) && Array.isArray(msg.direction) && msg.direction.length === 3 && msg.direction.every(Number.isFinite) && Array.isArray(msg.pelletDirections) && msg.pelletDirections.length >= 1 && msg.pelletDirections.length <= 12 && msg.pelletDirections.every((direction) => Array.isArray(direction) && direction.length === 3 && direction.every(Number.isFinite)) && isOptionalCombatTiming(msg.timing) && Number.isFinite(msg.nonce);
		case "shot-request": return msg.protocolVersion === 18 && typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.shotId === "string" && msg.shotId.length >= 8 && msg.shotId.length <= 128 && typeof msg.connectionEpoch === "string" && msg.connectionEpoch.length >= 8 && msg.connectionEpoch.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(msg.connectionEpoch) && Number.isSafeInteger(msg.lifeId) && Number(msg.lifeId) >= 0 && Number.isSafeInteger(msg.shotSeq) && Number(msg.shotSeq) >= 0 && Number.isSafeInteger(msg.weaponSequence) && Number(msg.weaponSequence) >= 0 && weapons.has(msg.weapon) && Number.isFinite(msg.fireTimeMs) && Number(msg.fireTimeMs) >= 0 && Number.isFinite(msg.triggerStartedAtMs) && Number(msg.triggerStartedAtMs) >= 0 && Number(msg.triggerStartedAtMs) <= Number(msg.fireTimeMs) && Number(msg.fireTimeMs) - Number(msg.triggerStartedAtMs) <= 1e4 && Number.isFinite(msg.targetViewTimeMs) && Number(msg.targetViewTimeMs) >= 0 && Number(msg.targetViewTimeMs) <= Number(msg.fireTimeMs) && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite) && isNormalizedDirection(msg.direction) && Array.isArray(msg.pelletDirections) && msg.pelletDirections.length >= 1 && msg.pelletDirections.length <= 12 && msg.pelletDirections.every(isNormalizedDirection) && Number.isFinite(msg.nonce);
		case "trigger-state": return msg.protocolVersion === 18 && typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.connectionEpoch === "string" && msg.connectionEpoch.length >= 8 && msg.connectionEpoch.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(msg.connectionEpoch) && Number.isSafeInteger(msg.lifeId) && Number(msg.lifeId) >= 0 && Number.isSafeInteger(msg.actionSequence) && Number(msg.actionSequence) >= 0 && Number(msg.actionSequence) <= 1e9 && weapons.has(msg.weapon) && typeof msg.pressed === "boolean" && Number.isSafeInteger(msg.nonce) && Number(msg.nonce) >= 0;
		case "shot-result": return msg.protocolVersion === 18 && typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.forPlayerId === "string" && msg.forPlayerId.length > 0 && msg.forPlayerId.length <= 80 && typeof msg.shotId === "string" && msg.shotId.length >= 8 && msg.shotId.length <= 128 && typeof msg.connectionEpoch === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(msg.connectionEpoch) && Number.isSafeInteger(msg.lifeId) && Number(msg.lifeId) >= 0 && Number.isSafeInteger(msg.shotSeq) && Number(msg.shotSeq) >= 0 && weapons.has(msg.weapon) && (msg.status === "accepted-hit" || msg.status === "accepted-miss" || msg.status === "rejected") && shotRejectReasons.has(msg.reason) && Number.isFinite(msg.fireTimeMs) && Number(msg.fireTimeMs) >= 0 && Number.isFinite(msg.targetViewTimeMs) && Number(msg.targetViewTimeMs) >= 0 && Number(msg.targetViewTimeMs) <= Number(msg.fireTimeMs) && (msg.receivedAtHostTimeMs === null || Number.isFinite(msg.receivedAtHostTimeMs) && Number(msg.receivedAtHostTimeMs) >= 0) && (msg.resolvedAtHostTimeMs === null || Number.isFinite(msg.resolvedAtHostTimeMs) && Number(msg.resolvedAtHostTimeMs) >= 0) && (msg.receivedAtHostTimeMs === null || msg.resolvedAtHostTimeMs === null || Number(msg.resolvedAtHostTimeMs) >= Number(msg.receivedAtHostTimeMs)) && Number.isFinite(msg.appliedRewindMs) && Number(msg.appliedRewindMs) >= 0 && Number(msg.appliedRewindMs) <= 250 && (msg.combatInventory === null || isGuestCombatInventoryProjection(msg.combatInventory)) && (specialWeapons.has(msg.weapon) ? msg.combatInventory === null : msg.combatInventory !== null || msg.reason === "unknown-sender") && Array.isArray(msg.outcomes) && msg.outcomes.length <= 6 && msg.outcomes.every((outcome) => {
			if (!outcome || typeof outcome !== "object") return false;
			const item = outcome;
			return typeof item.target === "string" && item.target.length > 0 && item.target.length <= 80 && Number.isSafeInteger(item.pelletHits) && Number(item.pelletHits) >= 1 && Number(item.pelletHits) <= 12 && Number.isFinite(item.damage) && Number(item.damage) >= 0 && Number(item.damage) <= 400 && (item.rawDamage === void 0 || Number.isFinite(item.rawDamage) && Number(item.rawDamage) >= Number(item.damage) && Number(item.rawDamage) <= 9999) && Number.isFinite(item.resultingHealth) && Number(item.resultingHealth) >= 0 && Number(item.resultingHealth) <= (String(item.target).startsWith("test-dummy-") ? 500 : 100) && typeof item.died === "boolean" && (item.hitZone === "head" || item.hitZone === "body" || item.hitZone === "limb") && typeof item.wallbang === "boolean" && Number.isFinite(item.penetrationMultiplier) && Number(item.penetrationMultiplier) >= 0 && Number(item.penetrationMultiplier) <= 1 && (item.targetRespawnAtHostTimeMs === void 0 || String(item.target).startsWith("test-dummy-") && Number.isFinite(item.targetRespawnAtHostTimeMs) && Number(item.targetRespawnAtHostTimeMs) >= 0);
		}) && Number.isFinite(msg.nonce);
		case "state-feedback": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.forPlayerId === "string" && msg.forPlayerId.length > 0 && msg.forPlayerId.length <= 80 && Number.isSafeInteger(msg.sequenceGaps) && Number(msg.sequenceGaps) >= 0 && Number(msg.sequenceGaps) <= 1e3 && Number.isSafeInteger(msg.reordered) && Number(msg.reordered) >= 0 && Number(msg.reordered) <= 1e3 && Number.isFinite(msg.bufferedPressure) && Number(msg.bufferedPressure) >= 0 && Number(msg.bufferedPressure) <= 1 && Number.isFinite(msg.nonce);
		case "melee": return typeof msg.by === "string" && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite) && Array.isArray(msg.direction) && msg.direction.length === 3 && msg.direction.every(Number.isFinite) && isOptionalCombatTiming(msg.timing) && Number.isFinite(msg.nonce);
		case "grenade-throw": return msg.protocolVersion === 18 && typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.connectionEpoch === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(msg.connectionEpoch) && grenades.has(msg.grenade) && Number.isSafeInteger(msg.lifeId) && Number(msg.lifeId) >= 0 && Number.isSafeInteger(msg.actionSequence) && Number(msg.actionSequence) >= 0 && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite) && Array.isArray(msg.velocity) && msg.velocity.length === 3 && msg.velocity.every(Number.isFinite) && Number.isFinite(msg.actionNonce) && isOptionalCombatTiming(msg.timing) && Number.isFinite(msg.nonce);
		case "grenade-result": return msg.protocolVersion === 18 && typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.forPlayerId === "string" && msg.forPlayerId.length > 0 && msg.forPlayerId.length <= 80 && typeof msg.connectionEpoch === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(msg.connectionEpoch) && Number.isSafeInteger(msg.lifeId) && Number(msg.lifeId) >= 0 && Number.isSafeInteger(msg.actionSequence) && Number(msg.actionSequence) >= 0 && Number(msg.actionSequence) <= 1e9 && Number.isFinite(msg.actionNonce) && (msg.status === "accepted" || msg.status === "rejected") && Number.isSafeInteger(msg.shotSequenceWatermark) && Number(msg.shotSequenceWatermark) >= -1 && isGuestCombatInventoryProjection(msg.combatInventory) && Number.isSafeInteger(msg.nonce) && Number(msg.nonce) >= 0;
		case "hit": return typeof msg.by === "string" && typeof msg.target === "string" && Number.isFinite(msg.damage) && Number(msg.damage) > 0 && Number(msg.damage) <= 100 && (msg.kind === "shot" || msg.kind === "melee" || msg.kind === "explosive") && (msg.kind !== "explosive" || Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite)) && (msg.kind === "explosive" ? msg.explosiveSource === "grenade" || msg.explosiveSource === "explosive-crossbow" || msg.explosiveSource === "yardhawk" || msg.explosiveSource === "tri-pass" || msg.explosiveSource === "hunter-swarm" || msg.explosiveSource === "nuke" : msg.explosiveSource === void 0) && Number.isFinite(msg.actionNonce) && (msg.kind === "explosive" && msg.explosiveSource !== "grenade" && msg.explosiveSource !== "explosive-crossbow" ? Number.isFinite(msg.supportNonce) : msg.supportNonce === void 0) && (msg.stuck === void 0 || msg.stuck === true) && (msg.hostAuthority === void 0 || isHostHitAuthority(msg.hostAuthority) && Boolean(msg.hostAuthority.stickyAttachment) === (msg.stuck === true) && (msg.hostAuthority.stickyAttachment === null || msg.hostAuthority.stickyAttachment.targetId === msg.target && msg.hostAuthority.stickyAttachment.targetLifeId === msg.hostAuthority.targetLifeId)) && isOptionalCombatTiming(msg.timing) && Number.isFinite(msg.nonce);
		case "support-activate": return typeof msg.by === "string" && offensiveSupportSources.has(msg.source) && typeof msg.activationRequestId === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(msg.activationRequestId) && Number.isFinite(msg.activationNonce) && Array.isArray(msg.effectOrigins) && msg.effectOrigins.length <= 3 && msg.effectOrigins.every((origin) => Array.isArray(origin) && origin.length === 3 && origin.every(Number.isFinite)) && Array.isArray(msg.targetIds) && msg.targetIds.length <= 5 && msg.targetIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64) && (msg.source === "tri-pass" ? msg.effectOrigins.length === 3 && msg.targetIds.length === 0 : msg.source === "yardhawk" ? msg.effectOrigins.length === 0 && msg.targetIds.length === 1 : msg.source === "hunter-swarm" ? msg.effectOrigins.length === 0 && msg.targetIds.length >= 1 : msg.effectOrigins.length === 0 && msg.targetIds.length === 0) && isOptionalCombatTiming(msg.timing) && Number.isFinite(msg.nonce);
		case "death": return typeof msg.killer === "string" && typeof msg.victim === "string" && Boolean(msg.cause) && typeof msg.cause === "object" && (msg.cause.kind === "gun" && weapons.has(msg.cause.weapon) || msg.cause.kind === "grenade" || msg.cause.kind === "melee" || msg.cause.kind === "environment" || msg.cause.kind === "killstreak" && isPass65KillstreakId(msg.cause.effect)) && Number.isFinite(msg.nonce);
		case "bot-damage": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.botId === "string" && /^host-bot-[0-3]$/.test(msg.botId) && typeof msg.target === "string" && msg.target.length > 0 && msg.target.length <= 80 && weapons.has(msg.weapon) && (msg.weapon === "flare-gun" ? msg.presentation === "signal-flare-projectile" : msg.weapon === "flamethrower" ? msg.presentation === void 0 || msg.presentation === "ballistic-ray" || msg.presentation === "flamethrower-stream" : msg.presentation === void 0 || msg.presentation === "ballistic-ray") && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite) && Array.isArray(msg.direction) && msg.direction.length === 3 && msg.direction.every(Number.isFinite) && Number.isFinite(msg.damageApplied) && Number(msg.damageApplied) > 0 && Number(msg.damageApplied) <= 100 && Number.isFinite(msg.healthBefore) && Number(msg.healthBefore) >= 0 && Number(msg.healthBefore) <= 100 && Number.isFinite(msg.healthAfter) && Number(msg.healthAfter) >= 0 && Number(msg.healthAfter) <= Number(msg.healthBefore) && Math.abs(Number(msg.healthBefore) - Number(msg.healthAfter) - Number(msg.damageApplied)) < 1e-6 && Number.isFinite(msg.nonce);
		case "bot-state": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && Number.isSafeInteger(msg.seq) && Number(msg.seq) >= 0 && Array.isArray(msg.bots) && msg.bots.length <= 4 && msg.bots.every(isHostedBotSnapshot) && new Set(msg.bots.map((bot) => bot.id)).size === msg.bots.length && Number.isFinite(msg.nonce);
		case "pickup": return msg.protocolVersion === 18 && typeof msg.by === "string" && typeof msg.dropId === "string" && msg.dropId.length > 0 && msg.dropId.length <= 120 && weapons.has(msg.weapon) && (msg.mode === "scavenge" || msg.mode === "weapon") && grenades.has(msg.selectedGrenade) && (msg.grenadeGranted === 0 || msg.grenadeGranted === 1) && Array.isArray(msg.position) && msg.position.length === 3 && msg.position.every(Number.isFinite) && Number.isFinite(msg.nonce);
		case "pickup-result": return msg.protocolVersion === 18 && typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.forPlayerId === "string" && msg.forPlayerId.length > 0 && msg.forPlayerId.length <= 80 && typeof msg.dropId === "string" && msg.dropId.length > 0 && msg.dropId.length <= 120 && (msg.status === "accepted" || msg.status === "rejected") && pickupResultReasons.has(msg.reason) && (msg.status === "accepted" ? msg.reason === "accepted" : msg.reason !== "accepted") && isGuestCombatInventoryProjection(msg.combatInventory) && (msg.drop === "removed" || isPickupResultDropRecord(msg.drop)) && Number.isFinite(msg.nonce);
		case "window-break": return typeof msg.by === "string" && typeof msg.windowId === "string" && msg.windowId.length > 0 && msg.windowId.length <= 160 && (msg.kind === void 0 || msg.kind === "shot" || msg.kind === "knife" || msg.kind === "explosive") && (msg.weapon === void 0 || msg.weapon === "explosive-crossbow") && (msg.crossbowPhase === void 0 || msg.crossbowPhase === "impact" || msg.crossbowPhase === "explosion") && (msg.weapon === "explosive-crossbow" ? msg.crossbowPhase === "impact" && msg.kind === "shot" || msg.crossbowPhase === "explosion" && msg.kind === "explosive" : msg.crossbowPhase === void 0) && (msg.crossbowPhase === "explosion" ? msg.crossbowBlastRadiusM === 3.5 || msg.crossbowBlastRadiusM === 7 : msg.crossbowBlastRadiusM === void 0) && (msg.kind === "explosive" || msg.weapon === "explosive-crossbow" ? Number.isFinite(msg.actionNonce) : msg.actionNonce === void 0) && (msg.hostAuthority === void 0 || isHostWindowBreakAuthority(msg.hostAuthority)) && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite) && Number.isFinite(msg.nonce);
		case "leave": return typeof msg.playerId === "string" && msg.playerId.length > 0 && msg.playerId.length <= 80 && (msg.voluntary === void 0 || typeof msg.voluntary === "boolean");
		case "ping": return typeof msg.by === "string" && (msg.team === 0 || msg.team === 1) && (msg.kind === "enemy" || msg.kind === "regroup" || msg.kind === "push" || msg.kind === "nice") && Array.isArray(msg.position) && msg.position.length === 3 && msg.position.every(Number.isFinite) && Number.isFinite(msg.nonce);
		case "high-score": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && msg.season === "2026-07-22-reset-01" && isHighScoreEntry(msg.entry);
		case "leaderboard-sync": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && msg.season === "2026-07-22-reset-01" && Array.isArray(msg.entries) && msg.entries.length <= 20 && msg.entries.every((entry) => isHighScoreEntry(entry));
		case "overdrive-claim": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && Array.isArray(msg.position) && msg.position.length === 3 && msg.position.every(Number.isFinite) && Number.isSafeInteger(msg.generation) && Number(msg.generation) >= 0 && Number(msg.generation) <= 1e4 && Number.isFinite(msg.nonce);
		case "overdrive-state": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && (msg.holderId === null || typeof msg.holderId === "string" && msg.holderId.length > 0 && msg.holderId.length <= 80) && typeof msg.available === "boolean" && Number.isSafeInteger(msg.generation) && Number(msg.generation) >= 0 && Number(msg.generation) <= 1e4 && Array.isArray(msg.position) && msg.position.length === 3 && msg.position.every(Number.isFinite) && Number.isFinite(msg.activeRemainingMs) && Number(msg.activeRemainingMs) >= 0 && Number(msg.activeRemainingMs) <= 3e4 && Number.isFinite(msg.nextSpawnInMs) && Number(msg.nextSpawnInMs) >= 0 && Number(msg.nextSpawnInMs) <= 12e4 && Number.isFinite(msg.nonce);
		case "lobby-join": return msg.protocolVersion === 18 && typeof msg.playerId === "string" && msg.playerId.length > 0 && msg.playerId.length <= 80 && !isReservedMultiplayerParticipantId(msg.playerId) && typeof msg.connectionEpoch === "string" && msg.connectionEpoch.length >= 8 && msg.connectionEpoch.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(msg.connectionEpoch) && typeof msg.name === "string" && msg.name.length > 0 && msg.name.length <= 20 && (msg.requestedTeam === 0 || msg.requestedTeam === 1) && (msg.squadName === void 0 || isSquadName(msg.squadName)) && (msg.squadColor === void 0 || isSquadColor(msg.squadColor)) && (msg.skinId === void 0 || isSelectableOperatorSkinId(msg.skinId)) && (msg.stanceId === void 0 || isOperatorStanceId(msg.stanceId)) && typeof msg.resumeToken === "string" && msg.resumeToken.length >= 24 && msg.resumeToken.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(msg.resumeToken) && Number.isFinite(msg.nonce);
		case "lobby-ready": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.ready === "boolean" && Number.isFinite(msg.nonce);
		case "lobby-team": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && (msg.team === 0 || msg.team === 1) && Number.isFinite(msg.nonce);
		case "lobby-handicap": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && isDhv(msg.dhv) && Number.isFinite(msg.nonce);
		case "lobby-squad": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && isSquadName(msg.squadName) && isSquadColor(msg.squadColor) && Number.isFinite(msg.nonce);
		case "lobby-skin": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && isSelectableOperatorSkinId(msg.skinId) && Number.isFinite(msg.nonce);
		case "lobby-stance": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && isOperatorStanceId(msg.stanceId) && Number.isFinite(msg.nonce);
		case "emote": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && isOperatorEmoteId(msg.emoteId) && msg.emoteId !== "none" && Number.isFinite(msg.nonce);
		case "redeploy-request": return msg.protocolVersion === 18 && typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && primaryWeapons.has(msg.primary) && sidearmWeapons.has(msg.secondary) && grenades.has(msg.grenade) && Number.isFinite(msg.nonce);
		case "redeploy-commit": return msg.protocolVersion === 18 && typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.target === "string" && msg.target.length > 0 && msg.target.length <= 80 && primaryWeapons.has(msg.primary) && sidearmWeapons.has(msg.secondary) && grenades.has(msg.grenade) && Number.isFinite(msg.hostTimeMs) && Number(msg.hostTimeMs) >= 0 && Number.isFinite(msg.nonce);
		case "reload-intent": return msg.protocolVersion === 18 && typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.connectionEpoch === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(msg.connectionEpoch) && Number.isSafeInteger(msg.lifeId) && Number(msg.lifeId) >= 0 && Number.isSafeInteger(msg.actionSequence) && Number(msg.actionSequence) >= 0 && Number(msg.actionSequence) <= 1e9 && ORDINARY_WEAPON_IDS.includes(msg.weapon) && (msg.action === "start" || msg.action === "cancel") && Number.isSafeInteger(msg.nonce) && Number(msg.nonce) >= 0;
		case "reload-result": return msg.protocolVersion === 18 && typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.forPlayerId === "string" && msg.forPlayerId.length > 0 && msg.forPlayerId.length <= 80 && typeof msg.connectionEpoch === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(msg.connectionEpoch) && Number.isSafeInteger(msg.lifeId) && Number(msg.lifeId) >= 0 && Number.isSafeInteger(msg.actionSequence) && Number(msg.actionSequence) >= 0 && Number(msg.actionSequence) <= 1e9 && ORDINARY_WEAPON_IDS.includes(msg.weapon) && (msg.status === "started" || msg.status === "committed" || msg.status === "cancelled" || msg.status === "rejected") && (msg.reason === "accepted" || msg.reason === "action-sequence" || msg.reason === "connection-epoch" || msg.reason === "life-mismatch" || msg.reason === "weapon-mismatch" || msg.reason === "shooter-dead" || msg.reason === "already-pending" || msg.reason === "nothing-to-reload" || msg.reason === "no-pending-reload" || msg.reason === "cancelled" || msg.reason === "expired" || msg.reason === "committed") && (msg.completesAtHostTimeMs === null || Number.isFinite(msg.completesAtHostTimeMs) && Number(msg.completesAtHostTimeMs) >= 0) && Number.isSafeInteger(msg.shotSequenceWatermark) && Number(msg.shotSequenceWatermark) >= -1 && (msg.status === "started" ? msg.reason === "accepted" && msg.completesAtHostTimeMs !== null : msg.status === "committed" ? msg.reason === "committed" && msg.completesAtHostTimeMs === null : msg.status === "cancelled" ? msg.reason !== "accepted" && msg.reason !== "committed" && msg.completesAtHostTimeMs === null : msg.reason !== "accepted" && msg.reason !== "committed" && msg.reason !== "cancelled" && msg.completesAtHostTimeMs === null) && isGuestCombatInventoryProjection(msg.combatInventory) && Number.isSafeInteger(msg.nonce) && Number(msg.nonce) >= 0;
		case "railgun-claim-request":
		case "railgun-shot-request":
		case "railgun-shot-result":
		case "railgun-state": return isRailgunProtocolMessage(msg, 18);
		case "sticky-attached": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.target === "string" && msg.target.length > 0 && msg.target.length <= 80 && msg.by !== msg.target && Number.isSafeInteger(msg.targetLifeId) && Number(msg.targetLifeId) >= 0 && (msg.source === "grenade" || msg.source === "explosive-crossbow") && Number.isSafeInteger(msg.actionNonce) && Number(msg.actionNonce) >= 0 && Number.isSafeInteger(msg.nonce) && Number(msg.nonce) >= 0;
		case "lobby-config": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && isPrivateMatchConfig(msg.config) && Number.isFinite(msg.nonce);
		case "lobby-balance": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && Number.isFinite(msg.nonce);
		case "lobby-state": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && isLobbySnapshot(msg.snapshot) && Number.isFinite(msg.nonce);
		case "lobby-start": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && Number.isFinite(msg.activeAtHostTimeMs) && Number(msg.activeAtHostTimeMs) >= -9e5 && Number(msg.activeAtHostTimeMs) <= Number(msg.hostSentTimeMs) + 1e4 && Number.isFinite(msg.activeAtEpochMs) && Number(msg.activeAtEpochMs) >= 0 && Number(msg.activeAtEpochMs) <= 0x9184e72a000 && Number.isFinite(msg.hostSentTimeMs) && Number(msg.hostSentTimeMs) >= 0 && Number.isSafeInteger(msg.revision) && Number(msg.revision) >= 0 && Number.isFinite(msg.nonce);
		case "lobby-reject": return (msg.reason === "room-full" || msg.reason === "identity-in-use" || msg.reason === "rejoin-denied" || msg.reason === "match-active" || msg.reason === "invalid-config" || msg.reason === "protocol-mismatch") && Number.isFinite(msg.nonce);
		case "lobby-closed": return (msg.reason === "host-reset" || msg.reason === "host-superseded") && Number.isFinite(msg.nonce);
		case "clock-ping": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && Number.isFinite(msg.guestSentMonoMs) && Number(msg.guestSentMonoMs) >= 0 && (msg.reportedOffsetMs === null || Number.isFinite(msg.reportedOffsetMs) && Math.abs(Number(msg.reportedOffsetMs)) <= 1e10) && (msg.reportedRttMs === null || Number.isFinite(msg.reportedRttMs) && Number(msg.reportedRttMs) >= 0 && Number(msg.reportedRttMs) <= 5e3) && (msg.reportedJitterMs === null || Number.isFinite(msg.reportedJitterMs) && Number(msg.reportedJitterMs) >= 0 && Number(msg.reportedJitterMs) <= 5e3) && (msg.reportedUncertaintyMs === null || Number.isFinite(msg.reportedUncertaintyMs) && Number(msg.reportedUncertaintyMs) >= 0 && Number(msg.reportedUncertaintyMs) <= 5e3) && Number.isFinite(msg.nonce);
		case "clock-pong": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && typeof msg.forPlayerId === "string" && msg.forPlayerId.length > 0 && msg.forPlayerId.length <= 80 && Number.isFinite(msg.guestSentMonoMs) && Number(msg.guestSentMonoMs) >= 0 && Number.isFinite(msg.hostReceivedMonoMs) && Number(msg.hostReceivedMonoMs) >= 0 && Number.isFinite(msg.hostSentMonoMs) && Number(msg.hostSentMonoMs) >= Number(msg.hostReceivedMonoMs) && Number.isFinite(msg.nonce);
		case "match-score": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && Array.isArray(msg.scores) && msg.scores.length <= 10 && msg.scores.every(isPlayerScore) && new Set(msg.scores.map((score) => score.id)).size === msg.scores.length && Number.isFinite(msg.nonce);
		case "range-score-claim": return typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && Number.isSafeInteger(msg.score) && Number(msg.score) >= 0 && Number(msg.score) <= 1e7 && Number.isSafeInteger(msg.hits) && Number(msg.hits) >= 0 && Number(msg.hits) <= 1e5 && Number.isSafeInteger(msg.shots) && Number(msg.shots) >= 0 && Number(msg.shots) <= 1e5 && Number.isFinite(msg.nonce);
		case "chat-submit": return msg.protocolVersion === 18 && typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && isCanonicalChatText(msg.text) && Number.isSafeInteger(msg.nonce) && Number(msg.nonce) >= 0;
		case "chat-message": return msg.protocolVersion === 18 && typeof msg.by === "string" && msg.by.length > 0 && msg.by.length <= 80 && isChatEntry(msg.entry) && Number.isSafeInteger(msg.nonce) && Number(msg.nonce) >= 0;
		case "chat-history":
			if (msg.protocolVersion !== 18 || typeof msg.by !== "string" || msg.by.length === 0 || msg.by.length > 80 || typeof msg.forPlayerId !== "string" || msg.forPlayerId.length === 0 || msg.forPlayerId.length > 80 || !Array.isArray(msg.entries) || msg.entries.length > 32 || !msg.entries.every(isChatEntry) || !Number.isSafeInteger(msg.nonce) || Number(msg.nonce) < 0) return false;
			return new Set(msg.entries.map((entry) => entry.id)).size === msg.entries.length;
		default: return false;
	}
}
function messageBelongsToPlayer(message, playerId) {
	if (!playerId) return false;
	if (isKillstreakProtocolMessage(message)) return killstreakMessageBelongsToPlayer(message, playerId);
	if (isInteractiveWorldProtocolMessage(message)) return message.by === playerId;
	if (isSmokeProtocolMessage(message)) return message.by === playerId;
	if (isFlashProtocolMessage(message)) return message.by === playerId;
	if (isTimedMapWeaponProtocolMessage(message)) return message.by === playerId;
	if (isFlarePresentationProtocolMessage(message)) return message.by === playerId;
	if (isBotWeaponPresentationMessage(message)) return message.by === playerId;
	if (isHostSuccessionProtocolMessage(message)) return hostSuccessionMessageBelongsToPlayer(message, playerId);
	switch (message.type) {
		case "join":
		case "state": return message.player.id === playerId;
		case "guest-resume-authority":
		case "guest-resume-ack":
		case "guest-resume-nack":
		case "guest-resume-failure": return message.by === playerId;
		case "bot-state":
		case "bot-damage": return message.by === playerId;
		case "lobby-join": return message.playerId === playerId;
		case "shot":
		case "shot-request":
		case "trigger-state":
		case "shot-result":
		case "state-feedback":
		case "melee":
		case "grenade-throw":
		case "grenade-result":
		case "hit":
		case "support-activate":
		case "ping":
		case "pickup":
		case "pickup-result":
		case "window-break":
		case "high-score":
		case "leaderboard-sync":
		case "overdrive-claim":
		case "overdrive-state":
		case "lobby-ready":
		case "lobby-team":
		case "lobby-handicap":
		case "lobby-squad":
		case "lobby-skin":
		case "lobby-stance":
		case "emote":
		case "redeploy-request":
		case "redeploy-commit":
		case "reload-intent":
		case "reload-result":
		case "railgun-claim-request":
		case "railgun-shot-request":
		case "railgun-shot-result":
		case "railgun-state":
		case "sticky-attached":
		case "lobby-config":
		case "lobby-balance":
		case "lobby-state":
		case "lobby-start":
		case "clock-ping":
		case "clock-pong":
		case "match-score":
		case "range-score-claim":
		case "chat-submit":
		case "chat-message":
		case "chat-history": return message.by === playerId;
		case "death": return message.victim === playerId;
		case "leave": return message.playerId === playerId;
		case "lobby-reject":
		case "lobby-closed": return false;
	}
}
function isHostAuthorityMessage(message) {
	return isKillstreakProtocolMessage(message) && isKillstreakHostAuthorityMessage(message) || isHostSuccessionProtocolMessage(message) || isFlashProtocolMessage(message) || message.type === "interactive-world-snapshot" || message.type === "smoke-state" || message.type === "lobby-config" || message.type === "guest-resume-authority" || message.type === "guest-resume-failure" || message.type === "lobby-state" || message.type === "lobby-start" || message.type === "lobby-reject" || message.type === "lobby-closed" || message.type === "clock-pong" || message.type === "death" || message.type === "shot-result" || message.type === "grenade-result" || message.type === "match-score" || message.type === "chat-message" || message.type === "chat-history" || message.type === "redeploy-commit" || message.type === "reload-result" || message.type === "pickup-result" || message.type === "railgun-state" || message.type === "timed-map-weapon-state" || message.type === "flare-presentation-state" || message.type === "bot-weapon-presentation" || message.type === "railgun-shot-result" || message.type === "bot-state" || message.type === "bot-damage" || message.type === "hit" && message.hostAuthority !== void 0 || message.type === "window-break" && message.hostAuthority !== void 0;
}
function isStateTrafficMessage(message) {
	return message.type === "state" || message.type === "bot-state" || message.type === "railgun-state" || message.type === "killstreak-state" || message.type === "interactive-world-snapshot" || message.type === "smoke-state" || message.type === "timed-map-weapon-state" || message.type === "flare-presentation-state";
}
//#endregion
//#region src/weapon-model.ts
var PASS65_AUTHORED_FIREARM_IDS = Object.freeze([
	"carbine",
	"smg",
	"lmg",
	"scattergun",
	"sniper",
	"railgun",
	"pistol",
	"magnum",
	"machine-pistol",
	"mini-uzi",
	"mp5",
	"m4a1",
	"ak-47",
	"minigun",
	"m14-ebr",
	"slug-shotgun",
	"flashlight-pistol",
	"flamethrower",
	"flare-gun"
]);
/**
* HF-334: weapons that deliberately reuse another weapon's authored delivery.
* A livery variant is the same physical weapon in a different finish, so it
* ships no second multi-megabyte GLB and appears in no authored-asset roster.
* Anything listed here MUST differ only in finish/tuning, never in geometry.
*/
var WEAPON_LIVERY_ALIASES = Object.freeze({ "crimson-flamethrower": "flamethrower" });
var PASS65_WEAPON_CACHE_BUDGET = Object.freeze({
	"first-person": 2,
	world: PASS65_AUTHORED_FIREARM_IDS.length,
	drop: PASS65_AUTHORED_FIREARM_IDS.length
});
var PASS65_RUNTIME_WEAPON_CORPUS_BUDGET = Object.freeze({
	variants: Object.freeze(["world", "drop"]),
	assets: (WEAPON_IDS.length - Object.keys(WEAPON_LIVERY_ALIASES).length + 1) * 2,
	maximumCompressedBytes: 12 * 1024 * 1024,
	maximumEstimatedDecodedBytes: 128 * 1024 * 1024,
	maximumAllVariantEstimatedDecodedBytes: 160 * 1024 * 1024,
	yieldEveryAssets: 1
});
var PASS65_CROSSBOW_URLS = Object.freeze({
	"first-person": "./assets/original/models/weapons/pass65-crossbow/pass65-crossbow-fp-lod0.glb",
	world: "./assets/original/models/weapons/pass65-crossbow/pass65-crossbow-world-lod0.glb",
	drop: "./assets/original/models/weapons/pass65-crossbow/pass65-crossbow-drop-lod0.glb"
});
var PASS65_FIELD_KNIFE_URLS = Object.freeze({
	"first-person": "./assets/original/models/weapons/pass65-field-knife/pass65-field-knife-fp-lod0.glb",
	world: "./assets/original/models/weapons/pass65-field-knife/pass65-field-knife-world-lod0.glb",
	drop: "./assets/original/models/weapons/pass65-field-knife/pass65-field-knife-drop-lod0.glb"
});
var familyUrls = (id) => Object.freeze({
	"first-person": `./assets/original/models/weapons/pass65-firearms/${id}/${id}-fp-lod0.glb`,
	world: `./assets/original/models/weapons/pass65-firearms/${id}/${id}-world-lod0.glb`,
	drop: `./assets/original/models/weapons/pass65-firearms/${id}/${id}-drop-lod0.glb`
});
var PASS65_AUTHORED_WEAPON_URLS = Object.freeze(Object.fromEntries(PASS65_AUTHORED_FIREARM_IDS.map((id) => [id, familyUrls(id)])));
var authoredIdSet = new Set(PASS65_AUTHORED_FIREARM_IDS);
var cache = /* @__PURE__ */ new Map();
var loading = /* @__PURE__ */ new Map();
var pass65CrossbowAssets = /* @__PURE__ */ new Map();
var pass65CrossbowLoads = /* @__PURE__ */ new Map();
var pass65FieldKnifeAssets = /* @__PURE__ */ new Map();
var pass65FieldKnifeLoads = /* @__PURE__ */ new Map();
var useCounter = 0;
var runtimeCorpusPrewarmPromise = null;
var runtimeCorpusPrewarmProfile = null;
function loader() {
	return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}
function textureBindings(asset) {
	const bindings = [];
	const materials = [];
	const seenMaterials = /* @__PURE__ */ new Set();
	asset.scene.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
		for (const material of nodeMaterials) {
			if (seenMaterials.has(material)) continue;
			seenMaterials.add(material);
			materials.push(material);
		}
	});
	for (const material of materials) {
		const writable = material;
		for (const [property, value] of Object.entries(material).sort(([left], [right]) => left.localeCompare(right))) {
			if (!(value instanceof Texture)) continue;
			bindings.push(Object.freeze({
				key: `${material.name}:${property}`,
				texture: value,
				assign: (texture) => {
					writable[property] = texture;
				}
			}));
		}
	}
	return Object.freeze(bindings.sort((left, right) => left.key.localeCompare(right.key)));
}
function textureCompatibility(texture) {
	const image = texture.source.data;
	return [
		Number(image?.width ?? 0),
		Number(image?.height ?? 0),
		texture.colorSpace,
		texture.channel,
		texture.wrapS,
		texture.wrapT,
		texture.magFilter,
		texture.minFilter,
		texture.flipY,
		texture.generateMipmaps
	].join(":");
}
function loadedPresentationAsset(id, variant) {
	if (id === "explosive-crossbow") return pass65CrossbowAssets.get(variant);
	if (id === "field-knife") return pass65FieldKnifeAssets.get(variant);
	return cache.get(cacheKey(id, variant));
}
function allLoadedSourceAssets() {
	return [
		...cache.values(),
		...pass65CrossbowAssets.values(),
		...pass65FieldKnifeAssets.values()
	];
}
function disposeTexturesNoLongerReferenced(candidates) {
	if (candidates.size === 0) return;
	const retained = /* @__PURE__ */ new Set();
	for (const asset of allLoadedSourceAssets()) for (const binding of textureBindings(asset)) retained.add(binding.texture);
	for (const texture of candidates) if (!retained.has(texture)) texture.dispose();
}
/**
* The checked-in asset gate proves the embedded image bytes are identical for
* first-person/world/drop siblings. Share their decoded Texture objects while
* retaining independent geometry, skeleton and animation ownership.
*/
function deduplicatePresentationTextures(id) {
	const loaded = [
		"first-person",
		"world",
		"drop"
	].map((variant) => ({
		variant,
		asset: loadedPresentationAsset(id, variant)
	})).filter((entry) => entry.asset !== void 0);
	if (loaded.length < 2) return;
	const canonical = loaded[0];
	const canonicalBindings = textureBindings(canonical.asset);
	const retired = /* @__PURE__ */ new Set();
	for (const sibling of loaded.slice(1)) {
		const siblingBindings = textureBindings(sibling.asset);
		if (siblingBindings.length !== canonicalBindings.length) throw new Error(`Pass 65 ${id} ${sibling.variant} texture binding count differs from ${canonical.variant}`);
		for (const [index, siblingBinding] of siblingBindings.entries()) {
			const canonicalBinding = canonicalBindings[index];
			if (siblingBinding.key !== canonicalBinding.key || textureCompatibility(siblingBinding.texture) !== textureCompatibility(canonicalBinding.texture)) throw new Error(`Pass 65 ${id} ${sibling.variant} texture binding ${siblingBinding.key} differs from ${canonicalBinding.key}`);
			if (siblingBinding.texture === canonicalBinding.texture) continue;
			retired.add(siblingBinding.texture);
			siblingBinding.assign(canonicalBinding.texture);
		}
	}
	disposeTexturesNoLongerReferenced(retired);
}
function isPass65AuthoredFirearm(id) {
	return authoredIdSet.has(id);
}
function cacheKey(id, variant) {
	return `${variant}:${id}`;
}
function disposeSourceAsset(asset) {
	const geometries = /* @__PURE__ */ new Set();
	const materials = /* @__PURE__ */ new Set();
	const textures = /* @__PURE__ */ new Set();
	asset.scene.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		geometries.add(node.geometry);
		const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
		for (const material of nodeMaterials) {
			materials.add(material);
			for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
		}
	});
	geometries.forEach((geometry) => geometry.dispose());
	materials.forEach((material) => material.dispose());
	const retainedTextures = /* @__PURE__ */ new Set();
	for (const retainedAsset of allLoadedSourceAssets()) {
		if (retainedAsset === asset) continue;
		for (const binding of textureBindings(retainedAsset)) retainedTextures.add(binding.texture);
	}
	textures.forEach((texture) => {
		if (!retainedTextures.has(texture)) texture.dispose();
	});
}
function enforceCacheBudget(variant, protectedKey) {
	let entries = [...cache.values()].filter((entry) => entry.variant === variant);
	while (entries.length > PASS65_WEAPON_CACHE_BUDGET[variant]) {
		const victim = entries.filter((entry) => entry.refs === 0 && entry.key !== protectedKey).sort((a, b) => a.lastUsed - b.lastUsed)[0];
		if (!victim) return;
		cache.delete(victim.key);
		disposeSourceAsset(victim);
		entries = entries.filter((entry) => entry !== victim);
	}
}
function loadPass65WeaponAsset(id, variant) {
	const key = cacheKey(id, variant);
	const existing = cache.get(key);
	if (existing) {
		existing.lastUsed = ++useCounter;
		return Promise.resolve();
	}
	const pending = loading.get(key);
	if (pending) return pending;
	const promise = loader().loadAsync(PASS65_AUTHORED_WEAPON_URLS[id][variant]).then((gltf) => {
		const entry = {
			key,
			variant,
			scene: gltf.scene,
			clips: gltf.animations,
			refs: 0,
			lastUsed: ++useCounter
		};
		cache.set(key, entry);
		try {
			deduplicatePresentationTextures(id);
		} catch (error) {
			loading.delete(key);
			cache.delete(key);
			disposeSourceAsset(entry);
			throw error;
		}
		loading.delete(key);
		enforceCacheBudget(variant, key);
	}, (error) => {
		loading.delete(key);
		throw error;
	});
	loading.set(key, promise);
	return promise;
}
function loadPass65CrossbowAssets(variant = "first-person") {
	if (pass65CrossbowAssets.has(variant)) return Promise.resolve();
	const pending = pass65CrossbowLoads.get(variant);
	if (pending) return pending;
	const promise = loader().loadAsync(PASS65_CROSSBOW_URLS[variant]).then((gltf) => {
		const asset = {
			scene: gltf.scene,
			clips: gltf.animations
		};
		pass65CrossbowAssets.set(variant, asset);
		try {
			deduplicatePresentationTextures("explosive-crossbow");
		} catch (error) {
			pass65CrossbowLoads.delete(variant);
			pass65CrossbowAssets.delete(variant);
			disposeSourceAsset(asset);
			throw error;
		}
		pass65CrossbowLoads.delete(variant);
	}, (error) => {
		pass65CrossbowLoads.delete(variant);
		throw error;
	});
	pass65CrossbowLoads.set(variant, promise);
	return promise;
}
function loadPass65FieldKnifeAsset(variant) {
	if (pass65FieldKnifeAssets.has(variant)) return Promise.resolve();
	const pending = pass65FieldKnifeLoads.get(variant);
	if (pending) return pending;
	const promise = loader().loadAsync(PASS65_FIELD_KNIFE_URLS[variant]).then((gltf) => {
		const asset = {
			scene: gltf.scene,
			clips: gltf.animations
		};
		pass65FieldKnifeAssets.set(variant, asset);
		try {
			deduplicatePresentationTextures("field-knife");
		} catch (error) {
			pass65FieldKnifeLoads.delete(variant);
			pass65FieldKnifeAssets.delete(variant);
			disposeSourceAsset(asset);
			throw error;
		}
		pass65FieldKnifeLoads.delete(variant);
	}, (error) => {
		pass65FieldKnifeLoads.delete(variant);
		throw error;
	});
	pass65FieldKnifeLoads.set(variant, promise);
	return promise;
}
function loadPass65WeaponPresentation(id, variant) {
	if (id === "explosive-crossbow") return loadPass65CrossbowAssets(variant);
	const authoredId = authoredFirearmIdFor(id);
	return authoredId ? loadPass65WeaponAsset(authoredId, variant) : Promise.resolve();
}
function runtimeCorpusReady() {
	return PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.variants.every((variant) => WEAPON_IDS.every((id) => {
		if (id === "explosive-crossbow") return pass65CrossbowAssets.has(variant);
		const authoredId = authoredFirearmIdFor(id);
		return authoredId === null || cache.has(cacheKey(authoredId, variant));
	}) && pass65FieldKnifeAssets.has(variant));
}
async function defaultRuntimeCorpusYield() {
	await yieldBrowserPreparationFrame();
}
/**
* Sequentially decodes the complete third-person/drop corpus while the menu
* video owns presentation. Retaining these 38 small sources prevents bot
* arsenal cycling and corpse drops from scheduling GLTF parse work in combat.
*/
async function prewarmPass65RuntimeWeaponCorpus(yieldToBrowser = defaultRuntimeCorpusYield) {
	if (runtimeCorpusReady()) {
		if (!runtimeCorpusPrewarmProfile) runtimeCorpusPrewarmProfile = Object.freeze({
			requestedAssets: PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.assets,
			loadedAssets: 0,
			durationMs: 0,
			completed: true,
			error: null
		});
		return;
	}
	if (runtimeCorpusPrewarmPromise) return runtimeCorpusPrewarmPromise;
	const startedAt = performance.now();
	let loadedAssets = 0;
	const operation = (async () => {
		for (const variant of PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.variants) {
			for (const id of WEAPON_IDS) {
				if (id in WEAPON_LIVERY_ALIASES) continue;
				await loadPass65WeaponPresentation(id, variant);
				loadedAssets += 1;
				if (loadedAssets % PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.yieldEveryAssets === 0) await yieldToBrowser();
			}
			await loadPass65FieldKnifeAsset(variant);
			loadedAssets += 1;
			if (loadedAssets % PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.yieldEveryAssets === 0) await yieldToBrowser();
		}
		runtimeCorpusPrewarmProfile = Object.freeze({
			requestedAssets: PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.assets,
			loadedAssets,
			durationMs: Number((performance.now() - startedAt).toFixed(3)),
			completed: true,
			error: null
		});
	})().catch((error) => {
		runtimeCorpusPrewarmProfile = Object.freeze({
			requestedAssets: PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.assets,
			loadedAssets,
			durationMs: Number((performance.now() - startedAt).toFixed(3)),
			completed: false,
			error: error instanceof Error ? error.message : String(error)
		});
		throw error;
	}).finally(() => {
		if (runtimeCorpusPrewarmPromise === operation) runtimeCorpusPrewarmPromise = null;
	});
	runtimeCorpusPrewarmPromise = operation;
	return operation;
}
var PASS70_FIRST_PERSON_OPTIC_WINDOW_CONTRACT = "semantic-first-person-optic-window-v1";
var PASS70_FIRST_PERSON_OPTIC_WINDOW_OPACITY = .02;
var PASS70_RAILGUN_HIP_OPTIC_CONTRACT = "clear-glass-and-opaque-backer-component-v3";
var PASS70_FLARE_GUN_FIRST_PERSON_WIDTH_CONTRACT = "mesh-geometry-only-socket-invariant-width-v1";
var PASS70_FLARE_GUN_FIRST_PERSON_WIDTH_MULTIPLIER = 3.5;
var PASS70_CROSSBOW_LOADED_BOLT_CLEARANCE_CONTRACT = "semantic-loaded-bolt-local-y-zero-v1";
var HF405_COMPACT_OPTIC_BORE_CONTRACT = "authored-optic-assembly-bore-spatial-degenerate-v1";
/**
* Bore radius as a fraction of the ocular lens radius. The lens is the widest
* thing the shooter may see through, so the corridor stays comfortably inside
* it: wide enough to clear the housing caps, never wide enough to reach the
* tube's side walls or the authored reticle's outer arms.
*/
var HF405_COMPACT_OPTIC_BORE_LENS_FRACTION = .74;
/** Restores the semantic loaded bolt after the shipped NLA bind pose leaked its empty-reload offset. */
function resetPass70CrossbowLoadedBoltRestPose(bolt) {
	bolt.position.set(0, 0, 0);
	bolt.userData.pass70ClearanceContract = PASS70_CROSSBOW_LOADED_BOLT_CLEARANCE_CONTRACT;
}
/** Keeps authored longitudinal fire/reload travel while preventing it from rising through the optic lenses. */
function clampPass70CrossbowLoadedBoltAnimation(bolt) {
	bolt.position.y = 0;
}
function isFirstPersonOpticWindowSurface(nodeName, materialName) {
	const materialSemantic = materialName.trim().toLowerCase();
	if (/(?:^|[_\-\s])(?:optic)?lens$/u.test(materialSemantic) || /(?:^|[_\-\s])(?:optic|scope|sight)(?:glass|window)$/u.test(materialSemantic)) return true;
	if (materialSemantic !== "") return false;
	const nodeSemantic = nodeName.trim().toLowerCase();
	return /(?:^|[_\-\s])(?:optic)?lens(?:$|[_\-\s])/u.test(nodeSemantic) || /(?:^|[_\-\s])(?:optic|scope|sight)(?:glass|window)(?:$|[_\-\s])/u.test(nodeSemantic);
}
function isFirstPersonPresentationDetailSurface(nodeName, materialName) {
	return /reticle/u.test(`${nodeName} ${materialName}`.toLowerCase());
}
function applyPass70WeaponMaterialSemantics(material, nodeName, sourceMaterialName, variant) {
	material.name = sourceMaterialName;
	if (variant !== "first-person") {
		material.transparent = false;
		material.opacity = 1;
		material.depthWrite = true;
		return "non-first-person";
	}
	const surface = isFirstPersonOpticWindowSurface(nodeName, sourceMaterialName) ? "optic-window" : isFirstPersonPresentationDetailSurface(nodeName, sourceMaterialName) ? "presentation-detail" : "opaque-body";
	const opticWindow = surface === "optic-window";
	material.transparent = opticWindow;
	material.opacity = opticWindow ? PASS70_FIRST_PERSON_OPTIC_WINDOW_OPACITY : 1;
	material.depthTest = true;
	material.depthWrite = !opticWindow;
	material.alphaTest = opticWindow ? 0 : material.alphaTest;
	material.userData.pass70FirstPersonMaterialContract = PASS70_FIRST_PERSON_OPTIC_WINDOW_CONTRACT;
	material.userData.pass70FirstPersonSurface = surface;
	if (opticWindow && material instanceof MeshStandardMaterial) {
		material.metalness = .04;
		material.roughness = .12;
	}
	return surface;
}
function capturePass70FirstPersonMaterialState(root) {
	const seen = /* @__PURE__ */ new Set();
	const opticWindows = [];
	let materialCount = 0;
	let markedMaterialCount = 0;
	let opticWindowCount = 0;
	let opaqueBodyCount = 0;
	let presentationDetailCount = 0;
	let invalidOpticWindowCount = 0;
	let invalidOpaqueBodyCount = 0;
	root.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		let ancestor = node;
		while (ancestor && ancestor !== root.parent) {
			if (!ancestor.visible) return;
			ancestor = ancestor.parent;
		}
		const materials = Array.isArray(node.material) ? node.material : [node.material];
		for (const material of materials) {
			if (seen.has(material)) continue;
			seen.add(material);
			materialCount += 1;
			const marked = material.userData.pass70FirstPersonMaterialContract === PASS70_FIRST_PERSON_OPTIC_WINDOW_CONTRACT;
			if (marked) markedMaterialCount += 1;
			if (marked && material.userData.pass70FirstPersonSurface === "optic-window") {
				opticWindowCount += 1;
				opticWindows.push({
					mesh: node.name,
					material: material.name,
					opacity: material.opacity,
					transparent: material.transparent,
					depthWrite: material.depthWrite
				});
				if (!material.transparent || material.opacity !== .02 || material.depthWrite) invalidOpticWindowCount += 1;
			} else if (marked && material.userData.pass70FirstPersonSurface === "presentation-detail") presentationDetailCount += 1;
			else {
				opaqueBodyCount += 1;
				if (material.transparent || material.opacity !== 1 || !material.depthWrite) invalidOpaqueBodyCount += 1;
			}
		}
	});
	return Object.freeze({
		contract: PASS70_FIRST_PERSON_OPTIC_WINDOW_CONTRACT,
		materialCount,
		markedMaterialCount,
		opticWindowCount,
		opaqueBodyCount,
		presentationDetailCount,
		invalidOpticWindowCount,
		invalidOpaqueBodyCount,
		opticWindows: Object.freeze(opticWindows.map((entry) => Object.freeze(entry)))
	});
}
var NO_COMPACT_OPTIC_BORE = Object.freeze({
	applied: false,
	contract: HF405_COMPACT_OPTIC_BORE_CONTRACT,
	corridorLengthMeters: 0,
	rayCount: 0,
	boreRadiusMeters: 0,
	submittedElements: 0,
	suppressedElements: 0,
	batches: Object.freeze([])
});
/**
* HF-405 — "need a better scope 1.5x on the crossbow".
*
* THE DEFECT THIS CLOSES. The authored compact optic is a CAPPED cylinder.
* Both lenses are correctly marked as clear optic windows (2% opacity), but
* the housing between them closes at each end, so aiming down the crossbow's
* 1.5x put a solid gunmetal disc exactly on the aim point: the sight picture
* was the end cap, not the world, and the authored illuminated reticle sat
* behind it where nothing could ever see it. Magnification had already been
* fixed; the glass you looked through was still a wall. Measured on the gun
* range: hiding the housing mesh alone restored both the view and the reticle.
*
* WHY A BORE AND NOT A HIDDEN MESH. Hiding the housing deletes the optic from
* every angle — hip, third person and the whole approach to ADS — for a defect
* that is two triangle fans deep. Degenerating only the cloned indices that
* actually block the rear-to-front corridor keeps the housing, its silhouette,
* its materials, its sockets and the source GLB exactly as authored, and is
* the same spatial-degeneration contract `carvePass70RailgunHipOpticBacker`
* already uses for the railgun's opaque backer.
*
* SAFETY. Only meshes under the authored optic assembly with an opaque-body
* material are eligible: the semantic lenses stay, the illuminated reticle
* stays, and nothing outside the optic can be reached. Geometries have already
* been cloned per instance by `cloneMeshGeometriesForOwner`, so the mutation
* cannot leak into the world/drop variants or another mounted copy.
*/
function carveHf405CompactOpticBore(assembly, ocular, rearSocket, frontSocket) {
	assembly.updateWorldMatrix(true, true);
	const rear = rearSocket.getWorldPosition(new Vector3());
	const front = frontSocket.getWorldPosition(new Vector3());
	const axis = front.clone().sub(rear);
	if (axis.lengthSq() < 1e-12) return NO_COMPACT_OPTIC_BORE;
	axis.normalize();
	ocular.geometry.computeBoundingBox();
	const ocularBounds = ocular.geometry.boundingBox;
	if (!ocularBounds) return NO_COMPACT_OPTIC_BORE;
	const ocularScale = ocular.getWorldScale(new Vector3());
	const ocularSize = ocularBounds.getSize(new Vector3());
	const boreRadius = [
		Math.abs(ocularSize.x * ocularScale.x),
		Math.abs(ocularSize.y * ocularScale.y),
		Math.abs(ocularSize.z * ocularScale.z)
	].sort((left, right) => right - left)[0] / 2 * HF405_COMPACT_OPTIC_BORE_LENS_FRACTION;
	if (!Number.isFinite(boreRadius) || boreRadius <= 0) return NO_COMPACT_OPTIC_BORE;
	const optic = rear.distanceTo(front);
	const corridorStart = -optic * .5;
	const corridorEnd = optic * 1.5;
	const offset = new Vector3();
	const insideBore = (vertex) => {
		offset.subVectors(vertex, rear);
		const along = offset.dot(axis);
		if (along < corridorStart || along > corridorEnd) return false;
		return offset.addScaledVector(axis, -along).length() <= boreRadius;
	};
	const lateral = new Vector3(1, 0, 0);
	if (Math.abs(lateral.dot(axis)) > .9) lateral.set(0, 1, 0);
	lateral.addScaledVector(axis, -lateral.dot(axis)).normalize();
	const vertical = new Vector3().crossVectors(axis, lateral).normalize();
	const start = rear.clone().addScaledVector(axis, corridorStart);
	const maximumDistance = corridorEnd - corridorStart;
	const rays = [new Ray(start.clone(), axis)];
	for (const radius of [
		.35,
		.65,
		.92
	]) for (let step = 0; step < 12; step += 1) {
		const angle = step / 12 * Math.PI * 2;
		rays.push(new Ray(start.clone().addScaledVector(lateral, Math.cos(angle) * radius * boreRadius).addScaledVector(vertical, Math.sin(angle) * radius * boreRadius), axis));
	}
	const a = new Vector3();
	const b = new Vector3();
	const c = new Vector3();
	const hit = new Vector3();
	const batches = [];
	let submittedElements = 0;
	let suppressedElements = 0;
	assembly.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		if (!(Array.isArray(node.material) ? node.material : [node.material]).some((material) => material.userData.pass70FirstPersonSurface === "opaque-body")) return;
		const position = node.geometry.getAttribute("position");
		const index = node.geometry.index;
		const elementCount = index?.count ?? 0;
		if (!position || position.itemSize < 3 || !index || elementCount < 3 || elementCount % 3 !== 0) return;
		submittedElements += elementCount;
		let batchSuppressed = 0;
		for (let element = 0; element < elementCount; element += 3) {
			const ia = index.getX(element);
			const ib = index.getX(element + 1);
			const ic = index.getX(element + 2);
			if (ia === ib && ib === ic) continue;
			a.fromBufferAttribute(position, ia).applyMatrix4(node.matrixWorld);
			b.fromBufferAttribute(position, ib).applyMatrix4(node.matrixWorld);
			c.fromBufferAttribute(position, ic).applyMatrix4(node.matrixWorld);
			if (!(insideBore(a) || insideBore(b) || insideBore(c) || rays.some((ray) => {
				const intersection = ray.intersectTriangle(a, b, c, false, hit);
				return intersection !== null && ray.origin.distanceTo(intersection) <= maximumDistance;
			}))) continue;
			index.setX(element + 1, ia);
			index.setX(element + 2, ia);
			batchSuppressed += 3;
		}
		if (batchSuppressed === 0) return;
		index.needsUpdate = true;
		node.userData.hf405CompactOpticBore = Object.freeze({
			contract: HF405_COMPACT_OPTIC_BORE_CONTRACT,
			submittedElements: elementCount,
			suppressedElements: batchSuppressed,
			boreRadiusMeters: boreRadius
		});
		batches.push(Object.freeze({
			mesh: node.name,
			submittedElements: elementCount,
			suppressedElements: batchSuppressed
		}));
		suppressedElements += batchSuppressed;
	});
	const state = Object.freeze({
		applied: suppressedElements > 0,
		contract: HF405_COMPACT_OPTIC_BORE_CONTRACT,
		corridorLengthMeters: corridorEnd - corridorStart,
		rayCount: rays.length,
		boreRadiusMeters: boreRadius,
		submittedElements,
		suppressedElements,
		batches: Object.freeze(batches)
	});
	assembly.userData.hf405CompactOpticBore = state;
	return state;
}
/**
* The authored optic assembly: the node that carries BOTH the optic socket
* semantic and its own authored magnification. `optic-socket` carries the same
* socket semantic but is an empty locator with no magnification and no
* geometry, so the magnification is what separates the assembly from it.
*/
/** The optic window nearest the shooter: the ocular the eye actually looks into. */
function nearestOpticWindowMesh(assembly, rearSocket) {
	assembly.updateWorldMatrix(true, true);
	const rear = rearSocket.getWorldPosition(new Vector3());
	let nearest = null;
	let nearestDistance = Number.POSITIVE_INFINITY;
	assembly.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		if (!(Array.isArray(node.material) ? node.material : [node.material]).some((material) => material.userData.pass70FirstPersonSurface === "optic-window")) return;
		const distance = node.getWorldPosition(new Vector3()).distanceTo(rear);
		if (distance >= nearestDistance) return;
		nearestDistance = distance;
		nearest = node;
	});
	return nearest;
}
function authoredOpticAssembly(model) {
	let assembly = null;
	model.traverse((node) => {
		if (assembly) return;
		if (node.userData.atomic_socket === "optic" && Number.isFinite(node.userData.magnification)) assembly = node;
	});
	return assembly;
}
/**
* Opens the cloned opaque material immediately behind the Railgun's semantic
* lens. The delivery uses a thin Lens mesh in front of a closed housing, so
* changing only lens alpha still presents a solid silver block. A bounded
* grid through the lens's own local X/Y frame degenerates intersected cloned
* indices without moving sockets or changing the accepted fullscreen ADS.
*/
function carvePass70RailgunHipOpticBacker(model, lens) {
	const geometry = lens.geometry;
	geometry.computeBoundingBox();
	const lensBounds = geometry.boundingBox;
	if (!lensBounds) return Object.freeze({
		applied: false,
		contract: "semantic-lens-grid-spatial-degenerate-v1",
		rayCount: 0,
		submittedElements: 0,
		suppressedElements: 0,
		suppressionRatio: 0,
		lensDimensionsMeters: Object.freeze([
			0,
			0,
			0
		]),
		batches: Object.freeze([])
	});
	model.updateMatrixWorld(true);
	const lensCentre = lens.localToWorld(lensBounds.getCenter(new Vector3()));
	const lensLocalSize = lensBounds.getSize(new Vector3());
	const lensWorldScale = lens.getWorldScale(new Vector3());
	const lensDimensions = new Vector3(Math.abs(lensLocalSize.x * lensWorldScale.x), Math.abs(lensLocalSize.y * lensWorldScale.y), Math.abs(lensLocalSize.z * lensWorldScale.z));
	const lensRotation = lens.getWorldQuaternion(new Quaternion());
	const lateral = new Vector3(1, 0, 0).applyQuaternion(lensRotation).normalize();
	const vertical = new Vector3(0, 1, 0).applyQuaternion(lensRotation).normalize();
	const normal = new Vector3(0, 0, 1).applyQuaternion(lensRotation).normalize();
	const halfApertureWidth = lensDimensions.x * .32;
	const halfApertureHeight = lensDimensions.y * .32;
	const corridorHalfDepth = Math.max(.16, lensDimensions.z * 8);
	const rays = Object.freeze([
		[-.85, -.85],
		[-.425, -.85],
		[0, -.85],
		[.425, -.85],
		[.85, -.85],
		[-.85, 0],
		[-.425, 0],
		[0, 0],
		[.425, 0],
		[.85, 0],
		[-.85, .85],
		[-.425, .85],
		[0, .85],
		[.425, .85],
		[.85, .85]
	]).map(([x, y]) => new Ray(lensCentre.clone().addScaledVector(normal, -corridorHalfDepth).addScaledVector(lateral, x * halfApertureWidth).addScaledVector(vertical, y * halfApertureHeight), normal));
	const maximumDistance = corridorHalfDepth * 2;
	const a = new Vector3();
	const b = new Vector3();
	const c = new Vector3();
	const hit = new Vector3();
	const batches = [];
	let submittedElements = 0;
	let suppressedElements = 0;
	model.traverse((node) => {
		if (!(node instanceof Mesh) || node === lens || !node.name.includes("Runtime_static")) return;
		if (!(Array.isArray(node.material) ? node.material : [node.material]).some((material) => material.userData.pass70FirstPersonSurface === "opaque-body" && material.transparent === false && material.opacity === 1)) return;
		const position = node.geometry.getAttribute("position");
		const index = node.geometry.index;
		const elementCount = index?.count ?? 0;
		if (!position || position.itemSize < 3 || !index || elementCount < 3 || elementCount % 3 !== 0) return;
		submittedElements += elementCount;
		const triangles = [];
		const trianglesByVertex = /* @__PURE__ */ new Map();
		const seedTriangles = [];
		for (let element = 0; element < elementCount; element += 3) {
			const ia = index.getX(element);
			const ib = index.getX(element + 1);
			const ic = index.getX(element + 2);
			const triangle = element / 3;
			triangles.push(Object.freeze([
				ia,
				ib,
				ic
			]));
			for (const vertex of /* @__PURE__ */ new Set([
				ia,
				ib,
				ic
			])) {
				const adjacent = trianglesByVertex.get(vertex) ?? [];
				adjacent.push(triangle);
				trianglesByVertex.set(vertex, adjacent);
			}
			if (ia === ib && ib === ic) continue;
			a.fromBufferAttribute(position, ia).applyMatrix4(node.matrixWorld);
			b.fromBufferAttribute(position, ib).applyMatrix4(node.matrixWorld);
			c.fromBufferAttribute(position, ic).applyMatrix4(node.matrixWorld);
			if (!rays.some((ray) => {
				const intersection = ray.intersectTriangle(a, b, c, false, hit);
				return intersection !== null && ray.origin.distanceTo(intersection) <= maximumDistance;
			})) continue;
			seedTriangles.push(triangle);
		}
		if (seedTriangles.length === 0) return;
		const connectedTriangles = /* @__PURE__ */ new Set();
		const pending = [...seedTriangles];
		while (pending.length > 0) {
			const triangle = pending.pop();
			if (connectedTriangles.has(triangle)) continue;
			connectedTriangles.add(triangle);
			for (const vertex of triangles[triangle] ?? []) for (const adjacent of trianglesByVertex.get(vertex) ?? []) if (!connectedTriangles.has(adjacent)) pending.push(adjacent);
		}
		for (const triangle of connectedTriangles) {
			const element = triangle * 3;
			const anchor = index.getX(element);
			index.setX(element + 1, anchor);
			index.setX(element + 2, anchor);
		}
		const batchSuppressed = connectedTriangles.size * 3;
		index.needsUpdate = true;
		node.userData.pass70RailgunHipOpticBacker = Object.freeze({
			contract: "semantic-lens-grid-spatial-degenerate-v1",
			submittedElements: elementCount,
			seedElements: seedTriangles.length * 3,
			suppressedElements: batchSuppressed
		});
		batches.push(Object.freeze({
			mesh: node.name,
			submittedElements: elementCount,
			seedElements: seedTriangles.length * 3,
			suppressedElements: batchSuppressed
		}));
		suppressedElements += batchSuppressed;
	});
	return Object.freeze({
		applied: suppressedElements > 0,
		contract: "semantic-lens-grid-spatial-degenerate-v1",
		rayCount: rays.length,
		submittedElements,
		suppressedElements,
		suppressionRatio: submittedElements > 0 ? suppressedElements / submittedElements : 0,
		lensDimensionsMeters: Object.freeze(lensDimensions.toArray()),
		batches: Object.freeze(batches)
	});
}
function flattenMaterial(material) {
	const source = material;
	const flattened = new MeshStandardMaterial({
		color: source.color?.clone() ?? new Color(3160388),
		map: source.map ?? null,
		normalMap: source.normalMap ?? null,
		roughnessMap: source.roughnessMap ?? null,
		metalnessMap: source.metalnessMap ?? null,
		emissive: source.emissive?.clone() ?? new Color(0),
		emissiveMap: source.emissiveMap ?? null,
		emissiveIntensity: source.emissiveIntensity ?? 1,
		roughness: source.roughness ?? .5,
		metalness: source.metalness ?? .5,
		transparent: false,
		opacity: 1,
		alphaTest: source.alphaTest,
		side: source.side,
		depthWrite: true
	});
	flattened.name = source.name;
	return flattened;
}
function instantiateWeaponAsset(id, variant, asset, source, flattenMaterials, managed) {
	const root = new Group();
	root.name = `${id}-pass65-${variant}-model`;
	const visual = clone(asset.scene);
	visual.name = `${id}-pass65-${variant}-visual`;
	const railgunClearLensMeshes = [];
	const railgunClearLensNodes = [];
	visual.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		node.castShadow = !flattenMaterials;
		node.receiveShadow = !flattenMaterials;
		let containsOpticWindow = false;
		const prepare = (material) => {
			const result = flattenMaterials ? flattenMaterial(material) : material.clone();
			if (applyPass70WeaponMaterialSemantics(result, node.name, material.name, variant) === "optic-window") containsOpticWindow = true;
			return result;
		};
		node.material = Array.isArray(node.material) ? node.material.map(prepare) : prepare(node.material);
		if (containsOpticWindow) {
			node.userData.dynamic = true;
			node.userData.pass70FirstPersonOpticWindow = true;
			node.castShadow = false;
			node.receiveShadow = false;
			if (id === "railgun" && variant === "first-person") {
				railgunClearLensMeshes.push(node.name);
				railgunClearLensNodes.push(node);
			}
		}
		node.userData.presentationOnly = true;
	});
	cloneMeshGeometriesForOwner(visual, `pass65-${id}-${variant}`);
	const railgunHipOpticAperture = id === "railgun" && variant === "first-person" && railgunClearLensNodes.length === 1 ? carvePass70RailgunHipOpticBacker(visual, railgunClearLensNodes[0]) : null;
	if (id === "railgun" && variant === "first-person" && !railgunHipOpticAperture?.applied) throw new Error("Railgun first-person semantic lens did not intersect its cloned opaque backer");
	if (id === "explosive-crossbow" && variant === "first-person") {
		const assembly = authoredOpticAssembly(visual);
		if (assembly) {
			const rearSocket = visual.getObjectByName("rear-sight-socket");
			const frontSocket = visual.getObjectByName("front-sight-socket");
			const ocular = rearSocket ? nearestOpticWindowMesh(assembly, rearSocket) : null;
			if (!rearSocket || !frontSocket || !ocular) throw new Error("Explosive crossbow first-person optic assembly has no sight sockets or ocular lens");
			if (!carveHf405CompactOpticBore(assembly, ocular, rearSocket, frontSocket).applied) throw new Error("Explosive crossbow compact optic bore did not intersect its cloned housing");
		}
	}
	if (id === "flare-gun" && variant === "first-person") {
		const socketNames = [
			"grip-socket-r",
			"support-socket-l",
			"reload-socket-l",
			"muzzle-socket"
		];
		visual.updateWorldMatrix(true, true);
		const socketsBefore = new Map(socketNames.map((name) => [name, visual.getObjectByName(name)?.getWorldPosition(new Vector3()) ?? null]));
		const boundsBefore = new Box3().setFromObject(visual);
		let widenedMeshCount = 0;
		visual.traverse((node) => {
			if (!(node instanceof Mesh)) return;
			node.geometry.scale(PASS70_FLARE_GUN_FIRST_PERSON_WIDTH_MULTIPLIER, 1, 1);
			node.geometry.computeBoundingBox();
			node.geometry.computeBoundingSphere();
			node.userData.pass70FirstPersonWidthContract = PASS70_FLARE_GUN_FIRST_PERSON_WIDTH_CONTRACT;
			widenedMeshCount += 1;
		});
		visual.updateWorldMatrix(true, true);
		let maximumSocketDriftMeters = 0;
		for (const name of socketNames) {
			const before = socketsBefore.get(name);
			const socket = visual.getObjectByName(name);
			if (!before || !socket) continue;
			maximumSocketDriftMeters = Math.max(maximumSocketDriftMeters, before.distanceTo(socket.getWorldPosition(new Vector3())));
		}
		if (maximumSocketDriftMeters > 1e-9) throw new Error(`Flare Gun first-person visual widening moved an authored socket by ${maximumSocketDriftMeters}m`);
		const boundsAfter = new Box3().setFromObject(visual);
		const sourceWidth = boundsBefore.max.x - boundsBefore.min.x;
		const widenedWidth = boundsAfter.max.x - boundsAfter.min.x;
		visual.userData.pass70FirstPersonWidth = Object.freeze({
			contract: PASS70_FLARE_GUN_FIRST_PERSON_WIDTH_CONTRACT,
			multiplier: PASS70_FLARE_GUN_FIRST_PERSON_WIDTH_MULTIPLIER,
			widenedMeshCount,
			sourceWidth,
			widenedWidth,
			measuredMultiplier: sourceWidth > 1e-9 ? widenedWidth / sourceWidth : null,
			maximumSocketDriftMeters
		});
	}
	root.add(visual);
	const crossbowLoadedBolt = id === "explosive-crossbow" ? visual.getObjectByName("crossbow-loaded-bolt") ?? null : null;
	if (id === "explosive-crossbow") {
		if (!crossbowLoadedBolt || crossbowLoadedBolt.userData.atomic_socket !== "bolt") throw new Error("Pass 70 crossbow loaded-bolt semantic node is missing");
		resetPass70CrossbowLoadedBoltRestPose(crossbowLoadedBolt);
	}
	const identityNodes = [];
	visual.traverse((node) => {
		if (node.userData.asset_id === `pass65-weapon-${id}`) identityNodes.push(node);
	});
	const identity = identityNodes[0]?.userData;
	const mixer = new AnimationMixer(visual);
	const actions = new Map(asset.clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
	root.userData.importedWeaponRuntime = {
		mixer,
		actions,
		weapon: id,
		crossbowLoadedBolt
	};
	root.userData.importedWeaponSource = source;
	root.userData.firstPersonSource = variant === "first-person" ? "project-original-blender-pass65-firearm" : void 0;
	root.userData.projectOriginalWeapon = true;
	root.userData.deliveryVariant = variant;
	root.userData.runtimeForwardAxis = "-Z";
	root.userData.weaponModelId = String(identity?.design_id ?? `pass65-${id}-project-original-v1`);
	root.userData.weaponFinishId = `${id}-project-original-pbr-v1`;
	root.userData.weaponDisplayName = identity?.display_name ?? id;
	root.userData.silhouetteFamily = identity?.silhouette_family ?? null;
	root.userData.pass65ManagedCacheKey = managed?.key;
	root.userData.pass65ManagedCacheReleased = false;
	root.userData.pass70FirstPersonWidth = visual.userData.pass70FirstPersonWidth ?? null;
	root.userData.pass70RailgunHipOptic = id === "railgun" && variant === "first-person" ? Object.freeze({
		contract: PASS70_RAILGUN_HIP_OPTIC_CONTRACT,
		clearGlassLensMeshCount: railgunClearLensMeshes.length,
		clearGlassLensMeshes: Object.freeze([...railgunClearLensMeshes]),
		opticWindowOpacity: PASS70_FIRST_PERSON_OPTIC_WINDOW_OPACITY,
		opaqueBackerAperture: railgunHipOpticAperture,
		adsAuthority: "railgun-fullscreen-scope-unchanged"
	}) : null;
	if (managed) {
		managed.refs += 1;
		managed.lastUsed = ++useCounter;
	}
	return root;
}
/** Project-original Pass 65 crossbow. Embedded Blender sockets remain the sole socket authority. */
function createPass65CrossbowModel(flattenMaterials, variant) {
	const asset = pass65CrossbowAssets.get(variant);
	if (!asset) return null;
	const root = instantiateWeaponAsset("explosive-crossbow", variant, asset, PASS65_CROSSBOW_URLS[variant], flattenMaterials);
	root.scale.setScalar(.68);
	root.userData.firstPersonSource = variant === "first-person" ? "project-original-blender-pass65-crossbow" : void 0;
	root.userData.opticMagnification = 1.5;
	return root;
}
/**
* HF-334: weapons that reuse another weapon's authored GLB. The crimson
* flamethrower is the map flamethrower's chassis in a different livery, so it
* resolves to the same authored asset and takes its colour at material time —
* no second multi-megabyte delivery ships for a repaint.
*/
function authoredFirearmIdFor(id) {
	const alias = WEAPON_LIVERY_ALIASES[id];
	if (alias) return alias;
	return PASS65_AUTHORED_FIREARM_IDS.includes(id) ? id : null;
}
function createPass65WeaponModel(id, flattenMaterials, variant) {
	const authoredId = authoredFirearmIdFor(id);
	if (!authoredId) return null;
	const entry = cache.get(cacheKey(authoredId, variant));
	if (!entry) return null;
	const model = instantiateWeaponAsset(id, variant, entry, PASS65_AUTHORED_WEAPON_URLS[authoredId][variant], flattenMaterials, entry);
	if (model) model.userData.liveryWeaponId = id;
	return model;
}
function createPass65FieldKnifeModel(flattenMaterials, variant) {
	const asset = pass65FieldKnifeAssets.get(variant);
	if (!asset) return null;
	const root = instantiateWeaponAsset("field-knife", variant, asset, PASS65_FIELD_KNIFE_URLS[variant], flattenMaterials);
	root.scale.setScalar(.22);
	root.userData.authoredPhysicalLengthM = .49;
	root.userData.firstPersonSource = variant === "first-person" ? "project-original-blender-pass65-field-knife" : void 0;
	root.userData.projectOriginalMeleeWeapon = true;
	return root;
}
/** Compatibility name retained for existing world presentation callers. */
function createImportedWeaponModel(id, flattenMaterials) {
	if (id === "explosive-crossbow") return createPass65CrossbowModel(flattenMaterials, "world");
	return createPass65WeaponModel(id, flattenMaterials, "world");
}
function releasePass65WeaponModel(root) {
	if (root.userData.pass65ManagedCacheReleased === true) return;
	const key = root.userData.pass65ManagedCacheKey;
	if (typeof key !== "string") return;
	root.userData.pass65ManagedCacheReleased = true;
	const entry = cache.get(key);
	if (entry) {
		entry.refs = Math.max(0, entry.refs - 1);
		entry.lastUsed = ++useCounter;
		enforceCacheBudget(entry.variant);
	}
}
function capturePass65PresentationGeneration(root) {
	return Number(root.userData.pass65PresentationGeneration ?? 0);
}
function isPass65PresentationGenerationCurrent(root, generation) {
	return root.userData.pass65PresentationRetired !== true && capturePass65PresentationGeneration(root) === generation;
}
/**
* Invalidate every asynchronous presentation continuation captured below a
* root before that tree is detached. Cache refs are deliberately not released
* here: WebGPU may still have submitted work which references the clone.
*/
function invalidatePass65PresentationTree(root) {
	let invalidated = 0;
	root.traverse((node) => {
		node.userData.pass65PresentationRetired = true;
		node.userData.pass65PresentationGeneration = capturePass65PresentationGeneration(node) + 1;
		invalidated += 1;
	});
	return invalidated;
}
/** Release managed source-cache refs only after the caller's GPU fence. */
function releasePass65WeaponModelsIn(root) {
	let released = 0;
	root.traverse((node) => {
		if (typeof node.userData.pass65ManagedCacheKey !== "string" || node.userData.pass65ManagedCacheReleased === true) return;
		releasePass65WeaponModel(node);
		released += 1;
	});
	return released;
}
/** Dispose one cloned presentation instance without invalidating shared source textures. */
function disposePass65WeaponModel(root) {
	releasePass65WeaponModel(root);
	runtime(root)?.mixer.stopAllAction();
	const geometries = /* @__PURE__ */ new Set();
	const materials = /* @__PURE__ */ new Set();
	root.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		geometries.add(node.geometry);
		(Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => materials.add(material));
	});
	geometries.forEach((geometry) => geometry.dispose());
	materials.forEach((material) => material.dispose());
}
function sourceAssetsForVariant(variant) {
	const assets = [...cache.values()].filter((entry) => entry.variant === variant);
	const crossbow = pass65CrossbowAssets.get(variant);
	const knife = pass65FieldKnifeAssets.get(variant);
	if (crossbow) assets.push(crossbow);
	if (knife) assets.push(knife);
	return assets;
}
function sourceAssetResidency(assets, baselineAssets = []) {
	const arrays = /* @__PURE__ */ new Set();
	const baselineTextures = /* @__PURE__ */ new Set();
	const textures = /* @__PURE__ */ new Set();
	let geometryBytes = 0;
	let textureBytesEstimate = 0;
	for (const asset of baselineAssets) asset.scene.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		const attributes = [node.geometry.index, ...Object.values(node.geometry.attributes)];
		for (const attribute of attributes) {
			if (!attribute) continue;
			const array = attribute instanceof InterleavedBufferAttribute ? attribute.data.array : attribute.array;
			arrays.add(array.buffer);
		}
		const materials = Array.isArray(node.material) ? node.material : [node.material];
		for (const material of materials) for (const value of Object.values(material)) if (value instanceof Texture) baselineTextures.add(value);
	});
	for (const asset of assets) asset.scene.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		const attributes = [node.geometry.index, ...Object.values(node.geometry.attributes)];
		for (const attribute of attributes) {
			if (!attribute) continue;
			const array = attribute instanceof InterleavedBufferAttribute ? attribute.data.array : attribute.array;
			if (arrays.has(array.buffer)) continue;
			arrays.add(array.buffer);
			geometryBytes += array.byteLength;
		}
		const materials = Array.isArray(node.material) ? node.material : [node.material];
		for (const material of materials) for (const value of Object.values(material)) if (value instanceof Texture && !baselineTextures.has(value)) textures.add(value);
	});
	for (const texture of textures) {
		const image = texture.source.data;
		const width = Number(image?.width ?? 0);
		const height = Number(image?.height ?? 0);
		if (width > 0 && height > 0) textureBytesEstimate += Math.ceil(width * height * 4 * (texture.generateMipmaps ? 4 / 3 : 1));
	}
	return Object.freeze({
		assets: assets.length,
		geometryBytes,
		textureBytesEstimate,
		estimatedDecodedBytes: geometryBytes + textureBytesEstimate
	});
}
function pass65WeaponCacheTelemetry() {
	const firstPersonAssets = sourceAssetsForVariant("first-person");
	const worldAssets = sourceAssetsForVariant("world");
	const dropAssets = sourceAssetsForVariant("drop");
	return Object.freeze({
		budgets: PASS65_WEAPON_CACHE_BUDGET,
		loading: loading.size,
		entries: Object.freeze([...cache.values()].map(({ key, variant, refs, lastUsed }) => Object.freeze({
			key,
			variant,
			refs,
			lastUsed
		}))),
		resident: Object.freeze({
			"first-person": sourceAssetResidency(firstPersonAssets),
			world: sourceAssetResidency(worldAssets),
			drop: sourceAssetResidency(dropAssets)
		}),
		runtimeCorpus: Object.freeze({
			policy: PASS65_RUNTIME_WEAPON_CORPUS_BUDGET,
			ready: runtimeCorpusReady(),
			prewarming: runtimeCorpusPrewarmPromise !== null,
			profile: runtimeCorpusPrewarmProfile,
			residency: sourceAssetResidency([...worldAssets, ...dropAssets], firstPersonAssets),
			allVariantsResidency: sourceAssetResidency([
				...firstPersonAssets,
				...worldAssets,
				...dropAssets
			])
		})
	});
}
function runtime(root) {
	const direct = root.userData.importedWeaponRuntime;
	if (direct) return direct;
	let nested = null;
	root.traverse((node) => {
		if (!nested && node !== root && node.userData.importedWeaponRuntime) nested = node.userData.importedWeaponRuntime;
	});
	return nested;
}
var NO_ANIMATED_NODES = Object.freeze(/* @__PURE__ */ new Set());
/**
* Node names the authored Pass 65 clips actually drive. Every firearm parents
* its whole frame under `weapon-action-driver` and every clip translates that
* node, so a mesh below it is static only RELATIVE TO IT - never relative to
* the model root. Consumers that re-parent or merge "static" geometry must
* treat these nodes as the boundary, or the merged body stops following the
* clip while its siblings keep moving.
*/
function importedWeaponAnimatedNodeNames(root) {
	const state = runtime(root);
	if (!state) return NO_ANIMATED_NODES;
	const names = /* @__PURE__ */ new Set();
	for (const action of state.actions.values()) for (const track of action.getClip().tracks) {
		const nodeName = PropertyBinding.parseTrackName(track.name).nodeName;
		if (nodeName) names.add(nodeName);
	}
	return names;
}
function playMatching(root, fragment) {
	const state = runtime(root);
	if (!state) return;
	(state.actions.get(fragment) ?? [...state.actions.entries()].find(([name]) => name.toLowerCase().includes(fragment.toLowerCase()))?.[1])?.reset().setLoop(LoopOnce, 1).play();
}
function updateImportedWeapon(root, dt) {
	const state = runtime(root);
	if (!state) return;
	state.mixer.update(Math.min(.05, Math.max(0, dt)));
	if (state.crossbowLoadedBolt) clampPass70CrossbowLoadedBoltAnimation(state.crossbowLoadedBolt);
}
/** Clears retained firearm/knife actions without advancing presentation time. */
function resetImportedWeaponAnimations(root) {
	const state = runtime(root);
	if (!state) return;
	state.mixer.stopAllAction();
	for (const action of state.actions.values()) action.stop();
	state.mixer.setTime(0);
}
function fireImportedWeapon(root) {
	playMatching(root, "fire");
}
function reloadImportedWeapon(root) {
	playMatching(root, "reload");
}
function meleeImportedWeapon(root) {
	playMatching(root, "melee");
}
function importedWeaponTelemetry(root) {
	if (!root) return null;
	const state = runtime(root);
	if (!state) return null;
	let meshes = 0;
	let renderPrimitives = 0;
	let triangles = 0;
	const socketCounts = /* @__PURE__ */ new Map();
	const contractNames = [
		"muzzle-socket",
		"eject-socket",
		"grip-socket-r",
		"support-socket-l",
		"reload-socket-l",
		"rear-sight-socket",
		"front-sight-socket"
	];
	root.traverse((node) => {
		if (node instanceof Mesh) {
			meshes += 1;
			const geometry = node.geometry;
			const groups = geometry.groups.length;
			renderPrimitives += Math.max(1, groups || (Array.isArray(node.material) ? node.material.length : 1));
			const elementCount = geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0;
			triangles += Math.round(elementCount / 3);
		}
		if (contractNames.includes(node.name)) socketCounts.set(node.name, (socketCounts.get(node.name) ?? 0) + 1);
	});
	const socketContractReady = contractNames.every((name) => socketCounts.get(name) === 1);
	root.updateMatrixWorld(true);
	const localDirection = (fromName, toName) => {
		const from = root.getObjectByName(fromName);
		const to = root.getObjectByName(toName);
		if (!from || !to) return null;
		const fromLocal = root.worldToLocal(from.getWorldPosition(new Vector3()));
		const direction = root.worldToLocal(to.getWorldPosition(new Vector3())).sub(fromLocal);
		if (direction.lengthSq() < 1e-8) return null;
		return direction.normalize().dot(new Vector3(0, 0, -1));
	};
	return {
		source: String(root.userData.importedWeaponSource),
		weapon: state.weapon,
		clips: state.actions.size,
		meshes,
		renderPrimitives,
		triangles,
		detailMeshes: 0,
		socketContractReady,
		muzzleForwardDot: localDirection("grip-socket-r", "muzzle-socket"),
		sightForwardDot: localDirection("rear-sight-socket", "front-sight-socket"),
		firstPersonWidth: root.userData.pass70FirstPersonWidth ?? null,
		firstPersonOptic: root.userData.pass70RailgunHipOptic ?? null
	};
}
//#endregion
//#region src/weapon-finish.ts
var path = (weapon, suffix = "") => `./assets/original/textures/weapon-${weapon}${suffix}.png`;
var WEAPON_FINISH_PROFILES = {
	carbine: {
		id: "hk416-graphite-gold-v1",
		albedo: path("carbine"),
		normal: path("carbine", "-normal"),
		roughness: path("carbine", "-roughness"),
		metalness: .62,
		normalScale: .32,
		textureRepeat: 2
	},
	smg: {
		id: "p90-teal-anodized-v1",
		albedo: path("smg"),
		normal: path("smg", "-normal"),
		roughness: path("smg", "-roughness"),
		metalness: .54,
		normalScale: .36,
		textureRepeat: 2
	},
	lmg: {
		id: "m249-bronze-olive-v1",
		albedo: path("lmg"),
		normal: path("lmg", "-normal"),
		roughness: path("lmg", "-roughness"),
		metalness: .5,
		normalScale: .34,
		textureRepeat: 2
	},
	scattergun: {
		id: "model12-blued-coral-v1",
		albedo: path("scattergun"),
		normal: path("scattergun", "-normal"),
		roughness: path("scattergun", "-roughness"),
		metalness: .48,
		normalScale: .3,
		textureRepeat: 2
	},
	sniper: {
		id: "m40a5-olive-cerakote-v1",
		albedo: path("sniper"),
		normal: path("sniper", "-normal"),
		roughness: path("sniper", "-roughness"),
		metalness: .42,
		normalScale: .28,
		textureRepeat: 2
	},
	railgun: {
		id: "vx8-ceramic-cyan-v1",
		albedo: path("sniper"),
		normal: path("sniper", "-normal"),
		roughness: path("sniper", "-roughness"),
		metalness: .68,
		normalScale: .26,
		textureRepeat: 2
	},
	pistol: {
		id: "glock17-satin-service-v1",
		albedo: path("pistol"),
		normal: path("pistol", "-normal"),
		roughness: path("pistol", "-roughness"),
		metalness: .66,
		normalScale: .25,
		textureRepeat: 2
	},
	magnum: {
		id: "desert-eagle-brushed-brass-v1",
		albedo: path("magnum"),
		normal: path("magnum", "-normal"),
		roughness: path("magnum", "-roughness"),
		metalness: .82,
		normalScale: .3,
		textureRepeat: 2
	},
	"machine-pistol": {
		id: "glock18-ported-graphite-v1",
		albedo: path("machine-pistol"),
		normal: path("machine-pistol", "-normal"),
		roughness: path("machine-pistol", "-roughness"),
		metalness: .6,
		normalScale: .3,
		textureRepeat: 2
	},
	"mini-uzi": {
		id: "mini-uzi-parkerized-v1",
		albedo: path("smg"),
		normal: path("smg", "-normal"),
		roughness: path("smg", "-roughness"),
		metalness: .58,
		normalScale: .34,
		textureRepeat: 2
	},
	mp5: {
		id: "mp5-matte-black-v1",
		albedo: path("smg"),
		normal: path("smg", "-normal"),
		roughness: path("smg", "-roughness"),
		metalness: .5,
		normalScale: .34,
		textureRepeat: 2
	},
	m4a1: {
		id: "m4a1-service-black-v1",
		albedo: path("carbine"),
		normal: path("carbine", "-normal"),
		roughness: path("carbine", "-roughness"),
		metalness: .6,
		normalScale: .32,
		textureRepeat: 2
	},
	"ak-47": {
		id: "ak47-blued-laminate-v1",
		albedo: path("carbine"),
		normal: path("carbine", "-normal"),
		roughness: path("carbine", "-roughness"),
		metalness: .58,
		normalScale: .34,
		textureRepeat: 2
	},
	minigun: {
		id: "m134-gunmetal-v1",
		albedo: path("lmg"),
		normal: path("lmg", "-normal"),
		roughness: path("lmg", "-roughness"),
		metalness: .72,
		normalScale: .38,
		textureRepeat: 2
	},
	"m14-ebr": {
		id: "m14-ebr-sage-v1",
		albedo: path("sniper"),
		normal: path("sniper", "-normal"),
		roughness: path("sniper", "-roughness"),
		metalness: .5,
		normalScale: .3,
		textureRepeat: 2
	},
	"slug-shotgun": {
		id: "benelli-m4-satin-v1",
		albedo: path("scattergun"),
		normal: path("scattergun", "-normal"),
		roughness: path("scattergun", "-roughness"),
		metalness: .54,
		normalScale: .3,
		textureRepeat: 2
	},
	"flashlight-pistol": {
		id: "usp45-tactical-v1",
		albedo: path("pistol"),
		normal: path("pistol", "-normal"),
		roughness: path("pistol", "-roughness"),
		metalness: .66,
		normalScale: .28,
		textureRepeat: 2
	},
	"explosive-crossbow": {
		id: "tac15-carbon-v1",
		albedo: path("pistol"),
		normal: path("pistol", "-normal"),
		roughness: path("pistol", "-roughness"),
		metalness: .42,
		normalScale: .32,
		textureRepeat: 2
	},
	flamethrower: {
		id: "m2-heat-weathered-v1",
		albedo: path("lmg"),
		normal: path("lmg", "-normal"),
		roughness: path("lmg", "-roughness"),
		metalness: .64,
		normalScale: .4,
		textureRepeat: 2
	},
	"crimson-flamethrower": {
		id: "crimson-lacquer-v1",
		tintHex: 14169130,
		albedo: path("lmg"),
		normal: path("lmg", "-normal"),
		roughness: path("lmg", "-roughness"),
		metalness: .58,
		normalScale: .4,
		textureRepeat: 2
	},
	"flare-gun": {
		id: "orion-signal-red-v1",
		albedo: path("pistol"),
		normal: path("pistol", "-normal"),
		roughness: path("pistol", "-roughness"),
		metalness: .38,
		normalScale: .28,
		textureRepeat: 2
	}
};
function weaponFinishProfile(weapon) {
	return WEAPON_FINISH_PROFILES[weapon];
}
//#endregion
//#region src/hit-proxies.ts
/**
* These centres match the shipped Quaternius operator's 1.7 m standing
* silhouette. The old 2.2 m head centre sat roughly half a metre above the
* rendered skull, making valid visual headshots miss and empty air crit.
*/
var AUTHORITATIVE_HIT_PROXIES = Object.freeze([
	Object.freeze({
		zone: "body",
		size: [
			.72,
			.84,
			.5
		],
		position: [
			0,
			.98,
			0
		]
	}),
	Object.freeze({
		zone: "head",
		size: [
			.42,
			.36,
			.42
		],
		position: [
			0,
			1.58,
			0
		]
	}),
	Object.freeze({
		zone: "limb",
		size: [
			.3,
			.76,
			.35
		],
		position: [
			-.47,
			1.08,
			0
		]
	}),
	Object.freeze({
		zone: "limb",
		size: [
			.3,
			.76,
			.35
		],
		position: [
			.47,
			1.08,
			0
		]
	}),
	Object.freeze({
		zone: "limb",
		size: [
			.32,
			.72,
			.38
		],
		position: [
			-.18,
			.36,
			0
		]
	}),
	Object.freeze({
		zone: "limb",
		size: [
			.32,
			.72,
			.38
		],
		position: [
			.18,
			.36,
			0
		]
	})
]);
var PRONE_PIVOT_HEIGHT = .43;
var PRONE_PIVOT_PITCH = -1.42;
/**
* One stance transform is shared by rendered bot/player proxies and host-side
* remote-shot admission. Prone rotates around the same pelvis pivot as the
* visible rig instead of rotating the volumes around their feet.
*/
function hitProxyRootTransform(stance) {
	if (stance === "crouch") return {
		position: [
			0,
			-.42,
			0
		],
		rotationX: 0
	};
	if (stance !== "prone") return {
		position: [
			0,
			0,
			0
		],
		rotationX: 0
	};
	const offsetY = -.84 * Math.cos(PRONE_PIVOT_PITCH);
	const offsetZ = -.84 * Math.sin(PRONE_PIVOT_PITCH);
	return {
		position: [
			0,
			PRONE_PIVOT_HEIGHT + offsetY,
			offsetZ
		],
		rotationX: PRONE_PIVOT_PITCH
	};
}
function hitProxyZoneCentre(zone, stance) {
	const proxy = AUTHORITATIVE_HIT_PROXIES.find((entry) => entry.zone === zone) ?? AUTHORITATIVE_HIT_PROXIES[0];
	const transform = hitProxyRootTransform(stance);
	const cos = Math.cos(transform.rotationX);
	const sin = Math.sin(transform.rotationX);
	const [, y, z] = proxy.position;
	return [
		proxy.position[0] + transform.position[0],
		y * cos - z * sin + transform.position[1],
		y * sin + z * cos + transform.position[2]
	];
}
//#endregion
//#region src/player-feedback.ts
var THIRD_PERSON_WEAPON_SCALE = Object.freeze({
	carbine: .47,
	lmg: .41,
	sniper: .45,
	railgun: .43,
	smg: .51,
	scattergun: .46,
	pistol: .54,
	magnum: .54,
	"machine-pistol": .54,
	"mini-uzi": .52,
	mp5: .51,
	m4a1: .47,
	"ak-47": .46,
	minigun: .4,
	"m14-ebr": .45,
	"slug-shotgun": .46,
	"flashlight-pistol": .54,
	"explosive-crossbow": .5,
	flamethrower: .42,
	"crimson-flamethrower": .42,
	"flare-gun": .54
});
function damageNumberPresentation(damage, zone, healthBefore) {
	if (!Number.isFinite(damage) || damage <= 0) return null;
	const amount = Math.max(1, Math.min(9999, Math.round(damage)));
	const overkill = Math.max(0, amount - (Number.isFinite(healthBefore) ? Math.max(0, Math.min(9999, Math.round(healthBefore))) : amount));
	const critical = zone === "head";
	return {
		amount,
		overkill,
		critical,
		label: `${critical ? "CRIT " : ""}${amount}${overkill > 0 ? ` · +${overkill} OVERKILL` : ""}`,
		durationMs: critical ? 1250 : 1100
	};
}
function boundedCount(value) {
	return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
function roundStatSummary(input) {
	const kills = boundedCount(input.kills);
	const deaths = boundedCount(input.deaths);
	const shotsFired = boundedCount(input.shotsFired);
	const hitShots = Math.min(shotsFired, boundedCount(input.hitShots));
	return {
		kills,
		deaths,
		kd: (kills / Math.max(1, deaths)).toFixed(2),
		accuracy: `${shotsFired === 0 ? 0 : Math.round(hitShots / shotsFired * 1e3) / 10}%`,
		damageDealt: boundedCount(input.damageDealt),
		headshots: boundedCount(input.headshots)
	};
}
//#endregion
//#region src/art-kit.ts
var textureLoader = new TextureLoader();
var textureCache = /* @__PURE__ */ new Map();
var pendingTextureLoads = /* @__PURE__ */ new Set();
var textureLoadFailures = [];
var textureBatchColors = {
	"grass-turf.png": 7904597,
	"asphalt-aged.png": 4937047,
	"concrete-poured.png": 10921114,
	"brick-warm.png": 11893598,
	"siding-aqua.png": 5155495,
	"siding-coral.png": 13004122,
	"weapon-gunmetal.png": 4937050,
	"weapon-carbine.png": 3621444,
	"weapon-smg.png": 2378574,
	"weapon-scattergun.png": 3748400,
	"weapon-sniper.png": 4476734,
	"weapon-pistol.png": 3092528,
	"weapon-magnum.png": 5325354,
	"weapon-machine-pistol.png": 3552048,
	"wood-deck.png": 7885115,
	"roof-shingles.png": 5856867,
	"plaster-warm.png": 14471867,
	"ceiling-acoustic.png": 13025969
};
function batchDisplayColor(material) {
	const candidate = material;
	const stored = material.userData.batchColor;
	const color = typeof stored === "number" ? new Color(stored) : candidate.color?.clone() ?? new Color(16777215);
	if (candidate.emissive && Math.max(candidate.emissive.r, candidate.emissive.g, candidate.emissive.b) > 0) color.lerp(candidate.emissive, Math.min(.5, (candidate.emissiveIntensity ?? 0) * .35));
	return color;
}
function materialBatchKey(material) {
	const candidate = material;
	return JSON.stringify({
		type: material.type,
		color: candidate.color?.getHex(),
		emissive: candidate.emissive?.getHex(),
		emissiveIntensity: candidate.emissiveIntensity,
		roughness: candidate.roughness,
		metalness: candidate.metalness,
		transmission: candidate.transmission,
		map: candidate.map?.uuid,
		transparent: material.transparent,
		opacity: material.opacity,
		side: material.side,
		depthWrite: material.depthWrite,
		polygonOffset: material.polygonOffset,
		polygonOffsetFactor: material.polygonOffsetFactor,
		firstPersonMaterialContract: material.userData.pass70FirstPersonMaterialContract,
		firstPersonSurface: material.userData.pass70FirstPersonSurface
	});
}
/**
* Collapses static authored meshes sharing a material into world-space batches.
* The original meshes stay in the scene (hidden) so collision/raycast references
* remain valid; dynamic target/operator meshes opt out via `targetRoot` metadata.
*/
function batchStaticMeshes(root, destination, classify = () => "", materialMode = "preserve") {
	const simplifyMaterials = materialMode !== "preserve";
	root.updateWorldMatrix(true, true);
	destination.updateWorldMatrix(true, false);
	const destinationInverse = destination.matrixWorld.clone().invert();
	const meshToDestination = new Matrix4();
	const groups = /* @__PURE__ */ new Map();
	root.traverse((node) => {
		const hasDynamicAncestor = (() => {
			let current = node;
			while (current && current !== root.parent) {
				if (current.userData.dynamic === true) return true;
				current = current.parent;
			}
			return false;
		})();
		if (!(node instanceof Mesh) || !node.visible || hasDynamicAncestor || node.userData.targetRoot || node.userData.pass73CollisionVisualOwner === true || Array.isArray(node.material)) return;
		if (node.isInstancedMesh) return;
		const sourceMaterial = node.material;
		const canvasMap = typeof HTMLCanvasElement !== "undefined" && sourceMaterial.map?.image instanceof HTMLCanvasElement;
		if (simplifyMaterials && canvasMap) return;
		const preserveMappedMaterial = materialMode === "texture-lit" && Boolean(sourceMaterial.map);
		const vertexPalette = materialMode === "vertex-lit";
		const classification = classify(node);
		const firstPersonMaterialContract = node.material.userData.pass70FirstPersonMaterialContract;
		const firstPersonSurface = node.material.userData.pass70FirstPersonSurface;
		const displayColor = batchDisplayColor(node.material);
		const opacityKey = node.material.transparent ? `t${node.material.opacity.toFixed(2)}` : "opaque";
		const firstPersonSemanticKey = firstPersonMaterialContract === "semantic-first-person-optic-window-v1" ? `${firstPersonMaterialContract}:${String(firstPersonSurface)}` : "";
		const orderKey = `ro${node.renderOrder}`;
		const key = vertexPalette ? `vertex:${opacityKey}:${orderKey}:${firstPersonSemanticKey}:${classification}` : simplifyMaterials && !preserveMappedMaterial ? `${displayColor.getHexString()}:${opacityKey}:${orderKey}:${firstPersonSemanticKey}:${classification}` : `${materialBatchKey(node.material)}:${orderKey}:${firstPersonSemanticKey}:${classification}`;
		let entry = groups.get(key);
		if (!entry) {
			const material = preserveMappedMaterial ? node.material : vertexPalette ? new MeshLambertMaterial({
				color: 16777215,
				vertexColors: true,
				transparent: node.material.transparent,
				opacity: node.material.opacity,
				depthWrite: !node.material.transparent
			}) : materialMode === "palette-basic" ? new MeshBasicMaterial({
				color: displayColor,
				toneMapped: false,
				transparent: node.material.transparent,
				opacity: node.material.opacity,
				depthWrite: !node.material.transparent
			}) : materialMode === "palette-lit" ? new MeshLambertMaterial({
				color: displayColor,
				transparent: node.material.transparent,
				opacity: node.material.opacity,
				depthWrite: !node.material.transparent
			}) : node.material;
			if (firstPersonMaterialContract === "semantic-first-person-optic-window-v1") {
				material.name = node.material.name;
				material.userData.pass70FirstPersonMaterialContract = firstPersonMaterialContract;
				material.userData.pass70FirstPersonSurface = firstPersonSurface;
			}
			entry = {
				material,
				classification,
				renderOrder: node.renderOrder,
				meshes: [],
				geometries: [],
				palette: /* @__PURE__ */ new Set()
			};
			groups.set(key, entry);
		}
		entry.palette.add(displayColor.getHexString());
		let geometry = node.geometry.clone();
		if (geometry.index) {
			const indexed = geometry;
			geometry = geometry.toNonIndexed();
			indexed.dispose();
		}
		geometry.applyMatrix4(meshToDestination.multiplyMatrices(destinationInverse, node.matrixWorld));
		if (vertexPalette) {
			const colors = new Float32Array(geometry.getAttribute("position").count * 3);
			for (let index = 0; index < colors.length; index += 3) {
				colors[index] = displayColor.r;
				colors[index + 1] = displayColor.g;
				colors[index + 2] = displayColor.b;
			}
			geometry.setAttribute("color", new BufferAttribute(colors, 3));
		}
		if (simplifyMaterials) {
			const retainedAttributes = preserveMappedMaterial ? /* @__PURE__ */ new Set([
				"position",
				"normal",
				"uv"
			]) : materialMode === "palette-basic" ? /* @__PURE__ */ new Set(["position"]) : vertexPalette ? /* @__PURE__ */ new Set([
				"position",
				"normal",
				"color"
			]) : /* @__PURE__ */ new Set(["position", "normal"]);
			for (const attribute of Object.keys(geometry.attributes)) if (!retainedAttributes.has(attribute)) geometry.deleteAttribute(attribute);
		}
		entry.meshes.push(node);
		entry.geometries.push(geometry);
	});
	const batches = new Group();
	batches.name = `${root.name || "static"}-render-batches`;
	let sourceMeshes = 0;
	let batchCount = 0;
	for (const entry of groups.values()) {
		const geometry = mergeGeometries(entry.geometries, false);
		if (!geometry) {
			entry.geometries.forEach((item) => item.dispose());
			continue;
		}
		const mesh = new Mesh(geometry, entry.material);
		mesh.renderOrder = entry.renderOrder;
		mesh.userData.sourcePalette = [...entry.palette];
		if (entry.classification) mesh.userData.hitZone = entry.classification;
		const preserveShadowResponse = materialMode === "preserve" || materialMode === "texture-lit";
		mesh.castShadow = materialMode === "preserve" && entry.meshes.some((item) => item.castShadow);
		mesh.receiveShadow = preserveShadowResponse && entry.meshes.some((item) => item.receiveShadow);
		mesh.frustumCulled = true;
		batches.add(mesh);
		for (const source of entry.meshes) {
			source.visible = false;
			source.userData.staticBatchRendered = true;
		}
		sourceMeshes += entry.meshes.length;
		batchCount += 1;
	}
	destination.add(batches);
	return {
		sourceMeshes,
		batches: batchCount
	};
}
function isDescendantOf(node, ancestor) {
	for (let current = node; current; current = current.parent) if (current === ancestor) return true;
	return false;
}
/**
* The node a merged weapon batch must hang from: the deepest authored-clip-
* driven node that still contains every mesh in the weapon. The Pass 65
* firearms park their whole frame under `weapon-action-driver`, so merging
* "static" meshes into the weapon ROOT lifts them out of the node the clips
* animate. Falls back to the weapon root for procedural models, which have no
* authored clips at all.
*/
function authoredAnimationBatchDestination(weapon, animated) {
	if (animated.size === 0) return weapon;
	const meshes = [];
	weapon.traverse((node) => {
		if (node instanceof Mesh) meshes.push(node);
	});
	const first = meshes[0];
	if (!first) return weapon;
	for (let node = first.parent; node && node !== weapon.parent; node = node.parent) {
		if (!animated.has(node.name)) continue;
		if (meshes.every((mesh) => isDescendantOf(mesh, node))) return node;
	}
	return weapon;
}
/** Batch immutable pieces of a socket-attached third-person weapon. */
function optimizeAttachedWeapon(weapon, materialMode) {
	if (weapon.userData.attachedWeaponBatchStats) return weapon.userData.attachedWeaponBatchStats;
	const articulatedNames = /* @__PURE__ */ new Set([
		"bolt-or-slide",
		"pump",
		"curved-magazine",
		"lmg-box-magazine",
		"straight-magazine",
		"pistol-magazine",
		"optic-reticle",
		"weapon-action",
		"weapon-magazine",
		"m134-barrel-cluster"
	]);
	for (const name of [
		"curved-magazine",
		"lmg-box-magazine",
		"straight-magazine",
		"pistol-magazine"
	]) {
		const articulated = weapon.getObjectByName(name);
		if (articulated) batchStaticMeshes(articulated, articulated, () => "", materialMode);
	}
	for (const name of articulatedNames) {
		const articulated = weapon.getObjectByName(name);
		if (articulated) articulated.userData.dynamic = true;
	}
	const animatedNames = importedWeaponAnimatedNodeNames(weapon);
	const destination = authoredAnimationBatchDestination(weapon, animatedNames);
	for (const name of animatedNames) {
		const driven = weapon.getObjectByName(name);
		if (driven && driven !== destination && isDescendantOf(driven, destination)) driven.userData.dynamic = true;
	}
	const stats = batchStaticMeshes(weapon, destination, () => "", materialMode);
	weapon.userData.attachedWeaponBatchStats = stats;
	weapon.userData.attachedWeaponBatchDestination = destination.name || null;
	return stats;
}
function texture(path, repeatX = 1, repeatY = 1, colorData = true) {
	const key = `${path}:${repeatX}:${repeatY}:${colorData ? "srgb" : "data"}`;
	const cached = textureCache.get(key);
	if (cached) return cached;
	let value;
	if (typeof document === "undefined") value = new Texture();
	else {
		let finish;
		const pending = new Promise((resolve) => {
			finish = resolve;
		});
		value = textureLoader.load(path, finish, void 0, (error) => {
			textureLoadFailures.push({
				path,
				error
			});
			finish();
		});
		pendingTextureLoads.add(pending);
		pending.finally(() => pendingTextureLoads.delete(pending));
	}
	value.colorSpace = colorData ? SRGBColorSpace : "";
	value.wrapS = value.wrapT = RepeatWrapping;
	value.repeat.set(repeatX, repeatY);
	value.anisotropy = 8;
	textureCache.set(key, value);
	return value;
}
async function waitForPendingArtTextures() {
	while (pendingTextureLoads.size > 0) await Promise.all([...pendingTextureLoads]);
	if (textureLoadFailures.length > 0) {
		const failedPaths = [...new Set(textureLoadFailures.map((failure) => failure.path))];
		throw new Error(`Authored texture loading failed: ${failedPaths.join(", ")}`);
	}
}
function texturedMaterial(path, options = {}) {
	const repeatX = options.repeatX ?? 1;
	const repeatY = options.repeatY ?? 1;
	const material = new MeshStandardMaterial({
		map: texture(path, repeatX, repeatY),
		normalMap: options.normalPath ? texture(options.normalPath, repeatX, repeatY, false) : null,
		roughnessMap: options.roughnessPath ? texture(options.roughnessPath, repeatX, repeatY, false) : null,
		color: options.color ?? 16777215,
		roughness: options.roughness ?? .78,
		metalness: options.metalness ?? .03
	});
	if (material.normalMap) material.normalScale.setScalar(options.normalScale ?? .55);
	const base = Object.entries(textureBatchColors).find(([suffix]) => path.endsWith(suffix))?.[1] ?? 16777215;
	material.userData.batchColor = new Color(base).multiply(new Color(options.color ?? 16777215)).getHex();
	return material;
}
function roundedBox(name, size, material, radius = .08, segments = 3) {
	const mesh = new Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], segments, Math.min(radius, ...size.map((v) => v / 4))), material);
	mesh.name = name;
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}
var MAT = {
	gunmetal: (weapon) => {
		const finish = weaponFinishProfile(weapon);
		const material = texturedMaterial(finish.albedo, {
			color: finish.tintHex ?? 16777215,
			roughness: .48,
			metalness: finish.metalness,
			repeatX: finish.textureRepeat,
			repeatY: finish.textureRepeat,
			normalPath: finish.normal,
			roughnessPath: finish.roughness,
			normalScale: finish.normalScale
		});
		material.name = finish.id;
		material.userData.weaponFinishId = finish.id;
		return material;
	},
	dark: () => new MeshStandardMaterial({
		color: 2436145,
		roughness: .42,
		metalness: .5
	}),
	rubber: () => new MeshStandardMaterial({
		color: 2106920,
		roughness: .9
	}),
	brass: () => new MeshStandardMaterial({
		color: 12093500,
		roughness: .3,
		metalness: .76
	}),
	glass: () => new MeshPhysicalMaterial({
		color: 8703971,
		roughness: .12,
		metalness: .08,
		transparent: true,
		opacity: .7
	}),
	cream: () => new MeshStandardMaterial({
		color: 15195073,
		roughness: .68
	}),
	tealMetal: () => texturedMaterial("./assets/original/textures/painted-metal-teal.png", {
		roughness: .54,
		metalness: .28,
		repeatX: 3,
		normalPath: "./assets/original/textures/painted-metal-teal-normal.png",
		roughnessPath: "./assets/original/textures/painted-metal-teal-roughness.png",
		normalScale: .3
	})
};
function part(root, mesh, position, rotation = [
	0,
	0,
	0
]) {
	mesh.position.set(...position);
	mesh.rotation.set(...rotation);
	root.add(mesh);
	return mesh;
}
function finalizeWeaponGeometryLod(root, flattenMaterials) {
	if (!flattenMaterials) return root;
	root.traverse((node) => {
		if (!(node instanceof Mesh) || node.geometry.type !== "RoundedBoxGeometry") return;
		node.geometry.computeBoundingBox();
		const bounds = node.geometry.boundingBox;
		if (!bounds) return;
		const size = bounds.getSize(new Vector3());
		const centre = bounds.getCenter(new Vector3());
		const simplified = new BoxGeometry(size.x, size.y, size.z);
		simplified.translate(centre.x, centre.y, centre.z);
		node.geometry.dispose();
		node.geometry = simplified;
	});
	return root;
}
var PROCEDURAL_WEAPON_BASE = {
	"mini-uzi": "smg",
	mp5: "smg",
	m4a1: "carbine",
	"ak-47": "carbine",
	minigun: "lmg",
	"m14-ebr": "sniper",
	"slug-shotgun": "scattergun",
	"flashlight-pistol": "pistol",
	"explosive-crossbow": "pistol",
	flamethrower: "lmg",
	"crimson-flamethrower": "lmg",
	"flare-gun": "pistol"
};
function buildProceduralWeaponVariant(id, baseId, flattenMaterials) {
	const root = buildWeaponModel(baseId, flattenMaterials, false);
	root.name = `${id}-procedural-family-weapon`;
	root.userData.weaponModelId = `${id}-procedural-family-v1`;
	root.userData.weaponFinishId = weaponFinishProfile(id).id;
	root.userData.assetPolicy = "family-derived-procedural-no-bespoke-claim";
	const metal = MAT.gunmetal(id);
	const dark = MAT.dark();
	const accent = flattenMaterials ? new MeshBasicMaterial({ color: 12114396 }) : new MeshStandardMaterial({
		color: 12114396,
		roughness: .34,
		metalness: .62
	});
	if (id === "mini-uzi") part(root, roundedBox("mini-uzi-compact-stock", [
		.16,
		.17,
		.22
	], dark, .025, 2), [
		0,
		.01,
		.36
	]);
	else if (id === "mp5") part(root, roundedBox("mp5-diode-sight", [
		.08,
		.075,
		.1
	], accent, .018, 2), [
		0,
		.22,
		-.12
	]);
	else if (id === "m4a1") part(root, roundedBox("m4a1-handguard", [
		.22,
		.16,
		.58
	], dark, .028, 3), [
		0,
		0,
		-.62
	]);
	else if (id === "ak-47") part(root, roundedBox("ak-gas-tube", [
		.14,
		.11,
		.72
	], metal, .025, 3), [
		0,
		.13,
		-.68
	]);
	else if (id === "minigun") {
		const inheritedBarrel = root.getObjectByName("lmg-long-barrel");
		if (inheritedBarrel) inheritedBarrel.visible = false;
		const cluster = new Group();
		cluster.name = "minigun-barrel-cluster";
		cluster.position.set(0, .005, -1.35);
		root.add(cluster);
		for (let index = 0; index < 6; index += 1) {
			const angle = index / 6 * Math.PI * 2;
			const barrel = new Mesh(new CylinderGeometry(.018, .024, 1.18, 10), dark);
			barrel.name = `minigun-barrel-${index}`;
			barrel.rotation.x = Math.PI / 2;
			barrel.position.set(Math.cos(angle) * .085, Math.sin(angle) * .085, -.1);
			cluster.add(barrel);
		}
		part(root, roundedBox("minigun-ammo-drum", [
			.48,
			.48,
			.44
		], dark, .12, 5), [
			0,
			-.3,
			-.22
		]);
		part(root, roundedBox("minigun-carry-frame", [
			.52,
			.08,
			.9
		], metal, .025, 2), [
			0,
			.25,
			-.55
		]);
	} else if (id === "m14-ebr") part(root, roundedBox("m14-thermal-optic", [
		.14,
		.12,
		.36
	], accent, .025, 3), [
		0,
		.29,
		-.18
	]);
	else if (id === "slug-shotgun") part(root, roundedBox("slug-saddle", [
		.05,
		.16,
		.36
	], accent, .012, 2), [
		-.15,
		.02,
		-.03
	]);
	else if (id === "flashlight-pistol") {
		const lamp = new Group();
		lamp.name = "always-on-flashlight";
		lamp.position.set(0, -.12, -.34);
		root.add(lamp);
		const tube = new Mesh(new CylinderGeometry(.052, .052, .26, 14), dark);
		tube.rotation.x = Math.PI / 2;
		lamp.add(tube);
		const lens = new Mesh(new CircleGeometry(.045, 16), new MeshBasicMaterial({
			color: 15400959,
			toneMapped: false
		}));
		lens.position.z = -.135;
		lamp.add(lens);
	} else if (id === "explosive-crossbow") {
		const inheritedFlash = root.getObjectByName("world-muzzle-flash");
		if (inheritedFlash) inheritedFlash.visible = false;
		part(root, roundedBox("bolt-rail", [
			.08,
			.07,
			.9
		], dark, .018, 2), [
			0,
			.09,
			-.48
		]);
		for (const side of [-1, 1]) part(root, roundedBox(side < 0 ? "crossbow-limb-left" : "crossbow-limb-right", [
			.62,
			.055,
			.06
		], metal, .018, 3), [
			side * .31,
			.09,
			-.72
		], [
			0,
			side * .18,
			0
		]);
		const string = new Mesh(new CylinderGeometry(.006, .006, 1.22, 6), accent);
		string.name = "crossbow-string";
		string.rotation.z = Math.PI / 2;
		string.position.set(0, .09, -.66);
		root.add(string);
	} else if (id === "flamethrower" || id === "crimson-flamethrower") {
		const inheritedMagazine = root.getObjectByName("magazine");
		if (inheritedMagazine) inheritedMagazine.visible = false;
		for (const side of [-1, 1]) {
			const tank = new Mesh(new CylinderGeometry(.13, .13, .54, 14), metal);
			tank.name = side < 0 ? "flamethrower-fuel-tank-left" : "flamethrower-fuel-tank-right";
			tank.position.set(side * .16, -.18, .04);
			root.add(tank);
		}
		const hose = new Mesh(new TorusGeometry(.25, .018, 8, 22, Math.PI * 1.4), dark);
		hose.name = "flamethrower-hose";
		hose.rotation.set(Math.PI / 2, 0, -.3);
		hose.position.set(-.1, -.22, -.36);
		root.add(hose);
		part(root, roundedBox("flamethrower-heat-shield", [
			.22,
			.18,
			.68
		], dark, .035, 3), [
			0,
			.02,
			-.66
		]);
		part(root, roundedBox("flamethrower-igniter", [
			.09,
			.1,
			.16
		], accent, .02, 2), [
			.09,
			.04,
			-1.04
		]);
	} else if (id === "flare-gun") {
		part(root, roundedBox("flare-gun-break-barrel", [
			.22,
			.2,
			.58
		], metal, .05, 4), [
			0,
			.08,
			-.46
		]);
		part(root, roundedBox("flare-gun-latch", [
			.14,
			.07,
			.11
		], accent, .018, 2), [
			0,
			.21,
			-.12
		]);
		part(root, roundedBox("flare-gun-front-sight", [
			.035,
			.075,
			.05
		], accent, .008, 2), [
			0,
			.24,
			-.7
		]);
		part(root, roundedBox("flare-gun-rear-sight", [
			.12,
			.06,
			.05
		], dark, .008, 2), [
			0,
			.24,
			-.18
		]);
		part(root, roundedBox("flare-gun-trigger-guard", [
			.2,
			.05,
			.2
		], dark, .02, 2), [
			0,
			-.14,
			-.1
		]);
	}
	return root;
}
function buildWeaponModel(id, flattenMaterials = false, preferImported = true) {
	if (id === "explosive-crossbow") {
		const authoredCrossbow = createPass65CrossbowModel(flattenMaterials, "world");
		if (authoredCrossbow) return authoredCrossbow;
	}
	const imported = preferImported && id !== "lmg" ? createImportedWeaponModel(id, flattenMaterials) : null;
	if (imported) return imported;
	const proceduralBase = PROCEDURAL_WEAPON_BASE[id];
	if (proceduralBase) return buildProceduralWeaponVariant(id, proceduralBase, flattenMaterials);
	if (id === "lmg") {
		const root = buildWeaponModel("carbine", flattenMaterials, false);
		root.name = "lmg-original-weapon";
		const gunmetal = MAT.gunmetal("lmg");
		root.userData.weaponModelId = "lmg-authored-v6";
		root.userData.weaponFinishId = weaponFinishProfile("lmg").id;
		root.traverse((node) => {
			if (!(node instanceof Mesh)) return;
			const replace = (material) => material.userData.weaponFinishId ? gunmetal : material;
			node.material = Array.isArray(node.material) ? node.material.map(replace) : replace(node.material);
		});
		const dark = MAT.dark();
		const rubber = MAT.rubber();
		const accent = new MeshStandardMaterial({
			color: 7905108,
			roughness: .5,
			metalness: .32
		});
		const inheritedDetails = /* @__PURE__ */ new Set([
			"curved-magazine",
			"optic-bridge",
			"optic-side-post",
			"optic-top-frame",
			"optic-ring",
			"optic-lens",
			"optic-reticle",
			"triangular-fore-end",
			"fore-end-side-rail",
			"fore-end-vent",
			"angled-foregrip",
			"foregrip-hand-stop"
		]);
		root.traverse((node) => {
			if (inheritedDetails.has(node.name)) node.visible = false;
			if (node.name === "reload-socket-l") node.name = "lmg-inherited-reload-socket";
		});
		part(root, roundedBox("lmg-heavy-receiver", [
			.31,
			.27,
			.82
		], gunmetal, .055, 4), [
			0,
			.025,
			-.25
		]);
		part(root, roundedBox("lmg-feed-cover", [
			.3,
			.075,
			.5
		], accent, .018, 3), [
			0,
			.19,
			-.22
		]);
		part(root, roundedBox("lmg-heat-shield", [
			.285,
			.18,
			.76
		], dark, .04, 4), [
			0,
			.01,
			-.9
		]);
		const ventPositions = flattenMaterials ? [-.9] : [
			-1.15,
			-.98,
			-.81,
			-.64
		];
		for (const z of ventPositions) for (const side of [-1, 1]) part(root, roundedBox("lmg-shield-vent", [
			.032,
			.075,
			.095
		], accent, .008, 2), [
			side * .151,
			.035,
			z
		]);
		const boxMagazine = new Group();
		boxMagazine.name = "lmg-box-magazine";
		boxMagazine.position.set(0, -.29, -.28);
		root.add(boxMagazine);
		part(boxMagazine, roundedBox("lmg-ammo-box", [
			.36,
			.38,
			.34
		], dark, .06, 4), [
			0,
			0,
			0
		]);
		part(boxMagazine, roundedBox("lmg-ammo-box-lid", [
			.38,
			.055,
			.36
		], accent, .015, 2), [
			0,
			.205,
			0
		]);
		const reloadSocket = new Object3D();
		reloadSocket.name = "reload-socket-l";
		reloadSocket.position.set(-.24, -.08, .04);
		boxMagazine.add(reloadSocket);
		const carryHandle = new Group();
		carryHandle.name = "lmg-carry-handle";
		carryHandle.position.set(0, .34, -.45);
		root.add(carryHandle);
		for (const x of [-.115, .115]) part(carryHandle, roundedBox("lmg-handle-post", [
			.035,
			.2,
			.05
		], dark, .009, 2), [
			x,
			-.08,
			0
		]);
		part(carryHandle, roundedBox("lmg-handle-grip", [
			.27,
			.06,
			.08
		], rubber, .018, 2), [
			0,
			.025,
			0
		]);
		const bipod = new Group();
		bipod.name = "lmg-bipod";
		bipod.position.set(0, -.11, -1.08);
		root.add(bipod);
		for (const side of [-1, 1]) {
			const leg = new Mesh(new CylinderGeometry(.014, .014, .47, 8), dark);
			leg.name = "lmg-bipod-leg";
			part(bipod, leg, [
				side * .095,
				-.16,
				.08
			], [
				0,
				0,
				side * .38
			]);
		}
		const longBarrel = new Mesh(new CylinderGeometry(.028, .038, .88, 14), dark);
		longBarrel.name = "lmg-long-barrel";
		part(root, longBarrel, [
			0,
			.005,
			-1.48
		], [
			Math.PI / 2,
			0,
			0
		]);
		for (const sightName of ["rear-sight", "front-sight"]) {
			const sight = root.getObjectByName(sightName);
			if (sight) sight.position.y = .215;
		}
		const rearSightSocket = root.getObjectByName("rear-sight-socket");
		if (rearSightSocket) rearSightSocket.position.y = .215;
		const frontSightSocket = root.getObjectByName("front-sight-socket");
		if (frontSightSocket) frontSightSocket.position.y = .215;
		const sightGlow = new MeshStandardMaterial({
			color: 15269872,
			emissive: 8847278,
			emissiveIntensity: 1.4,
			roughness: .28,
			metalness: .18
		});
		const aperture = new Mesh(new TorusGeometry(.047, .008, 8, 20), sightGlow);
		aperture.name = "lmg-aperture";
		aperture.position.set(0, .235, .12);
		root.add(aperture);
		part(root, roundedBox("lmg-front-sight-dot", [
			.018,
			.035,
			.018
		], sightGlow, .006, 2), [
			0,
			.235,
			-1.43
		]);
		const muzzleSocket = root.getObjectByName("muzzle-socket");
		if (muzzleSocket) muzzleSocket.position.set(0, .005, -1.92);
		const muzzle = root.children.find((node) => node.userData.muzzle === true);
		if (muzzle) muzzle.position.z = -1.92;
		const flash = root.getObjectByName("world-muzzle-flash");
		if (flash) flash.position.z = -2.1;
		const supportSocket = root.getObjectByName("support-socket-l");
		if (supportSocket) supportSocket.position.set(-.04, -.13, -.68);
		return finalizeWeaponGeometryLod(root, flattenMaterials);
	}
	if (id === "sniper" || id === "railgun") {
		const root = buildWeaponModel("carbine", flattenMaterials, false);
		root.name = `${id === "railgun" ? "railgun" : "sniper"}-original-weapon`;
		const sniperMetal = MAT.gunmetal(id);
		root.userData.weaponModelId = id === "railgun" ? "railgun-authored-v6" : "sniper-authored-v6";
		root.userData.weaponFinishId = weaponFinishProfile(id).id;
		root.traverse((node) => {
			if (!(node instanceof Mesh)) return;
			const replace = (material) => material.userData.weaponFinishId ? sniperMetal : material;
			node.material = Array.isArray(node.material) ? node.material.map(replace) : replace(node.material);
		});
		const sniperDark = MAT.dark();
		const sniperAccent = new MeshStandardMaterial({
			color: 7903101,
			roughness: .58,
			metalness: .28
		});
		const inheritedCarbineDetails = /* @__PURE__ */ new Set([
			"optic-bridge",
			"optic-side-post",
			"optic-top-frame",
			"optic-ring",
			"optic-lens",
			"optic-reticle",
			"rear-sight",
			"front-sight",
			"triangular-fore-end",
			"fore-end-top-rail",
			"fore-end-side-rail",
			"fore-end-vent",
			"rail-tooth",
			"gas-block"
		]);
		root.traverse((node) => {
			if (inheritedCarbineDetails.has(node.name)) node.visible = false;
		});
		part(root, roundedBox("sniper-chassis", [
			.245,
			.2,
			.86
		], sniperMetal, .045, 4), [
			0,
			.015,
			-.56
		]);
		part(root, roundedBox("sniper-chassis-rail", [
			.19,
			.035,
			.92
		], sniperDark, .008, 2), [
			0,
			.13,
			-.53
		]);
		for (const side of [-1, 1]) {
			part(root, roundedBox("sniper-chassis-panel", [
				.025,
				.115,
				.55
			], sniperAccent, .007, 2), [
				side * .132,
				.015,
				-.53
			]);
			const ventPositions = flattenMaterials ? [-.62] : [
				-.8,
				-.67,
				-.54,
				-.41
			];
			for (const z of ventPositions) part(root, roundedBox("sniper-chassis-vent", [
				.03,
				.045,
				.07
			], sniperDark, .005, 1), [
				side * .142,
				.04,
				z
			]);
		}
		const muzzleSocket = root.getObjectByName("muzzle-socket");
		if (muzzleSocket) muzzleSocket.position.set(0, .005, -1.88);
		const muzzle = root.children.find((node) => node.userData.muzzle === true);
		if (muzzle) muzzle.position.z = -1.88;
		const flash = root.getObjectByName("world-muzzle-flash");
		if (flash) flash.position.z = -2.06;
		const longBarrel = new Mesh(new CylinderGeometry(.026, .034, 1.18, 16), sniperDark);
		longBarrel.name = "sniper-long-barrel";
		part(root, longBarrel, [
			0,
			.005,
			-1.32
		], [
			Math.PI / 2,
			0,
			0
		]);
		const brake = new Mesh(new CylinderGeometry(.052, .045, .18, 12), sniperAccent);
		brake.name = "sniper-muzzle-brake";
		part(root, brake, [
			0,
			.005,
			-1.89
		], [
			Math.PI / 2,
			0,
			0
		]);
		for (const side of [-1, 1]) part(root, roundedBox("sniper-brake-port", [
			.025,
			.055,
			.07
		], sniperDark, .005, 1), [
			side * .045,
			.012,
			-1.89
		]);
		const scope = new Group();
		scope.name = "sniper-scope";
		scope.position.set(0, .285, -.18);
		const scopeBody = new Mesh(new CylinderGeometry(.055, .055, .58, 20), sniperDark);
		scopeBody.name = "sniper-scope-body";
		scopeBody.rotation.x = Math.PI / 2;
		scope.add(scopeBody);
		for (const z of [-.31, .31]) {
			const bell = new Mesh(new CylinderGeometry(.075, .058, .11, 20), sniperDark);
			bell.name = "sniper-scope-bell";
			bell.rotation.x = Math.PI / 2;
			bell.position.z = z;
			scope.add(bell);
		}
		for (const z of [-.15, .14]) {
			const mount = new Mesh(new TorusGeometry(.064, .012, 8, 20), sniperAccent);
			mount.name = "sniper-scope-mount";
			mount.position.z = z;
			scope.add(mount);
			part(scope, roundedBox("sniper-scope-foot", [
				.055,
				.075,
				.045
			], sniperDark, .008, 2), [
				0,
				-.075,
				z
			]);
		}
		const lens = new Mesh(new CircleGeometry(.054, 24), new MeshBasicMaterial({
			color: 9431551,
			transparent: true,
			opacity: .42,
			depthWrite: false,
			side: 2
		}));
		lens.name = "sniper-scope-lens";
		lens.position.z = -.37;
		scope.add(lens);
		const ocular = new Mesh(new CircleGeometry(.052, 24), new MeshBasicMaterial({
			color: 2505024,
			transparent: true,
			opacity: .72,
			depthWrite: false,
			side: 2
		}));
		ocular.name = "sniper-scope-ocular";
		ocular.position.z = .37;
		ocular.rotation.y = Math.PI;
		scope.add(ocular);
		const elevationTurret = new Mesh(new CylinderGeometry(.033, .033, .08, 12), sniperAccent);
		elevationTurret.name = "sniper-elevation-turret";
		elevationTurret.position.set(0, .085, 0);
		scope.add(elevationTurret);
		root.add(scope);
		const boltHandle = new Group();
		boltHandle.name = "sniper-bolt-handle";
		boltHandle.position.set(.145, .095, .035);
		const boltStem = new Mesh(new CylinderGeometry(.014, .014, .16, 10), sniperAccent);
		boltStem.rotation.z = Math.PI / 2;
		boltHandle.add(boltStem);
		const boltKnob = new Mesh(new SphereGeometry(.035, 12, 8), sniperDark);
		boltKnob.position.x = .095;
		boltHandle.add(boltKnob);
		root.add(boltHandle);
		const action = root.getObjectByName("bolt-or-slide");
		if (action) action.userData.precisionBolt = true;
		const supportSocket = root.getObjectByName("support-socket-l");
		if (supportSocket) supportSocket.position.set(-.035, -.095, -.63);
		const gripSocket = root.getObjectByName("grip-socket-r");
		if (gripSocket) gripSocket.position.set(.045, -.15, .04);
		if (id === "railgun") {
			root.name = "railgun-original-weapon";
			const energy = flattenMaterials ? new MeshBasicMaterial({ color: 6681855 }) : new MeshStandardMaterial({
				color: 6681855,
				emissive: 750213,
				emissiveIntensity: 2.1,
				roughness: .2,
				metalness: .66
			});
			part(root, roundedBox("railgun-receiver", [
				.33,
				.22,
				1.02
			], sniperMetal, .052, 4), [
				0,
				.01,
				-.68
			]);
			for (const side of [-1, 1]) part(root, roundedBox(side < 0 ? "railgun-coil-left" : "railgun-coil-right", [
				.065,
				.09,
				1.04
			], energy, .018, 3), [
				side * .19,
				.01,
				-.88
			]);
			const capacitor = new Mesh(new CylinderGeometry(.1, .1, .52, 18), energy);
			capacitor.name = "railgun-capacitor";
			part(root, capacitor, [
				0,
				-.12,
				-.5
			], [
				Math.PI / 2,
				0,
				0
			]);
			const thermal = root.getObjectByName("sniper-scope");
			if (thermal) thermal.name = "railgun-thermal-scope";
			if (muzzleSocket) muzzleSocket.position.z = -2.12;
			const muzzleFlash = root.getObjectByName("world-muzzle-flash");
			if (muzzleFlash) muzzleFlash.position.z = -2.28;
		}
		return finalizeWeaponGeometryLod(root, flattenMaterials);
	}
	const root = new Group();
	root.name = `${id}-original-weapon`;
	root.userData.weaponModelId = `${id}-authored-v6`;
	root.userData.weaponFinishId = weaponFinishProfile(id).id;
	const pistolFamily = id === "pistol" || id === "machine-pistol" || id === "magnum";
	const metal = MAT.gunmetal(id);
	const dark = MAT.dark();
	const rubber = MAT.rubber();
	const accent = new MeshStandardMaterial({
		color: id === "carbine" ? 14068036 : id === "smg" ? 4766135 : id === "machine-pistol" ? 16748349 : id === "magnum" ? 16762970 : id === "pistol" ? 14728552 : 12016965,
		roughness: .45,
		metalness: .35
	});
	const addSocket = (name, position, parent = root) => {
		const socket = new Object3D();
		socket.name = name;
		socket.position.set(...position);
		parent.add(socket);
	};
	const addBarrel = (length, z, radius) => {
		const barrel = new Mesh(new CylinderGeometry(radius * .82, radius, length, 12), dark);
		part(root, barrel, [
			0,
			.005,
			z
		], [
			Math.PI / 2,
			0,
			0
		]);
	};
	if (id === "carbine") {
		part(root, roundedBox("receiver", [
			.235,
			.22,
			.62
		], metal, .035), [
			0,
			0,
			-.12
		]);
		part(root, roundedBox("upper-receiver", [
			.205,
			.095,
			.57
		], dark, .025), [
			0,
			.115,
			-.13
		]);
		for (const side of [-1, 1]) {
			part(root, roundedBox("receiver-side-panel", [
				.022,
				.135,
				.43
			], dark, .006, 2), [
				side * .128,
				.015,
				-.16
			]);
			if (side < 0) {
				const accentPositions = flattenMaterials ? [-.15] : [
					-.29,
					-.15,
					-.01
				];
				for (const z of accentPositions) part(root, roundedBox("receiver-accent-stripe", [
					.025,
					.045,
					.085
				], accent, .006, 1), [
					side * .141,
					.045,
					z
				], [
					0,
					0,
					-.18
				]);
			}
			const stockRod = new Mesh(new CylinderGeometry(.014, .014, .4, 7), dark);
			stockRod.name = "stock-support-rod";
			part(root, stockRod, [
				side * .055,
				.035,
				.38
			], [
				Math.PI / 2,
				side * .08,
				0
			]);
		}
		part(root, roundedBox("stock-cheek-rest", [
			.18,
			.105,
			.3
		], rubber, .035), [
			0,
			.095,
			.36
		], [
			-.05,
			0,
			0
		]);
		part(root, roundedBox("stock-shoulder-pad", [
			.185,
			.23,
			.09
		], rubber, .035), [
			0,
			-.005,
			.56
		], [
			-.08,
			0,
			0
		]);
		part(root, roundedBox("pistol-grip", [
			.11,
			.255,
			.135
		], rubber, .025), [
			0,
			-.18,
			.055
		], [
			-.2,
			0,
			0
		]);
		part(root, roundedBox("trigger-guard-front", [
			.026,
			.125,
			.025
		], dark, .006, 1), [
			0,
			-.12,
			-.045
		], [
			.18,
			0,
			0
		]);
		part(root, roundedBox("trigger-guard-bottom", [
			.026,
			.025,
			.13
		], dark, .006, 1), [
			0,
			-.18,
			.01
		]);
		part(root, roundedBox("trigger", [
			.022,
			.09,
			.022
		], accent, .005, 1), [
			0,
			-.12,
			.01
		], [
			.25,
			0,
			0
		]);
		const magazine = new Group();
		magazine.name = "curved-magazine";
		magazine.position.set(0, -.24, -.17);
		magazine.rotation.x = .16;
		root.add(magazine);
		part(magazine, roundedBox("magazine-body", [
			.12,
			.35,
			.16
		], dark, .032), [
			0,
			0,
			0
		]);
		const magazineRibs = flattenMaterials ? [.04] : [
			-.11,
			-.035,
			.04,
			.115
		];
		for (const y of magazineRibs) part(magazine, roundedBox("magazine-rib", [
			.126,
			.018,
			.168
		], accent, .005, 1), [
			0,
			y,
			0
		]);
		part(magazine, roundedBox("magazine-base", [
			.14,
			.045,
			.18
		], rubber, .012, 2), [
			0,
			-.185,
			.01
		]);
		addSocket("reload-socket-l", [
			-.14,
			-.05,
			.04
		], magazine);
		part(root, roundedBox("triangular-fore-end", [
			.215,
			.16,
			.46
		], metal, .032), [
			0,
			-.005,
			-.59
		]);
		part(root, roundedBox("fore-end-top-rail", [
			.19,
			.035,
			.52
		], dark, .008, 1), [
			0,
			.105,
			-.55
		]);
		for (const side of [-1, 1]) {
			part(root, roundedBox("fore-end-side-rail", [
				.028,
				.085,
				.34
			], dark, .006, 1), [
				side * .116,
				0,
				-.58
			]);
			const ventPositions = flattenMaterials ? [-.61] : [
				-.72,
				-.61,
				-.5
			];
			for (const z of ventPositions) part(root, roundedBox("fore-end-vent", [
				.024,
				.052,
				.062
			], accent, .006, 1), [
				side * .123,
				.035,
				z
			]);
		}
		const railTeeth = flattenMaterials ? [-.64, -.46] : [
			-.73,
			-.64,
			-.55,
			-.46,
			-.37
		];
		for (const z of railTeeth) part(root, roundedBox("rail-tooth", [
			.18,
			.024,
			.035
		], dark, .004, 1), [
			0,
			.135,
			z
		]);
		part(root, roundedBox("angled-foregrip", [
			.105,
			.22,
			.12
		], rubber, .028, 3), [
			0,
			-.15,
			-.57
		], [
			-.18,
			0,
			0
		]);
		part(root, roundedBox("foregrip-hand-stop", [
			.14,
			.045,
			.14
		], accent, .01, 2), [
			0,
			-.05,
			-.62
		]);
		addBarrel(.5, -.96, .031);
		const gasBlock = new Mesh(new CylinderGeometry(.052, .052, .095, 10), dark);
		gasBlock.name = "gas-block";
		part(root, gasBlock, [
			0,
			.002,
			-.8
		], [
			Math.PI / 2,
			0,
			0
		]);
		part(root, roundedBox("optic-bridge", [
			.155,
			.045,
			.34
		], dark, .01), [
			0,
			.145,
			-.015
		]);
		for (const side of [-1, 1]) part(root, roundedBox("optic-side-post", [
			.026,
			.13,
			.11
		], dark, .007, 2), [
			side * .062,
			.202,
			-.025
		]);
		part(root, roundedBox("optic-top-frame", [
			.148,
			.026,
			.11
		], dark, .007, 2), [
			0,
			.268,
			-.025
		]);
		const ring = new Mesh(new TorusGeometry(.058, .01, 8, 20), dark);
		ring.name = "optic-ring";
		ring.position.set(0, .215, -.096);
		root.add(ring);
		const lens = new Mesh(new CircleGeometry(.049, 18), new MeshBasicMaterial({
			color: flattenMaterials ? 7324631 : 9165796,
			transparent: true,
			opacity: flattenMaterials ? .16 : .22,
			depthWrite: false,
			side: 2
		}));
		lens.name = "optic-lens";
		lens.position.set(0, .215, -.098);
		root.add(lens);
		const reticle = new Mesh(new CircleGeometry(.009, 12), new MeshBasicMaterial({
			color: 16765786,
			depthWrite: false,
			toneMapped: false
		}));
		reticle.name = "optic-reticle";
		reticle.position.set(0, .215, .033);
		root.add(reticle);
		part(root, roundedBox("rear-sight", [
			.105,
			.07,
			.045
		], dark, .01), [
			0,
			.19,
			.18
		]);
		part(root, roundedBox("front-sight", [
			.035,
			.105,
			.035
		], dark, .006), [
			0,
			.17,
			-.78
		]);
		addSocket("rear-sight-socket", [
			0,
			.19,
			.18
		]);
		addSocket("front-sight-socket", [
			0,
			.17,
			-.78
		]);
		part(root, roundedBox("charging-handle", [
			.19,
			.035,
			.07
		], accent, .008), [
			0,
			.13,
			.1
		]);
		const bolt = part(root, roundedBox("bolt-or-slide", [
			.052,
			.06,
			.18
		], MAT.brass(), .01), [
			.112,
			.035,
			-.045
		]);
		bolt.userData.restZ = bolt.position.z;
		addSocket("muzzle-socket", [
			0,
			.005,
			-1.24
		]);
		addSocket("eject-socket", [
			.145,
			.055,
			-.07
		]);
		addSocket("grip-socket-r", [
			.035,
			-.135,
			.045
		]);
		addSocket("support-socket-l", [
			-.035,
			-.17,
			-.57
		]);
	} else if (id === "smg") {
		part(root, roundedBox("receiver", [
			.22,
			.225,
			.45
		], metal, .04), [
			0,
			0,
			-.12
		]);
		part(root, roundedBox("tall-rear-housing", [
			.205,
			.25,
			.2
		], dark, .035), [
			0,
			.075,
			.09
		]);
		part(root, roundedBox("receiver-spine", [
			.16,
			.045,
			.47
		], accent, .01, 2), [
			0,
			.145,
			-.1
		]);
		part(root, roundedBox("heat-shield", [
			.225,
			.145,
			.34
		], accent, .025), [
			0,
			.005,
			-.48
		]);
		const ventPositions = flattenMaterials ? [-.48] : [
			-.59,
			-.51,
			-.43,
			-.35
		];
		for (const side of [-1, 1]) for (const z of ventPositions) {
			const vent = new Mesh(new TorusGeometry(.028, .008, 6, 12), dark);
			vent.name = "smg-heat-vent";
			vent.rotation.y = Math.PI / 2;
			vent.position.set(side * .119, .012, z);
			root.add(vent);
		}
		part(root, roundedBox("smg-foregrip", [
			.1,
			.225,
			.11
		], rubber, .028, 3), [
			0,
			-.145,
			-.47
		], [
			-.12,
			0,
			0
		]);
		part(root, roundedBox("smg-hand-stop", [
			.14,
			.04,
			.13
		], dark, .009, 2), [
			0,
			-.045,
			-.51
		]);
		part(root, roundedBox("raked-grip", [
			.11,
			.255,
			.13
		], rubber, .025), [
			0,
			-.18,
			.015
		], [
			-.24,
			0,
			0
		]);
		part(root, roundedBox("trigger-bridge", [
			.12,
			.025,
			.13
		], dark, .006, 1), [
			0,
			-.12,
			-.025
		]);
		const magazine = new Group();
		magazine.name = "straight-magazine";
		magazine.position.set(0, -.26, -.1);
		magazine.rotation.x = -.08;
		root.add(magazine);
		part(magazine, roundedBox("smg-magazine-body", [
			.13,
			.31,
			.14
		], dark, .025), [
			0,
			0,
			0
		]);
		const witnessPositions = flattenMaterials ? [0] : [
			-.095,
			0,
			.095
		];
		for (const y of witnessPositions) part(magazine, roundedBox("magazine-witness", [
			.136,
			.035,
			.025
		], accent, .006, 1), [
			0,
			y,
			-.072
		]);
		part(magazine, roundedBox("smg-mag-base", [
			.15,
			.045,
			.155
		], rubber, .012, 2), [
			0,
			-.17,
			0
		]);
		addSocket("reload-socket-l", [
			-.14,
			-.08,
			.02
		], magazine);
		for (const x of [-.065, .065]) {
			const rod = new Mesh(new CylinderGeometry(.012, .012, .36, 8), dark);
			rod.name = "smg-stock-rod";
			part(root, rod, [
				x,
				.015,
				.35
			], [
				Math.PI / 2,
				0,
				0
			]);
		}
		part(root, roundedBox("wire-stock-pad", [
			.18,
			.19,
			.08
		], rubber, .025), [
			0,
			.015,
			.54
		]);
		addBarrel(.27, -.71, .035);
		const muzzleBrake = new Mesh(new CylinderGeometry(.055, .048, .13, 10), dark);
		muzzleBrake.name = "muzzle-brake";
		part(root, muzzleBrake, [
			0,
			.005,
			-.87
		], [
			Math.PI / 2,
			0,
			0
		]);
		const block = part(root, roundedBox("bolt-or-slide", [
			.22,
			.055,
			.11
		], accent, .012), [
			0,
			.135,
			-.035
		]);
		block.userData.restZ = block.position.z;
		part(root, roundedBox("charging-tab", [
			.07,
			.035,
			.09
		], accent, .008, 2), [
			.145,
			.105,
			-.035
		]);
		const aperture = new Mesh(new TorusGeometry(.045, .009, 7, 18), dark);
		aperture.name = "smg-aperture";
		aperture.position.set(0, .24, .09);
		root.add(aperture);
		part(root, roundedBox("smg-front-post", [
			.028,
			.12,
			.028
		], dark, .006), [
			0,
			.11,
			-.57
		]);
		addSocket("muzzle-socket", [
			0,
			.005,
			-.96
		]);
		addSocket("eject-socket", [
			.14,
			.06,
			-.04
		]);
		addSocket("grip-socket-r", [
			.03,
			-.13,
			.02
		]);
		addSocket("support-socket-l", [
			-.03,
			-.16,
			-.47
		]);
	} else if (pistolFamily) {
		part(root, roundedBox("pistol-frame", [
			.21,
			.16,
			.5
		], metal, .035, 3), [
			0,
			-.025,
			-.08
		]);
		const slide = new Group();
		slide.name = "bolt-or-slide";
		slide.position.set(0, .105, -.12);
		slide.userData.restZ = slide.position.z;
		root.add(slide);
		part(slide, roundedBox("pistol-slide", [
			.205,
			.145,
			.58
		], dark, .025, 3), [
			0,
			0,
			0
		]);
		part(slide, roundedBox("pistol-slide-accent", [
			.215,
			.035,
			.24
		], accent, .008, 1), [
			0,
			.06,
			.04
		]);
		part(slide, roundedBox("pistol-ejection-port", [
			.13,
			.012,
			.16
		], MAT.brass(), .005, 1), [
			.035,
			.075,
			-.03
		]);
		part(root, roundedBox("pistol-frame-rail", [
			.17,
			.045,
			.22
		], metal, .01, 2), [
			0,
			-.105,
			-.28
		]);
		if (id === "machine-pistol") part(root, roundedBox("auto-selector", [
			.035,
			.055,
			.07
		], accent, .008, 2), [
			.12,
			.055,
			.02
		]);
		const serrations = flattenMaterials ? [.08] : [
			.02,
			.08,
			.14
		];
		for (const z of serrations) part(slide, roundedBox("pistol-slide-serration", [
			.218,
			.055,
			.022
		], accent, .004, 1), [
			0,
			0,
			z
		]);
		part(root, roundedBox("pistol-grip", [
			.17,
			.34,
			.2
		], rubber, .045, 3), [
			0,
			-.23,
			.08
		], [
			-.18,
			0,
			0
		]);
		part(root, roundedBox("pistol-grip-panel", [
			.178,
			.23,
			.12
		], accent, .025, 2), [
			0,
			-.245,
			.055
		], [
			-.18,
			0,
			0
		]);
		const magazine = new Group();
		magazine.name = "pistol-magazine";
		magazine.position.set(0, id === "machine-pistol" ? -.36 : -.31, .08);
		magazine.rotation.x = -.18;
		root.add(magazine);
		const pistolMagazineHeight = id === "machine-pistol" ? .38 : .28;
		part(magazine, roundedBox("pistol-magazine-body", [
			.13,
			pistolMagazineHeight,
			.14
		], dark, .025, 2), [
			0,
			0,
			0
		]);
		part(magazine, roundedBox("pistol-magazine-base", [
			.16,
			.045,
			.17
		], accent, .012, 2), [
			0,
			-pistolMagazineHeight / 2 - .015,
			0
		]);
		addSocket("reload-socket-l", [
			-.12,
			-.06,
			0
		], magazine);
		part(root, roundedBox("pistol-trigger-guard", [
			.19,
			.04,
			.2
		], dark, .012, 2), [
			0,
			-.13,
			-.1
		]);
		part(root, roundedBox("pistol-trigger", [
			.028,
			.095,
			.028
		], accent, .007, 1), [
			0,
			-.1,
			-.08
		], [
			.24,
			0,
			0
		]);
		addBarrel(.43, -.35, .028);
		if (id === "magnum") {
			part(root, roundedBox("magnum-heavy-barrel", [
				.22,
				.19,
				.46
			], metal, .04, 4), [
				0,
				.075,
				-.5
			]);
			const cylinder = new Mesh(new CylinderGeometry(.12, .12, .2, 12), accent);
			cylinder.name = "magnum-cylinder";
			part(root, cylinder, [
				0,
				.005,
				-.24
			], [
				0,
				0,
				Math.PI / 2
			]);
		}
		if (id === "machine-pistol") {
			part(root, roundedBox("machine-pistol-compensator", [
				.225,
				.185,
				.2
			], metal, .035, 4), [
				0,
				.075,
				-.53
			]);
			for (const side of [-1, 1]) part(root, roundedBox("machine-pistol-comp-port", [
				.035,
				.075,
				.065
			], dark, .007, 1), [
				side * .105,
				.09,
				-.55
			]);
			part(root, roundedBox("machine-pistol-underbarrel-stop", [
				.16,
				.065,
				.16
			], accent, .012, 2), [
				0,
				-.08,
				-.43
			]);
			const chargingWings = new Group();
			chargingWings.name = "machine-pistol-charging-wings";
			chargingWings.position.set(0, .18, .12);
			part(chargingWings, roundedBox("machine-pistol-wing-left", [
				.08,
				.04,
				.06
			], accent, .008, 2), [
				-.13,
				0,
				0
			]);
			part(chargingWings, roundedBox("machine-pistol-wing-right", [
				.08,
				.04,
				.06
			], accent, .008, 2), [
				.13,
				0,
				0
			]);
			root.add(chargingWings);
		}
		const rearSight = new Group();
		rearSight.name = "pistol-rear-sight";
		rearSight.position.set(0, .205, .09);
		root.add(rearSight);
		part(rearSight, roundedBox("pistol-rear-sight-left", [
			.045,
			.06,
			.04
		], accent, .008, 2), [
			-.062,
			0,
			0
		]);
		part(rearSight, roundedBox("pistol-rear-sight-right", [
			.045,
			.06,
			.04
		], accent, .008, 2), [
			.062,
			0,
			0
		]);
		part(root, roundedBox("pistol-front-sight", [
			.032,
			.07,
			.032
		], accent, .007, 2), [
			0,
			.205,
			-.39
		]);
		addSocket("muzzle-socket", [
			0,
			.105,
			id === "machine-pistol" ? -.66 : id === "magnum" ? -.76 : -.58
		]);
		addSocket("eject-socket", [
			.125,
			.13,
			-.08
		]);
		addSocket("grip-socket-r", [
			.03,
			-.2,
			.08
		]);
		addSocket("support-socket-l", [
			-.09,
			-.1,
			-.12
		]);
	} else {
		const wood = new MeshStandardMaterial({
			color: 12159575,
			roughness: .78,
			metalness: .04
		});
		part(root, roundedBox("rounded-receiver", [
			.225,
			.225,
			.5
		], metal, .055), [
			0,
			0,
			-.05
		]);
		part(root, roundedBox("receiver-topstrap", [
			.17,
			.045,
			.47
		], dark, .012, 2), [
			0,
			.135,
			-.05
		]);
		part(root, roundedBox("scattergun-trigger-guard", [
			.15,
			.035,
			.19
		], dark, .01, 2), [
			0,
			-.135,
			.065
		]);
		part(root, roundedBox("scattergun-trigger", [
			.025,
			.09,
			.025
		], accent, .006, 1), [
			0,
			-.105,
			.055
		], [
			.24,
			0,
			0
		]);
		part(root, roundedBox("stock", [
			.18,
			.205,
			.5
		], wood, .06), [
			0,
			-.015,
			.42
		], [
			-.05,
			0,
			0
		]);
		part(root, roundedBox("stock-cheek-panel", [
			.19,
			.08,
			.3
		], accent, .025, 2), [
			0,
			.085,
			.38
		]);
		part(root, roundedBox("grip", [
			.115,
			.25,
			.14
		], rubber, .03), [
			0,
			-.19,
			.13
		], [
			-.2,
			0,
			0
		]);
		addBarrel(.9, -.76, .042);
		const tube = new Mesh(new CylinderGeometry(.035, .039, .74, 12), metal);
		tube.name = "magazine-tube";
		part(root, tube, [
			0,
			-.075,
			-.7
		], [
			Math.PI / 2,
			0,
			0
		]);
		const tubeCap = new Mesh(new CylinderGeometry(.049, .049, .08, 10), accent);
		tubeCap.name = "tube-cap";
		part(root, tubeCap, [
			0,
			-.075,
			-1.08
		], [
			Math.PI / 2,
			0,
			0
		]);
		const heatShield = part(root, roundedBox("barrel-heat-shield", [
			.16,
			.055,
			.68
		], dark, .014, 2), [
			0,
			.082,
			-.72
		]);
		heatShield.userData.presentationOnly = true;
		const shieldVents = flattenMaterials ? [-.72] : [
			-.94,
			-.82,
			-.7,
			-.58,
			-.46
		];
		for (const z of shieldVents) part(root, roundedBox("heat-shield-vent", [
			.11,
			.02,
			.055
		], accent, .005, 1), [
			0,
			.115,
			z
		]);
		const pump = new Group();
		pump.name = "pump";
		pump.position.set(0, -.055, -.49);
		pump.userData.restZ = pump.position.z;
		root.add(pump);
		part(pump, roundedBox("pump-body", [
			.245,
			.2,
			.42
		], wood, .055, 4), [
			0,
			-.015,
			0
		]);
		part(pump, roundedBox("pump-hand-stop", [
			.255,
			.055,
			.08
		], rubber, .012, 2), [
			0,
			-.105,
			.17
		]);
		const pumpRibs = flattenMaterials ? [0] : [
			-.12,
			-.06,
			0,
			.06,
			.12
		];
		for (const z of pumpRibs) part(pump, roundedBox("pump-rib", [
			.215,
			.025,
			.018
		], dark, .004, 1), [
			0,
			.035,
			z
		]);
		const ghostRing = new Mesh(new TorusGeometry(.04, .009, 7, 18), dark);
		ghostRing.name = "ghost-ring";
		ghostRing.position.set(0, .2, .11);
		root.add(ghostRing);
		const bead = new Mesh(new SphereGeometry(.018, 10, 8), accent);
		bead.name = "front-bead";
		bead.position.set(0, .06, -1.12);
		root.add(bead);
		const loadingPort = roundedBox("loading-port", [
			.12,
			.025,
			.18
		], dark, .006, 1);
		loadingPort.position.set(0, -.125, -.02);
		root.add(loadingPort);
		const saddle = new Group();
		saddle.name = "shell-saddle";
		saddle.position.set(-.135, .02, -.04);
		root.add(saddle);
		const saddleShells = flattenMaterials ? [0] : [
			-.09,
			0,
			.09
		];
		for (const z of saddleShells) {
			const shell = new Mesh(new CylinderGeometry(.022, .022, .105, 8), new MeshStandardMaterial({
				color: 11812658,
				roughness: .58,
				metalness: .18
			}));
			shell.name = "saddle-shell";
			shell.rotation.x = Math.PI / 2;
			shell.position.z = z;
			saddle.add(shell);
		}
		const reloadShell = new Mesh(new CylinderGeometry(.024, .024, .105, 8), new MeshStandardMaterial({
			color: 11812658,
			roughness: .58,
			metalness: .18
		}));
		reloadShell.name = "reload-shell";
		reloadShell.rotation.z = Math.PI / 2;
		reloadShell.position.set(-.16, -.13, -.02);
		reloadShell.visible = false;
		root.add(reloadShell);
		addSocket("reload-socket-l", [
			-.18,
			-.14,
			.02
		]);
		addSocket("muzzle-socket", [
			0,
			.005,
			-1.24
		]);
		addSocket("eject-socket", [
			.14,
			.045,
			-.03
		]);
		addSocket("grip-socket-r", [
			.03,
			-.14,
			.12
		]);
		addSocket("support-socket-l", [
			-.03,
			-.025,
			0
		], pump);
	}
	const muzzle = new Mesh(new CylinderGeometry(.055, .045, .1, 12), dark);
	const muzzleSocket = root.getObjectByName("muzzle-socket");
	if (muzzleSocket) {
		muzzle.rotation.x = Math.PI / 2;
		muzzle.position.copy(muzzleSocket.position);
		muzzle.userData.muzzle = true;
		root.add(muzzle);
		const flash = new Mesh(new ConeGeometry(id === "scattergun" ? .12 : .075, id === "scattergun" ? .42 : .28, 7), new MeshBasicMaterial({
			color: 16762477,
			transparent: true,
			opacity: .88,
			depthWrite: false
		}));
		flash.name = "world-muzzle-flash";
		flash.rotation.x = -Math.PI / 2;
		flash.position.copy(muzzleSocket.position).add(new Vector3(0, 0, -.18));
		flash.visible = false;
		root.add(flash);
	}
	if (flattenMaterials && id === "carbine") {
		const compatibilityHidden = /* @__PURE__ */ new Set([
			"receiver-side-panel",
			"receiver-accent-stripe",
			"stock-support-rod",
			"trigger-guard-front",
			"trigger-guard-bottom",
			"trigger",
			"fore-end-side-rail",
			"fore-end-vent",
			"rail-tooth",
			"gas-block",
			"rear-sight",
			"front-sight",
			"charging-handle",
			"bolt-or-slide"
		]);
		root.traverse((node) => {
			if (compatibilityHidden.has(node.name)) node.visible = false;
		});
	}
	root.traverse((node) => {
		if (node instanceof Mesh) {
			node.castShadow = true;
			node.receiveShadow = false;
		}
	});
	return finalizeWeaponGeometryLod(root, flattenMaterials);
}
function wheel(root, x, z, radius) {
	const tyre = new Mesh(new CylinderGeometry(radius, radius, .42, 24), MAT.rubber());
	tyre.name = "coach-wheel";
	tyre.rotation.z = Math.PI / 2;
	tyre.position.set(x, radius, z);
	tyre.castShadow = true;
	const hub = new Mesh(new CylinderGeometry(radius * .44, radius * .44, .46, 20), MAT.brass());
	hub.rotation.z = Math.PI / 2;
	hub.position.copy(tyre.position);
	root.add(tyre, hub);
}
function decal(textValue, width, height) {
	const canvas = document.createElement("canvas");
	canvas.width = 512;
	canvas.height = 128;
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#173039";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.strokeStyle = "#e6b84b";
	ctx.lineWidth = 12;
	ctx.strokeRect(8, 8, 496, 112);
	ctx.fillStyle = "#f4ead2";
	ctx.font = "900 58px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(textValue, 256, 67);
	const map = new CanvasTexture(canvas);
	map.colorSpace = SRGBColorSpace;
	return new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({
		map,
		polygonOffset: true,
		polygonOffsetFactor: -2
	}));
}
function buildRetroCoach() {
	const root = new Group();
	root.name = "original-atomic-coach";
	const bodyMat = new MeshStandardMaterial({
		color: 13671218,
		roughness: .48,
		metalness: .25
	});
	for (const side of [-1, 1]) {
		const doorLocalZ = side * 2.8;
		const segments = [[-6.8, doorLocalZ - .85], [doorLocalZ + .85, 6.8]];
		for (const [fromZ, toZ] of segments) part(root, roundedBox("coach-body", [
			.3,
			1.1,
			toZ - fromZ
		], bodyMat, .12, 3), [
			side * 2.5,
			.55,
			(fromZ + toZ) / 2
		]);
		part(root, roundedBox("coach-roof-band", [
			.3,
			.8,
			8.2
		], bodyMat, .08, 3), [
			side * 2.5,
			2.6,
			0
		]);
		for (const deckEnd of [-1, 1]) part(root, roundedBox("coach-deck-lip", [
			.3,
			.15,
			2.2
		], bodyMat, .06), [
			side * 2.5,
			2.175,
			deckEnd * 5.2
		]);
		part(root, roundedBox("coach-lower", [
			.36,
			.4,
			13.2
		], MAT.tealMetal(), .14), [
			side * 2.53,
			.2,
			0
		]);
	}
	for (const end of [-1, 1]) {
		part(root, roundedBox("coach-end-cap", [
			5.3,
			2.1,
			.34
		], bodyMat, .16, 3), [
			0,
			1.05,
			end * 6.63
		]);
		part(root, roundedBox("coach-end-roofline", [
			5.3,
			.15,
			.34
		], bodyMat, .1, 3), [
			0,
			2.175,
			end * 6.63
		]);
	}
	part(root, roundedBox("coach-floor", [
		4.9,
		.12,
		13.2
	], MAT.dark(), .05), [
		0,
		.1,
		0
	]);
	for (const deckEnd of [-1, 1]) {
		part(root, roundedBox("coach-deck", [
			5.08,
			.12,
			2.2
		], MAT.cream(), .06), [
			0,
			2.19,
			deckEnd * 5.2
		]);
		part(root, roundedBox("coach-roof-riser", [
			5.08,
			.75,
			.2
		], bodyMat, .06), [
			0,
			2.625,
			deckEnd * 4.1
		]);
	}
	part(root, roundedBox("coach-roof", [
		5.08,
		.12,
		8.2
	], MAT.cream(), .06), [
		0,
		2.94,
		0
	]);
	part(root, roundedBox("coach-headliner", [
		4.6,
		.03,
		8
	], MAT.dark(), .01), [
		0,
		2.82,
		0
	]);
	for (const deckEnd of [-1, 1]) part(root, roundedBox("coach-deck-headliner", [
		4.6,
		.03,
		2
	], MAT.dark(), .01), [
		0,
		2.13,
		deckEnd * 5.2
	]);
	const glass = MAT.glass();
	part(root, roundedBox("windshield", [
		4.28,
		1,
		.08
	], glass, .07), [
		0,
		1.6,
		-6.82
	], [
		-.08,
		0,
		0
	]);
	part(root, roundedBox("rear-glass", [
		4.18,
		.95,
		.08
	], glass, .07), [
		0,
		1.58,
		6.82
	]);
	const seatMat = new MeshStandardMaterial({
		color: 3042160,
		roughness: .6,
		metalness: .1
	});
	for (const [worldX, worldZ, backX] of [
		[
			-1.1,
			-1.95,
			-1.78
		],
		[
			1.1,
			-1.95,
			.42
		],
		[
			1.1,
			1.95,
			1.78
		],
		[
			-1.1,
			1.95,
			-.42
		]
	]) {
		part(root, roundedBox("coach-seat", [
			.75,
			.45,
			1.5
		], seatMat, .08), [
			worldZ,
			.225,
			-worldX
		]);
		part(root, roundedBox("coach-seat-back", [
			.75,
			.58,
			.14
		], seatMat, .06), [
			worldZ,
			.66,
			-backX
		]);
	}
	const cabMat = MAT.dark();
	for (const bayEnd of [-1, 1]) {
		part(root, roundedBox(bayEnd < 0 ? "coach-cab-dash" : "coach-engine-bench", [
			2.3,
			1.5,
			1
		], cabMat, .08), [
			bayEnd * -1.35,
			.75,
			bayEnd * 5.6
		]);
		part(root, roundedBox(bayEnd < 0 ? "coach-cab-bulkhead" : "coach-engine-bulkhead", [
			1.6,
			1.9,
			.14
		], bodyMat, .05), [
			bayEnd * -1.65,
			.95,
			bayEnd * 3.9
		]);
		part(root, roundedBox(bayEnd < 0 ? "coach-cab-seat" : "coach-engine-crate", [
			.7,
			.6,
			.7
		], seatMat, .06), [
			bayEnd * -1.35,
			.3,
			bayEnd * 4.5
		]);
	}
	const wheelRim = new Mesh(new TorusGeometry(.24, .035, 8, 16), MAT.brass());
	wheelRim.name = "coach-steering-wheel";
	wheelRim.position.set(-1.35, 1.35, 5.05);
	wheelRim.rotation.x = Math.PI / 2.6;
	root.add(wheelRim);
	for (const [stanchionWorldX, stanchionWorldZ] of [
		[-.48, -1.5],
		[1.72, -1.5],
		[.48, 1.5],
		[-1.72, 1.5]
	]) {
		const pole = new Mesh(new CylinderGeometry(.032, .032, 1.2, 8), MAT.brass());
		pole.name = "coach-stanchion";
		pole.position.set(stanchionWorldZ, 1.5, -stanchionWorldX);
		root.add(pole);
	}
	for (const x of [-1.8, 1.8]) for (const z of [-4.6, 4.6]) wheel(root, x, z, .45);
	for (const x of [-1.75, 1.75]) {
		const light = new Mesh(new CircleGeometry(.2, 20), new MeshStandardMaterial({
			color: 16773298,
			emissive: 16758861,
			emissiveIntensity: 2.3
		}));
		light.position.set(x, .72, -6.88);
		root.add(light);
	}
	const sign = decal("ATOM-LINER 86", 3.2, .7);
	sign.position.set(0, 2.08, -6.9);
	root.add(sign);
	return root;
}
function operatorRig(root) {
	return root.userData.operatorRig;
}
var RIGGED_SUPPORT_GRIP_POSITION = {
	carbine: [
		-.035,
		-.17,
		-.21
	],
	smg: [
		-.03,
		-.16,
		-.16
	],
	lmg: [
		-.06,
		-.13,
		-.26
	],
	scattergun: [
		-.03,
		-.025,
		.29
	],
	sniper: [
		-.035,
		-.095,
		-.21
	],
	railgun: [
		-.04,
		-.095,
		-.24
	],
	pistol: [
		-.06,
		-.15,
		.03
	],
	magnum: [
		-.06,
		-.15,
		.03
	],
	"machine-pistol": [
		-.06,
		-.15,
		.03
	],
	"mini-uzi": [
		-.03,
		-.16,
		-.16
	],
	mp5: [
		-.03,
		-.16,
		-.16
	],
	m4a1: [
		-.035,
		-.17,
		-.21
	],
	"ak-47": [
		-.035,
		-.17,
		-.21
	],
	minigun: [
		-.06,
		-.13,
		-.3
	],
	"m14-ebr": [
		-.035,
		-.095,
		-.21
	],
	"slug-shotgun": [
		-.03,
		-.025,
		.29
	],
	"flashlight-pistol": [
		-.06,
		-.15,
		.03
	],
	"explosive-crossbow": [
		-.06,
		-.12,
		-.25
	],
	flamethrower: [
		-.06,
		-.13,
		-.3
	],
	"crimson-flamethrower": [
		-.06,
		-.13,
		-.3
	],
	"flare-gun": [
		-.06,
		-.15,
		.03
	]
};
var RIGGED_CARBINE_GRIP_REFERENCE = Object.freeze({
	weaponId: "carbine",
	sourceAsset: PASS65_AUTHORED_WEAPON_URLS.carbine.world,
	contract: "pass65-carbine-authored-source-plus-runtime-target-v2",
	sockets: Object.freeze({
		"support-socket-l": Object.freeze({
			atomicSocket: "leftGrip",
			authoredLocalPosition: Object.freeze([
				-.10000000149011612,
				-.03999999910593033,
				.47999998927116394
			]),
			authoredLocalQuaternion: Object.freeze([
				0,
				0,
				0,
				1
			]),
			evaluatedTargetLocalPosition: Object.freeze(RIGGED_SUPPORT_GRIP_POSITION.carbine),
			evaluatedTargetLocalQuaternion: Object.freeze([
				0,
				0,
				0,
				1
			]),
			liveTargetContract: "runtime-calibrated-from-authored-source-v1",
			calibrationApplied: true,
			calibrationReason: "third-person-swat-chain-reach-without-unsafe-stretch",
			handEuler: Object.freeze([
				-.32,
				.12,
				-.22
			]),
			side: "left"
		}),
		"grip-socket-r": Object.freeze({
			atomicSocket: "rightGrip",
			authoredLocalPosition: Object.freeze([
				0,
				-.3400000035762787,
				-.12999999523162842
			]),
			authoredLocalQuaternion: Object.freeze([
				0,
				0,
				0,
				1
			]),
			evaluatedTargetLocalPosition: Object.freeze([
				0,
				-.3400000035762787,
				-.12999999523162842
			]),
			evaluatedTargetLocalQuaternion: Object.freeze([
				0,
				0,
				0,
				1
			]),
			liveTargetContract: "authored-source-socket-retained-v1",
			calibrationApplied: false,
			calibrationReason: "authored-firing-grip-retained",
			handEuler: Object.freeze([
				-.22,
				-.06,
				.26
			]),
			side: "right"
		})
	})
});
var RIGGED_CARBINE_SECOND_PHALANX_CURL = Object.freeze({
	left: Object.freeze({
		thumb: -.18,
		index: -.24,
		middle: -.3,
		ring: -.36,
		pinky: -.76
	}),
	right: Object.freeze({
		thumb: -.34,
		index: -.46,
		middle: -.7,
		ring: -.76,
		pinky: -.78
	})
});
var RIGGED_CARBINE_SECOND_PHALANX_BIND_DELTA_FLOOR_RADIANS = Object.freeze({
	thumb: .04,
	index: .23,
	middle: .21,
	ring: .25,
	pinky: .38
});
var RIGGED_CARBINE_SECOND_PHALANX_FALLBACK_AXIS = Object.freeze([
	-1,
	0,
	0
]);
var RIGGED_GRIP_POSITION_ERROR_MAX_M = .015;
var RIGGED_GRIP_QUATERNION_ERROR_MAX_RADIANS = .2;
/** Apply the evaluated curl to the rendered skeletal joint used by skinning. */
function applyRiggedCarbineFingerCurlToBone(bone, curlRadians) {
	bone.quaternion.multiply(new Quaternion().setFromEuler(new Euler(curlRadians, 0, 0, "XYZ")));
	bone.updateWorldMatrix(false, true);
}
/** Rotate one animated bone toward a world-space target without rewriting bind offsets. */
function orientBoneToward(bone, child, targetWorld) {
	bone.updateWorldMatrix(true, true);
	const origin = bone.getWorldPosition(new Vector3());
	const currentDirection = child.getWorldPosition(new Vector3()).sub(origin).normalize();
	const desiredDirection = targetWorld.clone().sub(origin).normalize();
	if (currentDirection.lengthSq() < 1e-6 || desiredDirection.lengthSq() < 1e-6) return;
	const currentWorld = bone.getWorldQuaternion(new Quaternion());
	const desiredWorld = new Quaternion().setFromUnitVectors(currentDirection, desiredDirection).multiply(currentWorld);
	const parentWorld = bone.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
	bone.quaternion.copy(parentWorld.invert().multiply(desiredWorld));
	bone.updateWorldMatrix(false, true);
}
/** Solve one animated arm onto a weapon grip while preserving its bind lengths. */
function applyRiggedArmGrip(shoulder, elbow, wrist, weapon, socketName, outwardSign) {
	const grip = weapon.getObjectByName(socketName);
	if (!grip) return null;
	const reference = grip.userData.riggedGripSocketReference;
	const evaluatedTargetLocalPosition = Array.isArray(reference?.evaluatedTargetLocalPosition) && reference.evaluatedTargetLocalPosition.length === 3 ? new Vector3().fromArray(reference.evaluatedTargetLocalPosition) : null;
	const evaluatedTargetLocalQuaternion = Array.isArray(reference?.evaluatedTargetLocalQuaternion) && reference.evaluatedTargetLocalQuaternion.length === 4 ? new Quaternion().fromArray(reference.evaluatedTargetLocalQuaternion) : null;
	const expectedHandEuler = Array.isArray(reference?.expectedHandEuler) && reference.expectedHandEuler.length === 3 ? new Euler(reference.expectedHandEuler[0], reference.expectedHandEuler[1], reference.expectedHandEuler[2], "XYZ") : null;
	const liveTargetPositionErrorM = evaluatedTargetLocalPosition ? grip.position.distanceTo(evaluatedTargetLocalPosition) : NaN;
	const liveTargetQuaternionErrorRadians = evaluatedTargetLocalQuaternion ? grip.quaternion.angleTo(evaluatedTargetLocalQuaternion) : NaN;
	const socketReferenceValid = reference?.available === true && reference.sourceTransformValid === true && reference.weaponId === weapon.userData.weaponId && reference.atomicSocket === grip.userData.atomic_socket && typeof reference.liveTargetContract === "string" && reference.liveTargetContract.length > 0 && Number.isFinite(liveTargetPositionErrorM) && liveTargetPositionErrorM <= 1e-6 && Number.isFinite(liveTargetQuaternionErrorRadians) && liveTargetQuaternionErrorRadians <= 1e-6;
	const target = resolveSocketWorld(grip);
	shoulder.updateWorldMatrix(true, true);
	const shoulderPos = shoulder.getWorldPosition(new Vector3());
	let elbowPos = elbow.getWorldPosition(new Vector3());
	let wristPos = wrist.getWorldPosition(new Vector3());
	const shoulderOffset = elbow.position.clone();
	const elbowOffset = wrist.position.clone();
	let upperLength = shoulderPos.distanceTo(elbowPos) || .38;
	let lowerLength = elbowPos.distanceTo(wristPos) || .35;
	const reachStretch = MathUtils.clamp(shoulderPos.distanceTo(target) / Math.max(.001, (upperLength + lowerLength) * .985), 1, 1.22);
	if (reachStretch > 1.0001) {
		elbow.position.multiplyScalar(reachStretch);
		wrist.position.multiplyScalar(reachStretch);
		shoulder.updateWorldMatrix(true, true);
		elbowPos = elbow.getWorldPosition(new Vector3());
		wristPos = wrist.getWorldPosition(new Vector3());
		upperLength = shoulderPos.distanceTo(elbowPos) || upperLength;
		lowerLength = elbowPos.distanceTo(wristPos) || lowerLength;
	}
	const torsoPosition = (shoulder.parent?.parent ?? shoulder.parent)?.getWorldPosition(new Vector3()) ?? shoulderPos;
	const bendHint = shoulderPos.clone().sub(torsoPosition);
	if (bendHint.lengthSq() < 1e-6) bendHint.set(outwardSign, 0, 0);
	bendHint.normalize().multiplyScalar(1.2).add(new Vector3(0, -.18, 0));
	orientBoneToward(shoulder, elbow, solveTwoBoneElbow(shoulderPos, target, upperLength, lowerLength, bendHint));
	orientBoneToward(elbow, wrist, target);
	const wristCorrectionValues = wrist.userData.riggedGripBasisCorrection;
	const wristReference = wrist.userData.riggedGripBasisReference;
	const orientationReferenceAvailable = socketReferenceValid && expectedHandEuler !== null && Array.isArray(wristCorrectionValues) && wristCorrectionValues.length === 4 && wristCorrectionValues.every(Number.isFinite) && wristReference?.contract === reference?.wristBasisContract && typeof wristReference?.sourceAsset === "string" && wristReference.sourceAsset.length > 0;
	const desiredCorrectedWristWorld = orientationReferenceAvailable ? grip.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(expectedHandEuler)).normalize() : null;
	const wristBasisCorrection = orientationReferenceAvailable ? new Quaternion().fromArray(wristCorrectionValues).normalize() : null;
	if (desiredCorrectedWristWorld && wristBasisCorrection) {
		const desiredWristWorld = desiredCorrectedWristWorld.clone().multiply(wristBasisCorrection.clone().invert()).normalize();
		const parentWorld = wrist.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
		wrist.quaternion.copy(parentWorld.invert().multiply(desiredWristWorld)).normalize();
	}
	wrist.updateWorldMatrix(true, true);
	const solvedElbow = elbow.getWorldPosition(new Vector3());
	const solvedWrist = wrist.getWorldPosition(new Vector3());
	const targetInWeapon = weapon.worldToLocal(target.clone());
	const correctedWristWorld = wristBasisCorrection ? wrist.getWorldQuaternion(new Quaternion()).multiply(wristBasisCorrection).normalize() : null;
	const correctedWristToSocketQuaternionErrorRadians = correctedWristWorld && desiredCorrectedWristWorld ? correctedWristWorld.angleTo(desiredCorrectedWristWorld) : NaN;
	const elbowAngle = shoulderPos.clone().sub(solvedElbow).angleTo(solvedWrist.clone().sub(solvedElbow));
	const elbowTorsoDistance = solvedElbow.distanceTo(torsoPosition);
	const shoulderFromTorso = shoulderPos.clone().sub(torsoPosition);
	const shoulderTorsoDistance = shoulderFromTorso.length();
	const elbowTorsoOutward = shoulderTorsoDistance > 1e-5 ? solvedElbow.clone().sub(torsoPosition).dot(shoulderFromTorso.normalize()) : elbowTorsoDistance;
	const minimumOutwardClearance = shoulderTorsoDistance * .2;
	return {
		supportError: solvedWrist.distanceTo(target),
		reachRatio: shoulderPos.distanceTo(target) / Math.max(.001, upperLength + lowerLength),
		reachStretch,
		clamped: shoulderPos.distanceTo(target) >= upperLength + lowerLength - 1e-4,
		target: target.toArray(),
		targetInWeapon: targetInWeapon.toArray(),
		wrist: solvedWrist.toArray(),
		socketName,
		socketParent: grip.parent?.name ?? null,
		nestedSocket: grip.parent !== weapon,
		socketReference: {
			available: reference?.available === true,
			valid: socketReferenceValid,
			referenceId: reference?.referenceId ?? null,
			weaponId: reference?.weaponId ?? null,
			sourceAsset: reference?.sourceAsset ?? null,
			atomicSocket: reference?.atomicSocket ?? null,
			sourceTransformValid: reference?.sourceTransformValid === true,
			authoredSourceLocalPosition: reference?.authoredSourceLocalPosition ?? null,
			authoredSourceLocalQuaternion: reference?.authoredSourceLocalQuaternion ?? null,
			observedImportedSourceLocalPosition: reference?.observedImportedSourceLocalPosition ?? null,
			observedImportedSourceLocalQuaternion: reference?.observedImportedSourceLocalQuaternion ?? null,
			sourcePositionErrorM: reference?.sourcePositionErrorM ?? NaN,
			sourceQuaternionErrorRadians: reference?.sourceQuaternionErrorRadians ?? NaN,
			liveTargetContract: reference?.liveTargetContract ?? null,
			calibrationApplied: reference?.calibrationApplied ?? null,
			calibrationReason: reference?.calibrationReason ?? null,
			evaluatedTargetLocalPosition: reference?.evaluatedTargetLocalPosition ?? null,
			observedLiveTargetLocalPosition: grip.position.toArray(),
			liveTargetPositionErrorM,
			evaluatedTargetLocalQuaternion: reference?.evaluatedTargetLocalQuaternion ?? null,
			observedLiveTargetLocalQuaternion: grip.quaternion.toArray(),
			liveTargetQuaternionErrorRadians
		},
		wristOrientation: {
			referenceAvailable: orientationReferenceAvailable,
			wristBasisContract: wristReference?.contract ?? null,
			wristSourceAsset: wristReference?.sourceAsset ?? null,
			wristSourceBone: wristReference?.sourceBone ?? null,
			weaponHandEuler: reference?.expectedHandEuler ?? null,
			correctedWristQuaternion: correctedWristWorld?.toArray() ?? null,
			targetSocketQuaternion: desiredCorrectedWristWorld?.toArray() ?? null,
			errorRadians: correctedWristToSocketQuaternionErrorRadians
		},
		elbowAngle,
		elbowTorsoDistance,
		shoulderTorsoDistance,
		elbowTorsoOutward,
		minimumOutwardClearance,
		torsoClear: elbowTorsoOutward >= minimumOutwardClearance,
		torsoRelativeBendHint: true,
		bindOffsetsPreserved: reachStretch === 1 && shoulderOffset.equals(elbow.position) && elbowOffset.equals(wrist.position),
		finite: [
			...target.toArray(),
			...targetInWeapon.toArray(),
			...solvedWrist.toArray()
		].every(Number.isFinite)
	};
}
function applyRiggedCarbineFingerCurl(root, rig, weapon) {
	const bones = [];
	const bindFloors = [];
	let rightPinkyBindFloor = null;
	let leftHandApplied = false;
	let rightHandApplied = false;
	if (weapon.userData.weaponId !== "carbine") return {
		contract: "pass65-evaluated-per-digit-grip-curl-v3",
		sourceReferenceAvailable: false,
		expectedBoneCount: 10,
		bones,
		bindFloors,
		rightPinkyBindFloor: null,
		allAtOrAboveRequiredBindFloor: false,
		allApplied: false
	};
	for (const [side, wrist, suffix] of [[
		"left",
		rig.leftWristBone,
		"L"
	], [
		"right",
		rig.rightWristBone,
		"R"
	]]) for (const digit of [
		"thumb",
		"index",
		"middle",
		"ring",
		"pinky"
	]) {
		const runtimeName = `${digit[0].toUpperCase()}${digit.slice(1)}2${suffix}`;
		const bone = wrist?.getObjectByName(runtimeName);
		const curlRadians = RIGGED_CARBINE_SECOND_PHALANX_CURL[side][digit];
		if (!(bone instanceof Bone)) {
			bones.push({
				side,
				digit,
				bone: runtimeName,
				curlRadians,
				bindRelativeFloor: null,
				applied: false
			});
			continue;
		}
		applyRiggedCarbineFingerCurlToBone(bone, curlRadians);
		const bindRelativeFloor = enforceRiggedOperatorHandBindDeltaFloor(root, side, digit, RIGGED_CARBINE_SECOND_PHALANX_BIND_DELTA_FLOOR_RADIANS[digit], RIGGED_CARBINE_SECOND_PHALANX_FALLBACK_AXIS);
		if (bindRelativeFloor !== null) bindFloors.push(bindRelativeFloor);
		if (side === "right" && digit === "pinky") rightPinkyBindFloor = bindRelativeFloor;
		if (side === "left") leftHandApplied = true;
		else rightHandApplied = true;
		bones.push({
			side,
			digit,
			bone: runtimeName,
			curlRadians,
			bindRelativeFloor,
			applied: true
		});
	}
	let allAtOrAboveRequiredBindFloor = bindFloors.length === 10 && bones.length === 10;
	for (const { digit, bindRelativeFloor, applied } of bones) if (!applied || bindRelativeFloor?.appliedToRenderedBone !== true || bindRelativeFloor.allFinite !== true || bindRelativeFloor.minimumBindDeltaRadians !== RIGGED_CARBINE_SECOND_PHALANX_BIND_DELTA_FLOOR_RADIANS[digit] || Number(bindRelativeFloor.afterBindDeltaRadians) < RIGGED_CARBINE_SECOND_PHALANX_BIND_DELTA_FLOOR_RADIANS[digit] - 1e-9) {
		allAtOrAboveRequiredBindFloor = false;
		break;
	}
	return {
		contract: "pass65-evaluated-per-digit-grip-curl-v3",
		sourceReferenceAvailable: true,
		expectedBoneCount: 10,
		bones,
		bothHands: leftHandApplied && rightHandApplied,
		bindFloors,
		rightPinkyBindFloor,
		allAtOrAboveRequiredBindFloor,
		allApplied: allAtOrAboveRequiredBindFloor
	};
}
function applyRiggedWeaponGrip(root, rig, weapon) {
	if (!rig.leftShoulderBone || !rig.leftElbowBone || !rig.leftWristBone || !rig.rightShoulderBone || !rig.rightElbowBone || !rig.rightWristBone) return null;
	const support = applyRiggedArmGrip(rig.leftShoulderBone, rig.leftElbowBone, rig.leftWristBone, weapon, "support-socket-l", 1);
	const dominant = applyRiggedArmGrip(rig.rightShoulderBone, rig.rightElbowBone, rig.rightWristBone, weapon, "grip-socket-r", -1);
	if (!support) return dominant;
	const fingerCurl = applyRiggedCarbineFingerCurl(root, rig, weapon);
	const supportOrientationError = Number(support.wristOrientation?.errorRadians);
	const dominantOrientationError = Number((dominant?.wristOrientation)?.errorRadians);
	const supportSocketReferenceValid = support.socketReference?.valid === true;
	const dominantSocketReferenceValid = (dominant?.socketReference)?.valid === true;
	return {
		...support,
		dominantGrip: dominant,
		fingerCurl,
		bothHandsConnected: support.supportError !== void 0 && Number(support.supportError) <= RIGGED_GRIP_POSITION_ERROR_MAX_M && dominant?.supportError !== void 0 && Number(dominant.supportError) <= RIGGED_GRIP_POSITION_ERROR_MAX_M && Number.isFinite(supportOrientationError) && supportOrientationError <= RIGGED_GRIP_QUATERNION_ERROR_MAX_RADIANS && Number.isFinite(dominantOrientationError) && dominantOrientationError <= RIGGED_GRIP_QUATERNION_ERROR_MAX_RADIANS && supportSocketReferenceValid && dominantSocketReferenceValid && fingerCurl.allApplied === true
	};
}
/**
* Builds the exact third-person weapon presentation mounted by operators.
*
* Browser callers deliberately receive `null` until the authored world asset
* has loaded; mounting a procedural stand-in would make retained GPU
* vocabulary readiness differ from the model a bot actually equips. Node-side
* contract tests retain the deterministic procedural presentation.
*/
function createOperatorWeaponPresentation(weaponId, flattenMaterials = false) {
	const browserRuntime = typeof document !== "undefined";
	const authoredWorldWeapon = browserRuntime ? createImportedWeaponModel(weaponId, flattenMaterials) : null;
	if (browserRuntime && !authoredWorldWeapon) return null;
	const weapon = authoredWorldWeapon ?? buildWeaponModel(weaponId, flattenMaterials, false);
	optimizeAttachedWeapon(weapon, flattenMaterials ? "texture-lit" : weapon.userData.projectOriginalWeapon === true ? "texture-lit" : "vertex-lit");
	weapon.name = `operator-${weaponId}`;
	weapon.userData.weaponId = weaponId;
	weapon.scale.setScalar(THIRD_PERSON_WEAPON_SCALE[weaponId]);
	weapon.position.set(0, 0, 0);
	weapon.quaternion.identity();
	weapon.userData.riggedForwardCorrection = "stable-body-mount-minus-z";
	if (weaponId === RIGGED_CARBINE_GRIP_REFERENCE.weaponId) for (const socketName of ["support-socket-l", "grip-socket-r"]) {
		const socket = weapon.getObjectByName(socketName);
		if (!socket) continue;
		const reference = RIGGED_CARBINE_GRIP_REFERENCE.sockets[socketName];
		const observedImportedSourceLocalPosition = socket.position.toArray();
		const observedImportedSourceLocalQuaternion = socket.quaternion.toArray();
		const sourcePositionErrorM = socket.position.distanceTo(new Vector3(...reference.authoredLocalPosition));
		const sourceQuaternionErrorRadians = socket.quaternion.angleTo(new Quaternion(...reference.authoredLocalQuaternion));
		const sourceTransformValid = Number.isFinite(sourcePositionErrorM) && sourcePositionErrorM <= 1e-6 && Number.isFinite(sourceQuaternionErrorRadians) && sourceQuaternionErrorRadians <= 1e-6;
		socket.userData.riggedGripSocketReference = {
			available: browserRuntime && weapon.userData.projectOriginalWeapon === true && weapon.userData.importedWeaponSource === RIGGED_CARBINE_GRIP_REFERENCE.sourceAsset && socket.userData.atomic_socket === reference.atomicSocket && sourceTransformValid,
			referenceId: `${RIGGED_CARBINE_GRIP_REFERENCE.contract}:${socketName}`,
			weaponId,
			sourceAsset: RIGGED_CARBINE_GRIP_REFERENCE.sourceAsset,
			atomicSocket: reference.atomicSocket,
			sourceTransformValid,
			authoredSourceLocalPosition: [...reference.authoredLocalPosition],
			authoredSourceLocalQuaternion: [...reference.authoredLocalQuaternion],
			observedImportedSourceLocalPosition,
			observedImportedSourceLocalQuaternion,
			sourcePositionErrorM,
			sourceQuaternionErrorRadians,
			liveTargetContract: reference.liveTargetContract,
			calibrationApplied: reference.calibrationApplied,
			calibrationReason: reference.calibrationReason,
			evaluatedTargetLocalPosition: [...reference.evaluatedTargetLocalPosition],
			evaluatedTargetLocalQuaternion: [...reference.evaluatedTargetLocalQuaternion],
			expectedHandEuler: [...reference.handEuler],
			wristBasisContract: "authored-wrist-bind-to-operator-root-v1"
		};
	}
	const supportGrip = weapon.getObjectByName("support-socket-l");
	if (supportGrip) {
		supportGrip.position.set(...RIGGED_SUPPORT_GRIP_POSITION[weaponId]);
		supportGrip.userData.riggedReachCalibrated = true;
		supportGrip.userData.riggedReachCalibrationContract = weaponId === "carbine" ? RIGGED_CARBINE_GRIP_REFERENCE.sockets["support-socket-l"].liveTargetContract : "legacy-third-person-support-grip-calibration";
	}
	weapon.traverse((node) => {
		if (node instanceof Mesh) {
			node.userData.presentationOnly = true;
			node.raycast = () => void 0;
		}
	});
	return weapon;
}
function setOperatorWeapon(root, weaponId, flattenMaterials = false, retirePrevious) {
	const rig = operatorRig(root);
	if (!rig || rig.weaponId === weaponId && rig.weapon) return;
	const browserRuntime = typeof document !== "undefined";
	const presentationGeneration = capturePass65PresentationGeneration(root);
	if (browserRuntime && root.userData.pass65PendingWorldWeapon === weaponId) return;
	const weapon = createOperatorWeaponPresentation(weaponId, flattenMaterials);
	if (!weapon) {
		root.userData.pass65PendingWorldWeapon = weaponId;
		const request = Number(root.userData.pass65WorldWeaponRequest ?? 0) + 1;
		root.userData.pass65WorldWeaponRequest = request;
		loadPass65WeaponPresentation(weaponId, "world").then(() => {
			if (!operatorRig(root) || !isPass65PresentationGenerationCurrent(root, presentationGeneration) || root.userData.pass65PendingWorldWeapon !== weaponId || root.userData.pass65WorldWeaponRequest !== request) return;
			delete root.userData.pass65PendingWorldWeapon;
			setOperatorWeapon(root, weaponId, flattenMaterials, retirePrevious);
		}).catch((error) => {
			if (root.userData.pass65PendingWorldWeapon !== weaponId || root.userData.pass65WorldWeaponRequest !== request) return;
			delete root.userData.pass65PendingWorldWeapon;
			root.userData.pass65WorldWeaponLoadError = error instanceof Error ? error.message : String(error);
			console.error(`Pass 65 authored world weapon load failed for ${weaponId}`, error);
		});
		return;
	}
	if (rig.weapon) {
		const previous = rig.weapon;
		rig.weaponSocket.remove(previous);
		if (retirePrevious) retirePrevious(previous, () => releasePass65WeaponModel(previous));
		else disposePass65WeaponModel(previous);
	}
	rig.weaponSocket.add(weapon);
	rig.weapon = weapon;
	rig.weaponId = weaponId;
	delete root.userData.pass65PendingWorldWeapon;
	if (weaponId === "minigun") {
		root.userData.operatorMinigunSpool = createMinigunSpoolState();
		root.userData.operatorMinigunSpoolUpdatedAt = performance.now();
		root.userData.operatorMinigunDriveUntil = 0;
		root.userData.operatorMinigunSpoolTelemetry = {
			fraction: 0,
			phase: "idle",
			angleRadians: 0,
			source: "replicated-shot-window"
		};
	} else {
		delete root.userData.operatorMinigunSpool;
		delete root.userData.operatorMinigunSpoolUpdatedAt;
		delete root.userData.operatorMinigunDriveUntil;
		delete root.userData.operatorMinigunSpoolTelemetry;
	}
	root.userData.operatorGripTelemetry = null;
}
function fireOperator(root) {
	const now = performance.now();
	root.userData.operatorShotAt = now;
	fireRiggedOperator(root);
	const rig = operatorRig(root);
	if (rig?.weapon) {
		fireImportedWeapon(rig.weapon);
		const flash = rig.weapon.getObjectByName("world-muzzle-flash");
		if (flash) flash.visible = true;
		if (rig.weaponId === "minigun") root.userData.operatorMinigunDriveUntil = now + 140;
	}
}
function reactOperator(root, zone) {
	root.userData.operatorHitAt = performance.now();
	root.userData.operatorHitZone = zone;
	root.userData.operatorHitSign = Number(root.userData.operatorHitSign ?? -1) * -1;
	reactRiggedOperator(root, zone);
}
function deathOperator(root) {
	root.userData.operatorDeathAt = performance.now();
	deathRiggedOperator(root);
}
function resetOperator(root) {
	root.userData.operatorDeathAt = 0;
	resetRiggedOperator(root);
}
function meleeOperator(root) {
	root.userData.operatorMeleeAt = performance.now();
	meleeRiggedOperator(root);
	const rig = operatorRig(root);
	if (rig?.meleeKnife) {
		rig.meleeKnife.visible = true;
		meleeImportedWeapon(rig.meleeKnife);
	}
}
function poseOperator(root, stance, speed, _phase, _blend = 1, aimPitch = 0, explicitDeltaSeconds) {
	const rig = operatorRig(root);
	if (!rig) return;
	const now = performance.now();
	const previousAnimationAt = Number(root.userData.pass65WeaponAnimationUpdatedAt ?? now);
	const measuredDeltaSeconds = Math.max(0, (now - previousAnimationAt) / 1e3);
	const animationDeltaSeconds = MathUtils.clamp(Number.isFinite(explicitDeltaSeconds) ? Number(explicitDeltaSeconds) : measuredDeltaSeconds, 0, .05);
	root.userData.pass65WeaponAnimationUpdatedAt = now;
	if (rig.meleeKnife) updateImportedWeapon(rig.meleeKnife, animationDeltaSeconds);
	root.userData.operatorStance = stance;
	const proxyTransform = hitProxyRootTransform(stance);
	rig.hitProxyRoot.position.set(...proxyTransform.position);
	rig.hitProxyRoot.rotation.set(proxyTransform.rotationX, 0, 0);
	const meleeAge = performance.now() - Number(root.userData.operatorMeleeAt ?? -1e4);
	const meleeActive = meleeAge >= 0 && meleeAge < 520;
	for (const entry of rig.armPoseBeforeIk ?? []) {
		entry.bone.position.copy(entry.position);
		entry.bone.quaternion.copy(entry.quaternion);
	}
	updateRiggedOperator(root, speed, stance, {
		aimPitchRadians: aimPitch,
		armed: rig.weaponId !== null
	});
	if (rig.weapon) updateImportedWeapon(rig.weapon, animationDeltaSeconds);
	if (rig.weaponId === "minigun" && rig.weapon) {
		const now = performance.now();
		const state = root.userData.operatorMinigunSpool ?? createMinigunSpoolState();
		const lastUpdatedAt = Number(root.userData.operatorMinigunSpoolUpdatedAt ?? now);
		advanceMinigunSpool(state, {
			dt: Math.max(0, (now - lastUpdatedAt) / 1e3),
			triggerHeld: now < Number(root.userData.operatorMinigunDriveUntil ?? 0),
			equipped: true
		});
		root.userData.operatorMinigunSpool = state;
		root.userData.operatorMinigunSpoolUpdatedAt = now;
		const barrels = rig.weapon.getObjectByName("m134-barrel-cluster") ?? rig.weapon.getObjectByName("minigun-barrel-cluster");
		if (barrels) barrels.rotation.z = state.angleRadians;
		const telemetry = root.userData.operatorMinigunSpoolTelemetry ?? {
			fraction: 0,
			phase: "idle",
			angleRadians: 0,
			source: "replicated-shot-window"
		};
		root.userData.operatorMinigunSpoolTelemetry = telemetry;
		telemetry.fraction = state.fraction;
		telemetry.phase = state.phase;
		telemetry.angleRadians = state.angleRadians;
	}
	rig.armPoseBeforeIk = [
		rig.leftShoulderBone,
		rig.leftElbowBone,
		rig.leftWristBone,
		rig.rightShoulderBone,
		rig.rightElbowBone,
		rig.rightWristBone
	].filter((bone) => bone instanceof Bone).map((bone) => ({
		bone,
		position: bone.position.clone(),
		quaternion: bone.quaternion.clone()
	}));
	root.userData.operatorUnarmedHandPose = rig.weaponId === null ? poseUnarmedRiggedOperatorHands(root) : null;
	root.updateWorldMatrix(true, true);
	if (rig.weapon) {
		rig.weapon.visible = !meleeActive;
		root.userData.operatorGripTelemetry = meleeActive ? null : applyRiggedWeaponGrip(root, rig, rig.weapon);
	}
	if (rig.meleeKnife) rig.meleeKnife.visible = meleeActive;
}
function buildOperator(team, name = "operator", flattenMaterials = false, weaponId = "carbine", appearance = "team", skinId = "default") {
	const rigged = createRiggedOperator(team, name, flattenMaterials, appearance, skinId);
	if (rigged) {
		const { root, weaponSocket } = rigged;
		const hitProxyRoot = new Group();
		hitProxyRoot.name = "authoritative-hit-proxies";
		root.add(hitProxyRoot);
		const proxyMaterial = new MeshBasicMaterial({
			color: 16777215,
			colorWrite: false,
			depthWrite: false
		});
		const proxy = (proxyName, zone, size, position) => {
			const mesh = new Mesh(new BoxGeometry(...size), proxyMaterial);
			mesh.name = proxyName;
			mesh.position.set(...position);
			mesh.visible = false;
			mesh.userData.hitZone = zone;
			mesh.userData.authoritativeProxy = true;
			hitProxyRoot.add(mesh);
		};
		for (const [index, def] of AUTHORITATIVE_HIT_PROXIES.entries()) proxy(`hit-proxy-${def.zone}-${index}`, def.zone, [
			def.size[0],
			def.size[1],
			def.size[2]
		], [
			def.position[0],
			def.position[1],
			def.position[2]
		]);
		root.userData.operatorRig = {
			rigged: true,
			weaponSocket,
			hitProxyRoot,
			weaponId
		};
		const shoulderL = root.getObjectByName("UpperArmL");
		const elbowL = root.getObjectByName("LowerArmL");
		const wristL = root.getObjectByName("WristL");
		if (shoulderL instanceof Bone && elbowL instanceof Bone && wristL instanceof Bone) {
			root.userData.operatorRig.leftShoulderBone = shoulderL;
			root.userData.operatorRig.leftElbowBone = elbowL;
			root.userData.operatorRig.leftWristBone = wristL;
		}
		const shoulderR = root.getObjectByName("UpperArmR");
		const elbowR = root.getObjectByName("LowerArmR");
		const wristR = root.getObjectByName("WristR");
		if (shoulderR instanceof Bone && elbowR instanceof Bone && wristR instanceof Bone) {
			const runtimeRig = root.userData.operatorRig;
			runtimeRig.rightShoulderBone = shoulderR;
			runtimeRig.rightElbowBone = elbowR;
			runtimeRig.rightWristBone = wristR;
			const knife = new Group();
			knife.name = "operator-melee-knife";
			knife.visible = false;
			if (typeof document === "undefined") {
				const handle = roundedBox("operator-knife-handle", [
					.09,
					.25,
					.09
				], MAT.rubber(), .025, 2);
				handle.position.y = -.1;
				const blade = new Mesh(new ConeGeometry(.085, .48, 4), new MeshStandardMaterial({
					color: 13029586,
					roughness: .22,
					metalness: .82
				}));
				blade.name = "operator-knife-blade";
				blade.position.y = -.46;
				blade.rotation.y = Math.PI / 4;
				knife.add(handle, blade);
			} else {
				const presentationGeneration = capturePass65PresentationGeneration(root);
				loadPass65FieldKnifeAsset("world").then(() => {
					if (!isPass65PresentationGenerationCurrent(root, presentationGeneration)) return;
					const authoredKnife = createPass65FieldKnifeModel(flattenMaterials, "world");
					if (!authoredKnife) throw new Error("Pass 65 authored operator field knife unavailable after load");
					knife.add(authoredKnife);
					knife.userData.projectOriginalMeleeWeapon = true;
				}).catch((error) => {
					root.userData.pass65FieldKnifeWorldLoadError = error instanceof Error ? error.message : String(error);
					console.error("Pass 65 authored operator field knife load failed", error);
				});
			}
			knife.position.set(.04, -.08, -.02);
			knife.rotation.set(.14, 0, -.16);
			wristR.add(knife);
			runtimeRig.meleeKnife = knife;
		}
		if (weaponId) setOperatorWeapon(root, weaponId, flattenMaterials);
		root.traverse((node) => {
			node.userData.targetRoot = root;
			if (node instanceof Mesh && node.userData.authoritativeProxy !== true) {
				node.userData.presentationOnly = true;
				node.raycast = () => void 0;
			}
		});
		return root;
	}
	throw new Error(`Canonical rigged operator asset is unavailable for ${name}; primitive operator fallback is prohibited`);
}
//#endregion
//#region src/combat/legacy-weapon-adapter.ts
var LegacyWeaponAdapterError = class extends Error {
	constructor(message) {
		super(`Invalid legacy weapon catalog: ${message}`);
		this.name = "LegacyWeaponAdapterError";
	}
};
var LEGACY_WEAPON_IDS = new Set(LEGACY_WEAPON_ENUMERATION_ORDER);
function legacyWeaponId(id) {
	if (!LEGACY_WEAPON_IDS.has(id)) throw new LegacyWeaponAdapterError(`unsupported weapon id ${JSON.stringify(id)}`);
	return id;
}
function assertExactLegacyRoster(definitions) {
	const seen = /* @__PURE__ */ new Set();
	for (const definition of definitions) {
		if (!LEGACY_WEAPON_IDS.has(definition.id)) throw new LegacyWeaponAdapterError(`unsupported weapon id ${JSON.stringify(definition.id)}`);
		if (seen.has(definition.id)) throw new LegacyWeaponAdapterError(`duplicate weapon id ${JSON.stringify(definition.id)}`);
		seen.add(definition.id);
	}
	if (definitions.length !== LEGACY_WEAPON_ENUMERATION_ORDER.length) {
		const missing = LEGACY_WEAPON_ENUMERATION_ORDER.filter((id) => !seen.has(id));
		throw new LegacyWeaponAdapterError(`expected ${LEGACY_WEAPON_ENUMERATION_ORDER.length} weapons, received ${definitions.length}` + (missing.length > 0 ? `; missing ${missing.join(", ")}` : ""));
	}
	for (let index = 0; index < LEGACY_WEAPON_ENUMERATION_ORDER.length; index += 1) {
		const expected = LEGACY_WEAPON_ENUMERATION_ORDER[index];
		const actual = definitions[index]?.id;
		if (actual !== expected) throw new LegacyWeaponAdapterError(`weapon ${index} must be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
	}
}
/**
* Projects the canonical schema into the compact registry consumed by the live
* runtime. Policy, provenance, and deterministic presentation identifiers stay
* in the canonical catalog rather than being duplicated here.
*/
function adaptWeaponDefinitionToLegacy(definition) {
	return Object.freeze({
		id: legacyWeaponId(definition.id),
		name: definition.displayName,
		damage: definition.damage.base,
		minimumDamage: definition.damage.minimum,
		falloffStart: definition.damage.falloffStartM,
		falloffEnd: definition.damage.falloffEndM,
		headMultiplier: definition.damage.headMultiplier,
		limbMultiplier: definition.damage.limbMultiplier,
		rpm: definition.rpm,
		mag: definition.ammo.magazine,
		reserve: definition.ammo.reserve,
		reload: definition.ammo.reloadSeconds,
		hipSpread: definition.spread.hipRadians,
		adsSpreadMultiplier: definition.spread.adsMultiplier,
		movementSpreadMultiplier: definition.spread.movementMultiplier,
		crouchSpreadMultiplier: definition.spread.crouchMultiplier,
		sustainedSpreadPerShot: definition.spread.sustainedPerShot,
		maximumSpread: definition.spread.maximumRadians,
		pellets: definition.pellets,
		recoilPitch: definition.recoil.pitchRadians,
		recoilYaw: definition.recoil.yawRadians,
		recoilRecovery: definition.recoil.recoveryPerSecond,
		adsRecoilMultiplier: definition.recoil.adsMultiplier,
		crouchRecoilMultiplier: definition.recoil.crouchMultiplier,
		proneRecoilMultiplier: definition.recoil.proneMultiplier,
		switchSeconds: definition.ammo.switchSeconds,
		spinUpMs: definition.spinUpMs,
		movementMultiplier: definition.movementMultiplier,
		automatic: definition.fireMode === "automatic",
		color: definition.effects.tracerColorHex,
		muzzleFlashScale: definition.effects.muzzleFlashScale,
		reportGain: definition.effects.reportGain,
		flashlight: definition.effects.flashlight,
		fireKind: definition.fireKind,
		optic: definition.optic,
		projectileId: definition.projectileId,
		penetration: Object.freeze({
			caliber: definition.penetration.calibreLabel,
			penetrationPower: definition.penetration.power,
			fmjMultiplier: definition.penetration.fmjMultiplier,
			wallPenetrationMultiplier: definition.penetration.wallPenetrationMultiplier,
			energyFalloffStart: definition.penetration.energyFalloffStartM,
			energyFalloffEnd: definition.penetration.energyFalloffEndM,
			minimumEnergyRetention: definition.penetration.minimumEnergyRetention,
			minimumWallDamageMultiplier: definition.penetration.minimumWallDamageMultiplier,
			maxPenetratedSurfaces: definition.penetration.maximumSurfaces
		})
	});
}
function adaptWeaponCatalogToLegacy(definitions) {
	assertExactLegacyRoster(definitions);
	const entries = definitions.map((definition) => [definition.id, adaptWeaponDefinitionToLegacy(definition)]);
	return Object.freeze(Object.fromEntries(entries));
}
var LEGACY_WEAPONS = adaptWeaponCatalogToLegacy(WEAPON_CATALOG);
//#endregion
//#region src/gameplay.ts
/** Solo bots deal one quarter of equivalent player-weapon damage (half the Pass 30 value). */
var BOT_DAMAGE_MULTIPLIER = .25;
function botScaledDamage(rawDamage) {
	return Math.max(0, Number.isFinite(rawDamage) ? rawDamage : 0) * BOT_DAMAGE_MULTIPLIER;
}
function admittedPlayerDamage(damage, minimumDamage = 1) {
	return Math.min(100, Math.max(minimumDamage, damage));
}
var MATCH_WARMUP_MS = 3e3;
var MATCH_DURATION_MS = 3e5;
var DEFAULT_MATCH_RULES = Object.freeze({
	durationMs: MATCH_DURATION_MS,
	scoreLimit: 25
});
var FALL_DAMAGE_SAFE_SPEED = 9.5;
var FALL_DAMAGE_MULTIPLIER = .5;
/** Shared vertical acceleration for the locally simulated player jump. */
var PLAYER_JUMP_GRAVITY = -24.5;
var WEAPONS = LEGACY_WEAPONS;
function movementProfile(context) {
	const prone = context.prone === true;
	const authoredMultiplier = Number.isFinite(context.equippedMovementMultiplier) ? Math.max(.1, Math.min(1.5, context.equippedMovementMultiplier)) : 1;
	const maxSpeed = (prone ? 1.55 : context.crouched ? 3.15 : context.ads ? 4.05 : context.sprinting ? 8.7 : 6.15) * authoredMultiplier;
	const groundAcceleration = prone ? 17 : context.crouched ? 36 : context.sprinting ? 54 : context.ads ? 40 : 48;
	return {
		maxSpeed,
		acceleration: context.grounded ? groundAcceleration : 10.5,
		deceleration: context.grounded ? prone ? 25 : context.crouched ? 42 : 62 : 2.4,
		friction: context.grounded ? 0 : .25,
		eyeHeight: prone ? .61 : context.crouched ? 1.16 : 1.7,
		jumpVelocity: 6.35
	};
}
function approach(current, target, maxDelta) {
	if (current < target) return Math.min(target, current + maxDelta);
	if (current > target) return Math.max(target, current - maxDelta);
	return target;
}
/** Converges on authored speed without creating a hidden low terminal speed through friction. */
function integrateHorizontalVelocity(velocity, input, profile, dt) {
	const inputLength = Math.hypot(input.x, input.z);
	const normalized = inputLength > 1 ? {
		x: input.x / inputLength,
		z: input.z / inputLength
	} : input;
	const target = {
		x: normalized.x * profile.maxSpeed,
		z: normalized.z * profile.maxSpeed
	};
	const rate = inputLength > .001 ? profile.acceleration : profile.deceleration;
	const maxDelta = Math.max(0, rate * Math.max(0, dt));
	const delta = {
		x: target.x - velocity.x,
		z: target.z - velocity.z
	};
	const deltaLength = Math.hypot(delta.x, delta.z);
	if (deltaLength <= maxDelta || deltaLength < 1e-8) return target;
	const scale = maxDelta / deltaLength;
	return {
		x: velocity.x + delta.x * scale,
		z: velocity.z + delta.z * scale
	};
}
function sprintEligible(forwardInput, strafeInput, ads, crouched, prone = false) {
	return !ads && !crouched && !prone && forwardInput > .45 && Math.abs(strafeInput) < .92;
}
/** Pure stance intent reducer; physical clearance is verified by CharacterPhysics before the change is accepted. */
function nextStance(current, action) {
	if (action === "stand") return "stand";
	if (action === "toggle-prone") return current === "prone" ? "stand" : "prone";
	if (current === "stand") return "crouch";
	if (current === "crouch") return "stand";
	return "crouch";
}
function mouseSensitivityMultiplier(ads, sprinting) {
	return ads ? .68 : sprinting ? .94 : 1;
}
function applyRadialDeadzone(x, y, deadzone = .14, exponent = 1.6) {
	if (![
		x,
		y,
		deadzone,
		exponent
	].every(Number.isFinite)) return {
		x: 0,
		y: 0
	};
	const safeDeadzone = Math.max(0, Math.min(.99, deadzone));
	const safeExponent = Math.max(.01, exponent);
	const rawMagnitude = Math.hypot(x, y);
	if (rawMagnitude <= safeDeadzone || rawMagnitude < 1e-8) return {
		x: 0,
		y: 0
	};
	const scaled = Math.pow((Math.min(1, rawMagnitude) - safeDeadzone) / Math.max(.001, 1 - safeDeadzone), safeExponent);
	return {
		x: x / rawMagnitude * scaled,
		y: y / rawMagnitude * scaled
	};
}
/**
* Converts shaped right-stick input into a bounded angular velocity. Acceleration is quick enough
* for target acquisition while the faster release rate prevents stick drift from leaving a tail.
*/
function integrateGamepadLookRate(current, input, dt, ads, sensitivity = 1) {
	const safeDt = Math.max(0, Math.min(.05, dt));
	const safeSensitivity = Math.max(.5, Math.min(1.8, Number.isFinite(sensitivity) ? sensitivity : 1));
	const flickBoost = Math.min(1, Math.hypot(input.x, input.y)) > .92 ? 1.08 : 1;
	const maximumRate = (ads ? 2.02 : 3.78) * safeSensitivity * flickBoost;
	const targetYaw = input.x * maximumRate;
	const targetPitch = input.y * maximumRate * .8;
	const acceleration = ads ? 16.5 : 22;
	const release = 29;
	const integrateAxis = (value, target) => {
		return approach(value, target, ((value === 0 || Math.sign(value) === Math.sign(target)) && Math.abs(target) > Math.abs(value) ? acceleration : release) * safeDt);
	};
	return {
		yaw: integrateAxis(current.yaw, targetYaw),
		pitch: integrateAxis(current.pitch, targetPitch)
	};
}
function computeSpread(weapon, context) {
	let spread = weapon.hipSpread;
	if (context.ads) spread *= weapon.adsSpreadMultiplier;
	if (context.moving) spread *= weapon.movementSpreadMultiplier;
	if (context.crouched) spread *= weapon.crouchSpreadMultiplier;
	if (context.prone) spread *= .62;
	spread += Math.max(0, context.sustainedShots) * weapon.sustainedSpreadPerShot;
	return Math.min(weapon.maximumSpread, spread);
}
/** Uniformly samples a circular cone instead of biasing shots through a random XYZ cube. */
function sampleSpreadDisk(angle, radialRandom, angularRandom) {
	const radius = Math.tan(Math.max(0, angle)) * Math.sqrt(Math.min(1, Math.max(0, radialRandom)));
	const theta = Math.min(1, Math.max(0, angularRandom)) * Math.PI * 2;
	return {
		x: Math.cos(theta) * radius,
		y: Math.sin(theta) * radius
	};
}
/**
* Multi-pellet weapons reserve pellet zero for the reticle ray so a close shot
* remains readable. Single-projectile guns sample their authored cone; ADS and
* stance multipliers make that cone small rather than cosmetically ignoring it.
*/
function sampleWeaponPellet(weapon, pelletIndex, angle, radialRandom, angularRandom) {
	if (weapon.pellets > 1 && pelletIndex <= 0) return {
		x: 0,
		y: 0
	};
	return sampleSpreadDisk(angle, radialRandom, angularRandom);
}
function computeDamage(weapon, distance, zone) {
	const clampedDistance = Math.max(0, distance);
	const falloff = clampedDistance <= weapon.falloffStart ? 0 : Math.min(1, (clampedDistance - weapon.falloffStart) / Math.max(.001, weapon.falloffEnd - weapon.falloffStart));
	const base = weapon.damage + (weapon.minimumDamage - weapon.damage) * falloff;
	const multiplier = zone === "head" ? weapon.headMultiplier : zone === "limb" ? weapon.limbMultiplier : 1;
	const precision = weapon.id === "m14-ebr" ? 10 : 1;
	return Math.max(1, Math.round(base * multiplier * precision) / precision);
}
/** Minigun impacts retain proxy geometry but never enter the critical-hit semantic/UI path. */
function effectiveHitZoneForWeapon(weapon, zone) {
	return weapon.id === "minigun" && zone === "head" ? "body" : zone;
}
/** BO2-like bounded landing damage: impact speed stays authoritative; Pass 72 halves the envelope. */
function computeFallDamage(impactSpeed) {
	const speed = Number.isFinite(impactSpeed) ? Math.max(0, impactSpeed) : 0;
	if (speed <= 9.5) return 0;
	if (speed >= 22) return Math.round(100 * FALL_DAMAGE_MULTIPLIER);
	const normalized = (speed - FALL_DAMAGE_SAFE_SPEED) / (22 - FALL_DAMAGE_SAFE_SPEED);
	return Math.max(1, Math.round(100 * Math.pow(normalized, 1.35) * FALL_DAMAGE_MULTIPLIER));
}
function beginReload(weapon, ammo, reserve, now) {
	if (ammo >= weapon.mag || reserve <= 0) return null;
	const duration = weapon.reload * 1e3;
	return {
		weapon: weapon.id,
		startedAt: now,
		seatAt: now + duration * .72,
		endsAt: now + duration,
		phase: "eject"
	};
}
function reloadProgress(state, now) {
	if (!state) return null;
	const duration = Math.max(1, state.endsAt - state.startedAt);
	return Math.min(1, Math.max(0, (now - state.startedAt) / duration));
}
function cancelReload(state, now) {
	return now < state.seatAt;
}
function completeReload(state, now, ammo, reserve) {
	if (now < state.endsAt) return {
		ammo,
		reserve,
		completed: false
	};
	const weapon = WEAPONS[state.weapon];
	const moved = Math.min(weapon.mag - ammo, reserve);
	return {
		ammo: ammo + moved,
		reserve: reserve - moved,
		completed: true
	};
}
function recoverRecoil(value, weapon, dt) {
	return Math.max(0, value * Math.exp(-weapon.recoilRecovery * Math.max(0, dt)));
}
function computeRecoilImpulse(weapon, sustainedShots, random, context = {
	ads: false,
	crouched: false
}) {
	const buildup = 1 + Math.min(.48, Math.max(0, sustainedShots) * .045);
	const centeredRandom = Math.max(-1, Math.min(1, random * 2 - 1));
	let control = context.ads ? weapon.adsRecoilMultiplier : 1;
	if (context.prone) control *= weapon.proneRecoilMultiplier;
	else if (context.crouched) control *= weapon.crouchRecoilMultiplier;
	return {
		pitch: weapon.recoilPitch * buildup * control,
		yaw: weapon.recoilYaw * centeredRandom * (.8 + buildup * .28) * control
	};
}
function recoverRecoilImpulse(recoil, weapon, dt) {
	const damping = Math.exp(-weapon.recoilRecovery * Math.max(0, dt));
	return {
		pitch: recoil.pitch * damping,
		yaw: recoil.yaw * damping
	};
}
function grenadeDamage(distance) {
	if (distance >= 16) return 0;
	const normalized = Math.max(0, 1 - Math.max(0, distance) / 16);
	return Math.round(230 * normalized * normalized);
}
function meleeStrike(distance, now, lastMeleeAt) {
	const hit = now - lastMeleeAt >= 650 && distance <= 1.75;
	return {
		hit,
		damage: hit ? 100 : 0
	};
}
function createMatch(now, _rules = DEFAULT_MATCH_RULES) {
	return {
		phase: "warmup",
		phaseStartedAt: now,
		endsAt: now + MATCH_WARMUP_MS,
		winner: null
	};
}
function advanceMatch(state, now, scores, rules = DEFAULT_MATCH_RULES) {
	if (state.phase === "ended" && state.rematchRequested) return createMatch(now, rules);
	if (state.phase === "warmup" && now >= state.endsAt) {
		const activeAt = state.endsAt;
		return {
			phase: "active",
			phaseStartedAt: activeAt,
			endsAt: rules.durationMs === null ? Number.POSITIVE_INFINITY : activeAt + rules.durationMs,
			winner: null
		};
	}
	const scoreReached = rules.scoreLimit !== null && (scores[0] >= rules.scoreLimit || scores[1] >= rules.scoreLimit);
	const timeReached = rules.durationMs !== null && now >= state.endsAt;
	if (state.phase === "active" && (scoreReached || timeReached)) return {
		phase: "ended",
		phaseStartedAt: now,
		endsAt: now,
		winner: scores[0] === scores[1] ? "draw" : scores[0] > scores[1] ? 0 : 1,
		endReason: scoreReached ? "score" : "time"
	};
	return state;
}
function advanceFreeForAllMatch(state, now, scores, rules = DEFAULT_MATCH_RULES) {
	if (state.phase === "ended" && state.rematchRequested) return createMatch(now, rules);
	if (state.phase === "warmup" && now >= state.endsAt) return {
		phase: "active",
		phaseStartedAt: state.endsAt,
		endsAt: rules.durationMs === null ? Number.POSITIVE_INFINITY : state.endsAt + rules.durationMs,
		winner: null
	};
	const ordered = [...scores].sort((a, b) => b.kills - a.kills || a.id.localeCompare(b.id));
	const scoreReached = rules.scoreLimit !== null && (ordered[0]?.kills ?? 0) >= rules.scoreLimit;
	const timeReached = rules.durationMs !== null && now >= state.endsAt;
	if (state.phase === "active" && (scoreReached || timeReached)) {
		const topKills = ordered[0]?.kills ?? 0;
		const leaders = ordered.filter((entry) => entry.kills === topKills);
		return {
			phase: "ended",
			phaseStartedAt: now,
			endsAt: now,
			winner: leaders.length === 1 ? null : "draw",
			winnerPlayerId: leaders.length === 1 ? leaders[0].id : void 0,
			endReason: scoreReached ? "score" : "time"
		};
	}
	return state;
}
//#endregion
export { hitProxyZoneCentre as $, dhvLabel as $a, DEFAULT_PRIVATE_MATCH_CONFIG as $i, PASS65_KILLSTREAK_SLOT_DEFINITIONS as $n, applyBotEmissiveBrightness as $r, flarePresentationReplicaKey as $t, reloadProgress as A, defaultSquadPresentation as Aa, isSharedMeshGeometry as Ai, canAdmitMajorDebris as An, HIGH_SCORE_STORAGE_KEY as Ar, isGuestCombatInventory as At, meleeOperator as B, reserveAfterCompletedReload as Ba, segmentBoxHitTime as Bi, CARPET_BOMBER_RESIDUAL_FIRE_DURATION_MS as Bn, configureRuntimeRandom as Br, authorizeSelfPromotion as Bt, integrateHorizontalVelocity as C, operatorEmote as Ca, updateRiggedOperator as Ci, SMOKE_CORRIDOR_RADIUS_M as Cn, admitChatRate as Cr, updateImportedWeapon as Ct, nextStance as D, isSelectableOperatorSkinId as Da, measureCameraFraming as Di, HOUSE_DESTRUCTION_DEFINITION_SET_ID as Dn, normalizeChatText as Dr, SPECIAL_WEAPON_IDS as Dt, movementProfile as E, OPERATOR_SKIN_SOURCES as Ea, characterActionContract as Ei, InteractiveWorldRuntime as En, normalizeChatSenderName as Er, SIDEARM_WEAPON_IDS as Et, buildRetroCoach as F, hasUnlimitedRangeAmmo as Fa, damp as Fi, CarpetGroundFireGuestPresentationAdmission as Fn, normalizeRequiredPlayerName as Fr, GRENADE_CATALOG as Ft, roundedBox as G, gunRangeTestBayOccupants as Ga, browserPresentationIsVisible as Gi, isKillstreakRuntimeCheckpoint as Gn, runtimeSeed as Gr, isSuccessionRoster as Gt, poseOperator as H, advanceGunRangeMatchClock as Ha, sphereIntersectsBox as Hi, HostKillstreakRuntime as Hn, presentationRandom as Hr, evaluateHostLoss as Ht, buildWeaponModel as I, isGunRange as Ia, firstSegmentBoxHit as Ii, carpetGroundFireStateChunks as In, peerOwnedHighScores as Ir, GRENADE_IDS as It, waitForPendingArtTextures as J, projectGunRangeMatchClock as Ja, yieldBrowserCpuTask as Ji, applyPilotedDroneScreenLookDelta as Jn, resetMinigunSpool as Jr, resolveRoomClaimOutcome as Jt, setOperatorWeapon as K, holdGunRangeReplicaAtAuthorityBoundary as Ka, scheduleBrowserPreparationIdleTask as Ki, resolveSupportAircraftEnvelopeStep as Kn, advanceMinigunSpool as Kr, mintSuccessionMandate as Kt, createOperatorWeaponPresentation as L, rangeAccuracyPercent as La, isBlocked as Li, CARPET_BOMBER_BLAST_RADIUS_M as Ln, personalBest as Lr, HOST_SUCCESSION_MANDATE_TTL_MS as Lt, sprintEligible as M, sanitizeSquadPresentation as Ma, proneBodyClearance as Mi, admitKillstreakCareCaptureResultMessage as Mn, leaderboardNameKey as Mr, isPlayerSnapshot as Mt, batchStaticMeshes as N, GUN_RANGE_ROUND_MS as Na, clampPointToBounds as Ni, admitKillstreakStateMessage as Nn, loadHighScores as Nr, isStateTrafficMessage as Nt, recoverRecoil as O, observeLocalOperatorSkinId as Oa, resolveSocketWorld as Oi, createAtomicHouseFragmentDefinitions as On, isReservedMultiplayerParticipantId as Or, WEAPON_IDS as Ot, buildOperator as P, advanceRangeScore as Pa, collidersOverlappingVerticalSpan as Pi, CARPET_GROUND_FIRE_AUTHORITY_CAPACITY as Pn, mergeHighScores as Pr, messageBelongsToPlayer as Pt, hitProxyRootTransform as Q, applyDhvWeaponOutgoingDamage as Qa, CLOCK_PING_INTERVAL_MS as Qi, PASS65_KILLSTREAK_CATALOG as Qn, RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS as Qr, compareFlarePresentationReplicaIdentity as Qt, deathOperator as R, rangeGrenadesAllowed as Ra, pointInsideBounds as Ri, CARPET_BOMBER_IMPACT_FLASH_BASE_RADIUS_M as Rn, saveHighScores as Rr, MAX_HOST_TERM as Rt, integrateGamepadLookRate as S, isOperatorStanceId as Sa, updateFirstPersonArmAnimations as Si, SMOKE_COLOUR_PALETTE as Sn, railgunThermalTargetEligible as Sr, resetImportedWeaponAnimations as St, mouseSensitivityMultiplier as T, OPERATOR_SKIN_CATALOG as Ta, solveTwoBoneElbowInto as Ti, SmokeAuthority as Tn, normalizeChatHistory as Tr, PRIMARY_WEAPON_IDS as Tt, reactOperator as U, createGunRangeMatchClockSnapshot as Ua, sweepSphereAgainstBoxes as Ui, chopperGunnerAuthoritativeRay as Un, protocolRandom as Ur, hostLossPresentation as Ut, optimizeAttachedWeapon as V, reserveHudValue as Va, segmentIntersectsBox as Vi, CHOPPER_MISSILE_BLAST_RADIUS_M as Vn, gameplayRandom as Vr, electHostSuccessor as Vt, resetOperator as W, gunRangeTestBayOccupancyBoundaryCount as Wa, browserOwnsForegroundPresentation as Wi, chopperGunnerCameraOrigin as Wn, runtimeRandomTelemetry as Wr, isSuccessionMandate as Wt, roundStatSummary as X, DHV_VALUES as Xa, yieldVisibleBrowserPresentationFrame as Xi, SUPPORT_FORWARD_AXIS as Xn, FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY as Xr, MAX_FLARE_PRESENTATION_REPLICAS as Xt, damageNumberPresentation as Y, restoreGunRangeMatchClock as Ya, yieldBrowserPreparationFrame as Yi, pilotedDroneControlAxes as Yn, BOT_EMISSIVE_BRIGHTNESS_SCALE as Yr, BotWeaponPresentationReplayGuard as Yt, AUTHORITATIVE_HIT_PROXIES as Z, applyDhvIncomingDamage as Za, wrapAngleRadians as Zi, CRIMSON_FLAMETHROWER_KILLSTREAK_ID as Zn, RIGGED_OPERATOR_CORPSE_ACTION_NAMES as Zr, canonicalizeFlarePresentationReplicas as Zt, computeRecoilImpulse as _, DEFAULT_OPERATOR_EMOTE as _a, riggedOperatorAssetReady as _i, isTimedMapWeaponAuthorityState as _n, grantTrainingRailgun as _r, pass65WeaponCacheTelemetry as _t, PLAYER_JUMP_GRAVITY as a, canHostCommitStart as aa, firstPersonArmAuthoredLayerSample as ai, flareBurnDamagePerSecond as an, interpolateHostedBotSnapshot as ao, DRONE_SUPPORT_DEFINITIONS as ar, createPass65CrossbowModel as at, effectiveHitZoneForWeapon as b, OPERATOR_STANCES as ba, riggedOperatorTelemetry as bi, FlashVictimResultConsumer as bn, isStaleRailgunAuthorityState as br, releasePass65WeaponModelsIn as bt, advanceFreeForAllMatch as c, freeForAllLeaders as ca, loadFirstPersonArmsAsset as ci, TIMED_MAP_WEAPON_DEFINITIONS as cn, WEAPON_CATALOG as co, RAILGUN_UPPER_ROOM_SPAWN_SITES as cr, disposePass65WeaponModel as ct, beginReload as d, isPrivateMatchConfig as da, operatorSkinAssetReady as di, claimTimedMapWeapon as dn, ARENA_IDS as do, advanceRailgunChamber as dr, invalidatePass65PresentationTree as dt, LOBBY_KILL_LIMITS as ea, applyFirstPersonArmSkin as ei, isFlarePresentationReplicaSnapshot as en, isDhv as eo, parseKillstreakLoadout as er, PASS65_AUTHORED_WEAPON_URLS as et, botScaledDamage as f, latencyQuality as fa, playFirstPersonArmAction as fi, consumeTimedMapWeaponShot as fn, isArenaId as fo, claimRailgun as fr, isPass65AuthoredFirearm as ft, computeFallDamage as g, teamTotals as ga, resolveRiggedOperatorRuntimeRoot as gi, isStaleTimedMapWeaponAuthority as gn, fireRailgun as gr, meleeImportedWeapon as gt, computeDamage as h, rejoinReservationExpired as ha, resetFirstPersonArmFingers as hi, grantTrainingTimedMapWeapon as hn, dropRailgun as hr, loadPass65WeaponPresentation as ht, MATCH_WARMUP_MS as i, balanceLobbyTeams as ia, firstPersonArmAnimationState as ii, advanceFlareProjectileKinematics as in, hostedBotSnapshotContinuity as io, DRONE_PRESENTATION_FAMILY_ID as ir, capturePass70FirstPersonMaterialState as it, sampleWeaponPellet as j, renderSquadRosterBadge as ja, PRONE_PRESENTATION_ENVELOPE as ji, FIELD_SHED_DEFINITION as jn, immediateStreakEntry as jr, isHostAuthorityMessage as jt, recoverRecoilImpulse as k, operatorSkinPalette as ka, GPU_SHARED_GEOMETRY_KEY as ki, SHARED_MAJOR_DEBRIS_BUDGET as kn, LEADERBOARD_SEASON as kr, isGameMessage as kt, advanceMatch as l, isLobbyMember as la, loadOperatorSkinAsset as li, TIMED_MAP_WEAPON_IDS as ln, sustainedRecoilBurden as lo, admitRailgunTargets as lr, fireImportedWeapon as lt, completeReload as m, recordPlayerDamage as ma, resetFirstPersonArmAnimations as mi, dropTimedMapWeapon as mn, createRailgunBeamAuthority as mr, loadPass65WeaponAsset as mt, DEFAULT_MATCH_RULES as n, LOBBY_TIME_LIMITS_MS as na, createRiggedOperator as ni, FLAMETHROWER_EFFECT as nn, hostedBotIds as no, CHOPPER_GUN_PROFILE as nr, PASS70_FIRST_PERSON_OPTIC_WINDOW_OPACITY as nt, WEAPONS as o, canHostStart as oa, firstPersonArmBaseActionFor as oi, flameDamageAllowsTarget as on, isHostedBotCount as oo, RAILGUN_RECHAMBER_MS as or, createPass65FieldKnifeModel as ot, cancelReload as p, playersAreHostile as pa, prewarmRiggedOperatorActions as pi, createTimedMapWeaponAuthority as pn, createRailgunAuthorityState as pr, loadPass65FieldKnifeAsset as pt, texturedMaterial as q, isGunRangeMatchClockSnapshot as qa, waitForVisibleBrowserPreparation as qi, applyPilotedDronePointerDelta as qn, createMinigunSpoolState as qr, resolveHostTermConflict as qt, MATCH_DURATION_MS as r, REJOIN_GRACE_MS as ra, emoteRiggedOperator as ri, FLARE_PROJECTILE_EFFECT as rn, hostedBotReplicationActive as ro, DRONE_GUN_PROFILE as rr, authoredOpticAssembly as rt, admittedPlayerDamage as s, emptyPlayerScore as sa, getFirstPersonArmAuthoredLayer as si, flameDamagePerPulse as sn, isHostedBotSnapshot as so, RAILGUN_SPAWN_DELAY_MS as sr, createPass65WeaponModel as st, BOT_DAMAGE_MULTIPLIER as t, LOBBY_START_LEAD_MS as ta, createFirstPersonRiggedArms as ti, isFlarePresentationStateMessage as tn, reportedDhvRawDamage as to, validateKillstreakLoadout as tr, PASS70_FIRST_PERSON_OPTIC_WINDOW_CONTRACT as tt, applyRadialDeadzone as u, isPlayerScore as ua, loadRiggedOperatorAsset as ui, advanceTimedMapWeaponAuthority as un, parseWeaponDefinitions as uo, advanceRailgunAuthority as ur, importedWeaponTelemetry as ut, computeSpread as v, DEFAULT_OPERATOR_STANCE as va, riggedOperatorCanonicalEvidenceManifest as vi, isFlashResultMessage as vn, isRailgunAuthorityState as vr, prewarmPass65RuntimeWeaponCorpus as vt, meleeStrike as w, operatorStance as wa, solveTwoBoneElbow as wi, SMOKE_VOLUME_LIFETIME_MS as wn, appendChatHistory as wr, ORDINARY_WEAPON_IDS as wt, grenadeDamage as x, isOperatorEmoteId as xa, setFirstPersonArmBaseAction as xi, flashActivationId as xn, railgunStateResyncDue as xr, reloadImportedWeapon as xt, createMatch as y, OPERATOR_EMOTES as ya, riggedOperatorHandEvidenceIdentity as yi, FlashHostAuthority as yn, isRailgunBeamAuthority as yr, releasePass65WeaponModel as yt, fireOperator as z, reloadSupply as za, resolveHorizontalMove as zi, CARPET_BOMBER_IMPACT_FLASH_MAXIMUM_SCALE as zn, MAX_MATCH_KILLS as zr, acceptPromotedHost as zt };
