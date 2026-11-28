import { BoxGeometry, Mesh, MeshLambertMaterial, MeshStandardMaterial, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { level as campaign } from '../content/level';
import { parseLevel } from '../core';
import { createCamera } from './camera';
import { createTerrain } from './terrain';

it('keeps the entrance and a tall castle entirely in the default overview', () => {
  const entrance = new Mesh(new BoxGeometry(1, 1, 1));
  const castle = new Mesh(new BoxGeometry(1, 2, 1));
  entrance.name = 'entrance';
  castle.name = 'castle';
  const terrain = createTerrain(campaign, { entrance, castle });
  const overview = createCamera(campaign, terrain.landmarks);
  for (const aspect of [1280 / 800, 1920 / 1080]) {
    overview.resize(aspect);
    for (const name of ['castle', 'entrance']) {
      const landmark = terrain.group.getObjectByName(name);
      if (!(landmark instanceof Mesh)) throw new Error('Missing landmark');
      const positions = landmark.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        const projected = landmark
          .localToWorld(new Vector3().fromBufferAttribute(positions, index))
          .project(overview.camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
      }
    }
  }
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
