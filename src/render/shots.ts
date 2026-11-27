import { Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { cellPoint, enemyPosition, type GameEvent, type GameState, groundHeight } from '../core';
import { towerHeight } from './build-layer';
import { enemyLook } from './enemies';
import { LAYER_HEIGHT } from './terrain';

const SHOT_DURATION_MS = 180;
const SPLASH_DURATION_MS = 300;
const SPLASH_COLOR = 0xf395ff;

export function createShotLayer() {
  const group = new Group();
  const ringGeometry = new RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2);
  const active = new Set<{
    readonly start: number;
    readonly line: Line2;
    readonly ring: Mesh<RingGeometry, MeshBasicMaterial> | undefined;
  }>();

  function onEvents(events: readonly GameEvent[], state: GameState, frameTime: number): void {
    for (const event of events) {
      if (event.type !== 'shot') continue;
      const tower = state.towers.find(({ cell }) => cell === event.towerCell);
      if (tower === undefined) continue;

      const from = cellPoint(state.level, tower.cell);
      const target = enemyPosition(state, event.target);
      const ground = groundHeight(state.level, target) * LAYER_HEIGHT;
      const color = event.splashRadius === undefined ? 0xffedb0 : SPLASH_COLOR;
      const line = new Line2(
        new LineGeometry().setPositions([
          from.x,
          tower.layer * LAYER_HEIGHT + towerHeight(tower.kind),
          from.y,
          target.x,
          ground + enemyLook(event.target.kind).size / 2,
          target.y,
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
        ring.position.set(target.x, ground + 0.065, target.y);
        ring.scale.set(event.splashRadius, 1, event.splashRadius);
        group.add(ring);
      }
      active.add({ start: frameTime, line, ring });
    }
  }

  function update(frameTime: number): void {
    for (const shot of active) {
      const elapsed = frameTime - shot.start;
      shot.line.visible = elapsed < SHOT_DURATION_MS;
      shot.line.material.opacity = Math.max(0, 1 - elapsed / SHOT_DURATION_MS);
      if (shot.ring !== undefined) {
        shot.ring.material.opacity = Math.max(0, 1 - elapsed / SPLASH_DURATION_MS);
      }
      if (elapsed < (shot.ring === undefined ? SHOT_DURATION_MS : SPLASH_DURATION_MS)) continue;

      group.remove(shot.line);
      shot.line.geometry.dispose();
      shot.line.material.dispose();
      if (shot.ring !== undefined) {
        group.remove(shot.ring);
        shot.ring.material.dispose();
      }
      active.delete(shot);
    }
  }

  return { group, onEvents, update };
}
