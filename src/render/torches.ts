import { Group, type Object3D, PointLight } from 'three';
import { type GridPoint, groundHeight, type Level } from '../core';
import { WORLD_LAYER } from './layers';
import { placeableScenery } from './scenery-model';
import { LAYER_HEIGHT } from './terrain';

const MAX_TORCHES = 8;

export function createTorches(level: Level, positions: readonly GridPoint[], model: Object3D) {
  const group = new Group();
  const torch = placeableScenery(model, 0.19, 0.38);
  const lights = positions.slice(0, MAX_TORCHES).map((point) => {
    const prop = torch.group.clone();
    const light = new PointLight(0xff9a3c, 2.6, 4.5, 1.6);
    prop.position.set(point.x, groundHeight(level, point) * LAYER_HEIGHT, point.y);
    light.position.copy(prop.position);
    light.position.y += torch.height;
    light.layers.set(WORLD_LAYER);
    group.add(light, prop);
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
