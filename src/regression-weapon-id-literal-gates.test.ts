/**
 * REGRESSION GATE — no bare weapon-id literal may gate behaviour that a
 * LIVERY VARIANT of that weapon shares.
 *
 * Owner 2026-08-30: "cant see any flames ... when i pick up the crimson one".
 *
 * Root cause (HF-402): the whole flamethrower presentation and its authority
 * reach hung off `player.weapon === 'flamethrower'`. The care-package variant's
 * id is 'crimson-flamethrower', so it fell into the ballistic branch — a
 * bullet tracer, no stream, no ground ignition, and a 90 m presentation reach
 * against an 18 m authoritative one. Eight sites were converted to a family
 * predicate.
 *
 * Why it shipped: adding a second weapon id that reuses an existing weapon's
 * authored chassis silently invalidated every equality test written against
 * the first one, and nothing anywhere related "this weapon has a variant" to
 * "these literal comparisons are now wrong".
 *
 * This gate closes that. It derives the family relation from the shipped
 * livery-alias table, scans legacy-main for literal equality against any
 * family-bearing weapon id, and fails on every hit that is not in an explicit
 * allowlist. Each allowlist entry carries a reason AND a machine-checkable
 * proof of that reason, so an entry cannot survive the premise that justified
 * it. A new bare literal is a new failure with no way to be waved through.
 *
 * Owner date 2026-08-30.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import { WEAPON_IDS, type WeaponId } from './protocol';
import { TIMED_MAP_WEAPON_IDS } from './timed-map-weapon-authority';
import { WEAPON_LIVERY_ALIASES, authoredFirearmIdFor } from './weapon-model';

const MAIN_SOURCE = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const MAIN_LINES = MAIN_SOURCE.split(/\r?\n/);
const FLAME_SYSTEM_SOURCE = readFileSync(new URL('./flamethrower-stream-system.ts', import.meta.url), 'utf8');

/**
 * Weapons grouped by the authored chassis they actually resolve to. A group
 * with more than one member is a LIVERY FAMILY: two ids that are the same gun
 * and must behave the same everywhere except where a difference is authored.
 * Derived, never listed — a second livery variant joins its family here on the
 * commit that introduces it.
 */
const CHASSIS_FAMILIES: ReadonlyMap<string, readonly WeaponId[]> = (() => {
  const groups = new Map<string, WeaponId[]>();
  for (const id of WEAPON_IDS) {
    const chassis = authoredFirearmIdFor(id) ?? id;
    const members = groups.get(chassis) ?? [];
    members.push(id);
    groups.set(chassis, members);
  }
  return groups;
})();

const FAMILY_BEARING_IDS: readonly WeaponId[] = Object.freeze(
  [...CHASSIS_FAMILIES.values()].filter((members) => members.length > 1).flat().sort(),
);

type LiteralGate = Readonly<{ line: number; subject: string; operator: string; weapon: string; text: string }>;

function scanLiteralGates(): readonly LiteralGate[] {
  if (FAMILY_BEARING_IDS.length === 0) return [];
  const alternation = [...FAMILY_BEARING_IDS]
    .sort((left, right) => right.length - left.length)
    .join('|');
  // `subject` is the whole dotted access being compared, so an allowlist entry
  // names WHAT is being tested rather than a line number that any edit moves.
  const pattern = new RegExp(
    String.raw`([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*(===|!==)\s*'(${alternation})'`,
    'g',
  );
  const found: LiteralGate[] = [];
  MAIN_LINES.forEach((line, index) => {
    const trimmed = line.trim();
    // Prose about the defect is not the defect.
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    for (const match of line.matchAll(pattern)) {
      found.push({
        line: index + 1,
        subject: match[1],
        operator: match[2],
        weapon: match[3],
        text: trimmed,
      });
    }
  });
  return Object.freeze(found);
}

const LITERAL_GATES = scanLiteralGates();

/**
 * The DELIBERATE exceptions. `signature` is the comparison as written;
 * `reason` says why the family must NOT be widened there; `verify` proves the
 * reason still holds. An entry whose premise dies takes the suite with it.
 */
