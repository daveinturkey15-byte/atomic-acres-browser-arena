/**
 * HF-414 / HF-418 — the graphics ladder contract.
 *
 * WHAT THIS SUITE IS FOR. The owner asked for profiles that are "clear as to
 * what they are and what they deliver and how/why". A description is only
 * clear while it is TRUE, and the way a description stops being true is that
 * someone edits a preset value and never looks at the words again. So the
 * control set of every shipped profile is fingerprinted, the fingerprints are
 * pinned here, and the same fingerprints have to appear in the audit document.
 * Change a preset without changing the doc and this suite fails.
 *
 * It also holds the two naming rules the shared skill `threejs-rtx-runtime-route`
 * imposes, because both were broken before and both are the kind of thing that
 * comes back:
 *   - no in-browser preset may claim RTX, RT cores, hardware acceleration or
 *     path tracing;
 *   - the RTX entry that DOES exist is an explainer whose value cannot be
 *     persisted as a preset.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHANGELOG, PENDING_PRODUCTION_RELEASE } from './changelog';
import { GRAPHICS_PRESET_VALUES } from './graphics-settings-registry';
import { normalizePass65Settings } from './pass65-settings';
import {
  GRAPHICS_PROFILE_DESCRIPTIONS,
  graphicsControlSetHash,
  graphicsControlSetHashes,
  graphicsProfileDescription,
} from './ui/graphics-profile-descriptions';
import {
  RTX_NATIVE_RUNTIME_AVAILABLE,
  RTX_NATIVE_RUNTIME_COPY,
  RTX_NATIVE_RUNTIME_DOWNLOAD_URL,
  RTX_NATIVE_RUNTIME_OPTION_VALUE,
} from './ui/rtx-native-runtime-explainer';
import { createPass64ShellViewModel, renderPass64Shell } from './ui/pass64-shell';

const AUDIT_DOC_PATH = 'docs/GRAPHICS_PROFILES_2026-09-03.md';

/**
 * THE PIN. These are the exact control sets the shipped descriptions and the
 * audit document describe. Regenerate deliberately, never to make a red test
 * green: a changed hash means a profile now renders something different from
 * what the player was told it renders, and the doc row has to be re-measured.
 */
const PINNED_CONTROL_SET_HASHES = Object.freeze({
  performance: '935f10c1',
  balanced: '642291dd',
  // HF-438 fold (PASS 92): QUALITY carries the trace at the light tier
  // (rayTracing reflections, AO high); MAX at the full tier. Re-fingerprinted
  // with graphicsControlSetHashes() at the fold, per the tripwire procedure,
  // and re-measured in docs/GRAPHICS_PROFILES_2026-09-03.md.
  // HF-490 (volume fire): adds the volumeFire control (off/off/low/high).
  // Re-fingerprinted with graphicsControlSetHashes(); the only preset whose
  // picture changes below Quality is none — off is off.
  high: '692ef633',
  max: 'db4143c6',
});

