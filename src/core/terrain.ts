import {
  type CellIndex,
  cellAt,
  cellIndex,
  cellPoint,
  type Direction,
  type GridPoint,
  type Level,
  neighbors,
} from './level';

function risingDirections(level: Level, index: CellIndex): Direction[] {
  const cell = cellAt(level, index);
  if (!cell.ramp) return [];
  return neighbors(level, index)
    .filter(({ index: next }) => {
      const neighbor = cellAt(level, next);
      return neighbor.lane && neighbor.layer > cell.layer;
    })
    .map(({ direction }) => direction);
}

/** 坡道上升的方向：朝向比它高的相鄰車道格。非坡道時為 undefined。 */
export function rampDirection(level: Level, index: CellIndex): Direction | undefined {
  return risingDirections(level, index)[0];
}

/** 每座坡道必須剛好朝一個方向上升，斜面的畫法與敵人換層的位置才會一致。 */
export function assertRampsRiseOneWay(level: Level): void {
  level.cells.forEach((_, i) => {
    const index = i as CellIndex;
    if (!cellAt(level, index).ramp) return;
    const rises = risingDirections(level, index).length;
    if (rises !== 1) {
      const { x, y } = cellPoint(level, index);
      throw new Error(`坡道 (${x}, ${y}) 有 ${rises} 個較高的相鄰車道格，應剛好 1 個`);
    }
  });
}

/**
 * 格座標上一點的地表高度，以高度層為單位；格子 (x, y) 的中心是 (x, y)。
 * 坡道沿上升方向從它的層線性升到高一層，關卡外是 0。
 */
export function groundHeight(level: Level, point: GridPoint): number {
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return 0;
  const index = cellIndex(level.width, x, y);
  const layer = cellAt(level, index).layer;
  const rise = rampDirection(level, index);
  if (rise === undefined) return layer;
  const along = (point.x - x) * rise.dx + (point.y - y) * rise.dy;
  return layer + Math.min(1, Math.max(0, along + 0.5));
}
