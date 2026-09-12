import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

/**
 * HF-411 BOOT SMOKE - the brief's step 2, done in the RUNNING GAME.
 *
 * Owner, Firing Range, 2026-09-02: "on firing range sometimes you go to run
 * onto a metal fence layed as a floor on the roof level of the map and you fall
 * through it, fix all that shit."
 *
 * src/test1-roof-traversal.test.ts already puts the shipped CharacterPhysics on
 * every roof surface of test1 with the shipped physicsColliders, which is the
 * same authority the game runs. What it cannot do is prove the APP boots with
 * the fix in it and that the arena the player actually loads is the arena the
 * module test built. AGENTS.md: "boot the app before claiming a candidate
 * works." This is that boot.
 *
 * It teleports the local player onto both camo-net panels through the shipped
 * debug API at eight points each - all four corners, all four edge midpoints -
 * standing and then crouched, holds two seconds, and reads the pose back. A
 * fall-through is a feet Y below the panel by more than the controller's own
 * step tolerance.
 *
 * HEADLESS ONLY (owner 12:40 BST, 2026-09-02). Run it as:
 *
 *   QA_EXTERNAL_PREVIEW=1 BASE_URL=http://localhost:<port> PASS73_NATIVE_WEBGPU=1  *     npx playwright test tests/e2e/hf411-firing-range-netting.spec.ts --project=chromium
 *
 * PASS73_NATIVE_WEBGPU=1 is REQUIRED, and it is still headless (the chromium
 * project only goes headed under QA_HEADED=1, which must never be set on this
 * machine). MEASURED 2026-09-02: Playwright's BUNDLED headless Chromium offers
 * no WebGPU adapter at all on this box - navigator.gpu is present and all three
 * requestAdapter() hints return null, WebGL falls back to SwiftShader - so the
 * game shows GAMEPLAY RENDERER BLOCKED and never reaches the debug API.
 * PASS73_NATIVE_WEBGPU=1 launches INSTALLED Chrome, which acquires a real
 * adapter headless.
 */

type Hf411Debug = {
  snapshot: () => {
    gameStarted: boolean;
    matchPhase: string;
    arenaSelection: { id: string };
    render: { profile: string };
  };
  samplePlayerPose: () => { alive: boolean; position: number[]; gameStarted: boolean; matchPhase: string };
  startSolo: () => void;
  setBotsFrozen: (frozen: boolean) => void;
  setCaptureViewmodelHidden: (hidden: boolean) => void;
  teleportPlayer: (x: number, y: number, z: number, yaw?: number, pitch?: number) => void;
  collisionProbeAt: (x: number, y: number, z: number) => boolean;
};

/**
 * NOTE: every use of this is INSIDE a page.evaluate body, which is serialised
 * and run in the browser - it cannot close over anything from this file, so the
 * accessor is written out at each site rather than shared.
 */

/**
 * The panels as src/test-maps-art.ts authors them: two boxes 9.0 x 0.06 x 6.4
 * at (21, 2.95, -8) and (21, 2.95, +8) with rotation.z = 0.035 rad. Repeated
 * here because a browser cannot import the builder; every value is checked
 * against the running world by `collisionProbeAt` before a single teleport, so
 * a drift in the art fails this spec rather than silently moving the target.
 */
const NET = { centreX: 21, centreY: 2.95, halfSpanX: 4.5, halfSpanZ: 3.2, tiltZ: 0.035, halfThickness: 0.03 };
const NET_CENTRES_Z = [-8, 8];
/** Inset so the standing capsule (radius 0.38) sits on the panel, not over the lip. */
const EDGE_INSET_M = 0.45;
/** STANCE_SHAPES in src/physics.ts: halfHeight + radius + eyeFromCenter. */
const EYE_HEIGHT = { stand: 0.53 + 0.38 + 0.79, crouch: 0.22 + 0.36 + 0.58 };
/**
 * autostepHeight is 0.42 and snapToGround is 0.24, so nothing legal moves the
 * feet down further than this; the fall this lane fixed was 3.0 m.
 */
