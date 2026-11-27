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

/** 射線在單一水平軸上位於格子內的區間。 */
function cellInterval(origin: number, direction: number): readonly [number, number] | undefined {
  if (direction === 0) return Math.abs(origin) <= 0.5 ? [-Infinity, Infinity] : undefined;
  const first = (-0.5 - origin) / direction;
  const second = (0.5 - origin) / direction;
  return [Math.min(first, second), Math.max(first, second)];
}

/** 找出射線最先碰到的地表格（包含峭壁與射線起點）。 */
export function pickCell(level: Level, ray: TerrainRay): CellIndex | undefined {
  const { origin, direction } = ray;
  let closest = Infinity;
  let closestOnlyTouchesCoplanarEdge = false;
  let picked: CellIndex | undefined;
  for (const [i, cell] of level.cells.entries()) {
    const index = i as CellIndex;
    const { x, y: z } = cellPoint(level, index);
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
