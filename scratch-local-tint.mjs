import { launchSoloMatch } from './scripts/qa/lib/launch-match.mjs';
try {
  const { page, close } = await launchSoloMatch({ arena: 'atomic-acres', seed: 'tintlocal', tintRealism: true });
  await page.waitForTimeout(3000);
  const errors = await page.evaluate(() => {
    const d = window.__ATOMIC_ACRES_DEBUG__;
    return {
      repairs: document.documentElement.dataset.tintPipelineRepairs ?? '0',
      lastPurge: document.documentElement.dataset.tintPipelineLastPurge ?? 'n/a',
      backend: document.documentElement.dataset.renderBackend,
      phase: d.snapshot().matchPhase,
    };
  });
  console.log(JSON.stringify(errors));
  await close();
} catch (error) {
  console.log('LOCAL TINT PROBE FAIL:', String(error).split('\n')[0]);
}
