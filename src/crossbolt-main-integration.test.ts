import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('Pass 65 explosive crossbolt runtime integration', () => {
  it('uses the 3x speed constant and sticks to current-life player, remote, and bot targets', () => {
    const targetsStart = source.indexOf('function fillExplosiveBoltTargets(');
    const targetsEnd = source.indexOf('\nfunction segmentSphereFraction(', targetsStart);
    const targets = source.slice(targetsStart, targetsEnd);
    expect(targets).toContain("localContinuity, 'player', player.position, -0.62");
    expect(targets).toContain("remote.continuity, 'remote', remote.target, 1");
    expect(targets).toContain("bot.continuity, 'bot', bot.position, 1");
    expect(targets.indexOf("'player'")).toBeLessThan(targets.indexOf("'remote'"));
    expect(targets.indexOf("'remote'")).toBeLessThan(targets.indexOf("'bot'"));
    expect(targets).toContain('player.id !== ownerId && player.alive');
    expect(targets).toContain('remote.snapshot.id === ownerId || remote.snapshot.hp <= 0');
    expect(targets).toContain('bot.id === ownerId || !bot.alive');
    expect(targets.match(/areCombatantsHostile\(/g)).toHaveLength(3);
    expect(targets).toContain('explosiveBoltTargetBuffer.reset();');
    expect(targets).not.toContain('const targets:');
    expect(targets).not.toContain('.clone()');
    expect(targets).not.toContain('new THREE.Vector3');
    expect(targets).not.toContain('.map(');
    expect(targets).not.toContain('.filter(');

    const spawnStart = source.indexOf('function spawnExplosiveBolt(');
    const spawnEnd = source.indexOf('\nfunction disposeExplosiveBolt(', spawnStart);
    expect(source.slice(spawnStart, spawnEnd)).toContain('velocity: normalized.multiplyScalar(EXPLOSIVE_BOLT_SPEED_MPS)');

    const updateStart = source.indexOf('function updateExplosiveBolts(');
    const updateEnd = source.indexOf('\nfunction throwGrenade(', updateStart);
    const update = source.slice(updateStart, updateEnd);
    expect(update).toContain('explosiveBoltStartScratch.copy(bolt.mesh.position)');
    expect(update).toContain('explosiveBoltDeltaScratch.copy(bolt.velocity).multiplyScalar(dt)');
    expect(update).not.toContain('bolt.mesh.position.clone()');
    expect(update).not.toContain('bolt.velocity.clone()');
    expect(update).toContain('const targetHitId = targetHit.id;');
    expect(update).toContain('const targetHitLifeId = targetHit.lifeId;');
    expect(update).toContain('bolt.targetId = targetHitId;');
    expect(update).toContain('bolt.targetLifeId = targetHitLifeId;');
    expect(update).toContain('if (targetHitId === player.id) {');
    expect(update).toContain("'explosive-crossbow', 'victim', targetHitId, targetHitLifeId, bolt.actionNonce, now,");
    expect(update).toContain("'explosive-crossbow', 'attacker', targetHitId, targetHitLifeId, bolt.actionNonce, now,");
    expect(update).toContain("addFeed('STUCK', 'coral');");
    expect(update).toContain('else if (bolt.ownerId === player.id) {');
    expect(update).toContain("addFeed('STUCK', 'gold');");
    expect(update).toContain('explosiveBoltTargetBuffer.findIndex(bolt.targetId, bolt.targetLifeId)');
    expect(update).toContain('let targetHitIndex = -1;');
    expect(update).not.toContain('let targetHit:');
    const attachmentWrite = update.indexOf('recordReceiverStickyAttachment({');
    expect(attachmentWrite).toBeGreaterThan(update.indexOf('const targetHitLifeId = targetHit.lifeId;'));
    expect(update.slice(attachmentWrite)).not.toContain('targetHit.');

    const segmentStart = source.indexOf('function segmentSphereFraction(');
    const segmentEnd = source.indexOf('\nfunction createExplosiveBoltMesh(', segmentStart);
    const segment = source.slice(segmentStart, segmentEnd);
    expect(segment).not.toContain('.clone()');
    expect(segment).not.toContain('new THREE.Vector3');
    expect(segment).toContain('nearestX * nearestX + nearestY * nearestY + nearestZ * nearestZ');
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
    expect(detonate.match(/fillExplosiveBoltTargets\(/g)).toHaveLength(2);
    expect(detonate).toContain('const targetId = target.id;');
    expect(detonate).toContain('const targetLifeId = target.lifeId;');
    expect(detonate).toContain('const targetKind = target.kind;');
    expect(detonate).toContain('const targetX = target.position.x;');
    expect(detonate).toContain('const targetY = target.position.y;');
    expect(detonate).toContain('const targetZ = target.position.z;');
    const firstDamageCall = detonate.indexOf('applyExplosiveBoltTargetDamage(');
    expect(firstDamageCall).toBeGreaterThan(detonate.indexOf('const targetZ = target.position.z;'));
    expect(detonate.slice(firstDamageCall)).not.toContain('origin.distanceTo(target.position)');

    const damageStart = source.indexOf('function applyExplosiveBoltTargetDamage(');
    const damage = source.slice(damageStart, detonateStart);
    expect(damage).toContain('targetId: string');
    expect(damage).toContain('targetKind: ExplosiveBoltTargetKind');
    expect(damage).toContain('targetX: number');
    expect(damage).toContain('targetY: number');
    expect(damage).toContain('targetZ: number');
    expect(damage).not.toContain('target: ExplosiveBoltTarget');
    expect(damage).not.toMatch(/\btarget\./);
  });

  it('prewarms a bounded shared-resource bolt pool instead of allocating GPU resources during fire', () => {
    expect(source).toContain('const EXPLOSIVE_BOLT_PRESENTATION_POOL_CAPACITY = 32;');
    expect(source).toContain('await renderRuntime.compileAndRender(explosiveBoltPresentationRoot, camera, scene);');
    expect(source).toContain('const mesh = acquireExplosiveBoltMesh();');
    expect(source).toContain("entity.mesh.userData.presentationPoolInUse = false;");
    const createStart = source.indexOf('function createExplosiveBoltMesh(');
    const createEnd = source.indexOf('\nasync function prewarmExplosiveBoltPresentation(', createStart);
    const create = source.slice(createStart, createEnd);
    expect(create).toContain('explosiveBoltShaftGeometry');
    expect(create).toContain('explosiveBoltTipGeometry');
    expect(create).not.toContain('new THREE.CylinderGeometry');
    expect(create).not.toContain('new THREE.ConeGeometry');
    expect(create).not.toContain('new THREE.MeshStandardMaterial');
    expect(create).not.toContain('new THREE.MeshBasicMaterial');
  });
});
