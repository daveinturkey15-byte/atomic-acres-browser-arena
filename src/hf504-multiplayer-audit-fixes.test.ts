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

describe('HF-504 lobby - a guest must never render authority it no longer holds', () => {
  // localLobbyReady = localMember?.ready ?? localLobbyReady kept READY on
  // screen for a guest the host had already dropped (grace expired, rejoin
  // denied, room closed): the owner reads that as host and guest disagreeing.
  it('clears the local ready flag when the authoritative roster does not list this player', () => {
    expect(main).toContain('localLobbyReady = snapshot ? localMember?.ready ?? false : localLobbyReady;');
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
