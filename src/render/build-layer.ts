import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  RingGeometry,
} from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import {
  type CellIndex,
  cellPoint,
  currentRoute,
  enemyRouteSegments,
  type GameState,
  type GridPoint,
  groundHeight,
  type Level,
  type RouteSegment,
  type Structure,
  sameRoute,
  type Tower,
} from '../core';
import { nextCell } from '../core/pathing';
import { type EnemyMotion, enemyMotion, sampleEnemyMotion } from './enemy-motion';
import { OVERLAY_LAYER, WORLD_LAYER } from './layers';
import { sampleRoute } from './route-curve';
import { LAYER_HEIGHT } from './terrain';
import type { LoadedTowerModel } from './tower-model';

const CURRENT_ROUTE_LIFT = 0.035;
const PREVIEW_ROUTE_LIFT = 0.065;
// 每格取八段，包含邊中點，讓圓弧與坡面轉折都有取樣點。
const ROUTE_STEPS_PER_CELL = 8;

function towerModel(geometry: BufferGeometry, height: number, halfWidth: number, color: number) {
  return {
    geometry: geometry.translate(0, height / 2, 0),
    height,
    halfWidth,
    material: new MeshLambertMaterial({ color }),
  };
}

const BASIC_HEIGHT = 0.75;
const BASIC_HALF_WIDTH = 0.4;
const BASIC_MODEL = towerModel(
  new BoxGeometry(BASIC_HALF_WIDTH * 2, BASIC_HEIGHT, BASIC_HALF_WIDTH * 2),
  BASIC_HEIGHT,
  BASIC_HALF_WIDTH,
  0x57a4da,
);
const PROXY_MODELS = new Map([
  ['basic', BASIC_MODEL],
  ['sniper', towerModel(new CylinderGeometry(0.29, 0.4, 1.18, 6), 1.18, 0.4, 0xeeaa48)],
  ['splash', towerModel(new ConeGeometry(0.44, 0.68, 8), 0.68, 0.44, 0xc381dc)],
]);

type TowerModel = ReturnType<typeof towerModel> & { readonly scene?: Object3D };

const HIDDEN_PROXY = new MeshLambertMaterial({ colorWrite: false, depthWrite: false });

const LEVEL_MARKER_SIZE = 0.13;
const LEVEL_MARKER_GAP = 0.08;
const LEVEL_MARKER = {
  geometry: new BoxGeometry(LEVEL_MARKER_SIZE, LEVEL_MARKER_SIZE, LEVEL_MARKER_SIZE),
  material: new MeshLambertMaterial({ color: 0xffd34d, emissive: 0x4a3200 }),
};

/** 塔頂一排金色方塊，數量是升過的段數。 */
function towerMesh(tower: Tower, level: Level, model: TowerModel): Group {
  const group = new Group();
  const body = new Mesh(model.geometry, model.material);
  body.layers.set(WORLD_LAYER);
  if (model.scene !== undefined) body.add(model.scene.clone());
  group.add(body);
  const upgrades = tower.level - 1;
  const spacing = LEVEL_MARKER_SIZE + LEVEL_MARKER_GAP;
  for (let i = 0; i < upgrades; i++) {
    const marker = new Mesh(LEVEL_MARKER.geometry, LEVEL_MARKER.material);
    marker.layers.set(WORLD_LAYER);
    marker.position.set(
      (i - (upgrades - 1) / 2) * spacing,
      model.height + LEVEL_MARKER_GAP + LEVEL_MARKER_SIZE / 2,
      0,
    );
    group.add(marker);
  }
  const { x, y } = cellPoint(level, tower.cell);
  group.position.set(x, tower.layer * LAYER_HEIGHT, y);
  return group;
}

export interface BuildPreview {
  readonly cell: CellIndex;
  readonly range: number;
  readonly route?: readonly CellIndex[];
}

interface BuildLayer {
  readonly group: Group;
  towerHeight(kind: string): number;
  towerStructure(tower: Tower): Structure;
  update(
    previous: GameState,
    state: GameState,
    alpha: number,
    preview?: BuildPreview,
    motions?: Iterable<EnemyMotion>,
  ): void;
}

function routePoint(level: Level, point: GridPoint, lift: number): [number, number, number] {
  return [point.x, groundHeight(level, point) * LAYER_HEIGHT + lift, point.y];
}

