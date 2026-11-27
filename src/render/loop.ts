import {
  advanceClock,
  type Command,
  type GameEvent,
  type GameState,
  step,
  TICKS_PER_SECOND,
} from '../core';

const MS_PER_TICK = 1000 / TICKS_PER_SECOND;

export interface LoopOptions {
  readonly initial: GameState;
  readonly onEvents: (events: readonly GameEvent[]) => void;
  /** 畫面比最新 tick 慢一格：previous 到 current 之間以 alpha 內插。 */
  readonly draw: (previous: GameState, current: GameState, alpha: number) => void;
}

type CommandFactory = (tick: number) => Command;

export interface LoopSession {
  readonly enqueue: (command: CommandFactory) => void;
  readonly getCommandLog: () => readonly Command[];
}

export function startLoop({ initial, onEvents, draw }: LoopOptions): LoopSession {
  let previous = initial;
  let current = initial;
  let accumulatedMs = 0;
  let lastFrame: number | undefined;
  const pending: CommandFactory[] = [];
  const commandLog: Command[] = [];

  const frame = (now: number): void => {
    const elapsedMs = lastFrame === undefined ? 0 : now - lastFrame;
    lastFrame = now;

    const advance = advanceClock({ elapsedMs, speed: 1, accumulatedMs });
    accumulatedMs = advance.accumulatedMs;
    for (let i = 0; i < advance.ticks; i++) {
      previous = current;
      const commands = pending.splice(0).map((createCommand) => createCommand(current.tick));
      commandLog.push(...commands);
      const result = step(current, commands);
      current = result.state;
      onEvents(result.events);
    }

    draw(previous, current, accumulatedMs / MS_PER_TICK);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return {
    enqueue: (command) => pending.push(command),
    getCommandLog: () => commandLog.slice(),
  };
}
