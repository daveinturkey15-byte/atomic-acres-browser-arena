import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from '../arena-identity';
import {
  CHANGELOG,
  PENDING_PRODUCTION_RELEASE,
  lastUpdatedButtonLabel,
  latestChangelogEntry,
  releaseFeatureLine,
} from '../changelog';
import { PROJECT_MAP_RELEASE, createProjectMapBundle } from '../project-map';
import { PASS66_RELEASE_IDENTITY } from '../release-identity';
import { projectMapButtonMarkup, projectMapDialogMarkup } from './project-map-dialog';
import { releaseHistoryButtonMarkup, releaseHistoryDialogMarkup } from './release-history-dialog';

/*
 * HF-406 - the identity-surface gate.
 *
 * Owner, 2026-09-02, verbatim: "ensure the top right thing is an accurate update of
 * both the current pass number and features, and the map button contains the proper
 * project map too. Currently it says pass 73 HITL?!"
 *
 * He was reading three surfaces that had drifted apart from the build stamp:
 *
 *   badge            HITL CANDIDATE · NOT LIVE   (no pass number at all)
 *   features panel   PASS 73 · LOCAL CANDIDATE   (eleven passes stale)
 *   project map      PASS 84 · Pass 73 · release candidate
 *
 * measured on the local build AND on the live PASS 83 channel that day. This is the
 * fourth repeat of the class (a PASS 82 publish shipped calling itself PASS 81), so
 * the rule is mechanical from here: every rendered identity surface derives from the
 * ONE stamped pass, and the internal review acronym never appears in a player-facing
 * surface. A stamp bump without its changelog entry fails this file.
 *
 * Scope note: pass numbers OTHER than the current one are legitimate in the release
 * ARCHIVE (that is what history is) and in the stable-fallback channel readout. The
 * assertions below therefore target the current-release surfaces precisely rather than
 * banning old pass numbers from the whole document.
 */

const CURRENT_PASS = PASS66_RELEASE_IDENTITY.pass;
const CURRENT_NUMBER = CURRENT_PASS.replace(/[^0-9]+/gu, '');

/** Rendered text only: an id or a class must never satisfy an identity assertion. */
function renderedText(markup: string): string {
  return markup.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function passNumbersIn(markup: string): string[] {
  return [...new Set(renderedText(markup).toUpperCase().match(/PASS \d+/gu) ?? [])];
}

/** The first `<li>` of the release-history list: the current pass's own card. */
function currentEntryCard(markup: string): string {
  const start = markup.indexOf('<li data-changelog-id=');
  expect(start).toBeGreaterThanOrEqual(0);
  const next = markup.indexOf('<li data-changelog-id=', start + 1);
  return markup.slice(start, next === -1 ? undefined : next);
}

describe('HF-406 release identity surfaces', () => {
  it('keeps the changelog current entry and the build stamp the same pass', () => {
    const current = latestChangelogEntry();
    expect(current).toBe(CHANGELOG[0]);
    expect(current.pass).toBe(CURRENT_PASS);
    // A stamp bump with no new entry leaves the id/title naming the previous pass.
    expect(current.id).toBe(`pass${CURRENT_NUMBER}`);
    expect(current.title).toContain(`Pass ${CURRENT_NUMBER}`);
    expect(current.areas.length).toBeGreaterThan(0);
    expect(current.highlights.length).toBeGreaterThan(2);
    // Exactly one entry may claim the stamped pass.
    expect(CHANGELOG.filter((entry) => entry.pass === CURRENT_PASS)).toHaveLength(1);
    // The project map reads the same record rather than keeping a second copy.
    expect(PROJECT_MAP_RELEASE).toBe(current);
  });

  it('leads the top-right badge with the stamped pass and this pass\'s feature line', () => {
    const badge = releaseHistoryButtonMarkup();
    const text = renderedText(badge);
    expect(text).toContain(CURRENT_PASS);
    expect(passNumbersIn(badge)).toEqual([CURRENT_PASS]);
    expect(text).toContain(releaseFeatureLine());
    expect(releaseFeatureLine()).not.toHaveLength(0);
    expect(text).not.toMatch(/HITL/iu);
    // Published or not, the label still leads with the pass number.
    const published = { ...CHANGELOG[0]!, releasedAt: '2026-09-02T12:00:00Z' };
    expect(lastUpdatedButtonLabel(published).startsWith(`${CURRENT_PASS} · `)).toBe(true);
    expect(lastUpdatedButtonLabel(CHANGELOG[0]!)).toBe(
      CHANGELOG[0]!.releasedAt === PENDING_PRODUCTION_RELEASE
        ? `${CURRENT_PASS} · RELEASE CANDIDATE`
        : lastUpdatedButtonLabel(CHANGELOG[0]!),
    );
  });

  it('opens the features panel on this pass, with no other pass on the current card', () => {
    const markup = releaseHistoryDialogMarkup();
    const header = markup.slice(0, markup.indexOf('<ol id="changelog-list">'));
    expect(renderedText(header)).toContain(CURRENT_PASS);
    const card = currentEntryCard(markup);
    expect(card).toContain(`data-changelog-id="pass${CURRENT_NUMBER}"`);
    // The card's identity chip names one pass: this one. (Its body copy may name other
    // passes on purpose - this pass pins Pass 83 as the safe backup.)
    const chip = card.slice(card.indexOf('class="changelog-entry-pass"'), card.indexOf('</div>', card.indexOf('class="changelog-entry-pass"')));
    expect(passNumbersIn(chip)).toEqual([CURRENT_PASS]);
    expect(renderedText(card)).toContain(CHANGELOG[0]!.highlights[0]!);
  });

  it('opens the project map on this pass and derives its arena list from the canonical ids', () => {
    const bundle = createProjectMapBundle('2026-07-24T17:00:00Z');
    expect(bundle.current.release.pass).toBe(CURRENT_PASS);
    const markup = projectMapDialogMarkup(bundle);
    const meta = markup.slice(markup.indexOf('class="project-map-meta"'), markup.indexOf('id="project-map-tabs"'));
    expect(passNumbersIn(meta)).toEqual([CURRENT_PASS]);
    expect(renderedText(meta)).toContain(`Pass ${CURRENT_NUMBER} · `);
    const intro = markup.slice(markup.indexOf('class="project-map-intro"'), markup.indexOf('class="project-channel-state"'));
    expect(passNumbersIn(intro)).toEqual([CURRENT_PASS]);
    // The map is the real project map: the shipped arena roster, not a written list.
    const structure = markup.slice(markup.indexOf('data-project-map-page="structure"'), markup.indexOf('data-project-map-page="changes"'));
    for (const arena of ARENA_IDS) expect(structure).toContain(arena);
    expect(structure).toContain('src/arena-identity.ts');
    // The changes page leads with the current pass.
    const changes = markup.slice(markup.indexOf('data-project-map-page="changes"'), markup.indexOf('data-project-map-page="archive"'));
    expect(passNumbersIn(changes)[0]).toBe(CURRENT_PASS);
  });

  it('never renders the internal review acronym on a player-facing surface', () => {
    const rendered = renderedText([
      releaseHistoryButtonMarkup(),
      releaseHistoryDialogMarkup(),
      projectMapButtonMarkup(),
      projectMapDialogMarkup(createProjectMapBundle('2026-07-24T17:00:00Z')),
    ].join('\n'));
    // Includes the whole archive: a historical note may not smuggle it back either.
    expect(rendered).not.toMatch(/HITL/iu);
    expect(rendered).not.toMatch(/AWAITING OWNER/iu);
  });
});
