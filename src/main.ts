import { DirectionalLight, FogExp2, HemisphereLight, Scene, Vector3, WebGLRenderer } from 'three';
import {
  directCommandSound,
  directImpact,
  directInitialSound,
  directSound,
} from './audio/director';
import { createMixer } from './audio/mixer';
import { content } from './content/content';
import { torchPositions } from './content/decor';
import { level } from './content/level';
import { createGame } from './core';
import { connectAudioHud } from './render/audio-hud';
import { createBuildHud } from './render/build-hud';
import { createBuildLayer } from './render/build-layer';
import { createCamera } from './render/camera';
import { connectCameraControls } from './render/camera-controls';
import { createCombatFeedback } from './render/combat-feedback';
import { createCombatHud } from './render/combat-hud';
import { createEnemyLayer } from './render/enemies';
import { element } from './render/hud-dom';
import { type LoopSession, startLoop } from './render/loop';
import { type LoadedModels, loadModels } from './render/models';
import { createDecor, DECOR_VARIANT } from './render/prototype-decor';
import { createPixelRenderer } from './render/pixel-renderer';
import { createShotLayer } from './render/shots';
import { createTerrain } from './render/terrain';
import { createTorches } from './render/torches';
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

  const terrain = createTerrain(level, models.scenery);
  const decor = createDecor(level, models.decor, DECOR_VARIANT);
  const torches = createTorches(level, torchPositions, models.scenery.torch);
  const cameraView = createCamera(level);
  const { camera, resize } = cameraView;
  connectCameraControls(canvas, cameraView);
  const enemies = createEnemyLayer(camera, models.enemies);
  const builds = createBuildLayer(models.towers);
  const combat = createCombatFeedback(enemies);
  const shots = createShotLayer(enemies, builds.towerHeight, combat, {
    onImpact: (impact) => audio.play(directImpact(impact)),
  });
  const combatHud = createCombatHud(canvas, camera);
  const allowShake = window.matchMedia('(prefers-reduced-motion: no-preference)');
  const cameraPosition = new Vector3();

  const scene = new Scene();
  scene.fog = new FogExp2(0x10180f, 0.012);
  const sun = new DirectionalLight(0xb4c4ff, 3.0);
  sun.position.set(-6, 14, 4);
  scene.add(
    new HemisphereLight(0xcfdcff, 0x2e2a22, 0.9),
    sun,
    terrain.group,
    decor.group,
    torches.group,
    enemies.group,
    builds.group,
    shots.group,
    combat.group,
  );

  const pixelRenderer = createPixelRenderer(renderer, scene, camera);

  const onResize = (): void => {
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    pixelRenderer.resize(window.innerWidth, window.innerHeight);
    resize(Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight));
  };
  window.addEventListener('resize', onResize);
  onResize();

  // PROTOTYPE #106: enough money to build every tower type.
  const initial = { ...createGame(content, level), money: 2000 };
  // PROTOTYPE #106: label + hooks for the capture scripts.
  const label = document.createElement('div');
  label.textContent = `DECOR ${DECOR_VARIANT.toUpperCase()}`;
  label.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:50;padding:2px 8px;font:bold 14px monospace;color:#fff;background:#000a;pointer-events:none';
  document.body.append(label);
  Object.assign(window, { renderer, decorStats: decor.stats, cameraView });
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
    builds.towerStructure,
  );
  Object.assign(window, { enqueue: (...a: Parameters<LoopSession['enqueue']>) => loop.enqueue(...a) });
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
      shots.reset();
      enemies.reset();
      combat.reset();
      combatHud.reset();
      audio.reset();
      const restarted = createGame(content, level);
      loop.reset(restarted);
      audio.play(directInitialSound(restarted));
    },
  });
  const loop: LoopSession = startLoop({
    initial,
    onEvents: (events, previous, current, time, commands) => {
      for (const { command, events: commandEvents } of commands) {
        const cue = directCommandSound(command, commandEvents);
        if (cue !== undefined) audio.play([cue]);
      }
      hud.onEvents(events);
      waveHud.onEvents(events, time.wallMs);
      audio.play(directSound(events, previous, current));
      const immediate = shots.onEvents(events, current, previous, time.gameMs);
      combat.onEvents(immediate, previous, time.gameMs);
      enemies.observe(current);
    },
    draw: (previous, current, alpha, time) => {
      shots.advanceFlights(time.gameMs, previous === current ? 1 : alpha);
      const feedback = combat.update(time.gameMs, !allowShake.matches);
      terrain.setCastleFlash(feedback.castleFlash);
      const shaking = feedback.shake.lengthSq() > 0;
      if (shaking) {
        cameraPosition.copy(camera.position);
        camera.translateX(feedback.shake.x);
        camera.translateY(feedback.shake.y);
        camera.updateMatrixWorld();
      }
      enemies.update(previous, current, alpha, feedback.hitFlash, time.gameMs, {
        hp: shots.displayHp,
        reaction: feedback.reaction,
      });
      builds.update(previous, current, alpha, hud.update(current), enemies.routeMotions());
      // A loss is caused by a leak, so only the castle pulse gates its dialog.
      const resultReady =
        current.phase === 'defeat'
          ? feedback.castleFlash === 0
          : !shots.hasFlights() && !feedback.settling;
      waveHud.update(current, time.wallMs, resultReady);
      shots.update(time.gameMs);
      combatHud.update(feedback);
      decor.update(current);
      torches.update(time.gameMs / 1000);
      pixelRenderer.render();
      if (shaking) {
        camera.position.copy(cameraPosition);
        camera.updateMatrixWorld();
      }
    },
  });
}
