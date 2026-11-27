import { TICKS_PER_SECOND } from './clock';
import type { Content } from './content';
import { type CellIndex, cellAt, cellIndex, cellPoint, type GridPoint, type Level } from './level';
import { type DistanceField, distanceField, nextCell } from './pathing';
import { checkPlacement, type PlacementRejection, rangeBonusForLayers } from './placement';
import { assertRampsRiseOneWay } from './terrain';

export type EnemyId = number & { readonly __brand: 'EnemyId' };

export interface Enemy {
  readonly id: EnemyId;
  readonly kind: string;
  readonly hp: number;
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
  readonly nextShotTick: number;
  readonly firingStartTick: number;
  readonly shotsSinceFiringStart: number;
}

interface EnemyRules {
  readonly speedPerTick: number;
  readonly maxHp: number;
  readonly bounty: number;
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
  | {
      readonly type: 'shot';
      readonly towerCell: CellIndex;
      readonly target: Enemy;
      readonly splashRadius: number | undefined;
    }
  | {
      readonly type: 'killed';
      readonly enemyId: EnemyId;
      readonly enemyKind: string;
      readonly bounty: number;
    }
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
      {
        speedPerTick: definition.speed / TICKS_PER_SECOND,
        maxHp: definition.hp,
        bounty: definition.bounty,
      },
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
  const combat = attack(current);
  current = combat.state;
  for (const event of combat.events) events.push(event);
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

function attack(state: GameState): StepResult {
  const events: GameEvent[] = [];
  let enemies = state.enemies;
  let money = state.money;
  const towers = state.towers.map((tower) => {
    if (tower.nextShotTick > state.tick) return tower;
    const definition = state.towerDefinitions[tower.kind];
    if (definition === undefined || !(definition.shotsPerSecond > 0)) return tower;

    const origin = cellPoint(state.level, tower.cell);
    let target: Enemy | undefined;
    let shortest = Number.POSITIVE_INFINITY;
    // 敵人依出場順序排列，剩餘路程相同時選先出場的敵人。
    for (const enemy of enemies) {
      const point = enemyPosition(state, enemy);
      const targetCell = cellIndex(state.level.width, Math.round(point.x), Math.round(point.y));
      const targetLayer = cellAt(state.level, targetCell).layer;
      const radius = definition.range + rangeBonusForLayers(state, tower.layer, targetLayer);
      if (Math.hypot(point.x - origin.x, point.y - origin.y) > radius) continue;
      const remaining =
        (state.distance[enemy.to] ?? Number.POSITIVE_INFINITY) +
        (enemy.from === enemy.to ? 0 : 1 - enemy.progress);
      if (remaining < shortest) {
        target = enemy;
        shortest = remaining;
      }
    }
    if (target === undefined) return tower;

    const { damage, splashRadius } = definition;
    const impact = enemyPosition(state, target);
    events.push({ type: 'shot', towerCell: tower.cell, target, splashRadius });
    enemies = enemies.flatMap((enemy) => {
      if (enemy.id !== target.id) {
        if (splashRadius === undefined) return [enemy];
        const point = enemyPosition(state, enemy);
        if (Math.hypot(point.x - impact.x, point.y - impact.y) > splashRadius) return [enemy];
      }
      const hp = enemy.hp - damage;
      if (hp > 0) return [{ ...enemy, hp }];

      const { bounty } = enemyRulesFor(state, enemy.kind);
      money += bounty;
      events.push({ type: 'killed', enemyId: enemy.id, enemyKind: enemy.kind, bounty });
      return [];
    });
    // 從連續射擊的起點換算 tick，避免每一發取整後累積誤差。
    const resumed = state.tick > tower.nextShotTick;
    const firingStartTick = resumed ? state.tick : tower.firingStartTick;
    const shotsSinceFiringStart = resumed ? 1 : tower.shotsSinceFiringStart + 1;
    const ticksPerShot = Math.max(1, TICKS_PER_SECOND / definition.shotsPerSecond);
    const nextShotTick = firingStartTick + Math.ceil(shotsSinceFiringStart * ticksPerShot);
    return { ...tower, firingStartTick, shotsSinceFiringStart, nextShotTick };
  });
  return { state: events.length > 0 ? { ...state, money, towers, enemies } : state, events };
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

function enemyRulesFor(state: GameState, kind: string): EnemyRules {
  const rules = state.enemyRules[kind];
  if (rules === undefined) throw new Error(`未知的敵人種類「${kind}」`);
  return rules;
}

function advanceEnemy(state: GameState, enemy: Enemy): Enemy | 'leaked' {
  let { from, to, progress } = enemy;
  let budget = enemyRulesFor(state, enemy.kind).speedPerTick;
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
    hp: enemyRulesFor(state, spawn.kind).maxHp,
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
