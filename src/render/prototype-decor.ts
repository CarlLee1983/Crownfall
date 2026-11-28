// PROTOTYPE #106 (throwaway): environment decoration density variants, ?decor=a|b|c|d.
import {
  Box3,
  BoxGeometry,
  type BufferGeometry,
  Color,
  type Group as ThreeGroup,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { type CellIndex, cellAt, type GameState, type Level } from '../core';
import { WORLD_LAYER } from './layers';
import { LAYER_HEIGHT, terrainColor, terrainTexture } from './terrain';

export type DecorVariant = 'a' | 'b' | 'c' | 'd';
export const DECOR_VARIANT = (new URLSearchParams(location.search).get('decor') ?? 'a') as DecorVariant;

const urls = import.meta.glob('./models/prototype-decor/*.glb', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const KEYS = [
  'dungeon-barrier',
  'dungeon-barrier_half',
  'dungeon-rubble_half',
  'dungeon-wall_broken',
  'halloween-bone_A',
  'halloween-grave_A',
  'halloween-grave_B',
  'halloween-gravemarker_A',
  'halloween-gravemarker_B',
  'halloween-gravestone',
  'halloween-tree_dead_large',
  'halloween-tree_dead_medium',
  'halloween-tree_dead_small',
] as const;
type Key = (typeof KEYS)[number];
export type DecorModels = Readonly<Record<Key, Object3D>>;

export async function loadDecorModels(loader: GLTFLoader): Promise<DecorModels> {
  const entries = await Promise.all(
    KEYS.map(async (key) => {
      const url = urls[`./models/prototype-decor/${key}.glb`];
      if (url === undefined) throw new Error(`missing decor ${key}`);
      return [key, (await loader.loadAsync(url)).scene] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as DecorModels;
}

interface Part {
  readonly geometry: BufferGeometry;
  readonly material: Material;
}

/** Bake the node transforms and stand the model on y=0, centred on x/z. */
function partsOf(source: Object3D): Part[] {
  source.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(source, true);
  const center = bounds.getCenter(new Vector3());
  const shift = new Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z);
  const parts: Part[] = [];
  source.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld).applyMatrix4(shift);
    const material = (object.material as MeshStandardMaterial).clone();
    if (material.map !== null) {
      material.emissiveMap = material.map;
      material.emissive.setHex(0xffffff);
      material.emissiveIntensity = 0.4;
    }
    parts.push({ geometry, material });
  });
  return parts;
}

interface Item {
  readonly key: Key;
  readonly position: Vector3;
  readonly rotation: number;
  readonly scale: number;
  readonly tint: number;
  /** When set, the item disappears as soon as a tower stands on that cell. */
  readonly cell?: CellIndex;
  removed?: boolean;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RING = 3;
const RING_TOP = -0.12;

function pick<T>(random: () => number, table: readonly (readonly [T, number])[]): T {
  const total = table.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of table) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return table[0]![0];
}

// Native-unit scale per model so one KayKit unit is roughly 0.25 world units.
const SCALE: Record<Key, number> = {
  'dungeon-barrier': 0.25,
  'dungeon-barrier_half': 0.25,
  'dungeon-rubble_half': 0.1,
  'dungeon-wall_broken': 0.2,
  'halloween-bone_A': 0.25,
  'halloween-grave_A': 0.22,
  'halloween-grave_B': 0.22,
  'halloween-gravemarker_A': 0.25,
  'halloween-gravemarker_B': 0.25,
  'halloween-gravestone': 0.25,
  'halloween-tree_dead_large': 0.22,
  'halloween-tree_dead_medium': 0.22,
  'halloween-tree_dead_small': 0.25,
};

function buildItems(level: Level, variant: DecorVariant): Item[] {
  const items: Item[] = [];
  if (variant === 'a') return items;
  const random = rng(106);
  const cellAtXY = (x: number, y: number) =>
    x < 0 || y < 0 || x >= level.width || y >= level.height
      ? undefined
      : cellAt(level, (y * level.width + x) as CellIndex);

  // b: scattered on the off-grid ring. Near side (+x, +z faces the camera) stays low.
  for (let y = -RING; y < level.height + RING; y++) {
    for (let x = -RING; x < level.width + RING; x++) {
      if (cellAtXY(x, y) !== undefined) continue;
      const ring = Math.max(-x, x - (level.width - 1), -y, y - (level.height - 1));
      const near = x > level.width - 1 || y > level.height - 1;
      if (random() > (ring === 1 ? 0.4 : 0.5)) continue;
      const tint = 1.0 - 0.15 * (ring - 1);
      const key = near
        ? pick<Key>(random, [
            ['halloween-gravemarker_A', 3],
            ['halloween-gravemarker_B', 3],
            ['halloween-gravestone', 3],
            ['dungeon-rubble_half', 2],
            ['dungeon-barrier_half', 2],
            ['halloween-bone_A', 1],
          ])
        : pick<Key>(random, [
            ['halloween-tree_dead_small', 2],
            ['halloween-tree_dead_medium', 1.5],
            ['halloween-tree_dead_large', 1],
            ['halloween-gravestone', 3],
            ['halloween-grave_A', 1.5],
            ['halloween-grave_B', 1.5],
            ['halloween-gravemarker_A', 2],
            ['halloween-gravemarker_B', 2],
            ['dungeon-wall_broken', 1.5],
            ['dungeon-barrier_half', 1.5],
            ['dungeon-rubble_half', 1.5],
          ]);
      items.push({
        key,
        position: new Vector3(x + (random() - 0.5) * 0.6, RING_TOP, y + (random() - 0.5) * 0.6),
        rotation: random() * Math.PI * 2,
        scale: SCALE[key] * 1.25 * (0.85 + random() * 0.3),
        tint,
      });
    }
  }
  if (variant === 'b') return items;

  const DIRS = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const;
  // c: parapets on high-platform outward edges, small items at cliff feet.
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const cell = cellAtXY(x, y);
      if (cell === undefined || cell.ramp) continue;
      for (const [dx, dy] of DIRS) {
        const other = cellAtXY(x + dx, y + dy);
        if (cell.layer > 0 && (other === undefined || other.layer < cell.layer)) {
          // A ramp or a same-layer lane cell is a passage through this edge; a lane merely running below the cliff is not.
          if (other?.ramp || (cell.lane && other?.lane && other.layer === cell.layer)) continue;
          items.push({
            key: 'dungeon-barrier',
            position: new Vector3(x + dx * 0.4, cell.layer * LAYER_HEIGHT, y + dy * 0.4),
            rotation: dx !== 0 ? Math.PI / 2 : 0,
            scale: SCALE['dungeon-barrier'],
            tint: 0.9,
          });
        } else if (cell.layer === 0 && !cell.lane && other !== undefined && other.layer > 0) {
          if (random() > 0.45) continue;
          const key = pick<Key>(random, [
            ['halloween-gravemarker_A', 2],
            ['halloween-gravemarker_B', 2],
            ['dungeon-rubble_half', 2],
            ['halloween-bone_A', 1],
          ]);
          const along = (random() - 0.5) * 0.6;
          items.push({
            key,
            position: new Vector3(
              x + dx * 0.34 + (dx === 0 ? along : 0),
              0,
              y + dy * 0.34 + (dy === 0 ? along : 0),
            ),
            rotation: random() * Math.PI * 2,
            scale: SCALE[key] * 0.8,
            tint: 0.85,
          });
        }
      }
    }
  }
  if (variant === 'c') return items;

  // d: ~10% of buildable low moss cells, pushed to the side away from the nearest lane.
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const cell = cellAtXY(x, y);
      const index = (y * level.width + x) as CellIndex;
      if (cell === undefined || cell.layer > 0 || cell.lane) continue;
      if (random() > 0.1) continue;
      let ox = 0;
      let oy = 0;
      for (const [dx, dy] of DIRS) {
        if (cellAtXY(x + dx, y + dy)?.lane) {
          ox -= dx * 0.28;
          oy -= dy * 0.28;
        }
      }
      const key = pick<Key>(random, [
        ['halloween-gravemarker_A', 2],
        ['halloween-gravemarker_B', 2],
        ['dungeon-rubble_half', 2],
        ['halloween-bone_A', 1],
      ]);
      items.push({
        key,
        position: new Vector3(x + ox, 0, y + oy),
        rotation: random() * Math.PI * 2,
        scale: SCALE[key] * 0.85,
        tint: 0.9,
        cell: index,
      });
    }
  }
  return items;
}