describe('HF-418 graphics ladder', () => {
  it('climbs in one order across the descriptions and the settings menu', () => {
    expect(GRAPHICS_PROFILE_DESCRIPTIONS.map(({ id }) => id))
      .toEqual(['performance', 'balanced', 'high', 'max']);
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    const presetMarkup = markup.match(/<select id="graphics-profile">([\s\S]*?)<\/select>/)?.[1] ?? '';
    expect([...presetMarkup.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)]
      .map((match) => [match[1], match[2]])).toEqual([
      ['performance', 'PERFORMANCE'],
      ['balanced', 'BALANCED'],
      ['high', 'QUALITY'],
      ['max', 'MAX'],
      ['custom', 'CUSTOM'],
      [RTX_NATIVE_RUNTIME_OPTION_VALUE, 'RTX — WHAT IS IT?'],
    ]);
  });

  it('renders one honest line and one detail block per mode, taken from the audit summary', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    for (const profile of GRAPHICS_PROFILE_DESCRIPTIONS) {
      expect(markup, profile.id).toContain(profile.summary);
      expect(markup, profile.id).toContain(profile.referenceFrameNote);
      for (const line of [...profile.turnsOn, ...profile.leavesOff]) {
        expect(markup, `${profile.id}: ${line.slice(0, 40)}`).toContain(line);
      }
    }
    // The line the ladder replaced. If it comes back, five modes are again
    // being described by one sentence about intent.
    expect(markup).not.toContain('Quality is the balanced default. Performance reduces presentation cost.');
    // Custom still has to say what it is; it has no audit row because it has
    // no fixed control set.
    expect(markup).toContain('data-graphics-profile="custom"');
  });

  it('gives every selectable mode a detail block, including CUSTOM', () => {
    // MEASURED DEFECT, found in review 2026-09-03. Five detail blocks were
    // rendered from GRAPHICS_PROFILE_DESCRIPTIONS and CUSTOM got only a
    // summary paragraph, so selecting CUSTOM left
    // <details id="graphics-profile-detail-panel"> - the one headed
    // "WHAT THIS MODE TURNS ON, AND WHAT IT COSTS" - opening onto nothing.
    // The old assertion above passed on the SUMMARY's attribute and never
    // looked inside the panel. This one derives the roster from the shipped
    // <select> instead of a list, so a rung added later cannot slip through.
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    const presetMarkup = markup.match(/<select id="graphics-profile">([\s\S]*?)<\/select>/)?.[1] ?? '';
    const selectable = [...presetMarkup.matchAll(/<option value="([^"]+)">/g)]
      .map((match) => match[1])
      .filter((value) => value !== RTX_NATIVE_RUNTIME_OPTION_VALUE);
    expect(selectable).toContain('custom');
    const panelStart = markup.indexOf('<details id="graphics-profile-detail-panel">');
    expect(panelStart).toBeGreaterThan(-1);
    const panel = markup.slice(panelStart, markup.indexOf('</details>', panelStart));
    for (const value of selectable) {
      expect(panel, `the detail panel opens onto nothing when ${value} is selected`)
        .toContain(`class="graphics-profile-detail" data-graphics-profile="${value}"`);
    }
    // The explainer is not a mode and must NOT get a block in the panel.
    expect(panel).not.toContain(`data-graphics-profile="${RTX_NATIVE_RUNTIME_OPTION_VALUE}"`);
  });

  it('states the machine behind every performance word', () => {
    // "Smooth" with no machine attached is what produced the owner's
    // "150 fps -> 40 fps on Quality" report. Every reference note names the
    // resolution AND the card the number came from.
    for (const profile of GRAPHICS_PROFILE_DESCRIPTIONS) {
      expect(profile.referenceFrameNote, profile.id).toMatch(/2560x1440/);
      expect(profile.referenceFrameNote, profile.id).toMatch(/RTX 5080/);
    }
    expect(graphicsProfileDescription('high').summary).toMatch(/decent gaming PC/i);
    expect(graphicsProfileDescription('max').summary).toMatch(/very high-end/i);
    expect(() => graphicsProfileDescription('rtx' as never)).toThrow(/unknown graphics profile/);
  });

  it('ties every number in the in-game copy to a number in the audit document', () => {
    // WHY. The control-set hash already stops a PRESET drifting away from the
    // doc. Nothing stopped the COPY drifting: a reference note could quote
    // "12.6 ms" long after the doc was re-measured to something else, and no
    // test would notice. Every numeric token a player is shown must be a
    // token that exists in docs/GRAPHICS_PROFILES_2026-09-03.md, which is the
    // source these lines are summaries of.
    const doc = readFileSync(AUDIT_DOC_PATH, 'utf8');
    for (const profile of GRAPHICS_PROFILE_DESCRIPTIONS) {
      // Ranges ("36-58") are matched whole, so a note may not invent a range
      // the doc does not state.
      const tokens = [...profile.referenceFrameNote.matchAll(/\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?/g)]
        .map((match) => match[0]);
      expect(tokens.length, `${profile.id}: a reference note with no figure is not a reference`)
        .toBeGreaterThan(3);
      for (const token of tokens) {
        expect(doc, `${profile.id}: "${token}" is quoted in the menu but is not in ${AUDIT_DOC_PATH}`)
          .toContain(token);
      }
    }
  });

  it('pins the display clamp that decides whether a render scale above 1 can ever appear', () => {
    // MEASURED FINDING, 2026-09-03. MAX asks for renderScale 1.15 and its
    // canvas came out 2560x1440, not 2944x1656, on all three audited arenas.
    // The cause is NOT the adaptive valve (a downshift would have produced a
    // canvas SMALLER than native): every site that applies the scale is
    //   setPixelRatio(Math.min(window.devicePixelRatio, cap))
    // and every audit row records devicePixelRatio 1, so min(1, 1.15) = 1
    // deterministically. The same expression is why PERFORMANCE's 0.75 DOES
    // appear. The in-game MAX copy now states this, so if the clamp is ever
    // removed or reshaped the copy becomes false - hence this pin.
    const source = readFileSync('src/legacy-main.ts', 'utf8');
    const applications = [...source.matchAll(/setPixelRatio\(([^;]*?)\);/g)].map((match) => match[1]);
    expect(applications.length, 'legacy-main.ts must still apply the render scale somewhere')
      .toBeGreaterThan(0);
    for (const expression of applications) {
      expect(expression, `setPixelRatio(${expression}) must clamp to the display`)
        .toMatch(/Math\.min\(\s*window\.devicePixelRatio\s*,/);
    }
    // And the copy the clamp makes true has to keep saying it.
    const max = graphicsProfileDescription('max');
    expect(max.turnsOn.join(' ')).toMatch(/device pixel ratio/i);
    expect(max.turnsOn.join(' ')).not.toMatch(/adaptive valve/i);
  });

  it('pins every profile control set and makes the audit document carry the same fingerprints', () => {
    expect(graphicsControlSetHashes()).toEqual(PINNED_CONTROL_SET_HASHES);
    // Every shipped preset has a pin; a new preset cannot be added silently.
    expect(Object.keys(PINNED_CONTROL_SET_HASHES).sort())
      .toEqual(Object.keys(GRAPHICS_PRESET_VALUES).sort());
    const doc = readFileSync(AUDIT_DOC_PATH, 'utf8');
    for (const [id, hash] of Object.entries(PINNED_CONTROL_SET_HASHES)) {
      expect(doc, `${AUDIT_DOC_PATH} must carry ${id}'s control-set hash`).toContain(hash);
    }
    // The hash is order-independent over the keys but sensitive to any value.
    const tampered = { ...GRAPHICS_PRESET_VALUES.balanced, renderScale: 0.9 };
    expect(graphicsControlSetHash(tampered)).not.toBe(PINNED_CONTROL_SET_HASHES.balanced);
  });

  it('places BALANCED between PERFORMANCE and QUALITY on every control it moves', () => {
    const performance = GRAPHICS_PRESET_VALUES.performance;
    const balanced = GRAPHICS_PRESET_VALUES.balanced;
    const quality = GRAPHICS_PRESET_VALUES.high;
    // It takes the cheap half of QUALITY's look outright.
    expect(balanced.renderScale).toBe(quality.renderScale);
    expect(balanced.geometryDetail).toBe(quality.geometryDetail);
    expect(balanced.shadows).toBe('high');
    expect(balanced.indirectLighting).toBe(quality.indirectLighting);
    expect(balanced.bloomQuality).toBe(quality.bloomQuality);
    expect(balanced.reflectionQuality).toBe(quality.reflectionQuality);
    // And it refuses the passes that add a target, an attachment or a march.
    expect(balanced.antiAliasing).toBe('smaa');
    expect(quality.antiAliasing).toBe('msaa-4x');
    expect(balanced.screenSpaceReflections).toBe('off');
    expect(balanced.volumetricLightShafts).toBe('off');
    expect(balanced.shadowResolution).toBe('medium');
    // Nothing in the pixel-replacing or gather families, on any rung below Max.
    expect(balanced.screenSpaceGi).toBe('off');
    expect(balanced.ambientOcclusion).toBe('off');
    expect(balanced.depthOfField).toBe(false);
    expect(balanced.motionBlur).toBe(0);
    expect(balanced.rayTracing).toBe('off');
    expect(balanced.spatialUpscaling).toBe('off');
    // Strictly above PERFORMANCE on the two controls that make it look poor.
    expect(performance.renderScale).toBeLessThan(balanced.renderScale);
    expect(performance.shadows).toBe('off');
    // Weather density sits between the two rather than capping the state.
    expect(balanced.rainDensity).toBeGreaterThan(performance.rainDensity);
    expect(balanced.rainDensity).toBeLessThan(quality.rainDensity);
    expect(balanced.ambientLife).toBeGreaterThan(performance.ambientLife);
    expect(balanced.ambientLife).toBeLessThan(quality.ambientLife);
  });

  it('round-trips BALANCED through settings persistence as a first-class preset', () => {
    const settings = normalizePass65Settings({ graphics: { preset: 'balanced' } });
    expect(settings.graphics.preset).toBe('balanced');
    expect(settings.graphics.renderScale).toBe(GRAPHICS_PRESET_VALUES.balanced.renderScale);
    expect(settings.graphics.antiAliasing).toBe('smaa');
  });
});

