import { type CellIndex, cellPoint, type Enemy, type GameState, type GridPoint } from '../core';
import { nextCell } from '../core/pathing';
import { sampleRoute } from './route-curve';

interface Route {
  readonly cells: readonly CellIndex[];
  readonly points: readonly GridPoint[];
}

export interface EnemyMotion {
  readonly enemy: Enemy;
  readonly distance: GameState['distance'];
  readonly route: Route;
  /** Previous and current tick positions, measured in cell steps along route. */
  readonly start: number;
  readonly end: number;
  /** Both offsets here refer to the former route. */
  readonly reroute?: { readonly route: Route; readonly start: number; readonly sharedEnd: number };
}

function plotRoute(state: GameState, enemy: Enemy, incoming?: CellIndex): Route {
  const cells = incoming === undefined ? [enemy.from] : [incoming, enemy.from];
  if (enemy.to !== enemy.from) cells.push(enemy.to);
  let cell = nextCell(state.level, state.distance, enemy.to);
  while (cell !== undefined) {
    cells.push(cell);
    cell = nextCell(state.level, state.distance, cell);
  }
  return { cells, points: cells.map((cell) => cellPoint(state.level, cell)) };
}

export function enemyMotion(state: GameState, enemy: Enemy, before?: EnemyMotion): EnemyMotion {
  if (before === undefined) {
    return {
      enemy,
      distance: state.distance,
      route: plotRoute(state, enemy),
      start: enemy.progress,
      end: enemy.progress,
    };
  }

  const startIndex = Math.floor(before.end);
  const incoming = before.route.cells[startIndex - 1];
  const rerouted = state.distance !== before.distance;
  const offset = rerouted ? (incoming === undefined ? 0 : 1) : startIndex;
  // Keep the edge the enemy already committed to. The distance field chooses subsequent edges.
  const route = rerouted ? plotRoute(state, before.enemy, incoming) : before.route;
  const start = offset + before.enemy.progress;
  let endIndex = offset;
  for (; endIndex < route.cells.length; endIndex++) {
    if (route.cells[endIndex] !== enemy.from) continue;
    if (enemy.from === enemy.to ? endIndex >= start : route.cells[endIndex + 1] === enemy.to) break;
  }
  if (endIndex === route.cells.length) return enemyMotion(state, enemy);

  const motion = { enemy, distance: state.distance, route, start, end: endIndex + enemy.progress };
  if (!rerouted) return motion;
  let shared = 0;
  while (
    offset + shared < route.cells.length &&
    route.cells[offset + shared] === before.route.cells[startIndex + shared]
  ) {
    shared++;
  }
  if (offset + shared === route.cells.length && startIndex + shared === before.route.cells.length) {
    return motion;
  }
  return {
    ...motion,
    reroute: { route: before.route, start: before.end, sharedEnd: startIndex + shared - 1 },
  };
}

function pointAt(route: Route, steps: number): GridPoint {
  return sampleRoute(route.points, steps / Math.max(1, route.points.length - 1));
}

export function sampleEnemyMotion(motion: EnemyMotion, alpha: number): GridPoint {
  const { route, start, end, reroute } = motion;
  const traveled = (end - start) * alpha;
  const point = pointAt(route, start + traveled);
  if (reroute === undefined || alpha === 1) return point;

  // Keep the frame continuous when a turn changes underneath an approaching enemy. The old
  // route contributes only up to the fork, and the blend ends before leaving the fork's cell.
  const sharedEnd = Math.max(reroute.start, reroute.sharedEnd);
  const old = pointAt(reroute.route, Math.min(sharedEnd, reroute.start + traveled));
  const blendDistance = Math.min(end - start, sharedEnd + 0.5 - reroute.start);
  const blend = blendDistance > 0 ? Math.min(1, traveled / blendDistance) : alpha;
  return { x: old.x + (point.x - old.x) * blend, y: old.y + (point.y - old.y) * blend };
}

/** Face the tangent of the displayed path, including the blend during a reroute. */
export function enemyHeading(motion: EnemyMotion, alpha: number): number {
  const delta = 0.001;
  const from =
    motion.start === motion.end
      ? pointAt(motion.route, motion.start - delta)
      : sampleEnemyMotion(motion, Math.max(0, alpha - delta));
  const to =
    motion.start === motion.end
      ? pointAt(motion.route, motion.end + delta)
      : sampleEnemyMotion(motion, Math.min(1, alpha + delta));
  return Math.atan2(to.x - from.x, to.y - from.y);
}
