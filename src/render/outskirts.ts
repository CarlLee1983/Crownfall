import {
  BufferGeometry,
  type Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three';
import { type CellIndex, cellPoint, type Level } from '../core';
import { cellIndex } from '../core/level';
import { createDecorInstances, type DecorPlacement } from './decor-instances';
import { WORLD_LAYER } from './layers';
import { LAYER_HEIGHT } from './terrain';

const WIDTH = 3;
const GROUND_HEIGHT = -0.18;
const SEED = 106;

export interface OutskirtsModels {
  readonly barrier: Object3D;
  readonly gravestone: Object3D;
  readonly gravemarker: Object3D;
  readonly rubble: Object3D;
  readonly brokenWall: Object3D;
}

function cemeteryGround(level: Level, backdrop: Color): Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const grass = backdrop.clone().setHex(0x49583c);
  // A fitted strip shares the playable outline. Its outer edge matches the world clear color.
  for (const distance of [0, WIDTH]) {
    const left = -0.5 - distance;
    const right = level.width - 0.5 + distance;
    const back = -0.5 - distance;
    const front = level.height - 0.5 + distance;
    const color = grass.clone().lerp(backdrop, distance / WIDTH);
    positions.push(
      left,
      GROUND_HEIGHT,
      back,
      left,
      GROUND_HEIGHT,
      front,
      right,
      GROUND_HEIGHT,
      front,
      right,
      GROUND_HEIGHT,
      back,
    );
    for (let i = 0; i < 4; i++) colors.push(color.r, color.g, color.b);
  }
  for (let a = 0; a < 4; a++) {
    const b = (a + 1) % 4;
    indices.push(a, a + 4, b + 4, a, b + 4, b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const ground = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }));
  ground.layers.set(WORLD_LAYER);
  ground.raycast = () => {};
  return ground;
}

function cliffPlacements(level: Level) {
  const parapets: DecorPlacement[] = [];
  const feet: DecorPlacement[] = [];
  const edges = [
    [0, -1],
    [-1, 0],
    [0, 1],
    [1, 0],
  ] as const;
  for (const [index, cell] of level.cells.entries()) {
    if (cell.layer === 0 || cell.ramp) continue;
    const { x, y } = cellPoint(level, index as CellIndex);
    for (const [dx, dz] of edges) {
      const nextX = x + dx;
      const nextZ = y + dz;
      const inside = nextX >= 0 && nextX < level.width && nextZ >= 0 && nextZ < level.height;
      const neighbor = inside ? level.cells[cellIndex(level.width, nextX, nextZ)] : undefined;
      if (neighbor?.ramp || (neighbor?.layer ?? 0) >= cell.layer) continue;
      const edge = {
        x: x + dx / 2,
        z: y + dz / 2,
        rotation: dx === 0 ? 0 : Math.PI / 2,
      };
      // The camera looks from +X/+Z. Those sides stay open above the cliff.
      if (dx < 0 || dz < 0) {
        parapets.push({ ...edge, y: cell.layer * LAYER_HEIGHT - 0.01, scale: 0.22 });
      } else if (neighbor !== undefined && (dx === 0 ? x : y) % 2 === 0) {
        // Nestle little piles into the face every other tile, away from the low tile center.
        feet.push({ ...edge, y: neighbor.layer * LAYER_HEIGHT - 0.03, scale: 0.043 });
      }
    }
  }
  return { parapets, feet };
}

export function createOutskirts(level: Level, models: OutskirtsModels, backdrop: Color): Group {
  const group = new Group();
  const cemetery = new Group();
  cemetery.name = 'cemetery';
  cemetery.add(cemeteryGround(level, backdrop));
  group.add(cemetery);
  const placements: Record<Exclude<keyof OutskirtsModels, 'barrier'>, DecorPlacement[]> = {
    gravestone: [],
    gravemarker: [],
    rubble: [],
    brokenWall: [],
  };
  let seed = SEED;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const far = ['gravestone', 'brokenWall', 'gravemarker', 'rubble'] as const;
  const near = ['gravemarker', 'rubble'] as const;
  const scaleByModel = { gravestone: 0.21, brokenWall: 0.082, gravemarker: 0.12, rubble: 0.041 };

  for (let z = -WIDTH; z < level.height + WIDTH; z++) {
    for (let x = -WIDTH; x < level.width + WIDTH; x++) {
      const distance = Math.max(-x, -z, x - level.width + 1, z - level.height + 1);
      if (distance <= 0 || random() >= 0.5 - distance * 0.1) continue;
      const isNear = x >= level.width || z >= level.height;
      const choices = isNear ? near : far;
      const kind = choices[Math.floor(random() * choices.length)] ?? 'rubble';
      // Near-side stones stay entirely below the playable surface so they cannot cover enemies.
      placements[kind].push({
        x: x + (random() - 0.5) * 0.42,
        y: GROUND_HEIGHT,
        z: z + (random() - 0.5) * 0.42,
        scale: scaleByModel[kind] * (0.9 + random() * 0.2),
        rotation: random() * Math.PI * 2,
      });
    }
  }
  const { parapets, feet } = cliffPlacements(level);
  placements.rubble.push(...feet);
  for (const kind of ['gravestone', 'gravemarker', 'rubble', 'brokenWall'] as const) {
    if (placements[kind].length > 0) {
      const batch = createDecorInstances(models[kind], placements[kind]);
      batch.name = kind;
      cemetery.add(batch);
    }
  }
  if (parapets.length > 0) {
    const batch = createDecorInstances(models.barrier, parapets);
    batch.name = 'parapets';
    group.add(batch);
  }
  return group;
}
