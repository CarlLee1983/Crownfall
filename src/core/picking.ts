import { type CellIndex, cellPoint, type Level } from './level';
import { rampDirection } from './terrain';

interface TerrainPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** x、z 以格為單位，y 以高度層為單位。方向向量不必正規化。 */
export interface TerrainRay {
  readonly origin: TerrainPoint;
  readonly direction: TerrainPoint;
}

/** 立在平地格中央的方柱：高度以高度層為單位、從格子地表起算，半寬以格為單位。 */
export interface Structure {
  readonly height: number;
  readonly halfWidth: number;
}

/** 射線在單一水平軸上位於 ±half 之內的區間。 */
function cellInterval(
  origin: number,
  direction: number,
  half = 0.5,
): readonly [number, number] | undefined {
  if (direction === 0) return Math.abs(origin) <= half ? [-Infinity, Infinity] : undefined;
  const first = (-half - origin) / direction;
  const second = (half - origin) / direction;
  return [Math.min(first, second), Math.max(first, second)];
}

/** 射線最先碰到方柱（頂面或側面）的參數，沒碰到時回傳 undefined。 */
function structureHit(
  ray: TerrainRay,
  center: { readonly x: number; readonly z: number },
  top: number,
  halfWidth: number,
): number | undefined {
  const { origin, direction } = ray;
  const alongX = cellInterval(origin.x - center.x, direction.x, halfWidth);
  const alongZ = cellInterval(origin.z - center.z, direction.z, halfWidth);
  if (alongX === undefined || alongZ === undefined) return undefined;
  const enter = Math.max(alongX[0], alongZ[0]);
  const exit = Math.min(alongX[1], alongZ[1]);
  const start = Math.max(0, enter);
  if (exit < start) return undefined;
  const heightAtStart = origin.y + start * direction.y;
  if (heightAtStart >= 0 && heightAtStart <= top) return start;
  if (direction.y === 0) return undefined;
  const reachesTop = (top - origin.y) / direction.y;
  return reachesTop >= start && reachesTop <= exit ? reachesTop : undefined;
}

/**
 * 找出射線最先碰到的地表格（包含峭壁與射線起點）。
 * `structures` 是格子上的塔；只用於平地格，坡道不能建塔。
 */
export function pickCell(
  level: Level,
  ray: TerrainRay,
  structures: ReadonlyMap<CellIndex, Structure> = new Map(),
): CellIndex | undefined {
  const { origin, direction } = ray;
  let closest = Infinity;
  let closestOnlyTouchesCoplanarEdge = false;
  let picked: CellIndex | undefined;
  for (const [i, cell] of level.cells.entries()) {
    const index = i as CellIndex;
    const { x, y: z } = cellPoint(level, index);
    const structure = structures.get(index);
    const towerHit =
      structure && structureHit(ray, { x, z }, cell.layer + structure.height, structure.halfWidth);
    if (towerHit !== undefined && towerHit < closest) {
      closest = towerHit;
      closestOnlyTouchesCoplanarEdge = false;
      picked = index;
    }
    const alongX = cellInterval(origin.x - x, direction.x);
    const alongZ = cellInterval(origin.z - z, direction.z);
    if (alongX === undefined || alongZ === undefined) continue;
    const enter = Math.max(alongX[0], alongZ[0]);
    const exit = Math.min(alongX[1], alongZ[1]);
    const start = Math.max(0, enter);
    if (exit < start || start > closest) continue;

    const rise = rampDirection(level, index);
    let aboveRayOrigin = cell.layer - origin.y;
    let approach = direction.y;
    if (rise !== undefined) {
      aboveRayOrigin += (origin.x - x) * rise.dx + (origin.z - z) * rise.dy + 0.5;
      approach -= direction.x * rise.dx + direction.z * rise.dy;
    }

    // 射線沿著地表時，同一交點優先選接下來仍位於射線上的格子。
    const coplanar = approach === 0 && aboveRayOrigin === 0;
    const top = coplanar ? start : aboveRayOrigin / approach;
    const entersOnTie = closestOnlyTouchesCoplanarEdge && coplanar && top === closest && top < exit;
    if (top >= start && top <= exit && (top < closest || entersOnTie)) {
      closest = top;
      closestOnlyTouchesCoplanarEdge = coplanar && top === exit;
      picked = index;
    }

    // 從側面進入時，碰到的是 0 層與地表間裸露的峭壁。
    const entryHeight = origin.y + enter * direction.y;
    if (enter >= 0 && enter < closest && entryHeight >= 0 && enter * approach <= aboveRayOrigin) {
      closest = enter;
      closestOnlyTouchesCoplanarEdge = false;
      picked = index;
    }
  }
  return picked;
}
