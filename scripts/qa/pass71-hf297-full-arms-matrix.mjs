import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';

export const PASS71_HF297_FULL_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop-1440p', width: 2560, height: 1440, mobile: false }),
  Object.freeze({ id: 'desktop-4k', width: 3840, height: 2160, mobile: false }),
  Object.freeze({ id: 'ultrawide-1440p', width: 3440, height: 1440, mobile: false }),
  Object.freeze({ id: 'iphone-15-landscape', width: 844, height: 390, mobile: true }),
  Object.freeze({ id: 'iphone-15-portrait', width: 390, height: 844, mobile: true }),
]);

export const PASS71_HF297_FULL_POSE_STATES = Object.freeze([
  Object.freeze({ id: 'stand-open', stance: 'stand', contact: false }),
  Object.freeze({ id: 'crouch-open', stance: 'crouch', contact: false }),
  Object.freeze({ id: 'prone-open', stance: 'prone', contact: false }),
  Object.freeze({ id: 'prone-contact', stance: 'prone', contact: true }),
]);

export const PASS71_HF297_FULL_RENDERERS = Object.freeze(['webgl2', 'webgpu']);
export const PASS71_HF297_FULL_LOCAL_ROLES = Object.freeze(['solo', 'host-local', 'guest-local']);
export const PASS71_HF297_FULL_FIREARM_ACTIONS = Object.freeze(['hip', 'ads', 'fire', 'reload']);
export const PASS71_HF297_FULL_KNIFE_ACTIONS = Object.freeze(['melee']);
export const PASS71_HF297_FULL_REVIEW_TARGETS = Object.freeze([
  Object.freeze({ weapon: 'm4a1', action: 'fire' }),
  Object.freeze({ weapon: 'pistol', action: 'reload' }),
  Object.freeze({ weapon: 'field-knife', action: 'melee' }),
]);
export const PASS71_HF297_FULL_CATALOG_VIEWPORT = 'desktop-1440p';
export const PASS71_HF297_FULL_CATALOG_POSE_STATE = 'stand-open';
export const PASS71_HF297_FULL_CATALOG_ROLE = 'solo';

export const PASS71_HF297_SOURCE_CATALOG_PATHS = Object.freeze({
  ownerFeedback: 'docs/pass71-sources/codex-owner-feedback-2026-08-13.txt',
  protocol: 'src/protocol.ts',
  weaponCatalog: 'src/combat/weapon-catalog.ts',
  adsSightProfiles: 'src/ads-sight-profile.ts',
  gameplay: 'src/gameplay.ts',
  debugController: 'src/legacy-main.ts',
  firearmAuthoredActions: 'scripts/qa/pass65-crossbow-arms-glb.mjs',
  knifeAuthoredActions: 'scripts/qa/pass65-field-knife-glb.mjs',
});

