import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FLASHBANG_HITL_CONTRACT,
  SEMTEX_HITL_CONTRACT,
  flashbangPresentation,
  semtexBlastDamage,
} from './pass65-ordnance-contract';

describe('Pass 65 HITL ordnance corrections', () => {
  it('makes flashbang an impact event with no pre-detonation beeps and a HUD-preserving whiteout', () => {
    expect(FLASHBANG_HITL_CONTRACT).toMatchObject({
      detonationTrigger: 'first-authoritative-impact',
      preDetonationBeeps: 0,
      whiteoutGain: 5,
      preservesHud: true,
      flashPolicy: 'single-bounded-onset-and-recovery',
      audioLimiterRequired: true,
    });
    expect(flashbangPresentation(0.25, false)).toEqual({
      whiteoutOpacity: 1,
      hudOpacity: 1,
      recoveryMs: 2_800,
      audioGain: 0.25,
      detonateNow: true,
      scheduleBeeps: false,
    });
  });

  it('keeps reduced-sensory presentation more restrictive without changing host exposure', () => {
    const full = flashbangPresentation(1, false);
    const reduced = flashbangPresentation(1, true);
    expect(reduced.whiteoutOpacity).toBeLessThan(full.whiteoutOpacity);
    expect(reduced.audioGain).toBeLessThan(full.audioGain);
    expect(reduced.recoveryMs).toBeLessThan(full.recoveryMs);
    expect(reduced.hudOpacity).toBe(1);
  });

  it('composites the flash whiteout over the world while preserving the combat HUD', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const layerFor = (selector: string): number => {
      const rule = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^}]*z-index:(\\d+)`));
      if (!rule?.[1]) throw new Error(`Missing z-index contract for ${selector}`);
      return Number(rule[1]);
    };

    const worldVignetteLayer = layerFor('#vignette');
    const flashLayer = layerFor('#ordnance-flash');
    const hudLayer = layerFor('#hud');
    expect(flashLayer).toBeGreaterThan(worldVignetteLayer);
    expect(flashLayer).toBeLessThan(hudLayer);
  });

  it('defines sticky Semtex with high standing damage and strong prone mitigation', () => {
    expect(SEMTEX_HITL_CONTRACT).toMatchObject({
      collisionPolicy: 'stick-world-and-current-actor-life',
      fuseOrigin: 'first-authoritative-impact',
      followsRespawnedLife: false,
      damageResolution: 'exactly-once',
    });
    expect(semtexBlastDamage(0, false)).toBe(95);
    expect(semtexBlastDamage(0, true)).toBeCloseTo(39.9, 5);
    expect(semtexBlastDamage(SEMTEX_HITL_CONTRACT.blastRadiusM, false)).toBe(18);
    expect(semtexBlastDamage(SEMTEX_HITL_CONTRACT.blastRadiusM + 0.01, false)).toBe(0);
  });
});
