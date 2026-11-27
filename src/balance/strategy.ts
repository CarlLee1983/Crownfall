import {
  type CellIndex,
  canAffordTower,
  cellAt,
  cellPoint,
  currentRoute,
  type GameState,
  type Level,
  previewPlacement,
  step,
  type TowerDefinition,
} from '../core';
import { neighbors } from '../core/level';
import { rangeBonusForLayers } from '../core/placement';

export type Strategy = 'reference' | 'platform' | 'roadblock';

// Count in-range route cells as in the level-layout prototype, weighted by nominal DPS.
function coverageScore(
  state: GameState,
  route: readonly CellIndex[],
  cell: CellIndex,
  tower: TowerDefinition,
): number {
  const { x, y } = cellPoint(state.level, cell);
  const layer = cellAt(state.level, cell).layer;
  const covered = route.filter((target) => {
    const point = cellPoint(state.level, target);
    const targetLayer = cellAt(state.level, target).layer;
    const range = tower.range + rangeBonusForLayers(state, layer, targetLayer);
    return (point.x - x) ** 2 + (point.y - y) ** 2 <= range ** 2;
  }).length;
  return covered * tower.damage * tower.shotsPerSecond;
}

function existingCoverageScore(state: GameState, route: readonly CellIndex[]): number {
  let score = 0;
  for (const tower of state.towers) {
    const definition = state.towerDefinitions[tower.kind];
    if (definition !== undefined) score += coverageScore(state, route, tower.cell, definition);
  }
  return score;
}

// A platform borders a lower lane without bordering a lane at its own height.
function platformCells(level: Level): ReadonlySet<CellIndex> {
  const platforms = new Set<CellIndex>();
  const visited = new Set<CellIndex>();
  for (const [index, terrain] of level.cells.entries()) {
    const start = index as CellIndex;
    if (terrain.lane || terrain.layer === 0 || visited.has(start)) continue;

    const region = [start];
    visited.add(start);
    let bordersLowerLane = false;
    let bordersSameHeightLane = false;
    for (const cell of region) {
      for (const { index: neighbor } of neighbors(level, cell)) {
        const adjacent = cellAt(level, neighbor);
        if (adjacent.lane) {
          bordersLowerLane ||= adjacent.layer < terrain.layer;
          bordersSameHeightLane ||= adjacent.layer === terrain.layer;
        } else if (adjacent.layer === terrain.layer && !visited.has(neighbor)) {
          visited.add(neighbor);
          region.push(neighbor);
        }
      }
    }
    if (bordersLowerLane && !bordersSameHeightLane) {
      for (const cell of region) platforms.add(cell);
    }
  }
  return platforms;
}

function bestPlacement(state: GameState, strategy: Strategy, platforms: ReadonlySet<CellIndex>) {
  const route = currentRoute(state);
  const existing = existingCoverageScore(state, route);
  const affordable = Object.entries(state.towerDefinitions).filter(([kind]) =>
    canAffordTower(state, kind),
  );
  const firstAffordableKind = affordable[0]?.[0];
  if (firstAffordableKind === undefined) return undefined;

  let best: { cell: CellIndex; kind: string; score: number } | undefined;
  for (const [index, terrain] of state.level.cells.entries()) {
    const cell = index as CellIndex;
    const eligible = terrain.lane ? strategy !== 'platform' : platforms.has(cell);
    if (!eligible) continue;

    // With affordability checked, legality and the reroute are the same for every tower kind.
    const preview = previewPlacement(state, cell, firstAffordableKind);
    if (preview.reason !== undefined) continue;

    // A roadblock can gain or lose coverage for towers already on the board.
    const coverageDelta = terrain.lane ? existingCoverageScore(state, preview.route) - existing : 0;
    for (const [kind, tower] of affordable) {
      const score = (coverageScore(state, preview.route, cell, tower) + coverageDelta) / tower.cost;
      if (best === undefined || score > best.score) best = { cell, kind, score };
    }
  }
  return best;
}

export function build(state: GameState, strategy: Strategy): GameState {
  const platforms = strategy === 'roadblock' ? new Set<CellIndex>() : platformCells(state.level);
  let current = state;
  while (true) {
    const placement = bestPlacement(current, strategy, platforms);
    if (placement === undefined) return current;

    const { cell, kind } = placement;
    const result = step(current, [{ type: 'placeTower', tick: current.tick, cell, kind }]);
    const rejection = result.events.find((event) => event.type === 'rejected');
    if (rejection !== undefined) {
      throw new Error(`Balance placement at cell ${cell} rejected (${rejection.reason})`);
    }
    current = result.state;
  }
}
