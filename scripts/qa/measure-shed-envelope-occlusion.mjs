#!/usr/bin/env node
// CPU-only envelope/topology instrument for the day3 shed lane.
// Run with `node --import tsx scripts/qa/measure-shed-envelope-occlusion.mjs`
// when using a checkout without the local CJS tsx registration.

import {
  RAY_COUNT,
  escapeFraction,
  gateOneState,
  holeAreaStillSolid,
  indexedTriangles,
  panelTriangles,
  parseApertures,
  parseIds,
  placementFor,
  rawCollapsedSelfTest,
  stateFor,
} from './lib/shed-see-through.mjs';

const argv = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const has = (name) => argv.includes(name);

function help() {
  console.log(`Usage: node scripts/qa/measure-shed-envelope-occlusion.mjs [options]

Options:
  --shed <placementId>       Registered shed placement (default: nuketown2-shed-north-yard)
  --detached <ids>           Comma-separated surface or chunk ids
  --apertures <spec>         surface:uQ,vQ,rUQ,rVQ;... (host mutations)
  --no-topology-fallback     Require the measured panel topology directly
  --help                     Show this help`);
}

if (has('--help')) {
  help();
  process.exit(0);
}

const rawSelfTestTriangles = rawCollapsedSelfTest();
if (rawSelfTestTriangles !== 0) {
  console.error(JSON.stringify({ verdict: 'FAIL', rawSelfTestTriangles, expected: 0 }));
  process.exit(1);
}

const placement = placementFor(value('--shed', 'nuketown2-shed-north-yard'));
const apertures = parseApertures(value('--apertures'));
const detached = parseIds(value('--detached'));
const state = stateFor(placement, { apertures, detached });
const triangles = panelTriangles(state);
const escape = escapeFraction(state, placement);
const hole = holeAreaStillSolid(state, placement);
const intact = apertures.length === 0 && detached.length === 0;
const result = {
  verdict: intact && escape.escaped !== 0 ? 'FAIL' : 'PASS',
  placementId: placement.id,
  stateRevision: state.revision,
  topologyFallback: has('--no-topology-fallback') ? 'forbidden' : 'not-used',
  rawSelfTest: { indexedTriangles: rawSelfTestTriangles, expected: 0 },
  perSurface: triangles,
  indexedTriangleTotal: Object.values(triangles).reduce((sum, count) => sum + count, 0),
  escape: { ...escape, samples: RAY_COUNT, percent: escape.fraction * 100 },
  holeAreaStillSolid: hole,
  detachedChunkIds: state.detachedChunkIds,
  apertureCount: state.surfaces.reduce((sum, surface) => sum + surface.apertures.length, 0),
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.verdict === 'PASS' ? 0 : 1);
