import { describe, expect, it } from 'vitest';
import {
  type CellIndex,
  type Content,
  canAffordTower,
  createGame,
  currentRoute,
  enemyPosition,
  enemyRouteSegments,
  type GameEvent,
  type GameState,
  parseLevel,
  previewPlacement,
  samePlacementPreviewInputs,
  step,
} from './index';

// 每秒 7.5 格 = 每 tick 0.25 格，讓位置在二進位浮點下精確。
const content = {
  enemies: { grunt: { speed: 7.5 } },
  waves: [{ groups: [{ enemy: 'grunt', count: 1, interval: 1, delay: 0 }] }],
  towers: { basic: { name: 'Basic', cost: 30, range: 2, damage: 4, shotsPerSecond: 1 } },
  startingMoney: 100,
  heightRangeBonus: 1.5,
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
        ...content,
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

describe('placing towers', () => {
  const placementContent = {
    ...content,
    waves: [],
  } satisfies Content;

  it('charges the same price on both layers and records each tower’s layer', () => {
    const start = createGame(placementContent, parseLevel(['S==G', '.#..']));
    const result = step(start, [
      { type: 'placeTower', kind: 'basic', cell: 4 as CellIndex, tick: 0 },
      { type: 'placeTower', kind: 'basic', cell: 5 as CellIndex, tick: 0 },
    ]);

    expect(result.events).toEqual([]);
    expect(result.state.money).toBe(40);
    expect(result.state.towers).toEqual([
      { cell: 4, kind: 'basic', layer: 0 },
      { cell: 5, kind: 'basic', layer: 1 },
    ]);
    expect(start.money).toBe(100);
    expect(start.towers).toEqual([]);
  });

  it('rejects a route that would no longer reach the goal', () => {
    const start = createGame(placementContent, parseLevel(['S==G']));
    const result = step(start, [
      { type: 'placeTower', kind: 'basic', cell: 1 as CellIndex, tick: 0 },
    ]);

    expect(result.events).toEqual([{ type: 'rejected', cell: 1, reason: 'disconnectedRoute' }]);
    expect(result.state).toEqual(step(start, []).state);
  });

  it.each([
    ['entrance', 0],
    ['ramp', 6],
    ['goal', 3],
    ['map exterior', 8],
  ])('rejects building at the %s', (_terrain, cell) => {
    const start = createGame(placementContent, parseLevel(['S=+g', '.=^#']));
    const result = step(start, [
      { type: 'placeTower', kind: 'basic', cell: cell as CellIndex, tick: 0 },
    ]);

    expect(result.events).toEqual([{ type: 'rejected', cell, reason: 'unbuildableCell' }]);
    expect(result.state).toEqual(step(start, []).state);
  });

  it('rejects commands for unknown kinds and other ticks', () => {
    const start = createGame(placementContent, parseLevel(['S==G', '....']));
    const cell = 4 as CellIndex;
    const result = step(start, [
      { type: 'placeTower', kind: 'constructor', cell, tick: 0 },
      { type: 'placeTower', kind: 'basic', cell, tick: 1 },
    ]);

    expect(result.events).toEqual([
      { type: 'rejected', cell: 4, reason: 'unknownTower' },
      { type: 'rejected', cell: 4, reason: 'wrongTick' },
    ]);
    expect(result.state).toEqual(step(start, []).state);
  });

  it('rejects a tower on a cell occupied by a prior command on the same tick', () => {
    const start = createGame(placementContent, parseLevel(['S==G', '....']));
    const command = { type: 'placeTower', kind: 'basic', cell: 4 as CellIndex, tick: 0 } as const;
    const result = step(start, [command, command]);

    expect(result.events).toEqual([{ type: 'rejected', cell: 4, reason: 'occupiedCell' }]);
    expect(result.state).toEqual(step(start, [command]).state);
  });

  it('rejects a tower when the remaining money is below its price', () => {
    const level = parseLevel(['S==G', '....']);
    const start = createGame({ ...placementContent, startingMoney: 30 }, level);
    expect(canAffordTower(start, 'basic')).toBe(true);
    const first = { type: 'placeTower', kind: 'basic', cell: 4 as CellIndex, tick: 0 } as const;
    const second = { ...first, cell: 5 as CellIndex };
    const result = step(start, [first, second]);

    expect(result.events).toEqual([{ type: 'rejected', cell: 5, reason: 'insufficientFunds' }]);
    expect(result.state.money).toBe(0);
    expect(canAffordTower(result.state, 'basic')).toBe(false);
    expect(result.state).toEqual(step(start, [first]).state);
  });

  it.each([
    [4, 1],
    [4, 2],
    [5, 1],
    [5, 2],
  ])('reserves the enemy’s current and next cells at tick %i (cell %i)', (tick, cell) => {
    const start = run(createGame(content, parseLevel(['S===G', '====='])), tick).state;
    const result = step(start, [
      { type: 'placeTower', kind: 'basic', cell: cell as CellIndex, tick },
    ]);

    expect(result.events).toEqual([{ type: 'rejected', cell, reason: 'enemyOnCell' }]);
    expect(result.state).toEqual(step(start, []).state);
  });

  it('rejects a tower that would trap an enemy while the entrance is still connected', () => {
    const level = parseLevel(['S=====G', '=.....=', '=======']);
    const start = run(createGame(content, level), 8).state;
    const behind = step(start, [
      { type: 'placeTower', kind: 'basic', cell: 1 as CellIndex, tick: 8 },
    ]);
    expect(behind.events).toEqual([]);
    expect(positions(behind.state)).toEqual([{ x: 2.25, y: 0 }]);
    expect(enemyRouteSegments(behind.state)).toEqual([
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
      { from: 5, to: 6 },
    ]);

    const result = step(behind.state, [
      { type: 'placeTower', kind: 'basic', cell: 4 as CellIndex, tick: 9 },
    ]);

    expect(result.events).toEqual([{ type: 'rejected', cell: 4, reason: 'trappedEnemy' }]);
    expect(result.state).toEqual(step(behind.state, []).state);
  });

  it('immediately routes an active enemy around a newly placed barricade', () => {
    const level = parseLevel(['S====G', '===.==', '======']);
    const start = run(createGame(content, level), 8).state;
    const cell = 4 as CellIndex;
    const preview = previewPlacement(start, cell, 'basic');
    expect(currentRoute(start)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(preview).toEqual({
      reason: undefined,
      route: [0, 1, 2, 8, 14, 15, 16, 10, 11, 5],
      rangeAtGround: 2,
      heightBonus: 0,
    });

    const result = step(start, [{ type: 'placeTower', kind: 'basic', cell, tick: 8 }]);
    expect(result.events).toEqual([]);
    expect(positions(result.state)).toEqual([{ x: 2, y: 0.25 }]);
    expect(currentRoute(result.state)).toEqual(preview.route);
    expect(currentRoute(start)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps a committed branch visible until its enemies return to the main route', () => {
    const level = parseLevel(['S===G', '==.==', '=====']);
    const twoEnemies = {
      ...content,
      waves: [{ groups: [{ enemy: 'grunt', count: 2, interval: 0, delay: 0 }] }],
    };
    const start = run(createGame(twoEnemies, level), 5).state;
    expect(enemyRouteSegments(start)).toEqual([]);

    const rerouted = step(start, [
      { type: 'placeTower', kind: 'basic', cell: 3 as CellIndex, tick: 5 },
    ]);
    expect(rerouted.events).toEqual([]);
    expect(currentRoute(rerouted.state)).toEqual([0, 1, 6, 11, 12, 13, 8, 9, 4]);
    expect(enemyRouteSegments(rerouted.state)).toEqual([{ from: 1, to: 2 }]);
    expect(enemyRouteSegments(run(rerouted.state, 3).state)).toEqual([{ from: 2, to: 1 }]);
    expect(enemyRouteSegments(run(rerouted.state, 6).state)).toEqual([]);
    const leavingBranch = run(rerouted.state, 5).state;
    const rejoined = step(leavingBranch, []).state;
    expect(enemyRouteSegments(rejoined, leavingBranch)).toEqual([{ from: 2, to: 1 }]);
    expect(enemyRouteSegments(rejoined, rerouted.state)).toEqual([]);
  });

  it('reuses previews across quiet ticks and invalidates them after a free tower is placed', () => {
    const freeTowers = {
      ...placementContent,
      towers: { basic: { ...placementContent.towers.basic, cost: 0 } },
    };
    const initial = createGame(freeTowers, parseLevel(['S===G', '.....']));
    const waiting = run(initial, 30).state;
    const cell = 5 as CellIndex;
    expect(samePlacementPreviewInputs(initial, waiting)).toBe(true);

    const placed = step(waiting, [{ type: 'placeTower', kind: 'basic', cell, tick: 30 }]).state;
    expect(placed.money).toBe(initial.money);
    expect(samePlacementPreviewInputs(waiting, placed)).toBe(false);
    expect(previewPlacement(placed, cell, 'basic').reason).toBe('occupiedCell');
  });

  it('invalidates previews when enemies enter reserved cells and reuses them mid-edge', () => {
    const start = createGame(content, parseLevel(['S===G', '=====']));
    const inMotion = step(start, []).state;
    expect(samePlacementPreviewInputs(inMotion, step(inMotion, []).state)).toBe(true);

    const atNextCell = run(inMotion, 3).state;
    const cell = 2 as CellIndex;
    expect(previewPlacement(inMotion, cell, 'basic').reason).toBeUndefined();
    expect(previewPlacement(atNextCell, cell, 'basic').reason).toBe('enemyOnCell');
    expect(samePlacementPreviewInputs(inMotion, atNextCell)).toBe(false);
  });

  it('previews the high-ground bonus against layer 0 without changing the route', () => {
    const start = createGame(placementContent, parseLevel(['S==G', '.#..']));
    expect(previewPlacement(start, 5 as CellIndex, 'basic')).toEqual({
      reason: undefined,
      route: [0, 1, 2, 3],
      rangeAtGround: 3.5,
      heightBonus: 1.5,
    });
    expect(start.money).toBe(100);
    expect(start.towers).toEqual([]);
  });
});