function drawRoute(line: Line2, level: Level, route: readonly CellIndex[], lift: number): void {
  line.visible = route.length > 1;
  if (!line.visible) return;

  const points = route.map((cell) => cellPoint(level, cell));
  const steps = (points.length - 1) * ROUTE_STEPS_PER_CELL;
  const positions: number[] = [];
  for (let i = 0; i <= steps; i++) {
    positions.push(...routePoint(level, sampleRoute(points, i / steps), lift));
  }

  line.geometry.dispose();
  line.geometry = new LineGeometry().setPositions(positions);
  if (line.material.dashed) line.computeLineDistances();
}

type RouteTurn = readonly [from: CellIndex, corner: CellIndex, to: CellIndex];

function edgeKey(from: CellIndex, to: CellIndex): string {
  return `${Math.min(from, to)}:${Math.max(from, to)}`;
}

function turnKey(from: CellIndex, corner: CellIndex, to: CellIndex): string {
  return `${corner}:${edgeKey(from, to)}`;
}

function activeBranchTurns(
  motions: Iterable<EnemyMotion>,
  mainEdges: ReadonlySet<string>,
  segments: readonly RouteSegment[],
  interpolating: boolean,
): ReadonlyMap<string, RouteTurn> {
  const turns = new Map<string, RouteTurn>();
  const branchEdges = new Set(segments.map(({ from, to }) => edgeKey(from, to)));
  for (const { route, start, end } of motions) {
    // 移動進度以格為單位，轉角涵蓋格心前後各半格。
    const progress = interpolating ? start : end;
    const first = Math.max(1, Math.floor(progress));
    const nearest = Math.floor(progress + 0.5);
    const last = Math.min(route.cells.length - 2, Math.floor(end + 0.5));
    for (let i = first; i <= last; i++) {
      const from = route.cells[i - 1];
      const corner = route.cells[i];
      const to = route.cells[i + 1];
      if (from === undefined || corner === undefined || to === undefined) continue;
      const fromMain = mainEdges.has(edgeKey(from, corner));
      const outgoing = edgeKey(corner, to);
      if (fromMain && mainEdges.has(outgoing)) continue;
      // 敵人已越過岔口的中點時，只要分支仍經過這條邊，就保留接回主線的入口。
      if (i < nearest && !(fromMain && branchEdges.has(outgoing))) continue;
      if (from !== to) turns.set(turnKey(from, corner, to), [from, corner, to]);
    }
  }
  return turns;
}

function appendMotionTransition(positions: number[], state: GameState, motion: EnemyMotion): void {
  const { level } = state;
  let point = sampleEnemyMotion(motion, 0);
  const append = (next: GridPoint) => {
    if (point.x === next.x && point.y === next.y) return;
    positions.push(
      ...routePoint(level, point, CURRENT_ROUTE_LIFT),
      ...routePoint(level, next, CURRENT_ROUTE_LIFT),
    );
    point = next;
  };
  for (let i = 1; i <= ROUTE_STEPS_PER_CELL; i++) {
    append(sampleEnemyMotion(motion, i / ROUTE_STEPS_PER_CELL));
  }
  // 暫停改道時畫面仍沿用上一 tick 的動線，補到新路線上的同一個移動進度。
  if (motion.distance !== state.distance) {
    append(sampleEnemyMotion(enemyMotion(state, motion.enemy, motion), 1));
  }
}