const FALL_THROUGH_DROP_M = 0.5;

function netTopY(x: number): number {
  return NET.centreY + (x - NET.centreX) * Math.sin(NET.tiltZ) + NET.halfThickness * Math.cos(NET.tiltZ);
}

function probePoints(centreZ: number): Array<{ id: string; x: number; z: number }> {
  const x0 = NET.centreX - NET.halfSpanX + EDGE_INSET_M;
  const x1 = NET.centreX + NET.halfSpanX - EDGE_INSET_M;
  const z0 = centreZ - NET.halfSpanZ + EDGE_INSET_M;
  const z1 = centreZ + NET.halfSpanZ - EDGE_INSET_M;
  const xm = NET.centreX;
  const zm = centreZ;
  return [
    { id: 'corner-west-near', x: x0, z: z0 },
    { id: 'corner-west-far', x: x0, z: z1 },
    { id: 'corner-east-near', x: x1, z: z0 },
    { id: 'corner-east-far', x: x1, z: z1 },
    { id: 'edge-west', x: x0, z: zm },
    { id: 'edge-east', x: x1, z: zm },
    { id: 'edge-near', x: xm, z: z0 },
    { id: 'edge-far', x: xm, z: z1 },
  ];
}

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/leaderboard?*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [] }),
  }));
  await page.route('**/v1/streak', (route) => route.fulfill({
    status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true }),
  }));
});

