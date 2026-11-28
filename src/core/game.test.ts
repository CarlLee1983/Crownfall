import { describe, expect, it } from 'vitest';
import {
  applyCommands,
  type CellIndex,
  type Command,
  type Content,
  canAffordTower,
  continueRejection,
  createGame,
  currentRoute,
  enemyPosition,
  enemyRouteSegments,
  type GameEvent,
  type GameState,
  type Level,
  parseLevel,
  previewPlacement,
  queryTower,
  samePlacementPreviewInputs,
  step,
  waveStartRejection,
} from './index';

// 每秒 7.5 格 = 每 tick 0.25 格，讓位置在二進位浮點下精確。
const content = {
  enemies: { grunt: { speed: 7.5, hp: 12, bounty: 5, leakDamage: 1 } },
  waves: [{ groups: [{ enemy: 'grunt', count: 1, interval: 1, delay: 0 }] }],
  towers: { basic: { name: 'Basic', cost: 30, range: 2, damage: 4, shotsPerSecond: 0 } },
  towerUpgrades: { costPercents: [60, 100], damageMultiplier: 1.5, rangeBonus: 0.3 },
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

describe('upgrading and selling towers', () => {
  it('quotes both upgrades, changes tower stats, and rejects upgrading a level 3 tower', () => {
    const cell = 6 as CellIndex;
    const initial = createGame(content, parseLevel(['S==G', '..#.']));
    expect(queryTower(initial, cell)).toBeNull();

    const placed = step(initial, [{ type: 'placeTower', cell, kind: 'basic', tick: 0 }]).state;
    expect(queryTower(placed, cell)).toEqual({
      kind: 'basic',
      level: 1,
      range: 3.5,
      damage: 4,
      upgradeCost: 18,
      refund: 30,
      refundPercent: 100,
    });
    expect(queryTower(placed, cell, 1)?.range).toBe(2);

    const upgraded = step(placed, [{ type: 'upgradeTower', cell, tick: 1 }]);
    expect(upgraded.events).toEqual([]);
    expect(upgraded.state.money).toBe(52);
    expect(queryTower(upgraded.state, cell)).toMatchObject({
      level: 2,
      range: 3.8,
      damage: 6,
      upgradeCost: 30,
      refund: 48,
    });

    const maxed = step(upgraded.state, [{ type: 'upgradeTower', cell, tick: 2 }]);
    expect(maxed.events).toEqual([]);
    expect(maxed.state.money).toBe(22);
    expect(queryTower(maxed.state, cell)).toMatchObject({
      level: 3,
      range: 4.1,
      damage: 9,
      upgradeCost: null,
      refund: 78,
    });
    expect(applyCommands(maxed.state, [{ type: 'upgradeTower', cell, tick: 3 }])).toEqual({
      state: maxed.state,
      events: [{ type: 'rejected', cell, reason: 'maxLevel' }],
    });
  });

  it('refunds all spending on a tower placed after an earlier wave has started', () => {
    const cell = 4 as CellIndex;
    const initial = createGame(
      { ...content, waves: [{ groups: [] }, ...content.waves] },
      parseLevel(['S==G', '....']),
    );
    const betweenWaves = step(initial, [{ type: 'startWave', tick: 0 }]).state;
    const built = applyCommands(betweenWaves, [
      { type: 'placeTower', cell, kind: 'basic', tick: 1 },
      { type: 'upgradeTower', cell, tick: 1 },
    ]).state;
    expect(queryTower(built, cell)).toMatchObject({ refund: 48, refundPercent: 100 });

    const sold = step(built, [{ type: 'sellTower', cell, tick: 1 }]);
    expect(sold.events).toEqual([]);
    expect(sold.state.money).toBe(112);
    expect(queryTower(sold.state, cell)).toBeNull();
  });

  it('refunds 70% including upgrades during the wave and opens the route while paused', () => {
    const cell = 4 as CellIndex;
    const initial = createGame(content, parseLevel(['S====G', '===.==', '======']));
    const started = applyCommands(initial, [
      { type: 'placeTower', cell, kind: 'basic', tick: 0 },
      { type: 'startWave', tick: 0 },
    ]).state;
    const approaching = run(started, 8).state;
    expect(positions(approaching)).toEqual([{ x: 2, y: 0 }]);
    expect(currentRoute(approaching)).toEqual([0, 1, 2, 8, 14, 15, 16, 10, 11, 5]);

    const upgraded = applyCommands(approaching, [{ type: 'upgradeTower', cell, tick: 8 }]);
    expect(upgraded.events).toEqual([]);
    expect(queryTower(upgraded.state, cell)).toMatchObject({ refund: 33, refundPercent: 70 });

    const sold = applyCommands(upgraded.state, [{ type: 'sellTower', cell, tick: 8 }]);
    expect(sold.events).toEqual([]);
    expect(sold.state).toMatchObject({ tick: 8, money: 85 });
    expect(queryTower(sold.state, cell)).toBeNull();
    expect(positions(sold.state)).toEqual([{ x: 2, y: 0 }]);
    expect(currentRoute(sold.state)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(positions(step(sold.state, []).state)).toEqual([{ x: 2.25, y: 0 }]);
  });

  it.each([
    { level: 2, range: 0.5, remainingHp: 6 },
    { level: 3, range: 0.25, remainingHp: 3 },
  ])(
    'uses level $level range and damage on the tick a wave starts',
    ({ level, range, remainingHp }) => {
      const cell = 8 as CellIndex;
      const initial = createGame(
        {
          ...content,
          towers: { basic: { ...content.towers.basic, range, shotsPerSecond: 1 } },
        },
        parseLevel(['S====G', '..#...']),
      );
      const placed = applyCommands(initial, [
        { type: 'placeTower', cell, kind: 'basic', tick: 0 },
      ]).state;
      const wave = { type: 'startWave', tick: 0 } as const;
      const upgrade = { type: 'upgradeTower', cell, tick: 0 } as const;
      const previousLevel = level === 3 ? applyCommands(placed, [upgrade]).state : placed;
      expect(step(previousLevel, [wave]).events).toEqual([]);

      const upgraded = step(previousLevel, [upgrade, wave]);
      expect(upgraded.events).toMatchObject([{ type: 'shot', towerCell: cell }]);
      expect(upgraded.state.enemies).toMatchObject([{ hp: remainingHp }]);
    },
  );

  it('rejects unaffordable upgrades, stale commands, and commands for an empty cell', () => {
    const cell = 4 as CellIndex;
    const empty = 5 as CellIndex;
    const initial = createGame({ ...content, startingMoney: 47 }, parseLevel(['S==G', '....']));
    const placed = step(initial, [{ type: 'placeTower', cell, kind: 'basic', tick: 0 }]).state;
    expect(
      applyCommands(placed, [
        { type: 'upgradeTower', cell, tick: 1 },
        { type: 'sellTower', cell, tick: 0 },
        { type: 'upgradeTower', cell: empty, tick: 1 },
        { type: 'sellTower', cell: empty, tick: 1 },
      ]),
    ).toEqual({
      state: placed,
      events: [
        { type: 'rejected', cell, reason: 'insufficientFunds' },
        { type: 'rejected', cell, reason: 'wrongTick' },
        { type: 'rejected', cell: empty, reason: 'noTower' },
        { type: 'rejected', cell: empty, reason: 'noTower' },
      ],
    });
  });
});

describe('wave commands', () => {
  it.each([0, -1])('ends at creation with %i starting lives', (startingLives) => {
    const initial = createGame(
      { ...content, startingLives, waves: [{ groups: [] }] },
      parseLevel(['SG']),
    );
    expect(initial).toMatchObject({ tick: 0, phase: 'defeat', defeatReason: 'noLives', lives: 0 });
    expect(waveStartRejection(initial)).toBe('gameOver');
    expect(step(initial, [{ type: 'startWave', tick: 0 }])).toEqual({
      state: initial,
      events: [{ type: 'waveRejected', reason: 'gameOver' }],
    });
  });

  it('waits in preparation for the player to start the wave', () => {
    const initial = createGame(content, parseLevel(['S==G']));
    const waiting = run(initial, 30).state;
    expect(waiting).toMatchObject({ phase: 'preparation', waveNumber: 0, enemies: [] });
    expect(waveStartRejection(waiting)).toBeUndefined();

    const opened = step(waiting, [
      { type: 'startWave', tick: 30 },
      { type: 'startWave', tick: 30 },
    ]);
    expect(opened.state).toMatchObject({ phase: 'wave', waveNumber: 1 });
    expect(positions(opened.state)).toEqual([{ x: 0.25, y: 0 }]);
    expect(waveStartRejection(opened.state)).toBe('waveInProgress');
    expect(opened.events).toEqual([{ type: 'waveRejected', reason: 'waveInProgress' }]);
  });

  it('rejects opening a wave when no waves are defined', () => {
    const initial = createGame({ ...content, waves: [] }, parseLevel(['SG']));
    expect(waveStartRejection(initial)).toBe('noNextWave');
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

describe('endless mode', () => {
  it('keeps short campaigns at victory when the endless templates are missing', () => {
    const initial = createGame({ ...content, waves: [{ groups: [] }] }, parseLevel(['SG']));
    const won = step(initial, [{ type: 'startWave', tick: 0 }]).state;
    expect(won.phase).toBe('victory');
    expect(continueRejection(won)).toBe('noNextWave');
    expect(step(won, [{ type: 'continueEndless', tick: won.tick }])).toEqual({
      state: won,
      events: [{ type: 'continueRejected', reason: 'noNextWave' }],
    });
  });

  it('continues only from victory with the current tick and preserves the completed campaign', () => {
    const level = parseLevel(['SG', '..']);
    const campaign = { ...content, waves: Array.from({ length: 10 }, () => ({ groups: [] })) };
    const initial = createGame(campaign, level);
    const cell = 2 as CellIndex;
    const built = step(initial, [{ type: 'placeTower', cell, kind: 'basic', tick: 0 }]).state;
    const early = step(built, [{ type: 'continueEndless', tick: built.tick }]);
    expect(early.events).toEqual([{ type: 'continueRejected', reason: 'notVictory' }]);
    expect(early.state).toMatchObject({ phase: 'preparation', waveNumber: 0, endless: false });

    let state = early.state;
    for (let i = 0; i < 9; i++) {
      state = step(state, [{ type: 'startWave', tick: state.tick }]).state;
    }
    const won = step(state, [{ type: 'startWave', tick: state.tick }]);
    expect(won.events).toContainEqual({ type: 'victory', waveNumber: 10 });
    const stale = step(won.state, [{ type: 'continueEndless', tick: won.state.tick - 1 }]);
    expect(stale).toEqual({
      state: won.state,
      events: [{ type: 'continueRejected', reason: 'wrongTick' }],
    });

    const continued = step(won.state, [{ type: 'continueEndless', tick: won.state.tick }]);
    expect(continued.events).toEqual([]);
    expect(continued.state).toMatchObject({
      phase: 'preparation',
      waveNumber: 10,
      endless: true,
      money: 190,
      lives: 10,
      towers: won.state.towers,
    });

    const lost = createGame({ ...campaign, startingLives: 0 }, level);
    expect(step(lost, [{ type: 'continueEndless', tick: 0 }])).toEqual({
      state: lost,
      events: [{ type: 'continueRejected', reason: 'notVictory' }],
    });
  });

  it('cycles through waves 4–9 and compounds group sizes and enemy HP at wave 17', () => {
    const campaign = {
      ...content,
      startingLives: 100,
      enemies: {
        grunt: { ...content.enemies.grunt, hp: 20, speed: 0.3 },
        tank: { ...content.enemies.grunt, hp: 40, speed: 0.3 },
      },
      waves: [
        { groups: [] },
        { groups: [] },
        { groups: [] },
        {
          groups: [
            { enemy: 'grunt', count: 2, interval: 0.1, delay: 0 },
            { enemy: 'tank', count: 1, interval: 0.2, delay: 0.1 },
          ],
        },
        { groups: [{ enemy: 'grunt', count: 3, interval: 0, delay: 0 }] },
        { groups: [{ enemy: 'tank', count: 1, interval: 0, delay: 0 }] },
        { groups: [{ enemy: 'grunt', count: 4, interval: 0, delay: 0 }] },
        { groups: [{ enemy: 'tank', count: 2, interval: 0, delay: 0 }] },
        { groups: [{ enemy: 'grunt', count: 6, interval: 0, delay: 0 }] },
        { groups: [{ enemy: 'tank', count: 1, interval: 0, delay: 0 }] },
      ],
    } satisfies Content;
    let state = createGame(campaign, parseLevel(['SG']));
    const open = (before: GameState) => step(before, [{ type: 'startWave', tick: before.tick }]);
    for (let i = 0; i < 9; i++) state = run(open(state).state, 110).state;
    const finale = open(state);
    expect(finale.state.enemies).toMatchObject([{ kind: 'tank', hp: 40 }]);
    const won = run(finale.state, 110).state;
    expect(won).toMatchObject({ phase: 'victory', waveNumber: 10 });
    state = step(won, [{ type: 'continueEndless', tick: won.tick }]).state;

    const expected = [
      { waveNumber: 11, grunts: 3, tanks: 2, gruntHp: 23, tankHp: 46 },
      { waveNumber: 12, grunts: 4, tanks: 0, gruntHp: 23, tankHp: 46 },
      { waveNumber: 13, grunts: 0, tanks: 2, gruntHp: 23, tankHp: 46 },
      { waveNumber: 14, grunts: 5, tanks: 0, gruntHp: 23, tankHp: 46 },
      { waveNumber: 15, grunts: 0, tanks: 3, gruntHp: 23, tankHp: 46 },
      { waveNumber: 16, grunts: 7, tanks: 0, gruntHp: 23, tankHp: 46 },
      { waveNumber: 17, grunts: 4, tanks: 3, gruntHp: 26.45, tankHp: 52.9 },
    ];
    for (const { waveNumber, grunts, tanks, gruntHp, tankHp } of expected) {
      const opened = open(state).state;
      expect(opened).toMatchObject({ phase: 'wave', waveNumber });
      if (waveNumber === 11) {
        expect(opened.enemies.map(({ kind }) => kind)).toEqual(['grunt']);
        expect(run(opened, 2).state.enemies.map(({ kind }) => kind)).toEqual([
          'grunt',
          'grunt',
          'tank',
        ]);
      }
      const spawned = run(opened, 16).state;
      expect(spawned.enemies.filter(({ kind }) => kind === 'grunt')).toHaveLength(grunts);
      expect(spawned.enemies.filter(({ kind }) => kind === 'tank')).toHaveLength(tanks);
      for (const enemy of spawned.enemies) {
        expect(enemy.hp).toBeCloseTo(enemy.kind === 'grunt' ? gruntHp : tankHp);
        expect(enemy.maxHp).toBe(enemy.hp);
      }
      const cleared = run(spawned, 110);
      expect(cleared.events).toContainEqual({ type: 'waveCleared', waveNumber, reward: 12 });
      expect(cleared.state).toMatchObject({ phase: 'preparation', waveNumber, endless: true });
      state = cleared.state;
    }
  });
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

  it('settles a nonlethal arrow and a killing arrow before a castle leak in the same tick', () => {
    const start = startFirstWave(
      {
        ...content,
        enemies: { grunt: { speed: 30, hp: 8, bounty: 5, leakDamage: 1 } },
        towers: { basic: { ...basic, range: 3 } },
      },
      parseLevel(['S=G', '...']),
    );
    const before = run(start, 1).state;
    const result = step(
      before,
      [3, 4, 5].map((cell) => ({
        type: 'placeTower' as const,
        kind: 'basic',
        cell: cell as CellIndex,
        tick: before.tick,
      })),
    );

    expect(result.events).toMatchObject([
      {
        type: 'shot',
        towerCell: 3,
        towerKind: 'basic',
        impacts: [{ target: { id: 1, hp: 8 }, hp: 4 }],
      },
      {
        type: 'shot',
        towerCell: 4,
        towerKind: 'basic',
        impacts: [{ target: { id: 1, hp: 4 }, hp: 0, bounty: 5 }],
      },
      { type: 'killed', enemyId: 1, bounty: 5 },
      { type: 'waveCleared' },
      { type: 'victory' },
    ]);
    expect(result.state.enemies).toEqual([]);
    expect(result.state.money).toBe(27);
    expect(result.state.lives).toBe(before.lives);
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

  it('invalidates an otherwise identical preview when the game ends', () => {
    const initial = createGame(
      { ...content, waveClearReward: 0, waves: [{ groups: [] }] },
      parseLevel(['SG', '..']),
    );
    const cell = 2 as CellIndex;
    expect(previewPlacement(initial, cell, 'basic').reason).toBeUndefined();
    const ended = step(initial, [{ type: 'startWave', tick: 0 }]).state;

    expect(ended.phase).toBe('victory');
    expect(samePlacementPreviewInputs(initial, ended)).toBe(false);
    expect(previewPlacement(ended, cell, 'basic').reason).toBe('gameOver');
    expect(step(ended, [{ type: 'placeTower', cell, kind: 'basic', tick: 1 }]).events).toEqual([
      { type: 'rejected', cell, reason: 'gameOver' },
    ]);
  });

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
