import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAP3_LANES, MAP3_LANE_START } from './map3-arena';

/**
 * THE CAPTURE HARNESS MIRRORS THE LANE TABLE, SO SOMETHING HAS TO HOLD THE
 * MIRROR STILL.
 *
 * `scripts/qa/capture-map3-explore-evidence.mjs` derives each corridor still's
 * camera pose from a copy of `MAP3_LANES`. It is a `.mjs` QA script and cannot
 * import the TypeScript module, so the copy is real duplication - and a stale
 * copy is the exact failure the PASS 87 stills audit found: seven ad-hoc
 * screenshots, no producing script, and one corridor that had never been
 * photographed at all because nothing tied the evidence to the content.
 *
 * If a lane is added, removed, moved to another edge, or shifted laterally and
 * the harness is not updated, this fails - BEFORE a run can publish a still
 * that no longer frames its corridor.
 */
describe('Map 3 explore capture harness', () => {
  const harness = readFileSync('scripts/qa/capture-map3-explore-evidence.mjs', 'utf8');

  const parsedLanes = [...harness.matchAll(
    /\{\s*id:\s*'([a-z]+)',\s*label:\s*'([^']+)',\s*edge:\s*(\d),\s*lateral:\s*(-?\d+),/gu,
  )].map((match) => ({
    id: match[1], label: match[2], edge: Number(match[3]), lateral: Number(match[4]),
  }));

  it('mirrors every lane of MAP3_LANES, in order, with the same edge and lateral offset', () => {
    expect(parsedLanes).toEqual(MAP3_LANES.map((lane) => ({
      id: lane.id, label: lane.label, edge: lane.edge, lateral: lane.lateral,
    })));
  });

  it('captures all EIGHT corridors, the Rapier playground included', () => {
    expect(parsedLanes).toHaveLength(8);
    expect(MAP3_LANES).toHaveLength(8);
    // The eighth is the one that had no still before PASS 87; name it, so
    // dropping it from the harness cannot pass as a lane-count coincidence.
    expect(parsedLanes.map((lane) => lane.id)).toContain('physics');
  });

  it('uses the same lane origin as the arena, or every pose is offset', () => {
    expect(harness).toContain(`const MAP3_LANE_START = ${MAP3_LANE_START};`);
  });

  it('derives the look direction rather than tabulating a yaw per edge', () => {
    // A hand-written yaw per edge is the thing that silently rots. The harness
    // must compute it from two points along the lane.
    expect(harness).toContain('Math.atan2(-(b.x - a.x), -(b.z - a.z))');
    expect(harness).not.toMatch(/yaw:\s*Math\.PI\s*\/\s*2/u);
  });

  it('keeps the shared-machine guard, which is why QA may run here at all', () => {
    // The guard itself lives in one shared module - three drifting copies is
    // how one of them quietly stops waiting - so the harness is checked for
    // USING it, and the module is checked for still being a real guard.
    expect(harness).toContain("from './lib/shared-machine-guard.mjs'");
    expect(harness).toContain('await waitForSharedMachine(');
    expect(harness).toContain('headless: true');
    expect(harness).not.toContain('headless: false');

    const guard = readFileSync('scripts/qa/lib/shared-machine-guard.mjs', 'utf8');
    expect(guard).toContain('nvidia-smi');
    expect(guard).toContain('127.0.0.1:8188/queue');
    // BOTH conditions. Free VRAM alone passes while ComfyUI is between two
    // nodes of one workflow and about to allocate everything again.
    expect(guard).toContain('free >= minFreeVramMib && queued === 0');
    expect(guard).toContain('minFreeVramMib = 3000');
    // Bounded, not infinite: a harness that waits forever is a hung run nobody
    // can tell from a crashed one.
    expect(guard).toContain('not launching Chrome on a shared machine');
  });

  it('is used by every browser harness in this pass, not just one of them', () => {
    for (const file of [
      'scripts/qa/capture-map3-explore-evidence.mjs',
      'scripts/qa/verify-map3-channel-page.mjs',
    ]) {
      expect(readFileSync(file, 'utf8'), file).toContain('waitForSharedMachine');
    }
  });

  it('asserts the explore HUD claims instead of only screenshotting them', () => {
    // A capture script that only writes PNGs proves nothing on its own.
    expect(harness).toContain("receipt.hud.modeLabel.text !== 'EXPLORE · MAP 3'");
    expect(harness).toContain('receipt.hud.timer.shown');
    expect(harness).toContain('receipt.hud.scoreline.shown');
    expect(harness).toContain('process.exitCode = 1');
  });
});
