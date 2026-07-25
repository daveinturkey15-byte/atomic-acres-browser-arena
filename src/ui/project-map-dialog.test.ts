import { describe, expect, it } from 'vitest';
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
  });

  it('renders release history from the shared changelog without inline event wiring', () => {
    const markup = `${releaseHistoryButtonMarkup()}${releaseHistoryDialogMarkup()}`;
    expect(markup).toContain('aria-controls="changelog-panel"');
    expect(markup).toContain('data-changelog-id="pass62"');
    expect(markup).toContain('CURRENT LIVE');
  });
});
