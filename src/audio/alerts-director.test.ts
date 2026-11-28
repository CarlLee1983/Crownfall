import { expect, it, onTestFinished, vi } from 'vitest';
import { content } from '../content/content';
import { applyCommands, createGame, parseLevel, step } from '../core';
import { cellIndex } from '../core/level';
import { startLoop } from '../render/loop';
import { directSound, type SoundCommand } from './director';

const wave = { groups: [{ enemy: 'grunt', count: 1, interval: 1, delay: 0 }] };

it.each([
  {
    outcome: 'wave clears',
    waves: [wave, wave],
    music: { kind: 'music', track: 'preparation' },
    jingle: { sound: 'jingle-steel-10', duck: false },
  },
  {
    outcome: 'campaign is won',
    waves: [wave],
    music: { kind: 'stopMusic' },
    jingle: { sound: 'jingle-steel-02', duck: true },
  },
])(
  'plays the leak horn and the applicable jingle when the $outcome',
  ({ waves, music, jingle }) => {
    const initial = createGame(
      {
        ...content,
        enemies: { ...content.enemies, grunt: { ...content.enemies.grunt, speed: 30 } },
        waves,
      },
      parseLevel(['SG']),
    );
    const active = applyCommands(initial, [{ type: 'startWave', tick: 0 }]).state;
    const result = step(active, []);

    expect(directSound(result.events, active, result.state)).toEqual([
      { kind: 'effect', sound: 'leak-horn-1', bus: 'effects', pitchSemitones: 0, duck: true },
      { kind: 'effect', bus: 'effects', pitchSemitones: 0, ...jingle },
      music,
    ]);
  },
);

it.each([0, 1])('plays each tower edit and rejection in a frame at speed %d', (speed) => {
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
    onEvents: (events, previous, current, _time, accepted) => {
      sounds.push(...directSound(events, previous, current, [], accepted));
    },
    draw: () => {},
  });
  loop.setSpeed(speed);
  loop.enqueue((tick) => ({ type: 'placeTower', cell, kind: 'basic', tick }));
  loop.enqueue((tick) => ({ type: 'upgradeTower', cell, tick }));
  loop.enqueue((tick) => ({ type: 'sellTower', cell, tick }));
  loop.enqueue((tick) => ({ type: 'upgradeTower', cell, tick }));
  loop.enqueue((tick) => ({ type: 'startWave', tick }));
  loop.enqueue((tick) => ({ type: 'continueEndless', tick }));
  drawFrame(0);
  drawFrame(100);

  expect(sounds).toEqual(
    ['place-plank', 'upgrade-stone', 'sell-wood', 'ui-error-03', 'ui-error-03', 'ui-error-03'].map(
      (sound) => ({ kind: 'effect', sound, bus: 'ui', pitchSemitones: 0, duck: false }),
    ),
  );
});
