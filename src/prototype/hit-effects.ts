import {
  BoxGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  Vector2,
  Vector3,
} from 'three';
import {
  cellPoint,
  type EnemyId,
  enemyPosition,
  type GameEvent,
  type GameState,
  groundHeight,
  queryTower,
} from '../core';
import { type EnemyLayer, enemyGlowColor } from '../render/enemies';
import { LAYER_HEIGHT } from '../render/terrain';
import type { HitVariant } from './hit-demo';

// Throwaway comparison on the playable map. Every preset uses the same visual flight schedule.
const PRESETS = {
  A: {
    flash: 0.36,
    flashMs: 72,
    recoil: 0.035,
    shards: 3,
    shardMs: 230,
    scatter: 0.34,
    leak: 0.45,
    leakMs: 220,
    shake: 0.025,
    pause: 0,
    gain: 0.034,
  },
  B: {
    flash: 0.72,
    flashMs: 105,
    recoil: 0.19,
    shards: 6,
    shardMs: 360,
    scatter: 0.6,
    leak: 0.83,
    leakMs: 330,
    shake: 0.09,
    pause: 46,
    gain: 0.058,
  },
  C: {
    flash: 1,
    flashMs: 145,
    recoil: 0.32,
    shards: 11,
    shardMs: 480,
    scatter: 0.96,
    leak: 1,
    leakMs: 460,
    shake: 0.17,
    pause: 74,
    gain: 0.086,
  },
} as const;

const PROJECTILES = {
  basic: { speed: 0.021, arc: 0.25, color: 0xffe5a1, pitch: 240, wave: 'triangle' },
  sniper: { speed: 0.037, arc: 0.05, color: 0xffa459, pitch: 112, wave: 'triangle' },
  splash: { speed: 0.016, arc: 0.4, color: 0xc169ff, pitch: 360, wave: 'sine' },
} as const;

type ProjectileKind = keyof typeof PROJECTILES;
type Kill = Extract<GameEvent, { type: 'killed' }>;
type Preset = (typeof PRESETS)[HitVariant];

interface Flight {
  readonly kind: ProjectileKind;
  readonly target: EnemyId;
  readonly affected: readonly EnemyId[];
  readonly damage: number;
  readonly kills: readonly Kill[];
  readonly origin: Vector3;
  readonly endpoint: Vector3;
  readonly splashRadius: number | undefined;
  readonly state: GameState;
  readonly start: number;
  readonly arrival: number;
  readonly model: Group;
}

interface Reaction {
  readonly at: number;
  readonly direction: Vector3;
  readonly strength: number;
  readonly freezeUntil: number;
  readonly death: boolean;
  readonly preset: Preset;
}

const UP = new Vector3(0, 1, 0);
const DEATH_MS = 85;
const IMPACT_GAP_MS = 38;
const MAX_SHARDS = 56;