type Exception = Readonly<{
  signature: string;
  reason: string;
  verify: () => void;
}>;

/** Every family member other than the one authored as the arena's map weapon. */
function variantsOf(weapon: string): readonly WeaponId[] {
  const chassis = authoredFirearmIdFor(weapon as WeaponId) ?? weapon;
  return (CHASSIS_FAMILIES.get(chassis) ?? []).filter((id) => id !== weapon);
}

function catalogEntry(id: string) {
  const entry = WEAPON_CATALOG.find((weapon) => weapon.id === id);
  expect(entry, `${id} is not in the weapon catalog`).toBeDefined();
  return entry!;
}

const ALLOWED_LITERAL_GATES: readonly Exception[] = Object.freeze([
  {
    signature: "fire.damageSource === 'flamethrower'",
    reason: 'damageSource is a ground-fire ORIGIN enum, not a weapon id; its domain '
      + 'is {flamethrower, carpet-bomber} and contains no livery variant, so there '
      + 'is no family to widen to.',
    verify: () => {
      expect(FLAME_SYSTEM_SOURCE).toContain("damageSource: 'flamethrower' | 'carpet-bomber';");
      for (const variant of variantsOf('flamethrower')) {
        expect(FLAME_SYSTEM_SOURCE).not.toContain(`'${variant}'`);
      }
    },
  },
  {
    signature: "request.weapon === 'flamethrower'",
    reason: 'HF-334 timed-map-weapon consumption gate. Only the arena-bound map '
      + 'weapon meters the shared host tank; the care-package variant carries its '
      + 'own finite ammo, and widening this would let a grant consume the world '
      + 'pickup — the exact defect HF-334 was refused twice for.',
    verify: () => {
      expect(TIMED_MAP_WEAPON_IDS).toContain('flamethrower');
      for (const variant of variantsOf('flamethrower')) {
        expect(TIMED_MAP_WEAPON_IDS, `${variant} must not meter the map tank`).not.toContain(variant);
      }
      // The gate must still be the thing that guards consumption, not decoration.
      const start = MAIN_SOURCE.indexOf("if (request.weapon === 'flamethrower') {");
      expect(start).toBeGreaterThan(-1);
      expect(MAIN_SOURCE.indexOf('consumeTimedMapWeaponShot', start)).toBeGreaterThan(start);
    },
  },
  {
    signature: "bot.weapon !== 'flamethrower'",
    reason: 'Hosted-bot presentation lane. The catalog bars bots from every livery '
      + 'variant, so widening this could only let a bot broadcast a weapon it can '
      + 'never hold.',
    verify: () => { expectBotsCannotHoldVariantsOf('flamethrower'); },
  },
  {
    signature: "bot.weapon === 'flamethrower'",
    reason: 'Hosted-bot authority reach, keyed identically to the presentation lane '
      + 'above so the two can never disagree about the same bot.',
    verify: () => { expectBotsCannotHoldVariantsOf('flamethrower'); },
  },
  {
    signature: "authoredWeapon === 'flamethrower'",
    reason: 'Expected-presentation derivation for a hosted bot damage message; '
      + 'authoredWeapon defaults to bot.weapon, so it is the same bot-only domain.',
    verify: () => { expectBotsCannotHoldVariantsOf('flamethrower'); },
  },
  {
    signature: "message.weapon === 'flamethrower'",
    reason: 'Receiving side of that same bot damage message. The wire schema pins '
      + "weapon to what a bot can hold, and the branch also accepts the explicit "
      + "'flamethrower-stream' presentation tag, so a stream is never mistaken for "
      + 'a bullet tracer.',
    verify: () => {
      expectBotsCannotHoldVariantsOf('flamethrower');
      expect(MAIN_SOURCE).toContain("const hasDedicatedPresentation = message.weapon === 'flamethrower'\n"
        + "    || message.presentation === 'flamethrower-stream'");
    },
  },
]);

function expectBotsCannotHoldVariantsOf(weapon: string): void {
  for (const variant of variantsOf(weapon)) {
    expect(catalogEntry(variant).policies.bot, `${variant} must be barred from bots`).toBe('never');
  }
}

