import { Mesh, PerspectiveCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { level } from '../content/level';
import {
  applyCommands,
  type Content,
  createGame,
  type GameState,
  groundHeight,
  parseLevel,
  step,
} from '../core';
import { cellIndex } from '../core/level';
import { createCamera } from './camera';
import { dLevel } from './d-level.fixture';
import { createEnemyLayer } from './enemies';
import { LAYER_HEIGHT } from './terrain';

const content = {
  enemies: { grunt: { speed: 7.5, hp: 12, bounty: 5, leakDamage: 1 } },
  waves: [{ groups: [{ enemy: 'grunt', count: 1, interval: 1, delay: 0 }] }],
  towers: { basic: { name: 'Basic', cost: 10, range: 2, damage: 4, shotsPerSecond: 0 } },
  towerUpgrades: { costPercents: [60, 100], damageMultiplier: 1.5, rangeBonus: 0.3 },
  startingMoney: 100,
  startingLives: 10,
  waveClearReward: 0,
  heightRangeBonus: 0,
} satisfies Content;

function start(rows: readonly string[]): GameState {
  return step(createGame(content, parseLevel(rows)), [{ type: 'startWave', tick: 0 }]).state;
}

function worldVertices(mesh: Mesh): Vector3[] {
  const vertices = mesh.geometry.getAttribute('position');
  return Array.from({ length: vertices.count }, (_, i) =>
    mesh.localToWorld(new Vector3().fromBufferAttribute(vertices, i)),
  );
}

it('samples the turn at the interpolated tick progress', () => {
  const layer = createEnemyLayer(new PerspectiveCamera());
  const first = start(['S=', '.G']);
  const second = step(first, []).state;
  const third = step(second, []).state;
  const fourth = step(third, []).state;
  layer.update(first, second, 0);
  layer.update(second, third, 0);
  layer.update(third, fourth, 0.5);

  const [enemy] = layer.group.children;
  expect(enemy?.position.toArray()).toEqual([
    expect.closeTo(0.777785),
    0,
    expect.closeTo(0.084265),
  ]);
});

it('supports the D boss across the upper flank as it leaves the ramp', () => {
  const initial = createGame(content, dLevel);
  const poseAt = (progress: number): Mesh => {
    const layer = createEnemyLayer(new PerspectiveCamera());
    const state = {
      ...initial,
      enemies: [
        {
          id: initial.nextEnemyId,
          kind: 'boss',
          hp: 1,
          maxHp: 1,
          from: cellIndex(dLevel.width, 15, 10),
          to: cellIndex(dLevel.width, 16, 10),
          progress,
        },
      ],
    };
    layer.update(state, state, 1);
    const [enemy] = layer.group.children;
    const [body] = enemy?.children ?? [];
    if (!(body instanceof Mesh)) throw new Error('No boss body');
    return body;
  };
  const body = poseAt(0.65);
  const surface = body.worldToLocal(new Vector3(15.62, 0.6, 9.497));
  expect(Math.hypot(surface.x, surface.z)).toBeLessThan(0.49);
  expect(surface.y).toBeCloseTo(-0.5, 5);

  const before = poseAt(0.49).getWorldPosition(new Vector3());
  const after = poseAt(0.51).getWorldPosition(new Vector3());
  expect(before.distanceTo(after)).toBeLessThan(0.03);
});

it('keeps the boss directly above its support while its base follows the ramp', () => {
  const level = parseLevel(['S^g']);
  const initial = createGame(content, level);
  const state = {
    ...initial,
    enemies: [
      {
        id: initial.nextEnemyId,
        kind: 'boss',
        hp: 1,
        maxHp: 1,
        from: cellIndex(level.width, 1, 0),
        to: cellIndex(level.width, 2, 0),
        progress: 0,
      },
    ],
  };
  const layer = createEnemyLayer(new PerspectiveCamera());
  layer.update(state, state, 1);
  const [body] = layer.group.children[0]?.children ?? [];
  if (!(body instanceof Mesh)) throw new Error('No boss body');
  body.geometry.computeBoundingBox();
  const bounds = body.geometry.boundingBox;
  if (bounds === null) throw new Error('No boss bounds');

  for (const x of [bounds.min.x / 2, bounds.max.x / 2]) {
    const foot = body.localToWorld(new Vector3(x, bounds.min.y, 0));
    const top = body.localToWorld(new Vector3(x, bounds.max.y, 0));
    expect(foot.y).toBeCloseTo(groundHeight(level, { x: foot.x, y: foot.z }) * LAYER_HEIGHT);
    expect(top.x).toBeCloseTo(foot.x);
  }
});

it('sets the bottom of the enemy on the ramp at its rounded position', () => {
  const camera = new PerspectiveCamera();
  camera.rotation.set(-0.6, 0.2, 0);
  const layer = createEnemyLayer(camera);
  const first = start(['.g', 'S^']);
  const second = step(first, []).state;
  const third = step(second, []).state;
  const fourth = step(third, []).state;
  layer.observe(first);
  layer.observe(second);
  layer.update(third, fourth, 0.5);

  const [enemy] = layer.group.children;
  expect(enemy?.position.toArray()).toEqual([
    expect.closeTo(0.777785, 5),
    expect.closeTo(0.584265 * LAYER_HEIGHT, 5),
    expect.closeTo(0.915735, 5),
  ]);
  const [body, bar] = enemy?.children ?? [];
  if (!(body instanceof Mesh) || bar === undefined) throw new Error('No enemy model');
  for (const x of [-0.25, 0.25]) {
    for (const z of [-0.25, 0.25]) {
      const corner = body.localToWorld(new Vector3(x, -0.25, z));
      expect(corner.y).toBeCloseTo((1.5 - corner.z) * LAYER_HEIGHT, 5);
    }
  }
  expect(bar.quaternion.toArray()).toEqual(camera.quaternion.toArray());
});

it('draws the tank health bar above its silhouette on the ramp', () => {
  const { camera, resize, pan, zoom } = createCamera(dLevel);
  resize(16 / 9);
  pan(5.5, 3.5);
  zoom(0.5);
  const layer = createEnemyLayer(camera);
  const initial = createGame(content, dLevel);
  const state = {
    ...initial,
    enemies: [
      {
        id: initial.nextEnemyId,
        kind: 'tank',
        hp: 1,
        maxHp: 1,
        from: cellIndex(dLevel.width, 14, 10),
        to: cellIndex(dLevel.width, 15, 10),
        progress: 0.9,
      },
    ],
  };
  layer.update(state, state, 1);
  const [body, bar] = layer.group.children[0]?.children ?? [];
  const [background] = bar?.children ?? [];
  if (!(body instanceof Mesh) || !(background instanceof Mesh)) {
    throw new Error('No tank model or health bar');
  }
  const projectedY = (mesh: Mesh) => worldVertices(mesh).map((point) => point.project(camera).y);
  expect(Math.min(...projectedY(background))).toBeGreaterThan(Math.max(...projectedY(body)));
});

it.each(['tank', 'boss'])('keeps the %s grounded and clear at a plateau turn', (kind) => {
  const layer = createEnemyLayer(new PerspectiveCamera());
  const initial = createGame(content, level);
  const state = {
    ...initial,
    enemies: [
      {
        id: initial.nextEnemyId,
        kind,
        hp: 1,
        maxHp: 1,
        from: cellIndex(level.width, 1, 4),
        to: cellIndex(level.width, 1, 3),
        progress: 1,
      },
    ],
  };
  layer.update(state, state, 1);
  const [enemy] = layer.group.children;
  expect(enemy?.position.toArray()).toEqual([
    expect.closeTo(1.146447),
    0,
    expect.closeTo(3.146447),
  ]);
  const [body] = enemy?.children ?? [];
  if (!(body instanceof Mesh)) throw new Error('No enemy body');
  const corners = worldVertices(body);
  expect(Math.min(...corners.map(({ y }) => y))).toBeCloseTo(0, 5);
  // The high cell starts at x = 1.5 and z = 3.5.
  expect(Math.max(...corners.map(({ x, z }) => x + z))).toBeLessThan(5);
});

it.each([
  { edge: 'approach', tick: 2, center: 0.375, crease: 0.5, contact: 'front' },
  { edge: 'crest', tick: 7, center: 1.625, crease: 1.5, contact: 'crease' },
])('supports the rigid base across the ramp $edge', ({ tick, center, crease, contact }) => {
  const layer = createEnemyLayer(new PerspectiveCamera());
  let previous = start(['S^g']);
  let current = step(previous, []).state;
  while (current.tick < tick) {
    previous = current;
    current = step(current, []).state;
  }
  layer.update(previous, current, 0.5);
  const [enemy] = layer.group.children;
  const [body] = enemy?.children ?? [];
  if (!(body instanceof Mesh)) throw new Error('No enemy body');
  const back = body.localToWorld(new Vector3(-0.25, -0.25, 0));
  const front = body.localToWorld(new Vector3(0.25, -0.25, 0));
  expect((back.x + front.x) / 2).toBeCloseTo(center, 6);
  expect(back.x).toBeLessThan(crease);
  expect(front.x).toBeGreaterThan(crease);
  expect(front.y - back.y).toBeGreaterThan(0);
  expect(front.y - back.y).toBeLessThan(0.2);
  const creaseY = back.y + ((front.y - back.y) * (crease - back.x)) / (front.x - back.x);
  if (contact === 'front') {
    expect(back.y).toBeGreaterThan(0);
    expect(front.y).toBeCloseTo((front.x - crease) * LAYER_HEIGHT, 5);
    expect(creaseY).toBeGreaterThan(0);
  } else {
    expect(back.y).toBeGreaterThan(0.565);
    expect(creaseY).toBeCloseTo(0.6, 6);
    expect(front.y).toBeGreaterThan(0.6);
  }
});

it('keeps moving from the displayed position after a barricade changes an upcoming turn', () => {
  const layer = createEnemyLayer(new PerspectiveCamera());
  let current = start(['S====G', '===.==', '======']);
  let previous = current;
  while (current.tick < 7) {
    layer.observe(current);
    previous = current;
    current = step(current, []).state;
  }
  const command = {
    type: 'placeTower',
    kind: 'basic',
    cell: cellIndex(6, 4, 0),
    tick: current.tick,
  } as const;
  layer.update(previous, current, 0.5);
  const [enemy] = layer.group.children;
  const pausedPosition = enemy?.position.toArray();
  const paused = applyCommands(current, [command]).state;
  layer.update(previous, paused, 0.5);
  expect(enemy?.position.toArray()).toEqual(pausedPosition);

  layer.update(previous, paused, 1);
  const beforeReroute = enemy?.position.toArray();
  const rerouted = step(paused, []).state;
  layer.observe(rerouted);
  layer.update(paused, rerouted, 0);
  expect(enemy?.position.toArray()).toEqual(beforeReroute);

  layer.update(paused, rerouted, 1);
  expect(enemy?.position.toArray()).toEqual([
    expect.closeTo(1.853553, 5),
    0,
    expect.closeTo(0.146447, 5),
  ]);
  const next = step(rerouted, []).state;
  layer.update(rerouted, next, 0.5);
  expect(enemy?.position.z).toBeGreaterThan(0.2);
});

it('keeps the incoming branch edge when a reroute and subsequent ticks run before one draw', () => {
  const layer = createEnemyLayer(new PerspectiveCamera());
  let current = start(['S===G', '==.==', '=====']);
  while (current.tick < 7) {
    layer.observe(current);
    current = step(current, []).state;
  }
  layer.observe(current);
  current = step(current, [
    { type: 'placeTower', kind: 'basic', cell: cellIndex(5, 3, 0), tick: current.tick },
  ]).state;
  let previous = current;
  while (current.tick <= 12) {
    layer.observe(current);
    if (current.tick === 12) break;
    previous = current;
    current = step(current, []).state;
  }
  layer.update(previous, current, 0.5);

  const [enemy] = layer.group.children;
  expect(enemy?.position.toArray()).toEqual([
    expect.closeTo(1.222215, 5),
    0,
    expect.closeTo(0.084265, 5),
  ]);
});
