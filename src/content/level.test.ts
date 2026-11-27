import { expect, test } from 'vitest';
import { type CellIndex, cellAt, cellPoint } from '../core';
import { level } from './level';

const cells = level.cells.map((_, index) => {
  const cell = index as CellIndex;
  return { ...cellPoint(level, cell), ...cellAt(level, cell) };
});

test('每一格與車道的曼哈頓距離不超過兩格', () => {
  const lanes = cells.filter((cell) => cell.lane);
  const distantCells = cells
    .filter(({ x, y }) => !lanes.some((lane) => Math.abs(x - lane.x) + Math.abs(y - lane.y) <= 2))
    .map(({ x, y }) => ({ x, y }));

  expect(distantCells).toEqual([]);
});

test('關卡恰有一座坡道', () => {
  expect(cells.filter((cell) => cell.ramp)).toHaveLength(1);
});

test('入口在第 0 層，城堡在第 1 層', () => {
  expect(cellAt(level, level.spawn).layer).toBe(0);
  expect(cellAt(level, level.goal).layer).toBe(1);
});
