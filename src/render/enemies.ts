import {
  BoxGeometry,
  type BufferGeometry,
  type Camera,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Matrix3,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Shape,
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
  TICKS_PER_SECOND,
} from '../core';
import { cellIndex, neighbors } from '../core/level';
import { createEnemyModel } from './enemy-model';
import { type EnemyMotion, enemyHeading, enemyMotion, sampleEnemyMotion } from './enemy-motion';
import { OVERLAY_LAYER, WORLD_LAYER } from './layers';
import type { LoadedEnemyModel } from './models';
import { LAYER_HEIGHT } from './terrain';

interface Look {
  readonly size: number;
  readonly round?: true;
  readonly cornerCut?: number;
}

const LOOKS: Readonly<Record<string, Look>> = {
  grunt: { size: 0.5 },
  runner: { size: 0.4 },
  tank: { size: 0.8, cornerCut: 0.1 },
  boss: { size: 1, round: true },
};
const DEFAULT_LOOK: Look = { size: 0.5 };
const GLOW_COLORS: ReadonlyMap<string, number> = new Map([
  ['grunt', 0xffe7a4],
  ['runner', 0xb5ec69],
  ['tank', 0xffad73],
  ['boss', 0xf37b55],
]);
const GLOW_INTENSITY = 0.55;
const WHITE = new Color(0xffffff);
const UP = new Vector3(0, 1, 0);
const BACK = new Vector3(0, 0, 1);
const BAR_HEIGHT = 0.14;
const BAR_GAP = 0.08;

function enemyLook(kind: string): Look {
  return LOOKS[kind] ?? DEFAULT_LOOK;
}

export function enemyGlowColor(kind: string): number {
  return GLOW_COLORS.get(kind) ?? 0xbbbbbb;
}

function enemyGeometry({ size, cornerCut, round }: Look): BufferGeometry {
  const half = size / 2;
  // The full-width boss needs a round footprint to follow the half-cell radius turns.
  if (round) return new CylinderGeometry(half, half, size, 16);
  if (cornerCut === undefined) return new BoxGeometry(size, size, size);

  // Cut the corners so wide enemies can round turns beside a high platform.
  const inset = half - cornerCut;
  const footprint = new Shape()
    .moveTo(-inset, -half)
    .lineTo(inset, -half)
    .lineTo(half, -inset)
    .lineTo(half, inset)
    .lineTo(inset, half)
    .lineTo(-inset, half)
    .lineTo(-half, inset)
    .lineTo(-half, -inset)
    .closePath();
  return new ExtrudeGeometry(footprint, { depth: size, bevelEnabled: false })
    .rotateX(-Math.PI / 2)
    .translate(0, -half, 0);
}

