/**
 * farcrysis-hitl.ts — dev-only HITL overlay for the F4RCry515 arena.
 *
 * Mounted ONLY when the page URL carries ?hitl=1 (the caller in legacy-main.ts
 * gates it). Renders spawn markers, opposing-spawn sightlines, cover
 * wireframes, kill-volume checks and a status line. All setup is guarded so
 * this never throws for the real game path.
 */
import * as THREE from 'three';
import type { ArenaMap } from './map';
import type { Box2 } from './collision';
import { FARCRYSIS_MAX_SIGHTLINE, farcrysisHITL } from './farcrysis';

/** Controller returned to the caller; call dispose() to tear the overlay down. */
export interface FarcrysisHitlOverlay {
  dispose(): void;
}

const COVER_HEIGHT = 1.2;
const TEAM_COLORS: Record<0 | 1, number> = {
  0: 0x00ffff, // cyan
  1: 0xff00ff, // magenta
};

function pointInBounds(x: number, z: number, b: Box2): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

function makeTeamLabel(team: 0 | 1, color: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(team), 32, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
  );
  sprite.scale.set(0.9, 0.9, 1);
  return sprite;
}

export function mountFarcrysisHitlOverlay(arena: ArenaMap): FarcrysisHitlOverlay {
  const added: THREE.Object3D[] = [];
  const killVolumeViolations: string[] = [];
  let statusEl: HTMLDivElement | null = null;

  const ensureStatus = (): HTMLDivElement => {
    if (statusEl) return statusEl;
    statusEl = document.createElement('div');
    statusEl.id = 'farcrysis-hitl-status';
    const s = statusEl.style;
    s.position = 'fixed';
    s.top = '8px';
    s.right = '8px';
    s.zIndex = '9999';
    s.fontFamily = 'monospace';
    s.fontSize = '11px';
    s.lineHeight = '1.5';
    s.color = '#e8e8e8';
    s.background = 'rgba(8, 8, 14, 0.85)';
    s.border = '1px solid #555';
    s.padding = '6px 10px';
    s.borderRadius = '4px';
    s.pointerEvents = 'none';
    s.whiteSpace = 'pre';
    document.getElementById('farcrysis-hitl-status')?.remove();
    document.body.appendChild(statusEl);
    return statusEl;
  };

  try {
    // 1. Spawn markers (cyan team 0 / magenta team 1) + team-index labels.
    const teamPoints: Array<{ team: 0 | 1; points: THREE.Vector3[] }> = [
      { team: 0, points: arena.spawns[0] ?? [] },
      { team: 1, points: arena.spawns[1] ?? [] },
    ];
    for (const { team, points } of teamPoints) {
      const color = TEAM_COLORS[team];
      points.forEach((p, _i) => {
        const marker = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.4, 0.4),
          new THREE.MeshBasicMaterial({ color })
        );
        marker.position.set(p.x, p.y + 0.2, p.z);
        arena.root.add(marker);
        added.push(marker);

        const label = makeTeamLabel(team, color);
        label.position.set(p.x, p.y + 1.15, p.z);
        arena.root.add(label);
        added.push(label);
      });
    }

    // 2. Sightlines: team0[i] vs team1[i]. Red when within max sightline,
    //    green when the pair is safely beyond it.
    const s0 = arena.spawns[0] ?? [];
    const s1 = arena.spawns[1] ?? [];
    const pairCount = Math.min(s0.length, s1.length);
    for (let i = 0; i < pairCount; i++) {
      const a = s0[i];
      const b = s1[i];
      if (!a || !b) continue;
      const dist = a.distanceTo(b);
      const within = dist <= FARCRYSIS_MAX_SIGHTLINE;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([a, b]),
        new THREE.LineBasicMaterial({
          color: within ? 0xff3344 : 0x33ff66,
          transparent: true,
          opacity: within ? 0.45 : 0.3,
        })
      );
      arena.root.add(line);
      added.push(line);
    }

    // 3. Cover wireframes (yellow) over each physical cover block.
    for (const cover of arena.physicalCover) {
      const b = cover.bounds;
      const w = Math.max(b.maxX - b.minX, 0.01);
      const d = Math.max(b.maxZ - b.minZ, 0.01);
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(w, COVER_HEIGHT, d)),
        new THREE.LineBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.85 })
      );
      frame.position.set(cx, COVER_HEIGHT / 2, cz);
      arena.root.add(frame);
      added.push(frame);
    }

    // 4. Kill-volume check: a spawn inside any cover bounds is a violation.
    for (const { team, points } of teamPoints) {
      points.forEach((p, i) => {
        for (const cover of arena.physicalCover) {
          if (pointInBounds(p.x, p.z, cover.bounds)) {
            killVolumeViolations.push(
              `KILL-VOL: team ${team} spawn#${i} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) inside cover "${cover.id}"`
            );
            break;
          }
        }
      });
    }

    // 5. Status line.
    const hitl = farcrysisHITL(arena);
    const lines = [
      '[F4RCry515 HITL]',
      `spawns: ${hitl.spawnCount}   covers: ${hitl.coverCount}`,
      `maxSight: ${hitl.maxSightline}m   flow: ${String(hitl.matchFlow)}`,
      `killVol violations: ${killVolumeViolations.length}   farcrysis violations: ${hitl.violations.length}`,
      ...killVolumeViolations.map((v) => `  ! ${v}`),
    ];
    ensureStatus().textContent = lines.join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[farcrysis-hitl] setup error:', err);
    ensureStatus().textContent = `[F4RCry515 HITL] ERROR: ${msg}`;
  }

  return {
    dispose(): void {
      for (const obj of added) {
        arena.root.remove(obj);
        const disposable = obj as unknown as {
          geometry?: THREE.BufferGeometry | null;
          material?: THREE.Material | THREE.Material[] | null;
        };
        disposable.geometry?.dispose();
        if (Array.isArray(disposable.material)) {
          for (const m of disposable.material) m.dispose();
        } else {
          disposable.material?.dispose();
        }
      }
      added.length = 0;
      statusEl?.remove();
      statusEl = null;
    },
  };
}
