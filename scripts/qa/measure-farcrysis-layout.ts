#!/usr/bin/env npx tsx
/**
 * measure-farcrysis-layout.ts — PASS 95 layout receipt (SPEC.md §7 L2/L3).
 *
 * Builds the farcrysis arena in the deterministic unit environment (the same
 * canvas-free document stub the farcrysis vitest suites use), runs the real
 * eye-to-eye occlusion metric from src/farcrysis-layout.ts, classifies every
 * mid-map mass under the L2 rule, and writes one JSON receipt.
 *
 *   npx tsx scripts/qa/measure-farcrysis-layout.ts --out docs/evidence/pass95/farcrysis-rebuild/layout-<label>.json
 *
 * No browser, no GPU, no lock. Numbers here are [MEASURED] in the unit
 * environment; they are not frame captures.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

function fakeCanvasContext(): unknown {
  const gradient = () => ({ addColorStop: () => undefined });
  const state: Record<PropertyKey, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px sans-serif' };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'createImageData' || prop === 'getImageData') {
        return (...args: number[]) => {
          const w = args.length >= 4 ? args[2]! : args[0]!;
          const h = args.length >= 4 ? args[3]! : args[1]!;
          return { width: w, height: h, data: new Uint8ClampedArray(Math.max(4, w * h * 4)) };
        };
      }
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 10 });
      if (typeof prop === 'string') {
        if (!(prop in target)) target[prop] = () => undefined;
        return target[prop];
      }
      return undefined;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

const context = fakeCanvasContext();
(globalThis as { document?: unknown }).document = {
  createElement: () => ({
    width: 0, height: 0, getContext: () => context, style: {},
    setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
  }),
  getElementById: () => null,
  documentElement: { dataset: { renderBackend: 'webgl2' } },
  body: { appendChild: () => undefined },
};

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1]! : fallback;
};
const out = resolve(arg('--out', 'artifacts/qa/farcrysis-layout.json'));

async function main(): Promise<void> {
  const THREE = await import('three');
  const { buildFarcrysis } = await import('../../src/farcrysis');
  const layout = await import('../../src/farcrysis-layout');
  const { farcrysisMaterialCensus } = await import('../../src/farcrysis-material-vocabulary');
  const { FARCRYSIS_MAX_SIGHTLINE, FARCRYSIS_COVER_MIN } = await import('../../src/farcrysis-constants');

  const scene = new THREE.Scene();
  const arena = buildFarcrysis(scene);
  const sightlines = layout.measureFarcrysisSightlines(arena);
  const middle = layout.measureFarcrysisMidMapMasses(arena);
  const census = farcrysisMaterialCensus(arena.root);
  const audit = (arena.root.userData.farcrysisColliderAudit ?? []) as ReadonlyArray<{ id: string }>;
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

  const perOrigin = sightlines.origins.map((o) => {
    const own = sightlines.samples.filter((s) => s.origin === o.id);
    const worst = own.reduce((b, s) => (s.openM > b.openM ? s : b), own[0]!);
    return { id: o.id, kind: o.kind, x: o.x, z: o.z, maxOpenM: Number(worst.openM.toFixed(2)), worstBearingDeg: worst.bearingDeg, blockedBy: worst.blockedBy, over22: own.filter((s) => s.openM > FARCRYSIS_MAX_SIGHTLINE).length };
  });

  const receipt = {
    contract: 'farcrysis-layout-receipt-v1',
    sha,
    measuredAt: new Date().toISOString(),
    environment: 'vitest-equivalent unit environment (no browser, no GPU)',
    ceilings: { maxSightlineM: FARCRYSIS_MAX_SIGHTLINE, coverMin: FARCRYSIS_COVER_MIN, middleRadiusM: middle.radiusM },
    scale: layout.FARCRYSIS_SCALE,
    loops: layout.FARCRYSIS_LOOPS.map((l) => ({ id: l.id, chebyshevM: l.chebyshevM, waypoints: l.waypoints, sprintLapS: Number(l.sprintLapS.toFixed(1)), register: l.register })),
    census: { solidColliders: audit.length, physicalCover: arena.physicalCover.length, shotSurfaces: arena.shotSurfaces.length, colliders: arena.colliders.length, ...census },
    sightlines: {
      eyeHeightM: sightlines.eyeHeightM,
      bearings: sightlines.bearings,
      origins: sightlines.origins.length,
      samples: sightlines.samples.length,
      maxOpenM: Number(sightlines.maxOpenM.toFixed(2)),
      maxOpenSample: sightlines.maxOpenSample,
      p50OpenM: Number(sightlines.p50OpenM.toFixed(2)),
      p90OpenM: Number(sightlines.p90OpenM.toFixed(2)),
      overCeiling: sightlines.overCeiling,
      underCeilingFraction: Number(sightlines.underCeilingFraction.toFixed(4)),
      spawnPairs: sightlines.spawnPairs.length,
      spawnPairsOpen: sightlines.spawnPairsOpen,
      openSpawnPairs: sightlines.spawnPairs.filter((p) => !p.blocked),
      perOrigin,
    },
    middle: {
      radiusM: middle.radiusM,
      massCount: middle.masses.length,
      unjustified: middle.unjustified,
      masses: middle.masses.map((m) => ({ ...m, centre: [Number(m.centre[0].toFixed(2)), Number(m.centre[1].toFixed(2))], chebyshevM: Number(m.chebyshevM.toFixed(2)) })),
    },
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`[farcrysis-layout] sha ${sha.slice(0, 8)} materials ${census.materials} solids ${audit.length} cover ${arena.physicalCover.length}`);
  console.log(`[farcrysis-layout] sightlines: max ${receipt.sightlines.maxOpenM} m (${sightlines.maxOpenSample.origin} @ ${sightlines.maxOpenSample.bearingDeg} deg -> ${sightlines.maxOpenSample.blockedBy}), p50 ${receipt.sightlines.p50OpenM}, p90 ${receipt.sightlines.p90OpenM}, over ${FARCRYSIS_MAX_SIGHTLINE} m: ${sightlines.overCeiling}/${sightlines.samples.length}, spawn pairs open ${sightlines.spawnPairsOpen}/${sightlines.spawnPairs.length}`);
  console.log(`[farcrysis-layout] middle (chebyshev <= ${middle.radiusM} m): ${middle.masses.length} masses, unjustified ${middle.unjustified.length}: ${middle.unjustified.join(', ')}`);
  console.log(`[farcrysis-layout] wrote ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
