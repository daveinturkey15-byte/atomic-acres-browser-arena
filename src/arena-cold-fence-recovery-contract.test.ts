import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// FIX-LOAD-FLIPBACK (2026-09-09, lane fix-load-flipback).
//
// The owner's complaint: cold boots "keep flipping back to the map select
// screen". The shipped performArenaSelectionWithColdFenceRetry retried the
// whole selection AFTER the rollback had already run setArenaMenuCamera() and
// posted the failure status - the player watched the flip-back happen and the
// rescued boot cost 168 s. Measured again tonight on the pass 96 lane tree
// (baseline-boot-9-nuketown2.jsonl): gen 1 lost the visual-definition fence at
// 14.8 s, the wrapper's full retry (gen 2) lost the SAME fence again at
// 14.0 s, and only the match-start path's later attempts committed - the
// failure status was shown twice.
//
// This contract pins the replacement structure: the transition re-arms the
// 12 s fence in place (Dawn keeps compiling off the fence clock), and a still-
// failing cold-fence attempt retries ONCE before the player-visible rollback
// surface (menu camera + failure status) is ever shown. The failure surface
// itself must survive for genuinely stuck devices - it is not weakened.

const legacyMain = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

const transitionStart = legacyMain.indexOf('async function performArenaSelection(');
const transitionEnd = legacyMain.indexOf('function activateArenaSelection(');
const transitionRegion = legacyMain.slice(transitionStart, transitionEnd);

describe('arena cold-fence recovery contract', () => {
  it('re-arms the cold 12 s fence in place instead of failing the selection', () => {
    expect(legacyMain).toContain('function flushWebGpuFramesColdTolerant(');
    // Exactly one re-arm: try awaits once, catch re-awaits once, then rethrows.
    const helper = legacyMain.slice(
      legacyMain.indexOf('async function flushWebGpuFramesColdTolerant('),
      legacyMain.indexOf('async function performArenaSelection('),
    );
    expect(helper.match(/await flushWebGpuFrames\(timeoutMs\);/g)).toHaveLength(2);
    // Non cold-fence rejections still propagate untouched.
    expect(helper).toContain('if (!COLD_FENCE_TIMEOUT_PATTERN.test(');
    expect(helper).toMatch(/throw error;\s*\n\s*console\.warn\(/);
  });

  it('routes every 12 s transition fence through the re-arming helper', () => {
    expect(transitionRegion).toContain("await flushWebGpuFramesColdTolerant('visual-definition warm frame');");
    expect(transitionRegion).toContain("await flushWebGpuFramesColdTolerant('coverage pre-flush');");
    expect(transitionRegion).toContain("await flushWebGpuFramesColdTolerant('coverage draw flush');");
    expect(transitionRegion).not.toContain('await flushWebGpuFrames(12_000)');
  });

  it('consults the retry gate before showing the rollback surface', () => {
    const gate = transitionRegion.indexOf('const retryColdFence = coldFenceRetryArmed');
    expect(gate).toBeGreaterThan(-1);
    expect(transitionRegion.slice(gate, gate + 120)).toContain('COLD_FENCE_TIMEOUT_PATTERN.test(arenaTransitionFailure)');
    // The cold rollback branch must throw the retry signal BEFORE the menu
    // camera and the failure status run.
    const coldBranch = transitionRegion.slice(
      transitionRegion.indexOf('if (!hadPreparedArena) {', gate),
      transitionRegion.indexOf('} else try {', gate),
    );
    const signalAt = coldBranch.indexOf('throw new ColdFenceSelectionRetrySignal();');
    const cameraAt = coldBranch.indexOf('setArenaMenuCamera();');
    const statusAt = coldBranch.indexOf('deployment preparation failed. Choose a map and retry.');
    expect(signalAt).toBeGreaterThan(-1);
    expect(cameraAt).toBeGreaterThan(signalAt);
    expect(statusAt).toBeGreaterThan(signalAt);
    // The warm rollback branch retries behind its own restoration, before its
    // failure status line, and the fatal-rollback guard must not swallow the
    // signal.
    expect(transitionRegion).toContain('if (rollbackError instanceof ColdFenceSelectionRetrySignal) throw rollbackError;');
  });

  it('keeps the failure status lines for genuinely stuck devices', () => {
    expect(transitionRegion).toContain('deployment preparation failed. Choose a map and retry.');
    expect(transitionRegion).toContain('remains selected.');
  });

  it('performs at most one selection attempt per wrapper call and disarms the retry', () => {
    const wrapper = legacyMain.slice(
      legacyMain.indexOf('async function performArenaSelectionWithColdFenceRetry('),
      legacyMain.indexOf('function stageMenuArenaSelection('),
    );
    expect(wrapper.match(/await performArenaSelection\(/g)).toHaveLength(1);
    expect(wrapper).toContain('coldFenceRetryArmed = attempt === 0;');
  });
});
