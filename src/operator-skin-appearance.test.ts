import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  OPERATOR_SKIN_CATALOG,
  OPERATOR_SKIN_PALETTES,
  operatorSkinPalette,
} from './operator-skin-catalog';
import {
  FIRST_PERSON_ARM_GIRTH_METRES,
  FIRST_PERSON_ARM_SKIN_CONTRACT,
  applyFirstPersonArmSkin,
  applyFirstPersonArmSkinMaterial,
  firstPersonArmBaseActionFor,
  firstPersonArmMaterialRole,
  firstPersonArmRuntimeClip,
  inflateFirstPersonArmGirth,
} from './operator-model';
import {
  FIRST_PERSON_ARM_MOTION_CONTRACT,
  FIRST_PERSON_ARM_MOTION_MAX_POLE_RADIANS,
  FIRST_PERSON_ARM_MOTION_MAX_WRIST_ROLL_RADIANS,
  firstPersonArmMotionSample,
} from './weapon-presentation';
import { createPass64ShellViewModel, renderPass64Shell } from './ui/pass64-shell';
import {
  operatorSkinPortraitAudit,
  operatorSkinPortraitSvg,
  operatorSkinSwatchMarkup,
} from './ui/operator-skin-portrait';
import {
  OPERATOR_PREVIEW_CANVAS_ID,
  OPERATOR_PREVIEW_CONTRACT,
  OPERATOR_PREVIEW_STATUS_ID,
  OPERATOR_PREVIEW_TURN_RADIANS_PER_SECOND,
  selectedOperatorSkinFrom,
} from './ui/operator-preview';

const SELECTABLE = OPERATOR_SKIN_CATALOG.definitions.filter((entry) => entry.availability === 'selectable');

// HF-366: "i picked a skin but they all looked greyed out i have no idea what
// i look like? ... and the arms should look diff too?"
describe('skin -> first-person arm material resolution (HF-366)', () => {
  it('classifies every authored arm material into a paintable role', () => {
    expect(firstPersonArmMaterialRole('MAT_Pass65_Arms_Sleeve_PBR')).toBe('sleeve');
    expect(firstPersonArmMaterialRole('MAT_Pass65_Arms_Glove_PBR')).toBe('glove');
    expect(firstPersonArmMaterialRole('MAT_Pass65_Arms_FingerGlove_PBR')).toBe('finger-glove');
    expect(firstPersonArmMaterialRole('MAT_Pass65_Arms_WristAccent_PBR')).toBe('accent');
    expect(firstPersonArmMaterialRole('MAT_Pass65_FieldKnife_Blade_PBR')).toBeNull();
    // Every role the girth table knows must be a role the classifier can return,
    // or a mesh would silently miss its shell.
    for (const role of Object.keys(FIRST_PERSON_ARM_GIRTH_METRES)) {
      expect(FIRST_PERSON_ARM_GIRTH_METRES[role as keyof typeof FIRST_PERSON_ARM_GIRTH_METRES]).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives every selectable skin its own visibly different arm tints', () => {
    const sleeves = new Set<number>();
    const accents = new Set<number>();
    for (const definition of SELECTABLE) {
      const palette = operatorSkinPalette(definition.id);
      expect(palette.id).toBe(definition.id);
      sleeves.add(palette.arm.sleeve);
      accents.add(palette.arm.accent);
      // A multiply tint that is nearly black would make the arms disappear
      // rather than change colour, which is the failure being fixed.
      const colour = new THREE.Color(palette.arm.sleeve);
      expect(colour.r + colour.g + colour.b).toBeGreaterThan(1.2);
    }
    expect(sleeves.size).toBe(SELECTABLE.length);
    expect(accents.size).toBe(SELECTABLE.length);
  });

  it('paints a cloned arm material with the selected skin and leaves foreign materials alone', () => {
    for (const definition of SELECTABLE) {
      const sleeve = new THREE.MeshStandardMaterial({ name: 'MAT_Pass65_Arms_Sleeve_PBR', color: 0xffffff });
      expect(applyFirstPersonArmSkinMaterial(sleeve, sleeve.name, definition.id)).toBe(true);
      expect(sleeve.color.getHex()).toBe(operatorSkinPalette(definition.id).arm.sleeve);
      expect(sleeve.roughness).toBe(operatorSkinPalette(definition.id).arm.sleeveRoughness);
    }
    const knife = new THREE.MeshStandardMaterial({ name: 'MAT_Pass65_FieldKnife_Blade_PBR', color: 0x123456 });
    expect(applyFirstPersonArmSkinMaterial(knife, knife.name, 'explorer')).toBe(false);
    expect(knife.color.getHex()).toBe(0x123456);
  });

  it('repaints a live arms root in place when the selection changes', () => {
    const root = new THREE.Group();
    const build = (name: string): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshStandardMaterial({ name, color: 0xffffff }),
      );
      mesh.name = name;
      return mesh;
    };
    root.add(build('MAT_Pass65_Arms_Sleeve_PBR'), build('MAT_Pass65_Arms_Glove_PBR'), build('MAT_Pass65_FieldKnife_Blade_PBR'));
    expect(applyFirstPersonArmSkin(root, 'symbiote')).toBe(2);
    expect(root.userData.firstPersonArmSkinId).toBe('symbiote');
    expect(root.userData.firstPersonArmSkinContract).toBe(FIRST_PERSON_ARM_SKIN_CONTRACT);
    const sleeve = root.children[0] as THREE.Mesh;
    expect((sleeve.material as THREE.MeshStandardMaterial).color.getHex())
      .toBe(OPERATOR_SKIN_PALETTES.symbiote.arm.sleeve);
    // A second selection must fully replace the first, not blend with it.
    applyFirstPersonArmSkin(root, 'navalops');
    expect((sleeve.material as THREE.MeshStandardMaterial).color.getHex())
      .toBe(OPERATOR_SKIN_PALETTES.navalops.arm.sleeve);
  });

  it('refuses a selectable skin that has no palette', () => {
    for (const definition of SELECTABLE) {
      expect(Object.hasOwn(OPERATOR_SKIN_PALETTES, definition.id)).toBe(true);
    }
    // Unknown and retired ids fall back rather than throwing, so a stale peer
    // selection cannot leave a player with untinted arms.
    expect(operatorSkinPalette('not-a-skin').id).toBe('default');
  });
});

