import { readFile } from 'node:fs/promises';
import { NodeIO, TextureInfo } from '@gltf-transform/core';
import { expect, it } from 'vitest';

it('ships a compact, self-contained skeleton with only its walk animation', async () => {
  const binary = await readFile(new URL('./enemy-skeleton.glb', import.meta.url));
  expect(binary.byteLength).toBeLessThanOrEqual(375 * 1024);
  const root = (await new NodeIO().readBinary(binary)).getRoot();
  expect(root.listAnimations().map((animation) => animation.getName())).toEqual(['Walking_A']);
  expect(root.listSkins()).not.toHaveLength(0);
  const primitiveCount = root
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((count, primitive) => {
      const vertices = primitive.getIndices() ?? primitive.getAttribute('POSITION');
      if (vertices === null) throw new Error('Skeleton primitive has no vertices');
      return count + vertices.getCount() / 3;
    }, 0);
  expect(primitiveCount).toBeLessThanOrEqual(5500);
  const textures = root.listTextures();
  expect(textures).not.toHaveLength(0);
  for (const texture of textures) {
    const [width, height] = texture.getSize() ?? [Infinity, Infinity];
    expect(Math.max(width, height)).toBeLessThanOrEqual(128);
  }
  for (const material of root.listMaterials()) {
    const sampler = material.getBaseColorTextureInfo();
    if (sampler === null) continue;
    expect(sampler.getMagFilter()).toBe(TextureInfo.MagFilter.NEAREST);
    expect(sampler.getMinFilter()).toBe(TextureInfo.MinFilter.NEAREST);
  }
});
