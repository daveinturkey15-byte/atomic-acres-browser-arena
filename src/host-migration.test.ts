import { describe, expect, it } from 'vitest';
import {
  HOST_SILENCE_WARNING_MS,
  HOST_SUCCESSION_MANDATE_SCHEMA_VERSION,
  HOST_SUCCESSION_MANDATE_TTL_MS,
  INITIAL_HOST_TERM,
  MAX_HOST_TERM,
  MIN_SURVIVORS_FOR_MIGRATION,
  acceptPromotedHost,
  authorizeSelfPromotion,
  electHostSuccessor,
  evaluateHostLoss,
  hostLossPresentation,
  isSuccessionMandate,
  isSuccessionRoster,
  mintSuccessionMandate,
  resolveHostTermConflict,
  resolveRoomClaimOutcome,
  survivingGuestCount,
  termSupersedes,
  type FollowerAcceptanceRefusal,
  type FollowerAcceptanceSample,
  type HostLinkSample,
  type HostLossState,
  type PromotionRefusal,
  type SelfPromotionSample,
  type SuccessionMandate,
  type SuccessionRoster,
} from './host-migration';

const ROOM = 'atomic-room-a';
const ISSUED_AT = 1_000_000;
const EXPIRES_AT = ISSUED_AT + HOST_SUCCESSION_MANDATE_TTL_MS;

function roster(overrides: Partial<SuccessionRoster> = {}): SuccessionRoster {
  return {
    revision: 17,
    hostId: 'host-1',
    members: [
      { id: 'host-1', connected: true },
      { id: 'guest-b', connected: true },
      { id: 'guest-a', connected: true },
      { id: 'guest-c', connected: true },
    ],
    ...overrides,
  };
}

function mandate(overrides: Partial<SuccessionMandate> = {}): SuccessionMandate {
  return {
    schemaVersion: HOST_SUCCESSION_MANDATE_SCHEMA_VERSION,
    term: 4,
    roomCode: ROOM,
    successorId: 'guest-a',
    lobbyRevision: 17,
    issuedByHostId: 'host-1',
    issuedAtEpochMs: ISSUED_AT,
    expiresAtEpochMs: EXPIRES_AT,
    ...overrides,
  };
}

function promotionSample(overrides: Partial<SelfPromotionSample> = {}): SelfPromotionSample {
  return {
    selfId: 'guest-a',
    roomCode: ROOM,
    assessment: { state: 'host-lost', remainingMs: 0, silentForMs: 120_000 },
    mandate: mandate(),
    highestObservedTerm: 4,
    roster: roster(),
    holdsMirroredAuthority: true,
    nowEpochMs: ISSUED_AT + 30_000,
    ...overrides,
  };
}

function followerSample(overrides: Partial<FollowerAcceptanceSample> = {}): FollowerAcceptanceSample {
  return {
    roomCode: ROOM,
    claimantId: 'guest-a',
    presentedMandate: mandate(),
    presentedTerm: 5,
    highestObservedTerm: 4,
    roster: roster(),
    ...overrides,
  };
}

function linkSample(overrides: Partial<HostLinkSample> = {}): HostLinkSample {
  return {
    role: 'client',
    eventChannelOpen: true,
    reconnectPending: false,
    lastValidHostMessageMonoMs: 10_000,
    reconnectDeadlineMonoMs: null,
    lobbyClosedByHost: false,
    nowMonoMs: 10_500,
    ...overrides,
  };
}

function refusalOf(decision: ReturnType<typeof authorizeSelfPromotion>): PromotionRefusal | 'promoted' {
  return decision.promote ? 'promoted' : decision.reason;
}

// ---------------------------------------------------------------------------