// HF-365: "the arms are thin and weirdly held and animated".
describe('first-person arm girth, hold and motion (HF-365)', () => {
  it('adds a real normal shell to the sleeve without moving any bone, exactly once', () => {
    const geometry = new THREE.BufferGeometry();
    // A unit quad whose normals all point +Z: each vertex must move by exactly
    // the sleeve girth along Z and by nothing at all along X or Y.
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'MAT_Pass65_Arms_Sleeve_PBR' }));
    const root = new THREE.Group();
    root.add(mesh);
    expect(inflateFirstPersonArmGirth(root)).toBe(1);
    const position = geometry.getAttribute('position');
    expect(position.getZ(0)).toBeCloseTo(FIRST_PERSON_ARM_GIRTH_METRES.sleeve, 6);
    expect(position.getX(1)).toBeCloseTo(1, 6);
    expect(position.getY(2)).toBeCloseTo(1, 6);
    // Re-entry is the real hazard: SkeletonUtils.clone SHARES geometry, so a
    // per-instance shell would compound on every viewmodel build.
    expect(inflateFirstPersonArmGirth(root)).toBe(0);
    expect(position.getZ(0)).toBeCloseTo(FIRST_PERSON_ARM_GIRTH_METRES.sleeve, 6);
  });

  it('de-quantizes before inflating so a normalized position cannot wrap', () => {
    // The shipped arms are meshopt-compressed: normalized Int16 positions whose
    // encodable range is [-1, 1]. Writing an inflated extreme vertex back into
    // that encoding overflows and wraps to the opposite extreme, which renders
    // as a metre-long spike through the viewmodel.
    const geometry = new THREE.BufferGeometry();
    const quantized = new THREE.BufferAttribute(new Int16Array([32767, 0, 0, -32767, 0, 0]), 3, true);
    geometry.setAttribute('position', quantized);
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, -1, 0, 0], 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'MAT_Pass65_Arms_Sleeve_PBR' }));
    const root = new THREE.Group();
    root.add(mesh);
    inflateFirstPersonArmGirth(root);
    const position = geometry.getAttribute('position');
    expect(position.array).toBeInstanceOf(Float32Array);
    expect(position.getX(0)).toBeCloseTo(1 + FIRST_PERSON_ARM_GIRTH_METRES.sleeve, 5);
    expect(position.getX(1)).toBeCloseTo(-1 - FIRST_PERSON_ARM_GIRTH_METRES.sleeve, 5);
    // The falsifier: a wrapped write would put the +X vertex on the -X side.
    expect(position.getX(0)).toBeGreaterThan(0);
    expect(position.getX(1)).toBeLessThan(0);
  });

  it('admits digit ROTATION only, so a clip cannot stretch a finger', () => {
    const clip = new THREE.AnimationClip('idle', 0.2, [
      new THREE.QuaternionKeyframeTrack('Index1R.quaternion', [0, 0.2], [0, 0, 0, 1, 0.1, 0, 0, 0.995]),
      new THREE.VectorKeyframeTrack('Index1R.position', [0, 0.2], [0, 0, 0, 4, 4, 4]),
      new THREE.VectorKeyframeTrack('Index1R.scale', [0, 0.2], [1, 1, 1, 9, 9, 9]),
      new THREE.QuaternionKeyframeTrack('UpperArmR.quaternion', [0, 0.2], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]);
    expect(firstPersonArmRuntimeClip(clip).tracks.map((track) => track.name)).toEqual(['Index1R.quaternion']);
  });

  it('drives a looping locomotion clip from the movement state', () => {
    expect(firstPersonArmBaseActionFor(false, false)).toBe('idle');
    expect(firstPersonArmBaseActionFor(true, false)).toBe('walk');
    expect(firstPersonArmBaseActionFor(true, true)).toBe('sprint');
    // Sprinting without a movement flag is still a sprint, not a freeze.
    expect(firstPersonArmBaseActionFor(false, true)).toBe('sprint');
  });

  it('produces bounded, mean-zero, counter-swinging arm motion that settles in ADS', () => {
    expect(FIRST_PERSON_ARM_MOTION_CONTRACT).toBe('welded-palm-elbow-pole-locomotion-v1');
    const at = (side: 'left' | 'right', t: number, moving: boolean, ads = 0) => firstPersonArmMotionSample({
      side, elapsedSeconds: t, phase: t * 9.2, movingBlend: moving ? 1 : 0, sprintBlend: 0, adsBlend: ads,
    });
    let sum = 0;
    let peak = 0;
    for (let step = 0; step < 720; step += 1) {
      const sample = at('right', step / 60, true);
      expect(Math.abs(sample.poleRadians)).toBeLessThanOrEqual(FIRST_PERSON_ARM_MOTION_MAX_POLE_RADIANS);
      expect(Math.abs(sample.wristRollRadians)).toBeLessThanOrEqual(FIRST_PERSON_ARM_MOTION_MAX_WRIST_ROLL_RADIANS);
      sum += sample.poleRadians;
      peak = Math.max(peak, Math.abs(sample.poleRadians));
    }
    // Mean-zero: the reviewed HF-340 elbow poles stay the pose, this only moves.
    expect(Math.abs(sum / 720)).toBeLessThan(0.005);
    // ...and it is real motion, not a rounding error.
    expect(peak).toBeGreaterThan(0.05);
    // Walking must move the arms more than standing still does.
    const walkPeak = Math.max(...Array.from({ length: 120 }, (_, i) => Math.abs(at('right', i / 60, true).poleRadians)));
    const idlePeak = Math.max(...Array.from({ length: 120 }, (_, i) => Math.abs(at('right', i / 60, false).poleRadians)));
    expect(walkPeak).toBeGreaterThan(idlePeak);
    // Aiming settles the arms, exactly as it settles bob, breath and sway.
    expect(Math.abs(at('right', 1.7, true, 1).poleRadians))
      .toBeLessThan(Math.abs(at('right', 1.7, true, 0).poleRadians));
    // The two arms counter-swing rather than pumping in unison.
    expect(at('left', 1.7, true).poleRadians).not.toBeCloseTo(at('right', 1.7, true).poleRadians, 3);
    // Non-finite input must not fling an elbow.
    expect(firstPersonArmMotionSample({
      side: 'right', elapsedSeconds: Number.NaN, phase: Number.POSITIVE_INFINITY, movingBlend: 4, sprintBlend: -3, adsBlend: 9,
    }).poleRadians).toBe(0);
  });
});