const KEY_SEPARATOR = '\u001f';
export const PASS71_HF297_CANONICAL_LEDGER_CLAIM = 'First-person arms still disappear or terminate inside the viewport, look thin or detached, and align or animate badly for firearms, the pistol and the knife; use the supplied generated image only as a composition and proportion baseline.';
const EXPECTED_STANCES = Object.freeze(['stand', 'crouch', 'prone']);
const EXPECTED_CONTROLLER_ACTIONS = Object.freeze(['hip', 'ads', 'fire', 'reload', 'melee']);
const ACTION_CLIP_REQUIREMENTS = Object.freeze({
  hip: Object.freeze(['idle']),
  ads: Object.freeze(['ads-in', 'ads-out']),
  fire: Object.freeze(['fire']),
  reload: Object.freeze(['reload', 'empty-reload']),
  melee: Object.freeze(['melee']),
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sourceFile(text, path) {
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
}

function unwrap(node) {
  let current = node;
  while (current) {
    if (ts.isParenthesizedExpression(current)
      || ts.isAsExpression(current)
      || ts.isTypeAssertionExpression(current)
      || ts.isNonNullExpression(current)
      || typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isCallExpression(current)
      && ts.isPropertyAccessExpression(current.expression)
      && current.expression.expression.getText() === 'Object'
      && current.expression.name.text === 'freeze'
      && current.arguments.length === 1) {
      [current] = current.arguments;
      continue;
    }
    return current;
  }
  return current;
}

function declarations(file) {
  const result = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      result.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
}

function evaluateStringArray(node, variables, stack = []) {
  const value = unwrap(node);
  if (ts.isIdentifier(value)) {
    if (stack.includes(value.text)) throw new Error(`cyclic source array ${[...stack, value.text].join(' -> ')}`);
    const initializer = variables.get(value.text);
    if (!initializer) throw new Error(`unknown source array ${value.text}`);
    return evaluateStringArray(initializer, variables, [...stack, value.text]);
  }
  if (!ts.isArrayLiteralExpression(value)) throw new Error(`source expression is not an array: ${value.getText()}`);
  const result = [];
  for (const element of value.elements) {
    if (ts.isSpreadElement(element)) {
      result.push(...evaluateStringArray(element.expression, variables, stack));
    } else if (ts.isStringLiteralLike(element)) {
      result.push(element.text);
    } else {
      throw new Error(`source array contains a non-string element: ${element.getText()}`);
    }
  }
  return result;
}

function namedStringArray(text, path, name) {
  const file = sourceFile(text, path);
  const variables = declarations(file);
  const initializer = variables.get(name);
  if (!initializer) throw new Error(`${path} does not declare ${name}`);
  return evaluateStringArray(initializer, variables, [name]);
}

function namedStringUnion(text, path, name) {
  const file = sourceFile(text, path);
  let alias = null;
  const visit = (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === name) alias = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!alias) throw new Error(`${path} does not declare type ${name}`);
  const union = alias.type;
  const nodes = ts.isUnionTypeNode(union) ? union.types : [union];
  return nodes.map((node) => {
    if (!ts.isLiteralTypeNode(node) || !ts.isStringLiteralLike(node.literal)) {
      throw new Error(`${path} ${name} contains a non-string member`);
    }
    return node.literal.text;
  });
}

function propertyName(property) {
  const name = property.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function namedObjectArrayIds(text, path, name) {
  const file = sourceFile(text, path);
  const variables = declarations(file);
  const initializer = unwrap(variables.get(name));
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) throw new Error(`${path} ${name} is not an object array`);
  return initializer.elements.map((raw, index) => {
    const element = unwrap(raw);
    if (!ts.isObjectLiteralExpression(element)) throw new Error(`${path} ${name}[${index}] is not an object`);
    const id = element.properties.find((property) => propertyName(property) === 'id');
    if (!id || !ts.isPropertyAssignment(id)) throw new Error(`${path} ${name}[${index}] has no id`);
    const value = unwrap(id.initializer);
    if (!ts.isStringLiteralLike(value)) throw new Error(`${path} ${name}[${index}].id is not literal`);
    return value.text;
  });
}

function namedRecordKeysByStringProperty(text, path, name, field, expectedValue) {
  const file = sourceFile(text, path);
  const variables = declarations(file);
  const initializer = unwrap(variables.get(name));
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) throw new Error(`${path} ${name} is not an object`);
  const result = [];
  for (const property of initializer.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = propertyName(property);
    const value = unwrap(property.initializer);
    if (!key || !ts.isObjectLiteralExpression(value)) continue;
    const marker = value.properties.find((candidate) => propertyName(candidate) === field);
    if (!marker || !ts.isPropertyAssignment(marker)) continue;
    const markerValue = unwrap(marker.initializer);
    if (ts.isStringLiteralLike(markerValue) && markerValue.text === expectedValue) result.push(key);
  }
  return result;
}

