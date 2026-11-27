import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { type EnemyId, enemyPosition, type GameState, type GridPoint, groundHeight } from '../core';
import { LAYER_HEIGHT } from './terrain';

interface Look {
  readonly size: number;
  readonly color: number;
}

const LOOKS: Readonly<Record<string, Look>> = {
  grunt: { size: 0.4, color: 0xd9a441 },
  runner: { size: 0.3, color: 0xe05a8a },
  tank: { size: 0.65, color: 0x7a4fb0 },
};
const DEFAULT_LOOK: Look = { size: 0.4, color: 0xbbbbbb };

export interface EnemyLayer {
  readonly group: Group;
  /** alpha 為 previous 到 current 之間的內插比例；只存在於 previous 的敵人不畫。 */
  update(previous: GameState, current: GameState, alpha: number): void;
}

export function createEnemyLayer(): EnemyLayer {
  const group = new Group();
  const meshes = new Map<EnemyId, Mesh>();

  const meshFor = (id: EnemyId, look: Look): Mesh => {
    const existing = meshes.get(id);
    if (existing !== undefined) return existing;
    const mesh = new Mesh(
      new BoxGeometry(look.size, look.size, look.size),
      new MeshLambertMaterial({ color: look.color }),
    );
    meshes.set(id, mesh);
    group.add(mesh);
    return mesh;
  };

  const update = (previous: GameState, current: GameState, alpha: number): void => {
    const before = new Map<EnemyId, GridPoint>(
      previous.enemies.map((enemy) => [enemy.id, enemyPosition(previous, enemy)]),
    );
    const alive = new Set<EnemyId>();

    for (const enemy of current.enemies) {
      alive.add(enemy.id);
      const now = enemyPosition(current, enemy);
      const from = before.get(enemy.id) ?? now;
      const x = from.x + (now.x - from.x) * alpha;
      const y = from.y + (now.y - from.y) * alpha;
      const look = LOOKS[enemy.kind] ?? DEFAULT_LOOK;
      const ground = groundHeight(current.level, { x, y }) * LAYER_HEIGHT;
      meshFor(enemy.id, look).position.set(x, ground + look.size / 2, y);
    }

    for (const [id, mesh] of meshes) {
      if (alive.has(id)) continue;
      group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshLambertMaterial).dispose();
      meshes.delete(id);
    }
  };

  return { group, update };
}
