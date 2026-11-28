import warHornsUrl from './clips/war-horns.opus?url';
import type { SoundCommand } from './director';

const DUCK_GAIN = 10 ** (-12 / 20);

async function loadHorn(context: AudioContext): Promise<AudioBuffer> {
  const response = await fetch(warHornsUrl);
  if (!response.ok) throw new Error(`War Horns download failed (${response.status})`);
  return context.decodeAudioData(await response.arrayBuffer());
}

function connectMixer(context: AudioContext) {
  const master = context.createGain();
  const music = context.createGain();
  const ducking = context.createGain();
  const effects = context.createGain();
  const ui = context.createGain();
  master.connect(context.destination);
  music.gain.value = 0.6;
  music.connect(ducking).connect(master);
  effects.connect(master);
  ui.gain.value = 0.7;
  ui.connect(master);

  let hornLoad: Promise<AudioBuffer> | undefined;
  let horn: AudioBuffer | undefined;
  const pending: SoundCommand[] = [];
  const playing = new Set<AudioBufferSourceNode>();
  let duckUntil = 0;

  function play(commands: readonly SoundCommand[]): void {
    if (horn === undefined || context.state !== 'running') {
      if (hornLoad !== undefined) pending.push(...commands);
      return;
    }
    for (const command of commands) {
      const source = context.createBufferSource();
      source.buffer = horn;
      const rate = 2 ** (command.pitchSemitones / 12);
      source.playbackRate.value = rate;
      source.connect(command.bus === 'effects' ? effects : ui);
      source.onended = () => {
        playing.delete(source);
        source.disconnect();
      };

      const now = context.currentTime;
      source.start(now);
      playing.add(source);
      if (command.duck) {
        duckUntil = Math.max(duckUntil, now + horn.duration / rate);
        ducking.gain.cancelScheduledValues(now);
        ducking.gain.setTargetAtTime(DUCK_GAIN, now, 0.015);
        ducking.gain.setTargetAtTime(1, duckUntil, 0.1);
      }
    }
  }

  return {
    async unlock(): Promise<void> {
      const running = context.resume();
      hornLoad ??= loadHorn(context).catch((error: unknown) => {
        hornLoad = undefined;
        pending.length = 0;
        throw error;
      });
      const [, buffer] = await Promise.all([running, hornLoad]);
      horn = buffer;
      play(pending.splice(0));
    },
    play,
    reset(): void {
      pending.length = 0;
      for (const source of playing) source.stop();
      playing.clear();
      const now = context.currentTime;
      duckUntil = 0;
      ducking.gain.cancelScheduledValues(now);
      ducking.gain.setValueAtTime(1, now);
    },
  };
}

export function createMixer() {
  let mixer: ReturnType<typeof connectMixer> | undefined;

  return {
    async unlock(): Promise<void> {
      try {
        // Construction and resume both happen synchronously inside the Start Game gesture.
        mixer ??= connectMixer(new AudioContext());
        await mixer.unlock();
      } catch (error) {
        console.warn('音訊無法啟用。', error);
      }
    },
    play(commands: readonly SoundCommand[]): void {
      if (commands.length > 0) mixer?.play(commands);
    },
    reset(): void {
      mixer?.reset();
    },
  };
}