describe('HF-418 RTX explainer', () => {
  it('is not a preset and cannot become one', () => {
    // The value is outside GraphicsPreset by construction, so persistence
    // rejects it rather than storing an invented mode.
    expect(Object.keys(GRAPHICS_PRESET_VALUES)).not.toContain(RTX_NATIVE_RUNTIME_OPTION_VALUE);
    const settings = normalizePass65Settings({ graphics: { preset: RTX_NATIVE_RUNTIME_OPTION_VALUE } });
    expect(settings.graphics.preset).not.toBe(RTX_NATIVE_RUNTIME_OPTION_VALUE);
    expect(Object.keys(GRAPHICS_PRESET_VALUES)).toContain(settings.graphics.preset);
  });

  it('keeps the RTX word off every rendering profile', () => {
    // The skill's naming rule. The ray-traced controls QUALITY and MAX carry
    // are genuine recursive ray tracing and may say so; no profile may claim
    // the hardware none of them touch.
    for (const profile of GRAPHICS_PROFILE_DESCRIPTIONS) {
      const text = [profile.label, profile.summary, profile.intendedFor,
        ...profile.turnsOn, ...profile.leavesOff].join(' ');
      expect(text, profile.id).not.toMatch(/\bRTX\b/);
      // And a retired rung cannot come back through its old copy either: the
      // path-tracing denial belongs to the controls' own wording, never as a
      // claim.
      expect(text, profile.id).not.toMatch(/(?<!\bno )path.trac/i);
    }
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    const presetMarkup = markup.match(/<select id="graphics-profile">([\s\S]*?)<\/select>/)?.[1] ?? '';
    // Exactly one option may carry the letters RTX, and it is the explainer.
    const rtxOptions = [...presetMarkup.matchAll(/<option value="([^"]+)">([^<]*RTX[^<]*)<\/option>/g)];
    expect(rtxOptions).toHaveLength(1);
    expect(rtxOptions[0][1]).toBe(RTX_NATIVE_RUNTIME_OPTION_VALUE);
    // The retired preset id is gone from the shipped select, not merely hidden.
    expect(presetMarkup).not.toContain('raytraced');
  });

  it('says what the native runtime is, why the browser cannot do it, and offers no dead link', () => {
    const copy = [RTX_NATIVE_RUNTIME_COPY.lead, ...RTX_NATIVE_RUNTIME_COPY.whatItIs,
      ...RTX_NATIVE_RUNTIME_COPY.whyNotInBrowser, ...RTX_NATIVE_RUNTIME_COPY.whatYouHaveInstead,
      RTX_NATIVE_RUNTIME_COPY.howToGetIt, RTX_NATIVE_RUNTIME_COPY.reassurance].join(' ');
    expect(copy).toMatch(/separate desktop application/i);
    expect(copy).toMatch(/native Vulkan/i);
    expect(copy).toMatch(/no ray-query and no acceleration-structure API/i);
    expect(copy).toMatch(/any WebGPU graphics card/i);
    expect(copy).toMatch(/not NVIDIA-only/i);
    expect(copy).toMatch(/Your graphics profile has not been altered/i);
    // Until a desktop build exists the screen must say so and link nowhere.
    expect(RTX_NATIVE_RUNTIME_AVAILABLE).toBe(false);
    expect(RTX_NATIVE_RUNTIME_DOWNLOAD_URL).toBeNull();
    expect(RTX_NATIVE_RUNTIME_COPY.howToGetIt).toMatch(/COMING SOON/);
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect(markup).toContain('id="rtx-native-runtime-explainer"');
    expect(markup).toContain(RTX_NATIVE_RUNTIME_COPY.lead);
    // No anchor may appear inside the dialog while there is nothing to link to.
    const dialog = markup.slice(markup.indexOf('id="rtx-native-runtime-explainer"'));
    expect(dialog.slice(0, dialog.indexOf('</dialog>'))).not.toContain('<a ');
  });

  it('is wired so that selecting it restores the previous mode before opening', () => {
    // Source-pinned because the handler lives in legacy-main.ts, which no unit
    // test can construct. The mechanical falsifier for the RUNTIME behaviour is
    // scripts/qa/verify-rtx-explainer-headless.mjs, which drives the real menu
    // and asserts the renderer settings did not move.
    const source = readFileSync('src/legacy-main.ts', 'utf8');
    const handler = source.slice(source.indexOf("graphicsProfileInput.addEventListener('change'"));
    const body = handler.slice(0, handler.indexOf('});') + 3);
    expect(body).toContain('RTX_NATIVE_RUNTIME_OPTION_VALUE');
    // The restore and the open must both precede any staging of a preset.
    const restoreAt = body.indexOf('graphicsProfileInput.value = pendingGraphicsPreset');
    const openAt = body.indexOf('rtxNativeRuntimeExplainer.open()');
    const stageAt = body.indexOf('pendingGraphicsPreset = preset');
    expect(restoreAt).toBeGreaterThan(-1);
    expect(openAt).toBeGreaterThan(restoreAt);
    expect(stageAt).toBeGreaterThan(openAt);
    // And the branch has to return, or the explainer would stage a preset too.
    expect(body.slice(openAt, stageAt)).toContain('return;');
  });
});

