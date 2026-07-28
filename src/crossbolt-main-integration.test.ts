import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('Pass 65 explosive crossbolt runtime integration', () => {
  it('uses the 3x speed constant and sticks to current-life player, remote, and bot targets', () => {
    const targetsStart = source.indexOf('function explosiveBoltTargets(');
    const targetsEnd = source.indexOf('\nfunction segmentSphereFraction(', targetsStart);
    const targets = source.slice(targetsStart, targetsEnd);
    expect(targets).toContain("kind: 'player'");
    expect(targets).toContain("kind: 'remote'");
    expect(targets).toContain("kind: 'bot'");

    const spawnStart = source.indexOf('function spawnExplosiveBolt(');
    const spawnEnd = source.indexOf('\nfunction disposeExplosiveBolt(', spawnStart);
    expect(source.slice(spawnStart, spawnEnd)).toContain('velocity: normalized.multiplyScalar(EXPLOSIVE_BOLT_SPEED_MPS)');

    const updateStart = source.indexOf('function updateExplosiveBolts(');
    const updateEnd = source.indexOf('\nfunction throwGrenade(', updateStart);
    const update = source.slice(updateStart, updateEnd);
    expect(update).toContain('bolt.targetId = targetHit.id;');
    expect(update).toContain('bolt.targetLifeId = targetHit.lifeId;');
    expect(update).toContain("if (targetHit.kind === 'player') addFeed('STUCK', 'coral');");
    expect(update).toContain("else if (bolt.ownerId === player.id) addFeed('STUCK', 'gold');");
    expect(update).toContain('candidate.id === bolt.targetId && candidate.lifeId === bolt.targetLifeId');
  });

  it('derives stuck radius and damage once from the shared exact 2x oracle', () => {
    const detonateStart = source.indexOf('function detonateExplosiveBoltEntity(');
    const detonateEnd = source.indexOf('\nfunction updateExplosiveBolts(', detonateStart);
    const detonate = source.slice(detonateStart, detonateEnd);
    expect(detonate).toContain("sealReceiverStickyDetonation({");
    expect(detonate).toContain("source: 'explosive-crossbow'");
    expect(detonate).toContain('const stuck = sealedAttachment !== null;');
    expect(detonate).toContain('const blastRadiusM = explosiveBoltBlastRadiusM(stuck);');
    expect(detonate).toContain('explosiveBoltBlastDamage(distance, stuck)');
    expect(detonate.match(/explosiveBoltBlastDamage\(/g)).toHaveLength(1);
    expect(detonate).toContain('EXPLOSIVE_BOLT_BLAST_MAX_DAMAGE * (stuck ? 2 : 1)');
  });
});
