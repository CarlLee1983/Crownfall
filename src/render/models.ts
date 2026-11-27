import { type AnimationClip, LoadingManager, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import skeletonUrl from './models/enemy-skeleton.glb?url';

export interface LoadedEnemyModel {
  readonly scene: Object3D;
  readonly walk: AnimationClip;
}

export interface LoadedModels {
  readonly enemies: { readonly grunt: LoadedEnemyModel };
}

export async function loadModels(): Promise<LoadedModels> {
  let resourceFailed = false;
  const manager = new LoadingManager();
  // GLTFLoader can resolve the scene even when a texture fails to decode.
  manager.onError = () => {
    resourceFailed = true;
  };
  const { scene, animations } = await new GLTFLoader(manager).loadAsync(skeletonUrl);
  if (resourceFailed) throw new Error('骷髏兵模型的資源載入失敗');
  const walk = animations.find(({ name }) => name === 'Walking_A');
  if (walk === undefined) throw new Error('骷髏兵模型缺少 Walking_A');
  return { enemies: { grunt: { scene, walk } } };
}
