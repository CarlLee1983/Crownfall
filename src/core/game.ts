import { TICKS_PER_SECOND } from './clock';
import type { Content, EnemyDefinition, TowerDefinition, TowerUpgrades, Wave } from './content';
import { type CellIndex, cellAt, cellIndex, cellPoint, type GridPoint, type Level } from './level';
import { type DistanceField, distanceField, nextCell } from './pathing';
import { checkPlacement, type PlacementRejection, rangeBonusForLayers } from './placement';
import { assertRampsRiseOneWay } from './terrain';

export type EnemyId = number & { readonly __brand: 'EnemyId' };

export interface Enemy {
  readonly id: EnemyId;
  readonly kind: string;
  readonly hp: number;
  readonly maxHp: number;
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
  readonly level: number;
  readonly invested: number;
  /** 放置當下已開始的波次數。 */
  readonly waveNumberAtPlacement: number;
  readonly nextShotTick: number;
  readonly firingStartTick: number;
  readonly shotsSinceFiringStart: number;
}

interface EnemyRules {
  readonly speedPerTick: number;
  readonly maxHp: number;
  readonly bounty: number;
  readonly leakDamage: EnemyDefinition['leakDamage'];
}

interface TowerRules extends TowerDefinition {
  readonly ticksPerShot: number | undefined;
}

interface ScheduledSpawn {
  readonly kind: string;
  readonly tick: number;
}

interface PendingSpawn extends ScheduledSpawn {
  readonly maxHp: number;
}

interface CampaignWave extends Wave {
  readonly spawns: readonly ScheduledSpawn[];
}

export interface WaveDetails extends Wave {
  readonly hpMultiplier: number;
}

export interface GameState {
  readonly tick: number;
  readonly level: Level;
  readonly money: number;
  readonly lives: number;
  readonly phase: 'preparation' | 'wave' | 'victory' | 'defeat';
  readonly endless: boolean;
  /** 已開始的波次數。 */
  readonly waveNumber: number;
  readonly defeatReason: DefeatReason | undefined;
  readonly waveClearReward: number;
  /** 戰役波次與預先排定的出兵清單，tick 相對於開波時計算。 */
  readonly waves: readonly CampaignWave[];
  readonly towers: readonly Tower[];
  readonly towerDefinitions: Readonly<Record<string, TowerRules>>;
  readonly towerUpgrades: TowerUpgrades;
  readonly heightRangeBonus: number;
  readonly enemyRules: Readonly<Record<string, EnemyRules>>;
  readonly distance: DistanceField;
  readonly enemies: readonly Enemy[];
  readonly nextEnemyId: EnemyId;
  /** 依 tick 排序的待出兵清單。 */
  readonly pendingSpawns: readonly PendingSpawn[];
}

export type DefeatReason = 'noLives' | 'bossLeaked';
type WaveStartRejection = 'waveInProgress' | 'noNextWave' | 'gameOver';
export type WaveRejection = 'wrongTick' | WaveStartRejection;
type ContinueRejection = 'wrongTick' | 'notVictory' | 'noNextWave';
export type RejectionReason = PlacementRejection | 'maxLevel' | 'noTower';

export type Command =
  | {
      readonly type: 'placeTower';
      /** 要套用這筆指令的輸入狀態 tick。 */
      readonly tick: number;
      readonly cell: CellIndex;
      readonly kind: string;
    }
  | { readonly type: 'upgradeTower'; readonly tick: number; readonly cell: CellIndex }
  | { readonly type: 'sellTower'; readonly tick: number; readonly cell: CellIndex }
  | { readonly type: 'startWave'; readonly tick: number }
  | { readonly type: 'continueEndless'; readonly tick: number };

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
  | {
      readonly type: 'leaked';
      readonly enemyId: EnemyId;
      readonly enemyKind: string;
      readonly livesLost: number;
    }
  | { readonly type: 'waveCleared'; readonly waveNumber: number; readonly reward: number }
  | { readonly type: 'victory'; readonly waveNumber: number }
  | { readonly type: 'defeat'; readonly waveNumber: number; readonly reason: DefeatReason }
  | { readonly type: 'waveRejected'; readonly reason: WaveRejection }
  | { readonly type: 'continueRejected'; readonly reason: ContinueRejection }
  | { readonly type: 'rejected'; readonly cell: CellIndex; readonly reason: RejectionReason };

