import { Box3, BoxGeometry, Camera, Mesh, MeshLambertMaterial } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { describe, expect, it } from 'vitest';
import { content } from '../content/content';
import {
  applyCommands,
  type CellIndex,
  createGame,
  currentRoute,
  type EnemyId,
  parseLevel,
  pickCell,
  step,
} from '../core';
import { cellIndex } from '../core/level';
import { createBuildLayer } from './build-layer';
import { dLevel } from './d-level.fixture';
import { createEnemyLayer } from './enemies';
import { enemyMotion, sampleEnemyMotion } from './enemy-motion';
import { LAYER_HEIGHT } from './terrain';
import { prepareTowerModel } from './tower-model';

it.each(['basic', 'sniper', 'splash'])(
  'picks the upper half at the wider edge of the %s tower model',
  (kind) => {
    const level = parseLevel(['S.', '=.', '=.', 'G.']);
    const initial = createGame(content, level);
    const cell = cellIndex(level.width, 1, 2);
    const { state } = applyCommands(initial, [{ type: 'placeTower', kind, cell, tick: 0 }]);
    const [tower] = state.towers;
    if (tower === undefined) throw new Error(`Missing ${kind} tower`);
    const model = new Mesh(new BoxGeometry(0.6, 1.8, 0.9).translate(0, 0.9, 0));
    const layer = createBuildLayer({ [kind]: prepareTowerModel(model, 1) });
    const structure = layer.towerStructure(tower);
    expect(structure).toEqual({ height: expect.closeTo(3), halfWidth: expect.closeTo(0.45) });
    const ray = {
      origin: { x: 1.42, y: 5, z: 3.6 },
      direction: { x: 0, y: -1 / LAYER_HEIGHT, z: -1 },
    };

    expect(pickCell(level, ray)).toBe(cellIndex(level.width, 1, 1));
    expect(pickCell(level, ray, new Map([[cell, structure]]))).toBe(cell);
  },
);

it.each(['basic', 'sniper', 'splash'])(
  'places the gold upgrade marker above the %s tower on elevated ground',
  (kind) => {
    const level = parseLevel(['S==G', '.+..']);
    const initial = createGame({ ...content, startingMoney: 200 }, level);
    const cell = cellIndex(level.width, 1, 1);
    const placed = applyCommands(initial, [{ type: 'placeTower', kind, cell, tick: 0 }]).state;
    const upgraded = applyCommands(placed, [{ type: 'upgradeTower', cell, tick: 0 }]).state;
    const model = new Mesh(new BoxGeometry(0.6, 1.8, 0.9).translate(0, 2, 0));
    const layer = createBuildLayer({ [kind]: prepareTowerModel(model, 1) });
    layer.update(placed, upgraded, 1);
    layer.group.updateMatrixWorld(true);

    const markers: Mesh[] = [];
    layer.group.traverse((object) => {
      if (
        object instanceof Mesh &&
        object.material instanceof MeshLambertMaterial &&
        object.material.color.getHex() === 0xffd34d
      ) {
        markers.push(object);
      }
    });
    expect(markers).toHaveLength(1);
    const [marker] = markers;
    if (marker === undefined) throw new Error('Missing gold upgrade marker');
    const markerBounds = new Box3().setFromObject(marker);
    expect(markerBounds.min.y).toBeCloseTo(0.6 + 1.8 + 0.08, 5);
    expect(marker.layers.mask).toBe(1);
  },
);

it('puts routes, placement previews, and range indicators on the overlay', () => {
  const level = parseLevel(['S==.', '===G']);
  const state = createGame(content, level);
  const layer = createBuildLayer();
  layer.update(state, state, 1, {
    cell: level.spawn,
    range: 2,
    route: currentRoute(state),
  });

  const lines = layer.group.children.filter((child) => child instanceof Line2 && child.visible);
  const range = layer.group.children.find((child) => child instanceof Mesh && child.visible);
  expect(lines.map((line) => line.layers.mask)).toEqual([2, 2]);
  expect(range?.layers.mask).toBe(2);
  expect(branchLine(layer).layers.mask).toBe(2);
});

function vertices(line: LineSegments2): number[][] {
  const start = line.geometry.getAttribute('instanceStart');
  const end = line.geometry.getAttribute('instanceEnd');
  return [start, end].flatMap((attribute) =>
    Array.from({ length: attribute.count }, (_, i) => [
      attribute.getX(i),
      attribute.getY(i),
      attribute.getZ(i),
    ]),
  );
}

