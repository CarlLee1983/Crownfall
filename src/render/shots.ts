import {
  BoxGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  Vector3,
} from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  cellPoint,
  type Enemy,
  type EnemyId,
  type GameEvent,
  type GameState,
  groundHeight,
  type Level,
  type ShotImpact,
} from '../core';
import type { EnemyLayer } from './enemies';
import { WORLD_LAYER } from './layers';
import { LAYER_HEIGHT } from './terrain';

const SHOT_DURATION_MS = 180;
const SPLASH_DURATION_MS = 202;
const SPLASH_COLOR = 0xc169ff;
const PROJECTILES = {
  basic: { speed: 0.021, arc: 0.25 },
  splash: { speed: 0.016, arc: 0.4 },
};
const MIN_FLIGHT_MS = 92;
const IMPACT_GAP_MS = 38;
const UP = new Vector3(0, 1, 0);

type FiredShot = Extract<GameEvent, { type: 'shot' }>;

type ImpactTarget = Pick<Enemy, 'id' | 'kind'>;

export interface PresentedImpact {
  readonly towerKind: string;
  readonly target: ImpactTarget;
  readonly lethal: boolean;
  readonly splashKills?: readonly ImpactTarget[];
}

interface ImpactHandlers {
  readonly onImpact?: (impact: PresentedImpact) => void;
  readonly onDelayedImpact?: (
    impact: ShotImpact,
    towerKind: string,
    position: Vector3,
    direction: Vector3,
    gameMs: number,
  ) => void;
}

interface Flight {
  readonly shot: FiredShot;
  readonly projectile: { readonly model: Group; readonly arc: number } | undefined;
  readonly level: Level;
  readonly origin: Vector3;
  readonly endpoint: Vector3;
  readonly impactPositions: Map<EnemyId, Vector3>;
  readonly start: number;
  readonly duration: number;
}

