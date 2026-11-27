import { advanceClock, type GameState, step, TICKS_PER_SECOND } from '../core';

const MS_PER_TICK = 1000 / TICKS_PER_SECOND;

export interface LoopOptions {
  readonly initial: GameState;
  /** 畫面比最新 tick 慢一格：previous 到 current 之間以 alpha 內插。 */
  readonly draw: (previous: GameState, current: GameState, alpha: number) => void;
}

export function startLoop({ initial, draw }: LoopOptions): void {
  let previous = initial;
  let current = initial;
  let accumulatedMs = 0;
  let lastFrame: number | undefined;

  const frame = (now: number): void => {
    const elapsedMs = lastFrame === undefined ? 0 : now - lastFrame;
    lastFrame = now;

    const advance = advanceClock({ elapsedMs, speed: 1, accumulatedMs });
    accumulatedMs = advance.accumulatedMs;
    for (let i = 0; i < advance.ticks; i++) {
      previous = current;
      current = step(current, []).state;
    }

    draw(previous, current, accumulatedMs / MS_PER_TICK);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
