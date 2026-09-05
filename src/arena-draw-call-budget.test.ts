/**
 * PASS 95 - per-arena draw-call budget gate.
 *
 * Builds every registry arena, applies the exact runtime static batch and the
 * arena matrix freeze, and holds the submitted draw count to the measured
 * budget in `arena-draw-call-budget.ts`.
 *
 * NEVER FIX A FAILURE HERE BY EDITING THE NUMBER. See the module header.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { batchStaticMeshes } from './art-kit';
import { freezeStaticArenaMatrices } from './static-matrix-freeze';
import {
  ARENA_DRAW_CALL_BUDGETS,
  DRAW_CALL_BUDGET_EXEMPT,
  arenaReviewStation,
  budgetedArenaIds,
  countSubmittedDraws,
  drawCallBudgetFor,
} from './arena-draw-call-budget';
import { buildArena } from './map';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import { buildFarcrysis } from './farcrysis';
import { buildHighSeas } from './high-seas';
import { buildTest1, buildTest2 } from './test-maps';
import { buildNuketown2 } from './nuketown2-arena';
import { buildRaid2 } from './raid2-arena';

const BUILDERS: Record<string, (scene: THREE.Scene) => { root: THREE.Object3D }> = {
  nuketown2: buildNuketown2,
  raid2: buildRaid2,
  'atomic-acres': buildArena,
  'skyline-terminal': buildSkylineTerminal,
  'rustworks-1v1': buildRustworks1v1,
  'gun-range': buildGunRange,
  farcrysis: buildFarcrysis,
  'high-seas': buildHighSeas,
  test1: buildTest1,
  test2: buildTest2,
};

function submittedDrawsFor(id: string): number {
  const scene = new THREE.Scene();
  const arena = BUILDERS[id](scene);
  // The owner's default profile is `blender` (Quality) -> 'preserve'.
  batchStaticMeshes(arena.root, arena.root, () => '', 'preserve');
  freezeStaticArenaMatrices(arena.root);
  return countSubmittedDraws(arena.root, arenaReviewStation(id));
}

describe('per-arena draw-call budget', () => {
  it('derives its roster from the arena registry, so a new arena cannot escape it', () => {
    const required = budgetedArenaIds();
    // A short roster is the failure mode this repository has actually shipped
    // three times; assert the floor as well as the membership.
    expect(required.length).toBeGreaterThanOrEqual(10);
    for (const id of required) {
      expect(
        ARENA_DRAW_CALL_BUDGETS[id],
        `arena '${id}' is in the registry with no measured draw-call budget. `
        + 'Measure it with `npx tsx scripts/qa/audit-arena-draw-calls.mts --arenas '
        + `${id}\` and add a row; do not delete it from the roster.`,
      ).toBeDefined();
      expect(BUILDERS[id], `arena '${id}' has no builder wired into this gate`).toBeDefined();
    }
    // Every exemption must name a live registry arena and carry a reason.
    for (const [id, reason] of Object.entries(DRAW_CALL_BUDGET_EXEMPT)) {
      expect(reason.length).toBeGreaterThan(20);
      expect(ARENA_DRAW_CALL_BUDGETS[id]).toBeUndefined();
    }
  });

  it('keeps every budget consistent with the published headroom rule', () => {
    for (const [id, row] of Object.entries(ARENA_DRAW_CALL_BUDGETS)) {
      expect(row.budget, `budget for '${id}' does not match the headroom rule`).toBe(
        drawCallBudgetFor(row.measured),
      );
    }
  });

  for (const id of Object.keys(ARENA_DRAW_CALL_BUDGETS)) {
    it(`${id} submits no more draws than its budget`, () => {
      const row = ARENA_DRAW_CALL_BUDGETS[id];
      const submitted = submittedDrawsFor(id);
      expect(
        submitted,
        `${id} submits ${submitted} draws, over its ${row.budget} budget `
        + `(measured ${row.measured}). Merge, instance, share a material or freeze - `
        + 'do not raise the budget to reach green.',
      ).toBeLessThanOrEqual(row.budget);
      // A large drop is good news, but it means the recorded measurement is
      // stale and the ratchet has gone slack. Re-measure and lower the row.
      expect(
        submitted,
        `${id} now submits only ${submitted} draws against a recorded ${row.measured}. `
        + 'Re-run the audit and lower this row so the ratchet keeps its grip.',
      ).toBeGreaterThan(Math.floor(row.measured * 0.6));
    });
  }
});
