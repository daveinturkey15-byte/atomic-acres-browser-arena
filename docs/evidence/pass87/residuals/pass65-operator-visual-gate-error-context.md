# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pass65-operator-visual-gate.spec.ts >> renders the canonical opaque PBR operator in Quality and authored Performance LODs
- Location: tests\e2e\pass65-operator-visual-gate.spec.ts:127:5

# Error details

```
TimeoutError: page.waitForFunction: Timeout 60000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic "Terminal multiplayer arena" [ref=e3]
  - text: balanced runner breacher marksman
  - generic [ref=e4]:
    - generic:
      - generic:
        - generic: "33"
        - generic: "N"
        - generic: "03"
      - generic:
        - generic:
          - generic: ALT
          - generic: 024 M
        - generic:
          - generic: HDG
          - generic: "049"
        - generic:
          - generic: ROTOR
          - generic: ARMED
    - generic [ref=e7]:
      - generic [ref=e8]: PASS 86 // DEPLOYMENT STREAM
      - strong [ref=e9]: TERMINAL
      - generic [ref=e10]: Preparing Terminal operators and viewmodel…
      - progressbar "Map loading progress" [ref=e11]: 98%
      - generic [ref=e12]:
        - status [ref=e13]: 98%
        - status [ref=e14]: ETA 2s
      - emphasis [ref=e15]: FINALIZING MATCH STATE · 100% = IN GAME
  - text: DEPLOYMENT SYNC
```

# Test source

