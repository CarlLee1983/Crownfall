import type { Document } from '@gltf-transform/core';
import { dedup, prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const SATURATION = 0.45;
const NEAREST = 9728; // glTF sampler constant for nearest-neighbor filtering.

export async function prepareHexagonModel(document: Document): Promise<void> {
  await document.transform(prune(), dedup());
  const root = document.getRoot();
  for (const texture of root.listTextures()) {
    const image = texture.getImage();
    if (image === null) throw new Error('模型缺少色表');
    const { data, info } = await sharp(image)
      .resize(128, 128, { kernel: 'nearest' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let index = 0; index < data.length; index += 4) {
      const r = data.readUInt8(index);
      const g = data.readUInt8(index + 1);
      const b = data.readUInt8(index + 2);
      const luma = 0.3 * r + 0.59 * g + 0.11 * b;
      data[index] = Math.round(luma + (r - luma) * SATURATION);
      data[index + 1] = Math.round(luma + (g - luma) * SATURATION);
      data[index + 2] = Math.round(luma + (b - luma) * SATURATION);
    }
    texture.setImage(await sharp(data, { raw: info }).png().toBuffer()).setMimeType('image/png');
  }
  for (const material of root.listMaterials()) {
    material.getBaseColorTextureInfo()?.setMagFilter(NEAREST).setMinFilter(NEAREST);
  }
}