function smoothUnit(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function supportingPlane(level: Level, point: GridPoint, look: Look, normal: Vector3): number {
  const half = look.size / 2;
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
  const reach = look.round ? half : half / length;
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

function supportBody(
  level: Level,
  point: GridPoint,
  look: Look,
  normal: Vector3,
  offset: Vector3,
): number {
  const ground = supportingPlane(level, point, look, normal);
  const half = look.size / 2;
  offset.copy(look.round ? UP : normal).multiplyScalar(half);
  return ground;
}

interface EnemyView {
  readonly group: Group;
  readonly body: Mesh<BufferGeometry, MeshLambertMaterial>;
  readonly bar: Group;
  readonly fill: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly barWidth: number;
  readonly visual: ReturnType<typeof createEnemyModel> | undefined;
}

export interface EnemyLayer {
  readonly group: Group;
  routeMotions(): Iterable<EnemyMotion>;
  /** Observe every tick, including ticks advanced between draws. */
  observe(state: GameState): void;
  /** alpha 為 previous 到 current 之間的內插比例；只存在於 previous 的敵人不畫。 */
  update(
    previous: GameState,
    current: GameState,
    alpha: number,
    hitFlash?: (id: EnemyId) => number,
    gameMs?: number,
  ): void;
  targetPosition(id: EnemyId, output: Vector3): Vector3 | undefined;
  impactPosition(state: GameState, enemy: Enemy, output: Vector3): Vector3;
  spawnPosition(state: GameState, kind: string, output: Vector3): Vector3;
  reset(): void;
}

export function createEnemyLayer(
  camera: Camera,
  models: Readonly<Partial<Record<string, LoadedEnemyModel>>> = {},
): EnemyLayer {
  const group = new Group();
  const normal = new Vector3();
  const cameraUp = new Vector3();
  const cameraBack = new Vector3();
  const viewOffset = new Vector3();
  const cameraUpInBody = new Vector3();
  const bodyTransform = new Matrix3();
  const views = new Map<EnemyId, EnemyView>();
  let motions = new Map<EnemyId, EnemyMotion>();
  let observed: GameState | undefined;
  const barGeometry = new PlaneGeometry(1, 1);
  const barBackground = new MeshBasicMaterial({ color: 0x1c1d22 });
  const barFill = new MeshBasicMaterial({ color: 0x7ee081 });

  const viewFor = ({ id, kind }: Enemy, look: Look): EnemyView => {
    const existing = views.get(id);
    if (existing !== undefined) return existing;
    const body = new Mesh(enemyGeometry(look), new MeshLambertMaterial());
    body.layers.set(WORLD_LAYER);
    body.matrixAutoUpdate = false;
    const asset = models[kind];
    const visual = asset && createEnemyModel(asset, -look.size / 2, enemyGlowColor(kind));
    if (visual !== undefined) {
      body.material.colorWrite = body.material.depthWrite = false;
      body.add(visual.model);
    }
    const barWidth = Math.max(0.52, look.size);
    const bar = new Group();
    const background = new Mesh(barGeometry, barBackground);
    background.layers.set(OVERLAY_LAYER);
    background.scale.set(barWidth + 0.06, BAR_HEIGHT, 1);
    const fill = new Mesh(barGeometry, barFill);
    fill.layers.set(OVERLAY_LAYER);
    fill.scale.y = 0.08;
    fill.position.z = 0.01;
    bar.add(background, fill);

    const enemyGroup = new Group();
    enemyGroup.add(body, bar);
    const view = { group: enemyGroup, body, bar, fill, barWidth, visual };
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
    view.visual?.dispose();
    views.delete(id);
  };

  const update: EnemyLayer['update'] = (previous, current, alpha, hitFlash, gameMs = 0) => {
    if (observed === undefined || observed.tick < previous.tick) observe(previous);
    observe(current);
    cameraUp.copy(UP).applyQuaternion(camera.quaternion);
    cameraBack.copy(BACK).applyQuaternion(camera.quaternion);
    for (const enemy of current.enemies) {
      const motion = motions.get(enemy.id);
      if (motion === undefined) continue;
      const progress = previous === current ? 1 : alpha;
      const point = sampleEnemyMotion(motion, progress);
      const look = enemyLook(enemy.kind);
      const view = viewFor(enemy, look);
      const flash = hitFlash?.(enemy.id) ?? 0;
      if (view.visual === undefined) {
        const glow = enemyGlowColor(enemy.kind);
        view.body.material.color.setHex(glow).multiplyScalar(0.36).lerp(WHITE, flash);
        view.body.material.emissive.setHex(glow).lerp(WHITE, flash);
        view.body.material.emissiveIntensity = GLOW_INTENSITY;
      } else {
        const walkingSpeed =
          current.phase === 'wave' && motion.end > motion.start
            ? (current.enemyRules[enemy.kind]?.speedPerTick ?? 0) * TICKS_PER_SECOND
            : 0;
        view.visual.model.rotation.y = enemyHeading(motion, progress);
        view.visual.update(gameMs, walkingSpeed, flash);
      }
      const half = look.size / 2;
      const ground = supportBody(current.level, point, look, normal, view.body.position);
      view.group.position.set(point.x, ground, point.y);
      if (!look.round) view.body.quaternion.setFromUnitVectors(UP, normal);
      view.body.updateMatrix();
      const slopeX = look.round ? -normal.x / normal.y : 0;
      const slopeZ = look.round ? -normal.z / normal.y : 0;
      if (look.round) {
        // Shear the boss vertically so its base rests on the slope without widening its footprint.
        view.body.matrix.elements[1] = slopeX;
        view.body.matrix.elements[9] = slopeZ;
      }
      view.bar.quaternion.copy(camera.quaternion);
      // Project the tilted body bounds onto the camera's up axis to clear its silhouette.
      bodyTransform.setFromMatrix4(view.body.matrix).transpose();
      cameraUpInBody.copy(cameraUp);
      let perspectiveScale = 1;
      if (camera instanceof PerspectiveCamera) {
        viewOffset.copy(view.group.position).add(view.body.position).sub(camera.position);
        const depth = -viewOffset.dot(cameraBack);
        const radius = half * (Math.sqrt(3) + Math.hypot(slopeX, slopeZ));
        if (depth > radius) {
          // Account for depth shifting the apparent height of the nearer corners.
          cameraUpInBody.addScaledVector(cameraBack, viewOffset.dot(cameraUp) / depth);
          perspectiveScale = depth / (depth - radius);
        }
      }
      cameraUpInBody.applyMatrix3(bodyTransform);
      const bodyTop =
        half *
        (Math.abs(cameraUpInBody.x) + Math.abs(cameraUpInBody.y) + Math.abs(cameraUpInBody.z));
      view.bar.position
        .copy(view.body.position)
        .addScaledVector(cameraUp, bodyTop * perspectiveScale + BAR_GAP + BAR_HEIGHT / 2);

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

  const bodyPosition = (level: Level, point: GridPoint, kind: string, output: Vector3) => {
    const ground = supportBody(level, point, enemyLook(kind), normal, output);
    return output.set(point.x + output.x, ground + output.y, point.y + output.z);
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
      return bodyPosition(state.level, point, enemy.kind, output);
    },
    spawnPosition: (state, kind, output) =>
      bodyPosition(state.level, cellPoint(state.level, state.level.spawn), kind, output),
    reset: () => {
      for (const [id, view] of views) remove(id, view);
      motions.clear();
      observed = undefined;
    },
  };
}
