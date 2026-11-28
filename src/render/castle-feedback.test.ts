import { PerspectiveCamera } from 'three';
import { expect, it } from 'vitest';
import { type Content, createGame, parseLevel, step } from '../core';
import { cellIndex } from '../core/level';
import { createCombatFeedback } from './combat-feedback';
import { createEnemyLayer } from './enemies';

const content = {
  enemies: { grunt: { speed: 15, hp: 12, bounty: 5, leakDamage: 1 } },
  waves: [{ groups: [{ enemy: 'grunt', count: 1, interval: 0, delay: 0 }] }],
  towers: { basic: { name: 'Archer', cost: 10, range: 1.2, damage: 12, shotsPerSecond: 1 } },
  towerUpgrades: { costPercents: [60, 100], damageMultiplier: 1, rangeBonus: 0 },
  startingMoney: 100,
  startingLives: 10,
  waveClearReward: 0,
  heightRangeBonus: 0,
} satisfies Content;

function reachCastle(placeArcher: boolean) {
  const level = parseLevel(['S=G', '...']);
  const feedback = createCombatFeedback(createEnemyLayer(new PerspectiveCamera()));
  let previous = createGame(content, level);
  let result = step(previous, [
    ...(placeArcher
      ? [{ type: 'placeTower', kind: 'basic', cell: cellIndex(3, 2, 1), tick: 0 } as const]
      : []),
    { type: 'startWave', tick: 0 },
  ]);
  for (const gameTime of [0, 33, 67, 100]) {
    feedback.onEvents(result.events, previous, gameTime);
    previous = result.state;
    if (gameTime < 100) result = step(previous, []);
  }
  return { ...result, feedback };
}

it('loses a life and gives the castle a restrained 220 ms pulse when an enemy enters', () => {
  const { state, events, feedback } = reachCastle(false);
  expect(state.lives).toBe(9);
  expect(events[0]).toMatchObject({ type: 'leaked', livesLost: 1 });

  const impact = feedback.update(100, false);
  expect(impact.castleFlash).toBeCloseTo(0.45);
  expect(impact.lifePulse).toBeCloseTo(0.171);
  expect(impact.shake.length()).toBeCloseTo(0.025);

  expect(feedback.update(210, false).castleFlash).toBeCloseTo(0.225);
  expect(feedback.update(319, false).shake.length()).toBeGreaterThan(0);
  const settled = feedback.update(320, false);
  expect(settled.castleFlash).toBe(0);
  expect(settled.lifePulse).toBe(0);
  expect(settled.shake.length()).toBe(0);
});

it('keeps lives and shows no castle pulse when the archer kills the enemy just before it enters', () => {
  const { state, events, feedback } = reachCastle(true);
  expect(state.lives).toBe(10);
  expect(state.money).toBe(95);
  expect(events.map(({ type }) => type)).toEqual(['shot', 'killed', 'waveCleared', 'victory']);

  const frame = feedback.update(100, false);
  expect(frame.castleFlash).toBe(0);
  expect(frame.lifePulse).toBe(0);
  expect(frame.shake.length()).toBe(0);
});
