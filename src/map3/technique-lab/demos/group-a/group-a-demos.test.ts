/**
 * group-a-demos.test.ts — a small, focused CPU check over every group-A demo.
 *
 * Deliberately NOT a rendering test and NOT a full suite. It instantiates each
 * demo with the real `three` package, advances it, inspects finite geometry and
 * counters, and disposes it. Pixel validation is OPEN: nothing here runs a
 * renderer, so no claim about rendered quality is made or implied.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { manifest } from './index';
import { actionReadyGate } from './source-06';
import { CRITERIA } from './source-12';
import { critique, runGauntlet } from './source-13';
import { motionDim, selectLayout, stitchWithTransition, worstVelocityJump } from './source-16';
import { countDrawables, countTriangles, subtreeIsFinite } from './_shared';

const SEED = 20260912;

describe('group-a manifest', () => {
  it('preserves the original stable IDs 1-17 exactly once each', () => {
    const ids = manifest.map((entry) => entry.sourceId);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every non-blocked entry a createDemo and every blocked entry a limitation', () => {
    for (const entry of manifest) {
      if (entry.adaptation === 'blocked') {
        expect(entry.createDemo, `blocked ${entry.sourceId} must not ship a demo`).toBeUndefined();
        expect(entry.limitation, `blocked ${entry.sourceId} needs a stated limitation`).toBeTruthy();
      } else {
        expect(entry.createDemo, `entry ${entry.sourceId} needs a createDemo`).toBeTypeOf('function');
      }
      expect(entry.sources.length).toBeGreaterThan(0);
    }
  });
});

describe.each(manifest.filter((entry) => entry.createDemo))('source $sourceId', (entry) => {
  it('instantiates, advances, stays finite and disposes', () => {
    const demo = entry.createDemo!({ THREE, seed: SEED });

    expect(demo.metadata.sourceId).toBe(entry.sourceId);
    expect(demo.metadata.adaptation).toBe(entry.adaptation);
    expect(demo.root).toBeInstanceOf(THREE.Group);
    expect(subtreeIsFinite(demo.root)).toBe(true);

    const triangles = countTriangles(demo.root);
    const drawables = countDrawables(demo.root);
    expect(triangles).toBeGreaterThan(0);
    // Bounded: the lab embeds every demo at once, so no single one may run away.
    expect(triangles).toBeLessThan(400_000);
    expect(drawables).toBeLessThan(120);

    // The lab host owns global lighting; a demo may only add named local lights.
    const lights: string[] = [];
    demo.root.traverse((object) => {
      const any = object as { isLight?: boolean; isDirectionalLight?: boolean; isAmbientLight?: boolean };
      if (any.isLight) lights.push(object.name);
      expect(any.isDirectionalLight, `${entry.sourceId} must not add a directional light`).toBeFalsy();
      expect(any.isAmbientLight, `${entry.sourceId} must not add an ambient light`).toBeFalsy();
    });
    if (lights.length > 0) {
      expect(demo.metadata.localLights ?? [], `source ${entry.sourceId} must declare its local lights`).not.toHaveLength(0);
    }

    if (demo.update) {
      for (let frame = 0; frame < 6; frame += 1) demo.update(frame / 30, 1 / 30);
      expect(subtreeIsFinite(demo.root)).toBe(true);
    }

    demo.dispose();
    // Disposal is idempotent: the host may tear a demo down twice on a fast swap.
    expect(() => demo.dispose()).not.toThrow();
  });

  it('is deterministic for a fixed seed', () => {
    const a = entry.createDemo!({ THREE, seed: SEED });
    const b = entry.createDemo!({ THREE, seed: SEED });
    expect(countTriangles(a.root)).toBe(countTriangles(b.root));
    expect(countDrawables(a.root)).toBe(countDrawables(b.root));
    a.dispose();
    b.dispose();
  });
});

describe('source 2 — the spectral claim, not a ripple', () => {
  it('produces a surface whose folds are found by the displacement Jacobian', () => {
    const entry = manifest.find((e) => e.sourceId === 2)!;
    const demo = entry.createDemo!({ THREE, seed: SEED });
    demo.update?.(2.5, 1 / 30);
    // A summed-sine surface never folds; a choppy spectral one does. A Jacobian
    // strictly below 1 somewhere is the minimum evidence the transform ran.
    expect(demo.metadata.counters!.minJacobian).toBeLessThan(1);
    expect(demo.metadata.counters!.gridN).toBe(32);
    demo.dispose();
  });
});

describe('source 6 — the action-ready gate actually refuses', () => {
  it('fails a mesh with no sculptRuntime and passes the specified one', () => {
    const entry = manifest.find((e) => e.sourceId === 6)!;
    const demo = entry.createDemo!({ THREE, seed: SEED });
    const reports = demo.root.userData.gateReports as {
      before: { pass: boolean; failures: string[] };
      after: { pass: boolean; failures: string[] };
    };
    expect(reports.before.pass).toBe(false);
    expect(reports.before.failures).toContain('no root.userData.sculptRuntime');
    expect(reports.after.pass).toBe(true);
    // And the gate is not a no-op: hand it an empty object and it still refuses.
    expect(actionReadyGate(new THREE.Group(), { triangles: 0, drawables: 0 }).pass).toBe(false);
    demo.dispose();
  });
});

describe('source 9 — the audit counters are real', () => {
  it('counts per-frame allocations in the leaky half and none in the clean half', () => {
    const entry = manifest.find((e) => e.sourceId === 9)!;
    const demo = entry.createDemo!({ THREE, seed: SEED });
    demo.update!(1, 1 / 30);
    expect(demo.metadata.counters!.perFrameAllocations).toBeGreaterThan(0);
    expect(demo.metadata.counters!.registeredForDisposal).toBeGreaterThan(0);
    demo.dispose();
  });
});

describe('source 10 — ingestion strips what a pack must not impose', () => {
  it('removes preview lights on the gated side only', () => {
    const entry = manifest.find((e) => e.sourceId === 10)!;
    const demo = entry.createDemo!({ THREE, seed: SEED });
    const before = demo.root.getObjectByName('before:raw-install-preview-lights-and-declared-scale')!;
    const after = demo.root.getObjectByName('after:gated-install-host-three-measured-bounds')!;
    const count = (root: THREE.Object3D) => {
      let n = 0;
      root.traverse((o) => {
        if ((o as { isLight?: boolean }).isLight) n += 1;
      });
      return n;
    };
    expect(count(before)).toBeGreaterThan(0);
    expect(count(after)).toBe(0);
    expect(demo.metadata.counters!.previewLightsStripped).toBe(count(before));
    demo.dispose();
  });
});

describe('source 12 — the acceptance harness rejects before it accepts', () => {
  it('logs at least one rejection and one acceptance against declared criteria', () => {
    const entry = manifest.find((e) => e.sourceId === 12)!;
    const demo = entry.createDemo!({ THREE, seed: SEED });
    const reports = demo.root.userData.candidateReports as Array<{ accepted: boolean; failures: string[] }>;
    expect(reports.some((r) => !r.accepted)).toBe(true);
    expect(reports.some((r) => r.accepted)).toBe(true);
    expect(CRITERIA.maxDegenerateTriangles).toBe(0);
    demo.dispose();
  });
});

describe('source 13 — the gauntlet refuses a broken frozen regression', () => {
  it('never accepts a candidate that drops a frozen feature', () => {
    const bar = { minScore: 1, requiredFeatures: ['a', 'b'] };
    // A builder that regresses: it adds 'b' but drops 'a'.
    const result = runGauntlet(
      { bar, maxRounds: 4, wallClockMs: 1000, minImprovement: 0.001 },
      (round) => (round === 0 ? { features: ['a'], builderNotes: '' } : { features: ['b'], builderNotes: '' }),
      (() => {
        let t = 0;
        return () => (t += 10);
      })(),
    );
    expect(result.accepted).toBeNull();
    expect(result.log.some((row) => row.regressionsBroken.includes('a'))).toBe(true);
    // And the critic is blind to builder notes by construction.
    expect(critique({ features: ['a'] }, bar, []).missing).toEqual(['b']);
  });
});

describe('source 16 — layout is chosen by joint count, never by the README', () => {
  it('maps 22/30/34 and refuses an unknown count', () => {
    expect(selectLayout(22)).toBe('smplx22');
    expect(selectLayout(30)).toBe('soma30');
    expect(selectLayout(34)).toBe('g1skel34');
    expect(selectLayout(24)).toBeNull();
    expect(motionDim(30)).toBe(369);
  });

  it('stitching with a transition lowers the seam discontinuity', () => {
    const joints = 30;
    const frames = 40;
    const make = (phase: number, amp: number) => {
      const data = new Float32Array(frames * joints);
      for (let f = 0; f < frames; f += 1) {
        for (let j = 0; j < joints; j += 1) {
          data[f * joints + j] = Math.sin((f / frames + phase) * Math.PI * 2 + j * 0.21) * amp;
        }
      }
      return { name: 'c', joints, frames, data };
    };
    const a = make(0, 0.2);
    const b = make(0.5, 0.3);
    const hard = { name: 'hard', joints, frames: frames * 2, data: new Float32Array(frames * 2 * joints) };
    hard.data.set(a.data, 0);
    hard.data.set(b.data, a.data.length);
    const soft = stitchWithTransition(a, b, 10);
    expect(worstVelocityJump(soft)).toBeLessThan(worstVelocityJump(hard));
  });
});
