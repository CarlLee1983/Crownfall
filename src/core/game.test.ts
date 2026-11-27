import { describe, expect, it } from 'vitest';
import {
  type Content,
  createGame,
  enemyPosition,
  type GameEvent,
  type GameState,
  parseLevel,
  step,
} from './index';

// 每秒 7.5 格 = 每 tick 0.25 格，讓位置在二進位浮點下精確。
const content = {
  enemies: { grunt: { speed: 7.5 } },
  waves: [{ groups: [{ enemy: 'grunt', count: 1, interval: 1, delay: 0 }] }],
} satisfies Content;

function run(state: GameState, ticks: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let current = state;
  for (let i = 0; i < ticks; i++) {
    const result = step(current, []);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

function positions(state: GameState) {
  return state.enemies.map((enemy) => enemyPosition(state, enemy));
}

describe('enemies walking the lane', () => {
  const corridor = parseLevel(['S==G']);

  it('walks toward the goal at its speed', () => {
    const start = createGame(content, corridor);
    expect(positions(start)).toEqual([{ x: 0, y: 0 }]);
    expect(positions(run(start, 2).state)).toEqual([{ x: 0.5, y: 0 }]);
    expect(positions(run(start, 6).state)).toEqual([{ x: 1.5, y: 0 }]);
  });

  it('disappears on reaching the goal and reports the leak on that tick', () => {
    const start = createGame(content, corridor);
    const before = run(start, 11);
    expect(before.events).toEqual([]);
    expect(before.state.enemies).toHaveLength(1);

    const arrival = step(before.state, []);
    expect(arrival.state.tick).toBe(12);
    expect(arrival.state.enemies).toEqual([]);
    expect(arrival.events).toEqual([{ type: 'leaked', enemyId: 1, enemyKind: 'grunt' }]);
  });
});

describe('height layers', () => {
  // (1,0) 低層車道與 (2,0) 高層車道相鄰卻沒有坡道，是峭壁；唯一換層處是 (2,1) 的坡道。
  const cliffAndRamp = parseLevel(['S=+g', '.=^#']);

  it('changes layer only through the ramp, never across the cliff', () => {
    const start = createGame(content, cliffAndRamp);
    const cellsVisited = [4, 8, 12, 16].map((ticks) => positions(run(start, ticks).state));
    expect(cellsVisited).toEqual([
      [{ x: 1, y: 0 }],
      [{ x: 1, y: 1 }],
      [{ x: 2, y: 1 }],
      [{ x: 2, y: 0 }],
    ]);
    expect(run(start, 20).events).toEqual([{ type: 'leaked', enemyId: 1, enemyKind: 'grunt' }]);
  });

  it('rejects a ramp that could rise toward more than one higher lane cell', () => {
    expect(() => createGame(content, parseLevel(['S=+g', '.=^+']))).toThrow('坡道 (2, 1)');
  });

  it('rejects a level whose entrance cannot reach the goal', () => {
    expect(() => createGame(content, parseLevel(['S=+g']))).toThrow('走不到終點');
  });
});

describe('spawn groups', () => {
  const longCorridor = parseLevel(['S=========================G']);

  it('releases each enemy of a group after the delay, one interval apart', () => {
    const start = createGame(
      {
        enemies: { grunt: { speed: 7.5 } },
        waves: [{ groups: [{ enemy: 'grunt', count: 3, interval: 1, delay: 0.5 }] }],
      },
      longCorridor,
    );
    const countAt = (ticks: number) => run(start, ticks).state.enemies.length;
    expect([countAt(14), countAt(15), countAt(44), countAt(45), countAt(75)]).toEqual([
      0, 1, 1, 2, 3,
    ]);
    expect(run(start, 75).state.enemies.map((enemy) => enemy.id)).toEqual([1, 2, 3]);
  });

  it('is a pure step: the input state is left untouched and replays identically', () => {
    const start = createGame(content, longCorridor);
    const first = run(start, 30);
    expect(start.tick).toBe(0);
    expect(positions(start)).toEqual([{ x: 0, y: 0 }]);
    expect(first.state.tick).toBe(30);
    expect(positions(first.state)).toEqual([{ x: 7.5, y: 0 }]);
    expect(run(start, 30)).toEqual(first);
  });
});
