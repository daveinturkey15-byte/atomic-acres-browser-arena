/**
 * probe-hf420-foam-ceiling.ts - what the repo's foam/breaking estimator can
 * actually reach, per water body (Lane AM, HF-420).
 *
 * WHY THIS EXISTS. HF-420's bubble backscatter is required by the technique to
 * share ONE estimator with the whitecaps: foam is the bubbles that reached the
 * surface, backscatter is the ones that did not, so the two can never disagree.
 * The backscatter term then measured as invisible in play. Before blaming the
 * new term, the estimator it reads has to be measured - and it turns out the
 * estimator is the thing that is dead.
 *
 * The estimator multiplies a crest-HEIGHT term by a SLOPE term:
 *
 *   crestFoam = smoothstep(0.88, 1.28, normalisedCrest) * smoothstep(0.06, 0.2, |slope|)
 *
 * For a sum of sines those two are in QUADRATURE - height ~ sin(phase), slope ~
 * cos(phase) - so where the crest is highest the slope is near zero, and the
 * product can never approach 1. This samples the real frozen band table over a
 * dense (x, z, t) grid per body and reports what the product actually reaches.
 *
 * It is a MEASUREMENT SCRIPT, not a gate: it must not fail when someone fixes
 * the estimator, it must report the new number.
 *
 * Usage: npx tsx scripts/qa/probe-hf420-foam-ceiling.ts [--samples N] [--out FILE]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { OCEAN_BANDS, OCEAN_REFERENCE_AMPLITUDE } from '../../src/water/ocean-spectrum';
import {
  OCEAN_FOAM_CREST_LOW,
  OCEAN_FOAM_CREST_HIGH,
  OCEAN_FOAM_SLOPE_LOW,
  OCEAN_FOAM_SLOPE_HIGH,
  OCEAN_BACKSCATTER_DECAY,
  oceanAmplitudeForBody,
} from '../../src/water/ocean-tsl';
import {
  WATER_POOLS,
  waterBodyForArena,
  waterBodyId,
  type WaterBodyDefinition,
} from '../../src/water/water-authoring';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};
const SAMPLES = Number(opt('--samples', '400000'));
const OUT = opt('--out', '');

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic low-discrepancy (x, z, t) sequence. A fixed golden-ratio
 * additive sequence rather than Math.random, so the numbers in the evidence are
 * reproducible by re-running this file.
 */
function sample(index: number, axis: number): number {
  const alpha = [0.7548776662466927, 0.5698402909980532, 0.8191725133961645][axis];
  return (0.5 + alpha * (index + 1)) % 1;
}

/** Exactly the TSL graph's summed field: vertical height and its analytic slope. */
function evaluate(x: number, z: number, timeSeconds: number, amplitude: number) {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  for (const band of OCEAN_BANDS) {
    const phase = x * band.directionX * band.waveNumber
      + z * band.directionZ * band.waveNumber
      - timeSeconds * band.angularFrequency
      + band.phase;
    const scaled = amplitude * band.weight;
    height += Math.sin(phase) * scaled;
    const phaseCos = Math.cos(phase) * scaled;
    slopeX += phaseCos * band.waveNumber * band.directionX;
    slopeZ += phaseCos * band.waveNumber * band.directionZ;
  }
  return { height, slope: Math.hypot(slopeX, slopeZ) };
}

function ceilingFor(body: WaterBodyDefinition) {
  const amplitude = oceanAmplitudeForBody(body);
  const extent = body.shape ? Math.max(body.shape.sizeX, body.shape.sizeZ) : body.nearSize;
  const slopes: number[] = [];
  let maxFoam = 0;
  let maxFoamCrest = 0;
  let maxFoamSlope = 0;
  let maxBackscatter = 0;
  let framesAboveGate = 0;
  for (let index = 0; index < SAMPLES; index += 1) {
    const x = (sample(index, 0) - 0.5) * extent;
    const z = (sample(index, 1) - 0.5) * extent;
    const timeSeconds = sample(index, 2) * 120;
    const { height, slope } = evaluate(x, z, timeSeconds, amplitude);
    slopes.push(slope);
    const normalizedCrest = height / Math.max(amplitude, 0.001) * 0.5 + 0.5;
    const turbulence = smoothstep(OCEAN_FOAM_SLOPE_LOW, OCEAN_FOAM_SLOPE_HIGH, slope);
    if (turbulence > 0) framesAboveGate += 1;
    const foam = smoothstep(OCEAN_FOAM_CREST_LOW, OCEAN_FOAM_CREST_HIGH, normalizedCrest) * turbulence;
    if (foam > maxFoam) {
      maxFoam = foam;
      maxFoamCrest = normalizedCrest;
      maxFoamSlope = slope;
    }
    const backscatter = smoothstep(
      OCEAN_FOAM_CREST_LOW - OCEAN_BACKSCATTER_DECAY,
      OCEAN_FOAM_CREST_HIGH,
      normalizedCrest,
    ) * turbulence;
    if (backscatter > maxBackscatter) maxBackscatter = backscatter;
  }
  slopes.sort((a, b) => a - b);
  const at = (q: number) => Number(slopes[Math.min(slopes.length - 1, Math.floor(q * slopes.length))].toFixed(6));
  return {
    bodyId: waterBodyId(body),
    arenaId: body.arenaId,
    amplitudeScale: body.amplitudeScale,
    amplitude: Number(amplitude.toFixed(6)),
    referenceAmplitude: OCEAN_REFERENCE_AMPLITUDE,
    sampledExtentM: extent,
    slopeP50: at(0.5),
    slopeP99: at(0.99),
    slopeMax: Number(slopes[slopes.length - 1].toFixed(6)),
    // The gate the estimator has to clear before ANY foam or backscatter exists.
    slopeGateOpensAt: OCEAN_FOAM_SLOPE_LOW,
    slopeGateSaturatesAt: OCEAN_FOAM_SLOPE_HIGH,
    fractionAboveSlopeGate: Number((framesAboveGate / SAMPLES).toFixed(6)),
    maxReachableFoam: Number(maxFoam.toFixed(6)),
    maxReachableFoamAtCrest: Number(maxFoamCrest.toFixed(6)),
    maxReachableFoamAtSlope: Number(maxFoamSlope.toFixed(6)),
    maxReachableBackscatterFraction: Number(maxBackscatter.toFixed(6)),
  };
}

const bodies: WaterBodyDefinition[] = [];
for (const arenaId of ['rustworks-1v1', 'high-seas', 'farcrysis']) {
  const body = waterBodyForArena(arenaId);
  if (body) bodies.push(body);
}
for (const pools of Object.values(WATER_POOLS)) {
  for (const pool of pools ?? []) bodies.push(pool);
}

const report = {
  samplesPerBody: SAMPLES,
  note: 'Measurement, not a gate. If the estimator is fixed these numbers move.',
  bodies: bodies.map(ceilingFor),
};
const text = JSON.stringify(report, null, 2);
console.log(text);
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${text}\n`, 'utf8');
}
