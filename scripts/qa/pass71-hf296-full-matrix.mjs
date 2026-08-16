import { createHash } from 'node:crypto';

export const PASS71_HF296_ARENAS = Object.freeze([
  'atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range',
]);
export const PASS71_HF296_STANCES = Object.freeze(['stand', 'crouch', 'prone']);
export const PASS71_HF296_WEAPONS = Object.freeze([
  'carbine', 'smg', 'lmg', 'scattergun', 'sniper',
  'mini-uzi', 'mp5', 'm4a1', 'ak-47', 'minigun', 'm14-ebr', 'slug-shotgun',
  'pistol', 'machine-pistol', 'magnum', 'flashlight-pistol', 'explosive-crossbow',
  'railgun', 'flamethrower', 'flare-gun',
]);
export const PASS71_HF296_LOCAL_ROLES = Object.freeze(['solo', 'host-local', 'guest-local']);
export const PASS71_HF296_REMOTE_ROLES = Object.freeze(['host-saw-guest', 'guest-saw-host']);
export const PASS71_HF296_FIXTURES = Object.freeze([
  'floor', 'wall', 'oblique', 'corner', 'door-return',
]);
// Fire follows melee so the shipped fire presentation synchronously clears the
// retained knife arc before the next weapon/fixture cell begins.
export const PASS71_HF296_ACTIONS = Object.freeze(['hip', 'ads', 'reload', 'melee', 'fire']);
export const PASS71_HF296_VISUAL_WEAPON = 'm4a1';
export const PASS71_HF296_VISUAL_ACTION = 'fire';

const KEY_SEPARATOR = '\u001f';

function cartesian(parts, index = 0, prefix = [], result = []) {
  if (index === parts.length) {
    result.push(prefix.join(KEY_SEPARATOR));
    return result;
  }
  for (const value of parts[index]) cartesian(parts, index + 1, [...prefix, value], result);
  return result;
}

export const PASS71_HF296_LOCAL_KEYS = Object.freeze(cartesian([
  PASS71_HF296_ARENAS,
  PASS71_HF296_STANCES,
  PASS71_HF296_WEAPONS,
  PASS71_HF296_LOCAL_ROLES,
  PASS71_HF296_FIXTURES,
  PASS71_HF296_ACTIONS,
]));

export const PASS71_HF296_REMOTE_KEYS = Object.freeze(cartesian([
  PASS71_HF296_ARENAS,
  PASS71_HF296_STANCES,
  PASS71_HF296_WEAPONS,
  PASS71_HF296_REMOTE_ROLES,
  PASS71_HF296_FIXTURES,
]));

export const PASS71_HF296_VISUAL_KEYS = Object.freeze(cartesian([
  PASS71_HF296_ARENAS,
  PASS71_HF296_STANCES,
  PASS71_HF296_LOCAL_ROLES,
  PASS71_HF296_FIXTURES,
]));

export function pass71Hf296LocalKey({ arena, stance, weapon, role, fixture, action }) {
  return [arena, stance, weapon, role, fixture, action].join(KEY_SEPARATOR);
}

export function pass71Hf296RemoteKey({ arena, stance, weapon, role, fixture }) {
  return [arena, stance, weapon, role, fixture].join(KEY_SEPARATOR);
}

export function pass71Hf296VisualKey({ arena, stance, role, fixture }) {
  return [arena, stance, role, fixture].join(KEY_SEPARATOR);
}

export function pass71Hf296KeyDigest(keys) {
  return createHash('sha256').update(`${[...keys].sort().join('\n')}\n`, 'utf8').digest('hex');
}

export const PASS71_HF296_LOCAL_KEY_SHA256 = pass71Hf296KeyDigest(PASS71_HF296_LOCAL_KEYS);
export const PASS71_HF296_REMOTE_KEY_SHA256 = pass71Hf296KeyDigest(PASS71_HF296_REMOTE_KEYS);
export const PASS71_HF296_VISUAL_KEY_SHA256 = pass71Hf296KeyDigest(PASS71_HF296_VISUAL_KEYS);

export function pass71Hf296ExactSetFailures(actual, expected, label) {
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

export function assertPass71Hf296ExactSets({ localKeys, remoteKeys, visualKeys }) {
  const failures = [
    ...pass71Hf296ExactSetFailures(localKeys, PASS71_HF296_LOCAL_KEYS, 'local-matrix'),
    ...pass71Hf296ExactSetFailures(remoteKeys, PASS71_HF296_REMOTE_KEYS, 'remote-projection-matrix'),
    ...pass71Hf296ExactSetFailures(visualKeys, PASS71_HF296_VISUAL_KEYS, 'visual-matrix'),
  ];
  if (failures.length > 0) throw new Error(`HF-296 exact sets failed: ${failures.join(', ')}`);
  return true;
}

export const PASS71_HF296_MATRIX_COUNTS = Object.freeze({
  local: PASS71_HF296_LOCAL_KEYS.length,
  remote: PASS71_HF296_REMOTE_KEYS.length,
  visual: PASS71_HF296_VISUAL_KEYS.length,
  weaponCatalog: PASS71_HF296_WEAPONS.length,
});
