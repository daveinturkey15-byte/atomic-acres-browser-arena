import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from './arena-identity';
import { arenaDeploymentBriefing, assertArenaDeploymentBriefingInventory } from './arena-deployment-briefing';

describe('arena deployment briefing', () => {
  it('covers every selectable arena', () => {
    expect(() => assertArenaDeploymentBriefingInventory()).not.toThrow();
    for (const arenaId of ARENA_IDS) expect(arenaDeploymentBriefing(arenaId).arenaId).toBe(arenaId);
  });

  it('gives the two HF-372 arenas real copy, not a placeholder', () => {
    for (const arenaId of ['farcrysis', 'high-seas'] as const) {
      const briefing = arenaDeploymentBriefing(arenaId);
      expect(briefing.briefing.length).toBeGreaterThan(40);
      expect(briefing.kicker.length).toBeGreaterThan(4);
      expect(briefing.approach.length).toBeGreaterThan(10);
      expect(briefing.briefing).not.toMatch(/pending|placeholder|standby|tbd|todo/i);
    }
  });

  it('never repeats one arena copy on another', () => {
    const kickers = ARENA_IDS.map((arenaId) => arenaDeploymentBriefing(arenaId).kicker);
    const briefings = ARENA_IDS.map((arenaId) => arenaDeploymentBriefing(arenaId).briefing);
    const approaches = ARENA_IDS.map((arenaId) => arenaDeploymentBriefing(arenaId).approach);
    expect(new Set(kickers).size).toBe(ARENA_IDS.length);
    expect(new Set(briefings).size).toBe(ARENA_IDS.length);
    expect(new Set(approaches).size).toBe(ARENA_IDS.length);
  });

  it('keeps the eyebrow and orientation lines upper case so the surface stays consistent', () => {
    for (const arenaId of ARENA_IDS) {
      const briefing = arenaDeploymentBriefing(arenaId);
      expect(briefing.kicker).toBe(briefing.kicker.toUpperCase());
      expect(briefing.approach).toBe(briefing.approach.toUpperCase());
      // A sentence, not a shout: the briefing line sits at body size.
      expect(briefing.briefing).not.toBe(briefing.briefing.toUpperCase());
    }
  });
});
