import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadEnemyModels } from './enemy-model-assets';

export interface LoadedModels {
  readonly enemies: Awaited<ReturnType<typeof loadEnemyModels>>;
}

export async function loadModels(): Promise<LoadedModels> {
  let resourceFailed = false;
  const manager = new LoadingManager();
  // GLTFLoader can resolve the scene even when a texture fails to decode.
  manager.onError = () => {
    resourceFailed = true;
  };
  const enemies = await loadEnemyModels(new GLTFLoader(manager));
  if (resourceFailed) throw new Error('敵人模型的資源載入失敗');
  return { enemies };
}
