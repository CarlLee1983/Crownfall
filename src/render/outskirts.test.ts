import { Box3, InstancedMesh, Matrix4, Ray, Raycaster, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { content } from '../content/content';
import { level } from '../content/level';
import { applyCommands, createGame, pickCell } from '../core';
import { cellIndex } from '../core/level';
import { createBattlefield } from './battlefield';
import { headlessModelLoader } from './headless-models.fixture';
import { WORLD_LAYER } from './layers';
import { loadModels } from './models';
import { LAYER_HEIGHT } from './terrain';

it('keeps all cemetery props outside picking and tower placement on every restart', async () => {
  const models = await loadModels(headlessModelLoader());
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
        if (batch.name === 'rubble' && bounds.min.y > -0.17) continue;
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

function instanceBounds(batch: InstancedMesh): Box3[] {
  const matrix = new Matrix4();
  batch.geometry.computeBoundingBox();
  const bounds = batch.geometry.boundingBox;
  if (bounds === null) throw new Error('Missing decoration bounds');
  return Array.from({ length: batch.count }, (_, index) => {
    batch.getMatrixAt(index, matrix);
    return bounds.clone().applyMatrix4(matrix);
  });
}

it('sets parapets on the far edges of cliffs and leaves the ramp and near edges open', async () => {
  const { scene } = createBattlefield(await loadModels(headlessModelLoader()));
  const parapets = scene.getObjectByName('parapets');
  expect(parapets).toBeInstanceOf(InstancedMesh);
  if (!(parapets instanceof InstancedMesh)) throw new Error('Missing parapets');

  expect(parapets.layers.mask).toBe(1 << WORLD_LAYER);
  const actual: number[][] = [];
  for (const placed of instanceBounds(parapets)) {
    const { x, z } = placed.getCenter(new Vector3());
    const size = placed.getSize(new Vector3());
    actual.push([x, z, Number(size.x > size.z)]);
    expect(Math.min(size.x, size.z)).toBeLessThan(0.12);
    expect(
      new Raycaster(new Vector3(x, 5, z), new Vector3(0, -1, 0)).intersectObject(parapets),
    ).toEqual([]);
  }
  expect(actual).toHaveLength(10);
  expect(actual).toEqual(
    expect.arrayContaining([
      [0, -0.5, 1],
      [-0.5, 0, 0],
      [1, -0.5, 1],
      [-0.5, 1, 0],
      [-0.5, 2, 0],
      [2, 3.5, 1],
      [1.5, 4, 0],
      [3, 3.5, 1],
      [4, 3.5, 1],
      [5, 3.5, 1],
    ]),
  );
});

it('keeps cliff-foot rubble at low tile boundaries and decor clear of tower and enemy centers', async () => {
  const { scene, cameraView } = createBattlefield(await loadModels(headlessModelLoader()));
  cameraView.resize(1280 / 800);
  const rubble = scene.getObjectByName('rubble');
  const parapets = scene.getObjectByName('parapets');
  if (!(rubble instanceof InstancedMesh) || !(parapets instanceof InstancedMesh)) {
    throw new Error('Missing cliff decor');
  }

  expect(rubble.layers.mask).toBe(1 << WORLD_LAYER);
  const feet = instanceBounds(rubble).filter((bounds) => bounds.min.y > -0.17);
  for (const placed of feet) {
    expect(placed.max.y).toBeLessThan(0.13);
    const { x, z } = placed.getCenter(new Vector3());
    expect(
      new Raycaster(new Vector3(x, 5, z), new Vector3(0, -1, 0)).intersectObject(rubble),
    ).toEqual([]);
  }
  expect(feet).toHaveLength(6);
  expect(
    feet.map((box) => {
      const { x, z } = box.getCenter(new Vector3());
      return [x, z];
    }),
  ).toEqual(
    expect.arrayContaining([
      [1.5, 0],
      [0, 2.5],
      [1.5, 2],
      [2, 4.5],
      [4, 4.5],
      [5.5, 4],
    ]),
  );

  const eye = cameraView.camera.position;
  const toward = new Vector3();
  const hit = new Vector3();
  const edges = [...instanceBounds(parapets), ...feet];
  for (const [index, { layer }] of level.cells.entries()) {
    const point = new Vector3(
      index % level.width,
      layer * LAYER_HEIGHT,
      Math.floor(index / level.width),
    );
    const ray = new Ray(eye, toward.subVectors(point, eye).normalize());
    for (const box of edges) {
      const occlusion = ray.intersectBox(box, hit);
      if (occlusion !== null) {
        expect(occlusion.distanceTo(eye)).toBeGreaterThan(point.distanceTo(eye));
      }
    }
  }
});
