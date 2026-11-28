import { expect, test } from 'vitest';
import { applyCommands, createGame, enemyPosition, step } from '../core';
import { cellIndex } from '../core/level';
import { content } from './content';
import { level } from './level';

test.each([
  {
    bank: '右岸',
    platformX: 19,
    platformY: 9,
    laneX: 22,
    middleStart: 6,
    middleEnd: 12,
    blockEast: false,
  },
  {
    bank: '左岸',
    platformX: 4,
    platformY: 12,
    laneX: 7,
    middleStart: 9,
    middleEnd: 15,
    blockEast: true,
  },
])('$bank 中段高台持續射擊，城堡前高台只射擊會合後的末段', (bank) => {
  // 用正式骷髏騎士承受兩段火力，讓完整路線能在單一波次中驗證。
  const initial = createGame(
    {
      ...content,
      startingMoney: 150,
      waves: [{ groups: [{ enemy: 'tank', count: 1, interval: 1, delay: 0 }] }],
    },
    level,
  );
  const middle = cellIndex(level.width, bank.platformX, bank.platformY);
  const finisher = cellIndex(level.width, 3, 21);
  const eastBarricade = cellIndex(level.width, 22, 9);
  const cells = bank.blockEast ? [middle, finisher, eastBarricade] : [middle, finisher];
  const launch = applyCommands(initial, [
    ...cells.map((cell) => ({ type: 'placeTower' as const, tick: 0, kind: 'basic', cell })),
    { type: 'startWave', tick: 0 },
  ]);
  expect(launch.events).toEqual([]);

  const shots = [];
  let state = launch.state;
  for (let tick = 0; tick < 1500; tick++) {
    const result = step(state, []);
    for (const event of result.events) {
      if (event.type !== 'shot') continue;
      expect(event.impacts).toMatchObject([
        { target: { id: 1 }, hp: Math.max(0, event.target.hp - 4) },
      ]);
      shots.push({ cell: event.towerCell, ...enemyPosition(state, event.target) });
    }
    state = result.state;
  }
  expect(state.phase).toBe('victory');

  const middleHits = shots.filter(({ cell }) => cell === middle);
  expect(middleHits.length).toBeGreaterThanOrEqual(5);
  for (const { x, y } of middleHits) {
    // 兩座中段高台距車道都是 3 格，超出弓箭塔的 2.5 格基礎射程。
    expect(x).toBe(bank.laneX);
    expect(y).toBeGreaterThan(bank.middleStart);
    expect(y).toBeLessThan(bank.middleEnd);
  }
  expect(middleHits[0]?.y).toBeLessThan(bank.middleStart + 1);
  expect(middleHits.at(-1)?.y).toBeGreaterThan(bank.middleEnd - 1);

  const finisherHits = shots.filter(({ cell }) => cell === finisher);
  expect(finisherHits.length).toBeGreaterThanOrEqual(2);
  expect(finisherHits[0]?.x).toBeGreaterThan(5);
  for (const { x, y } of finisherHits) {
    // 城堡前車道距高台垂直相隔 3 格，兩路會合在 (7, 15)。
    expect(y).toBe(18);
    expect(x).toBeGreaterThanOrEqual(2);
    expect(x).toBeLessThan(6);
  }
});
