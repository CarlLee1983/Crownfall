import { BoxGeometry, Mesh, MeshLambertMaterial, MeshStandardMaterial } from 'three';
import { expect, it } from 'vitest';
import { level as campaignLevel } from '../content/level';
import { parseLevel } from '../core';
import { createTerrain } from './terrain';

it('draws the campaign terrain with at most a dozen meshes', () => {
  const model = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const terrain = createTerrain(campaignLevel, { entrance: model, castle: model });
  const ground = terrain.group.children.filter((object) => object instanceof Mesh);

  expect(ground.length).toBeGreaterThan(0);
  expect(ground.length).toBeLessThanOrEqual(12);
});

it('lights only the castle model red after a leak and restores it when the flash ends', () => {
  const level = parseLevel(['S=G']);
  const modelMaterial = new MeshStandardMaterial({
    emissive: 0x221144,
    emissiveIntensity: 0.2,
  });
  const entrance = new Mesh(new BoxGeometry(1, 1, 1), modelMaterial);
  const castle = new Mesh(new BoxGeometry(1, 1, 1), modelMaterial);
  entrance.name = 'gate';
  castle.name = 'castle';
  const terrain = createTerrain(level, { entrance, castle });
  const ground = terrain.group.children.filter(
    (object): object is Mesh<BoxGeometry, MeshLambertMaterial> =>
      object instanceof Mesh && object.material instanceof MeshLambertMaterial,
  );
  const groundAppearance = () =>
    ground.map(({ material }) => [
      material.color.getHex(),
      material.emissive.getHex(),
      material.emissiveIntensity,
    ]);
  const before = groundAppearance();

  terrain.setCastleFlash(1);

  expect(ground).toHaveLength(3);
  expect(groundAppearance()).toEqual(before);
  const displayedCastle = terrain.group.getObjectByName('castle');
  const displayedGate = terrain.group.getObjectByName('gate');
  if (!(displayedCastle instanceof Mesh) || !(displayedGate instanceof Mesh)) {
    throw new Error('Scene is missing its castle or gate');
  }
  expect(displayedCastle.material.emissive.getHex()).toBe(0xff263d);
  expect(displayedCastle.material.emissiveIntensity).toBeGreaterThan(0.2);
  expect(displayedGate.material.emissive.getHex()).toBe(0x221144);
  expect(modelMaterial.emissive.getHex()).toBe(0x221144);

  terrain.setCastleFlash(0);

  expect(displayedCastle.material.emissive.getHex()).toBe(0x221144);
  expect(displayedCastle.material.emissiveIntensity).toBe(0.2);
});
