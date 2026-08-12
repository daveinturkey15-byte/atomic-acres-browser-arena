import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  PASS70_DRONE_SWARM_BODY_MARK_CONTRACT,
  PASS70_DRONE_SWARM_LOGO_CONTRACT,
  attachPass70DroneSwarmBodyMarks,
  drawPass70DroneSwarmLogo,
} from './pass70-drone-swarm-logo';

describe('Pass 70 Drone Swarm project logo', () => {
  it('pins the owner-provided black field, hollow ring and open-chevron geometry', () => {
    expect(PASS70_DRONE_SWARM_LOGO_CONTRACT).toEqual({
      id: 'black-field-white-hollow-ring-open-chevron-v1',
      canvasSize: 512,
      background: '#000000',
      foreground: '#ffffff',
      ring: { centerX: 256, centerY: 236, radius: 50, lineWidth: 18 },
      chevron: [[194, 309], [204, 292], [256, 314], [308, 292], [318, 309], [256, 335]],
    });
  });

  it('draws only one white ring and one filled chevron over a black field', () => {
    const context = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    drawPass70DroneSwarmLogo(context);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 512, 512);
    expect(context.arc).toHaveBeenCalledWith(256, 236, 50, 0, Math.PI * 2);
    expect(context.stroke).toHaveBeenCalledTimes(1);
    expect(context.moveTo).toHaveBeenCalledWith(194, 309);
    expect(context.lineTo).toHaveBeenCalledTimes(5);
    expect(context.closePath).toHaveBeenCalledTimes(1);
    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(context.strokeStyle).toBe('#ffffff');
    expect(context.fillStyle).toBe('#ffffff');
  });

  it('binds matching top and underside marks to the canonical drone body', () => {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 1.2), new THREE.MeshBasicMaterial());
    body.name = 'drone-body';
    body.position.y = 0.08;
    root.add(body);
    const marks = attachPass70DroneSwarmBodyMarks(root);
    expect(marks.map((mark) => mark.name)).toEqual([
      'pass70-drone-swarm-body-logo-top',
      'pass70-drone-swarm-body-logo-bottom',
    ]);
    expect(marks[0]!.position.y).toBeCloseTo(0.24 + PASS70_DRONE_SWARM_BODY_MARK_CONTRACT.surfaceGapM, 8);
    expect(marks[1]!.position.y).toBeCloseTo(-0.08 - PASS70_DRONE_SWARM_BODY_MARK_CONTRACT.surfaceGapM, 8);
    for (const mark of marks) {
      expect(mark.children.map((child) => child.name)).toEqual([
        `${mark.name}-black-field`,
        `${mark.name}-hollow-ring`,
        `${mark.name}-open-chevron`,
      ]);
      expect(mark.children.every((child) => child.userData.pass70DroneSwarmBodyLogo === true)).toBe(true);
      expect(mark.children.every((child) => (child as THREE.Mesh).raycast(new THREE.Raycaster(), [] as never[]) === undefined)).toBe(true);
    }
    expect(root.userData.pass70DroneSwarmBodyLogo).toBe(PASS70_DRONE_SWARM_BODY_MARK_CONTRACT.id);
    expect(attachPass70DroneSwarmBodyMarks(root)).toHaveLength(2);
    expect(() => attachPass70DroneSwarmBodyMarks(new THREE.Group())).toThrow(/drone-body/);
  });

  it('uses authored armour skin rather than a tall antenna when placing the top mark', () => {
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.name = 'drone-body';
    const topArmor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.7), new THREE.MeshBasicMaterial());
    topArmor.name = 'Drone_TopArmor_LOD0';
    topArmor.position.y = 0.18;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 1.1), new THREE.MeshBasicMaterial());
    hull.name = 'Drone_Hull_LOD0';
    const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.8, 0.02), new THREE.MeshBasicMaterial());
    antenna.name = 'Drone_Antenna_LOD0';
    antenna.position.y = 0.6;
    body.add(topArmor, hull, antenna);
    root.add(body);
    const [top, bottom] = attachPass70DroneSwarmBodyMarks(root);
    expect(top!.position.y).toBeCloseTo(0.24 + PASS70_DRONE_SWARM_BODY_MARK_CONTRACT.surfaceGapM, 8);
    expect(top!.position.y).toBeLessThan(antenna.position.y);
    expect(bottom!.position.y).toBeCloseTo(-0.15 - PASS70_DRONE_SWARM_BODY_MARK_CONTRACT.surfaceGapM, 7);
  });
});
