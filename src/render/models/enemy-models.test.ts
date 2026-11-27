import { readFile } from 'node:fs/promises';
import { NodeIO, TextureInfo } from '@gltf-transform/core';
import sharp from 'sharp';
import { expect, it } from 'vitest';

const loadouts = [
  { id: 'enemy-skeleton', maxKiB: 375, equipment: [] },
  {
    id: 'enemy-ghoul',
    maxKiB: 375,
    equipment: [
      ['Skeleton_Blade', 'handslot.l', 'hand.l'],
      ['Skeleton_Blade', 'handslot.r', 'hand.r'],
    ],
  },
  {
    id: 'enemy-skeleton-knight',
    maxKiB: 400,
    equipment: [
      ['Skeleton_Blade', 'handslot.r', 'hand.r'],
      ['Skeleton_Shield_Large_A', 'handslot.l', 'hand.l'],
    ],
  },
  {
    id: 'enemy-lich',
    maxKiB: 375,
    equipment: [['Skeleton_Staff', 'handslot.r', 'hand.r']],
  },
];

it.each(loadouts)(
  'ships $id with its walk animation and equipped hands within budget',
  async ({ id, maxKiB, equipment }) => {
    const binary = await readFile(new URL(`./${id}.glb`, import.meta.url));
    expect(binary.byteLength).toBeLessThanOrEqual(maxKiB * 1024);
    const root = (await new NodeIO().readBinary(binary)).getRoot();
    expect(root.listAnimations().map((animation) => animation.getName())).toEqual(['Walking_A']);
    expect(root.listSkins()).not.toHaveLength(0);
    const joints = new Set(root.listSkins().flatMap((skin) => skin.listJoints()));
    const equippedNodes = root
      .listNodes()
      .filter((node) => /^Skeleton_(Blade|Shield|Staff)/.test(node.getName()));
    expect(equippedNodes).toHaveLength(equipment.length);
    for (const [name, slotName, handName] of equipment) {
      const attachment = equippedNodes.find(
        (node) => node.getName() === name && node.getParentNode()?.getName() === slotName,
      );
      expect(attachment?.getMesh()).toBeTruthy();
      const hand = attachment?.getParentNode()?.getParentNode();
      expect(hand?.getName()).toBe(handName);
      expect(hand && joints.has(hand)).toBe(true);
    }

    // Count mesh instances so both blades count against the triangle limit.
    const primitiveCount = root
      .listNodes()
      .flatMap((node) => node.getMesh()?.listPrimitives() ?? [])
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
      if (equipment.length > 0) {
        const emission = material.getEmissiveTexture();
        expect(emission).not.toBe(material.getBaseColorTexture());
        const image = emission?.getImage();
        if (image == null) throw new Error('Equipped enemy has no embedded glow atlas');
        const stats = await sharp(image).stats();
        expect(stats.channels[0]?.min).toBeGreaterThanOrEqual(180);
      }
    }
  },
);
