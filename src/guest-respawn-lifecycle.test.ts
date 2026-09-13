import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { admitGuestResumeAuthority, guestResumeProjection, guestResumeWorldRevisionReady } from './guest-resume-authority';
import { shouldReadmitResumeAuthority } from './guest-rejoin-repair-pacing';
import { createGuestCombatInventory } from './guest-combat-inventory-authority';
import { DEFAULT_KILLSTREAK_LOADOUT } from './killstreak-loadout';
import { MULTIPLAYER_PROTOCOL_VERSION, type GuestResumeAuthorityMessage } from './protocol';

// Execute actual production function bodies; do not substitute a copied policy
// or a regex that merely notices an assignment. Transport/DOM/respawn are spies.
// This is deterministic lifecycle coverage, not browser/network acceptance.
const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('legacy-main.ts', source, ts.ScriptTarget.Latest, true);
function functionNode(name: string) {
  const matches = ast.statements.filter((n): n is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(n) && n.name?.text === name);
  expect(matches, name).toHaveLength(1);
  return matches[0];
}
const names = ['scheduleLocalRespawn', 'sendLobbyJoin', 'handleGuestResumeTimeout',
  'acceptGuestResumeFailure', 'applyGuestResumeAuthority'];
const cancellation = ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'cancelLocalRespawn');
const executable = ts.transpileModule([
  ...names.map((name) => functionNode(name).getText(ast)), cancellation?.getText(ast) ?? '',
].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
  let now = 100;
  let timerId = 0;
  const timers = new Map<number, { due: number; callback: () => void }>();
  const noop = () => {};
  const elements = new Map<string, { hidden: boolean; classList: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } }>();
  const vector = () => ({ set: vi.fn(), copy: vi.fn() });
  const c: vm.Context = {
    performance: { now: () => now },
    THREE: { MathUtils: { clamp: (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n)) } },
    element: (id: string) => {
      if (!elements.has(id)) elements.set(id, { hidden: true, classList: { add: vi.fn(), remove: vi.fn() } });
      return elements.get(id);
    },
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++timerId; timers.set(id, { due: now + delay, callback }); return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
    respawnTimer: null, respawnEndsAt: 0, gameStarted: true, matchFinished: false,
    network: { role: 'client', roomCode: 'fixture-room', send: vi.fn(), sendStateCommitReliably: vi.fn() },
    player: { id: 'guest-1', name: 'Guest', team: 1, hp: 0, alive: false, seq: 0,
      position: vector(), velocity: vector(), ammo: {}, reserve: {} },
    privateLobbySnapshot: { hostId: 'host-1', phase: 'active' },
    pendingVoluntaryActiveMatchRejoinRoomCode: '', clientWorldRepairAdmission: null,
    pendingClientReconnectWorldRepairConnectionEpoch: null, clientReconnectWorldRepairAttempts: 0,
    lastReconnectWorldRepairAttemptAtMs: null, guestResumeTimedOutLocally: false, guestResumeHostDeclaredFailure: false,
    clearClientWorldRepairTimeout: noop, clearGuestResumeTimeout: noop,
    localResumeToken: 'synthetic-fixture', restoreRoomIdentity: noop,
    awaitingCanonicalGuestAuthority: false, awaitingAuthoritativeRejoinContinuity: false,
    pendingGuestResumeAuthority: null, localConnectionEpoch: 'connection_epoch_001',
    randomLobbyCredential: () => 'connection_epoch_002', randomNonce: () => 999,
    localTriggerActionSequence: 0, transmittedTriggerHeld: false, transmittedTriggerWeapon: null,
    MULTIPLAYER_PROTOCOL_VERSION, PASS66_RELEASE_IDENTITY: { pass: 'fixture' },
    localSquadName: '', localSquadColor: '', localOperatorSkinId: '', localOperatorStanceId: '',
    scheduleClockPing: noop, renderPrivateLobby: noop, clearGameplayInput: noop,
    weaponView: { setPresentationVisible: vi.fn(), setWeapon: noop }, setStatus: noop, addFeed: noop,
    lastAppliedGuestResumeAuthority: null, shouldReadmitResumeAuthority, admitGuestResumeAuthority,
    guestResumeProjection, guestResumeWorldRevisionReady, killstreakMatchEpoch: 41,
    processedNonces: new Set(), interactiveWorldRuntime: { collisions: () => ({ revision: 17 }) },
    scheduleGuestResumeWorldTimeout: vi.fn(), lastGuestResumeNackNonce: null,
    pointInsideBounds: () => true, arena: { bounds: {} }, STATE_ADMISSION_BOUNDS_MARGIN: 0.38,
    isBlocked: () => false, activeWorldColliders: () => [], characterPhysics: null,
    nackGuestResumeAuthority: vi.fn(), applyingLocalReloadAuthority: false, interruptReload: noop,
    stanceTransition: null, restingStanceTransitionSample: noop, stanceTransitionSample: null,
    ORDINARY_WEAPON_IDS: ['m14-ebr', 'machine-pistol'], lastAppliedLocalCombatAuthorityRevision: -1,
    lastAppliedLocalShotResultSeq: -1, pendingLocalOrdinaryShots: new Set(),
    localReloadRetryRuntime: new Map(), remoteReloadResultCache: new Map(), reloadProtocolTrace: [],
    pendingLocalReloadAuthority: null, pendingLocalPickup: null, localReloadActionSequence: { reset: noop },
    localContinuity: 0, localHostConfirmedContinuity: 0, lastAcknowledgedLocalInputSeq: 0,
    killstreakLoadoutController: { reconcileActiveMatchAuthority: noop }, gamepadSupportSelection: null,
    syncFieldSupportRows: noop, localPositionHistory: [], localCombatEventSeq: 0, resetFlashVictimLife: noop,
    camera: { position: vector(), rotation: { set: noop }, updateMatrixWorld: noop },
    renderFieldKitSelection: noop, updateFieldSupportHud: noop, saveActiveRoomIdentity: noop,
    createStateMessage: () => ({}), trimNonceSet: noop, respawn: vi.fn(),
  };
  vm.createContext(c);
  vm.runInContext(executable, c, { timeout: 1000 });
  const advance = (ms: number) => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.due <= now) {
      timers.delete(id); timer.callback();
    }
  };
  const authority = (hp: number, nonce = 712): GuestResumeAuthorityMessage => ({
    type: 'guest-resume-authority', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: 'host-1', forPlayerId: 'guest-1', connectionEpoch: c.localConnectionEpoch,
    matchEpoch: 41, worldRevision: 17, attempt: 0, placementReason: 'retained',
    combatInventory: createGuestCombatInventory('m14-ebr', 'machine-pistol', 0),
    combatInventoryRevision: 23, continuity: 9, respawnRemainingMs: hp > 0 ? 0 : 1400,
    loadout: DEFAULT_KILLSTREAK_LOADOUT, nonce,
    player: { id: 'guest-1', name: 'Guest', team: 1, x: -8, y: 1.7, z: 4,
      yaw: -0.35, pitch: 0.08, hp, kills: 3, deaths: 1, primary: 'm14-ebr',
      secondary: 'machine-pistol', grenade: 'semtex', weapon: 'railgun', stance: 'prone', seq: 313 },
  });
  return { c, timers, advance, authority, elements };
}

