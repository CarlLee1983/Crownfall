import { InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { WORLD_LAYER } from './layers';

export interface DecorPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotation: number;
  readonly scale: number;
}

/** The decoration GLBs each provide one mesh and one material for a single world draw. */
export function createDecorInstances(
  source: Object3D,
  placements: readonly DecorPlacement[],
): InstancedMesh {
  source.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  source.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object);
  });
  const [mesh] = meshes;
  if (meshes.length !== 1 || mesh === undefined || Array.isArray(mesh.material)) {
    throw new Error('Expected one decoration mesh with a single material');
  }
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (bounds === null || bounds.isEmpty()) throw new Error('Decoration geometry is empty');
  const center = bounds.getCenter(new Vector3());
  geometry.translate(-center.x, -bounds.min.y, -center.z);
  const material = mesh.material.clone();
  if (material instanceof MeshStandardMaterial && material.map !== null) {
    material.emissiveMap = material.map;
    material.emissive.setHex(0xffffff);
    material.emissiveIntensity = 0.28;
  }
  const instances = new InstancedMesh(geometry, material, placements.length);
  instances.layers.set(WORLD_LAYER);
  // Picking stays in core. A generic Three.js raycast must also ignore these props.
  instances.raycast = () => {};
  const transform = new Object3D();
  for (const [index, { x, y, z, rotation, scale }] of placements.entries()) {
    transform.position.set(x, y, z);
    transform.rotation.y = rotation;
    transform.scale.setScalar(scale);
    transform.updateMatrix();
    instances.setMatrixAt(index, transform.matrix);
  }
  return instances;
}
