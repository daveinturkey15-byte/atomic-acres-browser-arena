import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deploymentLoadingProgress } from '../deployment-loading-progress';
import {
  applyDeploymentLoadingProgress,
  applyDeploymentTransitionPoster,
  applyDeploymentTransitionPresentation,
  deploymentLoadingEtaText,
  deploymentLoadingStageText,
} from './deployment-console-surface';

function root() {
  return { dataset: {} as { [key: string]: string | undefined } };
}

function progressTargets() {
  return {
    bar: { value: -1, textContent: null as string | null },
    percent: { value: '' },
    eta: { value: '' },
    stage: { textContent: null as string | null },
    root: root(),
  };
}

describe('deployment console surface', () => {
  it('shows the poster and hides the dedicated video element', () => {
    const poster = { src: '', width: 0, height: 0, hidden: true };
    const video = { hidden: false };
    applyDeploymentTransitionPoster(poster, video, { poster: '/media/x.avif', width: 1280, height: 720 });
    expect(poster).toEqual({ src: '/media/x.avif', width: 1280, height: 720, hidden: false });
    expect(video.hidden).toBe(true);
  });

  it('mirrors the presentation, and names reduced motion as a poster', () => {
    const moving = root();
    applyDeploymentTransitionPresentation(moving, { arenaId: 'farcrysis', presentationId: 'flyover', reducedMotion: false });
    expect(moving.dataset).toEqual({
      arena: 'farcrysis',
      presentation: 'flyover',
      media: 'shared-prerecorded-video',
      liveRender: 'false',
      statusKind: 'ok',
    });
    const still = root();
    applyDeploymentTransitionPresentation(still, { arenaId: 'high-seas', presentationId: 'flyover', reducedMotion: true });
    expect(still.dataset.media).toBe('reduced-motion-poster');
    // The console never claims a live render; the arena has not been built yet.
    expect(still.dataset.liveRender).toBe('false');
  });

  it('writes the bar, both outputs, the stage row and the dataset mirror', () => {
    const console_ = progressTargets();
    const progress = deploymentLoadingProgress('binding-world', 4_000, 6);
    applyDeploymentLoadingProgress(console_, 'binding-world', progress);
    expect(console_.bar.value).toBe(progress.percent);
    expect(console_.bar.textContent).toBe(`${progress.percent}%`);
    expect(console_.percent.value).toBe(`${progress.percent}%`);
    expect(console_.eta.value).toBe(deploymentLoadingEtaText(progress));
    expect(console_.stage.textContent).toBe(deploymentLoadingStageText(progress));
    expect(console_.root.dataset.loadingStage).toBe('binding-world');
    expect(console_.root.dataset.loadingPercent).toBe(String(progress.percent));
    expect(console_.root.dataset.loadingComplete).toBe(String(progress.completed));
  });

  it('says IN GAME once the run completes, and estimates before there is an ETA', () => {
    expect(deploymentLoadingEtaText({ percent: 100, etaSeconds: 0, label: 'Ready', completed: true }))
      .toBe('100% · IN GAME');
    expect(deploymentLoadingEtaText({ percent: 6, etaSeconds: null, label: 'x', completed: false }))
      .toBe('ETA ESTIMATING…');
    expect(deploymentLoadingEtaText({ percent: 30, etaSeconds: 7, label: 'x', completed: false }))
      .toBe('ETA 7s');
    expect(deploymentLoadingStageText({ percent: 30, etaSeconds: 7, label: 'Building physics world', completed: false }))
      .toBe('BUILDING PHYSICS WORLD · 100% = IN GAME');
  });

  it('mirrors a null ETA as "estimating" rather than the string "null"', () => {
    const console_ = progressTargets();
    applyDeploymentLoadingProgress(console_, 'loading-module-assets', {
      percent: 0,
      etaSeconds: null,
      label: 'Loading game modules',
      completed: false,
    });
    expect(console_.root.dataset.loadingEtaSeconds).toBe('estimating');
  });

  it('never names the three copy elements the HF-372 briefing owns', () => {
    // If the paint half acquired a kicker/title/status target, the per-arena
    // copy would be erased by the next progress sample. The surface is defined
    // by the elements it can name, so that is what is asserted.
    const source = readFileSync(new URL('./deployment-console-surface.ts', import.meta.url), 'utf8');
    for (const owned of ['#deployment-transition-kicker', '#deployment-transition-title', '#deployment-transition-status']) {
      expect(source, `${owned} belongs to the briefing surface, not the paint surface`).not.toContain(owned);
    }
    // And it does still own the paint elements, so this cannot pass vacuously.
    for (const painted of ['#deployment-transition-progress', '#deployment-transition-stage']) {
      expect(source).toContain(painted);
    }
  });
});
