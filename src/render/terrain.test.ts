import {
  BoxGeometry,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
} from 'three';
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

it('draws the campaign terrain with at most a dozen meshes', () => {
  const model = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const terrain = createTerrain(campaign, { entrance: model, castle: model });
  const ground = terrain.group.children.filter((object) => object instanceof Mesh);

  expect(ground.length).toBeGreaterThan(0);
  expect(ground.length).toBeLessThanOrEqual(12);
});

it('draws a platform top and its cliff face with different materials', () => {
  const model = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const terrain = createTerrain(campaign, { entrance: model, castle: model });
  const ground = terrain.group.children.filter((object) => object instanceof Mesh);
  const visibleMaterial = (origin: Vector3, direction: Vector3) => {
    const hit = new Raycaster(origin, direction).intersectObjects(ground, false)[0];
    if (hit === undefined || !(hit.object instanceof Mesh)) {
      throw new Error('Expected the terrain to cover this point');
    }
    return hit.object.material;
  };

  const platform = visibleMaterial(new Vector3(4, 2, 4), new Vector3(0, -1, 0));
  const cliff = visibleMaterial(new Vector3(4, 0.3, 5), new Vector3(0, 0, -1));
  expect(cliff).not.toBe(platform);
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
  expect(before.length).toBeGreaterThan(0);

  terrain.setCastleFlash(1);

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
