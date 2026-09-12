import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legacyMain = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const mpAudit = readFileSync(new URL('../scripts/qa/mp-audit.mjs', import.meta.url), 'utf8');
const report = readFileSync(new URL('../docs/evidence/pass95/killstreak-awareness/REPORT.md', import.meta.url), 'utf8');

function sourceBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start, `missing start marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('HF-509 verifier fix round', () => {
  it('keeps generic damage direction for killstreak sources without a labelled cue', () => {
    const applyDamage = sourceBlock(legacyMain, 'function applyDamage(', '\nfunction applyBotDamage(');
    expect(applyDamage).toContain(
      "if (cause.kind !== 'killstreak' || !['chopper', 'piloted-drone', 'drone-swarm'].includes(cause.effect)) showDamageDirection(attacker, appliedDamage, now);",
    );
  });

  it('stops support flight loops on match end before the early return', () => {
    const endedBranch = sourceBlock(legacyMain, "if (matchState.phase === 'ended') {", "if (network.role !== 'client' && matchState.phase === 'active') {");
    expect(endedBranch).toContain('audio.syncSupportFlightLoops([]);');
  });

  it('presents solo announcements while keeping the wire host-only', () => {
    const announce = sourceBlock(legacyMain, 'function announceKillstreakActivation(', '\nfunction presentKillstreakAnnouncement(');
    expect(announce).toContain("if (network.role === 'client' || !admission.accepted || !admission.activationId || !admission.activatedId) return;");
    expect(announce).toContain("if (network.role === 'host') network.send(message);");
  });

  it('requires the labelled damage-source observation in the MP audit result', () => {
    expect(mpAudit).toContain(
      'row.announced && !row.relayedByGuest && row.bannerShown && row.replicated && row.damageSourceLabelled',
    );
  });

  it('reports the actual twelve tests in the evidence report', () => {
    expect(report).toContain('`src/killstreak-awareness.test.ts` (12 tests):');
  });
});
