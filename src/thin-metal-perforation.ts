/**
 * HF-467 / R3 section 9: the SIBLING of the destructible shed's perforation
 * authority, for PLAIN thin-metal panels.
 *
 * The owner (HF-467): "thin metal (the shed) should get a hole with no
 * collision after". The shed got one, but `DestructibleShedDefinition` cannot
 * be reused for arbitrary arena panels: its validator requires exactly one
 * `role:'door'` surface, exactly six pre-authored chunks in a one-to-one map
 * with detachable surfaces, and outward-facing normals relative to the
 * placement origin (`destructible-world.ts`).
 * Loosening that validator to fit a sign board would be weakening a verifier.
 * So this module carries the same IDEA - N admitted hits on one panel open a
 * persistent aperture that `traceBallisticPath` passes through untouched -
 * without touching the shed's definition, state machine, or tests:
 *
 *   - Hits come from the existing trace energy result: `applyPanelImpact` is
 *     called with the `BallisticSurfaceImpact.energyAtEntryQ` the trace
 *     already computed (HF-467's own fix - no second energy model here).
 *   - An open hole registers with the SAME canonical aperture query the shed
 *     uses (`apertureQuery`), reusing - not copying - the exported shed
 *     primitives `apertureContainsPanelPoint`, `SHED_PANEL_COORD_Q` and the
 *     `BallisticAperture` type, so bullets and bot shot traces cross the hole
 *     at the exact entry point, host and guest alike.
 *   - The movement collider is deliberately KEPT: a bullet hole is not a
 *     doorway, exactly as the shed's `perforate` class promises
 *     (`ballistics.ts` class table). "No collision after" means no BALLISTIC
 *     collision at the hole.
 *   - Multiplayer is host-authoritative, mirroring the shed's replication
 *     path: the host mints holes and broadcasts a hashed state envelope; the
 *     message is shaped like `interactive-world-snapshot` (a new kind) and is
 *     registered in `protocol.ts` `isHostAuthorityMessage`, so `network.ts`
 *     drops anything a guest tries to mint on a guest connection.
 *   - Holes are budgeted per panel and per arena, and the decal presentation
 *     is a bounded instanced set (rim ring + alpha-cutout disc), never one
 *     draw call per hole.
 *
 * Panels enter through a small registry the ARENA fills: the arena exports
 * its authored panel specs (surface name + authored hit count) and hands the
 * built shot surfaces to `thinMetalPanelPlacements`, which derives stable
 * panel ids from the authored names. The arena keeps its geometry; this
 * module never moves, resizes, or re-rates a surface. Surfaces rated
 * `thin-metal` that are not registered here behave exactly as before.
 */

import * as THREE from 'three';
import {
  BALLISTIC_ENERGY_Q,
  BALLISTIC_MATERIALS,
  type BallisticApertureQuery,
  type BallisticSurface,
} from './ballistics';
import { canonicalSha256, stableStringify } from './canonical-state';
import type { Box2, Point3 } from './collision';
import { isArenaId } from './arena-identity';
import {
  SHED_PANEL_COORD_Q,
  apertureContainsPanelPoint,
  type BallisticAperture,
  type ShedArenaId,
} from './destructible-world';

export const THIN_METAL_PERFORATION_SCHEMA_VERSION = 1;

/**
 * One panel stops minting new holes after this many. The count of ADMITTED
 * hits keeps accumulating (dents read on later hits), but the aperture and
 * decal budget does not grow.
 */
export const THIN_METAL_MAX_HOLES_PER_PANEL = 2;

/** Arena-wide decal/aperture budget across every registered panel. */
export const THIN_METAL_MAX_HOLES_PER_ARENA = 24;

/**
 * A hit only counts toward a hole when the round's REMAINING energy at the
 * panel's entry face could actually buy into thin metal at all. Derived from
 * the shared resistance table (never a second constant to drift): a round
 * below the material's entry cost never perforated the sheet, so it never
 * opened a hole.
 */
export const THIN_METAL_PERFORATION_MIN_ENERGY_Q = Math.round(
  BALLISTIC_MATERIALS['thin-metal'].entryCost * BALLISTIC_ENERGY_Q,
);

