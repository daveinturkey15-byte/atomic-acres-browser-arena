// HF-413 (Lane Z, PASS 85). Falsifiers for the first-person arms and animation
// defects the owner reported as "inverted or strange", each pinned against the
// value that was MEASURED on the running build at base 75a4e508 rather than
// against a guess.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC,
  FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC,
  VIEWMODEL_MELEE_ENTRY_REFERENCE_DEPTH_METERS,
  firstPersonArmShoulderEntryNdc,
  viewmodelMeleeEntryMeters,
  viewmodelMeleeLateralOffset,
} from './weapon-presentation';
import type { ViewmodelGripFamily } from './weapon-presentation-pose-profiles';

/**
 * The floor `scripts/qa/verify-pass65-first-person-arms-visual.mjs` enforces on
 * every solved chain: an arm whose shoulder joint projects above this is an arm
 * that visibly ends in mid-air instead of continuing off the bottom edge.
 */
const BELOW_FRAME_CONTINUATION_NDC = -0.98;
const GRIP_FAMILIES: readonly ViewmodelGripFamily[] = ['long-gun', 'compact', 'handgun', 'heavy', 'crossbow'];

describe('HF-413 first-person arm shoulder entry stays below the frame', () => {
  it('keeps every authored lane past the below-frame continuation floor', () => {
    expect(FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.left).toBeLessThan(BELOW_FRAME_CONTINUATION_NDC);
    expect(FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.right).toBeLessThan(BELOW_FRAME_CONTINUATION_NDC);
    expect(FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC).toBeLessThan(BELOW_FRAME_CONTINUATION_NDC);
  });

  it('keeps every reachable side/family/aim/high-ready combination past that floor', () => {
    // The measured regression: heavy hip, ADS and high-ready poses all resolved
    // to -0.83 at base 75a4e508 and the gate rejected each of them.
    for (const side of ['left', 'right'] as const) {
      for (const family of GRIP_FAMILIES) {
        for (const adsBlend of [0, 0.25, 0.5, 0.75, 1]) {
          for (const highReadyBlend of [0, 0.5, 1]) {
            const ndc = firstPersonArmShoulderEntryNdc(side, family, adsBlend, highReadyBlend);
            expect(
              ndc,
              `${side}/${family}/ads=${adsBlend}/highReady=${highReadyBlend}`,
            ).toBeLessThan(BELOW_FRAME_CONTINUATION_NDC);
          }
        }
      }
    }
  });

  it('keeps HF-388\'s raised lane a real pose difference, not a nominal one', () => {
    // Review finding (2026-09-02): a first attempt at the fix left the two
    // lanes 0.02 NDC apart, where HF-388 authored them 0.15 apart, and guarded
    // that only with `raised > right` - which 0.02 satisfies while encoding
    // nothing. `placeRiggedShoulderEntryBelowFrame` pins the shoulder to
    // exactly `lane - 0.01` NDC, so this gap IS the on-screen pose difference
    // (0.05 NDC is ~23 px of shoulder height at 900p; 0.02 is ~9 px).
    //
    // 0.05 is the widest band the two hard constraints leave: the raised lane
    // must itself clear the -0.98 continuation floor, and the ordinary lane
    // must never go deeper than the support lane HF-365 reviewed, because
    // deeper than that is what produced the vertical "pale post" arm.
    const separation = FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC
      - FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.right;
    expect(separation).toBeGreaterThanOrEqual(0.05 - 1e-9);
    // The HF-365 pale-post guard, expressed mechanically instead of as prose:
    // the firing lane may not be pushed deeper than the reviewed support lane.
    expect(FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.right)
      .toBeGreaterThanOrEqual(FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.left);
    // ... and the same separation must survive the blend that actually runs.
    expect(firstPersonArmShoulderEntryNdc('right', 'heavy', 0, 0)
      - firstPersonArmShoulderEntryNdc('right', 'long-gun', 0, 0))
      .toBeGreaterThanOrEqual(0.05 - 1e-9);
    expect(firstPersonArmShoulderEntryNdc('right', 'long-gun', 1, 0)
      - firstPersonArmShoulderEntryNdc('right', 'long-gun', 0, 0))
      .toBeGreaterThanOrEqual(0.05 - 1e-9);
  });
});