export function createDecor(level: Level, models: DecorModels, variant: DecorVariant) {
  const group: ThreeGroup = new Group();
  const items = buildItems(level, variant);
  let triangles = 0;
  const removable = new Map<CellIndex, { item: Item; refresh: () => void }>();

  const noRaycast = () => {};
  if (variant !== 'a') {
    // Ring ground: one instanced mesh of dark moss boxes, darker the further out.
    const cells: { x: number; y: number; ring: number }[] = [];
    for (let y = -RING; y < level.height + RING; y++) {
      for (let x = -RING; x < level.width + RING; x++) {
        if (x >= 0 && y >= 0 && x < level.width && y < level.height) continue;
        const ring = Math.max(-x, x - (level.width - 1), -y, y - (level.height - 1));
        cells.push({ x, y, ring });
      }
    }
    const ground = new InstancedMesh(
      new BoxGeometry(1, LAYER_HEIGHT, 1),
      new MeshLambertMaterial({ color: terrainColor(0x8fb070), map: terrainTexture(true, false) }),
      cells.length,
    );
    const matrix = new Matrix4();
    cells.forEach(({ x, y, ring }, i) => {
      ground.setMatrixAt(i, matrix.makeTranslation(x, RING_TOP - LAYER_HEIGHT / 2, y));
      ground.setColorAt(i, new Color().setScalar(0.8 - 0.15 * (ring - 1)));
    });
    ground.frustumCulled = false;
    ground.raycast = noRaycast;
    group.add(ground);
  }

  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const m = new Matrix4();
  for (const key of KEYS) {
    const mine = items.filter((item) => item.key === key);
    if (mine.length === 0) continue;
    for (const part of partsOf(models[key])) {
      const mesh = new InstancedMesh(part.geometry, part.material, mine.length);
      const refresh = () => {
        mine.forEach((item, i) => {
          const s = item.removed ? 0 : item.scale;
          m.compose(item.position, q.setFromAxisAngle(up, item.rotation), new Vector3(s, s, s));
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, new Color().setScalar(item.tint));
        });
        mesh.instanceMatrix.needsUpdate = true;
      };
      refresh();
      mesh.frustumCulled = false;
      mesh.raycast = noRaycast;
      mesh.layers.set(WORLD_LAYER);
      group.add(mesh);
      const perInstance = (part.geometry.index?.count ?? 0) / 3;
      triangles += perInstance * mine.length;
      for (const item of mine) {
        if (item.cell === undefined) continue;
        const previous = removable.get(item.cell);
        const prevRefresh = previous?.refresh;
        removable.set(item.cell, {
          item,
          refresh: () => {
            prevRefresh?.();
            refresh();
          },
        });
      }
    }
  }
  group.traverse((o) => o.layers.set(WORLD_LAYER));

  const update = (state: GameState): void => {
    for (const tower of state.towers) {
      const entry = removable.get(tower.cell);
      if (entry === undefined || entry.item.removed) continue;
      entry.item.removed = true;
      entry.refresh();
    }
  };
  const perKey: Record<string, number> = {};
  for (const item of items) perKey[item.key] = (perKey[item.key] ?? 0) + 1;
  const stats = {
    variant,
    objects: items.length,
    triangles,
    perKey,
    removableCells: [...removable.keys()],
    removed: () => items.filter((item) => item.removed).length,
  };
  return { group, update, stats };
}
