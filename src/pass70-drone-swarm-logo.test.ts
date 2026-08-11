import { describe, expect, it, vi } from 'vitest';
import {
  PASS70_DRONE_SWARM_LOGO_CONTRACT,
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
});
