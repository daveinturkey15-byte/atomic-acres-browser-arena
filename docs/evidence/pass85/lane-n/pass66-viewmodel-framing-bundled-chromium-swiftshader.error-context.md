# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pass66-viewmodel-framing.spec.ts >> keeps authored arms and knife readable at 1440p, 4K and ultrawide
- Location: tests\e2e\pass66-viewmodel-framing.spec.ts:70:5

# Error details

```
TimeoutError: page.waitForFunction: Timeout 45000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e4]: PASS 84 · PASS 84 · WEBGPU / TSL
    - heading "GAMEPLAY RENDERER BLOCKED" [level=1] [ref=e5]
    - paragraph [ref=e6]: WebGPU was required, but no GPU adapter was available at all
    - paragraph [ref=e7]:
      - text: Use
      - code [ref=e8]: "?renderer=webgl2"
      - text: only for the explicit rollback-compatible renderer.
  - alert [ref=e9]:
    - text: This game needs WebGPU. Use a current Chrome, Edge or Firefox (Windows) - or check that graphics acceleration is enabled in your browser settings. (WebGPU was required, but no GPU adapter was available at all)
    - generic [ref=e10]:
      - generic [ref=e11]:
        - generic [ref=e12]: WHAT THIS BROWSER REPORTED - select and send this to whoever is helping
        - button "COPY" [ref=e13] [cursor=pointer]
      - generic [ref=e14]: "NUKE TOWN - WEBGPU DIAGNOSTICS WHAT THIS PAGE CAN SEE (re-probed after the renderer failed to start) navigator.gpu: present requestAdapter({ powerPreference: 'high-performance' }): null - the browser offered no adapter requestAdapter({ powerPreference: 'low-power' }): null - the browser offered no adapter requestAdapter() unhinted: null - the browser offered no adapter WebGL2 context: created WebGL2 UNMASKED_RENDERER_WEBGL: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) WebGL2 UNMASKED_VENDOR_WEBGL: Google Inc. (Google) WEBGL_debug_renderer_info: exposed software rasteriser: YES - WebGL is drawing on the CPU, not on a GPU isSecureContext: true crossOriginIsolated: false (not required for WebGPU; recorded only to rule it out) browser: HeadlessChrome 149, Chromium 149, Not)A;Brand 24 platform: Windows userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.55 Safari/537.36"
      - generic [ref=e15]: WHAT TO TRY - from those observations, nothing else
      - list [ref=e16]:
        - listitem [ref=e17]: "WebGL reports a software renderer (ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)), so this browser is drawing on the CPU and has no GPU to hand to WebGPU. Hardware acceleration is switched off or blocklisted in the BROWSER - this is not a problem with the game or with the machine. In Chrome: chrome://settings/system, turn on \"Use graphics acceleration when available\", then quit the browser completely and reopen it. chrome://gpu confirms it once WebGL stops naming a software renderer."
```

# Test source