function drawBranches(
  line: LineSegments2,
  state: GameState,
  segments: readonly RouteSegment[],
  activeTurns: Iterable<RouteTurn>,
  transitions: readonly EnemyMotion[],
): void {
  const { level, distance } = state;
  const positions: number[] = [];
  const drawnHalves = new Set<string>();
  const reversingHalves = new Set<string>();
  const drawnTurns = new Set<string>();

  // 已補繪的半邊共用邊中點，折返的半邊仍畫到格心。
  const drawTurn = (from: CellIndex, corner: CellIndex, to: CellIndex) => {
    const start = cellPoint(level, from);
    const turn = cellPoint(level, corner);
    const end = cellPoint(level, to);
    const incomingHalf = `${corner}:${from}`;
    const outgoingHalf = `${corner}:${to}`;
    if (from === to) {
      reversingHalves.add(incomingHalf);
      return;
    }
    const key = turnKey(from, corner, to);
    if (drawnTurns.has(key)) return;
    drawnTurns.add(key);

    const points = [start, turn, end];
    const steps = start.x === end.x || start.y === end.y ? 2 : ROUTE_STEPS_PER_CELL;
    let point = routePoint(level, sampleRoute(points, 0.25), CURRENT_ROUTE_LIFT);
    for (let i = 1; i <= steps; i++) {
      const progress = 0.25 + i / (2 * steps);
      const next = routePoint(level, sampleRoute(points, progress), CURRENT_ROUTE_LIFT);
      positions.push(...point, ...next);
      point = next;
    }
    drawnHalves.add(incomingHalf);
    drawnHalves.add(outgoingHalf);
  };

  for (const { from, to } of segments) {
    const next = nextCell(level, distance, to);
    if (next !== undefined) drawTurn(from, to, next);
    if (next === from) {
      const afterReversal = nextCell(level, distance, from);
      if (afterReversal !== undefined) drawTurn(to, from, afterReversal);
    }
  }
  // 模擬已移出分支時，保留還在內插中的轉角，直到敵人到達出口邊中點。
  for (const turn of activeTurns) drawTurn(...turn);

  const retainHalf = (from: CellIndex, to: CellIndex) => {
    const key = `${from}:${to}`;
    return !drawnHalves.has(key) || reversingHalves.has(key);
  };
  for (const { from, to } of segments) {
    const start = cellPoint(level, from);
    const end = cellPoint(level, to);
    const middle = routePoint(level, sampleRoute([start, end], 0.5), CURRENT_ROUTE_LIFT);
    if (retainHalf(from, to)) {
      positions.push(...routePoint(level, start, CURRENT_ROUTE_LIFT), ...middle);
    }
    if (retainHalf(to, from)) {
      positions.push(...middle, ...routePoint(level, end, CURRENT_ROUTE_LIFT));
    }
  }
  for (const motion of transitions) appendMotionTransition(positions, state, motion);
  line.geometry.dispose();
  line.geometry = new LineSegmentsGeometry();
  line.visible = positions.length > 0;
  if (line.visible) line.geometry.setPositions(positions);
}

function sameTurnKeys(
  a: ReadonlyMap<string, RouteTurn>,
  b: ReadonlyMap<string, RouteTurn>,
): boolean {
  if (a.size !== b.size) return false;
  for (const key of a.keys()) {
    if (!b.has(key)) return false;
  }
  return true;
}

function sameTowerLayout(
  previous: readonly Tower[] | undefined,
  current: readonly Tower[],
): boolean {
  return (
    previous === current ||
    (previous?.length === current.length &&
      current.every(({ cell, kind, layer, level }, i) => {
        const tower = previous[i];
        return (
          tower?.cell === cell &&
          tower.kind === kind &&
          tower.layer === layer &&
          tower.level === level
        );
      }))
  );
}