function duplicate(values) {
  return values.find((value, index) => values.indexOf(value) !== index) ?? null;
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function requireExactSet(actual, expected, label) {
  const repeated = duplicate(actual);
  if (repeated) throw new Error(`${label} contains duplicate ${repeated}`);
  if (!sameSet(actual, expected)) {
    throw new Error(`${label} exact set mismatch: ${JSON.stringify({ actual, expected })}`);
  }
}

function validateSourceCatalog(catalog) {
  if (!catalog || catalog.schemaVersion !== 1) throw new Error('HF-297 source catalog schema is invalid');
  if (catalog.feedbackClaim !== PASS71_HF297_CANONICAL_LEDGER_CLAIM) {
    throw new Error('HF-297 canonical owner-feedback claim drifted');
  }
  requireExactSet(catalog.weaponDefinitionIds, catalog.weaponIds, 'weapon definition catalog');
  requireExactSet(catalog.stances, EXPECTED_STANCES, 'stance catalog');
  requireExactSet(catalog.controllerActions, EXPECTED_CONTROLLER_ACTIONS, 'first-person controller action catalog');
  for (const weapon of catalog.fullscreenOpticWeapons) {
    if (!catalog.weaponIds.includes(weapon)) throw new Error(`fullscreen optic ${weapon} is not a canonical weapon`);
  }
  if (catalog.fullscreenOpticWeapons.length < 1) throw new Error('fullscreen optic catalog is empty');
  for (const action of PASS71_HF297_FULL_FIREARM_ACTIONS) {
    if (!catalog.controllerActions.includes(action)) throw new Error(`controller does not expose ${action}`);
    for (const clip of ACTION_CLIP_REQUIREMENTS[action]) {
      if (!catalog.firearmAuthoredActions.includes(clip)) throw new Error(`authored firearm action ${clip} is missing`);
    }
  }
  for (const action of PASS71_HF297_FULL_KNIFE_ACTIONS) {
    if (!catalog.controllerActions.includes(action)) throw new Error(`controller does not expose ${action}`);
    for (const clip of ACTION_CLIP_REQUIREMENTS[action]) {
      if (!catalog.knifeAuthoredActions.includes(clip)) throw new Error(`authored knife action ${clip} is missing`);
    }
  }
  for (const target of PASS71_HF297_FULL_REVIEW_TARGETS) {
    if (target.weapon !== 'field-knife' && !catalog.weaponIds.includes(target.weapon)) {
      throw new Error(`review target ${target.weapon}/${target.action} is absent from the canonical catalog`);
    }
  }
  return catalog;
}

export function pass71Hf297SourceCatalogFromTexts(texts) {
  const primary = namedStringArray(texts.protocol, PASS71_HF297_SOURCE_CATALOG_PATHS.protocol, 'PRIMARY_WEAPON_IDS');
  const sidearms = namedStringArray(texts.protocol, PASS71_HF297_SOURCE_CATALOG_PATHS.protocol, 'SIDEARM_WEAPON_IDS');
  const specials = namedStringArray(texts.protocol, PASS71_HF297_SOURCE_CATALOG_PATHS.protocol, 'SPECIAL_WEAPON_IDS');
  const weaponIds = namedStringArray(texts.protocol, PASS71_HF297_SOURCE_CATALOG_PATHS.protocol, 'WEAPON_IDS');
  if (JSON.stringify(weaponIds) !== JSON.stringify([...primary, ...sidearms, ...specials])) {
    throw new Error('WEAPON_IDS is not the exact ordered projection of primary, sidearm, and special catalogs');
  }
  const sourceSha256 = Object.fromEntries(Object.entries(PASS71_HF297_SOURCE_CATALOG_PATHS).map(
    ([key]) => [`${key}Sha256`, sha256(Buffer.from(texts[key], 'utf8'))],
  ));
  const catalog = {
    schemaVersion: 1,
    feedbackClaim: texts.ownerFeedback.split(/\r?\n/u).find((line) => (
      line.startsWith('First-person arms still disappear or terminate inside the viewport')
    )) ?? null,
    weaponIds,
    weaponDefinitionIds: namedObjectArrayIds(
      texts.weaponCatalog,
      PASS71_HF297_SOURCE_CATALOG_PATHS.weaponCatalog,
      'RAW_B1_WEAPON_DEFINITIONS',
    ),
    stances: namedStringUnion(texts.gameplay, PASS71_HF297_SOURCE_CATALOG_PATHS.gameplay, 'Stance'),
    controllerActions: namedStringUnion(
      texts.debugController,
      PASS71_HF297_SOURCE_CATALOG_PATHS.debugController,
      'Hf296ContactAction',
    ),
    fullscreenOpticWeapons: namedRecordKeysByStringProperty(
      texts.adsSightProfiles,
      PASS71_HF297_SOURCE_CATALOG_PATHS.adsSightProfiles,
      'ADS_SIGHT_PROFILES',
      'marker',
      'scope',
    ),
    firearmAuthoredActions: namedStringArray(
      texts.firearmAuthoredActions,
      PASS71_HF297_SOURCE_CATALOG_PATHS.firearmAuthoredActions,
      'REQUIRED_CORE_ACTIONS',
    ),
    knifeAuthoredActions: namedStringArray(
      texts.knifeAuthoredActions,
      PASS71_HF297_SOURCE_CATALOG_PATHS.knifeAuthoredActions,
      'REQUIRED_FIELD_KNIFE_ACTIONS',
    ),
    sourceSha256,
  };
  return Object.freeze(validateSourceCatalog(catalog));
}

export function pass71Hf297SourceCatalogAtSource(repositoryRoot, sourceSha) {
  if (!/^[a-f0-9]{40}$/u.test(sourceSha ?? '')) throw new Error('HF-297 source catalog requires a full source SHA');
  const texts = Object.fromEntries(Object.entries(PASS71_HF297_SOURCE_CATALOG_PATHS).map(([key, path]) => [
    key,
    execFileSync('git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`], {
      encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    }),
  ]));
  return pass71Hf297SourceCatalogFromTexts(texts);
}

export function pass71Hf297ActionTargets(catalog) {
  validateSourceCatalog(catalog);
  return Object.freeze([
    ...catalog.weaponIds.flatMap((weapon) => PASS71_HF297_FULL_FIREARM_ACTIONS.map((action) => Object.freeze({
      weapon, action, presentation: 'firearm', equippedWeapon: weapon,
    }))),
    Object.freeze({ weapon: 'field-knife', action: 'melee', presentation: 'knife', equippedWeapon: 'm4a1' }),
  ]);
}

