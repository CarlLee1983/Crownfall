import { WebGLRenderer } from 'three';
import {
  directCommandSound,
  directImpact,
  directInitialSound,
  directSound,
} from './audio/director';
import { createMixer } from './audio/mixer';
import { content } from './content/content';
import { level } from './content/level';
import { createGame } from './core';
import { connectAudioHud } from './render/audio-hud';
import { createBattlefield } from './render/battlefield';
import { createBuildHud } from './render/build-hud';
import { connectCameraControls } from './render/camera-controls';
import { createCombatHud } from './render/combat-hud';
import { element } from './render/hud-dom';
import { startLoop } from './render/loop';
import { type LoadedModels, loadModels } from './render/models';
import { createPixelRenderer } from './render/pixel-renderer';
import { createWaveHud } from './render/wave-hud';
import './render/hud.css';

const help = element('game-help');
const start = element('start-game');
if (!(help instanceof HTMLDialogElement) || !(start instanceof HTMLButtonElement)) {
  throw new Error('開始遊戲的 HTML 元素類型錯誤');
}
const audio = createMixer();
const audioHud = connectAudioHud(audio.setVolumes);

const loading = element('model-loading');
const error = element('model-error');
help.addEventListener('cancel', (event) => {
  if (start.disabled) event.preventDefault();
});
audioHud.setDialog(help);
help.showModal();
const loadingFocus = document.activeElement;

loadModels().then(
  (models) => {
    startGame(models);
    loading.hidden = true;
    start.disabled = false;
    if (document.activeElement === loadingFocus) start.focus();
  },
  () => {
    loading.hidden = true;
    error.textContent = '3D 模型載入失敗。請重新整理頁面再試一次。';
  },
);

function startGame(models: LoadedModels): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('找不到 #game 畫布');

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0x0a0d0a);

  const battlefield = createBattlefield(models, (impact) => audio.play(directImpact(impact)));
  const { scene, cameraView } = battlefield;
  const { camera, resize } = cameraView;
  connectCameraControls(canvas, cameraView);
  const combatHud = createCombatHud(canvas, camera);
  const allowShake = window.matchMedia('(prefers-reduced-motion: no-preference)');

  const pixelRenderer = createPixelRenderer(renderer, scene, camera);

  const onResize = (): void => {
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    pixelRenderer.resize(window.innerWidth, window.innerHeight);
    resize(Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight));
  };
  window.addEventListener('resize', onResize);
  onResize();

  const initial = createGame(content, level);
  start.addEventListener('click', () => {
    void audio.unlock();
    audio.play(directInitialSound(initial));
  });
  const hud = createBuildHud(
    canvas,
    camera,
    initial,
    {
      placeTower: (cell, kind) =>
        loop.enqueue((tick) => ({ type: 'placeTower', cell, kind, tick })),
      manageTower: (cell, type) => loop.enqueue((tick) => ({ type, cell, tick })),
      frameOverview: cameraView.frameOverview,
    },
    battlefield.towerStructure,
  );
  const waveHud = createWaveHud(canvas, camera, {
    startWave: () => loop.enqueue((tick) => ({ type: 'startWave', tick })),
    continueEndless: () => loop.enqueue((tick) => ({ type: 'continueEndless', tick })),
    setSpeed: (speed) => {
      loop.setSpeed(speed);
      audio.setPaused(speed === 0);
    },
    setAudioDialog: audioHud.setDialog,
    restart: () => {
      hud.reset();
      battlefield.reset();
      combatHud.reset();
      audio.reset();
      const restarted = createGame(content, level);
      loop.reset(restarted);
      audio.play(directInitialSound(restarted));
    },
  });
  const loop = startLoop({
    initial,
    onEvents: (events, previous, current, time, commands) => {
      for (const { command, events: commandEvents } of commands) {
        const cue = directCommandSound(command, commandEvents);
        if (cue !== undefined) audio.play([cue]);
      }
      hud.onEvents(events);
      waveHud.onEvents(events, time.wallMs);
      audio.play(directSound(events, previous, current));
      battlefield.onEvents(events, previous, current, time.gameMs);
    },
    draw: (previous, current, alpha, time) => {
      battlefield.draw(previous, current, alpha, time.gameMs, {
        allowShake: allowShake.matches,
        preview: () => hud.update(current),
        present: (feedback, resultReady) => {
          waveHud.update(current, time.wallMs, resultReady);
          combatHud.update(feedback);
          pixelRenderer.render();
        },
      });
    },
  });
}
