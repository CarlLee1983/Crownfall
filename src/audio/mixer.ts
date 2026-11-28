import type { SoundCommand } from './director';
import { connectEffects } from './effects';
import { connectMusic } from './music';
import { type AudioSettings, DEFAULT_AUDIO_SETTINGS } from './settings';

function connectMixer(context: AudioContext, initialVolumes: AudioSettings) {
  const master = context.createGain();
  const music = context.createGain();
  const ducking = context.createGain();
  const effects = context.createGain();
  const ui = context.createGain();
  const limiter = context.createDynamicsCompressor();
  // Leave headroom when many randomized voices overlap on the same frame.
  limiter.threshold.value = -12;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0;
  limiter.release.value = 0.08;
  master.connect(limiter).connect(context.destination);
  music.connect(ducking).connect(master);
  effects.connect(master);
  ui.gain.value = 0.7;
  ui.connect(master);

  function setVolumes(volumes: AudioSettings): void {
    master.gain.value = volumes.muted ? 0 : 1;
    music.gain.value = volumes.music;
    effects.gain.value = volumes.effects;
  }
  setVolumes(initialVolumes);

  const sound = connectEffects(context, { effects, ui, ducking });
  const nowPlaying = connectMusic(context, music);

  return {
    async unlock(): Promise<void> {
      const running = context.resume();
      await Promise.all([sound.unlock(running), nowPlaying.unlock(running)]);
    },
    play(commands: readonly SoundCommand[]): void {
      for (const command of commands) {
        if (command.kind === 'effect') sound.play([command]);
        else if (command.kind === 'music') nowPlaying.select(command.track);
        else nowPlaying.stop();
      }
    },
    setPaused: nowPlaying.setPaused,
    setVolumes,
    reset(): void {
      nowPlaying.stop();
      sound.reset();
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