/** Wire budget for one thin-metal state message. */
export const MAX_THIN_METAL_PERFORATION_MESSAGE_BYTES = 16 * 1024;

/** Authored registry entry. The arena owns the surface names and the N. */
export type ThinMetalPanelSpec = Readonly<{
  /** Exact `BallisticSurface.name` this panel binds to (both handed halves bind by name). */
  surfaceName: string;
  /** Admitted, energy-qualifying hits needed before the panel opens a hole. */
  hitsToOpen: number;
  /** Hole radius in metres; defaults to {@link THIN_METAL_DEFAULT_HOLE_RADIUS_M}. */
  holeRadiusM?: number;
}>;

export const THIN_METAL_DEFAULT_HOLE_RADIUS_M = 0.07;

/** One concrete panel, derived from the arena's built shot surfaces. */
export type ThinMetalPanelPlacement = Readonly<{
  /** Stable across builds: authored surface name + ordinal among its matches. */
  id: string;
  surfaceName: string;
  /** The exact `BallisticSurface.id` this panel binds to. */
  surfaceId: string;
  hitsToOpen: number;
  holeRadiusM: number;
  centre: Point3;
  halfU: number;
  halfV: number;
  uAxis: Point3;
  vAxis: Point3;
  normal: Point3;
  /** Quantised panel thickness along `normal`, in mm. */
  thicknessMmQ: number;
}>;

export type ThinMetalPanelState = Readonly<{
  panelId: string;
  hits: number;
  holes: readonly BallisticAperture[];
}>;

export type ThinMetalPerforationEnvelope = Readonly<{
  schemaVersion: typeof THIN_METAL_PERFORATION_SCHEMA_VERSION;
  arenaId: ShedArenaId;
  matchEpoch: number;
  revision: number;
  panels: readonly ThinMetalPanelState[];
  hashAlgorithm: 'sha256';
  hash: string;
}>;

/**
 * Shaped exactly like `InteractiveWorldSnapshotMessage` with a new kind, so
 * the shed's whole replication path (host authors, guest ingress drops
 * non-host messages via `isHostAuthorityMessage`) applies unchanged.
 */
export type ThinMetalPerforationStateMessage = Readonly<{
  type: 'thin-metal-perforation-state';
  schemaVersion: typeof THIN_METAL_PERFORATION_SCHEMA_VERSION;
  by: string;
  envelope: ThinMetalPerforationEnvelope;
  nonce: number;
}>;

export type ThinMetalMutationResult = Readonly<{
  accepted: boolean;
  reason?: 'guest-cannot-mint-hole' | 'sub-threshold-hit' | 'hole-budget-exhausted';
  state: readonly ThinMetalPanelState[];
}>;

const AXES: readonly (keyof Pick<Point3, 'x' | 'y' | 'z'>)[] = ['x', 'y', 'z'];

function extentOf(bounds: Box2, axis: 'x' | 'y' | 'z'): number {
  if (axis === 'x') return Math.max(0, bounds.maxX - bounds.minX);
  if (axis === 'y') return Math.max(0, (bounds.maxY ?? 0) - (bounds.minY ?? 0));
  return Math.max(0, bounds.maxZ - bounds.minZ);
}

function originOf(bounds: Box2, axis: 'x' | 'y' | 'z'): number {
  if (axis === 'x') return (bounds.minX + bounds.maxX) / 2;
  if (axis === 'y') return ((bounds.minY ?? 0) + (bounds.maxY ?? 0)) / 2;
  return (bounds.minZ + bounds.maxZ) / 2;
}

function unitVector(axis: 'x' | 'y' | 'z'): Point3 {
  return axis === 'x' ? { x: 1, y: 0, z: 0 } : axis === 'y' ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
}

/**
 * Derive the panel placements from the arena's OWN built shot surfaces.
 *
 * Registry discipline: a spec that matches zero surfaces throws (an authoring
 * typo must fail loudly, not silently do nothing), and a surface claimed by
 * two specs throws. Panel ids derive from the authored name plus the ordinal
 * among that name's matches - `pair()` emits two handed halves per authored
 * body, and both are separate panels.
 */