export function createShotLayer(
  enemies: Pick<EnemyLayer, 'aimPosition' | 'hold' | 'impactPosition' | 'targetPosition'>,
  towerHeight: (kind: string) => number,
  handlers: ImpactHandlers = {},
) {
  const group = new Group();
  const endpoint = new Vector3();
  const ringGeometry = new RingGeometry(0.88, 1, 36).rotateX(-Math.PI / 2);
  type Shot = {
    readonly start: number;
    readonly target: EnemyId | undefined;
    readonly line: Line2;
  };
  const active = new Set<Shot>();
  const flights = new Set<Flight>();
  const splashes = new Set<{
    readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
    readonly radius: number;
    readonly start: number;
  }>();
  const pending = new Map<EnemyId, { hp: number; remaining: number }>();
  const lastImpact = new Map<EnemyId, number>();
  const shaftGeometry = new BoxGeometry(0.055, 0.36, 0.055);
  const tipGeometry = new ConeGeometry(0.07, 0.15, 4);
  const tailGeometry = new BoxGeometry(0.12, 0.095, 0.026);
  const arrowMaterial = new MeshBasicMaterial({ color: 0xffe5a1 });
  const orbGeometry = new OctahedronGeometry(0.135);
  const orbMaterial = new MeshBasicMaterial({ color: SPLASH_COLOR });

  function arrow(origin: Vector3): Group {
    const model = new Group();
    const shaft = new Mesh(shaftGeometry, arrowMaterial);
    const tip = new Mesh(tipGeometry, arrowMaterial);
    const tail = new Mesh(tailGeometry, arrowMaterial);
    shaft.position.y = -0.24;
    tip.position.y = -0.075;
    tail.position.y = -0.4;
    for (const part of [shaft, tip, tail]) part.layers.set(WORLD_LAYER);
    model.add(shaft, tip, tail);
    model.position.copy(origin);
    group.add(model);
    return model;
  }

  function orb(origin: Vector3): Group {
    const model = new Group();
    const glow = new Mesh(orbGeometry, orbMaterial);
    const spark = new Mesh(orbGeometry, arrowMaterial);
    spark.position.y = -0.19;
    spark.scale.setScalar(0.55);
    for (const part of [glow, spark]) part.layers.set(WORLD_LAYER);
    model.add(glow, spark);
    model.position.copy(origin);
    group.add(model);
    return model;
  }

  function splash(level: Level, endpoint: Vector3, radius: number, start: number): void {
    const ring = new Mesh(
      ringGeometry,
      new MeshBasicMaterial({ color: SPLASH_COLOR, transparent: true, depthWrite: false }),
    );
    const { x, z } = endpoint;
    const ground = groundHeight(level, { x, y: z }) * LAYER_HEIGHT;
    ring.layers.set(WORLD_LAYER);
    ring.position.set(x, ground + 0.07, z);
    group.add(ring);
    splashes.add({ ring, radius, start });
  }

  function notify(shot: FiredShot): void {
    if (handlers.onImpact === undefined) return;
    const { id, kind } = shot.target;
    const splashKills: ImpactTarget[] = [];
    let lethal = false;
    for (const { target, bounty } of shot.impacts) {
      if (bounty === undefined) continue;
      if (target.id === id) lethal = true;
      else splashKills.push({ id: target.id, kind: target.kind });
    }
    handlers.onImpact({
      towerKind: shot.towerKind,
      target: { id, kind },
      lethal,
      ...(splashKills.length > 0 ? { splashKills } : {}),
    });
  }

  function remove(shot: Shot): void {
    group.remove(shot.line);
    shot.line.geometry.dispose();
    shot.line.material.dispose();
    active.delete(shot);
  }

  function onEvents(
    events: readonly GameEvent[],
    state: GameState,
    frameTime: number,
  ): GameEvent[] {
    const deferred = new Set<GameEvent>();
    const deferredKills = new Set<EnemyId>();
    for (const event of events) {
      if (event.type !== 'shot') continue;
      const tower = state.towers.find(({ cell }) => cell === event.towerCell);
      if (tower === undefined) continue;

      const from = cellPoint(state.level, tower.cell);
      const origin = new Vector3(
        from.x,
        tower.layer * LAYER_HEIGHT + towerHeight(tower.kind),
        from.y,
      );
      const archer = tower.kind === 'basic' && event.splashRadius === undefined;
      const mage = event.splashRadius !== undefined;
      const projectile = mage ? PROJECTILES.splash : archer ? PROJECTILES.basic : undefined;
      const delay =
        projectile !== undefined || event.impacts.some(({ target }) => pending.has(target.id));
      if (delay) {
        deferred.add(event);
        const impactPositions = new Map<EnemyId, Vector3>();
        for (const { target, bounty } of event.impacts) {
          if (bounty !== undefined) {
            deferredKills.add(target.id);
            enemies.hold(target, state);
          }
          const result = pending.get(target.id) ?? { hp: target.hp, remaining: 0 };
          result.remaining++;
          pending.set(target.id, result);
          impactPositions.set(target.id, enemies.impactPosition(state, target, new Vector3()));
        }
        const aim = enemies.impactPosition(state, event.target, new Vector3());
        flights.add({
          shot: event,
          projectile:
            projectile === undefined
              ? undefined
              : { model: mage ? orb(origin) : arrow(origin), arc: projectile.arc },
          level: state.level,
          origin,
          endpoint: aim,
          impactPositions,
          start: frameTime,
          duration:
            projectile === undefined
              ? 0
              : Math.max(MIN_FLIGHT_MS, origin.distanceTo(aim) / projectile.speed),
        });
      } else {
        notify(event);
      }
      if (projectile !== undefined) continue;

      const target = enemies.impactPosition(state, event.target, endpoint);
      const line = new Line2(
        new LineGeometry().setPositions([
          origin.x,
          origin.y,
          origin.z,
          target.x,
          target.y,
          target.z,
        ]),
        new LineMaterial({ color: 0xffedb0, linewidth: 3, transparent: true, depthWrite: false }),
      );
      line.layers.set(WORLD_LAYER);
      group.add(line);

      const killed = event.impacts.some(
        ({ target, bounty }) => target.id === event.target.id && bounty !== undefined,
      );
      active.add({ start: frameTime, target: killed ? undefined : event.target.id, line });
    }
    return events.filter(
      (event) =>
        !deferred.has(event) && (event.type !== 'killed' || !deferredKills.has(event.enemyId)),
    );
  }

  function advanceFlights(frameTime: number, alpha: number): void {
    const blocked = new Set<EnemyId>();
    for (const flight of flights) {
      const { shot, origin, endpoint, duration, projectile, start } = flight;
      enemies.aimPosition(shot.target.id, alpha, endpoint);
      const elapsed = frameTime - start;
      const ready =
        elapsed >= duration &&
        shot.impacts.every(
          ({ target }) =>
            !blocked.has(target.id) &&
            frameTime - (lastImpact.get(target.id) ?? -Infinity) >= IMPACT_GAP_MS,
        );
      const tangent = endpoint.clone().sub(origin);
      if (ready) {
        const direction = tangent.setY(0).normalize();
        for (const impact of shot.impacts) {
          const id = impact.target.id;
          const result = pending.get(id);
          if (result !== undefined) {
            result.hp = impact.hp;
            result.remaining--;
            if (result.remaining === 0) pending.delete(id);
          }
          lastImpact.set(id, frameTime);
          const position = flight.impactPositions.get(id) ?? endpoint;
          enemies.aimPosition(id, alpha, position);
          handlers.onDelayedImpact?.(impact, shot.towerKind, position, direction, frameTime);
        }
        notify(shot);
        if (shot.splashRadius !== undefined && shot.splashRadius > 0) {
          splash(flight.level, endpoint, shot.splashRadius, frameTime);
        }
        if (projectile !== undefined) group.remove(projectile.model);
        flights.delete(flight);
        continue;
      }
      for (const { target } of shot.impacts) blocked.add(target.id);
      if (projectile === undefined) continue;
      const { model, arc } = projectile;
      const progress = Math.min(0.96, Math.max(0, elapsed / duration));
      model.position.copy(origin).lerp(endpoint, progress);
      model.position.y += 4 * arc * progress * (1 - progress);
      tangent.y += 4 * arc * (1 - 2 * progress);
      if (tangent.lengthSq() > 0) model.quaternion.setFromUnitVectors(UP, tangent.normalize());
    }
    for (const [id, at] of lastImpact) {
      if (frameTime - at >= IMPACT_GAP_MS) lastImpact.delete(id);
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
      if (!withinLifetime) remove(shot);
    }

    for (const effect of splashes) {
      const { ring, radius, start } = effect;
      const progress = (frameTime - start) / SPLASH_DURATION_MS;
      if (progress >= 1) {
        group.remove(ring);
        ring.material.dispose();
        splashes.delete(effect);
        continue;
      }
      const size = radius * (0.28 + 0.72 * progress);
      ring.scale.set(size, 1, size);
      ring.material.opacity = 0.36 * (1 - progress);
    }
  }

  return {
    group,
    onEvents,
    advanceFlights,
    update,
    displayHp: (id: EnemyId) => pending.get(id)?.hp,
    reset: () => {
      active.forEach(remove);
      for (const { ring } of splashes) ring.material.dispose();
      splashes.clear();
      group.clear();
      flights.clear();
      pending.clear();
      lastImpact.clear();
    },
  };
}
