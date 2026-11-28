import { expect, it } from 'vitest';
import { content } from '../content/content';
import { level } from '../content/level';
import { applyCommands, createGame, parseLevel, step } from '../core';
import { cellIndex } from '../core/level';
import { directCommandSound, directImpact, directSound } from './director';

it('plays a horn that ducks music when a startWave command opens a wave', () => {
  const preparation = createGame(content, level);
  const start = { type: 'startWave', tick: preparation.tick } as const;
  const opened = applyCommands(preparation, [start]);

  expect(directCommandSound(start, opened.events)).toEqual({
    kind: 'effect',
    sound: 'war-horns',
    bus: 'effects',
    pitchSemitones: 0,
    duck: true,
  });

  const rejected = applyCommands(opened.state, [start]);
  expect(directCommandSound(start, rejected.events)).toEqual({
    kind: 'effect',
    sound: 'ui-error-03',
    bus: 'ui',
    pitchSemitones: 0,
    duck: false,
  });
});

const wave = { groups: [{ enemy: 'grunt', count: 1, interval: 1, delay: 0 }] };

it.each([
  {
    outcome: 'wave clears',
    waves: [wave, wave],
    music: { kind: 'music', track: 'preparation' },
    jingle: { sound: 'jingle-steel-10', duck: false },
  },
  {
    outcome: 'campaign is won',
    waves: [wave],
    music: { kind: 'stopMusic' },
    jingle: { sound: 'jingle-steel-02', duck: true },
  },
])(
  'plays the leak horn and the applicable jingle when the $outcome',
  ({ waves, music, jingle }) => {
    const initial = createGame(
      {
        ...content,
        enemies: { ...content.enemies, grunt: { ...content.enemies.grunt, speed: 30 } },
        waves,
      },
      parseLevel(['SG']),
    );
    const active = applyCommands(initial, [{ type: 'startWave', tick: 0 }]).state;
    const result = step(active, []);

    expect(directSound(result.events, active, result.state)).toEqual([
      {
        kind: 'effect',
        sound: 'leak-horn-1',
        bus: 'effects',
        pitchSemitones: 0,
        duck: true,
        duckRecoverySeconds: 0.4,
      },
      { kind: 'effect', bus: 'effects', pitchSemitones: 0, ...jingle },
      music,
    ]);
  },
);

const combatLevel = parseLevel(['S===G', '.....']);
const combatInitial = createGame(
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
  combatLevel,
);
const placed = step(combatInitial, [
  { type: 'placeTower', kind: 'basic', cell: cellIndex(combatLevel.width, 0, 1), tick: 0 },
  { type: 'placeTower', kind: 'sniper', cell: cellIndex(combatLevel.width, 2, 1), tick: 0 },
  { type: 'placeTower', kind: 'splash', cell: cellIndex(combatLevel.width, 1, 1), tick: 0 },
]).state;
const combatOpened = step(placed, [{ type: 'startWave', tick: placed.tick }]);
const shots = combatOpened.events.filter(({ type }) => type === 'shot');
const [grunt, runner] = combatOpened.state.enemies;
if (grunt === undefined || runner === undefined) throw new Error('No wave targets');

function effect(sound: string, pitchSemitones = 0) {
  return {
    kind: 'effect',
    sound,
    bus: 'effects',
    pitchSemitones,
    duck: false,
    discardWhenLate: true,
  };
}

it('plays only the archer and ballista firing sounds when the three towers shoot', () => {
  expect(shots).toHaveLength(3);
  expect(directSound(shots, combatOpened.state, combatOpened.state)).toEqual([
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
  expect(directImpact(hit)).toEqual([effect(sound)]);
});

it.each([
  ['grunt', 'bone-break-3', 0],
  ['runner', 'bone-break-3', 2],
  ['tank', 'bone-break-3', -4],
  ['boss', 'lich-shade-1', 0],
])('plays the %s death sound only with its lethal impact', (enemyKind, sound, pitch) => {
  const killed = { type: 'killed' as const, enemyId: grunt.id, enemyKind, bounty: 5 };
  const hit = { towerKind: 'basic', target: { id: grunt.id, kind: enemyKind }, lethal: true };
  expect(directSound([killed], combatOpened.state, combatOpened.state)).toEqual([]);
  expect(directImpact(hit)).toEqual([effect('archer-hit-soft'), effect(sound, pitch)]);
});

it('plays one spell impact and the death sound for each lethal splash recipient', () => {
  const hit = {
    towerKind: 'splash',
    target: { id: grunt.id, kind: 'tank' },
    lethal: false,
    splashKills: [runner],
  };
  expect(directImpact(hit)).toEqual([effect('spell-fire-2'), effect('bone-break-3', 2)]);
});
