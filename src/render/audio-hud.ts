import { type AudioSettings, readAudioSettings, writeAudioSettings } from '../audio/settings';
import { element } from './hud-dom';

export function connectAudioHud(setVolumes: (settings: AudioSettings) => void): void {
  const controls = element('game-audio');
  const mute = element('mute-audio');
  const music = element('music-volume');
  const effects = element('effects-volume');
  if (!(music instanceof HTMLInputElement) || !(effects instanceof HTMLInputElement)) {
    throw new Error('音量滑桿的 HTML 元素類型錯誤');
  }

  let settings = readAudioSettings();
  setVolumes(settings);
  mute.setAttribute('aria-pressed', String(settings.muted));
  music.value = String(Math.round(settings.music * 100));
  effects.value = String(Math.round(settings.effects * 100));

  function update(next: AudioSettings): void {
    settings = next;
    setVolumes(settings);
    writeAudioSettings(settings);
  }

  mute.addEventListener('click', () => {
    update({ ...settings, muted: !settings.muted });
    mute.setAttribute('aria-pressed', String(settings.muted));
  });
  music.addEventListener('input', () => update({ ...settings, music: music.valueAsNumber / 100 }));
  effects.addEventListener('input', () =>
    update({ ...settings, effects: effects.valueAsNumber / 100 }),
  );

  // Volume controls leave the current build selection in place.
  controls.addEventListener('click', (event) => event.stopPropagation());
  // Keep game shortcuts from overriding native button and slider keys.
  controls.addEventListener('keydown', (event) => event.stopPropagation());
}
