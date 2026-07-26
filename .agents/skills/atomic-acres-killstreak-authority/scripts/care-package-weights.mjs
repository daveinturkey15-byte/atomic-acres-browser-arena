export const CARE_PACKAGE_ID = 'care-package';
export const NUKE_ID = 'nuke';
export const FIXED_DENOMINATOR = 100;
export const NON_NUKE_SCALE = FIXED_DENOMINATOR - 1;

function safeAdd(left, right, label) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error(`${label} exceeds safe-integer range`);
  return result;
}

function safeMultiply(left, right, label) {
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new Error(`${label} exceeds safe-integer range`);
  return result;
}

/** Derive the complete reward projection directly from catalog rows. */
export function deriveCarePackagePool(catalog) {
  if (!Array.isArray(catalog) || catalog.length === 0) throw new Error('catalog must be a non-empty array');
  if (new Set(catalog.map(item => item?.id)).size !== catalog.length) throw new Error('catalog IDs must be unique');
  const carePackage = catalog.find(item => item?.id === CARE_PACKAGE_ID);
  const nuke = catalog.find(item => item?.id === NUKE_ID);
  if (!carePackage || carePackage.availability !== 'selectable' || carePackage.carePackageBaseWeightUnits !== 0) {
    throw new Error('care-package must be selectable with zero recursive base weight');
  }
  if (!nuke || nuke.availability !== 'selectable' || nuke.carePackageBaseWeightUnits !== 0) {
    throw new Error('nuke must be selectable with zero fixed-probability base weight');
  }

  let nonNukeBaseWeightTotal = 0;
  for (const item of catalog) {
    const base = item?.carePackageBaseWeightUnits;
    if (!Number.isSafeInteger(base) || base < 0) throw new Error(`${item?.id ?? '<invalid>'}: invalid base weight`);
    const eligible = item.availability !== 'retired' && item.id !== CARE_PACKAGE_ID;
    if (!eligible || item.id === NUKE_ID) {
      if (base !== 0) throw new Error(`${item.id}: excluded or fixed-probability entry must have zero base weight`);
      continue;
    }
    if (base <= 0) throw new Error(`${item.id}: eligible entry requires positive base weight`);
    nonNukeBaseWeightTotal = safeAdd(nonNukeBaseWeightTotal, base, 'non-Nuke base total');
  }
  if (nonNukeBaseWeightTotal <= 0) throw new Error('non-Nuke base total must be positive');

  let cursor = 0;
  const entries = [];
  const derivedWeights = new Map();
  for (const item of catalog) {
    let weightUnits = 0;
    if (item.availability !== 'retired' && item.id !== CARE_PACKAGE_ID) {
      weightUnits = item.id === NUKE_ID
        ? nonNukeBaseWeightTotal
        : safeMultiply(item.carePackageBaseWeightUnits, NON_NUKE_SCALE, `${item.id} derived weight`);
      const startInclusive = cursor;
      cursor = safeAdd(cursor, weightUnits, 'derived care-package total');
      entries.push(Object.freeze({ id: item.id, weightUnits, startInclusive, endExclusive: cursor }));
    }
    derivedWeights.set(item.id, weightUnits);
  }
  const expectedTotal = safeMultiply(nonNukeBaseWeightTotal, FIXED_DENOMINATOR, 'expected derived total');
  if (cursor !== expectedTotal) throw new Error(`derived total mismatch ${cursor}/${expectedTotal}`);
  if (derivedWeights.get(NUKE_ID) * FIXED_DENOMINATOR !== cursor) throw new Error('nuke is not exactly one percent');
  return Object.freeze({
    entries: Object.freeze(entries),
    derivedWeights,
    nonNukeBaseWeightTotal,
    totalWeightUnits: cursor,
  });
}

export function rewardAtUnit(pool, unit) {
  if (!Number.isSafeInteger(unit) || unit < 0 || unit >= pool.totalWeightUnits) throw new Error('reward unit out of range');
  const entry = pool.entries.find(candidate => unit < candidate.endExclusive);
  if (!entry) throw new Error('reward unit did not resolve');
  return entry.id;
}
