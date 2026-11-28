import { Vector2, Vector3 } from 'three';
import type { EnemyId, GameEvent, GameState, ShotImpact } from '../core';
import type { EnemyLayer } from './enemies';

const HIT_FLASH_MS = 100;
const HIT_FLASH_GAP_MS = 50;
const HIT_FLASH_STRENGTH = 0.5;
const LEAK_FLASH_MS = 220;
const LEAK_FLASH_STRENGTH = 0.45;
const LEAK_SHAKE_STRENGTH = 0.025;
const BOUNTY_MS = 720;
const BOUNTY_HEIGHT = 0.55;
const PRESET_A_FLASH_MS = 72;
const PRESET_A_FLASH_GAP_MS = 16;
const PRESET_A_FLASH_STRENGTH = 0.36;
const PRESET_A_RECOIL = 0.035;
const RECOIL_MS = 174;
const SINK_MS = 300;

interface Hit {
  readonly duration: number;
  readonly gap: number;
  readonly strength: number;
  start?: number;
  drewOriginalColor: boolean;
}

export function createCombatFeedback(
  enemies: Pick<
    EnemyLayer,
    'impactPosition' | 'spawnPosition' | 'targetPosition' | 'hold' | 'release' | 'deathDurationMs'
  >,
) {
  const hits = new Map<EnemyId, Hit>();
  const reactions = new Map<
    EnemyId,
    {
      readonly start: number;
      readonly direction: Vector3;
      readonly collapseMs?: number;
      readonly usesPresetA: boolean;
      readonly releaseAfterMs?: number;
      readonly hp?: number;
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

  function canPresentImpact(id: EnemyId, gameTime: number): boolean {
    const hit = hits.get(id);
    return (
      hit === undefined ||
      (hit.drewOriginalColor &&
        hit.start !== undefined &&
        gameTime - hit.start >= hit.duration + hit.gap)
    );
  }

  function onImpact(
    { target, bounty, hp }: ShotImpact,
    towerKind: string,
    position: Vector3,
    direction: Vector3,
    gameTime: number,
    finalHitOnLeakedEnemy: boolean,
  ): void {
    const usesPresetA = towerKind === 'basic' || towerKind === 'sniper' || towerKind === 'splash';
    const duration = usesPresetA ? PRESET_A_FLASH_MS : HIT_FLASH_MS;
    hits.set(target.id, {
      duration,
      gap: usesPresetA ? PRESET_A_FLASH_GAP_MS : HIT_FLASH_GAP_MS,
      strength: usesPresetA ? PRESET_A_FLASH_STRENGTH : HIT_FLASH_STRENGTH,
      start: gameTime,
      drewOriginalColor: false,
    });
    if (bounty !== undefined) {
      const collapseMs = enemies.deathDurationMs(target.kind);
      reactions.set(target.id, {
        start: gameTime,
        direction,
        usesPresetA,
        collapseMs,
        releaseAfterMs: collapseMs + SINK_MS,
        hp,
      });
      bountyAt(target.id, bounty, position, gameTime, usesPresetA ? 690 : BOUNTY_MS);
      return;
    }
    reactions.set(target.id, {
      start: gameTime,
      direction,
      usesPresetA,
      ...(finalHitOnLeakedEnemy ? { releaseAfterMs: duration, hp } : {}),
    });
  }

  function onEvents(events: readonly GameEvent[], previous: GameState, gameTime: number): void {
    if (events.some(({ type }) => type === 'leaked')) leakStart = gameTime;
    for (const event of events) {
      if (event.type === 'shot') {
        const id = event.target.id;
        // Catch-up ticks alone cannot satisfy the visible gap between pulses.
        if (canPresentImpact(id, gameTime)) {
          hits.set(id, {
            duration: HIT_FLASH_MS,
            gap: HIT_FLASH_GAP_MS,
            strength: HIT_FLASH_STRENGTH,
            drewOriginalColor: false,
          });
        }
      }
      if (event.type !== 'killed') continue;
      const { enemyId, enemyKind, bounty } = event;
      const enemy =
        previous.enemies.find(({ id }) => id === enemyId) ??
        events
          .flatMap((candidate) => (candidate.type === 'shot' ? candidate.impacts : []))
          .find(({ target }) => target.id === enemyId)?.target;
      const position = new Vector3();
      if (enemies.targetPosition(enemyId, position) === undefined) {
        if (enemy === undefined) enemies.spawnPosition(previous, enemyKind, position);
        else enemies.impactPosition(previous, enemy, position);
      }
      if (enemy !== undefined) {
        enemies.hold(enemy, previous);
        onImpact({ target: enemy, bounty, hp: 0 }, '', position, new Vector3(), gameTime, false);
      } else {
        bountyAt(enemyId, bounty, position, gameTime);
      }
    }
  }

  function update(gameTime: number, reducedMotion: boolean) {
    for (const [id, hit] of hits) {
      // Start on the first draw. A catch-up batch can otherwise skip the entire pulse.
      hit.start ??= gameTime;
      const elapsed = gameTime - hit.start;
      if (elapsed >= hit.duration + hit.gap) hits.delete(id);
      else if (elapsed >= hit.duration) hit.drewOriginalColor = true;
    }
    let hasHeldReaction = false;
    for (const [id, reaction] of reactions) {
      const age = gameTime - reaction.start;
      if (reaction.releaseAfterMs !== undefined && age >= reaction.releaseAfterMs) {
        enemies.release(id);
        reactions.delete(id);
      } else if (reaction.releaseAfterMs !== undefined) {
        hasHeldReaction = true;
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
    return {
      hitFlash: (id: EnemyId) => {
        const hit = hits.get(id);
        return hit?.start === undefined
          ? 0
          : hit.strength * Math.max(0, 1 - (gameTime - hit.start) / hit.duration);
      },
      reaction: (id: EnemyId) => {
        const reaction = reactions.get(id);
        if (reaction === undefined) return undefined;
        const age = gameTime - reaction.start;
        const { collapseMs, hp } = reaction;
        if (collapseMs !== undefined) {
          return {
            recoil: new Vector3(),
            hp: 0,
            deathAgeMs: age,
            sink: Math.max(0, (age - collapseMs) / SINK_MS),
          };
        }
        const recoil = reaction.direction
          .clone()
          .multiplyScalar(
            reaction.usesPresetA && !reducedMotion
              ? PRESET_A_RECOIL * Math.max(0, 1 - age / RECOIL_MS) ** 2
              : 0,
          );
        return { recoil, ...(hp === undefined ? {} : { hp }) };
      },
      settling: leak > 0 || hasHeldReaction,
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
    bounties.clear();
    hits.clear();
    reactions.clear();
    leakStart = -Infinity;
  }

  return { onEvents, onImpact, canPresentImpact, update, reset };
}
