type Bus = 'master' | 'music' | 'effects' | 'ui';
type EffectBus = 'effects' | 'ui';

interface Mixer {
  context: AudioContext;
  buses: Record<Bus, GainNode>;
  duck: GainNode;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface MusicVoice extends Voice {
  startedAt: number;
  fadeIn: boolean;
}

interface MusicRequest {
  url: string;
  nearEnd: boolean;
}

interface EffectRequest {
  bus: EffectBus;
  duck: boolean;
  voice?: Voice;
}

const crossfade = 2;
const seamLeadTime = 4;
const maxVoicesPerEffect = 4;

function decibelsToGain(db: number): number {
  return 10 ** (db / 20);
}

function disconnect({ source, gain }: Voice): void {
  source.disconnect();
  gain.disconnect();
}

function stop(voice: Voice): void {
  voice.source.onended = null;
  voice.source.stop();
  disconnect(voice);
}

export class Player {
  private mixer?: Mixer;
  private readonly gains: Record<Bus, number> = { master: 1, music: 1, effects: 1, ui: 1 };
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private readonly reportedFailures = new Set<string>();
  private readonly musicVoices = new Set<MusicVoice>();
  private readonly effects = new Map<string, EffectRequest[]>();
  private musicRequest: MusicRequest | null = null;
  private currentMusic: MusicVoice | null = null;
  private paused = false;
  private ducked = false;
  private duckDb = 12;

  constructor(private readonly reportError: (message: string) => void) {}

  async unlock(): Promise<void> {
    if (!this.mixer) {
      const context = new AudioContext();
      const master = context.createGain();
      const music = context.createGain();
      const effects = context.createGain();
      const ui = context.createGain();
      const duck = context.createGain();

      music.connect(duck).connect(master);
      effects.connect(master);
      ui.connect(master);
      master.connect(context.destination);
      this.mixer = { context, buses: { master, music, effects, ui }, duck };
      this.volume('master', this.gains.master);
      this.volume('music', this.gains.music);
      this.volume('effects', this.gains.effects);
      this.volume('ui', this.gains.ui);
    }

    await this.mixer.context.resume();
  }

  music(url: string | null, nearEnd = false): void {
    const mixer = this.mixer;
    if (!mixer) return;
    if (!url) {
      this.musicRequest = null;
      this.fadeOutMusic(mixer.context.currentTime);
      return;
    }
    if (!nearEnd && this.musicRequest?.url === url && !this.musicRequest.nearEnd) return;

    const request = { url, nearEnd };
    this.musicRequest = request;
    this.load(mixer.context, url)
      .then((buffer) => {
        if (this.musicRequest !== request) return;
        const { context, buses } = mixer;
        const now = context.currentTime;
        const fadeIn = this.musicVoices.size > 0;
        this.fadeOutMusic(now);

        const source = context.createBufferSource();
        const gain = context.createGain();
        const voice = { source, gain, startedAt: now, fadeIn };
        source.buffer = buffer;
        source.loop = true;
        gain.gain.setValueAtTime(fadeIn ? 0 : 1, now);
        if (fadeIn) gain.gain.linearRampToValueAtTime(1, now + crossfade);
        source.connect(gain).connect(buses.music);
        source.onended = () => {
          this.musicVoices.delete(voice);
          disconnect(voice);
        };
        const offset = nearEnd ? Math.max(0, buffer.duration - seamLeadTime) : 0;
        source.start(now, offset);
        this.musicVoices.add(voice);
        this.currentMusic = voice;
      })
      .catch((error: unknown) => {
        if (this.musicRequest !== request) return;
        this.stopMusic();
        this.reportFailure(url, error);
      });
  }

