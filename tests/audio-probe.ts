import type { Page } from '@playwright/test';

export async function installAudioProbe(page: Page) {
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [];
    const scheduled: AudioBuffer[] = [];
    const stops: { path: string; at: number; requestedAt: number }[] = [];
    const bufferPaths = new WeakMap<AudioBuffer, string>();
    const decoded: { path: string; duration: number }[] = [];
    // Identify the asset whose original response bytes reach the native decoder.
    const responsePaths = new WeakMap<ArrayBuffer, string>();
    const arrayBuffer = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function () {
      const bytes = await arrayBuffer.call(this);
      if (this.url !== '') responsePaths.set(bytes, new URL(this.url).pathname);
      return bytes;
    };
    const gainValues: number[][] = [];
    const fadeDurations: number[] = [];
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        contexts.push(this);
      }

      override async decodeAudioData(
        ...args: Parameters<AudioContext['decodeAudioData']>
      ): Promise<AudioBuffer> {
        const buffer = await super.decodeAudioData(...args);
        const path = responsePaths.get(args[0]);
        if (path !== undefined) {
          decoded.push({ path, duration: buffer.duration });
          bufferPaths.set(buffer, path);
        }
        return buffer;
      }

      override createGain(): GainNode {
        const node = super.createGain();
        const values: number[] = [];
        let setAt = Number.NaN;
        gainValues.push(values);
        const set = node.gain.setValueAtTime.bind(node.gain);
        const ramp = node.gain.linearRampToValueAtTime.bind(node.gain);
        node.gain.setValueAtTime = (value, at) => {
          setAt = at;
          values.push(value);
          return set(value, at);
        };
        node.gain.linearRampToValueAtTime = (value, at) => {
          fadeDurations.push(at - setAt);
          return ramp(value, at);
        };
        return node;
      }

      override createBufferSource(): AudioBufferSourceNode {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (...args) => {
          start(...args);
          if (source.buffer !== null) scheduled.push(source.buffer);
        };
        const stop = source.stop.bind(source);
        source.stop = (...args) => {
          stop(...args);
          const path = source.buffer === null ? undefined : bufferPaths.get(source.buffer);
          if (path !== undefined) {
            stops.push({ path, at: args[0] ?? this.currentTime, requestedAt: this.currentTime });
          }
        };
        return source;
      }
    };
    Object.defineProperty(window, 'audioProbe', {
      value: () => ({
        contexts: contexts.map((context) => context.state),
        scheduled: scheduled.map((buffer) => buffer.duration),
        scheduledPaths: scheduled.map((buffer) => bufferPaths.get(buffer) ?? ''),
        currentTime: contexts[0]?.currentTime ?? 0,
        stops,
        decoded,
        gainValues,
        fadeDurations,
      }),
    });
  });

  return () =>
    page.evaluate(() => {
      const probe = window as Window & {
        audioProbe?(): {
          contexts: AudioContextState[];
          scheduled: number[];
          scheduledPaths: string[];
          currentTime: number;
          stops: { path: string; at: number; requestedAt: number }[];
          decoded: { path: string; duration: number }[];
          gainValues: number[][];
          fadeDurations: number[];
        };
      };
      if (probe.audioProbe === undefined) throw new Error('Audio probe did not initialize');
      return probe.audioProbe();
    });
}