describe('livery-family derivation', () => {
  it('finds the flamethrower family from the shipped chassis table, not a list', () => {
    expect(Object.keys(WEAPON_LIVERY_ALIASES).length).toBeGreaterThan(0);
    expect([...FAMILY_BEARING_IDS]).toEqual(['crimson-flamethrower', 'flamethrower']);
    // Corroborated from a completely independent authored field: the two share
    // one calibre label, which is the catalog's only flame discriminator.
    const streamWeapons = WEAPON_CATALOG
      .filter((weapon) => weapon.penetration.calibreLabel === 'ignited fuel stream')
      .map((weapon) => weapon.id)
      .sort();
    expect(streamWeapons).toEqual([...FAMILY_BEARING_IDS]);
  });

  it('has a runtime predicate that covers the whole family', () => {
    // The predicate must be at least as wide as the chassis family, or the
    // conversion HF-402 performed is incomplete for some member.
    const declaration = MAIN_SOURCE.slice(
      MAIN_SOURCE.indexOf('const FLAMETHROWER_FAMILY_WEAPON_IDS'),
      MAIN_SOURCE.indexOf('function isFlamethrowerFamilyWeapon'),
    );
    expect(declaration.length).toBeGreaterThan(0);
    for (const id of FAMILY_BEARING_IDS) {
      expect(declaration, `${id} missing from the family predicate`).toContain(`'${id}'`);
    }
    // And it must actually be load-bearing rather than defined and unused —
    // the crossbow optic shipped authored-and-unread for exactly this reason.
    const uses = MAIN_SOURCE.split('isFlamethrowerFamilyWeapon(').length - 1;
    expect(uses, 'the family predicate has no callers').toBeGreaterThanOrEqual(8);
  });
});

describe('no unreviewed weapon-id literal gate', () => {
  it('scans something, rather than passing on an empty match set', () => {
    // A scanner that matches nothing is worse than no scanner: it reports
    // green forever. Six known comparisons exist today.
    expect(FAMILY_BEARING_IDS.length).toBeGreaterThan(0);
    expect(LITERAL_GATES.length).toBeGreaterThanOrEqual(6);
  });

  it('has every literal comparison covered by a justified exception', () => {
    const allowed = new Set(ALLOWED_LITERAL_GATES.map((entry) => entry.signature));
    const uncovered = LITERAL_GATES
      .filter((gate) => !allowed.has(`${gate.subject} ${gate.operator} '${gate.weapon}'`))
      .map((gate) => `legacy-main.ts:${gate.line} ${gate.subject} ${gate.operator} '${gate.weapon}'`);
    // Convert it to the family predicate, or add an allowlist entry that says
    // why the variant must be excluded and proves the premise. Nothing else.
    expect(uncovered).toEqual([]);
  });

  it('keeps every exception earning its place', () => {
    for (const entry of ALLOWED_LITERAL_GATES) {
      expect(
        LITERAL_GATES.some((gate) => `${gate.subject} ${gate.operator} '${gate.weapon}'` === entry.signature),
        `stale exception: "${entry.signature}" no longer appears in legacy-main.ts`,
      ).toBe(true);
      expect(entry.reason.length, entry.signature).toBeGreaterThan(60);
      entry.verify();
    }
  });

  it('leaves the presentation and authority reach on the family predicate', () => {
    // The three conversions the owner could actually see: the local stream, the
    // remote stream, and the reach both sides resolve against.
    expect(MAIN_SOURCE).toContain('const flamethrowerShot = isFlamethrowerFamilyWeapon(player.weapon);');
    expect(MAIN_SOURCE).toContain('const remoteFlamethrowerShot = isFlamethrowerFamilyWeapon(request.weapon);');
    expect(MAIN_SOURCE).toContain(
      'if (isFlamethrowerFamilyWeapon(weapon) && distance > FLAMETHROWER_EFFECT.rangeM + 0.05) return 0;',
    );
    // Presentation reach and authority reach must be the SAME number, or a
    // crimson shot draws flame at a range the host will never award damage at.
    expect(MAIN_SOURCE).toContain('const maximumShotDistance = flamethrowerShot ? FLAMETHROWER_EFFECT.rangeM : 90;');
  });
});
