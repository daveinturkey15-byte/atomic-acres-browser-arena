/**
 * Source 34 - Subsystem-contract architecture (Claude-of-Duty).
 *
 * Primary source, re-read at the pinned revision on 2026-09-12 (cached outside the
 * repository, sha256 in SOURCE_RESEARCH.json):
 *   https://github.com/mshumer/Claude-of-Duty @ d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853
 *   README.md (7,135 B, all 130 lines read) and src/weapons/ballistics.js (4,968 B, all 166
 *   lines read). MIT LICENSE position re-confirmed by the prior lane.
 *
 * THE METHOD, restated from the README and the ballistics source: ~55k lines of procedural
 * FPS split across 11 SINGLE-OWNER subsystem directories that never reach into each other;
 * ProjectileSim emits the typed 'bullet:tracer' event with one payload, and asks for the
 * physics subsystem lazily via ctx.peek('physics') rather than importing it (ballistics.js
 * lines 39-53, 94-107) - and (b) ARCHITECTURE.md as the written contract of subsystem
 * interfaces, directory ownership, event vocabulary and shared surface types. The README's
 * own process finding is retained: sequential single-owner passes beat parallel fan-out on
 * coupled concerns, and visual comparison against a reference was the QA loop.
 *
 * THE SCENE shows the contract's observable consequence: the same scripted shot driven over
 * a CONTRACTED bus (typed events, one producer, exactly its declared consumers - pulses
 * travel only declared edges) versus an UNCONTRACTED broadcast (every subsystem hears every
 * event - pulses fan out to all boxes). Per-subsystem delivery counters make the waste
 * measurable, and each tracer pulse shrinks by the source's quadratic damage falloff
 * 1 - (1 - dropoff) * range01^2 (ballistics.js lines 131-132) so the borrowed vocabulary is
 * visible, not decorated.
 *
 * This is a scale model of an architecture, not the game: stated plainly in the limitation.
 */

import { disposeGroup, type Demo, type DemoContext } from './types';
import type { Mesh, MeshStandardMaterial } from 'three';


const DROP_OFF = 0.5;
const SHOT_INTERVAL_S = 1.0;
const PULSE_SPEED = 2.2;

const SUBSYSTEMS = ['weapons', 'physics', 'fx', 'audio', 'ui', 'ai'] as const;
type Subsystem = (typeof SUBSYSTEMS)[number];

const POSITIONS: Record<Subsystem, [number, number, number]> = {
  weapons: [-1.8, 0.75, 0],
  physics: [-0.6, -0.6, 0],
  fx: [0.6, 0.75, 0],
  audio: [1.8, -0.6, 0],
  ui: [0.6, -0.6, 0],
  ai: [1.8, 0.75, 0],
};

const BOX_COLORS: Record<Subsystem, number> = {
  weapons: 0xc46a3a,
  physics: 0x3a6ac4,
  fx: 0x9a3ac4,
  audio: 0xc4a23a,
  ui: 0x3ac48a,
  ai: 0xc43a6a,
};

/** Typed event vocabulary: one producer, declared consumers - the ARCHITECTURE.md idea. */
const EVENT_VOCABULARY: { name: string; producer: Subsystem; consumers: Subsystem[] }[] = [
  { name: 'bullet:tracer', producer: 'weapons', consumers: ['fx', 'ui'] },
  { name: 'bullet:impact', producer: 'physics', consumers: ['audio', 'fx', 'ai'] },
  { name: 'weapon:fired', producer: 'weapons', consumers: ['audio', 'ui'] },
];

interface Pulse {
  mesh: Mesh;
  from: Subsystem;
  to: Subsystem;
  range01: number;
  active: boolean;
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const root = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  const stats = {
    eventsEmitted: 0,
    contractedDeliveries: 0,
    broadcastDeliveries: 0,
    contractedByBox: Object.fromEntries(SUBSYSTEMS.map((s) => [s, 0])) as Record<Subsystem, number>,
    broadcastByBox: Object.fromEntries(SUBSYSTEMS.map((s) => [s, 0])) as Record<Subsystem, number>,
    lastFalloff: 0,
  };

  const boxGeometry = new THREE.BoxGeometry(0.52, 0.34, 0.3);
  disposables.push(boxGeometry);
  const boxMaterials = {} as Record<Subsystem, MeshStandardMaterial>;
  for (const name of SUBSYSTEMS) {
    const material = new THREE.MeshStandardMaterial({
      color: BOX_COLORS[name],
      metalness: 0.1,
      roughness: 0.6,
      transparent: true,
      opacity: 0.92,
    });
    boxMaterials[name] = material;
    disposables.push(material);
    const mesh = new THREE.Mesh(boxGeometry, material);
    mesh.position.set(...POSITIONS[name]);
    root.add(mesh);
  }

