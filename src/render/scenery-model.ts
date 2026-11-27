import {
  Box3,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from 'three';
import { WORLD_LAYER } from './layers';

export function placeableScenery(source: Object3D, footprint: number, fill: number) {
  const model = source.clone();
  const bounds = new Box3().setFromObject(model, true);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const scale = footprint / Math.max(size.x, size.z);
  const group = new Group();
  model.position.sub(new Vector3(center.x, bounds.min.y, center.z));
  group.scale.setScalar(scale);
  group.add(model);

  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const cloneMaterial = (material: Material): Material => {
    if (!(material instanceof MeshStandardMaterial)) return material;
    const existing = materials.get(material);
    if (existing !== undefined) return existing;
    const clone = material.clone();
    if (clone.map !== null) {
      clone.emissiveMap = clone.map;
      clone.emissive.setHex(0xffffff);
      clone.emissiveIntensity = fill;
    }
    materials.set(material, clone);
    return clone;
  };
  group.traverse((object) => {
    object.layers.set(WORLD_LAYER);
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });
  return { group, height: size.y * scale, materials: [...materials.values()] };
}