```ts
  1   | import { expect, test, type Page, type TestInfo } from '@playwright/test';
  2   | 
  3   | type Viewport = Readonly<{ name: string; width: number; height: number }>;
  4   | 
  5   | const VIEWPORTS: readonly Viewport[] = Object.freeze([
  6   |   { name: '1440p', width: 2560, height: 1440 },
  7   |   { name: '4k', width: 3840, height: 2160 },
  8   |   { name: 'ultrawide-1440p', width: 3440, height: 1440 },
  9   |   { name: 'iphone-15-landscape', width: 844, height: 390 },
  10  | ]);
  11  | 
  12  | const SHOULDER_ENTRY_NDC = Object.freeze({ left: -1.12, right: -1.07 });
  13  | const AUTHORED_ARM_SEGMENT_LENGTH_SCALE = 1;
  14  | 
  15  | function assertAuthoredArmCropAndGrip(presentation: any, label: string, maximumContactError: number): void {
  16  |   expect(presentation.armsSource, `${label}: authored two-chain source`).toBe('authored-two-chain');
  17  |   expect(presentation.armFraming, `${label}: authored arms continue below viewport`).toMatchObject({
  18  |     finite: true,
  19  |     nearPlaneClear: true,
  20  |     intersectsViewport: true,
  21  |   });
  22  |   expect(presentation.armFraming.ndcMin[1], `${label}: no detached lower sleeve edge`).toBeLessThanOrEqual(-1.2);
  23  |   expect(presentation.riggedArms, `${label}: both authored arms diagnosed`).toHaveLength(2);
  24  |   for (const side of ['right', 'left'] as const) {
  25  |     const arm = presentation.riggedArms.find((candidate: { side: string }) => candidate.side === side);
  26  |     expect(arm, `${label}: ${side} authored arm`).toMatchObject({
  27  |       active: true,
  28  |       finite: true,
  29  |       withinStableReach: true,
  30  |       authoredSegmentDirectionsPreserved: true,
  31  |       poseChainContract: 'authored-palm-full-transform-to-socket-frame-v2',
  32  |       shoulderEntryPolicy: 'camera-space-below-frame-continuation-v1',
  33  |     });
  34  |     expect(arm.shoulderEntryNdc[1], `${label}: ${side} shoulder enters below frame`)
  35  |       .toBeLessThanOrEqual(SHOULDER_ENTRY_NDC[side] + 0.001);
  36  |     expect(arm.contactError, `${label}: ${side} palm/socket contact`).toBeLessThanOrEqual(maximumContactError);
  37  |     expect(arm.wristContactError, `${label}: ${side} wrist target contact`).toBeLessThanOrEqual(maximumContactError);
  38  |     expect(arm.palmOrientationError, `${label}: ${side} human palm orientation`).toBeLessThanOrEqual(0.2);
  39  |     expect(arm.segmentLengthScale, `${label}: ${side} authored anatomical length`)
  40  |       .toBe(AUTHORED_ARM_SEGMENT_LENGTH_SCALE);
  41  |     expect(arm.bindOffsetsPreserved, `${label}: ${side} bind offsets`).toBe(true);
  42  |   }
  43  | }
  44  | 
  45  | async function snapshot(page: Page): Promise<any> {
  46  |   return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot());
  47  | }
  48  | 
  49  | async function restoreStandingAfterTeleport(page: Page): Promise<void> {
  50  |   await page.waitForFunction(() => {
  51  |     const api = window.__ATOMIC_ACRES_DEBUG__;
  52  |     const state = api?.snapshot();
  53  |     if (!api || !state) return false;
  54  |     if (state.player?.stance !== 'stand') api.setStance('stand');
  55  |     return api.snapshot()?.player?.stance === 'stand';
  56  |   }, undefined, { timeout: 5_000, polling: 50 });
  57  | }
  58  | 
  59  | async function capture(page: Page, testInfo: TestInfo, viewport: Viewport, pose: string): Promise<void> {
  60  |   const path = testInfo.outputPath(`${viewport.name}-${pose}.png`);
  61  |   await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  62  |   try {
  63  |     await page.screenshot({ path, animations: 'disabled', timeout: 60_000 });
  64  |   } finally {
  65  |     await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  66  |   }
  67  |   await testInfo.attach(`${viewport.name}-${pose}`, { path, contentType: 'image/png' });
  68  | }
  69  | 
  70  | test('keeps authored arms and knife readable at 1440p, 4K and ultrawide', async ({ page }, testInfo) => {
  71  |   test.setTimeout(240_000);
  72  |   const runtimeErrors: string[] = [];
  73  |   page.on('pageerror', (error) => runtimeErrors.push(error.message));
  74  |   await page.goto('/?release=latest&renderer=webgl2&render=blender&map=gun-range&grass=off&mist=off&seed=660214');
> 75  |   await page.waitForFunction(() => {
      |              ^ TimeoutError: page.waitForFunction: Timeout 45000ms exceeded.
  76  |     const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
  77  |     return state?.bootstrap?.stage === 'ready' && state?.weaponReady === true;
  78  |   }, undefined, { timeout: 45_000 });
  79  |   await page.evaluate(() => {
  80  |     const api = window.__ATOMIC_ACRES_DEBUG__;
  81  |     api.startSolo();
  82  |     api.setBotsFrozen(true);
  83  |     api.setMovement(false);
  84  |   });
  85  |   await page.waitForFunction(() => {
  86  |     const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
  87  |     return state?.gameStarted === true && state?.matchPhase === 'active';
  88  |   }, undefined, { timeout: 45_000 });
  89  |   await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('m4a1'));
  90  |   await page.waitForFunction(() => {
  91  |     const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
  92  |     return presentation?.weapon === 'm4a1' && presentation?.importedModel?.weapon === 'm4a1';
  93  |   }, undefined, { timeout: 30_000 });
  94  | 
  95  |   for (const viewport of VIEWPORTS) {
  96  |     await page.setViewportSize({ width: viewport.width, height: viewport.height });
  97  |     await page.evaluate(() => {
  98  |       const api = window.__ATOMIC_ACRES_DEBUG__;
  99  |       api.setAds(false);
  100 |       api.setReloadCaptureProgress(null);
  101 |       api.setMeleeCaptureProgress(null);
  102 |     });
  103 |     await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation?.adsProgress < 0.02);
  104 |     await page.waitForTimeout(300);
  105 |     const hip = (await snapshot(page)).weaponPresentation;
  106 |     expect(hip.armsSource, `${viewport.name}: authored arms`).toBe('authored-two-chain');
  107 |     expect(hip.authoredFingerBoneCount, `${viewport.name}: articulated fingers`).toBe(30);
  108 |     expect(hip.armMaterials, `${viewport.name}: opaque arm materials`).toMatchObject({
  109 |       contract: 'opaque-depth-writing', transparent: 0, nonOpaque: 0, depthWriteDisabled: 0,
  110 |     });
  111 |     expect(hip.firstPersonRearStockTrim, `${viewport.name}: M4A1 rear-stock occlusion trim`).toMatchObject({ applied: true });
  112 |     expect(
  113 |       hip.firstPersonRearStockTrim.batches.reduce(
  114 |         (total: number, batch: { suppressedElements: number }) => total + batch.suppressedElements,
  115 |         0,
  116 |       ),
  117 |       `${viewport.name}: M4A1 suppressed rear-stock elements`,
  118 |     ).toBeGreaterThan(0);
  119 |     expect(hip.importedModel, `${viewport.name}: immutable M4A1 topology`).toMatchObject({
  120 |       triangles: 32_112, renderPrimitives: 8,
  121 |     });
  122 |     expect(hip.armFraming, `${viewport.name}: finite hip framing`).toMatchObject({
  123 |       finite: true, nearPlaneClear: true, intersectsViewport: true,
  124 |     });
  125 |     assertAuthoredArmCropAndGrip(hip, `${viewport.name}: hip`, 0.015);
  126 |     await capture(page, testInfo, viewport, 'hip');
  127 | 
  128 |     await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
  129 |     await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation?.adsProgress > 0.98);
  130 |     await page.waitForTimeout(300);
  131 |     const ads = (await snapshot(page)).weaponPresentation;
  132 |     expect(Math.hypot(...ads.sightOffset), `${viewport.name}: physical ADS centre`).toBeLessThanOrEqual(0.03);
  133 |     expect(ads.armFraming, `${viewport.name}: ADS arm framing`).toMatchObject({
  134 |       finite: true, nearPlaneClear: true, intersectsViewport: true,
  135 |     });
  136 |     for (const side of ['right', 'left'] as const) {
  137 |       const arm = ads.riggedArms.find((candidate: { side: string }) => candidate.side === side);
  138 |       expect(arm, `${viewport.name}: ${side} authored ADS arm`).toMatchObject({
  139 |         finite: true, withinStableReach: true,
  140 |       });
  141 |       expect(arm.contactError, `${viewport.name}: ${side} hand contact`).toBeLessThanOrEqual(0.015);
  142 |       expect(arm.wristContactError, `${viewport.name}: ${side} wrist contact`).toBeLessThanOrEqual(0.015);
  143 |     }
  144 |     expect(
  145 |       ads.armFraming.nearestDepth - ads.weaponFraming.nearestDepth,
  146 |       `${viewport.name}: ADS receiver depth clearance`,
  147 |     ).toBeGreaterThan(0.08);
  148 |     assertAuthoredArmCropAndGrip(ads, `${viewport.name}: ADS`, 0.015);
  149 |     await capture(page, testInfo, viewport, 'ads');
  150 | 
  151 |     await page.evaluate(() => {
  152 |       const api = window.__ATOMIC_ACRES_DEBUG__;
  153 |       api.setAds(false);
  154 |       api.fireOnce();
  155 |     });
  156 |     await page.locator('#game').click({ position: { x: 640, y: 360 } });
  157 |     await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'));
  158 |     await page.keyboard.press('r');
  159 |     await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setReloadCaptureProgress(0.46));
  160 |     await page.waitForFunction(() => {
  161 |       const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
  162 |       return presentation?.adsProgress < 0.02
  163 |         && presentation?.authoredArmAnimation?.activeAction === 'reload';
  164 |     });
  165 |     await page.waitForTimeout(300);
  166 |     const reload = (await snapshot(page)).weaponPresentation;
  167 |     expect(reload.authoredArmAnimation).toMatchObject({
  168 |       activeAction: 'reload',
  169 |       blendPolicy: 'finger-tracks-first-runtime-ik-last',
  170 |     });
  171 |     for (const side of ['right', 'left'] as const) {
  172 |       const arm = reload.riggedArms.find((candidate: { side: string }) => candidate.side === side);
  173 |       expect(arm, `${viewport.name}: ${side} reload arm`).toMatchObject({ finite: true, withinStableReach: true });
  174 |       expect(arm.contactError, `${viewport.name}: ${side} reload hand contact`).toBeLessThanOrEqual(0.02);
  175 |     }
```