  // Contracted edges: one line per declared producer->consumer pair.
  const edgePositions: number[] = [];
  const edgeColors: number[] = [];
  for (const event of EVENT_VOCABULARY) {
    for (const consumer of event.consumers) {
      const a = POSITIONS[event.producer];
      const b = POSITIONS[consumer];
      edgePositions.push(...a, ...b);
      const c = new THREE.Color(BOX_COLORS[event.producer]);
      edgeColors.push(c.r, c.g, c.b, c.r * 0.5, c.g * 0.5, c.b * 0.5);
    }
  }
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
  edgeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(edgeColors, 3));
  const edgeMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 });
  root.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
  disposables.push(edgeGeometry, edgeMaterial);

  // Pulse pool. Contracted pulses ride declared edges; broadcast pulses fly to EVERY box.
  const pulseGeometry = new THREE.SphereGeometry(0.045, 8, 6);
  disposables.push(pulseGeometry);
  const pulses: Pulse[] = [];
  for (let i = 0; i < 40; i += 1) {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    const mesh = new THREE.Mesh(pulseGeometry, material);
    mesh.visible = false;
    root.add(mesh);
    disposables.push(material);
    pulses.push({ mesh, from: 'weapons', to: 'fx', range01: 0, active: false });
  }

  const spawnPulse = (from: Subsystem, to: Subsystem, range01: number): void => {
    const pulse = pulses.find((p) => !p.active);
    if (!pulse) return;
    pulse.from = from;
    pulse.to = to;
    pulse.range01 = range01;
    pulse.active = true;
    pulse.mesh.visible = true;
    pulse.mesh.position.set(...POSITIONS[from]);
  };

  /** One scripted shot: the event chain, contracted and (wastefully) broadcast. */
  const fireShot = (): void => {
    stats.eventsEmitted += 1;
    // Falloff along flight - restated from ballistics.js lines 131-132.
    const range01 = Math.min(1, 0.35 + 0.5 * Math.abs(Math.sin(stats.eventsEmitted * 1.7)));
    const falloff = 1 - (1 - DROP_OFF) * range01 * range01;
    stats.lastFalloff = falloff;
    for (const event of EVENT_VOCABULARY) {
      for (const consumer of event.consumers) {
        stats.contractedDeliveries += 1;
        stats.contractedByBox[consumer] += 1;
        spawnPulse(event.producer, consumer, range01);
      }
      // Uncontracted broadcast: everyone hears everything.
      for (const anyBox of SUBSYSTEMS) {
        if (anyBox === event.producer) continue;
        stats.broadcastDeliveries += 1;
        stats.broadcastByBox[anyBox] += 1;
        spawnPulse(event.producer, anyBox, range01);
      }
    }
  };

  const update = (time: number, dt: number): void => {
    if (Math.floor(time / SHOT_INTERVAL_S) !== Math.floor((time - dt) / SHOT_INTERVAL_S)) {
      fireShot();
    }
    for (const pulse of pulses) {
      if (!pulse.active) continue;
      const a = new THREE.Vector3(...POSITIONS[pulse.from]);
      const b = new THREE.Vector3(...POSITIONS[pulse.to]);
      const total = a.distanceTo(b);
      pulse.mesh.position.lerpVectors(a, b, Math.min(1, pulse.mesh.position.distanceTo(a) / total + (PULSE_SPEED * dt) / total));
      const falloff = 1 - (1 - DROP_OFF) * pulse.range01 * pulse.range01;
      const scale = 0.55 + 0.45 * falloff;
      pulse.mesh.scale.setScalar(scale);
      if (pulse.mesh.position.distanceTo(b) < 0.03) {
        pulse.active = false;
        pulse.mesh.visible = false;
        const material = boxMaterials[pulse.to];
        material.emissive.setHex(BOX_COLORS[pulse.to]);
      }
    }
    for (const name of SUBSYSTEMS) {
      boxMaterials[name].emissive.multiplyScalar(Math.max(0, 1 - dt * 3));
    }
  };

  const dispose = (): void => {
    for (const entry of disposables) entry.dispose();
    disposables.length = 0;
    disposeGroup(root);
  };

  root.userData.stats = stats;
  root.userData.EVENT_VOCABULARY = EVENT_VOCABULARY;

  return {
    root,
    update,
    dispose,
    metadata: {
      sourceId: 34,
      title: 'Claude-of-Duty - full-procedural FPS from a subsystem-contract prompt',
      method:
        'Single-owner subsystems communicating only through a typed cross-subsystem event '
        + 'vocabulary with declared producers and consumers, visualized against uncontracted '
        + 'broadcast delivery, with the source quadratic damage falloff riding each pulse.',
      adaptation: 'adapted',
      sources: [
        'https://github.com/mshumer/Claude-of-Duty',
        'https://x.com/mattshumer_/status/2081054356405731740',
      ],
      limitation:
        'MIT README and ballistics.js read at d9b237b; this is an architecture scale model, not '
        + 'the game: no rendering pipeline, physics, weapons, AI behaviour or the 55k-line '
        + 'procedural content. Six named boxes stand in for eleven subsystems; the event set is '
        + 'a three-event illustration, not the full vocabulary.',
    },
  };
}

export default createDemo;
