import { Mesh, MeshLambertMaterial, PerspectiveCamera } from 'three';
import { expect, it, onTestFinished, vi } from 'vitest';
import { type Content, createGame, parseLevel, step } from '../core';
import { cellIndex } from '../core/level';
import { createCombatFeedback } from './combat-feedback';
import { createEnemyLayer } from './enemies';
import { startLoop } from './loop';

function fixture({
  bounty = 5,
  count = 1,
  damage = 12,
  enemyKind = 'grunt',
  immediate = false,
  hp = 12,
  speed = 15,
  shotsPerSecond = 1,
} = {}) {
  const content = {
    enemies: { [enemyKind]: { speed, hp, bounty, leakDamage: 1 } },
    waves: [{ groups: [{ enemy: enemyKind, count, interval: 0, delay: immediate ? 0 : 1 / 30 }] }],
    towers: {
      splash: { name: 'Splash', cost: 10, range: 3, damage, shotsPerSecond, splashRadius: 1 },
    },
    towerUpgrades: { costPercents: [60, 100], damageMultiplier: 1, rangeBonus: 0 },
    startingMoney: 100,
    startingLives: 100,
    waveClearReward: 0,
    heightRangeBonus: 0,
  } satisfies Content;
  const level = parseLevel(['S=G', '...']);
  return createGame(content, level);
}

function setup({
  placeTower = true,
  ...options
}: Parameters<typeof fixture>[0] & {
  placeTower?: boolean;
} = {}) {
  const initial = fixture(options);
  const enemies = createEnemyLayer(new PerspectiveCamera());
  const feedback = createCombatFeedback(enemies);
  let previous = initial;
  const first = step(initial, [
    { type: 'startWave', tick: 0 },
    ...(placeTower
      ? [{ type: 'placeTower', cell: cellIndex(3, 0, 1), kind: 'splash', tick: 0 } as const]
      : []),
  ]);
  feedback.onEvents(first.events, initial, 0);
  let current = first.state;
  enemies.update(previous, current, 1);
  return {
    feedback,
    advance(gameTime: number) {
      previous = current;
      const result = step(previous, []);

      current = result.state;
      feedback.onEvents(result.events, previous, gameTime);
      enemies.observe(current);
      enemies.update(previous, current, 1);
      return result.events;
    },
  };
}

it('shows the bounty at the defeated enemy’s last drawn position', () => {
  const { feedback, advance } = setup();
  advance(100);
  const { bounties } = feedback.update(100, false);
  expect(bounties.map(({ text }) => text)).toEqual(['+5']);
  expect(bounties[0]?.position.toArray()).toEqual([0, 0.8, 0]);
});

it('shows a separate bounty when one splash shot kills multiple enemies at the entrance', () => {
  const { feedback } = setup({ count: 2, immediate: true });
  expect(feedback.update(0, false).bounties.map(({ text }) => text)).toEqual(['+5', '+5']);
});

it('does not show a bounty for a zero-reward kill', () => {
  const { feedback, advance } = setup({ bounty: 0 });
  advance(100);
  expect(feedback.update(100, false).bounties).toEqual([]);
});

it('keeps all six death fragments on the world layer', () => {
  const { feedback, advance } = setup();
  advance(100);
  feedback.update(220, false);
  expect(feedback.group.children.map((fragment) => fragment.layers.mask)).toEqual(Array(6).fill(1));
});

it.each([
  ['grunt', 0xffd060],
  ['runner', 0x60ff90],
  ['tank', 0x60a0ff],
  ['boss', 0xff60e0],
])('lights the %s body and its death fragments with the same glow color', (enemyKind, color) => {
  const initial = fixture({ enemyKind, immediate: true });
  const state = step(initial, [{ type: 'startWave', tick: 0 }]).state;
  const enemies = createEnemyLayer(new PerspectiveCamera());
  enemies.update(state, state, 1);
  const [body] = enemies.group.children[0]?.children ?? [];
  if (!(body instanceof Mesh) || !(body.material instanceof MeshLambertMaterial)) {
    throw new Error('Missing enemy body');
  }
  expect(body.material.emissive.getHex()).toBe(color);
  expect(body.material.emissiveIntensity).toBeGreaterThan(0);

  const { feedback } = setup({ enemyKind, immediate: true });
  expect(feedback.group.children).toHaveLength(6);
  for (const fragment of feedback.group.children) {
    if (!(fragment instanceof Mesh) || !(fragment.material instanceof MeshLambertMaterial)) {
      throw new Error('Missing death fragment');
    }
    expect(fragment.material.color.getHex()).toBe(color);
    expect(fragment.material.emissive.getHex()).toBe(color);
  }
});

