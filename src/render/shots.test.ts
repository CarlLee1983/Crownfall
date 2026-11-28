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
  { ramp = false, twoTowers = false }: { ramp?: boolean; twoTowers?: boolean } = {},
) {
  const content = {
    enemies: { grunt: { speed: 7.5, hp: 12, bounty: 5, leakDamage: 1 } },
    waves: [{ groups: [{ enemy: 'grunt', count: 1, interval: 1, delay: 0 }] }],
    towers: {
      sniper: {
        name: 'Legacy',
        cost: 10,
        range: 2,
        damage,
        shotsPerSecond: 1,
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
  const kind = 'sniper';
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

function archerBattle(layout: string[], speed = 30, damage = 12) {
  let previous = createGame(
    {
      enemies: { grunt: { speed, hp: 12, bounty: 5, leakDamage: 1 } },
      waves: [{ groups: [{ enemy: 'grunt', count: 1, interval: 0, delay: 0 }] }],
      towers: {
        basic: { name: 'Archer', cost: 10, range: 10, damage, shotsPerSecond: 1 },
        sniper: { name: 'Ballista', cost: 10, range: 10, damage, shotsPerSecond: 1 },
        splash: { name: 'Mage', cost: 10, range: 10, damage, shotsPerSecond: 1, splashRadius: 0.8 },
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

it('aims at the rounded position the moving enemy draws at the moment of impact', () => {
  const battle = archerBattle(['S=.', '.G.'], 7.5, 4);
  battle.advance(0);
  battle.advance(33);
  battle.advance(100, [0, 1]);
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
});

it('presenting a legacy shot cannot skip earlier damage from an airborne arrow', () => {
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

it('anchors the expanding splash ring at the rounded target on the ramp at arrival', () => {
  const battle = archerBattle(['S^.', '.g.'], 7.5, 4);
  battle.advance(0);
  battle.advance(33);
  battle.advance(100, [0, 1], 'splash');
  const splashRing = () =>
    battle.shots.group.children.find(
      (child) => child instanceof Mesh && child.geometry instanceof RingGeometry,
    );
  battle.draw(150, 0.25);
  expect(splashRing()).toBeUndefined();
  const impact = battle.draw(250, 0.5);
  expect(impact.hitFlash(battle.target.id)).toBeCloseTo(0.36);
  battle.shots.update(250);
  const ring = splashRing();
  expect(ring?.layers.mask).toBe(1);
  expect(ring?.position.toArray()).toEqual([
    expect.closeTo(0.777785, 5),
    expect.closeTo(0.343385, 5),
    expect.closeTo(-0.044359, 5),
  ]);
  expect(ring?.scale.x).toBeCloseTo(0.224);
  battle.shots.update(351);
  expect(ring?.scale.x).toBeCloseTo(0.512);
  battle.shots.update(452);
  expect(splashRing()).toBeUndefined();
});

function mageBattle() {
  let previous = createGame(
    {
      enemies: {
        still: { speed: 0, hp: 12, bounty: 5, leakDamage: 1 },
        grunt: { speed: 11.25, hp: 10, bounty: 4, leakDamage: 1 },
        runner: { speed: 22.5, hp: 4, bounty: 3, leakDamage: 1 },
      },
      waves: [
        {
          groups: ['still', 'grunt', 'runner'].map((enemy) => ({
            enemy,
            count: 1,
            interval: 0,
            delay: 0,
          })),
        },
      ],
      towers: {
        basic: { name: 'Archer', cost: 10, range: 1.25, damage: 6, shotsPerSecond: 1 },
        splash: {
          name: 'Mage',
          cost: 10,
          range: 10,
          damage: 4,
          shotsPerSecond: 1,
          splashRadius: 0.75,
        },
      },
      towerUpgrades: { costPercents: [60, 100], damageMultiplier: 1, rangeBonus: 0 },
      startingMoney: 100,
      startingLives: 10,
      waveClearReward: 0,
      heightRangeBonus: 0,
    },
    parseLevel(['S=======G', '.........']),
  );
  let current = step(previous, [{ type: 'startWave', tick: 0 }]).state;
  const [unaffected, survivor, defeated] = current.enemies;
  if (unaffected === undefined || survivor === undefined || defeated === undefined) {
    throw new Error('Expected three enemies');
  }
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
    sounds,
    shots,
    survivor,
    defeated,
    unaffected,
    advance(at: number, ...towers: [kind: string, x: number][]) {
      previous = current;
      const result = step(
        previous,
        towers.map(([kind, x]) => ({
          type: 'placeTower',
          kind,
          cell: cellIndex(current.level.width, x, 1),
          tick: previous.tick,
        })),
      );
      current = result.state;
      combat.onEvents(shots.onEvents(result.events, current, at), previous, at);
      enemies.observe(current);
      return result;
    },
    draw(at: number, alpha = 1) {
      shots.advanceFlights(at, alpha);
      const feedback = combat.update(at, false);
      enemies.update(previous, current, alpha, feedback.hitFlash, at, {
        hp: shots.displayHp,
        reaction: feedback.reaction,
      });
      shots.update(at);
      return feedback;
    },
  };
}

it('presents a spell orb’s wounded and defeated targets together on arrival', () => {
  const battle = mageBattle();
  const { enemies, unaffected, survivor, defeated, shots, sounds } = battle;
  battle.advance(67);
  const { state, events } = battle.advance(100, ['splash', 2]);
  expect(events).toMatchObject([
    { type: 'shot', target: { id: defeated.id } },
    { type: 'killed', enemyId: defeated.id, bounty: 3 },
  ]);
  expect(state.money).toBe(93);
  expect(state.enemies.map(({ hp }) => hp)).toEqual([12, 6]);
  expect(battle.draw(150).bounties).toEqual([]);
  expect(enemies.targetPosition(defeated.id, new Vector3())).toBeDefined();
  expect(shots.displayHp(defeated.id)).toBe(4);
  expect(shots.displayHp(survivor.id)).toBe(10);
  expect(sounds).toEqual([]);

  const arrived = battle.draw(250);
  expect(arrived.bounties).toMatchObject([{ id: defeated.id, text: '+3' }]);
  expect(arrived.reaction(defeated.id)?.hp).toBe(0);
  expect(arrived.reaction(survivor.id)?.recoil.length()).toBeCloseTo(0.035);
  expect(shots.displayHp(survivor.id) ?? state.enemies[1]?.hp).toBe(6);
  expect(arrived.hitFlash(defeated.id)).toBeCloseTo(0.36);
  expect(arrived.hitFlash(survivor.id)).toBeCloseTo(0.36);
  expect(arrived.hitFlash(unaffected.id)).toBe(0);
  expect(arrived.reaction(unaffected.id)).toBeUndefined();
  expect(sounds).toEqual([
    { towerKind: 'splash', target: { id: defeated.id, kind: 'runner' }, lethal: true },
  ]);
  const survivorX = enemies.targetPosition(survivor.id, new Vector3())?.x ?? 0;
  battle.advance(267);
  battle.draw(267);
  expect(enemies.targetPosition(survivor.id, new Vector3())?.x).toBeGreaterThan(survivorX);
  expect(battle.draw(321).hitFlash(survivor.id)).toBeGreaterThan(0);
  expect(battle.draw(322).hitFlash(survivor.id)).toBe(0);
  expect(battle.draw(335).bounties.map(({ text }) => text)).toEqual(['+3']);
  expect(enemies.targetPosition(defeated.id, new Vector3())).toBeUndefined();
});

it('presents secondary splash damage before the nearer arrow that kills that enemy', () => {
  const battle = mageBattle();
  const { enemies, survivor, defeated, shots, sounds } = battle;
  battle.advance(67);
  battle.advance(100, ['splash', 8]);
  const { state } = battle.advance(133, ['basic', 1]);
  expect(state.enemies.map(({ kind }) => kind)).toEqual(['still']);
  expect(state.money).toBe(87);
  expect(battle.draw(250).bounties).toEqual([]);
  expect(shots.displayHp(survivor.id)).toBe(10);
  expect(sounds).toEqual([]);

  const splash = battle.draw(550);
  expect(shots.displayHp(survivor.id)).toBe(6);
  expect(splash.hitFlash(survivor.id)).toBeCloseTo(0.36);
  expect(splash.bounties.map(({ id }) => id)).toEqual([defeated.id]);
  expect(enemies.targetPosition(survivor.id, new Vector3())).toBeDefined();
  expect(battle.draw(587).bounties.map(({ id }) => id)).toEqual([defeated.id]);

  const arrow = battle.draw(588);
  expect(arrow.reaction(survivor.id)?.hp).toBe(0);
  expect(arrow.bounties.map(({ id, text }) => [id, text])).toEqual([
    [defeated.id, '+3'],
    [survivor.id, '+4'],
  ]);
  expect(sounds.map(({ towerKind, target, lethal }) => [towerKind, target.id, lethal])).toEqual([
    ['splash', defeated.id, true],
    ['basic', survivor.id, true],
  ]);
  expect(battle.draw(675).bounties.map(({ id }) => id)).toEqual([defeated.id, survivor.id]);
  expect(enemies.targetPosition(survivor.id, new Vector3())).toBeUndefined();
});

it('waits for an arrow before the same enemy dies as a secondary spell target', () => {
  const battle = mageBattle();
  const { survivor, defeated, shots, sounds } = battle;
  battle.advance(67);
  battle.advance(100, ['basic', 0], ['splash', 2]);
  expect(battle.draw(150).bounties).toEqual([]);

  const arrow = battle.draw(250);
  expect(arrow.bounties).toEqual([]);
  expect(arrow.hitFlash(survivor.id)).toBeCloseTo(0.36);
  expect(arrow.hitFlash(defeated.id)).toBe(0);
  expect(shots.displayHp(survivor.id)).toBe(4);
  expect(battle.draw(287).bounties).toEqual([]);

  const orb = battle.draw(288);
  expect(orb.bounties.map(({ id, text }) => [id, text])).toEqual([
    [survivor.id, '+4'],
    [defeated.id, '+3'],
  ]);
  expect(sounds).toEqual([
    { towerKind: 'basic', target: { id: survivor.id, kind: 'grunt' }, lethal: false },
    {
      towerKind: 'splash',
      target: { id: defeated.id, kind: 'runner' },
      lethal: true,
      splashKills: [{ id: survivor.id, kind: 'grunt' }],
    },
  ]);
});
