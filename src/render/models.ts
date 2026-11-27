import { type AnimationClip, LoadingManager, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import skeletonUrl from './models/enemy-skeleton.glb?url';
import castleUrl from './models/prop-castle.glb?url';
import entranceUrl from './models/prop-entrance.glb?url';
import torchUrl from './models/prop-torch.glb?url';
import archerUrl from './models/tower-archer.glb?url';
import { type LoadedTowerModel, prepareTowerModel } from './tower-model';

export interface LoadedEnemyModel {
  readonly scene: Object3D;
  readonly walk: AnimationClip;
}

export interface LoadedModels {
  readonly enemies: { readonly grunt: LoadedEnemyModel };
  readonly towers: { readonly basic: LoadedTowerModel };
  readonly scenery: {
    readonly entrance: Object3D;
    readonly castle: Object3D;
    readonly torch: Object3D;
  };
}

export async function loadModels(): Promise<LoadedModels> {
  let resourceFailed = false;
  const manager = new LoadingManager();
  // GLTFLoader can resolve the scene even when a texture fails to decode.
  manager.onError = () => {
    resourceFailed = true;
  };
  const loader = new GLTFLoader(manager);
  const [{ scene, animations }, archer, entrance, castle, torch] = await Promise.all([
    loader.loadAsync(skeletonUrl),
    loader.loadAsync(archerUrl),
    loader.loadAsync(entranceUrl),
    loader.loadAsync(castleUrl),
    loader.loadAsync(torchUrl),
  ]);
  if (resourceFailed) throw new Error('3D 模型資源載入失敗');
  const walk = animations.find(({ name }) => name === 'Walking_A');
  if (walk === undefined) throw new Error('骷髏兵模型缺少 Walking_A');
  return {
    enemies: { grunt: { scene, walk } },
    towers: { basic: prepareTowerModel(archer.scene) },
    scenery: { entrance: entrance.scene, castle: castle.scene, torch: torch.scene },
  };
}
