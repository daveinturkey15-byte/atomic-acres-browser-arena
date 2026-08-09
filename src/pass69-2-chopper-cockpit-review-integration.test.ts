import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'scripts/blender/create-pass65-support-vehicles.py'),
  'utf8',
);

describe('Pass 69.2 accepted Chopper Gunner cockpit review', () => {
  it('renders the complete authored first-person cockpit rather than the HUD subtree alone', () => {
    const reviewStart = source.indexOf('def render_accepted_first_person()');
    const reviewEnd = source.indexOf('if FOCUSED_FP_REVIEW:', reviewStart);
    const review = source.slice(reviewStart, reviewEnd);

    expect(review).toContain('chopper-first-person-cockpit');
    expect(review).toContain('cockpit_nodes = set(hierarchy(cockpit))');
    expect(review).toContain('obj.hide_render = obj not in cockpit_nodes');
    expect(review).not.toContain('sightline_nodes = set(hierarchy(sightline))');
  });

  it('retains the explicit gunner sightline fail-closed check inside that cockpit', () => {
    const reviewStart = source.indexOf('def render_accepted_first_person()');
    const reviewEnd = source.indexOf('if FOCUSED_FP_REVIEW:', reviewStart);
    const review = source.slice(reviewStart, reviewEnd);

    expect(review).toContain('for obj in cockpit_nodes');
    expect(review).toContain('authored unobstructed chopper gunner sightline missing from focused review');
  });

  it('pins the independently reviewed full-cockpit frame in authoring and production gates', () => {
    const acceptedFrame = readFileSync(resolve(
      process.cwd(),
      'docs/assets/pass65-vehicles/chopper/pass65-chopper-first-person-instruments-16x9.png',
    ));
    const digest = createHash('sha256').update(acceptedFrame).digest('hex');
    const finalizer = readFileSync(resolve(process.cwd(), 'scripts/assets/finalize_pass65_menu_previews.mjs'), 'utf8');
    const verifier = readFileSync(resolve(process.cwd(), 'scripts/qa/verify-pass65-menu-preview-production.mjs'), 'utf8');

    expect(finalizer).toContain(`const acceptedCockpitDigest = '${digest}';`);
    expect(verifier).toContain(`const acceptedCockpitDigest = '${digest}';`);
  });
});
