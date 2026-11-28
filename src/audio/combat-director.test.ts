import { expect, it } from 'vitest';
import { content } from '../content/content';
import { createGame, parseLevel, step } from '../core';
import { cellIndex } from '../core/level';
import { directSound } from './director';

const level = parseLevel(['S===G', '.....']);
const initial = createGame(
  {
    ...content,
    startingMoney: 1000,
    waves: [
      {
        groups: [
          { enemy: 'grunt', count: 1, interval: 1, delay: 0 },
          { enemy: 'runner', count: 1, interval: 1, delay: 0 },
        ],
      },
    ],
    enemies: { ...content.enemies, grunt: { ...content.enemies.grunt, hp: 1000 } },
  },
  level,
);
const placed = step(initial, [
  { type: 'placeTower', kind: 'basic', cell: cellIndex(level.width, 0, 1), tick: 0 },
  { type: 'placeTower', kind: 'sniper', cell: cellIndex(level.width, 2, 1), tick: 0 },
  { type: 'placeTower', kind: 'splash', cell: cellIndex(level.width, 1, 1), tick: 0 },
]).state;
const opened = step(placed, [{ type: 'startWave', tick: placed.tick }]);
const shots = opened.events.filter(({ type }) => type === 'shot');
const [grunt, runner] = opened.state.enemies;
if (grunt === undefined || runner === undefined) throw new Error('No wave targets');

function effect(sound: string, pitchSemitones = 0) {
  return { kind: 'effect', sound, bus: 'effects', pitchSemitones, duck: false };
}

it('plays only the archer and ballista firing sounds when the three towers shoot', () => {
  expect(shots).toHaveLength(3);
  expect(directSound(shots, opened.state, opened.state)).toEqual([
    effect('longbow-soft'),
    effect('crossbow-1'),
  ]);
});

it.each([
  ['basic', 'archer-hit-soft'],
  ['sniper', 'ballista-hit-plate'],
  ['splash', 'spell-fire-2'],
])('plays the %s impact when the shot layer presents it', (towerKind, sound) => {
  const hit = { towerKind, target: grunt, lethal: false };
  expect(directSound([], opened.state, opened.state, [hit])).toEqual([effect(sound)]);
});

it.each([
  ['grunt', 'bone-break-3', 0],
  ['runner', 'bone-break-3', 2],
  ['tank', 'bone-break-3', -4],
  ['boss', 'lich-shade-1', 0],
])('plays the %s death sound only with its lethal impact', (enemyKind, sound, pitch) => {
  const killed = { type: 'killed' as const, enemyId: grunt.id, enemyKind, bounty: 5 };
  const hit = { towerKind: 'basic', target: { id: grunt.id, kind: enemyKind }, lethal: true };
  expect(directSound([killed], opened.state, opened.state)).toEqual([]);
  expect(directSound([killed], opened.state, opened.state, [hit])).toEqual([
    effect('archer-hit-soft'),
    effect(sound, pitch),
  ]);
});

it('plays one spell impact and the death sound for each lethal splash recipient', () => {
  const hit = {
    towerKind: 'splash',
    target: { id: grunt.id, kind: 'tank' },
    lethal: false,
    splashKills: [runner],
  };
  expect(directSound([], opened.state, opened.state, [hit])).toEqual([
    effect('spell-fire-2'),
    effect('bone-break-3', 2),
  ]);
});
