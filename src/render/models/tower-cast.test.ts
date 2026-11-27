import { readFile } from 'node:fs/promises';
import { getBounds, NodeIO, TextureInfo } from '@gltf-transform/core';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { countModelTriangles } from './model-triangles';

it.each([
  ['tower-archer', 'building_tower_A_blue'],
  ['tower-ballista', 'building_tower_B_blue'],
  ['tower-mage', 'building_church_blue'],
])('ships %s as a small, muted KayKit model', async (asset, building) => {
  const binary = await readFile(new URL(`./${asset}.glb`, import.meta.url));
  expect(binary.byteLength).toBeLessThanOrEqual(128 * 1024);
  const root = (await new NodeIO().readBinary(binary)).getRoot();
  expect(root.listNodes().map((node) => node.getName())).toContain(building);
  expect(countModelTriangles(root)).toBeLessThanOrEqual(3000);
  const material = root.listMaterials().find((candidate) => candidate.getBaseColorTexture());
  const texture = material?.getBaseColorTexture();
  const image = texture?.getImage();
  if (image === undefined || image === null) throw new Error('Missing tower palette');
  const pixels = await sharp(image).removeAlpha().raw().toBuffer();
  let saturation = 0;
  for (let index = 0; index < pixels.length; index += 3) {
    const [red = 0, green = 0, blue = 0] = pixels.subarray(index, index + 3);
    const high = Math.max(red, green, blue);
    if (high > 0) saturation += (high - Math.min(red, green, blue)) / high;
  }
  // Pinned Hexagon atlas mean is 0.482368 before grading.
  expect(saturation / (pixels.length / 3)).toBeLessThan(0.482368 * 0.75);
  expect(texture?.getSize()).toEqual([128, 128]);
  expect(material?.getBaseColorTextureInfo()?.getMagFilter()).toBe(TextureInfo.MagFilter.NEAREST);
  expect(material?.getBaseColorTextureInfo()?.getMinFilter()).toBe(TextureInfo.MinFilter.NEAREST);
});

it('mounts a widened crossbow above the ballista platform', async () => {
  const binary = await readFile(new URL('./tower-ballista.glb', import.meta.url));
  const root = (await new NodeIO().readBinary(binary)).getRoot();
  const crossbow = root.listNodes().find((node) => node.getName() === 'Skeleton_Crossbow');
  if (crossbow === undefined) throw new Error('Missing ballista crossbow');
  const bounds = getBounds(crossbow);
  expect(bounds.max[0] - bounds.min[0]).toBeGreaterThan(1.2);
  expect(bounds.max[1]).toBeGreaterThan(1.8);
});

it('adds an emissive crystal above the mage tower spire', async () => {
  const binary = await readFile(new URL('./tower-mage.glb', import.meta.url));
  const root = (await new NodeIO().readBinary(binary)).getRoot();
  const spire = root.listNodes().find((node) => node.getName() === 'building_church_blue');
  const crystal = root.listNodes().find((node) => node.getName() === 'Crystal');
  if (spire === undefined || crystal === undefined) throw new Error('Missing mage tower spire');
  expect(getBounds(crystal).max[1] - getBounds(spire).max[1]).toBeGreaterThan(0.45);
  const material = crystal.getMesh()?.listPrimitives()[0]?.getMaterial();
  const [red = 0, green = 0, blue = 0] = material?.getEmissiveFactor() ?? [];
  expect(red).toBeGreaterThan(green);
  expect(blue).toBeGreaterThan(red);
});
