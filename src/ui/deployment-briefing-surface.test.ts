import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from '../arena-identity';
import { arenaDeploymentBriefing } from '../arena-deployment-briefing';
import { applyDeploymentBriefing, deploymentBriefingCopy } from './deployment-briefing-surface';

const RELEASE_KICKER = 'PASS 77 // DEPLOYMENT STREAM';

function targets() {
  return {
    kicker: { textContent: null as string | null },
    title: { textContent: null as string | null },
    status: { textContent: null as string | null },
  };
}

describe('deployment briefing surface (HF-372)', () => {
  it('replaces the generic loading sentence on every arena', () => {
    for (const arenaId of ARENA_IDS) {
      const copy = deploymentBriefingCopy(arenaId, 'Whatever', RELEASE_KICKER);
      expect(copy.status).not.toMatch(/authoritative arena state/i);
      expect(copy.status).toContain(arenaDeploymentBriefing(arenaId).briefing);
      expect(copy.status).toContain(arenaDeploymentBriefing(arenaId).approach);
    }
  });

  it('gives each arena a distinct loading surface, not one template', () => {
    const statuses = ARENA_IDS.map((arenaId) => deploymentBriefingCopy(arenaId, 'X', RELEASE_KICKER).status);
    expect(new Set(statuses).size).toBe(ARENA_IDS.length);
  });

  it('keeps the release identity in the kicker and adds what the map is', () => {
    const copy = deploymentBriefingCopy('farcrysis', 'Farcrysis', RELEASE_KICKER);
    expect(copy.kicker.startsWith(RELEASE_KICKER)).toBe(true);
    expect(copy.kicker).toContain(arenaDeploymentBriefing('farcrysis').kicker);
  });

  it('uppercases the title the way the console already presented it', () => {
    expect(deploymentBriefingCopy('high-seas', 'High Seas', RELEASE_KICKER).title).toBe('HIGH SEAS');
  });

  it('writes exactly the three console elements it owns', () => {
    const console_ = targets();
    const copy = applyDeploymentBriefing(console_, 'high-seas', 'High Seas', RELEASE_KICKER);
    expect(console_.kicker.textContent).toBe(copy.kicker);
    expect(console_.title.textContent).toBe(copy.title);
    expect(console_.status.textContent).toBe(copy.status);
  });

  it('covers the two arenas HF-372 is about with non-placeholder copy', () => {
    for (const arenaId of ['farcrysis', 'high-seas'] as const) {
      const copy = deploymentBriefingCopy(arenaId, arenaId, RELEASE_KICKER);
      expect(copy.status.length).toBeGreaterThan(60);
      expect(copy.status).not.toMatch(/standby|placeholder|pending|tbd/i);
    }
  });
});