describe('HF-413 melee entry is a screen-space lane, not a fixed metre offset', () => {
  const halfWidth = (depth: number, fov: number, aspect: number) =>
    Math.abs(depth) * Math.tan(THREE.MathUtils.degToRad(fov) / 2) * aspect;

  it('reproduces the authored metres exactly at the calibration depth and fov', () => {
    for (const aspect of [16 / 9, 2560 / 1440, 3440 / 1440, 21 / 9]) {
      expect(viewmodelMeleeEntryMeters(aspect, 75, VIEWMODEL_MELEE_ENTRY_REFERENCE_DEPTH_METERS))
        .toBeCloseTo(viewmodelMeleeLateralOffset(aspect), 8);
    }
  });

  it('holds one screen displacement across every depth and field of view', () => {
    const aspect = 16 / 9;
    const authoredNdc = viewmodelMeleeLateralOffset(aspect)
      / halfWidth(VIEWMODEL_MELEE_ENTRY_REFERENCE_DEPTH_METERS, 75, aspect);
    for (const depth of [-0.3, -0.407, -0.6, -1.08, -1.4]) {
      for (const fov of [60, 75, 82, 100]) {
        const meters = viewmodelMeleeEntryMeters(aspect, fov, depth);
        expect(meters / halfWidth(depth, fov, aspect), `depth=${depth} fov=${fov}`)
          .toBeCloseTo(authoredNdc, 8);
      }
    }
  });

  it('collapses the measured off-screen peak at the live viewmodel depth', () => {
    // Measured live state at base 75a4e508: root z -0.407 m, fov 82, aspect
    // 1.7778, half frustum width 0.629 m. The old fixed 1.37 m offset displaced
    // the rig 2.18 NDC; the authored lane is 0.93 NDC.
    const aspect = 16 / 9;
    const live = halfWidth(-0.407, 82, aspect);
    expect(live).toBeCloseTo(0.6292, 3);
    expect(viewmodelMeleeLateralOffset(aspect) / live).toBeGreaterThan(2.1);
    const fixed = viewmodelMeleeEntryMeters(aspect, 82, -0.407);
    expect(fixed / live).toBeCloseTo(0.9298, 3);
    expect(fixed).toBeLessThan(viewmodelMeleeLateralOffset(aspect));
  });

  it('falls back to the authored metres for a degenerate depth, fov or aspect', () => {
    const authored = viewmodelMeleeLateralOffset(16 / 9);
    expect(viewmodelMeleeEntryMeters(Number.NaN, Number.NaN, Number.NaN)).toBeCloseTo(authored, 8);
    expect(viewmodelMeleeEntryMeters(16 / 9, 75, 0)).toBeCloseTo(authored, 8);
    expect(Number.isFinite(viewmodelMeleeEntryMeters(16 / 9, 500, -0.4))).toBe(true);
  });
});

