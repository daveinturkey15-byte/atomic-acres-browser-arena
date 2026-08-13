import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PASS71_HF308_ARENAS,
  PASS71_HF308_CHOPPER_MISSILE_DESCRIPTOR,
  PASS71_HF308_CHOPPER_MISSILE_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF308_MACHINE_HOSTNAME_SHA256,
  PASS71_HF308_POLICY,
  PASS71_HF308_SCOPES,
  PASS71_HF308_TOOLING_PATHS,
  createPass71Hf308EvidenceFixture,
  pass71Hf308EvidenceFailures,
} from '../scripts/qa/pass71-hf308-chopper-missile-evidence-contract.mjs';
import {
  CHOPPER_MISSILE_AUTHORITY_EVIDENCE_CONTRACT,
  CHOPPER_MISSILE_CADENCE_MS,
  CHOPPER_MISSILE_CAPACITY,
  CHOPPER_MISSILE_FLIGHT_MS,
  CHOPPER_MISSILE_SOCKET_LOCAL_M,
} from './killstreak-runtime';
import { ARENA_SELECTIONS } from './map-selection';

const runtime = readFileSync(new URL('./killstreak-runtime.ts', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('./killstreak-presentation.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const network = readFileSync(new URL('./network.ts', import.meta.url), 'utf8');
const nativeEvidence = readFileSync(new URL('../tests/e2e/pass71-hf308-chopper-missile.spec.ts', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../scripts/qa/run-pass71-hf308-chopper-missile-evidence.mjs', import.meta.url), 'utf8');

describe('Pass 71 HF-308 Chopper Gunner missile full-closing evidence', () => {
  it('binds every admitted launch and impact to exact owner life epoch sequence aircraft socket target and trajectory identities', () => {
    expect(CHOPPER_MISSILE_AUTHORITY_EVIDENCE_CONTRACT).toBe(PASS71_HF308_POLICY.authorityContract);
    expect(CHOPPER_MISSILE_SOCKET_LOCAL_M).toEqual(PASS71_HF308_POLICY.socketLocal);
    for (const field of [
      'aircraftId', 'activationId', 'activationSequence', 'ownerId', 'ownerLifeId',
      'controlSequence', 'socketSide', 'socketLocal', 'sourcePosition', 'sourceAttitude',
      'launchPosition', 'targetId', 'targetLifeId', 'targetKind', 'targetPosition',
      'impactPosition', 'trajectoryId', 'impactId',
    ]) expect(runtime).toContain(field);
    expect(runtime).toContain('chopperMissileAuthorityEvidence()');
    expect(runtime).toContain('this.retainChopperMissileAuthorityEvent({');
    expect(network).toContain('impacts: Object.freeze(message.impacts.map((impact)');
    expect(main).toContain('retainRecentKillstreakImpactEvents(admission.impacts)');
  });

  it('preserves canonical six-ammo authority at no less than the 1000 ms cadence without queued cooldown or seventh launches', () => {
    expect(CHOPPER_MISSILE_CAPACITY).toBe(6);
    expect(CHOPPER_MISSILE_CADENCE_MS).toBe(1_000);
    expect(CHOPPER_MISSILE_FLIGHT_MS).toBe(780);
    expect(runtime).toContain('entity.missilesRemaining > 0');
    expect(runtime).toContain('nowMs >= entity.nextMissileAtMs');
    expect(runtime).toContain('entity.nextMissileAtMs = nowMs + CHOPPER_MISSILE_CADENCE_MS');
    expect(runtime).toContain('Missile fire is an edge request, never a held-state latch.');
    expect(nativeEvidence).toContain("host.mouse.down({ button: 'right' })");
    expect(nativeEvidence).toContain('seventhLaunchObserved: false');
  });

  it('clears pending missile control and presentation on exit death match end and rematch', () => {
    expect(runtime).toContain('entity.pendingPlayerMissile = null');
    expect(runtime).toContain('this.chopperMissileAuthorityEvents.length = 0');
    expect(main).toContain('releaseDebugChopperMissileEvidenceFrame()');
    expect(main).toContain('killstreakPresentation.clear()');
    expect(nativeEvidence).toContain('possessionAfterExit');
    expect(nativeEvidence).toContain('possessionAfterDeath');
    expect(nativeEvidence).toContain("await host.locator('#rematch').click()");
  });

  it('requires lossless same-completed-frame visible-versus-exact-shell-hidden attribution without sky spawn or detached trail', () => {
    expect(presentation).toContain('chopperMissileShellRoot(activationId: string, ordinal: number)');
    expect(presentation).toContain('distanceFromTrajectoryM');
    expect(main).toContain('freezeDebugChopperMissileEvidenceFrame');
    expect(main).toContain('captureDebugChopperMissileHiddenControl');
    expect(main).toContain('allOtherMissileRootVisibilitiesPreserved: true');
    expect(nativeEvidence).toContain("key: 'visible'");
    expect(nativeEvidence).toContain("key: 'hidden-control'");
    expect(nativeEvidence).toContain('PASS71_HF308_POLICY.rasterRoiWidth');
    expect(runner).toContain('PASS71_HF308_POLICY.maximumEncodedRecordBytes');
  });

  it('covers the exact cross product of every support-enabled arena renderer and offline or owned hosted mode', () => {
    expect(PASS71_HF308_MACHINE_HOSTNAME_SHA256).toMatch(/^[a-f0-9]{64}$/u);
    expect(runner).toContain("hostname().toLowerCase()");
    expect(runner).toContain('hostnameSha256 !== PASS71_HF308_MACHINE_HOSTNAME_SHA256');
    expect(PASS71_HF308_CHOPPER_MISSILE_DESCRIPTOR).toEqual({
      evidenceId: 'HF-308',
      kind: 'pass71-hf308-chopper-missile-full-closure',
      minimumCount: 0,
      maximumCount: 1,
    });
    expect(PASS71_HF308_CHOPPER_MISSILE_EVIDENCE_REGISTRY_ENTRY).toMatchObject({
      descriptor: PASS71_HF308_CHOPPER_MISSILE_DESCRIPTOR,
      closesFeedback: true,
      ownerSubjectiveApproval: 'not-claimed',
    });
    expect(PASS71_HF308_ARENAS).toEqual(ARENA_SELECTIONS.filter(({ fieldSupport }) => fieldSupport).map(({ id }) => id));
    expect(PASS71_HF308_SCOPES).toEqual(PASS71_HF308_ARENAS.flatMap((arena) => (
      ['webgl2', 'webgpu'].flatMap((renderer) => ['offline', 'hosted'].map((mode) => ({ arena, renderer, mode })))
    )));
    expect(PASS71_HF308_SCOPES).toHaveLength(16);
    expect(PASS71_HF308_TOOLING_PATHS).toEqual(expect.arrayContaining([
      'tests/e2e/pass71-hf308-chopper-missile.spec.ts',
      'scripts/qa/pass71-hf308-chopper-missile-evidence-contract.mjs',
      'scripts/qa/pass71-hf308-chopper-missile-evidence-contract.d.mts',
      'scripts/qa/pass71-hf308-chopper-missile-evidence-contract.test.mjs',
      'scripts/qa/run-pass71-hf308-chopper-missile-evidence.mjs',
    ]));
    const record = createPass71Hf308EvidenceFixture() as Record<string, any>;
    expect(pass71Hf308EvidenceFailures(record, {
      sourceSha: record.source.expectedSourceSha,
      sourceTreeSha: record.source.sourceTreeSha,
      tooling: record.tooling,
    })).toEqual([]);
  });
});