export function createBuildLayer(
  towersByKind: Readonly<Record<string, LoadedTowerModel>> = {},
): BuildLayer {
  const models = new Map<string, TowerModel>(PROXY_MODELS);
  for (const [kind, asset] of Object.entries(towersByKind)) {
    const proxy = models.get(kind) ?? BASIC_MODEL;
    models.set(kind, { ...asset, geometry: proxy.geometry, material: HIDDEN_PROXY });
  }
  const modelFor = (kind: string): TowerModel => models.get(kind) ?? BASIC_MODEL;

  const group = new Group();
  const towers = new Group();
  const currentRouteLine = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: 0x8fdfd0,
      linewidth: 3,
      dashed: true,
      dashSize: 0.15,
      gapSize: 0.25,
    }),
  );
  const branches = new LineSegments2(
    new LineSegmentsGeometry(),
    new LineMaterial({ color: 0x8fdfd0, linewidth: 3, alphaToCoverage: true }),
  );
  const previewRouteLine = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: 0xffe381,
      linewidth: 2.5,
      dashed: true,
      dashSize: 0.28,
      gapSize: 0.17,
    }),
  );
  const range = new Mesh(
    new RingGeometry(0.97, 1, 96).rotateX(-Math.PI / 2),
    // 射程圈維持在第 0 層，並在高台遮住它時保留輪廓。
    new MeshBasicMaterial({
      color: 0xfff1ce,
      opacity: 0.72,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  currentRouteLine.layers.set(OVERLAY_LAYER);
  branches.layers.set(OVERLAY_LAYER);
  previewRouteLine.layers.set(OVERLAY_LAYER);
  range.layers.set(OVERLAY_LAYER);
  currentRouteLine.visible = branches.visible = previewRouteLine.visible = range.visible = false;
  group.add(towers, currentRouteLine, previewRouteLine, range, branches);

  let lastState: GameState | undefined;
  let lastInterpolationState: GameState | undefined;
  const mainEdges = new Set<string>();
  let previousBranches: readonly RouteSegment[] = [];
  let previousTurns: ReadonlyMap<string, RouteTurn> = new Map();
  let previousTransitions: readonly EnemyMotion[] = [];
  let previousProposal: readonly CellIndex[] | undefined;

  const update = (
    previous: GameState,
    state: GameState,
    alpha: number,
    preview?: BuildPreview,
    motions: Iterable<EnemyMotion> = [],
  ): void => {
    const levelChanged = lastState?.level !== state.level;
    if (levelChanged || !sameTowerLayout(lastState?.towers, state.towers)) {
      towers.clear();
      for (const tower of state.towers) {
        towers.add(towerMesh(tower, state.level, modelFor(tower.kind)));
      }
    }
    const routeChanged = levelChanged || lastState?.distance !== state.distance;
    if (routeChanged) {
      const route = currentRoute(state);
      drawRoute(currentRouteLine, state.level, route, CURRENT_ROUTE_LIFT);
      mainEdges.clear();
      let from: CellIndex | undefined;
      for (const to of route) {
        if (from !== undefined) mainEdges.add(edgeKey(from, to));
        from = to;
      }
    }
    const interpolationState = alpha < 1 ? previous : undefined;
    if (lastState !== state || lastInterpolationState !== interpolationState) {
      const segments = enemyRouteSegments(state, interpolationState);
      const frameMotions = [...motions];
      const interpolating = interpolationState !== undefined;
      // 暫停時舊動線只用來畫銜接線，分支仍走新路線。
      const currentMotions = frameMotions.map((motion) =>
        motion.distance === state.distance ? motion : enemyMotion(state, motion.enemy, motion),
      );
      const turns = activeBranchTurns(currentMotions, mainEdges, segments, interpolating);
      const transitions = frameMotions.filter(
        (motion) =>
          motion.distance !== state.distance || (interpolating && motion.reroute !== undefined),
      );
      const changed =
        segments.length !== previousBranches.length ||
        segments.some(
          ({ from, to }, i) => previousBranches[i]?.from !== from || previousBranches[i]?.to !== to,
        ) ||
        !sameTurnKeys(turns, previousTurns) ||
        transitions.length !== previousTransitions.length ||
        transitions.some((motion, i) => previousTransitions[i] !== motion);
      const hasBranches = segments.length > 0 || turns.size > 0 || transitions.length > 0;
      if (changed || (routeChanged && hasBranches)) {
        drawBranches(branches, state, segments, turns.values(), transitions);
        previousBranches = segments;
        previousTurns = turns;
        previousTransitions = transitions;
      }
    }
    const proposal = preview?.route;
    if (proposal === undefined) {
      previewRouteLine.visible = false;
    } else if (
      levelChanged ||
      previousProposal === undefined ||
      !sameRoute(previousProposal, proposal)
    ) {
      drawRoute(previewRouteLine, state.level, proposal, PREVIEW_ROUTE_LIFT);
    }
    range.visible = preview !== undefined && preview.range > 0;
    if (preview !== undefined) {
      const { x, y } = cellPoint(state.level, preview.cell);
      range.position.set(x, 0, y);
      range.scale.set(preview.range, 1, preview.range);
    }
    lastState = state;
    lastInterpolationState = interpolationState;
    previousProposal = proposal;
  };

  return {
    group,
    towerHeight: (kind) => modelFor(kind).height,
    // Core picking uses terrain layers for height and tiles for half-width.
    towerStructure: (tower) => {
      const { height, halfWidth } = modelFor(tower.kind);
      const markers = tower.level > 1 ? LEVEL_MARKER_GAP + LEVEL_MARKER_SIZE : 0;
      return { height: (height + markers) / LAYER_HEIGHT, halfWidth };
    },
    update,
  };
}
