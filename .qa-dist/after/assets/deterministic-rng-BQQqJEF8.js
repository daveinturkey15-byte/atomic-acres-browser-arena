//#region src/deterministic-rng.ts
var UINT32_RANGE = 4294967296;
function mix32(value) {
	let mixed = value >>> 0;
	mixed ^= mixed >>> 16;
	mixed = Math.imul(mixed, 2146121005);
	mixed ^= mixed >>> 15;
	mixed = Math.imul(mixed, 2221713035);
	mixed ^= mixed >>> 16;
	return mixed >>> 0;
}
function seedFromString(value) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return mix32(hash);
}
/** Deterministic PRNG for replayable simulation/tests. It is not suitable for security tokens. */
var DeterministicRng = class DeterministicRng {
	state;
	origin;
	constructor(seed) {
		this.origin = typeof seed === "string" ? seedFromString(seed) : mix32(seed);
		this.state = this.origin;
	}
	nextUint32() {
		this.state = this.state + 1831565813 >>> 0;
		let value = this.state;
		value = Math.imul(value ^ value >>> 15, value | 1);
		value ^= value + Math.imul(value ^ value >>> 7, value | 61);
		return (value ^ value >>> 14) >>> 0;
	}
	next() {
		return this.nextUint32() / UINT32_RANGE;
	}
	snapshot() {
		return this.state >>> 0;
	}
	fork(label) {
		return new DeterministicRng(mix32(this.origin ^ seedFromString(label)));
	}
};
/** Keeps cosmetic and transport randomness from perturbing gameplay/replay randomness. */
function createRandomStreams(seed) {
	const root = new DeterministicRng(seed);
	return {
		gameplay: root.fork("gameplay"),
		presentation: root.fork("presentation"),
		protocol: root.fork("protocol")
	};
}
//#endregion
export { createRandomStreams as n, DeterministicRng as t };