describe('HF-413 shipped arms and weapon assets carry no mirror and no wrong-side socket', () => {
  it('runs the standing corpus gate over the shipped GLBs', async () => {
    // The gate itself is scripts/qa/verify-pass85-arms-handedness.mjs
    // (npm run qa:pass85:arms-handedness). It is executed rather than imported
    // so there is exactly one implementation of the audit and no TS/JS copy of
    // it that could drift away from the shipped gate.
    const { execFileSync } = await import('node:child_process');
    const stdout = execFileSync(
      process.execPath,
      ['scripts/qa/verify-pass85-arms-handedness.mjs'],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    const receipt = JSON.parse(stdout) as {
      verdict: string; files: number; nodes: number; sockets: number; violations: string[];
    };
    // Guards the guard: a corpus that silently shrank would pass vacuously.
    expect(receipt.files).toBeGreaterThanOrEqual(130);
    expect(receipt.nodes).toBeGreaterThanOrEqual(4000);
    expect(receipt.sockets).toBeGreaterThanOrEqual(400);
    expect(receipt.violations).toEqual([]);
    expect(receipt.verdict).toBe('pass');
  }, 60_000);

  it('rejects each handedness defect when it is injected into a real shipped graph', async () => {
    // A gate that has never failed is not evidence. These mutations are applied
    // to the ACTUAL shipped node graphs, so the audit is exercised against real
    // data rather than a fixture that could drift away from the corpus.
    const gate = await import('../scripts/qa/verify-pass85-arms-handedness.mjs');
    const clone = (json: unknown) => JSON.parse(JSON.stringify(json)) as {
      nodes: Array<{ name?: string; translation?: number[]; scale?: number[] }>;
    };
    const load = (weapon: string) => clone(gate.readCorpusGlbJson(
      `public/assets/original/models/weapons/pass65-firearms/${weapon}/${weapon}-fp-lod0.glb`,
    ));
    const nodeNamed = (graph: ReturnType<typeof clone>, name: string) => {
      const node = graph.nodes.find((candidate) => candidate.name === name);
      expect(node, name).toBeDefined();
      return node!;
    };

    // Baseline: the unmutated shipped graphs are clean, for both the ordinary
    // centreline-magazine case and the M134's side-mounted drum.
    for (const weapon of ['m4a1', 'minigun']) {
      expect(gate.auditGlbNodeGraph(weapon, load(weapon)).violations, weapon).toEqual([]);
    }

    // 1. A mirrored node anywhere in the graph.
    const mirrored = load('m4a1');
    mirrored.nodes[0].scale = [-1, 1, 1];
    expect(gate.auditGlbNodeGraph('m4a1', mirrored).violations.join('\n')).toMatch(/mirrored node/);

    // 2. An ordinary weapon's reload contact mirrored to the firing side. The
    //    magazine-adjacency clause alone would NOT catch this (a centreline
    //    magwell is only ~0.1 m off either way), which is why the centreline
    //    clause exists.
    const flippedCentreline = load('m4a1');
    const m4Reload = nodeNamed(flippedCentreline, 'reload-socket-l');
    m4Reload.translation = [Math.abs(m4Reload.translation![0]), m4Reload.translation![1], m4Reload.translation![2]];
    expect(gate.auditGlbNodeGraph('m4a1', flippedCentreline).violations.join('\n'))
      .toMatch(/centreline magazine.*firing side/s);

    // 3. The M134's reload contact mirrored away from its side-mounted drum -
    //    the regression this gate's first version actually caused.
    const flippedDrum = load('minigun');
    const drumReload = nodeNamed(flippedDrum, 'reload-socket-l');
    drumReload.translation = [-Math.abs(drumReload.translation![0]), drumReload.translation![1], drumReload.translation![2]];
    expect(gate.auditGlbNodeGraph('minigun', flippedDrum).violations.join('\n'))
      .toMatch(/from this weapon's own magazine/);

    // 4. A firing-side grip socket moved onto the support side.
    const flippedGrip = load('m4a1');
    nodeNamed(flippedGrip, 'grip-socket-r').translation = [-0.2, 0, 0];
    expect(gate.auditGlbNodeGraph('m4a1', flippedGrip).violations.join('\n'))
      .toMatch(/firing-side socket "grip-socket-r"/);

    // 5. A reload contact with no magazine to reach.
    const orphanReload = load('m4a1');
    nodeNamed(orphanReload, 'magazine-socket').name = 'magazine-socket-renamed';
    expect(gate.auditGlbNodeGraph('m4a1', orphanReload).violations.join('\n'))
      .toMatch(/no "magazine-socket" to reach/);
  }, 30_000);

  it('states the M134 relationship the corpus actually holds', () => {
    // The measurement that overturned the first version of this lane's fix.
    // The M134 is the one weapon whose magazine is NOT on the centreline: its
    // magazine socket and its modelled ammo drum are both at x = +0.28, so its
    // reload contact belongs on the firing side, beside the drum.
    const graph = readWeaponGraph('minigun');
    const magazine = socketTranslation(graph, 'magazine-socket');
    const reload = socketTranslation(graph, 'reload-socket-l');
    expect(magazine[0]).toBeCloseTo(0.28, 6);
    expect(reload[0]).toBeCloseTo(0.25, 6);
    expect(separationMeters(reload, magazine)).toBeLessThan(0.1);
    // Every other weapon feeds from the centreline and reloads on the support
    // side; both properties hold together across the shipped corpus.
    for (const weapon of ['m4a1', 'mp5', 'pistol', 'railgun', 'sniper', 'lmg']) {
      const other = readWeaponGraph(weapon);
      expect(socketTranslation(other, 'magazine-socket')[0], weapon).toBeCloseTo(0, 6);
      expect(socketTranslation(other, 'reload-socket-l')[0], weapon).toBeLessThan(0);
      expect(
        separationMeters(socketTranslation(other, 'reload-socket-l'), socketTranslation(other, 'magazine-socket')),
        weapon,
      ).toBeLessThan(0.4);
    }
  });
});

function readWeaponGraph(weapon: string): { nodes: Array<{ name?: string; translation?: number[] }> } {
  const buffer = readFileSync(
    `public/assets/original/models/weapons/pass65-firearms/${weapon}/${weapon}-fp-lod0.glb`,
  );
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8')) as {
    nodes: Array<{ name?: string; translation?: number[] }>;
  };
}

function socketTranslation(
  graph: { nodes: Array<{ name?: string; translation?: number[] }> },
  name: string,
): number[] {
  const node = graph.nodes.find((candidate) => candidate.name === name);
  expect(node, name).toBeDefined();
  return node!.translation ?? [0, 0, 0];
}

function separationMeters(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
