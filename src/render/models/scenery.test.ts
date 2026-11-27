import { NodeIO } from '@gltf-transform/core';
import { expect, it } from 'vitest';
import manifest from '../../../docs/art/asset-manifest.json';
import { countModelTriangles } from './model-triangles';

const scenery = manifest.assets.filter(({ id }) => id.startsWith('prop-'));

it.each(scenery)(
  '$id ships with a licensed source and stays within the scenery budget',
  async ({ path, source }) => {
    expect(source.url_or_tool).toMatch(/^https:\/\/github.com\/KayKit-Game-Assets\//);
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(source.creator).toBe('Kay Lousberg');
    expect(source.license).toBe('CC0-1.0');
    expect(source.prompt_or_source_record).toMatch(/\.gltf(?:\.glb)?$/);

    const root = (await new NodeIO().read(path)).getRoot();
    expect(root.listTextures()).not.toHaveLength(0);
    for (const texture of root.listTextures()) {
      const size = texture.getSize();
      expect(size?.[0]).toBeLessThanOrEqual(128);
      expect(size?.[1]).toBeLessThanOrEqual(128);
    }
    for (const material of root.listMaterials()) {
      const sampler = material.getBaseColorTextureInfo();
      expect(sampler?.getMinFilter()).toBe(9728);
      expect(sampler?.getMagFilter()).toBe(9728);
    }
    const triangles = countModelTriangles(root);
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(1500);
  },
);
