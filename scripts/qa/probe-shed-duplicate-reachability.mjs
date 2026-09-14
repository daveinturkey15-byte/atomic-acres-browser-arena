#!/usr/bin/env node
// CPU replay of the shipped weapon spread/recoil path. This deliberately does
// not call bulletHitShed or any test-only mutation hook.

import { createRequire } from 'node:module';
import { panelCoordinates, FIELD_SHED_DEFINITION, placementFor, THREE } from './lib/shed-see-through.mjs';

const require = createRequire(import.meta.url);
require('tsx/cjs');
const { computeRecoilImpulse, computeSpread, recoverRecoilImpulse, sampleSpreadDisk, sampleWeaponPellet, WEAPONS } = require('../../src/gameplay.ts');

const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
if (has('--help')) {
  console.log(`Usage: node --import tsx scripts/qa/probe-shed-duplicate-reachability.mjs [--shots N]
Simulates every shipped weapon against wall-east, quantises impacts with the
runtime panelCoordinates helper, and runs the required 10,000-shot jitter soak.`);
  process.exit(0);
}

const get = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? Number(argv[index + 1]) : fallback;
};
const SOAK_SHOTS = Math.max(10_000, get('--shots', 10_000));
const surface = FIELD_SHED_DEFINITION.surfaces.find((candidate) => candidate.id === 'wall-east');
const normal = new THREE.Vector3().crossVectors(
  new THREE.Vector3(surface.frame.uAxis.x, surface.frame.uAxis.y, surface.frame.uAxis.z),
  new THREE.Vector3(surface.frame.vAxis.x, surface.frame.vAxis.y, surface.frame.vAxis.z),
).normalize();
const origin = new THREE.Vector3(surface.frame.centre.x, surface.frame.centre.y, surface.frame.centre.z).addScaledVector(normal, -3);
const context = { ads: false, moving: false, crouched: false, sustainedShots: 0 };
const intervalSweepSeconds = [0, 0.1, 0.25, 0.5, 1, 2, 3, 5];

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function impactTuple(weapon, shotIndex, intervalSeconds, jitterDegrees, random, recoilState) {
  const nextRecoil = recoverRecoilImpulse(recoilState, weapon, intervalSeconds);
  const recoil = computeRecoilImpulse(weapon, shotIndex, random(), context);
  nextRecoil.pitch += recoil.pitch;
  nextRecoil.yaw += recoil.yaw;
  const angle = computeSpread(weapon, { ...context, sustainedShots: shotIndex });
  const pelletTuples = [];
  for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
    const radial = random();
    const angular = random();
    const spread = sampleWeaponPellet(weapon, pellet, angle, radial, angular);
    // Keep the underlying circular sampler in this replay's source census as
    // well; sampleWeaponPellet delegates to it for all non-reserved pellets.
    const directSpread = sampleSpreadDisk(angle, radial, angular);
    const jitter = jitterDegrees * Math.PI / 180;
    const jitterU = (random() * 2 - 1) * jitter;
    const jitterV = (random() * 2 - 1) * jitter;
    const direction = normal.clone()
      .addScaledVector(new THREE.Vector3(surface.frame.uAxis.x, surface.frame.uAxis.y, surface.frame.uAxis.z), spread.x + nextRecoil.yaw + jitterU)
      .addScaledVector(new THREE.Vector3(surface.frame.vAxis.x, surface.frame.vAxis.y, surface.frame.vAxis.z), spread.y + nextRecoil.pitch + jitterV)
      .normalize();
    const denominator = direction.dot(normal);
    if (denominator <= 0) continue;
    const distance = new THREE.Vector3(surface.frame.centre.x, surface.frame.centre.y, surface.frame.centre.z).sub(origin).dot(normal) / denominator;
    const point = origin.clone().addScaledVector(direction, distance);
    const coordinates = panelCoordinates(surface.frame, point);
    pelletTuples.push(`${coordinates.uQ},${coordinates.vQ}`);
    if (pellet > 0 && (spread.x !== directSpread.x || spread.y !== directSpread.y)) {
      throw new Error(`${weapon.id}: sampleWeaponPellet diverged from sampleSpreadDisk`);
    }
  }
  return { tuples: pelletTuples, recoil: nextRecoil };
}

