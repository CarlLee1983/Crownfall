import archerHitUrl from './clips/archer-hit-soft.opus?url&no-inline';
import ballistaHitUrl from './clips/ballista-hit-plate.opus?url&no-inline';
import boneBreakUrl from './clips/bone-break-3.opus?url&no-inline';
import crossbowUrl from './clips/crossbow-1.opus?url&no-inline';
import lichShadeUrl from './clips/lich-shade-1.opus?url&no-inline';
import longbowUrl from './clips/longbow-soft.opus?url&no-inline';
import spellFireUrl from './clips/spell-fire-2.opus?url&no-inline';
import warHornsUrl from './clips/war-horns.opus?url&no-inline';
import type { EffectCommand, SoundId } from './director';

const EFFECT_URLS: Record<SoundId, readonly string[]> = {
  'archer-hit-soft': [archerHitUrl],
  'ballista-hit-plate': [ballistaHitUrl],
  'bone-break-3': [boneBreakUrl],
  'crossbow-1': [crossbowUrl],
  'lich-shade-1': [lichShadeUrl],
  'longbow-soft': [longbowUrl],
  'spell-fire-2': [spellFireUrl],
  'war-horns': [warHornsUrl],
};
const DUCK_GAIN = 10 ** (-12 / 20);
const VOICE_LIMIT = 4;

interface EffectBank {
  readonly buffers: readonly AudioBuffer[];
  readonly playing: Set<AudioBufferSourceNode>;
  next: number;
}

async function loadEffect(context: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Sound download failed (${response.status}) for ${url}`);
  return context.decodeAudioData(await response.arrayBuffer());
}

export function connectEffects(
  context: AudioContext,
  buses: { effects: GainNode; ui: GainNode; ducking: GainNode },
) {
  const banks = new Map<string, EffectBank>();
  const pending: EffectCommand[] = [];
  let loading: Promise<unknown> | undefined;
  let ready = false;
  let duckUntil = 0;

  function play(commands: readonly EffectCommand[]): void {
    if (!ready || context.state !== 'running') {
      if (loading !== undefined) pending.push(...commands);
      return;
    }
    for (const command of commands) {
      const bank = banks.get(command.sound);
      const buffer = bank?.buffers[bank.next];
      if (bank === undefined || buffer === undefined) continue;
      bank.next = (bank.next + 1) % bank.buffers.length;
      if (bank.playing.size === VOICE_LIMIT) {
        const oldest = bank.playing.values().next().value;
        if (oldest !== undefined) {
          bank.playing.delete(oldest);
          oldest.stop();
        }
      }

      const now = context.currentTime;
      const source = context.createBufferSource();
      const gain = context.createGain();
      const pitch = command.pitchSemitones + (2 * Math.random() - 1);
      const rate = 2 ** (pitch / 12);
      gain.gain.value = 10 ** ((4 * Math.random() - 2) / 20);
      source.buffer = buffer;
      source.playbackRate.value = rate;
      source.connect(gain).connect(buses[command.bus]);
      source.onended = () => {
        bank.playing.delete(source);
        source.disconnect();
        gain.disconnect();
      };

      source.start(now);
      bank.playing.add(source);
      if (command.duck) {
        duckUntil = Math.max(duckUntil, now + buffer.duration / rate);
        buses.ducking.gain.cancelScheduledValues(now);
        buses.ducking.gain.setTargetAtTime(DUCK_GAIN, now, 0.015);
        buses.ducking.gain.setTargetAtTime(1, duckUntil, 0.1);
      }
    }
  }

  return {
    async unlock(running: Promise<void>): Promise<void> {
      loading ??= Promise.all(
        Object.entries(EFFECT_URLS).map(async ([sound, urls]) => {
          try {
            const buffers = await Promise.all(urls.map((url) => loadEffect(context, url)));
            banks.set(sound, { buffers, playing: new Set(), next: 0 });
          } catch (error) {
            console.warn(`無法載入音效 ${sound}。`, error);
          }
        }),
      );
      await Promise.all([running, loading]);
      ready = true;
      play(pending.splice(0));
    },
    play,
    reset(): void {
      pending.length = 0;
      for (const bank of banks.values()) {
        for (const source of bank.playing) source.stop();
        bank.playing.clear();
        bank.next = 0;
      }
      const now = context.currentTime;
      duckUntil = 0;
      buses.ducking.gain.cancelScheduledValues(now);
      buses.ducking.gain.setValueAtTime(1, now);
    },
  };
}
