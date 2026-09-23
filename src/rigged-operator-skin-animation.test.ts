import { describe, expect, it } from 'vitest';
import { RIGGED_OPERATOR_RUNTIME_ACTION_NAMES } from './operator-model';
import { OPERATOR_SKIN_SOURCES } from './operator-skin-catalog';
import {
  DEFAULT_OPERATOR_SKIN_ANIMATION_PROFILE,
  MAXIMUM_POSTURE_BIAS_RADIANS,
  OPERATOR_SKIN_ANIMATION_PROFILES,
  clampedPostureBias,
  operatorIdlePhase,
  resolveOperatorIdleClip,
  resolveOperatorSkinAnimationProfile,
  type OperatorSkinAnimationProfile,
} from './rigged-operator-skin-animation';

const ARCHETYPES = [...new Set(OPERATOR_SKIN_SOURCES.map((source) => source.archetype))].sort();

describe('catalog coverage', () => {
  it('carries exactly one profile per catalog archetype', () => {
    // Set equality in both directions: adding a skin without a movement identity
    // fails here rather than silently falling back to the standard operator.
    expect(Object.keys(OPERATOR_SKIN_ANIMATION_PROFILES).sort()).toEqual(ARCHETYPES);
  });

  it('resolves every selectable skin id to its archetype profile', () => {
    for (const source of OPERATOR_SKIN_SOURCES) {
      expect(resolveOperatorSkinAnimationProfile(source.id).archetype, source.id).toBe(source.archetype);
    }
  });

  it('falls back to the standard profile for an unknown skin', () => {
    expect(resolveOperatorSkinAnimationProfile('not-a-skin')).toBe(DEFAULT_OPERATOR_SKIN_ANIMATION_PROFILE);
    expect(resolveOperatorSkinAnimationProfile('')).toBe(DEFAULT_OPERATOR_SKIN_ANIMATION_PROFILE);
  });

  it('only ever prefers idles the runtime actually binds', () => {
    for (const profile of Object.values(OPERATOR_SKIN_ANIMATION_PROFILES)) {
      expect(profile.idleClipPreference.length).toBeGreaterThan(0);
      for (const clip of profile.idleClipPreference) {
        expect(RIGGED_OPERATOR_RUNTIME_ACTION_NAMES, `${profile.archetype}:${clip}`).toContain(clip);
      }
    }
  });
});

describe('the differentiation is real, not decorative', () => {
  const profiles = Object.values(OPERATOR_SKIN_ANIMATION_PROFILES);

  const distinct = (label: string, project: (profile: OperatorSkinAnimationProfile) => unknown): void => {
    it(`gives every archetype its own ${label}`, () => {
      const values = profiles.map((profile) => JSON.stringify(project(profile)));
      expect(new Set(values).size, values.join(' | ')).toBe(profiles.length);
    });
  };

  distinct('posture bias', (profile) => profile.posture);
  distinct('aim response', (profile) => profile.additive.aimResponseHz);
  distinct('breathing', (profile) => [profile.additive.breathHz, profile.additive.breathAmplitudeRadians]);
  distinct('hit reaction gain', (profile) => profile.hitReactionGain);
  distinct('transition scale', (profile) => profile.transitionScale);

  it('reads the plated archetype as heavy and the light one as quick', () => {
    const symbiote = OPERATOR_SKIN_ANIMATION_PROFILES.symbiote!;
    const explorer = OPERATOR_SKIN_ANIMATION_PROFILES.explorer!;
    expect(symbiote.hitReactionGain).toBeLessThan(explorer.hitReactionGain);
    expect(symbiote.additive.turnRateRadiansPerSecond).toBeLessThan(explorer.additive.turnRateRadiansPerSecond);
    expect(symbiote.transitionScale).toBeGreaterThan(explorer.transitionScale);
    expect(symbiote.posture.spinePitchRadians).toBeGreaterThan(explorer.posture.spinePitchRadians);
    expect(symbiote.locomotionPlaybackLimits.maximum).toBeLessThan(explorer.locomotionPlaybackLimits.maximum);
  });

  it('leaves the standard operator unbiased, so it stays the reference', () => {
    const standard = OPERATOR_SKIN_ANIMATION_PROFILES.standard!;
    expect(standard.posture).toEqual({
      spinePitchRadians: 0,
      chestPitchRadians: 0,
      headPitchRadians: 0,
      shoulderRollRadians: 0,
    });
    expect(standard.transitionScale).toBe(1);
    expect(standard.hitReactionGain).toBe(1);
  });

  it('keeps every authored posture inside the anatomical band', () => {
    for (const profile of profiles) {
      for (const [joint, value] of Object.entries(profile.posture)) {
        expect(Math.abs(value), `${profile.archetype}.${joint}`).toBeLessThanOrEqual(MAXIMUM_POSTURE_BIAS_RADIANS);
      }
      expect(clampedPostureBias(profile.posture)).toEqual(profile.posture);
    }
  });

  it('clamps a posture that would deform the rig', () => {
    const clamped = clampedPostureBias({
      spinePitchRadians: 9,
      chestPitchRadians: -9,
      headPitchRadians: Number.NaN,
      shoulderRollRadians: 0.01,
    });
    expect(clamped.spinePitchRadians).toBe(MAXIMUM_POSTURE_BIAS_RADIANS);
    expect(clamped.chestPitchRadians).toBe(-MAXIMUM_POSTURE_BIAS_RADIANS);
    expect(clamped.headPitchRadians).toBe(0);
    expect(clamped.shoulderRollRadians).toBe(0.01);
  });
});

describe('resolveOperatorIdleClip', () => {
  it('takes the first preference of the archetype that the mixer has bound', () => {
    const explorer = OPERATOR_SKIN_ANIMATION_PROFILES.explorer!;
    expect(resolveOperatorIdleClip(explorer, ['Idle_Gun_Pointing', 'Idle_Gun'])).toBe('Idle_Gun');
    const standard = OPERATOR_SKIN_ANIMATION_PROFILES.standard!;
    expect(resolveOperatorIdleClip(standard, ['Idle_Gun_Pointing', 'Idle_Gun'])).toBe('Idle_Gun_Pointing');
  });

  it('falls through the preference order when the first choice is unbound', () => {
    const explorer = OPERATOR_SKIN_ANIMATION_PROFILES.explorer!;
    expect(resolveOperatorIdleClip(explorer, ['Idle_Gun_Pointing'])).toBe('Idle_Gun_Pointing');
    expect(resolveOperatorIdleClip(explorer, ['Walk'])).toBeNull();
  });
});

describe('operatorIdlePhase', () => {
  it('is stable, bounded, and derived only from replicated identity', () => {
    for (const source of OPERATOR_SKIN_SOURCES) {
      const phase = operatorIdlePhase(source.id, 'bot-3');
      expect(phase, source.id).toBeGreaterThanOrEqual(0);
      expect(phase, source.id).toBeLessThan(1);
      expect(operatorIdlePhase(source.id, 'bot-3')).toBe(phase);
    }
  });

  it('separates operators so an archetype does not breathe in lockstep', () => {
    const phases = new Set(['bot-0', 'bot-1', 'bot-2', 'bot-3', 'bot-4', 'bot-5'].map(
      (name) => operatorIdlePhase('navalops', name),
    ));
    expect(phases.size).toBe(6);
  });

  it('separates archetypes wearing the same operator name', () => {
    const phases = new Set(OPERATOR_SKIN_SOURCES.map((source) => operatorIdlePhase(source.id, 'bot-1')));
    expect(phases.size).toBe(OPERATOR_SKIN_SOURCES.length);
  });
});
