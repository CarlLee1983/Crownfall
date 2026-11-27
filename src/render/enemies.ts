import {
  BoxGeometry,
  type Camera,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import {
  cellAt,
  cellPoint,
  type Enemy,
  type EnemyId,
  type GameState,
  type GridPoint,
  groundHeight,
  type Level,
  rampDirection,
} from '../core';
import { cellIndex, neighbors } from '../core/level';
import { type EnemyMotion, enemyMotion, sampleEnemyMotion } from './enemy-motion';
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
const UP = new Vector3(0, 1, 0);

function enemyLook(kind: string): Look {
  return LOOKS[kind] ?? DEFAULT_LOOK;
}

function smoothUnit(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function supportingPlane(level: Level, point: GridPoint, half: number, normal: Vector3): number {
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  const dx = point.x - x;
  const dy = point.y - y;
  let ramp = cellIndex(level.width, x, y);
  let rise = rampDirection(level, ramp);
  if (rise === undefined && Math.max(Math.abs(dx), Math.abs(dy)) > 0.5 - half) {
    for (const { index, direction } of neighbors(level, ramp)) {
      if (dx * direction.dx + dy * direction.dy <= 0.5 - half) continue;
      const adjacentRise = rampDirection(level, index);
      if (
        adjacentRise === undefined ||
        adjacentRise.dx * direction.dx + adjacentRise.dy * direction.dy === 0
      )
        continue;
      ramp = index;
      rise = adjacentRise;
      break;
    }
  }
  if (rise === undefined) {
    normal.copy(UP);
    return groundHeight(level, point) * LAYER_HEIGHT;
  }

  const center = cellPoint(level, ramp);
  const rampLayer = cellAt(level, ramp).layer;
  const along = (point.x - center.x) * rise.dx + (point.y - center.y) * rise.dy;
  // Blend the pitch as the nominal footprint moves across either end of the ramp.
  const pitch = smoothUnit((0.5 + half - Math.abs(along)) / (2 * half));
  // A full-width base can reach a high flank as soon as it starts a turn at the crest.
  // Ease it onto the upper flat before that first overlap can lift the model abruptly.
  const riseX = rise.dx;
  const riseY = rise.dy;
  const highFlank =
    half >= 0.5 &&
    along > 0.5 - half &&
    neighbors(level, ramp).some(
      ({ index, direction }) =>
        direction.dx * riseX + direction.dy * riseY === 0 && cellAt(level, index).layer > rampLayer,
    );
  const exit = highFlank ? smoothUnit((0.5 - along) / half) : 1;
  const slope = LAYER_HEIGHT * pitch * exit;
  const length = Math.hypot(1, slope);
  normal.set((-rise.dx * slope) / length, 1 / length, (-rise.dy * slope) / length);

  // Support the actual projected footprint. Clearance can be lowest at either edge or at
  // the crest, where the rising plane meets the upper flat.
  const reach = half / length;
  const crest = Math.max(-reach, Math.min(reach, 0.5 - along));
  const supportAt = (offset: number): number =>
    LAYER_HEIGHT * Math.min(1, Math.max(0, 0.5 + along + offset)) - slope * offset;
  let height =
    rampLayer * LAYER_HEIGHT + Math.max(supportAt(-reach), supportAt(reach), supportAt(crest));

  // The rotated base remains aligned to the grid in plan. Check the low edge of each
  // overlap with an upper plateau, including cells across the width of the ramp.
  const widthX = riseX === 0 ? half : reach;
  const widthY = riseY === 0 ? half : reach;
  const minX = point.x - widthX;
  const maxX = point.x + widthX;
  const minY = point.y - widthY;
  const maxY = point.y + widthY;
  for (
    let row = Math.max(0, Math.floor(minY + 0.5));
    row <= Math.min(level.height - 1, Math.ceil(maxY - 0.5));
    row++
  ) {
    for (
      let col = Math.max(0, Math.floor(minX + 0.5));
      col <= Math.min(level.width - 1, Math.ceil(maxX - 0.5));
      col++
    ) {
      const cell = cellAt(level, cellIndex(level.width, col, row));
      if (cell.ramp || cell.layer <= rampLayer) continue;
      const lowX = riseX > 0 ? Math.max(minX, col - 0.5) : Math.min(maxX, col + 0.5);
      const lowY = riseY > 0 ? Math.max(minY, row - 0.5) : Math.min(maxY, row + 0.5);
      const downhill = (lowX - point.x) * riseX + (lowY - point.y) * riseY;
      height = Math.max(height, cell.layer * LAYER_HEIGHT - slope * downhill);
    }
  }
  return height;
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
  routeMotions(): Iterable<EnemyMotion>;
  /** Observe every tick, including ticks advanced between draws. */
  observe(state: GameState): void;
  /** alpha 為 previous 到 current 之間的內插比例；只存在於 previous 的敵人不畫。 */
  update(previous: GameState, current: GameState, alpha: number): void;
  targetPosition(id: EnemyId, output: Vector3): Vector3 | undefined;
  impactPosition(state: GameState, enemy: Enemy, output: Vector3): Vector3;
  reset(): void;
}

export function createEnemyLayer(camera: Camera): EnemyLayer {
  const group = new Group();
  const normal = new Vector3();
  const views = new Map<EnemyId, EnemyView>();
  let motions = new Map<EnemyId, EnemyMotion>();
  let observed: GameState | undefined;
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

  const observe = (state: GameState): void => {
    if (observed === state) return;
    // Commands applied while paused can change the route without advancing an enemy. Keep
    // the displayed trajectory until the next tick advances it.
    const sameTick = observed?.tick === state.tick && observed.level === state.level;
    motions = new Map(
      state.enemies.map((enemy) => {
        const before = motions.get(enemy.id);
        const motion =
          sameTick && before !== undefined ? before : enemyMotion(state, enemy, before);
        return [enemy.id, motion];
      }),
    );
    observed = state;
  };

  const remove = (id: EnemyId, view: EnemyView): void => {
    group.remove(view.group);
    view.body.geometry.dispose();
    view.body.material.dispose();
    views.delete(id);
  };

  const update = (previous: GameState, current: GameState, alpha: number): void => {
    if (observed === undefined || observed.tick < previous.tick) observe(previous);
    observe(current);
    for (const enemy of current.enemies) {
      const motion = motions.get(enemy.id);
      if (motion === undefined) continue;
      const point = sampleEnemyMotion(motion, previous === current ? 1 : alpha);
      const look = enemyLook(enemy.kind);
      const view = viewFor(enemy.id, look);
      const ground = supportingPlane(current.level, point, look.size / 2, normal);
      view.group.position.set(point.x, ground, point.y);
      view.body.quaternion.setFromUnitVectors(UP, normal);
      view.body.position.copy(normal).multiplyScalar(look.size / 2);
      view.bar.quaternion.copy(camera.quaternion);

      const { maxHp } = enemy;
      const ratio = maxHp > 0 ? Math.min(1, Math.max(0, enemy.hp / maxHp)) : 0;
      view.fill.visible = ratio > 0;
      view.fill.scale.x = view.barWidth * ratio;
      view.fill.position.x = (view.fill.scale.x - view.barWidth) / 2;
    }

    for (const [id, view] of views) {
      if (motions.has(id)) continue;
      remove(id, view);
    }
  };

  return {
    group,
    routeMotions: () => motions.values(),
    observe,
    update,
    targetPosition: (id, output) => {
      const view = views.get(id);
      return view === undefined
        ? undefined
        : output.copy(view.group.position).add(view.body.position);
    },
    impactPosition: (state, enemy, output) => {
      const motion = motions.get(enemy.id) ?? enemyMotion(state, enemy);
      const point = sampleEnemyMotion(motion, 1);
      const half = enemyLook(enemy.kind).size / 2;
      const ground = supportingPlane(state.level, point, half, output);
      output.multiplyScalar(half);
      return output.set(point.x + output.x, ground + output.y, point.y + output.z);
    },
    reset: () => {
      for (const [id, view] of views) remove(id, view);
      motions.clear();
      observed = undefined;
    },
  };
}
