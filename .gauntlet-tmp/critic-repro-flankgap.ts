import { CENTRAL_BUS, PARKED_VAN_LAYOUT, PARKED_VAN_SIZE } from './src/arena-layout';

console.log('bus:', JSON.stringify(CENTRAL_BUS));
console.log('van layout:', JSON.stringify(PARKED_VAN_LAYOUT), 'size:', JSON.stringify(PARKED_VAN_SIZE));

// Replicate flankGap from src/arena-layout.test.ts HF-383 pin, without casts.
function num(v: unknown, key: string): number {
	if (typeof v === 'object' && v !== null && key in v) {
		const val = (v as Record<string, unknown>)[key]; // shape known via repo type; narrow explicitly
		return typeof val === 'number' ? val : NaN;
	}
	return NaN;
}
const busMinX = num(CENTRAL_BUS, 'minX');
const busMaxX = num(CENTRAL_BUS, 'maxX');
const vanX = num(PARKED_VAN_LAYOUT, 'x');
const halfW = PARKED_VAN_SIZE[0] / 2;
if (Number.isFinite(busMinX) && Number.isFinite(busMaxX)) {
	const flankGap = Math.min(vanX - halfW - busMaxX, busMinX - (vanX + halfW));
	console.log('flankGap:', flankGap.toFixed(3));
} else {
	console.log('CENTRAL_BUS lacks minX/maxX keys — inspect printed shape above');
}