describe('HF-418 release-note registration', () => {
  it('registers the graphics-ladder highlight only in the unreleased top entry', () => {
    // THE MERGE HAZARD THIS EXISTS FOR, AND WHY IT IS A TEST RATHER THAN A NOTE.
    //
    // This lane branched at 714d4121, where `pass85` was the PENDING top entry,
    // and registered HF-418's highlight there - correctly, at the time. PASS 86
    // then published at 00:50 BST 2026-09-03 from integration e1361b0f, which
    // froze pass85's releasedAt to a real receipt and put `pass86` above it.
    // `git merge-tree --write-tree HEAD e1361b0f` merges CLEANLY: git has no
    // opinion about which array a string lands in. Without this assertion the
    // BALANCED mode, the per-mode copy and the RTX explainer would be advertised
    // to players inside an ALREADY-PUBLISHED release entry, and no gate on the
    // integration line would notice (changelog.test.ts pins latest.id and never
    // inspects a past entry's highlights).
    //
    // So the rule is stated mechanically: the highlight lives in CHANGELOG[0],
    // and CHANGELOG[0] is still on the pending sentinel. On the integration line
    // this goes RED and tells the integrator to move one string into the new
    // pending entry (and 'GRAPHICS' into that entry's `areas`). A red test that
    // names the fix beats a clean merge that ships a lie.
    const marker = 'A new BALANCED graphics mode sits between Performance and Quality';
    const carrying = CHANGELOG.filter((entry) => entry.highlights.some((line) => line.includes(marker)));
    expect(carrying, 'the HF-418 highlight must be registered exactly once').toHaveLength(1);
    // PASS 89 (published 07:29 BST 2026-09-03) is the entry that SHIPPED the ladder, so the
    // highlight now lives in that released entry and nowhere else. Before it shipped, the
    // rule was 'the pending top entry'; after, it is 'the entry that shipped it'. Both
    // forbid the hazard this test exists for: advertising the ladder inside a release
    // that did not carry it.
    const shippedIn = 'pass89';
    expect(carrying[0].id, 'the HF-418 highlight must sit in the entry that shipped it').toBe(shippedIn);
    expect(carrying[0].releasedAt, 'PASS 89 shipped; its entry must carry a real receipt time').not.toBe(PENDING_PRODUCTION_RELEASE);
    expect(carrying[0].areas).toContain('GRAPHICS');
    // The three things the highlight promises the player must all be in it.
    const highlight = carrying[0].highlights.find((line) => line.includes(marker)) ?? '';
    expect(highlight).toMatch(/RTX entry opens an explainer/);
    expect(highlight).toMatch(/RAY TRACED/);
    expect(highlight).toMatch(/any WebGPU graphics card/);
  });
});
