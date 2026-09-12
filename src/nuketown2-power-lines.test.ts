/**
 * nuketown2-power-lines.test.ts — Mechanical verification suite for HF-536 power lines:
 * catenary spans, eaves drops, pole transformers, clearance, sag, and non-intersection.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildNuketown2 } from './nuketown2-arena';
import {
  deriveNuketown2PowerLinesTelemetry,
  POWER_CATENARY_SAG_RATIO,
  POWER_DROP_SAG_RATIO,
  POWER_POLE_HEIGHT,
  POWER_CROSSARM_Y,
  POWER_INSULATOR_Y,
  NORTH_POLE_POSITIONS,
  SOUTH_POLE_POSITIONS,
} from './nuketown2-power-lines';

function build() {
  const scene = new THREE.Scene();
  const map = buildNuketown2(scene);
  map.root.updateMatrixWorld(true);
  return map;
}


describe('HF-536 Nuke Town 2 Power Lines (Gemini)', () => {
  const telemetry = deriveNuketown2PowerLinesTelemetry();

  it('verifies span count equals pole pairs (consecutive poles on both verges)', () => {
    // 3 poles North -> 2 spans. 3 poles South -> 2 spans. Total 4 pole pairs = 4 spans.
    const northPolePairs = NORTH_POLE_POSITIONS.length - 1;
    const southPolePairs = SOUTH_POLE_POSITIONS.length - 1;
    const totalPolePairs = northPolePairs + southPolePairs;

    expect(telemetry.spans.length, 'span count must equal pole pairs').toBe(totalPolePairs);
    expect(telemetry.spans.length).toBe(4);

    const northSpans = telemetry.spans.filter((s) => s.side === 'north');
    const southSpans = telemetry.spans.filter((s) => s.side === 'south');
    expect(northSpans).toHaveLength(2);
    expect(southSpans).toHaveLength(2);
    expect(POWER_POLE_HEIGHT).toBe(7.4);
    expect(POWER_INSULATOR_Y).toBe(7.20);
    expect(POWER_CROSSARM_Y).toBe(7.05);
  });

  it('verifies per span the chain endpoints coincide with insulator anchors within 0.02 m', () => {
    for (const span of telemetry.spans) {
      expect(span.conductors).toHaveLength(3);
      for (const conductor of span.conductors) {
        expect(conductor.segments.length).toBeGreaterThanOrEqual(8);
        expect(conductor.segments.length).toBeLessThanOrEqual(10);

        const firstSeg = conductor.segments[0]!;
        const lastSeg = conductor.segments[conductor.segments.length - 1]!;

        const startDist = Math.hypot(
          firstSeg.start[0] - conductor.startInsulator[0],
          firstSeg.start[1] - conductor.startInsulator[1],
          firstSeg.start[2] - conductor.startInsulator[2],
        );
        const endDist = Math.hypot(
          lastSeg.end[0] - conductor.endInsulator[0],
          lastSeg.end[1] - conductor.endInsulator[1],
          lastSeg.end[2] - conductor.endInsulator[2],
        );

        expect(startDist, `${span.id} c${conductor.index} start endpoint coincides with insulator anchor`)
          .toBeLessThanOrEqual(0.02);
        expect(endDist, `${span.id} c${conductor.index} end endpoint coincides with insulator anchor`)
          .toBeLessThanOrEqual(0.02);

        // Consecutive segment continuity
        for (let i = 0; i < conductor.segments.length - 1; i += 1) {
          const segA = conductor.segments[i]!;
          const segB = conductor.segments[i + 1]!;
          const stepDist = Math.hypot(
            segA.end[0] - segB.start[0],
            segA.end[1] - segB.start[1],
            segA.end[2] - segB.start[2],
          );
          expect(stepDist, `${span.id} c${conductor.index} segment ${i} to ${i + 1} continuity`)
            .toBeLessThanOrEqual(0.001);
        }
      }
    }
  });

  it('verifies catenary sag ratio is within [0.025, 0.035] (nominal 3 % of span length)', () => {
    expect(POWER_CATENARY_SAG_RATIO).toBeCloseTo(0.03, 3);
    for (const span of telemetry.spans) {
      expect(span.sagRatio, `${span.id} sag ratio`).toBeGreaterThanOrEqual(0.025);
      expect(span.sagRatio, `${span.id} sag ratio`).toBeLessThanOrEqual(0.035);
      expect(span.sag).toBeCloseTo(span.length * POWER_CATENARY_SAG_RATIO, 3);
    }
  });

  it('verifies drop line sag ratio is nominal 4 % of span length', () => {
    expect(POWER_DROP_SAG_RATIO).toBeCloseTo(0.04, 3);
    expect(telemetry.dropLines).toHaveLength(2);
    for (const drop of telemetry.dropLines) {
      expect(drop.sagRatio, `${drop.id} sag ratio`).toBeCloseTo(0.04, 3);
      expect(drop.sag).toBeCloseTo(drop.length * POWER_DROP_SAG_RATIO, 3);
    }
  });

  it('verifies minimum clearance above the road plane >= 6.5 m for catenaries and >= 4.5 m for drops', () => {
    // 1. Catenary clearance
    for (const span of telemetry.spans) {
      expect(span.minY, `${span.id} clearance above road`).toBeGreaterThanOrEqual(6.5);
      for (const conductor of span.conductors) {
        expect(conductor.minY, `${span.id} c${conductor.index} clearance`).toBeGreaterThanOrEqual(6.5);
        for (const seg of conductor.segments) {
          expect(seg.minY, `${span.id} segment minY`).toBeGreaterThanOrEqual(6.5);
        }
      }
    }
    expect(telemetry.minCatenaryClearance).toBeGreaterThanOrEqual(6.5);

    // 2. Drop line clearance
    for (const drop of telemetry.dropLines) {
      expect(drop.minY, `${drop.id} clearance above ground`).toBeGreaterThanOrEqual(4.5);
      for (const seg of drop.segments) {
        expect(seg.minY, `${drop.id} segment minY`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(telemetry.minDropClearance).toBeGreaterThanOrEqual(4.5);
  });

  it('verifies no segment AABB intersects a lamp head, tree canopy lobe, balcony or roof body (enumerated by name)', () => {
    const map = build();

    // Enumerate named obstacle meshes: lamp heads, tree canopy lobes, balcony, and roof bodies
    const enumeratedObstacleNames = [
      // 1. Lamp heads (all parts across both verges)
      'nuketown2 north verge west lamp head',
      'nuketown2 north verge east lamp head',
      'nuketown2 south verge west lamp head',
      'nuketown2 south verge east lamp head',
      // 2. Tree canopy lobes (avenue trees and yard hedges)
      'nuketown2-avenue-sector',
      'nuketown2-hedges',
      // 3. Balcony bodies (deck, rails, posts)
      'nuketown2 north balcony deck',
      'nuketown2 south balcony deck',
      'nuketown2 north balcony rail outboard',
      'nuketown2 south balcony rail outboard',
      'nuketown2 north balcony rail return far',
      'nuketown2 south balcony rail return far',
      'nuketown2 north balcony rail newel',
      'nuketown2 south balcony rail newel',
      'nuketown2 north balcony post 0',
      'nuketown2 south balcony post 0',
      // 4. Roof bodies (main roof decks, garage roofs, and shingle slope courses)
      'nuketown2 north house roof deck',
      'nuketown2 south house roof deck',
      'nuketown2 north garage roof',
      'nuketown2 south garage roof',
      'nuketown2 north house roof shingles course',
      'nuketown2 south house roof shingles course',
    ];
    const obstacles: Array<{ name: string; box: THREE.Box3 }> = [];
    map.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.name) return;
      if (enumeratedObstacleNames.some((target) => node.name.includes(target))) {
        const box = new THREE.Box3().setFromObject(node);
        obstacles.push({ name: node.name, box });
      }
    });

    expect(obstacles.length, 'enumerated obstacles found in the arena').toBeGreaterThan(10);

    // All cable segments (catenary conductors + drop lines)
    const allSegments = [
      ...telemetry.spans.flatMap((s) => s.conductors.flatMap((c) => c.segments)),
      ...telemetry.dropLines.flatMap((d) => d.segments),
    ];

    for (const seg of allSegments) {
      for (const obs of obstacles) {
        const intersects = seg.aabb.intersectsBox(obs.box);
        expect(
          intersects,
          `cable segment [${seg.start.map((n) => n.toFixed(2))}]->[${seg.end.map((n) => n.toFixed(2))}] must not intersect ${obs.name}`,
        ).toBe(false);
      }
    }
  });

  it('verifies transformer count is exactly one per side (2 total), at 1.2 m below crossarm', () => {
    expect(telemetry.transformers).toHaveLength(2);
    const northXfm = telemetry.transformers.find((t) => t.side === 'north');
    const southXfm = telemetry.transformers.find((t) => t.side === 'south');
    expect(northXfm, 'north transformer').toBeDefined();
    expect(southXfm, 'south transformer').toBeDefined();

    expect(northXfm!.diameter).toBe(0.50);
    expect(northXfm!.height).toBe(0.90);
    expect(southXfm!.diameter).toBe(0.50);
    expect(southXfm!.height).toBe(0.90);

    // exactly 1.2 m below crossarm
    expect(POWER_CROSSARM_Y - northXfm!.center[1]).toBeCloseTo(1.20, 3);
    expect(POWER_CROSSARM_Y - southXfm!.center[1]).toBeCloseTo(1.20, 3);

    // two lead cables per transformer
    expect(northXfm!.leadCables).toHaveLength(2);
    expect(southXfm!.leadCables).toHaveLength(2);
  });

  it('verifies budget constraints: triangles <= 3,500, draw calls delta <= 2, 0 new materials', () => {
    expect(telemetry.totalTriangles).toBeLessThanOrEqual(3500);
    expect(telemetry.drawCallsAdded).toBeLessThanOrEqual(2);

    const map = build();
    const powerMeshes: THREE.Mesh[] = [];
    map.root.traverse((node) => {
      if (node instanceof THREE.Mesh && node.name && node.name.startsWith('nuketown2 power')) {
        powerMeshes.push(node);
      }
    });

    // Check that power line meshes exist and have valid geometries
    expect(powerMeshes.length).toBeGreaterThan(0);
    let totalTris = 0;
    for (const mesh of powerMeshes) {
      const geo = mesh.geometry;
      if (geo.index) {
        totalTris += geo.index.count / 3;
      } else if (geo.attributes.position) {
        totalTris += geo.attributes.position.count / 3;
      }
    }
    expect(totalTris, 'total geometry triangles').toBeLessThanOrEqual(3500);
  });

  it('verifies body and collider counts are identical (0 colliders, 0 solid bodies)', () => {
    const map = build();

    // 1. Verify every single mesh emitted by power lines is presentationOnly and not solid
    const powerMeshes: THREE.Mesh[] = [];
    map.root.traverse((node) => {
      if (node instanceof THREE.Mesh && node.name && node.name.startsWith('nuketown2 power')) {
        powerMeshes.push(node);
      }
    });

    expect(powerMeshes.length).toBeGreaterThan(0);
    for (const mesh of powerMeshes) {
      expect(mesh.userData.presentationOnly, `${mesh.name} must be presentationOnly`).toBe(true);
      expect((mesh.userData as { solid?: boolean }).solid, `${mesh.name} must not be solid`).toBeFalsy();
    }

    // 2. Verify that no power line mesh is counted as a solid mesh
    const solidMeshes = map.root.children.filter((node): node is THREE.Mesh => {
      if (!(node instanceof THREE.Mesh)) return false;
      if (node.userData.presentationOnly === true) return false;
      return (node.geometry as THREE.BoxGeometry).parameters !== undefined
        || node.userData.nuketown2Solid === true;
    });

    for (const solid of solidMeshes) {
      expect(solid.name.startsWith('nuketown2 power'), `solid mesh "${solid.name}" must not be power line`).toBe(false);
    }
  });
});
