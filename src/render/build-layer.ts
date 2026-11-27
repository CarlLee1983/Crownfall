import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
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
  type Tower,
} from '../core';
import { LAYER_HEIGHT } from './terrain';

const SOLID_ROUTE_LIFT = 0.035;

function towerModel(geometry: BufferGeometry, height: number, halfWidth: number, color: number) {
  return {
    geometry: geometry.translate(0, height / 2, 0),
    height,
    halfWidth,
    material: new MeshLambertMaterial({ color }),
  };
}

const BASIC_MODEL = towerModel(new BoxGeometry(0.64, 0.6, 0.64), 0.6, 0.32, 0x57a4da);
const TOWER_MODELS = new Map([
  ['basic', BASIC_MODEL],
  ['sniper', towerModel(new CylinderGeometry(0.23, 0.32, 0.94, 6), 0.94, 0.32, 0xeeaa48)],
  ['splash', towerModel(new ConeGeometry(0.42, 0.54, 8), 0.54, 0.42, 0xc381dc)],
]);

const LEVEL_MARKER_SIZE = 0.13;
const LEVEL_MARKER_GAP = 0.08;
const LEVEL_MARKER = {
  geometry: new BoxGeometry(LEVEL_MARKER_SIZE, LEVEL_MARKER_SIZE, LEVEL_MARKER_SIZE),
  material: new MeshLambertMaterial({ color: 0xffd34d, emissive: 0x4a3200 }),
};

/** 塔頂一排金色方塊，數量是升過的段數。 */
function towerMesh(tower: Tower, level: Level): Group {
  const model = TOWER_MODELS.get(tower.kind) ?? BASIC_MODEL;
  const group = new Group();
  group.add(new Mesh(model.geometry, model.material));
  const upgrades = tower.level - 1;
  const spacing = LEVEL_MARKER_SIZE + LEVEL_MARKER_GAP;
  for (let i = 0; i < upgrades; i++) {
    const marker = new Mesh(LEVEL_MARKER.geometry, LEVEL_MARKER.material);
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

export function towerHeight(kind: string): number {
  return (TOWER_MODELS.get(kind) ?? BASIC_MODEL).height;
}

/** 給 core picking 的塔柱，以高度層與格為單位；等級方塊也算在可點範圍內。 */
export function towerStructure(tower: Tower): Structure {
  const model = TOWER_MODELS.get(tower.kind) ?? BASIC_MODEL;
  const markers = tower.level > 1 ? LEVEL_MARKER_GAP + LEVEL_MARKER_SIZE : 0;
  return { height: (model.height + markers) / LAYER_HEIGHT, halfWidth: model.halfWidth };
}

interface BuildPreview {
  readonly cell: CellIndex;
  readonly range: number;
  readonly route?: readonly CellIndex[];
}

interface BuildLayer {
  readonly group: Group;
  update(previous: GameState, state: GameState, alpha: number, preview?: BuildPreview): void;
}

function routePoint(level: Level, point: GridPoint, lift: number): [number, number, number] {
  return [point.x, groundHeight(level, point) * LAYER_HEIGHT + lift, point.y];
}

// 在格子邊緣開始爬坡，避免連線切進坡面。
function edgeMidpoint(from: GridPoint, to: GridPoint): GridPoint {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

function drawRoute(line: Line2, level: Level, route: readonly CellIndex[], lift: number): void {
  line.visible = route.length > 1;
  if (!line.visible) return;

  const positions: number[] = [];
  for (const [i, cell] of route.entries()) {
    const point = cellPoint(level, cell);
    positions.push(...routePoint(level, point, lift));
    const next = route[i + 1];
    if (next === undefined) continue;
    positions.push(...routePoint(level, edgeMidpoint(point, cellPoint(level, next)), lift));
  }

  line.geometry.dispose();
  line.geometry = new LineGeometry().setPositions(positions);
  if (line.material.dashed) line.computeLineDistances();
}

function drawBranches(line: LineSegments2, level: Level, segments: readonly RouteSegment[]): void {
  const positions: number[] = [];
  for (const { from, to } of segments) {
    const start = cellPoint(level, from);
    const end = cellPoint(level, to);
    const middle = routePoint(level, edgeMidpoint(start, end), SOLID_ROUTE_LIFT);
    positions.push(
      ...routePoint(level, start, SOLID_ROUTE_LIFT),
      ...middle,
      ...middle,
      ...routePoint(level, end, SOLID_ROUTE_LIFT),
    );
  }
  line.geometry.dispose();
  line.geometry = new LineSegmentsGeometry();
  line.visible = positions.length > 0;
  if (line.visible) line.geometry.setPositions(positions);
}

function sameRoute(a: readonly CellIndex[], b: readonly CellIndex[]): boolean {
  return a === b || (a.length === b.length && a.every((cell, i) => cell === b[i]));
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

export function createBuildLayer(): BuildLayer {
  const group = new Group();
  const towers = new Group();
  const solid = new Line2(
    new LineGeometry(),
    new LineMaterial({ color: 0x1e6e78, linewidth: 4, alphaToCoverage: true }),
  );
  const branches = new LineSegments2(new LineSegmentsGeometry(), solid.material);
  const dashed = new Line2(
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
  solid.visible = branches.visible = dashed.visible = range.visible = false;
  group.add(towers, solid, dashed, range, branches);

  let lastState: GameState | undefined;
  let lastInterpolationState: GameState | undefined;
  let previousBranches: readonly RouteSegment[] = [];
  let previousProposal: readonly CellIndex[] | undefined;

  const update = (
    previous: GameState,
    state: GameState,
    alpha: number,
    preview?: BuildPreview,
  ): void => {
    const levelChanged = lastState?.level !== state.level;
    if (levelChanged || !sameTowerLayout(lastState?.towers, state.towers)) {
      towers.clear();
      for (const tower of state.towers) towers.add(towerMesh(tower, state.level));
    }
    if (levelChanged || lastState?.distance !== state.distance) {
      drawRoute(solid, state.level, currentRoute(state), SOLID_ROUTE_LIFT);
    }
    const interpolationState = alpha < 1 ? previous : undefined;
    if (lastState !== state || lastInterpolationState !== interpolationState) {
      const segments = enemyRouteSegments(state, interpolationState);
      const changed =
        segments.length !== previousBranches.length ||
        segments.some(({ from, to }, i) => {
          const prior = previousBranches[i];
          return !(
            (prior?.from === from && prior.to === to) ||
            (prior?.from === to && prior.to === from)
          );
        });
      if (changed || (levelChanged && segments.length > 0)) {
        drawBranches(branches, state.level, segments);
        previousBranches = segments;
      }
    }
    const proposal = preview?.route;
    if (proposal === undefined) {
      dashed.visible = false;
    } else if (
      levelChanged ||
      previousProposal === undefined ||
      !sameRoute(previousProposal, proposal)
    ) {
      drawRoute(dashed, state.level, proposal, 0.065);
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
    update,
  };
}
