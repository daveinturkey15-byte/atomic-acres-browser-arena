import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('Semtex live-stick runtime integration', () => {
  it('derives one live-actor stick state for world, local, self, and remote blast resolution', () => {
    expect(source).toContain('flashbangPresentation, semtexBlastDamage, semtexBlastRadiusM');
    const start = source.indexOf('function explodeGrenade(');
    const end = source.indexOf('\nfunction grenadeDetonatesOnFirstImpact(', start);
    const block = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain("const liveAttachedTarget = entity.grenade === 'semtex'");
    expect(block).toContain('target.id === entity.attachedTargetId && target.lifeId === entity.attachedTargetLifeId');
    expect(block).toContain("sealReceiverStickyDetonation({");
    expect(block).toContain("source: 'semtex'");
    expect(block).toContain('currentAttachmentTarget: { id: liveAttachedTarget.id, lifeId: liveAttachedTarget.lifeId }');
    expect(block).toContain("const semtexStuckToLiveActor = network.role === 'client'");
    expect(block).toContain(': sealedAttachment !== null;');
    expect(block).toContain('semtexBlastRadiusM(semtexStuckToLiveActor)');
    expect(block).toContain('semtexBlastDamage(distance, prone, semtexStuckToLiveActor)');
    expect(block).toContain("applyInteractiveWorldExplosion(point, blastRadius, entity.grenade === 'semtex' ? blastDamage(0) : 100)");
    expect(block).toContain('breakWindowsInGrenadeBlast(point, entity.actionNonce, entity.ownerKind === \'player\', blastRadius)');
    expect(block).toContain("...(semtexStuckToLiveActor ? { stuck: true as const } : {})");
  });

  it('does not multiply stuck Semtex damage a second time after the canonical oracle', () => {
    const start = source.indexOf('function explodeGrenade(');
    const end = source.indexOf('\nfunction grenadeDetonatesOnFirstImpact(', start);
    const block = source.slice(start, end);
    expect(block).not.toContain('damage *= 2');
    expect(block).not.toMatch(/blastDamage\([^\n]+\)\s*\*\s*\([^\n]+\?\s*2\s*:\s*1\)/);
    expect(block.match(/semtexBlastDamage\(/g)).toHaveLength(1);
  });
});
