export type AudioSettings = Readonly<{
  muted: boolean;
  music: number;
  effects: number;
}>;

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { muted: false, music: 0.6, effects: 1 };
const STORAGE_KEY = 'crownfall.audio';

function isVolume(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1;
}

export function readAudioSettings(storage?: Pick<Storage, 'getItem'>): AudioSettings {
  try {
    const saved = (storage ?? window.localStorage).getItem(STORAGE_KEY);
    if (saved === null) return DEFAULT_AUDIO_SETTINGS;

    const value: unknown = JSON.parse(saved);
    if (typeof value === 'object' && value !== null) {
      const { muted, music, effects } = value as Partial<AudioSettings>;
      if (typeof muted === 'boolean' && isVolume(music) && isVolume(effects)) {
        return { muted, music, effects };
      }
    }
  } catch {
    // Settings can be unavailable when the browser denies access to local storage.
  }
  return DEFAULT_AUDIO_SETTINGS;
}

export function writeAudioSettings(
  settings: AudioSettings,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The player's changes still apply for the current session.
  }
}
