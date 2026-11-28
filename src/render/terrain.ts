import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DataTexture,
  Group,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  type Object3D,
  SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { type CellIndex, cellAt, cellPoint, type Level, rampDirection } from '../core';
import { neighbors } from '../core/level';
import { WORLD_LAYER } from './layers';
import { placeableScenery } from './scenery-model';

/** 一個高度層在世界座標中的高度。 */
export const LAYER_HEIGHT = 0.6;

const COLOURS = {
  low: 0x8fb070,
  high: 0xabaeba,
  laneLow: 0xa0a0a6,
  laneHigh: 0x8b8e9d,
  spawn: 0xad6158,
  goal: 0x648bb4,
} as const;

type Palette = keyof typeof COLOURS;

const TILE_TEXELS = 16;
const ATLAS_COLUMNS = 4;
const PHASES = 4;
const VARIANTS = ATLAS_COLUMNS * PHASES;
const CLIFF_TILE = 2 * VARIANTS;
const ATLAS_WIDTH = ATLAS_COLUMNS * TILE_TEXELS;
const ATLAS_HEIGHT = (CLIFF_TILE / ATLAS_COLUMNS + 1) * TILE_TEXELS;
const TERRAIN_SEED = 0x78359a4b;
const BORDER_TEXELS = 2;

function terrainColor(hex: number): Color {
  const color = new Color(hex);
  const { h, s, l } = color.getHSL({ h: 0, s: 0, l: 0 });
  return color.setHSL(h, s * 0.35, l * 0.85);
}

function tileHash(x: number, y: number): number {
  const hash = TERRAIN_SEED ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77);
  return (Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 16) & (VARIANTS - 1);
}

function stoneShade(x: number, y: number): number {
  const row = Math.floor(y / 4);
  const column = x + (row % 2) * 4;
  if (y % 4 === 0 || column % 8 === 0) return 159;
  return 209 + ((Math.floor(column / 8) + row) % 2) * 12;
}

function mossShade(x: number, y: number): number {
  const row = Math.floor(y / 4);
  const column = Math.floor((x + (row % 2) * 2) / 4);
  return 164 + (tileHash(column, row) % 4) * 13;
}

function atlasTileOrigin(tile: number) {
  return {
    left: (tile % ATLAS_COLUMNS) * TILE_TEXELS,
    bottom: Math.floor(tile / ATLAS_COLUMNS) * TILE_TEXELS,
  };
}

// Each atlas row shifts the pattern. Its four columns hold the quarter turns.
function terrainAtlas(): DataTexture {
  const pixels = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  for (let tile = 0; tile <= CLIFF_TILE; tile++) {
    const moss = tile >= VARIANTS && tile < CLIFF_TILE;
    const variant = tile % VARIANTS;
    const rotation = variant % ATLAS_COLUMNS;
    const swapsAxes = rotation % 2 === 1;
    const flipX = rotation === 1 || rotation === 2;
    const flipY = rotation >= 2;
    const phase = Math.floor(variant / ATLAS_COLUMNS);
    const { left, bottom } = atlasTileOrigin(tile);
    const last = TILE_TEXELS - 1;
    for (let y = 0; y < TILE_TEXELS; y++) {
      for (let x = 0; x < TILE_TEXELS; x++) {
        const rotatedX = swapsAxes ? y : x;
        const rotatedY = swapsAxes ? x : y;
        const u = ((flipX ? last - rotatedX : rotatedX) + phase * 3) % TILE_TEXELS;
        const v = ((flipY ? last - rotatedY : rotatedY) + phase * 5) % TILE_TEXELS;
        const border = tile !== CLIFF_TILE && Math.min(x, y, last - x, last - y) < BORDER_TEXELS;
        const shade = border ? (moss ? 216 : 235) : moss ? mossShade(u, v) : stoneShade(u, v);
        const offset = ((bottom + y) * ATLAS_WIDTH + left + x) * 4;
        pixels.set(
          moss ? [shade, shade + 11, shade - 21, 255] : [shade, shade, shade, 255],
          offset,
        );
      }
    }
  }
  const texture = new DataTexture(pixels, ATLAS_WIDTH, ATLAS_HEIGHT);
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
function rampGeometry(dx: number, dy: number): BoxGeometry {
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
  const map = terrainAtlas();
  const materials = Object.fromEntries(
    Object.entries(COLOURS).map(([name, hex]) => [
      name,
      new MeshLambertMaterial({ color: terrainColor(hex), map }),
    ]),
  ) as Record<Palette, MeshLambertMaterial>;

  const cliff = new MeshLambertMaterial({
    color: terrainColor(0xb6bac4),
    map,
  });
  const geometryByMaterial = new Map<MeshLambertMaterial, BufferGeometry[]>();
  const batchSurface = (source: BoxGeometry, indices: number[], material: MeshLambertMaterial) => {
    const surface = new BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
      surface.setAttribute(name, attribute);
    }
    surface.setIndex(indices);
    const batch = geometryByMaterial.get(material);
    if (batch === undefined) geometryByMaterial.set(material, [surface]);
    else batch.push(surface);
  };
  for (let i = 0; i < level.cells.length; i++) {
    const index = i as CellIndex;
    const { x, y } = cellPoint(level, index);
    const cell = cellAt(level, index);
    const direction = rampDirection(level, index);
    const top = cell.layer * LAYER_HEIGHT;

    let geometry: BoxGeometry;
    let palette: Palette;
    if (direction !== undefined) {
      geometry = rampGeometry(direction.dx, direction.dy).translate(x, LAYER_HEIGHT / 2, y);
      palette = 'laneLow';
    } else {
      // 地表至少厚一層，平地才不會是零厚度的面。
      const thickness = Math.max(top, LAYER_HEIGHT);
      geometry = new BoxGeometry(1, thickness, 1).translate(x, top - thickness / 2, y);
      palette = paletteOf(level, index);
    }
    const horizontal: number[] = [];
    const walls: number[] = [];
    const indices = geometry.getIndex();
    const uv = geometry.getAttribute('uv');
    const topTile = tileHash(x, y) + (palette === 'low' ? VARIANTS : 0);
    if (indices === null) throw new Error('Expected indexed terrain geometry');
    for (const { start, count, materialIndex } of geometry.groups) {
      // BoxGeometry orders faces +X, -X, +Y, -Y, +Z, -Z. A ramp keeps those groups.
      const isHorizontal = materialIndex === 2 || materialIndex === 3;
      const surface = isHorizontal ? horizontal : walls;
      const tile = isHorizontal ? topTile : CLIFF_TILE;
      const { left, bottom } = atlasTileOrigin(tile);
      // BoxGeometry gives each face four unique vertices. Inset UVs to texel centers
      // so nearest filtering cannot pick a neighboring atlas tile at a face edge.
      const vertices = new Set<number>();
      for (let j = start; j < start + count; j++) {
        const vertex = indices.getX(j);
        surface.push(vertex);
        vertices.add(vertex);
      }
      for (const vertex of vertices) {
        uv.setXY(
          vertex,
          (left + 0.5 + uv.getX(vertex) * (TILE_TEXELS - 1)) / ATLAS_WIDTH,
          (bottom + 0.5 + uv.getY(vertex) * (TILE_TEXELS - 1)) / ATLAS_HEIGHT,
        );
      }
    }
    batchSurface(geometry, horizontal, materials[palette]);
    batchSurface(geometry, walls, cliff);
  }

  for (const [material, geometries] of geometryByMaterial) {
    const mesh = new Mesh(mergeGeometries(geometries), material);
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

  return { group, landmarks: [entrance, castle.group], setCastleFlash };
}
