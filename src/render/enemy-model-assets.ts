import type { AnimationClip, Object3D } from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FX } from './fx';
import ghoulUrl from './models/enemy-ghoul.glb?url';
import lichUrl from './models/enemy-lich.glb?url';
import skeletonUrl from './models/enemy-skeleton.glb?url';
import knightUrl from './models/enemy-skeleton-knight.glb?url';

export interface LoadedEnemyModel {
  readonly scene: Object3D;
  readonly walk: AnimationClip;
  readonly hit?: AnimationClip;
  readonly death?: AnimationClip;
}

export async function loadEnemyModels(loader: GLTFLoader) {
  const load = async (url: string, name: string): Promise<LoadedEnemyModel> => {
    const { scene, animations } = await loader.loadAsync(url);
    const walk = animations.find((clip) => clip.name === 'Walking_A');
    if (walk === undefined) throw new Error(`${name}模型缺少 Walking_A`);
    const find = (clipName: string): AnimationClip => {
      const clip = animations.find((item) => item.name === clipName);
      if (clip === undefined) throw new Error(`${name}模型缺少 ${clipName}`);
      return clip;
    };
    // PROTOTYPE #105: crumble swaps Death_A for the bones-collapse clip.
    return {
      scene,
      walk,
      hit: find('Hit_A'),
      death: find(FX === 'crumble' ? 'Death_C_Skeletons' : 'Death_A'),
    };
  };

  const [grunt, runner, tank, boss] = await Promise.all([
    load(skeletonUrl, '骷髏兵'),
    load(ghoulUrl, '食屍鬼'),
    load(knightUrl, '骷髏騎士'),
    load(lichUrl, '巫妖'),
  ]);
  return { grunt, runner, tank, boss };
}