export function createHitEffects(enemies: EnemyLayer, towerHeight: (kind: string) => number) {
  const group = new Group();
  const shafts = new BoxGeometry(0.055, 0.36, 0.055);
  const points = new ConeGeometry(0.07, 0.15, 4);
  const fins = new BoxGeometry(0.12, 0.095, 0.026);
  const orb = new OctahedronGeometry(0.135);
  const shardGeometry = new OctahedronGeometry(0.09);
  const ringGeometry = new RingGeometry(0.88, 1, 36).rotateX(-Math.PI / 2);
  const projectileMaterials = {
    basic: new MeshBasicMaterial({ color: PROJECTILES.basic.color }),
    sniper: new MeshBasicMaterial({ color: PROJECTILES.sniper.color }),
    splash: new MeshBasicMaterial({ color: PROJECTILES.splash.color }),
  };
  const shardMaterials = new Map<number, MeshBasicMaterial>();
  const flights = new Set<Flight>();
  const scheduled = new Map<EnemyId, number>();
  const displayHp = new Map<EnemyId, number>();
  const lastImpact = new Map<EnemyId, number>();
  const reactions = new Map<EnemyId, Reaction>();
  const shards = new Set<{
    mesh: Mesh;
    point: Vector3;
    angle: number;
    speed: number;
    at: number;
    preset: Preset;
  }>();
  const rings = new Set<{
    mesh: Mesh<RingGeometry, MeshBasicMaterial>;
    at: number;
    radius: number;
    duration: number;
  }>();
  const bounties = new Set<{
    id: EnemyId;
    text: string;
    position: Vector3;
    horizontalOffset: number;
    at: number;
  }>();
  let leakAt = -Infinity;
  let leakPreset: Preset = PRESETS.A;
  let shakeAt = -Infinity;
  let shakeStrength = 0;
  let freezeUntil = -Infinity;
  let audio: AudioContext | undefined;
  let limiter: DynamicsCompressorNode | undefined;
  const voices = new Map<OscillatorNode, GainNode>();
  let presentedKills = 0;

  function unlockAudio(): void {
    if (typeof AudioContext === 'undefined') return;
    if (audio === undefined) {
      audio = new AudioContext();
      limiter = audio.createDynamicsCompressor();
      limiter.connect(audio.destination);
    }
    if (audio.state !== 'running') void audio.resume().catch(() => undefined);
  }

  function tone(kind: ProjectileKind, gain: number, death: boolean): void {
    if (audio?.state !== 'running' || limiter === undefined) return;
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    const { pitch, wave } = PROJECTILES[kind];
    const now = audio.currentTime;
    const duration = death ? 0.12 : 0.065;
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(pitch, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      pitch * (death ? 0.36 : 0.68),
      now + duration,
    );
    volume.gain.setValueAtTime(0.0001, now);
    volume.gain.exponentialRampToValueAtTime(gain, now + 0.006);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(volume).connect(limiter);
    voices.set(oscillator, volume);
    oscillator.onended = () => {
      oscillator.disconnect();
      volume.disconnect();
      voices.delete(oscillator);
    };
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function projectile(kind: ProjectileKind): Group {
    const model = new Group();
    const material = projectileMaterials[kind];
    if (kind === 'splash') {
      const glow = new Mesh(orb, material);
      const spark = new Mesh(orb, projectileMaterials.basic);
      spark.scale.setScalar(0.55);
      spark.position.y = -0.19;
      model.add(glow, spark);
    } else {
      const shaft = new Mesh(shafts, material);
      const tip = new Mesh(points, material);
      const tail = new Mesh(fins, material);
      shaft.position.y = -0.24;
      tip.position.y = -0.075;
      tail.position.y = -0.4;
      model.add(shaft, tip, tail);
      if (kind === 'sniper') model.scale.set(1.75, 1.6, 1.75);
    }
    group.add(model);
    return model;
  }

  function onEvents(
    events: readonly GameEvent[],
    previous: GameState,
    current: GameState,
    gameMs: number,
    variant: HitVariant,
  ): void {
    const shots = events.flatMap((event, index) =>
      event.type === 'shot' ? [{ event, index }] : [],
    );
    if (shots.length > 0) {
      const targets = new Map(previous.enemies.map((enemy) => [enemy.id, enemy]));
      for (const enemy of current.enemies) {
        // A wave-start command can spawn targets before its first attack in this tick.
        if (
          previous.waveNumber !== current.waveNumber &&
          !targets.has(enemy.id) &&
          enemy.progress > 0
        ) {
          targets.set(enemy.id, { ...enemy, hp: enemy.maxHp, to: enemy.from, progress: 0 });
        }
      }
      for (const { event } of shots) {
        if (!targets.has(event.target.id)) targets.set(event.target.id, event.target);
      }
      for (const event of events) {
        if (event.type !== 'killed' || targets.has(event.enemyId)) continue;
        // A splash victim can spawn and die without ever appearing in a snapshot or as a primary target.
        const maxHp = current.enemyRules[event.enemyKind]?.maxHp ?? 1;
        targets.set(event.enemyId, {
          id: event.enemyId,
          kind: event.enemyKind,
          from: current.level.spawn,
          to: current.level.spawn,
          progress: 0,
          maxHp,
          hp: maxHp,
        });
      }
      for (const [shot, { event, index }] of shots.entries()) {
        const tower = current.towers.find(({ cell }) => cell === event.towerCell);
        const details = queryTower(current, event.towerCell);
        if (tower === undefined || details === null) continue;
        const kind = tower.kind === 'splash' || tower.kind === 'sniper' ? tower.kind : 'basic';
        const kills = events
          .slice(index + 1, shots[shot + 1]?.index)
          .filter((entry) => entry.type === 'killed');
        for (const killed of kills) {
          const enemy = targets.get(killed.enemyId);
          if (enemy !== undefined) enemies.hold(enemy, previous);
        }
        const affected = new Set<EnemyId>([
          event.target.id,
          ...kills.map(({ enemyId }) => enemyId),
        ]);
        const center = enemyPosition(previous, event.target);
        if (event.splashRadius !== undefined) {
          for (const enemy of targets.values()) {
            const point = enemyPosition(previous, enemy);
            if (Math.hypot(center.x - point.x, center.y - point.y) <= event.splashRadius)
              affected.add(enemy.id);
          }
        }
        const from = cellPoint(current.level, tower.cell);
        const origin = new Vector3(from.x, tower.layer * LAYER_HEIGHT + towerHeight(kind), from.y);
        const endpoint = enemies.impactPosition(previous, event.target, new Vector3());
        let arrival = gameMs + Math.max(92, origin.distanceTo(endpoint) / PROJECTILES[kind].speed);
        for (const id of affected)
          arrival = Math.max(arrival, (scheduled.get(id) ?? -Infinity) + IMPACT_GAP_MS);
        for (const id of affected) {
          scheduled.set(id, arrival);
          const target = targets.get(id);
          if (target !== undefined && !displayHp.has(id)) displayHp.set(id, target.hp);
        }
        for (const { enemyId } of kills) targets.delete(enemyId);
        const model = projectile(kind);
        model.position.copy(origin);
        flights.add({
          kind,
          target: event.target.id,
          affected: [...affected],
          damage: details.damage,
          kills,
          origin,
          endpoint,
          model,
          splashRadius: event.splashRadius,
          state: current,
          start: gameMs,
          arrival,
        });
      }
    }
    if (events.some(({ type }) => type === 'leaked')) {
      leakAt = gameMs;
      leakPreset = PRESETS[variant];
      tone('sniper', leakPreset.gain, true);
    }
  }

  function hit(
    flight: Flight,
    at: number,
    wallMs: number,
    variant: HitVariant,
    reducedMotion: boolean,
  ): void {
    const preset = PRESETS[variant];
    const heavy = flight.kind === 'sniper' || flight.kills.length > 0;
    const strength = variant === 'B' && !heavy ? 0.24 : 1;
    const direction = flight.endpoint.clone().sub(flight.origin).setY(0).normalize();
    const pause = reducedMotion || (variant === 'B' && !heavy) ? 0 : preset.pause;
    if (variant === 'C') freezeUntil = Math.max(freezeUntil, wallMs + pause);
    if (variant === 'C' || (variant === 'B' && flight.kills.length > 0)) {
      shakeAt = wallMs;
      shakeStrength = preset.shake * (heavy ? 1 : 0.42);
    }
    tone(flight.kind, preset.gain, flight.kills.length > 0);
    presentedKills += flight.kills.length;
    for (const id of flight.affected) {
      const death = flight.kills.some(({ enemyId }) => enemyId === id);
      const hp = displayHp.get(id);
      if (death) displayHp.set(id, 0);
      else if (!scheduled.has(id)) displayHp.delete(id);
      else if (hp !== undefined) displayHp.set(id, Math.max(0, hp - flight.damage));
      reactions.set(id, { at, direction, strength, freezeUntil: wallMs + pause, death, preset });
    }
    for (const kill of flight.kills) {
      const point = enemies.targetPosition(kill.enemyId, new Vector3()) ?? flight.endpoint;
      const color = variant === 'C' ? 0xffe2a5 : enemyGlowColor(kill.enemyKind);
      let material = shardMaterials.get(color);
      if (material === undefined) {
        material = new MeshBasicMaterial({ color });
        shardMaterials.set(color, material);
      }
      for (let index = 0; index < preset.shards && shards.size < MAX_SHARDS; index++) {
        const mesh = new Mesh(shardGeometry, material);
        group.add(mesh);
        shards.add({
          mesh,
          point,
          angle: (index / preset.shards) * Math.PI * 2 + kill.enemyId,
          speed: 0.6 + 0.4 * ((index % 3) / 2),
          at,
          preset,
        });
      }
      if (kill.bounty !== 0) {
        const nearby = [...bounties].filter(
          ({ at: other, position }) => other === at && position.distanceToSquared(point) < 0.25,
        ).length;
        const slot = Math.ceil(nearby / 2) * (nearby % 2 === 0 ? 1 : -1);
        bounties.add({
          id: kill.enemyId,
          text: `+${kill.bounty}`,
          position: point.clone(),
          horizontalOffset: slot * 28,
          at,
        });
      }
    }
    if (flight.splashRadius) {
      const mesh = new Mesh(
        ringGeometry,
        new MeshBasicMaterial({
          color: PROJECTILES.splash.color,
          transparent: true,
          depthWrite: false,
        }),
      );
      const { x, z } = flight.endpoint;
      mesh.position.set(x, groundHeight(flight.state.level, { x, y: z }) * LAYER_HEIGHT + 0.07, z);
      group.add(mesh);
      rings.add({ mesh, at, radius: flight.splashRadius, duration: preset.flashMs + 130 });
    }
  }

  function update(gameMs: number, wallMs: number, variant: HitVariant, reducedMotion: boolean) {
    for (const [id, reaction] of reactions) {
      const elapsed = gameMs - reaction.at;
      if (reaction.death && elapsed >= DEATH_MS) {
        enemies.release(id);
        displayHp.delete(id);
      }
      if (elapsed >= Math.max(DEATH_MS, reaction.preset.flashMs)) reactions.delete(id);
    }
    const blocked = new Set<EnemyId>();
    for (const flight of flights) {
      const target = enemies.targetPosition(flight.target, new Vector3());
      if (target !== undefined) flight.endpoint.copy(target);
      const due =
        gameMs >= flight.arrival &&
        !flight.affected.some(
          (id) => blocked.has(id) || gameMs - (lastImpact.get(id) ?? -Infinity) < IMPACT_GAP_MS,
        );
      if (due) {
        for (const id of flight.affected) {
          if (scheduled.get(id) === flight.arrival) scheduled.delete(id);
          lastImpact.set(id, gameMs);
        }
        hit(flight, gameMs, wallMs, variant, reducedMotion);
        group.remove(flight.model);
        flights.delete(flight);
        continue;
      }
      for (const id of flight.affected) blocked.add(id);
      const progress = Math.min(
        0.96,
        Math.max(0, (gameMs - flight.start) / (flight.arrival - flight.start)),
      );
      const arc = PROJECTILES[flight.kind].arc;
      flight.model.position.copy(flight.origin).lerp(flight.endpoint, progress);
      flight.model.position.y += 4 * arc * progress * (1 - progress);
      const tangent = flight.endpoint.clone().sub(flight.origin);
      tangent.y += 4 * arc * (1 - 2 * progress);
      if (tangent.lengthSq() > 0)
        flight.model.quaternion.setFromUnitVectors(UP, tangent.normalize());
    }
    for (const [id, at] of lastImpact) {
      if (gameMs - at >= IMPACT_GAP_MS) lastImpact.delete(id);
    }
    for (const shard of shards) {
      const { mesh, point, angle, speed, preset, at } = shard;
      const progress = (gameMs - at) / preset.shardMs;
      if (progress >= 1) {
        group.remove(mesh);
        shards.delete(shard);
        continue;
      }
      const scatter = (0.05 + preset.scatter * progress) * speed;
      mesh.position.set(
        point.x + Math.cos(angle) * scatter,
        point.y + progress * (1.9 - 2.6 * progress),
        point.z + Math.sin(angle) * scatter,
      );
      mesh.rotation.set(angle + progress * 6, progress * 7, angle - progress * 4);
      mesh.scale.setScalar(speed * (1 - progress * progress));
    }
    for (const ring of rings) {
      const { mesh, radius, duration, at } = ring;
      const progress = (gameMs - at) / duration;
      if (progress >= 1) {
        ring.mesh.material.dispose();
        rings.delete(ring);
        group.remove(mesh);
        continue;
      }
      mesh.scale.set(radius * (0.28 + 0.72 * progress), 1, radius * (0.28 + 0.72 * progress));
      mesh.material.opacity = (1 - progress) * (variant === 'A' ? 0.36 : 0.73);
    }

    const leak = Math.max(0, 1 - (gameMs - leakAt) / leakPreset.leakMs);
    const elapsed = wallMs - shakeAt;
    const strikeShake = shakeStrength * Math.max(0, 1 - elapsed / 175) ** 2;
    const amplitude = reducedMotion ? 0 : Math.max(leak * leakPreset.shake, strikeShake);
    const shake = new Vector2(Math.cos(wallMs * 0.079), Math.sin(wallMs * 0.11)).multiplyScalar(
      amplitude,
    );
    return {
      shake,
      presentedKills,
      castleFlash: leak * leakPreset.leak,
      lifePulse: leak * leakPreset.leak * 0.38,
      hitFlash: (id: EnemyId) => {
        const reaction = reactions.get(id);
        return reaction === undefined
          ? 0
          : reaction.preset.flash *
              Math.max(0, 1 - (gameMs - reaction.at) / reaction.preset.flashMs);
      },
      reaction: (id: EnemyId) => {
        const reaction = reactions.get(id);
        const age = reaction === undefined ? 0 : gameMs - reaction.at;
        const recoil =
          reaction === undefined || reducedMotion
            ? new Vector3()
            : reaction.direction
                .clone()
                .multiplyScalar(
                  reaction.preset.recoil * reaction.strength * Math.max(0, 1 - age / 174) ** 2,
                );
        return {
          recoil,
          hp: displayHp.get(id),
          scale: reaction?.death ? Math.max(0.05, 1 - (age / DEATH_MS) ** 2) : 1,
          freeze:
            !reducedMotion && wallMs < Math.max(freezeUntil, reaction?.freezeUntil ?? -Infinity),
        };
      },
      bounties: [...bounties].flatMap((bounty) => {
        const progress = (gameMs - bounty.at) / 690;
        if (progress >= 1) {
          bounties.delete(bounty);
          return [];
        }
        const position = bounty.position.clone();
        position.y += 0.55 + progress;
        return [{ ...bounty, position, opacity: 1 - progress * progress }];
      }),
    };
  }

  function reset(): void {
    for (const [oscillator, volume] of voices) {
      oscillator.stop();
      volume.disconnect();
    }
    voices.clear();
    for (const ring of rings) ring.mesh.material.dispose();
    group.clear();
    flights.clear();
    scheduled.clear();
    displayHp.clear();
    lastImpact.clear();
    reactions.clear();
    shards.clear();
    rings.clear();
    bounties.clear();
    presentedKills = 0;
    leakAt = shakeAt = freezeUntil = -Infinity;
  }

  return { group, onEvents, update, unlockAudio, reset };
}