export function pass71Hf297FullCellKey(value) {
  return [
    value.renderer, value.role, value.viewportId, value.poseStateId, value.weapon, value.action,
  ].join(KEY_SEPARATOR);
}

export function pass71Hf297FullCellIdentity(key) {
  const [renderer, role, viewportId, poseStateId, weapon, action, ...extra] = String(key).split(KEY_SEPARATOR);
  if (extra.length > 0 || [renderer, role, viewportId, poseStateId, weapon, action].some((value) => !value)) return null;
  return { renderer, role, viewportId, poseStateId, weapon, action };
}

export function pass71Hf297FullMatrixKeys(catalog) {
  const targets = pass71Hf297ActionTargets(catalog);
  const result = [];
  for (const renderer of PASS71_HF297_FULL_RENDERERS) {
    for (const role of PASS71_HF297_FULL_LOCAL_ROLES) {
      for (const viewport of PASS71_HF297_FULL_VIEWPORTS) {
        for (const poseState of PASS71_HF297_FULL_POSE_STATES) {
          for (const target of targets) result.push(pass71Hf297FullCellKey({
            renderer, role, viewportId: viewport.id, poseStateId: poseState.id,
            weapon: target.weapon, action: target.action,
          }));
        }
      }
    }
  }
  return Object.freeze(result);
}

export function pass71Hf297FullVisualKeys(catalog) {
  const targets = pass71Hf297ActionTargets(catalog);
  const keys = new Set();
  for (const renderer of PASS71_HF297_FULL_RENDERERS) {
    for (const target of targets) keys.add(pass71Hf297FullCellKey({
      renderer,
      role: PASS71_HF297_FULL_CATALOG_ROLE,
      viewportId: PASS71_HF297_FULL_CATALOG_VIEWPORT,
      poseStateId: PASS71_HF297_FULL_CATALOG_POSE_STATE,
      weapon: target.weapon,
      action: target.action,
    }));
  }
  for (const renderer of PASS71_HF297_FULL_RENDERERS) {
    for (const role of PASS71_HF297_FULL_LOCAL_ROLES) {
      for (const viewport of PASS71_HF297_FULL_VIEWPORTS) {
        for (const poseState of PASS71_HF297_FULL_POSE_STATES) {
          for (const target of PASS71_HF297_FULL_REVIEW_TARGETS) keys.add(pass71Hf297FullCellKey({
            renderer, role, viewportId: viewport.id, poseStateId: poseState.id,
            weapon: target.weapon, action: target.action,
          }));
        }
      }
    }
  }
  return Object.freeze([...keys].sort());
}

export function pass71Hf297FullKeyDigest(keys) {
  return sha256(Buffer.from(`${[...keys].sort().join('\n')}\n`, 'utf8'));
}

export function pass71Hf297FullExactSetFailures(actual, expected, label) {
  if (!Array.isArray(actual)) return [`${label}:not-array`];
  const failures = [];
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  if (actualSet.size !== actual.length) failures.push(`${label}:duplicate`);
  if (actual.length !== expected.length) failures.push(`${label}:count`);
  if ([...expectedSet].some((key) => !actualSet.has(key))) failures.push(`${label}:missing`);
  if ([...actualSet].some((key) => !expectedSet.has(key))) failures.push(`${label}:extra`);
  return failures;
}

export function pass71Hf297FullMatrixCounts(catalog) {
  const actionTargets = pass71Hf297ActionTargets(catalog);
  const telemetry = pass71Hf297FullMatrixKeys(catalog);
  const visual = pass71Hf297FullVisualKeys(catalog);
  return Object.freeze({
    weapons: catalog.weaponIds.length,
    firearmActionTargets: catalog.weaponIds.length * PASS71_HF297_FULL_FIREARM_ACTIONS.length,
    knifeActionTargets: PASS71_HF297_FULL_KNIFE_ACTIONS.length,
    actionTargets: actionTargets.length,
    telemetryCells: telemetry.length,
    embeddedVisualCells: visual.length,
    runtimeScopes: PASS71_HF297_FULL_RENDERERS.length * PASS71_HF297_FULL_LOCAL_ROLES.length,
  });
}

export function assertPass71Hf297FullExactSets({ telemetryKeys, visualKeys }, catalog) {
  const expectedTelemetry = pass71Hf297FullMatrixKeys(catalog);
  const expectedVisual = pass71Hf297FullVisualKeys(catalog);
  const failures = [
    ...pass71Hf297FullExactSetFailures(telemetryKeys, expectedTelemetry, 'telemetry-matrix'),
    ...pass71Hf297FullExactSetFailures(visualKeys, expectedVisual, 'visual-matrix'),
  ];
  if (failures.length > 0) throw new Error(`HF-297 exact sets failed: ${failures.join(', ')}`);
  return true;
}
