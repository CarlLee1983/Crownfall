import type { GridPoint } from '../core';

/**
 * Samples adjacent grid cell centers by normalized simulation steps, clamped to [0, 1].
 * A singleton stays at its center. A reversal passes through the center along the same edge.
 */
export function sampleRoute(points: readonly GridPoint[], progress: number): GridPoint {
  if (points.length === 0) throw new RangeError('Cannot sample an empty route');

  const step = Math.max(0, Math.min(1, progress)) * (points.length - 1);
  const index = Math.round(step);
  const cell = points[index];
  if (!cell) throw new RangeError('Route progress must be a number');

  const offset = step - index;
  const from = points[index - 1];
  const to = points[index + 1];
  if (from && to && Math.abs(offset) < 0.5) {
    const incomingX = cell.x - from.x;
    const incomingY = cell.y - from.y;
    const outgoingX = to.x - cell.x;
    const outgoingY = to.y - cell.y;
    if (Math.abs(incomingX * outgoingY - incomingY * outgoingX) === 1) {
      // Rotate the radius from the entry midpoint to the exit midpoint.
      const angle = (offset + 0.5) * (Math.PI / 2);
      const incomingOffset = (Math.sin(angle) - 1) * 0.5;
      const outgoingOffset = (1 - Math.cos(angle)) * 0.5;
      return {
        x: cell.x + incomingX * incomingOffset + outgoingX * outgoingOffset,
        y: cell.y + incomingY * incomingOffset + outgoingY * outgoingOffset,
      };
    }
  }

  const neighbor = (offset < 0 ? from : to) ?? cell;
  const distance = Math.abs(offset);
  return {
    x: cell.x + (neighbor.x - cell.x) * distance,
    y: cell.y + (neighbor.y - cell.y) * distance,
  };
}