function branchLine(layer: ReturnType<typeof createBuildLayer>): LineSegments2 {
  const branch = layer.group.children.find(
    (child) => child instanceof LineSegments2 && !(child instanceof Line2),
  );
  if (!(branch instanceof LineSegments2)) throw new Error('Missing branch line');
  return branch;
}

describe('route lines', () => {
  it('samples the same corner for the current and preview lines and follows the ramp surface', () => {
    const level = parseLevel(['S==...', '..=...', '..=^+g']);
    const state = createGame(content, level);
    const route = currentRoute(state);
    const layer = createBuildLayer();
    layer.update(state, state, 1, { cell: level.spawn, range: 0, route });
    const lines = layer.group.children.filter((child) => child instanceof Line2);
    expect(lines).toHaveLength(2);

    for (const [index, line] of lines.entries()) {
      const lift = index === 0 ? 0.035 : 0.065;
      expect(vertices(line)).toEqual(
        expect.arrayContaining([
          [expect.closeTo(1.853553, 5), expect.closeTo(lift, 5), expect.closeTo(0.146447, 5)],
          [2.5, expect.closeTo(lift, 5), 2],
          [3, expect.closeTo(LAYER_HEIGHT / 2 + lift, 5), 2],
          [3.5, expect.closeTo(LAYER_HEIGHT + lift, 5), 2],
        ]),
      );
    }

    for (const line of lines) {
      expect(line.material.dashed).toBe(true);
      expect(line.geometry.getAttribute('instanceDistanceEnd').count).toBeGreaterThan(0);
    }
  });

  it('rounds a branch rejoining the main route', () => {
    const level = parseLevel(['S=====.', '=....=.', '======.', '.....G.']);
    const initial = createGame(content, level);
    const state = {
      ...initial,
      enemies: [
        {
          id: 0 as EnemyId,
          kind: 'grunt',
          hp: 22,
          maxHp: 22,
          from: 17 as CellIndex,
          to: 18 as CellIndex,
          progress: 0.25,
        },
      ],
    };
    const layer = createBuildLayer();
    layer.update(initial, state, 1);
    const branch = branchLine(layer);

    expect(vertices(branch)).toEqual(
      expect.arrayContaining([
        [4.5, expect.closeTo(0.035, 5), 2],
        [expect.closeTo(4.853553, 5), expect.closeTo(0.035, 5), expect.closeTo(2.146447, 5)],
        [5, expect.closeTo(0.035, 5), 2.5],
      ]),
    );
  });

  it('keeps the incoming half of a fork while an enemy remains on its committed branch', () => {
    const level = parseLevel(['.====', 'S===G']);
    const initial = createGame(content, level);
    const inbound = {
      id: 0 as EnemyId,
      kind: 'grunt',
      hp: 22,
      maxHp: 22,
      from: level.spawn,
      to: 6 as CellIndex,
      progress: 0.875,
    };
    const beforeFork = { ...initial, enemies: [inbound] };
    const committed = { ...inbound, from: inbound.to, to: 7 as CellIndex, progress: 0.75 };
    const beforePlacement = { ...initial, tick: 1, enemies: [committed] };
    const motion = enemyMotion(beforePlacement, committed, enemyMotion(beforeFork, inbound));
    const placed = applyCommands(beforePlacement, [
      { type: 'placeTower', kind: 'basic', cell: 8 as CellIndex, tick: beforePlacement.tick },
    ]);
    expect(placed.events).toEqual([]);

    const layer = createBuildLayer();
    const branch = branchLine(layer);
    const inboundMidpoint = [0.5, expect.closeTo(0.035, 5), 1];
    layer.update(beforeFork, placed.state, 1, undefined, [motion]);
    expect(vertices(branch)).toContainEqual(inboundMidpoint);

    const afterPlacement = step(placed.state, []).state;
    const [moving] = afterPlacement.enemies;
    if (moving === undefined) throw new Error('Missing branch enemy');
    layer.update(placed.state, afterPlacement, 1, undefined, [
      enemyMotion(afterPlacement, moving, motion),
    ]);
    expect(vertices(branch)).toContainEqual(inboundMidpoint);
  });

  it('keeps the straight branch when the main line bends into its outgoing edge', () => {
    const level = parseLevel(['..=.', 'S==.', '..G.']);
    const initial = createGame(content, level);
    const inbound = {
      id: 0 as EnemyId,
      kind: 'grunt',
      hp: 22,
      maxHp: 22,
      from: 2 as CellIndex,
      to: 6 as CellIndex,
      progress: 0.875,
    };
    const previous = { ...initial, enemies: [inbound] };
    const layer = createBuildLayer();
    layer.update(initial, previous, 1);
    const branch = branchLine(layer);
    const outgoingHalf = [2, expect.closeTo(0.035, 5), 1.5];
    expect(vertices(branch)).toContainEqual(outgoingHalf);

    const outbound = { ...inbound, from: inbound.to, to: level.goal, progress: 0.125 };
    const state = { ...initial, tick: 1, enemies: [outbound] };
    const motion = enemyMotion(state, outbound, enemyMotion(previous, inbound));
    layer.update(previous, state, 1, undefined, [motion]);
    expect(branch.visible).toBe(true);
    expect(vertices(branch)).toContainEqual(outgoingHalf);
  });

  it('keeps the join visible until the enemy clears the corner', () => {
    const level = parseLevel(['S=====.', '=....=.', '======.', '.....G.']);
    const initial = createGame(content, level);
    const inbound = {
      id: 0 as EnemyId,
      kind: 'grunt',
      hp: 22,
      maxHp: 22,
      from: 18 as CellIndex,
      to: 19 as CellIndex,
      progress: 0.875,
    };
    const outbound = { ...inbound, from: inbound.to, to: level.goal, progress: 0.125 };
    const previous = { ...initial, enemies: [inbound] };
    const state = { ...initial, tick: 1, enemies: [outbound] };
    const motion = enemyMotion(state, outbound, enemyMotion(previous, inbound));
    const layer = createBuildLayer();
    layer.update(previous, state, 1, undefined, [motion]);

    const branch = branchLine(layer);
    const tip = sampleEnemyMotion(motion, 1);
    expect(branch.visible).toBe(true);
    expect(vertices(branch)).toContainEqual([
      expect.closeTo(tip.x, 5),
      expect.closeTo(0.035, 5),
      expect.closeTo(tip.y, 5),
    ]);

    const geometry = branch.geometry;
    const secondEnemy = { ...outbound, id: 1 as EnemyId };
    const crowded = { ...state, enemies: [outbound, secondEnemy] };
    layer.update(previous, crowded, 1, undefined, [motion, { ...motion, enemy: secondEnemy }]);
    expect(branch.geometry).toBe(geometry);

    const laterEnemy = { ...outbound, progress: 0.625 };
    const later = { ...initial, tick: 2, enemies: [laterEnemy] };
    const laterMotion = enemyMotion(later, laterEnemy, motion);
    layer.update(state, later, 0.5, undefined, [laterMotion]);
    expect(branch.visible).toBe(true);
    layer.update(state, later, 1, undefined, [laterMotion]);
    expect(branch.visible).toBe(false);
  });

  it('connects the displayed enemy to the new route through paused placement and resume', () => {
    const enemies = createEnemyLayer(new Camera());
    const layer = createBuildLayer();
    let state = createGame(content, dLevel);
    let previous = state;
    while (state.tick < 55) {
      previous = state;
      state = step(state, state.tick === 0 ? [{ type: 'startWave', tick: 0 }] : []).state;
      enemies.observe(state);
    }
    for (const type of ['placeTower', 'sellTower', 'placeTower'] as const) {
      const result = applyCommands(state, [
        { type, kind: 'basic', cell: 63 as CellIndex, tick: state.tick },
      ]);
      expect(result.events).toEqual([]);
      state = result.state;
      enemies.observe(state);
    }

    const branch = branchLine(layer);
    const [paused] = enemies.routeMotions();
    if (paused === undefined) throw new Error('Missing paused enemy motion');
    expect(paused.distance).not.toBe(state.distance);
    const future = enemyMotion(state, paused.enemy, paused);
    layer.update(previous, state, 0.5, undefined, enemies.routeMotions());
    for (const [motion, alpha] of [
      [paused, 0.5],
      [future, 1],
    ] as const) {
      const point = sampleEnemyMotion(motion, alpha);
      expect(vertices(branch)).toContainEqual([
        expect.closeTo(point.x, 5),
        expect.closeTo(0.035, 5),
        expect.closeTo(point.y, 5),
      ]);
    }

    const resumed = step(state, []).state;
    enemies.observe(resumed);
    const [motion] = enemies.routeMotions();
    if (motion?.reroute === undefined) throw new Error('Missing blended enemy motion');
    layer.update(state, resumed, 0.5, undefined, enemies.routeMotions());
    for (const alpha of [0, 0.5, 1]) {
      const point = sampleEnemyMotion(motion, alpha);
      expect(vertices(branch)).toContainEqual([
        expect.closeTo(point.x, 5),
        expect.closeTo(0.035, 5),
        expect.closeTo(point.y, 5),
      ]);
    }
  });
});
