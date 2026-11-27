import { readFile } from 'node:fs/promises';
import { Mesh, MeshStandardMaterial, PerspectiveCamera, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { content } from '../../content/content';
import { createGame, type GameState, groundHeight, parseLevel } from '../../core';
import { cellIndex } from '../../core/level';
import { createEnemyLayer } from '../enemies';
import { LAYER_HEIGHT } from '../terrain';

it('fits the equipped lich to one cell and keeps its walking soles on the ramp', async () => {
  const binary = await readFile(new URL('./enemy-lich.glb', import.meta.url));
  const loader = new GLTFLoader().register(() => ({
    name: 'Test texture decoder',
    loadTexture: async () => new Texture(),
  }));
  const { scene, animations } = await loader.parseAsync(new Uint8Array(binary).buffer, '');
  const walk = animations[0];
  if (walk === undefined) throw new Error('No lich walk animation');
  const level = parseLevel(['S^g']);
  const initial = createGame(content, level);
  const enemy = {
    id: initial.nextEnemyId,
    kind: 'boss',
    hp: 1,
    maxHp: 1,
    from: cellIndex(level.width, 1, 0),
    to: level.goal,
    progress: 0,
  };
  const previous: GameState = {
    ...initial,
    phase: 'wave',
    enemies: [enemy],
  };
  const current: GameState = {
    ...previous,
    tick: previous.tick + 1,
    enemies: [{ ...enemy, progress: 0.01 }],
  };

  const layer = createEnemyLayer(new PerspectiveCamera(), { boss: { scene, walk } });
  const periodMs =
    (walk.duration * content.enemies.grunt.speed * 1000) / content.enemies.boss.speed;
  const point = new Vector3();
  let radius = 0;
  for (let frame = 0; frame < 24; frame++) {
    // Sample the gait in place, halfway up the ramp where the proxy applies its full shear.
    layer.update(previous, current, 0, undefined, (frame * periodMs) / 24);
    layer.group.updateMatrixWorld(true);
    let clearance = Infinity;
    layer.group.traverse((mesh) => {
      if (!(mesh instanceof Mesh) || !(mesh.material instanceof MeshStandardMaterial)) return;
      const count = mesh.geometry.getAttribute('position').count;
      for (let vertex = 0; vertex < count; vertex++) {
        mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
        radius = Math.max(radius, Math.hypot(point.x - 1, point.z));
        if (Math.abs(point.x - 1) >= 0.5) continue;
        const floor = groundHeight(level, { x: point.x, y: point.z }) * LAYER_HEIGHT;
        clearance = Math.min(clearance, point.y - floor);
      }
    });
    expect(clearance).toBeGreaterThanOrEqual(-0.005);
    expect(clearance).toBeLessThan(0.025);
  }
  expect(2 * radius).toBeCloseTo(1, 1);
});
