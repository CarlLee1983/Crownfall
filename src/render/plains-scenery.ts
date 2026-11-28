import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
} from 'three';
import { castleTrees, entranceRocks } from '../content/decor';
import { type CellIndex, cellPoint, type Level } from '../core';
import { neighbors, PLATFORM_HALF_WIDTH } from '../core/level';
import { createDecorInstances, type DecorPlacement } from './decor-instances';

export function createPlainsScenery(level: Level): Group {
  const group = new Group();
  const add = (geometry: BufferGeometry, color: number, placements: readonly DecorPlacement[]) => {
    // The foliage should read against the dark ground at the default overview.
    const material = new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.42 });
    group.add(createDecorInstances(new Mesh(geometry, material), placements));
  };

  const trees = castleTrees.map(({ x, y: z, scale }) => ({ x, z, y: 0, scale, rotation: x + z }));
  add(new BoxGeometry(0.23, 1.25, 0.23), 0x6e5938, trees);
  add(
    new IcosahedronGeometry(1).scale(0.73, 0.84, 0.77),
    0x648847,
    trees.map((tree) => ({ ...tree, y: tree.scale * 0.8 })),
  );
  add(
    new DodecahedronGeometry(1).scale(1, 0.57, 0.85),
    0x8a947d,
    entranceRocks.map(({ x, y: z, scale }) => ({ x, z, y: 0, scale, rotation: x + z })),
  );

  const grass: DecorPlacement[] = [];
  const platforms = level.cells.flatMap((cell, index) =>
    cell.platform ? [cellPoint(level, index as CellIndex)] : [],
  );
  for (const [index, cell] of level.cells.entries()) {
    if (cell.lane || cell.layer !== 0 || index % 7 !== 0) continue;
    const { x, y: z } = cellPoint(level, index as CellIndex);
    if (!neighbors(level, index as CellIndex).some(({ index }) => level.cells[index]?.lane))
      continue;
    if (
      platforms.some(
        (point) =>
          Math.max(Math.abs(point.x - x), Math.abs(point.y - z)) <= PLATFORM_HALF_WIDTH + 0.3,
      )
    ) {
      continue;
    }
    for (const offset of [-0.16, 0, 0.16]) {
      grass.push({ x: x + offset, y: 0, z: z + offset * 0.4, scale: 1, rotation: x + z });
    }
  }
  add(new ConeGeometry(0.09, 0.43, 3), 0x869656, grass);
  return group;
}
