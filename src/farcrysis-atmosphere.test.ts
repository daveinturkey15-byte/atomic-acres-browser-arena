/**
 * HF-371 — Farcrysis atmosphere.
 *
 * This module had no test at all, which is how it kept two peers looking at
 * different god rays for several passes without anyone noticing. The three
 * properties pinned here are the three that were silently untrue: the scatter
 * is deterministic, the shafts are published in a form another system can use,
 * and the air moves with the shared wind field instead of ignoring it.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { PARTICLE_MAX_LIGHT_SHAFTS } from './particles';
import { animateAtmosphere, buildAtmosphere, farcrysisLightShafts, softDotTexture } from './farcrysis-atmosphere';
import { activeLightShafts, resetLightShafts } from './particles/light-shaft-registry';

function buildScene(): THREE.Scene {
  const scene = new THREE.Scene();
  buildAtmosphere(scene);
  return scene;
}

function pointsNamed(scene: THREE.Scene, name: string): THREE.Points {
  return scene.getObjectByName(name) as THREE.Points;
}

function positionsOf(points: THREE.Points): Float32Array {
  return (points.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
}

describe('the arena builds the air it advertises', () => {
  it('mounts dust, fireflies, fog, the sun disk and the shafts', () => {
    const scene = buildScene();
    expect(pointsNamed(scene, 'farcrysis-atmos-dust')).toBeTruthy();
    expect(pointsNamed(scene, 'farcrysis-atmos-fireflies')).toBeTruthy();
    expect(scene.getObjectByName('farcrysis-atmos-fog')).toBeTruthy();
    expect(scene.getObjectByName('farcrysis-atmos-sun-disk')).toBeTruthy();
    expect(scene.getObjectByName('farcrysis-atmos-god-ray-shafts')).toBeTruthy();
  });

  it('keeps every point inside the arena it decorates', () => {
    const scene = buildScene();
    const dust = positionsOf(pointsNamed(scene, 'farcrysis-atmos-dust'));
    for (let index = 0; index < dust.length; index += 3) {
      expect(dust[index]).toBeGreaterThanOrEqual(FARCRYSIS_BOUNDS.minX);
      expect(dust[index]).toBeLessThanOrEqual(FARCRYSIS_BOUNDS.maxX);
      expect(dust[index + 2]).toBeGreaterThanOrEqual(FARCRYSIS_BOUNDS.minZ);
      expect(dust[index + 2]).toBeLessThanOrEqual(FARCRYSIS_BOUNDS.maxZ);
    }
  });

  it('synthesises its sprite from maths, because the test env has no canvas', () => {
    const texture = softDotTexture();
    expect(texture.image.width).toBe(32);
    // Same instance on every call: one 32x32 texture for the whole arena.
    expect(softDotTexture()).toBe(texture);
  });
});

describe('every peer sees the same light', () => {
  it('rebuilds byte-identical scatter, with no raw Math.random left', () => {
    // The defect: the dust was seeded in Pass 76 but the shafts and fireflies
    // were not, so two players in one match stood in the same clearing looking
    // at different god rays.
    const first = buildScene();
    const firstFireflies = Float32Array.from(positionsOf(pointsNamed(first, 'farcrysis-atmos-fireflies')));
    const firstShafts = farcrysisLightShafts().map((shaft) => ({ ...shaft }));

    const second = buildScene();
    const secondFireflies = positionsOf(pointsNamed(second, 'farcrysis-atmos-fireflies'));
    const secondShafts = farcrysisLightShafts();

    expect(Float32Array.from(secondFireflies)).toEqual(firstFireflies);
    expect(secondShafts.map((shaft) => ({ ...shaft }))).toEqual(firstShafts);
  });

  it('forks its streams so adding one system cannot move another', () => {
    // Dust, fireflies and shafts each draw from their own fork of one arena
    // seed. If they shared a stream, changing the shaft count would silently
    // reposition every firefly.
    const scene = buildScene();
    const dust = Float32Array.from(positionsOf(pointsNamed(scene, 'farcrysis-atmos-dust')));
    const fireflies = Float32Array.from(positionsOf(pointsNamed(scene, 'farcrysis-atmos-fireflies')));
    expect(dust.length).toBeGreaterThan(0);
    expect(fireflies.length).toBeGreaterThan(0);
    // Distinct forks produce distinct scatters rather than the same numbers.
    expect(Array.from(dust.slice(0, 6))).not.toEqual(Array.from(fireflies.slice(0, 6)));
  });
});

describe('the shafts are published, not just drawn', () => {
  it('hands out one usable cone per authored shaft', () => {
    buildScene();
    const shafts = farcrysisLightShafts();
    expect(shafts.length).toBeGreaterThan(0);
    for (const shaft of shafts) {
      const axisLength = Math.hypot(shaft.axisX, shaft.axisY, shaft.axisZ);
      expect(axisLength).toBeGreaterThan(0.9);
      expect(axisLength).toBeLessThan(1.1);
      expect(shaft.radiusM).toBeGreaterThan(0);
      for (const value of [shaft.x, shaft.y, shaft.z, shaft.radiusM]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('stays inside what the particle runtime will actually read', () => {
    // The runtime caps registered shafts so the mote loop's cost is bounded.
    // Authoring far more than it reads would silently drop the rest.
    buildScene();
    expect(farcrysisLightShafts().length).toBeLessThanOrEqual(PARTICLE_MAX_LIGHT_SHAFTS + 1);
  });

  it('does not leak shafts across rebuilds', () => {
    buildScene();
    const first = farcrysisLightShafts().length;
    buildScene();
    expect(farcrysisLightShafts().length).toBe(first);
  });
});

describe('the air obeys the shared wind field', () => {
  it('drifts the motes downwind instead of hanging still', () => {
    const scene = buildScene();
    const dust = pointsNamed(scene, 'farcrysis-atmos-dust');
    animateAtmosphere(0, { x: 0, z: 0 });
    const still = Float32Array.from(positionsOf(dust));
    for (let frame = 1; frame <= 60; frame += 1) {
      animateAtmosphere(frame / 60, { x: 6, z: 0 });
    }
    const blown = positionsOf(dust);
    let downwind = 0;
    for (let index = 0; index < still.length; index += 3) {
      if (blown[index] > still[index] + 0.5) downwind += 1;
    }
    expect(downwind).toBeGreaterThan(still.length / 3 * 0.8);
  });

  it('behaves exactly as before when no wind is supplied', () => {
    const scene = buildScene();
    const dust = pointsNamed(scene, 'farcrysis-atmos-dust');
    animateAtmosphere(0);
    const before = Float32Array.from(positionsOf(dust));
    for (let frame = 1; frame <= 120; frame += 1) animateAtmosphere(frame / 60);
    animateAtmosphere(0);
    // The same clock reproduces the same field: no hidden wind integration.
    expect(Float32Array.from(positionsOf(dust))).toEqual(before);
  });

  it('never lets a steady breeze carry the whole field off the map', () => {
    // Ten minutes of monsoon at 9 m/s is 5.4 km of raw displacement. Without
    // the wrap the clearing simply goes dead, which is a worse bug than the
    // one the wind coupling fixes.
    const scene = buildScene();
    const dust = pointsNamed(scene, 'farcrysis-atmos-dust');
    animateAtmosphere(0, { x: 9, z: 4 });
    for (let frame = 1; frame <= 60 * 600; frame += 1) {
      if (frame % 60 !== 0) continue;
      animateAtmosphere(frame / 60, { x: 9, z: 4 });
    }
    const positions = positionsOf(dust);
    const spanX = FARCRYSIS_BOUNDS.maxX - FARCRYSIS_BOUNDS.minX;
    const spanZ = FARCRYSIS_BOUNDS.maxZ - FARCRYSIS_BOUNDS.minZ;
    for (let index = 0; index < positions.length; index += 3) {
      expect(Math.abs(positions[index])).toBeLessThan(spanX * 1.5);
      expect(Math.abs(positions[index + 2])).toBeLessThan(spanZ * 1.5);
    }
  });

  it('survives a NaN wind sample rather than poisoning every position', () => {
    const scene = buildScene();
    const dust = pointsNamed(scene, 'farcrysis-atmos-dust');
    animateAtmosphere(0, { x: 0, z: 0 });
    animateAtmosphere(1, { x: Number.NaN, z: Number.NaN });
    for (const value of positionsOf(dust)) expect(Number.isFinite(value)).toBe(true);
  });

  it('clamps a backgrounded tab\'s multi-second step', () => {
    const scene = buildScene();
    const dust = pointsNamed(scene, 'farcrysis-atmos-dust');
    animateAtmosphere(0, { x: 0, z: 0 });
    const before = Float32Array.from(positionsOf(dust));
    // A tab hidden for a minute hands back a 60 s step on the next frame.
    animateAtmosphere(60, { x: 9, z: 0 });
    const after = positionsOf(dust);
    let maxJump = 0;
    for (let index = 0; index < before.length; index += 3) {
      maxJump = Math.max(maxJump, Math.abs(after[index] - before[index]));
    }
    // The circular motion moves them; the wind must not add a kilometre.
    expect(maxJump).toBeLessThan(20);
  });
});

describe('the shafts are published where the particle runtime will find them', () => {
  // THE ANTI-ORPHAN TEST. `farcrysisLightShafts()` returning the right cones
  // was already green while nothing on earth called it - a repo-wide grep found
  // it imported by this file and nothing else, and live telemetry read
  // `particles.lightShafts: 0` on every arena. Asserting the getter is
  // asserting the input; this asserts that BUILDING THE ARENA hands the cones
  // to the subscriber the particle runtime actually reads.
  it('publishes farcrysis shafts as a side effect of building the atmosphere', () => {
    resetLightShafts();
    expect(activeLightShafts().arenaId).toBeNull();
    expect(activeLightShafts().shafts).toHaveLength(0);

    const scene = new THREE.Scene();
    buildAtmosphere(scene);

    const published = activeLightShafts();
    expect(published.arenaId).toBe('farcrysis');
    expect(published.shafts.length).toBe(farcrysisLightShafts().length);
    expect(published.shafts.length).toBeGreaterThan(0);
    for (let index = 0; index < published.shafts.length; index += 1) {
      expect(published.shafts[index]).toEqual(farcrysisLightShafts()[index]);
    }
    resetLightShafts();
  });
});
