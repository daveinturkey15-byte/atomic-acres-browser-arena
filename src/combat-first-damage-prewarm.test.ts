import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const audioSource = readFileSync(new URL('./audio.ts', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

function between(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  expect(start, `missing ${startNeedle}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing ${endNeedle}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

const COLD_FACTORY_TOKENS = Object.freeze([
  'createBufferSource(',
  'createOscillator(',
  'createBiquadFilter(',
  'createGain(',
  "createElement('",
  '.append(',
  '.remove()',
] as const);

function coldFactoryViolations(source: string): readonly string[] {
  return COLD_FACTORY_TOKENS.filter((token) => source.includes(token));
}

describe('HF-282 first-combat preparation contract', () => {
  it('makes first damage and first low-health sampling parameter-only audio paths', () => {
    const damage = between(audioSource, '\n  damage(): void {', '\n  impact(');
    const lowHealth = between(audioSource, '\n  setLowHealthFeedback(', '\n  setArenaZone(');
    expect(coldFactoryViolations(damage)).toEqual([]);
    expect(coldFactoryViolations(lowHealth)).toEqual([]);
    expect(damage).not.toContain('this.noise(');
    expect(damage).not.toContain('this.sweep(');
    expect(damage).toContain('this.damageFeedbackSource.frequency');
    expect(lowHealth).toContain('parameter.setTargetAtTime(');
  });

  it('transactionally prepares three muted tonal sources during unlock and before deployment admission', () => {
    const prepare = between(audioSource, '\n  prepareCombat(): boolean {', '\n  prepareGlassImpact(');
    expect(prepare.match(/this\.context\.createOscillator\(\)/g)).toHaveLength(3);
    expect(prepare).not.toContain('createBufferSource(');
    expect(prepare).not.toContain('.loop = true');
    expect(prepare).toContain('breathGain.gain.value = 0');
    expect(prepare).toContain('heartbeatGain.gain.value = 0');
    expect(prepare).toContain('damageGain.gain.value = 0');

    const unlock = between(audioSource, '\n  unlock(): void {', '\n  suspend(): void {');
    expect(unlock).toContain('this.prepareCombat() && this.prepareGlassImpact() && this.prepareGrenadeEffects()');
    expect(unlock.indexOf('this.prepareCombat()')).toBeLessThan(unlock.indexOf('this.prepareChopperRotors()'));
    expect(unlock).not.toContain('this.startArenaBed(');
    const admission = between(mainSource, 'async function startGame(', '\nfunction randomNonce()');
    expect(admission.indexOf('audio.unlock()')).toBeLessThan(admission.indexOf('audio.prepareCombat()'));
    expect(admission.indexOf('audio.prepareCombat()')).toBeLessThan(admission.indexOf('prepareDeploymentTransition()'));
    expect(admission.indexOf('audio.prepareCombat()')).toBeLessThan(admission.indexOf('gameStarted = true'));
  });

  it('contains no indefinite WebAudio buffer loop while retaining explicitly bounded transients', () => {
    expect(audioSource).not.toContain('.loop = true');
    const transientNoise = between(audioSource, '\n  private noise(', '\n  private sweep(');
    expect(transientNoise).toContain('source.start(now,');
    expect(transientNoise).toContain('options.duration);');
    const footsteps = between(audioSource, '\n  worldFootstep(', '\n  prepareCombat(');
    expect(footsteps).toContain('source.start(now,');
    expect(footsteps).toContain(', 0.085);');
  });

  it('uses a fixed HUD marker pool and a pre-instantiated damage animation on first hit', () => {
    const hudSetup = between(mainSource, "const damageDirectionIndicator = element<HTMLElement>('#damage-direction');", 'menu.dataset.context');
    expect(hudSetup).toContain('Array.from({ length: MAX_CONCURRENT_DAMAGE_DIRECTIONS }');
    expect(hudSetup).toContain("document.createElement('i')");
    expect(hudSetup).toContain('damageDirectionIndicator.append(marker)');
    expect(hudSetup).toContain("damageFlash.classList.add('combat-prewarm')");

    const update = between(mainSource, 'function updateSensoryFeedback(', '\nfunction scheduleLocalRespawn(');
    const applyDamage = between(mainSource, 'function applyDamage(', '\nfunction disposeDeathDrop(');
    expect(coldFactoryViolations(update)).toEqual([]);
    expect(coldFactoryViolations(applyDamage)).toEqual([]);
    expect(update).toContain('damageDirectionMarkers.forEach(');
    expect(applyDamage).toContain('requestAnimationFrame(replayDamageFlash)');
    expect(styleSource).toContain('#damage-flash.combat-prewarm{animation:damage .42s ease-out paused;animation-delay:-.42s}');
  });

  it.each(COLD_FACTORY_TOKENS)('detects a reintroduced cold factory mutation: %s', (token) => {
    expect(coldFactoryViolations(`parameter automation; ${token}`)).toContain(token);
  });
});