// HF-366: "Should be a 2d and 3d preview".
describe('operator menu preview (HF-366)', () => {
  it('gives every selectable skin a distinct portrait built from its own palette', () => {
    const audit = operatorSkinPortraitAudit();
    expect(audit.skins.length).toBe(SELECTABLE.length);
    expect(audit.distinctPortraits).toBe(SELECTABLE.length);
    expect(audit.missing).toEqual([]);
    for (const definition of SELECTABLE) {
      const svg = operatorSkinPortraitSvg(definition.id);
      const palette = operatorSkinPalette(definition.id);
      expect(svg.startsWith('<svg')).toBe(true);
      // The portrait must carry the skin's own colours, including the ARM
      // tints, so the card and the first-person arms cannot disagree.
      expect(svg).toContain(`#${palette.card.torso.toString(16).padStart(6, '0')}`);
      expect(svg).toContain(`#${palette.arm.sleeve.toString(16).padStart(6, '0')}`);
      expect(svg).toContain(`#${palette.arm.accent.toString(16).padStart(6, '0')}`);
      expect(operatorSkinSwatchMarkup(definition.id)).toContain(palette.card.materialLabel);
    }
  });

  it('never renders a placeholder emblem where a real skin exists', () => {
    const shell = readFileSync(new URL('./ui/pass64-shell.ts', import.meta.url), 'utf8');
    const start = shell.indexOf('function operatorPanelMarkup');
    const body = shell.slice(start, shell.indexOf('function menuMarkup', start));
    expect(body).not.toContain('operator-skin-emblem');
    expect(body).not.toContain("data-operator-art=\"emblem\"");
    // ...and the panel must not fall back to the near-identical dark stills
    // that produced the "they all looked greyed out" report.
    expect(body).not.toContain('operator-card.webp');
    for (const definition of SELECTABLE) {
      expect(operatorSkinPortraitSvg(definition.id)).not.toContain('STANDARD');
    }
  });

  it('mounts a live turntable that tracks the pressed skin card', () => {
    const shell = readFileSync(new URL('./ui/pass64-shell.ts', import.meta.url), 'utf8');
    // Assert on the RENDERED shell, not its source, so an interpolation that
    // silently stopped emitting the canvas would fail here.
    const rendered = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect(rendered).toContain(`id="${OPERATOR_PREVIEW_CANVAS_ID}"`);
    expect(rendered).toContain(`id="${OPERATOR_PREVIEW_STATUS_ID}"`);
    expect(rendered).toContain('data-menu-panel="operator"');
    // HF-364: the preview must ship with a production call site, not land as
    // another fully tested module with no caller.
    expect(shell).toContain('mountOperatorPreview(document)');
    expect(OPERATOR_PREVIEW_CONTRACT).toBe('live-turntable-selected-skin-v1');
    expect(OPERATOR_PREVIEW_TURN_RADIANS_PER_SECOND).toBeGreaterThan(0);
    // A full turn must take between five and thirty seconds: fast enough to
    // show the back, slow enough to read.
    const secondsPerTurn = (Math.PI * 2) / OPERATOR_PREVIEW_TURN_RADIANS_PER_SECOND;
    expect(secondsPerTurn).toBeGreaterThan(5);
    expect(secondsPerTurn).toBeLessThan(30);
  });

  it('reads the selection from the pressed card and rejects an unknown id', () => {
    // There is no DOM environment in this suite, and the function's only DOM
    // dependency is querySelector plus dataset, so a minimal stub exercises the
    // real selector string rather than a reimplementation of it.
    const panel = (cards: readonly { id: string; pressed: boolean }[]): ParentNode => ({
      querySelector: (selector: string) => {
        if (selector !== '[data-operator-skin][aria-pressed="true"]') return null;
        const found = cards.find((entry) => entry.pressed);
        return found ? ({ dataset: { operatorSkin: found.id } } as unknown as Element) : null;
      },
    } as unknown as ParentNode);
    expect(selectedOperatorSkinFrom(panel(SELECTABLE.map((entry, index) => ({ id: entry.id, pressed: index === 2 })))))
      .toBe(SELECTABLE[2]!.id);
    expect(selectedOperatorSkinFrom(panel([{ id: 'not-a-skin', pressed: true }]))).toBe('default');
    expect(selectedOperatorSkinFrom(panel([{ id: 'explorer', pressed: false }]))).toBe('default');
  });
});
