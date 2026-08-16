import { describe, expect, it } from 'vitest';
import {
  BOT_WEAPON_PRESENTATION_SCHEMA_VERSION,
  BotWeaponPresentationReplayGuard,
  type BotFlareLaunchPresentationMessage,
} from './bot-weapon-presentation';
import {
  admitProjectileGlassBreak,
  HostedBotProjectileGlassActionLedger,
  type HostedBotProjectileGlassAction,
} from './projectile-glass-break-admission';

const expectedHost = Object.freeze({ hostId: 'host-player', matchEpoch: 71 });
const launch = Object.freeze({
  type: 'bot-weapon-presentation',
  schemaVersion: BOT_WEAPON_PRESENTATION_SCHEMA_VERSION,
  by: 'host-player',
  matchEpoch: 71,
  botId: 'host-bot-3',
  weapon: 'flare-gun',
  presentation: 'signal-flare-launch',
  origin: [3, 1.42, 9],
  actionNonce: 502,
  nonce: 602,
} as const satisfies BotFlareLaunchPresentationMessage);

function admitGuestPane(
  action: HostedBotProjectileGlassAction | undefined,
  overrides: Partial<Parameters<typeof admitProjectileGlassBreak>[0]> = {},
) {
  return admitProjectileGlassBreak({
    receiverRole: 'client',
    hostAuthorityValid: true,
    weapon: 'flare-gun',
    fireKind: 'projectile',
    actionNonce: 502,
    actionCurrent: action !== undefined,
    actionWeapon: action?.weapon ?? null,
    actionNonceObserved: action?.actionNonce ?? null,
    eventReplay: false,
    paneAlreadyAdmittedForAction: action?.paneIds.has('glass:house-window-a') ?? false,
    originInsideArena: true,
    paneDistanceM: 0.08,
    maximumPaneDistanceM: 0.35,
    ...overrides,
  });
}

describe('hosted bot projectile glass authority', () => {
  it('keeps host and guest pane state in parity from one authenticated bot flare action', () => {
    const transportGuard = new BotWeaponPresentationReplayGuard();
    const transport = transportGuard.admit(launch, expectedHost);
    expect(transport).toMatchObject({ accepted: true, reason: 'accepted' });

    const ledger = new HostedBotProjectileGlassActionLedger();
    expect(ledger.recordHostLaunch(transport.message, expectedHost, 1_000))
      .toEqual({ accepted: true, reason: 'accepted' });
    const action = ledger.current('host-bot-3', 502, 71, 1_050);
    const guestAdmission = admitGuestPane(action);
    expect(guestAdmission).toEqual({ accepted: true, reason: 'accepted' });

    const hostPaneBroken = true;
    const guestPaneBroken = guestAdmission.accepted;
    expect(guestPaneBroken).toBe(hostPaneBroken);
  });

  it('rejects a second pane mutation for the same bot action and pane', () => {
    const ledger = new HostedBotProjectileGlassActionLedger();
    expect(ledger.recordHostLaunch(launch, expectedHost, 1_000).accepted).toBe(true);
    const action = ledger.current('host-bot-3', 502, 71, 1_050)!;
    expect(admitGuestPane(action).accepted).toBe(true);
    action.paneIds.add('glass:house-window-a');
    expect(admitGuestPane(action)).toEqual({ accepted: false, reason: 'replay' });
    expect(admitGuestPane(action, { paneAlreadyAdmittedForAction: false, eventReplay: true }))
      .toEqual({ accepted: false, reason: 'replay' });
  });

  it('does not let a canonical break borrow another bot action', () => {
    const ledger = new HostedBotProjectileGlassActionLedger();
    expect(ledger.recordHostLaunch(launch, expectedHost, 1_000).accepted).toBe(true);
    const wrongBotAction = ledger.current('host-bot-2', 502, 71, 1_050);
    expect(wrongBotAction).toBeUndefined();
    expect(admitGuestPane(wrongBotAction)).toEqual({ accepted: false, reason: 'stale-action' });
    expect(ledger.current('host-bot-3', 503, 71, 1_050)).toBeUndefined();
  });

  it('rejects forged host and stale epoch launches without retaining authority', () => {
    const ledger = new HostedBotProjectileGlassActionLedger();
    expect(ledger.recordHostLaunch({ ...launch, by: 'guest-player' }, expectedHost, 1_000).reason)
      .toBe('wrong-host');
    expect(ledger.recordHostLaunch({ ...launch, matchEpoch: 70 }, expectedHost, 1_000).reason)
      .toBe('wrong-match-epoch');
    expect(ledger.size()).toBe(0);
  });

  it('bounds and expires retained bot actions', () => {
    const ledger = new HostedBotProjectileGlassActionLedger(1, 100);
    expect(ledger.recordHostLaunch(launch, expectedHost, 1_000).accepted).toBe(true);
    expect(ledger.recordHostLaunch({ ...launch, actionNonce: 503, nonce: 603 }, expectedHost, 1_010).accepted)
      .toBe(true);
    expect(ledger.size()).toBe(1);
    expect(ledger.current('host-bot-3', 502, 71, 1_020)).toBeUndefined();
    expect(ledger.current('host-bot-3', 503, 71, 1_111)).toBeUndefined();
    expect(ledger.size()).toBe(0);
  });
});
