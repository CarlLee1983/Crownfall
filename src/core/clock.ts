export const TICKS_PER_SECOND = 30;
export const MAX_CATCH_UP_TICKS = 8;

const MS_PER_SECOND = 1000;

export interface ClockInput {
  readonly elapsedMs: number;
  readonly speed: number;
  readonly accumulatedMs: number;
}

export interface ClockAdvance {
  readonly ticks: number;
  readonly accumulatedMs: number;
}

export function advanceClock({ elapsedMs, speed, accumulatedMs }: ClockInput): ClockAdvance {
  // 以「毫秒 × tick/秒」為單位計算，整數毫秒輸入時不會產生浮點殘差。
  const scaled = (accumulatedMs + elapsedMs * speed) * TICKS_PER_SECOND;
  const dueTicks = Math.floor(scaled / MS_PER_SECOND);
  if (dueTicks > MAX_CATCH_UP_TICKS) {
    return { ticks: MAX_CATCH_UP_TICKS, accumulatedMs: 0 };
  }
  return {
    ticks: dueTicks,
    accumulatedMs: (scaled - dueTicks * MS_PER_SECOND) / TICKS_PER_SECOND,
  };
}