describe('successor election', () => {
  it('picks the lexicographically lowest connected guest id', () => {
    const election = electHostSuccessor(roster());
    expect(election.decided).toBe(true);
    if (!election.decided) return;
    expect(election.successorId).toBe('guest-a');
    expect(election.candidates).toEqual(['guest-a', 'guest-b', 'guest-c']);
    expect(election.revision).toBe(17);
  });

  it('never elects the host, even when the host sorts lowest', () => {
    const election = electHostSuccessor(roster({
      hostId: 'aaa-host',
      members: [
        { id: 'aaa-host', connected: true },
        { id: 'guest-a', connected: true },
        { id: 'guest-b', connected: true },
      ],
    }));
    expect(election.decided && election.successorId).toBe('guest-a');
    expect(election.decided && election.candidates).toEqual(['guest-a', 'guest-b']);
  });

  it('skips disconnected members even when they sort lowest', () => {
    const election = electHostSuccessor(roster({
      members: [
        { id: 'host-1', connected: true },
        { id: 'guest-a', connected: false },
        { id: 'guest-b', connected: true },
        { id: 'guest-c', connected: true },
      ],
    }));
    expect(election.decided && election.successorId).toBe('guest-b');
  });

  it('is order independent: every permutation of one roster elects the same guest', () => {
    const members = roster().members;
    const permutations: (typeof members)[] = [];
    const permute = (rest: typeof members, prefix: typeof members): void => {
      if (rest.length === 0) { permutations.push(prefix); return; }
      rest.forEach((member, index) => {
        permute([...rest.slice(0, index), ...rest.slice(index + 1)], [...prefix, member]);
      });
    };
    permute(members, []);
    expect(permutations).toHaveLength(24);
    const answers = new Set(permutations.map((ordering) => {
      const election = electHostSuccessor(roster({ members: ordering }));
      return election.decided ? election.successorId : `refused:${election.reason}`;
    }));
    expect([...answers]).toEqual(['guest-a']);
  });

  it('refuses a malformed roster rather than guessing', () => {
    for (const bad of [
      null,
      undefined,
      'roster',
      [],
      { revision: 1, hostId: 'host-1' },
      roster({ revision: -1 }),
      roster({ revision: 1.5 }),
      roster({ hostId: '' }),
      roster({ members: [] }),
      { ...roster(), members: [{ id: 'host-1' }] },
      { ...roster(), members: [{ id: 'host-1', connected: 'yes' }] },
    ]) {
      const election = electHostSuccessor(bad);
      expect(election.decided).toBe(false);
      expect(election.decided === false && election.reason).toBe('malformed-roster');
    }
  });

  it('refuses duplicate ids instead of silently picking one', () => {
    const election = electHostSuccessor(roster({
      members: [
        { id: 'host-1', connected: true },
        { id: 'guest-a', connected: true },
        { id: 'guest-a', connected: false },
      ],
    }));
    expect(election.decided === false && election.reason).toBe('duplicate-member-ids');
  });

  it('refuses a roster that does not contain its own host', () => {
    const election = electHostSuccessor(roster({ hostId: 'ghost-host' }));
    expect(election.decided === false && election.reason).toBe('host-not-in-roster');
  });

  it('refuses when no guest is connected', () => {
    const election = electHostSuccessor(roster({
      members: [
        { id: 'host-1', connected: true },
        { id: 'guest-a', connected: false },
      ],
    }));
    expect(election.decided === false && election.reason).toBe('no-connected-guests');
    expect(survivingGuestCount(roster({
      members: [{ id: 'host-1', connected: true }, { id: 'guest-a', connected: false }],
    }))).toBe(0);
  });

  it('counts only connected non-host survivors', () => {
    expect(survivingGuestCount(roster())).toBe(3);
  });

  it('validates rosters through the exported guard', () => {
    expect(isSuccessionRoster(roster())).toBe(true);
    expect(isSuccessionRoster({ ...roster(), members: new Array(17).fill({ id: 'x', connected: true }) })).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('succession mandate', () => {
  it('mints a mandate naming the elected successor at the next term', () => {
    const minted = mintSuccessionMandate({
      roster: roster(),
      roomCode: ROOM,
      previousTerm: 4,
      nowEpochMs: ISSUED_AT,
    });
    expect(minted).not.toBeNull();
    expect(minted).toMatchObject({
      term: 5,
      roomCode: ROOM,
      successorId: 'guest-a',
      lobbyRevision: 17,
      issuedByHostId: 'host-1',
      expiresAtEpochMs: EXPIRES_AT,
    });
    expect(isSuccessionMandate(minted)).toBe(true);
  });

  it('starts at the initial term and never repeats a term', () => {
    const first = mintSuccessionMandate({ roster: roster(), roomCode: ROOM, previousTerm: 0, nowEpochMs: ISSUED_AT });
    expect(first?.term).toBe(INITIAL_HOST_TERM);
    const terms = new Set<number>();
    let previous = 0;
    for (let index = 0; index < 25; index += 1) {
      const next = mintSuccessionMandate({
        roster: roster(),
        roomCode: ROOM,
        previousTerm: previous,
        nowEpochMs: ISSUED_AT,
      });
      expect(next).not.toBeNull();
      expect(next!.term).toBeGreaterThan(previous);
      terms.add(next!.term);
      previous = next!.term;
    }
    expect(terms.size).toBe(25);
  });

  it('refuses to mint when the election is undecided or the input is unusable', () => {
    expect(mintSuccessionMandate({
      roster: roster({ members: [{ id: 'host-1', connected: true }] }),
      roomCode: ROOM,
      previousTerm: 1,
      nowEpochMs: ISSUED_AT,
    })).toBeNull();
    expect(mintSuccessionMandate({ roster: roster(), roomCode: 'bad room!', previousTerm: 1, nowEpochMs: ISSUED_AT })).toBeNull();
    expect(mintSuccessionMandate({ roster: roster(), roomCode: ROOM, previousTerm: -1, nowEpochMs: ISSUED_AT })).toBeNull();
    expect(mintSuccessionMandate({ roster: roster(), roomCode: ROOM, previousTerm: MAX_HOST_TERM, nowEpochMs: ISSUED_AT })).toBeNull();
    expect(mintSuccessionMandate({ roster: roster(), roomCode: ROOM, previousTerm: 1, nowEpochMs: 0 })).toBeNull();
  });

  it('rejects malformed mandates on the wire', () => {
    expect(isSuccessionMandate(mandate())).toBe(true);
    const rejected: unknown[] = [
      null,
      'mandate',
      { ...mandate(), schemaVersion: 2 },
      { ...mandate(), term: 0 },
      { ...mandate(), term: 1.5 },
      { ...mandate(), term: MAX_HOST_TERM + 1 },
      { ...mandate(), roomCode: 'not a room code' },
      { ...mandate(), successorId: '' },
      { ...mandate(), successorId: 'host-1' },
      { ...mandate(), issuedByHostId: '' },
      { ...mandate(), lobbyRevision: -1 },
      { ...mandate(), expiresAtEpochMs: EXPIRES_AT + 1 },
      { ...mandate(), extra: true },
      (({ term: _term, ...rest }) => rest)(mandate()),
    ];
    for (const value of rejected) expect(isSuccessionMandate(value)).toBe(false);
  });

  it('compares terms monotonically and never treats equality as newer', () => {
    expect(termSupersedes(5, 4)).toBe(true);
    expect(termSupersedes(5, 5)).toBe(false);
    expect(termSupersedes(4, 5)).toBe(false);
    expect(termSupersedes(1, 0)).toBe(true);
    expect(termSupersedes(0, 0)).toBe(false);
    expect(termSupersedes(1.5, 0)).toBe(false);
    expect(termSupersedes(MAX_HOST_TERM + 1, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('guest host-loss state machine', () => {
  it('reports healthy while the host is talking', () => {
    expect(evaluateHostLoss(linkSample()).state).toBe('healthy');
  });

  it('is inactive for a host or an offline client', () => {
    expect(evaluateHostLoss(linkSample({ role: 'host' })).state).toBe('inactive');
    expect(evaluateHostLoss(linkSample({ role: 'offline' })).state).toBe('inactive');
  });

  it('warns once host silence passes the warning threshold', () => {
    const assessment = evaluateHostLoss(linkSample({
      lastValidHostMessageMonoMs: 10_000,
      nowMonoMs: 10_000 + HOST_SILENCE_WARNING_MS,
    }));
    expect(assessment.state).toBe('unstable');
    expect(assessment.silentForMs).toBe(HOST_SILENCE_WARNING_MS);
  });

  it('reports reconnecting with the remaining window while retries run', () => {
    const assessment = evaluateHostLoss(linkSample({
      eventChannelOpen: false,
      reconnectPending: true,
      reconnectDeadlineMonoMs: 100_000,
      nowMonoMs: 70_000,
    }));
    expect(assessment.state).toBe('reconnecting');
    expect(assessment.remainingMs).toBe(30_000);
  });

  it('declares the host lost only once the window has actually expired', () => {
    const atDeadline = evaluateHostLoss(linkSample({
      eventChannelOpen: false,
      reconnectPending: true,
      reconnectDeadlineMonoMs: 100_000,
      nowMonoMs: 100_000,
    }));
    expect(atDeadline.state).toBe('host-lost');
    expect(atDeadline.remainingMs).toBe(0);
    const justBefore = evaluateHostLoss(linkSample({
      eventChannelOpen: false,
      reconnectPending: true,
      reconnectDeadlineMonoMs: 100_000,
      nowMonoMs: 99_999,
    }));
    expect(justBefore.state).toBe('reconnecting');
  });

  it('treats a deliberate host reset as closed, not as a crash to retry', () => {
    const assessment = evaluateHostLoss(linkSample({
      lobbyClosedByHost: true,
      eventChannelOpen: false,
      reconnectPending: true,
      reconnectDeadlineMonoMs: 100_000,
      nowMonoMs: 70_000,
    }));
    expect(assessment.state).toBe('closed-by-host');
  });

  it('covers every declared state', () => {
    const seen = new Set<HostLossState>([
      evaluateHostLoss(linkSample({ role: 'offline' })).state,
      evaluateHostLoss(linkSample()).state,
      evaluateHostLoss(linkSample({ nowMonoMs: 10_000 + HOST_SILENCE_WARNING_MS })).state,
      evaluateHostLoss(linkSample({ reconnectPending: true, reconnectDeadlineMonoMs: 100_000, nowMonoMs: 50_000 })).state,
      evaluateHostLoss(linkSample({ reconnectPending: true, reconnectDeadlineMonoMs: 100_000, nowMonoMs: 100_001 })).state,
      evaluateHostLoss(linkSample({ lobbyClosedByHost: true })).state,
    ]);
    const declared: readonly HostLossState[] = [
      'inactive', 'healthy', 'unstable', 'reconnecting', 'host-lost', 'closed-by-host',
    ];
    expect([...seen].sort()).toEqual([...declared].sort());
  });
});

describe('host-loss presentation', () => {
  it('stays out of the way while nothing is wrong', () => {
    for (const state of ['inactive', 'healthy'] as const) {
      const presentation = hostLossPresentation({ state, remainingMs: null, silentForMs: null });
      expect(presentation.visible).toBe(false);
      expect(presentation.action).toBe('none');
    }
  });

  it('tells the player the host is gone and offers a concrete way out', () => {
    const presentation = hostLossPresentation({ state: 'host-lost', remainingMs: 0, silentForMs: 95_000 });
    expect(presentation.visible).toBe(true);
    expect(presentation.tone).toBe('error');
    expect(presentation.headline).toBe('HOST LEFT THE MATCH');
    expect(presentation.action).toBe('rejoin');
    expect(presentation.actionLabel).toBe('REJOIN LAST MATCH');
    expect(presentation.detail.length).toBeGreaterThan(20);
  });

  it('distinguishes a deliberate lobby close from a lost host', () => {
    const presentation = hostLossPresentation({ state: 'closed-by-host', remainingMs: null, silentForMs: null });
    expect(presentation.headline).toBe('HOST CLOSED THE LOBBY');
    expect(presentation.action).toBe('return-to-lobby');
  });

  it('counts the retry window down in whole seconds', () => {
    expect(hostLossPresentation({ state: 'reconnecting', remainingMs: 30_400, silentForMs: 1_000 }).detail)
      .toContain('31s');
    expect(hostLossPresentation({ state: 'reconnecting', remainingMs: null, silentForMs: null }).visible).toBe(true);
  });

  it('gives every visible state a headline and an action label', () => {
    for (const state of ['unstable', 'reconnecting', 'host-lost', 'closed-by-host'] as const) {
      const presentation = hostLossPresentation({ state, remainingMs: 5_000, silentForMs: 5_000 });
      expect(presentation.visible).toBe(true);
      expect(presentation.headline).not.toBe('');
      expect(presentation.actionLabel).not.toBe('');
      expect(presentation.action).not.toBe('none');
    }
  });
});

// ---------------------------------------------------------------------------

describe('self-promotion authorization', () => {
  it('authorizes the mandated successor at one term above its mandate', () => {
    const decision = authorizeSelfPromotion(promotionSample());
    expect(decision.promote).toBe(true);
    if (!decision.promote) return;
    expect(decision.term).toBe(5);
    expect(decision.successorId).toBe('guest-a');
    expect(decision.roomCode).toBe(ROOM);
  });

  it('never promotes on silence alone — only a confirmed-lost host qualifies', () => {
    for (const state of ['healthy', 'unstable', 'reconnecting', 'inactive'] as const) {
      const decision = authorizeSelfPromotion(promotionSample({
        assessment: { state, remainingMs: 20_000, silentForMs: 40_000 },
      }));
      expect(refusalOf(decision)).toBe('host-not-confirmed-lost');
    }
  });

  it('never promotes after a deliberate lobby close', () => {
    expect(refusalOf(authorizeSelfPromotion(promotionSample({
      assessment: { state: 'closed-by-host', remainingMs: null, silentForMs: null },
    })))).toBe('lobby-closed-by-host');
  });

  it('never lets a guest appoint itself without a host-issued mandate', () => {
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ mandate: null })))).toBe('no-mandate');
    expect(refusalOf(authorizeSelfPromotion(promotionSample({
      mandate: { ...mandate(), term: 0 } as SuccessionMandate,
    })))).toBe('malformed-mandate');
  });

  it('stands down when the mandate names a different guest', () => {
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ selfId: 'guest-b' })))).toBe('mandate-names-another-guest');
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ selfId: '' })))).toBe('mandate-names-another-guest');
  });

  it('refuses a mandate minted for a different room', () => {
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ roomCode: 'other-room' })))).toBe('mandate-room-mismatch');
  });

  it('refuses an expired mandate', () => {
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ nowEpochMs: EXPIRES_AT })))).toBe('mandate-expired');
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ nowEpochMs: 0 })))).toBe('mandate-expired');
  });

  it('refuses a mandate older than a term it has already seen', () => {
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ highestObservedTerm: 9 })))).toBe('mandate-superseded');
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ highestObservedTerm: -1 })))).toBe('mandate-superseded');
  });

  it('refuses when its roster is not the revision the host elected from', () => {
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ roster: roster({ revision: 18 }) }))))
      .toBe('roster-revision-mismatch');
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ roster: roster({ hostId: 'guest-b' }) }))))
      .toBe('roster-revision-mismatch');
    expect(refusalOf(authorizeSelfPromotion(promotionSample({
      roster: { revision: 17, hostId: 'host-1', members: [] } as unknown as SuccessionRoster,
    })))).toBe('roster-revision-mismatch');
  });

  it('refuses when its own election disagrees with the mandate', () => {
    // The mandate names guest-a, but on this roster guest-a is already gone, so
    // this guest would elect guest-b. Disagreement means refuse, never race.
    const drifted = roster({
      members: [
        { id: 'host-1', connected: true },
        { id: 'guest-a', connected: false },
        { id: 'guest-b', connected: true },
        { id: 'guest-c', connected: true },
      ],
    });
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ roster: drifted }))))
      .toBe('election-disagrees-with-mandate');
  });

  it('refuses when its roster elects nobody at all', () => {
    expect(refusalOf(authorizeSelfPromotion(promotionSample({
      roster: roster({
        members: [
          { id: 'host-1', connected: true },
          { id: 'guest-a', connected: false },
        ],
      }),
    })))).toBe('election-undecided');
  });

  it('refuses a lone survivor, which is far more likely a partition than a dead host', () => {
    const alone = roster({
      members: [
        { id: 'host-1', connected: true },
        { id: 'guest-a', connected: true },
        { id: 'guest-b', connected: false },
        { id: 'guest-c', connected: false },
      ],
    });
    expect(survivingGuestCount(alone)).toBeLessThan(MIN_SURVIVORS_FOR_MIGRATION);
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ roster: alone })))).toBe('insufficient-survivors');
  });

  it('refuses when it holds no mirrored authority — the state of the world today', () => {
    expect(refusalOf(authorizeSelfPromotion(promotionSample({ holdsMirroredAuthority: false }))))
      .toBe('no-authority-to-adopt');
  });

  it('covers every declared refusal reason', () => {
    const declared: readonly PromotionRefusal[] = [
      'host-not-confirmed-lost',
      'lobby-closed-by-host',
      'no-mandate',
      'malformed-mandate',
      'mandate-names-another-guest',
      'mandate-room-mismatch',
      'mandate-superseded',
      'mandate-expired',
      'roster-revision-mismatch',
      'election-disagrees-with-mandate',
      'election-undecided',
      'insufficient-survivors',
      'no-authority-to-adopt',
    ];
    const observed = new Set<PromotionRefusal | 'promoted'>([
      refusalOf(authorizeSelfPromotion(promotionSample({ assessment: { state: 'healthy', remainingMs: null, silentForMs: null } }))),
      refusalOf(authorizeSelfPromotion(promotionSample({ assessment: { state: 'closed-by-host', remainingMs: null, silentForMs: null } }))),
      refusalOf(authorizeSelfPromotion(promotionSample({ mandate: null }))),
      refusalOf(authorizeSelfPromotion(promotionSample({ mandate: { ...mandate(), term: 0 } as SuccessionMandate }))),
      refusalOf(authorizeSelfPromotion(promotionSample({ selfId: 'guest-b' }))),
      refusalOf(authorizeSelfPromotion(promotionSample({ roomCode: 'other-room' }))),
      refusalOf(authorizeSelfPromotion(promotionSample({ highestObservedTerm: 9 }))),
      refusalOf(authorizeSelfPromotion(promotionSample({ nowEpochMs: EXPIRES_AT }))),
      refusalOf(authorizeSelfPromotion(promotionSample({ roster: roster({ revision: 99 }) }))),
      refusalOf(authorizeSelfPromotion(promotionSample({
        roster: roster({
          members: [
            { id: 'host-1', connected: true },
            { id: 'guest-a', connected: false },
            { id: 'guest-b', connected: true },
            { id: 'guest-c', connected: true },
          ],
        }),
      }))),
      refusalOf(authorizeSelfPromotion(promotionSample({
        roster: roster({ members: [{ id: 'host-1', connected: true }, { id: 'guest-a', connected: false }] }),
      }))),
      refusalOf(authorizeSelfPromotion(promotionSample({
        roster: roster({
          members: [
            { id: 'host-1', connected: true },
            { id: 'guest-a', connected: true },
            { id: 'guest-b', connected: false },
            { id: 'guest-c', connected: false },
          ],
        }),
      }))),
      refusalOf(authorizeSelfPromotion(promotionSample({ holdsMirroredAuthority: false }))),
    ]);
    expect([...observed].sort()).toEqual([...declared].sort());
  });

  it('authorizes at most one guest from any single roster', () => {
    const authorized = ['guest-a', 'guest-b', 'guest-c'].filter((selfId) => (
      authorizeSelfPromotion(promotionSample({ selfId })).promote
    ));
    expect(authorized).toEqual(['guest-a']);
  });

  it('authorizes nobody once the mandate has lapsed, no matter who asks', () => {
    const authorized = ['guest-a', 'guest-b', 'guest-c'].filter((selfId) => (
      authorizeSelfPromotion(promotionSample({ selfId, nowEpochMs: EXPIRES_AT + 1 })).promote
    ));
    expect(authorized).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('room-code claim as the mutual-exclusion lock', () => {
  it('promotes only on an exclusive claim and aborts permanently otherwise', () => {
    expect(resolveRoomClaimOutcome('claimed')).toBe('promote');
    // The old host may still be serving guests over data channels that outlived
    // its signalling. Retrying here is how a split brain gets built.
    expect(resolveRoomClaimOutcome('unavailable-id')).toBe('abort');
    expect(resolveRoomClaimOutcome('signalling-error')).toBe('abort');
  });
});

describe('follower-side validation of a promoted host', () => {
  it('accepts the mandated successor presenting the next term', () => {
    const acceptance = acceptPromotedHost(followerSample());
    expect(acceptance.accept).toBe(true);
    expect(acceptance.accept && acceptance.term).toBe(5);
    expect(acceptance.accept && acceptance.hostId).toBe('guest-a');
  });

  it('rejects a guest that promoted itself with no valid mandate', () => {
    expect(acceptPromotedHost(followerSample({ presentedMandate: null })).accept).toBe(false);
    expect(acceptPromotedHost(followerSample({
      presentedMandate: { ...mandate(), successorId: 'host-1' } as SuccessionMandate,
    })).accept).toBe(false);
  });

  it('rejects a claimant that is not the guest the mandate names', () => {
    const acceptance = acceptPromotedHost(followerSample({ claimantId: 'guest-b' }));
    expect(acceptance.accept === false && acceptance.reason).toBe('claimant-not-the-successor');
  });

  it('rejects a stale or replayed term, which is how a recovered old host is fenced out', () => {
    for (const sample of [
      followerSample({ presentedTerm: 4 }),
      followerSample({ presentedTerm: 6 }),
      followerSample({ presentedTerm: 5, highestObservedTerm: 5 }),
      followerSample({ presentedTerm: 5, highestObservedTerm: 7 }),
      followerSample({ presentedTerm: 0 }),
    ]) {
      const acceptance = acceptPromotedHost(sample);
      expect(acceptance.accept === false && acceptance.reason).toBe('stale-term');
    }
  });

  it('rejects a mandate for another room', () => {
    const acceptance = acceptPromotedHost(followerSample({ roomCode: 'other-room' }));
    expect(acceptance.accept === false && acceptance.reason).toBe('room-mismatch');
  });

  it('rejects when the follower roster disagrees with the mandate', () => {
    expect((acceptPromotedHost(followerSample({ roster: roster({ revision: 18 }) })) as { reason?: string }).reason)
      .toBe('roster-revision-mismatch');
    const drifted = roster({
      members: [
        { id: 'host-1', connected: true },
        { id: 'guest-a', connected: false },
        { id: 'guest-b', connected: true },
        { id: 'guest-c', connected: true },
      ],
    });
    expect((acceptPromotedHost(followerSample({ roster: drifted })) as { reason?: string }).reason)
      .toBe('election-disagrees-with-mandate');
  });

  it('covers every declared follower refusal reason', () => {
    const declared: readonly FollowerAcceptanceRefusal[] = [
      'malformed-mandate',
      'room-mismatch',
      'stale-term',
      'claimant-not-the-successor',
      'roster-revision-mismatch',
      'election-disagrees-with-mandate',
    ];
    const observed = new Set<string>();
    for (const sample of [
      followerSample({ presentedMandate: null }),
      followerSample({ roomCode: 'other-room' }),
      followerSample({ presentedTerm: 4 }),
      followerSample({ claimantId: 'guest-b' }),
      followerSample({ roster: roster({ revision: 18 }) }),
      followerSample({
        roster: roster({
          members: [
            { id: 'host-1', connected: true },
            { id: 'guest-a', connected: false },
            { id: 'guest-b', connected: true },
            { id: 'guest-c', connected: true },
          ],
        }),
      }),
    ]) {
      const acceptance = acceptPromotedHost(sample);
      if (!acceptance.accept) observed.add(acceptance.reason);
    }
    expect([...observed].sort()).toEqual([...declared].sort());
  });

  it('never accepts two different hosts at the same term', () => {
    const accepted = ['guest-a', 'guest-b', 'guest-c'].filter((claimantId) => (
      acceptPromotedHost(followerSample({ claimantId })).accept
    ));
    expect(accepted).toEqual(['guest-a']);
  });
});

describe('stale-host stand-down', () => {
  it('stands a host down as soon as it observes a higher term', () => {
    expect(resolveHostTermConflict(4, 5)).toBe('stand-down');
    expect(resolveHostTermConflict(0, INITIAL_HOST_TERM)).toBe('stand-down');
  });

  it('retains the room on equal or lower observed terms', () => {
    expect(resolveHostTermConflict(5, 5)).toBe('retain');
    expect(resolveHostTermConflict(5, 4)).toBe('retain');
    expect(resolveHostTermConflict(5, Number.NaN)).toBe('retain');
    expect(resolveHostTermConflict(5, 5.5)).toBe('retain');
  });

  it('completes the fence: a promoted successor outranks the host that appointed it', () => {
    const decision = authorizeSelfPromotion(promotionSample());
    expect(decision.promote).toBe(true);
    if (!decision.promote) return;
    // The recovered old host still believes it is at the term it minted.
    expect(resolveHostTermConflict(mandate().term, decision.term)).toBe('stand-down');
    // And its followers will not take it back.
    expect(acceptPromotedHost(followerSample({
      claimantId: 'guest-a',
      presentedTerm: decision.term,
      highestObservedTerm: mandate().term,
    })).accept).toBe(true);
  });
});
