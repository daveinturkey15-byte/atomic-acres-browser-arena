export const PASS70_DRONE_SWARM_LOGO_CONTRACT = Object.freeze({
  id: 'black-field-white-hollow-ring-open-chevron-v1',
  canvasSize: 512,
  background: '#000000',
  foreground: '#ffffff',
  ring: Object.freeze({ centerX: 256, centerY: 236, radius: 50, lineWidth: 18 }),
  chevron: Object.freeze([
    Object.freeze([194, 309] as const),
    Object.freeze([204, 292] as const),
    Object.freeze([256, 314] as const),
    Object.freeze([308, 292] as const),
    Object.freeze([318, 309] as const),
    Object.freeze([256, 335] as const),
  ]),
});

/** Draws the owner-provided hollow-ring/open-chevron mark without extra eye or flame styling. */
export function drawPass70DroneSwarmLogo(context: CanvasRenderingContext2D): void {
  const contract = PASS70_DRONE_SWARM_LOGO_CONTRACT;
  context.fillStyle = contract.background;
  context.fillRect(0, 0, contract.canvasSize, contract.canvasSize);

  context.strokeStyle = contract.foreground;
  context.lineWidth = contract.ring.lineWidth;
  context.beginPath();
  context.arc(contract.ring.centerX, contract.ring.centerY, contract.ring.radius, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = contract.foreground;
  context.beginPath();
  const [first, ...rest] = contract.chevron;
  context.moveTo(first![0], first![1]);
  for (const point of rest) context.lineTo(point[0], point[1]);
  context.closePath();
  context.fill();
}
