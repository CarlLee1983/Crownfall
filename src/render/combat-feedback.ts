import { BoxGeometry, Group, Mesh, MeshLambertMaterial, Vector2, Vector3 } from 'three';
import type { EnemyId, GameEvent, GameState } from '../core';
import { type EnemyLayer, enemyGlowColor } from './enemies';
import { WORLD_LAYER } from './layers';

const HIT_FLASH_MS = 100;
const HIT_FLASH_GAP_MS = 50;
const HIT_FLASH_STRENGTH = 0.5;
const LEAK_FLASH_MS = 300;
const LEAK_SHAKE_MS = 190;
const FRAGMENT_MS = 480;
const FRAGMENTS_PER_KILL = 6;
const MAX_FRAGMENTS = 48;
const BOUNTY_MS = 720;
const BOUNTY_HEIGHT = 0.55;

export function createCombatFeedback(
  enemies: Pick<EnemyLayer, 'impactPosition' | 'spawnPosition' | 'targetPosition'>,
) {
  const group = new Group();
  const geometry = new BoxGeometry(0.14, 0.14, 0.14);
  const materials = new Map<number, MeshLambertMaterial>();
  const fragments = new Set<{
    readonly mesh: Mesh;
    readonly origin: Vector3;
    readonly heading: number;
    readonly start: number;
  }>();
  const hits = new Map<EnemyId, { start?: number; drewOriginalColor: boolean }>();
  let leakStart = -Infinity;
  const bounties = new Set<{
    readonly id: EnemyId;
    readonly text: string;
    readonly position: Vector3;
    readonly horizontalOffset: number;
    readonly start: number;
  }>();

  function removeExpiredFragments(gameTime: number): void {
    for (const fragment of fragments) {
      if (gameTime - fragment.start < FRAGMENT_MS) continue;
      group.remove(fragment.mesh);
      fragments.delete(fragment);
    }
  }

  function shatter(kind: string, id: EnemyId, origin: Vector3, start: number): void {
    removeExpiredFragments(start);
    if (fragments.size + FRAGMENTS_PER_KILL > MAX_FRAGMENTS) return;
    const color = enemyGlowColor(kind);
    let material = materials.get(color);
    if (material === undefined) {
      material = new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.45 });
      materials.set(color, material);
    }
    for (let index = 0; index < FRAGMENTS_PER_KILL; index++) {
      const mesh = new Mesh(geometry, material);
      mesh.layers.set(WORLD_LAYER);
      group.add(mesh);
      fragments.add({ mesh, origin, heading: ((index + id * 0.37) * Math.PI) / 3, start });
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
      if (event.bounty !== 0) {
        const nearby = [...bounties].filter(
          (bounty) =>
            bounty.start === gameTime && bounty.position.distanceToSquared(position) < 0.25,
        ).length;
        const slot = Math.ceil(nearby / 2) * (nearby % 2 === 0 ? 1 : -1);
        bounties.add({
          id: event.enemyId,
          text: `+${event.bounty}`,
          position,
          horizontalOffset: slot * 28,
          start: gameTime,
        });
      }
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
    const sinceLeak = gameTime - leakStart;
    const leak = Math.max(0, 1 - sinceLeak / LEAK_FLASH_MS);
    const shake = new Vector2();
    if (!reducedMotion && sinceLeak < LEAK_SHAKE_MS) {
      const strength = (1 - sinceLeak / LEAK_SHAKE_MS) * 0.095;
      shake.set(Math.cos(sinceLeak * 0.082) * strength, Math.sin(sinceLeak * 0.107) * strength);
    }
    removeExpiredFragments(gameTime);
    for (const { mesh, origin, heading, start } of fragments) {
      const progress = (gameTime - start) / FRAGMENT_MS;
      const distance = 0.12 + 0.62 * progress;
      mesh.position.set(
        origin.x + Math.cos(heading) * distance,
        origin.y + progress * (1.7 - 2.3 * progress),
        origin.z + Math.sin(heading) * distance,
      );
      mesh.rotation.set(heading + 3 * progress, 6 * progress, 3 * progress);
      mesh.scale.setScalar(1 - progress * progress);
    }
    return {
      hitFlash: (id: EnemyId) => {
        const start = hits.get(id)?.start;
        return start === undefined
          ? 0
          : HIT_FLASH_STRENGTH * Math.max(0, 1 - (gameTime - start) / HIT_FLASH_MS);
      },
      castleFlash: leak,
      lifePulse: leak * 0.38,
      shake,
      bounties: [...bounties].flatMap((bounty) => {
        const { id, text, position, horizontalOffset, start } = bounty;
        const progress = (gameTime - start) / BOUNTY_MS;
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
    leakStart = -Infinity;
  }

  return { group, onEvents, update, reset };
}
