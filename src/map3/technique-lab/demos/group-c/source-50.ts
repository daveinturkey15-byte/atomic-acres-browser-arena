/**
 * Source 50 — fable51-worlds: whole-world QA that is MECHANICAL rather than
 * visual — the passability sweep.
 *
 * Licence read as a file at the pin: PhiloLabs/fable51-worlds @
 * 1dcc255adc5600cfec8a7e3e38c896074668dd1e, LICENSE, MIT, "Copyright (c) 2026
 * PhiloLabs". The register's decision is INGEST THE QA HARNESS PATTERN ONLY —
 * no code reuse, no vendoring, no port — because the repository is WebGL /
 * three 0.180 with no TSL and no WebGPU, so nothing in it drops into our
 * renderer. This lane keeps to that: the sweep below is written here.
 *
 * The method: a world with twelve thousand colliders cannot be audited by
 * walking it, but it can be audited by asking every metre of every street
 * whether it is open. Step the corridor centreline at a fixed interval, sweep
 * the full paved width at each station, and ask whether a disc of the player's
 * radius can pass. Collapse runs of blocked stations, and EXIT NON-ZERO when
 * anything is blocked — a gate that reports and passes is not a gate.
 *
 * The runnable artifact is `scripts/technique-lab/group-c/passability-sweep.mjs`,
 * which imports the same `sweepCorridor` used here, so the exhibit and the gate
 * cannot drift apart. BEFORE is the corridor with an obstruction left in it and
 * its blocked stations marked red; AFTER is the cleared corridor, all stations
 * green. The draw-calls-before-milliseconds ordering rule is carried in the
 * counters: geometry counts are reported, wall-clock is not, deliberately.
 */

import {
  CLEARED_OBSTACLES,
  DEFECTIVE_OBSTACLES,
  PLAYER_RADIUS,
  STATION_SPACING,
  sweepCorridor,
  type SweepResult,
  type Obstacle,
} from './passability';
import {
  beforeAfterPanels,
  countDraws,
  disposeTree,
  type Demo,
  type DemoContext,
} from './shared';

export {
  CLEARED_OBSTACLES,
  DEFECTIVE_OBSTACLES,
  PLAYER_RADIUS,
  STATION_SPACING,
  sweepCorridor,
} from './passability';
export type { Obstacle, Station, SweepResult } from './passability';

const LENGTH = 9.0;
const WIDTH = 2.2;

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const root = new THREE.Group();
  root.name = 'source-50-mechanical-passability-sweep';
  const { before, after } = beforeAfterPanels(THREE, 3.6);

  const defective = sweepCorridor(LENGTH, WIDTH, DEFECTIVE_OBSTACLES);
  const cleared = sweepCorridor(LENGTH, WIDTH, CLEARED_OBSTACLES);

  const floorGeometry = new THREE.PlaneGeometry(WIDTH, LENGTH, 1, 1);
  floorGeometry.rotateX(-Math.PI / 2);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.96 });
  const obstacleGeometry = new THREE.CylinderGeometry(1, 1, 0.4, 14);
  const obstacleMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5f4e, roughness: 0.88 });
  const stationGeometry = new THREE.CircleGeometry(PLAYER_RADIUS, 16);
  stationGeometry.rotateX(-Math.PI / 2);

  function build(
    group: import('three').Group,
    obstacles: readonly Obstacle[],
    result: SweepResult,
  ): void {
    group.add(new THREE.Mesh(floorGeometry, floorMaterial));
    for (const obstacle of obstacles) {
      const mesh = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
      mesh.scale.set(obstacle.radius, 1, obstacle.radius);
      mesh.position.set(obstacle.x, 0.2, obstacle.z);
      mesh.name = 'collider';
      group.add(mesh);
    }
    // One disc per station, at the player's own radius, coloured by the answer.
    const passableMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0x2f8f5b,
      emissiveIntensity: 0.9,
      roughness: 0.7,
    });
    const blockedMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xc0392b,
      emissiveIntensity: 1.2,
      roughness: 0.7,
    });
    for (const station of result.stations) {
      const disc = new THREE.Mesh(
        stationGeometry,
        station.passable ? passableMaterial : blockedMaterial,
      );
      disc.position.set(0, 0.012, station.z);
      disc.name = station.passable ? 'station-passable' : 'station-blocked';
      group.add(disc);
    }
  }

  build(before, DEFECTIVE_OBSTACLES, defective);
  build(after, CLEARED_OBSTACLES, cleared);
  root.add(before, after);
  const draws = countDraws(root);

  return {
    root,
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 50,
      title: 'Mechanical passability sweep: every 1.5 m, can a 0.34 m disc pass?',
      method:
        'The corridor centreline is stepped every 1.5 m; each station samples the full paved '
        + 'width, finds the widest continuous gap, and passes only if a disc of the player radius '
        + 'fits. Runs of blocked stations are collapsed into regions, and the companion script '
        + 'exits non-zero when any station is blocked. Counts are reported before timings, '
        + 'deliberately, because headless wall-clock on a shared machine drifts run to run.',
      adaptation: 'adapted',
      sources: [
        'https://github.com/PhiloLabs/fable51-worlds',
        'https://raw.githubusercontent.com/PhiloLabs/fable51-worlds/1dcc255adc5600cfec8a7e3e38c896074668dd1e/kyoto-higashiyama/tools/passability.mjs',
      ],
      limitation:
        'Written from the described method; no code is ported from the MIT source, whose harness '
        + 'is WebGL/three 0.180 and drives a real page under Playwright. THIS SWEEP DOES NOT DRIVE '
        + 'A BROWSER: it runs against an analytic obstacle list, not against the built world\'s '
        + 'actual colliders, so it is the gate\'s shape and not yet the gate. The second probe the '
        + 'register pairs with it (a traversal walkthrough that distinguishes world defects from '
        + 'naive steering) is absent, as are the perf harness\'s real draw-call/triangle readings '
        + 'and the HMR-survival retry. No cel/ink art direction is adopted — the register places '
        + 'that against the owner\'s direction.',
      localLights: [],
      counters: {
        stationSpacingCm: STATION_SPACING * 100,
        playerRadiusCm: PLAYER_RADIUS * 100,
        stations: defective.stations.length,
        blockedBefore: defective.blocked,
        blockedAfter: cleared.blocked,
        blockedRunsBefore: defective.blockedRuns.length,
        meshes: draws.meshes,
        triangles: draws.triangles,
      },
    },
  };
}

export default createDemo;
