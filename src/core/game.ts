import { TICKS_PER_SECOND } from './clock';
import type { Content } from './content';
import { type CellIndex, cellPoint, type GridPoint, type Level } from './level';
import { type DistanceField, distanceField, nextCell } from './pathing';
import { checkPlacement, type PlacementRejection } from './placement';
import { assertRampsRiseOneWay } from './terrain';

export type EnemyId = number & { readonly __brand: 'EnemyId' };

export interface Enemy {
  readonly id: EnemyId;
  readonly kind: string;
  /** 敵人離開的格子；停在格子中央時 from 與 to 相同。 */
  readonly from: CellIndex;
  readonly to: CellIndex;
  /** 從 from 往 to 已走的比例，0–1。 */
  readonly progress: number;
}

export interface Tower {
  readonly cell: CellIndex;
  readonly kind: string;
  /** 塔所在格的高度層。 */
  readonly layer: number;
}

interface EnemyRules {
  readonly speedPerTick: number;
}

interface PendingSpawn {
  readonly kind: string;
  readonly tick: number;
}

export interface GameState {
  readonly tick: number;
  readonly level: Level;
  readonly money: number;
  readonly towers: readonly Tower[];
  readonly towerDefinitions: Content['towers'];
  readonly heightRangeBonus: number;
  readonly enemyRules: Readonly<Record<string, EnemyRules>>;
  readonly distance: DistanceField;
  readonly enemies: readonly Enemy[];
  readonly nextEnemyId: EnemyId;
  /** 依 tick 排序的待出兵清單。 */
  readonly pendingSpawns: readonly PendingSpawn[];
}

export type Command = {
  readonly type: 'placeTower';
  /** 要套用這筆指令的輸入狀態 tick。 */
  readonly tick: number;
  readonly cell: CellIndex;
  readonly kind: string;
};

export type GameEvent =
  | { readonly type: 'leaked'; readonly enemyId: EnemyId; readonly enemyKind: string }
  | { readonly type: 'rejected'; readonly cell: CellIndex; readonly reason: PlacementRejection };

export interface StepResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

const secondsToTicks = (seconds: number): number => Math.round(seconds * TICKS_PER_SECOND);

export function createGame(content: Content, level: Level): GameState {
  assertRampsRiseOneWay(level);
  const distance = distanceField(level);
  if (distance[level.spawn] === Number.POSITIVE_INFINITY) {
    throw new Error('關卡的入口沿車道走不到終點');
  }

  const enemyRules = Object.fromEntries(
    Object.entries<Content['enemies'][string]>(content.enemies).map(([kind, definition]) => [
      kind,
      { speedPerTick: definition.speed / TICKS_PER_SECOND },
    ]),
  );

  // 還沒有開波指令，第一波在開局時直接開始。
  const firstWave = content.waves[0]?.groups ?? [];
  const pendingSpawns = firstWave
    .flatMap((group) => {
      if (enemyRules[group.enemy] === undefined)
        throw new Error(`未知的敵人種類「${group.enemy}」`);
      return Array.from({ length: group.count }, (_, i) => ({
        kind: group.enemy,
        tick: secondsToTicks(group.delay + i * group.interval),
      }));
    })
    .sort((a, b) => a.tick - b.tick);

  return spawnDue({
    tick: 0,
    level,
    money: content.startingMoney,
    towers: [],
    towerDefinitions: content.towers,
    heightRangeBonus: content.heightRangeBonus,
    enemyRules,
    distance,
    enemies: [],
    nextEnemyId: 1 as EnemyId,
    pendingSpawns,
  });
}

export function step(state: GameState, commands: readonly Command[]): StepResult {
  const events: GameEvent[] = [];
  let current = state;
  for (const command of commands) {
    if (command.tick !== current.tick) {
      events.push({ type: 'rejected', cell: command.cell, reason: 'wrongTick' });
      continue;
    }
    const placement = checkPlacement(current, command.cell, command.kind);
    if (placement.reason !== undefined) {
      events.push({ type: 'rejected', cell: command.cell, reason: placement.reason });
      continue;
    }
    current = {
      ...current,
      money: current.money - placement.cost,
      towers: [...current.towers, placement.tower],
      distance: placement.distance,
    };
  }
  const enemies = current.enemies.flatMap((enemy) => {
    const moved = advanceEnemy(current, enemy);
    if (moved === 'leaked') {
      events.push({ type: 'leaked', enemyId: enemy.id, enemyKind: enemy.kind });
      return [];
    }
    return [moved];
  });
  return { state: spawnDue({ ...current, tick: current.tick + 1, enemies }), events };
}

/** 敵人在格座標中的位置；格子 (x, y) 的中心是 (x, y)。 */
export function enemyPosition(state: GameState, enemy: Enemy): GridPoint {
  const from = cellPoint(state.level, enemy.from);
  const to = cellPoint(state.level, enemy.to);
  return {
    x: from.x + (to.x - from.x) * enemy.progress,
    y: from.y + (to.y - from.y) * enemy.progress,
  };
}

function advanceEnemy(state: GameState, enemy: Enemy): Enemy | 'leaked' {
  const rules = state.enemyRules[enemy.kind];
  if (rules === undefined) throw new Error(`未知的敵人種類「${enemy.kind}」`);
  let { from, to, progress } = enemy;
  let budget = rules.speedPerTick;
  while (budget > 0) {
    if (from === to) {
      const next = nextCell(state.level, state.distance, from);
      if (next === undefined) break;
      to = next;
      progress = 0;
    }
    const remaining = 1 - progress;
    if (budget < remaining) {
      progress += budget;
      break;
    }
    budget -= remaining;
    from = to;
    progress = 0;
    if (from === state.level.goal) return 'leaked';
  }
  return { ...enemy, from, to, progress };
}

function spawnDue(state: GameState): GameState {
  const due = state.pendingSpawns.filter((spawn) => spawn.tick <= state.tick);
  if (due.length === 0) return state;
  const spawned = due.map((spawn, i) => ({
    id: (state.nextEnemyId + i) as EnemyId,
    kind: spawn.kind,
    from: state.level.spawn,
    to: state.level.spawn,
    progress: 0,
  }));
  return {
    ...state,
    enemies: [...state.enemies, ...spawned],
    nextEnemyId: (state.nextEnemyId + due.length) as EnemyId,
    pendingSpawns: state.pendingSpawns.slice(due.length),
  };
}
