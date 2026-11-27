import { readFile } from 'node:fs/promises';
import { NodeIO, TextureInfo } from '@gltf-transform/core';
import sharp from 'sharp';
import { expect, it } from 'vitest';

it('ships an archer tower with a smaller, less saturated palette than the KayKit source', async () => {
  const binary = await readFile(new URL('./tower-archer.glb', import.meta.url));
  expect(binary.byteLength).toBeLessThanOrEqual(128 * 1024);
  const root = (await new NodeIO().readBinary(binary)).getRoot();
  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const vertices = primitive.getIndices() ?? primitive.getAttribute('POSITION');
      if (vertices === null) throw new Error('Archer tower primitive has no vertices');
      triangles += vertices.getCount() / 3;
    }
  }
  expect(triangles).toBeLessThanOrEqual(3000);
  const [material] = root.listMaterials();
  const texture = material?.getBaseColorTexture();
  const image = texture?.getImage();
  if (image === undefined || image === null) throw new Error('Missing archer tower palette');
  const pixels = await sharp(image).removeAlpha().raw().toBuffer();
  let saturation = 0;
  for (let index = 0; index < pixels.length; index += 3) {
    const [red = 0, green = 0, blue = 0] = pixels.subarray(index, index + 3);
    const high = Math.max(red, green, blue);
    if (high > 0) saturation += (high - Math.min(red, green, blue)) / high;
  }
  // Keep a margin from the pinned atlas mean so resizing alone cannot satisfy the check.
  expect(saturation / (pixels.length / 3)).toBeLessThan(0.482368 * 0.75);
  expect(texture?.getSize()).toEqual([128, 128]);
  expect(material?.getBaseColorTextureInfo()?.getMagFilter()).toBe(TextureInfo.MagFilter.NEAREST);
  expect(material?.getBaseColorTextureInfo()?.getMinFilter()).toBe(TextureInfo.MinFilter.NEAREST);
});
