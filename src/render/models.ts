import { LoadingManager, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadEnemyModels } from './enemy-model-assets';
import castleUrl from './models/prop-castle.glb?url';
import entranceUrl from './models/prop-entrance.glb?url';
import torchUrl from './models/prop-torch.glb?url';
import archerUrl from './models/tower-archer.glb?url';
import ballistaUrl from './models/tower-ballista.glb?url';
import mageUrl from './models/tower-mage.glb?url';
import { type LoadedTowerModel, prepareTowerModel } from './tower-model';

export interface LoadedModels {
  readonly enemies: Readonly<Awaited<ReturnType<typeof loadEnemyModels>>>;
  readonly towers: {
    readonly basic: LoadedTowerModel;
    readonly sniper: LoadedTowerModel;
    readonly splash: LoadedTowerModel;
  };
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
  const [enemies, archer, ballista, mage, entrance, castle, torch] = await Promise.all([
    loadEnemyModels(loader),
    loader.loadAsync(archerUrl),
    loader.loadAsync(ballistaUrl),
    loader.loadAsync(mageUrl),
    loader.loadAsync(entranceUrl),
    loader.loadAsync(castleUrl),
    loader.loadAsync(torchUrl),
  ]);
  if (resourceFailed) throw new Error('3D 模型資源載入失敗');
  return {
    enemies,
    towers: {
      basic: prepareTowerModel(archer.scene),
      sniper: prepareTowerModel(ballista.scene),
      splash: prepareTowerModel(mage.scene),
    },
    scenery: { entrance: entrance.scene, castle: castle.scene, torch: torch.scene },
  };
}
