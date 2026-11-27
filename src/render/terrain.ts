import { BoxGeometry, type BufferGeometry, Color, Group, Mesh, MeshLambertMaterial } from 'three';
import { type CellIndex, cellAt, cellPoint, type Level, rampDirection } from '../core';
import { WORLD_LAYER } from './layers';

/** 一個高度層在世界座標中的高度。 */
export const LAYER_HEIGHT = 0.6;

const COLOURS = {
  low: 0x5f8a4b,
  high: 0x8c7a5a,
  laneLow: 0xc9b27c,
  laneHigh: 0xe0cf9a,
  spawn: 0xd9534f,
  goal: 0x4f8fd9,
} as const;

type Palette = keyof typeof COLOURS;

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
  const materials = Object.fromEntries(
    Object.entries(COLOURS).map(([name, color]) => [name, new MeshLambertMaterial({ color })]),
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
  const castleRed = new Color(0xff263d);
  const setCastleFlash = (amount: number): void => {
    materials.goal.color.setHex(COLOURS.goal).lerp(castleRed, amount);
    materials.goal.emissive.copy(castleRed);
    materials.goal.emissiveIntensity = amount * 0.5;
  };

  return { group, setCastleFlash };
}
