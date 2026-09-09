import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import * as THREE from 'three';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { GRENADE_IDS, type GrenadeId } from './combat/grenade-catalog';
import { semtexBlastDamage, semtexBlastRadiusM } from './combat/pass65-ordnance-contract';
import { GRENADE_RADIUS, grenadeDamage } from './gameplay';
import { grenadeSmokeRadiusM } from './grenade-smoke-policy';
import { SmokeAuthority, SMOKE_VOLUME_RADIUS_M } from './smoke-authority';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('legacy-main.ts', source, ts.ScriptTarget.Latest, true);
const production = ['spawnSmokeVolume', 'explodeGrenade'].map((name) => {
  const matches = ast.statements.filter((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === name);
  expect(matches).toHaveLength(1);
  return matches[0].getText(ast);
}).join('\n');
const executable = ts.transpileModule(production, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

// Actual production control flow and SmokeAuthority, with renderer/audio/network
// collaborators spied. Not a trajectory, real DOM, GPU or WebRTC integration test.
function fixture(role: 'host' | 'client' | 'offline') {
  const smokeAuthority = new SmokeAuthority(9, role === 'client' ? 'replica' : 'host');
  const noop = () => {};
  const c: vm.Context = {
    THREE, network: { role }, smokeAuthority, interactiveWorldMatchEpoch: 9,
    SMOKE_VOLUME_RADIUS_M, grenadeSmokeRadiusM, currentHostTimeMs: () => 1000,
    performance: { now: () => 50 }, player: { id: 'local', position: new THREE.Vector3(50, 0, 0), stance: 'stand', alive: true },
    synchronizeSmokePresentation: vi.fn(), broadcastSmokeState: vi.fn(),
    releaseGrenadeWorldPresentation: noop, releaseBotGrenadeOwner: noop,
    audio: { coverImpact: vi.fn(), explosion: vi.fn() }, spawnImpactFlash: vi.fn(), applyFlashGrenade: vi.fn(),
    spawnGrenadeExplosionVisual: vi.fn(), cameraShakeTrauma: {}, cameraShakeState: {}, hudImpactState: {},
    addCameraShakeTrauma: noop, addCameraShakeImpulse: noop, pushHudImpact: noop,
    impactKindForShakeSource: () => 'explosion', sourceScreenAngle: () => 0,
    accessibilityRuntime: { weaponMotionScale: 1 }, semtexBlastDamage, semtexBlastRadiusM, GRENADE_RADIUS, grenadeDamage,
    breakWindowsInGrenadeBlast: vi.fn(), applyInteractiveWorldExplosion: vi.fn(),
    bots: new Map(), remotes: new Map(), activeWorldColliders: () => [],
    outgoingDamage: (n: number) => n, botCombatDamage: (n: number) => n,
    applyBotDamage: vi.fn(), applyDamage: vi.fn(), sendAuthoritativeHit: vi.fn(),
    lastGrenadeExplosionProfile: null, lastBotGrenadeDamage: 0,
  };
  vm.createContext(c); vm.runInContext(executable, c, { timeout: 1000 });
  const detonate = (grenade: GrenadeId, ownerKind: 'player' | 'remote' | 'bot', actionNonce = 12) => {
    c.explodeGrenade({ grenade, ownerKind, ownerId: `${ownerKind}-actor`, ownerTeam: 1,
      actionNonce, ownerLifeId: 1, attachedTargetId: null, attachedTargetLifeId: null,
      mesh: { position: new THREE.Vector3(0, 0, 0) } });
  };
  return { c, smokeAuthority, detonate };
}

describe('HF563/564 actual grenade detonation smoke wiring', () => {
  it('preserves the exact f83acdd8 explosion damage and visual tail', () => {
    // Audited before edits: all damage/LOS/window/sticky/team handling below
    // this marker is byte-identical. Smoke registration belongs above it.
    const tail = production.slice(production.indexOf('audio.explosion(afterPresentationDetach);'));
    expect(createHash('sha256').update(tail).digest('hex'))
      .toBe('3413cabb8f32dc7db2cf6764ec39b7454f8a00335099c4441b851d91ed63dac3');
  });
  it.each(['player', 'remote', 'bot'] as const)('host owns residue from %s grenades, including admitted guests', (owner) => {
    for (const grenade of ['frag', 'semtex'] as const) {
      const { c, smokeAuthority, detonate } = fixture('host'); detonate(grenade, owner);
      const volumes = smokeAuthority.snapshot(1000).volumes;
      expect(volumes).toHaveLength(1);
      expect(volumes[0].radiusM).toBeCloseTo(4.2 / Math.sqrt(2), 12);
      expect(volumes[0].startsAtMs).toBe(1000);
      expect(volumes[0].ownerId).toBe(`${owner}-actor`);
      expect(c.broadcastSmokeState).toHaveBeenCalledExactlyOnceWith(true, 1000);
      expect(c.synchronizeSmokePresentation).toHaveBeenCalledTimes(1);
    }
  });
  it.each(['player', 'remote', 'bot'] as const)('client cannot author volumes for any %s grenade', (owner) => {
    for (const grenade of GRENADE_IDS) {
      const { c, smokeAuthority, detonate } = fixture('client'); detonate(grenade, owner);
      expect(smokeAuthority.snapshot(1000).volumes).toHaveLength(0);
      expect(c.broadcastSmokeState).not.toHaveBeenCalled();
      expect(c.synchronizeSmokePresentation).not.toHaveBeenCalled();
    }
  });
  it('ordinary smoke is exactly one full cloud, not full plus residue', () => {
    const { c, smokeAuthority, detonate } = fixture('host'); detonate('smoke', 'remote');
    const volumes = smokeAuthority.snapshot(1000).volumes;
    expect(volumes).toHaveLength(1); expect(volumes[0].radiusM).toBeCloseTo(4.2 * Math.sqrt(3), 12);
    expect(c.broadcastSmokeState).toHaveBeenCalledTimes(1);
    expect(c.spawnGrenadeExplosionVisual).not.toHaveBeenCalled();
  });
  it('flash remains utility-only with no residue', () => {
    const { c, smokeAuthority, detonate } = fixture('host'); detonate('flash', 'remote');
    expect(smokeAuthority.snapshot(1000).volumes).toHaveLength(0);
    expect(c.applyFlashGrenade).toHaveBeenCalledTimes(1); expect(c.broadcastSmokeState).not.toHaveBeenCalled();
  });
  it('offline uses the same radius and an active duplicate cannot add or extend residue', () => {
    const { c, smokeAuthority, detonate } = fixture('offline'); detonate('frag', 'player');
    const first = smokeAuthority.snapshot(1000); detonate('frag', 'player');
    expect(first.volumes).toHaveLength(1); expect(first.volumes[0].radiusM).toBeCloseTo(4.2 / Math.sqrt(2), 12);
    expect(smokeAuthority.snapshot(1000)).toEqual(first); expect(c.broadcastSmokeState).toHaveBeenCalledTimes(1);
  });
  it('failed source registration has no presentation or network side effects', () => {
    const { c, smokeAuthority } = fixture('host');
    expect(c.spawnSmokeVolume(new THREE.Vector3(), 1000, 1, 'invalid actor')).toBeNull();
    expect(smokeAuthority.snapshot(1000).volumes).toHaveLength(0);
    expect(c.broadcastSmokeState).not.toHaveBeenCalled(); expect(c.synchronizeSmokePresentation).not.toHaveBeenCalled();
  });
});
