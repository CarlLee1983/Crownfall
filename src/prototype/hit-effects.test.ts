import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, expect, test, vi } from 'vitest';
import { type GameEvent, queryTower } from '../core';
import { createEnemyLayer } from '../render/enemies';
import { createDemoState } from './hit-demo';
import { createHitEffects } from './hit-effects';

afterEach(() => vi.unstubAllGlobals());

test('presents health and kills in impact order and clears them on replay', () => {
  const previous = createDemoState();
  const target = previous.enemies[0];
  const mage = previous.towers.find(({ kind }) => kind === 'splash');
  const ballista = previous.towers.find(({ kind }) => kind === 'sniper');
  if (!target || !mage || !ballista) throw new Error('Expected the fixed combat fixture');
  const damage = queryTower(previous, mage.cell)?.damage ?? 0;
  const current = {
    ...previous,
    tick: previous.tick + 1,
    enemies: previous.enemies.filter(({ id }) => id !== target.id),
  };
  const events: GameEvent[] = [
    { type: 'shot', towerCell: mage.cell, target, splashRadius: 1.1 },
    {
      type: 'shot',
      towerCell: ballista.cell,
      target: { ...target, hp: target.hp - damage },
      splashRadius: undefined,
    },
    { type: 'killed', enemyId: target.id, enemyKind: target.kind, bounty: 4 },
  ];
  const enemies = createEnemyLayer(new PerspectiveCamera());
  const effects = createHitEffects(enemies, () => 1);
  enemies.update(previous, previous, 1);
  const fill = enemies.group.children[0]?.children[1]?.children[1];
  if (!fill) throw new Error('Expected the target’s health bar');
  const fullWidth = (fill.scale.x / target.hp) * target.maxHp;
  effects.onEvents(events, previous, current, 0, 'A');
  enemies.observe(current);

  const airborne = effects.update(0, 0, 'A', false);
  expect(airborne.reaction(target.id).hp).toBe(target.hp);
  expect(airborne.presentedKills).toBe(0);
  expect(airborne.hitFlash(target.id)).toBe(0);
  expect(enemies.targetPosition(target.id, new Vector3())).toBeDefined();
  enemies.update(previous, current, 1, airborne.hitFlash, 0, airborne.reaction);
  expect(fill.scale.x).toBeCloseTo((target.hp / target.maxHp) * fullWidth);

  const first = effects.update(500, 500, 'B', false);
  expect(first.reaction(target.id).hp).toBe(target.hp - damage);
  expect(first.presentedKills).toBe(0);
  expect(first.hitFlash(target.id)).toBeGreaterThan(0);
  enemies.update(previous, current, 1, first.hitFlash, 500, first.reaction);
  expect(fill.scale.x).toBeCloseTo(((target.hp - damage) / target.maxHp) * fullWidth);

  const lethal = effects.update(550, 550, 'C', false);
  expect(lethal.reaction(target.id).hp).toBe(0);
  expect(lethal.presentedKills).toBe(1);
  expect(lethal.bounties[0]?.id).toBe(target.id);
  enemies.update(previous, current, 1, lethal.hitFlash, 550, lethal.reaction);
  expect(fill.visible).toBe(false);

  enemies.reset();
  effects.reset();
  const replay = effects.update(0, 0, 'A', false);
  expect(replay.reaction(target.id).hp).toBeUndefined();
  expect(replay.presentedKills).toBe(0);
  expect(replay.bounties).toHaveLength(0);
});

test('replay immediately silences an active voice', () => {
  const oscillator = {
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn((node) => node),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const volume = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running';
      currentTime = 0;
      createDynamicsCompressor = () => ({ connect: vi.fn() });
      createGain = () => volume;
      createOscillator = () => oscillator;
    },
  );
  const previous = createDemoState();
  const target = previous.enemies[0];
  if (!target) throw new Error('Expected the fixed combat fixture');
  const effects = createHitEffects(createEnemyLayer(new PerspectiveCamera()), () => 1);
  effects.unlockAudio();
  effects.onEvents(
    [{ type: 'leaked', enemyId: target.id, enemyKind: target.kind, livesLost: 1 }],
    previous,
    previous,
    0,
    'C',
  );
  expect(oscillator.start).toHaveBeenCalledTimes(1);
  expect(oscillator.stop).toHaveBeenCalledWith(0.12);
  effects.reset();
  expect(oscillator.stop).toHaveBeenLastCalledWith();
  expect(volume.disconnect).toHaveBeenCalledOnce();
});
