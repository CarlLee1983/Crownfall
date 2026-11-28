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

test('路障預覽改走左岸，建造後第一波沿預覽路線抵達城堡', () => {
  const initial = createGame(content, level);
  const rightBank = cellIndex(level.width, 22, 9);
  const leftBank = cellIndex(level.width, 7, 9);
  const preview = previewPlacement(initial, rightBank, 'basic');
  expect(preview.reason).toBeUndefined();
  expect(preview.route).toContain(leftBank);
  expect(preview.route).not.toContain(rightBank);
  expect(preview.route.at(-1)).toBe(level.goal);

  let { state, events } = step(initial, [
    { type: 'placeTower', tick: 0, cell: rightBank, kind: 'basic' },
    { type: 'startWave', tick: 0 },
  ]);
  expect(events).toEqual([]);
  expect(currentRoute(state)).toEqual(preview.route);
  expect(state.money).toBe(50);

  let usedLeftBank = false;
  let reachedCastle = false;
  for (let tick = 1; tick < 1000; tick++) {
    ({ state, events } = step(state, []));
    for (const { from, to } of state.enemies) {
      const offset = preview.route.indexOf(from);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect([from, preview.route[offset + 1]]).toContain(to);
      usedLeftBank ||= from === leftBank;
    }
    reachedCastle ||= events.some((event) => event.type === 'leaked');
  }
  expect(usedLeftBank).toBe(true);
  expect(reachedCastle).toBe(true);
});

test('同一套預覽與建造判定保留放置位置、資金、占用及通路限制', () => {
  const initial = createGame(content, level);
  const rightBank = cellIndex(level.width, 22, 9);
  const leftBank = cellIndex(level.width, 7, 9);
  const place = (state: typeof initial, cell: CellIndex, kind = 'basic') => ({
    type: 'placeTower' as const,
    tick: state.tick,
    cell,
    kind,
  });
  const rejects = (state: typeof initial, command: ReturnType<typeof place>, reason: string) => {
    expect(previewPlacement(state, command.cell, command.kind).reason).toBe(reason);
    expect(applyCommands(state, [command])).toEqual({
      state,
      events: [{ type: 'rejected', cell: command.cell, reason }],
    });
  };

  rejects(initial, place(initial, cellIndex(level.width, 22, 8)), 'unbuildableCell');
  rejects(initial, place(initial, cellIndex(level.width, 23, 4)), 'unbuildableCell');

  const configured = applyCommands(initial, [place(initial, rightBank)]).state;
  rejects(configured, place(configured, rightBank), 'occupiedCell');
  rejects(configured, place(configured, leftBank, 'sniper'), 'insufficientFunds');
  rejects(configured, place(configured, leftBank), 'disconnectedRoute');

  let { state } = step(initial, [{ type: 'startWave', tick: 0 }]);
  for (let tick = 1; tick < 175; tick++) state = step(state, []).state;
  rejects(state, place(state, rightBank), 'enemyOnCell');
});

test('波次中建造的路障照常攻擊車道上的敵人', () => {
  let { state } = step(createGame(content, level), [{ type: 'startWave', tick: 0 }]);
  for (let tick = 1; tick < 150; tick++) state = step(state, []).state;
  const cell = cellIndex(level.width, 22, 9);
  const { events } = step(state, [{ type: 'placeTower', tick: 150, cell, kind: 'basic' }]);
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'shot',
      towerCell: cell,
      towerKind: 'basic',
      impacts: [expect.objectContaining({ hp: 18 })],
    }),
  );
});
