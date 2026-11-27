import { Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  cellPoint,
  type EnemyId,
  enemyPosition,
  type GameEvent,
  type GameState,
  groundHeight,
} from '../core';
import { towerHeight } from './build-layer';
import type { EnemyLayer } from './enemies';
import { LAYER_HEIGHT } from './terrain';

const SHOT_DURATION_MS = 180;
const SPLASH_DURATION_MS = 300;
const SPLASH_COLOR = 0xf395ff;

function killsTarget(events: readonly GameEvent[], shotIndex: number, target: EnemyId): boolean {
  for (let index = shotIndex + 1; index < events.length; index++) {
    const result = events[index];
    if (result?.type === 'shot') break;
    if (result?.type === 'killed' && result.enemyId === target) return true;
  }
  return false;
}

export function createShotLayer(enemies: Pick<EnemyLayer, 'impactPosition' | 'targetPosition'>) {
  const group = new Group();
  const endpoint = new Vector3();
  const ringGeometry = new RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2);
  type Shot = {
    readonly start: number;
    readonly target: EnemyId | undefined;
    readonly line: Line2;
    readonly ring: Mesh<RingGeometry, MeshBasicMaterial> | undefined;
  };
  const active = new Set<Shot>();

  function remove(shot: Shot): void {
    group.remove(shot.line);
    shot.line.geometry.dispose();
    shot.line.material.dispose();
    if (shot.ring !== undefined) {
      group.remove(shot.ring);
      shot.ring.material.dispose();
    }
    active.delete(shot);
  }

  function onEvents(events: readonly GameEvent[], state: GameState, frameTime: number): void {
    for (const [index, event] of events.entries()) {
      if (event.type !== 'shot') continue;
      const tower = state.towers.find(({ cell }) => cell === event.towerCell);
      if (tower === undefined) continue;

      const from = cellPoint(state.level, tower.cell);
      const target = enemies.impactPosition(state, event.target, endpoint);
      const color = event.splashRadius === undefined ? 0xffedb0 : SPLASH_COLOR;
      const line = new Line2(
        new LineGeometry().setPositions([
          from.x,
          tower.layer * LAYER_HEIGHT + towerHeight(tower.kind),
          from.y,
          target.x,
          target.y,
          target.z,
        ]),
        new LineMaterial({ color, linewidth: 3, transparent: true, depthWrite: false }),
      );
      group.add(line);

      let ring: Mesh<RingGeometry, MeshBasicMaterial> | undefined;
      if (event.splashRadius !== undefined && event.splashRadius > 0) {
        ring = new Mesh(
          ringGeometry,
          new MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false }),
        );
        const impact = enemyPosition(state, event.target);
        const ground = groundHeight(state.level, impact) * LAYER_HEIGHT;
        ring.position.set(impact.x, ground + 0.065, impact.y);
        ring.scale.set(event.splashRadius, 1, event.splashRadius);
        group.add(ring);
      }
      const killed = killsTarget(events, index, event.target.id);
      active.add({ start: frameTime, target: killed ? undefined : event.target.id, line, ring });
    }
  }

  function update(frameTime: number): void {
    for (const shot of active) {
      const elapsed = frameTime - shot.start;
      const withinLifetime = elapsed < SHOT_DURATION_MS;
      const target =
        withinLifetime && shot.target !== undefined
          ? enemies.targetPosition(shot.target, endpoint)
          : undefined;
      shot.line.visible = withinLifetime && (shot.target === undefined || target !== undefined);
      shot.line.material.opacity = Math.max(0, 1 - elapsed / SHOT_DURATION_MS);
      if (target !== undefined) {
        const geometry = shot.line.geometry;
        const end = geometry.getAttribute('instanceEnd');
        const x = Math.fround(target.x);
        const y = Math.fround(target.y);
        const z = Math.fround(target.z);
        if (x !== end.getX(0) || y !== end.getY(0) || z !== end.getZ(0)) {
          end.setXYZ(0, x, y, z);
          end.needsUpdate = true;
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
        }
      }
      if (shot.ring !== undefined) {
        shot.ring.material.opacity = Math.max(0, 1 - elapsed / SPLASH_DURATION_MS);
      }
      if (elapsed < (shot.ring === undefined ? SHOT_DURATION_MS : SPLASH_DURATION_MS)) continue;

      remove(shot);
    }
  }

  return { group, onEvents, update, reset: () => active.forEach(remove) };
}