```ts
  1   | import { mkdir } from 'node:fs/promises';
  2   | import { expect, test, type Page } from '@playwright/test';
  3   | 
  4   | type OperatorTelemetry = {
  5   |   source: string;
  6   |   assetUrl: string;
  7   |   lod: number;
  8   |   skinnedMeshes: number;
  9   |   visibleSkinnedMeshes: number;
  10  |   pbrMaterials: number;
  11  |   materialContract: string;
  12  |   clips: number;
  13  |   embeddedWeaponsSuppressed: number;
  14  |   visibleEmbeddedWeapons: number;
  15  |   activeClip: string;
  16  |   mergedVertexLod: boolean;
  17  | };
  18  | 
  19  | type OperatorDebug = {
  20  |   snapshot(): {
  21  |     player: { position: number[] };
  22  |     bots: Array<{ position: number[]; operatorModel: OperatorTelemetry | null }>;
  23  |     corpses: { models: Array<OperatorTelemetry | null> };
  24  |   };
  25  |   startSolo(): void;
  26  |   setBotsFrozen(frozen: boolean): void;
  27  |   placeBotAhead(distance?: number): void;
  28  |   aimAtBot(zone?: 'head' | 'body' | 'limb'): void;
  29  |   setBotPresentation(stance: 'stand' | 'crouch' | 'prone', speed?: number, weapon?: 'carbine'): void;
  30  |   setCaptureViewmodelHidden(hidden: boolean): void;
  31  |   setCaptureCameraPose(x: number, y: number, z: number, yaw: number, pitch: number): void;
  32  |   setRenderPaused(paused: boolean): void;
  33  |   damageBot(amount: number): void;
  34  | };
  35  | 
  36  | async function stageOperator(page: Page, profile: 'blender' | 'performance') {
  37  |   // PASS 87 Lane AR, item 8. `?renderer=webgl2` was removed, not replaced: the
  38  |   // owner retired the WebGL2 fallback on 2026-08-30 and
  39  |   // resolveRenderRuntimeRequest has voided its `search` argument ever since, so
  40  |   // the parameter did nothing here and reading this line suggested the gate
  41  |   // covered a route that no longer exists.
  42  |   await page.goto(`/?release=latest&render=${profile}&signal=on&grass=off&mist=off&clouds=off&rays=off&map=skyline-terminal&seed=650021`);
  43  |   await page.waitForFunction(() => {
  44  |     const debug = window.__ATOMIC_ACRES_DEBUG__;
  45  |     return debug?.snapshot().weaponReady === true;
  46  |   }, undefined, { timeout: 45_000 });
  47  |   await page.evaluate(() => {
  48  |     const debug = window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug;
  49  |     debug.startSolo();
  50  |     debug.setBotsFrozen(true);
  51  |   });
  52  |   /**
  53  |    * PASS 87 Lane AR, item 8. This gate has been red since 2026-07-27 and
  54  |    * unreachable from any runner, so nobody had seen WHERE it failed. Measured
  55  |    * headless on installed Chrome: it fails here, on `expect.poll`'s DEFAULT
  56  |    * 10 s, waiting for a bot operator that cannot exist yet - solo match
  57  |    * admission on skyline-terminal takes 14-20 s (the ledger's own figure, Lane
  58  |    * H2). So the gate reported "no operator model" when what it had actually
  59  |    * measured was "the match had not started".
  60  |    *
  61  |    * The wait is now explicit and named: admission first, at the same 60 s the
  62  |    * rest of this suite gives it (tests/e2e/pass64-hud-menu.spec.ts), then the
  63  |    * operator poll. NOTHING about the operator contract below is relaxed - the
  64  |    * material, LOD, clip and mesh assertions are byte-identical. A failure now
  65  |    * says which of the two things went wrong.
  66  |    */
> 67  |   await page.waitForFunction(
      |              ^ TimeoutError: page.waitForFunction: Timeout 60000ms exceeded.
  68  |     () => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active',
  69  |     undefined,
  70  |     { timeout: 60_000 },
  71  |   );
  72  |   await expect.poll(async () => page.evaluate(() => Boolean((
  73  |     window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  74  |   ).snapshot().bots[0]?.operatorModel))).toBe(true);
  75  |   await page.evaluate(() => {
  76  |     const debug = window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug;
  77  |     debug.placeBotAhead(4.5);
  78  |     debug.aimAtBot('body');
  79  |     debug.setBotPresentation('stand', 0, 'carbine');
  80  |     debug.setCaptureViewmodelHidden(true);
  81  |   });
  82  |   const stage = await page.evaluate(() => {
  83  |     const snapshot = (window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug).snapshot();
  84  |     return { bot: snapshot.bots[0].position, player: snapshot.player.position };
  85  |   });
  86  |   const [botX, , botZ] = stage.bot;
  87  |   const [playerX, , playerZ] = stage.player;
  88  |   const towardPlayerX = playerX - botX;
  89  |   const towardPlayerZ = playerZ - botZ;
  90  |   const towardPlayerLength = Math.hypot(towardPlayerX, towardPlayerZ) || 1;
  91  |   const forwardX = towardPlayerX / towardPlayerLength;
  92  |   const forwardZ = towardPlayerZ / towardPlayerLength;
  93  |   const diagonalX = forwardX + forwardZ * 0.72;
  94  |   const diagonalZ = forwardZ - forwardX * 0.72;
  95  |   const diagonalLength = Math.hypot(diagonalX, diagonalZ) || 1;
  96  |   const cameraX = botX + diagonalX / diagonalLength * 2.15;
  97  |   const cameraZ = botZ + diagonalZ / diagonalLength * 2.15;
  98  |   const cameraYaw = Math.atan2(-(botX - cameraX), -(botZ - cameraZ));
  99  |   await page.evaluate(({ x, z, yaw }) => (
  100 |     window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  101 |   ).setCaptureCameraPose(x, 0.92, z, yaw, -0.02), { x: cameraX, z: cameraZ, yaw: cameraYaw });
  102 |   await expect.poll(async () => page.evaluate(() => (
  103 |     window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  104 |   ).snapshot().bots[0]?.operatorModel)).toMatchObject({
  105 |     source: 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative',
  106 |     lod: 1,
  107 |     skinnedMeshes: 9,
  108 |     visibleSkinnedMeshes: 9,
  109 |     pbrMaterials: 4,
  110 |     materialContract: 'opaque-embedded-pbr-depth-writing',
  111 |     clips: 24,
  112 |     embeddedWeaponsSuppressed: 0,
  113 |     visibleEmbeddedWeapons: 0,
  114 |     mergedVertexLod: false,
  115 |   });
  116 |   const model = await page.evaluate(() => (
  117 |     window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  118 |   ).snapshot().bots[0].operatorModel);
  119 |   expect(model?.assetUrl).toBe('./assets/original/models/operators/pass65-third-person-operator-lod1.glb');
  120 |   expect(['Idle_Gun_Pointing', 'Idle_Gun']).toContain(model?.activeClip);
  121 |   await page.waitForTimeout(1_350);
  122 |   await page.evaluate(() => (
  123 |     window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  124 |   ).setRenderPaused(true));
  125 | }
  126 | 
  127 | test('renders the canonical opaque PBR operator in Quality and authored Performance LODs', async ({ page }) => {
  128 |   // Two full stagings, each of which now waits for a real match admission.
  129 |   test.setTimeout(300_000);
  130 |   const pageErrors: string[] = [];
  131 |   page.on('pageerror', (error) => pageErrors.push(error.message));
  132 |   await mkdir('artifacts/pass65/operator-visual-gate', { recursive: true });
  133 | 
  134 |   await stageOperator(page, 'blender');
  135 |   await page.screenshot({
  136 |     path: 'artifacts/pass65/operator-visual-gate/operator-quality-live-lod1.png',
  137 |     animations: 'disabled',
  138 |   });
  139 |   await page.evaluate(() => {
  140 |     const debug = window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug;
  141 |     debug.setRenderPaused(false);
  142 |     debug.damageBot(999);
  143 |   });
  144 |   await expect.poll(async () => page.evaluate(() => (
  145 |     window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  146 |   ).snapshot().corpses.models[0])).toMatchObject({
  147 |     source: 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative',
  148 |     assetUrl: './assets/original/models/operators/pass65-third-person-operator-lod0.glb',
  149 |     lod: 0,
  150 |     skinnedMeshes: 9,
  151 |     visibleSkinnedMeshes: 9,
  152 |     pbrMaterials: 4,
  153 |     materialContract: 'opaque-embedded-pbr-depth-writing',
  154 |     activeClip: 'Death',
  155 |   });
  156 |   await page.waitForTimeout(250);
  157 |   await page.evaluate(() => (
  158 |     window.__ATOMIC_ACRES_DEBUG__ as unknown as OperatorDebug
  159 |   ).setRenderPaused(true));
  160 |   await page.screenshot({
  161 |     path: 'artifacts/pass65/operator-visual-gate/operator-quality-corpse-lod0.png',
  162 |     animations: 'disabled',
  163 |   });
  164 | 
  165 |   await stageOperator(page, 'performance');
  166 |   await page.screenshot({
  167 |     path: 'artifacts/pass65/operator-visual-gate/operator-performance-lod1.png',
```