export interface TowerDetails {
  readonly kind: string;
  readonly level: number;
  /** 對指定目標高度層的射程。 */
  readonly range: number;
  readonly damage: number;
  readonly upgradeCost: number | null;
  readonly refund: number;
  readonly refundPercent: 100 | 70;
}

export interface StepResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

const secondsToTicks = (seconds: number): number => Math.round(seconds * TICKS_PER_SECOND);
const ENDLESS_FIRST_TEMPLATE = 4;
const ENDLESS_CYCLE_LENGTH = 6;
const ENDLESS_HP_PER_CYCLE = 1.15;

function scheduleSpawns(groups: Wave['groups']): readonly ScheduledSpawn[] {
  return groups
    .flatMap(({ enemy, count, delay, interval }) =>
      Array.from({ length: count }, (_, i) => ({
        kind: enemy,
        tick: secondsToTicks(delay + i * interval),
      })),
    )
    .sort((a, b) => a.tick - b.tick);
}

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
        leakDamage: definition.leakDamage,
      },
    ]),
  );

  const towerDefinitions = Object.fromEntries(
    Object.entries(content.towers).map(([kind, definition]) => [
      kind,
      {
        ...definition,
        ticksPerShot:
          definition.shotsPerSecond > 0
            ? Math.max(1, TICKS_PER_SECOND / definition.shotsPerSecond)
            : undefined,
      },
    ]),
  );

  const waves = content.waves.map(({ groups }) => {
    const definitions = groups.map((group) => {
      if (!Object.hasOwn(enemyRules, group.enemy)) {
        throw new Error(`未知的敵人種類「${group.enemy}」`);
      }
      return { ...group };
    });
    return { groups: definitions, spawns: scheduleSpawns(definitions) };
  });

  const lives = Math.max(0, content.startingLives);
  return {
    tick: 0,
    level,
    money: content.startingMoney,
    lives,
    phase: lives === 0 ? 'defeat' : 'preparation',
    endless: false,
    waveNumber: 0,
    defeatReason: lives === 0 ? 'noLives' : undefined,
    waveClearReward: content.waveClearReward,
    waves,
    towers: [],
    towerDefinitions,
    towerUpgrades: content.towerUpgrades,
    heightRangeBonus: content.heightRangeBonus,
    enemyRules,
    distance,
    enemies: [],
    nextEnemyId: 1 as EnemyId,
    pendingSpawns: [],
  };
}

/** 依 1 起算的波次編號查詢出兵組與血量倍率。 */
export function queryWave(state: GameState, waveNumber: number): WaveDetails | undefined {
  if (!Number.isInteger(waveNumber) || waveNumber < 1) return undefined;

  const campaignWave = state.waves[waveNumber - 1];
  if (campaignWave !== undefined) return { groups: campaignWave.groups, hpMultiplier: 1 };
  if (!state.endless) return undefined;

  const offset = waveNumber - state.waves.length - 1;
  const cycle = Math.floor(offset / ENDLESS_CYCLE_LENGTH) + 1;
  const template = state.waves[ENDLESS_FIRST_TEMPLATE - 1 + (offset % ENDLESS_CYCLE_LENGTH)];
  if (template === undefined) return undefined;
  return {
    groups: template.groups.map((group) => ({ ...group, count: group.count + cycle })),
    hpMultiplier: ENDLESS_HP_PER_CYCLE ** cycle,
  };
}

function nextWave(state: GameState): WaveDetails | WaveStartRejection {
  if (state.phase === 'victory' || state.phase === 'defeat') return 'gameOver';
  if (state.phase === 'wave') return 'waveInProgress';
  return queryWave(state, state.waveNumber + 1) ?? 'noNextWave';
}