  effect(key: string, url: string, bus: EffectBus, duck: boolean, semitones = 0): void {
    const mixer = this.mixer;
    if (!mixer) return;

    const requests = this.effects.get(key) ?? [];
    const request: EffectRequest = { bus, duck };
    requests.push(request);
    this.effects.set(key, requests);
    const oldest = requests[0];
    if (oldest && requests.length > maxVoicesPerEffect) {
      this.finishEffect(key, oldest);
      if (oldest.voice) stop(oldest.voice);
    }

    this.load(mixer.context, url)
      .then((buffer) => {
        if (!this.effects.get(key)?.includes(request)) return;
        const { context, buses } = mixer;
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        source.playbackRate.value = 2 ** ((semitones + Math.random() * 2 - 1) / 12);
        gain.gain.value = decibelsToGain(Math.random() * 4 - 2);
        source.connect(gain).connect(buses[bus]);
        const voice = { source, gain };
        source.onended = () => {
          this.finishEffect(key, request);
          disconnect(voice);
        };
        source.start();
        request.voice = voice;
        this.updateDuck();
      })
      .catch((error: unknown) => {
        if (!this.effects.get(key)?.includes(request)) return;
        this.finishEffect(key, request);
        this.reportFailure(url, error);
      });
  }

  volume(bus: Bus, linear: number): void {
    this.gains[bus] = Math.max(0, linear);
    const mixer = this.mixer;
    if (!mixer) return;
    const gain = this.gains[bus] * (bus === 'music' && this.paused ? 0.5 : 1);
    mixer.buses[bus].gain.setTargetAtTime(gain, mixer.context.currentTime, 0.015);
    if (bus === 'effects' || bus === 'ui') this.updateDuck(true);
  }

  duckDepth(db: number): void {
    this.duckDb = Math.max(0, db);
    if (this.ducked) this.applyDuck();
  }

  pause(paused: boolean): void {
    this.paused = paused;
    this.volume('music', this.gains.music);
  }

  stopEffects(): void {
    for (const requests of this.effects.values()) {
      for (const request of requests) {
        if (request.voice) stop(request.voice);
      }
    }
    this.effects.clear();
    this.updateDuck();
  }

  reset(): void {
    this.stopMusic();
    this.stopEffects();
    this.reportedFailures.clear();
  }

  private stopMusic(): void {
    this.musicRequest = null;
    this.currentMusic = null;
    for (const voice of this.musicVoices) stop(voice);
    this.musicVoices.clear();
  }

  private fadeOutMusic(now: number): void {
    const voice = this.currentMusic;
    if (!voice) return;
    this.currentMusic = null;
    const level = voice.fadeIn ? Math.min(1, (now - voice.startedAt) / crossfade) : 1;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(level, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + crossfade);
    voice.source.stop(now + crossfade);
  }

  private finishEffect(key: string, request: EffectRequest): void {
    const requests = this.effects.get(key);
    const index = requests?.indexOf(request) ?? -1;
    if (!requests || index < 0) return;
    requests.splice(index, 1);
    if (!requests.length) this.effects.delete(key);
    if (request.duck && request.voice) this.updateDuck();
  }

  private updateDuck(busChanged = false): void {
    const ducked = [...this.effects.values()].some((requests) =>
      requests.some((request) => request.duck && request.voice && this.gains[request.bus] > 0),
    );
    if (ducked === this.ducked) return;
    this.ducked = ducked;
    this.applyDuck(busChanged);
  }

  private applyDuck(busChanged = false): void {
    const mixer = this.mixer;
    if (!mixer) return;
    const target = this.ducked ? decibelsToGain(-this.duckDb) : 1;
    const timeConstant = this.ducked || busChanged ? 0.01 : 0.12;
    mixer.duck.gain.setTargetAtTime(target, mixer.context.currentTime, timeConstant);
  }

  private load(context: AudioContext, url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) return cached;
    const buffer = fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        this.reportedFailures.delete(url);
        return decoded;
      })
      .catch((error: unknown) => {
        this.buffers.delete(url);
        throw error;
      });
    this.buffers.set(url, buffer);
    return buffer;
  }

  private reportFailure(url: string, error: unknown): void {
    if (this.reportedFailures.has(url)) return;
    this.reportedFailures.add(url);
    const detail = error instanceof Error && error.message ? `（${error.message}）` : '';
    this.reportError(`無法載入音訊 ${url}${detail}`);
  }
}
