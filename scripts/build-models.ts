import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import manifest from '../docs/art/asset-manifest.json';

const skeleton = manifest.assets.find(({ id }) => id === 'enemy-skeleton');
if (skeleton?.source.commit === undefined) throw new Error('缺少骷髏兵的來源版本');

const { source, path } = skeleton;
const upstream = new URL(source.url_or_tool);
const input = `https://raw.githubusercontent.com${upstream.pathname}/${source.commit}/${source.prompt_or_source_record}`;
const io = new NodeIO(fetch).setAllowNetwork(true);
const document = await io.read(input);
const root = document.getRoot();
const animations = root.listAnimations();
const walk = animations.find((clip) => clip.getName() === 'Walking_A');
if (walk === undefined) throw new Error('骷髏兵原檔缺少 Walking_A');
for (const clip of animations) {
  if (clip === walk) continue;
  // Discard the subproperties too, so their accessors become eligible for pruning.
  for (const channel of clip.listChannels()) channel.dispose();
  for (const sampler of clip.listSamplers()) sampler.dispose();
  clip.dispose();
}
const scene = root.getDefaultScene();
if (scene === null) throw new Error('骷髏兵原檔缺少預設場景');
// Walking_A dips the soles by 0.058 source units, including in its first frame.
const grounded = document.createNode('Grounded').setTranslation([0, 0.06, 0]);
for (const child of scene.listChildren()) grounded.addChild(child);
scene.addChild(grounded);

await document.transform(
  prune(),
  resample(),
  dedup(),
  textureCompress({ encoder: sharp, resize: [128, 128], targetFormat: 'png' }),
);
// glTF sampler constant for nearest-neighbor filtering.
const NEAREST = 9728;
for (const material of root.listMaterials()) {
  material.getBaseColorTextureInfo()?.setMagFilter(NEAREST).setMinFilter(NEAREST);
}

await io.write(path, document);
console.log(`${path} (${io.lastWriteBytes} bytes)`);
