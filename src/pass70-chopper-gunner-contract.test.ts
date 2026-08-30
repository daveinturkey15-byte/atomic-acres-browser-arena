import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legacy = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('./bootstrap.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./ui/pass64-shell.ts', import.meta.url), 'utf8');
const hudCss = readFileSync(new URL('./ui/pass65-hud.css', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('./killstreak-presentation.ts', import.meta.url), 'utf8');
const authoring = readFileSync(new URL('../scripts/blender/create-pass65-support-vehicles.py', import.meta.url), 'utf8');
const authoringRunner = readFileSync(new URL('../scripts/blender/run-authoring.mjs', import.meta.url), 'utf8');
const e2e = readFileSync(new URL('../tests/e2e/pass70-chopper-gunner.spec.ts', import.meta.url), 'utf8');

describe('Pass 70 complete Chopper Gunner contract', () => {
  it('presents the complete authored cockpit while excluding exterior and rotors', () => {
    const start = presentation.indexOf('function setSupportFirstPersonVisibility(');
    const end = presentation.indexOf('\nfunction buildAuthoredSupportVehicle(', start);
    const block = presentation.slice(start, end);
    expect(block).toContain('isGunnerCockpitNode(root, node)');
    expect(block).toContain('node.visible = gunnerCockpitNode && !gunnerSightBlocker && !retiredStaticSource');
    expect(block).toContain('const gunnerSightBlocker = gunnerSightlineNode && !gunnerWeaponViewNode');
    expect(block).toContain('1 << SUPPORT_FIRST_PERSON_RENDER_LAYER');
    expect(block).toContain('node.layers.mask = node.userData.supportBaseLayerMask');
    expect(block).toContain('!entry.transparent && entry.opacity >= 1');
    expect(block).not.toContain('node.visible = gunnerSightlineNode && !retiredStaticSource');
  });

  it('HF-389: reads the COMPOSED cascade - no sheet may outrank the cockpit rails\' own border/background axes', () => {
    // THE REGRESSION THIS TEST MISSED: pass65-hud.css wraps the whole cockpit in
    // `@layer pass65.hud`, while bootstrap.ts deliberately imports later reskin
    // sheets UNLAYERED so they outrank every layer regardless of specificity.
    // Commits 2050e5eb (pass75) and 3b79d9a2 (pass77) reached into the cockpit
    // from those unlayered sheets: their `border:` shorthand reset pass65's
    // border-block-only green hairline, and their `background-image:` replaced
    // the edge-fading canopy gradient - turning two diegetic rails into rounded
    // opaque cards - while this file stayed green because it read ONLY the
    // layered sheet. A contract test that cannot see the sheet that wins is
    // not a contract. This test therefore parses EVERY stylesheet bootstrap
    // imports and enforces the same ownership rule on all of them.
    // PASS 81: the scanned set was `src/ui/*.css` only, and the comment above
    // claimed it parsed EVERY stylesheet bootstrap imports. It did not:
    // `src/bootstrap.ts:3` imports `./style.css`, which lives OUTSIDE src/ui,
    // is itself unlayered, and is what pulls pass65-hud.css onto the page at
    // all (`@import url('./ui/pass65-hud.css')`). A rail override placed there
    // would have won the cascade on exactly the same layer precedence this
    // test exists to police, and passed the guard. It is scanned now.
    const uiDir = new URL('./ui/', import.meta.url);
    const sheets = readdirSync(uiDir, 'utf8')
      .filter((name) => name.endsWith('.css'))
      .map((name) => ({ name, url: new URL(`./ui/${name}`, import.meta.url) }));
    sheets.push({ name: 'style.css', url: new URL('./style.css', import.meta.url) });
    expect(sheets.length).toBeGreaterThan(1);
    const sheetNames = sheets.map((sheet) => sheet.name);

    // Every css import in bootstrap.ts must be inside the scanned set, so a
    // future sheet cannot silently join (or leave) the cockpit's cascade -
    // and so must every sheet those sheets @import in turn.
    const bootImports = [...bootstrap.matchAll(/import '\.\/((?:ui\/)?[a-z0-9-]+\.css)';/gu)]
      .map((match) => match[1]!.replace('ui/', ''));
    expect(bootImports.length).toBeGreaterThan(0);
    expect(bootImports, 'src/style.css is imported by bootstrap and must be scanned').toContain('style.css');
    for (const name of bootImports) expect(sheetNames, `${name} must be in the scanned set`).toContain(name);
    const styleCss = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
    const nested = [...styleCss.matchAll(/@import url\('\.\/((?:ui\/)?[a-z0-9-]+\.css)'\)/gu)]
      .map((match) => match[1]!.replace('ui/', ''));
    expect(nested, 'style.css must still be what pulls the cockpit sheet onto the page').toContain('pass65-hud.css');
    for (const name of nested) expect(sheetNames, `${name} must be in the scanned set`).toContain(name);

    interface Rule { readonly sheet: string; readonly selector: string; readonly body: string; }
    const parseRules = (sheet: string, css: string, acc: Rule[]): void => {
      const source = css.replace(/\/\*[\s\S]*?\*\//gu, '');
      let depth = 0;
      let open = -1;
      let preludeStart = 0;
      for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{') {
          if (depth === 0) open = index;
          depth += 1;
        } else if (char === '}') {
          depth -= 1;
          if (depth === 0 && open >= 0) {
            const prelude = source.slice(preludeStart, open).trim();
            const inner = source.slice(open + 1, index);
            if (/^@(media|supports|layer|container)\b/u.test(prelude)) parseRules(sheet, inner, acc);
            else if (!prelude.startsWith('@')) acc.push({ sheet, selector: prelude, body: inner });
            preludeStart = index + 1;
            open = -1;
          }
        }
      }
    };

    const rules: Rule[] = [];
    for (const sheet of sheets) parseRules(sheet.name, readFileSync(sheet.url, 'utf8'), rules);
    // pass65 owns these axes on the rails: the border-block-only green hairline
    // and the edge-fading gradient are what make them read as part of the
    // canopy rather than floating cards. No other sheet may set them.
    // (Record, not Set: static string-keyed lookup per repo convention.)
    const pass65OwnedAxes: Record<string, true> = {
      border: true,
      'border-radius': true,
      'border-block': true,
      'border-block-start': true,
      'border-block-end': true,
      background: true,
      'background-color': true,
      'background-image': true,
    };
    // The rail element itself only - descendants (small/span/readouts) keep
    // their own freedom. Attribute qualifiers such as
    // [data-support-kind="chopper-gunner"] must NOT dodge the rule again.
    const isRailSelector = (selector: string): boolean =>
      selector
        .split(',')
        .some((part) => /(^|[\s>+])#gunner-cockpit-hud(\[[^\]]*\])?([\s>+][^\s>+]+)*\s\.gunner-(status|instruments)(::?[a-z-]+)?$/u.test(part.trim()));
    const violations: string[] = [];
    for (const rule of rules) {
      if (!isRailSelector(rule.selector) || rule.sheet === 'pass65-hud.css') continue;
      for (const declaration of rule.body.split(';')) {
        const property = declaration.split(':')[0]?.trim().toLowerCase() ?? '';
        if (property && property in pass65OwnedAxes) violations.push(`${rule.sheet}: \`${rule.selector}\` sets \`${property}\``);
      }
    }
    expect(violations, `cockpit rails' border/background axes are pass65-owned; overridden by:\n${violations.join('\n')}`).toEqual([]);

    // And the owning sheet must still actually own them - equal or greater
    // strictness than the original contract, never less.
    const pass65Rules = rules.filter((rule) => rule.sheet === 'pass65-hud.css');
    expect(pass65Rules.some((rule) => isRailSelector(rule.selector) && rule.body.includes('border-block: 1px solid rgba(120, 255, 170, 0.42)'))).toBe(true);
    expect(pass65Rules.some((rule) => isRailSelector(rule.selector) && rule.body.includes('linear-gradient(90deg, transparent, rgba(2, 16, 10, 0.72)'))).toBe(true);
    expect(pass65Rules.some((rule) => isRailSelector(rule.selector) && rule.body.includes('border-block: 1px solid rgba(120, 255, 170, 0.38)'))).toBe(true);
    expect(pass65Rules.some((rule) => isRailSelector(rule.selector) && rule.body.includes('linear-gradient(90deg, transparent, rgba(3, 18, 12, 0.78)'))).toBe(true);
  });

  it('HF-389: the missile readout carries EXACTLY ONE multiplication glyph, in exactly one place', () => {
    // THE REGRESSION THIS TEST MISSED THE FIRST TIME. Two independent sources
    // each supplied the glyph and both gates blessed it:
    //   - the shell markup carried `<i aria-hidden="true">&times;</i>` beside
    //     the `<b>` (added by 821eb8e0),
    //   - and aecd8b6f then merged an unmerged branch's JS, which writes
    //     `×${ammo} / 6` INTO that same `<b>` (legacy-main.ts).
    // The old pin asserted the `<i>` existed, and the e2e read only the `<b>`'s
    // own textContent, so "× ×3 / 6" shipped green for six days in the
    // exact readout the owner named when he said the chopper HUD had regressed.
    //
    // The `<b>`'s content is REPLACED at runtime, so the glyph budget is not a
    // sum over the whole file: it is (glyphs outside the `<b>`) + (glyphs in
    // whatever currently occupies it), evaluated once for the static markup
    // and once for every runtime write. Each of those must be exactly one.
    const start = shell.indexOf('id="gunner-missile-status"');
    expect(start).toBeGreaterThan(-1);
    const missilePanel = shell.slice(start, shell.indexOf('</div>', start));
    const readout = /<b id="gunner-missile-ammo">([^<]*)<\/b>/u.exec(missilePanel);
    expect(readout, 'the missile readout must still be a single <b> the runtime writes into').not.toBeNull();
    const glyphs = (text: string): number => (text.match(/&times;|×/gu) ?? []).length;
    const outsideTheReadout = glyphs(missilePanel.replace(readout![0], ''));
    expect(outsideTheReadout + glyphs(readout![1]!), 'static markup renders one glyph').toBe(1);

    const runtimeWrites = [...legacy.matchAll(/#gunner-missile-ammo'\)\.textContent = `([^`]*)`/gu)]
      .map((match) => match[1]!);
    expect(runtimeWrites.length, 'legacy-main must still be the only writer of the readout').toBeGreaterThanOrEqual(2);
    for (const write of runtimeWrites) {
      expect(
        outsideTheReadout + glyphs(write),
        `"${write}" plus ${outsideTheReadout} glyph(s) of surrounding markup must render exactly one ×`,
      ).toBe(1);
    }
  });

  it('keeps the centre reticle clear and all instruments bounded on desktop and mobile', () => {
    for (const id of [
      'gunner-hull', 'gunner-ammo', 'gunner-altitude', 'gunner-speed', 'gunner-time', 'gunner-damage',
      'gunner-target-confirm', 'gunner-platform', 'gunner-weapon-mode',
      'gunner-control-strip', 'gunner-gun-control', 'gunner-control-gun-ammo',
      'gunner-missile-status', 'gunner-missile-ammo', 'gunner-missile-cooldown',
    ]) expect(shell).toContain(`id="${id}"`);
    expect(shell).toContain('data-centre-clear="true"');
    expect(shell).not.toContain('class="gunner-reticle"><i></i><b></b>');
    expect(hudCss).toContain('.gunner-reticle .north { bottom: 58%; top: auto; }');
    expect(hudCss).toContain('.gunner-reticle .east { left: 58%; }');
    expect(hudCss).toContain('@media (max-width: 760px), (max-height: 520px)');
    expect(hudCss).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(hudCss).toContain('env(safe-area-inset-bottom)');
    expect(hudCss).toContain('top: max(54px, calc(env(safe-area-inset-top) + 52px));');
    expect(hudCss).toContain('#gunner-cockpit-hud[data-support-kind="chopper-gunner"]::before');
    // HF-335: the taller authored canopy frame restored from the unmerged
    // Pass 71 candidate lane, desktop and narrow-viewport values both locked.
    expect(hudCss).toContain('height: clamp(280px, 58vh, 620px);');
    expect(hudCss).toContain('height: clamp(210px, 48vh, 390px);');
    expect(hudCss).toContain('#gunner-missile-status[data-ready="true"] em');
    expect(legacy).toContain("event.button === 2 && localKillstreakActorSnapshot()?.possession?.kind === 'chopper-gunner'");
    expect(legacy).toContain('missileFire: true');
  });

  it('HF-335: shows one legible LMB GUN / RMB MISSILES control strip that never crosses the sight corridor', () => {
    // The owner asked for `LMB GUN | RMB MISSILES xN`, not a tutorial panel.
    expect(shell).toContain('<kbd>LMB</kbd><span>GUN</span>');
    expect(shell).toContain('<kbd>RMB</kbd><span>MISSILES</span>');
    expect(shell).toContain('<b id="gunner-missile-ammo">');
    // The missile readout keeps its own id/hidden/data-ready contract so the
    // existing typed HUD lifecycle in legacy-main stays the only writer.
    expect(shell).toMatch(/id="gunner-missile-status"[^>]*hidden[^>]*data-ready="false"/u);
    // Gated by the HUD root's existing data-support-kind lifecycle only.
    expect(hudCss).toContain('#gunner-cockpit-hud[data-support-kind="chopper-gunner"] #gunner-control-strip { display: flex; }');
    expect(hudCss).toContain('#gunner-cockpit-hud[data-support-kind] #gunner-control-strip[hidden] { display: none; }');
    // Bottom-right rail: opposite the instruments, clear of the centre reticle,
    // the top-centre status band and the top-right thermal banner.
    const strip = hudCss.slice(hudCss.indexOf('#gunner-control-strip {'), hudCss.indexOf('#gunner-control-strip .gunner-control {'));
    expect(strip).toContain('right: max(18px, env(safe-area-inset-right));');
    expect(strip).toContain('bottom: max(20px, calc(env(safe-area-inset-bottom) + 10px));');
    expect(strip).not.toContain('left:');
    expect(strip).not.toContain('top:');
    // Legible from 1280x720 through ultrawide and high-DPI: every type ramp is
    // clamp()ed against the viewport rather than pinned to one pixel size.
    expect(hudCss).toContain('font: 900 clamp(11px, 0.86vw, 18px)/1 Inter, system-ui, sans-serif;');
    expect(hudCss).toContain('font: 950 clamp(17px, 1.3vw, 27px)/1 Inter, system-ui, sans-serif;');
    expect(hudCss).toContain('font: 900 clamp(9px, 0.62vw, 14px)/1 Inter, system-ui, sans-serif;');
    // The cockpit-frame pillars are ::after content and paint over children, so
    // the strip and both telemetry rails claim their own layer.
    expect(strip).toContain('z-index: 1;');
    expect(hudCss).toMatch(/\.gunner-instruments \{ z-index: 1; \}/u);
    // Narrow viewports stack the strip above the instruments instead of over them.
    const narrow = hudCss.slice(hudCss.indexOf('@media (max-width: 760px), (max-height: 520px)'));
    expect(narrow).toContain('bottom: max(104px, calc(env(safe-area-inset-bottom) + 94px));');
  });

  it('uses authority geometry and target projection for shot and damage feedback', () => {
    const updateStart = legacy.indexOf('function updateKillstreakPossession(');
    const updateEnd = legacy.indexOf('\nfunction updatePass65KillstreakRuntime(', updateStart);
    const update = legacy.slice(updateStart, updateEnd);
    expect(update).toContain('chopperGunnerCameraOrigin(entity.position, entity.attitude)');
    expect(update).toContain('chopperGunnerAuthoritativeRay(entity.position, entity.attitude, player.yaw, player.pitch)');
    expect(update).toContain('new THREE.Vector3(...shotRay.tracerOrigin)');
    expect(update).toContain('new THREE.Vector3(...shotRay.direction)');

    const hitStart = legacy.indexOf('function showGunnerTargetConfirm(');
    const hitEnd = legacy.indexOf('\nfunction resetKillstreakPossessionPresentation(', hitStart);
    const hit = legacy.slice(hitStart, hitEnd);
    expect(hit).toContain("event.source !== 'chopper' || !anchor.visible");
    expect(hit).toContain('entity.activationId !== event.activationId');
    expect(hit).toContain('`${anchor.xPx}px`');
    expect(hit).toContain('`${anchor.yPx}px`');
  });

  it('cleans the cockpit, thermal overlay, target marker, cadence, and camera on every exit path', () => {
    const hideStart = legacy.indexOf('function hideGunnerCockpitHud(');
    const hideEnd = legacy.indexOf('\nfunction showGunnerTargetConfirm(', hideStart);
    const hide = legacy.slice(hideStart, hideEnd);
    expect(hide).toContain("hud.dataset.supportKind = 'none'");
    expect(hide).toContain("hud.dataset.hitConfirm = 'false'");
    expect(hide).toContain("element<HTMLElement>('#chopper-thermal').hidden = true");
    expect(hide).toContain("element<HTMLElement>('#gunner-missile-status')");
    expect(hide).toContain("missileStatus.dataset.ready = 'false'");
    expect(hide).toContain('nextLocalSupportGunReportAt = 0');
    expect(legacy).toContain('if (!possession || !player.alive)');
    expect(legacy).toContain('if (camera.near !== 0.08)');
  });

  it('authors and optimizes only Chopper LODs for this correction', () => {
    expect(authoring).toContain('{"all", "aircraft", "chopper"}');
    expect(authoring).toContain('if AUTHORING_SCOPE == "chopper"');
    expect(authoring).toContain('pass70-connected-rear-tail-airframe-v7');
    expect(authoring).toContain('continuous-rear-tail-silhouette-cockpit-clear-sightline-v7');
    expect(authoring).toContain('Chopper_TailRootCollar_LOD');
    expect(authoring).toContain('pass70-daylight-readable-olive-pbr-v1');
    const runnerStart = authoringRunner.indexOf('function authorSupportChopper()');
    const runnerEnd = authoringRunner.indexOf('\nfunction authorWeaponFamilies(', runnerStart);
    const runner = authoringRunner.slice(runnerStart, runnerEnd);
    expect(runner).toContain("env.PASS65_SUPPORT_AUTHORING_SCOPE = 'chopper'");
    expect(runner).toContain('pass65-chopper-gunner-lod${lod}.glb');
    expect(runner).not.toContain('pass65-care-aircraft');
    expect(runner).not.toContain('pass65-carpet-aircraft');
  });

  it('prewarms the exact shared LOD bands at near-field scale and restores the gameplay projection', () => {
    // HF-336: bands re-tuned from [0, 95, 190] to [0, 36, 75] so ground
    // observers get LOD1/LOD2 at the chopper's 25-35m operating altitude
    // instead of forced LOD0 at every practical range.
    expect(presentation).toContain('export const SUPPORT_VEHICLE_LOD_DISTANCES = Object.freeze([0, 36, 75] as const);');
    expect(presentation).toContain('export const SUPPORT_VEHICLE_PREWARM_DISTANCES = deriveSupportVehiclePrewarmDistances();');
    expect(presentation).toContain('lod.addLevel(level, SUPPORT_VEHICLE_LOD_DISTANCES[index]');
    expect(presentation).toContain('SUPPORT_VEHICLE_PREWARM_DISTANCES.entries()');
    expect(presentation).toContain('projectionCamera.far = requiredPrewarmFar');
    expect(presentation).toContain('projectionCamera.far = originalPrewarmFar');
    expect(presentation).not.toContain('[24, 50, 88]');
  });

  it('fits exterior evidence to stable airframe geometry rather than transient fire actions', () => {
    expect(presentation).toContain('supportVehicleStableAirframeBounds(entry.root, camera, this.submittedScene)');
    expect(presentation).toContain("'chopper-tracer-action'");
    expect(presentation).toContain("'chopper-muzzle-flash'");
    expect(presentation).toContain("'chopper-impact-action'");
    expect(e2e).toContain('const visibleBounds = detail.stableAirframeBounds;');
    expect(e2e).toContain('const visibleBounds = detail.drawableStableAirframeBounds;');
    expect(e2e).toContain('receipt.reviewedChopper.drawableStableMeshCount > 0');
    expect(e2e).toContain('rasterVisibility.visiblePixelRatio');
    expect(e2e).toContain('rasterVisibility.maximumLuminance');
    expect(e2e).toContain('captureChopperExteriorHiddenControl()');
    expect(e2e).toContain('attributableRasterDifference.materiallyChangedPixelRatio');
    expect(e2e).toContain('exterior-hidden-control.nonpublishable.png');
    expect(e2e).toContain('side * Math.PI / 3');
    expect(e2e.indexOf("page.screenshot({ path: resolve(evidence, 'exterior-front-quarter.png')"))
      .toBeLessThan(e2e.indexOf("{ kind: 'training-dummy', id: 'test-dummy-alpha' }"));
  });

  it('commits a zero-target exterior camera without loosening rigged actor receipts', () => {
    const genericStart = legacy.indexOf('function debugCommittedCameraPresentationReceipt(');
    const genericEnd = legacy.indexOf('\nfunction debugCapturePresentationReceipt(', genericStart);
    const generic = legacy.slice(genericStart, genericEnd);
    const riggedStart = genericEnd;
    const riggedEnd = legacy.indexOf('\nconst DEBUG_EVIDENCE_LOS_ENDPOINT_TOLERANCE_M', riggedStart);
    const rigged = legacy.slice(riggedStart, riggedEnd);
    expect(generic).toContain("contract: 'capture-camera-committed-frame-v1'");
    expect(generic).toContain('targetCount: lastKillstreakWorldTargetCount');
    expect(generic).toContain('chopperAutonomousFireHeld: currentDebugChopperExteriorReviewHoldActive()');
    expect(generic).toContain('activeChopperTransientActionNames()');
    expect(rigged).toContain("throw new Error('Rigged evidence presentation receipt requires registered capture targets')");
    expect(legacy).toContain('lastDebugCommittedCameraPresentation = debugCommittedCameraPresentationReceipt(frameCount)');
    expect(legacy).toContain('debugCaptureCameraActive && debugRiggedEvidenceCaptureTargets !== null');
    expect(legacy).toContain('if (!synchronizeDebugChopperExteriorReviewHold()) {');
    expect(legacy).toContain('synchronizeDebugChopperExteriorReviewHold();');
    expect(legacy).toContain('resetDebugChopperExteriorReviewHold();');
    const runtimeUpdate = legacy.slice(
      legacy.indexOf('function updatePass65KillstreakRuntime('),
      legacy.indexOf('\nfunction updateCarePackageCollection', legacy.indexOf('function updatePass65KillstreakRuntime(')),
    );
    expect(runtimeUpdate.indexOf('synchronizeDebugChopperExteriorReviewHold();'))
      .toBeLessThan(runtimeUpdate.indexOf('if (!gameStarted)'));
    const captureSetter = legacy.slice(
      legacy.indexOf('setCaptureCameraPose:'),
      legacy.indexOf('\n  setCaptureCameraFarPlane:', legacy.indexOf('setCaptureCameraPose:')),
    );
    expect(captureSetter).toContain('if (!debugCaptureCameraActive) {\n      resetDebugChopperExteriorReviewHold();');
    const holdSetter = legacy.slice(
      legacy.indexOf('setChopperExteriorReviewHold:'),
      legacy.indexOf('\n  setRiggedEvidenceCaptureTargets:', legacy.indexOf('setChopperExteriorReviewHold:')),
    );
    expect(holdSetter).toContain('matchPhase: matchState.phase');
    expect(holdSetter).toContain('menuSurface: menuLifecycle.surface');
    expect(holdSetter).toContain('if (!held) {\n      resetDebugChopperExteriorReviewHold();\n      return true;');
    expect(e2e).toContain('setChopperExteriorReviewTracking(true)');
    expect(e2e).toContain("pauseCompletedPresentedFrame(page, trackerRevision, 'camera-only')");
    expect(e2e).toContain('awaitCommittedCameraCompletion()');
    expect(e2e).toContain('setChopperExteriorReviewHold(true)');
    expect(e2e).toContain('targetCount: 0');
    expect(e2e).toContain('activeChopperTransientActions: []');
  });

  it('HF-336: casts chopper shadows from one merged silhouette, applied after the shared-asset pass', () => {
    const start = presentation.indexOf('function buildAuthoredSupportVehicle(');
    const end = presentation.indexOf('\nfunction buildProceduralChopperFallback(', start);
    const build = presentation.slice(start, end);
    // markSharedPresentationAsset sets castShadow = true on every mesh it
    // touches, so the shadow budget has to be the last word or LOD0's full
    // caster set is silently reinstated for every non-possessing player.
    const sharedAssetPass = build.lastIndexOf('markSharedPresentationAsset(root);');
    const shadowBudget = build.indexOf("applyAuthoredSupportShadowBudget(root, 'chopper', { castShadows: false });");
    expect(sharedAssetPass).toBeGreaterThan(-1);
    expect(shadowBudget).toBeGreaterThan(sharedAssetPass);
    expect(build).toContain("buildAuthoredSupportShadowSilhouette('chopper', shadowSilhouetteSource)");
    expect(build).not.toContain('applyAuthoredSupportShadowBudget(level,');
    // The proxy stays visible so three.js submits it to the shadow map, but it
    // writes neither colour nor depth in the beauty pass.
    expect(presentation).toContain('colorWrite: false,');
    expect(presentation).toContain('silhouette.castShadow = true;');
    expect(presentation).toContain('silhouette.receiveShadow = false;');
  });

  it('keeps rear-fuselage and tail continuity visible without flattening the whole airframe', () => {
    expect(presentation).toContain("'chopper-rear-fuselage'");
    expect(presentation).toContain("'chopper-tail-boom'");
    expect(presentation).toContain("const CHOPPER_REAR_TAIL_MATERIAL_NAME = 'MAT_Pass65Chopper_RearTailArmor_PBR';");
    expect(presentation).toContain('minimumRoughness: 0.78');
    expect(presentation).toContain('maximumMetalness: 0.28');
    expect(presentation).toContain('isolateAuthoredChopperRearTailArmor(root);');
  });

  it('captures only an exact completed WebGPU frame without weakening the watchdog', () => {
    const start = e2e.indexOf('async function pauseCompletedPresentedFrame(');
    const end = e2e.indexOf('\ntest(', start);
    const capture = e2e.slice(start, end);
    expect(capture).toContain('receipt?.captureRevision === revision');
    expect(capture).toContain('api.setRenderPaused(true)');
    expect(capture).toContain('awaitRiggedEvidenceCaptureCompletion()');
    expect(capture).toContain('paused.receipt.submissionSequence');
    expect(capture).toContain('completion.completedSequence).toBeGreaterThanOrEqual(completion.submissionSequence)');
    expect(e2e).toContain('targetDirectionDot');
    expect(e2e).toContain('quaternionDot');
    expect(e2e).toContain('exteriorReceipt.near');
    expect(e2e).toContain('exteriorReceipt.far');
    expect(capture.indexOf('api.setRenderPaused(true)')).toBeLessThan(capture.indexOf('awaitRiggedEvidenceCaptureCompletion()'));
    expect(e2e).not.toContain('Renderer presentation made no GPU progress');
    expect(e2e).not.toContain('errors.filter');
  });
});

/**
 * HF-404 — "the machien gun dont hit or do damage properly". Two of the three
 * stacked defects live outside the runtime: the control message the aim rides
 * in, and the ray the player's own feedback is drawn down.
 */
describe('HF-404 Chopper Gunner aim reaches the host and the feedback matches it', () => {
  it('normalises the unbounded first-person yaw into the control-intent wire contract', () => {
    const start = legacy.indexOf('function requestKillstreakControl(');
    const block = legacy.slice(start, legacy.indexOf('\nfunction requestPossessedChopperMissile(', start));
    // player.yaw accumulates without ever wrapping, and parseKillstreakControl
    // rejects yawQ outside [-pi, pi] — so an unwrapped sweep did not merely
    // mis-aim, it discarded the guest's whole control message (pitch, thrust
    // and trigger with it) at the protocol boundary.
    expect(block).toContain('wrapAngleRadians(control.yawQ)');
    expect(block).toContain('...normalizedControl,');
    expect(block).not.toContain('...control,\n    timing: nextCombatTiming(),');
    const protocolSource = readFileSync(new URL('./killstreak-protocol.ts', import.meta.url), 'utf8');
    expect(protocolSource).toContain('finite(value.yawQ, -Math.PI, Math.PI)');
  });

  it('draws the owner tracer and impact down the AUTHORITATIVE ray, not a parallel one', () => {
    const start = legacy.indexOf('const shotRay = chopperGunnerAuthoritativeRay(entity.position, entity.attitude, player.yaw, player.pitch);');
    expect(start).toBeGreaterThan(-1);
    const block = legacy.slice(start, legacy.indexOf('nextLocalSupportGunReportAt = now +', start));
    // The host resolves damage from shotRay.origin (camera socket). Tracing
    // from shotRay.tracerOrigin (muzzle socket) put the sparks, decal, impact
    // sound and zero-damage cue on a line offset by the entire camera-to-muzzle
    // vector. The tracer still LEAVES the barrel; only its endpoint changed.
    expect(block).toContain('const rayOrigin = new THREE.Vector3(...shotRay.origin);');
    expect(block).toContain("const chopperTrace = traceWeaponPath(rayOrigin, aim, CHOPPER_GUN_PROFILE.maximumRangeM, 'lmg');");
    expect(block).toContain('spawnTracer(muzzle, rayOrigin.clone().addScaledVector(aim, chopperTrace.travelDistance), 0xffb347);');
    expect(block).toContain('const point = rayOrigin.clone().addScaledVector(aim, firstImpact.entryDistance);');
    expect(block).not.toContain('traceWeaponPath(muzzle,');
  });

  it('keeps hit feedback wired for possessed fire', () => {
    // Damage numbers, the cockpit target-confirm plate and the hitmarker all
    // hang off one owner-facing entry point; the autocannon must reach it.
    const start = legacy.indexOf('function recordOwnerSupportDamage(');
    const block = legacy.slice(start, legacy.indexOf('\nfunction killstreakActorModifiers(', start));
    expect(block).toContain("event.source === 'chopper'");
    expect(block).toContain('showDamageNumber(event.damage,');
    expect(block).toContain('showGunnerTargetConfirm(event, anchor, performance.now());');
    expect(block).toContain('audio.hit(false);');
    expect(legacy).toContain('recordOwnerSupportDamage(event);');
  });
});
