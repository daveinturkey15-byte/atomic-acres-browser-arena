import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function block(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('killstreak damage feedback authority integration', () => {
  it('admits host damage-result messages before all health and presentation effects', () => {
    const handler = block("if (message.type === 'killstreak-damage-result')", "if (message.type === 'railgun-state')");
    expect(handler).toContain('killstreakDamageResultReplayLedger.admit(message');
    expect(handler).toContain('expectedHostId: privateLobbySnapshot?.hostId');
    expect(handler).toContain('expectedMatchEpoch: killstreakMatchEpoch');
    expect(handler).toContain('if (!admission.accepted) return');
    expect(handler).toContain('for (const event of admission.events)');
    expect(handler).toContain('presentKillstreakDamageFeedback(admission.events)');
    expect(handler).toContain('for (const impact of admission.impacts)');
    expect(handler).toContain('killstreakPresentation.presentImpacts(admission.impacts, presentedAt)');
    expect(handler).not.toContain('presentKillstreakDamageFeedback(message.events)');
    expect(handler).not.toContain('presentImpacts(message.impacts');
  });

  it('records actual local Chopper ballistics and consumes that bounded receipt instead of inferring possession', () => {
    const possession = block('function updateKillstreakPossession(', '\nfunction updatePass65KillstreakRuntime(');
    expect(possession).toContain('localSupportShotPresentationReceipts.record({');
    expect(possession).toContain('activationId: entity.activationId');
    expect(possession).toContain('presentedAtHostTimeMs: currentHostTimeMs()');

    const feedback = block('function consumeLocalChopperShotPresentationReceipt(', '\nfunction killstreakActorModifiers(');
    expect(feedback).toContain('localSupportShotPresentationReceipts.consume(event, currentHostTimeMs())');
    expect(feedback).toContain('const localBallisticsAlreadyPresented = firstShotEvent');
    expect(feedback).toContain('firstShotEvent && !localBallisticsAlreadyPresented');
    expect(feedback).not.toContain('localPossessionAlreadyPresentedChopperShot');
    expect(feedback).not.toContain("possession?.kind !== 'chopper-gunner'");
  });

  it('clears network replay and local presentation receipts at the match authority boundary', () => {
    const startGame = block('async function startGame', '\nfunction randomNonce');
    expect(startGame).toContain('killstreakDamageResultReplayLedger.reset()');
    expect(startGame).toContain('localSupportShotPresentationReceipts.reset()');
  });
});