export function continueRejection(state: GameState): ContinueRejection | undefined {
  if (state.phase !== 'victory') return 'notVictory';
  if (state.waves.length < ENDLESS_FIRST_TEMPLATE + ENDLESS_CYCLE_LENGTH - 1) return 'noNextWave';
  return undefined;
}

export function waveStartRejection(state: GameState): WaveStartRejection | undefined {
  const wave = nextWave(state);
  return typeof wave === 'string' ? wave : undefined;
}

function towerRange(state: GameState, tower: Tower, rules: TowerRules, targetLayer: number) {
  const upgraded = rules.range + (tower.level - 1) * state.towerUpgrades.rangeBonus;
  return upgraded + rangeBonusForLayers(state, tower.layer, targetLayer);
}

function towerDamage(state: GameState, tower: Tower, rules: TowerRules) {
  return rules.damage * state.towerUpgrades.damageMultiplier ** (tower.level - 1);
}

export function queryTower(
  state: GameState,
  cell: CellIndex,
  targetLayer = 0,
): TowerDetails | null {
  const tower = state.towers.find((candidate) => candidate.cell === cell);
  if (tower === undefined) return null;
  const rules = state.towerDefinitions[tower.kind];
  if (rules === undefined) return null;

  const costPercent = state.towerUpgrades.costPercents[tower.level - 1];
  const refundPercent = state.waveNumber === tower.waveNumberAtPlacement ? 100 : 70;
  return {
    kind: tower.kind,
    level: tower.level,
    range: towerRange(state, tower, rules, targetLayer),
    damage: towerDamage(state, tower, rules),
    upgradeCost: costPercent === undefined ? null : (rules.cost * costPercent) / 100,
    refund:
      refundPercent === 100 ? tower.invested : Math.floor((tower.invested * refundPercent) / 100),
    refundPercent,
  };
}

