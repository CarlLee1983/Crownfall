import { type CellIndex, cellAt, type Level, neighbors } from './level';

export type DistanceField = readonly number[];

/** 相鄰兩格同層可走；不同層時只有其中一格是坡道才能走，否則是峭壁。 */
function canStep(level: Level, a: CellIndex, b: CellIndex): boolean {
  const from = cellAt(level, a);
  const to = cellAt(level, b);
  if (!from.lane || !to.lane) return false;
  return from.layer === to.layer || from.ramp || to.ramp;
}

/** 從終點反推每格沿車道到終點的步數；走不到的格子是 Infinity。 */
export function distanceField(level: Level): DistanceField {
  const distance = level.cells.map(() => Number.POSITIVE_INFINITY);
  distance[level.goal] = 0;
  const queue: CellIndex[] = [level.goal];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head] as CellIndex;
    const next = (distance[current] ?? 0) + 1;
    for (const { index: neighbor } of neighbors(level, current)) {
      if (distance[neighbor] !== Number.POSITIVE_INFINITY) continue;
      if (!canStep(level, current, neighbor)) continue;
      distance[neighbor] = next;
      queue.push(neighbor);
    }
  }
  return distance;
}

/** 往終點更近一步的相鄰格；已在終點或無路可走時回傳 undefined。 */
export function nextCell(
  level: Level,
  field: DistanceField,
  from: CellIndex,
): CellIndex | undefined {
  let best: CellIndex | undefined;
  let bestDistance = field[from] ?? Number.POSITIVE_INFINITY;
  for (const { index: neighbor } of neighbors(level, from)) {
    const distance = field[neighbor] ?? Number.POSITIVE_INFINITY;
    if (distance < bestDistance && canStep(level, from, neighbor)) {
      best = neighbor;
      bestDistance = distance;
    }
  }
  return best;
}
