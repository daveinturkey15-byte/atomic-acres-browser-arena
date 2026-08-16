import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function between(value: string, start: string, end: string): string {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing start marker ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing end marker ${end}`).toBeGreaterThan(startIndex);
  return value.slice(startIndex, endIndex);
}

describe('HF-309 Chopper first-entry release evidence wiring', () => {
  const presentation = source('src/killstreak-presentation.ts');
  const audio = source('src/audio.ts');
  const main = source('src/legacy-main.ts');
  const shell = source('src/ui/pass64-shell.ts');
  const spec = source('tests/e2e/pass71-hf309-chopper-first-entry.spec.ts');
  const runner = source('scripts/qa/run-pass71-hf309-chopper-first-entry-evidence.mjs');
  const contract = source('scripts/qa/pass71-hf309-chopper-first-entry-evidence-contract.mjs');
  const playwrightConfig = source('playwright.config.ts');
  const packageJson = JSON.parse(source('package.json')) as { scripts: Record<string, string> };

  it('owns exact authored aircraft, cockpit and gun vocabulary before live support can lease it', () => {
    const requiredNodes = between(
      presentation,
      'const SUPPORT_VEHICLE_REQUIRED_NODES:',
      'const SUPPORT_VEHICLE_REQUIRED_ACTIONS:',
    );
    for (const node of [
      'chopper-fuselage',
      'chopper-first-person-cockpit',
      'chopper-gunner-sightline',
      'chopper-gunner-weapon-view',
      'chopper-cockpit-dashboard-3d',
      'chopper-cockpit-display-cyan',
      'chopper-cockpit-display-green',
      'chopper-first-person-camera-socket',
      'chopper-player-gun',
      'chopper-gun-muzzle-socket',
      'chopper-muzzle-flash',
      'chopper-tracer-action',
      'chopper-impact-action',
    ]) expect(requiredNodes).toContain(`'${node}'`);
    const requiredActions = between(
      presentation,
      'const SUPPORT_VEHICLE_REQUIRED_ACTIONS:',
      'const SUPPORT_VEHICLE_LOOP_ACTIONS:',
    );
    for (const action of [
      'Chopper_Main_Rotor_Loop',
      'Chopper_Tail_Rotor_Loop',
      'Chopper_Gun_Recoil',
      'Chopper_Gun_Fire',
      'Chopper_Muzzle_Flash',
      'Chopper_Tracer_Pulse',
      'Chopper_Impact_Pulse',
      'Chopper_Quiet_Loop',
    ]) expect(requiredActions).toContain(`'${action}'`);
    expect(presentation).toContain("['chopper', 1]");
    expect(presentation).toContain('await this.installPrewarmedVocabularyBatched();');
    expect(presentation).toContain("presentationSource === 'project-original-blender-glb'");
  });

  it('submits the missile/impact pools and exact possessed-cockpit graph during renderer prewarm', () => {
    const gpuPrewarm = between(
      presentation,
      'private async performGpuPrewarm(',
      'private acquirePresentedEntity(',
    );
    expect(presentation).toContain('const MAX_BOMB_SHELLS = 20;');
    expect(presentation).toContain('const MAX_IMPACT_FLASHES = 20;');
    expect(presentation).toContain('private readonly impactFlashPool = Array.from({ length: MAX_IMPACT_FLASHES }');
    expect(presentation).toContain('private readonly bombShellPool = Array.from({ length: MAX_BOMB_SHELLS }');
    expect(gpuPrewarm).toContain('...this.impactFlashPool.map((entry) => entry.root)');
    expect(gpuPrewarm).toContain('...this.bombShellPool.map((entry) => entry.root)');
    expect(gpuPrewarm).toContain("...(this.entityPools.get('chopper') ?? []).slice(0, 1)");
    expect(gpuPrewarm).toContain("const chopperRoot = this.entityPools.get('chopper')?.[0]?.root ?? null;");
    expect(gpuPrewarm).toContain('node.visible = gunnerCockpitNode && !retiredStaticSource;');
    expect(gpuPrewarm).toContain('await runtime.compileAndRender(this.root, camera, parentScene);');
    expect(gpuPrewarm.indexOf('...this.bombShellPool.map((entry) => entry.root)'))
      .toBeLessThan(gpuPrewarm.indexOf('await runtime.compileAndRender(this.root, camera, parentScene);'));
    expect(presentation).toContain("const isChopperMissile = impact.source === 'chopper';");
    expect(presentation).toContain('const shell = firstInactive(this.bombShellPool);');
    expect(presentation).toContain("pass70-chopper-missile-impact-flash");
  });

  it('awaits asset and renderer preparation before match admission and prepares audio once', () => {
    const shared = between(
      main,
      'async function prepareSharedGameplayAssets()',
      'let lastMenuDeploymentAssetsProfile:',
    );
    expect(shared).toContain('loadSupportVehiclePresentations(),');
    expect(shared).toContain('await killstreakPresentation.prewarmAuthoredAssets();');
    const arenaPrewarm = between(
      main,
      'async function prewarmArenaBoundGameplayPresentations(',
      'function bootstrapMenuPreview()',
    );
    expect(arenaPrewarm.match(/await killstreakPresentation\.prewarm\(renderRuntime, camera, sceneGeneration\);/gu))
      .toHaveLength(2);
    expect(arenaPrewarm).toContain("groups.push(await runGroup('killstreak-vocabulary'");
    const arenaSelection = between(
      main,
      'async function performArenaSelection(',
      '\nfunction activateArenaSelection(',
    );
    expect(arenaSelection).toContain('await prepareMenuDeploymentAssets();');
    expect(arenaSelection).toContain('await prewarmArenaBoundGameplayPresentations(arenaTransitionGeneration);');
    expect(arenaSelection.indexOf('await prewarmArenaBoundGameplayPresentations(arenaTransitionGeneration);'))
      .toBeLessThan(arenaSelection.indexOf('gameplayArenaPrepared = true;'));
    const matchStart = between(main, 'async function startGame(', '\nfunction randomNonce(');
    expect(matchStart).toContain("document.documentElement.dataset.chopperRotorAudioPrewarm = audio.prepareChopperRotors() ? 'ready' : 'unavailable';");
    expect(matchStart).toContain('await activateArenaSelection(requestedArenaId, true, token);');
    expect(matchStart.indexOf("audio.prepareChopperRotors()"))
      .toBeLessThan(matchStart.indexOf('await activateArenaSelection(requestedArenaId, true, token);'));
    expect(matchStart.indexOf('await activateArenaSelection(requestedArenaId, true, token);'))
      .toBeLessThan(matchStart.indexOf('gameStarted = true;'));
    const audioPrepare = between(audio, 'prepareChopperRotors(): boolean', '\n  syncChopperRotors(');
    expect(audioPrepare).toContain('if (this.chopperRotorPrepared) return true;');
    expect(audioPrepare).toContain('this.chopperRotorPrepareRuns += 1;');
    expect(audio).toContain('export const CHOPPER_ROTOR_POOL_CAPACITY = 4;');
    expect(audioPrepare.match(/this\.chopperRotorFactoryCalls \+= 1;/gu)).toHaveLength(4);
    expect(audioPrepare).toContain('this.chopperRotorPrepared = true;');
  });

  it('ships one retained HUD tree before possession rather than constructing it in the input path', () => {
    for (const id of [
      'gunner-cockpit-hud', 'gunner-platform', 'gunner-weapon-mode', 'gunner-target-confirm',
      'gunner-missile-status', 'gunner-missile-ammo', 'gunner-missile-cooldown',
      'gunner-hull', 'gunner-ammo', 'gunner-altitude', 'gunner-speed', 'gunner-time',
      'gunner-damage', 'chopper-thermal',
    ]) expect(shell).toContain(`id="${id}"`);
    const toggle = between(
      main,
      'function activateOrToggleFieldSupportSlot(',
      'function interactWithSelectedKillstreakSupport(',
    );
    expect(toggle).toContain("const action = id === 'chopper' ? 'toggle-chopper-gunner' : 'toggle-piloted-drone';");
    expect(toggle).not.toContain('createElement');
    expect(toggle).not.toContain('innerHTML');
  });

  it('binds closing evidence to trusted slot input, pre-handler resources and hard native budgets', () => {
    expect(spec).toContain("await page.keyboard.press('6');");
    expect(spec).toContain("event.code !== 'Digit6'");
    expect(spec).toContain('isTrusted: event.isTrusted');
    expect(spec).toContain('const resourcesBefore = root.__PASS71_HF309_RESOURCE_SIGNATURE__();');
    expect(spec).toContain('queueMicrotask(() => {');
    expect(spec).toContain('resourcesAfterHandler = root.__PASS71_HF309_RESOURCE_SIGNATURE__();');
    expect(spec).toContain("deriveFrameActionBudget(baseline, NATIVE_NO_FREEZE_FRAME_ACTION_MODE)");
    expect(spec).toContain('TARGET_FRAME_BUDGET_MS * MAXIMUM_ACTION_FRAME_BUDGETS');
    expect(spec).toContain('endingPresentation.completedSequence >= targetSubmissionSequence');
    expect(spec).not.toContain('toggleChopperGunnerControl()');
    expect(spec).not.toContain("activateKillstreak('chopper')");
  });

  it('runs one clean exact Candidate A in two fresh signed installed-Edge processes', () => {
    expect(runner).toContain("if (checkoutSourceSha !== expectedSourceSha || !clean())");
    expect(runner).toContain("assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable))");
    expect(runner).toContain("for (const [index, renderer] of PASS71_HF309_RENDERERS.entries())");
    expect(runner).toContain("PASS71_HF309_RENDERER: renderer");
    expect(runner).toContain('PASS71_HF309_EDGE_EXECUTABLE: edgeExecutable');
    expect(runner).toContain("QA_INSTALLED_EDGE: '1'");
    expect(playwrightConfig).toContain('const pass71Hf309EdgeExecutable = process.env.PASS71_HF309_EDGE_EXECUTABLE;');
    expect(playwrightConfig).toContain('?? pass71Hf309EdgeExecutable;');
    expect(playwrightConfig).toContain('? { executablePath: pass71OwnedEdgeExecutable }');
    expect(runner).toContain("'--project=chromium', '--workers=1', '--retries=0'");
    expect(runner).toContain("processIsolation: 'fresh-owned-installed-edge-process-and-profile-per-renderer'");
    expect(contract).toContain("maximumCount: 1");
    expect(contract).toContain('post-entry-allocation-or-reprepare');
    expect(contract).toContain('absolute-native-thresholds');
    expect(packageJson.scripts['qa:pass71:hf309-chopper-first-entry:contract'])
      .toBe('node --test scripts/qa/pass71-hf309-chopper-first-entry-evidence-contract.test.mjs');
    expect(packageJson.scripts['qa:pass71:hf309-chopper-first-entry'])
      .toBe('npm run qa:pass71:hf309-chopper-first-entry:contract && node scripts/qa/run-pass71-hf309-chopper-first-entry-evidence.mjs');
  });
});
