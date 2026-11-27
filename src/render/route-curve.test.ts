import { describe, expect, it } from 'vitest';
import { sampleRoute } from './route-curve';

describe('sampleRoute', () => {
  it('follows cell-center lines at equal step progress and reaches both exact endpoints', () => {
    const straight = [
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ];

    expect(sampleRoute(straight, 0)).toEqual({ x: 2, y: 3 });
    expect(sampleRoute(straight, 0.125)).toEqual({ x: 2.25, y: 3 });
    expect(sampleRoute(straight, 0.5)).toEqual({ x: 3, y: 3 });
    expect(sampleRoute(straight, 0.875)).toEqual({ x: 3.75, y: 3 });
    expect(sampleRoute(straight, 1)).toEqual({ x: 4, y: 3 });
  });

  it('joins adjacent edge midpoints with a tangent arc through the corner cell', () => {
    const corner = [
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 4 },
    ];

    expect(sampleRoute(corner, 0.25)).toEqual({ x: 2.5, y: 3 });
    expect(sampleRoute(corner, 0.75)).toEqual({ x: 3, y: 3.5 });
    expect(sampleRoute(corner, 0.5)).toEqual({
      x: expect.closeTo(2.853553, 6),
      y: expect.closeTo(3.146447, 6),
    });
    expect(sampleRoute(corner, 0.2505)).toEqual({
      x: expect.closeTo(2.500785, 6),
      y: expect.closeTo(3, 5),
    });
    expect(sampleRoute(corner, 0.7495)).toEqual({
      x: expect.closeTo(3, 5),
      y: expect.closeTo(3.499215, 6),
    });

    for (let sample = 0; sample <= 100; sample++) {
      const step = sample / 100;
      const point = sampleRoute(corner, 0.25 + step / 2);
      const coreX = Math.min(3, 2.5 + step);
      const coreY = Math.max(3, 2.5 + step);
      expect(Math.hypot(point.x - coreX, point.y - coreY)).toBeLessThanOrEqual(0.5);
      expect(point.x).toBeGreaterThanOrEqual(2.5);
      expect(point.x).toBeLessThanOrEqual(3.5);
      expect(point.y).toBeGreaterThanOrEqual(2.5);
      expect(point.y).toBeLessThanOrEqual(3.5);
    }
  });

  it('shares the exact edge midpoint between consecutive corners turning opposite ways', () => {
    const bend = [
      { x: 4, y: 4 },
      { x: 3, y: 4 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
    ];

    expect(sampleRoute(bend, 1 / 3)).toEqual({
      x: expect.closeTo(3.146447, 6),
      y: expect.closeTo(3.853553, 6),
    });
    expect(sampleRoute(bend, 0.5)).toEqual({ x: 3, y: 3.5 });
    expect(sampleRoute(bend, 2 / 3)).toEqual({
      x: expect.closeTo(2.853553, 6),
      y: expect.closeTo(3.146447, 6),
    });
  });

  it('passes through the center and retraces the same edge on a reversal', () => {
    const reversal = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ];

    expect(sampleRoute(reversal, 0.375)).toEqual({ x: 0, y: 0.75 });
    expect(sampleRoute(reversal, 0.5)).toEqual({ x: 0, y: 1 });
    expect(sampleRoute(reversal, 0.625)).toEqual({ x: 0, y: 0.75 });
  });

  it('handles routes shorter than an edge', () => {
    expect(sampleRoute([{ x: 2, y: 3 }], 0.5)).toEqual({ x: 2, y: 3 });
    expect(() => sampleRoute([], 0)).toThrow(RangeError);
  });
});
