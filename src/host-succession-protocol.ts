/**
 * HF-325 — the wire carriage for host succession.
 *
 * WHAT THIS MODULE IS
 * -------------------
 * The three peer messages that let a host hand its match to an elected
 * successor instead of taking the room down with it:
 *
 *   host-succession-mandate   host -> everyone. "If I die, this exact guest is
 *                             next, at this term." Small, sent on roster change.
 *   host-authority-mirror     host -> the mandate holder ONLY. The adoptable
 *                             match document produced by host-authority-mirror.ts.
 *                             Large, sent rarely; never broadcast.
 *   host-promoted             promoted successor -> followers. "I hold the room
 *                             now, at mandate.term + 1." The term fence's
 *                             follower half, and the stale host's stand-down cue.
 *
 * WHY IT IS A SATELLITE MODULE AND NOT PART OF protocol.ts
 * --------------------------------------------------------
 * `protocol.ts` is deliberately the top of the runtime import graph: every
 * satellite protocol module (killstreak, railgun, smoke, flare, timed-map-weapon,
 * interactive-world) is a LEAF that `protocol.ts` imports, and the only module
 * that points the other way — `hosted-bots.ts` — uses `import type`, which is
 * erased. There are no runtime cycles through `protocol.ts` today.
 *
 * The mirror message carries a `HostMatchCheckpoint`, and
 * `host-match-checkpoint.ts` imports VALUES from `protocol.ts`
 * (`WEAPON_IDS`, `isPlayerSnapshot`, ...). Importing `isHostMatchCheckpoint`
 * into `protocol.ts` — as the original handoff proposed — would therefore create
 * the first real runtime cycle through the protocol module, whose failure mode
 * is a temporal-dead-zone throw at boot: a blank screen, not a test failure.
 * So this module takes the checkpoint as an `import type` (erased) and validates
 * only the ENVELOPE, and the deep `isHostMatchCheckpoint` schema check happens
 * exactly once, at the receive site, in `host-succession-wire.ts`.
 *
 * That split is not a weakening: nothing may adopt `message.checkpoint` except
 * through `acceptAuthorityMirror`, which refuses any document that fails the
 * full schema check, the cross-field checks and the clock rebase. What the
 * envelope guarantees is narrower and stated plainly: this is a legal, bounded,
 * host-authored message addressed to one named peer.
 *
 * WHY THESE MESSAGES CARRY A LOCAL `schemaVersion` AND NOT
 * `MULTIPLAYER_PROTOCOL_VERSION`
 * -----------------------------------------------------------------------
 * Same reason, plus one: it is the pattern every other satellite already uses
 * (`TIMED_MAP_WEAPON_SCHEMA_VERSION`, `BOT_WEAPON_PRESENTATION_SCHEMA_VERSION`),
 * and adding a message TYPE is purely additive. A peer on an older bundle fails
 * `isGameMessage` on these and drops them at the transport
 * (`network.ts` `wireHostChannel`), which is precisely the fail-closed fallback
 * this row requires: no mirror, no promotion, current behaviour. Nothing that
 * already exists on the wire changes shape, so no old peer can misread anything.
 *
 * WHAT IS DELIBERATELY NOT ON THE WIRE
 * ------------------------------------
 * The roster. `authorizeSelfPromotion` (G2) requires the promoting guest to
 * recompute the election from the roster IT holds and to refuse if that roster
 * is not the revision the mandate cites. Shipping the roster alongside the
 * mandate would let the mandate supply its own corroboration, which is not
 * corroboration at all. Guests already hold a host-authored roster from
 * `lobby-state`; that is the copy G2 is about.
 */

import {
  isSuccessionMandate,
  type SuccessionMandate,
} from './host-migration';
// Type-only on purpose: see the cycle note above. Nothing here reads the
// checkpoint's contents; `host-succession-wire.ts` owns that.
import type { HostMatchCheckpoint } from './host-match-checkpoint';

/**
 * Versions the three succession messages independently of
 * `MULTIPLAYER_PROTOCOL_VERSION`, exactly as the other satellite protocol
 * modules do. Bump this when one of these message SHAPES changes.
 */
export const HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION = 1;

/**
 * Envelope ceiling for the mirrored checkpoint, measured the same way the
 * storage cap is (`JSON.stringify(...).length`). Held as a local literal rather
 * than imported so this module stays a leaf; `host-succession-protocol.test.ts`
 * pins it to `HOST_MATCH_CHECKPOINT_MAX_BYTES` so the two can never drift.
 *
 * A document over this cap could not have been produced by
 * `mirrorHostAuthorityToSuccessor` (which refuses with `oversized-mirror`) and
 * could not be persisted by the receiver anyway, so admitting it would only buy
 * a parse cost on a message that is guaranteed to be rejected later.
 */
export const HOST_AUTHORITY_MIRROR_MAX_CHECKPOINT_BYTES = 64 * 1024;

