import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  Box3,
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Scene,
  Texture,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { performanceFrame } from '../../scripts/perf/frame';
import { content } from '../content/content';
import { level } from '../content/level';
import { applyCommands, createGame, pickCell } from '../core';
import { cellIndex } from '../core/level';
import { createBattlefield } from './battlefield';
import { OVERLAY_LAYER, WORLD_LAYER } from './layers';
import { loadModels } from './models';
import { estimateFrameCost } from './performance-budget';

async function loadHeadlessModels() {
  const parser = new GLTFLoader();
  // Image decoding needs a browser. Keep the real GLB geometry, materials and animations.
  parser.register(() => ({ name: 'headless-textures', loadTexture: async () => new Texture() }));
  return loadModels({
    loadAsync: async (url) => {
      const file = new URL(`./models/${basename(url)}`, import.meta.url);
      const bytes = await readFile(file);
      return parser.parseAsync(Uint8Array.from(bytes).buffer, '');
    },
  });
}

it.each([
  { wave: 8, enemies: { tank: 6, grunt: 10 } },
  { wave: 9, enemies: { grunt: 18, runner: 14, tank: 5 } },
])(
  'keeps the wave $wave peak within the scene estimate (not renderer.info)',
  async ({ wave, enemies }) => {
    const models = await loadHeadlessModels();

    const frame = performanceFrame(models, wave);
    expect(frame.state.waveNumber).toBe(wave);
    expect(
      frame.state.enemies.reduce<Record<string, number>>((counts, { kind }) => {
        counts[kind] = (counts[kind] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual(enemies);
    expect(frame.state.towers.map(({ kind }) => kind).sort()).toEqual([
      'basic',
      'basic',
      'basic',
      'basic',
      'sniper',
      'sniper',
      'sniper',
      'sniper',
      'splash',
      'splash',
      'splash',
      'splash',
    ]);

    expect(frame.state.enemies).toHaveLength(frame.peakAlive);

    const cost = estimateFrameCost(frame.scene);
    // main submitted 697 draws at the 37-enemy peak. See docs/perf/baseline.md.
    expect(cost.drawCalls).toBeLessThanOrEqual(Math.floor(697 * 1.2));
    expect(cost.triangles).toBeLessThanOrEqual(250_000);
    expect(cost.pointLights).toBeLessThanOrEqual(8);
  },
);

it('counts the world, pixel composite and overlay with their material and instance costs', () => {
  const scene = new Scene();
  const material = new MeshBasicMaterial();
  const box = new BoxGeometry();
  const world = new Mesh(
    box,
    Array.from({ length: 6 }, () => material),
  );
  const instances = new InstancedMesh(box, material, 3);
  const overlay = new Mesh(new PlaneGeometry(), material);
  overlay.layers.set(OVERLAY_LAYER);
  const both = new Mesh(new PlaneGeometry(), material);
  both.layers.enable(OVERLAY_LAYER);
  const light = new PointLight();
  light.layers.enable(WORLD_LAYER);
  light.layers.enable(OVERLAY_LAYER);
  const hidden = new Group();
  hidden.visible = false;
  hidden.add(new Mesh(box, material), new PointLight());
  scene.add(world, instances, overlay, both, light, hidden);

  expect(estimateFrameCost(scene)).toEqual({ drawCalls: 11, triangles: 56, pointLights: 1 });
});

it('keeps all cemetery props outside picking and tower placement on every restart', async () => {
  const models = await loadHeadlessModels();
  const cemetery = () => {
    const { scene } = createBattlefield(models);
    const groundAndProps = scene.getObjectByName('cemetery');
    expect(groundAndProps).toBeDefined();
    const batches =
      groundAndProps?.children.filter((child) => child instanceof InstancedMesh) ?? [];
    expect(batches).toHaveLength(4);
    const placements: number[][] = [];
    const matrix = new Matrix4();
    for (const batch of batches) {
      expect(batch.layers.mask).toBe(1 << WORLD_LAYER);
      expect(batch.material).not.toBeInstanceOf(Array);
      const modelBounds = new Box3().setFromBufferAttribute(
        batch.geometry.getAttribute('position'),
      );
      for (let i = 0; i < batch.count; i++) {
        batch.getMatrixAt(i, matrix);
        const bounds = modelBounds.clone().applyMatrix4(matrix);
        const { x, z } = bounds.getCenter(new Vector3());
        const distanceFromBoard = Math.max(
          -0.5 - bounds.max.x,
          bounds.min.x - (level.width - 0.5),
          -0.5 - bounds.max.z,
          bounds.min.z - (level.height - 0.5),
        );
        expect(distanceFromBoard).toBeGreaterThan(0);
        expect(distanceFromBoard).toBeLessThan(3);
        if (x > level.width - 0.5 || z > level.height - 0.5) {
          expect(bounds.max.y).toBeLessThanOrEqual(0);
        }
        const origin = new Vector3(x, 5, z);
        const direction = new Vector3(0, -1, 0);
        expect(pickCell(level, { origin, direction })).toBeUndefined();
        expect(new Raycaster(origin, direction).intersectObject(batch)).toEqual([]);
        placements.push(matrix.toArray());
      }
    }
    return placements;
  };
  const first = cemetery();
  expect(first.length).toBeGreaterThan(0);
  expect(cemetery()).toEqual(first);

  const cell = cellIndex(level.width, 10, 12);
  expect(
    pickCell(level, { origin: { x: 10, y: 5, z: 12 }, direction: { x: 0, y: -1, z: 0 } }),
  ).toBe(cell);
  const { state } = applyCommands(createGame(content, level), [
    { type: 'placeTower', tick: 0, cell, kind: 'basic' },
  ]);
  expect(state.towers.map((tower) => tower.cell)).toEqual([cell]);
});
