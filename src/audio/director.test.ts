import { expect, it } from 'vitest';
import { content } from '../content/content';
import { level } from '../content/level';
import { createGame, step } from '../core';
import { directSound } from './director';

it('plays a horn that ducks music when a startWave command opens a wave', () => {
  const preparation = step(createGame(content, level), []).state;
  const opened = step(preparation, [{ type: 'startWave', tick: preparation.tick }]);

  expect(
    directSound(opened.events, preparation, opened.state).filter(
      (command) => command.kind === 'effect',
    ),
  ).toEqual([
    { kind: 'effect', sound: 'war-horns', bus: 'effects', pitchSemitones: 0, duck: true },
  ]);

  const rejected = step(opened.state, [{ type: 'startWave', tick: opened.state.tick }]);
  expect(directSound(rejected.events, opened.state, rejected.state)).toEqual([]);
});
