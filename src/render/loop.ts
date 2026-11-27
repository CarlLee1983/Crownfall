import {
  advanceClock,
  applyCommands,
  type Command,
  type GameEvent,
  type GameState,
  step,
  TICKS_PER_SECOND,
} from '../core';

const MS_PER_TICK = 1000 / TICKS_PER_SECOND;

export interface LoopOptions {
  readonly initial: GameState;
  /** 補跑的 tick 各自送出事件，畫面上的特效共用當幀的起始時間。 */
  readonly onEvents: (events: readonly GameEvent[], current: GameState, frameTime: number) => void;
  /** 畫面比最新 tick 慢一格：previous 到 current 之間以 alpha 內插。 */
  readonly draw: (
    previous: GameState,
    current: GameState,
    alpha: number,
    frameTime: number,
  ) => void;
}

type CommandFactory = (tick: number) => Command;

export interface LoopSession {
  readonly enqueue: (command: CommandFactory) => void;
  readonly setSpeed: (speed: number) => void;
  readonly reset: (initial: GameState) => void;
  readonly getCommandLog: () => readonly Command[];
}

export function startLoop({ initial, onEvents, draw }: LoopOptions): LoopSession {
  let previous = initial;
  let current = initial;
  let accumulatedMs = 0;
  let speed = 1;
  let lastFrame: number | undefined;
  const pending: CommandFactory[] = [];
  const commandLog: Command[] = [];
  const takeCommands = (): readonly Command[] => {
    const commands = pending.splice(0).map((createCommand) => createCommand(current.tick));
    commandLog.push(...commands);
    return commands;
  };

  const frame = (now: number): void => {
    const elapsedMs = lastFrame === undefined ? 0 : now - lastFrame;
    lastFrame = now;

    const advance = advanceClock({ elapsedMs, speed, accumulatedMs });
    accumulatedMs = advance.accumulatedMs;
    for (let i = 0; i < advance.ticks; i++) {
      previous = current;
      const result = step(current, takeCommands());
      current = result.state;
      onEvents(result.events, current, now);
    }
    if (speed === 0 && pending.length > 0) {
      const result = applyCommands(current, takeCommands());
      current = result.state;
      onEvents(result.events, current, now);
    }

    draw(previous, current, accumulatedMs / MS_PER_TICK, now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return {
    enqueue: (command) => pending.push(command),
    setSpeed: (next) => {
      speed = next;
      lastFrame = undefined;
    },
    reset: (state) => {
      previous = current = state;
      accumulatedMs = 0;
      lastFrame = undefined;
      pending.length = 0;
      commandLog.length = 0;
    },
    getCommandLog: () => commandLog.slice(),
  };
}
