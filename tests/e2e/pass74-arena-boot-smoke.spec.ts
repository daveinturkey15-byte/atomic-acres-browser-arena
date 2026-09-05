import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_IDS } from '../../src/arena-identity';

// Boot-correctness gate for every canonical arena.
//
// Exists because of a specific incident: a required DOM element was removed while
// still queried at module level, 2,858 unit tests stayed green, and the game
// would not start - the owner found it by opening the page. This spec opens the
// page, for every arena the game can name, before the owner does.
//
// Headless Chromium falls back to SwiftShader on this machine, so this asserts
// BOOT CORRECTNESS only - never a frame-rate or visual-quality number. No retries:
// a flaky boot is a boot bug.
//
// Provenance note: the wave-8 lane that first authored this spec timed out and
// left the file truncated to zero bytes; it had executed once, proving the flow.
// Reconstructed by the orchestrator with the JSHandle assertion bug fixed
// (waitForFunction resolves to a handle, and comparing the handle to a string can
// never pass, which failed even a healthy boot).
//
// 2026-08-31 repair, three separate defects, none of which could be seen because
// NOTHING EXECUTED THIS FILE - it was in no npm script, in no run-bounded-e2e.mjs
// group and in neither workflow, so its header's claim to open the page "before
// the owner does" had never once been true:
//   1. The roster was a hardcoded six-id literal. Test1 and Test2 shipped on
//      2026-08-30 and this gate would not have opened either of them. It is now
//      ARENA_IDS - the module protocol and persistence validators use as the
//      canonical identity boundary - cross-checked below against the arena
//      modules actually present on disk.
//   2. The internal waits are 90 s and 120 s under playwright.config.ts's 60 s
//      per-test timeout, so the test could never reach its own deploy-failure
//      branch; the timeout below makes those waits reachable. This raises no
//      assertion threshold - every expect() is unchanged.
//   3. The header said "all six arenas" while claiming to cover the canonical
//      set. The count is no longer written down anywhere.

const ARENAS = ARENA_IDS;

// Second, independent observation of the same roster. ARENA_IDS is a literal in
// src/, so on its own it is one hand-maintained list checked against nothing;
// this walks src/rendering/arenas/ and fails if an arena module exists that the
// identity boundary does not name. A boot gate that silently skips an arena is
// the exact failure this file was written after.
function repositoryRoot(): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, 'src', 'rendering', 'arenas'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`cannot locate the repository root from ${process.cwd()}`);
}

/**
 * Owner 2026-08-31. This spec is WebGPU-only by definition - it boots a real
 * match - but the chromium project only selects INSTALLED Chrome when
 * PASS73_NATIVE_WEBGPU=1. Without it Playwright launches its bundled Chromium,
 * which on this machine gets a GPU adapter and then throws
 * "DynamicLib.Open: dxil.dll Windows Error: 87" from Dawn on requestDevice. The
 * game then correctly fails closed, and every arena times out after 90 s.
 *
 * Run bare, that is 13 minutes producing eight identical timeouts and no hint
 * that the browser, not the game, is the problem - which is exactly how someone
 * concludes "all eight arenas are broken". Fail in seconds with the reason and
 * the fix instead. Measured: with the flag all nine tests pass, farcrysis
 * included.
 */
test('runs on a browser that can actually get a WebGPU device', async ({ page }) => {
  await page.goto('/');
  const device = await page.evaluate(async () => {
    if (!navigator.gpu) return 'no navigator.gpu';
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return 'no adapter';
    try { await adapter.requestDevice(); return 'ok'; } catch (error) { return String(error); }
  });
  expect(
    device,
    'This spec boots real matches and needs a WebGPU device. Run it as '
      + '`PASS73_NATIVE_WEBGPU=1 npm run qa:pass74:arena-boot-smoke` so the chromium '
      + 'project selects installed Chrome; the bundled Chromium cannot '
      + 'acquire a device on this machine and every arena will time out.',
  ).toBe('ok');
});

