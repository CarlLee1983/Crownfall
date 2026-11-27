import { Box3, Group, Mesh, MeshStandardMaterial, type Object3D, Vector3 } from 'three';
import { WORLD_LAYER } from './layers';

const HEXAGON_TOWER_SCALE = 0.7;
const TOWER_EMISSIVE_INTENSITY = 0.4;

export interface LoadedTowerModel {
  readonly scene: Object3D;
  readonly height: number;
  readonly halfWidth: number;
}

export function prepareTowerModel(source: Object3D, scale = HEXAGON_TOWER_SCALE): LoadedTowerModel {
  const scaled = new Group();
  scaled.scale.setScalar(scale);
  scaled.add(source);

  const bounds = new Box3().setFromObject(scaled, true);
  if (bounds.isEmpty()) throw new Error('塔模型缺少幾何體');
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  scaled.position.set(-center.x, -bounds.min.y, -center.z);
  scaled.traverse((object) => {
    object.layers.set(WORLD_LAYER);
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial) || material.map === null) continue;
      material.emissiveMap = material.map;
      material.emissive.setHex(0xffffff);
      material.emissiveIntensity = TOWER_EMISSIVE_INTENSITY;
    }
  });
  return { scene: scaled, height: size.y, halfWidth: Math.max(size.x, size.z) / 2 };
}
