import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '../changelog';
import { createProjectMapBundle } from '../project-map';
import { projectMapButtonMarkup, projectMapDialogMarkup } from './project-map-dialog';
import { releaseHistoryButtonMarkup, releaseHistoryDialogMarkup } from './release-history-dialog';

describe('menu documentation dialogs', () => {
  it('renders the project map control, four pages, and both download surfaces', () => {
    const markup = `${projectMapButtonMarkup()}${projectMapDialogMarkup(createProjectMapBundle('2026-07-24T17:00:00Z'))}`;
    expect(markup).toContain('aria-controls="project-map-panel"');
    expect(markup.match(/role="tab"/g)).toHaveLength(4);
    expect(markup).toContain('data-project-map-page="structure"');
    expect(markup).toContain('DOWNLOAD HUMAN DOCS · MD');
    expect(markup).toContain('DOWNLOAD FULL DATA · JSON');
    expect(markup).toContain('src/authoritative-shot.ts');
    expect(markup).toContain('RELEASE CANDIDATE');
    expect(markup).toContain('PROMOTION TARGET · RELEASE-CANDIDATE');
    expect(markup).not.toContain('CURRENT LIVE');
  });

  it('renders release history from the shared changelog without inline event wiring', () => {
    const markup = `${releaseHistoryButtonMarkup()}${releaseHistoryDialogMarkup()}`;
    expect(markup).toContain('aria-controls="changelog-panel"');
    expect(markup).toContain('data-changelog-id="pass62"');
    expect(markup).toContain('LOCAL CANDIDATE');
    expect(markup).toContain('NOT PUBLISHED');
    // HF-406: the unpublished state is stated as a release state, not as an internal
    // review acronym on a player-facing panel.
    expect(markup).toContain('RELEASE CANDIDATE');
    expect(markup).not.toContain('AWAITING OWNER HITL');
  });

  it('renders timestamped production history without candidate copy', () => {
    const released = [{ ...CHANGELOG[0]!, releasedAt: '2026-08-11T10:00:00Z' }, ...CHANGELOG.slice(1)];
    const markup = releaseHistoryDialogMarkup(released);
    expect(markup).toContain('PUBLIC RELEASE HISTORY');
    expect(markup).toContain('CURRENT LIVE');
    expect(markup).not.toContain('LOCAL CANDIDATE');
    expect(markup).not.toContain('NOT PUBLISHED');
  });
});
