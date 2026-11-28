import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  Scene,
} from 'three';
import { expect, it } from 'vitest';
import { performanceFrame } from '../../scripts/perf/frame';
import { headlessModelLoader } from './headless-models.fixture';
import { OVERLAY_LAYER, WORLD_LAYER } from './layers';
import { loadModels } from './models';
import { estimateFrameCost } from './performance-budget';

it.each([
  { wave: 8, maxDrawCalls: 400, enemies: { tank: 6, grunt: 10 } },
  { wave: 9, maxDrawCalls: 836, enemies: { grunt: 18, runner: 14, tank: 5 } },
])(
  'keeps the wave $wave peak within the scene estimate (not renderer.info)',
  async ({ wave, maxDrawCalls, enemies }) => {
    const models = await loadModels(headlessModelLoader());

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
    // The 400-draw limit expands only for wave 9. See docs/perf/baseline.md.
    expect(cost.drawCalls).toBeLessThanOrEqual(maxDrawCalls);
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
