import { expect, it } from 'vitest';
import { content } from '../content/content';
import { level } from '../content/level';
import { applyCommands, type Content, createGame, type GameState, parseLevel, step } from '../core';
import { directInitialSound, directSound } from './director';

function musicTransition(previous: GameState, next: ReturnType<typeof step>) {
  return directSound(next.events, previous, next.state).filter(
    (command) => command.kind !== 'effect',
  );
}

function startWave(state: GameState) {
  return applyCommands(state, [{ type: 'startWave', tick: state.tick }]);
}

it('plays Catacombs upon starting the game and switches to Ancient Evil Awakens on opening a wave', () => {
  const initial = createGame(content, level);

  expect(directInitialSound(initial)).toEqual([{ kind: 'music', track: 'preparation' }]);
  expect(musicTransition(initial, startWave(initial))).toEqual([{ kind: 'music', track: 'wave' }]);
});

it('plays Apocalypse as soon as a wave with a delayed lich opens', () => {
  const initial = createGame(
    { ...content, waves: [{ groups: [{ enemy: 'boss', count: 1, interval: 1, delay: 10 }] }] },
    level,
  );
  const opened = startWave(initial);

  expect(opened.state.enemies).toEqual([]);
  expect(musicTransition(initial, opened)).toEqual([{ kind: 'music', track: 'lich' }]);
});

it('returns to Catacombs after a wave ends with lives remaining', () => {
  const initial = shortCampaign({ waves: [gruntWave, gruntWave] });
  const active = startWave(initial).state;
  const cleared = step(active, []);

  expect(cleared.state.phase).toBe('preparation');
  expect(musicTransition(active, cleared)).toEqual([{ kind: 'music', track: 'preparation' }]);
});

it('stops the music on victory and resumes Catacombs on continuing into Endless', () => {
  const lichWave = { groups: [{ ...gruntWave.groups[0], enemy: 'boss', delay: 10 }] };
  const initial = shortCampaign({
    waves: [gruntWave, gruntWave, gruntWave, lichWave, ...Array(5).fill(gruntWave)],
  });
  // The last campaign wave can clear with one tick. Endless then reuses wave four's groups.
  const active = startWave({ ...initial, waveNumber: 8 }).state;
  const won = step(active, []);
  expect(won.state.phase).toBe('victory');
  expect(musicTransition(active, won)).toEqual([{ kind: 'stopMusic' }]);

  const continued = applyCommands(won.state, [{ type: 'continueEndless', tick: won.state.tick }]);
  expect(musicTransition(won.state, continued)).toEqual([{ kind: 'music', track: 'preparation' }]);
  expect(musicTransition(continued.state, startWave(continued.state))).toEqual([
    { kind: 'music', track: 'lich' },
  ]);
});

const gruntWave = { groups: [{ enemy: 'grunt', count: 1, interval: 1, delay: 0 }] };

function shortCampaign(overrides: Partial<Content>) {
  return createGame(
    {
      ...content,
      enemies: { ...content.enemies, grunt: { ...content.enemies.grunt, speed: 30 } },
      waves: [gruntWave],
      ...overrides,
    },
    parseLevel(['SG']),
  );
}

it('switches to The Sad Battle on defeat and leaves it playing on later ticks', () => {
  const initial = shortCampaign({ startingLives: 1 });
  const active = startWave(initial).state;
  const lost = step(active, []);

  expect(lost.state.phase).toBe('defeat');
  expect(musicTransition(active, lost)).toEqual([{ kind: 'music', track: 'defeat' }]);
  expect(musicTransition(lost.state, step(lost.state, []))).toEqual([]);
});
