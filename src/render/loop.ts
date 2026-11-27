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

interface FrameTime {
  readonly wall: number;
  readonly game: number;
}

export interface LoopOptions {
  readonly initial: GameState;
  /** 補跑的每個 tick 各自送出事件及遊戲時間。 */
  readonly onEvents: (
    events: readonly GameEvent[],
    previous: GameState,
    current: GameState,
    time: FrameTime,
  ) => void;
  /** 畫面比最新 tick 慢一格：previous 到 current 之間以 alpha 內插。 */
  readonly draw: (previous: GameState, current: GameState, alpha: number, time: FrameTime) => void;
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
  // 終局時模擬不再推進，但擊殺與漏怪特效仍要播完。
  let elapsedTicks = 0;
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
      elapsedTicks++;
      onEvents(result.events, previous, current, { wall: now, game: elapsedTicks * MS_PER_TICK });
    }
    if (speed === 0 && pending.length > 0) {
      const beforeCommands = current;
      const result = applyCommands(current, takeCommands());
      current = result.state;
      onEvents(result.events, beforeCommands, current, {
        wall: now,
        game: elapsedTicks * MS_PER_TICK + accumulatedMs,
      });
    }

    draw(previous, current, accumulatedMs / MS_PER_TICK, {
      wall: now,
      game: elapsedTicks * MS_PER_TICK + accumulatedMs,
    });
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
      elapsedTicks = 0;
      lastFrame = undefined;
      pending.length = 0;
      commandLog.length = 0;
    },
    getCommandLog: () => commandLog.slice(),
  };
}
