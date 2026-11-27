import { AnimationMixer, Color, Mesh, MeshStandardMaterial, SkinnedMesh } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { WORLD_LAYER } from './layers';
import type { LoadedEnemyModel } from './models';

const MODEL_SCALE = 0.26;
const GLOW_INTENSITY = 0.22;
const WHITE = new Color(0xffffff);

export function createEnemyModel(
  { scene, walk }: LoadedEnemyModel,
  footHeight: number,
  glow: number,
) {
  const model = clone(scene);
  model.scale.setScalar(MODEL_SCALE);
  model.position.y = footHeight;
  const glowColor = new Color(glow);
  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const ownMaterial = (source: unknown) => {
    if (!(source instanceof MeshStandardMaterial)) {
      throw new Error('敵人模型必須使用 glTF 標準材質');
    }
    const existing = materials.get(source);
    if (existing !== undefined) return existing;
    const material = source.clone();
    material.emissiveMap = material.map;
    materials.set(source, material);
    return material;
  };
  model.traverse((object) => {
    object.layers.set(WORLD_LAYER);
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(ownMaterial)
      : ownMaterial(object.material);
  });

  const mixer = new AnimationMixer(model);
  const action = mixer.clipAction(walk).play();
  let previousMs: number | undefined;
  return {
    model,
    update(gameMs: number, walkingSpeed: number, flash: number) {
      // Calibrate one clip cycle at the minion's reference speed of 1.6 cells per second.
      action.timeScale = walkingSpeed / 1.6;
      mixer.update((gameMs - (previousMs ?? gameMs)) / 1000);
      previousMs = gameMs;
      for (const material of materials.values()) {
        material.emissive.copy(glowColor).lerp(WHITE, flash);
        material.emissiveIntensity = GLOW_INTENSITY + flash;
      }
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