function sequence(weapon, intervalSeconds, jitterDegrees, shots, seed) {
  const random = rng(seed);
  let recoil = { pitch: 0, yaw: 0 };
  const tuples = [];
  for (let shot = 0; shot < shots; shot += 1) {
    const result = impactTuple(weapon, shot, intervalSeconds, jitterDegrees, random, recoil);
    recoil = result.recoil;
    for (const tuple of result.tuples) tuples.push({ tuple, shot });
  }
  return tuples;
}

function duplicateSummary(entries, intervalSeconds) {
  const byTuple = new Map();
  for (const entry of entries) {
    const prior = byTuple.get(entry.tuple) ?? [];
    prior.push(entry.shot * intervalSeconds);
    byTuple.set(entry.tuple, prior);
  }
  let maxIdentical = 0;
  let minimumStillness = null;
  let tripleWithinThreeSeconds = false;
  for (const times of byTuple.values()) {
    maxIdentical = Math.max(maxIdentical, times.length);
    for (let index = 1; index < times.length; index += 1) {
      const gap = times[index] - times[index - 1];
      minimumStillness = minimumStillness === null ? gap : Math.min(minimumStillness, gap);
    }
    if (times.length >= 3 && times[times.length - 1] - times[0] <= 3) tripleWithinThreeSeconds = true;
  }
  return { maxIdentical, minimumStillnessSeconds: minimumStillness, tripleWithinThreeSeconds };
}

const weapons = Object.entries(WEAPONS);
const multiPellet = [];
const exactZeroSpread = [];
const results = {};
let realisticReachable = false;
let stillnessReachable = false;

for (const [id, weapon] of weapons) {
  if (weapon.pellets > 1) multiPellet.push(id);
  const spread = computeSpread(weapon, context);
  const zeroSample = sampleWeaponPellet(weapon, 0, spread, 0.5, 0.5);
  if ((zeroSample.x === 0 && zeroSample.y === 0) || spread === 0) exactZeroSpread.push(id);
  const intervals = intervalSweepSeconds.map((seconds) => {
    const interval = Math.max(seconds, 60 / weapon.rpm / 1000);
    const summary = duplicateSummary(sequence(weapon, interval, 0, 80, 0x51ed0000 + id.length), interval);
    if (summary.tripleWithinThreeSeconds && interval <= 3) stillnessReachable = true;
    return { intervalSeconds: interval, ...summary };
  });
  const soak = {};
  for (const jitter of [0.01, 0.05, 0.2]) {
    const summary = duplicateSummary(sequence(weapon, 60 / weapon.rpm / 1000, jitter, SOAK_SHOTS, 0x11000000 + id.length * 97 + Math.round(jitter * 100)), 60 / weapon.rpm / 1000);
    soak[`${jitter}deg`] = { shots: SOAK_SHOTS, panelsWithThreeIdenticalTuples: summary.maxIdentical >= 3 ? 1 : 0, ...summary };
    if (jitter >= 0.01 && summary.maxIdentical >= 3) realisticReachable = true;
  }
  results[id] = {
    pellets: weapon.pellets,
    admittedSpreadRadians: spread,
    exactZeroPelletSample: zeroSample,
    minimumStillnessSweep: intervals,
    soak,
  };
}

const decision = realisticReachable ? 'REACHABLE' : stillnessReachable ? 'BOT-ONLY' : 'HOOK-ONLY';
console.log(JSON.stringify({
  verdict: 'PASS',
  decision,
  placement: placementFor().id,
  targetSurface: surface.id,
  shooter: { distanceMetres: 3, stationary: true, origin: origin.toArray() },
  weaponTable: { pelletsGreaterThanOne: multiPellet, admittedExactZeroSpread: exactZeroSpread },
  intervalSweepSeconds,
  weapons: results,
  sourceFunctions: ['computeSpread', 'computeRecoilImpulse', 'recoverRecoilImpulse', 'sampleWeaponPellet', 'sampleSpreadDisk', 'panelCoordinates'],
}, null, 2));