export function applyCommands(state: GameState, commands: readonly Command[]): StepResult {
  const events: GameEvent[] = [];
  let current = state;
  for (const command of commands) {
    if (command.type === 'continueEndless') {
      const reason = command.tick === current.tick ? continueRejection(current) : 'wrongTick';
      if (reason !== undefined) {
        events.push({ type: 'continueRejected', reason });
      } else {
        current = { ...current, phase: 'preparation', endless: true };
      }
      continue;
    }
    if (command.type === 'startWave') {
      const wave = command.tick === current.tick ? nextWave(current) : 'wrongTick';
      if (typeof wave === 'string') {
        events.push({ type: 'waveRejected', reason: wave });
      } else {
        const spawns = current.waves[current.waveNumber]?.spawns ?? scheduleSpawns(wave.groups);
        current = spawnDue({
          ...current,
          phase: 'wave',
          waveNumber: current.waveNumber + 1,
          pendingSpawns: spawns.map(({ kind, tick }) => ({
            kind,
            tick: current.tick + tick,
            maxHp: enemyRulesFor(current, kind).maxHp * wave.hpMultiplier,
          })),
        });
      }
      continue;
    }
    if (command.tick !== current.tick) {
      events.push({ type: 'rejected', cell: command.cell, reason: 'wrongTick' });
      continue;
    }
    if (command.type !== 'placeTower') {
      if (current.phase === 'victory' || current.phase === 'defeat') {
        events.push({ type: 'rejected', cell: command.cell, reason: 'gameOver' });
        continue;
      }
      const details = queryTower(current, command.cell);
      if (details === null) {
        events.push({ type: 'rejected', cell: command.cell, reason: 'noTower' });
        continue;
      }
      if (command.type === 'sellTower') {
        const towers = current.towers.filter((tower) => tower.cell !== command.cell);
        const distance = cellAt(current.level, command.cell).lane
          ? distanceField(current.level, new Set(towers.map((tower) => tower.cell)))
          : current.distance;
        current = { ...current, money: current.money + details.refund, towers, distance };
        continue;
      }
      const cost = details.upgradeCost;
      if (cost === null) {
        events.push({ type: 'rejected', cell: command.cell, reason: 'maxLevel' });
        continue;
      }
      if (current.money < cost) {
        events.push({ type: 'rejected', cell: command.cell, reason: 'insufficientFunds' });
        continue;
      }
      current = {
        ...current,
        money: current.money - cost,
        towers: current.towers.map((tower) =>
          tower.cell === command.cell
            ? { ...tower, level: tower.level + 1, invested: tower.invested + cost }
            : tower,
        ),
      };
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
  return { state: current, events };
}

export function step(state: GameState, commands: readonly Command[]): StepResult {
  const applied = applyCommands(state, commands);
  if (applied.state.phase === 'victory' || applied.state.phase === 'defeat') return applied;
  if (applied.state.phase === 'preparation') {
    return { state: { ...applied.state, tick: applied.state.tick + 1 }, events: applied.events };
  }

  const { state: current, events: combatEvents } = attack(applied.state);
  const events = [...applied.events, ...combatEvents];
  const tick = current.tick + 1;
  let lives = current.lives;
  const enemies: Enemy[] = [];
  for (const [index, enemy] of current.enemies.entries()) {
    const moved = advanceEnemy(current, enemy);
    if (moved !== 'leaked') {
      enemies.push(moved);
      continue;
    }
    const { leakDamage } = enemyRulesFor(current, enemy.kind);
    const livesLost = leakDamage === 'defeat' ? 0 : Math.min(lives, leakDamage);
    lives -= livesLost;
    events.push({ type: 'leaked', enemyId: enemy.id, enemyKind: enemy.kind, livesLost });
    const reason = leakDamage === 'defeat' ? 'bossLeaked' : lives === 0 ? 'noLives' : undefined;
    if (reason !== undefined) {
      events.push({ type: 'defeat', waveNumber: current.waveNumber, reason });
      return {
        state: {
          ...current,
          tick,
          lives,
          enemies: [...enemies, ...current.enemies.slice(index + 1)],
          phase: 'defeat',
          defeatReason: reason,
        },
        events,
      };
    }
  }
  const next = spawnDue({ ...current, tick, lives, enemies });
  if (next.enemies.length > 0 || next.pendingSpawns.length > 0) return { state: next, events };

  const reward = next.waveClearReward;
  events.push({ type: 'waveCleared', waveNumber: next.waveNumber, reward });
  const won = !next.endless && next.waveNumber === next.waves.length;
  if (won) events.push({ type: 'victory', waveNumber: next.waveNumber });
  return {
    state: { ...next, phase: won ? 'victory' : 'preparation', money: next.money + reward },
    events,
  };
}

function attack(state: GameState): StepResult {
  const events: GameEvent[] = [];
  let enemies = state.enemies;
  let money = state.money;
  const towers = state.towers.map((tower) => {
    if (tower.nextShotTick > state.tick) return tower;
    const definition = state.towerDefinitions[tower.kind];
    if (definition?.ticksPerShot === undefined) return tower;

    const origin = cellPoint(state.level, tower.cell);
    let target: Enemy | undefined;
    let shortest = Number.POSITIVE_INFINITY;
    // 敵人依出場順序排列，剩餘路程相同時選先出場的敵人。
    for (const enemy of enemies) {
      const point = enemyPosition(state, enemy);
      const targetCell = cellIndex(state.level.width, Math.round(point.x), Math.round(point.y));
      const targetLayer = cellAt(state.level, targetCell).layer;
      const radius = towerRange(state, tower, definition, targetLayer);
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

    const damage = towerDamage(state, tower, definition);
    const { splashRadius } = definition;
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
    const nextShotTick =
      firingStartTick + Math.ceil(shotsSinceFiringStart * definition.ticksPerShot);
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
    hp: spawn.maxHp,
    maxHp: spawn.maxHp,
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