export function thinMetalPanelPlacements(
  specs: readonly ThinMetalPanelSpec[],
  shotSurfaces: readonly BallisticSurface[],
): readonly ThinMetalPanelPlacement[] {
  const placements: ThinMetalPanelPlacement[] = [];
  const claimed = new Set<string>();
  for (const spec of specs) {
    if (!Number.isSafeInteger(spec.hitsToOpen) || spec.hitsToOpen < 1) {
      throw new TypeError(`Thin-metal panel '${spec.surfaceName}': hitsToOpen must be a positive integer`);
    }
    const matches = shotSurfaces
      .filter((surface) => surface.name === spec.surfaceName)
      .sort((left, right) => left.id.localeCompare(right.id));
    if (matches.length === 0) {
      throw new Error(`Thin-metal panel registry: no shot surface named '${spec.surfaceName}'`);
    }
    const holeRadiusM = spec.holeRadiusM ?? THIN_METAL_DEFAULT_HOLE_RADIUS_M;
    for (const [ordinal, surface] of matches.entries()) {
      if (claimed.has(surface.id)) {
        throw new Error(`Thin-metal panel registry: surface '${surface.id}' claimed twice`);
      }
      claimed.add(surface.id);
      if (surface.bounds.rotation) {
        throw new Error(`Thin-metal panel registry: '${surface.name}' is rotated; only axis-aligned panels are perforable`);
      }
      const extents = AXES.map((axis) => extentOf(surface.bounds, axis));
      // Panel plane = the two widest axes; the thinnest axis is the normal.
      // (Every nuketown2 thin-metal panel is a sheet whose thin axis is z.)
      const thinIndex = extents.indexOf(Math.min(...extents));
      const planeIndices = [0, 1, 2].filter((index) => index !== thinIndex);
      planeIndices.sort((left, right) => extents[right]! - extents[left]!);
      const uAxisName = AXES[planeIndices[0]!]!;
      const vAxisName = AXES[planeIndices[1]!]!;
      const normalName = AXES[thinIndex]!;
      const centre: Point3 = {
        x: originOf(surface.bounds, 'x'),
        y: originOf(surface.bounds, 'y'),
        z: originOf(surface.bounds, 'z'),
      };
      placements.push(Object.freeze({
        id: `${spec.surfaceName}#${ordinal}`,
        surfaceName: spec.surfaceName,
        surfaceId: surface.id,
        hitsToOpen: spec.hitsToOpen,
        holeRadiusM,
        centre,
        halfU: extents[planeIndices[0]!]! / 2,
        halfV: extents[planeIndices[1]!]! / 2,
        uAxis: unitVector(uAxisName),
        vAxis: unitVector(vAxisName),
        normal: unitVector(normalName),
        thicknessMmQ: Math.round(extents[thinIndex]! * 1_000),
      }));
    }
  }
  return Object.freeze(placements);
}

