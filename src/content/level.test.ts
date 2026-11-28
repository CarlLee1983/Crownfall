import { expect, test } from 'vitest';
import {
  applyCommands,
  type CellIndex,
  cellPoint,
  createGame,
  currentRoute,
  previewPlacement,
  step,
} from '../core';
import { cellIndex } from '../core/level';
import { content } from './content';
import { level } from './level';

test('雙岸平原從紅旗入口經右岸抵達城堡', () => {
  const initial = createGame(content, level);
  expect([level.width, level.height]).toEqual([30, 23]);
  const route = currentRoute(initial).map((cell) => cellPoint(level, cell));
  expect(route.at(0)).toEqual({ x: 27, y: 4 });
  expect(route).toContainEqual({ x: 22, y: 9 });
  expect(route).not.toContainEqual({ x: 7, y: 9 });
  expect(route.at(-1)).toEqual({ x: 2, y: 18 });
});

test('十二個固定高台可設防，裝飾草地拒絕預覽與建造', () => {
  const initial = createGame(content, level);
  const platforms = level.cells.flatMap((terrain, index) => {
    const cell = index as CellIndex;
    return !terrain.lane && previewPlacement(initial, cell, 'basic').reason === undefined
      ? [cellPoint(level, cell)]
      : [];
  });

  expect(platforms).toEqual([
    { x: 12, y: 1 },
    { x: 17, y: 1 },
    { x: 26, y: 1 },
    { x: 3, y: 6 },
    { x: 10, y: 7 },
    { x: 25, y: 7 },
    { x: 19, y: 9 },
    { x: 4, y: 12 },
    { x: 16, y: 12 },
    { x: 11, y: 18 },
    { x: 20, y: 18 },
    { x: 3, y: 21 },
  ]);

  const placeCommand = (x: number, y: number, kind = 'basic') => ({
    type: 'placeTower' as const,
    tick: initial.tick,
    cell: cellIndex(level.width, x, y),
    kind,
  });
  const check = (
    state: typeof initial,
    command: ReturnType<typeof placeCommand>,
    reason: string,
  ) => {
    expect(previewPlacement(state, command.cell, command.kind).reason).toBe(reason);
    expect(applyCommands(state, [command])).toEqual({
      state,
      events: [{ type: 'rejected', cell: command.cell, reason }],
    });
  };

  check(initial, placeCommand(15, 10), 'unbuildableCell');
  const first = placeCommand(25, 7);
  const { state: defended } = applyCommands(initial, [first]);
  expect(defended.money).toBe(50);
  expect(defended.towers.map(({ cell, layer }) => ({ cell, layer }))).toEqual([
    { cell: first.cell, layer: 1 },
  ]);
  check(defended, first, 'occupiedCell');
  check(defended, placeCommand(19, 9, 'sniper'), 'insufficientFunds');
});

test('建在高台不改道，第一波敵人沿備戰時的目前路線前進', () => {
  const initial = createGame(content, level);
  const previewRoute = currentRoute(initial);
  const platform = cellIndex(level.width, 16, 12);
  let { state } = step(initial, [
    { type: 'placeTower', tick: 0, cell: platform, kind: 'basic' },
    { type: 'startWave', tick: 0 },
  ]);
  expect(currentRoute(state)).toEqual(previewRoute);
  for (let tick = 1; tick < 210; tick++) {
    state = step(state, []).state;
    for (const { from, to } of state.enemies) {
      const routeOffset = previewRoute.indexOf(from);
      expect(routeOffset).toBeGreaterThanOrEqual(0);
      expect([previewRoute[routeOffset], previewRoute[routeOffset + 1]]).toContain(to);
    }
  }
  expect(state.enemies.some(({ from }) => from === cellIndex(level.width, 22, 10))).toBe(true);
});
