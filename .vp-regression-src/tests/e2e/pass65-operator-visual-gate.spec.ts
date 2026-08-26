import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

type OperatorTelemetry = {
  source: string;
  assetUrl: string;
  lod: number;
  skinnedMeshes: number;
  visibleSkinnedMeshes: number;
  pbrMaterials: number;
  materialContract: string;
  clips: number;
  embeddedWeaponsSuppressed: number;
  visibleEmbeddedWeapons: number;
  activeClip: string;
  mergedVertexLod: boolean;
};

type OperatorDebug = {
  snapshot(): {
    player: { position: number[] };
    bots: Array<{ position: number[]; operatorModel: OperatorTelemetry | null }>;
    corpses: { models: Array<OperatorTelemetry | null> };
  };
  startSolo(): void;
  setBotsFrozen(frozen: boolean): void;
  placeBotAhead(distance?: number): void;
  aimAtBot(zone?: 'head' | 'body' | 'limb'): void;
  setBotPresentation(stance: 'stand' | 'crouch' | 'prone', speed?: number, weapon?: 'carbine'): void;
  setCaptureViewmodelHidden(hidden: boolean): void;
  setCaptureCameraPose(x: number, y: number, z: number, yaw: number, pitch: number): void;
  setRenderPaused(paused: boolean): void;
  damageBot(amount: number): void;
};

async function stageOperator(page: Page, profile: 'blender' | 'performance') {
  await page.goto(`/?release=latest&renderer=webgl2&render=${profile}&signal=on&grass=off&mist=off&clouds=off&rays=off&map=skyline-terminal&seed=650021`);
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return debug?.snapshot().weaponReady === true;
  }, undefined, { timeout: 45_000 });
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug;
    debug.startSolo();
    debug.setBotsFrozen(true);
  });
  await expect.poll(async () => page.evaluate(() => Boolean((
    window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  ).snapshot().bots[0]?.operatorModel))).toBe(true);
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug;
    debug.placeBotAhead(4.5);
    debug.aimAtBot('body');
    debug.setBotPresentation('stand', 0, 'carbine');
    debug.setCaptureViewmodelHidden(true);
  });
  const stage = await page.evaluate(() => {
    const snapshot = (window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug).snapshot();
    return { bot: snapshot.bots[0].position, player: snapshot.player.position };
  });
  const [botX, , botZ] = stage.bot;
  const [playerX, , playerZ] = stage.player;
  const towardPlayerX = playerX - botX;
  const towardPlayerZ = playerZ - botZ;
  const towardPlayerLength = Math.hypot(towardPlayerX, towardPlayerZ) || 1;
  const forwardX = towardPlayerX / towardPlayerLength;
  const forwardZ = towardPlayerZ / towardPlayerLength;
  const diagonalX = forwardX + forwardZ * 0.72;
  const diagonalZ = forwardZ - forwardX * 0.72;
  const diagonalLength = Math.hypot(diagonalX, diagonalZ) || 1;
  const cameraX = botX + diagonalX / diagonalLength * 2.15;
  const cameraZ = botZ + diagonalZ / diagonalLength * 2.15;
  const cameraYaw = Math.atan2(-(botX - cameraX), -(botZ - cameraZ));
  await page.evaluate(({ x, z, yaw }) => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  ).setCaptureCameraPose(x, 0.92, z, yaw, -0.02), { x: cameraX, z: cameraZ, yaw: cameraYaw });
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  ).snapshot().bots[0]?.operatorModel)).toMatchObject({
    source: 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative',
    lod: 1,
    skinnedMeshes: 9,
    visibleSkinnedMeshes: 9,
    pbrMaterials: 4,
    materialContract: 'opaque-embedded-pbr-depth-writing',
    clips: 24,
    embeddedWeaponsSuppressed: 0,
    visibleEmbeddedWeapons: 0,
    mergedVertexLod: false,
  });
  const model = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  ).snapshot().bots[0].operatorModel);
  expect(model?.assetUrl).toBe('./assets/original/models/operators/pass65-third-person-operator-lod1.glb');
  expect(['Idle_Gun_Pointing', 'Idle_Gun']).toContain(model?.activeClip);
  await page.waitForTimeout(1_350);
  await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  ).setRenderPaused(true));
}

test('renders the canonical opaque PBR operator in Quality and authored Performance LODs', async ({ page }) => {
  test.setTimeout(150_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await mkdir('artifacts/pass65/operator-visual-gate', { recursive: true });

  await stageOperator(page, 'blender');
  await page.screenshot({
    path: 'artifacts/pass65/operator-visual-gate/operator-quality-live-lod1.png',
    animations: 'disabled',
  });
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug;
    debug.setRenderPaused(false);
    debug.damageBot(999);
  });
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  ).snapshot().corpses.models[0])).toMatchObject({
    source: 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative',
    assetUrl: './assets/original/models/operators/pass65-third-person-operator-lod0.glb',
    lod: 0,
    skinnedMeshes: 9,
    visibleSkinnedMeshes: 9,
    pbrMaterials: 4,
    materialContract: 'opaque-embedded-pbr-depth-writing',
    activeClip: 'Death',
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  ).setRenderPaused(true));
  await page.screenshot({
    path: 'artifacts/pass65/operator-visual-gate/operator-quality-corpse-lod0.png',
    animations: 'disabled',
  });

  await stageOperator(page, 'performance');
  await page.screenshot({
    path: 'artifacts/pass65/operator-visual-gate/operator-performance-lod1.png',
    animations: 'disabled',
  });
  expect(pageErrors).toEqual([]);
});