function dot(a: Point3, b: Point3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function envelopeHash(value: Omit<ThinMetalPerforationEnvelope, 'hashAlgorithm' | 'hash'>): string {
  return canonicalSha256(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join('|') === [...expected].sort().join('|');
}

function boundedInteger(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function canonicalId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

function isAperture(value: unknown): value is BallisticAperture {
  if (!isRecord(value)
    || !exactKeys(value, ['id', 'surfaceId', 'uQ', 'vQ', 'radiusUQ', 'radiusVQ'])
    || !boundedInteger(value.id, 0)
    || typeof value.surfaceId !== 'string' || value.surfaceId.length === 0 || value.surfaceId.length > 160
    || !boundedInteger(value.uQ, -SHED_PANEL_COORD_Q, SHED_PANEL_COORD_Q)
    || !boundedInteger(value.vQ, -SHED_PANEL_COORD_Q, SHED_PANEL_COORD_Q)
    || !boundedInteger(value.radiusUQ, 1, SHED_PANEL_COORD_Q)
    || !boundedInteger(value.radiusVQ, 1, SHED_PANEL_COORD_Q)) return false;
  return true;
}
function panelCoordinatesQ(
  placement: ThinMetalPanelPlacement,
  point: Point3,
): Readonly<{ uQ: number; vQ: number }> {
  const offset: Point3 = {
    x: point.x - placement.centre.x,
    y: point.y - placement.centre.y,
    z: point.z - placement.centre.z,
  };
  return Object.freeze({
    uQ: Math.round(dot(offset, placement.uAxis) / placement.halfU * SHED_PANEL_COORD_Q),
    vQ: Math.round(dot(offset, placement.vAxis) / placement.halfV * SHED_PANEL_COORD_Q),
  });
}

function isPanelState(value: unknown): value is ThinMetalPanelState {
  if (!isRecord(value)
    || !exactKeys(value, ['panelId', 'hits', 'holes'])
    || typeof value.panelId !== 'string' || value.panelId.length === 0 || value.panelId.length > 160
    || !boundedInteger(value.hits, 0, 1_000_000)
    || !Array.isArray(value.holes)
    || value.holes.length > THIN_METAL_MAX_HOLES_PER_PANEL
    || !value.holes.every(isAperture)) return false;
  return true;
}

export function isThinMetalPerforationEnvelope(value: unknown): value is ThinMetalPerforationEnvelope {
  if (!isRecord(value)) return false;
  const envelope = value as Partial<ThinMetalPerforationEnvelope> & Record<string, unknown>;
  if (!exactKeys(envelope, ['schemaVersion', 'arenaId', 'matchEpoch', 'revision', 'panels', 'hashAlgorithm', 'hash'])
    || envelope.schemaVersion !== THIN_METAL_PERFORATION_SCHEMA_VERSION
    || !isArenaId(envelope.arenaId)
    || !boundedInteger(envelope.matchEpoch, 1)
    || !boundedInteger(envelope.revision, 0)
    || envelope.hashAlgorithm !== 'sha256'
    || typeof envelope.hash !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.hash)
    || !Array.isArray(envelope.panels)
    || envelope.panels.length > 32
    || !envelope.panels.every(isPanelState)) return false;
  const states = envelope.panels as ThinMetalPanelState[];
  if (new Set(states.map((state) => state.panelId)).size !== states.length) return false;
  const totalHoles = states.reduce((sum, state) => sum + state.holes.length, 0);
  if (totalHoles > THIN_METAL_MAX_HOLES_PER_ARENA) return false;
  return envelopeHash({
    schemaVersion: THIN_METAL_PERFORATION_SCHEMA_VERSION,
    arenaId: envelope.arenaId as ShedArenaId,
    matchEpoch: Number(envelope.matchEpoch),
    revision: Number(envelope.revision),
    panels: Object.freeze([...states].sort((left, right) => left.panelId.localeCompare(right.panelId))),
  }) === envelope.hash;
}

function withinWireBudget(value: unknown): boolean {
  try {
    return new TextEncoder().encode(stableStringify(value)).byteLength <= MAX_THIN_METAL_PERFORATION_MESSAGE_BYTES;
  } catch {
    return false;
  }
}

export function isThinMetalPerforationStateMessage(value: unknown): value is ThinMetalPerforationStateMessage {
  if (!isRecord(value)
    || !exactKeys(value, ['type', 'schemaVersion', 'by', 'envelope', 'nonce'])
    || value.type !== 'thin-metal-perforation-state'
    || value.schemaVersion !== THIN_METAL_PERFORATION_SCHEMA_VERSION
    || !canonicalId(value.by)
    || !isThinMetalPerforationEnvelope(value.envelope)
    || !boundedInteger(value.nonce, 0, 0xffffffff)) return false;
  return withinWireBudget(value);
}

/**
 * Deterministic torn-edge stencil for the hole disc: opaque dark metal in the
 * middle, alpha-0 cutout at the rim with a seeded irregular edge. A
 * `DataTexture` (not a DOM canvas) so the same texture builds headless in
 * unit tests and identically on host and guest.
 */
function holeStencilTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  let seed = 0x9e3779b9;
  const next = (): number => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const radius = Math.hypot(dx, dy);
      const torn = 0.82 + next() * 0.12;
      const alpha = radius > torn ? 0 : radius > torn - 0.1 ? 140 : 255;
      // Near-black scorched interior: the hole reads as depth, and the
      // alpha-test stencil keeps the torn edge crisp under no blending.
      data[index] = 12;
      data[index + 1] = 11;
      data[index + 2] = 10;
      data[index + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

function frameQuaternion(placement: ThinMetalPanelPlacement): THREE.Quaternion {
  const u = new THREE.Vector3(placement.uAxis.x, placement.uAxis.y, placement.uAxis.z);
  const v = new THREE.Vector3(placement.vAxis.x, placement.vAxis.y, placement.vAxis.z);
  const normal = new THREE.Vector3().crossVectors(u, v).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, normal));
}

/**
 * Bounded hole presentation: one instanced rim ring and one instanced
 * alpha-cutout disc per hole, capped by the arena budget. Lives in its own
 * scene-level group (like the interactive world root) so it never perturbs
 * the arena builder's mesh/collider inventories.
 */
class ThinMetalHolePresentation {
  readonly root = new THREE.Group();
  private readonly rims: THREE.InstancedMesh;
  private readonly discs: THREE.InstancedMesh;
  private readonly stencil = holeStencilTexture();
  private disposed = false;

  constructor(arenaId: ShedArenaId) {
    this.root.name = `thin-metal-perforation:${arenaId}`;
    this.root.userData.interactiveWorldKind = 'thin-metal-perforation';
    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xc2b69e, metalness: 0.92, roughness: 0.22 });
    rimMaterial.name = 'thin-metal-hole-rim';
    this.rims = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.14, 6, 16), rimMaterial, THIN_METAL_MAX_HOLES_PER_ARENA);
    this.rims.name = 'thin-metal-hole-rims';
    this.rims.count = 0;
    const discMaterial = new THREE.MeshStandardMaterial({
      map: this.stencil,
      alphaTest: 0.5,
      metalness: 0.4,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    discMaterial.name = 'thin-metal-hole-cutout';
    this.discs = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), discMaterial, THIN_METAL_MAX_HOLES_PER_ARENA);
    this.discs.name = 'thin-metal-hole-discs';
    this.discs.count = 0;
    this.root.add(this.rims);
    this.root.add(this.discs);
  }

  sync(placements: readonly ThinMetalPanelPlacement[], states: readonly ThinMetalPanelState[]): void {
    if (this.disposed) return;
    const byId = new Map(placements.map((placement) => [placement.id, placement] as const));
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    let index = 0;
    for (const state of states) {
      const placement = byId.get(state.panelId);
      if (!placement) continue;
      for (const hole of state.holes) {
        if (index >= THIN_METAL_MAX_HOLES_PER_ARENA) break;
        const u = hole.uQ / SHED_PANEL_COORD_Q * placement.halfU;
        const v = hole.vQ / SHED_PANEL_COORD_Q * placement.halfV;
        const position = new THREE.Vector3(
          placement.centre.x + placement.uAxis.x * u + placement.vAxis.x * v + placement.normal.x * 0.012,
          placement.centre.y + placement.uAxis.y * u + placement.vAxis.y * v + placement.normal.y * 0.012,
          placement.centre.z + placement.uAxis.z * u + placement.vAxis.z * v + placement.normal.z * 0.012,
        );
        const rotation = frameQuaternion(placement);
        scale.set(hole.radiusUQ / SHED_PANEL_COORD_Q * placement.halfU, hole.radiusVQ / SHED_PANEL_COORD_Q * placement.halfV, 1);
        matrix.compose(position, rotation, scale);
        this.discs.setMatrixAt(index, matrix);
        const rimScale = scale.clone().multiplyScalar(1.18);
        rimScale.z = Math.min(placement.halfU, placement.halfV) * 0.06;
        matrix.compose(position, rotation, rimScale);
        this.rims.setMatrixAt(index, matrix);
        index += 1;
      }
    }
    this.rims.count = index;
    this.discs.count = index;
    this.discs.instanceMatrix.needsUpdate = true;
    this.rims.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stencil.dispose();
    this.rims.geometry.dispose();
    (this.rims.material as THREE.Material).dispose();
    this.discs.geometry.dispose();
    (this.discs.material as THREE.Material).dispose();
  }
}

