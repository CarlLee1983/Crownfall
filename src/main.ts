import { DirectionalLight, FogExp2, HemisphereLight, Scene, Vector3, WebGLRenderer } from 'three';
import { content } from './content/content';
import { torchPositions } from './content/decor';
import { level } from './content/level';
import { createGame } from './core';
import {
  createDemoState,
  demoRangePreview,
  mountHitDemo,
  readHitVariant,
} from './prototype/hit-demo';
import { createHitEffects } from './prototype/hit-effects';
import { createBuildHud } from './render/build-hud';
import { createBuildLayer } from './render/build-layer';
import { createCamera } from './render/camera';
import { connectCameraControls } from './render/camera-controls';
import { createCombatFeedback } from './render/combat-feedback';
import { createCombatHud } from './render/combat-hud';
import { createEnemyLayer } from './render/enemies';
import { element } from './render/hud-dom';
import { startLoop } from './render/loop';
import { type LoadedModels, loadModels } from './render/models';
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
const loading = element('model-loading');
const error = element('model-error');
const hitVariant = import.meta.env.DEV ? readHitVariant(window.location.search) : undefined;
help.addEventListener('cancel', (event) => {
  if (start.disabled) event.preventDefault();
});
help.showModal();

loadModels().then(
  (models) => {
    startGame(models);
    loading.hidden = true;
    start.disabled = false;
    if (hitVariant === undefined) start.focus();
    else help.close();
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
  const torches = createTorches(level, torchPositions, models.scenery.torch);
  const cameraView = createCamera(level);
  const { camera, resize } = cameraView;
  connectCameraControls(canvas, cameraView);
  const enemies = createEnemyLayer(camera, models.enemies);
  const builds = createBuildLayer(models.towers);
  const shots = createShotLayer(enemies, builds.towerHeight);
  const combat = createCombatFeedback(enemies);
  const effects =
    hitVariant === undefined ? undefined : createHitEffects(enemies, builds.towerHeight);
  const getVariant = () => readHitVariant(window.location.search) ?? hitVariant ?? 'A';
  if (effects !== undefined) {
    document.addEventListener('pointerdown', effects.unlockAudio, { once: true });
    document.addEventListener('keydown', effects.unlockAudio, { once: true });
  }
  const combatHud = createCombatHud(canvas, camera);
  const allowShake = window.matchMedia('(prefers-reduced-motion: no-preference)');
  const cameraPosition = new Vector3();

  const scene = new Scene();
  scene.fog = new FogExp2(0x10180f, 0.022);
  const sun = new DirectionalLight(0x9fb4ff, 0.8);
  sun.position.set(-6, 14, 4);
  scene.add(
    new HemisphereLight(0xcfe3ff, 0x40382a, 0.75),
    sun,
    terrain.group,
    torches.group,
    enemies.group,
    builds.group,
    shots.group,
    combat.group,
  );
  if (effects !== undefined) scene.add(effects.group);

  const pixelRenderer = createPixelRenderer(renderer, scene, camera);

  const onResize = (): void => {
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    pixelRenderer.resize(window.innerWidth, window.innerHeight);
    resize(Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight));
  };
  window.addEventListener('resize', onResize);
  onResize();

  const newGame = () => (hitVariant === undefined ? createGame(content, level) : createDemoState());
  const initial = newGame();
  const restart = () => {
    hud?.reset();
    shots.reset();
    enemies.reset();
    combat.reset();
    combatHud.reset();
    effects?.reset();
    loop.reset(newGame());
  };
  const hud =
    hitVariant === undefined
      ? createBuildHud(
          canvas,
          camera,
          initial,
          {
            placeTower: (cell, kind) =>
              loop.enqueue((tick) => ({ type: 'placeTower', cell, kind, tick })),
            manageTower: (cell, type) => loop.enqueue((tick) => ({ type, cell, tick })),
          },
          builds.towerStructure,
        )
      : undefined;
  const waveHud =
    hitVariant === undefined
      ? createWaveHud(canvas, camera, {
          startWave: () => loop.enqueue((tick) => ({ type: 'startWave', tick })),
          continueEndless: () => loop.enqueue((tick) => ({ type: 'continueEndless', tick })),
          setSpeed: (speed) => loop.setSpeed(speed),
          restart,
        })
      : undefined;
  const demo =
    hitVariant === undefined
      ? undefined
      : mountHitDemo(hitVariant, { replay: restart, setSpeed: (speed) => loop.setSpeed(speed) });
  const loop = startLoop({
    initial,
    onEvents: (events, previous, current, time) => {
      hud?.onEvents(events);
      waveHud?.onEvents(events, time.wallMs);
      demo?.onEvents(events);
      if (effects === undefined) {
        shots.onEvents(events, current, time.gameMs);
        combat.onEvents(events, previous, time.gameMs);
      } else {
        effects.onEvents(events, previous, current, time.gameMs, getVariant());
      }
      enemies.observe(current);
    },
    draw: (previous, current, alpha, time) => {
      const reducedMotion = !allowShake.matches;
      const prototypeFeedback = effects?.update(
        time.gameMs,
        time.wallMs,
        getVariant(),
        reducedMotion,
      );
      const feedback = prototypeFeedback ?? combat.update(time.gameMs, reducedMotion);
      terrain.setCastleFlash(feedback.castleFlash);
      const shaking = feedback.shake.lengthSq() > 0;
      if (shaking) {
        cameraPosition.copy(camera.position);
        camera.translateX(feedback.shake.x);
        camera.translateY(feedback.shake.y);
        camera.updateMatrixWorld();
      }
      enemies.update(
        previous,
        current,
        alpha,
        feedback.hitFlash,
        time.gameMs,
        prototypeFeedback?.reaction,
      );
      const preview =
        import.meta.env.DEV && demo ? demoRangePreview(current) : hud?.update(current);
      builds.update(previous, current, alpha, preview, enemies.routeMotions());
      waveHud?.update(current, time.wallMs);
      demo?.update(current, prototypeFeedback?.presentedKills ?? 0);
      if (effects === undefined) shots.update(time.gameMs);
      combatHud.update(feedback);
      torches.update(time.gameMs / 1000);
      pixelRenderer.render();
      if (shaking) {
        camera.position.copy(cameraPosition);
        camera.updateMatrixWorld();
      }
    },
  });
}