it('caps the number of visible fragments after many simultaneous kills', () => {
  const { feedback, advance } = setup({ count: 20 });
  advance(100);
  const frame = feedback.update(100, false);
  expect(frame.bounties).toHaveLength(20);
  expect(feedback.group.children).toHaveLength(48);
});

it('triggers one shake for several leaks in the same tick', () => {
  const single = setup({ placeTower: false });
  const simultaneous = setup({ placeTower: false, count: 3 });
  for (const session of [single, simultaneous]) {
    for (const time of [100, 133, 166, 199]) session.advance(time);
  }
  const first = single.feedback.update(230, false);
  const multiple = simultaneous.feedback.update(230, false);
  expect(first.shake.length()).toBeGreaterThan(0);
  expect(multiple.shake.toArray()).toEqual(first.shake.toArray());
  expect(multiple.castleFlash).toBeGreaterThan(0);
  expect(multiple.lifePulse).toBeGreaterThan(0);
  const reduced = simultaneous.feedback.update(230, true);
  expect(reduced.shake.toArray()).toEqual([0, 0]);
  expect(reduced.castleFlash).toBe(multiple.castleFlash);
  expect(reduced.lifePulse).toBe(multiple.lifePulse);
});

it('keeps feedback fixed at the same game time and removes it after its lifetime', () => {
  const { feedback, advance } = setup();
  advance(100);
  const before = feedback.update(220, false);
  const position = feedback.group.children[0]?.position.clone();
  const paused = feedback.update(220, false);
  expect(paused.bounties).toEqual(before.bounties);
  expect(feedback.group.children[0]?.position).toEqual(position);
  expect(feedback.update(820, false).bounties).toEqual([]);
  expect(feedback.group.children).toHaveLength(0);
});

function setupLoop(initial: ReturnType<typeof fixture>) {
  const feedback = createCombatFeedback(createEnemyLayer(new PerspectiveCamera()));
  let nextFrame: FrameRequestCallback = () => {
    throw new Error('No animation frame was scheduled');
  };
  let flash = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrame = callback;
  });
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  const loop = startLoop({
    initial,
    onEvents: (events, previous, _current, time) => {
      feedback.onEvents(events, previous, time.gameMs);
    },
    draw: (_previous, _current, _alpha, time) => {
      flash = feedback.update(time.gameMs, false).hitFlash(initial.nextEnemyId);
    },
  });
  loop.enqueue((tick) => ({
    type: 'placeTower',
    cell: cellIndex(3, 0, 1),
    kind: 'splash',
    tick,
  }));
  loop.enqueue((tick) => ({ type: 'startWave', tick }));
  return {
    setSpeed: loop.setSpeed,
    draw(wallMs: number) {
      nextFrame(wallMs);
      return flash;
    },
  };
}

it('shows a hit after a late 2× frame, freezes it on pause, and fades it in game time', () => {
  const { draw, setSpeed } = setupLoop(fixture({ damage: 4, immediate: true, speed: 1 }));
  setSpeed(2);
  draw(0);
  const firstFlash = draw(70);
  expect(firstFlash).toBeGreaterThan(0);

  setSpeed(0);
  draw(80);
  expect(draw(280)).toBe(firstFlash);

  setSpeed(2);
  draw(290);
  const resumedFlash = draw(315);
  expect(resumedFlash).toBeGreaterThan(0);
  expect(resumedFlash).toBeLessThan(firstFlash);
  expect(draw(341)).toBe(0);
});

it('draws the original target color between repeated hits at 2× with slow frames', () => {
  const { draw, setSpeed } = setupLoop(
    fixture({ damage: 1, immediate: true, hp: 100, speed: 1, shotsPerSecond: 15 }),
  );
  setSpeed(2);
  draw(0);
  expect(draw(100)).toBeGreaterThan(0);
  expect(draw(200)).toBe(0);
  expect(draw(300)).toBeGreaterThan(0);
  expect(draw(400)).toBe(0);
  expect(draw(500)).toBeGreaterThan(0);
  expect(draw(600)).toBe(0);
});

it('preserves the target color and leaves a gap even when towers keep hitting it', () => {
  const { feedback, advance } = setup({ damage: 1, speed: 1, shotsPerSecond: 15 });
  const shot = advance(0).find((event) => event.type === 'shot');
  if (shot === undefined) throw new Error('Expected a shot');
  const id = shot.target.id;
  const initial = feedback.update(0, false).hitFlash(id);
  expect(initial).toBeGreaterThan(0);
  expect(initial).toBeLessThan(1);
  advance(33);
  advance(67);
  expect(feedback.update(100, false).hitFlash(id)).toBe(0);
  advance(100);
  advance(133);
  expect(feedback.update(133, false).hitFlash(id)).toBe(0);
  advance(167);
  advance(200);
  expect(feedback.update(200, false).hitFlash(id)).toBeGreaterThan(0);
});
