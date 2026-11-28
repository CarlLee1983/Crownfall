import warHornsUrl from './clips/war-horns.opus?url';
import type { EffectCommand, SoundCommand } from './director';
import { connectMusic } from './music';
import { type AudioSettings, DEFAULT_AUDIO_SETTINGS } from './settings';

const DUCK_GAIN = 10 ** (-12 / 20);

async function loadHorn(context: AudioContext): Promise<AudioBuffer> {
  const response = await fetch(warHornsUrl);
  if (!response.ok) throw new Error(`War Horns download failed (${response.status})`);
  return context.decodeAudioData(await response.arrayBuffer());
}

function connectMixer(context: AudioContext, initialVolumes: AudioSettings) {
  const master = context.createGain();
  const music = context.createGain();
  const ducking = context.createGain();
  const effects = context.createGain();
  const ui = context.createGain();
  master.connect(context.destination);
  music.connect(ducking).connect(master);
  effects.connect(master);
  ui.gain.value = 0.7;
  ui.connect(master);

  const nowPlaying = connectMusic(context, music);

  function setVolumes(volumes: AudioSettings): void {
    master.gain.value = volumes.muted ? 0 : 1;
    music.gain.value = volumes.music;
    effects.gain.value = volumes.effects;
  }
  setVolumes(initialVolumes);

  let hornLoad: Promise<AudioBuffer> | undefined;
  let horn: AudioBuffer | undefined;
  const pending: EffectCommand[] = [];
  const playing = new Set<AudioBufferSourceNode>();
  let duckUntil = 0;

  function playEffects(commands: readonly EffectCommand[]): void {
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
      const hornReady = Promise.all([running, hornLoad]).then(([, buffer]) => {
        horn = buffer;
        playEffects(pending.splice(0));
      });
      await Promise.all([hornReady, nowPlaying.unlock(running)]);
    },
    play(commands: readonly SoundCommand[]): void {
      for (const command of commands) {
        if (command.kind === 'effect') playEffects([command]);
        else if (command.kind === 'music') nowPlaying.select(command.track);
        else nowPlaying.stop();
      }
    },
    setPaused: nowPlaying.setPaused,
    setVolumes,
    reset(): void {
      nowPlaying.stop();
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
  let volumes = DEFAULT_AUDIO_SETTINGS;

  return {
    async unlock(): Promise<void> {
      try {
        // Construction and resume both happen synchronously inside the Start Game gesture.
        mixer ??= connectMixer(new AudioContext(), volumes);
        await mixer.unlock();
      } catch (error) {
        console.warn('音訊無法啟用。', error);
      }
    },
    setVolumes(settings: AudioSettings): void {
      volumes = settings;
      mixer?.setVolumes(settings);
    },
    play(commands: readonly SoundCommand[]): void {
      if (commands.length > 0) mixer?.play(commands);
    },
    setPaused(paused: boolean): void {
      mixer?.setPaused(paused);
    },
    reset(): void {
      mixer?.reset();
    },
  };
}
