import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  DataTexture,
  Group,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  type Object3D,
  SRGBColorSpace,
} from 'three';
import { type CellIndex, cellAt, cellPoint, type Level, rampDirection } from '../core';
import { neighbors } from '../core/level';
import { WORLD_LAYER } from './layers';
import { placeableScenery } from './scenery-model';

/** 一個高度層在世界座標中的高度。 */
export const LAYER_HEIGHT = 0.6;

const COLOURS = {
  low: 0x8fb070,
  high: 0xabaeba,
  laneLow: 0xc0b1a0,
  laneHigh: 0x9194a3,
  spawn: 0xad6158,
  goal: 0x648bb4,
} as const;

type Palette = keyof typeof COLOURS;

export function terrainColor(hex: number): Color {
  const color = new Color(hex);
  const { h, s, l } = color.getHSL({ h: 0, s: 0, l: 0 });
  return color.setHSL(h, s * 0.35, l * 0.85);
}

export function terrainTexture(moss: boolean, rim = true): DataTexture {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = (x * 23 + y * 41 + x * y * 11) % 29;
      const offset = (y * size + x) * 4;
      // PROTOTYPE #102 approximation: bright one-texel rim on top faces.
      if (rim && (x === 0 || y === 0 || x === size - 1 || y === size - 1)) {
        pixels.set(moss ? [236, 244, 214, 255] : [250, 250, 250, 255], offset);
        continue;
      }
      if (moss) {
        const patch = (Math.floor(x / 3) * 13 + Math.floor(y / 3) * 7) % 19;
        const shade = (patch < 9 ? 158 : 193) + grain;
        pixels.set([shade, shade + 11, shade - 21, 255], offset);
      } else {
        const mortar = y % 8 === 0 || (x + Math.floor(y / 8) * 4) % 8 === 0;
        const shade = (mortar ? 148 : 203) + grain;
        pixels.set([shade, shade, shade, 255], offset);
      }
    }
  }
  const texture = new DataTexture(pixels, size, size);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function paletteOf(level: Level, index: CellIndex): Palette {
  const cell = cellAt(level, index);
  if (index === level.spawn) return 'spawn';
  if (index === level.goal) return 'goal';
  if (cell.lane) return cell.layer > 0 ? 'laneHigh' : 'laneLow';
  return cell.layer > 0 ? 'high' : 'low';
}

/** 坡道楔形：上表面的頂點依沿上升方向的位置，從 0 線性升到一層高。 */
function rampGeometry(dx: number, dy: number): BufferGeometry {
  const geometry = new BoxGeometry(1, LAYER_HEIGHT, 1);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) <= 0) continue;
    const along = position.getX(i) * dx + position.getZ(i) * dy;
    position.setY(i, (along + 0.5) * LAYER_HEIGHT - LAYER_HEIGHT / 2);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createTerrain(
  level: Level,
  models: { readonly entrance: Object3D; readonly castle: Object3D },
) {
  const group = new Group();
  const stone = terrainTexture(false);
  const moss = terrainTexture(true);
  const materials = Object.fromEntries(
    Object.entries(COLOURS).map(([name, hex]) => [
      name,
      new MeshLambertMaterial({ color: terrainColor(hex), map: name === 'low' ? moss : stone }),
    ]),
  ) as Record<Palette, MeshLambertMaterial>;
  // PROTOTYPE #102 approximation: dedicated, brighter cliff face material.
  const cliffTexture = terrainTexture(false, false);
  const cliff = new MeshLambertMaterial({ color: terrainColor(0x8a8f9c), map: cliffTexture });

  for (let i = 0; i < level.cells.length; i++) {
    const index = i as CellIndex;
    const { x, y } = cellPoint(level, index);
    const cell = cellAt(level, index);
    const direction = rampDirection(level, index);
    const top = cell.layer * LAYER_HEIGHT;

    let mesh: Mesh;
    if (direction !== undefined) {
      mesh = new Mesh(rampGeometry(direction.dx, direction.dy), materials.laneLow);
      mesh.position.set(x, LAYER_HEIGHT / 2, y);
    } else {
      // 地表至少厚一層，平地才不會是零厚度的面。
      const thickness = Math.max(top, LAYER_HEIGHT);
      const topMaterial = materials[paletteOf(level, index)];
      mesh = new Mesh(new BoxGeometry(1, thickness, 1), [
        cliff, cliff, topMaterial, topMaterial, cliff, cliff,
      ]);
      mesh.position.set(x, top - thickness / 2, y);
    }
    mesh.layers.set(WORLD_LAYER);
    group.add(mesh);
  }
  const entrance = placeableScenery(models.entrance, 1, 0.24).group;
  const castle = placeableScenery(models.castle, 0.9, 0.32);
  for (const [index, model] of [
    [level.spawn, entrance],
    [level.goal, castle.group],
  ] as const) {
    const { x, y } = cellPoint(level, index);
    model.position.set(x, cellAt(level, index).layer * LAYER_HEIGHT, y);
    const lane = neighbors(level, index).find(({ index }) => cellAt(level, index).lane);
    if (lane !== undefined) {
      const { dx, dy } = lane.direction;
      model.rotation.y = Math.atan2(dx, dy);
      if (index === level.spawn) {
        // Keep the first enemy and the door passage on opposite sides of the gate's lintel.
        model.position.x -= dx * 0.33;
        model.position.z -= dy * 0.33;
      }
    }
    group.add(model);
  }

  const castleMaterials = castle.materials.map((material) => ({
    material,
    emissive: material.emissive.clone(),
    intensity: material.emissiveIntensity,
  }));
  const castleRed = new Color(0xff263d);
  const setCastleFlash = (amount: number): void => {
    for (const { material, emissive, intensity } of castleMaterials) {
      material.emissive.copy(emissive).lerp(castleRed, amount);
      material.emissiveIntensity = intensity * (1 - amount) + 1.3 * amount;
    }
  };

  return { group, setCastleFlash };
}
