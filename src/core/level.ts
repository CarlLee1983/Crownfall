export type CellIndex = number & { readonly __brand: 'CellIndex' };

export interface Cell {
  readonly layer: number;
  readonly lane: boolean;
  readonly ramp: boolean;
  readonly buildable?: false;
  readonly platform?: true;
}

export interface Level {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly Cell[];
  readonly spawn: CellIndex;
  readonly goal: CellIndex;
}

export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

/** 半寬以格為單位。平台的地形與點選共用同一個尺寸。 */
export const PLATFORM_HALF_WIDTH = 1.45;

type Marker = 'spawn' | 'goal';

const LEGEND: Readonly<Record<string, Cell & { readonly marker?: Marker }>> = {
  '.': { layer: 0, lane: false, ramp: false },
  '~': { layer: 0, lane: false, ramp: false, buildable: false },
  P: { layer: 1, lane: false, ramp: false, platform: true },
  '#': { layer: 1, lane: false, ramp: false },
  '=': { layer: 0, lane: true, ramp: false },
  '+': { layer: 1, lane: true, ramp: false },
  '^': { layer: 0, lane: true, ramp: true },
  S: { layer: 0, lane: true, ramp: false, marker: 'spawn' },
  s: { layer: 1, lane: true, ramp: false, marker: 'spawn' },
  G: { layer: 0, lane: true, ramp: false, marker: 'goal' },
  g: { layer: 1, lane: true, ramp: false, marker: 'goal' },
};

/**
 * 從字元圖建立關卡：`.` 低地、`#` 高地、`=` 低層車道、`+` 高層車道、`^` 坡道、
 * `~` 裝飾草地、`P` 固定高台、`S`／`s` 低層／高層入口、`G`／`g` 低層／高層終點。
 */
export function parseLevel(rows: readonly string[]): Level {
  const width = rows[0]?.length ?? 0;
  if (width === 0) throw new Error('關卡至少要有一格');
  const cells: Cell[] = [];
  const markers: Record<Marker, CellIndex[]> = { spawn: [], goal: [] };

  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`關卡第 ${y} 列寬度 ${row.length}，應為 ${width}`);
    [...row].forEach((symbol, x) => {
      const entry = LEGEND[symbol];
      if (entry === undefined) throw new Error(`關卡 (${x}, ${y}) 有未知字元「${symbol}」`);
      const { marker, ...cell } = entry;
      if (marker !== undefined) markers[marker].push(cellIndex(width, x, y));
      cells.push(cell);
    });
  });

  const [spawn, ...extraSpawns] = markers.spawn;
  const [goal, ...extraGoals] = markers.goal;
  if (spawn === undefined || extraSpawns.length > 0) throw new Error('關卡必須剛好有一個入口');
  if (goal === undefined || extraGoals.length > 0) throw new Error('關卡必須剛好有一個終點');
  return { width, height: rows.length, cells, spawn, goal };
}

export function cellIndex(width: number, x: number, y: number): CellIndex {
  return (y * width + x) as CellIndex;
}

export function cellPoint(level: Level, index: CellIndex): GridPoint {
  return { x: index % level.width, y: Math.floor(index / level.width) };
}

export interface Direction {
  readonly dx: number;
  readonly dy: number;
}

// 固定順序（北、東、南、西）讓同距離時的選路可重現。
const DIRECTIONS: readonly Direction[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

export interface Neighbor {
  readonly index: CellIndex;
  readonly direction: Direction;
}

/** 四向相鄰且在關卡內的格子，順序固定。 */
export function neighbors(level: Level, index: CellIndex): Neighbor[] {
  const { x, y } = cellPoint(level, index);
  return DIRECTIONS.flatMap((direction) => {
    const nx = x + direction.dx;
    const ny = y + direction.dy;
    const inside = nx >= 0 && ny >= 0 && nx < level.width && ny < level.height;
    return inside ? [{ index: cellIndex(level.width, nx, ny), direction }] : [];
  });
}

export function cellAt(level: Level, index: CellIndex): Cell {
  const cell = level.cells[index];
  if (cell === undefined) throw new Error(`格子 ${index} 不在關卡內`);
  return cell;
}