type RuntimePanel = {
  placement: ThinMetalPanelPlacement;
  state: ThinMetalPanelState;
};

export class ThinMetalPerforationAuthority {
  readonly root: THREE.Group;
  private readonly panels = new Map<string, RuntimePanel>();
  private readonly panelsBySurfaceId = new Map<string, RuntimePanel>();
  private readonly presentation: ThinMetalHolePresentation;
  private matchEpoch: number;
  private hostAuthority: boolean;
  private revision = 0;
  private nextHoleId = 0;
  private disposed = false;

  constructor(
    readonly arenaId: ShedArenaId,
    matchEpoch: number,
    placements: readonly ThinMetalPanelPlacement[],
    hostAuthority: boolean,
  ) {
    if (new Set(placements.map((placement) => placement.id)).size !== placements.length) {
      throw new TypeError('Duplicate thin-metal panel placement id');
    }
    this.matchEpoch = matchEpoch;
    this.hostAuthority = hostAuthority;
    this.presentation = new ThinMetalHolePresentation(arenaId);
    this.root = this.presentation.root;
    for (const placement of placements) {
      const panel: RuntimePanel = {
        placement,
        state: Object.freeze({ panelId: placement.id, hits: 0, holes: Object.freeze([]) }),
      };
      this.panels.set(placement.id, panel);
      this.panelsBySurfaceId.set(placement.surfaceId, panel);
    }
  }

