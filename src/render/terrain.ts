import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  DataTexture,
  Group,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  SRGBColorSpace,
} from 'three';
import { type CellIndex, cellAt, cellPoint, type Level, rampDirection } from '../core';
import { WORLD_LAYER } from './layers';

/** 一個高度層在世界座標中的高度。 */
export const LAYER_HEIGHT = 0.6;

const COLOURS = {
  low: 0x5f774a,
  high: 0xabaeba,
  laneLow: 0x878997,
  laneHigh: 0x9194a3,
  spawn: 0xad6158,
  goal: 0x648bb4,
} as const;

type Palette = keyof typeof COLOURS;

function terrainColor(hex: number): Color {
  const color = new Color(hex);
  const { h, s, l } = color.getHSL({ h: 0, s: 0, l: 0 });
  return color.setHSL(h, s * 0.35, l * 0.85);
}

function terrainTexture(moss: boolean): DataTexture {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = (x * 23 + y * 41 + x * y * 11) % 29;
      const offset = (y * size + x) * 4;
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

export function createTerrain(level: Level) {
  const group = new Group();
  const stone = terrainTexture(false);
  const moss = terrainTexture(true);
  const materials = Object.fromEntries(
    Object.entries(COLOURS).map(([name, hex]) => [
      name,
      new MeshLambertMaterial({ color: terrainColor(hex), map: name === 'low' ? moss : stone }),
    ]),
  ) as Record<Palette, MeshLambertMaterial>;

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
      mesh = new Mesh(new BoxGeometry(1, thickness, 1), materials[paletteOf(level, index)]);
      mesh.position.set(x, top - thickness / 2, y);
    }
    mesh.layers.set(WORLD_LAYER);
    group.add(mesh);
  }
  const castleColor = materials.goal.color.clone();
  const castleRed = new Color(0xff263d);
  const setCastleFlash = (amount: number): void => {
    materials.goal.color.copy(castleColor).lerp(castleRed, amount);
    materials.goal.emissive.copy(castleRed);
    materials.goal.emissiveIntensity = amount * 0.5;
  };

  return { group, setCastleFlash };
}