describe('actual guest death timer lifecycle', () => {
  it.each(['client', 'host', 'offline'])('preserves one ordinary %s respawn and its bounded delay', (role) => {
    const { c, advance, timers } = fixture(); c.network.role = role;
    c.scheduleLocalRespawn(100, 5000); c.scheduleLocalRespawn(100, 1);
    expect(timers.size).toBe(1); advance(1899); expect(c.respawn).not.toHaveBeenCalled();
    advance(1); expect(c.respawn).toHaveBeenCalledTimes(1);
  });
  it.each(['matchFinished', 'notStarted', 'alreadyAlive', 'newMatchEpoch', 'newConnectionEpoch'])(
    'rejects a stale callback for %s', (change) => {
      const { c, advance } = fixture(); c.scheduleLocalRespawn();
      if (change === 'matchFinished') c.matchFinished = true;
      if (change === 'notStarted') c.gameStarted = false;
      if (change === 'alreadyAlive') c.player.alive = true;
      if (change === 'newMatchEpoch') c.killstreakMatchEpoch++;
      if (change === 'newConnectionEpoch') c.localConnectionEpoch = 'connection_epoch_003';
      advance(2000); expect(c.respawn).not.toHaveBeenCalled();
    });
  it('cancels the old death timer when transport readiness rearms canonical admission', () => {
    const { c, timers, advance } = fixture(); c.scheduleLocalRespawn(); c.sendLobbyJoin();
    expect(c.awaitingCanonicalGuestAuthority).toBe(true); expect(timers.size).toBe(0);
    advance(2000); expect(c.respawn).not.toHaveBeenCalled();
  });
  it.each(['pending', 'timeout', 'failure'])('refuses a death event timer during %s admission', (state) => {
    const { c, authority, advance } = fixture(); c.sendLobbyJoin(); c.scheduleLocalRespawn();
    if (state === 'timeout') c.handleGuestResumeTimeout();
    if (state === 'failure') {
      const a = authority(0); c.pendingGuestResumeAuthority = a;
      c.acceptGuestResumeFailure({ type: 'guest-resume-failure', by: a.by, forPlayerId: a.forPlayerId,
        connectionEpoch: a.connectionEpoch, matchEpoch: a.matchEpoch, worldRevision: a.worldRevision,
        authorityNonce: a.nonce, attempt: a.attempt, reason: 'blocked-pose' });
      expect(c.guestResumeHostDeclaredFailure).toBe(true);
    }
    advance(2000); expect(c.respawn).not.toHaveBeenCalled();
  });
  it('alive authority replaces stale death state without later respawn or blackout', () => {
    const { c, advance, authority, elements, timers } = fixture(); c.sendLobbyJoin(); c.scheduleLocalRespawn();
    c.applyGuestResumeAuthority(authority(7.5));
    expect(c.player.hp).toBe(7.5); expect(c.player.alive).toBe(true); expect(timers.size).toBe(0);
    expect(elements.get('#respawn')?.hidden).toBe(true);
    expect(elements.get('#death-fade')?.classList.remove).toHaveBeenCalledWith('death-wash', 'respawn-flash');
    advance(2000); expect(c.respawn).not.toHaveBeenCalled();
  });
  it('dead authority replaces the old deadline; duplicate delivery neither extends nor doubles it', () => {
    const { c, advance, authority, timers } = fixture(); c.sendLobbyJoin(); c.scheduleLocalRespawn(100, 1900);
    advance(1000); const a = authority(0); c.applyGuestResumeAuthority(a);
    expect(c.awaitingCanonicalGuestAuthority).toBe(false); expect(timers.size).toBe(1);
    advance(900); expect(c.respawn).not.toHaveBeenCalled();
    c.applyGuestResumeAuthority(a); expect(timers.size).toBe(1);
    advance(499); expect(c.respawn).not.toHaveBeenCalled();
    advance(1); expect(c.respawn).toHaveBeenCalledTimes(1);
  });
  it('locally timed-out guest still accepts later authenticated dead authority', () => {
    const { c, advance, authority } = fixture(); c.sendLobbyJoin(); c.handleGuestResumeTimeout();
    c.applyGuestResumeAuthority(authority(0)); expect(c.guestResumeTimedOutLocally).toBe(false);
    advance(1400); expect(c.respawn).toHaveBeenCalledTimes(1);
  });
  it('rejected authority does not cancel or alter a pending timer', () => {
    const { c, authority, timers } = fixture(); c.sendLobbyJoin(); c.scheduleLocalRespawn();
    const id = c.respawnTimer; c.applyGuestResumeAuthority({ ...authority(100), by: 'wrong-host' });
    expect(c.player.hp).toBe(0); expect(c.respawnTimer).toBe(id); expect(timers.size).toBe(1);
  });
  it('uses the same real cancellation helper in reset, match start and explicit respawn', () => {
    const { c, timers, advance } = fixture(); c.scheduleLocalRespawn();
    expect(typeof c.cancelLocalRespawn).toBe('function'); c.cancelLocalRespawn();
    expect(timers.size).toBe(0); expect(c.respawnEndsAt).toBe(0);
    for (const name of ['resetForMode', 'startGame', 'respawn']) {
      expect(functionNode(name).getText(ast)).toContain('cancelLocalRespawn();');
    }
    c.gameStarted = false; c.gameStarted = true; advance(2000); expect(c.respawn).not.toHaveBeenCalled();
    c.scheduleLocalRespawn(); advance(1900); expect(c.respawn).toHaveBeenCalledTimes(1);
  });
});
