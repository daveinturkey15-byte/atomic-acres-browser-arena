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

describe('Carpet Bomber authoritative death integration', () => {
  it('routes processDeath diagnostics, victim score mutation, broadcast and feed through one outcome', () => {
    const death = block('function processDeath(', '\nfunction removeRemote(');
    expect(death).toContain('const deathOutcome = resolveAuthoritativeDeathOutcome({');
    expect(death).toContain('commitAuthoritativeDeathOutcome(deathOutcome, {');
    expect(death).toContain('actorKind: outcome.actor.kind');
    expect(death).toContain('targetKind: outcome.target.kind');
    expect(death).toContain('weaponOrEffect: outcome.weaponOrEffect');
    expect(death).toContain('for (const [id, score] of scores) authoritativeScores.set(id, score)');
    expect(death).toContain('broadcastScores: sendAuthoritativeScores');
    expect(death).toContain('presentFeed: (text) => addFeed(text');
    expect(death).toContain('const eliminationFeedText = deathOutcome.feedText');
    expect(death).not.toContain('authoritativeScores.set(message.killer');
    expect(death.indexOf('railgunDeathPresentations.push')).toBeLessThan(
      death.indexOf('commitAuthoritativeDeathOutcome(deathOutcome, {'),
    );
  });

  it('recognises the canonical map combatant before ordinary player and bot lookup', () => {
    const labels = block('function combatantLabel(', '\ntype DamageRecord');
    const mapLabel = labels.indexOf('id === MAP_CARPET_BOMBER_KILLER_ID');
    const playerLabel = labels.indexOf('id === player.id');
    expect(mapLabel).toBeGreaterThanOrEqual(0);
    expect(playerLabel).toBeGreaterThan(mapLabel);
    expect(labels).toContain("name: MAP_CARPET_BOMBER_LABEL, kind: 'environment'");
  });

  it('uses map attribution for every Carpet damage target and strips synthetic map score rows', () => {
    const scoring = block('function recordAuthoritativeDamage(', '\nfunction acceptAuthoritativeScores(');
    expect(scoring).toContain('recordAuthoritativeDamageScores(authoritativeScores, attackerId, victimId, damage)');
    const supportDamage = block('function applyKillstreakDamageEvent(', '\nlet lastKillstreakControlSentAt');
    expect(supportDamage).toContain('const attributionId = killAttributionId(event.ownerId, cause)');
    expect(supportDamage).toContain('recordAuthoritativeDamage(attributionId, event.targetId, result.damageApplied)');
    expect(supportDamage).not.toContain('recordAuthoritativeDamage(event.ownerId, event.targetId');
  });

  it('routes an offline map-owned bot death through processDeath without duplicating the manual corpse/drop path', () => {
    const botDamage = block('function applyBotDamage(', '\nfunction respawnBot(');
    const offlineMapBranch = botDamage.indexOf("network.role === 'offline'");
    const processDeath = botDamage.indexOf('processDeath(death);', offlineMapBranch);
    const manualPresentation = botDamage.indexOf('const source = corpseSource(bot.id);', offlineMapBranch);

    expect(offlineMapBranch).toBeGreaterThanOrEqual(0);
    expect(botDamage.slice(offlineMapBranch, processDeath)).toContain('attackerId === MAP_CARPET_BOMBER_KILLER_ID');
    expect(botDamage.slice(offlineMapBranch, processDeath)).toContain("cause.kind === 'environment'");
    expect(processDeath).toBeGreaterThan(offlineMapBranch);
    expect(manualPresentation).toBeGreaterThan(processDeath);
    expect(botDamage.slice(offlineMapBranch, manualPresentation).match(/processDeath\(death\);/g)).toHaveLength(1);
  });
});
