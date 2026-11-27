import { describe, expect, it } from 'vitest';
import {
  applyCommands,
  type CellIndex,
  type Command,
  type Content,
  canAffordTower,
  createGame,
  currentRoute,
  enemyPosition,
  enemyRouteSegments,
  type GameEvent,
  type GameState,
  type Level,
  parseLevel,
  previewPlacement,
  samePlacementPreviewInputs,
  step,
} from './index';

// 每秒 7.5 格 = 每 tick 0.25 格，讓位置在二進位浮點下精確。
const content = {
  enemies: { grunt: { speed: 7.5, hp: 12, bounty: 5, leakDamage: 1 } },
  waves: [{ groups: [{ enemy: 'grunt', count: 1, interval: 1, delay: 0 }] }],
  towers: { basic: { name: 'Basic', cost: 30, range: 2, damage: 4, shotsPerSecond: 0 } },
  startingMoney: 100,
  startingLives: 10,
  waveClearReward: 12,
  heightRangeBonus: 1.5,
} satisfies Content;

function run(state: GameState, ticks: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let current = state;
  for (let i = 0; i < ticks; i++) {
    const result = step(current, []);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

function positions(state: GameState) {
  return state.enemies.map((enemy) => enemyPosition(state, enemy));
}

describe('wave commands', () => {
  it('waits in preparation for the player to start the wave', () => {
    const initial = createGame(content, parseLevel(['S==G']));
    const waiting = run(initial, 30).state;
    expect(waiting).toMatchObject({ phase: 'preparation', waveNumber: 0, enemies: [] });

    const opened = step(waiting, [
      { type: 'startWave', tick: 30 },
      { type: 'startWave', tick: 30 },
    ]);
    expect(opened.state).toMatchObject({ phase: 'wave', waveNumber: 1 });
    expect(positions(opened.state)).toEqual([{ x: 0.25, y: 0 }]);
    expect(opened.events).toEqual([{ type: 'waveRejected', reason: 'waveInProgress' }]);
  });

  it('rejects opening a wave when no waves are defined', () => {
    const initial = createGame({ ...content, waves: [] }, parseLevel(['SG']));
    const result = step(initial, [{ type: 'startWave', tick: 0 }]);
    expect(result.state.phase).toBe('preparation');
    expect(result.events).toEqual([{ type: 'waveRejected', reason: 'noNextWave' }]);
  });

  it('finishes only after overlapping groups have spawned and all enemies are gone', () => {
    const initial = createGame(
      {
        ...content,
        enemies: { ...content.enemies, runner: { ...content.enemies.grunt, speed: 15 } },
        waves: [
          {
            groups: [
              { enemy: 'grunt', count: 2, interval: 0.2, delay: 0 },
              { enemy: 'runner', count: 1, interval: 0, delay: 0.1 },
            ],
          },
          ...content.waves,
        ],
      },
      parseLevel(['SG']),
    );
    const waiting = run(initial, 20).state;
    const first = step(waiting, [{ type: 'startWave', tick: 20 }]).state;
    const overlapping = run(first, 2).state;
    expect(overlapping.enemies.map(({ kind }) => kind)).toEqual(['grunt', 'runner']);
    const gap = run(overlapping, 2).state;
    expect(gap).toMatchObject({ phase: 'wave', enemies: [], money: 100 });
    const lastEnemy = run(gap, 1).state;
    expect(lastEnemy.enemies).toMatchObject([{ kind: 'grunt' }]);
    const cleared = run(lastEnemy, 4);
    expect(cleared.events).toContainEqual({ type: 'waveCleared', waveNumber: 1, reward: 12 });
    expect(cleared.state).toMatchObject({ phase: 'preparation', waveNumber: 1, money: 112 });
    expect(run(cleared.state, 60)).toMatchObject({
      state: { phase: 'preparation', waveNumber: 1, money: 112, enemies: [] },
      events: [],
    });
  });

  it('deducts lives by enemy kind with no bounty and wins if lives remain after the final wave', () => {
    const initial = createGame(
      {
        ...content,
        enemies: {
          grunt: { ...content.enemies.grunt, speed: 30 },
          tank: { ...content.enemies.grunt, speed: 30, leakDamage: 2 },
        },
        waves: [
          {
            groups: [
              { enemy: 'grunt', count: 1, interval: 0, delay: 0 },
              { enemy: 'tank', count: 1, interval: 0, delay: 0 },
            ],
          },
        ],
      },
      parseLevel(['SG', '..']),
    );
    const won = step(initial, [{ type: 'startWave', tick: 0 }]);
    expect(won.state).toMatchObject({ phase: 'victory', tick: 1, lives: 7, money: 112 });
    expect(won.events).toEqual([
      { type: 'leaked', enemyId: 1, enemyKind: 'grunt', livesLost: 1 },
      { type: 'leaked', enemyId: 2, enemyKind: 'tank', livesLost: 2 },
      { type: 'waveCleared', waveNumber: 1, reward: 12 },
      { type: 'victory', waveNumber: 1 },
    ]);

    expect(
      step(won.state, [
        { type: 'startWave', tick: 1 },
        { type: 'placeTower', cell: 2 as CellIndex, kind: 'basic', tick: 1 },
      ]),
    ).toEqual({
      state: won.state,
      events: [
        { type: 'waveRejected', reason: 'gameOver' },
        { type: 'rejected', cell: 2, reason: 'gameOver' },
      ],
    });
  });

  it.each([
    ['noLives', 2, 0, 1],
    ['bossLeaked', 'defeat', 1, 0],
  ] as const)('ends the run immediately on %s', (reason, leakDamage, lives, livesLost) => {
    const initial = createGame(
      {
        ...content,
        startingLives: 1,
        enemies: { grunt: { ...content.enemies.grunt, speed: 30, leakDamage } },
      },
      parseLevel(['SG']),
    );
    const lost = step(initial, [{ type: 'startWave', tick: 0 }]);
    expect(lost.state).toMatchObject({ phase: 'defeat', defeatReason: reason, lives, money: 100 });
    expect(lost.events).toEqual([
      { type: 'leaked', enemyId: 1, enemyKind: 'grunt', livesLost },
      { type: 'defeat', waveNumber: 1, reason },
    ]);
    expect(run(lost.state, 60)).toEqual({ state: lost.state, events: [] });
  });
});

it('replays a full command log identically through the final tick', () => {
  const level = parseLevel(['SG', '..']);
  const replayContent = {
    ...content,
    enemies: {
      grunt: { ...content.enemies.grunt, hp: 4 },
      tank: { ...content.enemies.grunt, speed: 30, leakDamage: 2 },
    },
    towers: { basic: { ...content.towers.basic, shotsPerSecond: 1 } },
    waves: [...content.waves, { groups: [{ enemy: 'tank', count: 1, interval: 0, delay: 0 }] }],
  } satisfies Content;
  const commands: readonly Command[] = [
    { type: 'placeTower', cell: 2 as CellIndex, kind: 'basic', tick: 0 },
    { type: 'startWave', tick: 3 },
    { type: 'startWave', tick: 8 },
  ];

  function replay() {
    let state = createGame(replayContent, level);
    const trace = [];
    for (let tick = 0; tick < 60; tick++) {
      const frame = step(
        state,
        commands.filter((command) => command.tick === tick),
      );
      trace.push(frame);
      state = frame.state;
      if (state.phase === 'victory' || state.phase === 'defeat') break;
    }
    return { state, trace };
  }

  const first = replay();
  expect(first.state).toMatchObject({ lives: 8, money: 99, phase: 'victory', tick: 9 });
  expect(replay().trace).toEqual(first.trace);
});

function startFirstWave(gameContent: Content, level: Level): GameState {
  return applyCommands(createGame(gameContent, level), [{ type: 'startWave', tick: 0 }]).state;
}

describe('enemies walking the lane', () => {
  const corridor = parseLevel(['S==G']);

  it('walks toward the goal at its speed', () => {
    const start = startFirstWave(content, corridor);
    expect(positions(start)).toEqual([{ x: 0, y: 0 }]);
    expect(positions(run(start, 2).state)).toEqual([{ x: 0.5, y: 0 }]);
    expect(positions(run(start, 6).state)).toEqual([{ x: 1.5, y: 0 }]);
  });

  it('disappears on reaching the goal and reports the leak on that tick', () => {
    const start = startFirstWave(content, corridor);
    const before = run(start, 11);
    expect(before.events).toEqual([]);
    expect(before.state.enemies).toHaveLength(1);

    const arrival = step(before.state, []);
    expect(arrival.state.tick).toBe(12);
    expect(arrival.state.enemies).toEqual([]);
    expect(arrival.events[0]).toEqual({
      type: 'leaked',
      enemyId: 1,
      enemyKind: 'grunt',
      livesLost: 1,
    });
  });
});

describe('tower attacks', () => {
  const basic = { ...content.towers.basic, shotsPerSecond: 1 };
  const pairedWaves = [
    {
      groups: [
        { enemy: 'grunt', count: 1, interval: 0, delay: 0 },
        { enemy: 'runner', count: 1, interval: 0, delay: 0 },
      ],
    },
  ] as const;

  it('shoots as soon as a target is in range and waits its full interval between shots', () => {
    const start = startFirstWave(
      {
        ...content,
        enemies: { grunt: { speed: 0, hp: 12, bounty: 5, leakDamage: 1 } },
        towers: { basic },
      },
      parseLevel(['S==G', '....']),
    );
    const first = step(start, [
      { type: 'placeTower', kind: 'basic', cell: 4 as CellIndex, tick: 0 },
    ]);

    expect(first.events).toMatchObject([{ type: 'shot', towerCell: 4, target: { id: 1 } }]);
    expect(first.state.enemies[0]?.hp).toBe(8);
    expect(start.enemies[0]?.hp).toBe(12);

    const before = run(first.state, 29);
    expect(before.events).toEqual([]);
    expect(before.state.enemies[0]?.hp).toBe(8);

    const second = step(before.state, []);
    expect(second.events).toMatchObject([{ type: 'shot', towerCell: 4, target: { id: 1 } }]);
    expect(second.state.enemies[0]?.hp).toBe(4);
    expect(step(before.state, [])).toEqual(second);
  });

  it('sustains fractional-tick cadence and starts a fresh interval after idling', () => {
    let state = startFirstWave(
      {
        ...content,
        enemies: { grunt: { speed: 0, hp: 20, bounty: 5, leakDamage: 1 } },
        waves: [{ groups: [{ enemy: 'grunt', count: 2, interval: 1.5, delay: 0 }] }],
        towers: { basic: { ...basic, shotsPerSecond: 4 } },
      },
      parseLevel(['S==G', '....']),
    );
    const shotTicks: number[] = [];
    for (let tick = 0; tick <= 75; tick++) {
      const result = step(
        state,
        tick === 0 ? [{ type: 'placeTower', kind: 'basic', cell: 4 as CellIndex, tick }] : [],
      );
      for (const event of result.events) {
        if (event.type === 'shot') shotTicks.push(tick);
      }
      state = result.state;
    }

    expect(shotTicks).toEqual([0, 8, 15, 23, 30, 45, 53, 60, 68, 75]);
  });

  it('targets the enemy with less remaining travel when both are on the same segment', () => {
    const start = startFirstWave(
      {
        ...content,
        enemies: { ...content.enemies, runner: { speed: 15, hp: 10, bounty: 4, leakDamage: 1 } },
        waves: pairedWaves,
        towers: { basic },
      },
      parseLevel(['S==G', '....']),
    );
    const moving = step(start, []).state;
    const result = step(moving, [
      { type: 'placeTower', kind: 'basic', cell: 4 as CellIndex, tick: 1 },
    ]);

    expect(result.events).toMatchObject([{ type: 'shot', target: { id: 2 } }]);
    expect(result.state.enemies.map((enemy) => enemy.hp)).toEqual([12, 6]);
  });

  it('targets the front of a folded route even when the trailing enemy is closer to the goal', () => {
    const start = startFirstWave(
      {
        ...content,
        enemies: { ...content.enemies, runner: { speed: 30, hp: 10, bounty: 4, leakDamage: 1 } },
        waves: pairedWaves,
        towers: { basic: { ...basic, range: 3 } },
      },
      parseLevel(['S=====', '.....=', 'G=====']),
    );
    const moving = run(start, 4).state;
    const result = step(moving, [
      { type: 'placeTower', kind: 'basic', cell: 8 as CellIndex, tick: 4 },
    ]);

    expect(result.events).toMatchObject([{ type: 'shot', target: { id: 2 } }]);
  });

  it.each([
    ['a high tower reaches farther against a low target', ['S==G', '.#..'], 5, 1.25, true],
    [
      'a low tower keeps its full horizontal range against a high target',
      ['s++g', '....'],
      4,
      1,
      true,
    ],
    ['a high tower gets no extra range against a high target', ['s++g', '.#..'], 5, 1.25, false],
  ])('%s', (_case, rows, cell, range, fires) => {
    const start = startFirstWave(
      { ...content, towers: { basic: { ...basic, range } } },
      parseLevel(rows),
    );
    const result = step(start, [
      { type: 'placeTower', kind: 'basic', cell: cell as CellIndex, tick: 0 },
    ]);

    expect(result.events.map((event) => event.type)).toEqual(fires ? ['shot'] : []);
    expect(result.state.enemies[0]?.hp).toBe(fires ? 8 : 12);
  });

  it('uses the layer of the cell the enemy occupies as it crosses from a ramp onto high ground', () => {
    const start = startFirstWave(
      {
        ...content,
        enemies: { grunt: { ...content.enemies.grunt, speed: 3.75 } },
        towers: { basic: { ...basic, range: 1 } },
      },
      parseLevel(['S^+g', '..#.']),
    );
    const onRamp = run(start, 11).state;
    const onHighGround = run(start, 13).state;

    const rampShot = step(onRamp, [
      { type: 'placeTower', kind: 'basic', cell: 6 as CellIndex, tick: 11 },
    ]);
    const highGroundShot = step(onHighGround, [
      { type: 'placeTower', kind: 'basic', cell: 6 as CellIndex, tick: 13 },
    ]);

    expect(rampShot.events).toMatchObject([{ type: 'shot', target: { id: 1 } }]);
    expect(highGroundShot.events).toEqual([]);
  });

  it('damages every enemy within the splash radius around the target', () => {
    const start = startFirstWave(
      {
        ...content,
        enemies: {
          still: { speed: 0, hp: 12, bounty: 5, leakDamage: 1 },
          grunt: { speed: 11.25, hp: 10, bounty: 4, leakDamage: 1 },
          runner: { speed: 22.5, hp: 12, bounty: 3, leakDamage: 1 },
        },
        waves: [
          {
            groups: [
              { enemy: 'still', count: 1, interval: 0, delay: 0 },
              { enemy: 'grunt', count: 1, interval: 0, delay: 0 },
              { enemy: 'runner', count: 1, interval: 0, delay: 0 },
            ],
          },
        ],
        towers: {
          splash: {
            name: 'Splash',
            cost: 40,
            range: 1.25,
            damage: 4,
            shotsPerSecond: 1,
            splashRadius: 0.75,
          },
        },
      },
      parseLevel(['S===G', '.....']),
    );
    const moving = run(start, 2).state;
    const result = step(moving, [
      { type: 'placeTower', kind: 'splash', cell: 7 as CellIndex, tick: 2 },
    ]);

    expect(result.events).toMatchObject([{ type: 'shot', target: { id: 3 }, splashRadius: 0.75 }]);
    expect(result.state.enemies.map((enemy) => enemy.hp)).toEqual([12, 6, 8]);
  });

  it('awards each enemy kind’s bounty once even when multiple towers can shoot', () => {
    const start = startFirstWave(
      {
        ...content,
        enemies: {
          grunt: { speed: 0, hp: 4, bounty: 5, leakDamage: 1 },
          runner: { speed: 0, hp: 3, bounty: 4, leakDamage: 1 },
        },
        waves: pairedWaves,
        towers: {
          basic,
          splash: {
            name: 'Splash',
            cost: 40,
            range: 2,
            damage: 4,
            shotsPerSecond: 1,
            splashRadius: 1,
          },
        },
      },
      parseLevel(['S==G', '....']),
    );
    const result = step(start, [
      { type: 'placeTower', kind: 'splash', cell: 4 as CellIndex, tick: 0 },
      { type: 'placeTower', kind: 'basic', cell: 5 as CellIndex, tick: 0 },
    ]);

    expect(result.events).toMatchObject([
      { type: 'shot', towerCell: 4, target: { id: 1 } },
      { type: 'killed', enemyId: 1, enemyKind: 'grunt', bounty: 5 },
      { type: 'killed', enemyId: 2, enemyKind: 'runner', bounty: 4 },
      { type: 'waveCleared', waveNumber: 1, reward: 12 },
      { type: 'victory', waveNumber: 1 },
    ]);
    expect(result.state.enemies).toEqual([]);
    expect(result.state.money).toBe(51);
    expect(start.enemies.map((enemy) => enemy.hp)).toEqual([4, 3]);
    expect(start.money).toBe(100);

    const after = run(result.state, 60);
    expect(after.events).toEqual([]);
    expect(after.state.money).toBe(51);
  });
});

describe('height layers', () => {
  // (1,0) 低層車道與 (2,0) 高層車道相鄰卻沒有坡道，是峭壁；唯一換層處是 (2,1) 的坡道。
  const cliffAndRamp = parseLevel(['S=+g', '.=^#']);

  it('changes layer only through the ramp, never across the cliff', () => {
    const start = startFirstWave(content, cliffAndRamp);
    const cellsVisited = [4, 8, 12, 16].map((ticks) => positions(run(start, ticks).state));
    expect(cellsVisited).toEqual([
      [{ x: 1, y: 0 }],
      [{ x: 1, y: 1 }],
      [{ x: 2, y: 1 }],
      [{ x: 2, y: 0 }],
    ]);
    expect(run(start, 20).events[0]).toMatchObject({ type: 'leaked', enemyId: 1 });
  });

  it('rejects a ramp that could rise toward more than one higher lane cell', () => {
    expect(() => createGame(content, parseLevel(['S=+g', '.=^+']))).toThrow('坡道 (2, 1)');
  });

  it('rejects a level whose entrance cannot reach the goal', () => {
    expect(() => createGame(content, parseLevel(['S=+g']))).toThrow('走不到終點');
  });
});

describe('spawn groups', () => {
  const longCorridor = parseLevel(['S=========================G']);

  it('releases each enemy of a group after the delay, one interval apart', () => {
    const start = startFirstWave(
      {
        ...content,
        waves: [{ groups: [{ enemy: 'grunt', count: 3, interval: 1, delay: 0.5 }] }],
      },
      longCorridor,
    );
    const countAt = (ticks: number) => run(start, ticks).state.enemies.length;
    expect([countAt(14), countAt(15), countAt(44), countAt(45), countAt(75)]).toEqual([
      0, 1, 1, 2, 3,
    ]);
    expect(run(start, 75).state.enemies.map((enemy) => enemy.id)).toEqual([1, 2, 3]);
  });

  it('is a pure step: the input state is left untouched and replays identically', () => {
    const start = startFirstWave(content, longCorridor);
    const first = run(start, 30);
    expect(start.tick).toBe(0);
    expect(positions(start)).toEqual([{ x: 0, y: 0 }]);
    expect(first.state.tick).toBe(30);
    expect(positions(first.state)).toEqual([{ x: 7.5, y: 0 }]);
    expect(run(start, 30)).toEqual(first);
  });
});

describe('placing towers', () => {
  const placementContent = {
    ...content,
    waves: [],
  } satisfies Content;

  it('charges the same price on both layers and records each tower’s layer', () => {
    const start = createGame(placementContent, parseLevel(['S==G', '.#..']));
    const result = step(start, [
      { type: 'placeTower', kind: 'basic', cell: 4 as CellIndex, tick: 0 },
      { type: 'placeTower', kind: 'basic', cell: 5 as CellIndex, tick: 0 },
    ]);

    expect(result.events).toEqual([]);
    expect(result.state.money).toBe(40);
    expect(result.state.towers).toMatchObject([
      { cell: 4, kind: 'basic', layer: 0 },
      { cell: 5, kind: 'basic', layer: 1 },
    ]);
    expect(start.money).toBe(100);
    expect(start.towers).toEqual([]);
  });

  it('rejects a route that would no longer reach the goal', () => {
    const start = createGame(placementContent, parseLevel(['S==G']));
    const result = step(start, [
      { type: 'placeTower', kind: 'basic', cell: 1 as CellIndex, tick: 0 },
    ]);

    expect(result.events).toEqual([{ type: 'rejected', cell: 1, reason: 'disconnectedRoute' }]);
    expect(result.state).toEqual(step(start, []).state);
  });

  it.each([
    ['entrance', 0],
    ['ramp', 6],
    ['goal', 3],
    ['map exterior', 8],
  ])('rejects building at the %s', (_terrain, cell) => {
    const start = createGame(placementContent, parseLevel(['S=+g', '.=^#']));
    const result = step(start, [
      { type: 'placeTower', kind: 'basic', cell: cell as CellIndex, tick: 0 },
    ]);

    expect(result.events).toEqual([{ type: 'rejected', cell, reason: 'unbuildableCell' }]);
    expect(result.state).toEqual(step(start, []).state);
  });

  it('rejects commands for unknown kinds and other ticks', () => {
    const start = createGame(placementContent, parseLevel(['S==G', '....']));
    const cell = 4 as CellIndex;
    const result = step(start, [
      { type: 'placeTower', kind: 'constructor', cell, tick: 0 },
      { type: 'placeTower', kind: 'basic', cell, tick: 1 },
    ]);

    expect(result.events).toEqual([
      { type: 'rejected', cell: 4, reason: 'unknownTower' },
      { type: 'rejected', cell: 4, reason: 'wrongTick' },
    ]);
    expect(result.state).toEqual(step(start, []).state);
  });

  it('rejects a tower on a cell occupied by a prior command on the same tick', () => {
    const start = createGame(placementContent, parseLevel(['S==G', '....']));
    const command = { type: 'placeTower', kind: 'basic', cell: 4 as CellIndex, tick: 0 } as const;
    const result = step(start, [command, command]);

    expect(result.events).toEqual([{ type: 'rejected', cell: 4, reason: 'occupiedCell' }]);
    expect(result.state).toEqual(step(start, [command]).state);
  });

  it('rejects a tower when the remaining money is below its price', () => {
    const level = parseLevel(['S==G', '....']);
    const start = createGame({ ...placementContent, startingMoney: 30 }, level);
    expect(canAffordTower(start, 'basic')).toBe(true);
    const first = { type: 'placeTower', kind: 'basic', cell: 4 as CellIndex, tick: 0 } as const;
    const second = { ...first, cell: 5 as CellIndex };
    const result = step(start, [first, second]);

    expect(result.events).toEqual([{ type: 'rejected', cell: 5, reason: 'insufficientFunds' }]);
    expect(result.state.money).toBe(0);
    expect(canAffordTower(result.state, 'basic')).toBe(false);
    expect(result.state).toEqual(step(start, [first]).state);
  });

  it.each([
    [4, 1],
    [4, 2],
    [5, 1],
    [5, 2],
  ])('reserves the enemy’s current and next cells at tick %i (cell %i)', (tick, cell) => {
    const start = run(startFirstWave(content, parseLevel(['S===G', '====='])), tick).state;
    const result = step(start, [
      { type: 'placeTower', kind: 'basic', cell: cell as CellIndex, tick },
    ]);

    expect(result.events).toEqual([{ type: 'rejected', cell, reason: 'enemyOnCell' }]);
    expect(result.state).toEqual(step(start, []).state);
  });

  it('rejects a tower that would trap an enemy while the entrance is still connected', () => {
    const level = parseLevel(['S=====G', '=.....=', '=======']);
    const start = run(startFirstWave(content, level), 8).state;
    const behind = step(start, [
      { type: 'placeTower', kind: 'basic', cell: 1 as CellIndex, tick: 8 },
    ]);
    expect(behind.events).toEqual([]);
    expect(positions(behind.state)).toEqual([{ x: 2.25, y: 0 }]);
    expect(enemyRouteSegments(behind.state)).toEqual([
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
      { from: 5, to: 6 },
    ]);

    const result = step(behind.state, [
      { type: 'placeTower', kind: 'basic', cell: 4 as CellIndex, tick: 9 },
    ]);

    expect(result.events).toEqual([{ type: 'rejected', cell: 4, reason: 'trappedEnemy' }]);
    expect(result.state).toEqual(step(behind.state, []).state);
  });

  it('immediately routes an active enemy around a newly placed barricade', () => {
    const level = parseLevel(['S====G', '===.==', '======']);
    const start = run(startFirstWave(content, level), 8).state;
    const cell = 4 as CellIndex;
    const preview = previewPlacement(start, cell, 'basic');
    expect(currentRoute(start)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(preview).toEqual({
      reason: undefined,
      route: [0, 1, 2, 8, 14, 15, 16, 10, 11, 5],
      rangeAtGround: 2,
      heightBonus: 0,
    });

    const result = step(start, [{ type: 'placeTower', kind: 'basic', cell, tick: 8 }]);
    expect(result.events).toEqual([]);
    expect(positions(result.state)).toEqual([{ x: 2, y: 0.25 }]);
    expect(currentRoute(result.state)).toEqual(preview.route);
    expect(currentRoute(start)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps a committed branch visible until its enemies return to the main route', () => {
    const level = parseLevel(['S===G', '==.==', '=====']);
    const twoEnemies = {
      ...content,
      waves: [{ groups: [{ enemy: 'grunt', count: 2, interval: 0, delay: 0 }] }],
    };
    const start = run(startFirstWave(twoEnemies, level), 5).state;
    expect(enemyRouteSegments(start)).toEqual([]);

    const rerouted = step(start, [
      { type: 'placeTower', kind: 'basic', cell: 3 as CellIndex, tick: 5 },
    ]);
    expect(rerouted.events).toEqual([]);
    expect(currentRoute(rerouted.state)).toEqual([0, 1, 6, 11, 12, 13, 8, 9, 4]);
    expect(enemyRouteSegments(rerouted.state)).toEqual([{ from: 1, to: 2 }]);
    expect(enemyRouteSegments(run(rerouted.state, 3).state)).toEqual([{ from: 2, to: 1 }]);
    expect(enemyRouteSegments(run(rerouted.state, 6).state)).toEqual([]);
    const leavingBranch = run(rerouted.state, 5).state;
    const rejoined = step(leavingBranch, []).state;
    expect(enemyRouteSegments(rejoined, leavingBranch)).toEqual([{ from: 2, to: 1 }]);
    expect(enemyRouteSegments(rejoined, rerouted.state)).toEqual([]);
  });

  it('reuses previews across quiet ticks and invalidates them after a free tower is placed', () => {
    const freeTowers = {
      ...placementContent,
      towers: { basic: { ...placementContent.towers.basic, cost: 0 } },
    };
    const initial = createGame(freeTowers, parseLevel(['S===G', '.....']));
    const waiting = run(initial, 30).state;
    const cell = 5 as CellIndex;
    expect(samePlacementPreviewInputs(initial, waiting)).toBe(true);

    const placed = step(waiting, [{ type: 'placeTower', kind: 'basic', cell, tick: 30 }]).state;
    expect(placed.money).toBe(initial.money);
    expect(samePlacementPreviewInputs(waiting, placed)).toBe(false);
    expect(previewPlacement(placed, cell, 'basic').reason).toBe('occupiedCell');
  });

  it('invalidates previews when enemies enter reserved cells and reuses them mid-edge', () => {
    const start = startFirstWave(content, parseLevel(['S===G', '=====']));
    const inMotion = step(start, []).state;
    expect(samePlacementPreviewInputs(inMotion, step(inMotion, []).state)).toBe(true);

    const atNextCell = run(inMotion, 3).state;
    const cell = 2 as CellIndex;
    expect(previewPlacement(inMotion, cell, 'basic').reason).toBeUndefined();
    expect(previewPlacement(atNextCell, cell, 'basic').reason).toBe('enemyOnCell');
    expect(samePlacementPreviewInputs(inMotion, atNextCell)).toBe(false);
  });

  it('previews the high-ground bonus against layer 0 without changing the route', () => {
    const start = createGame(placementContent, parseLevel(['S==G', '.#..']));
    expect(previewPlacement(start, 5 as CellIndex, 'basic')).toEqual({
      reason: undefined,
      route: [0, 1, 2, 3],
      rangeAtGround: 3.5,
      heightBonus: 1.5,
    });
    expect(start.money).toBe(100);
    expect(start.towers).toEqual([]);
  });
});
