import { PerspectiveCamera } from 'three';
import { expect, it } from 'vitest';
import { type Content, createGame, type EnemyId, parseLevel, step } from '../core';
import { cellIndex } from '../core/level';
import { createCombatFeedback } from './combat-feedback';
import { createEnemyLayer } from './enemies';

function setup({ bounty = 5, count = 1, damage = 12, placeTower = true, immediate = false } = {}) {
  const content = {
    enemies: { grunt: { speed: 15, hp: 12, bounty, leakDamage: 1 } },
    waves: [{ groups: [{ enemy: 'grunt', count, interval: 0, delay: immediate ? 0 : 1 / 30 }] }],
    towers: {
      splash: { name: 'Splash', cost: 10, range: 3, damage, shotsPerSecond: 1, splashRadius: 1 },
    },
    towerUpgrades: { costPercents: [60, 100], damageMultiplier: 1, rangeBonus: 0 },
    startingMoney: 100,
    startingLives: 100,
    waveClearReward: 0,
    heightRangeBonus: 0,
  } satisfies Content;
  const level = parseLevel(['S=G', '...']);
  const initial = createGame(content, level);
  const enemies = createEnemyLayer(new PerspectiveCamera());
  const feedback = createCombatFeedback(enemies);
  let previous = initial;
  const first = step(initial, [
    { type: 'startWave', tick: 0 },
    ...(placeTower
      ? [{ type: 'placeTower', cell: cellIndex(3, 0, 1), kind: 'splash', tick: 0 } as const]
      : []),
  ]);
  feedback.onEvents(first.events, initial, 0);
  let current = first.state;
  enemies.update(previous, current, 1);
  return {
    feedback,
    advance(gameTime: number) {
      previous = current;
      const result = step(previous, []);

      current = result.state;
      feedback.onEvents(result.events, previous, gameTime);
      enemies.observe(current);
      enemies.update(previous, current, 1);
    },
  };
}

it('shows the bounty at the defeated enemy’s last drawn position', () => {
  const { feedback, advance } = setup();
  advance(100);
  const { bounties } = feedback.update(100, false);
  expect(bounties.map(({ text }) => text)).toEqual(['+5']);
  expect(bounties[0]?.position.toArray()).toEqual([0, 0.8, 0]);
});

it('shows a separate bounty when one splash shot kills multiple enemies at the entrance', () => {
  const { feedback } = setup({ count: 2, immediate: true });
  expect(feedback.update(0, false).bounties.map(({ text }) => text)).toEqual(['+5', '+5']);
});

it('does not show a bounty for a zero-reward kill', () => {
  const { feedback, advance } = setup({ bounty: 0 });
  advance(100);
  expect(feedback.update(100, false).bounties).toEqual([]);
});

it('caps the number of visible fragments after many simultaneous kills', () => {
  const { feedback, advance } = setup({ count: 20 });
  advance(100);
  const frame = feedback.update(100, false);
  expect(frame.bounties).toHaveLength(20);
  expect(feedback.group.children).toHaveLength(48);
});

it('triggers one shake for several leaks in the same tick', () => {
  const single = setup({ placeTower: false });
  const simultaneous = setup({ placeTower: false, count: 3 });
  for (const session of [single, simultaneous]) {
    for (const time of [100, 133, 166, 199]) session.advance(time);
  }
  const first = single.feedback.update(230, false);
  const multiple = simultaneous.feedback.update(230, false);
  expect(first.shake.length()).toBeGreaterThan(0);
  expect(multiple.shake.toArray()).toEqual(first.shake.toArray());
  expect(multiple.castleFlash).toBeGreaterThan(0);
  expect(multiple.lifePulse).toBeGreaterThan(0);
  const reduced = simultaneous.feedback.update(230, true);
  expect(reduced.shake.toArray()).toEqual([0, 0]);
  expect(reduced.castleFlash).toBe(multiple.castleFlash);
  expect(reduced.lifePulse).toBe(multiple.lifePulse);
});

it('flashes only the primary target of a splash shot and clears the flash after 100ms', () => {
  const { feedback, advance } = setup({ count: 2, damage: 4 });
  advance(100);
  expect(feedback.update(100, false).hitFlash(1 as EnemyId)).toBe(1);
  expect(feedback.update(100, false).hitFlash(2 as EnemyId)).toBe(0);
  expect(feedback.update(200, false).hitFlash(1 as EnemyId)).toBe(0);
});

it('keeps feedback fixed at the same game time and removes it after its lifetime', () => {
  const { feedback, advance } = setup();
  advance(100);
  const before = feedback.update(220, false);
  const position = feedback.group.children[0]?.position.clone();
  const paused = feedback.update(220, false);
  expect(paused.bounties).toEqual(before.bounties);
  expect(feedback.group.children[0]?.position).toEqual(position);
  expect(feedback.update(820, false).bounties).toEqual([]);
  expect(feedback.group.children).toHaveLength(0);
});
