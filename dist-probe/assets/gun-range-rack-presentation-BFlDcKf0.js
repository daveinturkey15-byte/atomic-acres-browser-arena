import { Fc as Mesh, hs as Group } from "./vendor-three-VV5gneRl.js";
import { ct as disposePass65WeaponModel, ft as isPass65AuthoredFirearm, mt as loadPass65WeaponAsset, st as createPass65WeaponModel, tt as PASS65_AUTHORED_WEAPON_URLS } from "./gameplay-D7mQKMV7.js";
import { b as GUN_RANGE_WEAPON_STATIONS } from "./additional-maps-CaqfawcT.js";
//#region src/gun-range-rack-presentation.ts
function authoredStationWeapon(stationId, weapon) {
	if (!isPass65AuthoredFirearm(weapon)) throw new Error(`Gun Range station ${stationId} requires an authored firearm, received ${weapon}`);
	return weapon;
}
var GUN_RANGE_RACK_ASSETS = Object.freeze(GUN_RANGE_WEAPON_STATIONS.map((station) => {
	const weapon = authoredStationWeapon(station.id, station.weapon);
	return Object.freeze({
		stationId: station.id,
		weapon,
		url: PASS65_AUTHORED_WEAPON_URLS[weapon].world
	});
}));
var defaultRuntime = Object.freeze({
	load: (weapon) => loadPass65WeaponAsset(weapon, "world"),
	create: (weapon) => createPass65WeaponModel(weapon, false, "world"),
	dispose: disposePass65WeaponModel
});
var pendingByRoot = /* @__PURE__ */ new WeakMap();
var readyByRoot = /* @__PURE__ */ new WeakMap();
function abortError() {
	return new DOMException("Gun Range authored rack load aborted", "AbortError");
}
function assertNotAborted(signal) {
	if (signal?.aborted) throw abortError();
}
function stationRoot(arenaRoot, asset) {
	const root = arenaRoot.getObjectByName(`gun-range-weapon-station-${asset.weapon}`);
	if (!(root instanceof Group) || root.userData.stationId !== asset.stationId || root.userData.weapon !== asset.weapon) throw new Error(`Gun Range rack identity mismatch for ${asset.stationId}/${asset.weapon}`);
	return root;
}
function setStatus(root, status, ready, error) {
	root.userData.gunRangeRackPresentation = Object.freeze({
		status,
		required: GUN_RANGE_RACK_ASSETS.length,
		ready,
		source: status === "ready" ? "project-original-blender-world-lod0" : "fail-closed",
		error: error === void 0 ? null : error instanceof Error ? error.message : String(error)
	});
}
function validateAuthoredModel(model, asset) {
	const source = String(model.userData.importedWeaponSource ?? "");
	const modelId = String(model.userData.weaponModelId ?? "");
	let meshCount = 0;
	model.traverse((node) => {
		if (node instanceof Mesh) meshCount += 1;
	});
	if (model.userData.projectOriginalWeapon !== true || model.userData.deliveryVariant !== "world" || source !== asset.url || source.includes("procedural") || modelId.length === 0 || modelId.includes("procedural") || meshCount === 0) throw new Error(`Gun Range rack rejected non-authored or incomplete model for ${asset.stationId}/${asset.weapon}`);
}
/**
* Loads and validates all five authored world-LOD firearms before atomically
* attaching any station presentation. The caller must await this behind the
* deployment surface, then run the existing selected-scene GPU prewarm.
*/
function loadGunRangeRackPresentation(arenaRoot, options) {
	const ready = readyByRoot.get(arenaRoot);
	if (ready) {
		for (const url of ready.requestedResources) options.recordRequest(url);
		return Promise.resolve(ready);
	}
	const pending = pendingByRoot.get(arenaRoot);
	if (pending) return pending;
	const runtime = options.runtime ?? defaultRuntime;
	const task = (async () => {
		assertNotAborted(options.signal);
		const stationRoots = GUN_RANGE_RACK_ASSETS.map((asset) => stationRoot(arenaRoot, asset));
		for (const root of stationRoots) {
			if (root.children.some((child) => child.name.startsWith("gun-range-rack-weapon-"))) throw new Error(`Gun Range station ${String(root.userData.stationId)} already contains a rack weapon`);
			root.userData.rackPresentationSource = "fail-closed-loading";
		}
		setStatus(arenaRoot, "loading", 0);
		const requestedResources = GUN_RANGE_RACK_ASSETS.map((asset) => asset.url);
		for (const url of requestedResources) options.recordRequest(url);
		await Promise.all(GUN_RANGE_RACK_ASSETS.map((asset) => runtime.load(asset.weapon)));
		assertNotAborted(options.signal);
		const created = [];
		try {
			for (let index = 0; index < GUN_RANGE_RACK_ASSETS.length; index += 1) {
				assertNotAborted(options.signal);
				const asset = GUN_RANGE_RACK_ASSETS[index];
				const model = runtime.create(asset.weapon);
				if (!model) throw new Error(`Authored Gun Range rack asset unavailable after load: ${asset.weapon}`);
				created.push({
					asset,
					station: stationRoots[index],
					model
				});
				validateAuthoredModel(model, asset);
				model.name = `gun-range-rack-weapon-${asset.weapon}`;
				model.rotation.set(.08, Math.PI / 2, -.08);
				model.scale.setScalar(asset.weapon === "lmg" ? .52 : .58);
				model.userData.weaponId = asset.weapon;
				model.userData.gunRangeStationId = asset.stationId;
				model.userData.presentationSource = "project-original-blender-world-lod0";
				model.userData.dynamic = true;
				model.traverse((node) => {
					node.userData.presentationOnly = true;
					if (node instanceof Mesh) node.raycast = () => void 0;
				});
			}
			assertNotAborted(options.signal);
			for (const entry of created) {
				entry.station.add(entry.model);
				entry.station.userData.rackPresentationSource = "project-original-blender-world-lod0";
				entry.station.userData.rackModelId = entry.model.userData.weaponModelId;
			}
		} catch (error) {
			for (const entry of created) {
				entry.model.removeFromParent();
				runtime.dispose(entry.model);
			}
			throw error;
		}
		const receipt = Object.freeze({
			status: "ready",
			stationCount: created.length,
			requestedResources: Object.freeze([...requestedResources]),
			stations: Object.freeze(created.map(({ asset, model }) => Object.freeze({
				stationId: asset.stationId,
				weapon: asset.weapon,
				source: String(model.userData.importedWeaponSource),
				modelId: String(model.userData.weaponModelId)
			})))
		});
		readyByRoot.set(arenaRoot, receipt);
		setStatus(arenaRoot, "ready", created.length);
		return receipt;
	})().catch((error) => {
		for (const asset of GUN_RANGE_RACK_ASSETS) {
			const root = arenaRoot.getObjectByName(`gun-range-weapon-station-${asset.weapon}`);
			if (root) root.userData.rackPresentationSource = "fail-closed";
		}
		setStatus(arenaRoot, "failed", 0, error);
		throw error;
	}).finally(() => {
		pendingByRoot.delete(arenaRoot);
	});
	pendingByRoot.set(arenaRoot, task);
	return task;
}
//#endregion
export { loadGunRangeRackPresentation as n, GUN_RANGE_RACK_ASSETS as t };
