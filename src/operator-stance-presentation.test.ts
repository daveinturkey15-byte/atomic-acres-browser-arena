/**
 * HF-382 - the IDLE STANCE selector must change something a player can SEE.
 *
 * The menu already persisted the choice and re-rendered card state, but no
 * animation consumer ever read it: the turntable kept playing whatever idle the
 * skin profile preferred and the first-person arms never moved. These tests pin
 * the NEW behaviour:
 *   1. the stance drives which authored idle clip the third-person operator
 *      plays, cross-faded (never a hard pop), through the real director output;
 *   2. each stance has a distinct, bounded first-person presentation profile;
 *   3. the live preview module actually binds the stance cards.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  advanceOperatorAnimation,
  createOperatorAnimationDirector,
  type OperatorAnimationInput,
} from './rigged-operator-animation-director';
import {
  FIRST_PERSON_STANCE_PRESENTATIONS,
  OPERATOR_STANCE_STORAGE_KEY,
  activeOperatorStance,
  resetOperatorStanceForTest,
  setActiveOperatorStance,
} from './operator-stance-runtime';
import {
  DEFAULT_OPERATOR_STANCE,
  OPERATOR_STANCES,
  operatorStance,
} from './operator-appearance-catalog';
import {
  OPERATOR_STANCE_IDLE_FADE_SECONDS,
  RIGGED_OPERATOR_RUNTIME_ACTION_NAMES,
  applyOperatorStanceIdlePreference,
  rootOperatorStancePreference,
} from './operator-model';

const AVAILABLE = new Set<string>(RIGGED_OPERATOR_RUNTIME_ACTION_NAMES);

function stillInput(): OperatorAnimationInput {
  return {
    deltaSeconds: 1 / 60,
    forwardMps: 0,
    strafeMps: 0,
    aimPitchRadians: 0,
    yawErrorRadians: 0,
    dead: false,
    armed: true,
    availableClips: [...AVAILABLE],
  };
}

interface FadeState {
  clipName: string | null;
  fadeFrom: string | null;
  fadeSeconds: number;
}

function fadeState(): FadeState {
  return { clipName: null, fadeFrom: null, fadeSeconds: 0 };
}

function heaviestIdleClip(animation: ReturnType<typeof advanceOperatorAnimation>): string | null {
  const idle = animation.layers
    .filter((layer) => ['Idle_Gun_Pointing', 'Idle_Gun', 'Idle_Gun_Shoot'].includes(layer.clip))
    .sort((left, right) => right.weight - left.weight);
  return idle[0]?.clip ?? null;
}

describe('first-person stance presentations (HF-382)', () => {
  it('keeps Weapon Ready as the untouched shipped baseline', () => {
    for (const value of Object.values(FIRST_PERSON_STANCE_PRESENTATIONS.ready)) {
      expect(value).toBe(0);
    }
  });

  it('gives every catalog stance a distinct, visibly different presentation', () => {
    expect(new Set(OPERATOR_STANCES.map((stance) => stance.id)).size).toBe(3);
    // Low Carry must read lower and more muzzle-down than both others.
    const low = FIRST_PERSON_STANCE_PRESENTATIONS.low;
    const ready = FIRST_PERSON_STANCE_PRESENTATIONS.ready;
    const alert = FIRST_PERSON_STANCE_PRESENTATIONS.alert;
    expect(low.dropMeters).toBeGreaterThan(alert.dropMeters + 0.02);
    expect(low.pitchRadians).toBeLessThan(ready.pitchRadians - 0.05);
    expect(alert.pitchRadians).toBeGreaterThan(low.pitchRadians + 0.15);
    // Every offset stays small enough that no stance can hide an enemy behind
    // the viewmodel or push the weapon into the near plane.
    for (const presentation of Object.values(FIRST_PERSON_STANCE_PRESENTATIONS)) {
      expect(Math.abs(presentation.dropMeters)).toBeLessThanOrEqual(0.08);
      expect(Math.abs(presentation.pitchRadians)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(presentation.yawRadians)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(presentation.rollRadians)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(presentation.lateralMeters)).toBeLessThanOrEqual(0.03);
    }
  });
});

describe('active stance store (HF-382)', () => {
  it('defaults to the catalog default and rejects off-catalog ids', () => {
    resetOperatorStanceForTest();
    expect(activeOperatorStance()).toBe(DEFAULT_OPERATOR_STANCE);
    expect(setActiveOperatorStance('sprinting')).toBe(false);
    expect(activeOperatorStance()).toBe(DEFAULT_OPERATOR_STANCE);
    expect(setActiveOperatorStance('low')).toBe(true);
    expect(activeOperatorStance()).toBe('low');
  });

  it('mirrors the exact storage key the menu persists under', () => {
    expect(OPERATOR_STANCE_STORAGE_KEY).toBe('atomic-acres-operator-stance');
  });
});

describe('third-person stance-driven idle (HF-382)', () => {
  it('plays the selected stance idle instead of the skin default', () => {
    const director = createOperatorAnimationDirector('default', 'hf382-low');
    let animation = advanceOperatorAnimation(director, stillInput());
    const state = fadeState();
    for (let frame = 0; frame < 30; frame += 1) {
      animation = applyOperatorStanceIdlePreference(
        advanceOperatorAnimation(director, stillInput()),
        AVAILABLE,
        'low',
        state,
        1 / 60,
      );
    }
    expect(heaviestIdleClip(animation)).toBe(operatorStance('low').clipName);
    // The mixer is only ever handed clips it has bound.
    for (const layer of animation.layers) expect(AVAILABLE.has(layer.clip)).toBe(true);
  });

  it('cross-fades between stances instead of popping the pose', () => {
    const director = createOperatorAnimationDirector('default', 'hf382-crossfade');
    const state = fadeState();
    let animation = advanceOperatorAnimation(director, stillInput());
    for (let frame = 0; frame < 30; frame += 1) {
      animation = applyOperatorStanceIdlePreference(
        advanceOperatorAnimation(director, stillInput()),
        AVAILABLE,
        'low',
        state,
        1 / 60,
      );
    }
    expect(heaviestIdleClip(animation)).toBe('Idle_Gun');
    // Switch stance: on the FIRST frame after the switch the outgoing clip must
    // still carry weight - a released-and-restarted action reads as a snap.
    animation = applyOperatorStanceIdlePreference(
      advanceOperatorAnimation(director, stillInput()),
      AVAILABLE,
      'alert',
      state,
      1 / 60,
    );
    const outgoing = animation.layers.find((layer) => layer.clip === 'Idle_Gun');
    const incoming = animation.layers.find((layer) => layer.clip === 'Idle_Gun_Shoot');
    expect(outgoing?.weight ?? 0).toBeGreaterThan(0);
    expect(incoming?.weight ?? 0).toBeGreaterThan(0);
    // ...and it converges inside the declared fade window plus one frame.
    const frames = Math.ceil(OPERATOR_STANCE_IDLE_FADE_SECONDS / (1 / 60)) + 2;
    for (let frame = 0; frame < frames; frame += 1) {
      animation = applyOperatorStanceIdlePreference(
        advanceOperatorAnimation(director, stillInput()),
        AVAILABLE,
        'alert',
        state,
        1 / 60,
      );
    }
    expect(heaviestIdleClip(animation)).toBe(operatorStance('alert').clipName);
    expect(animation.layers.some((layer) => layer.clip === 'Idle_Gun')).toBe(false);
  });

  it('keeps base weights summing to one while the stance blend runs', () => {
    const director = createOperatorAnimationDirector('default', 'hf382-weights');
    const state = fadeState();
    let stance: 'ready' | 'low' | 'alert' = 'ready';
    for (let frame = 0; frame < 120; frame += 1) {
      if (frame === 20) stance = 'low';
      if (frame === 70) stance = 'alert';
      const animation = applyOperatorStanceIdlePreference(
        advanceOperatorAnimation(director, stillInput()),
        AVAILABLE,
        stance,
        state,
        1 / 60,
      );
      const total = animation.layers.reduce((sum, layer) => sum + layer.weight, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it('leaves death alone: a corpse does not change stance', () => {
    const director = createOperatorAnimationDirector('default', 'hf382-death');
    const dead: OperatorAnimationInput = { ...stillInput(), dead: true };
    let animation = advanceOperatorAnimation(director, dead);
    const state = fadeState();
    for (let frame = 0; frame < 40; frame += 1) {
      animation = applyOperatorStanceIdlePreference(
        advanceOperatorAnimation(director, dead),
        AVAILABLE,
        'low',
        state,
        1 / 60,
      );
    }
    expect(animation.state).toBe('death');
    expect(animation.layers.map((layer) => layer.clip)).toEqual(['Death']);
  });
});

describe('root stance preference channel', () => {
  it('reads a validated userData selection and rejects anything else', () => {
    const root = new THREE.Group();
    expect(rootOperatorStancePreference(root)).toBe(null);
    root.userData.operatorStanceId = 'alert';
    expect(rootOperatorStancePreference(root)).toBe('alert');
    root.userData.operatorStanceId = 'crouch-prone';
    expect(rootOperatorStancePreference(root)).toBe(null);
    delete root.userData.operatorStanceId;
  });
});

describe('the live preview binds the stance selector', () => {
  const source = readFileSync(new URL('./ui/operator-preview.ts', import.meta.url), 'utf8');

  it('listens for stance-card presses and publishes them to the active store', () => {
    expect(source).toContain("'[data-operator-skin], [data-operator-stance]'");
    expect(source).toContain('setActiveOperatorStance(');
    expect(source).toContain('userData.operatorStanceId');
  });

  it('bumps the preview contract so stale diagnostics cannot claim v1 behaviour', () => {
    expect(source).toContain("OPERATOR_PREVIEW_CONTRACT = 'live-turntable-selected-skin-stance-v2'");
  });
});

describe('the match shell publishes stance selections to the live arms store (HF-388)', () => {
  const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  it('the OPERATOR stance card handler persists AND publishes the choice', () => {
    const persistIndex = source.indexOf('persistOperatorPreference(OPERATOR_STANCE_STORAGE_KEY');
    expect(persistIndex).toBeGreaterThan(-1);
    // The publish must sit in the SAME handler branch as the localStorage
    // write. A setActiveOperatorStance call anywhere else still leaves this
    // click path writing storage while the cached active stance goes stale,
    // which is exactly the until-a-reload bug HF-382 shipped.
    const handlerWindow = source.slice(persistIndex, persistIndex + 600);
    expect(handlerWindow).toContain('setActiveOperatorStance(stance)');
  });

  // ---------------------------------------------------------------------------
  // HF-382 replication. The panel says "Your squad sees every choice here"; the
  // stance was the one choice they never saw. These pin the full path: publish
  // on click, host-validate, carry at join, land on remote roots, refresh live.
  it('replicates the stance choice through the lobby exactly like the skin', () => {
    const legacyMain = readFileSync('src/legacy-main.ts', 'utf8');
    // Publish from the click branch, both roles, beside the local store update.
    const clickBranch = legacyMain.slice(legacyMain.indexOf('setActiveOperatorStance(stance);'));
    expect(clickBranch).toContain("{ type: 'lobby-stance', by: player.id, stanceId: stance, nonce: randomNonce() }");
    expect(clickBranch).toContain("if (network.role === 'host') updateHostStance(stanceMessage);");
    expect(clickBranch).toContain("else if (network.role === 'client') network.send(stanceMessage);");
    // Host validates and rebroadcasts, then refreshes every live rig.
    expect(legacyMain).toContain('function updateHostStance(message: LobbyStanceMessage): void');
    expect(legacyMain).toContain("hostLobbyMembers.set(message.by, { ...member, stanceId: message.stanceId });");
    expect(legacyMain).toContain('syncRemoteOperatorStances();');
    // Join carries it; the host only accepts a catalog stance.
    expect(legacyMain).toContain('stanceId: localOperatorStanceId, // HF-382');
    expect(legacyMain).toContain('...(isOperatorStanceId(message.stanceId) ? { stanceId: message.stanceId } : {}),');
    // Remote rigs read it on the SAME root channel updateRiggedOperator consumes.
    expect(legacyMain).toContain('root.userData.operatorStanceId = memberOperatorStanceId(snapshot.id);');
    expect(legacyMain).toContain("remote.root.userData.operatorStanceId = memberOperatorStanceId(id);");
  });

  it('validates the lobby-stance message and member field against the catalog', () => {
    const protocol = readFileSync('src/protocol.ts', 'utf8');
    expect(protocol).toContain("export type LobbyStanceMessage = { type: 'lobby-stance'; by: string; stanceId: string; nonce: number };");
    expect(protocol).toContain("case 'lobby-stance':");
    expect(protocol).toContain('isOperatorStanceId(msg.stanceId) && Number.isFinite(msg.nonce)');
    const privateMatch = readFileSync('src/private-match.ts', 'utf8');
    expect(privateMatch).toContain('(member.stanceId === undefined || isOperatorStanceId(member.stanceId))');
  });
});

