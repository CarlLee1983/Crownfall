import {
  AnimationClip,
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { expect, it } from 'vitest';
import { createGame, parseLevel, step } from '../core';
import { cellIndex } from '../core/level';
import { createBuildLayer } from './build-layer';
import { createCombatFeedback } from './combat-feedback';
import { createEnemyLayer } from './enemies';
import { OVERLAY_LAYER } from './layers';
import { createShotLayer, type PresentedImpact } from './shots';

function archerBattle(
  layout: string[],
  speed = 30,
  damage = 12,
  startingLives = 10,
  models?: Parameters<typeof createEnemyLayer>[1],
) {
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
      startingLives,
      waveClearReward: 0,
      heightRangeBonus: 0,
    },
    parseLevel(layout),
  );
  let current = step(previous, [{ type: 'startWave', tick: 0 }]).state;
  const target = current.enemies[0];
  if (target === undefined) throw new Error('No archer target');
  const enemies = createEnemyLayer(new PerspectiveCamera(), models);
  const combat = createCombatFeedback(enemies);
  const sounds: PresentedImpact[] = [];
  const shots = createShotLayer(enemies, createBuildLayer().towerHeight, combat, {
    onImpact: (impact) => sounds.push(impact),
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
      combat.onEvents(shots.onEvents(result.events, current, previous, at), previous, at);
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

it('keeps the enemy visible until impact, then collapses and sinks it in place', () => {
  const scene = new Group();
  const bone = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  bone.name = 'bone';
  scene.add(bone);
  const walk = new AnimationClip('Walking_A', 2, []);
  const death = new AnimationClip('Death_C_Skeletons', 2, [
    new NumberKeyframeTrack('bone.position[x]', [0, 2], [0, 2]),
  ]);
  const battle = archerBattle(['S=G', '...'], 30, 12, 10, { grunt: { scene, walk, death } });
  const { enemies, sounds, target, shots } = battle;
  const hasHealthBar = () => {
    let visible = false;
    enemies.group.traverseVisible((object) => {
      visible ||= object.layers.isEnabled(OVERLAY_LAYER);
    });
    return visible;
  };
  expect(battle.advance(100, [1, 1]).enemies).toEqual([]);
  expect(battle.draw(150).bounties).toEqual([]);
  expect(enemies.targetPosition(target.id, new Vector3())).toBeDefined();
  expect(shots.displayHp(target.id)).toBe(12);
  expect(hasHealthBar()).toBe(true);
  expect(sounds).toEqual([]);

  const impact = battle.draw(192);
  expect(impact.bounties.map(({ text }) => text)).toEqual(['+5']);
  expect(impact.hitFlash(target.id)).toBeCloseTo(0.36);
  expect(hasHealthBar()).toBe(false);
  expect(shots.group.children).toHaveLength(0);
  expect(enemies.group.children).toHaveLength(1);
  const fixedPosition = enemies.targetPosition(target.id, new Vector3());
  expect(fixedPosition?.toArray()).toEqual([1, 0.25, 0]);
  expect(sounds).toMatchObject([
    { towerKind: 'basic', target: { id: target.id, kind: 'grunt' }, lethal: true },
  ]);
  expect(battle.draw(263).hitFlash(target.id)).toBeGreaterThan(0);
  expect(battle.draw(264).hitFlash(target.id)).toBe(0);
  const visibleBone = enemies.group.getObjectByName('bone');
  if (visibleBone === undefined) throw new Error('Missing collapsing enemy');
  const bounds = new Box3();
  const top = () => {
    enemies.group.updateMatrixWorld(true);
    return bounds.setFromObject(visibleBone).max.y;
  };
  expect(battle.draw(692, 0.25).bounties.map(({ text }) => text)).toEqual(['+5']);
  expect(visibleBone.position.x).toBeCloseTo(1);
  expect(enemies.targetPosition(target.id, new Vector3())).toEqual(fixedPosition);
  battle.draw(1192, 0.75);
  expect(visibleBone.position.x).toBeCloseTo(2);
  expect(enemies.targetPosition(target.id, new Vector3())).toEqual(fixedPosition);
  const collapseTop = top();
  battle.draw(1342);
  const midSinkTop = top();
  expect(midSinkTop).toBeGreaterThan(0);
  expect(midSinkTop).toBeLessThan(collapseTop);
  expect(visibleBone.position.x).toBeCloseTo(2);
  const sinkPosition = enemies.targetPosition(target.id, new Vector3());
  expect(sinkPosition).toMatchObject({ x: 1, z: 0 });
  expect(hasHealthBar()).toBe(false);
  expect(battle.draw(1491).settling).toBe(true);
  expect(top()).toBeLessThanOrEqual(0);
  expect(enemies.targetPosition(target.id, new Vector3())).toBeDefined();
  expect(battle.draw(1492).settling).toBe(false);
  expect(enemies.targetPosition(target.id, new Vector3())).toBeUndefined();
  expect(sounds).toHaveLength(1);
});

it.each([
  { speed: 30, leakAt: 67, approachX: 1 },
  { speed: 15, leakAt: 133, approachX: 1.5 },
])(
  'shows a pending hit on a leaking enemy and deducts the last life immediately',
  ({ speed, leakAt, approachX }) => {
    const battle = archerBattle(['S=G', '...'], speed, 4, 1);
    let settled = battle.advance(67, [1, 1]);
    for (let at = 100; at <= leakAt; at += 33) {
      battle.draw(at - 1);
      settled = battle.advance(at);
    }
    expect(settled.phase).toBe('defeat');
    expect(settled.lives).toBe(0);
    expect(settled.enemies).toEqual([]);

    const approach = battle.draw(leakAt);
    expect(approach.castleFlash).toBeCloseTo(0.45);
    expect(battle.enemies.targetPosition(battle.target.id, new Vector3())?.x).toBe(approachX);
    expect(battle.shots.displayHp(battle.target.id)).toBe(12);
    expect(battle.sounds).toEqual([]);

    const impact = battle.draw(159);
    expect(impact.hitFlash(battle.target.id)).toBeCloseTo(0.36);
    expect(impact.reaction(battle.target.id)?.hp).toBe(8);
    expect(impact.bounties).toEqual([]);
    expect(battle.sounds.map(({ lethal }) => lethal)).toEqual([false]);
    battle.draw(231);
    expect(battle.enemies.targetPosition(battle.target.id, new Vector3())).toBeUndefined();
  },
);

it('draws the original color before the next ordered hit even when a frame runs late', () => {
  const battle = archerBattle(['S=====G', '.......'], 0, 6);
  battle.advance(100, [6, 1]);
  battle.advance(133, [0, 1], 'sniper');
  expect(battle.draw(400).hitFlash(battle.target.id)).toBeCloseTo(0.36);
  expect(battle.draw(530).hitFlash(battle.target.id)).toBe(0);
  expect(battle.sounds.map(({ lethal }) => lethal)).toEqual([false]);
  expect(battle.draw(546).hitFlash(battle.target.id)).toBeCloseTo(0.36);
  expect(battle.sounds.map(({ lethal }) => lethal)).toEqual([false, true]);
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
  expect(battle.draw(367).bounties).toEqual([]);
  expect(battle.draw(368).bounties.map(({ text }) => text)).toEqual(['+5']);
  expect(battle.draw(400).bounties.map(({ text }) => text)).toEqual(['+5']);
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
  expect(battle.draw(487).bounties).toEqual([]);
  expect(battle.draw(488).bounties.map(({ text }) => text)).toEqual(['+5']);
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
    expect(battle.draw(263).hitFlash(battle.target.id)).toBeGreaterThan(0);
    expect(battle.draw(264).hitFlash(battle.target.id)).toBe(0);
    expect(battle.draw(365).reaction(battle.target.id)?.recoil.length()).toBeGreaterThan(0);
    expect(battle.draw(366).reaction(battle.target.id)).toBeUndefined();
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
  expect(battle.draw(487).hitFlash(battle.target.id)).toBe(0);
  expect(battle.draw(488).bounties.map(({ text }) => text)).toEqual(['+5']);
  expect(battle.sounds.map(({ towerKind, lethal }) => [towerKind, lethal])).toEqual([
    ['basic', false],
    ['sniper', true],
  ]);
});

function mageBattle(runnerHp = 4) {
  let previous = createGame(
    {
      enemies: {
        still: { speed: 0, hp: 12, bounty: 5, leakDamage: 1 },
        grunt: { speed: 11.25, hp: 10, bounty: 4, leakDamage: 1 },
        runner: { speed: 22.5, hp: runnerHp, bounty: 3, leakDamage: 1 },
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
  const shots = createShotLayer(enemies, createBuildLayer().towerHeight, combat, {
    onImpact: (impact) => sounds.push(impact),
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
      combat.onEvents(shots.onEvents(result.events, current, previous, at), previous, at);
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
  battle.draw(1550);
  expect(enemies.targetPosition(defeated.id, new Vector3())).toBeUndefined();
});

it('shows localized spell impacts on moving recipients that separate during flight', () => {
  const battle = mageBattle(5);
  const { enemies, unaffected, survivor, defeated: primary, shots } = battle;
  battle.advance(67);
  battle.advance(100, ['splash', 2]);
  battle.draw(100);
  for (const at of [133, 167]) {
    battle.advance(at);
    battle.draw(at);
  }
  battle.advance(200);
  const survivorPosition = enemies.aimPosition(survivor.id, 1, new Vector3());
  const primaryPosition = enemies.aimPosition(primary.id, 1, new Vector3());
  if (survivorPosition === undefined || primaryPosition === undefined) {
    throw new Error('Expected both targets to keep moving');
  }
  expect(survivorPosition.distanceTo(primaryPosition)).toBeGreaterThan(0.75);

  const impact = battle.draw(200);
  expect(impact.hitFlash(unaffected.id)).toBe(0);
  expect(impact.hitFlash(survivor.id)).toBeCloseTo(0.36);
  expect(impact.hitFlash(primary.id)).toBeCloseTo(0.36);
  const markers = shots.group.children.filter((child) => child instanceof Mesh);
  const atTarget = (point: Vector3) =>
    markers.some(
      (marker) =>
        Math.hypot(marker.position.x - point.x, marker.position.z - point.z) < 0.01 &&
        marker.scale.x < 0.5,
    );
  expect(atTarget(survivorPosition)).toBe(true);
  expect(atTarget(primaryPosition)).toBe(true);
  battle.draw(452);
  expect(shots.group.children).toEqual([]);
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
  expect(battle.draw(637).bounties.map(({ id }) => id)).toEqual([defeated.id]);

  const arrow = battle.draw(638);
  expect(arrow.reaction(survivor.id)?.hp).toBe(0);
  expect(arrow.bounties.map(({ id, text }) => [id, text])).toEqual([
    [defeated.id, '+3'],
    [survivor.id, '+4'],
  ]);
  expect(sounds.map(({ towerKind, target, lethal }) => [towerKind, target.id, lethal])).toEqual([
    ['splash', defeated.id, true],
    ['basic', survivor.id, true],
  ]);
  expect(battle.draw(725).bounties.map(({ id }) => id)).toEqual([defeated.id, survivor.id]);
  battle.draw(1940);
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
  expect(battle.draw(337).bounties).toEqual([]);

  const orb = battle.draw(338);
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
