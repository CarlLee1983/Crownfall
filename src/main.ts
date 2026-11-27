import { DirectionalLight, FogExp2, HemisphereLight, Scene, Vector3, WebGLRenderer } from 'three';
import { content } from './content/content';
import { torchPositions } from './content/decor';
import { level } from './content/level';
import { createGame } from './core';
import { createBuildHud } from './render/build-hud';
import { createBuildLayer } from './render/build-layer';
import { createCamera } from './render/camera';
import { connectCameraControls } from './render/camera-controls';
import { createCombatFeedback } from './render/combat-feedback';
import { createCombatHud } from './render/combat-hud';
import { createEnemyLayer } from './render/enemies';
import { startLoop } from './render/loop';
import { createPixelRenderer } from './render/pixel-renderer';
import { createShotLayer } from './render/shots';
import { createTerrain } from './render/terrain';
import { createTorches } from './render/torches';
import { createWaveHud } from './render/wave-hud';
import './render/hud.css';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('找不到 #game 畫布');

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x0a0d0a);

const terrain = createTerrain(level);
const torches = createTorches(level, torchPositions);
const cameraView = createCamera(level);
const { camera, resize } = cameraView;
connectCameraControls(canvas, cameraView);
const enemies = createEnemyLayer(camera);
const builds = createBuildLayer();
const shots = createShotLayer(enemies);
const combat = createCombatFeedback(enemies);
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
const hud = createBuildHud(canvas, camera, initial, {
  placeTower: (cell, kind) => loop.enqueue((tick) => ({ type: 'placeTower', cell, kind, tick })),
  manageTower: (cell, type) => loop.enqueue((tick) => ({ type, cell, tick })),
});
const waveHud = createWaveHud(canvas, camera, {
  startWave: () => loop.enqueue((tick) => ({ type: 'startWave', tick })),
  continueEndless: () => loop.enqueue((tick) => ({ type: 'continueEndless', tick })),
  setSpeed: (speed) => loop.setSpeed(speed),
  restart: () => {
    hud.reset();
    shots.reset();
    enemies.reset();
    combat.reset();
    combatHud.reset();
    loop.reset(createGame(content, level));
  },
});
const loop = startLoop({
  initial,
  onEvents: (events, previous, current, time) => {
    hud.onEvents(events);
    waveHud.onEvents(events, time.wallMs);
    shots.onEvents(events, current, time.gameMs);
    combat.onEvents(events, previous, time.gameMs);
    enemies.observe(current);
  },
  draw: (previous, current, alpha, time) => {
    const feedback = combat.update(time.gameMs, !allowShake.matches);
    terrain.setCastleFlash(feedback.castleFlash);
    const shaking = feedback.shake.lengthSq() > 0;
    if (shaking) {
      cameraPosition.copy(camera.position);
      camera.translateX(feedback.shake.x);
      camera.translateY(feedback.shake.y);
      camera.updateMatrixWorld();
    }
    enemies.update(previous, current, alpha, feedback.hitFlash);
    builds.update(previous, current, alpha, hud.update(current), enemies.routeMotions());
    waveHud.update(current, time.wallMs);
    shots.update(time.gameMs);
    combatHud.update(feedback);
    torches.update(time.gameMs / 1000);
    pixelRenderer.render();
    if (shaking) {
      camera.position.copy(cameraPosition);
      camera.updateMatrixWorld();
    }
  },
});
