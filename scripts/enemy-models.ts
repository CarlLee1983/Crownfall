import { Accessor, type Animation, Node, type NodeIO, PropertyType } from '@gltf-transform/core';
import {
  dedup,
  mergeDocuments,
  prune,
  resample,
  simplify,
  textureCompress,
  unpartition,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import manifest from '../docs/art/asset-manifest.json';
import { pinnedModelUrl } from './pinned-model';

const enemies = [
  { id: 'enemy-skeleton', ratio: 1, lift: 0.06 },
  { id: 'enemy-ghoul', ratio: 0.85, lift: 0.11 },
  { id: 'enemy-skeleton-knight', ratio: 0.72, lift: 0.11 },
  { id: 'enemy-lich', ratio: 0.85, lift: 0.06 },
];

function removeBindPoseTracks(clip: Animation): void {
  for (const channel of clip.listChannels()) {
    const node = channel.getTargetNode();
    const sampler = channel.getSampler();
    const output = sampler?.getOutput();
    if (
      node === null ||
      sampler?.getInterpolation() !== 'LINEAR' ||
      output == null ||
      output.getComponentType() !== Accessor.ComponentType.FLOAT
    ) {
      continue;
    }
    const path = channel.getTargetPath();
    if (path === null || path === 'weights') continue;
    const bind =
      path === 'translation'
        ? node.getTranslation()
        : path === 'rotation'
          ? node.getRotation()
          : node.getScale();
    const values = output.getArray();
    // The authored rig already supplies these transforms, up to float32 rounding.
    if (values?.every((value, i) => Math.abs(value - (bind[i % bind.length] ?? NaN)) <= 1e-7)) {
      channel.dispose();
    }
  }
  const samplersInUse = new Set(clip.listChannels().map((channel) => channel.getSampler()));
  for (const sampler of clip.listSamplers()) {
    if (!samplersInUse.has(sampler)) sampler.dispose();
  }
}

export async function buildEnemyModels(io: NodeIO): Promise<void> {
  for (const { id, ratio, lift } of enemies) {
    const asset = manifest.assets.find((item) => item.id === id);
    if (asset === undefined) throw new Error(`${id} 缺少來源記錄`);

    const { path, source } = asset;
    const document = await io.read(pinnedModelUrl(source));
    const root = document.getRoot();
    const animations = root.listAnimations();
    const walk = animations.find((clip) => clip.getName() === 'Walking_A');
    if (walk === undefined) throw new Error(`${id} 原檔缺少 Walking_A`);
    const death = animations.find((clip) => clip.getName() === 'Death_C_Skeletons');
    if (death === undefined) throw new Error(`${id} 原檔缺少 Death_C_Skeletons`);
    for (const clip of animations) {
      if (clip === walk || clip === death) continue;
      // Discard the subproperties too, so their accessors become eligible for pruning.
      for (const channel of clip.listChannels()) channel.dispose();
      for (const sampler of clip.listSamplers()) sampler.dispose();
      clip.dispose();
    }
    const scene = root.getDefaultScene();
    if (scene === null) throw new Error(`${id} 原檔缺少預設場景`);
    // Center each rig on the lowest point the soles reach during Walking_A.
    const grounded = document.createNode('Grounded').setTranslation([0, lift, 0]);
    for (const child of scene.listChildren()) grounded.addChild(child);
    scene.addChild(grounded);

    // Simplify before attaching gear to preserve the blade, shield and staff silhouettes.
    if (ratio < 1) {
      await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02 }));
    }
    for (const [slotName, accessoryPath] of Object.entries(source.equipment ?? {})) {
      const slot = root.listNodes().find((node) => node.getName() === slotName);
      if (slot === undefined) throw new Error(`${id} 原檔缺少 ${slotName}`);
      const accessory = await io.read(pinnedModelUrl(source, accessoryPath));
      const props = mergeDocuments(document, accessory);
      for (const accessoryScene of accessory.getRoot().listScenes()) {
        for (const child of accessoryScene.listChildren()) {
          const copied = props.get(child);
          if (!(copied instanceof Node)) throw new Error(`${id} 無法掛載 ${accessoryPath}`);
          slot.addChild(copied);
        }
        props.get(accessoryScene)?.dispose();
      }
    }

    await document.transform(prune(), resample(), dedup());
    removeBindPoseTracks(death);
    await document.transform(
      prune({ propertyTypes: [PropertyType.ACCESSOR] }),
      textureCompress({ encoder: sharp, resize: [128, 128], targetFormat: 'png' }),
    );
    if (source.equipment !== undefined) {
      // Retain texture detail in the glow while keeping the dark cloth visible.
      for (const atlas of root.listTextures()) {
        const image = atlas.getImage();
        if (image === null) throw new Error(`${id} 的色表未包含圖片`);
        const glow = await sharp(image)
          .removeAlpha()
          .toColourspace('b-w')
          .linear(0.28, 184)
          .png()
          .toBuffer();
        const emissive = document
          .createTexture('Glow atlas')
          .setImage(glow)
          .setMimeType('image/png');
        for (const material of root.listMaterials()) {
          if (material.getBaseColorTexture() === atlas) material.setEmissiveTexture(emissive);
        }
      }
    }
    // glTF sampler constant for nearest-neighbor filtering.
    const NEAREST = 9728;
    for (const material of root.listMaterials()) {
      material.getBaseColorTextureInfo()?.setMagFilter(NEAREST).setMinFilter(NEAREST);
      material.getEmissiveTextureInfo()?.setMagFilter(NEAREST).setMinFilter(NEAREST);
    }

    if (root.listBuffers().length > 1) await document.transform(unpartition());
    await io.write(path, document);
    console.log(`${path} (${io.lastWriteBytes} bytes)`);
  }
}
