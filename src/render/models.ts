import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadEnemyModels } from './enemy-model-assets';
import archerUrl from './models/tower-archer.glb?url';
import { type LoadedTowerModel, prepareTowerModel } from './tower-model';

export interface LoadedModels {
  readonly enemies: Readonly<Awaited<ReturnType<typeof loadEnemyModels>>>;
  readonly towers: { readonly basic: LoadedTowerModel };
}

export async function loadModels(): Promise<LoadedModels> {
  let resourceFailed = false;
  const manager = new LoadingManager();
  // GLTFLoader can resolve the scene even when a texture fails to decode.
  manager.onError = () => {
    resourceFailed = true;
  };
  const loader = new GLTFLoader(manager);
  const [enemies, archer] = await Promise.all([
    loadEnemyModels(loader),
    loader.loadAsync(archerUrl),
  ]);
  if (resourceFailed) throw new Error('3D 模型資源載入失敗');
  return { enemies, towers: { basic: prepareTowerModel(archer.scene) } };
}
