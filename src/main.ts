import { DirectionalLight, HemisphereLight, Scene, WebGLRenderer } from 'three';
import { content } from './content/content';
import { level } from './content/level';
import { createGame } from './core';
import { createCamera } from './render/camera';
import { createEnemyLayer } from './render/enemies';
import { startLoop } from './render/loop';
import { createTerrain } from './render/terrain';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('找不到 #game 畫布');

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x14161c);

const terrain = createTerrain(level);
const enemies = createEnemyLayer();
const { camera, resize } = createCamera(level);

const scene = new Scene();
const sun = new DirectionalLight(0xffffff, 1.6);
sun.position.set(-6, 14, 4);
scene.add(new HemisphereLight(0xcfe3ff, 0x40382a, 1.2), sun, terrain, enemies.group);

const onResize = (): void => {
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  resize(window.innerWidth / window.innerHeight);
};
window.addEventListener('resize', onResize);
onResize();

startLoop({
  initial: createGame(content, level),
  draw: (previous, current, alpha) => {
    enemies.update(previous, current, alpha);
    renderer.render(scene, camera);
  },
});
