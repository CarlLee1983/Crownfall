import {
  BoxGeometry,
  type Camera,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
} from 'three';
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
  boss: { size: 1, color: 0xc83b36 },
};
const DEFAULT_LOOK: Look = { size: 0.4, color: 0xbbbbbb };

export function enemyLook(kind: string): Look {
  return LOOKS[kind] ?? DEFAULT_LOOK;
}

interface EnemyView {
  readonly group: Group;
  readonly body: Mesh<BoxGeometry, MeshLambertMaterial>;
  readonly bar: Group;
  readonly fill: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly barWidth: number;
}

export interface EnemyLayer {
  readonly group: Group;
  /** alpha 為 previous 到 current 之間的內插比例；只存在於 previous 的敵人不畫。 */
  update(previous: GameState, current: GameState, alpha: number): void;
}

export function createEnemyLayer(camera: Camera): EnemyLayer {
  const group = new Group();
  const views = new Map<EnemyId, EnemyView>();
  const barGeometry = new PlaneGeometry(1, 1);
  const barBackground = new MeshBasicMaterial({ color: 0x1c1d22 });
  const barFill = new MeshBasicMaterial({ color: 0x7ee081 });

  const viewFor = (id: EnemyId, look: Look): EnemyView => {
    const existing = views.get(id);
    if (existing !== undefined) return existing;
    const body = new Mesh(
      new BoxGeometry(look.size, look.size, look.size),
      new MeshLambertMaterial({ color: look.color }),
    );
    body.position.y = look.size / 2;

    const barWidth = Math.max(0.52, look.size);
    const bar = new Group();
    bar.position.y = look.size + 0.16;
    const background = new Mesh(barGeometry, barBackground);
    background.scale.set(barWidth + 0.06, 0.14, 1);
    const fill = new Mesh(barGeometry, barFill);
    fill.scale.y = 0.08;
    fill.position.z = 0.01;
    bar.add(background, fill);

    const enemyGroup = new Group();
    enemyGroup.add(body, bar);
    const view = { group: enemyGroup, body, bar, fill, barWidth };
    views.set(id, view);
    group.add(enemyGroup);
    return view;
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
      const ground = groundHeight(current.level, { x, y }) * LAYER_HEIGHT;
      const view = viewFor(enemy.id, enemyLook(enemy.kind));
      view.group.position.set(x, ground, y);
      view.bar.quaternion.copy(camera.quaternion);

      const { maxHp } = enemy;
      const ratio = maxHp > 0 ? Math.min(1, Math.max(0, enemy.hp / maxHp)) : 0;
      view.fill.visible = ratio > 0;
      view.fill.scale.x = view.barWidth * ratio;
      view.fill.position.x = (view.fill.scale.x - view.barWidth) / 2;
    }

    for (const [id, view] of views) {
      if (alive.has(id)) continue;
      group.remove(view.group);
      view.body.geometry.dispose();
      view.body.material.dispose();
      views.delete(id);
    }
  };

  return { group, update };
}
