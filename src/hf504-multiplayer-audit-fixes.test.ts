// HF-504: the mechanical multiplayer defects found by scripts/qa/mp-audit.mjs.
//
// Owner, 2026-09-04: "ensure you are properly debugging multiplayer - some of
// the issues are the same we have had for months: in lobby, guest/host, desync,
// cannot reload or pick up guns, so many issues".
//
// Each test below pins one of those symptoms to the exact code that caused it.
// They are source contracts rather than runtime tests because every one of
// these paths lives inside legacy-main.ts, which no unit test can instantiate;
// the runtime falsifier for all four is the three-peer driver itself.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const network = readFileSync(new URL('./network.ts', import.meta.url), 'utf8');
const protocol = readFileSync(new URL('./protocol.ts', import.meta.url), 'utf8');

/** The body of a top-level `function name(` declaration, up to the next one. */
function functionBody(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  expect(start, `${declaration} not found`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\nfunction ', start + declaration.length);
  return source.slice(start, next > start ? next : source.length);
}

describe('HF-504 "sometimes randomly cant shoot ... after picked one up"', () => {
  // nextShotAt is a deadline in the PREVIOUS weapon's cadence. Carried across a
  // weapon change it refuses the new weapon for the remainder of the old
  // weapon's interval - up to ~944 ms going from the m14-ebr to a pistol - and
  // reports nothing but a `rate-of-fire` fireBlock counter.
  it('clears the stale fire deadline when the player switches weapon slots', () => {
    const body = functionBody(main, 'function switchWeapon(index: number): void {');
    expect(body).toContain('player.nextShotAt = 0;');
    // It must land with the rest of the swap state, not before the early
    // returns that abandon the swap entirely.
    expect(body.indexOf('player.nextShotAt = 0;')).toBeGreaterThan(body.indexOf('player.weapon = id;'));
  });

  it('clears the stale fire deadline when a ground weapon is picked up', () => {
    const body = functionBody(main, 'function interactWithDeathDrop(');
    expect(body).toContain('player.nextShotAt = 0;');
    expect(body.indexOf('player.nextShotAt = 0;')).toBeGreaterThan(body.indexOf('player.weapon = result.inventory.primary;'));
  });

  it('clears the stale fire deadline for an armory pickup and a map-weapon handoff', () => {
    const armory = functionBody(main, 'function interactWithGunRangeArmory(');
    expect(armory).toContain('player.weapon = station.weapon;');
    expect(armory.indexOf('player.nextShotAt = 0;')).toBeGreaterThan(armory.indexOf('player.weapon = station.weapon;'));
    const railgun = functionBody(main, 'function syncRailgunHolderPresentation(');
    expect(railgun.match(/player\.nextShotAt = 0;/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('clears the stale fire deadline at the canonical respawn boundary', () => {
    const body = functionBody(main, 'function respawn(');
    expect(body).toContain('player.nextShotAt = 0;');
    expect(body.indexOf('player.nextShotAt = 0;')).toBeGreaterThan(body.indexOf('player.weapon = respawnLoadout.weapon;'));
  });

  it('keeps every weapon-granting path clearing it, so a new one cannot silently skip it', () => {
    // Five paths grant a weapon mid-life: gun-range armory, timed-map acquire,
    // the crimson flamethrower, the QA hook, and now swap + pickup. A sixth that
    // forgets reintroduces the owner's dead trigger.
    const clears = main.match(/player\.nextShotAt = 0;/g) ?? [];
    expect(clears.length).toBeGreaterThanOrEqual(6);
  });
});

describe('HF-504 "cannot reload" - the guest reload handshake after a death', () => {
  // The host rebuilds its per-guest reload authority on every life change
  // (lastActionSequence = -1) and demands actionSequence === last + 1. The
  // guest's allocator was reset only on network reset, guest-resume and
  // startGame. After the guest's first death it kept counting from N while the
  // host expected 0, every intent was rejected 'action-sequence', and the
  // reject path stores the UNCHANGED state - so the mismatch never healed and
  // reload stayed dead for the rest of the match.
  it('restarts the reload action sequence on every new life', () => {
    const body = functionBody(main, 'function respawn(');
    const newLifeGuard = body.indexOf('if (startsNewLife) {\n    clearExpiredLocalReloadAuthority();');
    expect(newLifeGuard).toBeGreaterThanOrEqual(0);
    const reset = body.indexOf('localReloadActionSequence.reset();', newLifeGuard);
    expect(reset).toBeGreaterThan(newLifeGuard);
  });

  it('still resets it on the three lifecycle boundaries that already did', () => {
    // Network reset, guest resume and match start. Losing any of them would
    // trade one desync for another.
    expect((main.match(/localReloadActionSequence\.reset\(\);/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe('HF-504 "cannot pick up guns" - a rejected pickup must repair the guest', () => {
  // The host attaches its canonical drop record to every reply, rejections
  // included. The guest discarded the rejection copy and restored its own stale
  // drop verbatim, so the state that caused the rejection was reinstated and
  // every later F-press on that drop failed identically.
  it('adopts the host canonical drop record on a rejected pickup, not only an accepted one', () => {
    const body = functionBody(main, 'function acceptLocalPickupResult(message: PickupResultMessage): void {');
    const rejected = body.indexOf("if (message.status === 'rejected')");
    const accepted = body.indexOf('applyLocalCombatInventoryProjection(message.combatInventory, true);');
    expect(rejected).toBeGreaterThanOrEqual(0);
    expect(accepted).toBeGreaterThan(rejected);
    const canonicalOnReject = body.indexOf('applyCanonicalPickupDrop(message,', rejected);
    expect(canonicalOnReject).toBeGreaterThan(rejected);
    expect(canonicalOnReject).toBeLessThan(accepted);
  });

  it('tells the player the pickup was denied, because the optimistic feed line already claimed it worked', () => {
    const body = functionBody(main, 'function acceptLocalPickupResult(message: PickupResultMessage): void {');
    const rejected = body.indexOf("if (message.status === 'rejected')");
    const feed = body.indexOf("addFeed('PICKUP DENIED'", rejected);
    expect(feed).toBeGreaterThan(rejected);
  });

  it('still rolls the optimistic local application back before adopting the host record', () => {
    const body = functionBody(main, 'function acceptLocalPickupResult(message: PickupResultMessage): void {');
    const rejected = body.indexOf("if (message.status === 'rejected')");
    const restore = body.indexOf('restorePendingLocalPickup(pending);', rejected);
    const canonical = body.indexOf('applyCanonicalPickupDrop(message,', rejected);
    expect(restore).toBeGreaterThanOrEqual(0);
    expect(canonical).toBeGreaterThan(restore);
  });
});

describe('HF-504 P-3/P-4 pickup authority - claims stay host-only and results are canonical', () => {
  it('admits pickup claims to the host handler without relaying the untrusted payload', () => {
    const ingress = network.slice(network.indexOf('private wireGuestEvents'), network.indexOf('private wireGuestState'));
    expect(ingress).toContain("|| payload.type === 'reload-intent' || payload.type === 'pickup'");
    expect(ingress).toContain('this.onMessage(payload);\n        return;');
    const pickupIndex = ingress.indexOf("payload.type === 'pickup'");
    const hostHandler = ingress.indexOf('this.onMessage(payload);', pickupIndex);
    const relayIndex = ingress.indexOf('this.broadcast(payload, playerId);', pickupIndex);
    expect(pickupIndex).toBeGreaterThanOrEqual(0);
    expect(hostHandler).toBeGreaterThan(pickupIndex);
    expect(relayIndex).toBeGreaterThan(hostHandler);
  });

  it('broadcasts the host result and repairs a non-claimant guest drop', () => {
    const sender = functionBody(main, 'function sendRemotePickupResult(');
    expect(sender).toContain('network.send(result);');
    expect(sender).not.toContain('network.sendToPlayer(message.by, result);');
    const consumer = functionBody(main, 'function acceptLocalPickupResult(');
    const nonClaimant = consumer.indexOf('if (message.forPlayerId !== player.id)');
    const canonical = consumer.indexOf('applyCanonicalPickupDrop(message, performance.now());', nonClaimant);
    const inventory = consumer.indexOf('applyLocalCombatInventoryProjection(message.combatInventory, true);');
    expect(nonClaimant).toBeGreaterThanOrEqual(0);
    expect(canonical).toBeGreaterThan(nonClaimant);
    expect(inventory).toBeGreaterThan(canonical);
  });
});

describe('HF-504 R-2..R-5 reload authority stays canonical across recovery', () => {
  it('does not invent a new life id for a bounded movement resynchronization', () => {
    const state = functionBody(main, 'function onNetworkMessage(');
    const continuityDecision = state.indexOf('const admittedContinuity');
    const decision = state.slice(continuityDecision, state.indexOf('remote.positionHistory.length', continuityDecision));
    expect(decision).toMatch(/movement\.resynchronized\s*\n\s*\? respawned\s*\n\s*\? Math\.max\(remote\.continuity \+ 1, claimedContinuity\)\s*\n\s*:\s*Math\.max\(remote\.continuity, claimedContinuity\)/);
  });

  it('cancels remote reload only after the pre-resolution shot guards pass', () => {
    const resolve = functionBody(main, 'function resolveAuthoritativeShot(request: ShotRequestMessage): void {');
    const cancel = resolve.indexOf("cancelRemoteReloadAuthority(request.by, 'cancelled');");
    const missingHistory = resolve.indexOf("finish('rejected', reason, admission.appliedRewindMs);");
    const badOrigin = resolve.indexOf("finish('rejected', 'bad-origin', admission.appliedRewindMs);");
    const emptyMagazine = resolve.indexOf("finish('rejected', 'empty-magazine', admission.appliedRewindMs);");
    expect(cancel).toBeGreaterThan(missingHistory);
    expect(cancel).toBeGreaterThan(badOrigin);
    expect(cancel).toBeGreaterThan(emptyMagazine);
  });

  it('applies the host ammo projection on a self state repair', () => {
    const state = functionBody(main, 'function onNetworkMessage(');
    const selfRepair = state.indexOf('const repairedHealth =');
    const projection = state.indexOf('applyLocalCombatInventoryProjection(message.combatInventory, true);', selfRepair);
    expect(selfRepair).toBeGreaterThanOrEqual(0);
    expect(projection).toBeGreaterThan(selfRepair);
  });

  it('carries and presents the host-authored remote reload state', () => {
    expect(main).toContain('reloading: player.reloadState !== null,');
    expect(main).toContain('operator.userData.reloading = renderedSnapshot.reloading === true;');
  });
});

describe('HF-504 P-2/P-5 pickup rollback is observable and covers auto-scavenge', () => {
  it('signals a timed-out optimistic pickup after restoring its prior state', () => {
    const body = functionBody(main, 'function expirePendingLocalPickup(');
    const restore = body.indexOf('restorePendingLocalPickup(pending);');
    const feed = body.indexOf("addFeed('PICKUP TIMED OUT'");
    expect(restore).toBeGreaterThanOrEqual(0);
    expect(feed).toBeGreaterThan(restore);
  });

  it('records auto-scavenge rollback state before sending its guest claim', () => {
    const body = functionBody(main, 'function autoScavengeDeathDrop(');
    expect(body).toContain('network.role === \'client\' && pendingLocalPickup');
    expect(body).toContain('const priorInventory = localGuestCombatInventory();');
    expect(body).toContain('pendingLocalPickup = Object.freeze({');
    expect(body.indexOf('pendingLocalPickup = Object.freeze({')).toBeLessThan(body.indexOf('network.send(pickup);'));
  });
});

describe('HF-499 P-1 pickup recovery driver', () => {
  it('runs a rejected host-drop claim followed by a second F press on the same drop', () => {
    const audit = readFileSync(new URL('../scripts/qa/mp-audit.mjs', import.meta.url), 'utf8');
    expect(audit).toContain("measuredRows: ['P-1', 'P-6', 'P-8']");
    expect(audit).toContain('result.firstDropRetained =');
    expect(audit).toContain('result.firstRejected =');
    expect(audit).toContain('// Re-broadcast the same local position');
    expect(audit).toContain('result.retrySucceeded =');
    expect(audit.match(/interactDrop\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe('HF-504 P-6/P-8 death drops are host-authored', () => {
  it('allows a death message to carry the host-canonical drop record', () => {
    expect(protocol).toContain('drop?: PickupResultDropRecord;');
    expect(protocol).not.toContain("type: 'death'; killer: string; victim: string; cause: KillCause; nonce: number }");
  });

  it('creates and broadcasts one canonical host drop before peers process the death', () => {
    expect(main).toContain('function canonicalDeathMessage(message: DeathMessage): DeathMessage {');
    const helper = functionBody(main, 'function canonicalDeathMessage(message: DeathMessage): DeathMessage {');
    expect(helper).toContain('const entity = spawnDeathDrop(message);');
    expect(main).toContain('const canonicalDeath = canonicalDeathMessage(death);');
    expect(main).toContain('network.send(canonicalDeath);');
    const spawn = functionBody(main, 'function spawnDeathDrop(message: DeathMessage, now = performance.now()): DeathDropEntity | null {');
    expect(spawn).toContain('const canonical = message.drop;');
    expect(spawn).toContain('const bounded = canonical ? victim.position : clampPointToBounds');
  });

  it('keeps the QA death scenario on the same canonical host drop path', () => {
    const start = main.indexOf('damageRemoteAuthoritatively: (amount: number, playerId) => {');
    const hook = main.slice(start, main.indexOf('\n  earnSupport:', start));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(hook).toContain('if (result.died && remote)');
    expect(hook).toContain('const canonicalDeath = canonicalDeathMessage(death);');
    expect(hook).toContain('network.send(canonicalDeath);');
    expect(hook).toContain('processDeath(canonicalDeath);');
  });
});

describe('HF-504 lobby - a guest must never render authority it no longer holds', () => {
  // localLobbyReady = localMember?.ready ?? localLobbyReady kept READY on
  // screen for a guest the host had already dropped (grace expired, rejoin
  // denied, room closed): the owner reads that as host and guest disagreeing.
  it('clears the local ready flag when the authoritative roster does not list this player', () => {
    expect(main).toContain('localLobbyReady = localMember?.ready ?? false;');
    expect(main).not.toContain('localLobbyReady = localMember?.ready ?? localLobbyReady;');
  });

  // network.ts records the farewell so the guest stops the 90 s reconnect
  // grind, but nothing forwarded it to the lobby UI, so the roster kept showing
  // a dead host as connected and ready.
  it('handles lobby-closed in the app and tears the lobby down like a rejection does', () => {
    expect(network).toContain("if (payload?.type === 'lobby-closed') this.lobbyClosedByHost = true;");
    const branch = main.indexOf("if (message.type === 'lobby-closed') {");
    expect(branch).toBeGreaterThanOrEqual(0);
    const reject = main.indexOf("if (message.type === 'lobby-reject') {");
    expect(reject).toBeGreaterThan(branch);
    const handled = main.slice(branch, reject);
    expect(handled).toContain('privateLobbySnapshot = null;');
    expect(handled).toContain('localLobbyReady = false;');
    expect(handled).toContain('renderPrivateLobby();');
    // Only a guest tears down on a farewell; the host is the one that sent it.
    expect(handled).toContain("if (network.role === 'client')");
  });
});

describe('HF-504 lobby authority and succession fences', () => {
  it('re-arms the active-match world-ready handshake after a voluntary menu leave', () => {
    expect(main).toContain('pendingVoluntaryActiveMatchRejoinRoomCode');
    expect(main).toContain('const resumingVoluntaryActiveMatch = pendingVoluntaryActiveMatchRejoinRoomCode === network.roomCode');
    expect(main).toContain('if (resumingVoluntaryActiveMatch || gameStarted || privateLobbySnapshot?.phase === \'active\'');
    const ready = main.slice(main.indexOf('function sendClientWorldRepairReady('));
    expect(ready).toContain('const voluntaryRejoin = pendingVoluntaryActiveMatchRejoinRoomCode === network.roomCode');
    expect(ready).toContain('pendingClientReconnectWorldRepairConnectionEpoch = localConnectionEpoch;');
    expect(ready).toContain('if (voluntaryRejoin) pendingVoluntaryActiveMatchRejoinRoomCode = \'\';');
    const leave = main.slice(main.indexOf('function returnToMainMenu(): void {'));
    expect(leave).toContain('pendingVoluntaryActiveMatchRejoinRoomCode = network.role === \'client\'');
    expect(leave).toContain('matchState.phase === \'active\'');
  });

  it('sends the rejoiner a direct canonical snapshot for each existing remote', () => {
    expect(main).toContain('function sendAuthoritativeRemoteSnapshotToPlayer(');
    const join = main.slice(main.indexOf("if (network.role === 'host' && message.type === 'join') {"));
    expect(join).toContain('for (const candidate of remotes.values())');
    expect(join).toContain('sendAuthoritativeRemoteSnapshotToPlayer(incoming.id, candidate, repairNow);');
    expect(join).toContain('network.send(createStateMessage());');
  });

  it('retains an active-match voluntary leave as a host-authoritative rejoin reservation', () => {
    const leave = main.slice(main.indexOf("if (message.type === 'leave' && privateLobbySnapshot) {"));
    expect(leave).toContain("const retainActiveMatchRejoin = message.voluntary");
    expect(leave).toContain("privateLobbySnapshot.phase === 'active'");
    expect(leave).toContain('const hostMatchIsActive = privateLobbySnapshot.phase === \'active\' || matchState.phase === \'active\' || gameStarted;');
    expect(leave).toContain('!message.voluntary || retainActiveMatchRejoin');
    expect(leave).toContain("if (message.voluntary && !retainActiveMatchRejoin) {");
    expect(leave).toContain('hostLobbyTokens.delete(message.playerId);');
    expect(leave).toContain('network.forgetPlayerRejoinCredential(message.playerId);');
    expect(leave).toContain('markLobbyDisconnected(message.playerId);');
  });

  it('requires a second human or a hosted bot and blocks rejoin reservations', () => {
    const predicates = readFileSync(new URL('./private-match.ts', import.meta.url), 'utf8');
    expect(predicates).toContain('const hasDisconnectedReservation = snapshot.members.some((member) => !member.connected);');
    expect(predicates).toContain('const hasSecondParticipant = connected.length >= 2 || snapshot.config.hostedBotCount > 0;');
    expect(predicates).toContain('&& !hasDisconnectedReservation');
    expect(predicates).toContain('&& connected.every((member) => member.ready);');
  });

  it('renders lobby fields only from the authoritative snapshot', () => {
    const render = functionBody(main, 'function renderPrivateLobby(): void {');
    expect(render).toContain('const members = snapshot?.members ?? [];');
    expect(render).toContain('const config = snapshot?.config ?? null;');
    expect(render).toContain("'Waiting for the host to admit this connection…'");
    expect(render).not.toContain("snapshot?.members ?? (network.role === 'host' ? [...hostLobbyMembers.values()] : [])");
    expect(render).not.toContain('snapshot?.config.capacity ?? privateMatchConfig.capacity');
  });

  it('uses the host-time mapping for countdown presentation and suppresses telemetry revisions', () => {
    const render = functionBody(main, 'function renderPrivateLobby(): void {');
    expect(render).toContain('hostTimeToGuestMono(hostTimeMapping, snapshot.activeAtHostTimeMs');
    expect(render).not.toContain('snapshot.activeAtEpochMs - Date.now()');
    expect(main).toContain("broadcastHostLobby(privateLobbySnapshot?.phase ?? 'waiting', { revisionBump: false, render: false });");
  });

  it('rejects duplicate equal-revision lobby-start messages by nonce', () => {
    const branch = functionBody(main, 'function handleLobbyMessage(message: GameMessage): boolean {');
    const start = branch.indexOf("if (message.type === 'lobby-start')");
    const tail = branch.slice(start, branch.indexOf("if (message.type === 'lobby-closed')", start));
    expect(tail).toContain('message.revision >= (privateLobbySnapshot?.revision ?? 0)');
    expect(tail).toContain('!processedNonces.has(message.nonce)');
    expect(tail).toContain('processedNonces.add(message.nonce);');
  });

  it('accepts a lower revision only when the authenticated host identity changed', () => {
    const accept = functionBody(main, 'function acceptLobbyState(message: LobbyStateMessage): void {');
    expect(accept).toContain('const authorityChanged = previousSnapshot !== null && message.snapshot.hostId !== previousSnapshot.hostId;');
    expect(accept).toContain('&& !authorityChanged');
    expect(accept).toContain('|| authorityChanged');
  });
});

describe('HF-504 X-2 desync admission fence', () => {
  it('withholds a guest remote seed pose until an authoritative state arrives', () => {
    expect(main).toContain('authoritativeReady: boolean;');
    expect(main).toContain('authoritativeReady: network.role !== \'client\',');
    expect(main).toContain('if (network.role === \'client\' && !remote.authoritativeReady)');
    expect(main).toContain('if (network.role === \'client\' && message.type === \'state\') remote.authoritativeReady = true;');
  });

  it('marks a remote authoritative only after the accepted-state admission checks', () => {
    const state = functionBody(main, 'function onNetworkMessage(');
    const ready = state.indexOf("if (network.role === 'client' && message.type === 'state') remote.authoritativeReady = true;");
    const movement = state.indexOf('const movement = admitRemoteSnapshotMovement(');
    expect(ready).toBeGreaterThan(movement);
    expect(state.slice(movement, ready)).toContain('if (!movement.accepted)');
  });

  it('makes the audit ignore only the explicitly withheld, non-authoritative pose', () => {
    const audit = readFileSync(new URL('../scripts/qa/mp-audit.mjs', import.meta.url), 'utf8');
    expect(audit).toContain('authoritativeReady: remote.authoritativeReady ?? true');
    expect(audit).toContain('if (guestPlayer.authoritativeReady === false) continue;');
    expect(audit).toContain('samplesCompared');
  });
});

describe('HF-504 the audit driver and its trace seam stay wired', () => {
  it('records the message trace at the single outbound funnel and one inbound wrapper', () => {
    expect(network).toContain("this.recordQaTrace('out', message, stateTraffic ? 'state' : 'events');");
    expect(network).toContain("this.recordQaTrace('in', message, 'events');");
    // The fence: production must never allocate the ring.
    expect(network).toContain('qaMessageTraceEnabled()');
    expect(network).toMatch(/qaMessageTraceEnabled\(\): boolean \{[\s\S]*?params\.get\('qaTrace'\) === '1'/);
  });

  it('exposes the trace to the driver read-only', () => {
    expect(main).toContain('sampleMessageTrace: () => network.qaMessageTrace(),');
    expect(network).toMatch(/qaMessageTrace\(\): QaMessageTrace \{[\s\S]*?entries: this\.qaTrace \? \[\.\.\.this\.qaTrace\] : \[\]/);
  });
});
