import {
  type AnimationAction,
  AnimationMixer,
  Color,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  SkinnedMesh,
  Vector3,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { LoadedEnemyModel } from './enemy-model-assets';
import { WORLD_LAYER } from './layers';

export const DEATH_PLAYBACK_RATE = 2;

const MODEL_SCALE = 0.39;
const GLOW_INTENSITY = 0.3;
const WHITE = new Color(0xffffff);
const PIECE_BONES = new Map([
  ['Body', 'hips'],
  ['Cloak', 'hips'],
  ['Head', 'head'],
  ['Skull', 'head'],
  ['Eyes', 'head'],
  ['Jaw', 'head'],
  ['ArmLeft', 'upperarml'],
  ['ArmRight', 'upperarmr'],
  ['LegLeft', 'upperlegl'],
  ['LegRight', 'upperlegr'],
]);
const PIECE_ROOTS = ['hips', 'head', 'upperarml', 'upperarmr', 'upperlegl', 'upperlegr'];

export function createEnemyModel(
  { scene, walk, death }: LoadedEnemyModel,
  footHeight: number,
  glow: number,
  scale = MODEL_SCALE,
) {
  const model = clone(scene);
  model.scale.setScalar(scale);
  model.position.y = footHeight;
  const glowColor = new Color(glow);
  const meshes: Mesh[] = [];
  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const ownMaterial = (source: unknown) => {
    if (!(source instanceof MeshStandardMaterial)) {
      throw new Error('敵人模型必須使用 glTF 標準材質');
    }
    const existing = materials.get(source);
    if (existing !== undefined) return existing;
    const material = source.clone();
    material.emissiveMap ??= material.map;
    materials.set(source, material);
    return material;
  };
  model.traverse((object) => {
    object.layers.set(WORLD_LAYER);
    if (!(object instanceof Mesh)) return;
    meshes.push(object);
    object.material = Array.isArray(object.material)
      ? object.material.map(ownMaterial)
      : ownMaterial(object.material);
  });

  const mixer = new AnimationMixer(model);
  const action = mixer.clipAction(walk).play();
  let previousMs: number | undefined;
  let collapse: AnimationAction | undefined;
  let pieces: { bone: Object3D; meshes: Mesh[]; authoredPosition: Vector3 }[] | undefined;
  const vertex = new Vector3();
  const joint = new Vector3();
  const inverseParent = new Matrix4();
  function updatePoseMatrices(): void {
    model.updateWorldMatrix(true, false);
    model.updateMatrixWorld(true);
  }

  return {
    model,
    update(gameMs: number, walkingSpeed: number, flash: number, deathAgeMs?: number) {
      if (deathAgeMs === undefined) {
        // Calibrate one clip cycle at the minion's reference speed of 1.6 cells per second.
        action.timeScale = walkingSpeed / 1.6;
        mixer.update((gameMs - (previousMs ?? gameMs)) / 1000);
        previousMs = gameMs;
      } else {
        if (collapse === undefined) {
          action.stop();
          collapse = mixer.clipAction(death).play();
          collapse.paused = true;
        }
        // The mixer skips unchanged tracks. Restore the authored pose before sampling again.
        for (const { bone, authoredPosition } of pieces ?? []) bone.position.copy(authoredPosition);
        // Use presentation time so skipped frames and paused draws sample the same pose.
        collapse.time = Math.min(death.duration, (deathAgeMs * DEATH_PLAYBACK_RATE) / 1000);
        mixer.update(0);
      }
      for (const material of materials.values()) {
        material.emissive.copy(glowColor).lerp(WHITE, flash);
        material.emissiveIntensity = GLOW_INTENSITY + flash;
      }
    },
    fitCollapseToGround(heightAt: (x: number, z: number) => number) {
      if (pieces === undefined) {
        const byBone = new Map<string, Mesh[]>();
        model.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          // Skinned pieces sit under the rig. Rigid gear follows its existing bone attachment.
          let name = PIECE_BONES.get(object.name.split('_').at(-1) ?? '');
          for (
            let ancestor = object.parent;
            name === undefined && ancestor;
            ancestor = ancestor.parent
          ) {
            if (PIECE_ROOTS.includes(ancestor.name)) name = ancestor.name;
          }
          if (name === undefined) return;
          const assigned = byBone.get(name) ?? [];
          assigned.push(object);
          byBone.set(name, assigned);
        });
        pieces = PIECE_ROOTS.flatMap((name) => {
          const bone = model.getObjectByName(name);
          const meshes = byBone.get(name);
          return bone === undefined || meshes === undefined
            ? []
            : [{ bone, meshes, authoredPosition: bone.position.clone() }];
        });
      }

      updatePoseMatrices();
      let hipsLift = 0;
      // Measure each piece before moving any joints. The child pieces can land separately.
      for (const { bone, meshes, authoredPosition } of pieces) {
        if (bone.parent === null) continue;
        authoredPosition.copy(bone.position);
        let clearance = Infinity;
        for (const mesh of meshes) {
          for (let index = 0; index < mesh.geometry.getAttribute('position').count; index++) {
            mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
            clearance = Math.min(clearance, vertex.y - heightAt(vertex.x, vertex.z));
          }
        }
        const lift = Math.max(0, -clearance);
        const offset = bone.name === 'hips' ? lift : lift - hipsLift;
        if (bone.name === 'hips') hipsLift = lift;
        if (offset === 0) continue;
        // Read the unadjusted parent transform so every offset remains in world Y.
        joint.copy(bone.position).applyMatrix4(bone.parent.matrixWorld);
        joint.y += offset;
        bone.position.copy(
          joint.applyMatrix4(inverseParent.copy(bone.parent.matrixWorld).invert()),
        );
      }
    },
    sinkDepth(heightAt: (x: number, z: number) => number): number {
      updatePoseMatrices();
      let clearance = 0;
      for (const mesh of meshes) {
        const count = mesh.geometry.getAttribute('position').count;
        for (let index = 0; index < count; index++) {
          mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
          clearance = Math.max(clearance, vertex.y - heightAt(vertex.x, vertex.z));
        }
      }
      // Leave the final pose just below the surface before the view is released.
      return clearance + 0.01;
    },
    dispose() {
      mixer.uncacheRoot(model);
      for (const material of materials.values()) material.dispose();
      model.traverse((object) => {
        if (object instanceof SkinnedMesh) object.skeleton.dispose();
      });
    },
  };
}