test('the boot roster names every arena module on disk', () => {
  const arenasDir = resolve(repositoryRoot(), 'src', 'rendering', 'arenas');
  const onDisk = readdirSync(arenasDir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'shared.ts')
    .map((file) => {
      const source = readFileSync(join(arenasDir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .replace(/\/\/[^\n]*/gu, '');
      const declared = /createProceduralArenaVisualDefinition\(\{\s*id:\s*'([a-z0-9-]+)'/u.exec(source);
      expect(declared, `${file} declares no arena visual definition this gate can read`).not.toBeNull();
      return declared![1];
    })
    .sort();
  expect(onDisk.length, 'read no arena modules off disk').toBeGreaterThan(0);
  expect([...ARENAS].sort(), 'every arena module on disk must be booted by this gate').toEqual(onDisk);
});

const MENU_URL =
  '/?release=latest&renderer=webgpu&grass=off&mist=off&clouds=off&rays=off&seed=arena-boot-smoke&previewTime=0';

type DebugApi = {
  startSolo: () => void;
  selectArena: (id: string) => Promise<void>;
  snapshot: () => {
    matchPhase: 'warmup' | 'active' | 'ended';
    gameStarted: boolean;
    [key: string]: unknown;
  };
};

type DeploymentDiagnostic = {
  status: string;
  bootstrap: unknown;
  transition: unknown;
  matchPhase: unknown;
  gameStarted: unknown;
};

async function captureDeploymentDiagnostic(page: Page): Promise<DeploymentDiagnostic> {
  return page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__;
    const state = api?.snapshot();
    const bootstrap = state?.bootstrap as Record<string, unknown> | undefined;
    const arenaSelection = state?.arenaSelection as Record<string, unknown> | undefined;
    const streaming = arenaSelection?.streaming as Record<string, unknown> | undefined;
    const transition = streaming?.transition as Record<string, unknown> | undefined;
    return {
      status: document.querySelector('#status')?.textContent ?? '',
      bootstrap: bootstrap
        ? {
            stage: bootstrap.stage,
            menuDeploymentAssetsProfile: bootstrap.menuDeploymentAssetsProfile,
            effectPrewarmProfile: bootstrap.effectPrewarmProfile,
            matchAdmissionProfile: bootstrap.matchAdmissionProfile,
          }
        : null,
      transition: transition
        ? {
            phase: transition.phase,
            failure: transition.failure,
            profile: transition.profile,
          }
        : null,
      matchPhase: state?.matchPhase ?? null,
      gameStarted: state?.gameStarted ?? false,
    };
  });
}

test.describe('arena boot smoke — every canonical arena', () => {
  for (const arenaId of ARENAS) {
    test(`${arenaId}: boots a clean visible solo match`, async ({ page }) => {
      // The waits below are 90 s (debug API) plus 120 s (active phase); the
      // config's 60 s per-test ceiling made both unreachable. Nothing about
      // what is asserted changes - only whether the test can survive its own
      // authored patience on a SwiftShader boot.
      test.setTimeout(240_000);
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 300)));
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
      });

      await page.goto(MENU_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => Boolean((window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__),
        undefined,
        { timeout: 90_000 },
      );

      await page.evaluate(async (id) => {
        await (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.selectArena(id);
      }, arenaId);
      await page.evaluate(() => {
        (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.startSolo();
      });

      // Reach active phase - or surface the game's own deployment failure text,
      // which names the cause instead of a bare timeout.
      const outcomeHandle = await page.waitForFunction(
        () => {
          const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__;
          const state = api?.snapshot();
          if (state?.matchPhase === 'active' && state?.gameStarted === true) return 'active';
          const status = document.querySelector('#status')?.textContent ?? '';
          if (/deployment preparation failed|renderer blocked/i.test(status)) return `deploy-failed: ${status}`;
          return null;
        },
        undefined,
        { timeout: 120_000 },
      ).catch(async (error) => {
        const diagnostic = await captureDeploymentDiagnostic(page);
        throw new Error(`${arenaId}: deployment stalled; last phase snapshot=${JSON.stringify(diagnostic)}; ${String(error)}`);
      });
      const outcome = await outcomeHandle.jsonValue();
      expect(outcome, `${arenaId}: solo match must reach active phase`).toBe('active');

      const canvasInfo = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return null;
        const style = getComputedStyle(canvas);
        return {
          visible: style.display !== 'none' && style.visibility !== 'hidden',
          width: canvas.width,
          height: canvas.height,
          backend: document.documentElement.dataset.renderBackend ?? null,
        };
      });
      expect(canvasInfo, `${arenaId}: a canvas must exist`).not.toBeNull();
      expect(canvasInfo!.visible, `${arenaId}: the canvas must be visible`).toBe(true);
      expect(canvasInfo!.width, `${arenaId}: canvas must have real size`).toBeGreaterThan(0);
      expect(canvasInfo!.backend, `${arenaId}: renderer backend must be stamped`).toBeTruthy();

      expect(pageErrors, `${arenaId}: no uncaught page errors`).toEqual([]);
      expect(consoleErrors, `${arenaId}: no console errors`).toEqual([]);
    });
  }
});
