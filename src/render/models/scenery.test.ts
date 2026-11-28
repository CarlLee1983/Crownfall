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

it.each([
  [
    'decor-gravestone',
    'KayKit-Halloween-Bits-1.0',
    '6dc69bf6b2fa766a985754f35ec6a0324090e6c6',
    300,
  ],
  [
    'decor-gravemarker',
    'KayKit-Halloween-Bits-1.0',
    '6dc69bf6b2fa766a985754f35ec6a0324090e6c6',
    120,
  ],
  [
    'decor-rubble',
    'KayKit-Dungeon-Remastered-1.0',
    'b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07',
    500,
  ],
  [
    'decor-broken-wall',
    'KayKit-Dungeon-Remastered-1.0',
    'b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07',
    900,
  ],
])(
  '%s records its pinned CC0 source and meets its triangle budget',
  async (id, repo, commit, max) => {
    const asset = manifest.assets.find((asset) => asset.id === id);
    expect(asset?.source).toMatchObject({
      url_or_tool: `https://github.com/KayKit-Game-Assets/${repo}`,
      commit,
      license: 'CC0-1.0',
    });
    if (asset === undefined) throw new Error(`Missing asset: ${id}`);
    expect(asset.technical).toMatchObject({ max_triangles: max });
    expect(asset.source.prompt_or_source_record).toMatch(/\.gltf(?:\.glb)?$/);
    const root = (await new NodeIO().read(asset.path)).getRoot();
    expect(root.listMeshes()).toHaveLength(1);
    const triangles = countModelTriangles(root);
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(max);
  },
);
