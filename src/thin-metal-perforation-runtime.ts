import * as THREE from 'three';
import type { BallisticApertureQuery, BallisticSurface } from './ballistics';
import type { GameMessage } from './protocol';
import type { Point3 } from './collision';
import type { InteractiveWorldRuntime } from './interactive-world-runtime';
import {
  THIN_METAL_PERFORATION_SCHEMA_VERSION,
  ThinMetalPerforationAuthority,
  type ThinMetalMutationResult,
  type ThinMetalPanelPlacement,
  type ThinMetalPerforationStateMessage,
} from './thin-metal-perforation';
import type { ShedArenaId } from './destructible-world';

type ThinMetalArena = Readonly<{
  id: ShedArenaId;
  thinMetalPanels?: readonly ThinMetalPanelPlacement[];
}>;

export type ThinMetalPerforationRuntime = {
  readonly authority: ThinMetalPerforationAuthority;
  lastBroadcastRevision: number;
};

export function createThinMetalPerforationRuntime(
  activeArena: ThinMetalArena,
  matchEpoch: number,
  hostAuthority: boolean,
): ThinMetalPerforationRuntime | null {
  if (!activeArena.thinMetalPanels || activeArena.thinMetalPanels.length === 0) return null;
  return {
    authority: new ThinMetalPerforationAuthority(
      activeArena.id,
      matchEpoch,
      activeArena.thinMetalPanels,
      hostAuthority,
    ),
    lastBroadcastRevision: -1,
  };
}

export function attachThinMetalPerforationRuntime(
  runtime: ThinMetalPerforationRuntime | null,
  scene: THREE.Scene,
): void {
  if (runtime) scene.add(runtime.authority.root);
}

export function createAndAttachThinMetalPerforationRuntime(
  activeArena: ThinMetalArena,
  matchEpoch: number,
  hostAuthority: boolean,
  scene: THREE.Scene,
): ThinMetalPerforationRuntime | null {
  const runtime = createThinMetalPerforationRuntime(activeArena, matchEpoch, hostAuthority);
  attachThinMetalPerforationRuntime(runtime, scene);
  return runtime;
}

export function commitThinMetalPerforationRuntime(
  previous: ThinMetalPerforationRuntime | null,
  next: ThinMetalPerforationRuntime | null,
): ThinMetalPerforationRuntime | null {
  if (next) next.lastBroadcastRevision = -1;
  previous?.authority.root.removeFromParent();
  return next;
}

export function rollbackThinMetalPerforationRuntime(
  previous: ThinMetalPerforationRuntime | null,
  next: ThinMetalPerforationRuntime | null,
  scene: THREE.Scene,
): ThinMetalPerforationRuntime | null {
  if (previous) {
    scene.add(previous.authority.root);
    previous.authority.root.visible = true;
  }
  if (next) {
    next.authority.root.removeFromParent();
    next.authority.dispose();
  }
  return previous;
}

export function disposeThinMetalPerforationRuntime(runtime: ThinMetalPerforationRuntime | null): void {
  runtime?.authority.dispose();
}

export function buildWorldApertureQuery(
  interactiveWorldQuery: () => BallisticApertureQuery | undefined,
  thinMetalRuntime: () => ThinMetalPerforationRuntime | null,
): BallisticApertureQuery {
  return (surface, point) => (interactiveWorldQuery()?.(surface, point) ?? false)
    || (thinMetalRuntime()?.authority.apertureQuery(surface, point) ?? false);
}

export function ownsThinMetalPanel(
  runtime: ThinMetalPerforationRuntime | null,
  surface: BallisticSurface,
): boolean {
  return runtime?.authority.ownsSurface(surface) ?? false;
}

export function routeThinMetalBallisticImpact(
  runtime: ThinMetalPerforationRuntime | null,
  impact: Readonly<{ surface: BallisticSurface; penetrated: boolean }>,
  point: Point3,
  penetrationEnergyQ: number,
): ThinMetalMutationResult | null {
  if (!runtime || !runtime.authority.ownsSurface(impact.surface)) return null;
  return runtime.authority.applyPanelImpact({
    surface: impact.surface,
    point,
    penetrationEnergyQ,
    penetrated: impact.penetrated,
  });
}

export function routeInteractiveWorldBallisticImpact(
  runtime: ThinMetalPerforationRuntime | null,
  interactiveWorldRuntime: InteractiveWorldRuntime,
  impact: Readonly<{ surface: BallisticSurface; penetrated: boolean }>,
  point: Point3,
  damageQ: number,
  penetrationEnergyQ: number,
  apertureRadiusQ: number,
  impulseQ: Readonly<{ xQ: number; yQ: number; zQ: number }>,
  tick: number,
): Readonly<{ accepted: boolean }> | null {
  return routeThinMetalBallisticImpact(runtime, impact, point, penetrationEnergyQ)
    ?? (impact.surface.houseFragment || impact.surface.houseMajorDebris
      ? interactiveWorldRuntime.applyHouseBulletImpact({
        surface: impact.surface,
        damageQ,
        penetrationEnergyQ,
        impulseQ,
      })
      : interactiveWorldRuntime.applyBulletImpact({
        surface: impact.surface,
        point,
        tick,
        damageQ,
        penetrationEnergyQ,
        radiusUQ: apertureRadiusQ,
        radiusVQ: apertureRadiusQ,
        impulseQ,
      }));
}

type ThinMetalNetwork = Readonly<{
  role: string;
  send(message: ThinMetalPerforationStateMessage): void;
  sendStateCommitReliably(message: ThinMetalPerforationStateMessage): void;
}>;

export function broadcastThinMetalPerforationState(
  runtime: ThinMetalPerforationRuntime | null,
  forceReliable: boolean,
  gameStarted: boolean,
  playerId: string,
  network: ThinMetalNetwork,
  randomNonce: () => number,
): void {
  if (network.role !== 'host' || !runtime || !gameStarted) return;
  const envelope = runtime.authority.stateEnvelope();
  if (!forceReliable && envelope.revision === runtime.lastBroadcastRevision) return;
  const message: ThinMetalPerforationStateMessage = {
    type: 'thin-metal-perforation-state',
    schemaVersion: THIN_METAL_PERFORATION_SCHEMA_VERSION,
    by: playerId,
    envelope,
    nonce: randomNonce(),
  };
  network.send(message);
  if (forceReliable) network.sendStateCommitReliably(message);
  runtime.lastBroadcastRevision = envelope.revision;
}

export function handleThinMetalPerforationMessage(
  message: GameMessage,
  runtime: ThinMetalPerforationRuntime | null,
  networkRole: string,
  hostId: string | undefined,
  arenaId: ShedArenaId,
  matchEpoch: number,
): boolean {
  if (message.type !== 'thin-metal-perforation-state') return false;
  if (networkRole !== 'client'
    || message.by !== hostId
    || !runtime
    || message.envelope.arenaId !== arenaId
    || message.envelope.matchEpoch !== matchEpoch) return true;
  runtime.authority.applyAuthoritativeEnvelope(message.envelope);
  return true;
}

export function resetThinMetalPerforationRuntime(
  runtime: ThinMetalPerforationRuntime | null,
  matchEpoch: number,
  priorEpoch: number,
  hostAuthority: boolean,
): void {
  if (!runtime) return;
  if (matchEpoch > priorEpoch) runtime.authority.reset(matchEpoch);
  runtime.authority.setHostAuthority(hostAuthority);
}
