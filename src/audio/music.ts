import waveUrl from './clips/ancient-evil-awakens.opus?url';
import lichUrl from './clips/apocalypse.opus?url';
import preparationUrl from './clips/catacombs.opus?url';
import defeatUrl from './clips/the-sad-battle.opus?url';
import type { MusicTrack } from './music-director';

const trackUrls = [
  ['preparation', preparationUrl],
  ['wave', waveUrl],
  ['lich', lichUrl],
  ['defeat', defeatUrl],
] as const satisfies readonly (readonly [MusicTrack, string])[];

const transitionSeconds = 2;
const loopOverlapSeconds = 0.25;

interface TrackBuffer {
  readonly buffer: AudioBuffer;
  readonly loopEnd?: number;
}

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly startedAt: number;
  readonly fullGainAt: number;
}

function crossfadeLoop(buffer: AudioBuffer): number {
  const overlapFrames = Math.round(loopOverlapSeconds * buffer.sampleRate);
  const loopEndFrame = buffer.length - overlapFrames;

  // Fold the tail into the opening so the audio clock can loop without a timer.
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let frame = 0; frame < overlapFrames; frame++) {
      const headGain = frame / (overlapFrames - 1);
      samples[frame] =
        (samples[loopEndFrame + frame] ?? 0) * (1 - headGain) + (samples[frame] ?? 0) * headGain;
    }
  }
  return loopEndFrame / buffer.sampleRate;
}

export function connectMusic(context: AudioContext, output: AudioNode) {
  const pauseGain = context.createGain();
  pauseGain.connect(output);

  const tracks = new Map<MusicTrack, TrackBuffer>();
  const loads = new Map<MusicTrack, Promise<void>>();
  const voices = new Set<Voice>();
  let requestedTrack: MusicTrack | undefined;
  let current: Voice | undefined;
  let fadeEnd = 0;

  function syncTrack(): void {
    if (context.state !== 'running' || requestedTrack === undefined || current !== undefined)
      return;
    const track = tracks.get(requestedTrack);
    if (track === undefined) return;

    const now = context.currentTime;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const fadeIn = now < fadeEnd;
    const voice: Voice = {
      source,
      gain,
      startedAt: now,
      fullGainAt: fadeIn ? fadeEnd : now,
    };
    source.buffer = track.buffer;
    if (track.loopEnd !== undefined) {
      source.loop = true;
      source.loopEnd = track.loopEnd;
    }
    source.connect(gain).connect(pauseGain);
    gain.gain.setValueAtTime(fadeIn ? 0 : 1, now);
    if (fadeIn) gain.gain.linearRampToValueAtTime(1, fadeEnd);
    source.onended = () => {
      voices.delete(voice);
      source.disconnect();
      gain.disconnect();
    };
    voices.add(voice);
    current = voice;
    source.start(now);
  }

  async function load(track: MusicTrack, url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Music download failed for ${track} (${response.status})`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    tracks.set(track, track === 'defeat' ? { buffer } : { buffer, loopEnd: crossfadeLoop(buffer) });
    syncTrack();
  }

  return {
    async unlock(running: Promise<void>): Promise<void> {
      const pending = trackUrls.map(([track, url]) => {
        const existing = loads.get(track);
        if (existing !== undefined) return existing;
        const loading = load(track, url).catch((error: unknown) => {
          loads.delete(track);
          throw error;
        });
        loads.set(track, loading);
        return loading;
      });

      await Promise.all([running.then(syncTrack), ...pending]);
    },
    select(track: MusicTrack): void {
      if (track === requestedTrack) return;
      requestedTrack = track;
      if (current !== undefined) {
        const { gain, source, startedAt, fullGainAt } = current;
        const now = context.currentTime;
        const level = now >= fullGainAt ? 1 : (now - startedAt) / (fullGainAt - startedAt);
        fadeEnd = now + transitionSeconds;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(level, now);
        gain.gain.linearRampToValueAtTime(0, fadeEnd);
        source.stop(fadeEnd);
        current = undefined;
      }
      syncTrack();
    },
    stop(): void {
      requestedTrack = undefined;
      current = undefined;
      fadeEnd = 0;
      for (const { source } of voices) source.stop();
      voices.clear();
    },
    setPaused(paused: boolean): void {
      pauseGain.gain.setValueAtTime(paused ? 0.5 : 1, context.currentTime);
    },
  };
}
