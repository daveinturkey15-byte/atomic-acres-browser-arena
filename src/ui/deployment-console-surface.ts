/**
 * deployment-console-surface.ts — the deployment console's non-copy paint.
 *
 * Extracted from `src/legacy-main.ts` on 2026-09-06 (HF-536 S1 salvage) to pay
 * the legacy size ratchet for the HF-372 briefing wiring landing in the same
 * commit. Behaviour is unchanged: the same writes, in the same order, with the
 * same strings and the same values.
 *
 * The extraction is also what makes the HF-372 wiring reviewable, because it
 * draws the writer boundary the wiring depends on. The deployment console has
 * two element owners and they do not overlap:
 *
 *   - COPY — `ui/deployment-briefing-surface.ts` owns the kicker, the title and
 *     the status line, and writes them once per deployment.
 *   - PAINT — this module owns the poster/video pair, the progress bar, the
 *     percent and ETA outputs, the `<em>` stage row and the machine-readable
 *     dataset mirror, and writes them on every stage change.
 *
 * `setStatus()` in `legacy-main.ts` is a third writer that borrows the status
 * line while the menu lifecycle is `deploying`; the ordering that keeps it off
 * the briefing is documented at the `applyDeploymentBriefing` call site. Nothing
 * in this file touches the kicker, the title or the status line; the sibling
 * test asserts that, and `src/deployment-briefing-main-integration.test.ts`
 * asserts the call site in `legacy-main.ts` that depends on it.
 *
 * Deliberately NOT extracted: the three `delete deploymentTransition.dataset.ready*`
 * lines that open a deployment. `src/admission-debug-contract.test.ts` pins them
 * as literal source inside `legacy-main.ts`, and a refactor is not a reason to
 * move a line another gate reads.
 */
import type { DeploymentLoadingProgress, DeploymentLoadingStage } from '../deployment-loading-progress';

/** `#deployment-transition` itself. Narrower than `HTMLElement` so tests need no DOM. */
export type DeploymentConsoleRoot = { dataset: { [key: string]: string | undefined } };
/** `#deployment-transition-poster`. */
// `hidden` is `boolean | string` because the DOM lib models `hidden="until-found"`.
export type DeploymentPosterTarget = { src: string; width: number; height: number; hidden: boolean | string };
/** `#deployment-transition-video`. */
export type DeploymentVideoTarget = { hidden: boolean | string };

export function applyDeploymentTransitionPoster(
  poster: DeploymentPosterTarget,
  video: DeploymentVideoTarget,
  preview: Readonly<{ poster: string; width: number; height: number }>,
): void {
  poster.src = preview.poster;
  poster.width = preview.width;
  poster.height = preview.height;
  poster.hidden = false;
  video.hidden = true;
}

export type DeploymentTransitionPresentation = Readonly<{
  arenaId: string;
  presentationId: string;
  reducedMotion: boolean;
}>;

/** The dataset mirror the browser gates and the QA harness read. */
export function applyDeploymentTransitionPresentation(
  root: DeploymentConsoleRoot,
  presentation: DeploymentTransitionPresentation,
): void {
  root.dataset.arena = presentation.arenaId;
  root.dataset.presentation = presentation.presentationId;
  root.dataset.media = presentation.reducedMotion ? 'reduced-motion-poster' : 'shared-prerecorded-video';
  root.dataset.liveRender = 'false';
  root.dataset.statusKind = 'ok';
}

/** The subset of each progress element this surface writes. */
export type DeploymentLoadingProgressTargets = Readonly<{
  /** `#deployment-transition-progress` — a `<progress>`; its text is the fallback. */
  bar: { value: number; textContent: string | null };
  /** `#deployment-transition-percent` — an `<output>`. */
  percent: { value: string };
  /** `#deployment-transition-eta` — an `<output>`. */
  eta: { value: string };
  /** `#deployment-transition-stage` — the `<em>` under the progress meta row. */
  stage: { textContent: string | null };
  root: DeploymentConsoleRoot;
}>;

export function deploymentLoadingEtaText(progress: DeploymentLoadingProgress): string {
  if (progress.completed) return '100% · IN GAME';
  return progress.etaSeconds === null ? 'ETA ESTIMATING…' : `ETA ${progress.etaSeconds}s`;
}

/** The `<em>` row keeps restating what 100% means; players read it as the promise. */
export function deploymentLoadingStageText(progress: DeploymentLoadingProgress): string {
  return `${progress.label.toUpperCase()} · 100% = IN GAME`;
}

export function applyDeploymentLoadingProgress(
  targets: DeploymentLoadingProgressTargets,
  stage: DeploymentLoadingStage,
  progress: DeploymentLoadingProgress,
): void {
  targets.bar.value = progress.percent;
  targets.bar.textContent = `${progress.percent}%`;
  targets.percent.value = `${progress.percent}%`;
  targets.eta.value = deploymentLoadingEtaText(progress);
  targets.stage.textContent = deploymentLoadingStageText(progress);
  targets.root.dataset.loadingStage = stage;
  targets.root.dataset.loadingPercent = String(progress.percent);
  targets.root.dataset.loadingEtaSeconds = progress.etaSeconds === null ? 'estimating' : String(progress.etaSeconds);
  targets.root.dataset.loadingComplete = String(progress.completed);
}
