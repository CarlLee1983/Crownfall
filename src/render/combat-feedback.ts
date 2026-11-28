import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { EnemyId, GameEvent, GameState, ShotImpact } from '../core';
import { type EnemyLayer, enemyGlowColor } from './enemies';
import { WORLD_LAYER } from './layers';

const HIT_FLASH_MS = 100;
const HIT_FLASH_GAP_MS = 50;
const HIT_FLASH_STRENGTH = 0.5;
const LEAK_FLASH_MS = 220;
const LEAK_FLASH_STRENGTH = 0.45;
const LEAK_SHAKE_STRENGTH = 0.025;
const FRAGMENT_MS = 480;
const FRAGMENTS_PER_KILL = 6;
const MAX_FRAGMENTS = 48;
const BOUNTY_MS = 720;
const BOUNTY_HEIGHT = 0.55;
const PRESET_A_FLASH_MS = 72;
const PRESET_A_FLASH_STRENGTH = 0.36;
const PRESET_A_RECOIL = 0.035;
const RECOIL_MS = 174;
const DEATH_MS = 85;
const PRESET_A_SHARDS = 3;
const PRESET_A_SHARD_MS = 230;
const PRESET_A_SCATTER = 0.34;

export function createCombatFeedback(
  enemies: Pick<EnemyLayer, 'impactPosition' | 'spawnPosition' | 'targetPosition' | 'release'>,
) {
  const group = new Group();
  const geometry = new BoxGeometry(0.14, 0.14, 0.14);
  const presetAShardGeometry = new OctahedronGeometry(0.09);
  const materials = new Map<number, MeshLambertMaterial>();
  const presetAShardMaterials = new Map<number, MeshBasicMaterial>();
  const fragments = new Set<{
    readonly mesh: Mesh;
    readonly origin: Vector3;
    readonly heading: number;
    readonly usesPresetA: boolean;
    readonly speed: number;
    readonly start: number;
  }>();
  const hits = new Map<EnemyId, { start?: number; drewOriginalColor: boolean }>();
  const reactions = new Map<
    EnemyId,
    {
      readonly start: number;
      readonly direction: Vector3;
      readonly death: boolean;
      readonly usesPresetA: boolean;
    }
  >();
  let leakStart = -Infinity;
  const bounties = new Set<{
    readonly id: EnemyId;
    readonly text: string;
    readonly position: Vector3;
    readonly horizontalOffset: number;
    readonly start: number;
    readonly duration: number;
  }>();

  function removeExpiredFragments(gameTime: number): void {
    for (const fragment of fragments) {
      if (gameTime - fragment.start < (fragment.usesPresetA ? PRESET_A_SHARD_MS : FRAGMENT_MS))
        continue;
      group.remove(fragment.mesh);
      fragments.delete(fragment);
    }
  }

  function shatter(
    kind: string,
    id: EnemyId,
    origin: Vector3,
    start: number,
    usesPresetA = false,
  ): void {
    removeExpiredFragments(start);
    const count = usesPresetA ? PRESET_A_SHARDS : FRAGMENTS_PER_KILL;
    if (!usesPresetA && fragments.size + count > MAX_FRAGMENTS) return;
    const color = enemyGlowColor(kind);
    const palette = usesPresetA ? presetAShardMaterials : materials;
    let material = palette.get(color);
    if (material === undefined) {
      if (usesPresetA) {
        material = new MeshBasicMaterial({ color });
        presetAShardMaterials.set(color, material);
      } else {
        material = new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.45 });
        materials.set(color, material);
      }
    }
    for (let index = 0; index < count; index++) {
      const mesh = new Mesh(usesPresetA ? presetAShardGeometry : geometry, material);
      mesh.layers.set(WORLD_LAYER);
      group.add(mesh);
      const heading = usesPresetA
        ? (index / count) * Math.PI * 2 + id
        : ((index + id * 0.37) * Math.PI) / 3;
      fragments.add({ mesh, origin, heading, usesPresetA, speed: 0.6 + 0.4 * (index / 2), start });
    }
  }

  function bountyAt(
    id: EnemyId,
    bounty: number,
    position: Vector3,
    start: number,
    duration = BOUNTY_MS,
  ): void {
    if (bounty === 0) return;
    const nearby = [...bounties].filter(
      (other) => other.start === start && other.position.distanceToSquared(position) < 0.25,
    ).length;
    const slot = Math.ceil(nearby / 2) * (nearby % 2 === 0 ? 1 : -1);
    bounties.add({
      id,
      text: `+${bounty}`,
      position,
      horizontalOffset: slot * 28,
      start,
      duration,
    });
  }

  function onImpact(
    { target, bounty }: ShotImpact,
    towerKind: string,
    position: Vector3,
    direction: Vector3,
    gameTime: number,
  ): void {
    const usesPresetA = towerKind === 'basic' || towerKind === 'sniper' || towerKind === 'splash';
    hits.delete(target.id);
    reactions.set(target.id, {
      start: gameTime,
      direction,
      death: bounty !== undefined,
      usesPresetA,
    });
    if (bounty !== undefined) {
      shatter(target.kind, target.id, position, gameTime, usesPresetA);
      bountyAt(target.id, bounty, position, gameTime, usesPresetA ? 690 : BOUNTY_MS);
    }
  }

  function onEvents(events: readonly GameEvent[], previous: GameState, gameTime: number): void {
    if (events.some(({ type }) => type === 'leaked')) leakStart = gameTime;
    for (const event of events) {
      if (event.type === 'shot') {
        const id = event.target.id;
        const hit = hits.get(id);
        // Catch-up ticks alone cannot satisfy the visible gap between pulses.
        if (
          hit === undefined ||
          (hit.drewOriginalColor &&
            hit.start !== undefined &&
            gameTime - hit.start >= HIT_FLASH_MS + HIT_FLASH_GAP_MS)
        ) {
          hits.set(id, { drewOriginalColor: false });
        }
      }
      if (event.type !== 'killed') continue;
      hits.delete(event.enemyId);
      const position = new Vector3();
      if (enemies.targetPosition(event.enemyId, position) === undefined) {
        const enemy = previous.enemies.find(({ id }) => id === event.enemyId);
        if (enemy === undefined) {
          // 開波指令可以在同一 tick 生成敵人並讓塔在入口擊殺牠們。
          enemies.spawnPosition(previous, event.enemyKind, position);
        } else {
          enemies.impactPosition(previous, enemy, position);
        }
      }
      shatter(event.enemyKind, event.enemyId, position, gameTime);
      bountyAt(event.enemyId, event.bounty, position, gameTime);
    }
  }

  function update(gameTime: number, reducedMotion: boolean) {
    for (const [id, hit] of hits) {
      // Start on the first draw. A catch-up batch can otherwise skip the entire pulse.
      hit.start ??= gameTime;
      const elapsed = gameTime - hit.start;
      if (elapsed >= HIT_FLASH_MS + HIT_FLASH_GAP_MS) hits.delete(id);
      else if (elapsed >= HIT_FLASH_MS) hit.drewOriginalColor = true;
    }
    for (const [id, reaction] of reactions) {
      const age = gameTime - reaction.start;
      if (reaction.death && age >= DEATH_MS) {
        enemies.release(id);
        reactions.delete(id);
      } else if (age >= (reaction.usesPresetA ? RECOIL_MS : HIT_FLASH_MS)) {
        reactions.delete(id);
      }
    }
    const sinceLeak = gameTime - leakStart;
    const leak = Math.max(0, 1 - sinceLeak / LEAK_FLASH_MS);
    const shake = new Vector2();
    if (!reducedMotion && leak > 0) {
      const strength = leak * LEAK_SHAKE_STRENGTH;
      shake.set(Math.cos(sinceLeak * 0.079) * strength, Math.sin(sinceLeak * 0.11) * strength);
    }
    const castleFlash = leak * LEAK_FLASH_STRENGTH;
    removeExpiredFragments(gameTime);
    for (const { mesh, origin, heading, usesPresetA, speed, start } of fragments) {
      const progress = (gameTime - start) / (usesPresetA ? PRESET_A_SHARD_MS : FRAGMENT_MS);
      const distance = usesPresetA
        ? (0.05 + PRESET_A_SCATTER * progress) * speed
        : 0.12 + 0.62 * progress;
      mesh.position.set(
        origin.x + Math.cos(heading) * distance,
        origin.y + progress * (usesPresetA ? 1.9 - 2.6 * progress : 1.7 - 2.3 * progress),
        origin.z + Math.sin(heading) * distance,
      );
      if (usesPresetA)
        mesh.rotation.set(heading + 6 * progress, 7 * progress, heading - 4 * progress);
      else mesh.rotation.set(heading + 3 * progress, 6 * progress, 3 * progress);
      mesh.scale.setScalar((usesPresetA ? speed : 1) * (1 - progress * progress));
    }
    return {
      hitFlash: (id: EnemyId) => {
        const reaction = reactions.get(id);
        if (reaction !== undefined) {
          const duration = reaction.usesPresetA ? PRESET_A_FLASH_MS : HIT_FLASH_MS;
          const strength = reaction.usesPresetA ? PRESET_A_FLASH_STRENGTH : HIT_FLASH_STRENGTH;
          return strength * Math.max(0, 1 - (gameTime - reaction.start) / duration);
        }
        const start = hits.get(id)?.start;
        return start === undefined
          ? 0
          : HIT_FLASH_STRENGTH * Math.max(0, 1 - (gameTime - start) / HIT_FLASH_MS);
      },
      reaction: (id: EnemyId) => {
        const reaction = reactions.get(id);
        if (reaction === undefined) return undefined;
        const age = gameTime - reaction.start;
        const recoil = reaction.direction
          .clone()
          .multiplyScalar(
            reaction.usesPresetA && !reducedMotion
              ? PRESET_A_RECOIL * Math.max(0, 1 - age / RECOIL_MS) ** 2
              : 0,
          );
        const scale = reaction.death ? Math.max(0.05, 1 - (age / DEATH_MS) ** 2) : 1;
        return { recoil, scale, ...(reaction.death ? { hp: 0 } : {}) };
      },
      castleFlash,
      lifePulse: castleFlash * 0.38,
      shake,
      bounties: [...bounties].flatMap((bounty) => {
        const { id, text, position, horizontalOffset, start, duration } = bounty;
        const progress = (gameTime - start) / duration;
        if (progress >= 1) {
          bounties.delete(bounty);
          return [];
        }
        const point = position.clone();
        point.y += BOUNTY_HEIGHT + progress;
        return [
          {
            id,
            text,
            position: point,
            horizontalOffset: horizontalOffset * Math.min(1, (gameTime - start) / 80),
            opacity: 1 - progress * progress,
          },
        ];
      }),
    };
  }

  function reset(): void {
    fragments.clear();
    bounties.clear();
    group.clear();
    hits.clear();
    reactions.clear();
    leakStart = -Infinity;
  }

  return { group, onEvents, onImpact, update, reset };
}
