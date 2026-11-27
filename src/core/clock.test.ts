import { describe, expect, it } from 'vitest';
import { advanceClock } from './index';

describe('advanceClock', () => {
  it('runs one tick per 1/30 s at 1×', () => {
    expect(advanceClock({ elapsedMs: 100, speed: 1, accumulatedMs: 0 })).toEqual({
      ticks: 3,
      accumulatedMs: 0,
    });
  });

  it('carries the time left over that is shorter than one tick', () => {
    const result = advanceClock({ elapsedMs: 50, speed: 1, accumulatedMs: 0 });
    expect(result.ticks).toBe(1);
    expect(result.accumulatedMs).toBeCloseTo(50 / 3, 9);
  });

  it('adds carried time to this frame', () => {
    const result = advanceClock({ elapsedMs: 20, speed: 1, accumulatedMs: 20 });
    expect(result.ticks).toBe(1);
    expect(result.accumulatedMs).toBeCloseTo(20 / 3, 9);
  });

  it('scales elapsed time by the speed multiplier', () => {
    expect(advanceClock({ elapsedMs: 100, speed: 2, accumulatedMs: 0 })).toEqual({
      ticks: 6,
      accumulatedMs: 0,
    });
  });

  it('runs no ticks while paused and keeps the carried time', () => {
    expect(advanceClock({ elapsedMs: 500, speed: 0, accumulatedMs: 10 })).toEqual({
      ticks: 0,
      accumulatedMs: 10,
    });
  });

  it('catches up at most 8 ticks per frame and drops the rest', () => {
    expect(advanceClock({ elapsedMs: 1000, speed: 1, accumulatedMs: 0 })).toEqual({
      ticks: 8,
      accumulatedMs: 0,
    });
  });

  it('allows exactly 8 ticks without dropping anything', () => {
    const result = advanceClock({ elapsedMs: 280, speed: 1, accumulatedMs: 0 });
    expect(result.ticks).toBe(8);
    expect(result.accumulatedMs).toBeCloseTo(40 / 3, 9);
  });
});
