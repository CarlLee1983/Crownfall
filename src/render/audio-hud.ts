import { type AudioSettings, readAudioSettings, writeAudioSettings } from '../audio/settings';
import { element } from './hud-dom';

export function connectAudioHud(setVolumes: (settings: AudioSettings) => void) {
  const controls = element('game-audio');
  const hudSlot = element('game-audio-slot');
  const help = element('game-help');
  const result = element('game-result');
  const board = element('game');
  const levelPanel = element('audio-levels');
  const levelTrigger = element('open-audio-levels');
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

  // Give the volume panel Escape before the build ring or game dialog can handle it.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || event.isComposing || !levelPanel.matches(':popover-open'))
        return;
      event.preventDefault();
      event.stopPropagation();
      levelPanel.hidePopover();
      levelTrigger.focus();
    },
    { capture: true },
  );

  function isBoardTarget(target: EventTarget | null): boolean {
    return (
      target === board ||
      (target instanceof Element && target.closest('[data-board-cell]') !== null)
    );
  }

  // Native light dismiss happens on pointerup, before the board receives click.
  let dismissesOnBoard = false;
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      dismissesOnBoard = levelPanel.matches(':popover-open') && isBoardTarget(event.target);
      if (dismissesOnBoard) event.stopPropagation();
    },
    { capture: true },
  );
  document.addEventListener(
    'click',
    (event) => {
      if (!dismissesOnBoard || event.detail === 0) return;
      dismissesOnBoard = false;
      if (isBoardTarget(event.target)) event.stopPropagation();
    },
    { capture: true },
  );

  function setDialog(dialog: HTMLDialogElement | null): void {
    if (levelPanel.matches(':popover-open')) levelPanel.hidePopover();
    if (dialog === null) hudSlot.append(controls);
    else dialog.append(controls);
  }

  for (const dialog of [help, result]) {
    dialog.addEventListener('close', () => {
      if (dialog.contains(controls)) setDialog(null);
    });
  }
  return { setDialog };
}
