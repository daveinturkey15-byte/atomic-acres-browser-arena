/**
 * HF-339 / HF-355 — the #banner arbiter.
 *
 * The centre banner used to be shared unarbitrated state with five writers, so
 * a rare-weapon spawn during the 900 ms ENGAGE window overwrote the ENGAGE
 * banner, and the ENGAGE timeout then hid whatever was showing — including the
 * announcement the players were meant to read. This module owns the decision:
 * pure functions over an explicit state, with the DOM write applied by the one
 * caller in legacy-main.
 *
 * Ranking: fatal (system paused, never expires, never overwritten)
 *        > match-flow (ENGAGE and friends)
 *        > announcement (rare-weapon spawns and other transient notices).
 * Equal rank replaces (a newer ENGAGE supersedes an older one); lower rank
 * queues behind the active banner and is promoted when it expires, with its
 * remaining duration measured from promotion so it still gets read.
 */

export type BannerPriority = 'fatal' | 'match-flow' | 'announcement';

const PRIORITY_RANK: Readonly<Record<BannerPriority, number>> = Object.freeze({
  fatal: 3,
  'match-flow': 2,
  announcement: 1,
});

export type BannerRequest = Readonly<{
  /** Caller-unique id; expiry applies only while its request is still active. */
  id: number;
  priority: BannerPriority;
  headline: string;
  subline: string;
  /** null = holds until cleared or superseded. */
  durationMs: number | null;
  /** Raw innerHTML override for composite screens (match end). When present
   * the applier writes it verbatim instead of the headline/subline layout. */
  html?: string;
}>;

export type BannerDisplay =
  | Readonly<{ kind: 'show'; headline: string; subline: string; html?: string }>
  | Readonly<{ kind: 'hide' }>
  | Readonly<{ kind: 'none' }>;

export type BannerState = Readonly<{
  active: BannerRequest | null;
  /** At most one deferred request: the newest highest-rank loser. */
  queued: BannerRequest | null;
}>;

export type BannerTransition = Readonly<{ state: BannerState; display: BannerDisplay }>;

export function createBannerState(): BannerState {
  return Object.freeze({ active: null, queued: null });
}

const show = (state: BannerState): BannerTransition => Object.freeze({
  state,
  display: state.active
    ? Object.freeze({
      kind: 'show' as const,
      headline: state.active.headline,
      subline: state.active.subline,
      ...(state.active.html !== undefined ? { html: state.active.html } : {}),
    })
    : Object.freeze({ kind: 'hide' as const }),
});

/** A new banner request. Takes over at equal or higher rank; queues below. */
export function requestBanner(state: BannerState, request: BannerRequest): BannerTransition {
  const active = state.active;
  if (active === null || PRIORITY_RANK[request.priority] >= PRIORITY_RANK[active.priority]) {
    // The displaced banner is not worth resurrecting: if something outranked
    // it, its moment has passed (ENGAGE after the fact is noise). Only a
    // DEFERRED lower-rank request is queued, never a superseded higher one.
    return show(Object.freeze({ active: request, queued: state.queued?.id === request.id ? null : state.queued }));
  }
  // Deferred: keep the newest highest-rank pending request.
  const queued = state.queued === null
    || PRIORITY_RANK[request.priority] >= PRIORITY_RANK[state.queued.priority]
    ? request
    : state.queued;
  return Object.freeze({ state: Object.freeze({ active, queued }), display: Object.freeze({ kind: 'none' as const }) });
}

/**
 * A timed banner ran out. Applies only while that exact request is still the
 * active one — an expiry can never hide a banner it does not own, which is the
 * race this module exists to close. Promotes the queued request, if any.
 */
export function expireBanner(state: BannerState, id: number): BannerTransition {
  if (state.active === null || state.active.id !== id) {
    return Object.freeze({ state, display: Object.freeze({ kind: 'none' as const }) });
  }
  return show(Object.freeze({ active: state.queued, queued: null }));
}

/** Match reset / return-to-menu: drop everything and hide. */
export function clearBanners(): BannerTransition {
  return Object.freeze({ state: createBannerState(), display: Object.freeze({ kind: 'hide' as const }) });
}
