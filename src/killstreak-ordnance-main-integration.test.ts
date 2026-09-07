import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function block(start: string, end: string): string {
  const from = main.indexOf(start);
  const to = main.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return main.slice(from, to);
}

/**
 * HF-379: grenade and lethal-equipment kills advance the killstreak counter
 * exactly like gun kills. The predicate and runtime are unit-tested; this file
 * pins the three live increment call sites so the wiring cannot silently drop.
 */
describe('HF-379 ordnance killstreak wiring', () => {
  it('credits remote killers through the host death path for gun and grenade causes alike', () => {
    const death = block('function processDeath(', '\nfunction removeRemote(');
    expect(death).toContain('killstreakRuntime.recordEligibleElimination(message.killer, killstreakEliminationSource(message.cause))');
    expect(death).not.toContain("recordEligibleElimination(message.killer, 'weapon')");
  });

  it('credits the local player when their own grenade or gun kill arrives as a death message', () => {
    const death = block('function processDeath(', '\nfunction removeRemote(');
    expect(death).toContain('if (isKillstreakEligible(message.cause)) awardSupportElimination(true, killstreakEliminationSource(message.cause));');
  });

  it('credits solo bot eliminations from the shared kill cause, including grenade blasts', () => {
    const botDamage = block('function applyBotDamage(', '\nfunction respawnBot(');
    expect(botDamage).toContain('if (isKillstreakEligible(cause)) awardSupportElimination(true, killstreakEliminationSource(cause));');
  });

  it('forwards the elimination source into host authority so grenades replicate as ordnance', () => {
    const award = block('function awardSupportElimination(', '\nfunction activeGunRangeTrainingDummies(');
    expect(award).toContain('source: EliminationSource');
    expect(award).toContain('killstreakRuntime.recordEligibleElimination(player.id, source)');
    expect(award).not.toContain("recordEligibleElimination(player.id, 'weapon')");
  });
});