const MAX_ID_LENGTH = 80;
const MAX_EPOCH_MS = 10_000_000_000_000;

/**
 * HF-325: the host's standing "if I die, this guest is next" statement,
 * rebroadcast whenever the roster changes. Guests never mint one — see the G1
 * note in `host-migration.ts`.
 */
export type HostSuccessionMandateMessage = {
  type: 'host-succession-mandate';
  schemaVersion: typeof HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION;
  by: string;
  mandate: SuccessionMandate;
  nonce: number;
};

/**
 * HF-325: the host's adoptable authority snapshot, addressed to the current
 * mandate holder ONLY. Never broadcast: it carries every guest's resume-token
 * digest and the entire match ledger.
 *
 * `checkpoint` is still expressed in the HOST's epoch clock. The receiver must
 * call `rebaseMirroredCheckpointClock` exactly once, on arrival — which is what
 * `acceptAuthorityMirror` in `host-succession-wire.ts` does.
 */
export type HostAuthorityMirrorMessage = {
  type: 'host-authority-mirror';
  schemaVersion: typeof HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION;
  by: string;
  forPlayerId: string;
  mandate: SuccessionMandate;
  /** Envelope-checked only. Deep-validated at the receive site. */
  checkpoint: HostMatchCheckpoint;
  /** The host's `Date.now()` at send, so the receiver can measure the offset. */
  hostEpochMs: number;
  nonce: number;
};

/** HF-325 G4: a promoted guest presenting its right to host, at mandate.term + 1. */
export type HostPromotedMessage = {
  type: 'host-promoted';
  schemaVersion: typeof HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION;
  by: string;
  mandate: SuccessionMandate;
  term: number;
  nonce: number;
};

export type HostSuccessionProtocolMessage =
  | HostSuccessionMandateMessage
  | HostAuthorityMirrorMessage
  | HostPromotedMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isParticipantId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/**
 * Bounded serialized size, without trusting the sender's own accounting.
 * `JSON.stringify` throws on a cyclic payload; a payload that cannot be measured
 * is refused rather than admitted unmeasured.
 */
function checkpointEnvelopeWithinCap(value: unknown): boolean {
  if (!isRecord(value)) return false;
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string'
      && serialized.length <= HOST_AUTHORITY_MIRROR_MAX_CHECKPOINT_BYTES;
  } catch {
    return false;
  }
}

/**
 * HF-325: the envelope guard. Structural, bounded, and cross-checked against the
 * mandate it carries — but deliberately NOT a checkpoint schema check. See the
 * module header for why that check lives at the receive site instead.
 */
export function isHostSuccessionProtocolMessage(value: unknown): value is HostSuccessionProtocolMessage {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION) return false;
  if (!isParticipantId(value.by)) return false;
  if (!Number.isFinite(value.nonce)) return false;
  switch (value.type) {
    case 'host-succession-mandate':
      // The signer and the issuer must be the same peer, so a guest cannot
      // relay a mandate it did not mint under its own name.
      return isSuccessionMandate(value.mandate)
        && value.mandate.issuedByHostId === value.by;
    case 'host-authority-mirror':
      return isParticipantId(value.forPlayerId)
        && isSuccessionMandate(value.mandate)
        && value.mandate.issuedByHostId === value.by
        && value.mandate.successorId === value.forPlayerId
        && checkpointEnvelopeWithinCap(value.checkpoint)
        && Number.isSafeInteger(value.hostEpochMs)
        && Number(value.hostEpochMs) > 0
        && Number(value.hostEpochMs) <= MAX_EPOCH_MS;
    case 'host-promoted':
      // A claimant may only present the mandate that names IT, and only at the
      // exact term that mandate authorises. Any other pairing is not a weaker
      // claim, it is a different claim, and it is refused here rather than
      // argued about later.
      return isSuccessionMandate(value.mandate)
        && value.mandate.successorId === value.by
        && Number.isSafeInteger(value.term)
        && value.term === value.mandate.term + 1;
    default:
      return false;
  }
}

/**
 * Every succession message is signed by its author's own id. The host signs the
 * mandate and the mirror; the promoted successor signs `host-promoted`.
 */
export function hostSuccessionMessageBelongsToPlayer(
  message: HostSuccessionProtocolMessage,
  playerId: string,
): boolean {
  return Boolean(playerId) && message.by === playerId;
}

// NOTE ON HOST AUTHORITY: all three of these are host-authored, so
// `protocol.ts` `isHostAuthorityMessage` returns true for the whole union and
// `network.ts` drops every one of them arriving on a GUEST connection. That is
// the guard that stops a guest forging a mandate, injecting a mirror, or
// announcing its own promotion to the sitting host: a guest may never author
// admission or authority, before or after any election. `host-promoted` is
// included on purpose — a live host must not be talked into standing down by a
// peer it is currently serving; the room-code claim (G3) is what actually
// settles who holds the room.