  setHostAuthority(hostAuthority: boolean): void {
    this.hostAuthority = hostAuthority;
  }

  hasHostAuthority(): boolean {
    return this.hostAuthority;
  }

  ownsSurface(surface: BallisticSurface): boolean {
    return this.panelsBySurfaceId.has(surface.id);
  }

  panelStates(): readonly ThinMetalPanelState[] {
    return [...this.panels.values()].map((panel) => panel.state);
  }

  /**
   * Host-only. One energy-qualifying, through-going hit on a registered panel
   * counts; at the authored hit count the panel mints a hole at that hit's
   * point - bounded per panel and per arena.
   */
  applyPanelImpact(request: Readonly<{
    surface: BallisticSurface;
    point: Point3;
    penetrationEnergyQ: number;
    /** True when the trace's round actually passed through the surface. */
    penetrated: boolean;
  }>): ThinMetalMutationResult | null {
    const panel = this.panelsBySurfaceId.get(request.surface.id);
    if (!panel) return null;
    if (!this.hostAuthority) {
      return Object.freeze({
        accepted: false,
        reason: 'guest-cannot-mint-hole',
        state: this.panelStates(),
      });
    }
    if (!request.penetrated
      || !Number.isFinite(request.penetrationEnergyQ)
      || request.penetrationEnergyQ < THIN_METAL_PERFORATION_MIN_ENERGY_Q) {
      return Object.freeze({ accepted: false, reason: 'sub-threshold-hit', state: this.panelStates() });
    }
    const globalHoles = this.panelStates().reduce((sum, state) => sum + state.holes.length, 0);
    const opensHole = panel.state.hits + 1 >= panel.placement.hitsToOpen
      && panel.state.holes.length < THIN_METAL_MAX_HOLES_PER_PANEL
      && globalHoles < THIN_METAL_MAX_HOLES_PER_ARENA;
    let holes = panel.state.holes;
    if (opensHole) {
      // Clamp into the panel exactly like the shed's closestPanelPoint, so a
      // grazing hit never mints a decal hanging off the sheet edge.
      const raw = panelCoordinatesQ(panel.placement, request.point);
      const coordinates = {
        uQ: Math.max(-SHED_PANEL_COORD_Q, Math.min(SHED_PANEL_COORD_Q, raw.uQ)),
        vQ: Math.max(-SHED_PANEL_COORD_Q, Math.min(SHED_PANEL_COORD_Q, raw.vQ)),
      };
      const aperture: BallisticAperture = Object.freeze({
        id: this.nextHoleId,
        surfaceId: panel.placement.surfaceId,
        uQ: coordinates.uQ,
        vQ: coordinates.vQ,
        radiusUQ: Math.max(1, Math.round(panel.placement.holeRadiusM / panel.placement.halfU * SHED_PANEL_COORD_Q)),
        radiusVQ: Math.max(1, Math.round(panel.placement.holeRadiusM / panel.placement.halfV * SHED_PANEL_COORD_Q)),
      });
      this.nextHoleId += 1;
      holes = Object.freeze([...panel.state.holes, aperture]);
    }
    panel.state = Object.freeze({
      panelId: panel.placement.id,
      hits: panel.state.hits + 1,
      holes,
    });
    this.revision += 1;
    if (opensHole) this.presentation.sync([...this.panels.values()].map((entry) => entry.placement), this.panelStates());
    return Object.freeze({ accepted: true, state: this.panelStates() });
  }

