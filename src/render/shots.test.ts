import { Mesh, PerspectiveCamera, RingGeometry } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { expect, it } from 'vitest';
import { type Content, createGame, parseLevel, step } from '../core';
import { cellIndex } from '../core/level';
import { createEnemyLayer } from './enemies';
import { createShotLayer } from './shots';

function fire(
  damage: number,
  {
    ramp = false,
    splashRadius,
    twoTowers = false,
  }: { ramp?: boolean; splashRadius?: number; twoTowers?: boolean } = {},
) {
  const content = {
    enemies: { grunt: { speed: 7.5, hp: 12, bounty: 5, leakDamage: 1 } },
    waves: [{ groups: [{ enemy: 'grunt', count: 1, interval: 1, delay: 0 }] }],
    towers: {
      basic: {
        name: 'Basic',
        cost: 10,
        range: 2,
        damage,
        shotsPerSecond: 1,
        ...(splashRadius === undefined ? {} : { splashRadius }),
      },
    },
    towerUpgrades: { costPercents: [60, 100], damageMultiplier: 1, rangeBonus: 0 },
    startingMoney: 100,
    startingLives: 10,
    waveClearReward: 0,
    heightRangeBonus: 0,
  } satisfies Content;
  const enemies = createEnemyLayer(new PerspectiveCamera());
  const shots = createShotLayer(enemies);
  const level = parseLevel(ramp ? ['S^.', '.g.'] : ['S=.', '.G.']);
  const initial = createGame(content, level);
  const first = step(initial, [{ type: 'startWave', tick: 0 }]).state;
  const second = step(first, []).state;
  const before = step(second, []).state;
  enemies.observe(before);
  const { state, events } = step(before, [
    { type: 'placeTower', kind: 'basic', cell: cellIndex(3, 0, 1), tick: before.tick },
    ...(twoTowers
      ? [
          {
            type: 'placeTower',
            kind: 'basic',
            cell: cellIndex(3, 2, 0),
            tick: before.tick,
          } as const,
        ]
      : []),
  ]);
  shots.onEvents(events, state, 100);
  const line = shots.group.children.find((child) => child instanceof Line2);
  if (line === undefined) throw new Error('No shot line');
  const end = line.geometry.getAttribute('instanceEnd');
  return {
    enemies,
    shots,
    before,
    state,
    line,
    endpoint: () => [end.getX(0), end.getY(0), end.getZ(0)],
  };
}

it('keeps the line endpoint on the interpolated enemy body as it moves', () => {
  const { enemies, shots, before, state, endpoint } = fire(4);
  enemies.update(before, state, 0.5);
  shots.update(100);
  expect(endpoint()).toEqual([
    expect.closeTo(0.777785, 5),
    expect.closeTo(0.2, 5),
    expect.closeTo(0.084265, 5),
  ]);

  const next = step(state, []).state;
  enemies.update(state, next, 0.5);
  shots.update(130);
  expect(endpoint()).toEqual([
    expect.closeTo(0.915735, 5),
    expect.closeTo(0.2, 5),
    expect.closeTo(0.222215, 5),
  ]);
});

it('only shows the lethal impact for the tower that lands the killing shot in that tick', () => {
  const { enemies, shots, before, state } = fire(6, { twoTowers: true });
  enemies.update(before, state, 0.5);
  shots.update(100);
  const lines = shots.group.children.filter((child) => child instanceof Line2);
  expect(lines.map((line) => line.visible)).toEqual([false, true]);
});

it.each([
  { surface: 'flat ground', ramp: false, y: 0.2, z: 0.03806 },
  { surface: 'a ramp', ramp: true, y: 0.494335, z: -0.064839 },
])('keeps a lethal shot at the rounded body center on $surface', ({ ramp, y, z }) => {
  const { enemies, shots, before, state, line, endpoint } = fire(12, { ramp });
  enemies.update(before, state, 0.5);
  shots.update(100);
  expect(enemies.group.children).toHaveLength(0);
  expect(line.visible).toBe(true);
  expect(endpoint()).toEqual([
    expect.closeTo(0.691342, 5),
    expect.closeTo(y, 5),
    expect.closeTo(z, 5),
  ]);
});

it('hides a tracking beam when the displayed enemy leaks before the beam expires', () => {
  const { enemies, shots, before, state, line } = fire(4);
  enemies.update(before, state, 0.5);
  shots.update(100);
  expect(line.visible).toBe(true);

  let previous = state;
  let current = state;
  for (let tick = 0; tick < 4; tick++) {
    previous = current;
    current = step(current, []).state;
    enemies.observe(current);
  }
  enemies.update(previous, current, 0.5);
  shots.update(235);
  expect(enemies.group.children).toHaveLength(0);
  expect(line.visible).toBe(false);
});

it('targets the inclined model and anchors splash at the simulation impact on the ramp', () => {
  const { enemies, shots, before, state, endpoint } = fire(4, { ramp: true, splashRadius: 0.8 });
  enemies.update(before, state, 0.5);
  shots.update(100);
  expect(endpoint()).toEqual([
    expect.closeTo(0.777785, 5),
    expect.closeTo(0.522058, 5),
    expect.closeTo(-0.018634, 5),
  ]);
  const ring = shots.group.children.find(
    (child) => child instanceof Mesh && child.geometry instanceof RingGeometry,
  );
  expect(ring?.position.toArray()).toEqual([0.75, expect.closeTo(0.365, 5), 0]);
  expect(ring?.scale.toArray()).toEqual([0.8, 1, 0.8]);
});
