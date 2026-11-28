import { Mesh, PerspectiveCamera, RingGeometry, Vector3 } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { expect, it } from 'vitest';
import { type Content, createGame, parseLevel, step } from '../core';
import { cellIndex } from '../core/level';
import { createBuildLayer } from './build-layer';
import { createCombatFeedback } from './combat-feedback';
import { createEnemyLayer } from './enemies';
import { createShotLayer, type PresentedImpact } from './shots';

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
      [splashRadius === undefined ? 'legacy' : 'splash']: {
        name: 'Legacy',
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
  const shots = createShotLayer(enemies, createBuildLayer().towerHeight);
  const level = parseLevel(ramp ? ['S^.', '.g.'] : ['S=.', '.G.']);
  const initial = createGame(content, level);
  const first = step(initial, [{ type: 'startWave', tick: 0 }]).state;
  const second = step(first, []).state;
  const before = step(second, []).state;
  enemies.observe(before);
  const kind = splashRadius === undefined ? 'legacy' : 'splash';
  const { state, events } = step(before, [
    { type: 'placeTower', kind, cell: cellIndex(3, 0, 1), tick: before.tick },
    ...(twoTowers
      ? [
          {
            type: 'placeTower',
            kind,
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

it('keeps the shot line and splash effect on the world layer', () => {
  const { line, shots } = fire(4, { splashRadius: 1 });
  const splash = shots.group.children.find((child) => child instanceof Mesh);
  expect(line.layers.mask).toBe(1);
  expect(splash?.layers.mask).toBe(1);
});

it('keeps the line endpoint on the interpolated enemy body as it moves', () => {
  const { enemies, shots, before, state, endpoint } = fire(4);
  enemies.update(before, state, 0.5);
  shots.update(100);
  expect(endpoint()).toEqual([
    expect.closeTo(0.777785, 5),
    expect.closeTo(0.25, 5),
    expect.closeTo(0.084265, 5),
  ]);

  const next = step(state, []).state;
  enemies.update(state, next, 0.5);
  shots.update(130);
  expect(endpoint()).toEqual([
    expect.closeTo(0.915735, 5),
    expect.closeTo(0.25, 5),
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
  { surface: 'flat ground', ramp: false, y: 0.25, z: 0.03806 },
  { surface: 'a ramp', ramp: true, y: 0.537209, z: -0.090564 },
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
    expect.closeTo(0.564932, 5),
    expect.closeTo(-0.044359, 5),
  ]);
  const ring = shots.group.children.find(
    (child) => child instanceof Mesh && child.geometry instanceof RingGeometry,
  );
  expect(ring?.position.toArray()).toEqual([0.75, expect.closeTo(0.365, 5), 0]);
  expect(ring?.scale.toArray()).toEqual([0.8, 1, 0.8]);
});

function archerBattle(layout: string[], speed = 30, damage = 12) {
  let previous = createGame(
    {
      enemies: { grunt: { speed, hp: 12, bounty: 5, leakDamage: 1 } },
      waves: [{ groups: [{ enemy: 'grunt', count: 1, interval: 0, delay: 0 }] }],
      towers: {
        basic: { name: 'Archer', cost: 10, range: 10, damage, shotsPerSecond: 1 },
        sniper: { name: 'Ballista', cost: 10, range: 10, damage, shotsPerSecond: 1 },
      },
      towerUpgrades: { costPercents: [60, 100], damageMultiplier: 1, rangeBonus: 0 },
      startingMoney: 100,
      startingLives: 10,
      waveClearReward: 0,
      heightRangeBonus: 0,
    },
    parseLevel(layout),
  );
  let current = step(previous, [{ type: 'startWave', tick: 0 }]).state;
  const target = current.enemies[0];
  if (target === undefined) throw new Error('No archer target');
  const enemies = createEnemyLayer(new PerspectiveCamera());
  const combat = createCombatFeedback(enemies);
  const sounds: PresentedImpact[] = [];
  const shots = createShotLayer(enemies, createBuildLayer().towerHeight, {
    onImpact: (impact) => sounds.push(impact),
    onDelayedImpact: combat.onImpact,
  });
  enemies.update(previous, current, 1);
  return {
    enemies,
    combat,
    shots,
    sounds,
    target,
    advance(at: number, tower?: [x: number, y: number], kind = 'basic') {
      previous = current;
      const result = step(
        previous,
        tower === undefined
          ? []
          : [
              {
                type: 'placeTower',
                kind,
                cell: cellIndex(current.level.width, ...tower),
                tick: previous.tick,
              },
            ],
      );
      current = result.state;
      combat.onEvents(shots.onEvents(result.events, current, at), previous, at);
      enemies.observe(current);
      return current;
    },
    draw(at: number, alpha = 1) {
      shots.advanceFlights(at, alpha);
      const feedback = combat.update(at, false);
      enemies.update(previous, current, alpha, feedback.hitFlash, at, {
        hp: shots.displayHp,
        reaction: feedback.reaction,
      });
      return feedback;
    },
  };
}

it('keeps a defeated enemy and its health visible until the arrow lands', () => {
  const battle = archerBattle(['S=G', '...']);
  const { enemies, sounds, target, combat, shots } = battle;
  expect(battle.advance(100, [1, 1]).enemies).toEqual([]);
  expect(battle.draw(150).bounties).toEqual([]);
  expect(enemies.targetPosition(target.id, new Vector3())).toBeDefined();
  expect(shots.displayHp(target.id)).toBe(12);
  expect(sounds).toEqual([]);

  const impact = battle.draw(192);
  expect(impact.bounties.map(({ text }) => text)).toEqual(['+5']);
  expect(impact.hitFlash(target.id)).toBeCloseTo(0.36);
  expect(impact.reaction(target.id)?.recoil.length()).toBeCloseTo(0.035);
  expect(impact.reaction(target.id)?.hp).toBe(0);
  expect(sounds).toMatchObject([
    { towerKind: 'basic', target: { id: target.id, kind: 'grunt' }, lethal: true },
  ]);
  expect(battle.draw(263).hitFlash(target.id)).toBeGreaterThan(0);
  expect(battle.draw(264).hitFlash(target.id)).toBe(0);
  expect(battle.draw(277).bounties.map(({ text }) => text)).toEqual(['+5']);
  expect(enemies.targetPosition(target.id, new Vector3())).toBeUndefined();
  expect(sounds).toHaveLength(1);
  expect(combat.group.children).toHaveLength(3);
  battle.draw(422);
  expect(combat.group.children).toHaveLength(0);
});

it('shows a distant bolt’s damage before a nearer arrow kills the same enemy', () => {
  const battle = archerBattle(['S=====G', '.......'], 0, 6);
  const { sounds, target, shots } = battle;
  const damaged = battle.advance(100, [6, 1], 'sniper');
  expect(damaged.enemies[0]?.hp).toBe(6);
  expect(damaged.money).toBe(90);
  const defeated = battle.advance(133, [0, 1]);
  expect(defeated.enemies).toEqual([]);
  expect(defeated.money).toBe(85);
  expect(defeated.lives).toBe(10);

  // The near arrow's 92ms flight ends while the distant bolt is still in the air.
  expect(battle.draw(240).bounties).toEqual([]);
  expect(shots.displayHp(target.id)).toBe(12);
  expect(sounds).toEqual([]);

  const boltImpact = battle.draw(280);
  expect(boltImpact.bounties).toEqual([]);
  expect(boltImpact.hitFlash(target.id)).toBeCloseTo(0.36);
  expect(boltImpact.reaction(target.id)?.recoil.length()).toBeCloseTo(0.035);
  expect(shots.displayHp(target.id)).toBe(6);
  expect(sounds.map(({ towerKind, lethal }) => [towerKind, lethal])).toEqual([['sniper', false]]);
  expect(battle.draw(317).bounties).toEqual([]);
  expect(battle.draw(318).bounties.map(({ text }) => text)).toEqual(['+5']);
  expect(battle.draw(350).bounties.map(({ text }) => text)).toEqual(['+5']);
  expect(sounds.map(({ towerKind, lethal }) => [towerKind, lethal])).toEqual([
    ['sniper', false],
    ['basic', true],
  ]);
});

it('shows the first arrow’s damage before the nearer second arrow kills the same enemy', () => {
  const battle = archerBattle(['S=====G', '.......'], 0, 6);
  const { sounds, target, shots } = battle;
  expect(battle.advance(100, [6, 1]).enemies[0]?.hp).toBe(6);
  expect(battle.advance(133, [0, 1]).enemies).toEqual([]);

  // The near arrow is due by 225ms, well before the far arrow is due.
  expect(battle.draw(240).bounties).toEqual([]);
  expect(shots.displayHp(target.id)).toBe(12);
  expect(sounds).toEqual([]);
  expect(battle.draw(400).bounties).toEqual([]);
  expect(shots.displayHp(target.id)).toBe(6);
  expect(sounds.map(({ lethal }) => lethal)).toEqual([false]);
  expect(battle.draw(437).bounties).toEqual([]);
  expect(battle.draw(438).bounties.map(({ text }) => text)).toEqual(['+5']);
  expect(sounds.map(({ lethal }) => lethal)).toEqual([false, true]);
});

it.each(['basic', 'sniper'])(
  '%s projectile aims at the rounded position of the moving enemy at impact',
  (kind) => {
    const battle = archerBattle(['S=.', '.G.'], 7.5, 4);
    battle.advance(0);
    battle.advance(33);
    battle.advance(100, [0, 1], kind);
    const pose = battle.draw(150, 0.25);
    expect(pose.hitFlash(battle.target.id)).toBe(0);
    expect(battle.enemies.targetPosition(battle.target.id, new Vector3())?.toArray()).toEqual([
      expect.closeTo(0.735698, 5),
      expect.closeTo(0.25, 5),
      expect.closeTo(0.059039, 5),
    ]);
    const impact = battle.draw(192, 0.5);
    const recoil = impact.reaction(battle.target.id)?.recoil;
    expect(recoil?.x).toBeGreaterThan(0);
    expect(recoil?.z).toBeLessThan(0);
    expect((recoil?.x ?? 0) / -(recoil?.z ?? 1)).toBeCloseTo(0.84936, 4);
    expect(battle.sounds.map(({ lethal }) => lethal)).toEqual([false]);
  },
);

it('shows a distant arrow’s damage before a nearer bolt kills the same enemy', () => {
  const battle = archerBattle(['S=====G', '.......'], 0, 6);
  battle.advance(100, [6, 1]);
  battle.advance(133, [0, 1], 'sniper');
  expect(battle.draw(240).bounties).toEqual([]);
  expect(battle.sounds).toEqual([]);
  expect(battle.draw(400).bounties).toEqual([]);
  expect(battle.draw(438).bounties.map(({ text }) => text)).toEqual(['+5']);
  expect(battle.sounds.map(({ towerKind, lethal }) => [towerKind, lethal])).toEqual([
    ['basic', false],
    ['sniper', true],
  ]);
});
