import { expect, it, vi } from 'vitest';
import { readAudioSettings, writeAudioSettings } from './settings';

it('uses the default mix before the player saves audio settings', () => {
  expect(readAudioSettings({ getItem: vi.fn(() => null) })).toEqual({
    muted: false,
    music: 0.6,
    effects: 1,
  });
});

it('round-trips the player’s mute and volume preferences', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  writeAudioSettings({ muted: true, music: 0, effects: 0.35 }, storage);
  expect(readAudioSettings(storage)).toEqual({ muted: true, music: 0, effects: 0.35 });
});

it.each([
  'invalid JSON',
  'null',
  '{"muted":true,"music":0.1}',
  '{"muted":"true","music":0.1,"effects":0.5}',
  '{"muted":true,"music":-0.1,"effects":0.5}',
  '{"muted":true,"music":0.1,"effects":1.1}',
  '{"muted":true,"music":"0.6","effects":0.5}',
])('uses the default mix for invalid saved settings (%s)', (saved) => {
  expect(readAudioSettings({ getItem: () => saved })).toEqual({
    muted: false,
    music: 0.6,
    effects: 1,
  });
});

it('uses the default mix if reading storage throws', () => {
  const getItem = () => {
    throw new Error('Storage denied');
  };
  expect(readAudioSettings({ getItem })).toEqual({ muted: false, music: 0.6, effects: 1 });
});
