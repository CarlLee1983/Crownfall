import {
  BoxGeometry,
  DataTexture,
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

it('draws the campaign terrain within its seven material batches', () => {
  const model = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const terrain = createTerrain(campaign, { entrance: model, castle: model });
  const ground = terrain.group.children.filter((object) => object instanceof Mesh);

  expect(ground.length).toBeGreaterThan(0);
  expect(ground.length).toBeLessThanOrEqual(7);
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

  const platform = visibleMaterial(new Vector3(25, 2, 7), new Vector3(0, -1, 0));
  const cliff = visibleMaterial(new Vector3(25, 0.3, 9), new Vector3(0, 0, -1));
  expect(cliff).not.toBe(platform);
});

function terrainSampler() {
  const model = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const { group } = createTerrain(campaign, { entrance: model, castle: model });
  const ground = group.children.filter((object) => object instanceof Mesh);
  const down = new Vector3(0, -1, 0);
  return (x: number, z: number) => {
    const hit = new Raycaster(new Vector3(x, 2, z), down).intersectObjects(ground, false)[0];
    const material = hit?.object instanceof Mesh ? hit.object.material : undefined;
    if (
      !(material instanceof MeshLambertMaterial) ||
      !(material.map instanceof DataTexture) ||
      hit?.uv === undefined
    ) {
      throw new Error('Expected a textured terrain surface');
    }
    const { data, width, height } = material.map.image;
    if (data === null) throw new Error('Expected terrain texture pixels');
    const { x: u, y: v } = material.map.transformUv(hit.uv);
    const offset = (Math.floor(v * height) * width + Math.floor(u * width)) * 4;
    return { material, shade: Number(data[offset]) };
  };
}

it('varies the stone and moss tile patterns and reproduces them on the next opening', () => {
  const first = terrainSampler();
  const next = terrainSampler();
  const tilePattern = (sample: typeof first, x: number, z: number) =>
    [-0.3, -0.15, 0, 0.15, 0.3].flatMap((dx) =>
      [-0.3, -0.15, 0, 0.15, 0.3].map((dz) => sample(x + dx, z + dz).shade),
    );

  for (const z of [0, 1]) {
    const patterns = [3, 4, 5, 6].map((x) => tilePattern(first, x, z));
    expect(new Set(patterns.map((pattern) => pattern.join(','))).size).toBeGreaterThan(1);
    expect([3, 4, 5, 6].map((x) => tilePattern(next, x, z))).toEqual(patterns);
  }
});

it('keeps a brighter border on every edge of the platform, moss and ramp tops', () => {
  const sample = terrainSampler();

  for (const [x, z] of [
    [4, 4],
    [3, 0],
    [2, 1],
  ] as const) {
    const inside = [-0.25, 0, 0.25].flatMap((dx) =>
      [-0.25, 0, 0.25].map((dz) => sample(x + dx, z + dz).shade),
    );
    const border = [-0.25, 0, 0.25].flatMap((along) => [
      sample(x - 0.42, z + along).shade,
      sample(x + 0.42, z + along).shade,
      sample(x + along, z - 0.42).shade,
      sample(x + along, z + 0.42).shade,
    ]);
    expect(Math.min(...border)).toBeGreaterThan(Math.max(...inside));
  }
});

it('draws the ramp with the same stone material as the low lane', () => {
  const sample = terrainSampler();
  expect(sample(2, 1).material).toBe(sample(3, 1).material);
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