  /**
   * The panel's contribution to the world's canonical ballistic aperture
   * query. True means "this entry point is inside an open hole, the ray
   * passes". Same contract as the runtime's shed-only query.
   */
  readonly apertureQuery: BallisticApertureQuery = (surface, point) => {
    const panel = this.panelsBySurfaceId.get(surface.id);
    if (!panel || panel.state.holes.length === 0) return false;
    // Cheap plane rejection first: the trace hands us the surface's own entry
    // point, so anything far off the panel plane is not a hole crossing.
    const planeOffset = Math.abs(dot(point, panel.placement.normal) - dot(panel.placement.centre, panel.placement.normal));
    if (planeOffset > panel.placement.thicknessMmQ / 1_000 + 0.05) return false;
    const coordinates = panelCoordinatesQ(panel.placement, point);
    return panel.state.holes.some((aperture) => apertureContainsPanelPoint(aperture, coordinates.uQ, coordinates.vQ));
  };

  stateEnvelope(): ThinMetalPerforationEnvelope {
    const panels = Object.freeze(this.panelStates()
      .slice()
      .sort((left, right) => left.panelId.localeCompare(right.panelId)));
    const body = Object.freeze({
      schemaVersion: THIN_METAL_PERFORATION_SCHEMA_VERSION,
      arenaId: this.arenaId,
      matchEpoch: this.matchEpoch,
      revision: this.revision,
      panels,
    });
    return Object.freeze({
      ...body,
      hashAlgorithm: 'sha256' as const,
      hash: envelopeHash(body),
    });
  }

  /** Guest ingress. Accepts only a well-shaped, hash-valid, same-match envelope. */
  applyAuthoritativeEnvelope(value: unknown): boolean {
    if (this.disposed || !isThinMetalPerforationEnvelope(value)) return false;
    if (value.arenaId !== this.arenaId || value.matchEpoch !== this.matchEpoch) return false;
    const known = new Set(this.panels.keys());
    if (!value.panels.every((state) => known.has(state.panelId))) return false;
    this.revision = value.revision;
    for (const state of value.panels) {
      const panel = this.panels.get(state.panelId)!;
      panel.state = Object.freeze({
        panelId: state.panelId,
        hits: state.hits,
        holes: Object.freeze([...state.holes]),
      });
    }
    this.presentation.sync([...this.panels.values()].map((entry) => entry.placement), this.panelStates());
    return true;
  }

  reset(nextMatchEpoch: number): void {
    if (!Number.isSafeInteger(nextMatchEpoch) || nextMatchEpoch <= this.matchEpoch) {
      throw new TypeError('Thin-metal perforation epoch must advance');
    }
    this.matchEpoch = nextMatchEpoch;
    this.revision = 0;
    this.nextHoleId = 0;
    for (const panel of this.panels.values()) {
      panel.state = Object.freeze({ panelId: panel.placement.id, hits: 0, holes: Object.freeze([]) });
    }
    this.presentation.sync([...this.panels.values()].map((entry) => entry.placement), this.panelStates());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.presentation.dispose();
  }
}