test('HF-411: the booted game holds a player on the Firing Range camo netting, standing and crouched', async ({ page }) => {
  test.setTimeout(300_000);
  await mkdir('artifacts/qa/hf411-boot', { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // `?release=latest` skips the staged release CHOOSER the preview server
  // serves at `/`; without it the page under test is the build picker.
  await page.goto(
    '/?release=latest&render=performance&map=test1&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=hf411-netting',
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(() => {
    const status = document.querySelector<HTMLElement>('#network-status');
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: Hf411Debug }).__ATOMIC_ACRES_DEBUG__;
    const state = api?.snapshot();
    return status?.dataset.kind === 'ok' && !!state?.render.profile && state.arenaSelection.id === 'test1';
  }, undefined, { timeout: 120_000 });
  await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: Hf411Debug }).__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setCaptureViewmodelHidden(true);
    api.startSolo();
  });
  await page.waitForFunction(() => {
    const state = (window as unknown as { __ATOMIC_ACRES_DEBUG__: Hf411Debug }).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active' && state.arenaSelection.id === 'test1';
  }, undefined, { timeout: 60_000 });

  // 1. The AUTHORITY is where the art is, in the world that actually loaded.
  //    `collisionProbeAt` is an isBlocked() test with a 0.36 m radius, so it can
  //    only honestly answer "is there solid here" - the surrounding container
  //    stacks are inside that radius at most heights, which is why this asks
  //    the one question the fix owns: the panel itself is solid at every point
  //    a player can stand on. Where the collider ENDS is measured properly by
  //    src/test1-roof-traversal.test.ts, which matches its footprint to the
  //    mesh within 0.05 m.
  const panelSolid = await page.evaluate((points) => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: Hf411Debug }).__ATOMIC_ACRES_DEBUG__;
    return points.map((p) => ({ id: p.id, solid: api.collisionProbeAt(p.x, p.y, p.z) }));
  }, NET_CENTRES_Z.flatMap((centreZ) => probePoints(centreZ).map((point) => ({
    id: `z${centreZ} ${point.id}`, x: point.x, y: netTopY(point.x) - 0.02, z: point.z,
  }))));
  const hollow = panelSolid.filter((row) => !row.solid).map((row) => row.id);
  // ASSERTED AT THE END, with everything else: a run that fails here still has
  // to produce the traversal evidence, or the falsifier run tells you only that
  // something was wrong and not what the player would have felt.

  // 2. Stand on it, then crouch on it, at eight points on each panel.
  type Row = {
    panelZ: number; point: string; stance: 'stand' | 'crouch';
    startFeetY: number; endFeetY: number; dropM: number; fellThrough: boolean;
  };
  const rows: Row[] = [];
  /**
   * ONE stance change for all sixteen points of that stance, not one per point.
   * The stance must be set BEFORE the teleport: teleporting to the crouch eye
   * height while the player is still standing puts the standing capsule's feet
   * 0.49 m BELOW the panel, and what the controller then does to resolve that
   * is not what this test is asking about. (Measured: doing it the other way
   * round reported a uniform 0.503 m "fall" on every standing row - an
   * artefact of the harness, not of the arena.)
   */
  const sampleAt = async (x: number, z: number, top: number, stance: 'stand' | 'crouch') => {
    const eye = EYE_HEIGHT[stance];
    await page.evaluate(({ px, pz, py }) => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: Hf411Debug }).__ATOMIC_ACRES_DEBUG__;
      api.teleportPlayer(px, py, pz, 0, 0);
    }, { px: x, pz: z, py: top + eye + 0.05 });
    await page.waitForTimeout(2000);
    const pose = await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: Hf411Debug }
    ).__ATOMIC_ACRES_DEBUG__.samplePlayerPose());
    return pose.position[1];
  };

  for (const stance of ['stand', 'crouch'] as const) {
    if (stance === 'crouch') {
      // Toggle crouch on solid ground first, then verify it took by measuring
      // the eye drop; a silent no-op would otherwise make sixteen "crouch"
      // rows that are really standing rows.
      const groundTop = netTopY(NET.centreX);
      const standingEyeY = await sampleAt(NET.centreX, NET_CENTRES_Z[0], groundTop, 'stand');
      await page.keyboard.press('c');
      await page.waitForTimeout(600);
      const crouchedEyeY = await page.evaluate(() => (
        window as unknown as { __ATOMIC_ACRES_DEBUG__: Hf411Debug }
      ).__ATOMIC_ACRES_DEBUG__.samplePlayerPose().position[1]);
      expect(
        Number((standingEyeY - crouchedEyeY).toFixed(2)),
        'the crouch input must actually lower the eye by the stance difference',
      ).toBeCloseTo(EYE_HEIGHT.stand - EYE_HEIGHT.crouch, 1);
    }
    for (const centreZ of NET_CENTRES_Z) {
      for (const point of probePoints(centreZ)) {
        const top = netTopY(point.x);
        const eyeY = await sampleAt(point.x, point.z, top, stance);
        const endFeetY = eyeY - EYE_HEIGHT[stance];
        const dropM = Number((top - endFeetY).toFixed(3));
        rows.push({
          panelZ: centreZ,
          point: point.id,
          stance,
          startFeetY: Number((top + 0.05).toFixed(3)),
          endFeetY: Number(endFeetY.toFixed(3)),
          dropM,
          fellThrough: dropM > FALL_THROUGH_DROP_M,
        });
      }
    }
  }
  await page.keyboard.press('c');

  await writeFile(
    'artifacts/qa/hf411-boot/test1-netting-boot.json',
    `${JSON.stringify({ generatedAt: new Date().toISOString(), panelSolid, rows }, null, 2)}\n`,
  );

  expect(hollow, 'camo-net points with no movement authority in the booted world').toEqual([]);
  expect(panelSolid.length).toBe(16);
  const fell = rows.filter((row) => row.fellThrough)
    .map((row) => `panel z=${row.panelZ} ${row.point} ${row.stance} fell ${row.dropM} m`);
  expect(fell, `${fell.length}/${rows.length} booted probes fell through the camo netting`).toEqual([]);
  expect(rows.length).toBe(32);
  // Crouching really engaged: the eye drops by the difference between the two
  // stance heights, so a crouch row that silently stayed standing is caught.
  const standing = rows.filter((row) => row.stance === 'stand');
  const crouched = rows.filter((row) => row.stance === 'crouch');
  expect(standing.length).toBe(16);
  expect(crouched.length).toBe(16);
  expect(errors, 'page errors during the Firing Range netting boot').toEqual([]);
});
