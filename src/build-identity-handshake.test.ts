import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PASS66_RELEASE_IDENTITY } from './release-identity';

const here = fileURLToPath(import.meta.url);
const read = (name: string) => readFileSync(join(here, '..', name), 'utf8');

describe('pass89 build-identity lobby handshake', () => {
  // Re-pinned to PASS 89 on 2026-09-02 (the pass89 cut). Same strictness: the stamp must
  // name the channel this source publishes to, and it is what the host compares on join.
  it('stamps the running build for the channel this source publishes to', () => {
    expect(PASS66_RELEASE_IDENTITY.pass).toBe('PASS 89');
    expect(PASS66_RELEASE_IDENTITY.route).toBe('channels/pass89');
    expect(PASS66_RELEASE_IDENTITY.runtimeLabel).toBe('PASS 89');
  });

  it('carries the stamped build id on every lobby join', () => {
    const main = read('legacy-main.ts');
    const send = main.slice(
      main.indexOf('function sendLobbyJoin'),
      main.indexOf('function sendClientWorldRepairReady'),
    );
    expect(send).toContain('type: \'lobby-join\',');
    expect(send).toContain('buildId: PASS66_RELEASE_IDENTITY.pass,');
  });

  it('the join wire type declares the optional build id', () => {
    const protocol = read('protocol.ts');
    const join = protocol.slice(
      protocol.indexOf('export type LobbyJoinMessage'),
      protocol.indexOf('export type GuestResumeAuthorityMessage'),
    );
    expect(join).toContain('buildId?: string;');
  });

  it('the host refuses a joiner stamped for a different pass before any membership mutation', () => {
    const main = read('legacy-main.ts');
    const admit = main.slice(
      main.indexOf('async function admitLobbyJoin'),
      main.indexOf('function updateHostReady'),
    );
    const refusalAt = admit.indexOf("message.buildId !== PASS66_RELEASE_IDENTITY.pass");
    expect(refusalAt).toBeGreaterThan(-1);
    expect(admit.slice(refusalAt)).toContain("rejectLobbyPlayer(message.playerId, 'build-mismatch', message.resumeToken, message.connectionEpoch)");
    // The refusal must precede membership mutation inside the NEW-MEMBER lane
    // (the rejoin branch above it legitimately writes tokens for known
    // members): between that lane's opening and the refusal there may be no
    // roster write, no digest storage and no admission confirmation.
    const newMemberLane = admit.indexOf('} else {', admit.indexOf('const joiningNewMember'));
    expect(newMemberLane).toBeGreaterThan(-1);
    const laneBeforeRefusal = admit.slice(newMemberLane, refusalAt);
    expect(laneBeforeRefusal).not.toContain('hostLobbyTokens.set(');
    expect(laneBeforeRefusal).not.toContain('hostLobbyMembers.set(');
    expect(laneBeforeRefusal).not.toContain('rememberHostLobbyResumeTokenDigest(');
    expect(laneBeforeRefusal).not.toContain('confirmPlayerAdmission(');
  });

  it("the lobby reject reason union names 'build-mismatch' and the client labels it", () => {
    const protocol = read('protocol.ts');
    expect(protocol).toContain("export type LobbyRejectReason = 'room-full' | 'identity-in-use' | 'rejoin-denied' | 'match-active' | 'invalid-config' | 'protocol-mismatch' | 'build-mismatch';");
    const main = read('legacy-main.ts');
    expect(main).toContain("'build-mismatch':");
    expect(main).toContain("reason: 'room-full' | 'rejoin-denied' | 'match-active' | 'build-mismatch',");
  });

  it('hosts a five second numbered deploy countdown from the shared epoch', () => {
    const privateMatch = read('private-match.ts');
    expect(privateMatch).toContain('export const LOBBY_START_LEAD_MS = 5_000;');
    const main = read('legacy-main.ts');
    expect(main).toContain("snapshot?.phase === 'countdown' && snapshot.activeAtEpochMs !== null");
    expect(main).toContain('`DEPLOYING IN ${countdownRemainS}`');
    expect(main).toContain('function scheduleLobbyCountdownRefresh');
  });
});
