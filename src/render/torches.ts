import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PointLight } from 'three';
import { type GridPoint, groundHeight, type Level } from '../core';
import { WORLD_LAYER } from './layers';
import { LAYER_HEIGHT } from './terrain';

const MAX_TORCHES = 8;

export function createTorches(level: Level, positions: readonly GridPoint[]) {
  const group = new Group();
  const flameGeometry = new BoxGeometry(0.08, 0.14, 0.08);
  const flameMaterial = new MeshBasicMaterial({ color: 0xffb347 });
  const lights = positions.slice(0, MAX_TORCHES).map((point) => {
    const flame = new Mesh(flameGeometry, flameMaterial);
    const light = new PointLight(0xff9a3c, 2.6, 4.5, 1.6);
    light.position.set(point.x, groundHeight(level, point) * LAYER_HEIGHT + 0.35, point.y);
    flame.position.copy(light.position);
    flame.layers.set(WORLD_LAYER);
    light.layers.set(WORLD_LAYER);
    group.add(light, flame);
    return light;
  });

  function update(seconds: number): void {
    lights.forEach((light, index) => {
      const phase = index * 2.4;
      light.intensity =
        2.6 + 0.35 * Math.sin(seconds * 9 + phase) + 0.2 * Math.sin(seconds * 23 + phase);
    });
  }

  return { group, update };
}
