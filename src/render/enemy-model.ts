import { AnimationMixer, Color, LoopOnce, Mesh, MeshStandardMaterial, SkinnedMesh } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { LoadedEnemyModel } from './enemy-model-assets';
import { FX } from './fx';
import { WORLD_LAYER } from './layers';

const MODEL_SCALE = 0.39;
const GLOW_INTENSITY = 0.22;
const WHITE = new Color(0xffffff);

export function createEnemyModel(
  { scene, walk, hit = walk, death = walk }: LoadedEnemyModel,
  footHeight: number,
  glow: number,
  scale = MODEL_SCALE,
) {
  const model = clone(scene);
  model.scale.setScalar(scale);
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
    material.emissiveMap ??= material.map;
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
  // PROTOTYPE #105: one-shot hit / death clips blended over the walk by manual weights.
  const hitAction = mixer.clipAction(hit);
  hitAction.setLoop(LoopOnce, 1).setEffectiveWeight(0);
  const deathAction = mixer.clipAction(death);
  deathAction.setLoop(LoopOnce, 1);
  deathAction.clampWhenFinished = true;
  deathAction.timeScale = FX === 'crumble' ? 2 : 1;
  const FADE_S = 0.08;
  let hitStartMs = -Infinity;
  let lastReactionStart = -Infinity;
  let deathStartMs: number | undefined;
  let previousMs: number | undefined;
  return {
    model,
    update(
      gameMs: number,
      walkingSpeed: number,
      flash: number,
      reactionStart?: number,
      dying = false,
    ) {
      if (
        FX === 'hit' &&
        !dying &&
        reactionStart !== undefined &&
        reactionStart !== lastReactionStart
      ) {
        lastReactionStart = reactionStart;
        // Not restarted while the previous Hit_A is still playing.
        if (gameMs - hitStartMs >= hit.duration * 1000) {
          hitStartMs = gameMs;
          hitAction.reset().play();
        }
      }
      if (dying && deathStartMs === undefined) {
        deathStartMs = gameMs;
        deathAction.reset().play();
      }
      let hitWeight = 0;
      if (deathStartMs !== undefined) {
        hitAction.setEffectiveWeight(0);
        hitWeight = 0;
        const blend = Math.min(1, (gameMs - deathStartMs) / 1000 / FADE_S);
        deathAction.setEffectiveWeight(blend);
        action.setEffectiveWeight(1 - blend);
      } else if (FX === 'hit') {
        const t = (gameMs - hitStartMs) / 1000;
        const length = hit.duration;
        if (t >= 0 && t < length) {
          hitWeight = Math.min(1, t / FADE_S, (length - t) / FADE_S);
        }
        hitAction.setEffectiveWeight(hitWeight);
        action.setEffectiveWeight(1 - hitWeight);
      }

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
