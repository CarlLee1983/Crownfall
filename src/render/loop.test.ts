import { expect, it, onTestFinished, vi } from 'vitest';
import { directCommandSound, type SoundCommand } from '../audio/director';
import { content } from '../content/content';
import { createGame, parseLevel } from '../core';
import { cellIndex } from '../core/level';
import { startLoop } from './loop';

it.each([0, 1])('plays tower edits and rejections in submission order at speed %d', (speed) => {
  const initial = createGame(
    { ...content, startingMoney: 999, waves: [] },
    parseLevel(['S==G', '..#.']),
  );
  const cell = cellIndex(4, 2, 1);
  let drawFrame: FrameRequestCallback = () => {
    throw new Error('No animation frame was scheduled');
  };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    drawFrame = callback;
  });
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });

  const sounds: SoundCommand[] = [];
  const loop = startLoop({
    initial,
    onEvents: (_events, _previous, _current, _time, commands) => {
      for (const { command, events } of commands) {
        const cue = directCommandSound(command, events);
        if (cue !== undefined) sounds.push(cue);
      }
    },
    draw: () => {},
  });
  loop.setSpeed(speed);
  loop.enqueue((tick) => ({ type: 'upgradeTower', cell, tick }));
  loop.enqueue((tick) => ({ type: 'placeTower', cell, kind: 'basic', tick }));
  loop.enqueue((tick) => ({ type: 'upgradeTower', cell, tick }));
  loop.enqueue((tick) => ({ type: 'sellTower', cell, tick }));
  loop.enqueue((tick) => ({ type: 'upgradeTower', cell, tick }));
  loop.enqueue((tick) => ({ type: 'startWave', tick }));
  loop.enqueue((tick) => ({ type: 'continueEndless', tick }));
  drawFrame(0);
  drawFrame(100);

  expect(sounds).toEqual(
    [
      'ui-error-03',
      'place-plank',
      'upgrade-stone',
      'sell-wood',
      'ui-error-03',
      'ui-error-03',
      'ui-error-03',
    ].map((sound) => ({ kind: 'effect', sound, bus: 'ui', pitchSemitones: 0, duck: false })),
  );
});
