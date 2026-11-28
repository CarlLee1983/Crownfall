import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { content } from '../content/content';
import { applyCommands, createGame, parseLevel, step } from '../core';
import { directSound, type EffectCommand } from './director';
import { connectEffects } from './effects';

const BELL_SECONDS = 1.48;

interface FakeSource {
  readonly startedAt: number;
  stoppedAt?: number;
  onended: (() => void) | null;
}

function fakeAudioContext() {
  const sources: FakeSource[] = [];
  const param = () => ({
    value: 1,
    cancelScheduledValues: () => undefined,
    setValueAtTime: () => undefined,
    setTargetAtTime: () => undefined,
  });
  const node = () => ({ gain: param(), connect: (next: unknown) => next, disconnect: () => {} });
  const context = {
    currentTime: 0,
    state: 'running',
    createGain: node,
    createBufferSource: () => {
      const record: FakeSource = { startedAt: Number.NaN, onended: null };
      const source = {
        ...node(),
        buffer: null,
        playbackRate: param(),
        set onended(callback: () => void) {
          record.onended = callback;
        },
        start: (at: number) => {
          Object.assign(record, { startedAt: at });
          sources.push(record);
        },
        stop: () => {
          record.stoppedAt = context.currentTime;
        },
      };
      return source;
    },
    decodeAudioData: async () => ({ duration: BELL_SECONDS }),
  };
  return { context: context as unknown as AudioContext, sources, clock: context };
}

function leakBell(): EffectCommand {
  const initial = createGame(
    {
      ...content,
      enemies: { ...content.enemies, grunt: { ...content.enemies.grunt, speed: 30 } },
      waves: [{ groups: [{ enemy: 'grunt', count: 1, interval: 1, delay: 0 }] }],
    },
    parseLevel(['SG']),
  );
  const active = applyCommands(initial, [{ type: 'startWave', tick: 0 }]).state;
  const result = step(active, []);
  const bell = directSound(result.events, active, result.state).find(
    (command): command is EffectCommand =>
      command.kind === 'effect' && command.sound === 'leak-bell',
  );
  if (bell === undefined) throw new Error('A leak should ring the leak bell.');
  return bell;
}

beforeEach(() => {
  vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('keeps a single leak bell ringing through a run of leaks half a second apart', async () => {
  const { context, sources, clock } = fakeAudioContext();
  const gain = () => context.createGain();
  const effects = connectEffects(context, { effects: gain(), ui: gain(), ducking: gain() });
  await effects.unlock(Promise.resolve());
  const bell = leakBell();

  for (let leak = 0; leak < 6; leak++) {
    clock.currentTime = leak * 0.5;
    effects.play([bell]);
  }

  expect(sources.map(({ startedAt, stoppedAt }) => ({ startedAt, stoppedAt }))).toEqual([
    { startedAt: 0, stoppedAt: undefined },
  ]);

  clock.currentTime = BELL_SECONDS;
  sources[0]?.onended?.();
  effects.play([bell]);

  expect(sources.map(({ startedAt }) => startedAt)).toEqual([0, BELL_SECONDS]);
});
