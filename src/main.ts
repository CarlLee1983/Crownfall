import { DirectionalLight, HemisphereLight, Scene, WebGLRenderer } from 'three';
import { content } from './content/content';
import { level } from './content/level';
import { createGame } from './core';
import { createBuildHud } from './render/build-hud';
import { createBuildLayer } from './render/build-layer';
import { createCamera } from './render/camera';
import { createEnemyLayer } from './render/enemies';
import { startLoop } from './render/loop';
import { createTerrain } from './render/terrain';
import './render/hud.css';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('找不到 #game 畫布');

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x14161c);

const terrain = createTerrain(level);
const enemies = createEnemyLayer();
const builds = createBuildLayer();
const { camera, resize } = createCamera(level);

const scene = new Scene();
const sun = new DirectionalLight(0xffffff, 1.6);
sun.position.set(-6, 14, 4);
scene.add(new HemisphereLight(0xcfe3ff, 0x40382a, 1.2), sun, terrain, enemies.group, builds.group);

const onResize = (): void => {
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  resize(window.innerWidth / window.innerHeight);
  camera.updateMatrixWorld();
};
window.addEventListener('resize', onResize);
onResize();

const initial = createGame(content, level);
const hud = createBuildHud(canvas, camera, initial, (cell, kind) => {
  enqueue((tick) => ({ type: 'placeTower', cell, kind, tick }));
});
const { enqueue } = startLoop({
  initial,
  onEvents: hud.onEvents,
  draw: (previous, current, alpha) => {
    builds.update(previous, current, alpha, hud.update(current));
    enemies.update(previous, current, alpha);
    renderer.render(scene, camera);
  },
});
