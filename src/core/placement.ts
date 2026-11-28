import type { GameState, Tower } from './game';
import type { CellIndex, Level } from './level';
import { type DistanceField, distanceField, nextCell } from './pathing';

export type PlacementRejection =
  | 'disconnectedRoute'
  | 'enemyOnCell'
  | 'gameOver'
  | 'insufficientFunds'
  | 'unbuildableCell'
  | 'occupiedCell'
  | 'trappedEnemy'
  | 'unknownTower'
  | 'wrongTick';

export interface PlacementPreview {
  readonly reason: PlacementRejection | undefined;
  readonly route: readonly CellIndex[];
  readonly rangeAtGround: number;
  readonly heightBonus: number;
}

type PlacementCheck =
  | { readonly reason: PlacementRejection; readonly distance: DistanceField }
  | {
      readonly reason: undefined;
      readonly distance: DistanceField;
      readonly tower: Tower;
      readonly cost: number;
    };

function gameOver(state: GameState): boolean {
  return state.phase === 'victory' || state.phase === 'defeat';
}

export function checkPlacement(state: GameState, cell: CellIndex, kind: string): PlacementCheck {
  if (gameOver(state)) return { reason: 'gameOver', distance: state.distance };
  const { level, towers } = state;
  const terrain = level.cells[cell];
  if (
    terrain === undefined ||
    terrain.buildable === false ||
    terrain.ramp ||
    cell === level.spawn ||
    cell === level.goal
  ) {
    return { reason: 'unbuildableCell', distance: state.distance };
  }
  if (towers.some((tower) => tower.cell === cell)) {
    return { reason: 'occupiedCell', distance: state.distance };
  }
  const definition = towerDefinition(state, kind);
  if (definition === undefined) {
    return { reason: 'unknownTower', distance: state.distance };
  }
  const distance = terrain.lane
    ? distanceField(level, new Set([...towers.map((tower) => tower.cell), cell]))
    : state.distance;
  if (!canAffordTower(state, kind)) {
    return { reason: 'insufficientFunds', distance };
  }
  if (
    state.enemies.some((enemy) => {
      const next = enemy.from === enemy.to ? nextCell(level, state.distance, enemy.from) : enemy.to;
      return enemy.from === cell || next === cell;
    })
  ) {
    return { reason: 'enemyOnCell', distance };
  }
  if (distance[level.spawn] === Number.POSITIVE_INFINITY) {
    return { reason: 'disconnectedRoute', distance };
  }
  // 已在移動的敵人會先走完這一步，再從這一步的目的地重新選路。
  if (state.enemies.some((enemy) => distance[enemy.to] === Number.POSITIVE_INFINITY)) {
    return { reason: 'trappedEnemy', distance };
  }

  return {
    reason: undefined,
    distance,
    tower: {
      cell,
      kind,
      layer: terrain.layer,
      level: 1,
      invested: definition.cost,
      waveNumberAtPlacement: state.waveNumber,
      nextShotTick: state.tick,
      firingStartTick: state.tick,
      shotsSinceFiringStart: 0,
    },
    cost: definition.cost,
  };
}

function routeFromSpawn(level: Level, distance: DistanceField): readonly CellIndex[] {
  if (distance[level.spawn] === Number.POSITIVE_INFINITY) return [];

  const route: CellIndex[] = [];
  let cell: CellIndex | undefined = level.spawn;
  while (cell !== undefined) {
    route.push(cell);
    cell = nextCell(level, distance, cell);
  }
  return route;
}

function towerDefinition(state: GameState, kind: string) {
  return Object.hasOwn(state.towerDefinitions, kind) ? state.towerDefinitions[kind] : undefined;
}

export function canAffordTower(state: GameState, kind: string): boolean {
  const definition = towerDefinition(state, kind);
  return definition !== undefined && state.money >= definition.cost;
}

export function rangeBonusForLayers(state: GameState, towerLayer: number, targetLayer: number) {
  return Math.max(0, towerLayer - targetLayer) * state.heightRangeBonus;
}

export function currentRoute(state: GameState): readonly CellIndex[] {
  return routeFromSpawn(state.level, state.distance);
}

export interface RouteSegment {
  readonly from: CellIndex;
  readonly to: CellIndex;
}

function segmentKey(from: CellIndex, to: CellIndex): string {
  return `${Math.min(from, to)}:${Math.max(from, to)}`;
}

/** 場上敵人會經過、但入口到終點的目前路線未涵蓋的路段。 */
export function enemyRouteSegments(
  state: GameState,
  previous?: GameState,
): readonly RouteSegment[] {
  if (state.enemies.length === 0) return [];

  const route = currentRoute(state);
  const connected = new Set(route);
  const seen = new Set<string>();
  let previousCell: CellIndex | undefined;
  for (const cell of route) {
    if (previousCell !== undefined) seen.add(segmentKey(previousCell, cell));
    previousCell = cell;
  }

  const segments: RouteSegment[] = [];
  const add = (from: CellIndex, to: CellIndex) => {
    const key = segmentKey(from, to);
    if (seen.has(key)) return;
    seen.add(key);
    segments.push({ from, to });
  };

  for (const enemy of state.enemies) {
    if (enemy.from !== enemy.to) add(enemy.from, enemy.to);
    let from = enemy.to;
    while (!connected.has(from)) {
      const to = nextCell(state.level, state.distance, from);
      if (to === undefined) break;
      add(from, to);
      connected.add(from);
      from = to;
    }
  }
  // 內插中的敵人還可能位於上一 tick 的路段，即使已經回到目前路線。
  if (previous?.level === state.level && previous.tick === state.tick - 1) {
    const alive = new Set(state.enemies.map((enemy) => enemy.id));
    for (const enemy of previous.enemies) {
      if (enemy.from !== enemy.to && alive.has(enemy.id)) add(enemy.from, enemy.to);
    }
  }
  return segments;
}

/** 同一格、同一塔種的預覽可否沿用。敵人在同一段上的移動比例不影響放塔。 */
export function samePlacementPreviewInputs(a: GameState, b: GameState): boolean {
  return (
    gameOver(a) === gameOver(b) &&
    a.level === b.level &&
    a.distance === b.distance &&
    a.towers === b.towers &&
    a.towerDefinitions === b.towerDefinitions &&
    a.heightRangeBonus === b.heightRangeBonus &&
    a.money === b.money &&
    (a.enemies === b.enemies ||
      (a.enemies.length === b.enemies.length &&
        a.enemies.every(({ from, to }, i) => {
          const enemy = b.enemies[i];
          return enemy?.from === from && enemy.to === to;
        })))
  );
}

export function previewPlacement(
  state: GameState,
  cell: CellIndex,
  kind: string,
): PlacementPreview {
  const { reason, distance } = checkPlacement(state, cell, kind);
  const layer = state.level.cells[cell]?.layer ?? 0;
  const heightBonus = rangeBonusForLayers(state, layer, 0);
  const range = towerDefinition(state, kind)?.range ?? 0;
  return {
    reason,
    route: routeFromSpawn(state.level, distance),
    rangeAtGround: range + heightBonus,
    heightBonus,
  };
}
